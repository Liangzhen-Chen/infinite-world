// 门禁设施 offline-path-segment 与 test-temp-root 的最小行为测试（gatefacs.json 的 requiredTests 指向本文件）。
// 旧 detectors.test.mjs 按 L-16 整体归档后，这两个登记项指向的文件不再存在；这里按仍保留的公共设施
// tools/path-segment.mjs 与 tests/accept/temp-root.mjs 重建登记所需的行为测试，标题与登记名一致。
// 完整检测器反向测试随 L-09 重建，本文件不测检测器实现本身。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, testTempRoot, assertRelUnderTempRoot, writeUnderTempRoot } from './temp-root.mjs';
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
