// 卷六 §4.6 规则 8 边界订货日终分配的换序核对。只做计算，不读写任何项目文件。
// 用法：node F:/dnd/docs/统一底层设计/脚本/卷六/check-卷六-换序.mjs
// 做法：按规则 8 的文字实现分配（归并、预备步、第一步、第二步、成交步）。
// 实现里不对申请做任何整体排序：每一步在分组之前、在组内求等比份额之前、在成交入账循环之前，
// 都用一个与数据无关的洗牌器把 rows（或组内各条）随机打乱；只有"补零头"那一遍在组内按规则写明的键排序。
// 对若干个随机种子、每个种子若干组随机申请集，各做多次换序（登记顺序与每一步的遍历顺序都不同），
// 断言结果逐位一致，并核对三条上限与"各步只减不增"、成交步等比（与精确比例之差小于一个单位）。
// 另跑两个对照：先到先得（按登记顺序处理）与全序贪心（第四版成交步的写法），确认这种换序测得出它们。

const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pad = (p, n) => p + String(n).padStart(3, '0');
const keyOf = a => `${a.buyer}|${a.res}|${a.good}`;
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
const shuffleWith = r => arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

// 按钱等比削减（预备步与成交步共用的同一个式子）：rs 是同一（买方、计价资源）名下各条，from/to 是读写的数量栏
function scaleByMoney(rs, money, price, from, to, shuffle) {
  shuffle(rs); // 组内求份额前打乱
  const P = rs.reduce((s, r) => s + r[from] * price[r.good], 0n);
  if (P <= money) { for (const r of rs) r[to] = r[from]; return; }
  for (const r of rs) r[to] = r[from] * money / P; // BigInt 除法，非负即向下取整
  let left = money - rs.reduce((s, r) => s + r[to] * price[r.good], 0n);
  // 只有补零头这一遍按规则写明的键（货的资源键升序）
  for (const r of [...rs].sort((x, y) => cmp(x.good, y.good))) if (r[to] < r[from] && price[r.good] <= left) { r[to] += 1n; left -= price[r.good]; }
}

// 规则 8 的分配。mode: 'rule'（第五版正文）| 'greedy'（对照：成交步按遍历顺序贪心）
function allocate(apps, world, shuffle, mode = 'rule') {
  const merged = new Map(); // 归并：数量相加，可交换
  for (const a of apps) { const k = keyOf(a); const m = merged.get(k); if (m) m.want += a.qty; else merged.set(k, {key: k, buyer: a.buyer, res: a.res, good: a.good, want: a.qty}); }
  const rows = [...merged.values()];
  const groups = f => { shuffle(rows); const g = new Map(); for (const r of rows) { const k = f(r); if (!g.has(k)) g.set(k, []); g.get(k).push(r); } return shuffle([...g.entries()]); };
  // 预备步：按买方当日开始时可动用资金
  for (const [k, rs] of groups(r => `${r.buyer}|${r.res}`)) scaleByMoney(rs, world.funds[k] ?? 0n, world.price, 'want', 'q0', shuffle);
  // 第一步：按货缩到按量限额之内，零头按全序逐条补一单位
  for (const [good, rs] of groups(r => r.good)) {
    shuffle(rs);
    const L = world.quota[good] ?? 0n;
    const T = rs.reduce((s, r) => s + r.q0, 0n);
    if (T <= L) { for (const r of rs) r.q1 = r.q0; continue; }
    for (const r of rs) r.q1 = r.q0 * L / T;
    let rem = L - rs.reduce((s, r) => s + r.q1, 0n);
    for (const r of [...rs].sort((x, y) => cmp(x.key, y.key))) if (rem > 0n && r.q1 < r.q0) { r.q1 += 1n; rem -= 1n; }
  }
  // 第二步：按计价资源跨货联合，零头不补
  for (const [res, rs] of groups(r => r.res)) {
    shuffle(rs);
    const O = world.outflow[res] ?? 0n;
    const P = rs.reduce((s, r) => s + r.q1 * world.price[r.good], 0n);
    for (const r of rs) r.q2 = P <= O ? r.q1 : r.q1 * O / P;
  }
  // 成交步
  if (mode === 'rule') {
    // 与预备步同一式，只把资金换成成交这一刻的自由余额；算定数量后入账顺序任意
    for (const [k, rs] of groups(r => `${r.buyer}|${r.res}`)) scaleByMoney(rs, world.cashNow[k] ?? 0n, world.price, 'q2', 'done', shuffle);
    const cash = {...world.cashNow};
    for (const r of shuffle(rows)) { const k = `${r.buyer}|${r.res}`; cash[k] = (cash[k] ?? 0n) - r.done * world.price[r.good]; if (cash[k] < 0n) throw new Error('入账时余额为负'); }
  } else {
    // 对照：按遍历到的顺序逐条贪心成交（第四版写法去掉预先排序后的样子）
    const cash = {...world.cashNow};
    for (const r of shuffle(rows)) { const k = `${r.buyer}|${r.res}`; const p = world.price[r.good]; const can = (cash[k] ?? 0n) / p; r.done = r.q2 < can ? r.q2 : can; cash[k] = (cash[k] ?? 0n) - r.done * p; }
  }
  return rows.map(r => `${r.key}:${r.want}>${r.q0}>${r.q1}>${r.q2}>${r.done}`).sort().join(';'); // 只为比对而排序输出，不参与计算
}

