// w3 已审批正文修订批的通用实现，NOT loaded by the game。
// journey 与行当（trades）两批的正文都可能在发布之后被重写（L1 新规则、L4 退回、人工改写），而现有发布工具更新不了 world/meta 里的正式正文。
// 本模块把"比较已审批草稿与正式正文 -> 授权清单把关 -> 生成修订条目 -> 核验审批"这套机制抽成配置：
// cfg={revision,root,CARD,via,label,factsKey,sourceRoot,sourceRevision,KINDS,bonesOf,contextOf,frozen,note}，各批只提供自己的根目录、骨架函数、上下文、revision 与授权清单路径。
// 审批核验复用来源流水线的记录（readApprovedContent：L1 + L2 + 所在批次 L4 都已过）；本批不另写正文、不另发 L2、不花钱。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {runRevision,getPath,draftFor,contextFor,validateDraft,applyCandidate,isPublished} from './p1-revision-approval.mjs';
import {readApprovedContent,approvalIncomplete} from '../../tools/content-pipeline.mjs';

export const readJSON=async file=>JSON.parse(await fs.readFile(file,'utf8'));
// 已冻结的候选（--prepare 写下的 candidate.json）；不存在则为 undefined。
export async function loadFrozen(root,revision){
 try{const frozen=await readJSON(`${root}/candidate.json`);assert.equal(frozen.revision,revision);return frozen;}
 catch(error){if(error.code!=='ENOENT')throw error;}
}
export function makeTextRevision(cfg){
 const {revision,root,CARD,via,label,factsKey,sourceRoot,sourceRevision,KINDS,bonesOf,contextOf,frozen,note}=cfg;
 // 停止规则：只有授权清单里的条目 id 才能生成修订条目。清单 {approvedBy,ref,at,ids} 由主会话按李白的批复写在 ${root}/authorization.json，本工具不写它。
 // 有差异但不在清单里：停下，报数量与例子，不生成任何条目；在清单里但没有差异：照实列出，不报错；清单缺失或格式不对：报错。
 const authorizationFile=`${root}/authorization.json`;
 // 已审批的草稿：readApprovedContent 要求批次 L4 已批、指纹一致、L2 无 hard；任何一项不满足即抛错。
 async function approvedDrafts(world){
  const bones=await bonesOf(world),out=[];
  for(const kind of Object.keys(KINDS)){
   const rows=await readApprovedContent(`${sourceRoot}/${kind}`,bones[kind],{contextFor:e=>contextOf(world,bones,e),revision:sourceRevision});
   if(rows.length!==bones[kind].length)throw approvalIncomplete(`${label}/${kind} 仍有条目未通过审批`);
   out.push(...rows.map(draft=>({kind,draft})));
  }
  return out;
 }
 // 未核验审批的原始草稿（只供 --compare 在审批未齐时预览差异；绝不用于生成条目）。
 async function rawDrafts(){
  const out=[];
  for(const kind of Object.keys(KINDS)){
   const dir=`${sourceRoot}/${kind}`;
   for(const name of (await fs.readdir(dir)).filter(n=>n.endsWith('.json')&&!/^(batch-\d+|summary)\.json$/.test(n)).sort()){
    const record=await readJSON(`${dir}/${name}`);
    if(record.status==='passed'&&record.draft)out.push({kind,draft:record.draft});
   }
  }
  return out;
 }
 // 差异：对每个条目的每个正文字段，已审批草稿值与正式值不同则一条。
 async function differences(world,rows,recordOf=(kind,id)=>readJSON(`${sourceRoot}/${kind}/${id}.json`)){
  const out=[];
  for(const {kind,draft} of rows)for(const field of KINDS[kind].fields){
   const official=world[kind].find(x=>x.id===draft.id);
   assert.ok(official,`正式文件缺少 ${label} 条目 ${draft.id}`);
   if(JSON.stringify(official[field])===JSON.stringify(draft[field]))continue;
   const record=await recordOf(kind,draft.id);
   out.push({kind,id:draft.id,field,before:official[field],after:draft[field],evidence:{record:`${sourceRoot}/${kind}/${draft.id}.json`,fingerprint:record.fingerprint,attempts:record.attempts,l4Rejection:record.l4Rejection!==undefined}});
  }
  return out;
 }
 // 清单文件不存在按“审批未齐”处理（approvalIncomplete，只读入口以明确原因退出）；内容读不出或格式不对仍是普通错误。
 async function readAuthorization(file=authorizationFile){
  let a;
  try{a=await readJSON(file);}catch(error){const message=`缺少或无法读取授权清单 ${file}：${error.message}`;throw error.code==='ENOENT'?approvalIncomplete(message):new Error(message);}
  const text=v=>typeof v==='string'&&v.length>0;
  if(!a||typeof a!=='object'||!text(a.approvedBy)||!text(a.ref)||!text(a.at)||!Array.isArray(a.ids)||!a.ids.every(text)||new Set(a.ids).size!==a.ids.length)
   throw new Error(`授权清单格式不对（须为 {approvedBy,ref,at,ids:[条目 id，不重复]}）：${file}`);
  return a;
 }
 // 有差异但不在清单里的条目：停下并报数量与例子，不生成任何条目。返回清单里没有差异的 id（照实列出，不报错）。
 function guardDifferences(diffs,auth){
  const allowed=new Set(auth.ids),unlisted=diffs.filter(d=>!allowed.has(d.id));
  if(unlisted.length){
   const ids=[...new Set(unlisted.map(d=>d.id))];
   throw new Error(`有 ${unlisted.length} 处差异（${ids.length} 个条目）不在授权清单里，例：${unlisted.slice(0,5).map(d=>`${d.id}.${d.field}`).join('、')}。先报告，不生成任何修订条目`);
  }
  const differing=new Set(diffs.map(d=>d.id));
  return auth.ids.filter(id=>!differing.has(id));
 }
 function buildEntries(world,diffs,auth){
  guardDifferences(diffs,auth);
  return diffs.map(d=>({id:`${d.id}-${d.field}`,target:d.id,file:KINDS[d.kind].file,path:[d.field],field:d.field,before:d.before,after:d.after,
   basis:[
    `${d.id}.${d.field} 的正式正文与 ${label} 流程里已审批的草稿正文不同：该条目在授权清单里（${auth.approvedBy}，${auth.ref}，${auth.at}），其草稿已经 L1、L2 与所在批次的 L4（记录 ${d.evidence.record}，指纹 ${d.evidence.fingerprint}）。`,
    `正文新值就是该已审批记录里的草稿，本批不另写正文、不另发 L2；审批核验复用 ${label} 记录的 L1/L2/L4。`],
   facts:{[factsKey]:{revision:sourceRevision,kind:d.kind,record:d.evidence.record,fingerprint:d.evidence.fingerprint,attempts:d.evidence.attempts,l4Rejection:d.evidence.l4Rejection},authorization:{approvedBy:auth.approvedBy,ref:auth.ref,at:auth.at}},
   supersedes:[{receipt:`${d.evidence.record}#${d.id}`,field:d.field}],
   boundary:`只改这一个已审正文字段；同一行的其余字段与其它条目一律不动。新值是 ${label} 已审批记录里的草稿原文，不新增物品、配方或地点。`}));
 }
 // 审批核验：来源记录能被 readApprovedContent 读到（L1/L2/L4 都已过），且每条 after 等于其中已审批的正文。
 // 每条的 file、path 还须等于该条目所属类型（items 或 recipes）的文件与正文字段，不得借修订批改别的字段。
 async function verifyApproval(entries,world,loadApproved=approvedDrafts){
  const rows=await loadApproved(world);
  for(const e of entries){
   const row=rows.find(r=>r.draft.id===e.target);
   assert.ok(row,`${label} 没有已审批记录 ${e.target}`);
   const kind=KINDS[row.kind];
   assert.equal(e.file,kind.file,`修订条目的文件不是 ${row.kind} 的正式文件 ${e.id}`);
   assert.ok(Array.isArray(e.path)&&e.path.length===1&&kind.fields.includes(e.path[0]),`修订条目的字段不是 ${row.kind} 的正文字段 ${e.id}`);
   assert.deepEqual(getPath(row.draft,e.path),e.after,`已审批正文与修订条目不符 ${e.id}`);
  }
 }
 // approved-revisions.mjs 读取回执时复核：装载当前正式世界后同样核验。
 async function verifyFrozen(entries){
  const {loadWorld}=await import('../../tools/load-world.mjs');
  await verifyApproval(entries,await loadWorld());
 }
 // 本批的候选：已冻结则用冻结值；否则必须由已审批记录现算。
 async function candidateEntries(world,file=authorizationFile){
  const auth=await readAuthorization(file),diffs=await differences(world,await approvedDrafts(world));
  return buildEntries(world,diffs,auth);
 }
 const run=(args=process.argv.slice(2))=>runRevision({revision,root,CARD,limitYuan:0,frozen,buildEntries:candidateEntries,draftFor,contextFor,validateDraft,applyCandidate,isPublished,
  approval:{via,receipt:sourceRoot,verify:verifyApproval},note},args);
 // --compare：只读，不写文件、不调模型。审批齐则按已审批记录比；审批未齐则说明阻断原因，并按未核验的原始草稿预览差异（approved:false）。
 async function compare(){
  const auth=await readAuthorization().catch(error=>({error:error.message}));
  const {loadWorld}=await import('../../tools/load-world.mjs'),world=await loadWorld();
  let approved=true,blocked=null,rows;
  try{rows=await approvedDrafts(world);}catch(error){approved=false;blocked=error.message;rows=await rawDrafts();}
  const diffs=await differences(world,rows),allowed=new Set(auth.ids??[]);
  const summary={approved,approvalBlocked:blocked,compared:rows.length,differences:diffs.length,authorization:auth.error?{error:auth.error}:{approvedBy:auth.approvedBy,ref:auth.ref,ids:auth.ids.length},
   unlisted:diffs.filter(d=>!allowed.has(d.id)).map(d=>d.id+'.'+d.field),listedWithoutDifference:auth.error?null:auth.ids.filter(id=>!diffs.some(d=>d.id===id)),
   examples:diffs.slice(0,10).map(d=>({id:d.id,field:d.field,attempts:d.evidence.attempts,l4Rejection:d.evidence.l4Rejection,before:d.before,after:d.after})),modelCalls:0};
  console.log(JSON.stringify(summary,null,1));
 }
 return{revision,root,CARD,via,KINDS,authorizationFile,approvedDrafts,rawDrafts,differences,readAuthorization,guardDifferences,buildEntries,verifyApproval,verifyFrozen,candidateEntries,frozenEntries:()=>frozen?.entries,run,compare};
}
