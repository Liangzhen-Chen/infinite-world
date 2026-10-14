import {isReputationSettlement,reputationFactions,reputationSettlements}from'./reputation-registry.mjs';
import {registerWorldEventSubscriber}from'./world-events.mjs';
import {digest} from './storage.mjs';
import {relationView,recordStandingEvidence} from './npc-relations.mjs';
import {stanceOf} from './monster-society.mjs';
import {readBossCognition} from './boss-cognition.mjs';
import {readBossNegotiation} from './boss-negotiation.mjs';
import {npcHousehold} from './npc-life.mjs';
import {organizationsOf} from './organizations.mjs';

// One read model for "how does X regard Y", normalized to -100..100. It wraps
// the seven existing stores without changing them:
//  1 NPC relation ledger / legacy trust   2 monster-settlement stance records
//  3 settlement and faction reputation    4 faction-asset relations
//  5 pet loyalty and bond                  6 boss cognition and negotiation
//  7 spirit grudges and companionship
// plus `standing:<holder>:<target>` records that hold what reached a collective
// through a member (household, settlement, faction, spirit society, allies).
export const HOSTILE=-50;
const clamp=n=>Math.max(-100,Math.min(100,Math.round(n)));
const STANCE_VALUE={敌对:-60,戒备:-20,中立:0};
const rec=(holder,target)=>`standing:${holder}:${target}`;
const seat=(engine,id)=>engine.world.locations.some(l=>l.id===id&&l.monsterSociety);
const reputationOf=(state,subject,scope,target)=>state.records?.[`reputation:${digest([subject,scope,target]).slice(0,24)}`]?.reputation??0;
const factionRules=(engine,id)=>reputationFactions(engine).find(f=>f.id===id);

export function standingKind(engine,state,id){
    if(id==='player')return 'player';
    if(state.npcs?.[id])return 'npc';
    if(seat(engine,id))return 'society';
    if(String(id).startsWith('spirit_society:'))return 'spirit_society';
    if(isReputationSettlement(engine,id))return 'settlement';
    if(String(id).startsWith('faction_'))return 'faction';
    if(state.creatures?.[id])return 'creature';
    if(state.records?.[`organization:${id}`])return 'organization';
    return null;
}
// A resident boss's regard comes from what it remembers of real encounters.
function bossValue(actor,target){
    if(target!=='player'||!actor?.boss)return null;
    let relation=null,threats=0,contacts=0;
    try{relation=readBossNegotiation(actor).relation;const c=readBossCognition(actor);contacts=c.encounters.length;threats=c.encounters.filter(e=>e.kind==='clash'&&!['flee','defend'].includes(e.tactic)).length;}catch{return null;}
    if(relation)return relation.alliance?60:30;
    if(threats)return -60;
    return contacts?0:null;
}
function baseStanding(engine,state,holder,target,kind){
    if(kind==='npc'){
        const boss=bossValue(state.npcs[holder],target);
        return boss??relationView(engine,state,holder,target).trust;
    }
    if(kind==='society')return STANCE_VALUE[stanceOf(state,engine,holder,target)]??0;
    if(kind==='settlement')return reputationOf(state,target,'settlement',holder)*5;
    if(kind==='faction'){
        if(String(target).startsWith('faction_'))return state.records?.[`faction-assets:${holder}`]?.relations?.[target]??factionRules(engine,holder)?.relations?.find(r=>r.faction===target)?.score??0;
        return reputationOf(state,target,'faction',holder)*5;
    }
    if(kind==='creature'){
        const a=state.creatures[holder],boss=bossValue(a,target);if(boss!==null)return boss;
        if(target==='player'&&a.care)return a.owner==='player'?(a.care.loyalty-50)*2:a.care.bond??0;
        const grudges=(a.mind?.events??[]).filter(e=>e.kind==='寻仇'&&e.party===target).length;
        return grudges?-25*grudges:a.companion?.with===target?50:0;
    }
    return 0;
}
export function standingLedger(state,holder,target){return state.records?.[rec(holder,target)]??null;}
export function standing(engine,state,holder,target='player'){
    const kind=standingKind(engine,state,holder);
    return clamp(baseStanding(engine,state,holder,target,kind)+(standingLedger(state,holder,target)?.value??0));
}
// World words for the scene card; numbers stay out of narration.
export function standingWords(value){
    return value<=-60?'视你为仇':value<=-30?'对你怀有敌意':value<=-10?'对你戒备':value<10?'对你平常':value<30?'对你友善':value<60?'颇信任你':'视你为可托之人';
}

