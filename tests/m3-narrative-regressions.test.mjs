import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {deterministicConsistencyReview,reviewConsistency,consistencyReviewRequest} from '../server-plugin/consistency-review.mjs';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';

const entities=[{id:'npc_hw_linsui',name:'林穗'},{id:'bld_hw_qingdeng',name:'青灯酒馆'}];
const state={minute:600,location:'bld_hw_qingdeng',player:{coins:174},records:{debt_room:{category:'debt',debtor:'player',creditor:'npc_hw_linsui',amount:6,paid:6,status:'已还清',deadline:590,overdueAt:590,paidAt:600}}};
const input=(draft,extra={})=>({playerText:'（场外）核对还款和逾期记录。',draft,before:structuredClone(state),after:structuredClone(state),allowedEntities:entities,receipts:[],...extra});
const response=()=>({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{function:{name:'report_consistency_issues',arguments:'{"issues":[]}'}}]}}]});

test('赊账修复复测的原句：还清余额不能抹去已有逾期史，引用真实 debt 而不修改它',async()=>{
 // docs/测试报告/最新/赊账修复复测.json /result/turns/8/reply
 const sample=input('欠款：已清零，无未偿债务，无逾期记录。'),saved=structuredClone(sample);
 const review=await reviewConsistency(sample);
 assert.ok(review.issues.some(row=>row.severity==='error'&&row.quote==='无逾期记录'&&row.evidence.some(ref=>ref.id==='after'&&ref.quote.includes('"overdueAt":590'))));
 assert.ok(review.rewriteRequest);assert.deepEqual(sample,saved);
 const evidence=JSON.parse(consistencyReviewRequest(sample).messages[1].content).evidence;
 assert.equal(JSON.parse(evidence.find(row=>row.id==='after').text).debts.debt_room.overdueAt,590);
});

test('当前无逾期欠款、旧逾期、玩家引文及疑问不被当成删除历史；按时还款无需逾期警告',()=>{
 for(const draft of ['已还清，没有未偿欠款；此前的逾期记录仍保留。','现在没有逾期欠款。','还清不代表没有逾期记录。','不能说从未逾期。','你刚才说“无逾期记录”，这句话需要核对。','是否没有逾期记录？','这笔钱从未逾期吗？','如果没有逾期记录，就能申请赊账。','林穗从未逾期。','他说没有逾期记录。','这笔新欠款从未逾期。'])assert.deepEqual(deterministicConsistencyReview(input(draft)).issues,[],draft);
 const onTime=structuredClone(state);delete onTime.records.debt_room.overdueAt;
 assert.deepEqual(deterministicConsistencyReview(input('没有逾期记录。',{before:onTime,after:onTime})).issues,[]);
 const unrelated=structuredClone(state);unrelated.records.debt_room.debtor='npc_other';
 assert.deepEqual(deterministicConsistencyReview(input('我从未逾期。',{before:unrelated,after:unrelated})).issues,[]);
});

test('场外任何尾注均为严重问题，0分也须删除；不依赖 clock，复审不再改写',async()=>{
 for(const extra of [0,10]){
  const sample=input(`核对完毕。<回合 额外="${extra}分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>`);
  const first=await reviewConsistency(sample),second=await reviewConsistency(sample,{rewriteAttempt:1});
  assert.ok(first.issues.some(row=>row.category==='time'&&row.severity==='error'));
  assert.match(first.rewriteRequest.instruction,/删除所有回合尾注/);
  assert.equal(second.rewriteExhausted,true);assert.equal(second.rewriteRequest,null);
 }
 assert.deepEqual(deterministicConsistencyReview(input('核对完毕。')).issues,[]);
 const advanced=input('核对完毕。',{clock:{location:'bld_hw_qingdeng',startMinute:590,minute:600,present:[]}});
 assert.ok(deterministicConsistencyReview(advanced).issues.some(row=>row.category==='time'&&row.severity==='error'&&row.reason.includes('真实账本已经推进时间')));
});

