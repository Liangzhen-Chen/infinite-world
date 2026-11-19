// 批次的转移、拆并与腐坏锚点重设（卷三乙《物态类别与物品》§4.4.3 K-3 批次拆并先陈后新、K-4 转移不改 taint；§4.12.3 P-1 条件变化才重设锚点；
// §3.3 唯一写者表：`stockLots.…spoilage / rotAnchorDay`、`itemInstances.<id>.spoilage / rotAnchorDay` 的声明写者是本文件；块 6 第 6-3 张）。
// 本文件的函数在以本文件为节点的事务里调（runTransaction 的 file 是 item-lots.mjs），腐坏字段经 writePath 写；账本腿经 post、批次合并经 mergeLots（账本写批次与 taint）。
// 不认任何物品、资源、类别代号；先后读批次键序号与腐坏进度，判合并读规则表与批次属性。数值运算一律在内核（item-state.mjs），本文件只编排。

import { lotsView, rotStep, lotMergeVerdict, lotKeyCompare, rottenLots, itemOfResource } from './kernel/item-state.mjs';
import { post, mergeLots } from './kernel/ledger.mjs';
import { clockView } from './kernel/scheduler.mjs';
import { writePath, readPath } from './kernel/storage.mjs';
import { emit } from './kernel/events.mjs';
import { registerAdvanceHook } from './kernel/advance-registry.mjs';
import { P, V } from './kernel/handles/generated.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const fail = (code, why) => Object.assign(new Error(`${code} ${why}`), { code, fields: {} });

// 腐坏字段落在批次与实例上的写入：值是 rotStep 的重设提案（当日值、当日锚点）。
function writeLotRot(state, account, lotKey, proposal) {
  writePath(state, P.stockLots_spoilage(account.holder, account.purpose, account.kind, lotKey), proposal.spoilage);
  writePath(state, P.stockLots_rotAnchorDay(account.holder, account.purpose, account.kind, lotKey), proposal.rotAnchorDay);
}

/**
 * 重设一个批次的腐坏锚点（P-1：换地点、换容器、批次拆并等条件变化时，把当日值写回、锚点日设为当日）。
 * 已是当日锚点、整件不可腐、当日值读不出（环境未接线，不编数）都不写，返回 false；写了返回 true。
 * @param {object} engine @param {object} state @param {{account: {holder: string, purpose: string, kind: string}, lotKey: string}} ref
 */
export function reanchorLot(engine, state, ref) {
  const r = rotStep(engine, state, ref, 0);
  if (r.reanchor === null) return false;
  writeLotRot(state, ref.account, ref.lotKey, r.reanchor);
  return true;
}

/**
 * 可腐实例的腐坏初值（卷三乙 §2.3、§3.3：spoilage、rotAnchorDay 的声明写者是本文件）：建实例之后在以本文件为节点的事务里落下初值与锚点日（今日）；已有值再写即拒。
 * @param {object} engine @param {object} state @param {string} instanceId @param {number} spoilage 取值域 [0,1]
 */
export function initInstanceRot(engine, state, instanceId, spoilage) {
  if (typeof spoilage !== 'number' || !(spoilage >= 0 && spoilage <= 1)) throw fail('E-DIM-DOMAIN-RANGE', 'spoilage is a number in [0, 1]');
  if (readPath(state, P.itemInstances_spoilage(instanceId)) !== undefined) throw fail('E-VIEW-UNDECLARED-WRITE', 'spoilage initial value is written once');
  writePath(state, P.itemInstances_spoilage(instanceId), spoilage);
  writePath(state, P.itemInstances_rotAnchorDay(instanceId), clockView(engine, state).day);
}

/**
 * 重设一件可腐实例的腐坏锚点（同 reanchorLot；实例的 spoilage、rotAnchorDay 同一写者同一条规则，卷三乙 §3.3）。
 * @param {object} engine @param {object} state @param {string} instanceId
 */
