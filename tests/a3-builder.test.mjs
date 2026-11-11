import {reviewResponse} from './helpers/consistency-response.mjs';
import {assertActionRejected} from './helpers/action-refusal.mjs';
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
import {openHoldings} from '../server-plugin/holdings.mjs';
import {actionCompletion,actionNarrationContract,toolResultWithClock} from '../extension/turn.mjs';
import {consistencyReviewRequest} from '../server-plugin/consistency-review.mjs';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';
import {executeLeaveMark} from '../server-plugin/mark-actions.mjs';
import {withLedger,accountKey,auditLedger} from '../server-plugin/ledger.mjs';
import {loadActionRegistry} from '../server-plugin/action-registry.mjs';
import {modelActionCatalog,builderToolCall} from '../extension/tools.mjs';
import {actionModes,modelToolAllowed,AI_PROFILES} from '../extension/turn.mjs';
import {normalizeSettings} from '../extension/ui-settings.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));

test('开放提案是动态目录职责，四步输入不需原语 JSON；只使用当前可及实体和自己的手段',()=>{
 const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'builder-open-catalog');
 const menu=worldActions(engine.scoped(document),document,{query:'open:proposal'}),action=menu.actions.find(a=>a.id==='open:proposal');
 assert.ok(action);assert.equal(action.inputTool,'world_propose');
 // 06 §6.5: selecting a target and requesting consent must survive the form;
 // the structured request grants no authority on the counterparty's behalf.
 assert.deepEqual(action.slots.map(s=>[s.name,builderStep(s)]),[['intent',3],['target',1],['consent',1],['participants',1],['means',2],['effects',3],['context',3]]);
 const target=action.slots.find(s=>s.name==='participants').inputSchema.properties.target;
 const remote=Object.keys(document.state.npcs).find(id=>document.state.npcs[id].location!==document.state.location);
 assert.ok(remote);assert.ok(!target.enum.includes(remote));assert.ok(target.enum.includes('player'));
 const means=action.slots.find(s=>s.name==='means').inputSchema.properties;
 assert.deepEqual(means.skill.enum,Object.keys(document.state.skills));
 assert.ok(means.item.enum.every(id=>(document.state.inventory[id]?.quantity??document.state.inventory[id])>0));
 const effects=action.slots.find(s=>s.name==='effects').inputSchema;
 // A3FX: the previous 63 was a stale UI limit; production proposal.effects
 // accepts 64. Keep this bound aligned with the same submitted contract.
 assert.equal(effects.maxItems,64);assert.equal(effects.items.oneOf.find(s=>s.properties.op.const==='emit').properties.target.enum.includes(remote),false);
 assert.equal(JSON.stringify(action).includes('"outcomes"'),false);
 // A3CP: full selectors belong to the local builder, while model discovery
 // keeps the structured array contract and every allowed op's required fields.
 const model=modelActionCatalog(menu).actions[0];assert.equal(model.submission.action,'open:proposal');
 const compactEffects=model.slots.find(s=>s.name==='effects').inputSchema;
 assert.equal(compactEffects.type,effects.type);assert.equal(compactEffects.maxItems,effects.maxItems);
 assert.deepEqual(compactEffects.operations,Object.fromEntries(effects.items.oneOf.map(row=>[row.properties.op.const,row.required.filter(name=>name!=='op')])));
 const before=structuredClone(document);document.state.records.action_config={category:'action_config',openActions:'off'};
 assert.equal(worldActions(engine.scoped(document),document,{query:'open:proposal'}).actions.length,0);
 assert.ok(worldActions(engine.scoped(document),document,{query:'open:leave_mark'}).actions.some(a=>a.id==='open:leave_mark'));
 document.state.records.action_config.openActions='limited';
 const limited=worldActions(engine.scoped(document),document,{query:'open:proposal'}).actions[0].slots.find(s=>s.name==='effects').inputSchema.items.oneOf;
 assert.deepEqual(limited.map(s=>s.properties.op.const),['move','emit','vital','learn','create','fact.set']);
 assert.ok(before.state.records.action_config===undefined);
});

