import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {questPublishingRights} from '../server-plugin/quest-board.mjs';
import {toolDefinitions} from '../extension/tools.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
const village=world.settlementProfiles.find(p=>p.id==='loc_bs_yupo'),head=village.details.governance.head;
const charter=world.rules.governance.authority.superiors.auth_bs_office_charter;
const clerk=world.npcs.find(n=>n.workplace?.location===charter.seat&&charter.registrars.occupations.includes(n.occupation)).id;
const adults=village.details.governance.coordinators.filter(id=>id!==head);

function setup(){
 const w=structuredClone(world);for(const n of w.npcs)delete n.schedule;
 const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'office-test');
 doc.state.location=charter.seat;doc.state.minute=540;doc.state.player.coins=5000;
 Object.assign(doc.state.npcs[clerk],{location:charter.seat,activity:'公署递件'});
 const run=async(c,tool,args,eventId)=>{const out=await engine.reduce(c,{tool,args,eventId});return {document:applyPatches(c,out.patches),result:out.result};};
 const apply=(c,office,event='apply')=>run(c,'world_settlement',{operation:'governance_apply',settlement:village.id,name:office},event);
 const wait=(c,days,event='wait')=>run(c,'world_time',{minutes:days*DAY},event);
 const publish=(c,patch={},event='post')=>run(c,'world_quest',{operation:'publish',publisher:'player',personal:false,settlement:village.id,grade:'C',reward:300,content:'修补坡路排水沟',objective:{type:'visit',location:'loc_yp_path'},...patch},event);
 return {engine,doc,run,apply,wait,publish};
}
// Real qualifying facts for the village: citizen record, contribution ledger, the head's view.
function qualify(c,{points=120,headView=30}={}){
 const r=c.state.records;
 r[`civic_citizen:${village.id}:player`]={category:'civic_citizen',subject:'player',settlement:village.id,status:'已登记',since:0,sources:[],sponsor:adults[0],authority:head,fee:20,minute:0,sourceEvent:'seed-citizen'};
 r['civic_source:seed-gift']={category:'civic_contribution',sourceEvent:'seed-gift',settlement:village.id,subject:'player',kind:'donation',points,minute:0};
 r[`standing:${head}:player`]={category:'standing',holder:head,target:'player',value:headView,history:[]};
}
const view=(c,id,value)=>{c.state.records[`standing:${id}:player`]={category:'standing',holder:id,target:'player',value,history:[]};};

test('只能在公署前厅向在岗登记人申请章程所列官职；自报官职与没有官职的身份额度都被拒绝',async()=>{
 const s=setup();
 await assert.rejects(s.apply(s.doc,'镇长'),/自报/);
 const away=structuredClone(s.doc);away.state.location=village.details.governance.meetingPlace;
 await assert.rejects(s.apply(away,'村长'),/公署前厅/);
 const closed=structuredClone(s.doc);closed.state.npcs[clerk].activity='睡眠';
 await assert.rejects(s.apply(closed,'村长'),/在岗/);
 await assert.rejects(s.publish(s.doc),/额度/);
 assert.equal(questPublishingRights(s.engine,s.doc.state).limitD,0);
});

test('上级按贡献、头人举荐与住户意见在审定日任免；不达标留原因，不授官职',async()=>{
 const s=setup();let c=(await s.apply(s.doc,'村长')).document;
 assert.equal(c.state.records['governance_application:apply'].status,'待审定');
 c=(await s.wait(c,3)).document;
 const no=c.state.records['governance_application:apply'];
 assert.equal(no.status,'未获任命');assert.ok(no.reasons.some(r=>/公民/.test(r)));assert.ok(no.reasons.some(r=>/贡献/.test(r)));assert.ok(no.reasons.some(r=>/头人/.test(r)));
 assert.equal(Object.values(c.state.records).some(r=>r.category==='governance_office'),false);
 // Residents against the applicant block the appointment even with every other fact in place.
 const opposed=structuredClone(s.doc);qualify(opposed);view(opposed,adults[0],-20);view(opposed,adults[1],-20);
 let o=(await s.apply(opposed,'村长')).document;o=(await s.wait(o,3)).document;
 assert.match(o.state.records['governance_application:apply'].reasons.join(),/反对2多于支持1/);
});

