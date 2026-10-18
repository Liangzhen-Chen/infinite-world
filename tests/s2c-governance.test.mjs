import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,prepareNation,DAY,county,village,office,source,legacy} from './helpers/u16.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {draft} from './probes/harness.mjs';
import {scenario as officeScenario} from './probes/run-001/e03.mjs';
import {governanceAction,consumeOfficeVacancies,playerOffices,eligible,advanceOffices} from '../server-plugin/governance.mjs';
import {recordEntityDeath} from '../server-plugin/npc-life.mjs';
import {aliveHoldings,ensureHoldings,openHoldings} from '../server-plugin/holdings.mjs';
import {holdingSet,syncHoldingRecord,officeEntity} from '../server-plugin/holding-sources.mjs';
import {grantTitle,stripTitle} from '../server-plugin/titles.mjs';
import {recognizeIndependence,foundNation,defectFromNation,advanceNations,changeTerritoryControl} from '../server-plugin/nation-founding.mjs';
import {createArmy,armyKey} from '../server-plugin/military.mjs';
import {endWar,startWar} from '../server-plugin/war-diplomacy.mjs';
import {nationAt,territoryController} from '../server-plugin/noble-state.mjs';
import {adjustStanding} from '../server-plugin/standing.mjs';
import {legalCodeAt} from '../server-plugin/law-codes.mjs';
import {digest,applyPatches} from '../server-plugin/storage.mjs';
import {groupAccountView} from '../server-plugin/group-account.mjs';
import {advanceOfficeSalaries} from '../server-plugin/office-salary.mjs';
import {holdingsDiscrepancies} from './helpers/holdings-audit.mjs';

