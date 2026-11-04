// 卡 F 物品属性由规律派生（K4）·独立验收驱动层。
// 只经引擎公开入口（createCharacter / reduce / applyPatches）与工具面（world_act、world_field 等公开工具）驱动；
// 观察只读存档文档（state、ledger、holdings）与 tests/helpers/ledger-audit 的守恒对账；不调规律层内部函数，不读 server-plugin 的实现。
// 一个进程内可以先后打开两棵树（基线、变异副本）：每棵树用自己的文件 URL 导入，互不共享模块。
import fs from 'node:fs';

export const BASE=(process.env.ACC_REPO??'F:/dnd-wt/S5FIX').split(String.fromCharCode(92)).join('/').replace(/[/]$/,'');
// 产物目录：缺省为脚本所在目录下的 out/（Linux 上不用改代码），环境变量 ACC_OUT 可覆盖。
import {fileURLToPath} from 'node:url';
export const OUT_DIR=(process.env.ACC_OUT??fileURLToPath(new URL('./out',import.meta.url))).split(String.fromCharCode(92)).join('/').replace(/[/]$/,'');
export const MUT=`${OUT_DIR}/mut`;
const QUIET=new Set(['emit','time']);
let counter=0;

export async function openRepo(repo){
  repo=repo.split(String.fromCharCode(92)).join('/').replace(/[/]$/,'');
  process.chdir(repo);
  const R=`file:///${repo}/`;
  const {loadWorld}=await import(R+'tools/load-world.mjs');
  const {WorldEngine}=await import(R+'server-plugin/engine.mjs');
  const {applyPatches}=await import(R+'server-plugin/storage.mjs');
  const {auditLedger}=await import(R+'server-plugin/ledger.mjs');
  const {conservation}=await import(R+'tests/helpers/ledger-audit.mjs');
  const world=await loadWorld();
  const seed=JSON.parse(fs.readFileSync(`${repo}/tests/fixtures/legacy/seed.json`,'utf8'));
  const T={repo,world,applyPatches,auditLedger,conservation};
  T.newGame=(id='fa')=>{const engine=new WorldEngine(structuredClone(world));return {T,engine,doc:engine.createCharacter(seed,{},id),id,log:[]};};
  return T;
}
export const fork=(ctx,suffix)=>({T:ctx.T,engine:ctx.engine,doc:ctx.doc,id:`${ctx.id}-${suffix}`,log:[]});

// 一次真实调用。commit=false 时只读结果不落盘。
export async function call(ctx,tool,args,{commit=true}={}){
  const eventId=`${ctx.id}-${++counter}`,input={tool,args,eventId};
  let out;
  try{out=await ctx.engine.reduce(ctx.doc,input);}
  catch(e){return {status:'rejected',reason:String(e?.message??e),code:e?.code??'THROW',applied:[],trimmed:[],result:{},input};}
  const result=out.result??{},receipt=result.receipt??out.receipt??{};
  const rejected=receipt.status==='rejected'||(result.ok===false&&!out.patches?.length);
  const applied=(receipt.applied??[]).map(a=>a.op).filter(op=>op&&!QUIET.has(op));
  const missing=(receipt.missing??[]).filter(m=>m&&m!==receipt.reason);
  const res={status:rejected?'rejected':'committed',reason:(receipt.reason??result.reason??null)&&[receipt.reason??result.reason,...missing].join(' ／ '),code:receipt.code??null,
    routed:receipt.routed??null,applied,appliedFull:(receipt.applied??[]).filter(a=>a.op&&!QUIET.has(a.op)),patches:out.patches?.length??0,result,input};
  if(commit&&out.patches?.length){ctx.doc=ctx.T.applyPatches(ctx.doc,out.patches);}
  ctx.log.push({tool,args,status:res.status,reason:res.reason});
  return res;
}
export const act=(ctx,action,slots={},o)=>call(ctx,'world_act',{action,slots},o);
export const say=r=>r?`${r.status}${r.reason?'：'+r.reason:''}`:'无';
export const qtyOf=(inv,k)=>{const v=inv?.[k];return typeof v==='number'?v:v?.quantity??0;};
export const have=(ctx,k)=>qtyOf(ctx.doc.state.inventory,k);

// 守恒：账本审计为空，且每种资源 Δ总量 = 源净流入 − 汇流出（tests/helpers/ledger-audit.conservation）。
export function books(ctx,before){
  const L=ctx.doc.ledger;if(!L)return {ok:true,note:'账本尚未建立（未跨日）'};
  const a=ctx.T.auditLedger(L),k=before?.ledger?ctx.T.conservation(ctx.engine,before,ctx.doc):[];
  return {ok:!a.length&&!k.length,audit:a.slice(0,3),conservation:k.slice(0,3)};
}

