// S1-1 卡 B1（事务与推进）黑盒验收。出题方：Claude Haiku 5.5（API），标识 haiku-api-test-s1b。
// 依据：卷二:541（事务内拒写：整笔回滚、report、不重试）、卷二:539–545、卷二十七:742（外来输入入输入序列，条目先单独提交）、
// 卷二十七:743（推进目标时刻 = 处理时的 clock.minute 加增量）、卷二十七:190（rules.host.heartbeatStepMinutes）、
// docs/gemini/kickoff-1125.md:92（耗时动作经 resolve 返回 postCommit.advanceMinutes，提交后外层推进，无嵌套事务）。
// 不写死任何实体 id、维度名、kind、op：全部从 world/ontology/dimensions/*.json 与 world/ontology/primitives.json 运行时读取。
import { express } from '../../support/express.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { init } from '../../../server-plugin/index.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DIM_DIR = join(ROOT, 'world/ontology/dimensions');
const SUPPORTED_OPS = new Set(['time', 'create', 'fact.set']);

function loadJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

const TABLES = readdirSync(DIM_DIR)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .sort()
  .map((f) => loadJson(join(DIM_DIR, f)));

const PRIMITIVES = loadJson(join(ROOT, 'world/ontology/primitives.json')).primitives;

// 取该表第一条真实实体行的 id（create 的 template 用，数据驱动，不写死 id）。
function firstRowId(table) {
  const id = Object.keys(table.rows ?? {})[0];
  assert.ok(id, `表 ${table.kind} 应至少有一条真实实体行`);
  return id;
}

function idPrefixOf(table) {
  const p = table.entity && table.entity.idPrefix;
  return Array.isArray(p) && p.length > 0 ? p[0] : null;
}

// 第一个有 idPrefix 的维度表（按文件名排序）。用于 create。
const FIRST_KIND_TABLE = TABLES.find((t) => idPrefixOf(t) !== null);
assert.ok(FIRST_KIND_TABLE, '维度表中应至少有一张带 entity.idPrefix 的表');

// 第一个带 idPrefix、且含一条可写数值维度的表（非派生、modifiable 为 true、domain 有有限边界）。用于 fact.set。
function writableNumberDim(table) {
  for (const [name, d] of Object.entries(table.dimensions ?? {})) {
    if (d.type !== 'number' || d.derived || d.modifiable !== true) continue;
    if (!Array.isArray(d.domain) || d.domain.length !== 2) continue;
    const [lo, hi] = d.domain;
    if (typeof lo !== 'number' || typeof hi !== 'number') continue;
    return { name, value: lo + (hi - lo) / 2 };
  }
  return null;
}
const WRITE_TABLE = TABLES.find((t) => idPrefixOf(t) !== null && writableNumberDim(t) !== null);
assert.ok(WRITE_TABLE, '维度表中应至少有一张带 idPrefix 且含可写数值维度的表');
const WRITE_DIM = writableNumberDim(WRITE_TABLE);

// 一个不在支持集合内的 op（取 primitives.json 里 time/create/fact.set 以外的任一条）。
const UNSUPPORTED_OP = PRIMITIVES.map((p) => p.op).find((op) => !SUPPORTED_OPS.has(op));
assert.ok(UNSUPPORTED_OP, 'primitives.json 中应存在 time/create/fact.set 以外的 op');

async function boot() {
  const env = await init(express.Router());
  assert.ok(env && typeof env.submitProposal === 'function', 'init 应返回 {engine, state, submitProposal, advance}');
  return env;
}

function snapshot(state, logBook) {
  return {
    minute: state.clock.minute,
    createdIds: Object.keys(state.created ?? {}).sort(),
    logLen: logBook.entries.length,
  };
}

// 提交一笔 create（kind 非留痕时须带 template，卷九:640），返回新实体 id（取 state.created 中新增的那一个）。
async function createOne(env, kind, template, facts = {}) {
  const before = new Set(Object.keys(env.state.created ?? {}));
  const r = await env.submitProposal({ effects: [{ op: 'create', kind, template, facts }] });
  assert.equal(r.ok, true, `create ${kind} 应成功：${JSON.stringify(r)}`);
  const added = Object.keys(env.state.created ?? {}).filter((id) => !before.has(id));
  assert.equal(added.length, 1, 'create 应恰好新增一个实体');
  return added[0];
}

test('1. init 返回四个成员，clock.minute 为 0，log 为空', async () => {
  const env = await boot();
  assert.ok(env.engine != null, '应返回 engine');
  assert.ok(env.state && typeof env.state === 'object', '应返回 state');
  assert.equal(typeof env.submitProposal, 'function');
  assert.equal(typeof env.advance, 'function');
  assert.equal(env.state.clock.minute, 0);
  assert.ok(!('log' in env.state), 'state 无 log 键（卷二十七:542，日志移出 state）');
  assert.ok(Array.isArray(env.logBook.entries), 'logBook.entries 应为数组');
  assert.equal(env.logBook.entries.length, 0);
});

