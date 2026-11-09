import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld,loadRuntimeWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {householdResources} from '../server-plugin/household-budget.mjs';
import {shareByNeed} from '../server-plugin/shop.mjs';
import {PatchCursor} from '../server-plugin/storage.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const item='item_bread',shopSeller='npc_hw_linsui',traderSeller='npc_hw_meiling';
// 面包的饱腹由材料数据推导，读引擎派生值；夹具把每人每天的饱食消耗设为 10 个面包的量（原先手写每个 1、每天 10）。
const SAT=(await loadRuntimeWorld()).items.find(i=>i.id===item).nutrition.satiety;
const buyers=['npc_hw_chenbai','npc_hw_xuling','npc_hw_wushuo'];
// One seller's saleable stock is a single quantity. Every buyer household reads it as its own substitute food source,
// so the quantities the buyers are credited with must add up to no more than the seller can really sell.
// groups: households (arrays of ids); the seller's own household is whichever group holds the seller.
// coins: cash overrides and stock: the seller's stock, both applied before the ledger is opened (the ledger snapshots cash;
// writing state.npcs[id].coins afterwards does not change anyone's purse).
function fixture({seller,groups,coins={},stock=20}){
 const w=structuredClone(world),members=groups.flat();
 w.households=w.households.map(h=>({...h,members:h.members.filter(id=>!members.includes(id))})).filter(h=>h.members.length);
 groups.forEach((g,i)=>w.households.push({id:`house_share_fixture_${i}`,members:g,settlement:'loc_hw',homeLocation:'bld_hw_qingdeng',tenure:'沿用已发布住处，独立登记家计'}));
 for(const r of w.primitiveTables.body.rows)if(r.need==='satiety'&&r.selector==='person')r.drainPerHour.light=10*SAT/24;
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:1}];
 const engine=new WorldEngine(w);let document=engine.initialFromLegacy(legacy,'seller-share');
 document.state.minute=300;
 for(const id of members){document.state.npcs[id].inventory={};document.state.npcs[id].coins=0;document.state.npcs[id].location=document.state.npcs[seller].location;}
 document.state.npcs[seller].inventory={[item]:stock};
 // The settlement's other households would be potential buyers of the same stock; leave them penniless so only the fixture's households claim it.
 // They likewise hold no food of their own to sell, so the seller under test is the only source in the settlement.
 for(const [id,n] of Object.entries(document.state.npcs))if(!members.includes(id)){n.coins=0;n.inventory={};}
 if(document.state.player)document.state.player.coins=0;
 for(const id of buyers)if(members.includes(id))document.state.npcs[id].coins=100;
 for(const [id,c] of Object.entries(coins))document.state.npcs[id].coins=c;
 document.ledger=openLedger(engine,document);
 return {engine,seller,get document(){return document;},d:{get document(){return document;},get:(...p)=>p.reduce((v,k)=>v?.[k],document)}};
}
const credited=(f,id,d=f.d)=>householdResources(d,f.engine,id).market.purchases.filter(p=>p.seller===f.seller&&p.item===item).reduce((n,p)=>n+p.quantity,0);
const sellable=f=>Math.floor(householdResources(f.d,f.engine,f.seller,{marketSubstitution:false}).rows.find(r=>r.holder===f.seller&&r.item===item).available);
const sum=a=>a.reduce((n,x)=>n+x,0);

// A seed-derived uniform in [0,1) for the unit test; any fixed deterministic generator serves, the function only takes u.
const uniform=seed=>{let x=(seed*2654435761+12345)>>>0;x^=x<<13;x>>>=0;x^=x>>>17;x^=x<<5;x>>>=0;x=Math.imul(x^(x>>>15),2246822519)>>>0;x^=x>>>13;return (x>>>0)/4294967296;};
test('shareByNeed: each household gets floor or floor+1, the total is conserved, and the expected share is total*need/sum',()=>{
 const cases=[
  {total:7,rows:[{id:'a',need:3},{id:'b',need:1},{id:'c',need:1}]},
  {total:10,rows:[{id:'big',need:300},...Array.from({length:17},(_,i)=>({id:`h${i}`,need:i===0?10:1+i%5*3}))]},// scarce: 18 households, 10 loaves
  {total:1,rows:[{id:'a',need:1},{id:'B',need:1}]},
 ],SEEDS=2000;
 for(const {total,rows} of cases){
  const need=sum(rows.map(r=>r.need)),acc=new Map(rows.map(r=>[r.id,0]));
  for(let seed=0;seed<SEEDS;seed++){
   const u=uniform(seed),got=shareByNeed(total,rows,u);
   assert.equal(sum([...got.values()]),total,`seed ${seed}: total conserved`);
   for(const r of rows){const exact=total*r.need/need,v=got.get(r.id);
    assert.ok(v===Math.floor(exact)||v===Math.floor(exact)+1,`seed ${seed} ${r.id}: ${v} vs ${exact}`);
    acc.set(r.id,acc.get(r.id)+v);}
   assert.deepEqual([...shareByNeed(total,rows,u)],[...got],`seed ${seed}: same u, same shares`);
  }
  // The extra unit of a household is a Bernoulli(f) trial with f=frac(total*need/sum), so over SEEDS draws the mean share
  // differs from total*need/sum by at most 5*sqrt(f(1-f)/SEEDS) (plus a float epsilon); a fixed bug of one unit would be far outside.
  for(const r of rows){const exact=total*r.need/need,f=exact-Math.floor(exact),tol=5*Math.sqrt(f*(1-f)/SEEDS)+1e-9;
   assert.ok(Math.abs(acc.get(r.id)/SEEDS-exact)<=tol,`${r.id}: mean ${acc.get(r.id)/SEEDS} vs ${exact} (tol ${tol})`);}
 }
 // Scarcity: a household whose floor is 0 is no longer shut out on every seed.
 const scarce=cases[1],small=scarce.rows[1];let wins=0;
 for(let seed=0;seed<SEEDS;seed++)if(shareByNeed(scarce.total,scarce.rows,uniform(seed)).get(small.id)>0)wins++;
 assert.ok(wins>0&&wins<SEEDS,`small household drew ${wins}/${SEEDS}`);
 // Both order-independent of the row array: the cumulative layout follows code-point order of ids, not input order.
 const rows=cases[0].rows,reversed=[...rows].reverse();
 for(let seed=0;seed<50;seed++)assert.deepEqual([...shareByNeed(7,rows,uniform(seed))].sort(),[...shareByNeed(7,reversed,uniform(seed))].sort());
 assert.equal(shareByNeed(5,[],0.3).size,0);assert.equal(shareByNeed(0,cases[0].rows,0.3).size,0);
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
 const f=fixture({seller:shopSeller,groups:[[shopSeller],['npc_hw_chenbai','npc_hw_taozhi'],['npc_hw_xuling']]});
 f.document.state.npcs.npc_hw_taozhi.inventory={};f.document.state.npcs.npc_hw_taozhi.location=f.document.state.npcs[shopSeller].location;
 const need=id=>{const r=householdResources(f.d,f.engine,id,{marketSubstitution:false});return r.shortfall.satiety+r.rows.reduce((n,x)=>n+x.food*(f.engine.byId.get(x.item)?.nutrition?.satiety??0),0);};
 const nb=need('npc_hw_chenbai'),nx=need('npc_hw_xuling'),gb=credited(f,'npc_hw_chenbai'),gx=credited(f,'npc_hw_xuling');
 assert.ok(gb+gx>0,'at least one buyer must really be credited from the seller');
 assert.ok(nb>nx,'the larger household has the larger need');
 // Each part is the floor or ceiling of total*need/sum, so credited/need ratios agree within one unit per household.
 assert.ok(Math.abs(gb-gx*nb/nx)<=1+nb/nx,`credited ${gb} vs ${gx} for needs ${nb}:${nx}`);
 assert.ok(gb+1>=gx,`larger household ${gb} vs ${gx}`);
});

