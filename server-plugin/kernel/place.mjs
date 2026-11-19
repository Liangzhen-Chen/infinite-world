// 地点表的读入口与包含树（卷五《地点地形与资源场》§3.1 :285、§4.1 :385–:452；卷二 §2.1 第 7 行、§5.6 :1753；块 6 第 6-7 张）。
// placeView(engine, state, placeId)：dims（表头全部维度的 Fact）与 tree（ancestors、children、depth）；
// routeView(engine, state, from, to)：edge（两地之间直接的边，每种通路类型一项，陆路在前）与 path（几何最短路，§4.1.3 规则 5）。
// 三个关系的实现函数 relContains、relWithin、relResidents（§4.1.2 表），以及加载期的树与边校验 checkPlaceTable（§4.1.3 规则 1、3、4；A5-1.2）。
// 两个读入口是纯读：不开户、不入账、不写任何状态（§3.1 末段）。只读表头登记与行数据，不按地点 id、名字、层级代号开分支（§4.1.3 规则 2）。
// 本卡范围之外、照卷文按未知带出的（读不到的派生字段按未知 Fact 带出；体检 K6-45）：terrainMix 与 requirement（terrain 族条目与
// struct:requirementBlock 未建）、speedFactor（§4.10，归 6-27）、bearingDeg（§4.2.1 方位角，归分区与感知）；
// 视图派生字段 zones、stocks 等其余各组（§2.1 视图派生字段表）随各自的卡建，本文件不给半截值。

import { KernelError, codeOf } from './errors.mjs';
import { dim, dependsOnUnbuilt } from './dimensions.mjs';
import { reverseLookup } from './reverse-index.mjs';
import { fixedUnits, fixedUnits8, fixedToNumber, fixedAdd, fixedDivide, atan } from './det-math.mjs';
import { checkDef, checkValue } from './validate/types.mjs';
import { T } from './handles/markers.mjs';
import { buildE } from './handles/generated.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 本卷的表与维度、边节字段（卷五 §2.1、§4.1.1；表头里登记的名字，本文件只读它们，不另定义含义）。
const PLACE = 'place';
const DIM = Object.freeze({ parent: 'parent', areaM2: 'areaM2', underground: 'underground', elevationM: 'elevationM', coord: 'coord' });
const COORD = Object.freeze({ x: 'x', y: 'y' });
const EDGE = Object.freeze({ from: 'from', to: 'to', distanceM: 'distanceM', waterway: 'waterway', openness: 'openness' });
// 表文件里的边节与边节字段定义（卷二 §5.6"表内 edges 节"；字段定义放表头 edgeStruct，本卡自定）。
const SECTION = Object.freeze({ edges: 'edges', edgeStruct: 'edgeStruct' });
// 关系行代号（卷五 §4.1.2 表；本文件是这三行的实现方）。
const REL = Object.freeze({ residents: 'rel_residents' });
// 持有边的字段（卷二 §1.5 struct:holding；卷十八 §4.1.1 terms 公共键 until）与种类行的 domicile 列（R18-1.10）。
const HOLDING = Object.freeze({ kind: 'kind', subject: 'subject', terms: 'terms', until: 'until' });
const DOMICILE = 'domicile';
// 行政层级族的条目字段（卷五 §4.14.1：rank: integer）；族名比较取 T.vocab_family.juris。
const JURIS_RANK = 'rank';

// 错误码句柄（handles/generated.mjs；同 ledger.mjs 写法 codeOf(e) === E.<码>）。
const E = buildE();

const KNOWN = (value) => Object.freeze({ known: true, applicable: true, value });
const UNKNOWN = Object.freeze({ known: false, applicable: true });

function placeTable(engine) {
  const t = engine && engine.tables instanceof Map ? engine.tables.get(PLACE) : undefined;
  if (!t) throw new KernelError('E-DIM-REF-MISSING', {}, 'place: no place dimension table loaded');
  return t;
}

// 全部地点 id：表内行（含 generated 节）与 state.created 里带本表 idPrefix 的偏离行（卷二 :287 实体前缀归表）。按代号序。
function placeIds(engine, state) {
  const t = placeTable(engine);
  const ids = new Set(t.flat && t.flat.rows instanceof Map ? t.flat.rows.keys() : []);
  const prefixes = isObj(t.doc.entity) && Array.isArray(t.doc.entity.idPrefix) ? t.doc.entity.idPrefix : [];
  const created = isObj(state) && isObj(state.created) ? state.created : {};
  for (const id of Object.keys(created)) if (prefixes.some((p) => id.startsWith(p))) ids.add(id);
  return [...ids].sort(cmp);
}

