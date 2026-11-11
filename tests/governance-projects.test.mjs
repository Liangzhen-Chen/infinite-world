import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
const village=world.settlementProfiles.find(p=>p.id==='loc_bs_yupo'),head=village.details.governance.head;
const charter=world.rules.governance.authority.superiors.auth_bs_office_charter,wage=world.rules.governance.authority.treasury.wagePerWorkerDayCopper;
const clerk=world.npcs.find(n=>n.workplace?.location===charter.seat&&charter.registrars.occupations.includes(n.occupation)).id;
const workers=village.details.governance.coordinators.filter(id=>id!==head),site='loc_yp_path';

// The player is appointed through the normal Baishi office path, then stands at the site with two village workers.
async function appointed(office='工役协理'){
 // F083: the villagers keep their real daily schedules (nothing is deleted); only the official's appointment is the prelude.
 const engine=new WorldEngine(world);let doc=engine.createCharacter(seed,{},'projects-test');
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
 const poor=structuredClone(s.doc);poor.state.settlements[village.id].treasury=400;resyncBooks(s.engine,poor);
 await assert.rejects(s.start(poor),/留底/);
 const big=structuredClone(s.doc);big.state.settlements[village.id].treasury=100000;resyncBooks(s.engine,big);
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
 // F083 anchors (hand-worked). Work starts 09:00 on day 0, so day 0 counts 09:00-12:00 + 13:00-17:00 = 180+240 = 420 minutes.
 // From day 1 the worker walks from home bld_yp_home_08 to the path (road table: 11 min), so each day is 480-11 = 469 minutes.
 // The plan is 5 days = 2400 minutes: 420+4*469 = 2296 after day 4, the last 104 minutes come on day 5 => the 6th midnight.
 // Day wage 24 pro rata: floor(24*2400/480) = 120 = wage*5, so the pay and the refund below are unchanged.
 assert.equal(s.engine.route(s.engine.byId.get(workers[0]).home.location,site,'walk',480,'projects-test').minutes,11);
 c=(await s.run(c,'world_time',{minutes:6*DAY},'work')).document;
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
 // Two working days, stopping exactly at midnight so both days are fully settled (09:00 + 2*DAY-540 = day 2, 00:00).
 c=(await s.run(c,'world_time',{minutes:2*DAY-540},'two')).document;
 // F083 anchors: day 0 = 420 minutes at the site; day 1 = 480 minus the walk from home (gaoxin 11, lisha 14 minutes by the road table).
 // Progress of a duration project is its busiest worker's minutes: 420+469 = 889 of 2400.
 assert.deepEqual(workers.map(w=>s.engine.route(s.engine.byId.get(w).home.location,site,'walk',480,'projects-test').minutes),[11,14]);
 assert.deepEqual(workers.map(w=>c.state.projects.project_build.public.minutes[w]),[889,886]);
 for(const w of workers)c.state.npcs[w].status='昏迷';
 c=(await s.run(c,'world_time',{minutes:DAY},'lost')).document;
 // remainingDays = ceil((2400-889)/480) = ceil(3.15) = 4 (it was 3 when every day was assumed a full 480).
 const p=c.state.projects.project_build;assert.equal(p.public.workedDays,2);assert.equal(p.public.lostDays,1);assert.equal(p.remainingDays,4);
 const woodBefore=c.state.settlements[village.id].wood;
 const aborted=await s.run(c,'world_settlement',{operation:'project_abort',settlement:village.id,project:'project_build'},'abort');c=aborted.document;
 // Paid pro rata to credited minutes: floor(24*889/480)=44 and floor(24*886/480)=44, so 88 was paid out of the 240 escrowed.
 // Materials go in with progress: floor(10*889/2400)=3 used, so 7 of the 10 planks return (it was 6 under whole-day pay).
 assert.deepEqual(aborted.result.returned,{wood:7,stone:0,copper:wage*workers.length*5-88});
 assert.equal(c.state.projects.project_build.status,'已中止');
 assert.equal(c.state.settlements[village.id].treasury,before.treasury-88);assert.equal(c.state.settlements[village.id].wood,woodBefore+7);
 const again=await s.run(c,'world_settlement',{operation:'project_abort',settlement:village.id,project:'project_build'},'abort2');
 assert.equal(again.result.duplicate,true);assert.deepEqual(stock(again.document),stock(c));
});

test('F083 迟到两小时、缺勤一天：工钱与进度只按实际在岗分钟（手算锚点）',async()=>{
 const s=await appointed(),worker=workers[0],home=s.engine.byId.get(worker).home.location;
 // 只留一名做工人在岗：另一名全程患病（真实状态），两人同日开工，计划5日=2400分钟，日薪24。
 const started=await s.start(s.doc);let c=started.document;c.state.npcs[workers[1]].status='患病';
 const key=started.result.project,DAY0=Math.floor(c.state.minute/DAY);
 // 第0日 09:00 开工：上午 09:00-12:00 = 180，下午 13:00-17:00 = 240，共 420 分钟（夜里不在岗不计）。
 c=(await s.run(c,'world_time',{minutes:DAY-(c.state.minute%DAY)},'day0')).document;
 assert.equal(c.state.projects[key].public.minutes[worker],420);
 // 第1日：他夜里在别处，08:00 才上路、10:00 到工地（前提：已在途的行程，非考查对象）。
 // 到岗 10:00-12:00 = 120，下午 240，共 360 分钟 => 迟到 2 小时 = 少 120 分钟。
 const midnight=(DAY0+1)*DAY;
 const walking=applyIntentSetup(s.engine,c,{facts:[{path:['state','npcs',worker],value:{...c.state.npcs[worker],location:null,activity:'赶路',scheduleTravel:{from:home,to:site,depart:midnight+480,arrive:midnight+600,edges:[]}}}]});
 assert.deepEqual(walking.setupUnmet,[]);c=walking.document;
 c=(await s.run(c,'world_time',{minutes:DAY},'day1')).document;
 assert.equal(c.state.projects[key].public.attendance[worker].days[String(DAY0+1)],360);
 // 第2日整天缺勤（患病）；第3日康复，08:00 从家出发走到工地，损失的通勤分钟取当日路网（含天气）：
 // 实际到岗 = 480 - 通勤。
 c.state.npcs[worker].status='患病';
 c=(await s.run(c,'world_time',{minutes:DAY},'day2')).document;
 assert.equal(c.state.projects[key].public.attendance[worker].days[String(DAY0+2)],undefined);
 c.state.npcs[worker].status='正常';
 c=(await s.run(c,'world_time',{minutes:DAY},'day3')).document;
 const p=c.state.projects[key];
 const commute=s.engine.route(home,site,'walk',(DAY0+3)*DAY+480,c.randomSeed).minutes,day3=480-commute;
 assert.ok(commute>=10&&commute<=15);assert.equal(p.public.attendance[worker].days[String(DAY0+3)],day3);
 // 累计 420+360+0+day3(≈469) ≈ 1249 分钟；日薪24按分钟折算 floor(24×1248.x/480)=floor(62.4x)=62 铜，不是4个整日的 96 铜。
 assert.equal(p.public.minutes[worker],420+360+day3);assert.equal(p.public.paid[worker],Math.floor(24*(780+day3)/480));assert.equal(p.public.paid[worker],62);
 // 进度同样按这些分钟：工作日 3、丢失日 1，剩余 ceil((2400-1248)/480)=ceil(2.40)=3 天。
 assert.equal(p.public.workedDays,3);assert.equal(p.public.lostDays,1);assert.equal(p.remainingDays,3);
 assert.equal(p.public.escrow,240-62);
});
