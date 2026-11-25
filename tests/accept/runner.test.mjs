// P-1 执行器、登记器、提交钩子：零基线门禁是拦不是报（卷十二 §1.3 第 4 条），报告确定（R12-10.5），绕法用例回归（R12-13.6）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { accRun, TEST_METHODS, baselineVerdict, baselineKeysAt } from '../../tools/accept/run.mjs';
import { ENUM } from '../../tools/accept/lib/item-form.mjs';
import { validate, register } from '../../tools/accept/register.mjs';
import { listFiles, readRegistry, REGISTRY, LAYOUT } from '../../tools/accept/read.mjs';
import { ROOT, tempRepo } from './temp-repo.mjs';
import { testTempRoot, writeUnderTempRoot } from './temp-root.mjs';

const HOOK = join(ROOT, 'tools', 'accept', 'commit-hook.mjs');
const NON_TEST_METHODS = { method: ENUM.method.filter((m) => !TEST_METHODS.includes(m)) };
const regs = () =>Object.fromEntries(Object.keys(REGISTRY).map((k) => [k, readRegistry(ROOT, k)]));

test('新树上提交关口：必过条目全过、基线不升，用例全过，放行', async () => {
  const { report } = await accRun('pre_commit', 'P-1', null, { root: ROOT });
  assert.equal(report.verdict, 'pass');
  // 必过集合里的条目全过；不过的只许是已实现、未进必过集合的条目（P-1b 的 S12-2、S12-3 新树非零，见 P-1b 回报）。
  const core = new Set(readRegistry(ROOT, 'items').filter((it) => it.state === 'in_core').map((it) => it.itemKey));
  assert.ok(report.items.failed.every((f) => f.itemKey !== 'bypass' && !core.has(f.itemKey)));
  assert.equal(report.items.pass + report.items.fail + report.items.not_run + report.items.blocked, report.items.total);
  assert.ok(report.items.pass >= core.size);
  // kernel 组 S13 逐行基线（B2-W2b）是 le_baseline：分量现值不要求 0，要求不高于上次合入（卷十二 R12-8.4、R12-8.5）。
  for (const [k, c] of Object.entries(report.components)) assert.ok(c.current <= (c.last ?? 0), k);
  assert.ok(Object.values(report.cases).length >= 10);
  // text_judge 类别下没有已实现条目（靠 tsc 才能判的反例报不出，卷十二 R12-11.7）：它的用例不跑，记 not_run；其余用例全过。
  const notRun = Object.keys(report.cases).filter((k) => report.cases[k] === 'not_run');
  // undeclared_io 同理（S15 的"传给登记之外的函数"未判，R12-3.4）。baseline_monotone 的用例现在真跑（V-11 当次判，R12-8.4）。
  const gap = (k) => k.startsWith('text_judge-') || k.startsWith('undeclared_io-');
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
  assert.deepEqual(Object.keys(failed).sort(), ['vol1.V-11', 'vol1.V-17', 'vol2.S1', 'vol2.S10', 'vol2.S16']);
  // 无基线按零基线：注入的 c_instance_id 行使 V-11 也拒（方案 R13、R12-8.9）。
  assert.deepEqual(failed['vol1.V-11'], ['E-ACC-BASELINE-UP']);
  assert.deepEqual(failed['vol2.S16'], ['E-KERNEL-UPWARD-IMPORT']);
  assert.equal(rows.find((r) => r.itemKey === 'vol2.S1').rowKey, 'c_instance_id|server-plugin/rules.mjs|f|str|0');
});

