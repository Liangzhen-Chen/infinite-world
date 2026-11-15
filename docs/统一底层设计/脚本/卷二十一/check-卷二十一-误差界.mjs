// 卷二十一 第八版：扩展标度误差界的本机验算（李白 11-13 对第七版单核 N4 的裁定）。
// 做法：定点一侧照卷二 §3.3 实现（10⁸ 标度 BigInt；fixedUnits8、fixedMultiply8、整除、fixedExp、fixedLn，全部向零截断）；
//       参考一侧用 50 位十进制定点（BigInt）算同一条式子，不截到 10⁻⁸；
//       每个量带三样东西：定点值 fx、参考值 ref、误差界 err（以 10⁻⁸ 为单位），err 按卷二 §3.3"存量与余数结转"第 6 条的递推逐步算；
//       另把卷二十一 R21-6.2、R21-1.2、R21-3.3 写出的确定式各算一遍（下称"界"）。
// 断言：实际误差 ≤ 界；逐步递推的 err ≤ 界（确定式没有漏项）；并列出 界 ÷ 实际。
// 11-13 增两组（除数下界）：五、储备量 R 为 0 或不超过 e_R 时走"储备已空"分支、不做除法（卷二十一第九版 R21-4.1：与 D0 = 0 同一分支，不建实例、不求值）；
//                           六、体重低于最小体重时按最小体重算（最小体重取卷二十一第九版 rules.health.minDoseMassKg = 0.02）。
// 只做算术，不读写项目文件。用法：node F:/dnd/docs/统一底层设计/脚本/卷二十一/check-卷二十一-误差界.mjs
const S8 = 10n ** 8n, P = 10n ** 50n, UP50 = P / S8;
const W = 10n ** 18n, UP = 10n ** 10n, LN2_18 = 693147180559945309n, TERMS = 20;

// ── 参考一侧：50 位定点 ──
const absB = v => (v < 0n ? -v : v);
function hpExp(x) {
  const k = x / P, r = x - k * P;
  let term = P, sum = P;
  for (let i = 1n; i < 300n; i++) { term = term * r / (P * i); sum += term; if (term === 0n) break; }
  let e1 = P, t1 = P;
  for (let i = 1n; i < 300n; i++) { t1 = t1 / i; e1 += t1; if (t1 === 0n) break; }
  let out = sum;
  for (let i = 0n; i < absB(k); i++) out = k > 0n ? out * e1 / P : out * P / e1;
  return out;
}
function lnSeries(m) {   // m ∈ [1, 2]
  const t = (m - P) * P / (m + P), t2 = t * t / P;
  let s = 0n, p = t;
  for (let i = 0n; i < 400n; i++) { s += p / (2n * i + 1n); p = p * t2 / P; if (p === 0n) break; }
  return 2n * s;
}
const HPLN2 = lnSeries(2n * P);
function hpLn(x) { let n = 0n, m = x; while (m >= 2n * P) { m /= 2n; n++; } while (m < P) { m *= 2n; n--; } return n * HPLN2 + lnSeries(m); }

