// 门禁测试用的临时仓库（非 git，按磁盘遍历）：声明表、§2.11 登记、整套门禁代码与绕法用例片段，另加 extra {路径: 内容}。
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readdirSync } from 'node:fs';
import { REGISTRY, LAYOUT } from '../../tools/accept/read.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function tempRepo(extra) {
  const dir = mkdtempSync(join(tmpdir(), 'p1-accept-'));
  const copy = (rel) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); copyFileSync(join(ROOT, rel), join(dir, rel)); };
  copy(LAYOUT.stateOwners);
  for (const r of Object.values(REGISTRY)) copy(`${LAYOUT.accDir}/${r.file}`);
  // 门禁代码整套带上：S12-13 按类别登记的检测器模块及其 import 闭包算判据指纹（P-1b）。
  for (const f of readdirSync(join(ROOT, LAYOUT.accDir), { recursive: true })) {
    const rel = `${LAYOUT.accDir}/${String(f).replace(/\\/g, '/')}`;
    if (rel.endsWith('.mjs')) copy(rel);
  }
  for (const f of readdirSync(join(ROOT, LAYOUT.bypassDir), { recursive: true })) {
    const rel = `${LAYOUT.bypassDir}/${String(f).replace(/\\/g, '/')}`;
    if (rel.endsWith('.txt') || rel.endsWith('.json')) copy(rel);
  }
  for (const [rel, text] of Object.entries(extra || {})) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); }
  return dir;
}
