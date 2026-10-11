import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runContentPipeline,hashContent,readApprovedContent } from '../tools/content-pipeline.mjs';
import {extractDraft,buildDraftRequest} from '../tools/npc-depth-content.mjs';

test('逐条审查、最多两次重写、失败不拒绝同批、通过条目断点续跑', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'content-pipeline-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const calls = [], client = { spent: 0, budgetYuan: 20, async generate(body, label) {
    calls.push(label); this.spent += 0.01;
    const review = label.includes('-review');
    const out = review ? { contradictions: label.includes('item_bad') ? [{ quote: '错误能力', field: 'use', severity: 'hard', reason: '骨架无此能力' }] : [] } : { id: body.id, description: body.id };
    return { choices: [{ message: { content: JSON.stringify(out) } }] };
  } };
  const options = { root, client, entries: [{ id: 'item_good' }, { id: 'item_bad' }], buildDraftRequest: entry => ({ id: entry.id }), validateDraft: () => [], concurrency: 2 };
  const first = await runContentPipeline(options);
  assert.equal(first.summary.passed, 1); assert.equal(first.summary.manual, 1);
  assert.equal(first.results[1].attempts, 3); assert.equal(calls.length, 8);
  const second = await runContentPipeline(options);
  assert.equal(calls.length, 8); assert.equal(second.summary.passed, 1);
  assert.equal(second.summary.batches[0].needsSystemicRepair, true);
});

test('累计预算续跑且骨架改变使旧通过结果失效', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'content-pipeline-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let calls = 0;
  const client = { spent: 0, budgetYuan: 20, async generate(body, label) {
    calls++; this.spent += 1;
    return { choices: [{ message: { content: JSON.stringify(label.includes('-review') ? { contradictions: [] } : { id: 'item_one' }) } }] };
  } };
  const options = { root, client, entries: [{ id: 'item_one', weight: 1 }], buildDraftRequest: () => ({}), validateDraft: () => [] };
  await runContentPipeline(options); client.spent = 0;
  await runContentPipeline({ ...options, entries: [{ id: 'item_one', weight: 2 }] });
  assert.equal(calls, 4); assert.equal(client.spent, 4);
});

async function recoveryFixture(t,{raw=false,hard=false,bad=false}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'protocol-recovery-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const entry={id:'npc_yp_zhaofeng',contract:'audit-patch-v1',patches:[{path:'opinions.neighbors[2].view',value:'雨后曾与乔端逐段核对低垄水痕；他要先对原簿，她要先止住沟口受损，对先做哪件事尚有分歧。'}]};
 const response=value=>({choices:[{message:{content:JSON.stringify(value)}}]});
 let error;try{assert.deepEqual({candidate:entry},entry);}catch(e){error=e.message;}
 const original={id:entry.id,fingerprint:hashContent({entry,context:null,revision:'v2'}),status:'manual',attempts:3,draft:null,review:null,errors:[error],warnings:[],feedback:[error],measurements:[{costUpperYuan:.123}]};
 if(raw)original.draftResponse=response({candidate:structuredClone(entry)});
 await fs.writeFile(path.join(root,entry.id+'.json'),JSON.stringify(original));
 const calls=[],client={spent:0,budgetYuan:20,async generate(body,label){calls.push(label);this.spent+=.01;return response(label.includes('-review')?{contradictions:hard?[{quote:'旧文字',field:'opinions',severity:'hard',reason:'仍然存在事实错误'}]:[]}:{candidate:bad?{...entry,id:'npc_wrong'}:structuredClone(entry)});}};
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
