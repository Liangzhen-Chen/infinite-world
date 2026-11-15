// 卷二十五第五版收卷前末批：扩展标度误差界的本机验算（封卷核卷二十五待改 2）。
// 对象：§2.3"存法"与 §4.1 规则 5 的 `stand`，§4.2 规则 9 的 `frostKeep`：
//   X(d) = fixedMultiply8(X(d−1), lookup8(frostSurviveCurve, 当日霜日数 × frostWeight(当前阶段)))，多年生的 frostKeep 在年周期起点置回 1。
// 卷中写出的界：n 个结算日之后与高精度参考值之差不超过 n × 2 × 10⁻⁸（一日截断两次：查表一次、相乘一次；其后乘数上界为 1）。
// 做法：仿 check-卷五卷二十-误差界.mjs。定点一侧照卷二 §3.3 实现（10⁸ 标度 BigInt；曲线按 10⁸ 读法分段线性插值一次整除；
//   fixedMultiply8 = a × b ÷ 10⁸；整除向零截断）；参考一侧用 50 位十进制定点（BigInt）算同一条式子，不截到 10⁻⁸。
//   另按卷二 §3.3 第 6 条的递推逐步算误差界 e_n = e_{n−1} × B(s) + B(X) × e_s + 1（e_s 为查表源误差 1，落在节点上为 0），
//   核对：实际误差 ≤ 卷中界 2n；逐步递推的单次 m ≤ 卷中确定式的单次 m = 2（确定式没有漏项）；列出 界 ÷ 实际。
// 只做算术，不读写项目文件。用法：node F:/dnd/docs/统一底层设计/脚本/卷二十五/check-卷二十五-误差界.mjs
const S8 = 10n ** 8n, P = 10n ** 50n, UP = P / S8;
const dec = (s, scale) => { const [i, f = ''] = s.split('.'); const d = String(scale).length - 1; return BigInt(i) * scale + BigInt((f + '0'.repeat(d)).slice(0, d) || '0'); };
const actualOf = (fx, ref) => { const d = fx * UP - ref; return Number((d < 0n ? -d : d) * 10n ** 6n / UP) / 1e6; };   // 单位 10⁻⁸
const num8 = fx => Number(fx) / 1e8;
let fails = 0, missing = 0; const ratios = [];
const say = s => console.log(s);
const fmt = x => (x >= 1e7 ? x.toExponential(3) : Number.isInteger(x) ? String(x) : x.toFixed(2));
function judge(name, actual, bound, extra = '') {
  const ok = actual <= bound; if (!ok) fails++;
  const r = actual > 0 ? bound / actual : Infinity; if (Number.isFinite(r)) ratios.push(r);
  say(`${ok ? 'PASS' : 'FAIL'} ${name}: 界=${fmt(bound)} 实际=${actual.toFixed(2)} 界÷实际=${Number.isFinite(r) ? r.toFixed(2) : '实际为0'}${extra ? ' ' + extra : ''}`);
}
// 曲线：节点为 4 位小数（规则表精度）；返回 {fx, ref, src}，src = 1 表示这次插值有截断
function lookup(pts, xs) {
  const X8 = pts.map(([a, b]) => [dec(a, S8), dec(b, S8)]), XP = pts.map(([a, b]) => [dec(a, P), dec(b, P)]);
  const x8 = dec(xs, S8), xp = dec(xs, P);
  if (x8 <= X8[0][0]) return { fx: X8[0][1], ref: XP[0][1], src: 0 };
  if (x8 >= X8.at(-1)[0]) return { fx: X8.at(-1)[1], ref: XP.at(-1)[1], src: 0 };
  let i = 0; while (x8 > X8[i + 1][0]) i++;
  const [a0, b0] = X8[i], [a1, b1] = X8[i + 1], [p0, q0] = XP[i], [p1, q1] = XP[i + 1];
  const n8 = (b1 - b0) * (x8 - a0), d8 = a1 - a0;
  return { fx: b0 + n8 / d8, ref: q0 + (q1 - q0) * (xp - p0) / (p1 - p0), src: n8 % d8 === 0n ? 0 : 1 };
}
// 跑一条轨迹：days 为每日 {frost: 0|1, w: '0.xxxx'}，resetAt 为年周期起点（frostKeep 置回 1）的日序集合
function run(start, curve, days, resetAt = new Set()) {
  let fx = dec(start, S8), ref = dec(start, P), e = 0, n = 0, worst = 0, maxM = 0, last = null;
  days.forEach((d, k) => {
    if (resetAt.has(k)) { fx = S8; ref = P; e = 0; n = 0; }
    const xs = d.frost ? d.w : '0';
    const s = lookup(curve, xs);
    const Bs = Math.max(Number(s.ref * 10n ** 8n / P) / 1e8, num8(s.fx)) + s.src * 1e-8;
    const BX = Math.max(Number(ref * 10n ** 8n / P) / 1e8, num8(fx)) + e * 1e-8;
    const prod = fx * s.fx;
    const src = prod % S8 === 0n ? 0 : 1;
    const eNew = e * Bs + BX * s.src + src;
    const m = eNew - e; if (m > maxM) maxM = m;
    if (m > 2 + 1e-6) { missing++; fails++; if (missing <= 10) say(`FAIL 漏项：第 ${k + 1} 日逐步递推 m=${m.toFixed(6)} > 确定式 m=2`); }
    fx = prod / S8; ref = ref * s.ref / P; e = eNew; n++;
    const a = actualOf(fx, ref);
    if (a > 2 * n) { fails++; say(`FAIL 第 ${k + 1} 日实际误差 ${a} 超出界 ${2 * n}`); }
    if (a > e + 1e-6) { fails++; say(`FAIL 第 ${k + 1} 日实际误差 ${a} 超出逐步递推界 ${e.toFixed(4)}`); }
    worst = Math.max(worst, a / (2 * n));
    last = { n, a, fx, e };
  });
  return { ...last, worst, maxM };
}
const FROST = [['0', '1'], ['0.25', '0.93'], ['0.5', '0.71'], ['0.75', '0.38'], ['1', '0.12']];   // frostSurviveCurve（示意）

