import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage,persistable} from '../server-plugin/storage.mjs';
import {officeScene,officeCall} from './helpers/office-actions.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {commitNpcCrime} from '../server-plugin/npc-crime.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {readStateSection} from '../extension/state-read.mjs';
import {lawView} from '../server-plugin/law.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {actionLines} from '../server-plugin/action-text.mjs';
import {loadActionRegistry} from '../server-plugin/action-registry.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const clerk='npc_bs_031_2',handler='npc_bs_035_1',guard='npc_hw_gucen',victim='npc_hw_linsui',thief='npc_hw_hezhou';
const cases=d=>Object.values(d.state.records).filter(r=>r.category==='legal_case');
// posted：作息里此刻在某地办公的人（如 600 分时在公署的镇长），要在第一次时钟节拍之前就摆到他的岗位；
// 节拍之后再摆位，他已按作息出发（scheduleTravel），摆位报 travelling。
function scene(w=world,{posted=[]}={}){
 const engine=new WorldEngine(w);let initial=engine.createCharacter(seed,{},'s406-filing');
 if(posted.length)initial=officeScene(engine,initial,{location:'bld_bs_office',minute:600,present:posted});
 // 前置条件按作息来：600 分时 linsui、hezhou 的作息就在青灯（前厅接待/预约接待），而 gucen 的作息在村口
 // （loc_hw_gate 村口巡查，480-720）。把他摆在青灯是把一个当值守卫放在岗位之外；引擎只在下一次无关的时钟节拍里
 // 才结算作息，节拍一出现他就出发（见 tools/probe-gucen-travel.mjs）。所以盗窃现场只放 victim、thief，
 // 守卫在报案时到他的岗位（见 atPost）。
 const document=officeScene(engine,initial,{location:'bld_hw_qingdeng',minute:600,present:[victim,thief],coins:100});
 return {engine,document};
}
async function act(f,action,slots,id){
 const input={tool:'world_act',eventId:id,args:{action,slots}},out=await f.engine.reduce(f.document,input);
 assert.notEqual(out.result.receipt?.status,'rejected',JSON.stringify(out.result));
 f.document=applyPatches(f.document,out.patches);return {input,...out,detail:out.result.receipt?.legacy??out.result};
}
// 向守卫报案：玩家去守卫在岗的村口（600-720 作息），而不是把守卫拉到作息之外的地方。
const atPost=f=>officeScene(f.engine,f.document,{location:'loc_hw_gate',minute:f.document.state.minute,present:[guard]});
async function steal(f){
 const before=f.document;
 for(let i=0;i<30;i++){
  const g={engine:f.engine,document:before},out=await act(g,'core:crime.steal',{target:victim,coins:1},`filing-theft-${i}`);
  if(out.detail.success){f.document=g.document;return out;}
 }
 throw Error('No successful independent theft sample');
}
async function submitted(f){
 const stolen=await steal(f);
 f.document=atPost(f);
 const report=await act(f,'core:law.confess',{authority:guard,request:{kind:'confession',incident:stolen.input.eventId}},'filing-confession');
 f.document=officeScene(f.engine,f.document,{location:'bld_bs_watch',minute:f.document.state.minute,present:[clerk,handler]});
 return {stolen,report};
}

