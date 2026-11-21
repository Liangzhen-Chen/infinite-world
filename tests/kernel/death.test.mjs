// 块 6 第 6-6 张《人物表与终止登记》：die、settleBody（尸体产出）、carcassOf、requestRevive、去留表覆盖、create 实物同事务源汇腿。
// 卷四《生物身体与人物》§3.3 :414–:420、§4.8 D-1 至 D-6（:874–:900）、§4.8.6 验收断言；卷二 §2.6 终止协议与复生步骤 :519–:531；卷九 R9-2.7 :667；
// 李白 11-19 11:1x ④（丙4 去留四项）；迁移体检 K6-26、K6-27、K6-28；对照表第 11、17 行。
// 测试先写；期望值按卷四 D-4 公式手算成字面量（部位大小之和 × 体重，材料份额向零截断到 4 位再补余量）；前提在临时世界里造（tests/kernel/person-world.mjs），
// 不读仓库当前数据；只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildPersonWorld, MPY, PLACE, SUB, POS, POS_SUB, FLESH, BONE, ATTRS, personRow, ROOT } from './person-world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { installEventLog } from '../../server-plugin/kernel/events.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { installHoldingEngine, openHolding } from '../../server-plugin/kernel/holdings.mjs';
import { installTermination, resetTermination, terminationResidue, registerTerminationCleanup } from '../../server-plugin/kernel/terminate.mjs';
import { installModifierSource, resetModifierSource } from '../../server-plugin/kernel/dimensions.mjs';
import { writePersonRow } from '../../server-plugin/kernel/dimension-writers.mjs';
import { auditLedger } from '../../server-plugin/kernel/ledger.mjs';
import { instantiatePerson } from '../../server-plugin/person.mjs';
import { die, carcassOf, requestRevive, installDeath, settleBody } from '../../server-plugin/death.mjs';
import { runDelegated } from '../../server-plugin/kernel/transaction.mjs';
import { mergeStateOwners } from '../../server-plugin/kernel/load/state-owners.mjs';
import { terminated } from '../../server-plugin/action-capacity.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
useReportSink(() => {});

const REAL_DECL = JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8'));
const { engine: ENGINE, W } = buildPersonWorld();
const NOW = 60 * MPY;
const DAY = NOW / 1440; // 第 21900 日
const CAUSE = 'verb_death_status';
const REVIVE_CAUSE = 'verb_entity_revived';
const CTX = { node: 'test_death', file: 'death.mjs' };
const DECL = REAL_DECL;

let book;
function fresh(engine = ENGINE, decl = DECL) {
  installHoldingEngine(engine);
  book = { entries: [] };
  installEventLog(book);
  resetTermination();
  installTermination(decl);
  installDeath();
  return { clock: { minute: NOW, seq: 0, dueNext: 0 } };
}
const run = (state, fn) => runTransaction(state, CTX, fn);
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const snapshot = (s) => JSON.stringify(canon(s));
function fails(state, fn, code, engine = ENGINE) {
  const before = snapshot(state);
  const n = book.entries.length;
  assert.deepEqual(run(state, fn), { ok: false, code });
  assert.equal(snapshot(state), before, 'state unchanged after rollback');
  assert.equal(book.entries.length, n, 'no event left after rollback');
}
const dieOf = (engine, id, source = null) => (s) => die(engine, s, id, { cause: CAUSE, source });
const corpses = (state, personId) => Object.entries(state.itemInstances || {}).filter(([, r]) => r.ofPerson === personId).map(([id]) => id);
const corpseId = (personId, minute = NOW) => `item_${personId}_${minute}`;

// ---------- die、尸体（D-1 至 D-4） ----------

