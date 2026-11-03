# K16 r4 性能（末版）

计时核心与主会话 bench-fp 相同：farm-pests-fixture.setup("bench")，连续两次30日等待，事件b0/b1，计时不含加载/建角。TEMP/TMP均设F:/dnd-tmp。三对等本卡全部验收进程结束后串行运行；INTEG每次测量前核对HEAD=9729614a及无已跟踪改动。

计时文件K16-r4-pair-N-base/tip/counter.json；汇总K16-r4-pair-summary.json。正式测量已完成，结果如下。

城镇对照通过临时Node模块加载钩子，仅在测量进程把正式城镇非本地觅食选择置空；保留择源计算，不补粮，仍可能缺餐。该对照不是TOWNFOOD行为或耗时预测，不写生产代码/世界数据。3日烟测已成功。

本轮保留主会话地理值键缓存，新增：承诺候选记录包含依赖；按户籍输入记忆成员；将可达地理、真实路线、当日有限库存择源拆开；无缺粮计划不读觅食库存；课程比较只追踪相关同户教师。真实路线仍有出发、到达、采集、返程边界。现有堆会把同刻多人的due条目归并为同一刻；不同地点/活动边界无法直接删除，否则改变实际位置和预约、就业、授课的观察结果。

步行无路线风时，路程记忆不依赖水体physical_feature写入；路线风仍走实时路径。设施签名同时区分是否已建与物理factor，因为route对已建道路另乘1.25。新增手算锚点验证无设施60分钟、完整道路48分钟、降级半效96分钟，且无关水体写入不改路线。

最终10日base/r4采样均用同一工具，在建角后开启Profiler，独占本卡Node进程；原始文件K16-r4-base-profile.json和K16-r4-last-profile.json。tip2列是主会话提供的修前参考，采样起止含加载，不能直接当作整段净节约。正式性能门槛采用三对30日×2。函数拆分后，下表把新包装函数与其新读函数自身耗时合并，避免以改名造成虚假的下降。泛用stateMemo、存储复制等成本单列；不能只相加本表来推算总墙钟。

|功能组（自身秒）|base|主会话tip2|r4|
|---|---:|---:|---:|
|承诺分配|0.003|0.692|0.01|
|户籍查询|0.028|0.62|0.117|
|成员合并|0.003|0.212|0.094|
|户籍视图|0.003|0.228|0.157|
|地理与择源|0|0.312|0.845|
|日计划读取|0|0.359|0.396|
|真实路线|0.248|1.593|0.674|
|日程堆|0.859|1.63|1.684|
|课程比较|0.215|0.227|0.312|
|课程派生|0.112|0.335|0.275|
|年龄读取|0.075|0.293|0.217|
|记忆查取stateMemo|0.068|0.524|1.149|
|记录查取recordsMemo|0.03|0.235|0.15|
|状态复制take|0.769|1.502|1.533|
|cloneWalk|0.312|1.317|0.983|
|canonicalValue|0.009|0.485|0.442|

## 三对正式测量

|组|9729614a墙钟/用户CPU秒|K16墙钟/用户CPU秒|去城镇非本地觅食墙钟/用户CPU秒|
|---|---:|---:|---:|
|1|77.53/90.89|235.38/266.78|203.62/231.17|
|2|77.67/91.48|235.72/269.47|201.57/230.28|
|3|76.38/90.75|234.13/265.92|204.24/231.59|
|均值|77.19/91.04|235.08/267.39|203.14/231.02|

K16相对基线墙钟均值+204.53%，城镇对照+163.16%；未达到本卡相对基线+3%的参考目标。三对均独占本卡Node，原始结果保留墙钟、用户/系统CPU、PID、cwd与60日结束时刻。阶段总门仍由主会话外测perf-gate决定。