// 对照：先到先得
function firstCome(apps, world) {
  const quota = {...world.quota}, out = {...world.outflow}, cash = {...world.cashNow}; const got = new Map();
  for (const a of apps) {
    const k = `${a.buyer}|${a.res}`; const p = world.price[a.good];
    let q = a.qty; for (const x of [quota[a.good] ?? 0n, (out[a.res] ?? 0n) / p, (cash[k] ?? 0n) / p]) if (x < q) q = x;
    quota[a.good] -= q; out[a.res] -= q * p; cash[k] = (cash[k] ?? 0n) - q * p;
    got.set(keyOf(a), (got.get(keyOf(a)) ?? 0n) + q);
  }
  return [...got.entries()].sort().map(([k, v]) => `${k}:${v}`).join(';');
}

const SEEDS = [11, 2027, 31337, 424242, 9000001], SETS = 80, PERMS = 20;
let failed = 0, fcDiffers = 0, greedyDiffers = 0, sc0 = 0, sc1 = 0, sc2 = 0, short = 0, totalApps = 0, compares = 0;
const bad = [];
const note = s => { failed++; if (bad.length < 6) bad.push(s); };
for (const SEED of SEEDS) for (let s = 0; s < SETS; s++) {
  const r = rng(SEED * 1000 + s);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const nB = int(2, 6), nG = int(2, 6), nR = int(1, 3), nA = int(3, 30);
  const world = {price: {}, funds: {}, quota: {}, outflow: {}, cashNow: {}};
  for (let g = 0; g < nG; g++) { world.price[pad('g', g)] = BigInt(int(1, 40)); world.quota[pad('g', g)] = BigInt(int(0, 60)); }
  for (let c = 0; c < nR; c++) world.outflow[pad('r', c)] = BigInt(int(0, 1500));
  for (let b = 0; b < nB; b++) for (let c = 0; c < nR; c++) {
    const k = `${pad('b', b)}|${pad('r', c)}`; const F = int(0, 900);
    world.funds[k] = BigInt(F); world.cashNow[k] = BigInt(r() < 0.4 ? int(0, F) : F); // 四成买方日中把钱花掉了一部分
  }
  const apps = [];
  for (let i = 0; i < nA; i++) apps.push({buyer: pad('b', int(0, nB - 1)), res: pad('r', int(0, nR - 1)), good: pad('g', int(0, nG - 1)), qty: BigInt(int(1, 25))});
  totalApps += apps.length;
  const sh0 = shuffleWith(rng(SEED + 7 * s + 1));
  const base = allocate(apps, world, sh0);
  const baseFc = firstCome(apps, world), baseGr = allocate(apps, world, sh0, 'greedy');
  let fc = false, gr = false;
  for (let p = 0; p < PERMS; p++) {
    const sh = shuffleWith(rng(SEED * 31 + s * 977 + p * 13 + 5)); // 每次换序用不同的洗牌序列：登记顺序与各步遍历顺序都不同
    const in2 = sh(apps.map(a => ({...a})));
    compares++;
    if (allocate(in2, world, sh) !== base) note(`种子 ${SEED} 集 ${s} 第 ${p} 次换序结果不同`);
    if (firstCome(in2, world) !== baseFc) fc = true;
    if (allocate(in2, world, sh, 'greedy') !== baseGr) gr = true;
  }
  if (fc) fcDiffers++; if (gr) greedyDiffers++;
  const rows = base.split(';').map(x => { const [k, v] = x.split(':'); const [buyer, res, good] = k.split('|'); const [want, q0, q1, q2, done] = v.split('>').map(BigInt); return {buyer, res, good, want, q0, q1, q2, done}; });
  const sum = (f, g) => { const m = {}; for (const x of rows) m[f(x)] = (m[f(x)] ?? 0n) + g(x); return m; };
  for (const [k, v] of Object.entries(sum(x => `${x.buyer}|${x.res}`, x => x.q0 * world.price[x.good]))) if (v > world.funds[k]) note(`种子 ${SEED} 集 ${s} 买方资金超出 ${k}`);
  for (const [k, v] of Object.entries(sum(x => x.good, x => x.q1))) if (v > world.quota[k]) note(`种子 ${SEED} 集 ${s} 按量限额超出 ${k}`);
  for (const [k, v] of Object.entries(sum(x => x.res, x => x.q2 * world.price[x.good]))) if (v > world.outflow[k]) note(`种子 ${SEED} 集 ${s} 外流余量超出 ${k}`);
  for (const [k, v] of Object.entries(sum(x => `${x.buyer}|${x.res}`, x => x.done * world.price[x.good]))) if (v > world.cashNow[k]) note(`种子 ${SEED} 集 ${s} 成交额超出此刻余额 ${k}`);
  for (const x of rows) if (!(x.done <= x.q2 && x.q2 <= x.q1 && x.q1 <= x.q0 && x.q0 <= x.want)) note(`种子 ${SEED} 集 ${s} 各步不是只减不增`);
  // 成交步等比：钱不够的买方，每条成交数量与精确比例之差小于一个单位（没有哪条因排在前面而拿满）
  const pay = sum(x => `${x.buyer}|${x.res}`, x => x.q2 * world.price[x.good]);
  for (const x of rows) { const k = `${x.buyer}|${x.res}`; const P = pay[k], C = world.cashNow[k];
    if (P > C) { const lo = x.q2 * C / P; if (!(x.done === lo || x.done === lo + 1n)) note(`种子 ${SEED} 集 ${s} 成交步不是等比 ${x.buyer}|${x.good}`); } }
  if (rows.some(x => x.q0 < x.want)) sc0++; if (rows.some(x => x.q1 < x.q0)) sc1++; if (rows.some(x => x.q2 < x.q1)) sc2++; if (rows.some(x => x.done < x.q2)) short++;
}
const N = SEEDS.length * SETS, ok = failed === 0 && fcDiffers > 0 && greedyDiffers > 0;
const out = [];
out.push(`随机种子 ${SEEDS.length} 个（${SEEDS.join('、')}），每个 ${SETS} 组，共 ${N} 组随机申请集、${totalApps} 条申请；每组换序 ${PERMS} 次，共 ${compares} 次比对`);
out.push('打乱位置：登记顺序；每一步分组之前打乱全部申请与各组次序；组内求等比份额之前打乱组内各条；成交入账循环之前打乱全部申请。实现里没有对申请的整体排序，只有补零头一遍在组内按规则写明的键排序');
out.push(`覆盖面：预备步发生削减 ${sc0} 组；第一步发生削减 ${sc1} 组；第二步发生削减 ${sc2} 组；成交时钱不够 ${short} 组`);
out.push(`${failed === 0 ? 'PASS' : 'FAIL'}  规则 8 分配：换序后各申请的原数量、三步数量、成交数量逐位一致；买方资金、按量限额、外流余量三条上限与成交额不超此刻余额不破；各步只减不增；成交步钱不够时全部申请等比削减（与精确比例之差小于一个单位）${bad.length ? '  ' + bad.join('；') : ''}`);
out.push(`${fcDiffers > 0 ? 'PASS' : 'FAIL'}  对照一（先到先得）：${fcDiffers} 组在换序后结果改变，说明测得出依赖登记顺序的写法`);
out.push(`${greedyDiffers > 0 ? 'PASS' : 'FAIL'}  对照二（成交步逐条贪心，第四版写法）：${greedyDiffers} 组在换序后结果改变，说明测得出依赖遍历顺序的写法`);
out.push(ok ? 'RESULT  全部通过' : 'RESULT  未通过');
console.log(out.join('\n'));
process.exitCode = ok ? 0 : 1;
