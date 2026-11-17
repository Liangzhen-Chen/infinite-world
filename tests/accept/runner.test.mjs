// P-1 执行器、登记器、提交钩子：零基线门禁是拦不是报（卷十二 §1.3 第 4 条），报告确定（R12-10.5），绕法用例回归（R12-13.6）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { accRun } from '../../tools/accept/run.mjs';
import { validate, register } from '../../tools/accept/register.mjs';
import { listFiles, readRegistry, REGISTRY, LAYOUT } from '../../tools/accept/read.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(ROOT, 'tools', 'accept', 'commit-hook.mjs');
const regs = () => Object.fromEntries(Object.keys(REGISTRY).map((k) => [k, readRegistry(ROOT, k)]));

// 只带登记、声明表与用例片段的临时仓库（非 git，按磁盘遍历）。
function tempRepo(extra) {
  const dir = mkdtempSync(join(tmpdir(), 'p1-accept-'));
  const copy = (rel) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); copyFileSync(join(ROOT, rel), join(dir, rel)); };
  copy(LAYOUT.stateOwners);
  for (const r of Object.values(REGISTRY)) copy(`${LAYOUT.accDir}/${r.file}`);
  for (const it of readRegistry(ROOT, 'items')) copy(it.impl);
  for (const f of readdirSync(join(ROOT, LAYOUT.bypassDir), { recursive: true })) {
    const rel = `${LAYOUT.bypassDir}/${String(f).replace(/\\/g, '/')}`;
    if (rel.endsWith('.txt') || rel.endsWith('.json')) copy(rel);
  }
  for (const [rel, text] of Object.entries(extra || {})) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); }
  return dir;
}

test('新树上提交关口：四项扫描计数全 0，用例全过，放行', async () => {
  const { report } = await accRun('pre_commit', 'P-1', null, { root: ROOT });
  assert.equal(report.verdict, 'pass');
  assert.equal(report.items.fail, 0);
  assert.equal(report.items.pass, report.items.total);
  for (const c of Object.values(report.components)) assert.equal(c.current, 0);
  assert.ok(Object.values(report.cases).length >= 10);
  assert.ok(Object.values(report.cases).every((v) => v === 'pass'));
});

test('报告确定：同内容两次逐字节相同，打乱文件遍历次序也相同', async () => {
  const files = listFiles(ROOT);
  const a = await accRun('pre_commit', 'P-1', null, { root: ROOT, files });
  const b = await accRun('pre_commit', 'P-1', null, { root: ROOT, files: [...files].reverse() });
  const c = await accRun('pre_commit', 'P-1', null, { root: ROOT });
  assert.equal(a.text, b.text);
  assert.equal(a.text, c.text);
  assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(a.text));
});

test('门禁是拦：规则层或内核里出现一处违例即拒，行键不含行号', async () => {
  const bad = {
    'server-plugin/kernel/k.mjs': "import { r } from '../rules.mjs';\nexport const m = 60 * 24;\n",
    'server-plugin/rules.mjs': "\n\nexport function f(doc) { if (doc.worldVersion > 0) return 'npc_' + doc.id; }\n",
  };
  const { report, rows } = await accRun('pre_commit', 'P-1', null, { root: ROOT, overrides: bad, prefixes: { prefixes: ['npc_'], singletons: [] } });
  assert.equal(report.verdict, 'fail');
  const failed = Object.fromEntries(report.items.failed.map((f) => [f.itemKey, f.codes]));
  assert.deepEqual(Object.keys(failed).sort(), ['vol1.V-17', 'vol2.S1', 'vol2.S10', 'vol2.S16']);
  assert.deepEqual(failed['vol2.S16'], ['E-KERNEL-UPWARD-IMPORT']);
  assert.equal(rows.find((r) => r.itemKey === 'vol2.S1').rowKey, 'c_instance_id|server-plugin/rules.mjs|f|str|0');
});

