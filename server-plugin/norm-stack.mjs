// L1: applicable norms are independent of the presence of a court or officer.
// Existing codes/locations are the compatibility input, not inferred legislation.
import {regionOf} from './regions.mjs';
import {nationAt} from './noble-state.mjs';
import {memberOrganizations} from './organization-state.mjs';
import {digest} from './storage.mjs';

const pathKeys=new Map();
const read=(object,path)=>{let keys=pathKeys.get(path);if(!keys){keys=path.split('.');pathKeys.set(path,keys);}let value=object;for(const key of keys)value=value?.[key];return value;};
const active=(row,minute)=>(row.effectiveFrom??-Infinity)<=minute&&(row.effectiveUntil??Infinity)>minute;
const inherited=value=>value===undefined||value==='inherit';
const clone=value=>value===undefined?undefined:value===null||typeof value!=='object'?value:structuredClone(value);
// Static location indexes, one per immutable locations array of a loaded world.
const placeIndexes=new WeakMap();
function placeIndex(world){
 const list=world.locations??[];let index=placeIndexes.get(list);
 if(!index||index.size!==list.length){
  const last=new Map(),first=new Map();
  for(const p of list){last.set(p.id,p);if(!first.has(p.id))first.set(p.id,p);}
  index={size:list.length,last,first};placeIndexes.set(list,index);
 }
 return index;
}

export function placeChain(engine,state,location){
 const places=placeIndex(engine.world).last;
 const out=[],seen=new Set();
 for(let at=location;at;at=(state.created?.[at]??places.get(at))?.parent){
  if(seen.has(at))throw Error(`E-NORM-PARENT: ${at}`);
  seen.add(at);out.push(at);
 }
 const region=regionOf(engine.world,location);
 for(const id of [region?.county.id,region?.province?.id])if(id&&!seen.has(id)){seen.add(id);out.push(id);}
 return out;
}

function bindingRows(world){
 return world.rules.law?.bindings??[];
}
function slotAt(world,place,slot,minute){
 const rows=bindingRows(world).filter(b=>b.place===place&&(b.slot??'place.lawCode')===slot&&active(b,minute));
 const native=placeIndex(world).first.get(place)?.[slot.split('.')[1]];
 if(native!==undefined)rows.push({place,slot,value:native,source:`location:${place}`});
 if(rows.length>1){
  // A repeated declaration is still a conflict: pack installation must resolve
  // the slot explicitly before handing the world to the runtime.
  throw Error(`E-CONFLICT-SLOT ${slot}@${place}: ${rows.map(r=>r.source??r.value).sort().join(', ')}`);
 }
 return rows[0]??null;
}

export function validateNormBindings(world){
 const errors=[],places=new Set([...(world.locations??[]),...(world.regions??[])].map(p=>p.id));
 const codes=new Set([...(world.rules.law?.codes??[]),...(world.rules.law?.templates??[])].map(c=>c.id));
 const cultures=new Set((world.cultures??[]).map(c=>c.id));
 const rows=bindingRows(world);
 if(!Array.isArray(rows))return ['E-NORM-BINDING: bindings must be an array'];
 if(rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))return ['E-NORM-BINDING: each binding must be an object'];
 for(const row of rows){
  const slot=row.slot??'place.lawCode';
  if(!places.has(row.place))errors.push(`E-NORM-BINDING unknown place: ${row.place}`);
  if(!['place.lawCode','place.culture'].includes(slot))errors.push(`E-NORM-BINDING unknown slot: ${slot}`);
  if(!(slot==='place.culture'?cultures:codes).has(row.value))errors.push(`E-NORM-BINDING unknown value: ${row.value}`);
  if(slot==='place.lawCode'&&(world.rules.law?.codes??[]).some(c=>c.locations?.includes(row.place)&&c.id!==row.value))errors.push(`E-CONFLICT-SLOT place.lawCode@${row.place}: authored code and binding disagree`);
  if(row.effectiveFrom!==undefined&&!Number.isFinite(row.effectiveFrom)||row.effectiveUntil!==undefined&&!Number.isFinite(row.effectiveUntil)||row.effectiveUntil!==undefined&&row.effectiveUntil<=(row.effectiveFrom??-Infinity))errors.push(`E-NORM-BINDING invalid interval: ${row.place}`);
 }
 const all=[...rows,...(world.locations??[]).flatMap(p=>['lawCode','culture'].filter(k=>p[k]!==undefined).map(k=>({place:p.id,slot:`place.${k}`,value:p[k]})))];
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
  const a=all[i],b=all[j];
  if(a.place===b.place&&(a.slot??'place.lawCode')===(b.slot??'place.lawCode')&&Math.max(a.effectiveFrom??-Infinity,b.effectiveFrom??-Infinity)<Math.min(a.effectiveUntil??Infinity,b.effectiveUntil??Infinity))errors.push(`E-CONFLICT-SLOT ${a.slot??'place.lawCode'}@${a.place}`);
 }
 for(const p of world.locations??[]){
  if(p.lawCode!==undefined&&!codes.has(p.lawCode))errors.push(`E-NORM-BINDING unknown value: ${p.lawCode}`);
  if(p.culture!==undefined&&!cultures.has(p.culture))errors.push(`E-NORM-BINDING unknown value: ${p.culture}`);
 }
 return errors;
}

