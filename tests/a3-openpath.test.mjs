import {reviewResponse,reviewPayload,claimFor} from './helpers/consistency-response.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {modelActionCatalog,builderToolCall} from '../extension/tools.mjs';
import {findBuilderActions} from '../extension/action-builder.mjs';
import {deterministicConsistencyReview,consistencyReviewRequest,validateConsistencyResponse,reviewConsistency} from '../server-plugin/consistency-review.mjs';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';
import {evaluateAssertions} from '../tools/playtest-assertions.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
test('渡口组合意图的模型与构造器共用开放路径和已预览的留痕 fallback',async()=>{
 const engine=new WorldEngine(structuredClone(world)),document=engine.initialFromLegacy(seed,'openpath-dock');
 document.state.location='loc_hw_dock';
 const before=structuredClone(document),args={target:'loc_hw_dock',query:'取水 净化 陶罐 卖水'};
 const raw=worldActions(engine.scoped(document),document,args),model=modelActionCatalog(raw);
 assert.equal(raw.target.primitives.length,0);
 for(const id of ['open:proposal','open:leave_mark'])assert.ok(model.actions.some(row=>row.id===id));
 const proposal=model.actions.find(row=>row.id==='open:proposal');
 assert.equal(proposal.submission.action,'open:proposal');
 assert.equal(proposal.submission.slots,'intent, target, consent, participants, means, effects, context');
 assert.ok(proposal.slots.find(row=>row.name==='effects').inputSchema);
 assert.equal(model.actions.find(row=>row.id==='open:leave_mark').available,true);
 // A3CP: the model gets one shared fallback, while the player card retains
 // its complete executable preview choices. Availability must agree.
 const fallback=raw.target.blocked[0].fallback;
 assert.equal(model.fallback.available,fallback.available);
 assert.equal(model.fallback.action,fallback.action);
 assert.equal(model.target.blocked[0].reason,raw.target.blocked[0].reason);
 assert.equal(fallback.action,'open:leave_mark');assert.equal(fallback.available,true);
 const preview=await engine.previewAction(document,{tool:'world_act',eventId:'openpath-fallback',args:{action:fallback.action,slots:fallback.slots}});
 assert.equal(preview.receipt.status,'preview');
 const builder=await findBuilderActions(async(endpoint,options)=>worldActions(engine.scoped(document),document,options),args);
 assert.deepEqual(builder.map(row=>row.id),raw.actions.map(row=>row.id));
 assert.deepEqual(document,before,'查询与兜底预览不改账');
 // Even a caller requesting one search hit must still discover both paths.
 // a3r2-intent2 新增真实取水动作后，“取水”会有一条注册命中；
 // 保留原断言意图：limit=1 仍不得挤掉两个共享开放入口。
 assert.deepEqual(worldActions(engine.scoped(document),document,{...args,limit:1}).actions.map(row=>row.id),['core:environment.draw_water','open:proposal','open:leave_mark']);
});

test('对象受阻仍提供提案；留痕不可行时沿同一引擎预览返回真实缺项',()=>{
 const engine=new WorldEngine(structuredClone(world)),document=engine.initialFromLegacy(seed,'openpath-blocked');
 const location=engine.byId.get(document.state.location);
 location.primitiveLimits={...location.primitiveLimits,create:false};
 const raw=worldActions(engine.scoped(document),document,{target:document.state.location,query:'无此登记动作'});
 assert.ok(raw.actions.some(row=>row.id==='open:proposal'));
 const mark=modelActionCatalog(raw).actions.find(row=>row.id==='open:leave_mark');
 assert.equal(mark.available,false);assert.ok(mark.missing.length);assert.ok(mark.blocked);
 assert.equal(raw.target.blocked[0].fallback.available,false);
 assert.ok(raw.target.blocked[0].fallback.missing.length);
});

const entities=[{id:'npc_hw_linsui',name:'林穗',aliases:['老板娘']},{id:'npc_hw_ayan',name:'阿砚'},
 {id:'item_bread',name:'面包'},{id:'loc_hw_dock',name:'旧渡口'},{id:'bld_hw_qingdeng',name:'青灯酒馆'}];
