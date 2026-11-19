// 天气（卷二十 §4.3.3 第 1–4 条：天气单元解析、按种子的纯函数抽当日状态、权重、当日量）。李白 11-19 13:3x ①：前移第 1–4 条，规则子集全量；
// 第 5 条积雪、第 6 条现象、第 7 条干预、第 8 条排放往后排（读到按未知登记，见 rules.weather.unbuilt）。
// 状态 s 在单元 c 第 d 日的权重 = 单元 weatherCommonality[s] × weightRX_s 按 weightScale 定点成的整数（第 3 条）；锚段首日按权重直接抽，
// 段内第 k 日按"权重 × 持续性"抽：与前一日相同的状态乘该行 persistence，其余乘 rules.weather.persistBase（第 2 条）；抽取键 = 骰值键五段
// （worldSeed, streamCode, 单元 id, 该日起始分钟, 抽取点代号），求某日只从所在锚段段首递推，结果只与（种子，单元，日序）有关，与读取先后无关。
// 数据缺口（登记在 rules.weather.unbuilt 与各行 basis）：weightRX、persistence、cloud、precipMm、windMps、风向、precipPhaseFrom 旧数据没有；
// 缺哪一项，依赖它的读数按未知并带缺口，不拿别的状态或 0 兜底。不认任何天气代号（词表族 weather 的行全读字段）。字串字面量只有 ASCII。

import { KernelError } from './errors.mjs';
import { report } from './report.mjs';
import { minutesPerDay } from './scheduler.mjs';
import { normalizedSolarPhase } from './climate.mjs';
import { drawBelow } from './sample.mjs';
import { compileRXInScope, evaluateRX, nsKey, RxError } from './rx.mjs';
import { fixedUnits, fixedToNumber, fixedScale, fixedCurveAt } from './det-math.mjs';
import { VOCAB_RX_FIELDS } from './handles/markers.mjs';

