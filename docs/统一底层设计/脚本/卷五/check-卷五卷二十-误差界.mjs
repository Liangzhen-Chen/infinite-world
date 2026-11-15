// 卷五第十版、卷二十第九版：扩展标度误差界的本机验算（卷五 §8 Q17、卷二十 §8 问题 16）。
// 对象：卷五 §4.7 规则 4 与 §4.8 规则 5（persistence 每日一次写入与取用写入）、§4.9 规则 5（development、control），
//       卷二十 §4.7.3 第 1 条（场强度锚点 {value, at}：闭式读数、重设锚点的一次写入、蔓延拆分）。
// 做法：仿 check-卷二十一-误差界.mjs。定点一侧照卷二 §3.3 实现（10⁸ 标度 BigInt；fixedMultiply8、a×SCALE²÷b、10⁸ 曲线插值、fixedPow，
//       全部向零截断）；参考一侧用 50 位十进制定点（BigInt）算同一条式子，不截到 10⁻⁸；参考值沿自己的轨迹递推（离散分支取与定点相同的一支）。
//       每个量带三样东西：定点值 fx、参考值 ref、逐步递推的误差界 err（以 10⁻⁸ 为单位，卷二 §3.3 第 6 条的语法树递推）；
//       另把卷中写出的确定式各算一遍（下称"界"）。
// 断言：实际误差 ≤ 界；逐步递推的单次 m ≤ 卷中确定式的单次 m（确定式没有漏项）；并列出 界 ÷ 实际。
// 只做算术，不读写项目文件。用法：node F:/dnd/docs/统一底层设计/脚本/卷五/check-卷五卷二十-误差界.mjs
const S8 = 10n ** 8n, P = 10n ** 50n, UP50 = P / S8, S12 = S8 * 10n ** 4n;
const U = 1e-8;
const absB = v => (v < 0n ? -v : v);
const num = ref => Number(ref * 10n ** 17n / P) / 1e17;
const fnum = fx => Number(fx) / 1e8;
function dec(s, scale) {
  const neg = s.startsWith('-'); const [i, f = ''] = s.replace('-', '').split('.');
  const digits = String(scale).length - 1;
  const v = BigInt(i) * scale + BigInt((f + '0'.repeat(digits)).slice(0, digits) || '0');
  return neg ? -v : v;
}
class T {
  constructor(fx, ref, err, w4 = false) { this.fx = fx; this.ref = ref; this.err = err; this.w4 = w4; }   // w4：由 10⁴ 标度升上来、写得尽的数
  get v() { return num(this.ref); }
  get B() { return Math.max(Math.abs(num(this.ref)), Math.abs(fnum(this.fx))) + this.err * U; }          // 同时盖住参考值与定点值
  get actual() { return Number(absB(this.fx * UP50 - this.ref) * 10n ** 6n / UP50) / 1e6; }            // 实际误差，单位 10⁻⁸
}
const ex = s => new T(dec(s, S8), dec(s, P), 0, (s.split('.')[1] || '').length <= 4);
const add = (a, b) => new T(a.fx + b.fx, a.ref + b.ref, a.err + b.err, a.w4 && b.w4);
const sub = (a, b) => new T(a.fx - b.fx, a.ref - b.ref, a.err + b.err, a.w4 && b.w4);
// 乘：err = e_a × B(b) + B(a) × e_b + 源误差；两个因数都是 10⁴ 升上来的数时源误差 0（卷二 §3.3 第 6 条）
function mul(a, b, Bb = null) {
  const prod = a.fx * b.fx, both = a.w4 && b.w4;
  return new T(prod / S8, a.ref * b.ref / P, a.err * (Bb ?? b.B) + a.B * b.err + (both ? 0 : 1), both && prod % S12 === 0n);
}
// 除（a × SCALE² ÷ b 向零截断）：err = (e_a + |a÷b| × e_b) ÷ L(b) + 1
function div(a, b) {
  const low = Math.abs(b.v) - b.err * U; if (!(low > 0)) throw new Error('除数下界不为正');
  const ref = a.ref * P / b.ref;
  return new T(a.fx * S8 / b.fx, ref, (a.err + Math.abs(num(ref)) * b.err) / low + 1);
}
const divInt = (a, n) => new T(a.fx / BigInt(n), a.ref / BigInt(n), a.err / n + 1);                    // 除以站点个数：一次整除
const clamp = (a, lo, hi) => new T(a.fx < lo.fx ? lo.fx : a.fx > hi.fx ? hi.fx : a.fx, a.ref < lo.ref ? lo.ref : a.ref > hi.ref ? hi.ref : a.ref, a.err);
const max0 = a => new T(a.fx > 0n ? a.fx : 0n, a.ref > 0n ? a.ref : 0n, a.err);
const leaf = a => new T(a.fx, a.ref, 0);                                                                   // 增量读存储值自身：叶子误差取 0
const ZERO = ex('0'), ONE = ex('1'), HUNDRED = ex('100');
// 10⁸ 曲线读法：分段线性插值一次整除（源误差 1）
function curve(pts, x) {
  const X = pts.map(([a, b]) => [ex(a), ex(b)]);
  if (x.ref <= X[0][0].ref) return new T(X[0][1].fx, X[0][1].ref, 1);
  if (x.ref >= X.at(-1)[0].ref) return new T(X.at(-1)[1].fx, X.at(-1)[1].ref, 1);
  let i = 0; while (x.ref > X[i + 1][0].ref) i++;
  const [x0, y0] = X[i], [x1, y1] = X[i + 1];
  return new T(y0.fx + (y1.fx - y0.fx) * (x.fx - x0.fx) / (x1.fx - x0.fx), y0.ref + (y1.ref - y0.ref) * (x.ref - x0.ref) / (x1.ref - x0.ref), 1);
}
// astroView().perYearToPerStep(年率, 1440)：年率 ÷ 年长日数，写不尽的常数，源误差 1（年长取演示历法 365.2425 日）
const YEAR = ex('365.2425');
const perDay = rateStr => { const r = ex(rateStr); return new T(r.fx * S8 / YEAR.fx, r.ref * P / YEAR.ref, 1); };
// fixedPow：按 n 的二进制位从高到低反复平方与相乘，每次 fixedMultiply8（卷二 §3.3）
// 两个因数都不大于 1（d ∈ [0,1]），放大系数按取值域界取 1：e = e_a + e_b + 源误差
const mulB1 = (a, b) => { const prod = a.fx * b.fx, both = a.w4 && b.w4; return new T(prod / S8, a.ref * b.ref / P, a.err + b.err + (both ? 0 : 1), both && prod % S12 === 0n); };
function powT(d, n) { if (n === 0) return ONE; let r = ONE; for (const bit of n.toString(2)) { r = mulB1(r, r); if (bit === '1') r = mulB1(r, d); } return r; }

