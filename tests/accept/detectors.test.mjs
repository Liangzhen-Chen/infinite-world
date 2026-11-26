// 门禁设施 offline-path-segment 与 test-temp-root 的最小行为测试（gatefacs.json 的 requiredTests 指向本文件）。
// 旧 detectors.test.mjs 按 L-16 整体归档后，这两个登记项指向的文件不再存在；这里按仍保留的公共设施
// tools/path-segment.mjs 与 tests/accept/temp-root.mjs 重建登记所需的行为测试，标题与登记名一致。
// 完整检测器反向测试随 L-09 重建，本文件不测检测器实现本身。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT, testTempRoot, assertRelUnderTempRoot, writeUnderTempRoot, removeTempRoot, removeUnderTempRoot } from './temp-root.mjs';
import { tokenize } from '../../tools/accept/lib/js-scan.mjs';
import { stateChains } from '../../tools/accept/lib/js-state.mjs';
import { assertCliOut, writeCliOut, foldPathCase } from '../../tools/accept/lib/cli-out.mjs';
import { detect as callEdge } from '../../tools/accept/detectors/call_edge.mjs';
import { loadContext, readRegistry } from '../../tools/accept/read.mjs';
import { repoRoot, safeSegment } from '../../tools/path-segment.mjs';

test('safeSegment（裁定一）：空串、点、分隔符、..、绝对路径、盘符一律抛错；单段原样返回', () => {
  for (const bad of ['', '.', '..', 'a/b', 'a\\b', '../x', 'a/../b', '/etc', 'C:', 'C:x', 'x..y', 'a\0b']) assert.throws(() => safeSegment(bad), /unsafe path segment/, JSON.stringify(bad));
  assert.equal(safeSegment('dimensions-coverage.2026-11-17.txt'), 'dimensions-coverage.2026-11-17.txt');
  assert.equal(safeSegment(5), '5');
});

test('repoRoot（裁定一）：返回仓库根，tools/path-segment.mjs 的上一级', () => {
  assert.equal(realpathSync(repoRoot()), realpathSync(ROOT));
  assert.ok(existsSync(join(repoRoot(), 'tools', 'path-segment.mjs')));
});