test('真实 HTTP 开放提案：四步预览不写、确认同编号结算、重放不重复产生事件、stale 不提交',async t=>{
 const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,world});t.after(()=>server.close());
 const created=await server.api('create',{}),campaignId=created.reference.campaignId,initial=await server.api('read',{campaignId});
 const action=(await server.api('actions',{campaignId,query:'open:proposal'})).actions.find(a=>a.id==='open:proposal');
 let submits=0;
 const services={newEventId:()=>`builder-open-${submits}`,
  preview:async(action,slots,eventId)=>server.api('propose',{campaignId,...builderToolCall(action,slots),eventId}),
  act:async(action,slots,{eventId,expectedSequence})=>{
   const now=await server.api('read',{campaignId});if(expectedSequence!==now.reference.sequence)return {ok:false,stale:true};
   submits++;const saved=await server.api('execute',{campaignId,...builderToolCall(action,slots),eventId,expectedSequence,anchor:null});return {ok:true,result:saved.result};
  }};
 const builder=new ActionBuilder(services);builder.intent='对自己说今天的行程';builder.choose(action);
 builder.step=1;builder.setSlot('participants',{target:'player'});builder.step=2;builder.setSlot('means',{manner:'careful'});
 builder.step=3;builder.setSlot('effects',[{op:'emit',verb:'tell',target:'player',visibility:'private',payload:{text:'今天先观察周围'}}]);
 const quote=await builder.preview();assert.ok(quote);assert.equal(quote.result.receipt.routing.status,'open');
 assert.deepEqual((await server.api('read',{campaignId})).document,initial.document);
 assert.equal((await builder.confirm()).ok,true);const saved=await server.api('read',{campaignId});
 // 06 §6.6: native source/nearest-action cost is authoritative, not a UI constant.
 assert.ok(quote.result.receipt.cost.time>0);assert.equal(saved.document.state.minute,initial.document.state.minute+quote.result.receipt.cost.time);
 assert.equal(builder.result.result.receipt.status,'committed');assert.deepEqual(builder.result.result.receipt.applied.map(e=>e.op),['emit']);
 const event=Object.values(saved.document.state.records).find(r=>r.category==='world_event'&&r.verb==='tell'&&r.payload?.text==='今天先观察周围');assert.ok(event);
 await server.api('execute',{campaignId,...builderToolCall(quote.args.action,quote.args.slots),eventId:quote.eventId,expectedSequence:saved.reference.sequence,anchor:null});
 assert.deepEqual((await server.api('read',{campaignId})).document,saved.document);assert.equal(await builder.confirm(),null);
 builder.setSlot('intent','再对自己说今天的行程');await builder.preview();assert.ok(builder.quote);
 await server.api('execute',{campaignId,tool:'world_act',args:{action:'core:time',slots:{minutes:1}},eventId:'builder-open-external',expectedSequence:saved.reference.sequence,anchor:null});
 const changed=await server.api('read',{campaignId});assert.equal((await builder.confirm()).stale,true);assert.deepEqual((await server.api('read',{campaignId})).document,changed.document);
});

test('精确目录匹配的 limit=1 保留注册动作，开放路径附在后面不抢占建议名额',()=>{
 const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'builder-match-limit');
 const result=worldActions(engine.scoped(document),document,{query:'core:time',limit:1});
 assert.deepEqual(result.actions.map(row=>row.id),['core:time','open:proposal','open:leave_mark']);
 // This is the same identity/read-only/blocked check used by modelAct(match)
 // before returning suggested, without requiring a browser or executing time.
 const action=result.actions.find(row=>row.id==='core:time'&&!row.readOnly);
 assert.ok(action);assert.equal(action.blocked,undefined);
 const builder=new ActionBuilder({preview:()=>assert.fail('建议不得自动预览'),act:()=>assert.fail('建议不得执行')});
 builder.choose(action);builder.setSlot('minutes',1);assert.equal(builder.action.id,'core:time');assert.equal(builder.quote,null);
});

