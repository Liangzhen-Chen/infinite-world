import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,office,noble,DAY,county,village,source} from './helpers/u16.mjs';
import {fiefCandidates,appointmentSource,domainPopulation} from '../server-plugin/noble-state.mjs';
import {upperGovernanceAction,upperAppointment,advanceUpperAppointments,advanceRoyalService,royalServices} from '../server-plugin/high-nobility.mjs';
import {titleAction,advanceTitles,titleBases} from '../server-plugin/titles.mjs';
import {personOffices,settlementHead} from '../server-plugin/entity-view.mjs';
import {tradeTax,assessTradeTax} from '../server-plugin/finance-tax.mjs';
import {advanceLaborMarket} from '../server-plugin/labor-market.mjs';
import {recordEmploymentAttendance} from '../server-plugin/employment-state.mjs';
import {advanceOffices,governanceAction} from '../server-plugin/governance.mjs';
import {unfoldRemoteAt} from '../server-plugin/remote-generation.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';

test('封地按T142与当前级别派生，各爵级不以贡献换封地，非人自治不进入王国封地',()=>{
 const {e,d}=setup(),s=d.get('state');office(d,'player','loc_bs');
 assert.ok(fiefCandidates(e,d.get('state'),'男爵').some(c=>c.id==='loc_bs'&&c.eligible));
 assert.ok(!fiefCandidates(e,d.get('state'),'子爵').some(c=>c.id==='loc_bs'));
 d.set(['state','records','settlement_rank:loc_bs'],{category:'settlement_rank',id:'settlement_rank:loc_bs',level:'城',superior:county});
 assert.ok(fiefCandidates(e,d.get('state'),'子爵').some(c=>c.id==='loc_bs'&&c.eligible));
 office(d,'player',county);assert.ok(fiefCandidates(e,d.get('state'),'伯爵').some(c=>c.id===county&&c.eligible));
 const population=domainPopulation(e,d.get('state'),[county]);d.set(['state','settlements','loc_bs','population'],(d.get('state','settlements','loc_bs','population')??0)+100);assert.equal(domainPopulation(e,d.get('state'),[county]),population+100,'城镇自身居民与下辖村居民均计入，不把行政父级当作人口汇总账');
 const nonhuman=e.world.regions.find(c=>c.category==='county'&&c.control==='nonhuman');assert.ok(!fiefCandidates(e,s,'伯爵').some(c=>c.id===nonhuman.id));
 const counts=e.world.regions.find(p=>p.id==='prov_xichui').counties;for(const c of counts)office(d,'player',c);
 assert.ok(fiefCandidates(e,d.get('state'),'侯爵').some(c=>c.id==='prov_xichui'&&c.eligible));
 office(d,'player','prov_xichui');assert.ok(fiefCandidates(e,d.get('state'),'公爵').some(c=>c.id==='prov_xichui'&&c.eligible));
 noble(d,'npc_yp_shile',[county]);assert.equal(fiefCandidates(e,d.get('state'),'伯爵').find(c=>c.id===county).eligible,false);
});
test('王室服务从在任考评与王都真实委托结案生成世界事件，重复推进不重复记功',()=>{
 const {e,d}=setup();office(d);advanceRoyalService(d,e,{before:99*DAY,after:100*DAY});
 assert.equal(royalServices(d.get('state'),'player').length,1);assert.ok(titleBases(e,d.get('state'))['王室服务']);
 advanceRoyalService(d,e,{before:99*DAY,after:100*DAY});assert.equal(royalServices(d.get('state'),'player').length,1);
 d.set(['state','quests','royal'],{id:'royal',location:'loc_capital',source:{generator:'effect_table',cause:'royal_commission'},fundedBy:{treasury:'loc_capital'},status:'已完成',taker:'player',rewardPaid:60,resolvedAt:100*DAY});
 d.set(['state','records','royal:outcome'],{category:'quest_outcome',quest:'royal',royal:true,supplied:10});
 d.set(['state','quests','private'],{id:'private',location:'loc_capital',status:'已完成',taker:'player',rewardPaid:60,resolvedAt:100*DAY});
 advanceRoyalService(d,e,{before:100*DAY,after:101*DAY});assert.equal(royalServices(d.get('state'),'player').length,2);
});
test('王都真实委托从公库托管，经现有任务工具交付入库后取得王室服务',async()=>{
 const {e,d}=setup();unfoldRemoteAt(d,e,'loc_capital');const scoped=e.scoped(d.document),at=120*DAY;
 d.set(['state','minute'],at);const cash=d.get('state','settlements','loc_capital','treasury'),wood=d.get('state','settlements','loc_capital','wood');
 advanceRoyalService(d,scoped,{before:at-DAY,after:at});const q=Object.values(d.get('state','quests')).find(q=>q.source?.cause==='royal_commission');assert.ok(q);assert.equal(d.get('state','settlements','loc_capital','treasury'),cash-60);
 d.set(['state','location'],'loc_capital');d.set(['state','npcs',q.publisher,'location'],'loc_capital');d.set(['state','inventory','item_wood'],{quantity:10});
 let doc=d.document;for(const [operation,eventId]of [['accept','royal_take'],['complete','royal_complete']]){const out=await e.reduce(doc,{tool:'world_quest',args:{operation,quest:q.id},eventId});doc=applyPatches(doc,out.patches);}
 d.document=doc;advanceRoyalService(d,e.scoped(doc),{before:at,after:at+1});assert.equal(d.get('state','settlements','loc_capital','wood'),wood+10);assert.equal(royalServices(d.get('state'),'player').length,1);assert.equal(d.get('state','inventory','item_wood','quantity')??0,0);
});
test('镇与城有不同任免机构；递件需治理与服务凭据，决定时重核并派生职位权益',()=>{
 const {e,d}=setup();office(d);advanceRoyalService(d,e,{before:99*DAY,after:100*DAY});
 const a=appointmentSource(e,d.get('state'),'loc_bs');assert.equal(a.id,`county-appointments:${county}`);
 d.set(['state','location'],'loc_capital');const result=upperAppointment(d,e,{settlement:'loc_bs'},'town');
 const due=result.pending.due;d.set(['state','minute'],due);advanceUpperAppointments(d,e,{after:due});
 assert.equal(d.get('state','records',result.application,'status'),'已任命');assert.equal(settlementHead(e,d.get('state'),'loc_bs').value,'player');
 assert.equal(personOffices(e,d.get('state'),'player',{settlement:'loc_bs'})[0].value.monthlyQuotaD,40);
 d.set(['state','records','settlement_rank:loc_bs'],{category:'settlement_rank',level:'城',superior:county});
 assert.equal(appointmentSource(e,d.get('state'),'loc_bs').id,'auth_capital_domain_registry');
 assert.equal(personOffices(e,d.get('state'),'player',{settlement:'loc_bs'})[0].value.monthlyQuotaD,120);
 const row=d.get('state','records','governance_office:loc_bs:office_village_head:player');advanceOffices(d,e,{after:row.until});assert.equal(d.get('state','records',row.id,'status'),'已免职');
});
test('男爵请封沿原封册署延迟审定并保留兵役，不凭贡献自动授予',()=>{
 const {e,d}=setup();office(d,'player','loc_bs');d.set(['state','records','legal_detention:win'],{category:'legal_detention',deliveredBy:'player',wanted:'wanted:win'});
 const charter=e.rules.governance.authority.superiors.auth_bs_office_charter,clerk=e.world.npcs.find(n=>n.workplace?.location===charter.seat&&charter.registrars.occupations.includes(n.occupation));
 d.set(['state','location'],charter.seat);d.set(['state','npcs',clerk.id,'location'],charter.seat);d.set(['state','npcs',clerk.id,'activity'],'公署递件');
 const result=titleAction.call(e,d,{operation:'title_petition',name:'男爵',settlement:'loc_bs'},'baron');assert.equal(d.get('state','records','title:player'),undefined);
 d.set(['state','minute'],result.pending.due);advanceTitles(d,e,{after:result.pending.due});const title=d.get('state','records','title:player');assert.equal(title.title,'男爵');assert.deepEqual(title.domains,['loc_bs']);assert.ok(title.levy.men>0);
});
test('上位任免与税令作用于下辖实际消费者；越界和未成年任命被拒',()=>{
 const {e,d}=setup();noble(d);const member='npc_yp_gaoxin';d.set(['state','npcs',member,'location'],d.get('state','location'));
 const result=upperGovernanceAction.call(e,d,{operation:'domain_appoint',settlement:village,member,consent:true},'appoint');assert.equal(result.appointment.holder,member);assert.equal(settlementHead(e,d.get('state'),village).value,member);
 upperGovernanceAction.call(e,d,{operation:'domain_request',settlement:village,choice:'tax',taxBps:900},'tax');assert.equal(tradeTax(e,d.get('state'),village).bps,900);
 const seller='npc_yp_shile',before=d.get('state','settlements',village,'treasury');d.set(['state','npcs',seller,'coins'],1000);
 const paid=assessTradeTax(d,e,{seller,cost:1000,location:village,sourceEvent:'sale'});assert.equal(paid.amount,90);assert.equal(d.get('state','settlements',village,'treasury'),before+90);
 assert.throws(()=>upperGovernanceAction.call(e,d,{operation:'domain_request',settlement:'loc_capital',choice:'tax',taxBps:200},'outside'),/超出/);
 assert.throws(()=>upperGovernanceAction.call(e,d,{operation:'domain_appoint',settlement:county,member,consent:true},'self'),/下级/);
});
test('管事复用雇佣工时和欠薪：离屏办理、实付工资、失去领地后不再执行',()=>{
 const {e,d}=setup();noble(d);const worker='npc_yp_gaoxin',location=d.get('state','location');d.set(['state','npcs',worker,'location'],location);
 const {contract}=upperGovernanceAction.call(e,d,{operation:'domain_steward',settlement:village,steward:worker,consent:true},'steward');
 const {request}=upperGovernanceAction.call(e,d,{operation:'domain_request',settlement:village,choice:'account_report',authorization:contract},'queued');
 const row=d.get('state','records',contract),at=row.nextWork,balance=d.get('state','npcs',worker,'coins');recordEmploymentAttendance(d,worker,row.starts,at,location);
 d.set(['state','minute'],at);advanceLaborMarket(d,e,{before:row.starts,after:at,id:'offscreen'});
 assert.equal(d.get('state','records',request.id,'status'),'已完成');assert.equal(d.get('state','npcs',worker,'coins'),balance+24);
 const debtRequest=upperGovernanceAction.call(e,d,{operation:'domain_request',settlement:village,choice:'tax',taxBps:500,authorization:contract},'debtqueued').request;
 d.set(['state','player','coins'],0);recordEmploymentAttendance(d,worker,row.starts+DAY,at+DAY,location);d.set(['state','minute'],at+DAY);advanceLaborMarket(d,e,{before:row.starts+DAY,after:at+DAY,id:'unpaid'});
 assert.ok(Object.values(d.get('state','records')).some(r=>r.category==='debt'&&r.kind==='wage'&&r.contract===contract));assert.equal(d.get('state','records',debtRequest.id,'status'),'待办理');
 d.set(['state','player','coins'],100);d.set(['state','records','title:player','status'],'已除爵');recordEmploymentAttendance(d,worker,row.starts+2*DAY,at+2*DAY,location);d.set(['state','minute'],at+2*DAY);advanceLaborMarket(d,e,{before:row.starts+2*DAY,after:at+2*DAY,id:'removed'});assert.equal(d.get('state','records',debtRequest.id,'status'),'待办理');assert.equal(d.get('state','records',contract,'status'),'罢工');
});
test('领主雇佣管事复用T126宅基规则，实付当日工资后审批，费用入地方公账',()=>{
 const {e,d}=setup();noble(d);const worker='npc_yp_gaoxin',hall=e.world.settlementProfiles.find(p=>p.id===village).details.governance.meetingPlace,plot=Object.values(e.rules.governance.authority.plots).find(p=>p.settlement===village);
 d.set(['state','location'],hall);d.set(['state','npcs',worker,'location'],hall);d.set(['state','npcs',worker,'activity'],'议事');d.set(['state','records',`civic_resident:${village}:player`],{category:'civic_resident',subject:'player',settlement:village,status:'已登记'});
 const result=upperGovernanceAction.call(e,d,{operation:'domain_steward',settlement:village,steward:worker,consent:true,action:'housing'},'housing_hire');assert.ok(result.authorization);
 const pending=governanceAction.call(e,d,{operation:'governance_queue',settlement:village,action:'housing',authorization:result.authorization,plot:plot.id},'house_application');const job=d.get('state','records',result.contract),before=d.get('state','settlements',village,'treasury');
 recordEmploymentAttendance(d,worker,job.starts,job.nextWork,hall);d.set(['state','minute'],job.nextWork);advanceLaborMarket(d,e,{before:job.starts,after:job.nextWork,id:'housing_shift'});
 assert.equal(d.get('state','records',pending.application,'status'),'已批准');assert.equal(d.get('state','settlements',village,'treasury'),before+plot.feeCopper);assert.ok(d.get('state','records','housing_permit:house_application'));
});
test('正式时间推进读取管事作息，玩家离开后照常领薪并办理待办',async()=>{
 const {e,d}=setup();noble(d);d.set(['state','minute'],540);const worker='npc_yp_gaoxin',location=e.world.households.find(h=>h.members.includes(worker)).homeLocation;d.set(['state','location'],location);for(const n of e.world.npcs)n.schedule=structuredClone(source.npcs.find(p=>p.id===n.id)?.schedule);e.world.npcs.find(n=>n.id===worker).tier='full';d.set(['state','npcs',worker,'location'],location);
 const hired=await e.reduce(d.document,{tool:'world_settlement',args:{operation:'domain_steward',settlement:village,steward:worker,consent:true},eventId:'realhire'});d.document=applyPatches(d.document,hired.patches);
 const queued=await e.reduce(d.document,{tool:'world_settlement',args:{operation:'domain_request',settlement:village,choice:'account_report',authorization:hired.result.contract},eventId:'realqueue'});d.document=applyPatches(d.document,queued.patches);
 const job=d.get('state','records',hired.result.contract),coins=d.get('state','npcs',worker,'coins');d.set(['state','location'],'loc_bs');const waited=await e.reduce(d.document,{tool:'world_time',args:{minutes:job.nextWork-d.get('state','minute')},eventId:'realshift'}),doc=applyPatches(d.document,waited.patches);
 assert.equal(doc.state.records[queued.result.request.id].status,'已完成');assert.equal(doc.state.npcs[worker].coins,coins+24);assert.equal(doc.state.records[job.id].workedMinutes,480);
});
