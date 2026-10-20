import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup,scoreRows} from '../tools/a3-score.mjs';
import {bookServiceAppointment,npcServices,serviceAppointments} from '../server-plugin/npc-state.mjs';
import {scheduleAt,assertNpcService} from '../server-plugin/npc-schedule.mjs';
import {recordAgreedQuote,agreedTradeQuote,resolveRedeemingBranch} from '../server-plugin/shop.mjs';
import {recordWorkstationAccess,prepareBookedWorkstation,workstationDefinition} from '../server-plugin/workstation-services.mjs';
import {facilityView,lodgingAvailability,registerLodgingBed,assertLodgingCapacity,prepareFacilityProject} from '../server-plugin/facility-state.mjs';
import {bookExaminationSeat,examinationSeats,assertExaminationSeat} from '../server-plugin/local-exams.mjs';
import {recordHistoricalEvent} from '../server-plugin/world-events.mjs';
import {openHolding,declareHoldingWriter,setLocation} from '../server-plugin/holdings.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const corpus=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2.json',import.meta.url),'utf8'));
const initial=engine.initialFromLegacy(seed,'a3-owner-yi');
const save=document=>JSON.parse(JSON.stringify(document));
const row=n=>corpus.find(r=>r.id===`A3V2-${String(n).padStart(3,'0')}`);
const setup=n=>applyIntentSetup(engine,initial,row(n).setup);
function write(document,fn){const d=engine.primitiveDraft(document),result=fn(d);return {document:applyPatches(document,d.patches),result,patches:d.patches};}
function history(document,id,verb,actor,payload){return write(document,d=>recordHistoricalEvent(d,engine,{id,verb,actor,minute:document.state.minute-1,source:{kind:'corpus_premise',row:'A3-OWNER-YI'},payload})).document;}
async function run(document,tool,args,eventId){const out=await engine.reduce(document,{tool,args,eventId});return {document:applyPatches(document,out.patches),result:out.result,patches:out.patches};}
function balanced(document){const r=reconcile(engine,document);assert.deepEqual(r.mismatches,[]);assert.deepEqual(r.drift,[]);}

test('E: persisted appointments drive native service windows without adding careers or consent',()=>{
 const s=setup(75);assert.deepEqual(s.setupUnmet,[]);
 const document=save(s.document),actor='npc_hw_linsui',before=save(initial);
 assert.ok(scheduleAt(engine,actor,1200,document.state).services.includes('trade'));
 assertNpcService(engine.primitiveDraft(document),engine,actor,'trade',5);
 assert.deepEqual(npcServices(engine,document.state,actor),npcServices(engine,before.state,actor));
 assert.equal(document.state.consentEvents?.length??0,initial.state.consentEvents?.length??0);
 const appointment=serviceAppointments(document.state,actor)[0];assert.ok(appointment);
 assert.throws(()=>write(document,d=>bookServiceAppointment(d,engine,{...appointment,id:'unauthorized'},{actor:'player'})),/actor\/source/);
 assert.throws(()=>write(document,d=>bookServiceAppointment(d,engine,{...appointment,id:'invalid',end:appointment.start})),/Invalid/);
 assert.throws(()=>write(document,d=>bookServiceAppointment(d,engine,{...appointment,id:'not-a-place',location:actor})),/Invalid/);
 const forged=save(document);forged.state.records[`service_appointment:${appointment.id}`].end=2000;
 assert.equal(serviceAppointments(forged.state,actor).length,0);
 const outside=save(document);outside.state.minute=appointment.end;
 const bare=save(outside);delete bare.state.records[`service_appointment:${appointment.id}`];
 const after=scheduleAt(engine,actor,outside.state.minute,outside.state),native=scheduleAt(engine,actor,bare.state.minute,bare.state);
 // Splitting an authored slot changes its start boundary, not post-booking availability.
 for(const key of ['services','activity','location','until'])assert.deepEqual(after[key],native[key]);
});

