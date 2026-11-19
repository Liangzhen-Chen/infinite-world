// 块 5 第 5-1 张《原语契约与执行器骨架》：卷九 §4.2 原语目录与执行器（:653 唯一入口、R9-2.3 一次事务 :658、R9-2.4 适配器按原语分 :659、
// R9-2.5 参数只有代号与数值 :660、:625 原语目录 20 个 15 族）；李白 11-18 22:10 块 5 体检裁定 五.1（执行器归规则层）、五.2／丙6／丙7／丙9
// （写者未上线的原语整笔拒收 E-ACT-WRITER-NOT-READY、E-ACT-PRIMITIVE 只管契约不合）、丙8（primitives.json 同路径改写）。
// 测试先写，期望值一律按卷文公式或账本三元键手算成字面量，不抄仓库当前读数。
// 只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { openAccount, balance } from '../../server-plugin/kernel/ledger.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { execute, primitiveContract, sortPrimitives, checkPrimitiveCatalog } from '../../server-plugin/primitives-runtime.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);

// 拒收会经 report 出口打日志；测试里换成空出口，断言只看返回值与状态。
useReportSink(() => {});

// 登记场景的持有人（块 3 起同法：测试 id 只进本进程的注册表，不进 world/）。
installVocab({
  vocab: W.vocab,
  idIndex: new Map([...W.idIndex, ['npc_a', 'person'], ['org_b', 'org'], ['item_q', 'item']]),
  tables: W.tables,
});
const ENGINE = { vocab: W.vocab, rules: W.rules };
const DOC = JSON.parse(readFileSync(join(ROOT, 'world/ontology/primitives.json'), 'utf8'));

// 账本三元键（卷六 §4.1 规则 1）：holder.purpose.kind.key，原语 transfer 的 from/to 即账户 id。
const BLD = { kind: 'res_building_share', key: 'bld_x' };
const UNMAT = 'purpose_unmaterialized';
const FROM = 'npc_a.purpose_unmaterialized.res_building_share.bld_x';
const TO = 'org_b.purpose_unmaterialized.res_building_share.bld_x';
const CTX = { node: 'test_setup', file: 'tests/kernel/primitives-runtime.test.mjs' };
const codeIs = (code) => (e) => e.code === code;
const clone = (v) => JSON.parse(JSON.stringify(v));

// 造前提：npc_a 名下一个零余额账户，再直接置余额（造前提用，断言不看这个数当基线）。
function funded(qty) {
  const state = {};
  assert.deepEqual(runTransaction(state, CTX, (s) => { openAccount(ENGINE, s, 'npc_a', BLD, UNMAT); }), { ok: true });
  state.accounts.npc_a.purpose_unmaterialized.res_building_share.bld_x = qty;
  return state;
}

// ---------- 原语目录（K5-12） ----------

test('原语目录：封闭 20 行、15 族、含 transform，旧格式字段已删，契约里无 string 类型', () => {
  assert.deepEqual(checkPrimitiveCatalog(DOC), { ok: true, errors: [] });
  assert.equal(DOC.primitives.length, 20);
  assert.equal(new Set(DOC.primitives.map((p) => p.family)).size, 15);
  assert.ok(DOC.primitives.some((p) => p.op === 'transform'));
  for (const field of ['$schema', 'kind', 'namespace', 'note', 'entries']) assert.equal(Object.hasOwn(DOC, field), false);
  for (const row of DOC.primitives) {
    for (const field of ['event', 'params', 'writable']) assert.equal(Object.hasOwn(row, field), false);
  }
  // learn 五字段（卷九 M9-23 :1556、R9-2.8 :663）：subject、skill、source、minutes、difficulty。
  const learn = DOC.primitives.find((p) => p.op === 'learn');
  assert.deepEqual(Object.keys(learn.required).sort(), ['difficulty', 'minutes', 'skill', 'source', 'subject']);
});

test('目录校验：string 类型、行数不符、旧格式字段都被拒（不为通过而不查）', () => {
  const badType = clone(DOC);
  badType.primitives[0].required.qty = 'string';
  const rType = checkPrimitiveCatalog(badType);
  assert.equal(rType.ok, false);
  assert.ok(rType.errors.some((e) => e.includes('type')));
  const short = clone(DOC);
  short.primitives.pop();
  assert.equal(checkPrimitiveCatalog(short).ok, false);
  const oldField = clone(DOC);
  oldField.primitives[0].params = [];
  assert.equal(checkPrimitiveCatalog(oldField).ok, false);
});

