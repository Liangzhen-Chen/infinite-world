// 批次 1 完整检查新增失败的云上复现探针（第四版）。原则：调用路径、判定口径、断言一律照原测试；凡不复现的部分在这里写明。
//   node tools/probe-b1c.mjs kd2              tests/kd2-process.test.mjs 第 1 条里"成功加工记录有制作凭据"那一段（及 consumed/produced、auditLedger）
//   node tools/probe-b1c.mjs cowork [天数]    tests/npc-schedule.test.mjs:166-181 第 11 条（缺省 30 天，即测试口径 N=30）
//   node tools/probe-b1c.mjs office           tests/s4-office-quests.test.mjs:115-135 第 6 条（逐条断言）
//   node tools/probe-b1c.mjs lifecycle        tests/playtest-lifecycle.test.mjs:48-58 第 3 条（经 tools/playtest-runner.mjs 的 createPlaytestServer）
//   node tools/probe-b1c.mjs catalog          a3-model-catalog #5 的前两步（不经 playtest 服务器，只取栈）
//   node tools/probe-b1c.mjs cowork5 [N=26] [scan=1-26|none] [pair=yes|no|d1,d2,..]
//        cowork 分歧的定位（第五、六版）：(1) 对世界日 k∈scan，新开引擎整段推进 k 天 vs 同一引擎逐日第 k 天，比较完整文档（所有顶层键）规范化事件编号后的 deepStrictEqual，
//        每天全量输出规范化后的三类差异路径（仅长程有/仅逐日有/值不同，按路径排序，不设上限，值截 200 字符）和撞车键清单，供离线做候选减基线；
//        (2) 两人在 coworkDay 的运行时刻（日结）经导出的 advanceNpcLife 取判定，并给出资格输入、计划行、作息片段；默认日期固定为 24..26，也可用参数指定。
//        耗时估算（候选约 7 秒/模拟日）：N=26 全做约 3300 秒，接近单作业 3600 秒上限，所以可分段：`cowork5 26 1-13 no`、`cowork5 26 14-26 no`、`cowork5 26 none yes`。
//   node tools/probe-b1c.mjs cowork8        同工丢失的最短跨度定位：从逐日快照 S_j 出发各新开引擎一次 reduce 推到第 25 天，及从 S_24/第 24 天 23:59 出发的更细几组（详见 cowork8 注释，约 800 秒）
// 任何模式出现断言失败、异常或分歧：打印 error.stack / 差异，并设 process.exitCode=1。
// 基线对照：本文件原样放进 t-int 同一份代码的目录，同参数运行。
// 与原测试不同、不复现的部分：
//   kd2：不复现 trips 的逐条断言（kd2-process:36-48）；
//   cowork：判定用 node:assert 的 deepStrictEqual（与测试 deepEqual 严格模式同口径），diffPaths 只用来展示；整月基准是同一引擎的一次 reduce（测试口径），逐日扫描里的"整段"是每个天数新开引擎的一次 reduce，二者的差别单独核实并报出；
//   office：测试里 engine 在整个文件的各用例之间共用，本探针只跑第 6 条，前序用例留下的引擎内部状态不复现；
//   lifecycle：createPlaytestServer 会在系统临时目录建一个临时存档目录（关闭时删除）并在 127.0.0.1 监听回环端口，与测试相同；不写工作树内任何文件；
//   其余模式：纯内存，不写任何文件、不读写存档。
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {loadWorld,loadRuntimeWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {modelToolCall} from '../extension/tools.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';

const mode=process.argv[2]??'kd2',root=new URL('../',import.meta.url);
const seed=JSON.parse(await fs.readFile(new URL('tests/fixtures/legacy/seed.json',root),'utf8'));
const out=obj=>console.log(JSON.stringify(obj,null,1));
const fail=(label,error)=>{process.exitCode=1;console.log(`FAILED ${label}: ${error?.message??error}\n${error?.stack??''}${error?.cause?`\n--- cause ---\n${error.cause.message}\n${error.cause.stack??''}`:''}`);};

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
 const crafts=doc.ledger.crafts??[],audit=auditLedger(doc);
 const rows=crafted.map(row=>({npc:row.npc,recipe:row.recipe,minute:row.minute,sourceEvent:row.sourceEvent,
  consumedAndProduced:row.consumed.length>0&&row.produced.length>0,
  hasReceipt:crafts.some(c=>c.recipe===row.recipe&&String(c.eventId).startsWith(row.sourceEvent)&&c.eventId.includes(row.npc)),
  receiptsForRecipe:crafts.filter(c=>c.recipe===row.recipe).map(c=>c.eventId),
  olderThanOldestKept:crafts.length?row.minute<crafts[0].minute:null}));
 const failures=[];
 if(!crafted.length)failures.push('应有加工行程真实做出成品');
 for(const row of rows){if(!row.consumedAndProduced)failures.push(`${row.npc} ${row.recipe}：加工有投入也有产出`);if(!row.hasReceipt)failures.push(`${row.npc} ${row.recipe}：制作账里能认出做工者`);}
 if(audit.length)failures.push(`auditLedger 非空：${JSON.stringify(audit).slice(0,300)}`);
 if(failures.length)process.exitCode=1;
 out({mode:'kd2',failures,craftedRows:crafted.length,auditLedger:audit,ledgerCrafts:{length:crafts.length,firstMinute:crafts[0]?.minute??null,lastMinute:crafts.at(-1)?.minute??null},rows});
}

