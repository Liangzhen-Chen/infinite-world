// 效果族表与 effects()（卷二 §3.9 :1456–:1493；迁移体检块5 K5-32、对照表 #32–#36）。
// 族行全是本测试内造的夹具（照 §3.9 示例的形状，数值自拟），不进生产表；生产表 _effects.json 只放卷文已定的真实行，现为空表。
// 期望值按公式手算成字面量：mass=80、param_potency=50 时 magnitude = 80/100*50 = 40；修正值 = 40*0.1 = 4；原语 delta = -40；耗费 = 40*0.5 = 20。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDimensions } from '../../server-plugin/kernel/validate/dimensions-validate.mjs';
import { effects } from '../../server-plugin/kernel/effects.mjs';
import { fixture, OPTIONS, sourcesOf } from './fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRIMITIVES = [
  { op: 'vital', required: { target: 'id', delta: 'number' } },
  { op: 'fact.set', required: { entity: 'id', field: 'dimension' }, oneOf: [[{ value: 'number' }, { delta: 'number' }]] },
];
// effectCtxFields：登记卷写明的 ctx 字段（李白 11-19 10:4x 裁定 ②e）；夹具里登记 holder 一个。
const opts = (o = {}) => ({ ...OPTIONS, primitives: PRIMITIVES, effectCtxFields: ['holder'], ...o });

const baseFamily = () => ({
  family: 'eff_mend',
  targetSelector: { scope: 'target', filter: 'mass > 1' },
  requirement: 'req_basic',
  magnitudeRX: 'mass / 100 * param_potency',
  outputs: [
    { kind: 'modifier', target: 'gadget.size', stage: 'add', valueRX: 'magnitude * 0.1', duration: { days: 3 } },
    { kind: 'primitive', op: 'vital', idParams: { target: 'target' }, paramsRX: { delta: '-magnitude' } },
    { kind: 'event', verb: 'verb_mended' },
  ],
  consent: { mode: 'target', power: null },
  cost: { resource: 'res_mana', amountRX: 'magnitude * 0.5' },
  params: { param_potency: { unit: 'count', domain: [0, 100] } },
  cooldownDays: 0,
  basis: '测试夹具，数值自拟',
});

function make(edit) {
  const f = fixture();
  f.vocab.families.parameter = { closed: false, prefix: 'param_', entries: { param_potency: {}, param_reach: {} } };
  f.vocab.families.requirement = { closed: false, prefix: 'req_', entries: { req_basic: {} } };
  f.vocab.families.power = { closed: false, prefix: 'pow_', entries: { pow_heal: {} } };
  f.vocab.families.verb = { closed: false, prefix: 'verb_', entries: { verb_mended: {} } };
  f.vocab.families.resource = { closed: false, prefix: 'res_', entries: { res_mana: {} } };
  f.effects = { eff_mend: baseFamily() };
  if (edit) edit(f);
  return f;
}
const sources = (f) => ({ ...sourcesOf(f), effects: JSON.stringify(f.effects) });
const run = (f, o = opts()) => validateDimensions(sources(f), o);
const errCodes = (r) => r.errors.filter((e) => e.severity === 'error').map((e) => e.code);
const ctx = { params: { param_potency: 50 }, dims: { mass: 80 }, target: 'gad_box', fields: { holder: 'gad_hammer' } };

test('夹具族通过加载期校验；族行与 RX 树随加载结果交出', () => {
  const r = run(make());
  assert.deepEqual(r.errors, []);
  assert.ok(r.effects.rows.has('eff_mend'));
});

test('effects() 照 outputs 声明逐条返回、顺序同声明：kind/target 原样 + RX 求值（幅度 40 → 修正值 4、delta -40），不加新字段', () => {
  const r = run(make());
  const out = effects(r, {}, 'eff_mend', ctx);
  assert.deepEqual(out, [
    { kind: 'modifier', target: 'gadget.size', stage: 'add', duration: { days: 3 }, value: 4 },
    { kind: 'primitive', op: 'vital', params: { target: 'gad_box', delta: -40 } },
    { kind: 'event', verb: 'verb_mended' },
  ]);
});

test('纯函数：同输入同输出；不改引擎、不改 state、不改 ctx', () => {
  const r = run(make());
  const state = Object.freeze({ day: 1, nested: Object.freeze({ a: 1 }) });
  const frozenCtx = Object.freeze({ params: Object.freeze({ param_potency: 50 }), dims: Object.freeze({ mass: 80 }), target: 'gad_box' });
  const rowsBefore = JSON.stringify([...r.effects.rows]);
  const a = effects(r, state, 'eff_mend', frozenCtx);
  const b = effects(r, state, 'eff_mend', frozenCtx);
  assert.deepEqual(a, b);
  assert.notEqual(a[0], b[0]);
  a[0].value = 999;
  assert.equal(effects(r, state, 'eff_mend', frozenCtx)[0].value, 4);
  assert.equal(JSON.stringify([...r.effects.rows]), rowsBefore);
});

