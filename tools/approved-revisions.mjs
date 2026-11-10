// 已审批修订回执（supersedes）的通用读取与应用。
// 修订批（如 P1）发布后，publication.json 为每条改动登记了它取代的设计源值（supersedes：receipt 为 `文件#条目id`，field 为字段路径）。
// 消费设计源的检查与合并（w3-wave-score 的 publishedW3、w5-sites 的 mergeSites）必须经此读取，把设计源值更新为已审批的修订值，
// 不能各自写死某条目、某字段。只认通过审批核验的回执；回执格式不合法一律报错。
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {readApprovedContent,hashContent} from './content-pipeline.mjs';
import {deriveItemAttributes} from '../server-plugin/item-class.mjs';
import {revision as p1Revision,root as p1Root,frozenEntries,draftFor,contextFor,getPath,setPath} from '../world/design/p1-revision-approval.mjs';

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
   out.push({entryId:e.id,receiptFile:m[1],targetId:m[2],label:s.field,parts:parseFieldPath(s.field),before:e.before,after:e.after});
  }
 }
 return out;
}
// 读取并核验已审批的修订回执。审批状态不是一个字段，而是回执目录的 L1/L2/L4 记录：
// 用冻结候选逐条核对指纹、L2 无 hard、L4 已批，再核对 publication.json 与冻结候选逐字段相同。
export async function readApprovedSupersedes(){
 const pub=JSON.parse(await fs.readFile(`${p1Root}/publication.json`,'utf8')),supersedes=parsePublication(pub);
 const frozen=frozenEntries();if(!frozen)throw new Error('修订回执缺少冻结候选，无法核验审批');
 if(pub.revision!==p1Revision)throw new Error(`修订回执版本不符：${pub.revision}`);
 const approved=await readApprovedContent(pub.receipt,frozen,{revision:p1Revision,contextFor});
 assert.equal(approved.length,frozen.length,'修订回执未全批通过审批');
 for(const e of frozen)assert.deepEqual(approved.find(d=>d.id===e.id),draftFor(e),`已审批正文与候选不符：${e.id}`);
 const key=e=>hashContent({id:e.id,target:e.target,file:e.file,field:e.field,before:e.before,after:e.after,supersedes:e.supersedes});
 assert.deepEqual(pub.entries.map(key),frozen.map(key),'publication.json 与已审批候选不一致');
 return supersedes;
}
// 把设计源行（按 id 找）上被取代的值更新为已审批的修订值。rows 由调用者先克隆；返回实际更新的条目（供审计与语料哈希回退）。
// 设计源值既不是回执的 before 也不是 after，说明设计源与回执对不上，报错而不是放过。
export function applySupersedes(rows,receiptFile,supersedes){
 const applied=[];
 for(const s of supersedes){
  if(s.receiptFile!==receiptFile)continue;
  const row=rows.find(r=>r.id===s.targetId);if(!row)continue;
  const cur=getPath(row,s.parts);
  if(hashContent(cur??null)===hashContent(s.before)){setPath(row,s.parts,s.after);applied.push({id:s.targetId,field:s.label,parts:s.parts,before:s.before,after:s.after,receiptFile,revision:p1Revision});}
  else if(hashContent(cur??null)!==hashContent(s.after))throw new Error(`设计源值与修订回执不符：${receiptFile}#${s.targetId} ${s.label} 现值 ${JSON.stringify(cur)}，回执 before ${JSON.stringify(s.before)} after ${JSON.stringify(s.after)}`);
 }
 return applied;
}

// ---------------------------------------------------------------- 已审叠加层
// 设计源（骨架）发布之后，后续已审批的层会给正式条目叠加字段（用途标签、容量……）。
// 叠加层的多出内容必须能指到某个已审批层的记录；指不到来源的多出内容仍然报错。
// 来源只有两类：
//   1 已审批叠加批的记录（a3w-props 的用途标签；经该批 verifyPublished 核验回执）；
//   2 规则层派生：水分>0 且饱腹为 0 的物品按 validateDrinkable（server-plugin/item-class.mjs）必须带 drinkable，标签由规则推出，没有逐条审批记录。
// 来源核验按需惰性执行，核验失败则视为没有来源并带上失败原因。
export function createTagSourceResolver({world,verifyPropsLayer=async()=>{const m=await import('../world/design/a3w-props-approval.mjs');await m.verifyPublished();return m.sources;}}){
 let layer,derived;const load=()=>layer??=verifyPropsLayer().then(sources=>({sources}),error=>({error:error.message}));
 // 派生属性（水分、饱腹）在运行时由 deriveItemAttributes 给出，已载入的世界行上没有；在副本上派生一次，与 validateDrinkable 同一口径。
 const derive=id=>{if(!derived){const w=structuredClone(world);deriveItemAttributes(w);derived=new Map(w.items.map(i=>[i.id,i.nutrientContent]));}return derived.get(id);};
 return async(item,tag)=>{
  if(tag==='drinkable'){const n=derive(item.id);if((n?.hydration??0)>0&&(n?.satiety??0)===0)return{source:'规则层 validateDrinkable：派生水分>0且饱腹0的物品必须带 drinkable（无逐条审批记录）'};}
  const l=await load();
  if(l.error)return{error:`a3w-props 回执核验失败：${l.error}`};
  return l.sources[item.id]?.includes(tag)?{source:`a3w-props 已审叠加层（revision a3w-props-1）`}:null;
 };
}