let fails = 0, missing = 0; const ratios = [];
const say = s => console.log(s);
function judge(name, actual, bound, extra = '') {
  const ok = actual <= bound; if (!ok) fails++;
  const r = actual > 0 ? bound / actual : Infinity; if (Number.isFinite(r)) ratios.push(r);
  say(`${ok ? 'PASS' : 'FAIL'} ${name}: 界=${fmt(bound)} 实际=${actual.toFixed(2)} 界÷实际=${Number.isFinite(r) ? r.toFixed(2) : '实际为0'}${extra ? ' ' + extra : ''}`);
  return ok;
}
const fmt = x => (x >= 1e7 ? x.toExponential(3) : Number.isInteger(x) ? String(x) : x.toFixed(2));
function mcheck(trk, txt, where) { if (trk > txt + 1e-3) { missing++; fails++; if (missing <= 10) say(`FAIL 漏项 ${where}: 逐步递推 m=${trk.toFixed(4)} > 确定式 m=${txt}`); } }
let seed = 20261113n;
const rnd = k => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return Number((seed >> 11n) % BigInt(k)); };
const r4 = (lo, hi) => (lo + rnd(Math.round((hi - lo) * 1e4) + 1) / 1e4).toFixed(4);
const pick = a => a[rnd(a.length)];
function stats(rs) { rs.sort((x, y) => x - y); return rs.length ? `界÷实际 最小 ${rs[0].toFixed(2)}、中位 ${rs[rs.length >> 1].toFixed(2)}、最大 ${fmt(rs.at(-1))}` : '实际误差全为 0'; }

