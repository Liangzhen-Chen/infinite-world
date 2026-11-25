// kernelApi `effects(engine, state, familyId, ctx)`（卷二 §2.7 :581，callers ["rules"]，acceptsState: true；§3.9 :1482）。
// 效果族求值入口，纯函数：只读加载结果里的族行与编好的 RX 树，返回输出清单；不写 state，不 import 任何写入口。
// 执行由原语层做（卷九），写入由声明写者做；本文件不认任何族 id、原语名或输出种类的具体取值（族是数据，加一行不改本文件）。
//
// ctx：{params: {参数代号: 数}, dims: {维度键: 基值}, nsReads?: {命名空间读数键: 值}, target?: id, fields?: {登记的 ctx 字段: id}}。
// 调用方先按族的 `params` 声明传参（键须已声明、值在 domain 内，否则 E-EFF-PARAM）；`dims` 是 RX 要读的基值维度，
// `nsReads` 是调用方经 §3.9 :1479 登记读入口预取并冻结的读数；读不到的值由求值器报 E-MOD-RX。
// 返回：outputs 声明的逐条结果（数组，顺序同声明）；每条是声明字段原样 + RX 求值，不加新字段，consent/cost/selector 不在返回内。

import { KernelError } from './errors.mjs';
import { evaluateRX } from './rx.mjs';
import { clone } from './clone.mjs';
import { EFFECT_MAGNITUDE, EFFECT_RX_SUFFIX, EFFECT_ID_PARAMS, EFFECT_ID_SOURCE_TARGET, EFFECT_ID_SOURCE_CTX } from './handles/markers.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {{effects?: {rows: Map<string, any>, rx: Map<string, any>}}} engine 统一加载器的结果
 * @param {unknown} _state 不读不写（纯函数；签名照卷二 :581 acceptsState: true）
 * @param {string} familyId
 * @param {{params?: Record<string, number>, dims?: Record<string, number | boolean | string>, nsReads?: Record<string, number | boolean | string>}} [ctx]
 */
export function effects(engine, _state, familyId, ctx = {}) {
  const table = engine && engine.effects;
  const row = table && table.rows instanceof Map ? table.rows.get(familyId) : undefined;
  const trees = row ? table.rx.get(familyId) : undefined;
  if (!row || !trees) throw new KernelError('E-EFF-FAMILY-UNKNOWN', {}, `family ${String(familyId)} is not in _effects.json`);

  // 调用参数：键在族声明内、值在 domain 内（§3.9 :1480）。
  const given = isObj(ctx.params) ? ctx.params : {};
  for (const [k, v] of Object.entries(given)) {
    const spec = Object.hasOwn(row.params, k) ? row.params[k] : undefined;
    if (!spec) throw new KernelError('E-EFF-PARAM', {}, `${familyId}: parameter ${k} is not declared`);
    if (typeof v !== 'number' || !Number.isFinite(v) || v < spec.domain[0] || v > spec.domain[1]) throw new KernelError('E-EFF-PARAM', {}, `${familyId}: parameter ${k}=${String(v)} outside domain [${spec.domain.join(', ')}]`);
  }

  const baseDims = isObj(ctx.dims) ? ctx.dims : {};
  // 命名空间读数：调用方经该行登记的读入口预取、冻结后传入（卷二 §3.9 :1479 勘误 1118k29）；只取本族 RX 引用到的键，每键一份，未引用的键不进求值。
  const passed = isObj(ctx.nsReads) ? ctx.nsReads : {};
  const nsReads = Object.fromEntries([...trees.nsRefs].filter((k) => Object.hasOwn(passed, k)).map((k) => [k, passed[k]]));
  const read = (tree, magnitude) => {
    const dim = { ...baseDims, ...given };
    if (magnitude !== undefined) dim[EFFECT_MAGNITUDE] = magnitude;
    return evaluateRX(tree, { dim }, nsReads);
  };
  // id 型参数的两种明文来源：选出的目标（ctx.target）、登记的 ctx 字段（ctx.fields.<字段>）；给不出即拒。
  const idOf = (source) => {
    const fields = isObj(ctx.fields) ? ctx.fields : {};
    const v = source === EFFECT_ID_SOURCE_TARGET ? ctx.target : fields[source.replace(EFFECT_ID_SOURCE_CTX, '')];
    if (typeof v !== 'string' || !v.length) throw new KernelError('E-EFF-PARAM', {}, `${familyId}: no value for id source ${source}`);
    return v;
  };

  const magnitude = trees.magnitude ? read(trees.magnitude) : undefined;
  // 照 outputs 声明逐条返回，顺序同声明：每条 = 声明的字段原样 + 其 RX 求出的数值（`<名>RX` → `<名>`，`paramsRX` → `params`，id 型参数并入 params），不加新字段（卷二 §3.9 :1482 勘误 1118k29）。
  return row.outputs.map((out, i) => {
    const t = trees.outputs[i];
    const o = {};
    for (const [k, v] of Object.entries(out)) if (!k.endsWith(EFFECT_RX_SUFFIX) && k !== EFFECT_ID_PARAMS) o[k] = clone(v);
    for (const [name, tree] of Object.entries(t.values)) o[name] = read(tree, magnitude);
    if (t.params || t.ids) {
      o.params = Object.fromEntries(Object.entries(t.params || {}).map(([k, tree]) => [k, read(tree, magnitude)]));
      for (const [k, source] of Object.entries(t.ids || {})) o.params[k] = idOf(source);
    }
    return o;
  });
}
