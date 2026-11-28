// S2-0b 单测：死亡与玩家入口（卷四 §4.8 D-1–D-4、卷九 :641 destroy、卷四 §4.4 L-2 个体质量；S2-0 接口草案 §6 中 S2-0b 那组）。写码方自补，不作验收依据。
// 期望值按卷文公式从世界数据现算（成长曲线、物种成熟年龄、单位表、rules.death），不抄仓库计数。
// 新开一局的世界没有人物，人物表也没有实体行可作 create 模板：测试副本给人物表加一条只写 species 的模板行，再经真实 create 提案建个体
// （坏数据、额外登记一律改测试副本，不改 world/）。存档目录用 testTempRoot，结束时 removeTempRoot。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testTempRoot, removeTempRoot } from '../accept/temp-root.mjs';
import { mountKernel } from '../../server-plugin/rules/load/mount.mjs';
import { mergeOwners, shardDirOf } from '../../server-plugin/rules/load/registry-shards.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';
import { readSlot } from '../../server-plugin/kernel/load/save.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { canonical, readPath } from '../../server-plugin/kernel/storage.mjs';
import { clockMinute } from '../../server-plugin/kernel/scheduler.mjs';
import { terminated } from '../../server-plugin/rules/body/action-capacity.mjs';
import { die } from '../../server-plugin/rules/body/death.mjs';
import { ruleValue, unitSi } from '../../server-plugin/rules/load/registry.mjs';

const ONT = new URL('../../world/ontology/', import.meta.url);
const json = (f) => JSON.parse(readFileSync(new URL(f, ONT), 'utf8'));
const dirs = [];
after(() => { for (const d of dirs) removeTempRoot(d); });

/**
 * state-owners 声明表 = 主文件与 state-owners.d/ 分片的合并（S2-TP1 主会话授权改夹具：开局一步写持有边与账本后须带分片登记）；
 * 合并只调生产入口 rules/load/registry-shards.mjs 的 shardDirOf、mergeOwners，测试只读文件。
 */
function ownersOf(o, json) {
  const main = 'world/ontology/state-owners.json';
  const dir = new URL(`../../${shardDirOf(main)}/`, o);
  const names = existsSync(dir) ? readdirSync(dir).sort() : [];
  const shards = names.map((n) => ({ file: `${shardDirOf(main)}/${n}`, doc: JSON.parse(readFileSync(new URL(n, dir), 'utf8')) }));
  // 合并结果冻结；测试副本要可改，取一份深拷贝（同 s2-p-position.test.mjs 的 clone(owners())）。
  return JSON.parse(JSON.stringify(mergeOwners({ file: main, doc: json('state-owners.json') }, shards).doc));
}

/** 世界数据原文（与 index.mjs#readWorld 同形）。 */
function rawWorld() {
  const dir = new URL('dimensions/', ONT);
  const registryRows = json('../rules/registry.json').rows;
  return {
    dimensionDocs: readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort().map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'))),
    namedStructsDoc: json('named-structs.json'),
    owners: ownersOf(ONT, json),
    registryRows,
    tableDocs: Object.fromEntries(registryRows.map((r) => [r.code, json(`../rules/${r.file}`)])),
    digestExclude: json('../rules/tables/digest-exclude.json').paths,
    primitivesDoc: json('primitives.json'),
    vocabDoc: json('dimensions/_vocab.json'),
    unitsDoc: json('dimensions/_units.json'),
    // 采样表（S1-3c：create 建人时按物种分布补齐维度，与 index.mjs#readWorld 同形）。
    distributionsDoc: json('dimensions/_distributions.json'),
  };
}
const docOf = (raw, kind) => raw.dimensionDocs.find((d) => d.kind === kind);
const SPECIES = docOf(rawWorld(), 'species').rows;
const TEMPLATE = (sp) => `creature_tpl_${sp.slice(sp.indexOf('_') + 1)}`;