// ── 定点一侧：卷二 §3.3 ──
function bigExp8(p, q) {
  const S = 10n ** 60n; const neg = p < 0n; if (neg) p = -p;
  let term = S, sum = S;
  for (let k = 1n; k < 400n; k++) { term = term * p / (q * k); sum += term; if (term === 0n) break; }
  return (neg ? S * S / sum : sum) / (S / S8);
}
const expInt = new Map(); for (let k = -40n; k <= 40n; k++) expInt.set(k, bigExp8(k, 1n));
const expFrac = []; for (let m = 0n; m <= 4096n; m++) expFrac.push(bigExp8(m, 4096n));
function fixedExp(x) {
  let k = x / S8; if (x < 0n && k * S8 !== x) k -= 1n;
  if (k < -40n || k > 40n || (k === 40n && x !== 40n * S8)) throw new Error('fixedExp 越界');
  const r = x - k * S8, r4096 = r * 4096n, m = r4096 / S8, f = r4096 - m * S8;
  const er = m === 4096n ? expFrac[4096] : expFrac[Number(m)] + (expFrac[Number(m) + 1] - expFrac[Number(m)]) * f / S8;
  return expInt.get(k) * er / S8;
}
function fixedLn(X) {
  if (X <= 0n || X > expInt.get(40n)) throw new Error('fixedLn 越界');
  const A = X * UP; let n = 0n;
  while ((W << (n + 1n)) <= A) n++;
  while (n > -64n && (n >= 0n ? (W << n) : W) > (n >= 0n ? A : A << (-n))) n--;
  const m = n >= 0n ? A >> n : A << (-n);
  const t = (m - W) * W / (m + W), t2 = t * t / W;
  let s = 0n, p = t;
  for (let i = 0n; i < BigInt(TERMS); i++) { s += p / (2n * i + 1n); p = p * t2 / W; }
  return (n * LN2_18 + 2n * s) / UP;
}
const mul8 = (a, b) => a * b / S8;

// ── 带误差界的量 ──
const U = 1e-8;
const num = ref => Number(ref * 10n ** 17n / P) / 1e17;          // 参考值转浮点，只用于算界
function dec(s, scale) {                                          // 十进制字串转定点，超出的位截断
  const neg = s.startsWith('-'); const [i, f = ''] = s.replace('-', '').split('.');
  const digits = String(scale).length - 1;
  const v = BigInt(i) * scale + BigInt((f + '0'.repeat(digits)).slice(0, digits) || '0');
  return neg ? -v : v;
}
class T {
  constructor(fx, ref, err) { this.fx = fx; this.ref = ref; this.err = err; }
  get v() { return num(this.ref); }
  get actual() { return Number(absB(this.fx * UP50 - this.ref) * 10n ** 6n / UP50) / 1e6; }   // 实际误差，单位 10⁻⁸
}
const ex = s => new T(dec(s, S8), dec(s, P), 0);                  // 数据里写得尽的数：误差 0
const add = (a, b) => new T(a.fx + b.fx, a.ref + b.ref, a.err + b.err);
const sub = (a, b) => new T(a.fx - b.fx, a.ref - b.ref, a.err + b.err);
// 乘：err = e_a × B(b) + B(a) × e_b + 源误差；B(b) 须盖住 b 的定点值（缺省取 |参考值| + 自身误差），B(a) 取 a 的参考值
const mul = (a, b, src = 1, Bb = null) => new T(a.fx * b.fx / S8, a.ref * b.ref / P, a.err * (Bb ?? (Math.abs(b.v) + b.err * U)) + Math.abs(a.v) * b.err + src);
// 除：err = (e_a + |a÷b| × e_b) ÷ (|b| − e_b) + 1
let divCalls = 0;                                                 // 第五组用它断言"储备已空"分支没有做除法
function div(a, b) {
  divCalls++;
  const low = Math.abs(b.v) - b.err * U; if (!(low > 0)) throw new Error('除数下界不为正，这次写入没有界');
  const ref = a.ref * P / b.ref;
  return new T(a.fx * S8 / b.fx, ref, (a.err + Math.abs(num(ref)) * b.err) / (low) + 1);
}
// fixedExp：err = (5 + e_x) × y⁺ + 4，y⁺ = y × (1 + 2 × e_x × 10⁻⁸)
function fexp(x) { const ref = hpExp(x.ref); return new T(fixedExp(x.fx), ref, (5 + x.err) * num(ref) * (1 + 2 * x.err * U) + 4); }
// 非整数次幂（卷二"唯一写法"）：底数、指数都写得尽；err = (2|k| + 7) × y + 4
function fpow(x, k) { const ref = hpExp(k.ref * hpLn(x.ref) / P); return new T(fixedExp(mul8(k.fx, fixedLn(x.fx))), ref, (2 * Math.abs(k.v) + 7) * num(ref) + 4); }
const clamp = (a, lo, hi) => new T(a.fx < lo.fx ? lo.fx : a.fx > hi.fx ? hi.fx : a.fx, a.ref < lo.ref ? lo.ref : a.ref > hi.ref ? hi.ref : a.ref, a.err);
const ZERO = ex('0'), ONE = ex('1');
// 时长：速率 × 分钟 ÷ 1440 一次整除（源误差 1）
const rateTimes = (rate, minutes) => new T(rate.fx * BigInt(minutes) / 1440n, rate.ref * BigInt(minutes) / 1440n, minutes === 0 ? 0 : 1);
// Δ：tickMinutes ÷ 1440 的 10⁸ 表示；写不尽时表示误差 δ = 1
const deltaOf = tick => { const exact = (BigInt(tick) * S8) % 1440n === 0n; return { t: new T(BigInt(tick) * S8 / 1440n, BigInt(tick) * P / 1440n, exact ? 0 : 1), d: exact ? 0 : 1, v: tick / 1440 }; };
const mulDelta = (a, D) => mul(a, D.t, 1, D.v);                   // Δ 的定点值不超过 Δ

