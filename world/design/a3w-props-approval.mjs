// a3w-props：工具用途结构化标签的批次审批与发布入口。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';
import {runContentPipeline, defaultReviewRequest, readApprovedContent, hashContent, parseModelJSON} from '../../tools/content-pipeline.mjs';
import {revertedRows} from '../../tools/approved-revisions.mjs';

export const revision='a3w-props-1';
export const draftRoot='world/drafts/a3w-props';
export const reviewRoot=path.join(draftRoot,'retry-1');
const cardId='A3W-PROPS';
export const sources={
  item_hoe:['soil_work'], item_herb_hoe:['soil_work'], item_sickle:['harvest','cut'], item_iron_wire:['unlock'],
  item_smith_tongs:['grip'], item_jeweler_pliers:['grip'], item_button_shank_tool:['grip'],
  item_staff:['probe'], item_mining_pick:['soil_work','pry'],
  // item_iron_awl excluded: L2 supports piercing soft leather, not prying.
  // Keep its complete failed proposal and response in retry-1/item_iron_awl.json.
  item_stitching_awl:['pierce'], item_whittling_knife:['cut'], item_kitchen_knife:['cut'],
  item_frame_saw:['cut'], item_mortise_chisel:['cut'], item_leather_shears:['cut'],
  item_sheet_shears:['cut'], item_drawknife:['cut'], item_jeweler_saw:['cut'],
  item_quill_knife:['cut'], item_hooked_pruning_knife:['cut'], item_leather_round_knife:['cut'],
  item_carpenters_adze:['cut'], item_steel_gouge_tip:['cut'], item_broad_steel_chisel:['cut'],
  item_water:['drinkable'], item_milk:['drinkable'], item_clay_cup:['liquid_container'],
  item_clay_bowl:['liquid_container'], item_cooking_pot:['liquid_container'],
};
const vocab=JSON.parse(await fs.readFile('world/meta/item-use-tags.json','utf8'));
const readItems=async()=>JSON.parse(await fs.readFile('world/meta/items.json','utf8'));
const byId=(items,id)=>{const row=items.find(x=>x.id===id);assert.ok(row,`缺少物品 ${id}`);return row;};
const rowFor=(items,id)=>{const row=structuredClone(byId(items,id));row.tags=[...new Set([...(row.tags??[]),...sources[id]])].sort();return row;};
export async function entriesFor(items=null) {
 items??=await readItems();
 return Object.entries(sources).map(([id,tags])=>({id,kind:'item-tags',row:rowFor(items,id),
  source:{path:`world/meta/items.json#${id}`,detail:`目录描述：${byId(items,id).use} ${byId(items,id).description}`},
  boundary:`仅添加由该物品现有用途与形制支持的标签：${tags.join(', ')}；不改物品其他字段，不表示技能、权限、自动成功或超出描述的用途。`}));
}
export function draftFor(entry){return {id:entry.id,row:structuredClone(entry.row)};}
export async function validateDraft(draft,entry,items=null){
 items??=await readItems();
 const expected=draftFor(entry), actual=byId(items,entry.id),{tags:_candidateTags,...candidateFacts}=entry.row,{tags:_currentTags,...currentFacts}=actual;
 try{
  assert.deepEqual(draft,expected);assert.deepEqual(candidateFacts,currentFacts);
  assert.ok(sources[entry.id].every(tag=>Object.hasOwn(vocab.tags,tag)));
  return [];
 }catch{return ['候选须与本批固定标签及当前物品行完全一致，且标签必须在用途词表内'];}
}
const ctxFor=entry=>({item:entry.row,source:entry.source,boundary:entry.boundary,tagMeanings:Object.fromEntries(entry.row.tags.filter(t=>vocab.tags[t]).map(t=>[t,vocab.tags[t]]))});
const draftRequest=()=>{throw Error('本批 L1 候选已冻结；不请求模型改写');};
function reviewRequest(entry,draft,context){
 const req=defaultReviewRequest(entry,draft,context);
 req.messages[0].content='你是游戏世界物品用途标签的事实审查员。逐项核对新增标签是否由物品形制、use、description直接支持。cut涵盖刀、锯、剪、凿削；soil_work只用于开松土壤；harvest仅指采收；grip是夹持工件；probe是探触；pry是撬动；drinkable只表示内容物可直接饮用；liquid_container表示器皿可盛液体；unlock仅表示铁线可用于简单机械锁。不得把需另备材料、器材或技能的用途扩写成保证效果。只返回JSON，格式为 {"contradictions":[{"quote":"候选原文","field":"row.tags","severity":"hard|soft|style","reason":"具体核对理由"}]}；无问题时 contradictions 为空数组。';
 return req;
}
// The authorized retry gets at most one provider response per item. Keep raw
// provider evidence in the shared pipeline; malformed JSON is never approval.
export function extractUseReview(response){
 try{
  const review=parseModelJSON(response);
  assert.ok(Array.isArray(review?.contradictions),'Missing contradictions array');
  for(const issue of review.contradictions){
   assert.ok(['hard','soft','style'].includes(issue.severity));
   for(const key of ['quote','field','reason'])assert.ok(typeof issue[key]==='string'&&issue[key].trim());
  }
  return review;
 }catch(error){throw Object.assign(new Error(`Invalid contradictions JSON: ${error.message}`),{code:'CONTENT_BUDGET_STOP'});}
}
async function authorizeRetry(){
 const file=path.join(draftRoot,'budget.json'),ledger=JSON.parse(await fs.readFile(file,'utf8'));
 const card=ledger.cards[cardId],authorizationId='a3w-props2-authorized-retry';
 if(ledger.authorizations?.some(a=>a.id===authorizationId)){
  assert.equal(card.maxRequests,80);assert.equal(card.limitYuan,1);return;
 }
 assert.equal(card.maxRequests,40);assert.equal(card.limitYuan,1);
 assert.equal(ledger.reservedYuan,0);assert.equal(card.reservedYuan,0);
 assert.equal(card.spentYuan,0.10223952);assert.equal(ledger.spentYuan,card.spentYuan);
 assert.equal(Object.values(ledger.requests).filter(r=>r.card===cardId&&r.status!=='cancelled-unissued').length,40);
 ledger.authorizations??=[];
 ledger.authorizations.push({id:authorizationId,source:'用户续做 a3w-props：授权重跑一次，先试审1项；本次最多40次，含前轮累计不超过1元。',
  before:{maxRequests:40,spentYuan:card.spentYuan,reservedYuan:card.reservedYuan,requestsHash:hashContent(ledger.requests)},
  after:{maxRequests:80,limitYuan:1},at:new Date().toISOString()});
 card.maxRequests=80;
 await fs.writeFile(file,JSON.stringify(ledger,null,2)+'\n');
}
async function requirePilot(entries){
 const pilot=entries.find(e=>e.id==='item_hoe'),record=JSON.parse(await fs.readFile(path.join(reviewRoot,'item_hoe.json'),'utf8'));
 assert.equal(record.status,'passed','试审未通过，不继续全批');
 assert.equal(record.fingerprint,hashContent({entry:pilot,context:ctxFor(pilot),revision}));
 assert.ok(Array.isArray(record.review.contradictions));assert.deepEqual(record.errors,[]);
}
export async function verifyPublished(items=undefined){
 items??=await revertedRows(await readItems(),'world/meta/items.json');
 // This receipt predates the later capacity field. Verify its exact historical
 // projection so the newer A3CAP receipt can be checked first and this gate
 // still protects the original tags publication and its tamper evidence.
 const historical=items.map(row=>{const copy=structuredClone(row);delete copy.capacityMl;return copy;});
 const entries=await entriesFor(historical),approved=await readApprovedContent(reviewRoot,entries,{revision,contextFor:ctxFor});
 assert.equal(approved.length,entries.length,'L1/L2未全批通过');
 for(const draft of approved){const current=structuredClone(byId(items,draft.id));delete current.capacityMl;assert.deepEqual(current,draft.row,`${draft.id} 正式目录与历史审批回执不符`);}
 return {published:approved.length};
}
// Preserve the mixed historical JSON layout: only the tags field in approved
// top-level item objects is replaced or appended.
function patchItemTags(text,items,approved){
 const rows=new Map(approved.map(d=>[d.id,d.row.tags])),patches=[];
 let depth=0,start=-1,quoted=false,escaped=false;
 for(let at=0;at<text.length;at++){
  const c=text[at];
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
  if(c==='"'){quoted=true;continue;}
  if(c==='{'){if(depth++===0)start=at;}
  if(c==='}'&&--depth===0){
   const raw=text.slice(start,at+1),row=JSON.parse(raw),tags=rows.get(row.id);
   if(!tags)continue;
   assert.deepEqual(row,byId(items,row.id));
   let replacement;
   if(Object.hasOwn(row,'tags'))replacement=raw.replace(/("tags"\s*:\s*)\[[^\]]*\]/,(_match,prefix)=>prefix+JSON.stringify(tags));
   else{
    const closing=/(\r?\n)([ \t]*)\}$/.exec(raw);
    replacement=closing?raw.slice(0,closing.index)+','+closing[1]+closing[2]+'  "tags": '+JSON.stringify(tags)+closing[0]:raw.slice(0,-1)+',"tags":'+JSON.stringify(tags)+'}';
   }
   patches.push({start,end:at+1,text:replacement});rows.delete(row.id);
  }
 }
 assert.equal(rows.size,0,'存在没有定位到原文的审批物品');
 for(const p of patches.reverse())text=text.slice(0,p.start)+p.text+text.slice(p.end);
 return text;
}
export async function run(args=process.argv.slice(2)){
 const items=await readItems(),allEntries=await entriesFor(items);
 const entries=args.includes('--pilot')?allEntries.filter(e=>e.id==='item_hoe'):allEntries;
 if(args.includes('--l1')){
  const errs=[];for(const e of entries)errs.push(...await validateDraft(draftFor(e),e,items).then(rows=>rows.map(x=>`${e.id}: ${x}`)));
  assert.deepEqual(errs,[]);console.log(JSON.stringify({L1:'passed',entries:entries.length}));
 }
 if(args.includes('--review')||args.includes('--pilot')){
  console.log(JSON.stringify({pid:process.pid,mode:args.includes('--pilot')?'pilot':'review'}));
  await authorizeRetry();
  if(!args.includes('--pilot'))await requirePilot(allEntries);
  const {summary}=await runContentPipeline({entries,root:reviewRoot,budgetRoot:draftRoot,revision,contextFor:ctxFor,
   validateDraft:(d,e)=>validateDraft(d,e,items),reviewDraftFor:async e=>draftFor(e),reuseFrozenDrafts:true,
   buildDraftRequest:draftRequest,buildReviewRequest:reviewRequest,extractReview:extractUseReview,
   client:new DeepSeekClient({budgetYuan:1,logFile:path.join(draftRoot,'usage.jsonl')}),cardId:'A3W-PROPS',
   allocation:{cardId:'A3W-PROPS',incrementLimitYuan:1,maxRequests:80,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:25});
  console.log(JSON.stringify({passed:summary.passed,manual:summary.manual,pending:summary.pending,budget:summary.budget.cards['A3W-PROPS']}));
 }
 if(args.includes('--publish')){
  assert.ok(!args.includes('--pilot'),'试审不能发布');
  const approved=await readApprovedContent(reviewRoot,entries,{revision,contextFor:ctxFor});
  assert.equal(approved.length,entries.length,'L1/L2未全批通过');
  const original=await fs.readFile('world/meta/items.json','utf8');
  const patched=patchItemTags(original,items,approved);
  const candidate=JSON.parse(patched);
  for(const draft of approved)assert.deepEqual(byId(candidate,draft.id),draft.row);
  await fs.writeFile('world/meta/items.json',patched);
  await fs.writeFile('world/meta/item-use-tags.json',JSON.stringify(vocab,null,2)+'\n');
  console.log(JSON.stringify({published:entries.length}));
 }
 if(args.includes('--verify'))console.log(JSON.stringify(await verifyPublished()));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
