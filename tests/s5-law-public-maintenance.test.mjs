import test from 'node:test';
import assert from 'node:assert/strict';
import {world,DAY} from './helpers/finance.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {appointOfficeRecord,closeOfficeIncumbents,spendPublic,publicSpent} from '../server-plugin/governance.mjs';
import {questQuotaMonth} from '../server-plugin/entity-view.mjs';
import {publicMaintenanceResponsibility,startPublicProject,advancePublicProjects,abortPublicProject} from '../server-plugin/public-projects.mjs';
import {publicMaintenanceOptions,maintenanceOptions} from '../server-plugin/building-maintenance.mjs';
import {facilityView} from '../server-plugin/facility-state.mjs';
import {advanceFacilities} from '../server-plugin/facilities.mjs';
import {autonomyCandidates,autonomyKind} from '../server-plugin/autonomy-candidates.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {withLedger} from '../server-plugin/ledger.mjs';
import {aliveHoldings,holdingsView} from '../server-plugin/holdings.mjs';
import {changeHolding} from '../server-plugin/transition.mjs';
import {currentControllers} from '../server-plugin/action-authority.mjs';
import {escrow} from '../server-plugin/money.mjs';
import {conservation,reconcile} from './helpers/ledger-audit.mjs';
import {isPublished,entries as approvalEntries,validateDraft,draftFor} from '../world/design/k10b-public-maintenance-approval.mjs';
import {personOffices} from '../server-plugin/entity-view.mjs';
import {publicMaintenanceReport,reportPublicMaintenance} from '../server-plugin/public-projects.mjs';
import {advanceNpcCognition} from '../server-plugin/npc-cognition.mjs';

import {nativeChief,nativeWorker,nativeScenario,settlement,building,village,official,worker,officeId,scenario,proposalAdvance} from './helpers/s5pm-fixture.mjs';
const nativeCandidates=f=>autonomyCandidates(f.e,subjectiveView(f.e,f.doc,nativeChief),{document:f.doc}).filter(c=>c.kind==='public_maintenance'&&c.legacy.building===f.building);
function deliverReport(f){
 const sent=f.mutate(d=>reportPublicMaintenance(d,f.e,f.manager,f.building,'native-report'));
 if(!sent.delivered){
  assert.ok(Number.isSafeInteger(sent.arrive));
  f.mutate(d=>{const before=d.get('state','minute');d.set(['state','minute'],sent.arrive);advanceNpcCognition(d,f.e,before,sent.arrive,'report-arrival');});
 }
 return sent;
}

test('K10b published titles match the frozen approved seven-entry edition',()=>{
 // Publication supersedes the former ownerless premise; no second overlay.
 assert.equal(approvalEntries.length,7);
 for(const entry of approvalEntries)assert.deepEqual(validateDraft(draftFor(entry),entry),[]);
 assert.equal(isPublished(world),true);
 assert.equal(world.locations.find(b=>b.id==='bld_hw_school').owner,'loc_hw');
 assert.equal(world.locations.find(b=>b.id==='bld_hw_post').owner,'faction_bs_government');
 const incomplete=structuredClone(world);delete incomplete.locations.find(b=>b.id==='bld_hw_school').owner;
 assert.equal(isPublished(incomplete),false,'partial publication must retain the before/approval gate');
 assert.equal(approvalEntries.find(e=>e.id==='bld_hw_school-owner').before,undefined,'pre-publication evidence stays frozen');
 for(const id of ['npc_hw_luqing','npc_hw_shendu'])assert.equal(world.npcs.find(n=>n.id===id).relationships.filter(r=>r.with===nativeChief&&r.type==='公事报修').length,1);
});

test('K10b founding maintenance cap derives from ranked office and requires fiscal scope',()=>{
 // Existing ranked head cap (2000 at village rank), not the chief's purse.
 const f=nativeScenario('bld_hw_school'),office=()=>personOffices(f.e,f.doc.state,nativeChief,{power:'public_project'})[0]?.value;
 assert.equal(office().monthlyBudgetCopper,f.w.rules.governance.authority.offices.office_village_head.monthlyBudgetCopper);
 f.w.rules.governance.authority.offices.office_village_head.monthlyBudgetCopper=73;
 assert.equal(office().monthlyBudgetCopper,73);
 f.w.rules.governance.authority.treasury.settlements=f.w.rules.governance.authority.treasury.settlements.filter(id=>id!=='loc_hw');
 assert.equal(office(),undefined);
});