const state={minute:540,location:'bld_hw_qingdeng',player:{coins:180},inventory:{},records:{},npcs:{}};
const input=(draft,extra={})=>({playerText:'我想留下地湿慢走的提醒，请林穗决定是否允许。',draft,
 before:structuredClone(state),after:structuredClone(state),receipts:[],allowedEntities:entities,...extra});
// 新变化/NPC 决定已由词表移到模型抽取＋出处校验。下面逐例提供明确
// 抽取结果，继续验证原来的阻断、来源及状态保证，不测试另一套同义词。
function claimResponse(data,extracted={}){
 const payload=reviewPayload(data),{sourceId,outcome='agree',...fields}=extracted,source=payload.sources.find(row=>row.sourceId===sourceId);
 const text=source?.text??payload.evidence.find(row=>row.id===source?.evidenceId)?.text;
 return reviewResponse(data,[],payload.segments.map(segment=>claimFor(segment,{...fields,
  verdict:source?'supported':'unsourced',references:source?[{sourceId,quote:text.slice(0,160)}]:[],
  ...(fields.kind==='decision'?{decision:{outcome,request:source?.decision?.request??{},scope:source?.decision?.scope??{}}}:{})})));
}
const issues=(draft,extra,extracted)=>{const data=input(draft,extra);return [...deterministicConsistencyReview(data).issues,...validateConsistencyResponse(claimResponse(data,extracted),data)];};
test('无引擎回执的痕迹、物品、移动、收入、记录和 NPC 决定属于不一致',()=>{
 for(const [draft,category] of [
  ['墙面上只多了那道指甲划出的浅痕。','fact'],
  ['你在墙上留下了地湿慢走的记号。','fact'],
  ['你获得了一个面包。','fact'],['你来到了旧渡口。','location'],
  ['你收到了十文。','fact'],['账本新增了这份记录。','fact'],
  ['林穗说这墙是我租的，我不点头。','agency'],
  ['<q who="npc_hw_linsui">我不同意你刻字。</q>','agency'],
  ['林穗答应了这个请求。','agency'],
 ])assert.ok(issues(draft,{},category==='agency'?{kind:'decision',subject:'npc_hw_linsui'}:{kind:category==='location'?'movement':'change',subject:'player'}).some(row=>row.category===category&&row.severity==='error'&&row.evidence.some(ref=>ref.id==='turn-settlement')),draft);
});

test('对应的已结算痕迹和 NPC 决定通过；预览、拒绝、别人的决定和历史记录不补证',()=>{
 const mark={op:'create',kind:'mark',facts:{intent:'地湿慢走',form:'刻痕'}};
 const receipt={tool:'world_act',args:{action:'open:leave_mark'},result:{ok:true,receipt:{status:'committed',applied:[mark]}}};
 const markClaim={kind:'change',subject:'player',sourceId:'settlement-effect:0'};
 assert.deepEqual(issues('你在墙上留下了地湿慢走的记号。',{receipts:[receipt]},markClaim),[]);
 for(const status of ['preview','pending','rejected','not_submitted'])assert.ok(issues('你在墙上留下了地湿慢走的记号。',{receipts:[{...receipt,result:{receipt:{status,applied:[mark]}}}]},markClaim).some(row=>row.category==='fact'),status);
 const decision=outcome=>({tool:'world_relation',args:{operation:'request'},result:{ok:true,dialogue:{npc:'npc_hw_linsui',decision:{outcome}}}});
 const decisionClaim={kind:'decision',subject:'npc_hw_linsui',sourceId:'decision:0'};
 for(const [outcome,draft] of [['agree','林穗答应了这个请求。'],['refuse','<q who="npc_hw_linsui">我不同意你刻字。</q>']])assert.deepEqual(issues(draft,{receipts:[decision(outcome)]},{...decisionClaim,outcome}),[]);
 assert.ok(issues('林穗答应了这个请求。',{receipts:[decision('refuse')]},decisionClaim).some(row=>row.category==='agency'));
 const other=decision('agree');other.result.dialogue.npc='npc_hw_ayan';
 assert.ok(issues('林穗答应了这个请求。',{receipts:[other]},decisionClaim).some(row=>row.category==='agency'));
 assert.ok(issues('林穗答应了这个请求。',{after:{...state,dialogues:{npc_hw_linsui:{decision:{outcome:'agree'}}}}},decisionClaim).some(row=>row.category==='agency'));
 const request=JSON.parse(consistencyReviewRequest(input('林穗答应了这个请求。')).messages[1].content);
 assert.deepEqual(JSON.parse(request.evidence.find(row=>row.id==='turn-settlement').text).decisions,[]);
 // A failed contest can still have real consequences. The service's applied
 // diff remains authority even though the player's requested action failed.
 // 失败的正式裁决仍可结算后果；前提拒绝不是正式裁决，不能伪造 applied。
 assert.deepEqual(issues('你收到了十文。',{receipts:[{tool:'world_act',result:{ok:false,receipt:{status:'committed',applied:[]}},applied:[{op:'transfer',resource:'coin',holder:'player',delta:10}]}]},{kind:'change',subject:'player',object:'coin',quantity:10,sourceId:'settlement-effect:0'}),[]);
});