// ═══ 一、persistence（卷五 §4.7 规则 4；§4.8 规则 5）═══
const GROWTH = [['0', '0'], ['0.3', '0.45'], ['0.7', '1'], ['1', '0.8']];   // biome.growthResponse（示意）
const SPARE = [['0', '0'], ['40', '0.35'], ['100', '0.85']];                 // spareCurve（示意）
const pNew = s => ({ p: ex(s), Et: 0, Ek: 0, negG: 0 });
function resetIfPinned(st, lo, hi) { for (const b of [lo, hi]) if (st.p.fx === b.fx && st.p.ref === b.ref) { st.Et = 0; st.Ek = 0; st.p = new T(st.p.fx, st.p.ref, 0); } }
// 每日一次写入：p + u × (p × (1 − p)) + m ÷ K，u = ((a × g) × f) × c
function pDay(st, c) {
  const a = perDay(c.rate), g = curve(GROWTH, ex(c.season)), f = ex(c.f), cc = ex(c.c);
  const p0 = leaf(st.p);
  const u = mul(mul(mul(a, g), f), cc);
  const rec = mul(u, mul(p0, sub(ONE, p0)));
  const mig = c.mig && c.K !== '0' ? div(ex(c.mig), ex(c.K)) : ZERO;
  const nw = clamp(add(add(p0, rec), mig), ZERO, ONE);
  // 卷五 §4.7 规则 4 的确定式
  const Ba = a.v + U, Bg = g.v + U, eAG = Bg + Ba + 1, eR = eAG * f.v + 1, eU = eR * cc.v + 1, Bu = u.v + eU * U;
  const eps = Math.ceil(eU / 4 + Bu + 2);
  const pr = st.p.v;
  const Gt = Math.max(1, 1 + Bu * (1 - 2 * pr + 2 * st.Et * U));
  // 逐步递推（偏导 1 + u(1 − 2p) 的绝对值上界，正负两侧都计）
  const Buk = u.B, x1 = 1 - 2 * pr - 2 * st.Ek * U, x2 = 1 - 2 * pr + 2 * st.Ek * U;
  const Gk = Math.max(1, Math.abs(1 + Buk * x1), Math.abs(1 + Buk * x2));
  if (Gk > Gt + 1e-12) st.negG++;
  mcheck(nw.err, eps, 'persistence 每日');
  st.Et = Gt * st.Et + eps; st.Ek = Gk * st.Ek + nw.err; st.p = new T(nw.fx, nw.ref, st.Ek);
  resetIfPinned(st, ZERO, ONE);
}
// 取用写入：((damageShare × (1 − s)) × taken) ÷ K；K 为 0 置 0
function pTake(st, c) {
  if (c.K === '0') { st.p = ZERO; st.Et = 0; st.Ek = 0; return; }
  const s = curve(SPARE, ex(c.skill));
  const dmg = div(mul(mul(ex(c.ds), sub(ONE, s)), ex(c.taken)), ex(c.K));
  const nw = clamp(sub(st.p, dmg), ZERO, ONE);
  const eps = Math.ceil((2 * Number(c.taken) + 1) / Number(c.K) + 1);
  mcheck(dmg.err, eps, 'persistence 取用');
  st.Et += eps; st.Ek = nw.err; st.p = nw;
  resetIfPinned(st, ZERO, ONE);
  return { dmg, eps };
}
const pAct = st => st.p.actual;
say('一、persistence（卷五 §4.7 规则 4、§4.8 规则 5；单位 10⁻⁸）');
{
  // 卷内例（§4.7.5 非人类一处沼泽）：猎人把食草兽打到 p 小于一半，停手后自然恢复，再由迁入推满
  const st = pNew('1'); const K = '40000'; let worst = 0, belowHalf = 0;
  for (let d = 1; d <= 90; d++) { pDay(st, { rate: '0.6', season: '0.55', f: '1', c: '2', K }); pTake(st, { ds: '0.6', skill: '30', taken: '600', K }); worst = Math.max(worst, pAct(st) / st.Et); if (pAct(st) > st.Et) fails++; }
  judge(`沼泽 90 日每日取 600 公斤后 p=${st.p.v.toFixed(6)}`, pAct(st), st.Et);
  for (let d = 1; d <= 1825; d++) { if (st.p.v < 0.5) belowHalf++; pDay(st, { rate: '0.6', season: pick(['0.2', '0.55', '0.9']), f: '1', c: '2', K }); worst = Math.max(worst, pAct(st) / st.Et); if (pAct(st) > st.Et) fails++; }
  judge(`停手 5 年自然恢复（其中 p 小于一半的恢复段 ${belowHalf} 日）后 p=${st.p.v.toFixed(6)}`, pAct(st), st.Et, `全程 实际÷界 最大 ${worst.toFixed(3)}`);
  pDay(st, { rate: '0.6', season: '0.55', f: '1', c: '2', K, mig: '30000' });
  const pinned = st.p.fx === S8 && st.p.ref === P;
  if (!pinned || st.Et !== 0) fails++;
  say(`${pinned && st.Et === 0 ? 'PASS' : 'FAIL'} 迁入推满：定点值与参考值都钳在 1 上，累计误差清零（E=${st.Et}）`);
}
{
  // K 很小的取用
  const st = pNew('1'); const r = pTake(st, { ds: '0.9', skill: '0', taken: '0.3', K: '0.5' });
  judge(`K=0.5 公斤取 0.3 公斤（ε取=${r.eps}）p=${st.p.v.toFixed(6)}`, pAct(st), st.Et);
  pTake(st, { ds: '0.9', skill: '0', taken: '0.3', K: '0.5' });
  say(`${st.p.fx === 0n && st.p.ref === 0n && st.Et === 0 ? 'PASS' : 'FAIL'} 再取一笔钳到 0，累计误差清零`); if (!(st.p.fx === 0n && st.Et === 0)) fails++;
  const z = pNew('0.7'); pTake(z, { ds: '0.9', skill: '0', taken: '0.3', K: '0' });
  say(`${z.p.fx === 0n && z.p.ref === 0n ? 'PASS' : 'FAIL'} K=0 的取用不做除法，p 直接置 0`); if (z.p.fx !== 0n) fails++;
}
{
  // A5-8.2 切片上的界：一笔 n×t 与 n 笔 t
  const n = 1000, t = '1', K = '1000000', c = { ds: '0.5', skill: '40', K };
  const one = pNew('1'); const r1 = pTake(one, { ...c, taken: String(n * Number(t)) });
  const many = pNew('1'); let sumEps = 0, small = null;
  for (let i = 0; i < n; i++) { const r = pTake(many, { ...c, taken: t }); sumEps += r.eps; small = r; }
  const diff = Number(absB(one.p.fx - many.p.fx)), bound = sumEps + r1.eps;
  const cond = small.dmg.v < 1e-6 && small.dmg.v > small.eps * U;
  const ok = diff <= bound && many.p.fx < S8 && cond; if (!ok) fails++;
  say(`${ok ? 'PASS' : 'FAIL'} A5-8.2 切片：每笔伤害参考值 ${small.dmg.v.toExponential(3)}（<10⁻⁶ 且 >ε取×10⁻⁸=${(small.eps * U).toExponential(1)}），${n} 笔与一笔之差 ${diff} ≤ 界 ${bound}；${n} 笔后 p 减少 ${(1 - fnum(many.p.fx)).toExponential(4)}（不为 0）`);
  judge(`切片 ${n} 笔后 p 与参考值`, pAct(many), many.Et);
}
{
  // 随机与极端
  let n = 0, bad = 0, negG = 0; const rs = [];
  for (let run = 0; run < 160; run++) {
    const K = pick(['0.5', '3', '120', '40000', '999999']);
    const ext = run % 8 === 0;   // 极端：u 远大于 2
    const st = pNew(pick(['1', '0.5', '0.02', r4(0, 1)]));
    const cfg = { rate: ext ? '20' : r4(0.01, 3), f: ext ? '50' : r4(0, 3), c: ext ? '5' : r4(0.1, 5), K };
    for (let d = 0; d < 365; d++) {
      const mig = rnd(20) === 0 ? r4(0, Number(K) * 0.3) : null;
      pDay(st, { ...cfg, season: r4(0, 1), mig });
      if (rnd(5) === 0) pTake(st, { ds: r4(0, 1), skill: String(rnd(101)), taken: r4(0, Math.min(Number(K) * 0.2, 5000)), K });
      n++; if (pAct(st) > st.Et) bad++;
      if (pAct(st) > 0.5) rs.push(st.Et / pAct(st));
    }
    negG += st.negG;
  }
  if (bad) fails++;
  say(`${bad ? 'FAIL' : 'PASS'} 随机 160 条记录 × 365 日（每 8 条一条极端：年率 20、growthFactor 50、恢复系数 5）共 ${n} 次检查：超界 ${bad}；${stats(rs)}`);
  say(`   附：偏导负侧（1 + u(1 − 2p) < −1）大于卷中 G_n 的写入 ${negG} 次（卷中 G_n 只取正侧；这些写入之后的界见上一行是否超界）`);
}

