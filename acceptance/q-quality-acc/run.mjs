// 卡 Q 验收的"做工"层：按材料族开三条谱系（A 真工具真原料、B 外行自制的劣工具、C 外行自制的劣原料），
// 每条谱系按"缺技能 → 刚入门 → 熟练"三档取存档快照，每档从同一快照分叉 K 次各做一次，记下现象。
// 全部用真实动作：买、采、学、练、走到工位、按配方做、卖。不改状态，不调规律层内部函数。
import fs from 'node:fs';
import path from 'node:path';
import {act,call,say,at,inv,pinv,sleepTill,learnSkill,learnRecipe,practiceTo,prof,obtain,books} from './lib.mjs';

// —— 品质刻度（全部从数据读） ——
// 手艺档：rules.equipment.workmanship 的顺序（从低到高）；卡里新增的"仿制""粗陋"如果数据里没有，排在最低两档之下。
export function scales(T){
  const wm=(T.world.rules?.equipment?.workmanship??[]).map(w=>w.name);
  const rows=JSON.parse(fs.readFileSync(path.join(T.repo,'world/rules/tables/balance/crafting.json'),'utf8'));
  const order=[...wm];for(const r of rows.rows??[])if(/^workmanship:/.test(r.key)&&r.name&&!order.includes(r.name))order.push(r.name);
  const low=['仿制','粗陋'].filter(n=>!order.includes(n));
  const tiers=[...low,...order];
  const grades=T.world.rules?.equipment?.qualities??[];
  const row=n=>(rows.rows??[]).find(r=>r.name===n);
  return {tiers,grades,table:rows,loses:n=>row(n)?.loses??[],price:n=>row(n)?.price??1,
    tier:n=>{const i=tiers.indexOf(n);return i<0?null:i;},
    grade:n=>{const i=grades.indexOf(n);return i<0?null:i;},
    genuineMin:tiers.indexOf('普通')};
}

// —— 观察 ——
const stack=(doc,item)=>doc.state.inventory?.[item];
const unitsOf=(doc,item)=>{const s=stack(doc,item);if(!s)return [];const ids=s.instances??[];return ids.map(id=>({id,...(doc.state.itemInstances?.[id]??{})}));};
// 实例缺掉的用途以引擎的 unitLostUses 为准（item-class.mjs：实例记的 lostUses，旧实例按手艺档推；物理事实 physicalItem 也按它去掉用途标签、
// checkBonus、combat）。树里没有 unitLostUses 时退回读实例的 lostUses 字段。剩余用途 = 物品用途集（spec.usesOf，含 checkBonus、combat）减去缺掉的。
export function lostOfUnit(T,engine,unit){
  if(typeof T.unitLostUses==='function'&&unit?.item)return T.unitLostUses(engine,unit).map(String);
  return Array.isArray(unit?.lostUses)?unit.lostUses.map(String):[];
}
export function usesOfUnit(unit,base,lost){const l=new Set(lost??[]);return base.filter(u=>!l.has(u));}
const tierName=u=>u?.workmanship??u?.craftsmanship??u?.tier??null;
const durOf=(u,s)=>u?.maxDurability??u?.durability??s?.durability??null;
// 实例品质：引擎记在单件上的 grade（数值，标准件 1）；不是目录里的 quality（木…天，那是物品种类的档次）。
const gradeOf=(u,s)=>u?.grade??(typeof s==='object'?s?.grade:undefined)??1;
// 持有人某材料的品质分布：单件按各自 grade，未登记单件的余量按行囊 grade（缺省 1）。
function matGrades(doc,item){
  const s=stack(doc,item),q=inv(doc.state,item);if(!q)return {qty:0,min:null,sum:0};
  const ids=typeof s==='object'?s.instances??[]:[],gs=ids.map(id=>doc.state.itemInstances?.[id]?.grade??1);
  const rest=Math.max(0,q-gs.length),rg=(typeof s==='object'?s.grade:undefined)??1;
  const all=[...gs,...(rest?[rg]:[])];return {qty:q,min:Math.min(...all),sum:gs.reduce((a,b)=>a+b,0)+rest*rg};
}
// 失败分档（按现象）：失败而得到成品记"部分功能"；没有成品时看材料——品质比投入低（退回的料 grade 降了）记"损耗"，
// 数量少了而品质没降（只剩残料或全无）记"报废"，数量品质都原样记"无损"。
// 引擎回执里的分档（failure：intact / wear / ruin / partial）另记作对照。
export const ENGINE_CAT={intact:'无损',wear:'损耗',ruin:'报废',partial:'部分功能'};
const CAT={无损:/none|intact|lossless|noloss|safe|无损/i,损耗:/wear|damage|loss|损耗|durab|degrad/i,报废:/ruin|scrap|destroy|wreck|break|报废|total/i,部分功能:/partial|部分|function|half/i};
export const catOf=s=>{if(!s)return null;s=String(s);for(const k of ['部分功能','无损','报废','损耗'])if(CAT[k].test(s)&&!(k==='损耗'&&CAT['无损'].test(s)))return k;return null;};

