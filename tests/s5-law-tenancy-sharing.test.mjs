import test from 'node:test';
import assert from 'node:assert/strict';
import {world,seed,worker,host,DAY} from './helpers/finance.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyConsentEvent,consent,requestContractConsent} from '../server-plugin/action-consent.mjs';
import {fieldRentBasis} from '../server-plugin/finance-assets.mjs';
import {contractTerms,settleCropLease} from '../server-plugin/contract-state.mjs';
import {householdBudget} from '../server-plugin/household-budget.mjs';
import {withLedger,finishLedger} from '../server-plugin/ledger.mjs';
import {obligationView} from '../server-plugin/obligation-state.mjs';
import {rollDice} from '../server-plugin/scheduler.mjs';
import {conservation,reconcile} from './helpers/ledger-audit.mjs';
import {settlementGovernment,personOffices} from '../server-plugin/entity-view.mjs';
import {granary} from '../server-plugin/stock.mjs';

const field='loc_hw_fields',farmId=`private-farm:${field}`,item='item_oats';
async function setup({out=false,collective=false,mode='share',basis='gross',payment='cash',deposit=0,days=10,dueDays=1,expiry='tenant',input='tenant',operator=out?'owner':'tenant'}={}){
 const w=structuredClone(world);
 Object.assign(w.rules.forestWater.water,{droughtYieldFloor:1,maximumCropPollutionLoss:0});
 w.rules.weather.seasonalWeights=w.rules.weather.seasonalWeights.map(()=>[1,0,0,0,0,0]);w.rules.weather.states.clear.crop=1;
 for(const r of w.rules.weather.regions)r.temperatures=[20,20,20,20];
 const p=w.rules.agriculture.settlements.find(r=>r.fieldLocation===field);
 Object.assign(p,{areaUnits:100,farmWorkers:0,workerFraction:0,processingWorkers:0,freshWorkers:0});
 // One mu = 1/15 ha: output1500/15=100, seed150/15=10.
 Object.assign(w.rules.agriculture.crop,{seedPerHa:150,growthDays:2,yieldPerHa:1500});
 w.rules.economy.priceFactorLimits.region=[1,1];w.rules.economy.priceFactorLimits.transport=[1,1];w.rules.settlementTrade.seasonFactors=[1,1,1,1];
 const e=new WorldEngine(w);e.byId.get(item).basePrice=1;
 for(const npc of [host,worker])e.byId.get(npc).schedule={default:[{start:0,end:1440,location:field,activity:'休息',services:['trade']}]};
 let doc=e.createCharacter(seed,{},'tenancy-sharing');
 const clock=await e.reduce(doc,{tool:'world_time',args:{minutes:6*DAY+480-doc.state.minute},eventId:'spring'});doc=applyPatches(doc,clock.patches);
 const signatory=collective?settlementGovernment(e,doc.state,p.settlement).head.value:worker;
 if(collective){
  assert.ok(personOffices(e,doc.state,signatory,{settlement:p.settlement,power:'public_property'}).length);
  e.byId.get(signatory).schedule={default:[{start:0,end:1440,location:p.counter,activity:'休息',services:['trade']}]};
  e.byId.get(p.manager).schedule={default:[{start:0,end:1440,location:p.counter,activity:'休息',services:['trade']}]};
 }
 const state=doc.state,npcs={...state.npcs};
 for(const npc of [host,worker])npcs[npc]={...npcs[npc],location:field,status:'正常',activity:'休息',coins:5000,inventory:{[item]:{quantity:30}},occupation:npc===worker?'农夫':npcs[npc].occupation};
 if(collective){npcs[signatory]={...npcs[signatory],location:p.counter,status:'正常',activity:'休息'};npcs[p.manager]={...npcs[p.manager],location:p.counter,status:'正常',activity:'休息'};}
 const prepared=applyIntentSetup(e,doc,{location:collective?p.counter:field,coins:3000,inventory:{[item]:30,item_bread:20,item_hoe:1,item_sickle:1},facts:[
  {path:['state','buildings'],value:{...state.buildings,[field]:{condition:100,owner:collective?p.settlement:out?'player':worker}}},
  {path:['state','npcs'],value:npcs}
 ]});assert.deepEqual(prepared.setupUnmet,[]);doc=prepared.document;
 const f={e,w,get doc(){return doc;},set doc(v){doc=v;},async act(action,slots,id){const r=await e.reduce(doc,{tool:'world_act',args:{action,slots},eventId:id});doc=applyPatches(doc,r.patches);return r.result;}};
 const now=doc.state.minute,due=now+dueDays*DAY;
 const t={rentMode:mode,inputPayer:input,unharvestedCrops:expiry,farmOperator:operator};
 if(input==='shared')Object.assign(t,{ownerInputNumerator:1,ownerInputDenominator:2});
 const signing=fieldRentBasis(e.primitiveDraft(doc),e,field,{areaMu:1,seedItem:item});
 const terms={days,location:field,quantity:1,item,prepayment:deposit,deadline:due,...t};
 if(mode==='share')Object.assign(terms,{outputBasis:basis,rentPayment:payment,shareNumerator:3,shareDenominator:10,
  cropPriceNumerator:signing.quoteBasis.unitPrice.numerator,cropPriceDenominator:signing.quoteBasis.unitPrice.denominator,
  seedPriceNumerator:signing.quoteBasis.unitPrice.numerator,seedPriceDenominator:signing.quoteBasis.unitPrice.denominator});
 else terms.amount=30;
 if(mode==='share'&&basis==='net')terms.netInputs='consumed-seed';
 const d=e.primitiveDraft(doc);applyConsentEvent(d,{engine:e,document:d.document},{actor:signatory,eventId:'exact-lease-consent',verb:'consent_given',to:'player',payload:{scope:'rent',subject:field,purpose:[field],terms,until:now+10}});doc=applyPatches(doc,d.patches);
 f.before=structuredClone(doc);f.terms=terms;
 const slots={location:field,quantity:1,item,days,deadline:due,...t,...(out?{seller:worker}:{}),...(mode==='share'?{outputBasis:basis,rentPayment:payment,shareNumerator:3,shareDenominator:10,...(payment==='cash'?{deposit}:{rentAdvance:deposit})}:{coins:30,deposit})};
 f.lease=await f.act(out?'trade.rent_out':'trade.rent_in',slots,'sign');assert.ok(f.lease.contract,JSON.stringify(f.lease));f.out=out;f.publicProfile=collective?p:null;return f;
}
async function sow(f){if(f.publicProfile&&f.doc.state.location!==field)await f.act('move',{destination:field},'to-public-field');return f.act('farm.private_sow',{location:field,areaMu:1,item,...(f.out?{contract:f.lease.contract}:{})},'sow');}
async function ripe(f,{loss=false}={}){
 if(loss){f.w.rules.weather.seasonalWeights=f.w.rules.weather.seasonalWeights.map(()=>[0,0,1,0,0,0]);f.w.rules.weather.states.rain.crop=.4;}
 await f.act('time',{minutes:3*DAY},'grow');return f.doc.state.records[farmId];
}
async function cut(f,id){return f.act('farm.private_harvest',{location:field,...(f.out?{contract:f.lease.contract}:{})},id);}
async function all(f){
 const cuts=[];
 for(let i=0;i<f.doc.state.records[farmId].yield&&f.doc.state.records[farmId].status==='ready';i++){
  const r=await cut(f,`harvest-${i}`);assert.ok(r.harvested>0);cuts.push(r);
  if(r.remaining&&(!f.out||f.terms.rentPayment==='kind')){
   const d=f.e.primitiveDraft(f.doc),received=f.out?(f.doc.state.obligations[r.rent.debt]?.paid??0):r.harvested;
   const quantity=Math.min(received,f.e.quantity(d,'player',item));
   if(quantity)await f.act('trade.sell_to',{buyer:host,item,quantity},`sell-${i}`);
  }
 }
 assert.equal(f.doc.state.records[farmId].status,'harvested');return cuts;
}
const claims=f=>Object.values(f.doc.state.obligations).filter(r=>r.contract===f.lease.contract&&r.debtor===(f.out?worker:'player'));
function balanced(f){assert.deepEqual(reconcile(f.e,f.doc).mismatches,[]);assert.deepEqual(conservation(f.e,f.before,f.doc),[]);}

