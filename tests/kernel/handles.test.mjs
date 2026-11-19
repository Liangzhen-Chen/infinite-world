// 块 2 第 2-1 张《类型与句柄》：V、E、P 句柄生成，entityId、DimKey/ModKey/StatePath 构造，vocab/kindOf/idIndex，clone，kernelApi 登记。
// 依据卷二 §2.6 第 1、4 条，§2.7 kernelApi :599–606，§2.8 第 1 条，§2.9 第 2 条强转豁免文件表，§3.1，§4.2，§5.0 :1586，§7 A3。
// 数据全是 fixture.mjs 造的最小表（虚构表 gadget，不是世界内容）；期望值按卷文手写。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateDimensions } from '../../server-plugin/kernel/validate/dimensions-validate.mjs';
import { loadVocab } from '../../server-plugin/kernel/load/vocab-load.mjs';
import { installVocab, registry, vocab, kindOf, idIndex } from '../../server-plugin/kernel/vocab.mjs';
import { installHandles, buildV, buildE, buildP, V, E, P } from '../../server-plugin/kernel/handles/generated.mjs';
import { handleOf, errorCodeOf, errorMemberName } from '../../server-plugin/kernel/handles/vocab-handle.mjs';
import { entityId } from '../../server-plugin/kernel/handles/entity-id.mjs';
import { dimKeyOf, modKeyOf, parseDimKey, statePathOf } from '../../server-plugin/kernel/handles/keys.mjs';
import { clone } from '../../server-plugin/kernel/clone.mjs';
import { fixture, OPTIONS, sourcesOf } from './fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const report = validateDimensions(sourcesOf(fixture()), OPTIONS);
installVocab(report);
const rejects = (fn, code) => assert.throws(fn, (e) => e.code === code && e.message.startsWith(code));

test('前提：fixture 加载 0 错', () => {
  assert.deepEqual(report.errors, []);
});

test('V：每族每条目一个句柄，值即代号；未登记成员不存在；冻结', () => {
  installHandles({ vocab: report.vocab, decl: {} });
  assert.deepEqual(Object.keys(V), ['aggregate', 'class', 'component', 'grade', 'relation', 'vstatus']);
  assert.equal(V.grade.grd_a, 'grd_a');
  assert.equal(V.class.cls_heavy_tool, 'cls_heavy_tool');
  assert.deepEqual(Object.keys(V.grade), ['grd_a', 'grd_b']);
  assert.equal(V.grade.grd_zz, undefined);
  assert.equal(V.gradee, undefined);
  assert.ok(Object.isFrozen(V) && Object.isFrozen(V.grade));
  assert.throws(() => { V.grade.grd_a = 'grd_b'; }, TypeError);
});

test('Handle 构造：未登记 E-DIM-REF-MISSING，错拼 E-DIM-ID-FORMAT，别族 E-VIEW-FAMILY-MISMATCH', () => {
  const idx = report.vocab.index;
  assert.equal(handleOf(idx, 'grade', 'grd_b'), 'grd_b');
  rejects(() => handleOf(idx, 'grade', 'grd_zz'), 'E-DIM-REF-MISSING');
  rejects(() => handleOf(idx, 'grade', 'Grd_a'), 'E-DIM-ID-FORMAT');
  rejects(() => handleOf(idx, 'grade', 'grd a'), 'E-DIM-ID-FORMAT');
  rejects(() => handleOf(idx, 'grade', 'cls_tool'), 'E-VIEW-FAMILY-MISMATCH');
});

test('V 只经构造函数：词表里有不合文法的条目时生成即拒收', () => {
  const errs = [];
  const bad = loadVocab({ families: { grade: { closed: false, prefix: 'grd_', entries: { grd_a: {}, grd_B: {} } } } }, [], (e) => errs.push(e));
  assert.deepEqual(errs.map((e) => e.code), ['E-DIM-ID-FORMAT']);
  rejects(() => buildV(bad), 'E-DIM-ID-FORMAT');
});