export function reanchorInstance(engine, state, instanceId) {
  const r = rotStep(engine, state, instanceId, 0);
  if (r.reanchor === null) return false;
  writePath(state, P.itemInstances_spoilage(instanceId), r.reanchor.spoilage);
  writePath(state, P.itemInstances_rotAnchorDay(instanceId), r.reanchor.rotAnchorDay);
  return true;
}

// 先陈后新（K-3）：腐坏进度高的先出；进度相同或读不出（按 0 排，不编数、不改变先后规则）的，批次键序号小的先出（序号承担先后，§2.3）。
function outOrder(engine, lots) {
  return [...lots].sort((a, b) => {
    const sa = a.spoilage.known ? a.spoilage.value : 0;
    const sb = b.spoilage.known ? b.spoilage.value : 0;
    return sb - sa || lotKeyCompare(engine, a.lotKey, b.lotKey);
  });
}

/**
 * 物品转移（K-3、K-4）：从 from 账户转 qty 件某物到 to 账户，一笔 post。
 * 转出：按先陈后新选批次（腐坏进度最高的先出，同进度序号小的先出），一批不够再取下一批；各批出账腿配一条拆出腿（splitFrom：属性原样带出，taint 不改，K-4）。
 * 转入：新批次落地后，凡与 to 账户里已有批次判得同键、同一腐坏档且进度差不超 mergeMaxGap 的并入已有批次（先把两批锚点重设到当日，再按质量加权平均，批次合并由账本写，
 * taint 在合并时按质量加权）；其余分立，所以快坏透的货并不进新鲜货里去。新批次与转出后剩下的批次因换了账户与拆分，腐坏锚点重设到当日（P-1）。
 * 余额不足整笔拒（E-LEDGER-NEGATIVE，由 post 报）。返回 {moved: [{from: 批次键, to: 批次键, qty}], merged: [{into, from}]}。
 * @param {object} engine @param {object} state
 * @param {{from: {holder: string, purpose: string}, to: {holder: string, purpose: string}, item: string, qty: number, reason: string, refs?: object}} t
 */
export function transferGoods(engine, state, t) {
  if (!isObj(t) || !isObj(t.from) || !isObj(t.to) || typeof t.item !== 'string' || !Number.isSafeInteger(t.qty) || t.qty < 1) throw fail('E-DIM-STRUCT-FIELD', 'transferGoods is {from, to, item, qty, reason, refs?}: qty a positive integer');
  const lots = outOrder(engine, lotsView(engine, state, t.from.holder, t.item, t.from.purpose));
  const have = lots.reduce((s, l) => s + l.qty, 0);
  if (have < t.qty) throw Object.assign(fail('E-LEDGER-NEGATIVE', `${t.from.holder} holds ${have} of ${t.item}, less than ${t.qty}`), { fields: { entity: t.from.holder } });
  const legs = [];
  const taken = [];
  let left = t.qty;
  for (const l of lots) {
    if (left === 0) break;
    const n = Math.min(l.qty, left);
    left -= n;
    legs.push({ account: { holder: t.from.holder, purpose: t.from.purpose, resource: { kind: l.kind, key: l.lotKey } }, delta: -n });
    taken.push({ lot: l, n, inLeg: legs.length });
    legs.push({ account: { holder: t.to.holder, purpose: t.to.purpose, resource: { kind: l.kind } }, delta: n, lot: { splitFrom: l.lotKey } });
  }
  const draft = { legs, reason: t.reason };
  if (t.refs !== undefined) draft.refs = t.refs;
  const res = post(engine, state, draft);
  const newKeys = new Map(res.lots.map(([i, key]) => [i, key]));
  const moved = [];
  const created = [];
  for (const x of taken) {
    const to = newKeys.get(x.inLeg);
    moved.push(Object.freeze({ from: x.lot.lotKey, to, qty: x.n }));
    created.push({ kind: x.lot.kind, key: to });
  }
  // 条件变化重设锚点：新批次（换了账户）与转出后仍有余量的原批次（被拆过）。
  for (const c of created) reanchorLot(engine, state, { account: { holder: t.to.holder, purpose: t.to.purpose, kind: c.kind }, lotKey: c.key });
  for (const x of taken) {
    if (x.n < x.lot.qty) reanchorLot(engine, state, { account: { holder: t.from.holder, purpose: t.from.purpose, kind: x.lot.kind }, lotKey: x.lot.lotKey });
  }
  // 转入合并：新批次并入 to 账户里先已存在、判得可合并的批次（按批次键序号升序取第一个可合并者）。
  const merged = [];
  for (const c of created) {
    const acct = { holder: t.to.holder, purpose: t.to.purpose, kind: c.kind };
    // 已并走的批次不在了（lotsView 读不到），本批次自己不是自己的并入对象；同一笔转入的先落地批次可以是后落地批次的并入对象。
    const peers = lotsView(engine, state, t.to.holder, t.item, t.to.purpose).filter((l) => l.kind === c.kind && l.lotKey !== c.key);
    for (const p of peers) {
      const v = lotMergeVerdict(engine, state, { account: acct, lotKey: p.lotKey }, { account: acct, lotKey: c.key });
      if (!v.ok) continue;
      mergeLots(engine, state, { holder: t.to.holder, purpose: t.to.purpose, kind: c.kind, into: p.lotKey, from: c.key });
      // 合并要求两批锚点都重设到当日（P-1）：合并后的进度就是两批当日值的加权平均，锚点日即今日。
      if (v.spoilage !== null) writeLotRot(state, acct, p.lotKey, { spoilage: v.spoilage, rotAnchorDay: clockView(engine, state).day });
      merged.push(Object.freeze({ into: p.lotKey, from: c.key }));
      break;
    }
  }
  return Object.freeze({ moved: Object.freeze(moved), merged: Object.freeze(merged) });
}

