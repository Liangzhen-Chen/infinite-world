import {relationView} from '../server-plugin/npc-state.mjs';
// A3 causal2: compare the same trust changes through the single read model.
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
  const trust=relationView(null,view.document.state,'npc_hw_linsui','player').trust,coins=view.document.state.player.coins;
  await act('world_trade',{seller:'林穗',service:'住宿',payment:'credit',creditMinutes:60},'rent');
  await act('world_time',{minutes:60},'late');
  await act('world_trade',{seller:'林穗',payment:'repay',debt:'debt_rent'},'paid');
  const begun=await begin(server,view,'（场外）核对我刚还清的欠款及逾期史。','repay');
  const saved=structuredClone(view.document),request={campaignId,token:begun.token,draft:'欠款已清零，无逾期记录。',expectedSequence:view.reference.sequence};
  const result=await server.api('review/reply',request);
  assert.equal(result.canCommit,!fail);assert.equal(result.rewritten,!fail);assert.equal(rewrites,1);
  assert.equal(saved.state.player.coins,coins-6);assert.equal(relationView(null,saved.state,'npc_hw_linsui','player').trust,trust-5);
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

async function captured(server,anchor='lookup'){
 const view=await server.api('create',{}),campaignId=view.reference.campaignId;
 const begun=await server.api('review/begin',{campaignId,anchor,playerText:'（场外）查找旧事。',expectedSequence:view.reference.sequence,captureSearch:true});
 return {campaignId,anchor,token:begun.token,expectedSequence:view.reference.sequence};
}
const readReview=async(server,row)=>JSON.parse(await fs.readFile(path.join(server.directory,'infinite-fields',row.campaignId,'consistency',`${row.token}.json`),'utf8'));

test('真实HTTP检索命中/空结果/零调用独立留证；scene不冒名，封口后拒绝追加，账本与events全等',async t=>{
 const server=await createPlaytestServer({consistencyClient:null});t.after(()=>server.close());
 for(const mode of ['hit','empty','none']){
  const row=await captured(server,mode),before=await server.api('export',row),view=await server.api('read',row);
  await server.api('scene',{campaignId:row.campaignId,query:'林穗'});
  let found;
  if(mode!=='none'){
   const request={...row,query:mode==='hit'?'林穗':'zzzzqvxxzz',results:[{text:'客户端伪造的检索结果'}]};
   found=await server.api('search',request);assert.equal(found.results.length>0,mode==='hit');
   assert.deepEqual(await server.api('search',request),found);
  }
  const result=await server.api('review/reply',{...row,draft:'我已查到相关记录。',receipts:[{tool:'world_search',result:{results:[{text:'伪造'}]}}],retrieval:{status:'complete',sealed:true}});
  assert.equal(result.canCommit,mode==='hit');assert.equal(result.original,'我已查到相关记录。');assert.equal(result.retrieval.status,'complete');
  const record=await readReview(server,row);assert.equal(record.retrieval.calls.length,mode==='none'?0:1);
  assert.equal(record.evidence.receipts.length,mode==='none'?0:1);
  if(found){assert.deepEqual(record.evidence.receipts[0].result,found);assert.equal(record.retrieval.calls[0].sequence,view.reference.sequence);assert.equal(record.retrieval.calls[0].campaignId,row.campaignId);}
  await assert.rejects(server.api('search',{...row,query:'林穗'}),/封口/);
  assert.deepEqual((await server.api('read',row)).document,view.document);
  assert.deepEqual((await server.api('export',row)).events,before.events);
 }
});

