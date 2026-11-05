// 卡 E2 跨聚落贩运与商人套利·独立验收驱动层。
// 只经引擎公开入口（createCharacter / reduce / applyPatches）与工具面（world_time、world_act、world_trade）驱动；
// 观察只读存档里的 state、ledger、records，以及测试里同样使用的只读价格投影（settlement-trade.mjs 的 regionalTradePrice，
// 没有就退回 regionalTradeBase）。守恒用 ledger.auditLedger 与 tests/helpers/ledger-audit.mjs 的 conservation。
// 不读 server-plugin 的规律实现，不调内部函数造结果，不改仓库。一个进程里可先后开基线树和变异树。
import fs from 'node:fs';
import path from 'node:path';

const fwd=s=>String(s).split(String.fromCharCode(92)).join('/').replace(/[/]$/,'');
export const BASE=fwd(process.env.ACC_REPO??'F:/dnd-wt/INT');
export const OUT_DIR=fwd(process.env.ACC_OUT??import.meta.dirname);
export const MUT=`${OUT_DIR}/mut`;
export const DAY=1440;
export const argOf=(k,d)=>{const i=process.argv.indexOf('--'+k);return i>0?process.argv[i+1]:d;};
export const has=f=>process.argv.includes(f);
export const write=(name,data)=>fs.writeFileSync(path.join(OUT_DIR,name),typeof data==='string'?data:JSON.stringify(data,null,1));
let counter=0;

export async function openRepo(repo){
  repo=fwd(repo);process.chdir(repo);
  const R=`file:///${repo}/`;
  const {loadRuntimeWorld}=await import(R+'tools/load-world.mjs');
  const {WorldEngine}=await import(R+'server-plugin/engine.mjs');
  const {applyPatches}=await import(R+'server-plugin/storage.mjs');
  const {auditLedger}=await import(R+'server-plugin/ledger.mjs');
  const {conservation}=await import(R+'tests/helpers/ledger-audit.mjs');
  const trade=await import(R+'server-plugin/settlement-trade.mjs');
  const priceFn=trade.regionalTradePrice??trade.regionalTradeBase;
  // 需求：引擎自己的需求函数（market.mjs 的 upkeepDemand：家户按用度类的日需）。调不到时为 null，第 1 条退回用人口。
  let upkeepDemand=null;try{({upkeepDemand}=await import(R+'server-plugin/market.mjs'));}catch{}
  const world=await loadRuntimeWorld(path.join(repo,'world'));
  const seed=JSON.parse(fs.readFileSync(`${repo}/tests/fixtures/legacy/seed.json`,'utf8'));
  const T={repo,world,applyPatches,auditLedger,conservation,priceName:trade.regionalTradePrice?'regionalTradePrice':'regionalTradeBase'};
  T.newGame=(id='e2')=>{const engine=new WorldEngine(structuredClone(world));return {T,engine,doc:engine.createCharacter(seed,{},id),id,log:[]};};
  T.price=(ctx,item,settlement)=>{const doc=ctx.doc,d={document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc)};
    try{const v=priceFn(d,ctx.engine,item,settlement);return Number.isFinite(v)&&v>0?v:null;}catch{return null;}};
  Object.assign(T,geography(world));
  T.demandName=typeof upkeepDemand==='function'?'market.upkeepDemand':null;
  // 聚落 s 对物 item 的需求 = 归属 s 的各人 upkeepDemand 之和（函数只在户主身上计一次）。
  T.demand=(ctx,item,s)=>{if(!T.demandName)return null;let n=0;for(const id of Object.keys(ctx.doc.state.npcs??{})){if(T.homeOf(id)!==s)continue;try{const v=upkeepDemand(ctx.doc.state,ctx.engine,id,item);if(v>0)n+=v;}catch{}}return n;};
  return T;
}

