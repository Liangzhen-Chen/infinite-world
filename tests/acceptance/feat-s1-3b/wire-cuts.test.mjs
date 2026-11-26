// S1-3b 烟测与拔线验收（draft-s1-3 §6 第 1、2、3 条）。出题方：Claude Haiku 5.5（haiku-orca-test-s13b）。
// 第 1、2 条：零 mock 烟测（tests/e2e/vertical-slice-smoke.test.mjs）在真实入口上全绿，六步逐步由烟测自身断言。
// 第 3 条：拔线登记 ≥9 行（卷文 draft §3.3 要求的下限），且每行拔掉一处接线后烟测红、停在登记步（tools/accept/e2e-wire-cut.mjs 执行）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

test('烟测六步全绿：tests/e2e/vertical-slice-smoke.test.mjs 从真实宿主路由跑通', () => {
  const r = spawnSync(process.execPath, ['--test', join(ROOT, 'tests', 'e2e', 'vertical-slice-smoke.test.mjs')], {
    cwd: ROOT, encoding: 'utf8', timeout: 600000,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  assert.equal(r.status, 0, `烟测未全绿：\n${out.slice(-4000)}`);
});

test('拔线登记行数不少于 9，且每行给出文件、锚点、替换与期望步', () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'tests', 'e2e', 'wire-cuts.json'), 'utf8'));
  assert.ok(Array.isArray(cfg.rows) && cfg.rows.length >= 9, '拔线登记应不少于 9 行');
  for (const row of cfg.rows) {
    assert.ok(row.id && row.file && row.find, `拔线行缺字段：${JSON.stringify(row)}`);
    assert.ok(Number.isInteger(row.step) && row.step >= 1 && row.step <= 6, `期望步应为 1..6：${row.id}`);
  }
});

test('拔任一接线烟测必红且停在登记步', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'accept', 'e2e-wire-cut.mjs')], {
    cwd: ROOT, encoding: 'utf8', timeout: 1800000,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  assert.equal(r.status, 0, `拔线验证未通过：\n${out.slice(-6000)}`);
});