function trialRecord(T,S,D,recipe,before,after,r){
  const out=recipe.output.item,base=D.usesOf(out);
  const beforeIds=new Set(stack(before,out)?.instances??[]);
  const qtyGain=inv(after.state,out)-inv(before.state,out);
  const fresh=unitsOf(after,out).filter(u=>!beforeIds.has(u.id));
  const units=fresh.map(u=>{const lost=lostOfUnit(T,r.engine,u),uses=usesOfUnit(u,base,lost);
    return {id:u.id,tier:tierName(u),rank:S.tier(tierName(u)),maxDur:durOf(u,stack(after,out)),grade:gradeOf(u,stack(after,out)),catalogQuality:u.quality??null,uses,lost:base.filter(x=>!uses.includes(x)),lostRecorded:u.lostUses??null,maker:u.maker??null};});
  const res=r.result??{};
  const matBefore=recipe.materials.reduce((s,m)=>s+Math.min(m.amount,inv(before.state,m.item)),0);
  const consumed=recipe.materials.reduce((s,m)=>s+Math.max(0,Math.min(m.amount,inv(before.state,m.item)-inv(after.state,m.item))),0);
  const failed=r.status==='committed'&&(res.success===false||/失败/.test(res.degree??'')||qtyGain<=0);
  let cat=null,mats=null;
  if(failed){
    mats=recipe.materials.map(m=>{const b=matGrades(before,m.item),a=matGrades(after,m.item);
      return {item:m.item,qtyBefore:b.qty,qtyAfter:a.qty,minBefore:b.min,minAfter:a.min,dropped:a.qty>0&&(a.min<(b.min??1)-1e-9||(a.qty>=b.qty&&a.sum<b.sum-1e-9))};});
    if(qtyGain>0)cat='部分功能';
    else if(mats.some(m=>m.dropped))cat='损耗';
    else cat=consumed>0?'报废':'无损';
  }
  const ef=typeof res.failure==='string'?res.failure:(res.failure?.kind??null);
  const engineCat=ef?(ENGINE_CAT[ef]??catOf(ef)):null;
  return {status:r.status,reason:r.reason??null,degree:res.degree??null,standing:r.status==='committed'?(res.standing??'skilled'):null,success:res.success??null,engineTier:res.workmanship??null,engineFailure:ef,
    qtyGain,units,failed,cat,engineCat,mats,consumedFrac:matBefore?consumed/matBefore:null,books:books({T,doc:after,engine:r.engine},before)};
}

