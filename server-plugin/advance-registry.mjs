import {advanceUpperAppointments,advanceRoyalService} from './high-nobility.mjs';
import {advanceNations} from './nation-founding.mjs';
import {advanceEducation,nextEducationMinute,prepareEducation,educationCourses} from './education.mjs';
import {prepareMedicine,advanceMedicine,nextMedicineMinute} from './medicine.mjs';
import {advanceFacilities,nextFacilityMinute,completeFacilityProject} from './facilities.mjs';
// Time-advance registry. Every system that reacts to elapsed time registers here:
//   {id, order, nextMinute?(engine,d,now), active?(engine,d,now), advance(engine,d,ctx)}
// nextMinute: the next minute this system needs an interval boundary (Infinity when none).
// active: whether the system needs fine-grained stepping at all; if no registered system is
//   active, WorldEngine.advance settles the whole span in one interval.
// advance: runs once per interval, in ascending order; ctx={before,after,id,beforeState,days}.
import {advanceMagicObjects}from'./magic-object.mjs';
import {advanceAirEffects}from'./magic-air.mjs';
import {advanceWaterEarth}from'./magic-water-earth.mjs';
import {advanceCare}from'./magic-care.mjs';
import {advanceMindSpace}from'./magic-mind-space.mjs';
import {advanceShadowContracts,advanceContracts,advanceRituals,advanceRitualEffects}from'./contracts.mjs';
import {advanceCredit,nextCreditMinute}from'./credit.mjs';
import {addObligationSchedule} from './obligation-protocol.mjs';
import {automaticObligationItems} from './obligation-protocol.mjs';
import {advanceLaborMarket,nextLaborMinute} from './labor-market.mjs';
import {settleMagicAreas,nextMagicAreaMinute}from'./magic-area.mjs';
import {milestone}from'./progression.mjs';
import {advancePets,nextPetMinute}from'./pets.mjs';
import {advanceSummons}from'./summons.mjs';
import {advanceLaw}from'./law.mjs';
import {advanceNpcCrime,nextNpcCrimeMinute}from'./npc-crime.mjs';
import {cropProduction}from'./weather.mjs';
import {accrueFoodProduction,advanceAgriculture,settleAgricultureExpiry,advanceForestWater,harvestSettlementWood,settleFuel,farmWaterFactor,bookLegacyFood}from'./agriculture.mjs';
import {advanceSettlementTrade,nextSettlementTradeMinute}from'./settlement-trade.mjs';
import {advanceTransport,nextTransportMinute} from './transport.mjs';
import {advancePost,nextPostMinute} from './post.mjs';
import {advanceShops}from'./shop.mjs';
import {advanceWorldClocks,nextWorldClockMinute}from'./world-clock.mjs';
import {advanceFactionClocks,nextFactionClockMinute,factionClockRules}from'./faction-clock.mjs';
import {advanceFestivals,nextFestivalMinute,festivalCalendar}from'./festival.mjs';
import {advanceWildlife,nextWildlifeEncounterMinute,wildlifeEncounterAt,settleWildlifeEncounter,displaceForestWildlife}from'./wildlife.mjs';
import {advanceBosses}from'./bosses.mjs';
import {advanceNpcCognition,nextNpcCognitionMinute}from'./npc-cognition.mjs';
import {advanceNpcAutonomy,nextNpcAutonomyMinute,catchUpFurnaces}from'./npc-autonomy.mjs';
import {magicEffect}from'./magic-effects.mjs';
import {advanceNpcLife,nextNpcLifeMinute}from'./npc-life.mjs';
import {advanceNpcObligations,nextNpcObligationMinute}from'./npc-obligations.mjs';
import {advanceSocietyNews}from'./monster-society.mjs';
import {advanceSeasonEffects,effectTable}from'./effects.mjs';
import {advanceOrganizations,nextOrganizationMinute}from'./organizations.mjs';
import {isEffective} from './holdings.mjs';
import {advanceFaith}from'./faith.mjs';
import {advanceQuestSources}from'./quest-sources.mjs';
import {advanceTribalAwakening}from'./tribal-awakening.mjs';
import {advanceMilitary}from'./military.mjs';
import {advanceWarDiplomacy}from'./war-diplomacy.mjs';
import {advanceHazardClocks}from'./seasonal-hazards.mjs';
import {hazardClocks,hazardYieldFactor}from'./hazard-calendar.mjs';
import {advanceMagicEconomy,magicYieldFactor}from'./magic-economy.mjs';
import {advanceBounties,nextBountyMinute,bountyActive}from'./bounty.mjs';
import {advanceOffices,nextOfficeMinute}from'./governance.mjs';
import {advanceOfficeSalaries,nextSalaryMinute}from'./office-salary.mjs';
import {advanceTitles,nextTitleMinute}from'./titles.mjs';
import {advanceNotables,nextNotableMinute}from'./notables.mjs';
import {advancePromotion,nextPromotionMinute}from'./promotion.mjs';
import {advancePublicProjects,isPublicProject,advanceHouses,advanceHousing,nextHousingMinute,settleProjectWorks}from'./public-projects.mjs';