test('未登记朱家老屋及明确命名的物品拒绝，普通家具、隐喻和已登记别名不误报',()=>{
 const judge=(draft,extra={})=>deterministicConsistencyReview(input(draft,{playerText:'我问附近的房屋。',...extra})).issues;
 const place=judge('他指向朱家老屋。').find(row=>row.entityName==='朱家老屋');
 assert.equal(place?.entityKind,'location');assert.equal(place?.severity,'error');
 assert.ok(judge('门外就是赵家宅院。').some(row=>row.entityKind==='location'));
 assert.ok(judge('门外就是方家老屋。').some(row=>row.entityName==='方家老屋'),'普通姓氏方仍需登记');
 assert.ok(judge('一柄名为“银叶”的法杖靠在墙边。').some(row=>row.entityName==='银叶'&&row.entityKind==='item'));
 for(const draft of ['一张木椅摆在老屋门边。','他家老屋的门开着。','他指向对方家老屋。','双方家宅院的门都开着。','各方家宅院都有普通木椅。','冷意像一根名为寒意的针。','冷意像一柄名为“霜意”的刀。','一把普通木杖靠在墙边。','这段名为“劳作”的生活仍在继续。'])assert.deepEqual(judge(draft),[],draft);
 const registry=[...entities,{id:'bld_house',name:'旧宅',aliases:['朱家老屋']},{id:'item_staff',name:'银叶',kind:'item'}];
 assert.deepEqual(judge('他指向朱家老屋，拿起名为“银叶”的法杖。',{allowedEntities:registry}),[]);
});

async function begin(server,view,playerText,anchor){return server.api('review/begin',{campaignId:view.reference.campaignId,anchor,playerText,expectedSequence:view.reference.sequence});}

test('HTTP 未登记地点改写失败拒交，成功改为无专名描写；始终不登记人口或重做工具',async t=>{
 for(const fail of [false,true]){
  const tail='<回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>',original='他指向朱家老屋。'+tail,corrected='他指向一间老屋。'+tail;let rewrites=0;
  const client={async generate(body,label){if(label.startsWith('consistency-rewrite:')){rewrites++;assert.equal(body.tools,undefined);return {choices:[{finish_reason:'stop',message:{content:fail?original:corrected}}]};}return response();}};
  const server=await createPlaytestServer({consistencyClient:client});t.after(()=>server.close());const view=await server.api('create',{}),campaignId=view.reference.campaignId;
  const begun=await begin(server,view,'我问附近的房屋。','house'),request={campaignId,token:begun.token,draft:original,expectedSequence:view.reference.sequence};
  const result=await server.api('review/reply',request);assert.equal(result.canCommit,!fail);assert.equal(result.rewritten,!fail);assert.equal(result.text,fail?original:corrected);
  assert.deepEqual((await server.api('read',{campaignId})).document,view.document);assert.deepEqual(await server.api('review/reply',request),result);assert.equal(rewrites,1);
 }
});

test('HTTP 场外尾注仅一次纯文字改写；改写失败时拒交，账本零计时且原文和warning保留',async t=>{
 for(const fail of [false,true]){
  const original='核对完毕。<回合 额外="10分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>',corrected='核对完毕。';let calls=0;
  const client={async generate(body,label){calls++;
   if(label.startsWith('consistency-rewrite:')){assert.equal(body.tools,undefined);return {choices:[{finish_reason:'stop',message:{content:fail?original:corrected}}]};}
   if(!fail&&JSON.parse(body.messages[1].content).rawDraft===corrected)return {choices:[{finish_reason:'tool_calls',message:{tool_calls:[{function:{name:'report_consistency_issues',arguments:JSON.stringify({issues:[{category:'meta',severity:'warning',quote:'核对完毕',reason:'仍需复核的软问题',evidence:[{id:'player',quote:'核对'}]}]})}}]}}]};
   return response();
  }};
  const server=await createPlaytestServer({consistencyClient:client});t.after(()=>server.close());const view=await server.api('create',{}),campaignId=view.reference.campaignId;
  const begun=await begin(server,view,'（场外）核对账本。','ooc'),request={campaignId,token:begun.token,draft:original,expectedSequence:view.reference.sequence};
  const result=await server.api('review/reply',request);
  assert.equal(result.canCommit,!fail);assert.equal(result.rewritten,!fail);assert.equal(result.attempts,1);assert.equal(result.original,original);
  assert.equal(result.text,fail?original:corrected);assert.equal(result.tail.valid,!fail);
  if(!fail){assert.equal(result.status,'issues');assert.equal(result.issues[0].severity,'warning');}
  assert.deepEqual((await server.api('read',{campaignId})).document,view.document);
  assert.deepEqual(await server.api('review/reply',request),result);assert.equal(calls,fail?2:3);
  if(fail)await assert.rejects(server.api('execute',{campaignId,anchor:'ooc',eventId:'tail',tool:'world_turn',args:result.tail.args,reviewId:result.reviewId,expectedSequence:result.sequence}),/不一致/);
 }
});

