// 驱动层：只经引擎公开入口（createCharacter / reduce / applyPatches）与工具面（world_act、world_propose）。
// 观察只读文档（state、ledger、holdings）与 tests/helpers 的账本守恒辅助，不调规律层内部函数。
// 仓库由环境变量 ACC_REPO 指定（默认基线 S5FIX 工作树）。loadRepo 也用于通用性变异副本。
import fs from 'node:fs/promises';
const norm=p=>p.split(String.fromCharCode(92)).join('/').replace(/[/]$/,'');
export const REPO=norm(process.env.ACC_REPO??'F:/dnd-wt/S5FIX');
export async function loadRepo(repo){
  repo=norm(repo);const R=`file:///${repo}/`;process.chdir(repo);
  const {loadWorld}=await import(R+'tools/load-world.mjs');
  const {WorldEngine}=await import(R+'server-plugin/engine.mjs');
  const {applyPatches}=await import(R+'server-plugin/storage.mjs');
  const {auditLedger}=await import(R+'server-plugin/ledger.mjs');
  const {conservation}=await import(R+'tests/helpers/ledger-audit.mjs');
  const world=await loadWorld(`${repo}/world`);
  const seed=JSON.parse(await fs.readFile(`${repo}/tests/fixtures/legacy/seed.json`,'utf8'));
  return {repo,world,WorldEngine,applyPatches,auditLedger,conservation,seed};
}
export const base=await loadRepo(REPO);
export const {world,auditLedger,conservation}=base;
let counter=0;
export function newGame(id='k6',env=base){
  const engine=new env.WorldEngine(structuredClone(env.world));
  return {engine,env,doc:engine.createCharacter(env.seed,{},id),id,log:[]};
}
export const fork=(ctx,suffix)=>({engine:ctx.engine,env:ctx.env,doc:ctx.doc,id:`${ctx.id}-${suffix}`,log:[]});
const QUIET=new Set(['emit','time']);
// 一次真实调用。commit=false 时只读结果不落盘。
export async function call(ctx,tool,args,{commit=true}={}){
  const eventId=`${ctx.id}-${++counter}`,input={tool,args,eventId};
  let out;
  try{out=await ctx.engine.reduce(ctx.doc,input);}
  catch(e){return {status:'rejected',reason:String(e?.message??e),code:e?.code??'THROW',applied:[],trimmed:[],input,eventId};}
  const result=out.result??{},receipt=result.receipt??out.receipt??{};
  const rejected=receipt.status==='rejected'||(result.ok===false&&!out.patches?.length);
  const applied=(receipt.applied??[]).map(a=>a.op).filter(op=>op&&!QUIET.has(op));
  const missing=(receipt.missing??[]).filter(m=>m&&m!==receipt.reason);
  const res={status:rejected?'rejected':'committed',reason:(receipt.reason??result.reason??null)&&[receipt.reason??result.reason,...missing].join(' ／ '),code:receipt.code??null,
    routed:receipt.routed??null,applied,trimmed:(receipt.trimmed??[]).map(t=>({op:t.effect?.op,reason:t.reason})),patches:out.patches?.length??0,result,input,eventId};
  if(commit&&out.patches?.length){res.before=ctx.doc;ctx.doc=ctx.env.applyPatches(ctx.doc,out.patches);res.after=ctx.doc;}
  ctx.log.push({tool,args,status:res.status,reason:res.reason});
  return res;
}
export const act=(ctx,action,slots={},o)=>call(ctx,'world_act',{action,slots},o);
export const propose=(ctx,intent,effects,extra={},o)=>call(ctx,'world_propose',{intent,effects,...extra},o);
export const holdingsOf=(doc,f={})=>Object.values(doc.holdings?.rows??{}).filter(r=>r.until===undefined&&Object.entries(f).every(([k,v])=>r[k]===v));
export const presentNpcs=doc=>Object.entries(doc.state.npcs).filter(([,n])=>n.location===doc.state.location&&!(n.hp<=0)).map(([id])=>id);
export const acct=(owner,resource,purpose)=>`${owner}|${resource}|${purpose??(resource==='coin_river'?'purse':'inventory')}`;
export const qty=(doc,key)=>doc.ledger?.accounts?.[key]??0;
