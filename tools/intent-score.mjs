// S0 意图语料评分骨架（06 §6.11，T0 桩翻译器）：校验 tests/intents/*.json 语料（动作 id、原语、实体模板、标签、反应系统），
// 用桩翻译器（直接回显语料期望，不做翻译）跑出路由准确率与签名匹配率的管线，并按当前引擎能力统计
// “不支持率”（目标 0）与“兜底实体无系统反应率”（目标 0）。A3 起把桩换成构造器/LLM 翻译器。
// 用法：node tools/intent-score.mjs [--file tests/intents/corpus-001.json] [--json]
import fs from 'node:fs';
import path from 'node:path';
import {loadOntology} from './ontology.mjs';
import {PACK_NAMES} from './arch-layers.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
export const HANDLINGS=['registered','open','fallback','infeasible'];
const rel=p=>path.relative(ROOT,p).split(path.sep).join('/');

export function corpusFiles(){const dir=path.join(ROOT,'tests/intents');return fs.readdirSync(dir).filter(f=>/^corpus-.*\.json$/.test(f)).sort().map(f=>path.join(dir,f));}
export function loadCorpus(files=corpusFiles()){
 return files.flatMap(f=>JSON.parse(fs.readFileSync(f,'utf8')).items.map((item,i)=>({...item,file:rel(f),index:i})));
}
export function actionIds(){return new Set(JSON.parse(fs.readFileSync(path.join(ROOT,'docs/actions.json'),'utf8')).actions.map(a=>a.id));}
const qualify=id=>id.includes(':')?id:`core:${id}`;

// Corpus validation; every error names the file and the field.
export function validateCorpus(items,{ontology=loadOntology(),actions=actionIds()}={}){
 const errors=[],seen=new Set();
 const primitives=new Set([...ontology.entries.primitives.values()].map(p=>p.id));
 const templates=new Map([...ontology.entries['entity-templates'].values()].map(t=>[t.id,t]));
 // 兜底原语 create(kind: mark)（06 §6.9.5）：mark 须是某个实体模板登记的种类。
 const markKind=[...templates.values()].some(t=>t.kinds.includes('mark'));
 const err=(item,field,message)=>errors.push({file:item.file,field:`/items/${item.index}${field}`,id:item.id,message});
 for(const item of items){
  const e=item.expect??{};
  if(!/^I\d{3,}$/.test(item.id??''))err(item,'/id','编号须为 I+数字');
  if(seen.has(item.id))err(item,'/id',`重复编号 ${item.id}`);seen.add(item.id);
  if(!item.text?.trim())err(item,'/text','缺少意图文本');
  if(!item.domain)err(item,'/domain','缺少玩法');
  if(!HANDLINGS.includes(e.handling))err(item,'/expect/handling',`处理须为 ${HANDLINGS.join('/')}`);
  const sig=e.signature??[];
  if(e.handling!=='infeasible'&&!sig.length)err(item,'/expect/signature','缺少原语签名');
  sig.forEach((s,j)=>{const [op,tpl,key]=s.split('|');
   if(!primitives.has(op))err(item,`/expect/signature/${j}`,`未知原语 ${op}`);
   if(!templates.has(tpl))err(item,`/expect/signature/${j}`,`未知实体模板 ${tpl}`);
   if(!key)err(item,`/expect/signature/${j}`,'缺少字段或资源键');
   if(key?.startsWith('offense:'))err(item,`/expect/signature/${j}`,'罪名不进签名（由规范层判定，05 §5.2.3），写在 expect.offense');
  });
  if(e.handling==='registered'&&!actions.has(qualify(e.route??'')))err(item,'/expect/route',`动作清单中没有 ${e.route}`);
  if(e.handling!=='registered'&&e.route!==e.handling)err(item,'/expect/route',`非注册动作的 route 应为 ${e.handling}`);
  if(e.nearest&&!actions.has(qualify(e.nearest)))err(item,'/expect/nearest',`动作清单中没有 ${e.nearest}`);
  if(e.handling==='fallback'){
   const f=e.fallback??{};
   if(f.kind!=='mark'||!markKind)err(item,'/expect/fallback/kind','兜底实体须为 create(kind: mark)');
   if(!f.form)err(item,'/expect/fallback/form','兜底实体须写形态');
   if(!(f.tags??[]).some(t=>t.startsWith('mark:')))err(item,'/expect/fallback/tags','兜底实体须带至少一个 mark:* 标签');
   if(!f.tags?.length)err(item,'/expect/fallback/tags','兜底实体须带标签');
   for(const t of f.tags??[])if(!ontology.has('tags',t))err(item,'/expect/fallback/tags',`未登记标签 ${t}`);
   if(!f.reactors?.length)err(item,'/expect/fallback/reactors','须标出至少一个应起反应的系统');
   for(const r of f.reactors??[])if(!PACK_NAMES.includes(r))err(item,'/expect/fallback/reactors',`未知系统（玩法包）${r}`);
  }
  for(const o of e.offense??[])if(!ontology.has('offenses',o))err(item,'/expect/offense',`未登记罪名 ${o}`);
  if(e.handling==='infeasible'&&(!e.infeasible?.reason||!e.infeasible?.degrade))err(item,'/expect/infeasible','须给世界内原因与降级做法');
 }
 return errors;
}

