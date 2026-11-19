// 显示选择器 selectRows(rows, bindings)（卷二十九 §3.1 表 :426、R29-2.6、R29-2.16；体检 K6-82）。
// 对每行已编译的 when 调卷二唯一的 RX 求值函数 evaluateRX（kernelApi 只开给本文件，实参只有本行绑定，不带状态），
// 在为真的行里取 priority 最大者；本文件不含任何条件求值逻辑，也不认任何具体行、代号或字段名。
// when 为 null 即恒真；when 求值结果不是布尔即拒收 E-TPL-RX，不当真也不当假。并列时全部返回（调用方按 R29-2.3 的 rotate 与 vid 序挑一条）。

import { evaluateRX } from '../kernel/rx.mjs';
import { fail } from './enums.mjs';

/**
 * @param {ReadonlyArray<{when: unknown, priority: number}>} rows 每行带已编译 when（null 或 rxTree）与整数 priority
 * @param {Record<string, unknown>} bindings 本行槽位的值（代号、数值、布尔），R29-2.6
 * @returns {Array<object>} 为真的行里 priority 最大的那些，保持输入顺序；没有为真的行即空数组
 */
export function selectRows(rows, bindings) {
  /** @type {object[]} */
  let best = [];
  let top = -Infinity;
  for (const row of rows) {
    let ok = true;
    if (row.when !== null) {
      ok = evaluateRX(row.when, bindings, {});
      if (typeof ok !== 'boolean') fail('E_TPL_RX', 'when did not evaluate to a boolean');
    }
    if (!ok) continue;
    if (row.priority > top) { top = row.priority; best = [row]; } else if (row.priority === top) best.push(row);
  }
  return best;
}