// ---------- cowork ----------
// 展示用的差异定位（判定不靠它）：区分键存在性与 Array.isArray，a===b 之前先比存在性。
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const diffPaths=(a,b,path=[],acc=[])=>{
 if(acc.length>=12)return acc;
 if(a===b)return acc;
 if(typeof a!=='object'||typeof b!=='object'||a===null||b===null){acc.push({path:path.join('.'),long:a,daily:b});return acc;}
 if(Array.isArray(a)!==Array.isArray(b)){acc.push({path:path.join('.'),note:'一边是数组一边是对象',longIsArray:Array.isArray(a),dailyIsArray:Array.isArray(b)});return acc;}
 for(const k of new Set([...Object.keys(a),...Object.keys(b)])){
  if(has(a,k)!==has(b,k)){acc.push({path:[...path,k].join('.'),note:'键只在一边存在',longHasKey:has(a,k),dailyHasKey:has(b,k),long:a[k],daily:b[k]});if(acc.length>=12)return acc;continue;}
  diffPaths(a[k],b[k],[...path,k],acc);
 }
 return acc;
};
const strictSame=(x,y)=>{try{assert.deepStrictEqual(x,y);return true;}catch{return false;}};
async function cowork(){
 const N=Number(process.argv[3]??30),world=await loadWorld(),CHARACTER_SEED='schedule-month';
 const fresh=()=>{const engine=new WorldEngine(world);return {engine,doc:engine.createCharacter(seed,{},CHARACTER_SEED)};};
 // 判定：整个 state.npcs 的 deepStrictEqual（与测试 :174 同一断言）；逐人比较只用于展示。
 const npcDiffs=(x,y)=>Object.keys({...x.state.npcs,...y.state.npcs}).filter(id=>!strictSame(x.state.npcs[id],y.state.npcs[id])).map(id=>({id,diffs:diffPaths(x.state.npcs[id],y.state.npcs[id])}));
 const whole=(x,y)=>strictSame(x.state.npcs,y.state.npcs);
 // 测试口径：同一引擎上一次 world_time N×1440（eventId month），再逐日 N 次（day_i）。
 const {engine,doc}=fresh(),longOut=await engine.reduce(doc,{tool:'world_time',args:{minutes:N*1440},eventId:'month'}),long=applyPatches(doc,longOut.patches);
 const snapshots=[doc];let daily=doc;
 for(let day=0;day<N;day++){const o=await engine.reduce(daily,{tool:'world_time',args:{minutes:1440},eventId:`day_${day}`});daily=applyPatches(daily,o.patches);snapshots.push(daily);}
 const equalAtN=whole(long,daily),differing=npcDiffs(long,daily);
 const report={mode:'cowork',testCaliber:'tests/npc-schedule.test.mjs:166-181，N=30',
  setup:{legacySeedFile:'tests/fixtures/legacy/seed.json',characterSeed:CHARACTER_SEED,randomSeed:doc.randomSeed??null,world:'loadWorld()（已审原样世界）',N,
   longStep:'同一引擎一次 world_time N×1440 分钟（eventId month）',dailyStep:'同一引擎随后 N 次 world_time 1440 分钟（eventId day_0..day_N-1，每次后 applyPatches）',
   startMinute:doc.state.minute,endMinute:long.state.minute,startDate:engine.calendar(doc.state.minute).text,endDate:engine.calendar(long.state.minute).text},
  testCaliberResult:{deepStrictEqualHolds:equalAtN,differingNpcCount:differing.length,differingNpcs:differing.map(r=>r.id),first:differing.slice(0,6)}};
 // npcPatches 形态（测试 :175-180）：每人一次、op 全为 set、path 长 3、条数不超过实际人物数。
 const npcPatches=longOut.patches.filter(row=>row.path[1]==='npcs'),perNpc={};
 for(const row of npcPatches)perNpc[row.path[2]]=(perNpc[row.path[2]]??0)+1;
 const finalNpcCount=Object.keys(long.state.npcs).length;
 report.npcPatches={total:npcPatches.length,distinctNpcs:Object.keys(perNpc).length,writtenMoreThanOnce:Object.entries(perNpc).filter(([,n])=>n>1).slice(0,10),
  nonSetOps:npcPatches.filter(row=>row.op!=='set').length,pathLengthNot3:npcPatches.filter(row=>row.path.length!==3).length,finalNpcCount,
  holds:npcPatches.length===Object.keys(perNpc).length&&npcPatches.every(row=>row.op==='set'&&row.path.length===3)&&npcPatches.length<=finalNpcCount};
 // 逐日扫描 1..N（N≤30 一律做）：每个天数 k 新开引擎整段推进 k 天，对"测试口径引擎的逐日第 k 天快照"，deepStrictEqual 判定。代价约 N²/2 个模拟日。
 if(N<=30){
  const scan=[];
  for(let k=1;k<=N;k++){
   const f=fresh(),o=await f.engine.reduce(f.doc,{tool:'world_time',args:{minutes:k*1440},eventId:'month'}),L=applyPatches(f.doc,o.patches),d=npcDiffs(L,snapshots[k]);
   scan.push({day:k,identical:d.length===0,differingNpcCount:d.length,...(d.length&&scan.every(r=>r.identical)?{firstDiffs:d.slice(0,6)}:{})});
  }
  const firstIdx=scan.findIndex(r=>!r.identical);
  report.dailyScan={method:'逐日 1..N，每个天数新开引擎整段推进 vs 同一引擎逐日快照',scan,
   firstDivergentDay:firstIdx<0?null:scan[firstIdx].day,
   reconvergedAfterFirst:firstIdx<0?null:scan.slice(firstIdx+1).some(r=>r.identical),
   identicalDaysAfterFirst:firstIdx<0?[]:scan.slice(firstIdx+1).filter(r=>r.identical).map(r=>r.day)};
  // 新开引擎的整段 N 天，与测试口径（同一引擎的整段）对逐日第 N 天的判定是否一致：不一致说明引擎有跨调用状态。
  report.engineCarriesStateAcrossCalls=scan.at(-1).identical!==equalAtN;
  report.engineStateNote=report.engineCarriesStateAcrossCalls?'新开引擎整段 N 天与测试口径（同一引擎）对逐日的判定结果不一致：引擎有跨调用状态':'两种引擎口径对逐日的判定一致';
 }else report.dailyScan={skipped:'N>30，不做逐日扫描'};
 if(!equalAtN||!report.npcPatches.holds||report.engineCarriesStateAcrossCalls)process.exitCode=1;
 out(report);
}

