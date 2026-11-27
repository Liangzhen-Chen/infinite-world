// S2-0b（死亡与玩家入口）黑盒验收，本文件覆盖卡文第 1、2、3、4、6、9 条。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s20b。
// 依据：卷二:552（终止协议入口）、卷二:557（终止事件）、卷二十五:579（屠宰与死亡事件，死因取 verb_death_event）、卷四:874（以个体为对象的终止只经 death.mjs）、
// 卷四:882（D-4 尸体质量与材料公式，调 carcassOf）、卷四:915（幂等）、卷四:916（身死与终止同事务）、卷四:917（每次终止一件遗骸）、卷二:559 ③（不可终止种类整笔拒）。
// 玩家入口：init 返回的 submitProposal，个体由 create 提案建、由 destroy 提案杀；不 mock，不改 world/。
// 不写死表名、id、数值：物种表、物品表、死亡规则表（world/rules/tables/death.json）、单位表从 world/ 读；只有卡文点名的死因 verb_death_event 与事件名 verb_entity_terminated 以常量写出（卷文原句）。
// 个体与所有期望值都经真实动作得到；die 与 terminate 只在幂等用例里按其签名直接调用（rules/body/death.mjs 尚未建时该用例红）。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { init } from '../../../server-plugin/index.mjs';
import { runTransaction } from '../../../server-plugin/kernel/transaction.mjs';
import { canonical } from '../../../server-plugin/kernel/storage.mjs';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORLD = join(ROOT, 'world');
const DIM_DIR = join(WORLD, 'ontology/dimensions');
const loadJson = (/** @type {string} */ p) => JSON.parse(readFileSync(p, 'utf8'));
const rowsOf = (/** @type {any} */ doc) => Object.fromEntries(doc.rows.map((/** @type {any} */ r) => [r.key, r.value]));

// 实体表：维度表目录里除下划线开头的元表外都是实体表（与 index.mjs 同口径）。按表的 kind 字段取表。
const DIM_DOCS = readdirSync(DIM_DIR)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .sort()
  .map((f) => loadJson(join(DIM_DIR, f)));
const SPECIES_DOC = DIM_DOCS.find((d) => d.kind === 'species');
const ITEM_DOC = DIM_DOCS.find((d) => d.kind === 'item');
const PERSON_DOC = DIM_DOCS.find((d) => d.kind === 'person');
// 人物模板行：person 表里按排序第一条 species 指向物种表登记行的行（来历模板行，S1-3c 草案 §1）。个体由 create 提案 kind=person 建，species 由 instantiatePerson 补齐。
const PERSON_TEMPLATE_ID = Object.keys(PERSON_DOC.rows)
  .sort()
  .find((k) => Object.hasOwn(SPECIES_DOC.rows, PERSON_DOC.rows[k].species));
const ITEM_ID = Object.keys(ITEM_DOC.rows).sort()[0];
const DEATH = rowsOf(loadJson(join(WORLD, 'rules/tables/death.json')));
const UNITS = loadJson(join(WORLD, 'ontology/dimensions/_units.json')).units;

const CAUSE_ROW = 'destroyCause'; // 卷二十五:579；死因取数据行（主会话裁定 R4）
const CAUSE = 'verb_death_event';
const VERB_TERM = 'verb_entity_terminated';
const CORPSE_CLASS_ROW = 'corpseClass'; // 卷四 §2.5 :318（comp_corpse）
const MATERIAL_GROUP_ROW = 'corpseMaterialGroup'; // 写码裁定：尸体材料份额全部归此组

const ROOTS = [];
const newRoot = () => {
  const r = testTempRoot('s2b-entry-');
  ROOTS.push(r);
  return r;
};
after(() => {
  for (const r of ROOTS.splice(0)) removeTempRoot(r);
});

async function bootWorld() {
  return init({ saveRoot: newRoot() });
}

// 经真实 create 提案建一个人物个体（kind=person，模板行取 PERSON_TEMPLATE_ID），返回新实体 id。
function createIndividual(env) {
  assert.ok(PERSON_TEMPLATE_ID, 'person 表应有 species 指向物种表行的模板行');
  const before = new Set(Object.keys(env.state.created ?? {}));
  const r = env.submitProposal({ effects: [{ op: 'create', kind: PERSON_DOC.kind, template: PERSON_TEMPLATE_ID, facts: {} }] });
  assert.equal(r.ok, true, `create 应成功：${JSON.stringify(r)}`);
  const added = Object.keys(env.state.created ?? {}).filter((id) => !before.has(id));
  assert.equal(added.length, 1, 'create 应恰好新增一个实体');
  return added[0];
}

// 经真实 destroy 提案杀一个实体。
const destroy = (/** @type {any} */ env, /** @type {string} */ id) => env.submitProposal({ effects: [{ op: 'destroy', entity: id }] });

