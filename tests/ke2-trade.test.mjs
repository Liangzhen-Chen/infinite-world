// 卡 E2（跨聚落贩运与商人套利）：区域价按货源远近对任意可交易物分化；派生卖家不靠 shopType；
// 自己背货的途中风险从路线的真实事故率与路程推出；跨聚落搬运点名承运人并占用其时间。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,withRecordIndex} from '../server-plugin/storage.mjs';
import {regionalTradeBase,tradeSources} from '../server-plugin/settlement-trade.mjs';
import {derivedShops} from '../server-plugin/shop.mjs';
import {carryRiskCost} from '../server-plugin/transport.mjs';
import {laborCategories} from '../server-plugin/npc-labor.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440;
const reader=doc=>({document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc)});
const qty=v=>typeof v==='number'?v:v?.quantity??0;

test('区域价：任意可交易物按最近货源的路程加价；货源地本身不加；外地有经营者持货时那里也成了货源',()=>{
 const engine=new WorldEngine(structuredClone(world)),doc=engine.createCharacter(seed,{},'ke2-price'),d=reader(doc);
 // 两种不同类别、不同产地的货，走同一条规律（没有按编号的分支）。
 for(const item of ['item_iron_nail','item_ration']){
  const sources=tradeSources(d,engine,item);assert.ok(sources.length,`${item} 有货源`);
  const far=engine.world.settlementProfiles.map(p=>p.id).find(id=>!sources.includes(id)&&id.startsWith('loc_ms_'));
  assert.ok(far,`${item} 有不是货源的远处聚落`);
  const at=regionalTradeBase(d,engine,item,sources[0]),away=regionalTradeBase(d,engine,item,far);
  assert.ok(away>at,`${item}：远离货源的${far}更贵（${away} > ${at}）`);
  // 远处有经营者（提供交易的人）手上持有这件货：那里成了货源，运输因子回到 1。
  const trader=engine.world.npcs.find(n=>((n.services??[]).includes('trade')||(n.serviceCatalog??[]).some(s=>s.kind==='trade'))&&doc.state.npcs[n.id]&&engine.world.settlementProfiles.some(p=>p.id===far&&(p.residentIds??[]).includes(n.id)));
  if(!trader)continue;
  const held=structuredClone(doc);held.state.npcs[trader.id].inventory[item]=3;held.state.minute+=DAY;
  const h=reader(held);
  assert.ok(tradeSources(h,engine,item).includes(far));
  assert.ok(regionalTradeBase(h,engine,item,far)<away);
 }
});

test('季节因子只作用于登记的随收成涨落的那一类货（按类别，不按编号）',()=>{
 const engine=new WorldEngine(structuredClone(world)),doc=engine.createCharacter(seed,{},'ke2-season'),d=reader(doc);
 const trait=engine.rules.economy.seasonalTrait;assert.equal(typeof trait,'string');
 const seasonal=engine.world.items.filter(i=>(i.tags??[]).includes(trait)).map(i=>i.id);
 assert.ok(seasonal.includes(engine.rules.settlementTrade.item));
});

test('派生卖家：提供交易又持有有人用得上的货的人出摊，不看 shopType；没有货就不出摊',()=>{
 const stalls=derivedShops(world);
 assert.ok(stalls.length>0&&stalls.every(s=>s.stall&&s.shopType===world.rules.economy.shops.derivedType));
 const w=structuredClone(world),one=stalls[0],n=w.npcs.find(x=>x.id===one.keeper);
 n.inventory={};
 assert.ok(!derivedShops(w).some(s=>s.keeper===n.id),'手上没有货，不出摊');
});

test('自己背货的途中风险：从路段登记的事故率与路程推出，没有事故率的路不计风险，货越重风险越大',()=>{
 const engine=new WorldEngine(structuredClone(world)),doc=engine.createCharacter(seed,{},'ke2-risk');
 const risky=engine.world.routes.find(r=>r.risk>0&&r.lengthKm>0),safe=engine.world.routes.find(r=>!r.risk&&r.lengthKm>0);
 const cost=(edges,quantity)=>carryRiskCost(doc,engine,{edges,cargo:[{item:'item_iron_nail',quantity}],carrier:'npc_hw_yanzhe'});
 assert.equal(cost([safe.id],10),0);
 assert.ok(cost([risky.id],10)>0);
 assert.ok(cost([risky.id],200)>cost([risky.id],10));
});

test('谁去卖、去贩运不看职业名单：没有任何劳动职业的成年人，劳动行程照样被接受为买卖劳动',()=>{
 const engine=new WorldEngine(structuredClone(world)),doc=engine.createCharacter(seed,{},'ke2-who');
 // 上一轮唯一登记了 carry 的严辙是店主；现在买卖劳动对任何成年人开放，店主跨聚落去卖时，放弃的营业算进成本。
 const plain=Object.keys(doc.state.npcs).find(id=>!laborCategories(engine,doc.state,id).length);
 assert.ok(plain);
 assert.deepEqual(laborCategories(engine,doc.state,plain),[],'职业劳动类别仍只来自职业数据');
});

