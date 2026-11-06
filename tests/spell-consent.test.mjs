import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage}from'../server-plugin/storage.mjs';
import {recordLocalContact}from'../server-plugin/environment.mjs';
import {personMental}from'../server-plugin/entity-view.mjs';
import {personSpellConsent,recordSpellViolation,hasSpellConsent}from'../server-plugin/magic-consent.mjs';
import {prepareMagic,applyMagic}from'../server-plugin/magic.mjs';
import {advanceRituals}from'../server-plugin/magic-ritual.mjs';
import {reviewPlayerFacts}from'../server-plugin/consistency-evidence.mjs';
import {modelToolCall,toolDefinitions}from'../extension/tools.mjs';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from'node:path';

const original=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const npc='npc_hw_linsui',guard='npc_hw_gucen',judge='npc_hw_chenbai';
function fixture(){
 const world=structuredClone(original);
 for(const n of world.npcs){n.tier='fixture';delete n.schedule;}
 world.npcs.find(n=>n.id===npc).profileStatus='full';
 delete world.rules.weather;delete world.rules.settlementTrade;delete world.rules.worldClock;
 delete world.rules.hazardClock;delete world.rules.factionClock;
 for(const f of world.factions)delete f.clock;
 const spells=[
  {id:'spell_consent_heal',name:'同意测试治疗',effectSpec:{kind:'heal',power:2},duration:0},
  {id:'spell_consent_support',name:'同意测试护身',effectSpec:{kind:'protection',power:2,damageTypes:['physical'],stacking:'strongest'},duration:10},
  {id:'spell_consent_compel',name:'同意测试强迫',effectSpec:{kind:'status',status:'compulsion',power:1},targeting:{lineOfSight:true,permit:'mental_magic'},rangeMeters:10,duration:1},
  {id:'spell_consent_area',name:'同意测试治疗区域',effectSpec:{kind:'area',power:1,radiusMeters:3,intervalMinutes:1,trigger:'pulse',effect:{kind:'heal',power:1}},targeting:{lineOfSight:true},rangeMeters:5,duration:5},
  {id:'spell_consent_comfort',name:'同意测试宽慰',school:'精神',effectSpec:{kind:'mind_space',operation:'comfort',power:10},targeting:{lineOfSight:true,consent:'mental_magic',permit:'mental_magic'},rangeMeters:5,duration:30},
 ];
 for(const c of spells)Object.assign(c,{stage:0,mp:2,minutes:1,skill:world.skills[0].id,difficulty:10,materials:[]});
 world.spells.push(...spells);
 const engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'consent');
 doc.state.creatures={};
 Object.assign(doc.state.player,{mp:100000,maxMp:100000,companions:[]});
 doc.state.location='bld_hw_qingdeng';
 Object.assign(doc.state.npcs[npc],{location:doc.state.location,status:'正常',activity:'休息',hp:20,maxHp:100,trust:80,intelligence:{level:1,growth:0}});
 for(const id of [guard,judge])doc.state.npcs[id].location=doc.state.location;
 for(const c of world.spells){doc.state.spells[c.id]={source:{type:'fixture'}};doc.state.skills[c.skill]={proficiency:1000,daily:{},breakthroughs:[]};}
 for(const item of world.items)doc.state.inventory[item.id]={quantity:100};
 // A1：引擎在自己的世界副本上工作；夹具的世界改指引擎世界（断言不动）
 const s={world:engine.world,engine,doc,serial:0,spells};contact(s);return s;
}
function draft(s){return{document:s.doc,get:(...p)=>structuredClone(p.reduce((v,k)=>v?.[k],s.doc)),set:(p,v)=>{let o=s.doc;for(const k of p.slice(0,-1))o=o[k]??={};o[p.at(-1)]=structuredClone(v);},remove:p=>{let o=s.doc;for(const k of p.slice(0,-1))o=o[k];delete o[p.at(-1)];},say:()=>{}};}
function contact(s){recordLocalContact(draft(s),s.engine,npc,`contact-${++s.serial}`);}
async function run(s,tool,args,id=`consent-${++s.serial}`){
 const call=modelToolCall(tool,args),schema=toolDefinitions().find(t=>t.function.name===call.tool).function.parameters;
 for(const k of Object.keys(call.args))assert.ok(schema.properties[k],k);
 const out=await s.engine.reduce(s.doc,{...call,eventId:id});s.doc=applyPatches(s.doc,out.patches);return out.result;
}
const request=(s,action,extra={})=>run(s,'world_promise',{operation:'grant_access',promisor:npc,location:action,content:'仅按所述用途施法',minutes:30,...extra});
async function cast(s,spell,extra={}){
 contact(s);
 for(let i=0;i<50;i++){
  const out=await s.engine.reduce(s.doc,{...modelToolCall('world_cast',{spell,target:npc,...extra}),eventId:`cast-${++s.serial}`});
  if(out.result.checkSuccess){s.doc=applyPatches(s.doc,out.patches);assert.equal(out.result.effectFailed,undefined);return out.result;}
 }
 assert.fail('独立施法样本均失败');
}