// 从同一快照分叉 K 次，各做一次。
async function trials(ctx,T,S,D,recipe,K,tag){
  const base=ctx.doc,out=[];
  for(let i=0;i<K;i++){
    const f={...ctx,doc:base,id:`${ctx.id}-${tag}${i}`,log:[]};
    const r=await act(f,'core:craft.manufacture',{recipe:recipe.id});
    r.engine=ctx.engine;
    out.push(trialRecord(T,S,D,recipe,base,f.doc,r));
    if(r.status==='rejected'&&i>=1&&out.every(x=>x.status==='rejected'))break; // 一直被拒就不必再试满
  }
  return out;
}

// 外行用真实动作自己做一件东西（劣工具、劣原料），做出来为止（最多 5 次，每次重新备料）。
async function makeUnskilled(c,D,recipeId,item,need,steps){
  const r=D.recipe(recipeId);
  // 取不到时按世界规则再去取一次：睡到次日（采集点再生、持有人补货），连外镇的持有人和采集点一起找；仍取不到就是世界里真实的供给不够，
  // 记为受阻（supply），不是引擎缺陷。
  const get=async(it,n)=>{if(await obtain(c,it,n,steps))return true;await sleepTill(c);return obtain(c,it,n,steps,{wide:true});};
  for(let k=0;k<5&&pinv(c.doc,item)<need;k++){
    for(const t of r.tools??[])if(!await get(t,1))return {ok:false,supply:true,why:`做 ${recipeId} 缺工具 ${t}：再去取一次（次日、含外镇持有人与采集点）仍取不到，世界供给不足`};
    for(const m of r.materials)if(!await get(m.item,m.amount))return {ok:false,supply:true,why:`做 ${recipeId} 缺材料 ${m.item}：${k?`前 ${k} 次失败耗掉了材料，`:''}再去取一次（次日、含外镇持有人与采集点）仍取不到，世界供给不足`};
    if(r.workstation){const st=D.station(r.workstation);if(st)await at(c,st);}
    const x=await act(c,'core:craft.manufacture',{recipe:recipeId});
    steps.push(`外行做 ${recipeId}：${say(x)}${x.result?.workmanship?'（'+x.result.workmanship+'）':''}`);
    if(x.status==='rejected')return {ok:false,why:`外行做 ${recipeId} 被拒：${x.reason}`};
  }
  return pinv(c.doc,item)>=need?{ok:true}:{ok:false,why:`外行做 ${recipeId} 5 次都没做出 ${item}`};
}

