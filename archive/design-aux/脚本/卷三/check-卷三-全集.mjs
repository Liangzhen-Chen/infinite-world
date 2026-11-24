// 卷三参考材料全集核对（拆卷后版本）。只读文档，只打印，不改任何文件。
// 用法：node F:/dnd/docs/统一底层设计/脚本/卷三/check-卷三-全集.mjs
// 数值、来料反应、本源成分词表、密度域、植物部位、易燃度出处区间读卷三甲；阈值、对应关系、应得结果、测试温度读卷三乙；
// 审查方的原预期读 审查/卷三-参考材料全集.md（只用来对照差异）；食性条目读卷四；植物部位词表读卷二十五 §2.4。
// 第六版：另读卷三甲 §4.5.5 例 5（纤维含量，只核 M-19 的"碳水不小于纤维"）、例 8（干基碳水）、例 9（植物科）、例 10（成堆燃烧直接证据），
//   §2.2 的 plant_family、burn_evidence 两族。
// 甲 逐种：加载校验、派生大类、类别、可能物态集，与应得结果比对；
// 乙 测试温度逐例（当时物态）；丙 物品层三条选料；丁 每条规则正反例；戊 同输入不同预期；
// 己 落空与双归；庚 与审查预期的差异都有裁定依据；辛 卷四余项 N-2（营养必填与食草取食）；
// 壬 碰线报告（参考堆出处区间碰到燃料门槛、谷物总能贴着 17 而在文献误差之内的行；只打印，不判失败）；
// 癸 纤维与木竹的单件、成堆两栏（第五版，李白要求的断言组）；子 谷物名单（第六版七条件）；
// 丑 燃料三来源（第六版，李白裁定"直接证据优先"）：每种可燃材料列单件判定、成堆判定、依据来源（直接证据代号/推算/未知）。
import { readFileSync } from 'node:fs';

const DIR = 'F:/dnd/docs/统一底层设计/';
const JIA = DIR + '卷三甲-物质本源.md';
const YI = DIR + '卷三乙-物态类别与物品.md';
const SET = DIR + '审查/卷三-参考材料全集.md';
const V4 = DIR + '卷四-生物身体与人物.md';
const V25 = DIR + '卷二十五-农牧渔猎与食物链.md';

