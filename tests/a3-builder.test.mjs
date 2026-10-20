import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {sceneLines,actionLines,loadTemplates} from '../server-plugin/action-text.mjs';
import {localWeather} from '../server-plugin/weather.mjs';
import {ActionBuilder,builderStep,previewLines,findBuilderActions,builderSlotSchema} from '../extension/action-builder.mjs';
import {canAct} from '../server-plugin/action-capacity.mjs';
import {openHoldings} from '../server-plugin/holdings.mjs';
import {primitiveActionRuntime} from '../server-plugin/primitives.mjs';
import {actionCompletion,actionNarrationContract,toolResultWithClock} from '../extension/turn.mjs';
import {consistencyReviewRequest} from '../server-plugin/consistency-review.mjs';
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

test('钟点等待通过构造器预览和确认，预览不推进，确认只到指定钟点',async()=>{
 const f=fixture(),start=f.document.state.minute,until=start+75;
 const action=worldActions(f.engine.scoped(f.document),f.document,{query:'core:time'}).actions.find(a=>a.id==='core:time');
 f.builder.choose(action);f.builder.setSlot('until',{dayOffset:Math.floor(until/1440)-Math.floor(start/1440),hour:Math.floor(until%1440/60),minute:until%60});
 const before=structuredClone(f.document);await f.builder.preview();assert.ok(f.builder.quote);assert.deepEqual(f.document,before);
 assert.equal((await f.builder.confirm()).ok,true);assert.equal(f.document.state.minute,until);
});

test('多人和持有单件选项为动态数组，换目标后失效选择移除，选账自动填实际债权人',()=>{
 const f=fixture(),offers=worldActions(f.engine.scoped(f.document),f.document,{query:'core:craft'}).actions;
 const craft=offers.find(a=>a.slots.some(s=>s.name==='helpers'));
 const helpers=craft.slots.find(s=>s.name==='helpers'),people=worldActions(f.engine.scoped(f.document),f.document).objects.people;
 assert.equal(helpers.multiple,true);assert.deepEqual(helpers.options.map(o=>o.value),people.map(p=>p.id));
 f.builder.choose(craft);const selected=helpers.options.slice(0,2).map(o=>o.value);assert.equal(selected.length,2);f.builder.setSlot('helpers',selected);
 const refreshed=structuredClone(craft);refreshed.slots.find(s=>s.name==='helpers').options=helpers.options.slice(1);
 f.builder.refresh(refreshed);assert.deepEqual(f.builder.slots.helpers,selected.slice(1));assert.equal(builderStep(helpers),1);
 f.builder.choose({id:'debt',slots:[{name:'debt',options:[{value:'debt_a',fill:{seller:'npc_creditor'}}]},{name:'seller'}]});
 f.builder.setSlot('debt','debt_a');assert.equal(f.builder.slots.seller,'npc_creditor');
 const trade=worldActions(f.engine.scoped(f.document),f.document,{query:'core:trade'}).actions.find(a=>a.slots.some(s=>s.name==='instances'));
 assert.equal(trade.slots.find(s=>s.name==='instances').multiple,true);assert.deepEqual(trade.slots.find(s=>s.name==='instances').options,[]);
});

test('非完成回执不会被前端或模板写成成功；审查和模型工具读取同一原语约束',()=>{
 const f=fixture(),effect={op:'move',index:0,to:'loc_unreached'};
 for(const status of ['pending','preview','rejected','not_submitted']){
  const receipt={eventId:'contract',status,applied:[effect],narrate:{must:[{op:'move',index:0}],mustNot:[{op:'move',index:0}]},reason:'未能通过裁决'};
  const result={ok:true,receipt},contract=actionNarrationContract(result);
  assert.equal(actionCompletion({result}).ok,false);assert.deepEqual(contract.applied,[]);assert.deepEqual(contract.must,[]);assert.deepEqual(contract.mustNot,receipt.narrate.mustNot);
  const projected=actionLines({engine:f.engine,action:{label:'移动'},before:f.document,after:f.document,args:{},result});assert.deepEqual(projected.effects,[]);assert.ok(!projected.lines.some(s=>/你移动到了|你已抵达/.test(s)));
 }
 const receipt={eventId:'contract',status:'committed',routed:'test:move',applied:[effect],narrate:{must:[{op:'move',index:0}],mustNot:[{op:'vital',index:1}]},check:{success:false}};
 const result={ok:true,receipt},tool=toolResultWithClock(result,{startMinute:2,minute:3});
 assert.deepEqual(tool.narrationContract.applied,[effect]);assert.deepEqual(tool.narrationContract.mustNot,receipt.narrate.mustNot);
 const request=consistencyReviewRequest({draft:'你停在原地。',playerText:'试着移动',before:f.document,after:f.document,receipts:[{tool:'world_act',result}]});
 const evidence=JSON.parse(request.messages[1].content).evidence.find(e=>e.kind==='action-contract');assert.ok(evidence);
 assert.deepEqual(JSON.parse(evidence.text),tool.narrationContract);assert.match(request.messages[0].content,/pending、preview、rejected、not_submitted/);
 tool.narrationContract.applied[0].to='changed';assert.equal(receipt.applied[0].to,'loc_unreached');
});