test('失窃先转财物，只留私密嫌疑；知情报案与有权受理分别发生',async()=>{
 const f=scene(),before=persistable(f.document),stolen=await steal(f),id=stolen.detail.case;
 assert.equal(f.document.state.player.coins,before.state.player.coins+1);
 assert.equal(f.document.state.npcs[victim].coins,before.state.npcs[victim].coins-1);
 assert.equal(cases(f.document).length,0);assert.equal(lawView(f.engine,f.document).cases.length,0);
 assert.equal(f.document.state.records[id].category,'legal_suspicion');
 assert.equal(readStateSection(f.document.state,'记录')[id],undefined);
 assert.deepEqual(readStateSection({...f.document.state,records:{[id]:f.document.state.records[id]}},'记录'),{});
 assert.equal(f.document.state.records[`world_event:${stolen.input.eventId}`].visibility,'private');
 assert.ok(!Object.values(f.document.state.npcs).some(n=>n.legalKnowledge?.some(k=>k.case===id)));
 f.document=atPost(f);
 const report=await act(f,'core:law.confess',{authority:guard,request:{kind:'confession',incident:stolen.input.eventId}},'separate-report');
 assert.equal(report.detail.accepted,null);assert.equal(cases(f.document).length,0);
 f.document=officeScene(f.engine,f.document,{location:'bld_bs_watch',minute:f.document.state.minute,present:[clerk,handler]});
 const accepted=await act(f,'law:request_decision',{request:report.detail.request,authority:handler},'separate-accept');
 assert.equal(accepted.detail.accepted,true);assert.equal(accepted.detail.convicted,false);
 assert.equal(accepted.detail.decision.source.kind,'npc_decision');assert.equal(accepted.detail.decision.source.actor,handler);
 assert.equal(accepted.detail.decision.source.decision.outcome,'agree');assert.equal(accepted.detail.decision.source.decision.trace.length,5);
 const row=f.document.state.records[accepted.detail.case];assert.equal(row.acceptanceEvent,'separate-accept');assert.equal(row.sourceEvent,stolen.input.eventId);
 assert.deepEqual(row.evidence.map(e=>e.kind),['confession']);assert.equal(row.judgment,undefined);
 assert.deepEqual(auditLedger(f.document.ledger),[]);
});

test('未在场玩家看不到 NPC 失窃内核记录，时间推进不会自动公开或建案',async()=>{
 const f=scene();f.document=applyIntentSetup(f.engine,f.document,{location:'bld_bs_watch'}).document;
 const before=persistable(f.document),d=f.engine.primitiveDraft(f.document);
 const id=commitNpcCrime(d,f.engine,{actor:thief,victim,offense:'theft',need:'money',intelligence:2},f.document.state.minute);
 assert.ok(id);f.document=applyPatches(f.document,d.patches);
 assert.ok(f.document.state.npcs[thief].coins>before.state.npcs[thief].coins);
 const source=f.document.state.records[id].sourceEvent,event=f.document.state.records[`world_event:${source}`];
 assert.equal(event.visibility,'private');assert.ok(!event.witnesses.includes('player'));
 const records={[id]:f.document.state.records[id],[`world_event:${source}`]:event};
 assert.deepEqual(readStateSection({...f.document.state,records},'记录'),{});
 await act(f,'core:time',{minutes:10},'npc-no-automatic-filing');
 assert.equal(cases(f.document).length,0);
 assert.equal(Object.values(f.document.state.records).filter(r=>r.category==='legal_request').length,0);
 assert.equal(f.document.state.records[`world_event:${source}`].visibility,'private');
});

