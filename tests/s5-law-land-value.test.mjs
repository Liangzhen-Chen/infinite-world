import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,worker,DAY} from './helpers/finance.mjs';
import {fieldRentBasis} from '../server-plugin/finance-assets.mjs';
import {valuation,holdingValuation} from '../server-plugin/valuation.mjs';
import {contractTerms} from '../server-plugin/contract-state.mjs';
import {applyConsentEvent} from '../server-plugin/action-consent.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {withLedger} from '../server-plugin/ledger.mjs';
import {loadDerivedRegistry} from '../server-plugin/derived.mjs';
import {conservation,reconcile} from './helpers/ledger-audit.mjs';

const field='loc_hw_fields',mill='bld_hw_mill',council='bld_hw_council';
function land({out=false}={}){
 const f=fixture({at:out?field:council});
 // Existing field, three mu (20 hundredths ha), 1800/15=120 portions/mu.
 // Hold scarcity at one and remove the oats transport premium: local quote3.
 f.e.rules.agriculture.settlements.find(p=>p.fieldLocation===field).areaUnits=20;
 f.e.rules.agriculture.crop.yieldPerHa=1800;
 f.e.rules.economy.priceFactorLimits.region=[1,1];
 f.e.rules.settlementTrade.item='item_wheat_grain';
 f.e.byId.get('item_oats').basePrice=3;
 f.e.rules.economy.loanMonthlyInterest=[.01,.01];
 if(out){f.doc.state.buildings[field]={owner:'player',condition:100};f.doc.state.npcs[worker].occupation='农夫';}
 f.doc=withLedger(f.e,f.doc).document;
 return f;
}
function grant(f,from,terms,id){
 // K07 / 05 §5.1.1: the exception still needs exact consent; amount-only
 // legacy permission cannot also grant disposal of the tenant's future crop.
 terms={rentMode:'fixed',inputPayer:'tenant',unharvestedCrops:'owner',farmOperator:'tenant',...terms};
 const d=f.e.primitiveDraft(f.doc);
 applyConsentEvent(d,{engine:f.e,document:d.document},{actor:from,eventId:id,verb:'consent_given',to:'player',payload:{scope:'rent',subject:field,purpose:[field],terms,until:f.doc.state.minute+10}});
 f.doc=applyPatches(f.doc,d.patches);
}
function balanced(f,before){
 assert.deepEqual(conservation(f.e,before,f.doc),[]);
 assert.deepEqual(reconcile(f.e,f.doc).mismatches,[]);
}

test('K01 手算田租、来源时点与当前土地估值独立于建筑完好度',()=>{
 const f=land(),d=f.draft(),two=fieldRentBasis(d,f.e,field,{areaMu:2});
 // 2*120*3*3/10=216/year; /12=18/month; one mu gives9.
 assert.equal(two.monthlyAnchor,18);assert.equal(fieldRentBasis(d,f.e,field,{areaMu:1}).monthlyAnchor,9);
 assert.deepEqual(two.annualYield,{numerator:240000000,denominator:1000000});
 assert.deepEqual(two.quoteBasis.unitPrice,{numerator:3000000,denominator:1000000});
 assert.equal(two.quoteBasis.minute,600);assert.equal(two.yieldBasis.minute,600);
 assert.equal(two.quoteBasis.location,field);assert.equal(two.quoteBasis.source,'marketQuote');
 assert.equal(two.yieldBasis.source,'rules.agriculture.crop.yieldPerHa');
 assert.deepEqual(two.share,{numerator:3,denominator:10});assert.match(two.shareCalibration,/待标定/);
 // K01 review / 05 §5.1.1: capitalize only the land's3/10 share,
 // excluding labor/input return. Three mu:3*120*3*3/10/12/.01=2700.
 for(const condition of [0,30,100])assert.equal(valuation(d,f.e,{role:'property',subject:field,condition}).value,2700);
 // Actual productivity halves:3*60*3*3/10/12/.01=1350.
 f.e.rules.agriculture.crop.yieldPerHa=900;
 assert.equal(valuation(d,f.e,{role:'property',subject:field}).value,1350);
 // This building's registered use has the140/month service anchor:
 // 140/.01*.3=4200, and intact140/.01=14000.
 f.doc.state.buildings[mill]={owner:'player',condition:30};
 assert.equal(valuation(d,f.e,{role:'property',subject:mill}).value,4200);
 assert.equal(valuation(d,f.e,{role:'property',subject:mill,condition:100}).value,14000);
});

