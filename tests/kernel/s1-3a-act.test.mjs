// S1-3a 单测：动作目录与执行（写码方自补，不作验收依据；S1-3 接口草案 §2、§6 中 S1-3a 一组的行为）。
// 期望值从世界数据读出或在测试里先造前提（卷九 §2.2、R9-1.1、R9-1.2；卷二 §3.9；设计册 docs/世界设计/14-历史传说与玩家来历.md §4.7），不抄仓库基线计数。
// 世界数据经测试副本改动，不改 world/；存档根目录用 tests/accept/temp-root.mjs#testTempRoot。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testTempRoot } from '../accept/temp-root.mjs';
import { init, saveSlot, loadSlot, replay_apply } from '../../server-plugin/index.mjs';
import { express } from '../support/express.mjs';
import { mountKernel } from '../../server-plugin/rules/load/mount.mjs';
import { dim } from '../../server-plugin/kernel/dimensions.mjs';
import { clockMinute } from '../../server-plugin/kernel/scheduler.mjs';
import { handlesOp } from '../../server-plugin/kernel/transaction.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';

const W = new URL('../../world/', import.meta.url);
const json = (rel) => JSON.parse(readFileSync(new URL(rel, W), 'utf8'));
const code = (c) => (e) => e.code === c;

/** 世界数据原文（与 index.mjs#readWorld 同形）。 */
function rawWorld() {
  const dims = new URL('ontology/dimensions/', W);
  const acts = new URL('actions/', W);
  const registryRows = json('rules/registry.json').rows;
  return {
    dimensionDocs: readdirSync(dims).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort().map((f) => JSON.parse(readFileSync(new URL(f, dims), 'utf8'))),
    namedStructsDoc: json('ontology/named-structs.json'),
    owners: json('ontology/state-owners.json'),
    registryRows,
    tableDocs: Object.fromEntries(registryRows.map((r) => [r.code, json(`rules/${r.file}`)])),
    digestExclude: json('rules/tables/digest-exclude.json').paths,
    primitivesDoc: json('ontology/primitives.json'),
    vocabDoc: json('ontology/dimensions/_vocab.json'),
    // 单位表与采样表（S1-3c：选来历建化身时按物种分布补齐维度、开局年龄折 birthMinute，与 index.mjs#readWorld 同形）。
    unitsDoc: json('ontology/dimensions/_units.json'),
    distributionsDoc: json('ontology/dimensions/_distributions.json'),
    effectsDoc: json('ontology/dimensions/_effects.json'),
    actionDocs: readdirSync(acts).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(new URL(f, acts), 'utf8'))),
  };
}
const caps = (dir) => ({ digestCap: createDigestCap(), saveRoot: pathToFileURL(join(dir, '/')), sources: [{ path: 'x.mjs', text: '' }], modifierSources: Object.freeze([]) });
const mount = (raw, tag) => mountKernel(raw, caps(testTempRoot(tag)));
const clone = (v) => JSON.parse(JSON.stringify(v));

/** 动作行：按「无行动者也可用」与「需要化身」两类从数据里认（不写动作代号）。 */
function rowsOf(raw) {
  const rows = Object.assign({}, ...raw.actionDocs);
  const ids = Object.keys(rows);
  const spawn = ids.find((id) => Object.values(rows[id].slots).some((s) => s.kind === 'code'));
  const pass = ids.find((id) => Object.values(rows[id].slots).some((s) => s.kind === 'number'));
  return { rows, spawn, pass };
}
/** 开放的出身代号（按设计册 §4.7：gate 为空，或所指开关为真）与带这些出身的模板行（S1-3d 起种族与出身解耦，来历候选不看 species）。 */
function openTemplates(raw) {
  const po = raw.tableDocs.playerOrigins.rows;
  const sw = Object.fromEntries(po.map((r) => [r.key, r.value]));
  const origins = raw.vocabDoc.families.origin.entries;
  const person = raw.dimensionDocs.find((d) => d.kind === 'person').rows;
  return Object.keys(person).filter((id) => {
    const o = origins[person[id].origin];
    return o && (o.gate === null || sw[o.gate] === true);
  }).sort();
}
/** 可扮演种族（卷四 G-2 :1085）：物种行 classes 含 rules.chargen.playableClass 所指组件类。 */
function playableSpecies(raw) {
  const cls = raw.tableDocs.chargen.rows.find((r) => r.key === 'playableClass').value;
  const species = raw.dimensionDocs.find((d) => d.kind === 'species').rows;
  return Object.keys(species).filter((id) => Array.isArray(species[id].classes) && species[id].classes.includes(cls)).sort();
}
/** 槽位按所指数据表找（不写槽名）。 */
const slotOn = (rows, act, table) => Object.keys(rows[act].slots).find((k) => rows[act].slots[k].tableRow === table);
/** 开放地点：place 行 genOpen 为真。 */
const openPlaces = (raw) => Object.entries(raw.dimensionDocs.find((d) => d.kind === 'place').rows).filter(([, r]) => r.genOpen === true).map(([id]) => id).sort();