let fails = 0; const lines = [];
const say = s => { lines.push(s); console.log(s); };
const ratios = [];
function judge(name, actual, tracked, bound, extra = '') {
  const ok = actual <= bound && tracked <= bound + 1e-6;
  if (!ok) fails++;
  const r = actual > 0 ? bound / actual : Infinity;
  if (Number.isFinite(r)) ratios.push(r);
  say(`${ok ? 'PASS' : 'FAIL'} ${name}: 界=${bound} 实际=${actual.toFixed(2)} 界÷实际=${Number.isFinite(r) ? r.toFixed(2) : '实际为0'}${extra ? ' ' + extra : ''}`);
  return ok;
}

// ═══ 一、R21-6.2 药性浓度 ═══
const AX = { refDose: ex('0.005'), massExp: ex('0.75'), bio: ex('0.8'), clear: ex('1'), overdoseAt: ex('3') };
// 一次摄入：返回新的 value（带逐步递推的 err）与确定式 m
function intake(rec, t, massStr, pharmStr, sensStr, kgStr, ax = AX) {
  const m = ex(massStr), pharm = ex(pharmStr), sens = ex(sensStr), kg = ex(kgStr);
  const pw = fpow(kg, ax.massExp);
  const D = mul(ax.refDose, pw);
  const N = mul(mul(mul(m, pharm), ax.bio), sens);
  const dc = div(N, D);
  // 确定式（R21-6.2）
  const eP = (2 * ax.massExp.v + 7) * pw.v + 4, eD = ax.refDose.v * eP + 1, eN = ax.bio.v * sens.v + sens.v + 1;
  const eDelta = (eN + dc.v * eD) / (D.v - eD * U) + 1;
  let read = null, eRead = 0;
  if (rec) {
    const y = fexp(new T(-rateTimes(ax.clear, t - rec.at).fx, -rateTimes(ax.clear, t - rec.at).ref, rateTimes(ax.clear, t - rec.at).err));
    read = mul(rec.value, y, 1, 1);
    const yPlus = Math.min(1, y.v * (1 + 2 * U));
    eRead = rec.value.v * (6 * yPlus + 4) + 1;
  }
  const value = read ? add(read, dc) : dc;
  const old = 11 + 5 + Math.ceil(dc.v * (2 * ax.massExp.v + 7 + 4 / pw.v)) + 1;   // 第七版按截断次数数出的 m
  return { value, at: t, m: Math.ceil(eRead + eDelta), dconc: dc.v, old };
}
say('一、药性浓度（R21-6.2；单位 10⁻⁸）');
{
  const r = intake(null, 0, '0.00674', '40', '1', '12');
  judge(`12 公斤幼儿整包 6.74 克（§4.6.5）：Δconc=${r.dconc.toFixed(4)}`, r.value.actual, r.value.err, r.m, `（第七版的界=${r.old}）`);
  const a1 = intake(null, 0, '0.00674', '40', '1', '60');
  judge(`60 公斤标准剂量 第一次：value=${a1.value.v.toFixed(4)}`, a1.value.actual, a1.value.err, a1.m);
  const a2 = intake({ value: a1.value, at: 0 }, 360, '0.00674', '40', '1', '60');
  judge(`60 公斤标准剂量 6 小时后第二次：value=${a2.value.v.toFixed(4)}`, a2.value.actual, a2.value.err, a1.m + a2.m, `（两次 m 之和 ${a1.m}+${a2.m}；第七版的界=${a1.old + a2.old}）`);
  const a3 = intake({ value: a2.value, at: 360 }, 1440, '0.00674', '40', '1', '60');
  judge(`60 公斤标准剂量 次日第三次：value=${a3.value.v.toFixed(4)}`, a3.value.actual, a3.value.err, a1.m + a2.m + a3.m);
  // 扫一遍：体重 × 给药量 × 间隔
  let n = 0, bad = 0, minR = Infinity, sumR = 0, old = 0; const rs = [];
  let seed = 20261113n; const rnd = k => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return Number((seed >> 11n) % BigInt(k)); };
  for (const kg of ['0.5', '3', '12', '20', '60', '85.5', '3000'])
    for (let i = 0; i < 400; i++) {
      const mass = (0.0002 + rnd(600000) / 1e7).toFixed(8), sens = (0.2 + rnd(30000) / 1e4).toFixed(4);
      const f = intake(null, 0, mass, '40', sens, kg);
      const s = intake({ value: f.value, at: 0 }, 1 + rnd(4000), (0.0002 + rnd(600000) / 1e7).toFixed(8), '40', sens, kg);
      for (const [val, bound, oldBound] of [[f.value, f.m, f.old], [s.value, f.m + s.m, f.old + s.old]]) {
        n++; if (val.actual > bound || val.err > bound + 1e-6) bad++;
        if (oldBound !== null && val.actual > oldBound) old++;
        if (val.actual > 0.5) { const r = bound / val.actual; rs.push(r); minR = Math.min(minR, r); sumR += r; }
      }
    }
  rs.sort((x, y) => x - y);
  if (bad) fails++;
  say(`${bad ? 'FAIL' : 'PASS'} 扫描 7 种体重 × 400 组（单次与二次给药共 ${n} 个写入）：超界 ${bad} 个；界÷实际 最小 ${minR.toFixed(2)}、中位 ${rs[rs.length >> 1].toFixed(2)}、最大 ${rs.at(-1).toFixed(2)}（实际误差不足半个单位的不计比值）；其中实际误差超出第七版旧界的 ${old} 个`);
  ratios.push(minR);
}

