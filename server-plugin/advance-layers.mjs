// Distance is derived from the player's current county and the authored
// county links. Only progress is persisted; a tier is never copied into people.
const DAY=1440;
import {obligationClosed} from './obligation-protocol.mjs';
export const ADVANCE_LAYERS=Object.freeze({intelligent:1,rule:DAY,statistics:7*DAY});

export const regionProgressKey=county=>`advance_region:${county}`;
export function advanceLayerPlan(engine,state){
    const counties=engine.world.regions?.filter(r=>r.category==='county')??[];
    const byCounty=new Map(counties.map(c=>[c.id,c])),places=new Map(engine.world.locations.map(p=>[p.id,p]));
    const countyOf=location=>{
        const seen=new Set();
        while(location&&!seen.has(location)){
            seen.add(location);const p=places.get(location);
            if(byCounty.has(p?.region))return p.region;
            const c=counties.find(c=>c.places?.includes(location)||c.seat?.location===location);if(c)return c.id;
            location=p?.parent??p?.scope;
        }
        return null;
    };
    const player=countyOf(state.location),distance=new Map(player?[[player,0]]:[]),queue=player?[player]:[];
    const adjacent=new Map(counties.map(c=>[c.id,new Set()]));
    for(const c of counties)for(const t of c.ties??[])if(adjacent.has(t.with)){adjacent.get(c.id).add(t.with);adjacent.get(t.with).add(c.id);}
    for(const id of queue)for(const next of adjacent.get(id)??[])if(!distance.has(next)){distance.set(next,distance.get(id)+1);queue.push(next);}
    const layers=new Map();
    for(const c of counties){
        const hops=distance.get(c.id)??Infinity;
        layers.set(c.id,hops<=1?'intelligent':hops===2||player&&c.province===byCounty.get(player)?.province?'rule':'statistics');
    }
    return {player,countyOf,layers};
}
// Only unprofiled, stationary skeleton actors can be deferred losslessly.
// Obligations, full profiles, illness, custody, work and changed livelihoods
// continue to use individual settlement at their existing event boundaries.
export function remoteScheduleBatch(engine,state,before,after,{promote=false}={}){

    const plan=engine.advanceLayerContext??advanceLayerPlan(engine,state),groups=new Map(),persons=new Map();
    for(const [county,remote] of Object.entries(state.remote??{})){
        const layer=plan.layers.get(county)??'statistics',through=state.records?.[regionProgressKey(county)]?.scheduleThrough??remote.minute;
        groups.set(county,{county,layer,before:Math.min(before,through),after,due:layer==='intelligent'||layer==='rule'&&(promote||Math.floor(before/DAY)<Math.floor(after/DAY)),people:[]});
    }
    const companions=new Set(state.player?.companions??[]),booked=new Set(Object.values(state.obligations??{}).filter(o=>['待履行','进行中'].includes(o.status)||o.runtimeVersion===1&&o.endedAt===undefined&&!obligationClosed(o)).flatMap(o=>[o.promisor,o.promisee,...(o.runtimeVersion===1?[o.debtor,o.creditor]:[])]));
    const pinned=new Set();
    for(const r of Object.values(state.records??{})){
        if(r.category==='governance_office')pinned.add(r.holder);
        if(r.category==='legal_dismissal')pinned.add(r.subject??r.npc);
        if(['legal_custody','legal_detention'].includes(r.category))pinned.add(r.subject);
        if(r.category==='organization')for(const id of Object.keys(r.members??{}))pinned.add(id);
    }
    for(const e of Object.values(state.effects??{}))pinned.add(e.target);
    for(const id of Object.keys(state.npcs??{})){
        const base=engine.byId.get(id),n=state.npcs[id],g=groups.get(base?.county);
        if(!g||base.generated!=='remote'||base.profileStatus==='full'||base.tier==='full'||n.life||n.vocation||n.residence||n.caring||n.levy||n.scheduleTravel||n.cognitionTravel||n.status&&n.status!=='正常'||companions.has(id)||booked.has(id)||engine.npcAutonomyBusy?.(state,id,before))continue;
        // An official or keeper has a fixed location throughout the skeleton's
        // day. A changed office/organization invalidates this eligibility below.
        const slots=Object.values(base.schedule??{}).flat().filter(s=>s&&typeof s==='object');
        if(!slots.length||slots.some(s=>s.location!==n.location))continue;
        if(pinned.has(id))continue;
        persons.set(id,g);g.people.push(id);
    }
    return {groups,persons};
}