test('2. submitProposal 的 time 30 成功推进时钟，log 含 command 条目', async () => {
  const { state, submitProposal, logBook } = await boot();
  const minuteBefore = state.clock.minute;
  const logBefore = logBook.entries.length;
  const r = await submitProposal({ effects: [{ op: 'time', minutes: 30 }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(state.clock.minute, minuteBefore + 30);
  const added = logBook.entries.slice(logBefore);
  assert.ok(added.some((e) => e.kind === 'command'), '本次提交应在 log 中追加一条 kind 为 command 的输入条目');
});

test('3. create 真实 kind 后 state.created 新增以该 idPrefix 开头的 id', async () => {
  const env = await boot();
  const kind = FIRST_KIND_TABLE.kind;
  const prefix = idPrefixOf(FIRST_KIND_TABLE);
  const id = await createOne(env, kind, firstRowId(FIRST_KIND_TABLE), {});
  assert.ok(id.startsWith(prefix), `新实体 id ${id} 应以 ${prefix} 开头`);
});

test('4. create 后 fact.set 写入真实数值维度，props 中为写入值', async () => {
  const env = await boot();
  const id = await createOne(env, WRITE_TABLE.kind, firstRowId(WRITE_TABLE));
  const r = await env.submitProposal({
    effects: [{ op: 'fact.set', entity: id, field: WRITE_DIM.name, value: WRITE_DIM.value }],
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(env.state.created[id].props[WRITE_DIM.name], WRITE_DIM.value);
});

test('5. 同一提案 create 后接必被拒的 time -5：整笔回滚，state.created 与 clock 不变，command 条目保留', async () => {
  const env = await boot();
  const { state, submitProposal, logBook } = env;
  const before = snapshot(state, logBook);
  const r = await submitProposal({
    effects: [
      { op: 'create', kind: FIRST_KIND_TABLE.kind, template: firstRowId(FIRST_KIND_TABLE), facts: {} },
      { op: 'time', minutes: -5 },
    ],
  });
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(typeof r.code, 'string', '拒收应带 code');
  assert.ok(r.code.length > 0);
  assert.deepEqual(Object.keys(state.created ?? {}).sort(), before.createdIds, '整笔回滚：不得残留新实体');
  assert.equal(state.clock.minute, before.minute, '时钟不变');
  const added = logBook.entries.slice(before.logLen);
  assert.ok(added.some((e) => e.kind === 'command'), '输入条目不随回滚撤销：log 中仍应有本次 command 条目');
  assert.ok(!added.some((e) => e.kind === 'advance'), '被拒的提案不应追加 advance 条目');
});

test('6. 未支持的 op 返回 ok:false 带 code，状态不变', async () => {
  const env = await boot();
  const { state, submitProposal, logBook } = env;
  const before = snapshot(state, logBook);
  const r = await submitProposal({ effects: [{ op: UNSUPPORTED_OP }] });
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(typeof r.code, 'string', '拒收应带 code');
  assert.ok(r.code.length > 0);
  assert.deepEqual(Object.keys(state.created ?? {}).sort(), before.createdIds);
  assert.equal(state.clock.minute, before.minute);
});

test('7. time 分钟数为 0、负数、非整数均拒收，时钟不变', async () => {
  for (const minutes of [0, -3, 1.5]) {
    const env = await boot();
    const before = env.state.clock.minute;
    let rejected;
    try {
      const r = await env.submitProposal({ effects: [{ op: 'time', minutes }] });
      rejected = r && r.ok === false;
    } catch {
      rejected = true; // 抛错也算拒收
    }
    assert.ok(rejected, `minutes=${minutes} 应被拒收`);
    assert.equal(env.state.clock.minute, before, `minutes=${minutes} 被拒后时钟应不变`);
  }
});

test('8. time 25 使时钟恰增 25；advance(10)+advance(15) 与之等效', async () => {
  const env = await boot();
  const before = env.state.clock.minute;
  const logBefore = env.logBook.entries.length;
  const r = await env.submitProposal({ effects: [{ op: 'time', minutes: 25 }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(env.state.clock.minute - before, 25);
  const advances = env.logBook.entries.slice(logBefore).filter((e) => e.kind === 'advance');
  const exposed = advances.filter((e) => typeof e.minutes === 'number');
  if (exposed.length > 0) {
    assert.equal(exposed.reduce((s, e) => s + e.minutes, 0), 25, '暴露分钟数的 advance 条目之和应为 25');
  }

  const other = await boot();
  const b2 = other.state.clock.minute;
  await other.advance(10);
  await other.advance(15);
  assert.equal(other.state.clock.minute - b2, 25, 'advance(10)+advance(15) 应使时钟增 25，与提交 time 25 相同');
});

test('9. 连续两次提交，后者 seq 大于前者，log 内 seq 单调递增', async () => {
  const { state, submitProposal, logBook } = await boot();
  const r1 = await submitProposal({ effects: [{ op: 'time', minutes: 5 }] });
  const r2 = await submitProposal({ effects: [{ op: 'time', minutes: 5 }] });
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.ok(r2.seq > r1.seq, `后者 seq ${r2.seq} 应大于前者 ${r1.seq}`);
  // 同一次请求写出的 command/event 条目共享一个 seq（同批），故条目级只要求不降，
  // 跨请求的 seq 严格递增由下面的 command 条目序列保证。
  const entries = logBook.entries;
  for (let i = 1; i < entries.length; i++) {
    assert.ok(entries[i].seq >= entries[i - 1].seq, `log 第 ${i} 条 seq 不应下降`);
  }
  const requestSeqs = entries.filter((e) => e.kind === 'command').map((e) => e.seq);
  assert.equal(requestSeqs.length, 2, '两次提交应各有一条 command 条目');
  for (let i = 1; i < requestSeqs.length; i++) {
    assert.ok(requestSeqs[i] > requestSeqs[i - 1], `第 ${i + 1} 次请求的 seq 应严格大于前一次`);
  }
});

test('10. 静态：kernel/files.json 不超过 15 项且各文件存在', () => {
  const files = loadJson(join(ROOT, 'server-plugin/kernel/files.json'));
  assert.ok(Array.isArray(files), 'files.json 应为数组');
  assert.ok(files.length <= 15, `files.json 有 ${files.length} 项，上限 15`);
  for (const f of files) {
    assert.ok(existsSync(join(ROOT, f)), `登记文件不存在：${f}`);
  }
});