const clone=value=>structuredClone(value);
import {personSimulation,personConstraint,personConstraints}from'./entity-view.mjs';
import {PatchCursor,withRecordIndex,recordsMemo,recordsWhere,recordEntriesWhere,canonicalEqual}from'./storage.mjs';
import {advanceLayerPlan,remoteScheduleBatch,ADVANCE_LAYERS}from'./advance-layers.mjs';
import {ScheduleHeap,resolveContest,schedulerWired,clockDiceKey,compareClock,compareDue,PHASE,protocolDueItems,nextProtocolMinute}from'./scheduler.mjs';
import {publishTransitionEvent,beginReactionTick,drainWorldReactions}from'./world-events.mjs';
import {advanceWanted}from'./bounty.mjs';
import {auditLedger}from'./ledger.mjs';
import {holdingRemove,declareHoldingWriter} from './holdings.mjs';
import {advanceHook,registerAdvanceHook} from './advance-hooks.mjs';
export {registerAdvanceHook} from './advance-hooks.mjs';
declareHoldingWriter('advance-registry',{kinds:[]});
const fullNpcs=engine=>(engine.entities??engine.world.npcs).some(n=>n.id?.startsWith('npc_')&&personSimulation(engine,{},n.id).value);
const riteLifecycle=()=>advanceHook('riteLifecycle')?.();
const liveNation=(...args)=>{const hook=advanceHook('liveNation');return hook?hook(...args):true;};
const sameScheduleInputs=(...args)=>{const hook=advanceHook('sameScheduleInputs');return hook?hook(...args):false;};
const sameNpcScheduleInputs=(...args)=>{const hook=advanceHook('sameNpcScheduleInputs');return hook?hook(...args):false;};
const facilityRuntime=()=>{const hook=advanceHook('facilityRuntime');return hook?hook():{hasUnattendedFurnace:()=>true,recordFurnaceDeparture:()=>{}};};
const withScheduleCache=(engine,d,task)=>{const hook=advanceHook('withScheduleCache');return hook?hook(engine,d,task):task();};
export const advanceRegistry=[];
export function registerAdvance(system){
    if(!system||typeof system.id!=='string'||!Number.isFinite(system.order)||typeof system.advance!=='function')throw new Error('推进系统需要 id、order 和 advance');
    if(advanceRegistry.some(s=>s.id===system.id))throw new Error(`推进系统重复：${system.id}`);
    if(system.nextMinute!==undefined&&typeof system.nextMinute!=='function')throw new Error(`推进系统${system.id}的 nextMinute 必须是函数`);
    advanceRegistry.push(system);advanceRegistry.sort((a,b)=>a.order-b.order);
    return ()=>{const i=advanceRegistry.indexOf(system);if(i>=0)advanceRegistry.splice(i,1);};
}
// Next interval boundary: end of span, next midnight, or the earliest registered event.
export function nextAdvanceMinute(engine,d,now,end){
    let next=Math.min(end,(Math.floor(now/1440)+1)*1440);
    for(const system of advanceRegistry)if(system.nextMinute)next=Math.min(next,system.nextMinute(engine,d,now));
    return next;
}
export const advanceNeedsSteps=(engine,d,now)=>advanceRegistry.some(system=>system.active?.(engine,d,now));
// R31: a draft whose every write goes through its PatchCursor can share a records-by-kind index across one pass (storage.mjs recordsWhere).
export function runAdvance(engine,d,ctx){
    return withScheduleCache(engine,d,()=>d?.cursor instanceof PatchCursor?withRecordIndex(()=>runAdvanceSystems(engine,d,ctx)):runAdvanceSystems(engine,d,ctx));
}
// Continuous local processes catch up to reads/actions without introducing a
// clock tick or advancing lastSettled. Their own cursor prevents the next
// scheduled settlement from charging the same elapsed minutes twice.
export function catchUpLocal(engine,d,after){
    const before=d.get('state','scheduler','localUntil')??d.scheduler.lastSettled;
    if(after<=before)return;
    // Roots can draw from a leaking source. Preserve minute order for that
    // shared resource; independent processes retain their existing batch loop.
    const roots=Object.values(d.get('state','effects')??{}).filter(x=>x.kind==='care'&&x.operation==='roots'&&x.expires>before);
    const coupled=roots.some(x=>engine.world.locations.some(p=>p.features?.some(r=>r.id===x.medium&&r.waterEarthProcess)));
    if(coupled)for(let minute=before;minute<after;minute++){
        advanceCare(d,engine,minute,minute+1);
        advanceWaterEarth(d,engine,minute,minute+1);
    }else{
        advanceCare(d,engine,before,after);
        advanceWaterEarth(d,engine,before,after);
    }
    // Settle the elapsed part while expiring effects are still available.
    // Heat owns the shared room/air minute loop; mind-space uses this same
    // local cursor so a later scheduled tick cannot charge the tail twice.
    catchUpFurnaces(d,engine,after);
    advanceMagicObjects(d,engine,after);
    advanceAirEffects(d,engine,before,after);
    advanceMindSpace(d,engine,before,after);
    advanceShadowContracts(d,before,after);
    advanceRitualEffects(d,engine,after);
    // These consumers have already restored temperature/returned reserved
    // water. Locally shortened lifetimes must not leave stale active effects.
    for(const [id,effect]of Object.entries(d.get('state','effects')??{}))if(['care','water_earth'].includes(effect.kind)&&effect.expires<=after)d.remove(['state','effects',id]);
    d.set(['state','scheduler','localUntil'],after);
}
// S2b：推进路径接线开关（schedulerWired）。开启后同刻调度器按 §14.2 阶段与排序键重排推进系统，
// 生产规则显式声明 phase/packId/ruleId；关闭时保持现有 order。
function orderedSystems(d,ctx){
    if(!schedulerWired(d.get('state')))return advanceRegistry;
    return [...advanceRegistry].sort((a,b)=>{
        const phase=(a.phase??PHASE.clock)-(b.phase??PHASE.clock);
        if(phase)return phase;
        if(a.phase===PHASE.due)return compareDue(a,b)||a.id.localeCompare(b.id);
        return compareClock(d.document.randomSeed,ctx.after)({...a,ruleId:a.ruleId??a.id},{...b,ruleId:b.ruleId??b.id});
    });
}
// 接线后的刻集由日程堆唯一确定（14 §14.2）：只有到期项与时钟规则的刻才存在，
// 跨度的终点 end 本身不是刻——它只是把时钟拨到 end。午夜入堆为时钟规则，
// 各系统 nextMinute 入堆为到期项；取 (now, end] 内最小刻，无则返回 null。
export function nextFromScheduleHeap(engine,d,now,end){
    return withRecordIndex(()=>buildScheduleHeap(engine,d,now,end));
}
const deadlineRows=Symbol('scheduled record deadlines');
function scheduleOverrides(engine,constraints){
    const ids=new Set([...constraints.keys(),...constraints.employment.keys(),...constraints.leases.keys(),...constraints.dismissals]);
    for(const [,row]of constraints.offices)ids.add(row.holder);
    for(const row of constraints.stewards)ids.add(row.steward);
    for(const row of constraints.organizations)for(const [id,member]of Object.entries(row.members??{}))if(member.position!=='成员')ids.add(id);
    for(const p of engine.world.settlementProfiles??[])if(p.details?.governance?.head)ids.add(p.details.governance.head);
    return ids;
}
function buildScheduleHeap(engine,d,now,end){
    const heap=new ScheduleHeap();
    const state=d.get('state'),previous=engine.educationCourseContext,prepared=d.scheduleEducation;
    engine.educationCourseContext=educationCourses(engine,state);
    // Other actors' position/activity writes do not change this actor's
    // routine. Education is the cross-person input and is compared explicitly.
    // All other state partitions and every non-physical record must match.
    const reuse=prepared&&Math.floor(prepared.minute/1440)===Math.floor(now/1440)&&sameScheduleInputs({...prepared.state,npcs:state.npcs},state)&&canonicalEqual(prepared.courses,engine.educationCourseContext);
    const staticEnvironment=reuse||prepared&&Math.floor(prepared.minute/1440)===Math.floor(now/1440)&&sameScheduleInputs({...prepared.state,npcs:state.npcs,records:state.records},state)&&canonicalEqual(prepared.courses,engine.educationCourseContext);
    d.scheduleEducation={state,minute:now,courses:engine.educationCourseContext,patchStart:d.patches.length};
    try{
    const midnight=Math.floor(now/1440)*1440+1440;
    if(midnight<=end)heap.add({kind:'clock',minute:midnight,systemIds:[...midnightSystems,'npc_life','office_salaries']});
    for(const system of advanceRegistry)if(system.nextMinute){
        const minute=system.nextMinute(engine,d,now);
        if(minute>now&&minute<=end)heap.add({kind:'due',minute,systemId:system.id});
    }
    // These legacy handlers have no nextMinute hook. Register their actual
    // deadlines, including travel created by the preceding tick.
    const due=(minute,systemIds=['contracts','law','credit','deliveries','society_news'],npcId=null)=>{if(Number.isSafeInteger(minute)&&minute>now&&minute<=end)heap.add({kind:'due',minute,systemIds,npcId});};
    for(const effect of Object.values(state.effects??{})){due(effect.expires,['effect_expiry','summons']);due(effect.nextUpkeep,['summons','contracts']);}
    if(state.player.status==='濒死')due(state.player.dyingSince+engine.rules.death.dyingMinutes,['dying']);
    const scheduledRecords=recordsMemo(state.records,deadlineRows,()=>Object.values(state.records??{}).filter(row=>['debt','bank','contract'].includes(row.category)||['deadline','expires','nextAt','arrivesAt','nextDue','nextWork'].some(key=>Number.isSafeInteger(row[key]))),['physical_feature','education_study','education_pay']);
    for(const row of [...Object.values(state.obligations??{}),...scheduledRecords]){
        addObligationSchedule(heap,engine,row,now,end,state);
        due(row.deadline);due(row.expires);due(row.nextAt);
        if(row.category==='society_news'&&row.status==='在途')due(row.arrivesAt);
        if(row.category==='society_agreement'&&row.status==='有效')due(row.nextDue);
        if(row.category==='contract'&&row.kind==='workshop')due(row.nextWork);
    }
    const constraints=personConstraints(engine,state);
    const overrides=scheduleOverrides(engine,constraints);
    d.scheduleEducation.overrides=overrides;d.scheduleEducation.festivals=constraints.festivals.length>0;
    const slots=new Map(),pending=new Set(),npcOrder=new Map();
    Object.assign(d.scheduleEducation,{slots,pending,npcOrder});
    const schedulePlan=advanceLayerPlan(engine,state);
    const regional=Object.keys(state.remote??{}).length?remoteScheduleBatch(engine,state,now,end):null;
    for(const [id,npc]of Object.entries(state.npcs??{})){
        npcOrder.set(id,npcOrder.size);
        if(constraints.has(id)||facilityRuntime().hasUnattendedFurnace(engine,id))pending.add(id);
        due(npc.scheduleTravel?.arrive,['npc_obligations'],id);due(npc.cognitionTravel?.arrive,['npc_cognition']);
        // The existing layer adapter settles eligible fixed-location skeletons
        // daily or on promotion. They do not own individual slot clocks.
        const group=regional?.persons.get(id);
        if(group&&group.layer!=='intelligent')continue;
        if(engine.byId.get(id)?.schedule||npc.routine){
            // An authored routine with no live override cannot read other
            // people's employment/progress records. Keep its slot across those
            // writes, while invalidating individual transitions and courses.
            const authored=staticEnvironment&&!overrides.has(id)&&!prepared.overrides?.has(id)&&!constraints.festivals.length&&!prepared.festivals&&!npc.vocation&&!npc.residence&&!npc.caring&&!npc.levy&&engine.byId.get(id)?.schedule&&prepared.state.records?.[`transition:${id}`]===state.records?.[`transition:${id}`];
            const prior=(reuse||authored)&&sameNpcScheduleInputs(prepared.state.npcs[id],npc)&&!constraints.has(id)&&!constraints.employment.get(id)?.length&&!constraints.leases.get(id)?.length?prepared.slots?.get(id):null;
            // Identical adjacent slots share a settlement boundary, but their
            // authored start/end metadata still changes at the original edge.
            const priorValid=prior?.until>now&&(prior.end===undefined||Math.floor(now/1440)*1440+prior.end>now);
            const slot=priorValid?prior:engine.protocolScheduleAt(engine,id,now,state,constraints);
            if(priorValid&&process.env.FIELDS_INDEX_CHECK==='1'){
                const fresh=engine.protocolScheduleAt(engine,id,now,state,constraints);
                if(!canonicalEqual(slot,fresh))throw Error(`schedule heap cache mismatch: ${id} at ${now}: ${JSON.stringify({cached:slot,fresh})}`);
            }
            slots.set(id,slot);
            due(slot?.until,['npc_obligations','education'],id);
            if(slot&&(npc.location!==slot.location||npc.activity!==slot.activity))pending.add(id);
            // A clock tick at the end of a slot is too late to start a trip
            // for the slot already in progress. Wake once at the first
            // actionable minute so advanceNpcSchedules can create its travel
            // deadline, which is then registered above on the next pass.
            if(slot?.services?.length&&slot.location===state.location&&!npc.scheduleTravel&&npc.location&&npc.location!==slot.location){
                const constrained=personConstraint(engine,state,id,now,constraints)?.value;
                const occupied=state.player?.companions?.includes(id)||engine.npcScheduleReservations?.has(id)||engine.medicineParticipants?.has(id)||engine.npcAutonomyBusy?.(state,id,now);
                if(!constrained&&!occupied&&!['濒死','昏迷','患病'].includes(npc.status)&&schedulePlan.countyOf(npc.location)===schedulePlan.player&&personSimulation(engine,state,id).value){
                    try{if(engine.route(npc.location,slot.location,'walk',now,state.randomSeed,engine.weatherSequences,engine.advanceGraphs).cost<=npc.coins)due(now+1);}catch{}
                }
            }
        }
    }
    let minute=Infinity;
    for(const entry of heap.entries)if(entry.minute>now&&entry.minute<=end)minute=Math.min(minute,entry.minute);
    const dueEntries=heap.entries.filter(entry=>entry.minute===minute);
    d.advanceSchedule={minute:minute===Infinity?undefined:minute,systems:new Set(dueEntries.flatMap(entry=>entry.systemIds??[entry.systemId])),npcs:new Set(dueEntries.map(entry=>entry.npcId).filter(Boolean))};
    return minute===Infinity?null:minute;
    }finally{engine.educationCourseContext=previous;}
}
// 争夺池：推进系统在本刻提交的互斥标的提案（提交即按当前调度器分配 seq），本刻系统结算完后
// 由缺省表裁决，产生 contest_win / contest_lose 事件（seq 晚于阶段 1–3，见 runTick）。
export {submitContest}from'./scheduler.mjs';
function recordContestEvent(d,event){
    const key=`world_event:contest:${event.target}:${event.id}:${event.minute}`;
    if(d.get('state','records',key))return;
    publishTransitionEvent(d,d.engine,{id:`contest:${event.target}:${event.id}:${event.minute}`,verb:event.verb,actor:event.actor??event.id,target:event.target,minute:event.minute,location:d.get('state','location'),witnesses:[],tags:['contest',event.rule??'lottery'],...(event.reason?{reason:event.reason}:{})});
}
function resolveContestPool(d,ctx){
    if(!d.contestPool?.length)return;
    const proposals=d.contestPool.splice(0).sort((a,b)=>{
        const key=p=>clockDiceKey(d.document.randomSeed,p.ruleId??'',p.objectId??'',ctx.after);
        return key(a).localeCompare(key(b));
    });
    for(const proposal of proposals)proposal.seq=d.scheduler.nextSeq();
    const outcomes=resolveContest(proposals,{seed:d.document.randomSeed,minute:ctx.after});
    for(const outcome of outcomes){
        for(const winner of outcome.winners){
            // The callback owns the entire proposal, including money and goods.
            // A rejected callback restores all of its writes and event numbers.
            const checkpoint=d.document,patches=d.patches.length,messages=d.messages.length,seq=d.scheduler.seq;
            try{winner.execute?.();recordContestEvent(d,{verb:'contest_win',id:winner.id,actor:winner.actor??winner.objectId,target:outcome.target,rule:outcome.contest,minute:ctx.after});}
            catch(error){d.document=checkpoint;d.patches.length=patches;d.messages.length=messages;d.scheduler.seq=seq;winner.reject?.(error.message);recordContestEvent(d,{verb:'contest_lose',id:winner.id,actor:winner.actor??winner.objectId,target:outcome.target,rule:outcome.contest,reason:error.message,minute:ctx.after});}
        }
        for(const loser of outcome.losers){loser.reject?.(outcome.reason);recordContestEvent(d,{verb:'contest_lose',id:loser.id,actor:loser.actor??loser.objectId,target:outcome.target,rule:outcome.contest,reason:outcome.reason,minute:ctx.after});}
    }
}
// These handlers only loop over crossed midnight/day boundaries. Keep legacy
// state-driven handlers running until their non-clock work has an explicit owner.
const midnightSystems=new Set(['daily','shop_restock','projects','public_projects','hazard_clock','magic_economy','military','war_diplomacy','tribal_awakening','quest_sources']);
const deadlineSystems=new Set(['world_clock','faction_clock','transport','notables','upper_appointments','society_news','effect_expiry','dying','agriculture_expiry']);
const ledgerAudit=Symbol('tick ledger audit');
function systemRunsAt(system,engine,d,ctx){
    if(midnightSystems.has(system.id))return ctx.days>0;
    if(system.id==='office_salaries')return Math.floor(ctx.before/(30*1440))<Math.floor(ctx.after/(30*1440));
    if(system.id==='season_effects')return Math.floor(ctx.before/(90*1440))<Math.floor(ctx.after/(90*1440));
    if(system.id==='pets')return system.nextMinute(engine,d,-1)<=ctx.after;
    if(system.id==='npc_life')return ctx.days>0||nextNpcLifeMinute(d.get('state'),-1)<=ctx.after;
    if(system.id==='facilities')return ctx.days>0||nextFacilityMinute(d.get('state'),ctx.before)<=ctx.after;
    if(system.id==='promotion')return ctx.days>0||nextPromotionMinute(d.get('state'),-1)<=ctx.after;
    if(system.id==='bounty')return nextBountyMinute(d.get('state'),ctx.before)<=ctx.after;
    if(deadlineSystems.has(system.id))return d.advanceSchedule?.minute===ctx.after&&d.advanceSchedule.systems.has(system.id)||system.nextMinute(engine,d,-1)<=ctx.after;
    // Continuous magic is already settled by catchUpLocal before phase 2.
    if(['magic_care','magic_mind_space','shadow_contracts','magic_objects','magic_air','magic_water_earth'].includes(system.id))return false;
    return true;
}
function runAdvanceSystems(engine,d,ctx){
    const prior=engine.advanceLayerContext;
    engine.advanceLayerContext=Object.keys(d.get('state','remote')??{}).length?advanceLayerPlan(engine,d.get('state')):null;
    if(d.scheduler)beginReactionTick(d);
    try{
        const systems=orderedSystems(d,ctx);
        if(d.scheduler){
            const due=[];
            for(const system of systems.filter(s=>s.phase===PHASE.due&&systemRunsAt(s,engine,d,ctx))){
                if(system.dueItems)due.push(...system.dueItems(engine,d,ctx).map(item=>({...system,...item})));
                else due.push({...system,execute:()=>system.advance(engine,d,ctx)});
            }
            due.sort((a,b)=>compareDue(a,b)||a.ruleId.localeCompare(b.ruleId)||a.id.localeCompare(b.id));
            for(const item of due)item.execute();
            for(const system of systems.filter(s=>s.phase!==PHASE.due&&s.phase!==PHASE.assertion))if(systemRunsAt(system,engine,d,ctx))system.advance(engine,d,ctx);
        }else for(const system of systems)system.advance(engine,d,ctx);
        if(d.scheduler){
            resolveContestPool(d,ctx);
            drainWorldReactions(d);
            // Reactions get one final contest round. New claims from its
            // reactions remain pending until the next scheduled tick.
            resolveContestPool(d,ctx);
            drainWorldReactions(d);
            for(const system of systems.filter(s=>s.phase===PHASE.assertion))system.advance(engine,d,ctx);
            const ledger=d.get('ledger'),errors=recordsMemo(ledger,ledgerAudit,()=>auditLedger(ledger));
            if(errors.length)throw new Error(`刻末账本断言失败：${errors.join('; ')}`);
        }
    }finally{delete d.reactionTick;engine.advanceLayerContext=prior;delete engine.educationCourseContext;delete engine.educationAttendance;}
}

