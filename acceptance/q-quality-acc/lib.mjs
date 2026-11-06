// 卡 Q 手艺档位与品质链·独立验收驱动层。
// 只经引擎公开入口（createCharacter / reduce / applyPatches）与工具面（world_act）驱动；
// 观察只读存档（state、ledger）与 tests/helpers/ledger-audit 的守恒对账；不调规律层内部函数，不读 server-plugin 的实现。
// 运行时世界用 tools/load-world.mjs 的 loadRuntimeWorld。一个进程里可先后开基线树和变异树。
import fs from 'node:fs';
import path from 'node:path';

export const BASE=(process.env.ACC_REPO??'F:/dnd-wt/INT').split(String.fromCharCode(92)).join('/').replace(/[/]$/,'');
export const OUT_DIR=(process.env.ACC_OUT??import.meta.dirname).split(String.fromCharCode(92)).join('/');
export const MUT=`${OUT_DIR}/mut`;
const QUIET=new Set(['emit','time']);
let counter=0;

export async function openRepo(repo){
  repo=repo.split(String.fromCharCode(92)).join('/').replace(/[/]$/,'');
  process.chdir(repo);
  const R=`file:///${repo}/`;
  const {loadRuntimeWorld}=await import(R+'tools/load-world.mjs');
  const {WorldEngine}=await import(R+'server-plugin/engine.mjs');
  const {applyPatches}=await import(R+'server-plugin/storage.mjs');
  const {auditLedger}=await import(R+'server-plugin/ledger.mjs');
  const {conservation}=await import(R+'tests/helpers/ledger-audit.mjs');
  // 单件缺掉的用途以引擎的 unitLostUses 为准（只读：实例记的 lostUses，旧实例按手艺档推）；旧树没有它时退回读实例字段。
  let unitLostUses=null;try{({unitLostUses}=await import(R+'server-plugin/item-class.mjs'));}catch{}
  const world=await loadRuntimeWorld(path.join(repo,'world'));
  const seed=JSON.parse(fs.readFileSync(`${repo}/tests/fixtures/legacy/seed.json`,'utf8'));
  const {openLedger}=await import(R+'server-plugin/ledger.mjs');
  const T={repo,world,applyPatches,auditLedger,conservation,unitLostUses,openLedger};
  T.newGame=(id='q')=>{const engine=new WorldEngine(structuredClone(world));return {T,engine,doc:engine.createCharacter(seed,{},id),id,log:[]};};
  return T;
}

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
  const res={status:rejected?'rejected':'committed',reason,code:receipt.code??null,applied,patches:out.patches?.length??0,result,input};
  if(commit&&out.patches?.length){res.before=ctx.doc;ctx.doc=ctx.T.applyPatches(ctx.doc,out.patches);}
  ctx.log.push({tool,args,status:res.status,reason:res.reason});
  return res;
}
export const act=(ctx,action,slots={},o)=>call(ctx,'world_act',{action,slots},o);
export const say=r=>r?`${r.status}${r.reason?'：'+r.reason:''}`:'无';
export const at=async(c,dest)=>(c.doc.state.location===dest?null:act(c,'core:move',{destination:dest}));
export const inv=(holder,item)=>holder?.inventory?.[item]?.quantity??(typeof holder?.inventory?.[item]==='number'?holder.inventory[item]:0);
export const pinv=(doc,item)=>inv(doc.state,item);
export const sleepTill=(c,hour=8,minute=30)=>act(c,'core:time.sleep',{until:{dayOffset:1,hour,minute}});
export const argDays=(def=3)=>{const i=process.argv.indexOf('--days');return i>=0?Number(process.argv[i+1]):def;};
export const has=f=>process.argv.includes(f);
export const write=(name,data)=>fs.writeFileSync(path.join(OUT_DIR,name),typeof data==='string'?data:JSON.stringify(data,null,1));
// 两头都还没开账（其间没有任何记账的移动）时，conservation 会把"从零开账"当成凭空增量：这时按空流水比旧字段总量，必须不变。
export const books=(c,before)=>{const a=c.T.auditLedger(c.doc.ledger)??[],bare=d=>d.ledger?d:{...d,ledger:{flows:{}}};
  const k=!before?[]:(!before.ledger&&!c.doc.ledger)?c.T.conservation(c.engine,bare(before),bare(c.doc)):c.T.conservation(c.engine,before,c.doc);
  return {ok:!a.length&&!k.length,audit:a.slice(0,3),conservation:k.slice(0,3)};};
