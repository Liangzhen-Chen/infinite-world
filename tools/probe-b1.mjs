// 批次 1 云上探针（只读取证，不改任何被测文件；不写工作树内的文件，输出全部走 stdout）。
//   node tools/probe-b1.mjs n17            N17 窗口内阿言户 item_wood 的来龙去脉（见下）
//   node tools/probe-b1.mjs perf [天数=8] [重复=1]   整段推进的墙钟与 CPU（不开剖析器）
//   node tools/probe-b1.mjs prof [天数=8]  同一段推进，开 V8 采样剖析 + 精确调用计数，按函数汇报
//   node tools/probe-b1.mjs sched          N1：作息里"在家"的写法统计（只读世界数据，不推进）
// 基线对比：把本文件原样复制进 t-int 同一份代码的目录，用同样的参数运行（只用公共入口与既有调试钩子，两边都能跑）。
//
// n17 的取证方法（不改生产代码）：账本的 transfer 在每次成功转移后向 globalThis.__LEDGER_TRACE__（既有调试钩子，
// 数组存在才记）推 {from,to,amount,writer,eventId}。窗口开始前挂上数组，之后按"持有人行囊账户 ←→ 对方账户（源/汇/他人）+写入者+事件前缀"
// 分组，对出：行动扣料（sink:consume|*|craft 等）、家户日用（purpose fuel/seasoning/wear，writer npc-life）、
// 自采入库（来自 forest:/site: 账户）、其他转移。再与行囊旧字段的前后差额和行动记录 spent.materials/spent.returned 对账。
// 判定（只报数，不改退出码）：
//   trace净额 === 库存差额                       账本记录与旧字段一致（不等=trace 含被丢弃草稿的重复转移，或有未记账写入）
//   库存减少 === 行动净扣料 + 家户烧柴 − 自采入库 + 转出净额   分项合计与库存减少量是否相等，residual 即未解释量
import {performance} from 'node:perf_hooks';
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {modelToolCall} from '../extension/tools.mjs';
import {bag} from '../server-plugin/stock.mjs';
import {personHousehold} from '../server-plugin/entity-view.mjs';

const mode=process.argv[2]??'n17',qty=v=>typeof v==='number'?v:v?.quantity??0;
const root=new URL('../',import.meta.url);
const world=await loadWorld();
const legacy=JSON.parse(await fs.readFile(new URL('tests/fixtures/legacy/seed.json',root),'utf8'));
const out=obj=>console.log(JSON.stringify(obj,null,1));

