// w3 基础批（household，id 前缀 item_ / recipe_w3_，草稿根目录 world/drafts/w3）正文修订批，NOT loaded by the game。
// 起因：按 L4 必查清单第 9、15 条只读回扫，已发布的基础批有物品正文错误；按李白的决定走零花费流程：
// tools/manual-rewrite.mjs 人工改写（L1 用 tools/w3-household.mjs 的 manualRewriteProfile）-> 独立严格 L4 -> 本批把已审批的新正文发布到 world/meta。
// 机制与 w3-trades-text-revision.mjs 相同，共用 ./w3-text-revision-core.mjs；只认 world/drafts/w3-household-text/authorization.json 清单里的 id（清单由主会话按李白的批复写，本工具不写）。
// 流程：--compare（只读）-> --prepare -> --publish -> --verify；没有 --review，审批核验复用基础批记录的 L1/L2/L4。
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runRevision,draftFor,contextFor,validateDraft,applyCandidate,isPublished} from './p1-revision-approval.mjs';
import {economyW3} from './economy-w3.mjs';
import {w3Context,w3Revision} from '../../tools/w3-content.mjs';
import {householdRoot} from '../../tools/w3-household.mjs';
import {reportApprovalIncomplete} from '../../tools/content-pipeline.mjs';
import {makeTextRevision,loadFrozen} from './w3-text-revision-core.mjs';

export const revision='w3-household-text-1',root='world/drafts/w3-household-text',CARD='W3HH',via='w3-household-text';
export {runRevision,draftFor,contextFor,validateDraft,applyCandidate,isPublished};
// 与 tools/w3-draft.mjs 起草时的字段一致（items 三段、recipes 的 process）。
export const KINDS={items:{file:'world/meta/items.json',fields:['description','inspection','storage']},recipes:{file:'world/meta/recipes.json',fields:['process']}};
const frozen=await loadFrozen(root,revision);
const core=makeTextRevision({revision,root,CARD,via,label:'household',factsKey:'household',sourceRoot:householdRoot,sourceRevision:w3Revision,KINDS,
 bonesOf:world=>economyW3(world),contextOf:w3Context,frozen,note:'w3 基础批已审批正文修订：审批证据复用基础批记录，不花钱。'});
export const {authorizationFile,approvedDrafts,rawDrafts,differences,readAuthorization,guardDifferences,buildEntries,verifyApproval,verifyFrozen,candidateEntries,frozenEntries,run,compare}=core;

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 await reportApprovalIncomplete(()=>process.argv.includes('--compare')?compare():run());
}
