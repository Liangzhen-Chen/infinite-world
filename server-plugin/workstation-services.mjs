import fs from 'node:fs';
import {facilityView,installFacilityRuntime,FACILITY_TYPES} from './facility-state.mjs';
import {knowledgeProficiency} from './education-state.mjs';
import {vocabulary} from './domain-rules.mjs';
import {homeResidents} from './entity-view.mjs';
import {aliveHoldings,holdingsView} from './holdings.mjs';
const worldEvent=(state,key)=>{const id=key?.replace(/^world_event:/,'');const row=state.records?.[`world_event:${id}`];return row?.category==='world_event'&&row.id===id?row:null;};
import {digest,recordsWhere,recordsMemo,persistable} from './storage.mjs';
const generatedRecipeRows=Symbol('generated workstation recipes');

// K5: a workstation is what a place's fixed equipment affords, never a list of
// stations. world/ontology/fixtures.json says which fixture affords which
// recipe workstation; a place carries `fixtures` ([{fixture,id?,fee?,
// thermalRequirement?,owner?}] or bare fixture ids; owner only for equipment
// owned apart from the building), and a constructed facility type
// brings its standard fixtures (FACILITY_TYPES[type].fixtures). Owner and
// opening are read from the place; a fee is the owner's posted price on the
// fixture.
const FIXTURES=new Map(JSON.parse(fs.readFileSync(new URL('../world/ontology/fixtures.json',import.meta.url),'utf8')).entries.map(row=>[row.id,row]));
export const fixtureDefinition=id=>FIXTURES.get(id)??null;
export const fixtureAffording=kind=>[...FIXTURES.values()].find(row=>row.affords===kind)?.id??null;
const fixtureEntry=row=>typeof row==='string'?{fixture:row}:row;
const placeOf=(engine,state,id)=>state?.created?.[id]??engine.byId.get(id);
// Stations from a place's own published or created facts (no campaign state).
// A place that is open to the public, or whose fixture carries the owner's
// posted fee, offers the station to anyone for that fee; otherwise only the
// owner, residents, lessees and those the owner licenses may use it.
export function fixtureStations(place){
 if(!place||typeof place!=='object')return [];
 const implied=place.facilityType?FACILITY_TYPES[place.facilityType]?.fixtures??[]:[];
 const out=[];
 for(const row of [...(Array.isArray(place.fixtures)?place.fixtures:[]),...implied].map(fixtureEntry)){
  const fixture=FIXTURES.get(row?.fixture);if(!fixture||out.some(s=>s.kind===fixture.affords))continue;
  out.push({id:row.id??`station_${place.id}_${fixture.affords}`,kind:fixture.affords,fixture:row.fixture,location:place.id,
   access:row.fee!==undefined||place.access?.mode==='public'?'public':'consent',fee:row.fee??0,...(typeof row.owner==='string'?{owner:row.owner,ownedApart:true}:{}),
   ...(row.thermalRequirement?{thermalRequirement:row.thermalRequirement}:{})});
 }
 return out;
}
// Who holds the station: the building's current owner, its catalogue owner,
// the household living there, or the settlement whose ground it is. A bound
// heat source keeps its own owner and consent (magic-object reads those).
export function stationOwners(engine,state,station){
 const place=placeOf(engine,state,station.location);
 return place?ownersAt(place,engine.world.households,state):[];
}
function ownersAt(place,worldHouseholds,state){
 const building=state?.buildings?.[place.id];
 if(building&&Object.hasOwn(building,'owner'))return typeof building.owner==='string'?[building.owner]:[];
 if(typeof place.owner==='string')return [place.owner];
 // Household rows, not homeResidents: that view reads facilityView, which reads these owners.
 const households=(worldHouseholds??[]).filter(h=>h.homeLocation===place.id);
 const residents=[...new Set(households.length?households.flatMap(h=>[...h.members,...state?.family?.households?.[h.id]?.members??[]]):place.access?.residents??[])];
 if(residents.length)return residents;
 // Unclaimed ground belongs to the settlement it lies in.
 return typeof place.scope==='string'?[place.scope]:[];
}
// Load-time projection for readers of place.workstations: every published
// place's stations are rewritten from its fixtures, so a hand-written list in
// a world file never survives (a place without fixtures has none).
// Idempotent; campaign changes (rebuilt, sold, ruined) are read through
// facilityView/placeWorkstations, which use the same derivation.
// Every place gets the projection, so fixtures added later are seen too.
export function materializeWorkstations(world){
 for(const place of world.locations??[]){
  delete place.workstations;
  // A non-enumerable getter: the world's serialized form, hash and clones keep
  // only the fixtures, and an edited fixture is what every reader sees.
  Object.defineProperty(place,'workstations',{get:()=>fixtureStations(place).map(station=>({...station,owner:station.owner??ownersAt(place,world.households,null)[0]??null})),enumerable:false,configurable:true});
 }
 return world;
}
// The current stations at a place, with their derived owner.
export function placeWorkstations(engine,state,id){
 return fixtureStations(placeOf(engine,state,id)).map(station=>{const owners=station.owner?[station.owner]:stationOwners(engine,state,station);return {...station,owner:owners[0]??null,owners};});
}
export function workstationDefinition(engine,state,id){
 for(const place of [...engine.world.locations,...Object.values(state?.created??{})]){
  const station=fixtureStations(place).find(s=>s.id===id);
  if(station)return {station:placeWorkstations(engine,state,place.id).find(s=>s.id===id),location:place.id};
 }
 return null;
}
// Does the consent's recorded purpose name this fixture or its use? Only a
// purpose that names it covers it; a visit permit is not a hearth loan.
function purposeNames(station,text){
 return typeof text==='string'&&(FIXTURES.get(station.fixture)?.names??[]).some(name=>text.includes(name));
}
// Lawful use of a station by `actor`. A learned recipe is no licence: only
// title (owner, resident), a lease of the place, the owner's consent, or the
// posted public fee. Returns {basis} or null (the use is then unlicensed).
export function stationLicence(engine,document,station,actor='player',{authorization}={}){
 const reader=typeof document?.get==='function'?document:holdingsView(document),state=reader.get('state');
 if(station.owners?.includes(actor))return {basis:'owner'};
 // Living in or renting the place covers its own equipment, not equipment owned apart.
 if(!station.ownedApart&&state&&homeResidents(engine,state,station.location).value.includes(actor))return {basis:'resident'};
 if(!station.ownedApart&&['leases','operates'].some(kind=>aliveHoldings(reader,{kind,subject:station.location}).some(h=>h.holder===actor)))return {basis:'lease'};
 const grantors=new Set([...station.owners??[],...!station.ownedApart&&state?homeResidents(engine,state,station.location).value:[]]);
 const permits=authorization!==undefined?[state?.records?.[authorization]]:recordsWhere(state?.records,'category','authorization');
 const permit=permits.find(p=>p?.category==='authorization'&&p.grantee===actor&&grantors.has(p.grantor)&&p.revoked!==true&&p.endedAt===undefined&&(p.expires===undefined||p.expires>state.minute)&&
  (p.action==='workshop_use'&&[station.id,station.location].includes(p.subject)||p.subject===station.location&&purposeNames(station,p.content)));
 if(permit)return {basis:'consent',permit};
 if(station.access==='public')return {basis:'paid'};
 return null;
}
const accessKey=id=>`workstation_access:${id}`;
function paidSource(engine,state,row){
 const event=worldEvent(state,row.paymentEvent),p=event?.payload;
 return event?.verb==='paid'&&event.actor===row.holder&&event.minute<=row.fromMinute&&p.amount===row.fee&&p.purpose===vocabulary(engine,'workstation','paymentPurpose')&&p.resource==='coin_river'&&(p.subject===row.station||p.to?.role===vocabulary(engine,'workstation','feeRecipientRole')&&p.to.of===row.station);
}
export function recordWorkstationAccess(d,engine,row,{actor=row.holder}={}){
 const state=d.get('state'),found=workstationDefinition(engine,state,row.station);
 if(actor!==row.holder||actor!=='player'&&!state.npcs?.[actor]||typeof row.id!=='string'||!row.id||d.get('state','records',accessKey(row.id))||!found||!Number.isSafeInteger(row.fromMinute)||row.fromMinute<0||!Number.isSafeInteger(row.toMinute)||row.fromMinute>=row.toMinute||!Number.isSafeInteger(row.fee)||row.fee<0||row.fee!==(found.station.fee??0)||typeof row.paid!=='boolean'||row.usable!==undefined&&typeof row.usable!=='boolean')throw Error('Invalid workstation access');
 if(row.usable!==undefined&&row.usable!==((facilityView(engine,state,found.location)?.factor??1)>0))throw Error('Declared workstation usability conflicts with the real facility condition');
 if(found.station.access!=='public'&&!found.station.owners.includes(actor))throw Error('Private workstation requires actual owner permission');
 if(row.paid){
  if(!paidSource(engine,state,row))throw Error('Invalid workstation prepayment source');
  if(recordsWhere(state.records,'category','workstation_access').some(r=>r.paymentEvent===row.paymentEvent))throw Error('Prepayment already assigned');
 }else if(row.paymentEvent!==undefined)throw Error('Unpaid access cannot claim a payment');
 const {usable,...facts}=row,value={...persistable(facts),category:'workstation_access'};
 d.set(['state','records',accessKey(row.id)],value);
 d.set(['state','records',`${accessKey(row.id)}:source`],{category:'workstation_access_receipt',digest:digest(value)});
 return value;
}
export function workstationAccess(engine,state,station,holder='player',minutes=0){
 // The receipt digest is the costly check, so it runs only on rows that already match.
 return recordsWhere(state?.records,'category','workstation_access').filter(r=>r.station===station&&r.holder===holder&&r.fromMinute<=state.minute&&state.minute<r.toMinute&&state.minute+minutes<=r.toMinute&&(!r.paid||paidSource(engine,state,r))&&state.records[`${accessKey(r.id)}:source`]?.digest===digest(r));
}
export function workstationFee(engine,state,station,holder='player'){
 const receipt=workstationAccess(engine,state,station.id,holder).find(r=>r.paid&&!state.records[`${accessKey(r.id)}:used`]);
 return receipt?Math.max(0,(station.fee??0)-receipt.fee):station.fee??0;
}
export function prepareBookedWorkstation(d,engine,tool,args){
 const repairing=tool==='repair'||tool==='craft'&&args.operation==='repair';
 if(!repairing&&(tool!=='craft'||args.operation!==undefined&&args.operation!=='manufacture'||args.maker!==undefined))return null;
 const state=d.get('state');
 if(!recordsWhere(state.records,'category','workstation_access').some(r=>r.holder==='player'))return null;
 let recipe;
 if(repairing){
  const item=args.item?engine.resolve(args.item,'item'):state.itemInstances?.[args.instance]?.item,plans=(engine.rules.repairs??[]).filter(r=>r.item===item);
  recipe=args.repairPlan?plans.find(r=>r.id===args.repairPlan):plans.length===1?plans[0]:null;
 }else recipe=engine.byId.get(engine.resolve(args.recipe,'recipe'));
 if(!recipe?.workstation)return null;
 const station=facilityView(engine,state,state.location)?.workstations.find(s=>s.kind===recipe.workstation);
 if(!station)return null; // Native manufacture owns the missing-station diagnostic.
 const rows=recordsWhere(state.records,'category','workstation_access').filter(r=>r.station===station.id&&r.holder==='player');
 if(!rows.length)return null;
 const minutes=repairing?recipe.minutes:Math.ceil(recipe.minutes/(facilityView(engine,state,state.location)?.factor??1));
 const valid=workstationAccess(engine,state,station.id,'player',minutes);
 if(!valid.length)throw Error('Workstation booking does not cover the complete production time');
 const receipt=valid.find(r=>r.paid&&!state.records[`${accessKey(r.id)}:used`])??null;
 const native=workstationDefinition(engine,state,station.id)?.station??station;
 const maxByTime=Math.floor((Math.max(...valid.map(r=>r.toMinute))-state.minute)/minutes);
 const maxByMoney=native.fee?Math.floor(state.player.coins/native.fee)+(receipt?1:0):Infinity;
 return {receipt,minutes,maxBatches:Math.min(maxByTime,maxByMoney)};
}
export function consumeWorkstationPrepayment(d,receipt,eventId){
 if(receipt&&!d.get('state','records',`${accessKey(receipt.id)}:used`))d.set(['state','records',`${accessKey(receipt.id)}:used`],{category:'workstation_prepayment_used',access:receipt.id,amount:receipt.fee,sourceEvent:eventId,minute:d.get('state','minute')});
}
installFacilityRuntime({prepareBookedWorkstation,consumeWorkstationPrepayment});

