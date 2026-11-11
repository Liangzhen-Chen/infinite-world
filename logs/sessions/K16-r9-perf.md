# K16 R9 性能记录

正式样本使用同一farm-pests-fixture，seed=bench，30日×2，每样本独立Node；关闭计数与Inspector，TEMP/TMP=F:/dnd-tmp。本会话正式样本不并行其他Node。对内顺序交替。master=PERFBASE@3bbd7e0c，s5a=S5A@0faa9d14；开始/结束核对工作树。外部负载不可控制，故保留所有样本与CPU时间，由主会话外测门禁复核。

## 对master

|对|基线秒|K16秒|比值|
|---|---:|---:|---:|
|1|105.198|140.977|1.340111|
|2|92.286|114.867|1.244685|
|3|95.402|145.190|1.521876|

三对比值中位：1.340111。

## 对s5a

|对|基线秒|K16秒|比值|
|---|---:|---:|---:|
|1|93.085|130.537|1.402342|
|2|91.344|121.570|1.330903|
|3|86.155|157.317|1.825976|

三对比值中位：1.402342。

正式六份K16终态哈希均与开工前及R8一致：88fd2c17ed42ebbaf1d6b453437913da7cc8222ce79d0cf6bea22035de859e49。十日各阶段均为afac26d16af3e442cd96ced66189eeb9ed93be26f838d00e01f71beaa70dbe85；相对R8十日的差异来自已合入0faa9d14的百分数有理数表示，逐字段见金快照表。

## 分项十日剖析

同一工具加--counts与--profile，表中包含时间有嵌套，不相加；阶段为累计改动。采样与机器负载存在噪声，不能将全部墙钟差值归给某一项。

|函数|开工前|作息覆盖复用|晨间共享|步行邻接复用|活跃时段短路（初批）|保留版交卡复测|
|---|---:|---:|---:|---:|---:|---:|
|prepareHouseholdSubsistence|1.270043|1.304167|1.222443|1.185798|1.158005|1.248339|
|householdSubsistencePlan|1.127000|1.141153|1.076836|1.038618|1.007962|1.097683|
|journey|0.732869|0.748375|0.721493|0.694012|0.670996|0.716766|
|sourceGeography|0.222149|0.206881|0.211824|0.158772|0.146372|0.173281|
|pair|0.515969|0.526196|0.512633|0.528462|0.472426|0.518294|
|npcSchedule|1.030013|0.916020|0.808887|0.804798|0.794736|0.857381|
|educationCourses|0.304281|0.311545|0.274411|0.256885|0.291152|0.263963|
|sameCourseInputs|0.144139|0.140018|0.126779|0.118929|0.153460|0.133494|

户间共享日历、封路/设施签名、远方骨架、预约/集市参与者与重病名单；有限口粮仍按原家户顺序预留。步行邻接表按原地理签名共用，保留边枚举和最短路算法。作息覆盖只在一次推进内按base/duties输入复用；FIELDS命中重新计算比对。时段外不计算无法覆盖当下的劳力有效性，全日读者仍保留全部将来边界。

单候选pair实际计算1440次、唯一（日/起点/来源）1440项，重复0；原晨间pairs缓存已经保证同候选复用，因此未加新层或截断候选。

## 未保留的日程结算只读试验

试验过已结算成员Set及四处peek读取。十日函数有小幅下降，但长测前两对master比值1.621773、1.462498，第三对不可能挽救目标中位数；停止该试验并完全撤回npc-schedule修改。此节试验列不是最终交付源码。相邻控制仅恢复npc-schedule原代码，其余优化相同。

|函数|控制包含秒|未保留试验包含秒|
|---|---:|---:|
|settleSchedules|3.851406|3.757276|
|take|1.208447|1.183722|
|cloneWalk|0.510359|0.454164|

## 已撤回的最小NPC检查点

尝试只复制四个写回字段，并独立克隆行程。三对消融仅替换这一处；六份十日哈希相同。

|对|四字段检查点秒|完整NPC检查点秒|
|---|---:|---:|
|1|16.302|14.146|
|2|19.274|19.434|
|3|19.139|19.167|

配对比值中位0.998539，收益约0.15%；CPU均值四字段24.390秒，完整23.297秒，未改善。已撤回，不以检查点保护换取无稳定收益的复杂度。

第一阶段两组三对原始结果另保留K16-r9-trial-*.json；master中位1.340111，s5a中位1.402342。第二次只读/集合试验未达标后已撤回；最终三模块哈希与第一阶段完全相同，故上表直接复用该完整三对证据。未继续第三种修法；1.33目标尚未达到。

## 扣除教育后的生计开销

取household-subsistence/water-cycle/npc-state/household-budget包含调用栈的去重并集，排除任意education-state/education祖先帧；包含调用的通用层，不直接求模块和。

开工前4.420540秒，初批保留版3.874058秒，交卡复测4.184004秒/十日。两次保留版源码及十日状态哈希相同；采样和负载差异不可当作代码变化，不挑低值替代正式三对。

交卡阶段串行独占本会话Node，重新采集master、s5a、K16十日样本；不混入前述30日×2正式比值。

|扣除教育的四模块并集|master|s5a|K16|
|---|---:|---:|---:|
|包含秒|0.738325|2.305995|4.184004|

本定义下K16相对s5a新增1.878009秒/十日，相对master新增3.445679秒。

|教育包含秒|master|s5a|K16|
|---|---:|---:|---:|
|educationCourses|0.686095|0.902714|0.263963|
|sameCourseInputs|0.182238|0.253783|0.133494|

插桩的K16十日样本均为计划3014次、堆重建1733次、readDailyPlan=0；master堆1723、s5a堆1745。没有新增推进刻或减少班次。

## 工具复现

从对应工作树运行下列脚本；正式样本仅--days=30 --steps=2，剖析额外--counts --profile=<文件>。脚本计时不含世界载入/建角与末尾哈希计算。

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
