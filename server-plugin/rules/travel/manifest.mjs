// travel 域的装配登记（S2-SH 草案 §3；S2-P）：本域交给 mount 的原语写者（move），经 rules/load/domains.mjs 收齐。
import { MOVE_WRITER } from './position.mjs';

export const TRAVEL_MANIFEST = Object.freeze({
  domain: 'travel',
  primitiveWriters: Object.freeze([MOVE_WRITER]),
});