// 父地点：经内核 dim() 读基值（偏离行覆盖表内行，卷二 §1.3）；根为 null。不是地点即 dim() 抛 E-DIM-REF-MISSING。
function parentOf(engine, state, id) {
  const f = dim(engine, state, PLACE, id, DIM.parent);
  return f.known && typeof f.value === 'string' ? f.value : null;
}

function ancestorsOf(engine, state, id) {
  const out = [];
  const seen = new Set([id]);
  for (let p = parentOf(engine, state, id); p !== null; p = parentOf(engine, state, p)) {
    if (seen.has(p)) throw new KernelError('E-DIM-CYCLE', {}, `place ${id}: parent chain revisits ${p}`);
    seen.add(p);
    out.push(p);
  }
  return out;
}

function childIndex(engine, state) {
  const out = new Map();
  for (const id of placeIds(engine, state)) {
    const p = parentOf(engine, state, id);
    if (p === null) continue;
    if (!out.has(p)) out.set(p, []);
    out.get(p).push(id);
  }
  return out;
}

// 一个派生维度是否读到登记在案的未建派生：判定只在 kernel/dimensions.mjs#dependsOnUnbuilt 一处（speciesView 共用）。

/**
 * kernelApi `placeView(engine, state, placeId)`（卷五 §3.1；卷二 §2.1 第 7 行）。纯读。
 * dims：表头登记的每个维度一个 Fact（dim() 的基值；读到未建派生的按未知带出，不抛、不给值）；
 * tree：{ancestors: 自父到根, children: 代号序, depth: ancestors 的个数}。
 * @param {any} engine @param {any} state @param {string} placeId
 */
export function placeView(engine, state, placeId) {
  const t = placeTable(engine);
  const dims = {};
  for (const key of Object.keys(t.doc.dimensions).sort(cmp)) {
    try {
      dims[key] = dim(engine, state, PLACE, placeId, key);
    } catch (e) {
      // 读到登记在案的未建派生时 dim() 抛 E-MOD-RX（kernel/dimensions.mjs readBase，卷二 §1.12 封卷后勘误 1118k23）。
      if (!(codeOf(e) === E.E_MOD_RX && dependsOnUnbuilt(t, key))) throw e;
      dims[key] = UNKNOWN;
    }
  }
  const ancestors = ancestorsOf(engine, state, placeId);
  const children = childIndex(engine, state).get(placeId) || [];
  return Object.freeze({
    id: placeId,
    dims: Object.freeze(dims),
    tree: Object.freeze({ ancestors: Object.freeze(ancestors), children: Object.freeze([...children]), depth: ancestors.length }),
  });
}

// ---------- 边与几何最短路（§4.1.3 规则 4、5） ----------

function edgesOf(engine) {
  const t = placeTable(engine);
  return Array.isArray(t.doc[SECTION.edges]) ? t.doc[SECTION.edges] : [];
}

// 边图的邻接表：边无向、只存一次（规则 4），两个方向都挂上。按边数组本身记（边只有建行写者，§3.3）。
const graphs = new WeakMap();
function graphOf(edges) {
  if (graphs.has(edges)) return graphs.get(edges);
  const g = new Map();
  const link = (a, b, e) => { if (!g.has(a)) g.set(a, []); g.get(a).push({ other: b, edge: e }); };
  for (const e of edges) { link(e[EDGE.from], e[EDGE.to], e); link(e[EDGE.to], e[EDGE.from], e); }
  graphs.set(edges, g);
  return g;
}

function elevation(engine, state, id) {
  const f = dim(engine, state, PLACE, id, DIM.elevationM);
  return f.known && typeof f.value === 'number' ? f.value : null;
}

// 边的属性组（§3.1 routeView().edge 的一项）：从调用的 a 端看向 b 端。每项一个 Fact；本卡未建的四项按未知带出（见文件头）。
function edgeItem(engine, state, e, a, b) {
  const ea = elevation(engine, state, a);
  const eb = elevation(engine, state, b);
  return Object.freeze({
    distanceM: KNOWN(e[EDGE.distanceM]),
    terrainMix: UNKNOWN,
    waterway: KNOWN(e[EDGE.waterway]),
    openness: Object.hasOwn(e, EDGE.openness) ? KNOWN(e[EDGE.openness]) : UNKNOWN,
    requirement: UNKNOWN,
    ascentM: ea === null || eb === null ? UNKNOWN : KNOWN(fixedToNumber(fixedUnits(eb) - fixedUnits(ea))),
    bearingDeg: UNKNOWN,
    speedFactor: UNKNOWN,
  });
}

