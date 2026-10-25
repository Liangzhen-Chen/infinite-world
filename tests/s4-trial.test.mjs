import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeTrial,trialCall,trialScene,trialPeople as p} from './helpers/trial-actions.mjs';
import {trialEvidenceScore} from '../server-plugin/legal-appeal.mjs';
import {applyPatches,persistable,CampaignStorage} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {caseProcedureView,lawView} from '../server-plugin/law.mjs';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {dedicatedCoinAccount} from '../server-plugin/money.mjs';

test('新审理缺本罪证据程序数据时拒绝，不以旧固定权重猜测定罪',async()=>{
 const f=await nativeTrial(),before=structuredClone(f.document);delete f.code.procedure.evidence;
 const out=await f.engine.reduce(f.document,{tool:'world_act',eventId:'missing-evidence-rules',args:{action:'law:request_hearing',slots:{case:f.case,authority:p.judge}}});
 assert.equal(out.result.receipt.status,'rejected');assert.match(out.result.receipt.reason,/权重|阈值/);assert.deepEqual(out.patches,[]);assert.deepEqual(f.document,before);
});

test('证言按提交质量及重复来源评分，评分不读真相；低于本罪阈值不定罪',async()=>{
 const f=await nativeTrial({confess:false,threshold:2}),row=f.document.state.records[f.case];
 const score=trialEvidenceScore(row,f.code);assert.ok(score.score>0&&score.score<2);
 const duplicate=trialEvidenceScore({...row,evidence:[...row.evidence,...row.evidence]},f.code);assert.deepEqual(duplicate,score);
 const full={...row,evidence:[{...row.evidence[0],quality:{stance:0,lineOfSight:1,completeness:1}}]};
 assert.equal(trialEvidenceScore(full,f.code).score,1);
 for(const quality of [{stance:100,lineOfSight:1,completeness:1},{stance:0,lineOfSight:0.3,completeness:1},{stance:0,lineOfSight:1,completeness:0.4}])assert.ok(trialEvidenceScore({...full,evidence:[{...full.evidence[0],quality}]},f.code).score<1);
 const out=await trialCall(f,'request_hearing',{case:f.case,authority:p.judge},'insufficient-hearing');assert.equal(out.detail.convicted,false);
 assert.equal(f.document.state.records[f.case].judgment.fine,0);assert.deepEqual(auditLedger(f.document.ledger),[]);
});

test('定罪来自 NPC 职权裁判，罚款进真实公库且往返、重复事件与复演不重复扣款',async()=>{
 const f=await nativeTrial();
 const before=f.document;
 const denied=await f.engine.reduce(before,{tool:'world_act',eventId:'forged-judgment',args:{action:'law:request_hearing',slots:{case:f.case,authority:p.judge,fine:1,convicted:true}}});
 assert.equal(denied.result.receipt.status,'rejected');assert.deepEqual(denied.patches,[]);
 const heard=await trialCall(f,'request_hearing',{case:f.case,authority:p.judge},'trial-hearing');assert.equal(heard.detail.convicted,true);
 assert.equal(heard.detail.judgment.authoritySource,'npc_judicial_rules');assert.ok(heard.detail.judgment.evidence.items.length);
 // Replay consumes the saved decision and signed fine even if the current
 // procedure would no longer convict this evidence.
 f.code.procedure.evidence.convictionThreshold.theft=99;
 f.code.procedure.fineCollectionSite='bld_bs_watch';
 const reheard=await f.engine.reduce(before,heard.input,{replay:true,result:heard.result});
 f.code.procedure.evidence.convictionThreshold.theft=2;
 delete f.code.procedure.fineCollectionSite;
 assert.deepEqual(persistable(applyPatches(before,reheard.patches)),persistable(f.document));
 const balance=f.document.state.player.coins,paidBefore=f.document;
 const paid=await trialCall(f,'core:law.pay',{case:f.case,authority:p.guard},'trial-payment');
 assert.equal(paid.detail.fine,11);assert.equal(f.document.state.player.coins,balance-11);
 const creditor=f.document.state.obligations[f.document.state.records[f.case].fineObligation].creditor;
 assert.equal(dedicatedCoinAccount(f.document.state,creditor,'legal_treasury').coins,11);assert.equal(f.document.state.minute,paidBefore.state.minute+10);
 assert.deepEqual(auditLedger(f.document.ledger),[]);
 const replay=await f.engine.reduce(paidBefore,paid.input,{replay:true,result:paid.result});
 assert.deepEqual(persistable(applyPatches(paidBefore,replay.patches)),persistable(f.document));
 const saved=JSON.parse(JSON.stringify(f.document));const again=await f.engine.reduce(saved,paid.input);assert.equal(applyPatches(saved,again.patches).state.player.coins,balance-11);
 const root=tmpRoot('s407-save-'),store=new CampaignStorage(root);await store.create({id:'trial',worldVersion:f.engine.world.version,document:persistable(f.document)});assert.deepEqual(persistable((await new CampaignStorage(root).load('trial')).document),persistable(f.document));
});

