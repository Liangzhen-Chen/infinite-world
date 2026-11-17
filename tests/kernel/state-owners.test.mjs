// 块 2 第 2-2 张《声明表与合并器》：state-owners.json 合并与核对、sortKey 算法与离线生成器、state-types.d.ts 生成与漂移、P 随 pathTypes 生成、registerSystems 骨架。
// 依据卷二 §2.6 第 1、4 条，§2.7（stateKeys、systems、pathTypes、textPaths、phase/sortKey、两个闭集字段、readShapes、路径模式匹配语义），§2.9 第 0 条，§4.3；
// 卷十一 R11-3.14（sortKey 算法）；卷十二 §2.11（dim-validate 设施）。
// 合并器用例的声明表是测试内造的最小表（虚构顶层键 box、memo，不是世界内容）；sortKey 期望值按 R11-3.14 手算成字面量。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { mergeStateOwners, assignSortKeys, overlapPairs, compareSpecificity, patternsOverlap } from '../../server-plugin/kernel/load/state-owners.mjs';
import { V, E, P } from '../../server-plugin/kernel/handles/generated.mjs';
import { kindOf } from '../../server-plugin/kernel/vocab.mjs';
import { registerSystems } from '../../server-plugin/systems.mjs';
import { applySortKeys } from '../../tools/gen-sort-keys.mjs';
import { renderStateTypes, tsTypeOf } from '../../tools/gen-state-types.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const realDecl = () => JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8'));

const CTX = { units: new Set(['count']), kinds: new Set(['gadget']), families: new Set(['grade']) };
const base = () => ({
  stateKeys: { box: { readers: [], writers: { '*': 'box.mjs' } } },
  systems: { 'sys.box': { view: 'box.mjs#boxView', tables: [], writers: ['box.*'], entryCallerFiles: {}, entryJudges: [] } },
  textPaths: ['memo.*'],
  textWriters: { 'memo.*': 'ai-gate/memo-gate.mjs' },
  pathTypes: { 'box.*': 'integer:count', 'memo.*': 'sealed' },
  phases: ['clock', 'body'],
  readShapes: [],
});
const codes = (d) => mergeStateOwners(d, CTX).errors.map((e) => e.code).sort();
const hook = (phase, after, sortKey) => ({ phase, after, sortKey });

// ---------- 真实声明表 ----------

test('真实 state-owners.json：合并零错；loadWorld 通过后 V、E、P 都有成员，P 成员按派生名、textPaths 不生成', () => {
  const m = mergeStateOwners(realDecl(), { units: new Set(['count']) });
  assert.deepEqual(m.errors, []);
  const r = loadWorld(ROOT);
  assert.ok(r.ok, r.text);
  assert.ok(Object.keys(V).length > 0);
  assert.equal(E.E_WRITER_DUPLICATE, 'E-WRITER-DUPLICATE');
  assert.equal(E.E_PHASE_DUPLICATE, 'E-PHASE-DUPLICATE');
  assert.deepEqual(Object.keys(P), ['created_props', 'created_props_basis', 'displayNames_seq', 'pendingPost', 'terminated']);
  assert.equal(P.created_props('mat_x', 'density'), 'created.mat_x.props.density');
  assert.equal(P.terminated('npc_x'), 'terminated.npc_x');
  assert.equal(P.displayNames_text, undefined);
  assert.equal(P.narration, undefined);
  assert.equal(P.playerNotes_text, undefined);
  assert.throws(() => kindOf('zz_not_an_id'), (e) => e.code === 'E-DIM-REF-MISSING');
  assert.deepEqual(r.owners.displayPaths, ['displayNames.*.text', 'playerNotes.*.text']);
  assert.deepEqual(r.owners.ledgerPaths, []);
});

