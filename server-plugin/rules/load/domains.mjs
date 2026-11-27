// 各域装配登记的静态清单（S2-SH 草案 §3）：每个域的 rules/<域>/manifest.mjs 在此静态 import、按 domain 升序列出；mount.mjs 按此次序收齐各字段。
// 只用静态 import：动态 import 不在门禁全局闭集内（tools/accept/detectors/import_edge.mjs），也不进入口可达图（tools/entry-registry.mjs）。
// 加一个域：加一行 import、列表加一项。各域导出名为 <域>_MANIFEST（同名导出会被门禁 pp_dup_export 判重）。
import { KernelError } from '../../kernel/errors.mjs';
import { BODY_MANIFEST } from '../body/manifest.mjs';
import { ECONOMY_MANIFEST } from '../economy/manifest.mjs';
import { SOCIAL_MANIFEST } from '../social/manifest.mjs';
import { TRAVEL_MANIFEST } from '../travel/manifest.mjs';

// 一个域的装配登记（字段全部可省）：终止清理、终止发起方、建档实例化登记项，推进钩子，原语写者（S2-L R0）。装配期核对是固定断言，不在这里，由 mount.mjs 按名直调。
/** @typedef {{domain: string, terminationCleanups?: ReadonlyArray<unknown>, terminationTriggers?: ReadonlyArray<unknown>, instantiators?: ReadonlyArray<unknown>, advanceHooks?: ReadonlyArray<unknown>, primitiveWriters?: ReadonlyArray<unknown>}} Manifest */

/**
 * 清单核对（加载时一次）：domain 须严格升序（即有序且不重名），不合即 E-DIM-DUPLICATE-KEY。
 * @param {ReadonlyArray<Manifest>} list @returns {ReadonlyArray<Manifest>}
 */
function orderedDomains(list) {
  list.forEach((m, i) => {
    if (i > 0 && !(list[i - 1].domain < m.domain)) throw new KernelError('E-DIM-DUPLICATE-KEY', {}, `rules/load/domains.mjs: domain ${m.domain} out of order or duplicated after ${list[i - 1].domain}`);
  });
  return Object.freeze(list);
}

export const DOMAINS = orderedDomains([BODY_MANIFEST, ECONOMY_MANIFEST, SOCIAL_MANIFEST, TRAVEL_MANIFEST]);
