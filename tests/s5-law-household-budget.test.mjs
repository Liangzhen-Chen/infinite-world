import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld,loadRuntimeWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {householdBudget,householdResources,householdBufferTarget,householdOptions,registerHouseholdFoodSources} from '../server-plugin/household-budget.mjs';
import {mealCapPools} from '../server-plugin/item-class.mjs';
import {bodyRule} from '../server-plugin/primitives-body.mjs';
import {saleableStock,reserveShortfall} from '../server-plugin/market.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {applyPatches,PatchCursor,withRecordIndex} from '../server-plugin/storage.mjs';
import {settlementStock,bag} from '../server-plugin/stock.mjs';
import {stateReader} from '../server-plugin/valuation.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const owner='npc_hw_linsui',other='npc_hw_duanyan',supplier='npc_hw_shendu',item='item_bread',DAY=1440;
// 面包的饱腹由其出处（props）推导并乘饱腹系数，取引擎派生后的值，夹具不再覆盖成 1；手算锚点按它缩放：一个面包 = SAT 饱腹，每人每天需 10 个面包。
const SAT=(await loadRuntimeWorld()).items.find(i=>i.id===item).nutrition.satiety;
const satOf=(f,id)=>f.engine.byId.get(id).nutrition?.satiety??0;
const near=(a,b,m)=>assert.ok(Math.abs(a-b)<1e-6,m??`${a} ≈ ${b}`);
// 市场替代的独立复算（不拿引擎的结果去验引擎的结果）：
//  ① 首购物品 = 从可得来源（shop.mjs 登记的家户食物来源）独立算出的“到货最早的那批里每铜币有效饱腹最高者”（并列按物品编号）：
//     只算买得起（现金扣到货前的应付款）、有派生饱腹、且单餐额度允许买满至少一件的来源；有效饱腹 = 派生饱腹，覆盖不超过缺口（这些夹具里缺口远大于一件）。物品名不写死，由来源与派生值算出。
//  ② 覆盖量 = Σ 购买量 × 该物品的派生饱腹，独立相加后与引擎的 coverage 比较；
//  ③ 缺口 = 需求（人数 × 天数 × 每人每天 10 个面包的饱腹）− 覆盖量 − 手里的存粮（面包 × SAT）。
// 购买次序的价值 = Σ 各营养（覆盖÷当前剩余缺口）÷ 单价（household-budget.mjs 的购买次序注释：多种营养按缺口占比相加，只有一种有缺口时即饱腹÷单价）。
// R = 本次购买前的剩余缺口：饱腹 = 人数×天数×10×SAT − 手里存粮饱腹；水分 = 人数×天数×每人每天水分（body 表 light 耗水×24）。覆盖按单件算（这些夹具里缺口远大于一件）。
// WATER-1B 后蔬果等也供水分，夹具里水分缺口存在，所以每铜价值要含水分一项，不再只看饱腹。
const gapOf=(f,{members=1,days,held=0})=>({satiety:Math.max(0,members*days*10*SAT-held),hydration:members*days*bodyRule(f.engine,'hydration').drainPerHour.light*24});
const bestPerCoin=(f,sources,R)=>{
 const first=Math.min(...sources.map(s=>s.at)),value=s=>{const n=f.engine.byId.get(s.item).nutrition??{};return Object.keys(R).reduce((m,k)=>m+(R[k]>0?(n[k]??0)/R[k]:0),0)/s.unitPrice;};
 return sources.filter(s=>s.at===first).sort((x,y)=>value(y)-value(x)||(x.item<y.item?-1:x.item>y.item?1:0))[0]?.item;
};
const marketCheck=(f,b,{members=1,days=b.target?.days,cash=b.resources?.market?.cash??b.market.cash,payments=0,held,minute=f.state.minute}={})=>{
 const m=b.resources?.market??b.market,res=b.resources??b;
 const caps=mealCapPools(f.engine,{days:Array(members).fill(days)});
 const buyable=registerHouseholdFoodSources.fn(f.d,f.engine,owner,{}).filter(s=>s.at>=minute&&s.quantity>0&&s.unitPrice>0&&s.unitPrice<=cash-payments&&satOf(f,s.item)>0&&caps.unitsRoom(s.item,(s.at-minute)/DAY)>=1);
 assert.equal(m.purchases[0]?.item,bestPerCoin(f,buyable,gapOf(f,{members,days,held})),'first purchase is the best coverage-per-coin source among those arriving first');
 const coverage=m.purchases.reduce((n,p)=>n+p.quantity*satOf(f,p.item),0);
 near(m.coverage.satiety,coverage);
 near(res.shortfall.satiety,Math.max(0,members*days*10*SAT-coverage-held));
 return coverage;
};
function fixture({members=[owner],shared=true}={}){
 const w=structuredClone(world);
 w.households=w.households.map(h=>({...h,members:h.members.filter(id=>!members.includes(id))})).filter(h=>h.members.length);
 for(const [i,group]of (shared?[members]:members.map(id=>[id])).entries())w.households.push({id:`house_budget_fixture_${i}`,members:group,settlement:'loc_hw',homeLocation:'bld_hw_qingdeng',tenure:'沿用已发布住处，独立登记家计'});
 // Hand anchor: each resident needs ten breads' worth (10*SAT) satiety per day; one bread = SAT (its material-data nutrition, not overridden).
 for(const r of w.primitiveTables.body.rows)if(r.need==='satiety'&&r.selector==='person')r.drainPerHour.light=10*SAT/24;
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:1}];
 const engine=new WorldEngine(w);let document=engine.initialFromLegacy(legacy,'household-budget');
 document.state.minute=0;
 for(const id of members){document.state.npcs[id].inventory={};document.state.npcs[id].coins=0;}
 document.state.npcs[owner].inventory={[item]:20};document.state.npcs[owner].coins=5;
 // This fixture starts from an unbooked legacy document. Open both real
 // account scopes explicitly; resyncBooks intentionally skips unbooked saves.
 const sync=()=>{document.ledger=openLedger(engine,document);};
 const d={get document(){return document;},get:(...p)=>p.reduce((v,k)=>v?.[k],document)};
 return {engine,d,sync,replace(next){document=next;},get state(){return document.state;}};
}

