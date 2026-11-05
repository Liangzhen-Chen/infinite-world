// 第 5 条：残次品卖得更低。玩家用真实动作当外行做出残次件（lostUses 非空或 grade < 1），再向持货人买一件标准件；
// 同一时刻、同一买家，从同一快照分叉：
//   卖方向：玩家卖残次件 vs 卖标准件，比单价；
//   买方向：残次件卖给持货人以后，玩家从他手里点名买回这件残次件 vs 买一件标准件，比单价。
// 要测的物品从数据推（不按名单）：配方产物有可丢用途（balance/crafting.json 各手艺档 loses 与物品用途集的交集）、
// 出生聚落里有人持有该产物（标准件的来源和买家）、材料与工具在出生聚落买得到或采得到、工位存在；按备料花费从低到高，换买家、换物品。
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';

const SERVE=/此刻不提供|不在场|不在此|作息|服务时间|服务时段|不接待|赶集路程/;
export function candidates(T,doc){
  const W=T.world,I=new Map(W.items.map(i=>[i.id,i]));
  const useCfg=JSON.parse(fs.readFileSync(path.join(T.repo,'world/meta/item-use-tags.json'),'utf8'));
  const crafting=JSON.parse(fs.readFileSync(path.join(T.repo,'world/rules/tables/balance/crafting.json'),'utf8'));
  const recipeTools=new Set(W.recipes.flatMap(r=>r.tools??[]));
  const usesOf=id=>{const it=I.get(id),t=it?.tags??[],u=new Set();
    for(const [k,cl] of Object.entries(useCfg.classes))if(!(cl.exclude??[]).some(x=>t.includes(x))&&((cl.tags??[]).some(x=>t.includes(x))||cl.recipeTool&&recipeTools.has(id)||cl.nutrition&&it?.nutrition))u.add(k);
    for(const x of t)if(useCfg.tags[x])u.add(x);for(const f of ['combat','checkBonus'])if(it?.[f])u.add(f);return [...u];};
  const losesAll=new Set((crafting.rows??[]).flatMap(r=>r.loses??[]));
  const home=T.ownerSettlement('player')??T.settlementOf(doc.state.location);
  const localHolders=it=>Object.entries(doc.state.npcs).filter(([id,n])=>L.inv(n,it)>0&&n.location&&T.settlementOf(n.location)===home).map(([id])=>id);
  const sites=it=>W.locations.filter(l=>(l.site?.resources??[]).some(r=>r.item===it)&&T.settlementOf(l.id)===home).map(l=>l.id);
  const obtainable=it=>L.inv(doc.state,it)>0||localHolders(it).length>0||sites(it).length>0;
  const station=kind=>W.locations.filter(l=>(l.workstations??[]).some(w=>w.kind===kind)).sort((a,b)=>((T.settlementOf(b.id)===home)-(T.settlementOf(a.id)===home)))[0]?.id??null;
  const out=[];
  for(const r of W.recipes){const X=r.output?.item;if(!X||(r.output.quantity??1)!==1)continue;
    const losable=usesOf(X).filter(u=>losesAll.has(u));if(!losable.length)continue;
    const holders=localHolders(X);if(!holders.length)continue;
    if(!r.materials.every(m=>obtainable(m.item))||!(r.tools??[]).every(obtainable))continue;
    const ws=r.workstation?station(r.workstation):null;if(r.workstation&&!ws)continue;
    const cost=r.materials.reduce((s,m)=>s+(I.get(m.item)?.basePrice??0)*m.amount,0)+(r.tools??[]).filter(t=>!L.inv(doc.state,t)).reduce((s,t)=>s+(I.get(t)?.basePrice??0),0)+(I.get(X)?.basePrice??0);
    out.push({recipe:r.id,item:X,losable,holders,station:ws,tools:r.tools??[],materials:r.materials,cost});}
  out.sort((a,b)=>a.cost-b.cost||a.recipe.localeCompare(b.recipe));
  // 换物品、换买家：贪心挑，同一买家、同一物品只用一次。
  const picked=[],usedBuyer=new Set(),usedItem=new Set();
  for(const c of out){if(usedItem.has(c.item))continue;const b=c.holders.find(h=>!usedBuyer.has(h));if(!b)continue;picked.push({...c,buyer:b});usedBuyer.add(b);usedItem.add(c.item);}
  return {home,all:out.length,picked};
}

