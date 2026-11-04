// 卡 D 职业驱动劳动·浸泡驱动（独立验收；不读 server-plugin 规律实现）。
// 只经引擎公开入口推进：world_act 的 core:time（等待）、core:move、core:trade.buy（commit:false 报价 / 真实买入）。
// 玩家在整个浸泡里只等待，不调用任何采集入口（core:site.gather / site.mine / site.woodcut / wildlife.gather / wildlife.fish / farm.harvest）。
// 观察只读：state.npcAutonomy.actions、state.records 新条目、ledger.crafts、ledger.accounts / flows。
// 用法：ACC_REPO=<树> node soak.mjs --days N --tag T [--price]   → trace-T.json
import fs from 'node:fs/promises';
import {world,newGame,act,auditLedger,REPO} from './lib.mjs';
const {conservation}=await import(`file:///${REPO}/tests/helpers/ledger-audit.mjs`);
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:(process.argv[i+1]??true);};
const DAYS=Number(arg('--days',3)),TAG=arg('--tag','base'),PRICE=process.argv.includes('--price');
const OUT=`F:/dnd-tmp/d-labor-acc/trace-${TAG}.json`;
export const R=['item_salt','item_wood','item_herb','item_clay','item_honey'];
const STEP=60;
const NPCW=new Map(world.npcs.map(n=>[n.id,n]));
const LOC=new Map((Array.isArray(world.locations)?world.locations:Object.values(world.locations)).map(l=>[l.id,l]));
const SETTLE=new Set([...(Array.isArray(world.settlementProfiles)?world.settlementProfiles.map(x=>x.id):Object.keys(world.settlementProfiles??{}))]);
// 人的聚落：数据里的 settlement，否则沿住处/所在地的 parent 链找到第一个聚落（state.settlements 里的地点）
let SETTLED=null;const locSettlement=id=>{for(let i=0,x=id;x&&i<12;i++,x=LOC.get(x)?.parent){if(SETTLED?.has(x))return x;}return null;};
const settlementOfNpc=id=>{const n=NPCW.get(id);return n?.settlement??locSettlement(n?.home?.location)??locSettlement(n?.location)??null;};
const t0=Date.now();
const ctx=newGame('dl');
const PLAYER_GATHER=new Set(['core:site.gather','core:site.mine','core:site.woodcut','core:wildlife.gather','core:wildlife.fish','core:farm.harvest']);
const playerActions=[];
const A=async(action,slots,o)=>{playerActions.push(action);return act(ctx,action,slots,o);};
await A('core:time',{until:{dayOffset:1,hour:6}});           // 账本在首个日界开账；从次日 06:00 起算
const startDoc=ctx.doc;SETTLED=new Set(Object.keys(ctx.doc.state.settlements??{}));
// ---- 观察工具 ----
const parse=k=>{const [owner,resource,purpose]=k.split('|');return {owner,resource,purpose};};
const diff=(a,b)=>{const o={};for(const k of new Set([...Object.keys(a??{}),...Object.keys(b??{})])){const d=(b?.[k]??0)-(a?.[k]??0);if(d)o[k]=d;}return o;};
const BAD_SRC=/^src:(genesis|import|drift)/;
const isNature=o=>o.purpose==='reserve'||/^(forest:|site_|basin:|water:)/.test(o.owner);
const ACTOR_KEYS=['npc','actor','worker','laborer','labourer','carrier','porter','seller','keeper','maker','agent','by'];
const kindOf=e=>String(e.labor??e.laborCategory??e.category??e.kind??e.action?.kind??e.type??'');
const itemsFrom=x=>{const out=[];const add=(i,q)=>{if(typeof i==='string'&&/^item_/.test(i)&&(q??1)>0)out.push({item:i,qty:q??1});};
  if(!x)return out;if(Array.isArray(x)){for(const y of x){if(typeof y==='string')add(y,1);else if(y&&typeof y==='object')add(y.item??y.id??y.resource,y.quantity??y.qty??y.amount);}}
  else if(typeof x==='object'){for(const [k,v] of Object.entries(x))if(typeof v==='number')add(k,v);}return out;};