test('未知事实不能报案；经办人须在岗有权，拒绝须有世界内原因',async()=>{
 const f=scene(),{report}=await submitted(f),before=persistable(f.document);
 for(const [action,slots]of [
  ['core:law.report',{authority:clerk,request:{kind:'theft',incident:'unknown'}}],
  ['core:law.report',{authority:clerk,request:{kind:'theft',incident:report.detail.filingSubmission.incident,witnesses:['unknown']}}],
  ['law:request_decision',{request:report.detail.request,authority:clerk}],
  ['law:accept',{request:report.detail.request,authority:handler}],
  ['law:reject',{request:report.detail.request,authority:handler}],
  ['law:reject',{request:report.detail.request,authority:handler,reason:'调用方想让官员拒收'}],
 ]){
  const out=await f.engine.reduce(f.document,{tool:'world_act',eventId:`denied-${action}`,args:{action,slots}});
  assert.equal(out.result.receipt.status,'rejected');assert.deepEqual(out.patches,[]);assert.deepEqual(persistable(f.document),before);
 }
 const absent=applyIntentSetup(f.engine,f.document,{location:'bld_bs_office'}).document;
 const out=await f.engine.reduce(absent,{tool:'world_act',eventId:'off-duty',args:{action:'law:request_decision',slots:{request:report.detail.request,authority:handler}}});
 assert.equal(out.result.receipt.status,'rejected');assert.deepEqual(out.patches,[]);
 // S406b: the caller cannot supply a refusal. A real shove gives the official
 // his own reason to distrust the requester; the NPC library decides what to do.
 await act(f,'core:combat',{target:handler,intent:'shove'},'official-distrust');
 f.document=officeScene(f.engine,f.document,{location:'bld_bs_watch',minute:f.document.state.minute,present:[handler]});
 const decisionBefore=persistable(f.document);
 const rejected=await act(f,'law:request_decision',{request:report.detail.request,authority:handler},'reasoned-rejection');
 assert.equal(rejected.detail.accepted,false);assert.equal(cases(f.document).length,0);
 assert.equal(rejected.detail.decision.source.kind,'npc_decision');assert.notEqual(rejected.detail.decision.source.decision.outcome,'agree');
 assert.ok(rejected.detail.reason);assert.ok(rejected.detail.repair.length);
 assert.ok(rejected.detail.decision.source.decision.trace.find(t=>t.stage==='relations').basis.trust<0);
 assert.equal(f.document.state.records[report.detail.request].decision.sourceEvent,'reasoned-rejection');
 const replayed=await f.engine.reduce(decisionBefore,rejected.input,{replay:true,result:rejected.result});
 assert.deepEqual(persistable(applyPatches(decisionBefore,replayed.patches)),persistable(f.document));
});

test('真实 NPC 偷窃同样先结算；错指被告仍能按证词受理，不能用真相拒收',async()=>{
 const f=scene(),before=persistable(f.document),d=f.engine.primitiveDraft(f.document);
 const id=commitNpcCrime(d,f.engine,{actor:thief,victim,offense:'theft',need:'money',intelligence:2},f.document.state.minute);
 assert.ok(id);f.document=applyPatches(f.document,d.patches);
 assert.equal(cases(f.document).length,0);assert.ok(f.document.state.npcs[thief].coins>before.state.npcs[thief].coins);
 const source=f.document.state.records[id].sourceEvent;
 assert.ok(f.document.state.records[`world_event:${source}`].witnesses.includes('player'));
 f.document=officeScene(f.engine,f.document,{location:'bld_bs_watch',minute:f.document.state.minute,present:[clerk,handler]});
 const report=await act(f,'core:law.report',{authority:clerk,request:{kind:'theft',incident:source,accused:handler}},'wrong-accused');
 assert.equal(cases(f.document).length,0);
 const accepted=await act(f,'law:request_decision',{request:report.detail.request,authority:handler},'accept-wrong-accused');
 const row=f.document.state.records[accepted.detail.case];assert.equal(row.offender,handler);assert.equal(row.judgment,undefined);
 assert.equal(row.evidence[0].source,source);assert.equal(accepted.detail.convicted,false);
 assert.equal(f.document.state.records[id].category,'legal_suspicion');assert.notEqual(row.id,id);
});

