// S2-0c1（NPC 死后财物分流）黑盒验收支撑。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-0c1。
// 只提供：临时根与仓库副本（夹具）、产品入口的薄包装（开局、选来历、建 NPC、destroy、推进、存读档）、
// 从日志与状态读持有边、账户与残骸（形状取自卷二:721、卷二:556–:558、卷六:103 账户串、卷十八:528 持有变化事件）、从 world/ 读期望值。
// 不 mock 任何内核、规则或入口；前提全部由真实动作造；期望值的 id、数额、单位、种类都从 world/ 读，不写死。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { express } from '../../support/express.mjs';
import { copyRepo } from '../../support/wire-host.mjs';
import { init } from '../../../server-plugin/index.mjs';
import { testTempRoot, removeTempRoot, writeUnderTempRoot } from '../../accept/temp-root.mjs';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORLD = join(ROOT, 'world');
export const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const dimension = (name) => loadJson(join(WORLD, 'ontology/dimensions', name));
const ruleRows = (name) => loadJson(join(WORLD, 'rules/tables', name)).rows;

// —— 数据（期望值来源）——
export const VOCAB = dimension('_vocab.json').families;
export const HK = VOCAB.holding_kind.entries; // 持有种类族（卷十八 §4.1）
export const ORIGIN_ENTRIES = VOCAB.origin.entries;
export const PERSON_ROWS = dimension('person.json').rows;
export const ITEM_ROWS = dimension('item.json').rows;
export const COMPONENT_IDS = Object.keys(VOCAB.component.entries);
const SPECIES_ROWS = dimension('species.json').rows;
export const SPECIES_IDS = Object.keys(SPECIES_ROWS);
export const SAPIENT_SPECIES = SPECIES_IDS.find((k) => SPECIES_ROWS[k].classes?.includes('comp_sapient'));
export const RESOURCE_ROWS = ruleRows('economy/resources.json');
export const RESOURCE_IDS = RESOURCE_ROWS.map((r) => r.key);
export const RESOURCE = Object.fromEntries(RESOURCE_ROWS.map((r) => [r.key, r.value]));
const LEDGER_ROWS = ruleRows('economy/ledger.json');
export const ACCOUNT_RULE = LEDGER_ROWS.find((r) => r.key === 'account').value;
export const HOLD_VERB = 'verb_holding_changed'; // 卷十八:528
export const TERM_VERB = 'verb_entity_terminated'; // 卷二:557 终止事件
// 账本事由：economyLedger 行 terminateReason（卷六:383 规则 9；草案 Q6 甲）。调用时才读，缺行即报错。
export function terminateReason() {
  const row = LEDGER_ROWS.find((r) => r.key === 'terminateReason');
  assert.ok(row, 'world/rules/tables/economy/ledger.json 应登记 terminateReason 行（持有人终止分流的事由，草案 Q6 甲）');
  assert.equal(typeof row.value, 'string', 'terminateReason 应为动词代号');
  return row.value;
}

// 残骸与账户的读法：账户串 = [持有人, 用途, 资源种类, 资源键] 以 account.sep 连接（卷六:104）。
export const resourceOnTerminate = (res) => RESOURCE[res]?.onTerminate;

// 干净开局、真 init；临时根在结束时清理。
const ROOTS = [];
const newRoot = (prefix) => {
  const r = testTempRoot(prefix);
  ROOTS.push(r);
  return r;
};
export function cleanup() {
  for (const r of ROOTS.splice(0)) removeTempRoot(r);
}
export async function freshWorld() {
  const saveRoot = newRoot('s2-0c1-save-');
  const world = await init(express.Router(), { saveRoot });
  return { world, saveRoot };
}