test('行为时刑罚不被现行刑罚改写，当前程序按罪名阈值审理',async()=>{
 const f=await nativeTrial(),old=f.document.state.records[f.case].normSnapshot.penalty.baseFine;
 f.code.penalties.theft={baseFine:1,valueMultiplier:0};
 const heard=await trialCall(f,'request_hearing',{case:f.case,authority:p.judge},'historical-sanction');assert.equal(heard.detail.judgment.fine,old+1);
 assert.equal(heard.detail.judgment.evidence.threshold,2);
});

test('上诉受理不翻案；按案件种类停止执行，复审维持后可缴罚',async()=>{
 const f=await nativeTrial();await trialCall(f,'request_hearing',{case:f.case,authority:p.judge},'stay-hearing');
 const judgment=structuredClone(f.document.state.records[f.case].judgment);
 const appeal=await trialCall(f,'core:law.appeal',{case:f.case,authority:p.reviewer},'stay-appeal');
 assert.equal(appeal.detail.accepted,true);assert.deepEqual(f.document.state.records[f.case].judgment,judgment);assert.equal(appeal.detail.appeal.staysExecution,true);
 const out=await f.engine.reduce(f.document,{tool:'world_act',eventId:'stayed-pay',args:{action:'core:law.pay',slots:{case:f.case,authority:p.guard}}});
 assert.equal(out.result.receipt.status,'rejected');assert.deepEqual(out.patches,[]);
 const review=await trialCall(f,'request_review',{case:f.case,authority:p.reviewer},'stay-review');assert.equal(review.detail.upheld,true);
 trialScene(f,f.code.court,[p.guard]);await trialCall(f,'core:law.pay',{case:f.case,authority:p.guard},'after-review-pay');
});

test('逃离可执行处回 pursuit，不远程扣款；不停止执行的上诉仍可执行',async()=>{
 const f=await nativeTrial({stays:false});await trialCall(f,'request_hearing',{case:f.case,authority:p.judge},'flee-hearing');
 await trialCall(f,'core:law.appeal',{case:f.case,authority:p.reviewer},'nonstay-appeal');
 trialScene(f,'bld_hw_qingdeng',[p.guard]);const balance=f.document.state.player.coins;
 const out=await trialCall(f,'execute_fine',{case:f.case,authority:p.guard},'flee-execution');assert.equal(out.detail.stage,'pursuit');assert.equal(f.document.state.player.coins,balance);
 trialScene(f,f.code.court,[p.guard]);const paid=await trialCall(f,'execute_fine',{case:f.case,authority:p.guard},'returned-execution');assert.equal(paid.detail.executed,true);
});

test('原件递交不裁判，核验所得真伪与完整度才进入评分，保存与复演保留同一原件',async()=>{
 const f=await nativeTrial({paper:true}),id=f.paper;
 const before=structuredClone(f.document.state.itemInstances[id]);
 await trialCall(f,'submit_evidence',{case:f.case,document:id},'native-paper-submit');
 assert.equal(f.document.state.records[f.case].judgment,undefined);
 assert.equal(f.document.state.itemInstances[id].document.sourceEvent,before.document.sourceEvent);
 const verified=await trialCall(f,'verify_evidence',{case:f.case,document:id,authority:p.reviewer},'native-paper-verify');
 assert.equal(verified.detail.verification.authentic,true);assert.equal(verified.detail.verification.completeness,1);
 assert.equal(lawView(f.engine,f.document).cases.find(c=>c.id===f.case).id,f.case);
 const row=f.document.state.records[f.case],paper=row.evidence.find(e=>e.document===id);
 const support={...paper,verification:{...paper.verification,polarity:1}};
 const good=trialEvidenceScore({...row,evidence:[support]},f.code).score;
 assert.equal(good,3);assert.equal(trialEvidenceScore({...row,evidence:[{...support,verification:{...support.verification,authentic:false}}]},f.code).score,0);
 assert.equal(trialEvidenceScore({...row,evidence:[{...support,verification:{...support.verification,completeness:0.5}}]},f.code).score,good/2);
 assert.equal(caseProcedureView(f.engine,f.document,f.case).stage,'pending');
});

