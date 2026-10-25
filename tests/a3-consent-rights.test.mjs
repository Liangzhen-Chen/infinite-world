import test from 'node:test';
import assert from 'node:assert/strict';
import '../server-plugin/primitives-runtime.mjs';
import {fixture,DRIVER} from './helpers/transport.mjs';
import {transportAction} from '../server-plugin/transport.mjs';
import {openGoodsObligation,extendGoodsObligation} from '../server-plugin/obligation-conditional.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {auditLedger,openLedger} from '../server-plugin/ledger.mjs';
import {applyConsentEvent} from '../server-plugin/action-consent.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {obligationView} from '../server-plugin/obligation-state.mjs';

async function commit(f,call){
 const before=structuredClone(f.d.document);
 const preview=await f.e.previewAction(f.d.document,call);
 assert.equal(preview.receipt.status,'preview',preview.receipt.reason);
 assert.deepEqual(f.d.document,before);
 const out=await f.e.reduce(f.d.document,call);
 assert.equal(out.result.receipt.status,'committed',out.result.receipt.reason);
 f.d.document=applyPatches(f.d.document,out.patches);
 return out;
}
const save=f=>{f.d.document=JSON.parse(JSON.stringify(f.d.document));};
function setup(){const f=fixture();f.d.document.ledger=openLedger(f.e,f.d.document);return f;}
function signed(f,terms={}){
 openGoodsObligation(f.d,f.e,{id:'right-grain',kind:'forward',debtor:DRIVER,creditor:'player',item:'item_oats',quantity:2,deadline:2000,terms},'right-sign');
}

test('consent rights: self-filled consent cannot sign for an unwilling NPC and rejection writes nothing',()=>{
 const f=setup(),before=structuredClone(f.d.document);
 assert.throws(()=>transportAction(f.d,f.e,{task:'forward',seller:DRIVER,item:'item_oats',quantity:50,coins:0,deadline:2000,consent:true},'forged-forward'));
 assert.deepEqual(f.d.document,before);
});

