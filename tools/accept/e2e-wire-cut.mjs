// 拔线必红验证（draft-s1-3 §3.3；出题方 haiku-orca-test-s13b）。
// 逐行读 tests/e2e/wire-cuts.json：在临时根下 repo/ 副本（只复制 server-plugin、world、烟测依赖的 tests 片段、tools/accept，及浏览器前端冒烟要的 client、tools/host、assets）里，
// 把 file 中恰好一次出现的 find 替换为 replace，再跑该行 test 指定的测试文件（缺省六步零 mock 烟测；S1-4 主会话裁定 Q10 甲）。要求：红，且输出含「停在第 step/total 步」（total 取该行，缺省为六步烟测的 6）。
// 任一行不满足即退出码 1。副本里的 express 经 NODE_PATH 指向仓库的 node_modules（不建链接，不删仓库外的东西）。
// S12-2：所有写入只经临时根写入口 writeUnderTempRoot（李白 11-17 裁定三、四），复制用 cpSync 落在临时根下的常量相对路径。
import { readFileSync, existsSync, cpSync } from 'node:fs';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { testTempRoot, removeTempRoot, writeUnderTempRoot } from './lib/temp-root.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CFG = JSON.parse(readFileSync(join(ROOT, 'tests', 'e2e', 'wire-cuts.json'), 'utf8'));
const SMOKE = 'tests/e2e/vertical-slice-smoke.test.mjs';
// 缺省测试文件（六步烟测）的总步数；指定别的测试文件的行在 wire-cuts.json 写 total。
const SMOKE_TOTAL = 6;
// 子进程环境：去掉 NODE_TEST_CONTEXT（否则子进程按父子协议运行，退出码恒 0 且无输出，假绿）；NODE_PATH 指向仓库依赖。
const CHILD_ENV = (() => {
  const e = { ...process.env };
  delete e.NODE_TEST_CONTEXT;
  e.NODE_PATH = [join(ROOT, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(delimiter);
  return e;
})();

let failed = 0;
for (const row of CFG.rows) {
  const tmp = testTempRoot('s13b-wirecut-');
  try {
    // 烟测运行所需的仓库片段：实现（server-plugin、world）、烟测本身与其支撑（tests/e2e、tests/support、tests/accept/temp-root.mjs、tools/accept）。
    cpSync(join(ROOT, 'server-plugin'), join(tmp, 'repo', 'server-plugin'), { recursive: true });
    cpSync(join(ROOT, 'world'), join(tmp, 'repo', 'world'), { recursive: true });
    cpSync(join(ROOT, 'tests', 'e2e'), join(tmp, 'repo', 'tests', 'e2e'), { recursive: true });
    cpSync(join(ROOT, 'tests', 'support'), join(tmp, 'repo', 'tests', 'support'), { recursive: true });
    cpSync(join(ROOT, 'tools', 'accept'), join(tmp, 'repo', 'tools', 'accept'), { recursive: true });
    cpSync(join(ROOT, 'tools', 'host'), join(tmp, 'repo', 'tools', 'host'), { recursive: true });
    cpSync(join(ROOT, 'client'), join(tmp, 'repo', 'client'), { recursive: true });
    cpSync(join(ROOT, 'assets'), join(tmp, 'repo', 'assets'), { recursive: true });
    writeUnderTempRoot(tmp, 'repo/tests/accept/temp-root.mjs', readFileSync(join(ROOT, 'tests', 'accept', 'temp-root.mjs')));
    const repo = join(tmp, 'repo');
    const file = join(repo, row.file);
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
    writeUnderTempRoot(tmp, `repo/${row.file}`, src.replace(row.find, row.replace ?? ''));

    const r = spawnSync(process.execPath, ['--test', join(repo, row.test ?? SMOKE)], { cwd: repo, env: CHILD_ENV, encoding: 'utf8', timeout: 600000 });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const red = r.status !== 0;
    const total = row.total ?? SMOKE_TOTAL;
    const atStep = out.includes(`停在第 ${row.step}/${total} 步`);
    if (red && atStep) {
      console.log(`PASS ${row.id}：红，停在第 ${row.step}/${total} 步`);
    } else {
      failed += 1;
      const where = out.match(/停在第 \d+\/\d+ 步/);
      console.log(`FAIL ${row.id}：${red ? '红但' : '未红，且'}期望停在第 ${row.step}/${total} 步，实际 ${where ? where[0] : '无定位'}`);
    }
  } finally {
    removeTempRoot(tmp);
  }
}

console.log(failed ? `拔线验证未通过：${failed} 行` : `拔线验证通过：${CFG.rows.length} 行全部红且停在登记步`);
process.exitCode = failed ? 1 : 0;