test('F: exact quote quantity, direction, total and expiry survive reload and real trade',async()=>{
 const s=setup(2);assert.deepEqual(s.setupUnmet,[]);const document=save(s.document);
 const request={buyer:'player',seller:'npc_hw_linsui',item:'item_bread',quantity:2},quote=agreedTradeQuote(document.state,request);assert.equal(quote.totalCoins,4);
 assert.equal(agreedTradeQuote(document.state,{...request,quantity:1}),null);
 assert.equal(agreedTradeQuote(document.state,{...request,buyer:request.seller,seller:'player'}),null);
 const expired=save(document);expired.state.minute=quote.expires;assert.equal(agreedTradeQuote(expired.state,request),null);
 assert.throws(()=>write(document,d=>recordAgreedQuote(d,engine,{...quote,id:'fake',totalCoins:1})),/source/);
 assert.throws(()=>write(document,d=>recordAgreedQuote(d,engine,{...quote,id:'other'},{actor:'player'})),/actor/);
 const tampered=save(document);tampered.state.records[`agreed_quote:${quote.id}`].totalCoins=1;assert.equal(agreedTradeQuote(tampered.state,request),null);
 const out=await run(document,'world_trade',{seller:'npc_hw_linsui',item:'item_bread',quantity:2},'yi-trade');
 assert.equal(out.result.cost,4);assert.equal(out.document.state.player.coins,0);assert.equal(agreedTradeQuote(out.document.state,request),null);balanced(out.document);
 assert.deepEqual(save(out.document),save(applyPatches(document,out.patches)));
});

test('F: non-divisible totals are native totals and cannot be replaced by a unit price',async()=>{
 const s=setup(2);let document=save(s.document);
 // A distinct agreement may have a non-integral unit price. It remains an integer total.
 for(const key of Object.keys(document.state.records))if(key.startsWith('agreed_quote:'))delete document.state.records[key];
 document=history(document,'odd-total','quoted','npc_hw_linsui',{to:'player',resource:'item_bread',quantity:2,totalCoins:3});
 document=write(document,d=>recordAgreedQuote(d,engine,{id:'odd-total',actor:'npc_hw_linsui',to:'player',resource:'item_bread',quantity:2,totalCoins:3,direction:'sell_to_player',at:599,expires:720,sourceEvent:'world_event:odd-total'})).document;
 await assert.rejects(run(document,'world_trade',{seller:'npc_hw_linsui',item:'item_bread',quantity:2,unitPrice:2},'yi-wrong-price'));
 const out=await run(save(document),'world_trade',{seller:'npc_hw_linsui',item:'item_bread',quantity:2},'yi-odd-total');
 assert.equal(out.result.cost,3);balanced(out.document);
});

test('F: agreed remittance uses a real branch, exact fee and existing issuer accounting',async()=>{
 const s=setup(38);assert.deepEqual(s.setupUnmet,[]);const document=save(s.document);
 const branch=resolveRedeemingBranch(engine,document.state,'loc_bs');assert.ok(branch.id);assert.notEqual(branch.id,'bank_hw_post');
 const out=await run(document,'world_trade',{operation:'remit',seller:'npc_hw_shendu',buyer:'npc_hw_yanzhe',coins:50,location:'loc_bs'},'yi-remit');
 assert.equal(out.result.fee,2);assert.equal(out.result.amount,50);assert.equal(out.result.destination,branch.id);
 assert.equal(out.document.state.player.coins,document.state.player.coins-52);
 assert.equal(out.document.state.records[out.result.contract].fee,2);balanced(out.document);
 const quote=Object.values(document.state.records).find(r=>r.category==='agreed_quote');
 assert.throws(()=>write(document,d=>recordAgreedQuote(d,engine,{...quote,id:'fake-branch',destinationBranch:'bank_does_not_exist'})),/branch/);
 await assert.rejects(run(document,'world_trade',{operation:'remit',seller:'npc_hw_shendu',buyer:'npc_hw_yanzhe',coins:50,location:'bld_hw_post'},'yi-wrong-branch'));
});
test('F: haggle routing reads the active agreed item quote rather than requiring a completed sale',async()=>{
 const score=await scoreRows([row(44)]);
 assert.equal(score.results[0].actual.route,'core:dialogue.haggle');
 assert.equal(score.results[0].scores.route,true);assert.deepEqual(score.results[0].setupUnmet,[]);
});

