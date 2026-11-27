// body 域的装配登记（S2-SH 草案 §3）：本域交给 mount 的终止清理、终止发起方、建档实例化登记项，经 rules/load/domains.mjs 收齐。
// 装配期核对（checkBodyPlans）是固定断言，不是按域登记项，仍由 mount.mjs 按名直调（主会话 11-27 裁定丁）。
import { SETTLE_BODY_CLEANUP, DIE_BY_DESTROY_TRIGGER } from './death.mjs';
import { PERSON_INSTANTIATOR } from './person.mjs';

export const BODY_MANIFEST = Object.freeze({
  domain: 'body',
  terminationCleanups: Object.freeze([SETTLE_BODY_CLEANUP]),
  terminationTriggers: Object.freeze([DIE_BY_DESTROY_TRIGGER]),
  instantiators: Object.freeze([PERSON_INSTANTIATOR]),
});
