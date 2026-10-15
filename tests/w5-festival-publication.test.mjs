import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {festivalCalendar,validateFestivalRuntime} from '../server-plugin/festival.mjs';
import {assertEffect} from '../server-plugin/effects.mjs';
import {scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {publicLoreEntries} from '../server-plugin/lore.mjs';
import {catalogDefinition} from '../server-plugin/catalog.mjs';
import {planWorldUpgrade,compatibleWorld} from '../server-plugin/world-upgrade.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {overlays,activeIds} from '../world/design/w5-festival-publication.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
const candidate=JSON.parse(await fs.readFile('world/drafts/w5/festivals-candidate.json','utf8'));
const BATCH=overlays.map(o=>o.id);
const mine=()=>world.festivals.filter(f=>BATCH.includes(f.id));

test('T108：本批24个节日都有正式举办地点与运行参数，正文沿用已审核候选',()=>{
 assert.deepEqual(mine().map(f=>f.id).sort(),[...BATCH].sort());
 assert.deepEqual(validateFestivalRuntime(world),[]);assert.equal(validateWorld(world,{stage:'release'}).ok,true);
 const engine=new WorldEngine(world);
 for(const f of mine()){
  const old=candidate.festivals.find(r=>r.id===f.id);
  assert.deepEqual(f.prose,old.prose,f.id);assert.deepEqual(f.calendar,old.calendar,f.id);assert.equal(f.description,old.description);
  assert.equal(f.venue.precision,'existing_location');assert.ok(engine.byId.has(f.venue.location),f.id);assert.equal(f.venue.description,old.venue.description);
  const r=f.runtime;assert.ok(['market','ritual'].includes(r.kind));assert.equal(r.durationMinutes,old.participation.minutes);
  assert.ok(r.startMinute+r.durationMinutes<=DAY&&r.minimumParticipants>=1);
  for(const n of f.resourceNeeds){assert.equal(n.owner,'player');assert.ok(['consume','borrow','transfer'].includes(n.use));}
  for(const e of r.effects)assert.doesNotThrow(()=>assertEffect(engine,e,'festival'),f.id);
  if(activeIds.includes(f.id)){
   assert.equal(r.status,'active');assert.equal(r.hostRequirement,undefined);
   // The host's own schedule already puts them at the venue for the whole window.
   const at=((f.calendar.month-1)*30+f.calendar.day-1)*DAY+r.startMinute,slot=scheduleAt(engine,r.host,at);
   assert.equal(slot.location,f.venue.location,f.id);assert.ok(slot.end>=r.startMinute+r.durationMinutes,f.id);
  }else{assert.equal(r.status,'awaiting_host');assert.equal(r.host,undefined);assert.match(r.hostRequirement,/尚无登记在册/);}
 }
 // Only festivals with a real resident host enter the executable calendar.
 const running=festivalCalendar(engine).filter(f=>f.formal).map(f=>f.publishedId);
 assert.deepEqual(running.filter(id=>BATCH.includes(id)).sort(),[...activeIds].sort());
 assert.ok(activeIds.length>=3);
});

function setup(id){
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}
 const f=w.festivals.find(x=>x.id===id),engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'t108-festival');
 doc.state.location=f.venue.location;Object.assign(doc.state.npcs[f.runtime.host],{location:f.venue.location,status:'正常',activity:'歇工',coins:20});
 for(const n of f.resourceNeeds)doc.state.inventory[n.item]={quantity:n.quantity+2};
 const run=async(document,args,eventId,tool='world_settlement')=>{const out=await engine.reduce(document,{tool,args,eventId});return applyPatches(document,out.patches);};
 return {w,f,engine,doc,run,host:f.runtime.host};
}
const have=(doc,item)=>{const v=doc.state.inventory[item];return typeof v==='number'?v:v?.quantity??0;};
async function hold(s,{join=true}={}){
 const due=((s.f.calendar.month-1)*30+s.f.calendar.day-1)*DAY+s.f.runtime.startMinute;
 let doc=s.doc;doc.state.minute=due-120;
 doc=await s.run(doc,{operation:'festival_plan',festival:s.f.id,cost:0},'plan');const id=`festival:${s.f.id}:1`;
 for(const who of [s.host,'player'])doc=await s.run(doc,{operation:'festival_authorize',festival:id,speaker:who,consent:true},`auth-${who}`);
 if(join)doc=await s.run(doc,{operation:'festival_join',festival:id,speaker:'player',consent:true},'join');
 // A communal festival also needs neighbours who agree in person.
 const neighbours=['npc_hw_linsui','npc_hw_chenbai'].slice(0,s.f.runtime.minimumParticipants-1);
 for(const n of neighbours){Object.assign(doc.state.npcs[n],{location:s.f.venue.location,status:'正常',activity:'歇工'});doc=await s.run(doc,{operation:'festival_join',festival:id,speaker:n,consent:true},`join-${n}`);}
 for(const n of [s.host,...neighbours])doc.state.npcs[n].location=s.f.venue.location;
 return {id,doc:await s.run(doc,{minutes:120+s.f.runtime.durationMinutes},'wait','world_time')};
}