// ---------- N17：与 tests/m2-preconditions.test.mjs 的 session 同一条公共调用序列 ----------
async function n17(){
 const id='npc_offscreen',script=JSON.parse(await fs.readFile(new URL('tests/playtests/npc_offscreen.json',root),'utf8'));
 const engine=new WorldEngine(world);let document=engine.createCharacter(legacy,{},'m2-preconditions'),sequence=0;
 async function call(tool,args){
  const routed=modelToolCall(tool,args),eventId=`${id}_offline_${sequence++}`;
  const result=await engine.reduce(document,{...routed,eventId});document=applyPatches(document,result.patches);
 }
 async function turn(index,act=async()=>{},extra=0){
  const before=document;await act();
  await call('world_turn',{startMinute:before.state.minute,extraMinutes:extra,outOfCharacter:script.turns[index].input.startsWith('（场外）')});
  return {before,after:document};
 }
 await turn(0,async()=>call('world_move',{destination:'旧磨坊'}),5);
 await turn(1,undefined,5);
 await turn(2,async()=>call('world_move',{destination:'白石镇'}));
 // 窗口：与测试里 absent 同一段（白石镇十天等待）。
 globalThis.__LEDGER_TRACE__=[];
 const t0=performance.now(),c0=process.cpuUsage();
 const win=await turn(3,async()=>call('world_time',{minutes:14400,activity:'等待'}));
 const ms=performance.now()-t0,cpu=process.cpuUsage(c0),trace=globalThis.__LEDGER_TRACE__;delete globalThis.__LEDGER_TRACE__;
 const {before,after}=win,from=before.state.minute,to=after.state.minute;
 const owner='npc_hw_ayan',household=personHousehold(engine,before.state,owner).value,holders=[...new Set([owner,...(household?.members??[])])].filter(h=>before.state.npcs?.[h]);
 const beforeActions=before.state.npcAutonomy?.actions??{},fresh=Object.entries(after.state.npcAutonomy?.actions??{}).filter(([key,row])=>!Object.hasOwn(beforeActions,key)&&row.minute>from&&row.minute<=to);
 const result={window:{from,to,minutes:to-from,ms:Math.round(ms),cpuMs:Math.round((cpu.user+cpu.system)/1000)},household:household?.id??null,holders:{}};
 const wood='item_wood';
 for(const h of holders){
  const account=bag(engine,h,wood),groups={};let net=0;
  for(const t of trace){
   const isIn=t.to===account,isOut=t.from===account;if(!isIn&&!isOut)continue;
   const counter=isIn?t.from:t.to,kind=isIn?'in':'out',eventPrefix=String(t.eventId??'').split(':')[0];
   // 对方账户只保留类别（不含具体持有人/地点以外的噪声）：源汇给 `类别|资源|用途`，森林/据点给前缀，他人行囊标 bag。
   const label=counter.startsWith('forest:')?'forest':counter.startsWith('site:')?'site':counter.startsWith('src:')||counter.startsWith('sink:')?counter:`other:${counter}`;
   const key=`${kind} ${label} writer=${t.writer} event=${eventPrefix}`;groups[key]=(groups[key]??0)+t.amount;net+=isIn?t.amount:-t.amount;
  }
  const mine=fresh.filter(([,row])=>row.npc===h),sum=(rows,field)=>rows.reduce((n,[,row])=>n+(row.spent?.[field]??[]).filter(m=>m.item===wood).reduce((s,m)=>s+m.amount,0),0);
  const craftRows=mine.filter(([,row])=>row.kind==='craft');
  const recordedAll=sum(mine,'materials'),returned=sum(mine,'returned'),recordedCraftGross=sum(craftRows,'materials');
  const invBefore=qty(before.state.npcs[h].inventory?.[wood]),invAfter=qty(after.state.npcs[h].inventory?.[wood]),decrease=invBefore-invAfter;
  const g=prefix=>Object.entries(groups).filter(([k])=>k.startsWith(prefix)).reduce((n,[,v])=>n+v,0);
  const fuel=Object.entries(groups).filter(([k])=>k.startsWith('out sink:consume|item_wood|fuel')).reduce((n,[,v])=>n+v,0);
  const gathered=g('in forest')+g('in site'),transfersOut=Object.entries(groups).filter(([k])=>k.startsWith('out other:')).reduce((n,[,v])=>n+v,0),transfersIn=g('in other:');
  const actionNet=recordedAll-returned;
  result.holders[h]={invBefore,invAfter,decrease,traceNet:net,traceMatchesInventory:net===-decrease,groups,
   records:{actions:mine.length,kinds:Object.fromEntries([...new Set(mine.map(([,r])=>r.kind))].map(k=>[k,mine.filter(([,r])=>r.kind===k).length])),woodGrossAllKinds:recordedAll,woodReturned:returned,woodGrossCraftOnly:recordedCraftGross},
   decomposition:{actionNet,householdFuelBurn:fuel,gatheredIn:gathered,transfersOut,transfersIn,
    residual:decrease-(actionNet+fuel-gathered+transfersOut-transfersIn)}};
 }
 out(result);
}

// ---------- perf / prof：同一世界、同一天数的整段推进 ----------
async function advanceDays(days,tag){
 const engine=new WorldEngine(world);let document=engine.createCharacter(legacy,{},`probe-b1-${tag}`);
 const t0=performance.now(),c0=process.cpuUsage(),result=await engine.reduce(document,{tool:'world_time',args:{minutes:days*1440,activity:'等待'},eventId:`probe_b1_${tag}`});
 const cpu=process.cpuUsage(c0);document=applyPatches(document,result.patches);
 return {days,ms:Math.round(performance.now()-t0),cpuMs:Math.round((cpu.user+cpu.system)/1000),minute:document.state.minute,transfers:document.ledger?.transfers??null,drift:document.ledger?.drift?.length??0};
}
async function perf(){
 const days=Number(process.argv[3]??8),reps=Number(process.argv[4]??1),runs=[];
 for(let i=0;i<reps;i++)runs.push(await advanceDays(days,`perf${i}`));
 const med=f=>[...runs].map(r=>r[f]).sort((a,b)=>a-b)[Math.floor(runs.length/2)];
 out({mode:'perf',runs,medianMs:med('ms'),medianCpuMs:med('cpuMs')});
}
const WATCH=['prepareHouseholdSubsistence','householdSubsistencePlan','supplyHousehold','readJourney','journey','candidateStockKey','upkeepLive','upkeepWants','readUpkeepWants',
 'sourceGeography','opportunity','preference','mealDeficit','forestView','projectForest','forestSites','harvestForest','siteTake','commonsLive','commonsResources','upkeepSources',
 'wakingView','householdBudget','cash','advanceDealers','stockSupply','upkeepDemand','householdResources','advanceHouseholdMeals','householdUpkeep','consumeByWeight'];
