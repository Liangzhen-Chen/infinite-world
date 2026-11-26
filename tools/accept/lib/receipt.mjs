// 派卡收据格式（L-06 ⑥；门禁封口卡 A）：字段表与校验只此一处。dispatch.mjs 写收据时用 buildReceipt，卡档案门禁核 state.json 凭证时用 checkReceipt。
// totalCostUsd 允许 null（claude -p 输出取不到钱时），headBefore/headAfter 允许 null（取不到 HEAD 时），其余须非空。

export const RECEIPT_FIELDS = ['role', 'model', 'family', 'endpoint', 'startedAt', 'endedAt', 'exitCode', 'totalCostUsd', 'promptSha256', 'headBefore', 'headAfter'];

// 校验一份收据对象：返回不合格原因数组（空数组为合格）。
export function checkReceipt(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return ['收据须是 JSON 对象'];
  const missing = RECEIPT_FIELDS.filter((k) => !Object.prototype.hasOwnProperty.call(obj, k));
  if (missing.length) return missing.map((k) => `收据缺字段「${k}」`);
  const out = [];
  for (const k of ['role', 'model', 'family', 'startedAt', 'endedAt', 'promptSha256']) {
    if (typeof obj[k] !== 'string' || !obj[k]) out.push(`收据字段「${k}」须为非空字符串`);
  }
  if (obj.endpoint !== 'deepseek' && obj.endpoint !== 'anthropic') out.push('收据字段「endpoint」须为 deepseek 或 anthropic');
  if (typeof obj.exitCode !== 'number' || !Number.isInteger(obj.exitCode)) out.push('收据字段「exitCode」须为整数');
  if (obj.totalCostUsd !== null && (typeof obj.totalCostUsd !== 'number' || !Number.isFinite(obj.totalCostUsd) || obj.totalCostUsd < 0)) out.push('收据字段「totalCostUsd」须为非负数或 null');
  for (const k of ['headBefore', 'headAfter']) if (obj[k] !== null && (typeof obj[k] !== 'string' || !obj[k])) out.push(`收据字段「${k}」须为非空字符串或 null`);
  return out;
}

// 必填字段缺一个就抛，防止写出残收据；只取字段表里的键。
export function buildReceipt(fields) {
  const out = {};
  for (const k of RECEIPT_FIELDS) {
    if (!fields || !Object.prototype.hasOwnProperty.call(fields, k)) throw new Error(`收据缺字段「${k}」`);
    out[k] = fields[k];
  }
  const bad = checkReceipt(out);
  if (bad.length) throw new Error(bad[0]);
  return out;
}
