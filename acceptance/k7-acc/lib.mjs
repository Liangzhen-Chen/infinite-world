// 驱动层：只经引擎公开入口（createCharacter / reduce / applyPatches）与工具面（world_act、world_propose）。
// 观察只读文档（state、ledger、holdings）与 tests/helpers 的账本守恒辅助，不调规律层内部函数。
import fs from 'node:fs/promises';
// 基线树：K7_REPO 指定（默认 S5FIX 工作树，主会话 11-04 定）。
export const REPO=(process.env.K7_REPO??'F:/dnd-wt/S5FIX').split(String.fromCharCode(92)).join('/').replace(/[/]$/,'');
const R=`file:///${REPO}/`;
process.chdir(REPO);
const {loadWorld}=await import(R+'tools/load-world.mjs');
const {WorldEngine}=await import(R+'server-plugin/engine.mjs');
const {applyPatches}=await import(R+'server-plugin/storage.mjs');
const {auditLedger}=await import(R+'server-plugin/ledger.mjs');
export const world=await loadWorld();
const seed=JSON.parse(await fs.readFile(`${REPO}/tests/fixtures/legacy/seed.json`,'utf8'));
export const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));
export {applyPatches,auditLedger};
let counter=0;
export function newGame(id='k7'){
  const engine=new WorldEngine(structuredClone(world));
  return {engine,doc:engine.createCharacter(seed,{},id),id,log:[]};
}
export const fork=(ctx,suffix)=>({engine:ctx.engine,doc:ctx.doc,id:`${ctx.id}-${suffix}`,log:[]});
const QUIET=new Set(['emit','time']);
// 一次真实调用。commit=false 时只读结果不落盘（每格从同一基线独立试）。
export async function call(ctx,tool,args,{commit=true}={}){
  const eventId=`${ctx.id}-${++counter}`,input={tool,args,eventId};
  let out;
  try{out=await ctx.engine.reduce(ctx.doc,input);}
  catch(e){return {status:'rejected',reason:String(e?.message??e),code:e?.code??'THROW',applied:[],trimmed:[],input};}
  const result=out.result??{},receipt=result.receipt??out.receipt??{};
  const rejected=receipt.status==='rejected'||(result.ok===false&&!out.patches?.length);
  const applied=(receipt.applied??[]).map(a=>a.op).filter(op=>op&&!QUIET.has(op));
  const missing=(receipt.missing??[]).filter(m=>m&&m!==receipt.reason);
  const res={status:rejected?'rejected':'committed',reason:(receipt.reason??result.reason??null)&&[receipt.reason??result.reason,...missing].join(' ／ '),code:receipt.code??null,
    routed:receipt.routed??null,applied,appliedFull:(receipt.applied??[]).filter(a=>a.op&&!QUIET.has(a.op)),trimmed:(receipt.trimmed??[]).map(t=>({op:t.effect?.op,reason:t.reason})),patches:out.patches?.length??0,receipt,result,input};
  if(commit&&out.patches?.length){res.before=ctx.doc;ctx.doc=applyPatches(ctx.doc,out.patches);res.after=ctx.doc;}
  ctx.log.push({tool,args,status:res.status,reason:res.reason});
  return res;
}
export const act=(ctx,action,slots={},o)=>call(ctx,'world_act',{action,slots},o);
export const propose=(ctx,intent,effects,extra={},o)=>call(ctx,'world_propose',{intent,effects,...extra},o);
export const audit=ctx=>auditLedger(ctx.doc.ledger);
export const holdingsOf=(doc,f={})=>Object.values(doc.holdings?.rows??{}).filter(r=>r.until===undefined&&Object.entries(f).every(([k,v])=>r[k]===v));
export const presentNpcs=doc=>Object.entries(doc.state.npcs).filter(([,n])=>n.location===doc.state.location&&!(n.hp<=0)).map(([id])=>id);
export const acct=(owner,resource,purpose)=>`${owner}|${resource}|${purpose??(resource==='coin_river'?'purse':'inventory')}`;
export const qty=(doc,key)=>doc.ledger?.accounts?.[key]??0;
// 真实追踪：在栖地反复追踪某物种直到出现一只实例（每次都是真实耗时的动作）。
export async function trackOne(ctx,species,tries=12){
  for(let i=0;i<tries;i++){
    const before=new Set(Object.keys(ctx.doc.state.creatures??{}));
    await act(ctx,'core:wildlife.track',{species});
    const fresh=Object.keys(ctx.doc.state.creatures??{}).find(id=>!before.has(id)&&ctx.doc.state.creatures[id].species===species);
    if(fresh)return fresh;
  }
  return null;
}