test('模式归一化和设置持久化字段：关闭/目录匹配不暴露旧写工具，纯本地构造始终可用',()=>{
 assert.deepEqual(actionModes(),AI_PROFILES.T0);
 for(const [aiProfile,{intent,narration}] of Object.entries(AI_PROFILES)){
  const settings=normalizeSettings({aiProfile});assert.deepEqual(actionModes(settings),{intent,narration});
  for(const tool of ['world_move','world_trade','world_time'])assert.equal(modelToolAllowed(tool,settings),intent==='propose');
  assert.equal(modelToolAllowed('world_actions',settings),true);assert.equal(modelToolAllowed('world_act',settings),intent!=='off');
  assert.deepEqual(builderToolCall('open:proposal',{intent:'画画',effects:[]}),{tool:'world_propose',args:{intent:'画画',effects:[]}});
 }
 assert.deepEqual(actionModes({aiProfile:'invalid'}),actionModes());
 const slots={minutes:1},call=builderToolCall('core:time',slots);call.args.slots.minutes=5;assert.equal(slots.minutes,1);
});
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
 // S5-02 sections15.2/15.4: base 2 * scarcity .5 * depth/grade/standing 1 = 1; two units truncate(2*1)=2.
 const lines=previewLines(f.builder.quote.result,{label:'买东西',startMinute:before.state.minute});
 assert.ok(lines.includes('费用：1文'));assert.ok(lines.includes('耗时：5分钟'));
 f.builder.cancel();assert.equal(await f.builder.confirm(),null);assert.deepEqual(f.document,before);
});

test('显式确认才实际扣款得货，执行使用预览事件编号；确认按钮不可重复提交',async()=>{
 const f=fixture(),coins=f.document.state.player.coins,minute=f.document.state.minute;
 f.builder.setSlot('quantity',2);const quote=await f.builder.preview();assert.equal(quote.eventId,'builder-buy');
 const result=await f.builder.confirm();assert.equal(result.ok,true);
 assert.equal(f.document.state.player.coins,coins-2);assert.equal(f.document.state.inventory.item_bread.quantity??f.document.state.inventory.item_bread,2);
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
 const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,world,consistencyEnabled:false});t.after(()=>server.close());
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
 assert.equal(after.document.state.player.coins,before.document.state.player.coins-1);assert.equal(after.reference.sequence,before.reference.sequence+1);
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
  return reviewResponse(body);
 }};
 const server=await createPlaytestServer({aiProfile:'T3'/*this scenario supplies a model client*/,world,consistencyClient:client});t.after(()=>server.close());
 const created=await server.api('create',{}),campaignId=created.reference.campaignId,anchor='fallback-bread';
 const begun=await server.api('review/begin',{campaignId,anchor,playerText:'买一个面包',expectedSequence:created.reference.sequence});
 await server.api('execute',{campaignId,anchor,eventId:'fallback-buy',tool:'world_act',args:{action:'core:trade.buy',slots:{seller:'林穗',item:'面包',quantity:1}},expectedSequence:created.reference.sequence});
 const before=await server.api('read',{campaignId}),request={campaignId,token:begun.token,draft:'<q who="player">我全都答应。</q>',query:'买一个面包',expectedSequence:before.reference.sequence};
 const review=await server.api('review/reply',request);
 assert.equal(review.canCommit,false);assert.equal(review.attempts,1);assert.equal(rewrites,1);assert.equal(review.fallback.extraMinutes,0);
 // S5-02：基准2×供需下限0.5，首笔整单1文；回落必须保留真实付款金额。
 assert.match(review.fallback.text,/面包/);assert.match(review.fallback.text,/1文/);assert.ok(!review.fallback.text.includes('我全都答应'));
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

