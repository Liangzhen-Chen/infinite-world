// 块 5 第 5-3 张《持有写者》：卷十八 §2.6 持有种类条目字段、§4.1 持有种类表与两条转移协议（:451–:534）、R18-1.5 互斥/上限/容量/缔结（:521）、
// R18-1.10 常住变化事件（:526）、R18-1.11 持有变化事件（:528）、R18-1.12 存续条件（:529–:532）、R18-1.13 准入与三元定位（:534）；
// 卷二 §2.6 写者与三接口（:498–:517）；卷九 §4.2.1 holding 四原语（:630–:633）；李白 11-18 22:10 丙2/丙5/丙7。
// 测试先写；期望值按卷文公式手算成字面量，不抄仓库当前读数。只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { runTransaction, currentTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { installEventLog, emit } from '../../server-plugin/kernel/events.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';
import { registerViewReader, resetViewRegistry } from '../../server-plugin/kernel/view-registry.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { openHolding, closeHolding, transferHolding, rescaleHolding, checkHoldingKindRows, installHoldingEngine, resetHoldingEngine } from '../../server-plugin/kernel/holdings.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);
installDigestCap(createDigestCap());
useReportSink(() => {});

const CAUSE = 'act_test_hold';
const CTX = { node: 'test_holdings', file: 'tests/kernel/holdings.test.mjs' };
const MINUTE = 10;

// 测试 id 只进本进程的注册表，不进 world/。material 供容量维度的读写；其余按持有端类型用。
installVocab({
  vocab: W.vocab,
  idIndex: new Map([...W.idIndex, ['npc_a', 'person'], ['npc_b', 'person'], ['org_x', 'org'], ['place_x', 'place'], ['item_q', 'item'], ['mat_x', 'material'], ['container_x', 'item'], ['batch_y', 'item'], ['office_x', 'office']]),
  tables: W.tables,
});
const ENGINE = { vocab: W.vocab, rules: W.rules, units: W.env.units, tables: W.tables, template: { seed: 'test_holdings_seed' } };

/** @type {{entries: any[]}} */
let book;
// 提交前重算的 engine 由挂接处交入（installHoldingEngine）；测试每个用例装它自己用的那个 engine，与生产挂接同法。
function fresh(engine = ENGINE) {
  installHoldingEngine(engine);
  book = { entries: [] };
  installEventLog(book);
  return { clock: { minute: MINUTE, seq: 0 } };
}

function run(state, body) {
  return runTransaction(state, CTX, body);
}

// 带登记码的拒写由事务整笔回滚并返回 {ok:false, code}（卷二 §2.6 事务内拒写的处置）。
function fails(state, body, code) {
  assert.deepEqual(run(state, body), { ok: false, code });
}

// 造前提：在日志里放一条同意事件（表 A：actor、targets 是当事人），返回它的 EventId。tag 只用来让同一测试里多条事件 id 不撞（代号成分）。
function consentEvent(state, tag, actor, targets) {
  let id;
  assert.deepEqual(run(state, (s) => {
    id = emit(ENGINE, s, {
      minute: MINUTE, verb: 'verb_holding_changed', actor, actorAs: null, targets, primitives: [], cause: CAUSE, witnesses: [], visibility: 'private',
      payload: { edge: 'hld_consent', kind: 'hk_owns', holder: actor, subject: 'item_q', change: 'established', prevHolder: null, at: MINUTE },
    }, { rule: `act_${tag}`, subject: actor, position: 'pos.test' }).id;
  }), { ok: true });
  return id;
}

function edges(state) {
  const root = state.holdings;
  if (!root) return [];
  const out = [];
  for (const holder of Object.keys(root)) for (const id of Object.keys(root[holder])) out.push({ holder, id, record: root[holder][id] });
  return out;
}

const active = (state, kind) => edges(state).filter((e) => (kind === undefined || e.record.kind === kind) && e.record.terms.until === null);

// 测试用种类行：字段照卷十八 §2.6 的 40 列给全（不是世界数据，只在本进程注册表里）。
function row(over = {}) {
  return {
    id: 'hk_test_x', hyper: null, from: ['agent'], to: ['thing'], exclusive: false,
    gone: 'ho_close', vacated: 'ho_close', defected: null, subjectEnd: 'send_close',
    concluded: false, functional: false, membership: false, headship: false, carriesRel: false,
    conduct: 0, conductBack: 0, adopt: 0, pins: 'pside_none',
    intimate: false, bodyControl: false, holderMax: null, succeedBy: null, excludes: false,
    grantsEntry: false, entryRankMax: null, visibility: 'public', contest: null, capacityKey: null,
    transferable: false, incompatible: [], grants: [], hooks: [], termsKeys: [], shareSum: null,
    grantedBy: [], domicile: false, holdWhile: null, revival: null, admission: null, uniqueTriple: false,
    ...over,
  };
}

function engineWith(rows, relations) {
  const index = new Map(W.vocab.index);
  for (const r of rows) index.set(r.id, { family: 'holding_kind', prefix: 'hk_', entry: r });
  for (const id of Object.keys(relations || {})) index.set(id, { family: 'relation', prefix: 'rel_', entry: relations[id] });
  return { ...ENGINE, vocab: { ...W.vocab, index } };
}

// ---------- 数据与加载期核对（K5-39、K5-40、丙5） ----------

test('holding_kind 数据：49 行（42 旧 + 3 新增 + 2 卷十三 + 穿戴、装入 2 条，李白 11-19 20:3x ⑥），每行 40 列，端类型都在模板名闭集内，上位词链无环', () => {
  const fam = W.vocab.families.get('holding_kind');
  assert.ok(fam, 'holding_kind family');
  const entries = fam.entries;
  assert.equal(Object.keys(entries).length, 49);
  for (const [id, entry] of Object.entries(entries)) {
    assert.equal(Object.keys(entry).length, 40, id);
    for (const key of ['from', 'to']) assert.ok(Array.isArray(entry[key]) && entry[key].length > 0, `${id}.${key}`);
    for (const name of [...entry.from, ...entry.to]) assert.ok(['agent', 'business', 'collective', 'instrument', 'interim', 'office', 'place', 'population', 'thing', 'account', 'holding', 'profession', 'skill'].includes(name), `${id}: ${name}`);
  }
  const checked = checkHoldingKindRows(ENGINE);
  assert.deepEqual(checked.errors, []);
  // 手持行 holdWhile 可编译；许可行带进入权档。
  assert.equal(entries.hk_wielding.holdWhile, 'holder.handsHeld <= holder.graspLimbs && subject.wielders <= subject.wieldHands');
  assert.equal(entries.hk_permit.grantsEntry, true);
  assert.equal(entries.hk_permit.entryRankMax, 1);
});