test('只填数据接入：新增一行族数据（无 magnitudeRX、无参数、空 params 表）不改代码即可求值', () => {
  const r = run(make((f) => {
    f.effects.eff_flash = {
      family: 'eff_flash', targetSelector: { scope: 'self' }, outputs: [{ kind: 'event', verb: 'verb_mended' }],
      consent: { mode: 'none', power: null }, params: {}, cooldownDays: 2, basis: '测试夹具',
    };
  }));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(effects(r, {}, 'eff_flash', {}), [{ kind: 'event', verb: 'verb_mended' }]);
});

test('族未知：effects() 报 E-EFF-FAMILY-UNKNOWN（含引擎无效果表）', () => {
  const r = run(make());
  assert.throws(() => effects(r, {}, 'eff_nope', ctx), (e) => e.code === 'E-EFF-FAMILY-UNKNOWN');
  assert.throws(() => effects({}, {}, 'eff_mend', ctx), (e) => e.code === 'E-EFF-FAMILY-UNKNOWN');
});

test('调用参数：键未声明、值越域（含 0 边界之外、非数值）报 E-EFF-PARAM；域边界值可过', () => {
  const r = run(make());
  const call = (p) => () => effects(r, {}, 'eff_mend', { ...ctx, params: p });
  assert.throws(call({ param_potency: 50, param_reach: 1 }), (e) => e.code === 'E-EFF-PARAM');
  assert.throws(call({ param_potency: 101 }), (e) => e.code === 'E-EFF-PARAM');
  assert.throws(call({ param_potency: -1 }), (e) => e.code === 'E-EFF-PARAM');
  assert.throws(call({ param_potency: Number.NaN }), (e) => e.code === 'E-EFF-PARAM');
  assert.throws(call({ param_potency: '50' }), (e) => e.code === 'E-EFF-PARAM');
  assert.equal(call({ param_potency: 0 })()[0].value, 0);
  assert.equal(call({ param_potency: 100 })()[0].value, 8);
});

test('RX 读不到的基值：求值失败 E-MOD-RX，不给缺省', () => {
  const r = run(make());
  assert.throws(() => effects(r, {}, 'eff_mend', { ...ctx, dims: {} }), (e) => e.code === 'E-MOD-RX');
});

test('params 每行必写：缺写与非表报 E-EFF-PARAM；空表 {} 通过', () => {
  assert.ok(errCodes(run(make((f) => { delete f.effects.eff_mend.params; }))).includes('E-EFF-PARAM'));
  assert.ok(errCodes(run(make((f) => { f.effects.eff_mend.params = []; }))).includes('E-EFF-PARAM'));
  assert.ok(errCodes(run(make((f) => { f.effects.eff_mend.params = null; }))).includes('E-EFF-PARAM'));
  const ok = run(make((f) => { f.effects.eff_mend.params = {}; f.effects.eff_mend.magnitudeRX = 'mass'; }));
  assert.deepEqual(ok.errors, []);
});

test('params 逐项核：参数代号不在 parameter 族、单位未登记、取值域倒置或非有限', () => {
  const bad = (spec, key = 'param_potency') => errCodes(run(make((f) => { f.effects.eff_mend.params = { [key]: spec }; f.effects.eff_mend.magnitudeRX = 'mass'; })));
  assert.ok(bad({ unit: 'count', domain: [0, 100] }, 'mass_x').includes('E-EFF-PARAM'));
  assert.ok(bad({ unit: 'nope', domain: [0, 100] }).includes('E-EFF-PARAM'));
  assert.ok(bad({ unit: 'count', domain: [100, 0] }).includes('E-EFF-PARAM'));
  assert.ok(bad({ unit: 'count', domain: [0] }).includes('E-EFF-PARAM'));
  assert.ok(bad({ unit: 'count', domain: [0, Number.MAX_VALUE * 2] }).includes('E-EFF-PARAM'));
  assert.ok(bad({ unit: 'count', domain: [0, 0] }).length === 0);
});

test('RX 报错：magnitudeRX 读未知名、outputs 值式、targetSelector.filter、cost 式各自 E-EFF-RX；读未声明的参数同样拒', () => {
  const rxBad = (edit) => errCodes(run(make(edit)));
  assert.ok(rxBad((f) => { f.effects.eff_mend.magnitudeRX = 'mass / nothing_here'; }).includes('E-EFF-RX'));
  assert.ok(rxBad((f) => { f.effects.eff_mend.outputs[0].valueRX = 'magnitude *'; }).includes('E-EFF-RX'));
  assert.ok(rxBad((f) => { f.effects.eff_mend.targetSelector.filter = 'unknown_dim > 1'; }).includes('E-EFF-RX'));
  assert.ok(rxBad((f) => { f.effects.eff_mend.cost.amountRX = 'magnitude * param_missing_here'; }).includes('E-EFF-RX'));
  assert.ok(rxBad((f) => { f.effects.eff_mend.outputs[1].paramsRX.delta = ''; }).includes('E-EFF-RX'));
  assert.ok(rxBad((f) => { delete f.effects.eff_mend.magnitudeRX; }).includes('E-EFF-RX'), '没有 magnitudeRX 时 outputs 不得读 magnitude');
});

