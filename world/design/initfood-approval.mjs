// INITFOOD 修订批，NOT loaded by the game。
// 市场卡（MKTW ①b）删掉了运行时写死的 initialFood 与开局存粮，开局存粮改为“目标持有”规律推导（server-plugin/agriculture-migration.mjs openingFood）：
//   开局存粮 = min(ceil(餐口 × (距下次收获天数 + reserveDays)), 粮仓容量 − 种粮)。
// 已发布的村级公共仓登记（world/geo/settlements.json 各村 details.economy.publicStock.food）仍是旧手写值。派生优先：本批把这个字段整条删除（REMOVE），
// 不把推导值抄进数据（那是把运行时规律冻结成手填数）。它的读者改读同一条规律：
//   - server-plugin/settlement-profile.mjs 的公开聚落资料（“公共仓期初库存”文本）：登记里没有 food 时按 openingFood 推导；
//   - tests/village-ledgers.test.mjs、tests/catalog.test.mjs 的期望按规律手推。
// 清单 12 行 = 4 个村 × 3 处（正式 settlements.json、w1 village-ledgers 的分件回执、同一批的 candidate.json）。
// 回执（分件与 candidate.json）是已批准的审批记录，不被改写（改了会使其指纹失效）；本批只改正式文件的 4 个值，
// 每条 supersedes 同时登记这两处回执（回执一侧的字段路径没有 details 前缀，见 approved-revisions.mjs parsePublication 的后缀规则）。
// 流程与 WATER-1D 相同（冻结候选 -> L1 -> L2 -> L4 -> 发布 -> 回执 supersedes），共用 p1-revision-approval.mjs 的 runRevision。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {approvalIncomplete,reportApprovalIncomplete} from '../../tools/content-pipeline.mjs';
import {REMOVE,rowOf,runRevision,draftFor,contextFor,validateDraft,applyCandidate,isPublished} from './p1-revision-approval.mjs';

export const revision='initfood-1',root='world/drafts/initfood',CARD='INITFOOD';
// 本批的预算与次数上限（硬上限，到上限流水线自动停，不得续跑）。
export const LIMIT_YUAN=0.3,MAX_REQUESTS=40;
export const FILE='world/geo/settlements.json',PATH=['details','economy','publicStock','food'],FIELD='details.economy.publicStock.food';
// 回执一侧的字段路径（草稿行没有 details 前缀）。
export const RECEIPT_FIELD='economy.publicStock.food',RECEIPT_DIR='world/drafts/w1/village-ledgers';
export {draftFor,contextFor,validateDraft,applyCandidate,isPublished};

export async function buildEntries(world){
 const rows=world.settlementProfiles.filter(r=>typeof r.details?.economy?.publicStock?.food==='number');
 assert.ok(rows.length>0,'没有带登记公仓初粮的聚落');
 const rule={law:'开局存粮 = min(ceil(餐口 × (距下次收获天数 + reserveDays)), 粮仓容量 − 种粮)',source:'server-plugin/agriculture-migration.mjs openingFood、primitives-body.mjs farmTargetDays',
  readers:['server-plugin/settlement-profile.mjs（公开聚落资料，登记里没有 food 时按 openingFood 推导）','tests/village-ledgers.test.mjs','tests/catalog.test.mjs']};
 return rows.map(r=>{
  const before=rowOf(world,FILE,r.id).details.economy.publicStock.food;
  return {id:`${r.id}-${FIELD}`,target:r.id,file:FILE,path:PATH,field:FIELD,before,after:REMOVE,
   basis:[
    `MKTW ①b 之后运行时开局存粮由目标持有规律推导，不再有登记的初粮：${rule.law}（${rule.source}）。`,
    `${r.id}：登记的 publicStock.food ${before} 没有出处，与运行时推导值不一致；派生优先，整条删除该字段，不把推导值抄回数据。`,
    '公开聚落资料原先直接读这个字段，现已改读同一条规律的推导值，所以删除不会让资料缺项。'],
   facts:{rule,handwritten:before},
   supersedes:[{receipt:`${RECEIPT_DIR}/${r.id}.json#${r.id}`,field:RECEIPT_FIELD},{receipt:`${RECEIPT_DIR}/candidate.json#${r.id}`,field:RECEIPT_FIELD}],
   boundary:'只删这一个字段（村级公共仓期初粮食登记）；同一行的其余字段、种粮、公款与其它聚落一律不动。'};
 });
}

let frozen;
try{frozen=JSON.parse(await fs.readFile(`${root}/candidate.json`,'utf8'));assert.equal(frozen.revision,revision);}catch(error){if(error.code!=='ENOENT')throw error;}
export const frozenEntries=()=>frozen?.entries;
export const run=(args=process.argv.slice(2))=>runRevision({revision,root,CARD,limitYuan:LIMIT_YUAN,maxRequests:MAX_REQUESTS,frozen,buildEntries,draftFor,contextFor,validateDraft,applyCandidate,isPublished,
 note:'INITFOOD：村级公共仓旧初粮登记整条删除（读者改读运行时推导），单卡硬上限 0.3 元、40 次（李白批准；到上限自动停，不得续跑）。'},args);
// 审批未齐（尚未 --prepare/--review/--publish，缺冻结候选或审批回执）时 --verify 以明确原因和退出码 2 结束（reportApprovalIncomplete），不以崩溃形式出现。
const verifyOnly=args=>args.includes('--verify')&&!args.includes('--publish')&&!args.includes('--review')&&!args.includes('--prepare');
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 await reportApprovalIncomplete(async()=>{
  try{return await run();}
  catch(error){
   if(error?.code==='ENOENT'&&verifyOnly(process.argv.slice(2)))throw approvalIncomplete('本批尚未发布：缺少冻结候选或审批回执（先 --prepare、--review、L4、--publish）');
   throw error;
  }
 });
}
