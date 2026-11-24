// X5 封卷勘误证明脚本：本名键号两段构造（卷二十七 R27-2.2「本名键号」）
// 构造与参数照正文：
//   位宽常数 A = keyIdAggBits（聚合体号位宽，正式 20）、O = keyIdOrdinalBits（成员序号位宽，正式 31）、标志 1 位；
//   加载校验 A + O + 1 ≤ 53，否则 E-KEYID-WIDTH 拒载。P = A + O。
//   置换段：x = aggNo·2^O + ordinal（P 位），交替宽度 Feistel，高半 h = ⌊P/2⌋ 位、低半 l = P − h 位，
//   轮数 8（写死）；每轮 (L, R) ← (R, L XOR (F_r(R) mod 2^{|L|}))；
//   F_r(R) = sha256(轮钥_r + "|" + R) 前 16 位十六进制（64 位）；轮钥_r = sha256(世界种子 + "|keyid|" + r) 十六进制；
//   键号 = 输出，落在 [0, 2^P)。
//   seq 段：键号 = 2^P + identities.seq，落在 [2^P, 2^{P+1})；seq 达到 2^P 即 E-DET-OVERFLOW 拒写。
//   超界：aggNo ≥ 2^A 或 ordinal ≥ 2^O → 本名键取 seq 段，钉住原因 pin_keyspace。
import { createHash } from 'node:crypto';

const ROUNDS = 8;
const SAFE = 2n ** 53n - 1n;
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

function loadCheck(A, O) {
  if (!Number.isInteger(A) || !Number.isInteger(O) || A < 1 || O < 1) return 'E-KEYID-WIDTH';
  return A + O + 1 <= 53 ? 'ok' : 'E-KEYID-WIDTH';
}

function makePerm(worldSeed, A, O) {
  const P = A + O;
  const h = Math.floor(P / 2), l = P - h;
  const keys = [];
  for (let r = 0; r < ROUNDS; r++) keys.push(sha(worldSeed + '|keyid|' + r));
  const F = (r, R) => BigInt('0x' + sha(keys[r] + '|' + R.toString()).slice(0, 16));
  const mask = (w) => (1n << BigInt(w)) - 1n;
  function fwd(x) {
    let L = x >> BigInt(l), R = x & mask(l), wL = h, wR = l;
    for (let r = 0; r < ROUNDS; r++) {
      const nL = R, nR = L ^ (F(r, R) & mask(wL));
      L = nL; R = nR; const t = wL; wL = wR; wR = t;
    }
    return (L << BigInt(l)) | R; // 轮数为偶，宽度回到 (h, l)
  }
  function inv(y) {
    let L = y >> BigInt(l), R = y & mask(l), wL = h, wR = l;
    for (let r = ROUNDS - 1; r >= 0; r--) {
      // 本轮前 (L0:wR 宽, R0:wL 宽)，本轮后 (L=R0, R=L0 ^ F(R0))
      const R0 = L, L0 = R ^ (F(r, R0) & mask(wR));
      L = L0; R = R0; const t = wL; wL = wR; wR = t;
    }
    return (L << BigInt(l)) | R;
  }
  return { P, fwd, inv };
}

// 本名键号取法（一个世界一份状态：seq 计数）
function makeWorld(worldSeed, A, O) {
  const perm = makePerm(worldSeed, A, O);
  const base = 1n << BigInt(perm.P);
  let seq = 0n;
  function seqKey() {
    if (seq >= base) return { error: 'E-DET-OVERFLOW' };
    const k = base + seq; seq += 1n; return { keyId: k };
  }
  function legalKey(aggNo, ordinal) {
    if (aggNo === null) { const s = seqKey(); return { ...s, segment: 'seq', pin: 'pin_identity' }; }
    if (BigInt(aggNo) >= (1n << BigInt(A)) || BigInt(ordinal) >= (1n << BigInt(O))) {
      const s = seqKey(); return { ...s, segment: 'seq', pin: 'pin_keyspace' };
    }
    const x = (BigInt(aggNo) << BigInt(O)) | BigInt(ordinal);
    return { keyId: perm.fwd(x), segment: 'perm', pin: null };
  }
  return { perm, base, legalKey, seqKey, get seq() { return seq; } };
}

let fails = 0;
const out = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + msg); };

// 0 加载校验
console.log('== 0 加载校验（A + O + 1 ≤ 53）');
for (const [A, O, want] of [[20, 31, 'ok'], [21, 31, 'ok'], [21, 32, 'E-KEYID-WIDTH'], [20, 33, 'E-KEYID-WIDTH'], [22, 31, 'E-KEYID-WIDTH'], [26, 26, 'ok'], [0, 31, 'E-KEYID-WIDTH']]) {
  const got = loadCheck(A, O);
  out(got === want, `A=${A} O=${O} → ${got}（期望 ${want}）`);
}