// —— 成长：向师傅学技能、学配方，逐日练习（都是真实动作；对方不接待就睡到次日早上再去） ——
const SERVE=/此刻不提供|不在场|不在此|作息|睡眠|服务时间|不接待/;
export async function learnSkill(c,skill,sources,steps=[]){
  const has=()=>!!c.doc.state.skills?.[skill];
  // 多轮：一轮都没学成（对方此刻不教、不在场、不在教的时段），睡到次日不同钟点再问。
  const wake=[null,[9,0],[10,30],[14,0]];for(let round=0;round<wake.length&&!has();round++){if(wake[round])await sleepTill(c,...wake[round]);
  for(const id of sources){
    for(let i=0;i<10&&!has();i++){
      const n=c.doc.state.npcs[id];if(!n)break;await at(c,n.location);
      const l=await act(c,'core:learn',{entity:skill,source:id});
      if(l.status==='committed')continue;
      steps.push(`向 ${id} 学 ${skill}：${say(l)}`);
      if(SERVE.test(l.reason??'')){await sleepTill(c);continue;}
      break;
    }
    if(has()){steps.push(`学会 ${skill}（${id}）`);return true;}
  }}
  return has();
}
export async function learnRecipe(c,recipe,sources,steps=[]){
  const has=()=>!!c.doc.state.recipes?.[recipe];
  for(const id of sources){
    for(let i=0;i<10&&!has();i++){
      const n=c.doc.state.npcs[id];if(!n)break;await at(c,n.location);
      const l=await act(c,'core:learn',{kind:'recipe',entity:recipe,source:id,mode:'acquire'});
      if(l.status==='committed')continue;
      steps.push(`向 ${id} 学 ${recipe}：${say(l)}`);
      if(SERVE.test(l.reason??'')){await sleepTill(c);continue;}
      break;
    }
    if(has()){steps.push(`学会 ${recipe}（${id}）`);return true;}
  }
  return false;
}
export const prof=(c,skill)=>c.doc.state.skills?.[skill]?.proficiency??0;
export async function practiceTo(c,skill,target,maxDays,steps=[]){
  let d=0;
  for(;d<maxDays&&prof(c,skill)<target;d++){
    let p;for(let i=0;i<3;i++){p=await act(c,'core:practice.session',{skill,minutes:180});if(p.status!=='committed')break;}
    if(p?.status!=='committed'&&d===0){steps.push(`练 ${skill}：${say(p)}`);break;}
    await sleepTill(c,7,0);
  }
  steps.push(`练 ${skill} ${d} 天，熟练度 ${prof(c,skill)}`);
  return prof(c,skill)>=target;
}
// —— 取得：先向持有人买（对方不接待就等一个时辰再去），再去带该资源的据点采 ——
const near=(loc,home)=>{const code=String(home??'').split('_')[1];return code&&String(loc??'').split('_')[1]===code?0:1;};
export async function obtain(c,item,n,steps=[],{home='loc_hw',exclude=[],wide=false}={}){
  const W=c.T.world;
  if(pinv(c.doc,item)>=n)return true;
  // c.dumped[item]：把降了档的这种料卖给过的人，不再向他买回这种料（买回来的会是同一批降档料）。
  const ex=[...exclude,...(c.dumped?.[item]??[])];
  const all=Object.entries(c.doc.state.npcs).filter(([id,p])=>inv(p,item)>0&&!(p.hp<=0)&&p.location&&!ex.includes(id));
  const local=all.filter(([,p])=>near(p.location,home)===0),far=all.filter(([,p])=>near(p.location,home)!==0).slice(0,2);
  const buyFrom=async list=>{for(const [id] of list){
    let waits=0;
    for(let k=0;k<n+4&&pinv(c.doc,item)<n;k++){
      const p=c.doc.state.npcs[id];if(!p?.location||inv(p,item)<=0)break;
      await at(c,p.location);
      const r=await act(c,'core:trade.buy',{seller:id,item,quantity:1});
      if(r.status==='committed')continue;
      if(/此刻不提供|不在场|不在此|作息|服务时间|服务时段|赶集路程|不接待/.test(r.reason??'')&&waits++<4){await act(c,'core:time',{minutes:60});continue;}
      steps.push(`向 ${id} 买 ${item}：${say(r)}`);break;
    }
    if(pinv(c.doc,item)>=n)return;}};
  const gather=async sites=>{for(const l of sites){
    const res=l.site.resources.find(r=>r.item===item);
    await at(c,l.id);const en=await act(c,'core:site.enter',{});if(en.status!=="committed")steps.push(`进 ${l.id}：${say(en)}`);
    for(let k=0;k<n+2&&pinv(c.doc,item)<n;k++){const g=await act(c,'core:site.gather',{target:res.id,quantity:1});if(g.status!=='committed'){steps.push(`在 ${l.id} 采 ${item}：${say(g)}`);break;}}
    if(pinv(c.doc,item)>=n)return;}};
  const withRes=W.locations.filter(l=>(l.site?.resources??[]).some(r=>r.item===item));
  const sites=withRes.filter(l=>near(l.id,home)===0).slice(0,2);
  await buyFrom(local);
  if(pinv(c.doc,item)<n)await gather(sites);
  if(pinv(c.doc,item)<n)await buyFrom(wide?all.filter(([,p])=>near(p.location,home)!==0):far);
  // wide：再取一次时，外镇的采集点也去。
  if(wide&&pinv(c.doc,item)<n)await gather(withRes.filter(l=>near(l.id,home)!==0).slice(0,3));
  const ok=pinv(c.doc,item)>=n;steps.push(ok?`${item} 备齐 ${pinv(c.doc,item)}/${n}`:`${item} 取不到（${pinv(c.doc,item)}/${n}）`);return ok;
}

