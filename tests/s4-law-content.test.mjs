import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,persistable} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {dedicatedCoinAccount} from '../server-plugin/money.mjs';
import {obligationView} from '../server-plugin/obligation-state.mjs';
import {applicableLawAt,legalCodeAt} from '../server-plugin/law-codes.mjs';
import {institutionOffices} from '../server-plugin/entity-view.mjs';
import {verifyPublished} from '../world/design/s4-law-content-approval.mjs';
import {validateVillageLedger} from '../world/design/w1-village-profiles.mjs';
import {officeScene} from './helpers/office-actions.mjs';
import {trialCall,trialScene} from './helpers/trial-actions.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const p={judge:'npc_hw_chenbai',guard:'npc_hw_gucen',victim:'npc_hw_linsui',handler:'npc_bs_035_1'};
const code=world.rules.law.codes.find(c=>c.id==='law_hw_property');

test('正式五部法典程序覆盖原罪名；所有新数据均有审批回执，篡改失效',async()=>{
 assert.deepEqual(await verifyPublished(world.rules.law.codes,world.rules.law.bindings),{verified:6});
 for(const c of world.rules.law.codes){
  assert.deepEqual(c.procedure.evidence.weights,{eyewitness:1,statement:0.5,confession:2,document:3,mark:1});
  assert.equal(c.procedure.evidence.stanceDiscount,0.5);
  assert.deepEqual(Object.keys(c.procedure.evidence.convictionThreshold).sort(),Object.keys(c.penalties).sort());
  assert.deepEqual(c.procedure.evidence.convictionThreshold,{theft:3,theft_attempt:2,assault:3,assault_attempt:2,homicide:5});
  assert.equal(c.procedure.appealWindowMinutes,4320);
  assert.deepEqual(c.procedure.appealStaysExecution,{criminal:true,civil:false});
  assert.equal(c.procedure.refundOnReversal,true);assert.equal(c.procedure.costs.filingFee,0);
  assert.ok(c.appeal.judges.every(id=>!c.judges.includes(id)));
 }
 const changed=structuredClone(world.rules.law.codes);changed[0].procedure.evidence.weights.document=99;
 await assert.rejects(()=>verifyPublished(changed,world.rules.law.bindings));
 const bindings=structuredClone(world.rules.law.bindings);bindings.find(b=>b.place==='loc_bs').value='law_hw_property';
 await assert.rejects(()=>verifyPublished(world.rules.law.codes,bindings));
 // The old opening-ledger check accepts the complete approved newer edition,
 // but still rejects a procedural edit instead of silently stripping it.
 const village=world.settlementProfiles.find(s=>s.id==='loc_bs_yupo');
 assert.deepEqual(validateVillageLedger(village.details,world),[]);
 const bad=structuredClone(world);
 bad.rules.law.codes.find(c=>c.id==='law_yp_property').procedure.evidence.convictionThreshold.theft=1;
 assert.ok(validateVillageLedger(village.details,bad).includes('运行法典与审核任命不符'));
});

test('白石据垄渠郡王国归属继承西陲章；适用法不冒充可执行法院或任命链',()=>{
 const engine=new WorldEngine(world),document=engine.createCharacter(seed,{},'s4law-baishi');
 assert.equal(applicableLawAt(engine,'bld_bs_watch',document.state).id,'law_royal_xichui');
 assert.equal(applicableLawAt(engine,'bld_bs_office',document.state).id,'law_royal_xichui');
 assert.equal(applicableLawAt(engine,'bld_bs_school',document.state).id,'law_hw_property');
 assert.equal(applicableLawAt(engine,'bld_yp_hall',document.state).id,'law_yp_property');
 assert.equal(legalCodeAt(engine,'bld_bs_watch',document.state),null);
 const offices=institutionOffices(engine,document.state,'faction_bs_government');
 assert.equal(offices.some(o=>o.authority.operations.some(op=>['judge_case','review_case'].includes(op))),false);
 for(const id of ['loc_bs_yupo','loc_bs_weiting','loc_bs_liquan','loc_bs_sangban']){
  const g=world.settlementProfiles.find(s=>s.id===id).details.governance;
  const law=world.rules.law.codes.find(c=>c.id===g.appointment.lawCode);
  assert.ok(law.judges.includes(g.head));assert.ok(g.permissions.head.some(text=>text.includes('审理')));
 }
});

