import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {householdResources} from '../server-plugin/household-budget.mjs';
import {shareByNeed} from '../server-plugin/shop.mjs';
import {PatchCursor} from '../server-plugin/storage.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const item='item_bread',shopSeller='npc_hw_linsui',traderSeller='npc_hw_meiling';
const buyers=['npc_hw_chenbai','npc_hw_xuling','npc_hw_wushuo'];
// One seller's saleable stock is a single quantity. Every buyer household reads it as its own substitute food source,
// so the quantities the buyers are credited with must add up to no more than the seller can really sell.
// groups: households (arrays of ids); the seller's own household is whichever group holds the seller.
function fixture({seller,groups}){
 const w=structuredClone(world),members=groups.flat();
 w.households=w.households.map(h=>({...h,members:h.members.filter(id=>!members.includes(id))})).filter(h=>h.members.length);
 groups.forEach((g,i)=>w.households.push({id:`house_share_fixture_${i}`,members:g,settlement:'loc_hw',homeLocation:'bld_hw_qingdeng',tenure:'沿用已发布住处，独立登记家计'}));
 for(const r of w.primitiveTables.body.rows)if(r.need==='satiety'&&r.selector==='person')r.drainPerHour.light=10/24;
 w.items.find(i=>i.id===item).nutrition={satiety:1};
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:1}];
 const engine=new WorldEngine(w);let document=engine.initialFromLegacy(legacy,'seller-share');
 document.state.minute=300;
 for(const id of members){document.state.npcs[id].inventory={};document.state.npcs[id].coins=0;document.state.npcs[id].location=document.state.npcs[seller].location;}
 document.state.npcs[seller].inventory={[item]:20};
 for(const id of buyers)if(members.includes(id))document.state.npcs[id].coins=100;
 document.ledger=openLedger(engine,document);
 return {engine,seller,get document(){return document;},d:{get document(){return document;},get:(...p)=>p.reduce((v,k)=>v?.[k],document)}};
}
const credited=(f,id,d=f.d)=>householdResources(d,f.engine,id).market.purchases.filter(p=>p.seller===f.seller&&p.item===item).reduce((n,p)=>n+p.quantity,0);
const sellable=f=>Math.floor(householdResources(f.d,f.engine,f.seller,{marketSubstitution:false}).rows.find(r=>r.holder===f.seller&&r.item===item).available);
const sum=a=>a.reduce((n,x)=>n+x,0);

test('shareByNeed: unequal needs split in proportion, remainders go to the largest fractions, ties by code point',()=>{
 const rows=[{id:'a',need:3},{id:'b',need:1},{id:'c',need:1}],total=7,need=sum(rows.map(r=>r.need));
 const got=shareByNeed(total,rows);
 assert.equal(sum([...got.values()]),total);
 for(const r of rows){const exact=total*r.need/need;assert.ok([Math.floor(exact),Math.ceil(exact)].includes(got.get(r.id)),`${r.id}:${got.get(r.id)} vs ${exact}`);}
 // A unit beyond the floor goes to a larger fractional part, never to a smaller one.
 for(const x of rows)for(const y of rows){
  const ex=total*x.need/need,ey=total*y.need/need,fx=ex-Math.floor(ex),fy=ey-Math.floor(ey);
  if(got.get(x.id)>Math.floor(ex)&&got.get(y.id)===Math.floor(ey)&&Math.floor(ey)<ey)assert.ok(fx>=fy,`${x.id} took a unit ahead of ${y.id}`);
 }
 // Equal fractions tie by code point: 'B' (66) precedes 'a' (97) although a locale collation would put 'a' first.
 const tie=shareByNeed(1,[{id:'a',need:1},{id:'B',need:1}]);
 assert.equal(tie.get('B'),1);assert.equal(tie.get('a'),0);
 assert.equal(shareByNeed(5,[]).size,0);assert.equal(shareByNeed(0,rows).size,0);
});

