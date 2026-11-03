# K16 R8 性能

最终保留静态水域/栖地记忆、按实际水量输入的资源系数记忆、晨间共享的水源可用性/有限库存投影及家户候选地理读取。有限库存按原顺序逐户预留，执行仍读取实际库存、劳力、封路和水质。日计划仍按聚落/日持久化；本轮新增持久化差异0。

整体仍未达阶段门槛。以下均为本机实测；主会话外测perf-gate为准。没有运行会checkout的perf-gate.sh，没有Git写操作。

## 两组三对30日×2

同一个farm-pests-fixture、seed=bench、b0/b1两次world_time，各推进30日。正式样本不加计数/CPU采样钩子，每样本一个独立Node，TEMP/TMP=F:/dnd-tmp，本会话没有其他Node并行。基线每对前后核对HEAD及无已跟踪改动。master使用PERFBASE@3bbd7e0c；s5a目标6907af37复用PERFS8@881eb4e6，二者只差docs/actions.json、docs/system-map.html、docs/system-map.json，执行代码、世界数据、工具、夹具和extension相同。

|组|对|基线秒|K16秒|比值|
|---|---:|---:|---:|---:|
|master|1|71.469|101.190|1.415859|
|master|2|71.565|99.408|1.389059|
|master|3|72.327|94.950|1.312788|

master：配对比值中位数1.389059；均值基线71.787秒、K16 98.516秒，均值之比1.372338。

|组|对|基线秒|K16秒|比值|
|---|---:|---:|---:|---:|
|s5a|1|77.679|98.857|1.272635|
|s5a|2|79.049|100.648|1.273236|
|s5a|3|76.636|97.039|1.266233|

s5a：配对比值中位数1.272635；均值基线77.788秒、K16 98.848秒，均值之比1.270736。

开工前2414a6b8的单份60日参考为104.524秒，最终六份均值98.682秒。此前后参考没有三对配对设计，不替代上表，也不与主会话其他批次直接作因果比较。六份最终stateSha均等于开工前：88fd2c17ed42ebbaf1d6b453437913da7cc8222ce79d0cf6bea22035de859e49。

## 分项十日剖析

以下三阶段使用同一个精简计数/Inspector工具，本会话独占Node。地理阶段只替换water-cycle与wildlife-habitats，家户模块仍加载开工前源码；最终阶段加晨间共享读取。包含时间存在嵌套，不能相加。部分候选读取从readJourney上移到journey/晨间上下文，工作仍计入总计划时间。0表示未采到样本。原始数据见K16-r8-profile-summary.json及对应cpuprofile。

|函数|开工前秒|仅地理秒|最终秒|
|---|---:|---:|---:|
|prepareHouseholdSubsistence|1.113058|1.141711|1.041260|
|householdSubsistencePlan|0.982986|1.020000|0.915888|
|advanceHouseholdMeals|0.859036|0.361314|0.352620|
|journey|0.696670|0.734911|0.629847|
|readJourney|0.666973|0.691016|0.441986|
|supplyHousehold|0.752766|0.245688|0.244948|
|pair|0.399580|0.410921|0.406215|
|waterResourceFactor|0.464087|0.003117|0.004694|
|waterBasins|0.440353|0.003117|0.007844|
|locationHabitatTypes|0.234822|0.000000|0.001577|
|sourceGeography|0.169626|0.207416|0.203158|
|forageStock|0.092509|0.071926|0.008054|
|整个十日推进|15.978|15.377|15.450|

三阶段计划计算均3014次、堆重建均1733次、日内readDailyPlan=0；同fixture中s5a堆1745、master堆1723。3014与274户×11个触及自然日一致。三个K16阶段十日完整状态哈希相同。共享读取减少forageStock重复克隆；成员名册继续复用既有户籍输入索引。

pair实际为一个候选点的去程/返程查询，按候选序找到第一个可用源即停止；候选已受真实往返工时上限过滤。最终pair包含时间没有下降。保留按距离排序的静态候选与真实库存/效率择源，未添加人为“前N个”截断。

## 未保留的额外路线前沿

试验将同一晨间的engine.route图按出发刻分别保存，使去程前沿不被返程覆盖。三对十日交换顺序消融如下，六份状态哈希相同：

|对|额外前沿秒|沿用引擎原缓存秒|
|---|---:|---:|
|1|12.891|13.174|
|2|13.139|13.112|
|3|13.082|13.047|

配对比值中位1.002059，两对略慢；CPU总均值额外前沿18.463秒、原缓存18.318秒。总体没有稳定收益，已撤回；PERFS8原有路线缓存保留。正式长测全部使用撤回后的最终代码。

## 扣除教育后的生计增量

将household-subsistence、water-cycle、npc-state、household-budget四模块的包含调用栈取去重并集，并排除任何education-state/education祖先帧。这个量含它们调用的通用层，未将整个推进差值归给生计；各模块包含时间有重叠，不直接求和。

