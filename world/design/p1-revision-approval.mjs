// Frozen content revision of already-approved rows, NOT loaded by the game.
// Card P1 (亮圳 approved, budget <= 0.02 yuan). Four corrections the A1 audit
// (docs/审查/2026-11-05-已审内容改动盘点.md §三) found could not be expressed as
// a general runtime law, so they go through the approval pipeline instead:
// L1 local world validation, L2 DeepSeek factual review, L4 main-session read,
// then publication edits only the named field of the named row.
// Each entry names the earlier receipt it supersedes; earlier receipts are not
// edited. After publication this batch's review records are the receipt of
// record for these fields.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {defaultReviewRequest,readApprovedContent,runContentPipeline} from '../../tools/content-pipeline.mjs';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';

export const revision='p1-revision-1',root='world/drafts/p1-revision',CARD='P1';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));

// A field path is a list of object keys and {id} selectors into arrays.
const step=(value,part)=>typeof part==='string'?value?.[part]:value?.find?.(r=>r?.id===part.id);
export const getPath=(row,parts)=>parts.reduce(step,row);
export function setPath(row,parts,value){const parent=getPath(row,parts.slice(0,-1));assert.ok(parent&&typeof parts.at(-1)==='string','修订路径无效');parent[parts.at(-1)]=structuredClone(value);}
const pathLabel=parts=>parts.map(p=>typeof p==='string'?p:`[id=${p.id}]`).join('.').replaceAll('.[','[');
export const rowOf=(world,file,id)=>(file.endsWith('items.json')?world.items:file.endsWith('recipes.json')?world.recipes:world.locations).find(r=>r.id===id);

// --- text-preserving edit: replace only the bytes of one JSON value --------
// The formal files use several layouts (one-line items, two-space recipes);
// re-serialising a whole file would rewrite every approved row's bytes.
function scan(text){
 let i=0;const ws=()=>{while(/\s/.test(text[i]))i++;};
 function value(){
  ws();const start=i,c=text[i];
  if(c==='{'){i++;const keys=new Map();ws();if(text[i]==='}'){i++;return{start,end:i,keys};}
   for(;;){ws();const k=value();ws();assert.equal(text[i],':');i++;keys.set(JSON.parse(text.slice(k.start,k.end)),value());ws();if(text[i]===','){i++;continue;}assert.equal(text[i],'}');i++;return{start,end:i,keys};}}
  if(c==='['){i++;const items=[];ws();if(text[i]===']'){i++;return{start,end:i,items};}
   for(;;){items.push(value());ws();if(text[i]===','){i++;continue;}assert.equal(text[i],']');i++;return{start,end:i,items};}}
  if(c==='"'){i++;while(text[i]!=='"')i+=text[i]==='\\'?2:1;i++;return{start,end:i};}
  while(i<text.length&&!/[\s,\]}]/.test(text[i]))i++;assert.ok(i>start,'JSON 扫描失败');return{start,end:i};
 }
 return value();
}
function spanOf(text,node,parts){
 for(const part of parts){
  if(typeof part==='string'){node=node.keys?.get(part);}
  else node=node.items?.find(n=>{const id=n.keys?.get('id');return id&&JSON.parse(text.slice(id.start,id.end))===part.id;});
  assert.ok(node,`找不到修订位置 ${pathLabel(parts)}`);
 }
 return node;
}
export function editJSONText(text,edits){
 const tree=scan(text),expected=JSON.parse(text),spans=[];
 for(const {target,path:parts,before,after} of edits){
  const row=expected.find(r=>r.id===target);assert.ok(row,`正式文件缺少 ${target}`);
  assert.deepEqual(getPath(row,parts),before,`${target}.${pathLabel(parts)}: 发布前事实已改变`);
  setPath(row,parts,after);
  spans.push({...spanOf(text,tree,[{id:target},...parts]),text:JSON.stringify(after)});
 }
 spans.sort((a,b)=>b.start-a.start);
 let out=text;for(const s of spans)out=out.slice(0,s.start)+s.text+out.slice(s.end);
 assert.deepEqual(JSON.parse(out),expected,'文本修订与结构修订不一致');
 return out;
}