test('李白 11-19 20:3x ②：access 三档次序公共 0 < 私宅 1 < 议会 2；一般成员类持有（membership 为真的整类）带进入权但最高只满足公共档，一张镇民身份进不了需许可的私宅与议会', () => {
  const access = W.vocab.families.get('access').entries;
  assert.deepEqual([access.access_public.rank, access.access_private.rank, access.access_council.rank], [0, 1, 2]);
  const gated = Object.values(access).filter((e) => e.needsGrant).map((e) => e.rank).sort();
  assert.deepEqual(gated, [1, 2]);
  const kinds = W.vocab.families.get('holding_kind').entries;
  const members = Object.entries(kinds).filter(([, r]) => r.membership === true);
  assert.ok(members.length > 0);
  for (const [id, row] of members) {
    assert.equal(row.grantsEntry, true, id);
    assert.equal(row.entryRankMax, access.access_public.rank, id);
    for (const rank of gated) assert.ok(row.entryRankMax < rank, `${id} must not satisfy a needsGrant tier`);
  }
  assert.ok(members.some(([id]) => id === 'hk_citizen_of'));
  // 许可持有仍能满足私宅档，不满足议会档。
  assert.ok(kinds.hk_permit.entryRankMax >= access.access_private.rank && kinds.hk_permit.entryRankMax < access.access_council.rank);
});

test('李白 11-19 20:3x ⑥：装备即 hk_wielding，穿戴 hk_wearing、装入 hk_containing 是已登记的持有种类行，装入由物到物', () => {
  const rows = W.vocab.families.get('holding_kind').entries;
  assert.deepEqual([rows.hk_wearing.from, rows.hk_wearing.to], [['agent'], ['thing']]);
  assert.deepEqual([rows.hk_containing.from, rows.hk_containing.to], [['thing'], ['thing']]);
  assert.deepEqual(checkHoldingKindRows(ENGINE).errors, []);
});

test('丙5：种类行端类型名不在模板名闭集即拒（E-HK-END-TYPE）', () => {
  const bad = row({ id: 'hk_test_bad', from: ['vehicle'], subjectEnd: 'send_close' });
  const engine = engineWith([bad]);
  assert.deepEqual(checkHoldingKindRows(engine).errors.some((e) => e.startsWith('E-HK-END-TYPE')), true);
  const state = fresh(engine);
  fails(state, (s) => openHolding(engine, s, { holdingKind: 'hk_test_bad', holder: 'npc_a', subject: 'item_q', cause: CAUSE }), 'E-HK-END-TYPE');
  assert.equal(edges(state).length, 0);
});

// ---------- 开边、关边与事件 ----------

test('开边：hk_resides 写一条现役边，terms 公共键补齐，发持有变化与常住变化两条事件（R18-1.10、R18-1.11）', () => {
  const state = fresh();
  let id;
  assert.deepEqual(run(state, (s) => { id = openHolding(ENGINE, s, { holdingKind: 'hk_resides', holder: 'npc_a', subject: 'place_x', cause: CAUSE }); }), { ok: true });
  const list = edges(state);
  assert.equal(list.length, 1);
  const rec = list[0].record;
  assert.equal(rec.kind, 'hk_resides');
  assert.equal(rec.holder, 'npc_a');
  assert.equal(rec.subject, 'place_x');
  assert.equal(rec.grantedBy, null);
  assert.deepEqual(rec.terms, { since: MINUTE, until: null, endReason: null, suspended: false, consentAct: null, grantor: null });
  assert.equal(list[0].id, id);
  assert.deepEqual(book.entries.map((e) => e.verb).sort(), ['verb_domicile_changed', 'verb_holding_changed']);
  const hc = book.entries.find((e) => e.verb === 'verb_holding_changed');
  assert.deepEqual(hc.payload, { place: null, related: [], causedBy: [], pos: null, edge: id, kind: 'hk_resides', holder: 'npc_a', subject: 'place_x', change: 'established', prevHolder: null, at: MINUTE });
  assert.deepEqual(hc.targets, ['place_x']);
  const dc = book.entries.find((e) => e.verb === 'verb_domicile_changed');
  // 常住变化行的 payloadShape 也有 place（边的标的），与表 A 公共字段同名，写者取载荷字段的值。
  assert.deepEqual(dc.payload, { place: 'place_x', related: [], causedBy: [], pos: null, person: 'npc_a', since: MINUTE, until: null });
});

test('关边：按边 id 关闭写 until=结束时刻并发 ended；重复关闭拒 E-HK-PROTOCOL', () => {
  const state = fresh();
  let id;
  run(state, (s) => { id = openHolding(ENGINE, s, { holdingKind: 'hk_resides', holder: 'npc_a', subject: 'place_x', cause: CAUSE }); });
  book.entries.length = 0;
  assert.deepEqual(run(state, (s) => closeHolding(ENGINE, s, { id, cause: CAUSE })), { ok: true });
  const rec = edges(state)[0].record;
  assert.equal(rec.terms.until, MINUTE);
  assert.deepEqual(book.entries.map((e) => e.verb).sort(), ['verb_domicile_changed', 'verb_holding_changed']);
  assert.equal(book.entries.find((e) => e.verb === 'verb_holding_changed').payload.change, 'ended');
  fails(state, (s) => closeHolding(ENGINE, s, { id, cause: CAUSE }), 'E-HK-PROTOCOL');
});

