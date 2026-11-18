// 方法是测试的条目（卷十二 §4.5.1 :782 load_check、unit_test、property_test）经执行器真跑 impl 所指的测试文件（§2.2 :203），
// 期望 all_pass：全过才 pass；失败、skip、todo、一条没有、文件缺失都不过，不默认通过。必过集合里不过即拒（R12-5.1），
// not_run 也当不过（R12-10.7 :1036）；runsOn 不是 local_static 的本机不跑（R12-9.7 :990）。
// 写临时仓库只用 tempRepo() 拿到的目录加常量相对路径或 writeUnderTempRoot（S12-2）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { accRun, TEST_METHODS } from '../../tools/accept/run.mjs';
import { register } from '../../tools/accept/register.mjs';
import { ROOT, tempRepo } from './temp-repo.mjs';
import { writeUnderTempRoot } from './temp-root.mjs';

const FX = 'tests/accept/fx-inv.test.mjs';
const SRC = (body) => `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n${body}\n`;
const PASS = SRC("test('inv one', () => { assert.equal(2 + 2, 4); });\ntest('inv two', () => { assert.ok(true); });");
const ROW = (key, extra = {}) => ({
  itemKey: `vol12.${key}`, volume: 'vol12', localNo: key, form: 'invariant', method: 'property_test', target: 'tests_code', expect: 'all_pass',
  stage: 0, gates: ['pre_commit'], runsOn: 'local_static', source: '卷十二 §4.5 门禁设施自测', state: 'registered', zeroRows: [],
  rev: 1, revisions: [{ card: 'api-gatecore', date: '2026-11-18', rev: 1, summary: '门禁自测条目' }], ...extra,
});
// 只跑卷十二方法是测试的条目（条目过滤，R12-10.2）：临时仓库里真实的卷六不变量条目跑不起来（temp-repo.mjs），这里不看它们。
const ONLY = { volume: 'vol12', method: TEST_METHODS, state: ['implemented', 'in_core'] };
const failedOf = (report) => Object.fromEntries(report.items.failed.map((f) => [f.itemKey, { codes: f.codes, cases: f.cases }]));

// 在临时仓库登一条（或几条）方法是测试的条目：registered → implemented（带 impl）→ 目标状态，每步经登记器。
// 形参不叫 dir：临时根变量同名遮蔽即不认（S12-2 判法，call_edge）。
function setup(repo, rows, target) {
  writeUnderTempRoot(repo, FX, PASS);
  assert.deepEqual(register(repo, { items: rows }).errors, []);
  assert.deepEqual(register(repo, { items: rows.map((r) => ({ ...r, impl: FX, state: 'implemented' })) }).errors, []);
  if (target === 'in_core') assert.deepEqual(register(repo, { itemStates: Object.fromEntries(rows.map((r) => [r.itemKey, 'in_core'])) }).errors, []);
}
const run = async (repo, opts = {}) => (await accRun('pre_commit', 'x', null, { root: repo, filter: ONLY, ...opts })).report;

