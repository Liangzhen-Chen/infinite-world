import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,prepareNation,noble,office,DAY,county,village} from './helpers/u16.mjs';
import {nationReadiness,recognizeIndependence,foundNation,nationAction,advanceNations,defectFromNation} from '../server-plugin/nation-founding.mjs';
import {nationAt,rulerNation} from '../server-plugin/noble-state.mjs';
import {armyKey,armyStrength,partyCoins,partyPay,createArmy} from '../server-plugin/military.mjs';
import {groupAccountView} from '../server-plugin/group-account.mjs';
import {organizationState} from '../server-plugin/organization-state.mjs';
import {warAction,endWar,campaignRound} from '../server-plugin/war-diplomacy.mjs';
import {adjustStanding} from '../server-plugin/standing.mjs';
import {legalCodeAt,courtHierarchy,legalCooperation} from '../server-plugin/law-codes.mjs';
import {tradeTax,assessTradeTax} from '../server-plugin/finance-tax.mjs';
import {toolDefinitions} from '../extension/tools.mjs';
import {applyPatches,digest} from '../server-plugin/storage.mjs';
import {holdingSet} from '../server-plugin/holding-sources.mjs';
const recognize=(e,d,factions,who='player')=>{for(const f of factions){if(who==='player')warAction.call(e,d,{operation:'diplomacy',choice:'recognize',org:who,member:f},`recognize_${f}`);else d.set(['state','records',`recognition:${who}:${f}`],{category:'diplomacy',status:'承认独立',subject:who,recognizer:f,parties:[who,f],minute:d.get('state','minute')});}};
function ready(){const {e,d}=setup(),factions=prepareNation(e,d);recognize(e,d,factions);return {e,d,factions};}
const found=(e,d,id='found')=>nationAction.call(e,d,{operation:'nation',choice:'found',name:'垄渠新国',settlement:village,coins:25000},id).nation;