test('转述只提供收到的版本；不能从来源事件补出未知物品或其他见证者',async()=>{
 const f=scene(),stolen=await steal(f),source=stolen.input.eventId,reporter='npc_hw_luqing';
 assert.ok(!f.document.state.records[`world_event:${source}`].witnesses.includes(reporter));
 f.document=officeScene(f.engine,f.document,{location:f.document.state.location,minute:f.document.state.minute,present:[reporter]});
 const content=subjectiveView(f.engine,f.document,'player').knowledge.memories.find(m=>m.sourceEvent===source).content;
 await act(f,'core:dialogue.tell',{subject:reporter,source,content},'tell-theft');
 f.document=officeScene(f.engine,f.document,{location:'bld_bs_watch',minute:f.document.state.minute,present:[clerk,reporter]});
 const call={tool:'world_act',eventId:'invented-property',args:{action:'core:law.report',slots:{reporter,authority:clerk,request:{kind:'theft',incident:source,accused:'player',stolen:'item_grain_sack'}}}};
 const refused=await f.engine.reduce(f.document,call);assert.equal(refused.result.receipt.status,'rejected');assert.deepEqual(refused.patches,[]);
 const report=await act(f,'core:law.report',{reporter,authority:clerk,request:{kind:'theft',incident:source,accused:'player'}},'heard-report');
 const row=f.document.state.records[report.detail.request];assert.equal(row.submittedEvidence[0].kind,'statement');assert.equal(row.knownVersion.summary,content);
 assert.equal(row.knownVersion.value,undefined);assert.equal(row.knownVersion.stolen,undefined);assert.equal(row.knownVersion.witnesses,undefined);assert.equal(row.knownVersion.perception,undefined);
 assert.equal(cases(f.document).length,0);
});

test('法典讼费真实入库；余额不足则整笔不立案',async()=>{
 const w=structuredClone(world);
 // A legal fee is a normative input, not a fabricated account balance.
 for(const code of [...w.rules.law.codes??[],...w.rules.law.templates??[]])code.procedure={...code.procedure,costs:{...code.procedure?.costs,filingFee:7}};
 const f=scene(w),{report}=await submitted(f),before=persistable(f.document);
 const accepted=await act(f,'law:request_decision',{request:report.detail.request,authority:handler},'fee-accept');
 assert.equal(accepted.detail.fee,7);assert.equal(f.document.state.player.coins,before.state.player.coins-7);
 assert.equal(f.document.state.records[`legal_treasury:${f.document.state.records[accepted.detail.case].law}`].coins,7);
 assert.deepEqual(auditLedger(f.document.ledger),[]);
 const replayed=await f.engine.reduce(before,accepted.input,{replay:true,result:accepted.result});
 assert.deepEqual(persistable(applyPatches(before,replayed.patches)),persistable(f.document));
 const low=applyIntentSetup(f.engine,before,{coins:0}).document,unchanged=persistable(low);
 const out=await f.engine.reduce(low,{tool:'world_act',eventId:'fee-insufficient',args:{action:'law:request_decision',slots:{request:report.detail.request,authority:handler}}});
 // S406b: fee failure now commits the official's reasoned refusal, not a
 // half payment. Retain the atomic money and no-case guarantees explicitly.
 assert.equal(out.result.receipt.status,'committed');assert.equal(out.result.accepted,false);
 assert.match(out.result.reason,/钱不足/);assert.ok(out.result.repair.length);assert.equal(out.result.decision.source.kind,'filing_rules');
 const refused=applyPatches(low,out.patches);assert.deepEqual(refused.ledger,low.ledger);assert.equal(refused.state.player.coins,low.state.player.coins);
 const text=actionLines({engine:f.engine,action:loadActionRegistry().byId.get('law:request_decision'),before:low,after:refused,args:{authority:handler},result:out.result}).lines.join('\n');
 assert.match(text,/钱不足/);assert.match(text,/备足/);assert.doesNotMatch(text,/[A-Za-z_]/);
 assert.equal(refused.state.records[`legal_treasury:${f.document.state.records[accepted.detail.case].law}`],undefined);
 assert.deepEqual(persistable(low),unchanged);assert.equal(cases(refused).length,0);
 const npc=scene(w),d=npc.engine.primitiveDraft(npc.document);
 const incident=commitNpcCrime(d,npc.engine,{actor:thief,victim,offense:'theft',need:'money',intelligence:2},npc.document.state.minute);
 assert.ok(incident);npc.document=applyPatches(npc.document,d.patches);
 const source=npc.document.state.records[incident].sourceEvent;
 assert.ok(npc.document.state.records[`world_event:${source}`].witnesses.includes(victim));
 npc.document=officeScene(npc.engine,npc.document,{location:'bld_bs_watch',minute:npc.document.state.minute,present:[clerk,handler,victim]});
 const reportNpc=await act(npc,'core:law.report',{reporter:victim,authority:clerk,request:{kind:'theft',incident:source}},'npc-paid-report');
 const priorNpc=persistable(npc.document);
 await act(npc,'law:request_decision',{request:reportNpc.detail.request,authority:handler},'npc-paid-filing');
 assert.equal(npc.document.state.npcs[victim].coins,priorNpc.state.npcs[victim].coins-7);
 assert.equal(npc.document.state.player.coins,priorNpc.state.player.coins);assert.deepEqual(auditLedger(npc.document.ledger),[]);
});

