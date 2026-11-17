// P-3 一次性离线转换：把卷三甲 §4.5.5 全集（93 行）与各短表、旧 material-props.json（标签 old-final-1117）转成
// world/ontology/dimensions/{material,_vocab,_units}.json 与 world/i18n/labels.zh.json。
// 用法：node tools/convert-material.mjs [--check]   （无参数写文件；--check 只打印报告）
// 规则都是整类：列到字段、组件类字母到组件类、旧物理块与旧营养类别行到新类别行；没有按单个材料 id 的分支。
// 卷文没给的值一律不填（不凭记忆、不设缺省），由校验器如实报缺。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VOL = join(ROOT, 'docs/统一底层设计/卷三甲-物质本源.md');
const OUT = join(ROOT, 'world/ontology/dimensions');
const CHECK = process.argv.includes('--check');
const report = { mismatch: [], skipped: [], notes: [] };

// ---------- 读卷文表 ----------
const doc = readFileSync(VOL, 'utf8');
const lines = doc.split('\n');
const between = (tag) => {
  const a = lines.findIndex((l) => l.includes(`<!--${tag}-BEGIN-->`));
  const b = lines.findIndex((l) => l.includes(`<!--${tag}-END-->`));
  return lines.slice(a + 1, b).filter((l) => l.startsWith('| ') && !l.startsWith('| 代号') && !l.startsWith('| 来料')).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
};
const NUM = /^-?\d+(\.\d+)?$/;
const num = (c, where) => {
  if (c === undefined || c === '—' || c === '') return undefined;
  if (NUM.test(c)) return Number(c);
  report.skipped.push(`${where}: 非数值格 "${c.slice(0, 20)}"`);
  return undefined;
};
const setIf = (o, k, v) => { if (v !== undefined) o[k] = v; };
const requiredTerms = (s) => (typeof s === 'string' ? s.split('；').map((x) => x.trim()) : []);
const sortObj = (o) => (Array.isArray(o) ? o.map(sortObj) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortObj(o[k])])) : o);

// 组件类字母（卷三甲 §4.5.5 读表约定）；S、Sc 是卷十五登记的超自然组件类，本卡未载入卷十五词表，不写。
const COMP = { B: 'comp_burnable', E: 'comp_edible', D: 'comp_drinkable', R: 'comp_rottable', U: 'comp_durable', X: 'comp_deflagrant' };

const rows = {};
const main = between('MATERIAL-DATA');
for (const c of main) {
  const [id, , , subst, comps, dS, dL, dG, heat, ign, flash, melt, boil, decomp, vol, moist, energy, salt, , malle, , flam, basisCode, note] = c;
  const r = {};
  if (subst !== '—') r.substance = subst;
  const cls = comps === '—' ? [] : comps.replace(/\bSc\b|\bS\b/g, '').split(/\s+/).filter(Boolean);
  if (comps.match(/\bSc?\b/)) report.skipped.push(`${id}: 超自然组件类（S/Sc）未载入，卷十五登记`);
  const cc = [...new Set(cls.map((l) => COMP[l]))].filter(Boolean).sort();
  if (cc.length) r.classes = cc;
  const density = {};
  setIf(density, 'solid', num(dS, id)); setIf(density, 'liquid', num(dL, id)); setIf(density, 'gas', num(dG, id));
  if (Object.keys(density).length) r.density = density;
  setIf(r, 'heatValue', num(heat, id)); setIf(r, 'ignitePoint', num(ign, id)); setIf(r, 'flashPoint', num(flash, id));
  setIf(r, 'meltPoint', num(melt, id)); setIf(r, 'boilPoint', num(boil, id)); setIf(r, 'decomposePoint', num(decomp, id));
  setIf(r, 'volatility', num(vol, id)); setIf(r, 'moisture', num(moist, id)); setIf(r, 'energyDensity', num(energy, id));
  const sv = num(salt, id); if (sv !== undefined) r.nutrients = { nutr_salt: sv };
  setIf(r, 'malleability', num(malle, id));
  const fl = num(flam, id); setIf(r, 'flammability', fl);
  // 核对：易燃度 = 1 − 极限氧 ÷ 42（§2.3 flam_index），极限氧栏有数时才核；差超过 0.005 记一条，以易燃度栏为准。
  const lox = num(c[20], id);
  if (lox !== undefined && fl !== undefined && Math.abs(1 - lox / 42 - fl) > 0.005) report.mismatch.push(`${id}: 易燃度 ${fl} ≠ 1−${lox}/42 = ${(1 - lox / 42).toFixed(4)}`);
  r.basis = [c[2], basisCode === '—' ? '' : basisCode, note].filter(Boolean).join('｜');
  rows[id] = { r, name: c[1] };
}
const ids = Object.keys(rows);
const R = (id, where) => { if (!rows[id]) { report.skipped.push(`${where}: 未知材料 ${id}`); return null; } return rows[id].r; };