test('E：成员名按 §4.2 连字符换下划线，值是原码；空登记无成员', () => {
  assert.deepEqual({ ...buildE(['W-DIM-UNIT-DIM', 'E-DIM-DOMAIN-RANGE']) }, { E_DIM_DOMAIN_RANGE: 'E-DIM-DOMAIN-RANGE', W_DIM_UNIT_DIM: 'W-DIM-UNIT-DIM' });
  assert.equal(errorMemberName('E-HK-HOLD-WHILE'), 'E_HK_HOLD_WHILE');
  assert.deepEqual(Object.keys(buildE([])), []);
  installHandles({ vocab: report.vocab, decl: {} });
  assert.equal(E.E_PATH_UNDECLARED, 'E-PATH-UNDECLARED');
  assert.equal(E.E_PATH_OVERLAP, 'E-PATH-OVERLAP');
  assert.equal(E.E_NOT_A_CODE, undefined);
  assert.ok(Object.isFrozen(E));
});

test('ErrorCode 构造：错拼 E-DIM-ID-FORMAT，未登记 E-DIM-REF-MISSING', () => {
  assert.equal(errorCodeOf('E-DIM-DOMAIN-RANGE'), 'E-DIM-DOMAIN-RANGE');
  rejects(() => errorCodeOf('E-DIM-DOMAIN-RANGES'), 'E-DIM-REF-MISSING');
  rejects(() => errorCodeOf('E_DIM_DOMAIN_RANGE'), 'E-DIM-ID-FORMAT');
  rejects(() => errorCodeOf('E-dim-domain-range'), 'E-DIM-ID-FORMAT');
  rejects(() => errorCodeOf('E-DIM'), 'E-DIM-ID-FORMAT');
  rejects(() => buildE(['E-DIM-DOMAIN-RANGE', 'X-DIM-FOO']), 'E-DIM-ID-FORMAT');
  assert.equal(errorCodeOf('E-DIM-DOMAIN-RANGE', new Set(['E-DIM-DOMAIN-RANGE'])), 'E-DIM-DOMAIN-RANGE');
  rejects(() => errorCodeOf('E-PATH-OVERLAP', new Set(['E-DIM-DOMAIN-RANGE'])), 'E-DIM-REF-MISSING');
});

test('P：缺 pathTypes 键或空表时无成员（仓库 state-owners.json 建 pathTypes 后有成员，见 state-owners.test.mjs）', () => {
  assert.deepEqual(Object.keys(buildP({})), []);
  assert.deepEqual(Object.keys(buildP({ pathTypes: {} })), []);
  installHandles({ vocab: report.vocab, decl: {} });
  assert.deepEqual(Object.keys(P), []);
  assert.ok(Object.isFrozen(P));
});

test('P：成员名由模式派生（点换下划线、* 不进名字、按序成参数）；textPaths 与账本路径不生成；原串键不存在', () => {
  const decl = {
    pathTypes: {
      'npcs.*.coins': 'number:copper', 'modifiers.*': 'struct:modifier', 'holdings.*.*': 'struct:holding',
      'narration.*': 'sealed', 'lot.*.spoilage': 'number:bps',
    },
    textPaths: ['narration.*'],
  };
  const p = buildP(decl, { ledgerPaths: ['npcs.*.coins'] });
  assert.deepEqual(Object.keys(p), ['holdings', 'lot_spoilage', 'modifiers']);
  assert.equal(p.lot_spoilage('gad_box'), 'lot.gad_box.spoilage');
  assert.equal(p.holdings('gad_box', 'gad_hammer'), 'holdings.gad_box.gad_hammer');
  assert.equal(p.modifiers('gad_box'), 'modifiers.gad_box');
  assert.equal(p['lot.*.spoilage'], undefined);
  assert.equal(p['holdings.*.*'], undefined);
  assert.equal(p.npcs_coins, undefined);
  assert.equal(p.narration, undefined);
  rejects(() => p.holdings('gad_box'), 'E-PATH-UNDECLARED');
  rejects(() => p.lot_spoilage('gad_box', 'x'), 'E-PATH-UNDECLARED');
  rejects(() => p.modifiers('a.b'), 'E-DIM-ID-FORMAT');
  rejects(() => p.modifiers(''), 'E-DIM-ID-FORMAT');
  rejects(() => statePathOf(new Set(['modifiers.*']), 'narration.*', ['x']), 'E-PATH-UNDECLARED');
  rejects(() => statePathOf(new Set(['modifiers.*']), 'modifier.*', ['x']), 'E-PATH-UNDECLARED');
});