test('罪名未登记时由经办规则拒收；调用方不能代填经办人的结果或理由',async()=>{
 const w=structuredClone(world);
 for(const code of [...w.rules.law.codes??[],...w.rules.law.templates??[]])code.penalties={...code.penalties,theft:null,theft_attempt:null};
 const f=scene(w),{report}=await submitted(f),before=persistable(f.document);
 for(const supplied of [{accept:true},{reject:true},{reason:'调用方写的理由'},{decision:'accept'}]){
  // The raw public handler is also a supported entry; it must not admit
  // forged answers that the dynamic catalog does not offer as input slots.
  await assert.rejects(f.engine.reduce(f.document,{tool:'world_law',eventId:`supplied-${Object.keys(supplied)[0]}`,args:{operation:'request_decision',request:report.detail.request,authority:handler,...supplied}}),/不能替经办人/);
  assert.deepEqual(persistable(f.document),before);
 }
 const out=await act(f,'law:request_decision',{request:report.detail.request,authority:handler},'offense-not-registered');
 assert.equal(out.detail.accepted,false);assert.equal(out.detail.decision.source.kind,'filing_rules');assert.match(out.detail.reason,/未登记.*罪名/);
 assert.ok(out.detail.repair.length);assert.doesNotMatch(out.detail.reason+out.detail.repair.join(''),/[A-Za-z_]/);
 assert.equal(cases(f.document).length,0);assert.deepEqual(f.document.ledger,before.ledger);
 // A refusal's suggested repair must be actionable: the same original
 // knowledge may be submitted again without fabricating another occurrence.
 f.document=officeScene(f.engine,f.document,{location:'loc_hw_gate',minute:f.document.state.minute,present:[guard]});
 const again=await act(f,'core:law.confess',{authority:guard,request:{kind:'confession',incident:report.detail.filingSubmission.incident}},'resubmit-after-refusal');
 assert.equal(again.detail.submitted,true);assert.equal(again.detail.filingSubmission.incident,report.detail.filingSubmission.incident);
});