test('毛产：实际100分30，灾歉实际40分12；两向同意与实际收割、账本一致',async()=>{
 // 100*3/10=30; same signed ratio, real rain multiplier2/5 =>40*3/10=12.
 for(const out of [false,true])for(const loss of [false,true]){
  const f=await setup({out});await sow(f);const farm=await ripe(f,{loss});assert.equal(farm.yield,loss?40:100);
  await all(f);const row=f.doc.state.records[f.lease.contract];assert.equal(row.shareAssessed,loss?12:30);
  assert.equal(claims(f).reduce((n,r)=>n+r.amount,0),loss?12:30);assert.equal(claims(f).reduce((n,r)=>n+r.paid,0),loss?12:30);
  assert.equal(row.consentEvent,'exact-lease-consent');balanced(f);
 }
});

test('定额30不随实际减产40倒改，未到期尾款保持原债务',async()=>{
 // One30-day fixed period costs30; partial advance5 leaves25, even at40 output.
 const f=await setup({mode:'fixed',days:30,dueDays:20,deposit:5});await sow(f);assert.equal((await ripe(f,{loss:true})).yield,40);await all(f);
 assert.equal(contractTerms(f.doc.state.records[f.lease.contract]).monthlyRent,30);
 assert.deepEqual(claims(f).map(r=>[r.amount,r.paid]),[[25,0]]);assert.equal(f.doc.state.records[f.lease.debt].defaulted,undefined);balanced(f);
});