// 1 小位宽穷举：双射
console.log('== 1 小位宽穷举（同一构造、同一轮数，只换位宽）');
const smallSeeds = ['seedA', 'seedB', 'west-valley-01', 'south-port-77', 'zz'];
for (const [A, O] of [[3, 4], [4, 5], [5, 5], [2, 7], [6, 6], [7, 8]]) {
  for (const s of smallSeeds) {
    const { P, fwd, inv } = makePerm(s, A, O);
    const N = 1 << P; const seen = new Uint8Array(N);
    let okRange = true, okInv = true, dup = 0;
    for (let x = 0; x < N; x++) {
      const y = fwd(BigInt(x));
      if (y < 0n || y >= BigInt(N)) { okRange = false; continue; }
      if (seen[Number(y)]) dup++; seen[Number(y)] = 1;
      if (inv(y) !== BigInt(x)) okInv = false;
    }
    let cover = 0; for (let i = 0; i < N; i++) cover += seen[i];
    out(okRange && okInv && dup === 0 && cover === N, `A=${A} O=${O} P=${P} 种子=${s}：定义域 ${N} 个输入 → 像 ${cover} 个，重复 ${dup}，越界 ${okRange ? 0 : '有'}，逆映射还原 ${okInv ? '全部' : '有误'}`);
  }
}

