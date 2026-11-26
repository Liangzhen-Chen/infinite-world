// 意图收窄与执行前段（卷九 §4.3 resolve 九段的 S1 子集：shape、precondition（whenRX）、effects；无检定、无报价、无同意；S1-3a，S1-3 接口草案 §2.2）。
// resolveIntent(engine, state, intent)：意图 {act, actor?, slots?: {槽位: 候选编号}, numbers?: {槽位: 整数}} → 效果原语提案 {effects, intent}；
// 候选编号经 candidatesOf 换成 id（与菜单投影同一函数，R9-1.2）；效果经效果族求值（effects.mjs），提案由调用方交 submitProposal 落事务。
// 只认行字段，不按动作、槽位或族代号分支。被拒返回 {ok:false, code}，不写状态、不进日志。

import { KernelError, reportError } from '../../kernel/errors.mjs';
import { shapeOf, whenHolds } from './catalog.mjs';
import { effects } from './effects.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @param intent 意图：act、actor（可缺省或空即无行动者，开局建档）、slots、numbers
 * @returns {{ok: true, proposal: {effects: Array<Record<string, unknown>>, intent: Record<string, unknown>}} | {ok: false, code: string}}
 */
export function resolveIntent(engine, state, intent) {
  try {
    if (!engine.actions) throw new KernelError('E-ACT-UNKNOWN', {}, 'no action catalog in this world data');
    if (!isObj(intent) || typeof intent.act !== 'string') throw new KernelError('E-ACT-UNKNOWN', {}, 'intent needs an act code');
    const row = engine.actions.rows.get(intent.act);
    if (!row) throw new KernelError('E-ACT-UNKNOWN', {}, `act ${JSON.stringify(intent.act)} not in catalog`);
    const actor = intent.actor === undefined || intent.actor === null ? null : intent.actor;
    if (actor !== null && typeof actor !== 'string') throw new KernelError('E-ACT-SLOT', {}, 'actor must be an id or null');
    const { values, tables } = shapeOf(engine, state, row.id, intent, actor);
    if (!whenHolds(engine, state, row.id, { actor, slots: values }, true)) throw new KernelError('E-ACT-PRECONDITION', {}, `${row.id}: whenRX does not hold`);
    const ctx = { actor, target: actor, slot: values, slotTable: tables };
    const prims = row.calls.flatMap((call) => effects(engine, state, call.family, ctx).map((out) => ({ op: out.op, ...out.params })));
    // intent 随提案记进日志条目，供复演与追溯（草案 §2.2）；内核只读 effects。槽位值已换成 id 与整数。
    return { ok: true, proposal: { effects: prims, intent: { act: row.id, actor, slots: values } } };
  } catch (e) {
    return { ok: false, code: String(reportError(e)) };
  }
}