test('K10b school and post managers report via real travel; officials have no remote omniscience',()=>{
 // Manager at facility, chief at council: 0 proposals before delivery, 1
 // after walking the actual route. condition59 =>2 units: wood4/stone2,
 // 960 minutes and24*2=48 copper; manager gains no ownership or office.
 for(const building of ['bld_hw_school','bld_hw_post']){
  const f=nativeScenario(building),before=structuredClone(f.doc);
  assert.equal(nativeCandidates(f).length,0);
  assert.ok(publicMaintenanceReport(f.e,f.doc,f.manager,building));assert.deepEqual(f.doc,before);
  const sent=f.mutate(d=>reportPublicMaintenance(d,f.e,f.manager,building,'travel-report'));
  assert.equal(sent.delivered,false);assert.ok(sent.arrive>before.state.minute);
  assert.equal(nativeCandidates(f).length,0);
  f.mutate(d=>{d.set(['state','minute'],sent.arrive);advanceNpcCognition(d,f.e,before.state.minute,sent.arrive,'arrive');});
  assert.equal(nativeCandidates(f).length,1);
  const quote=publicMaintenanceOptions(f.e,f.doc,nativeChief,building);
  assert.equal(quote.required.wood,4);assert.equal(quote.required.stone,2);assert.equal(quote.laborCost,48);
  assert.equal(publicMaintenanceResponsibility(f.e,f.doc,f.manager,building),null);
  assert.equal(currentControllers({engine:f.e,document:f.doc},building,{ownerOnly:true,principals:true}).includes(f.manager),false);
  assert.ok(f.doc.state.npcs[nativeChief].memoryStream.some(m=>m.kind==='facility_maintenance'&&m.heardFrom===f.manager&&m.entities.includes(building)));
  assert.deepEqual(conservation(f.e,before,f.doc),[]);assert.deepEqual(reconcile(f.e,f.doc).mismatches,[]);
 }
});

test('K10b absent/sleeping manager, missing channel, revoked delegation and resource shortages do not authorize repairs',()=>{
 // 48 wage bill above reserve300 => treasury347 is short by1; wood3
 // is short by1. Neither a rich chief nor a building manager can fill it.
 for(const building of ['bld_hw_school','bld_hw_post']){
  for(const change of [f=>{f.doc.state.npcs[f.manager].location='loc_bs';},f=>{f.doc.state.npcs[f.manager].activity='睡眠';},f=>{f.w.npcs.find(n=>n.id===f.manager).relationships=[];}]){
   const f=nativeScenario(building);change(f);assert.equal(publicMaintenanceReport(f.e,f.doc,f.manager,building),null);
  }
  for(const change of [f=>{f.doc.state.settlements.loc_hw.treasury=347;},f=>{f.doc.state.settlements.loc_hw.wood=3;}]){
   const f=nativeScenario(building);deliverReport(f);change(f);f.doc=withLedger(f.e,{...f.doc,ledger:undefined}).document;
   const before=structuredClone(f.doc);assert.equal(nativeCandidates(f).length,0);assert.deepEqual(f.doc,before);
  }
 }
 const f=nativeScenario('bld_hw_post');delete f.e.byId.get(f.building).publicMaintenance;
 assert.equal(publicMaintenanceResponsibility(f.e,f.doc,nativeChief,f.building),null);
});

test('K10b native school and post remain repairable after a season with public resources',async()=>{
 // Native place/people/routes in the published world.90 days >2
 // actual480-minute shifts plus travel. No project or attendance is inserted.
 for(const building of ['bld_hw_school','bld_hw_post']){
  const f=nativeScenario(building);
  for(let month=0;month<3;month++){
   const out=await f.e.reduce(f.doc,{tool:'world_time',args:{minutes:30*DAY},eventId:`native-season:${building}:${month}`});f.doc=applyPatches(f.doc,out.patches);
  }
  const repairs=Object.values(f.doc.state.projects).filter(p=>p.building===building&&p.creator===nativeChief&&p.projectWork==='repair');
  assert.ok(repairs.some(p=>p.status==='已完成'),`${building}: native manager report must lead to completed public work`);
  assert.ok(facilityView(f.e,f.doc.state,building).factor>0);
  assert.ok(repairs.every(p=>p.public.minutesDone<=p.public.requiredMinutes));
  assert.deepEqual(reconcile(f.e,f.doc).mismatches,[]);
 }
});