test('primitiveContract：transfer 契约恰 from/to/qty；目录外原语报 E-ACT-PRIMITIVE', () => {
  assert.deepEqual(primitiveContract('transfer'), {
    op: 'transfer', family: 'transfer', channel: 'ledger', required: { from: 'account', to: 'account', qty: 'integer' },
  });
  assert.throws(() => primitiveContract('nope'), codeIs('E-ACT-PRIMITIVE'));
  assert.throws(() => primitiveContract(undefined), codeIs('E-ACT-PRIMITIVE'));
});

// ---------- 契约校验（R9-2.3 第一句、R9-2.5） ----------

test('契约不合即 E-ACT-PRIMITIVE，整批不执行、状态不变', () => {
  const state = funded(10);
  const snap = clone(state);
  // 缺必填字段
  assert.throws(() => execute(ENGINE, state, [{ op: 'transfer', from: FROM, to: TO }], 'act_t'), codeIs('E-ACT-PRIMITIVE'));
  // 类型不合（qty 是文字）
  assert.throws(() => execute(ENGINE, state, [{ op: 'transfer', from: FROM, to: TO, qty: '三' }], 'act_t'), codeIs('E-ACT-PRIMITIVE'));
  // 值不是代号（中文文字）
  assert.throws(() => execute(ENGINE, state, [{ op: 'transfer', from: '买方', to: TO, qty: 1 }], 'act_t'), codeIs('E-ACT-PRIMITIVE'));
  // oneOf 一组都没给
  assert.throws(() => execute(ENGINE, state, [{ op: 'fact.set', entity: 'item_q', field: 'sealIntact' }], 'act_t'), codeIs('E-ACT-PRIMITIVE'));
  // oneOf 同时给了两个
  assert.throws(() => execute(ENGINE, state, [{ op: 'fact.set', entity: 'item_q', field: 'sealIntact', value: 1, delta: 2 }], 'act_t'), codeIs('E-ACT-PRIMITIVE'));
  // 未知原语
  assert.throws(() => execute(ENGINE, state, [{ op: 'nope' }], 'act_t'), codeIs('E-ACT-PRIMITIVE'));
  // primitives 不是列表
  assert.throws(() => execute(ENGINE, state, null, 'act_t'), codeIs('E-ACT-PRIMITIVE'));
  assert.deepEqual(state, snap);
});

test('特殊值不留绕过口子：qty 0/负数由账本拒、空串与 null 由契约拒、空 cause 拒', () => {
  const state = funded(10);
  const snap = clone(state);
  // execute 在调用方事务里执行（R9-2.3）：这里用 runTransaction 充当调用方。
  const run = (prims, cause = 'act_t') => runTransaction(state, CTX, (s) => execute(ENGINE, s, prims, cause));
  // 契约层：0 与负数都是 integer，放行到适配器；账本按正整数拒（卷六 §4.1 规则 2、kernel/ledger.mjs 的 isPosInt）。
  assert.deepEqual(run([{ op: 'transfer', from: FROM, to: TO, qty: 0 }]), { ok: false, code: 'E-DIM-DOMAIN-RANGE' });
  assert.deepEqual(run([{ op: 'transfer', from: FROM, to: TO, qty: -1 }]), { ok: false, code: 'E-DIM-DOMAIN-RANGE' });
  // 空串与 null 不是 id；空 cause 不是代号。
  assert.throws(() => execute(ENGINE, state, [{ op: 'transfer', from: '', to: TO, qty: 1 }], 'act_t'), codeIs('E-ACT-PRIMITIVE'));
  assert.throws(() => execute(ENGINE, state, [{ op: 'transfer', from: FROM, to: null, qty: 1 }], 'act_t'), codeIs('E-ACT-PRIMITIVE'));
  assert.throws(() => execute(ENGINE, state, [{ op: 'transfer', from: FROM, to: TO, qty: null }], 'act_t'), codeIs('E-ACT-PRIMITIVE'));
  assert.throws(() => execute(ENGINE, state, [{ op: 'transfer', from: FROM, to: TO, qty: 1 }], ''), codeIs('E-ACT-PRIMITIVE'));
  assert.deepEqual(state, snap);
});

// ---------- 卷二 §1.9 代号文法，按字段类型分开校 ----------

