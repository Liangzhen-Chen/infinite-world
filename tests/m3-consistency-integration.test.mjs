import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createPlaytestServer,runPlaytest} from '../tools/playtest-runner.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';

const draft='<q who="npc_unregistered">面包给你。</q><回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>';
const corrected='<q who="npc_hw_linsui">面包给你。</q><回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>';
const issuesResponse=issues=>({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:'report_consistency_issues',arguments:JSON.stringify({issues})}}]}}]});
function clientFixture({badRewrite=false,failReview=false}={}){
 const calls=[];
 return {calls,async generate(body,label){
  calls.push({body,label});
  if(label.startsWith('consistency-rewrite:')){
   assert.equal(body.tools,undefined,'文字改写不能重新调用行动工具');
   return {choices:[{finish_reason:'stop',message:{content:badRewrite?draft:corrected}}]};
  }
  if(failReview)throw Error('审查服务离线');
  const payload=JSON.parse(body.messages[1].content);
  assert.ok(payload.evidence.some(row=>row.id==='receipt:0'&&row.text.includes('world_trade')));
  assert.ok(payload.evidence.some(row=>row.id==='scene'&&row.text.includes('林穗')));
  return issuesResponse([]);
 }};
}
async function acted(server){
 const first=await server.api('create',{}),campaignId=first.reference.campaignId,anchor='buy-bread';
 const begun=await server.api('review/begin',{campaignId,anchor,playerText:'我付钱买一个面包',expectedSequence:first.reference.sequence});
 const bought=await server.api('execute',{campaignId,anchor,eventId:'bread',tool:'world_trade',args:{seller:'林穗',item:'面包',quantity:1},expectedSequence:first.reference.sequence});
 bought.document=(await server.api('read',{campaignId})).document;
 const reviewRequest={campaignId,token:begun.token,draft,query:'我付钱买一个面包',expectedSequence:bought.reference.sequence};
 return {first,campaignId,anchor,begun,bought,reviewRequest};
}

test('HTTP：真实交易先保存，矛盾正文只改一次，复审后唯一尾注且重试不重扣款',async t=>{
 const client=clientFixture(),server=await createPlaytestServer({consistencyClient:client});t.after(()=>server.close());
 const row=await acted(server),review=await server.api('review/reply',row.reviewRequest);
 assert.equal(review.status,'verified');assert.equal(review.rewritten,true);assert.equal(review.attempts,1);assert.equal(client.calls.length,3);
 assert.equal(review.text,corrected);assert.equal(review.original,draft);
 const reviewed=await server.api('read',{campaignId:row.campaignId});assert.deepEqual(reviewed.document,row.bought.document,'审查不得改账');
 const cached=await server.api('review/reply',row.reviewRequest);assert.deepEqual(cached,review);assert.equal(client.calls.length,3);
 await assert.rejects(server.api('review/reply',{...row.reviewRequest,draft:corrected}),/不能|已经/);
 const request={campaignId:row.campaignId,anchor:row.anchor,eventId:`turn_${row.anchor}`,tool:'world_turn',args:review.tail.args,reviewId:review.reviewId,expectedSequence:review.sequence};
 await assert.rejects(server.api('execute',{...request,args:{...request.args,extraMinutes:10}}),/不一致/);
 await server.api('execute',request);assert.equal((await server.api('execute',request)).duplicate,true);
 const exported=await server.api('export',{campaignId:row.campaignId});
 assert.equal(exported.events.filter(e=>e.input?.tool==='world_trade').length,1);
 assert.equal(exported.events.filter(e=>e.input?.tool==='world_turn').length,1);
 const record=JSON.parse(await fs.readFile(path.join(server.directory,'infinite-fields',row.campaignId,'consistency',`${review.reviewId}.json`),'utf8'));
 assert.equal(record.result.original,draft);assert.equal(record.rewrite.text,corrected);assert.equal(record.evidence.receipts.length,1);
 const imports=await server.api('import',{bundle:exported});assert.equal(imports.document.state.player.coins,reviewed.document.state.player.coins);assert.equal(client.calls.length,3,'导入回放不能再次审查或改写');
 await server.api('reconcile',{campaignId:row.campaignId,validAnchors:[]});
 await assert.rejects(server.api('review/reply',row.reviewRequest),/撤销|变化/);
});

