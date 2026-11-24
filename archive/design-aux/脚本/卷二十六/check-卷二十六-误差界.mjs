// 卷二十六 第四版：R26-4.4 心理量推进的扩展标度误差界验算（卷二 §3.3"存量与余数结转"第 6 条，【十七·补】⑪ 的 m 口径）。
// 做法（仿 check-卷二十一-误差界.mjs）：
//   定点一侧照卷二 §3.3 实现（10⁸ 标度 BigInt；fixedMultiply8、整除、10⁸ 曲线插值、fixedExp，全部向零截断）；
//   参考一侧用 50 位十进制定点（BigInt）算同一条式子，不截到 10⁻⁸；离散判定（when、钳位落点）取定点一侧的分支；
//   每个量带三样：定点值 fx、参考值 ref、逐步递推的误差界 err（以 10⁻⁸ 为单位，照卷二同条的递推）；
//   另把卷二十六 R26-4.4"存法与误差界"一段的确定式逐项算一遍（下称"界"：e_x、e_A、e_1…e_m、e_S、追随型 e_c/推进/G、累积型推进、E_n）。
// 断言：每拍 实际误差 ≤ 界 E_n；逐步递推 ≤ 界（确定式没有漏项）；每条想法 递推 e_m ≤ 确定式 e_m；
//       追随型 E_n ≤ max(E_0, M ÷ (c − e_c × 10⁻⁸))（不随拍数增长）。列出 界 ÷ 实际。
// 只做算术，不读写项目文件。用法：node F:/dnd/docs/统一底层设计/脚本/卷二十六/check-卷二十六-误差界.mjs
// 本卷未写明、脚本自行取定的两点（不影响确定式的形状）：立场读数的归一分母取 100、7、3、1 几种（R 的整除）；
//   已过时长按整数分钟、durationDays × 1440 作分母一次整除。
const S8 = 10n ** 8n, P = 10n ** 50n, UP50 = P / S8;

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

// ── 定点一侧：卷二 §3.3"定点指数与整数次幂"，fixedExp 用 §1.10 的 exp 表 ──
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

// ── 带误差界的量 ──
const U = 1e-8;
const num = ref => Number(ref * 10n ** 17n / P) / 1e17;
function dec(s, scale) {
  s = String(s);
  if (/e/i.test(s)) throw new Error('数字须写成十进制字串：' + s);
  const neg = s.startsWith('-'); const [i, f = ''] = s.replace('-', '').split('.');
  const digits = String(scale).length - 1;
  const v = BigInt(i) * scale + BigInt((f + '0'.repeat(digits)).slice(0, digits) || '0');
  return neg ? -v : v;
}
class T {
  constructor(fx, ref, err) { this.fx = fx; this.ref = ref; this.err = err; }
  get v() { return num(this.ref); }
  get fv() { return Number(this.fx) / 1e8; }
  get actual() { return Number(absB(this.fx * UP50 - this.ref) * 10n ** 6n / UP50) / 1e6; }
}
const ex = s => new T(dec(s, S8), dec(s, P), 0);
const add = (a, b) => new T(a.fx + b.fx, a.ref + b.ref, a.err + b.err);
const sub = (a, b) => new T(a.fx - b.fx, a.ref - b.ref, a.err + b.err);
const neg = a => new T(-a.fx, -a.ref, a.err);
// 乘：err = e_a × B(b) + B(a) × e_b + 源误差（两个因数都由 10⁴ 升上来时源误差为 0）
const mul = (a, b, src = 1, Bb = null) => new T(a.fx * b.fx / S8, a.ref * b.ref / P,
  a.err * (Bb ?? (Math.abs(b.v) + b.err * U)) + Math.abs(a.v) * b.err + src);