test('P：两条模式派生同名即生成失败 E-PATH-NAME-CLASH，不静默覆盖；被排除的模式不参与查重', () => {
  rejects(() => buildP({ pathTypes: { 'a_b.c': 'number:count', 'a.b_c': 'number:count' } }), 'E-PATH-NAME-CLASH');
  rejects(() => buildP({ pathTypes: { 'lot.*.spoilage': 'number:bps', 'lot.spoilage': 'number:bps' } }), 'E-PATH-NAME-CLASH');
  assert.deepEqual(Object.keys(buildP({ pathTypes: { 'a_b.c': 'number:count', 'a.b_c': 'number:count' } }, { ledgerPaths: ['a.b_c'] })), ['a_b_c']);
  installHandles({ vocab: report.vocab, decl: {} });
  assert.equal(E.E_PATH_NAME_CLASH, 'E-PATH-NAME-CLASH');
});

test('P：pathTypes 字面段文法 ^[a-z][a-zA-Z0-9_]*$、constructor/prototype 保留、至少一个字面段（李白 11-17 裁定及修正），违者 E-PATH-SEGMENT-GRAMMAR', () => {
  const build = (pattern, opts) => buildP({ pathTypes: { [pattern]: 'number:count' } }, opts);
  rejects(() => build('lot.constructor'), 'E-PATH-SEGMENT-GRAMMAR');
  rejects(() => build('prototype.*'), 'E-PATH-SEGMENT-GRAMMAR');
  rejects(() => build('lot.Foo'), 'E-PATH-SEGMENT-GRAMMAR');
  assert.deepEqual(Object.keys(build('displayNames.*.text')), ['displayNames_text']);
  assert.deepEqual(Object.keys(build('playerNotes.*.text')), ['playerNotes_text']);
  assert.deepEqual(Object.keys(build('pendingPost.*')), ['pendingPost']);
  assert.deepEqual(Object.keys(build('ledgerTotals')), ['ledgerTotals']);
  assert.deepEqual(Object.keys(build('renewSinceRem')), ['renewSinceRem']);
  assert.deepEqual(Object.keys(build('constructors.x')), ['constructors_x']);
  rejects(() => build('lot-x.*.spoilage'), 'E-PATH-SEGMENT-GRAMMAR');
  rejects(() => build('lot.*.2nd'), 'E-PATH-SEGMENT-GRAMMAR');
  rejects(() => build('__proto__.*'), 'E-PATH-SEGMENT-GRAMMAR');
  rejects(() => build('lot._x'), 'E-PATH-SEGMENT-GRAMMAR');
  rejects(() => build('lot.Name'), 'E-PATH-SEGMENT-GRAMMAR');
  rejects(() => build('lot..x'), 'E-PATH-SEGMENT-GRAMMAR');
  rejects(() => build('*'), 'E-PATH-SEGMENT-GRAMMAR');
  rejects(() => build('*.*'), 'E-PATH-SEGMENT-GRAMMAR');
  rejects(() => build('lot-x.*', { ledgerPaths: ['lot-x.*'] }), 'E-PATH-SEGMENT-GRAMMAR');
  assert.deepEqual(Object.keys(build('a.*.b2_c')), ['a_b2_c']);
  assert.deepEqual(Object.keys(build('a')), ['a']);
  assert.equal(build('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.*')['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']('gad_box').endsWith('.gad_box'), true);
  installHandles({ vocab: report.vocab, decl: {} });
  assert.equal(E.E_PATH_SEGMENT_GRAMMAR, 'E-PATH-SEGMENT-GRAMMAR');
});