/** 测试副本：人物表每个物种一条只写 species 的模板行。 */
function worldWithTemplates() {
  const raw = rawWorld();
  const person = docOf(raw, 'person');
  person.rows = Object.fromEntries(Object.keys(SPECIES).map((sp) => [TEMPLATE(sp), { species: sp }]));
  return raw;
}
function mount(raw, resume) {
  const dir = testTempRoot('s2-0b');
  dirs.push(dir);
  return mountKernel(raw, { digestCap: createDigestCap(), saveRoot: pathToFileURL(join(dir, '/')), sources: [{ path: 'x.mjs', text: '' }], modifierSources: Object.freeze([]) }, resume);
}

// 世界数据现算的量：每年分钟数（单位表 year 的 si 取 rules.astro.yearDays × day 的 si，÷ minute 的 si）、成长曲线、rules.death。
const units = json('dimensions/_units.json').units;
const si = (id) => units.find((u) => u.id === id);
const astro = json('../rules/tables/astro.json').rows.find((r) => r.key === 'yearDays').value;
const MINUTES_PER_YEAR = (astro.num / astro.den) * si('day').si / si('minute').si;
const CURVE = json('../rules/tables/life.json').rows.find((r) => r.key === 'growthCurve').value;
const DEATH = Object.fromEntries(json('../rules/tables/death.json').rows.map((r) => [r.key, r.value]));
// 按人物表类别行的 termination.mode 挑物种（不点名）：挂 wreck 那一行的物种（无心智生灵）与挂 inherit 那一行的物种（有心智者）。
const PERSON_CLASSES = docOf(rawWorld(), 'person').classes;
const speciesWithMode = (mode) => Object.keys(SPECIES).find((sp) => SPECIES[sp].classes.some((c) => Object(PERSON_CLASSES[c]).termination?.mode === mode));
const CHICKEN = speciesWithMode('wreck');
const MIND = speciesWithMode('inherit');

/** 经真实 create 提案建一个个体；返回其 id。 */
function born(w, species, adultMassKg, ageMinutes) {
  const now = clockMinute(w.engine, w.state);
  const r = w.submitProposal({ effects: [{ op: 'create', kind: 'person', template: TEMPLATE(species), facts: { adultMassKg, birthMinute: now - ageMinutes } }] });
  assert.equal(r.ok, true, `create rejected: ${r.code}`);
  return Object.keys(w.state.created).filter((id) => w.state.created[id].template === TEMPLATE(species)).pop();
}
const events = (w, verb) => w.logBook.entries.filter((e) => e.verb === verb);
const corpsesOf = (w, id) => Object.keys(w.state.created).filter((k) => Object(w.state.created[k].props).ofPerson === id);

test('个体质量（卷四 L-2）：成熟及以后等于 adultMassKg，出生当刻等于 adultMassKg × 曲线首点，中间按曲线插值', () => {
  const w = mount(worldWithTemplates());
  const M = SPECIES[CHICKEN].maturityYears;
  const adult = 1.6;
  const grown = born(w, CHICKEN, adult, Math.ceil(M * MINUTES_PER_YEAR) + 1);
  assert.equal(w.views.bodyView(grown).massKg.value, adult);
  const chick = born(w, CHICKEN, adult, 0);
  assert.equal(w.views.bodyView(chick).massKg.value, adult * CURVE[0][1]);
  const mid = CURVE[Math.floor(CURVE.length / 2)];
  const young = born(w, CHICKEN, adult, Math.round(mid[0] * M * MINUTES_PER_YEAR));
  assert.ok(Math.abs(w.views.bodyView(young).massKg.value - adult * mid[1]) < 1e-3);
});

