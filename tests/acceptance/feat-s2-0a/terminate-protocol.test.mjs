// S2-0a（终止协议骨架）黑盒验收，本文件覆盖卡文第 5、6、7a 条及 person 读不到类别行的整笔拒。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s20a。
// 依据：卷二:554（标记写入后对该实体的写入一律拒写）、卷二:558（不变量 E-TERM-RESIDUE）、卷二:562（去留表）、卷二:559 ③（类别行无 termination 抛 E-TERM-RESIDUE）、卷四:916（身死与终止同事务）。
// 本子卡还没有玩家入口（destroy 与 die 归 S2-0b），所以用例从 init 得到的 engine 与 state 出发，在一笔写入事务里直接调协议原语 terminate（签名见卷二:552 与勘误 1126s20，末尾为 tx）。
// 主会话裁定（11-26）：能终止的正例用 org 表实体（类别行带 termination）；person/家鸡读不到 termination，整笔拒、状态不变（归 S2-0b 补 species 的 class_person_*）。
// 不写死表名、id、数值：表从 world/ 读取；org 实体取类别行带 termination 的第一个 org 行（经 extends 找到类别）；物种取排序后第一个；死因行取卡文第 1 条的 verb_death_event；状态行取 rules.death.terminalStatus。
// 本文件只用 init 装配的真实世界，不改数据、不 mock；加载期夹具（第 7b、7c、7d、8、10 条）在 terminate-records.test.mjs。

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { express } from '../../support/express.mjs';
import { init } from '../../../server-plugin/index.mjs';
import { runTransaction } from '../../../server-plugin/kernel/transaction.mjs';
import { canonical } from '../../../server-plugin/kernel/storage.mjs';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORLD = join(ROOT, 'world');
const DIM_DIR = join(WORLD, 'ontology/dimensions');
const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// 实体表：维度表目录里除下划线开头的元表外都是实体表（与 index.mjs 同口径）。
const DIM_DOCS = readdirSync(DIM_DIR)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .sort()
  .map((f) => loadJson(join(DIM_DIR, f)));
const SPECIES_DOC = DIM_DOCS.find((d) => d.dimensions && 'tissues' in d.dimensions && 'bodyPlan' in d.dimensions);
const SPECIES_ID = Object.keys(SPECIES_DOC.rows).sort()[0];
// org：类别行带 termination 的一张表；能终止的正例行 = 其 extends 指向带 termination 的类别行的第一行。
const ORG_DOC = DIM_DOCS.find((d) => d.kind === 'org');
const ORG_ROW = Object.entries(ORG_DOC.rows).find(([, v]) => ORG_DOC.classes[v.extends]?.termination)[0];
const ORG_FIELD = Object.keys(ORG_DOC.dimensions).find((k) => ORG_DOC.dimensions[k].type === 'number');
const TERMINAL_STATUS = loadJson(join(WORLD, 'rules/tables/death.json')).rows.find((r) => r.key === 'terminalStatus').value;
const CAUSE = 'verb_death_event'; // 卡文第 1 条的死因行

const ROOTS = [];
const newRoot = () => {
  const r = testTempRoot('s2a-term-');
  ROOTS.push(r);
  return r;
};
after(() => {
  for (const r of ROOTS.splice(0)) removeTempRoot(r);
});

async function bootWorld() {
  return init(express.Router(), { saveRoot: newRoot() });
}

// 以模板行 create 一个实体，返回新实体 id（kind 取该表的 kind，模板取该表的行）。
function createFrom(env, doc, rowId) {
  const before = new Set(Object.keys(env.state.created ?? {}));
  const r = env.submitProposal({ effects: [{ op: 'create', kind: doc.kind, template: rowId, facts: {} }] });
  assert.equal(r.ok, true, `create 应成功：${JSON.stringify(r)}`);
  const added = Object.keys(env.state.created ?? {}).filter((id) => !before.has(id));
  assert.equal(added.length, 1, 'create 应恰好新增一个实体');
  return added[0];
}
const createOrg = (env) => createFrom(env, ORG_DOC, ORG_ROW);
const createSpecies = (env) => createFrom(env, SPECIES_DOC, SPECIES_ID);

