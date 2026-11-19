// 状态谓词单点（规则层）：卷二《维度表规范与统一入口》§2.5 :510–:511、§1.11 :352。唯一通用谓词 `can`，两个派生谓词 `awake`、`capacity`，
// 已终止谓词 `terminated`（别名 `dead`，唯一定义）。全部只在本文件；别的卷与文件只调用，不自读 `rules.capacity`、status_family 条目的
// `terminal / incapacitating / suppressesAwake` 三字段、state.terminated（卷四 P-5、§3.2 :413；门禁 vol2.K5-24、vol2.K6-24）。
// 读 `bodyView().dims`（body.* 能力，唯一出处在 body.mjs）、`rules.capacity` 阈值表与 statusView 各实例的族条目；实现里不出现任何族 id、容器 id 或能力 id。
// 阈值表 `rules.capacity` 卷文只给形状、没给数值：登在 unbuilt 的键读到即按未知交出（原因 'unbuilt'），不编数、不以常数代替（卷二 §1.6）。
// 返回形状（自定，卷文只说"真假""full|limited|none"）：`can`、`awake` → {ok, known, reason}；`capacity` → {level, known, reason}；
// `terminated` → {ok, reason}（卷二 :511）。known 为假即读不出来（ok、level 无意义，reason 说明缺什么）。

import { readPath } from './kernel/storage.mjs';
import { P, E } from './kernel/handles/generated.mjs';
import { bodyView } from './body.mjs';
import { statusView } from './status.mjs';

// 卷文定名：capability 族名；阈值表 rules.capacity 的键（卷二 §2.5 :510）；清醒读 body.consciousness（卷二 §1.11 :351）。
const S = Object.freeze({
  rules: Object.freeze({ table: 'capacity', unbuilt: 'unbuilt', awakeMin: 'awakeMin', full: 'full', limited: 'limited' }),
  awakeDim: 'consciousness',
  flag: Object.freeze({ terminal: 'terminal', incapacitating: 'incapacitating', suppressesAwake: 'suppressesAwake' }),
});
// 读不出来或判不了时的 reason 记号（本文件定名）。
const WHY = Object.freeze({ unbuilt: 'unbuilt', unknownValue: 'unknown_value', noBody: 'no_body' });

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// 登记码错误（形状同 kernel/errors.mjs#KernelError，kernel/transaction.mjs 的 codeOf 按 e.code 认）。
function deny(code, detail) {
  const e = new Error(`${code} ${detail}`);
  e.code = code;
  e.fields = {};
  return e;
}

const unknown = (reason) => Object.freeze({ ok: false, known: false, reason });
const decided = (ok, reason) => Object.freeze({ ok, known: true, reason: ok ? null : reason });

// 族条目的一个布尔字段（族代号经词表索引取条目，所属族由状态表 family 维度的 ref vocab 在加载期保证）；
// 条目或字段不合（数据错误，加载期 checkBodyTables 已核每条必写布尔）照抛，不当 false。
function familyFlag(engine, family, field) {
  const rec = engine.vocab && engine.vocab.index instanceof Map ? engine.vocab.index.get(family) : undefined;
  const entry = rec ? rec.entry : undefined;
  if (!isObj(entry) || typeof entry[field] !== 'boolean') throw deny(E.E_DIM_UNKNOWN_READ, `status family ${family}: boolean field ${field} not readable`);
  return entry[field];
}

// 主体名下第一个族条目 field 为真的状态实例（statusView 保持写入次序，取最先的）。
function firstWithFlag(engine, state, subject, field) {
  return statusView(engine, state, subject).instances.find((inst) => familyFlag(engine, inst.family, field));
}

// rules.capacity 的一个键：登在 unbuilt 返回 undefined（按未知）；既没登记又没值是数据错误，照抛。
function threshold(engine, key) {
  const t = isObj(engine.rules) && isObj(engine.rules[S.rules.table]) ? engine.rules[S.rules.table] : undefined;
  if (t && Array.isArray(t[S.rules.unbuilt]) && t[S.rules.unbuilt].includes(key)) return undefined;
  if (!t || t[key] === undefined) throw deny(E.E_DIM_UNKNOWN_READ, `rules.${S.rules.table}.${key} is neither set nor registered in rules.${S.rules.table}.${S.rules.unbuilt}`);
  return t[key];
}

/**
 * `terminated(engine, state, subject)`（卷二 §2.5 :511）：实体是否已过终止协议。返回 {ok, reason}：ok 为真即已终止。
 * 读两样：终止标记 state.terminated[subject]（reason 是终止原因的 verb 代号）；终止标记尚未写入时，主体名下带 `terminal` 族的状态实例
 * （reason 是该实例的状态代号）。复生窗口期内终止标记还在，照常为真；只有复生步骤删去标记后才为假。两样都没有 {ok: false, reason: null}。
 * @param {object} engine @param {object} state @param {string} subject
 * @returns {{ok: boolean, reason: string | null}}
 */
