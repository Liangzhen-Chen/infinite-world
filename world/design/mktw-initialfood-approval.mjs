// MKTW 回执修订批（上下文一侧），NOT loaded by the game。
// a1b94858（MKTW ①b）删掉了 initialFood：world/design/agriculture-foundation.mjs 的 loc_hw 行、w1-village-profiles.mjs 的 ledgerSeeds.food 与 villageLedgerRules 的 initialFood。
// w1 village-ledgers 的已批记录审查时用的上下文（tools/w1-village-profiles-content.mjs contextFor 的 charter.agriculture，整行取自 villageLedgerRules）含这一项，
// 记录指纹 = hash({entry, context, revision}) 因此失配；而 initfood-1 的回执只取代了正式行/草稿里的 economy.publicStock.food，没取代上下文里的 initialFood。
// 本批补这条回执：声明上下文路径 charter.agriculture.initialFood 被取代（删除），before 取自 a1b94858^ 的原数据。记录文件不动、不重新审查。
// 批准证据：initfood-1 已批准整条删除“村级公共仓期初粮食”这一事实；本批只是这一事实在上下文里的同一份拷贝。
//   同一事实的依据：审批当时 validateVillageLedger 断言 publicStock.food === 规则行 initialFood（a1b94858 前），所以记录草稿里的 publicStock.food 就是当时上下文里的 initialFood。
//   verifyFrozen 逐条核对：initfood-1 回执核验通过、该聚落在 initfood-1 里被删、before 等于记录草稿里的值；条目集合 = 草稿登记过 publicStock.food 的全部已批记录（由代码推出，不点名村）。
// 键位：被删键在 a1b94858^ 的 agriculture-foundation.mjs 里排在 initialHarvestDay 之前（… initialFood:8000,initialHarvestDay:-150 …），规则行覆盖值不改键位。
// 无模型调用、无费用（审批来自 initfood-1，approval.via 登记在 tools/approved-revisions.mjs APPROVAL_SOURCES）。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {hashContent,reportApprovalIncomplete,approvalIncomplete} from '../../tools/content-pipeline.mjs';
import {REMOVE,isRemove,runRevision,draftFor,contextFor,validateDraft,rowOf,getPath} from './p1-revision-approval.mjs';

export const revision='mktw-initialfood-1',root='world/drafts/mktw-initialfood',CARD='MKTW';
export const RECEIPT_DIR='world/drafts/w1/village-ledgers',CONTEXT_FIELD='charter.agriculture.initialFood',FOLLOWED_BY='initialHarvestDay';
const INITFOOD={revision:'initfood-1',file:'world/geo/settlements.json',field:'details.economy.publicStock.food',receipt:'world/drafts/initfood/review'};
export {draftFor,contextFor,validateDraft};

