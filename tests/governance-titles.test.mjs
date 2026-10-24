import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {questPublishingRights} from '../server-plugin/quest-board.mjs';
import {financeTransfer} from '../server-plugin/finance-bank.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
const village='loc_bs_yupo',authority=world.rules.governance.authority,charter=authority.superiors.auth_bs_office_charter;
const registryDays=authority.superiors.auth_capital_title_registry.decisionDays;
const clerk=world.npcs.find(n=>n.workplace?.location===charter.seat&&charter.registrars.occupations.includes(n.occupation)).id;
const xunjue=authority.titles.find(t=>t.name==='勋爵');

function setup(){
 const w=structuredClone(world);for(const n of w.npcs)delete n.schedule;
 const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'titles-test');
 doc.state.location=charter.seat;doc.state.minute=540;doc.state.player.coins=2000;
 Object.assign(doc.state.npcs[clerk],{location:charter.seat,activity:'公署递件'});
 const run=async(c,tool,args,eventId)=>{const out=await engine.reduce(c,{tool,args,eventId});return {document:applyPatches(c,out.patches),result:out.result};};
 const petition=(c,name,extra={},event='petition')=>run(c,'world_settlement',{operation:'title_petition',settlement:village,name,...extra},event);
 const wait=(c,days,event='wait')=>{c=structuredClone(c);c.state.location='loc_bs';return run(c,'world_time',{minutes:days*DAY},event).then(r=>r.document);};
 return {engine,doc,run,petition,wait};
}
// Facts that exist in a campaign: a fugitive the player delivered to court, a village head office held 100 days.
const military=c=>{c.state.records['legal_detention:w1']={category:'legal_detention',subject:'npc_yp_shile',wanted:'legal_wanted:w1',deliveredBy:'player',minute:DAY};};
const headOffice=c=>{c.state.records[`governance_office:${village}:office_village_head:player`]={category:'governance_office',id:`governance_office:${village}:office_village_head:player`,holder:'player',settlement:village,office:'office_village_head',status:'在任',since:c.state.minute-100*DAY,until:c.state.minute+260*DAY,nextReview:c.state.minute+400*DAY,monthlyQuotaD:10,monthlyBudgetCopper:2000,powers:['public_project','quest_publish','housing','tax','steward']};};

test('封爵只凭所附凭据由封册署审定：贡献度不算凭据，男爵以上不受理，须在公署前厅转呈',async()=>{
 const s=setup();
 s.doc.state.records['civic_source:seed']={category:'civic_contribution',sourceEvent:'seed',settlement:village,subject:'player',kind:'donation',points:5000,minute:0};
 await assert.rejects(s.petition(s.doc,'准爵'),/凭据不足/);
 await assert.rejects(s.petition(s.doc,'男爵'),/不受理/);
 await assert.rejects(s.petition(s.doc,'公侯'),/册上没有/);
 const away=structuredClone(s.doc);military(away);away.state.location=village;
 await assert.rejects(s.petition(away,'准爵'),/公署前厅/);
 assert.equal(Object.values(s.doc.state.records).some(r=>r.category==='title'),false);
});

test('准爵按军功凭据在审定日册封，带来身份额度但无封地收入',async()=>{
 const s=setup();military(s.doc);
 let c=(await s.petition(s.doc,'准爵')).document;
 assert.deepEqual(Object.keys(c.state.records['title_petition:petition'].bases),['军功']);
 c=await s.wait(c,registryDays);
 const t=c.state.records['title:player'];assert.equal(t.title,'准爵');assert.equal(t.rank,'三等');assert.equal(t.fief,null);
 assert.equal(questPublishingRights(s.engine,c.state).limitD,2);
 const coins=c.state.player.coins;c=await s.wait(c,30,'month');assert.equal(c.state.player.coins,coins);
});