// ═══ 二、R21-1.2 严重度：12 公斤幼儿的中毒行 ═══
say('二、严重度 普通行（R21-1.2；12 公斤幼儿误服后的中毒行，逐拍）');
{
  const D = deltaOf(360);
  const c0 = intake(null, 0, '0.00674', '40', '1', '12');
  const row = { untended: ex('-0.4'), tended: ex('-0.8'), k: ex('3'), mult: ex('1'), care: ex('0') };
  let s = null, E = 0; const traj = [];
  for (let tick = 1; tick <= 12; tick++) {
    const t = tick * 360;
    const rt = rateTimes(AX.clear, t);
    const y = fexp(new T(-rt.fx, -rt.ref, rt.err));
    const conc = mul(c0.value, y, 1, 1);
    const over = clamp(sub(div(conc, AX.overdoseAt), ONE), ZERO, ex('1000000'));
    const drv = mul(row.k, over);
    const base = add(row.untended, mul(row.care, sub(row.tended, row.untended)));
    const raw = add(base, drv);
    if (s === null) { if (raw.fx <= 0n) continue; s = ex('0.05'); }
    const rate = mul(raw, row.mult);
    const step = mulDelta(rate, D);
    s = clamp(add(s, step), ZERO, ONE);
    // 确定式（R21-1.2 普通行的推进）
    const eC = c0.m + c0.value.v * (6 * Math.min(1, y.v * (1 + 2 * U)) + 4) + 1;
    const eOver = eC / AX.overdoseAt.v + 1, eDrv = row.k.v * eOver + 1, eRaw = 1 + eDrv;
    const eRate = eRaw * Math.abs(row.mult.v) + 1, eStep = eRate * D.v + Math.abs(rate.v) * D.d + 1;
    E += Math.ceil(eStep);
    traj.push(s.v.toFixed(3));
    if (tick === 1 || tick === 2 || s.fx === 0n) judge(`第 ${tick} 拍 s=${s.v.toFixed(6)}（本拍 m=${Math.ceil(eStep)}；第七版每拍 m=16）`, s.actual, s.err, E);
    if (s.fx === 0n) break;
  }
  say(`   轨迹 ${traj.join(' ')}（给药量按 6.74 克整算；附录二第 2 项按未取整的 6.737 克算，末位差 0.001）`);
}

