// 验收：卡 chore/gate-seal-c 子卡 C（门禁封口：黑盒验收 + 老验收迁移的写入口）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-gsc；未参与写码与审卡。
// 依据：卷十二:600（S12-2 登记器与执行器之外写 §2.11 文件的位置为 0）；卷十二:601（S12-3 卷文正文有、登记表没有的条目编号数为 0，及计数口径）。
// 测什么：
//   S1 pre_commit 黑盒：vol12.S12-2 在 items.json 为 in_core、vol12.S12-3 仍为 implemented（正，S12-3 孤儿另立卡）；pre_commit 输出的 items.failed 不含 vol12.S12-2（反）。
//   S2 临时仓库夹具写入：新登记的写入口（从 tools/accept/gatefacs.json 新增行的 assertedWriters / paths 读出，不写死导出名）
//      目标在仓库外的临时根里 → 写入成功（正）；目标落在真仓库内 → 抛错且不写（反）。
//   S3 doc_struct（tools/accept/detectors/doc_struct.mjs）的 unregistered 检查：卷文定义了编号、items 未登记 → E-ACC-ITEM-UNREGISTERED（反）；登记后不报（正）。
// 临时根只用 testTempRoot，删除只用 removeTempRoot。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';
import { LAYOUT, REGISTRY } from '../../../tools/accept/read.mjs';
import { detect } from '../../../tools/accept/detectors/doc_struct.mjs';

const MUST = ['vol12.S12-2'];
const ITEMS = join(ROOT, LAYOUT.accDir, REGISTRY.items.file);
const itemRows = () => JSON.parse(readFileSync(ITEMS, 'utf8')).rows;

// ---------- S1：pre_commit 黑盒 ----------

// 按主会话裁定（S12-3 孤儿另立卡）：S12-3 本卡不升，仍为 implemented；S12-2 升 in_core。
test('S1 正：vol12.S12-2 为 in_core（必过），vol12.S12-3 仍为 implemented（本卡不升）', () => {
  const s2 = itemRows().find((r) => r.itemKey === 'vol12.S12-2');
  assert.ok(s2, '缺登记行：vol12.S12-2');
  assert.equal(s2.state, 'in_core', 'vol12.S12-2 的 state 应为 in_core');
  const s3 = itemRows().find((r) => r.itemKey === 'vol12.S12-3');
  assert.ok(s3, '缺登记行：vol12.S12-3');
  assert.equal(s3.state, 'implemented', 'vol12.S12-3 本卡不升，应仍为 implemented');
});

test('S1 反：pre_commit 输出的 items.failed 不含 vol12.S12-2', { timeout: 600000 }, () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'tools/accept/run.mjs'), 'pre_commit'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
  const report = JSON.parse(r.stdout);
  assert.ok(report.items && Array.isArray(report.items.failed), 'pre_commit 输出缺 items.failed');
  const failed = report.items.failed.map((x) => x.itemKey);
  for (const key of MUST) assert.ok(!failed.includes(key), `${key} 仍在 items.failed 中`);
});

// ---------- S2：临时仓库夹具写入（新登记设施） ----------

// 门禁封口 A/B 之后已登记的设施代号（写码新增的行不在其中）。
const KNOWN_FAC = ['acc-read', 'acc-register', 'acc-runner', 'commit-hook', 'dim-validate',
  'offline-cli-out', 'offline-path-segment', 'test-temp-root'];

// 从 gatefacs.json 读出本卡新增的那一行，再从其 paths 里找到导出 assertedWriters[0] 的模块。导出名不写死。
async function fixtureWriter() {
  const rows = JSON.parse(readFileSync(join(ROOT, 'tools/accept/gatefacs.json'), 'utf8')).rows;
  const fresh = rows.filter((r) => !KNOWN_FAC.includes(r.facCode) && Array.isArray(r.assertedWriters) && r.assertedWriters.length);
  assert.equal(fresh.length, 1, `gatefacs.json 应恰有 1 行新增的写入口登记，实际 ${fresh.length}`);
  const [row] = fresh;
  const name = row.assertedWriters[0];
  for (const p of row.paths.filter((x) => x.endsWith('.mjs'))) {
    const mod = await import(pathToFileURL(join(ROOT, p)).href);
    if (typeof mod[name] === 'function') return mod[name];
  }
  assert.fail(`登记的写入口 ${name} 未在登记路径中导出`);
}