// ---------- cowork5 ----------
// 事件编号规范化（取代"含 month/day_数字就排除"）：整段推进用 eventId 'month'，逐日推进用 eventId 'day_<i>'，二者写进文档的位置只有事件编号本身。
// 两份文档比较之前，把键名和字符串值里的 month、day_<数字> 统一换成 <EV>（两侧同一规则），再 deepStrictEqual；
// 键名规范化后若撞车，按出现顺序加 ~n 后缀保留（不丢数据），所以“逐日有 N 条事件记录、整段只有 1 条”会如实显示为“仅逐日有”，不会被吞掉。
// 规范化后仍有的差异一律算真实差异（exitCode=1），按三类计数并列出：仅长程有 / 仅逐日有 / 两边都有但值不同；同时给出两侧各替换了多少处。
const EV_RX=/\bmonth\b|\bday_\d+\b/g;
// 键名规范化后撞车（同一对象里多个键规范化成同一个）：第一个照常配对，其余不参与配对，单独记入 collisions（路径 + 次数），不进比较树、不当成值不同。
function normalizeEvents(value,counter,path=[]){
 if(typeof value==='string')return value.replace(EV_RX,()=>{counter.n++;return '<EV>';});
 if(Array.isArray(value))return value.map((x,i)=>normalizeEvents(x,counter,[...path,i]));
 if(value&&typeof value==='object'){
  const out={};
  for(const [k,v] of Object.entries(value)){
   const key=k.replace(EV_RX,()=>{counter.n++;return '<EV>';});
   if(has(out,key)){const id=[...path,key].join('.');counter.collisions.set(id,(counter.collisions.get(id)??0)+1);continue;}
   out[key]=normalizeEvents(v,counter,[...path,key]);
  }
  return out;
 }
 return value;
}
const clip=v=>{const t=JSON.stringify(v)??'undefined';return t.length>200?`${t.slice(0,200)}…(${t.length})`:t;};
// 完整差异集（不设条数上限，不截深度）：键只在一侧存在时输出那个键的路径，不展开子树；两侧都有则下到叶子（或数组/对象形态不同处）。
function fullDiffs(a,b){
 const onlyLong=[],onlyDaily=[],valueDiffers=[],walk=(x,y,path)=>{
  if(x===y)return;
  if(typeof x!=='object'||typeof y!=='object'||x===null||y===null){valueDiffers.push({path:path.join('.'),long:clip(x),daily:clip(y)});return;}
  if(Array.isArray(x)!==Array.isArray(y)){valueDiffers.push({path:path.join('.'),long:Array.isArray(x)?'<数组>':'<对象>',daily:Array.isArray(y)?'<数组>':'<对象>'});return;}
  for(const k of new Set([...Object.keys(x),...Object.keys(y)])){
   if(has(x,k)!==has(y,k)){(has(x,k)?onlyLong:onlyDaily).push([...path,k].join('.'));continue;}
   walk(x[k],y[k],[...path,k]);
  }
 };
 walk(a,b,[]);
 const byPath=(p,q)=>p<q?-1:p>q?1:0;
 return {onlyLong:onlyLong.sort(byPath),onlyDaily:onlyDaily.sort(byPath),valueDiffers:valueDiffers.sort((p,q)=>byPath(p.path,q.path))};
}
// PAIR 来自 v4 的 cowork 结果（分歧只在这两人），只是定点诊断，不代表别人没有分歧；全员的分歧由逐日整文档扫描覆盖。
const PAIR=['npc_hw_duanyan','npc_hw_anhuai'];
async function cowork5(){
 const {scheduleAt}=await import('../server-plugin/npc-schedule.mjs');
 const {personConstraints}=await import('../server-plugin/entity-view.mjs');
 const {advanceNpcLife,npcIsMinor}=await import('../server-plugin/npc-life.mjs');
 const N=Number(process.argv[3]??26),scanArg=process.argv[4]??`1-${N}`,pairArg=process.argv[5]??'yes';
 const [lo,hi]=scanArg==='none'?[1,0]:scanArg.split('-').map(Number),world=await loadWorld(),CHARACTER_SEED='schedule-month';
 const fresh=()=>{const engine=new WorldEngine(world);return {engine,doc:engine.createCharacter(seed,{},CHARACTER_SEED)};};
 const longRun=async k=>{const f=fresh(),o=await f.engine.reduce(f.doc,{tool:'world_time',args:{minutes:k*1440},eventId:'month'});return {engine:f.engine,doc:applyPatches(f.doc,o.patches)};};
 const report={mode:'cowork5',N,scan:scanArg,pair:pairArg,characterSeed:CHARACTER_SEED,
  note:'(1) 快照取各日 09:00（minute 540+1440k）；逐日一侧是同一引擎连续逐日，整段一侧每个天数新开引擎一次 reduce；比较完整文档（所有顶层键）规范化事件编号后的 deepStrictEqual。'};
 // (1) 逐日整文档比较。
 let firstDiffDay=null;
 if(hi>=lo){
  const {engine,doc}=fresh(),snapshots=[doc];let daily=doc;
  for(let day=0;day<hi;day++){const o=await engine.reduce(daily,{tool:'world_time',args:{minutes:1440},eventId:`day_${day}`});daily=applyPatches(daily,o.patches);snapshots.push(daily);}
  const scan=[],compact=m=>[...m].sort((p,q)=>p[0]<q[0]?-1:p[0]>q[0]?1:0).map(([path,extra])=>({path,collidedExtraKeys:extra}));
  for(let k=lo;k<=hi;k++){
   const L=await longRun(k),D=snapshots[k],cl={n:0,collisions:new Map()},cd={n:0,collisions:new Map()},NL=normalizeEvents(L.doc,cl),ND=normalizeEvents(D,cd);
   const same=Object.keys({...NL,...ND}).every(key=>strictSame(NL[key],ND[key]));
   const collisionKeys={long:compact(cl.collisions),daily:compact(cd.collisions)};
   if(same){scan.push({day:k,identicalAfterNormalization:true,eventIdTokensReplaced:{long:cl.n,daily:cd.n},collisionKeys});continue;}
   const full=fullDiffs(NL,ND);
   scan.push({day:k,identicalAfterNormalization:false,eventIdTokensReplaced:{long:cl.n,daily:cd.n},collisionKeys,
    counts:{onlyLong:full.onlyLong.length,onlyDaily:full.onlyDaily.length,valueDiffers:full.valueDiffers.length},onlyLong:full.onlyLong,onlyDaily:full.onlyDaily,valueDiffers:full.valueDiffers});
   if(firstDiffDay===null)firstDiffDay=k;
  }
  report.dailyScan={scan,firstDayWithDifference:firstDiffDay,note:'三类差异路径每天全量输出（按路径排序，不设上限；值截到 200 字符）；firstDayWithDifference 和退出码按任何差异判定，只作参考，真正定位靠离线做候选差异集减基线差异集（两边输出格式完全一致）'};
 }
 // (2)(3) 两人在 coworkDay 真实运行的时刻（日结那一刻、刚结束的那一天）的判定：直接调用引擎导出的 advanceNpcLife（它在每个午夜调用 coworkDay，npc-life.mjs:970），
 // 在“日结前一分钟（minute = 1440k-1）”的状态上对草稿跑 advanceNpcLife(before=1440k-1, after=1440k)，读两人关系记录的变化。
 // 近似之处（coworkDay、lifeActor/incapacitated/settled/tied 均未导出，不为探针改引擎）：状态取日结前一分钟，不是引擎在日结当刻中途的状态；
 // advanceNpcLife 在同一刻还会跑 healthDay/familyDay 等（只发生在探针的草稿里，不写任何东西），所以只看两人 relationships 的变化。
 // 资格过滤的各项无法直接取到，改为输出它们读取的原始字段、导出的 npcIsMinor、静态亲缘（engine.byId 的 relationships）和阈值（rules.npcLife.kindness.cowork）。
 if(pairArg!=='no'){
  const days=pairArg==='yes'?[24,25,26]:pairArg.split(',').map(Number);
  const pairDays=days.filter(k=>k>=1&&k<=N),maxDay=Math.max(...pairDays);
  // 逐日一侧：第一次推进到第 1 个午夜前一分钟，之后每次 1440 分钟，快照分钟 = 1440k-1。
  const {engine,doc}=fresh();let daily=doc;const boundary=[null];
  {const o=await engine.reduce(daily,{tool:'world_time',args:{minutes:1440-1-doc.state.minute},eventId:'day_0'});daily=applyPatches(daily,o.patches);boundary.push(daily);}
  for(let day=1;day<maxDay;day++){const o=await engine.reduce(daily,{tool:'world_time',args:{minutes:1440},eventId:`day_${day}`});daily=applyPatches(daily,o.patches);boundary.push(daily);}
  const rules=engine.rules.npcLife?.kindness?.cowork??null,other=id=>PAIR.find(x=>x!==id);
  const slotsOf=(eng,state,id,k)=>{const c=personConstraints(eng,state),rows=[];for(let cur=(k-1)*1440;cur<k*1440;){const slot=scheduleAt(eng,id,cur,state,c);if(!slot)break;const end=Math.min(slot.until,k*1440);rows.push({start:cur-(k-1)*1440,end:end-(k-1)*1440,location:slot.location,activity:slot.activity});cur=end;}return rows;};
  const planRow=(state,id,k)=>{const row=Object.values(state.records).find(r=>r.category==='subsistence_plan'&&r.workers?.[id]&&r.day===k-1);return row?{day:row.day,duties:row.workers[id].duties,chores:row.workers[id].chores}:{shapeMissing:`没有 day=${k-1} 且含该人的 subsistence_plan 行（计划行可能已被次日覆盖）`};};
  report.pairByDay=[];
  for(const k of pairDays){
   const f=fresh(),o=await f.engine.reduce(f.doc,{tool:'world_time',args:{minutes:1440*k-1-f.doc.state.minute},eventId:'month'}),Ldoc=applyPatches(f.doc,o.patches);
   const run=(eng,document)=>{
    const state=document.state,d=eng.primitiveDraft(document),before=Object.fromEntries(PAIR.map(id=>[id,structuredClone(state.npcs[id].relationships?.[other(id)]??null)]));
    let error=null;try{advanceNpcLife(d,eng,state.minute,state.minute+1);}catch(e){error=e.stack??String(e);}
    const after=d.get('state'),rel=Object.fromEntries(PAIR.map(id=>[id,{before:before[id],after:after.npcs[id].relationships?.[other(id)]??null}]));
    return {stateMinute:state.minute,advanceNpcLifeError:error,pairRelationships:rel,coworkApplied:PAIR.some(id=>rel[id].after?.routine?.coworkTimes!==rel[id].before?.routine?.coworkTimes),statusAfterAdvance:Object.fromEntries(PAIR.map(id=>[id,after.npcs[id].status])),
     eligibilityInputs:Object.fromEntries(PAIR.map(id=>{const n=state.npcs[id];return [id,{status:n.status,caring:n.caring??null,location:n.location,scheduleTravel:n.scheduleTravel??null,cognitionTravel:n.cognitionTravel??null,minor:npcIsMinor(eng,state,id,k*1440)}];})),
     staticTie:(eng.byId.get(PAIR[0])?.relationships??[]).some(r=>r.with===PAIR[1])||(eng.byId.get(PAIR[1])?.relationships??[]).some(r=>r.with===PAIR[0]),
     threshold:rules,plan:Object.fromEntries(PAIR.map(id=>[id,planRow(state,id,k)])),slots:Object.fromEntries(PAIR.map(id=>[id,slotsOf(eng,state,id,k)]))};
   };
   const a=run(f.engine,Ldoc),b=run(engine,boundary[k]);
   report.pairByDay.push({evaluatesDay:k-1,boundaryMinute:1440*k,long:a,daily:b,coworkResultEqual:strictSame(a.pairRelationships,b.pairRelationships),slotsEqual:strictSame(a.slots,b.slots),planEqual:strictSame(a.plan,b.plan)});
  }
  if(report.pairByDay.some(r=>!r.coworkResultEqual||!r.slotsEqual||!r.planEqual||r.long.advanceNpcLifeError||r.daily.advanceNpcLifeError))process.exitCode=1;
 }
 if(firstDiffDay!==null)process.exitCode=1;
 out(report);
}