// 除（10⁸ 标度只有 a × SCALE² ÷ b 一种写法）：err = (e_a + |a÷b| × e_b) ÷ L(b) + 1
function div(a, b) {
  const low = Math.abs(b.v) - b.err * U; if (!(low > 0)) throw new Error('除数下界不为正');
  const ref = a.ref * P / b.ref;
  return new T(a.fx * S8 / b.fx, ref, (a.err + Math.abs(num(ref)) * b.err) / low + 1);
}
// fixedExp：err = (5 + e_x) × y⁺ + 4
function fexp(x) { const ref = hpExp(x.ref); return new T(fixedExp(x.fx), ref, (5 + x.err) * num(ref) * (1 + 2 * x.err * U) + 4); }
const clamp = (a, lo, hi) => new T(a.fx < lo.fx ? lo.fx : a.fx > hi.fx ? hi.fx : a.fx, a.ref < lo.ref ? lo.ref : a.ref > hi.ref ? hi.ref : a.ref, a.err);
const ZERO = ex('0'), ONE = ex('1');
// Δ = tickMinutes ÷ 1440 的 10⁸ 表示；写不尽时 δ = 1
const deltaOf = tick => { const exact = (BigInt(tick) * S8) % 1440n === 0n;
  return { t: new T(BigInt(tick) * S8 / 1440n, BigInt(tick) * P / 1440n, exact ? 0 : 1), d: exact ? 0 : 1, v: tick / 1440 }; };

// 曲线 10⁸ 读法：两端点 fixedUnits8，段内插值一次整除，向零截断；递推 err = e_x × s + 1
function interp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  const L = pts[pts.length - 1]; if (x >= L[0]) return L[1];
  for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; if (x < x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
}
const slope = c => { let s = 0; for (let i = 0; i < c.length - 1; i++) s = Math.max(s, Math.abs((+c[i + 1][1] - +c[i][1]) / (+c[i + 1][0] - +c[i][0]))); return s; };
function curveT(c, x) {
  const f = c.map(([a, b]) => [dec(a, S8), dec(b, S8)]), r = c.map(([a, b]) => [dec(a, P), dec(b, P)]);
  return new T(interp(f, x.fx), interp(r, x.ref), x.err * slope(c) + 1);
}

// ═══ R26-4.2 推力：从左到右 (A + pref) × P × V × R × D × K，每次 fixedMultiply8；同时算 R26-4.4 的确定式 e_m ═══
// th：{kind, curve | value, prefWeight?, persScale?, valueScale?, stanceWeight?, durationDays?, decay?}
// c ：{x: T, eX: 确定式里的 e_x, conduct: [[评价, 价值]…], pref, pers, values, stance, stanceMax, elapsedMin, K, scaleMin, scaleMax}
function push(th, c) {
  let A, eA, Ap;
  if (th.curve) {
    let x, eX;
    if (th.kind === 'conduct') { x = ZERO; for (const [e, v] of c.conduct) x = add(x, mul(ex(e), ex(v), 0)); eX = 0; }
    else { x = c.x; eX = c.eX; }
    A = curveT(th.curve, x); eA = eX * slope(th.curve) + 1; Ap = Math.max(...th.curve.map(p => Math.abs(+p[1])));
  } else { A = ex(th.value); eA = 0; Ap = Math.abs(+th.value); }
  if (th.prefWeight) { if (c.pref != null) A = add(A, mul(ex(th.prefWeight), ex(c.pref), 0)); Ap += Math.abs(+th.prefWeight); }
  let cur = A, e = eA, Bp = Ap;
  if (th.persScale) {
    let Pv = ONE; for (const [k, s] of Object.entries(th.persScale)) Pv = add(Pv, mul(ex(s), ex(c.pers[k]), 0));
    const smin = c.scaleMin ?? '0', smax = c.scaleMax ?? '2';
    Pv = clamp(Pv, ex(smin), ex(smax)); const Pp = Math.max(Math.abs(+smin), Math.abs(+smax));
    cur = mul(cur, Pv); e = e * Pp + 1; Bp *= Pp;
  }
  if (th.valueScale) {
    let Vv = ZERO, Vp = 0; for (const [k, s] of Object.entries(th.valueScale)) { Vv = add(Vv, mul(ex(s), ex(c.values[k]), 0)); Vp += Math.abs(+s); }
    cur = mul(cur, Vv); e = e * Vp + 1; Bp *= Vp;
  }
  if (th.stanceWeight) {
    const st = div(ex(c.stance), ex(c.stanceMax)), Rv = mul(ex(th.stanceWeight), st), Rp = Math.abs(+th.stanceWeight);
    cur = mul(cur, Rv, 1, Rp); e = e * Rp + Bp * (Rp + 1) + 1; Bp *= Rp;   // B(R) 按域取 |stanceWeight|：归一后立场的定点值向零截断，不出 [-1,1]
  }
  if (th.decay) {
    const durMin = mul(ex(th.durationDays), ex('1440'), 0), xd = div(ex(String(c.elapsedMin)), durMin), Dv = curveT(th.decay, xd);
    cur = mul(cur, Dv, 1, 1); e = e + Bp * (slope(th.decay) + 1) + 1;
  }
  cur = mul(cur, ex(c.K)); e = e * +c.K + 1;
  return { m: cur, eF: e };
}

