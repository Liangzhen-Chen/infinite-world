import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {householdResources} from '../server-plugin/household-budget.mjs';
import {poorLuxuryShare} from '../tools/audit-food-habit.mjs';

// 惯常性（server-plugin/food-habit.mjs）：同一条规则、不同世界数据，得出不同的“日常品/奢侈品”，不按物品名、不写死时代。
// 蜂蜜在原世界是单一卖家、单份价高于居民日均收入的日常上限（奢侈）；改成本地多卖家、低价后同一规则把它当日常品。
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',home='bld_hw_qingdeng',item='item_honey';
const SELLERS=['npc_hw_linsui','npc_hw_ayan','npc_hw_chenbai'];
function fixture({sellers=1,basePrice=null,cash=20,rule={}}={}){
 const w=structuredClone(world),ids=SELLERS.slice(0,sellers);
 delete w.rules.householdSubsistence;
 for(const n of w.npcs){delete n.tier;delete n.schedule;}
 w.rules.economy.shops.stores=w.rules.economy.shops.stores.filter(s=>!ids.includes(s.keeper));
 for(const id of ids)delete w.npcs.find(n=>n.id===id).shopType;
 w.households=[{id:'habit-house',members:[A,B],settlement:'loc_hw',homeLocation:home},...ids.map(id=>({id:`habit-seller-${id}`,members:[id],settlement:'loc_hw',homeLocation:home}))];
 for(const r of w.primitiveTables.body.rows)if(r.selector==='person')r.drainPerHour.light=r.need==='satiety'?2.5:0;
 const honey=w.items.find(i=>i.id===item);honey.nutrition={satiety:30};if(basePrice!==null)honey.basePrice=basePrice;
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:1}];w.marketRules.customerChoice.noisePermille=0;
 Object.assign(w.marketRules.foodHabit,rule);
 for(const n of w.npcs.filter(n=>[A,...ids].includes(n.id))){n.tier='full';n.schedule={default:[{start:0,end:1440,location:home,activity:'休息',services:ids.includes(n.id)?['trade']:[]}]};}
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'food-habit');
 doc.state.minute=0;doc.state.location=home;delete doc.state.records['agriculture:loc_hw'];
 doc.state.npcs=Object.fromEntries([A,B,...ids].map(id=>[id,{...doc.state.npcs[id],coins:id===A?cash:0,inventory:id===A||id===B?{}:{[item]:100},location:home,status:'正常',activity:'休息'}]));
 doc.state.settlements={loc_hw:{...doc.state.settlements.loc_hw,population:2+ids.length,granary:false,food:0,foodPerDay:0,woodPerDay:0}};
 doc.ledger=openLedger(e,doc);
 return {e,doc,d:e.primitiveDraft(doc)};
}
const honey=f=>householdResources(f.d,f.e,A).market.purchases.filter(p=>p.item===item);

test('the same rule: a scarce single-seller honey is a luxury for a poor household, a locally plentiful cheap honey is an everyday food',()=>{
 const original=fixture({sellers:1,cash:20});
 assert.equal(honey(original).length,0,'original world: the poor household does not buy honey');
 const local=fixture({sellers:3,basePrice:1,cash:20}),buys=honey(local);
 assert.ok(buys.length>0&&buys.every(p=>p.luxury===false&&p.habit>=local.e.world.marketRules.foodHabit.luxuryBelow),'local cheap multi-seller honey is bought as an everyday food');
});

test('a household with cash far above its daily income may buy the luxury; the rule table decides how far',()=>{
 const rich=fixture({sellers:1,cash:10000}),buys=honey(rich);
 assert.ok(buys.length>0&&buys.every(p=>p.luxury===true),'the rich household buys the luxury honey');
 // 门槛来自规则表：把宽裕天数抬到现金之上，同一户就又不买了。
 assert.equal(honey(fixture({sellers:1,cash:10000,rule:{richCashDays:1e9}})).length,0);
});

test('household purchase planning with habit is deterministic',()=>{
 const run=()=>{const f=fixture({sellers:3,basePrice:1,cash:20});return JSON.stringify(householdResources(f.d,f.e,A).market.purchases);};
 assert.equal(run(),run());
});

test('regression guard: poor households spend at most the rule-table share of their purchases on luxury sources (real seed world)',()=>{
 const e=new WorldEngine(world),doc=e.createCharacter(legacy,{},'food-habit-audit'),r=poorLuxuryShare(e,doc);
 assert.ok(r.poor>0&&r.ok,`luxury share ${r.share} of ${r.total} copper must be <= ${r.max}: ${JSON.stringify(r.byItem)}`);
});
