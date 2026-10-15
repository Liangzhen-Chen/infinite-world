import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {medicineSites,medicinePriceFactor,waterDiseaseExposure,MEDICAL_SKILL} from '../server-plugin/medicine-state.mjs';
import {organizationState} from '../server-plugin/organization-state.mjs';
import {laborOffers} from '../server-plugin/labor-market.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,CLINIC='bld_hw_herbs',DOCTOR='npc_hw_taozhi',HELPER='npc_hw_fanrong',PATIENT='npc_hw_linsui';
// The doctor's routine puts her at the herb yard by day; everything else is the shipped world.
function fixture({skill=1500,herbs=5,playerHerbs=0}={}){
 const w=structuredClone(world);
 for(const id of [DOCTOR,HELPER,PATIENT]){const b=w.npcs.find(n=>n.id===id);b.schedule={default:[{start:0,end:1440,location:CLINIC,activity:'坐诊配药'}]};}
 w.npcs.find(n=>n.id===DOCTOR).proficiencies={...w.npcs.find(n=>n.id===DOCTOR).proficiencies,[MEDICAL_SKILL]:skill};
 const e=new WorldEngine(w),doc=e.initialFromLegacy({state:seed.state,memories:seed.memories},'medicine');
 Object.assign(doc.state,{minute:480,location:CLINIC});doc.state.player.coins=500;
 for(const id of [DOCTOR,HELPER,PATIENT])doc.state.npcs[id]={...doc.state.npcs[id],location:CLINIC,status:'正常',activity:'坐诊配药'};
 doc.state.npcs[DOCTOR].inventory={...doc.state.npcs[DOCTOR].inventory,item_herb:herbs};
 if(playerHerbs)doc.state.inventory={...doc.state.inventory,item_herb:playerHerbs};
 return {w,e,doc};
}
async function run(f,tool,args,id){const out=await f.e.reduce(f.doc,{tool,args,eventId:id});f.doc=applyPatches(f.doc,out.patches);return out.result;}
const wound=()=>({bloodMl:4500,pain:3,wounds:[{id:'cut',simple:true,depthMm:2,areaCm2:5,bleedingMlPerMinute:1,contamination:10,infectionRisk:20,toxinUg:0,foreignBody:false,closed:false}],symptoms:[]});
const herbsOf=(f,id)=>{const q=f.doc.state.npcs[id]?.inventory?.item_herb;return typeof q==='number'?q:q?.quantity??0;};
const visits=f=>Object.values(f.doc.state.records).filter(r=>r.category==='medicine_visit');
function sick(f,id=PATIENT,{severity='轻',days=10,coins=0}={}){
 const ill={id:`illness_test_${id}`,patient:id,severity,since:f.doc.state.minute,endsAt:f.doc.state.minute+days*DAY,status:'患病中',previousStatus:null,household:null,caregivers:[],fatality:{cared:.2,alone:.4}};
 f.doc.state.family={...f.doc.state.family,illnesses:{...f.doc.state.family?.illnesses,[ill.id]:ill}};
 if(id==='player')f.doc.state.player.coins=coins;else Object.assign(f.doc.state.npcs[id],{status:'患病',coins});
 return ill.id;
}

test('医馆由设施与当前职业派生：医师、药童、容量与组织视图',()=>{
 const f=fixture(),site=medicineSites(f.e,f.doc.state).find(c=>c.seat===CLINIC);
 assert.deepEqual(site.doctors,[DOCTOR]);assert.ok(site.capacity>0);
 assert.equal(organizationState(f.e,f.doc.state,site.id).members[DOCTOR].position,'医师');
 f.doc.state.npcs[DOCTOR].status='昏迷';assert.deepEqual(medicineSites(f.e,f.doc.state).find(c=>c.seat===CLINIC).doctors,[]);
});