test('1 开局菜单 menu(null)：只有无需化身的建档动作；候选 = 开放出身的模板行 × 开放地点；visible 只含开放地点', async () => {
  const raw = rawWorld();
  const { spawn, rows } = rowsOf(raw);
  const g = await init(express.Router(), { saveRoot: testTempRoot('s3a-menu-') });
  const m = g.menu(null);
  assert.deepEqual(m.affordances.map((a) => a.act), [spawn]);
  const a = m.affordances[0];
  const tableOf = (k) => rows[spawn].slots[k].tableRow;
  for (const [slot, ids] of Object.entries(a.slots)) {
    const want = { place: openPlaces(raw), species: playableSpecies(raw), person: openTemplates(raw) }[tableOf(slot)];
    assert.deepEqual([...ids], want, slot);
  }
  assert.deepEqual([...m.visible], openPlaces(raw));
  // 设计册 §6.5：18 文化 × 3 背景；每个文化恰 3 条模板行（文化数从 cultures.json 读）。
  const person = raw.dimensionDocs.find((d) => d.kind === 'person').rows;
  const cultures = json('lore/cultures.json').map((c) => c.id);
  for (const c of cultures) assert.equal(Object.values(person).filter((r) => r.culture === c).length, 3, c);
});

test('2 选来历：经 submitProposal 建化身（template 为所选模板行、birthplace 写所选地点 ref、culture 随模板）；日志多一条输入；不推进时钟', async () => {
  const raw = rawWorld();
  const { spawn } = rowsOf(raw);
  const g = await init(express.Router(), { saveRoot: testTempRoot('s3a-spawn-') });
  const a = g.menu(null).affordances[0];
  const names = Object.keys(a.slots);
  const pick = Object.fromEntries(names.map((n) => [n, a.slots[n].length - 1]));
  const before = g.logBook.entries.filter((e) => e.kind === 'command').length;
  const t0 = clockMinute(g.engine, g.state);
  const r = g.act({ act: spawn, slots: pick });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.advancedMinutes, 0);
  assert.equal(clockMinute(g.engine, g.state), t0);
  assert.equal(g.logBook.entries.filter((e) => e.kind === 'command').length, before + 1);
  const avatar = Object.keys(g.state.created).find((id) => g.state.created[id].kind === 'person');
  const rec = g.state.created[avatar];
  const chosen = Object.fromEntries(names.map((n) => [n, a.slots[n][pick[n]]]));
  const { rows } = rowsOf(raw);
  assert.equal(rec.template, chosen[slotOn(rows, spawn, 'person')], 'template 是所选来历候选');
  assert.equal(dim(g.engine, g.state, 'person', avatar, 'birthplace').value, chosen[slotOn(rows, spawn, 'place')]);
  assert.equal(dim(g.engine, g.state, 'person', avatar, 'species').value, chosen[slotOn(rows, spawn, 'species')]);
  assert.equal(dim(g.engine, g.state, 'person', avatar, 'culture').value, raw.dimensionDocs.find((d) => d.kind === 'person').rows[rec.template].culture);
  // 已有化身：再建档被 whenRX 拒；menu(null) 按唯一化身投影，不再出现建档动作。
  assert.equal(g.act({ act: spawn, slots: pick }).code, 'E-ACT-PRECONDITION');
  assert.equal(g.menu(null).affordances.some((x) => x.act === spawn), false);
});