export async function call(ctx,tool,args,{commit=true}={}){
  const eventId=`${ctx.id}-${++counter}`,input={tool,args,eventId};
  let out;
  try{out=await ctx.engine.reduce(ctx.doc,input);}
  catch(e){return {status:'rejected',reason:String(e?.message??e),result:{},input};}
  const result=out.result??{},receipt=result.receipt??out.receipt??{};
  const rejected=receipt.status==='rejected'||(result.ok===false&&!out.patches?.length);
  const reason=receipt.reason??result.reason??result.error??null;
  const res={status:rejected?'rejected':'committed',reason,result,receipt,input};
  if(commit&&out.patches?.length)ctx.doc=ctx.T.applyPatches(ctx.doc,out.patches);
  if(tool!=='world_time')ctx.log.push({tool,args,status:res.status,reason});
  return res;
}
export const act=(ctx,action,slots={},o)=>call(ctx,'world_act',{action,slots},o);
export const say=r=>r?`${r.status}${r.reason?'：'+r.reason:''}`:'无';
export const at=async(c,dest)=>(c.doc.state.location===dest?null:act(c,'core:move',{destination:dest}));
export const inv=(holder,item)=>{const v=holder?.inventory?.[item];return typeof v==='number'?v:v?.quantity??0;};
export const fork=(c,tag)=>({...c,doc:c.doc,id:`${c.id}-${tag}`,log:[]});
export const books=(c,before)=>{const a=c.T.auditLedger(c.doc.ledger)??[],k=before?c.T.conservation(c.engine,before,c.doc):[];return {ok:!a.length&&!k.length,audit:a.slice(0,5),conservation:k.slice(0,5)};};

// ---- 地理：位置 → 聚落、聚落间路线图（全从数据推） ----
function geography(world){
  const loc=new Map(world.locations.map(l=>[l.id,l]));
  const settlementIds=new Set((world.settlementProfiles??[]).map(s=>s.id));
  const settlementOf=place=>{let id=place;for(let i=0;id&&i<30;i++){if(settlementIds.has(id))return id;id=loc.get(id)?.parent;}return null;};
  const resident=new Map((world.residents??[]).map(r=>[r.id,r]));
  const npc=new Map(world.npcs.map(n=>[n.id,n]));
  const hh=new Map((world.households??[]).map(h=>[h.id,h]));
  // 人的所属聚落：户籍（residents.settlement）→ 住处 → 开局位置。
  const homeOf=id=>{const r=resident.get(id),n=npc.get(id);
    return (r?.settlement&&settlementIds.has(r.settlement)?r.settlement:null)??settlementOf(n?.home?.location??r?.home?.location)??settlementOf(n?.location??r?.location);};
  // 账户持有人 → 聚落：人按所属聚落；家户按户籍；聚落、地点即本身所在；其余（记录、虚拟账户、玩家）为 null。
  const ownerSettlement=owner=>{
    if(!owner||owner==='player'||/^(src|sink):/.test(owner))return null;
    if(npc.has(owner)||resident.has(owner))return homeOf(owner);
    if(hh.has(owner)){const h=hh.get(owner);return (settlementIds.has(h.settlement)?h.settlement:null)??settlementOf(h.homeLocation);}
    if(loc.has(owner))return loc.get(owner).site?null:settlementOf(owner);// 野外采集点的储量不算聚落存货
    return null;
  };
  // 路线端点所属聚落：端点就是聚落，或是聚落下的非采集点位置；野外采集点（带 site）不算任何聚落。
  const endS=p=>settlementIds.has(p)?p:(loc.get(p)?.site?null:settlementOf(p));
  // 聚落之间的路线：两端分属不同聚落的路线。路线图上的最短路（按 lengthKm）。
  const interRoutes=world.routes.filter(r=>{const a=endS(r.from),b=endS(r.to);return a&&b&&a!==b;});
  const interRouteIds=new Set(interRoutes.map(r=>r.id));
  const routeById=new Map(world.routes.map(r=>[r.id,r]));
  const graph=new Map();for(const r of interRoutes){const a=endS(r.from),b=endS(r.to);for(const [x,y] of [[a,b],[b,a]])(graph.get(x)??graph.set(x,[]).get(x)).push({to:y,route:r.id,km:r.lengthKm});}
  const path=(a,b)=>{const dist=new Map([[a,0]]),prev=new Map(),todo=new Set([a]);
    while(todo.size){let u=null;for(const x of todo)if(u==null||dist.get(x)<dist.get(u))u=x;todo.delete(u);if(u===b)break;
      for(const e of graph.get(u)??[]){const d=dist.get(u)+e.km;if(d<(dist.get(e.to)??Infinity)){dist.set(e.to,d);prev.set(e.to,{from:u,route:e.route});todo.add(e.to);}}}
    if(!prev.has(b)&&a!==b)return null;const out=[];for(let x=b;x!==a;x=prev.get(x).from)out.unshift(prev.get(x).route);return out;};
  const population=id=>(world.settlementProfiles??[]).find(s=>s.id===id)?.population??null;
  // 职业里写了 carry：本人的 professions 里有 labor 含 carry 的职业，或职业描述（occupation）命中这类职业的名字或别名。
  const carryProfs=(world.professions??[]).filter(p=>(p.labor??[]).includes('carry'));
  const carryLabelled=id=>{const n=npc.get(id),r=resident.get(id);const profs=[...(n?.professions??[]),...(r?.professions??[])];
    if(profs.some(p=>carryProfs.some(c=>c.id===p)))return true;
    const occ=String(n?.occupation??r?.occupation??'');return carryProfs.some(c=>[c.name,...(c.aliases??[])].some(a=>a&&occ.includes(a)));};
  const occupationOf=id=>npc.get(id)?.occupation??resident.get(id)?.occupation??null;
  return {settlementIds,settlementOf,endS,homeOf,ownerSettlement,interRoutes,interRouteIds,routeById,routePath:path,population,carryLabelled,occupationOf,carryProfessions:carryProfs.map(p=>p.id),isNpc:id=>npc.has(id)||resident.has(id),isHousehold:id=>hh.has(id)};
}

