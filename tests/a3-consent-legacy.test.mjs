import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {withLedger} from '../server-plugin/ledger.mjs';
import {openHoldings} from '../server-plugin/holdings.mjs';
import {createRuntimePrimitiveFrame} from '../server-plugin/primitives-runtime.mjs';
import {commitPrimitives} from '../server-plugin/primitives.mjs';
import {consent} from '../server-plugin/action-consent.mjs';
import {assertSpellConsent,hasSpellConsent,personSpellConsent} from '../server-plugin/magic-consent.mjs';
import {prepareMagic,applyMagic} from '../server-plugin/magic.mjs';
import {advanceMindSpace,mindSleeping,mindSleepUntil} from '../server-plugin/magic-mind-space.mjs';
import {advanceRitualEffects} from '../server-plugin/magic-ritual.mjs';
import {recordLocalContact} from '../server-plugin/environment.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';

const original=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const NPC='npc_hw_linsui',PLACE='bld_hw_qingdeng';
function fixture(){
 const world=structuredClone(original);
 for(const n of world.npcs){n.tier='fixture';delete n.schedule;}
 world.npcs.find(n=>n.id===NPC).profileStatus='full';
 for(const key of ['weather','settlementTrade','worldClock','hazardClock','factionClock'])delete world.rules[key];
 for(const f of world.factions)delete f.clock;
 const heal={id:'spell_a3_consent_heal',name:'同意接点治疗',stage:0,mp:2,minutes:1,skill:world.skills[0].id,difficulty:10,materials:[],duration:0,effectSpec:{kind:'heal',power:2}};
 const sleep={...heal,id:'spell_a3_consent_sleep',name:'同意接点安眠',duration:60,rangeMeters:10,targeting:{lineOfSight:true,consent:'mental_magic'},effectSpec:{kind:'mind_space',operation:'sleep',power:10}};
 world.spells.push(heal,sleep);
 const engine=new WorldEngine(world);
 let document=withLedger(engine,engine.initialFromLegacy(seed,'a3-consent')).document;
 document.holdings=openHoldings(engine,document);
 document.state.location=PLACE;document.state.creatures={};
 Object.assign(document.state.npcs[NPC],{location:PLACE,status:'正常',activity:'休息',hp:20,maxHp:100,trust:80,intelligence:{level:1,growth:0},goals:{}});
 Object.assign(document.state.player,{mp:10000,maxMp:10000,companions:[]});
 for(const c of [heal,sleep]){document.state.spells[c.id]={source:{type:'fixture'}};document.state.skills[c.skill]={proficiency:1000,daily:{},breakthroughs:[]};}
 const f={world,engine,document,heal,sleep,serial:0};contact(f);return f;
}
const draft=f=>f.engine.primitiveDraft(f.document);
function contact(f){const d=draft(f);recordLocalContact(d,f.engine,NPC,`contact-${++f.serial}`);f.document=applyPatches(f.document,d.patches);}
function emit(f,actor,verb,payload,target='player'){
 const eventId=`a3-consent-${++f.serial}`,frame=createRuntimePrimitiveFrame(f.engine,f.document,{actor,eventId,source:{kind:'catalog',id:'test:native-consent'}});
 const out=commitPrimitives(f.document,[{op:'emit',verb,target,payload,visibility:'private'}],frame);
 f.document=applyPatches(f.document,out.patches);
 return f.document.state.consentEvents.at(-1);
}
const grant=(f,scope,spell,minutes=30)=>emit(f,NPC,'consent_given',{scope,purpose:[spell],until:f.document.state.minute+minutes});
async function request(f,spell=f.heal.id){
 const out=await f.engine.reduce(f.document,{tool:'world_act',eventId:`request-${++f.serial}`,args:{action:'spell.request_consent',slots:{promisor:NPC,location:'healing',content:'仅按所述用途施法',skill:spell,minutes:30}}});
 f.document=applyPatches(f.document,out.patches);return out.result;
}
async function cast(f,spell,extra={}){
 contact(f);
 for(let i=0;i<50;i++){
  const out=await f.engine.reduce(f.document,{tool:'cast',eventId:`cast-${++f.serial}`,args:{spell,target:NPC,...extra}});
  if(out.result.checkSuccess){f.document=applyPatches(f.document,out.patches);assert.equal(out.result.effectFailed,undefined);return out.result;}
 }
 assert.fail('独立样本均未施法成功');
}

