// 环境场一步的纯算法（卷二十 §4.7.3 第 1、3、8、9 条；格子迁移 G14）：地点层背景与泡内细格增量共用的"一层一步"，不读状态、不写状态、不认场代号与层别。
// 调用方（env-fields.mjs）把状态读成 items，把相接关系、风向、降水等读成回调，本文件只做定点算术：
//   锚点闭式读数、同时求值、拆分末份取差、随风加权、蔓延入出、纯衰减段不写、低于 epsilon 即删、泡边出流与收起共用的每格权重式。
// 全程 10⁸ 标度的 BigInt（det-math 的 fixedMultiply8、fixedDivide8、fixedPow），向零截断；没有 Math.*；权重在 10⁴ 标度（fixedScale）下求；角度（angleBetweenDeg）以 JS 数进出，但值是 10⁴ 标度内的小数，经 fixedUnits 逐位往返。
// 随风权重取法：先算被减项 (1 − windBias) × θ ÷ 半圈 再向零截断后相减，即权重向上取整到 10⁴ 标度（卷二十 :854 的"权重在 10⁴ 下各求一次"，参考值与定点实现读同一个数）。
//
// 已定（理由在后）：
// 1. 一步 stepLayer 对 items 的快照同时求值：每个（节点，场）的旧读数都取自传入的 items，不读本步别处的新值；结果按（节点 id，场代号）字典序给出，所以与传入次序无关（卷二十 :835、不变量 ⑤⑨⑯）。
// 2. 锚点在 minute 之前须整步对齐且至少一步（k ≥ 1）：k = (minute − at) ÷ stepMinutes。k 为 0 或不整除抛错，不静默按零步算。理由：卷二十 :838 的"旧强度＝读数(k − 1)"对 k = 0 无定义。
// 3. 删除：状态存储没有删除原语（卷二 §2.6 只有 writePath）。结果里 op 为 'delete'，由写者落成"该项缺席"（细格增量在 fieldCellMap 里去掉这一键，地点背景写 value 为 0 的锚点，读侧一律当没有这一项）。理由：与 grid-diff.mjs 写全空差分同一办法。
// 4. 误差界（卷二十 :841–:849 的 E、m 递推）不是运行期状态（锚点只有 {value, at}），归卡内测试用精确有理数对照（tests/kernel/field-step.test.mjs）；本文件不算 E。
import { splitLastRemainder, fixedUnits, fixedUnits8, fixedMultiply8, fixedDivide8, fixedPow, fixedScale } from './kernel/det-math.mjs';
import { E } from './kernel/handles/generated.mjs';

/** 蔓延目标的种类（调用方给的 kind 字段取这三个值之一，node 是缺省的同层目标）。 */
export const TARGET = Object.freeze({ node: 'node', sky: 'sky', outside: 'outside' });

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function deny(code, detail) {
  const e = new Error(`${code} ${detail}`);
  e.code = code;
  e.fields = {};
  return e;
}

/**
 * 锚点在 minute 那一步结束时的读数（卷二十 :838 闭式）：value × fixedPow(d, j)，j = (minute − at) ÷ stepMinutes，j 为 0 就是 value。
 * @param {{value8: bigint, at: number}} anchor @param {bigint} d8 `1 − decayPerStep`（10⁸ 标度） @param {number} stepMinutes @param {number} minute
 * @returns {bigint}
 */
export function anchorRead(anchor, d8, stepMinutes, minute) {
  const span = minute - anchor.at;
  if (!Number.isSafeInteger(span) || span < 0 || span % stepMinutes !== 0) throw deny(E.E_DIM_DOMAIN_RANGE, `anchorRead: minute ${minute} is not a whole number of steps after the anchor at ${anchor.at}`);
  const j = span / stepMinutes;
  return j === 0 ? anchor.value8 : fixedMultiply8(anchor.value8, fixedPow(d8, j));
}

/**
 * 拆分末份取差（卷二 §3.3"存量与余数结转"第 3 条；卷二十 :854）：目标已按次序排好，前几份各为 total × 权重 ÷ 权重合计（一次整除），末份取 total 减前几份之和。权重合计须为正。
 * @param {bigint} total @param {readonly bigint[]} weights @returns {bigint[]}
 */