test('三元定位：uniqueTriple 为假即拒；为真时按（种类，持有者，标的）关闭唯一现役边', () => {
  const plain = fresh();
  let id;
  run(plain, (s) => { id = openHolding(ENGINE, s, { holdingKind: 'hk_resides', holder: 'npc_a', subject: 'place_x', cause: CAUSE }); });
  fails(plain, (s) => closeHolding(ENGINE, s, { holdingKind: 'hk_resides', holder: 'npc_a', subject: 'place_x', cause: CAUSE }), 'E-HK-PROTOCOL');
  assert.equal(edges(plain)[0].record.terms.until, null);

  const triple = row({ id: 'hk_test_triple', uniqueTriple: true });
  const engine = engineWith([triple]);
  const state = fresh(engine);
  run(state, (s) => { id = openHolding(engine, s, { holdingKind: 'hk_test_triple', holder: 'npc_a', subject: 'item_q', cause: CAUSE }); });
  assert.deepEqual(run(state, (s) => closeHolding(engine, s, { holdingKind: 'hk_test_triple', holder: 'npc_a', subject: 'item_q', cause: CAUSE })), { ok: true });
  assert.equal(edges(state)[0].record.terms.until, MINUTE);
});

test('未知种类拒 E-HK-UNREGISTERED；端 id 不是代号拒 E-HK-END-TYPE；状态不变', () => {
  const state = fresh();
  fails(state, (s) => openHolding(ENGINE, s, { holdingKind: 'hk_nope', holder: 'npc_a', subject: 'item_q', cause: CAUSE }), 'E-HK-UNREGISTERED');
  fails(state, (s) => openHolding(ENGINE, s, { holdingKind: 'hk_resides', holder: 'npc a', subject: 'place_x', cause: CAUSE }), 'E-HK-END-TYPE');
  assert.equal(edges(state).length, 0);
});

// ---------- 互斥、上限、容量（R18-1.5） ----------

test('互斥 auto_vacate：第二条户主边先按旧边的离任格关闭旧边再写新边（hk_household_head）', () => {
  const state = fresh();
  run(state, (s) => openHolding(ENGINE, s, { holdingKind: 'hk_household_head', holder: 'npc_a', subject: 'org_x', cause: CAUSE }));
  book.entries.length = 0;
  run(state, (s) => openHolding(ENGINE, s, { holdingKind: 'hk_household_head', holder: 'npc_b', subject: 'org_x', cause: CAUSE }));
  const list = edges(state).sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(list.length, 2);
  assert.equal(list[0].record.holder, 'npc_a');
  assert.equal(list[0].record.terms.until, MINUTE);
  assert.equal(list[1].record.holder, 'npc_b');
  assert.equal(list[1].record.terms.until, null);
  assert.deepEqual(book.entries.map((e) => e.payload.change).sort(), ['ended', 'established']);
});

test('持有者上限 holderMax：写入后仍超限即拒 E-HK-HOLDER-MAX（测试种类行 holderMax=1）', () => {
  const limited = row({ id: 'hk_test_limit', holderMax: 1 });
  const engine = engineWith([limited]);
  const state = fresh(engine);
  run(state, (s) => openHolding(engine, s, { holdingKind: 'hk_test_limit', holder: 'npc_a', subject: 'item_q', cause: CAUSE }));
  fails(state, (s) => openHolding(engine, s, { holdingKind: 'hk_test_limit', holder: 'npc_a', subject: 'batch_y', cause: CAUSE }), 'E-HK-HOLDER-MAX');
  assert.equal(active(state, 'hk_test_limit').length, 1);
});

test('容量 capacityKey：现役边数不小于标的上该容量维度的值即拒 E-HK-CAPACITY（R18-1.5）', () => {
  const capped = row({ id: 'hk_test_cap', capacityKey: 'density' });
  const engine = engineWith([capped]);
  const state = fresh(engine);
  state.created = { mat_x: { props: { density: 1 } } };
  run(state, (s) => openHolding(engine, s, { holdingKind: 'hk_test_cap', holder: 'npc_a', subject: 'mat_x', cause: CAUSE }));
  fails(state, (s) => openHolding(engine, s, { holdingKind: 'hk_test_cap', holder: 'npc_b', subject: 'mat_x', cause: CAUSE }), 'E-HK-CAPACITY');
  assert.equal(active(state, 'hk_test_cap').length, 1);
});

// ---------- 份额与改份额（R18-1.5、卷九 holding.rescale） ----------

// 份额用测试种类行：shareSum=1、termsKeys 只放 share，不缔结；缔结与生成路径例外另测。
const shareEngine = () => engineWith([row({ id: 'hk_test_share', shareSum: 1, termsKeys: ['share'] })]);

test('份额之和：shareSum=1，单条 0.4 在提交时拒、0.4+0.6 同一事务通过；0 与负数拒', () => {
  const engine = shareEngine();
  const one = fresh(engine);
  assert.deepEqual(run(one, (s) => openHolding(engine, s, { holdingKind: 'hk_test_share', holder: 'npc_a', subject: 'item_q', terms: { share: 0.4 }, cause: CAUSE })), { ok: false, code: 'E-HK-PROTOCOL' });
  assert.equal(edges(one).length, 0);
  assert.equal(book.entries.length, 0);

  const two = fresh(engine);
  assert.deepEqual(run(two, (s) => {
    openHolding(engine, s, { holdingKind: 'hk_test_share', holder: 'npc_a', subject: 'item_q', terms: { share: 0.4 }, cause: CAUSE });
    openHolding(engine, s, { holdingKind: 'hk_test_share', holder: 'npc_b', subject: 'item_q', terms: { share: 0.6 }, cause: CAUSE });
  }), { ok: true });
  assert.equal(active(two, 'hk_test_share').length, 2);

  for (const share of [0, -1]) {
    const st = fresh(engine);
    fails(st, (s) => openHolding(engine, s, { holdingKind: 'hk_test_share', holder: 'npc_a', subject: 'item_q', terms: { share }, cause: CAUSE }), 'E-HK-PROTOCOL');
  }
});