test('K10b season with no monthly allowance or no public materials defers native facilities',async()=>{
 // A zero existing-office cap permits0 copper commitments; zero wood cannot
 // fund the minimum2 wood per repair unit. The calendar does not heal either.
 for(const [building,shortage] of [['bld_hw_school','budget'],['bld_hw_post','wood']]){
  const f=nativeScenario(building);
  if(shortage==='budget')f.w.rules.governance.authority.offices.office_village_head.monthlyBudgetCopper=0;
  else f.doc.state.settlements.loc_hw.wood=0;
  f.doc=withLedger(f.e,{...f.doc,ledger:undefined}).document;
  for(let month=0;month<3;month++){
   const out=await f.e.reduce(f.doc,{tool:'world_time',args:{minutes:30*DAY},eventId:`scarce-season:${building}:${month}`});f.doc=applyPatches(f.doc,out.patches);
  }
  assert.equal(Object.values(f.doc.state.projects).filter(p=>p.creator===nativeChief&&p.building===building&&p.projectWork==='repair').length,0);
  assert.equal(nativeCandidates(f).length,0);
  assert.ok(facilityView(f.e,f.doc.state,building).condition<59);
  assert.ok(f.doc.state.npcs[nativeChief].memoryStream.some(m=>m.kind==='facility_maintenance'));
  assert.deepEqual(reconcile(f.e,f.doc).mismatches,[]);
 }
});
const options=f=>publicMaintenanceOptions(f.e,f.doc,official,building);
const candidates=f=>autonomyCandidates(f.e,subjectiveView(f.e,f.doc,official),{document:f.doc}).filter(c=>c.kind==='public_maintenance');
function start(f,event='repair'){
 const o=options(f);
 return f.mutate(d=>startPublicProject(d,f.e,{name:'公共修缮',projectWork:'repair',building,days:o.completionDays,wood:o.required.wood,stone:o.required.stone,workers:[worker]},event,settlement,{actor:official}));
}
function credit(f,project,day,minutes){
 f.mutate(d=>{
  d.set(['state','projects',project,'public','attendance',worker,'days',String(day)],minutes);
  d.set(['state','minute'],(day+1)*DAY);
  advancePublicProjects(d,f.e,{before:day*DAY,after:(day+1)*DAY,id:`day:${day}`});
 });
}

test('公共责任来自现任职权和集体产权；管事、私人业主和原生无预算首领不冒用公账',()=>{
 // One valid office + one public title => one responsibility. Removing either
 // gives zero; managing a building alone confers zero public spending powers.
 const f=scenario();assert.equal(publicMaintenanceResponsibility(f.e,f.doc,official,building).id,officeId);
 // A repair mandate is tied to its funding account, not every office the
 // same person holds. The town contains this village but has no such title.
 f.mutate(d=>appointOfficeRecord(d,f.e,{...f.doc.state.records[officeId],id:'town-office',settlement:'loc_bs'},'town-office'));
 assert.equal(publicMaintenanceResponsibility(f.e,f.doc,official,building,{settlement:'loc_bs'}),null);
 assert.equal(maintenanceOptions(f.e,f.doc,official,building),null);
 assert.throws(()=>f.mutate(d=>spendPublic(d,f.e,{settlement,copper:1,power:'public_project',purpose:'越权',sourceEvent:'unauthorized',actor:worker})),/权限/);
 const before=structuredClone(f.doc);assert.ok(options(f));assert.deepEqual(f.doc,before);
 f.doc.state.records[officeId].status='已免职';assert.equal(options(f),null);
 f.doc.state.records[officeId].status='在任';
 f.mutate(d=>{
  for(const h of aliveHoldings(holdingsView(d.document),{subject:building,kind:'owns'}))changeHolding(d,f.e,{op:'close',id:h.id,reason:'transferred',eventId:'sale'});
  changeHolding(d,f.e,{op:'open',kind:'owns',holder:official,subject:building,terms:{share:1},source:'sale',eventId:'sale-title'});
 });
 assert.equal(options(f),null);
 const expired=scenario();expired.doc.state.minute=180*DAY;assert.equal(options(expired),null);
 // Published public titles still confer no property or spending rights on
 // the teacher/cashier, who only manage and report defects.
 for(const [id,owner] of [['bld_hw_school','loc_hw'],['bld_hw_post','faction_bs_government']]){
  assert.deepEqual(currentControllers({engine:f.e,document:f.doc},id,{ownerOnly:true,principals:true}),[owner]);
  assert.equal(publicMaintenanceResponsibility(f.e,f.doc,'npc_hw_shendu',id),null);
 }
});

