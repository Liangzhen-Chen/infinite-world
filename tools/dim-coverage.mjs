// L5 齐全率报告落盘（卷二 §4.1 L5 :1493：写 logs/dimensions-coverage.<date>.txt）。
// 用法：node tools/dim-coverage.mjs --date 2026-11-17 [--root 目录]。日期由调用方给（kernel 不读墙钟）；报告不阻断，加载 error 照列在文件末。

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../server-plugin/kernel/load/world.mjs';

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const date = arg('--date');
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { process.stderr.write('usage: node tools/dim-coverage.mjs --date YYYY-MM-DD [--root dir]\n'); process.exit(2); }
const root = arg('--root') || join(dirname(fileURLToPath(import.meta.url)), '..');
const r = loadWorld(root);
const out = join(root, 'logs', `dimensions-coverage.${date}.txt`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, r.coverage + (r.ok ? '' : '\n# load errors\n' + r.text));
process.stdout.write(`${out}\n`);
