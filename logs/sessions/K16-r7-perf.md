# K16 R7 性能

基线为 INTEG@9729614a，bench种子、farm-pests-fixture及推进步骤沿用R6。正式长测每样本30日×2，独占本会话Node；每次base前核对HEAD及无已跟踪改动。TEMP/TMP=F:/dnd-tmp。主会话外测perf-gate为准。

十日×1独占CPU剖析，计时不含世界加载与角色创建：

|版本|educationCourses包含秒|sameCourseInputs包含秒|推进秒|
|---|---:|---:|---:|
|9729614a|0.743099|0.214039|13.431|
|R6原状|3.149075|2.837625|19.757|
|精确字段依赖|2.154606|1.853845|18.377|
|派生也复用索引，尚未修临时state副本|2.232638|2.003964|18.625|
|查询钟点独立参数，索引挂真实state|0.487038|0.361526|16.906|
|课程环境只读实际类别，最终R7|0.211451|0.120031|16.091|

中间版本仅增加索引复用没有降低总开销，不能单独交付；完整接点修复后，实际派生与校验共用同一按日/实际字段索引。最终组成的保留依据另列消融对照。所有十日tip状态哈希均与R6相同：30ee1fd8b02b0ad27b1eaf51bfc059fffb768b5f04546b347e9f6d4a2d35a0c7。

最终课程两个包含时间均低于基线。学生/教师/师徒索引十日实际构建12/13/10次，book owners9次；接点尚不完整的中间版本为1621/3305/3302/1573次。索引随日界、出生/名册、资格和关系类型的实际变化失效，不随普通位置、活动、无关created写入失效。计划计算3014，日内readDailyPlan=0；堆重建1733（基线1745、R5为2509）。

去掉两教育模块调用栈后，四个生计相关模块的包含时间去重并集为1.758284→4.143867秒，增量2.385583秒/十日。各模块有嵌套，下面各行不能直接相加：

|模块|基线秒|R7秒|
|---|---:|---:|
|household-subsistence|0|2.200767|
|water-cycle|0.079644|0.613774|
|npc-state|0.889095|1.224665|
|household-budget|0.822852|0.928212|

## 正式三对30日×2

|对|基线秒|R7秒|R7/基线|
|---|---:|---:|---:|
|1|82.068|108.249|1.319016|
|2|80.581|108.941|1.351944|
|3|80.099|110.000|1.373301|

均值基线80.916000秒、R7 109.063333秒，比值1.347859，慢34.79%。没有达到尽量≤1.03；阶段perf-gate未测，不宣称通过。R6历史同工具均值132.559秒/比值1.702425；不同批硬件波动应以成对比值为主。三份R7最终stateSha均与R6相同。


教育扣除另用同场景三对样本：仅在加载钩子中计时教育导出查询/结算函数，嵌套调用取并集，不禁用课程、授业或其他世界行为。扣除值为推进墙钟时间减去教育函数并集时间；它仍包含其他通用调度开销，不把全部差值强归给生计模块。普通正式样本不加此计时钩子。

## 教育函数耗时扣除三对

|对|基线总秒|R7总秒|基线教育秒|R7教育秒|基线扣除后秒|R7扣除后秒|扣除后增量秒|
|---|---:|---:|---:|---:|---:|---:|---:|
|1|83.079000|110.083000|9.227627|5.019623|73.851373|105.063377|31.212005|
|2|84.258000|108.962000|9.495026|4.895458|74.762974|104.066542|29.303568|
|3|83.465000|111.562000|9.402028|5.050593|74.062972|106.511407|32.448435|

均值教育9.374894→4.988558秒；扣除后74.225773→105.213775秒，增量30.988003秒/60日。

计时钩子也有成本，扣除组只作组内比较，不与无钩子的正式组混算。全部六份世界结果哈希与对应无钩子样本一致。

## 派生复用的消融确认

|实现|十日推进均值秒|educationCourses均值秒|sameCourseInputs均值秒|derive均值秒|
|---|---:|---:|---:|---:|
|final|16.780667|0.246786|0.118023|0.085243|
|fresh|17.174000|0.339562|0.123514|0.159075|