const out = [];
let fail = 0;
const say = (s) => out.push(s);
const check = (ok, s) => { out.push((ok ? 'PASS ' : 'FAIL ') + s); if (!ok) fail += 1; };
const load = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n').split('\n');
const jia = load(JIA); const yi = load(YI); const set = load(SET); const v4 = load(V4); const v25 = load(V25);
const cellsOf = (l) => l.split('|').slice(1, -1).map((c) => c.trim().replace(/`/g, ''));
const block = (lines, b, e) => {
  const a = lines.findIndex((l) => l.startsWith(b));
  const z = lines.findIndex((l, i) => i > a && l.startsWith(e));
  if (a < 0 || z < 0) throw new Error('缺标记 ' + b);
  return lines.slice(a + 1, z);
};
const tableRows = (blk) => {
  const r = blk.filter((l) => l.startsWith('|')).map(cellsOf).filter((c) => !c.every((x) => /^:?-+:?$/.test(x)));
  return { head: r[0], body: r.slice(1) };
};
const NA = (s) => s === '—' || s === '' || s === undefined;
const num = (s) => (NA(s) ? null : Number(s));
const list = (s) => (NA(s) ? [] : s.split(/\s+/).filter(Boolean));
const eqSet = (a, b) => a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ');

// ---------- 读卷三乙：阈值、对应、规则文本 ----------
const derive = block(yi, '<!--MATERIAL-DERIVE-BEGIN-->', '<!--MATERIAL-DERIVE-END-->').join('\n');
const dnum = (key) => {
  const m = derive.match(new RegExp('\\| `?' + key.replace(/\./g, '\\.').replace(/[（）]/g, (x) => x) + '`? \\| (-?[\\d.]+) \\|'));
  return m ? Number(m[1]) : null;
};
// 第五版：谷物的部位键取的是代号，不是数
const dcode = (key) => {
  const m = derive.match(new RegExp('\\| `' + key.replace(/\./g, '\\.') + '` \\| ([a-z_]+) \\|'));
  return m ? m[1] : null;
};
const TH = {};
// 第四版：加读成堆规则的 rules.thermal.pile.reliefMax（卷三乙 §4.11 T-15，核对值表已有这一行）
// 第五版：加读 rules.thermal.pile.minCount（成形件成堆的件数下限；参考堆按成堆计，只核它读得到）
// 第六版：加读 rules.materials.grainCarbMin（谷物干基碳水下限）
for (const k of ['rules.materials.charDecomposeMin', 'rules.materials.charHeatMin', 'rules.materials.fatMeltMax', 'rules.materials.fatHeatMin',
  'rules.materials.volatileMin', 'rules.materials.grainMoistureMax', 'rules.materials.grainEnergyMin', 'rules.materials.grainCarbMin', 'rules.crafting.forgeMinMelt',
  'rules.crafting.forgeMalleabilityMin', 'rules.items.fuelHeatMin', 'rules.items.fuelFlammabilityMin', 'rules.thermal.pile.reliefMax', 'rules.thermal.pile.minCount', 'rules.items.saltContentMin']) TH[k.split('.').pop()] = dnum(k);
TH.envMin = dnum('环境温度域下限（卷二十，示例）');
TH.envMax = dnum('环境温度域上限（卷二十，示例）');
const GRAIN_PART = dcode('rules.materials.grainPart');
// 第六版：谷物所属的科也是代号，经规则表键 grainFamily 读，脚本不写死
const GRAIN_FAMILY = dcode('rules.materials.grainFamily');
const pairMap = (re) => Object.fromEntries([...derive.matchAll(re)].map((m) => [m[1], m[2]]));
const substClass = pairMap(/`(subst_[a-z_]+)`→`(class_[a-z_]+)`/g);
const catClass = pairMap(/`(matcat_[a-z_]+)`→`(class_[a-z_]+)`/g);
const reactCat = pairMap(/`(reaction_[a-z_]+)`→`(matcat_[a-z_]+)`/g);
const modM = derive.match(/冷焰组件类 Sc：`heatValue` 乘 ([\d.]+)/);
const coldMul = modM ? Number(modM[1]) : null;

const mcRows = tableRows(block(yi, '<!--MATCAT-RULES-BEGIN-->', '<!--MATCAT-RULES-END-->')).body;
const ruleText = (name) => (mcRows.find((c) => c[0] === name) || []).slice(1).join(' ');
const textCheck = [
  ['炭质', ['comp_burnable', 'meltPoint', 'charDecomposeMin', 'charHeatMin']],
  ['蜡脂', ['comp_burnable', 'comp_drinkable', 'fatMeltMax', 'fatHeatMin', 'volatileMin']],
  ['挥发可燃物', ['comp_burnable', 'volatileMin']],
  // 第五版：谷物条件加"部位为种子"（plantPart 同 rules.materials.grainPart 比）
  // 第六版：再加干基碳水下限（carbContent 同 grainCarbMin 比）与植物科（plantFamily 同 grainFamily 比）
  ['谷物', ['substance', 'plantPart', 'grainPart', 'comp_edible', 'grainMoistureMax', 'grainEnergyMin', 'carbContent', 'grainCarbMin', 'plantFamily', 'grainFamily']],
  ['织物', ['producedBy', '擀毡']],
  ['纸', ['producedBy']],
  ['陶瓷', ['producedBy', '烧成']],
  ['超自然', ['组件类']],
];
const yiText = yi.join('\n');
// 乙的规则表（§2.5）里不得再有物态用的全局参考温度键；全卷不得再有物态类
const s25 = yi.findIndex((l) => l.startsWith('### 2.5 ')); const s26 = yi.findIndex((l) => l.startsWith('### 2.6 '));
const rulesTable = yi.slice(s25, s26).join('\n');
const REFKEY = 'rules.thermal.' + 'refTemp';
const SOLIDC = 'class_' + 'solid'; const LIQC = 'class_' + 'liquid';

// ---------- 读卷三甲：数据、反应、词表、域、部位、出处区间 ----------
const S = tableRows(block(jia, '<!--MATERIAL-DATA-BEGIN-->', '<!--MATERIAL-DATA-END-->'));
const H = Object.fromEntries(S.head.map((h, i) => [h, i]));
const badCols = S.body.filter((c) => c.length !== S.head.length).map((c) => c[0]);
// 第五版：植物部位（§4.5.5 例 6）与易燃度出处区间（例 7）各是一张短表，按代号并进材料行
const PP = tableRows(block(jia, '<!--PLANTPART-DATA-BEGIN-->', '<!--PLANTPART-DATA-END-->'));
const PPH = Object.fromEntries(PP.head.map((h, i) => [h, i]));
const ppById = Object.fromEntries(PP.body.map((c) => [c[PPH['代号']], { subst: c[PPH['本源成分']], part: NA(c[PPH['植物部位']]) ? null : c[PPH['植物部位']] }]));
const FR = tableRows(block(jia, '<!--FLAMRANGE-DATA-BEGIN-->', '<!--FLAMRANGE-DATA-END-->'));
const FRH = Object.fromEntries(FR.head.map((h, i) => [h, i]));
const frById = Object.fromEntries(FR.body.map((c) => [c[FRH['代号']], {
  loxLo: num(c[FRH['极限氧下界']]), loxHi: num(c[FRH['极限氧上界']]), min: num(c[FRH['区间下端 min']]), max: num(c[FRH['区间上端 max']]),
}]));
// 第六版：纤维含量（例 5）、干基碳水（例 8）、植物科（例 9）、成堆燃烧直接证据（例 10），各是一张短表，按代号并进材料行
const FB = tableRows(block(jia, '<!--FIBER-DATA-BEGIN-->', '<!--FIBER-DATA-END-->'));
const FBH = Object.fromEntries(FB.head.map((h, i) => [h, i]));
const fiberById = Object.fromEntries(FB.body.map((c) => [c[FBH['代号']], num(c[FBH['纤维含量']])]));
const CB = tableRows(block(jia, '<!--CARB-DATA-BEGIN-->', '<!--CARB-DATA-END-->'));
const CBH = Object.fromEntries(CB.head.map((h, i) => [h, i]));
const carbById = Object.fromEntries(CB.body.map((c) => [c[CBH['代号']], { val: num(c[CBH['干基碳水']]), basis: c[CBH['依据']], note: c[CBH['备注']] }]));
const PF = tableRows(block(jia, '<!--PLANTFAMILY-DATA-BEGIN-->', '<!--PLANTFAMILY-DATA-END-->'));
const PFH = Object.fromEntries(PF.head.map((h, i) => [h, i]));
const famById = Object.fromEntries(PF.body.map((c) => [c[PFH['代号']], { fam: NA(c[PFH['植物科']]) ? null : c[PFH['植物科']], src: c[PFH['出处']] }]));
const PE = tableRows(block(jia, '<!--PILE-EVIDENCE-DATA-BEGIN-->', '<!--PILE-EVIDENCE-DATA-END-->'));
const PEH = Object.fromEntries(PE.head.map((h, i) => [h, i]));
const evById = Object.fromEntries(PE.body.map((c) => [c[PEH['代号']], { code: c[PEH['证据代号']], src: c[PEH['出处与要点']] }]));
const pfRow = jia.find((l) => l.startsWith('| plant_family → ')) || '';
const pfVocab = new Set([...pfRow.matchAll(/`(pfam_[a-z_]+)`/g)].map((x) => x[1]));
const PF_UNKNOWN = (pfRow.match(/未知 `(pfam_[a-z_]+)`/) || [])[1] || null;
const bevRow = jia.find((l) => l.startsWith('| burn_evidence → ')) || '';
const bevVocab = new Set([...bevRow.matchAll(/`(bev_[a-z_]+)`/g)].map((x) => x[1]));
const v25Row = v25.find((l) => l.startsWith('| `plant_part` |')) || '';
const ppVocab = new Set([...v25Row.matchAll(/`(ppart_[a-z_]+)`/g)].map((x) => x[1]));
const PLANT_SUBST = ['subst_plant', 'subst_wood']; // 卷三甲 §2.1 plantPart 的 bySubstance 所列两项
const M = S.body.map((c) => {
  const g = (h) => c[H[h]];
  const id = g('代号');
  const note = g('备注') || '';
  return {
    id, name: g('名称'), subst: NA(g('本源成分')) ? null : g('本源成分'), comps: list(g('组件类')),
    dS: num(g('密度固')), dL: num(g('密度液')), dG: num(g('密度气')),
    // 第二版：卷三甲把"燃点"一栏分成"自燃点""闪点"两栏，加"极限氧""依据"两栏（一审第 7、8 条，李白 11-13 裁定）；按新表头读
    heat: num(g('热值')), ignite: num(g('自燃点')), flash: num(g('闪点')), mp: num(g('熔点')), bp: num(g('沸点')), dp: num(g('分解点')),
    vol: num(g('挥发度')), moist: num(g('含水率')), energy: num(g('干基饱腹')), salt: num(g('盐分')),
    solidStrength: g('固相承力') === '填', mall: num(g('延展性')), flam: num(g('易燃度')), lox: num(g('极限氧')), basis: g('依据'),
    note, // 第四版：只给壬组碰线报告读文献范围，不参与任何判定；第六版另用它认出展平继承的行（M-21 不随继承带下来）
    // 第五版：植物部位（不在部位表里的行为 null）；易燃度出处区间（没登记的行为 null）
    part: ppById[id] ? ppById[id].part : null, inPP: Boolean(ppById[id]),
    range: frById[id] ? { min: frById[id].min, max: frById[id].max } : null,
    // 第六版：纤维含量（只核 M-19）、干基碳水（未核到为 null）、植物科（不在科表里或留空为 null）、成堆燃烧直接证据代号（没登记为 null）
    fiber: fiberById[id] === undefined ? null : fiberById[id],
    carb: carbById[id] ? carbById[id].val : null, inCarb: Boolean(carbById[id]), carbBasis: carbById[id] ? carbById[id].basis : null,
    fam: famById[id] ? famById[id].fam : null, inPF: Boolean(famById[id]),
    ev: evById[id] ? evById[id].code : null,
    inherited: /展平继承/.test(note),
  };
});
const byId = Object.fromEntries(M.map((m) => [m.id, m]));
const idByName = Object.fromEntries(M.map((m) => [m.name, m.id]));
const R = tableRows(block(jia, '<!--REACT-BEGIN-->', '<!--REACT-END-->')).body;
const producedBy = {}; const badReact = [];
for (const [src, r, prod] of R) { if (!byId[src] || !byId[prod]) badReact.push(src + '→' + prod); (producedBy[prod] ||= new Set()).add(r); }
const substRow = jia.find((l) => l.startsWith('| substance → ')) || '';
const vocab = new Set([...substRow.matchAll(/`(subst_[a-z_]+)`/g)].map((m) => m[1]));
const reactRow = jia.find((l) => l.startsWith('| reaction → ')) || '';
const densRow = jia.find((l) => l.startsWith('| `density` |')) || '';
const dm = densRow.match(/各 \[([\d.]+),([\d.]+)\]；`gas` \[([\d.]+),([\d.]+)\]/);
const densDom = dm ? { sl: [Number(dm[1]), Number(dm[2])], g: [Number(dm[3]), Number(dm[4])] } : null;

// ---------- 读卷三乙：应得结果、测试温度 ----------
const E = tableRows(block(yi, '<!--EXPECT-BEGIN-->', '<!--EXPECT-END-->'));
const EH = Object.fromEntries(E.head.map((h, i) => [h, i]));
const EXP = Object.fromEntries(E.body.map((c) => [c[0], {
  poss: list(c[EH['预期可能物态集']]), cats: list(c[EH['预期派生大类']]), classes: list(c[EH['预期类别']]),
  forge: c[EH['预期锻料']] === '是', fuel: c[EH['预期燃料']] === '是', salt: c[EH['预期盐类']] === '是', why: c[EH['与全集审查预期的差异']] || '',
}]));
const CASES = tableRows(block(yi, '<!--PHASE-CASES-BEGIN-->', '<!--PHASE-CASES-END-->')).body.map((c) => ({ id: c[0], T: Number(c[1]), st: c[2], past: c[3] === '是' }));

// ---------- 规则（卷三乙 T-2、T-13、T-15、M-9、C-8、§4.7；卷三甲 M-11、M-13、M-16 至 M-21） ----------
const has = (m, c) => m.comps.includes(c) || (c === 'S' && m.comps.includes('Sc'));
const byDecompose = (m) => m.mp === null || (m.dp !== null && m.dp < m.mp);
// T-2 第 ③ 步：一份材料、一个温度
const stateAt = (m, T) => {
  if (m.mp === null && m.dp === null) return { st: null };
  if (byDecompose(m)) return { st: '固', past: false };
  const past = m.dp !== null && m.dp > m.mp && T >= m.dp;
  if (T < m.mp) return { st: '固', past };
  if (m.bp !== null && T >= m.bp) return { st: '气', past };
  return { st: '液', past };
};
// T-13：按区间算（与逐温度取样是两种独立算法，己组互核）
const possibleOf = (m) => {
  if (m.mp === null && m.dp === null) return [];
  if (byDecompose(m)) return ['固'];
  const p = [];
  if (TH.envMin < m.mp) p.push('固');
  if (m.mp <= TH.envMax && (m.bp === null || TH.envMin < m.bp)) p.push('液');
  if (m.bp !== null && m.bp <= TH.envMax) p.push('气');
  return p;
};
// 卷三甲 §2.3：易燃度 = clamp(1 − 极限氧 ÷ 42, 0, 1)；全集大表取两位，例 7 区间取四位
const flamOfLox = (lox, digits) => { const p = 10 ** digits; return Math.round(Math.min(1, Math.max(0, 1 - lox / 42)) * p) / p; };
const loadFails = (m) => {
  const f = [];
  if (m.mp === null && m.dp === null) f.push('甲 M-11① 熔点、分解点都没有');
  if (m.mp !== null && !byDecompose(m) && m.bp === null && !(m.dp !== null && m.dp > m.mp)) f.push('甲 M-11② 受热先化开而没有沸点、也没有高于熔点的分解点');
  if (m.dS === null && m.dL === null && m.dG === null) f.push('甲 M-13 密度三栏全空');
  if (densDom) {
    for (const [k, v] of [['固', m.dS], ['液', m.dL]]) if (v !== null && (v < densDom.sl[0] || v > densDom.sl[1])) f.push('甲 M-13 密度' + k + '栏 ' + v + ' 出域');
    if (m.dG !== null && (m.dG < densDom.g[0] || m.dG > densDom.g[1])) f.push('甲 M-13 密度气栏 ' + m.dG + ' 出域');
  }
  if (m.subst && !vocab.has(m.subst)) f.push('甲 M-14 本源成分 ' + m.subst + ' 不在封闭词表');
  if (has(m, 'B') && (m.heat === null || m.moist === null || m.vol === null)) f.push('甲 可燃组件类 requires 不全（热值、含水率、挥发度）');
  if (has(m, 'B') && !(m.flam > 0)) f.push('甲 M-7 可燃而易燃度不大于 0');
  if (m.bp !== null && m.mp !== null && !(m.bp > m.mp)) f.push('甲 M-15 沸点不高于熔点');
  // 第二版新增的三组校验（卷三甲 M-7、M-15 与 §2.3 的易燃度换算），都是加严，原有各条不动
  const meltsFirst = m.mp !== null && !byDecompose(m);
  if (has(m, 'B') && meltsFirst && m.flash === null) f.push('甲 M-7 受热先化开的可燃材料没有闪点');
  if (!(has(m, 'B') && meltsFirst) && m.flash !== null) f.push('甲 M-7 不该有闪点的材料填了闪点');
  if (m.flash !== null && m.ignite !== null && !(m.flash < m.ignite)) f.push('甲 M-7 闪点不低于自燃点');
  if (has(m, 'B') && m.ignite === null) f.push('甲 可燃组件类 requires 不全（自燃点）');
  if (m.energy !== null && m.heat !== null && !(m.energy >= m.heat)) f.push('甲 M-15 干基总能低于热值');
  const conv = m.lox === null ? 0 : flamOfLox(m.lox, 2);
  if (m.flam !== conv) f.push('甲 §2.3 易燃度 ' + m.flam + ' 不等于由极限氧换算的 ' + conv);
  if (has(m, 'B') !== (m.lox !== null)) f.push('甲 可燃与"极限氧"一栏不对应');
  if ((m.energy !== null && !/能:/.test(m.basis)) || (m.lox !== null && !/氧:/.test(m.basis))) f.push('甲 §4.5 干基总能或极限氧没注来源类别');
  // 第五版新增（卷三甲 M-17、M-18），都是加严，原有各条不动
  // M-17：植物质的行缺部位只记缺口（不算加载失败，见甲0 的警告清单）；不适用的行写了、或代号不在卷二十五 plant_part 族，加载失败
  if (m.inPP && !PLANT_SUBST.includes(m.subst)) f.push('甲 M-17 本源成分不是植物质的行写了植物部位');
  if (m.inPP && ppById[m.id].subst !== m.subst) f.push('甲 M-17 部位表的本源成分同大表不一致');
  if (m.part !== null && !ppVocab.has(m.part)) f.push('甲 M-17 植物部位 ' + m.part + ' 不在卷二十五 plant_part 族');
  // M-18：填了区间则 0 ≤ min ≤ 易燃度 ≤ max ≤ 1；两栏同有同无；易燃度为 0 的行不得填
  if (m.range) {
    const { min, max } = m.range;
    if (min === null || max === null) f.push('甲 M-18 出处区间两栏不同有同无');
    else if (!(min >= 0 && max <= 1 && min <= m.flam && m.flam <= max)) f.push('甲 M-18 易燃度 ' + m.flam + ' 不在出处区间 [' + min + ',' + max + '] 内或区间出 [0,1]');
    if (m.flam === 0) f.push('甲 M-18 易燃度为 0 的行填了出处区间');
  }
  // 第六版新增（卷三甲 M-19、M-20、M-21），都是加严，原有各条不动
  // M-19：碳水在 [0,1]、不小于同行已知的纤维含量；未核到的只记缺口（甲0 警告清单），留空须与依据"碳:未核"对应，每行注依据代号与出处
  if (m.carb !== null && !(m.carb >= 0 && m.carb <= 1)) f.push('甲 M-19 干基碳水 ' + m.carb + ' 出 [0,1]');
  if (m.carb !== null && m.fiber !== null && m.carb < m.fiber) f.push('甲 M-19 干基碳水 ' + m.carb + ' 小于纤维含量 ' + m.fiber);
  if (m.inCarb && (m.carb === null) !== (m.carbBasis === '碳:未核')) f.push('甲 M-19 碳水留空与依据"碳:未核"不对应');
  if (m.inCarb && !/^碳:(食|饲|定|推|未核)$/.test(m.carbBasis || '')) f.push('甲 §4.5.5 例 8 碳水没注依据代号');
  if (m.inCarb && NA(carbById[m.id].note)) f.push('甲 §4.5.5 例 8 碳水没注出处');
  // M-20：科只对植物质行登记；代号须在 plant_family 族；逐行带出处
  if (m.inPF && !PLANT_SUBST.includes(m.subst)) f.push('甲 M-20 本源成分不是植物质的行登记了植物科');
  if (m.fam !== null && !pfVocab.has(m.fam)) f.push('甲 M-20 植物科 ' + m.fam + ' 不在 plant_family 族');
  if (m.inPF && NA(famById[m.id].src)) f.push('甲 M-20 植物科没带出处');
  // M-21：证据代号须在 burn_evidence 族、只在可燃行、不随继承带下来
  if (m.ev !== null && !bevVocab.has(m.ev)) f.push('甲 M-21 证据代号 ' + m.ev + ' 不在 burn_evidence 族');
  if (m.ev !== null && !has(m, 'B')) f.push('甲 M-21 不可燃的料登记了成堆燃烧直接证据');
  if (m.ev !== null && m.inherited) f.push('甲 M-21 展平继承的行带着成堆燃烧直接证据');
  return f;
};
// 第六版谷物七条件（卷三乙 M-9 谷物一行）：子组另写一份独立求值互核
const isGrain = (m) => m.subst === 'subst_plant' && m.part !== null && m.part === GRAIN_PART && has(m, 'E')
  && m.moist !== null && m.moist <= TH.grainMoistureMax && m.energy !== null && m.energy >= TH.grainEnergyMin
  && m.carb !== null && m.carb >= TH.grainCarbMin && m.fam !== null && m.fam === GRAIN_FAMILY;
const catsOf = (m) => {
  const cats = [];
  if (has(m, 'B') && m.mp === null && m.dp !== null && m.dp >= TH.charDecomposeMin && m.heat !== null && m.heat >= TH.charHeatMin) cats.push('matcat_char');
  if (has(m, 'B') && !has(m, 'D') && m.mp !== null && m.mp <= TH.fatMeltMax && m.heat !== null && m.heat >= TH.fatHeatMin && m.vol !== null && m.vol < TH.volatileMin) cats.push('matcat_wax_fat');
  if (has(m, 'B') && m.vol !== null && m.vol >= TH.volatileMin) cats.push('matcat_volatile_fuel');
  // 第五版（卷三乙 M-9 谷物一行）：原有四条之外加"部位为种子"；部位缺失（M-17 记缺口）的行不进候选；纤维含量不参与
  // 第六版：再加干基碳水不低于 grainCarbMin、植物科等于 grainFamily；碳水未知（M-19）、科留空或未知（M-20）的行不进候选
  if (isGrain(m)) cats.push('matcat_grain');
  for (const r of producedBy[m.id] || []) if (reactCat[r] && !cats.includes(reactCat[r])) cats.push(reactCat[r]);
  if (has(m, 'S')) cats.push('matcat_supernatural');
  return cats;
};
const classesOf = (subst, cats) => {
  const cl = [];
  for (const k of [subst, ...cats]) { if (!k) continue; const c = k in substClass ? substClass[k] : catClass[k]; if (c && !cl.includes(c)) cl.push(c); }
  return cl;
};
const effHeat = (m) => (m.heat === null ? null : m.heat * (m.comps.includes('Sc') ? coldMul : 1)); // M-12 有效值
const isForge = (m) => m.mp !== null && m.mp >= TH.forgeMinMelt && m.mall !== null && m.mall >= TH.forgeMalleabilityMin;
// 第五版改读法（卷三乙第五版 §4.11 T-15、C-8 燃料类，李白 11-13 裁定；门槛 0.5 照读，不放宽）：
// T-15 ②：pileFlammability = clamp(F + reliefMax × G, 0, 1)，成堆 G 取 1、不成堆取 0；F 为 0 时恒为 0。
//   F 是单件易燃度的有效值，即卷三甲 §2.3 那一种测法（火向下、最难方向）的单件值（M-12 的组件类修正示例只改热值，易燃度不变）。
//   参考堆按成堆计（存着备烧的东西按成堆存放计），G 取 1；第五版起没有 0 到 1 之间的排法系数，间距、层数、堆密各曲线待标定、不生效，不读。
// T-15 ③：同一条式子分别用在卷三甲 flammabilityRange 的 min、max 上，得区间；没有登记区间的退化为一个点（无区间按点值）。
// T-15 ④ 碰线通则：低端高于门槛才过线；高端低于门槛不过线；其余（门槛落在区间里或正碰着一端）是碰线，按未知处理、不算燃料、记缺口待标定。
//   用极限氧说：成堆后的极限氧区间整个低于 21 才算成堆燃料，跨线或碰线判未知。
// 单件判法（癸组用）：同一套比法，G 取 0，即直接拿向下最难方向的单件值（或其出处区间）同门槛比。
// 第六版（卷三乙 T-15 第 ⑤ 款，李白 11-13 裁定"直接证据优先"）：成堆，且这一堆的每一份可燃材料都登记了已登记的 pileBurnEvidence 代号
//   → 判"成堆烧得住"，优先于 ② 至 ④ 的推算，不比门槛、不读 reliefMax；不成堆或缺一份 → 照推算。参考堆只由一种料做成，
//   "每一份可燃材料"就是它自己。直接证据不改 pileFlammability 的数值（壬组照旧打推算的数），也不让单件变成燃料。
const G_PILE = 1; const G_SINGLE = 0;
const pileOf = (F, G, relief = TH.reliefMax) => (F === null ? null : F === 0 ? 0 : Math.min(1, Math.max(0, F + relief * G)));
const R9 = (x) => Math.round(x * 1e9) / 1e9; // 只消浮点尾差（例 7 的四位小数加 0.0619 正好落在 0.5 上），不改任何比法
const rangeOf = (m, G, relief = TH.reliefMax) => {
  if (m.flam === null) return [null, null];
  return m.range ? [pileOf(m.range.min, G, relief), pileOf(m.range.max, G, relief)] : [pileOf(m.flam, G, relief), pileOf(m.flam, G, relief)];
};
const verdictOf = ([lo, hi]) => (lo === null || hi === null ? 'unknown' : R9(lo) > TH.fuelFlammabilityMin ? 'fuel' : R9(hi) < TH.fuelFlammabilityMin ? 'no' : 'edge');
const VERDICT_NAME = { fuel: '燃料', no: '非燃料', edge: '碰线（未知，不算燃料，待标定）', unknown: '未知' };
const hasEvidence = (m) => has(m, 'B') && m.ev !== null && bevVocab.has(m.ev);
// 一般式：pile 为真按成堆（G=1），为假按单件（G=0）；useEvidence 为真时第 ⑤ 款生效（只在成堆时适用）
const verdictBy = (m, { pile, relief = TH.reliefMax, useEvidence = true }) => {
  if (pile && useEvidence && hasEvidence(m)) return 'fuel';
  return verdictOf(rangeOf(m, pile ? G_PILE : G_SINGLE, relief));
};
const heatOk = (m) => has(m, 'B') && effHeat(m) !== null && effHeat(m) * (1 - (m.moist ?? 0)) >= TH.fuelHeatMin;
const pileVerdict = (m) => verdictBy(m, { pile: true });
const inferredPileVerdict = (m) => verdictBy(m, { pile: true, useEvidence: false });
const singleVerdict = (m) => verdictBy(m, { pile: false });
// 依据来源三者之一：直接证据（第 ⑤ 款适用）；推算（② 至 ④ 判出燃料或非燃料）；未知（推算碰线或缺数）
const pileSource = (m) => (hasEvidence(m) ? '直接证据' : ['fuel', 'no'].includes(inferredPileVerdict(m)) ? '推算' : '未知');
const isFuel = (m) => heatOk(m) && pileVerdict(m) === 'fuel';
const isSalt = (m) => m.salt !== null && m.moist !== null && m.salt * (1 - m.moist) >= TH.saltContentMin;
const evaluate = (m) => {
  const cats = catsOf(m);
  const fails = loadFails(m);
  if (!m.subst && cats.length === 0) fails.push('乙 M-9 本源成分与派生大类同为空');
  const poss = possibleOf(m);
  // 乙 I-9：可能物态集里的每种物态，密度对应栏必须有值
  for (const [k, v] of [['固', m.dS], ['液', m.dL], ['气', m.dG]]) if (poss.includes(k) && v === null) fails.push('乙 I-9 可能为' + k + '而密度' + k + '栏为空');
  return { cats, classes: classesOf(m.subst, cats), poss, fails, forge: isForge(m), fuel: isFuel(m), salt: isSalt(m) };
};
const wrongOf = (m, e) => {
  const x = EXP[m.id]; const w = [];
  if (!x) return ['应得结果表里没有这一行'];
  if (e.fails.length) w.push('加载失败（' + e.fails.join('；') + '）');
  if (!eqSet(e.poss, x.poss)) w.push('可能物态集 [' + e.poss.join(' ') + ']≠预期[' + x.poss.join(' ') + ']');
  if (!eqSet(e.cats, x.cats)) w.push('派生大类 [' + e.cats.join(' ') + ']≠预期[' + x.cats.join(' ') + ']');
  if (!eqSet(e.classes, x.classes)) w.push('类别 [' + e.classes.join(' ') + ']≠预期[' + x.classes.join(' ') + ']');
  return w;
};

// ---------- 甲0 ----------
say('== 甲0 读入 ==');
say('卷三乙阈值：' + Object.entries(TH).map(([k, v]) => k + '=' + v).join(' ') + '；冷焰组件类热值乘子=' + coldMul + '；谷物部位键 grainPart=' + GRAIN_PART + '；谷物科键 grainFamily=' + GRAIN_FAMILY);
say('卷三乙对照：本源成分→类别 ' + Object.keys(substClass).length + ' 对，派生大类→类别 ' + Object.keys(catClass).length + ' 对，来料反应→派生大类 ' + Object.keys(reactCat).length + ' 对；卷三甲本源成分词表 ' + vocab.size + ' 项；密度域 固液[' + (densDom ? densDom.sl.join(',') : '') + '] 气[' + (densDom ? densDom.g.join(',') : '') + ']');
check(Object.values(TH).every((v) => Number.isFinite(v)) && Number.isFinite(coldMul) && densDom !== null, '阈值、环境温度域、密度域全部读到');
check(GRAIN_PART !== null && ppVocab.size > 0 && ppVocab.has(GRAIN_PART), '谷物部位键 rules.materials.grainPart 读到，且是卷二十五 §2.4 plant_part 族里登记过的代号（族内 ' + ppVocab.size + ' 项）');
check(GRAIN_FAMILY !== null && pfVocab.size > 0 && pfVocab.has(GRAIN_FAMILY) && GRAIN_FAMILY !== PF_UNKNOWN, '谷物科键 rules.materials.grainFamily 读到，是卷三甲 §2.2 plant_family 族里登记过的代号且不是"未知"一项（族内 ' + pfVocab.size + ' 项，未知一项 ' + PF_UNKNOWN + '）');
check(bevVocab.size > 0, '卷三甲 §2.2 burn_evidence 族读到（' + bevVocab.size + ' 项）');
const txtBad = textCheck.filter(([n, keys]) => { const t = ruleText(n); return !t || keys.some((k) => !t.includes(k)); }).map(([n]) => n);
check(txtBad.length === 0 && mcRows.length === textCheck.length, '规则文本自检：八条派生大类条件仍是脚本所实现的写法' + (txtBad.length ? '（已变：' + txtBad.join('、') + '）' : '') + '；蜡脂条件含热值下限与挥发度上限，不含物态；谷物条件含部位为种子、干基碳水下限、植物科');
const grainCondCell = (mcRows.find((c) => c[0] === '谷物') || [])[1] || '';
check(grainCondCell.includes('plantPart 等于 rules.materials.grainPart') && !/fiberContent|纤维/.test(grainCondCell), '谷物条件栏含"部位为种子"，不含纤维含量（第五版：纤维不参与谷物判定）');
check(grainCondCell.includes('carbContent ≥ rules.materials.grainCarbMin') && grainCondCell.includes('plantFamily 等于 rules.materials.grainFamily'), '谷物条件栏含"干基碳水不低于 grainCarbMin""植物科等于 grainFamily"（第六版七条件）');
// 第五版改写：燃料判定的正文仍是脚本所实现的写法（T-15 ② 的式子与 G 的取法、③ 出处区间、④ 碰线通则；C-8 燃料类读 pileFlammability 并按碰线通则比；
// 单件值是火向下、最难方向的值；只启用 reliefMax，其余待标定、不生效）
const t15Row = yi.find((l) => l.startsWith('| T-15 |')) || '';
const fuelRow = yi.find((l) => l.startsWith('| `class_fuel` |')) || '';
const flamUnitRow = jia.find((l) => l.startsWith('| `flam_index` |')) || '';
check(t15Row.includes('pileFlammability = clamp(F + rules.thermal.pile.reliefMax × G, 0, 1)') && t15Row.includes('成堆时 G 取 1，不成堆取 0') && t15Row.includes('`flammabilityRange` 的 `min`、`max`')
  && t15Row.includes('低端高于门槛，过线；高端低于门槛，不过线') && t15Row.includes('按成堆计') && t15Row.includes('待标定、不生效') && !t15Row.includes('件数系数取 1')
  && fuelRow.includes('pileFlammability ≥ rules.items.fuelFlammabilityMin') && fuelRow.includes('碰线通则') && flamUnitRow.includes('向下、最难方向'),
  '规则文本自检：T-15 的式子（成堆 G 取 1）、出处区间、碰线通则、参考堆按成堆计、各曲线待标定不生效；C-8 燃料类读 pileFlammability 按碰线通则比；单件值是向下最难方向的值，仍是脚本所实现的写法');
// 第六版：规则文本自检加 T-15 第 ⑤ 款（直接证据优先于推算；成堆且每一份可燃材料都登记才适用；不比门槛、不读 reliefMax；不改数值；不让单件成燃料）
check(t15Row.includes('⑤ **直接证据优先') && t15Row.includes('`pileBurnEvidence`') && t15Row.includes('每一份可燃材料') && t15Row.includes('优先于第 ② 至 ④ 款的推算')
  && t15Row.includes('不依赖 `reliefMax`') && t15Row.includes('不改 `pileFlammability` 的数值') && t15Row.includes('也不让单件变成燃料') && fuelRow.includes('T-15 第 ⑤ 款'),
  '规则文本自检：T-15 第 ⑤ 款（成堆且各份可燃材料都登记了直接证据即判烧得住，优先于推算、不依赖 reliefMax、不改数值、不让单件成燃料）；C-8 燃料类读第 ⑤ 款，仍是脚本所实现的写法');
const pileKeyRow = yi.find((l) => l.startsWith('| `rules.thermal.pile.reliefMax` / ')) || '';
check(t15Row.includes('**方向迁移假设（待标定，加载出警告）**') && pileKeyRow.includes('"假设、待标定"') && pileKeyRow.includes('只有 `reliefMax` 生效'),
  'reliefMax 是唯一生效的成堆常数，带"假设、待标定"标记（方向迁移假设），加载进警告清单');
const stateWords = mcRows.filter((c) => /物温|当时物态|matterState|possibleMatterStates/.test(c[1])).map((c) => c[0]);
check(stateWords.length === 0, '派生大类条件栏不读物温、当时物态、可能物态集（命中 ' + stateWords.length + ' 条' + (stateWords.length ? '：' + stateWords.join('、') : '') + '）');
check(!rulesTable.includes(REFKEY) && !rulesTable.includes('rules.materials.classRules'), '卷三乙规则表（§2.5）里没有物态用的全局参考温度键，也没有材料类别规则表（裁定 1）');
const stray = yi.concat(jia).filter((l) => l.includes(SOLIDC) || l.includes(LIQC)).length;
check(stray === 0, '卷三甲、卷三乙全文没有固态类、液态类两个类别代号（命中 ' + stray + ' 行）');
check(/擀毡/.test(reactRow) && /煅烧/.test(reactRow), '卷三甲反应词表含擀毡、煅烧');
check(!byId.mat_ice && !byId.mat_pathogen && Boolean(byId.mat_eggshell), '全集里没有冰的行、没有水中病原的行，有蛋壳的行');
say('全集：' + M.length + ' 种材料，来料反应 ' + R.length + ' 条');
check(badCols.length === 0 && badReact.length === 0 && M.every((m) => EXP[m.id]) && Object.keys(EXP).length === M.length, '表自洽：列数齐、反应表引用的材料都在、应得结果表与数据表逐行对应（列数不对 ' + badCols.length + '，坏引用 ' + badReact.length + '）');
const selfBad = M.filter((m) => !eqSet(classesOf(m.subst, EXP[m.id] ? EXP[m.id].cats : []), EXP[m.id] ? EXP[m.id].classes : []));
check(selfBad.length === 0, '应得结果自洽：预期类别 = 本源成分的类别 + 预期派生大类的类别（不一致 ' + selfBad.length + ' 种' + (selfBad.length ? '：' + selfBad.map((m) => m.id).join(' ') : '') + '）');
// 第五版：卷三甲 M-17（植物部位）的表级核对
const plantRows = M.filter((m) => PLANT_SUBST.includes(m.subst)).map((m) => m.id);
const ppStray = Object.keys(ppById).filter((id) => !byId[id]);
check(eqSet(plantRows, Object.keys(ppById)) && ppStray.length === 0, '卷三甲例 6 部位表的行集合恰是本源成分为草本植物质、木质的 ' + plantRows.length + ' 行（表内 ' + Object.keys(ppById).length + ' 行，表里有而大表没有的 ' + ppStray.length + '）；其余行不登记部位');
// 第五版：卷三甲 M-18（易燃度出处区间）的表级核对：区间两端由极限氧上下界按 §2.3 换算（四位），极限氧低的一端易燃度高
const frBad = Object.entries(frById).filter(([id, r]) => !byId[id] || r.loxLo === null || r.loxHi === null || r.min !== flamOfLox(r.loxHi, 4) || r.max !== flamOfLox(r.loxLo, 4) || !has(byId[id], 'B')).map(([id]) => id);
check(FR.body.length > 0 && frBad.length === 0, '卷三甲例 7 易燃度出处区间 ' + FR.body.length + ' 行：都是可燃材料，两端由极限氧上下界按 §2.3 换算得出（不符 ' + frBad.length + (frBad.length ? '：' + frBad.join('、') : '') + '）；M-18 逐行在甲组加载校验里核');
// 第六版：卷三甲 M-20（植物科）表级核对：只植物行登记，行集合同部位表；M-19（碳水）、M-21（直接证据）的引用都在大表里
const pfStray = Object.keys(famById).filter((id) => !byId[id]);
check(eqSet(plantRows, Object.keys(famById)) && pfStray.length === 0, '卷三甲例 9 植物科表只登记植物质行：行集合恰是本源成分为草本植物质、木质的 ' + plantRows.length + ' 行（表内 ' + Object.keys(famById).length + ' 行，表里有而大表没有的 ' + pfStray.length + '）；逐行代号与出处在甲组加载校验里核');
const cbStray = Object.keys(carbById).filter((id) => !byId[id]);
const peStray = Object.keys(evById).filter((id) => !byId[id]);
check(CB.body.length > 0 && cbStray.length === 0 && PE.body.length > 0 && peStray.length === 0, '卷三甲例 8 碳水表 ' + CB.body.length + ' 行、例 10 直接证据表 ' + PE.body.length + ' 行，引用的材料都在大表里（碳水表多出 ' + cbStray.length + '，证据表多出 ' + peStray.length + '）');
// 第五版：加载警告清单（卷三甲 §3.5；只打印，规则层不读）。第六版加两类：碳水未核到（gap）、植物科留空或未知
const warnPart = M.filter((m) => PLANT_SUBST.includes(m.subst) && m.part === null).map((m) => m.name);
const warnUnverified = M.filter((m) => /氧:未核/.test(m.basis)).map((m) => m.name);
const warnCarb = M.filter((m) => m.inCarb && m.carb === null).map((m) => m.name);
const warnFam = M.filter((m) => PLANT_SUBST.includes(m.subst) && (m.fam === null || m.fam === PF_UNKNOWN)).map((m) => m.name);
say('加载警告清单 ① 植物质行缺植物部位（gap）' + warnPart.length + ' 行：' + warnPart.join('、') + '；② 极限氧依据"未核" ' + warnUnverified.length + ' 行：' + warnUnverified.join('、') + '；③ 假设常数：rules.thermal.pile.reliefMax（方向迁移假设、待标定）'
  + '；④ 干基碳水未核到（gap，不算谷物）' + warnCarb.length + ' 行：' + warnCarb.join('、') + '；⑤ 植物科留空或未知（按非谷物处理）' + warnFam.length + ' 行：' + warnFam.join('、'));

// ---------- 甲 ----------
say('');
say('== 甲 逐种计算 ==');
const wrong = [];
const ev = {};
for (const m of M) {
  const e = evaluate(m); ev[m.id] = e;
  const w = wrongOf(m, e);
  if (w.length) wrong.push(m);
  say((w.length ? '错 ' : '对 ') + m.id + ' ' + m.name + '：' + (e.fails.length ? '加载失败' : '加载') + '，可能[' + e.poss.join(' ') + ']，大类[' + e.cats.join(' ') + ']，类别[' + e.classes.join(' ') + ']' + (w.length ? ' ← ' + w.join('；') : ''));
}
check(wrong.length === 0, '甲 小计：' + M.length + ' 种，推对 ' + (M.length - wrong.length) + '，推错 ' + wrong.length + (wrong.length ? '（' + wrong.map((m) => m.name).join('、') + '）' : ''));

// ---------- 乙 ----------
say('');
say('== 乙 测试温度逐例（当时物态，T-2 材料级判法） ==');
let caseBad = 0;
for (const c of CASES) {
  const m = byId[c.id];
  const r = m ? stateAt(m, c.T) : { st: '无此材料' };
  const ok = m && r.st === c.st && Boolean(r.past) === c.past;
  if (!ok) caseBad += 1;
  say((ok ? '对 ' : '错 ') + c.id + ' @ ' + c.T + '℃ → ' + r.st + (r.past ? '（已过分解点）' : '') + '；预期 ' + c.st + (c.past ? '（已过分解点）' : ''));
}
const need = [['mat_water', -5, '固'], ['mat_water', 20, '液']];
const needOk = need.every(([id, T, st]) => CASES.some((c) => c.id === id && c.T === T && c.st === st) && byId[id] && stateAt(byId[id], T).st === st);
check(caseBad === 0 && CASES.length >= 12, '乙 小计：' + CASES.length + ' 例，错 ' + caseBad);
check(needOk, '水在 −5℃ 推为固、20℃ 推为液，同一行材料，没有冰的行');
check(catsOf.length === 1, '派生大类的计算只收材料一个参数，不收温度：任一材料在任何温度下大类相同');

// ---------- 丙 ----------
say('');
say('== 丙 物品层选料（按"只由这一种材料做成的物品"判；燃料按参考堆判） ==');
const sel = [
  ['锻料（熔点+延展性）', isForge, (m) => EXP[m.id].forge],
  ['燃料类（可燃、每千克折合热量过线、参考堆成堆烧得住：先看直接证据（T-15 第 ⑤ 款，第六版），没有的按碰线通则推算（有出处区间的按区间、无区间按点值）；热值取 M-12 有效值）', isFuel, (m) => EXP[m.id].fuel],
  ['盐类（收到基盐分过线）', isSalt, (m) => EXP[m.id].salt],
];
let selBad = 0;
for (const [name, f, ex] of sel) {
  const fp = M.filter((m) => f(m) && !ex(m)).map((m) => m.name);
  const fn = M.filter((m) => !f(m) && ex(m)).map((m) => m.name);
  selBad += fp.length + fn.length;
  say(name + '：预期是 ' + M.filter(ex).length + ' 种；错选 ' + fp.length + (fp.length ? '（' + fp.join('、') + '）' : '') + '；漏选 ' + fn.length + (fn.length ? '（' + fn.join('、') + '）' : ''));
}
check(selBad === 0, '丙 小计：三条选料规则错选、漏选合计 ' + selBad);

// ---------- 丁 ----------
say('');
say('== 丁 每条派生规则的正例、反例（按预期数；"算出"是规则命中数） ==');
const rules = [
  ['可能为固', (m) => EXP[m.id].poss.includes('固'), (m) => ev[m.id].poss.includes('固')],
  ['可能为液', (m) => EXP[m.id].poss.includes('液'), (m) => ev[m.id].poss.includes('液')],
  ['可能为气', (m) => EXP[m.id].poss.includes('气'), (m) => ev[m.id].poss.includes('气')],
  ...['matcat_char', 'matcat_wax_fat', 'matcat_volatile_fuel', 'matcat_grain', 'matcat_textile', 'matcat_paper', 'matcat_ceramic', 'matcat_supernatural']
    .map((c) => [c, (m) => EXP[m.id].cats.includes(c), (m) => ev[m.id].cats.includes(c)]),
  ...[...vocab].map((s) => [s + ' → 类别', (m) => m.subst === s, (m) => m.subst === s]),
  ['M-9 身份非空（本源成分留空、靠派生大类过）', (m) => !m.subst && EXP[m.id].cats.length > 0, (m) => !m.subst && ev[m.id].cats.length > 0 && !ev[m.id].fails.length],
  ...sel.map(([n, f, ex]) => [n, ex, f]),
];
const thin = []; const off = [];
for (const [name, ex, got] of rules) {
  const pos = M.filter(ex).length; const neg = M.length - pos; const hit = M.filter(got).length;
  if (pos === 0 || neg === 0) thin.push(name);
  if (hit !== pos) off.push(name);
  say((pos && neg && hit === pos ? 'PASS ' : 'FAIL ') + name + '：正例 ' + pos + '，反例 ' + neg + '，算出 ' + hit);
}
check(thin.length === 0 && off.length === 0, '丁 小计：' + rules.length + ' 条规则，缺正例或反例的 ' + thin.length + (thin.length ? '（' + thin.join('、') + '）' : '') + '，算出数与预期数不等的 ' + off.length);

// ---------- 戊 ----------
say('');
say('== 戊 体系装不下：规则可读的物性全同、预期却不同 ==');
say('比较的维度：本源成分、组件类、热值、自燃点、闪点、熔点、沸点、分解点、挥发度、含水率、干基饱腹、盐分、易燃度、易燃度出处区间、植物部位、干基碳水、植物科、成堆燃烧直接证据、来料反应；密度各栏不比（分态栏是同一行里的几组数）');
const sig = (m) => JSON.stringify([m.subst, [...m.comps].sort(), m.heat, m.ignite, m.flash, m.mp, m.bp, m.dp, m.vol, m.moist, m.energy, m.salt, m.flam, m.range, m.part, m.carb, m.fam, m.ev, [...(producedBy[m.id] || [])].sort()]);
const groups = {};
for (const m of M) (groups[sig(m)] ||= []).push(m);
let misfit = 0;
for (const g of Object.values(groups)) {
  if (g.length < 2) continue;
  const outs = new Set(g.map((m) => EXP[m.id].poss.join(' ') + '|' + [...EXP[m.id].cats].sort().join(' ')));
  if (outs.size > 1) { misfit += 1; say('同输入不同预期：' + g.map((m) => m.name).join(' 与 ')); }
}
check(misfit === 0, '戊 小计：同输入不同预期的组 ' + misfit + ' 个');

// ---------- 己 ----------
say('');
say('== 己 落空与双归（全量） ==');
// 三个物态的温度区间各自独立写成谓词，逐温度取样数"恰属一态"；再把取样并集同 T-13 的区间算法、同应得结果三方互核
const inSolid = (m, T) => byDecompose(m) || T < m.mp;
const inLiquid = (m, T) => !byDecompose(m) && T >= m.mp && (m.bp === null || T < m.bp);
const inGas = (m, T) => !byDecompose(m) && m.bp !== null && T >= m.bp && T >= m.mp;
const empty = []; const dual = []; const setMismatch = [];
let samples = 0;
for (const m of M) {
  const seen = new Set(); let none = 0; let two = 0;
  for (let k = Math.round(TH.envMin * 2); k <= Math.round(TH.envMax * 2); k += 1) {
    const T = k / 2; samples += 1;
    const hits = [inSolid(m, T) ? '固' : null, inLiquid(m, T) ? '液' : null, inGas(m, T) ? '气' : null].filter(Boolean);
    if (hits.length === 0) none += 1; else if (hits.length > 1) two += 1;
    hits.forEach((h) => seen.add(h));
    if (hits.length === 1 && stateAt(m, T).st !== hits[0]) two += 1;
  }
  const e = ev[m.id];
  const identityEmpty = !m.subst && e.cats.length === 0;
  const densGap = e.fails.some((f) => f.includes('I-9'));
  if (none > 0 || seen.size === 0 || identityEmpty || densGap) empty.push(m.name + (identityEmpty ? '（身份空）' : none > 0 || seen.size === 0 ? '（有温度无物态）' : '（可能物态缺密度栏）'));
  const bothCat = e.cats.includes('matcat_wax_fat') && e.cats.includes('matcat_volatile_fuel');
  if (two > 0 || bothCat) dual.push(m.name + (bothCat ? '（蜡脂与挥发可燃物同归）' : '（同一温度两种物态）'));
  if (!eqSet([...seen], e.poss)) setMismatch.push(m.name);
  // 单料物品的加载期判定各有唯一答案：聚集形态必填与否、是否要容器运
  const needForm = e.poss.includes('固'); const formNA = !e.poss.includes('固');
  if (needForm === formNA) dual.push(m.name + '（聚集形态必填与不适用同真或同假）');
}
say('取样：每种材料在 [' + TH.envMin + ',' + TH.envMax + '] 内每 0.5℃ 一点，共 ' + samples + ' 点');
check(empty.length === 0, '落空 ' + empty.length + ' 种（身份为空、某温度下无物态、可能物态缺密度栏，三种都算）' + (empty.length ? '：' + empty.join('、') : ''));
check(dual.length === 0, '双归 ' + dual.length + ' 种（同一温度判成两种物态、蜡脂与挥发可燃物同归、形态必填判定不唯一，三种都算）' + (dual.length ? '：' + dual.join('、') : ''));
check(setMismatch.length === 0, '可能物态集：逐温度取样的并集 = 区间算法的结果（不一致 ' + setMismatch.length + ' 种' + (setMismatch.length ? '：' + setMismatch.join('、') : '') + '）');
const twoState = M.filter((m) => ev[m.id].poss.length > 1).map((m) => m.name);
say('可能物态集多于一项（要登记越阈日，T-12）的 ' + twoState.length + ' 种：' + twoState.join('、'));

// ---------- 庚 ----------
say('');
say('== 庚 与全集审查预期对照（审查/卷三-参考材料全集.md 第二节的预期栏） ==');
const RS = tableRows(block(set, '<!--SET-BEGIN-->', '<!--SET-END-->'));
const RH = Object.fromEntries(RS.head.map((h, i) => [h, i]));
let same = 0; const diffs = []; const unexplained = []; const dropped = [];
for (const c of RS.body) {
  const id = c[RH['代号']]; const x = EXP[id];
  if (!x) { dropped.push(c[RH['名称']]); continue; }
  const rc = list(c[RH['预期派生大类']]);
  const rcl = list(c[RH['预期类别']]).filter((k) => k !== SOLIDC && k !== LIQC);
  const d = [];
  if (!eqSet(rc, x.cats)) d.push('派生大类');
  if (!eqSet(rcl, x.classes)) d.push('类别');
  if ((c[RH['预期锻料']] === '是') !== x.forge) d.push('锻料');
  if ((c[RH['预期燃料']] === '是') !== x.fuel) d.push('燃料');
  if ((c[RH['预期盐类']] === '是') !== x.salt) d.push('盐类');
  // 审查方的"预期物态"是 20℃ 的那一例：必须落在可能物态集里，且与材料级判法在 20℃ 的结果相同
  const st20 = byId[id] ? stateAt(byId[id], 20).st : null;
  if (st20 !== c[RH['预期物态']] || !x.poss.includes(c[RH['预期物态']])) d.push('20℃ 物态');
  if (d.length === 0) same += 1; else { diffs.push(c[RH['名称']] + '（' + d.join('、') + '：' + (x.why || '无依据') + '）'); if (!x.why) unexplained.push(c[RH['名称']]); }
}
const added = M.filter((m) => !RS.body.some((c) => c[RH['代号']] === m.id));
say('审查全集 ' + RS.body.length + ' 种：与本卷应得结果相同 ' + same + ' 种；不同 ' + diffs.length + ' 种' + (diffs.length ? '：' + diffs.join('；') : ''));
say('按裁定删去的行 ' + dropped.length + ' 种：' + dropped.join('、') + '；本版新增的行 ' + added.length + ' 种：' + added.map((m) => m.name).join('、'));
check(unexplained.length === 0 && added.every((m) => EXP[m.id].why), '庚 小计：与审查预期不同而没写裁定依据的 ' + unexplained.length + ' 种；新增行都写了依据');
check(dropped.length === 2, '删去的恰是冰与水中病原两行');

// ---------- 辛 ----------
say('');
say('== 辛 卷四余项 N-2：营养维度按可消化成分必填；食草取食按卷四 T-4 可算 ==');
// 第二版改读法（两处，都随正文改，不放宽）：
// ① 卷四第七版把 assimilation 由一个数改为 {bySubstance, other}（李白 11-13 裁定），按新结构读；
// ② 卷三甲一审第 2 条：byDigestible 改为逐行对 eats 求值（为真或未知即必填），不再从 eats 的文字里摘"比较过的代号"。
//    逐行判比按成分整类判更严：凡有食性吃得了的行都查，可食组件类的行（盐、油、酒）也在内。
const diets = [];
for (const l of v4) {
  const m = l.match(/^"(diet_[a-z_]+)": \{"eats":"([^"]+)", "assimilation":(\{"bySubstance":\{[^}]*\},"other":(?:null|[\d.]+)\})/);
  if (m) diets.push({ id: m[1], eats: m[2], assim: JSON.parse(m[3]) });
}
// 卷四 T-4：每份的摄入 = 吃下的质量 × 份额 × 该份材料的营养维度 × assimilation；eats 的条件按腐坏进度 0 求值
const evalEats = (d, m) => d.eats.split(/\s+and\s+/).every((cl) => {
  let x;
  if ((x = cl.match(/^material\.classes has (comp_[a-z_]+)$/))) return has(m, { comp_edible: 'E', comp_drinkable: 'D', comp_burnable: 'B', comp_rottable: 'R', comp_durable: 'U', comp_deflagrant: 'X' }[x[1]]);
  if ((x = cl.match(/^material\.substance == (subst_[a-z_]+)$/))) return m.subst === x[1];
  if ((x = cl.match(/^material\.moisture (>=|<=) ([\d.]+)$/))) return m.moist !== null && (x[1] === '>=' ? m.moist >= Number(x[2]) : m.moist <= Number(x[2]));
  if ((x = cl.match(/^lot\.spoilage (>=|<=) ([\d.]+)$/))) return x[1] === '>=' ? 0 >= Number(x[2]) : 0 <= Number(x[2]);
  throw new Error('卷四 eats 条件里有本脚本不认得的写法：' + cl);
});
// 卷四 §2.4：先查 bySubstance，没有键取 other；都查不到，这一份此食性利用不了
const assimOf = (d, m) => (m.subst && m.subst in d.assim.bySubstance ? d.assim.bySubstance[m.subst] : d.assim.other);
const eatenBy = (m) => diets.filter((d) => evalEats(d, m));
const inSet = M.filter((m) => eatenBy(m).length > 0);
const digestible = new Set(inSet.map((m) => m.subst).filter(Boolean));
say('卷四食性条目 ' + diets.length + ' 条：' + diets.map((d) => d.id).join('、') + '；满足 byDigestible 的材料 ' + inSet.length + ' 行；可消化成分集（汇总）：' + [...digestible].join('、'));
check(diets.length > 0 && inSet.length > 0 && [...digestible].every((s) => vocab.has(s)), 'byDigestible 逐行求得出；汇总出的可消化成分集都在卷三甲本源成分词表内');
check(diets.every((d) => Object.keys(d.assim.bySubstance).every((s) => vocab.has(s)) && Object.values(d.assim.bySubstance).concat(d.assim.other === null ? [] : [d.assim.other]).every((v) => v >= 0 && v <= 1)), '各食性吸收率的键都是本源成分代号，值都在 [0,1]');
const lack = inSet.filter((m) => m.moist === null || m.energy === null || m.salt === null);
check(lack.length === 0, '有食性吃得了的材料 ' + inSet.length + ' 种，含水率、干基饱腹、营养素（盐分项）无一缺失（缺 ' + lack.length + ' 种' + (lack.length ? '：' + lack.map((m) => m.name).join('、') : '') + '）');
// 第六版：卷三甲 M-19 的必填范围（byDigestible 或挂可食）恰是例 8 碳水表的行集合；表内每行要么有值、要么"碳:未核"记缺口
const needCarb = M.filter((m) => inSet.includes(m) || has(m, 'E')).map((m) => m.id);
check(eqSet(needCarb, Object.keys(carbById)), '卷三甲例 8 碳水表的行集合恰是 M-19 的必填范围（byDigestible 或挂可食）' + needCarb.length + ' 行（表内 ' + Object.keys(carbById).length + ' 行；范围内表里没有的 ' + needCarb.filter((id) => !carbById[id]).length + '，表里有而范围外的 ' + Object.keys(carbById).filter((id) => !needCarb.includes(id)).length + '）');
const fodder = ['mat_dry_grass', 'mat_straw', 'mat_leaf_litter'];
check(fodder.every((id) => byId[id] && !has(byId[id], 'E') && inSet.includes(byId[id])), '干草、秸秆、落叶三种饲料不挂可食组件类，仍在必填范围内且数值齐全');
check(byId.mat_dung_cake && eatenBy(byId.mat_dung_cake).length === 0, '牛粪饼没有任何食性吃得了（一审第 11 条：本源成分不再借记草本）');
let gapTotal = 0;
for (const d of diets) {
  const eaten = M.filter((m) => evalEats(d, m));
  // 吸收率查不到的那一份按不可食计（卷四 T-4），不算缺口；查得到而能量算不出才是缺口
  const usable = eaten.filter((m) => assimOf(d, m) !== null);
  const gaps = usable.filter((m) => !Number.isFinite(m.moist) || !Number.isFinite(m.energy) || !Number.isFinite(1 * (1 - m.moist) * m.energy * assimOf(d, m)));
  gapTotal += gaps.length;
  const show = usable.slice(0, 6).map((m) => m.name + ' ' + (1 * (1 - m.moist) * m.energy * assimOf(d, m)).toFixed(2)).join('、');
  say(d.id + '：eats 成立的材料 ' + eaten.length + ' 种，吃 1 kg 的能量摄入（satiety）算得出的 ' + (eaten.length - gaps.length) + ' 种，缺口 ' + gaps.length + ' 种' + (eaten.length ? '；例：' + show : ''));
  if (eaten.length === 0) gapTotal += 1;
}
check(gapTotal === 0, '辛 小计：各食性按卷四 T-4 的摄入全部算得出，缺口 ' + gapTotal);

// ---------- 壬 ----------
// 第四版新增：碰线报告。只打印，不进 fail，不改任何判定。第五版：按 T-15 的出处区间报。
// 第六版：这里报的是推算的数（第 ⑤ 款不改 pileFlammability 的数值），判定栏写最终结论与依据来源。
say('');
say('== 壬 碰线报告（只打印，不判失败） ==');
// ① 参考堆整堆有效易燃度的区间碰线（T-15 ④），或区间端点距燃料门槛小于 0.01 的行
const NEAR_FLAM = 0.01;
const fmtR = ([lo, hi]) => (lo === null ? '未知' : lo === hi ? R9(lo).toFixed(4) : '[' + R9(lo).toFixed(4) + ', ' + R9(hi).toFixed(4) + ']');
const flamNear = M.filter((m) => { const r = rangeOf(m, G_PILE); return r[0] !== null && (verdictOf(r) === 'edge' || r.some((v) => Math.abs(v - TH.fuelFlammabilityMin) < NEAR_FLAM)); });
say('参考堆易燃度碰线或端点距门槛 ' + TH.fuelFlammabilityMin + ' 小于 ' + NEAR_FLAM + ' 的 ' + flamNear.length + ' 行' + (flamNear.length ? '：' : ''));
for (const m of flamNear) {
  say('  ' + m.id + ' ' + m.name + '：单件 ' + fmtR(rangeOf(m, G_SINGLE)) + (m.range ? '（出处区间）' : '（点值）') + '，成堆 + ' + TH.reliefMax + ' = ' + fmtR(rangeOf(m, G_PILE))
    + '，判' + VERDICT_NAME[pileVerdict(m)] + '（依据：' + pileSource(m) + '）；应得结果表预期燃料 ' + (EXP[m.id] && EXP[m.id].fuel ? '是' : '否'));
}
// ② 谷物总能距 grainEnergyMin 小于各自文献误差的行。
//    只看总能是唯一决定项的行：草本植物质、部位为种子（第五版）、挂可食、含水率在谷物上限之内、干基碳水与植物科过线（第六版；谷物大类的其余条件都已成立）。
//    文献值取两处：卷三甲全集表本行备注里"总能……范围 a–b"；卷三乙 §4.1.5 grainEnergyMin 说明里"名 值（范围 a–b）"与"……重算的值是 x"。
//    文献误差 = 本行总能到这些文献值的最大距离；查不到文献值的行单列，不猜误差。
const lit = {};
const addLit = (id, ...vs) => { if (id) (lit[id] ||= []).push(...vs); };
for (const m of M) for (const x of m.note.matchAll(/总能[^；]*?范围 ([\d.]+)–([\d.]+)/g)) addLit(m.id, Number(x[1]), Number(x[2]));
const grainNote = yi.find((l) => /^\s*- `grainEnergyMin` = /.test(l)) || '';
for (const x of grainNote.matchAll(/([\u4e00-\u9fff]+) [\d.]+（范围 ([\d.]+)–([\d.]+)）/g)) addLit(idByName[x[1]], Number(x[2]), Number(x[3]));
for (const x of grainNote.matchAll(/([\u4e00-\u9fff]+) [\d.]+，离线 [\d.]+，[^，。；]*?重算的值是 ([\d.]+)/g)) addLit(idByName[x[1]], Number(x[2]));
const grainCand = M.filter((m) => m.subst === 'subst_plant' && m.part !== null && m.part === GRAIN_PART && has(m, 'E') && m.moist !== null && m.moist <= TH.grainMoistureMax
  && m.carb !== null && m.carb >= TH.grainCarbMin && m.fam !== null && m.fam === GRAIN_FAMILY && m.energy !== null);
const grainNear = []; const grainNoLit = [];
for (const m of grainCand) {
  const vs = lit[m.id];
  if (!vs || vs.length === 0) { grainNoLit.push(m.name + ' ' + m.energy); continue; }
  const errOf = Math.max(...vs.map((v) => Math.abs(v - m.energy)));
  const dist = Math.abs(m.energy - TH.grainEnergyMin);
  if (dist < errOf) grainNear.push({ m, errOf, dist, vs });
}
say('谷物候选（草本、部位为种子、可食、含水率不过上限、碳水与科过线）' + grainCand.length + ' 行；' + (grainNote ? '' : '没读到卷三乙 grainEnergyMin 说明行；') + '总能距 ' + TH.grainEnergyMin + ' 小于本行文献误差的 ' + grainNear.length + ' 行' + (grainNear.length ? '：' : ''));
for (const { m, errOf, dist, vs } of grainNear) {
  say('  ' + m.id + ' ' + m.name + '：总能 ' + m.energy + '，距线 ' + dist.toFixed(2) + '，文献值 ' + [...new Set(vs)].join('、') + '，文献误差 ' + errOf.toFixed(2) + '，现判' + (m.energy >= TH.grainEnergyMin ? '谷物' : '非谷物') + '；应得结果表预期大类' + (EXP[m.id] && EXP[m.id].cats.includes('matcat_grain') ? '含' : '不含') + '谷物');
}
say('谷物候选里查不到文献范围、无从比的 ' + grainNoLit.length + ' 行' + (grainNoLit.length ? '：' + grainNoLit.join('、') : ''));

// ---------- 癸 ----------
// 第五版新增（李白要求）：植物纤维、动物纤维与木竹类逐行列"单件可燃 / 成堆可燃"两栏，并逐行断言。任何一行不符即 FAIL，不设例外名单。
// 行的范围由数据定：本源成分为纤维（subst_fiber）或木质（subst_wood）的全部行；纤维行在下表逐行写明组别与预期，
// 表外多出或表里缺的纤维行都算 FAIL（新加的纤维行必须先写预期，不会被悄悄跳过）。木竹类不逐行写，一律断言单件非燃料、成堆燃料。
// 预期的出处：卷三乙 §4.1.5 第五版演算段（"橡木单件 22.7……成堆 20.1……棉 18.0–18.5，单件……就是燃料。丝 23.0–23.6，成堆 20.4–21.0……碰线……
// 山羊毛与毡……不是燃料"）；纸一行正文没有单列，按卷三乙应得结果表"预期燃料 是"与卷三甲易燃度 0.71（离门槛远）记单件、成堆都是燃料。
// warn：卷三甲 §3.5 加载警告清单第 ② 类（极限氧依据"未核"）；断言的是"在不在清单里"，同数据逐行比。
// 第六版：成堆一栏是最终结论（第 ⑤ 款直接证据优先，没有的按推算）；依据来源与 reliefMax 归 0 的复算在丑组逐行断言。
const FIBER_EXPECT = {
  mat_hemp_fiber: { group: '植物纤维', single: 'no', pile: 'fuel', warn: false },
  mat_hemp_cord: { group: '植物纤维', single: 'no', pile: 'fuel', warn: false },
  mat_cotton: { group: '植物纤维', single: 'fuel', pile: 'fuel', warn: false },
  mat_cotton_yarn: { group: '植物纤维', single: 'fuel', pile: 'fuel', warn: false },
  mat_cotton_cloth: { group: '植物纤维', single: 'fuel', pile: 'fuel', warn: false },
  mat_paper: { group: '植物纤维', single: 'fuel', pile: 'fuel', warn: true },
  mat_raw_silk: { group: '动物纤维', single: 'no', pile: 'edge', warn: false },
  mat_silk: { group: '动物纤维', single: 'no', pile: 'edge', warn: false },
  mat_goat_hair: { group: '动物纤维', single: 'no', pile: 'no', warn: true },
  mat_felt: { group: '动物纤维', single: 'no', pile: 'no', warn: true },
};
const WOOD_EXPECT = { group: '木竹类', single: 'no', pile: 'fuel', warn: false };
say('');
say('== 癸 纤维与木竹类：单件可燃 / 成堆可燃两栏（T-15；单件读向下最难方向的单件值；成堆先看直接证据，没有的加 reliefMax 推算，有出处区间的按区间比，碰线判未知不算燃料） ==');
const fiberRows = M.filter((m) => m.subst === 'subst_fiber');
const woodRows = M.filter((m) => m.subst === 'subst_wood');
const fiberUncovered = fiberRows.filter((m) => !FIBER_EXPECT[m.id]).map((m) => m.id);
const fiberMissing = Object.keys(FIBER_EXPECT).filter((id) => !byId[id] || byId[id].subst !== 'subst_fiber');
check(fiberUncovered.length === 0 && fiberMissing.length === 0, '纤维行与断言表一一对应：全集纤维行 ' + fiberRows.length + '，表外 ' + fiberUncovered.length + (fiberUncovered.length ? '（' + fiberUncovered.join('、') + '）' : '') + '，表里有而全集没有或不是纤维 ' + fiberMissing.length + (fiberMissing.length ? '（' + fiberMissing.join('、') + '）' : ''));
check(woodRows.length > 0, '全集木竹类（本源成分为木质）' + woodRows.length + ' 行');
say('| 组别 | 代号 | 名称 | 单件易燃度 | 单件可燃 | 成堆易燃度（推算） | 成堆可燃 | 依据来源 | 警告清单 | 应得结果表预期燃料 |');
const xBad = [];
for (const [rows, expOf] of [[fiberRows.filter((m) => FIBER_EXPECT[m.id]).filter((m) => FIBER_EXPECT[m.id].group === '植物纤维'), (m) => FIBER_EXPECT[m.id]],
  [fiberRows.filter((m) => FIBER_EXPECT[m.id]).filter((m) => FIBER_EXPECT[m.id].group === '动物纤维'), (m) => FIBER_EXPECT[m.id]],
  [woodRows, () => WOOD_EXPECT]]) {
  for (const m of rows) {
    const x = expOf(m);
    const sv = heatOk(m) ? singleVerdict(m) : 'no'; const pv = heatOk(m) ? pileVerdict(m) : 'no';
    const warn = /氧:未核/.test(m.basis);
    const w = [];
    if (sv !== x.single) w.push('单件应为' + VERDICT_NAME[x.single]);
    if (pv !== x.pile) w.push('成堆应为' + VERDICT_NAME[x.pile]);
    if (warn !== x.warn) w.push(x.warn ? '应在警告清单（依据"未核"）' : '不应在警告清单');
    if (EXP[m.id].fuel !== (pv === 'fuel')) w.push('同应得结果表预期燃料不一致');
    if (pv === 'edge' && !(/碰线/.test(EXP[m.id].why) && /待标定/.test(EXP[m.id].why))) w.push('碰线行在应得结果表没写"碰线、待标定"');
    if (w.length) xBad.push(m.name + '（' + w.join('；') + '）');
    say('| ' + x.group + ' | ' + m.id + ' | ' + m.name + ' | ' + fmtR(rangeOf(m, G_SINGLE)) + ' | ' + VERDICT_NAME[sv] + ' | ' + fmtR(rangeOf(m, G_PILE)) + ' | ' + VERDICT_NAME[pv] + ' | ' + pileSource(m) + ' | ' + (warn ? '在' : '—') + ' | ' + (EXP[m.id].fuel ? '是' : '否') + ' |' + (w.length ? ' ← ' + w.join('；') : ''));
  }
}
// 绵羊毛：全集里没有行，卷三乙 §4.1.5 照文献值同法演算；从正文读文献值，按 §2.3 换算（四位，同例 7）后用同一套比法（没有直接证据，纯推算）
const woolM = yiText.match(/绵羊毛全集里没有行，照文献值 ([\d.]+)–([\d.]+)/);
let woolOk = false;
if (woolM) {
  const wm = { flam: flamOfLox(Number(woolM[2]), 4), range: { min: flamOfLox(Number(woolM[2]), 4), max: flamOfLox(Number(woolM[1]), 4) } };
  const sv = verdictOf(rangeOf(wm, G_SINGLE)); const pv = verdictOf(rangeOf(wm, G_PILE));
  woolOk = sv === 'no' && pv === 'edge' && !idByName['绵羊毛'];
  say('| 动物纤维（演算，全集无行） | — | 绵羊毛（极限氧 ' + woolM[1] + '–' + woolM[2] + '） | ' + fmtR(rangeOf(wm, G_SINGLE)) + ' | ' + VERDICT_NAME[sv] + ' | ' + fmtR(rangeOf(wm, G_PILE)) + ' | ' + VERDICT_NAME[pv] + ' | 未知 | — | — |');
}
check(woolOk, '羊毛（绵羊毛，按卷三乙 §4.1.5 引的文献值演算）单件非燃料、成堆碰线待标定；全集里没有这一行' + (woolM ? '' : '（没读到正文的文献值）'));
check(xBad.length === 0, '癸 小计：木竹类单件非燃料、成堆燃料；棉单件燃料；丝单件非燃料、成堆碰线待标定；山羊毛、毡非燃料且在警告清单；不符 ' + xBad.length + ' 行' + (xBad.length ? '：' + xBad.join('、') : ''));

// ---------- 子 ----------
// 第五版新增：谷物名单。判为谷物的恰是正文说的那几行（卷三乙 §4.1.5 谷物说明"谷物仍是……N 行"，从正文读），
// 另用独立写出的条件全集逐行求一遍互核；不存在醪↔酒的谷物自生环。
// 第六版：独立求值由五条件改为七条件（加干基碳水不低于 grainCarbMin、植物科等于 grainFamily；碳水未知、科留空或未知都不过）；
// 非谷物的名单加大豆、竹的各行（名称以"竹"起头的全集行），油菜籽、花生、荞麦、藜麦、苋籽、竹笋、竹叶、竹米在全集里有行时也查，没有行时如实打印。
say('');
say('== 子 谷物名单（卷三乙 M-9 谷物一行，第六版七条件） ==');
const SEVEN = [
  ['本源成分草本植物质', (m) => m.subst === 'subst_plant'],
  ['部位为种子', (m) => m.part !== null && m.part === GRAIN_PART],
  ['可食', (m) => m.comps.includes('E')],
  ['含水率不高于 ' + TH.grainMoistureMax, (m) => m.moist !== null && m.moist <= TH.grainMoistureMax],
  ['干基总能不低于 ' + TH.grainEnergyMin, (m) => m.energy !== null && m.energy >= TH.grainEnergyMin],
  ['干基碳水不低于 ' + TH.grainCarbMin + '（未知不过）', (m) => m.carb !== null && m.carb >= TH.grainCarbMin],
  ['植物科为 ' + GRAIN_FAMILY + '（留空或未知不过）', (m) => m.fam !== null && m.fam === GRAIN_FAMILY],
];
const failedOf = (m) => SEVEN.filter(([, f]) => !f(m)).map(([n]) => n);
const bySeven = M.filter((m) => failedOf(m).length === 0).map((m) => m.id);
const byRule = M.filter((m) => ev[m.id].cats.includes('matcat_grain')).map((m) => m.id);
const byExp = M.filter((m) => EXP[m.id].cats.includes('matcat_grain')).map((m) => m.id);
const textM = yiText.match(/谷物仍是([\u4e00-\u9fff、]+) (\d+) 行/);
const textIds = textM ? textM[1].split('、').map((n) => idByName[n] || '（无此名：' + n + '）') : [];
say('正文：' + (textM ? '谷物 ' + textM[2] + ' 行（' + textM[1] + '）' : '没读到') + '；七条件独立求得：' + bySeven.join(' ') + '；派生规则算出：' + byRule.join(' ') + '；应得结果表：' + byExp.join(' '));
check(textM !== null && textIds.length === Number(textM[2]) && eqSet(byRule, textIds) && eqSet(bySeven, textIds) && eqSet(byExp, textIds),
  '判为谷物的恰是正文所列的 ' + (textM ? textM[1] : '?') + '：派生规则、七条件独立求值、应得结果表三方一致');
// 必须在全集里的非谷物行（缺行即 FAIL）
const NOT_GRAIN = ['mat_rapeseed_oil', 'mat_rice_wine', 'mat_spirits', 'mat_vinegar', 'mat_mash', 'mat_soybean'];
// 竹的各部位：全集里名称以"竹"起头的全部行（由数据定，不列名单）
const bambooRows = M.filter((m) => m.name.startsWith('竹')).map((m) => m.id);
// 若在全集则查的行（按名称找；全集没有行时只打印）
const OPTIONAL_NAMES = ['油菜籽', '花生', '荞麦', '藜麦', '苋籽', '竹笋', '竹叶', '竹米'];
const optionalIds = OPTIONAL_NAMES.map((n) => idByName[n]).filter(Boolean);
const ngBad = [];
for (const id of [...new Set([...NOT_GRAIN, ...bambooRows, ...optionalIds])]) {
  const m = byId[id];
  if (!m) { ngBad.push(id + '（全集没有这一行）'); continue; }
  const why = failedOf(m);
  if (byRule.includes(id) || why.length === 0 || EXP[id].cats.includes('matcat_grain')) ngBad.push(m.name);
  say('  ' + m.name + '：' + (why.length ? '挡住它的条件：' + why.join('、') : '七条件全满足') + '；派生规则' + (byRule.includes(id) ? '判谷物' : '不判谷物'));
}
say('  全集里没有行、不查的：' + OPTIONAL_NAMES.filter((n) => !idByName[n]).join('、'));
check(bambooRows.length > 0 && ngBad.length === 0, '菜籽油、酒、烧酒、醋、醪、大豆、竹的各行（' + bambooRows.length + ' 行）' + (optionalIds.length ? '及全集里有的' + OPTIONAL_NAMES.filter((n) => idByName[n]).join('、') : '') + '都不是谷物，各有挡住它的条件，应得结果表也不列谷物（不符 ' + ngBad.length + (ngBad.length ? '：' + ngBad.join('、') : '') + '）');
const soy = byId.mat_soybean;
check(Boolean(soy) && failedOf(soy).some((n) => n.startsWith('干基碳水')) && failedOf(soy).some((n) => n.startsWith('植物科')), '大豆被碳水、植物科两条各自挡住（第六版裁定）');
// 自生环：谷物大类若能经来料反应传下去（某个反应→谷物），或来料反应表有环（醪→酒→……→醪），谷物身份就可能自己生自己。两样都不许有。
const edges = {};
for (const [src, , prod] of R) (edges[src] ||= []).push(prod);
const reach = (from, to) => { const seen = new Set(); const st = [...(edges[from] || [])]; while (st.length) { const x = st.pop(); if (x === to) return true; if (!seen.has(x)) { seen.add(x); st.push(...(edges[x] || [])); } } return false; };
const cyc = M.filter((m) => reach(m.id, m.id)).map((m) => m.name);
const grainByReact = Object.entries(reactCat).filter(([, c]) => c === 'matcat_grain').map(([r]) => r);
const mashWine = byId.mat_mash && byId.mat_rice_wine && reach('mat_mash', 'mat_rice_wine') && !reach('mat_rice_wine', 'mat_mash');
check(cyc.length === 0 && grainByReact.length === 0 && mashWine && !byRule.includes('mat_mash') && !byRule.includes('mat_rice_wine'),
  '不存在醪↔酒的谷物自生环：来料反应表无环（成环 ' + cyc.length + (cyc.length ? '：' + cyc.join('、') : '') + '），醪到酒单向；没有哪个来料反应推出谷物（' + grainByReact.length + '）；醪、酒都不是谷物');

// ---------- 丑 ----------
// 第六版新增（李白裁定"直接证据优先"，卷三乙 T-15 第 ⑤ 款、V3-4.11-I 第六版各条）：全集每种挂可燃组件类的材料列
// 单件判定 / 成堆判定 / 依据来源（直接证据代号、推算、未知），逐行断言。任何一行与正文应得结果表不符即 FAIL，不设例外名单。
// 断言：① 登记了直接证据的行成堆 = 燃料，把 reliefMax 当 0 重算结论不变；② 没登记的行成堆结论 = 推算结论；③ 任何行单件结论不因证据改变；
// ④ 每行"燃料"（含折合热量条件）= 应得结果表预期燃料；⑤ 直接证据行恰是正文 §4.1.5 第六版段列出的七行，未知行恰是正文列出的推算碰线行；
// ⑥ 正文点名的几行：橡木、竹成堆燃料且依据直接证据；柳条、沼泽树皮依据推算且是燃料；雷击木炭依据推算或未知（不从木炭继承证据）。
say('');
say('== 丑 燃料三来源：单件判定 / 成堆判定 / 依据来源（T-15 第 ⑤ 款直接证据优先，没有的按 ② 至 ④ 推算，推算碰线判未知） ==');
const burnRows = M.filter((m) => has(m, 'B'));
say('| 代号 | 名称 | 单件判定 | 成堆判定 | 依据来源 | 推算结论 | reliefMax 归 0 后成堆判定 | 燃料（含折合热量） | 应得结果表预期燃料 |');
const yBad = [];
const srcCount = { 直接证据: 0, 推算: 0, 未知: 0 };
for (const m of burnRows) {
  const sv = singleVerdict(m); const pv = pileVerdict(m); const inf = inferredPileVerdict(m);
  const src = pileSource(m); srcCount[src] += 1;
  const pv0 = verdictBy(m, { pile: true, relief: 0 });
  const fuel0 = heatOk(m) && pv0 === 'fuel';
  const w = [];
  if (src === '直接证据') {
    if (pv !== 'fuel') w.push('有直接证据而成堆不是燃料');
    if (pv0 !== pv || fuel0 !== isFuel(m)) w.push('reliefMax 归 0 后结论变了');
  } else if (pv !== inf) w.push('没登记证据而成堆结论不等于推算');
  if (sv !== verdictBy(m, { pile: false, useEvidence: false })) w.push('单件结论受了证据影响');
  if (isFuel(m) !== EXP[m.id].fuel) w.push('燃料与应得结果表不符');
  if (src === '未知' && isFuel(m)) w.push('依据未知而算成了燃料');
  if (w.length) yBad.push(m.name + '（' + w.join('；') + '）');
  say('| ' + m.id + ' | ' + m.name + ' | ' + VERDICT_NAME[sv] + ' | ' + VERDICT_NAME[pv] + ' | ' + (src === '直接证据' ? '直接证据 ' + m.ev : src) + ' | ' + VERDICT_NAME[inf] + ' | ' + VERDICT_NAME[pv0] + ' | ' + (isFuel(m) ? '是' : '否') + ' | ' + (EXP[m.id].fuel ? '是' : '否') + ' |' + (w.length ? ' ← ' + w.join('；') : ''));
}
say('依据来源：直接证据 ' + srcCount.直接证据 + ' 行，推算 ' + srcCount.推算 + ' 行，未知 ' + srcCount.未知 + ' 行（可燃材料共 ' + burnRows.length + ' 行）');
check(yBad.length === 0, '丑 逐行：直接证据行成堆燃料且 reliefMax 归 0 结论不变；未登记行等于推算；单件不受证据影响；燃料与应得结果表一致（不符 ' + yBad.length + ' 行' + (yBad.length ? '：' + yBad.join('、') : '') + '）');
// ⑤ 与正文的名单对照（名单从正文读，不在脚本里写）
const namesOf = (re) => { const x = yiText.match(re); return x ? x[1].split('、').map((n) => idByName[n] || '（无此名：' + n + '）') : null; };
const textEv = namesOf(/登记的行读卷三甲 §4\.5\.5 例 10，首批七行：([\u4e00-\u9fff、]+)。/);
const textUnknown = namesOf(/\*\*未知\*\*（推算碰线的行：([\u4e00-\u9fff、]+)，/);
const gotEv = burnRows.filter((m) => pileSource(m) === '直接证据').map((m) => m.id);
const gotUnknown = burnRows.filter((m) => pileSource(m) === '未知').map((m) => m.id);
check(textEv !== null && eqSet(gotEv, textEv) && eqSet(Object.keys(evById), textEv), '依据为直接证据的行恰是卷三乙 §4.1.5 列出、卷三甲例 10 登记的 ' + (textEv ? textEv.length : '?') + ' 行（算出 ' + gotEv.length + '：' + gotEv.map((id) => byId[id].name).join('、') + '）');
check(textUnknown !== null && eqSet(gotUnknown, textUnknown), '依据为未知的行恰是卷三乙 §4.1.5 列出的推算碰线行（算出 ' + gotUnknown.length + '：' + gotUnknown.map((id) => byId[id].name).join('、') + '）');
// ⑥ 正文点名的几行（卷三乙 §4.1.5 第六版段、§4.11.5 例 5、卷三甲例 10 之后的说明）
const NAMED = [
  ['mat_oak', ['直接证据'], 'fuel'],
  ['mat_bamboo', ['直接证据'], 'fuel'],
  ['mat_wicker', ['推算'], 'fuel'],
  ['mat_marsh_bark', ['推算'], 'fuel'],
  ['mat_thunderstruck_char', ['推算', '未知'], null],
];
const namedBad = [];
for (const [id, srcs, pile] of NAMED) {
  const m = byId[id];
  if (!m) { namedBad.push(id + '（全集没有这一行）'); continue; }
  const src = pileSource(m);
  if (!srcs.includes(src)) namedBad.push(m.name + '（依据 ' + src + '，应为 ' + srcs.join('或') + '）');
  if (pile !== null && pileVerdict(m) !== pile) namedBad.push(m.name + '（成堆 ' + VERDICT_NAME[pileVerdict(m)] + '，应为 ' + VERDICT_NAME[pile] + '）');
  if (isFuel(m) !== EXP[id].fuel) namedBad.push(m.name + '（燃料与应得结果表不符）');
}
check(namedBad.length === 0, '橡木、竹成堆燃料且依据直接证据；柳条、沼泽树皮依据推算、成堆燃料（同类证据不算）；雷击木炭依据推算或未知（证据不随继承带下来）（不符 ' + namedBad.length + (namedBad.length ? '：' + namedBad.join('、') : '') + '）');

say('----');
say('合计：全集 ' + M.length + ' 种；推错 ' + wrong.length + ' 种；测试温度 ' + CASES.length + ' 例错 ' + caseBad + '；选料错 ' + selBad + '；落空 ' + empty.length + ' 种；双归 ' + dual.length + ' 种；同输入不同预期 ' + misfit + ' 组；N-2 缺口 ' + gapTotal + '；碰线（只报）易燃 ' + flamNear.length + ' 行、谷物 ' + grainNear.length + ' 行；纤维木竹两栏不符 ' + xBad.length + ' 行；燃料三来源不符 ' + yBad.length + ' 行（直接证据 ' + srcCount.直接证据 + '、推算 ' + srcCount.推算 + '、未知 ' + srcCount.未知 + '）；未通过断言 ' + fail + ' 项');
console.log(out.join('\n'));
process.exitCode = fail === 0 ? 0 : 1;
