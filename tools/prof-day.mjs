// 只读性能剖析：node tools/prof-day.mjs [mode=farm|a3] [days=N] [out=dir]
// 不改引擎/测试/世界数据；用 node:inspector 进程内采样 + 加载钩子计数包装。
import inspector from 'node:inspector';
import {register} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {pathToFileURL,fileURLToPath} from 'node:url';
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
 'householdBudget@household-budget':([d,e,owner,o])=>`${owner}|${o?.view?o.view.minute:''}|${o?.kernel?'k':''}|${o?.risk??0}`,
 'readHouseholdResources@household-budget':([d,e,owner,o])=>`${owner}|${o?.days??''}|${o?.view?o.view.minute:''}|${o?.risk??0}`,
};
const stateArg={ // 状态对象所在参数（其余默认从第 1 个参数取）
 'laborCandidates@npc-labor':a=>a[2]?.state,'route@npc-labor':a=>a[1]?.state,'route@building-maintenance':a=>a[1]?.state,
};
const stats=new Map();
const S=name=>{let s=stats.get(name);if(!s)stats.set(name,s={total:0,byDay:new Map(),dayKeys:new Set(),stateKeys:new Set(),dupDay:0,dupState:0});return s;};
globalThis.__PROF={wrap(name,a,orig){
  const s=S(name);s.total++;s.byDay.set(curDay,(s.byDay.get(curDay)??0)+1);
  let k='';try{k=(keyOf[name]??(()=>''))(a);}catch{}
  const dk=`${curDay}#${k}`;if(s.dayKeys.has(dk))s.dupDay++;else s.dayKeys.add(dk);
  let st=null;try{st=(stateArg[name]?.(a))??stateOf(a[0]);}catch{}
  const sk=`${sid(st)}#${k}`;
  if(s.stateKeys.has(sk))s.dupState++;else s.stateKeys.add(sk);
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
  if(!stats.size)console.log('(无计数：钩子未命中)');
  console.log('覆盖说明：经加载钩子包装 laborCandidates/route(npc-labor、building-maintenance)/marketSupply/householdBudget/readHouseholdResources；模块内部对这些函数的调用也走包装；其它路径(闭包捕获的旧引用等)计不到。');
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
try{
  console.log(`mode=${mode} days=${days} out=${outDir} cwd=${process.cwd()} node=${process.version}`);
  if(mode==='a3')await a3();else await farm();
  console.log(`总耗时 ${((performance.now()-T0)/1000).toFixed(0)} s\nEXIT=0`);process.exit(0);
}catch(e){console.log(e?.stack??e);process.exit(1);}