// 日志簿里带 verb 的事件条目（提交成功的事件，见 kernel/transaction.mjs 事件追加）。
const verbEvents = (/** @type {any} */ logBook, /** @type {string} */ verb) =>
  logBook.entries.filter((/** @type {any} */ e) => e.kind === 'event' && e.ok === true && e.verb === verb);

// 物品实例的组件类：props.classes 可为列表或单值（写码以 item 新维度 classes 登记，值取数据 corpseClass）。
const classesOf = (/** @type {any} */ inst) => {
  const c = inst.props.classes;
  return Array.isArray(c) ? c : c === undefined || c === null ? [] : [c];
};

// 尸体材料：props.material 为 {group, materialRef, share} 列表（item.json 的 material 维度）→ {materialRef: share}。
const materialMap = (/** @type {any} */ list) => Object.fromEntries(list.map((/** @type {any} */ m) => [m.materialRef, m.share]));

// ---------- 用例 ----------

test('1. 玩家入口零 mock：create 建人物个体，destroy 杀掉；terminated 为真、reason 为 verb_death_event；日志簿恰多一条 verb_entity_terminated，mode 为 wreck，successorId 非空', async () => {
  assert.equal(DEATH[CAUSE_ROW], CAUSE, `death.json 的 ${CAUSE_ROW} 行应为 ${CAUSE}（卷二十五:579）`);
  const env = await bootWorld();
  const id = createIndividual(env);
  const { terminated } = await import('../../../server-plugin/rules/body/action-capacity.mjs');
  assert.equal(terminated(env.engine, env.state, id).ok, false, '前提：活着时不算终止');

  const before = verbEvents(env.logBook, VERB_TERM).length;
  const r = destroy(env, id);
  assert.equal(r.ok, true, `destroy 应成功：${JSON.stringify(r)}`);

  const t = terminated(env.engine, env.state, id);
  assert.equal(t.ok, true, 'terminated 应为真');
  assert.equal(t.reason, CAUSE, `reason 应为 ${CAUSE}，实为 ${t.reason}`);

  const evs = verbEvents(env.logBook, VERB_TERM);
  assert.equal(evs.length - before, 1, '日志簿应恰好多一条 verb_entity_terminated');
  const ev = evs[evs.length - 1];
  assert.equal(ev.payload.id, id);
  assert.equal(ev.payload.cause, CAUSE);
  assert.equal(ev.payload.mode, 'wreck', `mode 应为 wreck，实为 ${ev.payload.mode}`);
  assert.ok(typeof ev.payload.successorId === 'string' && ev.payload.successorId.length > 0, 'successorId 应非空');
});

test('2. 尸体：successorId 所指物品带尸体组件类，ofSpecies/ofPerson/diedMinute 正确；massKg 与 material 同死前 carcassOf({subjectId}) 逐位相同；材料份额和为 1；尸体质量不超过死时 massKg', async () => {
  const env = await bootWorld();
  const id = createIndividual(env);
  const minute = env.state.clock.minute;
  // 死前那一刻的尸体与体重（卷四:882 D-4、:874 carcassOf 个体路径）。
  const carcassBefore = env.views.carcassOf({ subjectId: id });
  const bodyMass = env.views.bodyView(id).massKg.value;
  assert.ok(carcassBefore, '死前应有尸体读数');

  const r = destroy(env, id);
  assert.equal(r.ok, true, `destroy 应成功：${JSON.stringify(r)}`);
  const successorId = verbEvents(env.logBook, VERB_TERM).at(-1).payload.successorId;
  const corpse = env.state.created[successorId];
  assert.ok(corpse, 'successorId 应为已建实体');
  assert.equal(corpse.kind, ITEM_DOC.kind, '尸体应是物品实例');

  const p = corpse.props;
  assert.ok(classesOf(corpse).includes(DEATH[CORPSE_CLASS_ROW]), `尸体应带 ${DEATH[CORPSE_CLASS_ROW]} 组件类`);
  const { speciesOf } = await import('../../../server-plugin/rules/body/person.mjs');
  const speciesId = speciesOf(env.engine, env.state, id);
  assert.ok(Object.hasOwn(SPECIES_DOC.rows, speciesId), `个体 species 应为物种表登记行，实为 ${speciesId}`);
  assert.equal(p.ofSpecies, speciesId, 'ofSpecies 应等于该个体的 species');
  assert.equal(p.ofPerson, id, 'ofPerson 应指向该个体');
  assert.equal(p.diedMinute, minute, 'diedMinute 应等于死亡当前分钟');

  assert.equal(p.massKg, carcassBefore.massKg, '尸体 massKg 应与死前 carcassOf 逐位相同');
  assert.deepStrictEqual(materialMap(p.material), carcassBefore.material, '尸体 material 应与死前 carcassOf 逐位相同');

  const shares = p.material.map((/** @type {any} */ m) => m.share);
  const sum = shares.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-4, `材料份额之和应为 1，实为 ${sum}`);
  assert.ok(p.material.every((/** @type {any} */ m) => m.group === DEATH[MATERIAL_GROUP_ROW]), `尸体材料份额应全部归 ${DEATH[MATERIAL_GROUP_ROW]} 组`);
  assert.ok(p.massKg <= bodyMass, `尸体质量 ${p.massKg} 不应超过死时 massKg ${bodyMass}`);
});

