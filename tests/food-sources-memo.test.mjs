import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {householdResources} from '../server-plugin/household-budget.mjs';
import {stateReader} from '../server-plugin/valuation.mjs';
import {withRecordIndex} from '../server-plugin/storage.mjs';

// 口粮替代的卖家可出让量与可达卖家候选按状态版本共享：同状态重复读结果不变且不重复计算，状态一变即失效。
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',seller='npc_hw_linsui',item='item_bread',home='bld_hw_qingdeng';
function fixture(){
 const w=structuredClone(world);
 delete w.rules.householdSubsistence;
 for(const n of w.npcs){delete n.tier;delete n.schedule;}
 w.rules.economy.shops.stores=w.rules.economy.shops.stores.filter(s=>s.keeper!==seller);
 delete w.npcs.find(n=>n.id===seller).shopType;
 w.households=[{id:'meal-house-0',members:[A,B],settlement:'loc_hw',homeLocation:home},{id:'meal-seller',members:[seller],settlement:'loc_hw',homeLocation:home}];
 for(const r of w.primitiveTables.body.rows)if(r.selector==='person')r.drainPerHour.light=r.need==='satiety'?2.5:0;
 w.items.find(i=>i.id===item).nutrition={satiety:30};
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:1}];w.marketRules.customerChoice.noisePermille=0;
 for(const n of w.npcs.filter(n=>[A,seller].includes(n.id))){n.tier='full';n.schedule={default:[{start:0,end:1440,location:home,activity:'休息',services:n.id===seller?['trade']:[]}]};}
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'food-sources-memo');
 doc.state.minute=0;doc.state.location=home;delete doc.state.records['agriculture:loc_hw'];
 doc.state.npcs=Object.fromEntries([A,B,seller].map(id=>[id,{...doc.state.npcs[id],coins:id===A?10000:0,inventory:{},location:home,status:'正常',activity:'休息'}]));
 doc.state.npcs[A].inventory={[item]:2};doc.state.npcs[seller].inventory={[item]:100};
 doc.state.settlements={loc_hw:{...doc.state.settlements.loc_hw,population:3,granary:false,food:0,foodPerDay:0,woodPerDay:0}};
 doc.ledger=openLedger(e,doc);
 return {e,doc,d:e.primitiveDraft(doc)};
}
const physical=(d,e)=>householdResources(d,e,seller,{marketSubstitution:false});
const purchases=(d,e)=>householdResources(d,e,A).market.purchases.filter(p=>p.seller===seller);

test('draft path: same revision shares the seller physical read and buyer result; a write invalidates',()=>{
 const {e,d}=fixture();
 const p1=physical(d,e);
 assert.equal(physical(d,e),p1,'same revision must return the very same object');
 const r1=householdResources(d,e,A);
 assert.equal(householdResources(d,e,A),r1);
 assert.deepEqual(purchases(d,e),purchases(d,e));
 assert.ok(purchases(d,e).length>0);
 const before=purchases(d,e).reduce((n,p)=>n+p.quantity,0);
 // 清空卖家库存：卖家无货可卖，旧缓存若仍被读到就会继续给出购买。
 d.set(['state','npcs',seller,'inventory',item],0);
 // 账本已开：库存以账本持货为准（stock.mjs priceRead 在账本开启时读 ledgerValue，不读旧字段）；旧字段改动后须由状态重开账本，才是同一世界的清空。
 d.set(['ledger'],openLedger(e,d.document));
 const p2=physical(d,e);
 assert.notEqual(p2,p1,'a write must invalidate the shared read');
 const after=purchases(d,e).reduce((n,p)=>n+p.quantity,0);
 assert.ok(before>0&&after===0,`seller stock emptied must leave nothing to buy from this seller (${before} -> ${after})`);
});

test('state-reader path: inside one indexed pass repeated reads share, outside it every read is fresh and equal',()=>{
 const {e,doc}=fixture();
 const r=stateReader(doc.state);
 withRecordIndex(()=>{
  const p1=physical(r,e);
  assert.equal(physical(r,e),p1);
  assert.equal(householdResources(r,e,A),householdResources(r,e,A));
 });
 const a=purchases(stateReader(doc.state),e),b=purchases(stateReader(doc.state),e);
 assert.deepEqual(a,b);
 assert.ok(a.length>0);
 const cached=withRecordIndex(()=>purchases(stateReader(doc.state),e));
 assert.deepEqual(cached,a,'memoised result must equal the uncached result');
});