// 路径标签的全序（规则 5 并列取法）：路程（定点）→ 边数 → 途经地点 id 序列字典序 → 通路类型序列（陆路在前）。
// 同一边数的两条路径地点序列等长，所以逐项比即字典序；标签沿边延伸严格增大且保序，非负权最短路按此序取到唯一结果。
function lessLabel(x, y) {
  if (x.d !== y.d) return x.d < y.d;
  if (x.places.length !== y.places.length) return x.places.length < y.places.length;
  for (let i = 0; i < x.places.length; i++) if (x.places[i] !== y.places[i]) return x.places[i] < y.places[i];
  for (let i = 0; i < x.ways.length; i++) if (x.ways[i] !== y.ways[i]) return y.ways[i];
  return false;
}

function shortest(edges, s, t) {
  const g = graphOf(edges);
  const best = new Map([[s, { d: fixedUnits(0), places: [s], ways: [], edges: [] }]]);
  const done = new Set();
  for (;;) {
    let u = null;
    for (const [id, lab] of best) if (!done.has(id) && (u === null || lessLabel(lab, best.get(u)))) u = id;
    if (u === null) return null;
    if (u === t) return best.get(u);
    done.add(u);
    const lu = best.get(u);
    for (const { other, edge } of g.get(u) || []) {
      if (done.has(other)) continue;
      const cand = { d: lu.d + fixedUnits(edge[EDGE.distanceM]), places: [...lu.places, other], ways: [...lu.ways, edge[EDGE.waterway]], edges: [...lu.edges, edge] };
      if (!best.has(other) || lessLabel(cand, best.get(other))) best.set(other, cand);
    }
  }
}

/**
 * kernelApi `routeView(engine, state, from, to)`（卷五 §3.1；§4.1.3 规则 4、5）。纯读。
 * edge：两地之间直接的边，每种通路类型一项，陆路在前；没有即 []。
 * path：几何最短路 {places, edges, distanceM}；两地相同为没有边、distanceM 为 0 的路径；不连通为 null（两地距离未知）。
 * 结果只由边图决定：先从代号序较小的一端求，再按调用方向倒写，所以去程与回程是同一条路径。
 * @param {any} engine @param {any} state @param {string} from @param {string} to
 */
export function routeView(engine, state, from, to) {
  parentOf(engine, state, from); // 两端须是地点（dim() 对非地点抛 E-DIM-REF-MISSING）
  parentOf(engine, state, to);
  const edges = edgesOf(engine);
  const direct = edges
    .filter((e) => (e[EDGE.from] === from && e[EDGE.to] === to) || (e[EDGE.from] === to && e[EDGE.to] === from))
    .sort((x, y) => Number(x[EDGE.waterway]) - Number(y[EDGE.waterway]))
    .map((e) => edgeItem(engine, state, e, from, to));
  let path = null;
  if (from === to) path = Object.freeze({ places: Object.freeze([from]), edges: Object.freeze([]), distanceM: fixedToNumber(fixedUnits(0)) });
  else {
    const [s, t] = from < to ? [from, to] : [to, from];
    const lab = shortest(edges, s, t);
    if (lab !== null) {
      const places = from === s ? lab.places : [...lab.places].reverse();
      const raw = from === s ? lab.edges : [...lab.edges].reverse();
      const items = raw.map((e, i) => edgeItem(engine, state, e, places[i], places[i + 1]));
      path = Object.freeze({ places: Object.freeze(places), edges: Object.freeze(items), distanceM: fixedToNumber(lab.d) });
    }
  }
  return Object.freeze({ edge: Object.freeze(direct), path });
}

// ---------- 三个关系的实现函数（§4.1.2 表；relation:<rel_id> 节点的实现方是本卷） ----------

/** relation:rel_contains：本行的父地点（根行为空）。 @param {any} engine @param {any} state @param {string} id @returns {readonly string[]} */
export function relContains(engine, state, id) {
  const p = parentOf(engine, state, id);
  return Object.freeze(p === null ? [] : [p]);
}

