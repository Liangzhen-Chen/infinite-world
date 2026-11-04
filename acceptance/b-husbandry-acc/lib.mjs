// 驱动层：只经引擎公开入口（createCharacter / reduce / applyPatches）与工具面（world_act、world_propose、world_time）。
// 观察只读文档（state、ledger、holdings）与 tests/helpers 的账本守恒辅助，不调规律层内部函数。
// 前提（玩家手里有多少饲料）用 tools/a3-score.mjs 的 applyIntentSetup，与 tests/s5-06 的写法相同；它只设前提，不造结果。
import fs from 'node:fs/promises';
import {execSync} from 'node:child_process';
const norm=p=>p.split(String.fromCharCode(92)).join('/').replace(/[/]$/,'');
// 基线树：ACC_REPO 指定，默认 S5FIX 工作树（t-s5fix@58e8d709）。
export const REPO=norm(process.env.ACC_REPO??'F:/dnd-wt/S5FIX');
export const HERE='F:/dnd-tmp/b-husbandry-acc';
export const MUT=`${HERE}/mut`;
const R=`file:///${REPO}/`;
process.chdir(REPO);
const {loadWorld}=await import(R+'tools/load-world.mjs');
const {WorldEngine}=await import(R+'server-plugin/engine.mjs');
const {applyPatches}=await import(R+'server-plugin/storage.mjs');
const {auditLedger}=await import(R+'server-plugin/ledger.mjs');
const {applyIntentSetup}=await import(R+'tools/a3-score.mjs');
export const {conservation}=await import(R+'tests/helpers/ledger-audit.mjs');
export const world=await loadWorld();
const seed=JSON.parse(await fs.readFile(`${REPO}/tests/fixtures/legacy/seed.json`,'utf8'));
export const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));
export {applyPatches,auditLedger,loadWorld};
let counter=0;
export function newGame(id='b',w=world){
  const engine=new WorldEngine(structuredClone(w));
  return {engine,doc:engine.createCharacter(seed,{},id),id,log:[]};
}
// 仓库副本：复制 ACC_REPO（不含 node_modules、.git、SillyTavern），node_modules 用 junction 连回。返回副本里 world/ 的路径。
export function syncMutCopy(){
  const src=REPO.replaceAll('/','\\'),dst=MUT.replaceAll('/','\\');
  try{execSync(`robocopy "${src}" "${dst}" /MIR /XD "${src}\\node_modules" "${src}\\.git" "${src}\\SillyTavern" "${dst}\\node_modules" /XF .git /NFL /NDL /NJH /NJS /NP /R:1 /W:1`,{stdio:'ignore'});}
  catch(e){if((e.status??0)>=8)throw e;}
  try{execSync(`cmd /c if not exist "${dst}\\node_modules" mklink /J "${dst}\\node_modules" "${src}\\node_modules"`,{stdio:'ignore'});}catch{}
  return `${MUT}/world`;
}
const QUIET=new Set(['emit','time']);
export async function call(ctx,tool,args,{commit=true}={}){
  const eventId=`${ctx.id}-${++counter}`,input={tool,args,eventId};
  let out;
  try{out=await ctx.engine.reduce(ctx.doc,input);}
  catch(e){return {status:'rejected',reason:String(e?.message??e),code:e?.code??'THROW',applied:[],input};}
  const result=out.result??{},receipt=result.receipt??out.receipt??{};
  const rejected=receipt.status==='rejected'||(result.ok===false&&!out.patches?.length)||result.success===false;
  const applied=(receipt.applied??[]).map(a=>a.op).filter(op=>op&&!QUIET.has(op));
  const missing=(receipt.missing??[]).filter(m=>m&&m!==receipt.reason);
  const reason=receipt.reason??result.reason??result.message??null;
  const res={status:rejected?'rejected':'committed',reason:reason&&[reason,...missing].join(' ／ '),code:receipt.code??null,routed:receipt.routed??null,applied,patches:out.patches?.length??0,result,input};
  if(commit&&out.patches?.length){ctx.doc=applyPatches(ctx.doc,out.patches);}
  ctx.log.push({tool,args,status:res.status,reason:res.reason});
  return res;
}
export const act=(ctx,action,slots={},o)=>call(ctx,'world_act',{action,slots},o);
export const propose=(ctx,intent,effects,extra={},o)=>call(ctx,'world_propose',{intent,effects,...extra},o);
export const wait=(ctx,minutes)=>call(ctx,'world_time',{minutes});
// 前提：设定玩家手里各物品的数量（applyIntentSetup.inventory）。
export function premise(ctx,setup){
  const out=applyIntentSetup(ctx.engine,ctx.doc,setup);
  ctx.doc=out.document;return out.setupUnmet??[];
}
export const say=r=>r?`${r.status}${r.reason?'：'+r.reason:''}${r.routed?` [${r.routed}]`:''}`:'无';
export const presentNpcs=doc=>Object.entries(doc.state.npcs).filter(([,n])=>n.location===doc.state.location&&!(n.hp<=0)).map(([id])=>id);
