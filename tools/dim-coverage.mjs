// L5 齐全率报告落盘（卷二 §4.1 L5 :1493：写 logs/dimensions-coverage.<date>.txt）。
// 用法：node tools/dim-coverage.mjs --date 2026-11-17 [--root 目录]。日期由调用方给（kernel 不读墙钟）；报告不阻断，加载 error 照列在文件末。

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadWorld } from '../server-plugin/kernel/load/world.mjs';
import { repoRoot, safeSegment } from './path-segment.mjs';

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const date = arg('--date');
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { process.stderr.write('usage: node tools/dim-coverage.mjs --date YYYY-MM-DD [--root dir]\n'); process.exit(2); }
// --root 只决定读哪个世界；报告一律写在本仓库的 logs/ 下（写入路径写成 仓库根＋常量前导段＋校验函数尾段，S12-2 可证明在 §2.11 之外）。
const r = loadWorld(arg('--root') || repoRoot());
mkdirSync(join(repoRoot(), 'logs'), { recursive: true });
const out = join(repoRoot(), 'logs', safeSegment(`dimensions-coverage.${date}.txt`));
writeFileSync(join(repoRoot(), 'logs', safeSegment(`dimensions-coverage.${date}.txt`)), r.coverage + (r.ok ? '' : '\n# load errors\n' + r.text));
process.stdout.write(`${out}\n`);
