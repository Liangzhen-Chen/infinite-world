// S2-0b（死亡与玩家入口）黑盒验收，本文件覆盖卡文第 11 条（复演一致）。第 13 条归 S2-0c，本卡不写。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s20b。
// 依据：卷二十七:740（复演）、卷二十七:742（复演逐条比对）。
// 不写死表名、id、数值：时长换算由 world/ontology/dimensions/_units.json 的 day 与 minute 单位算出；心跳步长取 world/rules/tables/host.json 的 heartbeatStepMinutes。
// 存档根用 tests/accept/temp-root.mjs#testTempRoot，删除只用 removeTempRoot。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { express } from '../../support/express.mjs';
import { init, saveSlot, loadSlot, replay_apply } from '../../../server-plugin/index.mjs';
import { canonical } from '../../../server-plugin/kernel/storage.mjs';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORLD = join(ROOT, 'world');
const DIM_DIR = join(WORLD, 'ontology/dimensions');
const loadJson = (/** @type {string} */ p) => JSON.parse(readFileSync(p, 'utf8'));
const rowsOf = (/** @type {any} */ doc) => Object.fromEntries(doc.rows.map((/** @type {any} */ r) => [r.key, r.value]));

const DIM_DOCS = readdirSync(DIM_DIR)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .sort()
  .map((f) => loadJson(join(DIM_DIR, f)));
const SPECIES_DOC = DIM_DOCS.find((d) => d.kind === 'species');
const PERSON_DOC = DIM_DOCS.find((d) => d.kind === 'person');
// 人物模板行：person 表里按排序第一条（S1-3d：来历行不再带 species；同 death-entry.test.mjs）。
const PERSON_TEMPLATE_ID = Object.keys(PERSON_DOC.rows).sort()[0];
// 有心智物种行：物种表中 classes 含 comp_sapient 的首行（同 death-entry.test.mjs）。species 经 facts 给出。
const SAPIENT_SPECIES_ID = Object.keys(SPECIES_DOC.rows).find((k) => SPECIES_DOC.rows[k].classes.includes('comp_sapient'));
const UNITS = loadJson(join(DIM_DIR, '_units.json')).units;
const HOST = rowsOf(loadJson(join(WORLD, 'rules/tables/host.json')));

const unitSi = (/** @type {string} */ id) => {
  const u = Object.values(UNITS).find((/** @type {any} */ x) => x.id === id);
  if (!u) throw new Error(`_units.json 应有单位 ${id}`);
  return u.si;
};
const MINUTES_PER_DAY = unitSi('day') / unitSi('minute');
const STEP = HOST.heartbeatStepMinutes;
const VERB_TERM = 'verb_entity_terminated';

const ROOTS = [];
const newRoot = () => {
  const r = testTempRoot('s2b-replay-');
  ROOTS.push(r);
  return r;
};
after(() => {
  for (const r of ROOTS.splice(0)) removeTempRoot(r);
});

function createIndividual(/** @type {any} */ env) {
  assert.ok(PERSON_TEMPLATE_ID, 'person 表应有模板行');
  assert.ok(SAPIENT_SPECIES_ID, '物种表应有 classes 含 comp_sapient 的有心智物种行');
  const before = new Set(Object.keys(env.state.created ?? {}));
  const r = env.submitProposal({ effects: [{ op: 'create', kind: PERSON_DOC.kind, template: PERSON_TEMPLATE_ID, facts: { species: SAPIENT_SPECIES_ID } }] });
  assert.equal(r.ok, true, `create 应成功：${JSON.stringify(r)}`);
  const added = Object.keys(env.state.created ?? {}).filter((id) => !before.has(id));
  assert.equal(added.length, 1, 'create 应恰好新增一个实体');
  return added[0];
}

const destroy = (/** @type {any} */ env, /** @type {string} */ id) => env.submitProposal({ effects: [{ op: 'destroy', entity: id }] });

const verbEvents = (/** @type {any} */ logBook, /** @type {string} */ verb) =>
  logBook.entries.filter((/** @type {any} */ e) => e.kind === 'event' && e.ok === true && e.verb === verb);

/**
 * 建鸡 → 宰杀 → 按给定分段推进，返回 saveSlot 的摘要。
 * @param {any} root 存档根
 * @param {number[]} segments 推进分钟数序列
 */
async function digestAfter(root, segments) {
  const env = await init(express.Router(), { saveRoot: root });
  const id = createIndividual(env);
  assert.equal(destroy(env, id).ok, true, '前提：destroy 应成功');
  for (const m of segments) {
    const a = env.advance(m);
    assert.equal(a.ok, true, `推进 ${m} 分钟应成功：${JSON.stringify(a)}`);
  }
  return saveSlot(env, 0).saveDigest;
}

/**
 * 同 digestAfter 的前提，但返回整个世界（供 11b 分别比 state 与日志簿）。
 * @param {any} root 存档根
 * @param {number[]} segments 推进分钟数序列
 */
async function worldAfter(root, segments) {
  const env = await init(express.Router(), { saveRoot: root });
  const id = createIndividual(env);
  assert.equal(destroy(env, id).ok, true, '前提：destroy 应成功');
  for (const m of segments) {
    const a = env.advance(m);
    assert.equal(a.ok, true, `推进 ${m} 分钟应成功：${JSON.stringify(a)}`);
  }
  return env;
}

// stateJson 口径同 tests/acceptance/feat-s1-3a/origin-act.test.mjs（bigint 显式标注，比整份 world.state）。
const stateJson = (/** @type {any} */ s) => JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));