test('勋爵须治理凭据且封地是现任村长之村；按封地实收税费分成、交贡赋，去职后封地收入随之停发',async()=>{
 const s=setup();military(s.doc);
 const noOffice=await s.petition(s.doc,'勋爵').then(r=>r.document);
 const failed=await s.wait(noOffice,registryDays);
 assert.match(failed.state.records['title_petition:petition'].reasons.join(),/治理/);
 const start=structuredClone(s.doc);headOffice(start);
 let c=(await s.petition(start,'勋爵')).document;c=await s.wait(c,registryDays);
 const t=c.state.records['title:player'];assert.equal(t.title,'勋爵');assert.equal(t.fief,village);
 assert.equal(questPublishingRights(s.engine,c.state).limitD,10);
 // The fief takes in 1200 in housing fees during the month (tax receipts add to the same base).
 c=structuredClone(c);
 const fee=s.engine.primitiveDraft(c);
 financeTransfer(fee,s.engine,'player',village,1200,'housing-fee:x');
 fee.set(['state','records','housing_fee:x'],{category:'housing_fee',settlement:village,payer:'player',copper:1200,kind:'宅基费',minute:c.state.minute,sourceEvent:'housing-fee:x'});
 c=applyPatches(c,fee.patches);
 const coins=c.state.player.coins,treasury=c.state.settlements[village].treasury;
 c=await s.wait(c,30,'month');
 const paid=Object.values(c.state.records).find(r=>r.category==='title_income'&&r.income>0);
 // Base = what actually came in: the fees plus whatever tax the village's real trade produced.
 assert.ok(paid.base>=1200);const income=Math.floor(paid.base*xunjue.incomeBps/10000),tribute=Math.floor(income*xunjue.tributeBps/10000);
 assert.equal(paid.income,income);assert.equal(paid.tribute,tribute);
 const salary=Object.values(c.state.records).filter(r=>r.category==='office_salary'&&r.holder==='player').reduce((sum,r)=>sum+r.paid,0);
 assert.equal(salary,world.rules.governance.salaries.monthlyCopper.office_village_head.村);
 assert.equal(c.state.player.coins,coins+income-tribute+salary);assert.ok(treasury>0);
 c=structuredClone(c);c.state.records[`governance_office:${village}:office_village_head:player`].status='已免职';
 const after=c.state.player.coins;c=await s.wait(c,30,'month2');
 assert.equal(c.state.player.coins,after);assert.equal(c.state.records['title:player'].status,'失封地');
});

test('兵役与报到按年点验：应役报到则保留；缺一年停俸降等，连续两年除爵、额度随之取消',async()=>{
 const s=setup();headOffice(s.doc);military(s.doc);
 let c=(await s.petition(s.doc,'勋爵')).document;c=await s.wait(c,registryDays);
 // Serve in person at the office with one companion: 2 men x 15 days.
 c=structuredClone(c);c.state.location=charter.seat;c.state.minute=Math.floor(c.state.minute/DAY)*DAY+540;
 Object.assign(c.state.npcs[clerk],{location:charter.seat,activity:'公署递件'});c.state.player.companions=['npc_yp_gaoxin'];c.state.npcs.npc_yp_gaoxin.location=charter.seat;
 const served=await s.run(c,'world_settlement',{operation:'title_service',settlement:village,days:xunjue.levy.days},'serve');c=served.document;
 assert.equal(served.result.served,xunjue.levy.men*xunjue.levy.days);
 c=structuredClone(c);c.state.player.companions=[];c.state.records['title:player'].levy.due=c.state.minute+DAY;
 c=await s.wait(c,2,'year1');let t=c.state.records['title:player'];
 assert.equal(t.status,'受封');assert.equal(t.years.at(-1).kept,true);assert.equal(t.levy.served,0);
 c=structuredClone(c);c.state.records['title:player'].levy.due=c.state.minute+DAY;
 c=await s.wait(c,2,'year2');t=c.state.records['title:player'];
 assert.equal(t.status,'停俸');assert.equal(t.breaches,1);
 c=structuredClone(c);c.state.records['title:player'].levy.due=c.state.minute+DAY;
 c=await s.wait(c,2,'year3');t=c.state.records['title:player'];
 assert.equal(t.status,'已除爵');
 assert.equal(questPublishingRights(s.engine,c.state).limitD,10);
 c=structuredClone(c);c.state.records[`governance_office:${village}:office_village_head:player`].status='已免职';
 assert.equal(questPublishingRights(s.engine,c.state).limitD,0);
});
