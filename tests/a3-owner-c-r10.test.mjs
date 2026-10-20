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
 assert.equal(signatureMatches(input.expected.signature,run.effects,run.receipt,run.requested,world),true);
 assert.equal(signatureMatches(input.expected.signature,[{...effect,creditor:'npc_hw_linsui',to:'npc_hw_linsui'}],run.receipt,run.requested,world),false);
 const foreign=row('040');foreign.setup.obligations[0].creditor='npc_hw_linsui';foreign.setup.history[0].creditor='npc_hw_linsui';
 const denied=await executeIntent(engine,initial,foreign);
 assert.equal(denied.actual.committed,false);
 assert.deepEqual(denied.setupUnmet,[]);
 assert.equal(denied.document.state.obligations.a3v2_040_loan.paid,0);
 assert.equal(denied.document.state.obligations.a3v2_040_loan.endReason,undefined);
});

test('r10 C: channel and owned bucket endpoints require conserved native water and current ownership',async()=>{
 const input=row('079'),scored=await scoreRows([input],{world,seed,document:initial}),result=scored.results[0];
 assert.equal(result.scores.signature,true,JSON.stringify(result.scores));
 assert.equal(result.scores.constructor,true);
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
