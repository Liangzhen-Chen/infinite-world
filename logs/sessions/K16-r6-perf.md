# K16 R6 性能

基线INTEG@9729614a，实际HEAD每次base前检查且无已跟踪改动。同R5工具及bench种子，每样本30日×2；三对按base/tip/counter、tip/base/counter、base/counter/tip顺序，计时区间不含加载/角色创建/最终hash。每个样本全程持共享锁，本会话只有一个Node；TEMP/TMP=F:/dnd-tmp。主会话外测perf-gate为准。

|对|基线秒|R6秒|去城镇远路觅食对照秒|R6/基线|
|---|---:|---:|---:|---:|
|1|78.116|130.298|130.838|1.6680|
|2|78.293|133.595|130.551|1.7063|
|3|77.186|133.785|129.273|1.7333|

均值：base=77.865s，R6=132.559s，counter=130.221s。R6比基线慢70.24%，未达到尽量≤3%的目标；R5为1.734倍。不能据此宣称阶段perf-gate已通过。

对照只在加载钩子中去掉原生无公仓城镇的远路觅食计划，未改生产行为；它改变后续状态和供需反馈，只作边际成本测量，不代表TOWNFOOD完成后的预计速度。

10日计数：R5 buildScheduleHeap2509→R6 1733，基线1745；每日规划3014次，readDailyPlan=0（已删除该层）。日内固定计划直接读取持久化记录。

纯课程记忆优化前后60日tip的stateSha应一致；三份最终tip也应完全一致。

## 复现工具

```javascript

import path from 'node:path';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import inspector from 'node:inspector';
import {createHash} from 'node:crypto';
const counts={plans:0,heaps:0,readDailyPlan:0,courses:0};
globalThis.K16_COUNTS=counts;
const counter=process.argv.includes('--no-town-trips'),instrument=process.argv.includes('--counts'),beforeAging=process.argv.includes('--before-aging');
if(instrument||counter||beforeAging)registerHooks({load(url,context,next){const result=next(url,context);let source=String(result.source);
 if(beforeAging&&url.endsWith('/server-plugin/education-state.mjs'))source=source.replace("new Set(['aging','activity'","new Set(['activity'");
 if(instrument&&url.endsWith('/server-plugin/household-subsistence.mjs'))source=source.replace(/(export function householdSubsistencePlan\([^\n]*\)\{)/,'$1globalThis.K16_COUNTS.plans++;').replace(/(function readDailyPlan\([^\n]*\)\{)/,'$1globalThis.K16_COUNTS.readDailyPlan++;');
 if(instrument&&url.endsWith('/server-plugin/advance-registry.mjs'))source=source.replace('function buildScheduleHeap(engine,d,now,end){','function buildScheduleHeap(engine,d,now,end){globalThis.K16_COUNTS.heaps++;');
 if(instrument&&url.endsWith('/server-plugin/education-state.mjs'))source=source.replace('function deriveEducationCourses(e,s){','function deriveEducationCourses(e,s){globalThis.K16_COUNTS.courses++;');
 if(counter&&url.endsWith('/server-plugin/household-subsistence.mjs')){
  const original="const food=portions?journey(e,state,home,'food',minute,portions,null,memoState):null;";
  const replacement="let food=portions?journey(e,state,home,'food',minute,portions,null,memoState):null; if(food?.travelMinutes>0&&h&&e.world.households.some(row=>row.id===h.id)&&!state.npcs?.[owner]?.materialized?.county&&publicStore?.granary===false&&!e.byId.get(settlement)?.monsterSociety)food=null;";
  if(!source.includes(original))throw Error('town counter hook mismatch');source=source.replace(original,replacement);
 }
 return source===String(result.source)?result:{...result,source};
}});
const fx=await import(pathToFileURL(path.resolve('tests/farm-pests-fixture.mjs')));
const days=Number(process.argv.find(x=>x.startsWith('--days='))?.split('=')[1]??30),steps=Number(process.argv.find(x=>x.startsWith('--steps='))?.split('=')[1]??2);
const {c,run}=fx.setup('bench');let state=c;
const profile=process.argv.find(x=>x.startsWith('--profile='))?.slice(10);let session;
const call=method=>new Promise((resolve,reject)=>session.post(method,(error,result)=>error?reject(error):resolve(result)));
if(profile){session=new inspector.Session();session.connect();await call('Profiler.enable');await call('Profiler.start');}
const start=Date.now(),cpu=process.cpuUsage();
for(let i=0;i<steps;i++)state=await fx.wait(run,state,days*1440,`b${i}`);
const used=process.cpuUsage(cpu),result={cwd:process.cwd(),counter,beforeAging,days,steps,pid:process.pid,elapsedMs:Date.now()-start,userCpuMs:Math.round(used.user/1000),systemCpuMs:Math.round(used.system/1000),minute:state.state.minute,counts,households:Object.values(state.state.records).filter(row=>row.category==='subsistence_plan').reduce((n,row)=>n+Object.keys(row.households).length,0)};
result.stateSha=createHash('sha256').update(JSON.stringify(state.state)).digest('hex');
if(profile){const {profile:data}=await call('Profiler.stop');session.disconnect();await fs.writeFile(profile,JSON.stringify(data));}
const out=process.argv.find(x=>x.startsWith('--out='))?.slice(6);if(out)await fs.writeFile(out,JSON.stringify(result));console.log(JSON.stringify(result));


```

## 10日CPU剖析前后

同一inspector工具，仅推进区间；剖析带采样开销，不能混作无剖析的三对墙钟。各组包含时间互有重叠，不能相加。

|组|R5自身/包含秒|R6自身/包含秒|
|---|---|---|
|日程堆|1.336/3.980|0.873/2.779|
|日程结算|0.618/3.469|0.681/3.812|
|教育课程|0.705/2.176|0.741/3.294|
|生计计划/来源|0.065/1.190|0.074/1.223|
|状态/记录记忆|0.255/2.784|0.435/4.021|
|复制/规范化|1.839/1.840|1.206/1.206|
|路线|0.477/1.056|0.470/1.023|

R6自身时间热点：`[{"file": "storage.mjs", "function": "take", "line": 455, "selfSeconds": 0.908}, {"file": "npc-state.mjs", "function": "npcAgeAt", "line": 363, "selfSeconds": 0.896}, {"file": "advance-registry.mjs", "function": "buildScheduleHeap", "line": 166, "selfSeconds": 0.873}, {"file": "npc-schedule.mjs", "function": "settleSchedules", "line": 211, "selfSeconds": 0.681}, {"file": "", "function": "(garbage collector)", "line": 0, "selfSeconds": 0.597}, {"file": "engine.mjs", "function": "route", "line": 802, "selfSeconds": 0.47}, {"file": "education-state.mjs", "function": "", "line": 157, "selfSeconds": 0.46}, {"file": "storage.mjs", "function": "stateMemo", "line": 269, "selfSeconds": 0.382}, {"file": "engine.mjs", "function": "get", "line": 140, "selfSeconds": 0.375}, {"file": "education-state.mjs", "function": "", "line": 148, "selfSeconds": 0.347}, {"file": "education-state.mjs", "function": "courseMaster", "line": 152, "selfSeconds": 0.325}, {"file": "education-state.mjs", "function": "sameCourseInputs", "line": 159, "selfSeconds": 0.294}]`。原始数据K16-r5-profile.json、K16-r6-final-profile.json；计数K16-r6-final-counts-10d.json。
