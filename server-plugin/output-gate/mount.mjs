// outputGate 的装配入口（卷二 groupApi `output-gate/mount.mjs#mountOutput`，callerFiles index.mjs；通路表第 3 环"由 mountOutput 触发"）。
// 块 6 调它，不调 mountNarration（aiGate 不建，卷二勘误 1119k3）。装配文件 index.mjs 随 6-19。

import { registerComposer } from './reply-composer.mjs';

/**
 * 装配时调一次：造订阅函数并登记给回应通道。
 * @param {Parameters<typeof registerComposer>[0]} deps 见 createReplyComposer
 * @returns {void}
 */
export function mountOutput(deps) {
  registerComposer(deps);
}