test('净产共担：真实种粮10只消耗一次，100减10按三成付27',async()=>{
 // Both supply5; the single10-input bill gives(100-10)*3/10=27, not24 or30.
 for(const out of [false,true]){
 const f=await setup({out,basis:'net',input:'shared'}),d=f.e.primitiveDraft(f.doc),a=f.e.quantity(d,'player',item),b=f.e.quantity(d,worker,item);
 for(const payer of ['player',worker])assert.equal(householdBudget(d,f.e,payer,{kernel:true}).resources.rows.find(r=>r.holder===payer&&r.item===item).seedTarget,5,'each payer reserves its own five seeds');
 const planted=await sow(f);assert.deepEqual(planted.farm.inputs.map(r=>[r.payer,r.quantity]),out?[[worker,5],['player',5]]:[['player',5],[worker,5]]);
 assert.equal(f.e.quantity(f.e.primitiveDraft(f.doc),'player',item),a-5);assert.equal(f.e.quantity(f.e.primitiveDraft(f.doc),worker,item),b-5);
 await ripe(f);await all(f);assert.equal(f.doc.state.records[f.lease.contract].shareAssessed,27);assert.equal(claims(f).reduce((n,r)=>n+r.paid,0),27);balanced(f);
 }
});

test('先付5抵扣一次，分批收割累计30、尾款合计25；收割重放不再收粮收租',async()=>{
 // Across several carrying trips: sum incremental floor(q*3/10)=30;30-5=25.
 const f=await setup({deposit:5});assert.equal(claims(f).length,0,'no speculative debt at signing');await sow(f);await ripe(f);
 const first=await cut(f,'first');assert.ok(first.remaining>0);const before=structuredClone(f.doc);
 const replay=await cut(f,'first');
 // The action envelope adds duplicate:true and omits newly-signed claims;
 // replay must preserve the physical/rental result and every settled account.
 assert.equal(replay.harvested,first.harvested);assert.deepEqual(replay.rent,first.rent);
 assert.deepEqual(f.doc.state.records[farmId],before.state.records[farmId]);assert.deepEqual(f.doc.state.inventory,before.state.inventory);assert.deepEqual(f.doc.state.obligations,before.state.obligations);
 // Replaying the production-to-rent adapter itself cannot issue a second claim.
 const books=withLedger(f.e,f.doc),d=f.e.primitiveDraft(books.document);settleCropLease(d,f.e,d.get('state','records',farmId),'first');
 f.doc=applyPatches(f.doc,finishLedger(d.patches,books.opening));assert.deepEqual(f.doc.state.obligations,before.state.obligations);
 // Free the actual pack through a real sale, then finish the remaining crop.
 await f.act('trade.sell_to',{buyer:host,item,quantity:first.harvested},'sell-first');
 f.doc=JSON.parse(JSON.stringify(f.doc));await all(f);
 assert.equal(f.doc.state.records[f.lease.contract].shareAssessed,30);assert.equal(claims(f).reduce((n,r)=>n+r.amount,0),25);assert.equal(claims(f).reduce((n,r)=>n+r.paid,0),25);balanced(f);
});