test('the seller household is not a competing buyer and buys nothing from its own member',()=>{
 // The seller's own household (seller and chenbai, who has cash) first keeps its own meals from the stock; give the seller
 // enough that some is left to sell, so the other households really compete for it.
 const f=fixture({seller:shopSeller,groups:[[shopSeller,'npc_hw_chenbai'],['npc_hw_xuling'],['npc_hw_wushuo']],stock:200});
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
 // Cash lives in the ledger, so the state write that removes a claimant is one the buyer filter reads directly: unconsciousness.
 cursor.apply({op:'set',path:['state','npcs',buyers[0],'status'],value:'昏迷'});
 const after=read();
 assert.equal(after[0],0,'an unconscious buyer is no longer a source claimant');
 assert.deepEqual(after,fresh(),'after a write the cache is rebuilt and equals an uncached read');
 assert.ok(sum(after)<=sellable({...f,d:plain()}));
});

test('a multi-person household takes one share, not one per member with cash',()=>{
 // Both members of the two-person household hold cash. Before the fix each moneyed member took its own slot weighted by the
 // whole household need, so the household's buyer was diluted by its own relative. Now the household has one slot: the
 // buyer's part is the same whether or not the second member has cash, and the second member reads none of it.
 const groups=[[shopSeller],['npc_hw_chenbai','npc_hw_taozhi'],['npc_hw_xuling'],['npc_hw_wushuo']];
 const make=(taozhiCoins,extra={})=>fixture({seller:shopSeller,groups,coins:{npc_hw_taozhi:taozhiCoins,...extra}});
 const both=make(100),one=make(0);
 const parts=f=>buyers.map(id=>credited(f,id));
 assert.ok(parts(both).some(n=>n>0)&&credited(both,'npc_hw_chenbai')>0,'the household buyer is really credited');
 assert.deepEqual(parts(both),parts(one),'a second moneyed member does not change any household part');
 assert.equal(credited(both,'npc_hw_taozhi'),0,'only the household buyer (first member with cash) reads the share');
 assert.ok(sum(parts(both))<=sellable(both));
 // The stock must really bind, or both readings would equal the household's own demand and prove nothing:
 // the buyer gets strictly more when the other households hold no cash (it is then the only buyer).
 const solo=make(0,{npc_hw_xuling:0,npc_hw_wushuo:0});
 assert.ok(credited(solo,'npc_hw_chenbai')>credited(one,'npc_hw_chenbai'),`alone ${credited(solo,'npc_hw_chenbai')} vs shared ${credited(one,'npc_hw_chenbai')}`);
});

test('cash is a personal purse: a household whose first member is penniless still buys through its member with cash, once',()=>{
 // chenbai sorts first but has no cash; taozhi has
 const f=fixture({seller:shopSeller,groups:[[shopSeller],['npc_hw_chenbai','npc_hw_taozhi'],['npc_hw_xuling']],coins:{npc_hw_chenbai:0,npc_hw_taozhi:100}});
 const fq=credited(f,'npc_hw_taozhi'),cb=credited(f,'npc_hw_chenbai'),xl=credited(f,'npc_hw_xuling');
 assert.ok(fq>0,'the member with cash buys for the household');
 assert.equal(cb,0,'the penniless member reads no share');
 assert.ok(fq+xl<=sellable(f),`credited ${fq}+${xl} against ${sellable(f)}`);
});