export function splitShares(total, weights) {
  if (weights.length === 0) throw deny(E.E_DIM_DOMAIN_RANGE, 'splitShares: no targets');
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (sum <= 0n) throw deny(E.E_DIM_DOMAIN_RANGE, 'splitShares: weights must sum above 0');
  return splitLastRemainder(total, weights.slice(0, -1), sum); // 全书唯一一份拆分末份取差（kernel/det-math.mjs）
}

/**
 * 随风权重（卷二十 :854）：θ 取 [0, 半圈] 度，权重 = 1 −（1 − windBias）× θ ÷ 半圈，10⁴ 标度下一次求出；θ 未知（null）取四分之一圈。
 * 半圈、四分之一圈都由整圈度数（rules.grid.fullTurnDeg）派生，不写 180、90 字面量。
 * @param {number | null} thetaDeg 目标方向与风去向的夹角（度） @param {number} windBias rules.fields.windBias @param {number} fullTurnDeg
 * @returns {bigint}
 */
export function windWeight(thetaDeg, windBias, fullTurnDeg) {
  const turn = fixedUnits(fullTurnDeg);
  const half = turn >> 1n;
  const quarter = half >> 1n;
  const s4 = fixedScale();
  let theta = thetaDeg === null ? quarter : fixedUnits(thetaDeg);
  if (theta < 0n) theta = -theta;
  if (theta > half) theta = half;
  return s4 - ((s4 - fixedUnits(windBias)) * theta) / half;
}

/**
 * 两个方位角（度，整圈取模）的夹角，取 [0, 半圈]。
 * @param {number} aDeg @param {number} bDeg @param {number} fullTurnDeg @returns {number}
 */
export function angleBetweenDeg(aDeg, bDeg, fullTurnDeg) {
  const turn = fixedUnits(fullTurnDeg);
  const half = turn >> 1n;
  let d =(fixedUnits(aDeg) - fixedUnits(bDeg)) % turn;
  if (d < 0n) d += turn;
  if (d > half) d = turn - d;
  return Number(d) / Number(fixedScale());
}

/**
 * 泡边出流与收起共用的每格权重式（卷二十 :873、:879）：`(量 ÷ n_c) × (a_c ÷ A_Q)`，两次整除（÷n_c、a ÷ A）与最后的乘法都在 10⁸ 标度下向零截断。
 * n 为 0 时这一项为 0、不做除法（卷二十 :875、:879：读法与收起）。泡边出流（:873）的 n_c 下限 1 由出流调用方（stepLayer）取，不在本函数里替调用方垫底。a、A 是平面面积（m²），A 须为正。
 * @param {bigint} amount8 @param {number | bigint} nc @param {number} areaA @param {number} areaTotal @returns {bigint}
 */
export function foldShare(amount8, nc, areaA, areaTotal) {
  const n = BigInt(nc);
  if (n < 1n) return 0n;
  const per = amount8 / n;
  const q = fixedDivide8(fixedUnits8(areaA), fixedUnits8(areaTotal));
  return fixedMultiply8(per, q);
}