test('玩家求医：排期、付诊费、耗真实药材，结果写回原创伤并复诊愈合',async()=>{
 const f=fixture();f.doc.state.player.medical=wound();
 const coins=f.doc.state.player.coins,doctorCoins=f.doc.state.npcs[DOCTOR].coins??0;
 await assert.rejects(run(f,'world_settlement',{operation:'medicine_seek'},'noconsent'),/同意/);
 const row=await run(f,'world_settlement',{operation:'medicine_seek',consent:true},'seek');
 assert.equal(row.status,'预约');assert.equal(row.doctor,DOCTOR);assert.ok(row.fee>0);
 await assert.rejects(run(f,'world_settlement',{operation:'medicine_seek',consent:true},'twice'),/预约/);
 await run(f,'world_time',{minutes:row.end-f.doc.state.minute},'visit');
 const done=f.doc.state.records[row.id];assert.equal(done.status,'已诊');assert.equal(done.diagnosis.correct,true);
 assert.equal(herbsOf(f,DOCTOR),4);assert.equal(f.doc.state.player.coins,coins-row.fee);assert.equal((f.doc.state.npcs[DOCTOR].coins??0)-doctorCoins,row.fee);
 const w=f.doc.state.player.medical.wounds[0];assert.equal(w.bleedingMlPerMinute,0);assert.equal(w.treatments[0].visit,row.id);assert.ok(w.careDue);
 await run(f,'world_time',{minutes:DAY},'rest');assert.equal(f.doc.state.player.medical.wounds[0].healed,true);
});

test('药材短缺与诊费不足则未诊，不移动钱物；赊欠留下债务',async()=>{
 const f=fixture({herbs:0});f.doc.state.player.medical=wound();const before=f.doc.state.player.coins;
 const row=await run(f,'world_settlement',{operation:'medicine_seek',consent:true},'seek');
 await run(f,'world_time',{minutes:row.end-f.doc.state.minute},'visit');
 assert.equal(f.doc.state.records[row.id].status,'未诊');assert.match(f.doc.state.records[row.id].reason,/药材短缺/);
 assert.equal(f.doc.state.player.coins,before);assert.equal(f.doc.state.player.medical.wounds[0].treatments,undefined);
 const poor=fixture();poor.doc.state.player.medical=wound();poor.doc.state.player.coins=0;
 await assert.rejects(run(poor,'world_settlement',{operation:'medicine_seek',consent:true},'poor'),/诊费不足/);
 const credit=await run(poor,'world_settlement',{operation:'medicine_seek',consent:true,action:'credit'},'credit');
 await run(poor,'world_time',{minutes:credit.end-poor.doc.state.minute},'creditvisit');
 const debt=poor.doc.state.records[`debt:${credit.id}`];assert.equal(debt.debtor,'player');assert.equal(debt.amount,credit.fee);
});

test('医师技能决定诊断，误诊不缩短病程且照记在原病历',async()=>{
 let wrong=null;
 for(let i=0;i<12&&!wrong;i++){
  const f=fixture({skill:1});const ill=sick(f,'player',{coins:500});
  const row=await run(f,'world_settlement',{operation:'medicine_seek',consent:true},`seek${i}`);
  const endsAt=f.doc.state.family.illnesses[ill].endsAt;
  await run(f,'world_time',{minutes:row.end-f.doc.state.minute},`visit${i}`);
  const done=f.doc.state.records[row.id],after=f.doc.state.family.illnesses[ill];
  assert.equal(after.treatments.at(-1).visit,row.id);
  if(!done.diagnosis.correct){wrong={endsAt,after};}
  else assert.ok(after.endsAt<endsAt);
 }
 assert.ok(wrong,'低技能医师应出现误诊');assert.equal(wrong.after.endsAt,wrong.endsAt);assert.ok(wrong.after.misdiagnosedAt);
});

test('NPC病人按病情与家境自主求医：缺钱拖延，玩家资助义诊后耗药治疗并复诊',async()=>{
 const f=fixture({herbs:0}),ill=sick(f);
 await run(f,'world_time',{minutes:DAY},'day1');
 assert.match(f.doc.state.records[`medicine_delay:${PATIENT}`].reason,/诊费不足/);assert.equal(visits(f).length,0);
 await assert.rejects(run(f,'world_settlement',{operation:'medicine_seek',consent:true,beneficiaries:[PATIENT]},'proxy'),/自主求医/);
 f.doc.state.inventory={...f.doc.state.inventory,item_herb:3};
 const fund=await run(f,'world_settlement',{operation:'medicine_fund',budget:100,quantity:3},'fund');
 assert.equal(fund.coins,100);assert.equal(herbsOf(f,DOCTOR),3);
 await run(f,'world_time',{minutes:DAY},'day2');
 const [first]=visits(f);assert.equal(first.patient,PATIENT);assert.ok(first.charity);
 await run(f,'world_time',{minutes:DAY},'day3');
 const done=f.doc.state.records[first.id];assert.equal(done.status,'已诊');assert.equal(done.payment.sponsor,fund.id);
 assert.ok(f.doc.state.records[fund.id].coins<100);assert.equal(f.doc.state.family.illnesses[ill].treatments[0].visit,first.id);
 assert.equal(herbsOf(f,DOCTOR),2);
 await run(f,'world_time',{minutes:2*DAY},'followup');
 assert.ok(visits(f).some(r=>r.id!==first.id&&r.source===first.id),'未愈病人应复诊');
});