async function obtain(c,item,n,steps){
  const T=c.T,home=T.ownerSettlement('player')??T.settlementOf(c.doc.state.location);
  if(L.inv(c.doc.state,item)>=n)return true;
  const holders=Object.entries(c.doc.state.npcs).filter(([,p])=>L.inv(p,item)>0&&p.location&&T.settlementOf(p.location)===home).map(([id])=>id);
  for(const id of holders){let waits=0;
    for(let k=0;k<n+4&&L.inv(c.doc.state,item)<n;k++){
      const p=c.doc.state.npcs[id];if(!p?.location||L.inv(p,item)<=0)break;
      await L.at(c,p.location);
      const r=await L.act(c,'core:trade.buy',{seller:id,item,quantity:1});
      if(r.status==='committed')continue;
      if(SERVE.test(r.reason??'')&&waits++<6){await L.act(c,'core:time',{minutes:60});continue;}
      steps.push(`向 ${id} 买 ${item}：${L.say(r)}`);break;}
    if(L.inv(c.doc.state,item)>=n)break;}
  if(L.inv(c.doc.state,item)<n)for(const l of T.world.locations.filter(l=>(l.site?.resources??[]).some(r=>r.item===item)&&T.settlementOf(l.id)===home).slice(0,2)){
    const res=l.site.resources.find(r=>r.item===item);await L.at(c,l.id);await L.act(c,'core:site.enter',{});
    for(let k=0;k<n+2&&L.inv(c.doc.state,item)<n;k++){const g=await L.act(c,'core:site.gather',{target:res.id,quantity:1});if(g.status!=='committed'){steps.push(`在 ${l.id} 采 ${item}：${L.say(g)}`);break;}}
    if(L.inv(c.doc.state,item)>=n)break;}
  const ok=L.inv(c.doc.state,item)>=n;if(!ok)steps.push(`${item} 取不到（${L.inv(c.doc.state,item)}/${n}）`);return ok;
}
const stackOf=(holder,item)=>holder?.inventory?.[item];
const idsOf=(holder,item)=>{const s=stackOf(holder,item);return typeof s==='object'?[...(s.instances??[])]:[];};
const unit=(doc,id)=>doc.state.itemInstances?.[id]??null;
const defective=u=>!!u&&((Array.isArray(u.lostUses)&&u.lostUses.length>0)||(typeof u.grade==='number'&&u.grade<1));
const standard=u=>!!u&&!defective(u);
// 单价：回执定价里的单价（未取整），没有就取钱数差（每次只成交 1 件）。
const unitPrice=(r,dCoins)=>r.status!=='committed'?null:(r.result?.pricing?.unitPrice??r.result?.unitPrice??r.result?.trade?.unitPrice??Math.abs(dCoins));