/**
 * 一层一步（卷二十 §4.7.3 第 1、3 条；泡内增量同式，第 8 条）。
 * @param {object} spec
 * @param {number} spec.minute 本步分钟（须与 stepMinutes 对齐）
 * @param {number} spec.stepMinutes
 * @param {bigint} spec.epsilon8
 * @param {number} spec.windBias @param {number} spec.fullTurnDeg
 * @param {Map<string, {d8: bigint, rate8: bigint, quench8: bigint, advected: boolean, byproducts: ReadonlyArray<readonly [string, bigint]>}>} spec.fields 场代号 → 本步用到的行参数（比例都是 10⁸ 标度）
 * @param {Map<string, Map<string, {value8: bigint, at: number}>>} spec.items 节点 → 场 → 锚点（只含强度大于 0 的项）
 * @param {Map<string, Map<string, bigint>>} [spec.extraIns] 别层同一步记给本层节点的蔓延入（泡边出流，见返回的 outsideIn）
 * @param {Iterable<string>} spec.emissionNodes 本步有直接排放的节点（没有给空表）
 * @param {(node: string, field: string) => bigint} spec.emission 本步该节点该场的直接排放合计（10⁸ 标度；没有为 0）
 * @param {(node: string) => bigint} spec.precipStep8 本步降水（毫米，10⁸ 标度）
 * @param {(node: string) => bigint} spec.skyFactor8 压制项再乘的露天份额（地点层给 1）
 * @param {(node: string) => number | null} spec.windDirDeg 该节点此刻随风的去向（度）；不随风（本地 openSky 为 0）或方向未知为 null
 * @param {(node: string, field: string) => ReadonlyArray<{key: string, kind: 'node' | 'sky' | 'outside', id?: string, pass8?: bigint, bearingDeg?: number | null, nc?: number, a?: number, A?: number}>} spec.targets
 *   蔓延目标（已按 spec.whenRX 筛过），key 是排序键（地点 id 或格键）；kind node 收 `分到的量 × pass8`（泡内格层 pass8 取 1）；sky 是散入物化层之上、整份计入开放度损失；
 *   outside 是泡外目标格：分到一份，按每格权重式（nc、a、A）记入 id 那个地点的蔓延入，不计开放度损失。
 * @returns {{writes: Array<{node: string, field: string, op: 'set' | 'delete', value8: bigint, at: number}>, records: Array<{node: string, field: string, out: bigint, inSum: bigint, loss: bigint}>, outsideIn: Map<string, Map<string, bigint>>}}
 */
