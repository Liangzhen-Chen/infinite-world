import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {executeIntent,applyIntentSetup,signatureMatches} from '../tools/a3-score.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {purse,vault} from '../server-plugin/money.mjs';
import {resolveRedeemingBranch} from '../server-plugin/shop.mjs';
import {reconcile,conservation} from './helpers/ledger-audit.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const initial=engine.createCharacter(seed,{},'a3-score-independent');
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r7.json','utf8'));
const row=()=>structuredClone(corpus.find(r=>r.id==='A3V2-038'));
function balanced(before,after){
 const result=reconcile(engine,after);
 for(const key of ['mismatches','drift','audit'])assert.deepEqual(result[key],[]);
 assert.deepEqual(conservation(engine,before,after),[]);
}

test('r11 C: quoted remittance replaces the native fee with one payment to the same vault',async()=>{
 for(const fee of [0,1,2,5]){
  const input=row();input.setup.quotes[0].fee=fee;
  input.setup.history.find(r=>r.verb==='quoted').fee=fee;
  input.setup.coins=50+fee;
  const run=await executeIntent(engine,initial,input);
  assert.deepEqual(run.setupUnmet,[]);assert.equal(run.actual.committed,true);
  const transfers=run.effects.filter(e=>e.op==='transfer');
  assert.equal(transfers.length,1);
  assert.equal(transfers[0].from,purse(engine,'player'));
  assert.equal(transfers[0].to,vault('bank_hw_post'));
  assert.equal(transfers[0].qty,50+fee);
  assert.equal(run.document.state.player.coins,0);
  const bill=Object.values(run.document.state.records).find(r=>r.category==='bank_bill');
  assert.equal(bill.fee,fee);assert.equal(bill.amount,50);
  assert.equal(run.document.state.records['agreed_quote:a3v2_038_remit_quote:used'].quote,'a3v2_038_remit_quote');
  assert.equal(signatureMatches(input.expected.signature,run.effects,run.receipt,run.requested,world),true);
  balanced(run.before,run.document);
 }
});

test('r11 C: short funds reject atomically and unquoted callers cannot override the issuer fee',async()=>{
 const input=row();input.setup.coins=51;
 const denied=await executeIntent(engine,initial,input);
 assert.equal(denied.actual.committed,false);assert.deepEqual(denied.effects,[]);
 assert.equal(denied.document.state.player.coins,51);
 assert.equal(denied.document.state.records['agreed_quote:a3v2_038_remit_quote:used'],undefined);
 assert.equal(Object.values(denied.document.state.records).some(r=>r.category==='bank_bill'),false);
 balanced(denied.before,denied.document);
 const unquoted=row();unquoted.setup.quotes=[];
 const setup=applyIntentSetup(engine,initial,unquoted.setup);assert.deepEqual(setup.setupUnmet,[]);
 const destination=resolveRedeemingBranch(engine,setup.document.state,'loc_bs').location;
 const out=await engine.reduce(setup.document,{tool:'world_trade',eventId:'r11-unquoted',args:{operation:'remit',seller:'npc_hw_shendu',buyer:'npc_hw_yanzhe',coins:50,location:destination,remittanceFee:0,fee:0}});
 const after=applyPatches(setup.document,out.patches);
 assert.equal(out.result.fee,1);assert.equal(after.state.player.coins,1);
 balanced(setup.document,after);
});