test('改份额：同持有人只改 terms.share（不发事件），去掉的持有人关边、新增的持有人建边；合计须恰等于 shareSum', () => {
  const engine = shareEngine();
  const state = fresh(engine);
  run(state, (s) => {
    openHolding(engine, s, { holdingKind: 'hk_test_share', holder: 'npc_a', subject: 'item_q', terms: { share: 0.4 }, cause: CAUSE });
    openHolding(engine, s, { holdingKind: 'hk_test_share', holder: 'npc_b', subject: 'item_q', terms: { share: 0.6 }, cause: CAUSE });
  });
  const before = active(state, 'hk_test_share').map((e) => e.id).sort();
  book.entries.length = 0;
  run(state, (s) => rescaleHolding(engine, s, { holdingKind: 'hk_test_share', subject: 'item_q', shares: { npc_a: 0.25, npc_b: 0.75 }, cause: CAUSE }));
  const mid = active(state, 'hk_test_share').sort((a, b) => a.record.holder.localeCompare(b.record.holder));
  assert.deepEqual(mid.map((e) => e.id).sort(), before);
  assert.deepEqual(mid.map((e) => [e.record.holder, e.record.terms.share]), [['npc_a', 0.25], ['npc_b', 0.75]]);
  assert.equal(book.entries.length, 0);

  run(state, (s) => rescaleHolding(engine, s, { holdingKind: 'hk_test_share', subject: 'item_q', shares: { npc_b: 1 }, cause: CAUSE }));
  assert.deepEqual(active(state, 'hk_test_share').map((e) => e.record.holder), ['npc_b']);
  assert.deepEqual(book.entries.map((e) => e.payload.change), ['ended']);

  // 新增持有人与普通开边同一套字段核对；不缔结的种类行不要求同意。
  book.entries.length = 0;
  run(state, (s) => rescaleHolding(engine, s, { holdingKind: 'hk_test_share', subject: 'item_q', shares: { npc_b: 0.5, npc_a: 0.5 }, cause: CAUSE }));
  assert.deepEqual(active(state, 'hk_test_share').map((e) => e.record.holder).sort(), ['npc_a', 'npc_b']);
  assert.deepEqual(book.entries.map((e) => e.payload.change), ['established']);

  fails(state, (s) => rescaleHolding(engine, s, { holdingKind: 'hk_test_share', subject: 'item_q', shares: { npc_b: 0.5 }, cause: CAUSE }), 'E-HK-PROTOCOL');
});

// R18-1.5：改份额新增的持有人的边是运行期新边，只用本笔事务自己的同意，不复制旧边的 origin/consentAct。
test('改份额新增持有人：缔结的种类行不继承旧边的 seeded/consentAct，运行期无同意即拒 E-REL-CONSENT', () => {
  const state = fresh();
  // 先造前提：已有一条约定的 hk_owns（old）与一条 seeded 带来的 hk_owns（npc_b），改份额时新增 npc_a。
  state.holdings = {
    npc_b: { hld_1: { kind: 'hk_owns', holder: 'npc_b', subject: 'item_q', terms: { since: MINUTE, until: null, endReason: null, suspended: false, consentAct: null, grantor: null, share: 1, origin: 'seeded' }, grantedBy: null } },
  };
  const snap = JSON.stringify(state);
  fails(state, (s) => rescaleHolding(ENGINE, s, { holdingKind: 'hk_owns', subject: 'item_q', shares: { npc_b: 0.5, npc_a: 0.5 }, cause: CAUSE }), 'E-REL-CONSENT');
  assert.equal(JSON.stringify(state), snap);
  assert.equal(book.entries.length, 0);
});

// R18-1.5 :521：改份额新增缔结种类的持有人，带本笔同意即可通过；新增边记本笔同意，不复制旧边的 origin/consentAct。
test('改份额新增持有人：缔结的种类行带本笔同意（terms.consentAct）通过，新增边只记本笔同意、不复制旧边 origin/consentAct', () => {
  const state = fresh();
  state.holdings = { npc_b: { hld_1: { kind: 'hk_owns', holder: 'npc_b', subject: 'item_q', terms: { since: MINUTE, until: null, endReason: null, suspended: false, consentAct: 'act_old_consent', grantor: null, share: 1, origin: 'seeded' }, grantedBy: null } } };
  const consent = consentEvent(state, 'consent_a', 'npc_a', ['npc_b']);
  assert.deepEqual(run(state, (s) => rescaleHolding(ENGINE, s, { holdingKind: 'hk_owns', subject: 'item_q', shares: { npc_b: 0.4, npc_a: 0.6 }, terms: { consentAct: consent }, cause: CAUSE })), { ok: true });
  const list = active(state, 'hk_owns').sort((a, b) => a.record.holder.localeCompare(b.record.holder));
  assert.deepEqual(list.map((e) => [e.record.holder, e.record.terms.share]), [['npc_a', 0.6], ['npc_b', 0.4]]);
  const added = list.find((e) => e.record.holder === 'npc_a');
  assert.deepEqual(added.record.terms, { since: MINUTE, until: null, endReason: null, suspended: false, grantor: null, share: 0.6, consentAct: consent });
});

// 李白 11-19 03:20 裁定 2：一批新增多个持有人时用一个 consentAct，其当事人（表 A 的 actor 与 targets）须覆盖全部新增人。
// 前提：npc_b 持有 1 份；改成 npc_b 0.5、npc_a 0.25、org_x 0.25，新增 npc_a 与 org_x 两人（0.5 + 0.25 + 0.25 = 1）。
function twoNewHolders(state, consentAct) {
  return run(state, (s) => rescaleHolding(ENGINE, s, { holdingKind: 'hk_owns', subject: 'item_q', shares: { npc_b: 0.5, npc_a: 0.25, org_x: 0.25 }, terms: consentAct === undefined ? undefined : { consentAct }, cause: CAUSE }));
}
const ownedByNpcB = () => ({ npc_b: { hld_1: { kind: 'hk_owns', holder: 'npc_b', subject: 'item_q', terms: { since: MINUTE, until: null, endReason: null, suspended: false, consentAct: null, grantor: null, share: 1, origin: 'seeded' }, grantedBy: null } } });

test('改份额新增两人：同意事件的当事人覆盖两人（一人在 actor、一人在 targets）即通过，两条新边都记这一个 consentAct', () => {
  const state = fresh();
  state.holdings = ownedByNpcB();
  const consent = consentEvent(state, 'consent_a', 'npc_a', ['org_x']);
  assert.deepEqual(twoNewHolders(state, consent), { ok: true });
  const list = active(state, 'hk_owns').sort((a, b) => a.record.holder.localeCompare(b.record.holder));
  assert.deepEqual(list.map((e) => [e.record.holder, e.record.terms.share, e.record.terms.consentAct === consent]), [['npc_a', 0.25, true], ['npc_b', 0.5, false], ['org_x', 0.25, true]]);
});