test('outputs：kind 不在封闭枚举、缺字段、多余字段报 E-EFF-OUTPUT', () => {
  const o = (edit) => errCodes(run(make(edit)));
  assert.ok(o((f) => { f.effects.eff_mend.outputs[2].kind = 'teleport'; }).includes('E-EFF-OUTPUT'));
  assert.ok(o((f) => { delete f.effects.eff_mend.outputs[2].verb; }).includes('E-EFF-OUTPUT'));
  assert.ok(o((f) => { f.effects.eff_mend.outputs[2].extra = 1; }).includes('E-EFF-OUTPUT'));
  assert.ok(o((f) => { f.effects.eff_mend.outputs = {}; }).includes('E-EFF-OUTPUT'));
});

test('原语输出：op 不在目录、参数名不在该原语契约、目录未交都报 E-EFF-PRIMITIVE（不放空）', () => {
  const p = (edit, o = opts()) => errCodes(run(make(edit), o));
  assert.ok(p((f) => { f.effects.eff_mend.outputs[1].op = 'wish'; }).includes('E-EFF-PRIMITIVE'));
  assert.ok(p((f) => { f.effects.eff_mend.outputs[1].paramsRX.bogus = '1'; }).includes('E-EFF-PRIMITIVE'));
  assert.ok(p(null, opts({ primitives: undefined })).includes('E-EFF-PRIMITIVE'));
  assert.ok(p(null, opts({ primitives: [] })).includes('E-EFF-PRIMITIVE'));
  assert.deepEqual(p((f) => { f.effects.eff_mend.outputs[1] = { kind: 'primitive', op: 'fact.set', idParams: { entity: 'ctx.holder' }, paramsRX: { value: 'magnitude', field: 'mass' } }; }), []);
});

test('修正项输出：目标未登记或不可修正、阶段不在枚举、动词不在词表', () => {
  const o = (edit) => errCodes(run(make(edit)));
  // 效果族 outputs 的 target 未注册报 E-EFF-OUTPUT（卷二 §4.3、附录 A14；李白 11-19 10:4x ②c），不取修正项的 E-MOD-KEY-UNREGISTERED。
  for (const bad of ['gadget.mass', 'body.bloodPumping', 'bad target']) {
    const codes = o((f) => { f.effects.eff_mend.outputs[0].target = bad; });
    assert.ok(codes.includes('E-EFF-OUTPUT'), bad);
    assert.ok(!codes.includes('E-MOD-KEY-UNREGISTERED'), bad);
  }
  assert.ok(o((f) => { f.effects.eff_mend.outputs[0].stage = 'divide'; }).includes('E-MOD-STAGE'));
  assert.ok(o((f) => { f.effects.eff_mend.outputs[2].verb = 'verb_unknown'; }).includes('E-EVT-VERB'));
});

test('primitive 的 id 型参数只认两种明文来源：选出的目标（target）与登记的 ctx 字段；给不出的组合加载时拒 E-EFF-PARAM', () => {
  const e = (edit, o = opts()) => errCodes(run(make(edit), o));
  // 没写 idParams：vital 的 target（id 型）无来源。
  assert.ok(e((f) => { delete f.effects.eff_mend.outputs[1].idParams; }).includes('E-EFF-PARAM'));
  // ctx 字段未登记。
  assert.ok(e((f) => { f.effects.eff_mend.outputs[1].idParams = { target: 'ctx.nobody' }; }).includes('E-EFF-PARAM'));
  assert.ok(e(null, opts({ effectCtxFields: undefined })).length === 0, '默认夹具只用 target 来源，不需要登记字段');
  assert.ok(e((f) => { f.effects.eff_mend.outputs[1].idParams = { target: 'ctx.holder' }; }, opts({ effectCtxFields: undefined })).includes('E-EFF-PARAM'));
  // 来源写成别的值、绑到非 id 型参数、同名又给 RX。
  assert.ok(e((f) => { f.effects.eff_mend.outputs[1].idParams = { target: 'anyone' }; }).includes('E-EFF-PARAM'));
  assert.ok(e((f) => { f.effects.eff_mend.outputs[1].idParams = { target: 'target', delta: 'target' }; }).includes('E-EFF-PARAM'));
  assert.ok(e((f) => { f.effects.eff_mend.outputs[1].paramsRX.target = '1'; }).includes('E-EFF-PARAM'));
  // 登记的 ctx 字段可用。
  assert.deepEqual(e((f) => { f.effects.eff_mend.outputs[1].idParams = { target: 'ctx.holder' }; }), []);
});