test('die 全流程：同一事务内标记、尸体产出、账户与持有分流、事件；尸体是 item 实例：模板、ofSpecies、ofPerson、diedMinute、质量与材料构成（躯干 0.46 的肉组织换骨料：骨 0.676、肉 0.324）；死者名下无遗留', () => {
  const state = fresh();
  let out;
  assert.deepEqual(run(state, (s) => { out = die(ENGINE, s, 'npc_a', { cause: CAUSE, source: null }); }), { ok: true });
  assert.deepEqual(out, { already: false, mode: 'inherit', successorId: 'npc_b' });
  assert.deepEqual(state.terminated, { npc_a: { day: DAY, cause: CAUSE, mode: 'inherit' } });
  // 尸体：恰一具，id = 物品前缀 + 死者 id + 死亡分钟。
  assert.deepEqual(corpses(state, 'npc_a'), [corpseId('npc_a')]);
  const inst = state.itemInstances[corpseId('npc_a')];
  assert.deepEqual([inst.template, inst.ofSpecies, inst.ofPerson, inst.diedMinute, inst.taint], ['item_test_corpse', 'species_test_a', 'npc_a', NOW, 0]);
  const props = state.created[corpseId('npc_a')].props;
  assert.equal(props.massKg, 70);
  assert.deepEqual(props.material, [{ group: 'mgroup_body', materialRef: BONE, share: 0.676 }, { group: 'mgroup_body', materialRef: FLESH, share: 0.324 }]);
  // 可腐材料（肉）使这件实例可腐：腐坏初值 0、锚点日 = 死亡日（item-lots.mjs 在死亡日落下）。
  assert.deepEqual([inst.spoilage, inst.rotAnchorDay], [0, DAY]);
  // 尸体躺在死者所在地点：账户上一件（用途取 rules.death.corpsePurpose）。
  assert.deepEqual(Object.values(state.accounts[PLACE].purpose_test_shelf.res_test_corpse), [1]);
  // 状态实例：终止类实例由 die 写、终止第 5 步清掉，提交后无痕。
  assert.equal(Object.hasOwn(state.statuses || {}, 'npc_a'), false);
  assert.deepEqual(terminationResidue(ENGINE, state, 'npc_a'), []);
  assert.deepEqual(terminated(ENGINE, state, 'npc_a'), { ok: true, reason: CAUSE });
  assert.equal(book.entries.filter((e) => e.verb === 'verb_entity_terminated').length, 1);
  assert.deepEqual(auditLedger(ENGINE, state), []);
});

test('K6-28 / 对照表第 11 行：尸体实例经账本在同一事务里记来源腿（该资源行唯一的来源 src_birth 累计 1），总量守恒；资源种类行没有来源或有两个来源（挑不出尸体的那个）整笔回滚（没有死、没有尸体）', () => {
  const state = fresh();
  assert.deepEqual(run(state, dieOf(ENGINE, 'npc_a')), { ok: true });
  assert.deepEqual(state.ledgerTotals.res_test_corpse.src_birth.cumulative, 1);
  const none = { ...ENGINE, rules: { ...ENGINE.rules, economyResources: { ...ENGINE.rules.economyResources, res_test_corpse: { ...ENGINE.rules.economyResources.res_test_corpse, sources: [] } } } };
  const s2 = fresh(none);
  fails(s2, dieOf(none, 'npc_a'), 'E-DIM-STRUCT-FIELD', none);
  assert.equal(s2.terminated, undefined);
  assert.deepEqual(corpses(s2, 'npc_a'), []);
  const two ={ ...ENGINE, rules: { ...ENGINE.rules, economyResources: { ...ENGINE.rules.economyResources, res_test_corpse: { ...ENGINE.rules.economyResources.res_test_corpse, sources: ['src_birth', 'src_regrow'] } } } };
  fails(fresh(two), dieOf(two, 'npc_a'), 'E-DIM-STRUCT-FIELD', two);
});

test('D-1 幂等：对已终止的主体 die 无操作（返回 already，状态与事件日志都不变）；终止判断只经 terminated 谓词', () => {
  const state = fresh();
  assert.deepEqual(run(state, dieOf(ENGINE, 'npc_a')), { ok: true });
  const before = snapshot(state);
  const n = book.entries.length;
  let out;
  assert.deepEqual(run(state, (s) => { out = die(ENGINE, s, 'npc_a', { cause: CAUSE, source: null }); }), { ok: true });
  assert.deepEqual(out, { already: true });
  assert.equal(snapshot(state), before);
  assert.equal(book.entries.length, n);
  assert.equal(corpses(state, 'npc_a').length, 1);
});

test('D-3a：settleBody 只在终止第 1 步内被调（写标记之前）：同一事务里先于它登记的清理在标记前，之后登记的也在标记前；尸体此时已在，标记尚无', () => {
  const state = fresh();
  const seen = [];
  const spyDecl = { ...DECL, systems: { ...DECL.systems, 'sys.test_spy': { tables: [], entryCallerFiles: {}, entryJudges: [], terminationCleanup: { kinds: ['person'], handler: 'test/spy.mjs#spy', sortKey: 3 } } } };
  installTermination(spyDecl);
  registerTerminationCleanup('test/spy.mjs#spy', (_e, st, info) => seen.push({ marked: Object.hasOwn(st.terminated || {}, info.id), corpses: corpses(st, info.id).length, mode: info.mode, successorId: info.successorId }));
  assert.deepEqual(run(state, dieOf(ENGINE, 'npc_a')), { ok: true });
  assert.deepEqual(seen, [{ marked: false, corpses: 1, mode: 'inherit', successorId: 'npc_b' }]);
});