fresh仅在加载时恢复派生中的全体年龄/资格/师徒扫描，保留其他最终修复；没有改变生产代码。每种三次、交换顺序测量，六份stateSha相同。最终复用索引的平均推进和课程包含时间均下降，故保留该组成；没有只根据未完成接点的中间版本作结论。最终三次educationCourses及sameCourseInputs均低于基线。

## 复现工具

以下保存实际使用的工具。正式样本不带额外计时参数；教育扣除样本加--education-timing。所有样本--days=30 --steps=2，cwd分别为INTEG与K16。历史r6/fresh-derive诊断参数依赖本轮临时R6源码快照，该快照交卡时清理；历史源码差异保存在K16-r7-production.patch。

```javascript
import path from 'node:path';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import inspector from 'node:inspector';
import {createHash} from 'node:crypto';
const counts={plans:0,heaps:0,readDailyPlan:0,courses:0};
globalThis.K16_COUNTS=counts;
let educationDepth=0,educationStarted=0;
globalThis.K16_MEASURE_EDUCATION=task=>{if(educationDepth++===0)educationStarted=performance.now();try{return task();}finally{if(--educationDepth===0)counts.educationMs=(counts.educationMs??0)+performance.now()-educationStarted;}};
const r6=process.argv.includes('--r6');
const educationTiming=process.argv.includes('--education-timing');
const freshDerive=process.argv.includes('--fresh-derive');
const counter=process.argv.includes('--no-town-trips'),instrument=process.argv.includes('--counts'),beforeAging=process.argv.includes('--before-aging');
if(instrument||counter||beforeAging||r6||educationTiming||freshDerive)registerHooks({load(url,context,next){const result=next(url,context);let source=String(result.source);
 if(r6&&url.endsWith('/server-plugin/education-state.mjs'))source=readFileSync('F:/dnd/logs/sessions/K16-r7-before-education-state.mjs.txt','utf8');
 if(r6&&url.endsWith('/server-plugin/storage.mjs'))source=readFileSync('F:/dnd/logs/sessions/K16-r7-before-storage.mjs.txt','utf8');
 if(r6&&url.endsWith('/server-plugin/education.mjs'))source=source.replace('educationCourses(e,state,before)','educationCourses(e,{...state,minute:before})');
 if(r6&&url.endsWith('/server-plugin/npc-schedule.mjs'))source=source.replace('educationCourses(engine,state,minute)','educationCourses(engine,{...state,minute})').replace('educationCourses(e,state,before)','educationCourses(e,{...state,minute:before})');
 if(freshDerive&&url.endsWith('/server-plugin/education-state.mjs')){
  const old=readFileSync('F:/dnd/logs/sessions/K16-r7-before-education-state.mjs.txt','utf8');
  const body=old.slice(old.indexOf('function deriveEducationCourses('),old.indexOf('export function courseWindow(')).replace('function deriveEducationCourses(e,s){','function deriveEducationCourses(e,input,minute=input.minute){const s=minute===input.minute?input:{...input,minute};');
  source=source.slice(0,source.indexOf('function deriveEducationCourses('))+body+source.slice(source.indexOf('export function courseWindow('));
 }
 if(beforeAging&&url.endsWith('/server-plugin/education-state.mjs'))source=source.replace("new Set(['aging','activity'","new Set(['activity'");
 if(instrument&&url.endsWith('/server-plugin/household-subsistence.mjs'))source=source.replace(/(export function householdSubsistencePlan\([^\n]*\)\{)/,'$1globalThis.K16_COUNTS.plans++;').replace(/(function readDailyPlan\([^\n]*\)\{)/,'$1globalThis.K16_COUNTS.readDailyPlan++;');
 if(instrument&&url.endsWith('/server-plugin/advance-registry.mjs'))source=source.replace('function buildScheduleHeap(engine,d,now,end){','function buildScheduleHeap(engine,d,now,end){globalThis.K16_COUNTS.heaps++;');
 if(instrument&&url.endsWith('/server-plugin/education-state.mjs'))source=source.replace(/(function deriveEducationCourses\([^\n]*\)\{)/,'$1globalThis.K16_COUNTS.courses++;');
 if(instrument&&url.endsWith('/server-plugin/storage.mjs'))source=source.replace('if (!cache.has(memoValue)) cache.set(memoValue, build());',"if (!cache.has(memoValue)) {const key=String(inputs[0]);if(key.startsWith('Symbol(course')){const builds=globalThis.K16_COUNTS.memoBuilds??={};builds[key]=(builds[key]??0)+1;}cache.set(memoValue, build());}");
 if(counter&&url.endsWith('/server-plugin/household-subsistence.mjs')){
  const original="const food=portions?journey(e,state,home,'food',minute,portions,null,memoState):null;";
  const replacement="let food=portions?journey(e,state,home,'food',minute,portions,null,memoState):null; if(food?.travelMinutes>0&&h&&e.world.households.some(row=>row.id===h.id)&&!state.npcs?.[owner]?.materialized?.county&&publicStore?.granary===false&&!e.byId.get(settlement)?.monsterSociety)food=null;";
  if(!source.includes(original))throw Error('town counter hook mismatch');source=source.replace(original,replacement);
 }
 if(educationTiming&&(url.endsWith('/server-plugin/education-state.mjs')||url.endsWith('/server-plugin/education.mjs'))){
  const names=url.endsWith('/education-state.mjs')?['educationCourses','settleDemonstrations','personCourses','educationSlot','courseWindow','educationReservation','educationSites','educationStatistics']:['prepareEducation','advanceEducation','nextEducationMinute'];
  for(const name of names){const original=`export function ${name}(`;if(source.includes(original)){source=source.replace(original,`function K16_${name}(`)+`\nexport function ${name}(...args){return globalThis.K16_MEASURE_EDUCATION(()=>K16_${name}(...args));}\n`;}}
 }
 return source===String(result.source)?result:{...result,source};
}});
const fx=await import(pathToFileURL(path.resolve('tests/farm-pests-fixture.mjs')));
const days=Number(process.argv.find(x=>x.startsWith('--days='))?.split('=')[1]??30),steps=Number(process.argv.find(x=>x.startsWith('--steps='))?.split('=')[1]??2);
const {c,run}=fx.setup('bench');let state=c;
const profile=process.argv.find(x=>x.startsWith('--profile='))?.slice(10);let session;
const call=method=>new Promise((resolve,reject)=>session.post(method,(error,result)=>error?reject(error):resolve(result)));
if(profile){session=new inspector.Session();session.connect();await call('Profiler.enable');await call('Profiler.start');}
counts.educationMs=0;const start=Date.now(),cpu=process.cpuUsage();
for(let i=0;i<steps;i++)state=await fx.wait(run,state,days*1440,`b${i}`);
const used=process.cpuUsage(cpu),result={cwd:process.cwd(),counter,beforeAging,educationTiming,freshDerive,r6,days,steps,pid:process.pid,elapsedMs:Date.now()-start,userCpuMs:Math.round(used.user/1000),systemCpuMs:Math.round(used.system/1000),minute:state.state.minute,counts,households:Object.values(state.state.records).filter(row=>row.category==='subsistence_plan').reduce((n,row)=>n+Object.keys(row.households).length,0)};
result.stateSha=createHash('sha256').update(JSON.stringify(state.state)).digest('hex');
result.createdTypes=Object.keys(state.state.created??{}).reduce((m,k)=>(m[k.split('_')[0]]=(m[k.split('_')[0]]??0)+1,m),{});
if(educationTiming)result.withoutEducationMs=result.elapsedMs-counts.educationMs;
if(profile){const {profile:data}=await call('Profiler.stop');session.disconnect();await fs.writeFile(profile,JSON.stringify(data));}
const out=process.argv.find(x=>x.startsWith('--out='))?.slice(6);if(out)await fs.writeFile(out,JSON.stringify(result));console.log(JSON.stringify(result));

```
