// 基线锁定（L-17：新骨架基线全行 locked: true；docs/gemini/kickoff-1125.md:496）。
// 执行器 writeBaseline 是 baseline.json 的唯一写者（卷十二 R12-8.5、§2.11）：首次登记与既有行都必须写成 locked: true。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import { writeBaseline } from '../../tools/accept/run.mjs';
import { LAYOUT } from '../../tools/accept/read.mjs';
import { testTempRoot } from './temp-root.mjs';

const readBaseline = (root) => JSON.parse(readFileSync(join(root, LAYOUT.accDir, 'baseline.json'), 'utf8')).rows;

test('writeBaseline 首次登记即 locked: true', () => {
  const dir = testTempRoot('baseline-lock-new-');
  try {
    mkdirSync(join(dir, LAYOUT.accDir), { recursive: true });
    const rows = [{ compCode: 'c_test_lock', rowKey: 'c_test_lock|a.mjs||text|0' }];
    writeBaseline(dir, [], { c_test_lock: 1 }, rows, 'deadbee', new Map([['c_test_lock', { count: 1, rowKeys: ['c_test_lock|a.mjs||text|0'] }]]), new Set(['c_test_lock']));
    const out = readBaseline(dir);
    assert.equal(out.length, 1);
    assert.equal(out[0].compCode, 'c_test_lock');
    assert.equal(out[0].locked, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('writeBaseline 既有未锁行重写后也为 locked: true', () => {
  const dir = testTempRoot('baseline-lock-old-');
  try {
    mkdirSync(join(dir, LAYOUT.accDir), { recursive: true });
    const base = [{ compCode: 'c_test_lock', b0: 2, b0Source: 'counted', locked: false, current: 2, lastMergeRef: 'old', rowKeys: ['c_test_lock|a.mjs||text|0', 'c_test_lock|b.mjs||text|0'] }];
    writeBaseline(dir, base, { c_test_lock: 1 }, [{ compCode: 'c_test_lock', rowKey: 'c_test_lock|a.mjs||text|0' }], 'deadbee', new Map(), new Set(['c_test_lock']));
    const out = readBaseline(dir);
    assert.equal(out.length, 1);
    assert.equal(out[0].locked, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
