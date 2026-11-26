// 拔线必红验证（draft-s1-3 §3.3；出题方 haiku-orca-test-s13b）。
// 逐行读 tests/e2e/wire-cuts.json：在临时仓副本（只复制 server-plugin、world、烟测依赖的 tests 片段、tools/accept/lib）里，
// 把 file 中恰好一次出现的 find 替换为 replace，再跑零 mock 烟测。要求：烟测红，且输出含「停在第 step/6 步」。
// 任一行不满足即退出码 1。副本与其中的 node_modules 链接在每行结束后清理（链接只删链接本身，不碰仓库 node_modules）。
import { readFileSync, writeFileSync, cpSync, mkdirSync, symlinkSync, unlinkSync, rmdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { testTempRoot, removeTempRoot } from './lib/temp-root.mjs';

const CHILD_ENV = (() => { const e = { ...process.env }; delete e.NODE_TEST_CONTEXT; return e; })();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CFG = JSON.parse(readFileSync(join(ROOT, 'tests', 'e2e', 'wire-cuts.json'), 'utf8'));
const SMOKE = join('tests', 'e2e', 'vertical-slice-smoke.test.mjs');
// 烟测运行所需的仓库片段：实现（server-plugin、world）、烟测本身与其支撑（tests/e2e、tests/support、tests/accept/temp-root.mjs、tools/accept/lib）。
const COPY_DIRS = ['server-plugin', 'world', join('tests', 'e2e'), join('tests', 'support'), join('tools', 'accept')];
const COPY_FILES = [join('tests', 'accept', 'temp-root.mjs')];

function copyTree(dst) {
  for (const d of COPY_DIRS) cpSync(join(ROOT, d), join(dst, d), { recursive: true });
  for (const f of COPY_FILES) {
    mkdirSync(dirname(join(dst, f)), { recursive: true });
    cpSync(join(ROOT, f), join(dst, f));
  }
}

// 烟测要 express：副本里用目录联接指向仓库的 node_modules（Windows 下 junction 无需管理员权限）。
function linkModules(dst) {
  const link = join(dst, 'node_modules');
  symlinkSync(join(ROOT, 'node_modules'), link, 'junction');
  return link;
}

// 只删链接本身：unlink（符号链接）或 rmdir（junction），绝不递归进目标。
function unlinkModules(link) {
  if (!existsSync(link)) return;
  try { unlinkSync(link); } catch { rmdirSync(link); }
}

let failed = 0;
for (const row of CFG.rows) {
  const tmp = testTempRoot('s13b-wirecut-');
  const dst = join(tmp, 'repo');
  let link = null;
  try {
    mkdirSync(dst, { recursive: true });
    copyTree(dst);
    link = linkModules(dst);

    const file = join(dst, row.file);
    if (!existsSync(file)) {
      failed += 1;
      console.log(`FAIL ${row.id}：锚点文件 ${row.file} 不存在（依赖 S1-3a 未合入时预期红）`);
      continue;
    }
    const src = readFileSync(file, 'utf8');
    const hits = src.split(row.find).length - 1;
    if (hits !== 1) {
      failed += 1;
      console.log(`FAIL ${row.id}：锚点「${row.find}」在 ${row.file} 中出现 ${hits} 次，须恰 1 次（接线形状与登记不符，需主会话裁定）`);
      continue;
    }
    writeFileSync(file, src.replace(row.find, row.replace ?? ''), 'utf8');

    const r = spawnSync(process.execPath, ['--test', join(dst, SMOKE)], { cwd: dst, env: CHILD_ENV, encoding: 'utf8', timeout: 600000 });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const red = r.status !== 0;
    const atStep = out.includes(`停在第 ${row.step}/6 步`);
    if (red && atStep) {
      console.log(`PASS ${row.id}：红，停在第 ${row.step}/6 步`);
    } else {
      failed += 1;
      const where = out.match(/停在第 \d+\/6 步/);
      console.log(`FAIL ${row.id}：${red ? '红但' : '未红，且'}期望停在第 ${row.step}/6 步，实际 ${where ? where[0] : '无定位'}`);
    }
  } finally {
    unlinkModules(link);
    removeTempRoot(tmp);
  }
}

console.log(failed ? `拔线验证未通过：${failed} 行` : `拔线验证通过：${CFG.rows.length} 行全部红且停在登记步`);
process.exitCode = failed ? 1 : 0;