test('真实自治提案只押公共材料和工钱，施工前不恢复；同种子重放一致',()=>{
 // condition24: ceil(76/25)=4 units, wood8/stone4,4×480min,
 // treasury wage24×4=96. An administrative30min action does no repair work.
 const f=scenario(),replay=scenario(),before=structuredClone(f.doc),o=options(f);
 assert.equal(o.required.wood,8);assert.equal(o.required.stone,4);assert.equal(o.laborCost,96);
 assert.equal(o.completionDays,4);assert.ok(o.options[0].utility>0);assert.equal(candidates(f).length,1);
 for(const s of [f,replay])proposalAdvance(s);
 assert.deepEqual(f.doc,replay.doc);
 const p=Object.values(f.doc.state.projects).find(p=>p.creator===official&&p.projectWork==='repair');
 assert.ok(p);assert.equal(p.public.escrow,96);assert.equal(p.public.minutesDone,0);
 assert.equal(f.doc.state.settlements[settlement].treasury,904);assert.equal(f.doc.state.settlements[settlement].wood,92);
 assert.equal(f.doc.state.records[`governance_spend:${p.id}`].holder,official);
 assert.equal(f.doc.state.npcs[official].coins,before.state.npcs[official].coins);
 assert.equal(f.doc.state.player.coins,before.state.player.coins);assert.equal(facilityView(f.e,f.doc.state,building).condition,24);
 assert.deepEqual(conservation(f.e,before,f.doc),[]);assert.deepEqual(reconcile(f.e,f.doc).mismatches,[]);
});

test('预算、留底、材料、可用工匠及本人同意不足均暂缓，不靠私囊补齐',()=>{
 // Valid plan needs96 treasury copper above the300 reserve,8 wood,4 stone
 // and one free consenting adult. Each independent shortage offers0 starts.
 for(const alter of [
  f=>{f.doc.state.settlements[settlement].treasury=395;},
  f=>{f.w.rules.governance.authority.offices.office_works_deputy.monthlyBudgetCopper=95;},
  f=>{f.doc.state.settlements[settlement].wood=7;},
  f=>{f.doc.state.npcs[worker].status='患病';},
  f=>{f.w.npcs.find(n=>n.id===worker).redLines=['public_project'];},
  f=>{f.doc.state.records[officeId].status='已免职';}
 ]){
  const f=scenario();alter(f);f.doc=withLedger(f.e,{...f.doc,ledger:undefined}).document;
  const before=structuredClone(f.doc);assert.equal(candidates(f).length,0);assert.deepEqual(f.doc,before);
  // The same preconditions apply to direct execution, not only ranking.
  assert.throws(()=>autonomyKind('public_maintenance').validate(f.e.primitiveDraft(f.doc),f.e,official,{building}),/权限|预算|材料|做工/);
 }
});

test('材料和职权在提案后变化仍拒绝开工；冲突工程和火灾不给第二套维修',()=>{
 // A quote reserves nothing. Losing the last plank or office after preview
 // must produce0 projects and0 payments at real action execution.
 for(const alter of [f=>{f.doc.state.settlements[settlement].wood=0;},f=>{f.doc.state.records[officeId].status='已免职';}]){
  const f=scenario();assert.equal(candidates(f).length,1);alter(f);f.doc=withLedger(f.e,{...f.doc,ledger:undefined}).document;
  const before=structuredClone(f.doc);
  assert.throws(()=>f.mutate(d=>autonomyKind('public_maintenance').execute(d,f.e,official,{building},{actionId:'stale'})),/前提/);
  assert.deepEqual(f.doc,before);
 }
 const f=scenario();f.doc.state.buildings[building].burning=true;assert.equal(options(f),null);
 f.doc.state.buildings[building].burning=false;f.doc.state.projects.other={id:'other',building,status:'施工中'};assert.equal(options(f),null);
});