test('真实声明表：sys.dimension_entry 两个闭集字段显式写空值；不登 sys.migration、ledgerSystem', () => {
  const d = realDecl();
  assert.deepEqual(d.systems['sys.dimension_entry'], { tables: [], entryCallerFiles: {}, entryJudges: [] });
  assert.equal(d.systems['sys.migration'], undefined);
  assert.equal(d.ledgerSystem, undefined);
});

// ---------- 合并器各拒收码：正例（base 零错）与反例 ----------

test('正例：最小声明表零错；textWriters 与 stateKeys 同一写者不算多写者', () => {
  assert.deepEqual(codes(base()), []);
  const d = base();
  d.stateKeys.memo = { readers: [], writers: { '*': 'ai-gate/memo-gate.mjs' } };
  assert.deepEqual(codes(d), []);
});

test('E-PATH-SEGMENT-GRAMMAR：pathTypes 字面段不合文法、保留字、全 * 模式', () => {
  for (const p of ['box.Bad', 'box.constructor', '*.*', 'box.1x']) {
    const d = base(); d.pathTypes[p] = 'integer:count';
    assert.ok(codes(d).includes('E-PATH-SEGMENT-GRAMMAR'), p);
  }
});

test('E-PATH-NAME-CLASH：两条模式派生同一 P 成员名', () => {
  const d = base();
  d.stateKeys.box_a = { readers: [], writers: { '*': 'box.mjs' } };
  d.pathTypes['box_a.b'] = 'integer:count';
  d.pathTypes['box.a_b'] = 'integer:count';
  assert.deepEqual(codes(d), ['E-PATH-NAME-CLASH']);
});

test('E-TEXT-UNGATED：路径或 list 元素为 string、textPath 不是 sealed、非 textPath 用 sealed', () => {
  const cases = [['box.*', 'string'], ['box.*', 'list<string>'], ['memo.*', 'integer:count'], ['box.*', 'sealed'], ['box.*', 'list<sealed>']];
  for (const [p, t] of cases) { const d = base(); d.pathTypes[p] = t; assert.deepEqual(codes(d), ['E-TEXT-UNGATED'], `${p} ${t}`); }
});

test('E-DIM-UNIT-UNKNOWN：数值路径不带单位或单位不在 _units', () => {
  for (const t of ['number', 'integer', 'number:furlong', 'list<integer:furlong>']) { const d = base(); d.pathTypes['box.*'] = t; assert.deepEqual(codes(d), ['E-DIM-UNIT-UNKNOWN'], t); }
});

test('E-DIM-STRUCT-FIELD：类型不合文法；系统漏写 entryCallerFiles / entryJudges；未知字段；readers 缺', () => {
  const t = base(); t.pathTypes['box.*'] = 'blob'; assert.deepEqual(codes(t), ['E-DIM-STRUCT-FIELD']);
  const a = base(); delete a.systems['sys.box'].entryCallerFiles; assert.deepEqual(codes(a), ['E-DIM-STRUCT-FIELD']);
  const b = base(); delete b.systems['sys.box'].entryJudges; assert.deepEqual(codes(b), ['E-DIM-STRUCT-FIELD']);
  const c = base(); c.systems['sys.box'].ledgerSystem = true; assert.deepEqual(codes(c), ['E-DIM-STRUCT-FIELD']);
  const e = base(); delete e.stateKeys.box.readers; assert.deepEqual(codes(e), ['E-DIM-STRUCT-FIELD']);
  const f = base(); f.stateKeys.box.writers['*'] = { create: ['a.mjs'], rewrite: 'b.mjs', viaRelocate: false }; assert.deepEqual(codes(f), ['E-DIM-STRUCT-FIELD']);
  const g = base(); g.stateKeys.box.writers['*'] = { create: ['a.mjs'], rewrite: null, rewriteRows: 'all', viaRelocate: false }; assert.deepEqual(codes(g), ['E-DIM-STRUCT-FIELD']);
});

