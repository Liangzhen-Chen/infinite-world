import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {teachingConsent} from '../server-plugin/learning.mjs';
import {createRuntimePrimitiveFrame} from '../server-plugin/primitives-runtime.mjs';
import {commitPrimitives} from '../server-plugin/primitives.mjs';
import {openHoldings} from '../server-plugin/holdings.mjs';
import {withLedger,accountKey} from '../server-plugin/ledger.mjs';
import {openObligation,closeObligation} from '../server-plugin/obligation-protocol.mjs';

const original=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const TEACHER='npc_hw_luqing',SKILL='skill_a3_lesson',PLACE='bld_hw_school';
function fixture(){
 const world=structuredClone(original);
 for(const n of world.npcs){n.tier='fixture';delete n.schedule;}
 const teacher=world.npcs.find(n=>n.id===TEACHER);teacher.profileStatus='full';teacher.services.push(SKILL);
 world.skills.push({id:SKILL,name:'接点工艺',attribute:'智力',stage:0,profession:null,prerequisites:[],learnMinutes:120,learnFee:12});
 for(const key of ['weather','settlementTrade','worldClock','hazardClock','factionClock'])delete world.rules[key];
 for(const f of world.factions)delete f.clock;
 const engine=new WorldEngine(world),document=withLedger(engine,engine.initialFromLegacy(seed,'a3-learning')).document;
 document.holdings=openHoldings(engine,document);document.state.location=PLACE;
 Object.assign(document.state.npcs[TEACHER],{location:PLACE,status:'正常',activity:'休息',trust:80,goals:{},skills:{[SKILL]:500}});
 return {world,engine,document};
}
const lesson=f=>f.engine.reduce(f.document,{tool:'learn',eventId:'a3-lesson',args:{entity:SKILL,source:TEACHER}});
const decide=f=>teachingConsent(f.engine.primitiveDraft(f.document),f.engine,{teacher:TEACHER,subject:SKILL,minutes:120,fee:12,eventId:'a3-lesson'});
function grant(f,subject=SKILL,minutes=121){
 const frame=createRuntimePrimitiveFrame(f.engine,f.document,{actor:TEACHER,eventId:`grant-${subject}-${minutes}`,source:{kind:'catalog',id:'test:teacher-consent'}});
 const out=commitPrimitives(f.document,[{op:'emit',verb:'consent_given',target:'player',visibility:'private',payload:{scope:'teach',purpose:[subject],until:f.document.state.minute+minutes}}],frame);
 f.document=applyPatches(f.document,out.patches);return f.document.state.consentEvents.at(-1);
}

test('A3 teaching adapter: willing teacher uses A2; one real lesson pays once, advances once and retains teacher skill',async()=>{
 const f=fixture(),before=structuredClone(f.document),out=await lesson(f),after=applyPatches(f.document,out.patches);
 assert.equal(out.result.source.consent.kind,'decision');
 assert.equal(out.result.source.consent.decision.outcome,'agree');
 assert.equal(after.state.minute-before.state.minute,120);
 assert.equal(before.state.player.coins-after.state.player.coins,12);
 assert.equal(after.state.npcs[TEACHER].coins-before.state.npcs[TEACHER].coins,12);
 for(const [owner,delta] of [['player',-12],[TEACHER,12]]){
  const key=accountKey(owner,'coin_river','purse');assert.equal(after.ledger.accounts[key]-before.ledger.accounts[key],delta);
 }
 assert.deepEqual(after.state.npcs[TEACHER].skills,before.state.npcs[TEACHER].skills);
 const replay=await lesson(f);assert.deepEqual(replay,out);
});

test('A3 teaching adapter: red line refuses even with caller consent; failed request has no costs or grants',async()=>{
 const f=fixture();f.world.npcs.find(n=>n.id===TEACHER).redLines=['teach'];
 const before=structuredClone(f.document),permission=decide(f);
 assert.equal(permission.allowed,false);assert.equal(permission.decision.outcome,'refuse');
 await assert.rejects(f.engine.reduce(f.document,{tool:'learn',eventId:'no-consent',args:{entity:SKILL,source:TEACHER,consent:true}}),/导师未同意/);
 assert.deepEqual(f.document,before);
});

test('A3 teaching adapter: native purpose/expiry grant is used, revoked or wrong-subject grant cannot replace willingness',()=>{
 const f=fixture(),fact=grant(f);f.world.npcs.find(n=>n.id===TEACHER).redLines=['teach'];
 assert.equal(decide(f).kind,'given');assert.equal(decide(f).source,fact.id);
 const frame=createRuntimePrimitiveFrame(f.engine,f.document,{actor:TEACHER,eventId:'revoke-teaching',source:{kind:'catalog',id:'test:teacher-consent'}});
 f.document=applyPatches(f.document,commitPrimitives(f.document,[{op:'emit',verb:'consent_revoked',target:'player',visibility:'private',payload:{consent:fact.id}}],frame).patches);
 assert.equal(decide(f).allowed,false);
 const g=fixture();g.world.npcs.find(n=>n.id===TEACHER).redLines=['teach'];grant(g,'skill_other');assert.equal(decide(g).allowed,false);
 const h=fixture();h.world.npcs.find(n=>n.id===TEACHER).redLines=['teach'];grant(h,SKILL,120);assert.equal(decide(h).allowed,false);
});

test('A3 teaching adapter: actual service obligation covers only its teacher, learner, subject and active duration',()=>{
 const f=fixture(),d=f.engine.primitiveDraft(f.document),now=f.document.state.minute;
 const opened=openObligation(d,f.engine,{obligationKind:'service',debtor:TEACHER,creditor:'player',actor:TEACHER,subject:SKILL,deadline:now+120,terms:{service:'teach'}},'a3-teaching-service');
 f.document=applyPatches(f.document,d.patches);f.world.npcs.find(n=>n.id===TEACHER).redLines=['teach'];
 const permission=decide(f);assert.equal(permission.kind,'service');assert.equal(permission.source,opened.id);
 const wrong=teachingConsent(f.engine.primitiveDraft(f.document),f.engine,{teacher:TEACHER,subject:'skill_other',minutes:120,eventId:'wrong'});assert.equal(wrong.allowed,false);
 const ended=f.engine.primitiveDraft(f.document);closeObligation(ended,f.engine,{id:opened.id,actor:TEACHER,reason:'terminated'},'a3-end-service');
 f.document=applyPatches(f.document,ended.patches);assert.equal(decide(f).allowed,false);
});