// ═══ R26-4.4 推进 ═══
let fails = 0; const ratios = [];
const say = s => console.log(s);
function mkGauge(o) {   // {name, mode: track|integrate, tick, rate?, base, init?}
  const D = deltaOf(o.tick); const g = { ...o, D, sev: null, Ef: 0, Er: 0, E0: 0, maxM: 0, worst: 0, ticks: 0, minRatio: Infinity };
  if (o.mode === 'track') {
    const arg = mul(ex(o.rate), D.t, 1, D.v);
    g.c = sub(ONE, fexp(neg(arg)));
    g.ecF = +o.rate * D.d + 10;                                   // 确定式 e_c
    g.G = 1 - g.c.v + g.ecF * U; g.Gr = 1 - g.c.v + g.c.err * U;
    g.den = g.c.v - g.ecF * U; if (!(g.den > 0)) g.G = g.Gr = 1;  // c − e_c × 10⁻⁸ 不为正：G 取 1，按累积型累计
  }
  if (o.init != null) g.sev = ex(o.init);
  return g;
}
function check(g, label) {
  const a = g.sev.actual; g.ticks++;
  if (a > g.Ef + 1e-9 || g.Er > g.Ef + 1e-6) { fails++; say(`FAIL ${g.name}${label ? ' ' + label : ''}：实际=${a} 递推=${g.Er} 界=${g.Ef}`); }
  if (g.Ef > 0) g.worst = Math.max(g.worst, a / g.Ef);
  if (a > 0.5) g.minRatio = Math.min(g.minRatio, g.Ef / a);
}
function landClamp(g, ns) {
  g.sev = new T(ns.fx, ns.ref, 0);
  if ((ns.fx === 0n && ns.ref === 0n) || (ns.fx === S8 && ns.ref === P)) { g.Ef = 0; g.Er = 0; }   // 钳位后两侧都落在界上：清零重计
}
let pushChecks = 0, pushFails = 0;
function settle(g, pushes) {
  let S = ZERO, eS = 0;
  for (const p of pushes) {
    pushChecks++; if (p.m.err > p.eF + 1e-6) { pushFails++; fails++; say(`FAIL 想法递推 ${p.m.err} > 确定式 ${p.eF}`); }
    S = add(S, p.m); eS += p.eF;
  }
  let mF, mR, ns;
  if (g.mode === 'track') {
    const target = clamp(add(ex(g.base), S), ZERO, ONE);
    if (g.sev === null) { g.sev = new T(target.fx, target.ref, 0); g.Ef = g.E0 = Math.ceil(eS); g.Er = Math.ceil(S.err); check(g, '建实例'); return; }
    const step = mul(sub(target, new T(g.sev.fx, g.sev.ref, 0)), g.c, 1, 1);
    mF = Math.ceil(eS + g.ecF + 1); mR = Math.ceil(step.err);
    ns = clamp(add(new T(g.sev.fx, g.sev.ref, 0), step), ZERO, ONE);
    g.Ef = g.G * g.Ef + mF; g.Er = g.Gr * g.Er + mR;
  } else {
    const IS = add(ex(g.base), S), inc = mul(IS, g.D.t, 1, g.D.v);
    mF = Math.ceil(eS * (g.D.v + U) + (Math.abs(IS.v) + eS * U) * g.D.d + 1); mR = Math.ceil(inc.err);
    ns = clamp(add(new T(g.sev.fx, g.sev.ref, 0), inc), ZERO, ONE);
    g.Ef += mF; g.Er += mR;
  }
  g.maxM = Math.max(g.maxM, mF); g.lastM = mF;
  landClamp(g, ns); check(g);
}
function effect(g, delta) {   // 效果族写入：-magnitude 一类式子，各数 10⁴，误差量 0
  landClamp(g, clamp(add(g.sev, ex(delta)), ZERO, ONE)); check(g, '效果族写入');
}
function steadyOK(g) {
  if (g.mode !== 'track' || !(g.den > 0)) return true;
  const cap = Math.max(g.E0, g.maxM / g.den);
  return g.Ef <= cap + 1e-6;
}
function report(g, extra = '') {
  const steady = steadyOK(g); if (!steady) fails++;
  const cap = g.mode === 'track' && g.den > 0 ? Math.max(g.E0, g.maxM / g.den) : null;
  if (Number.isFinite(g.minRatio)) ratios.push(g.minRatio);
  say(`${steady ? 'PASS' : 'FAIL'} ${g.name}：${g.ticks} 次写入，末值 ${g.sev.fv.toFixed(8)}，末界 E=${g.Ef.toFixed(2)}，末实际=${g.sev.actual.toFixed(2)}，`
    + `全程 实际÷界 最大 ${g.worst.toFixed(3)}，界÷实际 最小 ${Number.isFinite(g.minRatio) ? g.minRatio.toFixed(2) : '实际都不足半个单位'}`
    + (g.mode === 'track' ? `；c=${g.c.fv.toFixed(8)} e_c=${g.ecF} 每拍 m 最大 ${g.maxM}` + (cap !== null ? `，稳态上限 max(E_0, M÷(c−e_c×10⁻⁸))=${cap.toFixed(2)}` : '，c − e_c×10⁻⁸ ≤ 0，退回 G=1') : `；每拍 m 最大 ${g.maxM}`)
    + (extra ? '；' + extra : ''));
}

