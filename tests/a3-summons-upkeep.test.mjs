import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage,digest} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {runPrelude} from '../tools/a3-setup/prelude.mjs';
import {obligationView} from '../server-plugin/obligation-state.mjs';
import {reconcile,conservation} from './helpers/ledger-audit.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const initial=engine.initialFromLegacy(seed,'a3-summons-upkeep');
const act=(action,slots,eventId)=>({tool:'world_act',args:{action,slots},eventId});
const spell=world.spells.find(s=>s.id==='spell_summon_04');
function scene(){
 const setup=applyIntentSetup(engine,initial,{minute:600,location:'bld_hw_school',present:[],coins:10,
  inventory:Object.fromEntries(spell.materials.map(m=>[m.item,m.amount])),
  abilitiesByActor:{player:{spells:[spell.id],skills:{[spell.skill]:2699}}}});
 assert.deepEqual(setup.setupUnmet,[]);return setup.document;
}
async function cast(document=scene()){
 for(let n=0;n<20;n++){
  const input=act('core:cast',{spell:spell.id,target:'player'},`upkeep-cast-${n}`);
  const preview=await engine.previewAction(document,input);assert.equal(preview.receipt.status,'preview');
  const reduced=await engine.reduce(document,input);
  if(reduced.result.receipt.legacy.success)return {input,reduced,document:applyPatches(document,reduced.patches)};
 }
 assert.fail('deterministic cast samples must include a successful summon');
}
const clean=(before,after)=>{
 assert.deepEqual(reconcile(engine,after),{mismatches:[],lots:[],drift:[],audit:[]});
 assert.deepEqual(conservation(engine,before,after),[]);
};

test('summon upkeep: real cast opens exactly one linked mana obligation without another opening fee',async()=>{
 const before=scene(),saved=structuredClone(before),out=await cast(before),r=out.reduced.result.receipt.legacy,s=out.document.state;
 assert.deepEqual(before,saved);
 const rows=Object.values(s.obligations).filter(o=>o.kind==='upkeep'&&o.creditor===r.summon);
 assert.equal(rows.length,1);const row=rows[0],effect=s.effects[r.summon];
 assert.equal(row.id,r.obligation);assert.equal(s.records[r.contract].upkeepObligation,row.id);
 assert.equal(row.contract,effect.contract);assert.equal(row.debtor,effect.owner);
 assert.equal(row.amount,0);assert.equal(row.paid,0);assert.equal(row.terms.upkeepMp,spell.effectSpec.upkeepMp);
 assert.equal(row.terms.upkeepMinutes,spell.effectSpec.upkeepMinutes);assert.equal(row.sourceEvent,out.input.eventId);
 assert.equal(s.player.mp,before.state.player.mp-spell.mp);assert.equal(s.player.coins,before.state.player.coins);
 const opened=out.reduced.result.receipt.applied.filter(e=>e.op==='obligation.create'&&e.obligationKind==='upkeep');
 assert.equal(opened.length,1);assert.equal(opened[0].id,r.contract);
 assert.equal(opened[0].canonicalObligation,row.id);assert.deepEqual(opened[0].result.after,s.records[r.contract]);
 clean(before,out.document);
});

test('summon upkeep: the real clock charges only catalog mana; expiry and dismissal stop future charges',async()=>{
 const before=scene(),out=await cast(before),r=out.reduced.result.receipt.legacy;
 const charged=await runPrelude(engine,out.document,[act('core:time',{minutes:spell.effectSpec.upkeepMinutes},'upkeep-first')]);
 assert.deepEqual(charged.unmet,[]);
 assert.equal(charged.document.state.player.mp,out.document.state.player.mp-spell.effectSpec.upkeepMp);
 assert.equal(charged.document.state.records[r.contract].paidUpkeep,spell.effectSpec.upkeepMp);
 const dismissed=await runPrelude(engine,charged.document,[act('core:summon.dismiss',{summon:r.summon},'upkeep-dismiss')]);
 assert.deepEqual(dismissed.unmet,[]);assert.equal(obligationView(dismissed.document.state,r.obligation).closed,true);
 const waited=await runPrelude(engine,dismissed.document,[act('core:time',{minutes:spell.duration},'after-dismiss')]);
 assert.deepEqual(waited.unmet,[]);assert.equal(waited.document.state.player.mp,dismissed.document.state.player.mp);
 assert.equal(waited.document.state.effects[r.summon],undefined);
 assert.equal(Object.values(waited.document.state.effects).filter(e=>e.kind==='summon').length,0);
 const expiryInput=act('core:time',{minutes:spell.duration},'upkeep-expire');
 assert.equal((await engine.previewAction(out.document,expiryInput)).receipt.status,'preview');
 const expiry=await engine.reduce(out.document,expiryInput),expired={document:applyPatches(out.document,expiry.patches)},s=expired.document.state;
 const closed=expiry.result.receipt.applied.find(e=>e.op==='obligation.cancel'&&e.id===r.obligation);
 assert.ok(closed);assert.equal(closed.result.before.endedAt,undefined);
 assert.equal(closed.result.after.endedAt,out.document.state.effects[r.summon].expires);
 assert.equal(s.effects[r.summon],undefined);assert.equal(s.obligations[r.obligation].endedAt,out.document.state.effects[r.summon].expires);
 assert.equal(obligationView(s,r.obligation).closed,true);
 const fees=(Math.ceil(spell.duration/spell.effectSpec.upkeepMinutes)-1)*spell.effectSpec.upkeepMp;
 assert.equal(s.player.mp,out.document.state.player.mp-fees);
 const afterExpiry=await runPrelude(engine,expired.document,[act('core:time',{minutes:10},'after-expiry')]);
 assert.deepEqual(afterExpiry.unmet,[]);assert.equal(afterExpiry.document.state.player.mp,s.player.mp);
 assert.equal(afterExpiry.document.state.effects[r.summon],undefined);
 assert.equal(Object.values(afterExpiry.document.state.effects).filter(e=>e.kind==='summon').length,0);
 for(const d of [charged.document,dismissed.document,waited.document,expired.document,afterExpiry.document])clean(before,d);
});