test('installHandles 原子赋值：P 生成抛错时 V、E、P 保持原值', () => {
  installHandles({ vocab: report.vocab, decl: { pathTypes: { 'lot.*.spoilage': 'number:bps' } } });
  const [v0, e0, p0] = [V, E, P];
  assert.deepEqual(Object.keys(p0), ['lot_spoilage']);
  const other = loadVocab({ families: { grade: { closed: false, prefix: 'grd_', entries: { grd_q: {} } } } }, [], () => {});
  rejects(() => installHandles({ vocab: other, decl: { pathTypes: { 'bad-seg.*': 'number:count' } } }), 'E-PATH-SEGMENT-GRAMMAR');
  assert.equal(V, v0);
  assert.equal(E, e0);
  assert.equal(P, p0);
  assert.equal(V.grade.grd_q, undefined);
  assert.equal(V.grade.grd_a, 'grd_a');
});

test('entityId：合文法且前缀属该 kind 才收；未登记 kind E-DIM-REF-MISSING', () => {
  assert.equal(entityId('gadget', 'gad_box'), 'gad_box');
  assert.equal(entityId('gadget', 'gad_new_one'), 'gad_new_one');
  rejects(() => entityId('gadget', 'box'), 'E-DIM-ID-FORMAT');
  rejects(() => entityId('gadget', 'Gad_box'), 'E-DIM-ID-FORMAT');
  rejects(() => entityId('gadget', 'cls_tool'), 'E-DIM-ID-FORMAT');
  rejects(() => entityId('widget', 'gad_box'), 'E-DIM-REF-MISSING');
});

test('kindOf 查注册表；idIndex 给副本，改副本不动注册表', () => {
  assert.equal(kindOf('gad_box'), 'gadget');
  rejects(() => kindOf('gad_nope'), 'E-DIM-REF-MISSING');
  rejects(() => kindOf('grd_a'), 'E-DIM-REF-MISSING');
  const idx = idIndex();
  assert.deepEqual(idx, new Map([['gad_box', 'gadget'], ['gad_hammer', 'gadget']]));
  idx.set('gad_extra', 'gadget');
  rejects(() => kindOf('gad_extra'), 'E-DIM-REF-MISSING');
});

test('vocab(engine, family, id)：返回条目字段的冻结副本；未登记、别族拒收', () => {
  const engine = { vocab: report.vocab };
  const entry = vocab(engine, 'component', 'cmp_sharp');
  assert.deepEqual(entry, { table: 'gadget', requires: ['mass'], enables: ['use'] });
  assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.requires));
  assert.deepEqual(vocab(engine, 'class', 'cls_heavy_tool'), { broader: 'cls_tool' });
  rejects(() => vocab(engine, 'grade', 'grd_zz'), 'E-DIM-REF-MISSING');
  rejects(() => vocab(engine, 'grade', 'cls_tool'), 'E-VIEW-FAMILY-MISMATCH');
});

test('DimKey：拼接格式 <kind>.<dimension>[<key>]；未登记维度、非 map 下标、别族下标拒收', () => {
  const reg = registry();
  assert.equal(dimKeyOf(reg, 'gadget', 'mass'), 'gadget.mass');
  assert.equal(dimKeyOf(reg, 'gadget', 'weights', 'grd_a'), 'gadget.weights[grd_a]');
  rejects(() => dimKeyOf(reg, 'gadget', 'weights', 'cls_tool'), 'E-DIM-REF-MISSING');
  rejects(() => dimKeyOf(reg, 'gadget', 'weights', 'grd_zz'), 'E-DIM-REF-MISSING');
  rejects(() => dimKeyOf(reg, 'gadget', 'mass', 'grd_a'), 'E-DIM-REF-MISSING');
  rejects(() => dimKeyOf(reg, 'gadget', 'masss'), 'E-DIM-REF-MISSING');
  rejects(() => dimKeyOf(reg, 'widget', 'mass'), 'E-DIM-REF-MISSING');
  rejects(() => dimKeyOf(reg, 'gadget', 'Mass'), 'E-DIM-ID-FORMAT');
  rejects(() => dimKeyOf(reg, 'Gadget', 'mass'), 'E-DIM-ID-FORMAT');
});

