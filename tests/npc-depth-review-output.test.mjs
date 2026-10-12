import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openContentBudget} from '../tools/content-budget.mjs';
import {hashContent,parseModelJSON} from '../tools/content-pipeline.mjs';
import {buildReviewRequest,contextFor,patchDraft,applyDepthDraft,checkIncrementalReview,depthReviewClient} from '../tools/npc-depth-content.mjs';
import {compactReviewRequest} from '../tools/npc-depth-review.mjs';

function fixture({author=false,controlled=false}={}){
 const before={id:'npc_review_output',name:'审查对象',notes:'原记录',opinions:{neighbors:[{view:'原意见'}]},secrets:[{content:'私人经历',knownBy:['npc_review_output']}]};
 const patches=[{path:'notes',value:'谈过桌位，先后未定。'},{path:'opinions.neighbors[0].view',value:'准备询问邻人。'}];
 const entry={id:before.id,contract:'audit-patch-v1',before,issues:[{field:'notes',code:'rule-wording'}],patches};entry.facts=applyDepthDraft(before,patchDraft(entry));
 const context=contextFor(entry,{npcs:[before],residents:[],locations:[],settlementProfiles:[]});
 if(author)context.authoredBackground={sourceHash:'frozen-source-hash',events:[{id:'event-table',risks:[{id:before.id,field:'secrets[0]'}],originalSources:[{value:'不可重建的原始来源'}],privateRisks:[{value:before.secrets[0]}],pendingOutcomes:['未商定先后']}]};
 if(controlled)context.controlledRevision={authorizationHash:'frozen-plan-hash'};
 return{entry,context,draft:patchDraft(entry)};
}
const goodReview=(entry,context)=>({contradictions:[],reviewedPaths:entry.patches.map(p=>p.path),backgroundReviews:(context.authoredBackground?.events??[]).map(e=>({eventId:e.id,sourceHash:context.authoredBackground.sourceHash,reviewedRiskPaths:e.risks.map(r=>`${r.id}.${r.field}`),contradictions:[]}))});

