// 单次 API 预算闸门：只许调低，不许高于 0.65 美元。
// 0.65 上限的唯一出处：CLAUDE.md 第 3 节「单次 API 调用强制 --max-budget-usd 0.65（锁在单项 5 元红线内）」。
// 用法：node budget-check.mjs <预算>；合法（0 < 预算 <= 0.65）打印原值并退出 0，否则 stderr 报错退出 2。
// 纯函数 budgetValue 供 dispatch.mjs 复用（同一判据只一处）。
import { fileURLToPath } from 'node:url';

export const MAX_BUDGET_USD = 0.65; // CLAUDE.md 第 3 节

export function budgetValue(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_BUDGET_USD) {
    const shown = raw === undefined ? '(未给)' : raw;
    throw new Error(`预算不合法：${shown}；只许 0 < 预算 <= ${MAX_BUDGET_USD}（CLAUDE.md 第 3 节 --max-budget-usd 0.65）`);
  }
  return raw;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${budgetValue(process.argv[2])}\n`);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  }
}
