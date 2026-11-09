import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {householdResources} from '../server-plugin/household-budget.mjs';
import {foodHabit} from '../server-plugin/food-habit.mjs';
import {poorLuxuryShare} from '../tools/audit-food-habit.mjs';

// 惯常性（server-plugin/food-habit.mjs）：同一条规则、不同世界数据，得出不同的“日常品/奢侈品”，不按物品名、不写死时代。
// 蜂蜜在原世界是单一卖家、单份价高于居民日均收入的日常上限（奢侈）；改成本地多卖家、低价后同一规则把它当日常品。
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',home='bld_hw_qingdeng',item='item_honey';
const SELLERS=['npc_hw_linsui','npc_hw_ayan','npc_hw_chenbai'];
function fixture({sellers=1,basePrice=null,cash=20,rule={},bread=false,otherCash=0}={}){
 const w=structuredClone(world),ids=SELLERS.slice(0,sellers+(bread?1:0)),breadSeller=bread?ids.at(-1):null;
 delete w.rules.householdSubsistence;
 for(const n of w.npcs){delete n.tier;delete n.schedule;}
 w.rules.economy.shops.stores=w.rules.economy.shops.stores.filter(s=>!ids.includes(s.keeper));
 for(const id of ids)delete w.npcs.find(n=>n.id===id).shopType;
 w.households=[{id:'habit-house',members:[A,B],settlement:'loc_hw',homeLocation:home},...ids.map(id=>({id:`habit-seller-${id}`,members:[id],settlement:'loc_hw',homeLocation:home}))];
 for(const r of w.primitiveTables.body.rows)if(r.selector==='person')r.drainPerHour.light=r.need==='satiety'?2.5:0;
 const honey=w.items.find(i=>i.id===item);honey.nutrition={satiety:30};w.items.find(i=>i.id==='item_bread').nutrition={satiety:1000};if(basePrice!==null)honey.basePrice=basePrice;
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:1}];w.marketRules.customerChoice.noisePermille=0;
 Object.assign(w.marketRules.foodHabit,rule);
 for(const n of w.npcs.filter(n=>[A,...ids].includes(n.id))){n.tier='full';n.schedule={default:[{start:0,end:1440,location:home,activity:'休息',services:ids.includes(n.id)?['trade']:[]}]};}
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'food-habit');
 doc.state.minute=0;doc.state.location=home;delete doc.state.records['agriculture:loc_hw'];
 doc.state.npcs=Object.fromEntries([A,B,...ids].map(id=>[id,{...doc.state.npcs[id],coins:id===A?cash:ids.includes(id)?otherCash:0,inventory:id===A||id===B?{}:id===breadSeller?{item_bread:100}:{[item]:100},location:home,status:'正常',activity:'休息'}]));
 doc.state.settlements={loc_hw:{...doc.state.settlements.loc_hw,population:2+ids.length,granary:false,food:0,foodPerDay:0,woodPerDay:0}};
 doc.ledger=openLedger(e,doc);
 return {e,doc,d:e.primitiveDraft(doc)};
}
const honey=f=>householdResources(f.d,f.e,A).market.purchases.filter(p=>p.item===item);

test('poor household: with an everyday source available it buys no luxury; with only the luxury and a big gap it buys it after all',()=>{
 const withDaily=householdResources(...(f=>[f.d,f.e,A])(fixture({sellers:1,bread:true,cash:20}))).market.purchases;
 assert.ok(withDaily.some(p=>p.item==='item_bread')&&!withDaily.some(p=>p.item===item),'everyday bread covers the gap, honey is not bought');
 const only=honey(fixture({sellers:1,cash:20}));
 assert.ok(only.length>0&&only.every(p=>p.luxury===true&&p.deferred===true),'only luxury honey on offer: bought to fill the remaining gap');
});

test('the same rule on different world data: cheap multi-seller local honey is an everyday food, not a luxury',()=>{
 const local=fixture({sellers:3,basePrice:1,cash:20}),buys=honey(local);
 assert.ok(buys.length>0&&buys.every(p=>p.luxury===false&&p.habit>=local.e.world.marketRules.foodHabit.luxuryBelow));
 const original=honey(fixture({sellers:1,cash:20}));
 assert.ok(original.every(p=>p.luxury===true),'original world: same honey is judged luxury by the same rule');
});

test('a household with cash far above its daily income treats the luxury like any food (not deferred); the rule table decides how far',()=>{
 const buys=honey(fixture({sellers:1,cash:10000}));
 assert.ok(buys.length>0&&buys.every(p=>p.luxury===true&&p.deferred===false));
 assert.ok(honey(fixture({sellers:1,cash:10000,rule:{richCashDays:1e9}})).every(p=>p.deferred===true));
});

test('p is the share of local households whose cash budget covers the price; the subjective view reads only the own household',()=>{
 const src=[{item,seller:'x',unitPrice:9,quantity:1}],view={self:{location:home}};
 const poor=fixture({sellers:1,cash:20,otherCash:0}),mixed=fixture({sellers:1,cash:20,otherCash:100000});
 const obj=f=>foodHabit(f.d,f.e,A,src,{cash:20}).sources[0].habit,sub=f=>foodHabit(f.d,f.e,A,src,{cash:20,view}).sources[0].habit;
 assert.ok(obj(mixed)>obj(poor),'objective: a richer neighbour household raises the affordable share');
 assert.equal(sub(mixed),sub(poor),'subjective: other households are not read');
 assert.equal(sub(poor),0);// 本户预算 20 × 0.25 < 9
 assert.ok(foodHabit(poor.d,poor.e,A,src,{cash:100,view}).sources[0].habit>0);
});

test('household purchase planning with habit is deterministic',()=>{
 const run=()=>{const f=fixture({sellers:3,basePrice:1,cash:20});return JSON.stringify(householdResources(f.d,f.e,A).market.purchases);};
 assert.equal(run(),run());
});

test('regression guard: poor households spend at most the rule-table share of their purchases on luxury sources (real seed world)',()=>{
 const e=new WorldEngine(world),doc=e.createCharacter(legacy,{},'food-habit-audit'),r=poorLuxuryShare(e,doc);
 assert.ok(r.poor>0&&r.total>0&&r.ok,`luxury share ${r.share} of ${r.total} copper must be <= ${r.max}: ${JSON.stringify(r.byItem)}`);
});
