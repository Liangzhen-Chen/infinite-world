// 卡 E2 跨聚落贩运与商人套利·现象验收。
// 用法：node acceptance.mjs [--days N] [--trials K] [--rebuild] [--no-mut]
//   --days N   浸泡天数（默认 30；本机冒烟用 ≤3）
//   --trials K 第 5 条每种物品做几件残次件（默认 2）
//   --rebuild  重建变异副本 mut/
//   --no-mut   不跑变异（第 4、7 条判 skipped）
// 输出 acceptance.json（ACC_TAG=x 时为 acceptance-x.json）；全部断言 pass 时退出码 0。
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';
import {soak} from './soak.mjs';
import {deliveries,categoryOf,gapOf,pairKey} from './analyze.mjs';
import {runDefects} from './defect.mjs';
import {build} from './mutate.mjs';

const DAYS=+L.argOf('days','30'),TRIALS=+L.argOf('trials','2'),NOMUT=L.has('--no-mut'),PER_CAT=+L.argOf('price-per-cat','2'),EVERY=+L.argOf('price-every','5');
const t0=Date.now(),results=[];
const put=(id,status,detail,evidence={})=>{results.push({id,status,detail,evidence});console.log(`[${status}] ${id} ${detail}`);};
const uniq=a=>[...new Set(a)];
const short=a=>a.slice(0,30);

// ---------- 主世界 ----------
const T=await L.openRepo(L.BASE);
const useCfg=JSON.parse(fs.readFileSync(path.join(T.repo,'world/meta/item-use-tags.json'),'utf8'));
const catOf=it=>categoryOf(T,useCfg,it);
const main=await soak(T,{days:DAYS,tag:'main',perCat:PER_CAT,every:EVERY,catOf});
const D=deliveries(T,main);
const daysRun=main.daily.length-1;
const snaps=main.daily.filter(r=>r.prices),first=snaps[0],last=snaps.at(-1);

// 1. 区域价分化：按类别汇总"聚落对"。每对（同一物、两聚落、价格相差 >1%、人均存货不同）看方向是否一致：人均存货多的那边更便宜。
//    人均存货 = 窗口内各日该聚落存货的均值 ÷ 人口；价格取窗口内各日均值（开局那天不算，只跑 0 天时用开局）。
{
  const rows=main.daily.length>1?main.daily.slice(1):main.daily;// 价格只在快照日有，存货每日都有
  const avg=(f)=>{const m={};for(const r of rows)for(const [item,ps] of Object.entries(f(r)??{}))for(const [s,v] of Object.entries(ps)){((m[item]??={})[s]??=[]).push(v);}return m;};
  const P=avg(r=>r.prices),S=avg(r=>r.stock);
  const byCat={};
  for(const item of main.items){
    const ps=P[item]??{},ss=Object.keys(ps).filter(s=>T.population(s)>0);if(ss.length<2)continue;
    const price=Object.fromEntries(ss.map(s=>[s,L.mean(ps[s])])),spc=Object.fromEntries(ss.map(s=>[s,(S[item]?.[s]?L.mean(S[item][s].concat(Array(Math.max(0,rows.length-S[item][s].length)).fill(0))):0)/T.population(s)]));
    const vals=Object.values(price),spread=Math.max(...vals)/Math.min(...vals)-1;
    const cat=categoryOf(T,useCfg,item),c=byCat[cat]??={cat,items:0,differing:[],pairs:0,concordant:0,examples:[]};c.items++;
    if(spread<=0.01)continue;c.differing.push(item);
    for(let i=0;i<ss.length;i++)for(let j=i+1;j<ss.length;j++){const a=ss[i],b=ss[j];
      if(Math.abs(price[a]/price[b]-1)<=0.01||spc[a]===spc[b])continue;
      const ok=(spc[a]>spc[b])===(price[a]<price[b]);c.pairs++;if(ok)c.concordant++;
      if(c.examples.length<4)c.examples.push({item,[a]:{price:+price[a].toFixed(2),perCapita:+spc[a].toFixed(3)},[b]:{price:+price[b].toFixed(2),perCapita:+spc[b].toFixed(3)},concordant:ok});}
  }
  const cats=Object.values(byCat).map(c=>({...c,differing:c.differing.length,differingItems:c.differing.slice(0,8),pass:c.differing.length>0&&L.binom25(c.concordant,c.pairs)}));
  const passCats=cats.filter(c=>c.pass);
  put('E2-1 区域价分化',passCats.length>=3?'pass':'fail',
    `${daysRun} 天均值：价格在聚落间不同（>1%）且方向与人均存货一致（二项 2.5σ）的类别 ${passCats.length} 个（要 ≥3）：${passCats.map(c=>`${c.cat} ${c.concordant}/${c.pairs}`).join('，')||'无'}；有价差的物品共 ${cats.reduce((n,c)=>n+c.differing,0)}/${cats.reduce((n,c)=>n+c.items,0)} 种`,
    {priceFn:main.priceFn,categories:cats.sort((a,b)=>b.pairs-a.pairs)});
}

