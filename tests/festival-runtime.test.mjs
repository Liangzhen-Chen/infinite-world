import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {festivalCalendar,validateFestivalRuntime,festivalScene} from '../server-plugin/festival.mjs';
import {scheduleAt,npcAvailability} from '../server-plugin/npc-schedule.mjs';
import {applyNpcPlan,npcPlanFingerprint} from '../server-plugin/npc-autonomy.mjs';
import {compatibleWorld} from '../server-plugin/world-upgrade.mjs';
import {validateWorld} from '../tools/validate-world.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
function setup({kind='ritual',linked=false,month=1,day=1,owner='host',scheduled=false}={}){
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}
 const local=w.settlementProfiles.find(p=>p.id==='loc_bs_yupo').details.calendar.festivals[0];
 Object.assign(local,{month,day});
 const host=local.host,supplier='npc_yp_zhaofeng',person=w.npcs.find(n=>n.id.startsWith('npc_yp_')&&![host,supplier].includes(n.id)).id;
 const f={id:'festival_runtime_test',name:'运行测试节日',calendar:{month,day},venue:{location:local.location,precision:'existing_location'},custom:'本人提供材料，现场举行。',
  resourceNeeds:[{item:'item_wood',quantity:2,owner}],runtime:{status:'active',host,kind,startMinute:720,durationMinutes:120,minimumParticipants:1,...(linked?{sourceCustom:'custom:loc_bs_yupo:0'}:{})}};
 w.festivals=[f];
 if(scheduled){const n=w.npcs.find(n=>n.id===person);n.schedule={default:[{start:0,end:1440,location:f.venue.location,activity:'歇工',services:['trade','teach']}]};n.serviceCatalog=[{kind:'trade'}];}
 const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'festival-runtime');doc.state.location=f.venue.location;
 for(const id of [host,supplier,person])Object.assign(doc.state.npcs[id],{location:f.venue.location,status:'正常',activity:'歇工',coins:50});
 doc.state.npcs[host].inventory.item_wood={quantity:5};doc.state.inventory.item_wood={quantity:5};
 const run=async(document,args,eventId,tool='world_settlement')=>{const out=await engine.reduce(document,{tool,args,eventId});return {doc:applyPatches(document,out.patches),out};};
 const wait=(document,minutes,id='time')=>run(document,{minutes},id,'world_time');
 return {w,f,host,supplier,person,engine,doc,run,wait};
}
async function plan(s,{authorize=true,join=true,cost=7,document=s.doc}={}){
 let {doc,out}=await s.run(document,{operation:'festival_plan',festival:s.f.id,cost,supplier:s.supplier},'plan');const id=out.result.festival;
 if(authorize)for(const who of [...new Set([s.host,...(cost?[s.supplier]:[]),...s.f.resourceNeeds.map(n=>n.owner==='host'?s.host:n.owner),s.engine.byId.get(s.f.venue.location).owner].filter(Boolean))])
  doc=(await s.run(doc,{operation:'festival_authorize',festival:id,speaker:who,consent:true},`authorize-${who}`)).doc;
 if(join)doc=(await s.run(doc,{operation:'festival_join',festival:id,speaker:s.person,consent:true},'join')).doc;
 return {doc,id};
}
const count=(doc,owner,item='item_wood')=>{const value=(owner==='player'?doc.state.inventory:doc.state.npcs[owner].inventory)[item];return typeof value==='number'?value:value?.quantity??0;};
const cash=doc=>doc.state.player.coins+Object.values(doc.state.npcs).reduce((sum,n)=>sum+n.coins,0)+Object.values(doc.state.settlements).reduce((sum,s)=>sum+s.treasury,0);
const draft=document=>({document,get(...p){return p.reduce((x,k)=>x?.[k],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);}});