// 一条谱系。kind：A 真工具真原料；B 劣工具（外行自制）＋真原料；C 真工具＋劣原料（外行自制）。
export async function lineage(T,S,D,spec,kind,{days,K,keep=kind==='A'}){
  const c=T.newGame(`q-${spec.key}-${kind}`),steps=[],t0=Date.now();
  const X=D.recipe(kind==='C'?spec.Xc:spec.X);
  const res={family:spec.family,kind,recipe:X.id,steps,tiers:{},probes:{},keepers:{},blocked:null};
  const stationOf=r=>r.workstation?D.station(r.workstation):null;
  const genesis=c.doc;
  // 物理不可行的三种探针（只在 A 谱系、缺技能档做）：缺材料、缺工具、不在工位。
  if(kind==='A'){
    const mk=async(tag,{tools,mats,place})=>{
      const f={...c,doc:genesis,id:`${c.id}-probe-${tag}`,log:[]},st=[];
      if(tools)for(const t of X.tools??[])if(!await obtain(f,t,1,st))return {skipped:`备不齐工具 ${t}`,steps:st};
      if(mats)for(const m of X.materials)if(!await obtain(f,m.item,m.amount,st))return {skipped:`备不齐材料 ${m.item}`,steps:st};
      if(place)await at(f,place);
      const r=await act(f,'core:craft.manufacture',{recipe:X.id});return {status:r.status,reason:r.reason,where:f.doc.state.location};
    };
    const st=stationOf(X);
    res.probes.noMaterial=await mk('nomat',{tools:true,mats:false,place:st});
    if((X.tools??[]).length)res.probes.noTool=await mk('notool',{tools:false,mats:true,place:st});
    if(st){
      // 不在工位：取一处没有该类工位的地点（出生聚落中心）。
      const off=T.world.locations.find(l=>l.id===genesis.state.location&&!(l.workstations??[]).some(w=>w.kind===X.workstation))?.id??null;
      if(off)res.probes.noStation=await mk('nostation',{tools:true,mats:true,place:off});
    }
  }
  // t0 备料。
  const needTools=(X.tools??[]).filter(t=>!(kind==='B'&&t===spec.poorTool?.item));
  const needMats=X.materials.filter(m=>!(kind==='C'&&m.item===spec.crudeMaterial?.item));
  if(kind==='B'){
    if(!spec.poorTool){res.blocked='数据里没有能由外行自制的工具';return res;}
    const m=await makeUnskilled(c,D,spec.poorTool.recipe,spec.poorTool.item,1,steps);
    if(!m.ok){res.blocked=`${m.supply?'受阻于世界供给（非引擎缺陷）':'前提造不出'}：劣工具（${m.why}）`;return res;}
    res.poorTool=unitsOf(c.doc,spec.poorTool.item).map(u=>({id:u.id,tier:tierName(u),rank:S.tier(tierName(u)),maxDur:durOf(u,stack(c.doc,spec.poorTool.item))}));
  }
  if(kind==='C'){
    if(!spec.crudeMaterial){res.blocked='数据里没有能由外行自制的原料';return res;}
    const cm=spec.crudeMaterial,m=await makeUnskilled(c,D,cm.recipe,cm.item,cm.amount,steps);
    if(!m.ok){res.blocked=`${m.supply?'受阻于世界供给（非引擎缺陷）':'前提造不出'}：劣原料（${m.why}）`;return res;}
    const us=unitsOf(c.doc,cm.item),s=stack(c.doc,cm.item);
    res.crude={item:cm.item,units:us.length?us.map(u=>({id:u.id,tier:tierName(u),rank:S.tier(tierName(u)),grade:gradeOf(u,s),catalogQuality:u.quality??null})):[{id:null,tier:s?.workmanship??null,rank:S.tier(s?.workmanship??null),grade:gradeOf(null,s),catalogQuality:s?.quality??null}]};
  }
  for(const t of needTools)if(!await obtain(c,t,1,steps)){res.blocked=`取不到工具 ${t}`;return res;}
  for(const m of needMats)if(!await obtain(c,m.item,m.amount,steps)){res.blocked=`取不到材料 ${m.item}`;return res;}
  const st=stationOf(X);
  // Q1d 的另选配方（X 的产物没有可丢用途时）：在 A 谱系的缺技能、刚入门两档同一快照上另做 K 次，工具、材料按世界规则取得。
  const Xd=kind==='A'&&spec.Xd&&spec.Xd!==X.id?D.recipe(spec.Xd):null;
  if(Xd)res.xd={recipe:Xd.id,tiers:{}};
  const runXd=async tier=>{
    if(!Xd||res.xd.blocked)return;
    for(const t of Xd.tools??[])if(!await obtain(c,t,1,steps)){res.xd.blocked=`取不到 ${Xd.id} 的工具 ${t}`;return;}
    for(const m of Xd.materials)if(!await obtain(c,m.item,m.amount,steps)){res.xd.blocked=`取不到 ${Xd.id} 的材料 ${m.item}`;return;}
    const sd=stationOf(Xd);if(sd)await at(c,sd);
    res.xd.tiers[tier]={proficiency:prof(c,Xd.skill),trials:await trials(c,T,S,D,Xd,K,`d${tier}`)};
  };
  const runTier=async tier=>{
    if(tier!=='熟练')await runXd(tier);
    if(st)await at(c,st);
    res.tiers[tier]={proficiency:prof(c,X.skill),day:Math.floor(c.doc.state.minute/1440),trials:await trials(c,T,S,D,X,K,tier)};
    // 留样（A 谱系）：在主线上真做一次并留下产物，供同一时刻对比报价、成交价。
    if(keep){for(let i=0;i<3;i++){let got=true;for(const m of X.materials)if(!await obtain(c,m.item,m.amount*2,steps)){got=false;break;}if(!got)break;if(st)await at(c,st);const before=c.doc;const r=await act(c,'core:craft.manufacture',{recipe:X.id});
      const rec=trialRecord(T,S,D,X,before,c.doc,{...r,engine:c.engine});if(rec.units.length){res.keepers[tier]=rec.units[0];break;}if(r.status==='rejected')break;}}
  };
  await runTier('缺技能');
  const teachers=spec.teachers;
  if(!await learnSkill(c,X.skill,teachers,steps)){res.blocked=`学不到 ${X.skill}`;return res;}
  if(X.learningRequired&&!c.doc.state.recipes?.[X.id]&&!await learnRecipe(c,X.id,[...new Set([...(X.teachers??[]),...teachers])],steps)){res.blocked=`学不到 ${X.id}`;return res;}
  await runTier('刚入门');
  await practiceTo(c,X.skill,Infinity,days,steps);
  await runTier('熟练');
  // 报价与成交价：同一时刻、同一买家，分叉各卖一件留样。
  if(keep)res.sales=await sales(c,T,X,res.keepers,spec);
  res.books=books(c,genesis);res.seconds=Math.round((Date.now()-t0)/1000);
  return res;
}