test('唯一改写仍有严重问题时明确阻止尾注，原文和已支付交易均保留',async t=>{
 const client=clientFixture({badRewrite:true}),server=await createPlaytestServer({consistencyClient:client});t.after(()=>server.close());
 const row=await acted(server),review=await server.api('review/reply',row.reviewRequest);
 // Failed drafts are diagnostic originals; the public text is now the safe
 // replay-derived template. The action and refusal guarantees are unchanged.
 assert.equal(review.canCommit,false);assert.equal(review.verified,false);assert.equal(review.status,'unverified');assert.equal(review.original,draft);assert.equal(review.text,review.safeText);assert.notEqual(review.text,draft);assert.equal(review.attempts,1);assert.match(review.feedback,/尾注未提交/);
 await assert.rejects(server.api('execute',{campaignId:row.campaignId,anchor:row.anchor,eventId:'bad-tail',tool:'world_turn',args:review.tail.args,reviewId:review.reviewId,expectedSequence:review.sequence}),/不一致/);
 const after=await server.api('read',{campaignId:row.campaignId});assert.deepEqual(after.document,row.bought.document);
 await server.api('review/reply',row.reviewRequest);assert.equal(client.calls.length,3);
});

test('缺少模型服务或关闭审查均不伪装通过，审查只采用服务端真实回执',async t=>{
 const server=await createPlaytestServer({consistencyClient:null});t.after(()=>server.close());
 const row=await acted(server),review=await server.api('review/reply',{...row.reviewRequest,draft:corrected,receipts:[{result:{coins:999}}]});
 assert.equal(review.status,'unverified');assert.equal(review.verified,false);assert.equal(review.canCommit,true);assert.match(review.feedback,/未完成/);
 const other=await createPlaytestServer({consistencyEnabled:false});t.after(()=>other.close());
 const disabled=await acted(other),result=await other.api('review/reply',disabled.reviewRequest);
 assert.equal(result.status,'disabled');assert.equal(result.verified,false);
});

test('试玩沿正式提示和 HTTP 审查改写，再只提交一次尾注',async t=>{
 const reviewClient=clientFixture(),server=await createPlaytestServer({consistencyClient:reviewClient});t.after(()=>server.close());
 let requests=0;
 const narrator={async generate({messages,tools}){
  assert.ok(messages[0].content.includes('无限原野'));assert.ok(tools.length>10);requests++;
  return requests===1?{choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:'bread',type:'function',function:{name:'world_trade',arguments:JSON.stringify({seller:'林穗',item:'面包',quantity:1})}}]}}]}:{choices:[{finish_reason:'stop',message:{content:draft}}]};
 }};
 const result=await runPlaytest({scenario:{id:'review-pipeline',initial:{mode:'legacy'},turns:[{input:'我付钱买一个面包',assertions:[{kind:'delta',path:'state.player.coins',value:-2}]}]},api:server.api,client:narrator,bundle:await loadPromptBundle()});
 assert.equal(result.pass,true,JSON.stringify(result.turns[0]));assert.equal(result.turns[0].originalReply,draft);assert.equal(result.turns[0].reply,corrected);
 assert.equal(result.turns[0].consistency.status,'verified');assert.equal(result.turns[0].calls.length,1);assert.ok(result.turns[0].turnResult);assert.equal(requests,2);assert.equal(reviewClient.calls.length,3);
});

