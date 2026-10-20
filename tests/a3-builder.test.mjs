import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {sceneLines,actionLines} from '../server-plugin/action-text.mjs';
import {localWeather} from '../server-plugin/weather.mjs';
import {ActionBuilder,builderStep,previewLines} from '../extension/action-builder.mjs';
import {actionCompletion} from '../extension/turn.mjs';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function fixture(){
 const engine=new WorldEngine(world);let document=engine.initialFromLegacy(seed,'a3-builder'),sequence=0,calls=[];
 const services={newEventId:()=> 'builder-buy',
  preview:async(action,slots,eventId)=>{
   calls.push('preview');return {...await engine.previewAction(document,{tool:'world_act',args:{action,slots},eventId}),reference:{sequence},startMinute:document.state.minute};
  },
  act:async(action,slots,{eventId,expectedSequence})=>{
   calls.push('confirm');if(expectedSequence!==sequence)return {ok:false,stale:true,error:'情形已变'};
   try{const reduced=await engine.reduce(document,{tool:'world_act',args:{action,slots},eventId});document=applyPatches(document,reduced.patches);sequence++;return {ok:true,result:reduced.result,lines:[]};}
   catch(error){return {ok:false,error:error.message,lines:[]};}
  }};
 const builder=new ActionBuilder(services),offers=()=>worldActions(engine.scoped(document),document,{target:'林穗'});
 builder.choose(offers().actions.find(a=>a.id==='core:trade.buy'));builder.setSlot('item','item_bread');
 return {engine,builder,calls,offers,get document(){return document;},change:fn=>{fn(document);sequence++;}};
}

test('无模型四步构造：当前对象/物品/做法，重复预览及取消不写世界',async()=>{
 const f=fixture(),before=structuredClone(f.document);
 assert.equal(builderStep({name:'seller',kind:'entity'}),1);assert.equal(builderStep({name:'item',kind:'entity'}),2);assert.equal(builderStep({name:'payment',kind:'choice'}),3);
 assert.equal(f.builder.slots.seller,'npc_hw_linsui');assert.equal(f.builder.slots.quantity,1);
 await f.builder.preview();await f.builder.preview();
 assert.deepEqual(f.document,before);assert.deepEqual(f.calls,['preview','preview']);
 const lines=previewLines(f.builder.quote.result,{label:'买东西',startMinute:before.state.minute});
 assert.ok(lines.includes('费用：2文'));assert.ok(lines.includes('耗时：5分钟'));
 f.builder.cancel();assert.equal(await f.builder.confirm(),null);assert.deepEqual(f.document,before);
});

test('显式确认才实际扣款得货，执行使用预览事件编号；确认按钮不可重复提交',async()=>{
 const f=fixture(),coins=f.document.state.player.coins,minute=f.document.state.minute;
 f.builder.setSlot('quantity',2);const quote=await f.builder.preview();assert.equal(quote.eventId,'builder-buy');
 const result=await f.builder.confirm();assert.equal(result.ok,true);
 assert.equal(f.document.state.player.coins,coins-4);assert.equal(f.document.state.inventory.item_bread.quantity??f.document.state.inventory.item_bread,2);
 assert.equal(f.document.state.minute,minute+5);assert.equal(await f.builder.confirm(),null);assert.deepEqual(f.calls,['preview','confirm']);
});

test('余额或情形已变时不使用旧预览；重新预览仍走真实余额校验',async()=>{
 const f=fixture();await f.builder.preview();f.change(d=>{d.state.player.coins=0;});const before=structuredClone(f.document);
 assert.equal((await f.builder.confirm()).stale,true);assert.equal(f.builder.quote,null);assert.deepEqual(f.document,before);
 await f.builder.preview();assert.equal(f.builder.quote,null);assert.match(f.builder.error,/不足|不够|钱/);assert.deepEqual(f.document,before);
});

test('选择改变后旧预览失效；旧目标货物不会沿用到另一个对象',async()=>{
 const f=fixture();await f.builder.preview();f.builder.setSlot('quantity',3);assert.equal(f.builder.quote,null);assert.equal(await f.builder.confirm(),null);
 const action=structuredClone(f.builder.action);action.slots.find(s=>s.name==='item').options=[];f.builder.refresh(action);
 assert.equal(f.builder.slots.item,undefined);assert.equal(await f.builder.preview(),null);assert.match(f.builder.error,/物品/);
});