test('author-only、controlled-only、both 与旧合同在完整/精简请求中使用唯一合同和存在的字段',()=>{
 for(const mode of [{author:true},{controlled:true},{author:true,controlled:true},{}]){
  const p=fixture(mode),original=buildReviewRequest(p.entry,p.draft,p.context),saved=structuredClone(original),oldContext=structuredClone(p.context);
  for(const request of [original,compactReviewRequest(original)]){
   const system=request.messages[0].content,payload=JSON.parse(request.messages[1].content);
   assert.equal(request.messages.filter(m=>m.role==='system').length,1);assert.equal(request.max_tokens,1800);
   assert.doesNotMatch(system,/context\.revisions|skeleton\.facts|publishedFacts\.revisions/);
   for(const reference of ['skeleton.before','skeleton.issues','draft.patches','publishedFacts']){assert.ok(system.includes(reference));const [root,key]=reference.split('.');assert.ok(key?Object.hasOwn(payload[root],key):Object.hasOwn(payload,root));}
   assert.deepEqual(payload.skeleton.before,p.entry.before);assert.deepEqual(payload.draft,p.draft);
   const {revisions,...sources}=payload.publishedFacts,{revisions:oldRevisions,...oldSources}=JSON.parse(saved.messages[1].content).publishedFacts;assert.deepEqual(sources,oldSources);
   if(mode.author||mode.controlled){
    assert.doesNotMatch(system,/只返回 JSON \{"contradictions"/);assert.equal((system.match(/唯一输出 schema/g)??[]).length,1);
    const tasks=JSON.parse(system.split('本条待审清单：')[1].split('。')[0]);assert.deepEqual(tasks.patchPaths,p.draft.patches.map(p=>p.path));
    assert.deepEqual(tasks.backgrounds,goodReview(p.entry,p.context).backgroundReviews.map(({reviewedRiskPaths,contradictions,...row})=>({...row,riskPaths:reviewedRiskPaths})));
    assert.match(system,/不能未审照抄/);assert.match(system,/重复、遗漏或额外/);assert.match(system,/真实 hard/);assert.match(system,/无新背景时 backgroundReviews 必须为 \[\]/);
   }else{assert.match(system,/只返回 JSON \{"contradictions"/);assert.doesNotMatch(system,/reviewedPaths|backgroundReviews/);}
  }
  assert.deepEqual(original,saved);assert.deepEqual(p.context,oldContext);
 }
});

test('完整三字段才过覆盖校验，漏/重复/额外patch、事件、风险及错误hash仍拒',()=>{
 const p=fixture({author:true}),good=goodReview(p.entry,p.context);assert.deepEqual(checkIncrementalReview(good,p.entry,p.context),[]);
 const bad=[r=>delete r.reviewedPaths,r=>r.reviewedPaths.pop(),r=>r.reviewedPaths.push(r.reviewedPaths[0]),r=>r.reviewedPaths.push('secrets[0]'),r=>r.reviewedPaths='notes',r=>delete r.backgroundReviews,r=>r.backgroundReviews=[],r=>r.backgroundReviews.push(structuredClone(r.backgroundReviews[0])),r=>r.backgroundReviews[0].eventId='extra-event',r=>r.backgroundReviews[0].sourceHash='wrong',r=>r.backgroundReviews[0].reviewedRiskPaths=[],r=>r.backgroundReviews[0].reviewedRiskPaths.push(r.backgroundReviews[0].reviewedRiskPaths[0]),r=>r.backgroundReviews[0].reviewedRiskPaths.push('other.secrets[0]'),r=>r.backgroundReviews[0].reviewedRiskPaths='private',r=>r.extra='unrequested',r=>r.contradictions=[{severity:'hard',field:'notes',reason:'没有原句'}]];
 for(const change of bad){const review=structuredClone(good);change(review);assert.throws(()=>checkIncrementalReview(review,p.entry,p.context));}
 const controlled=fixture({controlled:true}),noBackground=goodReview(controlled.entry,controlled.context);assert.deepEqual(checkIncrementalReview(noBackground,controlled.entry,controlled.context),[]);noBackground.backgroundReviews=good.backgroundReviews;assert.throws(()=>checkIncrementalReview(noBackground,controlled.entry,controlled.context),/必须为空/);
});

test('真实hard保留原句原因，背景hard进入普通审核硬错而不降级',async()=>{
 const p=fixture({author:true}),review=goodReview(p.entry,p.context),hard={severity:'hard',field:'notes',quote:'已经付款',reason:'待定事项被写成已完成交易'};review.contradictions.push(hard);
 assert.deepEqual(checkIncrementalReview(review,p.entry,p.context),[hard]);review.contradictions=[];review.backgroundReviews[0].contradictions.push(hard);
 const response={choices:[{message:{content:JSON.stringify(review)}}],usage:{completion_tokens:24}},client=depthReviewClient({generate:async()=>response});
 const result=await client.generate(buildReviewRequest(p.entry,p.draft,p.context));assert.deepEqual(parseModelJSON(result).contradictions,[hard]);assert.deepEqual(result.rawProviderReviewResponse,response);assert.deepEqual(result.usage,response.usage);
});

// Minimal projection of T10 first-review/npc_hw_luowei.json, attempt 1.
// Full frozen provider hash: d035d24ab270f835ab5b44b72ef9b2e4ce642255c8ce4a710a229f7174e6d1d5.
// The content and usage below are copied verbatim; no coverage is synthesized.
const luoweiResponse={choices:[{index:0,message:{role:'assistant',content:'{"contradictions":[],"backgroundReviews":[{"eventId":"memory_t10_south-water","sourceHash":"d4cb722ab2388cc077c9011a337f0e7a81f70f0cf60d5655e925ee8e479dc1d9","reviewedRiskPaths":["npc_hw_luowei.secrets[0]","npc_hw_xinglu.secrets[0]","npc_hw_xiejin.secrets[0]","npc_hw_xinglu.memorySeeds[0]"],"contradictions":[]}]}'},finish_reason:'stop'}],usage:{prompt_tokens:25448,completion_tokens:133,total_tokens:25581,prompt_tokens_details:{cached_tokens:128},prompt_cache_hit_tokens:128,prompt_cache_miss_tokens:25320},measurement:{costUpperYuan:0.051709120000000004}};
test('罗巍真实stop缺reviewedPaths最小fixture仍失败，原响应/usage原样保存且不补覆盖',async()=>{
 const p=fixture({author:true}),saved=structuredClone(luoweiResponse),parsed=parseModelJSON(luoweiResponse);
 assert.equal(Object.hasOwn(parsed,'reviewedPaths'),false);assert.throws(()=>checkIncrementalReview(parsed,p.entry,p.context));
 const client=depthReviewClient({generate:async()=>luoweiResponse}),result=await client.generate(compactReviewRequest(buildReviewRequest(p.entry,p.draft,p.context))),review=parseModelJSON(result);
 assert.ok(review.contradictions.some(c=>c.severity==='hard'));assert.equal(Object.hasOwn(review,'reviewedPaths'),false);assert.deepEqual(result.rawProviderReviewResponse,saved);assert.equal(result.rawProviderReviewResponseHash,hashContent(saved));assert.deepEqual(result.usage,saved.usage);assert.deepEqual(result.measurement,saved.measurement);assert.equal(result.rawProviderReviewResponse.choices[0].finish_reason,'stop');assert.deepEqual(luoweiResponse,saved);
 const legacy=fixture(),original=await client.generate(buildReviewRequest(legacy.entry,legacy.draft,legacy.context));assert.equal(original,luoweiResponse);
});

test('精简拒绝不能等价重建的draft或来源，同时保留所有背景风险和秘密',()=>{
 const p=fixture({author:true,controlled:true}),request=buildReviewRequest(p.entry,p.draft,p.context);
 for(const change of [payload=>payload.draft.patches[0].value='不同候选',payload=>payload.skeleton.facts.notes='不可重建',payload=>payload.publishedFacts.revisions[0].originalSource='独立原源']){const bad=structuredClone(request),payload=JSON.parse(bad.messages[1].content);change(payload);bad.messages[1].content=JSON.stringify(payload);assert.throws(()=>compactReviewRequest(bad));}
 const compact=compactReviewRequest(request),payload=JSON.parse(compact.messages[1].content);assert.deepEqual(payload.publishedFacts.authoredBackground,p.context.authoredBackground);assert.deepEqual(payload.skeleton.before.secrets,p.entry.before.secrets);
});

test('paid provider在覆盖包装及JSON解析前独立落盘，普通hard/坏JSON/无附件均保留原文',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'review-provider-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const p=fixture({author:true}),responses=[structuredClone(luoweiResponse),{choices:[{message:{content:'{坏JSON'}}],usage:{completion_tokens:3}},{choices:[{message:{content:JSON.stringify({contradictions:[{quote:'秘密',field:'notes',severity:'hard',reason:'不得公开'}]})}}],usage:{completion_tokens:5}}];
 responses.forEach(r=>r.measurement={costUpperYuan:.01});
 let index=0,checked=0;
 const adapter=depthReviewClient({spent:0,reserved:0,budgetYuan:20,estimateCostYuan:()=>.1,generate:async()=>responses[index++]});
 const client={spent:0,reserved:0,budgetYuan:20,estimateCostYuan:()=>.1,generateRaw:adapter.generateRaw,async processResponse(response,request){
  const files=await fs.readdir(path.join(root,'budget-responses'));assert.equal(files.length,index);
  const saved=await Promise.all(files.map(f=>fs.readFile(path.join(root,'budget-responses',f),'utf8').then(JSON.parse)));
  const match=saved.find(s=>s.label===`review-${index}`);assert.deepEqual(match.response,response);assert.deepEqual(match.usage,response.usage);assert.equal(match.requestHash,hashContent(request));assert.equal(match.responseHash,hashContent(response));checked++;
  return adapter.processResponse(response,request);
 }};
 const budget=await openContentBudget({file:path.join(root,'budget.json'),client});
 try{
  for(let i=0;i<responses.length;i++){
   const request=buildReviewRequest(p.entry,p.draft,i===2?fixture().context:p.context),result=await budget.request(request,`review-${i+1}`);
   if(i<2)assert.ok(result.rawProviderReviewResponse);else assert.equal(result,responses[i]);
  }
  assert.equal(checked,3);assert.ok(Object.values(budget.ledger.requests).every(r=>r.status==='settled'&&r.responseEvidence));
 }finally{await budget.close();}
});