// ═══ 三、R21-1.2 亏空行：储备量 R 很小的微量营养素 ═══
function deficitRun(name, cfg, tick, ticks, intakeAt, oldPerTick) {
  const D = deltaOf(tick);
  const D0 = mul(ex(cfg.base0), ex(cfg.ratio), 0), Dm = mul(ex(cfg.baseMod), ex(cfg.ratio), 0);
  const R = mul(D0, ex(cfg.days));
  const eR = 1, Rlow = R.v - eR * U;
  let s = ZERO, E = 0, worst = 0, mPush = 0, mIn = 0;
  for (let i = 1; i <= ticks; i++) {
    const drv = div(Dm, R);
    const step = mulDelta(drv, D);
    s = clamp(add(s, step), ZERO, ONE);
    const eDrv = (0 + Math.abs(drv.v) * eR) / Rlow + 1, eStep = eDrv * D.v + Math.abs(drv.v) * D.d + 1;
    mPush = Math.ceil(eStep); E += mPush;
    if (s.actual > E || s.err > E + 1e-6) { fails++; say(`FAIL ${name} 第 ${i} 拍超界`); }
    worst = Math.max(worst, s.actual / E);
    if (i === intakeAt) {
      const supply = mul(ex(cfg.mass), ex(cfg.nutr));
      const ds = div(supply, R);
      s = clamp(sub(s, ds), ZERO, ONE);
      mIn = Math.ceil((1 + ds.v * eR) / Rlow + 1); E += mIn;
    }
  }
  judge(`${name}：R=${R.v.toExponential(3)}，${ticks} 拍（每拍 ${tick} 分钟），s=${s.v.toFixed(6)}；推进每拍 m=${mPush}，摄入一次 m=${mIn}；第七版推进每拍 m=${oldPerTick}`, s.actual, s.err, E, `全程 实际÷界 最大 ${worst.toFixed(3)}`);
}
say('三、严重度 亏空行（R21-1.2、R21-4.2 至 R21-4.4）');
deficitRun('微量营养素 R 很小', { base0: '0.0137', baseMod: '0.0178', ratio: '0.0001', days: '27.3131', mass: '0.03121357', nutr: '0.0003' }, 360, 80, 60, 6);
deficitRun('微量营养素 R 很小（拍长 60 分钟，Δ 写不尽）', { base0: '0.0137', baseMod: '0.0178', ratio: '0.0001', days: '27.3131', mass: '0.03121357', nutr: '0.0003' }, 60, 480, 360, 6);
deficitRun('对照：常量营养素 R 约 41', { base0: '1.5029', baseMod: '1.9537', ratio: '1', days: '27.3131', mass: '0.81234567', nutr: '1.3' }, 360, 80, 60, 6);
{
  // 溢出与转存：上级 R_n ≈ 2.60，下级 R_m ≈ 0.524（R_n ÷ R_m ≈ 5）
  const D = deltaOf(360);
  const D0n = mul(ex('1.5029'), ex('1'), 0), Dn = mul(ex('1.9537'), ex('1'), 0), Rn = mul(D0n, ex('1.7311'));
  const D0m = mul(ex('1.5029'), ex('0.0041'), 0), Rm = mul(D0m, ex('85.01'));
  const eR = 1, RnLow = Rn.v - eR * U, RmLow = Rm.v - eR * U;
  const push = sn => { const drv = div(Dn, Rn); return { pre: add(sn, mulDelta(drv, D)), m: Math.ceil(((Math.abs(drv.v) * eR) / RnLow + 1) * D.v + Math.abs(drv.v) * D.d + 1) }; };
  let sn = ZERO, En = 0, sm = ZERO, Em = 0;
  for (let i = 1; i <= 6; i++) {
    const p = push(sn); En += p.m;
    if (p.pre.fx > S8) {
      const e = sub(p.pre, ONE);                                    // 被钳掉的严重度，带着上级的累计误差 En
      const x = mul(e, Rn), add_m = div(x, Rm);
      sm = add(sm, add_m);
      const eX = En * (Rn.v + eR * U) + e.v * eR + 1;
      Em += Math.ceil((eX + add_m.v * eR) / RmLow + 1);
      judge(`溢出 第 ${i} 拍：上级累计 E_n=${En}，e=${e.v.toFixed(6)}，R_n÷R_m=${(Rn.v / Rm.v).toFixed(2)}，下级 s_m=${sm.v.toFixed(6)}`, sm.actual, sm.err, Em, `（第七版：${6 + 1 + 3 + 1}）`);
      sn = ONE; En = 0;                                             // 定点值与参考值都钳在 1 上：累计误差清零
    } else sn = p.pre;
  }
  // 转存：上级 s_n 推进两拍后吃进一顿有盈余的饭；下级先有欠量 0.5
  sn = ZERO; En = 0; sm = ex('0.5'); Em = 0;
  for (let i = 0; i < 2; i++) { const p = push(sn); sn = p.pre; En += p.m; }
  const supply = mul(ex('0.81234567'), ex('1.3'));
  const used = mul(sn, Rn), q = sub(supply, used), q2 = mul(q, ex('0.8')), dm = div(q2, Rm);
  sm = clamp(sub(sm, dm), ZERO, ONE);
  const eU = En * (Rn.v + eR * U) + sn.v * eR + 1, eQ = 1 + eU, eQ2 = eQ * 0.8 + 1;
  Em += Math.ceil((eQ2 + dm.v * eR) / RmLow + 1);
  judge(`转存：上级 s_n=${sn.v.toFixed(4)}（E_n=${En}），盈余量 q=${q.v.toFixed(6)}，下级 s_m=${sm.v.toFixed(6)}`, sm.actual, sm.err, Em, `（第七版：${1 + 3 + 1 + 1 + 1 + 3 + 1}）`);
}