test('cursor budgets keep horizons, ledger revisions, documents and mutable observer evidence separate',()=>{
 const f=fixture();f.sync();
 const cursor=new PatchCursor(f.d.document),d={cursor,get document(){return cursor.expose(cursor.root);},get:(...p)=>cursor.expose(p.reduce((v,k)=>v?.[k],cursor.root)),peek:(...p)=>p.reduce((v,k)=>v?.[k],cursor.root)};
 const query=options=>householdResources(d,f.engine,owner,{marketSubstitution:false,...options}).rows.find(r=>r.item===item);
 // One bread supplies one unit: 20 - 10 for one day = 10 available;
 // the same 20 breads cover two days with none available for sale.
 withRecordIndex(()=>{
  assert.equal(query({days:1}).available,10);assert.equal(query({days:2}).available,0);
  assert.equal(query({days:1}).available,10);
  const snapshot=householdBudget(d,f.engine,owner,{kernel:true}),saved=JSON.stringify(snapshot);
  cursor.apply({op:'set',path:['ledger','accounts',bag(f.engine,owner,item)],value:30});
  assert.equal(query({days:1}).stock,30);assert.equal(query({days:1}).available,20);
  assert.equal(JSON.stringify(snapshot),saved,'read-only budget results must not retain mutable draft subtrees');
  cursor.apply({op:'set',path:['state','obligations','promise'],value:{id:'promise',kind:'forward',debtor:owner,creditor:other,resource:item,amount:3,status:'pending',deadline:DAY}});
  assert.equal(query({days:1}).available,17);
  // The valuation adapter deliberately has no ledger. Its legacy stock is 20,
  // even while the cursor-backed book reads 30; neither memo may replace it.
  const raw=()=>householdResources(stateReader(d.get('state')),f.engine,owner,{days:1,marketSubstitution:false}).rows.find(r=>r.item===item);
  assert.equal(raw().stock,20);assert.equal(raw().stock,20);
  cursor.apply({op:'set',path:['state','npcs',owner,'inventory',item],value:25});
  assert.equal(raw().stock,25);assert.equal(query({days:1}).stock,30);
  const view=subjectiveView(f.engine,d.document,owner),account=bag(f.engine,owner,item);
  view.self.accounts[account].balance=15;assert.equal(query({days:1,view}).stock,15);
  view.self.accounts[account].balance=17;assert.equal(query({days:1,view}).stock,17);
  assert.equal(householdResources(f.d,f.engine,owner,{days:1,marketSubstitution:false}).rows.find(r=>r.item===item).stock,20);
 });
});

test('one edible/sowable stock is allocated once: 20 - food10 - seed4 - promise3 = saleable3',()=>{
 const f=fixture(),w=f.engine.world,seed=w.domainRules.privateField.crops[0];
 seed.seed=item;seed.yieldSelector='field:wheat';
 w.items.find(i=>i.id===item).weight=w.domainRules.privateField.kgPerJin;
 w.primitiveTables.yields.rows.find(r=>r.key==='field:wheat/seed').seedPerUnit.qty=4;
 f.state.records['budget-lease']={id:'budget-lease',category:'contract',kind:'asset_lease',subject:'bld_hw_qingdeng',tenant:owner,use:'field',status:'有效',createdAt:0,deadline:20*DAY,rentBasis:{areaMu:1,seedItem:item}};
 f.state.obligations['budget-promise']={id:'budget-promise',kind:'forward',debtor:owner,creditor:other,resource:item,amount:3,paid:0,status:'pending',deadline:DAY,legacyRecord:'budget-projection'};
 f.state.records['budget-projection']={category:'contract',kind:'procurement',parties:[other,owner],subject:item,quantity:3,status:'pending'};
 f.sync();const before=JSON.stringify(f.d.document),row=householdResources(f.d,f.engine,owner,{days:1}).rows.find(r=>r.item===item);
 assert.deepEqual([row.stock,row.food,row.seed,row.committed,row.available],[20,10,4,3,3]);
 assert.equal(saleableStock(f.d,f.engine,owner,item).available,3);
 assert.equal(JSON.stringify(f.d.document),before);
 // Closed canonical claim suppresses its old pending projection:20-10-4=6.
 f.state.obligations['budget-promise'].status='completed';
 assert.equal(saleableStock(f.d,f.engine,owner,item).available,6);
});

test('separate seed item never subtracts from edible stock',()=>{
 const f=fixture(),binding=f.engine.world.domainRules.privateField.crops[0],seed=binding.seed;
 // Hand anchor: bread20 - food10 =10; seeds are a different inventory row.
 f.state.npcs[owner].inventory[seed]=10;
 f.state.records['budget-lease']={kind:'asset_lease',subject:'bld_hw_qingdeng',tenant:owner,use:'field',status:'有效',createdAt:0,deadline:DAY,rentBasis:{areaMu:1,seedItem:seed}};
 f.sync();const rows=householdResources(f.d,f.engine,owner,{days:1}).rows;
 assert.equal(rows.find(r=>r.item===item).available,10);
 assert.ok(rows.find(r=>r.item===seed).seed>0);
});