test('正式文件由加载器接入，候选不运行，正式参数经schema及来源检查',async()=>{
 // T108 published the catalog; the loader still never adds an empty field.
 assert.ok(!Object.hasOwn(world,'festivals')||world.festivals.length>0,'未发布目录不新增空字段，不改变冻结世界来源哈希');
 const s=setup();assert.deepEqual(validateFestivalRuntime(s.w),[]);
 assert.ok(!validateWorld(s.w).errors.some(e=>e.startsWith('schema')));
 const inspected=await s.run(s.doc,{operation:'festival_inspect'},'inspect');assert.ok(inspected.out.result.calendar.some(f=>f.publishedId===s.f.id));
 for(const mutate of [f=>f.calendar.day=31,f=>f.venue.precision='regional_unmapped',f=>f.runtime.host='npc_missing',f=>f.runtime.durationMinutes=1000,f=>f.resourceNeeds[0].item='item_missing',f=>delete f.resourceNeeds[0].owner]){
  const bad=structuredClone(s.w);mutate(bad.festivals[0]);assert.throws(()=>new WorldEngine(bad),/节日/);
 }
 const candidate=structuredClone(s.w);candidate.festivals[0].runtime.status='design_only';const engine=new WorldEngine(candidate);
 assert.ok(!festivalCalendar(engine).some(f=>f.publishedId===s.f.id));
 await assert.rejects(engine.reduce(s.doc,{tool:'world_settlement',args:{operation:'festival_plan',festival:s.f.id},eventId:'draft'}),/候选/);
});

test('正式仪式扣实际材料和私人费用；单件记录、资金与重放保持一致',async()=>{
 const s=setup();s.doc.state.npcs[s.host].inventory.item_wood.instances=['festival-unit'];
 s.doc.state.itemInstances={...s.doc.state.itemInstances,'festival-unit':{id:'festival-unit',item:'item_wood',owner:s.host,status:'持有'}};
 const p=await plan(s),before=cash(p.doc),out=await s.wait(p.doc,180);
 const r=out.doc.state.records[p.id];assert.equal(r.status,'held');assert.equal(r.kind,'ritual');assert.equal(r.paidCopper,7);
 assert.equal(count(out.doc,s.host),3);assert.equal(count(out.doc,'player'),5);assert.equal(cash(out.doc),before);
 assert.equal(r.consumed[0].quantity,2);assert.equal(out.doc.state.itemInstances['festival-unit'].status,'已消耗');
 assert.deepEqual(await s.wait(p.doc,180),out);
 const later=(await s.wait(out.doc,120,'later')).doc;assert.equal(count(later,s.host),3);assert.equal(later.state.npcs[s.host].coins,43);
});

test('报名及组织费不能代替材料物主同意；玩家自有物资只在本人到场时消耗',async()=>{
 const s=setup({owner:'player'}),p=await plan(s);const result=(await s.wait(p.doc,180)).doc;
 assert.equal(result.state.records[p.id].status,'held');assert.equal(count(result,'player'),3);assert.equal(count(result,s.host),5);
 for(const mode of ['authorization','remote','consent-tamper']){
  const t=setup({owner:'player'}),q=await plan(t);
  if(mode==='authorization')q.doc.state.records[q.id].agreements=q.doc.state.records[q.id].agreements.filter(a=>a.person!=='player');
  if(mode==='remote')q.doc.state.location='loc_hw';
  if(mode==='consent-tamper')q.doc.state.records[q.id].enrollments[0].person='player';
  const out=(await t.wait(q.doc,180)).doc;assert.notEqual(out.state.records[q.id].status,'held');assert.equal(count(out,'player'),5);assert.equal(out.state.npcs[t.host].coins,50);
 }
});