test('S2 正：目标在仓库外的临时根里，经登记写入口写文件成功', async () => {
  const write = await fixtureWriter();
  const root = testTempRoot('gsc-fixture-');
  try {
    // 约定签名与 writeUnderTempRoot 一致：(根, 根下相对路径, 内容)。
    write(root, join('sub', 'a.txt'), 'hello');
    assert.equal(readFileSync(join(root, 'sub', 'a.txt'), 'utf8'), 'hello');
  } finally {
    removeTempRoot(root);
  }
});

// 目标在真仓库内时，登记的断言函数（gatefacs writerAsserts，写入口先调它）须抛错；写入口本身不被调用，故不写入。
// 不把真仓库根直接传给写入口：call_edge 只认从 testTempRoot 拿到的根，真仓库根会被计为 S12-2 命中。
async function fixtureAsserter() {
  const rows = JSON.parse(readFileSync(join(ROOT, 'tools/accept/gatefacs.json'), 'utf8')).rows;
  const [row] = rows.filter((r) => !KNOWN_FAC.includes(r.facCode) && Array.isArray(r.writerAsserts) && r.writerAsserts.length);
  assert.ok(row, 'gatefacs.json 缺新增行的 writerAsserts');
  const name = row.writerAsserts[0];
  for (const p of row.paths.filter((x) => x.endsWith('.mjs'))) {
    const mod = await import(pathToFileURL(join(ROOT, p)).href);
    if (typeof mod[name] === 'function') return mod[name];
  }
  assert.fail(`登记的断言函数 ${name} 未在登记路径中导出`);
}

test('S2 反：目标落在真仓库内，登记断言抛错，不写入', async () => {
  const assertPath = await fixtureAsserter();
  const target = join(ROOT, 'tests', 'acceptance', 'chore-gate-seal-c', '.fixture-probe.txt');
  const existed = existsSync(target);
  // 断言只做判定、不写文件，所以这里不需要清理。
  assert.throws(() => assertPath(ROOT, 'tests/acceptance/chore-gate-seal-c/.fixture-probe.txt'));
  assert.equal(existsSync(target), existed, '仓库内目标不应被写入');
});

// ---------- S3：doc_struct 卷文条目对账（S12-3） ----------

const DOC = 'docs/synthetic/vol12-sample.md';
const CLS = { docVolumes: { vol12: DOC }, docFamilies: { vol12: ['S12-'] }, formNames: {} };
// 样本卷文：定义了 S12-1 与 S12-99（表格首列为定义处）。
const DOC_TEXT = '# 卷十二样本\n\n| 编号 | 内容 |\n|---|---|\n| S12-1 | 甲 |\n| S12-99 | 乙 |\n';

// 内存里的最小仓库：只放 items.json 与样本卷文，检测器经 ctx.read / ctx.files 取数。
function sampleCtx(rows) {
  const files = new Map([
    [`${LAYOUT.accDir}/${REGISTRY.items.file}`, JSON.stringify({ rows })],
    [DOC, DOC_TEXT],
  ]);
  return { files: [...files.keys()], read: (p) => files.get(p) };
}
const row = (localNo) => ({ itemKey: `vol12.${localNo}`, volume: 'vol12', localNo });

test('S3 反：卷文定义了 S12-99 而 items.json 未登记 → 报 E-ACC-ITEM-UNREGISTERED', () => {
  const hits = detect(sampleCtx([row('S12-1')]), { checks: ['orphan', 'unregistered', 'count'] }, CLS);
  const miss = hits.filter((h) => h.code === 'E-ACC-ITEM-UNREGISTERED');
  assert.deepEqual(miss.map((h) => h.symbolPath), ['vol12.S12-99']);
});

test('S3 正：登记 S12-99 后不再报 E-ACC-ITEM-UNREGISTERED，整体也无命中', () => {
  const hits = detect(sampleCtx([row('S12-1'), row('S12-99')]), { checks: ['orphan', 'unregistered', 'count'] }, CLS);
  assert.equal(hits.filter((h) => h.code === 'E-ACC-ITEM-UNREGISTERED').length, 0);
  assert.equal(hits.length, 0, `不应有命中：${JSON.stringify(hits)}`);
});