// ---------- cowork8 ----------
// 同工丢失的最短跨度定位（第八版）。起点是“逐日推进”一侧的 09:00 快照 S_j（minute 540+1440j，同一引擎连续逐日得到），
// 每次新开引擎、一次 reduce（world_time minutes）推到目标分钟，看两人关系里有没有 routine.cowork（同工是否发生）。
//   A 组：j∈{24,23,22,20,15,10,5,0} → 第 25 天 09:00（minute 25*1440+540）。跨度从 1 天到 25 天；
//   B 组（更细）：从 S_24 分别推到第 25 天 00:01、01:00、09:00；再从“逐日一侧推到第 24 天 23:59”的状态出发推 2 分钟到 00:01。
//     用来区分“reduce 内部”与“午夜处理顺序”：若 B 组的 00:01 就缺同工而 A 组短跨度有，说明午夜处理顺序；若只在长跨度缺，说明跨日累积的内存状态。
// 同工判定输入的原始值（同地非休息重叠分钟、tied、资格原始字段）：coworkDay 与 lifeActor/incapacitated/settled 未导出，不为探针改引擎，只输出它们读取的原始字段、导出的 npcIsMinor、
// 静态亲缘（engine.byId.relationships）、状态里已有的关系（tied 的另一半），以及 scheduleAt 对第 24 天的逐段读取。
// 注意：每次 reduce 结束后第 24 天的计划行通常已被第 25 天的覆盖，所以 inputsAtEnd 里的作息只含基础作息；
// inputsFromStart（取自起点快照，第 24 天计划行仍在库里）才是“同工判定当时能读到的输入”的近似，仅对 j=24 有意义（j<24 的快照里没有第 24 天的计划行，照实标注）。
// eventId 对照：A 组每个 S_j 用同一跨度各跑两次（eventId v8_* 与 month），C 组再跑 S_0→T 用 month、S_24→T 用 day_24（v7 失败/成功调用的原 eventId），看结果是否随 eventId 变化。
// 参照：多推一天得到逐日快照 S_25，凡终点为第 25 天 09:00 的运行，两人关系的 routine 子对象必须与 S_25 严格相等，不一致设 exitCode=1（全文规范化后的比较另列为参考）。
// 耗时估算（候选约 7 秒/模拟日）：逐日基线 25 天 + A 组 Σ(25-j)=81 天 ×2（两种 eventId）+ C 组约 1 天 + B 组约 3 天，合计约 190 个模拟日，约 1500 秒（含余量），在单作业 3600 秒内。
async function cowork8(){
 const {scheduleAt}=await import('../server-plugin/npc-schedule.mjs');
 const {personConstraints}=await import('../server-plugin/entity-view.mjs');
 const {npcIsMinor}=await import('../server-plugin/npc-life.mjs');
 const world=await loadWorld(),CHARACTER_SEED='schedule-month',DAY=1440,TARGET_DAY=25,RESTING_RX=/睡|歇息|休息|赶路|前往|返回|照护/,other=id=>PAIR.find(x=>x!==id);
 const fresh=()=>{const engine=new WorldEngine(world);return {engine,doc:engine.createCharacter(seed,{},CHARACTER_SEED)};};
 const {engine,doc}=fresh(),snapshots=[doc];let daily=doc;
 for(let day=0;day<25;day++){const o=await engine.reduce(daily,{tool:'world_time',args:{minutes:1440},eventId:`day_${day}`});daily=applyPatches(daily,o.patches);snapshots.push(daily);}// 含 S_25：参照结果
 const threshold=engine.rules.npcLife?.kindness?.cowork??null;
 const rel=(state,id)=>state.npcs[id].relationships?.[other(id)]??null;
 const slotsOf=(eng,state,id,day)=>{const c=personConstraints(eng,state),rows=[];for(let cur=day*DAY;cur<(day+1)*DAY;){const slot=scheduleAt(eng,id,cur,state,c);if(!slot)break;const end=Math.min(slot.until,(day+1)*DAY);rows.push({start:cur-day*DAY,end:end-day*DAY,location:slot.location,activity:slot.activity});cur=end;}return rows;};
 const inputs=(eng,state,day)=>{
  const slots=Object.fromEntries(PAIR.map(id=>[id,slotsOf(eng,state,id,day)]));let together=0;
  for(const x of slots[PAIR[0]].filter(s=>!RESTING_RX.test(s.activity??'')))for(const y of slots[PAIR[1]].filter(s=>!RESTING_RX.test(s.activity??'')))if(x.location&&x.location===y.location)together+=Math.max(0,Math.min(x.end,y.end)-Math.max(x.start,y.start));
  const planDays=[...new Set(Object.values(state.records).filter(r=>r.category==='subsistence_plan').map(r=>r.day))].sort((a,b)=>a-b);
  return {evaluatedDay:day,togetherMinutes:together,thresholdMinutes:threshold?.minutes??null,
   tied:(eng.byId.get(PAIR[0])?.relationships??[]).some(r=>r.with===PAIR[1])||(eng.byId.get(PAIR[1])?.relationships??[]).some(r=>r.with===PAIR[0])||Boolean(state.npcs[PAIR[0]].relationships?.[PAIR[1]]||state.npcs[PAIR[1]].relationships?.[PAIR[0]]),
   staticTie:(eng.byId.get(PAIR[0])?.relationships??[]).some(r=>r.with===PAIR[1])||(eng.byId.get(PAIR[1])?.relationships??[]).some(r=>r.with===PAIR[0]),
   existingRelation:{[PAIR[0]]:Boolean(state.npcs[PAIR[0]].relationships?.[PAIR[1]]),[PAIR[1]]:Boolean(state.npcs[PAIR[1]].relationships?.[PAIR[0]])},
   eligibilityRaw:Object.fromEntries(PAIR.map(id=>{const n=state.npcs[id];return [id,{status:n.status,caring:n.caring??null,location:n.location,scheduleTravel:n.scheduleTravel??null,cognitionTravel:n.cognitionTravel??null,companion:Boolean(state.player?.companions?.includes(id)),minor:npcIsMinor(eng,state,id,(day+1)*DAY),life:n.life?true:false}];})),
   subsistencePlanDaysInState:planDays,planRowForEvaluatedDayPresent:planDays.includes(day),slots};
 };
 const runs=[];
 const pairRel=state=>Object.fromEntries(PAIR.map(id=>[id,rel(state,id)])),S25=snapshots[25],reference=pairRel(S25.state);
 const run=async(group,label,startDoc,startLabel,minutes,eventId=`v8_${label}`)=>{
  const entry={group,label,start:startLabel,startMinute:startDoc.state.minute,reduceMinutes:minutes,eventId};
  try{
   const eng=new WorldEngine(world),out=await eng.reduce(startDoc,{tool:'world_time',args:{minutes},eventId}),end=applyPatches(startDoc,out.patches);
   // 参照比较：终点正好是第 25 天 09:00 的那些运行，两人关系必须与逐日快照 S_25 严格相等；其余终点（00:01、01:00 等）没有参照，只报是否出现 routine.cowork。
   // 两种比较都输出：(a) 关系全文先规范化事件编号再 strictSame（参考；evidenceKeys 等带事件编号文字，规范化后才可比）；(b) 只比 routine 子对象（cowork 周期、coworkTimes），exitCode 只看 (b)。
   const comparable=end.state.minute===S25.state.minute,norm=v=>normalizeEvents(v,{n:0,collisions:new Map()}),routineOf=r=>Object.fromEntries(PAIR.map(id=>[id,r[id]?.routine??null]));
   const matchesS25Normalized=comparable?strictSame(norm(pairRel(end.state)),norm(reference)):null,routineMatchesS25=comparable?strictSame(routineOf(pairRel(end.state)),routineOf(reference)):null;
   if(comparable&&!routineMatchesS25)process.exitCode=1;// 同工丢失（routine 与 S_25 不一致）
   Object.assign(entry,{endMinute:end.state.minute,comparableToS25:comparable,matchesS25Normalized,routineMatchesS25,coworkHappened:PAIR.some(id=>rel(end.state,id)?.routine?.cowork!==undefined),
    relations:pairRel(end.state),inputsAtEnd:inputs(eng,end.state,24)});
   runs.push(entry);return end;
  }catch(error){process.exitCode=1;entry.error=String(error?.stack??error);runs.push(entry);return null;}
 };
 const T=TARGET_DAY*DAY+540;
 // A 组
 for(const j of [24,23,22,20,15,10,5,0]){
  await run('A',`A_from_day${j}`,snapshots[j],`S_${j}（逐日第 ${j} 天 09:00）`,T-snapshots[j].state.minute);
  await run('A-month',`A_from_day${j}_eventId_month`,snapshots[j],`S_${j}`,T-snapshots[j].state.minute,'month');// 同一跨度换成 v7 失败调用用的 eventId
 }
 // C 组（eventId 对照）：S_0→T 用 month（v7 整段，预期丢失同工）就是 A-month 的 j=0 那一次（A_from_day0_eventId_month），不重复跑；S_24→T 用 day_24（v7 逐日最后一天，预期发生同工）。
 await run('C','C_S24_to_T_eventId_day_24',snapshots[24],'S_24',T-snapshots[24].state.minute,'day_24');
 // B 组
 const S24=snapshots[24];
 for(const [name,target] of [['00:01',TARGET_DAY*DAY+1],['01:00',TARGET_DAY*DAY+60],['09:00',T]])await run('B',`B_S24_to_day25_${name}`,S24,'S_24',target-S24.state.minute);
 const near=await run('B','B_S24_to_day24_23:59',S24,'S_24（逐日一侧推到第 24 天 23:59）',TARGET_DAY*DAY-1-S24.state.minute);
 if(near)await run('B','B_day24_23:59_plus2',near,'上一行的结束状态（第 24 天 23:59）',2);
 // 起点快照里的输入（j=24 才含第 24 天计划行）。
 const startInputs=Object.fromEntries([24,23].map(j=>[`S_${j}`,inputs(engine,snapshots[j].state,24)]));
 out({mode:'cowork8',characterSeed:CHARACTER_SEED,targetDay:TARGET_DAY,note:'每次新开引擎一次 reduce；coworkHappened=两人关系里出现 routine.cowork；matchesS25Normalized=终点为第 25 天 09:00 的运行，两人关系全文规范化事件编号后与 S_25 的 strictSame 结果（参考）；routineMatchesS25=只比 routine 子对象（cowork 周期、coworkTimes），不一致即同工丢失，exitCode=1',referencePairRelationsAtS25:reference,inputsFromStart:startInputs,runs});
}

