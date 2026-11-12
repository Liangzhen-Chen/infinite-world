// 只读诊断：loc_bs_yupo（或指定聚落）已批记录的指纹，context 哪一项相对批准时变了。只向 stdout 打印 JSON；不写文件、不调模型。
// 用法：node tools/mktw-diag-context.mjs [聚落id，默认 loc_bs_yupo]
// 假设 H1：批准时 context.charter.agriculture 含 initialFood（世界规则 loc_hw 行的 initialFood 被 ledgerSeeds.food 覆盖，键位在 initialHarvestDay 之前），
//   a1b94858（INITFOOD）把它删了，而回执（initfood-1）只取代了 economy.publicStock.food，没取代 context 里的这一项。
// 本脚本：(1) 逐顶层键、charter 逐子键、charter.agriculture 逐字段给出当前哈希，可与旧提交（如 a1b94858^）上同脚本输出逐项比对；
//   (2) 把 initialFood=record 里的 publicStock.food 按原键位插回当前 context，用 record.draft 重算指纹，看是否等于记录指纹。
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {hashContent} from './content-pipeline.mjs';
import {villageProfileCandidates} from '../world/design/w1-village-profiles.mjs';
import {contextFor,revision} from './w1-village-profiles-content.mjs';

const id=process.argv[2]??'loc_bs_yupo',root=path.resolve('world/drafts/w1/village-ledgers');
const world=await loadWorld();
const record=JSON.parse(await fs.readFile(path.join(root,`${id}.json`),'utf8'));
const entry=villageProfileCandidates(world).find(e=>e.id===id);
const context=contextFor(entry,world);
const h=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,hashContent(v)]));
const food=record.draft?.economy?.publicStock?.food;
const withKey=(obj,key,value,before)=>Object.fromEntries(Object.entries(obj).flatMap(([k,v])=>k===before?[[key,value],[k,v]]:[[k,v]]));
const agri=context.charter.agriculture;
const rebuilt={...context,charter:{...context.charter,agriculture:Object.hasOwn(agri,'initialFood')?agri:withKey(agri,'initialFood',food,'initialHarvestDay')}};
const fp=ctx=>hashContent({entry:record.draft,context:ctx,revision});
console.log(JSON.stringify({
 id,revision,recordedFingerprint:record.fingerprint,
 currentAgricultureHasInitialFood:Object.hasOwn(agri,'initialFood'),agricultureKeys:Object.keys(agri),
 contextKeyHashes:h(context),charterKeyHashes:h(context.charter),agricultureFieldHashes:h(agri),
 probes:{
  recordDraftCurrentContext:fp(context)===record.fingerprint,
  recordDraftContextWithInitialFoodRestored:fp(rebuilt)===record.fingerprint,
  restoredInitialFood:food,
 },
},null,1));