test('A7 实际权限消费：受限出路携带原生拒绝原因，等待保留，实际执行仍拒绝离开',async()=>{
 const f=fixture(),engine=f.engine.scoped(f.document),location=f.document.state.location;
 f.document.holdings=openHoldings(engine,f.document);
 f.document.holdings.rows.test_detained={id:'test_detained',kind:'guest_of',variant:'detained',holder:'player',subject:location};
 const before=structuredClone(f.document);
 // A7 is now merged: exercise the production normalization and capacity path.
 const menu=worldActions(engine,f.document,{query:'core:move'}),move=menu.actions.find(a=>a.id==='core:move');
 // S4 permits local walking inside custody while every external exit stays refused.
 const exits=menu.objects.exits.filter(e=>!e.zone),zones=menu.objects.exits.filter(e=>e.zone);
 assert.ok(exits.length);assert.ok(exits.every(e=>e.permission.allowed===false&&/羁押/.test(e.permission.reason)));
 assert.ok(zones.length);assert.ok(zones.every(e=>e.permission.allowed===true));
 assert.ok(move.slots.find(s=>s.name==='destination').options.filter(o=>exits.some(e=>e.id===o.value)).every(o=>o.permission.allowed===false));
 assert.equal(worldActions(engine,f.document,{query:'core:time'}).actions.find(a=>a.id==='core:time').permission.allowed,true);
 await assertActionRejected(f.engine.reduce(f.document,{tool:'world_act',args:{action:'core:move',slots:{destination:exits[0].id}},eventId:'detained-builder'}),/羁押|拘禁|离开/);
 assert.deepEqual(f.document,before);
 const walked=await f.engine.reduce(f.document,{tool:'world_act',args:{action:'core:move',slots:{destination:zones[0].id,mode:'walk'}},eventId:'detained-local-walk'});
 assert.equal(walked.result.arrived,true);
 const within=applyPatches(f.document,walked.patches);
 assert.equal(within.state.location,location);assert.equal(within.state.records.local_player_position.zone,zones[0].id);
 assert.deepEqual(within.holdings.rows.test_detained,before.holdings.rows.test_detained);
 const native=previewLines({receipt:{status:'preview',cost:{time:7,coins:3,resources:null},check:{dc:14},witnesses:['npc_visible'],permission:{allowed:false,reason:'仍在羁押'}}});
 assert.ok(native.includes('费用：3文'));assert.ok(native.includes('耗时：7分钟'));assert.ok(native.includes('难度：14'));assert.ok(native.includes('已知见证：1人'));assert.ok(native.includes('行为限制：仍在羁押'));
});

