import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {householdResources} from '../server-plugin/household-budget.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const seller='npc_hw_linsui',buyers=['npc_hw_chenbai','npc_hw_xuling','npc_hw_wushuo'],item='item_bread';
// One seller's saleable stock is a single quantity. Every buyer household reads it as its own substitute food source,
// so the quantities the buyers are credited with must add up to no more than the seller can really sell.
function fixture(){
 const w=structuredClone(world),members=[seller,...buyers];
 w.households=w.households.map(h=>({...h,members:h.members.filter(id=>!members.includes(id))})).filter(h=>h.members.length);
 members.forEach((id,i)=>w.households.push({id:`house_share_fixture_${i}`,members:[id],settlement:'loc_hw',homeLocation:'bld_hw_qingdeng',tenure:'沿用已发布住处，独立登记家计'}));
 for(const r of w.primitiveTables.body.rows)if(r.need==='satiety'&&r.selector==='person')r.drainPerHour.light=10/24;
 w.items.find(i=>i.id===item).nutrition={satiety:1};
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:1}];
 const engine=new WorldEngine(w);let document=engine.initialFromLegacy(legacy,'seller-share');
 document.state.minute=300;
 for(const id of members){document.state.npcs[id].inventory={};document.state.npcs[id].coins=0;document.state.npcs[id].location=document.state.npcs[seller].location;}
 document.state.npcs[seller].inventory={[item]:20};
 for(const id of buyers)document.state.npcs[id].coins=100;
 document.ledger=openLedger(engine,document);
 return {engine,d:{get document(){return document;},get:(...p)=>p.reduce((v,k)=>v?.[k],document)}};
}
const bought=(f,id)=>householdResources(f.d,f.engine,id).market.purchases.filter(p=>p.seller===seller&&p.item===item).reduce((n,p)=>n+p.quantity,0);

test('several buyers sharing one seller are credited no more than the seller can sell, in near-equal parts',()=>{
 const f=fixture();
 const available=Math.floor(householdResources(f.d,f.engine,seller,{marketSubstitution:false}).rows.find(r=>r.holder===seller&&r.item===item).available);
 const got=buyers.map(id=>bought(f,id));
 // Every buyer is hungry enough to take the whole stock alone, so a share rule must bind.
 assert.ok(available>0&&got.some(n=>n>0));
 assert.ok(got.reduce((n,x)=>n+x,0)<=available,`credited ${got} against ${available}`);
 // Equal need gives equal weight: largest-remainder parts differ by at most one piece.
 assert.ok(Math.max(...got)-Math.min(...got)<=1,`uneven parts ${got}`);
 // Deterministic: a second read of the same state returns the same parts.
 assert.deepEqual(buyers.map(id=>bought(f,id)),got);
});