// ═══ 二、development（卷五 §4.9 规则 1、规则 5）═══
say('二、development（卷五 §4.9 规则 5；全部站点一起递推；单位 10⁻⁸）');
function devRun(name, cfg) {
  const N = cfg.D0.length, rho = ex(cfg.rho), del = ex(cfg.delta);
  const G = Math.max(Math.abs(1 - rho.v), Math.abs(1 - rho.v - del.v));
  let st = cfg.D0.map(s => ({ D: ex(s), Et: 0, Ek: 0 }));
  let Ehat = 0, worst = 0, worstHat = 0, bad = 0; const rs = [];
  const closed = G + del.v < 1 ? Math.ceil(2 + del.v) / (1 - G - del.v) : null;
  for (let day = 1; day <= cfg.days; day++) {
    const snap = st;
    st = snap.map((s, i) => {
      const nb = cfg.nbrs[i];
      const D0 = leaf(s.D), Tg = ex(cfg.target(i, day));
      let x = add(D0, mul(rho, sub(Tg, D0)));
      let mDev = 1;
      if (nb.length) {
        let sum = ZERO; for (const j of nb) sum = add(sum, snap[j].D);
        const mean = divInt(sum, nb.length);
        x = add(x, mul(del, max0(sub(mean, D0))));
        mDev = Math.ceil(2 + del.v * (nb.reduce((t, j) => t + snap[j].Et, 0) / nb.length + 1));
      }
      let nw = clamp(x, ZERO, HUNDRED);
      mcheck(nw.err, mDev, `${name} 每日`);
      let Et = G * s.Et + mDev, Ek = G * s.Ek + nw.err;
      const ev = cfg.events?.find(e => e.day === day && e.site === i);
      if (ev) nw = clamp(sub(nw, ex(ev.amt)), ZERO, HUNDRED);                 // 破坏类事件：10⁴ 的幅度相减，误差量 0
      if ((nw.fx === 0n && nw.ref === 0n) || (nw.fx === HUNDRED.fx && nw.ref === HUNDRED.ref)) { Et = 0; Ek = 0; }
      return { D: new T(nw.fx, nw.ref, Ek), Et, Ek };
    });
    Ehat = (G + del.v) * Ehat + Math.ceil(2 + del.v);
    for (const s of st) {
      const a = s.D.actual; if (a > s.Et || a > Ehat || (closed !== null && a > closed)) bad++;
      worst = Math.max(worst, a / Math.max(s.Et, 1e-300)); if (a > 0.5) rs.push(s.Et / a);
    }
  }
  if (bad) fails++;
  const am = st.reduce((m, s) => Math.max(m, s.D.actual), 0), em = st.reduce((m, s) => Math.max(m, s.Et), 0);
  return { bad, worst, am, em, Ehat, closed, rs, st };
}
{
  // 卷内例（§4.9.5 西陲一座通商镇，逐年上升并向相邻村扩散）：镇 0 与村 1、2、3；边 0-1、0-2、2-3
  const nbrs = [[1, 2], [0], [0, 3], [2]];
  const tgt = (i, day) => (i === 0 ? (day < 1800 ? '72' : '64.5') : ['0', '18', '22.25', '15'][i]);
  for (const [rho, delta, tag] of [['0.01', '0.005', 'devDiffusion 小于 devRatePerDay（有与天数无关的界）'], ['0.002', '0.01', 'devDiffusion 不小于 devRatePerDay（第十版作者自记 1：界随天数增长）']]) {
    const r = devRun('通商镇', { D0: ['30', '10', '10', '5'], nbrs, rho, delta, days: 3650, target: tgt, events: [{ day: 400, site: 0, amt: '25' }] });
    if (r.bad) say(`FAIL 通商镇 ${tag}：超界 ${r.bad} 次`);
    judge(`通商镇 10 年（${tag}；第 400 日破坏扣 25）各站点 D=${r.st.map(s => s.D.v.toFixed(3)).join('/')}，最大实际误差对各自 E_n`, r.am, r.em,
      `全程 实际÷E_n 最大 ${r.worst.toFixed(3)}；Ê_n=${fmt(r.Ehat)}${r.closed !== null ? `；与天数无关的界 ${r.closed.toFixed(2)}` : ''}`);
  }
}
{
  let n = 0, bad = 0; const rs = [];
  for (let run = 0; run < 120; run++) {
    const N = 3 + rnd(7); const nbrs = Array.from({ length: N }, () => []);
    for (let i = 1; i < N; i++) { const j = rnd(i); nbrs[i].push(j); nbrs[j].push(i); }
    for (let e = 0; e < rnd(N); e++) { const a = rnd(N), b = rnd(N); if (a !== b && !nbrs[a].includes(b)) { nbrs[a].push(b); nbrs[b].push(a); } }
    const mode = run % 6;
    const rho = mode === 0 ? '1' : mode === 1 ? '0' : r4(0, 1);
    const delta = mode === 0 ? '0' : mode === 1 ? r4(0.5, 1) : r4(0, 1 - Number(rho));
    const tg = Array.from({ length: N }, () => Array.from({ length: 30 }, () => pick(['0', '100', r4(0, 100)])));
    const days = mode === 1 ? 300 : 730;
    const events = Array.from({ length: 5 }, () => ({ day: 1 + rnd(days), site: rnd(N), amt: r4(0, 60) }));
    const r = devRun('随机', { D0: Array.from({ length: N }, () => pick(['0', '100', r4(0, 100)])), nbrs, rho, delta, days, target: (i, d) => tg[i][Math.floor(d / 25) % 30], events });
    n += N * days; bad += r.bad; rs.push(...r.rs);
  }
  if (bad) fails++;
  say(`${bad ? 'FAIL' : 'PASS'} 随机 120 个站点网（3–9 站，每 6 个一组极端：devRatePerDay=1；devRatePerDay=0 且扩散系数 ≥ 0.5）共 ${n} 次写入：超界 ${bad}；${stats(rs)}`);
}

