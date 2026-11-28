// S2-L 单测：最小账本（post 守恒与拒绝码、budget 窗口、R0 原语写者回落与重复登记、instantiate 多系统按序、开局入账）。写码方自补，不作验收依据。
// 期望值按卷六 §4.1 规则 2–7 与世界数据（出身条目 startingMoney、startingCoin）手算，或在测试里先造前提；不抄仓库基线计数。
// 世界数据经测试副本改动，不改 world/；存档根目录用 tests/accept/temp-root.mjs#testTempRoot。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testTempRoot } from '../accept/temp-root.mjs';
import { init, saveSlot, loadSlot, replay_apply } from '../../server-plugin/index.mjs';
import { express } from '../support/express.mjs';
import { mountKernel } from '../../server-plugin/rules/load/mount.mjs';
import { mergeOwners } from '../../server-plugin/rules/load/registry-shards.mjs';
import { assemblePrimitiveWriters, registerPrimitiveWriter } from '../../server-plugin/rules/load/primitive-writers.mjs';
import { instantiateEntity, registerInstantiator } from '../../server-plugin/rules/lifecycle/terminate.mjs';
import { runTransaction, handlesOp } from '../../server-plugin/kernel/transaction.mjs';
import { dim } from '../../server-plugin/kernel/dimensions.mjs';
import { readPath, readPathIn } from '../../server-plugin/kernel/storage.mjs';
import { post, openAccount } from '../../server-plugin/rules/economy/ledger.mjs';
import { conservationCheck } from '../../server-plugin/rules/economy/ledger-check.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';

const W = new URL('../../world/', import.meta.url);
const json = (rel) => JSON.parse(readFileSync(new URL(rel, W), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const VOCAB = json('ontology/dimensions/_vocab.json').families;
const LEDGER_RULES = json('rules/tables/economy/ledger.json').rows;
const ENDOW = LEDGER_RULES.find((r) => r.key === 'endowment').value;

/** 合并后的 state-owners（主文件 + state-owners.d 分片，同 index.mjs#readOwners）。 */
function owners() {
  const dir = new URL('ontology/state-owners.d/', W);
  const names = existsSync(dir) ? readdirSync(dir).sort() : [];
  const shards = names.map((n) => ({ file: `world/ontology/state-owners.d/${n}`, doc: JSON.parse(readFileSync(new URL(n, dir), 'utf8')) }));
  return mergeOwners({ file: 'world/ontology/state-owners.json', doc: json('ontology/state-owners.json') }, shards).doc;
}

/** 世界数据原文（与 index.mjs#readWorld 同形）。 */
function rawWorld() {
  const dims = new URL('ontology/dimensions/', W);
  const acts = new URL('actions/', W);
  const registryRows = json('rules/registry.json').rows;
  return {
    dimensionDocs: readdirSync(dims).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort().map((f) => JSON.parse(readFileSync(new URL(f, dims), 'utf8'))),
    namedStructsDoc: json('ontology/named-structs.json'),
    owners: clone(owners()),
    registryRows,
    tableDocs: Object.fromEntries(registryRows.map((r) => [r.code, json(`rules/${r.file}`)])),
    digestExclude: json('rules/tables/digest-exclude.json').paths,
    primitivesDoc: json('ontology/primitives.json'),
    vocabDoc: json('ontology/dimensions/_vocab.json'),
    unitsDoc: json('ontology/dimensions/_units.json'),
    distributionsDoc: json('ontology/dimensions/_distributions.json'),
    effectsDoc: json('ontology/dimensions/_effects.json'),
    actionDocs: readdirSync(acts).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(new URL(f, acts), 'utf8'))),
  };
}
const caps = (tag) => ({ digestCap: createDigestCap(), saveRoot: pathToFileURL(join(testTempRoot(tag), '/')), sources: [{ path: 'x.mjs', text: '' }], modifierSources: Object.freeze([]) });
const code = (c) => (e) => e.code === c;
const persons = (g) => Object.keys(g.state.created).filter((id) => g.state.created[id].kind === 'person');

/** 开局选来历（第 0 个种族、第 index 条来历、第 0 个地点），返回化身 id。 */
function spawn(g, index = 0) {
  const a = g.menu(null).affordances[0];
  const r = g.act({ act: a.act, slots: { species: 0, origin: index, place: 0, lodge: 0 } });
  assert.equal(r.ok, true, JSON.stringify(r));
  return persons(g)[0];
}

/** 从来历模板行建一个 person（create 原语，经 submitProposal），返回新 id 与结果。 */
function createFrom(g, template, species) {
  const before = new Set(persons(g));
  const r = g.submitProposal({ effects: [{ op: 'create', kind: 'person', template, facts: { species } }] });
  return { r, id: persons(g).find((p) => !before.has(p)) };
}