test('assertRelUnderTempRoot（裁定四）：越出临时根与命中 §2.11 的路径直接抛错', () => {
  const dir = testTempRoot('arutr-');
  try {
    for (const bad of ['../a', 'a/../../b', '/etc/x', 'C:/x', 'tools/accept/items.json']) assert.throws(() => assertRelUnderTempRoot(dir, bad), /temp root|§2\.11/, bad);
    assert.equal(assertRelUnderTempRoot(dir, 'a/b.json'), join(dir, 'a/b.json'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('writeUnderTempRoot（裁定四）：`..`、绝对路径、命中 §2.11 受保护模式时抛错；合规相对路径写入临时根内', () => {
  const dir = testTempRoot('wutr-');
  try {
    for (const bad of ['../a.json', 'a/../../b.json', '..', '.', ROOT, '/etc/x', 'C:/x/y.json', 'tools/accept/items.json', 'tools/accept/out/x.json', 'tools/whitelist.json', 'a/../tools/accept/gatefacs.json']) {
      assert.throws(() => writeUnderTempRoot(dir, bad, 'x'), /temp root|§2\.11/, bad);
    }
    const p = writeUnderTempRoot(dir, 'sub/dir/ok.json', 'hi');
    assert.equal(readFileSync(p, 'utf8'), 'hi');
    assert.ok(!relative(dir, p).startsWith('..'));
    assert.equal(readFileSync(join(dir, 'sub/dir/ok.json'), 'utf8'), 'hi');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('writeUnderTempRoot（只核第 2 条）：root 在仓库内（仓库根、仓库内子目录）时抛错，且不落盘', () => {
  for (const root of [ROOT, join(ROOT, 'server-plugin'), join(ROOT, 'tests')]) {
    assert.throws(() => writeUnderTempRoot(root, 'wutr-should-not-exist.mjs', 'x'), /outside the repository/, root);
    assert.ok(!existsSync(join(root, 'wutr-should-not-exist.mjs')), root);
  }
});

test('removeTempRoot（删临时根）：仓库内路径、系统临时目录本身抛错且不删；临时根整体删除', () => {
  for (const bad of [ROOT, join(ROOT, 'tests'), realpathSync(tmpdir())]) {
    assert.throws(() => removeTempRoot(bad), /outside the repository|under the system temp directory/, bad);
    assert.ok(existsSync(bad), bad);
  }
  const dir = testTempRoot('rtr-');
  writeUnderTempRoot(dir, 'a/b.json', 'x');
  removeTempRoot(dir);
  assert.ok(!existsSync(dir));
});

test('removeUnderTempRoot（删片）：`..` 越界、绝对路径、命中 §2.11 受保护模式时抛错且不删；临时根下的文件删除成功', () => {
  const dir = testTempRoot('rutr-');
  try {
    const kept = writeUnderTempRoot(dir, 'keep.json', 'k');
    for (const bad of ['../x', 'a/../../x', '..', '.', ROOT, 'C:/x', 'tools/accept/items.json']) assert.throws(() => removeUnderTempRoot(dir, bad), /temp root|§2\.11/, bad);
    assert.ok(existsSync(kept));
    const p = writeUnderTempRoot(dir, 'sub/gone.json', 'g');
    removeUnderTempRoot(dir, 'sub/gone.json');
    assert.ok(!existsSync(p));
    assert.ok(existsSync(kept));
    assert.throws(() => removeUnderTempRoot(ROOT, 'x.json'), /outside the repository/);
  } finally { removeTempRoot(dir); }
});

test('stateChains 绑定声明不算写（门禁封口卡 B）：const/let/var 声明、逗号续写声明、for-of 声明、形参默认值不出写链；赋值、成员赋值、delete、自增出写链', () => {
  const writes = (src) => stateChains(tokenize(src)).map((c) => c.write);
  for (const src of ['const state = f();', 'for (const state of xs) {}', 'let a = 1, state = 2;', 'function g(state = {}) {}', 'const h = (a, state = 1) => a;', 'var b = g(1, 2), state = 3;']) {
    assert.deepEqual(writes(src), [false], src);
  }
  for (const src of ['state = x;', 'state.a = 1;', 'delete state.a;', 'state.n++;', 'f(a, state = 1);', 'if (state = x) {}', 'for (i = 0, state = 1;;) {}']) {
    assert.deepEqual(writes(src), [true], src);
  }
  assert.deepEqual(writes('const state = f(); state.a = 1;'), [false, true], '声明之后的成员写照旧算写');
  // 审卡第一轮必须改 1：成员链不是绑定；跨行的 `f(…)` 换行 `{…}` 是调用加块；无分号换行后的逗号表达式不是前一行声明的续写。
  for (const src of ['touch(state.gold = 999)\n{ }', 'touch(state = 1)\n{ }', 'let a = 1\nb(), state.gold = 999;', 'let a = 1\nb(), state = 999;', 'f(state[0] = 1) {}']) {
    assert.deepEqual(writes(src), [true], src);
  }
  for (const src of ['let a = 1,\n  state = 2;', 'function g(\n  a,\n  state = {}\n) {}', 'const o = { m(a, state = 1) {} };']) {
    assert.deepEqual(writes(src), [false], src);
  }
});

test('assertCliOut（门禁封口卡 B）：落在本次仓库根内且命中 §2.11 受保护模式即抛；仓库外、仓库内非登记路径放行，返回解析后的完整路径', () => {
  const dir = testTempRoot('aco-');
  try {
    for (const bad of ['tools/accept/items.json', 'tools/accept/out/x.json', 'tools/whitelist.json', 'a/../tools/accept/gatefacs.json', join(dir, 'tools/accept/hits.json'), '.']) {
      assert.throws(() => assertCliOut(dir, bad), /§2\.11|repository root/, bad);
    }
    // 审卡第一轮必须改 2：段尾点、段尾空格、备用数据流 `:` 一律拒；win32 上大小写变体照样命中受保护模式。
    for (const bad of ['tools/accept/hits.json.', 'tools/accept/hits.json ', 'tools/accept/hits.json::$DATA', 'tools./accept/x.json', 'docs/a:b.md']) {
      assert.throws(() => assertCliOut(dir, bad), /aliasing segment/, bad);
    }
    if (process.platform === 'win32') {
      for (const bad of ['TOOLS/ACCEPT/HITS.JSON', 'tools/accept/Hits.json']) assert.throws(() => assertCliOut(dir, bad), /§2\.11/, bad);
    }
    assert.equal(foldPathCase('Tools/A.json'), process.platform === 'win32' ? 'tools/a.json' : 'Tools/A.json');
    assert.equal(assertCliOut(dir, 'docs/x.md'), join(realpathSync.native(dir), 'docs', 'x.md'));
    const other = testTempRoot('aco-out-');
    try { assert.equal(assertCliOut(dir, join(other, 'tools/accept/items.json')), join(realpathSync.native(other), 'tools', 'accept', 'items.json')); } finally { removeTempRoot(other); }
  } finally { removeTempRoot(dir); }
  // 审卡第一轮必须改 3：调用方 root 传真仓库子目录、经 `../` 指回受保护文件，仍按本工具所在仓库根判（只断言、不写盘）。
  assert.throws(() => assertCliOut(join(ROOT, 'docs'), '../tools/accept/hits.json'), /§2\.11/);
  assert.throws(() => assertCliOut(join(ROOT, 'docs', '卡档案'), '../../tools/accept/items.json'), /§2\.11/);
  assert.equal(assertCliOut(join(ROOT, 'docs'), '../docs/not-guarded-probe.md'), join(realpathSync.native(ROOT), 'docs', 'not-guarded-probe.md'));
});

test('writeCliOut（门禁封口卡 B）：受保护路径抛错且不落盘；合规路径写入', () => {
  const dir = testTempRoot('wco-');
  try {
    writeUnderTempRoot(dir, 'tools/accept/keep.txt', 'k');
    assert.throws(() => writeCliOut(dir, 'tools/accept/items.json', 'x'), /§2\.11/);
    assert.ok(!existsSync(join(dir, 'tools/accept/items.json')));
    const p = writeCliOut(dir, 'tools/accept/entry-registry.json', 'ok');
    assert.equal(readFileSync(p, 'utf8'), 'ok');
  } finally { removeTempRoot(dir); }
});

test('call_edge 断言写入口（门禁封口卡 B，Q4 ②）：登记设施里先过断言再写不报；绕过断言直接写报；设施缺 requiredTests 仍报', () => {
  const CLS = readRegistry(ROOT, 'scanclasses').find((c) => c.scanClass === 'registry_write');
  const FAC = 'tools/accept/lib/cli-out.mjs';
  const head = "import { writeFileSync } from 'node:fs';\nexport function assertCliOut(r, p) { return p; }\n";
  const params = { groups: ['offline'], callers: [], callees: ['registry_write'], roots: ['test-temp-root'], code: 'E-ACC-REGISTRY-WRITE' };
  const run = (map, mutate = (g) => g) => {
    const files = new Map(Object.entries(map));
    const ctx = loadContext(ROOT, { files: [...files.keys()].sort(), read: (p) => files.get(p) });
    const c2 = { ...ctx, regs: { ...ctx.regs, gatefacs: ctx.regs.gatefacs.map(mutate) } };
    return callEdge(c2, params, CLS).filter((h) => h.nodeKind === 'call').length;
  };
  const ok = `${head}export function writeCliOut(r, p, d) { const full = assertCliOut(r, p); writeFileSync(full, d); }\n`;
  const bypass = `${head}export function writeCliOut(r, p, d) { writeFileSync(p, d); }\n`;
  assert.equal(run({ [FAC]: ok }), 0);
  assert.equal(run({ [FAC]: bypass }), 1);
  assert.equal(run({ 'tools/x.mjs': "import { writeFileSync } from 'node:fs';\nexport function main(argv) { writeFileSync(argv[1], 'x'); }\n" }), 1);
  assert.equal(run({ [FAC]: ok }, (g) => (g.paths.includes(FAC) ? { ...g, requiredTests: [] } : g)), 1);
});
