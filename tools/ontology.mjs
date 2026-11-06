// S0 词汇表（L1）：加载 world/ontology/*.json（与可选的内容包 vocabulary/*.json），按 schemas/ontology.schema.json 校验，
// 检查跨表引用，并报告代码里出现但未登记的动词/标签/罪名（I18 词汇封闭的度量）。本阶段只建表与校验，不接入引擎。
// 用法：node tools/ontology.mjs [--pack <包目录>]... [--json]
// 命名空间：每个文件声明 namespace（核心为 core）。条目 id 可省略前缀，完整键为 <namespace>:<id>；
// 只有前缀是已声明的命名空间时才视为限定名（标签族如 offense:、org: 不是命名空间），因此包名不得与标签族同名。
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import {ELEMENTS,CREATURE_TAGS,FLAMMABLE} from '../server-plugin/traits.mjs';
import {validateHoldingKinds} from '../server-plugin/holding-kinds.mjs';
// K1 性状词（元素、生物身体标签、可燃材质）作为 trait 族标签并入词汇表，不在 tags.json 重复。
export const TRAIT_TAGS=new Set([...ELEMENTS,...CREATURE_TAGS,...FLAMMABLE]);

const ROOT=path.resolve(import.meta.dirname,'..');
const rel=p=>path.relative(ROOT,p).split(path.sep).join('/');
export const CORE='core';
export const KINDS=['verbs','tags','offenses','holdings','obligations','resources','entity-templates','primitives','derived-fields','calendars','fixtures'];
let validator;
function validate(){
 if(!validator)validator=new Ajv({allErrors:true,strict:false}).compile(JSON.parse(fs.readFileSync(path.join(ROOT,'schemas/ontology.schema.json'),'utf8')));
 return validator;
}
const jsonFiles=dir=>fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort().map(f=>path.join(dir,f)):[];
// A pack directory may hold its vocabulary in <pack>/vocabulary/ or directly at the top level.
export function packVocabularyFiles(packDir){
 // 12 §12.2.1 把种类目录放在 <包>/ontology/；词汇条目放在 <包>/vocabulary/（本格式按种类分文件）。
 return [...jsonFiles(path.join(packDir,'ontology')),...jsonFiles(path.join(packDir,'vocabulary')),...jsonFiles(packDir)].filter(f=>{try{const j=JSON.parse(fs.readFileSync(f,'utf8'));return KINDS.includes(j.kind);}catch{return false;}});
}

export function qualify(id,namespace,namespaces){
 const i=id.indexOf(':');
 if(i>0&&namespaces.has(id.slice(0,i)))return id;
 return `${namespace}:${id}`;
}

