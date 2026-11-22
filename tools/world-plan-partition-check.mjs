// 世界总案地理附表的省界核对（docs/研究/世界地理建模附表-1122.md 第三、四节）。
// 只读本文件里照附表抄下的省界、海、河、郡种子，调仓库 G3 纯函数 planRegionFootprints（server-plugin/kernel/footprint.mjs，卷五 §4.1 规则 10）；
// 不推进世界、不读写状态与世界数据，只打印结果。区格放大为 1 千米（regionCellM = 1000）以便本机几秒跑完，算法与入参形状同正式；正式 100 米区格时各格数乘 100。
// 另核天庭（位面设计 3.2、4.2）：云海、天门区、十二神国按目标面积划得下，飞升台门落点在天门区。
// 用法：node tools/world-plan-partition-check.mjs　末行 SUMMARY 各项全为 0 即自洽：表本身共格、郡种子不在本省、划分错误、表与划分面积不符、天庭划分错误、天庭面积不足、门落点不在天门区。
import { planRegionFootprints, cellCountOf, eachCell, xOf, yOf, keyOf, inBox, ownerIdAt } from '../server-plugin/kernel/footprint.mjs';
import { installFixedConstants } from '../server-plugin/kernel/det-math.mjs';

installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 }); // 与 tests/kernel/fixture.mjs 同值

// ---- 附表数据（千米；矩形左闭右开 [x0,x1)×[y0,y1)）----
const BOX = { x0: -170, y0: -330, cellsX: 890, cellsY: 600 }; // 附表第一节主世界外包框
const ISLANDS = [-45, 5, -285, -250];
const CAUSEWAY = [-30, -20, -250, -230];
const SEAS = { // 附表 4.1；先占
  sea_north: { rects: [[-170, 720, 250, 270], [110, 160, 225, 250]], minus: [] },
  sea_west: { rects: [[-170, -150, -330, 250], [-150, 40, -330, -230]], minus: [ISLANDS, CAUSEWAY] },
  sea_south_gulf: { rects: [[40, 400, -330, -110], [-5, 40, -195, -169]], minus: [] },
};
const RIVERS = [ // 附表 4.2；表序即流向序；最后一段止于与下游相接
  { id: 'river_da', pts: [[-80, 32], [5, 8], [10, 0], [10, -175]], into: 'sea_south_gulf' },
  { id: 'river_lu', pts: [[60, 57], [8, 9]], into: 'river_da' },
  { id: 'river_zhong', pts: [[495, 60], [460, 30], [455, -15], [415, -45], [395, -80], [395, -130]], into: 'sea_south_gulf' },
  { id: 'river_lin', pts: [[-112, -90], [-160, -130]], into: 'sea_west' },
];
const LANDS = { // 附表 3.2；各省与北岭
  prov_xichui: [[-120, 330, -20, 50], [-15, 40, -110, -20], [11, 40, -169, -110]],
  prov_hanlu: [[-60, 230, 50, 140]],
  prov_xingwan: [[-20, 230, 140, 250]],
  prov_feicui: [[-150, -15, -110, -20], [-150, 11, -155, -110]],
  prov_hupo: [[-150, 11, -169, -155], [-150, 40, -230, -169], CAUSEWAY, ISLANDS],
  prov_zhonglu: [[330, 555, -80, 90]],
  prov_fengji: [[400, 700, -200, -80]],
  prov_jingzhao: [[400, 700, -330, -200]],
  prov_wushan: [[555, 700, 0, 230]],
  wild_beiling: [[230, 555, 140, 250]],
};
const COUNTIES = { // 附表 3.3 种子（= 郡治坐标）
  prov_xichui: { longqu: [20, 5], xiadu: [0, -70], huancheng: [250, 10], shangzha: [-80, 30] },
  prov_hanlu: { tongji: [60, 62], tuixie: [20, 110], zheya: [130, 80], heilu: [165, 120] },
  prov_xingwan: { xuedeng: [70, 145], fudeng: [100, 230] },
  prov_feicui: { shuqiao: [-35, -75], taiyuan: [-110, -85], lieer: [-55, -140], dongyuan: [-5, -140] },
  prov_hupo: { hupogang: [-10, -165], qiansheng: [-85, -200], yanfeng: [-20, -265] },
  prov_zhonglu: { wangji: [440, 0], jiekan: [385, 40], xiqian: [400, -55], baiguan: [495, 65], chizhe: [545, -55] },
  prov_fengji: { zhufeng: [470, -125], jinghuan: [545, -175], tiyuan: [415, -180] },
  prov_jingzhao: { luyu: [470, -220], huiyan: [565, -265], chaoting: [420, -285] },
  prov_wushan: { shanyi: [620, 40], wuling: [670, 95], guanxue: [585, 155] },
};
const TABLE_AREA = { // 附表 3.2、3.3、4.1、4.2 写下的面积或格数（km²），用来核表与划分一致
  sea_north: 19050, sea_west: 28650, sea_south_gulf: 80370,
  river_da: 292, river_lu: 101, river_zhong: 271, river_lin: 68,
  prov_xichui: 37847, prov_hanlu: 26080, prov_xingwan: 26250, prov_feicui: 19282, prov_hupo: 14610,
  prov_zhonglu: 38009, prov_fengji: 36000, prov_jingzhao: 39000, prov_wushan: 33350, wild_beiling: 35750,
  county_longqu: 9461, county_xiadu: 5117, county_huancheng: 9461, county_shangzha: 5309,
  county_tongji: 6520, county_tuixie: 6520, county_zheya: 6098, county_heilu: 6098,
  county_xuedeng: 13125, county_fudeng: 13125,
  county_shuqiao: 4820, county_taiyuan: 4820, county_lieer: 4671, county_dongyuan: 4820,
  county_hupogang: 4870, county_qiansheng: 4870, county_yanfeng: 3902,
  county_wangji: 6435, county_jiekan: 6281, county_xiqian: 6434, county_baiguan: 7601, county_chizhe: 7601,
  county_zhufeng: 12000, county_jinghuan: 12000, county_tiyuan: 6660,
  county_luyu: 12962, county_huiyan: 13000, county_chaoting: 13000,
  county_shanyi: 9949, county_wuling: 11116, county_guanxue: 11116,
};

