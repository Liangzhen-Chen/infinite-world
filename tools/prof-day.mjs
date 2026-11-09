// 只读性能剖析：node tools/prof-day.mjs [mode=farm|a3|s5pm] [scene=hall|school|post|proposal](s5pm 用) [days=N] [limit=秒(scene=proposal，默认900)] [replay=1] [out=dir]
// 不改引擎/测试/世界数据；用 node:inspector 进程内采样 + 加载钩子计数包装。
import inspector from 'node:inspector';
import {register} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return i<0?[a,'1']:[a.slice(0,i),a.slice(i+1)];}));
const mode=args.mode??'farm',days=Number(args.days??10),outDir=path.resolve(args.out??'.tmp/prof');
const T0=performance.now(),BUDGET_MS=1200e3,over=()=>performance.now()-T0>BUDGET_MS;
fs.mkdirSync(outDir,{recursive:true});
const rel=u=>{if(!u)return '(native)';try{return path.relative(process.cwd(),fileURLToPath(u)).replace(/\\/g,'/');}catch{return u;}};

// ---- 计数包装 ----
let curDay=0;const stateIds=new WeakMap();let nextId=1;
const sid=o=>{if(!o||typeof o!=='object')return 'x';let v=stateIds.get(o);if(!v)stateIds.set(o,v=nextId++);return v;};
const stateOf=d=>{try{return d?.state??d?.document?.state??(typeof d?.get==='function'?d.get('state'):null);}catch{return null;}};
const J=o=>{try{return JSON.stringify(o)??'';}catch{return '?';}};
const keyOf={
 'laborCandidates@npc-labor':([e,view])=>`${view?.observer}|${view?.minute}`,
 'route@npc-labor':([e,doc,from,to,at])=>`${from}|${to}|${at}`,
 'route@building-maintenance':([e,doc,from,to,at])=>`${from}|${to}|${at}`,
 'marketSupply@market':([d,e,item,loc,opt])=>`${item}|${loc}|${J(opt)}`,
 'foodSources@shop':([d,e,owner,o])=>`${owner}|${o?.view?o.view.minute:''}`,
 'householdResources@household-budget':([d,e,owner,o])=>`${owner}|${o?.days??''}|${o?.view?o.view.minute:''}|${o?.risk??0}|${o?.commonRisk??0}|${o?.marketSubstitution??''}`,
 'householdBudget@household-budget':([d,e,owner,o])=>`${owner}|${o?.view?o.view.minute:''}|${o?.kernel?'k':''}|${o?.risk??0}`,
 'readHouseholdResources@household-budget':([d,e,owner,o])=>`${owner}|${o?.days??''}|${o?.view?o.view.minute:''}|${o?.risk??0}`,
};
const stateArg={ // 状态对象所在参数（其余默认从第 1 个参数取）
 'laborCandidates@npc-labor':a=>a[2]?.state,'route@npc-labor':a=>a[1]?.state,'route@building-maintenance':a=>a[1]?.state,
};
const CALLERS=new Set(['householdResources@household-budget','readHouseholdResources@household-budget','foodSources@shop']);
const callerOf=(name)=>{const fn=name.split('@')[0];const L=(new Error().stack??'').split(String.fromCharCode(10)).slice(1);
  const i=L.findIndex(l=>l.includes(`at ${fn} `)||l.includes(`at async ${fn} `));
  const f=L.slice(i<0?0:i+1).find(l=>!l.includes('prof-day.mjs')&&!l.includes(`at ${fn} `)&&!l.includes('__orig_'+fn));
  if(!f)return '(?)';const m=/at (?:async )?(.*?) \(?([^()]*?)([^\/()]*:\d+):\d+\)?$/.exec(f.trim());return m?`${m[1]} ${m[3]}`:f.trim();};
// 子进程进度：每 100 次钩子调用同步写一行累计计数到进度文件（进程被杀也留得下）
let progFd=null,progN=0;
const progress=(name,force)=>{if(progFd==null)return;progN++;if(!force&&progN%100)return;
  try{fs.writeSync(progFd,`${((performance.now()-T0)/1000).toFixed(1)}s calls=${progN} last=${name} `+[...stats].map(([k,v])=>`${k.split('@')[0]}=${v.total}`).join(' ')+'\n');}catch{}};