// Returns {errors:[{file,field,message}], namespaces, entries:{kind:Map(qualifiedId→entry)}, files, has(kind,id), resolve(kind,id)}.
export function loadOntology({dir=path.join(ROOT,'world/ontology'),packs=[]}={}){
 const errors=[],docs=[];
 const files=[...jsonFiles(dir),...packs.flatMap(p=>packVocabularyFiles(path.resolve(ROOT,p)))];
 for(const file of files){
  let doc;try{doc=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){errors.push({file:rel(file),field:'',message:`JSON 解析失败：${e.message}`});continue;}
  const ok=validate()(doc);
  if(!ok)for(const e of validate().errors.filter(e=>e.keyword!=='if'))errors.push({file:rel(file),field:e.instancePath||'/',code:'E-VOCAB-SCHEMA',message:`${e.message}${e.params?.allowedValues?`（可选：${e.params.allowedValues.join('、')}）`:''}${e.params?.additionalProperty?`：${e.params.additionalProperty}`:''}`});
  docs.push({file:rel(file),doc,ok});
 }
 const namespaces=new Set(docs.filter(d=>d.ok).map(d=>d.doc.namespace));
 const entries=Object.fromEntries(KINDS.map(k=>[k,new Map()]));
 const extra={handoverClasses:new Set(),subjectTemplates:new Set(),triggers:new Set(),reasons:new Set(),sourcesAndSinks:new Set()};
 for(const {file,doc,ok}of docs){if(!ok)continue;
  doc.entries.forEach((entry,i)=>{
   const prefix=entry.id.includes(':')?entry.id.slice(0,entry.id.indexOf(':')):null;
   if(prefix&&namespaces.has(prefix)&&prefix!==doc.namespace)errors.push({file,field:`/entries/${i}/id`,message:`限定名前缀 ${prefix} 与文件命名空间 ${doc.namespace} 不一致`});
   const key=qualify(entry.id,doc.namespace,namespaces);
   if(entries[doc.kind].has(key))errors.push({file,field:`/entries/${i}/id`,message:`重复的${doc.kind}条目 ${key}（已在 ${entries[doc.kind].get(key).file}）`});
   else entries[doc.kind].set(key,{...entry,key,namespace:doc.namespace,file});
  });
  for(const k of Object.keys(extra))for(const x of doc[k]??[])extra[k].add(typeof x==='string'?x:x.id);
 }
 // Tag families and namespaces must not collide, otherwise `family:value` would be read as a qualified id.
 const families=new Set([...entries.tags.values()].map(t=>t.family));
 for(const ns of namespaces)if(ns!==CORE&&families.has(ns))errors.push({file:docs.find(d=>d.doc?.namespace===ns)?.file??'',field:'/namespace',message:`命名空间 ${ns} 与标签族同名`});
 const has=(kind,id,ns=CORE)=>{
  const map=entries[kind];if(map.has(qualify(id,ns,namespaces)))return true;
  if(kind==='tags'&&TRAIT_TAGS.has(id))return true;
  if(kind==='tags'){const i=id.indexOf(':');if(i>0){const fam=id.slice(0,i);return [...map.values()].some(t=>t.pattern&&t.id===`${fam}:*`)||(fam==='offense'&&has('offenses',id.slice(i+1),ns));}}
  if(kind==='resources'&&id.startsWith('item_'))return map.has(`${CORE}:item:*`);
  return false;
 };
 // Cross references.
 const templates=new Set([...entries['entity-templates'].values()].map(t=>t.id));
 // S2a：持有种类的注册形状与交叉引用（I5）由 L1 注册表的同一校验函数检查。
 const holdingList=[...entries.holdings.values()];
 for(const e of validateHoldingKinds(holdingList,{templates})){const h=holdingList.find(x=>x.id===e.kind);errors.push({file:h?.file??'',field:`/entries[id=${e.kind}]/${e.field}`,code:'E-HOLDING-SHAPE',message:e.message});}
 for(const h of holdingList)for(const [trigger,cls]of Object.entries(h.handover??{}))if(cls!==null&&!extra.handoverClasses.has(cls))errors.push({file:h.file,field:`/entries[id=${h.id}]/handover/${trigger}`,message:`未知交接类 ${cls}`});
 for(const h of holdingList)if(!extra.subjectTemplates.has(h.onSubjectGone))errors.push({file:h.file,field:`/entries[id=${h.id}]/onSubjectGone`,message:`未知标的侧模板 ${h.onSubjectGone}`});
 for(const p of entries.primitives.values())if(!has('verbs',p.event,p.namespace))errors.push({file:p.file,field:`/entries[id=${p.id}]/event`,message:`原语事件 ${p.event} 不在动词表`});
 // 12 §12.3.3：上位词（包词必填，须可解析）、共享/私有区、同义词闸门。
 for(const kind of KINDS)for(const e of entries[kind].values()){
  const field=`/entries[id=${e.id}]`;
  if(e.namespace!==CORE&&!e.broader)errors.push({file:e.file,field:`${field}/broader`,code:'E-VOCAB-BROADER',message:'包词汇必须填写上位词'});
  if(e.broader){const b=kind==='offenses'?e.broader.replace(/^offense:/,''):e.broader;
   if(b!==e.id&&!has(kind,b,e.namespace)&&!has(kind,b,CORE)&&!(kind==='tags'&&b.endsWith(':*')&&entries.tags.has(`${CORE}:${b}`)))errors.push({file:e.file,field:`${field}/broader`,code:'E-VOCAB-BROADER',message:`上位词 ${e.broader} 未登记`});}
  if(kind!=='derived-fields'&&e.namespace===CORE&&e.scope&&e.scope!=='core')errors.push({file:e.file,field:`${field}/scope`,code:'E-VOCAB-NS',message:'core 词汇的 scope 只能是 core'});
  if(kind!=='derived-fields'&&e.namespace!==CORE&&e.scope==='shared'&&e.id.startsWith(`${e.namespace}:`))errors.push({file:e.file,field:`${field}/scope`,code:'E-VOCAB-NS',message:'共享词不带命名空间前缀'});
 }
 for(const kind of KINDS){
  const names=new Map();
  for(const e of entries[kind].values())for(const name of[e.label,...(e.aliases??[])].filter(Boolean)){
   const prev=names.get(name);
   if(prev&&prev.key!==e.key&&(prev.namespace!==CORE||e.namespace!==CORE))errors.push({file:e.file,field:`/entries[id=${e.id}]/label`,code:'E-VOCAB-SYN',message:`“${name}”已是 ${prev.key} 的名称或别名；请直接用该词，或改用不同的名称并在 distinctFrom 写明区别`});
   else if(!prev)names.set(name,e);
  }
 }
 return {errors,namespaces,entries,files:docs.map(d=>d.file),extra,has,
  resolve:(kind,id,ns=CORE)=>entries[kind].get(qualify(id,ns,namespaces))??null};
}

