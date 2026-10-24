import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {perceives,eventPerception,visibleEntity,perceptionTargetFacts} from '../server-plugin/perception.mjs';
import {placeLayout,zoneOf} from '../server-plugin/place-layout.mjs';
import {areaTargetFacts} from '../server-plugin/magic-area.mjs';
import {publishTransitionEvent,knownWorldEventReference} from '../server-plugin/world-events.mjs';
import {sceneLines} from '../server-plugin/action-text.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {nextNpcService} from '../server-plugin/npc-schedule.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {npcRumors} from '../server-plugin/npc-rumors.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {lightAt} from '../server-plugin/magic-light.mjs';
import {weatherAt} from '../server-plugin/weather.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const NPC='npc_bs_077_1',INN='bld_hw_qingdeng';
let serial=0;
async function act(f,action,slots,eventId=`s402-${++serial}`){
 const input={tool:'world_act',args:{action,slots},eventId},before=f.document;
 const out=await f.engine.reduce(before,input);
 assert.notEqual(out.result.receipt?.status,'rejected',JSON.stringify(out.result));
 f.document=applyPatches(before,out.patches);return {...out,input,before};
}
function moveNpc(f,id,destination){
 const engine=f.engine.scoped(f.document),d=engine.primitiveDraft(f.document);
 const result=engine.primitiveMoveNpc(d,{entity:id,destination,mode:'walk'},`s402-npc-${++serial}`);
 assert.equal(result.arrived,true);f.document=applyPatches(f.document,d.patches);
}
const journey={engine:new WorldEngine(world)};
journey.document=journey.engine.createCharacter(seed,{name:'观路人'},'s402');
await act(journey,'core:move',{destination:'bld_bs_reed_dao',mode:'walk'});
const next=nextNpcService(journey.engine,NPC,journey.document.state.minute,'teach',journey.document.state);
assert.ok(next);await act(journey,'core:time',{minutes:next.minute-journey.document.state.minute+10});
assert.equal(journey.document.state.npcs[NPC].location,'bld_bs_reed_dao');
const fixture=()=>({engine:new WorldEngine(world),document:structuredClone(journey.document)});
// These three cases require actual darkness, independent of the ordinary
// occupied-room lighting rule. Explicitly unlit premises retain that premise.
const darkInn=seedName=>{
 const dark=structuredClone(world),place=dark.locations.find(l=>l.id===INN);
 place.features.push({id:'feature_s402_unlit_lamp',name:'熄灭的室灯',kind:'lamp',owner:'npc_hw_linsui',access:'consent',position:[0,0],state:{emissionLuxAt1m:10,lit:false}});
 const engine=new WorldEngine(dark);return {engine,document:engine.initialFromLegacy(seed,seedName)};
};
const event=f=>({verb:'harm',actor:NPC,location:f.document.state.location});

test('I30 真实分区移动提供视距；看见不产生接触或区域法术坐标',async()=>{
 const f=fixture();moveNpc(f,NPC,'zone_reed_side');
 await act(f,'core:move',{destination:'zone_reed_entry',mode:'walk'});
 assert.equal(zoneOf(f.engine,f.document,NPC).id,'zone_reed_side');
 const p=perceives(f.engine,f.document,'player',event(f));
 assert.equal(p.visual,true);assert.equal(p.distanceMeters,6);
 const facts=f.engine.primitiveTargetFacts(f.engine.primitiveDraft(f.document),'player',NPC);
 assert.equal(facts.lineOfSight,true);assert.equal(facts.distanceMeters,6);
 assert.equal(areaTargetFacts(f.engine.primitiveDraft(f.document),f.engine,NPC,f.document.state.location),null);
 await act(f,'core:move',{destination:'zone_reed_side',mode:'walk'});
 assert.equal(perceptionTargetFacts(f.engine,f.document,'player',NPC).distanceMeters,6,'同区仍不等于伸手可及');
 assert.equal(areaTargetFacts(f.engine.primitiveDraft(f.document),f.engine,NPC,f.document.state.location),null);
});

