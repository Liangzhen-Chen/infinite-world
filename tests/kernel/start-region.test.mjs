// 格子迁移 G11《起始地区蓝图与布局数据》卡内测试：对起始地区（河湾村一带）的真数据断言。
// 对照表 docs/迁移体检/格子G6-G11-规矩检查对照.md 第 70–75 行、待定 C4（cellclass 兜底）；G7 复核（docs/审查/G7-Opus只核-1121.md）要求的 wear 表。
// 期望值按卷文公式手算成字面量，推算写在各用例注释里；不抄仓库此刻的计数。真数据只从 world/ 读：_vocab.json（形制、房间角色、布局模板、分片角色、cellclass、gentemplate）、
// rules 表（grid、facility 的 blueprint 与 wear）、world/geo/start-buildings.json（逐栋输入）与它引用的设定原文。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { planBlueprint, planCellsOf, breachesOf, checkBlueprintForms } from '../../server-plugin/kernel/blueprint.mjs';
import { checkGenTemplates } from '../../server-plugin/kernel/grid-template.mjs';
import { cellClassOf } from '../../server-plugin/kernel/grid.mjs';
import { planRegionFootprints, cellList, FOOTPRINT_KIND } from '../../server-plugin/kernel/footprint.mjs';
import { layoutOf, defaultFacing, checkLayoutTemplates, REASON } from '../../server-plugin/kernel/layout.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT); // 世界必须能加载（新条目、新规则行都过加载期校验）
assert.ok(W.ok, W.text);
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

const json = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const tableOf = (file) => Object.fromEntries(json(`world/rules/tables/${file}`).rows.map((r) => [r.key, r.value]));
const GRID = tableOf('grid.json');
const FACILITY = tableOf('facility.json');
const vocab = json('world/ontology/dimensions/_vocab.json').families;
const index = new Map();
for (const [family, def] of Object.entries(vocab)) for (const [code, entry] of Object.entries(def.entries || {})) index.set(code, { family, entry });
const entriesOf = (family) => [...index].filter(([, r]) => r.family === family);
const MATERIALS = new Set(Object.keys(json('world/ontology/dimensions/material.json').rows));
const RULES = { cellM: GRID.cellM, storeyM: GRID.storeyM, m3PerL: 0.001, facingDirections: GRID.facingDirections, limits: FACILITY.blueprint };
const START = json('world/geo/start-buildings.json');
const LOCATIONS = json('world/geo/locations.json');
const throwsDomain = (fn) => assert.throws(fn, (e) => e && e.code === 'E-DET-DOMAIN');
// 夹具（测试前提，不是设定数据）：真实数据里河湾村各栋的面积、层数、墙厚设定没给（均为 null），下面的蓝图与落位用例用自造的形制与八栋同尺寸的房子，期望值照卷文公式手算。
// 形制照卷十九 §4.4.5 手算例的写法（aspect 1、windowEvery 4、墙厚 0.4）再带两间房（各半）；夹具房子 36 平方米、1 层。
const FIX_FORM = { walled: true, roofed: true, deck: false, storeyBase: 0, aspect: 1, windowEvery: 4, wallThicknessDefaultM: 0.4, wallThicknessMinM: 0.4,
  rooms: [{ role: 'roomrole_common_room', share: 0.5, level: 0, open: false }, { role: 'roomrole_sleeping_room', share: 0.5, level: 0, open: false }] };
const FIX_HOMES = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: `fx_home_${i}`, form: FIX_FORM, areaM2: 36, storeys: 1, wallThicknessM: 0.4, rooms: [{ roomRole: 'roomrole_common_room' }, { roomRole: 'roomrole_sleeping_room' }] }));

// ---------- #70：新增数据过加载期校验（形制、模板、角色、细格生成模板） ----------

test('起始地区新增的形制、布局模板、分片角色、细格生成模板条目全过加载期校验，且族内确有条目被核', () => {
  assert.ok(entriesOf('bform').length > 0 && entriesOf('layout').length > 0 && entriesOf('zrole').length > 0 && entriesOf('gentemplate').length > 0 && entriesOf('cellclass').length > 0);
  assert.deepEqual(checkBlueprintForms(index, FACILITY.blueprint), []);
  assert.deepEqual(checkLayoutTemplates(index), []);
  assert.deepEqual(checkGenTemplates(index, (code) => MATERIALS.has(code), true), []);
});