test('正式河湾：真实盗窃报案、NPC本人受理、递证、程序定罪、公库收缴、异人复审',async()=>{
 // Only scene facts are arranged. Statutes, offices, schedules, evidence,
 // judgments, fine obligations and treasury accounts all come from the world/actions.
 const engine=new WorldEngine(world),original=structuredClone(world.rules.law);
 const f={engine,document:officeScene(engine,engine.createCharacter(seed,{},'s4law-closed-loop'),
  {location:'bld_hw_qingdeng',minute:540,present:[p.guard,p.victim],coins:1000})};
 const before=f.document;let incident;
 for(let i=0;i<40;i++){
  const g={engine,document:before},out=await trialCall(g,'core:crime.steal',{target:p.victim,coins:1},`s4law-theft-${i}`);
  if(out.detail.success&&out.detail.witnesses.includes(p.guard)&&out.detail.witnesses.includes(p.victim)){
   f.document=g.document;incident=out;break;
  }
 }
 assert.ok(incident,'must have a real witnessed theft');
 trialScene(f,'bld_hw_qingdeng',[p.guard,p.victim]);
 const report=await trialCall(f,'core:law.report',{authority:p.guard,reporter:p.victim,case:incident.detail.case},'s4law-report');
 assert.equal(report.detail.accepted,null);
 assert.equal(Object.values(f.document.state.records).filter(r=>r.category==='legal_case').length,0);
 trialScene(f,'bld_bs_watch',[p.handler]);
 const accepted=await trialCall(f,'law:request_decision',{authority:p.handler,request:report.detail.request},'s4law-accept');
 assert.equal(accepted.detail.accepted,true);f.case=accepted.detail.case;
 assert.equal(accepted.detail.decision.source.kind,'npc_decision');
 // The defendant's independent confession is filed through the same decision
 // chain; it adds evidence to this case rather than manufacturing another case.
 trialScene(f,'bld_hw_qingdeng',[p.guard]);
 const confession=await trialCall(f,'core:law.confess',{authority:p.guard,request:{kind:'confession',incident:incident.input.eventId}},'s4law-confession');
 trialScene(f,'bld_bs_watch',[p.handler]);
 const added=await trialCall(f,'law:request_decision',{authority:p.handler,request:confession.detail.request},'s4law-accept-confession');
 assert.equal(added.detail.accepted,true);assert.equal(added.detail.case,f.case);
 trialScene(f,code.court,[p.judge,p.guard,p.victim]);
 for(const witness of [p.guard,p.victim]){
  await trialCall(f,'submit_evidence',{case:f.case,witness},`s4law-testimony-${witness}`);
  assert.equal(f.document.state.records[f.case].judgment,undefined);
 }
 const heard=await trialCall(f,'request_hearing',{case:f.case,authority:p.judge},'s4law-hearing');
 assert.equal(heard.detail.convicted,true);assert.equal(heard.detail.judgment.authoritySource,'npc_judicial_rules');
 assert.equal(heard.detail.judgment.evidence.threshold,3);assert.ok(heard.detail.judgment.evidenceScore>=3);
 const row=f.document.state.records[f.case];
 assert.equal(row.appealDeadline,row.judgment.minute+4320);
 trialScene(f,code.court,[p.guard]);
 const balance=f.document.state.player.coins,treasury=dedicatedCoinAccount(f.document.state,'loc_hw','legal_treasury').coins;
 const paidBefore=f.document,paid=await trialCall(f,'core:law.pay',{case:f.case,authority:p.guard},'s4law-pay');
 assert.equal(paid.detail.fine,11);assert.equal(f.document.state.player.coins,balance-11);
 assert.equal(dedicatedCoinAccount(f.document.state,'loc_hw','legal_treasury').coins,treasury+11);
 assert.equal(obligationView(f.document.state,row.fineObligation).owed,0);assert.deepEqual(auditLedger(f.document.ledger),[]);
 const replay=await engine.reduce(paidBefore,paid.input,{replay:true,result:paid.result});
 assert.deepEqual(persistable(applyPatches(paidBefore,replay.patches)),persistable(f.document));
 const reviewer=code.appeal.judges[0];assert.notEqual(reviewer,p.judge);
 assert.equal(world.factions.find(o=>o.id==='faction_huancheng_government').leader,reviewer);
 trialScene(f,code.court,[reviewer]);
 const judgment=structuredClone(f.document.state.records[f.case].judgment);
 const appeal=await trialCall(f,'core:law.appeal',{case:f.case,authority:reviewer},'s4law-appeal');
 assert.equal(appeal.detail.accepted,true);assert.equal(appeal.detail.appeal.staysExecution,true);
 assert.deepEqual(f.document.state.records[f.case].judgment,judgment);
 const reviewed=await trialCall(f,'request_review',{case:f.case,authority:reviewer},'s4law-review');
 assert.equal(reviewed.detail.upheld,true);assert.equal(reviewed.detail.judgment.judge,reviewer);
 assert.equal(f.document.state.player.coins,balance-11);assert.equal(dedicatedCoinAccount(f.document.state,'loc_hw','legal_treasury').coins,treasury+11);
 assert.deepEqual(auditLedger(f.document.ledger),[]);assert.deepEqual(world.rules.law,original);
});
