import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,asset,DRIVER,SECOND,RECIPIENT} from './helpers/transport.mjs';
import {bookTransport,quoteTransport,transportAssetView,transportServices,advanceTransport,nextTransportMinute,collectTransport,cancelTransport,leaseTransportAsset,transportIncident,damageTransportCargo,destroyTransportAsset,carrierDeparture} from '../server-plugin/transport.mjs';
import {createNpcObligation} from '../server-plugin/npc-obligations.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {freight} from '../server-plugin/stock.mjs';
import {dueObligation} from '../server-plugin/obligation-runtime.mjs';
import transportBalance from '../world/rules/tables/balance/transport.json' with {type:'json'};
import {applyConsentEvent} from '../server-plugin/action-consent.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';

function setup(){
 const f=fixture(),{w,d,e}=f;
 w.balance={...w.balance,transport:structuredClone(transportBalance)};
 // Manual anchor: a 20 kg vehicle, oats 0.5 kg/unit. 24 units occupy 12 kg.
 w.balance.transport.rows.find(r=>r.key==='carrier:cart').kg=20;
 d.set(['state','minute'],590);d.set(['state','inventory','item_oats'],{quantity:100});
 // Carrying 100 oats is an unrelated premise: give the owner enough native strength.
 d.set(['state','player','attributes','力量'],30);
 const vehicle=asset(d,e);d.document.ledger=openLedger(e,d.document);
 return {...f,vehicle};
}
function tick(d,e){const at=nextTransportMinute(d.get('state'),d.get('state','minute'));assert.ok(Number.isFinite(at));d.set(['state','minute'],at);advanceTransport(d,e,at);}
function arrive(d,e,id){for(let i=0;i<100;i++){const row=d.get('state','records',id);if(['arrived','delivered'].includes(row.status))return row;tick(d,e);}assert.fail('shipment did not arrive');}
const book=(d,e,vehicle,event='first',extra={})=>bookTransport(d,e,{asset:vehicle,to:'loc_bs',cargo:[{item:'item_oats',quantity:24}],...extra},event);

test('20 kg / 12 kg committed: a second 9 kg cannot reuse the vehicle; quotation is read-only',()=>{
 const {e,d,vehicle}=setup(),before=structuredClone(d.document);
 const quote=quoteTransport(d,e,{asset:vehicle,from:'loc_hw',to:'loc_bs',cargo:[{item:'item_oats',quantity:24}]});
 assert.equal(quote.load.kg,12);assert.deepEqual(d.document,before);
 const trip=book(d,e,vehicle),reserved=structuredClone(d.document);
 assert.equal(trip.load.kg,12);assert.equal(transportAssetView(e,d.document,vehicle).busy,trip.id);
 // No split-load agreement exists: the entire vehicle stays reserved, even for 1 kg.
 for(const quantity of [18,2])assert.throws(()=>book(d,e,vehicle,`second:${quantity}`,{cargo:[{item:'item_oats',quantity}]}));
 assert.deepEqual(d.document,reserved);assert.equal(e.quantity(d,'player','item_oats'),76);
 assert.equal(d.get('ledger','accounts',freight(e,trip.id,'item_oats')),24);assert.deepEqual(auditLedger(d.get('ledger')),[]);
});