// Single write entry. A person's change goes into their own relation ledger;
// any other holder gets a standing record with its history.
export function adjustStanding(d,engine,holder,target,delta,{sourceEvent,reason,via=null,minute=d.get('state','minute')}){
    delta=Math.round(delta);if(!delta||holder===target)return null;
    const state=d.get('state'),kind=standingKind(engine,state,holder);if(!kind||kind==='player')return null;
    if(kind==='npc'){
        const row=recordStandingEvidence(d,engine,{key:`standing:${sourceEvent}:${holder}:${target}`,sourceEvent,eventType:delta<0?'亲友受害':'亲友受惠',from:holder,to:target,minute,delta:{trust:delta}});
        if(row)return row;
    }
    const old=standingLedger(state,holder,target);
    if(old?.history.some(h=>h.sourceEvent===sourceEvent&&h.via===via))return null;
    const row={category:'standing',holder,target,value:clamp((old?.value??0)+delta),history:[...old?.history??[],{delta,sourceEvent,reason,via,minute}]};
    d.set(['state','records',rec(holder,target)],row);return row;
}

// Transmission: what is done to a member reaches the collectives it belongs to,
// and through a faction its allies. Monster settlements react through their
// own stance steps (monster-society), so they are not repeated here.
export const TRANSMISSION=Object.freeze({household:0.5,settlement:0.3,faction:0.5,ally:0.25,spiritSociety:0.5,organization:0.5,allyMinimum:30});
export function eventWeight(e){
    if(e.verb==='harm'&&e.tags.includes('hostile'))return -(10+Math.min(20,e.harm??0));
    if(e.verb==='steal'&&e.witnesses?.length)return -10;
    if(e.verb==='gift'&&e.value>0)return Math.min(15,3+Math.floor(e.value/10));
    if(e.verb==='help'&&e.value>0)return Math.min(10,2+Math.floor(e.value/5));
    if(e.verb==='deceive'&&e.tags.includes('exposed'))return -8;
    if(e.verb==='breach')return -(5+Math.min(15,Math.floor((e.value??0)/10)));
    return 0;
}
export function collectivesOf(engine,state,member){
    const rows=[],npc=state.npcs?.[member],base=engine.byId.get(member);
    if(npc||base?.id?.startsWith('npc_')){
        const house=npc?npcHousehold(engine,state,member):null;
        for(const id of house?.members??[])if(id!==member&&state.npcs[id]&&state.npcs[id].status!=='死亡')rows.push({holder:id,ratio:TRANSMISSION.household,via:`household:${house.id}`});
        const settlements=reputationSettlements(engine),factions=reputationFactions(engine);
        let place=base?.settlement??npc?.settlement??null;const seen=new Set();
        if(!settlements.includes(place)){place=npc?.location??base?.location;while(place&&!seen.has(place)&&!settlements.includes(place)){seen.add(place);place=engine.byId.get(place)?.parent;}}
        if(place&&settlements.includes(place))rows.push({holder:place,ratio:TRANSMISSION.settlement,via:`settlement:${place}`});
        for(const f of factions)if((f.members??[]).includes(member)){
            rows.push({holder:f.id,ratio:TRANSMISSION.faction,via:`faction:${f.id}`});
            for(const other of factions)if(other.id!==f.id&&standing(engine,state,other.id,f.id)>=TRANSMISSION.allyMinimum)
                rows.push({holder:other.id,ratio:TRANSMISSION.faction*TRANSMISSION.ally,via:`ally:${f.id}`});
        }
        // Organizations joined in this campaign (player-founded guilds, gangs,
        // shops, churches; new members of catalog factions).
        for(const org of organizationsOf(state,member))if(!rows.some(r=>r.holder===org))
            rows.push({holder:org,ratio:TRANSMISSION.organization,via:`organization:${org}`});
    }else if(state.creatures?.[member]?.society?.id)rows.push({holder:state.creatures[member].society.id,ratio:TRANSMISSION.spiritSociety,via:`spirit_society:${member}`});
    return rows;
}
// World-event subscriber.
export function transmitStanding(d,engine,events){
    for(const e of events){
        if(e.legacy||e.actor!=='player'||!e.target||e.target==='player')continue;
        const weight=eventWeight(e);if(!weight)continue;
        for(const c of collectivesOf(engine,d.get('state'),e.target))
            adjustStanding(d,engine,c.holder,'player',weight*c.ratio,{sourceEvent:e.id,reason:`${e.verb}:${e.target}`,via:c.via,minute:e.minute});
    }
}
// World-event subscriber; settlement order is the `order` field.
registerWorldEventSubscriber({id:'standing',order:60,on:(d,engine,events)=>transmitStanding(d,engine,events)});