export function terminated(engine, state, subject) {
  const mark = readPath(state, P.terminated(subject));
  if (mark !== undefined) return { ok: true, reason: mark.cause };
  const hit = firstWithFlag(engine, state, subject, S.flag.terminal);
  return hit ? { ok: true, reason: hit.status } : { ok: false, reason: null };
}

/** 同一函数的第二个导出名（:511"dead 与 terminated 是同一个函数的两个导出名"）。 */
export const dead = terminated;

// body.* 各能力的 Fact；主体没有可读的身体图返回 null。
function bodyDims(engine, state, subject) {
  const v = bodyView(engine, state, subject);
  return v ? v.dims : null;
}

/**
 * `can(engine, state, subject, capabilityId)`（卷二 §2.5 :510，唯一通用谓词）：主体能否用某项身体能力（capability 族条目代号）。
 * 主体名下有 `incapacitating` 族的状态实例即 {ok: false, reason: 该实例的状态代号}（§1.11 :352）；没有身体图 {ok: false, reason: 'no_body'}；
 * 否则按 body.<该能力 dimKey> 的值：值读不出为未知，值 > 0 为能，等于 0 为不能（reason 取能力代号）。
 * 卷文没给一般能力的阈值（rules.capacity 只管 consciousness、moving、manipulation 三项的 full、limited 档），"值 > 0"是自定口径，见 docs/卡回报/ds-b6-5.md。
 * @param {object} engine @param {object} state @param {string} subject @param {string} capabilityId
 * @returns {{ok: boolean, known: boolean, reason: string | null}}
 */
export function can(engine, state, subject, capabilityId) {
  const rec = engine.vocab && engine.vocab.index instanceof Map ? engine.vocab.index.get(capabilityId) : undefined;
  // 能力条目的判据是它带 dimKey（卷四 §2.4 :283），不比较族名字面量。
  if (!rec || typeof rec.entry.dimKey !== 'string') throw deny(E.E_DIM_REF_MISSING, `can: ${capabilityId} is not a capability entry (no dimKey)`);
  const blocker = firstWithFlag(engine, state, subject, S.flag.incapacitating);
  if (blocker) return decided(false, blocker.status);
  const dims = bodyDims(engine, state, subject);
  if (!dims) return decided(false, WHY.noBody);
  const f = dims[rec.entry.dimKey];
  if (!f || !f.known) return unknown(WHY.unknownValue);
  return decided(f.value > 0, capabilityId);
}

/**
 * `awake(engine, state, subject)`（卷二 §2.5 :510、§1.11 :351–:352）：`body.consciousness ≥ rules.capacity.awakeMin`，且主体名下没有
 * `suppressesAwake` 族的状态实例（有则 {ok: false, reason: 该实例的状态代号}）。没有身体图 {ok: false, reason: 'no_body'}；阈值未建或能力值读不出为未知。
 * @param {object} engine @param {object} state @param {string} subject
 * @returns {{ok: boolean, known: boolean, reason: string | null}}
 */
export function awake(engine, state, subject) {
  const blocker = firstWithFlag(engine, state, subject, S.flag.suppressesAwake);
  if (blocker) return decided(false, blocker.status);
  const dims = bodyDims(engine, state, subject);
  if (!dims) return decided(false, WHY.noBody);
  const min = threshold(engine, S.rules.awakeMin);
  if (min === undefined) return unknown(WHY.unbuilt);
  const f = dims[S.awakeDim];
  if (!f || !f.known) return unknown(WHY.unknownValue);
  return decided(f.value >= min, S.awakeDim);
}

/**
 * `capacity(engine, state, subject)`（卷二 §2.5 :510）：full | limited | none，按 `rules.capacity.full` 的各项能力值全部 ≥ 阈值取 full，
 * 否则 `limited` 的各项全部 ≥ 阈值取 limited，否则 none。阈值键集取阈值表自己（不在这里点名能力）。没有身体图 {level: 'none'}；
 * 阈值未建（full 或 limited 登在 unbuilt）或任一用到的能力值读不出为未知（level null）。
 * @param {object} engine @param {object} state @param {string} subject
 * @returns {{level: 'full' | 'limited' | 'none' | null, known: boolean, reason: string | null}}
 */
export function capacity(engine, state, subject) {
  const dims = bodyDims(engine, state, subject);
  if (!dims) return Object.freeze({ level: 'none', known: true, reason: WHY.noBody });
  const full = threshold(engine, S.rules.full);
  const limited = threshold(engine, S.rules.limited);
  if (full === undefined || limited === undefined) return Object.freeze({ level: null, known: false, reason: WHY.unbuilt });
  const keys = [...new Set([...Object.keys(full), ...Object.keys(limited)])].sort();
  for (const k of keys) if (!dims[k] || !dims[k].known) return Object.freeze({ level: null, known: false, reason: WHY.unknownValue });
  const meets = (table) => Object.keys(table).every((k) => dims[k].value >= table[k]);
  const level = meets(full) ? 'full' : meets(limited) ? 'limited' : 'none';
  return Object.freeze({ level, known: true, reason: null });
}
