import {facilityView,installFacilityRuntime} from './facility-state.mjs';
import {knowledgeProficiency} from './education-state.mjs';
import {vocabulary} from './domain-rules.mjs';
const worldEvent=(state,key)=>{const id=key?.replace(/^world_event:/,'');const row=state.records?.[`world_event:${id}`];return row?.category==='world_event'&&row.id===id?row:null;};
import {digest,recordsWhere,recordsMemo,persistable} from './storage.mjs';
const generatedRecipeRows=Symbol('generated workstation recipes');

export function workstationDefinition(engine,state,id){
 for(const place of [...engine.world.locations,...Object.values(state.created??{})]){
  const station=place.workstations?.find(s=>s.id===id);
  if(station)return {station,location:place.id};
 }
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
 if(found.station.access!=='public'&&found.station.owner!==actor)throw Error('Private workstation requires actual owner permission');
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
 const station=(facilityView(engine,state,state.location)?.workstations??engine.byId.get(state.location)?.workstations)?.find(s=>s.kind===recipe.workstation);
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
    const location=state.created?.[slot.location]??engine.byId.get(slot.location);
    const facility=facilityView(engine,state,slot.location);
    if(facility?.factor===0)return [];
    const stations=facility?.workstations??location?.workstations??[];
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