test('T108：玩家可参加正式节日，材料按用法扣除或归还，举办后有观感与传述',async()=>{
 for(const id of activeIds){
  const s=setup(id),before=have(s.doc,s.f.resourceNeeds[0].item),{id:row,doc}=await hold(s),r=doc.state.records[row];
  assert.equal(r.status,'held',`${id}:${r.reason}`);assert.ok(r.participants.includes('player'));
  const consumed=s.f.resourceNeeds[0].use==='consume'?s.f.resourceNeeds[0].quantity:0;
  assert.equal(have(doc,s.f.resourceNeeds[0].item),before-consumed,id);
  assert.deepEqual(r.effects.map(e=>e.kind),s.f.runtime.effects.map(e=>e.kind));
  const st=s.f.runtime.effects.find(e=>e.kind==='standing');assert.equal(standing(s.engine,doc.state,st.holder,'player')-standing(s.engine,s.doc.state,st.holder,'player'),st.delta);
  const rumor=s.f.runtime.effects.find(e=>e.kind==='rumor');
  if(rumor)assert.ok(doc.state.npcs[s.host].memoryStream.some(m=>m.content===rumor.claim&&m.eventRumor));
  assert.equal(doc.state.player.coins,s.doc.state.player.coins);
 }
 // Without the player's own material and attendance nothing is used up and no effect lands.
 const s=setup(activeIds[0]),{id,doc}=await hold(s,{join:false});
 assert.notEqual(doc.state.records[id].status,'held');assert.equal(have(doc,s.f.resourceNeeds[0].item),have(s.doc,s.f.resourceNeeds[0].item));
 assert.equal(doc.state.records[id].effects,undefined);
});

test('T108：借用与交换的材料须到场出示但不被用掉；等候主办人的节日不能预约',async()=>{
 const w=structuredClone(world);let f=w.festivals.find(x=>x.id==='festival_steps');
 assert.equal(f.runtime.status,'awaiting_host');
 const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'t108-await');doc.state.location=f.venue.location;
 await assert.rejects(engine.reduce(doc,{tool:'world_settlement',args:{operation:'festival_plan',festival:f.id},eventId:'p'}),/候选节日不可执行|没有已发布/);
 // The now-hosted borrowing festival runs, and the stool is returned.
 f=w.festivals.find(x=>x.id==='festival_borrowbench');
 assert.equal(f.resourceNeeds[0].use,'borrow');assert.equal(f.runtime.status,'active');
 const host=f.runtime.host;assert.equal(host,'npc_bs_076_1');
 for(const n of w.npcs){delete n.schedule;delete n.tier;}
 const e2=new WorldEngine(w),d0=e2.createCharacter(seed,{},'t108-borrow');d0.state.location=f.venue.location;
 Object.assign(d0.state.npcs[host],{location:f.venue.location,status:'正常',activity:'歇工'});d0.state.inventory.item_three_leg_stool={quantity:1};
 const run=async(document,args,eventId,tool='world_settlement')=>applyPatches(document,(await e2.reduce(document,{tool,args,eventId})).patches);
 let d=d0;d.state.minute=((f.calendar.month-1)*30+f.calendar.day-1)*DAY+f.runtime.startMinute-120;
 d=await run(d,{operation:'festival_plan',festival:f.id},'plan');const id=`festival:${f.id}:1`;
 for(const who of [host,'player'])d=await run(d,{operation:'festival_authorize',festival:id,speaker:who,consent:true},`a-${who}`);
 d=await run(d,{operation:'festival_join',festival:id,speaker:'player',consent:true},'j');d.state.npcs[host].location=f.venue.location;
 d=await run(d,{minutes:300},'w','world_time');
 assert.equal(d.state.records[id].status,'held',d.state.records[id].reason);assert.equal(have(d,'item_three_leg_stool'),1);assert.deepEqual(d.state.records[id].consumed,[]);
});

