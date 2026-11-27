// S2-L（最小账本）黑盒验收支撑。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2l。
// 只提供四类东西：临时根与仓库副本（夹具）、产品入口的薄包装（开局、选来历、提案、推进）、
// 从状态读账户与台账（形状取自 named-structs.json 的 struct:holderAccounts，分隔符取自 ledger.json）、从 world/ 数据读期望值。
// 不 mock 任何内核、规则或入口；前提全部由真实动作造；期望值的 id、数额、单位都从 world/ 读，不写死。
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

// —— 数据（期望值来源）——
export const VOCAB = dimension('_vocab.json').families;
export const ORIGIN_ENTRIES = VOCAB.origin.entries;
export const VERB_IDS = Object.keys(VOCAB.verb.entries);
export const PERSON_ROWS = dimension('person.json').rows;
export const PLACE_ROWS = dimension('place.json').rows;
export const ITEM_ROWS = dimension('item.json').rows;
// 资源种类表是数组形状 {rows:[{key, value}]}（卷六 :104；world/rules/tables/economy/resources.json）。
export const RESOURCE_ROWS = loadJson(join(WORLD, 'rules/tables/economy/resources.json')).rows;
export const RESOURCE_IDS = RESOURCE_ROWS.map((r) => r.key);
export const PRIMITIVES = loadJson(join(WORLD, 'ontology/primitives.json')).primitives;
const UNITS = dimension('_units.json').units;
const siOf = (id) => UNITS.find((u) => u.id === id)?.si;
// 一日分钟数 = 单位表 day.si ÷ minute.si，不写 1440。
export const DAY_MIN = siOf('day') / siOf('minute');
// 限额通道的来源代号（卷六 :377 规则 6；src 族 entries 里的 src_genesis）。
export const GENESIS = 'src_genesis';

// 钱的资源种类：有 src_genesis 来源、物品为 item_coin_* 的第一行（数据推出，不写死 id）。
export const COIN_RES = RESOURCE_ROWS.find((r) => r.value.sources?.includes(GENESIS)
  && String(VOCAB.resource.entries[r.key]?.item ?? '').startsWith('item_coin_')).key;
export const COIN_ITEM = VOCAB.resource.entries[COIN_RES].item;

export const originOf = (rowId) => ORIGIN_ENTRIES[PERSON_ROWS[rowId].origin];
export const originIdOf = (rowId) => PERSON_ROWS[rowId].origin;
// 有起始钱的出身条目（数据推出）。
// 第二人建档的物种：物种表里 classes 含 comp_sapient 的首行（数据推出，不写 id）。
const SPECIES_ROWS = dimension('species.json').rows;
export const SAPIENT_SPECIES = Object.keys(SPECIES_ROWS).find((k) => SPECIES_ROWS[k].classes?.includes('comp_sapient'));
// 有起始钱的出身条目（数据推出）。
export const ORIGIN_IDS = Object.keys(ORIGIN_ENTRIES).filter((k) => typeof ORIGIN_ENTRIES[k].startingMoney === 'number');

// —— 临时根与夹具 ——
const ROOTS = [];
const newRoot = (prefix) => {
  const r = testTempRoot(prefix);
  ROOTS.push(r);
  return r;
};
export function cleanup() {
  for (const r of ROOTS.splice(0)) removeTempRoot(r);
}

// 干净开局：真 init，存档根为临时根。
export async function freshWorld() {
  const saveRoot = newRoot('s2l-save-');
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
  const saveRoot = newRoot('s2l-save-');
  return mod.init(express.Router(), { saveRoot });
}

// 夹具：把所有有起始钱的出身条目的 startingCoin 指向 coin（测的是数据通路，不是某个来历）。
export function pinAllOriginCoins(doc, coin) {
  for (const id of ORIGIN_IDS) doc.families.origin.entries[id].startingCoin = coin;
}

// —— 结果与状态的通用读法 ——
export const isOk = (r) => r?.ok === true || r?.result === 'ok';
export const codeOf = (r) => String(r?.code ?? r?.error?.code ?? '');
export const stateJson = (s) => JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
const isInput = (e) => e.kind === 'command' || e.kind === 'advance';

export function snap(world) {
  return {
    clock: world.state.clock.minute,
    created: Object.keys(world.state.created ?? {}).sort(),
    json: stateJson(world.state),
    logLen: world.logBook.entries.length,
  };
}

// 拒收：state 与时钟不动；日志恰多一条输入条目与一条拒绝事件，事件的 seq 等于结果的 seq（卷二:545）。
// code 缺省时只断言拒收，不断言具体码（卡文未规定码的情形）。
export function assertRejected(world, before, r, code) {
  assert.equal(isOk(r), false, `应被拒收：${JSON.stringify(r)}`);
  if (code) assert.ok(codeOf(r).includes(code), `拒收码应为 ${code}，实得 ${codeOf(r)}`);
  assert.equal(world.state.clock.minute, before.clock, '拒收时时钟不动');
  assert.equal(stateJson(world.state), before.json, '拒收时 state 逐位不变');
  const added = world.logBook.entries.slice(before.logLen);
  const inputs = added.filter(isInput);
  const events = added.filter((e) => !isInput(e));
  assert.equal(inputs.length, 1, '拒收时日志恰多一条输入条目');
  assert.equal(events.length, 1, '拒收时日志恰多一条拒绝事件');
  assert.equal(events[0].kind, 'event');
  assert.equal(events[0].ok, false, '拒绝事件应为 ok:false');
  assert.equal(events[0].seq, r.seq, '拒绝事件的 seq 应为结果的请求编号');
}

