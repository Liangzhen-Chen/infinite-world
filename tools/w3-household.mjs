import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {economyW3} from '../world/design/economy-w3.mjs';
import {w3Context,w3Revision} from './w3-content.mjs';
import {validateTradesDraft} from './w3-trades.mjs';

// W3 基础批（household，草稿根目录 world/drafts/w3）的人工改写入口，供 tools/manual-rewrite.mjs 与修订批 world/design/w3-household-text-revision.mjs 取用。
// 起草脚本 tools/w3-draft.mjs 有顶层副作用，不能导入，所以这里单独导出它的根目录与 revision（w3Revision 来自 w3-content.mjs，与起草时同一个值）。
// 校验口径与行当批同一个 validateTradesDraft（validateW3Draft + 物品的 itemTextIssues/itemClaimIssues + 配方的 processIssues），不复制规则。
// 不用顶层 await：理由见 tools/w3-trades.mjs 里 manualRewriteProfile 之后的注释（修订批互相静态导入，顶层 await 会死锁）。
export const householdRoot='world/drafts/w3';
export {w3Revision};
export async function manualRewriteProfile(kind){
 const world=await loadWorld(),bones=economyW3(world),blocklist=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8'));
 if(!bones[kind])throw new Error('--kind 须为 items 或 recipes');
 return{entries:bones[kind],contextFor:entry=>w3Context(world,bones,entry),validateDraft:(draft,entry,context)=>validateTradesDraft(draft,entry,blocklist,context)};
}
export {validateTradesDraft as validateDraft};
