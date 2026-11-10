import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import { runContentPipeline,hashContent,readApprovedContent,defaultReviewRequest,maxDraftBytes,MAX_UTF8_BYTES_PER_OUTPUT_TOKEN } from '../tools/content-pipeline.mjs';
import { reserveCeilingYuan } from '../tools/content-budget.mjs';
import {extractDraft,buildDraftRequest} from '../tools/npc-depth-content.mjs';

test('逐条审查、最多两次重写、失败不拒绝同批、通过条目断点续跑', async t => {
  const root = await fs.mkdtemp(path.join(tmpRoot(), 'content-pipeline-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const calls = [], client = { spent: 0, budgetYuan: 20, estimateCostYuan:()=>.01, async generate(body, label) {
    calls.push(label); this.spent += 0.01;
    const review = label.includes('-review');
    const out = review ? { contradictions: label.includes('item_bad') ? [{ quote: '错误能力', field: 'use', severity: 'hard', reason: '骨架无此能力' }] : [] } : { id: body.id, description: body.id };
    return { choices: [{ message: { content: JSON.stringify(out) } }],usage:{completion_tokens:11},measurement:{costUpperYuan:.01} };
  } };
  const options = { root, client, entries: [{ id: 'item_good' }, { id: 'item_bad' }], buildDraftRequest: entry => ({ id: entry.id }), reviewDraftFor:entry=>({id:entry.id,description:entry.id}),validateDraft: () => [], concurrency: 2 };
  const first = await runContentPipeline(options);
  assert.equal(first.summary.passed, 1); assert.equal(first.summary.manual, 1);
  assert.equal(first.results[1].attempts, 3); assert.equal(calls.length, 8);
  const ledger=JSON.parse(await fs.readFile(path.join(root,'budget.json'),'utf8'));
  const reviews=Object.entries(ledger.requests).filter(([,r])=>r.label.includes('item_bad-review'));
  assert.equal(reviews.length,3);
  for(const [id,r] of reviews){
    const evidence=JSON.parse(await fs.readFile(path.join(root,r.responseEvidence.file),'utf8'));
    assert.equal(evidence.requestId,id);assert.equal(evidence.requestHash,hashContent(evidence.request));assert.equal(evidence.responseHash,hashContent(evidence.response));
    assert.equal(evidence.response.choices[0].message.content,JSON.stringify({contradictions:[{quote:'错误能力',field:'use',severity:'hard',reason:'骨架无此能力'}]}));
    assert.equal(evidence.costUpperYuan,.01);
    assert.equal(evidence.usage.completion_tokens,11);
  }
  assert.equal(new Set(reviews.map(([,r])=>r.responseEvidence.file)).size,3);
  const originalGood=await fs.readFile(path.join(root,'item_good.json'),'utf8');
  const second = await runContentPipeline(options);
  assert.equal(calls.length, 8); assert.equal(second.summary.passed, 1);
  assert.equal(await fs.readFile(path.join(root,'item_good.json'),'utf8'),originalGood);
  assert.equal(second.summary.batches[0].needsSystemicRepair, true);
});

