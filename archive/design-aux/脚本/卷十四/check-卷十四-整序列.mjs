// 卷十四 SK-2/SK-3 熟练度整序列误差界验算（补 审查/卷十四-v6单核 余项 R1；不含管线修正项：M = 1、p = q = 0、e_管 = e_乘）。
// 做法仿 check-卷二十一-误差界.mjs：
//   定点一侧照卷二 §3.3 实现（10⁸ 标度 BigInt；fixedUnits8 升标度无余数、fixedMultiply8、10⁸ 整除、10⁸ 曲线插值，全部向零截断）；
//   参考一侧用 50 位十进制定点（BigInt）算同一组式子，不截到 10⁻⁸；
//   离散判定（阈值比较、分支、新建，以及"按使用精度截断后进入式子的读数"——本记录 stored 经 SK-5 读出的当前值、教师值等）
//   照卷二 §3.3 第 6 条"参考值与断言"取与定点实现相同的分支、相同的读数；取大、取小两侧各取各的（不是离散判定），
//   误差按卷二该条"逐步递推"的取大取小一项（分得开只计所取一支，否则取各实参误差里最大的）。
//   每次写入后按卷十四 §4.3 SK-3"误差量与误差界"的确定式更新 E_s、E_p、E_d，断言 stored、peak、dayGain 的实际误差 ≤ 界，并列出 实际÷界。
// 覆盖（R1 点名）：seedSkills 起点（名册职业 m₀ = 1、监护人主业 m₀ = 2701、母语 m₀ = 0）；多日、一日多段；
//   来源上限（教师、载体两种来源水平）与当日单项上限两种封顶，以及缺前置封顶；"分得开"与"分不开"两种情形；
//   当日合计递减（e_t、m₂）；G 的累计（G_s、G_d）与 E_p := max；第 1 步折算起点改写；第 3 步有效练习改写（E_始、e_自）；换日 E_d := 0。
// 本脚本自取的一处读法（卷十四未写明，列给审查）：第 3 步"当日开始时的 stored、peak 由记录解出"取 stored − dayGain 与当前 peak，
//   误差即确定式的 E_始 = max(E_s + E_d, E_p)。
// 适用区间：各量在登记取值域内（技能值 [0, 2700]）；随机序列不再给 stored ≥ 2600 的记录排练习，教师值、载体水平都不超过 2700。
// 只做算术，不读写项目文件。用法：node F:/dnd/docs/统一底层设计/脚本/卷十四/check-卷十四-整序列.mjs
const S8 = 10n ** 8n, P = 10n ** 50n, UP50 = P / S8, U4 = 10n ** 4n, U46 = 10n ** 46n;
const absB = v => (v < 0n ? -v : v);
const maxB = (a, b) => (a > b ? a : b), minB = (a, b) => (a < b ? a : b);
const q4 = x => BigInt(Math.round(x * 1e4));                 // 登记精度 10⁻⁴ 写得尽的数
const f8 = x => q4(x) * U4;                                    // fixedUnits8：10⁴ 升 10⁸，无余数
const fP = x => q4(x) * U46;                                   // 参考一侧
const mul8 = (a, b) => a * b / S8;                             // fixedMultiply8，向零截断
const mulP = (a, b) => a * b / P;
const num = r => Number(r * 10n ** 17n / P) / 1e17;            // 参考值转浮点，只用于算界
const act = (fx, ref) => Number(absB(fx * UP50 - ref) * 10n ** 6n / UP50) / 1e6;   // 实际误差，单位 10⁻⁸
const trunc4 = v8 => v8 / U4 * U4;                             // SK-5 读数链降到 10⁴（向零截断一次）

