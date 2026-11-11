import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import { runContentPipeline,hashContent,readApprovedContent,defaultReviewRequest,maxDraftBytes,MAX_UTF8_BYTES_PER_OUTPUT_TOKEN } from '../tools/content-pipeline.mjs';
import { reserveCeilingYuan } from '../tools/content-budget.mjs';
import { measure } from '../tools/measure-output-bytes-per-token.mjs';
import { createHash } from 'node:crypto';
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
test('并发只因在途预留占额时排队，真到额后停止全批未发队列，预留均已结算或可核实取消',async t=>{
 // 每条 draft+review 共预留 0.2；额度 0.3：第二条先排队等第一条结算，第一条结算后已花 0.2，再放 0.2 超限才是真到额。
 // 为什么“恰好 2 次”是确定的（tools/content-budget.mjs）：所有预留判断都在同一条串行 promise 队列（enqueue）里依次执行，Node 单线程，
 // 队列里第一个到达的条目拿到 0.2 预留（0.2<=0.3），此后任何条目再预留都是 在途0.2+0.2>0.3；等它的 draft、review 两次请求结算完，
 // 已花 0.2，再预留 0.2 则 已花0.2+0.2>0.3，fitsAfterRelease 为假，直接 stop。fake client 没有真实计时，因此不论哪个条目先进队，
 // 发出的调用恰是那一个条目的 draft+review 共 2 次；变的只是赢家是谁，下面没有断言是哪一条。
 const p=await budgetFixture(t,{limit:.3,ids:['item_one','item_two','item_three','item_four']});
 const result=await runContentPipeline(p.options);assert.equal(p.calls.length,2);assert.equal(result.summary.passed,1);assert.equal(result.summary.pending,3);assert.equal(result.summary.manual,0);
 const stopped=result.results.filter(r=>r.budgetStop);assert.equal(stopped.length,3);assert.ok(stopped.every(r=>r.status==='pending'&&r.attempts===0&&r.budgetStop.code==='CONTENT_BUDGET_STOP'));
 assert.equal(result.results.filter(r=>r.status==='passed').length,1);
 assert.equal(result.summary.budget.reservedYuan,0);assert.ok(result.summary.budget.spentYuan<=.3+1e-12);
 const rows=Object.values(result.summary.budget.requests);assert.ok(rows.length>=2&&rows.every(r=>r.status==='settled'||r.status==='cancelled-unissued'));
 await runContentPipeline(p.options);assert.equal(p.calls.length,2);
});
test('额度小于单条 draft+review 的预留时整批零调用：全部 budgetStop，没有已发请求，所有请求行都是 cancelled-unissued（或根本没有）',async t=>{
 // 单条需预留 0.2，额度只有 0.15：连第一条都放不下，且没有在途预留可等，立即真到额。
 const p=await budgetFixture(t,{limit:.15,ids:['item_one','item_two','item_three']});
 const result=await runContentPipeline(p.options);
 assert.equal(p.calls.length,0);
 assert.equal(result.results.length,3);
 assert.ok(result.results.every(r=>r.status==='pending'&&r.attempts===0&&r.budgetStop?.code==='CONTENT_BUDGET_STOP'));
 assert.equal(result.summary.passed,0);assert.equal(result.summary.manual,0);assert.equal(result.summary.pending,3);
 const rows=Object.values(result.summary.budget.requests);
 assert.ok(rows.every(r=>r.status==='cancelled-unissued'),'不得有已发或已结算的请求');
 assert.equal(result.summary.budget.spentYuan,0);assert.equal(result.summary.budget.reservedYuan,0);
 assert.equal(p.client.spent,0);
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
 assert.ok(Math.abs(ledger.reservedYuan)<1e-9);
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
  assert.equal(maxDraftBytes({max_tokens:100,messages:[]}),bytes);
  // 两段预留：第一段按最大占位草稿估价；发送前换成真实复核请求（同一行），哈希与真实请求一致，估价不超过第一段，且最终结算。
  const planned=defaultReviewRequest({id:'item_draft'},'"'.repeat(bytes),null);
  const actual=bodies[calls[1]];
  assert.equal(review.status,'settled');
  assert.equal(review.replacedReservation.requestHash,hashContent(planned));
  assert.equal(review.replacedReservation.reservedYuan,reserveCeilingYuan(client,planned));
  assert.ok(review.replacedReservation.reservedYuan>bytes*client.rates.miss/1e6);
  assert.equal(review.requestHash,hashContent(actual));
  assert.notEqual(review.requestHash,review.replacedReservation.requestHash);
  assert.equal(review.reservedYuan,reserveCeilingYuan(client,actual));
  assert.ok(review.reservedYuan<=review.replacedReservation.reservedYuan);
  assert.ok(Math.abs(ledger.reservedYuan)<1e-9);
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

test('已有固定草稿的路径：复核请求、预留额、哈希等于按原公式直接算出的值（改动前后都应成立）', async t=>{
  const root=await fs.mkdtemp(path.join(tmpRoot(),'content-pipeline-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const {calls,bodies,options}=draftingFixture({maxTokens:100});
  const expected={id:'item_draft',description:'x'.repeat(20)};
  const result=await runContentPipeline({...options,root,reviewDraftFor:()=>expected});
  assert.equal(result.summary.passed,1);
  const review=bodies[calls[1]];
  // 请求体：默认复核请求的字面结构，不经过被测代码。
  assert.equal(review.messages[1].content,JSON.stringify({skeleton:{id:'item_draft'},publishedFacts:null,draft:expected}));
  assert.deepEqual(Object.keys(review),['thinking','temperature','max_tokens','response_format','messages']);
  assert.equal(review.max_tokens,1800);
  // 预留额：content-budget 原公式 (请求 JSON 的 UTF-8 字节×miss + max_tokens×output)/1e6，请求补默认字段后序列化。
  const encoded={model:'deepseek-flash',max_tokens:1800,stream:false,thinking:{type:'disabled'},...review};
  const original=(Buffer.byteLength(JSON.stringify(encoded))*2+1800*8)/1e6;
  const ledger=JSON.parse(await fs.readFile(path.join(root,'budget.json'),'utf8'));
  const row=Object.values(ledger.requests).find(r=>r.label.includes('-review'));
  assert.equal(row.reservedYuan,original);
  assert.equal(row.requestHash,createHash('sha256').update(JSON.stringify(review)).digest('hex'));
});

test('起草请求不是模型请求（无 messages，如人工稿）时无法推上界，起草前即停', async t=>{
  const root=await fs.mkdtemp(path.join(tmpRoot(),'content-pipeline-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const {calls,options}=draftingFixture();
  const result=await runContentPipeline({...options,root,buildDraftRequest:entry=>({localAuthoredDraft:entry})});
  assert.equal(calls.length,0);assert.equal(result.summary.pending,1);
});

test('字节/输出 token 系数不低于仓库调用证据的实测最大值', ()=>{
  const m=measure('world/drafts');
  assert.ok(m.all.samples>0);
  assert.ok(MAX_UTF8_BYTES_PER_OUTPUT_TOKEN>=m.all.max,`实测最大 ${m.all.max} 超过系数，需重新取值并更新 content-pipeline.mjs 注释`);
});

// 复核构造器：草稿是字符串（占位）时请求很小，真实对象草稿时请求巨大，用来造“真实复核请求超过占位上界”。
const paddedReview=(entry,draft,context)=>{const r=defaultReviewRequest(entry,draft,context);if(typeof draft==='object')r.messages[0].content+='p'.repeat(20000);return r;};

test('起草型条目：真实复核请求估价超过占位上界时停下，复核不发，草稿保留', async t=>{
  const root=await fs.mkdtemp(path.join(tmpRoot(),'content-pipeline-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const {calls,options}=draftingFixture({maxTokens:100});
  const result=await runContentPipeline({...options,root,buildReviewRequest:paddedReview});
  assert.equal(calls.length,1);assert.ok(calls[0].endsWith('-draft0'));
  assert.equal(result.summary.pending,1);
  const record=JSON.parse(await fs.readFile(path.join(root,'item_draft.json'),'utf8'));
  assert.match(record.budgetStop.message,/真实请求估价超过已预留上界/);
  assert.equal(record.draft.id,'item_draft');
  const ledger=JSON.parse(await fs.readFile(path.join(root,'budget.json'),'utf8'));
  const review=Object.values(ledger.requests).find(r=>r.label.includes('-review'));
  assert.equal(review.status,'cancelled-unissued');assert.ok(Math.abs(ledger.reservedYuan)<1e-9);
});

test('已付费草稿在重跑时被复用：只发复核，不再起草', async t=>{
  const root=await fs.mkdtemp(path.join(tmpRoot(),'content-pipeline-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const {calls,options}=draftingFixture({maxTokens:100});
  await runContentPipeline({...options,root,buildReviewRequest:paddedReview});
  assert.equal(calls.length,1);
  // 运维清除上一轮的停止记录后重跑（记录里的 budgetStop 会让整条直接返回，这一步与复用规则无关）。
  const file=path.join(root,'item_draft.json'),record=JSON.parse(await fs.readFile(file,'utf8'));
  delete record.budgetStop;await fs.writeFile(file,JSON.stringify(record));
  const result=await runContentPipeline({...options,root});
  assert.equal(result.summary.passed,1);
  assert.equal(calls.length,2);
  assert.ok(calls[1].endsWith('-review0'));
  assert.equal(calls.filter(l=>l.includes('-draft')).length,1);
  const ledger=JSON.parse(await fs.readFile(path.join(root,'budget.json'),'utf8'));
  const reviews=Object.values(ledger.requests).filter(r=>r.label.includes('-review'));
  assert.deepEqual(reviews.map(r=>r.status).sort(),['cancelled-unissued','settled']);
  assert.equal(JSON.parse(await fs.readFile(file,'utf8')).draft.id,'item_draft');
});

test('已付费草稿不再通过 L1 校验时不复用，重新起草', async t=>{
  const root=await fs.mkdtemp(path.join(tmpRoot(),'content-pipeline-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const {calls,options}=draftingFixture({maxTokens:100});
  await runContentPipeline({...options,root,buildReviewRequest:paddedReview});
  const file=path.join(root,'item_draft.json'),record=JSON.parse(await fs.readFile(file,'utf8'));
  delete record.budgetStop;await fs.writeFile(file,JSON.stringify(record));
  let first=true;
  const result=await runContentPipeline({...options,root,validateDraft:()=>{if(first){first=false;return['旧草稿不合规'];}return[];}});
  assert.equal(result.summary.passed,1);
  assert.equal(calls.filter(l=>l.includes('-draft')).length,2);
});

test('L4 抽样按比例：46 条通过抽 12 条（25% 向上取整）；重跑同一指纹不重抽；抽读不过率超一成的旧批次重做后标 fullRead', async t => {
  const root = await fs.mkdtemp(path.join(tmpRoot(), 'content-sample-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const client = { spent: 0, budgetYuan: 20, estimateCostYuan: () => .01, async generate(body, label) {
    this.spent += 0.01;
    const out = label.includes('-review') ? { contradictions: [] } : { id: body.id, description: body.id };
    return { choices: [{ message: { content: JSON.stringify(out) } }], usage: { completion_tokens: 11 }, measurement: { costUpperYuan: .01 } };
  } };
  const entries = Array.from({ length: 46 }, (_, i) => ({ id: `item_${String(i).padStart(2, '0')}` }));
  const options = { root, client, entries, batchSize: 50, buildDraftRequest: entry => ({ id: entry.id }), reviewDraftFor: entry => ({ id: entry.id, description: entry.id }), validateDraft: () => [], concurrency: 4 };
  const first = await runContentPipeline(options);
  const batch = first.summary.batches[0];
  assert.equal(batch.passed, 46);
  assert.equal(batch.sample.length, 12);
  assert.equal(new Set(batch.sample).size, 12);
  assert.ok(batch.sample.every(id => entries.some(entry => entry.id === id)));
  assert.equal(batch.fullRead, undefined);
  const second = await runContentPipeline(options);
  assert.deepEqual(second.summary.batches[0].sample, batch.sample, '同一指纹的 sample 不重抽');
  // 旧批次文件：抽读里被退回的比例超过一成，条目内容改变后重算批次，新批次带 fullRead 标记。
  const file = path.join(root, 'batch-0.json'), old = JSON.parse(await fs.readFile(file, 'utf8'));
  old.l4History = [{ approved: false, notes: [], rejection: { by: 'x', at: 't', reason: 'r', ids: [old.sample[0], old.sample[1]] } }];
  await fs.writeFile(file, JSON.stringify(old));
  const recordFile = path.join(root, `${entries[0].id}.json`), record = JSON.parse(await fs.readFile(recordFile, 'utf8'));
  record.draft.description = '改写后的正文'; await fs.writeFile(recordFile, JSON.stringify(record));
  const third = await runContentPipeline(options);
  assert.equal(third.summary.batches[0].fullRead, true);
  assert.equal(third.summary.batches[0].sample.length, 12);
});