test('3 等待：化身菜单给数值范围（上限取 rules.act.advanceMaxMinutes 该动作类）；提交推进时钟；越界、无化身、未知动作被拒且不动状态；拒收也按请求编号留在日志（输入条目 + 拒绝事件，卷二:545）', async () => {
  const raw = rawWorld();
  const { spawn, pass, rows } = rowsOf(raw);
  const g = await init(express.Router(), { saveRoot: testTempRoot('s3a-wait-') });
  assert.equal(g.act({ act: pass, numbers: { minutes: 1 } }).code, 'E-ACT-PRECONDITION');
  assert.equal(g.act({ act: spawn, slots: { species: 0, origin: 0, place: 0 } }).ok, true);
  const avatar = Object.keys(g.state.created)[0];
  const m = g.menu(avatar);
  assert.deepEqual(m.affordances.map((a) => a.act), [pass]);
  assert.deepEqual([...m.visible], [avatar, ...openPlaces(raw)]);
  const slotName = Object.keys(rows[pass].slots)[0];
  const max = raw.tableDocs.act.rows.find((r) => r.key === 'advanceMaxMinutes').value[rows[pass].class];
  assert.deepEqual({ ...m.affordances[0].numbers[slotName] }, { min: rows[pass].slots[slotName].min, max, unit: rows[pass].slots[slotName].unit });
  const t0 = clockMinute(g.engine, g.state);
  const ok = g.act({ act: pass, actor: avatar, numbers: { [slotName]: 30 } });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.advancedMinutes, 30);
  assert.equal(clockMinute(g.engine, g.state), t0 + 30);
  const created = JSON.stringify(g.state.created);
  for (const [intent, want] of [
    [{ act: pass, actor: avatar, numbers: { [slotName]: 0 } }, 'E-ACT-SLOT'],
    [{ act: pass, actor: avatar, numbers: { [slotName]: max + 1 } }, 'E-ACT-SLOT'],
    [{ act: pass, actor: avatar, numbers: { [slotName]: 1.5 } }, 'E-ACT-SLOT'],
    [{ act: pass, actor: avatar }, 'E-ACT-SLOT'],
    [{ act: pass, actor: avatar, numbers: { [slotName]: 5 }, slots: { [slotName]: 0 } }, 'E-ACT-SLOT'],
    [{ act: `${pass}_not_in_catalog` }, 'E-ACT-UNKNOWN'],
  ]) {
    const r = g.act(intent);
    assert.equal(r.ok, false, JSON.stringify(intent));
    assert.equal(r.code, want, JSON.stringify(intent));
    assert.deepEqual(g.logBook.entries.filter((e) => e.seq === r.seq), [{ seq: r.seq, kind: 'command', intent }, { seq: r.seq, kind: 'event', ok: false, code: want }]);
  }
  assert.equal(clockMinute(g.engine, g.state), t0 + 30);
  assert.equal(JSON.stringify(g.state.created), created);
  assert.throws(() => g.menu('npc_not_an_avatar'), code('E-DISPLAY-SUBJECT'));
});

test('4 候选编号越界被拒；存档读档复演 saveDigest 一致，复演后化身与时钟同原局，可续玩', async () => {
  const { spawn, pass } = rowsOf(rawWorld());
  const dir = testTempRoot('s3a-replay-');
  const g = await init(express.Router(), { saveRoot: dir });
  const a = g.menu(null).affordances[0];
  const over = Object.fromEntries(Object.keys(a.slots).map((n) => [n, a.slots[n].length]));
  assert.equal(g.act({ act: spawn, slots: over }).code, 'E-ACT-SLOT');
  assert.equal(g.act({ act: spawn, slots: { species: 0, origin: 1, place: 0 } }).ok, true);
  const avatar = Object.keys(g.state.created)[0];
  assert.equal(g.act({ act: pass, actor: avatar, numbers: { minutes: 45 } }).ok, true);
  const saved = saveSlot(g);
  const r = replay_apply(loadSlot(saved, { saveRoot: dir }));
  assert.equal(r.saveDigest, saved.saveDigest);
  assert.deepEqual(r.state.created, g.state.created);
  assert.equal(clockMinute(r.engine, r.state), clockMinute(g.engine, g.state));
  assert.equal(r.act({ act: pass, actor: avatar, numbers: { minutes: 10 } }).advancedMinutes, 10);
});