test('未知意图只在目录实际返回 leave_mark 时提供留痕选择，不伪造注册或完成',async()=>{
 const calls=[],fallback={id:'open:leave_mark',label:'留下记号',slots:[{name:'intent',kind:'text',required:true}]};
 const api=async(endpoint,args)=>{calls.push({endpoint,args});return {actions:args.query==='open:leave_mark'?[fallback]:[]};};
 // 06 §6.9.1/6.9.5: search also discovers the dynamic proposal duty;
 // neither creative path is fabricated when absent from this campaign.
 const actions=await findBuilderActions(api,{query:'在河岸摆一幅树枝画',target:'bank'});assert.deepEqual(actions,[fallback]);assert.deepEqual(calls.map(c=>c.args.query),['在河岸摆一幅树枝画','open:proposal','open:leave_mark']);
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

test('未启用独立模型审查使用场内模板，场外问题不回落成游戏场景',async t=>{
 for(const playerText of ['看一看周围。','（场外）这是什么规则？']){
  const server=await createPlaytestServer({aiProfile:'T3'/*this scenario supplies a model client*/,world,consistencyClient:playerText.startsWith('（')?{async generate(){throw Error('离线');}}:null});t.after(()=>server.close());
  const created=await server.api('create',{}),campaignId=created.reference.campaignId,view=await server.api('read',{campaignId});
  const begun=await server.api('review/begin',{campaignId,anchor:'review-only',playerText,expectedSequence:view.reference.sequence});
  const draft=playerText.startsWith('（')?'这是一段场外说明。':`你看着周围。<回合 额外="0分" 地点="${view.document.state.location}" 在场=""/>`;
  const review=await server.api('review/reply',{campaignId,token:begun.token,draft,query:playerText,expectedSequence:view.reference.sequence});
  // 回合契约已规定无模型/零裁决只发布场内安全模板；场外说明仍保留
  // 原来的不进入场景保证。两条路径都不改账、不追加游戏时间。
  if(playerText.startsWith('（')){assert.equal(review.fallback,undefined);assert.equal(review.text,draft);}
  else{assert.equal(review.status,'pending');assert.equal(review.canCommit,false);assert.equal(review.text,review.safeText);assert.equal(review.fallback.extraMinutes,0);assert.equal(review.original,draft);assert.notEqual(review.text,draft);}
  assert.deepEqual((await server.api('read',{campaignId})).document,view.document);
 }
});

test('留痕构造消费 B 的真实目录与规则：分区、标签和材料，预览不写且确认真实消耗并产生反应',async()=>{
 const engine=new WorldEngine(structuredClone(world));
 // A owns archive-loader installation. Bind B's actual data and adapter here;
 // this verifies D -> B, not the still-unmerged public HTTP dispatch.
 const json=async path=>JSON.parse(await fs.readFile(path,'utf8'));
 Object.assign(engine.world,{openActionRules:await json('world/rules/tables/open-actions.json'),openTagging:await json('world/rules/open-tagging.json'),openReactions:await json('world/rules/open-reactions.json')});
 let document=withLedger(engine,engine.createCharacter(seed,{},'builder-mark')).document,sequence=0;
 const observer=Object.values(document.state.npcs).find(n=>n.location&&n.status!=='死亡'&&n.status!=='濒死'&&!n.scheduleTravel&&!n.cognitionTravel);
 assert.ok(observer);document.state.location=observer.location;observer.activity='闲坐';observer.zone='wall';
 const place=engine.byId.get(document.state.location);
 place.zones=[{id:'wall',name:'东侧墙根'},{id:'hidden',name:'暗室',hidden:true},{id:'private',name:'私室',private:true},{id:'far',name:'封闭处',accessible:false},{id:'unseen',name:'不可见处',visible:false}];
 const menu=()=>worldActions(engine.scoped(document),document,{query:'open:leave_mark'}),action=menu().actions.find(a=>a.id==='open:leave_mark');assert.ok(action);
 assert.equal(builderStep(action.slots.find(s=>s.name==='zone')),1);assert.equal(builderStep(action.slots.find(s=>s.name==='materials')),2);
 assert.deepEqual(action.slots.find(s=>s.name==='zone').options,[{value:'wall',label:'东侧墙根'}]);
 const tags=action.slots.find(s=>s.name==='tags');assert.equal(tags.multiple,true);assert.deepEqual(tags.options.map(o=>o.value),[...engine.world.openTagging.tags,...engine.world.openTagging.traits]);assert.equal(tags.options.find(o=>o.value==='mark:warning').label,'警告');
 const model=modelActionCatalog({scene:menu().scene,actions:[action]}).actions[0];
 assert.deepEqual(model.slots.find(slot=>slot.name==='tags').options,tags.options.map(option=>option.value));assert.ok(model.slots.find(slot=>slot.name==='tags').options.includes('mark:art'));assert.equal('outcomes' in model,false);assert.equal('call' in model,false);
 const schema=builderSlotSchema(action,action.slots.find(s=>s.name==='materials'));
 assert.equal(schema.maxItems,engine.world.openActionRules.mark.maximumMaterials);assert.deepEqual(schema.items.required,['item','qty']);assert.equal(schema.items.properties.qty.minimum,1);
 // A3CP removes repeated inventory enums from nested schemas; material shape,
 // own-stock choices in the full builder, and the minimum quantity still hold.
 const compactMaterials=model.slots.find(slot=>slot.name==='materials').inputSchema;
 assert.equal(compactMaterials.type,schema.type);assert.equal(compactMaterials.maxItems,schema.maxItems);
 assert.deepEqual(compactMaterials.items.required,schema.items.required);
 assert.equal(compactMaterials.items.properties.qty.minimum,1);
 const item=schema.items.properties.item.enum.find(id=>(document.ledger.accounts[accountKey('player',id,'inventory')]??0)>0);assert.ok(item);
 assert.ok(schema.items.properties.item.enum.every(id=>Object.hasOwn(document.state.inventory,id)));assert.equal(schema.items.properties.item.enum.length,schema.items.properties.item.enumLabels.length);
 const builder=new ActionBuilder({newEventId:()=> 'builder-real-mark',
  preview:async(action,slots,eventId)=>({...executeLeaveMark(engine,document,{eventId,args:{slots}},{preview:true}),reference:{sequence}}),
  act:async(action,slots,{eventId,expectedSequence})=>{assert.equal(expectedSequence,sequence);const out=executeLeaveMark(engine,document,{eventId,args:{slots}});document=applyPatches(document,out.patches);sequence++;return {ok:true,result:{receipt:out.receipt}};}
 });
 builder.intent='画出一扇能瞬移到王城的门';builder.choose(action);builder.setSlot('zone','wall');builder.setSlot('form','涂画');builder.setSlot('tags',['mark:warning']);builder.setSlot('materials',[{item,qty:1}]);
 const before=structuredClone(document);await builder.preview();assert.ok(builder.quote);assert.deepEqual(document,before);assert.ok(previewLines(builder.quote.result).some(line=>line.includes('原本设想的效果不会')));
 const names=Object.fromEntries([...menu().objects.people,...menu().objects.items].map(row=>[row.id,row.name])),forecast=previewLines(builder.quote.result,{label:action.label,names});
 assert.ok(forecast.includes(`资源代价：1 ${names[item]}`));
 const respondingId=builder.quote.result.receipt.mark.reactions[0].observer;assert.ok(names[respondingId]);assert.ok(forecast.some(line=>line.startsWith('可能回应：')&&line.includes(names[respondingId])));
 const out=await builder.confirm(),receipt=out.result.receipt;assert.equal(receipt.status,'committed');assert.equal(receipt.fallback.originalIntentFulfilled,false);
 assert.equal(document.ledger.accounts[accountKey('player',item,'inventory')],before.ledger.accounts[accountKey('player',item,'inventory')]-1);assert.deepEqual(auditLedger(document.ledger),[]);
 assert.equal(document.state.location,before.state.location);assert.equal(document.state.minute,before.state.minute+engine.world.openActionRules.mark.minutes);assert.equal(document.state.created[receipt.mark.entity].zone,'wall');assert.ok(receipt.mark.reactions.length);
 // The gateway narrates from the registered definition, not its UI projection.
 const lines=actionLines({engine,action:loadActionRegistry().byId.get(action.id),before,after:document,args:builder.slots,result:{receipt}}).lines;
 assert.ok(lines.some(line=>line.includes('涂画')));assert.ok(lines.some(line=>line.includes('原本设想的效果并未')));
 for(const reaction of receipt.mark.reactions)assert.ok(lines.some(line=>line.includes(reaction.text)&&line.includes(document.state.npcs[reaction.observer].name??engine.byId.get(reaction.observer).name)));
 assert.equal(await builder.confirm(),null);
 // A refresh drops a formerly public area; the old choice cannot be confirmed.
 place.zones=[];builder.refresh(menu().actions.find(a=>a.id==='open:leave_mark'));assert.equal(builder.slots.zone,undefined);assert.equal(builder.quote,null);
});

test('构造目录默认使用存档动作定义，不从安装目录漏入该存档未注册的新动作',()=>{
 const engine=new WorldEngine(structuredClone(world)),document=engine.initialFromLegacy(seed,'archived-builder-menu');
 const wait=structuredClone(loadActionRegistry().byId.get('core:time'));wait.label='本存档的等待';
 engine.world.actionDefinitions={format:1,actions:[wait]};
 const here=worldActions(engine.scoped(document),document);
 assert.deepEqual(here.actions.map(action=>action.id),['core:time']);assert.equal(here.actions[0].label,'本存档的等待');
 assert.ok(!worldActions(engine.scoped(document),document,{query:'open:leave_mark'}).actions.some(action=>action.id==='open:leave_mark'));
});

test('练习时长控件边界取自同一注册动作，不把30–480分钟显示成任意正数',()=>{
 const f=fixture(),definition=loadActionRegistry().byId.get('core:practice.session');
 const offer=worldActions(f.engine.scoped(f.document),f.document,{query:definition.id}).actions.find(action=>action.id===definition.id),duration=offer.slots.find(slot=>slot.name==='minutes');
 assert.equal(duration.min,30);assert.equal(duration.max,480);assert.equal(duration.default,120);assert.deepEqual(duration.presets,[30,60,120,240]);
 assert.equal(duration.min,definition.durationSlot.min);assert.equal(duration.max,definition.durationSlot.max);
 const projected=modelActionCatalog({scene:[],actions:[offer]}).actions[0].slots.find(slot=>slot.name==='minutes');assert.equal(projected.min,30);assert.equal(projected.max,480);assert.equal(projected.default,120);
});

test('环境走近选择实际可见对象，确认走到对象位置；隐藏或异地对象不进入选择器',async()=>{
 const f=fixture(),features=(f.engine.advanceFeatures??f.engine.world.locations.flatMap(place=>(place.features??[]).map(feature=>({...feature,location:place.id})))),local=features.find(row=>row.location===f.document.state.location&&row.position.some(value=>value!==0));assert.ok(local);
 // The visibility projection reads the native feature set, not inferred NPC ids.
 f.engine.advanceFeatures=[...features,{...local,id:'feature_builder_hidden',hidden:true},{...local,id:'feature_builder_private',private:true}];
 const menu=worldActions(f.engine.scoped(f.document),f.document,{query:'core:environment.approach'}),offer=menu.actions.find(action=>action.id==='core:environment.approach'),targets=offer.slots.find(slot=>slot.name==='target').options;
 assert.ok(targets.some(option=>option.value===local.id));assert.ok(targets.every(option=>!['feature_builder_hidden','feature_builder_private'].includes(option.value)&&(features.some(feature=>feature.id===option.value&&feature.location===f.document.state.location)||menu.objects.people.some(person=>person.id===option.value))));
 const remote=features.find(row=>row.location!==f.document.state.location);assert.ok(remote);assert.ok(!targets.some(option=>option.value===remote.id));
 const before=structuredClone(f.document);f.builder.choose(offer);f.builder.setSlot('target',local.id);await f.builder.preview();assert.ok(f.builder.quote);assert.deepEqual(f.document,before);
 assert.equal((await f.builder.confirm()).ok,true);assert.deepEqual(f.document.state.records.local_player_position.point,local.position);assert.equal(f.document.state.location,before.state.location);assert.equal(f.document.state.player.coins,before.state.player.coins);assert.deepEqual(f.document.state.inventory,before.state.inventory);
});

test('法术选择只列本人已掌握的法术；可选自己和当前可见环境，不泄漏离屏目标',()=>{
 const f=fixture(),spell=f.engine.world.spells[0];f.document.state.spells={[spell.id]:{level:1}};
 f.document.state.creatures={...f.document.state.creatures,builder_beast:{name:'院里的山羊',location:f.document.state.location,hp:10,status:'正常'},builder_remote_beast:{name:'远处的山羊',location:'remote',hp:10,status:'正常'},builder_dead_beast:{name:'死去的山羊',location:f.document.state.location,hp:0,status:'死亡'}};
 const cast=worldActions(f.engine.scoped(f.document),f.document,{query:'core:cast'}).actions.find(action=>action.id==='core:cast');
 assert.deepEqual(cast.slots.find(slot=>slot.name==='spell').options,[{value:spell.id,label:spell.name}]);
 const targets=cast.slots.find(slot=>slot.name==='target').options;assert.ok(targets.some(option=>option.value==='player'&&option.label==='自己'));assert.ok(targets.some(option=>option.value.startsWith('feature_')));
 for(const offers of [targets,worldActions(f.engine.scoped(f.document),f.document,{query:'core:combat'}).actions.find(action=>action.id==='core:combat').slots.find(slot=>slot.name==='target').options]){
  assert.ok(offers.some(option=>option.value==='builder_beast'));assert.ok(!offers.some(option=>['builder_remote_beast','builder_dead_beast'].includes(option.value)));
 }
 const remote=Object.keys(f.document.state.npcs).find(id=>f.document.state.npcs[id].location!==f.document.state.location);assert.ok(remote);assert.ok(!targets.some(option=>option.value===remote));
});
