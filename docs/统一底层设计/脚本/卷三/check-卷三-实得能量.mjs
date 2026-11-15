// 实得能量核对（纤维版）：人、牛、猪各吃粮食、肉、油、干草、秸秆、木头，按卷四第八版 T-4 算实得能量，同有出处的资料代谢能对照，列误差表。
// 只读文档，只打印。用法：node F:/dnd/docs/统一底层设计/脚本/卷三/check-卷三-实得能量.mjs
// 总能、含水率、本源成分、组件类读卷三甲 §4.5 全集表；纤维含量读卷三甲 §4.5.5 例 5（FIBER-DATA-BEGIN 与 FIBER-DATA-END 之间）；
// 食性条目（含 fiberPenalty）与人、牛、猪的食性配置读卷四 §4.7.5。
// 利用比例（卷四 §2.4、T-4）= 查到的吸收率 − fiberPenalty × 该份材料的纤维含量，截到 [0,1]；fiberPenalty 为空不扣；成立的条目里取扣减后的大者。
// 资料参考值（每千克干物质的代谢能，MJ）写在本脚本的 REF 表里，只收审查/卷三卷四-文献值上网核对.md、卷三卷四-文献值补核.md 核到有出处的值；
// 没核到的标"不比"，只列出实得，不计入误差，也不参与断言。参照不是材料数据。
import { readFileSync } from 'node:fs';

const DIR = 'F:/dnd/docs/统一底层设计/';
const load = (f) => readFileSync(DIR + f, 'utf8').replace(/\r\n/g, '\n').split('\n');
const jia = load('卷三甲-物质本源.md'); const v4 = load('卷四-生物身体与人物.md');
const out = []; let fail = 0;
const say = (s) => out.push(s);
const check = (ok, s) => { out.push((ok ? 'PASS ' : 'FAIL ') + s); if (!ok) fail += 1; };

// ---- 卷三甲全集表 ----
const a = jia.findIndex((l) => l.startsWith('<!--MATERIAL-DATA-BEGIN-->')); const z = jia.findIndex((l) => l.startsWith('<!--MATERIAL-DATA-END-->'));
const rows = jia.slice(a + 1, z).filter((l) => l.startsWith('|')).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
const H = Object.fromEntries(rows[0].map((h, i) => [h, i]));
const num = (s) => (s === '—' || s === '' ? null : Number(s));
const M = Object.fromEntries(rows.slice(2).map((c) => [c[H['代号']], {
  name: c[H['名称']], subst: c[H['本源成分']] === '—' ? null : c[H['本源成分']], comps: c[H['组件类']].split(/\s+/),
  moist: num(c[H['含水率']]), ge: num(c[H['干基饱腹']]), basis: c[H['依据']], fiber: null, fiberBasis: '—',
}]));

// ---- 卷三甲 §4.5.5 例 5 纤维含量表 ----
const fa = jia.findIndex((l) => l.startsWith('<!--FIBER-DATA-BEGIN-->')); const fz = jia.findIndex((l) => l.startsWith('<!--FIBER-DATA-END-->'));
const frows = fa >= 0 && fz > fa ? jia.slice(fa + 1, fz).filter((l) => l.startsWith('|')).map((l) => l.split('|').slice(1, -1).map((c) => c.trim())) : [];
const FH = frows.length ? Object.fromEntries(frows[0].map((h, i) => [h, i])) : {};
let fiberRows = 0;
for (const c of frows.slice(2)) {
  const id = c[FH['代号']]; const v = num(c[FH['纤维含量']]);
  fiberRows += 1;
  if (M[id]) { M[id].fiber = v; M[id].fiberBasis = c[FH['依据']]; }
}