// --- the four revisions ------------------------------------------------------
const AUDIT='docs/审查/2026-11-05-已审内容改动盘点.md §三';
function factsFrom(world){
 const item=id=>{const r=world.items.find(x=>x.id===id);return r&&{id,name:r.name,basePrice:r.basePrice,use:r.use};};
 const recipe=id=>{const r=world.recipes.find(x=>x.id===id);return r&&{id,materials:r.materials,tools:r.tools,output:r.output,minutes:r.minutes};};
 const resource=(loc,res)=>{const l=world.locations.find(x=>x.id===loc);const r=l.site.resources.find(x=>x.id===res);return{location:loc,locationName:l.name,resource:{id:r.id,name:r.name,item:r.item,quantity:r.quantity}};};
 const makers=id=>world.recipes.filter(r=>r.output.item===id||(r.byproducts??[]).some(b=>b.item===id)).map(r=>r.id);
 return {item,recipe,resource,makers};
}
function buildEntries(world){
 const f=factsFrom(world);
 const parchmentRecipe=f.recipe('recipe_kc_parchment_rawhide_parchment');
 const sheetCost=parchmentRecipe.materials.reduce((n,m)=>n+f.item(m.item).basePrice*m.amount,0)/parchmentRecipe.output.quantity;
 const ironOre={item:f.item('item_iron_ore'),natural:f.makers('item_iron_ore').length===0};
 const ironScrap={item:f.item('item_iron_scrap'),madeBy:f.makers('item_iron_scrap')};
 const entry=(id,target,file,parts,before,after,basis,facts,supersedes)=>({id,target,file,path:parts,field:pathLabel(parts),before,after,basis,facts,supersedes,
  boundary:'只改这一个已审字段；同一行的其余字段、说明文字与其它地点或配方一律不动。改动依据是本条引用的现有世界事实，不新增物品、配方或地点。'});
 return [
  entry('item_parchment-basePrice','item_parchment','world/meta/items.json',['basePrice'],f.item('item_parchment').basePrice,4,[
   `${AUDIT}：item_parchment.basePrice 12 是手定价，链成本找不到通用规律命中，需走审批。`,
   `产链 recipe_kc_parchment_rawhide_parchment：一份刮净生皮（${f.item('item_rawhide').basePrice} 文，一公斤）加水刮出 ${parchmentRecipe.output.quantity} 张，每张材料价 ${sheetCost} 文；再加两小时刮制工与刮皮刀磨损，定 4 文。`,
   '12 文时 29 条抄书配方（recipe_kc_copy_*）的羊皮纸材料价高于书价，违背"配方售价不低于材料"的世界校验。'],
   {parchment:f.item('item_parchment'),rawhide:f.item('item_rawhide'),water:{id:'item_water',basePrice:f.item('item_water').basePrice},recipe:parchmentRecipe,materialCostPerSheet:sheetCost},
   [{receipt:'world/drafts/w3/trades/bones.json#item_parchment',field:'basePrice'},{receipt:'world/drafts/w3/trades/items/item_parchment.json',field:'(说明文字，不变)'}]),
  entry('recipe_smelt_iron-tools','recipe_smelt_iron','world/meta/recipes.json',['tools'],f.recipe('recipe_smelt_iron').tools,[],[
   `${AUDIT}：冶炼要锻锤与铁钳，而锻锤、铁钳都由铁料锻成，铁料又只来自冶炼，铁链没有起点。`,
   '冶炼是选矿后以木炭还原；材料和产出不变，只去掉工具要求，使第一把锤可由冶炼出的铁料锻成。',
   '工艺说明里"锻打成可回炉铁料"一句是已审原文，本条不改；去掉的只是锻工手锤、长柄铁钳这两件本身要用铁料锻成的工具，冶炼时的捶实不以它们为前提。'],
   {smelt:{...f.recipe('recipe_smelt_iron'),process:world.recipes.find(r=>r.id==='recipe_smelt_iron').process},hammer:f.recipe('recipe_kc_tool_smith_hammer'),tongs:f.recipe('recipe_kc_tool_smith_tongs'),ironMadeBy:f.makers('item_iron')},
   [{receipt:'commit 1fb65474 (S3-E04 smelting) / recipes.json#recipe_smelt_iron',field:'tools'}]),
  ...[['loc_wild_lq_adit','adit_ore','world/design/w5-sites-1.mjs#loc_wild_lq_adit'],['site_w5_ll_deep_drift','ll_ore','world/design/w5-sites-2.mjs#site_w5_ll_deep_drift']].map(([loc,res,receipt])=>{
   const r=f.resource(loc,res);
   return entry(`${loc}-${res}-item`,loc,'world/geo/locations.json',['site','resources',{id:res},'item'],r.resource.item,'item_iron_ore',[
    `${AUDIT}：${loc} 的资源"${r.resource.name}"登记成铁边料小块（锻造下料的制成品），旧矿道里不会自然有锻件边料。`,
    '铁砂是矿道里的含铁矿石，改登记为 item_iron_ore；资源名、数量、工时、机关不变。'],
    {site:r,ironOre,ironScrap},[{receipt,field:`site.resources[id=${res}].item`}]);
  }),
 ];
}