test('HTTP 真实逾期和还款后核对：纯文字改写保留扣钱和信任损失，失败不再扣款',async t=>{
 for(const fail of [false,true]){
  let rewrites=0;const client={async generate(body,label){
   if(label.startsWith('consistency-rewrite:')){rewrites++;assert.equal(body.tools,undefined);const payload=JSON.parse(body.messages.at(-1).content);
    assert.ok(JSON.parse(payload.evidence.find(row=>row.id==='after').text).debts.debt_rent.overdueAt);
    return {choices:[{finish_reason:'stop',message:{content:fail?'欠款已清零，无逾期记录。':'欠款已还清，此前逾期记录仍保留。'}}]};
   }return response();
  }};
  const server=await createPlaytestServer({consistencyClient:client});t.after(()=>server.close());let view=await server.api('create',{});const campaignId=view.reference.campaignId;
  async function act(tool,args,id,anchor=id){const r=await server.api('execute',{campaignId,anchor,eventId:id,tool,args,expectedSequence:view.reference.sequence});view=await server.api('read',{campaignId});return r;}
  const trust=view.document.state.npcs.npc_hw_linsui.trust,coins=view.document.state.player.coins;
  await act('world_trade',{seller:'林穗',service:'住宿',payment:'credit',creditMinutes:60},'rent');
  await act('world_time',{minutes:60},'late');
  await act('world_trade',{seller:'林穗',payment:'repay',debt:'debt_rent'},'paid');
  const begun=await begin(server,view,'（场外）核对我刚还清的欠款及逾期史。','repay');
  const saved=structuredClone(view.document),request={campaignId,token:begun.token,draft:'欠款已清零，无逾期记录。',expectedSequence:view.reference.sequence};
  const result=await server.api('review/reply',request);
  assert.equal(result.canCommit,!fail);assert.equal(result.rewritten,!fail);assert.equal(rewrites,1);
  assert.equal(saved.state.player.coins,coins-6);assert.equal(saved.state.npcs.npc_hw_linsui.trust,trust-5);
  assert.equal(saved.state.records.debt_rent.status,'已还清');assert.ok(saved.state.records.debt_rent.overdueAt);
  assert.deepEqual((await server.api('read',{campaignId})).document,saved);await server.api('review/reply',request);assert.equal(rewrites,1);
 }
});

test('检索合同缺口证据：真实 search 与未 search 均无账本事件，不能把事件缺席认定为未检索',async t=>{
 const server=await createPlaytestServer({consistencyClient:null});t.after(()=>server.close());const view=await server.api('create',{}),campaignId=view.reference.campaignId;
 const begun=await begin(server,view,'（场外）查找旧事。','lookup');
 const before=await server.api('export',{campaignId}),found=await server.api('search',{campaignId,query:'林穗'}),after=await server.api('export',{campaignId});
 assert.ok(found.results.length>0);assert.deepEqual(after.events,before.events);
 const result=await server.api('review/reply',{campaignId,token:begun.token,draft:'我打算检索旧事；你刚才说“检索到”。',expectedSequence:view.reference.sequence});
 const record=JSON.parse(await fs.readFile(path.join(server.directory,'infinite-fields',campaignId,'consistency',`${result.reviewId}.json`),'utf8'));
 assert.deepEqual(record.evidence.receipts,[],'read-only search 的真实执行无法从账本事件重建');
 assert.equal(result.verified,false);assert.equal(result.canCommit,true,'计划和引述不应被误判为检索完成');
});