// 2. 跨聚落进货（交付到持货人：人或家户）
{
  const hd=D.filter(d=>d.toHolder);
  const shortage=hd.filter(d=>d.shortage);
  const items=uniq(hd.map(d=>d.item)),pairs=uniq(hd.map(d=>pairKey(d.originS,d.destS))),sellers=uniq(hd.map(d=>d.origin));
  put('E2-2a 跨聚落进货出现',hd.length&&shortage.length&&items.length>=2&&pairs.length>=2&&sellers.length>=2?'pass':'fail',
    `交付到持货人的跨聚落进货 ${hd.length} 笔（成交 A ${hd.filter(d=>d.kind==='A').length}、贩运 B ${hd.filter(d=>d.kind==='B').length}、运单 C ${hd.filter(d=>d.kind==='C').length}）；物品 ${items.length} 种、聚落对 ${pairs.length} 个、卖方 ${sellers.length} 位（各要 ≥2）；本地他人存货不足时进的 ${shortage.length} 笔（要 ≥1）`,
    {sample:short(hd),items,pairs});
  const bad=hd.filter(d=>!d.traced);
  put('E2-2b 每笔可追溯',hd.length&&!bad.length?'pass':'fail',
    hd.length?`${hd.length} 笔里 ${hd.length-bad.length} 笔能追到卖方、承运人、路线、用时；缺：卖方 ${bad.filter(d=>!d.trace.seller).length}、承运人 ${bad.filter(d=>!d.trace.carrier).length}、路线 ${bad.filter(d=>!d.trace.route).length}、用时 ${bad.filter(d=>!d.trace.time).length}`:'没有任何交付到持货人的跨聚落进货',
    {untraced:short(bad)});
  const control=D.filter(d=>!d.toHolder);
  put('E2-2c 账本守恒（主世界）',!main.books.auditCount&&!main.books.conservationCount?'pass':'fail',`账本审计 ${main.books.auditCount} 条、逐资源守恒 ${main.books.conservationCount} 条`,
    {...main.books,controlNonHolderDeliveries:control.length,controlSample:control.slice(0,4)});
}