test('5 出身开关：开关改假，受它管的出身不进候选（只改数据，不改代码）', () => {
  const raw = rawWorld();
  const gates = [...new Set(Object.values(raw.vocabDoc.families.origin.entries).map((o) => o.gate).filter((x) => x !== null))];
  assert.ok(gates.length > 0, '前提：数据里有受开关管的出身');
  for (const gate of gates) {
    const r = clone(raw);
    r.tableDocs.playerOrigins.rows.find((x) => x.key === gate).value = false;
    const g = mount(r, 's3a-gate-');
    const { spawn, rows } = rowsOf(r);
    const slot = slotOn(rows, spawn, 'person');
    const got = g.menu(null).affordances[0].slots[slot];
    assert.deepEqual([...got], openTemplates(r), gate);
    assert.ok(got.length < openTemplates(raw).length, gate);
    // 关掉的开关所管的出身一条也不进候选。
    const origins = r.vocabDoc.families.origin.entries;
    const person = r.dimensionDocs.find((d) => d.kind === 'person').rows;
    assert.ok([...got].every((id) => origins[person[id].origin].gate !== gate), gate);
  }
});

test('6 动作表加一行（复制等待行改代号与上限）：不改任何 .mjs，新动作出现在化身菜单并可提交', () => {
  const raw = rawWorld();
  const { spawn, pass, rows } = rowsOf(raw);
  const extra = clone(rows[pass]);
  const slotName = Object.keys(extra.slots)[0];
  extra.slots[slotName].max = 7;
  extra.menu.order += 1;
  const added = `${pass}_short`;
  const r = clone(raw);
  r.actionDocs.push({ [added]: extra });
  const g = mount(r, 's3a-addrow-');
  assert.equal(g.act({ act: spawn, slots: { species: 0, origin: 0, place: 0 } }).ok, true);
  const avatar = Object.keys(g.state.created)[0];
  const aff = g.menu(avatar).affordances;
  assert.deepEqual(aff.map((a) => a.act), [pass, added]);
  assert.equal(aff[1].numbers[slotName].max, 7);
  assert.equal(g.act({ act: added, actor: avatar, numbers: { [slotName]: 7 } }).advancedMinutes, 7);
  assert.equal(g.act({ act: added, actor: avatar, numbers: { [slotName]: 8 } }).code, 'E-ACT-SLOT');
});

test('7 加载即拒：本阶段未实现的字段非空、baseMinutes > 0、未知字段、非 primitive 输出、可达原语无处理函数、键覆盖与开关指向不合', () => {
  const raw = rawWorld();
  const { pass } = rowsOf(raw);
  const withRow = (patch) => { const r = clone(raw); const doc = r.actionDocs.find((d) => d[pass]); patch(doc[pass]); return r; };
  const famOf = (r) => r.actionDocs.find((d) => d[pass])[pass].effects.success[0].family;
  const cases = [
    ['check 非空', withRow((row) => { row.check = { skill: null }; }), 'E-ACT-ROW'],
    ['baseMinutes > 0', withRow((row) => { row.baseMinutes = 5; }), 'E-ACT-ROW'],
    ['未知字段', withRow((row) => { row.extraField = 1; }), 'E-ACT-ROW'],
    ['缺字段', withRow((row) => { delete row.resumable; }), 'E-ACT-ROW'],
    ['非 success 档非空', withRow((row) => { row.effects.failure = row.effects.success; }), 'E-ACT-ROW'],
    ['multi 槽', withRow((row) => { Object.values(row.slots)[0].multi = true; }), 'E-ACT-ROW'],
    ['未知效果族', withRow((row) => { row.effects.success = [{ family: 'eff_not_registered', params: {} }]; }), 'E-EFF-FAMILY-UNKNOWN'],
  ];
  // 输出种类不是 primitive；原语在目录里但没有处理函数（从原语目录里挑一个处理不了的，不写死）。
  const r1 = clone(raw); r1.effectsDoc[famOf(r1)].outputs[0].kind = 'modifier';
  cases.push(['非 primitive 输出', r1, 'E-ACT-ROW']);
  const noHandler = raw.primitivesDoc.primitives.map((p) => p.op).find((op) => !handlesOp(op));
  assert.ok(noHandler, '前提：原语目录里有尚无处理函数的原语');
  const r2 = clone(raw); const fam = r2.effectsDoc[famOf(r2)]; fam.outputs[0].op = noHandler; fam.outputs[0].paramsRX = {};
  cases.push(['可达原语无处理函数', r2, 'E-ACT-ROW']);
  const r3 = clone(raw); const amm = r3.tableDocs.act.rows.find((x) => x.key === 'advanceMaxMinutes'); delete amm.value[Object.keys(amm.value)[0]];
  cases.push(['advanceMaxMinutes 键不全', r3, 'E-DIM-DOMAIN-RANGE']);
  const r4 = clone(raw); Object.values(r4.vocabDoc.families.origin.entries)[0].gate = 'notASwitch';
  cases.push(['开关指向不存在的键', r4, 'E-DIM-DOMAIN-RANGE']);
  for (const [name, r, want] of cases) assert.throws(() => mount(r, 's3a-reject-'), code(want), name);
});