test('A3 legacy consent: old permission produces a purpose-bound fact consumed by primitives; revoke crosses both paths',async()=>{
 const f=fixture(),result=await request(f);
 assert.equal(result.registered,true);
 const fact=f.document.state.records[result.authorization];
 assert.equal(fact.grantor,NPC);assert.equal(fact.scope.spell,f.heal.id);
 const context={engine:f.engine,document:f.document};
 assert.equal(consent(context,NPC,'player','healing',{purpose:f.heal.id}).source,result.authorization);
 assert.equal(consent(context,NPC,'player','healing',{purpose:f.sleep.id}).allowed,false);
 emit(f,NPC,'consent_revoked',{consent:result.authorization});
 assert.equal(f.document.state.records[result.authorization].revoked,true);
 assert.equal(hasSpellConsent(draft(f),NPC,result.authorization,'healing',f.heal,undefined,f.engine),false);
 const before=structuredClone(f.document);
 await assert.rejects(cast(f,f.heal.id,{authorization:result.authorization}),/同意/);
 // Contact is a separate observation; a rejected spell cannot charge or heal.
 assert.equal(f.document.state.npcs[NPC].hp,before.state.npcs[NPC].hp);
 assert.equal(f.document.state.player.mp,before.state.player.mp);
 assert.equal(f.document.state.minute,before.state.minute);
});

test('A3 legacy consent: native NPC grant heals through old cast, survives JSON roundtrip and catalog revoke stops it',async()=>{
 const f=fixture(),fact=grant(f,'healing',f.heal.id),before=structuredClone(f.document);
 f.document=JSON.parse(JSON.stringify(f.document));
 const healed=await cast(f,f.heal.id,{authorization:fact.id});
 assert.ok(healed.healed>0);assert.ok(f.document.state.npcs[NPC].hp>before.state.npcs[NPC].hp);
 assert.equal(f.document.state.minute-before.state.minute,1);
 assert.equal(before.state.player.mp-f.document.state.player.mp,f.heal.mp);
 const revoke={tool:'world_act',eventId:'revoke-native-grant',args:{action:'spell.revoke_consent',slots:{promisor:NPC,authorization:fact.id}}};
 const stopped=await f.engine.reduce(f.document,revoke);f.document=applyPatches(f.document,stopped.patches);
 assert.throws(()=>assertSpellConsent(draft(f),f.engine,f.heal,{authorization:fact.id},NPC,'healing'),/同意/);
 const saved=structuredClone(f.document),again=await f.engine.reduce(f.document,{...revoke,eventId:'repeat-revoke-native'});
 assert.equal(again.result.duplicate,true);assert.deepEqual(applyPatches(f.document,again.patches),saved);
});

test('A3 legacy consent: wrong purpose, expired grant and caller boolean cannot authorize; impersonation leaves no state',()=>{
 const f=fixture(),fact=grant(f,'healing',f.heal.id,2),d=draft(f);
 assert.throws(()=>assertSpellConsent(d,f.engine,{...f.heal,id:'spell_other'},{authorization:fact.id,consent:true},NPC,'healing'),/同意/);
 assert.throws(()=>assertSpellConsent(d,f.engine,f.heal,{authorization:'forged',consent:true},NPC,'healing'),/同意/);
 assert.throws(()=>assertSpellConsent(d,f.engine,f.heal,{authorization:fact.id},NPC,'healing',fact.until),/同意/);
 const before=structuredClone(f.document);
 assert.throws(()=>emit(f,'player','consent_given',{from:NPC,scope:'healing',purpose:[f.heal.id],until:fact.until}),{code:'E-CONSENT'});
 assert.deepEqual(f.document,before);
});