test('材料不足、聚合重复材料、物主离场、场地损毁及无人同意都不扣任何材料或费用',async()=>{
 for(const mode of ['stock','aggregate','owner','venue','attendance']){
  const s=setup();if(mode==='aggregate')s.f.resourceNeeds.push({item:'item_wood',quantity:4,owner:'host'});
  const p=await plan(s,{join:mode!=='attendance'});
  if(mode==='stock')p.doc.state.npcs[s.host].inventory.item_wood.quantity=1;
  if(mode==='owner')p.doc.state.npcs[s.host].location='loc_hw';
  if(mode==='venue')p.doc.state.buildings[s.f.venue.location]={condition:0};
  const opening=count(p.doc,s.host),out=(await s.wait(p.doc,180)).doc,r=out.state.records[p.id];
  assert.notEqual(r.status,'held');assert.ok(r.reason);assert.equal(r.paidCopper,0);assert.equal(count(out,s.host),opening);assert.equal(out.state.npcs[s.host].coins,50);
 }
});

test('私有场地须实际物主同意且保持开放，缺失物主不许组织',async()=>{
 const s=setup();s.engine.byId.get(s.f.venue.location).owner=s.supplier;
 const p=await plan(s,{cost:0});p.doc.state.records[p.id].agreements=p.doc.state.records[p.id].agreements.filter(a=>a.person!==s.supplier);
 assert.equal((await s.wait(p.doc,180)).doc.state.records[p.id].status,'unauthorized');
 const t=setup();t.engine.byId.get(t.f.venue.location).access={mode:'private'};
 await assert.rejects(plan(t),/场地/);
 const u=setup();u.engine.byId.get(u.f.venue.location).openHours=[420,800];await assert.rejects(plan(u),/开放窗口/);
});

test('活动窗口改变真实服务及生产窗口，到期恢复原作息，取消即恢复',async()=>{
 for(const kind of ['market','ritual']){
  const s=setup({kind,scheduled:true}),p=await plan(s);
  assert.equal(scheduleAt(s.engine,s.person,700,p.doc.state).until,720);
  const held=(await s.wait(p.doc,180)).doc,slot=scheduleAt(s.engine,s.person,720,held.state);
  assert.equal(slot.production,false);assert.equal(slot.until,840);assert.equal(slot.location,s.f.venue.location);
  assert.deepEqual(npcAvailability(s.engine,held.state,s.person).services,kind==='market'?['trade']:[]);
  s.engine.byId.get(s.person).tier='full';held.state.npcs[s.person].goals={short:[{id:'festival_test_goal',content:'核清现有铁料',progress:0,steps:[]}]};
  const input={kind:'npc-plan',version:1,minute:720,stateFingerprint:npcPlanFingerprint(held),proposals:[{npc:s.person,actions:[{kind:'audit_inventory',goal:'festival_test_goal'}]}]};
  const d=draft(held),work=applyNpcPlan(d,s.engine,input,'work');assert.equal(work.results[0].status,'拒绝');assert.match(work.results[0].reason,/工作窗口/);
  const recovered=structuredClone(held);recovered.state.minute=840;
  assert.deepEqual(scheduleAt(s.engine,s.person,840,recovered.state).services,['trade','teach']);
  const resumed=applyNpcPlan(draft(recovered),s.engine,{...input,minute:840,stateFingerprint:npcPlanFingerprint(recovered)},'resume');assert.equal(resumed.results[0].status,'进行中');
  const cancelled=(await s.run(p.doc,{operation:'festival_cancel',festival:p.id,speaker:s.host,consent:true,content:'取消现场活动'},'cancel')).doc;
  assert.equal(scheduleAt(s.engine,s.person,720,cancelled.state).festival,undefined);
  const after=(await s.wait(cancelled,300)).doc;assert.equal(after.state.records[p.id].status,'cancelled');assert.equal(count(after,s.host),5);
 }
});

test('集市交易继续走真实库存及价格，仪式期间拒绝交易并保持账本',async()=>{
 for(const kind of ['market','ritual']){
  const s=setup({kind,scheduled:true}),p=await plan(s),held=(await s.wait(p.doc,180)).doc;
  held.state.npcs[s.person].inventory.item_wood={quantity:3};const args={seller:s.person,item:'item_wood',quantity:1};
  if(kind==='ritual'){await assert.rejects(s.run(held,args,'trade','world_trade'),/不提供/);assert.equal(count(held,s.person),3);}
  else{const out=(await s.run(held,args,'trade','world_trade')).doc;assert.equal(count(out,s.person),2);assert.equal(count(out,'player'),6);assert.equal(cash(out),cash(held));}
 }
});

