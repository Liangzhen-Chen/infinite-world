// 4-4b：det-numeric 规则表行与 fnTables 加载校验（卷二十七 §2.2 :167–:171、R27-5.2 :569–:575；
// 李白 11-18 16:3x 裁定第 4 条与 21:3x 裁定第 1 条：detfn 不登 _vocab，只在 CODE_ENUMS.detfn 一处定义，
// 七值去前缀 exp ln sin cos atan sqrt pow（代码内封闭枚举值不带前缀，卷二 §1.9 :285、:289）。
// 期望值按卷文公式手算：values 长度 = (domainMax − domainMin) ÷ step + 1；step ≥ 1；七值缺一行即加载失败。
// 反例在临时规则目录里拷一份真实登记与真实 det-numeric 表再改坏一处；正例读真实 world/rules。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';
import { readRules, checkRules } from '../../server-plugin/kernel/load/rules.mjs';
import { CODE_ENUMS } from '../../server-plugin/kernel/handles/markers.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { validateDimensions } from '../../server-plugin/kernel/validate/dimensions-validate.mjs';
import { fixture, OPTIONS, sourcesOf } from './fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (f) => JSON.parse(readFileSync(join(ROOT, 'world/rules', f), 'utf8'));
const env = () => validateDimensions(sourcesOf(fixture()), OPTIONS).env;

// 临时规则目录：kernelConstants 行 + det-numeric 行（真实登记），det-numeric 表取真实文件后交给 mutate 改坏一处。
function withDet(mutate, fn) {
  const tmp = testTempRoot('det-numeric-');
  try {
    const reg = real('registry.json');
    // 表名 det-numeric（卷二十七 §2.2）；registry 的 code 文法是小驼峰，故行代号 detNumeric、file 指 tables/det-numeric.json。
    const rows = [reg.rows.find((r) => r.code === 'kernelConstants'), reg.rows.find((r) => r.code === 'detNumeric')];
    const det = real('tables/det-numeric.json');
    const fnTables = det.rows.find((r) => r.key === 'fnTables').value;
    mutate(det.rows, fnTables);
    const all = { 'registry.json': { rows }, 'tables/kernel-constants.json': real('tables/kernel-constants.json'), 'tables/det-numeric.json': det };
    for (const [f, v] of Object.entries(all)) writeUnderTempRoot(tmp, f, typeof v === 'string' ? v : JSON.stringify(v));
    return fn(tmp);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

const codesOf = (dir) => {
  const read = readRules(ROOT, { rulesDir: dir });
  return [...read.errors, ...checkRules(read, env())].map((e) => e.code);
};

test('真实 det-numeric 表：按登记载入，零 error；fnTables 七值各一行（卷二十七 §2.2 :123、:171）', () => {
  const r = loadWorld(ROOT);
  assert.deepEqual(r.errors.filter((e) => e.severity === 'error'), []);
  assert.ok(r.ok);
  const det = r.rules.detNumeric;
  assert.deepEqual(Object.keys(det.fnTables).sort(), ['atan', 'cos', 'exp', 'ln', 'pow', 'sin', 'sqrt']);
  assert.equal(det.safeIntMax, 9007199254740991); // 2⁵³−1
  assert.ok(Array.isArray(det.mathAllow));
});

test('安全值：mathAllow 空表合法（空 = 全禁，卷二十七 :167）', () => {
  withDet((rows) => { rows.find((r) => r.key === 'mathAllow').value = []; }, (dir) => {
    assert.deepEqual(codesOf(dir), []);
  });
});

test('safeIntMax 只收 2⁵³−1（卷二十七 :168）', () => {
  withDet((rows) => { rows.find((r) => r.key === 'safeIntMax').value = 1; }, (dir) => {
    assert.deepEqual(codesOf(dir), ['E-DIM-DOMAIN-RANGE']);
  });
});

test('fnTables 缺一值即加载失败（卷二十七 :171 "缺行即加载失败"）', () => {
  withDet((rows, fnTables) => { delete fnTables.pow; }, (dir) => {
    assert.deepEqual(codesOf(dir), ['E-DIM-STRUCT-FIELD']);
  });
});

test('fnTables 空表即加载失败：detfn 每值各报一行缺失（卷二十七 :171）', () => {
  withDet((rows) => { rows.find((r) => r.key === 'fnTables').value = {}; }, (dir) => {
    assert.deepEqual(codesOf(dir), CODE_ENUMS.detfn.map(() => 'E-DIM-STRUCT-FIELD'));
  });
});

test('fnTables 多出 detfn 之外的行即加载失败（卷二十七 :123 七值封闭）', () => {
  withDet((rows, fnTables) => { fnTables.tan = { ...fnTables.ln }; }, (dir) => {
    assert.deepEqual(codesOf(dir), ['E-DIM-DOMAIN-ENUM']);
  });
});

test('旧写法 fn_exp 等前缀名被拒、不兼容（李白 11-18 21:3x 裁定第 1、4 条）', () => {
  withDet((rows, fnTables) => { fnTables.fn_exp = { ...fnTables.exp }; }, (dir) => {
    assert.deepEqual(codesOf(dir), ['E-DIM-DOMAIN-ENUM']);
  });
});

test('detfn 七个导出登 kernelApi（卷二十七 :564）', () => {
  const decl = JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8'));
  const registered = new Set(decl.kernelApi.exports.map((e) => e.export));
  const missing = CODE_ENUMS.detfn.map((k) => `kernel/det-math.mjs#${k}`).filter((x) => !registered.has(x));
  assert.deepEqual(missing, []);
});

test('step ≥ 1（卷二十七 :171）', () => {
  withDet((rows, fnTables) => { fnTables.sin.step = 0; fnTables.sin.values = [0]; fnTables.sin.domainMax = fnTables.sin.domainMin; }, (dir) => {
    assert.deepEqual(codesOf(dir), ['E-DIM-DOMAIN-RANGE']);
  });
});

test('values 长度 = (domainMax − domainMin) ÷ step + 1（卷二十七 :171）', () => {
  withDet((rows, fnTables) => { fnTables.sin.values.pop(); }, (dir) => {
    assert.deepEqual(codesOf(dir), ['E-DIM-DOMAIN-SIZE']);
  });
});

test('domainMax − domainMin 须被 step 整除（长度公式按整数格点）', () => {
  withDet((rows, fnTables) => { fnTables.atan.domainMax += 1; }, (dir) => {
    assert.deepEqual(codesOf(dir), ['E-DIM-DOMAIN-SIZE']);
  });
});

test('每行标度、步长须写依据（卷二十七 R27-5.2 :575）', () => {
  withDet((rows, fnTables) => { fnTables.sin.basis = ''; }, (dir) => {
    assert.deepEqual(codesOf(dir), ['E-DIM-STRUCT-FIELD']);
  });
});

test('exp 行不带 values（卷二十七 :572 "只指向卷二冻结表"）', () => {
  withDet((rows, fnTables) => { fnTables.exp.values = [100000000]; }, (dir) => {
    assert.deepEqual(codesOf(dir), ['E-DIM-STRUCT-FIELD']);
  });
});

test('ln 行不带 values（李白 Q-6：ln 只留卷二 fixedLn，行只指向）', () => {
  withDet((rows, fnTables) => { fnTables.ln.values = [100000000]; }, (dir) => {
    assert.deepEqual(codesOf(dir), ['E-DIM-STRUCT-FIELD']);
  });
});