// ---- 卷四食性条目（含 fiberPenalty）与三个物种的食性配置 ----
const diets = {};
for (const l of v4) {
  const m = l.match(/^"(diet_[a-z_]+)": \{"eats":"([^"]+)", "assimilation":(\{"bySubstance":\{[^}]*\},"other":(?:null|[\d.]+)\})/);
  if (!m) continue;
  const p = l.match(/"fiberPenalty":(null|[\d.]+)/);
  diets[m[1]] = { eats: m[2], assim: JSON.parse(m[3]), penalty: p && p[1] !== 'null' ? Number(p[1]) : null };
}
const cfgLine = v4.find((l) => /人："diet":\[/.test(l) && /牛："diet":\[/.test(l) && /猪："diet":\[/.test(l)) || '';
const dietOf = Object.fromEntries(['人', '牛', '猪'].map((w) => { const m = cfgLine.match(new RegExp(w + '："diet":(\\[[^\\]]*\\])')); return [w, m ? JSON.parse(m[1]) : []]; }));
const COMP = { comp_edible: 'E', comp_drinkable: 'D', comp_burnable: 'B', comp_rottable: 'R', comp_durable: 'U', comp_deflagrant: 'X' };
const evalEats = (d, m) => d.eats.split(/\s+and\s+/).every((cl) => {
  let x;
  if ((x = cl.match(/^material\.classes has (comp_[a-z_]+)$/))) return m.comps.includes(COMP[x[1]]);
  if ((x = cl.match(/^material\.substance == (subst_[a-z_]+)$/))) return m.subst === x[1];
  if ((x = cl.match(/^material\.moisture (>=|<=) ([\d.]+)$/))) return m.moist !== null && (x[1] === '>=' ? m.moist >= Number(x[2]) : m.moist <= Number(x[2]));
  if ((x = cl.match(/^lot\.spoilage (>=|<=) ([\d.]+)$/))) return x[1] === '>=' ? 0 >= Number(x[2]) : 0 <= Number(x[2]);
  throw new Error('卷四 eats 条件里有本脚本不认得的写法：' + cl);
});
// 卷四 T-4（第八版）：成立的条目里，按本源成分查得吸收率，减 fiberPenalty × 纤维含量并截到 [0,1]，取最大；一个也查不到按不可食计。
// 要扣减而材料没有纤维含量的，记入 missingFiber（卷三甲 M-16 本应在加载时拦下）。
const missingFiber = [];
const clamp = (x) => Math.min(1, Math.max(0, x));
const assimilation = (species, m, id) => {
  let best = null; let via = ''; let base = null; let pen = null;
  for (const did of dietOf[species]) {
    const d = diets[did]; if (!d || !evalEats(d, m)) continue;
    const v0 = m.subst && m.subst in d.assim.bySubstance ? d.assim.bySubstance[m.subst] : d.assim.other;
    if (v0 === null) continue;
    let v = v0;
    if (d.penalty !== null) {
      if (m.fiber === null) { missingFiber.push(species + '×' + id + '（' + did + '）'); continue; }
      v = clamp(v0 - d.penalty * m.fiber);
    }
    if (best === null || v > best) { best = v; via = did; base = v0; pen = d.penalty; }
  }
  return { v: best, via, base, pen };
};

// ---- 六种吃食与资料参考值 ----
const FOODS = [['粮食（粟）', 'mat_millet'], ['肉', 'mat_flesh'], ['油（菜籽油）', 'mat_rapeseed_oil'], ['干草', 'mat_dry_grass'], ['秸秆', 'mat_straw'], ['木头（橡木）', 'mat_oak']];
// 每千克干物质的代谢能（MJ）。[值, 来源代号] 或 [[下限, 上限], 来源代号]；null = 未核到，不比。
// 来源代号（出处全称与原文取值见 审查/卷三卷四-文献值上网核对.md F 表、卷三卷四-文献值补核.md E/F 表）：
//   USDA169702 = USDA FoodData Central SR Legacy fdcId 169702 小米，378 kcal/100 g、含水 8.67% → 17.3
//   FAO-肉     = FAO《Food energy – methods of analysis and conversion factors》第 3 章表 3.1 肉的专用系数，按出处重算 21.1
//   FAO-油     = 同上，植物油 37.0 kJ/g
//   FP12007    = Feedipedia node/12007 黍粒：ME 反刍 12.8；MEn 生长猪 14.5（黍，不是粟本种）
//   FP12108    = Feedipedia node/12108 粟本种（Setaria italica）籽粒，Pig nutritive values 表"MEn growing pig"行 13.8 MJ/kg DM（方程推算，带星号）；
//                该页 Ruminant nutritive values 表只有"OM digestibility, Ruminant 76.3"一行，没有反刍代谢能（11-13 主会话派卡上网核对，见 审查/卷三-粟与夜帽菇出处.md）
//   注（11-13）：粟一行改为粟本种。猪改引 FP12108；牛在粟本种上没有核到反刍代谢能，暂留黍值 FP12007 照比（不撤比较），待主会话定；
//                人一行 USDA169702 是"Millet, raw"，出处未写种，照旧
//   FP11990    = Feedipedia node/11990 鸭茅干草：ME 反刍 8.9（其余干草页 7.4–8.6）
//   FP12758    = Feedipedia node/12758 麦秸：ME 反刍 6.8（5.4–6.8）；MEn 生长猪 2.0
//   AJAS-豆油  = Kim 等 AJAS PMC4647084 表 4–5 与 AJAS 10.5713/ajas.18.0944 表 6：大豆油生长猪 ME 32.10–37.25
//   定义       = 这种动物不采食这种东西，按 0 计（不计入误差统计，只断言实得为 0）
const REF = {
  人: { mat_millet: [17.3, 'USDA169702'], mat_flesh: [21.1, 'FAO-肉'], mat_rapeseed_oil: [37.0, 'FAO-油'], mat_dry_grass: null, mat_straw: null, mat_oak: null },
  牛: { mat_millet: null, mat_flesh: [0, '定义'], mat_rapeseed_oil: [0, '定义'], mat_dry_grass: [8.9, 'FP11990'], mat_straw: [6.8, 'FP12758'], mat_oak: null },
  猪: { mat_millet: [13.8, 'FP12108'], mat_flesh: null, mat_rapeseed_oil: [[32.10, 37.25], 'AJAS-豆油'], mat_dry_grass: null, mat_straw: [2.0, 'FP12758'], mat_oak: null },
};
const refMid = (r) => (Array.isArray(r) ? (r[0] + r[1]) / 2 : r);
const refTxt = (r) => (Array.isArray(r) ? r[0].toFixed(2) + '–' + r[1].toFixed(2) : r.toFixed(1));
const refDiff = (got, r) => (Array.isArray(r) ? (got < r[0] ? got - r[0] : got > r[1] ? got - r[1] : 0) : got - r);

say('== 读入 ==');
say('卷四食性条目 ' + Object.keys(diets).length + ' 条（带 fiberPenalty 的：' + Object.entries(diets).filter(([, d]) => d.penalty !== null).map(([k, d]) => k + '=' + d.penalty).join('，') + '）；食性配置：' + Object.entries(dietOf).map(([k, v]) => k + '=' + v.join('+')).join('，'));
say('卷三甲纤维含量表 ' + fiberRows + ' 行');
check(Object.values(dietOf).every((v) => v.length > 0 && v.every((id) => diets[id])), '人、牛、猪的食性配置读得出，引用的食性条目都在');
check(FOODS.every(([, id]) => M[id] && M[id].ge !== null && M[id].moist !== null && /能:/.test(M[id].basis)), '六种吃食在卷三甲全集里都有干基总能、含水率与来源类别');
say('');
say('== 实得能量（每千克干物质，MJ）= 干基总能 × 利用比例；利用比例 = 吸收率 − fiberPenalty × 纤维含量（卷四 §2.4、T-4 第八版） ==');
say('物种 | 吃食 | 干基总能 | 纤维含量 | 纤维依据 | 取用食性 | 吸收率 | fiberPenalty | 利用比例 | 实得 | 资料参考 | 参考出处 | 差 | 相对误差');
const stat = []; const skipped = [];
for (const sp of ['人', '牛', '猪']) {
  for (const [label, id] of FOODS) {
    const m = M[id]; const r = assimilation(sp, m, id);
    const got = r.v === null ? 0 : m.ge * r.v;
    const ref = REF[sp][id];
    const cols = [sp, label, m.ge, m.fiber === null ? '—' : m.fiber, m.fiberBasis, r.v === null ? '（不可食）' : r.via,
      r.v === null ? '—' : r.base, r.pen === null ? '—' : r.pen, r.v === null ? '—' : r.v.toFixed(4), got.toFixed(2)];
    if (ref === null) {
      say([...cols, '未核到', '—', '不比', '—'].join(' | '));
      skipped.push(sp + '吃' + label);
      continue;
    }
    const [rv, src] = ref;
    const diff = refDiff(got, rv);
    const mid = refMid(rv);
    const rel = mid > 0 ? (diff / mid * 100).toFixed(0) + '%' : (got === 0 ? '0' : '参考为 0');
    say([...cols, refTxt(rv), src, (diff >= 0 ? '+' : '') + diff.toFixed(2), rel].join(' | '));
    if (src !== '定义') stat.push({ sp, label, diff, ref: mid, got, refShow: refTxt(rv) });
    else check(got === 0, sp + '不采食' + label + '：实得为 0');
  }
}
say('');
say('== 误差汇总（"定义"为 0 的两项不计；"不比"的 ' + skipped.length + ' 项不计：' + skipped.join('、') + '） ==');
const absMax = stat.reduce((x, y) => (Math.abs(y.diff) > Math.abs(x.diff) ? y : x));
const relList = stat.filter((s) => s.ref >= 2);
const relMax = relList.reduce((x, y) => (Math.abs(y.diff / y.ref) > Math.abs(x.diff / x.ref) ? y : x));
say('绝对误差最大：' + absMax.sp + '吃' + absMax.label + '，实得 ' + absMax.got.toFixed(2) + '，资料 ' + absMax.refShow + '，差 ' + absMax.diff.toFixed(2) + ' MJ/kg 干物质');
say('相对误差最大（资料值不小于 2 的各项里）：' + relMax.sp + '吃' + relMax.label + '，实得 ' + relMax.got.toFixed(2) + '，资料 ' + relMax.refShow + '，偏 ' + (relMax.diff / relMax.ref * 100).toFixed(0) + '%');
const over = stat.filter((s) => Math.abs(s.diff) > Math.max(1, 0.15 * s.ref));
say('差不超过"1 MJ 或 15%"的 ' + (stat.length - over.length) + ' 项，超过的 ' + over.length + ' 项' + (over.length ? '：' + over.map((s) => s.sp + '吃' + s.label).join('、') : ''));
if (missingFiber.length) say('要按纤维扣减却没有纤维含量的：' + missingFiber.join('、'));
say('说明：猪吃粮取到的是杂食食性（与人共用、不扣纤维）的吸收率，拱食食性按纤维扣减后的值较小未被取用（卷四 §4.7.5 记为未解决，卷三甲 §8 Q-A12）。本脚本如实列出，不调数据去凑。');
// 方向性断言：原四条照旧；牛吃干草的参照改用核到有出处的值（FP11990 鸭茅干草 ME 8.9），门槛 0.5 MJ 不变
const g = (sp, id) => { const r = assimilation(sp, M[id], id); return r.v === null ? 0 : M[id].ge * r.v; };
check(g('人', 'mat_dry_grass') === 0 && g('人', 'mat_oak') === 0 && g('人', 'mat_straw') === 0, '人吃干草、秸秆、木头实得为 0');
check(Math.abs(g('牛', 'mat_dry_grass') - REF['牛'].mat_dry_grass[0]) <= 0.5, '牛吃干草的实得与资料代谢能相差不到 0.5 MJ（吸收率 = 代谢能 ÷ 总能，按纤维扣减）');
check(Math.abs(M.mat_dry_grass.ge - M.mat_millet.ge) <= 1.5, '干草与粮食的干基总能相近（总能与物种无关，差别在吸收率）');
check(g('人', 'mat_millet') > 15 && g('人', 'mat_flesh') > 20 && g('人', 'mat_rapeseed_oil') > 35, '人吃粮、肉、油的实得落在真实量级内');
check(missingFiber.length === 0, '凡要按纤维扣减的吃食，卷三甲纤维含量表里都有值');
say('----');
say('合计：' + stat.length + ' 项计入误差，' + skipped.length + ' 项未核到不比；未通过断言 ' + fail + ' 项');
console.log(out.join('\n'));
process.exitCode = fail === 0 ? 0 : 1;