test('未来义务占用活动窗口、睡眠及远方人员不被节日移入现场',async()=>{
 for(const mode of ['obligation','sleep','remote']){
  const s=setup({scheduled:mode==='remote'}),p=await plan(s);
  if(mode==='obligation'){
   s.engine.byId.get(s.person).tier='full';
   p.doc=(await s.run(p.doc,{type:'会面',promisor:s.person,promisee:'player',start:780,deadline:900,content:'另一个真实预约',location:s.f.venue.location},'busy','world_promise')).doc;
  }
  if(mode==='sleep')p.doc.state.npcs[s.person].status='睡眠';
  if(mode==='remote')p.doc.state.npcs[s.person].location='loc_hw';
  const out=(await s.wait(p.doc,180)).doc;assert.notEqual(out.state.records[p.id].status,'held');assert.equal(count(out,s.host),5);
  if(mode==='remote')assert.notEqual(out.state.npcs[s.person].location,s.f.venue.location);
 }
});

test('跨月长短步、重放与本地显示一致；正式节日与同源地方节俗只有一个结果',async()=>{
 const s=setup({month:2,day:1,linked:true,scheduled:true});s.doc=(await s.wait(s.doc,29*DAY,'prepare')).doc;
 const p=await plan(s),elapsed=2*DAY,large=await s.wait(p.doc,elapsed,'large');let split=p.doc;
 for(let i=0;i<elapsed/180;i++)split=(await s.wait(split,180,`split-${i}`)).doc;
 const events=doc=>Object.values(doc.state.records).filter(r=>r.category==='festival');
 assert.deepEqual(events(split),events(large.doc));assert.deepEqual(split.state.npcs,large.doc.state.npcs);
 assert.equal(large.doc.state.records[p.id].status,'held');assert.equal(count(large.doc,s.host),3);
 assert.equal(events(large.doc).filter(r=>r.custom==='custom:loc_bs_yupo:0').length,1);
 assert.equal(festivalCalendar(s.engine).filter(f=>f.location===s.f.venue.location).length,1);
 await assert.rejects(s.run(p.doc,{operation:'festival_plan',festival:'custom:loc_bs_yupo:0'},'double'),/重复/);
 const remote=structuredClone(large.doc);remote.state.location='loc_hw';assert.equal(festivalScene(s.engine,remote),'');
 assert.match(festivalScene(s.engine,large.doc),/已举行/);
});

test('正式参数撤回或改变保留未举办结果，旧地方预约不能借新参数消费',async()=>{
 for(const mode of ['withdraw','change']){
  const s=setup(),p=await plan(s);if(mode==='withdraw')s.w.festivals=[];else s.f.resourceNeeds[0].quantity=4;
  const out=(await s.wait(p.doc,180)).doc;assert.equal(out.state.records[p.id].status,'unavailable');assert.equal(count(out,s.host),5);
 }
 const s=setup({linked:true});s.w.festivals=[];
 const old=(await s.run(s.doc,{operation:'festival_plan',festival:'custom:loc_bs_yupo:0'},'old')).doc;
 s.w.festivals=[s.f];const id='festival:custom:loc_bs_yupo:0:1';
 const out=(await s.wait(old,180)).doc;assert.equal(out.state.records[id].status,'unavailable');assert.equal(count(out,s.host),5);
 const next=structuredClone(s.w);next.version='festival-next';const merged=compatibleWorld(s.w,{...next,festivals:[]});
 assert.equal(merged.world.festivals[0].id,s.f.id);assert.ok(merged.retained.some(r=>r.category==='festivals'));
});