let frozen;
try{frozen=await read(`${root}/candidate.json`);assert.equal(frozen.revision,revision);}catch(error){if(error.code!=='ENOENT')throw error;}
export const frozenEntries=()=>frozen?.entries;
export const draftFor=e=>({id:e.id,target:e.target,field:e.field,value:e.after});
export const contextFor=e=>({sourceFacts:e.basis,referencedFacts:e.facts,supersedes:e.supersedes});
export function applyCandidate(world,entries){
 const w=structuredClone(world);
 for(const e of entries)setPath(rowOf(w,e.file,e.target),e.path,e.after);
 return w;
}
export function validateDraft(d,e){
 try{assert.deepEqual(d,draftFor(e));assert.ok(e.basis.length&&e.boundary&&e.supersedes.length);return [];}catch(error){return [error.message];}
}
export const isPublished=(world,entries)=>entries.every(e=>{try{assert.deepEqual(getPath(rowOf(world,e.file,e.target),e.path),e.after);return true;}catch{return false;}});
// The verdict is a few tokens; a smaller ceiling keeps each reservation inside the card limit.
// The skeleton carries only the change; basis and facts travel once, as context.
export const skeletonOf=({basis,facts,supersedes,...core})=>core;
export const reviewRequest=(e,d,c)=>({...defaultReviewRequest(skeletonOf(e),d,c),max_tokens:400});