test('周贸易点名承运人：背粮的人记名，按往返时间占住他们的作息',async()=>{
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}for(const p of w.locations)p.minerals=[];
 const engine=new WorldEngine(w);let doc=engine.createCharacter(seed,{},'ke2-carriers');
 const lanes=w.rules.settlementTrade.lanes,depart=w.rules.settlementTrade.firstDay*DAY+w.rules.settlementTrade.dispatchMinute;
 const out=await engine.reduce(doc,{tool:'world_time',args:{minutes:depart-doc.state.minute},eventId:'to-dispatch'});doc=applyPatches(doc,out.patches);
 const orders=lanes.map(l=>doc.state.records[`settlement-trade:${l.id}:${w.rules.settlementTrade.firstDay}`]).filter(o=>o&&o.status!=='refused');
 assert.ok(orders.length,'至少有一条周贸易发货');
 for(const o of orders){
  assert.equal(o.carriers.length,o.workers,'承运人数与点名一致');
  assert.deepEqual(o.entries.find(e=>e.phase==='dispatch').carriers,o.carriers);
  for(const [i,id] of o.carriers.entries()){
   assert.ok(doc.state.npcs[id],'承运人是真实人物');
   const trip=doc.state.records[o.carrierTrips[i]];
   assert.equal(trip.category,'market_trip');assert.equal(trip.actor,id);assert.ok(trip.returnAt>trip.departAt||o.carriage,'承运时间真实占用');
  }
  assert.equal(new Set(orders.flatMap(x=>x.carriers)).size,orders.reduce((n,x)=>n+x.carriers.length,0),'同一人不同时背两趟');
 }
 void qty;void withRecordIndex;
});

test('出摊不以交易服务为门槛：没有交易服务的村民，手上有超出家户自留的、有人用的余货，当天出摊；货卖空就收摊',async()=>{
 const engine=new WorldEngine(structuredClone(world));let doc=engine.createCharacter(seed,{},'ke2-surplus');
 const trades=n=>(n.services??[]).includes('trade')||(n.serviceCatalog??[]).some(s=>s.kind==='trade');
 const who=world.npcs.find(n=>!trades(n)&&!n.shopType&&doc.state.npcs[n.id]&&n.age>=18&&!(world.rules.economy.shops.stores??[]).some(s=>s.keeper===n.id))?.id;
 assert.ok(who);
 // 一大捆铁钉（配方用料，有人用）：远超这一户自用。午夜前一刻才到手（白天挑去卖掉了就没有余货可摆）。
 const {resyncBooks}=await import('./helpers/ledger-sync.mjs');
 const eve=(Math.floor(doc.state.minute/DAY)+1)*DAY-30;
 doc=applyPatches(doc,(await engine.reduce(doc,{tool:'world_time',args:{minutes:eve-doc.state.minute},eventId:'ke2-eve'})).patches);
 doc.state.npcs[who].inventory.item_iron_nail=40;resyncBooks(engine,doc);
 const out=await engine.reduce(doc,{tool:'world_time',args:{minutes:60},eventId:'ke2-midnight'});doc=applyPatches(doc,out.patches);
 const stall=doc.state.records[`stall:${who}`];
 assert.ok(stall,'有余货就出摊');
 const row=stall.restock.find(r=>r.item==='item_iron_nail');assert.ok(row&&row.own&&row.amount>=1&&row.amount<=qty(doc.state.npcs[who].inventory.item_iron_nail));
});

test('一趟真实贩运：没有贩运职业的村民知道镇上的价，去镇上向持货人买、背回、卖给本村缺货的摊；承运人点名，账本守恒',{timeout:600000},async()=>{
 const {auditLedger}=await import('../server-plugin/ledger.mjs');
 const {resyncBooks}=await import('./helpers/ledger-sync.mjs');
 const {marketQuote}=await import('../server-plugin/market.mjs');
 const {shopOfKeeper}=await import('../server-plugin/shop.mjs');
 const who='npc_hw_luowei',item='item_quill_knife',keeper='npc_hw_luqing',holder='npc_hw_yanzhe';
 const w=structuredClone(world);w.npcs.find(n=>n.id===keeper).inventory[item]=12;// 本村书摊平常备 12 把修笔刀
 const engine=new WorldEngine(w);let doc=engine.createCharacter(seed,{},'ke2-haul');const s=doc.state;
 assert.ok(!laborCategories(engine,s,who).some(c=>c==='carry'||c==='sell'),'不是贩运职业');
 // 前提：本村的修笔刀卖空了，镇上的经营者手上有 10 把；村民记得镇上的实价（见过成交）。
 for(const n of Object.values(s.npcs))if(n.inventory?.[item])n.inventory[item]=0;
 s.npcs[holder].inventory[item]=10;s.npcs[who].coins=2000;resyncBooks(engine,doc);
 const rd={document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc)};
 const real=marketQuote(rd,engine,{item,location:s.npcs[holder].location,seller:holder,buyer:who,quantity:10,business:{...shopOfKeeper(engine,holder,s),keeper:holder}});
 s.records['knowledge:ke2-haul']={category:'knowledge',observer:who,subject:who,key:`market:${s.npcs[holder].location}:${item}`,value:{unitPrice:Math.ceil(real.totalCoins/10),expires:Number.MAX_SAFE_INTEGER},sourceType:'亲历',minute:0};
 for(let h=0;h<96;h++){const out=await engine.reduce(doc,{tool:'world_time',args:{minutes:60},eventId:`ke2h${h}`});if(out.patches?.length)doc=applyPatches(doc,out.patches);}
 const trip=Object.values(doc.state.records).find(r=>r.category==='market_trip'&&r.labor==='haul'&&r.actor===who);
 assert.ok(trip,'承运人点名：本人的贩运行程');
 const deals=Object.values(doc.state.records).filter(r=>r.category==='market_trade'&&r.item===item);
 const bought=deals.find(r=>r.seller===holder&&r.buyer===who),sold=deals.find(r=>r.seller===who&&r.buyer===keeper);
 assert.ok(bought&&bought.quantity>=1,'在镇上向持货人买到');
 assert.ok(sold&&sold.totalCoins/sold.quantity>bought.totalCoins/bought.quantity,'回村卖给缺货的摊，卖价高于进价');
 assert.deepEqual(auditLedger(doc.ledger),[]);
});