// ═══ 四、R21-3.3 免疫记录 ═══
say('四、免疫记录（R21-3.3）');
for (const tick of [360, 60]) {
  const D = deltaOf(tick); const n = 1440 * 4 / tick;
  const g = mul(ex('0.22'), ex('0.7'), 0);
  let v = ZERO, E = 0;
  for (let i = 0; i < n; i++) { v = clamp(add(v, mulDelta(g, D)), ZERO, ONE); E += 1 + Math.ceil(g.v * D.d); }
  const rt = rateTimes(ex('-0.004'), 100 * 1440);
  v = clamp(add(v, rt), ZERO, ONE); E += 1;
  judge(`患病 ${n} 拍（每拍 ${tick} 分钟）后病愈 100 天再落值：value=${v.v.toFixed(6)}；界 = n ×（1 + ⌈g × δ⌉）+ j，g=${g.v.toFixed(3)}、δ=${D.d}；第七版 2n + j = ${2 * n + 1}`, v.actual, v.err, E);
}

// ═══ 五、储备已空：R = 0 或 R 不超过 e_R（R21-4.1；卷二 §3.3 第 6 条"L 不为正的这次写入没有界"）═══
// 判据与第三组同一口径：e_R = D0 × eRX + 1（储备式是数值常数时 eRX 为 0），R⁻ = R − e_R × 10⁻⁸；R 的定点值 ≤ e_R 个单位（R⁻ 不为正）即走"储备已空"分支。
// 落值照卷二十一第九版 R21-4.1："与 D0 = 0 走同一分支"——这项需要对该主体不适用：不建实例、不求值、不报错；
// 以 R 为除数的式子（推进 drv、摄入、溢出与转存）都不求值，摄入也不建实例。
// 断言：走分支；除法调用 0 次；全程没有实例（每拍推进与摄入后都查）；条目没有写入，误差 0 ≤ 界 0。
function emptyReserveCase(name, cfg, ticks, intakeAt) {
  const D0 = mul(ex(cfg.base0), ex(cfg.ratio), 0);
  const R = mul(D0, ex(cfg.days));
  const eR = 1, Rlow = R.v - eR * U;
  const branch = R.fx <= BigInt(eR) && !(Rlow > 0);
  const before = divCalls;
  let inst = null, noInstance = true;                               // inst：该条目的严重度实例；储备已空时不建
  for (let i = 1; i <= ticks; i++) {
    if (!branch) { inst = inst ?? ZERO; break; }                    // 没命中分支不属本组，记为建了实例（断言会失败）
    // 储备已空：推进不求值、不建实例
    if (i === intakeAt) { /* 储备已空：摄入不求值、不建实例 */ }
    if (inst !== null) noInstance = false;
  }
  if (inst !== null) noInstance = false;
  const used = divCalls - before;
  const actual = inst === null ? 0 : inst.actual, bound = 0;
  const ok = branch && used === 0 && noInstance && actual <= bound;
  if (!ok) fails++;
  say(`${ok ? 'PASS' : 'FAIL'} ${name}：R=${R.v.toExponential(3)}（定点 ${R.fx}），R⁻=${Rlow.toExponential(3)}；走储备已空分支=${branch}，除法调用 ${used} 次，${ticks} 拍（第 ${intakeAt} 拍摄入）后实例=${inst === null ? '无' : '有'}，实际误差 ${actual}（界 ${bound}）`);
}
say('五、储备已空（R 为 0 或不超过 e_R × 10⁻⁸ 时与 D0 = 0 同一分支：不建实例、不求值、不做除法）');
emptyReserveCase('R = 0（储备天数 0，如脂肪量为 0 的主体）', { base0: '0.0137', baseMod: '0.0178', ratio: '0.0001', days: '0' }, 80, 60);
emptyReserveCase('R 恰等于 e_R × 10⁻⁸（D0 = 10⁻⁸，储备 1 天）', { base0: '0.0001', baseMod: '0.0002', ratio: '0.0001', days: '1' }, 80, 60);
emptyReserveCase('R 的参考值为正但不超过 e_R（定点截成 0）', { base0: '0.0137', baseMod: '0.0178', ratio: '0.0001', days: '0.0001' }, 80, 60);
// 刚过分支界：R⁻ 为正，照常走除法，界照第三组的确定式成立
deficitRun('刚过分支界：R = 2 × 10⁻⁸，R⁻ = 10⁻⁸', { base0: '0.0001', baseMod: '0.0002', ratio: '0.0001', days: '2', mass: '0.00000003', nutr: '1' }, 360, 8, 4, 6);

