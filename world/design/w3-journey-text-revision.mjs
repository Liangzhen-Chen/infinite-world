// w3-journey 正文修订批，NOT loaded by the game。
// 问题：tools/w3-content.mjs 的合并对已有 id 保留旧行，所以 journey 条目的草稿在发布之后被重写（如 L1 数字规则新增后重写、L4 退回重写），
// 现有发布工具更新不了 world/meta 里的正式正文。派生价当时是同一个问题，用修订批解决；本批把同一机制用于正文。
// 正文的新值只来自 journey 流程里已审批的记录（L1 + L2 + 所在批次 L4 批准，readApprovedContent 能读到即三者都已过），
// 本批不另写正文、不另发 L2、不花钱：条目 = 对每个 journey 条目比较"已审批记录里的草稿正文"与"正式文件里的正文"，不同者生成一条。
// 流程：--compare（只读：列出差异，不写任何文件）-> --prepare（冻结候选并跑 L1）-> --publish（断言 before 与现状一致，只改指名字段，写回执）-> --verify。
// 没有 --review：审批核验复用 journey 记录（approval.verify），回执被 tools/approved-revisions.mjs 的 readApprovedSupersedes 读取时同样复核。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runRevision,getPath,rowOf,draftFor,contextFor,validateDraft,applyCandidate,isPublished} from './p1-revision-approval.mjs';
import {economyW3Journey} from './economy-w3-journey.mjs';
import {journeyRoot,journeyRevision,journeyContext} from '../../tools/w3-journey.mjs';
import {readApprovedContent} from '../../tools/content-pipeline.mjs';

export const revision='w3-journey-text-1',root='world/drafts/w3-journey-text',CARD='W3JT',via='w3-journey-text';
export {draftFor,contextFor,validateDraft,applyCandidate,isPublished};
// 与 tools/w3-journey.mjs 起草时的字段一致（items 三段、recipes 的 process）。
export const KINDS={items:{file:'world/meta/items.json',fields:['description','inspection','storage']},recipes:{file:'world/meta/recipes.json',fields:['process']}};
// 只有本轮重写过的条目（记录里有 l4Rejection，或 attempts>1）才应当与正式正文不同；其余不同即"长期不一致"，不得批量生成。
export const MAX_DIFFERENCES=20;
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));