|量|master秒|s5a秒|开工前K16秒|最终K16秒|
|---|---:|---:|---:|---:|
|四模块去重并集、排除教育|0.603659|1.654739|3.927128|3.390635|

本轮该并集减少0.536493秒/十日；最终相对s5a仍增加1.735896秒，相对master增加2.786976秒。

|模块包含时间|master秒|s5a秒|最终秒|
|---|---:|---:|---:|
|household-subsistence.mjs|0.000000|0.000000|1.502778|
|water-cycle.mjs|0.053525|0.075010|0.087599|
|npc-state.mjs|0.612152|0.911254|1.313620|
|household-budget.mjs|0.000000|0.811498|0.847174|

|教育查询包含时间|master秒|s5a秒|最终秒|
|---|---:|---:|---:|
|educationCourses|0.574246|0.732294|0.235394|
|sameCourseInputs|0.164183|0.225781|0.114891|

教育两项仍低于基线。本轮没有修改教育模块。剩余最大自耗时如下；只列当前样本，不假定它们全部由K16引起。

|函数|模块|自耗时秒|
|---|---|---:|
|take|storage.mjs|0.999860|
|buildScheduleHeap|advance-registry.mjs|0.842643|
|settleSchedules|npc-schedule.mjs|0.617692|
|(garbage collector)||0.484010|
|search|engine.mjs|0.431200|
|cloneWalk|storage.mjs|0.358070|
|get|engine.mjs|0.358069|
|personConstraint|entity-view.mjs|0.336259|

## 复现工具

下面是实际最终工具。正常三对只用--days=30 --steps=2；十日剖析加--counts --profile=<文件>。从相应工作树cwd运行，先设置TEMP/TMP。开工前源通过2414a6b8三个原始模块的只读加载钩子恢复，未切换或修改Git工作树；临时钩子和源码备份交卡清理。正式原始数据、PID记录和测量结果保留。

```javascript
import path from 'node:path';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import inspector from 'node:inspector';
import {createHash} from 'node:crypto';
const counts={plans:0,heaps:0,readDailyPlan:0,courses:0};
globalThis.K16_COUNTS=counts;
if(process.argv.includes('--counts'))registerHooks({load(url,context,next){
 const result=next(url,context);let source=String(result.source);
 if(url.endsWith('/server-plugin/household-subsistence.mjs'))source=source.replace(/(export function householdSubsistencePlan\([^\n]*\)\{)/,'$1globalThis.K16_COUNTS.plans++;');
 if(url.endsWith('/server-plugin/advance-registry.mjs'))source=source.replace('function buildScheduleHeap(engine,d,now,end){','function buildScheduleHeap(engine,d,now,end){globalThis.K16_COUNTS.heaps++;');
 if(url.endsWith('/server-plugin/education-state.mjs'))source=source.replace(/(function deriveEducationCourses\([^\n]*\)\{)/,'$1globalThis.K16_COUNTS.courses++;');
 return source===String(result.source)?result:{...result,source};
}});
const fx=await import(pathToFileURL(path.resolve('tests/farm-pests-fixture.mjs')));
const arg=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3);
const days=Number(arg('days')??30),steps=Number(arg('steps')??2),profile=arg('profile');
const {c,run}=fx.setup('bench');let state=c,session;
const call=method=>new Promise((resolve,reject)=>session.post(method,(error,result)=>error?reject(error):resolve(result)));
if(profile){session=new inspector.Session();session.connect();await call('Profiler.enable');await call('Profiler.start');}
const start=Date.now(),cpu=process.cpuUsage();
for(let i=0;i<steps;i++)state=await fx.wait(run,state,days*1440,`b${i}`);
const used=process.cpuUsage(cpu),result={cwd:process.cwd(),days,steps,pid:process.pid,elapsedMs:Date.now()-start,userCpuMs:Math.round(used.user/1000),systemCpuMs:Math.round(used.system/1000),minute:state.state.minute,counts};
result.stateSha=createHash('sha256').update(JSON.stringify(state.state)).digest('hex');
if(profile){const {profile:data}=await call('Profiler.stop');session.disconnect();await fs.writeFile(profile,JSON.stringify(data));}
if(arg('out'))await fs.writeFile(arg('out'),JSON.stringify(result));
console.log(JSON.stringify(result));

```

开工前三模块只读加载钩子（源码从2414a6b8读取；临时备份交卡清理）：

```javascript
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
const files=['household-subsistence.mjs','water-cycle.mjs','wildlife-habitats.mjs'];
registerHooks({load(url,context,next){const result=next(url,context),name=files.find(name=>url.endsWith('/server-plugin/'+name));return name?{...result,source:readFileSync('F:/dnd/logs/sessions/K16-r8-before-'+name+'.txt','utf8')}:result;}});

```