test('W5：季澄按现职在借凳节工作时段到归途殿，平日、改业、迁居与照护仍用原作息',()=>{
 const engine=new WorldEngine(world),f=world.festivals.find(f=>f.id==='festival_borrowbench'),host=f.runtime.host;
 const at=((f.calendar.month-1)*30+f.calendar.day-1)*DAY+f.runtime.startMinute;
 const slot=scheduleAt(engine,host,at);assert.equal(slot.location,f.venue.location);assert.equal(slot.variant,'festival-duty');
 assert.deepEqual(slot.services,[]);assert.equal(slot.start,480);assert.ok(slot.end>=f.runtime.startMinute+f.runtime.durationMinutes);
 assert.equal(scheduleAt(engine,host,at-DAY).location,'bld_bs_temple');
 const state=engine.createCharacter(seed,{},'w5-duty').state,home='bld_bs_home_076';
 state.npcs[host].occupation='抄书';assert.equal(scheduleAt(engine,host,at,state).location,'bld_bs_temple');
 delete state.npcs[host].occupation;
 state.npcs[host].caring={location:home};assert.equal(scheduleAt(engine,host,at,state).location,home);
 delete state.npcs[host].caring;
 state.npcs[host].levy={location:'loc_bs'};assert.equal(scheduleAt(engine,host,at,state).location,'loc_bs');
 delete state.npcs[host].levy;
 state.npcs[host].residence={settlement:'loc_hw',since:0,schedule:{default:[{start:0,end:1440,location:'loc_hw',activity:'灯祠照看',services:[]}]}};
 assert.equal(scheduleAt(engine,host,at,state).location,'loc_hw');
});

test('W5：保持真实作息，从家出发到场主持借凳节，授权、归还与重放均保留',async()=>{
 const engine=new WorldEngine(world),f=world.festivals.find(f=>f.id==='festival_borrowbench'),host=f.runtime.host;
 let doc=engine.createCharacter(seed,{},'w5-natural-host');doc.state.location=f.venue.location;
 doc.state.minute=((f.calendar.month-1)*30+f.calendar.day-1)*DAY+420;doc.state.inventory.item_three_leg_stool={quantity:1};
 const run=async(args,eventId,tool='world_settlement')=>{const out=await engine.reduce(doc,{tool,args,eventId});doc=applyPatches(doc,out.patches);return out;};
 await run({minutes:120},'arrive','world_time');assert.equal(doc.state.npcs[host].location,f.venue.location);
 await run({operation:'festival_plan',festival:f.id,cost:0},'plan');const id=`festival:${f.id}:1`;
 for(const speaker of [host,'player'])await run({operation:'festival_authorize',festival:id,speaker,consent:true},`auth-${speaker}`);
 await run({operation:'festival_join',festival:id,speaker:'player',consent:true},'join');
 const request={tool:'world_time',args:{minutes:150},eventId:'hold'};
 const before=doc,out=await engine.reduce(before,request);doc=applyPatches(before,out.patches);
 assert.equal(doc.state.records[id].status,'held',doc.state.records[id].reason);
 assert.ok(doc.state.records[id].participants.includes(host));assert.equal(have(doc,'item_three_leg_stool'),1);
 const replay=await engine.reduce(before,request,{replay:true,result:out.result});assert.deepEqual(applyPatches(before,replay.patches),doc);
});

test('T108：节日进入公开目录与检索，不暴露主办效果；旧存档升级保留原有变化',()=>{
 const rows=publicLoreEntries(world).filter(r=>r?.category==='festival');
 assert.deepEqual(rows.map(r=>r.id).filter(id=>BATCH.includes(id)).sort(),[...BATCH].sort());
 for(const r of rows){assert.equal(r.runtime,undefined);assert.equal(r.effects,undefined);assert.ok(r.date&&r.venue.location&&r.held);}
 const engine=new WorldEngine(world),doc=engine.createCharacter(seed,{},'t108-catalog');
 assert.equal(engine.resolve('修渠灶饭日'),'festival_ditchmeal');
 const entry=catalogDefinition(engine,doc,{entity:'换芯长夜'});assert.equal(entry.id,'festival_wick');assert.match(entry.held,/暂不举办/);assert.equal(entry.runtime,undefined);
 const old=structuredClone(world);old.festivals=old.festivals.filter(f=>!BATCH.includes(f.id));if(!old.festivals.length)delete old.festivals;
 const oldEngine=new WorldEngine(old);let save=oldEngine.createCharacter(seed,{},'t108-upgrade');
 const villager=Object.keys(save.state.npcs)[0];save.state.npcs[villager].coins=555;save.state.records.t108_marker={category:'note',text:'升级前记录'};
 const next=applyPatches(save,planWorldUpgrade(save,old,world,{worldHash:'t108',eventId:'t108-upgrade'}).patches);
 assert.equal(next.state.npcs[villager].coins,555);assert.deepEqual(next.state.records.t108_marker,save.state.records.t108_marker);
 assert.ok(!Object.values(next.state.records).some(r=>r.category==='festival'),'升级不补造已举办节日');
 const dropped=structuredClone(world);dropped.festivals=dropped.festivals.filter(f=>f.id!=='festival_wick');
 assert.ok(compatibleWorld(world,dropped).world.festivals.some(f=>f.id==='festival_wick'));
});