// 短表里写"—"的格是卷文明说的未知（纤:未核、碳:未核，M-19 与例 5 不许暂填），记下，后面的暂定规则不碰。
const declaredUnknown = new Set();
for (const c of between('FIBER-DATA')) { const r = R(c[0], '纤维'); if (r) setIf(r, 'fiberContent', num(c[2], c[0])); if (c[2] === '—') declaredUnknown.add(`${c[0]}.fiberContent`); }
for (const c of between('CARB-DATA')) { const r = R(c[0], '碳水'); if (r) setIf(r, 'carbContent', num(c[2], c[0])); if (c[2] === '—') declaredUnknown.add(`${c[0]}.carbContent`); }
for (const c of between('PLANTPART-DATA')) { const r = R(c[0], '部位'); if (r && /^ppart_/.test(c[3])) r.plantPart = c[3]; else if (r) report.notes.push(`${c[0]}: 植物部位留空（卷文本格 "${c[3]}"）`); }
for (const c of between('PLANTFAMILY-DATA')) { const r = R(c[0], '植物科'); if (r && /^pfam_/.test(c[3])) r.plantFamily = c[3]; else if (r) report.notes.push(`${c[0]}: 植物科留空（卷文本格 "${c[3]}"）`); }
for (const c of between('PILE-EVIDENCE-DATA')) { const r = R(c[0], '成堆证据'); if (r) r.pileBurnEvidence = c[2]; }
for (const c of between('FLAMRANGE-DATA')) { const r = R(c[0], '区间'); if (r) r.flammabilityRange = { max: num(c[5], c[0]), min: num(c[4], c[0]) }; }
const reactions = new Set();
for (const c of between('REACT')) {
  const r = R(c[0], '来料'); if (!r) continue;
  reactions.add(c[1]);
  r.reactionProducts = { ...(r.reactionProducts || {}), [c[1]]: c[2] };
}