// 3. 商人套利
let carried=[];
{
  const trips=D.filter(d=>d.kind==='B');
  const profit=trips.filter(d=>d.sellUnit>d.buyUnit&&d.evidence);
  const items=uniq(profit.map(d=>d.item)),pairs=uniq(profit.map(d=>pairKey(d.originS,d.destS))),merchants=uniq(profit.map(d=>d.carrier));
  put('E2-3a 有 NPC 低买高卖、真实搬运',profit.length&&items.length>=2&&pairs.length>=2&&merchants.length>=2?'pass':'fail',
    `跨聚落转卖 ${trips.length} 趟，其中卖价高于进价且有行程记录 ${profit.length} 趟；物品 ${items.length}、聚落对 ${pairs.length}、贩运者 ${merchants.length}（各要 ≥2）`,
    {trips:short(trips.map(d=>({merchant:d.carrier,item:d.item,from:d.originS,to:d.destS,buyUnit:d.buyUnit,sellUnit:d.sellUnit,tBuy:d.tBuy,tSell:d.tDeliver,evidence:d.evidence})))});
  const units=new Map();for(const d of profit){const k=d.item+'|'+pairKey(d.originS,d.destS);if(!units.has(k))units.set(k,{item:d.item,a:d.originS,b:d.destS,trips:0});units.get(k).trips++;}
  carried=[...units.values()].map(u=>({...u,gapStart:gapOf(first.prices,u.item,u.a,u.b),gapEnd:gapOf(last.prices,u.item,u.a,u.b)})).filter(u=>u.gapStart!=null&&u.gapEnd!=null);
  const k=carried.filter(u=>u.gapEnd<u.gapStart).length;
  put('E2-3b 贩运后价差收窄',carried.length&&L.binom25(k,carried.length)?'pass':'fail',
    carried.length?`被贩运的（物品、聚落对）${carried.length} 个，起止比较收窄 ${k} 个（二项 2.5σ：k/n − 2.5·√(0.25/n) > 0.5，全数收窄也要 n ≥ 7）`:'没有可比较的被贩运物品与聚落对',{units:short(carried)});
  const traders=uniq(trips.filter(d=>d.evidence).map(d=>d.carrier)).map(id=>({id,occupation:T.occupationOf(id),carry:T.carryLabelled(id)}));
  const nonCarry=traders.filter(t=>!t.carry);
  put('E2-3c 贩运者不限 carry 职业',nonCarry.length?'pass':'fail',
    `有行程记录的贩运者 ${traders.length} 位，职业里没有 carry 的 ${nonCarry.length} 位（carry 职业：${T.carryProfessions.join('，')}）`,{traders:short(traders)});
}

// 6. 派生卖家
{
  const keepers=new Set((T.world.rules.economy?.shops?.stores??[]).map(s=>s.keeper));
  const original=new Set(T.world.npcs.filter(n=>(n.serviceCatalog??[]).some(s=>s.kind==='trade')||n.shopType).map(n=>n.id));
  const by=new Map();
  for(const t of main.trades){if(!T.isNpc(t.seller)||original.has(t.seller)||keepers.has(t.seller)||t.buyer==='player'||t.buyer===t.seller||t.importInStep>0)continue;
    const s=by.get(t.seller)??by.set(t.seller,{buyers:new Set(),items:new Set(),trades:0}).get(t.seller);s.buyers.add(t.buyer);s.items.add(t.item);s.trades++;}
  const endNpcs=main.ctx.doc.state.npcs;
  const derived=[...by].filter(([id,s])=>s.buyers.size>=2).map(([id,s])=>({id,occupation:T.occupationOf(id),buyers:s.buyers.size,items:[...s.items],trades:s.trades,
    shopType:T.world.npcs.find(n=>n.id===id)?.shopType??endNpcs[id]?.shopType??null}));
  const ok=derived.filter(d=>!d.shopType),items=uniq(ok.flatMap(d=>d.items));
  put('E2-6 派生卖家',ok.length>=2&&items.length>=2?'pass':'fail',
    `原来不卖货（没有 trade 服务、不是店主、没有 shopType）、却向 ≥2 位不同买主卖出、当步没有凭空进货的卖家 ${ok.length} 位，卖出物品 ${items.length} 种（各要 ≥2）`,{derived:short(derived)});
}