// ---- 纯函数 ----
const inRect = (x, y, r) => x >= r[0] && x < r[1] && y >= r[2] && y < r[3];
const seaHas = (s, x, y) => s.rects.some((r) => inRect(x, y, r)) && !s.minus.some((r) => inRect(x, y, r));
const landHas = (rects, x, y) => rects.some((r) => inRect(x, y, r));
const cellKey = (x, y) => `${x}:${y}`;

function forEachCell(fn) {
  for (let y = BOX.y0; y < BOX.y0 + BOX.cellsY; y += 1) for (let x = BOX.x0; x < BOX.x0 + BOX.cellsX; x += 1) fn(x, y);
}

// 表本身的共格：海与海、陆与陆（省、北岭）之间不许共格；省与海、河的共格是表里写明的"扣去"
function rawOverlapCount() {
  let n = 0;
  const groups = [Object.values(SEAS).map((s) => (x, y) => seaHas(s, x, y)), Object.values(LANDS).map((rs) => (x, y) => landHas(rs, x, y))];
  for (const preds of groups) forEachCell((x, y) => { if (preds.filter((p) => p(x, y)).length > 1) n += 1; });
  return n;
}

// 照卷十 R10-2.17 中心线走法：每步沿剩余距离较大的轴走一格（并列取 x 轴），到与下游四邻相接为止
function riverCells(pts, stop) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i += 1) {
    let [x, y] = pts[i];
    const [tx, ty] = pts[i + 1];
    const last = i + 2 === pts.length;
    if (i === 0) out.push({ x, y });
    const touches = (a, b) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => stop(a + dx, b + dy));
    while ((x !== tx || y !== ty) && !(last && touches(x, y))) {
      const dx = tx - x; const dy = ty - y;
      if (Math.abs(dx) >= Math.abs(dy)) x += Math.sign(dx); else y += Math.sign(dy);
      out.push({ x, y });
    }
  }
  return out;
}

