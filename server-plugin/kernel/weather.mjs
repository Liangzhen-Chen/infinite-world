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
import { compileRXInScope, evaluateRX, nsKey } from './rx.mjs';
import { fixedUnits, fixedToNumber, fixedScale } from './det-math.mjs';

const SCHEMA = Object.freeze({
  family: 'weather',
  table: 'weather',
  clockTable: 'clock',
  drawSites: 'drawSites',
  siteState: 'site.weather.state',
  siteSep: '.',
  codeSep: '_',
  solarNs: Object.freeze({ ns: 'env', arg: Object.freeze(['solarPhase']) }),
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

/**
 * 加载期编译词表族 weather 各行的 weightRX 文本（卷二 §2.9 第 4 条：数据档 RX 在加载校验处经 compileRXInScope 编，编不过报 E-MOD-RX；卷二十 §2.5 :276 weightRX）。
 * 行上没写 weightRX 的不编（缺值登记在 rules.weather.unbuilt，读到按未知）；写了但不是文本、或编不过的报错行（形状同 checkClockTables）。
 * @param {{vocab: {families: Map<string, {entries: Record<string, any>}>}, rxScope: any}} env 维度加载的 env
 * @returns {{trees: Map<string, unknown>, errors: Record<string, unknown>[]}}
 */
export function prepareWeatherRx(env) {
  const trees = new Map();
  const errors = [];
  const fam = env.vocab.families.get(SCHEMA.family);
  const entries = fam && isObj(fam.entries) ? fam.entries : {};
  for (const id of Object.keys(entries).sort()) {
    const text = isObj(entries[id]) ? entries[id].weightRX : undefined;
    if (text === undefined) continue;
    const at = { level: 'L2', table: `_vocab.${SCHEMA.family}`, row: id, dim: 'weightRX', path: `_vocab.json#/families/${SCHEMA.family}/entries/${id}/weightRX` };
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
}

// 某一日各状态的权重（BigInt 整数）；缺 weightRX 或 weightScale 即返回缺口名单。
function weightsOf(engine, rows, ctx, minute, scale) {
  const gaps = [];
  const out = [];
  const phase = normalizedSolarPhase(engine, { latitudeDeg: ctx.latitudeDeg }, minute);
  for (const [id, row] of rows) {
    const common = isObj(ctx.cell.weatherCommonality) ? ctx.cell.weatherCommonality[id] : undefined;
    if (!present(common) || common === 0) { out.push(0n); continue; }
    // 只读加载期编好的树（卷二 §2.9 第 4 条）；行上没写 weightRX、或没装加载产物，都按缺口，不读行上的文本。
    const tree = compiled.get(id);
    if (!present(row.weightRX) || tree === undefined) { gaps.push(GAP.weightRx); out.push(0n); continue; }
    if (!phase.known) { gaps.push(...phase.gaps); out.push(0n); continue; }
    const solar = { [nsKey(SCHEMA.solarNs)]: fixedToNumber((BigInt(phase.num) * fixedScale()) / BigInt(phase.den)) };
    const raw = evaluateRX(tree, { dim: ctx.cell.staticDims || {}, clock: {} }, solar);
    if (typeof raw !== 'number' || raw < 0) throw new KernelError('E-WX-WEIGHT', {}, `weightRX of ${id} must give a number >= 0`);
    out.push((BigInt(common) * fixedUnits(raw) * BigInt(scale)) / fixedScale());
  }
  return { weights: out, gaps };
}

/**
 * 单元 c 第 day 日（世界日序，整数 >= 0）的天气（§4.3.3 第 2–4 条）：返回 {state, tempOffsetC, cloud, humidity}，各为 Fact；
 * state 的 value 是天气行代号。ctx = {worldSeed, streamCode, cellId, latitudeDeg（权重表达式读 env.solarPhase 要半球归一；缺则那些行未知），cell: {weatherCommonality: {行代号: 整数}, staticDims: {维度键: 数}}}。
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
  let prev = null;
  for (let k = start; k <= day; k += 1) {
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