test('实物分成按作物份数，先付5后剩25，不按现价重算',async()=>{
 // Physical100*3/10=30 portions, five already delivered leaves25 portions.
 for(const out of [false,true]){
 const f=await setup({out,payment:'kind',deposit:5});await sow(f);await ripe(f);f.e.byId.get(item).basePrice=7;await all(f);
 assert.equal(f.doc.state.records[f.lease.contract].shareAssessed,30);assert.equal(claims(f).reduce((n,r)=>n+r.amount,0),25);
 assert.ok(claims(f).every(r=>r.resource===item));assert.equal(claims(f).reduce((n,r)=>n+r.paid,0),25);balanced(f);
 }
});

test('跨到期保留原作物、收割窗口与分成义务；提前退租不偷走投入',async()=>{
 // A one-day lease ends before the two-day crop; original crop still yields100/30.
 for(const early of [false,true]){
  const f=await setup({days:early?10:1,dueDays:1,expiry:early?'owner':'tenant'});await sow(f);
  if(early)await f.act('trade.dismiss',{contract:f.lease.contract,seller:worker},'vacate');
  const farm=await ripe(f);assert.equal(farm.owner,'player');assert.equal(farm.cropDisposition.policy,'tenant');assert.ok(farm.cropDisposition.source);
  const beforeAttempt=structuredClone(f.doc);
  await assert.rejects(f.e.reduce(f.doc,{tool:'world_farm',args:{operation:'private_sow',location:field,areaMu:1,item},eventId:'not-renewed'}),/合法持有|未收作物/);
  assert.deepEqual(f.doc,beforeAttempt);
  await all(f);assert.equal(f.doc.state.records[f.lease.contract].shareAssessed,30);balanced(f);
 }
});

test('家户只预留未结算分成，现金与风险收成分开，双方预算对称',async()=>{
 //100 future portions minus30 kind rent leaves70; landlord30 remains risky.
 const f=await setup({payment:'kind',dueDays:9});await sow(f);await ripe(f);
 const d=f.e.primitiveDraft(f.doc),tenant=householdBudget(d,f.e,'player',{kernel:true}),owner=householdBudget(d,f.e,worker,{kernel:true});
 assert.equal(tenant.future.find(r=>r.source==='harvest').amount,70);assert.equal(owner.future.find(r=>r.source==='harvest-rent').amount,30);
 assert.equal(owner.future.find(r=>r.source==='harvest-rent').reliable,false);
 assert.equal(householdBudget(d,f.e,'player').future.find(r=>r.source==='harvest').amount,70,'own observed crop uses known signed sharing terms');
 const move=f.e.primitiveDraft(f.doc);move.set(['state','npcs',worker,'location'],'bld_hw_post');f.doc=applyPatches(f.doc,move.patches);
 assert.equal(householdBudget(f.e.primitiveDraft(f.doc),f.e,worker).future.some(r=>r.source==='harvest-rent'),false,'a remote observer does not read the field account');balanced(f);
});

