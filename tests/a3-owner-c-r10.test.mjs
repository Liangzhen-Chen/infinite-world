import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {executeIntent,scoreRows,signatureMatches} from '../tools/a3-score.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const initial=engine.createCharacter(seed,{},'a3-score-independent');
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r7.json','utf8'));
const row=id=>structuredClone(corpus.find(r=>r.id===`A3V2-${id}`));

test('r10 C: waiver identifies the actual debtor and creditor without moving money',async()=>{
 const input=row('040'),run=await executeIntent(engine,initial,input);
 assert.deepEqual(run.setupUnmet,[]);
 assert.equal(run.actual.committed,true);
 const effect=run.effects.find(e=>e.op==='obligation.cancel');
 assert.equal(effect.debtor,'npc_hw_ayan');assert.equal(effect.creditor,'player');
 assert.equal(effect.from,effect.debtor);assert.equal(effect.to,effect.creditor);
 assert.equal(effect.obligationKind,'loan');assert.equal(effect.reason,'creditor_waiver');
 assert.equal(run.document.state.obligations[effect.id].status,'cancelled');
 assert.equal(run.document.state.obligations[effect.id].remaining,0);
 assert.equal(run.document.state.player.coins,run.before.state.player.coins);
 assert.equal(run.effects.some(e=>e.op==='transfer'),false);
 assert.deepEqual(auditLedger(run.document.ledger),[]);
 // Review 10-22 P0: the obligation token must bind to a native obligation. The corpus label ayan_debt_to_self is not
 // a setup alias (corpus-owned, reported to the main session), so the unbound row signature is unverifiable; the label
 // is bound here to the one native loan the waiver cancelled and every other part stays strict.
 assert.equal(signatureMatches(input.expected.signature,run.effects,run.receipt,run.requested,world,run.document,{before:run.before}),false);
 const context={before:run.before,bindings:{ayan_debt_to_self:effect.id}};
 assert.equal(signatureMatches(input.expected.signature,run.effects,run.receipt,run.requested,world,run.document,context),true);
 // The signature names the obligation, not its parties: a different obligation never satisfies it, and the actual
 // debtor/creditor are asserted natively above and by the foreign-creditor refusal below.
 assert.equal(signatureMatches(input.expected.signature,[{...effect,id:'another_obligation'}],run.receipt,run.requested,world,run.document,context),false);
 const foreign=row('040');foreign.setup.obligations[0].creditor='npc_hw_linsui';foreign.setup.history[0].creditor='npc_hw_linsui';
 const denied=await executeIntent(engine,initial,foreign);
 assert.equal(denied.actual.committed,false);
 assert.deepEqual(denied.setupUnmet,[]);
 assert.equal(denied.document.state.obligations.a3v2_040_loan.paid,0);
 assert.equal(denied.document.state.obligations.a3v2_040_loan.endReason,undefined);
});

test('r10 C: channel and owned bucket endpoints require conserved native water and current ownership',async()=>{
 // 079 declares feature distances that contradict native geometry (01 §1.2; corpus-owned, reported to the main
 // session); this mechanism regression drops that premise, as the scorer self-test does.
 const input=row('079');delete input.setup.positions;
 const scored=await scoreRows([input],{world,seed,document:initial}),result=scored.results[0];
 // thing:own_water_bucket names no entity in the world (corpus label, reported to the main session), so the full
 // row signature is unverifiable; its channel-to-bucket transfer part is checked below against the native effect.
 assert.equal(result.scores.route,true);assert.equal(result.scores.signature,false);
 assert.deepEqual(result.signatureDiagnostics.map(d=>d.reason),['unverified qualifiers: thing:own_water_bucket']);
 // 标杆 B07.4: constructor credit is the model-free form search, never a replay of the corpus proposal.
 assert.equal(result.constructorSearch.method,'model-free form');assert.equal(result.scores.constructor,Boolean(result.constructorSearch.matched));
 const effect=result.actual.signatureEffects.find(e=>e.op==='transfer'&&e.resource==='water');
 assert.equal(effect.destinationOwner,'player');
 const signature=[input.expected.signature[0]],receipt={actor:'player'};
 assert.equal(signatureMatches(signature,[effect],receipt,[],world),true);
 assert.equal(signatureMatches(signature,[{...effect,destinationOwner:'npc_hw_linsui'}],receipt,[],world),false);
 assert.equal(signatureMatches(signature,[{...effect,from:'feature_hw_well'}],receipt,[],world),false);
 const changed=structuredClone(effect);changed.result.destination.after.waterMl++;
 assert.equal(signatureMatches(signature,[changed],receipt,[],world),false);
 assert.equal(signatureMatches(signature,[{...effect,from:effect.to,to:effect.from}],receipt,[],world),false);
});