// ═══ 一、卷内例子 ═══
say('一、卷内例子（§4.3.5、§4.4.5、§4.8.5）');
const kinDied = { kind: 'event', value: '-0.20', stanceWeight: '1', persScale: { stab: '-0.5' }, durationDays: '30', decay: [['0', '1'], ['1', '0']] };
{
  const p = push(kinDied, { pers: { stab: '0.60' }, stance: '80', stanceMax: '100', elapsedMin: 21600, K: '1' });
  say(`   亲属去世：m=${p.m.fv.toFixed(8)}（卷内 -0.0560），确定式 e_m=${p.eF.toFixed(2)}，递推 ${p.m.err.toFixed(2)}，实际 ${p.m.actual.toFixed(2)}`);
  const g = mkGauge({ name: '心情 西陲铁匠（追随型，360 分钟，Δ 写得尽）', mode: 'track', tick: 360, rate: '0.35', base: '0.56', init: '0.60' });
  settle(g, [p]);
  say(`   一拍后心情 ${g.sev.fv.toFixed(8)}（卷内 0.5920），c=${g.c.fv.toFixed(8)}（卷内 0.0837），本拍 m=${g.lastM}`);
  for (let i = 1; i < 120; i++) { const el = 21600 + i * 360; settle(g, el < 43200 ? [push(kinDied, { pers: { stab: '0.60' }, stance: '80', stanceMax: '100', elapsedMin: el, K: '1' })] : []); }
  report(g, '续推到想法过期再推满 30 日');
}
{
  const ally = { kind: 'event', value: '-0.08', stanceWeight: '1', persScale: { bold: '-0.5' } };
  const ctx = { pers: { bold: '-0.20' }, stance: '60', stanceMax: '100', K: '1' };
  const p = push(ally, ctx);
  const g = mkGauge({ name: '士气 西陲民兵（追随型，5 分钟，Δ 写不尽）', mode: 'track', tick: 5, rate: '288', base: '0.62', init: '0.62' });
  settle(g, [p]);
  say(`   同伴倒下：m=${p.m.fv.toFixed(8)}（卷内 -0.0528），目标 0.5672；一拍后士气 ${g.sev.fv.toFixed(8)}，c=${g.c.fv.toFixed(8)}（卷内 0.6321）`);
  for (let i = 1; i < 288; i++) settle(g, i < 144 ? [push(ally, ctx)] : []);
  report(g, '想法半日过期，共推一日');
}
{
  const g = mkGauge({ name: '社交需求 西陲铁匠（累积型，360 分钟）', mode: 'integrate', tick: 360, base: '0.0968', init: '0.2' });
  for (let i = 1; i <= 160; i++) { settle(g, []); if (i % 40 === 0) effect(g, '-0.30'); }
  report(g, '每十日一次酒肆 -0.30');
}