test('警告保留为 issues，已完成审查与可提交分别报告且重读不触发改写',async t=>{
 const warning={category:'fact',severity:'warning',quote:'面包给你。',reason:'这句话的隐含背景仍需叙述复核',evidence:[{id:'player',quote:'我付钱买一个面包'}]};
 let calls=0;const client={async generate(body,label){calls++;assert.ok(label.startsWith('consistency:'));return issuesResponse([warning]);}};
 const server=await createPlaytestServer({consistencyClient:client});t.after(()=>server.close());
 const row=await acted(server),request={...row.reviewRequest,draft:corrected};
 const review=await server.api('review/reply',request);
 assert.equal(review.status,'issues');assert.equal(review.verified,true);assert.equal(review.canCommit,true);
 assert.equal(review.rewritten,false);assert.equal(review.attempts,0);assert.deepEqual(review.issues,[{...warning,source:'model'}]);
 const tail={campaignId:row.campaignId,anchor:row.anchor,eventId:`turn_${row.anchor}`,tool:'world_turn',args:review.tail.args,reviewId:review.reviewId,expectedSequence:review.sequence};
 await server.api('execute',tail);assert.deepEqual(await server.api('review/reply',request),review);assert.equal(calls,1);
 const saved=JSON.parse(await fs.readFile(path.join(server.directory,'infinite-fields',row.campaignId,'consistency',`${review.reviewId}.json`),'utf8'));
 assert.deepEqual(saved.result.firstReview.issues,review.issues);assert.deepEqual(saved.result.review.issues,review.issues);
 const exported=await server.api('export',{campaignId:row.campaignId});assert.equal(exported.events.filter(e=>e.input?.tool==='world_trade').length,1);assert.equal(exported.events.filter(e=>e.input?.tool==='world_turn').length,1);
});

const recalledFailure='<q who="npc_hw_ayan">这十天我没闲着。两回都成了，工坊那边收了两个铜。</q><回合 额外="5分" 地点="bld_hw_mill" 在场="npc_hw_ayan"/>';

test('T97 回放private失败移动：唯一改写保留失败，伪造成功的正文或地点均阻止尾注',async t=>{
 const report=JSON.parse(await fs.readFile(new URL('../docs/测试报告/M2-recheck/真实试玩.json',import.meta.url),'utf8'));
 const original=report.results.find(row=>row.id==='npc_private').turns.find(row=>row.calls?.some(call=>call.tool==='world_move'&&call.result.ok===false));
 const budget=JSON.parse(await fs.readFile(new URL('../docs/测试报告/M2-recheck/persistent-budget.json',import.meta.url),'utf8'));
 const saved=Object.values(budget.requests).find(row=>row.response?.measurement?.label==='consistency-rewrite:fbc0e131083569dec553').response.choices[0].message.content;
 for(const mode of ['valid','false-body','false-location']){
  let rewrites=0,reviews=0,candidate;
  const client={async generate(body,label){
   if(label.startsWith('consistency-rewrite:')){
    rewrites++;const payload=JSON.parse(body.messages.at(-1).content);
    assert.match(body.messages.at(-2).content,/ok=false的工具失败必须保留/);
    assert.match(payload.instruction,/工具失败保持失败/);
    assert.ok(payload.evidence.some(row=>row.kind==='receipt'&&JSON.parse(row.text).result.ok===false));
    assert.equal(JSON.parse(payload.evidence.find(row=>row.id==='after').text).location,'bld_hw_qingdeng');
    assert.ok(!payload.evidence.some(row=>row.id.startsWith('prior:')||row.id.startsWith('knowledge:')));
    return {choices:[{finish_reason:'stop',message:{content:candidate}}]};
   }
   reviews++;
   if(reviews===1)return issuesResponse([{category:'agency',severity:'error',quote:'脚还没跨出门槛就停住了',reason:'替玩家决定停住',evidence:[{id:'player',quote:original.input}]}]);
   return issuesResponse([]);
  }};
  const server=await createPlaytestServer({consistencyClient:client});t.after(()=>server.close());
  let view=await server.api('create',{});const campaignId=view.reference.campaignId;
  async function act(tool,args,id){const result=await server.api('execute',{campaignId,anchor:id,eventId:id,tool,args,expectedSequence:view.reference.sequence});view=await server.api('read',{campaignId});return result;}
  await act('world_move',{destination:'bld_hw_qingdeng'},'tavern');
  await act('world_promise',{operation:'create',promisor:'npc_hw_linsui',promisee:'player',type:'会面',content:'欠款六铜只由二人当面核对',location:'bld_hw_qingdeng',deadline:view.document.state.minute+60},'meeting');
  const anchor='leave',begun=await server.api('review/begin',{campaignId,anchor,playerText:original.input,expectedSequence:view.reference.sequence});
  await assert.rejects(act('world_move',original.calls[0].args,anchor),/会面时段冲突/);
  // A prerequisite failure alone now uses pending, with no model rewrite.
  // Record a real greeting in this meeting to retain the semantic rewrite
  // regression for failed movement on an adjudicated turn.
  await act('world_remember',{subject:'npc_hw_linsui',key:'dialogue:greet',content:'你好'},anchor);
  const actual=structuredClone(view.document),tail='<回合 额外="0分" 地点="bld_hw_qingdeng" 在场=""/>';
  candidate=mode==='valid'?'会面时段与离开请求冲突，约定仍然有效。若要离开，可先取消约定。'+tail:mode==='false-body'?saved.replace(/<回合[^>]*\/>/,tail):saved;
  const request={campaignId,token:begun.token,draft:original.originalReply,expectedSequence:view.reference.sequence};
  const reviewed=await server.api('review/reply',request);
  assert.equal(reviewed.canCommit,mode==='valid');assert.equal(reviewed.rewritten,mode==='valid');assert.equal(reviewed.attempts,1);assert.equal(rewrites,1);
  assert.deepEqual((await server.api('read',{campaignId})).document,actual);
  assert.deepEqual(await server.api('review/reply',request),reviewed);assert.equal(rewrites,1);
  if(mode==='valid'){
   await server.api('execute',{campaignId,anchor,eventId:'turn_leave',tool:'world_turn',args:reviewed.tail.args,reviewId:reviewed.reviewId,expectedSequence:reviewed.sequence});
   const after=await server.api('read',{campaignId});assert.equal(after.document.state.location,actual.state.location);assert.equal(after.document.state.minute,actual.state.minute);
  }else{
   assert.equal(reviewed.verified,false);assert.equal(reviewed.original,original.originalReply);assert.equal(reviewed.text,reviewed.safeText);assert.notEqual(reviewed.text,original.originalReply);
   if(mode==='false-body')assert.ok(reviewed.issues.some(issue=>issue.category==='location'&&issue.severity==='error'));
  }
 }
});