// I18 closure: vocabulary that code already uses but the tables do not register.
export async function closureReport(ontology,{dirs=['server-plugin','extension']}={}){
 const text=dirs.flatMap(d=>fs.readdirSync(path.join(ROOT,d)).filter(f=>/\.m?js$/.test(f)).map(f=>({file:`${d}/${f}`,src:fs.readFileSync(path.join(ROOT,d,f),'utf8')})));
 const verbs=new Set(),tags=new Set(),offenses=new Set();
 const {SOCIAL_VERBS}=await import('../server-plugin/world-events.mjs');
 for(const v of SOCIAL_VERBS)verbs.add(v);
 for(const {src}of text){
  for(const m of src.matchAll(/\bverb\s*:\s*'(\w+)'/g))verbs.add(m[1]);
  for(const m of src.matchAll(/\btags\s*:\s*\[([^\]]*)\]/g)){for(const s of m[1].matchAll(/'([^'$]+)'/g))tags.add(s[1]);for(const s of m[1].matchAll(/`([a-z_]+):\$\{/g))tags.add(`${s[1]}:*`);}
  for(const m of src.matchAll(/\boffense\s*[:=]\s*['`]([a-z_]+)['`]/g))offenses.add(m[1]);
 }
 const rules=JSON.parse(fs.readFileSync(path.join(ROOT,'world/meta/rules.json'),'utf8'));
 for(const t of Object.values(rules.law?.templates??{}))for(const k of Object.keys(t.penalties??{}))offenses.add(k);
 const unknown={
  verbs:[...verbs].filter(v=>!ontology.has('verbs',v)).sort(),
  tags:[...tags].filter(t=>!ontology.has('tags',t)).sort(),
  offenses:[...offenses].filter(o=>!ontology.has('offenses',o)).sort(),
 };
 return {used:{verbs:verbs.size,tags:tags.size,offenses:offenses.size},unknown,unknownCount:unknown.verbs.length+unknown.tags.length+unknown.offenses.length};
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const args=process.argv.slice(2),packs=[];
 for(let i=0;i<args.length;i++)if(args[i]==='--pack')packs.push(args[++i]);
 const o=loadOntology({packs});
 const closure=await closureReport(o);
 const counts=Object.fromEntries(KINDS.map(k=>[k,o.entries[k].size]));
 const report={metric:'ontology',namespaces:[...o.namespaces],files:o.files.length,counts,schemaErrors:o.errors.length,errors:o.errors,closure};
 if(args.includes('--json'))console.log(JSON.stringify(report,null,1));
 else{
  console.log(`ontology: ${o.files.length} 个文件，命名空间 ${[...o.namespaces].join(',')}；`+KINDS.map(k=>`${k} ${counts[k]}`).join('，'));
  console.log(`ontology: 校验错误 ${o.errors.length}；代码用到未登记词汇 ${closure.unknownCount}（动词 ${closure.unknown.verbs.length}、标签 ${closure.unknown.tags.length}、罪名 ${closure.unknown.offenses.length}）`);
  for(const e of o.errors)console.log(`  ${e.file} ${e.field}: ${e.message}`);
  for(const [k,list]of Object.entries(closure.unknown))if(list.length)console.log(`  未登记${k}: ${list.join(' ')}`);
 }
 if(o.errors.length)process.exitCode=1;
}