// 5. 残次品卖得更低
{
  const R=await runDefects(T,{trials:TRIALS});
  const done=R.rows.filter(r=>!r.blocked);
  const sellOk=r=>r.sellStandard?.status==='committed'&&r.sellStandard.soldWasStandard&&r.sellDefective.length&&r.sellDefective.every(s=>s.status==='committed'&&s.price!=null&&s.price<r.sellStandard.price);
  const buyOk=r=>r.buyDefective?.status==='committed'&&r.buyDefective.gotIt&&r.buyStandard?.status==='committed'&&r.buyStandard.sellerHadOnlyStandard&&r.buyDefective.price<r.buyStandard.price;
  const ev={candidates:R.candidates,rows:R.rows.map(r=>({item:r.item,recipe:r.recipe,buyer:r.buyer,blocked:r.blocked??null,attempts:r.attempts,sellDefective:r.sellDefective,sellStandard:r.sellStandard,buyerKeepsUnit:r.buyerKeepsUnit,buyDefective:r.buyDefective,buyStandard:r.buyStandard,steps:r.steps.slice(0,8),books:r.books}))};
  const st=(f)=>done.length<2?'blocked':done.filter(f).length>=2?'pass':'fail';
  const why=done.length<2?`前提造不出：能做出残次件并买到标准件的物品只有 ${done.length} 种（${R.rows.filter(r=>r.blocked).map(r=>r.item+'：'+r.blocked).join('；')||'无候选'}）`:'';
  put('E2-5a 残次件卖给 NPC 单价更低',st(sellOk),why||`${done.filter(sellOk).length}/${done.length} 种物品：同一时刻同一买家，残次件（缺用途或低 grade）单价都低于标准件（要 ≥2 种）`,ev);
  put('E2-5b NPC 转卖残次件单价更低',st(buyOk),why||`${done.filter(buyOk).length}/${done.length} 种物品：残次件卖给持货人后，点名买回它的单价低于他手里的标准件（要 ≥2 种）`,{});
}