import {nationalScenario} from './probes/run-001/e14.mjs';
test('公开授爵和除爵入口实际执行，并保留权限、成年、到场及同意限制',async()=>{
 const {e,d,rebel}=nationalScenario();
 const strip=await e.reduce(d.document,{tool:'world_settlement',args:{operation:'title_strip',member:rebel,reason:'依法重新册封'},eventId:'public-strip'});
 d.document=applyPatches(d.document,strip.patches);assert.equal(d.get('state','records',`title:${rebel}`,'status'),'已除爵');
 const args={operation:'title_grant',name:'伯爵',member:rebel,settlement:county,consent:true};
 await assert.rejects(e.reduce(d.document,{tool:'world_settlement',args:{...args,consent:false},eventId:'public-denied'}),/同意/);
 const grant=await e.reduce(d.document,{tool:'world_settlement',args,eventId:'public-grant'});
 d.document=applyPatches(d.document,grant.patches);assert.equal(d.get('state','records',`title:${rebel}`,'status'),'受封');
 assert.equal(aliveHoldings(d,{kind:'holds_office',holder:rebel,subject:`office_title:title:${rebel}`}).length,1);
});
test('E02-1 死亡发布空缺后按原任免来源补选，离任者停薪；无人过半不假造代理',()=>{
 const {e,d}=setup(),g=e.world.settlementProfiles.find(p=>p.id===village).details.governance,old=g.head,candidate=g.coordinators.find(id=>id!==old);
 const all=eligible(e,village,d.get('state'));
 d.set(['state','records',`civic_citizen:${village}:${candidate}`],{category:'civic_citizen',subject:candidate,settlement:village,status:'已登记'});
 d.set(['state','records','civic_source:s2c-candidate'],{category:'civic_contribution',subject:candidate,settlement:village,points:120,sourceEvent:'s2c-candidate'});
 for(const voter of all)if(voter!==old)d.set(['state','records',`standing:${voter}:${candidate}`],{category:'standing',holder:voter,target:candidate,value:100,history:[]});
 d.set(['holdings'],openHoldings(e,d.document));d.engine=e;recordEntityDeath(d,e,old,d.get('state','minute'),'s2c-head-death');
 const at=d.get('state','minute')+e.rules.elections.campaignDays*DAY;d.set(['state','minute'],at);consumeOfficeVacancies(d,e,at);
 const vacancy=Object.values(d.get('state','records')).find(r=>r.category==='governance_vacancy'&&r.previousHolder===old&&r.settlement===village);
 assert.equal(vacancy.status,'已继任');assert.equal(d.get('state','records',vacancy.appointment,'holder'),candidate);
 assert.equal(aliveHoldings(d,{kind:'holds_office',holder:old,subject:officeEntity(village,'office_village_head')}).length,0);
 assert.equal(aliveHoldings(d,{kind:'holds_office',holder:candidate,subject:officeEntity(village,'office_village_head')}).length,1);
 const state=digest(d.document);consumeOfficeVacancies(d,e,at);assert.equal(digest(d.document),state);
 d.set(['state','records','legal_case:unrelated-player'],{category:'legal_case',offender:'player',judgment:{effect:'fine'}});
 const next=d.get('state','records',vacancy.appointment,'nextReview');d.set(['state','minute'],next);advanceOffices(d,e,{after:next});
 assert.equal(d.get('state','records',vacancy.appointment,'status'),'在任');
 const salaryAt=(Math.floor(next/(30*DAY))+1)*30*DAY;d.set(['state','minute'],salaryAt);advanceOfficeSalaries(d,e,{before:salaryAt-1,after:salaryAt});
 const salaries=Object.values(d.get('state','records')).filter(r=>r.category==='office_salary'&&r.assessedAt===salaryAt&&r.settlement===village);
 assert.ok(!salaries.some(r=>r.holder===old));assert.ok(salaries.some(r=>r.holder===candidate));
});
test('E02-1 无人获得多数时保留空缺，不假造代理人或权限',()=>{
 const {e,d}=setup(),g=e.world.settlementProfiles.find(p=>p.id===village).details.governance;
 d.set(['holdings'],openHoldings(e,d.document));d.engine=e;recordEntityDeath(d,e,g.head,d.get('state','minute'),'s2c-vacant');
 const at=d.get('state','minute')+e.rules.elections.campaignDays*DAY;d.set(['state','minute'],at);consumeOfficeVacancies(d,e,at);
 const row=Object.values(d.get('state','records')).find(r=>r.category==='governance_vacancy'&&r.previousHolder===g.head&&r.settlement===village);
 assert.equal(row.status,'无人过半待补选');assert.equal(row.appointment,null);
});
test('E03 合法任命、设施正反例、实际升格免职与合法下级留任',async()=>{
 const r=await officeScenario();assert.equal(r.conditions.ok,false);assert.equal(r.underConstruction.ok,false);assert.equal(r.damaged.ok,false);
 assert.equal(r.town.player[0].name,'镇长');assert.ok(r.town.player[0].salary>r.village.player[0].salary);
 assert.deepEqual(r.removed.player,[]);assert.ok(r.spendingDenied);assert.ok(r.noNewSalary);assert.ok(r.removed.steward.some(o=>o.name==='镇管事'));
});
test('E14 爵权处分须有授予权，叛离后不经战和不能收回实控；重复叛离不重复移款',()=>{
 const {e,d,n,rebel,people}=nationalScenario(),coins=groupAccountView(e,d.get('state'),n.id).coins;
 assert.throws(()=>stripTitle(d,e,{member:'npc_yp_shile',reason:'越权'},'s2c-denied'),/权限/);
 const out=defectFromNation(d,e,{nation:n.id,member:rebel},'s2c-defect');
 assert.deepEqual(out.followers,[people[0]]);assert.equal(territoryController(e,d.get('state'),village),rebel);
 assert.equal(aliveHoldings(d,{kind:'member_of',holder:people[0],subject:out.retinue}).length,1);
 assert.equal(aliveHoldings(d,{kind:'member_of',holder:people[1],subject:n.id}).length,1);
 assert.equal(aliveHoldings(d,{kind:'member_of',holder:people[2],subject:n.id}).length,1);
 assert.equal(d.get('state','records',`title:${rebel}`,'status'),'受封');
 assert.equal(groupAccountView(e,d.get('state'),n.id).coins,coins);
 const before=digest(d.document);assert.equal(defectFromNation(d,e,{nation:n.id,member:rebel},'s2c-defect-again').duplicate,true);assert.equal(digest(d.document),before);
 stripTitle(d,e,{member:rebel,reason:'叛离裁决'},'s2c-strip');
 assert.equal(d.get('state','records',`title:${rebel}`,'status'),'已除爵');assert.equal(territoryController(e,d.get('state'),village),rebel);
 assert.equal(aliveHoldings(d,{kind:'fief',holder:rebel}).length,0);
 assert.equal(d.get('state','records',`organization:${n.id}`,'members',people[1])?.position,'成员');
 assert.equal(d.get('state','records',`organization:${n.id}`,'members',people[2])?.position,'成员');
});
test('E14 敌意本身不会分裂领土；承认在战争时失效；本国法典不外溢',()=>{
 const {e,d,n,rebel}=nationalScenario();office(d,rebel,village,{upper:true});syncHoldingRecord(d,e,`governance_office:${village}:office_village_head:${rebel}`,{writer:'governance'});
 adjustStanding(d,e,rebel,'player',-80,{sourceEvent:'s2c-hostility'});
 const at=n.nextReview;d.set(['state','minute'],at);advanceNations(d,e,{before:at-DAY,after:at});assert.equal(nationAt(e,d.get('state'),village)?.id,n.id);
 assert.equal(legalCodeAt(e,village,d.get('state')).nation,n.id);assert.ok(!legalCodeAt(e,'loc_capital',d.get('state'))?.nation);
});
test('E14 真实战果转移封域，重复战后结算不会再次接收公库',()=>{
 const {e,d,n,rebel}=nationalScenario();defectFromNation(d,e,{nation:n.id,member:rebel},'s2c-war-defect');
 const war=startWar(d,e,{id:'s2c-reclaim',name:'平叛',aggressor:n.id,defender:rebel,front:village,territory:county,armies:['army_u16_private','army_s2c_rebel']},d.get('state','minute'),'s2c-declare');
 endWar(d,e,structuredClone(war),{winner:n.id,at:d.get('state','minute'),src:'s2c-victory'});
 assert.equal(territoryController(e,d.get('state'),village),n.id);assert.equal(nationAt(e,d.get('state'),village)?.id,n.id);
 const before=digest(d.document);endWar(d,e,structuredClone(war),{winner:n.id,at:d.get('state','minute'),src:'s2c-victory-replay'});assert.equal(digest(d.document),before);
});
test('E14 叛离仅令普通官职空缺，伯爵的canonical爵权须留待君主裁决',()=>{
 const {e,d,n,rebel}=nationalScenario();defectFromNation(d,e,{nation:n.id,member:rebel},'s2c-title-retention');
 assert.equal(aliveHoldings(d,{kind:'holds_office',holder:rebel,subject:`office_title:title:${rebel}`}).length,1);
});
test('E14 分开的法定主权与驻军实控须与共享旧字段适配器完全对账',()=>{
 const {e,d,n,rebel}=nationalScenario(),before=d.document;defectFromNation(d,e,{nation:n.id,member:rebel},'s2c-sovereignty-mirror');
 assert.equal(aliveHoldings(d,{kind:'governs',holder:n.id,subject:county}).length,1);
 assert.equal(aliveHoldings(d,{kind:'controls',holder:rebel,subject:county}).length,1);
 assert.deepEqual(holdingsDiscrepancies(e,before,d.document).filter(row=>row.holding?.includes('sovereignty:')),[]);
});
test('E14 合法接管的废城可作首府，仍须领地爵权、钱粮、驻军与外部承认',()=>{
 const w=structuredClone(source),ruin='loc_s2c_ruined_city';for(const npc of w.npcs){delete npc.schedule;delete npc.tier;}
 w.locations.push({id:ruin,type:'loc',name:'废弃旧城',parent:village,region:county,tags:['ruins']});
 w.rules.law.codes.find(c=>c.locations.includes(village)).locations.push(ruin);
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'s2c-ruins');doc.state.minute=100*DAY+540;doc.state.player.coins=50000;
 const d=draft(doc);d.engine=e;e.airDraft=d;const factions=prepareNation(e,d);
 d.set(['state','records',armyKey('army_u16_private'),'location'],ruin);
 d.set(['holdings'],openHoldings(e,d.document));changeTerritoryControl(d,e,ruin,'player',{src:'s2c-lawful-occupation'});
 assert.throws(()=>foundNation(d,e,{name:'旧城新国',capital:ruin,coins:25000},'s2c-no-recognition'),/承认/);
 for(const f of factions)recognizeIndependence(d,e,'player',f,`s2c-ruins-recognize:${f}`);
 const n=foundNation(d,e,{name:'旧城新国',capital:ruin,coins:25000},'s2c-ruins-found');
 assert.equal(n.capital,ruin);assert.equal(territoryController(e,d.get('state'),ruin),n.id);assert.equal(legalCodeAt(e,ruin,d.get('state')).nation,n.id);
 assert.equal(groupAccountView(e,d.get('state'),n.id).coins,25000);
});