test('E-PATH-UNDECLARED：顶层键无 pathTypes、textPath 不在 pathTypes、display 与 memberRecomputable 不在 pathTypes、textWriters 多出键', () => {
  const a = base(); a.stateKeys.crate = { readers: [], writers: { '*': 'crate.mjs' } }; assert.deepEqual(codes(a), ['E-PATH-UNDECLARED']);
  const b = base(); delete b.pathTypes['memo.*']; assert.deepEqual(codes(b), ['E-PATH-UNDECLARED']);
  const c = base(); c.stateKeys.box.display = ['*.label']; assert.deepEqual(codes(c), ['E-PATH-UNDECLARED']);
  const ok = base(); ok.stateKeys.box.display = ['*']; assert.deepEqual(codes(ok), []);
  const d = base(); d.memberRecomputable = ['box.*.*']; assert.deepEqual(codes(d), ['E-PATH-UNDECLARED']);
  const e = base(); e.textWriters['note.*'] = 'ai-gate/x.mjs'; assert.deepEqual(codes(e), ['E-PATH-UNDECLARED']);
});

test('E-WRITER-MISSING：textPath 没有写者', () => {
  const d = base(); delete d.textWriters['memo.*'];
  assert.deepEqual(codes(d), ['E-WRITER-MISSING']);
});

test('E-WRITER-DUPLICATE：create 重复；既 create 又 rewrite 而无 rewriteRows；textWriters 与 stateKeys 写者不同', () => {
  const w = (o) => { const d = base(); d.stateKeys.box.writers['*'] = o; return codes(d); };
  assert.deepEqual(w({ create: ['a.mjs', 'a.mjs'], rewrite: null, viaRelocate: false }), ['E-WRITER-DUPLICATE']);
  assert.deepEqual(w({ create: ['a.mjs'], rewrite: 'a.mjs', viaRelocate: false }), ['E-WRITER-DUPLICATE']);
  assert.deepEqual(w({ create: ['a.mjs'], rewrite: 'a.mjs', rewriteRows: { withComponent: ['cmp_x'], inside: [] }, viaRelocate: false }), []);
  assert.deepEqual(w({ create: ['a.mjs', 'b.mjs'], rewrite: 'c.mjs', rewriteRows: 'all', viaRelocate: false }), []);
  const d = base(); d.stateKeys.memo = { readers: [], writers: { '*': 'other.mjs' } };
  assert.deepEqual(codes(d), ['E-WRITER-DUPLICATE']);
});

test('E-RELOC-FIELDS：写者对象漏写 viaRelocate；viaRelocate 真却无改写写者或行范围写 "all"', () => {
  const w = (o) => { const d = base(); d.stateKeys.box.writers['*'] = o; return codes(d); };
  assert.deepEqual(w({ create: [], rewrite: null }), ['E-RELOC-FIELDS']);
  assert.deepEqual(w({ create: [], rewrite: 'a.mjs', rewriteRows: 'all', viaRelocate: true }), ['E-RELOC-FIELDS']);
  assert.deepEqual(w({ create: [], rewrite: null, viaRelocate: true }), ['E-RELOC-FIELDS']);
  assert.deepEqual(w({ create: [], rewrite: 'a.mjs', rewriteRows: { withComponent: [], inside: ['cmp_x'] }, viaRelocate: true }), []);
});

test('E-STATE-MULTI-WRITER：两个系统的 writers 登记同一模式', () => {
  const d = base();
  d.systems['sys.crate'] = { tables: [], writers: ['box.*'], entryCallerFiles: {}, entryJudges: [] };
  assert.deepEqual(codes(d), ['E-STATE-MULTI-WRITER']);
});

test('E-PHASE-DUPLICATE：同阶段同键；不同阶段同键不算', () => {
  const d = base();
  d.systems['sys.box'].phase = { boxTick: hook('body', [], 1), boxTock: hook('body', [], 1) };
  assert.deepEqual(codes(d), ['E-PHASE-DUPLICATE']);
  const ok = base();
  ok.systems['sys.box'].phase = { boxTick: hook('body', [], 1), boxTock: hook('clock', [], 1) };
  assert.deepEqual(codes(ok), []);
});

