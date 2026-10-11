import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicJSON,digest} from '../server-plugin/storage.mjs';
import {normalize} from '../server-plugin/retrieval.mjs';

export const SOAK_DEFAULTS=Object.freeze({turns:150,budgetYuan:50,probeEvery:25,probeCount:5,minAge:50,maxAge:200,personas:['merchant','builder']});
const clone=value=>structuredClone(value),read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
function configFor(overrides={}){
 const config={...SOAK_DEFAULTS,...overrides};
 if(Object.keys(overrides).some(key=>!Object.hasOwn(SOAK_DEFAULTS,key))||!Number.isInteger(config.turns)||config.turns<1||config.turns>300||!Number.isFinite(config.budgetYuan)||config.budgetYuan<=0||config.budgetYuan>50||config.probeEvery!==25||config.probeCount!==5||config.minAge!==50||config.maxAge!==200||JSON.stringify(config.personas)!==JSON.stringify(SOAK_DEFAULTS.personas))throw Error('浸泡配置无效；M3验收为两人格各150轮，上限50元');
 return config;
}
async function locked(directory,action){
 directory=path.resolve(directory);await fs.mkdir(directory,{recursive:true});const lockFile=path.join(directory,'run.lock');let lock;
 try{lock=await fs.open(lockFile,'wx');}catch(error){if(error.code!=='EEXIST')throw error;
  const owner=await read(lockFile);let alive=true;try{process.kill(owner.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;else throw e;}
  if(alive)throw Error('浸泡运行目录已有任务占用');await fs.unlink(lockFile);lock=await fs.open(lockFile,'wx');
 }
 await lock.writeFile(JSON.stringify({pid:process.pid,started:new Date().toISOString()}));
 try{return await action(path.join(directory,'run.json'));}finally{await lock.close();await fs.unlink(lockFile);}
}
export async function openSoakRun(directory,overrides={}){
 return locked(directory,async file=>{
  const config=configFor(overrides);let run;
  try{run=await read(file);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(run){if(run.version!==1||digest(run.config)!==digest(config))throw Error('续跑配置与原记录不一致');return run;}
  run={version:1,id:`soak_${digest([path.resolve(directory),new Date().toISOString()]).slice(0,20)}`,config,spentYuan:0,measurements:[],pending:null,
   personas:Object.fromEntries(config.personas.map(id=>[id,{turns:[],probes:[],facts:[],checkpoint:null}]))};
  await atomicJSON(file,run);return run;
 });
}

export function selectRecallQuestions(facts,{turn,count=5,minAge=50,maxAge=200,usedFactIds=[]}={}){
 const used=new Set(usedFactIds),ids=new Set(),sourceEvents=new Set();
 const eligible=facts.filter(fact=>{
  if(!fact?.id||ids.has(fact.id))return false;ids.add(fact.id);
  return fact.authority==='event-derived'&&typeof fact.sourceEvent==='string'&&Number.isInteger(fact.sourceTurn)&&turn-fact.sourceTurn>=minAge&&turn-fact.sourceTurn<=maxAge&&!used.has(fact.id)&&['structured','detail'].includes(fact.category)&&typeof fact.question==='string'&&fact.question&&Object.hasOwn(fact,'expected');
 }).sort((a,b)=>digest([turn,a.id]).localeCompare(digest([turn,b.id])));
 const selected=[];
 // A batch needs both categories, and each question uses a separate event.
 for(let i=0;i<count;i++){
  const category=i%2?'detail':'structured',fact=eligible.find(row=>row.category===category&&!sourceEvents.has(row.sourceEvent));
  if(!fact)break;selected.push(clone(fact));sourceEvents.add(fact.sourceEvent);
 }
 return {status:selected.length===count?'ready':turn<=minAge?'notEligible':'insufficient',eligible:eligible.length,questions:selected};
}

export function nextSoakTask(run){
 if(run.pending)return clone(run.pending);
 for(const persona of run.config.personas){
  const row=run.personas[persona],turn=row.turns.length;
  if(turn&&turn%run.config.probeEvery===0&&!row.probes.some(p=>p.turn===turn)){
   const selected=selectRecallQuestions(row.facts,{turn,count:run.config.probeCount,minAge:run.config.minAge,maxAge:run.config.maxAge,usedFactIds:row.probes.flatMap(p=>p.questions?.map(q=>q.id)??[])});
   return {id:`${run.id}_${persona}_probe_${turn}`,kind:'probe',persona,turn,...selected};
  }
 }
 const persona=[...run.config.personas].filter(id=>run.personas[id].turns.length<run.config.turns).sort((a,b)=>run.personas[a].turns.length-run.personas[b].turns.length)[0];
 if(!persona)return null;
 const turn=run.personas[persona].turns.length+1;
 return {id:`${run.id}_${persona}_turn_${turn}`,kind:'turn',persona,turn,status:'ready'};
}
const answerKey=value=>normalize(typeof value==='string'?value:JSON.stringify(value)).replace(/\s/g,'');
function supported(answer,quote){
 if(typeof answer==='number')return new RegExp(`(^|[^0-9])${String(answer).replace('.','\\.')}([^0-9]|$)`).test(quote);
 if(typeof answer==='string')return answerKey(quote).includes(answerKey(answer))&&answer.length>0;
 if(Array.isArray(answer))return answer.length>0&&answer.every(item=>supported(item,quote));
 return false;
}
export function scoreRecallAnswers(questions,{text,answers=[]}={}){
 return questions.map(question=>{
  const matches=answers.filter(answer=>answer.factId===question.id),answer=matches[0];
  const verified=matches.length===1&&typeof text==='string'&&typeof answer?.quote==='string'&&answer.quote.length>0&&text.includes(answer.quote)&&supported(answer.answer,answer.quote);
  const correct=verified&&[question.expected,...question.acceptableAnswers??[]].some(value=>answerKey(value)===answerKey(answer.answer));
  return {factId:question.id,sourceEvent:question.sourceEvent,sourceTurn:question.sourceTurn,category:question.category,verified,correct,quote:answer?.quote??null,answer:answer?.answer??null};
 });
}

// This is a resumable test driver, not a second game engine. The adapter must
// reuse the existing HTTP playtest turn, using task.id as its stable anchor.
// It receives no quiz answer keys and must reconcile an already committed
// task on retry instead of issuing fresh writes. No model is called here.
export async function performSoakTask(directory,{input,execute,reserveYuan=.25}={}){
 return locked(directory,async file=>{
  const run=await read(file),task=nextSoakTask(run);if(!task)return {status:'complete',run};
  const persona=run.personas[task.persona];
  if(task.kind==='probe'&&task.status!=='ready'){
   persona.probes.push({...task,questions:[],scores:[]});await atomicJSON(file,run);return {status:task.status,task,run};
  }
  if(typeof execute!=='function'||!Number.isFinite(reserveYuan)||reserveYuan<=0)throw Error('需要已有试玩执行器与有效费用预留');
  if(task.input!==undefined&&input!==undefined&&task.input!==input)throw Error('续跑不能更换已经冻结的输入');
  task.input??=task.kind==='probe'?`（场外）请逐项回答以下旧事；不确定时明确说不知道。\n${task.questions.map((q,i)=>`${i+1}. ${q.question}`).join('\n')}`:input;
  if(typeof task.input!=='string'||!task.input.trim())throw Error('本轮尚无玩家输入；脚手架不会代写或猜测');
  task.attempts??=[];
  if(task.attempts.length>=2)return {status:'attempts-exhausted',task,run};
  if(run.spentYuan+reserveYuan>run.config.budgetYuan)return {status:'budget-limited',task,run};
  const attempt={status:'pending',reservedYuan:reserveYuan,chargedYuan:reserveYuan};task.attempts.push(attempt);run.pending=task;run.spentYuan+=reserveYuan;await atomicJSON(file,run);
  const started=performance.now();
  try{
   const result=await execute({id:task.id,kind:task.kind,persona:task.persona,turn:task.turn,input:task.input,checkpoint:clone(persona.checkpoint)});
   if(!result||result.completed!==true||!Number.isFinite(result.costUpperYuan)||result.costUpperYuan<0||!result.checkpoint)throw Error('本轮缺少完成确认、费用或存储检查点');
   attempt.chargedYuan=result.costUpperYuan;run.spentYuan+=result.costUpperYuan-reserveYuan;
   if(run.spentYuan>run.config.budgetYuan)throw Error('执行器超出已预留预算；停止后续调用，已成功动作保留');
   // Diagnostics may retain the input and original draft; game state stays in
   // the existing CampaignStorage checkpoint/export supplied by the adapter.
   const {checkpoint,...diagnostic}=result;
   let facts=[];
   if(task.kind==='turn'){
    const sourceEvents=new Set(result.eventIds??[]);
    facts=(result.facts??[]).map(fact=>{
     if(fact.authority!=='event-derived'||!sourceEvents.has(fact.sourceEvent))throw Error('回忆题材料缺少本轮真实事件来源');
     return {...clone(fact),sourceTurn:task.turn};
    });
   }
   attempt.status='complete';attempt.latencyMs=performance.now()-started;
   run.measurements.push(...clone(result.measurements??[]));persona.checkpoint=clone(checkpoint);
   if(task.kind==='turn'){
    persona.turns.push({turn:task.turn,anchor:task.id,input:task.input,latencyMs:attempt.latencyMs,result:clone(diagnostic),attempts:clone(task.attempts)});persona.facts.push(...facts);
   }else {const answers=(result.answers??[]).map(a=>a.factId?a:{...a,factId:task.questions[a.number-1]?.id});persona.probes.push({...clone(task),status:'complete',scores:scoreRecallAnswers(task.questions,{...result,answers}),result:clone(diagnostic)});}
   run.pending=null;await atomicJSON(file,run);return {status:'complete',task,run};
  }catch(error){
   attempt.status='failed';attempt.error=String(error.message).replaceAll(process.env.DEEPSEEK_API_KEY??'__no_key__','[凭据已屏蔽]').slice(0,1200);attempt.latencyMs=performance.now()-started;
   await atomicJSON(file,run);return {status:'failed',task,run,error:attempt.error};
  }
 });
}

const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;
export function summarizeSoak(run){
 const people=Object.entries(run.personas).map(([persona,row])=>{
  const scores=row.probes.flatMap(probe=>probe.scores??[]),ratio=category=>{
   const selected=scores.filter(score=>score.category===category);return {correct:selected.filter(s=>s.correct).length,total:selected.length,ratio:selected.length?selected.filter(s=>s.correct).length/selected.length:null};
  };
  const reviews=row.turns.map(turn=>turn.result.consistency),verified=reviews.filter(r=>r?.verified===true).length;
  const totalIssues=key=>reviews.reduce((sum,r)=>sum+(Number.isInteger(r?.[key])&&r[key]>0?r[key]:0),0);
  const original=totalIssues('originalErrors'),residual=totalIssues('residualErrors');
  const warnings={original:totalIssues('originalWarnings'),residual:totalIssues('residualWarnings'),reviewRequired:reviews.some(r=>r?.residualWarnings>0)};
  const clocks=row.turns.map(turn=>turn.result.timing),timed=clocks.filter(t=>t?.source==='action-rules'&&t.covered===true&&Number.isFinite(t.expectedMinutes)&&t.expectedMinutes>=0&&Number.isFinite(t.elapsedMinutes)&&t.elapsedMinutes>=0);
  const expected=timed.reduce((n,t)=>n+t.expectedMinutes,0),difference=timed.reduce((n,t)=>n+Math.abs(t.elapsedMinutes-t.expectedMinutes),0);
  const structured=ratio('structured'),detail=ratio('detail'),latencies=row.turns.map(t=>t.latencyMs);
  const complete=row.turns.length===run.config.turns&&row.probes.every(p=>p.status==='notEligible'?p.turn<=run.config.minAge:p.status==='complete'&&p.scores?.length===run.config.probeCount)&&row.probes.length===Math.floor(run.config.turns/run.config.probeEvery);
  return {persona,turns:row.turns.length,complete,structured,detail,verified,warnings,originalContradictionsPer100:row.turns.length?original*100/row.turns.length:null,residualContradictionsPer100:row.turns.length?residual*100/row.turns.length:null,
   recallCoverage:row.probes.map(p=>({turn:p.turn,status:p.status,samples:p.scores?.length??0})),latencyMs:{p50:percentile(latencies,.5),p95:percentile(latencies,.95)},
   timing:{covered:timed.length,total:clocks.length,deviation:expected?difference/expected:difference===0&&timed.length===clocks.length?0:null},
   pass:complete&&structured.ratio>=.95&&detail.ratio>=.8&&verified===row.turns.length&&reviews.every(r=>Number.isInteger(r.originalErrors)&&Number.isInteger(r.residualErrors))&&original*100/row.turns.length<=1&&residual===0&&timed.length===clocks.length&&(expected?difference/expected<=.1:difference===0)};
 });
 const usage=run.measurements.filter(m=>m.runtime!==false),hit=usage.reduce((n,m)=>n+(m.usage?.prompt_cache_hit_tokens??0),0),miss=usage.reduce((n,m)=>n+(m.usage?.prompt_cache_miss_tokens??0),0);
 const cacheCoverage=usage.length>0&&usage.every(m=>Number.isSafeInteger(m.usage?.prompt_cache_hit_tokens)&&m.usage.prompt_cache_hit_tokens>=0&&Number.isSafeInteger(m.usage?.prompt_cache_miss_tokens)&&m.usage.prompt_cache_miss_tokens>=0);
 const cacheRatio=cacheCoverage&&hit+miss?hit/(hit+miss):null,totalTurns=people.reduce((n,p)=>n+p.turns,0);
 return {personas:people,complete:people.every(p=>p.complete)&&!run.pending,costUpperYuan:run.spentYuan,budgetYuan:run.config.budgetYuan,averageCostYuan:totalTurns?run.spentYuan/totalTurns:null,
  cache:{hitTokens:hit,missTokens:miss,ratio:cacheRatio,complete:cacheCoverage},
  pass:run.config.turns===150&&!run.pending&&people.every(p=>p.pass)&&cacheRatio!==null&&cacheRatio>=.7&&run.spentYuan<=run.config.budgetYuan};
}
