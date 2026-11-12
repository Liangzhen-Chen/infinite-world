// 批次 1 完整检查新增失败的云上复现探针（第四版）。原则：调用路径、判定口径、断言一律照原测试；凡不复现的部分在这里写明。
//   node tools/probe-b1c.mjs kd2              tests/kd2-process.test.mjs 第 1 条里"成功加工记录有制作凭据"那一段（及 consumed/produced、auditLedger）
//   node tools/probe-b1c.mjs cowork [天数]    tests/npc-schedule.test.mjs:166-181 第 11 条（缺省 30 天，即测试口径 N=30）
//   node tools/probe-b1c.mjs office           tests/s4-office-quests.test.mjs:115-135 第 6 条（逐条断言）
//   node tools/probe-b1c.mjs lifecycle        tests/playtest-lifecycle.test.mjs:48-58 第 3 条（经 tools/playtest-runner.mjs 的 createPlaytestServer）
//   node tools/probe-b1c.mjs catalog          a3-model-catalog #5 的前两步（不经 playtest 服务器，只取栈）
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
 const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,seed:'winter-route'});
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
 else if(mode==='office')await office();
 else if(mode==='lifecycle')await lifecycle();
 else if(mode==='catalog')await catalog();
 else throw Error(`未知模式 ${mode}`);
}catch(error){fail(mode,error);}
