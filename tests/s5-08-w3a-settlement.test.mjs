import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {withLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {createTransportAsset,destroyTransportAsset,transportIncident} from '../server-plugin/transport.mjs';
import {dueObligation} from '../server-plugin/obligation-runtime.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,DEPART=7*DAY+540,lane=world.rules.settlementTrade.lanes[0],key=`settlement-trade:${lane.id}:7`;
const carrier='npc_hw_zhengshuisheng';
const counter=id=>world.rules.agriculture.settlements.find(p=>p.settlement===id).counter;

// D05 §5.1: one bull (carry 30 kg) pulling a pack: 80 kg pack capacity scaled to 30 kg, surcharge 80/30.
function scene({withCarrier=true}={}){
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}
 const engine=new WorldEngine(w),initial=engine.createCharacter(legacy,{},'trade-test'),origin=counter(lane.seller);
 Object.assign(initial.state.npcs[carrier],{location:origin,activity:'营业',status:'正常',coins:1000});
 initial.state.creatures??={};initial.state.creatures.transport_bull={species:'monster_slate_horn_bull',owner:carrier,location:origin,hp:40,maxHp:40,status:'正常'};
 let document=withLedger(engine,initial).document;
 const draft=()=>engine.primitiveDraft(document);
 const f={engine,get document(){return document;},replace(doc){document=doc;},
  mutate(fn){const d=draft(),result=fn(d);document=applyPatches(document,d.patches);return result;},
  async wait(end,eventId='wait'){const out=await engine.reduce(document,{tool:'world_time',args:{minutes:end-document.state.minute},eventId});document=applyPatches(document,out.patches);return out;}};
 if(withCarrier)f.asset=f.mutate(d=>createTransportAsset(d,engine,{owner:carrier,kind:'pack',animal:'transport_bull'},'grain-pack')).id;
 return f;
}
// Hand anchor: sum over the shipment's published edges of km * 20 kg * .02 * (80/30) * (1+edge risk).
const freightBy=(engine,edges)=>Math.ceil(edges.reduce((n,id)=>{const r=engine.world.routes.find(x=>x.id===id);return n+r.lengthKm*20*0.02*(80/30)*(1+(r.risk??0));},0));
const fiscal=(doc,id)=>doc.state.records[`village-fiscal:${id}`];

test('hired carriage: freight reaches the carrier and the village ledger, and no village worker walks out or back',async()=>{
 const f=scene();await f.wait(DEPART);
 const o=f.document.state.records[key],trip=f.document.state.records[o.carriage];
 // 40 oats * 0.5 kg = 20 kg; edge length L km; pack rate .02; bull 30 kg of 80 => surcharge 80/30; ceil(L*20*.02*80/30*(1+risk)).
 assert.equal(o.quantity,40);assert.equal(o.unitPriceCopper,3);
 // Yupo road 10 km (risk 1) -> 21.33, Weiting road 11.40 km (risk 1) -> 24.32, two hall approaches 0.24 each: 46.14 -> 47.
 assert.equal(trip.freight,freightBy(f.engine,trip.transport.edges));assert.equal(trip.freight,47);
 assert.equal(trip.tariff+trip.toll,0);
 // The carrier keeps freight minus 5% home commercial tax floor(freight*.05); coin was 1000 before.
 assert.equal(f.document.state.npcs[carrier].coins,1000+trip.freight-Math.floor(trip.freight*0.05));
 // The seller village's ledger shows the freight as a dated expense against this order.
 const expense=fiscal(f.document,lane.seller).entries.find(e=>e.phase==='freight'&&e.contract===o.id);
 assert.deepEqual([expense.copper,expense.freightCopper,expense.other],[-trip.freight,trip.freight,carrier]);assert.equal(o.carriageCostCopper,trip.freight);
 assert.deepEqual(auditLedger(f.document.ledger),[]);
 await f.wait(trip.estimatedArrivalAt+DAY);
 const done=f.document.state.records[key];
 assert.equal(done.status,'delivered');assert.equal(done.transport.phase,'home');
 // Nobody walked back: home at the moment of arrival and no return leg was ever scheduled.
 assert.equal(done.homeAt,done.arrivedAt);assert.ok(!done.entries.some(e=>['return','waypoint'].includes(e.phase)));
});

