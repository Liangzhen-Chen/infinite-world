// Shared request classification, initial project facts and read-only catalog queries.
import {reject} from './action-rejection.mjs';
import {subjectiveView} from './subjective-view.mjs';
// Native request programs for intentions which do not claim a successful effect.
// Requests record speech, never another person's agreement or a completed service.
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {catalogDefinition} from './catalog.mjs';
declareHoldingWriter('routing-programs');

// The proposal's intent is the player's own text; no scorer framing is parsed.
export const intentText=p=>typeof p.intent==='string'?p.intent:'';
// A generic request's subject is classified by the action catalog
// (signature.requestSubjects, via the caller's classify); unknown subjects stay
// a plain request. No subject vocabulary is written here.
export function requestKind(effect,classify=()=>null){
 if(effect?.op!=='emit')return null;
 const {kind,subject}=effect.payload??{};
 if(kind==='confession')return 'confession';
 if(effect.verb==='tell')return kind??'tell';
 if(effect.verb!=='request')return kind;
 if(kind!=='request')return kind;
 return (typeof subject==='string'&&classify(subject))||'request';
}

// Initial snapshots contain a pending proposal only. No permit or enrollment
// can be imported by this writer; later execution rechecks actual decisions.
export function initializeFestivalProject(d,engine,row,context){
 const keys=['id','type','name','actor','location','budget','spent','stage','venueConsent','participants','sourceEvent'];
 if(!['initial','action'].includes(context?.origin)||typeof row.id!=='string'||!row.id||!context.eventId||d.get('state','projects',row.id)||Object.keys(row).some(k=>!keys.includes(k))||row.type!=='节庆筹办'||row.actor!=='player'||row.location!==d.get('state','location')||!Number.isSafeInteger(row.budget)||row.budget<0||row.budget>d.get('state','player','coins')||row.spent!==0||row.stage!=='征询'||row.venueConsent!==null||!Array.isArray(row.participants)||row.participants.length)throw Error('Invalid pending festival project');
 holdingSet(d,engine,['state','projects',row.id],{...structuredClone(row),sourceEvent:context.eventId},'routing-programs');
}

export function routingRead(engine,document,action,input,{preview=false}={}){
 if(!action?.readOnly||!['world_read','world_catalog'].includes(action.call?.tool))return null;
 const slots=input.args?.slots??{};
 if(Object.keys(slots).some(k=>!action.slots.some(s=>s.name===k)))throw Error('Invalid read slots');
 if(slots.section!==undefined&&!['行囊','约定','人物'].includes(slots.section))throw Error('Invalid read section');
 if(slots.npc!==undefined&&(slots.section!=='人物'||typeof slots.npc!=='string'))throw Error('npc requires the people section');
 const people=slots.section==='人物'?subjectiveView(engine,document,'player').observable.people.filter(p=>!slots.npc||p.id===slots.npc):null;
 const data=action.call.tool==='world_read'?(people??(slots.section==='约定'?Object.values(document.state.obligations??{}).filter(o=>[o.debtor,o.creditor,o.promisor,o.promisee].includes('player')):{coins:document.state.player.coins,inventory:structuredClone(document.state.inventory)})):slots.entity||slots.kind?catalogDefinition(engine,document,slots):{help:'角色面板：从无限原野扩展菜单选择“角色”；账目与行囊从相应面板查看。'};
 return {patches:[],receipt:{eventId:input.eventId,actor:'player',routed:action.id,status:preview?'preview':'committed',applied:[],cost:{time:0,resources:[]},data}};
}
