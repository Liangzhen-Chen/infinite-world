import {advanceUpperAppointments,advanceRoyalService} from './high-nobility.mjs';
import {advanceNations} from './nation-founding.mjs';
import {advanceEducation,nextEducationMinute,prepareEducation} from './education.mjs';
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
import {advanceShadowContracts,advanceContracts}from'./contracts.mjs';
import {advanceCredit}from'./credit.mjs';
import {advanceLaborMarket,nextLaborMinute} from './labor-market.mjs';
import {settleMagicAreas,nextMagicAreaMinute}from'./magic-area.mjs';
import {milestone}from'./progression.mjs';
import {advancePets}from'./pets.mjs';
import {advanceSummons}from'./summons.mjs';
import {advanceLaw}from'./law.mjs';
import {advanceNpcCrime,nextNpcCrimeMinute}from'./npc-crime.mjs';
import {cropProduction}from'./weather.mjs';
import {advanceAgriculture,settleAgricultureExpiry,advanceForestWater,harvestSettlementWood,settleFuel,farmWaterFactor,bookLegacyFood}from'./agriculture.mjs';
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
import {advanceNpcAutonomy,nextNpcAutonomyMinute}from'./npc-autonomy.mjs';
import {advanceNpcLife,nextNpcLifeMinute}from'./npc-life.mjs';
import {advanceNpcObligations,nextNpcObligationMinute}from'./npc-obligations.mjs';
import {advanceSocietyNews}from'./monster-society.mjs';
import {advanceSeasonEffects}from'./effects.mjs';
import {advanceOrganizations}from'./organizations.mjs';
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
import {personSimulation}from'./entity-view.mjs';
import {PatchCursor,withRecordIndex}from'./storage.mjs';
import {advanceLayerPlan,ADVANCE_LAYERS}from'./advance-layers.mjs';
import {advanceSystemSortKey,ScheduleHeap,resolveContest,schedulerWired}from'./scheduler.mjs';
import {publishTransitionEvent}from'./world-events.mjs';
const fullNpcs=engine=>(engine.entities??engine.world.npcs).some(n=>n.id?.startsWith('npc_')&&personSimulation(engine,{},n.id).value);
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
    return d?.cursor instanceof PatchCursor?withRecordIndex(()=>runAdvanceSystems(engine,d,ctx)):runAdvanceSystems(engine,d,ctx);
}
// S2b：推进路径接线开关（schedulerWired）。开启后同刻调度器按 §14.2 阶段与排序键重排推进系统，
// 阶段归序键 advanceSystemSortKey 缺省为阶段 2 并按原 order，且以系统 id 决出平局，因此
// 打乱注册顺序不改变执行顺序；关闭时保持现有 order（金快照不变）。
function orderedSystems(d){
    if(!schedulerWired(d.get('state')))return advanceRegistry;
    const key=advanceSystemSortKey;
    return [...advanceRegistry].sort((a,b)=>{
        const x=key(a),y=key(b);
        for(let i=0;i<x.length;i++){if(x[i]<y[i])return-1;if(x[i]>y[i])return 1;}
        return a.id<b.id?-1:a.id>b.id?1:0;
    });
}
// 接线后的刻集由日程堆唯一确定（14 §14.2）：只有到期项与时钟规则的刻才存在，
// 跨度的终点 end 本身不是刻——它只是把时钟拨到 end。午夜入堆为时钟规则，
// 各系统 nextMinute 入堆为到期项；取 (now, end] 内最小刻，无则返回 null。
export function nextFromScheduleHeap(engine,d,now,end){
    const heap=new ScheduleHeap();
    const midnight=Math.floor(now/1440)*1440+1440;
    if(midnight<=end)heap.add({kind:'clock',minute:midnight});
    for(const system of advanceRegistry)if(system.nextMinute){
        const minute=system.nextMinute(engine,d,now);
        if(minute>now&&minute<=end)heap.add({kind:'due',minute});
    }
    const ticks=heap.ticksBetween(now,end);
    return ticks.length?ticks[0]:null;
}
// 争夺池：推进系统在本刻提交的互斥标的提案（提交即按当前调度器分配 seq），本刻系统结算完后
// 由缺省表裁决，产生 contest_win / contest_lose 事件（seq 晚于阶段 1–3，见 runTick）。
export function submitContest(d,proposal){
    if(!Array.isArray(d.contestPool))throw new Error('调度器未接线，不能提交争夺提案');
    const seq=d.scheduler?d.scheduler.nextSeq():0;
    d.contestPool.push({...proposal,seq});
}
function recordContestEvent(d,event){
    const key=`world_event:contest:${event.target}:${event.id}:${event.minute}`;
    if(d.get('state','records',key))return;
    publishTransitionEvent(d,d.engine,{id:`contest:${event.target}:${event.id}:${event.minute}`,verb:event.verb,actor:event.id,target:event.target,minute:event.minute,location:d.get('state','location'),witnesses:[],tags:['contest',event.rule??'lottery'],...(event.reason?{reason:event.reason}:{})});
}
function resolveContestPool(d,ctx){
    if(!d.contestPool?.length)return;
    const outcomes=resolveContest(d.contestPool,{seed:d.document.randomSeed,minute:ctx.after});
    for(const outcome of outcomes){
        for(const winner of outcome.winners)recordContestEvent(d,{verb:'contest_win',id:winner.id,target:outcome.target,rule:outcome.contest,minute:ctx.after});
        for(const loser of outcome.losers)recordContestEvent(d,{verb:'contest_lose',id:loser.id,target:outcome.target,rule:outcome.contest,reason:outcome.reason,minute:ctx.after});
    }
    d.contestPool.length=0;
}
function runAdvanceSystems(engine,d,ctx){
    const prior=engine.advanceLayerContext;
    engine.advanceLayerContext=Object.keys(d.get('state','remote')??{}).length?advanceLayerPlan(engine,d.get('state')):null;
    try{
        for(const system of orderedSystems(d))system.advance(engine,d,ctx);
        if(schedulerWired(d.get('state')))resolveContestPool(d,ctx);
    }finally{engine.advanceLayerContext=prior;delete engine.educationCourseContext;delete engine.educationAttendance;}
}