async function sales(c,T,X,keepers,spec){
  const out={buyer:null,quotes:{},deals:{},tried:[]};
  const item=X.output.item;
  const buyers=[...new Set([...spec.teachers,...Object.entries(c.doc.state.npcs).filter(([,n])=>n.location&&String(n.location).split('_')[1]===String(c.doc.state.location).split('_')[1]&&n.coins>20).map(([id])=>id)])].slice(0,8);
  const sell=async(doc,buyer,uid,commit)=>{
    const f={...c,doc,id:`${c.id}-sell`,log:[]};
    const n=f.doc.state.npcs[buyer];if(n?.location)await at(f,n.location);
    const coins0=f.doc.state.player.coins;
    const r=await call(f,'world_trade',{operation:'trade',seller:'player',buyer,item,quantity:1,instances:[uid]},{commit:true});
    const quoted=r.result?.unitPrice??r.result?.price??r.result?.trade?.unitPrice??null;
    return {status:r.status,reason:r.reason,price:f.doc.state.player.coins-coins0,quoted,commit};
  };
  const ks=Object.entries(keepers).filter(([,u])=>u?.id);
  if(ks.length<2)return {...out,blocked:'留样不足两档'};
  for(const b of buyers){
    let probe;
    // 对方不在接待时段：主线上真等一个时辰再问（最多一天）。
    for(let w=0;w<24;w++){probe=await sell(c.doc,b,ks[0][1].id);if(probe.status==='committed'||!/此刻不提供|不在场|不在此|作息|服务时段|服务时间|不接待/.test(probe.reason??''))break;await act(c,'core:time',{minutes:60});}
    out.tried.push(`${b}：${probe.status}${probe.reason?'：'+probe.reason:''}`);
    if(probe.status!=='committed'||probe.price<=0)continue;
    out.buyer=b;
    for(const [tier,u] of ks){
      // 报价：引擎回执里给的单价（没有就取成交前后钱数差）；成交价：真成交后玩家钱数差。两者都在分叉上做，互不影响。
      const q=await sell(c.doc,b,u.id);out.quotes[tier]={tier:u.tier,rank:u.rank,grade:u.grade,price:q.quoted??q.price,status:q.status};
      const d=await sell(c.doc,b,u.id);out.deals[tier]={tier:u.tier,rank:u.rank,grade:u.grade,price:d.price,status:d.status};
    }
    break;
  }
  return out;
}