/**
 * 坏透结算（卷三乙 P-4，itemRot 钩子的工作）：清单里每个已坏透的整件可腐批次，整批出账、记入 sink_decay 汇（一笔 post，reason 是 verb_item_spoiled）。
 * 转腐殖类产物与不可腐份按 rawForm 留存要配方与 rawForm 数据（缺），这样的批次不在清单里、不结算，留在账上进度封顶 1（食用条件 eats 已把它挡在外面）。
 * 返回结算掉的批次数。
 * @param {object} engine @param {object} state
 */
export function settleRotted(engine, state) {
  const lots = rottenLots(engine, state);
  for (const l of lots) {
    post(engine, state, {
      legs: [
        { account: { holder: l.account.holder, purpose: l.account.purpose, resource: { kind: l.account.kind, key: l.lotKey } }, delta: -l.qty },
        { flow: V.sink.sink_decay, kind: l.account.kind, qty: l.qty },
      ],
      reason: V.verb.verb_item_spoiled,
    });
    // 同一事务内发 verb_item_spoiled（卷三乙 §2.8 :413：itemRot 在坏透结算的那一笔发出）；载荷里批次写成账户键加批次键（:409）。
    // 事件 id 的主体取批次键（同一持有人同一刻多批坏透各一条）。
    emit(engine, state, {
      minute: clockView(engine, state).minute,
      verb: V.verb.verb_item_spoiled,
      actor: null,
      targets: [],
      primitives: [],
      cause: V.verb.verb_item_spoiled,
      witnesses: [],
      visibility: 'private',
      payload: { instance: null, lot: { holder: l.account.holder, item: itemOfResource(engine, l.account.kind), purpose: l.account.purpose, lotKey: l.lotKey } },
    }, { rule: V.verb.verb_item_spoiled, subject: l.lotKey, position: 'pos.only' });
  }
  return lots.length;
}

// itemRot 推进钩子（卷三乙 §3.3 系统登记表：environment 阶段；节拍一日，见 rules.clock.cadence）：一拍结算一次坏透。
registerAdvanceHook('itemRot', 'item-lots.mjs', (engine, state) => { settleRotted(engine, state); });
