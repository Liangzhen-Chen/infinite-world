// 从浸泡观察推出：跨聚落的货物交付（含承运人、路线、用时）、商人贩运、派生卖家、价差。只读观察结果。
import * as L from './lib.mjs';

const TIME_KEY=/(At|Minute|minute|Time)$|^(depart|arriv|dispatch|deliver|start|end|minute|startedAt|finishAt|returnAt)/;
const DUR_KEY=/^(estimatedMinutes|travelMinutes|durationMinutes|duration|movingMinutes|minutes)$/;
const CARRIER_KEY=/^(carrier|carriers|hauler|haulers|porter|porters|courier|driver|merchant|trader|actor|npc|escort|escorts|worker|workers|crew|by|agent)$/i;
// 记录里的证据：路线 id（聚落间路线）、时间戳、显式用时、点名的承运人（NPC id）。
function evidenceOf(T,rec){
  const routes=new Set(),times=[],durs=[],carriers=new Set();
  const walk=(v,k)=>{
    if(typeof v==='string'){if(T.interRouteIds.has(v))routes.add(v);if(k&&CARRIER_KEY.test(k)&&T.isNpc(v))carriers.add(v);return;}
    if(typeof v==='number'){if(k&&TIME_KEY.test(k))times.push(v);if(k&&DUR_KEY.test(k)&&v>0)durs.push(v);return;}
    if(Array.isArray(v)){for(const x of v)walk(x,k);return;}
    if(v&&typeof v==='object')for(const [kk,x] of Object.entries(v))walk(x,kk);
  };
  walk(rec,null);
  const span=times.length?Math.max(...times)-Math.min(...times):0;
  return {routes:[...routes],times,duration:Math.max(span,...durs,0),carriers:[...carriers]};
}
const mentions=(txt,id)=>!!id&&txt.includes('"'+id+'"');

