// P1 级联修订批，NOT loaded by the game。
// P1（p1-revision-1）把 item_parchment.basePrice 从 12 改成 4（李白/亮圳批准）。按材料成本派生价格的成品没有跟着更新：
// w3-journey 骨架按"材料成本+工费"算出 麻订空白册 37、穿绳皮纸吊签 21，正式世界仍是旧价 61、29（w3 合并保留已有正式行，不会更新）。
// 本批把"依赖 P1 修订的全部派生值"列成同一类修订条目：条目由 tools/derived-cascade.mjs 用派生规则直接算出，不手填数字；
// 流程与 P1 相同（冻结候选 -> L1 -> L2 -> L4 -> 发布 -> 回执 supersedes），共用 p1-revision-approval.mjs 的 runRevision。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {frozenEntries as p1Entries,getPath,setPath,rowOf,runRevision,draftFor,contextFor,validateDraft,applyCandidate,isPublished,revision as p1Revision} from './p1-revision-approval.mjs';
import {cascadeEntries} from '../../tools/derived-cascade.mjs';

export const revision='p1-cascade-1',root='world/drafts/p1-cascade',CARD='P1C';
export {draftFor,contextFor,validateDraft,applyCandidate,isPublished};
const pathLabel=parts=>parts.map(p=>typeof p==='string'?p:`[id=${p.id}]`).join('.').replaceAll('.[','[');

// 上游修订：级联的触发条件。这一批只级联 P1；以后别的修订批要级联，另开一批、另列上游，不改本批。
const parentEntries=()=>{const e=p1Entries();assert.ok(e,'P1 修订批缺少冻结候选');return e;};

export function buildEntries(world,parents=parentEntries()){
 const helpers={getPath,setPath,rowOf};
 return cascadeEntries(world,parents,helpers).map(c=>{
  const d=c.derivation,field=pathLabel(d.path),row=rowOf(world,d.file,c.id),fmt=t=>`${t.materials.map(m=>`${m.item}（${m.price} 文）x${m.amount}`).join(' + ')} + 工费 ${t.labor} = ${t.price}`;
  const triggers=parents.filter(p=>p.target!==c.id).map(p=>({revision:p1Revision,id:p.id,target:p.target,field:p.field,before:p.before,after:p.after}));
  const used=new Set(c.trace.materials.map(m=>m.item));
  return {id:`${c.id}-${field}`,target:c.id,file:d.file,path:d.path,field,before:c.before,after:c.after,
   basis:[
    `派生规则（${d.rule}）：${d.name}。正式 ${c.id}.${field} 是 ${c.before}，是上游修订前按规则算出的价格（${fmt(c.oldTrace)}）。`,
    `上游修订 ${p1Revision} 已发布并经审批：${triggers.filter(t=>used.has(t.target)).map(t=>`${t.target}.${t.field} ${t.before} -> ${t.after}`).join('；')}。本件材料含这些物品，按同一规则重算为 ${c.after}（${fmt(c.trace)}）。`,
    '数值由规则直接算出，不是手填：级联条目的 after 等于派生规则在修订后世界上的输出。'],
   facts:{rule:{name:d.name,source:d.rule,formula:'价格 = sum(材料现价 x 用量) + 工费'},upstream:triggers.filter(t=>used.has(t.target)),product:{id:row.id,name:row.name,basePrice:row.basePrice},before:c.oldTrace,after:c.trace},
   supersedes:[{receipt:`${d.designSource}#${c.id}`,field}],
   boundary:'只改这一个由规则派生的字段；同一行的其余字段、说明文字与其它物品、配方一律不动。改动值由派生规则算出，不新增物品、配方或地点。'};
 });
}

let frozen;
try{frozen=JSON.parse(await fs.readFile(`${root}/candidate.json`,'utf8'));assert.equal(frozen.revision,revision);}catch(error){if(error.code!=='ENOENT')throw error;}
export const frozenEntries=()=>frozen?.entries;
export const run=(args=process.argv.slice(2))=>runRevision({revision,root,CARD,limitYuan:0.02,frozen,buildEntries,draftFor,contextFor,validateDraft,applyCandidate,isPublished,
 note:'P1 级联修订：依赖 P1 修订的派生价，单卡上限 0.02 元（需李白批准后才跑 --review）。'},args);
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