test('I30 同刻的感知查询是只读且确定的，角色离开地点后不可见',async()=>{
 const f=fixture(),before=structuredClone(f.document),e=event(f);
 const a=eventPerception(f.engine,f.document,e);
 assert.deepEqual(eventPerception(new WorldEngine(world),JSON.parse(JSON.stringify(f.document)),e),a);
 assert.deepEqual(f.document,before);
 await act(f,'core:move',{destination:'loc_bs_dongxue',mode:'walk'});
 assert.equal(visibleEntity(f.engine,f.document,NPC),false);
});

test('I30 night 真实等待入夜后只听见声音；知识与菜单均不泄漏声音来源身份',async()=>{
 const f=darkInn('s402-night');
 assert.equal(f.document.state.location,INN);
 const id='npc_hw_linsui',day=perceives(f.engine,f.document,id,{verb:'harm',actor:'player',location:INN});
 assert.equal(day.visual,true);
 // Published reception ends at 1260; the explicitly unlit room stays dark.
 const wait=(1200-f.document.state.minute%1440+1440)%1440;
 await act(f,'core:time',{minutes:wait});
 const p=perceives(f.engine,f.document,id,{verb:'harm',actor:'player',location:INN});
 assert.equal(p.visual,false);assert.equal(p.auditory,true);assert.equal(p.identified,false);
 const engine=f.engine.scoped(f.document),d=engine.primitiveDraft(f.document);
 publishTransitionEvent(d,engine,{id:'s402-noise',verb:'harm',actor:id,target:'player',harm:0,location:INN,minute:f.document.state.minute,tags:['violence']});
 f.document=applyPatches(f.document,d.patches);
 const known=f.document.state.records['perception:s402-noise:player'];
 assert.ok(known);assert.equal(known.complete,false);assert.deepEqual(known.participants,[]);
 assert.equal(knownWorldEventReference(f.document.state,'player',{reference:'s402-noise'}),null);
 const menu=worldActions(f.engine.scoped(f.document),f.document);
 assert.ok(!menu.objects.people.some(n=>n.id===id));
 assert.ok(menu.scene.some(s=>s.includes('听不清是谁')));
 assert.ok(!menu.scene.some(s=>s.includes('林穗')));
 const card=f.engine.scene(f.document,'');
 assert.match(card,/【听见】/);assert.ok(!card.includes('林穗（npc_hw_linsui）｜'));
 assert.deepEqual(auditLedger(f.document.ledger),[]);
});

test('I30 按真实作息等待睡眠者，睡眠与异地观察者不产生见证',async()=>{
 const f=fixture();
 await act(f,'core:time',{minutes:(1380-f.document.state.minute%1440+1440)%1440});
 const sleepers=Object.entries(f.document.state.npcs).filter(([,n])=>/睡眠|熟睡|睡觉/.test(n.activity??''));
 assert.ok(sleepers.length>0,'必须由实际日程形成睡眠前提');
 for(const [id,n]of sleepers){
  const e={verb:'harm',actor:id,location:n.location};
  const p=perceives(f.engine,f.document,id,e);
  assert.equal(p.visual,false);assert.equal(p.auditory,false);assert.equal(p.tactile,false);
 }
});

test('I30 touch 夜间真实走到玩家身边建立接触；证据到期后不再凭同区认出行为者',async()=>{
 const f=darkInn('s402-touch');
 await act(f,'core:time',{minutes:(1200-f.document.state.minute%1440+1440)%1440});
 const id='npc_hw_linsui',layout=placeLayout(f.engine,f.document);
 moveNpc(f,id,layout.entry);moveNpc(f,id,'player');
 const e={verb:'steal',actor:'player',target:id,location:INN,volume:0};
 const contact=perceives(f.engine,f.document,id,e);
 assert.equal(contact.visual,false);assert.equal(contact.auditory,false);
 assert.equal(contact.tactile,true);assert.equal(contact.identified,true);
 await act(f,'core:time',{minutes:11});
 const expired=perceives(f.engine,f.document,id,e);
 assert.equal(expired.tactile,false);assert.equal(expired.identified,false);
});