test('arrival releases occupancy while absent recipient goods remain in freight until local collection',()=>{
 const {e,d,vehicle}=setup(),trip=book(d,e,vehicle),recipientBefore=e.quantity(d,RECIPIENT,'item_oats');
 // Anchor: 100 - 24 = 76 usable at origin, zero of these 24 usable at destination before arrival.
 tick(d,e);assert.equal(e.quantity(d,'player','item_oats'),76);assert.equal(e.quantity(d,RECIPIENT,'item_oats'),recipientBefore);
 assert.throws(()=>collectTransport(d,e,trip.id));
 const row=arrive(d,e,trip.id);assert.equal(row.status,'arrived');assert.equal(row.cargoLocation,'loc_bs');
 assert.equal(transportAssetView(e,d.document,vehicle).busy,null);assert.equal(transportServices(e,d.document,'loc_bs').length,1);
 assert.equal(e.quantity(d,'player','item_oats'),76);assert.equal(d.get('ledger','accounts',freight(e,trip.id,'item_oats')),24);
 // The empty vehicle may return while the first 24 units remain at the destination.
 d.set(['state','npcs',SECOND,'location'],'loc_bs');
 const second=bookTransport(d,e,{asset:vehicle,owner:SECOND,recipient:SECOND,to:'loc_hw',cargo:[{item:'item_oats',quantity:18}]},'return');
 assert.equal(second.load.kg,9);assert.equal(d.get('ledger','accounts',freight(e,trip.id,'item_oats')),24);
 d.set(['state','location'],'loc_bs');collectTransport(d,e,trip.id);assert.equal(e.quantity(d,'player','item_oats'),100);
 assert.throws(()=>collectTransport(d,e,trip.id));assert.deepEqual(auditLedger(d.get('ledger')),[]);
});

test('agreed predeparture cancellation returns the same goods and freight once, releases driver and capacity',async()=>{
 const {e,d,vehicle}=setup(),cash=d.get('state','player','coins'),trip=book(d,e,vehicle),reserved=structuredClone(d.document);
 // Anchor: load 24, unload 24; 100 at origin again, no cargo or driver left reserved.
 assert.throws(()=>cancelTransport(d,e,{shipment:trip.id,actor:SECOND},'cancel'));assert.deepEqual(d.document,reserved);
 applyConsentEvent(d,{engine:e,document:d.document},{actor:DRIVER,eventId:'carrier-cancellation',verb:'consent_given',to:'player',payload:{scope:'amend',subject:trip.id,purpose:[trip.id],terms:{quantity:0,fee:trip.freight,location:trip.from},until:600}});
 const result=await e.reduce(d.document,{tool:'world_act',args:{action:'core:trade.transport',slots:{seller:DRIVER,task:'cancel',contract:trip.id}},eventId:'cancel'});
 d.document=applyPatches(d.document,result.patches);const row=d.get('state','records',trip.id);
 assert.equal(row.status,'cancelled');assert.equal(e.quantity(d,'player','item_oats'),100);assert.equal(d.get('state','player','coins'),cash);
 assert.equal(row.cancelConsent,'carrier-cancellation');
 assert.equal(d.get('state','npcs',DRIVER,'cognitionTravel'),undefined);assert.equal(transportAssetView(e,d.document,vehicle).busy,null);
 const snapshot=structuredClone(d.document);assert.deepEqual(cancelTransport(d,e,{shipment:trip.id,consent:true},'cancel'),row);assert.deepEqual(d.document,snapshot);
 const next=book(d,e,vehicle,'replacement');tick(d,e);const departed=structuredClone(d.document);
 assert.throws(()=>cancelTransport(d,e,{shipment:next.id,consent:true},'too-late'));assert.deepEqual(d.document,departed);assert.deepEqual(auditLedger(d.get('ledger')),[]);
});

