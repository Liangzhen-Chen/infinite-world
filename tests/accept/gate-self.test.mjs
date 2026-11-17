// P-1b 门禁自身条目（卷十二 §3.4 S12-1–6、11、12、13、16）：关口上真拦、登记器真拒；绕法用例在执行器回归里已逐条跑。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { accRun } from '../../tools/accept/run.mjs';
import { register } from '../../tools/accept/register.mjs';
import { readRegistry, LAYOUT } from '../../tools/accept/read.mjs';
import { ROOT, tempRepo } from './temp-repo.mjs';

const P1B = ['vol12.S12-1', 'vol12.S12-11', 'vol12.S12-12', 'vol12.S12-13', 'vol12.S12-16', 'vol12.S12-2', 'vol12.S12-3', 'vol12.S12-4', 'vol12.S12-5', 'vol12.S12-6'];
const failedOf = (report) => Object.fromEntries(report.items.failed.map((f) => [f.itemKey, f.codes]));
const withTemp = async (extra, fn) => { const dir = tempRepo(extra); try { return await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

test('十条都登记、阶段 0、每条所属类别正反用例齐', () => {
  const items = readRegistry(ROOT, 'items').filter((it) => P1B.includes(it.itemKey));
  assert.deepEqual(items.map((it) => it.itemKey).sort(), [...P1B].sort());
  const cases = readRegistry(ROOT, 'cases');
  for (const it of items) {
    assert.equal(it.stage, 0, it.itemKey);
    assert.notEqual(it.state, 'registered', it.itemKey);
    const pol = new Set(cases.filter((c) => c.scanClass === it.scanClass).map((c) => c.polarity));
    assert.deepEqual([...pol].sort(), ['must_fail', 'must_pass'], it.itemKey);
  }
});

test('S12-1、S12-11：运行时 import 门禁、执行器读墙钟即拒', async () => {
  const extra = { 'server-plugin/kernel/k.mjs': "import { accRun } from '../../tools/accept/run.mjs';\nexport const r = accRun;\n" };
  await withTemp(extra, async (dir) => {
    appendFileSync(join(dir, LAYOUT.accDir, 'run.mjs'), '\nexport const stampedAt = () => Date.now();\n');
    const { report } = await accRun('pre_commit', 'P-1b', null, { root: dir });
    const failed = failedOf(report);
    assert.equal(report.verdict, 'fail');
    assert.deepEqual(failed['vol12.S12-1'], ['E-PROC-IMPORT']);
    assert.deepEqual(failed['vol12.S12-11'], ['']);
  });
});

test('S12-2：离线代码绕过登记器写登记文件即计入；登记器自己写不计', async () => {
  const extra = { 'tools/fx-writer.mjs': "import { writeFileSync } from 'node:fs';\nexport const w = (root, t) => writeFileSync(root + '/tools/accept/items.json', t);\n" };
  await withTemp(extra, async (dir) => {
    const { rows } = await accRun('pre_commit', 'P-1b', null, { root: dir });
    const files = rows.filter((r) => r.itemKey === 'vol12.S12-2').map((r) => r.file);
    assert.ok(files.includes('tools/fx-writer.mjs'));
    assert.ok(!files.includes('tools/accept/register.mjs') && !files.includes('tools/accept/run.mjs'));
  });
});

test('S12-13、S12-16：手改检测器或条目三项而不走修订即拒；登记器同样拒，升版带记录才收', async () => {
  await withTemp({}, async (dir) => {
    const det = join(dir, LAYOUT.detectorsDir, 'file_set.mjs');
    writeFileSync(det, readFileSync(det, 'utf8').replace('row.print !== classPrint', 'row.print === classPrint'));
    const items = JSON.parse(readFileSync(join(dir, LAYOUT.accDir, 'items.json'), 'utf8'));
    const it = items.rows.find((r) => r.itemKey === 'vol2.S10');
    it.gates = ['pre_merge'];
    writeFileSync(join(dir, LAYOUT.accDir, 'items.json'), JSON.stringify(items));
    const failed = failedOf((await accRun('pre_commit', 'P-1b', null, { root: dir })).report);
    assert.deepEqual(failed['vol12.S12-13'], ['E-ACC-CRITERION-UNVERSIONED']);
    assert.deepEqual(failed['vol12.S12-16'], ['E-ACC-ITEM-DOWNGRADE']);

    const res = register(dir, { cases: [] });
    assert.match(res.errors.join('\n'), /E-ACC-CRITERION-UNVERSIONED crit_version/);
    assert.match(res.errors.join('\n'), /E-ACC-ITEM-DOWNGRADE vol2\.S10/);
    const crit = new Map(readRegistry(dir, 'criteria').map((c) => [c.scanClass, c]));
    const bump = (k, ref) => { const c = crit.get(k); return { scanClass: k, rev: c.rev + 1, log: [...c.log, { ref, rev: c.rev + 1 }] }; };
    const skip = register(dir, { criteria: [{ ...bump('crit_version', 'fx'), rev: crit.get('crit_version').rev + 2 }] });
    assert.match(skip.errors.join('\n'), /rev must stay or step by one/);
    const ok = register(dir, { criteria: [bump('crit_version', 'fx 反转判定'), bump('const_literal', 'fx 关口改动')] });
    assert.deepEqual(ok.errors, []);
    const after = failedOf((await accRun('pre_commit', 'P-1b', null, { root: dir })).report);
    assert.equal(after['vol12.S12-16'], undefined);
  });
});

test('S12-4、S12-6：登记文件被手改出越界期望值、文件名单即拒', async () => {
  await withTemp({}, async (dir) => {
    const p = join(dir, LAYOUT.accDir, 'items.json');
    const items = JSON.parse(readFileSync(p, 'utf8'));
    const it = items.rows.find((r) => r.itemKey === 'vol1.V-17');
    it.expect = 'mostly';
    it.params = { ...it.params, skipRows: ['server-plugin/rules/a.mjs:12'] };
    writeFileSync(p, JSON.stringify(items));
    const failed = failedOf((await accRun('pre_commit', 'P-1b', null, { root: dir })).report);
    assert.deepEqual(failed['vol12.S12-4'], ['E-ACC-ITEM-FORM', 'E-ACC-ITEM-PARAM']);
    assert.deepEqual(failed['vol12.S12-6'], ['E-ACC-SCAN-NAMELIST']);
  });
});

test('S12-5：执行器按条目编号分支即拒', async () => {
  await withTemp({}, async (dir) => {
    appendFileSync(join(dir, LAYOUT.accDir, 'run.mjs'), "\nexport const special = (it) => (it.localNo === 'V-17' ? 1 : 0);\n");
    const failed = failedOf((await accRun('pre_commit', 'P-1b', null, { root: dir })).report);
    assert.deepEqual(failed['vol12.S12-5'], ['E-ACC-SCAN-SELFNAME']);
  });
});

test('S12-12：执行记录里有扩展性条目改了代码即拒（新树没有扩展性条目，计数 0 是空跑）', async () => {
  const rec = JSON.stringify({ items: { failed: [{ itemKey: 'fx.A1', codes: ['E-ACC-EXT-CODE-CHANGED'] }] } });
  await withTemp({ [`${LAYOUT.outDir}/fxprint/pre_merge.json`]: rec }, async (dir) => {
    const failed = failedOf((await accRun('pre_commit', 'P-1b', null, { root: dir })).report);
    assert.deepEqual(failed['vol12.S12-12'], ['E-ACC-EXT-CODE-CHANGED']);
  });
});