test('推进钩子格式：阶段不在 phases 即 E-DIM-DOMAIN-ENUM；少字段即 E-DIM-STRUCT-FIELD', () => {
  const a = base(); a.systems['sys.box'].phase = { boxTick: hook('dusk', [], 1) }; assert.deepEqual(codes(a), ['E-DIM-DOMAIN-ENUM']);
  const b = base(); b.systems['sys.box'].phase = { boxTick: { phase: 'body', sortKey: 1 } }; assert.deepEqual(codes(b), ['E-DIM-STRUCT-FIELD']);
});

test('sortKey 重算比对（李白 11-17 裁定①②）：成环、悬空、跨相位报 E-PHASE-SORTKEY-ORDER，文件值漂移报 E-PHASE-SORTKEY-DRIFT，合规零错；都经 E 句柄报、不抛异常', () => {
  const run = (phase) => { const d = base(); d.systems['sys.box'].phase = phase; return mergeStateOwners(d, CTX); };
  assert.deepEqual(run({ boxTick: hook('body', [], 1), boxTock: hook('body', ['boxTick'], 2) }).errors, []);
  // 漂移：boxTock after boxTick，重算 boxTick 1、boxTock 2，文件写反。
  const drift = run({ boxTick: hook('body', [], 2), boxTock: hook('body', ['boxTick'], 1) });
  assert.equal(drift.ok, false);
  assert.deepEqual(drift.errors.map((e) => e.code), ['E-PHASE-SORTKEY-DRIFT', 'E-PHASE-SORTKEY-DRIFT']);
  assert.deepEqual(drift.errors.map((e) => [e.row, e.got, e.want]), [
    ['boxTick', 2, '1 (recomputed by R11-3.14; run tools/gen-sort-keys.mjs)'],
    ['boxTock', 1, '2 (recomputed by R11-3.14; run tools/gen-sort-keys.mjs)'],
  ]);
  // 成环。
  const cyc = run({ boxTick: hook('body', ['boxTock'], 1), boxTock: hook('body', ['boxTick'], 2) });
  assert.deepEqual(cyc.errors.map((e) => e.code), ['E-PHASE-SORTKEY-ORDER']);
  assert.match(cyc.errors[0].got, /after cycle: boxTick -> boxTock -> boxTick/);
  // 悬空：after 指向不存在的钩子。
  const gone = run({ boxTick: hook('body', ['boxGone'], 1) });
  assert.deepEqual(gone.errors.map((e) => e.code), ['E-PHASE-SORTKEY-ORDER']);
  assert.match(gone.errors[0].got, /boxTick\.after names "boxGone"/);
  // 跨相位：指向别的相位的钩子按悬空处理。
  const cross = run({ boxTick: hook('clock', [], 1), boxTock: hook('body', ['boxTick'], 1) });
  assert.deepEqual(cross.errors.map((e) => e.code), ['E-PHASE-SORTKEY-ORDER']);
  assert.match(cross.errors[0].got, /boxTock\.after names "boxTick", not a hook of phase body/);
});

test('E-PATH-OVERLAP：同等具体且重叠的模式；具体程度按字面段数、再按 * 靠后', () => {
  assert.deepEqual(overlapPairs(['a.*', 'a.*', 'a.b']), [['a.*', 'a.*']]);
  assert.deepEqual(overlapPairs(['a.*.c', 'a.b.*', 'a.*.*']), []);
  assert.ok(compareSpecificity('a.b.*', 'a.*.c') > 0);
  assert.ok(compareSpecificity('created.*.props.basis', 'created.*.props.*') > 0);
  assert.equal(compareSpecificity('a.*', 'a.*'), 0);
  assert.ok(patternsOverlap('a.*.c', 'a.b.*'));
  assert.ok(!patternsOverlap('a.*', 'a.*.*'));
});