test('carcassOf 个体：丧失的部位不计（左腿完好度降到阈值 0：质量 70 × 0.83 = 58.1，肉 0.2674、骨 0.7325 加余量 0.0001 = 0.7326，和为 1）；lostPartsExcluded 为假时全计（70）', () => {
  const state = fresh();
  resetModifierSource();
  installModifierSource((_e, _s, at) => (at.target === 'body_plan.partIntegrity[bpart_leg_l]' && at.id === 'npc_a' ? [{ id: 'leg', target: at.target, stage: 'add', value: -1, source: { kind: 'status', id: 'leg' } }] : []));
  try {
    const c = carcassOf(ENGINE, state, { subjectId: 'npc_a' });
    assert.equal(c.massKg, 58.1);
    assert.deepEqual(c.material, { [BONE]: 0.7326, [FLESH]: 0.2674 });
    const all = { ...ENGINE, rules: { ...ENGINE.rules, death: { ...ENGINE.rules.death, lostPartsExcluded: false } } };
    const c2 = carcassOf(all, state, { subjectId: 'npc_a' });
    assert.deepEqual([c2.massKg, c2.material], [70, { [BONE]: 0.676, [FLESH]: 0.324 }]);
    // 该状态下 die：尸体质量与构成同上。
    assert.deepEqual(run(state, dieOf(ENGINE, 'npc_a')), { ok: true });
    assert.equal(state.created[corpseId('npc_a')].props.massKg, 58.1);
  } finally { resetModifierSource(); }
});

test('carcassOf 为空：参与部位 sizeFraction 之和为 0（阈值 1，每个部位完好度 1 ≤ 1 全丧失）不做除法，die 照常终止、不新建尸体', () => {
  const { engine } = buildPersonWorld((f) => { f.lostBelow = 1; });
  const state = fresh(engine);
  assert.equal(carcassOf(engine, state, { subjectId: 'npc_a' }), null);
  assert.deepEqual(run(state, dieOf(engine, 'npc_a')), { ok: true });
  assert.deepEqual(corpses(state, 'npc_a'), []);
  assert.equal(Object.hasOwn(state.terminated, 'npc_a'), true);
});

test('carcassOf 物种均值（D-5 未个体化畜群）：{speciesId, massKg} 质量取给定值、部位全完好（400 kg → 材料同上）；没有身体图的主体为 null；目标形状不对拒', () => {
  const state = fresh();
  const c = carcassOf(ENGINE, state, { speciesId: 'species_test_a', massKg: 400 });
  assert.deepEqual([c.massKg, c.material], [400, { [BONE]: 0.676, [FLESH]: 0.324 }]);
  assert.throws(() => carcassOf(ENGINE, state, { speciesId: 'species_test_a' }), (e) => e.code === 'E-DIM-STRUCT-FIELD');
  assert.throws(() => carcassOf(ENGINE, state, {}), (e) => e.code === 'E-DIM-STRUCT-FIELD');
});