test('N17 服务端实际十天结算只允许一次文字改写，不重做、不重复收费，仍失败阻止尾注',async t=>{
 for(const badRewrite of [false,true]){
  let rewriteCalls=0,reviewCalls=0;
  const client={async generate(body,label){
   if(label.startsWith('consistency-rewrite:')){
    rewriteCalls++;assert.equal(body.tools,undefined);
    const payload=JSON.parse(body.messages.at(-1).content),recall=JSON.parse(payload.evidence.find(row=>row.id==='recall:npc_hw_ayan').text),totals=recall.totals;
    assert.equal(recall.speaker,'npc_hw_ayan');assert.ok(totals.failures>0);assert.ok(totals.attempts>2);assert.equal(totals.fee,totals.attempts*2);assert.equal(totals.materials.item_wood,totals.attempts);
    for(const row of payload.evidence.filter(row=>['before','after'].includes(row.id)))assert.equal(JSON.parse(row.text).quests,undefined);
    const content=badRewrite?recalledFailure:'<q who="npc_hw_ayan">这十天试了'+totals.attempts+'次，有'+totals.successes+'次成功，'+totals.failures+'次失败，工坊费合计'+totals.fee+'铜，用了'+totals.materials.item_wood+'份木料。失败也付了工坊费。</q><回合 额外="5分" 地点="bld_hw_mill" 在场="npc_hw_ayan"/>';
    return {choices:[{finish_reason:'stop',message:{content}}]};
   }
   reviewCalls++;const payload=JSON.parse(body.messages[1].content);assert.ok(payload.evidence.some(row=>row.id==='scene'&&row.text.includes('旧磨坊')));return issuesResponse([]);
  }};
  const server=await createPlaytestServer({consistencyClient:client});t.after(()=>server.close());
  let view=await server.api('create',{});const campaignId=view.reference.campaignId;
  async function act(tool,args,id){await server.api('execute',{campaignId,anchor:id,eventId:id,tool,args,expectedSequence:view.reference.sequence});view=await server.api('read',{campaignId});}
  await act('world_move',{destination:'旧磨坊'},'mill');await act('world_move',{destination:'白石镇'},'leave');
  await act('world_time',{minutes:14400},'ten-days');await act('world_move',{destination:'旧磨坊'},'return');
  await act('world_time',{until:{dayOffset:1,hour:8,minute:0}},'awake');
  const anchor='recall';
  const begun=await server.api('review/begin',{campaignId,anchor,playerText:'我问阿砚这十天忙了什么。只听已有经历，不替他制作。',expectedSequence:view.reference.sequence});
  // Real dialogue keeps this historical-recall semantic regression on the
  // adjudicated branch; zero-tool narration is covered by turn-gate.
  await act('world_remember',{subject:'npc_hw_ayan',key:'dialogue:greet',content:'你好'},anchor);const before=structuredClone(view.document);
  const request={campaignId,token:begun.token,draft:recalledFailure,expectedSequence:view.reference.sequence};
  const reviewed=await server.api('review/reply',request);assert.equal(reviewed.attempts,1);assert.equal(rewriteCalls,1);assert.equal(reviewCalls,2);assert.equal(reviewed.canCommit,!badRewrite);
  assert.equal(reviewed.rewritten,!badRewrite);if(badRewrite)assert.equal(reviewed.status,'unverified');else assert.equal(reviewed.status,'verified');
  assert.deepEqual((await server.api('read',{campaignId})).document,before,'回忆审稿和文字改写不得改变任何账本');
  assert.deepEqual(await server.api('review/reply',request),reviewed);assert.equal(rewriteCalls,1);assert.equal(reviewCalls,2);
  if(badRewrite)await assert.rejects(server.api('execute',{campaignId,anchor,eventId:'tail',tool:'world_turn',args:reviewed.tail.args,reviewId:reviewed.reviewId,expectedSequence:reviewed.sequence}),/不一致/);
 }
});

