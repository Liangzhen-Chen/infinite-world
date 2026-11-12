// 只读诊断：loc_bs_yupo 已批记录的指纹为什么与当前输入不符。只向 stdout 打印 JSON；不写文件、不调模型。
// 用法：node tools/mktw-diag-fingerprint.mjs [聚落id，默认 loc_bs_yupo]
// recordFingerprint = hash({entry: projectEntryForRecord(entry, record), context, revision})。已批记录里的 draft 就是审批时的 entry
// （人工骨架：L1 要求 hash(draft) == hash(entry)），所以：
//   entryDiff   = 当前 entry（经修订回执还原后）与 record.draft 的逐字段差异；
//   contextKeys = 当前 context 各顶层键的哈希（审批时的 context 没存档，这里只列当前值，便于与 git 历史上的同一输出比对）；
//   probes      = 分别用 record.draft 与当前 entry、当前 context 重算指纹，与记录里的指纹比，判断变化来自 entry 还是 context。
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {hashContent,projectEntryForRecord,recordFingerprint} from './content-pipeline.mjs';
import {readApprovedSupersedes,revertReceiptRow} from './approved-revisions.mjs';
import {villageProfileCandidates} from '../world/design/w1-village-profiles.mjs';
import {contextFor,revision} from './w1-village-profiles-content.mjs';

const id=process.argv[2]??'loc_bs_yupo',root=path.resolve('world/drafts/w1/village-ledgers');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// 逐字段（递归）差异：路径 → {recorded, current}；对象键顺序不同也单独报告（JSON.stringify 对键序敏感，指纹也是）。
function diff(recorded,current,at='',out=[]){
 const obj=v=>v&&typeof v==='object';
 if(!obj(recorded)||!obj(current)||Array.isArray(recorded)!==Array.isArray(current)){if(!same(recorded,current))out.push({path:at||'(root)',recorded,current});return out;}
 const keys=new Set([...Object.keys(recorded),...Object.keys(current)]);
 for(const k of keys){
  if(!(k in recorded))out.push({path:`${at}.${k}`,recorded:'(缺)',current:current[k]});
  else if(!(k in current))out.push({path:`${at}.${k}`,recorded:recorded[k],current:'(缺)'});
  else diff(recorded[k],current[k],`${at}.${k}`,out);
 }
 if(!Array.isArray(recorded)&&same([...keys].filter(k=>k in recorded&&k in current),Object.keys(recorded).filter(k=>k in current))&&!same(Object.keys(recorded).filter(k=>k in current),Object.keys(current).filter(k=>k in recorded)))out.push({path:`${at}(键序)`,recorded:Object.keys(recorded),current:Object.keys(current)});
 return out;
}
const world=await loadWorld();
const record=JSON.parse(await fs.readFile(path.join(root,`${id}.json`),'utf8'));
const supersedes=(await readApprovedSupersedes()).filter(s=>s.receiptFile.startsWith('world/drafts/w1/village-ledgers/'));
const generated=villageProfileCandidates(world).find(e=>e.id===id);
const reverted=revertReceiptRow(generated,`world/drafts/w1/village-ledgers/${id}.json`,supersedes);
const context=contextFor(generated,world);
const projected=projectEntryForRecord(reverted,record);
console.log(JSON.stringify({
 id,revision,recordedFingerprint:record.fingerprint,skeletonFields:record.skeletonFields??null,
 supersedesApplied:supersedes.filter(s=>s.targetId===id).map(s=>({revision:s.revision,label:s.label,before:s.before,after:s.after})),
 entryDiffGeneratedVsRecordDraft:diff(record.draft,generated),
 entryDiffRevertedVsRecordDraft:diff(record.draft,projected),
 contextKeyHashes:Object.fromEntries(Object.entries(context).map(([k,v])=>[k,hashContent(v)])),
 probes:{
  currentEntryCurrentContext:recordFingerprint(record,reverted,context,revision),
  recordDraftCurrentContext:hashContent({entry:projectEntryForRecord(record.draft,record),context,revision}),
  matchesRecordedWithCurrentEntry:recordFingerprint(record,reverted,context,revision)===record.fingerprint,
  matchesRecordedWithRecordDraft:hashContent({entry:projectEntryForRecord(record.draft,record),context,revision})===record.fingerprint,
 },
},null,1));