test('任命生效后按月给任务额度，公款托管从村公库按月度上限与留底支出，退款回公库',async()=>{
 const s=setup(),start=structuredClone(s.doc);qualify(start);
 let c=(await s.apply(start,'村长')).document;c=(await s.wait(c,3)).document;
 const office=c.state.records[`governance_office:${village.id}:office_village_head:player`];
 assert.equal(office.status,'在任');assert.equal(office.appointedBy,'白石镇公署');assert.equal(office.basis.contribution,120);
 assert.equal(questPublishingRights(s.engine,c.state).limitD,10);
 const treasury=c.state.settlements[village.id].treasury,coins=c.state.player.coins;
 const posted=await s.publish(c);c=posted.document;
 assert.equal(c.state.settlements[village.id].treasury,treasury-300);assert.equal(c.state.player.coins,coins);
 assert.equal(c.state.quests[posted.result.quest].fundedBy.settlement,village.id);
 assert.equal(questPublishingRights(s.engine,c.state).usedD,10);
 // 1C used the whole 10D month; one more D does not fit.
 await assert.rejects(s.publish(c,{grade:'D',reward:20},'more'),/额度/);
 // Monthly public budget and the treasury reserve are both enforced.
 const rich=structuredClone(c);rich.state.questQuota={};
 await assert.rejects(s.publish(rich,{reward:1800},'big'),/本月公款额度不足/);
 const poor=structuredClone(c);poor.state.questQuota={};poor.state.settlements[village.id].treasury=350;
 await assert.rejects(s.publish(poor,{reward:100},'poor'),/留底/);
 // Personal escrow still works for an office holder.
 const own=structuredClone(rich);const mine=await s.publish(own,{settlement:undefined,reward:200},'own');
 assert.equal(mine.document.state.player.coins,coins-200);assert.equal(mine.document.state.settlements[village.id].treasury,treasury-300);
 const cancelled=await s.run(c,'world_quest',{operation:'cancel',quest:posted.result.quest},'cancel');
 assert.equal(cancelled.document.state.settlements[village.id].treasury,treasury);assert.equal(cancelled.document.state.player.coins,coins);
});

test('复核时住户反对多于支持即免职：停止新增额度与公款，既有委托照常结算',async()=>{
 const s=setup(),start=structuredClone(s.doc);qualify(start,{points:30,headView:10});
 let c=(await s.apply(start,'工役协理')).document;c=(await s.wait(c,3)).document;
 const key=`governance_office:${village.id}:office_works_deputy:player`;
 assert.equal(c.state.records[key].status,'在任');assert.equal(questPublishingRights(s.engine,c.state).limitD,3);
 const posted=await s.publish(c,{grade:'D',reward:40});c=posted.document;
 view(c,adults[0],-30);view(c,adults[1],-30);
 c=(await s.wait(c,30,'month')).document;
 assert.equal(c.state.records[key].status,'已免职');assert.match(c.state.records[key].reason,/反对/);
 assert.equal(questPublishingRights(s.engine,c.state).limitD,0);
 // The earlier quest was not erased by the removal: it ran to its own deadline and refunded the treasury.
 const q=c.state.quests[posted.result.quest];assert.equal(q.status,'超期');assert.equal(q.refund,40);
 assert.equal(c.state.records[`governance_spend:${q.id}:refund`].copper,-40);
 await assert.rejects(s.publish(c,{grade:'D',reward:40},'after'),/额度/);
});

test('统一工具公开申请入口与公款托管参数',()=>{
 const defs=toolDefinitions(),settle=defs.find(t=>t.function.name==='world_settlement').function.parameters,quest=defs.find(t=>t.function.name==='world_quest').function.parameters;
 assert.ok(settle.properties.operation.enum.includes('governance_apply'));assert.equal(settle.properties.office,undefined);assert.ok(quest.properties.settlement);
});