test('必过集合里的测试条目：测试文件全过即 pass、放行；失败、skip、todo、一条没有、文件缺失都不过并拒', async () => {
  const dir = tempRepo();
  try {
    setup(dir, [ROW('TX-1')], 'in_core');
    const ok = await run(dir);
    assert.equal(ok.verdict, 'pass');
    assert.equal(failedOf(ok)['vol12.TX-1'], undefined);
    assert.equal(ok.items.pass, 1);
    for (const [src, reason] of [
      [SRC("test('inv one', () => {});\ntest('inv two', () => { assert.equal(1, 2); });"), 'failed'],
      [SRC("test('inv one', () => {});\ntest.skip('inv two', () => {});"), 'skipped'],
      [SRC("test('inv one', () => {});\ntest.todo('inv two');"), 'skipped'],
      [SRC(''), 'empty'],
    ]) {
      writeUnderTempRoot(dir, FX, src);
      const r = await run(dir);
      assert.equal(r.verdict, 'fail', reason);
      assert.deepEqual(failedOf(r)['vol12.TX-1'], { codes: [], cases: [`${FX}:${reason}`] }, reason);
    }
    // 登记后测试文件被删：按条目缺必填字段报 E-ACC-ITEM-FORM（§2.12；impl 自 implemented 起必填），不默认通过。
    rmSync(join(dir, 'tests/accept/fx-inv.test.mjs'));
    const gone = await run(dir);
    assert.equal(gone.verdict, 'fail');
    assert.deepEqual(failedOf(gone)['vol12.TX-1'], { codes: ['E-ACC-ITEM-FORM'], cases: [`${FX}:missing`] });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('已实现未进必过集合的测试条目：不过照报，但不拦（R12-5.1 只拦必过集合）', async () => {
  const dir = tempRepo();
  try {
    setup(dir, [ROW('TX-1')], 'implemented');
    writeUnderTempRoot(dir, FX, SRC("test('inv one', () => { assert.fail('x'); });"));
    const r = await run(dir);
    assert.deepEqual(failedOf(r)['vol12.TX-1'], { codes: [], cases: [`${FX}:failed`] });
    assert.equal(r.verdict, 'pass');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('runsOn 为 cloud_ref 的必过测试条目：本机不跑记 not_run，必过集合里的 not_run 当不过；在登记种类的测试台上才跑', async () => {
  const dir = tempRepo();
  try {
    setup(dir, [ROW('TX-2', { runsOn: 'cloud_ref' })], 'in_core');
    const local = await run(dir);
    assert.equal(local.items.not_run, 1);
    assert.equal(local.verdict, 'fail');
    assert.deepEqual(failedOf(local)['vol12.TX-2'], { codes: [], cases: ['verdict:not_run'] });
    const cloud = await run(dir, { bench: 'cloud_ref' });
    assert.equal(cloud.verdict, 'pass');
    assert.equal(cloud.items.pass, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('两条条目共用一个测试文件：各自判 pass；文件不过两条都不过', async () => {
  const dir = tempRepo();
  try {
    setup(dir, [ROW('TX-1'), ROW('TX-3', { method: 'unit_test' })], 'in_core');
    assert.equal((await run(dir)).items.pass, 2);
    writeUnderTempRoot(dir, FX, SRC("test('inv one', () => { assert.fail('x'); });"));
    const bad = failedOf(await run(dir));
    assert.deepEqual([bad['vol12.TX-1'], bad['vol12.TX-3']], [{ codes: [], cases: [`${FX}:failed`] }, { codes: [], cases: [`${FX}:failed`] }]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('登记器：测试条目进 implemented 须有 impl 且在 tools/accept/ 或 tests/ 下（§2.2 :203），否则 E-ACC-ITEM-FORM、不写盘', () => {
  const dir = tempRepo();
  try {
    assert.deepEqual(register(dir, { items: [ROW('TX-1')] }).errors, []);
    assert.match(register(dir, { items: [{ ...ROW('TX-1'), state: 'implemented' }] }).errors.join('\n'), /E-ACC-ITEM-FORM vol12\.TX-1: impl missing/);
    assert.match(register(dir, { items: [{ ...ROW('TX-1'), state: 'implemented', impl: 'tests/accept/no-such.test.mjs' }] }).errors.join('\n'), /impl missing/);
    assert.match(register(dir, { items: [{ ...ROW('TX-1'), state: 'implemented', impl: 'world/ontology/state-owners.json' }] }).errors.join('\n'), /impl must be a file under tools\/accept\/ or tests\//);
    // 跳级进必过集合不许（R12-11.7 没有别的转移）。
    assert.match(register(dir, { itemStates: { 'vol12.TX-1': 'in_core' } }).errors.join('\n'), /registered -> in_core not allowed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('真仓库：卷六 A6-1.2 a（I1′ 守恒、I15′ 单一账户）、b（I2′ 非负）在必过集合里，经执行器真跑测试文件为 pass', async () => {
  const keys = ['vol6.A6-1.2.a', 'vol6.A6-1.2.b'];
  const { report } = await accRun('pre_commit', 'x', null, { root: ROOT, filter: { itemKey: keys } });
  assert.equal(report.items.total, 2);
  assert.equal(report.items.pass, 2);
  assert.equal(report.verdict, 'pass');
  for (const k of keys) assert.equal(failedOf(report)[k], undefined);
});