test('调用期：id 来源取 ctx.target 或 ctx.fields 里登记字段；给不出即 E-EFF-PARAM', () => {
  const r = run(make((f) => { f.effects.eff_mend.outputs[1].idParams = { target: 'ctx.holder' }; }));
  assert.equal(effects(r, {}, 'eff_mend', ctx)[1].params.target, 'gad_hammer');
  assert.throws(() => effects(r, {}, 'eff_mend', { ...ctx, fields: {} }), (x) => x.code === 'E-EFF-PARAM');
  const r2 = run(make());
  assert.throws(() => effects(r2, {}, 'eff_mend', { ...ctx, target: undefined }), (x) => x.code === 'E-EFF-PARAM');
});

test('命名空间读数：调用方预取冻结后传入，只取该族 RX 引用到的键、同键只用一份；未引用的键不进求值', () => {
  const r = run(make((f) => { f.effects.eff_mend.outputs[0].valueRX = 'story.wealth * 2'; }));
  const a = effects(r, {}, 'eff_mend', { ...ctx, nsReads: { 'story.wealth': 3, 'story.other': 99 } });
  assert.equal(a[0].value, 6);
  assert.throws(() => effects(r, {}, 'eff_mend', ctx), (x) => x.code === 'E-MOD-RX');
});

test('consent：mode 不在枚举、power 非空且不在 power 族、缺 power 键都报 E-EFF-CONSENT；power 取词表代号通过', () => {
  const c = (consent) => errCodes(run(make((f) => { f.effects.eff_mend.consent = consent; })));
  assert.ok(c({ mode: 'everyone', power: null }).includes('E-EFF-CONSENT'));
  assert.ok(c({ mode: 'target', power: 'pow_unknown' }).includes('E-EFF-CONSENT'));
  assert.ok(c({ mode: 'target' }).includes('E-EFF-CONSENT'));
  assert.ok(c('target').includes('E-EFF-CONSENT'));
  assert.deepEqual(c({ mode: 'authority', power: 'pow_heal' }), []);
});

test('行结构：族 id 须 eff_ 前缀、family 与 id 一致、缺必填字段、多余字段、scope 不在枚举、requirement 未登记、冷却为负', () => {
  const e = (edit) => errCodes(run(make(edit)));
  assert.ok(e((f) => { f.effects.heal = f.effects.eff_mend; delete f.effects.eff_mend; }).includes('E-DIM-ID-FORMAT'));
  assert.ok(e((f) => { f.effects.eff_mend.family = 'eff_other'; }).includes('E-DIM-STRUCT-FIELD'));
  assert.ok(e((f) => { delete f.effects.eff_mend.basis; }).includes('E-DIM-STRUCT-FIELD'));
  assert.ok(e((f) => { f.effects.eff_mend.handler = 'x'; }).includes('E-DIM-STRUCT-FIELD'));
  assert.ok(e((f) => { f.effects.eff_mend.targetSelector.scope = 'everywhere'; }).includes('E-DIM-DOMAIN-ENUM'));
  assert.ok(e((f) => { f.effects.eff_mend.requirement = 'req_unknown'; }).includes('E-DIM-REF-MISSING'));
  assert.ok(e((f) => { f.effects.eff_mend.cooldownDays = -1; }).includes('E-DIM-DOMAIN-RANGE'));
  assert.ok(e((f) => { f.effects.eff_mend.cooldownDays = 1.5; }).includes('E-DIM-DOMAIN-RANGE'));
  assert.ok(e((f) => { f.effects.eff_mend.cost.resource = 'res_unknown'; }).includes('E-DIM-REF-MISSING'));
});

test('族 id 与别的 id 重名按 E-DIM-ID-DUPLICATE 拒', () => {
  assert.ok(errCodes(run(make((f) => { f.vocab.families.power.entries.eff_mend = {}; f.vocab.families.power.prefix = 'eff_'; }))).includes('E-DIM-ID-DUPLICATE'));
});

test('生产表：world/ontology/dimensions/_effects.json 现无卷文已定的真实族行，是空表；不含占位行', () => {
  const doc = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/_effects.json'), 'utf8'));
  assert.deepEqual(doc, {});
});

test('effects.mjs 不写 state、不 import 写入口：只 import errors、rx、markers', () => {
  const text = readFileSync(join(ROOT, 'server-plugin/kernel/effects.mjs'), 'utf8');
  const imports = [...text.matchAll(/^import .* from '(.+)';$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['./errors.mjs', './handles/markers.mjs', './rx.mjs']);
});