test('重病穷人赊欠求医，正确诊治降低死亡风险；排期积压抬高药价',async()=>{
 const f=fixture(),ill=sick(f,PATIENT,{severity:'重'});
 await run(f,'world_time',{minutes:1},'book');
 const [row]=visits(f);assert.equal(row.credit,true);assert.equal(row.status,'预约');
 assert.ok(medicinePriceFactor(f.e,f.doc.state,'item_herb',CLINIC)>1);assert.equal(medicinePriceFactor(f.e,f.doc.state,'item_iron',CLINIC),1);
 await run(f,'world_time',{minutes:row.end-f.doc.state.minute},'visit');
 const done=f.doc.state.records[row.id];assert.equal(done.status,'已诊');
 if(done.diagnosis.correct)assert.ok(f.doc.state.family.illnesses[ill].fatality.cared<.2);
 assert.equal(f.doc.state.records[`debt:${row.id}`].creditor,DOCTOR);
});

test('医馆经营者雇医师与药童，按诊次付工钱；NPC医馆排期不足时进入用工市场',async()=>{
 const f=fixture();f.doc.state.buildings={...f.doc.state.buildings,[CLINIC]:{...f.doc.state.buildings?.[CLINIC],owner:'player'}};
 await assert.rejects(run(f,'world_settlement',{operation:'medicine_hire',member:HELPER,proposedFee:40},'nohire'),/同意/);
 const hired=await run(f,'world_settlement',{operation:'medicine_hire',member:HELPER,proposedFee:40,consent:true},'hire');
 assert.equal(hired.task,'药童');assert.deepEqual(medicineSites(f.e,f.doc.state).find(c=>c.seat===CLINIC).assistants,[HELPER]);
 f.doc.state.player.medical=wound();const helperCoins=f.doc.state.npcs[HELPER].coins??0;
 const visit=await run(f,'world_settlement',{operation:'medicine_seek',consent:true},'ownseek');assert.deepEqual(visit.assistants,[HELPER]);
 await run(f,'world_time',{minutes:visit.end-f.doc.state.minute},'ownvisit');
 const paid=f.doc.state.records[visit.id].wages.find(w=>w.worker===HELPER);assert.ok(paid.paid>0);assert.equal((f.doc.state.npcs[HELPER].coins??0)-helperCoins,paid.paid);
 const g=fixture();g.doc.state.records['medicine_delay:x']={category:'medicine_delay',patient:PATIENT,clinic:`clinic:${CLINIC}`,reason:'医师七日内没有可用排期',minute:g.doc.state.minute};
 g.doc.state.npcs[DOCTOR].coins=1000;
 assert.ok(laborOffers(g.e,g.doc.state).some(o=>o.owner===DOCTOR&&o.location===CLINIC&&/医师|药童/.test(o.task)));
});

test('疫情时医馆施治耗药接U3防疫；水源暴露接口无RW-04数据时为空',async()=>{
 const f=fixture({herbs:5}),settlement=f.e.byId.get(CLINIC)?.settlement??'loc_hw';
 await assert.rejects(run(f,'world_settlement',{operation:'medicine_health'},'noep'),/疫病/);
 const sett=(await import('../server-plugin/entity-view.mjs')).placeSettlement(f.e,f.doc.state,CLINIC).value;
 const key='epidemic:test_clock:1';
 f.doc.state.records[key]={category:'epidemic',id:key,clock:'test_clock',disease:'disease_river_flux',origin:sett,since:0,status:'流行',settlements:[sett],households:{h1:{settlement:sett,status:'发病',patients:[]},h2:{settlement:sett,status:'发病',patients:[]}},measures:[]};
 const out=await run(f,'world_settlement',{operation:'medicine_health',choice:'treatment'},'treat');
 assert.equal(out.herbs,2);assert.equal(herbsOf(f,DOCTOR),3);assert.equal(f.doc.state.records[key].measures[0].measure,'treatment');
 assert.deepEqual(waterDiseaseExposure(f.doc.state,CLINIC),[]);
 f.doc.state.records['water:test']={category:'water_exposure',id:'water:test',location:CLINIC,since:0,disease:'disease_river_flux',risk:1};
 assert.equal(waterDiseaseExposure(f.doc.state,CLINIC).length,1);
});