test('改份额新增两人：同意事件的当事人只覆盖一人即拒 E-REL-CONSENT，状态与事件日志不变', () => {
  const state = fresh();
  state.holdings = ownedByNpcB();
  const consent = consentEvent(state, 'consent_a', 'npc_a', ['npc_b']);
  const snap = JSON.stringify(state);
  const logged = book.entries.length;
  assert.deepEqual(twoNewHolders(state, consent), { ok: false, code: 'E-REL-CONSENT' });
  assert.equal(JSON.stringify(state), snap);
  assert.equal(book.entries.length, logged);
});

test('改份额新增两人：consentAct 在事件日志里查不到即拒 E-REL-CONSENT（64 位十六进制形与代号形都一样）', () => {
  const state = fresh();
  state.holdings = ownedByNpcB();
  assert.deepEqual(twoNewHolders(state, '0'.repeat(64)), { ok: false, code: 'E-REL-CONSENT' });
  assert.deepEqual(twoNewHolders(state, 'act_no_such_event'), { ok: false, code: 'E-REL-CONSENT' });
  assert.deepEqual(twoNewHolders(state, undefined), { ok: false, code: 'E-REL-CONSENT' });
});

test('改份额只改已有持有人的份额、不新增人：不要求同意，新边与旧边的同意字段都不动', () => {
  const state = fresh();
  state.holdings = {
    npc_b: { hld_1: { kind: 'hk_owns', holder: 'npc_b', subject: 'item_q', terms: { since: MINUTE, until: null, endReason: null, suspended: false, consentAct: null, grantor: null, share: 0.75, origin: 'seeded' }, grantedBy: null } },
    npc_a: { hld_2: { kind: 'hk_owns', holder: 'npc_a', subject: 'item_q', terms: { since: MINUTE, until: null, endReason: null, suspended: false, consentAct: null, grantor: null, share: 0.25, origin: 'seeded' }, grantedBy: null } },
  };
  assert.deepEqual(run(state, (s) => rescaleHolding(ENGINE, s, { holdingKind: 'hk_owns', subject: 'item_q', shares: { npc_b: 0.5, npc_a: 0.5 }, cause: CAUSE })), { ok: true });
  assert.deepEqual(active(state, 'hk_owns').map((e) => [e.id, e.record.terms.share, e.record.terms.consentAct]).sort(), [['hld_1', 0.5, null], ['hld_2', 0.5, null]]);
});

test('terms.consentAct 形状：不是 EventId 或 null（如文字、数字）拒 E-HK-PROTOCOL', () => {
  const state = fresh();
  state.holdings = ownedByNpcB();
  assert.deepEqual(twoNewHolders(state, 'Not An Event'), { ok: false, code: 'E-HK-PROTOCOL' });
  assert.deepEqual(twoNewHolders(state, 7), { ok: false, code: 'E-HK-PROTOCOL' });
});

test('uniqueTriple：同一种类、同一持有者、同一标的至多一条现役边（第二条拒 E-HK-PROTOCOL）', () => {
  const triple = row({ id: 'hk_test_unique', uniqueTriple: true });
  const engine = engineWith([triple]);
  const state = fresh(engine);
  run(state, (s) => openHolding(engine, s, { holdingKind: 'hk_test_unique', holder: 'npc_a', subject: 'item_q', cause: CAUSE }));
  fails(state, (s) => openHolding(engine, s, { holdingKind: 'hk_test_unique', holder: 'npc_a', subject: 'item_q', cause: CAUSE }), 'E-HK-PROTOCOL');
  assert.equal(active(state, 'hk_test_unique').length, 1);
});

// ---------- 转移（R18-1.11） ----------

test('转移：同一事务关旧边写承接边，只发一条 transferred（holder 取承接者、prevHolder 取原持有者）', () => {
  const move = row({ id: 'hk_test_move', transferable: true });
  const engine = engineWith([move]);
  const state = fresh(engine);
  let oldId;
  run(state, (s) => { oldId = openHolding(engine, s, { holdingKind: 'hk_test_move', holder: 'npc_a', subject: 'item_q', cause: CAUSE }); });
  book.entries.length = 0;
  let newId;
  run(state, (s) => { newId = transferHolding(engine, s, { id: oldId, newHolder: 'npc_b', cause: CAUSE }); });
  const oldEdge = edges(state).find((e) => e.id === oldId);
  const newEdge = edges(state).find((e) => e.id === newId);
  assert.equal(oldEdge.record.terms.until, MINUTE);
  assert.equal(newEdge.record.holder, 'npc_b');
  assert.equal(newEdge.record.terms.until, null);
  assert.equal(newEdge.record.terms.share, undefined);
  assert.deepEqual(book.entries.map((e) => e.verb), ['verb_holding_changed']);
  assert.deepEqual(book.entries[0].payload, { place: null, related: [], causedBy: [], pos: null, edge: newId, kind: 'hk_test_move', holder: 'npc_b', subject: 'item_q', change: 'transferred', prevHolder: 'npc_a', at: MINUTE });
});

test('转移：种类行 transferable 为假即拒；转给当前持有人即拒', () => {
  const state = fresh();
  let id;
  run(state, (s) => { id = openHolding(ENGINE, s, { holdingKind: 'hk_resides', holder: 'npc_a', subject: 'place_x', cause: CAUSE }); });
  fails(state, (s) => transferHolding(ENGINE, s, { id, newHolder: 'npc_b', cause: CAUSE }), 'E-HK-PROTOCOL');
  fails(state, (s) => transferHolding(ENGINE, s, { id, newHolder: 'npc_a', cause: CAUSE }), 'E-HK-PROTOCOL');
});

// R18-1.5：转移的承接边是运行期新边，只用本笔事务自己的同意，不复制旧边的 seeded/consentAct。
test('转移：缔结的种类行承接边不继承旧边的 seeded/consentAct，运行期无同意即拒 E-REL-CONSENT', () => {
  const state = fresh();
  state.holdings = { npc_a: { hld_1: { kind: 'hk_owns', holder: 'npc_a', subject: 'item_q', terms: { since: MINUTE, until: null, endReason: null, suspended: false, consentAct: null, grantor: null, share: 1, origin: 'seeded' }, grantedBy: null } } };
  const snap = JSON.stringify(state);
  fails(state, (s) => transferHolding(ENGINE, s, { id: 'hld_1', newHolder: 'npc_b', cause: CAUSE }), 'E-REL-CONSENT');
  assert.equal(JSON.stringify(state), snap);
  assert.equal(book.entries.length, 0);
});