test('旧金额同意不能授予新的分成、投入或作物处分条款',async()=>{
 // Same amount/days cannot turn fixed30 into a3/10 output claim or seize seed investment.
 const f=await setup();const d=f.e.primitiveDraft(f.doc),now=f.doc.state.minute;
 assert.equal(consent({engine:f.e,document:d.document},worker,'player','rent',{subject:field,purpose:field,terms:{...f.terms,shareNumerator:6,shareDenominator:20,cropPriceNumerator:1,cropPriceDenominator:1,seedPriceNumerator:1,seedPriceDenominator:1},until:now}).allowed,true,'equivalent rational clauses keep their actual consent');
 applyConsentEvent(d,{engine:f.e,document:d.document},{actor:worker,eventId:'old-amount-only',verb:'consent_given',to:'player',payload:{scope:'rent',subject:field,terms:{days:10,location:field},until:now+10}});
 const context={engine:f.e,document:d.document};
 // Revoke the precise newer agreement, so only the old amount-only grant remains.
 applyConsentEvent(d,context,{actor:worker,eventId:'revoke-exact',verb:'consent_revoked',to:'player',payload:{consent:'exact-lease-consent'}});
 assert.equal(consent({engine:f.e,document:d.document},worker,'player','rent',{subject:field,purpose:field,terms:f.terms,until:now}).allowed,false);
 applyConsentEvent(d,{engine:f.e,document:d.document},{actor:worker,eventId:'old-broad-rent',verb:'consent_given',to:'player',payload:{scope:'rent',subject:field,until:now+10}});
 const request=requestContractConsent(d,f.e,{from:worker,scope:'rent',subject:field,terms:f.terms,cost:{value:1000000},reward:0,eventId:'no-substitution'});
 assert.equal(request.allowed,false,'even a broad old rent permission cannot replace agreement to new disposal/input clauses');
});

test('债权人真实减免只消灭已赚取那一笔，后来收成不复开旧债',async()=>{
 // First carrying trip q earns floor(q*3/10); waiver cancels exactly that
 // earned amount. Remaining crop owes30-floor(q*3/10), not another30.
 const f=await setup({out:true,dueDays:9});await sow(f);await ripe(f);const first=await cut(f,'first-waived');assert.ok(first.remaining>0);
 const claim=first.rent.debt;assert.ok(claim);const waived=claims(f).find(r=>r.id===claim).amount;
 await f.act('open:waive_debt',{obligation:claim},'actual-waiver');
 const row=f.doc.state.obligations[claim];assert.equal(obligationView(f.doc.state,row).owed,0);assert.ok(row.waiver?.eventId);
 await all(f);assert.equal(f.doc.state.records[f.lease.contract].shareAssessed,30);
 assert.equal(claims(f).reduce((n,r)=>n+obligationView(f.doc.state,r).owed,0),30-waived);balanced(f);
});

test('风险偏好按稳定主体种子抽取，读档和查询不改变已同意的比例',async()=>{
 // Preference weights1:2:1 use four seeded tickets, never modify100*3/10.
 const f=await setup(),row=f.doc.state.records[f.lease.contract],saved=structuredClone(row.choiceBasis);
 assert.equal(saved.roll,rollDice(f.doc.randomSeed,'tenancy:preference',worker,0,0,4));
 assert.ok([500,1000,1500].includes(saved.riskPermille));
 f.doc=JSON.parse(JSON.stringify(f.doc));fieldRentBasis(f.e.primitiveDraft(f.doc),f.e,field,{areaMu:1});
 assert.deepEqual(f.doc.state.records[f.lease.contract].choiceBasis,saved);assert.equal(contractTerms(f.doc.state.records[f.lease.contract]).tenancy.shareNumerator,3);
});

test('先付超过实际应付的部分形成真实退款债权，收取时才入账',async()=>{
 // Advance50 against actual100*3/10=30: landlord owes20 back, not a gift.
 const f=await setup({deposit:50});await sow(f);await ripe(f);await all(f);assert.equal(claims(f).length,0);
 await f.act('time',{minutes:f.lease.deadline-f.doc.state.minute+1},'end-season');
 const refund=f.doc.state.records[f.lease.contract].advanceRefund;assert.equal(refund.amount,20);
 const claim=f.doc.state.obligations[refund.claim];assert.equal(claim.debtor,worker);assert.equal(claim.creditor,'player');assert.equal(claim.amount,20);assert.equal(claim.paid,0);
 assert.ok(f.doc.state.records[`world_event:${refund.source}`]);
 const before=f.doc.state.player.coins,other=f.doc.state.npcs[worker].coins;
 const paid=await f.e.reduce(f.doc,{tool:'world_trade',args:{operation:'collect',seller:worker,debt:refund.claim,consent:true},eventId:'refund-collected'});f.doc=applyPatches(f.doc,paid.patches);
 assert.equal(f.doc.state.player.coins,before+20);assert.equal(f.doc.state.npcs[worker].coins,other-20);balanced(f);
});

