// P-1b 门禁自身条目（卷十二 §3.4 S12-1–6、11、12、13、16）：关口上真拦、登记器真拒；绕法用例在执行器回归里已逐条跑。
// 写临时仓库只用 tempRepo() 拿到的目录加常量相对路径（S12-2 的测试临时根口子，李白 11-17 裁定三）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync, appendFileSync, rmSync, mkdirSync } from 'node:fs';
import { accRun } from '../../tools/accept/run.mjs';
import { register } from '../../tools/accept/register.mjs';
import { readRegistry } from '../../tools/accept/read.mjs';
import { ROOT, tempRepo } from './temp-repo.mjs';

const P1B = ['vol12.S12-1', 'vol12.S12-11', 'vol12.S12-12', 'vol12.S12-13', 'vol12.S12-16', 'vol12.S12-2', 'vol12.S12-3', 'vol12.S12-4', 'vol12.S12-5', 'vol12.S12-6'];
const failedOf = (report) => Object.fromEntries(report.items.failed.map((f) => [f.itemKey, f.codes]));

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

test('S12-2、S12-11 的错误码登记在条目参数里，不留空码（李白 11-17 裁定一）', () => {
  const by = Object.fromEntries(readRegistry(ROOT, 'items').map((it) => [it.itemKey, (it.params || {}).code]));
  assert.equal(by['vol12.S12-2'], 'E-ACC-REGISTRY-WRITE');
  assert.equal(by['vol12.S12-11'], 'E-ACC-TOOL-NONDET');
});