export async function runDefects(T,{trials=2}){
  const c=T.newGame('e2-defect'),steps=[],t0=Date.now();
  await L.call(c,'world_time',{minutes:1});
  const spec=candidates(T,c.doc),rows=[];
  for(const cand of spec.picked.slice(0,3)){
    const row={item:cand.item,recipe:cand.recipe,buyer:cand.buyer,losable:cand.losable,attempts:[],steps:[]};rows.push(row);
    // 1. 外行照配方做：备料、到工位、做；做出残次件为止，最多 2×trials 次。
    for(let i=0;i<2*trials&&row.attempts.filter(a=>a.defective).length<trials;i++){
      let ok=true;for(const t of cand.tools)ok=ok&&await obtain(c,t,1,row.steps);
      for(const m of cand.materials)ok=ok&&await obtain(c,m.item,m.amount,row.steps);
      if(!ok){row.attempts.push({status:'blocked',reason:'备料取不到'});break;}
      if(cand.station)await L.at(c,cand.station);
      const before=new Set(idsOf(c.doc.state,cand.item)),q0=L.inv(c.doc.state,cand.item);
      const r=await L.act(c,'core:craft.manufacture',{recipe:cand.recipe});
      const fresh=idsOf(c.doc.state,cand.item).filter(id=>!before.has(id));
      const u=fresh.map(id=>({id,...unit(c.doc,id)}));
      row.attempts.push({status:r.status,reason:r.reason,gained:L.inv(c.doc.state,cand.item)-q0,units:u.map(x=>({id:x.id,workmanship:x.workmanship??null,grade:x.grade??null,lostUses:x.lostUses??null})),defective:u.some(defective)});
      if(r.status!=='committed'&&!fresh.length&&/技能|学会|掌握|资格/.test(r.reason??'')){row.steps.push(`外行做 ${cand.recipe} 被拒：${r.reason}`);break;}
    }
    const defIds=idsOf(c.doc.state,cand.item).filter(id=>defective(unit(c.doc,id)));
    if(!defIds.length){row.blocked=`外行没做出残次件（${row.attempts.map(a=>a.status+(a.reason?'：'+a.reason:'')).join('；')}）`;continue;}
    // 2. 向持货人买一件标准件
    const q0=L.inv(c.doc.state,cand.item);
    const okStd=await obtain(c,cand.item,q0+1,row.steps);
    if(!okStd){row.blocked='买不到标准件';continue;}
    // 标准件：实例里没缺用途、grade≥1 的，或未登记实例的余量（plain）。
    const ids=idsOf(c.doc.state,cand.item),stdId=ids.find(id=>standard(unit(c.doc,id)))??null,plain=L.inv(c.doc.state,cand.item)-ids.length;
    if(!stdId&&plain<=0){row.blocked='买到的件不是标准件';continue;}
    // 3. 到买家处，等他接待
    const n=c.doc.state.npcs[cand.buyer];await L.at(c,n.location);
    const sell=async(tag,instances)=>{const f=L.fork(c,tag),coins=f.doc.state.player.coins;
      const r=await L.call(f,'world_trade',{operation:'trade',seller:'player',buyer:cand.buyer,item:cand.item,quantity:1,...(instances?{instances}:{})});
      return {f,r,status:r.status,reason:r.reason,price:unitPrice(r,f.doc.state.player.coins-coins),coins:f.doc.state.player.coins-coins};};
    let probe;for(let w=0;w<24;w++){probe=await sell('probe',[defIds[0]]);if(probe.status==='committed'||!SERVE.test(probe.reason??''))break;await L.act(c,'core:time',{minutes:60});}
    if(probe.status!=='committed'){row.blocked=`买家 ${cand.buyer} 不收：${probe.reason}`;continue;}
    // 卖方向：每件残次件各一个分叉；标准件一个分叉（点名实例或卖未登记的余量，事后核对卖掉的确实不是残次件）。
    row.sellDefective=[];for(const id of defIds){const s=await sell('sd-'+id,[id]);row.sellDefective.push({id,status:s.status,reason:s.reason,price:s.price,unit:unit(c.doc,id)});}
    const ss=await sell('ss',stdId?[stdId]:null);
    const keptDef=defIds.every(id=>idsOf(ss.f.doc.state,cand.item).includes(id));
    row.sellStandard={status:ss.status,reason:ss.reason,price:ss.price,instance:stdId,soldWasStandard:keptDef};
    // 买方向：从"残次件已卖给买家"的分叉出发点名买回那件；标准件从同一时刻、残次件还没卖给他的快照上买（他手里只有标准件；
    // 不点名时引擎可能先卖残次件，所以不在同一分叉里比）。
    const sold=await sell('to-buyer',[defIds[0]]);
    const bIds=idsOf(sold.f.doc.state.npcs[cand.buyer],cand.item);
    row.buyerKeepsUnit=bIds.includes(defIds[0]);
    const buy=async(tag,instances,from=sold.f)=>{const f=L.fork(from,tag),coins=f.doc.state.player.coins;
      const r=await L.call(f,'world_trade',{operation:'trade',seller:cand.buyer,item:cand.item,quantity:1,...(instances?{instances}:{})});
      return {f,status:r.status,reason:r.reason,price:unitPrice(r,coins-f.doc.state.player.coins),paid:coins-f.doc.state.player.coins,result:Object.keys(r.result??{}),total:r.result?.totalCoins??r.result?.cost??null,pricing:r.result?.pricing??null,rbuyer:r.result?.buyer,rseller:r.result?.seller};};
    const bd=await buy('bd',[defIds[0]]),bs=await buy('bs',null,c);
    const bHadDef=idsOf(c.doc.state.npcs[cand.buyer],cand.item).some(id=>defective(unit(c.doc,id)));
    row.buyDefective={status:bd.status,reason:bd.reason,price:bd.price,paid:bd.paid,gotIt:idsOf(bd.f.doc.state,cand.item).includes(defIds[0])};
    row.buyStandard={status:bs.status,reason:bs.reason,price:bs.price,paid:bs.paid,sellerHadOnlyStandard:!bHadDef};
    row.books=L.books(c,null);
  }
  return {home:spec.home,candidates:spec.all,rows,steps,seconds:Math.round((Date.now()-t0)/1000)};
}