test('A3 legacy consent: catalog revocation stops a real grant; caller cannot fill a consent slot',async()=>{
 const f=fixture();
 const menu=worldActions(f.engine,f.document,{target:NPC,limit:100});
 for(const id of ['core:spell.request_consent','core:spell.revoke_consent']){
  const action=menu.actions.find(a=>a.id===id);assert.ok(action,id);assert.equal(action.fill.promisor,NPC);assert.equal(action.blocked,undefined);
 }
 const result=await request(f);
 const out=await f.engine.reduce(f.document,{tool:'world_act',eventId:'catalog-revoke',args:{action:'spell.revoke_consent',slots:{promisor:NPC,authorization:result.authorization}}});
 f.document=applyPatches(f.document,out.patches);
 assert.equal(f.document.state.records[result.authorization].revoked,true);
 const before=structuredClone(f.document);
 await assert.rejects(f.engine.reduce(f.document,{tool:'world_act',eventId:'caller-consent',args:{action:'spell.request_consent',slots:{promisor:NPC,location:'healing',content:'用途',consent:true}}}),/需要对方答应|槽位/);
 assert.deepEqual(f.document,before);
});

test('A3 legacy consent: A2 red line and current task override friendly standing; read is pure',async()=>{
 const f=fixture();f.world.npcs.find(n=>n.id===NPC).redLines=['healing'];
 const before=structuredClone(f.document),denied=personSpellConsent(f.engine,f.document.state,NPC,'healing',{document:f.document,spell:f.heal.id});
 assert.equal(denied.decision,'refuse');assert.deepEqual(denied.trace.map(t=>t.stage),['red_lines','relations','cost_benefit','circumstances','conflicts']);
 assert.deepEqual(f.document,before);
 assert.equal((await request(f)).registered,false);
 assert.equal(f.document.state.consentEvents?.length??0,0);
 delete f.world.npcs.find(n=>n.id===NPC).redLines;
 f.document.state.npcAutonomy={tasks:{busy:{npc:NPC,status:'进行中',start:f.document.state.minute,finish:f.document.state.minute+60}}};
 assert.equal((await request(f)).decision,'defer');
 assert.equal(f.document.state.consentEvents?.length??0,0);
});

test('A3 legacy consent: native grant sustains sleep only until its own expiry and cannot revive after revoke',()=>{
 const f=fixture(),now=f.document.state.minute;
 f.document.state.npcs[NPC].mental={fatigue:80,alertness:10,stress:0,interference:[]};
 const fact=grant(f,'mental_magic',f.sleep.id,5),d=draft(f);
 const prepared=prepareMagic.call(f.engine,d,f.sleep,{target:NPC,authorization:fact.id});
 const result=applyMagic.call(f.engine,d,prepared,'a3-sleep');assert.equal(result.sleeping,true);
 f.document=applyPatches(f.document,d.patches);
 assert.equal(mindSleepUntil(draft(f),NPC,now),now+5);
 f.document.state.minute=now+8;
 const settlement=draft(f);advanceMindSpace(settlement,f.engine,now,now+8);
 f.document=applyPatches(f.document,settlement.patches);
 assert.equal(f.document.state.npcs[NPC].mental.fatigue,77.5);
 assert.equal(mindSleeping(draft(f),NPC),false);
 const g=fixture();g.document.state.npcs[NPC].mental={fatigue:80,alertness:10,stress:0,interference:[]};
 const active=grant(g,'mental_magic',g.sleep.id),gd=draft(g);
 applyMagic.call(g.engine,gd,prepareMagic.call(g.engine,gd,g.sleep,{target:NPC,authorization:active.id}),'a3-revoke-sleep');g.document=applyPatches(g.document,gd.patches);
 emit(g,NPC,'consent_revoked',{consent:active.id});
 assert.equal(mindSleeping(draft(g),NPC),false);
});

test('A3 legacy consent: ritual ward consumes native consent without old authorization row',()=>{
 const f=fixture(),now=f.document.state.minute,spell=f.world.spells.find(c=>c.effectSpec?.operation==='ward');
 const fact=grant(f,'support_magic',spell.id);
 f.document.state.effects.ward={kind:'ritual',operation:'ward',target:NPC,spell:spell.id,authorization:fact.id,started:now,expires:now+20,remaining:3,location:PLACE};
 f.document.state.creatures.monster_a3_spirit={status:'正常',hp:10,location:PLACE,activity:'游荡',spirit:{divine:false,rank:0,nature:'malevolent',interference:{target:NPC,remaining:20,stressPerMinute:1,settled:now}}};
 const d=draft(f);f.document.state.minute=now+5;advanceRitualEffects(d,f.engine,now+5);
 const after=applyPatches(f.document,d.patches);
 assert.equal(after.state.npcs[NPC].mental.stress,2);assert.equal(after.state.effects.ward.remaining,0);
});