test('interception retains draft animals; loss reduces actual load without releasing the reserved vehicle',()=>{
 const {e,d,vehicle}=setup(),other=asset(d,e,DRIVER,'cart','other');d.document.ledger=openLedger(e,d.document);
 const trip=book(d,e,vehicle);tick(d,e);transportIncident(d,e,{shipment:trip.id,actor:SECOND},'raid');
 // Anchor: both carts use the same real bulls; interception cannot make them pull the other cart.
 assert.equal(transportAssetView(e,d.document,other).capacityKg,0);assert.equal(transportAssetView(e,d.document,vehicle).busy,trip.id);
 const loss=damageTransportCargo(d,e,{shipment:trip.id,item:'item_oats',quantity:10,actor:DRIVER},'wet');
 // 24 - 10 = 14 oats = 7 kg remaining, not a second inventory copy.
 assert.equal(d.get('state','records',trip.id,'load','kg'),7);assert.equal(d.get('ledger','accounts',freight(e,trip.id,'item_oats')),14);
 assert.equal(dueObligation(d.get('state'),`${loss.id}:claim`).owed,loss.amount);
 const snapshot=structuredClone(d.document);assert.deepEqual(damageTransportCargo(d,e,{shipment:trip.id,item:'item_oats',quantity:10,actor:DRIVER},'wet'),loss);assert.deepEqual(d.document,snapshot);
 transportIncident(d,e,{shipment:trip.id,recover:true,consent:true,actor:'player'},'recover');arrive(d,e,trip.id);
 assert.equal(transportAssetView(e,d.document,vehicle).busy,null);assert.deepEqual(auditLedger(d.get('ledger')),[]);
});

test('wreck consumes actual cargo once and releases the driver without recreating goods',()=>{
 const {e,d,vehicle}=setup(),trip=book(d,e,vehicle);destroyTransportAsset(d,e,{asset:vehicle},'wreck');tick(d,e);
 const row=d.get('state','records',trip.id);
 // Anchor: 24 destroyed, 76 remain with owner, no refunded physical cargo.
 assert.deepEqual(row.cargo,[]);assert.equal(e.quantity(d,'player','item_oats'),76);assert.equal(d.get('ledger','accounts',freight(e,trip.id,'item_oats'))??0,0);
 assert.equal(d.get('state','npcs',DRIVER,'cognitionTravel'),undefined);assert.equal(transportAssetView(e,d.document,vehicle).capacityKg,0);
 const snapshot=structuredClone(d.document);advanceTransport(d,e,d.get('state','minute'));assert.deepEqual(d.document,snapshot);assert.deepEqual(auditLedger(d.get('ledger')),[]);
});

test('independent vehicles run concurrently; shared closure delays both; same-seed replay is identical',()=>{
 function run(){
  const {e,d,w,vehicle}=setup(),other=asset(d,e,SECOND,'cart','independent');d.document.ledger=openLedger(e,d.document);
  const first=book(d,e,vehicle),second=book(d,e,other,'second',{cargo:[{item:'item_oats',quantity:18}]});
  // Anchor: two real vehicles carry 12 and 9 kg independently, no shared capacity pool.
  assert.equal(first.load.kg,12);assert.equal(second.load.kg,9);w.routes[0].closedSeasons=[0,1,2,3];tick(d,e);
  assert.equal(d.get('state','records',first.id,'status'),'delayed');assert.equal(d.get('state','records',second.id,'status'),'delayed');
  assert.equal(d.get('state','records',first.id,'transport','nextAt'),d.get('state','records',second.id,'transport','nextAt'));
  w.routes[0].closedSeasons=[];arrive(d,e,first.id);arrive(d,e,second.id);assert.deepEqual(auditLedger(d.get('ledger')),[]);return d.document;
 }
 assert.deepEqual(run(),run());
});

test('departure rounding respects the cutoff and long trips include actual rest time',()=>{
 const {e,d,w,vehicle}=setup(),row=w.balance.transport.rows.find(r=>r.key==='departure:cart');
 // Anchor: rounding a minute before cutoff must not produce the forbidden cutoff departure.
 assert.equal(carrierDeparture(e,'cart',row.cutoff-1),1440+row.resume);assert.equal(carrierDeparture(e,'cart',row.resume-1),row.resume);
 w.routes[0].lengthKm=200;const trip=book(d,e,vehicle);const arrived=arrive(d,e,trip.id);
 // A 200 km cart journey exceeds one daily travel budget: actual elapsed time exceeds moving minutes.
 assert.ok(arrived.arrivedAt-trip.departAt>arrived.transport.movingMinutes);assert.deepEqual(auditLedger(d.get('ledger')),[]);
});