/** relation:rel_within：本行及其全部祖先。 @param {any} engine @param {any} state @param {string} id @returns {readonly string[]} */
export function relWithin(engine, state, id) {
  return Object.freeze([id, ...ancestorsOf(engine, state, id)]);
}

/**
 * relation:rel_residents（§4.1.2 表四步）：① 本行及其全部后代（沿 tree 展开）；② 对每个地点经 reverseLookup 取以它为标的的持有者；
 * ③ 只留在该地点上至少有一条种类行 domicile 为真、且未关闭（terms.until 为 null）的边的持有者（R18-1.10）；④ 按代号序去重合并。
 * @param {any} engine @param {any} state @param {string} id @returns {readonly string[]}
 */
export function relResidents(engine, state, id) {
  const children = childIndex(engine, state);
  const places = [];
  const stack = [id];
  while (stack.length) {
    const p = stack.pop();
    places.push(p);
    for (const c of children.get(p) || []) stack.push(c);
  }
  const holdings = isObj(state) && isObj(state.holdings) ? state.holdings : {};
  const index = engine.vocab.index;
  const out = new Set();
  for (const place of places) {
    for (const holder of reverseLookup(state, REL.residents, place)) {
      const edges = isObj(holdings[holder]) ? Object.values(holdings[holder]) : [];
      const lives = edges.some((r) => {
        if (!isObj(r) || r[HOLDING.subject] !== place) return false;
        const row = index.get(r[HOLDING.kind]);
        const open = isObj(r[HOLDING.terms]) && r[HOLDING.terms][HOLDING.until] === null;
        return Boolean(row) && isObj(row.entry) && row.entry[DOMICILE] === true && open;
      });
      if (lives) out.add(holder);
    }
  }
  return Object.freeze([...out].sort(cmp));
}

// ---------- 地点的气候输入（卷二十 :311、:327–:328 `latitudeDeg`、`weatherCell`：卷二十定义、place 派生；全书唯一一处） ----------

// 天气单元的维度（挂 comp_weather_cell 的行才适用，卷二十 §2.7 :359）；气候输入里 cell 字段取这些。
const CELL_DIMS = Object.freeze(['annualMeanTempC', 'tempAmpC', 'diurnalAmpC', 'seasonScheme']);
const CELL_MARK = 'annualMeanTempC';
const ASTRO = Object.freeze({ table: 'astro', origin: 'latitudeOriginDeg', perDegree: 'metersPerDegreeNorth' });
const SITE = Object.freeze({ enclosed: 'enclosed', underground: 'underground', elevation: 'elevationM' });
const envMemo = new WeakMap();

/**
 * 地点的纬度（卷二十 §2.7 :327 `latitudeDeg`，derived，来源 `coord`）：latitudeOriginDeg + coord.y ÷ metersPerDegreeNorth（rules.astro；定点）。
 * 缺 coord 或任一参数即 null（按未知，不借常数）。
 * @param {any} engine @param {any} view placeView 的结果
 * @returns {number | null}
 */
export function placeLatitude(engine, view) {
  const c = view.dims[DIM.coord];
  const t = engine.rules && engine.rules[ASTRO.table];
  const origin = t ? t[ASTRO.origin] : undefined;
  const per = t ? t[ASTRO.perDegree] : undefined;
  if (!c.known || !isObj(c.value) || typeof c.value[COORD.y] !== 'number' || typeof origin !== 'number' || typeof per !== 'number') return null;
  return fixedToNumber(fixedAdd(fixedUnits(origin), fixedDivide(fixedUnits(c.value[COORD.y]), fixedUnits(per))));
}

/**
 * 地点的气候输入（卷二十 §4.3.3 第 1 条天气单元解析 `nearest(rel_contains, 挂 comp_weather_cell)`、§4.5 `tempAt`/`dailyMeanTemp` 的 input）：
 * 沿包含树从地点自身起取最近的挂 comp_weather_cell 的节点（按组件类认：单元维度对该行"适用"），单元值取该节点的维度；纬度见 placeLatitude。
 * 没有单元、没有纬度即 null。结果按（引擎，地点）记忆（静态维度不随时刻变，卷二十 :327 "静态"），返回同一对象，下游逐日记忆才能命中。
 * 天气上下文（湿度，要世界种子流代号与单元静态维度，种子流登记 rules.seedKeys 未建）这里不给。
 * @param {any} engine @param {any} state @param {string} placeId
 * @returns {{input: any} | null}
 */