test('K01 租入快照和同版读档冻结，现价翻倍只改变新约与新估值',async()=>{
 const f=land(),before=structuredClone(f.doc);
 const old=await f.act({operation:'rent_in',location:field,quantity:2,days:30},'old-land');
 assert.equal(old.rent,18);assert.equal(old.paid,18);balanced(f,before);
 const signed=structuredClone(f.doc.state.records[old.contract].clauses);
 assert.equal(signed.unharvestedCrops,'到期后未收作物留田归田主');
 f.doc=JSON.parse(JSON.stringify(f.doc));
 f.e.byId.get('item_oats').basePrice=6;
 // Review: today's ground rent is54/month for three mu, capital value5400;
 // the two-mu lease pays18 instead of36 for one month:5400-18=5382.
 assert.equal(holdingValuation(f.draft(),f.e,{kind:'owns',subject:field,holder:'loc_hw'}).value,5382);
 // The tenant's signing-market rent18 equals its contract18. Current quotes
 // do not rewrite that historical benchmark or count the tenant's labor.
 assert.equal(holdingValuation(f.draft(),f.e,{kind:'leases',subject:field,holder:'player',terms:{contract:old.contract}}).value,0);
 assert.deepEqual(f.doc.state.records[old.contract].clauses,signed);
 assert.equal(contractTerms(f.doc.state.records[old.contract]).monthlyRent,18);
 assert.equal(fieldRentBasis(f.draft(),f.e,field,{areaMu:2}).monthlyAnchor,36);
 await f.act({operation:'dismiss',contract:old.contract},'end-old');
 const fresh=await f.act({operation:'rent_in',location:field,quantity:2,days:30},'new-land');
 assert.equal(fresh.rent,36);assert.equal(fresh.rentBasis.quoteBasis.unitPrice.numerator,6000000);
 assert.deepEqual(f.doc.state.records[old.contract].clauses,signed);
});

test('K01 市价出租不改变地租资本化价值，承租权不计劳力回报',async()=>{
 const f=land({out:true}),before=structuredClone(f.doc);
 const lease=await f.act({operation:'rent_out',location:field,seller:worker,quantity:2,days:30,consent:true},'let-land');
 // Review:3*120*3*3/10/12=27/month, / .01=2700. The leased two
 // mu's18 is replaced by the same18, with no artificial70% price collapse.
 assert.equal(valuation(f.draft(),f.e,{role:'property',subject:field}).value,2700);
 assert.equal(holdingValuation(f.draft(),f.e,{kind:'owns',holder:'player',subject:field,terms:{share:.5}}).value,1350);
 // (Signing market18 - contract18)*one month=0, not labor profit42.
 assert.equal(holdingValuation(f.draft(),f.e,{kind:'leases',holder:worker,subject:field,terms:{contract:lease.contract}}).value,0);
 assert.equal(holdingValuation(f.draft(),f.e,{kind:'leases',holder:'player',subject:field,terms:{contract:lease.contract}}).value,null);
 f.doc.state.minute+=30*DAY;
 assert.equal(holdingValuation(f.draft(),f.e,{kind:'leases',holder:worker,subject:field,terms:{contract:lease.contract}}).value,null);
 balanced(f,before);
});