export function placeCulture(engine,state,location,minute=state.minute??0){
 for(const at of placeChain(engine,state,location)){
  const binding=slotAt(engine.world,at,'place.culture',minute);
  if(binding)return {value:binding.value,source:binding.source??`place.culture@${at}`,place:at};
 }
 return null;
}

// The optional codes argument is the current law-codes view, including courts
// generated for expanded counties. This avoids a dependency back on law-codes.
export function normStack(engine,state,actor,location,minute=state.minute??0,{codes=engine.rules.law?.codes??[],versions=true}={}){
 location??=actor&&actor!=='player'?(state.npcs?.[actor]?.location??state.created?.[actor]?.location??engine.byId.get(actor)?.location):state.location;
 const chain=placeChain(engine,state,location),rows=[],seen=new Set();
 const append=(code,layer,place,source,binding=true)=>{
  if(!code||!active(code,minute)||seen.has(`${layer}:${code.id}`))return;
  seen.add(`${layer}:${code.id}`);
  rows.push({layer,place,source:source??code.id,version:versions?code.version??`sha256:${digest(code)}`:undefined,effectiveFrom:code.effectiveFrom??null,code,binding});
 };
 for(const at of chain){
  const binding=slotAt(engine.world,at,'place.lawCode',minute);
  const candidates=codes.filter(c=>c.locations?.includes(at)&&active(c,minute));
  if(binding){
   if(candidates.some(c=>(c.originalCode??c.id)!==binding.value))throw Error(`E-CONFLICT-SLOT place.lawCode@${at}: authored code and binding disagree`);
   // A published code can be split between several current sovereigns. The
   // segment covering this place wins over another segment with the old id.
   const matches=c=>c.id===binding.value||c.originalCode===binding.value;
   const code=candidates.find(matches)??codes.find(matches)??engine.rules.law?.templates?.find(c=>c.id===binding.value);
   if(!code)throw Error(`E-NORM-BINDING unknown code: ${binding.value}`);
   append(code,'subordinate',at,code.nation?`nation:${code.nation}:${binding.value}`:binding.source??`place.lawCode@${at}`);
  }else{
   if(candidates.length>1)throw Error(`E-CONFLICT-SLOT place.lawCode@${at}: ${candidates.map(c=>c.id).sort().join(', ')}`);
   append(candidates[0],'subordinate',at,candidates[0]?.id);
  }
 }
 const county=regionOf(engine.world,location)?.county;
 const polity=county?.ruler?.polity;
 const template=engine.rules.law?.templates?.find(t=>t.polity===(polity?.startsWith('王国')?'王国':polity)&&(!t.province||t.province===county.province));
 const nation=nationAt(engine,state,location);
 const sovereign=nation&&template?{...template,id:`nationlaw:${nation.id}:${template.id}`,penalties:{...template.penalties,...nation.amendments}}:template;
 append(sovereign,'sovereign',county?.id,nation?`nation:${nation.id}`:county?`regions:${county.id}.ruler`:null);
 // Existing charter prose is a candidate source, never parsed as legislation.
 // Membership stays separate from territorial civil/procedural selection.
 if(actor)for(const org of memberOrganizations(engine,state,actor).sort((a,b)=>a.id.localeCompare(b.id)))append({id:org.id,...org.charter},'membership',null,`organization:${org.id}.charter`,false);
 return rows;
}