// T0 stub translator: echoes the corpus expectation (no translation). Its output feeds the same scorer a real translator will.
export function stubTranslate(item){return{handling:item.expect.handling,route:item.expect.route,signature:[...item.expect.signature]};}

// What the current engine can carry out without new primitives: registered actions that exist in the action list.
// world_propose（open）、兜底 create(kind: mark)、世界内不可行的原因/降级协议都要到 A3 才有。
export function currentEngineSupport(item,actions){
 return item.expect.handling==='registered'&&actions.has(qualify(item.expect.route));
}
const sameMultiset=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());

export function score(items,{translate=stubTranslate,actions=actionIds()}={}){
 const n=items.length,out=items.map(item=>({item,proposal:translate(item)}));
 const routed=out.filter(({item,proposal})=>proposal.route===item.expect.route).length;
 const signed=out.filter(({item,proposal})=>sameMultiset(proposal.signature,item.expect.signature)).length;
 const unsupported=items.filter(i=>!currentEngineSupport(i,actions));
 const fallback=items.filter(i=>i.expect.handling==='fallback');
  // A fallback entity “reacts” only if the engine can create marks and some system subscribes to one of its mark:* tags (06 §6.11：7 天内).
 // S0：引擎没有 create(kind: mark) 兜底原语，也没有按标签订阅的反应规则（06 §6.3、A3），兜底实体目前都不会引起系统反应。
 const canCreateTagged=false;
 const noReaction=fallback.filter(()=>!canCreateTagged);
 const annotationGaps=fallback.filter(i=>!i.expect.fallback?.reactors?.length);
 const by=k=>items.reduce((m,i)=>(m[k(i)]=(m[k(i)]??0)+1,m),{});
 return {total:n,creative:items.filter(i=>i.creative).length,creativeShare:n?items.filter(i=>i.creative).length/n:0,
  byHandling:by(i=>i.expect.handling),byDomain:by(i=>i.domain),
  translator:'T0 桩（回显语料期望）',routeAccuracy:n?routed/n:0,signatureMatch:n?signed/n:0,
  unsupportedRate:n?unsupported.length/n:0,unsupported:unsupported.length,
  fallbackNoReactionRate:fallback.length?noReaction.length/fallback.length:0,fallbackNoReaction:noReaction.length,fallback:fallback.length,annotationGaps:annotationGaps.length};
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const args=process.argv.slice(2),i=args.indexOf('--file');
 const items=loadCorpus(i>=0?[path.resolve(ROOT,args[i+1])]:corpusFiles());
 const errors=validateCorpus(items),s=score(items),pct=x=>`${(x*100).toFixed(1)}%`;
 if(args.includes('--json'))console.log(JSON.stringify({metric:'intent-score',...s,errors},null,1));
 else{
  console.log(`intent-score: 语料 ${s.total} 条（刁钻创意 ${s.creative}，${pct(s.creativeShare)}）；${HANDLINGS.map(h=>`${h} ${s.byHandling[h]??0}`).join('，')}；校验错误 ${errors.length}`);
  console.log(`intent-score: ${s.translator} 路由准确率 ${pct(s.routeAccuracy)}，签名匹配率 ${pct(s.signatureMatch)}；当前引擎不支持率 ${pct(s.unsupportedRate)}（${s.unsupported} 条，目标 0）；兜底实体无系统反应率 ${pct(s.fallbackNoReactionRate)}（${s.fallbackNoReaction}/${s.fallback}，目标 0）；语料反应系统标注缺口 ${s.annotationGaps}`);
  for(const e of errors.slice(0,30))console.log(`  ${e.file} ${e.field} [${e.id}]: ${e.message}`);
 }
 if(errors.length)process.exitCode=1;
}