test('physical account remains authoritative when a legacy inventory key is absent',()=>{
 const f=fixture();f.sync();delete f.state.npcs[owner].inventory[item];
 // Hand anchor: booked20 minus food10 remains10, not a phantom empty bag.
 assert.equal(saleableStock(f.d,f.engine,owner,item).available,10);
 assert.equal(householdBudget(f.d,f.engine,owner).resources.rows.find(r=>r.item===item).stock,20);
});

test('legacy item names and canonical account keys describe one physical bag',()=>{
 const f=fixture();f.sync();
 const name=f.engine.byId.get(item).name;
 f.state.npcs[owner].inventory[name]=f.state.npcs[owner].inventory[item];delete f.state.npcs[owner].inventory[item];
 // Hand anchor: legacy name20 and its booked account20 are the SAME20,
 // with food10 and saleable10, rather than two displayed bags totaling40.
 const b=householdResources(f.d,f.engine,owner,{days:1});
 assert.equal(b.rows.filter(r=>r.holder===owner).reduce((n,r)=>n+r.stock,0),20);
 assert.equal(b.rows.find(r=>r.item===item).available,10);
});

test('a partial leased crop uses actual sown area once, independent of record order',()=>{
 const f=fixture(),w=f.engine.world,binding=w.domainRules.privateField.crops[0],seed=binding.seed;
 // Hand anchor: licensed2 mu could use8 seeds, but the actual1 mu crop
 // needs4; stock10 leaves6. Lease and crop never reserve8+4 or depend on order.
 binding.yieldSelector='field:wheat';w.items.find(i=>i.id===seed).weight=w.domainRules.privateField.kgPerJin;
 w.primitiveTables.yields.rows.find(r=>r.key==='field:wheat/seed').seedPerUnit.qty=4;
 f.state.npcs[owner].inventory[seed]=10;
 const lease={kind:'asset_lease',subject:'bld_hw_qingdeng',tenant:owner,use:'field',status:'有效',createdAt:0,deadline:20*DAY,rentBasis:{areaMu:2,seedItem:seed}};
 const farm={category:'private_farm',owner,location:'bld_hw_qingdeng',seedItem:seed,crop:binding.product,areaMu:1,status:'harvested'};
 f.state.records['budget-lease']=lease;f.state.records['budget-crop']=farm;f.sync();
 const read=()=>householdResources(f.d,f.engine,owner,{days:1}).rows.find(r=>r.item===seed);
 assert.equal(read().seedTarget,4);assert.equal(read().available,6);
 delete f.state.records['budget-lease'];f.state.records['budget-lease']=lease;
 assert.equal(read().seedTarget,4);assert.equal(read().available,6);
});

test('missing seed and promised stock are reported as deficits rather than invented inventory',()=>{
 const f=fixture(),binding=f.engine.world.domainRules.privateField.crops[0];
 // Hand anchor: no seeds plus a signed seed requirement produces a seed gap;
 // no sword plus a promise of3 swords produces a delivery gap3.
 f.state.records['budget-lease']={kind:'asset_lease',subject:'bld_hw_qingdeng',tenant:owner,use:'field',status:'有效',createdAt:0,deadline:DAY,rentBasis:{areaMu:1,seedItem:binding.seed}};
 f.state.obligations['missing-swords']={id:'missing-swords',kind:'forward',debtor:owner,creditor:other,resource:'item_steel_arming_sword',amount:3,status:'pending',deadline:DAY};
 f.sync();const b=householdResources(f.d,f.engine,owner,{days:1});
 assert.ok(b.seedShortfall>0);assert.equal(b.commitmentShortfall,3);
 assert.equal(b.rows.find(r=>r.item===binding.seed).stock,0);
 assert.equal(b.rows.find(r=>r.item==='item_steel_arming_sword').available,0);
});

test('cash5 stays cash5; day3 payment8 precedes day6 wage10 and exposes gap3',()=>{
 const f=fixture();
 for(const r of [
  {id:'budget-wage',kind:'wage',debtor:other,creditor:owner,resource:'coin_river',amount:10,deadline:6*DAY},
  {id:'budget-rent',kind:'rent',debtor:owner,creditor:other,resource:'coin_river',amount:8,deadline:3*DAY}
 ])f.state.obligations[r.id]={...r,status:'pending',paid:0};
 f.sync();const b=householdBudget(f.d,f.engine,owner,{kernel:true});
 assert.equal(b.cash,5);assert.equal(b.future[0].day,6);assert.equal(b.cashShortfall,3);
 assert.deepEqual(b.timeline.map(r=>r.balance),[-3,7]);
 const plans=householdOptions(b,{item,quantity:6,unitPrice:1});
 assert.equal(plans.find(r=>r.operation==='buy').feasible,false);
 assert.deepEqual(plans.find(r=>r.operation==='raise').requires,['consent','transfer']);
 assert.equal(plans.find(r=>r.operation==='raise').cashDelta,0);
 // Fixed copper anchor: 3*1.5 truncates once to4; a real invoice6 exceeds5.
 assert.equal(householdOptions(b,{item,quantity:3,unitPrice:1.5}).find(r=>r.operation==='buy').cashDelta,-4);
 assert.equal(householdOptions(b,{item,quantity:3,totalCoins:6}).find(r=>r.operation==='buy').feasible,false);
 // A known offer3 at day3 can bridge gap3 conditionally; day6 is too late.
 const offer={id:'known-credit-quote',amount:3,at:3*DAY};
 const raise=householdOptions(b,{quantity:3,fundingOffer:offer}).find(r=>r.operation==='raise');
 assert.equal(raise.feasible,true);assert.equal(raise.conditionalCashDelta,3);assert.equal(raise.cashDelta,0);
 assert.equal(householdOptions(b,{quantity:3,fundingOffer:{...offer,at:6*DAY}}).find(r=>r.operation==='raise').feasible,false);
 assert.equal(b.cash,5);
});

