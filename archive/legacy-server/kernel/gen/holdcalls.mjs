// 调用提案应用器（卷八 R8-18.9 ③：生成器交出 `setGovernor` 调用提案，由写回器在世界创建事务内写入；卷十 R10-1.2 同一笔事务）。
// 唯一登记的调用是 setGovernor，所以提案只带（地点、组织、原因），不带函数名。按提案次序逐条应用：先按 R8-5.3 核持有资格（kernel/title.mjs holdingAllowed，含"没有政体可读"），
// 不为真即不写、该地开局无主，记入返回的 skipped；为真才经统治边的唯一写入口 setGovernor 写。原因 `polity.gen.holdCause` 不在 `polity.hold.forcibleCauses` 里（加载校验），
// 所以这里核资格与 setGovernor 里核的是同一件事，不是绕过。写在调用方已开的世界创建事务上（同 holdings.mjs）；组织行须已落进表（先写行、再写边）。

import { holdingAllowed, setGovernor } from '../title.mjs';

/**
 * @param {any} engine @param {any} state
 * @param {Array<{place: string, org: string, cause: string}>} calls 生成器交出的调用提案
 * @returns {{written: Array<{place: string, org: string, edge: string}>, skipped: Array<{place: string, org: string, reason: string}>}}
 */
export function applyGovernorCalls(engine, state, calls) {
  const written = [];
  const skipped = [];
  for (const c of calls) {
    const r = holdingAllowed(engine, state, c.org, c.place);
    if (!r.ok) { skipped.push({ place: c.place, org: c.org, reason: r.reason }); continue; }
    written.push({ place: c.place, org: c.org, edge: setGovernor(engine, state, c.place, c.org, c.cause) });
  }
  return { written, skipped };
}