const stats=new Map();
const S=name=>{let s=stats.get(name);if(!s)stats.set(name,s={total:0,byDay:new Map(),dayKeys:new Set(),stateKeys:new Set(),dupDay:0,dupState:0,callers:new Map()});return s;};
globalThis.__PROF={wrap(name,a,orig){
  const s=S(name);s.total++;progress(name);s.byDay.set(curDay,(s.byDay.get(curDay)??0)+1);
  let k='';try{k=(keyOf[name]??(()=>''))(a);}catch{}
  const dk=`${curDay}#${k}`;if(s.dayKeys.has(dk))s.dupDay++;else s.dayKeys.add(dk);
  let st=null;try{st=(stateArg[name]?.(a))??stateOf(a[0]);}catch{}
  const sk=`${sid(st)}#${k}`;
  if(s.stateKeys.has(sk))s.dupState++;else s.stateKeys.add(sk);
  if(CALLERS.has(name)){const c=callerOf(name);s.callers.set(c,(s.callers.get(c)??0)+1);}
  return orig(...a);
}};
register(pathToFileURL(path.resolve('tools/prof-day-hooks.mjs')).href);

// ---- Profiler ----
const session=new inspector.Session();session.connect();
const post=(m,p)=>new Promise((res,rej)=>session.post(m,p,(e,r)=>e?rej(e):res(r)));
async function startProf(){await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:1000});await post('Profiler.start');}
async function stopProf(name){
  const {profile}=await post('Profiler.stop');
  const f=path.join(outDir,`${name}.cpuprofile`);fs.writeFileSync(f,JSON.stringify(profile));console.log(`cpuprofile 已写入 ${f}`);
  aggregate(profile);
}
function aggregate(p){
  const nodes=new Map(p.nodes.map(n=>[n.id,n])),parent=new Map();
  for(const n of p.nodes)for(const c of n.children??[])parent.set(c,n.id);
  const fk=n=>{const c=n.callFrame;return `${c.functionName||'(anon)'}|${rel(c.url)}|${c.lineNumber+1}`;};
  const self=new Map(),total=new Map(),pathCache=new Map();let sum=0;
  const pathOf=id=>{let r=pathCache.get(id);if(r)return r;const keys=new Set();for(let x=id;x!=null;x=parent.get(x))keys.add(fk(nodes.get(x)));pathCache.set(id,r=[...keys]);return r;};
  const {samples,timeDeltas}=p;
  for(let i=0;i<samples.length;i++){
    const dt=(timeDeltas[i+1]??timeDeltas[i]??0)/1000;sum+=dt;
    const id=samples[i],k=fk(nodes.get(id));
    self.set(k,(self.get(k)??0)+dt);
    for(const key of pathOf(id))total.set(key,(total.get(key)??0)+dt);
  }
  const row=(k,v,t)=>{const [fn,file,line]=k.split('|');return `${file}:${line}  ${fn}  self=${v.toFixed(0)}ms total=${t.toFixed(0)}ms (${(t/sum*100).toFixed(1)}%)`;};
  const skip=k=>k.startsWith('(root)')||k.startsWith('(program)')||k.startsWith('(idle)');
  console.log(`\n== 采样总时长 ${sum.toFixed(0)} ms；按包含时间前30 ==`);
  for(const [k,t] of [...total].filter(([k])=>!skip(k)).sort((a,b)=>b[1]-a[1]).slice(0,30))console.log(row(k,self.get(k)??0,t));
  console.log(`\n== 按 self 时间前30 ==`);
  for(const [k,v] of [...self].filter(([k])=>!skip(k)).sort((a,b)=>b[1]-a[1]).slice(0,30))console.log(row(k,v,total.get(k)??v));
}
function report(){
  console.log('\n== 计数包装（每日调用次数；重复=同日同键 / 同一状态对象同键） ==');
  for(const [name,s] of stats){
    const perDay=[...s.byDay].sort((a,b)=>a[0]-b[0]).map(([d,n])=>`${d}:${n}`).join(' ');
    console.log(`${name}: 总${s.total}；同日同键重复 ${s.dupDay} (${(s.dupDay/s.total*100).toFixed(1)}%)；同状态对象同键重复 ${s.dupState} (${(s.dupState/s.total*100).toFixed(1)}%)\n  每日(a3 模式为每意图): ${perDay}`);
  }
  for(const [name,s] of stats)if(s.callers.size)console.log(`${name} 调用者(前8)：`+[...s.callers].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,n])=>`${k}=${n}`).join('；'));
  if(!stats.size)console.log('(无计数：钩子未命中)');
  console.log('覆盖说明：经加载钩子包装 laborCandidates/route(npc-labor、building-maintenance)/marketSupply/householdBudget/readHouseholdResources/householdResources/foodSources(shop 注册回调)；模块内部对这些函数的调用也走包装；其它路径(闭包捕获的旧引用等)计不到。');
}

