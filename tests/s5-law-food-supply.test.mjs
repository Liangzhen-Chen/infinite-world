import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {planFoodSupply,advanceFoodSupply,nextFoodSupplyMinute} from '../server-plugin/food-supply.mjs';
import {currentShops,shopStores,foodSupplyBid} from '../server-plugin/shop.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';
import {counterCash} from '../server-plugin/money.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {createTransportAsset,advanceTransport,nextTransportMinute,damageTransportCargo,destroyTransportAsset,transportAssetView} from '../server-plugin/transport.mjs';
import {asset as makeAsset,DRIVER} from './helpers/transport.mjs';
import {remoteWorld,unfoldRemoteAt,remoteHazardProfile,outlineNumber,countyKind} from '../server-plugin/remote-generation.mjs';
import {settlementGovernment} from '../server-plugin/entity-view.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json',import.meta.url),'utf8'));
function fixture({shopId='shop_bs_yanzhe',source=world}={}){
 const w=structuredClone(source),store=shopStores(w).find(s=>s.id===shopId);
 w.marketRules.customerChoice.noisePermille=0;
 const sourceStore=w.rules.economy.shops.stores.find(s=>s.id===shopId),keeperRow=w.npcs.find(n=>n.id===store.keeper);
 const rows=sourceStore?.restock??keeperRow.shopRestock;
 const oats=rows.find(r=>r.item==='item_oats');
 if(oats)Object.assign(oats,{source:'route',from:'loc_hw',amount:40,maximum:40});else rows.push({item:'item_oats',source:'route',from:'loc_hw',amount:40,maximum:40});
 const e=new WorldEngine(w),doc=e.createCharacter(seed,{},'food-supply');doc.state.minute=600;
 const manager=w.rules.agriculture.settlements.find(p=>p.settlement==='loc_bs_yupo').manager;
 for(const id of [manager,store.keeper])Object.assign(doc.state.npcs[id],{coins:1000,activity:'营业',status:'正常',goals:{},memoryStream:[]});
 const keeper=w.npcs.find(n=>n.id===store.keeper);
 doc.state.npcs[store.keeper].location=store.location??keeper.workplace?.location??keeper.location;
 delete doc.state.npcs[store.keeper].inventory.item_oats;
 doc.ledger=openLedger(e,doc);
 const d={document:doc,get(...p){return p.reduce((v,k)=>v?.[k],this.document);},set(p,value){this.document=applyPatches(this.document,[{op:'set',path:p,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);},say(){}};
 return {e,d,manager,shop:currentShops(e,d.get('state')).find(s=>s.id===store.id)};
}
function quote(f){
 const q=foodSupplyBid(f.d,f.e,f.shop,'item_oats',600);assert.ok(q,'on-site keeper can bid');
 f.d.set(['state','records','food-supply-stats:loc_bs_yupo'],{category:'food_supply_stats',settlement:'loc_bs_yupo',quotes:[q]});return q;
}
function tick(f,t){f.d.set(['state','minute'],t);advanceFoodSupply(f.d,f.e,t,{plan:false});}
const supplies=f=>Object.values(f.d.get('state','records')).filter(r=>r.category==='settlement_trade'&&r.foodSupply);
test('registered interval demand uses recipe nutrition without crediting raw grain as food',()=>{
 const e=new WorldEngine(world),doc=e.createCharacter(seed,{},'grain-demand-anchor');
 const shop=currentShops(e,doc.state).find(s=>s.id==='shop_bs_yanzhe'),row=shop.restock.find(r=>r.physicalSupply);
 // Hand anchor from the design:1 grain ->1 flour ->4 flatbreads*30 =120;
 //306 people*60 satiety/day*7 days /120 =1071 physical grain portions.
 assert.equal(row.amount,1071);assert.equal(row.maximum,1071);
 assert.equal(e.byId.get(row.item).nutrition?.satiety??0,0);
});
test('unknown quote cannot dispatch grain; an information trip carries zero goods',()=>{
 const f=fixture(),plans=planFoodSupply(f.d,f.e,600);
 // Hand anchor: no received price => zero stock or cash may be committed.
 assert.ok(plans.length);assert.ok(plans.every(p=>p.scout&&p.quantity===0));
 const before=f.d.get('state','settlements','loc_bs_yupo','food');advanceFoodSupply(f.d,f.e,600);
 assert.equal(f.d.get('state','settlements','loc_bs_yupo','food'),before);
 assert.ok(supplies(f).every(o=>o.escrowCopper===0&&o.batches.length===0));
});
test('real surplus is carried to the shop once, with locked money and no double sale',()=>{
 const f=fixture(),q=quote(f),before=f.d.get('state','settlements','loc_bs_yupo','food');
 const plan=planFoodSupply(f.d,f.e,600).find(p=>p.seller==='loc_bs_yupo'&&!p.scout);assert.ok(plan);
 // Hand anchor: two workers * 10kg / .5kg = at most40; target40 and actual
 // cash constrain it further. Initial stock18000 minus80*185 minus20 promise.
 assert.ok(plan.quantity<=40);assert.ok(plan.quantity<=3180);
 advanceFoodSupply(f.d,f.e,600);const order=supplies(f).find(o=>o.seller==='loc_bs_yupo');
 assert.equal(order.quantity,plan.quantity);assert.equal(before-f.d.get('state','settlements','loc_bs_yupo','food'),order.quantity);
 assert.equal(f.d.get('state','records','agriculture:loc_bs_yupo','ledger','retailSold'),order.quantity);
 assert.equal(f.d.get('state','records','agriculture:loc_bs_yupo','ledger','armyDrawn')??0,0);
 assert.equal(order.escrowCopper,order.quantity*q.unitPrice);
 assert.equal(planFoodSupply(f.d,f.e,600).filter(p=>p.seller==='loc_bs_yupo').length,0);
 for(let n=0;n<80&&supplies(f).find(o=>o.id===order.id).transport.phase!=='home';n++)tick(f,nextFoodSupplyMinute(f.d.get('state'),f.d.get('state','minute')));
 const done=supplies(f).find(o=>o.id===order.id);
 assert.equal(done.status,'delivered');assert.equal(done.deliveredFood,order.quantity);assert.equal(done.escrowCopper,0);
 assert.equal(f.e.quantity(f.d,f.shop.keeper,'item_oats'),order.quantity);
 assert.ok(counterCash(f.d,f.shop.keeper)>=0);
 const audit=reconcile(f.e,f.d.document);assert.deepEqual(audit.mismatches,[]);assert.deepEqual(audit.lots,[]);
});
test('another settlement counter uses the same physical supply rule',()=>{
 const f=fixture({shopId:'shop_hw_qingdeng'});quote(f);
 // Same two bodies and .5kg bags: changing the town cannot exceed40 units.
 advanceFoodSupply(f.d,f.e,600);const o=supplies(f).find(o=>o.seller==='loc_bs_yupo'&&!o.scout);assert.ok(o);assert.ok(o.quantity<=40);
 for(let n=0;n<300&&supplies(f).find(r=>r.id===o.id).transport.phase!=='home';n++)tick(f,nextFoodSupplyMinute(f.d.get('state'),f.d.get('state','minute')));
 assert.equal(supplies(f).find(r=>r.id===o.id).status,'delivered');assert.equal(f.e.quantity(f.d,f.shop.keeper,'item_oats'),o.quantity);
});
test('planned surplus excludes seed shortfall, existing promises and the next harvest reserve',()=>{
 const f=fixture();quote(f);
 //80 mouths *185 days +20 signed units =14820. No present surplus exists;
 // a future crop with arbitrarily large yield must not become dispatch stock.
 const id='loc_bs_yupo',r=structuredClone(f.d.get('state','records',`agriculture:${id}`));
 r.batches=[{id:'retained',kind:'grain',amount:14820,harvestDay:0,expiresDay:210}];
 f.d.set(['state','settlements',id,'food'],14820);f.d.set(['state','records',`agriculture:${id}`],r);
 f.d.document.ledger=openLedger(f.e,f.d.document);
 assert.equal(planFoodSupply(f.d,f.e,600).filter(p=>p.seller===id&&!p.scout).length,0);
});
test('a closed edge prevents remote delivery; reopening continues the same cargo',()=>{
 const f=fixture();quote(f);advanceFoodSupply(f.d,f.e,600);
 const old=supplies(f).find(o=>o.seller==='loc_bs_yupo'),edge=f.e.world.routes.find(r=>r.id===old.transport.edges[1]);assert.ok(edge);
 // Closure changes no inventory: the dispatched quantity remains in transit.
 const original=edge.closedSeasons;edge.closedSeasons=[0,1,2,3];
 for(let n=0;n<10;n++)tick(f,nextFoodSupplyMinute(f.d.get('state'),f.d.get('state','minute')));
 assert.equal(f.e.quantity(f.d,f.shop.keeper,'item_oats'),0);
 assert.equal(supplies(f).find(o=>o.id===old.id).deliveredFood,0);
 edge.closedSeasons=original;
 for(let n=0;n<100&&supplies(f).find(o=>o.id===old.id).transport.phase!=='home';n++)tick(f,nextFoodSupplyMinute(f.d.get('state'),f.d.get('state','minute')));
 assert.equal(supplies(f).find(o=>o.id===old.id).deliveredFood,old.quantity);
});
test('unreceived grain expires as physical loss and its locked bill is refunded',()=>{
 const f=fixture();quote(f);
 const r=structuredClone(f.d.get('state','records','agriculture:loc_bs_yupo'));for(const b of r.batches)b.expiresDay=1;
 f.d.set(['state','records','agriculture:loc_bs_yupo'],r);f.d.document.ledger=openLedger(f.e,f.d.document);
 const cash=counterCash(f.d,f.shop.keeper);advanceFoodSupply(f.d,f.e,600);
 const o=supplies(f).find(o=>o.seller==='loc_bs_yupo');f.d.set(['state','npcs',f.shop.keeper,'location'],'loc_hw');
 // No receiver =>0 shelf units. After one day all dispatched units must be
 // decay, and returning the keeper may refund but cannot recreate one unit.
 for(let n=0;n<30&&f.d.get('state','minute')<2880;n++)tick(f,nextFoodSupplyMinute(f.d.get('state'),f.d.get('state','minute')));
 assert.equal(f.e.quantity(f.d,f.shop.keeper,'item_oats'),0);
 assert.equal(supplies(f).find(r=>r.id===o.id).escrowCopper,0,'a vanished cargo bill refunds without waiting for a recipient');
 f.d.set(['state','npcs',f.shop.keeper,'location'],f.shop.location);
 for(let n=0;n<50&&supplies(f).find(r=>r.id===o.id).transport.phase!=='home';n++)tick(f,nextFoodSupplyMinute(f.d.get('state'),f.d.get('state','minute')));
 const done=supplies(f).find(r=>r.id===o.id);assert.equal(done.spoiledFood,o.quantity);assert.equal(done.deliveredFood,0);assert.equal(done.refundCopper,o.quantity*o.unitPrice);assert.equal(counterCash(f.d,f.shop.keeper),cash);
 assert.deepEqual(reconcile(f.e,f.d.document).mismatches,[]);
});
test('same seed replay and plan previews leave the executed supply unchanged',()=>{
 const run=preview=>{const f=fixture();quote(f);if(preview)for(let n=0;n<4;n++)planFoodSupply(f.d,f.e,600);advanceFoodSupply(f.d,f.e,600);for(let n=0;n<50&&supplies(f).some(o=>o.transport.phase!=='home');n++)tick(f,nextFoodSupplyMinute(f.d.get('state'),f.d.get('state','minute')));return supplies(f);};
 // Preview inserts zero decisions/events and must not consume a random stream.
 assert.deepEqual(run(false),run(true));
});
function carriage(f,{origin=f.e.rules.agriculture.settlements.find(p=>p.settlement==='loc_bs_yupo').counter}={}){
 // This mechanism fixture provides a real cart-accessible road all the way
 // to the loading counter. The ordinary narrow footpaths remain unchanged.
 for(const id of f.e.route(origin,f.shop.location,'walk',600,f.d.document.randomSeed).edges){const edge=f.e.world.routes.find(r=>r.id===id);edge.modes=[...new Set([...edge.modes,'cart'])];}
 f.d.set(['state','npcs',DRIVER],{...f.d.get('state','npcs',DRIVER),location:origin,coins:10000,inventory:{item_wood:120,item_iron:10},activity:'营业',status:'正常'});
 f.d.document.ledger=openLedger(f.e,f.d.document);f.e.airDraft=f.d;
 return makeAsset(f.d,f.e,DRIVER,'cart','tfb-cart');
}
function finishCarriage(f,id){
 for(let n=0;n<100&&supplies(f).find(o=>o.id===id).transport.phase!=='home';n++){
  const now=f.d.get('state','minute'),at=Math.min(nextTransportMinute(f.d.get('state'),now),nextFoodSupplyMinute(f.d.get('state'),now));
  f.d.set(['state','minute'],at);advanceTransport(f.d,f.e,at);advanceFoodSupply(f.d,f.e,at,{plan:false});
 }
 return supplies(f).find(o=>o.id===id);
}
test('K12 carriage collects actual cargo; partial damage uses its existing compensation ledger',()=>{
 const f=fixture();carriage(f);quote(f);advanceFoodSupply(f.d,f.e,600);
 const o=supplies(f).find(o=>o.seller==='loc_bs_yupo');assert.ok(o.carriage);
 // 40 shipped -3 damaged =37 delivered. The signed copper price only pays37;
 // K12's real loss claim separately compensates the3 destroyed units.
 damageTransportCargo(f.d,f.e,{shipment:o.carriage,item:o.item,quantity:3,actor:DRIVER},'damage-three');
 const done=finishCarriage(f,o.id);assert.equal(done.lostFood,3);assert.equal(done.deliveredFood,o.quantity-3);
 assert.equal(done.paidCopper,(o.quantity-3)*o.unitPrice);assert.equal(done.refundCopper,3*o.unitPrice);
 assert.equal(f.d.get('state','records',o.carriage,'status'),'delivered');
 assert.ok(f.d.get('state','records',`transport_loss:${o.carriage}:damage-three`));
 assert.deepEqual(reconcile(f.e,f.d.document).mismatches,[]);
});
test('a wreck destroys only real cargo and returns the whole goods bill',()=>{
 const f=fixture(),asset=carriage(f);quote(f);advanceFoodSupply(f.d,f.e,600);
 const o=supplies(f).find(o=>o.seller==='loc_bs_yupo');assert.ok(o.carriage);
 // Wreck: quantity=lost, shelf=0, escrow=0 and refund=quantity*locked price.
 destroyTransportAsset(f.d,f.e,{asset},'wreck');advanceFoodSupply(f.d,f.e,601,{plan:false});
 const done=supplies(f).find(r=>r.id===o.id);assert.equal(done.lostFood,o.quantity);assert.equal(done.deliveredFood,0);assert.equal(done.refundCopper,o.quantity*o.unitPrice);assert.equal(done.escrowCopper,0);
 assert.deepEqual(reconcile(f.e,f.d.document).mismatches,[]);
});
test('a generated county counter receives real stock without refreshing its itinerant suppliers',()=>{
 const f=nativeCounty(),{e,skeleton}=f;let d=f.d;
 const towns=currentShops(e,d.get('state')).filter(s=>skeleton.profiles.find(p=>p.id===s.settlement)?.kind==='town'&&s.restock.some(r=>r.item===e.rules.agriculture.grainItem));
 const shop=towns.find(s=>foodSupplyBid(d,e,s,e.rules.agriculture.grainItem,600));assert.ok(shop);
 const bid=foodSupplyBid(d,e,shop,e.rules.agriculture.grainItem,600);f.shop=shop;
 const sources=skeleton.settlements.filter(s=>s.id!==shop.settlement).map(s=>({seller:s.id,government:settlementGovernment(e,d.get('state'),s.id)})).filter(s=>d.get('state','npcs',s.government.head.value));
 sources.sort((a,b)=>e.route(a.government.seat.value,shop.location,'walk',600,d.document.randomSeed).minutes-e.route(b.government.seat.value,shop.location,'walk',600,d.document.randomSeed).minutes);
 const source=sources[0];assert.ok(source);const manager=source.government.head.value,animal='tfb-county-pack-bull';
 // A real local pack animal changes the transport premise, not prices or
 // grain. Long-haul hand carriage from another county can rationally refuse.
 const setup=applyIntentSetup(e,d.document,{instances:[{id:animal,template:'agent',kind:'creature',species:'monster_slate_horn_bull',location:source.government.seat.value}],holdings:[{id:'tfb-county-pack-title',kind:'tamed_by',holder:manager,subject:animal}]});assert.deepEqual(setup.setupUnmet,[]);
 // applyIntentSetup returns a new document; a native Draft must start a new
 // cursor too, rather than overwriting document while keeping its old root.
 d=e.primitiveDraft(setup.document);f.d=d;e.airDraft=d;
 const vehicle=createTransportAsset(d,e,{owner:manager,kind:'pack',animal,id:'tfb-county-pack'},'county-pack').id;
 d.set(['state','records',`food-supply-stats:${source.seller}`],{category:'food_supply_stats',settlement:source.seller,quotes:[bid]});
 const merchants=Object.fromEntries(skeleton.people.filter(p=>p.consignment).map(p=>[p.id,structuredClone(f.d.get('state','npcs',p.id,'inventory'))]));
 const before=d.get('state','settlements',source.seller,'food'),capacity=transportAssetView(e,d.document,vehicle).capacityKg;
 advanceFoodSupply(d,e,600);const o=supplies(f).find(r=>r.seller===source.seller&&!r.scout);
 assert.ok(o?.carriage,'the present adult asset owner can quote paid transport without a carrier occupation');
 assert.equal(o.quantity,Math.min(bid.quantity,Math.floor(capacity/e.byId.get(o.item).weight)));assert.equal(before-d.get('state','settlements',source.seller,'food'),o.quantity);
 assert.equal(finishCarriage(f,o.id).deliveredFood,o.quantity);assert.equal(e.quantity(d,shop.keeper,o.item),o.quantity);
 for(const [id,inventory]of Object.entries(merchants))assert.deepEqual(f.d.get('state','npcs',id,'inventory'),inventory);
 assert.deepEqual(reconcile(f.e,f.d.document).mismatches,[]);
});

test('independent hired household vehicles and porters fill one observed supply window',()=>{
 const f=fixture(),{e,d}=f,from=e.rules.agriculture.settlements.find(p=>p.settlement==='loc_bs_yupo').counter;
 const row=e.world.rules.economy.shops.stores.find(s=>s.id===f.shop.id).restock.find(r=>r.item==='item_oats');Object.assign(row,{amount:140,maximum:140});
 d.set(['state','npcs',f.shop.keeper,'coins'],5000);
 const drivers=[DRIVER,'npc_hw_shendu'];
 for(const id of drivers)d.set(['state','npcs',id],{...d.get('state','npcs',id),location:from,activity:'营业',status:'正常',goals:{},memoryStream:[]});
 const instances=drivers.map((id,i)=>({id:`tfb-hired-bull:${i}`,template:'agent',kind:'creature',species:'monster_slate_horn_bull',location:from}));
 const setup=applyIntentSetup(e,d.document,{instances,holdings:instances.map((r,i)=>({id:`tfb-hired-title:${i}`,kind:'tamed_by',holder:drivers[i],subject:r.id}))});assert.deepEqual(setup.setupUnmet,[]);d.document=setup.document;
 for(const [i,id]of drivers.entries())createTransportAsset(d,e,{owner:id,kind:'pack',animal:instances[i].id,id:`tfb-hired-pack:${i}`},`hired-pack:${i}`);
 d.document.ledger=openLedger(e,d.document);f.shop=currentShops(e,d.get('state')).find(s=>s.id===f.shop.id);quote(f);
 const before=d.get('state','settlements','loc_bs_yupo','food');advanceFoodSupply(d,e,600);
 const live=supplies(f).filter(o=>o.seller==='loc_bs_yupo'&&!o.scout);
 // Two actual30kg animals carry60+60 portions; the remaining20 portions
 // consume one of the two real10kg porters. No new asset/stock/cash source.
 assert.equal(live.length,3);assert.deepEqual(live.filter(o=>o.carriage).map(o=>o.quantity).sort((a,b)=>a-b),[60,60]);
 assert.equal(live.filter(o=>!o.carriage)[0].quantity,20);assert.equal(before-d.get('state','settlements','loc_bs_yupo','food'),140);
 assert.equal(planFoodSupply(d,e,600).filter(p=>p.seller==='loc_bs_yupo').length,0);
 for(const o of live)assert.equal(finishCarriage(f,o.id).deliveredFood,o.quantity);
 assert.equal(e.quantity(d,f.shop.keeper,'item_oats'),140);assert.deepEqual(reconcile(e,d.document).mismatches,[]);
});

test('returned porters make several real trips before the same observed quote expires',()=>{
 const f=fixture(),{e,d}=f,row=e.world.rules.economy.shops.stores.find(s=>s.id===f.shop.id).restock.find(r=>r.item==='item_oats');Object.assign(row,{amount:100,maximum:100});
 // Isolate this crew's three departures: other real managers decline price
 // scouting, rather than racing this buyer with independently observed bids.
 for(const p of e.rules.agriculture.settlements)if(p.manager!==f.manager)e.byId.get(p.manager).redLines=['observe_market'];
 d.set(['state','npcs',f.shop.keeper,'coins'],5000);d.document.ledger=openLedger(e,d.document);f.shop=currentShops(e,d.get('state')).find(s=>s.id===f.shop.id);const bid=quote(f);
 const before=d.get('state','settlements','loc_bs_yupo','food');advanceFoodSupply(d,e,600);
 for(let n=0;n<400&&e.quantity(d,f.shop.keeper,'item_oats')<100;n++){
  const at=nextFoodSupplyMinute(d.get('state'),d.get('state','minute'));d.set(['state','minute'],at);advanceFoodSupply(d,e,at,{plan:false,onReturn:true});
 }
 //2*10kg/.5kg=40 per round trip, hence40+40+20=100. A seller/day
 // key must not suppress a returned crew; each departure locks new real food.
 assert.equal(e.quantity(d,f.shop.keeper,'item_oats'),100);assert.equal(before-d.get('state','settlements','loc_bs_yupo','food'),100);
 const live=supplies(f).filter(o=>o.seller==='loc_bs_yupo'&&!o.scout&&o.transport.phase!=='home'),stats=d.get('state','records','food-supply-stats:loc_bs_yupo');
 assert.equal((stats.destinations?.[f.shop.id]?.shipments??0)+live.length,3);assert.ok(d.get('state','minute')<=bid.expires);
 assert.deepEqual(reconcile(e,d.document).mismatches,[]);
});
test('a producer can refuse a profitable known bid and no preview spends stock',()=>{
 const f=fixture();quote(f);
 // Profit is not consent: a real sell red line keeps all18000 source units.
 f.e.byId.get(f.manager).redLines=['sell'];
 const before=f.d.get('state','settlements','loc_bs_yupo','food');
 assert.equal(planFoodSupply(f.d,f.e,600).filter(p=>p.seller==='loc_bs_yupo'&&!p.scout).length,0);
 assert.equal(f.d.get('state','settlements','loc_bs_yupo','food'),before);
});
test('changed saved quantities or escrow cannot mint a refund or reuse cargo',()=>{
 for(const field of ['quantity','escrowCopper','paidCopper']){
  const f=fixture();quote(f);advanceFoodSupply(f.d,f.e,600);
  const o=supplies(f).find(r=>r.seller==='loc_bs_yupo');
  // One extra unit/copper breaks the same quantity=transit+sale+loss and
  // bill=escrow+payment+refund equations, before any second transfer occurs.
  f.d.set(['state','records',o.id,field],o[field]+1);const before=structuredClone(f.d.document);
  assert.throws(()=>advanceFoodSupply(f.d,f.e,601,{plan:false}),/does not conserve/);
  assert.deepEqual(f.d.document,before);
 }
});
function nativeCounty(){
 const w=structuredClone(world);w.marketRules.customerChoice.noisePermille=0;
 const county=w.regions.find(c=>c.category==='county'&&countyKind(c)==='human'&&outlineNumber(c.population)>=12000&&remoteHazardProfile(c).farm&&c.seat?.location&&w.locations.some(l=>l.id===c.seat.location)&&!w.settlementProfiles.some(p=>p.id===c.seat.location));assert.ok(county);
 const base=new WorldEngine(w),doc=base.createCharacter(seed,{},'food-supply-generated-source');doc.state.minute=600;doc.state.location=county.seat.location;doc.ledger=openLedger(base,doc);
 const opening=base.primitiveDraft(doc);unfoldRemoteAt(opening,base,county.seat.location);
 const overlay=remoteWorld(w,opening.get('state')),e=new WorldEngine(overlay),d=e.primitiveDraft(opening.document);
 return {e,d,skeleton:d.get('state','remote',county.id,'skeleton')};
}
test('a generated farming county sells its own real public grain, not a supplier refresh',()=>{
 const f=nativeCounty(),{e,d}=f;
 const scout=planFoodSupply(d,e,600).find(p=>p.legacy&&p.scout);assert.ok(scout);
 const bid=foodSupplyBid(d,e,scout.shop,scout.item,600);assert.ok(bid);
 d.set(['state','records',`food-supply-stats:${scout.settlement}`],{category:'food_supply_stats',settlement:scout.settlement,quotes:[bid]});
 const before=d.get('state','settlements',scout.seller,'food');advanceFoodSupply(d,e,600);
 const o=supplies(f).find(r=>r.seller===scout.seller&&!r.scout);assert.ok(o);
 // Native generated farming stock150P - reserve90P =60P; one real manager
 // carries at most10kg/.5kg=20 units, irrespective of pending population.
 assert.ok(o.quantity<=20);assert.equal(before-d.get('state','settlements',scout.seller,'food'),o.quantity);
 for(let n=0;n<500&&supplies(f).find(r=>r.id===o.id).transport.phase!=='home';n++)tick(f,nextFoodSupplyMinute(d.get('state'),d.get('state','minute')));
 assert.equal(supplies(f).find(r=>r.id===o.id).deliveredFood,o.quantity);
 assert.deepEqual(reconcile(e,d.document).mismatches,[]);
});
test('a private producer sells owned grain through K12 while keeping household and seed reserves',()=>{
 const f=fixture(),farmer='npc_hw_ayan',from='bld_hw_mill';
 f.d.set(['state','npcs',farmer],{...f.d.get('state','npcs',farmer),location:from,coins:1000,activity:'营业',status:'正常',goals:{},memoryStream:[],inventory:{item_oats:{quantity:1000,quality:'木',durability:100,weight:.5}}});
 // Current saved growing plot: one day to harvest. Its future yield is never
 // included in these1000 physically held units; seed/claims are allocated by
 // the ordinary household reader, and the40-unit bid is the sales ceiling.
 f.d.set(['state','records','private-farm:loc_hw_fields'],{category:'private_farm',id:'private-farm:loc_hw_fields',location:'loc_hw_fields',settlement:'loc_hw',owner:farmer,crop:'item_oats',seedItem:'item_oats',seed:2,areaUnits:1,capacityUnits:1,grownDays:f.e.rules.agriculture.crop.growthDays-1,status:'growing',seedEvent:'private-growing-fixture'});
 f.d.document.ledger=openLedger(f.e,f.d.document);carriage(f,{origin:from});
 const bid=foodSupplyBid(f.d,f.e,f.shop,'item_oats',600);assert.ok(bid);
 f.d.set(['state','npcs',farmer,'memoryStream'],[{id:'private-observed-bid',minute:600,sourceType:'目击',value:bid}]);
 advanceFoodSupply(f.d,f.e,600);const o=supplies(f).find(o=>o.seller===farmer);assert.ok(o?.carriage);assert.equal(o.public,false);assert.ok(o.quantity<=40);
 assert.equal(foodSupplyBid(f.d,f.e,f.shop,'item_oats',600),null,'effective transit already fills the quoted interval need');
 const done=finishCarriage(f,o.id);assert.equal(done.deliveredFood,o.quantity);assert.equal(f.e.quantity(f.d,farmer,'item_oats'),1000-o.quantity);
 assert.deepEqual(reconcile(f.e,f.d.document).mismatches,[]);
});