test('无关说话人泄漏私密委托自动删除，改写提示无全局私密任务且不教给人物',async t=>{
 let attempts=0;
 const client={async generate(body,label){
  if(label.startsWith('consistency-rewrite:')){attempts++;const payload=JSON.parse(body.messages.at(-1).content);for(const row of payload.evidence.filter(row=>['before','after'].includes(row.id)))assert.equal(JSON.parse(row.text).quests,undefined);assert.ok(!payload.evidence.some(row=>row.id.startsWith('knowledge:')));return {choices:[{finish_reason:'stop',message:{content:'<q who="npc_hw_wushuo">我没听说，不知道。</q><回合 额外="5分" 地点="loc_hw_northwood" 在场="npc_hw_wushuo"/>'}}]};}
  return issuesResponse([]);
 }};
 const server=await createPlaytestServer({consistencyClient:client});t.after(()=>server.close());
 let view=await server.api('create',{});const campaignId=view.reference.campaignId;
 async function act(tool,args,id){const r=await server.api('execute',{campaignId,anchor:id,eventId:id,tool,args,expectedSequence:view.reference.sequence});view=await server.api('read',{campaignId});return r;}
 const published=await act('world_quest',{operation:'publish',publisher:'npc_hw_linsui',grade:'D',personal:true,reward:20,content:'替酒馆备齐燕麦',objective:{type:'deliver',item:'item_oats',quantity:10}},'publish');await act('world_quest',{operation:'accept',quest:published.result.quest},'accept');await act('world_move',{destination:'北林边'},'woods');
 const anchor='unknown';const begun=await server.api('review/begin',{campaignId,anchor,playerText:'我没告诉吴朔任务内容，只问他知不知道。',expectedSequence:view.reference.sequence});
 // Preserve the private-knowledge rewrite test after an actual conversation.
 await act('world_remember',{subject:'npc_hw_wushuo',key:'dialogue:greet',content:'你好'},anchor);const before=structuredClone(view.document);
 const result=await server.api('review/reply',{campaignId,token:begun.token,expectedSequence:view.reference.sequence,draft:'<q who="npc_hw_wushuo">林穗让你送十份燕麦。</q><回合 额外="5分" 地点="loc_hw_northwood" 在场="npc_hw_wushuo"/>'});
 assert.equal(result.status,'verified');assert.equal(result.rewritten,true);assert.equal(attempts,1);assert.deepEqual((await server.api('read',{campaignId})).document,before);
});