// 修订批的通用流水线（--prepare 冻结候选并跑 L1，--review L2，--publish，--verify）。P1 与级联批共用，各自的差别全在 cfg：
// cfg={revision,root,CARD,limitYuan,frozen,buildEntries(world),draftFor,contextFor,validateDraft,applyCandidate,isPublished,note}
export async function runRevision(cfg,args=process.argv.slice(2)){
 const {revision,root,CARD,frozen,draftFor,contextFor,validateDraft,applyCandidate,isPublished}=cfg;
 const {loadWorld}=await import('../../tools/load-world.mjs');
 const world=await loadWorld();
 const entries=frozen?.entries??await cfg.buildEntries(world);
 if(args.includes('--prepare')){
  assert.ok(!frozen,'候选已冻结');
  const {validateWorld}=await import('../../tools/validate-world.mjs');
  const baseline=validateWorld(world),candidate=validateWorld(applyCandidate(world,entries));
  const added=candidate.errors.filter(e=>!baseline.errors.includes(e)),removed=baseline.errors.filter(e=>!candidate.errors.includes(e));
  assert.deepEqual(added,[],'候选新增 L1 错误');
  for(const file of new Set(entries.map(e=>e.file)))editJSONText(await fs.readFile(file,'utf8'),entries.filter(e=>e.file===file));
  await fs.mkdir(root,{recursive:true});
  const rates=new DeepSeekClient().rates;
  const ceilings=entries.map(e=>{const r=reviewRequest(e,draftFor(e),contextFor(e));return (Buffer.byteLength(JSON.stringify({model:'deepseek-flash',stream:false,...r}))*rates.miss+r.max_tokens*rates.output)/1e6;});
  await fs.writeFile(`${root}/candidate.json`,JSON.stringify({revision,entries,drafts:entries.map(draftFor),contexts:entries.map(contextFor)},null,2)+'\n');
  await fs.writeFile(`${root}/l1.json`,JSON.stringify({revision,entries:entries.length,addedErrors:added,removedErrors:removed,baselineErrors:baseline.errors.length,candidateErrors:candidate.errors.length,textEditsVerified:true,modelCalls:0,published:false},null,2)+'\n');
  await fs.writeFile(`${root}/cost-estimate.json`,JSON.stringify({rates,requests:entries.length,perRequestCeilingYuan:ceilings,firstPassCeilingYuan:ceilings.reduce((a,b)=>a+b,0),cardLimitYuan:cfg.limitYuan,modelCalls:0},null,2)+'\n');
  const budgetFile=`${root}/budget.json`;
  try{await fs.access(budgetFile);}catch{await fs.writeFile(budgetFile,JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:cfg.limitYuan,note:cfg.note,cards:{[CARD]:{limitYuan:cfg.limitYuan,spentYuan:0,reservedYuan:0,maxRequests:entries.length}},requests:{}},null,2)+'\n');}
  console.log(JSON.stringify({entries:entries.length,addedErrors:added.length,removedErrors:removed.length,ceilingYuan:ceilings.reduce((a,b)=>a+b,0),modelCalls:0}));
 }
 if(args.includes('--review')){
  assert.ok(frozen,'先 --prepare 冻结候选');
  const budget=await read(`${root}/budget.json`),card=budget.cards?.[CARD];
  assert.ok(Number.isFinite(card?.limitYuan)&&card.limitYuan>0&&card.limitYuan<=cfg.limitYuan,`缺少 ${CARD} 预算账或超过 ${cfg.limitYuan} 元`);
  const {summary}=await runContentPipeline({entries,root:`${root}/review`,budgetRoot:root,revision,contextFor,validateDraft,reviewDraftFor:async e=>draftFor(e),reuseFrozenDrafts:true,
   buildDraftRequest:()=>{throw Error('Frozen candidate');},buildReviewRequest:reviewRequest,client:new DeepSeekClient({budgetYuan:card.limitYuan,logFile:`${root}/usage.jsonl`}),cardId:CARD,
   allocation:{cardId:CARD,incrementLimitYuan:card.limitYuan,maxRequests:card.maxRequests,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:entries.length});
  console.log(JSON.stringify({passed:summary.passed,manual:summary.manual,pending:summary.pending,costUpperYuan:summary.costUpperYuan}));
 }
 if(args.includes('--publish')){
  assert.ok(frozen,'缺少冻结候选');
  const approved=await readApprovedContent(`${root}/review`,entries,{revision,contextFor});
  assert.equal(approved.length,entries.length);
  for(const e of entries)assert.deepEqual(approved.find(d=>d.id===e.id),draftFor(e));
  if(isPublished(world,entries)){console.log(JSON.stringify({published:true,verified:approved.length,modelCalls:0}));return;}
  // Check every target before writing any file.
  const out=new Map();
  for(const file of new Set(entries.map(e=>e.file)))out.set(file,editJSONText(await fs.readFile(file,'utf8'),entries.filter(e=>e.file===file)));
  for(const [file,text] of out)await fs.writeFile(file,text);
  await fs.writeFile(`${root}/publication.json`,JSON.stringify({revision,publishedAt:new Date().toISOString(),entries:entries.map(e=>({id:e.id,target:e.target,file:e.file,field:e.field,before:e.before,after:e.after,supersedes:e.supersedes})),receipt:`${root}/review`},null,2)+'\n');
  console.log(JSON.stringify({published:approved.length}));
 }
 if(args.includes('--verify')){
  const approved=await readApprovedContent(`${root}/review`,entries,{revision,contextFor});
  assert.equal(approved.length,entries.length);assert.ok(isPublished(world,entries),'正式文件与回执不符');
  console.log(JSON.stringify({published:true,verified:approved.length,modelCalls:0}));
 }
}
export const run=(args=process.argv.slice(2))=>runRevision({revision,root,CARD,limitYuan:0.02,frozen,buildEntries,draftFor,contextFor,validateDraft,applyCandidate,isPublished,
 note:'P1 已审内容修订（4 条）：亮圳 11-05 批准，单卡上限 0.02 元。'},args);
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
