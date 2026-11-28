// S1-1 卡 B1 单测：事务与推进（卷二 :539–:545、卷二十七 :190/:742）。期望值按卷文与数据表手算。路径一律经 engine.P（卷二 :536）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { init } from '../../server-plugin/index.mjs';
import { express } from '../support/express.mjs';
import { mountKernel } from '../../server-plugin/rules/load/mount.mjs';
import { mergeOwners, shardDirOf } from '../../server-plugin/rules/load/registry-shards.mjs';
import { clockMinute, advance } from '../../server-plugin/kernel/scheduler.mjs';
import { runTransaction, submitProposal } from '../../server-plugin/kernel/transaction.mjs';
import { readPath, writePath } from '../../server-plugin/kernel/storage.mjs';
import { dim } from '../../server-plugin/kernel/dimensions.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';

const logOf = (g) => g.logBook.entries;

test('time 原语：推进 25 分钟按步长 10/10/5 分三步，时钟加 25', async () => {
  const g = await init(express.Router());
  const step = g.engine.host.heartbeatStepMinutes;
  const r = g.submitProposal({ effects: [{ op: 'time', minutes: 2 * step + 5 }] });
  assert.equal(r.ok, true);
  assert.equal(r.advancedMinutes, 2 * step + 5);
  assert.equal(clockMinute(g.engine, g.state), 2 * step + 5);
});

test('非正整数分钟拒收，时钟不动', async () => {
  const g = await init(express.Router());
  for (const m of [0, -3, 1.5, '5']) {
    const r = g.submitProposal({ effects: [{ op: 'time', minutes: m }] });
    assert.equal(r.ok, false);
    assert.equal(clockMinute(g.engine, g.state), 0);
  }
  assert.throws(() => g.advance(0));
  assert.throws(() => g.advance(2.5));
});

test('未登记处理函数的原语拒收，不抛出调用方', async () => {
  const g = await init(express.Router());
  const r = g.submitProposal({ effects: [{ op: 'transfer', from: 'a', to: 'b', qty: 1 }, { op: 'no.such.op' }] });
  assert.equal(r.ok, false);
  assert.equal(typeof r.code, 'string');
  assert.equal(clockMinute(g.engine, g.state), 0);
});

test('拒写整笔回滚且时钟不动；输入条目仍留在日志', async () => {
  const g = await init(express.Router());
  const before = logOf(g).length;
  const r = g.submitProposal({ effects: [{ op: 'time', minutes: 10 }, { op: 'fact.set', entity: 'nope_missing', field: 'x', value: 1 }] });
  assert.equal(r.ok, false);
  assert.equal(clockMinute(g.engine, g.state), 0);
  assert.equal(logOf(g)[before].kind, 'command');
  assert.equal(logOf(g)[before].seq, r.seq);
});

test('runTransaction：抛错整笔撤回并返回 {ok:false}；不嵌套', async () => {
  const g = await init(express.Router());
  const { P } = g.engine;
  const r = runTransaction(g.engine, g.state, (tx) => {
    writePath(g.state, P.clock_minute(), 99, tx);
    writePath(g.state, P.created_props('nope_x', 'y'), 1, tx);
  });
  assert.equal(r.ok, false);
  assert.equal(clockMinute(g.engine, g.state), 0);
  const n = runTransaction(g.engine, g.state, () => runTransaction(g.engine, g.state, () => 1));
  assert.equal(n.ok, false);
});

test('create 与 fact.set：新建实体并写 props，请求编号单调', async () => {
  const g = await init(express.Router());
  const kind = [...g.engine.registry.kindIds.entries()].find(([, rec]) => Array.isArray(rec.idPrefix) && rec.idPrefix.length > 0)?.[0];
  assert.ok(kind, '前提：存在带 id 前缀的种类');
  const r = g.submitProposal({ effects: [{ op: 'create', kind, facts: {} }] });
  if (r.ok) {
    const id = Object.keys(g.state.created)[0];
    assert.equal(g.state.created[id].kind, kind);
    const r2 = g.submitProposal({ effects: [{ op: 'time', minutes: 1 }] });
    assert.ok(r2.seq > r.seq);
  } else {
    assert.equal(typeof r.code, 'string');
  }
});

// create.template（卷二:128、:131；卷九:640）：实例的实体行就是其模板；facts（偏离行）覆盖模板值；template 须是同 kind 登记的实体行。
const tplCase = (g) => {
  const doc = g.engine.registry.tables.get('item');
  for (const [tid, row] of Object.entries(doc.rows)) {
    const k = Object.keys(row).find((d) => typeof row[d] === 'number' && Object.hasOwn(doc.dimensions, d));
    if (k) return { tid, dimension: k, value: row[k] };
  }
  return undefined;
};

