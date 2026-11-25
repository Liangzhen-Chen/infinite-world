// 验收：卡 chore/detector-harden（L-09 六项检测器加固 + L-08 扩项）。出题方：Claude Haiku 5.5（API），标识 haiku-api-test-det；未参与写码与审卡。
// 依据：docs/gemini/kickoff-1125.md:480（L-09 六项）、:479（L-08 扩项）；卷十二:468（基线只经执行器写，注入不改基线）。
// 测什么：
//   A 注入（照 archive/legacy-tests/acceptance/chore-step1-tooling/step1.test.mjs 的 D 组）：每条在真实工作区写入一处故意违规，
//     跑一次 CLI `node tools/accept/run.mjs pre_commit`（取 stdout JSON），与基线比较 (itemKey, code) 对，断言出现新增；
//     不写死条目名或错误码；finally 删除注入文件与为它新建的目录，恢复原状。
//     A1 内核白名单：server-plugin/kernel/ 新增不在 files.json 的 .mjs（L-09 ②）
//     A2 顶层状态：server-plugin/rules/zz-probe.mjs 含模块顶层 const cache = new WeakMap();（L-09 ③①）
//     A3 公网 IP：docs/zz-probe.md 含公网 IPv4 8.8.4.4（L-08 ⑦）
//     A4 密钥形态：tools/zz-probe.mjs 含 'ghp_' 后接 36 位字母数字（L-08 ⑧）
//   B 静态（读文件文本）：
//     B1 tools/accept/detectors/decl_cmp.mjs 不含 UNIMPLEMENTED（L-09 ⑤）
//     B2 tools/accept/detectors/typed_pos.mjs 文本引用 typescript（L-09 ④）
//     B3 tools/accept/cases.json 可解析为对象且含 rows 数组（登记入口须合法 JSON）
// 预期：实现前 A1–A4、B1、B2 红（检测器尚未实现/未接入），B3 与基线运行本身绿（对照）。
// 耗时：每次 pre_commit 约 2 分钟；基线只跑一次（惰性缓存），之后每条注入各跑一次。
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

// 基线只跑一次（惰性缓存）；注入前取，注入后再取一次。
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
      // 记下本次新建的目录（自下而上），清理时只删这些
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

// ---------- A：注入（D 组法，真实工作区，try/finally 恢复） ----------

test('A1 内核白名单：server-plugin/kernel/ 新增不在 files.json 的 .mjs，pre_commit 新增失败', { timeout: CASE_TIMEOUT_MS }, () => {
  const added = injectAndDiff({
    'server-plugin/kernel/zz-probe.mjs': 'export const zzProbe = 1;\n',
  });
  assert.ok(added.length > 0, `注入后应有新增失败条目，实得：${JSON.stringify(added)}`);
});

test('A2 顶层状态：server-plugin/rules/ 模块顶层 const cache = new WeakMap()，pre_commit 新增失败', { timeout: CASE_TIMEOUT_MS }, () => {
  const added = injectAndDiff({
    'server-plugin/rules/zz-probe.mjs':
      'const cache = new WeakMap();\nexport const probe = (k) => cache.get(k);\n',
  });
  assert.ok(added.length > 0, `注入后应有新增失败条目，实得：${JSON.stringify(added)}`);
});

test('A3 公网 IP：docs/ 下 .md 含公网 IPv4 8.8.4.4，pre_commit 新增失败', { timeout: CASE_TIMEOUT_MS }, () => {
  const added = injectAndDiff({
    'docs/zz-probe.md': '# 探针\n\n测试用地址 8.8.4.4 不应出现在仓库里。\n',
  });
  assert.ok(added.length > 0, `注入后应有新增失败条目，实得：${JSON.stringify(added)}`);
});

test('A4 密钥形态：tools/ 下文件含 ghp_ 后接 36 位字母数字，pre_commit 新增失败', { timeout: CASE_TIMEOUT_MS }, () => {
  // 字面量拆成两段拼接写入：本测试源文件里不出现完整形态，注入文件里才是完整形态。
  const fake = 'ghp_' + 'aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5';
  assert.equal(fake.length, 40, '夹具长度应为 4 + 36');
  const added = injectAndDiff({
    'tools/zz-probe.mjs': `export const probeToken = '${fake}';\n`,
  });
  assert.ok(added.length > 0, `注入后应有新增失败条目，实得：${JSON.stringify(added)}`);
});

// ---------- B：静态断言 ----------

test('B1 tools/accept/detectors/decl_cmp.mjs 不含 UNIMPLEMENTED 桩（实现或连同登记移除）', () => {
  const text = readFileSync(join(ROOT, 'tools/accept/detectors/decl_cmp.mjs'), 'utf8');
  assert.ok(!text.includes('UNIMPLEMENTED'), 'decl_cmp.mjs 仍含 UNIMPLEMENTED');
});

test('B2 tools/accept/detectors/typed_pos.mjs 文本引用 typescript（接仓库已装的 tsc）', () => {
  const text = readFileSync(join(ROOT, 'tools/accept/detectors/typed_pos.mjs'), 'utf8');
  assert.ok(text.includes('typescript'), 'typed_pos.mjs 未引用 typescript');
});

test('B3 tools/accept/cases.json 可解析为对象且含 rows 数组', () => {
  const obj = JSON.parse(readFileSync(join(ROOT, 'tools/accept/cases.json'), 'utf8'));
  assert.ok(obj && typeof obj === 'object' && Array.isArray(obj.rows), 'cases.json 须含 rows 数组');
});