export function stepLayer(spec) {
  const { minute, stepMinutes, epsilon8, windBias, fullTurnDeg, fields, items } = spec;
  if (!Number.isSafeInteger(stepMinutes) || stepMinutes < 1 || minute % stepMinutes !== 0) throw deny(E.E_CLOCK_CADENCE, `stepLayer: minute ${minute} is not aligned to ${stepMinutes}`);
  const one8 = fixedUnits8(1);
  const row = (f) => {
    const r = fields.get(f);
    if (r === undefined) throw deny(E.E_DIM_REF_MISSING, `stepLayer: field ${f} has no row`);
    return r;
  };
  // 快照读数：节点 → 场 → {prev: 读数(k − 1), now: 读数(k)}
  const reads = new Map();
  for (const [node, byField] of items) {
    const m = new Map();
    for (const [f, a] of byField) {
      const r = row(f);
      const span = minute - a.at;
      if (span < stepMinutes || span % stepMinutes !== 0) throw deny(E.E_DIM_DOMAIN_RANGE, `stepLayer: anchor ${node}/${f} at ${a.at} is not a whole step before ${minute}`);
      m.set(f, { prev: anchorRead(a, r.d8, stepMinutes, minute - stepMinutes), now: anchorRead(a, r.d8, stepMinutes, minute) });
    }
    reads.set(node, m);
  }
  const acc = new Map(); // 节点 → 场 → {emit, bp, out, ins}
  const cell = (node, f) => {
    if (!acc.has(node)) acc.set(node, new Map());
    const m = acc.get(node);
    if (!m.has(f)) m.set(f, { emit: 0n, bp: 0n, out: 0n, ins: 0n });
    return m.get(f);
  };
  const outsideIn = new Map();
  const records = [];
  const nodeIds = [...items.keys()].sort(cmp);
  // 直接排放与副产（副产取来源场读数(k − 1) × 份额，转入同一节点的对方场）。
  for (const node of nodeIds) {
    for (const [f, rd] of reads.get(node)) {
      const r = row(f);
      for (const [to, share8] of r.byproducts) cell(node, to).bp += fixedMultiply8(rd.prev, share8);
    }
  }
  for (const node of spec.emissionNodes === undefined ? [] : spec.emissionNodes) {
    for (const f of [...fields.keys()].sort(cmp)) {
      const e = spec.emission(node, f);
      if (e !== 0n) cell(node, f).emit += e;
    }
  }
  // 蔓延：每个有读数的（节点，场）按上一步读数求蔓延出，拆给目标。
  for (const node of nodeIds) {
    const fieldIds = [...reads.get(node).keys()].sort(cmp);
    for (const f of fieldIds) {
      const r = row(f);
      const out = fixedMultiply8(reads.get(node).get(f).prev, r.rate8);
      const targets = [...spec.targets(node, f)].sort((x, y) => cmp(x.key, y.key));
      // 一对相接的地点（格）只算一个目标（卷二十 :854）：调用方给了重复 key 即拒，不静默算成两份。
      if (targets.some((t, i) => i > 0 && t.key === targets[i - 1].key)) throw deny(E.E_DIM_STRUCT_FIELD, `stepLayer: duplicate target key for ${node}/${f}`);
      if (out === 0n || targets.length === 0) continue;
      const wind = r.advected ? spec.windDirDeg(node) : null;
      let weights = targets.map((t) => (wind === null ? 1n : windWeight(t.bearingDeg === undefined || t.bearingDeg === null ? null : angleBetweenDeg(t.bearingDeg, wind, fullTurnDeg), windBias, fullTurnDeg)));
      if (weights.reduce((a, b) => a + b, 0n) === 0n) weights = targets.map(() => 1n);
      const shares = splitShares(out, weights);
      let inSum = 0n;
      targets.forEach((t, i) => {
        if (t.kind === TARGET.sky) return;
        if (t.kind === TARGET.outside) {
          inSum += shares[i];
          // 出流的 n_c 下限 1（卷二十 :873，只防除数为 0；源格本身在格层里，实际不会为 0）。
          const credit = foldShare(shares[i], t.nc < 1 ? 1 : t.nc, t.a, t.A);
          if (!outsideIn.has(t.id)) outsideIn.set(t.id, new Map());
          const m = outsideIn.get(t.id);
          m.set(f, (m.get(f) === undefined ? 0n : m.get(f)) + credit);
          return;
        }
        const got = fixedMultiply8(shares[i], t.pass8 === undefined ? one8 : t.pass8);
        inSum += got;
        cell(t.id, f).ins += got;
      });
      cell(node, f).out += out;
      records.push({ node, field: f, out, inSum, loss: out - inSum });
    }
  }
  // 别层（泡内格层）同一步记给本层节点的泡边出流：计入蔓延入，这些项与本层自己的蔓延入同在一步求值。
  if (spec.extraIns !== undefined) for (const [id, m] of spec.extraIns) for (const [f, v] of m) cell(id, f).ins += v;
  // 新读数。
  const writes = [];
  const touched = [...new Set([...acc.keys(), ...items.keys()])].sort(cmp);
  for (const node of touched) {
    const fieldIds = [...new Set([...(acc.has(node) ? acc.get(node).keys() : []), ...(items.has(node) ? items.get(node).keys() : [])])].sort(cmp);
    for (const f of fieldIds) {
      const r = row(f);
      const old = reads.has(node) && reads.get(node).has(f) ? reads.get(node).get(f) : null;
      const t = acc.has(node) && acc.get(node).has(f) ? acc.get(node).get(f) : { emit: 0n, bp: 0n, out: 0n, ins: 0n };
      const precip = spec.precipStep8(node);
      const quench = precip !== 0n ? fixedMultiply8(fixedMultiply8(r.quench8, precip), spec.skyFactor8(node)) : 0n;
      const idle = t.emit === 0n && t.bp === 0n && quench === 0n && t.out === 0n && t.ins === 0n;
      if (old !== null && idle) {
        if (old.now < epsilon8) writes.push({ node, field: f, op: 'delete', value8: 0n, at: minute });
        continue;
      }
      let v = (old === null ? 0n : old.now) + t.emit + t.bp - quench - t.out + t.ins;
      if (v < 0n) v = 0n;
      if (v < epsilon8) {
        if (old !== null) writes.push({ node, field: f, op: 'delete', value8: 0n, at: minute });
        continue;
      }
      writes.push({ node, field: f, op: 'set', value8: v, at: minute });
    }
  }
  return { writes, records, outsideIn };
}

/** 工具：items 的复制（测试与调用方打乱次序时用）。@param {Map<string, Map<string, object>>} items @returns {Map<string, Map<string, object>>} */
export function cloneItems(items) {
  if (!isObj(items) && !(items instanceof Map)) throw deny(E.E_DIM_STRUCT_FIELD, 'cloneItems: items must be a Map');
  return new Map([...items].map(([n, m]) => [n, new Map([...m].map(([f, a]) => [f, { ...a }]))]));
}