test('只加数据即生效（A19-5.3、A19-6.3）：再加一条形制（aspect 2、墙厚 0.5）、一条模板（两个角色）条目，同一套函数照样出蓝图折面积、过校验，不改代码', () => {
  const extra = new Map(index);
  const baseForm = index.get(entriesOf('bform')[0][0]).entry;
  extra.set('bldform_test_long', { family: 'bform', entry: { ...baseForm, aspect: 2, wallThicknessDefaultM: 0.5, wallThicknessMinM: 0.5 } });
  extra.set('layout_test_two', { family: 'layout', entry: { zones: [{ role: 'zrole_test_a', share: 0.7, adjacent: ['zrole_test_b'] }, { role: 'zrole_test_b', share: 0.3, adjacent: ['zrole_test_a'] }], applies: 'true' } });
  extra.set('zrole_test_a', { family: 'zrole', entry: { typeAffinity: {} } });
  extra.set('zrole_test_b', { family: 'zrole', entry: { typeAffinity: {} } });
  assert.deepEqual(checkBlueprintForms(extra, FACILITY.blueprint), []);
  assert.deepEqual(checkLayoutTemplates(extra), []);
  // 墙厚 0.5 → w = ceil(0.5 ÷ 1) = 1；36 平方米、aspect 2：A = 36，D = max(3, ⌊√(36 × 2)⌋ = ⌊√72⌋ = 8) = 8，W = max(3, ceil(36 ÷ 8) = 5) = 5。
  assert.deepEqual(planCellsOf({ form: extra.get('bldform_test_long').entry, areaM2: 36 }, RULES), { widthCells: 5, depthCells: 8 });
});

// ---------- A19-5.1、A10-7.1（对照表 #36 的静态一半，先用普通测试守；检测器类别归首个需要它的卡） ----------

test('服务端代码里没有形制、房间角色、布局模板、分片角色、地形类、细格生成模板的代号字面量（数据在词表里，规则不点名）', () => {
  const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : d.name.endsWith('.mjs') ? [`${dir}/${d.name}`] : []));
  const files = walk('server-plugin');
  assert.ok(files.length > 0);
  const codes = ['bform', 'roomrole', 'layout', 'zrole', 'cellclass', 'gentemplate'].flatMap((f) => entriesOf(f).map(([code]) => code));
  assert.ok(codes.length > 0);
  for (const f of files) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    for (const code of codes) assert.equal(text.includes(code), false, `${f} mentions vocabulary code ${code}`);
  }
});

// ---------- 待定 C4：cellclass 兜底，全世界用到的每种地形都有条目 ----------

test('cellclass 兜底：每种地形 × 每种水体类（含无水）× 道路与否 × 聚落与否 × 坡度探针都有条目成立，且它们引用的细格生成模板都存在', () => {
  const entries = entriesOf('cellclass').map(([code, r]) => [code, r.entry]);
  const terrains = entriesOf('terrain').map(([code]) => code);
  const waters = [null, ...entriesOf('water').map(([code]) => code)];
  assert.ok(terrains.length > 0 && waters.length > 1);
  for (const terrain of terrains) for (const waterKind of waters) for (const onRoad of [false, true]) for (const inSettlement of [false, true]) for (const slope of [0, 0.5, 1]) {
    const code = cellClassOf(entries, { terrain, waterKind, slope, onRoad, inSettlement });
    assert.notEqual(code, null, `no cellclass for ${terrain}/${waterKind}/${onRoad}/${inSettlement}/${slope}`);
    assert.equal(index.get(index.get(code).entry.genTemplate).family, 'gentemplate');
  }
  // 有水体的区格取水体条目（priority 10 高于地形兜底 0）：与地形无关。
  const water = cellClassOf(entries, { terrain: terrains[0], waterKind: waters[1], slope: 0, onRoad: false, inSettlement: false });
  assert.equal(index.get(water).entry.priority > 0, true);
});

// ---------- G7 复核：wear 表（breachShare、roofCurve、两个序代号） ----------