test('唯一改写失败后回落真实回执模板，不重执行、不追加时间且重试不重调用模型',async t=>{
 let rewrites=0;
 const client={async generate(body,label){
  if(label.startsWith('consistency-rewrite:')){rewrites++;assert.equal(body.tools,undefined);return {choices:[{finish_reason:'stop',message:{content:'<q who="player">我全都答应。</q>'}}]};}
  return {choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:'report_consistency_issues',arguments:JSON.stringify({issues:[]})}}]}}]};
 }};
 const server=await createPlaytestServer({world,consistencyClient:client});t.after(()=>server.close());
 const created=await server.api('create',{}),campaignId=created.reference.campaignId,anchor='fallback-bread';
 const begun=await server.api('review/begin',{campaignId,anchor,playerText:'买一个面包',expectedSequence:created.reference.sequence});
 await server.api('execute',{campaignId,anchor,eventId:'fallback-buy',tool:'world_act',args:{action:'core:trade.buy',slots:{seller:'林穗',item:'面包',quantity:1}},expectedSequence:created.reference.sequence});
 const before=await server.api('read',{campaignId}),request={campaignId,token:begun.token,draft:'<q who="player">我全都答应。</q>',query:'买一个面包',expectedSequence:before.reference.sequence};
 const review=await server.api('review/reply',request);
 assert.equal(review.canCommit,false);assert.equal(review.attempts,1);assert.equal(rewrites,1);assert.equal(review.fallback.extraMinutes,0);
 assert.match(review.fallback.text,/面包/);assert.match(review.fallback.text,/2文/);assert.ok(!review.fallback.text.includes('我全都答应'));
 assert.deepEqual((await server.api('read',{campaignId})).document,before.document);
 assert.equal((await server.api('read',{campaignId})).reference.sequence,before.reference.sequence);
 assert.deepEqual(await server.api('review/reply',request),review);assert.equal(rewrites,1);
 const next=await server.api('review/begin',{campaignId,anchor:'after-fallback',playerText:'再等一分钟',expectedSequence:before.reference.sequence});assert.ok(next.token);
 await server.api('execute',{campaignId,anchor:'after-fallback',eventId:'after-fallback-wait',tool:'world_time',args:{minutes:1},expectedSequence:before.reference.sequence});
 assert.equal((await server.api('read',{campaignId})).document.state.minute,before.document.state.minute+1);
});

test('动作包语言片段与核心模板共同读取，缺少翻译沿用基础文本',t=>{
 const readdir=fsSync.readdirSync,read=fsSync.readFileSync,locale='a3-fragments-test';
 t.mock.method(fsSync,'readdirSync',(file,...args)=>String(file).endsWith(`${locale}/`)?['open.json','events.json']:readdir(file,...args));
 t.mock.method(fsSync,'readFileSync',(file,...args)=>String(file).includes(`${locale}/`)?JSON.stringify(String(file).endsWith('open.json')?{events:{leave_mark:'你留下了记号。'}}:{events:{wait:'你等了一会儿。'}}):read(file,...args));
 const base=loadTemplates(),translated=loadTemplates(locale);
 assert.equal(translated.events.leave_mark,'你留下了记号。');assert.equal(translated.events.wait,'你等了一会儿。');assert.deepEqual(translated.units,base.units);assert.equal(base.events.leave_mark,undefined);
});