test('readShapes：合格行零错；entry 未登记、类型不在四值加 shape、refFamily 不配、重复行、字段不齐均 E-DIM-STRUCT-FIELD', () => {
  const row = (o) => ({ entry: 'box.mjs#boxView', field: 'count', type: 'number', refFamily: null, nullable: false, ...o });
  const run = (rows) => { const d = base(); d.readShapes = rows; return codes(d); };
  assert.deepEqual(run([row(), row({ field: 'owner', type: 'code', refFamily: 'gadget' }), row({ field: 'tier', type: 'handle', refFamily: 'grade', nullable: true }), row({ field: 'need', type: 'shape', refFamily: 'struct:requirementBlock' })]), []);
  assert.deepEqual(run([row({ entry: 'box.mjs#other' })]), ['E-DIM-STRUCT-FIELD']);
  assert.deepEqual(run([row({ type: 'string' })]), ['E-DIM-STRUCT-FIELD']);
  assert.deepEqual(run([row({ type: 'code', refFamily: 'grade' })]), ['E-DIM-STRUCT-FIELD']);
  assert.deepEqual(run([row({ refFamily: 'gadget' })]), ['E-DIM-STRUCT-FIELD']);
  assert.deepEqual(run([row(), row()]), ['E-DIM-STRUCT-FIELD']);
  const short = row(); delete short.nullable;
  assert.deepEqual(run([short]), ['E-DIM-STRUCT-FIELD']);
});

test('账本账户路径：改写写者是账本写者的模式不生成 P；textPaths 同样不生成', () => {
  const d = base();
  d.stateKeys.purse = { readers: [], writers: { '*.coins': 'kernel/ledger.mjs', '*.mood': 'purse.mjs' } };
  d.pathTypes['purse.*.coins'] = 'integer:count';
  d.pathTypes['purse.*.mood'] = 'integer:count';
  const m = mergeStateOwners(d, CTX);
  assert.deepEqual(m.errors, []);
  assert.deepEqual(m.merged.ledgerPaths, ['purse.*.coins']);
});

// ---------- sortKey 算法（卷十一 R11-3.14）与离线生成器 ----------

test('assignSortKeys：每相位按 after 做 Kahn 拓扑排序，就绪队列按代号升序取最小者，从 1 连续编号（期望值手算）', () => {
  // environment 相位：就绪 {alpha, itemThermal, zeta} → alpha 1；就绪 {itemThermal, zeta} → itemThermal 2；
  // itemRot 就绪，就绪 {itemRot, zeta} → itemRot 3；zeta 4；beta 5。society 相位另起编号：settlePopulation 1、settleStatBuild 2。
  const systems = {
    'sys.a': { phase: { itemRot: hook('environment', ['itemThermal'], 0), itemThermal: hook('environment', [], 0), zeta: hook('environment', [], 0) } },
    'sys.b': { phase: { beta: hook('environment', ['zeta'], 0), alpha: hook('environment', [], 0), settleStatBuild: hook('society', ['settlePopulation'], 0) } },
    'sys.c': { phase: { settlePopulation: hook('society', [], 0) } },
  };
  const { keys, problems } = assignSortKeys(systems);
  assert.deepEqual(problems, []);
  assert.deepEqual(Object.fromEntries(keys), { alpha: 1, itemThermal: 2, itemRot: 3, zeta: 4, beta: 5, settlePopulation: 1, settleStatBuild: 2 });
});

test('assignSortKeys：b、z 无 after，m after b，a after z → b1 m2 z3 a4（卷文做法，非按层次）', () => {
  const systems = { 'sys.a': { phase: { a: hook('body', ['z'], 0), b: hook('body', [], 0), m: hook('body', ['b'], 0), z: hook('body', [], 0) } } };
  assert.deepEqual(Object.fromEntries(assignSortKeys(systems).keys), { b: 1, m: 2, z: 3, a: 4 });
});