test('wear 表（rules.facility.wear）：破口数与屋面缺口数按卷十九 §4.1 规则 3 手算（完好 1、半坏 0.5、全坏 0）', () => {
  // 夹具私宅蓝图 6×6、墙厚 0.4（w = 1）、带两间房（共用起居间 1 行、家人睡处 2 行，隔墙 1 行）：
  // 外墙处共 20，减去 4 个墙角、1 正门、4 窗 = 候选墙处 11；屋面元 = 室内 16 格 − 隔墙行 4 格（隔墙行上的内门格不是室内格）= 12。
  // K_w = floor(11 ×（1 − c）× breachShare 1)：c=1 → 0，c=0.5 → floor(5.5) = 5，c=0 → 11。
  // K_r = floor(12 ×（1 − lookup(roofCurve, c)))，roofCurve 恒等：c=1 → 0，c=0.5 → floor(6) = 6，c=0 → 12。
  const home = FIX_HOMES[0];
  const form = home.form;
  const pc = planCellsOf({ form, areaM2: home.areaM2, wallThicknessM: home.wallThicknessM }, RULES);
  const bp = planBlueprint({ form, planCells: pc, storeys: home.storeys, wallThicknessM: home.wallThicknessM, facing: 0 }, RULES);
  assert.equal(bp.ok, true);
  assert.equal(bp.places.filter((p) => p.type === 'wall').length, 20);
  assert.equal(bp.places.filter((p) => p.type === 'roof').length, 12);
  const wear = FACILITY.wear;
  const orderKey = (code, i) => `${code}:${i}`;
  const at = (c) => { const r = breachesOf(bp, c, [], wear, orderKey); return [r.kw, r.kr]; };
  assert.deepEqual(at(1), [0, 0]);
  assert.deepEqual(at(0.5), [5, 6]);
  assert.deepEqual(at(0), [11, 12]);
  // 两个序代号是互不相同的非空字符串（排序哈希的一段，规则不对它们分支）。
  assert.equal(typeof wear.wallOrderCode, 'string');
  assert.equal(typeof wear.roofOrderCode, 'string');
  assert.notEqual(wear.wallOrderCode, wear.roofOrderCode);
  assert.ok(wear.wallOrderCode.length > 0 && wear.roofOrderCode.length > 0);
  // 表缺失时仍报未知，不报完好（G7 已守）：wear 为 null 时候选处按未知。
  assert.equal(breachesOf(bp, 0.5, [], null, orderKey).kw, null);
});

// ---------- #71：逐栋建筑输入（world/geo/start-buildings.json） ----------

const quoteOk = (source) => {
  const m = /^(\S+?):(\d+) (.+)$/s.exec(source);
  assert.ok(m, `source "${source}" is "file:line quote"`);
  const lines = readFileSync(join(ROOT, m[1]), 'utf8').split(/\r?\n/);
  return lines[Number(m[2]) - 1] !== undefined && lines[Number(m[2]) - 1].includes(m[3]);
};

test('start-buildings：覆盖 locations.json 里 loc_hw 下的全部建筑；缺的值都有 gap；引用的形制与房间角色存在；出处逐条在原文行里核得到', () => {
  const buildings = LOCATIONS.filter((l) => l.parent === 'loc_hw' && l.id.startsWith('bld_')).map((l) => l.id).sort();
  assert.deepEqual(START.rows.map((r) => r.id).sort(), buildings); // 一栋不漏、不多
  for (const r of START.rows) {
    const old = LOCATIONS.find((l) => l.id === r.id);
    assert.equal(r.name, old.name);
    for (const k of ['form', 'areaM2', 'storeys', 'wallThicknessM', 'rooms']) {
      if (r[k] === null) assert.ok(r.gap.length > 0, `${r.id}.${k} is null so a gap line must say why`);
    }
    if (r.form !== null) assert.equal(index.get(r.form).family, 'bform');
    if (r.rooms !== null) {
      assert.deepEqual(r.rooms.map((x) => [x.id, x.name]), old.rooms.map((x) => [x.id, x.name])); // 房间 id 与名字逐个同旧数据
      for (const x of r.rooms) assert.equal(index.get(x.roomRole).family, 'roomrole');
    }
    assert.ok(r.source.length > 0);
    for (const s of r.source) assert.equal(quoteOk(s), true, `${r.id}: ${s}`);
  }
});