// 在一笔写入事务里调协议原语 terminate（末尾的 tx 由事务给出）。
async function terminateIn(env, id) {
  const { terminate } = await import('../../../server-plugin/rules/lifecycle/terminate.mjs');
  return runTransaction(env.engine, env.state, (tx) => terminate(env.state, id, CAUSE, null, tx));
}

// ---------- 用例 ----------

test('5a. 拒写：org 实体终止后，对 created.<它>.props.* 的 fact.set 整笔被拒，码为 E-TERM-RESIDUE，state 逐位不变', async () => {
  const env = await bootWorld();
  const id = createOrg(env);

  // 对照组：终止前同一形状的提案应成功，证明被拒的是终止这一因素。
  const live = env.submitProposal({ effects: [{ op: 'fact.set', entity: id, field: ORG_FIELD, value: 1 }] });
  assert.equal(live.ok, true, `终止前 fact.set 应成功：${JSON.stringify(live)}`);

  const t = await terminateIn(env, id);
  assert.equal(t.ok, true, `terminate 应成功：${JSON.stringify(t)}`);

  const before = canonical(env.state);
  const r = env.submitProposal({ effects: [{ op: 'fact.set', entity: id, field: ORG_FIELD, value: 2 }] });
  assert.equal(r.ok, false, '终止后的 fact.set 应被拒');
  assert.equal(r.code, 'E-TERM-RESIDUE', `拒写码应为 E-TERM-RESIDUE，实为 ${r.code}`);
  assert.equal(canonical(env.state), before, '整笔回滚：state 逐位不变');
});

test('5b. 物种表实体（非人物）读不到类别行的 termination：terminate 整笔拒（E-TERM-RESIDUE），state 逐位不变', async () => {
  const env = await bootWorld();
  const id = createSpecies(env); // 物种表实体（以家鸡行为模板建，不是人物）：该实体的类别行没有可读的 termination（卷二:559 ③）
  const before = canonical(env.state);
  const t = await terminateIn(env, id);
  assert.equal(t.ok, false, '读不到 termination 的个体终止应被整笔拒');
  assert.equal(t.code, 'E-TERM-RESIDUE', `拒绝码应为 E-TERM-RESIDUE，实为 ${t.code}`);
  assert.equal(canonical(env.state), before, '整笔回滚：state 逐位不变');
  assert.ok(!env.state.terminated || !Object.hasOwn(env.state.terminated, id), '不得写终止标记');
});

test('6. 同事务：org 实体终止后名下状态实例全部清空，终止标记在位（卷四:916 的协议一侧）', async () => {
  const env = await bootWorld();
  const id = createOrg(env);

  // 前提：先挂一个终端族状态实例（addStatus 为状态写者，卡文 S2-0a 范围）。
  const { addStatus } = await import('../../../server-plugin/rules/status/status.mjs');
  // 实现签名（rules/status/status.mjs:38）：addStatus(engine, state, subjectId, instanceId, statusRef, tx)。
  const put = runTransaction(env.engine, env.state, (tx) => addStatus(env.engine, env.state, id, 'inst_s2a_1', TERMINAL_STATUS, tx));
  assert.equal(put.ok, true, `前提：挂状态实例应成功：${JSON.stringify(put)}`);
  assert.ok(Object.keys(env.state.statuses?.[id] ?? {}).length > 0, '前提：应已有一个状态实例');

  const t = await terminateIn(env, id);
  assert.equal(t.ok, true, `terminate 应成功：${JSON.stringify(t)}`);

  assert.ok(env.state.terminated && Object.hasOwn(env.state.terminated, id), '终止标记应在位');
  assert.equal(Object.keys(env.state.statuses?.[id] ?? {}).length, 0, '终止后该实体名下不得留状态实例（终止第 5 步）');
});

test('7a. 去留：keep 的记录终止后原样保留（created.<它>.props.<已声明维度>）', async () => {
  const env = await bootWorld();
  const id = createOrg(env);

  const put = env.submitProposal({ effects: [{ op: 'fact.set', entity: id, field: ORG_FIELD, value: 3 }] });
  assert.equal(put.ok, true, `终止前写入应成功：${JSON.stringify(put)}`);

  const t = await terminateIn(env, id);
  assert.equal(t.ok, true, `terminate 应成功：${JSON.stringify(t)}`);

  assert.equal(env.state.created[id].props[ORG_FIELD], 3, 'keep 的记录终止后应原样保留');
});
