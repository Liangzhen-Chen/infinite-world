// 单次 API 预算闸门：只许调低，不许高于 0.65 美元。
// 0.65 上限的唯一出处：CLAUDE.md 第 3 节「单次 API 调用强制 --max-budget-usd 0.65（锁在单项 5 元红线内）」。
// 用法：node budget-check.mjs <预算>；合法（0 < 预算 <= 0.65）打印原值并退出 0，否则 stderr 报错退出 2。
const MAX_BUDGET_USD = 0.65; // CLAUDE.md 第 3 节
const raw = process.argv[2];
const value = Number(raw);
if (!Number.isFinite(value) || value <= 0 || value > MAX_BUDGET_USD) {
  const shown = raw === undefined ? '(未给)' : raw;
  process.stderr.write(`预算不合法：${shown}；只许 0 < 预算 <= ${MAX_BUDGET_USD}（CLAUDE.md 第 3 节 --max-budget-usd 0.65）\n`);
  process.exit(2);
}
process.stdout.write(`${raw}\n`);