test('signed employment sets the reserve horizon and unpaid harvest is future goods only',()=>{
 const f=fixture(),binding=f.engine.world.domainRules.privateField.crops[0];
 // Hand anchor: wage arrives day6, so 6*10 food is wanted; bread20 leaves40.
 f.state.records['budget-job']={id:'budget-job',category:'contract',kind:'workshop',worker:owner,owner:other,status:'有效',createdAt:0,starts:0,deadline:20*DAY,nextWork:6*DAY,wage:10};
 f.sync();const b=householdBudget(f.d,f.engine,owner,{kernel:true});
 assert.equal(b.future[0].day,6);assert.equal(b.cash,5);
 // Intent: a signed wage six days out sets a six-day horizon, so ~40 breads' worth of gap remains beyond the 20 held (the wage is not cash). The 5 coin may buy real
 // shop food; the gap is then the full need minus that purchase's independently computed coverage minus the held bread.
 assert.equal(b.target.days,6);
 marketCheck(f,b,{held:20*SAT});
 assert.equal(saleableStock(f.d,f.engine,owner,item).available,0);
 // Growing crops are not in the bag, even when they have an expected yield.
 f.state.buildings.bld_hw_qingdeng={...f.state.buildings.bld_hw_qingdeng,owner,condition:100};
 f.state.records['budget-crop']={id:'budget-crop',category:'private_farm',owner,location:'bld_hw_qingdeng',settlement:'loc_hw',crop:binding.product,seedItem:binding.seed,areaMu:1,grownDays:1,qualitySum:1,qualityDays:1,status:'growing'};
 f.sync();const grown=householdBudget(f.d,f.engine,owner,{kernel:true});
 assert.equal(grown.cash,5);assert.ok(grown.future.some(r=>r.source==='harvest'&&!r.reliable&&r.amount>0));
 assert.equal(grown.resources.rows.find(r=>r.item===item).stock,20);
});

test('shared meals reserve one bag once and never grant the other purse',()=>{
 const f=fixture({members:[owner,other]});f.state.npcs[other].coins=900;f.sync();
 // Hand anchor: two residents *10 eat one bag20, no duplicate second bag.
 const a=saleableStock(f.d,f.engine,owner,item),b=saleableStock(f.d,f.engine,other,item);
 assert.equal(a.retained+b.retained,20);assert.equal(a.available,0);
 assert.equal(householdBudget(f.d,f.engine,owner,{kernel:true}).cash,5);
 assert.equal(reserveShortfall(f.d,f.engine,owner).satiety,0);
});

test('independent family accounts and single residents retain only their own meals',()=>{
 const f=fixture({members:[owner,other],shared:false});f.sync();
 // Hand anchor: separate household budgets do not double the owner's food10.
 assert.equal(saleableStock(f.d,f.engine,owner,item).retained,10);
 assert.ok(reserveShortfall(f.d,f.engine,other).satiety>0);
 const single=fixture();single.sync();assert.equal(saleableStock(single.d,single.engine,owner,item).retained,10);
});

test('children are mouths to feed; a common crop failure cannot create aid',()=>{
 const child=world.npcs.find(n=>n.flags?.minor||n.age<18).id;
 const f=fixture({members:[owner,child]});f.state.npcs[owner].inventory[item]=5;f.sync();
 // Hand anchor: two bodies need20; five meals leave15, including the child.
 // Intent: two mouths for one day need 20 breads' worth, five held leave 15; the child counts. Real shop food may cover part of it, computed independently.
 const r=householdResources(f.d,f.engine,owner,{days:1});marketCheck(f,r,{members:2,days:1,held:5*SAT});assert.ok(r.shortfall.satiety>0);
 const subjective=householdBudget(f.d,f.engine,owner);
 assert.deepEqual(subjective.resources.members,[owner,child]);
 // The subjective view only knows received offers: no purchase, so the parent's gap is the full 15 breads (needs, not another purse).
 assert.equal(subjective.resources.market.purchases.length,0);
 near(subjective.resources.shortfall.satiety,15*SAT,'the parent budgets for the child without reading another purse');
 const calm=householdBudget(f.d,f.engine,owner,{kernel:true}),disaster=householdBudget(f.d,f.engine,owner,{kernel:true,commonRisk:1});
 assert.ok(disaster.target.days>calm.target.days);assert.equal(disaster.cash,calm.cash);
 assert.equal(disaster.mutualAidAvailable,0);assert.ok(disaster.resources.shortfall.satiety>calm.resources.shortfall.satiety);
});