// Order mirrors the original hand-written WorldEngine.advanceInterval sequence.
const systems=[
 {id:'education_enrollment',order:50,advance:(e,d,ctx)=>prepareEducation(d,e,ctx)},
 {id:'medicine_booking',order:60,advance:(e,d,ctx)=>prepareMedicine(d,e,ctx)},
 {id:'medicine',order:1190,layers:ADVANCE_LAYERS,nextMinute:(e,d,now)=>nextMedicineMinute(e,d,now),advance:(e,d,ctx)=>advanceMedicine(d,e,ctx)},
 {id:'education',order:1090,nextMinute:(e,d,now)=>nextEducationMinute(e,d,now),advance:(e,d,ctx)=>advanceEducation(d,e,ctx)},
 {id:'npc_obligations',order:100,layers:ADVANCE_LAYERS,active:e=>fullNpcs(e),nextMinute:(e,d,now)=>nextNpcObligationMinute(d.get('state'),now),
  advance:(e,d,{before,after,id})=>advanceNpcObligations(d,e,before,after,id)},
 {id:'contracts',order:200,advance:(e,d,{after})=>advanceContracts(d,e,after)},
 {id:'credit',order:250,advance:(e,d,{after})=>advanceCredit(d,e,after)},
 {id:'labor_market',order:240,layers:ADVANCE_LAYERS,nextMinute:(e,d,now)=>nextLaborMinute(e,d,now),advance:(e,d,ctx)=>advanceLaborMarket(d,e,ctx)},
 {id:'summons',order:300,advance:(e,d,{after})=>advanceSummons(d,after)},
 {id:'law',order:400,advance:(e,d,{after})=>advanceLaw(d,after,e)},
 {id:'daily',order:500,advance(e,d,{before,after}){
    for(let day=Math.floor(before/1440);day<Math.floor(after/1440);day++){
      advanceForestWater(d,e,day);
      for(const [sid,source] of Object.entries(d.get('state','settlements'))) {
        if(source.granary===false)continue;// public money only, no public granary (D1 town ledger)
        const farming=advanceAgriculture(d,e,sid,source,day),s=farming?.settlement??clone(source);
        const production=farming?0:Math.floor(cropProduction(e,d.document.randomSeed,sid,day*1440,s.foodPerDay)*hazardYieldFactor(d.get('state'),sid,day*1440+720)*magicYieldFactor(d.get('state'),sid,day*1440+720)*farmWaterFactor(e,d.get('state'),sid,day)),available=s.food+production;
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
 {id:'pets',order:600,advance:(e,d,{after})=>advancePets(d,e,after)},
 {id:'agriculture_expiry',order:700,advance:(e,d)=>settleAgricultureExpiry(d,e)},
 {id:'settlement_trade',order:800,active:e=>!!e.rules.settlementTrade,nextMinute:(e,d,now)=>nextSettlementTradeMinute(d.get('state'),e,now),
  advance:(e,d,{after})=>advanceSettlementTrade(d,e,after)},
 {id:'transport',order:790,nextMinute:(e,d,now)=>nextTransportMinute(d.get('state'),now),active:(e,d,now)=>nextTransportMinute(d.get('state'),now)!==Infinity,advance:(e,d,{after})=>advanceTransport(d,e,after)},
 {id:'post',order:820,nextMinute:(e,d,now)=>nextPostMinute(d.get('state'),now),advance:(e,d,{after})=>advancePost(d,e,after)},
 {id:'shop_restock',order:850,advance:(e,d,{before,after})=>advanceShops(d,e,before,after)},
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
 {id:'public_projects',order:910,advance:(e,d,ctx)=>{advancePublicProjects(d,e,ctx);advanceHouses(d,e,ctx);}},
 {id:'npc_cognition',order:1000,active:e=>fullNpcs(e),nextMinute:(e,d,now)=>nextNpcCognitionMinute(d.get('state'),now),
  advance:(e,d,{before,after,id,beforeState})=>{if(fullNpcs(e))advanceNpcCognition(d,e,before,after,id,{beforeState});}},
 {id:'npc_autonomy',order:1100,active:e=>fullNpcs(e),nextMinute:(e,d,now)=>nextNpcAutonomyMinute(d.get('state'),now),
  advance:(e,d,{before,after,id,beforeState})=>{if(fullNpcs(e))advanceNpcAutonomy(d,e,before,after,id,{beforeState});}},
 {id:'office_salaries',order:1129,nextMinute:(e,d,now)=>nextSalaryMinute(e,now),advance:(e,d,ctx)=>advanceOfficeSalaries(d,e,ctx)},
 {id:'governance_offices',order:1130,nextMinute:(e,d,now)=>nextOfficeMinute(d.get('state'),now),advance:(e,d,ctx)=>advanceOffices(d,e,ctx)},
 {id:'housing_steward',order:1135,nextMinute:(e,d,now)=>nextHousingMinute(d.get('state'),now),advance:(e,d,ctx)=>advanceHousing(d,e,ctx)},
 {id:'upper_appointments',order:1138,advance:(e,d,ctx)=>advanceUpperAppointments(d,e,ctx)},
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
 {id:'season_effects',order:1350,advance:(e,d,{before,after})=>advanceSeasonEffects(d,e,before,after)},
 // U3 floods, famine, epidemics and price swings (rules.hazardClock).
 {id:'hazard_clock',order:1360,active:e=>hazardClocks(e).length>0,advance:(e,d,ctx)=>advanceHazardClocks(d,e,ctx)},
 // U10 life-magic economy: price curve, beneficiaries, competitors and complaints at midnight.
 {id:'magic_economy',order:1370,advance:(e,d,ctx)=>advanceMagicEconomy(d,e,ctx)},
 {id:'faction_clock',order:1400,active:e=>factionClockRules(e).length>0,nextMinute:(e,d,now)=>nextFactionClockMinute(d.get('state'),now),
  advance:(e,d,{after})=>advanceFactionClocks(d,e,after)},
 {id:'organizations',order:1450,advance:(e,d,ctx)=>advanceOrganizations(d,e,ctx)},
 {id:'faith_experience',order:1451,advance:(e,d,ctx)=>advanceFaith(d,e,ctx)},
 // U12a armies: weekly supply, drill, morale and desertion; monthly pay (rules.military).
 {id:'military',order:1452,advance:(e,d,ctx)=>advanceMilitary(d,e,ctx)},
 // U11 tribal awakening: species-and-habitat tribes accumulate, awaken, split and resolve at quarter boundaries.
 {id:'tribal_awakening',order:1455,advance:(e,d,ctx)=>advanceTribalAwakening(d,e,ctx)},
 {id:'war_diplomacy',order:1456,advance:(e,d,ctx)=>advanceWarDiplomacy(d,e,ctx)},
 // U17 quest sources: NPC needs, world-event records and effect-table commissions post to the board at midnight.
 {id:'quest_sources',order:1460,advance:(e,d,ctx)=>advanceQuestSources(d,e,ctx)},
 {id:'royal_service',order:1462,advance:(e,d,ctx)=>advanceRoyalService(d,e,ctx)},
 {id:'nations',order:1464,advance:(e,d,ctx)=>advanceNations(d,e,ctx)},
 {id:'society_news',order:1500,advance:(e,d,{after})=>advanceSocietyNews(d,e,after)},
 {id:'festival',order:1600,active:e=>festivalCalendar(e).length>0,nextMinute:(e,d,now)=>nextFestivalMinute(d.get('state'),e,now),
  advance:(e,d,{after})=>advanceFestivals(d,e,after)},
 {id:'local_actor_positions',order:1700,advance(e,d,{after}){
    for(const[key,row]of Object.entries(d.get('state','records')??{}))if(key.startsWith('local_actor_position:')){
        const actor=d.get('state',row.subject?.startsWith('npc_')?'npcs':'creatures',row.subject);
        if(!actor||actor.location!==row.location||actor.scheduleTravel||actor.cognitionTravel||actor.status==='死亡'||row.expires<=after)d.remove(['state','records',key]);
    }
 }},
 {id:'magic_care',order:1800,advance:(e,d,{before,after})=>advanceCare(d,e,before,after)},
 {id:'magic_mind_space',order:1900,advance:(e,d,{before,after})=>advanceMindSpace(d,e,before,after)},
 {id:'shadow_contracts',order:2000,advance:(e,d,{before,after})=>advanceShadowContracts(d,before,after)},
 {id:'magic_objects',order:2100,advance:(e,d,{after})=>advanceMagicObjects(d,e,after)},
 {id:'magic_air',order:2200,advance:(e,d,{before,after})=>advanceAirEffects(d,e,before,after)},
 {id:'magic_water_earth',order:2300,advance:(e,d,{before,after})=>advanceWaterEarth(d,e,before,after)},
 {id:'magic_area',order:2400,active:(e,d)=>Object.values(d.get('state','effects')??{}).some(x=>x.kind==='area'),nextMinute:(e,d,now)=>nextMagicAreaMinute(d.get('state'),now),
  advance:(e,d)=>settleMagicAreas(d,e)},
 {id:'effect_expiry',order:2500,advance(e,d,{after}){
    for(const [key,effect] of Object.entries(d.get('state','effects'))) if(effect.expires<=after) d.remove(['state','effects',key]);
 }},
 {id:'dying',order:2600,advance(e,d,{after}){
    const p=d.get('state','player');
    if(p.status==='濒死' && after-p.dyingSince>=e.rules.death.dyingMinutes) e.death(d);
 }},
 {id:'deliveries',order:2700,advance(e,d,{after,id}){
    for(const [key,obligation] of Object.entries(d.get('state','obligations'))) {
        if((obligation.status==='待履行'||obligation.deliveryVersion===1&&obligation.status==='进行中') && obligation.deadline<=after && ['送货','付款'].includes(obligation.type)) {
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
for(const system of systems)registerAdvance(system);
