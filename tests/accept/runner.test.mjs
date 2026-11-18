// P-1 执行器、登记器、提交钩子：零基线门禁是拦不是报（卷十二 §1.3 第 4 条），报告确定（R12-10.5），绕法用例回归（R12-13.6）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { accRun } from '../../tools/accept/run.mjs';
import { validate, register } from '../../tools/accept/register.mjs';
import { listFiles, readRegistry, REGISTRY, LAYOUT } from '../../tools/accept/read.mjs';
import { ROOT, tempRepo } from './temp-repo.mjs';
import { writeUnderTempRoot } from './temp-root.mjs';

const HOOK = join(ROOT, 'tools', 'accept', 'commit-hook.mjs');
const regs = () => Object.fromEntries(Object.keys(REGISTRY).map((k) => [k, readRegistry(ROOT, k)]));

test('新树上提交关口：必过条目计数全 0，用例全过，放行', async () => {
  const { report } = await accRun('pre_commit', 'P-1', null, { root: ROOT });
  assert.equal(report.verdict, 'pass');
  // 必过集合里的条目全过；不过的只许是已实现、未进必过集合的条目（P-1b 的 S12-2、S12-3 新树非零，见 P-1b 回报）。
  const core = new Set(readRegistry(ROOT, 'items').filter((it) => it.state === 'in_core').map((it) => it.itemKey));
  assert.ok(report.items.failed.every((f) => f.itemKey !== 'bypass' && !core.has(f.itemKey)));
  assert.equal(report.items.pass + report.items.fail + report.items.not_run + report.items.blocked, report.items.total);
  assert.ok(report.items.pass >= core.size);
  for (const c of Object.values(report.components)) assert.equal(c.current, 0);
  assert.ok(Object.values(report.cases).length >= 10);
  // text_judge 类别下没有已实现条目（靠 tsc 才能判的反例报不出，卷十二 R12-11.7）：它的用例不跑，记 not_run；其余用例全过。
  const notRun = Object.keys(report.cases).filter((k) => report.cases[k] === 'not_run');
  // undeclared_io 同理（S15 的"传给登记之外的函数"未判，R12-3.4）；baseline_monotone 同理（V-11 退回 registered：
  // 提交钩子不写执行记录，当次上升拦不住，R12-8.4）。
  const gap = (k) => k.startsWith('text_judge-') || k.startsWith('undeclared_io-') || k.startsWith('baseline_monotone-');
  assert.ok(notRun.length > 0 && notRun.every(gap));
  assert.ok(Object.entries(report.cases).every(([k, v]) => v === 'pass' || gap(k)));
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
  const core = new Set(readRegistry(ROOT, 'items').filter((it) => it.state === 'in_core').map((it) => it.itemKey));
  const failed = Object.fromEntries(report.items.failed.filter((f) => core.has(f.itemKey)).map((f) => [f.itemKey, f.codes]));
  assert.deepEqual(Object.keys(failed).sort(), ['vol1.V-17', 'vol2.S1', 'vol2.S10', 'vol2.S16']);
  assert.deepEqual(failed['vol2.S16'], ['E-KERNEL-UPWARD-IMPORT']);
  assert.equal(rows.find((r) => r.itemKey === 'vol2.S1').rowKey, 'c_instance_id|server-plugin/rules.mjs|f|str|0');
});