// 卷五 §7 M5-38、卷二 §5.5 :1768–:1773（对照表第 2、44 行）：person 行不存 location，个体所在地点 = zoneAt(pos)；尸体躺在死处。
// 夹具（person-world.mjs editPlaceDoc）：PLACE 是 300 × 100 区格小格空间的层根（足迹是整个外包框），子行 SUB 种子区格 (50, 50)、目标 4 区格（含种子格）。
// 细格 (x, y) 的区格序号 = floor(x ÷ 100)（cellM 1 m、regionCellM 100 m）：POS (20050, 5050) → 区格 (200, 50)，不在 SUB 的 4 格里 → 最深足迹 PLACE；
// POS_SUB (5050, 5050) → 区格 (50, 50) 是 SUB 的种子格 → 最深足迹 SUB；(30050, 5050) → 区格 (300, 50) 在外包框（x 0–299）之外 → 未知。
test('尸体躺在死处：所在地点不存、读 zoneAt(pos)——位置在子行足迹里账户开在子行（最深足迹），在郡自己的足迹里开在郡；位置在外包框之外、格空间号不存在都整笔回滚（E-DIM-UNKNOWN-READ，不借别处）', () => {
  const inSub = buildPersonWorld((f) => { f.personRows.npc_a = personRow({ heir: 'npc_b', pos: POS_SUB }); }).engine;
  const s1 = fresh(inSub);
  assert.deepEqual(run(s1, dieOf(inSub, 'npc_a')), { ok: true });
  assert.deepEqual(Object.values(s1.accounts[SUB].purpose_test_shelf.res_test_corpse), [1]);
  assert.equal(Object.hasOwn(s1.accounts, PLACE), false);
  const s2 = fresh();
  assert.deepEqual(run(s2, dieOf(ENGINE, 'npc_a')), { ok: true });
  assert.deepEqual(Object.values(s2.accounts[PLACE].purpose_test_shelf.res_test_corpse), [1]);
  assert.equal(Object.hasOwn(s2.accounts, SUB), false);
  for (const pos of [{ ...POS, x: 30050 }, { ...POS, w: 9 }]) {
    const e = buildPersonWorld((f) => { f.personRows.npc_a = personRow({ heir: 'npc_b', pos }); }).engine;
    fails(fresh(e), dieOf(e, 'npc_a'), 'E-DIM-UNKNOWN-READ', e);
  }
});

