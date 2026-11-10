// w3-journey 正文修订批，NOT loaded by the game。
// 问题：tools/w3-content.mjs 的合并对已有 id 保留旧行，所以 journey 条目的草稿在发布之后被重写（如 L1 数字规则新增后重写、L4 退回重写），
// 现有发布工具更新不了 world/meta 里的正式正文。派生价当时是同一个问题，用修订批解决；本批把同一机制用于正文。
// 正文的新值只来自 journey 流程里已审批的记录（L1 + L2 + 所在批次 L4 批准，readApprovedContent 能读到即三者都已过），
// 本批不另写正文、不另发 L2、不花钱：条目 = 对每个 journey 条目比较"已审批记录里的草稿正文"与"正式文件里的正文"，不同者生成一条。
// 流程：--compare（只读：列出差异，不写任何文件）-> --prepare（冻结候选并跑 L1）-> --publish（断言 before 与现状一致，只改指名字段，写回执）-> --verify。
// 没有 --review：审批核验复用 journey 记录（approval.verify），回执被 tools/approved-revisions.mjs 的 readApprovedSupersedes 读取时同样复核。
// 机制本身在 ./w3-text-revision-core.mjs（与行当批 w3-trades-text-revision.mjs 共用）；本文件只提供 journey 的配置。
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runRevision,draftFor,contextFor,validateDraft,applyCandidate,isPublished} from './p1-revision-approval.mjs';
import {economyW3Journey} from './economy-w3-journey.mjs';
import {journeyRoot,journeyRevision,journeyContext} from '../../tools/w3-journey.mjs';
import {reportApprovalIncomplete} from '../../tools/content-pipeline.mjs';
import {makeTextRevision,loadFrozen} from './w3-text-revision-core.mjs';

export const revision='w3-journey-text-1',root='world/drafts/w3-journey-text',CARD='W3JT',via='w3-journey-text';
export {runRevision,draftFor,contextFor,validateDraft,applyCandidate,isPublished};
// 与 tools/w3-journey.mjs 起草时的字段一致（items 三段、recipes 的 process）。
export const KINDS={items:{file:'world/meta/items.json',fields:['description','inspection','storage']},recipes:{file:'world/meta/recipes.json',fields:['process']}};
const frozen=await loadFrozen(root,revision);
const core=makeTextRevision({revision,root,CARD,via,label:'journey',factsKey:'journey',sourceRoot:journeyRoot,sourceRevision:journeyRevision,KINDS,
 bonesOf:world=>economyW3Journey(world),contextOf:journeyContext,frozen,note:'w3-journey 已审批正文修订：审批证据复用 journey 记录，不花钱。'});
export const {authorizationFile,approvedDrafts,rawDrafts,differences,readAuthorization,guardDifferences,buildEntries,verifyApproval,verifyFrozen,candidateEntries,frozenEntries,run,compare}=core;

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 // 审批未齐时 --verify/--publish 以明确原因和非 0 退出码结束（reportApprovalIncomplete），不抛栈。
 await reportApprovalIncomplete(()=>process.argv.includes('--compare')?compare():run());
}
