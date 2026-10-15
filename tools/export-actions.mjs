// S0 动作清单自动导出（06 §6.4 第一步）：从 extension/tools.mjs 的公开工具、operation 枚举与 resolveToolCall 映射，
// 加上引擎处理器位置，生成 docs/actions.json。每个动作：id（命名空间 core:，可省略）、公开工具/子操作、内部工具/子操作、
// 参与者、主要参数、二级枚举、处理器位置（文件:行）。tests/actions.test.mjs 断言清单与 resolveToolCall 一致且为最新。
// 用法：node tools/export-actions.mjs [--check] [--json]
import fs from 'node:fs';
import path from 'node:path';
import {toolDefinitions,resolveToolCall,modelToolCall,readOnlyTools} from '../extension/tools.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
export const OUTPUT='docs/actions.json';
export const NAMESPACE='core';
const src=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const lineOf=(text,index)=>text.slice(0,index).split('\n').length;
// Parameters that name an acting or affected agent (participants); the rest are objects, amounts and options.
const AGENT_PARAMS=['target','seller','buyer','npc','member','speaker','promisor','promisee','student','teacher','authority','publisher','taker','steward','sponsor','reporter','claimant','from','to','maker','helpers','workers','beneficiaries','escort','opponent','subject','actor','supplier','guests','knowers'];
const VARIANT_PARAMS=['task','action','choice','intent','term','pact','channel','kind','type','phase','payment','mode','activity','service','opinion','facilityType'];
const SERVER=fs.readdirSync(path.join(ROOT,'server-plugin')).filter(f=>f.endsWith('.mjs')).map(f=>`server-plugin/${f}`);

function methodLocation(internal){
 const name=internal.replace(/^world_/,'');
 for(const file of['server-plugin/activities.mjs','server-plugin/engine.mjs']){
  const text=src(file),m=new RegExp(`^ {4}(?:async\\s+)?${name}\\s*\\(d`,'m').exec(text);
  if(m)return{file,line:lineOf(text,m.index),symbol:file.endsWith('activities.mjs')?`activities.${name}`:`WorldEngine.${name}`};
 }
 return null;
}
function readOnlyLocation(name){
 const file='extension/runtime.js',text=src(file),i=text.indexOf(`name==='${name}'`);
 return i<0?null:{file,line:lineOf(text,i),symbol:`runtime ${name}`};
}
// Where the operation is dispatched: first literal comparison/case/map key for the operation name.
function operationLocation(op,prefer){
 const patterns=[new RegExp(`operation\\s*===?\\s*['"]${op}['"]`),new RegExp(`case\\s*['"]${op}['"]`),new RegExp(`[\\w.\\])]\\s*===\\s*['"]${op}['"]`),new RegExp(`(?:^|[{,\\s])['"]?${op}['"]?\\s*:\\s*(?:\\(|async|function|[A-Za-z_$][\\w$]*\\s*[,}])`,'m'),new RegExp(`\\[[^\\]]*['"]${op}['"][^\\]]*\\]\\s*\\)?\\.(?:includes|has)\\(`),new RegExp(`new Set\\(\\[[^\\]]*['"]${op}['"]`)];
 const files=[...new Set([prefer,...SERVER].filter(Boolean))];
 for(const re of patterns)for(const file of files){const text=src(file),m=re.exec(text);if(m)return{file,line:lineOf(text,m.index),match:'literal'};}
 return null;
}
function requiredFor(tool,op){
 try{resolveToolCall(tool,{operation:op});return [];}
 catch(e){const m=/缺少参数：(.+)$/.exec(e.message);return m?m[1].split('、'):[];}
}

export function exportActions(){
 const actions=[];
 for(const def of toolDefinitions()){
  const tool=def.function.name,schema=def.function.parameters,props=schema.properties,ops=props.operation?.enum??null;
  const variants=Object.fromEntries(VARIANT_PARAMS.filter(k=>props[k]?.enum).map(k=>[k,[...props[k].enum]]));
  const participants=['player',...AGENT_PARAMS.filter(k=>props[k])];
  const base={readOnly:readOnlyTools.has(tool)};
  if(!ops){
   const loc=readOnlyTools.has(tool)?readOnlyLocation(tool):methodLocation(tool);
   actions.push({id:`${NAMESPACE}:${tool.slice(6)}`,tool,operation:null,internalTool:tool,internalOperation:null,...base,
    participants,params:Object.keys(props).filter(k=>k!=='operation'),required:schema.required??[],variants,
    operationParam:props.operation?'free':null,handler:loc?{...loc}:null});
   continue;
  }
  for(const op of ops){
   const resolved=resolveToolCall(tool,{operation:op,...Object.fromEntries(requiredFor(tool,op).map(k=>[k,'x']))});
   const internalTool=resolved.tool,internalOperation=resolved.args.operation;
   const method=methodLocation(internalTool);
   const dispatch=operationLocation(internalOperation,method?.file);
   actions.push({id:`${NAMESPACE}:${internalTool.slice(6)}.${internalOperation}`,tool,operation:op,internalTool,internalOperation,...base,
    participants,params:Object.keys(props).filter(k=>k!=='operation'),required:[...new Set([...(schema.required??[]).filter(k=>k!=='operation'),...requiredFor(tool,op)])],variants,
    handler:method?{...method,...(dispatch?{dispatch:`${dispatch.file}:${dispatch.line}`}:{})}:null});
  }
 }
 return actions;
}
export function render(actions){
 const tools=[...new Set(actions.map(a=>a.tool))];
 return JSON.stringify({title:'动作清单（S0 自动导出）',generatedBy:'node tools/export-actions.mjs',namespace:NAMESPACE,
  note:'从 extension/tools.mjs 枚举与 resolveToolCall 导出；id = core:<内部工具>.<内部操作>（核心命名空间可省略）。participants 为可指代参与者的参数（player 恒为发起者）；params 为该公开工具的参数（分组工具为组内并集）；handler.dispatch 为子操作分派的首个字面量位置（近似）。前置、同意、可见性、叙述模板由 A1 起逐包补齐。',
  counts:{actions:actions.length,tools:tools.length,withOperation:actions.filter(a=>a.operation).length,handlerResolved:actions.filter(a=>a.handler).length,dispatchResolved:actions.filter(a=>a.handler?.dispatch).length},
  actions},null,1)+'\n';
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const actions=exportActions(),text=render(actions),out=path.join(ROOT,OUTPUT);
 if(process.argv.includes('--check')){
  const same=fs.existsSync(out)&&fs.readFileSync(out,'utf8')===text;
  console.log(`actions: ${actions.length} 个动作；docs/actions.json ${same?'已是最新':'过期，请运行 node tools/export-actions.mjs'}`);
  if(!same)process.exitCode=1;
 }else{
  fs.writeFileSync(out,text);
  const c=JSON.parse(text).counts;
  console.log(`actions: ${c.actions} 个动作（${c.tools} 个公开工具，带子操作 ${c.withOperation}）；处理器定位 ${c.handlerResolved}，子操作分派定位 ${c.dispatchResolved} → ${OUTPUT}`);
 }
 // Round trip check printed for the record.
 const bad=actions.filter(a=>a.operation&&modelToolCall(a.internalTool,{operation:a.internalOperation}).tool!==a.tool);
 if(bad.length)console.log(`actions: ${bad.length} 个动作 modelToolCall 不能回到公开工具：${bad.map(a=>a.id).join(' ')}`);
}