// ═══ 二、多心理量联动：四种触发、互读、两种拍长、效果族、钳到 0 与 1 ═══
say('二、联动夹具（社交 累积 360；心情 追随 360；压力 累积 360；士气 追随 5；三日逐分钟调度，同拍快照）');
{
  const social = mkGauge({ name: '联动·社交', mode: 'integrate', tick: 360, base: '0.0968', init: '0.45' });
  const mood = mkGauge({ name: '联动·心情', mode: 'track', tick: 360, rate: '0.35', base: '0.56' });
  const stress = mkGauge({ name: '联动·压力', mode: 'integrate', tick: 360, base: '-0.039', init: '0.05' });   // 约 1.3 日落到 0 钳住，1.5 日两次 +0.6 钳到 1
  const morale = mkGauge({ name: '联动·士气', mode: 'track', tick: 5, rate: '288', base: '0.52' });
  const gs = [social, mood, stress, morale];
  const hunger = t => { const ref = dec('0.3', P) + BigInt(t) * P / 43200n; return { x: new T(ref / UP50 + 13n, ref, 20), eX: 20 }; };   // 身体类容器读数，自带 E=20
  const injury = { x: new T(dec('0.35', S8) - 3n, dec('0.35', P), 5), eX: 5 };
  const th = {
    hungry: { kind: 'status', curve: [['0', '0'], ['0.5', '-0.05'], ['1', '-0.25']] },
    lonely: { kind: 'state', curve: [['0.5', '-0.03'], ['1', '-0.15']] },
    meal: { kind: 'event', value: '0.02', prefWeight: '0.08' },
    exec: { kind: 'event', value: '0.10', valueScale: { law: '1', mercy: '-1' } },
    conduct: { kind: 'conduct', curve: [['-1', '-0.12'], ['0', '0'], ['1', '0.06']], durationDays: '10', decay: [['0', '1'], ['0.4', '0.7'], ['1', '0']] },
    moodToMorale: { kind: 'state', curve: [['0', '-0.15'], ['0.5', '0'], ['1', '0.10']] },
    wounded: { kind: 'status', curve: [['0', '0'], ['1', '-0.35']] },
  };
  const base = { pers: { stab: '0.60', bold: '-0.20' }, values: { law: '0.27', mercy: '0.12' }, pref: '0.35' };
  for (let t = 0; t <= 4320; t += 5) {
    const snap = new Map(gs.map(g => [g, g.sev ? { x: new T(g.sev.fx, g.sev.ref, g.Er), eX: g.Ef } : null]));
    const due = gs.filter(g => t % g.tick === 0);
    const plan = [];
    for (const g of due) {
      const ps = [];
      if (g === mood) {
        const h = hunger(t); ps.push(push(th.hungry, { ...base, ...h, K: '1' }));
        const s = snap.get(social); if (s && s.x.fx >= dec('0.5', S8)) ps.push(push(th.lonely, { ...base, ...s, K: '1' }));   // when 按定点一侧判
        ps.push(push(kinDied, { ...base, stance: '80', stanceMax: '100', elapsedMin: 21600 + t, K: '1' }));
        ps.push(push(th.meal, { ...base, K: '1' }));
        if (t >= 1000) ps.push(push(th.exec, { ...base, K: '1' }));
        ps.push(push(th.conduct, { ...base, conduct: [['0.5', '0.27'], ['-0.3', '0.12']], elapsedMin: t + 100, K: '1' }));
        ps.push(push(th.conduct, { ...base, conduct: [['0.2', '0.27'], ['0.1', '0.12']], elapsedMin: t + 7, K: '0.6' }));
      }
      if (g === morale) {
        const m = snap.get(mood); if (m) ps.push(push(th.moodToMorale, { ...base, ...m, K: '1' }));
        ps.push(push(th.wounded, { ...base, ...injury, K: '1' }));
      }
      plan.push([g, ps]);
    }
    for (const [g, ps] of plan) settle(g, ps);
    if (t === 1440) effect(social, '-0.30');
    if (t === 2160) { effect(stress, '0.6'); effect(stress, '0.6'); }
    if (t === 3600) effect(stress, '-0.25');
  }
  for (const g of gs) report(g);
}