test('shop branch: buyers sharing a shop keeper are credited no more than the keeper can sell, in near-equal parts',()=>{
 const f=fixture({seller:shopSeller,groups:[[shopSeller],...buyers.map(b=>[b])]});
 const available=sellable(f),got=buyers.map(id=>credited(f,id));
 assert.ok(available>0&&got.some(n=>n>0));
 assert.ok(sum(got)<=available,`credited ${got} against ${available}`);
 assert.ok(Math.max(...got)-Math.min(...got)<=1,`uneven parts ${got}`);
 assert.deepEqual(buyers.map(id=>credited(f,id)),got,'a second read of the same state returns the same parts');
});

test('non-shop trader branch: same bound for a trader who is not a registered shop keeper',()=>{
 const f=fixture({seller:traderSeller,groups:[[traderSeller],...buyers.map(b=>[b])]});
 const available=sellable(f),got=buyers.map(id=>credited(f,id));
 assert.ok(available>0&&got.some(n=>n>0));
 assert.ok(sum(got)<=available,`credited ${got} against ${available}`);
 assert.ok(Math.max(...got)-Math.min(...got)<=1,`uneven parts ${got}`);
});

test('unequal needs: a two-person household is credited in proportion to a one-person household',()=>{
 const f=fixture({seller:shopSeller,groups:[[shopSeller],['npc_hw_chenbai','npc_hw_fangqin'],['npc_hw_xuling']]});
 f.document.state.npcs.npc_hw_fangqin.inventory={};f.document.state.npcs.npc_hw_fangqin.location=f.document.state.npcs[shopSeller].location;
 const need=id=>{const r=householdResources(f.d,f.engine,id,{marketSubstitution:false});return r.shortfall.satiety+r.rows.reduce((n,x)=>n+x.food*(f.engine.byId.get(x.item)?.nutrition?.satiety??0),0);};
 const nb=need('npc_hw_chenbai'),nx=need('npc_hw_xuling'),gb=credited(f,'npc_hw_chenbai'),gx=credited(f,'npc_hw_xuling');
 assert.ok(gb+gx>0,'at least one buyer must really be credited from the seller');
 assert.ok(nb>nx,'the larger household has the larger need');
 // Each part is the floor or ceiling of total*need/sum, so credited/need ratios agree within one unit per household.
 assert.ok(Math.abs(gb-gx*nb/nx)<=1+nb/nx,`credited ${gb} vs ${gx} for needs ${nb}:${nx}`);
 assert.ok(gb>=gx);
});

test('the seller household is not a competing buyer and buys nothing from its own member',()=>{
 const f=fixture({seller:shopSeller,groups:[[shopSeller,'npc_hw_chenbai'],['npc_hw_xuling'],['npc_hw_wushuo']]});
 f.document.state.npcs.npc_hw_chenbai.coins=100;
 const available=sellable(f),others=['npc_hw_xuling','npc_hw_wushuo'].map(id=>credited(f,id));
 assert.equal(credited(f,'npc_hw_chenbai'),0);
 assert.ok(others.some(n=>n>0),'other buyers must really be credited, else the case passes empty');
 assert.ok(sum(others)<=available);assert.ok(Math.max(...others)-Math.min(...others)<=1);
});

test('shared-source read is reused within one revision and dropped by a state write',()=>{
 const f=fixture({seller:shopSeller,groups:[[shopSeller],...buyers.map(b=>[b])]});
 const cursor=new PatchCursor(f.document),d={cursor,get document(){return cursor.root;},get:(...p)=>cursor.expose(p.reduce((v,k)=>v?.[k],cursor.root))};
 const plain=()=>({get document(){return cursor.root;},get:(...p)=>p.reduce((v,k)=>v?.[k],cursor.root)});
 const read=()=>buyers.map(id=>credited(f,id,d)),fresh=()=>buyers.map(id=>credited(f,id,plain()));
 const first=read();
 assert.ok(first.some(n=>n>0),'at least one buyer must really be credited before the cache is tested');
 assert.deepEqual(read(),first,'cache hit returns the same parts');
 assert.deepEqual(first,fresh(),'cached parts equal an uncached read of the same revision');
 cursor.apply({op:'set',path:['state','npcs',buyers[0],'coins'],value:0});
 const after=read();
 assert.equal(after[0],0,'a buyer without money is no longer a source claimant');
 assert.deepEqual(after,fresh(),'after a write the cache is rebuilt and equals an uncached read');
 assert.ok(sum(after)<=sellable({...f,d:plain()}));
});