test('夹具私宅蓝图：36 平方米、墙厚 0.4 折成 6×6；蓝图房间数与角色次序同 rooms 列', () => {
  // planCellsOf：A = ceil(36 ÷ 1²) = 36；t 0.4 → w = ceil(0.4 ÷ 1) = 1，m = 3；aspect 1：D = max(3, √36 = 6) = 6，W = max(3, ceil(36 ÷ 6) = 6) = 6。
  for (const r of FIX_HOMES) {
    const form = r.form;
    const pc = planCellsOf({ form, areaM2: r.areaM2, wallThicknessM: r.wallThicknessM }, RULES);
    assert.deepEqual(pc, { widthCells: 6, depthCells: 6 });
    const bp = planBlueprint({ form, planCells: pc, storeys: r.storeys, wallThicknessM: r.wallThicknessM, facing: 4 }, RULES);
    assert.equal(bp.ok, true);
    assert.deepEqual(bp.rooms.map((x) => x.role), r.rooms.map((x) => x.roomRole)); // 房间序号：由外往里，共用起居间在前
    // 房间行 1：外墙厚 1，室内 4 行；一道隔墙 → 可分行数 R = 4 − (2 − 1) = 3，按 0.5/0.5 分：floor(3 × 0.5) = 1，末份取差 2。
    assert.deepEqual(bp.rooms.map((x) => x.rowTo - x.rowFrom + 1), [1, 2]);
  }
});

// ---------- #72–#75：layoutOf 在起始地区数据上（面积阶段 R10-7.5 的手算 + 试排 + 不变量） ----------