test('joint crop losses reduce both households future goods without manufacturing mutual insurance',()=>{
 const f=fixture(),binding=f.engine.world.domainRules.privateField.crops[0];
 const fields=[[owner,'bld_hw_qingdeng'],[other,'bld_hw_forge']];
 for(const [id,location]of fields){
  f.state.buildings[location]={...f.state.buildings[location],owner:id,condition:100};
  f.state.records[`budget-crop:${id}`]={id:`budget-crop:${id}`,category:'private_farm',owner:id,location,settlement:'loc_hw',crop:binding.product,seedItem:binding.seed,areaMu:1,grownDays:10,qualitySum:10,qualityDays:10,status:'growing'};
 }
 f.sync();const calm=fields.map(([id])=>householdBudget(f.d,f.engine,id,{kernel:true}));
 // Hand anchor: a common crop-quality loss 1 -> 1/10 cuts BOTH yields;
 // the same commonRisk1 increases exposure without adding either purse.
 for(const [id]of fields)f.state.records[`budget-crop:${id}`].qualitySum=1;
 const failed=fields.map(([id])=>householdBudget(f.d,f.engine,id,{kernel:true,commonRisk:1}));
 for(let i=0;i<2;i++){
  assert.ok(failed[i].future.find(r=>r.source==='harvest').amount<calm[i].future.find(r=>r.source==='harvest').amount);
  assert.ok(failed[i].target.days>=calm[i].target.days);
  assert.equal(failed[i].cash,calm[i].cash);assert.equal(failed[i].mutualAidAvailable,0);
 }
});

test('actual agreed dialogue gift changes the recipient budget only after physical transfer',async()=>{
 const f=fixture();f.state.minute=600;f.state.location='bld_hw_qingdeng';f.state.inventory[item]=1;f.state.npcs[owner].location=f.state.location;f.sync();
 // Hand anchor: an expected gift adds0; actual delivery moves1, bag20 ->21.
 const before=householdBudget(f.d,f.engine,owner,{kernel:true});
 assert.equal(before.resources.rows.find(r=>r.item===item).stock,20);
 assert.equal(before.mutualAidAvailable,0);
 const out=await f.engine.reduce(f.d.document,{tool:'world_remember',args:{subject:owner,key:'dialogue:ask',content:'近来如何',source:item},eventId:'budget-real-gift'});
 f.replace(applyPatches(f.d.document,out.patches));
 assert.equal(f.engine.quantity(f.d,'player',item),0);
 assert.equal(householdBudget(f.d,f.engine,owner,{kernel:true}).resources.rows.find(r=>r.item===item).stock,21);
 assert.equal(householdBudget(f.d,f.engine,owner,{kernel:true}).cash,before.cash);
});

test('double worlds: hidden household money/stock/obligations do not change NPC subjective budget',()=>{
 const f=fixture({members:[owner,other]});f.sync();
 const a=householdBudget(f.d,f.engine,owner);
 // Hand anchor: hidden +900 cash/+200 bread belongs to the other person: delta0.
 f.state.npcs[other].coins=900;f.state.npcs[other].inventory[item]=200;
 f.state.obligations['hidden-wage']={id:'hidden-wage',debtor:'player',creditor:other,resource:'coin_river',amount:900,deadline:DAY,status:'pending'};f.sync();
 assert.deepEqual(householdBudget(f.d,f.engine,owner),a);
 const view=subjectiveView(f.engine,f.d.document,owner);view.knowledge.facts['expected-help']={value:900,kind:'belief'};
 const believed=householdBudget(f.d,f.engine,owner,{view});assert.equal(believed.cash,5);assert.equal(believed.expectations['expected-help'].value,900);
 assert.equal(believed.mutualAidAvailable,0);
 assert.throws(()=>householdBudget(f.d,f.engine,other,{view}),/observer mismatch/);
});

test('stable seeded preferences include spendthrifts and thrifty targets without minting resources',()=>{
 const f=fixture();f.engine.world.marketRules.householdBuffer=world.marketRules.householdBuffer;f.sync();
 // Hand anchor: keyed draws yield cycles0/1/2; risk never reduces a fixed target.
 const profiles=new Set();const before=JSON.stringify(f.d.document);
 const savedSeed=f.d.document.randomSeed;
 for(let seed=0;seed<100;seed++){
  f.d.document.randomSeed=`budget-preference-${seed}`;
  const id=owner;
  const a=householdBufferTarget(f.d,f.engine,id),b=householdBufferTarget(f.d,f.engine,id,{risk:1});
  profiles.add(a.profile);assert.ok(b.days>=a.days);assert.deepEqual(householdBufferTarget(f.d,f.engine,id),a);
 }
 f.d.document.randomSeed=savedSeed;
 assert.deepEqual([...profiles].sort(),['ordinary','spendthrift','thrifty']);
 assert.equal(JSON.stringify(f.d.document),before);
});

test('older world tables without the new preference mixture retain the existing ordinary cycle',()=>{
 const f=fixture();delete f.engine.world.marketRules.householdBuffer;f.sync();
 // Hand anchor: the parent world's personalReserveDays1 still retains10 of20.
 const before=JSON.stringify(f.d.document),target=householdBufferTarget(f.d,f.engine,owner);
 assert.equal(target.source,'legacy-reserve-rule');assert.equal(target.days,1);
 assert.equal(saleableStock(f.d,f.engine,owner,item).available,10);
 assert.equal(JSON.stringify(f.d.document),before);
});