test('代号文法按字段类型分开校：CODE 至少 2 字符、KEY 至少 1 字符，实体 id 单段、账户 id 恰四段，大写与点分段都拒', () => {
  const state = funded(10);
  const snap = clone(state);
  // 契约不合即 E-ACT-PRIMITIVE，整批不执行；这部分在写任何状态之前抛出。
  const bad = (prims) => assert.throws(() => execute(ENGINE, state, prims, 'act_t'), codeIs('E-ACT-PRIMITIVE'));
  // 实体 id / 类别 id / 枚举值用 CODE：不许大写、不许单字符（尾段至少一个）。
  bad([{ op: 'holding.open', holdingKind: 'BadCode', holder: 'npc_a', subject: 'item_q' }]);
  bad([{ op: 'holding.open', holdingKind: 'a', holder: 'npc_a', subject: 'item_q' }]);
  bad([{ op: 'emit', verb: 'verb_x', visibility: 'PUBLIC' }]);
  // 实体 id 是单段代号：带点即不合。
  bad([{ op: 'destroy', entity: 'item.q' }]);
  // 账户 id 恰四段（holder.purpose.kind.key）：少一段即不合。
  bad([{ op: 'transfer', from: 'npc_a.purpose_unmaterialized.res_building_share', to: TO, qty: 1 }]);
  // 维度键用 KEY：允许后续大写、不许下划线。
  bad([{ op: 'fact.set', entity: 'item_q', field: 'SealIntact', value: 1 }]);
  bad([{ op: 'fact.set', entity: 'item_q', field: 'seal_intact', value: 1 }]);
  // 两条文法各自的总长上限（卷二 §1.9 :285：尾段 {1,47}／{0,47}，总长至多 48；登记为 kernelConstants.grammarMaxLength）。
  // 首字母 + 47 位（总长 48）合契约，走到适配器（写者未上线）；首字母 + 48 位（总长 49）即 E-ACT-PRIMITIVE。
  const run = (prims) => runTransaction(state, CTX, (s) => execute(ENGINE, s, prims, 'act_t'));
  const len48 = 'a' + 'b'.repeat(47);
  const len49 = 'a' + 'b'.repeat(48);
  assert.deepEqual(run([{ op: 'holding.open', holdingKind: len48, holder: 'npc_a', subject: 'item_q' }]), { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
  bad([{ op: 'holding.open', holdingKind: len49, holder: 'npc_a', subject: 'item_q' }]);
  // 实体 id（CODE）同一条上限。
  assert.deepEqual(run([{ op: 'destroy', entity: len48 }]), { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
  bad([{ op: 'destroy', entity: len49 }]);
  // 账户 id 的每一段都是 CODE：第一段越界即拒。
  bad([{ op: 'transfer', from: len49 + '.purpose_unmaterialized.res_building_share.bld_x', to: TO, qty: 1 }]);
  // 维度键（KEY）：首字母 + 47 位（总长 48）过、首字母 + 48 位（总长 49）拒。
  assert.deepEqual(run([{ op: 'fact.set', entity: 'item_q', field: len48, value: 1 }]), { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
  bad([{ op: 'fact.set', entity: 'item_q', field: len49, value: 1 }]);
  assert.deepEqual(state, snap);
});

test('holding.rescale 的 shares 键按 id 文法校：空键、非代号键、49 字符键拒，48 字符键过契约后按写者未上线拒收', () => {
  const state = funded(10);
  const snap = clone(state);
  const bad = (prims) => assert.throws(() => execute(ENGINE, state, prims, 'act_t'), codeIs('E-ACT-PRIMITIVE'));
  // shares 是 map<id, number>（卷九 :633）：键是实体 id，按 CODE 文法校、值按 number 校。
  const rescale = (shares) => [{ op: 'holding.rescale', holdingKind: 'hk_x', subject: 'item_q', shares }];
  // 空键与含非 ASCII 的键不是代号。
  bad(rescale({ '': 1 }));
  bad(rescale({ '中文': 1 }));
  // 键总长上限同卷二 §1.9 :285：首字母 + 48 位（总长 49）拒。
  const len48 = 'a' + 'b'.repeat(47);
  const len49 = 'a' + 'b'.repeat(48);
  bad(rescale({ [len49]: 1 }));
  // 48 字符合法键过契约，走到适配器（holding 写者未上线）。
  const run = (prims) => runTransaction(state, CTX, (s) => execute(ENGINE, s, prims, 'act_t'));
  assert.deepEqual(run(rescale({ [len48]: 1 })), { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
  assert.deepEqual(state, snap);
});

test('文法总长上限经 engine.rules 读：缺键、0、负数、非整数都拒，不回落默认也不跳过', () => {
  const state = funded(10);
  const snap = clone(state);
  const prims = [{ op: 'destroy', entity: 'item_q' }];
  const withMax = (max) => {
    const constants = { ...W.rules.kernelConstants };
    if (max === undefined) delete constants.grammarMaxLength;
    else constants.grammarMaxLength = max;
    return { vocab: W.vocab, rules: { ...W.rules, kernelConstants: constants } };
  };
  for (const engine of [withMax(undefined), withMax(0), withMax(-1), withMax('48'), { vocab: W.vocab, rules: {} }]) {
    assert.throws(() => execute(engine, state, prims, 'act_t'), codeIs('E-DIM-STRUCT-FIELD'));
  }
  assert.deepEqual(state, snap);
});

// ---------- 写者未上线的原语整笔拒收（五.1／五.2／丙6／丙7／丙9） ----------

test('写者未上线的原语整笔拒收 E-ACT-WRITER-NOT-READY，状态不变', () => {
  const state = funded(10);
  const snap = clone(state);
  const batches = [
    [{ op: 'emit', verb: 'verb_x', visibility: 'public' }],
    [{ op: 'learn', subject: 'npc_a', skill: 'skill_x', source: 'lsrc_x', minutes: 0, difficulty: null }],
    [{ op: 'transform', subject: 'item_q', variant: 'mvar_x', direction: 'apply', cause: 'act_x' }],
    [{ op: 'holding.open', holdingKind: 'hk_x', holder: 'npc_a', subject: 'item_q' }],
    [{ op: 'destroy', entity: 'item_q' }],
    [{ op: 'schedule', at: 100, action: 'act_x' }],
  ];
  for (const batch of batches) {
    const r = runTransaction(state, CTX, (s) => execute(ENGINE, s, batch, 'act_t'));
    assert.deepEqual(r, { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
    assert.deepEqual(state, snap);
  }
});

// ---------- 已建适配器：transfer（kernel/ledger.mjs#transfer） ----------

test('transfer 适配器：调用方事务里提交一笔账本转移，余额按三元键手算变化', () => {
  const state = funded(10);
  const r = runTransaction(state, CTX, (s) => execute(ENGINE, s, [{ op: 'transfer', from: FROM, to: TO, qty: 3 }], 'act_test_pay'));
  assert.deepEqual(r, { ok: true });
  assert.equal(balance(ENGINE, state, 'npc_a', BLD, UNMAT), 10 - 3);
  assert.equal(balance(ENGINE, state, 'org_b', BLD, UNMAT), 0 + 3);
});

test('任一适配器拒绝即由调用方事务整批回滚：transfer 已写的余额一并撤销', () => {
  const state = funded(10);
  const snap = clone(state);
  const r = runTransaction(state, CTX, (s) => execute(ENGINE, s, [
    { op: 'transfer', from: FROM, to: TO, qty: 3 },
    { op: 'emit', verb: 'verb_x', visibility: 'public' },
  ], 'act_t'));
  assert.deepEqual(r, { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
  assert.deepEqual(state, snap);
});

// ---------- 固定序（R9-2.3） ----------

test('固定序：按原语在目录中的次序，同原语按列表下标', () => {
  const a = { op: 'transfer', from: FROM, to: TO, qty: 1 };
  const b = { op: 'transfer', from: FROM, to: TO, qty: 2 };
  const e = { op: 'emit', verb: 'verb_x', visibility: 'public' };
  // transfer 在目录第 1 位、emit 第 16 位：乱序输入后仍 transfer 在前。
  assert.deepEqual(sortPrimitives([e, a, b]), [a, b, e]);
  // 同一原语保持输入下标，不按 qty 等字段排序。
  assert.deepEqual(sortPrimitives([b, a]), [b, a]);
  assert.throws(() => sortPrimitives([{ op: 'nope' }]), codeIs('E-ACT-PRIMITIVE'));
  assert.throws(() => sortPrimitives(null), codeIs('E-ACT-PRIMITIVE'));
});

// ---------- 一次 execute 一次事务由调用方保证（R9-2.3、R9-3.1 commit 段） ----------

test('execute 不自开事务：事务外调用被账本拒写，事务内随调用方提交或回滚', () => {
  const state = funded(10);
  // 事务外直接调用：执行器不自开事务，首个写入（账本 post）按卷二 §2.6 拒写，状态不变。
  assert.throws(() => execute(ENGINE, state, [{ op: 'transfer', from: FROM, to: TO, qty: 1 }], 'act_t'), codeIs('E-VIEW-UNDECLARED-WRITE'));
  assert.equal(balance(ENGINE, state, 'npc_a', BLD, UNMAT), 10);
  // 调用方事务内：写入随调用方提交。
  assert.deepEqual(runTransaction(state, CTX, (s) => { execute(ENGINE, s, [{ op: 'transfer', from: FROM, to: TO, qty: 1 }], 'act_t'); }), { ok: true });
  assert.equal(balance(ENGINE, state, 'npc_a', BLD, UNMAT), 9);
});