// ═══ 六、体重低于最小体重（R21-6.2 分母 D = refDose × massKg^massExp 的下界）═══
// 最小体重：卷二十一第九版规则表键 rules.health.minDoseMassKg = 0.02。
// 规则：体重低于最小体重时按最小体重算。断言：按最小体重算出的写入与体重恰为最小体重时逐位相同；实际误差 ≤ 界；逐步递推的 err ≤ 界。
const MIN_DOSE_MASS_KG = '0.02';                                    // 卷二十一第九版 rules.health.minDoseMassKg = 0.02
const doseKg = kgStr => (dec(kgStr, S8) < dec(MIN_DOSE_MASS_KG, S8) ? MIN_DOSE_MASS_KG : kgStr);
say(`六、体重低于最小体重（R21-6.2；最小体重 ${MIN_DOSE_MASS_KG} 公斤（rules.health.minDoseMassKg））`);
{
  const atMin = intake(null, 0, '0.00674', '40', '1', MIN_DOSE_MASS_KG);
  judge(`体重恰为最小体重 ${MIN_DOSE_MASS_KG} 公斤 整包 6.74 克：Δconc=${atMin.dconc.toFixed(4)}`, atMin.value.actual, atMin.value.err, atMin.m);
  for (const kg of ['0.0001', '0.001', '0.005', '0.01', '0.0199']) {
    const r = intake(null, 0, '0.00674', '40', '1', doseKg(kg));
    if (r.value.fx !== atMin.value.fx || r.value.ref !== atMin.value.ref) { fails++; say(`FAIL 体重 ${kg} 公斤没有按最小体重算`); }
    judge(`体重 ${kg} 公斤（低于最小体重）整包 6.74 克：按 ${doseKg(kg)} 公斤算，Δconc=${r.dconc.toFixed(4)}`, r.value.actual, r.value.err, r.m);
  }
  // 扫一遍：低于最小体重的体重 × 给药量 × 敏感度 × 间隔（单次与二次给药）
  let n = 0, bad = 0, notMin = 0;
  let seed = 20261114n; const rnd = k => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return Number((seed >> 11n) % BigInt(k)); };
  for (let i = 0; i < 400; i++) {
    const kg = ((1 + rnd(9999)) / 1e4 * Number(MIN_DOSE_MASS_KG)).toFixed(8);
    if (doseKg(kg) !== MIN_DOSE_MASS_KG) notMin++;
    const mass = (0.0002 + rnd(600000) / 1e7).toFixed(8), sens = (0.2 + rnd(30000) / 1e4).toFixed(4);
    const f = intake(null, 0, mass, '40', sens, doseKg(kg));
    const s2 = intake({ value: f.value, at: 0 }, 1 + rnd(4000), (0.0002 + rnd(600000) / 1e7).toFixed(8), '40', sens, doseKg(kg));
    for (const [val, bound] of [[f.value, f.m], [s2.value, f.m + s2.m]]) { n++; if (val.actual > bound || val.err > bound + 1e-6) bad++; }
  }
  if (bad || notMin) fails++;
  say(`${bad || notMin ? 'FAIL' : 'PASS'} 扫描 400 组低于最小体重的给药（单次与二次共 ${n} 个写入）：超界 ${bad} 个，没按最小体重算的 ${notMin} 个`);
  // 对照（只列出、不断言）：不设最小体重、直接按很小的体重算时的界
  for (const kg of ['0.0001', '0.01']) {
    try { const raw = intake(null, 0, '0.00674', '40', '1', kg); say(`   对照：直接按 ${kg} 公斤算，界=${raw.m}，Δconc=${raw.dconc.toExponential(3)}（按最小体重算的界=${atMin.m}）`); }
    catch (e) { say(`   对照：直接按 ${kg} 公斤算：${e.message}`); }
  }
}

ratios.sort((a, b) => a - b);
say(`合计：失败项 ${fails}；点名各例 界÷实际 最小 ${ratios[0].toFixed(2)}、最大 ${ratios.at(-1).toFixed(2)}`);
process.exitCode = fails ? 1 : 0;