// Reuse the published daily bread channel, reducing the fixture's offer to
// that one real row so each calculation has a single price and food resource.
function marketFixture(){
 const f=fixture();
 f.engine.byId.get(owner).shopRestock=[{item,source:'local',amount:6,maximum:6}];
 // Shelf control: this fixture is about the paid daily bread channel, so every other keeper's shelf is emptied (the owner's single bread row stays);
 // otherwise a real shop food with better satiety per coin legitimately wins the purchase and hides what these tests mean to check.
 const shops=f.engine.world.rules.economy.shops;
 for(const store of shops.stores)if(store.keeper!==owner)store.restock=[];
 shops.additionalRestock={};
 for(const npc of f.engine.byId.values())if(npc.id!==owner&&String(npc.id).startsWith("npc_"))npc.shopRestock=[];
 // K2（卡 E）依据：本地货架改为向本聚落持货人进货，下一次补货只算得上持货人眼下能出让的余量（shop.mjs 口粮来源）。
 // 夹具安排一位村民手里有足够多的面包，让“每天补 6 个”的真实上游存在；家户预算的断言不变。
 f.state.npcs[supplier].inventory={...f.state.npcs[supplier].inventory,[item]:500};
 // Likewise no other resident has goods to sell as a walk-in trader; the supplier keeps the bread that backs the owner's daily restock.
 for(const [id,npc] of Object.entries(f.state.npcs))if(id!==owner&&id!==supplier)npc.inventory={};
 f.state.minute=DAY/2;f.state.npcs[owner].coins=100;f.sync();return f;
}

test('paid daily replenishment replaces only food after its real delivery time',()=>{
 const f=marketFixture(),before=JSON.stringify(f.d.document);
 const b=householdBudget(f.d,f.engine,owner,{kernel:true});
 // Ten meals/day, half a day until tomorrow: retain5, buy the other5.
 assert.equal(b.resources.market.nextFoodAt,DAY);
 assert.equal(b.resources.market.coverage.satiety,5*SAT);
 assert.equal(b.resources.rows.find(r=>r.item===item).food,5);
 assert.equal(b.cash,100);assert.equal(JSON.stringify(f.d.document),before);
 assert.ok(b.resources.market.spent>0&&b.resources.market.spent<=100);
 // Even a thrifty two-day target still bridges the waiting half day, and
 // cannot get more than six loaves at either daily delivery. At day1.5,
 // 15 meals are needed but only6 have arrived: at least9 remain physical.
 f.engine.world.marketRules.householdBuffer.profiles=[{id:'thrifty',through:20,cycles:2}];
 const thrifty=householdBudget(f.d,f.engine,owner,{kernel:true});
 assert.equal(thrifty.resources.market.coverage.satiety,11*SAT);
 assert.equal(thrifty.resources.rows.find(r=>r.item===item).food,9);
});

test('cash and supplier capacity each bound substitution; a future wage is not cash',()=>{
 const f=marketFixture(),rich=householdBudget(f.d,f.engine,owner,{kernel:true});
 const price=rich.resources.market.purchases[0].unitPrice;
 f.state.npcs[owner].coins=price*2;f.sync();
 // A purse for two meals replaces2, not all five post-delivery meals.
 const limited=householdBudget(f.d,f.engine,owner,{kernel:true});
 assert.equal(limited.resources.market.coverage.satiety,2*SAT);
 assert.equal(limited.resources.rows.find(r=>r.item===item).food,8);
 f.state.npcs[owner].coins=0;
 f.state.obligations.wage={id:'wage',kind:'wage',debtor:other,creditor:owner,resource:'coin_river',amount:100,deadline:6*DAY};f.sync();
 const unpaid=householdBudget(f.d,f.engine,owner,{kernel:true});
 assert.equal(unpaid.cash,0);assert.equal(unpaid.resources.market.spent,0);
 assert.equal(unpaid.target.foodDays,null);
});

test('one affordable market meal cannot erase the remaining six-day income gap',()=>{
 const f=marketFixture(),price=householdBudget(f.d,f.engine,owner,{kernel:true}).resources.market.purchases[0].unitPrice;
 f.state.npcs[owner].coins=price;
 f.state.obligations.wage={id:'wage',kind:'wage',debtor:other,creditor:owner,resource:'coin_river',amount:100,deadline:f.state.minute+6*DAY};f.sync();
 // Six days need60 meals: one paid future meal plus physical20 still lack39.
 const b=householdBudget(f.d,f.engine,owner,{kernel:true});
 assert.equal(b.target.days,6);assert.equal(b.target.foodDays,0.5);
 // Intent: the purse buys exactly one paid meal (price coins), which does not close the six-day gap. First purchase, coverage and gap are recomputed independently.
 assert.equal(b.resources.market.purchases.reduce((n,p)=>n+p.quantity,0),1);
 marketCheck(f,b,{held:20*SAT});
});