// 取不到时按世界规则再去取一次：睡到次日（持有人补货、采集点再生），连外镇的持有人和采集点一起找。
export async function obtainRetry(c,item,n,steps=[],tries=1){if(await obtain(c,item,n,steps))return true;for(let k=0;k<tries;k++){await sleepTill(c);if(await obtain(c,item,n,steps,{wide:true}))return true;}return false;}

// —— 备料：试做和留样用的原料、工具按需直接写进存档（标准品质：物品表的 quality、durability，没有单件、grade 缺省 1），
// 不靠本地市场供给。能不能做、做出什么仍全走真实调用。写入后按存档重新开账（ledger.openLedger，同 tests/helpers/ledger-sync.resyncBooks 的做法，但没开过账的存档也开），
// 守恒按"两次备料之间"分段对账：每段从上次写入后的存档到下次写入前的存档，各段审计、守恒都为空才算守恒。
export function provision(c,rows,steps=[]){
  const need=rows.map(([item,n])=>[item,n-pinv(c.doc,item)]).filter(([,k])=>k>0);
  if(!need.length)return;
  if(c.seg){c.seg.books.push(books(c,c.seg.start));}
  const doc=structuredClone(c.doc),bag=doc.state.inventory??={};
  for(const [item,k] of need){
    const def=c.engine.byId.get(item),cur=bag[item];
    if(cur&&typeof cur==='object')bag[item]={...cur,quantity:(cur.quantity??0)+k};
    else bag[item]={quality:def.quality,durability:def.durability,weight:def.weight,quantity:(typeof cur==='number'?cur:0)+k};
  }
  doc.ledger=c.T.openLedger(c.engine,doc);
  c.doc=doc;if(c.seg)c.seg.start=doc;
  steps.push(`备料（写存档）：${need.map(([i,k])=>`${i}×${k}`).join('、')}`);
}
export function segmentBooks(c){
  const all=[...(c.seg?.books??[]),books(c,c.seg?.start)];
  return {ok:all.every(b=>b.ok),segments:all.length,audit:all.flatMap(b=>b.audit).slice(0,3),conservation:all.flatMap(b=>b.conservation).slice(0,3)};
}