export function deliveries(T,obs){
  const recs=obs.archive.map(a=>({key:a.key,rec:a.rec,txt:JSON.stringify(a.rec),ev:evidenceOf(T,a.rec)}));
  const trades=obs.trades.map(t=>({...t,sSeller:T.ownerSettlement(t.seller),sBuyer:T.ownerSettlement(t.buyer),sPlace:T.settlementOf(t.place),unit:t.quantity?t.totalCoins/t.quantity:null}));
  const holderLike=id=>id&&id!=='player'&&(T.isNpc(id)||T.isHousehold(id));
  // 找行程或运单：记录点名候选承运人，所带的聚落间路线连着起点聚落和终点聚落，时间落在窗口里（前后各放一天）。
  const trip=(cands,t0,t1,sA,sB,item)=>{
    for(const r of recs){
      const who=cands.find(c=>mentions(r.txt,c))??r.ev.carriers.find(c=>mentions(r.txt,item)&&(mentions(r.txt,sA)||mentions(r.txt,sB)));
      if(!who)continue;
      const ends=r.ev.routes.flatMap(id=>{const e=T.routeById.get(id);return [T.endS(e.from),T.endS(e.to)];});
      if(!ends.includes(sA)||!ends.includes(sB))continue;// 路线要把起点聚落和终点聚落都连上
      if(!r.ev.times.some(x=>x>=t0-L.DAY&&x<=t1+L.DAY))continue;
      return {record:r.key,category:r.rec.category??null,carrier:who,routes:r.ev.routes,duration:r.ev.duration};
    }
    return null;
  };
  const out=[];
  // A：买卖双方分属两个聚落的成交（买方去对方聚落进货，或卖方送货上门，或经运单交付）。
  for(const t of trades){
    if(!holderLike(t.seller)||!holderLike(t.buyer)||!t.sSeller||!t.sBuyer||t.sSeller===t.sBuyer)continue;
    const ev=trip([t.buyer,t.seller],t.minute,t.minute,t.sSeller,t.sBuyer,t.item);
    out.push({kind:'A',item:t.item,origin:t.seller,originS:t.sSeller,dest:t.buyer,destS:t.sBuyer,qty:t.quantity,tBuy:t.minute,tDeliver:t.minute,
      unit:t.unit,importInStep:t.importInStep,localOtherBefore:t.localOtherBefore,trade:t.key,evidence:ev});
  }
  // B：同一个 NPC 在甲聚落买进、之后在乙聚落卖出同一物（贩运）。
  const byNpc=new Map();for(const t of trades){for(const [role,id] of [['buy',t.buyer],['sell',t.seller]])if(T.isNpc(id))(byNpc.get(id)??byNpc.set(id,[]).get(id)).push({role,t});}
  for(const [m,list] of byNpc){
    const buys=list.filter(x=>x.role==='buy').map(x=>x.t),sells=list.filter(x=>x.role==='sell').map(x=>x.t);
    for(const s of sells){const sB=s.sPlace??s.sBuyer;if(!sB)continue;
      const b=buys.filter(b=>b.item===s.item&&b.minute<s.minute&&(b.sPlace??b.sSeller)&&(b.sPlace??b.sSeller)!==sB).sort((x,y)=>y.minute-x.minute)[0];
      if(!b)continue;const sA=b.sPlace??b.sSeller;
      const ev=trip([m],b.minute,s.minute,sA,sB,s.item);
      out.push({kind:'B',item:s.item,origin:b.seller,originS:sA,carrier:m,dest:s.buyer,destS:sB,qty:s.quantity,tBuy:b.minute,tDeliver:s.minute,
        buyUnit:b.unit,sellUnit:s.unit,importInStep:b.importInStep,localOtherBefore:s.localOtherBefore,buyTrade:b.key,sellTrade:s.key,
        evidence:ev?{...ev,carrier:m}:null});
    }
  }
  // C：在途账户（持有人是带聚落间路线的记录）：接货方 → 交货方。
  for(const leg of obs.cargo){
    const rec=obs.archive.find(a=>a.key===leg.carrierRecord)?.rec;const ev=rec?evidenceOf(T,rec):{routes:[],duration:0,carriers:[]};
    const origin=leg.in[0]?.from?.[0]??null,originS=T.ownerSettlement(origin)??(T.settlementIds.has(origin)?origin:null);
    for(const o of leg.out)for(const dest of o.to){const destS=T.ownerSettlement(dest)??(T.settlementIds.has(dest)?dest:null);
      out.push({kind:'C',item:leg.item,origin,originS,dest,destS,qty:o.qty,tBuy:leg.in[0]?.minute??null,tDeliver:o.minute,importInStep:leg.in[0]?.importInStep??0,
        localOtherBefore:null,cargo:leg.carrierRecord,evidence:{record:leg.carrierRecord,category:rec?.category??null,carrier:ev.carriers[0]??null,routes:ev.routes,duration:Math.max(ev.duration,(o.minute-(leg.in[0]?.minute??o.minute)))}});}
  }
  for(const d of out){
    const e=d.evidence;
    d.trace={seller:!!d.origin&&d.origin!=='player'&&!(d.importInStep>0),carrier:!!e?.carrier&&T.isNpc(e.carrier),route:!!e?.routes?.length,time:(e?.duration??0)>0};
    d.traced=Object.values(d.trace).every(Boolean);
    d.toHolder=holderLike(d.dest);
    d.shortage=d.localOtherBefore!=null&&d.localOtherBefore<d.qty;
  }
  return out;
}

// 物品类别：先按用途类别（item-use-tags 的 classes，按下面的顺序取第一个），否则按材料性状，其余归 other。
const CLASS_ORDER=['grain','food','medicine','fuel','salt','timber','apparel','durable'];
const FAMILY=[['皮毛',/leather|hide|fur|wool|hair|feather/],['金属',/metal|iron|ore|steel|copper/],['布',/fiber|cloth|flax|silk|yarn/],['陶石',/ceramic|stone|clay|slate|mineral/],['纸书',/paper|book|ink|pigment/]];
export function categoryOf(T,useCfg,id){
  const it=T.world.items.find(i=>i.id===id),t=it?.tags??[];
  for(const k of CLASS_ORDER){const cl=useCfg.classes[k];if(!cl)continue;if((cl.exclude??[]).some(x=>t.includes(x)))continue;if((cl.tags??[]).some(x=>t.includes(x))||(cl.nutrition&&it?.nutrition))return k;}
  for(const [name,re] of FAMILY)if(t.some(x=>re.test(x)))return name;
  return 'other';
}

// 两地价差：高价 ÷ 低价 − 1。
export const gapOf=(prices,item,a,b)=>{const p=prices?.[item];if(!(p?.[a]>0)||!(p?.[b]>0))return null;return Math.max(p[a],p[b])/Math.min(p[a],p[b])-1;};
export const pairKey=(a,b)=>[a,b].sort().join('~');
