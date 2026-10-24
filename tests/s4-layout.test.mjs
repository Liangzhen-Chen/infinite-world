import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {translateCall} from '../server-plugin/action-gateway.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {placeLayout,layoutView,zoneOf,localRoute} from '../server-plugin/place-layout.mjs';
import {createRoutingContext} from '../server-plugin/action-router.mjs';
import {nextNpcService} from '../server-plugin/npc-schedule.mjs';
import {actionLines} from '../server-plugin/action-text.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
let serial=0;
async function act(f,action,slots){
 const call=translateCall('world_act',{action,slots});
 const out=await f.engine.reduce(f.document,{tool:call.tool,args:call.args,eventId:`s401-${++serial}`});
 assert.notEqual(out.result.receipt?.status,'rejected',JSON.stringify(out.result.receipt));
 f.document=applyPatches(f.document,out.patches);return out.result;
}
const journey={engine:new WorldEngine(world)};journey.document=journey.engine.initialFromLegacy(seed,'s401');
await act(journey,'core:move',{destination:'bld_bs_reed_dao',mode:'walk'});
const fixture=()=>({engine:new WorldEngine(world),document:structuredClone(journey.document)});

test('target:I30 地点菜单的分区可经真实 move 到达，逐段耗时，读取不写站位',async()=>{
 const f=fixture(),before=structuredClone(f.document),menu=worldActions(f.engine.scoped(f.document),f.document);
 assert.deepEqual(f.document,before);
 const layout=placeLayout(f.engine,f.document);
 assert.equal(zoneOf(f.engine,f.document).id,layout.entry);
 const choice=menu.objects.exits.find(e=>e.id==='zone_reed_side');assert.ok(choice?.zone);
 const minute=f.document.state.minute,result=await act(f,'core:move',{destination:choice.id,mode:'walk'});
 assert.equal(result.arrived,true);assert.deepEqual(result.path,['zone_reed_entry','zone_reed_side']);
 assert.equal(f.document.state.minute-minute,1);assert.equal(result.metres,6);
 const after=worldActions(f.engine.scoped(f.document),f.document);
 assert.equal(after.location.zone,choice.id);assert.ok(after.scene.some(line=>line.includes('所在分区')&&line.includes('观门侧廊')));
 assert.equal(createRoutingContext(f.engine,f.document).resolveDestination?.('观内院地')?.value,'zone_reed_court');
});

test('target:I30 跨非邻接分区沿邻接走，不以精细坐标直线距离计时',async()=>{
 const f=fixture();await act(f,'core:move',{destination:'zone_reed_scripture',mode:'walk'});
 assert.equal(zoneOf(f.engine,f.document).id,'zone_reed_scripture');
 const minute=f.document.state.minute,result=await act(f,'core:move',{destination:'zone_reed_side',mode:'walk'});
 assert.deepEqual(result.path,['zone_reed_scripture','zone_reed_court','zone_reed_side']);
 assert.equal(result.metres,12);assert.equal(f.document.state.minute-minute,2);
});

test('target:I30 真实旧阵残隙阻断直路，移动沿经阁外绕行并支付完整路程',async()=>{
 const f=fixture();await act(f,'core:move',{destination:'zone_reed_court',mode:'walk'});
 const before=f.document.state.minute,result=await act(f,'core:move',{destination:'zone_reed_rift_south',mode:'walk'});
 assert.equal(result.arrived,true);
 assert.deepEqual(result.path,['zone_reed_court','zone_reed_scripture','zone_reed_rift_south']);
 assert.equal(result.metres,18);assert.equal(f.document.state.minute-before,2);
 assert.equal(zoneOf(f.engine,f.document).id,'zone_reed_rift_south');
});

test('target:I30 真实锁闭经阁门不允许直穿，失败不扣时间或改位置',async()=>{
 const f=fixture();await act(f,'core:move',{destination:'zone_reed_scripture',mode:'walk'});
 const before=structuredClone(f.document),call=translateCall('world_act',{action:'core:move',slots:{destination:'zone_reed_library',mode:'walk'}});
 // world_move's established legacy boundary reports domain failures by throwing;
 // retain both the exact reason code and complete document immutability checks.
 await assert.rejects(f.engine.reduce(f.document,{tool:call.tool,args:call.args,eventId:'s401-locked'}),error=>error.code==='E-MOVE-PATH');
 assert.deepEqual(f.document,before);
 const menu=worldActions(f.engine.scoped(f.document),f.document),zone=menu.objects.zones.find(z=>z.id==='zone_reed_library');
 assert.equal(zone.reachable,false);assert.ok(menu.scene.some(line=>line.includes('经阁')&&line.includes('通道受阻')));
 assert.equal(menu.objects.exits.find(z=>z.id===zone.id).permission.allowed,false);
});

