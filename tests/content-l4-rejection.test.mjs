import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {runContentPipeline} from '../tools/content-pipeline.mjs';

// L4 退回格式：batch-N.json 的 l4 = {approved:false, rejection:{by,at,reason,ids:[…]}}。
async function fixture(t){
  const root=await fs.mkdtemp(path.join(tmpRoot(),'l4-reject-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const texts={recipe_a:'甲稿：全程约七十分钟。',recipe_b:'乙稿：全程约七十分钟。',recipe_c:'丙稿：全程约七十分钟。'},labels=[],feedbacks=[];
  const client={spent:0,budgetYuan:20,estimateCostYuan:()=>.01,async generate(body,label){labels.push(label);this.spent+=.01;
    const out=label.includes('-review')?{contradictions:[]}:{id:body.id,process:texts[body.id]};
    return {choices:[{message:{content:JSON.stringify(out)}}],usage:{completion_tokens:11},measurement:{costUpperYuan:.01}};}};
  const options={root,client,entries:['recipe_a','recipe_b','recipe_c'].map(id=>({id,minutes:70})),
    buildDraftRequest:(entry,feedback)=>{feedbacks.push({id:entry.id,feedback});return {id:entry.id};},reviewDraftFor:entry=>({id:entry.id,process:texts[entry.id]}),validateDraft:()=>[],concurrency:3};
  return {root,texts,labels,feedbacks,client,options};
}
const readJSON=async file=>JSON.parse(await fs.readFile(file,'utf8'));
async function reject(root,rejection){const file=path.join(root,'batch-0.json'),batch=await readJSON(file);batch.l4={approved:false,notes:[],rejection};await fs.writeFile(file,JSON.stringify(batch,null,2)+'\n');}

test('L4 退回：只重写被退回的条目，其余记录逐字节不变，退回意见作 feedback，留 l4Rejection 历史', async t => {
  const {root,texts,labels,feedbacks,options}=await fixture(t);
  await runContentPipeline(options);
  const before=Object.fromEntries(await Promise.all(['recipe_a','recipe_c'].map(async id=>[id,await fs.readFile(path.join(root,`${id}.json`),'utf8')])));
  const oldB=await readJSON(path.join(root,'recipe_b.json'));
  await reject(root,{by:'L4 复核',at:'2026-11-10',reason:'乙稿措辞不通，重写',ids:['recipe_b']});
  texts.recipe_b='乙稿新：全程约七十分钟。';
  labels.length=0;feedbacks.length=0;
  await runContentPipeline(options);
  assert.ok(labels.every(l=>l.includes('recipe_b')),'只为被退回条目发请求');assert.equal(labels.length,2);
  for(const id of ['recipe_a','recipe_c'])assert.equal(await fs.readFile(path.join(root,`${id}.json`),'utf8'),before[id]);
  const b=await readJSON(path.join(root,'recipe_b.json'));
  assert.equal(b.status,'passed');assert.equal(b.draft.process,'乙稿新：全程约七十分钟。');
  assert.equal(b.l4Rejection.length,1);assert.equal(b.l4Rejection[0].reason,'乙稿措辞不通，重写');assert.deepEqual(b.l4Rejection[0].priorDraft,oldB.draft);
  assert.deepEqual(feedbacks.map(f=>f.id),['recipe_b']);assert.match(feedbacks[0].feedback[0],/乙稿措辞不通/);
  const batch=await readJSON(path.join(root,'batch-0.json'));
  assert.equal(batch.l4.approved,false);assert.equal(batch.l4.rejection,undefined);assert.equal(batch.l4History.at(-1).rejection.ids[0],'recipe_b');
  // 同一次退回不会重复处理
  labels.length=0;await runContentPipeline(options);assert.equal(labels.length,0);
});

test('L4 退回：格式不合法（缺 ids、批外 id）时报错，不猜范围', async t => {
  const {root,options}=await fixture(t);
  await runContentPipeline(options);
  await reject(root,{by:'x',at:'y',reason:'只有理由'});
  await assert.rejects(()=>runContentPipeline(options),/l4\.rejection 格式不合法/);
  await reject(root,{by:'x',at:'y',reason:'r',ids:['recipe_zzz']});
  await assert.rejects(()=>runContentPipeline(options),/l4\.rejection 格式不合法/);
});
