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
  const T={repo,world,applyPatches,auditLedger,conservation,unitLostUses};
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
export const books=(c,before)=>{const a=c.T.auditLedger(c.doc.ledger)??[],k=before?c.T.conservation(c.engine,before,c.doc):[];return {ok:!a.length&&!k.length,audit:a.slice(0,3),conservation:k.slice(0,3)};};
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
  const all=Object.entries(c.doc.state.npcs).filter(([id,p])=>inv(p,item)>0&&!(p.hp<=0)&&p.location&&!exclude.includes(id));
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