test('出租人不在场时只形成实收产出的债务，不能隔空收租',async()=>{
 // q physically harvested =>floor(q*3/10) owed, zero paid while owner is away.
 const f=await setup();await sow(f);await ripe(f);
 const post='bld_hw_post',d=f.e.primitiveDraft(f.doc);d.set(['state','npcs',worker,'location'],post);f.doc=applyPatches(f.doc,d.patches);
 f.e.byId.get(worker).schedule={default:[{start:0,end:1440,location:post,activity:'休息',services:['trade']}]};
 const before=f.doc.state.npcs[worker].coins,out=await cut(f,'absent-owner'),claim=f.doc.state.obligations[out.rent.debt];
 assert.equal(claim.amount,Math.floor(out.harvested*3/10));assert.equal(claim.paid,0);assert.equal(f.doc.state.records[claim.id].unpresented,true);
 assert.equal(f.doc.state.npcs[worker].coins,before);balanced(f);
});

test('代耕播种中途到期不生成承租人的新作物，不消耗尚未投入的种粮',async()=>{
 // Only60 lease minutes remain, but sowing needs240: no fresh planting right
 // after expiry, even though the working player still owns the ground.
 const f=await setup({out:true,days:1,dueDays:1});await f.act('time',{minutes:23*60},'late-start');
 const before=f.e.quantity(f.e.primitiveDraft(f.doc),worker,item),out=await sow(f);
 assert.equal(out.success,false);assert.equal(f.doc.state.records[farmId],undefined);
 assert.equal(f.e.quantity(f.e.primitiveDraft(f.doc),worker,item),before);assert.equal(f.doc.state.records[f.lease.contract].status,'已到期');balanced(f);
});

test('公共田实物分成：分次实收100交30、灾歉40交12，真实入公仓且重放不重复',async()=>{
 // Each trip owes floor(cumulative harvest*3/10)-previous assessment;
 // public stock rises by exactly the delivered units, never a second bag.
 for(const [loss,deposit] of [[false,0],[true,0],[false,5]]){
  const f=await setup({collective:true,payment:'kind',days:20,deposit}),p=f.publicProfile;
  assert.equal(f.doc.state.records[f.lease.contract].owner,p.settlement);
  await sow(f);await ripe(f,{loss});let delivered=0;
  for(let i=0;i<f.doc.state.records[farmId].yield&&f.doc.state.records[farmId].status==='ready';i++){
   const cutResult=await cut(f,`public-cut-${i}`),claim=f.doc.state.obligations[cutResult.rent.debt];
   assert.equal(claim.paid,0,'harvesting at the field does not teleport grain to the public warehouse');
   const harvestState=structuredClone(f.doc);
   await cut(f,`public-cut-${i}`);
   assert.deepEqual(f.doc.state.obligations,harvestState.state.obligations);
   await f.act('move',{destination:p.counter},`to-public-warehouse-${i}`);
   const before=structuredClone(f.doc),food=before.state.settlements[p.settlement].food;
   const bagBefore=f.e.quantity(f.e.primitiveDraft(f.doc),'player',item);
   await f.act('promise.settle',{obligation:claim.id,coins:claim.amount},`public-pay-${i}`);
   assert.equal(f.doc.state.obligations[claim.id].paid,claim.amount);
   assert.equal(f.doc.state.settlements[p.settlement].food,food+claim.amount);
   assert.equal(f.e.quantity(f.e.primitiveDraft(f.doc),'player',item),bagBefore-claim.amount);
   const batches=f.doc.state.records[`agriculture:${p.settlement}`].batches.filter(b=>b.id.startsWith('rent:'));
   assert.equal(batches.reduce((n,b)=>n+b.amount,0),deposit+delivered+claim.amount);
   const account=granary(f.e,p.settlement);
   assert.equal(f.doc.ledger.accounts[account],before.ledger.accounts[account]+claim.amount);
   assert.equal(f.doc.state.npcs[p.settlement],undefined,'a settlement never gets a fictitious creature bag');
   assert.equal(f.doc.state.creatures?.[p.settlement],undefined);
   assert.deepEqual(reconcile(f.e,f.doc).mismatches,[]);
   assert.deepEqual(conservation(f.e,before,f.doc),[]);
   const receiptState=structuredClone(f.doc);
   await f.act('promise.settle',{obligation:claim.id,coins:claim.amount},`public-pay-${i}`);
   assert.deepEqual(f.doc.state.settlements,receiptState.state.settlements);
   assert.deepEqual(f.doc.state.records[`agriculture:${p.settlement}`],receiptState.state.records[`agriculture:${p.settlement}`]);
   assert.deepEqual(f.doc.state.inventory,receiptState.state.inventory);
   assert.deepEqual(f.doc.state.obligations,receiptState.state.obligations);
   delivered+=claim.amount;
   await f.act('move',{destination:field},`back-to-field-${i}`);
   if(cutResult.remaining){const qty=f.e.quantity(f.e.primitiveDraft(f.doc),'player',item);if(qty)await f.act('trade.sell_to',{buyer:host,item,quantity:qty},`public-unload-${i}`);}
  }
  assert.equal(f.doc.state.records[farmId].status,'harvested');
  assert.equal(delivered,(loss?12:30)-deposit);
  assert.equal(f.doc.state.records[f.lease.contract].shareAssessed,loss?12:30);
  balanced(f);
 }
});

