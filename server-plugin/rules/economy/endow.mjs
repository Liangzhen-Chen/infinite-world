// 开局随身钱经账本真实入账（S2-L 草案 §5；卷四 G-5 出身给予经账本；卷六 §4.22 规则 3 开局 src_genesis 只在第 0 日）。
// create 原语建 person 行后，在同一事务里经 engine.lifecycle.instantiate 按 state-owners systems.endow.instantiate 路由到这里（sortKey 排在 body 域建档补全之后）：
// 读新个体出身维度（沿模板继承）所指出身条目的起始钱枚数与钱种，开户后以一笔 post 从来源入账。被拒（窗口外、代号未登记）即整笔回滚，选来历如实被拒。
// 参数全在 rules.economyLedger.endowment（来源、用途、事由、所读字段名）；不按来历 id 分支，凡带非零起始钱的出身条目同一路。
import { KernelError } from '../../kernel/errors.mjs';
import { kindOfEntity } from '../../kernel/storage.mjs';
import { dim } from '../../kernel/dimensions.mjs';
import { ruleValue } from '../load/registry.mjs';
import { headerOf } from '../body/body-plan.mjs';
import { registerInstantiator } from '../lifecycle/terminate.mjs';
import { LEDGER, openAccount, post } from './ledger.mjs';

const ENDOWMENT = 'endowment';
const UNKNOWN_READ = 'E-DIM-UNKNOWN-READ';
const CAPPED_DIRECT = 'E-LEDGER-CAPPED-DIRECT';
// 窗口外的去处（主会话 Q10 甲：第 0 日后出生的个体，起始钱改由亲属 transfer，等家户与出生卡）。
const UNBUILT_LATER_BIRTH = '卷十八家户卡与出生卡（第 0 日之后出生的个体起始钱由亲属 transfer）';

/**
 * 出身起始钱入账（systems.endow.instantiate 的处理函数；签名同建档实例化 handler(engine, state, entityId, tx)）：
 * 出身维度读不到或显式为空（卷四 :226 没有出身类别）、出身条目没写起始钱或为 0，即不入账；否则开 (个体, endowment.purpose, 钱种, 新批次) 账户，
 * post 两腿 {来源 endowment.source, 钱种, n} 与 {账户, +n}，事由 endowment.reason，refs 带出身条目与个体。
 * 限额通道被拒（第 0 日后）原码照抛，消息写明等家户与出生卡（主会话 Q10 甲）。
 * @param {import('./ledger.mjs').LedgerEngine} engine @param {import('./ledger.mjs').LedgerState} state @param {string} personId @param {unknown} tx
 */
export function endowFromOrigin(engine, state, personId, tx) {
  const e = Object(ruleValue(engine.docData, LEDGER, ENDOWMENT));
  const kind = kindOfEntity(engine, state, personId);
  const family = headerOf(engine, kind, e.originDimension).vocab;
  if (typeof family !== 'string') throw new KernelError('E-DIM-STRUCT-FIELD', {}, `${kind}.${e.originDimension}: header must declare a ref vocab family`);
  let origin;
  try {
    origin = dim(engine, state, kind, personId, e.originDimension).value;
  } catch (err) {
    if (err instanceof KernelError && err.code === UNKNOWN_READ) return;
    throw err;
  }
  if (origin === null) return;
  const entries = Object(Object(Object(Object(engine.vocab).families)[family]).entries);
  const ent = Object(Object.hasOwn(entries, origin) ? entries[origin] : undefined);
  const n = ent[e.moneyField];
  if (n === undefined || n === 0) return;
  const coin = ent[e.coinField];
  const account = openAccount(engine, state, personId, { kind: coin }, e.purpose, tx);
  try {
    post(engine, state, { legs: [{ source: e.source, resource: coin, qty: n }, { account, delta: n }], reason: e.reason, refs: { origin, holder: personId } }, tx);
  } catch (err) {
    if (err instanceof KernelError && err.code === CAPPED_DIRECT) throw new KernelError(CAPPED_DIRECT, {}, `${err.message}; starting money of ${personId} (${origin}) waits for ${UNBUILT_LATER_BIRTH}`);
    throw err;
  }
}

/** 开局入账的登记项（systems.endow.instantiate；economy 域 manifest 收齐）。 */
export const ENDOW_INSTANTIATOR = registerInstantiator('rules/economy/endow.mjs#endowFromOrigin', endowFromOrigin);
