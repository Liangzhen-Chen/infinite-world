// 卡 SL 宰杀自家牲畜、活畜取毛·独立验收驱动层。
// 只经引擎公开入口（createCharacter / reduce / applyPatches）与工具面（world_farm / world_time / world_craft）驱动；
// 前提（畜群、工具、技能档、饲料）用 tools/a3-score.mjs 的 applyIntentSetup 与世界数据副本设定，结果只读存档与账本。
// 不读 server-plugin 的实现，不改仓库。
import fs from 'node:fs';
import path from 'node:path';

const fwd=s=>s.split(String.fromCharCode(92)).join('/').replace(/[/]$/,'');
export const BASE=fwd(process.env.ACC_REPO??'F:/dnd-wt/SLAU');
export const OUT_DIR=fwd(process.env.ACC_OUT??import.meta.dirname);
export const MUT=`${OUT_DIR}/mut`;
export const arg=(k,d)=>{const i=process.argv.indexOf(k);return i>=0?process.argv[i+1]:d;};
export const has=f=>process.argv.includes(f);
export const write=(name,data)=>fs.writeFileSync(path.join(OUT_DIR,name),typeof data==='string'?data:JSON.stringify(data,null,1));
let counter=0;

export async function openRepo(repo){
  repo=fwd(repo);
  process.chdir(repo);
  const R=`file:///${repo.replace(/^\//,'')}/`.replace('file:////','file:///');
  const imp=p=>import(process.platform==='win32'?R+p:'file://'+repo+'/'+p);
  const {loadRuntimeWorld}=await imp('tools/load-world.mjs');
  const {WorldEngine}=await imp('server-plugin/engine.mjs');
  const {applyPatches}=await imp('server-plugin/storage.mjs');
  const {applyIntentSetup}=await imp('tools/a3-score.mjs');
  const {reconcile}=await imp('tests/helpers/ledger-audit.mjs');
  const world=await loadRuntimeWorld(path.join(repo,'world'));
  const seed=JSON.parse(fs.readFileSync(`${repo}/tests/fixtures/legacy/seed.json`,'utf8'));
  const T={repo,world,applyPatches,applyIntentSetup,reconcile};
  // 开新档：herds 是追加到世界数据副本里的畜群行（数据），setup 是 applyIntentSetup 的前提。
  T.game=({herds=[],setup={},id='sl',mutateWorld}={})=>{
    const w=structuredClone(world);
    w.ecology.herds.push(...structuredClone(herds));
    mutateWorld?.(w);
    const engine=new WorldEngine(w);
    const ctx={T,engine,id,doc:engine.createCharacter(seed,{},`${id}-${++counter}`),log:[]};
    premise(ctx,{minute:1200,location:'loc_hw',...setup});
    return ctx;
  };
  return T;
}
export function premise(ctx,setup){
  const out=ctx.T.applyIntentSetup(ctx.engine,ctx.doc,setup);
  if(out.setupUnmet?.length)throw Error('前提未满足 '+JSON.stringify(out.setupUnmet));
  ctx.doc=out.document;return ctx;
}
export const fork=ctx=>({...ctx,doc:structuredClone(ctx.doc),log:[]});
// 一次调用。被拒返回 {ok:false,reason}；成功（含检定失败）提交补丁。
export async function call(ctx,tool,args,tag=''){
  const eventId=`${ctx.id}-${tag||'e'}-${++counter}`;
  const before=ctx.doc;
  try{
    const out=await ctx.engine.reduce(ctx.doc,{tool,args,eventId});
    if(out.patches?.length)ctx.doc=ctx.T.applyPatches(ctx.doc,out.patches);
    return {ok:true,result:out.result??{},before,patches:out.patches?.length??0,eventId};
  }catch(e){return {ok:false,reason:String(e?.message??e),before,eventId};}
}
export const farm=(ctx,args,tag)=>call(ctx,'world_farm',args,tag);
export const wait=(ctx,minutes,tag)=>call(ctx,'world_time',{minutes},tag);
// 同一前提重复，直到检定成功（检定按事件号定种子）。返回最后一次。
export async function untilSuccess(ctx,args,tag,max=40){
  let r;for(let i=0;i<max;i++){r=await farm(ctx,args,`${tag}${i}`);if(!r.ok)return r;if(r.result.success)return r;}
  return {...r,ok:false,reason:`${max} 次都没成功`};
}
export const inv=(doc,item)=>{const e=doc.state.inventory?.[item];return typeof e==='number'?e:(e?.quantity??0);};
export const flowSum=(doc,re)=>Object.entries(doc.ledger.flows).filter(([k])=>re.test(k)).reduce((n,[,v])=>n+v,0);
export const books=(ctx)=>{const r=ctx.T.reconcile(ctx.engine,ctx.doc);return {ok:!r.mismatches.length,mismatches:r.mismatches.slice(0,3)};};
export const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:NaN;
export const itemOf=(engine,id)=>engine.byId.get(id)??engine.world.items.find(i=>i.id===id);
export const kgOf=(engine,rows)=>rows.reduce((n,r)=>n+(r.quantity??r.amount??0)*(itemOf(engine,r.item)?.weight??0),0);
export const tagsOf=(engine,id)=>itemOf(engine,id)?.tags??[];