// ═══ 三、control（卷五 §4.9 规则 2、规则 5）═══
say('三、control（卷五 §4.9 规则 5；单位 10⁻⁸）');
function ctrlRun(cfg) {
  const kap = ex(cfg.kappa), lam = ex(cfg.lam);
  let C = ex(cfg.C0), Et = 0, Ek = 0, segE = 0, transfers = 0, bad = 0, badClaim = 0, worst = 0; const rs = [];
  for (let day = 1; day <= cfg.days; day++) {
    if (cfg.transfers.includes(day)) {
      const nw = clamp(mul(leaf(C), lam), ZERO, HUNDRED);
      mcheck(nw.err, 1, '控制度 易主');
      Et = lam.v * Et + 1; Ek = lam.v * Ek + nw.err; C = new T(nw.fx, nw.ref, Ek); transfers++; segE = Et;
    }
    const C0 = leaf(C);
    const nw = clamp(add(C0, mul(kap, sub(ex(cfg.target(day)), C0))), ZERO, HUNDRED);
    mcheck(nw.err, 1, '控制度 每日');
    Et = (1 - kap.v) * Et + 1; Ek = (1 - kap.v) * Ek + nw.err; C = new T(nw.fx, nw.ref, Ek);
    if ((C.fx === 0n && C.ref === 0n) || (C.fx === HUNDRED.fx && C.ref === HUNDRED.ref)) { Et = 0; Ek = 0; segE = 0; }
    const claim = kap.v > 0 ? Math.max(segE, 1 / kap.v) : transfers;
    const a = C.actual; if (a > Et) bad++; if (a > claim) badClaim++;
    worst = Math.max(worst, a / Math.max(Et, 1e-300)); if (a > 0.5) rs.push(Et / a);
  }
  return { C, Et, bad, badClaim, worst, rs, transfers };
}
{
  // 卷内例（§4.9.5 非西陲一处新征服的山城）：易主当日乘转移系数骤降，之后缓慢回升到不满的目标
  const r = ctrlRun({ C0: '68', kappa: '0.02', lam: '0.3', transfers: [1, 500], days: 1095, target: d => (d < 500 ? '55' : '47.5') });
  if (r.bad || r.badClaim) fails++;
  judge(`山城 3 年（第 1、500 日易主，λ=0.3，κ=0.02）C=${r.C.v.toFixed(4)}`, r.C.actual, r.Et, `全程 实际÷界 最大 ${r.worst.toFixed(3)}；超出"max(段首 E, 1÷κ)"的日数 ${r.badClaim}`);
  // κ = 0：只有易主写入
  const z = ctrlRun({ C0: '80', kappa: '0', lam: '0.5', transfers: [10, 50, 90], days: 200, target: () => '30' });
  judge(`κ=0，200 日内易主 3 次 C=${z.C.v.toFixed(6)}：按卷二递推（每日 m控=1）`, z.C.actual, z.Et);
  judge(`κ=0 同上：按卷中"E 不超过易主次数"`, z.C.actual, z.transfers, `（递推得 ${fmt(z.Et)}，卷中写法比递推紧；实际误差满足两者）`);
}
{
  let n = 0, bad = 0, badClaim = 0; const rs = [];
  for (let run = 0; run < 300; run++) {
    const kappa = run % 10 === 0 ? '1' : run % 10 === 1 ? '0.0001' : r4(0, 1);
    const days = 400, tr = Array.from({ length: rnd(6) }, () => 1 + rnd(days));
    const tg = Array.from({ length: 20 }, () => pick(['0', '100', r4(0, 100)]));
    const r = ctrlRun({ C0: pick(['0', '100', r4(0, 100)]), kappa, lam: pick(['0', '1', r4(0, 1)]), transfers: tr, days, target: d => tg[Math.floor(d / 20) % 20] });
    n += days; bad += r.bad; badClaim += r.badClaim; rs.push(...r.rs);
  }
  if (bad || badClaim) fails++;
  say(`${bad || badClaim ? 'FAIL' : 'PASS'} 随机 300 条（每 10 条含 κ=1、κ=0.0001 各一，λ 含 0 与 1）共 ${n} 日：超递推界 ${bad}，超卷中段内上界 ${badClaim}；${stats(rs)}`);
}