// ═══ 三、极端输入 ═══
say('三、极端输入');
{
  const runTrack = (name, tick, rate, base, n, pushes) => { const g = mkGauge({ name, mode: 'track', tick, rate, base }); for (let i = 0; i < n; i++) settle(g, pushes(i)); report(g); };
  const runInt = (name, tick, base, init, n, pushes = () => []) => { const g = mkGauge({ name, mode: 'integrate', tick, base, init }); for (let i = 0; i < n; i++) settle(g, pushes(i)); report(g); };
  runTrack('追随型 rate×Δ = 40（fixedExp 取值域下端，c≈1）', 1440, '40', '0.3', 50, () => []);
  runTrack('追随型 c 极小（1 分钟、rate 0.0001）', 1, '0.0001', '0.9', 2000, () => []);
  runTrack('追随型 7 分钟、rate 500（Δ 写不尽、e_c 大）', 7, '500', '0.4', 400,
    i => [push({ kind: 'state', curve: [['-40', '0.45'], ['0', '0'], ['60', '-0.45']], persScale: { o: '0.3' } },
      { x: new T(dec(String(-40 + (i % 100)), S8) + 7n, dec(String(-40 + (i % 100)), P), 8), eX: 8, pers: { o: '0.9' }, K: '1' })]);
  runTrack('追随型 读入误差极大（e_x = 10⁶）', 360, '0.35', '0.5', 300,
    i => [push({ kind: 'state', curve: [['0', '-0.5'], ['1', '0.5']] }, { x: new T(dec('0.4', S8) + BigInt((i * 7919) % 1000000), dec('0.4', P), 1000001), eX: 1000001, K: '1' })]);
  runTrack('追随型 5000 拍长跑（E 不随拍数增长）', 60, '2.5', '0.5', 5000,
    i => [push({ kind: 'status', curve: [['0', '0'], ['0.3', '-0.2'], ['1', '-0.4']], persScale: { a: '0.7', b: '-0.4' }, valueScale: { v: '1.3' } },
      { x: new T(dec('0.' + String(1000 + (i * 37) % 9000), S8) + 40n, dec('0.' + String(1000 + (i * 37) % 9000), P), 41), eX: 41, pers: { a: '0.33', b: '-0.71' }, values: { v: '0.57' }, K: '1' })]);
  runInt('累积型 inflow = 4（每拍 1 分钟，冲到 1 后钳住）', 1, '4', '0', 400);
  runInt('累积型 inflow = -4（钳到 0）', 1, '-4', '1', 400);
  runInt('累积型 inflow = 0.0001、1 分钟一拍、5000 拍（小增量、Δ 写不尽）', 1, '0.0001', '0', 5000);
  runInt('累积型 推力和很大且带误差（四条想法，7 分钟）', 7, '-0.2', '0.5', 600,
    i => [0, 1, 2, 3].map(j => push({ kind: 'state', curve: [['0', '-0.9'], ['0.5', '0.4'], ['1', '0.9']], persScale: { q: '1' }, stanceWeight: '-2' },
      { x: new T(dec('0.' + String(1000 + ((i + j) * 61) % 9000), S8) - 300n, dec('0.' + String(1000 + ((i + j) * 61) % 9000), P), 301), eX: 301, pers: { q: '0.95' }, stance: String(-3 + (i % 7)), stanceMax: '7', K: ['1', '0.6', '0.35', '0.2'][j] })));
}