test('对应物品、钱物、移动与记录结算通过，不把普通姿态、意图或旧痕迹误报',()=>{
 const receipts=[{tool:'world_act',result:{ok:true,receipt:{status:'committed',applied:[]}},applied:[
  {op:'transfer',resource:'item',holder:'player',item:'item_bread',delta:1},
  {op:'transfer',resource:'coin',holder:'player',delta:10},
  {op:'move',holder:'player',from:'bld_hw_qingdeng',to:'loc_hw_dock'},
 ]}];
 for(const [draft,claim] of [
  ['你获得了一个面包。',{kind:'change',subject:'player',object:'item_bread',quantity:1,sourceId:'settlement-effect:0'}],
  ['你收到了十文。',{kind:'change',subject:'player',object:'coin',quantity:10,sourceId:'settlement-effect:1'}],
  ['你来到了旧渡口。',{kind:'movement',subject:'player',object:'loc_hw_dock',sourceId:'settlement-effect:2'}],
  ['账本新增了这份记录。',{kind:'change',subject:'player',sourceId:'settlement-record:new'}],
 ])assert.deepEqual(issues(draft,{receipts,after:{...state,records:{new:{category:'contract',author:'player'}}}},claim),[],draft);
 for(const draft of ['林穗抬起头，目光扫过墙角。','你想在墙上留下提醒的记号。','墙上没有留下新的记号。','如果林穗同意，再留下记号。'])assert.deepEqual(issues(draft),[],draft);
 // 合法旧事有来源即可保留；不是要求每轮重做旧行动或新决定。
 for(const draft of ['墙上仍有昨天的旧痕迹。','上次林穗答应了这个请求。'])assert.deepEqual(issues(draft,{priorEvidence:[{kind:'historical-receipt',text:draft}]},{kind:'history',sourceId:'prior:0'}),[],draft);
});

test('零工具的绕过引擎草稿进入原有单次重写流程，仍错误则耗尽重写',async()=>{
 const draft='墙面上只多了那道指甲划出的浅痕。林穗答应了这个请求。';
 const client={generate:async body=>claimResponse(body,{kind:'change',subject:'player'})};
 const first=await reviewConsistency(input(draft),{client});
 assert.equal(first.rewriteRequest.attempt,1);assert.equal(first.rewriteRequest.allowTools,false);
 const second=await reviewConsistency(input(draft),{client,rewriteAttempt:1});
 assert.equal(second.rewriteRequest,null);assert.equal(second.rewriteExhausted,true);
});

