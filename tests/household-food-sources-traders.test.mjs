import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {householdResources} from '../server-plugin/household-budget.mjs';

// 口粮替代的食物来源按“本聚落内、营业窗口内、持有可出让食物的交易服务持有人”整类计，店铺只是其中一种。
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',seller='npc_hw_linsui',item='item_bread',home='bld_hw_qingdeng';
// shop=true 保留林穗的登记店铺身份；shop=false 去掉店铺身份，她只是一位提供交易服务的持有人。
function fixture({shop=true,open=true,away=null,sameHousehold=false,cash=10000}={}){
 const w=structuredClone(world);
 delete w.rules.householdSubsistence;
 for(const n of w.npcs){delete n.tier;delete n.schedule;}
 if(!shop){
  w.rules.economy.shops.stores=w.rules.economy.shops.stores.filter(s=>s.keeper!==seller);
  delete w.npcs.find(n=>n.id===seller).shopType;
 }
 w.households=[{id:'meal-house-0',members:sameHousehold?[A,B,seller]:[A,B],settlement:'loc_hw',homeLocation:home}];
 if(!sameHousehold)w.households.push({id:'meal-seller',members:[seller],settlement:'loc_hw',homeLocation:home});
 for(const r of w.primitiveTables.body.rows)if(r.selector==='person')r.drainPerHour.light=r.need==='satiety'?2.5:0;
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:1}];w.marketRules.customerChoice.noisePermille=0;
 const at=away??home;
 for(const n of w.npcs.filter(n=>[A,seller].includes(n.id))){n.tier='full';n.schedule={default:[{start:0,end:1440,location:n.id===seller?at:home,activity:'休息',services:n.id===seller&&open?['trade']:[]}]};}
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'food-sources-traders');
 doc.state.minute=0;doc.state.location=home;delete doc.state.records['agriculture:loc_hw'];
 doc.state.npcs=Object.fromEntries([A,B,seller].map(id=>[id,{...doc.state.npcs[id],coins:id===A?cash:0,inventory:{},location:id===seller?at:home,status:'正常',activity:'休息'}]));
 doc.state.npcs[A].inventory={[item]:2};doc.state.npcs[seller].inventory={[item]:100};
 doc.state.settlements={loc_hw:{...doc.state.settlements.loc_hw,population:3,granary:false,food:0,foodPerDay:0,woodPerDay:0}};
 doc.ledger=openLedger(e,doc);
 return {e,doc,d:e.primitiveDraft(doc)};
}
const retained=(f,opts)=>householdResources(f.d,f.e,A,opts).rows.filter(r=>r.holder===A&&r.item===item).reduce((n,r)=>n+r.retained,0);
const boughtFrom=(f,who)=>householdResources(f.d,f.e,A).market.purchases.filter(p=>p.seller===who&&p.item===item);

test('a non-shop trader open in the same settlement is a food source and lowers the retained ration',()=>{
 const f=fixture({shop:false});
 const base=retained(f,{marketSubstitution:false}),withMarket=retained(f);
 const res=householdResources(f.d,f.e,A),buys=boughtFrom(f,seller);
 assert.ok(buys.length>0,'trader stock must be purchasable');
 // Derived from the rule: coverage is what the purchases supply; the retained ration drops by units that coverage replaces.
 // 面包的饱腹由材料数据推导，读引擎派生值（不再手写 30）
 const SAT=f.e.byId.get(item).nutrition.satiety;
 const coverage=buys.reduce((n,p)=>n+p.quantity*SAT,0);
 assert.ok(coverage>0&&res.market.coverage.satiety>0);
 assert.ok(withMarket<base,`retained ${withMarket} should fall below ${base}`);
 assert.ok((base-withMarket)*SAT<=res.market.coverage.satiety+SAT);
 assert.ok(buys.every(p=>p.cycleDays===0&&p.quantity<=100));
});

test('a trader who is closed, out of town, or in the buyer\'s own household is not counted',()=>{
 const base=retained(fixture({shop:false}),{marketSubstitution:false});
 const closed=fixture({shop:false,open:false});
 assert.equal(boughtFrom(closed,seller).length,0);assert.equal(retained(closed),base);
 const other=world.settlementProfiles.find(p=>p.id!=='loc_hw').id,far=fixture({shop:false,away:other});
 assert.equal(boughtFrom(far,seller).length,0);assert.equal(retained(far),base);
 const kin=fixture({shop:false,sameHousehold:true});
 assert.equal(boughtFrom(kin,seller).length,0);
 const broke=fixture({shop:false,cash:0});
 assert.equal(retained(broke),base);
});

test('the registered human shopkeeper path still resolves through the shop and gives the same retained ration',()=>{
 const shop=fixture({shop:true}),trader=fixture({shop:false});
 const buys=boughtFrom(shop,seller);
 assert.ok(buys.length>0);assert.ok(buys.every(p=>p.source.startsWith('shop_')));
 // Shop or not, the seller's saleable stock and the buyer's needs are the same, so the ration is the same.
 assert.equal(retained(shop),retained(trader));
 assert.equal(boughtFrom(shop,seller).reduce((n,p)=>n+p.quantity,0),boughtFrom(trader,seller).reduce((n,p)=>n+p.quantity,0));
});
