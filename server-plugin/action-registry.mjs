// A1 动作注册表（06 §6.4，L1 数据）：读 world/actions/*.json 的数据声明动作，按 id（带命名空间，core 可省略）查找，
// 把 world_act {action, slots} 翻译成它所别名的旧公开工具调用（engine 照旧经 resolveToolCall 执行，结算不变）。
// 不 import 接口层（extension/tools.mjs）：call 映射本身就是数据，由 tests/action-registry.test.mjs 对照工具定义校验。
// source=s0 mirrors static legacy aliases; source=catalog declares slots for
// operations reachable through world_act without expanding the static tools.
// Both dispatch to the existing engine handlers and retain their checks.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {appendActionPatches} from './primitive-policy.mjs';
import {schemaValidator} from './primitive-schema.mjs';

const DIR=fileURLToPath(new URL('../world/actions/',import.meta.url));
const ID=/^[a-z][a-z0-9_-]*:[a-z][a-z0-9_.-]*$/;
export const VISIBILITY=['quick','here','target:npc','target:place','target:item','search','llm'];
let cached=null;

// Every *.json file directly under world/actions/ declares one namespace (core.json = core; a content pack adds its own file).
export function loadActionRegistry(dir=DIR){
 if(dir===DIR&&cached)return cached;
 const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort(),actions=[],patches=[],namespaces=new Set(),errors=[];
 for(const file of files){
  const doc=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
  if(doc.format!==1||typeof doc.namespace!=='string'||!Array.isArray(doc.actions)){errors.push(`${file}：缺 format/namespace/actions`);continue;}
  if(namespaces.has(doc.namespace))errors.push(`${file}：命名空间 ${doc.namespace} 重复`);
  namespaces.add(doc.namespace);
  for(const patch of doc.patches??[]){
   if(!patch.id?.startsWith(`${doc.namespace}:`)||typeof patch.target!=='string')errors.push(`${file}: action patch needs a namespaced id and target`);
   else patches.push(patch);
  }
  for(const a of doc.actions){
   const valid=schemaValidator('definition');
   if(!valid(a))errors.push(`${a.id??file}: action schema ${valid.errors[0].instancePath} ${valid.errors[0].message}`);
   if(!ID.test(a.id??'')||!a.id.startsWith(`${doc.namespace}:`))errors.push(`${file}：动作 id 须带本文件命名空间：${a.id}`);
   if(!VISIBILITY.includes(a.visibility?.catalog))errors.push(`${a.id}：可见性无效`);
   if(!a.call&&!a.projection&&!a.outcomes)errors.push(`${a.id}：既无 call、outcomes 也无 projection`);
   if(typeof a.label!=='string'||!a.label||typeof a.narration!=='string'||!Array.isArray(a.slots)||!Array.isArray(a.synonyms))errors.push(`${a.id}：缺标签、模板键、槽位或同义词`);
   actions.push({...a,namespace:doc.namespace});
  }
 }
 const byId=new Map();
 for(const a of actions){if(byId.has(a.id))errors.push(`动作 id 重复：${a.id}`);byId.set(a.id,a);}
 for(const patch of patches){
  const action=findAction({byId},patch.target);
  if(!action){errors.push(`${patch.id}: unknown action patch target`);continue;}
  try{const updated=appendActionPatches(action,[patch]);byId.set(action.id,updated);actions[actions.findIndex(a=>a.id===action.id)]=updated;}catch(error){errors.push(`${patch.id}: ${error.code??'E-PATCH'} ${error.message}`);}
 }
 const registry={actions,byId,namespaces:[...namespaces],errors};
 if(dir===DIR)cached=registry;
 return registry;
}
// 'trade.buy' and 'core:trade.buy' name the same core action; other namespaces must be written out.
export function findAction(registry,id){
 if(typeof id!=='string'||!id)return null;
 return registry.byId.get(id)??(id.includes(':')?null:registry.byId.get(`core:${id}`))??null;
}
export const CONSENT_PENDING='需要对方答应（对话功能完成后开放）';
// Is the party whose consent the action needs the player? `consent.from`: 'self' (the player is always the one acted on,
// e.g. seeking care), 'party' (the person named in slot `consent.slot` is, and it is the player when that slot says so);
// any other source ('target', a slot name) is somebody else's decision.
export function consentIsOwn(action,slots={}){
 const rule=action?.consent;
 if(!rule)return false;
 if(rule.from==='self')return true;
 if(rule.from==='party')return slots?.[rule.slot]==='player';
 return false;
}
// world_act → the legacy public tool call it aliases. Slot names are the legacy parameter names;
// a template's fixed parameters win over slots of the same name.
export function actionCall(registry,id,slots={}){
 if(registry.errors?.length)throw Error(registry.errors.join('; '));
 const action=findAction(registry,id);
 if(!action)throw Error(`没有这个动作：${String(id).slice(0,80)}；先用 world_actions 查此处可做之事`);
 if(slots===null||typeof slots!=='object'||Array.isArray(slots))throw Error('slots 须是对象');
 if(action.projection)return {action,projection:action.projection};
 if(action.outcomes){
  const allowed=new Set(action.slots.map(slot=>slot.name));
  if(Object.keys(slots).some(key=>!allowed.has(key)))throw Error('Invalid primitive action slots');
  for(const slot of action.slots)if(slot.required&&!Object.hasOwn(slots,slot.name))throw Error(`Missing slot: ${slot.name}`);
  return {action,tool:'world_act',args:{action:action.id,slots},readOnly:false};
 }
 // Consent comes from the party the action acts on (05 §5.7, 06 §6.5), never from the caller on someone else's behalf.
 // An action that declares the player as that party takes it from the player (or derives it from the act itself);
 // for anyone else a caller-filled consent is refused, and until A2's NPC decision exists the legacy path's own judgement
 // (e.g. an innkeeper on trade duty) is all that applies.
 const own=consentIsOwn(action,slots);
 if('consent' in slots&&(!own||typeof slots.consent!=='boolean'))throw Error(own?'同意只能填是或否':CONSENT_PENDING);
 const allowed=new Set(action.slots.map(s=>s.name)),extra=Object.keys(slots).filter(k=>!allowed.has(k)&&k!=='operation');
 if(extra.length)throw Error(`${action.label}没有这些槽位：${extra.join('、')}；可填：${[...allowed].join('、')||'无'}`);
 const missing=action.slots.filter(s=>s.required&&s.consent!==true&&slots[s.name]===undefined&&action.call.fixed?.[s.name]===undefined).map(s=>s.name);
 if(missing.length)throw Error(`${action.label}还缺：${missing.join('、')}`);
 // A tool with a free-form operation (world_learn, world_research) takes it as a slot; a fixed sub-operation always wins.
 const args={...slots,...action.call.fixed??{}};
 if(action.call.operation)args.operation=action.call.operation;
 if(own&&action.consent.derive===true&&!('consent' in slots))args.consent=true;
 return {action,tool:action.call.tool,args,readOnly:Boolean(action.readOnly)};
}
// Reverse: which registered action a stored legacy call was. A template whose fixed parameters all match wins over its base.
// A call without operation on a tool whose default operation shares its name (world_trade → trade) is that operation.
export function actionOfCall(registry,tool,args={}){
 let best=null,score=-1;
 const operation=args.operation??(registry.actions.some(a=>a.call?.tool===tool&&!a.call.operation)?null:String(tool).replace(/^world_/,''));
 for(const a of registry.actions){
  if(!a.call||a.call.tool!==tool||(a.call.operation??null)!==operation)continue;
  const fixed=Object.entries(a.call.fixed??{});
  if(fixed.some(([k,v])=>args[k]!==v))continue;
  if(fixed.length>score){best=a;score=fixed.length;}
 }
 return best;
}
// Compact catalog rows for world_actions and /actions: id, label, group, slots, hint. No handler internals.
export function catalogRow(action){
 return {id:action.id,label:action.label,group:action.group,...(action.readOnly?{readOnly:true}:{}),
  slots:action.slots.map(s=>({name:s.name,kind:s.kind,...(s.entity?{entity:s.entity}:{}),...(s.required?{required:true}:{}),...(s.options&&Array.isArray(s.options)?{options:s.options}:{})})),
  ...(action.hint?{hint:action.hint}:{}),...(action.consent?{consent:action.consent.from}:{})};
}
// Search by id, label, synonyms, verb and group (substring both ways; Chinese has no word boundaries).
export function searchActions(registry,query,{limit=12,include=['quick','here','target:npc','target:place','target:item','search','llm']}={}){
 const q=String(query??'').trim().toLowerCase();if(!q)return [];
 const scored=[];
 for(const a of registry.actions){
  if(!include.includes(a.visibility.catalog))continue;
  const fields=[a.id.toLowerCase(),a.label,a.verb,a.group,...a.synonyms,a.hint??''];
  let s=0;
  for(const f of fields){if(!f)continue;const v=String(f).toLowerCase();if(v===q)s+=10;else if(v.includes(q))s+=4;else if(q.includes(v)&&v.length>=2)s+=3;}
  if(s)scored.push([s+(a.visibility.catalog==='search'||a.visibility.catalog==='llm'?0:1),a]);
 }
 return scored.sort((x,y)=>y[0]-x[0]||x[1].id.localeCompare(y[1].id)).slice(0,limit).map(([,a])=>a);
}