test('control: without a hired carrier the village workers walk out and back, so home is later than arrival',async()=>{
 const f=scene({withCarrier:false});await f.wait(DEPART);
 const o0=f.document.state.records[key];assert.equal(o0.carriage,undefined);
 await f.wait(DEPART+12*DAY);
 const o=f.document.state.records[key];
 assert.equal(o.status,'delivered');assert.ok(o.entries.some(e=>e.phase==='return'));assert.ok(o.homeAt>o.arrivedAt);
});

test('wrecked carriage: grain is lost once, escrow returns to the buyer, carrier owes goods and freight, workers are free, both villages are told',async()=>{
 const f=scene();await f.wait(DEPART);
 const o=f.document.state.records[key],trip=f.document.state.records[o.carriage];
 const buyerBefore=f.document.state.settlements[lane.buyer].treasury;
 assert.equal(o.escrowCopper,120); // 40 grain * 3 copper, held in the buyer's counter escrow
 f.mutate(d=>destroyTransportAsset(d,f.engine,{asset:f.asset},'wagon-fire'));
 await f.wait(f.document.state.minute+DAY);
 const lost=f.document.state.records[key];
 assert.equal(lost.status,'lost');assert.equal(lost.lostFood,40);assert.deepEqual(lost.batches,[]);
 assert.equal(lost.escrowCopper,0);assert.equal(lost.refundCopper,120);assert.equal(lost.paidCopper,0);assert.equal(lost.taxCopper,0);
 assert.equal(lost.quantity,lost.lostFood+lost.deliveredFood+lost.spoiledFood+lost.rejectedFood);
 assert.equal(lost.transport.phase,'home');assert.ok(lost.homeAt>=DEPART);
 // The whole prepayment is back with the buyer village (other trade moves also touch the treasury, so compare with the record).
 assert.ok(lost.entries.some(e=>e.phase==='lost'&&e.refundCopper===120&&e.lostFood===40));
 assert.ok(fiscal(f.document,lane.buyer).entries.some(e=>e.phase==='lost'&&e.refundCopper===120));
 // The carrier owes 40*3 for the grain and the freight 47 back; neither is paid yet.
 assert.equal(dueObligation(f.document.state,lost.lossClaim).owed,120);
 assert.equal(dueObligation(f.document.state,f.document.state.records[trip.id].freightRefund).owed,trip.freight);
 assert.equal(f.document.state.records[trip.id].status,'wrecked');assert.ok(f.document.state.records[trip.id].settledAt);
 assert.deepEqual(auditLedger(f.document.ledger),[]);
 assert.ok(f.document.state.settlements[lane.buyer].treasury>=0&&buyerBefore>=0);
 // Later weeks neither re-lose nor re-pay this order.
 const snapshot=structuredClone(f.document.state.records[key]);
 await f.wait(DEPART+8*DAY);
 assert.deepEqual(f.document.state.records[key],snapshot);
 assert.equal(dueObligation(f.document.state,lost.lossClaim).owed,120);
});

test('intercepted carriage: the order records the seizure once, keeps the escrow, and a recovered shipment still pays out exactly once',async()=>{
 const f=scene(),raider='npc_hw_shendu';
 f.replace(applyPatches(f.document,[{op:'set',path:['state','npcs',raider,'location'],value:counter(lane.seller)}]));
 await f.wait(DEPART);
 const o=f.document.state.records[key],tripId=o.carriage;
 f.mutate(d=>transportIncident(d,f.engine,{shipment:tripId,actor:raider},'raid'));
 await f.wait(f.document.state.minute+DAY);await f.wait(f.document.state.minute+DAY);
 const held=f.document.state.records[key];
 assert.equal(held.status,'in-transit');assert.equal(held.escrowCopper,120);assert.equal(held.paidCopper,0);
 assert.equal(held.entries.filter(e=>e.phase==='intercepted').length,1);assert.equal(held.entries.find(e=>e.phase==='intercepted').custodian,raider);
 // Not failed, not delivered: the buyer village has paid nothing and has received no grain yet.
 assert.ok(!held.entries.some(e=>['lost','arrival'].includes(e.phase)));
 f.mutate(d=>transportIncident(d,f.engine,{shipment:tripId,recover:true,consent:true,actor:carrier},'retrieve'));
 await f.wait(f.document.state.minute+3*DAY);
 const done=f.document.state.records[key];
 assert.equal(done.status,'delivered');assert.equal(done.deliveredFood,40);assert.equal(done.paidCopper,120);assert.equal(done.lostFood??0,0);
 assert.equal(done.entries.filter(e=>e.phase==='arrival').length,1);assert.deepEqual(auditLedger(f.document.ledger),[]);
});
