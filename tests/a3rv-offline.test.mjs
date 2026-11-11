import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {reviewConsistency,consistencyReviewRequest} from '../server-plugin/consistency-review.mjs';
import {reviewTurnSettlement} from '../server-plugin/consistency-evidence.mjs';
import {modelToolResult} from '../extension/turn.mjs';
import {evaluateAssertions} from '../tools/playtest-assertions.mjs';
import {reviewPayload,reviewResponse,claimFor} from './helpers/consistency-response.mjs';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';
import {turnFactsPrompt} from '../extension/turn-contract.mjs';

const fixtures=JSON.parse(await fs.readFile(new URL('./fixtures/a3rv/sidecar-replay.json',import.meta.url),'utf8'));
function expandProjection(projected){
 const dereference=value=>{
  if(!value||typeof value!=='object')return value;
  if(Object.keys(value).length===1&&typeof value.$ref==='string'){
   const target=value.$ref.slice(2).split('/').map(key=>key.replaceAll('~1','/').replaceAll('~0','~')).reduce((v,k)=>v[k],projected);
   assert.notEqual(target,undefined,value.$ref);return dereference(target);
  }
  return Array.isArray(value)?value.map(dereference):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,dereference(v)]));
 };
 return dereference(projected);
}
for(const fixture of fixtures)test(`sidecar 原文重放 ${fixture.classification} ${fixture.anchor}/${fixture.stage}`,async()=>{
 const before=structuredClone(fixture.input);let calls=0;
 const result=await reviewConsistency(fixture.input,{client:{generate:async request=>{
  calls++;assert.deepEqual(request.response_format,{type:'json_object'});assert.equal(request.tools,undefined);
  return structuredClone(fixture.response);
 }}});
 assert.deepEqual(fixture.input,before,'离线审查不能改账或更改原稿');
 assert.equal(result.verified,true,result.model.reason);assert.equal(calls,1,'可确定修复的格式不能再付费重审');
 const errors=result.issues.filter(issue=>issue.severity==='error');
 if(fixture.classification==='F')assert.deepEqual(errors,[]);
 else if(fixture.classification==='T'){
  assert.ok(errors.some(issue=>issue.quote==='截成四块之后，'),'未结算的材料加工仍须阻断');
  assert.ok(result.rewriteRequest);
 }else{
  assert.ok(errors.some(issue=>issue.quote==='把钱扔进磨坊角的小陶罐里。'),'未结算的物件位置变化仍须阻断');
  for(const quote of ['阿砚把削木小刀从木架上取下来递给你，','他转身从靠墙的料堆里挑出两段木料，','”他收下钱，','尹葛拎着个布包进来，'])
   assert.ok(!errors.some(issue=>issue.quote===quote),`实际结算不应误伤：${quote}`);
 }
});

test('JSON Output 与历史工具响应使用同一校验，错说话者、假引文及真正漏字仍不放行',async()=>{
 const input=fixtures.find(row=>row.anchor==='a3_whimsy-1-8').input;
 const payload=reviewPayload(input),claims=payload.segments.map(segment=>claimFor(segment));
 for(const mutate of [
  rows=>{rows[0].speaker='不存在的说话者';},
  rows=>{rows[0].references=[{sourceId:'scene',quote:'不存在的证据原文'}];},
  rows=>{rows[0].quote=rows[0].quote.slice(1);rows[0].start++;},
 ]){
  const broken=structuredClone(claims);mutate(broken);
  const response={choices:[{finish_reason:'stop',message:{content:JSON.stringify({issues:[],claims:broken})}}]};
  const result=await reviewConsistency(input,{client:{generate:async()=>response}});
  assert.equal(result.verified,false);assert.equal(result.model.status,'failed');
 }
 const response={choices:[{finish_reason:'stop',message:{content:JSON.stringify({issues:[],claims})}}]};
 const good=await reviewConsistency(input,{client:{generate:async()=>response}});
 assert.equal(good.verified,true);assert.deepEqual(good.issues,[]);
});