test('玩家入口零 mock：destroy 提案杀死一只家鸡——谓词为真、恰一条终止事件、残骸即尸体且与死前 carcassOf 逐位相同', () => {
  const w = mount(worldWithTemplates());
  const id = born(w, CHICKEN, 1.6, Math.ceil(SPECIES[CHICKEN].maturityYears * MINUTES_PER_YEAR));
  const expected = w.views.carcassOf({ subjectId: id });
  const minute = clockMinute(w.engine, w.state);
  const massAtDeath = w.views.bodyView(id).massKg.value;
  const before = events(w, 'verb_entity_terminated').length;
  const r = w.submitProposal({ effects: [{ op: 'destroy', entity: id }] });
  assert.equal(r.ok, true, `destroy rejected: ${r.code}`);
  assert.deepEqual(terminated(w.engine, w.state, id), { ok: true, reason: DEATH.destroyCause });
  const evs = events(w, 'verb_entity_terminated');
  assert.equal(evs.length, before + 1);
  const { payload } = evs[evs.length - 1];
  assert.equal(payload.mode, 'wreck');
  assert.equal(payload.cause, DEATH.destroyCause);
  assert.equal(payload.source, null);
  const corpse = w.state.created[payload.successorId].props;
  assert.deepEqual(corpse.classes, [DEATH.corpseClass]);
  assert.equal(corpse.ofSpecies, CHICKEN);
  assert.equal(corpse.ofPerson, id);
  assert.equal(corpse.diedMinute, minute);
  assert.equal(corpse.massKg, expected.massKg);
  assert.deepEqual(Object.fromEntries(corpse.material.map((m) => [m.materialRef, m.share])), { ...expected.material });
  assert.ok(corpse.material.every((m) => m.group === DEATH.corpseMaterialGroup));
  assert.ok(Math.abs(corpse.material.reduce((a, m) => a + m.share, 0) - 1) < 1e-9);
  assert.ok(corpse.massKg <= massAtDeath);
  assert.deepEqual(corpsesOf(w, id), [payload.successorId]);
  assert.equal(w.state.statuses?.[id], undefined);
});

test('有心智者的类别行（mode inherit）：successorRX 为空退为 wreck，同样留下恰一具尸体', () => {
  const w = mount(worldWithTemplates());
  const id = born(w, MIND, 60, Math.ceil(SPECIES[MIND].maturityYears * MINUTES_PER_YEAR));
  const r = w.submitProposal({ effects: [{ op: 'destroy', entity: id }] });
  assert.equal(r.ok, true, `destroy rejected: ${r.code}`);
  const { payload } = events(w, 'verb_entity_terminated').pop();
  assert.equal(payload.mode, 'wreck');
  assert.deepEqual(corpsesOf(w, id), [payload.successorId]);
});

test('幂等与拒写：再 destroy 如实拒（E-TERM-RESIDUE），die 无操作；终止后写其属性被拒，state 逐位不变、不多发事件', () => {
  const w = mount(worldWithTemplates());
  const id = born(w, CHICKEN, 1.6, 0);
  assert.equal(w.submitProposal({ effects: [{ op: 'destroy', entity: id }] }).ok, true);
  const snap = canonical(w.state);
  const n = events(w, 'verb_entity_terminated').length;
  assert.deepEqual(w.submitProposal({ effects: [{ op: 'destroy', entity: id }] }).code, 'E-TERM-RESIDUE');
  const t = runTransaction(w.engine, w.state, (tx) => die(w.engine, w.state, id, { cause: DEATH.destroyCause, source: null }, tx));
  assert.deepEqual([t.ok, t.events.length], [true, 0]);
  const fact = w.submitProposal({ effects: [{ op: 'fact.set', entity: id, field: 'adultMassKg', value: 2 }] });
  assert.equal(fact.code, 'E-TERM-RESIDUE');
  assert.equal(canonical(w.state), snap);
  assert.equal(events(w, 'verb_entity_terminated').length, n);
});