test('K01 地块生产修正同时改变租金依据与土地现值，不借用建筑 condition',()=>{
 const f=land();
 // A field-specific production factor1/2: annual360 ->180 portions;
 // Review: ground rent27 ->13.5/month (offer anchor ceil13.5=14);
 // title2700 ->1350. Valuation does not round each monthly income upward.
 f.w.derived.modifiers.push({id:'k01-field-productivity',pack:'core',target:'economy:yield',stage:'mul',value:.5,when:"subject == 'loc_hw_fields'"});
 loadDerivedRegistry(f.w);
 const d=f.draft(),basis=fieldRentBasis(d,f.e,field);
 assert.equal(basis.annualYield.numerator/basis.annualYield.denominator,180);
 assert.equal(basis.monthlyAnchor,14);
 assert.equal(valuation(d,f.e,{role:'property',subject:field,condition:100}).value,1350);
 assert.equal(valuation(d,f.e,{role:'property',subject:field,condition:0}).value,1350);
});

test('K01 部分田地租种不同作物，不改变业主余田的地租份额',async()=>{
 const f=land({out:true});
 // Wheat's physical rule is150 jin/mu*.5kg/portion weight, independent of oats.
 // Review: unleased ground rent is120*3*3/10/12=9/month. The baseline
 // title is2700; replace only one month's two-mu market18 with actual rent.
 const lease=await f.act({operation:'rent_out',location:field,seller:worker,quantity:2,item:'item_wheat_seed',days:30,consent:true},'wheat-lease');
 assert.equal(valuation(f.draft(),f.e,{role:'property',subject:field}).value,Math.floor(2700+lease.rent-18));
});

test('K01 两亩田市价出租价值不变，优惠租约的双方权利价值合计守恒',async()=>{
 for(const [rent,days] of [[18,30],[9,30],[9,360]]){
  const f=land({out:true});
  f.e.rules.agriculture.settlements.find(p=>p.fieldLocation===field).areaUnits=2/15*100;
  const before=structuredClone(f.doc),self=valuation(f.draft(),f.e,{role:'property',subject:field}).value;
  // 2*120*3*3/10=216/year ->18/month ->1800 at monthly rate1/100.
  // A one-month discount18-9=9 transfers9 of value: owner1791+tenant9=1800.
  // The owner's right after expiry is preserved, not discounted forever.
  assert.equal(self,1800);
  const lease=await f.act({operation:'rent_out',location:field,seller:worker,quantity:2,coins:rent,days,consent:true},`rent-split-${rent}-${days}`);
  const owner=()=>holdingValuation(f.draft(),f.e,{kind:'owns',holder:'player',subject:field}).value;
  const tenant=()=>holdingValuation(f.draft(),f.e,{kind:'leases',holder:worker,subject:field,terms:{contract:lease.contract}}).value;
  const advantage=(18-rent)*days/30;
  assert.equal(owner(),1800-advantage);assert.equal(tenant(),advantage);
  assert.equal(owner()+tenant(),self);
  // A full year at9 transfers108; halfway through a one-month lease,
  // its4.5-copper advantage is allocated once as4, so1796+4=1800.
  f.doc.state.minute+=days/2*DAY;
  assert.equal(owner(),1800-Math.floor(advantage/2));assert.equal(tenant(),Math.floor(advantage/2));
  assert.equal(owner()+tenant(),self);
  // Signing basis survives reload and later local quotes. It contains no
  // implicit claim on the cultivator's full60/month production revenue.
  f.doc=JSON.parse(JSON.stringify(f.doc));f.e.byId.get('item_oats').basePrice=6;
  assert.equal(tenant(),Math.floor(advantage/2));
  delete f.e.byId.get('item_oats').basePrice;
  assert.equal(tenant(),Math.floor(advantage/2),'the saved signing benchmark needs no new quote');
  balanced(f,before);
 }
});