test('A7 权限消费接点：受限出路携带原生拒绝原因，等待保留，实际执行仍拒绝离开',async t=>{
 const f=fixture(),engine=f.engine.scoped(f.document),location=f.document.state.location;
 f.document.holdings=openHoldings(engine,f.document);
 f.document.holdings.rows.test_detained={id:'test_detained',kind:'guest_of',variant:'detained',holder:'player',subject:location};
 const before=structuredClone(f.document);
 // A7 is not merged into this worktree. This adapter tests D's contract using
 // real canAct, not the unmerged A7 normalization or its HTTP route.
 const runtime=primitiveActionRuntime(),original=runtime.actionPermission;
 t.after(()=>{if(original)runtime.actionPermission=original;else delete runtime.actionPermission;});
 runtime.actionPermission=(engine,document,{action,slots})=>({action,actor:'player',...canAct({engine,document},'player',action==='core:move'?'move':'wait',{to:slots.destination})});
 const menu=worldActions(engine,f.document,{query:'core:move'}),move=menu.actions.find(a=>a.id==='core:move');
 assert.ok(menu.objects.exits.length);assert.ok(menu.objects.exits.every(e=>e.permission.allowed===false&&/羁押/.test(e.permission.reason)));
 assert.ok(move.slots.find(s=>s.name==='destination').options.every(o=>o.permission.allowed===false));
 assert.equal(worldActions(engine,f.document,{query:'core:time'}).actions.find(a=>a.id==='core:time').permission.allowed,true);
 await assert.rejects(f.engine.reduce(f.document,{tool:'world_act',args:{action:'core:move',slots:{destination:menu.objects.exits[0].id}},eventId:'detained-builder'}),/羁押|拘禁|离开/);
 assert.deepEqual(f.document,before);
 const native=previewLines({receipt:{status:'preview',cost:{time:7,coins:3,resources:null},check:{dc:14},witnesses:['npc_visible'],permission:{allowed:false,reason:'仍在羁押'}}});
 assert.ok(native.includes('费用：3文'));assert.ok(native.includes('耗时：7分钟'));assert.ok(native.includes('难度：14'));assert.ok(native.includes('已知见证：1人'));assert.ok(native.includes('行为限制：仍在羁押'));
});

test('未知意图只在目录实际返回 leave_mark 时提供留痕选择，不伪造注册或完成',async()=>{
 const calls=[],fallback={id:'open:leave_mark',label:'留下记号',slots:[{name:'intent',kind:'text',required:true}]};
 const api=async(endpoint,args)=>{calls.push({endpoint,args});return {actions:args.query==='open:leave_mark'?[fallback]:[]};};
 const actions=await findBuilderActions(api,{query:'在河岸摆一幅树枝画',target:'bank'});assert.deepEqual(actions,[fallback]);assert.deepEqual(calls.map(c=>c.args.query),['在河岸摆一幅树枝画','open:leave_mark']);
 let writes=0;const builder=new ActionBuilder({preview:async()=>{writes++;},act:async()=>{writes++;}});builder.intent='在河岸摆一幅树枝画';builder.choose(actions[0]);assert.equal(builder.slots.intent,builder.intent);assert.equal(builder.quote,null);assert.equal(writes,0);
 assert.deepEqual(await findBuilderActions(async()=>({actions:[]}),{query:'未知意图'}),[]);
});

test('复合字段复用已有工具 schema；属性分配经构造器真实扣除自由点且预览不写入',async()=>{
 const f=fixture();f.change(d=>{d.state.player.freeAttributePoints=2;});
 const action=worldActions(f.engine.scoped(f.document),f.document,{query:'core:attributes'}).actions.find(a=>a.id==='core:attributes'),slot=action.slots.find(s=>s.name==='attributes');
 const schema=builderSlotSchema(action,slot);assert.equal(schema.type,'object');assert.deepEqual(Object.keys(schema.properties),['力量','敏捷','体质','智力','精神','魅力']);assert.equal(schema.properties.体质.type,'integer');
 f.builder.choose(action);f.builder.setSlot('attributes',{体质:2});const before=structuredClone(f.document);
 await f.builder.preview();assert.ok(f.builder.quote);assert.deepEqual(f.document,before);
 assert.equal((await f.builder.confirm()).ok,true);assert.equal(f.document.state.player.freeAttributePoints,0);assert.equal(f.document.state.player.attributes.体质,before.state.player.attributes.体质+2);
});

test('未启用独立模型审查不替换正常正文，场外问题不回落成游戏场景',async t=>{
 for(const playerText of ['看一看周围。','（场外）这是什么规则？']){
  const server=await createPlaytestServer({world,consistencyClient:playerText.startsWith('（')?{async generate(){throw Error('离线');}}:null});t.after(()=>server.close());
  const created=await server.api('create',{}),campaignId=created.reference.campaignId,view=await server.api('read',{campaignId});
  const begun=await server.api('review/begin',{campaignId,anchor:'review-only',playerText,expectedSequence:view.reference.sequence});
  const draft=playerText.startsWith('（')?'这是一段场外说明。':`你看着周围。<回合 额外="0分" 地点="${view.document.state.location}" 在场=""/>`;
  const review=await server.api('review/reply',{campaignId,token:begun.token,draft,query:playerText,expectedSequence:view.reference.sequence});
  assert.equal(review.fallback,undefined);assert.equal(review.text,draft);assert.deepEqual((await server.api('read',{campaignId})).document,view.document);
 }
});
