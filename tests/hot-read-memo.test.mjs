import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {marketSupply} from '../server-plugin/market.mjs';
import {PatchCursor,withRecordIndex} from '../server-plugin/storage.mjs';
import {stateReader} from '../server-plugin/valuation.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const owner='npc_hw_linsui',other='npc_hw_duanyan',supplier='npc_hw_shendu',item='item_bread',DAY=1440;
function fixture({members=[owner],shared=true}={}){
 const w=structuredClone(world);
 w.households=w.households.map(h=>({...h,members:h.members.filter(id=>!members.includes(id))})).filter(h=>h.members.length);
 for(const [i,group]of (shared?[members]:members.map(id=>[id])).entries())w.households.push({id:`house_budget_fixture_${i}`,members:group,settlement:'loc_hw',homeLocation:'bld_hw_qingdeng',tenure:'沿用已发布住处，独立登记家计'});
 // Hand anchor: each resident needs 10 satiety per day; one bread = one.
 for(const r of w.primitiveTables.body.rows)if(r.need==='satiety'&&r.selector==='person')r.drainPerHour.light=10/24;
 w.items.find(i=>i.id===item).nutrition={satiety:1};
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

const place='loc_hw';
let f0;
const plainReader=document=>({document,get:(...p)=>p.reduce((v,k)=>v?.[k],document)});

test('marketSupply: one version and one input give one shared result; inputs and writes give fresh ones',()=>{
 f0=fixture();delete f0.state.records['agriculture:loc_hw'];f0.state.settlements[place].food=6;
 const {engine}=f0,state=f0.state;
 // Reference: outside an indexed advance a state reader never caches.
 const reference=marketSupply(stateReader(state),engine,item,place);
 withRecordIndex(()=>{
  const first=marketSupply(stateReader(state),engine,item,place),second=marketSupply(stateReader(state),engine,item,place);
  assert.deepEqual(first,reference);
  assert.equal(second,first,'same state and inputs reuse the first result');
  assert.notEqual(marketSupply(stateReader(state),engine,item,place,{businessOwners:[owner]}),first,'business owners are part of the key');
  assert.notEqual(marketSupply(stateReader(state),engine,item,'bld_hw_qingdeng'),first,'location is part of the key');
  // A changed state is a new state object: its result must follow the change.
  const next={...state,npcs:{...state.npcs,[owner]:{...state.npcs[owner],inventory:{[item]:3}}},settlements:{...state.settlements,[place]:{...state.settlements[place],food:40}}};
  const changed=marketSupply(stateReader(next),engine,item,place);
  assert.notDeepEqual(changed,first);
  assert.deepEqual(changed,marketSupply(stateReader(next),engine,item,place));
 });
 assert.deepEqual(marketSupply(stateReader(state),engine,item,place),reference);
});

test('marketSupply on a cursor: reused until the draft revision changes, always equal to a fresh read',()=>{
 f0=fixture();delete f0.state.records['agriculture:loc_hw'];f0.state.settlements[place].food=6;f0.sync();
 const {engine}=f0,cursor=new PatchCursor(f0.d.document);
 const d={cursor,get document(){return cursor.expose(cursor.root);},get:(...p)=>cursor.expose(p.reduce((v,k)=>v?.[k],cursor.root)),peek:(...p)=>p.reduce((v,k)=>v?.[k],cursor.root)};
 const fresh=()=>marketSupply(plainReader(cursor.root),engine,item,place);
 withRecordIndex(()=>{
  const first=marketSupply(d,engine,item,place);
  assert.equal(marketSupply(d,engine,item,place),first);
  assert.deepEqual(first,fresh());
  cursor.apply({op:'set',path:['state','npcs',owner,'inventory',item],value:3});
  const after=marketSupply(d,engine,item,place);
  assert.notEqual(after,first);assert.notDeepEqual(after,first);
  assert.deepEqual(after,fresh());
  cursor.apply({op:'set',path:['state','settlements',place,'food'],value:40});
  assert.deepEqual(marketSupply(d,engine,item,place),fresh());
 });
});