// 已批记录里草稿登记过公仓初粮的全部聚落（已通过、草稿 publicStock.food 为数）。
async function recordsWithFood(dir=RECEIPT_DIR){
 const out=[];
 for(const name of (await fs.readdir(dir)).filter(n=>n.endsWith('.json'))){
  const r=JSON.parse(await fs.readFile(`${dir}/${name}`,'utf8'));
  if(r?.status==='passed'&&typeof r.draft?.id==='string'&&typeof r.draft?.economy?.publicStock?.food==='number')out.push(r);
 }
 return out.sort((a,b)=>a.draft.id.localeCompare(b.draft.id));
}
export async function buildEntries(){
 return (await recordsWithFood()).map(r=>{
  const id=r.draft.id,before=r.draft.economy.publicStock.food;
  return {id:`mktw-initialfood-${id}`,target:id,file:`${RECEIPT_DIR}/${id}.json`,path:CONTEXT_FIELD.split('.'),field:CONTEXT_FIELD,before,after:REMOVE,followedBy:FOLLOWED_BY,
   basis:[
    'a1b94858 删除了规则行与 ledgerSeeds 里的 initialFood；该记录审查时的上下文 charter.agriculture 含 initialFood，值等于记录草稿登记的 economy.publicStock.food。',
    `initfood-1 已批准整条删除 ${id} 的公仓初粮登记（${INITFOOD.field}，原值 ${before}）；上下文里这份拷贝随同删除。`,
    '本条只登记“审批当时的上下文含该事实、现已被已审批修订取代”，使指纹核验把上下文还原到审批当时的形状；不改正式文件，不改记录。'],
   facts:{initfood:INITFOOD.revision,recordFile:`${RECEIPT_DIR}/${id}.json`,contextPath:CONTEXT_FIELD,followedBy:FOLLOWED_BY,source:'a1b94858^:world/design/agriculture-foundation.mjs（initialFood 在 initialHarvestDay 之前）'},
   supersedes:[{receipt:`${RECEIPT_DIR}/${id}.json#${id}`,field:CONTEXT_FIELD,scope:'context'}],
   boundary:'只登记上下文一侧被取代的这一个事实；记录、正式文件与其它字段一律不动。'};
 });
}
// 审批来源核验（APPROVAL_SOURCES['initfood-1']）：条目与 initfood-1 已批回执、已批记录草稿逐条对得上，且覆盖全部登记过公仓初粮的已批记录。
export async function verifyFrozen(entries){
 const {listRevisionBatches,readApprovedBatch}=await import('../../tools/approved-revisions.mjs');
 const batch=(await listRevisionBatches()).find(b=>b.pub.revision===INITFOOD.revision);
 if(!batch)throw approvalIncomplete(`${INITFOOD.revision} 尚未发布，本批没有可复用的审批`);
 await readApprovedBatch(batch);
 const byTarget=new Map(batch.pub.entries.map(x=>[x.target,x])),records=new Map((await recordsWithFood()).map(r=>[r.draft.id,r]));
 for(const e of entries){
  const x=byTarget.get(e.target),r=records.get(e.target);
  assert.ok(x&&x.file===INITFOOD.file&&x.field===INITFOOD.field&&isRemove(x.after),`${INITFOOD.revision} 没有删除 ${e.target} 的公仓初粮`);
  assert.ok(r,`没有登记过公仓初粮的已批记录：${e.target}`);
  assert.equal(hashContent(e.before),hashContent(x.before),`before 与 ${INITFOOD.revision} 不符：${e.target}`);
  assert.equal(hashContent(e.before),hashContent(r.draft.economy.publicStock.food),`before 与记录草稿不符：${e.target}`);
  assert.ok(isRemove(e.after)&&e.field===CONTEXT_FIELD&&e.supersedes.every(s=>s.scope==='context'&&s.field===CONTEXT_FIELD),`条目形状不符：${e.id}`);
 }
 assert.deepEqual([...entries.map(e=>e.target)].sort(),[...records.keys()].sort(),'条目须覆盖全部登记过公仓初粮的已批记录');
}
// 前提：被引用的正式改动（initfood-1）已发布——这些聚落的正式行里已没有公仓初粮。
export const isPublished=(world,entries)=>entries.every(e=>{try{return getPath(rowOf(world,INITFOOD.file,e.target),INITFOOD.field.split('.'))===undefined;}catch{return false;}});
export const applyCandidate=w=>w;

let frozen;
try{frozen=JSON.parse(await fs.readFile(`${root}/candidate.json`,'utf8'));assert.equal(frozen.revision,revision);}catch(error){if(error.code!=='ENOENT')throw error;}
export const frozenEntries=()=>frozen?.entries;
export const run=(args=process.argv.slice(2))=>runRevision({revision,root,CARD,receiptOnly:true,frozen,buildEntries,draftFor,contextFor,validateDraft,applyCandidate,isPublished,
 approval:{via:INITFOOD.revision,receipt:INITFOOD.receipt,verify:verifyFrozen},
 note:'MKTW：initialFood 的上下文回执；审批复用 initfood-1，无模型调用。'},args);
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await reportApprovalIncomplete(()=>run());