test('S12-1、S12-11：运行时 import 门禁、执行器读墙钟即拒', async () => {
  const dir = tempRepo();
  try {
    mkdirSync(join(dir, 'server-plugin/kernel'), { recursive: true });
    writeFileSync(join(dir, 'server-plugin/kernel/k.mjs'), "import { accRun } from '../../tools/accept/run.mjs';\nexport const r = accRun;\n");
    appendFileSync(join(dir, 'tools/accept/run.mjs'), '\nexport const stampedAt = () => Date.now();\n');
    const { report } = await accRun('pre_commit', 'P-1b', null, { root: dir });
    const failed = failedOf(report);
    assert.equal(report.verdict, 'fail');
    assert.deepEqual(failed['vol12.S12-1'], ['E-PROC-IMPORT']);
    assert.deepEqual(failed['vol12.S12-11'], ['E-ACC-TOOL-NONDET']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('S12-2：离线代码绕过登记器写登记文件即计入（码 E-ACC-REGISTRY-WRITE）；登记器自己写不计', async () => {
  const dir = tempRepo();
  try {
    writeFileSync(join(dir, 'tools/fx-writer.mjs'), "import { writeFileSync } from 'node:fs';\nexport const w = (root, t) => writeFileSync(root + '/tools/accept/items.json', t);\n");
    const { rows } = await accRun('pre_commit', 'P-1b', null, { root: dir });
    const mine = rows.filter((r) => r.itemKey === 'vol12.S12-2');
    const files = mine.map((r) => r.file);
    assert.ok(files.includes('tools/fx-writer.mjs'));
    assert.ok(!files.includes('tools/accept/register.mjs') && !files.includes('tools/accept/run.mjs'));
    assert.ok(mine.every((r) => r.errorCode === 'E-ACC-REGISTRY-WRITE'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('S12-2 测试临时根：临时根加常量相对路径不计；拼接、变量路径、越出根、别处来的目录、同名参数一律计入', async () => {
  const dir = tempRepo();
  try {
    const head = "import { join } from 'node:path';\nimport { writeFileSync, appendFileSync, rmSync, mkdtempSync } from 'node:fs';\nimport { testTempRoot } from '../tests/accept/temp-root.mjs';\n";
    writeFileSync(join(dir, 'tools/fx-ok.mjs'), `${head}const d = testTempRoot();\nwriteFileSync(join(d, 'tools/accept/items.json'), 'x');\nappendFileSync(join(d, 'a', 'b.txt'), 'y');\nrmSync(d, { recursive: true });\n`);
    writeFileSync(join(dir, 'tools/fx-var.mjs'), `${head}const d = testTempRoot();\nexport const f = (n) => writeFileSync(join(d, n), 'x');\n`);
    writeFileSync(join(dir, 'tools/fx-concat.mjs'), `${head}const d = testTempRoot();\nwriteFileSync(d + '/x.json', 'x');\n`);
    writeFileSync(join(dir, 'tools/fx-other.mjs'), `${head}const d = mkdtempSync('x');\nwriteFileSync(join(d, 'a'), 'x');\n`);
    writeFileSync(join(dir, 'tools/fx-up.mjs'), `${head}const d = testTempRoot();\nwriteFileSync(join(d, '../x'), 'x');\n`);
    writeFileSync(join(dir, 'tools/fx-param.mjs'), `${head}const d = testTempRoot();\nexport const f = (d) => writeFileSync(join(d, 'a'), 'x');\n`);
    const { rows } = await accRun('pre_commit', 'P-1b', null, { root: dir });
    const files = [...new Set(rows.filter((r) => r.itemKey === 'vol12.S12-2').map((r) => r.file))].filter((f) => f.startsWith('tools/fx-'));
    assert.deepEqual(files, ['tools/fx-concat.mjs', 'tools/fx-other.mjs', 'tools/fx-param.mjs', 'tools/fx-up.mjs', 'tools/fx-var.mjs']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('S12-13、S12-16：手改检测器或条目三项而不走修订即拒；登记器同样拒，升版带记录才收', async () => {
  const dir = tempRepo();
  try {
    writeFileSync(join(dir, 'tools/accept/detectors/file_set.mjs'), readFileSync(join(dir, 'tools/accept/detectors/file_set.mjs'), 'utf8').replace('row.print !== classPrint', 'row.print === classPrint'));
    const items = JSON.parse(readFileSync(join(dir, 'tools/accept/items.json'), 'utf8'));
    const it = items.rows.find((r) => r.itemKey === 'vol2.S10');
    it.gates = ['pre_merge'];
    writeFileSync(join(dir, 'tools/accept/items.json'), JSON.stringify(items));
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
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('S12-4、S12-6：登记文件被手改出越界期望值、文件名单即拒', async () => {
  const dir = tempRepo();
  try {
    const items = JSON.parse(readFileSync(join(dir, 'tools/accept/items.json'), 'utf8'));
    const it = items.rows.find((r) => r.itemKey === 'vol1.V-17');
    it.expect = 'mostly';
    it.params = { ...it.params, skipRows: ['server-plugin/rules/a.mjs:12'] };
    writeFileSync(join(dir, 'tools/accept/items.json'), JSON.stringify(items));
    const failed = failedOf((await accRun('pre_commit', 'P-1b', null, { root: dir })).report);
    assert.deepEqual(failed['vol12.S12-4'], ['E-ACC-ITEM-FORM', 'E-ACC-ITEM-PARAM']);
    assert.deepEqual(failed['vol12.S12-6'], ['E-ACC-SCAN-NAMELIST']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('S12-5：执行器按条目编号分支即拒', async () => {
  const dir = tempRepo();
  try {
    appendFileSync(join(dir, 'tools/accept/run.mjs'), "\nexport const special = (it) => (it.localNo === 'V-17' ? 1 : 0);\n");
    const failed = failedOf((await accRun('pre_commit', 'P-1b', null, { root: dir })).report);
    assert.deepEqual(failed['vol12.S12-5'], ['E-ACC-SCAN-SELFNAME']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('S12-12：执行记录里有扩展性条目改了代码即拒（新树没有扩展性条目，计数 0 是空跑）', async () => {
  const dir = tempRepo();
  try {
    mkdirSync(join(dir, 'tools/accept/out/fxprint'), { recursive: true });
    writeFileSync(join(dir, 'tools/accept/out/fxprint/pre_merge.json'), JSON.stringify({ items: { failed: [{ itemKey: 'fx.A1', codes: ['E-ACC-EXT-CODE-CHANGED'] }] } }));
    const failed = failedOf((await accRun('pre_commit', 'P-1b', null, { root: dir })).report);
    assert.deepEqual(failed['vol12.S12-12'], ['E-ACC-EXT-CODE-CHANGED']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
