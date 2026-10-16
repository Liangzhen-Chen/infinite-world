import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import{tmpRoot}from'../tools/tmp-root.mjs';
import {openSoakRun,nextSoakTask,performSoakTask,selectRecallQuestions,scoreRecallAnswers,summarizeSoak} from '../tools/m3-soak.mjs';
const facts=Array.from({length:30},(_,i)=>({id:`fact-${i}`,sourceTurn:i+1,sourceEvent:`event-${i}`,authority:'event-derived',category:i%2?'detail':'structured',question:`第${i+1}件旧事的数量？`,expected:i+1}));
async function directory(t){const root=await fs.mkdtemp(path.join(tmpRoot(),'fields-soak-'));t.after(async()=>{assert.ok(path.resolve(root).startsWith(path.resolve(tmpRoot())+path.sep));await fs.rm(root,{recursive:true,force:true});});return root;}
const result={completed:true,costUpperYuan:.01,checkpoint:{campaignId:'isolated',sequence:1},consistency:{verified:true,originalErrors:0,residualErrors:0},timing:{source:'action-rules',covered:true,expectedMinutes:5,elapsedMinutes:5},measurements:[{usage:{prompt_cache_hit_tokens:90,prompt_cache_miss_tokens:10}}]};

test('初始化不调用模型，续跑保留固定配置与同一个任务编号',async t=>{
 const root=await directory(t),run=await openSoakRun(root,{turns:3}),again=await openSoakRun(root,{turns:3});assert.deepEqual(again,run);assert.equal(run.config.budgetYuan,50);assert.equal(nextSoakTask(run).turn,1);
 await assert.rejects(openSoakRun(root,{turns:4}),/不一致/);assert.equal(summarizeSoak(run).pass,false);
});
test('已写入后网络失败以同一输入与锚点恢复，断点保留且两次失败后停止',async t=>{
 const root=await directory(t);await openSoakRun(root,{turns:3});const committed=new Set();let writes=0,requests=0;
 const execute=async task=>{requests++;if(!committed.has(task.id)){committed.add(task.id);writes++;throw Error('行动已保存但响应断开');}return result;};
 const failed=await performSoakTask(root,{input:'买一个面包',execute});assert.equal(failed.status,'failed');assert.equal(failed.run.spentYuan,.25);
 await assert.rejects(performSoakTask(root,{input:'换个行动',execute}),/冻结/);
 const resumed=await performSoakTask(root,{execute});assert.equal(resumed.status,'complete');assert.equal(writes,1);assert.equal(requests,2);assert.equal(resumed.run.personas.merchant.turns.length,1);assert.equal(resumed.run.spentYuan,.26);assert.deepEqual(resumed.run.personas.merchant.checkpoint,result.checkpoint);assert.equal(resumed.run.personas.merchant.turns[0].result.checkpoint,undefined);
 const fail=async()=>{throw Error('不能生成');};await performSoakTask(root,{input:'看看道路',execute:fail});await performSoakTask(root,{execute:fail});assert.equal((await performSoakTask(root,{execute:fail})).status,'attempts-exhausted');
});
test('先预留费用，额度不足不执行；不完整结果不被记录为完成',async t=>{
 const root=await directory(t);await openSoakRun(root,{turns:3,budgetYuan:.2});let called=false;
 assert.equal((await performSoakTask(root,{input:'问好',execute:async()=>{called=true;return result;}})).status,'budget-limited');assert.equal(called,false);
 const failed=await performSoakTask(root,{input:'问好',reserveYuan:.1,execute:async()=>({completed:true})});assert.equal(failed.status,'failed');assert.equal(failed.run.personas.merchant.turns.length,0);
});
test('仅从真实来源且足龄的未问事实抽题，类别与来源不足不能凑数通过',()=>{
 assert.equal(selectRecallQuestions(facts,{turn:25}).status,'notEligible');
 const selected=selectRecallQuestions(facts,{turn:75});assert.equal(selected.status,'ready');assert.equal(selected.questions.length,5);assert.equal(new Set(selected.questions.map(q=>q.sourceEvent)).size,5);assert.ok(selected.questions.every(q=>75-q.sourceTurn>=50));
 assert.equal(selectRecallQuestions(facts.map(f=>({...f,authority:'model'})),{turn:75}).status,'insufficient');
 const second=selectRecallQuestions(facts,{turn:75,usedFactIds:selected.questions.map(q=>q.id)});assert.ok(second.questions.every(q=>!selected.questions.some(old=>old.id===q.id)));
});
test('回忆评分核对逐字答句和答案值，缺答案与伪引文计错',()=>{
 const question={id:'f',sourceEvent:'e',sourceTurn:1,category:'structured',expected:2};
 assert.equal(scoreRecallAnswers([question],{text:'那次付了2铜。',answers:[{factId:'f',answer:2,quote:'付了2铜'}]})[0].correct,true);
 assert.equal(scoreRecallAnswers([question],{text:'那次付了12铜。',answers:[{factId:'f',answer:2,quote:'付了12铜'}]})[0].verified,false);
 assert.equal(scoreRecallAnswers([question],{text:'不知道。',answers:[]})[0].correct,false);
});
test('统计不以短跑、空样本、缺审查或修稿隐藏原始矛盾冒充验收',async t=>{
 const root=await directory(t),run=await openSoakRun(root,{turns:3});
 run.personas.merchant.turns=[{latencyMs:10,result:{...result,consistency:{verified:false,originalErrors:2,residualErrors:0}}}];
 run.measurements=[{usage:{prompt_cache_hit_tokens:90,prompt_cache_miss_tokens:10}},{usage:{prompt_cache_hit_tokens:0,prompt_cache_miss_tokens:900}}];
 const report=summarizeSoak(run);assert.equal(report.pass,false);assert.equal(report.cache.ratio,.09);assert.equal(report.personas[0].originalContradictionsPer100,200);assert.equal(report.personas[0].residualContradictionsPer100,0);assert.equal(report.personas[0].verified,0);assert.equal(report.personas[0].structured.ratio,null);
});