// ---------- office ----------
async function office(){
 const {applyIntentSetup}=await import('./a3-score.mjs');
 const {questPublishingRights}=await import('../server-plugin/quest-board.mjs');
 const {affairs}=await import('../server-plugin/ui-affairs.mjs');
 const world=await loadWorld(),engine=new WorldEngine(world),trace=[];
 const rights=document=>questPublishingRights(engine.scoped(document),document.state,'player');
 const publication={personal:false,grade:'C',reward:40,content:'核看公署前厅'};
 const step=(label,document)=>trace.push({step:label,minute:document.state.minute,month:engine.scoped(document).calendar(document.state.minute).month,rights:rights(document),questQuota:document.state.questQuota??null});
 // 测试 run()（s4:19-24）：reduce 出错带事件编号；回执 rejected 即断言失败并打印结果。
 const run=async(document,action,slots,eventId)=>{
  let o;try{o=await engine.reduce(document,{tool:'world_act',args:{action,slots},eventId});}catch(error){throw Error(`${eventId}: ${error.message}`,{cause:error});}
  assert.notEqual(o.result.receipt?.status,'rejected',`${eventId} 被拒：${JSON.stringify(o.result)}`);
  return applyPatches(document,o.patches);
 };
 let document;
 try{
  // 测试 scene({location:'loc_hw',present:[]})（s4:18-22）：setupUnmet 必须为空。
  const loaded=applyIntentSetup(engine,engine.createCharacter(seed,{},'s408-quota'),{location:'loc_hw',present:[],coins:200,inventory:{item_wood:2}});
  assert.deepEqual(loaded.setupUnmet,[]);document=loaded.document;
  const found=(name,event)=>run(document,'core:create',{type:'org',name,data:{notes:'共同核账，按章程议事',occupation:'行会'}},event);
  document=await found('河谷行旅会','found-one');document=await found('河谷营造会','found-two');step('after-found',document);
  assert.equal(rights(document).limitD,10);
  const posted=await run(document,'core:quest.publish',{...publication,publisher:'player',objective:{type:'visit',location:'loc_hw_gate'}},'guild-post');
  step('after-post',posted);
  assert.equal(rights(posted).usedD,10);const oldPeriod=rights(posted).month;
  document=await run(posted,'core:time',{minutes:30*1440-posted.state.minute},'month-two');step('month-two',document);
  assert.equal(engine.scoped(document).calendar(document.state.minute).month,2);
  assert.notEqual(rights(document).month,oldPeriod);assert.equal(rights(document).usedD,0);
  assert.equal(document.state.questQuota[`${oldPeriod}_player`],10);
  const month2=rights(document).month;
  document=await run(document,'core:time',{minutes:29*1440},'month-three');step('month-three',document);
  assert.equal(engine.scoped(document).calendar(document.state.minute).month,3);assert.notEqual(rights(document).month,month2);
  assert.equal(affairs(engine,document).quota.period,rights(document).month);
  assert.ok(document.state.quests['quest_guild-post']);
  assert.equal(document.state.questQuota[`${oldPeriod}_player`],10);
  out({mode:'office',ok:true,note:'与测试 s4:115-135 全部断言通过',trace});
 }catch(error){fail('office',error);out({mode:'office',ok:false,trace});}
}

