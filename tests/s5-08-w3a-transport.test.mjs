import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,asset,finish,DRIVER,SECOND,SENDER,RECIPIENT} from './helpers/transport.mjs';
import {bookTransport,nextTransportMinute,advanceTransport,transportIncident,damageTransportCargo,compensateTransportLoss,destroyTransportAsset,transportAssetView,quoteTransport} from '../server-plugin/transport.mjs';
import {sendPost,advancePost,nextPostMinute} from '../server-plugin/post.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {dueObligation} from '../server-plugin/obligation-runtime.mjs';
import {freight as freightAccount} from '../server-plugin/stock.mjs';
import {escrow as escrowAccount} from '../server-plugin/money.mjs';
import {openHoldings} from '../server-plugin/holdings.mjs';
import {recordEntityDeath} from '../server-plugin/npc-life.mjs';

// D05 §5.1 / S5-08 W3a: the cart is pulled by 20 real bulls (600 kg), so capacity surcharge is 1.
function setup(){
 const f=fixture();f.d.document.ledger=openLedger(f.e,f.d.document);
 f.d.set(['state','npcs',RECIPIENT,'location'],'loc_bs');
 return {...f,vehicle:asset(f.d,f.e)};
}
const step=(d,e)=>{const at=nextTransportMinute(d.get('state'),d.get('state','minute'));assert.ok(Number.isFinite(at));d.set(['state','minute'],at);advanceTransport(d,e,at);};
const heard=(d,who)=>(d.get('state','npcs',who,'memoryStream')??[]).filter(m=>m.channel==='transport');

test('intercepted cargo: partial loss owes cargo value once, recovered shipment arrives short and the recipient is told',()=>{
 const {e,d,vehicle}=setup();d.set(['state','inventory','item_oats'],{quantity:10});
 const trip=bookTransport(d,e,{asset:vehicle,to:'loc_bs',recipient:RECIPIENT,cargo:[{item:'item_oats',quantity:10}]},'consign');
 transportIncident(d,e,{shipment:trip.id,actor:SECOND},'raid');
 assert.equal(d.get('state','records',trip.id,'status'),'intercepted');
 // 3 oats lost at basePrice 3 copper: 3*3=9. A repeated report of the same event is the same loss.
 const loss=damageTransportCargo(d,e,{shipment:trip.id,item:'item_oats',quantity:3,actor:DRIVER},'wet');
 assert.equal(loss.amount,9);assert.deepEqual(damageTransportCargo(d,e,{shipment:trip.id,item:'item_oats',quantity:3,actor:DRIVER},'wet'),loss);
 transportIncident(d,e,{shipment:trip.id,recover:true,consent:true,actor:'player'},'retrieve');
 const row=finish(d,e,trip.id);
 assert.deepEqual(row.deliveredCargo.map(c=>c.quantity),[7]);assert.equal(e.quantity(d,RECIPIENT,'item_oats'),57);
 // Failure is shown to the recipient and the owner, and the delivery never claims the full ten.
 assert.equal(heard(d,RECIPIENT).length,1);assert.match(heard(d,RECIPIENT)[0].content,/短少/);
 assert.ok(Object.values(d.get('memories')).some(m=>m.channel==='transport'&&/短少/.test(m.content)));
 // One 9-copper debt; the carrier pays it once and cannot be made to pay twice.
 assert.equal(dueObligation(d.get('state'),`${loss.id}:claim`).owed,9);
 // Payment needs the debtor physically with the creditor: the owner walks to the destination.
 d.set(['state','location'],'loc_bs');
 compensateTransportLoss(d,e,{loss:loss.id,amount:9,payer:DRIVER},'pay-loss');
 assert.equal(dueObligation(d.get('state'),`${loss.id}:claim`).owed,0);
 assert.throws(()=>compensateTransportLoss(d,e,{loss:loss.id,amount:1,payer:DRIVER},'pay-twice'));
 assert.deepEqual(auditLedger(d.get('ledger')),[]);
});

test('destroyed carrier: cargo is written off, carrier owes cargo value and freight, escort deposit returns, everyone is told once',()=>{
 const {e,d,vehicle}=setup();d.set(['state','inventory','item_oats'],{quantity:100});
 const q=quoteTransport(d,e,{asset:vehicle,from:'loc_hw',to:'loc_bs',cargo:[{item:'item_oats',quantity:100}],escort:SECOND});
 // 12 km road, 100*0.5=50 kg billable, cart rate 0.012, surcharge 1, risk 0 -> ceil(12*50*.012)=8 copper.
 assert.equal(q.freight,8);
 const trip=bookTransport(d,e,{asset:vehicle,to:'loc_bs',recipient:RECIPIENT,cargo:[{item:'item_oats',quantity:100}],escort:SECOND},'wreck-trip');
 assert.equal(trip.freight,8);
 const escrowKey=escrowAccount(trip.escortQuest),paid=d.get('ledger','accounts',escrowKey)??0;
 const playerBefore=d.get('state','player','coins');
 destroyTransportAsset(d,e,{asset:vehicle},'cart-burns');
 // Destruction itself keeps the cargo on the wreck: nothing is settled until the clock runs.
 assert.equal(d.get('state','records',trip.id,'status'),'wrecked');assert.equal(d.get('state','records',trip.id,'settledAt'),undefined);
 assert.equal(d.get('ledger','accounts',freightAccount(e,trip.id,'item_oats')),100);
 const at=nextTransportMinute(d.get('state'),d.get('state','minute'));assert.equal(at,d.get('state','minute')+1);
 d.set(['state','minute'],at);advanceTransport(d,e,at);
 const row=d.get('state','records',trip.id);
 assert.equal(row.settledAt,at);assert.deepEqual(row.cargo,[]);assert.equal(d.get('ledger','accounts',freightAccount(e,trip.id,'item_oats'))??0,0);
 // 100 oats * basePrice 3 = 300 owed by the carrier, plus the 8 copper freight back.
 assert.equal(dueObligation(d.get('state'),`${row.losses[0]}:claim`).owed,300);
 assert.equal(dueObligation(d.get('state'),row.freightRefund).owed,8);
 const refunded=d.get('state','records',trip.escortQuest);
 assert.equal(refunded.escrow??0,0);assert.equal(d.get('ledger','accounts',escrowKey)??0,0);
 assert.ok(paid>0);
 assert.deepEqual(row.informed.sort(),['player',RECIPIENT].sort());
 assert.equal(heard(d,RECIPIENT).length,1);assert.match(heard(d,RECIPIENT)[0].content,/损毁/);
 assert.deepEqual(auditLedger(d.get('ledger')),[]);
 // Idempotent: more ticks neither re-write the cargo nor re-notify nor add a second claim.
 const snapshot=structuredClone(d.document);
 d.set(['state','minute'],at+60);advanceTransport(d,e,at+60);
 assert.deepEqual(d.get('state','records',trip.id),snapshot.state.records[trip.id]);assert.equal(heard(d,RECIPIENT).length,1);
 assert.equal(nextTransportMinute(d.get('state'),at+60),Infinity);
});