test('夹具站点（不是起始地区：河湾村直挂手写建筑，按卷十 R10-7.1 不分片）：沿河条带式模板落位，N=5 的十字形足迹排不下（作坊与码头不相邻），N 加一为 6 后排下；锚点与分片足迹逐格手算', () => {
  const homes = FIX_HOMES;
  const tpl = index.get(entriesOf('layout')[0][0]).entry.zones; // 数据里唯一的模板：居住 0.5、作坊 0.3、码头 0.2
  const gap = 2; // 卷十 :182 rules.gen.layout.gapCells 暂定 2（该规则表行归卷十生成阶段卡，本卡测试取它的卷文值）
  const latitude = json('world/geo/weather-cell.json').latitudeDeg; // 起始地区天气单元纬度 37.783 ≥ 0 → 面向赤道取 4
  const facing = defaultFacing(GRID, { intentFacing: null, culturePref: null, latitudeDeg: latitude });
  assert.equal(facing, 4);
  const form = homes[0].form;
  const bbox = planBlueprint({ form, planCells: { widthCells: 6, depthCells: 6 }, storeys: 1, wallThicknessM: 0.4, facing }, RULES).bbox;
  // facing 4（转两个四分之一圈）：局部 (u, v) → (x, y) = (u, −v) → 转一次 (−v, −u) → 转两次 (−u, v)；u、v ∈ [0, 5] → x ∈ [−5, 0]，y ∈ [0, 5]。
  assert.deepEqual(bbox, { dx0: -5, dy0: 0, dx1: 0, dy1: 5 });
  // 没有设施类型表，zrole.typeAffinity 都为空：每行归份额最大的角色（卷十 R10-7.5）。
  const widest = [...tpl].sort((a, b) => b.share - a.share || (a.role < b.role ? -1 : 1))[0].role;
  assert.equal(widest, 'zrole_dwelling');
  // R10-7.5 手算：区格面积 A = 100 × 100 = 10000；coverage 取卷十 :682 手算例的 0.4（该规则表行归卷十生成阶段卡）；八栋占地各 36 → 居住片 288，作坊、码头 0。
  // need = max(1, ceil(288 ÷ (0.4 × 10000))) = max(1, ceil(0.072)) = 1；作坊、码头 need = 1。
  // 每个角色 ceil(need ÷ 份额)：ceil(1 ÷ 0.5) = 2，ceil(1 ÷ 0.3) = 4，ceil(1 ÷ 0.2) = 5 → N = 5。
  // N = 5：余格 5 − 3 = 2，按份额分：floor(2 × 0.5) = 1，floor(2 × 0.3) = 0，末份取差 1 → 目标格数 n = [1+1, 1+0, 1+1] = [2, 1, 2]。
  // N = 6（加一重排）：余格 3：floor(3 × 0.5) = 1，floor(3 × 0.3) = 0，末份 2 → n = [2, 1, 3]；站点 targetAreaM2 = 6 × 10000 = 60000。
  const targetsOf = { 5: [2, 1, 2], 6: [2, 1, 3] };
  const baseRow = { kind: FOOTPRINT_KIND.region, offstage: false, coord: null, targetAreaM2: null, boundary: null };
  const siteCells = (n) => {
    // 站点足迹：种子在站点 coord (0, 0) 米所在区格 (0, 0)，目标 n 格，从种子起每轮取距种子最近、并列取区格序号 (x, y) 小者（卷五 §4.1 规则 10）。
    const rows = new Map([['loc_world', { ...baseRow, parent: null }], ['loc_hw', { ...baseRow, parent: 'loc_world', coord: { x: 0, y: 0 }, targetAreaM2: n * GRID.regionCellM * GRID.regionCellM }]]);
    const r = planRegionFootprints(GRID, [{ w: 0, box: { x0: -5, y0: -5, cellsX: 11, cellsY: 11 }, root: 'loc_world' }], rows);
    return cellList(r.plans.get(0), 'loc_hw');
  };
  const layout = (n, order = homes) => layoutOf(GRID, {
    siteId: 'loc_hw', coord: { x: 0, y: 0 }, cellCount: n, gapCells: gap, regionCells: siteCells(n),
    zones: tpl.map((z, i) => ({ id: `loc_hw:zone${i}`, role: z.role, adjacent: z.adjacent, needCells: 1, targetCells: targetsOf[n][i] })),
    buildings: order.map((h) => ({ key: h.id, ordinal: homes.indexOf(h), role: widest, handWritten: true, facing, bbox })), // ordinal 是行自己的序位，不随传入次序变
  });
  // N = 5：从 (0,0) 起先取距离 1 的四邻，并列按 (x, y)：(−1,0)、(0,−1)、(0,1)、(1,0)，共 5 格，十字形。S 按到 coord (0,0) 的距离排：(−1,0)、(0,−1)、(0,0) 的中心离 coord 都是 5000（平方米），
  // (0,1)、(1,0) 是 25000，并列按 (x, y) → [(−1,0),(0,−1),(0,0),(0,1),(1,0)]。Z=3：种子取第 floor(i × 5 ÷ 3) = 0、1、3 项 → 居住 (−1,0)、作坊 (0,−1)、码头 (0,1)。
  // 居住片从 (−1,0) 长到 (0,0)（2 格）；作坊 1 格；码头种子 (0,1) 的邻格 (0,0) 已被占、(±1,1) 与 (0,2) 不在站点足迹内，只有 1 格。作坊 (0,−1) 与码头 (0,1) 之间隔着 (0,0)，不四邻接 → 排不下。
  assert.deepEqual(siteCells(5).map((c) => [c.x, c.y]), [[-1, 0], [0, -1], [0, 0], [0, 1], [1, 0]]);
  const five = layout(5);
  assert.deepEqual([five.ok, five.reason], [false, REASON.notAdjacent]);
  // N = 6：多取一格 (−1,−1)（距离 √2，并列最小）。S 序 [(−1,−1),(−1,0),(0,−1),(0,0),(0,1),(1,0)]（前四个离 coord 都是 5000，(−1,−1) 的中心 (−50,−50) 也是 5000，按 (x,y) 在最前），
  // 种子取第 floor(i × 6 ÷ 3) = 0、2、4 项：居住 (−1,−1)、作坊 (0,−1)、码头 (0,1)。居住片长到 (−1,0)；码头目标 3 格：(0,1) → (0,0) → (1,0)。
  // 居住与作坊 (−1,−1)–(0,−1) 相邻，作坊与码头 (0,−1)–(0,0) 相邻 → 成立。
  const six = layout(6);
  assert.equal(six.ok, true);
  assert.deepEqual(six.zones.map((z) => [z.role, z.cells.map((c) => [c.x, c.y])]), [
    ['zrole_dwelling', [[-1, -1], [-1, 0]]], ['zrole_workshop', [[0, -1]]], ['zrole_wharf', [[0, 0], [0, 1], [1, 0]]],
  ]);
  assert.deepEqual(six.zones.map((z) => z.coord), [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 150 }]);
  // 居住片外包 x −100..−1、y −100..99。行架从西南角 (−100,−100) 起：行 y=−100 外扩 2 出了足迹，换行（本行无已放，行距 0 + gap 2）到 y = −98；
  // x = −100、−99 外扩出界，x = −98 外扩 [−100..−90]×[−100..−90]... 在足迹内 → 外包 [−98..−93]×[−98..−93]（宽深各 6）；锚点 = (x0 − dx0, y0 − dy0) = (−98 + 5, −98 − 0) = (−93, −98)。
  // 之后每栋挪过 a + gap = 6 + 2 = 8 格：锚点 x = −93 + 8 i，y = −98（i = 0..7，最后一栋外包 x 至 −98 + 56 + 5 = −37，外扩 2 到 −35 ≤ −1）。
  assert.equal(six.buildings.length, homes.length);
  six.buildings.forEach((b, i) => {
    assert.deepEqual([b.anchor.x, b.anchor.y], [-93 + 8 * i, -98]);
    assert.equal(b.zone, 0);
    assert.equal(b.facing, 4);
  });
  // 确定性：同输入两次相同；打乱手写行顺序结果相同；中间排另一座站点的布局不影响（纯函数、无共享状态）。
  assert.deepEqual(layout(6), six);
  assert.deepEqual(layout(6, [...homes].reverse()), six);
  layoutOf(GRID, { siteId: 'loc_other', coord: { x: 10, y: 10 }, cellCount: 1, gapCells: gap, regionCells: [{ x: 0, y: 0 }], zones: [], buildings: [{ key: 'x', ordinal: 0, role: 'r', handWritten: true, facing: 0, bbox }] });
  assert.deepEqual(layout(6), six);
  // A10-7.2 不变量（断言式，不抄读数）：每片内建筑占地之和不超过分片面积；各分片目标格数之和等于 N；每片至少一格；建筑外扩 gapCells 后在父分片内、两两外扩后不相交；模板的相邻要求成立。
  const A = GRID.regionCellM * GRID.regionCellM;
  assert.equal(targetsOf[6].reduce((s, v) => s + v, 0), 6);
  six.zones.forEach((z, zi) => {
    assert.ok(z.cells.length >= 1);
    const foot = six.buildings.filter((b) => b.zone === zi).reduce((s, b) => s + (b.rect.x1 - b.rect.x0 + 1) * (b.rect.y1 - b.rect.y0 + 1), 0);
    assert.ok(foot <= z.cells.length * A);
  });
  const per = GRID.regionCellM / GRID.cellM;
  for (const b of six.buildings) {
    const zc = new Set(six.zones[b.zone].cells.map((c) => `${c.x},${c.y}`));
    for (const [x, y] of [[b.rect.x0 - gap, b.rect.y0 - gap], [b.rect.x1 + gap, b.rect.y1 + gap], [b.rect.x0 - gap, b.rect.y1 + gap], [b.rect.x1 + gap, b.rect.y0 - gap]]) assert.ok(zc.has(`${Math.floor(x / per)},${Math.floor(y / per)}`));
  }
  for (let i = 0; i < six.buildings.length; i += 1) for (let j = i + 1; j < six.buildings.length; j += 1) {
    const p = six.buildings[i].rect;
    const q = six.buildings[j].rect;
    assert.ok(q.x1 < p.x0 - gap || q.x0 > p.x1 + gap || q.y1 < p.y0 - gap || q.y0 > p.y1 + gap);
  }
  // 特殊值不放过：gapCells 0 拒收（不当作"不留街巷"放过）。
  throwsDomain(() => layoutOf(GRID, { siteId: 'loc_hw', coord: { x: 0, y: 0 }, cellCount: 1, gapCells: 0, regionCells: [{ x: 0, y: 0 }], zones: [], buildings: [] }));
});

