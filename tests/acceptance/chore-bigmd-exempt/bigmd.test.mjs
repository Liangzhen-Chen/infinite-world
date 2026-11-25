// 验收：卡 chore/bigmd-exempt（big_md 类别只豁免 3 卷，路径写死）。出题方：Claude Haiku 5.5（API），标识 haiku-api-test-bigmd；未参与写码与审卡。
// 依据：docs/gemini/kickoff-1125.md:479（L-08 扩项：拦截 >500 KB .md 快照副本）；李白裁定 msg_aff2a90c2257 第四条（只豁免 3 个文件、路径逐字写死、不许通配符、每条带理由）；卷十二:468（基线只经执行器写，注入不改基线）。
// 测什么：
//   D1 tools/accept/scanclasses.json 中 big_md 类别的 exemptions 恰为 3 条路径（逐字比对，无多无少），
//      每条 path 不含 `*`、不以 `/` 结尾，且带非空 reason。
//   D2 注入：在 docs/ 下临时写一个 600 KB 的 .md（超过 500 KB，也超过 maxBytes 512000），跑一次 CLI
//      `node tools/accept/run.mjs pre_commit`（取 stdout JSON），与注入前基线比较 (itemKey, code) 对，断言出现新增失败；
//      不写死条目名或错误码；finally 删除注入文件与为它新建的目录，恢复原状。
//   D3 tools/accept/baseline.json 中所有行 locked 为 true。
// 预期：实现前 D1 红（豁免尚未登记）；D2 在 big_md 规则对 600 KB 的 .md 命中时为绿；D3 视基线现状而定（实现后应绿）。
// 耗时：每次 pre_commit 约 2 分钟；基线只跑一次（惰性缓存），D2 注入后再跑一次。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, rmdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RUN = join(ROOT, 'tools/accept/run.mjs');
const RUN_TIMEOUT_MS = 600000; // 单次 pre_commit 上限（约 2 分钟，留足余量）
const CASE_TIMEOUT_MS = 900000; // 单条注入测试上限（含可能的一次基线运行）

// 豁免路径逐字写死（不许通配符或目录前缀）。
const EXPECTED_EXEMPT_PATHS = [
  'docs/统一底层设计/卷二-维度表规范与统一入口.md',
  'docs/统一底层设计/卷三乙-物态类别与物品.md',
  'docs/统一底层设计/卷十九-建筑与设施.md',
];

// 运行 pre_commit 关口，返回 JSON 报告。verdict 为 fail 也是数据，不在此断言退出码。
const runPreCommit = () => {
  const r = spawnSync(process.execPath, [RUN, 'pre_commit'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: RUN_TIMEOUT_MS,
    maxBuffer: 256 * 1024 * 1024,
  });
  assert.equal(r.error, undefined, `pre_commit 无法启动或超时：${r.error}`);
  let report;
  try {
    report = JSON.parse(r.stdout);
  } catch (e) {
    assert.fail(`pre_commit 标准输出不是 JSON：${e.message}`);
  }
  assert.ok(report && report.items && Array.isArray(report.items.failed), 'JSON 报告须含 items.failed 数组');
  return report;
};

// 失败条目展开为 (itemKey, code) 对；新增 = 注入后出现而基线没有的对。不写死条目名或错误码。
const failPairs = (report) =>
  new Set(report.items.failed.flatMap((f) => (f.codes ?? []).map((c) => `${f.itemKey}|${c}`)));

// 基线只跑一次（惰性缓存）。
let BASE;
const baseline = () => (BASE ??= runPreCommit());

// 在真实工作区写入 files（相对仓库根 → 文本），跑一次 pre_commit，返回新增失败对。
// 不覆盖已存在的文件（存在即拒绝，避免删掉真实文件）；finally 删除注入文件与为其新建的目录。
const injectAndDiff = (files) => {
  const basePairs = failPairs(baseline());
  const writtenFiles = [];
  const createdDirs = [];
  try {
    for (const [rel, text] of Object.entries(files)) {
      const abs = join(ROOT, rel);
      assert.ok(!existsSync(abs), `注入位置已存在，拒绝覆盖：${rel}`);
      const missing = [];
      for (let d = dirname(abs); !existsSync(d); d = dirname(d)) missing.push(d);
      for (const d of missing.reverse()) {
        mkdirSync(d);
        createdDirs.push(d);
      }
      writeFileSync(abs, text, 'utf8');
      writtenFiles.push(abs);
    }
    const after = failPairs(runPreCommit());
    return [...after].filter((p) => !basePairs.has(p));
  } finally {
    for (const abs of writtenFiles.reverse()) rmSync(abs, { force: true });
    for (const d of createdDirs.reverse()) {
      try {
        rmdirSync(d);
      } catch {
        // 目录非空（不应发生）则保留，不强删
      }
    }
  }
};

// ---------- D：静态断言 ----------

test('D1 scanclasses.json 的 big_md 豁免恰为 3 条路径，逐字写死，每条带非空 reason', () => {
  const obj = JSON.parse(readFileSync(join(ROOT, 'tools/accept/scanclasses.json'), 'utf8'));
  const row = obj.rows.find((r) => r && r.scanClass === 'big_md');
  assert.ok(row, 'scanclasses.json 中应有 scanClass 为 big_md 的行');
  assert.ok(Array.isArray(row.exemptions), 'big_md 行须含 exemptions 数组');
  const paths = row.exemptions.map((e) => e.path);
  assert.deepEqual([...paths].sort(), [...EXPECTED_EXEMPT_PATHS].sort(), `big_md 豁免路径须恰为 3 条：实得 ${JSON.stringify(paths)}`);
  for (const e of row.exemptions) {
    assert.ok(!e.path.includes('*'), `豁免路径不许含通配符 *：${e.path}`);
    assert.ok(!e.path.endsWith('/'), `豁免路径不许以 / 结尾：${e.path}`);
    assert.ok(typeof e.reason === 'string' && e.reason.trim().length > 0, `豁免须带非空 reason：${e.path}`);
  }
});

test('D3 baseline.json 中所有行 locked 为 true', () => {
  const obj = JSON.parse(readFileSync(join(ROOT, 'tools/accept/baseline.json'), 'utf8'));
  assert.ok(Array.isArray(obj.rows), 'baseline.json 须含 rows 数组');
  const unlocked = obj.rows.filter((r) => r.locked !== true).map((r) => r.compCode ?? JSON.stringify(r));
  assert.deepEqual(unlocked, [], `以下基线行未 locked：${JSON.stringify(unlocked)}`);
});

// ---------- D：注入（真实工作区，try/finally 恢复） ----------

test('D2 注入：docs/ 下 600 KB 的 .md 命中 big_md，pre_commit 新增失败', { timeout: CASE_TIMEOUT_MS }, () => {
  const big = 'x'.repeat(600 * 1024) + '\n';
  const added = injectAndDiff({
    'docs/zz-probe-bigmd.md': big,
  });
  assert.ok(added.length > 0, `注入后应有新增失败条目，实得：${JSON.stringify(added)}`);
});