function normalize(e,src,id,npcs){
  let actor=null,role=null;for(const k of ACTOR_KEYS){const v=e[k];if(typeof v==='string'&&npcs[v]){actor=v;role=k;break;}}
  const produced=[...itemsFrom(e.produced),...itemsFrom(e.outputs),...itemsFrom(e.obtained),...itemsFrom(e.result?.obtained),...itemsFrom(e.result?.produced),...itemsFrom(e.gathered),...itemsFrom(e.yield)];
  const consumed=[...itemsFrom(e.spent?.materials),...itemsFrom(e.inputs),...itemsFrom(e.materials),...itemsFrom(e.consumed)];
  const goods=[...(typeof e.item==='string'?[{item:e.item,qty:e.quantity??1}]:[]),...itemsFrom(e.goods),...itemsFrom(e.cargo),...itemsFrom(e.load),...itemsFrom(e.items),...itemsFrom(e.carried)];
  const success=e.outcome?.success!==false&&e.result?.success!==false&&e.success!==false;
  return {id,src,actor,role,kind:kindOf(e),minute:e.minute??e.finishAt??e.arriveAt??e.start??null,location:e.location??null,
    from:e.from??e.origin??null,to:e.to??e.destination??null,buyer:typeof e.buyer==='string'?e.buyer:null,side:e.side??null,
    coins:e.totalCoins??e.paid??e.price??null,produced,consumed,goods,success,raw:JSON.stringify(e).slice(0,400)};
}
const seenAuto=new Set(),seenRec=new Set(Object.keys(ctx.doc.state.records??{}));
for(const k of Object.keys(ctx.doc.state.npcAutonomy?.actions??{}))seenAuto.add(k);
let craftsSeen=(ctx.doc.ledger?.crafts??[]).length;
const steps=[],events=[],daily=[];
function scan(stepIndex){
  const s=ctx.doc.state,npcs=s.npcs;
  for(const [k,e] of Object.entries(s.npcAutonomy?.actions??{}))if(!seenAuto.has(k)){seenAuto.add(k);const n=normalize(e,'autonomy',k,npcs);if(n.actor)events.push({...n,step:stepIndex});}
  for(const [k,e] of Object.entries(s.records??{}))if(!seenRec.has(k)){seenRec.add(k);if(e&&typeof e==='object'){const n=normalize(e,'record',k,npcs);if(n.actor)events.push({...n,step:stepIndex});}}
  const cr=ctx.doc.ledger?.crafts??[];
  for(let i=craftsSeen;i<cr.length;i++){const c=cr[i];const actor=c.maker??c.npc??c.actor??(String(c.eventId??'').match(/npc_[a-z0-9_]+/)?.[0]);
    if(actor&&npcs[actor]&&!seenAuto.has(c.eventId))events.push({...normalize({...c,npc:actor,kind:'craft',produced:c.outputs,inputs:c.inputs},'ledger.crafts',`craft#${i}`,npcs),step:stepIndex});}
  craftsSeen=cr.length;
}
function holdingsOf(doc,r){const h={npc:0,settlement:0,faction:0,other:0,player:0,nature:0,bySettlement:{}};
  for(const [k,v] of Object.entries(doc.ledger?.accounts??{})){const o=parse(k);if(o.resource!==r||!v)continue;
    if(isNature(o))h.nature+=v;else if(o.owner==='player')h.player+=v;
    else if(doc.state.npcs[o.owner]){h.npc+=v;const st=settlementOfNpc(o.owner)??'?';h.bySettlement[st]=(h.bySettlement[st]??0)+v;}
    else if(doc.state.settlements?.[o.owner]||/^loc_/.test(o.owner)){h.settlement+=v;h.bySettlement[o.owner]=(h.bySettlement[o.owner]??0)+v;}
    else if(/^faction/.test(o.owner))h.faction+=v;else h.other+=v;}
  h.world=h.npc+h.settlement+h.faction+h.other;return h;}