function buildRows() {
  const painted = new Map();
  const cellsOf = new Map();
  const problems = [];
  const paint = (id, has) => {
    const list = [];
    forEachCell((x, y) => { if (!painted.has(cellKey(x, y)) && has(x, y)) { painted.set(cellKey(x, y), id); list.push({ x, y }); } });
    cellsOf.set(id, list);
  };
  for (const [id, s] of Object.entries(SEAS)) paint(id, (x, y) => seaHas(s, x, y));
  for (const r of RIVERS) {
    const list = riverCells(r.pts, (x, y) => painted.get(cellKey(x, y)) === r.into);
    for (const c of list) {
      const k = cellKey(c.x, c.y);
      if (painted.has(k)) problems.push(`RIVER-HITS ${r.id} ${painted.get(k)} at ${c.x},${c.y}`); else painted.set(k, r.id);
    }
    cellsOf.set(r.id, list.filter((c) => painted.get(cellKey(c.x, c.y)) === r.id));
  }
  for (const [id, rs] of Object.entries(LANDS)) paint(id, (x, y) => landHas(rs, x, y));
  const rows = new Map();
  rows.set('world', { parent: null, kind: 'region', offstage: false, coord: null, targetAreaM2: null, boundary: null });
  for (const [id, list] of cellsOf) rows.set(id, { parent: 'world', kind: 'region', offstage: false, coord: null, targetAreaM2: null, boundary: list, flowing: id.startsWith('river_') });
  let seedMisses = 0;
  for (const [p, cs] of Object.entries(COUNTIES)) for (const [c, [x, y]] of Object.entries(cs)) {
    if (painted.get(cellKey(x, y)) !== p) { seedMisses += 1; problems.push(`SEED-NOT-IN-PROVINCE ${c} (${x},${y}) painted=${painted.get(cellKey(x, y))}`); }
    rows.set(`county_${c}`, { parent: p, kind: 'region', offstage: false, coord: { x: x * 1000 + 500, y: y * 1000 + 500 }, targetAreaM2: null, boundary: null });
  }
  return { rows, seedMisses, problems, ids: [...cellsOf.keys()] };
}

function countyLine(plan, p, c) {
  const id = `county_${c}`;
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  const touch = new Set();
  eachCell(plan, id, (kk) => {
    const x = xOf(BOX, kk); const y = yOf(BOX, kk);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!inBox(BOX, x + dx, y + dy)) continue;
      const o = ownerIdAt(plan, keyOf(BOX, x + dx, y + dy));
      if (o && (o in SEAS || o.startsWith('river_'))) touch.add(o);
    }
  });
  return `COUNTY ${p} ${c} cells=${cellCountOf(plan, id)} x[${x0},${x1}] y[${y0},${y1}] touches=${[...touch].sort().join(',') || '-'}`;
}

// ---- 运行 ----
const rawOverlap = rawOverlapCount();
console.log(`RAW-TABLE-OVERLAP cells=${rawOverlap}`);
const { rows, seedMisses, problems, ids } = buildRows();
for (const line of problems) console.log(line);
const { plans, errors } = planRegionFootprints({ regionCellM: 1000 }, [{ w: 0, box: BOX, root: 'world' }], rows);
console.log(`errors ${errors.length}`);
for (const e of errors) console.log(JSON.stringify(e));
const plan = plans.get(0);
let areaMismatch = 0;
const checkArea = (id, got) => { if (TABLE_AREA[id] !== got) { areaMismatch += 1; console.log(`AREA-MISMATCH ${id} table=${TABLE_AREA[id]} got=${got}`); } };
for (const id of ids) { const n = cellCountOf(plan, id); console.log(`ROW ${id} cells=${n} km2`); checkArea(id, n); }
let worldLeft = 0;
for (let i = 0; i < plan.total; i += 1) if (ownerIdAt(plan, i) === 'world') worldLeft += 1;
console.log(`ROW world-remainder(wild) cells=${worldLeft} km2`);
for (const [p, cs] of Object.entries(COUNTIES)) for (const c of Object.keys(cs)) { console.log(countyLine(plan, p, c)); checkArea(`county_${c}`, cellCountOf(plan, `county_${c}`)); }