/** 该个体出身条目的起始钱（期望值取世界数据，不取账本）。 */
function expectedOf(g, id) {
  const origin = dim(g.engine, g.state, 'person', id, ENDOW.originDimension).value;
  const ent = VOCAB.origin.entries[origin];
  return { origin, n: ent[ENDOW.moneyField], coin: ent[ENDOW.coinField] };
}

/** 个体名下开局随身钱的账户（用途、钱种取 endowment 与出身条目，从数据读；S2-H 起化身名下另有起始物账户，不再是唯一账户）。须恰一个。 */
function moneyAccounts(g, id) {
  const { coin } = expectedOf(g, id);
  return g.views.accountsOf(id).filter((a) => a.purpose === ENDOW.purpose && a.resource === coin);
}
function moneyOf(g, id) {
  const list = moneyAccounts(g, id);
  assert.equal(list.length, 1, `${id}: want exactly one starting-money account`);
  return list[0];
}

/** 某个来历模板行（person 表里 origin 维度所指出身条目钱种为 coin 的第一行）。 */
function templateWithCoin(raw, coin) {
  const rows = raw.dimensionDocs.find((d) => d.kind === 'person').rows;
  return Object.keys(rows).find((k) => typeof rows[k].origin === 'string' && VOCAB.origin.entries[rows[k].origin][ENDOW.coinField] === coin);
}

test('1 开局入账：选不同来历，化身名下各有一个钱账户，余额 = 出身条目起始钱、钱种 = startingCoin；src_genesis 累计相同；日志有登记事由事件', async () => {
  for (const index of [0, 1, 2]) {
    const g = await init(express.Router(), { saveRoot: testTempRoot(`s2l-endow-${index}-`) });
    const id = spawn(g, index);
    const want = expectedOf(g, id);
    const accts = moneyAccounts(g, id);
    assert.equal(accts.length, 1);
    assert.equal(accts[0].balance, want.n);
    assert.equal(accts[0].resource, want.coin);
    assert.equal(accts[0].purpose, ENDOW.purpose);
    assert.equal(g.views.balance(accts[0].account), want.n);
    // S2-TP1（主会话授权）：开局一步另把各组织开局公库经同一来源入账；世界累计 = 化身起始钱 + 各组织该钱种开局公库之和（组织行 orgEndowment.fundsDimension，缺写取表默认）。
    const fundsDim = LEDGER_RULES.find((r) => r.key === 'orgEndowment').value.fundsDimension;
    const orgDoc = rawWorld().dimensionDocs.find((d) => d.kind === 'org');
    const orgFunds = Object.values(orgDoc.rows).reduce((s, r) => s + ((r[fundsDim] ?? orgDoc.dimensions[fundsDim].default)[want.coin] ?? 0), 0);
    assert.equal(g.state.ledgerTotals[want.coin][ENDOW.source].cumulative, want.n + orgFunds);
    const ev = g.logBook.entries.find((e) => e.verb === ENDOW.reason);
    assert.ok(ev, '缺开局入账事件');
    assert.equal(ev.payload.refs.origin, want.origin);
    assert.deepEqual(ev.targets, [id]);
    assert.deepEqual(conservationCheck(g.engine, g.state), []);
  }
});