async function advance(n,phase){
  for(let i=0;i<n;i++){
    const a=structuredClone(ctx.doc.ledger?.accounts??{}),f=structuredClone(ctx.doc.ledger?.flows??{});
    const m0=ctx.doc.state.minute;await A('core:time',{minutes:STEP});
    const idx=steps.length;steps.push({phase,m0,m1:ctx.doc.state.minute,dA:diff(a,ctx.doc.ledger?.accounts),dF:diff(f,ctx.doc.ledger?.flows)});
    scan(idx);
  }
}
// ---- 主浸泡 ----
for(let d=0;d<DAYS;d++){
  await advance(24,'soak');
  daily.push({day:d+1,minute:ctx.doc.state.minute,holdings:Object.fromEntries(R.map(r=>[r,holdingsOf(ctx.doc,r)]))});
  process.stderr.write(`[${TAG}] day ${d+1}/${DAYS} ${((Date.now()-t0)/1000).toFixed(0)}s events=${events.length}\n`);
}
const soakEnd=ctx.doc,soakSteps=steps.length;
const books={audit:auditLedger(soakEnd.ledger).slice(0,5),conservation:conservation(ctx.engine,startDoc,soakEnd).slice(0,5)};
// ---- 记账归因：事件 → 可验证的产出 ----
const linked=(npc,owner)=>owner===npc||owner===settlementOfNpc(npc)||owner===NPCW.get(npc)?.scope||owner===NPCW.get(npc)?.householdId;
function windowOf(step){const ws=steps.slice(Math.max(0,step-2),Math.min(steps.length,step+2));const dA={},dF={};
  for(const s of ws){for(const [k,v] of Object.entries(s.dA))dA[k]=(dA[k]??0)+v;for(const [k,v] of Object.entries(s.dF))dF[k]=(dF[k]??0)+v;}return {dA,dF};}
function natureSource(w,item){let p=0;
  for(const [k,v] of Object.entries(w.dF)){const o=parse(k);if(o.resource===item&&/^src:/.test(o.owner)&&!BAD_SRC.test(o.owner)&&v>0)p+=v;}
  for(const [k,v] of Object.entries(w.dA)){const o=parse(k);if(o.resource===item&&isNature(o)&&v<0)p-=v;}return p;}
const linkedGain=(w,npc,item)=>Object.entries(w.dA).filter(([k,v])=>{const o=parse(k);return v>0&&o.resource===item&&linked(npc,o.owner);}).reduce((s,[,v])=>s+v,0);
const purseGain=(w,npc)=>Object.entries(w.dA).filter(([k,v])=>{const o=parse(k);return v>0&&o.owner===npc&&/^coin_/.test(o.resource);}).reduce((s,[,v])=>s+v,0);
const RX={gather:/gather|forag|harvest|collect|woodcut|mine|mining|fish|hunt|extract|采|伐|渔|猎/i,process:/craft|process|manufact|加工|制作/i,
  sell:/sell|vend|retail|market_trade|stall|出售|售/i,carry:/carry|haul|transport|deliver|porter|freight|caravan|搬运|运输|运货|挑运/i};
function schedSlot(npc,minute){const sch=ctx.doc.state.npcs[npc]?.schedule??NPCW.get(npc)?.schedule;if(!sch||minute==null)return null;
  const tod=((minute%1440)+1440)%1440;for(const tab of Object.values(sch))if(Array.isArray(tab)){const s=tab.find(x=>x.start<=tod&&tod<x.end);if(s)return {activity:s.activity,location:s.location};}return null;}
