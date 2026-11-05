// 浸泡观察：开一局新档，玩家不动，逐日推进（每天 05:59、11:59、17:59、23:59 各观察一次），只读存档。
// 产出：每日各聚落的区域价与存货、全部成交记录（附当步进口、本地他人存货）、带聚落间路线的记录存档、在途账户的起止、产出者、账本守恒。
import * as L from './lib.mjs';

const HOURS=[5,11,17,23];
export async function soak(T,{days,tag,watch=[],perCat=2,every=5,maxExtra=10,catOf=null,forceItems=null}){
  const ctx=T.newGame(`e2-${tag}`),t0=Date.now();
  // 账本在开局后的第一次结算才开出来：推进到账本有账户为止（最多一天）。
  await L.call(ctx,'world_time',{minutes:1});
  for(let i=0;i<48&&!Object.keys(ctx.doc.ledger?.accounts??{}).length;i++)await L.call(ctx,'world_time',{minutes:30});
  const startDoc=ctx.doc,active=Object.keys(ctx.doc.state.settlements??{});
  const itemIds=new Set(T.world.items.filter(i=>(i.basePrice??0)>0&&!(i.tags??[]).includes('coin')).map(i=>i.id));
  // 要读价的物：开局有人（人、家户、聚落）持有的可交易物，加上变异物。
  const ownerS=new Map(),sOfOwner=o=>{if(!ownerS.has(o))ownerS.set(o,T.ownerSettlement(o));return ownerS.get(o);};
  const priced=new Set(watch);
  for(const [k,v] of Object.entries(startDoc.ledger?.accounts??{})){if(v<=0)continue;const {owner,resource}=L.parse(k);if(itemIds.has(resource)&&sOfOwner(owner))priced.add(resource);}
  const items=[...priced];
  // 读区域价很贵（引擎每次约 1 秒），只读一个样本：每个类别取开局人均存货在各聚落间最不均的 perCat 种，
  // 加上窗口里出现跨聚落成交的物品（出现后才进样本，至多 maxExtra 种）。价格快照在第 0 天、每 every 天和最后一天读。
  const pc0={};for(const [k,v] of Object.entries(startDoc.ledger?.accounts??{})){if(v<=0||/escrow/.test(k))continue;const {owner,resource}=L.parse(k);if(!priced.has(resource))continue;const s=sOfOwner(owner);if(!s||!active.includes(s))continue;((pc0[resource]??={})[s]=(pc0[resource][s]??0)+v);}
  const imbalance=it=>{const v=active.map(s=>(pc0[it]?.[s]??0)/Math.max(1,T.population(s)??1));const m=L.mean(v);return m>0?L.sd(v)/m:0;};
  const byCat=new Map();for(const it of items){const c=catOf?catOf(it):'all';(byCat.get(c)??byCat.set(c,[]).get(c)).push(it);}
  const sample=new Set(watch);if(forceItems)for(const it of forceItems)sample.add(it);else for(const [,list] of byCat)for(const it of list.sort((a,b)=>imbalance(b)-imbalance(a)||a.localeCompare(b)).slice(0,perCat))sample.add(it);
  const extra=new Set();
  // 各聚落存货：账本上归属该聚落的人、家户、聚落与建筑持有的合计（不含在途、托管、野外储量）。
  const stockBySettlement=doc=>{const m={};for(const [k,v] of Object.entries(doc.ledger?.accounts??{})){if(v<=0||/escrow/.test(k))continue;const {owner,resource}=L.parse(k);
    if(!priced.has(resource))continue;const s=sOfOwner(owner);if(!s)continue;((m[resource]??={})[s]=(m[resource][s]??0)+v);}return m;};
  const readPrices=()=>{const row={};for(const item of [...sample,...extra]){const p={};for(const s of active){const v=T.price(ctx,item,s);if(v!=null)p[s]=v;}row[item]=p;}return row;};
  const daily=[{day:0,minute:ctx.doc.state.minute,prices:readPrices(),stock:stockBySettlement(ctx.doc)}];
  // 记录存档：带聚落间路线 id 的记录（行程、运单、承运），按 key 留最后一版。
  const routeRe=new RegExp('"('+[...T.interRouteIds].map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')"');
  const archive=new Map(),seenRef=new Map();
  const trades=new Map(),imports=[],producers=new Map(),cargo=new Map();
  const isRecord=o=>!!(ctx.doc.state.records?.[o]);
  let prev=ctx.doc,step=0;
  const endMinute=Math.floor(ctx.doc.state.minute/L.DAY)*L.DAY+days*L.DAY-1;
  for(let day=0;ctx.doc.state.minute<endMinute;){
    const tod=ctx.doc.state.minute%L.DAY,next=HOURS.find(h=>h*60+59>tod);
    const r=await L.call(ctx,'world_time',{until:next==null?{dayOffset:1,hour:HOURS[0],minute:59}:{dayOffset:0,hour:next,minute:59}});
    if(r.status!=='committed'){daily.push({day,stop:r.reason});break;}
    const doc=ctx.doc;step++;
    const {acc,flow}=L.ledgerDelta(prev,doc);
    const imp=new Map(),prod=new Map();
    for(const [k,d] of flow){const {owner,resource}=L.parse(k);if(d<=0)continue;if(owner==='src:import')imp.set(resource,(imp.get(resource)??0)+d);if(L.PRODUCTION.has(owner))prod.set(resource,(prod.get(resource)??0)+d);}
    for(const [it,q] of imp)if(!/^coin_/.test(it))imports.push({step,minute:doc.state.minute,item:it,qty:q});
    // 逐物的持有变化
    const byItem=new Map();
    for(const [k,d] of acc){const {owner,resource}=L.parse(k);if(L.isVirtual(owner)||/^coin_/.test(resource)||/escrow/.test(k))continue;const m=byItem.get(resource)??byItem.set(resource,new Map()).get(resource);m.set(owner,(m.get(owner)??0)+d);}
    for(const [item,m] of byItem){
      if((prod.get(item)??0)>0)for(const [o,d] of m)if(d>0&&!isRecord(o)){const P=producers.get(item)??producers.set(item,new Map()).get(item);if(!P.has(o))P.set(o,{step,minute:doc.state.minute});}
      // 在途账户：持有人是一条带聚落间路线的记录（运单）。记下它从谁手里接货、交到谁手里。
      for(const [c,d] of m){if(!isRecord(c)&&!prev.state.records?.[c])continue;const rec=doc.state.records?.[c]??prev.state.records?.[c];if(!routeRe.test(JSON.stringify(rec)))continue;
        const leg=cargo.get(c+'|'+item)??cargo.set(c+'|'+item,{carrierRecord:c,item,in:[],out:[]}).get(c+'|'+item);
        const others=[...m].filter(([o])=>o!==c&&!isRecord(o));
        if(d>0)leg.in.push({minute:doc.state.minute,step,qty:d,from:others.filter(([,x])=>x<0).map(([o])=>o),importInStep:imp.get(item)??0});
        else leg.out.push({minute:doc.state.minute,step,qty:-d,to:others.filter(([,x])=>x>0).map(([o])=>o)});}
    }
    // 新成交：附当步进口、成交前本地（买方所属聚落）他人存货
    let index=null;
    for(const [k,v] of Object.entries(doc.state.records??{})){
      if(v?.category==='market_trade'){if(trades.has(k))continue;
        index??=(()=>{const ix=new Map();for(const [kk,vv] of Object.entries(prev.ledger?.accounts??{})){if(vv<=0||/escrow/.test(kk))continue;const {owner,resource}=L.parse(kk);const s=sOfOwner(owner);if(!s)continue;(ix.get(resource)??ix.set(resource,[]).get(resource)).push([owner,s,vv]);}return ix;})();
        const sBuyer=sOfOwner(v.buyer),local=(index.get(v.item)??[]).filter(([o,s])=>s===sBuyer&&o!==v.buyer&&o!==v.seller).reduce((n,[, ,q])=>n+q,0);
        if(extra.size<maxExtra&&!sample.has(v.item)&&priced.has(v.item)){const a=sOfOwner(v.seller),b=sOfOwner(v.buyer),pl=T.settlementOf(v.place);if((a&&b&&a!==b)||(pl&&b&&pl!==b))extra.add(v.item);}
        trades.set(k,{...v,key:k,step,observedMinute:doc.state.minute,importInStep:imp.get(v.item)??0,localOtherBefore:local});continue;}
      if(seenRef.get(k)===v)continue;seenRef.set(k,v);
      const txt=JSON.stringify(v);if(routeRe.test(txt))archive.set(k,v);
    }
    prev=doc;
    if(doc.state.minute%L.DAY!==L.DAY-1)continue;
    day++;const snap=day%every===0||doc.state.minute+L.DAY>=endMinute;
    daily.push({day,minute:doc.state.minute,prices:snap?readPrices():null,stock:stockBySettlement(doc)});
    console.log(`[${tag}] day ${day}/${days} trades ${trades.size} trips/records ${archive.size} ${Math.round((Date.now()-t0)/1000)}s`);
  }
  const endDoc=ctx.doc;
  const audit=T.auditLedger(endDoc.ledger)??[],cons=T.conservation(ctx.engine,startDoc,endDoc)??[];
  return {tag,repo:T.repo,priceFn:T.priceName,active,items,priceSample:[...sample],priceExtra:[...extra],daily,trades:[...trades.values()],archive:[...archive].map(([key,rec])=>({key,rec})),imports,
    producers:Object.fromEntries([...producers].map(([i,m])=>[i,Object.fromEntries(m)])),cargo:[...cargo.values()],
    books:{audit:audit.slice(0,10),auditCount:audit.length,conservation:cons.slice(0,10),conservationCount:cons.length},
    startHolders:holdersOf(startDoc,watch),endHolders:holdersOf(endDoc,watch),seconds:Math.round((Date.now()-t0)/1000),ctx};
}
function holdersOf(doc,items){const out={};for(const it of items){out[it]={};for(const [k,v] of Object.entries(doc.ledger?.accounts??{})){const {owner,resource}=L.parse(k);if(resource===it&&v>0&&!L.isVirtual(owner))out[it][owner]=(out[it][owner]??0)+v;}}return out;}
