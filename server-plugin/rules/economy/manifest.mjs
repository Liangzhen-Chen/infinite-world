// economy 域的装配登记（S2-SH 草案 §3；S2-L）：本域交给 mount 的建档实例化（开局随身钱入账）与原语写者（transfer），经 rules/load/domains.mjs 收齐。
// 装配期核对（checkLedgerTables）与守恒核对（conservationCheck）是固定断言，由 mount.mjs 按名直调。
import { ENDOW_INSTANTIATOR } from './endow.mjs';
import { TRANSFER_WRITER } from './ledger.mjs';

export const ECONOMY_MANIFEST = Object.freeze({
  domain: 'economy',
  instantiators: Object.freeze([ENDOW_INSTANTIATOR]),
  primitiveWriters: Object.freeze([TRANSFER_WRITER]),
});