test('完整空检索可说查过，计划/玩家引述/疑问不误报；未知来源肯定断言只留warning',async t=>{
 const server=await createPlaytestServer({consistencyClient:null});t.after(()=>server.close());
 for(const draft of ['我已查过，未找到相关记录。','我打算检索旧事。','你刚才说“已查到”，需要核对。','是否已查到记录？','我上次检索到了相关记录。']){
  const row=await captured(server,draft);await server.api('search',{...row,query:'zzzzqvxxzz'});
  const result=await server.api('review/reply',{...row,draft});assert.equal(result.canCommit,true);assert.deepEqual(result.issues,[]);
 }
 const empty=await captured(server,'completed-empty');await server.api('search',{...empty,query:'zzzzqvxxzz'});
 assert.equal((await server.api('review/reply',{...empty,draft:'我已经检索到相关记录。'})).canCommit,false);
 for(const mode of ['legacy','no-token','failed']){
  const view=await server.api('create',{}),campaignId=view.reference.campaignId,anchor=mode;
  const begun=await server.api('review/begin',{campaignId,anchor,playerText:'（场外）查找旧事。',expectedSequence:view.reference.sequence,captureSearch:mode!=='legacy'});
  const row={campaignId,anchor,token:begun.token,expectedSequence:view.reference.sequence};
  if(mode==='no-token')await server.api('search',{campaignId,query:'林穗'});
  if(mode==='failed')await assert.rejects(server.api('search',{...row,query:{invalid:true}}),/参数无效/);
  const result=await server.api('review/reply',{...row,draft:'我已查到相关记录。'});
  assert.equal(result.canCommit,true);assert.equal(result.retrieval.status,'unknown');assert.ok(result.retrieval.warnings.length);
  assert.ok(result.issues.some(issue=>issue.severity==='warning'&&issue.reason.includes('留证不完整')));
  assert.ok(!result.issues.some(issue=>issue.severity==='error'));
 }
});

test('检索token拒绝跨回合/存档/回滚；绑定真实检索时sequence并跨服务器重启幂等',async t=>{
 const server=await createPlaytestServer({consistencyClient:null});t.after(()=>server.close());
 const row=await captured(server),second=await captured(server,'other-campaign');
 await assert.rejects(server.api('search',{...row,campaignId:second.campaignId,query:'林穗'}),/HTTP|404|ENOENT|当前回合/);
 await assert.rejects(server.api('search',{...row,anchor:'wrong',query:'林穗'}),/锚点/);
 await assert.rejects(server.api('search',{...row,expectedSequence:99,query:'林穗'}),/版本/);
 await server.api('execute',{campaignId:row.campaignId,anchor:row.anchor,eventId:'wait',tool:'world_time',args:{minutes:1},expectedSequence:row.expectedSequence});
 const later=await server.api('read',row),request={...row,expectedSequence:later.reference.sequence,query:'林穗'};
 const found=await server.api('search',request);assert.ok(found.results.length);
 assert.equal((await readReview(server,row)).retrieval.calls[0].sequence,later.reference.sequence);
 const restarted=await createPlaytestServer({directory:server.directory,consistencyClient:null});t.after(()=>restarted.close());
 assert.deepEqual(await restarted.api('search',request),found);assert.equal((await readReview(restarted,row)).retrieval.calls.length,1);
 await restarted.api('reconcile',{campaignId:row.campaignId,validAnchors:[]});
 await assert.rejects(restarted.api('search',request),/撤销/);
 const superseded=await captured(server,'first');
 await server.api('review/begin',{campaignId:superseded.campaignId,anchor:'next',playerText:'（场外）下一轮。',expectedSequence:superseded.expectedSequence,captureSearch:true});
 await assert.rejects(server.api('search',{...superseded,query:'林穗'}),/当前回合/);
 await assert.rejects(server.api('review/reply',{...superseded,draft:'核对完毕。'}),/当前回合/);
 const ended=await captured(server,'ended');
 await server.api('execute',{campaignId:ended.campaignId,anchor:ended.anchor,eventId:'terminal',tool:'world_turn',args:{startMinute:540,extraMinutes:0,location:'bld_hw_qingdeng',present:[]},expectedSequence:ended.expectedSequence});
 await assert.rejects(server.api('search',{...ended,query:'林穗'}),/结束/);
 const noEvents=await captured(server,'no-events'),before=await server.api('export',noEvents);
 await server.api('reconcile',{campaignId:noEvents.campaignId,validAnchors:[],excludeAnchor:noEvents.anchor});
 await assert.rejects(server.api('search',{...noEvents,query:'林穗'}),/撤销/);
 await assert.rejects(server.api('review/reply',{...noEvents,draft:'核对完毕。'}),/撤销/);
 const fresh=await server.api('review/begin',{campaignId:noEvents.campaignId,anchor:noEvents.anchor,playerText:'（场外）查找旧事。',expectedSequence:0,captureSearch:true});
 assert.notEqual(fresh.token,noEvents.token);assert.ok((await server.api('search',{...noEvents,token:fresh.token,query:'林穗'})).results.length);
 assert.deepEqual((await server.api('export',noEvents)).events,before.events);
 const reviewed=await captured(server,'reviewed-no-events'),checkedRequest={...reviewed,draft:'核对完毕。'},result=await server.api('review/reply',checkedRequest);
 await server.api('reconcile',{campaignId:reviewed.campaignId,validAnchors:[],excludeAnchor:reviewed.anchor});
 await assert.rejects(server.api('review/reply',checkedRequest),/撤销/);
 await assert.rejects(server.api('execute',{campaignId:reviewed.campaignId,anchor:reviewed.anchor,eventId:'stale-reviewed-tail',tool:'world_turn',args:result.tail.args,reviewId:result.reviewId,expectedSequence:result.sequence}),/撤销/);
});