test('累计预算续跑且骨架改变使旧通过结果失效', async t => {
  const root = await fs.mkdtemp(path.join(tmpRoot(), 'content-pipeline-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let calls = 0;
  const client = { spent: 0, budgetYuan: 20, estimateCostYuan:()=>1,async generate(body, label) {
    calls++; this.spent += 1;
    return { choices: [{ message: { content: JSON.stringify(label.includes('-review') ? { contradictions: [] } : { id: 'item_one' }) } }] };
  } };
  const options = { root, client, entries: [{ id: 'item_one', weight: 1 }], buildDraftRequest: () => ({}),reviewDraftFor:()=>({id:'item_one'}),validateDraft: () => [] };
  await runContentPipeline(options); client.spent = 0;
  await runContentPipeline({ ...options, entries: [{ id: 'item_one', weight: 2 }] });
  assert.equal(calls, 4); assert.equal(client.spent, 4);
});

async function recoveryFixture(t,{raw=false,hard=false,bad=false}={}){
 const root=await fs.mkdtemp(path.join(tmpRoot(),'protocol-recovery-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const entry={id:'npc_yp_zhaofeng',contract:'audit-patch-v1',patches:[{path:'opinions.neighbors[2].view',value:'雨后曾与乔端逐段核对低垄水痕；他要先对原簿，她要先止住沟口受损，对先做哪件事尚有分歧。'}]};
 const response=value=>({choices:[{message:{content:JSON.stringify(value)}}]});
 let error;try{assert.deepEqual({candidate:entry},entry);}catch(e){error=e.message;}
 const original={id:entry.id,fingerprint:hashContent({entry,context:null,revision:'v2'}),status:'manual',attempts:3,draft:null,review:null,errors:[error],warnings:[],feedback:[error],measurements:[{costUpperYuan:.123}]};
 if(raw)original.draftResponse=response({candidate:structuredClone(entry)});
 await fs.writeFile(path.join(root,entry.id+'.json'),JSON.stringify(original));
 const calls=[],client={spent:0,budgetYuan:20,estimateCostYuan:()=>.01,async generate(body,label){calls.push(label);this.spent+=.01;return response(label.includes('-review')?{contradictions:hard?[{quote:'旧文字',field:'opinions',severity:'hard',reason:'仍然存在事实错误'}]:[]}:{candidate:bad?{...entry,id:'npc_wrong'}:structuredClone(entry)});}};
 const options={root,client,entries:[entry],buildDraftRequest,extractDraft,validateDraft:()=>[],protocolRecoveryIds:[entry.id],concurrency:1};
 return{root,entry,original,calls,options};
}
test('manual attempts3按id一次协议恢复，保留原错误用量指纹并重做L2及L4',async t=>{
 const p=await recoveryFixture(t);const first=await runContentPipeline(p.options),record=first.results[0];assert.equal(record.status,'passed');assert.equal(record.attempts,3);assert.equal(record.fingerprint,p.original.fingerprint);assert.deepEqual(record.protocolRecovery.prior,p.original);assert.equal(p.calls.length,2);assert.match(p.calls[0],/protocol-recovery/);assert.equal(first.summary.batches[0].l4.approved,false);
 await assert.rejects(readApprovedContent(p.root,[p.entry]),/L4/);await runContentPipeline(p.options);assert.equal(p.calls.length,2);
 // Changing revision cannot silently rerun a passed entry during recovery.
 await runContentPipeline({...p.options,revision:'new-revision'});assert.equal(p.calls.length,2);
});
test('断言差异须新请求；只有完整原响应可离线提取，L2仍不能省略',async t=>{
 const p=await recoveryFixture(t,{raw:true});const result=await runContentPipeline(p.options);assert.equal(result.results[0].status,'passed');assert.equal(p.calls.length,1);assert.match(p.calls[0],/-review/);
});
test('一次恢复合同仍错或L2有硬错就停，不能获第二次恢复或内容重写',async t=>{
 for(const fixture of [{bad:true},{hard:true}]){const p=await recoveryFixture(t,fixture),result=await runContentPipeline(p.options);assert.equal(result.results[0].status,'manual');assert.equal(result.results[0].attempts,3);assert.deepEqual(result.results[0].protocolRecovery.prior,p.original);assert.equal(p.calls.length,fixture.bad?1:2);await runContentPipeline({...p.options,retryManual:true});assert.equal(p.calls.length,fixture.bad?1:2);}
});
test('无关manual、非白名单、已有L2与passed均零调用',async t=>{
 const p=await recoveryFixture(t);for(const change of [r=>r.errors=['正文事实错误'],r=>{try{assert.deepEqual({candidate:{...p.entry,id:'wrong'}},p.entry);}catch(e){r.errors=[e.message];r.errorCode='AUDIT_PATCH_PROTOCOL';}},r=>r.status='passed',r=>r.review={contradictions:[]},r=>r.fingerprint='changed']){const record=structuredClone(p.original);change(record);await fs.writeFile(path.join(p.root,p.entry.id+'.json'),JSON.stringify(record));await runContentPipeline(p.options);assert.equal(p.calls.length,0);}
 const other={...p.entry,id:'npc_unlisted'},record={...p.original,id:other.id,fingerprint:hashContent({entry:other,context:null,revision:'v2'})};await fs.writeFile(path.join(p.root,other.id+'.json'),JSON.stringify(record));await runContentPipeline({...p.options,entries:[p.entry,other]});assert.equal(p.calls.length,0);
});

async function budgetFixture(t,{limit=.15,ids=['item_one'],unknown=false,hard=false}={}){
 const root=await fs.mkdtemp(path.join(tmpRoot(),'pipeline-round-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const calls=[],client={spent:0,reserved:0,budgetYuan:limit,estimateCostYuan:()=>.1,async generate(body,label){
  // Match the transport's second guard, which adds its own reservation.
  assert.ok(this.spent+this.reserved+.1<=this.budgetYuan+1e-12);
  calls.push(label);this.spent+=.1;
  return{choices:[{message:{content:JSON.stringify(label.includes('-review')?{contradictions:hard?[{quote:'秘密',field:'notes',severity:'hard',reason:'未授权传播'}]:[]}:{id:body.id})}}],usage:{prompt_tokens:17,completion_tokens:9},measurement:{costUpperYuan:.1}};
 }};
 const options={root,client,entries:ids.map(id=>({id})),buildDraftRequest:e=>({id:e.id}),...(unknown?{}:{reviewDraftFor:e=>({id:e.id})}),validateDraft:()=>[],concurrency:2};
 return{root,calls,client,options};
}
test('够draft但不够必要review时零调用，预算拒绝不覆盖旧attempts/反馈，重启不重领',async t=>{
 const p=await budgetFixture(t),entry=p.options.entries[0],old={id:entry.id,fingerprint:hashContent({entry,context:null,revision:'v2'}),status:'pending',attempts:2,draft:{id:entry.id},review:{contradictions:[]},errors:['原有内容错误'],warnings:[],feedback:['原有内容错误'],measurements:[{costUpperYuan:.07}]};
 await fs.writeFile(path.join(p.root,entry.id+'.json'),JSON.stringify(old));
 const first=await runContentPipeline(p.options),record=first.results[0];assert.equal(p.calls.length,0);assert.equal(record.status,'pending');assert.equal(record.attempts,2);assert.deepEqual(record.errors,old.errors);assert.deepEqual(record.feedback,old.feedback);assert.deepEqual(record.measurements,old.measurements);assert.equal(record.budgetStop.code,'CONTENT_BUDGET_STOP');
 assert.equal(first.summary.manual,0);assert.deepEqual(first.summary.budget.requests,{});
 // Even a changed in-memory limit is not authority to resume a stopped record.
 p.client.budgetYuan=20;await runContentPipeline(p.options);await runContentPipeline({...p.options,revision:'new-revision',entries:[{...entry,newField:'changed'}]});assert.equal(p.calls.length,0);
});
test('并发整轮拒绝后全批未发队列停止，已预留未发请求可核实取消',async t=>{
 const p=await budgetFixture(t,{limit:.3,ids:['item_one','item_two','item_three','item_four']});
 const result=await runContentPipeline(p.options);assert.equal(p.calls.length,0);assert.equal(result.summary.pending,4);assert.equal(result.summary.manual,0);
 assert.ok(result.results.every(r=>r.budgetStop&&r.attempts===0));assert.equal(result.summary.budget.reservedYuan,0);
 assert.ok(Object.values(result.summary.budget.requests).every(r=>r.status==='cancelled-unissued'));
 await runContentPipeline(p.options);assert.equal(p.calls.length,0);
});
test('自由候选无法证明完整review上界时零调用',async t=>{
 const p=await budgetFixture(t,{limit:20,unknown:true}),result=await runContentPipeline(p.options);assert.equal(p.calls.length,0);assert.match(result.results[0].budgetStop.message,/无法证明/);assert.equal(result.results[0].attempts,0);
});
test('一次hard后下轮预算拒绝保留已发attempt和hard，不能把拒绝作为付费修文',async t=>{
 const p=await budgetFixture(t,{limit:.3,hard:true}),result=await runContentPipeline(p.options),record=result.results[0];
 assert.equal(p.calls.length,2);assert.equal(record.attempts,1);assert.equal(record.status,'pending');assert.equal(record.errors[0].reason,'未授权传播');assert.deepEqual(record.feedback,record.errors);assert.ok(record.budgetStop);assert.equal(record.responseEvidence.length,2);
 await runContentPipeline({...p.options,retryManual:true});assert.equal(p.calls.length,2);
});
test('坏JSON的每次paid原文在extract前持久保存，后轮不覆盖',async t=>{
 const p=await budgetFixture(t,{limit:20});let turn=0;
 p.client.generate=async(body,label)=>{p.calls.push(label);p.client.spent+=.1;return{choices:[{message:{content:`坏JSON第${++turn}轮`}}],usage:{completion_tokens:turn},measurement:{costUpperYuan:.1}};};
 const result=await runContentPipeline(p.options);assert.equal(result.summary.manual,1);assert.equal(p.calls.length,3);
 const ledger=result.summary.budget,rows=Object.values(ledger.requests).filter(r=>r.status==='settled');assert.equal(rows.length,3);
 for(const [i,row] of rows.entries()){const saved=JSON.parse(await fs.readFile(path.join(p.root,row.responseEvidence.file),'utf8'));assert.equal(saved.response.choices[0].message.content,`坏JSON第${i+1}轮`);assert.equal(saved.usage.completion_tokens,i+1);assert.equal(saved.responseHash,hashContent(saved.response));}
 assert.equal(ledger.reservedYuan,0);
});

// ---- 起草型条目（无冻结草稿、无 reviewDraftFor）：先预留“起草 + 按 max_tokens 构造的最大占位草稿复核”上界 ----
function draftingFixture({maxTokens=100,descriptionBytes=20}={}){
  const calls=[],bodies={};
  const client={spent:0,budgetYuan:20,rates:{hit:.04,miss:2,output:8},async generate(body,label){
    calls.push(label);bodies[label]=body;this.spent+=.001;
    const review=label.includes('-review');
    const out=review?{contradictions:[]}:{id:'item_draft',description:'x'.repeat(descriptionBytes)};
    return{choices:[{message:{content:JSON.stringify(out)}}],usage:{completion_tokens:11},measurement:{costUpperYuan:.001}};
  }};
  const options={client,entries:[{id:'item_draft'}],buildDraftRequest:entry=>({max_tokens:maxTokens,messages:[{role:'system',content:'起草'},{role:'user',content:JSON.stringify(entry)}]}),validateDraft:()=>[],concurrency:1};
  return{calls,bodies,client,options};
}

test('起草型条目：预留起草加复核上界后发起草、再发复核', async t=>{
  const root=await fs.mkdtemp(path.join(tmpRoot(),'content-pipeline-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const {calls,bodies,client,options}=draftingFixture({maxTokens:100});
  const result=await runContentPipeline({...options,root});
  assert.equal(result.summary.passed,1);
  assert.deepEqual(calls,['content-'+path.basename(root)+'-item_draft-draft0','content-'+path.basename(root)+'-item_draft-review0']);
  const ledger=JSON.parse(await fs.readFile(path.join(root,'budget.json'),'utf8'));
  const rows=Object.values(ledger.requests),review=rows.find(r=>r.label.includes('-review'));
  const bytes=100*MAX_UTF8_BYTES_PER_OUTPUT_TOKEN;
  assert.equal(maxDraftBytes({max_tokens:100}),bytes);
  // 预留的复核上界按最大占位草稿估价（至少覆盖其字节数），而不是按真实小草稿估价。
  const planned=defaultReviewRequest({id:'item_draft'},'"'.repeat(bytes),null);
  assert.equal(review.reservedYuan,reserveCeilingYuan(client,planned));
  assert.ok(review.reservedYuan>bytes*client.rates.miss/1e6);
  const actual=bodies[calls[1]];
  assert.ok(reserveCeilingYuan(client,actual)<=review.reservedYuan);
});

test('起草型条目：真实草稿超过占位上界时停下，不发复核', async t=>{
  const root=await fs.mkdtemp(path.join(tmpRoot(),'content-pipeline-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const {calls,options}=draftingFixture({maxTokens:100,descriptionBytes:100*MAX_UTF8_BYTES_PER_OUTPUT_TOKEN+50});
  const result=await runContentPipeline({...options,root});
  assert.equal(calls.length,1);assert.ok(calls[0].endsWith('-draft0'));
  assert.equal(result.summary.passed,0);assert.equal(result.summary.pending,1);
  const record=JSON.parse(await fs.readFile(path.join(root,'item_draft.json'),'utf8'));
  assert.match(record.budgetStop.message,/超过已预留的复核请求上界/);
  assert.equal(record.draft,null);
  const ledger=JSON.parse(await fs.readFile(path.join(root,'budget.json'),'utf8'));
  assert.equal(Object.values(ledger.requests).find(r=>r.label.includes('-review')).status,'cancelled-unissued');
});

test('起草型条目：起草请求没有有效 max_tokens 时仍按原规则停止', async t=>{
  const root=await fs.mkdtemp(path.join(tmpRoot(),'content-pipeline-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const {calls,options}=draftingFixture();
  const result=await runContentPipeline({...options,root,buildDraftRequest:()=>({max_tokens:'many',messages:[{role:'user',content:'x'}]})});
  assert.equal(calls.length,0);assert.equal(result.summary.pending,1);
});

test('已有固定草稿的路径：复核请求与预留口径不变', async t=>{
  const root=await fs.mkdtemp(path.join(tmpRoot(),'content-pipeline-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const {calls,bodies,client,options}=draftingFixture({maxTokens:100});
  const expected={id:'item_draft',description:'x'.repeat(20)};
  const result=await runContentPipeline({...options,root,reviewDraftFor:()=>expected});
  assert.equal(result.summary.passed,1);
  const review=bodies[calls[1]];
  assert.deepEqual(review,defaultReviewRequest({id:'item_draft'},expected,null));
  const ledger=JSON.parse(await fs.readFile(path.join(root,'budget.json'),'utf8'));
  const row=Object.values(ledger.requests).find(r=>r.label.includes('-review'));
  assert.equal(row.reservedYuan,reserveCeilingYuan(client,defaultReviewRequest({id:'item_draft'},expected,null)));
  assert.equal(row.requestHash,hashContent(review));
});
