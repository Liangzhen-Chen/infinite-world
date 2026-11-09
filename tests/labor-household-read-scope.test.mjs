import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld,loadRuntimeWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {householdResources,registerHouseholdFoodSources} from '../server-plugin/household-budget.mjs';
import {withReadScope,documentReader} from '../server-plugin/read-scope.mjs';
import {laborCandidates} from '../server-plugin/npc-labor.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';

// 只读作用域：作用域内的家计读取按（状态对象、账本对象、键）共享，结果与作用域外逐次重算逐字相同；作用域外没有 memo。
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
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'labor-household-read-scope');
 doc.state.minute=0;doc.state.location=home;delete doc.state.records['agriculture:loc_hw'];
 doc.state.npcs=Object.fromEntries([A,B,seller].map(id=>[id,{...doc.state.npcs[id],coins:id===A?10000:0,inventory:{},location:home,status:'正常',activity:'休息'}]));
 doc.state.npcs[A].inventory={[item]:2};doc.state.npcs[seller].inventory={[item]:100};
 doc.state.settlements={loc_hw:{...doc.state.settlements.loc_hw,population:3,granary:false,food:0,foodPerDay:0,woodPerDay:0}};
 doc.ledger=openLedger(e,doc);
 return {e,doc};
}
// 在真实的口粮来源解析入口计数：每次调用就是一次未命中的买方家计读取（包一层计数后原样转发）。
function counted(task){
 const original=registerHouseholdFoodSources.fn,calls=[];
 registerHouseholdFoodSources.fn=(d,engine,owner,options)=>{calls.push(owner);return original(d,engine,owner,options);};
 try{return {result:task(),calls};}finally{registerHouseholdFoodSources.fn=original;}
}
const reads=(e,doc)=>{
 const d=documentReader(doc);
 // 三次买方读取与两次卖家读取：作用域内后面的都应命中。
 return [householdResources(d,e,A),householdResources(d,e,A),householdResources(d,e,seller,{marketSubstitution:false}),householdResources(d,e,seller,{marketSubstitution:false}),householdResources(d,e,A,{days:2})];
};
const plain=x=>JSON.parse(JSON.stringify(x));
const mutations={
 none:()=>{},
 inventory:({doc})=>{doc.state.npcs[seller].inventory[item]=10;},
 record:({doc})=>{doc.state.records['world_event:read-scope']={category:'world_event',minute:0,location:home};},
 'time across day':({doc})=>{doc.state.minute=3*1440+600;},
 'seller dies':({doc})=>{doc.state.npcs[seller].status='死亡';},
 'seller moves':({doc})=>{doc.state.npcs[seller].location='bld_hw_post';},
 'price/stock change':({doc})=>{doc.state.settlements.loc_hw.population=30;doc.state.settlements.loc_hw.food=500;}
};
for(const [name,mutate] of Object.entries(mutations))test(`作用域内与逐次不缓存逐字一致，且重复读命中：${name}`,{timeout:600000},()=>{
 const f=fixture();mutate(f);
 const fresh=counted(()=>reads(f.e,f.doc));
 const scoped=counted(()=>withReadScope(()=>reads(f.e,f.doc)));
 assert.deepEqual(plain(scoped.result),plain(fresh.result));
 // 买方 A（默认键与 days:2 两个键）经口粮来源解析，卖家读取不经它；作用域外每次读取都解析，作用域内每个键只一次。
 assert.ok(fresh.calls.length>=3,`作用域外应每次都重算：${fresh.calls.length}`);
 assert.equal(fresh.calls.length,scoped.calls.length+1,'作用域内 A 默认键的重复读应命中');
 assert.equal(scoped.calls.filter(o=>o===A).length,2);
});

test('作用域外读取器没有 memo，作用域结束后丢弃',()=>{
 const f=fixture();
 assert.equal(documentReader(f.doc).memo,undefined);
 const kept=withReadScope(()=>{const d=documentReader(f.doc);assert.equal(typeof d.memo,'function');return d;});
 assert.equal(documentReader(f.doc).memo,undefined);
 const a=householdResources(documentReader(f.doc),f.e,seller,{marketSubstitution:false});
 assert.notEqual(householdResources(documentReader(f.doc),f.e,seller,{marketSubstitution:false}),a);
 assert.ok(kept);
});

test('laborCandidates 在作用域内与独立重算逐字一致',{timeout:600000},async()=>{
 const rw=await loadRuntimeWorld(),smith='npc_hw_duanyan';
 const make=()=>{const e=new WorldEngine(structuredClone(rw));return {e,doc:e.createCharacter(legacy,{},'labor-household-read-scope-smith')};};
 const run=({e,doc})=>laborCandidates(e,subjectiveView(e,doc,smith),doc);
 const a=make(),b=make();
 assert.deepEqual(plain(withReadScope(()=>run(a))),plain(run(b)));
});