test('登记器：形式、参数、门禁设施、状态转移不合即拒，不写盘', () => {
  const r = regs();
  const bad = (patch) => validate(ROOT, { ...r, ...patch });
  const item = r.items.find((it) => it.itemKey === 'vol1.V-17');
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
    // 没有别的转移（卷十二 :1098）：implemented 退回 registered，即使同时修订判据，也一律拒
    const impl = r.items.find((it) => it.state === 'implemented' && it.scanClass);
    assert.match(register(dir, { itemStates: { [impl.itemKey]: 'registered' } }).errors.join('\n'), /implemented -> registered not allowed/);
    const crow = r.criteria.find((c) => c.scanClass === impl.scanClass);
    const withRev = { ...crow, rev: crow.rev + 1, log: [...crow.log, { ref: 'P-1 自测', rev: crow.rev + 1 }] };
    assert.match(register(dir, { itemStates: { [impl.itemKey]: 'registered' }, criteria: [withRev] }).errors.join('\n'), /implemented -> registered not allowed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('绕法用例回归：结果与极性不符即 E-ACC-BYPASS-REGRESSION，关口拒绝', async () => {
  const dir = tempRepo();
  try {
    const res = register(dir, { cases: [{ caseKey: 'instance_name-90', scanClass: 'instance_name', group: 'rules', polarity: 'must_pass', fixture: `${LAYOUT.bypassDir}/instance_name-01.txt`, origin: 'P-1 回归自测', addedAtRev: 1 }] });
    assert.deepEqual(res.errors, []);
    const { report } = await accRun('pre_commit', 'P-1', null, { root: dir });
    assert.equal(report.verdict, 'fail');
    assert.deepEqual(report.items.failed.filter((f) => f.itemKey === 'bypass'), [{ itemKey: 'bypass', codes: ['E-ACC-BYPASS-REGRESSION'], cases: ['instance_name-90'] }]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('提交钩子：新树放行（退出码 0），有违例拒绝（退出码 1）', () => {
  const ok = spawnSync(process.execPath, [HOOK], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const dir = tempRepo();
  try {
    mkdirSync(join(dir, 'server-plugin/kernel'), { recursive: true });
    writeFileSync(join(dir, 'server-plugin/kernel/k.mjs'), "import { r } from '../rules.mjs';\nexport const r2 = r;\n");
    const no = spawnSync(process.execPath, [HOOK, '--root', dir], { encoding: 'utf8' });
    assert.equal(no.status, 1);
    assert.match(no.stderr, /vol2\.S16 E-KERNEL-UPWARD-IMPORT/);
    const clean = tempRepo();
    try { assert.equal(spawnSync(process.execPath, [HOOK, '--root', clean], { encoding: 'utf8' }).status, 0); } finally { rmSync(clean, { recursive: true, force: true }); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// 必跑测试真执行（李白 11-17 裁定②）：登记的 requiredTests 由执行器真跑 node --test（只跑登记名），失败、skip、todo、缺失都判不过，全过放行。
const FAC = { facCode: 'fx-temp', paths: ['tests/accept/fx-helper.mjs'], inRepo: false, ownerVol: 'vol12', gateCard: '—', entries: ['w'], assertedWriters: ['w'], writerAsserts: ['a'], requiredTests: [{ file: 'tests/accept/fx.test.mjs', names: ['alpha'] }], testGlobs: ['tests/accept/*.test.mjs'] };
const FXTEST = (body, other = '') => `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n${body}\n${other}`;
async function requiredVerdict(testSrc) {
  const dir = tempRepo();
  try {
    assert.deepEqual(register(dir, { gatefacs: [FAC] }).errors, []);
    writeUnderTempRoot(dir, 'tests/accept/fx-helper.mjs', 'export function w() {}\n');
    if (testSrc !== null) writeUnderTempRoot(dir, 'tests/accept/fx.test.mjs', testSrc);
    const { report } = await accRun('pre_commit', 'x', null, { root: dir, runRequired: true });
    return { verdict: report.verdict, failed: report.items.failed.filter((f) => f.itemKey === 'required-tests') };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('必跑测试真执行：全过放行；失败、skip、todo、缺失文件、缺失名字都判不过；只跑登记名', async () => {
  assert.deepEqual(await requiredVerdict(FXTEST("test('alpha one', () => { assert.ok(true); });")), { verdict: 'pass', failed: [] });
  // 未登记的测试失败不影响（只跑登记名）。
  assert.equal((await requiredVerdict(FXTEST("test('alpha one', () => {});", "test('beta', () => { assert.fail('x'); });"))).verdict, 'pass');
  for (const src of [
    FXTEST("test('alpha one', () => { assert.fail('x'); });"),
    FXTEST("test.skip('alpha one', () => {});"),
    FXTEST("test('alpha one', { skip: true }, () => {});"),
    FXTEST("test.todo('alpha one');"),
    FXTEST("test('gamma', () => {});"),
    null,
  ]) {
    const r = await requiredVerdict(src);
    assert.equal(r.verdict, 'fail', String(src));
    assert.deepEqual(r.failed.map((f) => f.codes), [['E-ACC-REQUIRED-TEST']], String(src));
  }
});

test('删登记不能绕过：assertedWriters 必须同时有非空 requiredTests，否则登记报错', () => {
  const dir = tempRepo();
  try {
    const { requiredTests, ...noReq } = FAC;
    assert.match(register(dir, { gatefacs: [noReq] }).errors.join('\n'), /assertedWriters requires non-empty requiredTests/);
    assert.match(register(dir, { gatefacs: [{ ...FAC, requiredTests: [] }] }).errors.join('\n'), /assertedWriters requires non-empty requiredTests/);
    assert.deepEqual(register(dir, { gatefacs: [FAC] }).errors, []);
    assert.deepEqual(register(dir, { gatefacs: [{ ...noReq, assertedWriters: [] }] }).errors, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
