import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
const village=world.settlementProfiles.find(p=>p.id==='loc_bs_yupo'),head=village.details.governance.head;
const charter=world.rules.governance.authority.superiors.auth_bs_office_charter,wage=world.rules.governance.authority.treasury.wagePerWorkerDayCopper;
const clerk=world.npcs.find(n=>n.workplace?.location===charter.seat&&charter.registrars.occupations.includes(n.occupation)).id;
const workers=village.details.governance.coordinators.filter(id=>id!==head),site='loc_yp_path';

// The player is appointed through the normal Baishi office path, then stands at the site with two village workers.
async function appointed(office='工役协理'){
 const w=structuredClone(world);for(const n of w.npcs)delete n.schedule;
 const engine=new WorldEngine(w);let doc=engine.createCharacter(seed,{},'projects-test');
 doc.state.location=charter.seat;doc.state.minute=540;
 Object.assign(doc.state.npcs[clerk],{location:charter.seat,activity:'公署递件'});
 const r=doc.state.records;
 r[`civic_citizen:${village.id}:player`]={category:'civic_citizen',subject:'player',settlement:village.id,status:'已登记'};
 r['civic_source:seed']={category:'civic_contribution',sourceEvent:'seed',settlement:village.id,subject:'player',kind:'donation',points:120,minute:0};
 r[`standing:${head}:player`]={category:'standing',holder:head,target:'player',value:30,history:[]};
 const run=async(c,tool,args,eventId)=>{const out=await engine.reduce(c,{tool,args,eventId});return {document:applyPatches(c,out.patches),result:out.result};};
 doc=(await run(doc,'world_settlement',{operation:'governance_apply',settlement:village.id,name:office},'apply')).document;
 doc=(await run(doc,'world_time',{minutes:3*DAY},'decide')).document;
 assert.equal(Object.values(doc.state.records).filter(x=>x.category==='governance_office'&&x.status==='在任').length,1);
 doc.state.location=site;doc.state.minute=Math.floor(doc.state.minute/DAY)*DAY+540;
 for(const id of workers)Object.assign(doc.state.npcs[id],{location:site,activity:'修路',status:'正常'});
 const start=(c,extra={},event='build')=>run(c,'world_settlement',{operation:'start_project',settlement:village.id,name:'坡口避雨棚',plot:site,wood:10,days:5,workers,consent:true,...extra},event);
 return {engine,doc,run,start};
}
const stock=c=>({treasury:c.state.settlements[village.id].treasury,wood:c.state.settlements[village.id].wood,stone:c.state.settlements[village.id].stone});

test('没有在任官职不能动公款开工；官职、做工人与受益人条件逐项核对',async()=>{
 const s=await appointed();
 const plain=structuredClone(s.doc);for(const r of Object.values(plain.state.records))if(r.category==='governance_office')r.status='已免职';
 await assert.rejects(s.start(plain),/授权/);
 for(const [extra,error]of [[{consent:false},/同意/],[{beneficiaries:['player']},/受益人/],[{workers:[head,'npc_wt_zhengxi']},/在场|住户/],[{wood:999999},/材料|木料/],[{plot:'loc_wt_path'},/不在本村/]])
  await assert.rejects(s.start(s.doc,extra),error);
 const poor=structuredClone(s.doc);poor.state.settlements[village.id].treasury=400;
 await assert.rejects(s.start(poor),/留底/);
 const big=structuredClone(s.doc);big.state.settlements[village.id].treasury=100000;
 await assert.rejects(s.start(big,{days:30}),/本月公款额度不足/);
});

test('开工从公库押工钱、拨材料；按实际做工日付给本人，完工产生可进入的公共设施，结余退回',async()=>{
 const s=await appointed(),before=stock(s.doc),coins=workers.map(w=>s.doc.state.npcs[w].coins);
 const started=await s.start(s.doc);let c=started.document;
 const bill=wage*workers.length*5;
 assert.deepEqual(stock(c),{...before,treasury:before.treasury-bill,wood:before.wood-10});
 assert.equal(c.state.records[`governance_spend:${started.result.project}`].copper,bill);
 // One worker falls ill for the whole job: only the able one is paid.
 c.state.npcs[workers[1]].status='患病';
 c=(await s.run(c,'world_time',{minutes:5*DAY},'work')).document;
 const p=c.state.projects[started.result.project];
 assert.equal(p.status,'已完成');assert.equal(c.state.npcs[workers[0]].coins,coins[0]+wage*5);assert.equal(c.state.npcs[workers[1]].coins,coins[1]);
 assert.equal(c.state.settlements[village.id].treasury>=before.treasury-bill+wage*5,true);
 assert.equal(c.state.records[`governance_spend:${p.id}:refund`].copper,-wage*5);
 assert.equal(c.state.records[`civic_source:${p.id}:${workers[0]}`].points,5);
 assert.equal(c.state.records[`civic_source:${p.id}:${workers[1]}`],undefined);
 const bld=p.facility;assert.equal(c.state.created[bld].owner,village.id);assert.equal(c.state.buildings[bld].condition,100);
 const moved=await s.run(c,'move',{destination:bld},'enter');assert.equal(moved.document.state.location,bld);
 const back=await s.run(moved.document,'move',{destination:site},'leave');assert.equal(back.document.state.location,site);
 // The official's own contribution is the existing project contribution, once.
 const credit=await s.run(c,'world_settlement',{operation:'civic_contribution',settlement:village.id,sourceEvent:p.id},'credit');
 assert.equal(credit.result.contribution.kind,'project');
});

test('中止时未用材料与未付工钱退回公账；无人能做工的日子不推进也不付钱',async()=>{
 const s=await appointed('村长'),before=stock(s.doc);
 let c=(await s.start(s.doc)).document;
 c=(await s.run(c,'world_time',{minutes:2*DAY},'two')).document;
 for(const w of workers)c.state.npcs[w].status='昏迷';
 c=(await s.run(c,'world_time',{minutes:DAY},'lost')).document;
 const p=c.state.projects.project_build;assert.equal(p.public.workedDays,2);assert.equal(p.public.lostDays,1);assert.equal(p.remainingDays,3);
 const woodBefore=c.state.settlements[village.id].wood;
 const aborted=await s.run(c,'world_settlement',{operation:'project_abort',settlement:village.id,project:'project_build'},'abort');c=aborted.document;
 assert.deepEqual(aborted.result.returned,{wood:6,stone:0,copper:wage*workers.length*3});
 assert.equal(c.state.projects.project_build.status,'已中止');
 assert.equal(c.state.settlements[village.id].treasury,before.treasury-wage*workers.length*2);assert.equal(c.state.settlements[village.id].wood,woodBefore+6);
 const again=await s.run(c,'world_settlement',{operation:'project_abort',settlement:village.id,project:'project_build'},'abort2');
 assert.equal(again.result.duplicate,true);assert.deepEqual(stock(again.document),stock(c));
});