test('玩家须经过真实任命并在岗，才可自行受理或给出拒绝理由',async()=>{
 const f=scene(world,{posted:['npc_bs_townhead']}),{report}=await submitted(f),name='office_bs_case_handler';
 // 镇长 600 分时作息在公署（480-720），已在 scene 里按作息摆位；此处只是玩家去公署，不再替他摆位。
 f.document=officeScene(f.engine,f.document,{location:'bld_bs_office',minute:f.document.state.minute});
 let step=await officeCall(f.engine,f.document,'apply',{name},'player-filing-apply');f.document=step.document;
 const application=step.result.application;
 await act(f,'core:time',{minutes:60},'player-filing-review-wait');
 step=await officeCall(f.engine,f.document,'decide',{name,request:application,authority:'npc_bs_townhead'},'player-filing-appointment-decision');f.document=step.document;
 assert.equal(step.result.decision.status,'已批准');
 step=await officeCall(f.engine,f.document,'appoint',{name,request:application,authority:'npc_bs_townhead'},'player-filing-appoint');f.document=step.document;
 f.document=officeScene(f.engine,f.document,{location:'bld_bs_watch',minute:f.document.state.minute});
 const base=persistable(f.document),reason='凭据中的失物特征尚不清楚，请补充后再来';
 const denied=await act(f,'law:reject',{request:report.detail.request,authority:'player',reason},'player-own-refusal');
 assert.equal(denied.detail.accepted,false);assert.equal(denied.detail.reason,reason);assert.equal(denied.detail.decision.source.kind,'player');
 assert.equal(cases(f.document).length,0);assert.deepEqual(f.document.ledger,base.ledger);
 f.document=base;
 const accepted=await act(f,'law:accept',{request:report.detail.request,authority:'player'},'player-own-acceptance');
 assert.equal(accepted.detail.accepted,true);assert.equal(accepted.detail.decision.source.kind,'player');assert.equal(accepted.detail.decision.authority,'player');
 assert.equal(cases(f.document).length,1);
 const absent=applyIntentSetup(f.engine,base,{location:'bld_bs_office'}).document;
 const out=await f.engine.reduce(absent,{tool:'world_act',eventId:'player-away-from-desk',args:{action:'law:accept',slots:{request:report.detail.request,authority:'player'}}});
 assert.equal(out.result.receipt.status,'rejected');assert.deepEqual(out.patches,[]);
});

test('报案与受理存档往返及复演保持来源',async t=>{
 const f=scene(),stolen=await steal(f);
 f.document=officeScene(f.engine,f.document,{location:'bld_bs_watch',minute:f.document.state.minute,present:[clerk,handler]});
 const initial=f.document,report=await act(f,'core:law.report',{authority:clerk,request:{kind:'theft',incident:stolen.input.eventId}},'saved-report');
 const accepted=await act(f,'law:request_decision',{request:report.detail.request,authority:handler},'saved-accept');
 const directory=await fs.mkdtemp(path.resolve('.s406-storage-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=(doc,input,options)=>f.engine.reduce(doc,input,options),store=new CampaignStorage(directory,{reducer,snapshotEvery:1});
 await store.create({id:'filing',worldVersion:world.version,document:initial});
 for(const out of [report,accepted])await store.transact('filing',{id:out.input.eventId,input:out.input},reducer);
 const reopened=await new CampaignStorage(directory,{reducer}).read('filing');assert.deepEqual(persistable(reopened.document),persistable(f.document));
 assert.deepEqual((await store.import(await store.export('filing'),'filing_copy')).document,reopened.document);
 for(const out of [stolen,report,accepted])assert.deepEqual((await f.engine.reduce(reopened.document,out.input)).patches,[]);
 let replay=initial;
 for(const out of [report,accepted]){const next=await f.engine.reduce(replay,out.input,{replay:true,result:out.result});replay=applyPatches(replay,next.patches);}
 assert.deepEqual(persistable(replay),persistable(f.document));
 const changed=structuredClone(world);
 for(const code of [...changed.rules.law.codes??[],...changed.rules.law.templates??[]])code.procedure={...code.procedure,costs:{filingFee:999}};
 for(const faction of changed.factions)for(const office of faction.offices??[])if([clerk,handler].includes(office.holder))office.receptionHours=[[0,1]];
 const updated=new WorldEngine(changed);let oldDecisions=initial;
 for(const out of [report,accepted]){const next=await updated.reduce(oldDecisions,out.input,{replay:true,result:out.result});oldDecisions=applyPatches(oldDecisions,next.patches);}
 // Author data may refresh office facts on load; persisted filings, their
 // events and their money must retain the previously recorded outcomes.
 for(const id of [report.detail.request,accepted.detail.case,`world_event:${report.input.eventId}`,`world_event:${accepted.input.eventId}`])assert.deepEqual(persistable(oldDecisions.state.records[id]),persistable(f.document.state.records[id]));
 assert.equal(oldDecisions.state.player.coins,f.document.state.player.coins);assert.deepEqual(oldDecisions.ledger,f.document.ledger);
});