test('河湾村是不分片站点（卷十 R10-7.1：站点下有直挂的手写建筑行即候选为空）：真数据里每栋建筑都直挂 loc_hw，layoutOf 用空 zones、整个站点足迹当一个分片，夹具房子排得下', () => {
  const direct = LOCATIONS.filter((l) => l.id.startsWith('bld_') && l.parent === 'loc_hw');
  assert.equal(direct.length, START.rows.length); // 数据里的建筑全是直挂站点的行，所以站点不分片
  const bbox = { dx0: -5, dy0: 0, dx1: 0, dy1: 5 }; // 夹具 6×6、facing 4（见上例手算）
  // 站点足迹取 (0,0) 一格（夹具）；八栋 6×6、gapCells 2、每栋占 8 格宽：第一栋外包 x0 = 0 + 2，锚点 x = 2 + 5 = 7；y0 = 0 + 2 → 锚点 y = 2；之后 x 每栋 +8：7、15、23、31、39、47、55、63（63 + 0 外包至 x1 = 63，外扩 2 = 65 ≤ 99）。
  const r = layoutOf(GRID, { siteId: 'loc_hw', coord: { x: 0, y: 0 }, cellCount: 1, gapCells: 2, regionCells: [{ x: 0, y: 0 }], zones: [],
    buildings: FIX_HOMES.map((h, i) => ({ key: h.id, ordinal: i, role: 'none', handWritten: true, facing: 4, bbox })) });
  assert.equal(r.ok, true);
  assert.deepEqual(r.zones, []);
  r.buildings.forEach((b, i) => { assert.deepEqual([b.anchor.x, b.anchor.y], [7 + 8 * i, 2]); assert.equal(b.zone, null); });
});
