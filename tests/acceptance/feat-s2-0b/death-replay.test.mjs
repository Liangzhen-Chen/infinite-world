// S2-0b（死亡与玩家入口）黑盒验收，本文件覆盖卡文第 11 条（复演一致）。第 13 条归 S2-0c，本卡不写。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s20b。
// 依据：卷二十七:740（复演）、卷二十七:742（复演逐条比对）。
// 不写死表名、id、数值：时长换算由 world/ontology/dimensions/_units.json 的 day 与 minute 单位算出；心跳步长取 world/rules/tables/host.json 的 heartbeatStepMinutes。
// 存档根用 tests/accept/temp-root.mjs#testTempRoot，删除只用 removeTempRoot。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const SPECIES_ID = Object.keys(SPECIES_DOC.rows).sort()[0];
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
  const before = new Set(Object.keys(env.state.created ?? {}));
  const r = env.submitProposal({ effects: [{ op: 'create', kind: SPECIES_DOC.kind, template: SPECIES_ID, facts: {} }] });
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
  const env = await init({ saveRoot: root });
  const id = createIndividual(env);
  assert.equal(destroy(env, id).ok, true, '前提：destroy 应成功');
  for (const m of segments) {
    const a = env.advance(m);
    assert.equal(a.ok, true, `推进 ${m} 分钟应成功：${JSON.stringify(a)}`);
  }
  return saveSlot(env, 0).saveDigest;
}

// ---------- 用例 ----------

test('11a. 复演一致：建鸡→宰杀→推进 60 分钟→存槽→读档 replay_apply，saveDigest 逐字节相同；terminated、尸体、日志簿里的终止事件逐位相同', async () => {
  const root = newRoot();
  const env = await init({ saveRoot: root });
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

test('11b. 推进一致性：一次推进 2 日，与分两次各 1 日、与按心跳步长分段合计 2 日，saveDigest 相同', async () => {
  const N = 2 * MINUTES_PER_DAY;
  assert.ok(N % STEP === 0, 'heartbeatStepMinutes 应整除 N 日（否则分段不合计 N 日）');
  const whole = await digestAfter(newRoot(), [N]);
  const halves = await digestAfter(newRoot(), [MINUTES_PER_DAY, MINUTES_PER_DAY]);
  const stepped = await digestAfter(newRoot(), Array.from({ length: N / STEP }, () => STEP));
  assert.equal(halves, whole, '分两次各 1 日的 saveDigest 应与一次 2 日相同');
  assert.equal(stepped, whole, '按心跳步长分段推进的 saveDigest 应与一次 2 日相同');
});
