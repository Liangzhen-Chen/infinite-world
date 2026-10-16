// A1 动作注册表（06 §6.4，L1 数据）：读 world/actions/*.json 的数据声明动作，按 id（带命名空间，core 可省略）查找，
// 把 world_act {action, slots} 翻译成它所别名的旧公开工具调用（engine 照旧经 resolveToolCall 执行，结算不变）。
// 不 import 接口层（extension/tools.mjs）：call 映射本身就是数据，由 tests/action-registry.test.mjs 对照工具定义校验。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const DIR=fileURLToPath(new URL('../world/actions/',import.meta.url));
const ID=/^[a-z][a-z0-9_-]*:[a-z][a-z0-9_.-]*$/;
export const VISIBILITY=['quick','here','target:npc','target:place','target:item','search','llm'];
let cached=null;

// Every *.json file directly under world/actions/ declares one namespace (core.json = core; a content pack adds its own file).
export function loadActionRegistry(dir=DIR){
 if(dir===DIR&&cached)return cached;
 const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort(),actions=[],namespaces=new Set(),errors=[];
 for(const file of files){
  const doc=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
  if(doc.format!==1||typeof doc.namespace!=='string'||!Array.isArray(doc.actions)){errors.push(`${file}：缺 format/namespace/actions`);continue;}
  if(namespaces.has(doc.namespace))errors.push(`${file}：命名空间 ${doc.namespace} 重复`);
  namespaces.add(doc.namespace);
  for(const a of doc.actions){
   if(!ID.test(a.id??'')||!a.id.startsWith(`${doc.namespace}:`))errors.push(`${file}：动作 id 须带本文件命名空间：${a.id}`);
   if(!VISIBILITY.includes(a.visibility?.catalog))errors.push(`${a.id}：可见性无效`);
   if(!a.call&&!a.projection)errors.push(`${a.id}：既无 call 也无 projection`);
   if(typeof a.label!=='string'||!a.label||typeof a.narration!=='string'||!Array.isArray(a.slots)||!Array.isArray(a.synonyms))errors.push(`${a.id}：缺标签、模板键、槽位或同义词`);
   actions.push({...a,namespace:doc.namespace});
  }
 }
 const byId=new Map();
 for(const a of actions){if(byId.has(a.id))errors.push(`动作 id 重复：${a.id}`);byId.set(a.id,a);}
 const registry={actions,byId,namespaces:[...namespaces],errors};
 if(dir===DIR)cached=registry;
 return registry;
}
// 'trade.buy' and 'core:trade.buy' name the same core action; other namespaces must be written out.
export function findAction(registry,id){
 if(typeof id!=='string'||!id)return null;
 return registry.byId.get(id)??(id.includes(':')?null:registry.byId.get(`core:${id}`))??null;
}
// world_act → the legacy public tool call it aliases. Slot names are the legacy parameter names;
// a template's fixed parameters win over slots of the same name.
export function actionCall(registry,id,slots={}){
 const action=findAction(registry,id);
 if(!action)throw Error(`没有这个动作：${String(id).slice(0,80)}；先用 world_actions 查此处可做之事`);
 if(slots===null||typeof slots!=='object'||Array.isArray(slots))throw Error('slots 须是对象');
 if(action.projection)return {action,projection:action.projection};
 const allowed=new Set(action.slots.map(s=>s.name)),extra=Object.keys(slots).filter(k=>!allowed.has(k)&&k!=='operation');
 if(extra.length)throw Error(`${action.label}没有这些槽位：${extra.join('、')}；可填：${[...allowed].join('、')||'无'}`);
 const missing=action.slots.filter(s=>s.required&&s.consent!==true&&slots[s.name]===undefined&&action.call.fixed?.[s.name]===undefined).map(s=>s.name);
 if(missing.length)throw Error(`${action.label}还缺：${missing.join('、')}`);
 // A tool with a free-form operation (world_learn, world_research) takes it as a slot; a fixed sub-operation always wins.
 const args={...slots,...action.call.fixed??{}};
 if(action.call.operation)args.operation=action.call.operation;
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