test('公开工具登记三类本人同意；请求不自动签发，保存与重放保留范围期限',async t=>{
 const s=fixture();
 for(const action of ['mental_magic','support_magic','healing']){
  const spell=action==='mental_magic'?s.world.spells.find(c=>c.effectSpec?.operation==='spirit_sense').id:action==='healing'?s.spells[0].id:s.spells[1].id;
  const proposed=await request(s,action,{skill:spell});assert.equal(proposed.registered,false);assert.equal(proposed.authorization,undefined);
  const agreed=await request(s,action,{skill:spell,consent:true});assert.equal(agreed.registered,true);
  const row=s.doc.state.records[agreed.authorization];assert.equal(row.grantor,npc);assert.equal(row.subject,npc);assert.equal(row.grantee,'player');
  assert.deepEqual(row.scope,{location:s.doc.state.location,spell});assert.equal(row.expires-row.createdAt,30);
  assert.deepEqual(reviewPlayerFacts(s.doc.state).authorizations[agreed.authorization].scope,row.scope);
 }
 const root=await fs.mkdtemp(path.join(tmpRoot(),'c1-consent-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const reducer=(doc,event)=>s.engine.reduce(doc,event),storage=new CampaignStorage(root,{reducer});
 await storage.create({id:'consent',worldVersion:s.world.version,document:s.doc});
 const input={...modelToolCall('world_promise',{operation:'grant_access',promisor:npc,location:'healing',content:'恢复生命',minutes:20,consent:true}),eventId:'persist-consent'};
 const transaction={id:input.eventId,anchor:'consent',input};await storage.transact('consent',transaction,reducer);
 const fresh=new CampaignStorage(root,{reducer}),saved=(await fresh.read('consent')).document;
 assert.equal(saved.state.records['permission_persist-consent'].subject,npc);
 await fresh.transact('consent',transaction,reducer);assert.deepEqual((await fresh.read('consent')).document,saved);
});

test('NPC拒绝与附条件由当前立场、关系、灵智和法律处境派生，读取不写回',async()=>{
 const s=fixture(),a=s.doc.state.npcs[npc];a.trust=-70;
 assert.equal((await request(s,'healing',{consent:true})).decision,'refuse');
 a.trust=0;a.hp=a.maxHp;
 const before=structuredClone(s.doc),view=personSpellConsent(s.engine,s.doc.state,npc,'support_magic');
 assert.equal(view.decision,'conditional');assert.deepEqual(s.doc,before);
 assert.equal((await request(s,'support_magic',{consent:true})).registered,false);
 const conditional=await request(s,'support_magic',{skill:s.spells[1].id,consent:true});assert.equal(conditional.registered,true);
 a.trust=80;a.intelligence.level=3;
 assert.equal(personSpellConsent(s.engine,s.doc.state,npc,'healing').conditions.maximumMinutes,30);
 a.intelligence.level=1;assert.equal(personSpellConsent(s.engine,s.doc.state,npc,'healing').decision,'agree');
 a.relationships={player:{trust:-80}};assert.equal(personSpellConsent(s.engine,s.doc.state,npc,'healing').decision,'refuse');delete a.relationships;
 s.doc.state.records.hold={category:'legal_detention',subject:npc,status:'生效',minute:s.doc.state.minute,expires:s.doc.state.minute+30};
 assert.equal(personSpellConsent(s.engine,s.doc.state,npc,'healing').decision,'refuse');delete s.doc.state.records.hold;
 a.mental={fatigue:0,stress:90,alertness:20,interference:[]};assert.equal(personSpellConsent(s.engine,s.doc.state,npc,'healing').decision,'refuse');
 delete a.mental;a.location='loc_hw';assert.equal(personSpellConsent(s.engine,s.doc.state,npc,'healing').decision,'refuse');
});

test('生效同意能实际施法；不同法术、撤销、到期、伪造签发人与完成时失效均不能授权',async()=>{
 const s=fixture(),grant=await request(s,'healing',{skill:s.spells[0].id,consent:true});
 const healed=await cast(s,s.spells[0].id,{authorization:grant.authorization});assert.ok(healed.healed>0);
 const row=s.doc.state.records[grant.authorization];
 assert.equal(hasSpellConsent(draft(s),npc,grant.authorization,'healing',{id:'spell_other'}),false);
 const prepared=prepareMagic.call(s.engine,draft(s),s.spells[0],{target:npc,authorization:grant.authorization});
 await run(s,'world_promise',{operation:'revoke_access',promisor:npc,authorization:grant.authorization});
 assert.equal(s.doc.state.records[grant.authorization].revoked,true);
 assert.match(applyMagic.call(s.engine,draft(s),prepared,'revoked-completion').effectFailed,/同意/);
 await assert.rejects(cast(s,s.spells[0].id,{authorization:grant.authorization}),/同意/);
 const next=await request(s,'healing',{consent:true,minutes:1});s.doc.state.minute=s.doc.state.records[next.authorization].expires;
 await assert.rejects(cast(s,s.spells[0].id,{authorization:next.authorization}),/同意/);
 const fake={...row,revoked:false,expires:s.doc.state.minute+100,grantor:guard};s.doc.state.records.fake=fake;
 await assert.rejects(cast(s,s.spells[0].id,{authorization:'fake'}),/同意/);
});

test('强施由显式force发起，按实际法域立案与裁定；急救仅限独立法典配置',async()=>{
 const s=fixture(),before=structuredClone(s.doc);
 await assert.rejects(run(s,'world_cast',{spell:s.spells[0].id,target:npc}),/同意/);assert.deepEqual(s.doc,before);
 const forced=await cast(s,s.spells[0].id,{force:true}),incident=s.doc.state.records[forced.case];
 assert.equal(incident.offense,'unconsented_magic');assert.equal(incident.law,'law_hw_property');assert.ok(incident.witnesses.includes(npc));
 await run(s,'world_law',{operation:'confess',case:forced.case,authority:guard});
 s.doc.state.location='bld_hw_council';s.doc.state.npcs[judge].location=s.doc.state.location;
 const hearing=await run(s,'world_law',{operation:'hear',case:forced.case,authority:judge});assert.equal(hearing.convicted,true);assert.equal(hearing.judgment.fine,30);
 const e=fixture();Object.assign(e.doc.state.npcs[npc],{status:'濒死',hp:0,dyingSince:e.doc.state.minute});
 const saved=structuredClone(e.doc),emergency=await cast(e,e.spells[0].id);assert.equal(emergency.case,undefined);assert.ok(emergency.healed>0);
 e.doc=saved;e.world.rules.law.emergencyHealing.laws=[];
 await assert.rejects(cast(e,e.spells[0].id),/同意/);
 await assert.rejects(cast(e,e.spells[1].id),/同意/);
});

test('强迫与改记忆持同意或许可仍属重罪，政体可覆盖处罚',()=>{
 const s=fixture(),d=draft(s),now=s.doc.state.minute;
 s.doc.state.records.consent={category:'authorization',action:'mental_magic',subject:npc,grantor:npc,grantee:'player',expires:now+100};
 for(const [id,spec,offense]of [['compel',{kind:'status',status:'compulsion'},'compulsion'],['rewrite',{kind:'mind_space',operation:'rewrite_memory'},'memory_tampering']]){
  const c={id,...{effectSpec:spec}},key=recordSpellViolation(d,s.engine,c,{authorization:'consent',permit:'valid'},npc,id);
  assert.equal(s.doc.state.records[key].offense,offense);assert.equal(s.world.rules.law.spellConsent.penalties[offense].severity,'重罪');
 }
});

test('实际强迫施法持双方同意和机构许可仍立重罪案，裁定读取本法典覆盖',async()=>{
 const s=fixture(),spell=s.spells[2].id,grant=await request(s,'mental_magic',{skill:spell,consent:true});
 // S4 pins the actual statute when the crime occurs. Publish this override
 // before the act; a later amendment must not rewrite the case's penalty.
 s.world.rules.law.codes[0].penalties.compulsion={baseFine:123,valueMultiplier:0};
 s.doc.state.records.permit={category:'authorization',action:'mental_magic',subject:'player',location:s.doc.state.location,grantor:guard,grantee:'player',expires:s.doc.state.minute+1000};
 const result=await cast(s,spell,{authorization:grant.authorization,permit:'permit'});
 assert.equal(s.doc.state.records[result.case].offense,'compulsion');
 s.world.rules.law.codes[0].penalties.compulsion={baseFine:456,valueMultiplier:0};
 await run(s,'world_law',{operation:'confess',case:result.case,authority:guard});
 s.doc.state.location='bld_hw_council';s.doc.state.npcs[judge].location=s.doc.state.location;
 const hearing=await run(s,'world_law',{operation:'hear',case:result.case,authority:judge});assert.equal(hearing.judgment.fine,123);
});

test('区域治疗逐人消费有范围的同意，显式强施逐受术者立案',async()=>{
 const s=fixture(),spell=s.spells[3].id;
 const normal=await cast(s,spell,{target:'player'});assert.ok(normal.outcomes.some(r=>r.target===npc&&r.skipped));
 const grant=await request(s,'healing',{skill:spell,consent:true});
 const accepted=await cast(s,spell,{target:'player',authorization:grant.authorization});assert.ok(accepted.outcomes.some(r=>r.target===npc&&r.healed>0));
 await run(s,'world_promise',{operation:'revoke_access',promisor:npc,authorization:grant.authorization});
 const forced=await cast(s,spell,{target:'player',force:true});assert.ok(forced.outcomes.some(r=>r.target===npc&&r.healed>0));
 assert.ok(Object.values(s.doc.state.records).some(r=>r.category==='legal_case'&&r.victim===npc&&r.offense==='unconsented_magic'));
});

test('未累积精神状态者接受宽慰后状态完整，后续休息能继续结算',async()=>{
 const s=fixture(),spell=s.world.spells.find(c=>c.effectSpec?.operation==='comfort');assert.ok(spell);
 delete s.doc.state.npcs[npc].mental;
 const grant=await request(s,'mental_magic',{skill:spell.id,consent:true});
 s.doc.state.records.permit={category:'authorization',action:'mental_magic',subject:'player',location:s.doc.state.location,grantor:guard,grantee:'player',expires:s.doc.state.minute+1000};
 await cast(s,spell.id,{authorization:grant.authorization,permit:'permit'});
 assert.deepEqual(Object.keys(s.doc.state.npcs[npc].mental).sort(),['alertness','fatigue','interference','stress']);
 await run(s,'world_time',{minutes:2,activity:'休息'});assert.equal(s.doc.state.npcs[npc].mental.stress,0);
});

test('T104邪秽干扰为普通角色建立真实压力，护界吸收并受撤销约束，观灵实际减压',async()=>{
 const s=fixture(),d=draft(s);delete s.doc.state.npcs[npc].mental;
 const deity=s.world.deities.find(d=>d.id==='deity_lintel');
 s.world.npcs.find(n=>n.id===npc).combatProfession='profession_priest';s.doc.state.professions.combat='profession_priest';
 s.doc.state.records.ritual_permit={category:'authorization',action:'ritual_officiate',subject:'player',grantee:'player',grantor:npc,deity:deity.id,church:deity.church.name,profession:deity.church.profession,expires:1000000};
 const before=structuredClone(s.doc);assert.equal(personMental(s.engine,s.doc.state,npc).value.stress,0);assert.deepEqual(s.doc,before);
 const ward=s.world.spells.find(c=>c.effectSpec?.operation==='ward'),sense=s.world.spells.find(c=>c.effectSpec?.operation==='spirit_sense');
 assert.ok(ward);assert.ok(sense);
 const support=await request(s,'support_magic',{skill:ward.id,consent:true});
 const castWard=await cast(s,ward.id,{authorization:support.authorization,permit:'ritual_permit'});
 assert.equal(s.doc.state.effects[castWard.effect].authorization,support.authorization);
 assert.equal(hasSpellConsent(d,npc,support.authorization,'support_magic',ward),true);
 const now=s.doc.state.minute;
 s.doc.state.creatures.monster_c1_spirit={status:'正常',hp:10,location:s.doc.state.location,activity:'游荡',spirit:{divine:false,rank:0,nature:'malevolent',interference:{target:npc,remaining:20,stressPerMinute:1,settled:now}}};
 s.doc.state.minute=now+5;advanceRituals(d,s.engine,now+5);assert.equal(s.doc.state.npcs[npc].mental.stress,2);
 await run(s,'world_promise',{operation:'revoke_access',promisor:npc,authorization:support.authorization});
 s.doc.state.minute=now+10;advanceRituals(d,s.engine,now+10);assert.equal(s.doc.state.npcs[npc].mental.stress,7);
 delete s.doc.state.creatures.monster_c1_spirit;
 const mental=await request(s,'mental_magic',{skill:sense.id,consent:true});
 const stress=s.doc.state.npcs[npc].mental.stress;await cast(s,sense.id,{authorization:mental.authorization,permit:'ritual_permit'});
 assert.equal(s.doc.state.npcs[npc].mental.stress,stress-1);
});