// A binding grants local legislative scope, but never overrides a clause that
// the sovereign explicitly reserved. Missing values (or inherit) fall through.
export function normClause(stack,path,{layer=null}={}){
 const sovereign=stack.find(r=>r.layer==='sovereign');
 const reserved=sovereign?.code.reserved??[];
 const denied=[];
 for(const row of stack){
  if(layer?row.layer!==layer:!['contract','subordinate','sovereign'].includes(row.layer))continue;
  const value=read(row.code,path);
  if(inherited(value))continue;
  if(row.layer==='subordinate'&&reserved.some(p=>path===p||path.startsWith(`${p}.`))){denied.push({source:row.source,path,reason:'reserved'});continue;}
  return {value:clone(value),source:row.source,version:row.version,layer:row.layer,denied};
 }
 return {value:undefined,source:null,version:null,layer:null,denied};
}

function mergeClauses(stack,target,path){
 const candidates=stack.map(r=>read(r.code,path)).filter(v=>v&&typeof v==='object'&&!Array.isArray(v));
 const keys=[...new Set(candidates.flatMap(v=>Object.keys(v)))];
 for(const key of keys){
  const next=path?`${path}.${key}`:key,choice=normClause(stack,next);
  if(choice.value&&typeof choice.value==='object'&&!Array.isArray(choice.value)){
   target[key]={};mergeClauses(stack,target[key],next);
  }else if(choice.value!==undefined)target[key]=choice.value;
 }
}

export function normCode(stack){
 const first=stack[0]?.code;if(!first)return null;
 const result={...first};
 // Authority and coverage remain facts of the selected court. They must not be
 // inherited from a sovereign template that has no local executor.
 for(const key of ['penalties','civil','authorization','stances','recognition']){const value={};mergeClauses(stack,value,key);if(Object.keys(value).length)result[key]=value;}
 for(const key of ['evidenceRequired','reportMinutes','searchMinutes','hearingMinutes','communityMinutesPerCopper','prisonMinutesPerCopper','maximumSentenceMinutes','appeal','procedure','procedureCosts']){
  const choice=normClause(stack,key);if(choice.value!==undefined)result[key]=choice.value;
 }
 return result;
}

// The own `civil` property of normCode(stack) as [value], or null when absent:
// the merge of each top-level field is independent of the others.
export function normCivil(stack){
 const first=stack[0]?.code;if(!first)return null;
 const value={};mergeClauses(stack,value,'civil');
 return Object.keys(value).length?[value]:Object.hasOwn(first,'civil')?[first.civil]:null;
}

export function normSnapshot(stack,offense){
 const choice=normClause(stack,`penalties.${offense}`);
 return {format:1,offense,penalty:choice.value??null,source:choice.source,version:choice.version,
  entries:stack.map(({layer,source,version,effectiveFrom})=>({layer,source,version,effectiveFrom}))};
}

export function casePenalty(snapshot,current,value=0){
 if(!snapshot)return current;
 const old=snapshot.penalty;
 if(!old)return null;
 if(!current)return clone(old);
 // Compare complete sanctions, rather than fabricating a third rule by mixing
 // fields from different editions. Missing fields do not supply punishment.
 const fine=p=>p.baseFine+Math.ceil(value*p.valueMultiplier);
 const lighter=fine(current)<fine(old)||fine(current)===fine(old)&&(current.detentionMinutes??Infinity)<(old.detentionMinutes??Infinity);
 return clone(lighter?current:old);
}