test('pawn redemption: receipt lists the actual closed pledge and returns the original with conserved money and goods',async()=>{
 const setup=applyIntentSetup(engine,initial,{minute:600,location:'bld_hw_post',present:['npc_hw_shendu'],coins:1,inventory:{item_staff:0},
  itemInstances:[{id:'upkeep-pawn-staff',template:'thing',kind:'item',item:'item_staff',owner:'player',location:'bld_hw_post',carriedBy:'player',condition:100}],
  holdings:[{id:'upkeep-pawn-title',kind:'owns',holder:'player',subject:'upkeep-pawn-staff',terms:{share:1}}]});
 assert.deepEqual(setup.setupUnmet,[]);const before=setup.document,unit=before.state.inventory.item_staff.instances[0];
 assert.ok(unit);
 const pawned=await runPrelude(engine,before,[act('core:trade.pawn',{seller:'npc_hw_shendu',item:'item_staff',quantity:1,coins:2,days:1},'upkeep-pawn')]);
 assert.deepEqual(pawned.unmet,[]);const debt='debt_loan_upkeep-pawn',claim=pawned.document.state.records[debt];
 const input=act('core:trade.redeem',{seller:'npc_hw_shendu',contract:debt},'upkeep-redeem');
 assert.equal((await engine.previewAction(pawned.document,input)).receipt.status,'preview');
 const reduced=await engine.reduce(pawned.document,input),after=applyPatches(pawned.document,reduced.patches),receipt=reduced.result.receipt;
 assert.equal(receipt.status,'committed');
 const closed=receipt.applied.filter(e=>e.op==='holding.close'&&e.holdingKind==='pledged'&&e.holder===debt);
 assert.equal(closed.length,1);assert.equal(closed[0].result.before.until,undefined);
 assert.equal(closed[0].subject,claim.pledgeRecord);assert.equal(closed[0].result.after.until,pawned.document.state.minute);
 assert.deepEqual(after.holdings.rows[closed[0].holding],closed[0].result.after);
 assert.equal(after.state.player.coins,pawned.document.state.player.coins-claim.amount);
 assert.deepEqual(after.state.inventory.item_staff.instances,[unit]);
 assert.equal(after.state.itemInstances[unit].owner,'player');
 assert.equal(obligationView(after.state,debt).owed,0);
 clean(before,pawned.document);clean(pawned.document,after);clean(before,after);
});

test('summon upkeep: cast, dismissal and natural expiry survive campaign export/import and reducer replay',async t=>{
 const directory=await fs.mkdtemp(path.join(process.cwd(),'.a3-summons-upkeep-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=engine.reduce.bind(engine),before=scene(),sample=await cast(before);
 for(const operation of ['dismiss','expiry']){
  const store=new CampaignStorage(directory,{reducer,snapshotEvery:10});
  await store.create({id:operation,worldVersion:world.version,document:before});
  const created=await store.transact(operation,{id:sample.input.eventId,input:sample.input},reducer);
  const r=created.result.receipt.legacy;
  const bundle=await store.export(operation),fresh=new CampaignStorage(directory,{reducer});
  const restored=await fresh.import(bundle,`${operation}_copy`);
  // CampaignStorage persists JSON patches; compare the same serializable form.
  assert.equal(digest(restored.document),digest(JSON.parse(JSON.stringify(sample.document))));
  const repeated=await fresh.transact(`${operation}_copy`,{id:sample.input.eventId,input:sample.input},reducer);
  assert.deepEqual(repeated.result,created.result);
  const input=operation==='dismiss'?act('core:summon.dismiss',{summon:r.summon},'saved-dismiss'):act('core:time',{minutes:spell.duration},'saved-expiry');
  await fresh.transact(`${operation}_copy`,{id:input.eventId,input},reducer);
  const final=await fresh.export(`${operation}_copy`),cold=new CampaignStorage(directory,{reducer});
  const replayed=await cold.import(final,`${operation}_replayed`);
  assert.equal(digest(replayed.document),final.documentHash);
  assert.equal(obligationView(replayed.document.state,r.obligation).closed,true);
  assert.equal(replayed.document.state.effects[r.summon],undefined);
  assert.equal(Object.values(replayed.document.state.effects).filter(e=>e.kind==='summon').length,0);
  assert.equal(Object.values(replayed.document.state.obligations).filter(o=>o.kind==='upkeep'&&o.creditor===r.summon).length,1);
  clean(before,replayed.document);
 }
});