// ---- 天庭（docs/研究/位面完整设计-1122.md 3.2、4.2；格空间 2，框 100×100 千米，原点在框中心）----
const H_BOX = { x0: -50, y0: -50, cellsX: 100, cellsY: 100 };
const H_SEA_R = 45; // 云海：格中心离原点超过 45 千米
const H_GATE = { id: 'heaven_gate', seed: [0, 0], km2: 1200 };
const H_REALM_KM2 = 300;
const H_REALMS = { lintel: [30, 0], bank: [26, 15], shade: [26, -15], wedge: [15, 26], lamp: [0, 30], mirror: [-15, 26], tide: [-26, 15], furrow: [-30, 0], ret: [-26, -15], canopy: [-15, -26], scent: [0, -30], well: [15, -26] };
const H_DOORS = [[0, 0], [10, 5]]; // 冠雪、北岭飞升台门在天庭一端，须落在天门区
function heavenCheck() {
  const sea = [];
  for (let y = H_BOX.y0; y < H_BOX.y0 + H_BOX.cellsY; y += 1) for (let x = H_BOX.x0; x < H_BOX.x0 + H_BOX.cellsX; x += 1) {
    const cx = 2 * x + 1; const cy = 2 * y + 1; // 格中心的二倍坐标，避免小数
    if (cx * cx + cy * cy > 4 * H_SEA_R * H_SEA_R) sea.push({ x, y });
  }
  const hRows = new Map();
  hRows.set('heaven', { parent: null, kind: 'region', offstage: false, coord: null, targetAreaM2: null, boundary: null });
  hRows.set('heaven_sea', { parent: 'heaven', kind: 'region', offstage: false, coord: null, targetAreaM2: null, boundary: sea });
  const seedRow = (sd, km2) => ({ parent: 'heaven', kind: 'region', offstage: false, coord: { x: sd[0] * 1000 + 500, y: sd[1] * 1000 + 500 }, targetAreaM2: km2 * 1000000, boundary: null });
  hRows.set(H_GATE.id, seedRow(H_GATE.seed, H_GATE.km2));
  for (const [d, sd] of Object.entries(H_REALMS)) hRows.set(`realm_${d}`, seedRow(sd, H_REALM_KM2));
  const res = planRegionFootprints({ regionCellM: 1000 }, [{ w: 2, box: H_BOX, root: 'heaven' }], hRows);
  const hp = res.plans.get(2);
  for (const e of res.errors) console.log(`HEAVEN ${JSON.stringify(e)}`);
  let short = 0;
  const want = [[H_GATE.id, H_GATE.km2], ...Object.keys(H_REALMS).map((d) => [`realm_${d}`, H_REALM_KM2])];
  for (const [id, km2] of want) { const n = cellCountOf(hp, id); if (n !== km2) { short += 1; console.log(`HEAVEN-AREA-SHORT ${id} want=${km2} got=${n}`); } }
  let doorMiss = 0;
  for (const [x, y] of H_DOORS) if (ownerIdAt(hp, keyOf(H_BOX, x, y)) !== H_GATE.id) { doorMiss += 1; console.log(`HEAVEN-DOOR-NOT-IN-GATE (${x},${y}) owner=${ownerIdAt(hp, keyOf(H_BOX, x, y))}`); }
  let wild = 0;
  for (let i = 0; i < hp.total; i += 1) if (ownerIdAt(hp, i) === 'heaven') wild += 1;
  console.log(`HEAVEN sea=${cellCountOf(hp, 'heaven_sea')} gate=${cellCountOf(hp, H_GATE.id)} realms=${H_REALM_KM2}x12 wild=${wild} km2`);
  return { errors: res.errors.length, short, doorMiss };
}
const heaven = heavenCheck();
console.log(`SUMMARY raw-overlap=${rawOverlap} seed-misses=${seedMisses} errors=${errors.length} area-mismatch=${areaMismatch} heaven-errors=${heaven.errors} heaven-area-short=${heaven.short} heaven-door-miss=${heaven.doorMiss}`);