test('G: the authored town kiln and old prepayment cover the full real process exactly once',async()=>{
 const s=setup(25);assert.deepEqual(s.setupUnmet,[]);const document=save(s.document);
 assert.equal(workstationDefinition(engine,document.state,'station_bs_small_kiln').location,'loc_bs');
 assert.throws(()=>prepareFacilityProject(engine,document.state,{projectWork:'repair',building:'loc_bs',wood:10,stone:10,days:1},'loc_bs'));
 assert.equal(facilityView(engine,document.state,'loc_bs').workstations[0].fee,0);
 const booking=prepareBookedWorkstation(engine.primitiveDraft(document),engine,'craft',{operation:'manufacture',recipe:'recipe_fire_cup'}),receipt=booking.receipt;assert.ok(receipt?.paid);
 await assert.rejects(run(document,'world_craft',{operation:'manufacture',recipe:'recipe_fire_cup',batches:100001},'yi-invalid-batches'));
 const out=await run(document,'world_craft',{operation:'manufacture',recipe:'recipe_fire_cup'},'yi-kiln');
 assert.equal(out.document.state.minute-document.state.minute,600);assert.equal(out.document.state.player.coins,0);balanced(out.document);
 assert.equal(facilityView(engine,save(out.document).state,'loc_bs').workstations[0].fee,5);
 assert.throws(()=>write(document,d=>recordWorkstationAccess(d,engine,{...receipt,id:'again'})),/already assigned/);
 assert.throws(()=>write(document,d=>recordWorkstationAccess(d,engine,{...receipt,id:'unauthorized'},{actor:'npc_hw_linsui'})),/Invalid/);
 const short=save(document);const key=`workstation_access:${receipt.id}`;
 // A genuine shorter booking is accepted by the writer but cannot fund a longer process.
 delete short.state.records[key];delete short.state.records[`${key}:source`];
 const bounded=write(short,d=>recordWorkstationAccess(d,engine,{...receipt,id:'short',toMinute:1079})).document;
 await assert.rejects(run(bounded,'world_craft',{operation:'manufacture',recipe:'recipe_fire_cup'},'yi-short-window'),/complete production/);
 const tampered=save(document);tampered.state.records[key].fee=0;assert.equal(facilityView(engine,tampered.state,'loc_bs').workstations[0].fee,5);
});