export function placeClimateInput(engine, state, placeId) {
  let byPlace = envMemo.get(engine);
  if (!byPlace) { byPlace = new Map(); envMemo.set(engine, byPlace); }
  if (byPlace.has(placeId)) return byPlace.get(placeId);
  const own = placeView(engine, state, placeId);
  const chain = [own, ...own.tree.ancestors.map((a) => placeView(engine, state, a))];
  const cellNode = chain.find((n) => n.dims[CELL_MARK].applicable === true);
  const latitudeDeg = placeLatitude(engine, own);
  const val = (v, k) => (v.dims[k] && v.dims[k].known ? v.dims[k].value : undefined);
  let out = null;
  if (cellNode && latitudeDeg !== null) {
    const cell = Object.fromEntries(CELL_DIMS.filter((k) => val(cellNode, k) !== undefined).map((k) => [k, val(cellNode, k)]));
    const cellElevationM = val(cellNode, SITE.elevation);
    const here = val(own, SITE.elevation);
    out = { input: { latitudeDeg, cell, cellElevationM, surfaceRefElevationM: here === undefined ? cellElevationM : here, enclosed: val(own, SITE.enclosed), underground: val(own, SITE.underground), weather: {} } };
  }
  byPlace.set(placeId, out);
  return out;
}

// ---------- 加载期校验（§4.1.3 规则 1、3、4；A5-1.2；块 6 对照表第 18 行） ----------

/**
 * 地点表的树与边校验（kernel 组内用，加载器在维度校验通过后调；没载入 place 表即无事可核）。
 * 单根树、每行有限步到根（E-DIM-CYCLE；多根 E-DIM-DOMAIN-RANGE）；同父的非地下子地点面积和不超过父地点、子地点坐标落在父地点等效半径内
 * （E-DIM-DOMAIN-RANGE；coord 缺 x、y 即 E-DIM-STRUCT-FIELD）；
 * 边节逐条照 edgeStruct 校验（两端须是地点 E-DIM-REF-MISSING，字段与取值域照登记），`from` 小于 `to`（E-DIM-DOMAIN-RANGE），
 * 两端加通路类型唯一（E-DIM-DUPLICATE-KEY）；juris 族条目带整数 rank（E-DIM-STRUCT-FIELD）。
 * 面积和里的"地下"读派生维度 underground：加载期不求派生，且它读到的 depthM 登记为未建，所以此处没有已知为真的地下子地点，
 * 每个子地点都计入（只会更严，不会放过）；派生原语建成后改读求得的值。表里没有行时没有树可核。
 * 返回 "<登记码> <所在> <说明>" 文字行。
 * @param {{vocab: any, tables: Map<string, any>, env: any}} view
 * @returns {{ok: boolean, errors: string[]}}
 */