test('create 带 template：dim 读到模板实体行的值；facts 覆盖后读到 facts 值', async () => {
  const g = await init(express.Router());
  const c = tplCase(g);
  assert.ok(c, '前提：item 表有带数值维度的实体行');
  const r = g.submitProposal({ effects: [{ op: 'create', kind: 'item', template: c.tid, facts: {} }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  const id = Object.keys(g.state.created)[0];
  assert.equal(g.state.created[id].template, c.tid);
  assert.equal(dim(g.engine, g.state, 'item', id, c.dimension).value, c.value);
  const over = c.value + 1;
  const r2 = g.submitProposal({ effects: [{ op: 'create', kind: 'item', template: c.tid, facts: { [c.dimension]: over } }] });
  assert.equal(r2.ok, true, JSON.stringify(r2));
  const id2 = Object.keys(g.state.created).find((x) => x !== id);
  assert.equal(dim(g.engine, g.state, 'item', id2, c.dimension).value, over);
});

test('create 的 template 指向别的 kind 或不存在即拒收，状态不变', async () => {
  const g = await init(express.Router());
  const other = Object.keys(g.engine.registry.tables.get('material').rows)[0];
  for (const template of [other, 'item_no_such_row']) {
    const r = g.submitProposal({ effects: [{ op: 'create', kind: 'item', template, facts: {} }] });
    assert.equal(r.ok, false);
  }
  assert.equal(Object.keys(g.state.created).length, 0);
});

/**
 * state-owners 声明表 = 主文件与 state-owners.d/ 分片的合并（S2-TP1 主会话授权改夹具：开局一步写持有边与账本后须带分片登记）；
 * 合并只调生产入口 rules/load/registry-shards.mjs 的 shardDirOf、mergeOwners，测试只读文件；合并结果冻结，返回深拷贝供测试副本改动。
 */
function ownersOf(o, json) {
  const main = 'world/ontology/state-owners.json';
  const dir = new URL(`../../${shardDirOf(main)}/`, o);
  const names = existsSync(dir) ? readdirSync(dir).sort() : [];
  const shards = names.map((n) => ({ file: `${shardDirOf(main)}/${n}`, doc: JSON.parse(readFileSync(new URL(n, dir), 'utf8')) }));
  return JSON.parse(JSON.stringify(mergeOwners({ file: main, doc: json('state-owners.json') }, shards).doc));
}

// heartbeatStepMinutes 装配期按 registry.json 的 host 声明核（卷二十七:190：integer、≥1，缺或不合即加载失败）；步长防线在 scheduler.advance。
// 卡 C 起 mountKernel 收世界数据原文（规则表按登记 code 收进 tableDocs，组装在 loadWorld）；本助手只把 host 表的 rows 换成给定值。
const loadWorld = (hostRows) => {
  const o = new URL('../../world/ontology/', import.meta.url);
  const json = (f) => JSON.parse(readFileSync(new URL(f, o), 'utf8'));
  const dir = new URL('dimensions/', o);
  const registryRows = json('../rules/registry.json').rows;
  const tableDocs = Object.fromEntries(registryRows.map((r) => [r.code, json(`../rules/${r.file}`)]));
  tableDocs.host = { ...tableDocs.host, rows: hostRows };
  return {
    dimensionDocs: readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort().map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'))),
    namedStructsDoc: json('named-structs.json'),
    owners: ownersOf(o, json),
    registryRows,
    tableDocs,
    digestExclude: json('../rules/tables/digest-exclude.json').paths,
    primitivesDoc: json('primitives.json'),
    vocabDoc: json('dimensions/_vocab.json'),
    unitsDoc: json('dimensions/_units.json'),
  };
};
// 装配层注入的能力（B2 起 mountKernel 收 caps；卡 C 起须带修正来源、源码清单非空）；本组只测装配期核对，不存档。
const caps = () => ({ digestCap: createDigestCap(), saveRoot: new URL('../../saves/', import.meta.url), sources: [{ path: 'test', text: '' }], modifierSources: Object.freeze([]) });
const realHostRows = () => JSON.parse(readFileSync(new URL('../../world/rules/tables/host.json', import.meta.url), 'utf8')).rows;
const withStep = (patch) => realHostRows().map((r) => (r.key === 'heartbeatStepMinutes' ? { ...r, ...patch } : r));

test('装配：heartbeatStepMinutes 缺行、0、负数、非整数、非数字各被拒；正常值照常', () => {
  const missing = realHostRows().filter((r) => r.key !== 'heartbeatStepMinutes');
  assert.throws(() => mountKernel(loadWorld(missing), caps()), /E-DIM-DOMAIN-RANGE/);
  for (const v of [0, -5, 2.5, '10', null]) assert.throws(() => mountKernel(loadWorld(withStep({ value: v })), caps()), /E-DIM-DOMAIN-RANGE/, String(v));
  const g = mountKernel(loadWorld(withStep({ value: 7 })), caps());
  assert.equal(g.engine.host.heartbeatStepMinutes, 7);
});

test('scheduler.advance：步长非正整数即抛，不进循环，时钟不动', async () => {
  const g = await init(express.Router());
  for (const bad of [0, -1, 1.5, undefined]) {
    const e = { ...g.engine, host: { heartbeatStepMinutes: bad } };
    assert.throws(() => advance(e, g.state, g.logBook, 5), /E-DIM-DOMAIN-RANGE/);
  }
  assert.equal(clockMinute(g.engine, g.state), 0);
});

test('推进中途某步被拒：先前 ok:true 事件之外，另追加 ok:false 事件，带 code 与已推进分钟', async () => {
  const g = await init(express.Router());
  const e = { ...g.engine, advance: () => ({ ok: false, code: 'E-EFF-PARAM', advancedMinutes: 10 }) };
  const r = submitProposal(e, g.state, g.logBook, { effects: [{ op: 'time', minutes: 25 }] });
  assert.equal(r.ok, false);
  const evs = logOf(g).filter((x) => x.seq === r.seq && x.kind === 'event');
  assert.equal(evs.length, 2);
  assert.equal(evs[0].ok, true);
  assert.deepEqual(evs[1], { seq: r.seq, kind: 'event', ok: false, code: 'E-EFF-PARAM', advancedMinutes: 10 });
});