// Like derived shops, recipes are capabilities of current work, never edits to
// a published person. A service-bearing or explicit production slot marks work;
// merely sleeping or eating in a workshop does not put its resident on duty.
// Schedule projections omit presence; actual consumers still require arrival.
export function workstationRecipes(engine,state,id,slot,{present=false}={}){
    if(!state||!slot?.location||!slot.services?.length&&slot.production!==true)return [];
    const actor=state.npcs?.[id];
    if(present&&(!actor||actor.location!==slot.location||actor.scheduleTravel||actor.cognitionTravel||actor.caring||actor.levy||['死亡','濒死','昏迷','患病'].includes(actor.status)))return [];
    const stations=facilityView(engine,state,slot.location)?.workstations??[];
    if(!stations.length)return [];
    // One advance can ask every worker at thousands of schedule boundaries.
    // Cache only the generated recipe candidates, not access or proficiency.
    // PatchCursor invalidates created memos on every generated-entity write;
    // ordinary queries outside an advance always rebuild the candidate list.
    const generated=recordsMemo(state.created,generatedRecipeRows,()=>Object.values(state.created??{}).filter(r=>r.id?.startsWith('recipe_')));
    return [...engine.world.recipes??[],...generated].filter(r=>
        r.workstation&&(!r.location||r.location===slot.location)&&stations.some(s=>s.kind===r.workstation)&&
        knowledgeProficiency(engine,state,id,r.skill)>=(r.minimumProficiency??0));
}

export function currentWorkstationRecipes(engine,state,id){
    const slot=engine.protocolScheduleAt?.(engine,id,state.minute,state);
    return workstationRecipes(engine,state,id,slot,{present:true});
}