test('I30 heard-theft 真实夜间偷窃只留下声音版本，不能升级成身份、证词或传闻',async()=>{
 const f=darkInn('s402-heard');
 await act(f,'core:time',{minutes:(1200-f.document.state.minute%1440+1440)%1440});
 const {result,before}=await act(f,'core:crime.steal',{target:'npc_hw_linsui',coins:10},'s402-heard-theft');
 const e=f.document.state.records['world_event:s402-heard-theft'],incident=f.document.state.records[result.case];
 const listeners=Object.entries(e.perception.versions).filter(([,v])=>v.auditory&&!v.identified);
 assert.ok(listeners.length>0,'固定 seed 必须真的留下只听见的观察者');
 for(const [id,v]of listeners){
  assert.equal(v.visual,false);assert.ok(!e.witnesses.includes(id));
  assert.ok(!incident.evidence.some(r=>r.witness===id));
  assert.ok(!(f.document.state.npcs[id].memoryStream??[]).some(m=>m.sourceEvent===e.id));
  assert.equal(knownWorldEventReference(f.document.state,id,{reference:e.id}),null);
  assert.equal(f.document.state.records[`perception:${e.id}:${id}`].complete,false);
  assert.equal(standing(f.engine,f.document.state,id,'player'),standing(f.engine,before.state,id,'player'));
  assert.ok(!npcRumors(f.engine,id,f.document).some(r=>r.id===`rumor_event:${e.id}`));
 }
 assert.equal(knownWorldEventReference(f.document.state,'player',{reference:e.id}),e.id,'行为者自知保留');
});

test('I30 native 原生事件的感知版本参与重放；旧回放不补写新证据',async()=>{
 const f={engine:new WorldEngine(world)};f.document=f.engine.initialFromLegacy(seed,'s402-native');
 const {before,input,result}=await act(f,'open:question',{target:'npc_hw_linsui',content:'今天店里忙吗？'},'s402-question');
 const events=Object.values(f.document.state.records).filter(r=>r.category==='world_event'&&r.id.startsWith('s402-question'));
 assert.ok(events.length>0);assert.ok(events.every(e=>e.perception));
 const replay=await new WorldEngine(world).reduce(before,input,{replay:true,result});
 assert.deepEqual(applyPatches(before,replay.patches),f.document);
 const oldResult={...result};delete oldResult.perceptionVersion;
 const oldReplay=await new WorldEngine(world).reduce(before,input,{replay:true,result:oldResult});
 const old=applyPatches(before,oldReplay.patches);
 assert.ok(Object.values(old.state.records).filter(r=>r.category==='world_event'&&r.id.startsWith('s402-question')).every(e=>!e.perception));
});

test('I30 真偷窃的见证和感官版本一致；保存与重放不重算证据',async()=>{
 const f={engine:new WorldEngine(world)};f.document=f.engine.initialFromLegacy(seed,'s402-theft');
 const {before,input,result}=await act(f,'core:crime.steal',{target:'npc_hw_linsui',coins:10},'s402-theft');
 assert.equal(result.perceptionVersion,1);
 const e=f.document.state.records['world_event:s402-theft'];assert.ok(e?.perception);
 assert.equal(e.perception.minute,e.minute);
 assert.deepEqual(e.witnesses,result.witnesses);
 const incident=f.document.state.records[result.case];assert.ok(incident);
 assert.deepEqual(incident.witnesses,e.witnesses);
 for(const witness of e.witnesses)assert.equal(e.perception.versions[witness].identified,true);
 assert.equal(f.document.state.player.coins-before.state.player.coins,before.state.npcs.npc_hw_linsui.coins-f.document.state.npcs.npc_hw_linsui.coins);
 assert.deepEqual(auditLedger(f.document.ledger),[]);
 const saved=JSON.parse(JSON.stringify(f.document));
 assert.deepEqual((await new WorldEngine(world).reduce(saved,input)).patches,[]);
 const replay=await new WorldEngine(world).reduce(before,input,{replay:true,result});
 assert.deepEqual(applyPatches(before,replay.patches),f.document);
 await act(f,'core:time',{minutes:800});
 assert.deepEqual(f.document.state.records['world_event:s402-theft'].perception,e.perception);
 assert.deepEqual(f.document.state.records[result.case].evidence,incident.evidence);
});

test('I30 地点菜单和场景文字采用同一感知来源，读取不改变站位',()=>{
 const f=fixture(),before=structuredClone(f.document),menu=worldActions(f.engine.scoped(f.document),f.document);
 const expected=Object.keys(f.document.state.npcs).filter(id=>visibleEntity(f.engine,f.document,id)).sort();
 assert.deepEqual(menu.objects.people.map(p=>p.id).sort(),expected);
 const lines=sceneLines(f.engine,f.document);assert.ok(lines.some(s=>s.includes('所在分区')));
 assert.equal(placeLayout(f.engine,f.document).location,f.document.state.location);
 assert.deepEqual(f.document,before);
});