test('consent rights: a real forward action gets an NPC decision, records exact consent and survives save',async()=>{
 const f=setup(),price=f.e.byId.get('item_oats').basePrice*2;
 const call={tool:'world_act',eventId:'agreed-forward',args:{action:'core:trade.transport',slots:{task:'forward',seller:DRIVER,item:'item_oats',quantity:2,coins:price,deadline:2000}}};
 await commit(f,call);
 const row=f.d.get('state','obligations','conditional:agreed-forward');
 assert.equal(row.debtor,DRIVER);assert.equal(row.creditor,'player');assert.equal(row.amount,2);
 const consent=f.d.get('state','consentEvents').find(c=>c.id===row.terms.consent);
 assert.equal(consent.from,DRIVER);assert.equal(consent.to,'player');assert.equal(consent.scope,'forward');
 assert.deepEqual(consent.terms,{item:'item_oats',quantity:2,prepayment:price,deadline:2000,location:'loc_hw'});
 const before=JSON.parse(JSON.stringify(f.d.document));save(f);assert.deepEqual(f.d.document,before);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('consent rights: debtor needs actual creditor consent; scope, deadline and original signature survive save',async()=>{
 const f=setup();signed(f);const terms=structuredClone(f.d.get('state','obligations','right-grain','terms'));
 let before=structuredClone(f.d.document);
 assert.throws(()=>extendGoodsObligation(f.d,f.e,{id:'right-grain',actor:DRIVER,deadline:3000,consent:true},'no-right'));
 assert.deepEqual(f.d.document,before);
 // 独立验证原生同意事件消费者；玩家可玩的主动让步入口在下一条验证。
 applyConsentEvent(f.d,{engine:f.e,document:f.d.document},{actor:'player',eventId:'creditor-agrees',verb:'consent_given',to:DRIVER,payload:{scope:'amend',subject:'right-grain',purpose:['right-grain'],terms:{deadline:3000},until:700}});
 save(f);before=structuredClone(f.d.document);
 assert.throws(()=>extendGoodsObligation(f.d,f.e,{id:'right-grain',actor:DRIVER,deadline:3001},'wrong-deadline'));
 assert.deepEqual(f.d.document,before);
 extendGoodsObligation(f.d,f.e,{id:'right-grain',actor:DRIVER,deadline:3000},'real-right');
 const row=f.d.get('state','obligations','right-grain');
 assert.equal(row.deadline,3000);assert.deepEqual(row.terms,terms);
 assert.equal(row.amendments.at(-1).consent,f.d.get('state','consentEvents').at(-1).id);
 const saved=JSON.parse(JSON.stringify(f.d.document));save(f);assert.deepEqual(f.d.document,saved);
});

test('consent rights: creditor can concede, signed extension rights are bounded and request rights are ignored',async()=>{
 const f=setup();signed(f,{extension:{holder:DRIVER,until:3000}});
 const terms=structuredClone(f.d.get('state','obligations','right-grain','terms'));
 extendGoodsObligation(f.d,f.e,{id:'right-grain',actor:DRIVER,deadline:3000},'signed-right');
 let before=structuredClone(f.d.document);
 assert.throws(()=>extendGoodsObligation(f.d,f.e,{id:'right-grain',actor:DRIVER,deadline:4000,extension:{holder:DRIVER,until:4000}},'fake-right'));
 assert.deepEqual(f.d.document,before);
 await commit(f,{tool:'world_act',eventId:'creditor-concession',args:{action:'core:trade.transport',slots:{task:'extend',seller:DRIVER,business:'right-grain',deadline:4000}}});
 assert.equal(f.d.get('state','obligations','right-grain','deadline'),4000);
 assert.deepEqual(f.d.get('state','obligations','right-grain','terms'),terms);
 before=structuredClone(f.d.document);
 assert.throws(()=>extendGoodsObligation(f.d,f.e,{id:'right-grain',actor:'player',deadline:3500},'creditor-accelerates'));
 assert.deepEqual(f.d.document,before);
});

test('consent rights: actual lending records the borrower decision and collection cannot forge repayment consent',async()=>{
 const f=setup();
 await commit(f,{tool:'world_act',eventId:'native-lending',args:{action:'core:trade.lend',slots:{seller:DRIVER,coins:50,days:1}}});
 const id='finance:debt_lend_native-lending',row=f.d.get('state','obligations',id),grant=f.d.get('state','consentEvents').find(c=>c.id===row.signedTerms.consent);
 assert.equal(grant.from,DRIVER);assert.deepEqual(grant.terms,{principal:50,days:1,interest:row.interest});
 const before=structuredClone(f.d.document),call={tool:'world_act',eventId:'forged-repay',args:{action:'core:trade.collect',slots:{seller:DRIVER,debt:'debt_lend_native-lending',consent:true}}};
 const out=await f.e.reduce(f.d.document,call);
 assert.equal(out.result.receipt.status,'rejected');assert.equal(out.result.receipt.code,'E-ACTION-PRECONDITION');
 assert.deepEqual(applyPatches(f.d.document,out.patches),before);
 const missing=await f.e.reduce(before,{...call,eventId:'missing-repay',args:{action:'core:trade.collect',slots:{seller:DRIVER,debt:'debt_lend_native-lending'}}});
 assert.equal(missing.result.receipt.code,'E-ACTION-CONSENT');assert.deepEqual(applyPatches(before,missing.patches),before);
 applyConsentEvent(f.d,{engine:f.e,document:f.d.document},{actor:DRIVER,eventId:'actual-payer',verb:'consent_given',to:'player',payload:{scope:'repay',subject:id,purpose:[id],terms:{amount:row.amount},until:700}});
 await commit(f,{...call,eventId:'actual-collect',args:{action:'core:trade.collect',slots:{seller:DRIVER,debt:'debt_lend_native-lending'}}});
 assert.equal(obligationView(f.d.get('state'),id).owed,0);assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('consent rights: real borrowing needs lender consent and requested extension keeps one canonical amount',async()=>{
 const f=setup();f.d.document=applyIntentSetup(f.e,f.d.document,{inventory:{item_iron:100}}).document;
 const call={tool:'world_act',eventId:'native-borrowing',args:{action:'core:trade.borrow',slots:{seller:DRIVER,coins:9,days:1,item:'item_iron',quantity:10}}};
 const before=structuredClone(f.d.document),forged=await f.e.reduce(before,{...call,args:{...call.args,slots:{...call.args.slots,consent:true}}});
 assert.equal(forged.result.receipt.code,'E-ACTION-PRECONDITION');assert.deepEqual(applyPatches(before,forged.patches),before);
 const missing=await f.e.reduce(before,call);
 assert.equal(missing.result.receipt.code,'E-ACTION-CONSENT');assert.deepEqual(applyPatches(before,missing.patches),before);
 applyConsentEvent(f.d,{engine:f.e,document:f.d.document},{actor:DRIVER,eventId:'lender-agrees',verb:'consent_given',to:'player',payload:{scope:'loan',subject:'player',purpose:['player'],terms:{principal:9,days:1,interest:1},until:700}});
 await commit(f,call);
 const id='finance:debt_loan_native-borrowing',terms=structuredClone(f.d.get('state','obligations',id,'terms'));
 assert.equal(terms.consent,'lender-agrees');
 await commit(f,{tool:'world_act',eventId:'native-extension',args:{action:'core:trade.extend',slots:{seller:DRIVER,debt:'debt_loan_native-borrowing',days:1}}});
 const row=f.d.get('state','obligations',id),projection=f.d.get('state','records','debt_loan_native-borrowing');
 assert.equal(row.amount,11);assert.equal(projection.amount,row.amount);assert.equal(projection.deadline,row.deadline);
 assert.equal(obligationView(f.d.get('state'),id).owed,11);assert.deepEqual(row.terms,terms);
 assert.equal(row.amendments.at(-1).consent,'native-extension:consent');
 const persisted=JSON.parse(JSON.stringify(f.d.document));save(f);assert.deepEqual(f.d.document,persisted);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});
