import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup,signatureMatches} from '../tools/a3-score.mjs';
import {knownWorldEventReference,presentWitnesses} from '../server-plugin/world-events.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {reconcile,conservation} from './helpers/ledger-audit.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2.json','utf8'));
const row=corpus.find(r=>r.id==='A3V2-020');
function fixture(){
 const initial=engine.createCharacter(seed,{},'a3-score-independent');
 const setup=applyIntentSetup(engine,initial,row.setup);assert.deepEqual(setup.setupUnmet,[]);
 return setup.document;
}
const input=eventId=>({tool:'world_act',eventId,args:{action:'core:profession.certify',slots:{profession:'profession_life_6',teacher:'npc_hw_yinge'}}});
function balanced(before,after){
 const books=reconcile(engine,after);
 for(const key of ['mismatches','lots','drift','audit'])assert.deepEqual(books[key],[]);
 assert.deepEqual(conservation(engine,before,after),[]);
}
async function branch(document,success){
 for(let i=0;i<40;i++){
  const call=input(`certification-${success}-${i}`),out=await engine.reduce(document,call);
  if(out.result.certified===success)return {call,out,after:applyPatches(document,out.patches)};
 }
 assert.fail(`native certification check never reached success=${success}`);
}

for(const success of [true,false])test(`认证${success?'成功':'失败'}：机构申请、费用回执、原生见证及存档往返`,async t=>{
 const before=fixture(),{call,out,after}=await branch(before,success),receipt=out.result.receipt;
 assert.equal(receipt.status,'committed');assert.equal(receipt.check.success,success);
 const request=after.state.records[`world_event:${out.result.request}`];
 assert.equal(request.category,'world_event');assert.equal(request.verb,'request');assert.equal(request.actor,'player');
 assert.equal(request.target,'faction_lampbridge');assert.equal(request.sourceEvent,call.eventId);
 assert.equal(request.location,'bld_bs_guild');assert.equal(request.minute,before.state.minute);
 assert.equal(request.visibility,'witnessed');assert.ok(Number.isSafeInteger(request.seq));
 assert.deepEqual(request.payload,{kind:'certification',receiver:'npc_hw_yinge',office:'office_exam_life_6',terms:{profession:'profession_life_6',skill:'skill_life_6_core'}});
 assert.deepEqual(request.witnesses,presentWitnesses(before.state,before.state.location,['player']));
 assert.ok(request.witnesses.includes('npc_hw_yinge'));assert.ok(request.witnesses.includes('npc_hw_yanzhe'));
 for(const witness of ['player','npc_hw_yinge','npc_hw_yanzhe']){
  assert.equal(knownWorldEventReference(after.state,witness,{reference:request.id}),request.id);
  assert.ok(subjectiveView(engine,after,witness).knowledge.memories.some(m=>m.sourceEvent===request.id));
 }
 const absent=Object.keys(before.state.npcs).find(id=>!request.witnesses.includes(id));assert.ok(absent);
 assert.equal(knownWorldEventReference(after.state,absent,{reference:request.id}),null);
 assert.equal(subjectiveView(engine,after,absent).knowledge.memories.some(m=>m.sourceEvent===request.id),false);
 const emitted=receipt.applied.filter(e=>e.op==='emit'&&e.payload?.kind==='certification');assert.equal(emitted.length,1);
 assert.equal(emitted[0].target,request.target);assert.equal(emitted[0].role,'outcome');
 assert.deepEqual(emitted[0].result.after,request);assert.equal(emitted[0].result.before,null);
 const fees=receipt.applied.filter(e=>e.op==='transfer');assert.equal(fees.length,success?1:0);
 assert.equal(receipt.cost.time,120);assert.equal(after.state.minute-before.state.minute,120);
 assert.equal(after.state.player.coins,before.state.player.coins-(success?20:0));
 assert.equal(after.state.npcs.npc_hw_yinge.coins,before.state.npcs.npc_hw_yinge.coins+(success?20:0));
 assert.equal(after.state.professions.life.includes('profession_life_6'),success);
 const certificates=receipt.applied.filter(e=>e.op==='holding.open'&&e.holdingKind==='certified');assert.equal(certificates.length,success?1:0);
 if(success){
  assert.equal(fees[0].from,'player|coin_river|purse');assert.equal(fees[0].to,'npc_hw_yinge|coin_river|purse');
  assert.equal(fees[0].qty,20);assert.equal(fees[0].role,'additional_cost');
  assert.deepEqual(receipt.cost.resources,[fees[0]]);
  assert.equal(signatureMatches(row.expected.signature,receipt.applied,receipt,row.proposal.effects,world,after),true);
 }else{
  assert.deepEqual(receipt.cost.resources,[]);assert.equal(after.state.careers?.profession_life_6?.certification,undefined);
 }
 balanced(before,after);

 const directory=await fs.mkdtemp(path.join(tmpRoot(),'certification-receipt-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=(document,request,options)=>engine.reduce(document,request,options);
 const store=new CampaignStorage(directory,{reducer});await store.create({id:'certification',worldVersion:world.version,document:before});
 const transaction={id:call.eventId,input:call};await store.transact('certification',transaction,reducer);
 const fresh=new CampaignStorage(directory,{reducer}),loaded=(await fresh.read('certification')).document;
 assert.deepEqual(loaded,JSON.parse(JSON.stringify(after)));balanced(before,loaded);
 const bundle=await fresh.export('certification'),imported=await fresh.import(JSON.parse(JSON.stringify(bundle)),'certification_copy');
 assert.deepEqual(imported.document,loaded);
 const duplicate=await fresh.transact('certification',transaction,reducer);
 assert.deepEqual(duplicate.result.receipt,JSON.parse(JSON.stringify(receipt)));
 assert.deepEqual((await fresh.read('certification')).document,loaded);
 const again=await engine.reduce(loaded,call);assert.equal(again.result.receipt.duplicate,true);assert.deepEqual(again.patches,[]);
});

test('认证前置拒绝仍原子化，不留下申请、收费或授证',async()=>{
 const document=fixture();document.state.skills.skill_life_6_core.proficiency=99;
 const before=structuredClone(document);
 const denied=await engine.reduce(document,input('certification-unskilled'));
 assert.equal(denied.result.receipt.status,'rejected');assert.deepEqual(denied.patches,[]);
 assert.deepEqual(document,before);
});

test('历史认证重放保留旧结果形状，不追加申请事件或费用元数据',async()=>{
 const before=fixture(),{call,out}=await branch(before,true);
 const historical=structuredClone(out.result);
 for(const key of ['request','teacher','institution','cost'])delete historical[key];
 delete historical.receipt;
 const replay=await engine.reduce(before,{tool:'world_profession',eventId:call.eventId,args:call.args.slots},{replay:true,result:historical});
 const after=applyPatches(before,replay.patches);
 assert.equal(replay.result.certified,true);assert.ok(after.state.professions.life.includes('profession_life_6'));
 for(const key of ['request','teacher','institution','cost','receipt'])assert.equal(Object.hasOwn(replay.result,key),false);
 assert.equal(Object.values(after.state.records).some(r=>r.category==='world_event'&&r.payload?.kind==='certification'),false);
 assert.equal(after.state.player.coins,before.state.player.coins-20);
 assert.equal(after.state.npcs.npc_hw_yinge.coins,before.state.npcs.npc_hw_yinge.coins+20);
 balanced(before,after);
});