test('person 表不存 location（对照表第 2 行）：表头没有这个维度，作者行写 location 按未知字段拒收；pos、facing 是 always 维度（登未建列，卡 6-27），facing 出 [0, 7] 拒收', () => {
  const doc = W.tables.get('person').doc;
  assert.equal(Object.hasOwn(doc.dimensions, 'location'), false);
  assert.deepEqual([doc.dimensions.pos.required, doc.dimensions.facing.required, doc.dimensions.facing.domain], ['always', 'always', [0, 7]]);
  assert.throws(() => buildPersonWorld((f) => { f.personRows.npc_a = personRow({ heir: 'npc_b', location: PLACE }); }), /E-DIM-STRUCT-FIELD","person","npc_a","location"/);
  for (const facing of [-1, 8, 1.5]) assert.throws(() => buildPersonWorld((f) => { f.personRows.npc_a = personRow({ heir: 'npc_b', facing }); }), /E-DIM-DOMAIN-RANGE","person","npc_a","facing"/);
});

test('尸体产出的前提缺一即整笔回滚、不静默：没有尸体模板行、两行都挂尸体类、死者所在地点未知、尸体账户用途未建（登未建）；终止与状态实例都不留', () => {
  const none = buildPersonWorld((f) => { f.items = {}; }).engine;
  fails(fresh(none), dieOf(none, 'npc_a'), 'E-ACT-WRITER-NOT-READY', none);
  const dup = buildPersonWorld((f) => { f.items.item_test_corpse2 = JSON.parse(JSON.stringify(f.items.item_test_corpse)); }).engine;
  fails(fresh(dup), dieOf(dup, 'npc_a'), 'E-DIM-STRUCT-FIELD', dup);
  const noLoc = buildPersonWorld((f) => { f.personRows.npc_a = personRow({ heir: 'npc_b', pos: undefined }); }).engine;
  fails(fresh(noLoc), dieOf(noLoc, 'npc_a'), 'E-DIM-UNKNOWN-READ', noLoc);
  const noPurpose = { ...ENGINE, rules: { ...ENGINE.rules, death: { ...ENGINE.rules.death, corpsePurpose: undefined } } };
  fails(fresh(noPurpose), dieOf(noPurpose, 'npc_a'), 'E-ACT-WRITER-NOT-READY', noPurpose);
});

test('后继算不出（类别行 mode wreck）：残骸生成器块 5 起未建，整笔拒收 E-ACT-WRITER-NOT-READY；清理函数不跑（没有尸体、没有终止标记、状态实例回滚）', () => {
  const state = fresh();
  fails(state, dieOf(ENGINE, 'npc_beast'), 'E-ACT-WRITER-NOT-READY');
  assert.deepEqual(corpses(state, 'npc_beast'), []);
});

test('终止类状态行 rules.death.terminalStatus（状态表里的一行代号，卷四 :318）：指到状态表里没有的行拒 E-DIM-REF-MISSING、整笔回滚，不静默跳过 D-2；真实表值是状态行代号', () => {
  assert.equal(ENGINE.rules.death.terminalStatus, 'status_death');
  const none = { ...ENGINE, rules: { ...ENGINE.rules, death: { ...ENGINE.rules.death, terminalStatus: 'status_nope' } } };
  fails(fresh(none), dieOf(none, 'npc_a'), 'E-DIM-REF-MISSING', none);
  const unset = { ...ENGINE, rules: { ...ENGINE.rules, death: { ...ENGINE.rules.death, terminalStatus: undefined } } };
  fails(fresh(unset), dieOf(unset, 'npc_a'), 'E-RULES-UNREGISTERED', unset);
});

test('写者委托只经登记（卷二 §2.6 第 3 条勘误 1119k16）：委托方文件不在登记里、ref 未登记、ref 登记在别的委托方名下都拒 E-VIEW-UNDECLARED-WRITE，不改节点；加载期委托的 to 文件须是 stateKeys 登记的写者，否则 E-DIM-REF-MISSING', () => {
  const state = fresh();
  const attempt = (file, ref) => runTransaction(state, { node: 'test_deleg', file }, (s) => { runDelegated(s, ref, ENGINE, s, { subject: 'npc_a', status: 'status_death', severity: 0, source: null, bodyPart: null }); });
  assert.deepEqual(attempt('kernel/ledger.mjs', 'status.mjs#addStatusInstance'), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  assert.deepEqual(attempt('death.mjs', 'kernel/ledger.mjs#post'), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  assert.deepEqual(attempt('death.mjs', 'status.mjs#nope'), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  assert.equal(state.statuses, undefined);
  assert.deepEqual(attempt('death.mjs', 'status.mjs#addStatusInstance'), { ok: true });
  assert.equal(state.statuses.npc_a.length, 1);
  const decl = JSON.parse(JSON.stringify(DECL));
  decl.systems['sys.death'].writeDelegations.push({ from: 'death.mjs', to: 'nowriter.mjs#x' });
  const ctx = { units: W.env.units, kinds: new Set(ENGINE.tables.keys()), families: new Set(W.vocab.families.keys()), terminableKinds: ['person'] };
  assert.ok(mergeStateOwners(decl, ctx).errors.some((e) => e.code === 'E-DIM-REF-MISSING' && JSON.stringify(e).includes('nowriter.mjs')));
  assert.deepEqual(mergeStateOwners(JSON.parse(JSON.stringify(DECL)), ctx).errors.filter((e) => JSON.stringify(e).includes('writeDelegations')), []);
});

test('D-4：settleBody 的 mode 为 wreck 时协议原地生成的残骸就是尸体，本卷不另造：直调拒 E-ACT-WRITER-NOT-READY、不新建尸体；inherit 才新建', () => {
  const state = fresh();
  assert.deepEqual(runTransaction(state, { node: 'x', file: 'death.mjs' }, (s) => { settleBody(ENGINE, s, { id: 'npc_a', cause: CAUSE, mode: 'wreck', successorId: null }); }), { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
  assert.deepEqual(corpses(state, 'npc_a'), []);
  assert.deepEqual(runTransaction(state, { node: 'x', file: 'death.mjs' }, (s) => { settleBody(ENGINE, s, { id: 'npc_a', cause: CAUSE, mode: 'inherit', successorId: 'npc_b' }); }), { ok: true });
  assert.equal(corpses(state, 'npc_a').length, 1);
});

// ---------- 去留表覆盖（K6-27、丙4）与终止后无遗留（对照表第 17 行） ----------

test('去留表覆盖：加载器核对通过（含丙4 四项 created.*、outflowTotals.*、displayNames.*.seq 与协议自处置的 stockLots）；真实 world 无 E-TERM-RECORD-UNLISTED', () => {
  assert.deepEqual(W.errors.filter((e) => e.code === 'E-TERM-RECORD-UNLISTED'), []);
  const rows = ENGINE.rules.terminate.records;
  assert.deepEqual(rows.rcls_deviation_row, { atTerminate: 'keep' });
  assert.deepEqual(rows.rcls_outflow_history, { atTerminate: 'keep' });
  assert.deepEqual(rows.rcls_name_history, { atTerminate: 'keep' });
  assert.deepEqual(rows.rcls_revival_cooldown, { atTerminate: 'hold', atRevive: 'keep' });
  assert.deepEqual(rows.rcls_revive_points, { atTerminate: 'hold', atRevive: 'clear' });
  const sr = (k) => DECL.stateKeys[k].subjectRecords;
  assert.equal(sr('created')['*.props.*'].recordClass, 'rcls_deviation_row');
  assert.equal(sr('created')['*.props.basis'].recordClass, 'rcls_deviation_row');
  assert.equal('*.classes' in sr('created'), false, '类别不存储，没有 created.*.classes');
  assert.equal(sr('outflowTotals')['*'].recordClass, 'rcls_outflow_history');
  assert.equal(sr('displayNames')['*.seq'].recordClass, 'rcls_name_history');
  assert.equal(sr('revivals')['*.lastMinute'].recordClass, 'rcls_revival_cooldown');
  assert.equal(sr('revivals')['*.points'].recordClass, 'rcls_revive_points');
});

// 状态里含该实体 id 的全部路径（排除终止标记本身），逐条核对：被某条 subjectRecords 覆盖，且去留为 keep 或 hold（clear 的不许剩）。
// 一条状态路径到某条 subjectRecords 模式（或到叶子）为止：维度值内部的嵌套键不是路径段。
function pathsOf(state, id) {
  const out = [];
  const walk = (node, segs) => {
    const leaf = node === null || typeof node !== 'object' || Array.isArray(node) || Object.keys(node).length === 0;
    if (segs.includes(id) && (leaf || covered(segs, id) !== null)) { out.push(segs); return; }
    if (leaf) return;
    for (const k of Object.keys(node)) walk(node[k], [...segs, k]);
  };
  walk(state, []);
  return out.filter((p) => p[0] !== 'terminated');
}
// 路径被哪条 subjectRecords 覆盖（模式逐段匹配，`*` 段取具体值；主体段序号指向的 `*` 值等于 id）→ 该记录类的去留取值；没有覆盖返回 null。
const covered = (path, id) => {
  const sr = DECL.stateKeys[path[0]] && DECL.stateKeys[path[0]].subjectRecords;
  const rest = path.slice(1);
  for (const [rel, e] of Object.entries(sr || {})) {
    const pat = rel.split('.');
    if (pat.length !== rest.length || !pat.every((p, i) => p === '*' || p === rest[i])) continue;
    const stars = rest.filter((_, i) => pat[i] === '*');
    if (e.subjectSegments.some((k) => stars[k - 1] === id)) return ENGINE.rules.terminate.records[e.recordClass];
  }
  return null;
};

test('终止后按 subjectRecords 与去留表机器枚举无遗留：状态里含死者 id 的路径只剩 keep/hold 的（运行期建的个体的偏离行 created.*、复生点 revivals.*.points）；clear 类与协议自处置类（账户、持有、状态实例）一条不剩', () => {
  const state = fresh();
  // 运行期建的个体（已有位置）：偏离行在 created 下，终止后保留（后果可追溯，丙4）。
  assert.deepEqual(run(state, (s) => { writePersonRow(ENGINE, s, { id: 'npc_run', props: { species: 'species_test_a', sex: 'sex_male', birthMinute: NOW - 20 * MPY, birthplace: PLACE, pos: POS, facing: 0, lifespanYears: 60, adultMassKg: 70, attributes: ATTRS(10), heir: 'npc_b' } }); }), { ok: true });
  assert.deepEqual(run(state, (s) => { openHolding(ENGINE, s, { holdingKind: 'hk_test_revive', holder: 'npc_run', subject: PLACE, cause: CAUSE }); }), { ok: true });
  assert.deepEqual(run(state, dieOf(ENGINE, 'npc_run')), { ok: true });
  // 协议自处置的键（卷二 §2.6：账户、holdings、statuses、modifiers、到期堆；stockLots 随账户）不进去留表：其残余由 terminationResidue 核（持有边只许是已关闭的、账户余额为 0、状态实例已清）。
  const PROTOCOL = ['accounts', 'holdings', 'statuses', 'modifiers', 'due', 'stockLots'];
  const all = pathsOf(state, 'npc_run');
  const left = all.filter((p) => !PROTOCOL.includes(p[0]));
  assert.ok(all.some((p) => p[0] === 'holdings') && !all.some((p) => p[0] === 'statuses'));
  assert.ok(Object.values(state.holdings.npc_run).every((e) => e.terms.until === NOW));
  assert.ok(left.length > 0);
  for (const p of left) {
    const rec = covered(p, 'npc_run');
    assert.ok(rec && (rec.atTerminate === 'keep' || rec.atTerminate === 'hold'), `${p.join('.')} -> ${JSON.stringify(rec)}`);
  }
  assert.ok(left.every((p) => p[0] === 'created' || p[0] === 'revivals'), JSON.stringify(left.map((p) => p.join('.'))));
  assert.deepEqual(state.revivals.npc_run.points, [{ kind: 'hk_test_revive', counterpart: PLACE }]);
  assert.deepEqual(terminationResidue(ENGINE, state, 'npc_run'), []);
});

// ---------- requestRevive（D-6） ----------

const POINT = { kind: 'hk_test_revive', counterpart: PLACE };
function withPoint(engine = ENGINE, id = 'npc_a', kind = 'hk_test_revive') {
  const state = fresh(engine);
  assert.deepEqual(run(state, (s) => { openHolding(engine, s, { holdingKind: kind, holder: id, subject: PLACE, cause: CAUSE }); }), { ok: true });
  assert.deepEqual(run(state, dieOf(engine, id)), { ok: true });
  return state;
}

test('复生点边真行：终止第 4 步关边并整组记点（revivals.points = [{持有种类, 对方}]）；窗口 0 的类别不记点', () => {
  const state = withPoint();
  assert.deepEqual(state.revivals.npc_a.points, [POINT]);
  assert.equal(Object.values(state.holdings.npc_a).every((e) => e.terms.until === NOW), true);
  const zero = withPoint(ENGINE, 'npc_mortal');
  assert.equal(zero.revivals, undefined);
});

test('requestRevive 成功：窗口内（终止当日算第 0 日）、点在、对方未终止、冷却满足 → revive：标记删去、复生点清空、lastMinute = 复生时刻；尸体与已分流的东西不还原；复生事件发出', () => {
  const state = withPoint();
  const later = NOW + 2 * 1440; // 终止后第 2 日，窗口 3 日内
  state.clock.minute = later;
  const n = book.entries.length;
  assert.deepEqual(run(state, (s) => { requestRevive(ENGINE, s, 'npc_a', POINT, REVIVE_CAUSE); }), { ok: true });
  assert.equal(Object.hasOwn(state.terminated, 'npc_a'), false);
  assert.deepEqual(terminated(ENGINE, state, 'npc_a'), { ok: false, reason: null });
  assert.equal(state.revivals.npc_a.lastMinute, later);
  assert.equal(Object.hasOwn(state.revivals.npc_a, 'points'), false, '复生点复生成功即用掉，再获资格须重建复生点边');
  assert.deepEqual(corpses(state, 'npc_a'), [corpseId('npc_a')]);
  assert.equal(book.entries.slice(n).filter((e) => e.verb === 'verb_entity_revived').length, 1);
});

test('requestRevive 拒收一律不动状态、不发事件：没有该点；点的对方已终止；持有种类行没有 revival 维度；窗口外（第 3 日，窗口 3 日）；对方换了也不认', () => {
  const state = withPoint();
  fails(state, (s) => requestRevive(ENGINE, s, 'npc_a', { kind: 'hk_test_revive', counterpart: 'loc_hw' }, REVIVE_CAUSE), 'E-TERM-REVIVE-DENIED');
  fails(state, (s) => requestRevive(ENGINE, s, 'npc_a', { kind: 'hk_resides', counterpart: PLACE }, REVIVE_CAUSE), 'E-TERM-REVIVE-DENIED');
  state.revivals.npc_a.points = [{ kind: 'hk_resides', counterpart: PLACE }];
  fails(state, (s) => requestRevive(ENGINE, s, 'npc_a', { kind: 'hk_resides', counterpart: PLACE }, REVIVE_CAUSE), 'E-TERM-REVIVE-DENIED');
  state.revivals.npc_a.points = [POINT];
  state.terminated[PLACE] = { day: DAY, cause: CAUSE, mode: 'inherit' };
  fails(state, (s) => requestRevive(ENGINE, s, 'npc_a', POINT, REVIVE_CAUSE), 'E-TERM-REVIVE-DENIED');
  delete state.terminated[PLACE];
  state.clock.minute = NOW + 3 * 1440;
  fails(state, (s) => requestRevive(ENGINE, s, 'npc_a', POINT, REVIVE_CAUSE), 'E-TERM-REVIVE-DENIED');
  // 没有终止标记（活人）：revive 自己拒。
  const alive = fresh();
  alive.revivals = { npc_b: { points: [POINT] } };
  fails(alive, (s) => requestRevive(ENGINE, s, 'npc_b', POINT, REVIVE_CAUSE), 'E-TERM-REVIVE-DENIED');
});

test('冷却：距 lastMinute 不足 cooldownDays（30 日）拒；恰满 30 日可过（"不少于"）；无记录视为满足', () => {
  const state = withPoint();
  state.revivals.npc_a.lastMinute = NOW - 29 * 1440;
  fails(state, (s) => requestRevive(ENGINE, s, 'npc_a', POINT, REVIVE_CAUSE), 'E-TERM-REVIVE-DENIED');
  state.revivals.npc_a.lastMinute = NOW - 30 * 1440;
  assert.deepEqual(run(state, (s) => { requestRevive(ENGINE, s, 'npc_a', POINT, REVIVE_CAUSE); }), { ok: true });
  assert.equal(state.revivals.npc_a.lastMinute, NOW);
});

test('复生后再死是另一具尸体（id 带死亡分钟，不复用）；冷却从 lastMinute 起算：再获复生点后立刻 requestRevive 被冷却拒', () => {
  const state = withPoint();
  assert.deepEqual(run(state, (s) => { requestRevive(ENGINE, s, 'npc_a', POINT, REVIVE_CAUSE); }), { ok: true });
  state.clock.minute = NOW + 1440;
  assert.deepEqual(run(state, (s) => { openHolding(ENGINE, s, { holdingKind: 'hk_test_revive', holder: 'npc_a', subject: PLACE, cause: CAUSE }); }), { ok: true });
  assert.deepEqual(run(state, dieOf(ENGINE, 'npc_a')), { ok: true });
  assert.deepEqual(corpses(state, 'npc_a').sort(), [corpseId('npc_a'), corpseId('npc_a', NOW + 1440)].sort());
  fails(state, (s) => requestRevive(ENGINE, s, 'npc_a', POINT, REVIVE_CAUSE), 'E-TERM-REVIVE-DENIED');
});

test('付费或带后果的复生未建（报价上下文、效果族执行器）：cost 或 effects 非空整笔拒 E-ACT-WRITER-NOT-READY，不当免费、不动账本；仍是已终止', () => {
  const state = withPoint(ENGINE, 'npc_a', 'hk_test_revive_paid');
  fails(state, (s) => requestRevive(ENGINE, s, 'npc_a', { kind: 'hk_test_revive_paid', counterpart: PLACE }, REVIVE_CAUSE), 'E-ACT-WRITER-NOT-READY');
  assert.deepEqual(terminated(ENGINE, state, 'npc_a'), { ok: true, reason: CAUSE });
  const fx = { ...ENGINE, vocab: { ...ENGINE.vocab, index: new Map(ENGINE.vocab.index) } };
  const row = ENGINE.vocab.index.get('hk_test_revive');
  fx.vocab.index.set('hk_test_revive', { ...row, entry: { ...row.entry, revival: { cooldownDays: 0, cost: null, effects: [{ family: 'effect_test' }] } } });
  const s2 = withPoint(fx);
  fails(s2, (s) => requestRevive(fx, s, 'npc_a', POINT, REVIVE_CAUSE), 'E-ACT-WRITER-NOT-READY');
});

test('点的形状：缺 kind 或 counterpart、非对象都拒 E-DIM-STRUCT-FIELD（不读文字，只收代号）', () => {
  const state = withPoint();
  for (const p of [null, {}, { kind: 'hk_test_revive' }, { counterpart: PLACE }, { kind: 1, counterpart: PLACE }]) fails(state, (s) => requestRevive(ENGINE, s, 'npc_a', p, REVIVE_CAUSE), 'E-DIM-STRUCT-FIELD');
});

// ---------- 建人后即可死（instantiatePerson 与 die 接上） ----------

test('建出来的人：instantiatePerson 建行后 kind 可解析、类别随物种；终止要后继，heir 缺则算不出（退 wreck，卷二 §2.6 :536）整笔拒收、不留终止标记也不留尸体', () => {
  const state = fresh();
  const spec = { instanceId: 'npc_born', species: 'species_test_a', birthplace: PLACE, birthMinute: NOW - 20 * MPY };
  assert.deepEqual(run(state, (s) => { instantiatePerson(ENGINE, s, spec); }), { ok: true });
  fails(state, dieOf(ENGINE, 'npc_born'), 'E-ACT-WRITER-NOT-READY');
  assert.deepEqual(corpses(state, 'npc_born'), []);
  assert.equal(Object.hasOwn(state.terminated || {}, 'npc_born'), false);
});