// 仓库副本（只含 server-plugin 与 world；写入只落在临时根）。
export function copyFixture() {
  const c = copyRepo();
  ROOTS.push(c.root);
  return c;
}
// 改副本里的一个 JSON 数据文件（rel 相对仓库根，斜杠分隔）。
export function editJson(fx, rel, mutate) {
  const p = join(fx.repo, rel);
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  mutate(doc);
  writeUnderTempRoot(fx.root, relative(fx.root, p).split(sep).join('/'), JSON.stringify(doc, null, 1));
}
// 用副本里的 server-plugin 装配一局（加载期的错误从这里抛出）。
export async function bootFixture(fx) {
  const mod = await import(pathToFileURL(join(fx.repo, 'server-plugin', 'index.mjs')).href);
  return mod.init(express.Router(), { saveRoot: newRoot('s2-0c1-fixture-save-') });
}

// —— 结果与状态的通用读法 ——
export const isOk = (r) => r?.ok === true || r?.result === 'ok';
export const codeOf = (r) => String(r?.code ?? r?.error?.code ?? '');
export const stateJson = (s) => JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
const isInput = (e) => e.kind === 'command' || e.kind === 'advance';

export function snapshot(world) {
  return { clock: world.state.clock.minute, json: stateJson(world.state), logLen: world.logBook.entries.length, created: Object.keys(world.state.created ?? {}) };
}

// 拒收：state 与时钟不动；日志恰多一条输入条目与一条拒绝事件（卷二:545）。code 缺省时只断言拒收。
export function assertRejected(world, before, r, code) {
  assert.equal(isOk(r), false, `应被拒收：${JSON.stringify(r)}`);
  if (code) assert.ok(codeOf(r).includes(code), `拒收码应为 ${code}，实得 ${codeOf(r)}`);
  assert.equal(world.state.clock.minute, before.clock, '拒收时时钟不动');
  assert.equal(stateJson(world.state), before.json, '拒收时 state 逐位不变');
  const added = world.logBook.entries.slice(before.logLen);
  assert.equal(added.filter(isInput).length, 1, '拒收时日志恰多一条输入条目');
  const events = added.filter((e) => !isInput(e));
  assert.equal(events.length, 1, '拒收时日志恰多一条拒绝事件');
  assert.equal(events[0].ok, false, '拒绝事件应为 ok:false');
}

// —— 开局、建 NPC、终止 ——
export const offered = (world) => {
  const a = world.menu(null).affordances.find((x) => (x.act ?? x.id) === 'act_choose_origin');
  assert.ok(a, '开局菜单应含 act_choose_origin');
  assert.ok(Array.isArray(a.slots?.origin), 'act_choose_origin 应给出 origin 候选');
  return a.slots.origin;
};
// 开局：act_choose_origin 带 species、lodge 等槽（候选下标，与线协议菜单口径一致）。
export const chooseRow = (world, rowId) => world.act({
  act: 'act_choose_origin',
  slots: { species: 0, origin: offered(world).indexOf(rowId), place: 0, lodge: 0 },
});
// 带可穿戴起始物的来历（数据推出；起始物挂 comp_wearable 的物品）。
export function rowWithWearable(world) {
  for (const rowId of offered(world)) {
    const items = ORIGIN_ENTRIES[PERSON_ROWS[rowId].origin].startingItems ?? [];
    if (items.some((s) => (ITEM_ROWS[s.item]?.classes ?? []).includes('comp_wearable'))) return rowId;
  }
  assert.fail('候选来历中应有带可穿戴起始物的来历（数据推出）');
  return null;
}
// 以来历行建一个 person（create 提案，种族取数据推出的有心智物种）；返回新实体 id。
export function createNpc(world, rowId) {
  const before = new Set(Object.keys(world.state.created ?? {}));
  const r = world.submitProposal({ effects: [{ op: 'create', kind: 'person', template: rowId, facts: { species: SAPIENT_SPECIES } }] });
  assert.equal(isOk(r), true, `以来历行建 person 应成功：${JSON.stringify(r)}`);
  const added = Object.keys(world.state.created ?? {}).filter((id) => !before.has(id) && world.state.created[id].kind === 'person');
  assert.equal(added.length, 1, 'create 应恰新增一个 person');
  return added[0];
}
// 前提：开一局（化身），再以同一带穿戴来历建 NPC。返回 NPC id 与来历行。
export async function setupNpc(world) {
  const rowId = rowWithWearable(world);
  const before = snapshot(world);
  const r = await chooseRow(world, rowId);
  assert.equal(isOk(r), true, `开局选来历应成功：${JSON.stringify(r)}`);
  assert.ok(Object.keys(world.state.created).some((id) => !before.created.includes(id)), '开局应新建化身');
  const id = createNpc(world, rowId);
  return { id, rowId };
}
export const destroy = (world, id) => world.submitProposal({ effects: [{ op: 'destroy', entity: id }] });

