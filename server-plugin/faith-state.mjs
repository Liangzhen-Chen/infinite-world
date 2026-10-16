import {actorId,actorPath,npcHousehold} from './npc-state.mjs';
import {temples,placeAncestors} from './faith-catalog.mjs';
const fact=(value,source,override=false)=>({value:structuredClone(value),source,override});
const base=(e,s,id)=>s.created?.[id]??s.family?.people?.[id]??e.byId.get(id);
const actor=(e,s,id)=>actorPath(e.world,id).slice(1).reduce((o,k)=>o?.[k],s);
export function faithCulture(engine,state,id){
 const n=actor(engine,state,id),b=base(engine,state,id),h=npcHousehold(engine,state,id);
 return n?.culture??b?.culture??engine.byId.get(n?.residence?.settlement??h?.settlement??b?.settlement)?.culture??null;
}
export function faithOf(engine,state,requested){
 const id=actorId(engine.world,requested),own=actor(engine,state,id)?.faith??base(engine,state,id)?.faith;
 if(own)return fact(own,`actor.${id}.faith`,true);
 const all=temples(engine),b=base(engine,state,id),n=actor(engine,state,id),h=npcHousehold(engine,state,id);
 const result=(t,source)=>fact(t?{deity:t.deity,institution:t.seat,temple:t.id,church:t.church,observedSince:null,lastBreach:-1}:null,source);
 // Only current teachers/disciples retain a teaching affiliation after a job change.
 const careers=id==='player'?Object.values(state.careers??{}).map(c=>c.initiation).filter(c=>c?.status==='守戒中'):[];
 const teacher=n?.relationships?Object.entries(n.relationships).find(([,r])=>r.type==='师父')?.[0]:null;
 const mentor=teacher??b?.relationships?.find(r=>r.type==='师父'&&(!r.status||r.status==='有效'))?.with;
 const learned=all.find(t=>careers.some(c=>c.institution===t.seat&&c.teacher===t.teacher)||t.teacher===mentor||t.teacher===id&&(!n?.vocation||n.vocation.id===t.profession));
 if(learned)return result(learned,'current teacher / apprenticeship');
 const householdFaith=(h?.members??[]).filter(m=>m!==id).sort().map(m=>actor(engine,state,m)?.faith??base(engine,state,m)?.faith).find(f=>f?.temple||f?.deity);
 if(householdFaith)return fact({...householdFaith,observedSince:null},'current household faith');
 const culture=faithCulture(engine,state,id),god=engine.world.deities?.find(g=>g.culture===culture);
 const home=n?.residence?.home??h?.homeLocation??b?.home?.location??n?.residence?.settlement??h?.settlement??b?.settlement;
 const near=placeAncestors(engine,home);
 const local=all.filter(t=>near.includes(t.seat)).sort((a,b)=>near.indexOf(a.seat)-near.indexOf(b.seat)||a.id.localeCompare(b.id));
 const nearest=local.filter(t=>near.indexOf(t.seat)===near.indexOf(local[0]?.seat));
 const t=nearest.find(t=>t.deity===god?.id)??nearest[0];
 if(t)return result(t,'current residence temple + culture');
 return fact(god?{deity:god.id,temple:null,institution:null,church:god.church.name,observedSince:null,lastBreach:-1}:null,'current culture deity');
}