test('公共实物租债不在柜台、管理员不在场或仓满时拒收，债额和粮食都保留',async()=>{
 // First real harvest q owes floor(q*3/10); every refused receipt transfers0.
 const f=await setup({collective:true,payment:'kind'}),p=f.publicProfile;
 await sow(f);await ripe(f);const harvested=await cut(f,'public-failure-cut'),claim=f.doc.state.obligations[harvested.rent.debt];
 const pay=id=>f.act('promise.settle',{obligation:claim.id,coins:claim.amount},id);
 const refused=async(id,pattern)=>{const result=await pay(id);assert.equal(result.ok,false,JSON.stringify(result));assert.match(result.receipt.reason,pattern);};
 let before=structuredClone(f.doc);await refused('public-wrong-place',/柜台|counter|仓|warehouse/);assert.deepEqual(f.doc,before);
 await f.act('move',{destination:p.counter},'public-delivery-place');
 let d=f.e.primitiveDraft(f.doc);d.set(['state','npcs',p.manager,'location'],field);f.doc=applyPatches(f.doc,d.patches);
 before=structuredClone(f.doc);await refused('public-no-manager',/柜台|counter|仓|warehouse/);assert.deepEqual(f.doc,before);
 d=f.e.primitiveDraft(f.doc);d.set(['state','npcs',p.manager,'location'],p.counter);
 const row=f.doc.state.records[`agriculture:${p.settlement}`],capacity=row.granary.capacity;
 d.set(['state','records',`agriculture:${p.settlement}`,'granary','capacity'],f.doc.state.settlements[p.settlement].food+row.field.seedBank);
 f.doc=applyPatches(f.doc,d.patches);before=structuredClone(f.doc);
 await refused('public-full-warehouse',/space/);assert.deepEqual(f.doc,before);
 d=f.e.primitiveDraft(f.doc);d.set(['state','records',`agriculture:${p.settlement}`,'granary','capacity'],capacity);f.doc=applyPatches(f.doc,d.patches);
 const food=f.doc.state.settlements[p.settlement].food;
 await pay('public-received-after-room');assert.equal(f.doc.state.settlements[p.settlement].food,food+claim.amount);
 assert.equal(f.doc.state.obligations[claim.id].paid,claim.amount);balanced(f);
});