test('escort deposit is not stranded when the paying owner dies mid-trip: the open estate gets it back',()=>{
 const {e,d,vehicle}=setup();d.document.holdings=openHoldings(e,d.document);
 const trip=bookTransport(d,e,{owner:SENDER,recipient:RECIPIENT,asset:vehicle,to:'loc_bs',cargo:[{item:'item_oats',quantity:10}],escort:SECOND},'owner-dies');
 const key=escrowAccount(trip.escortQuest),deposit=d.get('ledger','accounts',key);
 // The deposit is real money held in the quest's escrow account (the quoted escort fee).
 assert.ok(deposit>0);assert.equal(d.get('state','records',trip.escortQuest,'escrow'),deposit);
 recordEntityDeath(d,e,SENDER,d.get('state','minute'),'病故');
 // At arrival the wage claim is controlled by the open estate procedure, so the claim cannot be
 // paid from the deposit; the deposit must go back to the owner's estate, not stay locked.
 finish(d,e,trip.id);
 assert.equal(d.get('ledger','accounts',key)??0,0,'nothing is left booked in the escort escrow account');
 assert.equal(d.get('state','records',trip.escortQuest,'escrow'),0);
 assert.deepEqual(auditLedger(d.get('ledger')),[]);
});

const tick=(d,e)=>{
 const now=d.get('state','minute'),at=Math.min(nextTransportMinute(d.get('state'),now),nextPostMinute(d.get('state'),now));
 if(!Number.isFinite(at))return false;
 d.set(['state','minute'],at);advanceTransport(d,e,at);advancePost(d,e,at);return true;
};
const letterMemories=d=>Object.values(d.get('memories')??{});

test('a letter whose carrier is destroyed is lost exactly once, the sender is told and the postage is owed back',()=>{
 const {e,d,vehicle}=setup();
 const sent=sendPost(d,e,{from:'player',to:RECIPIENT,memoryId:'请留一壶酒。',legs:[{asset:vehicle,to:'loc_bs'}]},'letter-wreck');
 const trip=d.get('state','records',sent.shipment);assert.ok(trip.freight>=1);
 destroyTransportAsset(d,e,{asset:vehicle},'letter-cart-burns');
 while(tick(d,e));
 const post=d.get('state','records',sent.id);
 assert.equal(post.status,'lost');assert.equal(post.deliveredAt,undefined);
 assert.equal(heard(d,RECIPIENT).length,0);assert.equal((d.get('state','npcs',RECIPIENT,'memoryStream')??[]).filter(m=>m.channel==='post').length,0,'the addressee never hears a letter that never arrived');
 assert.ok(letterMemories(d).some(m=>m.channel==='transport'&&/损毁/.test(m.content)),'the sender is told');
 assert.equal(dueObligation(d.get('state'),d.get('state','records',sent.shipment,'freightRefund')).owed,trip.freight);
 assert.equal(nextPostMinute(d.get('state'),d.get('state','minute')),Infinity);assert.equal(nextTransportMinute(d.get('state'),d.get('state','minute')),Infinity);
 assert.deepEqual(auditLedger(d.get('ledger')),[]);
});

test('a destroyed receipt carrier leaves the delivered letter delivered and only the receipt lost',()=>{
 const {e,d,vehicle}=setup();
 const sent=sendPost(d,e,{from:'player',to:RECIPIENT,memoryId:'请留一壶酒。',legs:[{asset:vehicle,to:'loc_bs'}]},'letter-receipt');
 for(let i=0;i<20&&d.get('state','records',sent.id,'status')!=='receipt-in-transit';i++)assert.ok(tick(d,e));
 assert.equal(d.get('state','records',sent.id,'status'),'receipt-in-transit');
 assert.equal((d.get('state','npcs',RECIPIENT,'memoryStream')??[]).filter(m=>m.channel==='post').length,1);
 destroyTransportAsset(d,e,{asset:vehicle},'receipt-cart-burns');
 while(tick(d,e));
 const post=d.get('state','records',sent.id);
 assert.equal(post.status,'delivered');assert.equal(post.receiptLost,true);assert.equal(post.receiptAt,undefined);
 assert.equal((d.get('state','npcs',RECIPIENT,'memoryStream')??[]).filter(m=>m.channel==='post').length,1,'the letter is not delivered a second time');
 assert.deepEqual(auditLedger(d.get('ledger')),[]);
});