// ---------- 变异 ----------
if(NOMUT){for(const id of ['E2-4 路线远近与安危影响价差','E2-7a 新物有产出','E2-7b 新物运到有需求的聚落','E2-7c 新物在那里成交','E2-7d 新物没有凭空来源'])put(id,'skipped','--no-mut');}
else{
  const info=await build();
  // 4. 路线：被测树主线 vs 副本里把一条路线调远调险。比经过这条路线的（物品、聚落对）在两局里的收窄比例 (起−止)/起。
  {
    const TR=await L.openRepo(info.route.dir);
    const mr=await soak(TR,{days:DAYS,tag:'route',perCat:PER_CAT,every:EVERY,catOf,forceItems:[...main.priceSample,...main.priceExtra]});
    const R=info.route.route,act=main.active;
    const pairsVia=[],pairsOff=[];for(let i=0;i<act.length;i++)for(let j=i+1;j<act.length;j++){const p=T.routePath(act[i],act[j]);if(!p)continue;(p.includes(R)?pairsVia:pairsOff).push([act[i],act[j]]);}
    const DR=deliveries(TR,mr);
    const carriedKeys=new Set(D.filter(d=>d.kind==='B'||d.toHolder).map(d=>d.item+'|'+pairKey(d.originS,d.destS)));
    const frac=(o,item,a,b)=>{const sn=o.daily.filter(r=>r.prices);const s=gapOf(sn[0].prices,item,a,b),e=gapOf(sn.at(-1).prices,item,a,b);return s>0&&e!=null?(s-e)/s:null;};
    const unitsOf=pairs=>pairs.flatMap(([a,b])=>main.items.filter(item=>carriedKeys.has(item+'|'+pairKey(a,b))).map(item=>({item,a,b,main:frac(main,item,a,b),mut:frac(mr,item,a,b)}))).filter(u=>u.main!=null&&u.mut!=null).map(u=>({...u,d:u.main-u.mut}));
    const via=unitsOf(pairsVia),off=unitsOf(pairsOff);
    const books=!mr.books.auditCount&&!mr.books.conservationCount;
    put('E2-4 路线远近与安危影响价差',via.length&&L.paired25(via.map(u=>u.d))&&books?'pass':'fail',
      via.length?`经过 ${R}（路程 ${info.route.before.lengthKm.toFixed(1)}→${info.route.after.lengthKm.toFixed(1)} km，事故率 ${info.route.before.risk}→${info.route.after.risk}）的被贩运（物品、聚落对）${via.length} 个：原路线的收窄比例减调远调险后的，均值 ${L.mean(via.map(u=>u.d)).toFixed(3)}，要 > 2.5·sd/√n = ${(2.5*L.sd(via.map(u=>u.d))/Math.sqrt(via.length)).toFixed(3)}；对照（不经过这条路线）${off.length} 个，均值 ${off.length?L.mean(off.map(u=>u.d)).toFixed(3):'无'}；副本账本${books?'守恒':'不守恒'}`
        :`主线上没有经过 ${R} 的贩运或跨聚落进货，无从比较（被贩运的物品与聚落对 ${carriedKeys.size} 个）`,
      {mutation:info.route,via:short(via),off:short(off),mutBooks:mr.books,mutTrips:DR.filter(d=>d.kind==='B').length,mainTrips:D.filter(d=>d.kind==='B').length});
    delete mr.ctx;
  }
  // 7. 新可交易物
  {
    const TI=await L.openRepo(info.item.dir);
    const mi=await soak(TI,{days:DAYS,tag:'item',watch:[info.item.item],perCat:0,every:DAYS+1});
    const it=info.item.item,home=info.item.producerSettlement;
    const prod=Object.keys(mi.producers[it]??{});
    const DI=deliveries(TI,mi).filter(d=>d.item===it);
    const away=DI.filter(d=>d.destS&&d.destS!==home);
    const sold=mi.trades.filter(t=>t.item===it).map(t=>({...t,sPlace:TI.settlementOf(t.place),sBuyer:TI.ownerSettlement(t.buyer)})).filter(t=>(t.sPlace??t.sBuyer)&&(t.sPlace??t.sBuyer)!==home);
    const holdersAway=Object.entries(mi.endHolders[it]??{}).filter(([o])=>{const s=TI.ownerSettlement(o);return s&&s!==home;});
    const imported=mi.imports.filter(x=>x.item===it).reduce((n,x)=>n+x.qty,0),startQty=Object.values(mi.startHolders[it]??{}).reduce((a,b)=>a+b,0);
    const blockedWhy=`缺上游规律：${daysRun} 天里没有人采到或做出这件新物（NPC 采集或生产不覆盖新数据），属于生产与职业劳动的卡（K1/K3）`;
    put('E2-7a 新物有产出',prod.length?'pass':'blocked',prod.length?`产出者 ${prod.length} 位：${prod.slice(0,6).join('，')}`:blockedWhy,{mutation:info.item,producers:mi.producers[it]??{}});
    put('E2-7b 新物运到有需求的聚落',!prod.length?'blocked':away.some(d=>d.traced)?'pass':'fail',
      prod.length?`从产地 ${home} 运到别的聚落、能追到卖方承运路线用时的 ${away.filter(d=>d.traced).length}/${away.length} 笔；窗口末产地外持有 ${holdersAway.length} 处`:blockedWhy,{deliveries:short(away),holdersAway});
    put('E2-7c 新物在那里成交',!prod.length?'blocked':sold.length?'pass':'fail',prod.length?`产地外的成交 ${sold.length} 笔`:blockedWhy,{sold:short(sold)});
    put('E2-7d 新物没有凭空来源',!imported&&!startQty&&!mi.books.auditCount&&!mi.books.conservationCount?'pass':'fail',`src:import 进货 ${imported}、开局持有 ${startQty}；副本账本审计 ${mi.books.auditCount}、守恒 ${mi.books.conservationCount}`,{books:mi.books});
  }
}

// ---------- 汇总 ----------
const expected=fs.existsSync(path.join(L.OUT_DIR,'expected.json'))?JSON.parse(fs.readFileSync(path.join(L.OUT_DIR,'expected.json'),'utf8')).pass??[]:[];
const summary={pass:0,fail:0,blocked:0,skipped:0};for(const r of results)summary[r.status]++;
const notYet=expected.filter(id=>results.find(r=>r.id===id)?.status!=='pass');
delete main.ctx;
const out={tree:L.BASE,days:DAYS,daysRun,trials:TRIALS,seconds:Math.round((Date.now()-t0)/1000),summary,expectedNotPass:notYet,results,
  main:{priceFn:main.priceFn,active:main.active,items:main.items.length,trades:main.trades.length,archive:main.archive.length,deliveries:D.length,imports:main.imports.length}};
L.write(process.env.ACC_TAG?`acceptance-${process.env.ACC_TAG}.json`:'acceptance.json',out);
console.log(JSON.stringify(summary),`${out.seconds}s`);
process.exit(results.every(r=>r.status==='pass')?0:1);
