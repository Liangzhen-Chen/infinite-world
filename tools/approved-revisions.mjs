// 已审批修订回执（supersedes）的通用读取与应用。
// 修订批（如 P1）发布后，publication.json 为每条改动登记了它取代的设计源值（supersedes：receipt 为 `文件#条目id`，field 为字段路径）。
// 消费设计源的检查与合并（w3-wave-score 的 publishedW3、w5-sites 的 mergeSites）必须经此读取，把设计源值更新为已审批的修订值，
// 不能各自写死某条目、某字段。只认通过审批核验的回执；回执格式不合法一律报错。
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {readApprovedContent,hashContent} from './content-pipeline.mjs';
import {getPath,setPath} from '../world/design/p1-revision-approval.mjs';

// 字段路径文本 -> 路径：`site.resources[id=adit_ore].item` -> ['site','resources',{id:'adit_ore'},'item']
export function parseFieldPath(label){
 if(typeof label!=='string'||!label)throw new Error('回执字段路径为空');
 const parts=[];let at=0;
 for(const m of label.matchAll(/\.?([A-Za-z0-9_]+)|\[id=([^\]\s]+)\]/g)){
  if(m.index!==at)throw new Error(`回执字段路径无法解析：${label}`);
  parts.push(m[1]!==undefined?m[1]:{id:m[2]});at=m.index+m[0].length;
 }
 if(!parts.length||at!==label.length||typeof parts[0]!=='string')throw new Error(`回执字段路径无法解析：${label}`);
 return parts;
}
// 校验 publication.json 的格式；返回其中指向“设计源文件#条目”的取代声明（commit 回执与括号说明不改值，不在此列）。
export function parsePublication(pub){
 const bad=m=>{throw new Error(`修订回执格式不合法：${m}`);};
 if(!pub||typeof pub!=='object'||typeof pub.revision!=='string'||!pub.revision||typeof pub.receipt!=='string'||!pub.receipt||!Array.isArray(pub.entries))bad('缺少 revision/receipt/entries');
 const out=[];
 for(const e of pub.entries){
  if(!e||typeof e.id!=='string'||typeof e.target!=='string'||typeof e.file!=='string'||typeof e.field!=='string'||!('before'in e)||!('after'in e))bad(`条目缺字段 ${e?.id}`);
  if(!Array.isArray(e.supersedes)||!e.supersedes.length)bad(`条目没有取代声明 ${e.id}`);
  for(const s of e.supersedes){
   if(!s||typeof s.receipt!=='string'||typeof s.field!=='string'||!s.field)bad(`取代声明缺 receipt/field ${e.id}`);
   // 括号字段是说明（该处文字不变，没有值被取代）；commit 回执不是设计源文件。
   if(/^\(.*\)$/.test(s.field)||/^commit [0-9a-f]{7,40}\b/.test(s.receipt))continue;
   const m=/^([^\s#]+)#([^\s#]+)$/.exec(s.receipt);if(!m)bad(`receipt 须为“文件#条目”或“commit 提交号”：${s.receipt}`);
   if(m[2]!==e.target)bad(`取代声明的条目与修订目标不同：${s.receipt} / ${e.target}`);
   if(s.field!==e.field)bad(`取代声明的字段与修订字段不同：${s.field} / ${e.field}`);
   out.push({revision:pub.revision,entryId:e.id,receiptFile:m[1],targetId:m[2],label:s.field,parts:parseFieldPath(s.field),before:e.before,after:e.after});
  }
 }
 return out;
}
// 已发布的修订批：约定每批的目录 world/drafts/<批目录>/ 下有 publication.json（发布回执）与 candidate.json（冻结候选，含 entries/drafts/contexts）。
// 不点名批次：凡有 publication.json 且是修订批格式（有 candidate.json，两者 revision 相同，条目带 supersedes）的目录都算；
// 回执文件格式不合法一律报错。新增修订批（如级联批）发布后自动被读取。
export async function listRevisionBatches(draftsRoot='world/drafts'){
 const out=[];
 for(const dir of (await fs.readdir(draftsRoot,{withFileTypes:true})).filter(d=>d.isDirectory()).map(d=>d.name).sort()){
  const root=`${draftsRoot}/${dir}`;
  if(!existsSync(`${root}/publication.json`))continue;
  const pub=JSON.parse(await fs.readFile(`${root}/publication.json`,'utf8'));
  if(!Array.isArray(pub?.entries)||!pub.entries.length||!pub.entries.every(e=>Array.isArray(e?.supersedes)))continue; // 非修订批（如 m2-people 的发布回执）
  // 修订批格式的回执缺冻结候选：无法核验审批，不得静默忽略（误删或篡改 candidate.json 会让回执失效而不报错）。
  if(!existsSync(`${root}/candidate.json`))throw Error(`修订批 ${dir} 有发布回执却缺 candidate.json，无法核验`);
  out.push({root,pub});
 }
 return out;
}
// 以复用已审批记录为审批证据的修订批（candidate.json 的 approval.via）：来源模块须导出 verifyFrozen(entries)，
// 核验每条 after 等于该来源里已审批（L1/L2/L4 通过）的正文；动态导入以免循环依赖。
export const APPROVAL_SOURCES={
 'w3-journey-text':()=>import('../world/design/w3-journey-text-revision.mjs'),
 'w3-trades-text':()=>import('../world/design/w3-trades-text-revision.mjs'),
};
// 读取并核验已审批的修订回执。审批状态不是一个字段，而是回执目录的 L1/L2/L4 记录：
// 用冻结候选逐条核对指纹、L2 无 hard、L4 已批，再核对 publication.json 与冻结候选逐字段相同。逐批核验，全部通过才返回。
export async function readApprovedBatch({root,pub}){
 const supersedes=parsePublication(pub);
 const candidate=JSON.parse(await fs.readFile(`${root}/candidate.json`,'utf8')),frozen=candidate.entries;
 if(!Array.isArray(frozen)||!frozen.length)throw new Error(`修订回执缺少冻结候选，无法核验审批：${root}`);
 if(pub.revision!==candidate.revision)throw new Error(`修订回执版本不符：${pub.revision} / ${candidate.revision}`);
 // 冻结候选里记的正文与上下文就是审批时的原件；正文须等于由条目导出的标准形状。
 const draftOf=e=>({id:e.id,target:e.target,field:e.field,value:e.after}),ctxById=new Map(frozen.map((e,i)=>[e.id,candidate.contexts?.[i]]));
 if(frozen.some(e=>!ctxById.get(e.id)))throw new Error(`冻结候选缺少上下文：${root}`);
 const contextFor=e=>ctxById.get(e.id);
 if(candidate.approval){
  // 复用别处已审批的记录（如 w3-journey 正文修订批）：本批没有自己的 L2/L4，审批证据是那份记录的 L1/L2/L4；登记表里找不到来源一律报错。
  const verifier=APPROVAL_SOURCES[candidate.approval.via];
  if(!verifier)throw new Error(`修订回执的审批来源未登记：${candidate.approval.via}`);
  await(await verifier()).verifyFrozen(frozen);
 }else{
  const approved=await readApprovedContent(pub.receipt,frozen,{revision:pub.revision,contextFor});
  assert.equal(approved.length,frozen.length,`修订回执未全批通过审批：${pub.revision}`);
  for(const e of frozen)assert.deepEqual(approved.find(d=>d.id===e.id),draftOf(e),`已审批正文与候选不符：${e.id}`);
 }
 const key=e=>hashContent({id:e.id,target:e.target,file:e.file,field:e.field,before:e.before,after:e.after,supersedes:e.supersedes});
 assert.deepEqual(pub.entries.map(key),frozen.map(key),`publication.json 与已审批候选不一致：${pub.revision}`);
 return supersedes;
}
export async function readApprovedSupersedes(draftsRoot='world/drafts'){
 const batches=await listRevisionBatches(draftsRoot),out=[];
 for(const b of batches)out.push(...await readApprovedBatch(b));
 return out;
}
// 把设计源行（按 id 找）上被取代的值更新为已审批的修订值。rows 由调用者先克隆；返回实际更新的条目（供审计与语料哈希回退）。
// 设计源值既不是回执的 before 也不是 after，说明设计源与回执对不上，报错而不是放过。
export function applySupersedes(rows,receiptFile,supersedes){
 const applied=[];
 for(const s of supersedes){
  if(s.receiptFile!==receiptFile)continue;
  const row=rows.find(r=>r.id===s.targetId);if(!row)continue;
  const cur=getPath(row,s.parts);
  if(hashContent(cur??null)===hashContent(s.before)){setPath(row,s.parts,s.after);applied.push({id:s.targetId,field:s.label,parts:s.parts,before:s.before,after:s.after,receiptFile,revision:s.revision});}
  else if(hashContent(cur??null)!==hashContent(s.after))throw new Error(`设计源值与修订回执不符：${receiptFile}#${s.targetId} ${s.label} 现值 ${JSON.stringify(cur)}，回执 before ${JSON.stringify(s.before)} after ${JSON.stringify(s.after)}`);
 }
 return applied;
}

// ---------------------------------------------------------------- 已审叠加层登记表
// 设计源（骨架）发布之后，后续已审批的层会给正式条目叠加字段（用途标签、容量……）。
// 消费方不点名具体的叠加批：只遍历下面的登记表。登记表只收录“已有审批记录、verifyPublished 能通过”的叠加层；
// 登记了但核验不通过一律报错。没有审批记录的变化（如 clay_oil_lamp 的 lifecycle）不得登记，照实判为无来源。
// 每项经 load() 给出统一接口：{revision, fields:{<字段名>:{<物品id>:取值}}, verifyPublished}。
// 各审批模块的导出形状不同，在这一层适配；审批模块与其审批数据不改。
export const APPROVED_OVERLAYS=[
 {name:'a3w-props',load:async()=>{const m=await import('../world/design/a3w-props-approval.mjs');return{revision:m.revision,fields:{tags:m.sources},verifyPublished:()=>m.verifyPublished()};}},
 {name:'a3cap-data',load:async()=>{const m=await import('../world/design/a3cap-data-approval.mjs');return{revision:m.revision,fields:{capacityMl:m.capacities},verifyPublished:()=>m.verifyPublished()};}},
];
// 加载并核验一层；核验不通过抛错（不当作“没有来源”）。同一登记表内只核验一次。
function overlayLoader(registry){
 const cache=new Map();
 return overlay=>{
  if(!cache.has(overlay))cache.set(overlay,(async()=>{
   const layer=await overlay.load();
   try{await layer.verifyPublished();}catch(error){throw new Error(`已审叠加层 ${overlay.name}（${layer.revision}）核验不通过：${error.message}`);}
   return layer;
  })());
  return cache.get(overlay);
 };
}
// 标签来源：只有已审叠加层。返回 {source} 或 null（无来源）。
export function createTagSourceResolver({registry=APPROVED_OVERLAYS}={}){
 const loadLayer=overlayLoader(registry);
 return async(item,tag)=>{
  for(const overlay of registry){
   const layer=await loadLayer(overlay);
   if(layer.fields.tags?.[item.id]?.includes(tag))return{source:`${overlay.name} 已审叠加层（revision ${layer.revision}）`};
  }
  return null;
 };
}
// 语料哈希回退用：叠加层写入的标量字段（非 tags）。条目当前值等于叠加层登记值才算已归因；先核验该层。
export async function overlayFieldReverts(entries,{registry=APPROVED_OVERLAYS}={}){
 const loadLayer=overlayLoader(registry),out=[];
 for(const overlay of registry){
  const probe=await overlay.load();
  for(const field of Object.keys(probe.fields).filter(f=>f!=='tags')){
   const hit=entries.filter(x=>Object.hasOwn(probe.fields[field],x.id)&&JSON.stringify(x.entity[field])===JSON.stringify(probe.fields[field][x.id]));
   if(!hit.length)continue;
   const layer=await loadLayer(overlay);
   for(const x of hit)out.push({id:x.id,parts:[field],remove:true,source:`${overlay.name} 已审叠加层（revision ${layer.revision}）：${field}`});
  }
 }
 return out;
}