test('负责人持久偏好允许怠修，预览不重抽，公共设施照常承担停用后果',()=>{
 // A10000‰ extra cost outweighs even90 days' avoided service loss.
 // Repeated previews write0 facts;90 days of genuine wear still apply.
 const f=scenario();f.doc.state.buildings[building].condition=26;f.doc.state.npcs[official].maintenanceDelayPermille=10000;
 assert.equal(facilityView(f.e,f.doc.state,building).factor,0.5);
 const before=structuredClone(f.doc),o=options(f);
 assert.ok(o.options[0].utility<0);assert.equal(candidates(f).length,0);
 assert.deepEqual(options(f),o);assert.deepEqual(f.doc,before);
 f.mutate(d=>{d.set(['state','minute'],90*DAY);advanceFacilities(d,f.e,{before:0,after:90*DAY});});
 assert.equal(options(f).delayPermille,10000);assert.equal(candidates(f).length,0);
 assert.ok(facilityView(f.e,f.doc.state,building).condition<25);assert.equal(facilityView(f.e,f.doc.state,building).factor,0);
 assert.equal(Object.values(f.doc.state.projects).length,0);
});

test('同等可用劳工以现有种子键选择，不按固定人物编号长期抢占',()=>{
 // Two existing adults, both seeking income, one paid slot. Repeated
 // previews of one decision preserve the draw; distinct seeds can hire both.
 const peer=village.details.governance.coordinators.find(id=>id!==official&&id!==worker),chosen=new Set();
 for(let i=0;i<16;i++){
  const f=scenario();Object.assign(f.doc.state.npcs[peer],{coins:0,location:building,status:'正常',activity:'休息',goals:{}});
  f.doc.state.npcs=Object.fromEntries([official,worker,peer].map(id=>[id,f.doc.state.npcs[id]]));
  f.doc.randomSeed=`public-crew:${i}`;f.doc=withLedger(f.e,{...f.doc,ledger:undefined}).document;
  const before=structuredClone(f.doc),a=candidates(f);assert.equal(a.length,1);assert.deepEqual(candidates(f),a);assert.deepEqual(f.doc,before);
  const execute=()=>{const d=f.e.primitiveDraft(before);autonomyKind('public_maintenance').execute(d,f.e,official,{building},{actionId:'crew'});return applyPatches(before,d.patches);};
  const first=execute();assert.deepEqual(execute(),first);
  chosen.add(first.state.projects.project_crew.public.workers[0]);
 }
 assert.deepEqual([...chosen].sort(),[worker,peer].sort());
});

test('真实工时付薪，完工才恢复；旧预算不重复占用，取消退未用款料且幂等',()=>{
 // Cap100 less old30 leaves70 of new commitments. Approve50, work
 // 576min at25/day =>floor(25×576/480)=30 paid, refund20. Old30
 // stays locked. Materials: floor(4×576/960)=2 wood,1 stone used;
 // back wood2/stone1. Treasury1000−old30−new50+refund20=940.
 const f=scenario();f.w.rules.governance.authority.offices.office_works_deputy.monthlyBudgetCopper=100;
 f.doc.state.buildings[building].condition=59;
 const oldWorker=village.details.governance.coordinators.find(id=>id!==official&&id!==worker);
 Object.assign(f.doc.state.npcs[oldWorker],{location:building,coins:0,status:'正常',activity:'休息',goals:{}});
 f.doc=withLedger(f.e,{...f.doc,ledger:undefined}).document;
 const before=structuredClone(f.doc),coins=before.state.npcs[worker].coins;
 // The prior commitment has a real project consumer, rather than money
 // left in an ownerless escrow. Its signed30/day wage survives repricing.
 f.w.rules.governance.authority.treasury.wagePerWorkerDayCopper=30;
 f.mutate(d=>startPublicProject(d,f.e,{name:'已有工程',days:1,wood:0,stone:0,plot:'loc_yp_path',workers:[oldWorker]},'old',settlement,{actor:official}));
 f.w.rules.governance.authority.treasury.wagePerWorkerDayCopper=25;
 const quote=options(f),locked=structuredClone(f.doc);
 assert.throws(()=>f.mutate(d=>startPublicProject(d,f.e,{name:'超额修缮',projectWork:'repair',building,days:3,wood:quote.required.wood,stone:quote.required.stone,workers:[worker]},'over',settlement,{actor:official})),/额度不足/);
 assert.deepEqual(f.doc,locked);
 const {project}=start(f);credit(f,project,0,480);credit(f,project,1,96);
 assert.equal(f.doc.state.projects[project].public.wage,25);assert.equal(f.doc.state.npcs[worker].coins,coins+30);
 assert.equal(facilityView(f.e,f.doc.state,building).condition,59);
 assert.equal(publicSpent(f.doc.state,settlement,questQuotaMonth(f.e,f.doc.state)),80);
 // A current player deputy can cancel a predecessor's public contract.
 f.mutate(d=>{
  closeOfficeIncumbents(d,f.e,settlement,'office_works_deputy',d.get('state','minute'),'replacement');
  appointOfficeRecord(d,f.e,{...f.doc.state.records[officeId],id:'player-deputy',holder:'player'},'player-appointment');
 });
 const canceled=f.mutate(d=>abortPublicProject(d,f.e,{project}));
 assert.deepEqual(canceled.returned,{wood:2,stone:1,copper:20});
 assert.equal(f.doc.state.settlements[settlement].treasury,940);assert.equal(f.doc.ledger.accounts[escrow(project)],0);
 assert.equal(publicSpent(f.doc.state,settlement,questQuotaMonth(f.e,f.doc.state)),60);
 assert.equal(f.doc.state.records['governance_spend:project_old'].copper,30);
 const after=structuredClone(f.doc);assert.equal(f.mutate(d=>abortPublicProject(d,f.e,{project})).duplicate,true);assert.deepEqual(f.doc,after);
 assert.deepEqual(conservation(f.e,before,f.doc),[]);assert.deepEqual(reconcile(f.e,f.doc).mismatches,[]);
});

