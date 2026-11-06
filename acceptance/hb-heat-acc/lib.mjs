// 卡 C 通用初加工链·独立验收驱动层。
// 只经引擎公开入口（createCharacter / reduce / applyPatches）与工具面（world_act、world_propose）驱动；
// 观察只读存档文档（state、ledger）与 tests/helpers/ledger-audit 的守恒对账；不调规律层内部函数，不读 server-plugin 的实现。
// 一个进程内可以先后打开两棵树（基线、变异副本）：每棵树用自己的文件 URL 导入，互不共享模块。
import fs from 'node:fs';
import path from 'node:path';

export const BASE=(process.env.ACC_REPO??'F:/dnd-wt/HEAT').split(String.fromCharCode(92)).join('/').replace(/[/]$/,'');
// 产物目录：ACC_OUT 指定，默认本脚本所在目录（Linux 上直接拷整个目录过去跑）。
export const OUT_DIR=(process.env.ACC_OUT??import.meta.dirname).split(String.fromCharCode(92)).join('/');
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
  T.newGame=(id='cp')=>{const engine=new WorldEngine(structuredClone(world));return {T,engine,doc:engine.createCharacter(seed,{},id),id,log:[]};};
  T.fork=(ctx,suffix)=>({T,engine:ctx.engine,doc:ctx.doc,id:`${ctx.id}-${suffix}`,log:[]});
  return T;
}

// 一次真实调用（与 k7 验收包同一写法）。
export async function call(ctx,tool,args,{commit=true}={}){
  const eventId=`${ctx.id}-${++counter}`,input={tool,args,eventId};
  let out;
  try{out=await ctx.engine.reduce(ctx.doc,input);}
  catch(e){return {status:'rejected',reason:String(e?.message??e),code:e?.code??'THROW',applied:[],input};}
  const result=out.result??{},receipt=result.receipt??out.receipt??{};
  const rejected=receipt.status==='rejected'||(result.ok===false&&!out.patches?.length);
  const applied=(receipt.applied??[]).map(a=>a.op).filter(op=>op&&!QUIET.has(op));
  const missing=(receipt.missing??[]).filter(m=>m&&m!==receipt.reason);
  const reason=(receipt.reason??result.reason??null)&&[receipt.reason??result.reason,...missing].join(' ／ ');
  const res={status:rejected?'rejected':'committed',reason,code:receipt.code??null,routed:receipt.routed??null,applied,patches:out.patches?.length??0,result,input};
  if(commit&&out.patches?.length){res.before=ctx.doc;ctx.doc=ctx.T.applyPatches(ctx.doc,out.patches);res.after=ctx.doc;}
  ctx.log.push({tool,args,status:res.status,reason:res.reason});
  return res;
}
export const act=(ctx,action,slots={},o)=>call(ctx,'world_act',{action,slots},o);
export const propose=(ctx,intent,effects,extra={},o)=>call(ctx,'world_propose',{intent,effects,...extra},o);
export const say=r=>r?`${r.status}${r.reason?'：'+r.reason:''}${r.routed?` [${r.routed}]`:''}`:'无';
export const at=async(c,dest)=>(c.doc.state.location===dest?null:act(c,'core:move',{destination:dest}));
export const inv=(holder,item)=>holder?.inventory?.[item]?.quantity??holder?.inventory?.[item]??0;
export const pinv=(doc,item)=>inv(doc.state,item);

// —— 账本观察 ——
// 账户键 owner|resource|purpose；源 src:*，汇 sink:*。流量是自开局起的累计值，浸泡取首尾差。
export const parse=k=>{const [owner,resource,purpose]=k.split('|');return {owner,resource,purpose};};
export function flowDiff(a,b){const fa=a.ledger?.flows??{},fb=b.ledger?.flows??{},out={};for(const k of new Set([...Object.keys(fa),...Object.keys(fb)])){const n=(fb[k]??0)-(fa[k]??0);if(n)out[k]=n;}return out;}
export const craftsSince=(a,b)=>(b.ledger?.crafts??[]).slice((a.ledger?.crafts??[]).length);
// 不算真实产出的来源：开局存量、凭空进货、漂移补足。
export const FAKE_SRC=/^src:(genesis|import|drift)/;
// 做工者：从制作记录推出（玩家事件编号以存档编号开头；NPC 自主事件编号里带 NPC 编号）。
export function makerOf(rec,doc,ctxId){
  if(rec.maker)return rec.maker;
  const ev=String(rec.eventId??'');
  if(ctxId&&ev.startsWith(ctxId+'-'))return 'player';
  const ids=Object.keys(doc.state.npcs).filter(id=>ev.includes(id)).sort((x,y)=>y.length-x.length);
  return ids[0]??null;
}