// —— 真实取得 ——
export async function go(ctx,dest){if(ctx.doc.state.location===dest)return null;return act(ctx,'core:move',{destination:dest});}
// 向世界里任何库存里有该物品的 NPC 买；对方不在或不营业时，过一个时辰再找（NPC 会按作息走动），最多 tries 次。
export async function buy(ctx,item,n=1,{tries=16,prefer=null}={}){
  const log=[];
  for(let i=0;i<tries;i++){
    const sellers=Object.entries(ctx.doc.state.npcs).filter(([,x])=>qtyOf(x.inventory,item)>=n&&!(x.hp<=0))
      .sort((a,b)=>(b[0]===prefer)-(a[0]===prefer)||(b[1].location===ctx.doc.state.location)-(a[1].location===ctx.doc.state.location));
    if(!sellers.length){log.push(`世界里没有 NPC 库存有 ${item}×${n}`);break;}
    for(const [id,x] of sellers.slice(0,3)){
      const m=await go(ctx,x.location);if(m&&m.status!=='committed'){log.push(`去 ${x.location} 找 ${id}：${say(m)}`);continue;}
      const before=have(ctx,item),r=await act(ctx,'core:trade.buy',{seller:id,item,quantity:n});
      log.push(`向 ${id} 买 ${item}×${n}：${say(r)}`);
      if(have(ctx,item)>before)return {ok:true,log};
    }
    await act(ctx,'core:time',{minutes:60,activity:'等待'});
  }
  return {ok:false,log};
}
export async function learn(ctx,recipe,teacher,{tries=24}={}){
  const log=[];
  for(let i=0;i<tries;i++){
    if(ctx.doc.state.recipes?.[recipe])return {ok:true,log};
    const t=ctx.doc.state.npcs[teacher];if(!t){log.push(`没有导师 ${teacher}`);break;}
    const m=await go(ctx,t.location);if(m&&m.status!=='committed')log.push(`去 ${t.location}：${say(m)}`);
    const r=await act(ctx,'core:learn',{entity:recipe,source:teacher,kind:'recipe'});log.push(`向 ${teacher} 学 ${recipe}：${say(r)}`);
    if(ctx.doc.state.recipes?.[recipe])return {ok:true,log};
    await act(ctx,'core:time',{minutes:60,activity:'等待'});
  }
  return {ok:!!ctx.doc.state.recipes?.[recipe],log};
}
// 按配方制作；检定失败时重试，最多 tries 次（每次都是真实耗时与耗料）。
// ensure：每次动手前把这些材料补到够（[[item,n],...]，向世界里的卖家买）；检定失败会耗掉材料，所以按次补。
export async function craft(ctx,recipe,station,{tries=8,ensure=[]}={}){
  const log=[];let last=null;
  for(let i=0;i<tries;i++){
    for(const [item,n] of ensure)if(have(ctx,item)<n){const b=await buy(ctx,item,n-have(ctx,item));log.push(...b.log);}
    if(station){const m=await go(ctx,station);if(m&&m.status!=='committed')log.push(`去 ${station}：${say(m)}`);}
    last=await act(ctx,'core:craft.manufacture',{recipe});log.push(`做 ${recipe}：${say(last)}${last.result?.degree?'（'+last.result.degree+'）':''}`);
    if(last.status==='committed'&&last.result?.success!==false)return {ok:true,log,r:last};
    if(last.status==='rejected'){if(!/缺少/.test(last.reason??'')||!ensure.length)break;const nm=id=>ctx.T.world.items.find(x=>x.id===id)?.name??id;const lack=ensure.filter(([item])=>(last.reason??'').includes(nm(item)));if(!lack.length)break;for(const [item] of lack){const b=await buy(ctx,item,1);log.push(...b.log);}}
  }
  return {ok:false,log,r:last};
}
// 休息到饱腹不高于 target（每次 6 小时），给"吃下去涨多少"留出量程。
export async function hungry(ctx,target=55,maxHours=96){
  for(let h=0;h<maxHours;h+=6){const s=ctx.doc.state.player.body?.satiety?.value??100;if(s<=target)break;await act(ctx,'core:time',{minutes:360,activity:'休息'});}
  return ctx.doc.state.player.body?.satiety?.value;
}
// 吃一份并量出体征变化：同一存档分两支，一支吃，一支原地休息同样时长；两支饱腹、口渴之差就是这一份的实际作用。
export async function eatProbe(ctx,item){
  const A=fork(ctx,'eat-'+item),r=await act(A,'core:eat.meal',{item});
  if(r.status!=='committed')return {item,edible:false,reason:r.reason,nutrition:null,dSat:0,dHyd:0};
  const mins=A.doc.state.minute-ctx.doc.state.minute,B=fork(ctx,'ref-'+item);await act(B,'core:time',{minutes:mins,activity:'休息'});
  const v=(c,k)=>c.doc.state.player.body?.[k]?.value??0;
  return {item,edible:true,reason:null,nutrition:r.result?.nutrition??null,minutes:mins,dSat:+(v(A,'satiety')-v(B,'satiety')).toFixed(3),dHyd:+(v(A,'hydration')-v(B,'hydration')).toFixed(3),satBefore:v(B,'satiety')};
}