test('simultaneous sources: residents buy the food with the most effective satiety per coin, not the cheapest',()=>{
 // Intent (Li Bai's rule): among foods arriving together the household buys the best satiety per coin among those it can actually eat (single-meal cap room,
 // as in marketCheck). Vinegar is cheapest but has no derived satiety; the expected winner is computed from derived satiety, price and cap room, not named.
 const before=registerHouseholdFoodSources.fn;
 try{
  const f=fixture();f.state.npcs[owner].coins=100;f.sync();
  const at=f.state.minute,offers=[['item_fruit_vinegar',1],['item_cabbage',2],[item,3]].map(([it,unitPrice])=>({source:`fx_${it}`,seller:'npc_fx_seller',item:it,at,quantity:50,unitPrice}));
  registerHouseholdFoodSources(()=>offers);
  const b=householdBudget(f.d,f.engine,owner,{kernel:true}),caps=mealCapPools(f.engine,{days:[b.target.days]}),minute=f.state.minute;
  const expected=bestPerCoin(f,offers.filter(o=>satOf(f,o.item)>0&&caps.unitsRoom(o.item,(o.at-minute)/DAY)>=1),gapOf(f,{days:b.target.days,held:20*SAT}));
  assert.equal(b.resources.market.purchases[0].item,expected);
  const cheapest=[...offers].sort((x,y)=>x.unitPrice-y.unitPrice).find(o=>satOf(f,o.item)>0).item;
  assert.notEqual(expected,cheapest,'premise: the best per coin is not the cheapest food');
  assert.ok(!b.resources.market.purchases.some(p=>satOf(f,p.item)===0),'a source with no satiety is never bought');
 }finally{registerHouseholdFoodSources(before);}
});

test('missing business, failed supply and common loss cannot act as paid food access',()=>{
 const f=marketFixture(),normal=householdBudget(f.d,f.engine,owner,{kernel:true});
 assert.ok(normal.resources.market.coverage.satiety>0);
 // Common exposure1 disables substitution; one-day ordinary target doubles.
 const disaster=householdBudget(f.d,f.engine,owner,{kernel:true,commonRisk:1});
 assert.equal(disaster.resources.market.coverage.satiety,0);
 assert.equal(disaster.resources.rows.find(r=>r.item===item).food,20);
 // Resolve the published shop id rather than assuming an actor-specific name.
 const purchase=normal.resources.market.purchases[0];
 f.state.records[`shop:${purchase.source}`]={category:'shop_ledger',entries:[{item,added:0,reason:'source interrupted'}]};
 assert.equal(householdBudget(f.d,f.engine,owner,{kernel:true}).resources.market.coverage.satiety,0);
 f.state.records={};f.state.npcs[owner].status='患病';
 assert.equal(householdBudget(f.d,f.engine,owner,{kernel:true}).resources.market.coverage.satiety,0);
});

test('received local food offer uses its pickup window without reading another family account',()=>{
 const f=fixture({members:[other],shared:true}),planner=other;
 // The recipient is at the existing counter when receiving its pickup offer.
 f.state.minute=DAY/2;f.state.npcs[planner].location=f.state.npcs[owner].location;f.state.npcs[planner].coins=6;f.sync();
 const view=subjectiveView(f.engine,f.d.document,planner);
 view.knowledge.facts['local-food-offer']={kind:'observed',source:'received-quote',value:{seller:owner,item,quantity:5,unitPrice:2,at:DAY*3/4,expires:DAY}};
 // Two copper each, own six buys3; a quarter day still needs2.5 meals.
 const b=householdBudget(f.d,f.engine,planner,{view});
 assert.equal(b.resources.market.coverage.satiety,3*SAT);
 assert.equal(b.resources.market.spent,6);
 assert.equal(b.resources.market.nextFoodAt,DAY*3/4);
 f.state.npcs[owner].coins=9999;f.state.npcs[owner].inventory[item]=9999;
 f.state.npcs[owner].status='患病';f.sync();
 assert.deepEqual(householdBudget(f.d,f.engine,planner,{view}),b);
 view.knowledge.facts['local-food-offer'].kind='belief';
 assert.equal(householdBudget(f.d,f.engine,planner,{view}).resources.market.spent,0);
});

test('market cash is earmarked once across resources and known prior payments',()=>{
 const f=marketFixture();// Premise: the bread supplies both nutrients; satiety stays its material-data value, hydration is set equal to it.
 f.engine.byId.get(item).nutrition={...f.engine.byId.get(item).nutrition,hydration:SAT};
 const rich=householdBudget(f.d,f.engine,owner,{kernel:true}),price=rich.resources.market.purchases[0].unitPrice;
 f.state.npcs[owner].coins=price*2;
 f.state.obligations.bill={id:'bill',kind:'rent',debtor:owner,creditor:other,resource:'coin_river',amount:price,deadline:DAY};f.sync();
 // Two meal-prices minus a due bill leaves one purchase, which provides both
 // its nutrients. Hydration must not spend the same remaining purse again.
 const b=householdBudget(f.d,f.engine,owner,{kernel:true});
 assert.equal(b.resources.market.spent,price);
 assert.equal(b.resources.market.purchases.reduce((n,p)=>n+p.quantity,0),1);
 // Intent: the one affordable purchase supplies both nutrients and the due bill takes the other price; independent first purchase and coverage, hydration bounded by that item's own.
 marketCheck(f,b,{payments:price,held:20*SAT});
 const first=b.resources.market.purchases[0].item;
 assert.ok(b.resources.market.coverage.hydration<=(f.engine.byId.get(first).nutrition?.hydration??0));
 assert.equal(b.cash,price*2);
 assert.equal(b.foodTimeline.find(r=>r.at===DAY).plannedFood,price);
 assert.equal(b.foodTimeline.find(r=>r.at===DAY).balance,0);
});