function curve(pts) {
  return {
    p8: pts.map(([x, y]) => [f8(x), f8(y)]), pP: pts.map(([x, y]) => [fP(x), fP(y)]),
    top: Math.max(...pts.map(p => p[1])),                                                        // ȳ
    sig: Math.max(...pts.slice(1).map((p, k) => Math.abs((p[1] - pts[k][1]) / (p[0] - pts[k][0])))),   // σ
  };
}
function look(pts, x) {   // 分段线性，两端取端点值；10⁸ 一侧向零截断一次
  if (x <= pts[0][0]) return pts[0][1];
  for (let k = 1; k < pts.length; k++) if (x <= pts[k][0]) { const [x0, y0] = pts[k - 1], [x1, y1] = pts[k]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return pts.at(-1)[1];
}
const look8 = (c, x) => look(c.p8, x), lookP = (c, x) => look(c.pP, x);

// ── 规则表与曲线（曲线故意取除不尽的分段） ──
const RULES = {
  upkeep: 2, prereqMult: 0.4, relearnMult: 1.5,
  dtc: curve([[0, 1], [30, 0.9], [70, 0.55], [150, 0.2], [400, 0.05]]),           // dailyTotalCurve
  burden: curve([[0, 1], [0.7, 0.9], [1.3, 0.6], [3, 0.3]]),
  gap: curve([[0, 0.2], [300, 1], [900, 1.3]]), group: curve([[1, 1], [5, 0.7], [20, 0.3]]),
  chal: curve([[-600, 0.1], [0, 1], [300, 1.2], [900, 0.2]]), apt: curve([[-1, 0.6], [0, 1], [1, 1.5]]),
  attr: curve([[0, 0.5], [10, 1], [20, 1.4]]), age: curve([[0, 0.3], [0.2, 1.2], [1, 1]]),
  lang: curve([[0, 0.3], [700, 0.7], [2000, 1]]),
  carrier: curve([[0, 100], [3, 611.1], [7, 1499.9]]),                           // carrierLevelCurve
  share: curve([[0, 0], [0.3, 0.0701], [1, 0.4999]]),                            // expectedShare
};
const LEARN = [curve([[0, 1], [400, 0.8], [1200, 0.5], [2700, 0.15]]), curve([[0, 1], [333, 0.7777], [1201, 0.4999], [2700, 0.1501]])];
const RUST = [curve([[0, 1], [0.5, 0.6], [1, 0.35], [2, 0.1], [4, 0]]), curve([[0, 1], [0.3, 0.61], [1, 0.35], [1.7, 0.1], [4, 0]])];

// ── 一个人的技能记录 ──
const newPerson = rows => ({ rows: new Map(rows.map(r => [r.id, r])), recs: new Map() });
const recToday = (rec, today) => rec.markDay === today;

function decayOf(row, s8, sP, p8, pP, lastDay, today) {   // SK-4；"stored 已不高于下限时取 stored"是分支，取定点一侧的那支
  const days = BigInt(Math.max(0, today - lastDay - row.grace));
  const r8 = look8(row.rust, days * f8(row.rustPerDay)), rP = lookP(row.rust, days * fP(row.rustPerDay));
  const F8 = mul8(p8, f8(row.floor)), FP = mulP(pP, fP(row.floor));
  if (s8 <= F8) return { fx: s8, ref: sP };
  return { fx: F8 + mul8(s8 - F8, r8), ref: FP + mulP(sP - FP, rP) };
}
function transferOf(person, row, today) {   // SK-5 ③：同类其他成员衰退后值 × transfer 的最大者；e_折 取各成员 e_衰 × transfer + 1 里最大的
  let fx = 0n, ref = 0n, e = 0, n = 0;
  for (const [id, rec] of person.recs) {
    const rj = person.rows.get(id);
    if (id === row.id || rj.cls !== row.cls) continue;
    const d = decayOf(rj, rec.s8, rec.sP, rec.p8, rec.pP, rec.lastDay, today);
    const v8 = mul8(d.fx, f8(row.transfer)), vP = mulP(d.ref, fP(row.transfer));
    const ej = (rec.Es + 2 * rj.floor * rec.Ep + 2703) * row.transfer + 1;
    if (n === 0) { fx = v8; ref = vP; } else { fx = maxB(fx, v8); ref = maxB(ref, vP); }
    e = Math.max(e, ej); n++;
  }
  return { fx, ref, e, n };
}
function readingOf(person, row, today) {   // 当前值：SK-5 ①②③ 的读数，降到 10⁴；参考一侧取同一读数（卷二第 6 条离散判定）
  const rec = person.recs.get(row.id);
  const self = rec ? decayOf(row, rec.s8, rec.sP, rec.p8, rec.pP, rec.lastDay, today).fx : 0n;
  return trunc4(maxB(self, transferOf(person, row, today).fx));
}

// ── 统计 ──
let fails = 0, writes = 0, worst = 0, minRatio = Infinity;
const cov = { seedRoster: 0, seedGuardian: 0, seedNative: 0, step1: 0, step1New: 0, step3: 0, step3Sep: 0, step3NoSep: 0, days: new Set(),
  branch: [0, 0, 0, 0], branchCarrier: 0, sep: 0, noSep: 0, clamp0: 0, dayReset: 0, multiSessionDay: 0 };
const BR = ['管线结果', '来源上限', '缺前置上限', '当日单项上限'];
let verbose = false;
function judge(person, id, what, today) {
  const rec = person.recs.get(id);
  const a = [act(rec.s8, rec.sP), act(rec.p8, rec.pP), act(rec.d8, rec.dP)], b = [rec.Es, rec.Ep, rec.Ed];
  writes++;
  let ok = true;
  for (let k = 0; k < 3; k++) {
    if (a[k] > b[k]) ok = false;
    if (b[k] > 0) worst = Math.max(worst, a[k] / b[k]);
    if (a[k] >= 0.5 && b[k] > 0) minRatio = Math.min(minRatio, b[k] / a[k]);
  }
  if (!ok) { fails++; console.log(`FAIL 日 ${today} ${id} ${what}：stored ${a[0]}/${b[0]}，peak ${a[1]}/${b[1]}，dayGain ${a[2]}/${b[2]}`); }
  else if (verbose) console.log(`   日 ${String(today).padStart(3)} ${id.padEnd(8)} ${what.padEnd(26)} stored 实际 ${a[0].toFixed(2)}／界 ${b[0].toFixed(0)}（${(b[0] ? a[0] / b[0] : 0).toFixed(3)}）  peak ${a[1].toFixed(2)}／${b[1].toFixed(0)}（${(b[1] ? a[1] / b[1] : 0).toFixed(3)}）  dayGain ${a[2].toFixed(2)}／${b[2].toFixed(0)}（${(b[2] ? a[2] / b[2] : 0).toFixed(3)}）`);
}

// ── seedSkills（§4.11 UB-7） ──
function seed(person, id, kind, args, today) {
  let s8, sP, m0;
  if (kind === 'roster') {        // 轮廓值 × profileScale（两个 10⁴ 数相乘，无余数）× 噪声因子（截断 1）
    const a8 = f8(args.profile) * f8(args.scale) / S8, aP = fP(args.profile) * fP(args.scale) / P;
    s8 = mul8(a8, f8(args.noise)); sP = mulP(aP, fP(args.noise)); m0 = 1; cov.seedRoster++;
  } else if (kind === 'guardian') { // expectedShare 查表（1）× 轮廓值（上界 2700），相乘截断 1
    s8 = mul8(look8(RULES.share, f8(args.relAge)), f8(args.profile)); sP = mulP(lookP(RULES.share, fP(args.relAge)), fP(args.profile)); m0 = 2701; cov.seedGuardian++;
  } else { s8 = f8(args.value); sP = fP(args.value); m0 = 0; cov.seedNative++; }
  person.recs.set(id, { s8, sP, p8: s8, pP: sP, d8: 0n, dP: 0n, Es: m0, Ep: m0, Ed: 0, lastDay: today, markDay: today });
  judge(person, id, `seedSkills ${kind} m₀=${m0}`, today);
}

// ── gainSkill：第 1 步、SK-2、封顶、第 2 步、第 3 步 ──
// session: {minutes, rate, teacher (教师值读数|null), students, cf (ceilingFraction|null), carrier (载体 difficulty|null), challenge, difficulty,
//           w (languageWeight), langRd, aptRd, attrRd, ageRd, load, cap, prereqMet}
function gainSkill(person, id, ss, today) {
  const row = person.rows.get(id);
  let rec = person.recs.get(id), created = false;
  if (!rec) { rec = { s8: 0n, sP: 0n, p8: 0n, pP: 0n, d8: 0n, dP: 0n, Es: 0, Ep: 0, Ed: 0, lastDay: today, markDay: today }; person.recs.set(id, rec); created = true; }
  if (rec.markDay !== today) { rec.d8 = 0n; rec.dP = 0n; rec.Ed = 0; rec.markDay = today; cov.dayReset++; }   // 换日：dayGain 当 0，E_d := 0
  cov.days.add(today);

  // 第 1 步 折算起点（"低于折算值才改写"是分支，取定点一侧）
  const t1 = transferOf(person, row, today);
  if (created || rec.s8 < t1.fx) {
    rec.s8 = t1.fx; rec.sP = t1.ref; rec.Es = Math.ceil(t1.e);
    rec.p8 = maxB(rec.p8, rec.s8); rec.pP = maxB(rec.pP, rec.sP); rec.Ep = Math.max(rec.Ep, rec.Es);
    if (created) cov.step1New++; else cov.step1++;
    judge(person, id, created ? '第1步 建立记录' : `第1步 折算改写 m₁=${Math.ceil(t1.e)}`, today);
  }

  // SK-2 乘式（十二个因子，固定次序）
  const rd8 = readingOf(person, row, today), rdP = rd8 * UP50;
  const one = { fx: S8, ref: P };
  const L = (c, x8, xP) => ({ fx: look8(c, x8), ref: lookP(c, xP) });
  const R = x => ({ fx: f8(x), ref: fP(x) });
  const hasT = ss.teacher != null;
  const F = [
    L(row.learn, rd8, rdP),
    R(ss.rate),
    hasT ? L(RULES.gap, f8(ss.teacher) - rd8, fP(ss.teacher) - rdP) : one,
    hasT ? L(RULES.group, f8(ss.students), fP(ss.students)) : one,
    { fx: S8 - mul8(f8(ss.w), S8 - look8(RULES.lang, f8(ss.langRd))), ref: P - mulP(fP(ss.w), P - lookP(RULES.lang, fP(ss.langRd))) },
    ss.challenge ? L(RULES.chal, f8(ss.difficulty) - rd8, fP(ss.difficulty) - rdP) : one,
    L(RULES.apt, f8(ss.aptRd), fP(ss.aptRd)), L(RULES.attr, f8(ss.attrRd), fP(ss.attrRd)), L(RULES.age, f8(ss.ageRd), fP(ss.ageRd)),
    L(RULES.burden, f8(ss.load) * S8 / f8(ss.cap), fP(ss.load) * P / fP(ss.cap)),        // 先除（截断 1）后查表
    ss.prereqMet ? one : R(RULES.prereqMult),
    rd8 < rec.p8 ? R(RULES.relearnMult) : one,                                             // 当前值低于 peak 是分支
  ];
  let g8 = BigInt(ss.minutes) * f8(row.bgph) / 60n, gP = BigInt(ss.minutes) * fP(row.bgph) / 60n;   // G₀：整数乘后整除一次
  for (const f of F) { g8 = mul8(g8, f.fx); gP = mulP(gP, f.ref); }
  // 确定式：Β、ε_Σ、e_乘（卷十四 SK-3 第 2 步）
  const beta = [row.learn.top, ss.rate, RULES.gap.top, RULES.group.top, 1, RULES.chal.top, RULES.apt.top, RULES.attr.top, RULES.age.top, RULES.burden.top, RULES.prereqMult, RULES.relearnMult]
    .reduce((p, u) => p * Math.max(1, u), 1);
  const G0 = ss.minutes * row.bgph / 60, eps = 9 + ss.w + RULES.burden.sig, eMul = beta * (13 + eps * G0);

  // 封顶取小：四支，各支在两列里的误差与完整误差界
  const br = [{ k: 0, fx: g8, ref: gP, cS: eMul, cD: eMul, full: eMul }];
  if (ss.cf != null) {
    let lv8, lvP, eC;
    if (hasT) { lv8 = mul8(f8(ss.teacher), f8(ss.cf)); lvP = mulP(fP(ss.teacher), fP(ss.cf)); eC = 0; }
    else { lv8 = mul8(look8(RULES.carrier, f8(ss.carrier)), f8(ss.cf)); lvP = mulP(lookP(RULES.carrier, fP(ss.carrier)), fP(ss.cf)); eC = ss.cf + 1; }
    br.push({ k: 1, fx: lv8 - rec.s8, ref: lvP - rec.sP, cS: eC, cD: eC + rec.Es, full: eC + rec.Es, carrier: !hasT });
  }
  if (!ss.prereqMet) br.push({ k: 2, fx: f8(row.capWP) - rec.s8, ref: fP(row.capWP) - rec.sP, cS: 0, cD: rec.Es, full: rec.Es });
  br.push({ k: 3, fx: f8(row.dailyCap) - rec.d8, ref: fP(row.dailyCap) - rec.dP, cS: rec.Ed, cD: 0, full: rec.Ed });
  let ch = br[0]; for (const b of br) if (b.fx < ch.fx) ch = b;
  let refMin = br[0].ref; for (const b of br) refMin = minB(refMin, b.ref);
  const sep = br.every(b => b === ch || Number(absB(ch.fx - b.fx)) > ch.full + b.full);
  const eHs = sep ? ch.cS : Math.max(...br.map(b => b.cS)), eHd = sep ? ch.cD : Math.max(...br.map(b => b.cD));
  cov.branch[ch.k]++; if (ch.carrier) cov.branchCarrier++; if (sep) cov.sep++; else cov.noSep++;
  const h8 = maxB(0n, ch.fx), hP = maxB(0n, refMin);           // 增量不为负（DG-3"不扣减，只是不再长"）
  if (ch.fx <= 0n) cov.clamp0++;

  // 当日合计递减
  let D8 = 0n, DP = 0n, EDall = 0;
  for (const r of person.recs.values()) if (recToday(r, today)) { D8 += r.d8; DP += r.dP; EDall += r.Ed; }
  const gain8 = mul8(h8, look8(RULES.dtc, D8)), gainP = mulP(hP, lookP(RULES.dtc, DP));
  const yb = RULES.dtc.top, sg = RULES.dtc.sig;
  const hS = num(hP) + eHs * 1e-8, hD = num(hP) + eHd * 1e-8;
  const etS = sg * EDall + 1, etD = sg * (EDall - rec.Ed) + 1;
  const m2s = Math.ceil(yb * eHs + hS * etS + 1), m2d = Math.ceil(yb * eHd + hD * etD + 1);
  const Gs = Math.max(1, yb - 1), Gd = Gs + sg * hD;

  // 第 2 步 加增量
  rec.s8 += gain8; rec.sP += gainP; rec.d8 += gain8; rec.dP += gainP;
  rec.p8 = maxB(rec.p8, rec.s8); rec.pP = maxB(rec.pP, rec.sP);
  rec.Es = Gs * rec.Es + m2s; rec.Ed = Gd * rec.Ed + m2d; rec.Ep = Math.max(rec.Ep, rec.Es);
  judge(person, id, `第2步 ${BR[ch.k]}${ch.carrier ? '(载体)' : ''} ${sep ? '分得开' : '分不开'}`, today);

  // 第 3 步 有效练习（阈值比较是分支）
  if (rec.d8 >= f8(RULES.upkeep) && rec.lastDay !== today) {
    const Est = Math.max(rec.Es + rec.Ed, rec.Ep);
    const self = decayOf(row, rec.s8 - rec.d8, rec.sP - rec.dP, rec.p8, rec.pP, rec.lastDay, today), eSelf = Est + 2703;
    const t3 = transferOf(person, row, today);
    const selfWins = t3.n === 0 || self.fx >= t3.fx;
    const sep3 = t3.n === 0 || Number(absB(self.fx - t3.fx)) > eSelf + t3.e;
    const m3 = Math.ceil(sep3 ? (selfWins ? eSelf : t3.e) : Math.max(eSelf, t3.e));
    const b8 = t3.n ? maxB(self.fx, t3.fx) : self.fx, bP = t3.n ? maxB(self.ref, t3.ref) : self.ref;
    rec.s8 = b8 + rec.d8; rec.sP = bP + rec.dP; rec.Es = m3 + rec.Ed;
    rec.p8 = maxB(rec.p8, rec.s8); rec.pP = maxB(rec.pP, rec.sP); rec.Ep = Math.max(rec.Ep, rec.Es);
    rec.lastDay = today; cov.step3++; if (sep3) cov.step3Sep++; else cov.step3NoSep++;
    judge(person, id, `第3步 ${selfWins ? '自身' : '折算'} ${sep3 ? '分得开' : '分不开'} m₃=${m3}`, today);
  }
}

// ═══ 一、点名序列（逐次列出 实际 ／ 界 与比值） ═══
const ROWS = [
  { id: 'A_west', cls: 'forge', bgph: 6, learn: LEARN[0], dailyCap: 40, rustPerDay: 0.002, grace: 30, floor: 0.5, transfer: 0.8, capWP: 2700, rust: RUST[0] },
  { id: 'B_steppe', cls: 'forge', bgph: 6, learn: LEARN[1], dailyCap: 40, rustPerDay: 0.0023, grace: 25, floor: 0.45, transfer: 0.8, capWP: 2700, rust: RUST[1] },
  { id: 'C_deep', cls: 'forge', bgph: 7.5, learn: LEARN[1], dailyCap: 33.3333, rustPerDay: 0.0017, grace: 40, floor: 0.55, transfer: 0.7, capWP: 2700, rust: RUST[1] },
  { id: 'L_native', cls: 'lang', bgph: 3, learn: LEARN[0], dailyCap: 25, rustPerDay: 0.0011, grace: 60, floor: 0.7, transfer: 0.5, capWP: 2700, rust: RUST[0] },
  { id: 'D_spirit', cls: 'spirit', bgph: 4.4, learn: LEARN[1], dailyCap: 29.7777, rustPerDay: 0.003, grace: 20, floor: 0.4, transfer: 0.6, capWP: 500, rust: RUST[1] },
];
const base = { rate: 1, teacher: null, students: 1, cf: null, carrier: null, challenge: false, difficulty: 0, w: 0, langRd: 2000, aptRd: 0.3, attrRd: 12.5, ageRd: 0.6, load: 900, cap: 1300.7, prereqMet: true };
const S = o => ({ ...base, ...o });
console.log('一、点名序列（一人五项技能；三项同类互相折算；单位 10⁻⁸；括号里是 实际÷界）');
verbose = true;
{
  const p = newPerson(ROWS);
  seed(p, 'A_west', 'roster', { profile: 1200, scale: 0.8513, noise: 1.0731 }, 0);
  seed(p, 'C_deep', 'guardian', { relAge: 0.6131, profile: 900 }, 0);
  seed(p, 'L_native', 'native', { value: 1800 }, 0);
  // 1–12 日：教师授 A（教师值 1300 × 0.9 = 1170 封顶），每日两段 150 分钟，触当日单项上限，后触来源上限
  for (let d = 1; d <= 12; d++) {
    gainSkill(p, 'A_west', S({ minutes: 150, rate: 1.2, teacher: 1300, students: 3, cf: 0.9, w: 0.3, langRd: 650.5 }), d);
    gainSkill(p, 'A_west', S({ minutes: 150, rate: 1.2, teacher: 1300, students: 3, cf: 0.9, w: 0.3, langRd: 650.5 }), d);
  }
  // 13–16 日：头一回练 B（第 1 步建立记录、从折算值起步），自行练习、有难度
  for (let d = 13; d <= 16; d++) { gainSkill(p, 'B_steppe', S({ minutes: 200, challenge: true, difficulty: 1300 }), d); gainSkill(p, 'B_steppe', S({ minutes: 45, challenge: true, difficulty: 1250 }), d); }
  // 17 日：同日练三项，当日合计递减把三项的 E_d 连起来
  gainSkill(p, 'A_west', S({ minutes: 120, rate: 1.2, teacher: 1300, students: 3, cf: 0.9 }), 17);
  gainSkill(p, 'B_steppe', S({ minutes: 240, challenge: true, difficulty: 1400 }), 17);
  gainSkill(p, 'C_deep', S({ minutes: 300, challenge: true, difficulty: 900 }), 17);
  // 260 日：A 闲置 240 余日后，C 的存储值已低于 A 衰退后的折算值 → 第 1 步改写；随后第 3 步
  gainSkill(p, 'C_deep', S({ minutes: 90, challenge: true, difficulty: 1000 }), 260);
  gainSkill(p, 'C_deep', S({ minutes: 240, challenge: true, difficulty: 1000 }), 260);
  // 261–264 日：A 重拾（重拾倍率），载体来源（读本，difficulty 6.5 → 来源水平 × 0.8）
  for (let d = 261; d <= 264; d++) gainSkill(p, 'A_west', S({ minutes: 180, carrier: 6.5, cf: 0.8, w: 0.6, langRd: 333.3 }), d);
  // 265–268 日：D 缺前置（capWithoutPrereq 500），教师值 1000 × 0.5 = 500 与之相等 → 两支分不开
  seed(p, 'D_spirit', 'roster', { profile: 470, scale: 1, noise: 1.0213 }, 264);
  for (let d = 265; d <= 268; d++) gainSkill(p, 'D_spirit', S({ minutes: 600, rate: 1.2, teacher: 1000, students: 2, cf: 0.5, prereqMet: false }), d);
  // 269–272 日：母语与教师共读，大分钟数（G₀ 大）
  for (let d = 269; d <= 272; d++) gainSkill(p, 'L_native', S({ minutes: 720, teacher: 2100, students: 12, cf: 1, w: 1, langRd: 1999.9 }), d);
}
verbose = false;
const fixedFails = fails;
console.log(`${fixedFails ? 'FAIL' : 'PASS'} 点名序列：${writes} 次写入，超界 ${fixedFails} 次`);

// ═══ 二、随机序列 ═══
let seedR = 20261113;
const rnd = () => (seedR = (seedR * 1103515245 + 12345) % 2147483648) / 2147483648;
const int = (lo, hi) => Math.floor(lo + rnd() * (hi - lo + 1));
const dec4 = (lo, hi) => Math.round((lo + rnd() * (hi - lo)) * 1e4) / 1e4;
const w0 = writes, f0 = fails;
for (let pi = 0; pi < 300; pi++) {
  const rows = [];
  for (let k = 0; k < 4; k++) rows.push({ id: `S${k}`, cls: k < 3 ? 'K' : 'J', bgph: dec4(0.5, 200), learn: LEARN[int(0, 1)], dailyCap: dec4(5, 60), rustPerDay: dec4(0.0005, 0.01),
    grace: int(0, 40), floor: dec4(0, 1), transfer: dec4(0, 1), capWP: dec4(100, 2600), rust: RUST[int(0, 1)] });
  const p = newPerson(rows);
  for (const r of rows) {
    const k = int(0, 3);
    if (k === 0) seed(p, r.id, 'roster', { profile: dec4(1, 2000), scale: dec4(0.3, 1.2), noise: dec4(0.8, 1.2) }, 0);
    else if (k === 1) seed(p, r.id, 'guardian', { relAge: dec4(0, 1), profile: dec4(1, 2700) }, 0);
    else if (k === 2 && r.cls === 'J') seed(p, r.id, 'native', { value: dec4(0, 2000) }, 0);
  }
  let day = 0;
  for (let n = 0; n < 60; n++) {
    day += rnd() < 0.15 ? int(20, 200) : int(1, 3);
    const sessions = int(1, 4);
    if (sessions > 1) cov.multiSessionDay++;
    for (let s = 0; s < sessions; s++) {
      const id = `S${int(0, 3)}`, rec = p.recs.get(id);
      if (rec && rec.s8 >= f8(2600)) continue;   // 适用区间：技能值不出 [0, 2700]
      const kind = int(0, 2), cur = rec ? Number(rec.s8 / S8) : 0;
      gainSkill(p, id, S({
        minutes: int(1, 720), rate: [0.5, 1, 1.2][int(0, 2)],
        teacher: kind === 1 ? Math.min(2700, Math.max(1, cur + dec4(-50, 300))) : null, students: int(1, 25),
        cf: kind === 0 ? null : dec4(0.3, 1), carrier: kind === 2 ? dec4(0, 7) : null,
        challenge: kind === 0 || rnd() < 0.3, difficulty: dec4(-200, 2700), w: dec4(0, 1), langRd: dec4(0, 2000),
        aptRd: dec4(-1, 1), attrRd: dec4(0, 20), ageRd: dec4(0, 1), load: dec4(0, 5000), cap: dec4(100, 3000), prereqMet: rnd() < 0.7,
      }), day);
    }
  }
}
console.log(`${fails - f0 ? 'FAIL' : 'PASS'} 随机序列：300 人 × 60 个练习日（每日 1–4 段，15% 的间隔为 20–200 日），${writes - w0} 次写入，超界 ${fails - f0} 次`);

// ═══ 三、覆盖（R1 点名的各项都须走到） ═══
const need = [
  ['seedSkills 名册职业（m₀ = 1）', cov.seedRoster], ['seedSkills 监护人主业（m₀ = 2701）', cov.seedGuardian], ['seedSkills 母语（m₀ = 0）', cov.seedNative],
  ['封顶取 管线结果', cov.branch[0]], ['封顶取 来源上限', cov.branch[1]], ['封顶取 来源上限（载体）', cov.branchCarrier], ['封顶取 缺前置上限', cov.branch[2]], ['封顶取 当日单项上限', cov.branch[3]],
  ['取小 分得开', cov.sep], ['取小 分不开（按最大的一支计）', cov.noSep], ['增量被封到 0', cov.clamp0],
  ['第 1 步 折算改写（已有记录）', cov.step1], ['第 1 步 建立记录', cov.step1New], ['第 3 步 有效练习改写', cov.step3], ['第 3 步 分得开', cov.step3Sep],
  ['换日（E_d := 0）', cov.dayReset], ['一日多段', cov.multiSessionDay],
];
const miss = need.filter(([, n]) => !n);
console.log(`${miss.length ? 'FAIL' : 'PASS'} 覆盖：${need.map(([k, n]) => `${k} ${n}`).join('；')}；第 3 步 分不开 ${cov.step3NoSep}（可为 0）；练习日 ${cov.days.size}`);
if (miss.length) fails++;

console.log(`合计：写入 ${writes} 次；失败项 ${fails}；全程 实际÷界 最大 ${worst.toFixed(4)}；界÷实际 最小 ${Number.isFinite(minRatio) ? minRatio.toFixed(2) : '实际都不足半个单位'}（实际不足半个单位的不计比值）`);
process.exitCode = fails ? 1 : 0;