test('arrival 由实际位置差和该 NPC 的在场通知共同收录，不从另一人的通知造移动',()=>{
 const before={minute:1,location:'mill',npcs:{npc_a:{name:'甲',location:'dock'},npc_b:{name:'乙',location:'dock'}}};
 const after={minute:2,location:'mill',npcs:{npc_a:{name:'甲',location:'mill'},npc_b:{name:'乙',location:'mill'}}};
 const receipts=[{tool:'world_time',eventId:'arrive',sequence:1,result:{ok:true,notices:[{type:'presence',text:'甲来到这里'}]}}];
 const settlement=reviewTurnSettlement({before,after},receipts);
 const movements=settlement.facts.filter(row=>row.id.includes(':presence:'));
 assert.deepEqual(movements.map(row=>row.subject),['npc_a']);assert.equal(movements[0].value.to,'mill');
 assert.equal(movements[0].value.from,undefined,'亲眼看到到场不授予先前离屏位置的知识');
 assert.deepEqual(movements[0].knownBy,['player','npc_a']);
 const noDiff=reviewTurnSettlement({before:after,after},receipts);
 assert.ok(!noDiff.facts.some(row=>row.id.includes(':presence:')));
});

test('多回执合计只累加可见的实际 holder 增减，不把原语双算或引入私密入账',async()=>{
 const base=fixtures[0].input;
 const input={...base,draft:'共收十六铜。',playerText:'核对本轮收入。',before:{minute:1},after:{minute:3},currentFacts:[],settlement:undefined,knowledge:{},clock:undefined,
  receipts:[0,1].map(i=>({tool:'world_trade',eventId:`pay-${i}`,sequence:i+1,participants:['npc_a'],result:{ok:true},applied:[{op:'transfer',resource:'coin',holder:'npc_a',delta:8}]}))};
 for(const amount of [16,32]){
  const result=await reviewConsistency(input,{client:{generate:async request=>{
   const payload=reviewPayload(request),source=payload.sources.find(row=>row.sourceId==='settlement-effect:total:npc_a:coin');
   return reviewResponse(request,[],payload.segments.map(s=>claimFor(s,{kind:'change',subject:'npc_a',object:'coin',quantity:amount,verdict:'supported',references:[{sourceId:source.sourceId,quote:'"delta":16'}]})));
  }}});
  assert.equal(result.verified,true);assert.equal(result.issues.some(i=>i.severity==='error'),amount!==16);
 }
});

test('聚合回执含时间和付款不能给未结算产物、另一个物品或无数量的效果补证',async()=>{
 const base=fixtures[0].input;
 const input={...base,draft:'你造好了四辆车。',playerText:'核对制作。',before:{minute:1},after:{minute:3},currentFacts:[],settlement:undefined,knowledge:{},clock:undefined,
  receipts:[{tool:'world_trade',eventId:'paid',sequence:1,result:{ok:true},applied:[{op:'time',minutes:2},{op:'transfer',resource:'coin',holder:'player',delta:-4}]}]};
 for(const object of ['cart',null]){
  const result=await reviewConsistency(input,{client:{generate:async request=>{
   const payload=reviewPayload(request);
   return reviewResponse(request,[],payload.segments.map(s=>claimFor(s,{kind:'change',subject:'player',object,quantity:4,verdict:'supported',references:[{sourceId:'receipt:0',quote:'"ok":true'}]})));
  }}});
  assert.equal(result.verified,true);assert.ok(result.issues.some(i=>i.severity==='error'),'付款-4铜不能支持+4产物');
 }
});

test('调用回执断言校验拒绝说明、替代、兜底和整份存档零写入，历史回执按锚点读取',()=>{
 const doc={state:{minute:1,records:{}}},receipt={status:'rejected',routed:'open:proposal',reason:'没有实际净化手段',alternatives:[],fallback:{available:true},applied:[]};
 const call={tool:'world_act',args:{action:'open:proposal',slots:{intent:'许愿'}},result:{ok:false,receipt},stateUnchanged:true};
 const rule={kind:'callReceipt',tool:'world_propose',statuses:['committed','rejected']};
 const check=(candidate,ruleOverride={})=>evaluateAssertions([{...rule,...ruleOverride}],{before:doc,after:doc,calls:[candidate],turnCalls:{earlier:[candidate]},reply:''})[0].pass;
 assert.equal(check(call),true);assert.equal(check(call,{anchor:'earlier'}),true);assert.equal(check(call,{anchor:'missing'}),false);
 const attempted=success=>evaluateAssertions([{kind:'calls',tool:'world_propose',min:1,success}],{before:doc,after:doc,calls:[call],reply:''})[0].pass;
 assert.equal(attempted(false),true,'标准拒绝也是一次真实提案调用');assert.equal(attempted(true),false,'拒绝不能计作成功调用');
 for(const candidate of [{...call,stateUnchanged:false},{...call,stateUnchanged:undefined},
  {...call,result:{ok:false,error:'只有异常文本'}},
  ...['reason','alternatives','fallback','applied'].map(key=>{const copy=structuredClone(call);delete copy.result.receipt[key];return copy;}),
  {...call,result:{receipt:{...receipt,applied:[{op:'create'}]}}},
 ])assert.equal(check(candidate),false);
 assert.equal(check({...call,result:{receipt:{status:'committed'}},stateUnchanged:false}),true);
 assert.deepEqual(doc.state.records,{});
});