test('H: real qualified examiner and pending seat are read by certification; clerk is not a substitute',async()=>{
 const catalog=world.professions.find(p=>p.id==='profession_mage');
 const s=applyIntentSetup(engine,initial,{minute:600,location:'bld_hw_riverhome',present:['npc_hw_xuling'],coins:30,abilities:{skills:{skill_light:100},spells:[],recipes:[],licenses:[]},body:{player:{level:10}}});assert.deepEqual(s.setupUnmet,[]);
 let document=s.document;
 const seat={id:'mage-exam',profession:catalog.id,registrar:'npc_hw_xuling',examiner:'npc_hw_xuling',location:'bld_hw_riverhome',minutes:120,fee:30,available:true,passed:false};
 document=write(document,d=>bookExaminationSeat(d,engine,seat)).document;document=save(document);
 assert.equal(examinationSeats(engine,document.state,catalog.id).length,1);
 assert.equal(assertExaminationSeat(engine.primitiveDraft(document),engine,{profession:catalog.id,teacher:'npc_hw_xuling'}).id,seat.id);
 assert.throws(()=>write(document,d=>bookExaminationSeat(d,engine,{...seat,id:'clerk',examiner:'npc_hw_yanzhe'})),/unqualified/);
 assert.throws(()=>write(document,d=>bookExaminationSeat(d,engine,{...seat,id:'forged'},{actor:'player'})),/Invalid/);
 assert.throws(()=>write(document,d=>bookExaminationSeat(d,engine,{...seat,id:'free',fee:0})),/native examination/);
 const unavailable=save(document);delete unavailable.state.records['examination_seat:mage-exam'];delete unavailable.state.records['examination_seat:mage-exam:source'];
 const closed=write(unavailable,d=>bookExaminationSeat(d,engine,{...seat,available:false})).document;
 await assert.rejects(run(closed,'world_profession',{profession:catalog.id,teacher:'npc_hw_xuling'},'yi-seat-closed'),/No available/);
 const out=await run(document,'world_profession',{profession:catalog.id,teacher:'npc_hw_xuling'},'yi-seat-exam');
 assert.equal(out.document.state.minute-document.state.minute,120);assert.ok(out.document.state.records['examination_seat:mage-exam:used']);balanced(out.document);
 assert.ok(setup(20).setupUnmet.some(r=>r.item==='examinations[0]'));
});

test('G: multiple batches clip to the booking and consume the old fee only on the first batch',async()=>{
 const premise=structuredClone(row(25).setup);premise.inventory.item_clay=3;premise.inventory.item_charcoal=6;premise.coins=10;premise.workstationAccess[0].toMinute=1680;
 const s=applyIntentSetup(engine,initial,premise);assert.deepEqual(s.setupUnmet,[]);
 const out=await run(save(s.document),'world_craft',{operation:'manufacture',recipe:'recipe_fire_cup',batches:3},'yi-two-kiln-batches');
 assert.equal(out.result.batches,2);assert.equal(out.result.requestedBatches,3);assert.equal(out.result.clipped,1);
 assert.equal(out.result.spent.minutes,1200);assert.equal(out.result.spent.feePaid,5);assert.equal(out.document.state.player.coins,5);balanced(out.document);
});
test('G: repair also reads the full booking and consumes its own real prepayment',async()=>{
 const s=applyIntentSetup(engine,initial,{minute:600,location:'bld_hw_mill',inventory:{item_staff:1,item_whittling_knife:1},coins:0,abilities:{skills:{skill_life_6_core:100},recipes:[],spells:[],licenses:[]}});assert.deepEqual(s.setupUnmet,[]);
 let document=history(s.document,'repair-paid','paid','player',{subject:'station_hw_mill_bench',amount:2,purpose:'workstation_use',resource:'coin_river'});
 document.state.inventory.item_staff.durability=50;
 const receipt={id:'repair-slot',station:'station_hw_mill_bench',holder:'player',fromMinute:599,toMinute:620,fee:2,paid:true,usable:true,paymentEvent:'world_event:repair-paid'};
 document=write(document,d=>recordWorkstationAccess(d,engine,receipt)).document;
 assert.equal(document.state.records['workstation_access:repair-slot'].usable,undefined);
 const out=await run(save(document),'world_craft',{operation:'repair',item:'item_staff'},'yi-repair-slot');
 assert.equal(out.result.spent.feePaid,0);assert.equal(out.result.spent.minutes,20);assert.ok(out.document.state.records['workstation_access:repair-slot:used']);balanced(out.document);
 const short=save(s.document);short.state.inventory.item_staff.durability=50;
 const bounded=write(short,d=>recordWorkstationAccess(d,engine,{id:'short-repair',station:receipt.station,holder:'player',fromMinute:599,toMinute:619,fee:2,paid:false,usable:true})).document;
 await assert.rejects(run(bounded,'world_craft',{operation:'repair',item:'item_staff'},'yi-short-repair'),/complete production/);
});