test('3. 只有一份遗骸：每次终止恰好对应一件 ofPerson 指向该主体的物品，且就是 successorId 所指', async () => {
  const env = await bootWorld();
  const id = createIndividual(env);
  const r = destroy(env, id);
  assert.equal(r.ok, true, `destroy 应成功：${JSON.stringify(r)}`);
  const successorId = verbEvents(env.logBook, VERB_TERM).at(-1).payload.successorId;

  const owned = Object.entries(env.state.created).filter(([, v]) => Object(Object(v).props).ofPerson === id);
  assert.equal(owned.length, 1, `ofPerson 指向该主体的物品应恰一件，实为 ${owned.length}`);
  assert.equal(owned[0][0], successorId, '这一件应就是 successorId 所指');
});

test('4. 幂等：对已终止主体再调 destroy 提案，如实被拒（有拒绝码，不报成功）；再直接调 die，状态不变、不发事件', async () => {
  const env = await bootWorld();
  const id = createIndividual(env);
  assert.equal(destroy(env, id).ok, true, '前提：首次 destroy 应成功');

  const before = canonical(env.state);
  const evBefore = verbEvents(env.logBook, VERB_TERM).length;

  const again = destroy(env, id);
  assert.equal(again.ok, false, '已终止主体再 destroy 不得报成功');
  assert.ok(typeof again.code === 'string' && again.code.length > 0, `应返回拒绝码，实为 ${JSON.stringify(again)}`);
  assert.equal(canonical(env.state), before, '被拒后 state 逐位不变');
  assert.equal(verbEvents(env.logBook, VERB_TERM).length, evBefore, '不得发事件');

  // die 模块尚未建（本卡实现才建），动态按路径加载，使静态类型检查在出题阶段不因缺文件报错；缺失时本用例红。
  const { die } = await import(pathToFileURL(join(ROOT, 'server-plugin/rules/body/death.mjs')).href);
  runTransaction(env.engine, env.state, (tx) => die(env.engine, env.state, id, { cause: CAUSE, source: null }, tx));
  assert.equal(canonical(env.state), before, '对已终止主体再调 die：状态不变');
  assert.equal(verbEvents(env.logBook, VERB_TERM).length, evBefore, '对已终止主体再调 die：不发事件（卷四:915）');
});

test('6. 同事务：终止后不存在带终端族状态实例却无终止标记的实体，也不存在有终止标记却还留状态实例的实体（卷四:916）', async () => {
  const env = await bootWorld();
  const id = createIndividual(env);
  const { statusView } = await import('../../../server-plugin/rules/status/status.mjs');
  assert.equal(destroy(env, id).ok, true, 'destroy 应成功');
  for (const eid of Object.keys(env.state.created)) {
    const marked = env.state.terminated !== null && env.state.terminated !== undefined && Object.hasOwn(env.state.terminated, eid);
    const hasInstance = statusView(env.engine, env.state, eid).length > 0;
    assert.ok(!(hasInstance && !marked), `${eid}：带状态实例却无终止标记`);
    assert.ok(!(marked && hasInstance), `${eid}：有终止标记却还留状态实例`);
  }
  assert.ok(env.state.terminated && Object.hasOwn(env.state.terminated, id), '被杀个体应有终止标记');
});

test('9. 不可终止种类：对 item 实体发 destroy 被整笔拒收，state 逐位不变、不发终止事件', async () => {
  const env = await bootWorld();
  const before0 = new Set(Object.keys(env.state.created ?? {}));
  const r0 = env.submitProposal({ effects: [{ op: 'create', kind: ITEM_DOC.kind, template: ITEM_ID, facts: {} }] });
  assert.equal(r0.ok, true, `create 物品应成功：${JSON.stringify(r0)}`);
  const added = Object.keys(env.state.created ?? {}).filter((k) => !before0.has(k));
  assert.equal(added.length, 1, 'create 应恰好新增一件物品');
  const itemId = added[0];

  const before = canonical(env.state);
  const evBefore = verbEvents(env.logBook, VERB_TERM).length;
  const r = destroy(env, itemId);
  assert.equal(r.ok, false, 'item 的 destroy 应被拒收');
  // 不可终止种类的拒码与终止协议一致（卷二:559 ③ 类别行无 termination 即 E-TERM-RESIDUE）；不接受因原语未接线而拒（E-EFF-PRIMITIVE）。
  assert.equal(r.code, 'E-TERM-RESIDUE', `拒收码应为 E-TERM-RESIDUE，实为 ${r.code}`);
  assert.equal(canonical(env.state), before, '整笔拒收：state 逐位不变');
  assert.equal(verbEvents(env.logBook, VERB_TERM).length, evBefore, '不得发终止事件');
});