// —— 日志窗口与事件 ——
// 自 logLen 起的日志条目（一次提案的全部事件与输入）。
export const windowSince = (world, logLen) => world.logBook.entries.slice(logLen);
export const eventsOf = (entries) => entries.filter((e) => e.kind === 'event' && e.ok === true);
export const terminatedEvent = (entries) => {
  const evs = eventsOf(entries).filter((e) => e.verb === TERM_VERB);
  assert.equal(evs.length, 1, '终止应恰有一条 verb_entity_terminated');
  return evs[0];
};

// —— 持有边：现役边由持有变化事件推出（卷十八 R18-1.11） ——
export function liveEdges(world) {
  const live = new Map();
  for (const e of world.logBook.entries) {
    if (e.kind !== 'event' || e.ok !== true || e.verb !== HOLD_VERB) continue;
    const p = e.payload ?? {};
    if (p.change === 'established' || p.change === 'transferred') live.set(p.edge, { edge: p.edge, kind: p.kind, holder: p.holder, subject: p.subject });
    else if (p.change === 'ended') live.delete(p.edge);
  }
  return [...live.values()];
}

// —— 账户与台账 ——
export function accountEntries(state) {
  const out = [];
  for (const [holder, byPurpose] of Object.entries(state.accounts ?? {})) {
    for (const [purpose, byRes] of Object.entries(byPurpose ?? {})) {
      for (const [res, byKey] of Object.entries(byRes ?? {})) {
        for (const [key, v] of Object.entries(byKey ?? {})) {
          assert.equal(typeof v, 'number', '账户余额应为 integer（struct:holderAccounts）');
          out.push({ holder, purpose, res, key, amount: v });
        }
      }
    }
  }
  return out;
}
export const sumOf = (list) => list.reduce((s, e) => s + e.amount, 0);
// 每种资源的世界总量（全部账户余额之和，按资源种类分）。
export function sumByRes(state) {
  const out = {};
  for (const e of accountEntries(state)) out[e.res] = (out[e.res] ?? 0) + e.amount;
  return out;
}
// 守恒式（卷六:365）：该资源全部账户余额之和 = 各来源累计 − 各去处累计。
export function assertConserved(state, res) {
  const t = state.ledgerTotals?.[res] ?? {};
  let inflow = 0;
  let outflow = 0;
  for (const [code, v] of Object.entries(t)) {
    const cum = typeof v === 'number' ? v : v?.cumulative;
    if (code.startsWith('src_')) inflow += cum;
    else if (code.startsWith('sink_')) outflow += cum;
  }
  const bal = sumOf(accountEntries(state).filter((e) => e.res === res));
  assert.equal(bal, inflow - outflow, `资源 ${res} 违反守恒式（卷六:365）`);
}

// 逐位比较用规范形式（键按字典序）。
export const canon = (v) => JSON.stringify(v, (_k, x) => {
  if (typeof x === 'bigint') return `${x}n`;
  if (x && typeof x === 'object' && !Array.isArray(x)) return Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]));
  return x;
});
