// 块 5 第 5-7 张《块验收与整合》：块 5 各内核写者的加载期核对接进统一加载器（kernel/load/world.mjs），违者加载失败、用各自已登记码；
// 终止协议的声明表在加载通过时交入（installTermination，与 installStorage 同法）。依据：卷二 §2.6 :526–:529（终止登记与去留表）、
// §2.7 :774（事件的发出系统，核对口径归卷二十四 R24-1.3、R24-2.1）、§3.9 与 §4.3（效果族 E-EFF-*）；卷十八 §2.5、§2.6（持有种类行）。
// 每项先确认真实 world/ 加载通过，再在仓库外临时目录里只改坏一行，断言加载失败且报该写者的码。只跑不推进世界的小检查。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { registerTerminationCleanup, resetTermination } from '../../server-plugin/kernel/terminate.mjs';
import { testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIMS = 'world/ontology/dimensions';
const RULES = 'world/rules';

// 维度表目录与规则目录各抄一份到仓库外临时根，交 edit 改坏后经统一加载器加载；返回 error 行的 [码, 表]。
function loadEdited({ vocab, effects, rules } = {}) {
  const tmp = testTempRoot('b57-load-');
  try {
    const readDim = (f) => readFileSync(join(ROOT, DIMS, f), 'utf8');
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, `dims/${f}`, readDim(f));
    if (vocab) { const doc = JSON.parse(readDim('_vocab.json')); vocab(doc); writeUnderTempRoot(tmp, 'dims/_vocab.json', JSON.stringify(doc)); }
    if (effects) writeUnderTempRoot(tmp, 'dims/_effects.json', JSON.stringify(effects));
    const readRule = (f) => readFileSync(join(ROOT, RULES, f), 'utf8');
    const reg = JSON.parse(readRule('registry.json'));
    writeUnderTempRoot(tmp, 'rules/registry.json', JSON.stringify(reg));
    for (const row of reg.rows) writeUnderTempRoot(tmp, `rules/${row.file}`, readRule(row.file));
    if (rules) for (const [file, edit] of Object.entries(rules)) { const doc = JSON.parse(readRule(file)); edit(doc); writeUnderTempRoot(tmp, `rules/${file}`, JSON.stringify(doc)); }
    const r = loadWorld(ROOT, { dimensionsDir: relative(ROOT, join(tmp, 'dims')), rulesDir: join(tmp, 'rules') });
    return { ok: r.ok, errors: r.errors.filter((e) => e.severity === 'error').map((e) => [e.code, e.table]) };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

const firstEntry = (doc, family) => {
  const entries = doc.families[family].entries;
  return entries[Object.keys(entries).sort()[0]];
};

test('真实 world/ 原样抄出经统一加载器：verb 族、持有种类行、终止登记三项核对都不报', () => {
  assert.deepEqual(loadEdited(), { ok: true, errors: [] });
});

test('verb 族行缺表 B 必写栏（perceivable）即加载失败 E-EVT-SHAPE（卷二十四 R24-1.3）', () => {
  const r = loadEdited({ vocab: (doc) => { delete firstEntry(doc, 'verb').perceivable; } });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(([code, table]) => code === 'E-EVT-SHAPE' && table === 'verb'), JSON.stringify(r.errors));
});

test('持有种类行 gone 取 ho_stay 即加载失败 E-HK-PROTOCOL（卷十八 §2.5）', () => {
  const r = loadEdited({ vocab: (doc) => { firstEntry(doc, 'holding_kind').gone = 'ho_stay'; } });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(([code, table]) => code === 'E-HK-PROTOCOL' && table === 'holding_kind'), JSON.stringify(r.errors));
});

test('终止规则表把已建的 successor 登成未建即加载失败 E-DIM-STRUCT-FIELD（卷二 §2.6 :522；李白 11-19 11:1x ③）', () => {
  const r = loadEdited({ rules: { 'tables/terminate.json': (doc) => { doc.rows.find((x) => x.key === 'unbuilt').value.onTerminate = ['sink', 'successor']; } } });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(([code, table]) => code === 'E-DIM-STRUCT-FIELD' && table === 'terminate'), JSON.stringify(r.errors));
});

test('效果族行缺必写栏 params 即加载失败 E-EFF-PARAM（族表校验经 validateDimensions 接在统一加载器里，卷二 §3.9、§4.3）', () => {
  const r = loadEdited({ effects: { eff_test_broken: {} } });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(([code, table]) => code === 'E-EFF-PARAM' && table === '_effects'), JSON.stringify(r.errors));
});

test('加载通过即交入终止声明表：此后登记声明表里没有的清理函数即拒 E-DIM-REF-MISSING；未交入前同一登记照收', () => {
  resetTermination();
  registerTerminationCleanup('test/stray.mjs#cleanup', () => {});
  resetTermination();
  assert.ok(loadWorld(ROOT).ok);
  assert.throws(() => registerTerminationCleanup('test/stray.mjs#cleanup', () => {}), (e) => e.code === 'E-DIM-REF-MISSING');
  resetTermination();
});