test('walking delivery validates carrying strength; local face-to-face handover ignores remote vehicle occupancy',()=>{
 const {e,d,w,vehicle}=setup();book(d,e,vehicle);
 w.npcs.find(n=>n.id===RECIPIENT).tier='full';
 // Anchor: 50 kg oats > carryBase + strength * carryPerStrength for an ordinary courier.
 d.set(['state','npcs',RECIPIENT,'inventory','item_oats'],{quantity:1000});
 const args={type:'送货',promisor:RECIPIENT,promisee:'player',item:'item_oats',quantity:100,content:'deliver oats',location:'loc_bs',deadline:1000};
 const before=structuredClone(d.document);assert.throws(()=>createNpcObligation(d,e,args,'overloaded'));assert.deepEqual(d.document,before);
 // Local goods move directly through the existing obligation performance, without the occupied cart.
 d.set(['state','player','attributes','力量'],100);d.document.ledger=openLedger(e,d.document);
 const local=createNpcObligation(d,e,{...args,quantity:100,location:'loc_hw',deadline:650},'local').obligation;
 assert.equal(local.quantity,100);assert.equal(local.location,'loc_hw');
 const stock=e.quantity(d,'player','item_oats');e.deliver(d,local.id,local,'handover');
 assert.equal(e.quantity(d,'player','item_oats'),stock+100);assert.deepEqual(auditLedger(d.get('ledger')),[]);
});

test('a present recipient who cannot carry the load leaves it at arrival; failed collection rolls back every stack',()=>{
 const {e,d,vehicle}=setup();
 d.set(['state','inventory','item_wood'],{quantity:1});d.document.ledger=openLedger(e,d.document);
 const trip=book(d,e,vehicle,'two-stacks',{cargo:[{item:'item_oats',quantity:2},{item:'item_wood',quantity:1}]});
 d.set(['state','location'],'loc_bs');d.set(['state','player','attributes','力量'],0);
 // Anchor: own safe load = carryBase. Fill it to 1 kg spare: first oats fit,
 // then wood does not. Both accounts must remain unchanged on failure.
 const base=e.rules.combat.character.carryBase;
 d.set(['state','inventory'],{item_oats:{quantity:(base-1)*2}});d.document.ledger=openLedger(e,d.document);
 const row=arrive(d,e,trip.id);assert.equal(row.status,'arrived');assert.equal(transportAssetView(e,d.document,vehicle).busy,null);
 const before=structuredClone(d.document);assert.throws(()=>collectTransport(d,e,trip.id));assert.deepEqual(d.document,before);
 assert.equal(d.get('ledger','accounts',freight(e,trip.id,'item_oats')),2);assert.equal(d.get('ledger','accounts',freight(e,trip.id,'item_wood')),1);
 d.set(['state','player','attributes','力量'],30);collectTransport(d,e,trip.id);assert.deepEqual(auditLedger(d.get('ledger')),[]);
});

test('route delay past lease expiry keeps the carrier reservation until arrival',()=>{
 const {e,d,w,vehicle}=setup();leaseTransportAsset(d,e,{asset:vehicle,tenant:SECOND,minutes:1000,coins:1},'lease');
 const trip=book(d,e,vehicle);assert.equal(trip.carrier,SECOND);
 // Anchor: lease ends at 590 + 1000 = 1590; a shared road closure lasts past it.
 w.routes[0].closedSeasons=[0,1,2,3];while(d.get('state','minute')<=1590)tick(d,e);
 assert.equal(transportAssetView(e,d.document,vehicle).holder,SECOND);assert.equal(transportAssetView(e,d.document,vehicle).busy,trip.id);
 w.routes[0].closedSeasons=[];arrive(d,e,trip.id);
 assert.equal(transportAssetView(e,d.document,vehicle).holder,DRIVER);assert.equal(transportAssetView(e,d.document,vehicle).busy,null);assert.deepEqual(auditLedger(d.get('ledger')),[]);
});