test('2 transfer 原语经 submitProposal：两边一减一增、ledgerTotals 不变、守恒；超额 E-LEDGER-NEGATIVE、跨钱种 E-EFF-PARAM、未开户 E-DIM-REF-MISSING，状态不变', async () => {
  const raw = rawWorld();
  const g = await init(express.Router(), { saveRoot: testTempRoot('s2l-transfer-') });
  const a = spawn(g, 0);
  const species = g.state.created[a].props.species;
  const from = moneyOf(g, a);
  const tpl = templateWithCoin(raw, from.resource);
  const b = createFrom(g, tpl, species);
  assert.equal(b.r.ok, true, JSON.stringify(b.r));
  const to = moneyOf(g, b.id);
  const totals = clone(g.state.ledgerTotals);
  const r = g.submitProposal({ effects: [{ op: 'transfer', from: from.account, to: to.account, qty: 3 }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(g.views.balance(from.account), from.balance - 3);
  assert.equal(g.views.balance(to.account), to.balance + 3);
  assert.deepEqual(g.state.ledgerTotals, totals);
  assert.deepEqual(conservationCheck(g.engine, g.state), []);
  assert.ok(g.logBook.entries.some((e) => e.seq === r.seq && e.verb === LEDGER_RULES.find((x) => x.key === 'primitiveReason').value));
  const snap = clone(g.state);
  const over = g.submitProposal({ effects: [{ op: 'transfer', from: from.account, to: to.account, qty: from.balance + 1 }] });
  assert.equal(over.code, 'E-LEDGER-NEGATIVE');
  const other = templateWithCoin(raw, Object.keys(VOCAB.resource.entries).find((k) => k !== from.resource && templateWithCoin(raw, k)));
  const c = createFrom(g, other, species);
  const snap2 = clone(g.state);
  const cross = g.submitProposal({ effects: [{ op: 'transfer', from: from.account, to: moneyOf(g, c.id).account, qty: 1 }] });
  assert.equal(cross.code, 'E-EFF-PARAM');
  const missing = g.submitProposal({ effects: [{ op: 'transfer', from: from.account, to: `${b.id}/${ENDOW.purpose}/${from.resource}/nope`, qty: 1 }] });
  assert.equal(missing.code, 'E-DIM-REF-MISSING');
  assert.deepEqual(g.state, snap2);
  assert.notDeepEqual(snap, snap2);
});

test('3 post 拒绝码：不平 E-LEDGER-UNBALANCED、代号不在资源行 E-LEDGER-CODE-UNREGISTERED、转换缺对手 E-LEDGER-PAIR-MISSING；被拒整笔不写', async () => {
  const g = await init(express.Router(), { saveRoot: testTempRoot('s2l-post-') });
  const id = spawn(g, 0);
  const acc = moneyOf(g, id);
  const row = json('rules/tables/economy/resources.json').rows.find((r) => r.key === acc.resource).value;
  const notSource = Object.keys(VOCAB.src.entries).find((s) => !row.sources.includes(s));
  const paired = Object.keys(VOCAB.src.entries).find((s) => VOCAB.src.entries[s].pairedWith && row.sources.includes(s) && VOCAB.src.entries[s].budgetMode !== 'bm_capped');
  const snap = clone(g.state);
  const run = (legs) => runTransaction(g.engine, g.state, (tx) => post(g.engine, g.state, { legs, reason: ENDOW.reason }, tx));
  assert.equal(run([{ account: acc.account, delta: 2 }]).code, 'E-LEDGER-UNBALANCED');
  assert.equal(run([{ source: notSource, resource: acc.resource, qty: 2 }, { account: acc.account, delta: 2 }]).code, 'E-LEDGER-CODE-UNREGISTERED');
  assert.equal(run([{ source: paired, resource: acc.resource, qty: 2 }, { account: acc.account, delta: 2 }]).code, 'E-LEDGER-PAIR-MISSING');
  assert.equal(run([{ account: acc.account, delta: -(acc.balance + 1) }, { sink: row.sinks[0], resource: acc.resource, qty: acc.balance + 1 }]).code, 'E-LEDGER-NEGATIVE');
  assert.deepEqual(g.state, snap);
});

test('4 转让限制：tr_bound 的资源在两持有人间转 E-LEDGER-TRANSFER-RESTRICTED（测试副本改资源行）', () => {
  const raw = rawWorld();
  const g0 = mountKernel(clone(raw), caps('s2l-bound-probe-'));
  const a0 = spawn(g0, 0);
  const coin = moneyOf(g0, a0).resource;
  raw.tableDocs.economyResources.rows.find((r) => r.key === coin).value.transferable = 'tr_bound';
  const g = mountKernel(raw, caps('s2l-bound-'));
  const a = spawn(g, 0);
  const b = createFrom(g, templateWithCoin(raw, coin), g.state.created[a].props.species);
  const r = g.submitProposal({ effects: [{ op: 'transfer', from: moneyOf(g, a).account, to: moneyOf(g, b.id).account, qty: 1 }] });
  assert.equal(r.code, 'E-LEDGER-TRANSFER-RESTRICTED');
});

test('5 budget 窗口：第 0 日从来历模板建 person 入账；推进到第 1 日后同样建即 E-LEDGER-CAPPED-DIRECT 整笔回滚（不建行、不开户）', async () => {
  const raw = rawWorld();
  const g = await init(express.Router(), { saveRoot: testTempRoot('s2l-window-') });
  const a = spawn(g, 0);
  const species = g.state.created[a].props.species;
  const coin = moneyOf(g, a).resource;
  const ok = createFrom(g, templateWithCoin(raw, coin), species);
  assert.equal(ok.r.ok, true);
  // 一日分钟数取单位表（day、minute 两行的 si 之比），推进一整日即到第 1 日。
  const units = json('ontology/dimensions/_units.json').units;
  const si = (id) => units.find((u) => u.id === id).si;
  const adv = g.advance(si('day') / si('minute'));
  assert.equal(adv.ok, true, JSON.stringify(adv));
  const snap = clone(g.state);
  const late = createFrom(g, templateWithCoin(raw, coin), species);
  assert.equal(late.r.code, 'E-LEDGER-CAPPED-DIRECT');
  assert.equal(late.id, undefined);
  assert.deepEqual(g.state, snap);
});

test('6 持有人：item 实体开户 E-LEDGER-HOLDER-NOT-SUBJECT；place 开户 E-ACT-WRITER-NOT-READY（ledgerHolder 数据未建）', async () => {
  const g = await init(express.Router(), { saveRoot: testTempRoot('s2l-holder-') });
  spawn(g, 0);
  const idOf = (kind) => [...g.engine.registry.idIndex].find(([, k]) => k === kind)[0];
  const open = (holder) => runTransaction(g.engine, g.state, (tx) => openAccount(g.engine, g.state, holder, { kind: Object.keys(VOCAB.resource.entries)[0] }, ENDOW.purpose, tx));
  assert.equal(open(idOf('item')).code, 'E-LEDGER-HOLDER-NOT-SUBJECT');
  assert.equal(open(idOf('place')).code, 'E-ACT-WRITER-NOT-READY');
});

test('7 R0：同一 op 登两个写者、撞内核已有 op 即 E-DIM-DUPLICATE-KEY；handler 对不上 E-DIM-REF-MISSING；未登记写者的目录原语照旧 E-EFF-PRIMITIVE', async () => {
  const fn = () => ({});
  const e1 = registerPrimitiveWriter('a.mjs#f', fn);
  const e2 = registerPrimitiveWriter('b.mjs#g', fn);
  const sys = (op, handler) => ({ primitiveWriter: { ops: [op], handler } });
  assert.equal(assemblePrimitiveWriters({ systems: { x: sys('transfer', 'a.mjs#f') } }, [e1]).get('transfer'), fn);
  assert.throws(() => assemblePrimitiveWriters({ systems: { x: sys('transfer', 'a.mjs#f'), y: sys('transfer', 'b.mjs#g') } }, [e1, e2]), code('E-DIM-DUPLICATE-KEY'));
  assert.throws(() => assemblePrimitiveWriters({ systems: { x: sys('time', 'a.mjs#f') } }, [e1]), code('E-DIM-DUPLICATE-KEY'));
  assert.throws(() => assemblePrimitiveWriters({ systems: { x: sys('transfer', 'c.mjs#h') } }, [e1]), code('E-DIM-REF-MISSING'));
  const g = await init(express.Router(), { saveRoot: testTempRoot('s2l-r0-') });
  // 原语目录里有、内核无处理函数、合并后 owners 里也没有 systems.*.primitiveWriter 声明的原语（从数据判出；只取必填键全为 id 型的，参数用化身构造即合规），参数合规后照旧 E-EFF-PRIMITIVE。
  const declared = new Set(Object.values(Object(owners()).systems).flatMap((sys) => (sys && sys.primitiveWriter ? sys.primitiveWriter.ops : [])));
  const cand = json('ontology/primitives.json').primitives.find((p) => !handlesOp(p.op) && !declared.has(p.op) && p.required && Object.values(p.required).every((t) => t === 'id'));
  assert.ok(cand, '前提：目录里应有无处理函数、无写者声明、必填键全为 id 的原语');
  const avatar = spawn(g, 0);
  const r = g.submitProposal({ effects: [{ op: cand.op, ...Object.fromEntries(Object.keys(cand.required).map((k) => [k, avatar])) }] });
  assert.equal(r.code, 'E-EFF-PRIMITIVE', JSON.stringify(r));
  const raw = rawWorld();
  raw.owners.systems.dup = { primitiveWriter: { ops: ['transfer'], handler: 'rules/economy/ledger.mjs#transferWriter' } };
  assert.throws(() => mountKernel(raw, caps('s2l-r0-dup-')), code('E-DIM-DUPLICATE-KEY'));
});

test('8 instantiate 多系统：同一种类按 sortKey（缺省 0）再按系统名依次调；sortKey 非整数即 E-DIM-STRUCT-FIELD', async () => {
  const g = await init(express.Router(), { saveRoot: testTempRoot('s2l-inst-') });
  const id = spawn(g, 0);
  const calls = [];
  const mk = (name) => registerInstantiator(`${name}.mjs#f`, () => calls.push(name));
  /** @type {Record<string, {instantiate: {kinds: string[], handler: string, sortKey?: unknown}}>} */
  const systems = {
    zeta: { instantiate: { kinds: ['person'], handler: 'zeta.mjs#f' } },
    alpha: { instantiate: { kinds: ['person'], handler: 'alpha.mjs#f', sortKey: 2 } },
    beta: { instantiate: { kinds: ['person'], handler: 'beta.mjs#f', sortKey: 1 } },
    other: { instantiate: { kinds: ['item'], handler: 'other.mjs#f' } },
  };
  const owners = g.engine.docData.owners;
  assert.ok(owners !== null && typeof owners === 'object');
  const engine = { ...g.engine, docData: { ...g.engine.docData, owners: { ...owners, systems } }, instantiators: ['zeta', 'alpha', 'beta', 'other'].map(mk) };
  instantiateEntity(g.state, id, { engine });
  assert.deepEqual(calls, ['zeta', 'beta', 'alpha']);
  systems.beta.instantiate.sortKey = 'x';
  assert.throws(() => instantiateEntity(g.state, id, { engine }), code('E-DIM-STRUCT-FIELD'));
});

test('9 加载期核对：出身钱种的资源行 sources 不含 src_genesis 即开局拒 E-LEDGER-CODE-UNREGISTERED；起始钱为负即 E-DIM-STRUCT-FIELD', () => {
  const raw = rawWorld();
  const coin = Object.values(raw.vocabDoc.families.origin.entries).find((e) => e[ENDOW.moneyField] > 0)[ENDOW.coinField];
  const row = raw.tableDocs.economyResources.rows.find((r) => r.key === coin).value;
  row.sources = row.sources.filter((s) => s !== ENDOW.source);
  assert.throws(() => mountKernel(raw, caps('s2l-check-src-')), code('E-LEDGER-CODE-UNREGISTERED'));
  const raw2 = rawWorld();
  Object.values(raw2.vocabDoc.families.origin.entries)[0][ENDOW.moneyField] = -1;
  assert.throws(() => mountKernel(raw2, caps('s2l-check-neg-')), code('E-DIM-STRUCT-FIELD'));
});

test('10 存槽读档复演：开局入账与转移之后 saveDigest 相同，accounts、ledgerTotals、ledgerCounters 逐位相同', async () => {
  const raw = rawWorld();
  const dir = testTempRoot('s2l-replay-');
  const g = await init(express.Router(), { saveRoot: dir });
  const a = spawn(g, 0);
  const from = moneyOf(g, a);
  const b = createFrom(g, templateWithCoin(raw, from.resource), g.state.created[a].props.species);
  assert.equal(g.submitProposal({ effects: [{ op: 'transfer', from: from.account, to: moneyOf(g, b.id).account, qty: 2 }] }).ok, true);
  const saved = saveSlot(g);
  const r = replay_apply(loadSlot(saved, { saveRoot: dir }));
  assert.equal(r.saveDigest, saved.saveDigest);
  for (const k of ['accounts', 'ledgerTotals', 'ledgerCounters']) assert.deepEqual(r.state[k], g.state[k], k);
});

test('11 readPathIn 通用按段取值：账本 accounts.*（struct:holderAccounts）与个体偏离行 created.*.props.*（map 维度 attributes）同一入口；读不到即 undefined；keys 不合 E-DIM-ID-FORMAT', async () => {
  const g = await init(express.Router(), { saveRoot: testTempRoot('s2l-readin-') });
  const id = spawn(g, 0);
  const { P } = g.engine;
  const acc = moneyOf(g, id);
  assert.equal(readPathIn(g.state, P.accounts(id), [acc.purpose, acc.resource, acc.key]), acc.balance);
  assert.equal(readPathIn(g.state, P.accounts(id), [acc.purpose, acc.resource, 'nope']), undefined);
  assert.equal(readPathIn(g.state, P.accounts(id), [acc.purpose, acc.resource, acc.key, 'deeper']), undefined);
  const attrs = readPath(g.state, P.created_props(id, 'attributes'));
  const attr = Object.keys(attrs)[0];
  assert.equal(readPathIn(g.state, P.created_props(id, 'attributes'), [attr]), attrs[attr]);
  assert.equal(readPathIn(g.state, P.created_props('npc_absent', 'attributes'), [attr]), undefined);
  assert.deepEqual(readPathIn(g.state, P.accounts(id), []), readPath(g.state, P.accounts(id)));
  assert.throws(() => readPathIn(g.state, P.accounts(id), ['']), code('E-DIM-ID-FORMAT'));
  assert.throws(() => readPathIn(g.state, P.accounts(id), /** @type {any} */ ([1])), code('E-DIM-ID-FORMAT'));
});
