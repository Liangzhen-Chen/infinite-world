// P-2b 规则表加载器（卷二 §4.1 "规则表登记" :1497）与 L5 齐全率报告（§4.1 L5 :1493）。
// 反例在临时目录里拷一份真实登记与内核常数表再改坏一处；正例读真实 world/rules。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';
import { fileURLToPath } from 'node:url';
import { readRules, checkRules, rulesReport, ruleTable } from '../../server-plugin/kernel/load/rules.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { validateDimensions } from '../../server-plugin/kernel/validate/dimensions-validate.mjs';
import { fixture, OPTIONS, sourcesOf } from './fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (f) => JSON.parse(readFileSync(join(ROOT, 'world/rules', f), 'utf8'));

// 临时规则目录：registry 取真实登记的 kernelConstants 行，另加 extra 行；files 为 {相对路径: 内容}。
function withRules(extraRows, files, fn, withClock = true) {
  const tmpRoot = testTempRoot('p2b-rules-');
  try {
    const reg = real('registry.json');
    // 真实声明表登记了推进钩子（6-3 itemRot），加载入口逐钩子核 rules.clock.cadence、phaseOffset（卷二十 §2.1）：经 loadWorld 的用例临时目录带上真实 clock 登记行与表。
    const clock = withClock ? [reg.rows.find((r) => r.code === 'clock')] : [];
    const rows = [reg.rows.find((r) => r.code === 'kernelConstants'), ...clock, ...extraRows];
    const all = { 'registry.json': { rows }, 'tables/kernel-constants.json': real('tables/kernel-constants.json'), ...(withClock ? { 'tables/clock.json': real('tables/clock.json') } : {}), ...files };
    for (const [f, v] of Object.entries(all)) writeUnderTempRoot(tmpRoot, f, typeof v === 'string' ? v : JSON.stringify(v));
    return fn(tmpRoot);
  } finally { rmSync(tmpRoot, { recursive: true, force: true }); }
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
  }, false);
});

// 过程主体槽（卷二 §3.7 独立格式；李白 11-18 块 2-5 裁定①）：文件级登记、专用校验、同一套 E-MOD-*。
const procReg = (over = {}) => ({ code: 'proc', file: 'proc.json', structure: 'processSlots', volume: '测试', multiSourceMerge: 'own_key_only', packOverridable: false, ...over });
const slot = (over = {}) => ({ unit: 'kg', precision: 2, stacking: 'penalized', bounds: [0.5, 2], boundsRelative: true, boundsByKind: { loan: [0.8, 1.5] }, budget: { maxModifiers: 16, totalBounds: { mul: [-0.5, 1] } }, paceable: true, basis: '测试槽', ...over });
const procDoc = (slots, consumers = {}) => ({ version: 1, slots, consumers });

test('真实 derived-process.json：按 processSlots 登记载入，零 error', () => {
  const read = readRules(ROOT);
  assert.deepEqual(read.errors, []);
  assert.deepEqual(ruleTable(read.rules, 'derivedProcess'), { version: 1, slots: {}, consumers: {} });
  assert.equal(ruleTable(read.rules, 'kernelConstants').PERMILLE, 1000);
  assert.equal(ruleTable(read.rules, 'kernelConstants').BPS, 10000);
});

test('过程主体槽：合法通过；lowerCamel 槽名（process.<slot>）不被代号文法误拒', () => {
  const doc = procDoc({ price: slot(), coinCredit: slot({ stacking: 'none', boundsRelative: undefined, boundsByKind: undefined }) }, { decision: { autonomy: { slot: 'coinCredit', base: 1.0 } } });
  withRules([procReg()], { 'proc.json': doc }, (dir) => {
    assert.deepEqual(readRules(ROOT, { rulesDir: dir }).errors, []);
    assert.deepEqual(fullCodes(dir), []);
  });
});

test('过程主体槽：结构错报对应码（E-MOD-STACKING / BOUNDS / BUDGET / KEY-UNREGISTERED、E-DIM-STRUCT-FIELD、E-DIM-ID-FORMAT、单位）', () => {
  const codes = (doc) => withRules([procReg()], { 'proc.json': doc }, (dir) => fullCodes(dir));
  assert.deepEqual(codes(procDoc({ price: slot({ stacking: 'diminishing' }) })), ['E-MOD-STACKING']);
  assert.deepEqual(codes(procDoc({ price: slot({ bounds: [2, 1] }) })), ['E-MOD-BOUNDS']);
  assert.deepEqual(codes(procDoc({ price: slot({ boundsByKind: { loan: [1] } }) })), ['E-MOD-BOUNDS']);
  assert.deepEqual(codes(procDoc({ price: slot({ budget: { maxModifiers: 0 } }) })), ['E-MOD-BUDGET']);
  assert.deepEqual(codes(procDoc({ price: slot({ budget: { totalBounds: { scale: [0, 1] } } }) })), ['E-MOD-BUDGET']);
  assert.deepEqual(codes(procDoc({ price: slot() }, { decision: { autonomy: { slot: 'nosuch', base: 1 } } })), ['E-MOD-KEY-UNREGISTERED']);
  assert.deepEqual(codes(procDoc({ price: slot({ alias: 'x' }) })), ['E-DIM-STRUCT-FIELD']);
  assert.deepEqual(codes(procDoc({ price: slot({ unit: 'nosuch_unit' }) })), ['E-DIM-UNIT-UNKNOWN']);
  assert.deepEqual(codes(procDoc({ 'Price-x': slot() })), ['E-DIM-ID-FORMAT']);
  assert.deepEqual(codes({ version: 1, slots: {}, consumers: {}, stray: 1 }), ['E-DIM-STRUCT-FIELD']);
  assert.deepEqual(codes({ version: 1, slots: [], consumers: {} }), ['E-DIM-STRUCT-FIELD']);
  assert.deepEqual(codes(procDoc({ price: slot({ baselineRX: 3 }) })), ['E-MOD-RX']);
  assert.deepEqual(codes(procDoc({ price: slot({ baselineRX: 'mass * 2' }) })), []);
});

test('过程主体槽登记行：写了 type/domain 或 packOverridable 不是布尔 → E-DIM-STRUCT-FIELD', () => {
  const doc = procDoc({});
  withRules([procReg({ type: { price: 'number' } })], { 'proc.json': doc }, (dir) => assert.deepEqual(fullCodes(dir), ['E-DIM-STRUCT-FIELD']));
  withRules([procReg({ packOverridable: {} })], { 'proc.json': doc }, (dir) => assert.deepEqual(fullCodes(dir), ['E-DIM-STRUCT-FIELD']));
  withRules([procReg()], {}, (dir) => assert.deepEqual(fullCodes(dir), ['E-RULES-UNREGISTERED']));
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