async function prof(){
 const {Session}=await import('node:inspector'),session=new Session();session.connect();
 const post=(m,p)=>new Promise((res,rej)=>session.post(m,p,(e,r)=>e?rej(e):res(r)));
 await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:500});
 await post('Profiler.startPreciseCoverage',{callCount:true,detailed:false});await post('Profiler.start');
 const days=Number(process.argv[3]??8),run=await advanceDays(days,'prof');
 const {profile}=await post('Profiler.stop'),{result:coverage}=await post('Profiler.takePreciseCoverage');
 const nodes=new Map(profile.nodes.map(n=>[n.id,{...n,self:0}]));
 profile.samples.forEach((id,i)=>{nodes.get(id).self+=(profile.timeDeltas[i]??0)/1000;});
 const base=u=>String(u).split('/').slice(-1)[0],inclusive={},selfBy={};
 const walk=(node,ancestors)=>{
  const name=node.callFrame.functionName||'(anonymous)',key=`${name} @${base(node.callFrame.url)}`;let total=node.self;
  const next=ancestors.has(key)?ancestors:new Set([...ancestors,key]);
  for(const child of node.children??[])total+=walk(nodes.get(child),next);
  selfBy[key]=(selfBy[key]??0)+node.self;
  if(!ancestors.has(key))inclusive[key]=(inclusive[key]??0)+total;// 递归内层不重复累计
  return total;
 };
 walk(nodes.get(profile.nodes[0].id),new Set());
 const watched={};
 for(const [key,ms] of Object.entries(inclusive)){const name=key.split(' @')[0];if(WATCH.includes(name))watched[key]={inclusiveMs:Math.round(ms),selfMs:Math.round(selfBy[key])};}
 const counts={};
 for(const script of coverage)for(const fn of script.functions){
  if(!WATCH.includes(fn.functionName))continue;
  const c=fn.ranges[0]?.count??0;if(!c)continue;const key=`${fn.functionName} @${base(script.url)}`;counts[key]=(counts[key]??0)+c;
 }
 const top=Object.entries(selfBy).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([k,v])=>({fn:k,selfMs:Math.round(v)}));
 out({mode:'prof',run,watchedTime:watched,callCounts:counts,topSelf:top});
}

// ---------- N1：作息里"在家"的写法（只读世界数据）----------
function sched(){
 const byId=new Map(world.locations.map(l=>[l.id,l])),rows=[];
 let total=0,equal=0,inside=0,other=0;const otherSamples={};
 for(const n of world.npcs){
  const home=n.home?.location??n.location,routine=n.schedule?.default??[];if(!home||!routine.length)continue;
  const homePlace=byId.get(home);
  for(const s of routine){
   const minutes=Math.max(0,(s.end??0)-(s.start??0));total+=minutes;
   if(s.location===home)equal+=minutes;
   else if(byId.get(s.location)&&(byId.get(s.location).scope===home||(homePlace?.rooms??[]).some(r=>(r.id??r)===s.location)||byId.get(s.location).parent===home))inside+=minutes;
   else{other+=minutes;otherSamples[s.location]=(otherSamples[s.location]??0)+minutes;}
  }
  rows.push(n.id);
 }
 const topOther=Object.entries(otherSamples).sort((a,b)=>b[1]-a[1]).slice(0,10);
 out({mode:'sched',npcsWithDefaultRoutine:rows.length,totalMinutes:total,slotLocationEqualsHome:equal,slotLocationInsideHome:inside,slotElsewhere:other,
  shareEqual:equal/total,shareInside:inside/total,topElsewhereLocations:topOther});
}

if(mode==='n17')await n17();
else if(mode==='perf')await perf();
else if(mode==='prof')await prof();
else if(mode==='sched')sched();
else throw Error(`未知模式 ${mode}`);