test('登记器：形式、参数、门禁设施、状态转移不合即拒，不写盘', () => {
  const r = regs();
  const bad = (patch) => validate(ROOT, { ...r, ...patch });
  const item = r.items[0];
  assert.match(bad({ items: [{ ...item, method: 'unit_test' }] }).join('\n'), /E-ACC-ITEM-FORM/);
  assert.match(bad({ items: [{ ...item, params: { ...item.params, files: ['server-plugin/a.mjs'] } }] }).join('\n'), /E-ACC-ITEM-PARAM/);
  assert.match(bad({ items: [{ ...item, params: { ...item.params, groups: ['nosuchgroup'] } }] }).join('\n'), /E-ACC-ITEM-PARAM/);
  assert.match(bad({ items: [{ ...item, expect: 'report_only' }] }).join('\n'), /E-ACC-ITEM-FORM/);
  assert.match(bad({ gatefacs: [...r.gatefacs, { facCode: 'kernel', paths: ['x.mjs'], inRepo: true, ownerVol: 'vol12', gateCard: 'G-3', entries: '待补' }] }).join('\n'), /E-ACC-GATEFAC-FORM/);
  assert.match(bad({ gatefacs: [...r.gatefacs, { facCode: 'x-read', paths: ['tools/x/**'], inRepo: true, ownerVol: 'vol12', gateCard: 'G-3', entries: '待补' }] }).join('\n'), /E-ACC-GATEFAC-FORM/);
  assert.match(bad({ cases: r.cases.filter((c) => !(c.scanClass === item.scanClass && c.polarity === 'must_pass')) }).join('\n'), /R12-13.3/);
  assert.deepEqual(validate(ROOT, r), []);

  const dir = tempRepo();
  try {
    const before = readFileSync(join(dir, LAYOUT.accDir, 'items.json'), 'utf8');
    const res = register(dir, { items: [{ ...item, itemKey: 'vol2.Sx', localNo: 'Sx', state: 'in_core' }] });
    assert.match(res.errors.join('\n'), /must start registered/);
    assert.equal(readFileSync(join(dir, LAYOUT.accDir, 'items.json'), 'utf8'), before);
    const back = register(dir, { itemStates: { [item.itemKey]: 'registered' } });
    assert.match(back.errors.join('\n'), /not allowed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('绕法用例回归：结果与极性不符即 E-ACC-BYPASS-REGRESSION，关口拒绝', async () => {
  const dir = tempRepo();
  try {
    const res = register(dir, { cases: [{ caseKey: 'instance_name-90', scanClass: 'instance_name', group: 'rules', polarity: 'must_pass', fixture: `${LAYOUT.bypassDir}/instance_name-01.txt`, origin: 'P-1 回归自测', addedAtRev: 1 }] });
    assert.deepEqual(res.errors, []);
    const { report } = await accRun('pre_commit', 'P-1', null, { root: dir });
    assert.equal(report.verdict, 'fail');
    assert.deepEqual(report.items.failed, [{ itemKey: 'bypass', codes: ['E-ACC-BYPASS-REGRESSION'], cases: ['instance_name-90'] }]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('提交钩子：新树放行（退出码 0），有违例拒绝（退出码 1）', () => {
  const ok = spawnSync(process.execPath, [HOOK], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const dir = tempRepo({ 'server-plugin/kernel/k.mjs': "import { r } from '../rules.mjs';\nexport const r2 = r;\n" });
  try {
    const no = spawnSync(process.execPath, [HOOK, '--root', dir], { encoding: 'utf8' });
    assert.equal(no.status, 1);
    assert.match(no.stderr, /vol2\.S16 E-KERNEL-UPWARD-IMPORT/);
    const clean = tempRepo();
    try { assert.equal(spawnSync(process.execPath, [HOOK, '--root', clean], { encoding: 'utf8' }).status, 0); } finally { rmSync(clean, { recursive: true, force: true }); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