// 2 正式位宽大样本
console.log('== 2 正式位宽 A=20 O=31（P=51）大样本');
const A = 20, O = 31;
out(loadCheck(A, O) === 'ok', '正式位宽通过加载校验（20+31+1=52 ≤ 53）');
const bigSeeds = ['seedA', 'west-valley-01', 'south-port-77'];
for (const s of bigSeeds) {
  const w = makeWorld(s, A, O);
  const seen = new Set();
  let n = 0, dup = 0, over = 0, invBad = 0, maxOut = 0n;
  const take = (aggNo, ord) => {
    const r = w.legalKey(aggNo, ord);
    if (r.segment !== 'perm') { over++; return; }
    const k = r.keyId; n++;
    if (k >= w.base || k > SAFE) over++;
    if (k > maxOut) maxOut = k;
    const key = k.toString();
    if (seen.has(key)) dup++; else seen.add(key);
    const x = (BigInt(aggNo) << BigInt(O)) | BigInt(ord);
    if (w.perm.inv(k) !== x) invBad++;
  };
  // 结构化：聚合体号 0..999 × 序号 0..999（相邻输入）
  for (let a = 0; a < 1000; a++) for (let o = 0; o < 1000; o++) take(a, o);
  // 边界：最大聚合体号、最大序号附近
  const aMax = (1 << A) - 1, oMax = 2 ** O - 1;
  for (let a = aMax - 99; a <= aMax; a++) for (let o = oMax - 99; o <= oMax; o++) take(a, o);
  // 随机散点（确定性 LCG，只为挑输入）
  let st = 12345n;
  for (let i = 0; i < 40000; i++) {
    st = (st * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    const a = Number(st >> 44n) & aMax; const o = Number((st >> 1n) & BigInt(oMax));
    take(a, o);
  }
  out(n >= 1000000 && dup === 0 && over === 0 && invBad === 0,
    `种子=${s}：输入 ${n} 个，重复 ${dup}，出置换段 ${over}，逆映射失败 ${invBad}，最大输出 ${maxOut}（< 2^51 = ${w.base}）`);
  // 3 两段不重叠、与 seq 键不撞号
  let seqHit = 0, seqOut = 0;
  const seqKeys = [];
  for (let i = 0; i < 100000; i++) seqKeys.push(w.seqKey().keyId);
  for (const k of seqKeys) { if (seen.has(k.toString())) seqHit++; if (k < w.base || k >= 2n * w.base || k > SAFE) seqOut++; }
  out(seqHit === 0 && seqOut === 0, `种子=${s}：seq 段前 100000 个键号全在 [2^51, 2^52)，与上面置换段输出撞号 ${seqHit}，越段 ${seqOut}`);
}

// 4 上界
console.log('== 4 全部输出 ≤ 2^53−1');
{
  const w = makeWorld('seedA', A, O);
  const permMax = w.base - 1n, seqMax = 2n * w.base - 1n;
  out(permMax <= SAFE && seqMax <= SAFE, `置换段上界 2^51−1 = ${permMax}；seq 段上界 2^52−1 = ${seqMax}；safeIntMax = ${SAFE}`);
  // seq 段用尽：小位宽演示拒写
  const t = makeWorld('seedA', 2, 3); let last;
  for (let i = 0; i < (1 << 5); i++) last = t.seqKey();
  const ex = t.seqKey();
  out(last.keyId === 63n && ex.error === 'E-DET-OVERFLOW', `小位宽 P=5：seq 段末键 ${last.keyId}（= 2^6−1），再取 → ${ex.error}`);
}

// 5 超界样例逐例
console.log('== 5 超界样例（逐例：落入 seq 段且钉住原因为 pin_keyspace）');
function scenario(seed) {
  const w = makeWorld(seed, A, O);
  const log = [];
  const cases = [
    ['序号超界 ordinal=2^31', 7, 2 ** 31],
    ['序号超界 ordinal=2^31+5', 7, 2 ** 31 + 5],
    ['序号恰在界内 ordinal=2^31−1（对照）', 7, 2 ** 31 - 1],
    ['聚合体号恰在界内 aggNo=2^20−1（对照）', 2 ** 20 - 1, 0],
  ];
  // 聚合体号超界：该聚合体全体成员
  const overAgg = 2 ** 20;
  for (const o of [0, 1, 2, 3, 1000, 2 ** 31 - 1, 2 ** 31]) cases.push([`聚合体号超界 aggNo=2^20 成员 ordinal=${o}`, overAgg, o]);
  for (const o of [0, 1, 2]) cases.push([`聚合体号超界 aggNo=2^20+9 成员 ordinal=${o}`, overAgg + 9, o]);
  cases.push(['手写个体（无成员身份，对照）', null, null]);
  for (const [name, a, o] of cases) {
    const r = w.legalKey(a, o);
    log.push({ name, a, o, ...r });
  }
  return log;
}
const run1 = scenario('west-valley-01'), run2 = scenario('west-valley-01');
for (const r of run1) {
  const isOver = r.a !== null && (r.a >= 2 ** 20 || r.o >= 2 ** 31);
  const ok = isOver ? (r.segment === 'seq' && r.pin === 'pin_keyspace' && r.keyId >= 2n ** 51n && r.keyId <= SAFE)
    : r.a === null ? (r.segment === 'seq' && r.pin === 'pin_identity') : (r.segment === 'perm' && r.pin === null && r.keyId < 2n ** 51n);
  out(ok, `${r.name}：键号 ${r.keyId}，段 ${r.segment === 'seq' ? 'seq 段' : '置换段'}，钉住原因 ${r.pin ?? '无（可折叠）'}`);
}
const allOverAgg = run1.filter(r => r.a !== null && r.a >= 2 ** 20);
out(allOverAgg.length === 10 && allOverAgg.every(r => r.segment === 'seq' && r.pin === 'pin_keyspace'),
  `聚合体号超界的两个聚合体共 ${allOverAgg.length} 名成员（含序号在界内者）全部落入 seq 段、钉住原因 pin_keyspace`);
const same = JSON.stringify(run1, (k, v) => typeof v === 'bigint' ? v.toString() : v) === JSON.stringify(run2, (k, v) => typeof v === 'bigint' ? v.toString() : v);
out(same, '同一种子、同一事件次序复演两遍：每例键号、段、钉住原因逐项相同（确定性、复演一致）');

// 6 折叠后再实体化同键
console.log('== 6 折叠后再实体化：置换段本名键由成员身份重算，前后相等');
{
  const w1 = makeWorld('south-port-77', A, O), w2 = makeWorld('south-port-77', A, O);
  let bad = 0;
  for (let i = 0; i < 1000; i++) {
    const a = (i * 7919) % (2 ** 20), o = (i * 104729) % (2 ** 31);
    const k1 = w1.legalKey(a, o).keyId;
    w2.seqKey(); // 中间插入若干 seq 段取号（化名等），不影响置换段
    const k2 = w2.legalKey(a, o).keyId;
    if (k1 !== k2) bad++;
  }
  out(bad === 0, `1000 名成员：首次实体化与（其间别人取过 seq 号之后）再实体化的本名键号不同者 ${bad} 个`);
  const kA = makeWorld('seedA', A, O).legalKey(5, 5).keyId, kB = makeWorld('seedB', A, O).legalKey(5, 5).keyId;
  out(kA !== kB, `不同世界种子轮钥不同：同一（5,5）得 ${kA} 与 ${kB}`);
}

console.log(fails === 0 ? 'ALL PASS' : `FAILS ${fails}`);
