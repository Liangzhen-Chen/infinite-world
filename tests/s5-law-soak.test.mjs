import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {distribution,tailBand,resourceAccount,cashAccount,rentObservation,sirObservation,channelObservation,capacityObservation,scenarioWorld,lawObservations,fixture} from '../tools/s5-law-soak.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage,digest} from '../server-plugin/storage.mjs';
import {withLedger} from '../server-plugin/ledger.mjs';
import {facilityView} from '../server-plugin/facility-state.mjs';
import {householdBudget} from '../server-plugin/household-budget.mjs';
import {marketQuote} from '../server-plugin/market.mjs';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {worldEvents} from '../server-plugin/world-events.mjs';
import {leaseCycle,privateTradeProbe} from './fixtures/s5-law/transactions.mjs';

test('K02/K07 independent hand anchors: reserve17/sell3; rent30/12; cash excludes claims',()=>{
 // K02: 20 breads - food10 - seed4 - committed3 =3. K07 gross100
 // and net40 at 3/10 give rent30 and12; ratios use actual output value.
 assert.deepEqual(resourceAccount({stock:20,food:10,seed:4,committed:3}),{stock:20,retained:17,saleable:3,shortfall:0});
 assert.equal(rentObservation({rent:30,output:100}).ratio,.3);
 assert.equal(rentObservation({rent:12,output:40}).ratio,.3);
 assert.equal(rentObservation({rent:12,output:0}).ratio,null);
 assert.deepEqual(cashAccount({cash:5,receivables:[{amount:30,paid:2}],payables:[{amount:12,paid:3}]}),{cash:5,receivable:28,payable:9});
});
test('K10/K11/MKT01/K12 separate custody, SIR, eligible private trades and capacity denominators',async()=>{
 // 20S+8I+2R =30; infection8/30. Two valid private trades, one depth
 // refusal; a third without consent must not enter the eligible denominator.
 assert.deepEqual(sirObservation({count:30,health:{S:20,I:8,R:2}}),{S:20,I:8,R:2,count:30,prevalence:8/30,conserved:true});
 assert.equal(sirObservation({count:30,health:{S:21,I:8,R:2}}).conserved,false);
 assert.deepEqual(channelObservation([{consent:true,deliverable:true,payment:true,rejected:false,reasons:[]},{consent:true,deliverable:true,payment:true,rejected:true,reasons:['depth']},{consent:false,deliverable:true,payment:true,rejected:true,reasons:['consent']}]),{attempts:3,eligible:2,depthOnlyRejected:1});
 // Two bookings of load3 share one capacity10: load6/10, but exclusive
 // asset has been double booked even though weight is below the limit.
 assert.deepEqual(capacityObservation([{asset:'cart',capacity:10,load:3},{asset:'cart',capacity:10,load:3}]),[{asset:'cart',capacity:10,load:6,bookings:2,ratio:.6,overbooked:true}]);
 const w=await loadWorld(),e=new WorldEngine(w),legacy=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
 const d=withLedger(e,e.createCharacter(legacy,{},'K13-custody')).document;
 const owner=w.households[0].members[0],h=w.households.find(h=>h.members.includes(owner));
 // Ledger observation: escrow30 is custody, not spendable purse5. These
 // invented balances test only the pure reader, never enter simulation.
 d.ledger.accounts={ [owner+'|coin_river|purse']:5,[owner+'|coin_river|escrow']:30};d.ledger.flows={'src:genesis|coin_river|opening':35};
 assert.equal(lawObservations(e,d).households.find(r=>r.id===h.id).cash,5);
});
test('distributions retain missing groups and P tails do not become hard targets',()=>{
 // [0,10,20] linear percentiles2/18, median10; missing fourth stays in n.
 assert.deepEqual(distribution([0,10,20,null]),{n:4,measured:3,missing:1,median:10,p10:2,p90:18});
 assert.equal(tailBand(1,20).proportion,.05);assert.equal(tailBand(2,20).proportion,.1);assert.equal(tailBand(0,0).proportion,null);
 assert.equal(new Set(fixture.seeds).size,10);
});
test('K07 actual harvest receipts feed independent ratio: normal100/30, poor40/12; fixed rent stays30',async()=>{
 // Original K07 hand anchors, through formal signing/sowing/harvesting.
 // Disaster reduces output, never rewrites fixed rent or the signed share.
 for(const poor of [false,true]){
  const f=await leaseCycle({poor});assert.equal(f.complete,true,JSON.stringify(f.trades));assert.equal(f.output,poor?40:100);assert.equal(f.rent,poor?12:30);
  const r=lawObservations(f.engine,f.document).rents.find(r=>r.tenant==='player');
  assert.equal(r.output,f.output);assert.equal(r.assessed,f.rent);assert.equal(r.ratio,.3);
 }
 const fixed=await leaseCycle({poor:true,mode:'fixed'});assert.equal(fixed.output,40);assert.equal(fixed.rent,30);
 assert.equal(rentObservation({rent:fixed.rent,output:fixed.output}).ratio,.75);
 assert.equal(fixed.claims.reduce((n,r)=>n+r.amount,0),30);
});
test('MKT01 actual private delivery: ten physical units for agreed12, no channel-depth refusal',async()=>{
 // Signed existing-world transfer of10 wood for12; private agreement does
 // not grant missing stock, extra money or bypass the original quote receipt.
 const row=await privateTradeProbe();assert.equal(row.rejected,false,JSON.stringify(row.reasons));assert.equal(row.result.cost,12);
 assert.deepEqual(channelObservation([row]),{attempts:1,eligible:1,depthOnlyRejected:0});
 assert.equal(row.document.state.records['market-trade:K13-private-sale'].quantity,10);
});
test('paired shock changes only weather crop input, never starting balances or weather draws',async()=>{
 const w=await loadWorld(),before=digest(w),shock=scenarioWorld(w,'poor-harvest');
 for(const [key,row]of Object.entries(w.rules.weather.states)){
  assert.equal(shock.rules.weather.states[key].crop,row.crop/2);
  shock.rules.weather.states[key].crop=row.crop;
 }
 assert.equal(digest(shock),before);assert.equal(digest(w),before);
});
test('formal world_time control: two daily steps, combined advance, save/reload and inserted read queries',async()=>{
 // Two days cross the same two daily settlements. Exact ledger, obligations,
 // and ecological conservation are compared; no tolerance can hide coin drift.
 const w=await loadWorld(),e=new WorldEngine(w),legacy=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
 const initial=withLedger(e,e.createCharacter(legacy,{},'K13-control')).document;
 const advance=async(d,minutes,id)=>applyPatches(d,(await e.reduce(d,{tool:'world_time',args:{minutes},eventId:id})).patches);
 const daily=await advance(await advance(initial,1440,'control:1'),1440,'control:2');
 const whole=await advance(initial,2880,'control:whole');
 assert.deepEqual(daily.ledger,whole.ledger,'exact books daily versus whole');
 assert.deepEqual(daily.state.settlements,whole.state.settlements,'same population, meals and resources');
 assert.deepEqual(daily.state.obligations,whole.state.obligations,'exact obligations daily versus whole');
 assert.deepEqual(worldEvents(daily.state),worldEvents(whole.state),'exact event facts and sequence daily versus whole');
 const half=await advance(initial,1440,'control:1'),before=digest(half),read=e.primitiveDraft(half);
 marketQuote(read,e,{item:'item_bread',location:'loc_hw',quantity:1});
 facilityView(e,half.state,'bld_hw_qingdeng');householdBudget(read,e,'npc_hw_linsui',{kernel:true});
 assert.equal(digest(half),before,'queries cannot mutate saved input');
 const dir=await fs.mkdtemp(path.join(tmpRoot(),'k13-control-'));
 try{
  const store=new CampaignStorage(dir,{reducer:e.reduce.bind(e)});
  await store.create({id:'control',worldVersion:'K13',document:half});
  const restored=(await new CampaignStorage(dir,{reducer:e.reduce.bind(e)}).read('control')).document;
  assert.deepEqual(restored,half);
  const after=await advance(restored,1440,'control:2');assert.deepEqual(after,daily,'save/read and queries preserve complete document');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
