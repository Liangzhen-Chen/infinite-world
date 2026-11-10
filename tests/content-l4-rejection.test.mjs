import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {runContentPipeline,readApprovedContent} from '../tools/content-pipeline.mjs';
import {manualRewrite} from '../tools/manual-rewrite.mjs';

// L4 退回格式：batch-N.json 的 l4 = {approved:false, rejection:{by,at,reason,ids:[…]}}。
async function fixture(t){
  const root=await fs.mkdtemp(path.join(tmpRoot(),'l4-reject-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const texts={recipe_a:'甲稿。全程70分钟。',recipe_b:'乙稿。全程70分钟。',recipe_c:'丙稿。全程70分钟。'},labels=[],feedbacks=[];
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
  texts.recipe_b='乙稿新。全程70分钟。';
  labels.length=0;feedbacks.length=0;
  await runContentPipeline(options);
  assert.ok(labels.every(l=>l.includes('recipe_b')),'只为被退回条目发请求');assert.equal(labels.length,2);
  for(const id of ['recipe_a','recipe_c'])assert.equal(await fs.readFile(path.join(root,`${id}.json`),'utf8'),before[id]);
  const b=await readJSON(path.join(root,'recipe_b.json'));
  assert.equal(b.status,'passed');assert.equal(b.draft.process,'乙稿新。全程70分钟。');
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

test('L4 退回：被点名的 manual 条目也重写，attempts 累加且有上限；未点名的 manual 不动', async t => {
  const {root,texts,labels,options}=await fixture(t);
  const bad='乙稿。全程八十分钟。';texts.recipe_b=bad;texts.recipe_c=bad;
  const opts={...options,validateDraft:(d)=>d.process.includes('八十')?['数字写错']:[]};
  await runContentPipeline(opts);
  const oldB=await readJSON(path.join(root,'recipe_b.json'));
  assert.equal(oldB.status,'manual');assert.equal(oldB.attempts,3);
  await reject(root,{by:'L4 复核',at:'2026-11-10',reason:'重写',ids:['recipe_b']});
  labels.length=0;texts.recipe_b='乙稿新。全程70分钟。';
  await runContentPipeline(opts);
  const b=await readJSON(path.join(root,'recipe_b.json')),c=await readJSON(path.join(root,'recipe_c.json'));
  assert.equal(b.status,'passed');assert.equal(b.l4Rejection[0].priorStatus,'manual');assert.equal(b.l4Rejection[0].attemptCap,5);
  assert.ok(b.attempts>3&&b.attempts<=5);assert.equal(c.status,'manual');assert.ok(labels.every(l=>l.includes('recipe_b')));
  // 再次点名且仍写不对：累加到上限即止
  texts.recipe_b=bad;await reject(root,{by:'L4 复核',at:'2026-11-11',reason:'再重写',ids:['recipe_b']});
  await runContentPipeline(opts);
  const b2=await readJSON(path.join(root,'recipe_b.json'));
  assert.equal(b2.status,'manual');assert.ok(b2.attempts<=b.attempts+2);
});

test('人工改写后被 L4 退回再机器重写：manualRewrite 历史归档进 l4Rejection，记录按机器条目发布，不卡死', async t => {
  const {root,texts,options}=await fixture(t);
  await runContentPipeline(options);
  await reject(root,{by:'L4 复核',at:'2026-11-10',reason:'乙稿不通',ids:['recipe_b']});
  await manualRewrite({root,drafts:[{id:'recipe_b',draft:{id:'recipe_b',process:'乙稿人工版。'}}],by:'改写者甲',reason:'人工改写',headCommit:'abcdef1',entries:options.entries,validateDraft:options.validateDraft,now:()=>'2026-11-10T00:00:00.000Z'});
  const manual=await readJSON(path.join(root,'recipe_b.json'));
  assert.equal(manual.manualRewrite.length,1);assert.equal(manual.review.kind,'manual-rewrite-no-l2');
  // 人工稿又被 L4 退回：机器重写，产出真正的 L2 结果
  await reject(root,{by:'L4 复核',at:'2026-11-11',reason:'人工稿仍不通',ids:['recipe_b']});
  texts.recipe_b='乙稿机器版。全程70分钟。';
  await runContentPipeline(options);
  const b=await readJSON(path.join(root,'recipe_b.json'));
  assert.equal(b.status,'passed');assert.deepEqual(b.review,{contradictions:[]});
  assert.equal(b.manualRewrite,undefined,'人工改写历史须从记录上移除，门禁才按机器条目对待');
  const archived=b.l4Rejection.at(-1).priorManualRewrite;
  assert.deepEqual(archived,manual.manualRewrite,'审计痕迹原样归档在本次 l4Rejection 里');
  assert.equal(archived[0].by,'改写者甲');
  // 批次 L4 批准（只补批次要求的抽读/标记记录，没有审查者 by）后可以发布，不报“记录不完整”
  const file=path.join(root,'batch-0.json'),batch=await readJSON(file);
  batch.l4={approved:true,notes:[...new Set([...batch.sample,...batch.flagged])].map(id=>({id,note:'已逐字阅读'}))};
  await fs.writeFile(file,JSON.stringify(batch,null,2)+'\n');
  const summary=await readJSON(path.join(root,'summary.json'));summary.batches=[batch];await fs.writeFile(path.join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  const out=await readApprovedContent(root,options.entries);
  assert.equal(out.find(d=>d.id==='recipe_b').process,'乙稿机器版。全程70分钟。');
});