R3同核心旧测121777→514900ms只作历史参照，旧测有并发，正式结论采用本轮三对。城镇对照保留择源计算、取消非本地食物来源，不补粮；缺餐可能反过来影响其他行为，不能把它当作TOWNFOOD的精确预测。实际审计城镇4084次觅食、82.07%工时往返，生产行为未删减。

sourceGeography外层stateMemo曾在record自检720.27秒报错；现已删去冗余层，仅保留按值距离及候选索引。追加多存档分支回归，原80分钟计划与索引自检均不受其他读取上下文影响；完整机制FIELDS24/24过。修复后的完整record自检超40分钟列外跑，未降低自检条件。

## 同工具复现源码（临时脚本交付前删除）

从相应树根运行，TEMP/TMP=F:/dnd-tmp；默认30日×2，--no-town-trips仅用于测量。

```js
import path from 'node:path';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import inspector from 'node:inspector';
const counter=process.argv.includes('--no-town-trips');
if(counter)registerHooks({load(url,context,next){
 const result=next(url,context);
 if(url.endsWith('/server-plugin/household-subsistence.mjs')){
  const original="const food=portions?journey(e,state,home,'food',minute,portions,null,memoState):null;";
  const replacement="let food=portions?journey(e,state,home,'food',minute,portions,null,memoState):null; if(food?.travelMinutes>0&&h&&e.world.households.some(row=>row.id===h.id)&&!state.npcs?.[owner]?.materialized?.county&&publicStore?.granary===false&&!e.byId.get(settlement)?.monsterSociety)food=null;";
  const source=String(result.source);if(!source.includes(original))throw Error('counterfactual hook no longer matches');
  return {...result,source:source.replace(original,replacement)};
 }
 return result;
}});
const fx=await import(pathToFileURL(path.resolve('tests/farm-pests-fixture.mjs')));
const days=Number(process.argv.find(x=>x.startsWith('--days='))?.split('=')[1]??30),steps=Number(process.argv.find(x=>x.startsWith('--steps='))?.split('=')[1]??2);
const out=process.argv.find(x=>x.startsWith('--out='))?.slice(6),profile=process.argv.find(x=>x.startsWith('--profile='))?.slice(10);
const {c,run}=fx.setup('bench');let state=c;
const session=new inspector.Session();
const call=(method)=>new Promise((resolve,reject)=>session.post(method,(error,value)=>error?reject(error):resolve(value)));
if(profile){session.connect();await call('Profiler.enable');await call('Profiler.start');}
const start=Date.now(),cpu=process.cpuUsage();
for(let i=0;i<steps;i++)state=await fx.wait(run,state,days*1440,`b${i}`);
const used=process.cpuUsage(cpu),result={cwd:process.cwd(),counter,days,steps,pid:process.pid,elapsedMs:Date.now()-start,userCpuMs:Math.round(used.user/1000),systemCpuMs:Math.round(used.system/1000),minute:state.state.minute};
if(profile){const {profile:data}=await call('Profiler.stop');session.disconnect();await fs.writeFile(profile,JSON.stringify(data));}
if(out)await fs.writeFile(out,JSON.stringify(result));console.log(JSON.stringify(result));

```

## 尚未完成的缓存粒度

地理候选与路线已不依赖全局household_forage；当前本户日计划键仍含全部可达候选库存，尚未收窄到仅选中来源。为满足这项字面要求，曾试改为先重算真实餐食缺口、选源，再按选中库存记忆劳力计划；独占同口径10日稳定版29720ms、试改34662ms（+16.63%，用户CPU36938→42266ms）。该试改已按字节回退，既有全部验收与三对正式测量对应当前源码。未再增加决策缓存；余项交主会话规划，不能写成已完成。

本户择源仍需比较全部可达有限库存，才能按存量与工时效率选优；公共口粮完整时有快速路径，私人库存充足时并非所有缓存读取都被省略。未删除真实出行边界：同刻堆已归并，不同地点与活动边界仍服务位置、预约、就业及授课。