// 由真实账本产出的物品（非开局、非进货、非漂移的源，或自然储量被取走）
const producedItems=new Set();
for(const s of steps){for(const [k,v] of Object.entries(s.dF)){const o=parse(k);if(v>0&&/^src:/.test(o.owner)&&!BAD_SRC.test(o.owner))producedItems.add(o.resource);}}
const credited=[];
for(const e of events){
  if(!e.success)continue;const w=windowOf(e.step),c=[];
  for(const p of e.produced){
    const nat=natureSource(w,p.item),gain=linkedGain(w,e.actor,p.item);
    if(!e.consumed.length&&nat>0&&gain>0)c.push({cat:'gather',item:p.item,qty:Math.min(p.qty,gain),nature:nat});
    else if((e.consumed.length||RX.process.test(e.kind))&&gain>0)c.push({cat:'process',item:p.item,qty:Math.min(p.qty,gain)});
  }
  for(const c0 of c)if(c0.cat==='process'||c0.cat==='gather')producedItems.add(c0.item);
  if((RX.sell.test(e.kind)||e.side==='sell')&&e.buyer!==e.actor&&['seller','keeper','npc','actor','worker'].includes(e.role))
    for(const g of e.goods)c.push({cat:'sell',item:g.item,qty:g.qty,coins:e.coins,purse:purseGain(w,e.actor),pending:'traced'});
  if(RX.carry.test(e.kind)&&e.buyer!==e.actor&&e.from&&e.to&&e.from!==e.to)
    for(const g of e.goods)c.push({cat:'carry',item:g.item,qty:g.qty,from:e.from,to:e.to,pending:'traced'});
  if(c.length)credited.push({event:e.id,src:e.src,npc:e.actor,occupation:NPCW.get(e.actor)?.occupation??null,kind:e.kind,minute:e.minute,step:e.step,phase:steps[e.step]?.phase,slot:schedSlot(e.actor,e.minute),inputs:e.consumed.map(i=>i.item),from:e.from,to:e.to,credits:c,raw:e.raw});
}
// 出售与运输的货物必须能追到真实产出（劳动产出或非开局/进货的账本源）
for(const x of credited)for(const c of x.credits)if(c.pending){c.traced=producedItems.has(c.item);if(c.cat==='sell')c.paid=(c.coins>0)||(c.purse>0);delete c.pending;}
// ---- 价格随稀缺（--price）：买空 → 报价；等 K 天 NPC 供应 → 报价 ----
const priceRuns=[];
if(PRICE){
  const K=Math.max(1,Math.min(5,Math.floor(DAYS/6)));
  const settlementOf=settlementOfNpc;
  const inv=(id,r)=>ctx.doc.ledger?.accounts?.[`${id}|${r}|inventory`]??0;
  async function goTo(dest){if(dest&&ctx.doc.state.location!==dest)return A('core:move',{destination:dest});}
  async function quote(seller,r){
    for(let t=0;t<16;t++){await goTo(ctx.doc.state.npcs[seller]?.location);
      const q=await A('core:trade.buy',{seller,item:r,quantity:1},{commit:false});
      const p=q.result?.pricing;if(q.status==='committed'&&p)return {seller,price:p.unitPrice??p.listPrice,scarcity:p.scarcity,minute:ctx.doc.state.minute};
      if(t===15)return {seller,price:null,reason:q.reason};await A('core:time',{minutes:60});}
  }
  for(const r of R){
    // 每种物品各从浸泡结束时的同一份存档分叉，互不影响（避免前一物品买入的负重、时间、价格记忆串到下一物品）
    ctx.doc=soakEnd;seenAuto.clear();for(const k of Object.keys(soakEnd.state.npcAutonomy?.actions??{}))seenAuto.add(k);
    seenRec.clear();for(const k of Object.keys(soakEnd.state.records??{}))seenRec.add(k);craftsSeen=(soakEnd.ledger?.crafts??[]).length;
    const sup=new Map();for(const x of credited)if(x.phase==='soak')for(const c of x.credits)if(c.cat==='gather'&&c.item===r)sup.set(x.npc,(sup.get(x.npc)??0)+c.qty);
    const hold={};for(const id of Object.keys(ctx.doc.state.npcs)){const v=inv(id,r);const st=settlementOf(id);if(v>0&&st)hold[st]=(hold[st]??0)+v;}
    const M=[...sup].sort((a,b)=>b[1]-a[1])[0]?settlementOf([...sup].sort((a,b)=>b[1]-a[1])[0][0]):Object.entries(hold).sort((a,b)=>b[1]-a[1])[0]?.[0];
    const run={item:r,market:M??null,K};priceRuns.push(run);
    if(!M){run.blocked='世界里没有任何人持有该物';continue;}
    const sellersIn=()=>Object.keys(ctx.doc.state.npcs).filter(id=>settlementOf(id)===M&&inv(id,r)>0&&!(ctx.doc.state.npcs[id].hp<=0));
    const supplyIn=()=>sellersIn().reduce((s,id)=>s+inv(id,r),0);
    const ss=sellersIn().sort((a,b)=>inv(b,r)-inv(a,r));if(!ss.length){run.blocked=`${M} 没有持有 ${r} 的 NPC`;continue;}
    // 先问锚定卖家，不行再问本聚落其他持货人（最多 4 个）
    const quoteAny=async(r,first)=>{const c=[first,...sellersIn().filter(x=>x!==first).sort((a,b)=>inv(b,r)-inv(a,r))].filter(x=>x&&inv(x,r)>0).slice(0,4);const fails=[];
      for(const id of c){const q=await quote(id,r);if(q.price!=null)return q;fails.push(id+'：'+q.reason);}return {price:null,reason:fails.join('；')||'无人持有'};};
    let anchor=null;run.S0=supplyIn();run.tried=[];
    for(const id of ss.slice(0,4)){const q=await quote(id,r);if(q.price!=null){anchor=id;run.Q0=q;break;}run.tried.push({seller:id,reason:q.reason});}
    run.anchor=anchor;if(!anchor){run.blocked=`${M} 持有 ${r} 的卖家都报不出价：${run.tried.map(x=>x.seller+'：'+x.reason).join('；')}`;continue;}
    // 买空：逐件真实买入，买得动多少算多少。一旦因负重被拒，退回到最后一件买入之前的存档（等于少买一件），
    // 留出报价 1 件的负重；不因玩家负重把测量判 blocked。
    run.buys=[];const HEAVY=/拿不动|负重|承载/;let prev=null;
    outer: for(const id of sellersIn()){const n=inv(id,r)-(id===anchor?1:0);if(n<=0)continue;await goTo(ctx.doc.state.npcs[id]?.location);let got=0,last=null;
      for(let k=0;k<n;k++){const before=ctx.doc;const b=await A('core:trade.buy',{seller:id,item:r,quantity:1});
        if(b.status==='committed'){prev=before;got++;continue;}
        if(HEAVY.test(b.reason??'')){run.buys.push({seller:id,n:got});if(prev){ctx.doc=prev;run.undidLast=true;}run.capacityStop=b.reason;break outer;}
        last=b.reason;break;}
      run.buys.push({seller:id,n:got,...(last?{reason:last}:{})});}
    run.S1=supplyIn();run.Q1=await quoteAny(r,anchor);
    const s0=steps.length;await advance(24*K,`price:${r}`);
    run.S2=supplyIn();run.Q2=await quoteAny(r,anchor);
    run.windowSteps=[s0,steps.length];
  }
  // 价格窗口内的新事件也做归因（与主浸泡同一口径）
  for(const e of events.filter(e=>steps[e.step]?.phase?.startsWith('price:'))){if(!e.success)continue;const w=windowOf(e.step);
    for(const p of e.produced){if(!e.consumed.length&&natureSource(w,p.item)>0&&linkedGain(w,e.actor,p.item)>0)credited.push({event:e.id,npc:e.actor,phase:steps[e.step].phase,step:e.step,credits:[{cat:'gather',item:p.item,qty:Math.min(p.qty,linkedGain(w,e.actor,p.item))}]});}}
}
const occ=Object.fromEntries([...new Set(credited.map(x=>x.npc))].map(id=>[id,NPCW.get(id)?.occupation??null]));
const kinds={};for(const e of events){kinds[e.kind]=(kinds[e.kind]??0)+1;}
await fs.writeFile(OUT,JSON.stringify({tag:TAG,repo:REPO,days:DAYS,stepMinutes:STEP,seconds:(Date.now()-t0)/1000,start:startDoc.state.minute,soakSteps,
  playerActions:[...new Set(playerActions)],playerGatherCalls:playerActions.filter(a=>PLAYER_GATHER.has(a)).length,
  books,daily,eventKinds:kinds,eventCount:events.length,credited,occupations:occ,producedItems:[...producedItems],priceRuns,
  npcs:Object.fromEntries(world.npcs.map(n=>[n.id,{settlement:settlementOfNpc(n.id),occupation:n.occupation??null,age:n.age??null,minor:!!n.flags?.minor,tier:n.tier??null}]))},null,1));
console.error(`[${TAG}] done ${((Date.now()-t0)/1000).toFixed(0)}s credited=${credited.length} → ${OUT}`);