// ═══ 四、场强度（卷二十 §4.7.3 第 1、3 条）═══
say('四、场强度锚点（卷二十 §4.7.3 第 1 条；单位 10⁻⁸）');
const pj = j => (j >= 2 ? 2 * j - 2 : 0);
// 卷中闭式读数的界 e读(j)；full 为假时是 e读₀(j)
const eReadTxt = (rec, j, full) => (j === 0 ? (full ? rec.Et : 0) : (full ? rec.Et : 0) + (num(rec.ref) + rec.Et * U) * pj(j) + 1);
function readT(rec, j, d, full) { const v = new T(rec.fx, rec.ref, full ? rec.Ek : 0); return j === 0 ? v : mul(v, powT(d, j), 1); }   // D_j 取 1
// 一个世界：sites（id 升序）、edges、fields（场行）、cfg 回调
function fieldWorld(w) {
  const recs = {};                                     // recs[site][field] = {fx, ref, at, Et, Ek}
  for (const s of w.sites) recs[s] = {};
  const nb = s => w.edges.filter(e => e.a === s || e.b === s).map(e => ({ to: e.a === s ? e.b : e.a, open: e.open }));
  let bad = 0, worst = 0, writes = 0, splitBad = 0; const rs = [];
  const check = (a, b) => { if (a > b) bad++; worst = Math.max(worst, a / Math.max(b, 1e-300)); if (a > 0.5) rs.push(b / a); };
  function step(t) {
    const snap = {}; for (const s of w.sites) snap[s] = { ...recs[s] };   // 上一步快照（写回时整条替换，不改旧对象）
    const acc = {};                                      // acc[site][field] = {terms: T[], eTxt, any}
    const A = (s, f) => ((acc[s] ??= {})[f] ??= { ins: [], eIn: 0, em: [], eEm: 0, any: false });
    for (const s of w.sites) for (const [f, F] of Object.entries(w.fields)) {
      const rec = snap[s][f]; const d = ex(F.d);
      const em = w.emit(s, f, t);
      if (em) { const a = A(s, f); a.em.push(em); a.any = true; }
      if (!rec) continue;
      const k1 = t - rec.at - 1;
      // 副产：本场的旧强度 × 份额 转给同地点的别的场
      for (const bp of F.byproducts || []) {
        const r = readT(rec, k1, d, true); if (r.ref === 0n) continue;
        const a = A(s, bp.to); a.em.push(mul(r, ex(bp.share))); a.eEm += eReadTxt(rec, k1, true) * Number(bp.share) + 1; a.any = true;
      }
      // 蔓延：合格目标按 id 序，前几份整除、末份取差
      const tg = nb(s).filter(x => w.eligible(x.to, f, t)).sort((x, y) => (x.to < y.to ? -1 : 1));
      const old = readT(rec, k1, d, true);
      if (!tg.length || old.ref === 0n || dec(F.rate, S8) === 0n) continue;
      const out = mul(old, ex(F.rate));
      const wts = tg.map(x => BigInt(w.weight(s, x.to, f, t))), W = wts.reduce((p, q) => p + q, 0n);
      let sf = 0n, sr = 0n, se = 0; const shares = [];
      tg.forEach((x, i) => {
        if (i < tg.length - 1) { const sh = new T(out.fx * wts[i] / W, out.ref * wts[i] / W, out.err * Number(wts[i]) / Number(W) + 1); sf += sh.fx; sr += sh.ref; se += sh.err; shares.push(sh); }
        else shares.push(new T(out.fx - sf, out.ref - sr, out.err + se));
      });
      if (shares.reduce((p, q) => p + q.fx, 0n) !== out.fx) splitBad++;
      const eOut = eReadTxt(rec, k1, true) * Number(F.rate) + 1, eShare = 2 * eOut + tg.length - 1;
      tg.forEach((x, i) => { const a = A(x.to, f); a.ins.push(mul(shares[i], ex(x.open))); a.eIn += eShare * Number(x.open) + 1; a.any = true; });
      A(s, f).out = true; A(s, f).any = true;
    }
    const pr = w.precip(t);
    for (const s of w.sites) for (const [f, F] of Object.entries(w.fields)) {
      const rec = snap[s][f], a = acc[s]?.[f];
      const quench = rec && pr && dec(F.quench, S8) > 0n;
      if (!(a?.any) && !quench) continue;            // 纯衰减段不写，锚点不动
      const d = ex(F.d), k = rec ? t - rec.at : 0;
      let x = rec ? readT(rec, k, d, false) : ZERO;  // 叶子：本场锚点 value 的误差取 0
      for (const e of a?.em || []) x = add(x, e);
      let eTxt = rec ? eReadTxt(rec, k, false) : 0;
      eTxt += a?.eEm || 0;
      if (quench) {
        const p = ex(pr), ps = new T(p.fx * BigInt(w.stepMin) / 1440n, p.ref * BigInt(w.stepMin) / 1440n, (p.fx * BigInt(w.stepMin)) % 1440n === 0n ? 0 : 1);
        x = sub(x, mul(ps, ex(F.quench))); eTxt += Number(F.quench) + 1;
      }
      if (a?.out) { x = sub(x, mul(readT(rec, k - 1, d, false), ex(F.rate))); eTxt += eReadTxt(rec, k - 1, false) * Number(F.rate) + 1; }
      for (const e of a?.ins || []) x = add(x, e);
      eTxt += a?.eIn || 0;
      const nw = max0(x), m = Math.ceil(eTxt);
      mcheck(nw.err, m, `场 ${f}@${s} 第 ${t} 步`);
      const pinned0 = nw.fx === 0n && nw.ref === 0n;
      const Et = !rec || pinned0 ? m : rec.Et + m, Ek = !rec || pinned0 ? nw.err : rec.Ek + nw.err;
      recs[s][f] = { fx: nw.fx, ref: nw.ref, at: t, Et, Ek }; writes++;
      check(nw.actual, Et);
    }
  }
  return { recs, step, readCheck: (s, f, t) => { const rec = recs[s][f]; if (!rec) return null; const j = t - rec.at; const r = readT(rec, j, ex(w.fields[f].d), true); const b = eReadTxt(rec, j, true); check(r.actual, b); return { r, b, j }; }, res: () => ({ bad, worst, writes, splitBad, rs }) };
}
{
  // 卷内例（§4.7.5 第 1 例）：强度 80、每步衰减 0.25、无补充时三步后 = 80 × 0.75³ = 33.75
  const W = fieldWorld({ sites: ['A'], edges: [], stepMin: 10, fields: { fire: { d: '0.75', rate: '0', quench: '0' } }, emit: (s, f, t) => (t === 1 ? ex('80') : null), eligible: () => false, weight: () => 1, precip: () => null });
  W.step(1); const r = W.readCheck('A', 'fire', 4);
  judge(`火场 80 无补充三步后读数 ${r.r.v}（定点 ${fnum(r.r.fx)}）`, r.r.actual, r.b);
}
{
  // 逐步都写的火场连同蔓延与副产：A 着火，向 B（顺风）、C（逆风）蔓延，B 再向 D；火生烟（份额 0.3）；第 80–90 步下雨压制
  const w = {
    sites: ['A', 'B', 'C', 'D'], edges: [{ a: 'A', b: 'B', open: '0.6' }, { a: 'A', b: 'C', open: '0.35' }, { a: 'B', b: 'D', open: '0.8' }], stepMin: 10,
    fields: { fire: { d: '0.75', rate: '0.12', quench: '0.8', byproducts: [{ to: 'smoke', share: '0.3' }] }, smoke: { d: '0.95', rate: '0.2', quench: '0.05' } },
    emit: (s, f, t) => (s === 'A' && f === 'fire' && t <= 60 ? add(ex('6.5'), mul(ex('2.3719'), ex('0.4'))) : null),
    eligible: (to, f, t) => f === 'smoke' || t < 120, weight: (from, to) => (to === 'B' ? 3 : 1), precip: t => (t >= 80 && t <= 90 ? '25.4' : null),
  };
  const W = fieldWorld(w); for (let t = 1; t <= 400; t++) W.step(t);
  const res = W.res(); if (res.bad || res.splitBad) fails++;
  say(`${res.bad || res.splitBad ? 'FAIL' : 'PASS'} 逐步都写的火场连同蔓延与副产（4 地点、2 场、400 步）：写入 ${res.writes} 次，超界 ${res.bad}，拆分之和不等于蔓延出 ${res.splitBad}；全程 实际÷界 最大 ${res.worst.toFixed(3)}；${stats(res.rs)}`);
  for (const [s, f] of [['A', 'fire'], ['B', 'fire'], ['D', 'smoke']]) { const r = W.readCheck(s, f, 401); if (r) judge(`  第 401 步读 ${f}@${s}（距锚点 ${r.j} 步）=${r.r.v.toExponential(4)}`, r.r.actual, r.b); }
}
{
  // 长段纯衰减后再排放：前 5 步排放，之后 3000 步无排放、无蔓延（纯衰减不写），再排放一次
  const W = fieldWorld({ sites: ['A'], edges: [], stepMin: 10, fields: { miasma: { d: '0.9987', rate: '0.1', quench: '0' } }, emit: (s, f, t) => (t <= 5 || t === 3006 ? ex('123.4567') : null), eligible: () => false, weight: () => 1, precip: () => null });
  for (let t = 1; t <= 5; t++) W.step(t);
  const at = W.recs.A.miasma.at;
  for (const j of [1, 2, 7, 100, 2999]) { const r = W.readCheck('A', 'miasma', at + j); judge(`纯衰减段读数 j=${j}：${r.r.v.toFixed(6)}`, r.r.actual, r.b); }
  for (let t = 6; t <= 3005; t++) W.step(t);
  if (W.recs.A.miasma.at !== at) { fails++; say('FAIL 纯衰减段重设了锚点'); } else say(`PASS 纯衰减 3000 步锚点不动（at=${at}）`);
  W.step(3006); const rec = W.recs.A.miasma;
  judge(`距锚点 ${3006 - at} 步后再排放写入 value=${num(rec.ref).toFixed(6)}`, new T(rec.fx, rec.ref, 0).actual, rec.Et, `（这一次 m 含 B(value)×p_k，p_k=${pj(3006 - at)}）`);
}
{
  // 降水压制到 0 后清零：小火遇大雨，钳到 0 后累计误差从本步的 m 重计，雨停后再起火
  const W = fieldWorld({ sites: ['A'], edges: [], stepMin: 10, fields: { fire: { d: '0.9', rate: '0', quench: '2' } }, emit: (s, f, t) => (t === 1 || t === 20 ? ex('3.0001') : null), eligible: () => false, weight: () => 1, precip: t => (t >= 3 && t <= 10 ? '200' : null) });
  let zeroAt = null;
  for (let t = 1; t <= 25; t++) { W.step(t); const r = W.recs.A.fire; if (zeroAt === null && r && r.fx === 0n && r.ref === 0n) zeroAt = { t, Et: r.Et }; }
  const r = W.recs.A.fire;
  say(`${zeroAt ? 'PASS' : 'FAIL'} 第 ${zeroAt?.t} 步定点值与参考值都钳到 0，累计误差重计为本步 m=${zeroAt?.Et}`); if (!zeroAt) fails++;
  judge(`雨停后第 20 步再起火，第 25 步 value=${num(r.ref).toFixed(6)}`, new T(r.fx, r.ref, 0).actual, r.Et);
}
{
  // 随机与极端：3–6 个地点、1–2 种场，衰减含 0 与 1，蔓延率含 0 与 1，开敞比例含 1，随风权重，间歇排放、降水与断燃
  let bad = 0, writes = 0, splitBad = 0, worst = 0; const rs = [];
  for (let run = 0; run < 200; run++) {
    const N = 3 + rnd(4), sites = Array.from({ length: N }, (_, i) => 'P' + String(i).padStart(2, '0'));
    const edges = []; for (let i = 1; i < N; i++) edges.push({ a: sites[rnd(i)], b: sites[i], open: pick(['1', '0.0001', r4(0, 1)]) });
    const ext = run % 5 === 0;
    const mk = () => ({ d: ext ? pick(['1', '0', '0.0001']) : String((1 - Number(r4(0, 0.5))).toFixed(4)), rate: ext ? pick(['1', '0', r4(0, 1)]) : r4(0, 0.5), quench: r4(0, 3) });
    const fields = { f1: { ...mk(), byproducts: rnd(2) ? [{ to: 'f2', share: r4(0, 1) }] : [] }, f2: mk() };
    const emitPlan = Array.from({ length: 150 }, () => (rnd(4) === 0 ? { s: pick(sites), f: pick(['f1', 'f2']), v: pick([r4(0, 10), r4(0, 5000), '0.0001']) } : null));
    const fuel = Array.from({ length: N }, () => 20 + rnd(150));
    const W = fieldWorld({ sites, edges, stepMin: pick([1, 7, 10, 60]), fields,
      emit: (s, f, t) => { const e = emitPlan[t - 1]; return e && e.s === s && e.f === f ? ex(e.v) : null; },
      eligible: (to, f, t) => f === 'f2' || t < fuel[sites.indexOf(to)], weight: (from, to) => (to < from ? 1 : 3), precip: t => (t % 37 < 4 ? r4(0, 300) : null) });
    for (let t = 1; t <= 150; t++) W.step(t);
    for (const s of sites) for (const f of ['f1', 'f2']) W.readCheck(s, f, 150 + rnd(400));
    const r = W.res(); bad += r.bad; writes += r.writes; splitBad += r.splitBad; worst = Math.max(worst, r.worst); rs.push(...r.rs);
  }
  if (bad || splitBad) fails++;
  say(`${bad || splitBad ? 'FAIL' : 'PASS'} 随机 200 个场世界（每 5 个一组极端：decayPerStep 取 0、1 或 0.9999，蔓延率取 0 或 1）共写入 ${writes} 次并抽读：超界 ${bad}，拆分之和不等 ${splitBad}；全程 实际÷界 最大 ${worst.toFixed(3)}；${stats(rs)}`);
}

ratios.sort((a, b) => a - b);
say(`合计：失败项 ${fails}（其中逐步递推 m 大于确定式 m 的漏项 ${missing}）；点名各例 界÷实际 最小 ${ratios.length ? ratios[0].toFixed(2) : '—'}、最大 ${ratios.length ? fmt(ratios.at(-1)) : '—'}`);
process.exitCode = fails ? 1 : 0;
