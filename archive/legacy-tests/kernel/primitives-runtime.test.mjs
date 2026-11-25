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
import { runTransaction, currentTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { openAccount, balance } from '../../server-plugin/kernel/ledger.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { execute, primitiveContract, sortPrimitives, checkPrimitiveCatalog } from '../../server-plugin/primitives-runtime.mjs';
import { installEventLog, resetEventLog } from '../../server-plugin/kernel/events.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);
// 事件 id 经 §1.10 派生函数（sha256）取，摘要能力照装配时注入（卷二 §2.9）。
installDigestCap(createDigestCap());

// 拒收会经 report 出口打日志；测试里换成空出口，断言只看返回值与状态。
useReportSink(() => {});

// 登记场景的持有人（块 3 起同法：测试 id 只进本进程的注册表，不进 world/）。
// cause 是规则/指令代号（卷二十四表 A :139）；块 5 执行器不写事务事件、也不拿 cause 顶 verb（5-2 只核必须改 2）。
const CAUSE = 'act_trade_test';
const vocab = W.vocab;
installVocab({
  vocab,
  idIndex: new Map([...W.idIndex, ['npc_a', 'person'], ['org_b', 'org'], ['item_q', 'item']]),
  tables: W.tables,
});
const ENGINE = { vocab, rules: W.rules, units: W.env.units, template: { seed: 'test_world_seed' } };
const DOC = JSON.parse(readFileSync(join(ROOT, 'world/ontology/primitives.json'), 'utf8'));

// 账本三元键（卷六 §4.1 规则 1）：holder.purpose.kind.key，原语 transfer 的 from/to 即账户 id。
const BLD = { kind: 'res_building_share', key: 'bld_x' };
const UNMAT = 'purpose_unmaterialized';
const FROM = 'npc_a.purpose_unmaterialized.res_building_share.bld_x';
const TO = 'org_b.purpose_unmaterialized.res_building_share.bld_x';
const CTX = { node: 'test_setup', file: 'tests/kernel/primitives-runtime.test.mjs' };
const codeIs = (code) => (e) => e.code === code;
const clone = (v) => JSON.parse(JSON.stringify(v));

// 造前提：npc_a 名下一个零余额账户，再直接置余额（造前提用，断言不看这个数当基线）；
// 世界时钟与事件日志簿也在这里就位（mount 次序同运行时；块 5 执行器不写事件）。
function funded(qty) {
  const state = { clock: { minute: 0, seq: 0 } };
  installEventLog({ entries: [] });
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

test('特殊值不留绕过口子：qty 0/负数整批拒、空串与 null 由契约拒、空 cause 拒', () => {
  const state = funded(10);
  const snap = clone(state);
  // execute 在调用方事务里执行（R9-2.3）：这里用 runTransaction 充当调用方。
  const run = (prims, cause = CAUSE) => runTransaction(state, CTX, (s) => execute(ENGINE, s, prims, cause));
  // 0 与负数都是 integer，契约放行；块 5 没有 emit 原语/事件写者，整笔在写任何状态之前拒收，
  // 账本按正整数拒（卷六 §4.1 规则 2、kernel/ledger.mjs 的 isPosInt）由账本自己的测试守。
  assert.deepEqual(run([{ op: 'transfer', from: FROM, to: TO, qty: 0 }]), { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
  assert.deepEqual(run([{ op: 'transfer', from: FROM, to: TO, qty: -1 }]), { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
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
  // 两条文法各自的总长上限（卷二 §1.9 :291：尾段 {1,47}／{0,47}，总长至多 48；文法只在 validate/types.mjs）。
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

// 卷九 §4.2.1 勘误 1118k28：holding.open、holding.transfer、holding.rescale 带可选 terms.consentAct，holding.close 不带；适配器不自判，
// 契约这一层只核 terms 是普通对象；consentAct 的 EventId 校验与覆盖核对在内核（tests/kernel/holdings.test.mjs 守）。块 5 没有 emit 适配器，过了契约的批只走到“写者未上线”，所以“带了同意能过”的写入结果由内核测试守（tests/kernel/holdings.test.mjs）。
test('holding 三原语的可选 terms.consentAct：目录三行带、holding.close 不带；形状不合 E-ACT-PRIMITIVE，合的走到写者未上线', () => {
  const row = (op) => DOC.primitives.find((p) => p.op === op);
  for (const op of ['holding.open', 'holding.transfer', 'holding.rescale']) assert.deepEqual(row(op).optional, { terms: 'consentTerms' }, op);
  assert.equal(Object.hasOwn(row('holding.close'), 'optional'), false);
  const state = funded(10);
  const snap = clone(state);
  const open = (terms) => [{ op: 'holding.open', holdingKind: 'hk_x', holder: 'npc_a', subject: 'item_q', terms }];
  const transfer = (terms) => [{ op: 'holding.transfer', id: 'hld_1', newHolder: 'npc_b', terms }];
  const rescale = (terms) => [{ op: 'holding.rescale', holdingKind: 'hk_x', subject: 'item_q', shares: { npc_a: 1 }, terms }];
  for (const make of [open, transfer, rescale]) {
    for (const terms of ['consent', ['consentAct'], null, 7]) {
      assert.throws(() => execute(ENGINE, state, make(terms), 'act_t'), codeIs('E-ACT-PRIMITIVE'));
    }
    for (const terms of [{ consentAct: 'act_new_consent' }, { consentAct: '7'.repeat(64) }, { consentAct: 7 }, {}, { share: 1 }]) {
      assert.deepEqual(runTransaction(state, CTX, (s) => execute(ENGINE, s, make(terms), 'act_t')), { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
    }
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

// ---------- 块 5 执行器不写事务事件：批里没有 emit 原语即拿不到 verb，整笔拒收 ----------

test('块 5 未接事件写者：transfer 批拿不到本笔事件 verb，整批拒收、账本不动', () => {
  const state = funded(10);
  const r = runTransaction(state, CTX, (s) => execute(ENGINE, s, [{ op: 'transfer', from: FROM, to: TO, qty: 3 }], CAUSE));
  assert.deepEqual(r, { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
  assert.equal(balance(ENGINE, state, 'npc_a', BLD, UNMAT), 10);
  assert.equal(balance(ENGINE, state, 'org_b', BLD, UNMAT), 0);
});

test('transfer from/to 资源不同属契约不合：在整批校验期即拒 E-ACT-PRIMITIVE，早于任何写入', () => {
  const state = funded(10);
  const snap = clone(state);
  // 同一种类不同键也是不同资源（卷六 §4.1 规则 1：资源种类与资源键一起确定三元键）。
  const to = 'org_b.purpose_unmaterialized.res_building_share.bld_y';
  assert.throws(() => execute(ENGINE, state, [{ op: 'transfer', from: FROM, to, qty: 1 }], CAUSE), codeIs('E-ACT-PRIMITIVE'));
  assert.deepEqual(state, snap);
});

test('整批先在写入前核适配器：混批 [transfer, emit] 的 transfer 一笔不落', () => {
  const state = funded(10);
  const snap = clone(state);
  // 5-1 终核非阻塞建议 1：emit 适配器未建，整笔在写任何状态之前拒收。
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

test('execute 不自开事务：事务内外都整笔拒收、状态不动，调用前后都没有留下当前事务', () => {
  const state = funded(10);
  const snap = clone(state);
  // 事务外直接调用：块 5 没有事件写者，批前即拒；执行器没有开事务（当前事务仍为空），状态不变。
  assert.throws(() => execute(ENGINE, state, [{ op: 'transfer', from: FROM, to: TO, qty: 1 }], CAUSE), codeIs('E-ACT-WRITER-NOT-READY'));
  assert.equal(currentTransaction(), null);
  assert.deepEqual(state, snap);
  // 调用方事务内同样整笔拒收（E-ACT-WRITER-NOT-READY 带登记码，事务整笔回滚）。
  assert.deepEqual(runTransaction(state, CTX, (s) => execute(ENGINE, s, [{ op: 'transfer', from: FROM, to: TO, qty: 1 }], CAUSE)), { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
  assert.equal(currentTransaction(), null);
  assert.deepEqual(state, snap);
});