// 日志簿按首条推进输入切成 prefix（推进之前）与 group（自首条推进起的全部推进相关条目）。
function splitAtAdvance(/** @type {any} */ world) {
  const entries = world.logBook.entries;
  const i = entries.findIndex((/** @type {any} */ e) => e.kind === 'advance');
  assert.ok(i >= 0, '日志簿应含推进输入');
  return { prefix: entries.slice(0, i), group: entries.slice(i) };
}

// 比较用形状：去 seq；推进分钟数（输入的 time 与事件的 advanceMinutes）抹成 '*'，其余字段原样。
function shapeOf(/** @type {any} */ e) {
  const { seq, ...rest } = e;
  if (rest.advanceMinutes !== undefined) rest.advanceMinutes = '*';
  if (rest.proposal) {
    rest.proposal = { effects: rest.proposal.effects.map((/** @type {any} */ f) => (f.op === 'time' ? { op: 'time', minutes: '*' } : f)) };
  }
  return rest;
}

// 推进分钟合计：各推进输入里 time 效果的 minutes 之和。
const movedMinutes = (/** @type {any} */ world) =>
  world.logBook.entries
    .filter((/** @type {any} */ e) => e.kind === 'advance')
    .reduce((/** @type {number} */ s, /** @type {any} */ e) => s + e.proposal.effects.filter((/** @type {any} */ f) => f.op === 'time').reduce((t, f) => t + f.minutes, 0), 0);

// ---------- 用例 ----------

test('11a. 复演一致：建鸡→宰杀→推进 60 分钟→存槽→读档 replay_apply，saveDigest 逐字节相同；terminated、尸体、日志簿里的终止事件逐位相同', async () => {
  const root = newRoot();
  const env = await init(express.Router(), { saveRoot: root });
  const id = createIndividual(env);
  assert.equal(destroy(env, id).ok, true, '前提：destroy 应成功');
  const adv = env.advance(60);
  assert.equal(adv.ok, true, `推进 60 分钟应成功：${JSON.stringify(adv)}`);

  const saved = saveSlot(env, 0);
  const loaded = loadSlot(saved, { saveRoot: root });
  const replayed = replay_apply(loaded);

  assert.equal(replayed.saveDigest, saved.saveDigest, 'saveDigest 应逐字节相同');
  assert.ok(env.state.terminated && Object.hasOwn(env.state.terminated, id), '前提：被杀个体有终止标记');
  assert.equal(canonical(replayed.state.terminated), canonical(env.state.terminated), 'terminated 应逐位相同');
  assert.equal(canonical(replayed.state.created), canonical(env.state.created), '实体（含尸体）应逐位相同');
  assert.equal(verbEvents(replayed.logBook, VERB_TERM).length, 1, '终止事件恰一条');
  assert.equal(
    canonical(verbEvents(replayed.logBook, VERB_TERM)),
    canonical(verbEvents(env.logBook, VERB_TERM)),
    '日志簿里的终止事件应逐位相同',
  );
});

test('11b. 推进可分段：一次推进 2 日与分两次各 1 日、按心跳步长分段，世界状态逐位相同；日志簿多出的恰为各推进输入+事件', async () => {
  const N = 2 * MINUTES_PER_DAY;
  assert.ok(N % STEP === 0, 'heartbeatStepMinutes 应整除 N 日（否则分段不合计 N 日）');
  // 裁定（主会话 2026-11-27）：saveDigest 含日志簿，分段推进是多条输入、日志本就不同；本例拆成两条断言。
  const whole = await worldAfter(newRoot(), [N]);
  const halves = await worldAfter(newRoot(), [MINUTES_PER_DAY, MINUTES_PER_DAY]);
  const stepped = await worldAfter(newRoot(), Array.from({ length: N / STEP }, () => STEP));
  // a) 去掉日志簿后的世界状态逐位相同（stateJson 口径：整份 world.state，同 S1-3a 测试）。
  assert.equal(stateJson(halves.state), stateJson(whole.state), 'a) 分两次各 1 日的世界状态应与一次 2 日逐位相同');
  assert.equal(stateJson(stepped.state), stateJson(whole.state), 'a) 按心跳步长分段的世界状态应与一次 2 日逐位相同');
  // b) 分段路的日志簿比一次路恰好多出 k 组「推进输入 1 条 + 推进事件 1 条」，除 seq 与推进分钟数外其余条目逐位相同（卷二:545 输入进日志）。
  const wholeSplit = splitAtAdvance(whole);
  assert.deepEqual(wholeSplit.group.map((e) => e.kind), ['advance', 'event'], '一次路的推进部分应恰为一组（输入 + 事件）');
  for (const { name, w, k } of [{ name: '分两次', w: halves, k: 2 }, { name: '按心跳步长', w: stepped, k: N / STEP }]) {
    const sp = splitAtAdvance(w);
    assert.deepEqual(sp.group.map((e) => e.kind), Array.from({ length: k }, () => ['advance', 'event']).flat(), `${name}：推进部分应为 ${k} 组输入+事件`);
    assert.equal(
      canonical(sp.group.map(shapeOf)),
      canonical(Array(k).fill(wholeSplit.group).flat().map(shapeOf)),
      `${name}：除 seq 与分钟数外，推进条目应与一次路逐位相同`,
    );
    assert.equal(canonical(sp.prefix.map(shapeOf)), canonical(wholeSplit.prefix.map(shapeOf)), `${name}：推进之前的日志条目应逐位相同`);
    assert.equal(movedMinutes(w), movedMinutes(whole), `${name}：推进分钟合计应与一次路相同`);
  }
});
