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
import {settleMagicAreas,nextMagicAreaMinute}from'./magic-area.mjs';
import {milestone}from'./progression.mjs';
import {advancePets}from'./pets.mjs';
import {advanceSummons}from'./summons.mjs';
import {advanceLaw}from'./law.mjs';
import {cropProduction}from'./weather.mjs';
import {advanceAgriculture,settleAgricultureExpiry}from'./agriculture.mjs';
import {advanceSettlementTrade,nextSettlementTradeMinute}from'./settlement-trade.mjs';
import {advanceWorldClocks,nextWorldClockMinute}from'./world-clock.mjs';
import {advanceFactionClocks,nextFactionClockMinute,factionClockRules}from'./faction-clock.mjs';
import {advanceFestivals,nextFestivalMinute,festivalCalendar}from'./festival.mjs';
import {advanceWildlife,nextWildlifeEncounterMinute,wildlifeEncounterAt,settleWildlifeEncounter}from'./wildlife.mjs';
import {advanceBosses}from'./bosses.mjs';
import {advanceNpcCognition,nextNpcCognitionMinute}from'./npc-cognition.mjs';
import {advanceNpcAutonomy,nextNpcAutonomyMinute}from'./npc-autonomy.mjs';
import {advanceNpcLife,nextNpcLifeMinute}from'./npc-life.mjs';
import {advanceNpcObligations,nextNpcObligationMinute}from'./npc-obligations.mjs';
import {advanceSocietyNews}from'./monster-society.mjs';
import {advanceSeasonEffects}from'./effects.mjs';
import {advanceOrganizations}from'./organizations.mjs';

const clone=value=>structuredClone(value);
const fullNpcs=engine=>engine.world.npcs.some(n=>n.tier==='full');
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
export function runAdvance(engine,d,ctx){for(const system of advanceRegistry)system.advance(engine,d,ctx);}

// Order mirrors the original hand-written WorldEngine.advanceInterval sequence.
const systems=[
 {id:'npc_obligations',order:100,active:e=>fullNpcs(e),nextMinute:(e,d,now)=>nextNpcObligationMinute(d.get('state'),now),
  advance:(e,d,{before,after,id})=>advanceNpcObligations(d,e,before,after,id)},
 {id:'contracts',order:200,advance:(e,d,{after})=>advanceContracts(d,e,after)},
 {id:'credit',order:250,advance:(e,d,{after})=>advanceCredit(d,e,after)},
 {id:'summons',order:300,advance:(e,d,{after})=>advanceSummons(d,after)},
 {id:'law',order:400,advance:(e,d,{after})=>advanceLaw(d,after,e)},
 {id:'daily',order:500,advance(e,d,{before,after}){
    for(let day=Math.floor(before/1440);day<Math.floor(after/1440);day++){
      for(const [sid,source] of Object.entries(d.get('state','settlements'))) {
        const farming=advanceAgriculture(d,e,sid,source,day),s=farming?.settlement??clone(source);
        const production=farming?0:cropProduction(e,d.document.randomSeed,sid,day*1440,s.foodPerDay),available=s.food+production;
        const missing=farming?.missingMeals??Math.max(0,s.population-available);
        if(!farming)s.food=Math.max(0,available-s.population);s.unmetMeals=(s.unmetMeals??0)+missing;
        s.starvation=missing ? (s.starvation??0)+1 : Math.max(0,(s.starvation??0)-1);
        if(s.starvation>=7){s.population=Math.max(0,s.population-1);s.starvation=0;d.say(`${s.name}发生饥荒死亡`);}
        s.wood+=farming?.woodProduced??s.woodPerDay;d.set(['state','settlements',sid],s);
      }
      advancePets(d,e,(day+1)*1440);
      advanceWildlife(d,e,day);advanceBosses(d,e,day);
    }
 }},
 {id:'pets',order:600,advance:(e,d,{after})=>advancePets(d,e,after)},
 {id:'agriculture_expiry',order:700,advance:(e,d)=>settleAgricultureExpiry(d,e)},
 {id:'settlement_trade',order:800,active:e=>!!e.rules.settlementTrade,nextMinute:(e,d,now)=>nextSettlementTradeMinute(d.get('state'),e,now),
  advance:(e,d,{after})=>advanceSettlementTrade(d,e,after)},
 {id:'projects',order:900,advance(e,d,{days,id}){
    if(days)for(const [key,project]of Object.entries(d.get('state','projects')))if(project.type==='工程'&&project.status==='施工中'){
        const remainingDays=Math.max(0,project.remainingDays-days);d.set(['state','projects',key],{...project,remainingDays,status:remainingDays?'施工中':'已完成'});
        if(!remainingDays&&project.creator==='player')milestone(d,e,'publicContribution',key,id);
    }
 }},
 {id:'npc_cognition',order:1000,active:e=>fullNpcs(e),nextMinute:(e,d,now)=>nextNpcCognitionMinute(d.get('state'),now),
  advance:(e,d,{before,after,id,beforeState})=>{if(fullNpcs(e))advanceNpcCognition(d,e,before,after,id,{beforeState});}},
 {id:'npc_autonomy',order:1100,active:e=>fullNpcs(e),nextMinute:(e,d,now)=>nextNpcAutonomyMinute(d.get('state'),now),
  advance:(e,d,{before,after,id,beforeState})=>{if(fullNpcs(e))advanceNpcAutonomy(d,e,before,after,id,{beforeState});}},
 {id:'npc_life',order:1200,active:e=>fullNpcs(e),nextMinute:(e,d,now)=>nextNpcLifeMinute(d.get('state'),now),
  advance:(e,d,{before,after})=>{if(fullNpcs(e))advanceNpcLife(d,e,before,after);}},
 {id:'world_clock',order:1300,active:e=>!!e.rules.worldClock,nextMinute:(e,d,now)=>nextWorldClockMinute(d.get('state'),now),
  advance:(e,d,{after})=>advanceWorldClocks(d,e,after)},
 {id:'season_effects',order:1350,advance:(e,d,{before,after})=>advanceSeasonEffects(d,e,before,after)},
 {id:'faction_clock',order:1400,active:e=>factionClockRules(e).length>0,nextMinute:(e,d,now)=>nextFactionClockMinute(d.get('state'),now),
  advance:(e,d,{after})=>advanceFactionClocks(d,e,after)},
 {id:'organizations',order:1450,advance:(e,d,ctx)=>advanceOrganizations(d,e,ctx)},
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