test('DimKey 解析：拆出 kind、维度、下标再按同一套核对', () => {
  const reg = registry();
  assert.deepEqual(parseDimKey(reg, 'gadget.weights[grd_b]'), { key: 'gadget.weights[grd_b]', kind: 'gadget', dimension: 'weights', sub: 'grd_b' });
  assert.deepEqual(parseDimKey(reg, 'gadget.mass'), { key: 'gadget.mass', kind: 'gadget', dimension: 'mass', sub: undefined });
  rejects(() => parseDimKey(reg, 'gadget.weights[grd_b'), 'E-DIM-ID-FORMAT');
  rejects(() => parseDimKey(reg, 'gadget'), 'E-DIM-ID-FORMAT');
  rejects(() => parseDimKey(reg, 'gadget.weights[grd_zz]'), 'E-DIM-REF-MISSING');
  const num = { ...reg, tableDims: new Map([['gadget', { byLevel: { type: 'map', key: { type: 'integer' }, value: { type: 'number' } } }]]) };
  assert.equal(dimKeyOf(num, 'gadget', 'byLevel', 3), 'gadget.byLevel[3]');
  assert.deepEqual(parseDimKey(num, 'gadget.byLevel[3]'), { key: 'gadget.byLevel[3]', kind: 'gadget', dimension: 'byLevel', sub: 3 });
  rejects(() => dimKeyOf(num, 'gadget', 'byLevel', Infinity), 'E-DIM-REF-MISSING');
});

test('ModKey：modifiable:true 的数值或数值 map 才是修正键（§3.1、§7 A3）', () => {
  const reg = registry();
  assert.equal(modKeyOf(reg, 'gadget', 'size'), 'gadget.size');
  rejects(() => modKeyOf(reg, 'gadget', 'mass'), 'E-MOD-KEY-UNREGISTERED');
  rejects(() => modKeyOf(reg, 'gadget', 'grade'), 'E-MOD-KEY-UNREGISTERED');
  rejects(() => modKeyOf(reg, 'gadget', 'sizes'), 'E-MOD-KEY-UNREGISTERED');
  const dims = reg.tableDims.get('gadget');
  const mod = { ...reg, tableDims: new Map([['gadget', { ...dims, weights: { ...dims.weights, modifiable: true } }]]) };
  assert.equal(modKeyOf(mod, 'gadget', 'weights', 'grd_a'), 'gadget.weights[grd_a]');
  rejects(() => modKeyOf(mod, 'gadget', 'weights', 'grd_zz'), 'E-DIM-REF-MISSING');
  rejects(() => modKeyOf(mod, 'gadget', 'weights'), 'E-MOD-KEY-UNREGISTERED');
});

test('clone：深拷贝，改副本不动原值', () => {
  const src = { a: [1, { b: 2 }], m: new Map([['k', [3]]]) };
  const c = clone(src);
  assert.deepEqual(c, src);
  assert.notEqual(c.a[1], src.a[1]);
  c.a[1].b = 9;
  c.m.get('k').push(4);
  assert.equal(src.a[1].b, 2);
  assert.deepEqual(src.m.get('k'), [3]);
});

test('kernelApi 登记：state-owners.json 每条导出所指文件存在且确有该导出', async () => {
  const decl = JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8'));
  const rows = decl.kernelApi.exports;
  assert.ok(rows.length > 0);
  for (const row of rows) {
    const [file, name] = row.export.split('#');
    const abs = join(ROOT, 'server-plugin', file);
    assert.ok(existsSync(abs), `${row.export}: file missing`);
    const mod = await import(pathToFileURL(abs).href);
    assert.ok(Object.hasOwn(mod, name), `${row.export}: export missing`);
    assert.equal(typeof row.acceptsState, 'boolean');
    // 卷二 §2.7 :577（勘误 1118k30，李白 11-19 11:1x ①）：callers（组键）与 callerFiles（具体文件）至少写一个，两者可并存、取并集；写了的都是非空字串表。
    assert.ok(Array.isArray(row.callers) || Array.isArray(row.callerFiles), `${row.export}: callers or callerFiles`);
    for (const f of ['callers', 'callerFiles']) if (row[f] !== undefined) assert.ok(Array.isArray(row[f]) && row[f].length > 0 && row[f].every((s) => typeof s === 'string' && s.length > 0), `${row.export}: ${f} is a non-empty list of strings`);
  }
});