// ═══ 四、随机扫描 ═══
say('四、随机扫描');
{
  let seed = 20261113n;
  const rnd = k => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return Number((seed >> 11n) % BigInt(k)); };
  const rf = (lo, hi, dp = 4) => { const v = lo + (hi - lo) * rnd(1000000) / 1000000; const q = 10 ** dp; return (Math.floor(v * q) / q).toFixed(dp); };
  const pick = a => a[rnd(a.length)];
  const curve = (lo, hi, ylo, yhi) => { const n = 2 + rnd(3); const xs = [...new Set(Array.from({ length: n }, () => rf(lo, hi)))].map(Number).sort((a, b) => a - b);
    if (xs.length < 2) xs.push(xs[0] + 1); return xs.map(x => [x.toFixed(4), rf(ylo, yhi)]); };
  function randThought() {
    const kind = pick(['state', 'status', 'event', 'conduct']); const th = { kind };
    if (kind === 'event') th.value = rf(-0.5, 0.5);
    else th.curve = kind === 'status' ? curve(0, 1, -0.5, 0.5) : kind === 'conduct' ? curve(-1, 1, -0.5, 0.5) : curve(-50, 50, -0.5, 0.5);
    if (rnd(10) < 3) th.prefWeight = rf(-0.2, 0.2);
    if (rnd(10) < 6) { th.persScale = {}; for (let j = 0; j <= rnd(3); j++) th.persScale['p' + j] = rf(-1, 1); }
    if (rnd(10) < 4) { th.valueScale = {}; for (let j = 0; j <= rnd(3); j++) th.valueScale['v' + j] = rf(-1.5, 1.5); }
    if (rnd(10) < 4) th.stanceWeight = rf(-2, 2);
    if (kind === 'event' || kind === 'conduct') { th.durationDays = rf(0.5, 60); if (rnd(2)) th.decay = curve(0, 1, 0, 1).map(([x, y], i, a) => [i === 0 ? '0.0000' : i === a.length - 1 ? '1.0000' : x, y]); }
    return th;
  }
  function randCtx(th) {
    const c = { pers: {}, values: {}, K: pick(['1', '0.6', '0.35', '0.2', '0.1']), scaleMin: '0', scaleMax: '2' };
    for (let j = 0; j < 3; j++) { c.pers['p' + j] = rf(-1, 1, 2); c.values['v' + j] = rf(-1, 1, 2); }
    if (rnd(10) < 8) c.pref = rf(-1, 1, 2);
    c.stanceMax = pick(['100', '7', '3', '1']); c.stance = rf(-Number(c.stanceMax), Number(c.stanceMax));
    if (th.durationDays) c.elapsedMin = rnd(Math.max(1, Math.floor(+th.durationDays * 1440)));
    if (th.kind === 'conduct') c.conduct = Array.from({ length: 1 + rnd(3) }, () => [rf(-1, 1), rf(-1, 1, 2)]);
    if (th.kind === 'state' || th.kind === 'status') {
      const [lo, hi] = th.kind === 'status' ? [0, 1] : [-60, 60];
      const E = rnd(10) === 0 ? rnd(100000) : rnd(3000);
      const ref = dec(rf(lo, hi, 12), P), off = BigInt(rnd(2 * E + 1) - E);
      c.x = new T(ref / UP50 + off, ref, E + 1); c.eX = E + 1;
    }
    return c;
  }
  let configs = 0, writes = 0, bad0 = fails, steadyBad = 0, minR = Infinity, worst = 0; const rs = [];
  for (let k = 0; k < 1500; k++) {
    const mode = pick(['track', 'integrate']); const tick = pick([1, 5, 7, 60, 360, 1440, 1 + rnd(1440)]);
    const o = { name: `随机#${k}`, mode, tick };
    if (mode === 'track') { const maxRate = Math.min(40 * 1440 / tick, 3000); o.rate = rf(0.0001, maxRate); o.base = rf(-1, 2); }
    else { o.base = rnd(5) === 0 ? rf(-4, 4) : rf(-0.2, 0.2); o.init = rf(0, 1); }
    const g = mkGauge(o); const ths = Array.from({ length: 1 + rnd(4) }, randThought);
    for (let i = 0; i < 60; i++) {
      settle(g, ths.map(th => push(th, randCtx(th))));
      if (rnd(20) === 0) effect(g, rf(-0.5, 0.5));
    }
    configs++; writes += g.ticks;
    if (!steadyOK(g)) { steadyBad++; fails++; }
    worst = Math.max(worst, g.worst);
    if (Number.isFinite(g.minRatio)) { rs.push(g.minRatio); minR = Math.min(minR, g.minRatio); }
  }
  rs.sort((a, b) => a - b); ratios.push(minR);
  const bad = fails - bad0;
  say(`${bad ? 'FAIL' : 'PASS'} 随机 ${configs} 组（追随型与累积型、拍长 1 到 1440 分钟、1 到 4 条随机想法、随机读入误差、5% 拍带效果族写入，每组 60 拍；共 ${writes} 次写入）：`
    + `超界 ${bad} 处（其中稳态上限不成立 ${steadyBad} 组）；全程 实际÷界 最大 ${worst.toFixed(3)}；各组 界÷实际 最小值的分布：最小 ${minR.toFixed(2)}、中位 ${rs[rs.length >> 1].toFixed(2)}、最大 ${rs.at(-1).toFixed(2)}（实际不足半个单位的不计比值）`);
}

ratios.sort((a, b) => a - b);
say(`想法推力：递推 e_m ≤ 确定式 e_m 共检 ${pushChecks} 条，不成立 ${pushFails} 条`);
say(`合计：失败项 ${fails}；点名各项 界÷实际 最小 ${ratios[0].toFixed(2)}、最大 ${ratios.at(-1).toFixed(2)}`);
process.exitCode = fails ? 1 : 0;