test('assignSortKeys：c after b、a；b after a；d after a → a1 b2 c3 d4', () => {
  const systems = { 'sys.a': { phase: { c: hook('body', ['b', 'a'], 0), b: hook('body', ['a'], 0), a: hook('body', [], 0), d: hook('body', ['a'], 0) } } };
  assert.deepEqual(Object.fromEntries(assignSortKeys(systems).keys), { a: 1, b: 2, c: 3, d: 4 });
});

test('assignSortKeys：同名钩子登记在两个系统、成环、after 不存在都记入 problems', () => {
  assert.equal(assignSortKeys({ 'sys.a': { phase: { x: hook('body', [], 0) } }, 'sys.b': { phase: { x: hook('body', [], 0) } } }).problems.length, 1);
  assert.match(assignSortKeys({ 'sys.a': { phase: { x: hook('body', ['x'], 0) } } }).problems[0], /after cycle: x -> x/);
});

test('离线生成器 applySortKeys：按同一算法改写 sortKey 并列出变化；不改入参；有问题即抛错；对真实声明表是不动点', () => {
  const d = base();
  d.systems['sys.box'].phase = { boxTock: hook('body', ['boxTick'], 7), boxTick: hook('body', [], 7) };
  const { decl, changed } = applySortKeys(d);
  assert.deepEqual(decl.systems['sys.box'].phase, { boxTock: hook('body', ['boxTick'], 2), boxTick: hook('body', [], 1) });
  assert.deepEqual(changed, ['boxTock: 7 → 2', 'boxTick: 7 → 1']);
  assert.equal(d.systems['sys.box'].phase.boxTick.sortKey, 7);
  assert.doesNotThrow(() => mergeStateOwners(decl, CTX));
  d.systems['sys.box'].phase.boxTick.after = ['boxTock'];
  assert.throws(() => applySortKeys(d), /after cycle/);
  assert.deepEqual(applySortKeys(realDecl()).changed, []);
});

// ---------- state-types.d.ts ----------

test('state-types.d.ts 与 pathTypes 生成结果一致（行尾归一后逐字符；漂移即失败：改 pathTypes 后须重跑 tools/gen-state-types.mjs）', () => {
  assert.equal(readFileSync(join(ROOT, 'server-plugin/kernel/state-types.d.ts'), 'utf8').replace(/\r\n/g, '\n'), renderStateTypes(realDecl()));
  const drifted = realDecl(); drifted.pathTypes['terminated.*.extra'] = 'boolean';
  assert.notEqual(renderStateTypes(drifted), renderStateTypes(realDecl()));
});

test('state-types 类型映射按 §2.7 文法；文法外的值抛错', () => {
  assert.equal(tsTypeOf('integer:count'), 'number');
  assert.equal(tsTypeOf('ref:status'), "EntityId<'status'>");
  assert.equal(tsTypeOf('enum:grade'), "Handle<'grade'>");
  assert.equal(tsTypeOf('list<struct:pendingPost>'), "readonly (StructValue<'pendingPost'>)[]");
  assert.equal(tsTypeOf('dimension'), 'DimensionValue');
  assert.equal(tsTypeOf('EventId'), 'EventId');
  assert.throws(() => tsTypeOf('string'), /outside the §2.7 grammar/);
});

// ---------- registerSystems 骨架 ----------

test('registerSystems 骨架：groupApi 只对 index.mjs 开放，文件存在，调用无返回值', () => {
  const row = realDecl().groupApi.exports.find((x) => x.export === 'systems.mjs#registerSystems');
  assert.deepEqual(row.callerFiles, ['index.mjs']);
  assert.ok(existsSync(join(ROOT, 'server-plugin/systems.mjs')));
  assert.equal(registerSystems(), undefined);
});