test('服务端零调用回合直接退 pending 模板，不进入付费改写且不能提交虚构痕迹/NPC 决定',async t=>{
 let rewrites=0;
 const draft='墙面上只多了那道指甲划出的浅痕。<q who="npc_hw_linsui">我不同意你刻字。</q><回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>';
 const client={generate:async(body,label)=>{
  if(label.startsWith('consistency-rewrite:')){rewrites++;return {choices:[{finish_reason:'stop',message:{content:draft}}]};}
  return reviewResponse(body);
 }};
 const server=await createPlaytestServer({consistencyClient:client});t.after(()=>server.close());
 const created=await server.api('create',{}),campaignId=created.reference.campaignId;
 const before=await server.api('read',{campaignId});
 const begun=await server.api('review/begin',{campaignId,anchor:'openpath-no-calls',playerText:'我想在墙上刻字，请林穗决定是否同意。',expectedSequence:before.reference.sequence});
 const result=await server.api('review/reply',{campaignId,token:begun.token,draft,expectedSequence:before.reference.sequence,query:''});
 // 回合硬门禁已在语义审查前阻止零裁决散文，原来的禁止越权保证仍保留。
 assert.equal(result.canCommit,false);assert.equal(rewrites,0);assert.equal(result.status,'pending');
 assert.equal(result.original,draft);assert.equal(result.text,result.safeText);
 assert.doesNotMatch(result.safeText,/只多了那道|我不同意你刻字/);
 assert.deepEqual((await server.api('read',{campaignId})).document,before.document);
});

test('试玩容器前提来自现有存货与真实交易，开局钱够且网关断言匹配',async t=>{
 const scenario=JSON.parse(await fs.readFile('tests/playtests/a3_whimsy.json','utf8'));
 const step=scenario.turns.find(row=>row.anchor==='whimsy_buy_container');assert.ok(step);assert.equal(step.anchor,'whimsy_buy_container');
 const seller=world.npcs.find(row=>row.id==='npc_hw_yanzhe'),pot=world.items.find(row=>row.id==='item_clay_pot');
 assert.ok((seller.inventory.item_clay_pot?.quantity??seller.inventory.item_clay_pot)>0);
 assert.ok(seed.state.player.coins>=pot.basePrice);
 assert.deepEqual(builderToolCall('open:proposal',{intent:'净水',effects:[]}).tool,'world_propose');
 // Either public path can settle a mark; the scenario still requires the same
 // real mark record. Metrics must use the gateway's recorded tool names.
 assert.equal(builderToolCall('open:leave_mark',{intent:'刻痕'}).tool,'world_act');
 assert.deepEqual(scenario.turns.find(row=>row.input.startsWith('我把这道记号')).expectedTools,['world_act','world_propose']);
 const server=await createPlaytestServer();t.after(()=>server.close());
 const created=await server.api('create',{}),campaignId=created.reference.campaignId;
 let view=await server.api('read',{campaignId}),sequence=view.reference.sequence;
 const before=view.document,calls=[];
 assert.equal(before.state.inventory.item_clay_pot?.quantity??0,0);
 const execute=async(tool,args,id)=>{
  const out=await server.api('execute',{campaignId,anchor:'container-test',eventId:id,tool,args,expectedSequence:sequence});
  calls.push({tool,args,result:out.result});view=await server.api('read',{campaignId});sequence=view.reference.sequence;return out;
 };
 await execute('world_move',{destination:'河湾村',mode:'walk'},'container-village');
 await execute('world_move',{destination:'白石镇',mode:'walk'},'container-town');
 // Wait for this seller's real next trade slot, without inventing inventory.
 for(let i=0;i<48;i++){
  const npc=view.document.state.npcs.npc_hw_yanzhe;
  if(npc.location===view.document.state.location&&npc.services?.includes('trade'))break;
  await execute('world_time',{minutes:30},`container-wait-${i}`);
 }
 const buy=await execute('world_trade',{seller:'严辙',item:'素面陶罐',quantity:1},'container-buy');
 assert.equal(buy.result.ok,true);
 assert.ok(evaluateAssertions(step.assertions,{before,after:view.document,calls,reply:''}).every(row=>row.pass));
 // 动态目录给原生 ID、玩家也可用中文别名。购买断言验证真实成交、
 // 陶罐入袋和扣款，不把参数采用哪种合法称呼当成判据。
 const nativeIds=calls.map(row=>row.tool==='world_trade'?{...row,args:{seller:'npc_hw_yanzhe',item:'item_clay_pot',quantity:1}}:row);
 assert.ok(evaluateAssertions(step.assertions,{before,after:view.document,calls:nativeIds,reply:''}).every(row=>row.pass));
});