test('a real local seller opening defines access, while an unknown remote account cannot',()=>{
 const f=fixture({members:[owner,other],shared:false}),planner=other;
 f.state.minute=300;f.state.npcs[planner].coins=100;
 f.state.npcs[planner].location=f.state.npcs[owner].location;f.sync();
 // The seller's stock is split by need with a daily lottery for the remainders, so whether this small household draws a unit
 // from the owner's counter depends on the seed. Across many seeds the draw must be neither always nor never: a small household
 // is no longer deterministically shut out. Whenever it does draw, the access is the real one: the counter's own opening
 // (minute 540, no identity-based clock), the shopper's bag stays empty (cash-backed access is not a meal in hand), and a
 // subjective view that was never offered the counter reads nothing. When the seller is ill, no seed draws from the owner.
 const from=b=>b.resources.market.purchases.filter(p=>p.seller===owner&&p.item===item);
 const seeds=[...Array(200).keys()].map(s=>`share-${s}`),hitSeeds=[];
 for(const seed of seeds){
  f.d.document.randomSeed=seed;
  const known=householdBudget(f.d,f.engine,planner,{kernel:true}),got=from(known);
  assert.ok(got.length<=1,`one purchase line per seller and item (${seed})`);
  if(got.length){
   hitSeeds.push(seed);
   assert.equal(known.resources.procurementShortfall.satiety,10*SAT,seed);
   assert.equal(reserveShortfall(f.d,f.engine,planner).satiety,10*SAT,seed);
   assert.equal(householdBudget(f.d,f.engine,planner).resources.market.coverage.satiety,0,`${seed}: a view never offered the counter has no access`);
   assert.equal(got[0].at,540,`${seed}: the counter's real opening`);
   assert.ok(known.resources.market.nextFoodAt<=540&&known.resources.market.coverage.satiety>0,seed);
  }
 }
 assert.ok(hitSeeds.length>0,'a small household must draw from the counter on some seeds');
 assert.ok(hitSeeds.length<seeds.length,'a draw is a lottery, not a certainty, when the stock is scarce');
 f.state.npcs[owner].status='患病';
 for(const seed of hitSeeds){f.d.document.randomSeed=seed;assert.equal(from(householdBudget(f.d,f.engine,planner,{kernel:true})).length,0,`${seed}: an ill seller sells nothing`);}
});

test('cash-backed purchases and contractual balances remain separate scenarios',()=>{
 const f=marketFixture(),price=householdBudget(f.d,f.engine,owner,{kernel:true}).resources.market.purchases[0].unitPrice;
 f.state.npcs[owner].coins=price*2;
 f.state.obligations.bill={id:'bill',kind:'rent',debtor:owner,creditor:other,resource:'coin_river',amount:price,deadline:DAY*1.5};
 f.state.obligations.wage={id:'wage',kind:'wage',debtor:other,creditor:owner,resource:'coin_river',amount:100,deadline:f.state.minute+3*DAY};f.sync();
 // Two meal-prices can pay the bill alone. Buying two meals first creates a
 // conditional gap of one meal-price; neither the purchase nor wage is cash.
 const b=householdBudget(f.d,f.engine,owner,{kernel:true});
 assert.equal(b.cash,price*2);assert.equal(b.cashShortfall,0);
 assert.equal(b.plannedCashShortfall,price);
 assert.equal(b.foodTimeline.find(r=>r.at===DAY).plannedFood,price*2);
 assert.equal(b.timeline.find(r=>r.at===DAY*1.5).balance,price);
});

test('my future food purchase cannot release another household holder reserve before transfer',()=>{
 const f=fixture({members:[owner,other]});
 f.state.minute=DAY/2;f.state.npcs[owner].inventory={};
 f.state.npcs[owner].coins=900;f.state.npcs[other].inventory={[item]:20};f.sync();
 // The shared bag already contains all20 meals. Its holder has no purse;
 // another person's900 cannot promise away that holder's retained20.
 const own=householdResources(f.d,f.engine,owner),held=own.rows.find(r=>r.holder===other&&r.item===item);
 assert.equal(held.food,20);assert.equal(own.market.spent,0);
 assert.equal(saleableStock(f.d,f.engine,other,item).available,0);
 assert.equal(householdBudget(f.d,f.engine,other,{kernel:true}).cash,0);
});

test('configured edible public-stock access follows its actual account, not a stale legacy balance',()=>{
 const f=marketFixture(),food=item;
 // The existing stockItems binding accepts edible food as well as raw oats.
 // Use the same bread as the hand anchor; no new item, place or stock source.
 f.engine.rules.economy.shops.stockItems.food=food;
 f.engine.byId.get(owner).shopRestock=[{item:food,source:'settlement',stock:'food',reserve:0,amount:6,maximum:6}];
 // The native shop domain also serves unmanaged settlements. Its six goods
 // are a finite upstream account, not repeatable local production/imports.
 delete f.state.records['agriculture:loc_hw'];f.state.settlements.loc_hw.food=6;f.sync();
 const account=settlementStock(f.engine,'loc_hw','food');
 f.d.document.ledger.accounts[account]=6;
 const ready=householdBudget(f.d,f.engine,owner,{kernel:true});
 assert.ok(ready.resources.market.coverage.satiety>0);
 f.engine.world.marketRules.householdBuffer.profiles=[{id:'thrifty',through:20,cycles:2}];
 const finite=householdBudget(f.d,f.engine,owner,{kernel:true});
 assert.equal(finite.resources.market.coverage.satiety,6*SAT);
 assert.equal(finite.resources.rows.find(r=>r.item===item).food,14);
 f.d.document.ledger.accounts[account]=0;
 // Legacy six is unchanged; booked zero must remove the promised access.
 assert.equal(f.state.settlements.loc_hw.food,6);
 assert.equal(householdBudget(f.d,f.engine,owner,{kernel:true}).resources.market.coverage.satiety,0);
});
