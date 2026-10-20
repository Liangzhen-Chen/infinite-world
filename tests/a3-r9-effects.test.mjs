import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {executeIntent,scoreRows,signatureMatches} from '../tools/a3-score.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const initial=engine.createCharacter(seed,{},'a3-r9');
const rows=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2.json',import.meta.url),'utf8'));
const rowFor=id=>rows.find(r=>r.id===`A3V2-${id}`);
async function run(id,die=20){
 const document=structuredClone(initial),eventId=`a3-score-A3V2-${id}`;
 for(let n=0;;n++){
  const candidate=`a3-r9:${id}:${n}`;
  if(createHash('sha256').update(`${candidate}:${eventId}:d20`).digest().readUInt32LE(0)%20+1===die){document.randomSeed=candidate;break;}
 }
 return executeIntent(engine,document,rowFor(id));
}

test('R9: formula acquisition keeps backing skill initialization in the same lesson, with exact source and failed-attempt behavior',async()=>{
 for(const id of ['012','014'])for(const die of [20,1]){
  const r=await run(id,die),subject=rowFor(id).proposal.effects.find(e=>e.op==='learn').subject;
  assert.equal(r.actual.committed,true);assert.deepEqual(r.setupUnmet,[]);
  const learn=r.receipt.applied.filter(e=>e.op==='learn');
  assert.equal(learn.length,1);assert.equal(learn[0].subject,subject);
  assert.deepEqual(learn[0].result.after,r.document.state.learning[r.receipt.eventId]);
  assert.equal(learn[0].result.after.success,die===20);
  const skill=engine.byId.get(subject).skill,initialized=learn[0].result.initializedSkills;
  if(die===20){
   assert.ok(r.document.state.recipes[subject]);assert.equal(initialized.length,1);
   assert.equal(initialized[0].subject,skill);assert.equal(initialized[0].before,null);
   assert.deepEqual(initialized[0].after,r.document.state.skills[skill]);
   assert.deepEqual(initialized[0].path,['state','skills',skill]);assert.equal(initialized[0].after.proficiency,0);
  }else{
   assert.equal(initialized,undefined);assert.equal(r.document.state.recipes[subject],undefined);
   assert.deepEqual(r.document.state.skills[skill],r.before.state.skills[skill]);
  }
  assert.deepEqual(r.preview.receipt.applied,r.receipt.applied);
  assert.equal(r.document.state.player.coins,r.before.state.player.coins-(id==='012'?4:0));
  if(id==='012')assert.equal(r.receipt.cost.resources[0].role,'requested_consumption');
  const reloaded=JSON.parse(JSON.stringify(r.document));
  const retry=await engine.reduce(reloaded,r.submitted);assert.deepEqual(retry.patches,[]);
  assert.deepEqual(auditLedger(r.document.ledger),[]);
 }
});

test('R9: learning and spell corpus rows retain success/failure and constructor checks',async()=>{
 const result=await scoreRows(rows.filter(r=>['012','014','068','069','070','072'].some(id=>r.id===`A3V2-${id}`)),{world,document:initial});
 for(const r of result.results){
  assert.deepEqual(r.setupUnmet,[],r.id);
  assert.ok(Object.values(r.scores).every(Boolean),r.id);
  for(const branches of [r.checkBranches,r.actual.builder.checkBranches])for(const branch of Object.values(branches)){
   assert.equal(branch.ok,true,r.id);assert.deepEqual(branch.issues,[],r.id);
  }
 }
});

test('R9: legal requests never prepay, appoint, accept or adjudicate without the recipient decision',async()=>{
 for(const id of ['051','052','055','056','058']){
  const r=await run(id);
  assert.equal(r.actual.route,rowFor(id).expected.route);assert.deepEqual(r.setupUnmet,[]);
  assert.equal(r.receipt.legacy.accepted,null);assert.equal(r.receipt.legacy.submitted,true);
  assert.deepEqual(r.receipt.applied.map(e=>e.op),['emit']);
  assert.equal(r.document.state.player.coins,r.before.state.player.coins);
  assert.deepEqual(r.document.state.obligations,r.before.state.obligations);
  const cases=s=>Object.values(s.records).filter(row=>row.category==='legal_case').map(({evidence,...row})=>row);
  assert.deepEqual(cases(r.document.state),cases(r.before.state));
  assert.deepEqual(auditLedger(r.document.ledger),[]);
 }
});

test('R9: water and summon descriptors require native source, destination, contract and debit evidence',async()=>{
 const water=await run('069'),effect=water.receipt.applied.find(e=>e.op==='transfer'&&e.resource==='water');
 const expected=rowFor('069').expected.signature,match=e=>signatureMatches(expected,[e],water.receipt,[],world);
 assert.equal(match(effect),true);
 assert.equal(match({...effect,from:effect.to,to:effect.from}),false);
 assert.equal(match({...effect,qty:effect.qty+1}),false);
 assert.equal(match({...effect,result:undefined}),false);
 assert.equal(match({...effect,resource:'coin_river'}),false);
 assert.equal(effect.result.source.before.waterMl-effect.result.source.after.waterMl,effect.qty*1000);
 assert.equal(effect.result.destination.after.waterMl-effect.result.destination.before.waterMl,effect.qty*1000);
 const bucket=await run('068'),clean=bucket.receipt.applied.find(e=>e.op==='fact.set'&&e.field==='turbidity');
 assert.equal(signatureMatches(rowFor('068').expected.signature,[clean],bucket.receipt,[],world),true);
 // An explicit resource token is still binding; descriptive water_bucket is not.
 assert.equal(signatureMatches(['transfer(resource:water,self->npc_hw_linsui)'],[{op:'transfer',resource:'coin_river',from:'player',to:'npc_hw_linsui'}],{},[],world),false);
 const summon=await run('072'),contract=summon.receipt.applied.find(e=>e.op==='obligation.create');
 const upkeep=[rowFor('072').expected.signature[1]];
 assert.equal(signatureMatches(upkeep,[contract],summon.receipt,[],world),true);
 assert.equal(signatureMatches(upkeep,[{...contract,to:'unrelated'}],summon.receipt,[],world),false);
 assert.equal(signatureMatches(upkeep,[{...contract,result:undefined}],summon.receipt,[],world),false);
 assert.equal(summon.document.state.player.mp,1);
 const reloaded=JSON.parse(JSON.stringify(summon.document));
 const tick=await engine.reduce(reloaded,{tool:'world_time',eventId:'r9-summon-upkeep',args:{minutes:5}}),after=applyPatches(reloaded,tick.patches);
 assert.equal(after.state.player.mp,0);assert.equal(after.state.records[contract.id].paidUpkeep,1);
 assert.deepEqual(auditLedger(after.ledger),[]);
});