// R18-1.5 :521：缔结的种类带本笔同意即可转移；承接边记本笔同意，不复制旧边的 origin/consentAct。
test('转移：缔结的种类行带本笔同意（terms.consentAct）通过，承接边只记本笔同意、不复制旧边 origin/consentAct', () => {
  const state = fresh();
  state.holdings = { npc_a: { hld_1: { kind: 'hk_owns', holder: 'npc_a', subject: 'item_q', terms: { since: MINUTE, until: null, endReason: null, suspended: false, consentAct: 'act_old_consent', grantor: null, share: 1, origin: 'seeded' }, grantedBy: null } } };
  // 同意事件当事人：承接者 npc_b（actor）与标的 item_q（targets）——新边两端都在内。
  const consent = consentEvent(state, 'consent_t', 'npc_b', ['item_q']);
  let newId;
  assert.deepEqual(run(state, (s) => { newId = transferHolding(ENGINE, s, { id: 'hld_1', newHolder: 'npc_b', terms: { consentAct: consent }, cause: CAUSE }); }), { ok: true });
  assert.equal(newId, 'hld_2');
  const oldEdge = edges(state).find((e) => e.id === 'hld_1');
  const newEdge = edges(state).find((e) => e.id === newId);
  assert.equal(oldEdge.record.terms.until, MINUTE);
  // EventId 是 64 位十六进制（卷二 §1.5），不是 CODE 文法：真实事件 id 也得能当 consentAct。
  assert.equal(/^[0-9a-f]{64}$/.test(consent), true);
  assert.deepEqual(newEdge.record.terms, { since: MINUTE, until: null, endReason: null, suspended: false, grantor: null, share: 1, consentAct: consent });
});

// 李白 11-19 10:2x 裁定 ②：凡写出的边持有者或标的换了人（开边、转移），新边两端都须在同意事件当事人内。
const ownedByNpcA = () => ({ npc_a: { hld_1: { kind: 'hk_owns', holder: 'npc_a', subject: 'item_q', terms: { since: MINUTE, until: null, endReason: null, suspended: false, consentAct: null, grantor: null, share: 1, origin: 'seeded' }, grantedBy: null } } });
test('转移：承接者不在同意事件当事人内即拒 E-REL-CONSENT；标的不在内也拒；查不到事件也拒，状态不变', () => {
  const state = fresh();
  state.holdings = ownedByNpcA();
  const onlyOldHolder = consentEvent(state, 'consent_x', 'npc_a', ['item_q']);
  const onlyHolder = consentEvent(state, 'consent_y', 'npc_b', []);
  const snap = JSON.stringify(state);
  for (const consentAct of [onlyOldHolder, onlyHolder, '0'.repeat(64)]) {
    fails(state, (s) => transferHolding(ENGINE, s, { id: 'hld_1', newHolder: 'npc_b', terms: { consentAct }, cause: CAUSE }), 'E-REL-CONSENT');
  }
  assert.equal(JSON.stringify(state), snap);
});

test('开缔结边：持有者与标的都在同意事件当事人内通过；缺其一拒 E-REL-CONSENT', () => {
  const state = fresh();
  const both = consentEvent(state, 'consent_o', 'npc_a', ['item_q']);
  const holderOnly = consentEvent(state, 'consent_p', 'npc_a', []);
  const open = (consentAct) => run(state, (s) => openHolding(ENGINE, s, { holdingKind: 'hk_owns', holder: 'npc_a', subject: 'item_q', terms: { consentAct, share: 1 }, cause: CAUSE }));
  assert.deepEqual(open(holderOnly), { ok: false, code: 'E-REL-CONSENT' });
  assert.equal(edges(state).length, 0);
  assert.deepEqual(open(both), { ok: true });
  assert.deepEqual(active(state, 'hk_owns').map((e) => [e.record.holder, e.record.subject, e.record.terms.consentAct === both]), [['npc_a', 'item_q', true]]);
});

// R18-1.5 生成路径例外：块 5 没有“生成路径事务”标记，运行期不认 seeded。
test('运行期开缔结边：terms.origin=seeded 不算生成路径事务，拒 E-REL-CONSENT', () => {
  const state = fresh();
  fails(state, (s) => openHolding(ENGINE, s, { holdingKind: 'hk_owns', holder: 'npc_a', subject: 'item_q', terms: { share: 1, origin: 'seeded' }, cause: CAUSE }), 'E-REL-CONSENT');
  assert.equal(edges(state).length, 0);
  assert.equal(book.entries.length, 0);
});

// ---------- holdWhile（R18-1.12） ----------

function registerWieldViews(values) {
  resetViewRegistry();
  registerViewReader('personView', 'test/holdings-view.mjs', () => ({ graspLimbs: values.limbs, handsHeld: values.held }));
  registerViewReader('itemView', 'test/holdings-view.mjs', () => ({ wieldHands: values.hands, wielders: values.wielders }));
}

test('holdWhile：读数满足才许开边；改动后重算为假按离任格关边；新边为假整笔拒 E-HK-HOLD-WHILE', () => {
  const wield = row({ id: 'hk_test_wield', holdWhile: 'holder.handsHeld <= holder.graspLimbs && subject.wielders <= subject.wieldHands', functional: true });
  const engine = engineWith([wield]);
  const values = { limbs: 2, held: 1, hands: 2, wielders: 1 };
  registerWieldViews(values);
  const state = fresh(engine);
  let id;
  assert.deepEqual(run(state, (s) => { id = openHolding(engine, s, { holdingKind: 'hk_test_wield', holder: 'npc_a', subject: 'item_q', cause: CAUSE }); }), { ok: true });
  assert.equal(active(state, 'hk_test_wield').length, 1);

  values.held = 3;
  run(state, (s) => openHolding(engine, s, { holdingKind: 'hk_resides', holder: 'npc_a', subject: 'place_x', cause: CAUSE }));
  assert.equal(active(state, 'hk_test_wield').length, 0);
  assert.equal(edges(state).find((e) => e.id === id).record.terms.until, MINUTE);

  book.entries.length = 0;
  assert.deepEqual(run(state, (s) => openHolding(engine, s, { holdingKind: 'hk_test_wield', holder: 'npc_a', subject: 'batch_y', cause: CAUSE })), { ok: false, code: 'E-HK-HOLD-WHILE' });
  assert.equal(active(state, 'hk_test_wield').length, 0);
  assert.equal(book.entries.length, 0);
  resetViewRegistry();
});