test('真实 HTTP 的非法 consent 返回统一拒绝，整份存档及事件序号零写入，门禁保持 pending',async t=>{
 const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,consistencyClient:null});t.after(()=>server.close());
 const created=await server.api('create',{character:{name:'拒绝回归'}}),campaignId=created.reference.campaignId;
 const before=await server.api('read',{campaignId}),anchor='offline-consent';
 const turn=await server.api('review/begin',{campaignId,anchor,playerText:'我捧起池水许愿。',expectedSequence:before.reference.sequence});
 const slots={intent:'在旧渡口捧起池水许愿让它变成灵药',target:'feature_hw_pool',consent:{from:'player',scope:'捧水许愿',onRefusal:'放下水'}};
 const output=await server.api('execute',{campaignId,eventId:'offline-consent-0',anchor,expectedSequence:before.reference.sequence,tool:'world_act',args:{action:'open:proposal',slots}});
 const after=await server.api('read',{campaignId}),receipt=output.result.receipt;
 assert.equal(receipt.status,'rejected');assert.match(receipt.reason,/同意/);
 assert.equal(output.result.error,receipt.reason,'旧调用者仍能读取拒绝原因');
 assert.ok(Array.isArray(receipt.alternatives));assert.ok(receipt.fallback);assert.deepEqual(receipt.applied,[]);
 assert.deepEqual(after.document,before.document);assert.equal(after.reference.sequence,before.reference.sequence);
 const gate=await server.api('review/gate',{campaignId,token:turn.token,expectedSequence:after.reference.sequence});
 assert.equal(gate.status,'pending');assert.equal(gate.canCommit,false);
 const {consent,...ownSlots}=slots;
 const own=await server.api('execute',{campaignId,eventId:'offline-consent-1',anchor,expectedSequence:after.reference.sequence,tool:'world_act',args:{action:'open:proposal',slots:ownSlots}});
 assert.equal(own.result.receipt.status,'rejected');assert.doesNotMatch(own.result.receipt.reason,/需要对方答应/,'省略 consent 后按实际缺槽/能力拒绝，不能强要无主水体同意');
});

test('真实维修输出只用指针替换重复值，展开后逐字段等于原回执',async()=>{
 const raw=JSON.parse(await fs.readFile(new URL('./fixtures/a3rv/repair-result.json',import.meta.url),'utf8'));
 const saved=structuredClone(raw),projected=modelToolResult(raw);
 assert.deepEqual(raw,saved);assert.deepEqual(expandProjection(projected),raw);
 assert.ok(JSON.stringify(projected).length<JSON.stringify(raw).length*.7,'真实维修回执的模型窗口占用须降低至少三成');
 assert.equal(projected.receipt.status,'committed');assert.equal(projected.turnClock.elapsedMinutes,20);
 assert.equal(projected.factSummary,raw.factSummary);
});

test('真实回合证据的来源投影去重后，全部公开事实和原始来源逐字段保留',()=>{
 const input=fixtures.find(f=>f.anchor==='craft-1-1').input;
 const settlement=input.settlement;
 const gate={status:'ready',facts:input.currentFacts,settlement:{
  ...Object.fromEntries(['status','receiptCount','settled','queries','previews','failures','unresolved'].map(key=>[key,settlement[key]])),
  decisions:settlement.decisions.filter(row=>row.knownBy.includes('player')),facts:settlement.facts.filter(row=>row.knownBy.includes('player')),
 },candidates:[],preview:input.preview};
 const prompt=turnFactsPrompt(gate),projected=JSON.parse(prompt.split('\n')[1]);
 assert.deepEqual(expandProjection(projected),gate);
 assert.ok(JSON.stringify(projected).length<JSON.stringify(gate).length*.8);
 assert.match(prompt,/候选尚未执行，不能当成事实/);
});