test('不可终止种类与未登记发起方：对尸体物品 destroy 整笔拒（E-TERM-RESIDUE）；对组织（可终止、无发起方）拒 E-ACT-WRITER-NOT-READY', () => {
  const raw = worldWithTemplates();
  const w = mount(raw);
  const id = born(w, CHICKEN, 1.6, 0);
  w.submitProposal({ effects: [{ op: 'destroy', entity: id }] });
  const corpse = corpsesOf(w, id)[0];
  const snap = canonical(w.state);
  assert.equal(w.submitProposal({ effects: [{ op: 'destroy', entity: corpse }] }).code, 'E-TERM-RESIDUE');
  assert.equal(canonical(w.state), snap);
  assert.equal(readPath(w.state, w.engine.P.terminated(corpse)), undefined);
  const orgTpl = Object.keys(docOf(raw, 'org').rows).sort()[0];
  assert.equal(w.submitProposal({ effects: [{ op: 'create', kind: 'org', template: orgTpl, facts: {} }] }).ok, true);
  const org = Object.keys(w.state.created).filter((k) => w.state.created[k].template === orgTpl).pop();
  const snapOrg = canonical(w.state);
  assert.equal(w.submitProposal({ effects: [{ op: 'destroy', entity: org }] }).code, 'E-ACT-WRITER-NOT-READY');
  assert.equal(canonical(w.state), snapOrg);
});

test('复演一致：建鸡 → 宰杀 → 推进 60 分钟后存槽，读档复演 saveDigest 与终止标记、尸体、事件逐位相同', () => {
  const w = mount(worldWithTemplates());
  const id = born(w, CHICKEN, 1.6, 0);
  w.submitProposal({ effects: [{ op: 'destroy', entity: id }] });
  w.advance(60);
  const manifest = w.save(0);
  const loaded = readSlot(w.engine, manifest.slot);
  const r = mount(loaded.docData, loaded);
  assert.equal(typeof manifest.saveDigest, 'string');
  assert.equal(r.saveDigest, manifest.saveDigest);
  assert.equal(canonical(r.state.terminated), canonical(w.state.terminated));
  assert.equal(canonical(r.state.created), canonical(w.state.created));
  assert.equal(canonical(events(r, 'verb_entity_terminated')), canonical(events(w, 'verb_entity_terminated')));
});

test('rules.death 新键按登记声明核：destroyCause 是 verb 族条目、corpseMaterialGroup 是 matgroup 族条目', () => {
  const raw = rawWorld();
  assert.equal(ruleValue(raw, 'death', 'destroyCause'), DEATH.destroyCause);
  raw.tableDocs.death.rows.find((r) => r.key === 'corpseMaterialGroup').value = DEATH.destroyCause;
  assert.throws(() => ruleValue(raw, 'death', 'corpseMaterialGroup'), (e) => Object(e).code === 'E-DIM-DOMAIN-RANGE');
});

test('单位 si 公共入口 unitSi：直写 si 的单位与 siFromRule 的单位都与单位表手算一致（有理数逐位）；缺行即 E-DIM-UNIT-UNKNOWN', () => {
  const raw = rawWorld();
  mount(raw); // 装入定点常数
  const direct = units.find((u) => u.si !== undefined);
  const [dn, dd] = unitSi(raw, direct.id);
  assert.equal(dn * 1n, dd * BigInt(direct.si));
  const derived = units.find((u) => u.siFromRule !== undefined && u.siFromRule.invert !== true);
  const [, table, key] = /^rules\.([^.]+)\.([^.]+)$/.exec(derived.siFromRule.key);
  const v = json(`../rules/${raw.registryRows.find((r) => r.code === table).file}`).rows.find((r) => r.key === key).value;
  const base = si(derived.siFromRule.unit).si;
  const [yn, yd] = unitSi(raw, derived.id);
  // year 的 si = (num ÷ den) × 所指单位的 si：交叉相乘比对，不经浮点。
  assert.equal(yn * BigInt(v.den), yd * BigInt(v.num) * BigInt(base));
  assert.throws(() => unitSi(raw, 'no_such_unit'), (e) => Object(e).code === 'E-DIM-UNIT-UNKNOWN');
});