test('8 规则层不写数据代号：rules/act 源码里没有任何动作、效果族、对象筛选、动作类、菜单组、出身代号、模板行 id、组件类或物种 id 的字面量（R9-1.1、A9-1.1）', () => {
  const raw = rawWorld();
  const fams = raw.vocabDoc.families;
  const codes = new Set([
    ...raw.actionDocs.flatMap((d) => Object.keys(d)),
    ...Object.keys(raw.effectsDoc),
    ...['target_filter', 'act_class', 'menu_group', 'origin'].flatMap((f) => Object.keys(fams[f].entries)),
    ...Object.keys(raw.dimensionDocs.find((d) => d.kind === 'person').rows),
    ...Object.keys(fams.component.entries),
    ...Object.keys(raw.dimensionDocs.find((d) => d.kind === 'species').rows),
  ]);
  assert.ok(codes.size > 0);
  const dir = new URL('../../server-plugin/rules/act/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs'))) {
    const text = readFileSync(new URL(f, dir), 'utf8');
    const literals = [...text.matchAll(/(['"`])([A-Za-z0-9_.]+)\1/g)].map((m) => m[2]);
    assert.deepEqual(literals.filter((l) => codes.has(l)), [], f);
  }
});

test('9 拒收进日志且复演一致：被拒意图在复演时同处同样被拒，saveDigest 逐字相同，日志条目同位相等', async () => {
  const { spawn, pass } = rowsOf(rawWorld());
  const dir = testTempRoot('s3a-reject-replay-');
  const g = await init(express.Router(), { saveRoot: dir });
  const r0 = g.act({ act: pass, numbers: { minutes: 5 } });
  assert.equal(r0.code, 'E-ACT-PRECONDITION');
  assert.equal(g.act({ act: spawn, slots: { species: 0, origin: 0, place: 0 } }).ok, true);
  const avatar = Object.keys(g.state.created)[0];
  const r1 = g.act({ act: pass, actor: avatar, numbers: { minutes: 0 } });
  assert.equal(r1.code, 'E-ACT-SLOT');
  assert.equal(g.act({ act: pass, actor: avatar, numbers: { minutes: 20 } }).ok, true);
  const rejected = g.logBook.entries.filter((e) => e.kind === 'event' && e.ok === false).map((e) => [e.seq, e.code]);
  assert.deepEqual(rejected, [[r0.seq, 'E-ACT-PRECONDITION'], [r1.seq, 'E-ACT-SLOT']]);
  const saved = saveSlot(g);
  const r = replay_apply(loadSlot(saved, { saveRoot: dir }));
  assert.equal(r.saveDigest, saved.saveDigest);
  assert.deepEqual(r.logBook.entries, g.logBook.entries);
  assert.deepEqual(r.state.created, g.state.created);
});

test('10 不带 actor 的意图（S1-3b wire 形状）：选来历后再等待成功；menu(null) 按唯一化身投影、visible 含化身；化身不唯一即拒', async () => {
  const raw = rawWorld();
  const { spawn, pass } = rowsOf(raw);
  const g = await init(express.Router(), { saveRoot: testTempRoot('s3a-noactor-') });
  assert.equal(g.act({ act: pass, numbers: { minutes: 5 } }).code, 'E-ACT-PRECONDITION');
  assert.equal(g.act({ act: spawn, slots: { species: 0, origin: 0, place: 0 } }).ok, true);
  const avatar = Object.keys(g.state.created)[0];
  const m = g.menu(null);
  assert.deepEqual(m.affordances.map((a) => a.act), [pass]);
  assert.deepEqual([...m.visible], [avatar, ...openPlaces(raw)]);
  const t0 = clockMinute(g.engine, g.state);
  const r = g.act({ act: pass, numbers: { minutes: 15 } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(clockMinute(g.engine, g.state), t0 + 15);
  // 前提：造出第二个化身（经原语建第二个以带出身的模板行为 template 的个体），缺省行动者不唯一即拒。
  const tpl = g.state.created[avatar].template;
  const place = openPlaces(raw)[0];
  const species = g.state.created[avatar].props.species;
  assert.equal(g.submitProposal({ effects: [{ op: 'create', kind: 'person', template: tpl, facts: { birthplace: place, species } }] }).ok, true);
  assert.equal(g.act({ act: pass, numbers: { minutes: 5 } }).code, 'E-ACT-SLOT');
  assert.throws(() => g.menu(null), code('E-DISPLAY-SUBJECT'));
  assert.equal(g.act({ act: pass, actor: avatar, numbers: { minutes: 5 } }).ok, true);
});

test('11 种族槽（S1-3d）：候选 = classes 含 rules.chargen.playableClass 所指类的物种行；物种行挂上该类即进候选；去掉可扮演类即无候选、不可建档', () => {
  const raw = rawWorld();
  const { rows, spawn } = rowsOf(raw);
  const slot = slotOn(rows, spawn, 'species');
  assert.ok(playableSpecies(raw).length > 0, '前提：数据里有可扮演物种');
  assert.deepEqual([...mount(raw, 's13d-sp-').menu(null).affordances[0].slots[slot]], playableSpecies(raw));
  // 给一条原本不可扮演的物种行挂上可扮演类（只改数据）：它即进候选。
  const cur = raw.tableDocs.chargen.rows.find((r) => r.key === 'playableClass').value;
  const species = raw.dimensionDocs.find((d) => d.kind === 'species').rows;
  const extra = Object.keys(species).sort().find((id) => !playableSpecies(raw).includes(id));
  assert.ok(extra, '前提：物种表里有不可扮演的行');
  const r1 = clone(raw);
  const row1 = r1.dimensionDocs.find((d) => d.kind === 'species').rows[extra];
  row1.classes = [...(Array.isArray(row1.classes) ? row1.classes : []), cur];
  assert.ok(playableSpecies(r1).includes(extra));
  assert.deepEqual([...mount(r1, 's13d-sp2-').menu(null).affordances[0].slots[slot]], playableSpecies(r1));
  // 物种行全部去掉可扮演类：种族槽无候选，必填槽空即建档动作不进菜单，提交即 E-ACT-SLOT，state 不变。
  const r2 = clone(raw);
  for (const row of Object.values(r2.dimensionDocs.find((d) => d.kind === 'species').rows)) if (Array.isArray(row.classes)) row.classes = row.classes.filter((c) => c !== cur);
  assert.deepEqual(playableSpecies(r2), []);
  const g = mount(r2, 's13d-sp3-');
  assert.equal(g.menu(null).affordances.some((a) => a.act === spawn), false);
  const created = JSON.stringify(g.state.created ?? {});
  assert.equal(g.act({ act: spawn, slots: { species: 0, origin: 0, place: 0 } }).code, 'E-ACT-SLOT');
  assert.equal(JSON.stringify(g.state.created ?? {}), created);
});

test('12 缺种族槽或下标越界：E-ACT-SLOT，state 不变', async () => {
  const raw = rawWorld();
  const { spawn } = rowsOf(raw);
  const g = await init(express.Router(), { saveRoot: testTempRoot('s13d-noslot-') });
  const n = g.menu(null).affordances[0].slots.species.length;
  const created = JSON.stringify(g.state.created ?? {});
  for (const slots of [{ origin: 0, place: 0 }, { species: n, origin: 0, place: 0 }, { species: -1, origin: 0, place: 0 }]) {
    assert.equal(g.act({ act: spawn, slots }).code, 'E-ACT-SLOT', JSON.stringify(slots));
    assert.equal(JSON.stringify(g.state.created ?? {}), created);
  }
});
