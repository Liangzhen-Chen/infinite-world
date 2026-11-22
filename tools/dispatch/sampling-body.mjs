// DeepSeek 采样参数（亮圳 11-22 19:46「温度零点零1122」）：按用途读 tools/dispatch/sampling.json，
// 生成注入 CLAUDE_CODE_EXTRA_BODY 的 JSON。命令行：node sampling-body.mjs <用途>；
// 档值为 null 打印空串（不注入）；用途不存在或档值非数字/非 null：非 0 退出并报错，不回落。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function samplingBody(config, purpose) {
  const table = config?.purposes;
  if (!table || typeof table !== 'object') throw new Error('sampling.json 缺 purposes');
  if (!Object.hasOwn(table, purpose)) {
    throw new Error(`用途不存在: ${purpose}（可用: ${Object.keys(table).join('、')}）`);
  }
  const t = table[purpose]?.temperature;
  if (t === null) return '';
  if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) {
    throw new Error(`用途 ${purpose} 的 temperature 须为非负数或 null: ${String(t)}`);
  }
  return JSON.stringify({ temperature: t });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const cfg = JSON.parse(readFileSync(new URL('./sampling.json', import.meta.url), 'utf8'));
    process.stdout.write(samplingBody(cfg, process.argv[2] ?? ''));
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  }
}
