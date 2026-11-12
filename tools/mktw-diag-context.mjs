// 只读诊断：village-ledgers 已批记录（默认 loc_bs_yupo）的指纹，在条目与上下文都按已批回执还原后是否与记录相符。只向 stdout 打印 JSON；不写文件、不调模型。
// 用法：node tools/mktw-diag-context.mjs [聚落id，默认 loc_bs_yupo]
// 还原用的是回执机制本身（readApprovedSupersedes / readApprovedContextSupersedes），不写死任何字段名：
//   entry   = revertReceiptRow(当前生成行, 回执, 条目侧取代声明, 记录 draft 作键序模板)
//   context = revertReceiptContext(当前 contextFor, 回执, 上下文侧取代声明)
// 若上下文侧回执尚未发布（mktw-initialfood-1 未 --publish），改用该批 buildEntries 经 parsePublication 解析出的声明做“模拟”，结果标 simulated:true，用于发布前确认这条回执足以让指纹相符。
// contextKeyHashes 等逐项哈希供与旧提交上同一脚本的输出比对（定位其它未覆盖的变化）。
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {hashContent,recordFingerprint} from './content-pipeline.mjs';
import {readApprovedSupersedes,readApprovedContextSupersedes,revertReceiptRow,revertReceiptContext,parsePublication} from './approved-revisions.mjs';
import {villageProfileCandidates} from '../world/design/w1-village-profiles.mjs';
import {contextFor,revision} from './w1-village-profiles-content.mjs';

const id=process.argv[2]??'loc_bs_yupo',dir='world/drafts/w1/village-ledgers',root=path.resolve(dir),receipt=`${dir}/${id}.json`;
const world=await loadWorld();
const record=JSON.parse(await fs.readFile(path.join(root,`${id}.json`),'utf8'));
const entrySup=(await readApprovedSupersedes()).filter(s=>s.receiptFile.startsWith(`${dir}/`));
let ctxSup=(await readApprovedContextSupersedes()).filter(s=>s.receiptFile.startsWith(`${dir}/`)),simulated=false;
if(!ctxSup.length){
 const {buildEntries}=await import('../world/design/mktw-initialfood-approval.mjs');
 ctxSup=parsePublication({revision:'simulated',receipt:'simulated',entries:(await buildEntries()).map(({id,target,file,field,before,after,supersedes,followedBy})=>({id,target,file,field,before,after,supersedes,followedBy}))});
 simulated=true;
}
const generated=villageProfileCandidates(world).find(e=>e.id===id);
const entry=revertReceiptRow(generated,receipt,entrySup,record.draft);
const rawContext=contextFor(generated,world),context=revertReceiptContext(rawContext,receipt,id,ctxSup);
const h=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,hashContent(v)]));
console.log(JSON.stringify({
 id,revision,recordedFingerprint:record.fingerprint,simulated,entrySupersedes:entrySup.filter(s=>s.receiptFile===receipt).length,contextSupersedes:ctxSup.filter(s=>s.receiptFile===receipt&&s.targetId===id).length,
 matches:recordFingerprint(record,entry,context,revision)===record.fingerprint,
 matchesWithoutContextRevert:recordFingerprint(record,entry,rawContext,revision)===record.fingerprint,
 entryEqualsRecordDraft:hashContent(entry)===hashContent(record.draft),
 contextKeyHashes:h(context),charterKeyHashes:h(context.charter),agricultureFieldHashes:h(context.charter.agriculture),
},null,1));