say('一、stand 与 frostKeep（卷二十五 §4.1 规则 5、§4.2 规则 9；单位 10⁻⁸）');
// 例 1：春播谷物 110 日，五个阶段 frostWeight 0.1/0.3/1/0.6/0.2，第 3、4、40、41、72、73、108 日遇霜
{
  const W = ['0.1', '0.3', '1', '0.6', '0.2'], FD = new Set([2, 3, 39, 40, 71, 72, 107]);
  const days = Array.from({ length: 110 }, (_, k) => ({ frost: FD.has(k) ? 1 : 0, w: W[Math.min(4, Math.floor(k / 22))] }));
  for (const [name, st] of [['stand', '0.8734'], ['frostKeep', '1']]) {
    const r = run(st, FROST, days);
    judge(`春播谷物 110 日 ${name}=${num8(r.fx).toFixed(8)}`, r.a, 2 * r.n, `逐步递推单次 m 最大 ${r.maxM.toFixed(4)}`);
  }
}
// 例 2：落在曲线节点之间、插值除不尽的权重，每日都霜 400 日（值衰减到 0，实际误差随之归 0）
{
  const days = Array.from({ length: 400 }, () => ({ frost: 1, w: '0.3333' }));
  const r = run('0.9999', FROST, days);
  judge(`每日遇霜 400 日、权重 0.3333 stand=${num8(r.fx).toExponential(4)}`, r.a, 2 * r.n, `全程 实际÷界 最大 ${r.worst.toFixed(3)}`);
}
// 例 3：多年生 frostKeep 三个年周期（每周期 365 日，冬季 60 日中每 3 日一霜），年周期起点置回 1
{
  const days = Array.from({ length: 1095 }, (_, k) => ({ frost: (k % 365) < 60 && k % 3 === 0 ? 1 : 0, w: ['0.0517', '0.4142', '0.7071'][Math.floor(k / 365)] }));
  const r = run('1', FROST, days, new Set([365, 730]));
  judge(`多年生三个年周期 frostKeep（第三周期 ${r.n} 日）=${num8(r.fx).toFixed(8)}`, r.a, 2 * r.n, `全程 实际÷界 最大 ${r.worst.toFixed(3)}`);
}
// 随机：300 条记录 × 365 日；曲线 3–6 个节点、单调不增、首点 (0,1)；权重 4 位小数；每 10 条一条极端（权重 0、1、节点上）
let seed = 20261113n;
const rnd = k => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return Number((seed >> 11n) % BigInt(k)); };
const r4 = (lo, hi) => (lo + rnd(Math.round((hi - lo) * 1e4) + 1) / 1e4).toFixed(4);
{
  let checks = 0, over = 0; const rs = []; let maxM = 0;
  for (let i = 0; i < 300; i++) {
    const k = 3 + rnd(4); const xs = new Set(['0', '1']); while (xs.size < k) xs.add(r4(0.0001, 0.9999));
    const xsSorted = [...xs].sort((a, b) => Number(a) - Number(b));
    let y = 1; const curve = xsSorted.map((x, j) => { if (j > 0) y = Math.max(0, y - Number(r4(0, 0.5))); return [x, j === 0 ? '1' : y.toFixed(4)]; });
    const ext = i % 10 === 0 ? ['0', '1', curve[1][0]][rnd(3)] : null;
    const days = Array.from({ length: 365 }, () => ({ frost: rnd(10) < 3 ? 1 : 0, w: ext ?? r4(0, 1) }));
    const r = run(r4(0.5, 1), curve, days);
    checks += 365; if (r.a > 2 * r.n) over++; if (r.a > 0) rs.push(2 * r.n / r.a); maxM = Math.max(maxM, r.maxM);
  }
  rs.sort((a, b) => a - b);
  const ok = over === 0; if (!ok) fails++;
  say(`${ok ? 'PASS' : 'FAIL'} 随机 300 条记录 × 365 日（每 10 条一条极端：权重 0、1 或落在节点上）共 ${checks} 次写入：超界 ${over}；逐步递推单次 m 最大 ${maxM.toFixed(4)}；${rs.length ? `年末 界÷实际 最小 ${rs[0].toFixed(2)}、中位 ${rs[rs.length >> 1].toFixed(2)}、最大 ${fmt(rs.at(-1))}` : '实际误差全为 0'}`);
}
ratios.sort((a, b) => a - b);
say(`合计：失败项 ${fails}（其中逐步递推 m 大于确定式 m 的漏项 ${missing}）；点名各例 界÷实际 ${ratios.length ? `最小 ${ratios[0].toFixed(2)}、最大 ${fmt(ratios.at(-1))}` : '实际误差全为 0'}`);
process.exitCode = fails ? 1 : 0;