export function checkPlaceTable(view) {
  const errors = [];
  const idx = view && view.vocab ? view.vocab.index : undefined;
  if (idx instanceof Map) {
    for (const [code, rec] of [...idx].sort(([a], [b]) => cmp(a, b))) {
      if (rec && rec.family === T.vocab_family.juris && !(isObj(rec.entry) && Number.isInteger(rec.entry[JURIS_RANK]))) errors.push(`E-DIM-STRUCT-FIELD ${code}: juris entry needs an integer ${JURIS_RANK}`);
    }
  }
  const t = view && view.tables instanceof Map ? view.tables.get(PLACE) : undefined;
  if (!t) return { ok: errors.length === 0, errors };
  const rows = t.flat && t.flat.rows instanceof Map ? t.flat.rows : new Map();
  const ids = [...rows.keys()].sort(cmp);
  const parent = (id) => { const v = rows.get(id)[DIM.parent]; return typeof v === 'string' && rows.has(v) ? v : null; };
  // 规则 1：单根、有限步到根。
  const roots = ids.filter((id) => rows.get(id)[DIM.parent] === null);
  if (roots.length > 1) errors.push(`E-DIM-DOMAIN-RANGE place: ${roots.length} rows have a null parent (${roots.join(',')}); exactly one root`);
  for (const id of ids) {
    const seen = new Set([id]);
    for (let p = parent(id); p !== null; p = parent(p)) {
      if (seen.has(p)) { errors.push(`E-DIM-CYCLE place/${id}: parent chain never reaches the root (revisits ${p})`); break; }
      seen.add(p);
    }
  }
  // 规则 3：同父的非地下子地点面积和不超过父地点（定点相加、比较）。
  const sums = new Map();
  for (const id of ids) {
    const p = parent(id);
    const a = rows.get(id)[DIM.areaM2];
    if (p === null || typeof a !== 'number') continue;
    sums.set(p, (sums.has(p) ? sums.get(p) : fixedUnits(0)) + fixedUnits(a));
  }
  for (const [p, sum] of [...sums].sort(([a], [b]) => cmp(a, b))) {
    const own = rows.get(p)[DIM.areaM2];
    if (typeof own === 'number' && sum > fixedUnits(own)) errors.push(`E-DIM-DOMAIN-RANGE place/${p}: children areaM2 sum ${fixedToNumber(sum)} exceeds ${own}`);
  }
  // 规则 3 前半：子地点 coord 与父地点 coord 之差的长度不超过父地点等效半径 √(areaM2 ÷ π)。不开方，比 π·(dx²+dy²) ≤ areaM2，全程定点整数：
  // dx、dy 为 SCALE 标度，平方后 SCALE² 标度；π 取 det-math 的 atan 表在 x=1 处的 π/4 连加四次（10⁸ = SCALE² 标度，同 det-math 取法，不另写常数）；
  // 右边 areaM2（SCALE 标度）乘 SCALE 与 SCALE² 补齐标度。coord 缺 x 或 y 即 E-DIM-STRUCT-FIELD（不按 0 顶替）。
  const pointOf = (id) => {
    const c = rows.get(id)[DIM.coord];
    if (!isObj(c) || typeof c[COORD.x] !== 'number' || typeof c[COORD.y] !== 'number') return null;
    return { x: fixedUnits(c[COORD.x]), y: fixedUnits(c[COORD.y]) };
  };
  for (const id of ids) if (isObj(rows.get(id)[DIM.coord]) && pointOf(id) === null) errors.push(`E-DIM-STRUCT-FIELD place/${id}: coord needs numeric x and y`);
  let pi = null;
  for (const id of ids) {
    const p = parent(id);
    const own = p === null ? undefined : rows.get(p)[DIM.areaM2];
    const a = pointOf(id);
    const b = p === null ? null : pointOf(p);
    if (a === null || b === null || typeof own !== 'number') continue;
    if (pi === null) { const quarter = atan(fixedUnits8(1)); pi = quarter + quarter + quarter + quarter; }
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    if (pi * (dx * dx + dy * dy) > fixedUnits(own) * fixedUnits(1) * fixedUnits8(1)) errors.push(`E-DIM-DOMAIN-RANGE place/${id}: coord lies outside the equivalent radius of parent ${p} (areaM2 ${own})`);
  }
  // 规则 4：边节。
  const def = t.doc[SECTION.edgeStruct];
  const edges = t.doc[SECTION.edges];
  if (!isObj(def) || def.type !== T.type.struct) { errors.push(`E-DIM-STRUCT-FIELD place: ${SECTION.edgeStruct} is a struct definition of the edges section`); return { ok: false, errors }; }
  if (!Array.isArray(edges)) { errors.push(`E-DIM-STRUCT-FIELD place: ${SECTION.edges} is a list`); return { ok: false, errors }; }
  const sink = (e) => errors.push(`${e.code} place/${e.path}: got ${JSON.stringify(e.got)} want ${e.want}`);
  checkDef(def, view.env, { table: PLACE, row: '', dim: SECTION.edgeStruct, path: SECTION.edgeStruct }, sink, false);
  const keys = new Set();
  edges.forEach((e, i) => {
    const at = { table: PLACE, row: '', dim: SECTION.edges, path: `${SECTION.edges}/${i}` };
    if (!isObj(e)) { sink({ ...at, code: 'E-DIM-STRUCT-FIELD', got: e, want: 'edge object' }); return; }
    checkValue(def, e, view.env, at, sink);
    const a = e[EDGE.from];
    const b = e[EDGE.to];
    if (typeof a === 'string' && typeof b === 'string' && !(a < b)) sink({ ...at, code: 'E-DIM-DOMAIN-RANGE', got: [a, b], want: 'from sorts before to (edge stored once)' });
    const key = JSON.stringify([a, b, e[EDGE.waterway]]);
    if (keys.has(key)) sink({ ...at, code: 'E-DIM-DUPLICATE-KEY', got: [a, b, e[EDGE.waterway]], want: 'one edge per (from, to, waterway)' });
    keys.add(key);
  });
  return { ok: errors.length === 0, errors };
}