const SCHEMA = Object.freeze({
  family: 'weather',
  table: 'weather',
  clockTable: 'clock',
  drawSites: 'drawSites',
  siteState: 'site.weather.state',
  siteSep: '.',
  codeSep: '_',
  solarNs: Object.freeze({ ns: 'env', arg: Object.freeze(['solarPhase']) }),
  // 季节曲线读数（李白 11-19 15:5x ⑤）：单元 climateProto → rules.climateProto 该行 seasonCurve[天气行]，在当日相位处取值，经 env.seasonCurve.<天气行> 交给 weightRX。
  seasonNs: 'env.seasonCurve',
  protoTable: 'climateProto',
  protoField: 'climateProto',
  protoCurves: 'seasonCurve',
  gapSide: 'weather',
});
const GAP = Object.freeze({
  cell: 'weather_cell',
  anchor: 'weather_anchor_days',
  scale: 'weather_weight_scale',
  persistBase: 'weather_persist_base',
  persistence: 'weather_persistence',
  weightRx: 'weather_weight_rx',
  zero: 'weather_weights_zero',
  seed: 'weather_world_seed',
  tempOffset: 'weather_temp_offset',
  cloud: 'weather_cloud',
  humidity: 'weather_humidity',
  climateProto: 'weather_climate_proto',
  seasonCurve: 'weather_season_curve',
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const present = (v) => v !== undefined && v !== null;

const unknownFact = (gaps) => {
  const list = [...new Set(gaps)].sort();
  for (const g of list) report('W-DIM-GAP', { side: SCHEMA.gapSide, field: g });
  return Object.freeze({ known: false, applicable: true, gaps: Object.freeze(list) });
};
const knownFact = (value, extra = {}) => Object.freeze({ known: true, applicable: true, value, ...extra });

/**
 * 天气单元解析（§4.3.3 第 1 条）：沿包含树，取最近的挂 comp_weather_cell 的祖先。chain 是从地点自身到根的 [{id, cell}]（包含树归卷五，由调用方交入），
 * cell 为 null 或缺即该节点没有单元；一个都没有即未知（每个地点必能解析到一个单元是卷二十 §2.7 的校验，这里不兜底）。
 * @param {{id: string, cell?: any}[]} chain
 */
export function weatherCellOf(chain) {
  for (const node of chain) if (present(node.cell)) return knownFact(node.id, { cell: node.cell });
  return unknownFact([GAP.cell]);
}

function weatherRows(engine) {
  const out = [];
  for (const [id, rec] of engine.vocab.index) if (rec.family === SCHEMA.family) out.push([id, rec.entry]);
  return out.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function drawSiteCode(engine) {
  const sites = engine.rules[SCHEMA.clockTable] && engine.rules[SCHEMA.clockTable][SCHEMA.drawSites];
  if (!Array.isArray(sites) || !sites.includes(SCHEMA.siteState)) throw new KernelError('E-DIM-REF-MISSING', {}, `rules.clock.drawSites lacks ${SCHEMA.siteState}`);
  return SCHEMA.siteState.split(SCHEMA.siteSep).join(SCHEMA.codeSep);
}

/** @type {Map<string, unknown>} 加载期编好的 weightRX 树（行代号 → 冻结树），由加载入口在全部校验通过后装入。 */
let compiled = new Map();

// 本文件在加载期编译的词表行 RX 字段：取 handles/markers.mjs VOCAB_RX_FIELDS 里本族那一行（定义源只一份）。
const WEIGHT_RX_FIELD = VOCAB_RX_FIELDS.find((f) => f.family === SCHEMA.family);

/**
 * 加载期编译词表族 weather 各行的 weightRX 文本（卷二 §2.9 第 4 条：数据档 RX 在加载校验处经 compileRXInScope 编，编不过报 E-MOD-RX；卷二十 §2.5 :276 weightRX）。
 * 行上没写 weightRX 的不编（缺值登记在 rules.weather.unbuilt，读到按未知）；写了但不是文本、或编不过的报错行（形状同 checkClockTables）。
 * @param {{vocab: {families: Map<string, {entries: Record<string, any>}>}, rxScope: any}} env 维度加载的 env
 * @returns {{trees: Map<string, unknown>, errors: Record<string, unknown>[]}}
 */
export function prepareWeatherRx(env) {
  const trees = new Map();
  const errors = [];
  const { family, field } = WEIGHT_RX_FIELD;
  const fam = env.vocab.families.get(family);
  const entries = fam && isObj(fam.entries) ? fam.entries : {};
  for (const id of Object.keys(entries).sort()) {
    const text = isObj(entries[id]) ? entries[id][field] : undefined;
    if (text === undefined) continue;
    const at = { level: 'L2', table: `_vocab.${family}`, row: id, dim: field, path: `_vocab.json#/families/${family}/entries/${id}/${field}` };
    if (typeof text !== 'string') { errors.push({ code: 'E-MOD-RX', ...at, got: typeof text, want: 'RX text' }); continue; }
    try { trees.set(id, compileRXInScope(text, 'data', env.rxScope).tree); } catch (e) {
      if (!e.code) throw e;
      errors.push({ code: e.code, ...at, got: text, want: e.message });
    }
  }
  return { trees, errors };
}

/**
 * 装入加载期编好的 weightRX 树（加载入口在全部校验通过后调，与 installScheduler 同法；kernel 组内用）。
 * @param {Map<string, unknown>} trees
 */
export function installWeather(trees) {
  compiled = new Map(trees);
  memo = new WeakMap();
}

// 某一日各状态的权重（BigInt 整数）；缺 weightRX 或 weightScale 即返回缺口名单。
// 单元所引气候原型的季节曲线（rules.climateProto 行的 seasonCurve）；单元没引原型或原型没建即 null（调用方按缺口）。
function protoCurves(engine, cell) {
  const proto = cell[SCHEMA.protoField];
  const table = engine.rules[SCHEMA.protoTable];
  if (!present(proto) || !isObj(table) || !isObj(table[proto]) || !isObj(table[proto][SCHEMA.protoCurves])) return null;
  return table[proto][SCHEMA.protoCurves];
}

function weightsOf(engine, rows, ctx, minute, scale) {
  const gaps = [];
  const out = [];
  const phase = normalizedSolarPhase(engine, { latitudeDeg: ctx.latitudeDeg }, minute);
  const curves = protoCurves(engine, ctx.cell);
  for (const [id, row] of rows) {
    const common = isObj(ctx.cell.weatherCommonality) ? ctx.cell.weatherCommonality[id] : undefined;
    if (!present(common) || common === 0) { out.push(0n); continue; }
    // 只读加载期编好的树（卷二 §2.9 第 4 条）；行上没写 weightRX、或没装加载产物，都按缺口，不读行上的文本。
    const tree = compiled.get(id);
    if (!present(row.weightRX) || tree === undefined) { gaps.push(GAP.weightRx); out.push(0n); continue; }
    if (!phase.known) { gaps.push(...phase.gaps); out.push(0n); continue; }
    const at = (BigInt(phase.num) * fixedScale()) / BigInt(phase.den);
    const reads = { [nsKey(SCHEMA.solarNs)]: fixedToNumber(at) };
    // 季节曲线读数只给原型里有曲线的行；单元没引原型、原型没建或缺本行曲线，weightRX 读到即缺读数，按缺口（不借别的原型）。
    if (curves !== null) for (const [rowId, pts] of Object.entries(curves)) {
      reads[nsKey({ ns: SCHEMA.seasonNs, arg: [rowId] })] = fixedToNumber(fixedCurveAt(pts.map(([x, y]) => [fixedUnits(x), fixedUnits(y)]), at));
    }
    let raw;
    try { raw = evaluateRX(tree, { dim: ctx.cell.staticDims || {}, clock: {} }, reads); } catch (e) {
      if (!(e instanceof RxError) || e.key === undefined) throw e;
      gaps.push(curves === null ? GAP.climateProto : GAP.seasonCurve); out.push(0n); continue;
    }
    if (typeof raw !== 'number' || raw < 0) throw new KernelError('E-WX-WEIGHT', {}, `weightRX of ${id} must give a number >= 0`);
    out.push((BigInt(common) * fixedUnits(raw) * BigInt(scale)) / fixedScale());
  }
  return { weights: out, gaps };
}

// 结果记忆（§4.3.3 第 2 条"结果可按（单元，日序，该单元改写记录条数）记忆，不入存档"）：同一份词表与规则、同一单元值对象、同一（种子，流，单元，纬度，
// 锚段首日）下，段内已递推出的各日状态留着，后求的日子从已推到处接着推。单元值现无改写写者，按对象同一认；重装 weightRX 树时整份清空。
// 只是省重算：每一步仍是同一个抽取键、同一个权重，结果与不记忆逐位相同，与读取先后无关。
let memo = new WeakMap();
function segmentOf(engine, ctx, start) {
  const level = (map, obj, make) => { let v = map.get(obj); if (v === undefined) { v = make(); map.set(obj, v); } return v; };
  const byKey = level(level(level(memo, engine.vocab, () => new WeakMap()), engine.rules, () => new WeakMap()), ctx.cell, () => new Map());
  return level(byKey, [ctx.worldSeed, ctx.streamCode, ctx.cellId, ctx.latitudeDeg, start].join(SCHEMA.siteSep), () => []);
}

/**
 * 单元 c 第 day 日（世界日序，整数 >= 0）的天气（§4.3.3 第 2–4 条）：返回 {state, tempOffsetC, cloud, humidity}，各为 Fact；
 * state 的 value 是天气行代号。ctx = {worldSeed, streamCode, cellId, latitudeDeg（权重表达式读 env.solarPhase 要半球归一；缺则那些行未知），cell: {weatherCommonality: {行代号: 整数}, climateProto: 气候原型代号, staticDims: {维度键: 数}}}。
 * 当日量取状态行字段：tempOffsetC、cloud、humidity；降水量、风速、风向的抽取（第 4 条前半）与降水相态没有分布数据、不前移，登记在 rules.weather.unbuilt。
 * @param {any} engine @param {any} ctx @param {number} day
 */
export function weatherAt(engine, ctx, day) {
  if (!Number.isSafeInteger(day) || day < 0) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, 'weatherAt: day must be a non-negative integer');
  const t = engine.rules[SCHEMA.table];
  const gaps = [];
  if (!isObj(t) || !Number.isSafeInteger(t.anchorDays)) gaps.push(GAP.anchor);
  if (!isObj(t) || !Number.isSafeInteger(t.weightScale)) gaps.push(GAP.scale);
  if (!present(ctx.worldSeed)) gaps.push(GAP.seed);
  if (gaps.length > 0) return unknownDay(gaps);
  const rows = weatherRows(engine);
  const perDay = minutesPerDay(engine);
  const site = drawSiteCode(engine);
  const start = day - (day % t.anchorDays);
  const seg = segmentOf(engine, ctx, start);
  let prev = seg.length > 0 ? seg[Math.min(seg.length, day - start + 1) - 1] : null;
  for (let k = start + seg.length; k <= day; k += 1) {
    const w = weightsOf(engine, rows, ctx, k * perDay, t.weightScale);
    if (w.gaps.length > 0) return unknownDay(w.gaps);
    let weights = w.weights;
    if (prev !== null) {
      if (!Number.isSafeInteger(t.persistBase)) return unknownDay([GAP.persistBase]);
      const kept = engine.vocab.index.get(prev).entry.persistence;
      if (!Number.isSafeInteger(kept)) return unknownDay([GAP.persistence]);
      weights = weights.map((x, i) => x * BigInt(rows[i][0] === prev ? kept : t.persistBase));
    }
    const total = weights.reduce((a, b) => a + b, 0n);
    if (total <= 0n) return unknownDay([GAP.zero]);
    let pick = drawBelow(total, ctx.worldSeed, ctx.streamCode, ctx.cellId, k * perDay, site);
    let chosen = null;
    for (let i = 0; i < rows.length; i += 1) {
      if (pick < weights[i]) { chosen = rows[i][0]; break; }
      pick -= weights[i];
    }
    prev = chosen;
    seg.push(chosen);
  }
  const row = engine.vocab.index.get(prev).entry;
  const quantity = (v, gap, convert) => (present(v) ? knownFact(convert(v), { fixed: fixedUnits(convert(v)) }) : unknownFact([gap]));
  return Object.freeze({
    state: knownFact(prev),
    tempOffsetC: quantity(row.tempOffsetC, GAP.tempOffset, (v) => v),
    cloud: quantity(row.cloud, GAP.cloud, (v) => v),
    humidity: quantity(row.humidity, GAP.humidity, (v) => v),
  });
}

function unknownDay(gaps) {
  const u = unknownFact(gaps);
  return Object.freeze({ state: u, tempOffsetC: u, cloud: u, humidity: u });
}
