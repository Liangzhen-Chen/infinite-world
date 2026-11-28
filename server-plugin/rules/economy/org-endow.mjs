// 组织开局公库入账（S2-TP1；接口稿 draft-s2-tp §3 甲；卷六 §4.22 规则 3 :1260 开局 src_genesis 只在第 0 日；卷八 §2.6 :328 公库缺省分区）。
// 参数全在 rules.economyLedger.orgEndowment（来源、事由、所读维度名）与 rules.polity.rolesPurposes.general（公库缺省分区）；不按组织 id 分支，凡写了开局公库的组织同一路。
// 同 endow.mjs 出身起始钱的写法：开户后以一笔 post 从来源入账，守恒由账本 post 保证；第 0 日之后限额通道拒（E-LEDGER-CAPPED-DIRECT），原码照抛。
import { dim } from '../../kernel/dimensions.mjs';
import { ruleValue } from '../load/registry.mjs';
import { orgIdsOf, ORG_KIND } from '../polity/govern.mjs';
import { LEDGER, openAccount, post } from './ledger.mjs';

const ORG_ENDOWMENT = 'orgEndowment';
const POLITY = 'polity';
const PURPOSES = 'rolesPurposes';
const GENERAL = 'general';

/**
 * endowOrgs：对每个组织（升序）读 orgEndowment.fundsDimension 维度（资源 → 枚数，空表即没有），逐资源（升序）非零的开 (组织, 公库缺省分区, 资源, 新批次) 账户并 post 入账。
 * 值为 0 的项没有钱可入，不开户（主会话 TP 补裁丁：怪物社会开局公库未找到数，写 0 不入账）。
 * @param {import('../polity/govern.mjs').PolityEngine} engine @param {object} state @param {unknown} tx
 */
export function endowOrgs(engine, state, tx) {
  const e = Object(ruleValue(engine.docData, LEDGER, ORG_ENDOWMENT));
  const purpose = Object(ruleValue(engine.docData, POLITY, PURPOSES))[GENERAL];
  for (const org of orgIdsOf(engine)) {
    const funds = Object(dim(engine, state, ORG_KIND, org, e.fundsDimension).value);
    for (const resource of Object.keys(funds).sort()) {
      const n = funds[resource];
      if (n === 0) continue;
      const account = openAccount(engine, state, org, { kind: resource }, purpose, tx);
      post(engine, state, { legs: [{ source: e.source, resource, qty: n }, { account, delta: n }], reason: e.reason, refs: { holder: org } }, tx);
    }
  }
}