// 例 11：比热、保暖、透气、参照材料（行：代号 | 名称 | 字段 | 值 | 级别 | …）。cellGrades 无处可写，不转（见 docs/问题.md）。
const refs = {};
for (const l of lines.slice(836, 884)) {
  const c = l.split('|').slice(1, -1).map((x) => x.trim());
  if (c.length < 7 || !/^mat_/.test(c[0])) continue;
  const f = c[2].replace(/`/g, '');
  const r = R(c[0], '例11'); if (!r) continue;
  if (c[1] && /refMaterial: (mat_\w+)/.test(c[6])) refs[c[0]] = c[6].match(/refMaterial: (mat_\w+)/)[1];
  const v = c[3] === 'null' ? null : num(c[3], c[0]);
  if (f === 'specificHeat.solid' || f === 'specificHeat.liquid') r.specificHeat = { ...(r.specificHeat || {}), [f.split('.')[1]]: v };
  else if (f === 'insulation' || f === 'breathabilityBase') r[f] = v;
}
// refMaterial 行上必写：有参照的写代号，其余写 null（§2.1 定义 null = 本行没有参照格）。
// insulation / breathabilityBase 只照例 11 写（含例 11 明写的 null）；别的行 byReader 未判（P-2 notCovered），不写，验收单标"未核"。
for (const id of ids) rows[id].r.refMaterial = refs[id] || null;
// refs 里这一格的值取自卷文 B 级，但例 11 的 B 级格已在上表写出值，不重复。

// ---------- 旧 material-props.json → 类别行（卷二 §6.2） ----------
const old = JSON.parse(execFileSync('git', ['show', 'old-final-1117:world/meta/mechanics/material-props.json'], { cwd: ROOT, maxBuffer: 1e8 }).toString());
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const rnd = (x, n) => Math.round(x * 10 ** n) / 10 ** n;
const pick = (row) => { const s = row.sources || []; return (row.selection && row.selection.method === 'single') || !row.selection ? s.slice(0, 1) : s; };
const classes = {};
const labels = {};
const clsId = (k) => `class_${k}`;
const ensure = (k) => (classes[clsId(k)] ||= { basis: '' });
const addBasis = (c, s) => { c.basis = c.basis ? `${c.basis}｜${s}` : s; };
for (const [k, row] of Object.entries(old.classes)) {
  const c = ensure(k);
  const srcs = pick(row).filter(Boolean);
  const m = srcs.map((s) => s.moistureFraction).filter((x) => x !== undefined);
  const ed = srcs.filter((s) => s.refuseFraction !== undefined).map((s) => 1 - s.refuseFraction);
  if (m.length) c.moisture = rnd(mean(m), 3);
  if (ed.length) c.edibleFraction = rnd(mean(ed), 3);
  // energyDensity 不转：旧 sources 只有 kcal（代谢能），新口径是干基总能（卷三甲 §2.1、M-15、§4.5.5"能:食"按三大营养素燃烧热折），缺成分输入。
  // mealCap 不转：旧值标"凭记忆写入，待 L2 核对"（李白 11-17 裁定不沿用）。两项见 docs/问题.md。
  if (srcs.some((s) => s.kcalPer100gWet !== undefined)) report.notes.push(`class_${k}: 旧 kcal 是代谢能，不折成 energyDensity`);
  if (srcs.some((s) => s.mealGrams !== undefined)) report.notes.push(`class_${k}: 旧 mealCap 凭记忆，不转`);
  c.sources = row.sources;
  c.selection = row.selection;
  addBasis(c, row.basis || '');
  // heatValue 旧值是高位热值，新口径是低位值（卷三甲 §2.1），不转；charYield 在新表是派生列，不许手写（AP-3）。
  if (row.heatValue !== undefined) report.notes.push(`class_${k}: 旧 heatValue ${row.heatValue}（高位）不转，新口径低位`);
  if (row.charYield !== undefined) report.notes.push(`class_${k}: 旧 charYield ${row.charYield} 不转，新表派生列`);
}
const phys = { ...old.physical.classes, ...old.physicalMetal.classes };
for (const [k, row] of Object.entries(phys)) {
  const c = ensure(k);
  const dens = pick(row).filter((s) => s.densityKgPerL !== undefined).map((s) => s.densityKgPerL);
  // 旧物理块注明“液体、食物类、混合材不写”，故单值密度迁入 20 ℃ 固栏（M3a-6）。
  if (dens.length) c.density = { solid: rnd(mean(dens), 3) };
  if (row.appearance && row.appearance.length) {
    c.appearanceRefs = row.appearance.length;
    row.appearance.forEach((a, i) => { labels[`${clsId(k)}.appearance.${i}`] = a.term; });
    c.sources = [...(c.sources || []), ...row.appearance.map((a, i) => ({ name: `外观词条 ${i}`, citation: a.citation, dimension: 'appearanceRefs' }))];
  }
  c.sources = [...(c.sources || []), ...pick(row).map((s) => ({ ...s, dimension: 'density' }))].filter((s, i, a) => a.findIndex((t) => JSON.stringify(t) === JSON.stringify(s)) === i);
  if (!c.selection) c.selection = row.selection;
  else if (row.selection) addBasis(c, `密度取法：${row.selection.method}（${row.selection.reason}）`);
  addBasis(c, row.basis || '');
}
for (const c of Object.values(classes)) { c.basis = c.basis.replace(/【[^】]*】/g, '').replace(/^｜+|｜+$/g, '') || '旧 material-props.json 迁入'; }
// memberItems 指向物品代号，物品表尚未载入，不转（memberLinks 待物品卡）。
const physGroup = [...old.physical.precedence, ...old.physicalMetal.precedence].map(clsId);
const defaultGroup = old.precedence.map(clsId);

// ---------- 表头 ----------
const D = (type, extra) => ({ type, modifiable: false, source: '卷三甲 §2.1', owner: '卷三甲 §2.1', ...extra });
const N = (unit, domain, req, onUnknown, extra = {}) => D('number', { unit, domain, precision: extra.precision ?? 4, required: req, ...(req === 'always' ? {} : { onUnknown }), ...extra });
const byState = (unit, unitGas, doms, req, onUnknown) => D('struct', {
  fields: Object.fromEntries(['solid', 'liquid', 'gas'].map((s, i) => [s, { type: 'number', unit: s === 'gas' ? unitGas : unit, domain: doms[i], precision: 4, nullable: true }])),
  required: req, onUnknown,
});
const BYC = (...cs) => cs.map((c) => `byClass:${c}`).join('；');
const dims = {
  substance: D('ref', { vocab: 'substance', nullable: true, required: 'never', onUnknown: 'skip' }),
  // 卷三甲 §2.1 plantPart / plantFamily 的必填写法 bySubstance:… 卷二 §1.2 :104 没有这一策略，P-2 校验器也不认；此处写 never，见 docs/问题.md。
  plantPart: D('ref', { vocab: 'plant_part', nullable: true, required: 'never', onUnknown: 'gap', owner: '卷二十五 §2.4' }),
  plantFamily: D('ref', { vocab: 'plant_family', nullable: true, required: 'never', onUnknown: 'gap' }),
  pileBurnEvidence: D('ref', { vocab: 'burn_evidence', nullable: true, required: 'never', onUnknown: 'skip' }),
  density: byState('kg_per_L', 'kg_per_L_gas', [[0.01, 25], [0.01, 25], [0.00001, 0.1]], 'anyOf:density.solid,density.liquid,density.gas', 'error'),
  valueMult: N('fraction', [0, 1000], 'always', 'error'),
  flammability: N('flam_index', [0, 1], 'always', 'error'),
  flammabilityRange: D('struct', { fields: { min: { type: 'number', unit: 'flam_index', domain: [0, 1], precision: 4 }, max: { type: 'number', unit: 'flam_index', domain: [0, 1], precision: 4 } }, nullable: true, required: 'never', onUnknown: 'skip' }),
  salvageFraction: N('fraction', [0, 1], 'always', 'error'),
  workDifficulty: N('score', [0, 100], 'always', 'error'),
  strength: D('map', { key: { type: 'ref', vocab: 'stress' }, value: { type: 'number', unit: 'score', domain: [0, 100], precision: 4 }, required: 'never', onUnknown: 'gap' }),
  sharpnessMax: N('score', [0, 100], 'never', 'gap'),
  wearResistance: N('score', [1, 100], 'never', 'error'),
  armorMult: D('map', { key: { type: 'ref', vocab: 'damage' }, value: { type: 'number', unit: 'fraction', domain: [0, 4], precision: 4 }, required: 'never', onUnknown: 'gap' }),
  malleability: N('score', [0, 100], 'never', 'gap'),
  corrosionRate: N('per_day', [0, 0.1], BYC('comp_durable'), 'gap'),
  repairedWith: D('ref', { vocab: 'class', required: BYC('comp_durable'), onUnknown: 'skip' }),
  specificHeat: byState('kJ_per_kg_K', 'kJ_per_kg_K', [[0.05, 15], [0.05, 15], [0.05, 15]], BYC('class_metal'), 'gap'),
  thermalConductivity: byState('W_per_m_K', 'W_per_m_K', [[0.01, 500], [0.01, 500], [0.01, 500]], 'never', 'gap'),
  soundAttenuation: N('dB_per_cm', [0, 20], 'never', 'gap'),
  luminousOutput: N('lm_per_kg', [0, 100000], 'never', 'gap'),
  absorbs: D('boolean', { required: 'never', onUnknown: 'skip' }),
  insulation: N('insul_grade', [1, 5], 'byReader', 'error', { nullable: true, precision: 0 }),
  breathabilityBase: N('breath_grade', [1, 4], 'byReader', 'error', { nullable: true, precision: 0 }),
  refMaterial: D('ref', { kind: 'material', nullable: true, required: 'always' }),
  meltPoint: N('celsius', [-273, 6000], 'anyOf:meltPoint,decomposePoint', 'gap'),
  boilPoint: N('celsius', [-273, 8000], 'never', 'gap'),
  decomposePoint: N('celsius', [-273, 6000], 'anyOf:meltPoint,decomposePoint', 'gap'),
  heatDamagePoint: N('celsius', [-273, 6000], 'never', 'gap'),
  coldDamagePoint: N('celsius', [-273, 100], 'never', 'gap'),
  heatValue: N('MJ_per_kg_dry', [0, 60], BYC('comp_burnable'), 'error'),
  ignitePoint: N('celsius', [-50, 3000], BYC('comp_burnable'), 'gap'),
  flashPoint: N('celsius', [-273, 3000], 'never', 'gap'),
  burnRate: N('per_minute', [0, 10], BYC('comp_burnable'), 'gap'),
  volatility: N('per_day_volatile', [0, 1], BYC('comp_burnable'), 'error'),
  deflagThreshold: N('celsius', [-50, 3000], BYC('comp_deflagrant'), 'error'),
  deflagEnergy: N('MJ_per_kg', [0, 10], BYC('comp_deflagrant'), 'error'),
  fragmentFactor: N('fraction', [0, 1], BYC('comp_deflagrant'), 'error'),
  noiseFactor: N('score', [0, 100], 'never', 'gap'),
  moisture: N('fraction', [0, 1], ['byDigestible', BYC('comp_edible'), BYC('comp_drinkable'), BYC('comp_burnable')].join('；'), 'error'),
  edibleFraction: N('fraction', [0, 1], BYC('comp_edible'), 'error'),
  energyDensity: N('satiety_per_kg_dry', [0, 60], ['byDigestible', BYC('comp_edible')].join('；'), 'error'),
  fiberContent: N('fraction', [0, 1], ['byDigestible', BYC('comp_edible')].join('；'), 'error'),
  carbContent: N('fraction', [0, 1], ['byDigestible', BYC('comp_edible')].join('；'), 'gap'),
  mealCap: N('g', [0, 3000], BYC('comp_edible'), 'gap'),
  nutrients: D('map', { key: { type: 'ref', vocab: 'nutrient' }, value: { type: 'number', unit: 'daily_ref_per_kg_dry', domain: [0, 200], precision: 4 }, required: ['byDigestible', BYC('comp_edible')].join('；'), onUnknown: 'gap' }),
  rotRate: N('per_day_rot', [0, 5], BYC('comp_rottable'), 'error'),
  reactionClass: D('set', { of: { type: 'ref', vocab: 'reaction' }, domain: { maxSize: 8 }, required: 'never', onUnknown: 'skip' }),
  reactionProducts: D('map', { key: { type: 'ref', vocab: 'reaction' }, value: { type: 'ref', kind: 'material' }, required: 'never', onUnknown: 'skip' }),
  reactionYield: D('map', { key: { type: 'ref', vocab: 'reaction' }, value: { type: 'number', unit: 'fraction', domain: [0, 1], precision: 4 }, required: 'ifPresent:reactionProducts', onUnknown: 'error' }),
  appearanceRefs: D('integer', { unit: 'count', domain: [0, 16], required: 'never', onUnknown: 'skip' }),
  aesthetic: N('dimensionless', [0, null], 'never', 'gap', { owner: '卷二十三 §2.2' }),
  // 派生列（卷三乙 §2.1 定义；行上手写即 E-DIM-DERIVED-WRITTEN，AP-3）。派生式在卷三乙块实现，这里只声明。
  hardness: D('number', { unit: 'score', domain: [0, 100], precision: 4, derived: '卷三乙 §2.1：由 strength 合成', required: 'never', onUnknown: 'gap', owner: '卷三乙 §2.1' }),
  toughness: D('number', { unit: 'score', domain: [0, 100], precision: 4, derived: '卷三乙 §2.1：由 strength 合成', required: 'never', onUnknown: 'gap', owner: '卷三乙 §2.1' }),
  charYield: D('number', { unit: 'fraction', domain: [0, 1], precision: 4, derived: '卷三乙 §2.1', required: 'never', onUnknown: 'gap', owner: '卷三乙 §2.1' }),
  hydration: D('number', { unit: 'L_per_kg', domain: [0, 1], precision: 4, derived: '卷三乙 §2.1：由 moisture 推出', required: 'never', onUnknown: 'gap', owner: '卷三乙 §2.1' }),
  producedBy: D('set', { of: { type: 'ref', vocab: 'reaction' }, domain: { maxSize: 8 }, derived: '卷三乙 §2.1：由别行 reactionProducts 反查', required: 'never', onUnknown: 'skip', owner: '卷三乙 §2.1' }),
  categories: D('set', { of: { type: 'ref', vocab: 'matcat' }, domain: { maxSize: 4 }, derived: '卷三乙 §2.1：派生大类规则', required: 'never', onUnknown: 'skip', owner: '卷三乙 §2.1' }),
};

// ---------- 卷三甲 §4.1.5–§4.4.5 数据实例（A 类补格） ----------
// 实例写成 `mat_x`：`{键:值, …}`；整节读，凡键是本表已声明维度的都取，其余键（rawForm、tags、extends、带 * + 的继承写法）不取并记报告。
// 行上已有值的格只核对，不改（全集表为准）；映射的键须是已登记的词表条目（armorMult 的 damage 族无条目，不取）。
const srcAdd = (r, s) => { r.sources = [...(r.sources || []), s]; };
const parseLoose = (s) => {
  const toks = []; const re = /\s*("(?:[^"\\]|\\.)*"|[{}[\]:,]|-?\d+(?:\.\d+)?(?![\w])|[A-Za-z_][\w.]*[*+~-]?|[^\s{}[\]:,"]+)/gy; let m;
  while ((m = re.exec(s)) && m[1] !== undefined) toks.push(m[1]);
  let i = 0; const JUNK = Symbol('junk');
  const val = () => {
    const t = toks[i++];
    if (t === '{') { const o = {}; while (toks[i] !== '}' && i < toks.length) { let k = toks[i++]; if (k === ',') continue; k = k.replace(/^"|"$/g, ''); i++; const v = val(); if (v !== JUNK) o[k] = v; } i++; return o; }
    if (t === '[') { const a = []; while (toks[i] !== ']' && i < toks.length) { if (toks[i] === ',') { i++; continue; } const v = val(); if (v !== JUNK) a.push(v); } i++; return a; }
    if (/^-?\d/.test(t)) return Number(t);
    if (/^"/.test(t)) return t.slice(1, -1);
    if (/^[A-Za-z_][\w.]*$/.test(t)) return t;
    return JUNK;
  };
  return val();
};
const exampleLines = [];
for (let n = 1; n <= 4; n++) {
  const a = lines.findIndex((l) => l.startsWith(`#### 4.${n}.5 数据实例`));
  for (let j = a + 1; j < lines.length && !lines[j].startsWith('#### '); j++) if (lines[j].startsWith('- 例')) exampleLines.push([j + 1, n, lines[j]]);
}
const vocabFamilyOf = (d) => d.vocab || (d.of && d.of.vocab) || (d.key && d.key.vocab);
const exampleTaken = [];
for (const [lineNo, sec, l] of exampleLines) {
  const m = l.match(/^- 例 (\d+)[^`]*`(mat_\w+)`[^`]*`(\{.*?\})`/);
  if (!m) continue;
  const [, exNo, id, body] = m;
  const r = rows[id] ? rows[id].r : null; if (!r) { report.skipped.push(`卷三甲 §4.${sec}.5 例 ${exNo}: ${id} 不在全集`); continue; }
  const obj = parseLoose(body);
  const where = `卷三甲 §4.${sec}.5 例 ${exNo}`;
  for (const [k, v] of Object.entries(obj)) {
    const d = dims[k];
    if (k === 'classes' || k === 'substance') { const have = k === 'classes' ? (r.classes || []) : r.substance; const want = k === 'classes' ? [...new Set(v.map((c) => c))].filter((c) => Object.values(COMP).includes(c)).sort() : v; if (JSON.stringify(have) !== JSON.stringify(want)) report.mismatch.push(`${where} ${id}.${k}: 实例 ${JSON.stringify(want)} ≠ 全集 ${JSON.stringify(have)}`); continue; }
    if (!d || d.derived) { report.notes.push(`${where} ${id}.${k}: 非本表已声明手填维度，不取`); continue; }
    const fam = vocabFamilyOf(d);
    if (d.type === 'map' && fam === 'damage') { report.notes.push(`${where} ${id}.${k}: 键属 damage 族，族无条目（卷十三 Q13-12），不取`); continue; }
    if (fam === 'reaction') (Array.isArray(v) ? v : Object.keys(v)).forEach((x) => reactions.add(x));
    const put = (key, val) => { r[key] = val; srcAdd(r, { dimension: key, name: where, citation: `docs/统一底层设计/卷三甲-物质本源.md:${lineNo}` }); exampleTaken.push(`${id}.${key}`); };
    if (r[k] === undefined) put(k, v);
    else if (d.type === 'struct' && typeof v === 'object') {
      const add = Object.entries(v).filter(([s]) => r[k][s] === undefined || r[k][s] === null);
      for (const [s, x] of Object.entries(v)) if (r[k][s] !== undefined && r[k][s] !== null && r[k][s] !== x) report.mismatch.push(`${where} ${id}.${k}.${s}: 实例 ${x} ≠ 全集 ${r[k][s]}`);
      if (add.length) { r[k] = { ...r[k], ...Object.fromEntries(add) }; add.forEach(([s]) => { srcAdd(r, { dimension: `${k}.${s}`, name: where, citation: `docs/统一底层设计/卷三甲-物质本源.md:${lineNo}` }); exampleTaken.push(`${id}.${k}.${s}`); }); }
    } else if (JSON.stringify(r[k]) !== JSON.stringify(v)) report.mismatch.push(`${where} ${id}.${k}: 实例 ${JSON.stringify(v)} ≠ 全集 ${JSON.stringify(r[k])}`);
  }
}

// ---------- 仍缺的必填格：统一规则算出暂定值（李白 11-17 改令；规则说明见 审查/P-3-推导规则.md） ----------
// 必填判定照表头：always、byClass:<组件类>、ifPresent:<维度>；byDigestible、byReader、anyOf 不在此补。
// 不补的格：卷文短表明写未知的（declaredUnknown）。valueMult 正式值归卷三乙 §7 M3b-27 离线标定（tools/calibrate-valuemult.mjs，眼下做不了），
// 先按 P3-T4 暂定（李白 11-17）。
const NOT_PROVISIONAL = {};
const RULE_NOTE = { rotRate: '卷文规则 卷三甲 §7 M3a-4（:968）缺输入（旧物品无指向材料的字段），暂定' };
const needs = (r, d) => requiredTerms(d.required).some((t) => t === 'always' || (t.startsWith('byClass:') && (r.classes || []).includes(t.slice(8))) || (t.startsWith('ifPresent:') && r[t.slice(10)] !== undefined));
const median = (a) => { const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
// 卷三乙 §4.1.1（:559）本源成分 → 类别；名称到代号取卷三甲 §2.2（:182）。
const vol3b = readFileSync(join(ROOT, 'docs/统一底层设计/卷三乙-物态类别与物品.md'), 'utf8').split('\n');
const substByName = Object.fromEntries([...lines.find((l) => l.startsWith('| substance → ')).matchAll(/([一-龥]+) `(subst_\w+)`/g)].map((x) => [x[1], x[2]]));
const classRuleLines = vol3b.slice(vol3b.findIndex((l) => l.includes('<!--CLASS-RULES-BEGIN material-->')), vol3b.findIndex((l) => l.includes('<!--CLASS-RULES-END material-->')));
const substanceClass = Object.fromEntries([...classRuleLines.find((l) => l.includes('本源成分的类别')).matchAll(/([一-龥]+) → `(class_\w+)`/g)].filter((x) => substByName[x[1]]).map((x) => [substByName[x[1]], x[2]]));
const derivedClassCodes = [...new Set(classRuleLines.join('\n').match(/class_\w+/g))];
const MEAL_CAP_G = 1100; // 成人胃容量约 1.1 L、食物密度约 1（Geliebter 1988；旧 material-props.json mealCitation）。无卷文出处，暂定。
const provisional = [];
const mark = (r, dim, citation) => { srcAdd(r, { dimension: dim, name: '暂定，待试玩调', citation, status: 'vstat_placeholder' }); provisional.push(dim.split('.')[0]); };
for (const dim of Object.keys(dims).sort()) {
  const d = dims[dim];
  if (d.derived || NOT_PROVISIONAL[dim]) continue;
  const holes = ids.filter((id) => rows[id].r[dim] === undefined && needs(rows[id].r, d) && !declaredUnknown.has(`${id}.${dim}`));
  if (!holes.length) continue;
  const note = RULE_NOTE[dim] ? `；${RULE_NOTE[dim]}` : '';
  if (dim === 'valueMult') {
    // P3-T4：同本源成分的卷文例值（§4.1.5、§4.3.5 实例补进来的格）取下中位数；本源成分为空或该成分没有例值的一律 1。
    const anchors = ids.filter((h) => typeof rows[h].r[dim] === 'number' && rows[h].r.substance);
    for (const id of holes) {
      const s = rows[id].r.substance;
      const g = s ? anchors.filter((h) => rows[h].r.substance === s).map((h) => rows[h].r[dim]).sort((x, y) => x - y) : [];
      rows[id].r[dim] = g.length ? g[(g.length - 1) >> 1] : 1;
      srcAdd(rows[id].r, { dimension: dim, name: '暂定，待 M3b-27 标定', citation: `P3-T4 ${g.length ? `同本源成分 ${s} 例值下中位数（n=${g.length}）` : '本源成分无例值，取 1'}；卷三甲 §4.1.5/§4.3.5 例值；暂定`, status: 'vstat_placeholder' });
      provisional.push(dim);
    }
  } else if (dim === 'repairedWith') {
    // P3-T3：修理用料类 = 本行本源成分在卷三乙 :559 的类别（卷三甲 §4.1.5 例 1、例 2 两例都等于自身类别）。
    for (const id of holes) { const c = substanceClass[rows[id].r.substance]; if (!c) { report.skipped.push(`${id}.repairedWith: 本源成分无类别，T3 算不出`); continue; } rows[id].r[dim] = c; mark(rows[id].r, dim, 'P3-T3 本源成分的类别（卷三乙 §4.1.1 :559；与卷三甲 §4.1.5 例 1、例 2 一致）'); }
  } else if (dim === 'reactionYield') {
    // P3-T1（按反应分组）：同反应代号已有产率取中位数；无则取全部已有产率中位数。其余反应键写 null（卷二 §1.6 第 4 项映射全族）。
    const all = ids.flatMap((id) => Object.entries(rows[id].r.reactionYield || {}).filter(([, x]) => typeof x === 'number').map(([k, x]) => [k, x]));
    for (const id of holes) {
      const y = {};
      for (const rk of Object.keys(rows[id].r.reactionProducts)) { const g = all.filter(([k]) => k === rk).map(([, x]) => x); const base = g.length ? g : all.map(([, x]) => x); y[rk] = rnd(median(base), 4); mark(rows[id].r, `reactionYield.${rk}`, `P3-T1 同反应已有产率中位数（${g.length ? `组 ${rk}，n=${g.length}` : `组内无值，全部 n=${base.length}`}）；无卷文出处，暂定`); }
      rows[id].r.reactionYield = y;
    }
  } else if (d.type === 'number') {
    // P3-T1：同本源成分（空记一组）已有值的中位数；组内无值取该维全部已有值的中位数。方法同卷三甲 §4.5.5 依据代号"推"（:519、:523 同类推定）。
    const have = ids.filter((id) => typeof rows[id].r[dim] === 'number');
    if (!have.length && dim === 'mealCap') { for (const id of holes) { rows[id].r[dim] = MEAL_CAP_G; mark(rows[id].r, dim, 'P3-T2 胃容量一餐上限 1100 g（Geliebter 1988，旧 D12 mealCitation）；无卷文出处，暂定'); } continue; }
    if (!have.length) { report.skipped.push(`${dim}: 无任何已有值，T1 算不出`); continue; }
    for (const id of holes) {
      const s = rows[id].r.substance || null;
      const g = have.filter((h) => (rows[h].r.substance || null) === s);
      const base = (g.length ? g : have).map((h) => rows[h].r[dim]);
      rows[id].r[dim] = rnd(median(base), d.precision ?? 4);
      mark(rows[id].r, dim, `P3-T1 同本源成分已有值中位数（${g.length ? `组 ${s || '空'}，n=${g.length}` : `组内无值，全部 n=${base.length}`}；方法见卷三甲 §4.5.5 :519、:523 同类推定）；数无卷文出处，暂定${note}`);
    }
  } else report.skipped.push(`${dim}: 类型 ${d.type} 无暂定规则`);
}
// reactionYield 映射补全全族键（卷二 §1.6 第 4 项，见 docs/问题.md）：反应集合到这里才定，统一补 null。
for (const id of ids) { const y = rows[id].r.reactionYield; if (y) for (const k of reactions) if (!(k in y)) y[k] = null; }
const materialRows = {};
for (const id of [...ids].sort()) materialRows[id] = rows[id].r;
const material = {
  $schema: '../../schemas/dimensions.schema.json',
  kind: 'material', namespace: 'core', version: 1,
  entity: { idPrefix: ['mat_'], classPrefix: 'class_', singletonIds: [], instanceTable: null },
  // 行为清单卷三甲没有写；取卷二 §1.2 表头示例里 material 表的五项，见 docs/问题.md。
  behaviors: ['burn', 'fuel_use', 'nutrition', 'rot', 'value'],
  dimensions: dims,
  precedenceGroups: { default: defaultGroup, physical: physGroup },
  precedenceOf: { appearanceRefs: 'physical', density: 'physical' },
  classes: Object.fromEntries(Object.keys(classes).sort().map((k) => [k, classes[k]])),
  rows: materialRows,
  generated: {},
};

// ---------- 词表 ----------
const E = (list, extra) => Object.fromEntries(list.map((k) => [k, extra ? extra(k) : {}]));
// 卷三乙 §4.1.1（:559–560）两条来源列出的 15 个类别，加旧 material-props 的类别键（卷二 §6.2）。
const classIds = [...new Set([...Object.keys(classes), ...derivedClassCodes])].sort();
const vocab = {
  families: {
    substance: { closed: true, prefix: 'subst_', entries: E(['metal', 'stone', 'mineral', 'glass', 'wood', 'plant', 'fiber', 'hide', 'bone', 'flesh', 'water', 'animal_product'].map((k) => `subst_${k}`)) },
    stress: { closed: true, prefix: 'stress_', entries: E(['impact', 'compress', 'tensile', 'torsion', 'shear', 'bend'].map((k) => `stress_${k}`)) },
    // 卷三甲 §2.2：条目字段 {bodyNeed, refAmountG}；盐分 refAmountG 首批 5，bodyNeed 指卷二十一 §4.4 代号（未载入，不写）。其余营养素代号卷三甲没给。
    nutrient: { closed: false, prefix: 'nutr_', entries: { nutr_salt: { refAmountG: 5 } } },
    reaction: { closed: false, prefix: 'reaction_', entries: E([...reactions].sort()) },
    component: { closed: false, prefix: 'comp_', entries: Object.fromEntries(Object.values(COMP).sort().map((k) => [k, { table: 'material', requires: { comp_burnable: ['heatValue', 'ignitePoint', 'burnRate', 'moisture', 'volatility'], comp_deflagrant: ['deflagThreshold', 'deflagEnergy', 'fragmentFactor'], comp_edible: ['moisture', 'edibleFraction', 'energyDensity', 'fiberContent'], comp_drinkable: ['moisture'], comp_rottable: ['rotRate'], comp_durable: ['repairedWith', 'corrosionRate'] }[k] }])) },
    plant_family: { closed: true, prefix: 'pfam_', entries: E(['poaceae', 'fabaceae', 'brassicaceae', 'theaceae', 'fagaceae', 'ulmaceae', 'salicaceae', 'unknown'].map((k) => `pfam_${k}`)) },
    burn_evidence: { closed: false, prefix: 'bev_', entries: E([...new Set(between('PILE-EVIDENCE-DATA').map((c) => c[2]))].sort(), () => ({ kind: 'fuel_record' })) },
    // 卷二十五 §2.4：开放、登记制；首批七项，字段 seasonal / lethal 的值卷二十五没逐项写，不填。
    plant_part: { closed: false, prefix: 'ppart_', entries: E(['seed', 'stalk', 'leaf', 'root', 'fruit', 'flower', 'aerial'].map((k) => `ppart_${k}`)) },
    // 卷三乙 §4.1.1：派生类别；首批代号取卷三乙 :559–560 的十五项加旧 material-props.json 的类别键（卷二 §6.2）。
    class: { closed: false, prefix: 'class_', entries: E(classIds) },
    matcat: { closed: false, prefix: 'matcat_', entries: E(['matcat_char', 'matcat_wax_fat', 'matcat_volatile_fuel']) },
    // 卷十三 `damage`（damage_）：条目代号待内容管线定名（卷十三 Q13-12），本卡无可载条目。
    damage: { closed: false, prefix: 'damage_', entries: {} },
    // 卷四 `diet`（diet_）：eats 条目字段旧 tags.json 没有（核实见验收单），按李白 11-17 第 6 条选 B，缺 eats 的不载。
    diet: { closed: false, prefix: 'diet_', entries: {} },
  },
};
const U = (id, dimension, si, extra) => ({ id, dimension, si, ...extra });
const units = {
  units: [
    U('MJ_per_kg', 'energy_per_mass', 1e6), U('MJ_per_kg_dry', 'energy_per_mass_dry', 1e6), U('W_per_m_K', 'thermal_conductivity', 1),
    U('breath_grade', 'grade', 1, { calibrate: true }), U('celsius', 'temperature', 1), U('count', 'count', 1), U('daily_ref_per_kg_dry', 'ref_dose_per_mass_dry', 1, { calibrate: true }),
    U('dB_per_cm', 'attenuation', 100), U('dimensionless', 'ratio', 1), U('flam_index', 'index', 1, { calibrate: true }), U('fraction', 'ratio', 1), U('g', 'mass', 0.001),
    U('insul_grade', 'grade', 1, { calibrate: true }), U('kJ_per_kg_K', 'specific_heat', 1000), U('kg_per_L', 'density', 1000), U('kg_per_L_gas', 'density', 1000, { calibrate: true }),
    U('L_per_kg', 'volume_per_mass', 0.001), U('lm_per_kg', 'luminous_per_mass', 1), U('per_day', 'rate', 1 / 86400), U('per_day_rot', 'rate', 1 / 86400, { calibrate: true }),
    U('per_day_volatile', 'rate', 1 / 86400, { calibrate: true }), U('per_minute', 'rate', 1 / 60), U('satiety_per_kg_dry', 'energy_per_mass_dry', 1e6), U('score', 'score', 1, { calibrate: true }),
  ].sort((a, b) => (a.id < b.id ? -1 : 1)),
};

const out = {
  'material.json': material, '_vocab.json': vocab, '_units.json': units,
};
const fmt = (o) => JSON.stringify(sortObj(o), null, 1) + '\n';
console.log(`rows=${ids.length} classes=${Object.keys(classes).length} classEntries=${classIds.length} labels=${Object.keys(labels).length}`);
const tally = (a) => Object.entries(a.reduce((o, k) => ({ ...o, [k]: (o[k] || 0) + 1 }), {})).sort().map(([k, n]) => `${k} ${n}`).join('、');
console.log(`卷三甲 §4.1.5–§4.4.5 实例补格=${exampleTaken.length}：${tally(exampleTaken.map((x) => x.split('.').slice(1).join('.').split('.')[0]))}`);
console.log(`暂定格=${provisional.length}：${tally(provisional)}`);
console.log(`核对差异（易燃度换算、实例对全集）=${report.mismatch.length}`); report.mismatch.forEach((s) => console.log('  ' + s));
console.log(`跳过/未转=${report.skipped.length}`); report.skipped.forEach((s) => console.log('  ' + s));
console.log(`备注=${report.notes.length}`); report.notes.forEach((s) => console.log('  ' + s));
if (!CHECK) {
  mkdirSync(OUT, { recursive: true });
  for (const [f, o] of Object.entries(out)) writeFileSync(join(OUT, f), fmt(o));
  mkdirSync(join(ROOT, 'world/i18n'), { recursive: true });
  writeFileSync(join(ROOT, 'world/i18n/labels.zh.json'), fmt(labels));
}
