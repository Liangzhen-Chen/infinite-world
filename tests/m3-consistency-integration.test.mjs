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
 assert.equal(review.canCommit,false);assert.equal(review.verified,false);assert.equal(review.status,'unverified');assert.equal(review.text,draft);assert.equal(review.attempts,1);assert.match(review.feedback,/尾注未提交/);
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
 const warning={category:'knowledge',severity:'warning',quote:'面包给你。',reason:'这句话的隐含背景仍需叙述复核',evidence:[{id:'player',quote:'我付钱买一个面包'}]};
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