test('V-11 提交关口当次判：当次分量高于入库基线（上次合入）即拒；持平、下降通过，无基线按零基线（现值大于 0 即拒）；out/ 的旧上升记录不误挡', async () => {
  const dir = tempRepo();
  try {
    const bad = { 'server-plugin/rules.mjs': "\n\nexport function f(doc) { return 'npc_' + doc.id; }\n" };
    const opts = { root: dir, overrides: bad, prefixes: { prefixes: ['npc_'], singletons: [] } };
    // 入库基线里其余分量（内核组 S13、C0 报告档、Step 1 的 c_archive_ref 等）给足，别让它们掺进来；本用例只看 c_instance_id。
    // 分量表按登记表派生，不手列：新增分量时这里自动跟上，不会把新分量误当上升。
    const rows = (cur) => [{ compCode: 'c_instance_id', b0: 0, current: cur },
      ...readRegistry(ROOT, 'items').map((it) => it.baseComp).filter((c) => c && c !== 'c_instance_id').map((compCode) => ({ compCode, b0: 0, current: 1000000 }))];
    const v11 = (report) => report.items.failed.find((f) => f.itemKey === 'vol1.V-11');
    // 无基线：没有上次合入的值按零基线（方案 R13、R12-8.9），本次 1 个行即拒。
    assert.deepEqual(v11((await accRun('pre_commit', 'x', null, opts)).report).codes, ['E-ACC-BASELINE-UP']);
    // 上次合入为 0，本次 1 个 c_instance_id 行：当次上升，V-11 不过，整次拒绝。
    const up = (await accRun('pre_commit', 'x', null, { ...opts, baselineRows: rows(0) })).report;
    assert.deepEqual(v11(up).codes, ['E-ACC-BASELINE-UP']);
    assert.equal(up.verdict, 'fail');
    // 持平与下降：不拦。
    assert.equal(v11((await accRun('pre_commit', 'x', null, { ...opts, baselineRows: rows(1) })).report), undefined);
    assert.equal(v11((await accRun('pre_commit', 'x', null, { ...opts, baselineRows: rows(5) })).report), undefined);
    // out/ 旧上升记录不误挡：测试不能往登记路径 out/ 写，由用例 baseline_monotone-12 与检测器单测覆盖。
    assert.equal((await accRun('pre_commit', 'x', null, { root: dir, baselineRows: rows(0) })).report.cases['baseline_monotone-12'], 'pass');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('le_baseline 判定（R12-8.4、R12-8.9）：按分量行键集合判，新增任一条即不过；旧基线行按计数比；首次登记拿基线提交的 B0 判，没有 B0 不放行', () => {
  const a = { rowKey: 'c_text_kernel_4|server-plugin/kernel/a.mjs|f|literal_compare|0' };
  const b = { rowKey: 'c_text_kernel_4|server-plugin/kernel/b.mjs|f|literal_compare|0' };
  assert.equal(baselineVerdict([a], 1, { current: 1, rowKeys: [a.rowKey] }), 'pass');
  assert.equal(baselineVerdict([a], 0, { current: 5, rowKeys: [a.rowKey, b.rowKey] }), 'pass');
  // 新增一条即不过：现值集合不是基线集合的子集。
  assert.equal(baselineVerdict([a, b], 2, { current: 1, rowKeys: [a.rowKey] }), 'fail');
  // 总数持平、行键换了（一条消失一条新出现）也按集合判不过。
  assert.equal(baselineVerdict([b], 1, { current: 1, rowKeys: [a.rowKey] }), 'fail');
  // 旧基线行没有行键清单时退回行数比。
  assert.equal(baselineVerdict([a, b], 2, { current: 1 }), 'fail');
  assert.equal(baselineVerdict([a], 1, { current: 1 }), 'pass');
  // 首次登记（baseline.json 里没有该分量）：B0 由基线提交数出（R12-8.9），现值集合不是 B0 集合的子集即不过。
  assert.equal(baselineVerdict([a], 1, undefined, { count: 1, rowKeys: [a.rowKey] }), 'pass');
  assert.equal(baselineVerdict([a, b], 2, undefined, { count: 1, rowKeys: [a.rowKey] }), 'fail');
  // 没有基线提交的 B0：不放行，不拿本次实测当 B0。
  assert.equal(baselineVerdict([a], 1, undefined), 'fail');
});

test('R12-8.5：合入关口通过后写 baseline.json（只降不升，行键清单一并写，合入号必填），pre_commit 不写；新增一条即拒', async () => {
  const dir = tempRepo();
  try {
    // 临时仓库不带方法是测试的条目 import 的世界数据（temp-repo.mjs 注）：按合法转移退役，让关口能过、走到写基线那一步。
    const testCore = readRegistry(dir, 'items').filter((it) => it.state === 'in_core' && TEST_METHODS.includes(it.method)).map((it) => it.itemKey);
    assert.deepEqual(register(dir, { itemStates: Object.fromEntries(testCore.map((k) => [k, 'retired'])) }).errors, []);
    // 合入号取临时仓库自己的提交，不写死仓库外的提交号：新建 stateKeys.holdings 派生出新分量 c_write_holdings，
    // 合入关口按 R12-8.9 在该提交的内容上数 B0（git ls-tree），仓库外提交号在临时仓库里解析不到。
    const git = (...args) => execFileSync('git', ['-c', 'user.name=accept-test', '-c', 'user.email=accept-test@example.invalid', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'baseline');
    const ref = git('rev-parse', 'HEAD').trim();
    const baseFile = join(dir, LAYOUT.accDir, 'baseline.json');
    const baselineOf = () => JSON.parse(readFileSync(baseFile, 'utf8')).rows;
    const kernelRow = (rs) => rs.find((r) => r.compCode === 'c_text_kernel_4');
    // 合入号必填（R12-8.5）：不带 --merge-ref 拒写，已登记码 E-ACC-BASELINE-EDIT，基线文件不动。
    const beforeRefuse = readFileSync(baseFile, 'utf8');
    await assert.rejects(accRun('pre_merge', 'B2-W2b', null, { root: dir, write: true }), /E-ACC-BASELINE-EDIT/);
    assert.equal(readFileSync(baseFile, 'utf8'), beforeRefuse);
    const cli = spawnSync(process.execPath, [join(ROOT, 'tools', 'accept', 'run.mjs'), 'pre_merge', 'B2-W2b', '--write', '--root', dir], { encoding: 'utf8' });
    assert.equal(cli.status, 2);
    assert.match(cli.stderr, /E-ACC-BASELINE-EDIT/);
    assert.equal(readFileSync(baseFile, 'utf8'), beforeRefuse);
    // 写回只验"本次实测严格低于上次合入"（R12-8.5 :948）：不拿真实仓库基线的现值当参照（它已降到 0，比不出来）。
    // 先在临时仓库测出本次读数（pre_commit 不写基线），再把临时仓库的基线换成夹具：同一分量记成"读数 + 1000"、去掉行键清单
    // （按计数比，实测必低于它），其余分量沿用临时仓库副本。真实 baseline.json 不动。
    const measured = (await accRun('pre_commit', 'B2-W2b', null, { root: dir })).report.components.c_text_kernel_4.current;
    const fixture = JSON.parse(readFileSync(baseFile, 'utf8'));
    fixture.rows = fixture.rows.map((r) => {
      if (r.compCode !== 'c_text_kernel_4') return r;
      const { rowKeys, ...rest } = r;
      return { ...rest, current: measured + 1000 };
    });
    writeFileSync(baseFile, JSON.stringify(fixture) + '\n');
    const before = kernelRow(baselineOf()).current;
    assert.equal(before, measured + 1000);
    const first = await accRun('pre_merge', 'B2-W2b', null, { root: dir, write: true, mergeRef: ref });
    assert.equal(first.report.verdict, 'pass');
    const after = kernelRow(baselineOf());
    assert.ok(after.current < before, `${after.current} < ${before}`);
    assert.equal(after.current, first.report.components.c_text_kernel_4.current);
    assert.equal(after.rowKeys.length, after.current);
    assert.deepEqual(after.rowKeys, [...after.rowKeys].sort());
    assert.equal(after.lastMergeRef, ref);
    // 新出现一条（只在 kernel 组 S13 ④）：提交关口按行键集合判不过，码 E-ACC-BASELINE-UP；提交关口不写基线。
    const probe = { 'server-plugin/kernel/rx.mjs': readFileSync(join(dir, 'server-plugin/kernel/rx.mjs'), 'utf8') + "\nexport function zzzProbe(x) { return x === 'probe_marker'; }\n" };
    const up = await accRun('pre_commit', 'B2-W2b', null, { root: dir, overrides: probe, write: true });
    assert.equal(up.report.verdict, 'fail');
    assert.deepEqual(up.report.items.failed.find((f) => f.itemKey === 'vol2.S13.k4').codes, ['E-ACC-BASELINE-UP']);
    assert.equal(kernelRow(baselineOf()).current, after.current);
    // 提交关口即使通过也不写回（pre_commit 不是合入关口）。
    const same = await accRun('pre_commit', 'B2-W2b', null, { root: dir, write: true });
    assert.equal(same.report.verdict, 'pass');
    assert.deepEqual(kernelRow(baselineOf()), after);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('R12-8.9：新分量的 B0 在基线提交的内容上数出，不读当前工作树上的新增', async () => {
  const dir = testTempRoot('b0-');
  try {
    const git = (...args) => execFileSync('git', ['-c', 'user.name=accept-test', '-c', 'user.email=accept-test@example.invalid', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    writeUnderTempRoot(dir, 'world/ontology/state-owners.json', readFileSync(join(ROOT, 'world/ontology/state-owners.json')));
    // 基线提交里内核组的一个文件有 1 处裸字面量比较。
    writeUnderTempRoot(dir, 'server-plugin/kernel/a.mjs', "export function f(x) { return x === 'a' ? 1 : 0; }\n");
    git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'baseline');
    const ref = git('rev-parse', 'HEAD').trim();
    // 当前工作树多 1 处；数 B0 时不许看它。
    writeUnderTempRoot(dir, 'server-plugin/kernel/a.mjs', "export function f(x) { return x === 'a' ? 1 : 0; }\nexport function g(x) { return x !== 'b' ? 1 : 0; }\n");
    const item = { itemKey: 'fx.S13.k4', state: 'in_core', detector: 'typed_pos', scanClass: 'text_judge', baseComp: 'c_text_kernel_4', params: { checks: ['bareCompare'], groups: ['kernel'] } };
    const classes = new Map([['text_judge', readRegistry(ROOT, 'scanclasses').find((c) => c.scanClass === 'text_judge')]]);
    const keys = await baselineKeysAt(dir, ref, ['c_text_kernel_4'], [item], classes);
    assert.equal(keys.get('c_text_kernel_4').length, 1);
    assert.deepEqual(keys.get('c_text_kernel_4'), ['c_text_kernel_4|server-plugin/kernel/a.mjs|f|literal_compare|0']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('R12-8.9：合入关口首次登记新分量——基线提交 N 条、当前 N+1 条即拒；不超过时 B0 与现值一起登记，合入号写入 lastMergeRef', async () => {
  const dir = tempRepo();
  try {
    const git = (...args) => execFileSync('git', ['-c', 'user.name=accept-test', '-c', 'user.email=accept-test@example.invalid', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    // 临时仓库不带方法是测试的条目 import 的世界数据：按合法转移退役，关口才能过。
    const testCore = readRegistry(dir, 'items').filter((it) => it.state === 'in_core' && TEST_METHODS.includes(it.method)).map((it) => it.itemKey);
    assert.deepEqual(register(dir, { itemStates: Object.fromEntries(testCore.map((k) => [k, 'retired'])) }).errors, []);
    // 基线提交上还没有任何分量（首次登记），提交内容与当时的工作树一致。
    writeFileSync(join(dir, LAYOUT.accDir, 'baseline.json'), '{"rows": []}\n');
    git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'baseline');
    const ref = git('rev-parse', 'HEAD').trim();
    const baseFile = join(dir, LAYOUT.accDir, 'baseline.json');
    const baselineOf = () => JSON.parse(readFileSync(baseFile, 'utf8')).rows;
    const rx = readFileSync(join(dir, 'server-plugin/kernel/rx.mjs'), 'utf8');
    // 当前比基线提交多一条裸字面量比较（N+1）：现值集合不是 B0 集合的子集，拒，且不写基线。
    writeFileSync(join(dir, 'server-plugin/kernel/rx.mjs'), rx + "\nexport function zzzProbe(x) { return x === 'probe_marker'; }\n");
    const up = await accRun('pre_merge', 'B2-W2b', null, { root: dir, write: true, mergeRef: ref });
    assert.equal(up.report.verdict, 'fail');
    assert.deepEqual(up.report.items.failed.find((f) => f.itemKey === 'vol2.S13.k4').codes, ['E-ACC-BASELINE-UP']);
    assert.equal(up.report.components.c_text_kernel_4.current, up.report.components.c_text_kernel_4.b0 + 1);
    assert.deepEqual(baselineOf(), []);
    // 回到基线内容（当前条数不超过基线）：B0 与现值一起登记，合入号写进 lastMergeRef。
    writeFileSync(join(dir, 'server-plugin/kernel/rx.mjs'), rx);
    const ok = await accRun('pre_merge', 'B2-W2b', null, { root: dir, write: true, mergeRef: ref });
    assert.equal(ok.report.verdict, 'pass');
    const row = baselineOf().find((r) => r.compCode === 'c_text_kernel_4');
    assert.equal(row.b0, ok.report.components.c_text_kernel_4.current);
    assert.equal(row.current, row.b0);
    assert.equal(row.rowKeys.length, row.current);
    assert.equal(row.lastMergeRef, ref);
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
  // 本测试跑的是执行器关口；卡头自查（DND_CARD_AGENT=1）另有 tests/accept/card-selfcheck.test.mjs。
  // 派卡子代理的壳里跑全量测试时环境带着 DND_CARD_AGENT=1，这里显式按主会话跑，别把两条检查混在一起。
  const MAIN_ENV = { ...process.env, DND_CARD_AGENT: '' };
  const ok = spawnSync(process.execPath, [HOOK], { cwd: ROOT, encoding: 'utf8', env: MAIN_ENV });
  assert.equal(ok.status, 0, ok.stderr);
  const dir = tempRepo();
  try {
    mkdirSync(join(dir, 'server-plugin/kernel'), { recursive: true });
    writeFileSync(join(dir, 'server-plugin/kernel/k.mjs'), "import { r } from '../rules.mjs';\nexport const r2 = r;\n");
    const no = spawnSync(process.execPath, [HOOK, '--root', dir], { encoding: 'utf8', env: MAIN_ENV });
    assert.equal(no.status, 1);
    assert.match(no.stderr, /vol2\.S16 E-KERNEL-UPWARD-IMPORT/);
    // 干净的临时仓库：只被必过集合里方法是测试的条目拒（它们的测试文件 import 内核与世界数据，临时仓库不带，见 temp-repo.mjs），
    // 别的条目都不拒；违例那一份多出的正是 S16。
    const items = readRegistry(ROOT, 'items');
    const core = new Set(items.filter((it) => it.state === 'in_core').map((it) => it.itemKey));
    const testCore = items.filter((it) => core.has(it.itemKey) && !it.detector && TEST_METHODS.includes(it.method)).map((it) => it.itemKey).sort();
    // 钩子列出全部不过的条目；拦的是必过集合里的（R12-5.1），只比这些。
    const keysOf = (stderr) => stderr.split('\n').filter((l) => l.startsWith('  ')).map((l) => l.trim().split(' ')[0]).filter((k) => core.has(k)).sort();
    const clean = tempRepo();
    try {
      const c = spawnSync(process.execPath, [HOOK, '--root', clean], { encoding: 'utf8', env: MAIN_ENV });
      assert.deepEqual(keysOf(c.stderr), testCore);
      assert.ok(testCore.length > 0);
    } finally { rmSync(clean, { recursive: true, force: true }); }
    assert.deepEqual(keysOf(no.stderr), [...testCore, 'vol2.S16'].sort());
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
    // 条目过滤（R12-10.2）：只跑方法不是测试的条目——方法是测试的条目在临时仓库里必不过（temp-repo.mjs），这里只看必跑测试。
    // 滤掉的条目列 not_run、必过的当不过（R12-10.7 :1051），所以总判必为 fail；这里只看 required-tests 那部分，
    // 另返回拦下的必过条目（只要必过集合里的），应正好等于方法是测试的必过条目。
    const { report } = await accRun('pre_commit', 'x', null, { root: dir, runRequired: true, filter: NON_TEST_METHODS });
    const items = readRegistry(dir, 'items');
    const core = new Set(items.filter((it) => it.state === 'in_core').map((it) => it.itemKey));
    const blocked = report.items.failed.filter((f) => core.has(f.itemKey)).map((f) => f.itemKey).sort();
    return { failed: report.items.failed.filter((f) => f.itemKey === 'required-tests'), blocked };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const TEST_CORE = readRegistry(ROOT, 'items').filter((it) => it.state === 'in_core' && TEST_METHODS.includes(it.method)).map((it) => it.itemKey).sort();

test('必跑测试真执行：全过放行；失败、skip、todo、缺失文件、缺失名字都判不过；只跑登记名', async () => {
  const ok = await requiredVerdict(FXTEST("test('alpha one', () => { assert.ok(true); });"));
  assert.deepEqual(ok.failed, []);
  assert.ok(TEST_CORE.length > 0);
  assert.deepEqual(ok.blocked, TEST_CORE);
  // 未登记的测试失败不影响（只跑登记名）。
  const other = await requiredVerdict(FXTEST("test('alpha one', () => {});", "test('beta', () => { assert.fail('x'); });"));
  assert.deepEqual(other.failed, []);
  assert.deepEqual(other.blocked, TEST_CORE);
  for (const src of [
    FXTEST("test('alpha one', () => { assert.fail('x'); });"),
    FXTEST("test.skip('alpha one', () => {});"),
    FXTEST("test('alpha one', { skip: true }, () => {});"),
    FXTEST("test.todo('alpha one');"),
    FXTEST("test('gamma', () => {});"),
    null,
  ]) {
    const r = await requiredVerdict(src);
    assert.deepEqual(r.blocked, TEST_CORE, String(src));
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
