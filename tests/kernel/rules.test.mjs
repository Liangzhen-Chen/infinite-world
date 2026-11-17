// P-2b 规则表加载器（卷二 §4.1 "规则表登记" :1497）与 L5 齐全率报告（§4.1 L5 :1493）。
// 反例在临时目录里拷一份真实登记与内核常数表再改坏一处；正例读真实 world/rules。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRules, checkRules, rulesReport, ruleTable } from '../../server-plugin/kernel/load/rules.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { validateDimensions } from '../../server-plugin/kernel/validate/dimensions-validate.mjs';
import { fixture, OPTIONS, sourcesOf } from './fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (f) => JSON.parse(readFileSync(join(ROOT, 'world/rules', f), 'utf8'));

// 临时规则目录：registry 取真实登记的 kernelConstants 行，另加 extra 行；files 为 {相对路径: 内容}。
function withRules(extraRows, files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'p2b-rules-'));
  try {
    const reg = real('registry.json');
    const rows = [reg.rows.find((r) => r.code === 'kernelConstants'), ...extraRows];
    const all = { 'registry.json': { rows }, 'tables/kernel-constants.json': real('tables/kernel-constants.json'), ...files };
    for (const [f, v] of Object.entries(all)) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      writeFileSync(join(dir, f), typeof v === 'string' ? v : JSON.stringify(v));
    }
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const keyRow = (over = {}) => ({ code: 'demo', file: 'demo.json', structure: 'keys', type: { amount: 'number' }, domain: { amount: [0, 5] }, volume: '测试', multiSourceMerge: 'own_key_only', packOverridable: { amount: false }, ...over });
const fullCodes = (dir) => {
  const r = loadWorld(ROOT, { dimensionsDir: 'tests/kernel/dims', rulesDir: dir });
  return r.errors.filter((e) => e.severity === 'error').map((e) => e.code).sort();
};

test('真实规则目录：按登记载入，零 error；unitValue 有值', () => {
  const read = readRules(ROOT);
  assert.deepEqual(read.errors, []);
  assert.equal(typeof ruleTable(read.rules, 'valuation').unitValue, 'number');
  assert.ok(Number.isInteger(ruleTable(read.rules, 'kernelConstants').rxMaxDepth));
  assert.ok(Object.isFrozen(read.rules) && Object.isFrozen(read.rules.valuation));
});

test('真实世界经统一加载器（含规则表）加载零 error，并给出 L5 报告', () => {
  const r = loadWorld(ROOT);
  assert.deepEqual(r.errors.filter((e) => e.severity === 'error'), []);
  assert.ok(r.ok);
  assert.match(r.coverage, /^table\tdim\tknown\tapplicable\tnotApplicable\tunknown\texplicitFill\n/);
});

test('未登记的表：取表即 E-RULES-UNREGISTERED', () => {
  const { rules } = readRules(ROOT);
  assert.throws(() => ruleTable(rules, 'notRegistered'), (e) => e.code === 'E-RULES-UNREGISTERED');
});

test('登记即载入；表里出现登记外的键、登记的文件不存在 → E-RULES-UNREGISTERED', () => {
  withRules([keyRow()], { 'demo.json': { rows: [{ key: 'amount', value: 2, source: 's' }] } }, (dir) => {
    const read = readRules(ROOT, { rulesDir: dir });
    assert.deepEqual(read.errors, []);
    assert.equal(read.rules.demo.amount, 2);
    assert.deepEqual(fullCodes(dir), []);
  });
  withRules([keyRow()], { 'demo.json': { rows: [{ key: 'amount', value: 2 }, { key: 'stray', value: 1 }] } }, (dir) => {
    assert.deepEqual(rulesReport(readRules(ROOT, { rulesDir: dir }).errors).errors.map((e) => e.code), ['E-RULES-UNREGISTERED']);
  });
  withRules([keyRow()], {}, (dir) => {
    assert.deepEqual(readRules(ROOT, { rulesDir: dir }).errors.map((e) => e.code), ['E-RULES-UNREGISTERED']);
    assert.deepEqual(fullCodes(dir), ['E-RULES-UNREGISTERED']);
  });
});

test('表值按登记的类型与取值域查（L1 同一组码）；合并方式与值类型不合 → E-PACK-RULEKEY', () => {
  withRules([keyRow()], { 'demo.json': { rows: [{ key: 'amount', value: 9 }] } }, (dir) => assert.deepEqual(fullCodes(dir), ['E-DIM-DOMAIN-RANGE']));
  withRules([keyRow()], { 'demo.json': { rows: [{ key: 'amount', value: 'x' }] } }, (dir) => assert.deepEqual(fullCodes(dir), ['E-DIM-DOMAIN-RANGE']));
  withRules([keyRow({ multiSourceMerge: 'all_and' })], { 'demo.json': { rows: [{ key: 'amount', value: 2 }] } }, (dir) => assert.deepEqual(fullCodes(dir), ['E-PACK-RULEKEY']));
  withRules([keyRow({ packOverridable: {} })], { 'demo.json': { rows: [{ key: 'amount', value: 2 }] } }, (dir) => assert.deepEqual(fullCodes(dir), ['E-DIM-STRUCT-FIELD']));
});

test('行表：行键须是登记的族条目', () => {
  const rowReg = { code: 'perGrade', file: 'per-grade.json', structure: { rows: { vocab: 'grade' } }, type: 'integer', domain: [0, 9], volume: '测试', multiSourceMerge: 'take_max', packOverridable: false };
  withRules([rowReg], { 'per-grade.json': { rows: [{ key: 'grd_a', value: 3 }] } }, (dir) => assert.deepEqual(fullCodes(dir), []));
  withRules([rowReg], { 'per-grade.json': { rows: [{ key: 'grd_zz', value: 3 }] } }, (dir) => assert.deepEqual(fullCodes(dir), ['E-DIM-REF-MISSING']));
});

test('checkRules 只按登记查，不认表名', () => {
  withRules([keyRow({ code: 'other', file: 'x/other.json' })], { 'x/other.json': { rows: [{ key: 'amount', value: 6 }] } }, (dir) => {
    const read = readRules(ROOT, { rulesDir: dir });
    const env = validateDimensions(sourcesOf(fixture()), OPTIONS).env;
    assert.deepEqual(checkRules(read, env).map((e) => `${e.code}:${e.table}`), ['E-DIM-DOMAIN-RANGE:rules.other']);
  });
});

test('L5 齐全率：每表每维五列，条件不满足计不适用，两次输出字节相同', () => {
  const a = validateDimensions(sourcesOf(fixture()), OPTIONS).coverage;
  const b = validateDimensions(sourcesOf(fixture()), OPTIONS).coverage;
  assert.equal(a, b);
  const row = (dim) => a.split('\n').find((l) => l.startsWith(`gadget\t${dim}\t`));
  assert.equal(row('grade'), 'gadget\tgrade\t1\t1\t1\t0\t0');
  assert.equal(row('size'), 'gadget\tsize\t0\t0\t2\t0\t0');
  assert.equal(row('spec'), 'gadget\tspec\t0\t2\t0\t2\t0');
  assert.equal(row('mass'), 'gadget\tmass\t2\t2\t0\t0\t0');
});
