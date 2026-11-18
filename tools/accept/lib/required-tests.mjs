// 必跑测试的真执行（李白 11-17 跟进小卡二裁定②："每次门禁必跑、不可跳过，缺失或被跳过就判不过"）。
// 清单只读登记数据：gatefac 行的 requiredTests（[{file, names}]）与 testGlobs；不写死文件名、测试名。
// 每个文件只用 `node --test --test-name-pattern=^名` 跑登记的那几条（不跑全量），解析 TAP：进程失败、有 not ok、
// 有 skip/todo/cancelled、或登记的名字没有对应的 ok 行，都判不过。设 TEMP/TMP/TMPDIR 到仓库外的系统临时目录（沿用测试临时根的做法）。
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { matchGlobs } from '../read.mjs';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const inside = (parent, child) => { const r = relative(parent, child); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };

// 真执行一个测试文件（names 非空时只跑这些名字开头的测试）。返回 { reason, oks }：reason 为 null 表示全过；
// 'missing'（文件不在）、'TEMP inside repository'、'failed'（进程失败或有 not ok）、'skipped'（有 skip/todo/cancelled）、
// 'empty'（一条通过的测试也没有，"用例全过"不按空集算过）。oks 是通过的测试名。
// 门禁设施的必跑测试（下）与方法是测试的条目（run.mjs，卷十二 §2.2 `impl`、§4.5.1）共用这一个执行函数。
export function runTestFile(root, file, names = []) {
  const tmp = realpathSync(tmpdir());
  if (!existsSync(join(root, file))) return { reason: 'missing', oks: [] };
  if (inside(realpathSync(root), tmp)) return { reason: 'TEMP inside repository', oks: [] };
  const args = ['--test', '--test-reporter=tap', ...names.flatMap((n) => [`--test-name-pattern=^${escapeRe(n)}`]), file];
  // 外层若本身是 node --test 的子进程，NODE_TEST_CONTEXT 会让内层不出 TAP，须去掉。
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', env: { ...env, TEMP: tmp, TMP: tmp, TMPDIR: tmp }, maxBuffer: 64 * 1024 * 1024 });
  const out = r.stdout || '';
  const oks = []; let bad = false;
  for (const line of out.split('\n')) {
    const m = /^(not )?ok \d+ - (.*?)(\s+#\s+(SKIP|TODO).*)?\s*$/.exec(line);
    if (!m) continue;
    if (m[1] || m[3]) bad = true; else oks.push(m[2]);
  }
  const count = (k) => Number((new RegExp(`^# ${k} (\\d+)`, 'm').exec(out) || [0, 0])[1]);
  if (r.status !== 0 || bad || count('fail') || count('skipped') || count('todo') || count('cancelled')) return { reason: r.status !== 0 ? 'failed' : 'skipped', oks };
  // 文件里一条 test 也没有时，node 把文件本身记成一条 ok（名字是文件路径，Windows 下反斜杠成对转义）：那不是用例，剔掉。
  const slash = (s) => s.replace(/\\\\/g, '/').replace(/\\/g, '/');
  const tests = oks.filter((t) => !slash(t).endsWith(slash(file)));
  if (!tests.length) return { reason: 'empty', oks: tests };
  return { reason: null, oks: tests };
}

// 登记了必跑测试的 gatefac 行里，登记的设施文件（paths）在仓库里的才执行；返回失败行 [{ facCode, file, name, reason }]，空表示全过。
export function runRequiredTests(root, gatefacs) {
  const fails = [];
  for (const g of gatefacs || []) {
    if (!Array.isArray(g.requiredTests) || !g.requiredTests.length) continue;
    if (!(g.paths || []).some((p) => existsSync(join(root, p)))) continue;
    for (const req of g.requiredTests) {
      const add = (name, reason) => fails.push({ facCode: g.facCode, file: req.file, name, reason });
      if (!existsSync(join(root, req.file))) { add('*', 'missing'); continue; }
      if (!matchGlobs(req.file, g.testGlobs || [], [])) { add('*', 'not in testGlobs'); continue; }
      const names = req.names || [];
      const { reason, oks } = runTestFile(root, req.file, names);
      if (reason === 'empty') { for (const n of names) add(n, 'not run'); continue; }
      if (reason) { add('*', reason); continue; }
      for (const n of names) if (!oks.some((t) => t.startsWith(n))) add(n, 'not run');
    }
  }
  return fails;
}