test('I30 occupied-inn 夜间营业照明由实际在岗派生；不会照明术也能看见店主并交易',async()=>{
 // A building remains indoors even if an older climate list omitted it.
 const w=structuredClone(world);for(const r of w.rules.weather.regions)r.indoor=r.indoor.filter(id=>id!==INN);
 const f={engine:new WorldEngine(w)};f.document=f.engine.createCharacter(seed,{},'s402-occupied-inn');
 assert.deepEqual(f.document.state.spells,{});
 await act(f,'core:move',{destination:INN,mode:'walk'});
 await act(f,'core:time',{minutes:(1200-f.document.state.minute%1440+1440)%1440});
 const before=structuredClone(f.document),id='npc_hw_linsui';
 assert.equal(visibleEntity(f.engine,f.document,id),true);
 const menu=worldActions(f.engine.scoped(f.document),f.document,{target:id});
 assert.ok(menu.actions.some(a=>a.id==='core:trade.buy'));
 assert.ok(menu.actions.find(a=>a.id==='core:trade.buy').slots.find(s=>s.name==='item').options.some(o=>o.value==='item_bread'),'室内有实际照明，公开商品也可辨认');
 const {result}=await act(f,'core:trade.buy',{seller:id,item:'item_bread',quantity:1});
 assert.equal(before.state.player.coins-f.document.state.player.coins,result.cost);
 assert.equal(f.document.state.npcs[id].coins-before.state.npcs[id].coins,result.cost);
 assert.equal(f.document.state.inventory.item_bread.quantity,(before.state.inventory.item_bread?.quantity??0)+1);
 assert.deepEqual(f.document.state.spells,{});
 assert.deepEqual(auditLedger(f.document.ledger),[]);
 await act(f,'open:question',{target:id,content:'请问店里还营业吗？'});
});

test('I30 unoccupied-and-outdoors 空屋没有派生灯光；真实走到无月光野外仍不能看清远处人物',async()=>{
 const f={engine:new WorldEngine(world)};f.document=f.engine.initialFromLegacy(seed,'s402-outdoors');
 const location='loc_hw_dock',id='npc_hw_linsui';
 await act(f,'core:move',{destination:location,mode:'walk'});
 let night=Math.floor(f.document.state.minute/1440)*1440+1200;
 while(night<=f.document.state.minute||weatherAt(f.engine,f.document.randomSeed,location,night).kind==='clear')night+=1440;
 await act(f,'core:time',{minutes:night-f.document.state.minute});
 const engine=f.engine.scoped(f.document),d=engine.primitiveDraft(f.document);
 engine.primitiveMoveNpc(d,{entity:id,destination:location,mode:'walk'},'s402-walk-outside');
 f.document=applyPatches(f.document,d.patches);
 const layout=placeLayout(f.engine,f.document),away=layout.zones.find(z=>z.id!==layout.entry);
 assert.ok(away);moveNpc(f,id,away.id);
 const p=perceives(f.engine,f.document,'player',{actor:id,location,volume:20});
 assert.ok(p.distanceMeters>0);assert.equal(p.visual,false);assert.equal(p.identified,false);
 assert.equal(weatherAt(f.engine,f.document.randomSeed,location,f.document.state.minute).daylight,false);
 const empty=world.locations.find(l=>l.id.startsWith('bld_')&&weatherAt(f.engine,f.document.randomSeed,l.id,f.document.state.minute)?.indoors&&!l.lighting&&!(l.features??[]).some(r=>r.kind==='lamp'||r.state?.emissionLuxAt1m!==undefined)&&
  !Object.values(f.document.state.npcs).some(n=>n.location===l.id));
 assert.ok(empty,'世界中须有实际无人建筑');
 const read={document:f.document,get:(...path)=>path.reduce((v,k)=>v?.[k],f.document)};
 assert.equal(lightAt(read,f.engine,empty.id,[0,0]).lux,0);
 assert.deepEqual(auditLedger(f.document.ledger),[]);
});