test('holdWhile：读数服务未登记按未知（假）处理，不缺省放行；holdWhile 非空的行 vacated 为空/不动即加载失败（E-HK-PROTOCOL）', () => {
  const wield = row({ id: 'hk_test_wield', holdWhile: 'holder.handsHeld <= holder.graspLimbs' });
  const engine = engineWith([wield]);
  resetViewRegistry();
  const state = fresh(engine);
  assert.deepEqual(run(state, (s) => openHolding(engine, s, { holdingKind: 'hk_test_wield', holder: 'npc_a', subject: 'item_q', cause: CAUSE })), { ok: false, code: 'E-HK-HOLD-WHILE' });
  const bad = checkHoldingKindRows(engineWith([row({ id: 'hk_test_wield2', holdWhile: 'holder.handsHeld <= holder.graspLimbs', vacated: 'ho_stay' })]));
  assert.equal(bad.errors.some((e) => e.startsWith('E-HK-PROTOCOL')), true);
});

// 卷二 §2.6 :515、R18-1.12 ②：不论发起事务的是哪个写者，写到这类现役边的持有者或标的都在提交前重算。
test('holdWhile：别的写者写到持有者的读数（不碰 holdings 路径）也触发提交前重算，关边并发持有变化事件', () => {
  const wield = row({ id: 'hk_test_wield_other', holdWhile: 'holder.handsHeld <= holder.graspLimbs', functional: true });
  const engine = engineWith([wield]);
  const values = { limbs: 2, held: 1, hands: 2, wielders: 1 };
  registerWieldViews(values);
  const state = fresh(engine);
  let id;
  run(state, (s) => { id = openHolding(engine, s, { holdingKind: 'hk_test_wield_other', holder: 'npc_a', subject: 'item_q', cause: CAUSE }); });
  assert.equal(active(state, 'hk_test_wield_other').length, 1);
  values.held = 3;
  book.entries.length = 0;
  // 模拟别的写者（如卷二十一的身体量写者）：只登记写到的路径，不碰 holdings。
  assert.deepEqual(run(state, (s) => { currentTransaction().written.push(['created', 'npc_a', 'props', 'graspLimbs']); }), { ok: true });
  assert.equal(active(state, 'hk_test_wield_other').length, 0);
  assert.equal(edges(state).find((e) => e.id === id).record.terms.until, MINUTE);
  assert.deepEqual(book.entries.map((e) => e.verb), ['verb_holding_changed']);
  assert.equal(book.entries[0].payload.change, 'ended');
  // 卷九 §2.9 :442：没有事务事件时，规则/指令代号取推进钩子的登记代号（事务上下文 node），链首取该钩子的主体 id。
  assert.equal(book.entries[0].cause, CTX.node);
  resetViewRegistry();
});

// 卷九 §2.9 :442：没有事务事件、也取不到钩子主体 id 时整笔拒收，不传 null 让事件形状失败。
test('holdWhile：别的写者事务里拿不到钩子主体 id 时整笔拒收 E-EVT-SHAPE，状态与事件都不落', () => {
  const wield = row({ id: 'hk_test_wield_nosub', holdWhile: 'holder.handsHeld <= holder.graspLimbs', functional: true });
  const engine = engineWith([wield]);
  const values = { limbs: 2, held: 1, hands: 2, wielders: 1 };
  registerWieldViews(values);
  const state = fresh(engine);
  run(state, (s) => { openHolding(engine, s, { holdingKind: 'hk_test_wield_nosub', holder: 'npc_a', subject: 'item_q', cause: CAUSE }); });
  book.entries.length = 0;
  values.held = 3;
  const snap = JSON.stringify(state);
  // 同时写到持有者与标的：触发实体不唯一，钩子主体 id 取不到。
  assert.deepEqual(run(state, (s) => { currentTransaction().written.push(['created', 'npc_a', 'props', 'graspLimbs']); currentTransaction().written.push(['created', 'item_q', 'props', 'wieldHands']); }), { ok: false, code: 'E-EVT-SHAPE' });
  assert.equal(JSON.stringify(state), snap);
  assert.equal(book.entries.length, 0);
  resetViewRegistry();
});

// ---------- 未装 engine（卡头第二节第 3 条：不留绕过口子，不静默跳过） ----------

test('未装 engine：持有写者四入口整笔拒收 E-ACT-WRITER-NOT-READY，状态与事件都不变', () => {
  resetHoldingEngine();
  book = { entries: [] };
  installEventLog(book);
  const state = { clock: { minute: MINUTE, seq: 0 } };
  const snap = JSON.stringify(state);
  // 入口收到 engine 参数也不拿它充数：提交前重算与 holdWhile 求值的 engine 只认 installHoldingEngine 交入的那个。
  fails(state, (s) => openHolding(ENGINE, s, { holdingKind: 'hk_resides', holder: 'npc_a', subject: 'place_x', cause: CAUSE }), 'E-ACT-WRITER-NOT-READY');
  fails(state, (s) => closeHolding(ENGINE, s, { id: 'hld_1', cause: CAUSE }), 'E-ACT-WRITER-NOT-READY');
  fails(state, (s) => transferHolding(ENGINE, s, { id: 'hld_1', newHolder: 'npc_b', cause: CAUSE }), 'E-ACT-WRITER-NOT-READY');
  fails(state, (s) => rescaleHolding(ENGINE, s, { holdingKind: 'hk_owns', subject: 'item_q', shares: { npc_a: 1 }, cause: CAUSE }), 'E-ACT-WRITER-NOT-READY');
  assert.equal(JSON.stringify(state), snap);
  assert.equal(book.entries.length, 0);
});

