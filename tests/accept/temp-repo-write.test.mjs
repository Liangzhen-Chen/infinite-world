// 门禁设施 test-temp-repo-fixture（tools/accept/lib/temp-repo-write.mjs）的行为测试；gatefacs.json 该行 requiredTests 指向本文件，标题与登记名一致。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, realpathSync, symlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT, testTempRoot, removeTempRoot } from './temp-root.mjs';
import { assertTempRepoPath, writeTempRepoFile } from '../../tools/accept/lib/temp-repo-write.mjs';
import { readRegistry, matchGlobs } from '../../tools/accept/read.mjs';

test('assertTempRepoPath（门禁封口子卡 C）：根在仓库内、根是临时目录本身、相对路径越出根或为绝对路径时抛错', () => {
  const dir = testTempRoot('trw-a-');
  try {
    for (const root of [ROOT, join(ROOT, 'tools/accept'), realpathSync(tmpdir())]) assert.throws(() => assertTempRepoPath(root, 'tools/accept/baseline.json'), /temp root/, root);
    for (const bad of ['', '.', '..', '../x.json', 'a/../../x.json', '/etc/x', 'C:/x.json', join(ROOT, 'tools/accept/baseline.json')]) {
      assert.throws(() => assertTempRepoPath(dir, bad), /temp repo/, bad);
    }
    assert.equal(assertTempRepoPath(dir, 'a/b.json'), join(realpathSync(dir), 'a/b.json'));
  } finally { removeTempRoot(dir); }
});

test('writeTempRepoFile（门禁封口子卡 C）：临时仓库里可写 §2.11 登记路径；仓库内根与越界路径抛错且不落盘', () => {
  const dir = testTempRoot('trw-w-');
  try {
    const guarded = readRegistry(ROOT, 'scanclasses').find((c) => c.scanClass === 'registry_write').guardedPaths;
    const rel = 'tools/accept/baseline.json';
    assert.ok(matchGlobs(rel, guarded, []), '前提：所写路径是 §2.11 受保护模式');
    const p = writeTempRepoFile(dir, rel, '{"rows":[]}\n');
    assert.equal(p, join(realpathSync(dir), rel));
    assert.equal(readFileSync(join(dir, rel), 'utf8'), '{"rows":[]}\n');
    assert.throws(() => writeTempRepoFile(dir, '../escape-trw.json', 'x'), /temp repo/);
    assert.ok(!existsSync(join(dir, '..', 'escape-trw.json')));
    const before = readFileSync(join(ROOT, 'tools/accept/baseline.json'), 'utf8');
    assert.throws(() => writeTempRepoFile(ROOT, rel, 'x'), /temp root/);
    assert.equal(readFileSync(join(ROOT, 'tools/accept/baseline.json'), 'utf8'), before);
  } finally { removeTempRoot(dir); }
});

test('assertTempRepoPath 链接落点（审卡 chore/gate-seal-c 必须改 1）：根内目录链接指向根外时，经链接写入抛错且目标目录无新文件', () => {
  const dir = testTempRoot('trw-l-');
  const out = testTempRoot('trw-o-');
  try {
    symlinkSync(out, join(dir, 'lnk'), 'junction');
    assert.throws(() => assertTempRepoPath(dir, 'lnk/x.json'), /inside the temp root/);
    assert.throws(() => writeTempRepoFile(dir, 'lnk/sub/baseline.json', 'x'), /inside the temp root/);
    symlinkSync(join(out, 'nope'), join(dir, 'dang'), 'junction');
    assert.throws(() => writeTempRepoFile(dir, 'dang/x.json', 'x'));
    assert.deepEqual(readdirSync(out), []);
    assert.equal(writeTempRepoFile(dir, 'ok/a.json', 'y'), join(realpathSync(dir), 'ok/a.json'));
  } finally { removeTempRoot(dir); removeTempRoot(out); }
});