// 已审批的 journey 草稿：readApprovedContent 要求批次 L4 已批、指纹一致、L2 无 hard；任何一项不满足即抛错。
export async function approvedDrafts(world){
 const bones=economyW3Journey(world),out=[];
 for(const kind of Object.keys(KINDS)){
  const rows=await readApprovedContent(`${journeyRoot}/${kind}`,bones[kind],{contextFor:e=>journeyContext(world,bones,e),revision:journeyRevision});
  assert.equal(rows.length,bones[kind].length,`journey/${kind} 仍有条目未通过审批`);
  out.push(...rows.map(draft=>({kind,draft})));
 }
 return out;
}
// 未核验审批的原始草稿（只供 --compare 在审批未齐时预览差异；绝不用于生成条目）。
export async function rawDrafts(){
 const out=[];
 for(const kind of Object.keys(KINDS)){
  const dir=`${journeyRoot}/${kind}`;
  for(const name of (await fs.readdir(dir)).filter(n=>n.endsWith('.json')&&!/^(batch-\d+|summary)\.json$/.test(n)).sort()){
   const record=await read(`${dir}/${name}`);
   if(record.status==='passed'&&record.draft)out.push({kind,draft:record.draft});
  }
 }
 return out;
}
// 本记录带有"发布后重写"的痕迹：L4 退回（l4Rejection）、起草轮数增加（attempts>1），或重审中途被预算停止后解除重跑（budgetStopHistory，如 6301b58b 那轮级联价格变化触发的 4 条重审；指纹变化会让 attempts 归 1，所以单看 attempts 不够）。
export const rewrittenRecord=record=>record.l4Rejection!==undefined||record.attempts>1||(record.budgetStopHistory?.length??0)>0;
// 差异：对每个 journey 条目的每个正文字段，已审批草稿值与正式值不同则一条。
export async function differences(world,rows,recordOf=(kind,id)=>read(`${journeyRoot}/${kind}/${id}.json`)){
 const out=[];
 for(const {kind,draft} of rows)for(const field of KINDS[kind].fields){
  const official=world[kind].find(x=>x.id===draft.id);
  assert.ok(official,`正式文件缺少 journey 条目 ${draft.id}`);
  if(JSON.stringify(official[field])===JSON.stringify(draft[field]))continue;
  const record=await recordOf(kind,draft.id);
  out.push({kind,id:draft.id,field,before:official[field],after:draft[field],evidence:{record:`${journeyRoot}/${kind}/${draft.id}.json`,fingerprint:record.fingerprint,attempts:record.attempts,l4Rejection:record.l4Rejection!==undefined,budgetStops:record.budgetStopHistory?.length??0,rewritten:rewrittenRecord(record)}});
 }
 return out;
}
// 差异过多或出现"没被重写过却不同"的条目：说明正式正文与审批草稿长期不一致，先停下来如实报告，不生成条目。
export function guardDifferences(diffs){
 const unexplained=diffs.filter(d=>!d.evidence.rewritten);
 if(diffs.length>MAX_DIFFERENCES||unexplained.length){
  const sample=(unexplained.length?unexplained:diffs).slice(0,5).map(d=>`${d.id}.${d.field}`);
  throw new Error(`正式正文与已审批草稿不一致的条目异常：共 ${diffs.length} 条差异，其中未被重写过的 ${unexplained.length} 条，例：${sample.join('、')}。先报告，不生成修订条目`);
 }
}
export function buildEntries(world,diffs){
 guardDifferences(diffs);
 return diffs.map(d=>({id:`${d.id}-${d.field}`,target:d.id,file:KINDS[d.kind].file,path:[d.field],field:d.field,before:d.before,after:d.after,
  basis:[
   `${d.id}.${d.field} 的正式正文与 journey 流程里已审批的草稿正文不同：草稿在发布之后被重写，并重新经过 L1、L2 与所在批次的 L4（记录 ${d.evidence.record}，指纹 ${d.evidence.fingerprint}）。`,
   '正文新值就是该已审批记录里的草稿，本批不另写正文、不另发 L2；审批核验复用 journey 记录的 L1/L2/L4。'],
  facts:{journey:{revision:journeyRevision,kind:d.kind,record:d.evidence.record,fingerprint:d.evidence.fingerprint,attempts:d.evidence.attempts,l4Rejection:d.evidence.l4Rejection}},
  supersedes:[{receipt:`${d.evidence.record}#${d.id}`,field:d.field}],
  boundary:'只改这一个已审正文字段；同一行的其余字段与其它条目一律不动。新值是 journey 已审批记录里的草稿原文，不新增物品、配方或地点。'}));
}
// 审批核验：journey 记录能被 readApprovedContent 读到（L1/L2/L4 都已过），且每条 after 等于其中已审批的正文。
export async function verifyApproval(entries,world){
 const rows=await approvedDrafts(world);
 for(const e of entries){
  const row=rows.find(r=>r.draft.id===e.target);
  assert.ok(row,`journey 没有已审批记录 ${e.target}`);
  assert.deepEqual(getPath(row.draft,e.path),e.after,`已审批正文与修订条目不符 ${e.id}`);
 }
}
// approved-revisions.mjs 读取回执时复核：装载当前正式世界后同样核验。
export async function verifyFrozen(entries){
 const {loadWorld}=await import('../../tools/load-world.mjs');
 await verifyApproval(entries,await loadWorld());
}
// 本批的候选：已冻结则用冻结值；否则必须由已审批记录现算。
export async function candidateEntries(world){
 const diffs=await differences(world,await approvedDrafts(world));
 return buildEntries(world,diffs);
}

let frozen;
try{frozen=await read(`${root}/candidate.json`);assert.equal(frozen.revision,revision);}catch(error){if(error.code!=='ENOENT')throw error;}
export const frozenEntries=()=>frozen?.entries;
export const run=(args=process.argv.slice(2))=>runRevision({revision,root,CARD,limitYuan:0,frozen,buildEntries:candidateEntries,draftFor,contextFor,validateDraft,applyCandidate,isPublished,
 approval:{via,receipt:journeyRoot,verify:verifyApproval},note:'w3-journey 已审批正文修订：审批证据复用 journey 记录，不花钱。'},args);

// --compare：只读，不写文件、不调模型。审批齐则按已审批记录比；审批未齐则说明阻断原因，并按未核验的原始草稿预览差异（approved:false）。
export async function compare(){
 const {loadWorld}=await import('../../tools/load-world.mjs'),world=await loadWorld();
 let approved=true,blocked=null,rows;
 try{rows=await approvedDrafts(world);}catch(error){approved=false;blocked=error.message;rows=await rawDrafts();}
 const diffs=await differences(world,rows),summary={approved,approvalBlocked:blocked,compared:rows.length,differences:diffs.length,
  rewrittenOnly:diffs.every(d=>d.evidence.rewritten),unexplained:diffs.filter(d=>!d.evidence.rewritten).map(d=>`${d.id}.${d.field}`),
  examples:diffs.slice(0,10).map(d=>({id:d.id,field:d.field,attempts:d.evidence.attempts,l4Rejection:d.evidence.l4Rejection,before:d.before,after:d.after})),modelCalls:0};
 console.log(JSON.stringify(summary,null,1));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv.includes('--compare'))await compare();else await run();
}
