// 开局建筑资产入账应用器（卷六 §4.1 规则 5 :370、§4.22 规则 3；卷十 R10-3.9）：genOpeningAssets（gen/holdings-open.mjs）交出的 entries 在世界创建事务内、第 0 日，
// 经账本已有的限额通道结算入口 settleCappedAllocation 入账（来源 src_genesis，规则 3 :1242、卷十 R10-1.9 第 0 日账户余额在存档状态里），不另造通道、不直写 accounts：
// 每栋建筑一笔"一万基点的建筑份额"记到 owner 名下（账户键 = 持有人 + 用途 + 资源种类 + 设施实例键）。卷十八的"所有"持有边对建筑是账本的只读投影（卷六 :1078），这里不写持有边。
// 资源种类、来源、用途、原因、满额基点都从规则表与词表派生，不写代号字面量：
//   资源种类 = 资源种类表里 family 是建筑资产族的那一行（:112 一族只一行，找不到或多于一行即拒）；来源 = 该行 sources 里登记为限额通道（bm_capped）的那一个（恰一个，否则拒）；
//   用途 = rules.polity.rolesPurposes.general（开局持有的缺省分区）；原因 = rules.polity.genHoldCause（开局的动词，卷八 1123k42）；一栋的满额 = kernelConstants.BPS（一万基点，卷六 :366）。
// 入账量必须等于提案量：第 0 日窗口外（限额按零计）或同日同来源已经入过账，都不静默吞掉，拒收（E-DIM-DOMAIN-RANGE）。
// 持有人有没有被载入、是不是能持有，由账本逐腿核（E-DIM-UNKNOWN-READ 等）；缺口（推不出 owner 的）在生成器里就已不进 entries，所以"缺口不入账"。
// 写在调用方已开的世界创建事务上（同 holdings.mjs、holdcalls.mjs）。

import { KernelError } from '../errors.mjs';
import { settleCappedAllocation, SCHEMA } from '../ledger.mjs';
import { clockView } from '../scheduler.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function need(cond, why) {
  if (!cond) throw new KernelError('E-DIM-REF-MISSING', {}, `opening assets: ${why}`);
}

/**
 * 建筑资产的入账口径（资源种类、来源、用途、原因、满额基点），全部从规则表与词表派生。
 * @param {any} engine
 * @returns {{kind: string, source: string, purpose: string, reason: string, fullBp: number}}
 */
export function openingAssetChannel(engine) {
  const rows = engine.rules[SCHEMA.resourcesTable];
  const kinds = Object.keys(isObj(rows) ? rows : {}).filter((k) => rows[k].family === SCHEMA.assetFamily).sort();
  need(kinds.length === 1, `resource table must have exactly one ${SCHEMA.assetFamily} row (found ${kinds.length})`);
  const kind = kinds[0];
  const sources = rows[kind].sources.filter((s) => (engine.vocab.index.get(s) || { entry: {} }).entry.budgetMode === SCHEMA.capped);
  need(sources.length === 1, `${kind} must list exactly one ${SCHEMA.capped} source (found ${sources.length})`);
  const polity = engine.rules.polity;
  need(isObj(polity) && isObj(polity.rolesPurposes) && typeof polity.rolesPurposes.general === 'string', 'rules.polity.rolesPurposes.general is missing');
  need(isObj(polity) && typeof polity.genHoldCause === 'string', 'rules.polity.genHoldCause is missing');
  const bps = engine.rules.kernelConstants && engine.rules.kernelConstants.BPS;
  need(Number.isSafeInteger(bps) && bps > 0, 'kernelConstants.BPS is missing');
  return { kind, source: sources[0], purpose: polity.rolesPurposes.general, reason: polity.genHoldCause, fullBp: bps };
}

/**
 * @param {any} engine @param {any} state
 * @param {Array<{building: string, owner: string, via?: string}>} entries genOpeningAssets 交出的入账提案（building 即资产分录的设施实例键）
 * @returns {{booked: number, written: Array<{building: string, owner: string}>}} booked：本次入账的基点总量（空提案为 0，不入账）
 */
export function applyOpeningAssets(engine, state, entries) {
  if (entries.length === 0) return { booked: 0, written: [] };
  const ch = openingAssetChannel(engine);
  const day = clockView(engine, state).day;
  const r = settleCappedAllocation(engine, state, {
    resourceKind: ch.kind, code: ch.source, day, limit: null, reason: ch.reason,
    requests: entries.map((e) => ({ key: e.building, qty: ch.fullBp })),
    targets: entries.map((e) => ({ key: e.building, account: { holder: e.owner, purpose: ch.purpose, resource: { kind: ch.kind, key: e.building } } })),
  });
  const expected = entries.length * ch.fullBp;
  if (r.alreadyBooked || r.booked !== expected) {
    throw new KernelError('E-DIM-DOMAIN-RANGE', {}, `opening assets: booked ${r.booked} of ${expected} basis points on day ${day} (${r.alreadyBooked ? `${ch.source} already booked today` : `${ch.source} window is closed or limited`}); opening assets are one day-0 posting`);
  }
  return { booked: r.booked, written: entries.map((e) => ({ building: e.building, owner: e.owner })) };
}