// —— 由数据推出的集合（读 world/ 数据，不读实现） ——
export function derive(world){
  const items=Object.fromEntries(Object.values(world.items).map(i=>[i.id,i]));
  const recipes=Object.values(world.recipes);
  const producedBy={};for(const r of recipes){for(const o of [r.output?.item,...(r.byproducts??[]).map(b=>b.item)].filter(Boolean))(producedBy[o]??=[]).push(r.id);}
  const toolSet=new Set(recipes.flatMap(r=>r.tools??[]));
  for(const i of Object.values(items))if((i.tags??[]).includes('tool'))toolSet.add(i.id);
  // 规则与物种数据里以 tool / tools 字段被用作工具的物品（采矿镐、农具、取材刀……）。
  const walk=(n,k)=>{if(Array.isArray(n))n.forEach(x=>walk(x,k));else if(n&&typeof n==='object')for(const [kk,v] of Object.entries(n))walk(v,kk);else if(typeof n==='string'&&/^tools?$/.test(k??'')&&items[n])toolSet.add(n);};
  walk(world.rules);walk(world.monsters);
  return {items,recipes,producedBy,toolSet};
}
// 卡点名的九种初加工产物。羊皮纸、墨、铁、麻线、木板、木炭、皮革、面粉按现有物品；纸 = 带 paper 性状、不是书、不是羊皮纸、且作为配方投入的物品（从数据推出）。
export function categories(D){
  const asMaterial=new Set(D.recipes.flatMap(r=>(r.materials??[]).map(m=>m.item)));
  const paper=Object.values(D.items).filter(i=>(i.tags??[]).includes('paper')&&!(i.tags??[]).includes('book')&&i.id!=='item_parchment'&&asMaterial.has(i.id)).map(i=>i.id);
  return {
    '羊皮纸':['item_parchment'],
    '墨':['item_lampblack','item_soot_ink'],
    '铁':['item_iron'],
    '麻线':['item_hemp_thread'],
    '木板':['item_pine_board'],
    '木炭':['item_charcoal'],
    '皮革':['item_tanned_leather','item_goat_skin'],
    '面粉':['item_oat_flour','item_rye_flour'],
    '纸':paper,
  };
}
// 制成品 = 任何配方的产物或副产物 ∪ 卡点名的九类初加工产物。其余是自然物。
export function manufactured(D){const s=new Set(Object.keys(D.producedBy));for(const ids of Object.values(categories(D)))for(const i of ids)s.add(i);return s;}

// —— 产出追踪 ——
// 某物品在一段时间里的"真实产出" = 非开局、非进货、非漂移的源流入；若它是制成品，据点再生（src:regrowth）也不算。
export function realIn(flows,item,M){let n=0;const by={};for(const [k,v] of Object.entries(flows)){const {owner,resource}=parse(k);if(resource!==item||!owner.startsWith('src:')||v<=0)continue;if(FAKE_SRC.test(owner))continue;if(M.has(item)&&owner==='src:regrowth')continue;n+=v;by[owner]=(by[owner]??0)+v;}return {n,by};}
// 追到"配方 + 自然投入 + 劳动"：产出它的每条制作记录都有做工者；每种投入在同期的真实产出 ≥ 制作消耗；制成品投入递归同样要求。
export function trace(item,{flows,crafts,doc,M,ctxId},seen=new Set()){
  if(seen.has(item))return {ok:true,cycle:item};
  seen=new Set([...seen,item]);
  const recs=crafts.filter(c=>(c.outputs?.[item]??0)>0);
  const produced=recs.reduce((s,c)=>s+c.outputs[item],0);
  const ri=realIn(flows,item,M);
  // 自然物：取自据点存量、林木、水、猎获、农事等都算自然投入；只要同期没有凭空进货（src:import）。
  if(!M.has(item)){const imp=Object.entries(flows).filter(([k,v])=>v>0&&parse(k).resource===item&&parse(k).owner.startsWith('src:import')).reduce((s,[,v])=>s+v,0);return {item,natural:true,ok:imp===0,imported:imp,realIn:ri.n,by:ri.by};}
  if(!recs.length)return {item,ok:false,why:'浸泡期内没有任何制作记录产出它',realIn:ri.n,by:ri.by};
  const noMaker=recs.filter(c=>!makerOf(c,doc,ctxId)).length;
  const consumed={};for(const c of crafts)for(const [i,q] of Object.entries(c.inputs??{}))consumed[i]=(consumed[i]??0)+q;
  const inputs=[...new Set(recs.flatMap(c=>Object.keys(c.inputs??{})))];
  // 制成品投入：同期真实产出须覆盖制作消耗（不靠开局存量）；自然投入：不靠进货即可。
  const sub=inputs.map(i=>{const r=realIn(flows,i,M),t=trace(i,{flows,crafts,doc,M,ctxId},seen),nat=!M.has(i),covered=nat||r.n>=(consumed[i]??0);return {item:i,natural:nat,realIn:r.n,consumedByCrafts:consumed[i]??0,covered,ok:t.ok&&covered,detail:t.ok?undefined:(t.why??t)};});
  const makers=[...new Set(recs.map(c=>makerOf(c,doc,ctxId)).filter(Boolean))].slice(0,6);
  return {item,produced,recipes:[...new Set(recs.map(c=>c.recipe))],makers,noMaker,inputs:sub,ok:produced>0&&!noMaker&&inputs.length>0&&sub.every(s=>s.ok)};
}

// —— 时间推进 ——
export async function soak(ctx,days,onDay){
  for(let d=0;d<days;d++){const r=await act(ctx,'core:time',{minutes:1440});if(r.status!=='committed')return {ok:false,day:d,reason:say(r)};if(onDay)await onDay(d,ctx);}
  return {ok:true};
}
export const argDays=(def=3)=>{const i=process.argv.indexOf('--days');return i>=0?Number(process.argv[i+1]):def;};
export const has=f=>process.argv.includes(f);
export const write=(name,data)=>fs.writeFileSync(path.join(OUT_DIR,name),typeof data==='string'?data:JSON.stringify(data,null,1));