test('足工1920分钟修复，失去发起人职权不抹已签劳动义务；一季后可继续评估',()=>{
 //4 actual days×480=1920min =>96 copper and condition100. Removal
 // after funding stops new spending but leaves this paid contract intact.
 const f=scenario(),before=structuredClone(f.doc),{project}=start(f);
 f.doc.state.records[officeId].status='已免职';
 for(let day=0;day<4;day++){credit(f,project,day,480);assert.equal(facilityView(f.e,f.doc.state,building).condition,day===3?100:24);}
 assert.equal(f.doc.state.projects[project].status,'已完成');
 assert.equal(f.doc.state.npcs[worker].coins,before.state.npcs[worker].coins+96);
 assert.equal(f.doc.state.projects[project].public.escrow,0);
 assert.deepEqual(conservation(f.e,before,f.doc),[]);assert.deepEqual(reconcile(f.e,f.doc).mismatches,[]);
 f.doc.state.records[officeId].status='在任';
 f.mutate(d=>{d.set(['state','minute'],90*DAY);advanceFacilities(d,f.e,{before:4*DAY,after:90*DAY});});
 assert.ok(options(f));assert.equal(options(f).office.holder,official);
});

test('完整一季推进：已明确公产及现任职责的集体设施可自主施工恢复服务',async()=>{
 // Native hall, native officer and native residents; the same registered
 // campaign title/appointment as above. A season90days exceeds4 workdays
 // plus real travel. No attendance or completion facts are inserted here.
 const f=scenario();
 // As in helpers/finance, materialize only this local scenario's actors;
 // world content, households, routes and all engine clocks remain native.
 f.doc.state.npcs=Object.fromEntries([official,worker].map(id=>[id,f.doc.state.npcs[id]]));
 f.doc=withLedger(f.e,{...f.doc,ledger:undefined}).document;
 for(let month=0;month<3;month++){
  const out=await f.e.reduce(f.doc,{tool:'world_time',args:{minutes:30*DAY},eventId:`season:${month}`});
  f.doc=applyPatches(f.doc,out.patches);
 }
 const repairs=Object.values(f.doc.state.projects).filter(p=>p.creator===official&&p.building===building&&p.projectWork==='repair');
 assert.ok(repairs.length>0);assert.ok(repairs.some(p=>p.status==='已完成'));
 assert.ok(facilityView(f.e,f.doc.state,building).factor>0);
 assert.ok(repairs.every(p=>p.public.minutesDone<=p.public.requiredMinutes));
 assert.deepEqual(reconcile(f.e,f.doc).mismatches,[]);
});