// ---- 账本 ----
export const parse=key=>{const [owner,resource,purpose]=key.split('|');return {owner,resource,purpose};};
export const isVirtual=owner=>/^(src|sink):/.test(owner);
export const PRODUCTION=new Set(['src:craft','src:harvest','src:husbandry','src:regrowth','src:birth','src:gather','src:fishing','src:mining']);
export function ledgerDelta(before,after){
  const acc=new Map(),flow=new Map();
  const a0=before.ledger?.accounts??{},a1=after.ledger?.accounts??{};
  for(const k of new Set([...Object.keys(a0),...Object.keys(a1)])){const d=(a1[k]??0)-(a0[k]??0);if(d)acc.set(k,d);}
  const f0=before.ledger?.flows??{},f1=after.ledger?.flows??{};
  for(const k of new Set([...Object.keys(f0),...Object.keys(f1)])){const d=(f1[k]??0)-(f0[k]??0);if(d)flow.set(k,d);}
  return {acc,flow};
}
// 某人某物在账本上的持有（各用途合计，不含托管）。
export function holding(doc,owner,item){let n=0;for(const [k,v] of Object.entries(doc.ledger?.accounts??{})){if(!k.startsWith(owner+'|'+item+'|')||/escrow/.test(k))continue;n+=v;}return n;}
export const stock=(doc,owner,item)=>Math.max(holding(doc,owner,item),owner==='player'?inv(doc.state,item):inv(doc.state.npcs?.[owner],item));

// ---- 统计 ----
// 单侧二项（p=0.5）正态近似：k/n 的下界 k/n − 2.5·√(0.25/n) 须 > 0.5（全数成立也至少要 n ≥ 7）。
export const binom25=(k,n)=>n>0&&k/n-2.5*Math.sqrt(0.25/n)>0.5;
export const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
export const sd=a=>{if(a.length<2)return 0;const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1));};
// 配对差 d：mean(d) > 2.5·sd(d)/√n（sd=0 时 mean>0 即成立）。
export const paired25=d=>d.length>0&&mean(d)>2.5*sd(d)/Math.sqrt(d.length);