async function farm(){
  const fx=await import('../tests/farm-pests-fixture.mjs');
  const {run,c:c0}=fx.setup('pest-clock');let c=c0;const ms=[];
  await startProf();
  for(let i=0;i<days;i++){
    if(over()){console.log(`超过自限时间，提前结束于第 ${i} 天`);break;}
    curDay=i+1;const t=performance.now();
    c=await fx.wait(run,c,1440,`prof${i}`);
    const d=performance.now()-t;ms.push(d);console.log(`第 ${i+1} 天 ${d.toFixed(0)} ms`);
  }
  await stopProf('farm');
  if(ms.length>=3){const m=a=>a.reduce((x,y)=>x+y,0)/a.length,h=m(ms.slice(0,3)),t=m(ms.slice(-3));
    console.log(`\n首3日均值 ${h.toFixed(0)} ms；末3日均值 ${t.toFixed(0)} ms；比值 ${(t/h).toFixed(2)} -> ${t>h*1.2?'随天数增长':'基本不随天数增长'}`);}
  report();
}
async function s5pm(){
  // 复用 tests/helpers/s5pm-fixture.mjs（s5-law-public-maintenance 测试同一夹具）；推进方式同测试：world_time 经 engine.reduce。
  const fx=await import('../tests/helpers/s5pm-fixture.mjs');
  const {applyPatches}=await import('../server-plugin/storage.mjs');const {withLedger}=await import('../server-plugin/ledger.mjs');
  const scene=args.scene??'hall',step=Number(args.step??1);
  let f,proposal=false;
  if(scene==='hall'){ // 测试「完整一季推进」(tests/s5-law-public-maintenance.test.mjs 末尾) 的同一前置
    f=fx.scenario();f.doc.state.npcs=Object.fromEntries([fx.official,fx.worker].map(id=>[id,f.doc.state.npcs[id]]));
    f.doc=withLedger(f.e,{...f.doc,ledger:undefined}).document;
  }else if(scene==='proposal'){ // 子测 8「真实自治提案…」(test.mjs:171起)：scenario() 后 600→630 分钟的 choose/finish；剖析只跑一遍，replay=1 再跑一份对照；之后可选 days=N 继续 world_time
    proposal=true;f=fx.scenario();
  }else f=fx.nativeScenario(scene==='school'?'bld_hw_school':'bld_hw_post');
  console.log(`scene=${scene} step=${step}日/次`);
  if(args.child)progFd=fs.openSync(path.resolve(args.progress),'a');
  if(!args.child)await startProf();const ms=[];
  if(proposal){ // 全程计时与采样覆盖 proposalAdvance（子测 8 的 599 秒所在）；replay=1 时再造一份同构场景（子测 8 的同种子重放）再跑一遍
    for(const [n,x] of [['主',f],...(args.replay?[['replay',fx.scenario()]]:[])]){curDay=0;const t=performance.now();progress('proposalAdvance:start',1);fx.proposalAdvance(x);progress('proposalAdvance:done',1);console.log(`proposalAdvance(${n}) ${(performance.now()-t).toFixed(0)} ms`);if(n==='主')f=x;}
  }
  for(let i=0;i<(proposal&&args.days==null?0:days);i+=step){
    if(over()){console.log(`超过自限时间，提前结束于第 ${i} 天`);break;}
    curDay=i+step;const t=performance.now();
    const out=await f.e.reduce(f.doc,{tool:'world_time',args:{minutes:step*1440},eventId:`prof-s5pm:${scene}:${i}`});f.doc=applyPatches(f.doc,out.patches);
    const d=performance.now()-t;ms.push(d/step);console.log(`第 ${i+1}-${i+step} 天 ${d.toFixed(0)} ms（日均 ${(d/step).toFixed(0)}）`);
  }
  if(!args.child)await stopProf('s5pm-'+scene);
  if(ms.length>=3){const m=a=>a.reduce((x,y)=>x+y,0)/a.length,h=m(ms.slice(0,3)),t=m(ms.slice(-3));
    console.log(`
首3次日均 ${h.toFixed(0)} ms；末3次日均 ${t.toFixed(0)} ms；比值 ${(t/h).toFixed(2)}`);}
  report();
}
async function a3(){
  const {loadCorpus,scoreRows}=await import('../tools/a3-score.mjs');
  const {loadWorld}=await import('../tools/load-world.mjs');
  const {WorldEngine}=await import('../server-plugin/engine.mjs');
  const {rows}=await loadCorpus();const world=await loadWorld();
  const seed=JSON.parse(fs.readFileSync('tests/fixtures/legacy/seed.json','utf8'));
  const document=new WorldEngine(world).createCharacter(seed,{},'a3-score-independent');
  await startProf();
  const pick=rows.slice(0,20);
  for(let i=0;i<pick.length;i++){
    if(over()){console.log(`超过自限时间，提前结束于第 ${i} 条`);break;}
    curDay=i+1;const t=performance.now();
    await scoreRows([pick[i]],{world,seed,document});
    console.log(`意图 ${i+1} ${pick[i].id} ${(performance.now()-t).toFixed(0)} ms`);
  }
  await stopProf('a3');report();
}
// scene=proposal：单次 proposalAdvance 可能同步跑过 1 小时，进程内采样来不及输出。
// 父进程用 node --prof 起子进程（逐 tick 日志持续落盘），limit 秒后强杀，再用 --prof-process 出摘要。
async function parentProposal(){
  const limit=Number(args.limit??900),log=path.join(outDir,'proposal-v8.log'),prog=path.join(outDir,'proposal-progress.txt');
  for(const f of [log,prog])try{fs.rmSync(f);}catch{}
  const passthru=process.argv.slice(2).filter(a=>!a.startsWith('limit=')&&!a.startsWith('out='));
  const child=spawn(process.execPath,['--prof','--no-logfile-per-isolate',`--logfile=${log}`,fileURLToPath(import.meta.url),...passthru,'child=1',`progress=${prog}`,`out=${outDir}`],{stdio:['ignore','inherit','inherit']});
  let killed=false;const timer=setTimeout(()=>{killed=true;child.kill('SIGKILL');},limit*1000);
  const code=await new Promise(res=>child.on('exit',c=>res(c)));clearTimeout(timer);
  console.log(`子进程 ${killed?`到 limit=${limit}s 被强制结束`:`自行结束 code=${code}`}；V8 日志 ${log}（${fs.existsSync(log)?(fs.statSync(log).size/1e6).toFixed(0)+' MB':'缺失'}）`);
  if(fs.existsSync(prog)){const L=fs.readFileSync(prog,'utf8').trim().split('\n');console.log(`进度文件 ${prog}，共 ${L.length} 行；最后 3 行：
`+L.slice(-3).join('\n'));}
  if(!fs.existsSync(log))return;
  const r=spawnSync(process.execPath,['--prof-process',log],{cwd:outDir,encoding:'utf8',maxBuffer:1<<30,timeout:1200e3});
  const txt=r.stdout??'';const outF=path.join(outDir,'proposal-prof-process.txt');fs.writeFileSync(outF,txt+(r.stderr?'\n'+r.stderr:''));
  console.log(`--prof-process 完成(status=${r.status})，全文 ${outF}`);
  const bi=txt.indexOf('[Bottom up (heavy) profile]');
  console.log('\n'+txt.slice(txt.indexOf('[Summary]'),Math.max(0,txt.indexOf('[C++]'))||2000).slice(0,1500));
  if(bi>=0){const lines=txt.slice(bi).split('\n');
    console.log('\n== 自底向上(heavy)前 40 项（含按调用者聚合的缩进行） ==');
    let top=0,out=[];for(const l of lines.slice(1)){if(/^\s+\d+\s+[\d.]+%\s{1,2}\S/.test(l)){if(++top>40)break;}if(top>0)out.push(l.slice(0,200));}
    console.log(out.join('\n'));}
}
try{
  console.log(`mode=${mode} days=${days} out=${outDir} cwd=${process.cwd()} node=${process.version}`);
  if(mode==='s5pm'&&args.scene==='proposal'&&!args.child)await parentProposal();else if(mode==='a3')await a3();else if(mode==='s5pm')await s5pm();else await farm();
  console.log(`总耗时 ${((performance.now()-T0)/1000).toFixed(0)} s\nEXIT=0`);process.exit(0);
}catch(e){console.log(e?.stack??e);process.exit(1);}