// —— 开局与动作 ——
// 开局菜单里选来历的候选（person 来历行 id 的数组，下标即 act 的 origin 槽值）。
export function offered(world) {
  const a = world.menu(null).affordances.find((x) => (x.act ?? x.id) === 'act_choose_origin');
  assert.ok(a, '开局菜单应含 act_choose_origin');
  assert.ok(Array.isArray(a.slots?.origin), 'act_choose_origin 应给出 origin 候选');
  return a.slots.origin;
}
export const chooseOrigin = (world, index) =>
  world.act({ act: 'act_choose_origin', slots: { species: 0, origin: index, place: 0, lodge: 0 } });

export const newPersons = (world, before) => Object.keys(world.state.created ?? {})
  .filter((id) => !before.created.includes(id) && world.state.created[id].kind === 'person');

// 以来历行为模板建 person（create 提案；species 事实为种族候选之一，与选来历动作的种族槽同口径；第 0 日内经 endow 入账）。
export const createPerson = (world, rowId, species) =>
  world.submitProposal({ effects: [{ op: 'create', kind: 'person', template: rowId, facts: { species } }] });

// 开一局、选第一个候选来历，再以同一来历行建第二个 person（同币种对方户）。
export async function setupTwo(world) {
  const rowId = offered(world)[0];
  const species = SAPIENT_SPECIES;
  const before = snap(world);
  const r = await chooseOrigin(world, 0);
  assert.equal(isOk(r), true, `选来历应成功：${JSON.stringify(r)}`);
  const [avatar] = newPersons(world, before);
  assert.ok(avatar, '选来历应新建化身');
  const b2 = snap(world);
  const c = await createPerson(world, rowId, species);
  assert.equal(isOk(c), true, `第 0 日以来历模板建第二个 person 应成功：${JSON.stringify(c)}`);
  const [other] = newPersons(world, b2);
  assert.ok(other, '建第二个 person 应新增一个 person 实体');
  return { avatar, other, rowId, species, r };
}

// —— 账户与台账 ——
// 账户串分隔符：rules.economyLedger 的 account 行的 sep 字段（world/rules/tables/economy/ledger.json，S2-L 主会话 Q5 甲，不用代码常量）。
export function accountSep() {
  const rows = loadJson(join(WORLD, 'rules/tables/economy/ledger.json')).rows;
  const rule = rows.find((r) => r.key === 'account');
  assert.equal(typeof rule?.value?.sep, 'string', 'ledger.json 应有 account 规则行，其 sep 为分隔符字串');
  return rule.value.sep;
}
// 余额形状取自 world/ontology/named-structs.json 的 struct:holderAccounts（卷二 §1.5 :245）：
// state.accounts.<持有人>.<用途>.<资源种类>.<资源键> = integer；账户串为 [持有人, 用途, 资源种类, 资源键] 以分隔符连接（卷二 :249）。
export function accountEntries(state) {
  const out = [];
  const sep = accountSep();
  for (const [holder, byPurpose] of Object.entries(state.accounts ?? {})) {
    for (const [purpose, byRes] of Object.entries(byPurpose ?? {})) {
      for (const [res, byKey] of Object.entries(byRes ?? {})) {
        for (const [key, v] of Object.entries(byKey ?? {})) {
          assert.equal(typeof v, 'number', '账户余额应为 integer（struct:holderAccounts）');
          out.push({ str: [holder, purpose, res, key].join(sep), amount: v, holder, res });
        }
      }
    }
  }
  return out;
}
export const accountsFor = (state, holder, res) => accountEntries(state).filter((e) => e.holder === holder && e.res === res);
export function acctKey(state, holder, res) {
  const found = accountsFor(state, holder, res);
  assert.equal(found.length, 1, `持有人 ${holder} 的 ${res} 户应恰一个，实得 ${found.length}`);
  return found[0].str;
}
export const balance = (state, holder, res) => {
  const found = accountsFor(state, holder, res);
  return found.length === 0 ? null : found.reduce((s, e) => s + e.amount, 0);
};
export const sumBalances = (state, res) => accountEntries(state)
  .filter((e) => e.res === res).reduce((s, e) => s + e.amount, 0);
export const cumOf = (v) => (typeof v === 'number' ? v : v?.cumulative);
export const totalsOf = (state, res) => state.ledgerTotals?.[res] ?? {};
// 守恒式（卷六 :365）：该资源全部普通账户余额之和 = 各来源累计 − 各去处累计。
export function assertConserved(state, res) {
  const t = totalsOf(state, res);
  let inflow = 0; let outflow = 0;
  for (const [code, v] of Object.entries(t)) {
    if (code.startsWith('src_')) inflow += cumOf(v);
    else if (code.startsWith('sink_')) outflow += cumOf(v);
  }
  assert.equal(sumBalances(state, res), inflow - outflow, `资源 ${res} 违反守恒式（卷六:365）`);
}