test('建国逐项读取领地、实际人口、军力、财产与外部承认；结盟不代替承认',()=>{
 const {e,d}=setup(),factions=prepareNation(e,d);
 assert.match(nationReadiness(e,d.get('state')).reasons.join(),/承认/);
 d.set(['state','records','fake_alliance'],{category:'diplomacy',status:'结盟',parties:['player',factions[0]]});assert.equal(nationReadiness(e,d.get('state')).recognized.length,0);
 recognize(e,d,factions);assert.equal(nationReadiness(e,d.get('state')).ready,true);
 for(const [path,value,pattern]of [
  [['state','player','coins'],0,/财政/],
  [['state','settlements','loc_bs_yupo','population'],0,/人口/],
  [['state','records',armyKey('army_u16_private'),'regular'],0,/军力/]
 ]){const before=d.document;d.set(path,value);assert.match(nationReadiness(e,d.get('state')).reasons.join(),pattern);assert.throws(()=>found(e,d),pattern);d.document=before;}
});
test('宣布独立真实转入V4公库并接入法律、税率与U12军队，没有复制财产或兵力',()=>{
 const {e,d}=ready(),coins=d.get('state','player','coins'),strength=armyStrength(d.get('state','records',armyKey('army_u16_private'))),n=found(e,d);
 assert.equal(coins,d.get('state','player','coins')+groupAccountView(e,d.get('state'),n.id).coins);
 assert.equal(groupAccountView(e,d.get('state'),n.id).coins,25000);assert.equal(organizationState(e,d.get('state'),n.id).treasury,25000);
 assert.equal(d.get('state','records',armyKey('army_u16_private'),'party'),n.id);assert.equal(armyStrength(d.get('state','records',armyKey('army_u16_private'))),strength);
 assert.equal(nationAt(e,d.get('state'),village).id,n.id);assert.equal(legalCodeAt(e,village,d.get('state')).nation,n.id);
 assert.ok(courtHierarchy(e,d.get('state'),legalCodeAt(e,village,d.get('state'))).every(c=>c.court!=='loc_capital'));
 nationAction.call(e,d,{operation:'nation',choice:'tax',action:'commercial',taxBps:700},'newtax');assert.equal(tradeTax(e,d.get('state'),village).bps,700);
 const code=legalCodeAt(e,village,d.get('state')),crime=Object.keys(code.penalties)[0];nationAction.call(e,d,{operation:'nation',choice:'law',name:crime,coins:37,minutes:600},'law');
 const amended=legalCodeAt(e,village,d.get('state'));assert.equal(amended.penalties[crime].baseFine,37);assert.equal(amended.penalties[crime].detentionMinutes,600);assert.deepEqual(amended.evidenceRequired,code.evidenceRequired);
 const paid=partyPay(d,e,n.id,123,{sourceEvent:'cost',reason:'军饷'});assert.equal(paid,123);assert.equal(organizationState(e,d.get('state'),n.id).treasury,24877);
 assert.throws(()=>found(e,d,'twice'),/已经/);assert.equal(toolDefinitions().length,27);
});
test('承认来自愿意且独立的外部势力，战争或敌意使现有承认失效',()=>{
 const {e,d,factions}=ready();adjustStanding(d,e,factions[0],'player',-100,{sourceEvent:'hostile',minute:d.get('state','minute')});
 assert.equal(nationReadiness(e,d.get('state')).recognized.length,1);assert.throws(()=>recognizeIndependence(d,e,'player',factions[0],'retry'),/立场/);
 assert.throws(()=>recognizeIndependence(d,e,'player','player','self'),/外部/);
});
test('宗主愿意则承认，中间立场提出可接受的真实贡赋谈判',()=>{
 const a=ready();adjustStanding(a.d,a.e,county,'player',60,{sourceEvent:'support',minute:a.d.get('state','minute')});const accepted=found(a.e,a.d);assert.equal(accepted.reaction,'承认');assert.equal(accepted.status,'独立');
 const b=ready(),n=found(b.e,b.d);assert.equal(n.status,'谈判中');const result=nationAction.call(b.e,b.d,{operation:'nation',choice:'negotiate',consent:true},'accept');assert.equal(result.nation.status,'独立');
 assert.ok(Object.values(b.d.get('state','records')).some(t=>t.category==='tribute'&&t.payer===n.id&&t.payee===county&&t.amount>0));
});
test('宗主宣战使用U12军队、战役轮次与伤亡，独立失败吞并国库和剩余部队',()=>{
 const {e,d}=ready();adjustStanding(d,e,county,'player',-60,{sourceEvent:'hostile',minute:d.get('state','minute')});const n=found(e,d),w=d.get('state','records',`war:${n.war}`);assert.equal(n.reaction,'宣战');assert.equal(w.source,'independence');
 const round=campaignRound(d,e,structuredClone(w),w.nextAt);assert.ok(round.losses);assert.ok(Object.values(round.losses).some(n=>n>0));
 const at=w.nextAt,coins=groupAccountView(e,d.get('state'),n.id).coins,before=partyCoins(e,d.get('state'),county);endWar(d,e,structuredClone(d.get('state','records',`war:${w.id}`)),{winner:county,at,src:'annex'});
 assert.equal(d.get('state','records',`nation:${n.id}`,'status'),'被吞并');assert.equal(groupAccountView(e,d.get('state'),n.id).coins,0);assert.equal(partyCoins(e,d.get('state'),county),before+coins);assert.equal(nationAt(e,d.get('state'),village),null);
});
test('独立战争获胜保留国家；财政人口或承认连续不足可失败，重放不多扣钱',()=>{
 const {e,d}=ready();adjustStanding(d,e,county,'player',-60,{sourceEvent:'hostile',minute:d.get('state','minute')});const n=found(e,d),w=d.get('state','records',`war:${n.war}`);endWar(d,e,structuredClone(w),{winner:n.id,at:d.get('state','minute'),src:'victory'});assert.equal(d.get('state','records',`nation:${n.id}`,'status'),'独立');
 const first=n.nextReview;d.set(['state','records',armyKey('army_u16_private'),'regular'],0);d.set(['state','minute'],first);advanceNations(d,e,{before:first-DAY,after:first});assert.equal(d.get('state','records',`nation:${n.id}`,'breaches'),1);
 const second=first+30*DAY;d.set(['state','minute'],second);advanceNations(d,e,{before:first,after:second});assert.equal(d.get('state','records',`nation:${n.id}`,'status'),'建国失败');const snapshot=digest(d.get('state'));advanceNations(d,e,{before:first,after:second});assert.equal(digest(d.get('state')),snapshot);
});
test('敌对下级分裂后地方税与法典不再归新国，税款只能由真实地方公账上解',()=>{
 const {e,d}=ready(),n=found(e,d),rebel='npc_yp_gaoxin';office(d,rebel,village,{upper:true});adjustStanding(d,e,rebel,'player',-80,{sourceEvent:'split',minute:d.get('state','minute')});
 const before=d.get('state','settlements',village,'treasury');d.set(['state','npcs','npc_yp_shile','coins'],2000);const tax=assessTradeTax(d,e,{seller:'npc_yp_shile',cost:1000,location:village,sourceEvent:'taxable'});
 const at=n.nextReview;d.set(['state','minute'],at);advanceNations(d,e,{before:at-DAY,after:at});assert.equal(d.get('state','settlements',village,'treasury'),before);assert.equal(groupAccountView(e,d.get('state'),n.id).coins,25000+tax.amount);
 // Hostility alone cannot split territory. The sourced official now takes the
 // explicit act of leaving, with an actual local garrison obeying him.
 const org=structuredClone(d.get('state','records',`organization:${n.id}`));org.members[rebel]={position:'主官',joinedAt:at,arrears:0};holdingSet(d,e,['state','records',`organization:${n.id}`],org,'nation-founding');
 createArmy(d,e,{id:'army_local_rebel',name:'地方卫队',party:n.id,leader:rebel,base:village,location:village,supply:'purchase',regular:30,training:50,morale:70,payCopperMonth:0},at,'local-garrison');
 defectFromNation(d,e,{nation:n.id,member:rebel},'local-defection');
 assert.equal(d.get('state','records',`nation:${n.id}`,'status'),'内乱');assert.equal(nationAt(e,d.get('state'),village),null);assert.ok(!legalCodeAt(e,village,d.get('state')).nation);
 const population=nationReadiness(e,d.get('state')).population;assert.equal(population,600+(d.get('state','settlements','loc_bs_liquan','population')??0)+(d.get('state','settlements','loc_bs_sangban','population')??0)+(d.get('state','settlements','loc_hw','population')??0));
 const balance=groupAccountView(e,d.get('state'),n.id).coins;d.set(['state','minute'],at+30*DAY);assessTradeTax(d,e,{seller:'npc_yp_shile',cost:1000,location:village,sourceEvent:'rebel_tax'});advanceNations(d,e,{before:at,after:at+30*DAY});assert.equal(groupAccountView(e,d.get('state'),n.id).coins,balance);assert.equal(d.get('state','records',`nation:${n.id}`,'splits').length,1);
});
test('NPC领主按野心、处境和外部同盟离屏宣布独立，使用同一条件与财产转移',()=>{
 const {e,d}=setup(),who='npc_yp_shile',factions=prepareNation(e,d,who);d.set(['state','npcs',who,'ambition'],80);adjustStanding(d,e,who,county,-80,{sourceEvent:'ambition',minute:d.get('state','minute')});
 for(const f of factions)d.set(['state','records',`diplomacy:${[who,f].sort().join(':')}`],{category:'diplomacy',parties:[who,f],status:'结盟'});
 const at=120*DAY;d.set(['state','minute'],at);advanceNations(d,e,{before:119*DAY,after:at});const n=rulerNation(d.get('state'),who);assert.ok(n);assert.equal(n.ruler,who);assert.equal(d.get('state','npcs',who,'coins'),30000);assert.equal(groupAccountView(e,d.get('state'),n.id).coins,20000);
});
test('公开工具入口可以查询及宣布独立，旧事件重放不引入新建国推进',async()=>{
 const {e,d}=ready(),out=await e.reduce(d.document,{tool:'world_settlement',args:{operation:'nation_inspect'},eventId:'inspect'});assert.ok(out.result.readiness.ready);assert.equal(out.result.sovereigntyVersion,1);
 const result=await e.reduce(d.document,{tool:'world_settlement',args:{operation:'nation',choice:'found',name:'垄渠公国',settlement:village,coins:25000},eventId:'public_found'});const doc=applyPatches(d.document,result.patches);assert.ok(rulerNation(doc.state,'player'));
 e.replaying=true;e.replayResult={};const before=digest(d.get('state'));advanceNations(d,e,{before:100*DAY,after:150*DAY});assert.equal(digest(d.get('state')),before);
});