test('K01 租出允许真实同意的延期和部分先付，尾款形成对称 rent 义务',async()=>{
 for(const deposit of [0,5]){
 const f=land({out:true}),before=structuredClone(f.doc),due=600+35*DAY;
 // Monthly18, zero/five now leaves18/13; the final ten days add6.
 // The player is the landlord choosing this exact deferred offer.
 const lease=await f.act({operation:'rent_out',location:field,seller:worker,quantity:2,days:40,deadline:due,deposit,consent:true},`deferred-out-${deposit}`);
 assert.equal(lease.paid,deposit);assert.equal(lease.rentDueAt,due);
 const claim=f.doc.state.obligations[lease.debt];
 assert.equal(claim.debtor,worker);assert.equal(claim.creditor,'player');assert.equal(claim.amount,18-deposit);assert.equal(claim.dueAt,due);
 assert.equal(before.state.npcs[worker].coins-f.doc.state.npcs[worker].coins,deposit);
 assert.equal(f.doc.state.player.coins-before.state.player.coins,deposit);
 assert.equal(f.doc.state.records[lease.contract].clauses.prepayment,deposit);
 assert.equal(f.doc.state.records[lease.debt].defaulted,undefined);balanced(f,before);
 f.tick(600+31*DAY);
 const claims=Object.values(f.doc.state.obligations).filter(o=>o.contract===lease.contract);
 assert.deepEqual(claims.map(o=>o.amount).sort((a,b)=>a-b),[6,18-deposit]);
 for(const claim of claims)assert.equal(claim.dueAt,due);
 assert.equal(before.state.npcs[worker].coins-f.doc.state.npcs[worker].coins,deposit,'no automatic payment before the agreed date');
 assert.equal(f.doc.state.records[lease.debt].defaulted,undefined);balanced(f,before);
 }
});

test('K01 普通开价带不能否决双方有效同意的例外价，调用者不能替 NPC 同意',async()=>{
 const f=land(),before=structuredClone(f.doc);
 // Two-mu anchor18; one copper is below the former .8 floor, but not consent.
 await assert.rejects(f.act({operation:'rent_in',location:field,quantity:2,coins:1,days:30,consent:true},'cheap-denied'),/未同意/);
 assert.deepEqual(f.doc,before);
 grant(f,'npc_hw_chenbai',{amount:1,days:30,location:field,prepayment:1,quantity:2,item:'item_oats'},'owner-exception');
 const cheap=await f.act({operation:'rent_in',location:field,quantity:2,coins:1,days:30},'cheap-agreed');
 assert.equal(cheap.paid,1);assert.equal(cheap.consent,'owner-exception');balanced(f,before);
 const out=land({out:true}),opening=structuredClone(out.doc);
 // Twice the18 anchor exceeds the former1.5 ceiling; tenant must really agree.
 await assert.rejects(out.act({operation:'rent_out',location:field,seller:worker,quantity:2,coins:36,consent:true},'dear-denied'),/承租人未同意/);
 assert.deepEqual(out.doc,opening);
 grant(out,worker,{amount:36,days:30,location:field,prepayment:36,quantity:2,item:'item_oats'},'tenant-exception');
 const dear=await out.act({operation:'rent_out',location:field,seller:worker,quantity:2,coins:36,consent:true},'dear-agreed');
 assert.equal(dear.paid,36);assert.equal(dear.consent,'tenant-exception');balanced(out,opening);
});

test('K01 缺报价或产量时估值与签约都给出缺依据，且存档不变',async()=>{
 // A missing price/yield cannot be replaced with the unrelated140/month rent.
 for(const missing of ['quote','yield']){
  const f=land();
  if(missing==='quote')delete f.e.byId.get('item_oats').basePrice;
  else delete f.e.rules.agriculture.crop.yieldPerHa;
  const before=structuredClone(f.doc);
  assert.throws(()=>fieldRentBasis(f.draft(),f.e,field,{areaMu:2}),/缺依据/);
  const result=valuation(f.draft(),f.e,{role:'property',subject:field});
  assert.equal(result.value,null);assert.match(result.unvaluable,/缺依据/);
  await assert.rejects(f.act({operation:'rent_in',location:field,quantity:2},`missing-${missing}`),/缺依据/);
  assert.deepEqual(f.doc,before);
 }
});