test('未装 engine：别的写者写到持有端路径即整笔拒收 E-ACT-WRITER-NOT-READY，状态不变；没碰持有端的照常提交', () => {
  resetHoldingEngine();
  book = { entries: [] };
  installEventLog(book);
  const state = { clock: { minute: MINUTE, seq: 0 }, holdings: { npc_a: { hld_1: { kind: 'hk_wielding', holder: 'npc_a', subject: 'item_q', terms: { since: MINUTE, until: null, endReason: null, suspended: false, consentAct: null, grantor: null }, grantedBy: null } } } };
  const snap = JSON.stringify(state);
  fails(state, (s) => { currentTransaction().written.push(['created', 'npc_a', 'props', 'graspLimbs']); }, 'E-ACT-WRITER-NOT-READY');
  assert.equal(JSON.stringify(state), snap);
  assert.equal(book.entries.length, 0);
  // 推导不出这条边带 holdWhile 也要拒（无 engine 读不到种类行），不静默跳过。
  assert.deepEqual(run(state, (s) => { currentTransaction().written.push(['created', 'npc_b', 'props', 'graspLimbs']); }), { ok: true });
});

// ---------- 丙2 / 丙7 / 事件随事务 ----------

test('丙2（李白 11-18 22:10）：装置/容器作持有者、批次作标的的持有边由本写者写，不另开位置路径', () => {
  const contains = row({ id: 'hk_test_contains', from: ['thing'], to: ['thing'] });
  const engine = engineWith([contains]);
  const state = fresh(engine);
  let id;
  assert.deepEqual(run(state, (s) => { id = openHolding(engine, s, { holdingKind: 'hk_test_contains', holder: 'container_x', subject: 'batch_y', cause: CAUSE }); }), { ok: true });
  assert.equal(state.holdings.container_x[id].subject, 'batch_y');
  assert.deepEqual(book.entries.map((e) => e.verb), ['verb_holding_changed']);
});

test('丙7（李白 11-18 22:10）：带 record 的边关闭整笔拒收 E-ACT-WRITER-NOT-READY，关边不回填史实、状态不变', () => {
  const rel = row({ id: 'hk_test_rel', carriesRel: false });
  const engine = engineWith([rel], { rel_wed_test: { record: 'rel_wed_record' } });
  const state = fresh(engine);
  state.holdings = { npc_a: { hld_1: { kind: 'hk_test_rel', holder: 'npc_a', subject: 'item_q', terms: { since: MINUTE, until: null, endReason: null, suspended: false, consentAct: null, grantor: null, rel: 'rel_wed_test' }, grantedBy: null } } };
  const snap = JSON.stringify(state);
  fails(state, (s) => closeHolding(engine, s, { id: 'hld_1', cause: CAUSE }), 'E-ACT-WRITER-NOT-READY');
  assert.equal(JSON.stringify(state), snap);
  assert.equal(book.entries.length, 0);
});

test('带关系的种类（carriesRel）与未接线的准入入口都整笔拒收，不静默跳过', () => {
  const state = fresh();
  fails(state, (s) => openHolding(ENGINE, s, { holdingKind: 'hk_kin', holder: 'npc_a', subject: 'npc_b', cause: CAUSE }), 'E-ACT-WRITER-NOT-READY');
  const admitted = row({ id: 'hk_test_admit', admission: 'test.mjs#admit' });
  const engine = engineWith([admitted]);
  installHoldingEngine(engine);
  fails(state, (s) => openHolding(engine, s, { holdingKind: 'hk_test_admit', holder: 'npc_a', subject: 'item_q', cause: CAUSE }), 'E-ACT-WRITER-NOT-READY');
  assert.equal(edges(state).length, 0);
});

// 卷十八 §3.3 :389：持有写者遇到 carriesRel 或 intimate 为真的种类，一律转交内核关系写者。
test('intimate 为真的种类也转交关系写者，未上线即整笔拒收 E-ACT-WRITER-NOT-READY', () => {
  const intimate = row({ id: 'hk_test_intimate', intimate: true });
  const engine = engineWith([intimate]);
  const state = fresh(engine);
  fails(state, (s) => openHolding(engine, s, { holdingKind: 'hk_test_intimate', holder: 'npc_a', subject: 'item_q', cause: CAUSE }), 'E-ACT-WRITER-NOT-READY');
  assert.equal(edges(state).length, 0);
});

// ---------- 加载期核对补项（卷十八 §2.5 :286–:292、§2.6 :311/:319） ----------

test('加载期核对：intimate 缺列即 E-REL-INTIMATE-FIELD（§2.6 :311）', () => {
  const bad = row({ id: 'hk_test_no_intimate' });
  delete bad.intimate;
  const out = checkHoldingKindRows(engineWith([bad]));
  assert.equal(out.errors.some((e) => e.startsWith('E-REL-INTIMATE-FIELD')), true);
});

test('加载期核对：concluded 行 termsKeys 不含 origin 即 E-HK-PROTOCOL（§2.5 :287）', () => {
  const bad = row({ id: 'hk_test_concluded', concluded: true, termsKeys: [] });
  const out = checkHoldingKindRows(engineWith([bad]));
  assert.equal(out.errors.some((e) => e.startsWith('E-HK-PROTOCOL')), true);
});

test('加载期核对：任一格 ho_succeed 而无 succeedBy 即 E-HK-SUCCEED-SOURCE（§2.5 :289）', () => {
  const bad = row({ id: 'hk_test_succeed', gone: 'ho_succeed', succeedBy: null });
  const out = checkHoldingKindRows(engineWith([bad]));
  assert.equal(out.errors.some((e) => e.startsWith('E-HK-SUCCEED-SOURCE')), true);
});

test('加载期核对：gone 取 ho_stay 即 E-HK-PROTOCOL（§2.6 :319）', () => {
  const bad = row({ id: 'hk_test_gone_stay', gone: 'ho_stay' });
  const out = checkHoldingKindRows(engineWith([bad]));
  assert.equal(out.errors.some((e) => e.startsWith('E-HK-PROTOCOL')), true);
});

test('事件随事务提交才落：事务内后一步失败，先前开边与事件一并回滚', () => {
  const state = fresh();
  assert.throws(() => run(state, (s) => {
    openHolding(ENGINE, s, { holdingKind: 'hk_resides', holder: 'npc_a', subject: 'place_x', cause: CAUSE });
    throw new Error('boom');
  }), /boom/);
  assert.equal(state.holdings, undefined);
  assert.equal(book.entries.length, 0);
});