// ---------- lifecycle ----------
async function lifecycle(){
 const {createPlaytestServer}=await import('./playtest-runner.mjs');
 const {recordedLifeChange}=await import('../tests/fixtures/life-population.mjs');
 const server=await createPlaytestServer({seed:'winter-route'});
 let sequence=0,campaignId,last=null;
 const read=async()=>(await server.api('read',{campaignId})).document;
 const act=async(tool,args,anchor='actions')=>{last={tool,args,eventId:`flow_${sequence}`};return (await server.api('execute',{campaignId,tool,args,eventId:`flow_${sequence++}`,anchor})).result;};
 const keyFields=async()=>{try{const s=(await read()).state;return {minute:s.minute,location:s.location,player:{coins:s.player?.coins,hp:s.player?.hp,status:s.player?.status},population:s.settlements?.loc_hw?.population,lastCall:last,callsMade:sequence};}catch(e){return {readFailed:e.message,lastCall:last,callsMade:sequence};}};
 try{
  const initial=await server.api('create',{character:{name:'试玩者'}});campaignId=initial.reference.campaignId;
  for(let i=0;i<9;i++)await act('world_time',{minutes:43200,activity:'休息'});
  await act('world_move',{destination:'白冠高林'});
  const before=await read();assert.equal(before.state.location,'site_white_canopy');
  assert.ok(before.state.minute>=270*1440&&before.state.minute<360*1440);
  assert.equal(before.state.settlements.loc_hw.population,58+recordedLifeChange(before.state,'loc_hw'));
  await assert.rejects(act('world_move',{destination:'冰回裂谷'}),/没有.*可通行/);
  assert.deepEqual((await read()).state,before.state);
  out({mode:'lifecycle',ok:true,note:'与测试 playtest-lifecycle:48-58 全部断言通过',minute:before.state.minute,population:before.state.settlements.loc_hw.population});
 }catch(error){fail('lifecycle',error);out({mode:'lifecycle',ok:false,state:await keyFields()});}
 finally{await server.close();}
}

// ---------- catalog ----------
async function catalog(){
 const world=await loadWorld(),engine=new WorldEngine(world);
 await import('../server-plugin/primitives-runtime.mjs');
 let document=engine.createCharacter(seed,{},'a3cp');
 const call=async(tool,args,eventId)=>{
  const routed=modelToolCall(tool,args);
  const o=await engine.reduce(document,{...routed,eventId});document=applyPatches(document,o.patches);return o.result;
 };
 try{
  await call('world_move',{destination:'loc_bs'},'move');
  const result=await call('world_actions',{target:'npc_hw_yanzhe'},'look');
  out({mode:'catalog',ok:true,target:result?.target?.id??null,actions:result?.actions?.length??null});
 }catch(error){fail('catalog',error);out({mode:'catalog',ok:false});}
}

try{
 if(mode==='kd2')await kd2();
 else if(mode==='cowork')await cowork();
 else if(mode==='cowork5')await cowork5();
 else if(mode==='cowork8')await cowork8();
 else if(mode==='office')await office();
 else if(mode==='lifecycle')await lifecycle();
 else if(mode==='catalog')await catalog();
 else throw Error(`未知模式 ${mode}`);
}catch(error){fail(mode,error);}