declareHoldingWriter('a3-yi-test',{kinds:['lodges'],locations:true});
test('I: bed availability derives from lodging occupancy and survives save/patch replay',async()=>{
 const s=setup(3);assert.deepEqual(s.setupUnmet,[]);let document=save(s.document),id='item_a3v2_003_available_bed';
 assert.equal(lodgingAvailability(engine,document,'bld_hw_qingdeng',{bed:id}).available,true);
 document=write(document,d=>openHolding(d,{kind:'lodges',holder:'npc_hw_yanzhe',subject:'bld_hw_qingdeng',terms:{bed:id,from:1200,until:1300},writer:'a3-yi-test',engine})).document;
 assert.equal(lodgingAvailability(engine,save(document),'bld_hw_qingdeng',{bed:id}).available,false);
 assert.equal(lodgingAvailability(engine,document,'bld_hw_qingdeng',{bed:id,actor:'npc_hw_yanzhe'}).available,true);
 assert.equal(lodgingAvailability(engine,document,'bld_hw_qingdeng',{bed:id,minute:1300}).available,true);
 assert.throws(()=>write(document,d=>registerLodgingBed(d,engine,{id:'item_forged_bed',location:'bld_hw_qingdeng'})),/real object/);
 assert.throws(()=>write(document,d=>registerLodgingBed(d,engine,{id:'npc_hw_linsui',location:'bld_hw_qingdeng'})),/real object/);
 // The two remaining slots are occupied later in the requested night.
 for(const holder of ['npc_hw_ayan','npc_hw_shendu'])document=write(document,d=>openHolding(d,{kind:'lodges',holder,subject:'bld_hw_qingdeng',terms:{from:1250,until:1400},writer:'a3-yi-test',engine})).document;
 assert.throws(()=>assertLodgingCapacity(engine,document,'bld_hw_qingdeng',1200,1440));
 await assert.rejects(run(document,'world_trade',{seller:'npc_hw_linsui',service:'住宿',days:1},'yi-full-house'));
 for(const n of [4,77])assert.equal(setup(n).setupUnmet.some(r=>r.item.endsWith('.available')),false);
 const changed=structuredClone(row(3).setup);changed.objects[0].available=false;
 assert.ok(applyIntentSetup(engine,initial,changed).setupUnmet.some(r=>r.item.endsWith('.available')));
});

test('I: native rent allocates the physical bed and its contract expires without an availability flag',async()=>{
 const s=setup(3);assert.deepEqual(s.setupUnmet,[]);
 const out=await run(save(s.document),'world_trade',{seller:'npc_hw_linsui',service:'住宿',days:1},'yi-bed-rent');
 const contract=out.document.state.records[out.result.contract],bed=contract.bed;assert.equal(bed,'item_a3v2_003_available_bed');
 assert.equal(lodgingAvailability(engine,save(out.document),'bld_hw_qingdeng',{bed,actor:'npc_hw_yanzhe'}).available,false);
 assert.equal(lodgingAvailability(engine,out.document,'bld_hw_qingdeng',{bed}).available,true);
 assert.equal(lodgingAvailability(engine,out.document,'bld_hw_qingdeng',{bed,minute:contract.expires}).available,true);
 assert.equal(lodgingAvailability(engine,out.document,'bld_hw_qingdeng',{minute:contract.expires}).free,3);balanced(out.document);
 const moved=write(out.document,d=>setLocation(d,{entity:bed,at:'bld_hw_mill',mode:'place',writer:'a3-yi-test',engine})).document;
 assert.equal(lodgingAvailability(engine,moved,'bld_hw_qingdeng',{bed}).available,false);
});

test('E-I: all supported corpus connector premises load; missing examiner stays explicit',()=>{
 const numbers=[2,3,15,21,22,23,24,25,26,27,28,29,31,33,36,38,39,44,75,76,80,95,103,104];
 for(const n of numbers){const s=setup(n);assert.deepEqual(s.setupUnmet.filter(u=>/^(appointments|quotes|workstationAccess)/.test(u.item)),[],row(n).id);}
});
