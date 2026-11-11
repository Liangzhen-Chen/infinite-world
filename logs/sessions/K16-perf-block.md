# K16 R5 性能

晨间持久化设计已落地，未达到+3%参考目标。三对正式测量前全部本人验收Node已结束，每次串行独占本卡Node。基线INTEG逐次核对HEAD=9729614a及tracked干净。主会话仍需外测最终阶段perf-gate；本报告不替代该门槛。

核心同R4：farm-pests-fixture.setup('bench')，连续两次30日等待，事件b0/b1，计时不含加载/建角；初始540、结束86940。TEMP/TMP=F:/dnd-tmp。一组base→tip→counter，第二组tip→base→counter，第三组base→counter→tip。计数加载钩子不用于正式配对；CPU、PID、cwd、结束时刻保留在9份原始JSON。

|组|9729614a墙钟/用户CPU秒|K16墙钟/用户CPU秒|去城镇远路觅食墙钟/用户CPU秒|
|---|---:|---:|---:|
|1|86.41/101.34|150.47/176.19|142.56/166.89|
|2|85.90/100.81|148.49/174.77|144.87/169.75|
|3|88.96/103.50|154.07/182.99|152.45/178.52|
|均值|87.09/101.89|151.01/177.98|146.62/171.72|

K16相对基线墙钟均值+73.40%；城镇对照+68.36%。R4正式K16均值235.08秒、同轮base77.19秒，见原始K16-r4-pairs.json；本轮结论采用新的配对基线。

## 调用计数（10日）

主会话修前readDailyPlan67488次；本轮实际householdSubsistencePlan=3014=274组×11个晨间，含初始日和结束日，每组每日恰一次。readDailyPlan已删除，日内只查持久化目录/班次，不换成另一个进程内决策缓存。正式benchmark未预展开远方，251名册户+23无户组=274；审计额外展开54家户，不能混淆两种规模。

堆重建：基线本人复测1745，修前主会话2499，本轮2509；去城镇远路觅食对照2243。堆数未回到接近基线，不能把这项写成完成；真实生计出发/到达/返程边界仍保留。10日计数时有其他验收，因此其墙钟只作辅助，不替代上表三对。

城镇对照仅临时模块加载时取消正式城镇非本地食物旅程，不改生产/市场代码；保留择源计算、不补粮，且会改变剩余公共采集量及缺餐反馈，不能当作TOWNFOOD的精确预测。实际审计城镇4079次觅食，往返1393122/1698202分钟，未为了性能删除。

## 同工具复现源码

以下临时脚本交卡前删除，完整核心保留于本报告。切到相应工作树根，TEMP/TMP=F:/dnd-tmp；默认30日×2；--counts只用于调用计数；--no-town-trips只用于测量对照。

```js
import path from 'node:path';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import inspector from 'node:inspector';
const counts={plans:0,heaps:0,readDailyPlan:0};
globalThis.K16_COUNTS=counts;
const counter=process.argv.includes('--no-town-trips'),instrument=process.argv.includes('--counts');
if(instrument||counter)registerHooks({load(url,context,next){const result=next(url,context);let source=String(result.source);
 if(instrument&&url.endsWith('/server-plugin/household-subsistence.mjs'))source=source.replace(/(export function householdSubsistencePlan\([^\n]*\)\{)/,'$1globalThis.K16_COUNTS.plans++;').replace(/(function readDailyPlan\([^\n]*\)\{)/,'$1globalThis.K16_COUNTS.readDailyPlan++;');
 if(instrument&&url.endsWith('/server-plugin/advance-registry.mjs'))source=source.replace('function buildScheduleHeap(engine,d,now,end){','function buildScheduleHeap(engine,d,now,end){globalThis.K16_COUNTS.heaps++;');
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
const used=process.cpuUsage(cpu),result={cwd:process.cwd(),counter,days,steps,pid:process.pid,elapsedMs:Date.now()-start,userCpuMs:Math.round(used.user/1000),systemCpuMs:Math.round(used.system/1000),minute:state.state.minute,counts,households:Object.values(state.state.records).filter(row=>row.category==='subsistence_plan').reduce((n,row)=>n+Object.keys(row.households).length,0)};
if(profile){const {profile:data}=await call('Profiler.stop');session.disconnect();await fs.writeFile(profile,JSON.stringify(data));}
const out=process.argv.find(x=>x.startsWith('--out='))?.slice(6);if(out)await fs.writeFile(out,JSON.stringify(result));console.log(JSON.stringify(result));

```

## 10日同窗口剖析（秒，自身/包含）

R4与R5均用同一bench核心、建角后启动Profiler、无本人其他Node。R4原始K16-r4-last-profile.json，R5为K16-r5-profile.json。函数组按文件和函数名合并，包含时间对每条栈每组只计一次，避免包装/递归重复。新晨间计划也可在堆外的日界生成，不能将“旧日内计划层消失”直接等同所有成本消失；正式性能以三对60日配对为准。采样窗口仅10日，不能替代60日行为反馈。

|功能组|R4自身/包含|R5自身/包含|
|---|---:|---:|
|原日内计划层|0.41/6.734|0/0|
|新晨间批量计划|0/0|0.03/1.187|
|单户劳力规划|0.205/4.753|0.016/1.069|
|地理与来源选择|1.038/4.2|0.088/0.911|
|日程堆|1.684/9.564|1.336/3.98|
|日程读取|0.472/6.286|0.377/2.262|
|状态/记录记忆|1.299/10.632|0.255/2.784|
|复制与规范化|2.957/3.13|1.839/1.84|
|约束|0.344/0.453|0.308/0.348|
|课程|0.587/2.587|0.569/1.985|

R5自身热点（前15）：

|文件/函数|自身秒|
|---|---:|
|storage.mjs:take|1.45|
|advance-registry.mjs:buildScheduleHeap|1.336|
|education-state.mjs:|0.973|
|:(garbage collector)|0.842|
|npc-schedule.mjs:settleSchedules|0.618|
|engine.mjs:get|0.55|
|engine.mjs:route|0.477|
|npc-crime.mjs:|0.416|
|advance-registry.mjs:|0.401|
|storage.mjs:cloneWalk|0.38|
|npc-state.mjs:|0.377|
|npc-schedule.mjs:scheduledSlot|0.356|
|education-state.mjs:sameCourseInputs|0.321|
|holdings.mjs:lifecycleState|0.299|
|entity-view.mjs:personConstraint|0.289|
