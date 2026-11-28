// 规矩清尾（chore/s2-gov2）反向验证：vol1.V-2.b 升为必过后，逃生口（anyType）新增一处即被提交关口拦截。
// 出题方 haiku-orca-test-gov2，依据卷十二:108（门禁是拦不是报：命中即不发生动作）。
// 黑盒：在 HEAD 干净副本（withIsolatedRepo）里经 runGate 跑 pre_commit，只读报告字段 items.failed 与 verdict。
// 注入只经 writeTempRepoFile（副本位于系统临时目录，仓库外）；不写死行号与计数，基线由同一副本先跑得出。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { withIsolatedRepo, runGate } from '../../support/isolated-repo.mjs';
import { writeTempRepoFile } from '../../../tools/accept/lib/temp-repo-write.mjs';

const TIMEOUT = 900000;
const ITEM = 'vol1.V-2.b';
// 探针目标：规则层下任一 .mjs（副本内已存在）。
const PROBE_REL = 'server-plugin/rules/time_env/env.mjs';
const PROBE = '\n/** @type {any} */\nexport const zzEscapeProbe = 0;\n';

// 报告中被判失败的条目名集合（与 run.mjs 的 items.failed 同形）。
const failedItems = (report) => {
  assert.ok(report && report.items && Array.isArray(report.items.failed), 'JSON 报告须含 items.failed 数组');
  return new Set(report.items.failed.map((f) => f.itemKey));
};

test(`${ITEM} 在干净副本里不拦：未注入探针时报告的 failed 不含 ${ITEM}（卷十二:108）`, { timeout: TIMEOUT }, async () => {
  await withIsolatedRepo(async (copyRoot) => {
    const report = runGate(copyRoot);
    assert.ok(!failedItems(report).has(ITEM), `干净副本里 ${ITEM} 已被拦，基线不成立`);
  });
});

test(`${ITEM} 进入拦截：规则层新增一处 JSDoc @type {any} 后，pre_commit 的 failed 含 ${ITEM}，verdict 非 pass（卷十二:108）`, { timeout: TIMEOUT }, async () => {
  await withIsolatedRepo(async (copyRoot) => {
    const original = readFileSync(join(copyRoot, PROBE_REL), 'utf8');
    writeTempRepoFile(copyRoot, PROBE_REL, original + PROBE);
    const report = runGate(copyRoot);
    assert.ok(failedItems(report).has(ITEM), `注入 @type {any} 后 ${ITEM} 未被拦：failed=${[...failedItems(report)].join('、')}`);
    assert.notEqual(report.verdict, 'pass', '注入后 verdict 不应为 pass');
  });
});
