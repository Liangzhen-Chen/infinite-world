// A1 动作注册表同步（06 §6.4）：world/actions/core.json 是数据声明的注册表（作者可手改标签、槽位、前置、可见性、模板键）。
// 本工具只做同步：docs/actions.json（S0 导出）里每个动作在注册表里有且只有一条 source=s0 的条目，call 与公开工具/子操作一致；
// 新出现的动作按缺省值补入，已消失的删除，手写字段保留。用法：node tools/build-action-registry.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import {memberDefinitions,toolDefinitions} from '../extension/tools.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
export const REGISTRY='world/actions/core.json';
const SOURCE='docs/actions.json';
const PERSON=['seller','buyer','target','npc','member','speaker','promisor','promisee','student','teacher','authority','publisher','taker','steward','sponsor','reporter','claimant','maker','opponent','subject','supplier','escort'];
const GROUP_BY_TOOL={world_move:'移动',world_time:'等待',world_craft:'制作',world_read:'账目',world_search:'记录',world_catalog:'记录',world_remember:'记录',world_relation:'记录',world_create:'记录',world_check:'检定',
 world_cast:'法术',world_learn:'成长',world_practice:'成长',world_profession:'成长',world_attributes:'成长',world_research:'成长',world_combat:'战斗',world_quest:'委托',world_promise:'约定',world_revival:'信仰',world_companion:'伙伴',world_law:'法律',world_trade:'经营',world_settlement:'经营',world_field:'野外'};
const READ_ONLY=/(^|_)inspect(_|$)|^observe$|^search$|^catalog$|^read$|contribution$|_queue$/;

export function slotKind(name,schema){
 if(schema?.enum)return {kind:'choice',options:[...schema.enum]};
 if(PERSON.includes(name))return {kind:'entity',entity:'person'};
 if(['destination','location','settlement'].includes(name))return {kind:'entity',entity:'place'};
 if(['item','instance'].includes(name))return {kind:'entity',entity:'item'};
 if(['recipe','spell','skill','org'].includes(name))return {kind:'entity',entity:name};
 if(['coins','cost','deposit'].includes(name))return {kind:'coins'};
 if(name==='minutes')return {kind:'minutes'};
 if(schema?.type==='integer')return {kind:'quantity'};
 if(schema?.type==='boolean')return {kind:'flag'};
 if(schema?.type==='array'||schema?.type==='object')return {kind:'object'};
 return {kind:'text'};
}
const schemas=()=>new Map([...memberDefinitions(),...toolDefinitions()].map(d=>[d.function.name,d.function.parameters]));
// A new S0 action: label = its verb until an author names it; only reachable by search.
export function defaultEntry(action,schemaMap=schemas()){
 const schema=schemaMap.get(action.internalTool)??schemaMap.get(action.tool),required=new Set(action.required),verb=action.id.slice(action.id.indexOf(':')+1);
 const readOnly=action.readOnly||READ_ONLY.test(action.internalOperation??verb);
 return {id:action.id,call:{tool:action.tool,...(action.operation?{operation:action.operation}:{})},label:verb,verb,group:GROUP_BY_TOOL[action.tool]??'其他',pack:action.pack,readOnly,
  participants:{actor:'player',...(action.participants.length>1?{others:action.participants.slice(1)}:{})},
  slots:Object.entries(schema.properties).filter(([k])=>k!=='operation').map(([name,s])=>({name,...slotKind(name,s),...(required.has(name)?{required:true}:{})})),
  preconditions:[],cost:{time:'engine'},check:null,visibility:{catalog:'search',witness:readOnly?'private':'present'},synonyms:[],narration:verb,source:'s0'};
}
// One action per line keeps author diffs readable in a 250-entry file.
export function render(doc){
 const {actions,...head}=doc,lines=JSON.stringify(head,null,1).replace(/\n}$/,'');
 return `${lines},\n "actions": [\n${actions.map(a=>`  ${JSON.stringify(a)}`).join(',\n')}\n ]\n}\n`;
}
export function syncRegistry(doc,catalog){
 const byId=new Map(catalog.map(a=>[a.id,a])),schemaMap=schemas(),seen=new Set(),out=[],changes=[];
 for(const entry of doc.actions){
  if(entry.source!=='s0'){out.push(entry);continue;}
  const action=byId.get(entry.id);
  if(!action){changes.push(`删除 ${entry.id}`);continue;}
  seen.add(entry.id);
  const call={tool:action.tool,...(action.operation?{operation:action.operation}:{})};
  if(JSON.stringify(entry.call)!==JSON.stringify(call)){changes.push(`改 call ${entry.id}`);out.push({...entry,call});}else out.push(entry);
 }
 for(const action of catalog)if(!seen.has(action.id)){changes.push(`新增 ${action.id}`);out.push(defaultEntry(action,schemaMap));}
 return {doc:{...doc,actions:out},changes};
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const file=path.join(ROOT,REGISTRY),doc=JSON.parse(fs.readFileSync(file,'utf8')),catalog=JSON.parse(fs.readFileSync(path.join(ROOT,SOURCE),'utf8')).actions;
 const {doc:next,changes}=syncRegistry(doc,catalog),text=render(next);
 const same=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')===text;
 if(process.argv.includes('--check')){
  console.log(`action-registry: ${next.actions.length} 个注册动作（s0 ${next.actions.filter(a=>a.source==='s0').length}，模板 ${next.actions.filter(a=>a.source!=='s0').length}）；${same?'已与 docs/actions.json 同步':`过期：${changes.join('；')||'格式'}，请运行 node tools/build-action-registry.mjs`}`);
  if(!same)process.exitCode=1;
 }else{fs.writeFileSync(file,text);console.log(`action-registry: ${next.actions.length} 个注册动作 → ${REGISTRY}${changes.length?`（${changes.join('；')}）`:''}`);}
}
