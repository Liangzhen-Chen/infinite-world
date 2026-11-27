// social 域的装配登记（S2-SH 草案 §3；S2-H）：本域交给 mount 的终止清理（协议乙）、建档实例化（来历起始物）与原语写者（holding.*），经 rules/load/domains.mjs 收齐。
// 装配期核对（checkHoldingKinds、checkOutfitTables）是固定断言，由 mount.mjs 按名直调。
import { SUBJECT_END_CLEANUP, HOLDING_WRITER } from './holdings.mjs';
import { OUTFIT_INSTANTIATOR } from './outfit.mjs';

export const SOCIAL_MANIFEST = Object.freeze({
  domain: 'social',
  terminationCleanups: Object.freeze([SUBJECT_END_CLEANUP]),
  instantiators: Object.freeze([OUTFIT_INSTANTIATOR]),
  primitiveWriters: Object.freeze([HOLDING_WRITER]),
});