test('已缴案件以同一实物的新原件复审改判，真实返还且后续不得再执行',async()=>{
 const f=await nativeTrial({paper:true,itemTheft:true,stays:false});
 assert.equal(f.document.state.records[f.case].stolen.unit,f.item);
 await trialCall(f,'request_hearing',{case:f.case,authority:p.judge},'refund-hearing');
 const balance=f.document.state.player.coins;
 const paid=await trialCall(f,'core:law.pay',{case:f.case,authority:p.guard},'refund-pay');
 assert.equal(f.document.state.player.coins,balance-paid.detail.fine);
 await trialCall(f,'core:law.appeal',{case:f.case,authority:p.reviewer},'refund-appeal');
 await trialCall(f,'submit_evidence',{case:f.case,document:f.paper},'refund-new-original');
 await trialCall(f,'verify_evidence',{case:f.case,document:f.paper,authority:p.reviewer},'refund-verify');
 const before=f.document,reviewed=await trialCall(f,'request_review',{case:f.case,authority:p.reviewer},'refund-review');
 assert.equal(reviewed.detail.convicted,false);assert.equal(reviewed.detail.refund,paid.detail.fine);
 assert.equal(f.document.state.player.coins,balance);assert.equal(dedicatedCoinAccount(f.document.state,f.document.state.obligations[f.document.state.records[f.case].fineObligation].creditor,'legal_treasury').coins,0);
 assert.deepEqual(auditLedger(f.document.ledger),[]);
 const replay=await f.engine.reduce(before,reviewed.input,{replay:true,result:reviewed.result});assert.deepEqual(persistable(applyPatches(before,replay.patches)),persistable(f.document));
 const blocked=await f.engine.reduce(f.document,{tool:'world_act',eventId:'overturned-execution',args:{action:'law:execute_fine',slots:{case:f.case,authority:p.guard}}});
 assert.equal(blocked.result.receipt.status,'rejected');assert.deepEqual(blocked.patches,[]);
});

test('讼师报价不收费；NPC 本人同意真实签约，修正槽改变权重',async()=>{
 const f=await nativeTrial({advocate:true}),balance=f.document.state.player.coins;
 trialScene(f,'bld_bs_office',[p.reviewer]);
 const quote=await trialCall(f,'core:law.hire_advocate',{case:f.case,authority:p.reviewer,request:{kind:'defense',target:p.reviewer,terms:{case:f.case,quoteOnly:true}}},'advocate-quote');
 assert.equal(quote.detail.accepted,null);assert.equal(f.document.state.player.coins,balance);assert.equal(f.document.state.records[f.case].representation,undefined);
 const unsigned=structuredClone(f.document);
 const hired=await trialCall(f,'core:law.hire_advocate',{case:f.case,authority:p.reviewer},'advocate-contract');
 const rep=hired.detail.representation;assert.ok(rep.contract);assert.ok(rep.consentSource);
 assert.equal(f.document.state.obligations[rep.contract].kind,'service');assert.equal(f.document.state.obligations[rep.contract].debtor,p.reviewer);
 assert.equal(f.document.state.player.coins,balance-rep.paid);

 // Simulate a later legal-data binding at the signing venue. The original
 // service was signed where no code was registered; no Baishi code is authored.
 const oldLocations=[...f.code.locations];f.code.locations.push('bld_bs_office');
 const signedReplay=await f.engine.reduce(unsigned,hired.input,{replay:true,result:hired.result});
 const legacyResult=structuredClone(hired.result);delete legacyResult.obligationSigningVersion;delete legacyResult.signedObligations;
 const legacyReplay=await f.engine.reduce(unsigned,hired.input,{replay:true,result:legacyResult});
 assert.equal(legacyReplay.result.obligationSigningVersion,undefined);
 assert.notEqual(applyPatches(unsigned,legacyReplay.patches).state.obligations[rep.contract].terms.signingLawVersion,f.document.state.obligations[rep.contract].terms.signingLawVersion);
 f.code.locations=oldLocations;
 assert.deepEqual(persistable(applyPatches(unsigned,signedReplay.patches)),persistable(f.document));
 trialScene(f,f.code.court,[p.judge,p.reviewer]);
 const heard=await trialCall(f,'request_hearing',{case:f.case,authority:p.judge},'defended-hearing');
 assert.ok(heard.detail.judgment.evidence.items.every(i=>i.slot==='law:evidenceWeight'));
 assert.ok(heard.detail.judgment.evidenceScore<2);assert.equal(heard.detail.convicted,false);
});

test('NPC 被告的罚款由在场执行人依法扣其账户，不扣报案玩家的钱',async()=>{
 const f=await nativeTrial({confess:false,npcDefendant:true,threshold:0.5});
 await trialCall(f,'request_hearing',{case:f.case,authority:p.judge},'npc-trial-hearing');
 trialScene(f,f.code.court,[p.culprit,p.guard]);
 const own=f.document.state.player.coins,defendant=f.document.state.npcs[p.culprit].coins;
 const paid=await trialCall(f,'execute_fine',{case:f.case,authority:p.guard},'npc-trial-execution');
 assert.equal(paid.detail.executed,true);assert.equal(f.document.state.npcs[p.culprit].coins,defendant-paid.detail.fine);assert.equal(f.document.state.player.coins,own);
 assert.equal(paid.detail.transfer.payment.actor,p.guard);assert.equal(paid.detail.transfer.payment.debtor,p.culprit);assert.deepEqual(auditLedger(f.document.ledger),[]);
});