test('target:I30 地点菜单提交同一 world_act 接口，命名提案移动与重放保持站位',async()=>{
 const f=fixture(),input={tool:'world_act',eventId:'s401-menu-act',args:{action:'core:move',slots:{destination:'zone_reed_side',mode:'walk'}}};
 const before=structuredClone(f.document),first=await f.engine.reduce(f.document,input);
 assert.equal(first.result.arrived,true);f.document=applyPatches(f.document,first.patches);
 const narration=actionLines({engine:f.engine,action:translateCall('world_act',input.args).action,before,after:f.document,args:input.args.slots,result:first.result});
 assert.ok(narration.lines.some(line=>line.includes('观门侧廊')));assert.ok(narration.lines.every(line=>!line.includes('zone_reed_side')));
 const replay=await new WorldEngine(world).reduce(before,input,{replay:true,result:first.result});
 assert.deepEqual(applyPatches(before,replay.patches),f.document);
 const moved=await f.engine.reduce(f.document,{tool:'world_propose',eventId:'s401-named',args:{intent:'走到观内院地',effects:[{op:'move',entity:'player',to:'观内院地',mode:'walk'}]}});
 assert.equal(moved.result.receipt.status,'committed');
 f.document=applyPatches(f.document,moved.patches);assert.equal(zoneOf(f.engine,f.document).id,'zone_reed_court');
});

test('target:I30 离开地点先沿分区邻接到出口，回执耗时包括地点内路程',async()=>{
 const f=fixture();await act(f,'core:move',{destination:'zone_reed_scripture',mode:'walk'});
 const before=f.document.state.minute,destination='loc_bs_dongxue',route=f.engine.route(f.document.state.location,destination,'walk',before,f.document.randomSeed);
 const result=await act(f,'core:move',{destination,mode:'walk'});
 assert.equal(f.document.state.location,destination);assert.equal(result.minutes,route.minutes+2);
 assert.equal(f.document.state.minute-before,result.minutes);
 assert.equal(f.document.state.records.local_player_position,undefined);
 assert.equal(zoneOf(f.engine,f.document).id,placeLayout(f.engine,f.document).entry);
});

test('target:I30 NPC 原生移动目标推导站位，作息切换后按活动重新推导',async()=>{
 // The legacy import contains only its original acquaintances; official new
 // character creation supplies the published population without fixture grants.
 const f={engine:new WorldEngine(world)},npc='npc_bs_077_1';
 f.document=f.engine.createCharacter(seed,{name:'行路人'},'s401-npc');
 await act(f,'core:move',{destination:'bld_bs_reed_dao',mode:'walk'});
 const next=nextNpcService(f.engine,npc,f.document.state.minute,'teach',f.document.state);
 assert.ok(next);await act(f,'core:time',{minutes:next.minute-f.document.state.minute+10});
 assert.equal(f.document.state.npcs[npc].location,'bld_bs_reed_dao','按真实作息等待师傅到观内');
 const engine=f.engine.scoped(f.document),d=engine.primitiveDraft(f.document);
 // Exercise the production NPC move primitive used by scheduled actions; no
 // fixture writes a zone, position, contact proof, schedule or activity.
 const result=engine.primitiveMoveNpc(d,{entity:npc,destination:'zone_reed_side',mode:'walk'},'s401-npc-walk');
 assert.equal(result.arrived,true);f.document=applyPatches(f.document,d.patches);
 assert.equal(zoneOf(f.engine,f.document,npc).id,'zone_reed_side');
 assert.equal(f.document.state.npcs[npc].zone,undefined);
 const until=f.document.state.records[`local_actor_position:${npc}`].until;
 await act(f,'core:time',{minutes:until-f.document.state.minute+1});
 assert.notEqual(zoneOf(f.engine,f.document,npc)?.id,'zone_reed_side');
});

test('target:I30 同分区仍须真实走近对象；走近后保留原所有者许可保护',async()=>{
 const f=fixture();await act(f,'core:move',{destination:'zone_reed_court',mode:'walk'});
 const d=f.engine.primitiveDraft(f.document);
 assert.equal(f.engine.primitiveTargetFacts(d,'player','feature_s2_water_jar').distanceMeters,Infinity);
 const minute=f.document.state.minute;
 const result=await act(f,'core:environment.approach',{target:'feature_s2_water_jar'});
 assert.equal(result.arrived,true);assert.ok(f.document.state.minute>minute);
 assert.equal(f.document.state.records.local_player_position.anchor,'feature_s2_water_jar');
 assert.equal(f.document.state.records.local_player_position.zoneOnly,undefined);
 assert.equal(f.engine.primitiveTargetFacts(f.engine.primitiveDraft(f.document),'player','feature_s2_water_jar').distanceMeters,0);
 const before=structuredClone(f.document),call=translateCall('world_act',{action:'core:environment.draw_water',slots:{source:'feature_s2_water_jar',container:'item_clay_pot',millilitres:100}});
 await assert.rejects(f.engine.reduce(f.document,{tool:call.tool,args:call.args,eventId:'s401-private-water'}),error=>error.code==='E-ACTION-OWNER-AUTHORITY');
 assert.deepEqual(f.document,before,'到场、同区和真实走近都不授予物件所有者许可');
});

test('target:I30 缺省布局来自已发布物件，种子与状态相同即相同，不生成世界内容',()=>{
 const a=journey.engine.initialFromLegacy(seed,'layout-repeat'),b=structuredClone(a),old=structuredClone(a);
 assert.deepEqual(layoutView(journey.engine,a),layoutView(journey.engine,b));
 assert.deepEqual(a,old);const layout=placeLayout(journey.engine,a);
 assert.ok(layout.generated);assert.ok(layout.zones.some(z=>z.features?.includes('feature_hw_kitchen_bucket')));
 for(const zone of layout.zones)assert.ok(localRoute(journey.engine,a,layout.entry,zone.id,{layout}));
});