test('动态实体选项仅含可及人物、出路与持有物，不暴露离屏人物',()=>{
 const f=fixture(),search=worldActions(f.engine.scoped(f.document),f.document,{query:'core:combat'}).actions.find(a=>a.id==='core:combat');
 const people=worldActions(f.engine.scoped(f.document),f.document).objects.people;
 assert.deepEqual(search.slots.find(s=>s.name==='target').options.map(o=>o.value),people.map(p=>p.id));
 const weapons=search.slots.find(s=>s.name==='weapon').options;
 assert.ok(weapons.every(o=>Object.hasOwn(f.document.state.inventory,o.value)));
 assert.equal('outcomes' in search,false);assert.equal('call' in search,false);
 const remote=Object.keys(f.document.state.npcs).find(id=>f.document.state.npcs[id].location!==f.document.state.location);
 assert.ok(remote);
 const offered=worldActions(f.engine.scoped(f.document),f.document,{query:'core:trade.buy',target:remote});
 assert.equal(offered.target,undefined);
 const buy=offered.actions.find(a=>a.id==='core:trade.buy');assert.equal(buy.fill.seller,undefined);assert.deepEqual(buy.slots.find(s=>s.name==='item').options,[]);
});

test('D08 模板昼夜直接使用本地 weather.daylight',()=>{
 const f=fixture();for(const minute of [720,1200]){
  const document=structuredClone(f.document);document.state.minute=minute;
  const weather=localWeather(f.engine,document),header=sceneLines(f.engine,document)[0];assert.ok(weather);
  assert.ok(header.includes(weather.daylight?'白昼':'夜色已暗'));
 }
});

test('pending 不展示为成功；对抗失败回执不叙述成功，效果仍来自实际状态',()=>{
 assert.deepEqual(actionCompletion({result:{ok:true,receipt:{status:'pending'}}}),{ok:false,pending:true,error:'行动仍在等待裁决，尚未完成'});
 const f=fixture(),args={engine:f.engine,action:{label:'推开对方',group:'战斗'},before:f.document,after:f.document,args:{},result:{receipt:{status:'committed',check:{success:false},applied:[],narrate:{must:[],mustNot:[{op:'move'}]}}}};
 const lines=actionLines(args);assert.match(lines.lines[0],/未能达到预期/);assert.deepEqual(lines.effects,[]);
 assert.deepEqual(actionLines({...args,result:{receipt:{status:'pending'}}}),{lines:['行动仍在等待裁决，尚未完成。'],effects:[]});
});

test('真实 HTTP 两阶段：预览不写存档，确认写一次，重放幂等，旧序列拒绝且不扣款',async t=>{
 const server=await createPlaytestServer({world,consistencyEnabled:false});t.after(()=>server.close());
 const {reference}=await server.api('create',{}),campaignId=reference.campaignId;
 const read=()=>server.api('read',{campaignId}),before=await read();
 const menu=await server.api('actions',{campaignId,target:'林穗'}),action=menu.actions.find(a=>a.id==='core:trade.buy');
 const builder=new ActionBuilder({newEventId:()=> 'a3-builder-http',
  preview:async(action,slots,eventId)=>({...await server.api('propose',{campaignId,args:{action,slots},eventId}),startMinute:before.document.state.minute}),
  act:async(action,slots,{eventId,expectedSequence})=>{
   const out=await server.api('execute',{campaignId,tool:'world_act',args:{action,slots},eventId,expectedSequence,anchor:null});return {ok:true,result:out.result,lines:out.narration.lines};
  }});
 builder.choose(action);builder.setSlot('item','item_bread');await builder.preview();assert.ok(builder.quote);
 assert.deepEqual((await read()).document,before.document);assert.equal((await read()).reference.sequence,before.reference.sequence);
 const quote=builder.quote;assert.equal((await builder.confirm()).ok,true);const after=await read();
 assert.equal(after.document.state.player.coins,before.document.state.player.coins-2);assert.equal(after.reference.sequence,before.reference.sequence+1);
 const retry=await server.api('execute',{campaignId,tool:'world_act',args:quote.args,eventId:quote.eventId,anchor:null});assert.equal(retry.duplicate,true);assert.deepEqual((await read()).document,after.document);
 await assert.rejects(server.api('execute',{campaignId,tool:'world_act',args:quote.args,eventId:'a3-builder-stale',expectedSequence:before.reference.sequence,anchor:null}));
 assert.deepEqual((await read()).document,after.document);
});