function nextRecordDeadline(state,now,categories,fields,predicate=()=>true){
    let next=Infinity;
    for(const category of categories)for(const row of recordsWhere(state.records,'category',category))if(predicate(row))for(const field of fields){
        const at=row[field];if(Number.isSafeInteger(at)&&at>now)next=Math.min(next,at);
    }
    return next;
}
function nextEffectDeadline(state,now,kind=null,upkeep=false){
    let next=Infinity;
    for(const effect of Object.values(state.effects??{}))if(!kind||effect.kind===kind)for(const at of [effect.expires,...(upkeep?[effect.nextUpkeep]:[])])if(Number.isSafeInteger(at)&&at>now)next=Math.min(next,at);
    return next;
}
function nextContractDeadline(e,d,now){
    const state=d.get('state');
    return nextRecordDeadline(state,now,['contract','debt','realm_invitation'],['deadline','expires','nextWork','nextRent','nextDividend']);
}
function nextAgricultureDeadline(e,d,now){
    let next=Infinity;
    for(const p of e.rules.agriculture?.settlements??[]){
        const row=d.get('state','records',`agriculture:${p.settlement}`);if(row?.mode!=='managed')continue;
        for(const batch of [...row.batches,...row.field.seedBatches]){
            const at=batch.expiresDay*1440;if(at>now)next=Math.min(next,at);
            // Structural damage can shorten storage immediately. This remains
            // state driven until expiry has removed the affected batches.
            if(row.granary.condition<50&&batch.kind!=='fresh'&&batch.expiresDay>batch.harvestDay+p.normalStorageDays)return now+1;
        }
    }
    return next;
}
function nextSeasonDeadline(e,d,now){
    const year=360*1440;let next=Infinity;
    for(const season of effectTable(e)?.seasons??[]){
        let at=Math.floor(now/year)*year+season.season*90*1440;if(at<=now)at+=year;
        next=Math.min(next,at);
    }
    return next;
}
function nextSocietyDeadline(e,d,now){
    const state=d.get('state');
    return Math.min(nextRecordDeadline(state,now,['society_news'],['arrivesAt'],r=>r.status==='在途'),nextRecordDeadline(state,now,['society_agreement'],['nextDue','expires'],r=>r.status==='有效'));
}
function nextDeliveryDeadline(e,d,now){
    let next=Infinity;
    for(const row of Object.values(d.get('state','obligations')??{}))if(['送货','付款'].includes(row.type)&&(row.status==='待履行'||row.deliveryVersion===1&&row.status==='进行中'||row.runtimeVersion===1&&row.type==='付款'&&row.status==='pending')&&row.deadline>now)next=Math.min(next,row.deadline);
    return next;
}
// Order mirrors the original hand-written WorldEngine.advanceInterval sequence.
const systems=[
 {id:'obligation_runtime',order:199,advance:(e,d,c)=>{for(const item of automaticObligationItems(e,d,c))item.execute();}},
 {id:'transition_protocol',order:0,nextMinute:nextProtocolMinute,advance:(e,d,c)=>{for(const item of protocolDueItems(e,d,c))item.execute();}},
 {id:'education_enrollment',order:50,nextMinute:nextEducationMinute,advance:(e,d,ctx)=>prepareEducation(d,e,ctx)},
 {id:'medicine_booking',order:60,nextMinute:(e,d,now)=>{
    const state=d.get('state');
    if(!Object.values(state.family?.illnesses??{}).some(r=>r.status==='患病中'))return Infinity;
    const decision=Math.floor(now/1440)*1440+481;return decision>now?decision:decision+1440;
 },advance:(e,d,ctx)=>prepareMedicine(d,e,ctx.after%1440===481?{...ctx,before:ctx.after-1}:ctx)},
 {id:'medicine',order:1190,layers:ADVANCE_LAYERS,nextMinute:(e,d,now)=>nextMedicineMinute(e,d,now),advance:(e,d,ctx)=>advanceMedicine(d,e,ctx)},
 {id:'education',order:1090,nextMinute:(e,d,now)=>nextEducationMinute(e,d,now),advance:(e,d,ctx)=>advanceEducation(d,e,ctx)},
 {id:'npc_obligations',order:100,layers:ADVANCE_LAYERS,active:e=>fullNpcs(e),nextMinute:(e,d,now)=>nextNpcObligationMinute(d.get('state'),now),
  advance:(e,d,{before,after,id,beforeState})=>advanceNpcObligations(d,e,before,after,id,{beforeState})},
 {id:'contracts',order:200,nextMinute:nextContractDeadline,advance:(e,d,{after})=>advanceContracts(d,e,after)},
 {id:'credit',order:250,nextMinute:nextCreditMinute,advance:(e,d,{after})=>advanceCredit(d,e,after)},
 {id:'labor_market',order:240,layers:ADVANCE_LAYERS,nextMinute:(e,d,now)=>nextLaborMinute(e,d,now),advance:(e,d,ctx)=>advanceLaborMarket(d,e,ctx)},
 {id:'summons',order:300,nextMinute:(e,d,now)=>nextEffectDeadline(d.get('state'),now,'summon',true),advance:(e,d,{after})=>advanceSummons(d,after)},
 {id:'law',order:400,nextMinute:(e,d,now)=>nextRecordDeadline(d.get('state'),now,['legal_detention','legal_custody','authorization'],['expires']),advance:(e,d,{after})=>advanceLaw(d,after,e)},
 {id:'daily',order:500,advance(e,d,{before,after}){
    for(let day=Math.floor(before/1440);day<Math.floor(after/1440);day++){
      advanceForestWater(d,e,day);
      advanceHook('advanceMineralStocks')?.(d,e,(day+1)*1440);
      advanceHook('advanceSiteStocks')?.(d,e,(day+1)*1440);
      for(const [sid,source] of Object.entries(d.get('state','settlements'))) {
        if(source.granary===false)continue;// public money only, no public granary (D1 town ledger)
        const farming=advanceAgriculture(d,e,sid,source,day),s=farming?.settlement??clone(source);
        const production=farming?0:accrueFoodProduction(e,d,s,sid,cropProduction(e,d.document.randomSeed,sid,day*1440,s.foodPerDay)*hazardYieldFactor(d.get('state'),sid,day*1440+720)*magicYieldFactor(d.get('state'),sid,day*1440+720)*farmWaterFactor(e,d.get('state'),sid,day)),available=s.food+production;
        const missing=farming?.missingMeals??Math.max(0,s.population-available);
        if(!farming){bookLegacyFood(d,e,sid,production,Math.min(available,s.population),day);s.food=Math.max(0,available-s.population);}s.unmetMeals=(s.unmetMeals??0)+missing;
        s.starvation=missing ? (s.starvation??0)+1 : Math.max(0,(s.starvation??0)-1);
        if(s.starvation>=7){s.population=Math.max(0,s.population-1);s.starvation=0;d.say(`${s.name}发生饥荒死亡`);}
        const wood=farming?.woodProduced??harvestSettlementWood(d,e,sid,s.woodPerDay??0,(day+1)*1440);
        settleFuel(d,e,sid,s,wood,day);d.set(['state','settlements',sid],s);
      }
      advancePets(d,e,(day+1)*1440);
      advanceWildlife(d,e,day);displaceForestWildlife(d,e,day);advanceBosses(d,e,day);
    }
 }},
 {id:'pets',order:600,nextMinute:nextPetMinute,advance:(e,d,{after})=>advancePets(d,e,after)},
 {id:'agriculture_expiry',order:700,nextMinute:nextAgricultureDeadline,advance:(e,d)=>settleAgricultureExpiry(d,e)},
 {id:'settlement_trade',order:800,active:e=>!!e.rules.settlementTrade,nextMinute:(e,d,now)=>nextSettlementTradeMinute(d.get('state'),e,now),
  advance:(e,d,{after})=>advanceSettlementTrade(d,e,after)},
 {id:'transport',order:790,nextMinute:(e,d,now)=>nextTransportMinute(d.get('state'),now),active:(e,d,now)=>nextTransportMinute(d.get('state'),now)!==Infinity,advance:(e,d,{after})=>advanceTransport(d,e,after)},
 {id:'post',order:820,nextMinute:(e,d,now)=>nextPostMinute(d.get('state'),now),advance:(e,d,{after})=>advancePost(d,e,after)},
 {id:'shop_restock',order:850,advance:(e,d,{before,after})=>{
    // Restocking has no effects outside midnight boundaries. Deriving every
    // shop during unrelated school/travel ticks repeatedly scans the world.
    if(Math.floor(after/1440)>Math.floor(before/1440))advanceShops(d,e,before,after);
 }},
 {id:'facilities',order:890,nextMinute:(e,d,now)=>nextFacilityMinute(d.get('state'),now),advance:(e,d,ctx)=>advanceFacilities(d,e,ctx)},
 {id:'projects',order:900,advance(e,d,{days,id}){
    if(days)for(const [key,project]of Object.entries(d.get('state','projects')))if(project.type==='工程'&&project.status==='施工中'&&!isPublicProject(project)){
        const hired=Object.values(d.get('state','records')??{}).some(r=>r.laborMarket===1&&r.project===key);
        const remainingDays=hired?Math.ceil(project.remainingWork??project.remainingDays):Math.max(0,project.remainingDays-days);d.set(['state','projects',key],{...project,remainingDays,status:remainingDays?'施工中':'已完成'});
        if(!remainingDays)settleProjectWorks(d,e,project,`${key}:works`);
        if(!remainingDays)d.set(['state','projects',key,'facility'],completeFacilityProject(d,e,project));
        if(!remainingDays&&project.creator==='player')milestone(d,e,'publicContribution',key,id);
    }
 }},
 {id:'public_projects',order:910,nextMinute:(e,d,now)=>(Math.floor(now/1440)+1)*1440,advance:(e,d,ctx)=>{advancePublicProjects(d,e,ctx);advanceHouses(d,e,ctx);}},
 {id:'npc_cognition',order:1000,active:e=>fullNpcs(e),nextMinute:(e,d,now)=>nextNpcCognitionMinute(d.get('state'),now),
  advance:(e,d,{before,after,id,beforeState})=>{if(fullNpcs(e))advanceNpcCognition(d,e,before,after,id,{beforeState});}},
 {id:'npc_autonomy',order:1100,active:e=>fullNpcs(e),currentMinute:(e,d,now,id)=>{if(now%1440===600)advanceNpcAutonomy(d,e,now,now,id,{beforeState:d.get('state')});},nextMinute:(e,d,now)=>nextNpcAutonomyMinute(d.get('state'),now),
  advance:(e,d,{before,after,id,beforeState})=>{if(fullNpcs(e))advanceNpcAutonomy(d,e,before,after,id,{beforeState});}},
 {id:'office_salaries',order:1129,nextMinute:(e,d,now)=>nextSalaryMinute(e,now),advance:(e,d,ctx)=>advanceOfficeSalaries(d,e,ctx)},
 {id:'governance_offices',order:1130,nextMinute:(e,d,now)=>nextOfficeMinute(d.get('state'),now),advance:(e,d,ctx)=>advanceOffices(d,e,ctx)},
 {id:'housing_steward',order:1135,nextMinute:(e,d,now)=>nextHousingMinute(d.get('state'),now),advance:(e,d,ctx)=>advanceHousing(d,e,ctx)},
 {id:'upper_appointments',order:1138,nextMinute:(e,d,now)=>nextRecordDeadline(d.get('state'),now,['upper_application'],['due'],r=>r.status==='待审定'),advance:(e,d,ctx)=>advanceUpperAppointments(d,e,ctx)},
 {id:'titles',order:1140,nextMinute:(e,d,now)=>nextTitleMinute(d.get('state'),now),advance:(e,d,ctx)=>advanceTitles(d,e,ctx)},
 {id:'notables',order:1142,nextMinute:(e,d,now)=>nextNotableMinute(d.get('state'),now),advance:(e,d,ctx)=>advanceNotables(d,e,ctx)},
 {id:'promotion',order:1144,nextMinute:(e,d,now)=>nextPromotionMinute(d.get('state'),now),advance:(e,d,ctx)=>advancePromotion(d,e,ctx)},
 {id:'bounty',order:1150,active:(e,d)=>bountyActive(d.get('state')),nextMinute:(e,d,now)=>nextBountyMinute(d.get('state'),now),
  advance:(e,d,{before,after})=>advanceBounties(d,e,before,after)},
 {id:'npc_life',order:1200,active:e=>fullNpcs(e),nextMinute:(e,d,now)=>nextNpcLifeMinute(d.get('state'),now),
  advance:(e,d,{before,after})=>{if(fullNpcs(e))advanceNpcLife(d,e,before,after);}},
 {id:'npc_crime',order:1210,nextMinute:(e,d,now)=>nextNpcCrimeMinute(e,d,now),advance:(e,d,ctx)=>advanceNpcCrime(d,e,ctx)},
 {id:'world_clock',order:1300,active:e=>!!e.rules.worldClock,nextMinute:(e,d,now)=>nextWorldClockMinute(d.get('state'),now),
  advance:(e,d,{after})=>advanceWorldClocks(d,e,after)},
 {id:'season_effects',order:1350,nextMinute:nextSeasonDeadline,advance:(e,d,{before,after})=>advanceSeasonEffects(d,e,before,after)},
 // U3 floods, famine, epidemics and price swings (rules.hazardClock).
 {id:'hazard_clock',order:1360,active:e=>hazardClocks(e).length>0,advance:(e,d,ctx)=>advanceHazardClocks(d,e,ctx)},
 // U10 life-magic economy: price curve, beneficiaries, competitors and complaints at midnight.
 {id:'magic_economy',order:1370,advance:(e,d,ctx)=>advanceMagicEconomy(d,e,ctx)},
 {id:'faction_clock',order:1400,active:e=>factionClockRules(e).length>0,nextMinute:(e,d,now)=>nextFactionClockMinute(d.get('state'),now),
  advance:(e,d,{after})=>advanceFactionClocks(d,e,after)},
 {id:'organizations',order:1450,nextMinute:(e,d,now)=>Math.max(now+1,nextOrganizationMinute(d.get('state'))),advance:(e,d,ctx)=>advanceOrganizations(d,e,ctx)},
 {id:'faith_experience',order:1451,nextMinute:(e,d,now)=>(Math.floor(now/1440)+1)*1440,advance:(e,d,ctx)=>advanceFaith(d,e,ctx)},
 // U12a armies: weekly supply, drill, morale and desertion; monthly pay (rules.military).
 {id:'military',order:1452,advance:(e,d,ctx)=>advanceMilitary(d,e,ctx)},
 // U11 tribal awakening: species-and-habitat tribes accumulate, awaken, split and resolve at quarter boundaries.
 {id:'tribal_awakening',order:1455,advance:(e,d,ctx)=>advanceTribalAwakening(d,e,ctx)},
 {id:'war_diplomacy',order:1456,advance:(e,d,ctx)=>advanceWarDiplomacy(d,e,ctx)},
 // U17 quest sources: NPC needs, world-event records and effect-table commissions post to the board at midnight.
 {id:'quest_sources',order:1460,advance:(e,d,ctx)=>advanceQuestSources(d,e,ctx)},
 {id:'royal_service',order:1462,nextMinute:(e,d,now)=>(Math.floor(now/1440)+1)*1440,advance:(e,d,ctx)=>advanceRoyalService(d,e,ctx)},
 {id:'nations',order:1464,nextMinute:(e,d,now)=>Math.min((Math.floor(now/(30*1440))+1)*30*1440,nextRecordDeadline(d.get('state'),now,['nation'],['nextReview'],r=>liveNation(d.get('state'),r.id))),advance:(e,d,ctx)=>advanceNations(d,e,ctx)},
 {id:'society_news',order:1500,nextMinute:nextSocietyDeadline,advance:(e,d,{after})=>advanceSocietyNews(d,e,after)},
 {id:'festival',order:1600,active:e=>festivalCalendar(e).length>0,nextMinute:(e,d,now)=>nextFestivalMinute(d.get('state'),e,now),
  advance:(e,d,{after})=>advanceFestivals(d,e,after)},
 {id:'local_actor_positions',order:1700,nextMinute:(e,d,now)=>nextRecordDeadline(d.get('state'),now,['local_position'],['expires']),advance(e,d,{after}){
    for(const[key,row]of Object.entries(d.get('state','records')??{}))if(key.startsWith('local_actor_position:')){
        const actor=d.get('state',row.subject?.startsWith('npc_')?'npcs':'creatures',row.subject);
        if(!actor||actor.location!==row.location||actor.scheduleTravel||actor.cognitionTravel||!isEffective(e,d,row.subject)||row.expires<=after)holdingRemove(d,null,['state','records',key],'advance-registry');
    }
 }},
 {id:'magic_care',order:1800,nextMinute:(e,d,now)=>Math.min(Infinity,...Object.values(d.get('state','effects')??{}).filter(x=>x.kind==='care'&&x.operation==='preserve'&&x.expires>now&&x.upkeepMp>0).map(x=>now+Math.max(1,Math.floor(d.get('state','player','mp')/x.upkeepMp)+1))),advance:(e,d,{before,after})=>{if(!d.scheduler)advanceCare(d,e,before,after);}},
 {id:'magic_mind_space',order:1900,advance:(e,d,{before,after})=>{if(!d.scheduler)advanceMindSpace(d,e,before,after);}},
 {id:'shadow_contracts',order:2000,advance:(e,d,{before,after})=>{if(!d.scheduler)advanceShadowContracts(d,before,after);}},
 {id:'magic_objects',order:2100,advance:(e,d,{after})=>{if(!d.scheduler)advanceMagicObjects(d,e,after);}},
 {id:'magic_air',order:2200,advance:(e,d,{before,after})=>{if(!d.scheduler)advanceAirEffects(d,e,before,after);}},
 {id:'magic_water_earth',order:2300,nextMinute:(e,d,now)=>Math.min(Infinity,...Object.values(d.get('state','effects')??{}).filter(x=>x.kind==='water_earth'&&x.operation==='mud_seal'&&x.expires>now).map(x=>Math.max(now+1,x.lastChecked+4))),advance:(e,d,{before,after})=>{if(!d.scheduler)advanceWaterEarth(d,e,before,after);}},
 {id:'magic_area',order:2400,active:(e,d)=>Object.values(d.get('state','effects')??{}).some(x=>x.kind==='area'),nextMinute:(e,d,now)=>nextMagicAreaMinute(d.get('state'),now),
  advance:(e,d)=>settleMagicAreas(d,e)},
 {id:'effect_expiry',order:2500,nextMinute:(e,d,now)=>nextEffectDeadline(d.get('state'),now),advance(e,d,{after}){
    for(const [key,effect] of Object.entries(d.get('state','effects'))) if(effect.expires<=after) d.remove(['state','effects',key]);
 }},
 {id:'dying',order:2600,nextMinute:(e,d,now)=>{const p=d.get('state','player'),at=p.status==='濒死'?p.dyingSince+e.rules.death.dyingMinutes:Infinity;return at>now?at:Infinity;},advance(e,d,{after}){
    const p=d.get('state','player');
    if(p.status==='濒死' && after-p.dyingSince>=e.rules.death.dyingMinutes) e.death(d);
 }},
 {id:'deliveries',order:2700,nextMinute:nextDeliveryDeadline,advance(e,d,{before,after,id,beforeState,obligationIds}){
    // Phase 2 reads the courier and recipient before the phase 3 schedule
    // clock runs. Catch their schedules up to this read (§14.3), retaining
    // npcObligationClock so phase 3 cannot repeat attendance or travel costs.
    if(d.scheduler&&(obligationIds??Object.keys(d.get('state','obligations')??{})).some(key=>{
        const o=d.get('state','obligations',key);
        return o?.deliveryVersion===1&&['待履行','进行中'].includes(o.status)&&o.deadline<=after;
    }))advanceNpcObligations(d,e,before,after,id,{beforeState});
    for(const [key,obligation] of (obligationIds?obligationIds.map(key=>[key,d.get('state','obligations',key)]):Object.entries(d.get('state','obligations')))) {
        if((obligation.status==='待履行'||obligation.deliveryVersion===1&&obligation.status==='进行中'||obligation.runtimeVersion===1&&obligation.type==='付款'&&obligation.status==='pending') && obligation.deadline<=after && ['送货','付款'].includes(obligation.type)) {
            try { e.deliver(d,key,obligation,id); } catch(error) {
                const courier=obligation.deliveryVersion===1;
                d.set(['state','obligations',key],{...obligation,status:'违约',reason:error.message,...(courier?{resolvedAt:after,breachedBy:[error.deliveryResponsibility??obligation.promisor]}:{})});
            }
        }
    }
 }},
 {id:'wildlife_encounter',order:2800,active:(e,d,now)=>nextWildlifeEncounterMinute(d,e,now)!==Infinity,nextMinute:(e,d,now)=>nextWildlifeEncounterMinute(d,e,now),
  advance:(e,d,{before,after,id})=>{if(after===nextWildlifeEncounterMinute(d,e,before))settleWildlifeEncounter(d,e,wildlifeEncounterAt(d,e,d.get('state','location'),after),id);}},
];
// Preparatory rules remain before the rules that consume their attendance and
// booking contexts. Stable rule ids preserve those existing dependencies.
const dueSystems={transition_protocol:'协议续步与承接实体阶段',contracts:'义务',credit:'义务',summons:'效果与状态到期',law:'案件阶段',effect_expiry:'效果与状态到期',dying:'效果与状态到期',deliveries:'义务',agriculture_expiry:'效果与状态到期'};
// Native handlers accept a selected record/effect. The scheduler owns the
// ordering across handlers; each handler retains its domain checks and writes.
const recordOrder=Symbol('record enumeration order');
const recordItems=(d,predicate,execute,anchor,categories)=>{
    const records=d.get('state','records')??{};
    return categories.flatMap(category=>recordEntriesWhere(records,'category',category)).filter(([,row])=>predicate(row))
        .map(([id,row])=>({id,anchorId:anchor(row,id),registeredSeq:row.registeredSeq??row.seq??recordsMemo(records,recordOrder,()=>new Map(Object.keys(records).map((id,i)=>[id,i+1]))).get(id),execute:()=>execute(id)}));
};
const dueCollectors={
    transition_protocol:protocolDueItems,
    contracts:(e,d,c)=>[
        {id:'rituals',dueClass:'许可 / 托养 / 封印维护到期',anchorId:'player',execute:()=>advanceRituals(d,e,c.after)},
        ...recordItems(d,()=>true,id=>advanceContracts(d,e,c.after,[id]),(r,id)=>r.debtor??r.parties?.[0]??r.owner??id,['contract','debt'])],
    credit:(e,d,c)=>recordItems(d,r=>['bank','debt','contract'].includes(r.category),id=>{
        const row=d.get('state','records',id);
        if(row?.kind==='workshop'&&row.nextWork<=c.after&&!c.workshopPresenceDone){
            c.workshopPresenceDone=true;
            advanceNpcObligations(d,e,c.before,c.after,c.id,{beforeState:c.beforeState});
        }
        advanceCredit(d,e,c.after,[id]);
    },(r,id)=>r.debtor??r.parties?.[0]??r.owner??id,['bank','debt','contract']),
    law:(e,d,c)=>[
        {id:'wanted',anchorId:'',execute:()=>advanceWanted(d,e,c.after)},
        ...recordItems(d,()=>true,id=>advanceLaw(d,c.after,e,[id]),(r,id)=>r.case??id,['legal_detention','legal_custody']),
        ...recordItems(d,r=>r.category==='authorization',id=>advanceLaw(d,c.after,e,[id]),(r,id)=>r.grantor??id,['authorization']).map(item=>({...item,dueClass:'许可 / 托养 / 封印维护到期'}))],
    summons:(e,d,c)=>Object.entries(d.get('state','effects')??{}).filter(([,r])=>r.kind==='summon')
        .map(([id,r])=>({id,anchorId:r.target??r.owner??'player',registeredSeq:r.registeredSeq??0,execute:()=>advanceSummons(d,c.after,[id])})),
    effect_expiry:(e,d,c)=>Object.entries(d.get('state','effects')??{}).filter(([,r])=>r.expires<=c.after)
        .map(([id,r])=>({id,anchorId:r.target??r.owner??id,registeredSeq:r.registeredSeq??0,execute:()=>{
            const effect=d.get('state','effects',id);
            if(effect?.expires<=c.after&&!magicEffect(effect.kind)?.expire?.(d,id,c.after))d.remove(['state','effects',id]);
        }})),
    agriculture_expiry:(e,d)=> (e.rules.agriculture?.settlements??[]).map(p=>({id:p.settlement,anchorId:p.settlement,execute:()=>settleAgricultureExpiry(d,e,p.settlement)})),
    dying:(e,d,c)=>[{id:'dying',anchorId:'player',execute:()=>systems.find(s=>s.id==='dying').advance(e,d,c)}],
    deliveries:(e,d,c)=>Object.entries(d.get('state','obligations')??{}).map(([id,r])=>({id,anchorId:r.promisor??'player',registeredSeq:r.registeredSeq??r.seq??0,execute:()=>systems.find(s=>s.id==='deliveries').advance(e,d,{...c,obligationIds:[id]})})),
};
systems.push({id:'rite_projects',order:2900,
 nextMinute:(engine,d,now)=>riteLifecycle()?.nextMinute(engine,d,now)??Infinity,
 active:(engine,d)=>recordsWhere(d.get('state','records'),'category','rite_project').some(p=>p.status==='active'),
 currentMinute:(engine,d)=>riteLifecycle()?.settle(d,engine),
 advance:(engine,d)=>riteLifecycle()?.settle(d,engine)});
for(const system of systems){
    if(system.id==='obligation_runtime'){dueSystems[system.id]='义务';dueCollectors[system.id]=automaticObligationItems;}
    const dueClass=dueSystems[system.id];
    system.phase=system.id==='rite_projects'?PHASE.assertion:dueClass?PHASE.due:PHASE.clock;
    system.dueClass=dueClass;
    system.dueItems=dueCollectors[system.id];
    system.packId='core';
    // Stable rule identities retain the existing dependency order inside core
    // (prepare attendance -> schedules -> settle attendance, for example).
    system.ruleId=`${String(system.order).padStart(4,'0')}:${system.id}`;
    registerAdvance(system);
}
