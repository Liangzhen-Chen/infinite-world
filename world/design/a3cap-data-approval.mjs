import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent,hashContent,parseModelJSON} from '../../tools/content-pipeline.mjs';
import {revertedRows} from '../../tools/approved-revisions.mjs';

export const revision='a3cap-data-1';
export const draftRoot='world/drafts/a3cap-data';
export const reviewRoot=path.join(draftRoot,'review');
// Capacities are explicit L1 values. Sources in the records bind each value to
// the item's published shape/use and the 250 ml item_water serving reference.
export const capacities={item_clay_cup:250,item_clay_bowl:500,item_cooking_pot:3000,item_clay_pot:1500};
export const rationale={
 item_clay_cup:'小陶杯高约一掌、重0.22公斤；以世界中 item_water 一份250毫升作常用饮水参照，取250毫升。',
 item_clay_bowl:'敞口粗陶碗重0.48公斤且用于短时盛饭；取约两份250毫升，500毫升。',
 item_cooking_pot:'厚底煮锅重1.5公斤、配小灶煮粥并加热乳液；按可手提家用煮锅取3升。',
 item_clay_pot:'素面陶罐重0.6公斤、宽肚收颈，且检验明确以盛水查渗；取1.5升。',
};
const readItems=async()=>JSON.parse(await fs.readFile('world/meta/items.json','utf8'));
const byId=(items,id)=>{const r=items.find(x=>x.id===id);assert.ok(r,`缺少物品 ${id}`);return r;};
const tagsFor=(row)=>[...new Set([...(row.tags??[]),'liquid_container'])].sort();
export async function entriesFor(items=null){items??=await readItems();return Object.keys(capacities).map(id=>{const row=structuredClone(byId(items,id));row.tags=tagsFor(row);row.capacityMl=capacities[id];return {id,kind:'item-capacity',row,source:{path:`world/meta/items.json#${id}`,detail:`${byId(items,id).use} ${byId(items,id).description} 容量依据：${rationale[id]}`},boundary:`仅添加液体容器用途和capacityMl=${capacities[id]}；容量单位为毫升。${rationale[id]}`};});}
export function draftFor(entry){return {id:entry.id,row:structuredClone(entry.row)};}
export async function validateDraft(draft,entry,items=null){items??=await readItems();try{assert.deepEqual(draft,draftFor(entry));const actual=byId(items,entry.id);const {tags:_t,capacityMl:_c,...base}=entry.row;const {tags:_at,capacityMl:_ac,...current}=actual;assert.deepEqual(base,current);return [];}catch{return ['候选须与本批固定用途、容量及当前物品行完全一致'];}}
const ctxFor=entry=>({item:entry.row,source:entry.source,boundary:entry.boundary});
const frozenDraft=()=>{throw Error('本批 L1 候选已冻结');};
function reviewRequest(entry,draft,context){const req=defaultReviewRequest(entry,draft,context);req.messages[0].content='你是游戏世界物品事实审查员。逐项核对liquid_container用途与capacityMl数值是否由物品形制、用途及引用依据直接支持；不得自行补充其他事实。只返回JSON，格式为 {"contradictions":[{"quote":"候选原句","field":"row.capacityMl或row.tags","severity":"hard|soft|style","reason":"具体理由"}]}；没有矛盾则返回空数组。';return req;}
export function extractReview(response){try{const r=parseModelJSON(response);assert.ok(Array.isArray(r?.contradictions));for(const x of r.contradictions){assert.ok(['hard','soft','style'].includes(x.severity));for(const k of ['quote','field','reason'])assert.ok(typeof x[k]==='string'&&x[k].trim());}return r;}catch(e){throw Object.assign(new Error(`Invalid review JSON: ${e.message}`),{code:'CONTENT_BUDGET_STOP'});}}
export async function verifyPublished(items=undefined){items??=await revertedRows(await readItems(),'world/meta/items.json');const entries=await entriesFor(items),approved=await readApprovedContent(reviewRoot,entries,{revision,contextFor:ctxFor});assert.equal(approved.length,entries.length,'L1/L2未全批通过');for(const d of approved)assert.deepEqual(byId(items,d.id),d.row,`${d.id}发布值与回执不符`);return {published:approved.length};}
function patchItems(text,items,approved){const rows=new Map(approved.map(d=>[d.id,d.row])),patches=[];let depth=0,start=-1,q=false,esc=false;for(let i=0;i<text.length;i++){const c=text[i];if(q){if(esc)esc=false;else if(c==='\\')esc=true;else if(c==='"')q=false;continue;}if(c==='"'){q=true;continue;}if(c==='{'){if(depth++===0)start=i;}if(c==='}'&&--depth===0){const raw=text.slice(start,i+1),old=JSON.parse(raw),row=rows.get(old.id);if(!row)continue;assert.deepEqual(old,byId(items,old.id));const next=JSON.stringify(row);patches.push({start,end:i+1,text:next});rows.delete(old.id);}}assert.equal(rows.size,0);for(const p of patches.reverse())text=text.slice(0,p.start)+p.text+text.slice(p.end);return text;}
async function initBudget(){const file=path.join(draftRoot,'budget.json');try{const b=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(b.cards['A3CAP-DATA'].maxRequests,30);return;}catch(e){if(e.code!=='ENOENT')throw e;}await fs.mkdir(draftRoot,{recursive:true});await fs.writeFile(file,JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:20,note:'A3CAP-DATA upper limit: 30 calls, 1 yuan.',cards:{'A3CAP-DATA':{limitYuan:1,spentYuan:0,reservedYuan:0,maxRequests:30}},requests:{}},null,2)+'\n');}
export async function run(args=process.argv.slice(2)){const items=await readItems(),all=await entriesFor(items);if(args.includes('--l1')){for(const e of all)assert.deepEqual(await validateDraft(draftFor(e),e,items),[]);console.log(JSON.stringify({L1:'passed',entries:all.length}));}
if(args.includes('--pilot')||args.includes('--review')){await initBudget();const entries=args.includes('--pilot')?all.slice(0,1):all;const {summary}=await runContentPipeline({entries,root:reviewRoot,budgetRoot:draftRoot,revision,contextFor:ctxFor,validateDraft:(d,e)=>validateDraft(d,e,items),reviewDraftFor:async e=>draftFor(e),reuseFrozenDrafts:true,buildDraftRequest:frozenDraft,buildReviewRequest:reviewRequest,extractReview,client:new DeepSeekClient({budgetYuan:1,logFile:path.join(draftRoot,'usage.jsonl')}),cardId:'A3CAP-DATA',allocation:{cardId:'A3CAP-DATA',incrementLimitYuan:1,maxRequests:30,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:4});console.log(JSON.stringify({passed:summary.passed,manual:summary.manual,pending:summary.pending,budget:summary.budget.cards['A3CAP-DATA']}));}
if(args.includes('--publish')){const approved=await readApprovedContent(reviewRoot,all,{revision,contextFor:ctxFor});assert.equal(approved.length,all.length);const original=await fs.readFile('world/meta/items.json','utf8');const patched=patchItems(original,items,approved);JSON.parse(patched);await fs.writeFile('world/meta/items.json',patched);console.log(JSON.stringify({published:approved.length}));}if(args.includes('--verify'))console.log(JSON.stringify(await verifyPublished()));}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
