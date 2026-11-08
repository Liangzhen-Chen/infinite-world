// 批次 1 完整检查 5 个新增失败的云上复现探针（只读取证，只走公共入口，不改任何被测文件，输出全部走 stdout）。
//   node tools/probe-b1c.mjs kd2            kd2-process #1：54 小时 soak 后，每条成功的加工劳动记录在 ledger.crafts 里有没有对应制作凭据，以及 ledger.crafts 的长度/时间范围（它被 slice(-50) 截断）
//   node tools/probe-b1c.mjs cowork [天数列表]  npc-schedule #11：对每个天数 N，整段推进 N 天 与 逐日推进 N 次 的 state.npcs 比较，打印第一个不一致的 N、人物与路径
//   node tools/probe-b1c.mjs office         s4-office-quests #6：复现该用例的月份推进序列，失败时打印完整 cause 栈（测试只给了 message）
//   node tools/probe-b1c.mjs catalog        a3-model-catalog #5：world_move 去白石镇再 world_actions 看严辙，失败时打印完整栈
// 基线对照：把本文件原样复制进 t-int 同一份代码的目录，同样的参数运行。
import fs from 'node:fs/promises';
import {loadWorld,loadRuntimeWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {modelToolCall} from '../extension/tools.mjs';

const mode=process.argv[2]??'kd2',root=new URL('../',import.meta.url);
const seed=JSON.parse(await fs.readFile(new URL('tests/fixtures/legacy/seed.json',root),'utf8'));
const out=obj=>console.log(JSON.stringify(obj,null,1));

// ---------- kd2 ----------
async function kd2(){
 const world=await loadRuntimeWorld(),category=r=>r.processing??r.workstation;
 const w=structuredClone(world),cats=new Set(w.professions.flatMap(p=>p.processing??[]));
 const onSite=new Set(w.locations.flatMap(l=>(l.site?.resources??[]).map(r=>r.item)));
 const outputs=new Set(w.recipes.filter(r=>cats.has(category(r))).map(r=>r.output?.item).filter(item=>!onSite.has(item)&&!w.recipes.some(r=>r.materials?.some(m=>m.item===item))));
 for(const item of w.items)if(outputs.has(item.id)&&item.basePrice)item.basePrice*=10;
 const engine=new WorldEngine(w);let doc=engine.createCharacter(seed,{},'kd2a');
 for(let i=0;i<54;i++){const o=await engine.reduce(doc,{tool:'world_act',args:{action:'core:time',slots:{minutes:60}},eventId:`kd2a-${i}`});if(o.patches?.length)doc=applyPatches(doc,o.patches);}
 const crafted=Object.values(doc.state.records).filter(r=>r.category==='labor'&&r.labor==='process'&&r.recipe&&r.success);
 const crafts=doc.ledger.crafts??[];
 out({mode:'kd2',craftedRows:crafted.length,ledgerCrafts:{length:crafts.length,firstMinute:crafts[0]?.minute??null,lastMinute:crafts.at(-1)?.minute??null},
  rows:crafted.map(row=>({npc:row.npc,recipe:row.recipe,minute:row.minute,sourceEvent:row.sourceEvent,
   hasReceipt:crafts.some(c=>c.recipe===row.recipe&&String(c.eventId).startsWith(row.sourceEvent)&&c.eventId.includes(row.npc)),
   receiptsForRecipe:crafts.filter(c=>c.recipe===row.recipe).map(c=>c.eventId),
   olderThanOldestKept:crafts.length?row.minute<crafts[0].minute:null}))});
}

// ---------- cowork ----------
const diffPaths=(a,b,path=[],acc=[])=>{
 if(acc.length>=12)return acc;
 if(a===b)return acc;
 if(typeof a!=='object'||typeof b!=='object'||a===null||b===null){acc.push({path:path.join('.'),long:a,daily:b});return acc;}
 for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diffPaths(a[k],b[k],[...path,k],acc);
 return acc;
};
async function cowork(){
 const days=(process.argv[3]??'3,6,10,15,20,30').split(',').map(Number),world=await loadWorld(),report=[];
 // 与 tests/npc-schedule.test.mjs 的 deepEqual 同一口径：键序无关，只看逐路径的值（diffPaths），不用 JSON.stringify。
 const realDiffs=(x,y)=>Object.keys({...x.state.npcs,...y.state.npcs}).map(id=>({id,diffs:diffPaths(x.state.npcs[id],y.state.npcs[id])})).filter(row=>row.diffs.length);
 const CHARACTER_SEED='schedule-month',STEP_LONG='一次 world_time N×1440 分钟（eventId month）',STEP_DAILY='N 次 world_time 1440 分钟（eventId day_0..day_N-1，每次后 applyPatches）';
 const fresh=()=>{const engine=new WorldEngine(world);return {engine,doc:engine.createCharacter(seed,{},CHARACTER_SEED)};};
 const longRun=async(N)=>{const {engine,doc}=fresh();return applyPatches(doc,(await engine.reduce(doc,{tool:'world_time',args:{minutes:N*1440},eventId:'month'})).patches);};
 for(const N of days){
  const {engine,doc}=fresh(),long=await longRun(N),snapshots=[doc];
  let daily=doc;
  for(let day=0;day<N;day++){const o=await engine.reduce(daily,{tool:'world_time',args:{minutes:1440},eventId:`day_${day}`});daily=applyPatches(daily,o.patches);snapshots.push(daily);}
  const differing=realDiffs(long,daily);
  const row={days:N,
   setup:{legacySeedFile:'tests/fixtures/legacy/seed.json',characterSeed:CHARACTER_SEED,randomSeed:doc.randomSeed??null,world:'loadWorld()（已审原样世界）',longStep:STEP_LONG,dailyStep:STEP_DAILY,
    startMinute:doc.state.minute,endMinute:long.state.minute,startDate:engine.calendar(doc.state.minute).text,endDate:engine.calendar(long.state.minute).text},
   differingNpcCount:differing.length,differingNpcs:differing.map(r=>r.id),first:differing.slice(0,6)};
  if(differing.length){
   const diffAt=async k=>realDiffs(await longRun(k),snapshots[k]);
   try{
    // 二分找候选首个分歧日 lo，然后实测核实：lo 两侧必须不一致、lo-1 两侧必须一致（单调）。不满足则报非单调并给逐日扫描，不报某个分歧日。
    let lo=1,hi=N;
    while(lo<hi){const mid=Math.floor((lo+hi)/2);if((await diffAt(mid)).length)hi=mid;else lo=mid+1;}
    const atLo=await diffAt(lo),before=lo>1?await diffAt(lo-1):[];
    if(atLo.length&&!before.length)row.firstDivergentDay={day:lo,verified:{dayDiffers:true,previousDayIdentical:lo>1?true:'lo=1，前一日是初始存档（两侧同一份）'},method:'binary-search+verified-both-sides',diffsAtThatDay:atLo.slice(0,6)};
    else{
     // 非单调（或二分落点自身与预期不符）：不报错误的分歧日，改逐日扫描 1..N（代价约 N²/2 个模拟日），输出每天是否一致。
     const scan=[];for(let k=1;k<=N;k++){const diffs=await diffAt(k);scan.push({day:k,identical:diffs.length===0,differingNpcCount:diffs.length});}
     row.firstDivergentDay={day:null,reason:'非单调：二分落点两侧核实不通过，改给逐日扫描',binarySearchLanding:lo,dayDiffersAtLanding:atLo.length>0,previousDayDiffers:before.length>0,
      linearScan:scan,firstDivergentInScan:scan.find(r=>!r.identical)?.day??null};
    }
   }catch(error){row.firstDivergentDay={day:null,reason:`推不出：${error.message}`};}
  }
  report.push(row);
  if(differing.length)break;
 }
 out({mode:'cowork',report});
}

// ---------- office ----------
async function office(){
 const {applyIntentSetup}=await import('./a3-score.mjs');
 const {questPublishingRights}=await import('../server-plugin/quest-board.mjs');
 const world=await loadWorld(),engine=new WorldEngine(world);
 const publication={personal:false,grade:'C',reward:40,content:'核看公署前厅'};
 const run=async(document,action,slots,eventId)=>{
  try{const o=await engine.reduce(document,{tool:'world_act',args:{action,slots},eventId});return applyPatches(document,o.patches);}
  catch(error){console.log(`FAILED at ${eventId}: ${error.message}\n${error.stack}`);throw error;}
 };
 const rights=document=>questPublishingRights(engine.scoped(document),document.state,'player');
 const loaded=applyIntentSetup(engine,engine.createCharacter(seed,{},'s408-quota'),{location:'loc_hw',present:[],coins:200,inventory:{item_wood:2}});
 let document=loaded.document;
 try{
  document=await run(document,'core:create',{type:'org',name:'河谷行旅会',data:{notes:'共同核账，按章程议事',occupation:'行会'}},'found-one');
  document=await run(document,'core:create',{type:'org',name:'河谷营造会',data:{notes:'共同核账，按章程议事',occupation:'行会'}},'found-two');
  document=await run(document,'core:quest.publish',{...publication,publisher:'player',objective:{type:'visit',location:'loc_hw_gate'}},'guild-post');
  document=await run(document,'core:time',{minutes:30*1440-document.state.minute},'month-two');
  document=await run(document,'core:time',{minutes:29*1440},'month-three');
  out({mode:'office',ok:true,minute:document.state.minute,rights:rights(document)});
 }catch(error){out({mode:'office',ok:false,message:error.message});}
}

// ---------- catalog ----------
async function catalog(){
 const world=await loadWorld(),engine=new WorldEngine(world);
 await import('../server-plugin/primitives-runtime.mjs');
 let document=engine.createCharacter(seed,{},'a3cp');
 const call=async(tool,args,eventId)=>{
  const routed=modelToolCall(tool,args);
  try{const o=await engine.reduce(document,{...routed,eventId});document=applyPatches(document,o.patches);return o.result;}
  catch(error){console.log(`FAILED ${tool}: ${error.message}\n${error.stack}`);throw error;}
 };
 try{
  await call('world_move',{destination:'loc_bs'},'move');
  const result=await call('world_actions',{target:'npc_hw_yanzhe'},'look');
  out({mode:'catalog',ok:true,target:result?.target?.id??null,actions:result?.actions?.length??null});
 }catch(error){out({mode:'catalog',ok:false,message:error.message});}
}

if(mode==='kd2')await kd2();
else if(mode==='cowork')await cowork();
else if(mode==='office')await office();
else if(mode==='catalog')await catalog();
else throw Error(`未知模式 ${mode}`);
