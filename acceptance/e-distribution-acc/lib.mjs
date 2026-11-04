// 卡 E 分销与补货·独立验收驱动层。
// 只经引擎公开入口（createCharacter / reduce / applyPatches）与工具面（world_time、world_move、world_trade）驱动；
// 观察只读存档里的 state、ledger、records，以及测试里同样使用的只读价格投影 regionalTradeBase。不调规律层内部函数造结果。
import fs from 'node:fs/promises';
export const REPO=(process.env.ACC_REPO??'F:/dnd-wt/S5FIX').split(String.fromCharCode(92)).join('/').replace(/[/]$/,'');
const R=`file:///${REPO}/`;
process.chdir(REPO);
const {loadWorld}=await import(R+'tools/load-world.mjs');
const {WorldEngine}=await import(R+'server-plugin/engine.mjs');
const {applyPatches}=await import(R+'server-plugin/storage.mjs');
const {auditLedger,driftCounts}=await import(R+'server-plugin/ledger.mjs');
const {regionalTradeBase}=await import(R+'server-plugin/settlement-trade.mjs');
const ledgerHelpers=await import(R+'tests/helpers/ledger-audit.mjs');
export const world=await loadWorld();
const seed=JSON.parse(await fs.readFile(`${REPO}/tests/fixtures/legacy/seed.json`,'utf8'));
export {auditLedger,driftCounts};
export const conservation=ledgerHelpers.conservation;
export const DAY=1440;
let counter=0;
export function newGame(id='e-acc'){
  const engine=new WorldEngine(structuredClone(world));
  return {engine,doc:engine.createCharacter(seed,{},id),id,log:[]};
}
export async function call(ctx,tool,args){
  const eventId=`${ctx.id}-${++counter}`;
  let out;
  try{out=await ctx.engine.reduce(ctx.doc,{tool,args,eventId});}
  catch(e){const r={status:'rejected',reason:String(e?.message??e)};ctx.log.push({tool,args,...r});return r;}
  const result=out.result??{},receipt=result.receipt??out.receipt??{};
  const rejected=receipt.status==='rejected'||result.ok===false||!out.patches?.length;
  if(out.patches?.length)ctx.doc=applyPatches(ctx.doc,out.patches);
  const r={status:rejected?'rejected':'committed',reason:receipt.reason??result.reason??result.error??null,result};
  ctx.log.push({tool,args,status:r.status,reason:r.reason});
  return r;
}
// ---- 观察 ----
const SOURCE=/^src:/,SINK=/^sink:/;
export const parse=key=>{const [owner,resource,purpose]=key.split('|');return {owner,resource,purpose};};
export const isVirtual=owner=>SOURCE.test(owner)||SINK.test(owner);
export const PRODUCTION=new Set(['src:craft','src:harvest','src:husbandry','src:regrowth','src:birth']);
const locById=new Map(world.locations.map(l=>[l.id,l]));
// 位置 → 聚落：沿 parent 链向上，第一个出现在存档 settlements 里的祖先；没有则取根下一级祖先。
export function settlementOf(doc,place){
  let id=place,chain=[];
  for(let i=0;id&&i<20;i++){if(doc.state.settlements?.[id])return id;chain.push(id);id=locById.get(id)?.parent;}
  return chain.length>=2?chain[chain.length-2]:chain[0]??null;
}
// 账户持有人 → 所在位置：人看当前位置（无则住处），聚落/地点即本身。
export function placeOfOwner(doc,owner){
  const n=doc.state.npcs?.[owner];
  if(n)return n.location??world.npcs.find(x=>x.id===owner)?.location??null;
  if(owner==='player')return doc.state.location;
  if(locById.has(owner)||doc.state.settlements?.[owner])return owner;
  const hh=(world.households??[]).find(h=>h.id===owner);
  if(hh){const m=hh.members?.[0];return m?placeOfOwner(doc,m):hh.location??null;}
  return null;
}
export const settlementOfOwner=(doc,owner)=>{const p=placeOfOwner(doc,owner);return p?settlementOf(doc,p):null;};
// 某人某物在账本上的全部持有（各用途合计，不含托管）。
export function holding(doc,owner,item){
  let n=0;const a=doc.ledger?.accounts??{};
  for(const [k,v] of Object.entries(a)){if(!k.startsWith(owner+'|'+item+'|'))continue;if(/escrow/.test(k))continue;n+=v;}
  return n;
}
export const invQty=(doc,owner,item)=>{const v=doc.state.npcs?.[owner]?.inventory?.[item];return typeof v==='number'?v:v?.quantity??0;};
export const stock=(doc,owner,item)=>Math.max(holding(doc,owner,item),invQty(doc,owner,item));
export function regionalPrice(doc,engine,item,settlement){
  const d={document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc)};
  try{const v=regionalTradeBase(d,engine,item,settlement);return Number.isFinite(v)?v:null;}catch{return null;}
}
// 一步之间账本的逐账户、逐流水变化。
export function ledgerDelta(before,after){
  const acc=new Map(),flow=new Map();
  const a0=before.ledger?.accounts??{},a1=after.ledger?.accounts??{};
  for(const k of new Set([...Object.keys(a0),...Object.keys(a1)])){const d=(a1[k]??0)-(a0[k]??0);if(d)acc.set(k,d);}
  const f0=before.ledger?.flows??{},f1=after.ledger?.flows??{};
  for(const k of new Set([...Object.keys(f0),...Object.keys(f1)])){const d=(f1[k]??0)-(f0[k]??0);if(d)flow.set(k,d);}
  return {acc,flow};
}
export const writeJson=(p,v)=>fs.writeFile(p,JSON.stringify(v,null,1));
export const tradeSellers=()=>world.npcs.filter(n=>(n.serviceCatalog??[]).some(s=>s.kind==='trade')).map(n=>n.id);
export const storeKeepers=()=>new Set((world.rules.economy?.shops?.stores??[]).map(s=>s.keeper));
export const itemById=new Map(world.items.map(i=>[i.id,i]));
export const tradeable=id=>{const it=itemById.get(id);return !!it&&(it.basePrice??0)>0&&!(it.tags??[]).includes('coin');};