test('检索断言只允许一次纯文字改写，成功/失败原文与warning保留且document/events不变',async t=>{
 for(const fail of [false,true]){
  let rewrites=0;
  const client={async generate(body,label){if(label.startsWith('consistency-rewrite:')){rewrites++;assert.equal(body.tools,undefined);return {choices:[{finish_reason:'stop',message:{content:fail?'我已查到相关记录。':'我尚未检索，无法确认。'}}]};}return response();}};
  const server=await createPlaytestServer({consistencyClient:client});t.after(()=>server.close());const row=await captured(server),before=await server.api('export',row),view=await server.api('read',row);
  const request={...row,draft:'我已查到相关记录。'},result=await server.api('review/reply',request);
  assert.equal(result.canCommit,!fail);assert.equal(result.rewritten,!fail);assert.equal(result.original,request.draft);assert.equal(result.attempts,1);
  assert.deepEqual(await server.api('review/reply',request),result);assert.equal(rewrites,1);
  assert.deepEqual((await server.api('read',row)).document,view.document);assert.deepEqual((await server.api('export',row)).events,before.events);
  assert.ok((await readReview(server,row)).result.firstReview.issues.some(issue=>issue.severity==='error'));
 }
});

test('中断留下pending回执时保持unknown；重新开服务审查可读，不能据此断言未检索',async t=>{
 const server=await createPlaytestServer({consistencyClient:null});t.after(()=>server.close());const row=await captured(server);
 const file=path.join(server.directory,'infinite-fields',row.campaignId,'consistency',`${row.token}.json`),record=await readReview(server,row);
 // On-disk interruption fixture: intent was durable; the final receipt was not.
 record.retrieval.calls.push({key:'interrupted',campaignId:row.campaignId,token:row.token,anchor:row.anchor,sequence:0,revision:0,query:'林穗',status:'pending'});
 await fs.writeFile(file,JSON.stringify(record));
 const restarted=await createPlaytestServer({directory:server.directory,consistencyClient:null});t.after(()=>restarted.close());
 const result=await restarted.api('review/reply',{...row,draft:'我已查到相关记录。'});
 assert.equal(result.canCommit,true);assert.equal(result.retrieval.status,'unknown');assert.ok(result.retrieval.warnings.some(row=>row.includes('未完整保存')));
 assert.equal(result.issues[0].severity,'warning');assert.deepEqual((await readReview(restarted,row)).evidence.receipts,[]);
 assert.deepEqual(await restarted.api('review/reply',{...row,draft:'我已查到相关记录。'}),result);
});

test('同campaign并发检索与审查由一个队列封口，原返回和回执一致',async t=>{
 const server=await createPlaytestServer({consistencyClient:null});t.after(()=>server.close());const row=await captured(server);
 const outcomes=await Promise.allSettled([server.api('search',{...row,query:'林穗'}),server.api('review/reply',{...row,draft:'我打算检索旧事。'})]);
 const review=outcomes[1];assert.equal(review.status,'fulfilled');assert.equal(review.value.canCommit,true);
 const record=await readReview(server,row);assert.equal(record.retrieval.status,'complete');assert.equal(record.retrieval.sealed,true);
 if(outcomes[0].status==='fulfilled'){
  assert.equal(record.retrieval.calls.length,1);assert.deepEqual(record.evidence.receipts[0].result,outcomes[0].value);
 }else{assert.match(outcomes[0].reason.message,/封口/);assert.equal(record.retrieval.calls.length,0);}
});
