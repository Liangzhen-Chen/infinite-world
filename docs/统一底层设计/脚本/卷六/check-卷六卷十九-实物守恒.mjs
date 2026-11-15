#!/usr/bin/env node
// check-卷六卷十九-实物守恒.mjs
// 验证对象：卷十九第十五版（F:/dnd/docs/统一底层设计/卷十九-建筑与设施.md，下记"十九 §节"）
//           卷六第八版（F:/dnd/docs/统一底层设计/卷六-经济.md，下记"六 §节"）
//           卷二 §3.3 存量与余数结转（F:/dnd/docs/统一底层设计/卷二-维度表规范与统一入口.md，下记"二 §3.3"）
//           卷五 §3.3 单项登记名单 created.*.props.areaM2 一行（F:/dnd/docs/统一底层设计/卷五-地点地形与资源场.md，下记"五 §节"）
// 只用 BigInt / 整数，不用浮点参与任何存储值。kg 一律以 10^-4 kg 为单位（十九 §2.1 materialKg precision 4）；
// 密度以 10^-4 kg/L 为单位；份额（salvageFraction、replaceShare、demolishShare、v_i、u_k）以 10^-4 为单位；
// condition 与燃烧日份额 b 以 10^-8 为单位（十九 §4.1 规则 6 扩展标度；§4.16 规则 3）。
//
// ======================== 正文定法（第九版脚本列的缺口 G1–G8，第十版已逐条写确定；本脚本照正文实现并断言，不再单列"探测"） ========================
// G1 十九 §4.1 规则 7"换下的旧料去哪里"、A19-1.2：累计可回收量 S_k(d) = floor(W_k(d) × salvageFraction_k)，W_k(d) = 累计换出升数 × density_k；
//    本次可回收量 = 提交后的 S_k − 提交前的 S_k（二 §3.3 第 3 条按累计量取差）。断言：同一笔工时任意切分，各料取出、损失、出资方入账总量逐位相同；
//    一笔之内任一时刻料 k 的累计取出恰等于 floor(累计换出质量 × salvageFraction)。
// G2 十九 §4.4 规则 3 ②、A19-4.2：翻修时 repairLot 置空、repairedVolumeLRem 置 0、repairedVolumeL 不动。断言：翻修后任意修缮不使任何料为负。
// G3 十九 §4.1 规则 7"上限的截法"：m' 取使 floor((Rem + m' × 1000) ÷ minutesPerM3) ≥ r 的最小整数（不超过提交数），ΔL = min(floor(acc ÷ minutesPerM3), r)，
//    做完时余数置 0。放开 minutesPerM3 < 1000。断言：doneL 不越界、做完余数为 0、一笔累计收下的分钟数与切分无关。
// G4 十九 §4.4 规则 3、A19-4.2：拆除可回收量 = materialKg × demolishShare × salvageFraction 三数精确相乘、末尾截断一次。
// G5 十九 §4.16 规则 3、A19-16.2：b 取 10^8 标度的查表值（不先截到四位），condition 减去的就是它；烧掉 = floor(materialKg × b ÷ 10^8)。
// G6 十九 §4.1 规则 7、A19-1.2：u_k 四位；materialKg 为 0 的料不算在 material 里、不参加末项取差。断言：总质量大于 0 时份额和为 1，为 0 时为空，没有零值键。
// G7 十九 §4.16 规则 3、A19-16.2：燃烧与损毁是先后两个事务；"终止前的 materialKg"指损毁事务开始那一刻。
// G8 六 §4.1 规则 5"取出的料记入"：多人分一律一次拆完、按主体 id 升序、前几位整除、末位取差（二 §3.3 第 3 条）。换料记给出资方（按出资比例），
//    拆除与翻修按处置前的资产份额给原持有人，损毁与承载物终止记给后继。
// 新增事由（十九 §4.1 规则 11 表、六 §4.1 规则 5）：物化建行（聚合账户预置墙料与未物化建筑份额，物化时成对转换，不用 src_genesis）、
//    扩建（加装固定装置时砌进围护的料记砌入，不产出资产分录）、承载物终止（算式同损毁，资产 sink_loss）。卷六按明细的事由代号 cause 分情形记。
// 工位占用（十九 §4.3 规则 4、A19-3.2）：stationLog 能查到已释放占用的工位、占用者、起止；折叠前后保留期内每日每类分钟数不变；补结不变。
// ---- 第十一版（卷十九）/ 第八版（卷六）跟改（李白对 审查/卷六重拆-二审.md 的裁定；审查方改，见 审查/卷六重拆-二审只核.md） ----
// N3 十九 §4.4 规则 8、A19-4.2：扩建同一事务 envelopeVolumeL += floor(Σ_k 砌入质量_k ÷ density_k)（各料先精确求和，末尾截断一次）【第十二版新 3 已改为 E_后 − E_前，见下】；
//    断言：增加量逐位等于此值；扩建后烧掉一部分再修到没有待办，现存升数不小于设计体积，同料时总质量回到扩建后的值（差在 1 升料之内）。
// N5 十九 §2.1 repairLot.salvage、§4.1 规则 7：开笔时存各料 salvageFraction 的有效值，一笔之内只用它；加"一笔内比例变化"数据组（每次提交之间改有效值）。
// N7 六 §2.2 purpose_unmaterialized、§4.1 规则 5：预置墙料与未物化份额只在聚合账户的不可花分区；统计层只能动可花分区，物化只从专用分区记出。
// N4 十九 §3.3：stationFold 只有 daily，保留期外整日删去，不留总数（删 olderMinutes、olderCount 与"有史以来总和"一条）。
// ---- 第十二版（卷十九）跟改（李白对 审查/卷六重拆-二审只核.md 新 1、新 3、新 4 的裁定；审查方改） ----
// 新 3 十九 §4.4 规则 8、§2.1、A19-4.2：扩建同一事务 envelopeVolumeL += E_后 − E_前（E 是 §4.1 规则 7 的现存升数，同一个向上取整口径），
//    取代第十一版的 floor(Σ_k 砌入质量_k ÷ density_k)。断言：增加量逐位等于 E_后 − E_前；扩建前后待补升数 max(0, V − E) 逐位不变；扩建后补缺仍差在 1 升料之内。
// 新 4 十九 §4.3 规则 4 ②：条数上限折叠只把保留期内各日的分钟数加进 daily，保留期之前的直接丢。
// 新 1 十九 §4.4 规则 3 ④：房间行位置量经 relocate（仅限翻修事务），placement.rows 只给位置量（不含面积）；面积另走一条通道（第十三版改为下面 B 的判法）。
// ---- 第十三版（卷十九）跟改（李白对 审查/卷六重拆-改后核对.md A、B 的裁定；审查方改，见卷十九"附 第十三版修订记录"） ----
// A 十九 §2.1、§4.1 规则 7、§4.4 规则 3 ③与规则 6、A19-4.2：建成（开局、运行期、物化）与原地翻修时，envelopeVolumeL 直接写那一刻的现存升数 E
//    （§4.1 规则 7 同式、同向上取整，由刚写入的 materialKg 算），不再对规则 1 的体积向下取整。断言：建成、翻修提交后 envelopeVolumeL 逐位等于独立重算的 E、
//    待补升数为 0；建楼数据加入墙里实有体积不是整数升的楼（各料质量不是整升的密度倍）；"差在 1 升料之内"对未扩建与扩建过的建筑都成立。
// B 十九 §4.4 规则 3 ④、A19-10.2；五 §3.3：面积写权是卷五单项登记名单 created.*.props.areaM2 一行（改写写者 construction.mjs，行范围 withComponent: [comp_zone]
//    且 inside: [comp_facility]）；卷二只按"登记的写者 + 行范围"判，不判事务。"只在翻修事务内写"是 construction.mjs 的代码路径约束：写房间行 areaM2 的调用点
//    只有建行函数（建行事务）与翻修一步（翻修事务）两处，按调用点计数查。AREA_REG 改按行范围加代码路径判（不再按"事由 + 写者"）。
// ---- 第十五版（卷十九）跟改（李白对 审查/卷十九-areaM2行种类核查.md 的裁定，方案三照实写；审查方改） ----
// C 十九 §4.4 规则 3 ④、A19-10.2；五 §3.3：行范围 inside: [comp_facility] 圈的是建筑之内的行（房间与嵌套设施）。嵌套设施行（地窖、巷道等挂 comp_facility 的行）
//    与房间行一样带 areaM2，只在外层建筑的翻修事务内由 construction.mjs 随新布局整值重算（占地照建行时的同一个纯函数），过卷五 §4.1 规则 3 面积和校验，不过整笔回滚；
//    它自己的形制、用料不因外层翻修而变；对它自己翻修时写的是它之内各行，不是它自己；最外层建筑行本身与聚落分区不在范围内，建成后无人改写；事务外写入一律被拒。
//    新增数据组"嵌套设施行面积"（地窖挂在地面建筑之下，内有房间；随机加地面附屋与地窖下巷道），逐行断言并打印计数（被改写行数、拒绝次数、违例 0）。
// ==========================================================================================================================================

const SC = 10000n;       // 10^-4 定点
const SC8 = 100000000n;   // 10^-8 扩展标度
const LPM3 = 1000;        // 每立方米的升数
const DAY = 1440;

// ---------- 随机 ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const rb = (r, a, b) => BigInt(ri(r, a, b));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function shuffle(r, arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // 固定代号序 / id 升序

function randShares(r, n) {
  const cuts = new Set(); while (cuts.size < n - 1) cuts.add(ri(r, 1, 9999));
  const c = [0, ...[...cuts].sort((x, y) => x - y), 10000];
  return c.slice(1).map((v, i) => BigInt(v - c[i]));
}
// 二 §3.3 第 3 条一次拆完：前几份整除、末份取差（份按给定次序）
function splitLast(T, shares) {
  const out = []; let s = 0n; const TT = BigInt(T);
  shares.forEach((v, i) => { const q = i < shares.length - 1 ? TT * v / SC : TT - s; out.push(q); s += q; });
  return out.map(Number);
}
// 六 §4.1 规则 5 / 二 §3.3 第 3 条：多人分一律按主体 id 升序，前几位整除、末位取差
function splitById(total, parts) {
  const ps = [...parts].sort((a, b) => byCode(a.acct, b.acct)); const S = ps.reduce((a, p) => a + p.bp, 0n);
  const out = new Map(); let s = 0n;
  ps.forEach((p, i) => { const q = i < ps.length - 1 ? total * p.bp / S : total - s; s += q; out.set(p.acct, (out.get(p.acct) ?? 0n) + q); });
  return out;
}

function ser(o) {
  return JSON.stringify(o, (k, v) => {
    if (typeof v === 'bigint') return v.toString() + 'n';
    if (v instanceof Map) return Object.fromEntries([...v.entries()].sort((a, b) => byCode(String(a[0]), String(b[0]))));
    return v;
  });
}

// ---------- 世界 ----------
function makeWorld(r) {
  const pool = ['mat_ash', 'mat_brick', 'mat_clay', 'mat_oak', 'mat_reed', 'mat_stone', 'mat_turf'];
  const codes = shuffle(r, pool).slice(0, ri(r, 3, 6));
  const M = {};
  for (const c of codes) {
    const e = r();
    M[c] = {
      dens: rb(r, 3000, 80000),                               // 0.3–8 kg/L
      sf: e < 0.1 ? 0n : e < 0.2 ? SC : rb(r, 0, 10000),      // salvageFraction
      fire: r() < 0.4 ? 0n : rb(r, 1, 250000),               // fireLoadPerKg，0 = 不烧
    };
  }
  return {
    M, codes,
    envReq: randShares(r, ri(r, 1, 4)).map(v => ({ v })),     // envelopeReq 各消耗项体积份额 v_i
    rules: {
      replaceShare: r() < 0.1 ? SC : rb(r, 1, 10000),
      minutesPerM3: r() < 0.35 ? ri(r, 1, 999) : ri(r, 1000, 6000),   // G3：放开小于每立方米升数的情形
      demolishShare: r() < 0.1 ? 0n : rb(r, 0, 10000),
      collapseCond: rb(r, 0, 30000000),
    },
  };
}

// ---------- 建筑行（卷十九存储，只放原值） ----------
function newFacility(id) {
  return { id, materialKg: new Map(), wallFlow: new Map(), envelopeVolumeL: 0, condition: SC8,
           repairedVolumeL: 0, rem: 0, lot: null, terminated: false };
}
function flow(f, k) { if (!f.wallFlow.has(k)) f.wallFlow.set(k, { laid: 0n, taken: 0n, lost: 0n }); return f.wallFlow.get(k); }
function addMat(f, k, d) { f.materialKg.set(k, (f.materialKg.get(k) ?? 0n) + d); }
// 十九 §4.1 规则 11"交出的明细"：{facility, cause, rows}
function newDetail(f, cause) { return { facility: f.id, cause, rows: new Map() }; }
function drow(det, k) { if (!det.rows.has(k)) det.rows.set(k, { material: k, laidKg: 0n, takenKg: 0n, lostKg: 0n }); return det.rows.get(k); }
function detailOut(det) { return { facility: det.facility, cause: det.cause, rows: [...det.rows.values()].sort((a, b) => byCode(a.material, b.material)) }; }
// materialKg 的每一次加减都在同一步记进三项累计之一；全模块只有这三个写路径
function wLay(f, k, kg, det) { if (kg < 0n) throw new Error('neg lay'); addMat(f, k, kg); flow(f, k).laid += kg; if (det) drow(det, k).laidKg += kg; }
function wTake(f, k, kg, det) { if (kg < 0n) throw new Error('neg take'); addMat(f, k, -kg); flow(f, k).taken += kg; if (det) drow(det, k).takenKg += kg; }
function wLose(f, k, kg, det) { if (kg < 0n) throw new Error('neg lose'); addMat(f, k, -kg); flow(f, k).lost += kg; if (det) drow(det, k).lostKg += kg; }
const posKeys = f => [...f.materialKg.keys()].filter(k => f.materialKg.get(k) > 0n).sort(byCode);   // G6

// 视图字段 material（十九 §2.1）：质量份额，零值键不算，前几项整除、末项取差；总质量为 0 时为空
function materialView(f) {
  const ks = posKeys(f); const tot = ks.reduce((a, k) => a + f.materialKg.get(k), 0n); const out = new Map();
  if (tot === 0n) return out;
  let s = 0n; ks.forEach((k, i) => { const v = i < ks.length - 1 ? f.materialKg.get(k) * SC / tot : SC - s; s += v; out.set(k, v); });
  return out;
}

// ---------- 建行 ----------
// 第十三版 A：建楼数据一半是"墙里实有体积不是整数升"的楼——某消耗项的质量比整升的密度倍少 1 到（密度 − 1）个最小单位，建成锚须照现存升数向上取整
function planBuild(r, W, nonInt = r() < 0.5) {
  const V = ri(r, 50, 2000);
  const Ls = splitLast(V, W.envReq.map(e => e.v));
  return { V, items: W.envReq.map((e, i) => {
    const mat = pick(r, W.codes), d = W.M[mat].dens, whole = BigInt(Ls[i]) * d;
    return { mat, L: Ls[i], kg: nonInt && Ls[i] > 0 ? whole - rb(r, 1, Number(d) - 1) : whole };
  }) };
}
function planMass(W, plan) { const m = new Map(); for (const it of plan.items) m.set(it.mat, (m.get(it.mat) ?? 0n) + it.kg); return m; }
// 第十三版 A：建成锚 = 建成那一刻的现存升数 E（由刚写入的 materialKg 照 §4.1 规则 7 同式算、向上取整），不再写规则 1 体积的向下取整
function v19Build(f, W, plan, det) { for (const it of plan.items) wLay(f, it.mat, it.kg, det); f.envelopeVolumeL = Number(E_L(f, W)); }
function enough(S, acct, mass) { for (const [k, kg] of mass) if (lbal(S.L, acct, k) < kg) return false; return true; }
function v19Genesis(S, plan) { const det = newDetail(S.f, 'cause_genesis'); v19Build(S.f, S.W, plan, det); return { kind: 'genesis', detail: detailOut(det), plan }; }
function v19BuildRuntime(S, plan) {
  if (!enough(S, S.ctx.supply, planMass(S.W, plan))) return { rejected: 'insufficient' };            // 少了不能建成
  const det = newDetail(S.f, 'cause_build'); v19Build(S.f, S.W, plan, det); return { kind: 'build', detail: detailOut(det), plan };
}
// 物化建行（十九 §4.4 规则 9、§4.1 规则 11；六 §4.1 规则 5"物化建行"）：同一纯计算建行，事由代号与开局不同；墙料从聚合账户出
function v19Materialize(S, plan) {
  if (!enough(S, S.ctx.agg, planMass(S.W, plan))) return { rejected: 'insufficient' };
  const det = newDetail(S.f, 'cause_materialize'); v19Build(S.f, S.W, plan, det); return { kind: 'materialize', detail: detailOut(det), plan };
}

// ---------- 修缮（十九 §4.1 规则 7） ----------
function volWeights(f, W, keys) { let D = 1n; for (const k of keys) D *= W.M[k].dens; return { D, w: keys.map(k => (f.materialKg.get(k) ?? 0n) * (D / W.M[k].dens)) }; }
function E_L(f, W) { const keys = posKeys(f); if (!keys.length) return 0n; const { D, w } = volWeights(f, W, keys); const s = w.reduce((a, b) => a + b, 0n); return (s + D - 1n) / D; }
function volShares(f, W, keys) {                                            // u_k：四位，零值键不算（G6）
  const { w } = volWeights(f, W, keys); const S = w.reduce((a, b) => a + b, 0n); const u = new Map(); let s = 0n;
  keys.forEach((k, i) => { const v = i < keys.length - 1 ? w[i] * SC / S : SC - s; u.set(k, v); s += v; });
  return u;
}
function openLot(f, W) {
  const V = BigInt(f.envelopeVolumeL), E = E_L(f, W);
  const Mr = V > E ? V - E : 0n;
  let x = V * (SC8 - f.condition) - Mr * SC8; if (x < 0n) x = 0n;
  const keys = posKeys(f);
  const Nr = keys.length ? x * W.rules.replaceShare / (SC8 * SC) : 0n;
  const u = keys.length ? volShares(f, W, keys) : new Map();
  const quota = new Map(); let s = 0n, replaceL = Nr;
  keys.forEach((k, i) => { const q = i < keys.length - 1 ? Nr * u.get(k) / SC : Nr - s; s += q; quota.set(k, q); });
  for (const k of keys) {                                                    // 超过现有整升数则钳，replaceL 同减
    const whole = f.materialKg.get(k) / W.M[k].dens;
    if (quota.get(k) > whole) { replaceL -= quota.get(k) - whole; quota.set(k, whole); }
  }
  if (Mr + replaceL === 0n) return null;
  const salvage = new Map([...quota.keys()].map(k => [k, W.M[k].sf]));     // N5：开笔时存各料 salvageFraction 的有效值，键与 quotaL 相同
  return { fillL: Number(Mr), replaceL: Number(replaceL), doneL: 0, quotaL: new Map([...quota].map(([k, q]) => [k, Number(q)])), salvage };
}
// 二 §3.3 第 3 条：配额 q 的第 j 个单位位置 j/q，交叉相乘比较，同位置按份的固定代号序
const ORD = new Map();
function unitOrder(parts) {
  const key = JSON.stringify(parts.map(p => [p.key, p.q]));
  if (ORD.has(key)) return ORD.get(key);
  const units = []; parts.forEach((p, pi) => { for (let j = 1; j <= p.q; j++) units.push({ pi, j, q: p.q }); });
  units.sort((a, b) => { const l = a.j * b.q, rr = b.j * a.q; return l < rr ? -1 : l > rr ? 1 : a.pi - b.pi; });
  const ord = units.map(u => u.pi); if (ORD.size > 5000) ORD.clear(); ORD.set(key, ord); return ord;
}
function rangeCount(ord, n, R0, R1) { const c = new Array(n).fill(0); for (let i = R0; i < R1; i++) c[ord[i]]++; return c; }
function fillQuotas(lot, W) { return splitLast(lot.fillL, W.envReq.map(e => e.v)); }

function v19Repair(S, minutes, plan) {
  const { f, W } = S;
  if (f.terminated) return { rejected: 'terminated' };
  let lot = f.lot, opened = false;
  if (!lot) { lot = openLot(f, W); if (!lot) return { noop: true, returned: minutes }; opened = true; }
  const total = lot.fillL + lot.replaceL, rLeft = total - lot.doneL, mpm3 = W.rules.minutesPerM3;
  // G3：收下的分钟取使 floor((Rem + m' × 1000) ÷ minutesPerM3) ≥ r 的最小整数，且不超过提交数
  const needAcc = rLeft * mpm3 - f.rem;
  const take = Math.min(minutes, needAcc <= 0 ? 0 : Math.ceil(needAcc / LPM3));
  const acc = f.rem + take * LPM3;
  const dL = Math.min(Math.floor(acc / mpm3), rLeft);
  // 先补后换，按累计量分摊（二 §3.3 第 3 条）
  const d0 = lot.doneL, d1 = d0 + dL;
  const F0 = Math.min(d0, lot.fillL), F1 = Math.min(d1, lot.fillL), R0 = d0 - F0, R1 = d1 - F1;
  const fq = fillQuotas(lot, W);
  const fillL = rangeCount(unitOrder(fq.map((q, i) => ({ key: i, q }))), fq.length, F0, F1);
  const rKeys = [...lot.quotaL.keys()].sort(byCode);
  const ordR = unitOrder(rKeys.map(k => ({ key: k, q: lot.quotaL.get(k) })));
  const bef = rangeCount(ordR, rKeys.length, 0, R0), now = rangeCount(ordR, rKeys.length, R0, R1);
  const replL = new Map(rKeys.map((k, i) => [k, now[i]]));
  const cumR = new Map(rKeys.map((k, i) => [k, [bef[i], bef[i] + now[i]]]));     // 料 k 提交前、后的累计换出升数
  // 备料不够本次各项所需时整笔不执行
  const need = new Map(); const addNeed = (m, kg) => need.set(m, (need.get(m) ?? 0n) + kg);
  fillL.forEach((L, i) => addNeed(plan.fillChoice[i], BigInt(L) * W.M[plan.fillChoice[i]].dens));
  for (const [k, L] of replL) addNeed(plan.replChoice[k], BigInt(L) * W.M[plan.replChoice[k]].dens);
  for (const [m, kg] of need) if (kg > 0n && lbal(S.L, S.ctx.supply, m) < kg) return { rejected: 'insufficient' };
  if (opened) f.lot = lot;
  const det = newDetail(f, 'cause_repair');
  fillL.forEach((L, i) => { if (L > 0) wLay(f, plan.fillChoice[i], BigInt(L) * W.M[plan.fillChoice[i]].dens, det); });
  for (const k of rKeys) {
    const L = replL.get(k); if (!L) continue;
    const dens = W.M[k].dens, sf = lot.salvage.get(k), [cb, ca] = cumR.get(k);   // N5：比例取开笔时存的值，不重读 W.M[k].sf
    const out = BigInt(L) * dens;                                            // 换出质量（无截断）
    const salv = BigInt(ca) * dens * sf / SC - BigInt(cb) * dens * sf / SC;  // G1：S_k(提交后) − S_k(提交前)
    wTake(f, k, salv, det);
    wLose(f, k, out - salv, det);
    const c = plan.replChoice[k];
    wLay(f, c, BigInt(L) * W.M[c].dens, det);
  }
  const done = d1 === total;
  f.repairedVolumeL += dL; lot.doneL = d1; f.rem = done ? 0 : acc - dL * mpm3;   // G3：做完时余数置 0
  if (done) f.lot = null;
  return { kind: 'repair', detail: detailOut(det), audit: { fillL, replL, cumR, dL, plan, take, salv: new Map(lot.salvage) }, returned: minutes - take, completed: done };
}

// ---------- 扩建（十九 §4.4 规则 8：加装固定装置时一并砌进围护的料） ----------
// 第十二版（新 3）：设计体积加 E_后 − E_前，E 照 §4.1 规则 7 的现存升数（E_L，向上取整），与补缺同一取整口径；不再用 floor(Σ 砌入质量 ÷ 密度)
function v19Extend(S, items) {
  if (!items.length) return { kind: 'extend', detail: null, items };          // 没有砌料：不改 materialKg、不改 envelopeVolumeL、不交明细
  const mass = new Map(); for (const it of items) mass.set(it.mat, (mass.get(it.mat) ?? 0n) + it.kg);
  if (!enough(S, S.ctx.supply, mass)) return { rejected: 'insufficient' };
  const E0 = E_L(S.f, S.W);
  const det = newDetail(S.f, 'cause_extend'); for (const it of items) wLay(S.f, it.mat, it.kg, det);
  S.f.envelopeVolumeL += Number(E_L(S.f, S.W) - E0);                         // 新 3：同一事务里设计体积加 E_后 − E_前（第二写者，只做加法）
  return { kind: 'extend', detail: detailOut(det), items };
}
// 独立重算现存升数（断言用，不调被测的 E_L）：Σ_k materialKg_k ÷ density_k 精确求和后向上取整，零值料不算
function E_ref(f, W) {
  let num = 0n, den = 1n;
  for (const [k, kg] of f.materialKg) { if (kg <= 0n) continue; const d = W.M[k].dens; num = num * d + kg * den; den *= d; }
  return num === 0n ? 0n : (num + den - 1n) / den;
}
// 墙里实有体积是不是整数升（第十三版 A 的覆盖计数用）
function wholeLiters(f, W) {
  let num = 0n, den = 1n;
  for (const [k, kg] of f.materialKg) { if (kg <= 0n) continue; const d = W.M[k].dens; num = num * d + kg * den; den *= d; }
  return num % den === 0n;
}

// ---------- 燃烧（十九 §4.16 规则 3；G5） ----------
function v19Burn(S, b8) {
  const { f, W } = S; const burned = new Map();
  for (const k of posKeys(f)) {
    if (W.M[k].fire === 0n) continue;
    const kg = f.materialKg.get(k) * b8 / SC8;                               // b 取 10^8 标度，乘积截断一次
    wLose(f, k, kg, null); burned.set(k, kg);
  }
  f.condition = f.condition - b8; if (f.condition < 0n) f.condition = 0n;   // condition 减去同一个 b
  f.lot = null;                                                              // 未完一笔置空
  let heat = 0n; for (const [k, kg] of burned) heat += kg * W.M[k].fire;
  return { kind: 'burn', detail: null, burned, heat, b8 };                   // 燃烧不交明细
}
function v19Damage(S, dc) { const f = S.f; f.condition = f.condition - dc; if (f.condition < 0n) f.condition = 0n; return { kind: 'damage', detail: null }; }
// 损毁、承载物终止：可回收 = materialKg × salvageFraction（截断一次）；拆除：× demolishShare × salvageFraction（G4 精确积，末尾截断一次）
function endInto(f, W, det, ds) {
  for (const k of [...f.materialKg.keys()].sort(byCode)) {
    const m = f.materialKg.get(k);
    const salv = ds === null ? m * W.M[k].sf / SC : m * ds * W.M[k].sf / (SC * SC);
    wTake(f, k, salv, det); wLose(f, k, m - salv, det);
  }
}
function v19End(S, kind, cause, ds) { const det = newDetail(S.f, cause); endInto(S.f, S.W, det, ds); S.f.terminated = true; return { kind, detail: detailOut(det) }; }
const v19Collapse = S => v19End(S, 'collapse', 'cause_collapse', null);
const v19CarrierEnd = S => v19End(S, 'carrier', 'cause_carrier', null);       // 十九 §4.10 规则 8"墙料进实物账"：算式同损毁
const v19Demolish = S => v19End(S, 'demolish', 'cause_demolish', S.W.rules.demolishShare);
// 原地翻修（十九 §4.4 规则 3 四步，房间行不在本脚本范围）
function v19Rebuild(S, plan) {
  if (!enough(S, S.ctx.supply, planMass(S.W, plan))) return { rejected: 'insufficient' };
  const det = newDetail(S.f, 'cause_rebuild');
  endInto(S.f, S.W, det, S.W.rules.demolishShare);                          // ① 旧料照拆除
  S.f.lot = null; S.f.rem = 0;                                               // ② G2：repairLot 置空、余数置 0、累计体积不动
  v19Build(S.f, S.W, plan, det); S.f.condition = SC8;                        // ③ 新料与新形制（第十三版 A：设计体积照建成同法写 E）
  return { kind: 'rebuild', detail: detailOut(det), plan };
}

// ---------- 卷六账本（六 §4.1 规则 5：按明细的事由代号分情形记） ----------
function newLedger() { return { bal: new Map(), asset: new Map() }; }
function lbal(L, a, k) { return L.bal.get(a)?.get(k) ?? 0n; }
function ladd(L, a, k, d) { if (!L.bal.has(a)) L.bal.set(a, new Map()); const m = L.bal.get(a); const v = (m.get(k) ?? 0n) + d; if (v < 0n) throw new Error(`账户 ${a} 的 ${k} 为负`); m.set(k, v); }
const claimKey = ctx => 'claim:' + ctx.fac;                                  // 未物化建筑份额（resfam_claim 一行）
const holdersOf = am => [...(am ?? new Map())].filter(([, bp]) => bp > 0n).map(([acct, bp]) => ({ acct, bp }));
const srcAcctOf = (ctx, cause) => (cause === 'cause_materialize' ? ctx.agg : ctx.supply);
// "取出的料记入"记给谁：换料→出资方按出资比例；拆除与翻修→处置前的份额持有人；损毁与承载物终止→后继
function takenTo(cause, taken, ctx, preHolders) {
  if (cause === 'cause_repair') return splitById(taken, ctx.funders);
  if (cause === 'cause_demolish' || cause === 'cause_rebuild') return splitById(taken, preHolders);
  if (cause === 'cause_collapse' || cause === 'cause_carrier') return new Map([[ctx.successor, taken]]);
  throw new Error('取出量出现在不应有取出的事由 ' + cause);
}
function vol6Post(S, res) {
  const { L, ctx } = S; const det = res.detail; const cause = det?.cause ?? null;
  const preAm = new Map(L.asset.get(ctx.fac) ?? []); const preHolders = holdersOf(preAm);
  const legs = [], assetLegs = [], claimLegs = [];
  if (det) for (const row of det.rows) {
    if (row.laidKg > 0n && cause !== 'cause_genesis') legs.push({ acct: srcAcctOf(ctx, cause), res: row.material, qty: -row.laidKg, code: 'sink_transform' });
    if (row.takenKg > 0n) for (const [acct, q] of takenTo(cause, row.takenKg, ctx, preHolders)) if (q > 0n) legs.push({ acct, res: row.material, qty: q, code: 'src_transform' });
    // lostKg 不记任何腿
  }
  const killAll = () => { for (const [a, bp] of preAm) if (bp > 0n) assetLegs.push({ acct: a, qty: -bp, code: 'sink_loss' }); };
  const giveNew = (parts, code) => { for (const [a, q] of splitById(SC, parts)) assetLegs.push({ acct: a, qty: q, code }); };
  if (cause === 'cause_genesis') giveNew(ctx.funders, 'src_genesis');
  else if (cause === 'cause_build') giveNew(ctx.funders, 'src_transform');
  else if (cause === 'cause_materialize') { claimLegs.push({ acct: ctx.agg, qty: -SC, code: 'sink_transform' }); giveNew([{ acct: ctx.owner, bp: SC }], 'src_transform'); }
  else if (cause === 'cause_demolish' || cause === 'cause_collapse' || cause === 'cause_carrier') killAll();
  else if (cause === 'cause_rebuild') { killAll(); giveNew(ctx.rebuildFunders, 'src_transform'); }
  for (const l of legs) ladd(L, l.acct, l.res, l.qty);
  for (const l of claimLegs) ladd(L, l.acct, claimKey(ctx), l.qty);
  const am = L.asset.get(ctx.fac) ?? new Map(); for (const l of assetLegs) am.set(l.acct, (am.get(l.acct) ?? 0n) + l.qty); L.asset.set(ctx.fac, am);
  return { legs, assetLegs, claimLegs };
}

// ---------- 事务与断言 ----------
function A(S, cond, msg) { if (!cond) { S.ok = false; if (S.msgs.length < 4) S.msgs.push(msg); } }
function txn(S, body) {
  const preF = structuredClone(S.f), preL = structuredClone(S.L);
  let res;
  try {
    res = body();
    if (res.rejected || res.noop) {                                          // 整笔不成：行上与账本逐位不动
      A(S, ser(preF) === ser(S.f) && ser(preL) === ser(S.L), `拒绝后状态被改(${res.rejected ?? 'noop'})`);
      return res;
    }
    res.posted = vol6Post(S, res);                                           // 同一事务
  } catch (e) {
    S.f = preF; S.L = preL; A(S, false, `事务异常 ${e.message}`); return { rejected: 'exception' };
  }
  checkTxn(S, preF, preL, res);
  return res;
}
const Z = { laid: 0n, taken: 0n, lost: 0n };
function expectFlows(S, preF, res) {                                         // 由正文算式从事务前状态独立重算的三项加记
  const W = S.W, e = new Map(); const g = k => { if (!e.has(k)) e.set(k, { laid: 0n, taken: 0n, lost: 0n }); return e.get(k); };
  const dem = ds => { for (const [k, m] of preF.materialKg) { const s = ds === null ? m * W.M[k].sf / SC : m * ds * W.M[k].sf / (SC * SC); g(k).taken += s; g(k).lost += m - s; } };
  const build = plan => { for (const it of plan.items) g(it.mat).laid += it.kg; };
  const k_ = res.kind;
  if (k_ === 'genesis' || k_ === 'build' || k_ === 'materialize') build(res.plan);
  else if (k_ === 'extend') { for (const it of res.items) g(it.mat).laid += it.kg; }
  else if (k_ === 'rebuild') { dem(W.rules.demolishShare); build(res.plan); }
  else if (k_ === 'demolish') dem(W.rules.demolishShare);
  else if (k_ === 'collapse' || k_ === 'carrier') dem(null);
  else if (k_ === 'burn') { for (const [k, m] of preF.materialKg) if (m > 0n && W.M[k].fire > 0n) g(k).lost += m * res.b8 / SC8; }
  else if (k_ === 'repair') {
    const { fillL, replL, cumR, plan } = res.audit;
    const salvOf = k => (preF.lot ? preF.lot.salvage.get(k) : W.M[k].sf);   // N5：一笔之内用事务前已存的比例；本次才开笔则取此刻的有效值（独立于脚本被测路径重算）
    fillL.forEach((L, i) => { g(plan.fillChoice[i]).laid += BigInt(L) * W.M[plan.fillChoice[i]].dens; });
    for (const [k, L] of replL) {
      const dens = W.M[k].dens, sf = salvOf(k), [cb, ca] = cumR.get(k);
      const out = BigInt(L) * dens, s = BigInt(ca) * dens * sf / SC - BigInt(cb) * dens * sf / SC;
      g(k).taken += s; g(k).lost += out - s; g(plan.replChoice[k]).laid += BigInt(L) * W.M[plan.replChoice[k]].dens;
    }
  }
  return e;
}
const ENDS = new Set(['demolish', 'collapse', 'carrier']);
const BUILDS = new Set(['genesis', 'build', 'materialize', 'rebuild']);
function checkTxn(S, preF, preL, res) {
  const f = S.f, W = S.W, ctx = S.ctx, cause = res.detail?.cause ?? null;
  const keys = new Set([...preF.materialKg.keys(), ...f.materialKg.keys(), ...preF.wallFlow.keys(), ...f.wallFlow.keys()]);
  const exp = expectFlows(S, preF, res);
  const rowOf = k => res.detail?.rows.find(r => r.material === k);
  const preHolders = holdersOf(preL.asset.get(ctx.fac));
  const recips = new Set([...ctx.funders.map(p => p.acct), ...ctx.rebuildFunders.map(p => p.acct), ctx.successor, ctx.owner, ...preHolders.map(p => p.acct)]);
  const src = srcAcctOf(ctx, cause), other = src === ctx.agg ? ctx.supply : ctx.agg;
  const dBal = (a, k) => lbal(S.L, a, k) - lbal(preL, a, k);
  for (const k of keys) {
    const fl = f.wallFlow.get(k) ?? Z, pf = preF.wallFlow.get(k) ?? Z;
    const m = f.materialKg.get(k) ?? 0n, pm = preF.materialKg.get(k) ?? 0n;
    A(S, fl.laid - fl.taken - fl.lost === m, `守恒式不成立 ${res.kind} ${k}`);                  // 十九 §4.1 规则 11
    A(S, m >= 0n, `materialKg 为负 ${res.kind} ${k}`);
    A(S, fl.laid >= pf.laid && fl.taken >= pf.taken && fl.lost >= pf.lost, `三项累计减少 ${k}`);
    const d = { laid: fl.laid - pf.laid, taken: fl.taken - pf.taken, lost: fl.lost - pf.lost };
    A(S, m === pm || d.laid + d.taken + d.lost > 0n, `materialKg 改动而 wallFlowKg 未加记 ${k}`);
    const ex = exp.get(k) ?? Z;
    A(S, d.laid === ex.laid && d.taken === ex.taken && d.lost === ex.lost, `加记量与正文算式不符 ${res.kind} ${k}`);
    if (res.detail) { const r = rowOf(k) ?? { laidKg: 0n, takenKg: 0n, lostKg: 0n };
      A(S, r.laidKg === d.laid && r.takenKg === d.taken && r.lostKg === d.lost, `明细与三项累计加记不等 ${res.kind} ${k}`); }
    else A(S, d.laid === 0n && d.taken === 0n, `无明细事务出现砌入/取出 ${res.kind} ${k}`);
    // 卷六腿与明细逐料逐位相等（六 A6-1.2）
    const legs = res.posted.legs.filter(l => l.res === k);
    const outQ = -legs.filter(l => l.code === 'sink_transform').reduce((a, l) => a + l.qty, 0n);
    const inQ = legs.filter(l => l.code === 'src_transform').reduce((a, l) => a + l.qty, 0n);
    const r = rowOf(k);
    A(S, outQ === (r && cause !== 'cause_genesis' ? r.laidKg : 0n), `卷六出账 ≠ 明细 laidKg ${res.kind} ${k}`);
    A(S, inQ === (r ? r.takenKg : 0n), `卷六入账 ≠ 明细 takenKg ${res.kind} ${k}`);
    A(S, legs.every(l => l.code === 'sink_transform' || l.code === 'src_transform'), `出现损失腿 ${k}`);
    // 账户余额的实际变动（独立于腿列表）
    A(S, dBal(src, k) === -(cause === 'cause_genesis' ? 0n : d.laid) && dBal(other, k) === 0n, `出料账户变动 ≠ 砌入 ${res.kind} ${k}`);
    A(S, dBal(ctx.aggFree, k) === 0n, `聚合账户可花分区被建筑事务动了 ${res.kind} ${k}`);                  // N7：物化只从专用分区记出
    let em = new Map(); if (d.taken > 0n) { try { em = takenTo(cause, d.taken, ctx, preHolders); } catch { A(S, false, `不应有取出的事由出现取出 ${res.kind}`); } }
    let dIn = 0n;
    for (const a of recips) { dIn += dBal(a, k); A(S, dBal(a, k) === (em.get(a) ?? 0n), `散料收款人或分法不符 ${res.kind} ${a} ${k}`); }   // G8
    A(S, dIn === d.taken, `散料入账 ≠ 取出 ${res.kind} ${k}`);
    if (ENDS.has(res.kind)) A(S, d.taken + d.lost === pm && m === 0n, `终止事务取出+损失 ≠ 事务开始时 materialKg ${k}`);
    if (res.kind === 'rebuild') A(S, d.taken + d.lost === pm, `翻修旧料未恰分进取出与损失 ${k}`);
  }
  if (f.terminated) A(S, [...f.materialKg.values()].every(v => v === 0n), '已终止行 materialKg 非 0');
  // G6：material 视图
  const mv = materialView(f), tot = [...f.materialKg.values()].reduce((a, b) => a + b, 0n);
  A(S, tot === 0n ? mv.size === 0 : [...mv.values()].reduce((a, b) => a + b, 0n) === SC && [...mv.keys()].every(k => f.materialKg.get(k) > 0n) && [...mv.values()].every(v => v >= 0n), 'material 份额和不为 1 或含零值键');
  if (res.kind === 'burn') {
    const sumPre = [...preF.materialKg.values()].reduce((a, b) => a + b, 0n), sumPost = tot;
    let sb = 0n, heat = 0n; for (const [k, kg] of res.burned) { sb += kg; heat += kg * W.M[k].fire; }
    A(S, sumPre - sumPost === sb && heat === res.heat, '燃烧减少量/放热不符');
    const ec = preF.condition - res.b8; A(S, f.condition === (ec < 0n ? 0n : ec), '燃烧 condition 减量 ≠ b（10^8 标度同一个值）');   // G5
    A(S, f.lot === null, '燃烧后 repairLot 未置空');
    A(S, f.rem === preF.rem && f.repairedVolumeL === preF.repairedVolumeL, '燃烧改动了余数或累计体积');
    A(S, res.posted.legs.length === 0 && res.posted.assetLegs.length === 0, '燃烧记了卷六腿');
  }
  if (BUILDS.has(res.kind)) {                                                                    // 第十三版 A：建成锚（开局、运行期、物化、原地翻修同判）
    const E = E_ref(f, W);
    A(S, BigInt(f.envelopeVolumeL) === E && E >= 1n, `${res.kind}：envelopeVolumeL ${f.envelopeVolumeL} ≠ 建成那一刻的现存升数 E ${E}（第十三版 A）`);
    A(S, (BigInt(f.envelopeVolumeL) > E ? BigInt(f.envelopeVolumeL) - E : 0n) === 0n, `${res.kind}：建成后待补升数不为 0（第十三版 A）`);
    if (!wholeLiters(f, W)) COV.nonIntBuild++;
  }
  if (res.kind === 'extend') {                                                                   // 新 3、A19-4.2
    const dE = res.items.length ? E_ref(f, W) - E_ref(preF, W) : 0n;
    A(S, BigInt(f.envelopeVolumeL - preF.envelopeVolumeL) === dE, '扩建：envelopeVolumeL 增加量 ≠ 现存升数之差 E_后 − E_前（新 3）');
    const owe = (V, E) => (V > E ? V - E : 0n);
    A(S, owe(BigInt(f.envelopeVolumeL), E_ref(f, W)) === owe(BigInt(preF.envelopeVolumeL), E_ref(preF, W)), '扩建前后待补升数 max(0, V − E) 变了（新 3）');
  }
  else if (!BUILDS.has(res.kind)) A(S, f.envelopeVolumeL === preF.envelopeVolumeL, 'envelopeVolumeL 被改');
  if (res.kind === 'extend') A(S, f.condition === preF.condition && (res.detail !== null || ser(f) === ser(preF)), '扩建改了 condition，或没有砌料却改了行');
  if (res.kind === 'rebuild') {                                                                  // G2、十九 §4.4 规则 3
    A(S, f.id === preF.id && !f.terminated, '翻修后行 id 变或终止');
    A(S, f.lot === null && f.rem === 0 && f.repairedVolumeL === preF.repairedVolumeL, '翻修未置空 repairLot / 余数未置 0 / 累计体积被改');
    A(S, f.condition === SC8 && BigInt(f.envelopeVolumeL) === E_ref(f, W), '翻修未按新形制写入（condition 或设计体积 ≠ 新料的现存升数 E）');
  }
  if (res.kind === 'repair') {
    const { fillL, replL, cumR, dL } = res.audit; let s = 0;
    fillL.forEach(x => { s += x; A(S, x >= 0, '补缺升数为负'); });
    for (const [k, x] of replL) { s += x; A(S, x >= 0, '换出升数为负'); const [cb, ca] = cumR.get(k); A(S, ca - cb === x, '累计换出升数与本次不符'); }
    A(S, s === dL, '各项升数之和 ≠ ΔL');
    A(S, f.rem >= 0 && f.rem < W.rules.minutesPerM3, '余数越界');
    if (res.completed) A(S, f.rem === 0 && f.lot === null, '一笔做完余数未置 0 或未收笔');                          // G3
  }
  if (f.lot) { let qs = 0; for (const [, q] of f.lot.quotaL) qs += q; A(S, qs === f.lot.replaceL && f.lot.doneL <= f.lot.fillL + f.lot.replaceL, '配额和/进度越界'); }
  // 资产分录（六 §4.1 规则 5、A6-1.2）
  const am = S.L.asset.get(ctx.fac) ?? new Map(); const at = [...am.values()].reduce((a, b) => a + b, 0n);
  A(S, at === (f.terminated ? 0n : SC), `资产份额和 ${at}`);
  const aL = res.posted.assetLegs;
  const gen = aL.filter(l => l.code === 'src_genesis').length;
  A(S, cause === 'cause_genesis' ? gen > 0 : gen === 0, 'src_genesis 出现在开局之外');
  if (!res.detail || cause === 'cause_repair' || cause === 'cause_extend') A(S, aL.length === 0, `${res.kind} 记了资产分录`);
  if (ENDS.has(res.kind)) A(S, aL.every(l => l.code === 'sink_loss') && -aL.reduce((a, l) => a + l.qty, 0n) === SC, '终止资产未经 sink_loss 记出一万基点');
  if (cause === 'cause_rebuild') {
    const out = -aL.filter(l => l.code === 'sink_loss').reduce((a, l) => a + l.qty, 0n), inn = aL.filter(l => l.code === 'src_transform').reduce((a, l) => a + l.qty, 0n);
    A(S, out === SC && inn === SC && ser(holdersOf(am).sort((a, b) => byCode(a.acct, b.acct)).map(h => [h.acct, h.bp])) === ser([...splitById(SC, ctx.rebuildFunders)].filter(([, q]) => q > 0n).sort((a, b) => byCode(a[0], b[0]))), '翻修资产分录不是旧出一万、新入一万给出资方');
  }
  if (cause === 'cause_materialize') {
    A(S, lbal(S.L, ctx.agg, claimKey(ctx)) - lbal(preL, ctx.agg, claimKey(ctx)) === -SC && am.get(ctx.owner) === SC, '物化未把未物化份额一万基点转换成实例份额');
  }
}

// ---------- 场景搭建 ----------
// N7：用途分区（六 §2.2 purpose 族）。账户键 = 持有人|用途；统计层的生产与家户只能从 spendable 为真的分区取
const PURPOSE = { purpose_unmaterialized: { spendable: false, visibleToMarket: false }, purpose_free: { spendable: true, visibleToMarket: true } };
function statSpend(L, acct, k, kg) {                                         // 统计层取料（六 §4.7 规则 12、§4.12）：不可花分区一律拒绝，不改余额
  const p = PURPOSE[acct.split('|')[1]];
  if (!p || !p.spendable) return false;
  if (lbal(L, acct, k) < kg) return false;
  ladd(L, acct, k, -kg); return true;
}
function randomParts(r, prefix) { const n = ri(r, 1, 3); const sh = randShares(r, n); return sh.map((bp, i) => ({ acct: `${prefix}${ri(r, 10, 99)}_${i}`, bp })); }
function setup(r, W, mode) {
  const f = newFacility('fac_' + ri(r, 1, 999999));
  const L = newLedger();
  const ctx = { fac: f.id, supply: 'acct_stock', agg: 'acct_agg|purpose_unmaterialized', aggFree: 'acct_agg|purpose_free', owner: 'acct_owner', successor: 'acct_heir', funders: randomParts(r, 'acct_f'), rebuildFunders: randomParts(r, 'acct_g') };
  for (const c of W.codes) ladd(L, 'acct_stock', c, 10n ** 15n);           // 备料账户（初始余额，不是腿）
  const S = { f, L, W, ctx, ok: true, msgs: [] };
  const plan = planBuild(r, W);
  if (mode === 'materialize') {                                              // 第 0 日：聚合账户的 purpose_unmaterialized 分区预置墙料与未物化份额（六 §4.1 规则 5"物化建行"，N7）
    for (const [k, kg] of planMass(W, plan)) ladd(L, ctx.agg, k, kg);
    ladd(L, ctx.agg, claimKey(ctx), SC);
    for (const c of W.codes) ladd(L, ctx.aggFree, c, rb(r, 0, 3000000));     // 阶层同种财物在可花分区，与预置不混
    // 物化之前统计层把可花分区的同种料全部用掉，并试图动专用分区：后者一律被拒、余额不动
    const preAgg = ser(L.bal.get(ctx.agg));
    for (const c of W.codes) A(S, statSpend(L, ctx.aggFree, c, lbal(L, ctx.aggFree, c)), '统计层不能动可花分区');
    for (const c of W.codes) if (lbal(L, ctx.agg, c) > 0n) A(S, !statSpend(L, ctx.agg, c, 1n), '统计层动了不可花的 purpose_unmaterialized 分区');
    A(S, ser(L.bal.get(ctx.agg)) === preAgg, '统计层改了预置分区余额');
    txn(S, () => v19Materialize(S, plan));
  } else txn(S, () => (mode === 'genesis' ? v19Genesis(S, plan) : v19BuildRuntime(S, plan)));
  return S;
}
const anyMode = r => { const x = r(); return x < 0.34 ? 'genesis' : x < 0.67 ? 'build' : 'materialize'; };
function cloneState(S, r) {                                                  // 打乱 Map 插入次序，检验结果不依赖遍历次序
  const f = structuredClone(S.f), L = structuredClone(S.L);
  if (r) { f.materialKg = new Map(shuffle(r, [...f.materialKg])); f.wallFlow = new Map(shuffle(r, [...f.wallFlow])); }
  return { f, L, W: S.W, ctx: structuredClone(S.ctx), ok: true, msgs: [] };
}
function absorb(S, C) { if (!C.ok) { S.ok = false; S.msgs.push(...C.msgs); } }
function randomSplit(r, total, maxParts) {
  const n = Math.max(1, Math.min(total, ri(r, 1, maxParts)));
  const cuts = new Set(); while (cuts.size < n - 1) cuts.add(ri(r, 1, total - 1));
  const c = [0, ...[...cuts].sort((a, b) => a - b), total]; return c.slice(1).map((v, i) => v - c[i]);
}
function randomPlan(r, W) { return { fillChoice: W.envReq.map(() => pick(r, W.codes)), replChoice: Object.fromEntries(W.codes.map(c => [c, r() < 0.4 ? c : pick(r, W.codes)])) }; }
// 一笔修缮按给定切分逐次提交；做满即停（多出的分钟由入口退回）
// drift 为真时（N5"一笔内比例变化"数据组）：每次提交之后随机改各料 salvageFraction 的有效值（模拟材料修正项变化），一笔之内结果不得受影响
function runSplit(S, parts, plan, lot0, r = null, drift = false) {
  const cumOut = new Map(), cumTaken = new Map(); const cumFill = []; let done = false; S.accepted = 0;
  for (const m of parts) {
    if (done) break;
    const res = txn(S, () => v19Repair(S, m, plan));
    if (drift && r) for (const k of Object.keys(S.W.M)) if (r() < 0.5) S.W.M[k].sf = rb(r, 0, 10000);
    if (res.kind !== 'repair') continue;
    S.accepted += m - res.returned;
    for (const [k, L] of res.audit.replL) cumOut.set(k, (cumOut.get(k) ?? 0) + L);
    for (const row of res.detail.rows) if (row.takenKg > 0n) cumTaken.set(row.material, (cumTaken.get(row.material) ?? 0n) + row.takenKg);
    for (const [k, L] of cumOut) A(S, (cumTaken.get(k) ?? 0n) === BigInt(L) * S.W.M[k].dens * lot0.salvage.get(k) / SC, `累计取出 ≠ floor(累计换出质量 × repairLot.salvage[k]) ${k}`);   // G1、N5、A19-1.2
    res.audit.fillL.forEach((L, i) => { cumFill[i] = (cumFill[i] ?? 0) + L; });
    if (S.f.lot) A(S, ser(S.f.lot.quotaL) === ser(lot0.quotaL) && ser(S.f.lot.salvage) === ser(lot0.salvage) && S.f.lot.fillL === lot0.fillL && S.f.lot.replaceL === lot0.replaceL, '一笔之内配额或 salvage 被改');
    if (res.completed) {
      done = true;
      for (const [k, q] of lot0.quotaL) A(S, (cumOut.get(k) ?? 0) === q, `做满时换出升数 ≠ quotaL ${k}`);
      const fq = splitLast(lot0.fillL, S.W.envReq.map(e => e.v)); fq.forEach((q, i) => A(S, (cumFill[i] ?? 0) === q, '做满时补缺升数 ≠ f_i'));
    }
  }
  return done;
}
const sortedFlow = f => [...f.wallFlow].sort((a, b) => byCode(a[0], b[0]));
function fundTotals(S) { const t = new Map(); for (const p of S.ctx.funders) for (const [k, v] of S.L.bal.get(p.acct) ?? []) t.set(k, (t.get(k) ?? 0n) + v); return t; }
// 切片不变（十九 A19-1.2、二 §3.3）：取出、损失、出资方入账总量与收下的分钟数第十版起一并须逐位相同（G1、G3）
function coreSer(S) { return ser({ m: S.f.materialKg, flow: sortedFlow(S.f), rv: S.f.repairedVolumeL, rem: S.f.rem, lot: S.f.lot, sup: S.L.bal.get(S.ctx.supply), fund: fundTotals(S), acc: S.accepted }); }
function burnDays(S, r, n) { for (let i = 0; i < n && !S.f.terminated; i++) { const b8 = r() < 0.2 ? 0n : rb(r, 1, 30000000); txn(S, () => v19Burn(S, b8)); } }
function maybeRepair(S, r, maxMin) { S.f.condition = rb(r, 0, 90000000); return txn(S, () => v19Repair(S, ri(r, 1, maxMin), randomPlan(r, S.W))); }
// 烧掉一部分料再只做补缺、修到没有待办；断言现存升数不小于锚、总质量与锚时之差在 1 升料之内（十九 A19-1.2、A19-4.2；单料、同料补）
function burnAndRefill(S, r, m, massAnchor, label) {
  const W = S.W, Vanchor = S.f.envelopeVolumeL;
  txn(S, () => v19Burn(S, rb(r, 1, 60000000)));
  S.f.condition = SC8;                                                      // 只看补缺（换料在单料、同料时不改质量）
  const plan = { fillChoice: [m], replChoice: { [m]: m } };
  let n = 0; for (; n < 60; n++) { const res = txn(S, () => v19Repair(S, 10 ** 7, plan)); if (res.noop || res.rejected) break; }
  A(S, n < 60, `${label}补缺修不到没有待办`);
  A(S, S.f.envelopeVolumeL === Vanchor, `${label}补缺改了设计体积`);
  A(S, E_L(S.f, W) >= BigInt(Vanchor) && E_ref(S.f, W) === BigInt(Vanchor), `${label}补缺：现存升数没有回到设计体积（A19-1.2）`);
  const now = S.f.materialKg.get(m) ?? 0n, diff = massAnchor > now ? massAnchor - now : now - massAnchor;
  A(S, diff <= W.M[m].dens, `${label}烧掉再修到没有待办，总质量与锚时之差 ${diff} 超过 1 升料 ${W.M[m].dens}（A19-4.2）`);
}

// ---------- 工位占用逐条记录（十九 §4.3 规则 4、A19-3.2） ----------
const clip = (from, to, D) => { const a = Math.max(from, D * DAY), b = Math.min(to, (D + 1) * DAY); return b > a ? b - a : 0; };
function makeStationWorld(r) {
  const kinds = ['fk_a', 'fk_b', 'fk_c'];
  const fixtures = [...Array(ri(r, 1, 4))].map((_, i) => ({ id: `fx_${i}`, kind: pick(r, kinds), slots: ri(r, 1, 3) }));
  const days = ri(r, 4, 12), W = ri(r, 1, 5), maxRows = ri(r, 1, 12);
  const edges = []; let n = 0;
  for (const fx of fixtures) for (let s = 0; s < fx.slots; s++) {            // 每席一条时间线：未到期占用边数不超过席数
    let t = ri(r, 0, 600);
    while (t < days * DAY) {
      const dur = ri(r, 5, r() < 0.15 ? 3 * DAY : 600), expiry = t + dur, to = r() < 0.3 ? t + ri(r, 1, dur) : expiry;   // 提前释放或到期
      edges.push({ id: n, fixture: fx.id, kind: fx.kind, holder: `p_${fx.id}_${s}_${n}`, from: t, expiry, to }); n++;
      t = to + ri(r, 0, 400);
    }
  }
  return { kinds, fixtures, days, W, maxRows, edges };
}
function stationEvents(SW) {
  const ev = [];
  for (const e of SW.edges) { ev.push({ t: e.from, type: 1, e }); ev.push({ t: e.to, type: 0, e }); }
  return ev.sort((a, b) => a.t - b.t || a.type - b.type || a.e.id - b.e.id);  // 同一分钟先结束后开始
}
const rowKey = x => `${x.fixture}|${x.holder}|${x.fromMinute}|${x.toMinute}`;
function occupancyRows(st) {                                                 // 读视图 occupancy.rows：还占着的 + stationLog 已结束的
  const rows = [...[...st.open.values()].map(e => ({ fixture: e.fixture, kind: e.kind, holder: e.holder, fromMinute: e.from, toMinute: e.expiry, open: true })),
                ...st.log.map(x => ({ ...x, open: false }))];
  return rows.sort((a, b) => a.toMinute - b.toMinute || byCode(a.fixture, b.fixture) || byCode(a.holder, b.holder));
}
function dayKind(st, D, kind) {
  let s = 0;
  for (const x of occupancyRows(st)) if (x.kind === kind) s += clip(x.fromMinute, x.toMinute, D);
  return s + (st.fold.daily.get(D)?.get(kind) ?? 0);
}
function stationRun(SW, A_, deferDay = -1, deferBy = 0) {
  const st = { open: new Map(), log: [], fold: { daily: new Map() }, ended: [], folded: 0, cov: { ret: 0, rows: 0 } };   // N4：stationFold 只有 daily
  const ev = stationEvents(SW); let i = 0; const minutesOf = {};
  const upto = t => { while (i < ev.length && ev[i].t <= t) {
    const { type, e } = ev[i++];
    if (type === 1) { st.open.set(e.id, e); continue; }
    st.open.delete(e.id); st.ended.push(e);
    st.log.push({ fixture: e.fixture, kind: e.kind, holder: e.holder, fromMinute: e.from, toMinute: e.to });   // 释放或到期的同一事务追加一条
    const hit = occupancyRows(st).filter(x => x.fixture === e.fixture && x.holder === e.holder);            // 已结束占用可查：工位、占用者、起止
    A_(hit.length === 1 && !hit[0].open && hit[0].kind === e.kind && hit[0].fromMinute === e.from && hit[0].toMinute === e.to
       && Math.floor(hit[0].fromMinute / DAY) === Math.floor(e.from / DAY) && Math.floor((hit[0].toMinute - 1) / DAY) === Math.floor((e.to - 1) / DAY), `释放后 stationLog 查不到 ${e.holder}`);
  } };
  const settle = D => {
    const mins = {}; for (const k of SW.kinds) mins[k] = dayKind(st, D, k);
    for (const k of SW.kinds) {                                               // 等于全部占用边落在该日内的分钟数，不超过席数 × 当日分钟
      const truth = SW.edges.filter(e => e.kind === k).reduce((a, e) => a + clip(e.from, e.to, D), 0);
      const cap = SW.fixtures.filter(x => x.kind === k).reduce((a, x) => a + x.slots, 0) * DAY;
      A_(mins[k] === truth && mins[k] <= cap, `第 ${D} 日 ${k} 占用分钟 ${mins[k]} ≠ 占用边 ${truth}`);
    }
    const snap = () => { const o = {}; for (let d = 0; d <= D; d++) for (const k of SW.kinds) o[`${d}|${k}`] = dayKind(st, d, k); return o; };
    const before = snap(), ws = D - SW.W + 1;
    st.log = st.log.filter(x => { if (Math.floor((x.toMinute - 1) / DAY) < ws) { st.folded++; st.cov.ret++; return false; } return true; });   // ① 保留期：直接删去，不留总数（N4）
    for (const d of [...st.fold.daily.keys()]) if (d < ws) st.fold.daily.delete(d);
    st.log.sort((a, b) => a.toMinute - b.toMinute || byCode(a.fixture, b.fixture) || byCode(a.holder, b.holder));
    while (st.log.length > SW.maxRows) {                                      // ② 条数上限：从最早的折成按日按类
      const x = st.log.shift(); st.folded++; st.cov.rows++;
      for (let d = Math.floor(x.fromMinute / DAY); d * DAY < x.toMinute; d++) {
        if (d < ws) continue;                                                 // 新 4：只把保留期内各日加进 daily，保留期之前的直接丢
        const v = clip(x.fromMinute, x.toMinute, d); if (!v) continue;
        if (!st.fold.daily.has(d)) st.fold.daily.set(d, new Map());
        const mk = st.fold.daily.get(d); mk.set(x.kind, (mk.get(x.kind) ?? 0) + v);
      }
    }
    const after = snap();
    for (let d = Math.max(ws, 0); d <= D; d++) for (const k of SW.kinds) A_(before[`${d}|${k}`] === after[`${d}|${k}`], `折叠前后第 ${d} 日 ${k} 分钟变了`);   // 折叠不变
    A_(st.log.length <= SW.maxRows && st.log.every(x => Math.floor((x.toMinute - 1) / DAY) >= ws), '日结后条数超上限或留有保留期外的条');
    // N4：原"记录、daily、olderMinutes 之和 = 有史以来全部已结束占用分钟"一条随字段删去；改为 A19-3.2 现行的"daily 里没有早于保留期的日、stationFold 只有 daily"
    A_([...st.fold.daily.keys()].every(d => d >= ws) && Object.keys(st.fold).length === 1, 'daily 留有保留期外的日，或 stationFold 不止 daily 一个字段');
    const endedKeys = new Set(st.ended.map(e => rowKey({ fixture: e.fixture, holder: e.holder, fromMinute: e.from, toMinute: e.to })));
    A_(st.log.length + st.folded === st.ended.length && st.log.every(x => endedKeys.has(rowKey(x))), '每条已结束占用不是恰记一条');
    minutesOf[D] = mins;
  };
  for (let D = 0; D < SW.days; D++) {
    if (D === deferDay) { upto((D + 1) * DAY + deferBy); settle(D); continue; }   // 补结：第 D 日的日结推迟到第 D+1 日若干事件之后
    upto((D + 1) * DAY); settle(D);
  }
  return { minutesOf, st };
}

// ---------- 房间行面积写权（第十三版 B：五 §3.3 单项登记名单 created.*.props.areaM2 一行；十九 §4.4 规则 3 ④、A19-10.2） ----------
// 卷二的写权只按登记判：写者是登记的改写写者，且行在登记的行范围内（第十四版：inside: [comp_facility]，即在挂 comp_facility 的行之内）；卷二不判事务（没有限事务的写权机制）。
// "只在翻修事务内写"是 construction.mjs 的代码路径约束：写房间行 areaM2 的调用点只有建行函数（建行事务）与翻修一步（翻修事务）两处，按调用点计数查。
// 第十四版（李白对 审查/卷六重拆-改后核对2.md 裁定 ①）：行范围只写 inside: [comp_facility]（卷二 rewriteRows 各条件"任一满足"，并写 withComponent: [comp_zone] 会圈进聚落分区），不再带 withComponent
const AREA_REG = { path: 'created.*.props.areaM2', writer: 'construction.mjs', inside: 'comp_facility' };
const REBUILD_CAUSE = 'cause_rebuild';                                       // 卷十九登记的原地翻修原因代号（relocate 的 relocatableIn 用；面积写权不带事由）
const BUILD_CAUSES = ['cause_genesis', 'cause_build', 'cause_materialize'];  // 建行事务
const AREA_SITES_ALLOWED = { buildRow: c => BUILD_CAUSES.includes(c), rebuildRooms: c => c === REBUILD_CAUSE };
const POSITION_KEYS = new Set(['x', 'y']);
const inAreaScope = row => row.insideOf.includes(AREA_REG.inside);           // 建筑之内的行；聚落分区（不在 comp_facility 之内）在范围外
if (Object.hasOwn(AREA_REG, 'withComponent')) throw new Error('AREA_REG 不得带 withComponent（第十四版行范围只写 inside）');
function kernelWriteArea(row, value, writer) {                               // 卷二写权：登记的写者 + 行范围；不合的一律拒绝，不改行
  if (writer !== AREA_REG.writer) return { rejected: 'E-NOT-REGISTERED-WRITER' };
  if (!inAreaScope(row)) return { rejected: 'E-OUT-OF-ROW-SCOPE' };
  if (!Number.isInteger(value) || value < 0) return { rejected: 'area-not-integer' };
  row.areaM2 = value; return { ok: true };
}
// 调用点插桩（调用图计数的运行时对应）：每次面积写入记下写者、调用点、所在事务的事由
function areaWrite(row, value, writer, site, tx, trace) {
  const res = kernelWriteArea(row, value, writer);
  if (res.ok) trace.push({ writer, site, cause: tx?.cause ?? null, row: row.id });
  return res;
}
// 代码路径约束的判定：每一次面积写入都出自登记写者、出自允许的两处调用点之一、且在该调用点对应的事务里
const areaTraceOk = trace => trace.every(t => t.writer === AREA_REG.writer && Object.hasOwn(AREA_SITES_ALLOWED, t.site) && AREA_SITES_ALLOWED[t.site](t.cause));
function relocateZone(zone, row, tx, caller) {                               // 位置通道（卷二㉒）：原因代号是翻修、调用者是 construction.mjs；placement.rows 只许位置量
  if (!tx || tx.cause !== REBUILD_CAUSE || caller !== AREA_REG.writer || !zone.comps.includes('comp_zone')) return { rejected: 'E-RELOC-TARGET' };
  if (Object.keys(row).some(k => !POSITION_KEYS.has(k))) return { rejected: 'placement-not-position' };
  Object.assign(zone.pos, row); return { ok: true };
}
// construction.mjs 的模型：写房间行面积的只有 buildRow 与 rebuildRooms；扩建、修缮、拆除路径不写
// 第十五版：嵌套设施树（Z_.rows 为 place 行表）。行上 insideOf 由建树时沿 parent 链取得（卷二判行范围用）；断言另沿 parent 链独立走查。
const isRoomRow = x => x.comps.includes('comp_zone') && !x.comps.includes('comp_facility');
const kidsOf = (rows, id) => [...rows.values()].filter(x => x.parent === id).sort((a, b) => byCode(a.id, b.id));
function chainHasFacility(rows, id) { let p = rows.get(id).parent; while (p) { const x = rows.get(p); if (x.comps.includes('comp_facility')) return true; p = x.parent; } return false; }
function isDescendant(rows, id, host) { let p = rows.get(id).parent; while (p) { if (p === host) return true; p = rows.get(p).parent; } return false; }
// 建筑之内各行面积的纯函数（建行与翻修同用，不写行）：宿主 H 的楼面减去地面嵌套设施的占地后按房间份额分（末项取差）；
// 地下嵌套设施的占地 = 它所在房间的面积 × 占地份额（至少 1）；嵌套设施之内照它自己的房间份额递归（它的形制不变）。bad 为真时模拟宿主一层漏扣地面附屋占地的错误布局。
function interiorLayout(rows, H, shares, bad = false) {
  const out = new Map();
  const lay = (hid, sh, hArea) => {
    const ks = kidsOf(rows, hid), rooms = ks.filter(isRoomRow), facs = ks.filter(x => x.comps.includes('comp_facility'));
    const gA = new Map(facs.filter(f => !f.underground).map(f => [f.id, Number(BigInt(hArea) * f.occ / SC)]));
    const roomTotal = hArea - (bad && hid === H ? 0 : [...gA.values()].reduce((a, b) => a + b, 0));
    const ra = splitLast(roomTotal, sh); rooms.forEach((z, i) => out.set(z.id, ra[i]));
    for (const f of facs) { const a = f.underground ? Math.max(1, Number(BigInt(ra[f.host]) * f.occ / SC)) : gA.get(f.id); out.set(f.id, a); lay(f.id, f.roomShares, a); }
  };
  lay(H, shares, rows.get(H).areaM2);
  return out;
}
// 卷五 §4.1 规则 3：同父的非地下子地点面积和不超过父地点；对宿主子树内每一行查
function areaSumOk(rows, H) {
  const sub = [H, ...[...rows.keys()].filter(id => isDescendant(rows, id, H))];
  return sub.every(id => kidsOf(rows, id).filter(k => !k.underground).reduce((a, k) => a + k.areaM2, 0) <= rows.get(id).areaM2);
}
const ConstructionMjs = {
  buildRow(tx, Z_, trace) {                                                  // 建行函数：建行事务里给新房间行落面积
    if (Z_.rows) {                                                           // 第十五版：建筑之内各行（房间与嵌套设施）落面积；最外层建筑行的占地由建行写者在建行时落初值，不经这里
      const m = interiorLayout(Z_.rows, Z_.outer, Z_.rows.get(Z_.outer).roomShares);
      return [...m].map(([id, a]) => areaWrite(Z_.rows.get(id), a, AREA_REG.writer, 'buildRow', tx, trace));
    }
    const a = splitLast(Z_.floorArea, Z_.initShares);
    return Z_.zones.map((z, i) => areaWrite(z, a[i], AREA_REG.writer, 'buildRow', tx, trace));
  },
  rebuildRooms(tx, Z_, positions, trace) {                                   // 翻修一步：位置量经 relocate，面积整值写（楼面面积 × 新份额，末项取差）
    if (Z_.rows) {                                                           // 第十五版：宿主 host 翻修，重算它之内各行（不写 host 自己）；面积和不过整笔回滚
      const { host, shares, bad } = positions, rows = Z_.rows, n0 = trace.length;
      const keep = new Map([...rows].map(([id, x]) => [id, x.areaM2]));
      const res = [...interiorLayout(rows, host, shares, bad)].map(([id, a]) => areaWrite(rows.get(id), a, AREA_REG.writer, 'rebuildRooms', tx, trace));
      if (!areaSumOk(rows, host)) { for (const [id, a] of keep) rows.get(id).areaM2 = a; trace.length = n0; return { rolledBack: true }; }
      rows.get(host).roomShares = shares;
      return { ok: res.every(x => x.ok), res };
    }
    const a = splitLast(Z_.floorArea, Z_.newShares);
    return Z_.zones.map((z, i) => ({ pos: relocateZone(z, positions[i], tx, AREA_REG.writer), area: areaWrite(z, a[i], AREA_REG.writer, 'rebuildRooms', tx, trace) }));
  },
  extendFixture(tx, Z_, trace) { return (Z_.zones ?? [...Z_.rows.keys()]).length; },   // 扩建：不写房间面积
  repairStep(tx, Z_, trace) { return (Z_.zones ?? [...Z_.rows.keys()]).length; },      // 修缮：不写房间面积
};
// 静态调用点计数：construction.mjs 里含面积写入调用的函数恰是 buildRow 与 rebuildRooms 两处
const AREA_SITES = Object.entries(ConstructionMjs).filter(([, fn]) => /areaWrite\(/.test(fn.toString())).map(([k]) => k).sort();
function makeZones(r, insideOf = ['comp_facility']) {
  const n = ri(r, 1, 5), floorArea = ri(r, 20, 900);
  return { floorArea, initShares: randShares(r, n), newShares: randShares(r, n),
           zones: [...Array(n)].map((_, i) => ({ id: `zone_${i}`, comps: ['comp_zone'], insideOf, pos: { x: ri(r, 0, 99), y: ri(r, 0, 99) }, areaM2: null })) };
}
// 第十五版"嵌套设施行"数据组：聚落站点 + 聚落分区；地面建筑 B 及其房间；地窖 C 挂在 B 之下（地下，占 B 某房间的一块）内有房间；
// 随机加 B 下的地面附屋 G（占 B 楼面一块）与 C 下的巷道 T（地下）。最外层建筑行与聚落分区的面积由建行写者在建行时落初值。
function makeNestedTree(r) {
  const rows = new Map();
  const add = (id, comps, parent, extra = {}) => {
    const insideOf = []; for (let p = parent; p; p = rows.get(p).parent) insideOf.push(...rows.get(p).comps);
    rows.set(id, { id, comps, parent, insideOf, underground: false, areaM2: null, ...extra });
  };
  const fac = (id, parent, extra) => {
    const nR = ri(r, 1, 4);
    add(id, ['comp_facility', 'comp_enclosure'], parent, { form: pick(r, ['bldform_a', 'bldform_b', 'bldform_c']), materialKg: rb(r, 1, 999999999),roomShares: randShares(r, nR), ...extra });
    for (let i = 0; i < nR; i++) add(`${id}.room_${i}`, ['comp_zone'], id);
    return nR;
  };
  add('site_0', ['comp_settlement'], null, { areaM2: ri(r, 20000, 90000) });
  const settle = ['site_0'];
  for (let i = 0, n = ri(r, 1, 3); i < n; i++) { add(`site_0.sz_${i}`, ['comp_zone'], 'site_0', { areaM2: ri(r, 100, 3000) }); settle.push(`site_0.sz_${i}`); }
  const nB = fac('fac_B', 'site_0', { areaM2: ri(r, 200, 900) });
  if (r() < 0.5) fac('fac_B.g', 'fac_B', { occ: rb(r, 500, 3000) });
  const nC = fac('fac_B.cellar', 'fac_B', { underground: true, host: ri(r, 0, nB - 1), occ: rb(r, 2000, 9000) });
  if (r() < 0.5) fac('fac_B.cellar.tunnel', 'fac_B.cellar', { underground: true, host: ri(r, 0, nC - 1), occ: rb(r, 1000, 8000) });
  return { rows, outer: 'fac_B', settle };
}

// ---------- 场景 ----------
const COV = { smallMpm3Done: 0, rebuildWithLot: 0, materialize: 0, carrier: 0, extendLaid: 0, foldRet: 0, foldRows: 0, deferred: 0, salvageDrift: 0, extendRefill: 0, buildRefill: 0, nonIntBuild: 0, nonIntRefill: 0, areaIn: 0, areaOut: 0 };
const NEST = { runs: 0, rewritten: 0, nestedTouched: 0, self: 0, reject: 0, pathCaught: 0, rollback: 0, viol: 0 };   // 第十五版 C 计数
const scenarios = {
  开局建筑(r, W) {
    const S = setup(r, W, 'genesis');
    for (const [k, fl] of S.f.wallFlow) A(S, fl.laid === S.f.materialKg.get(k) && fl.taken === 0n && fl.lost === 0n, '开局砌入 ≠ materialKg');
    A(S, W.codes.every(c => lbal(S.L, 'acct_stock', c) === 10n ** 15n), '开局动了备料账户');
    return S;
  },
  物化建行(r, W) {
    const S = setup(r, W, 'materialize'); COV.materialize++;
    for (const [k, fl] of S.f.wallFlow) A(S, fl.laid === S.f.materialKg.get(k) && fl.taken === 0n && fl.lost === 0n, '物化砌入 ≠ materialKg');
    A(S, W.codes.every(c => lbal(S.L, S.ctx.agg, c) === 0n) && lbal(S.L, S.ctx.agg, claimKey(S.ctx)) === 0n, '物化完毕聚合账户墙料或未物化份额不为零');
    A(S, W.codes.every(c => lbal(S.L, 'acct_stock', c) === 10n ** 15n), '物化动了备料账户');
    // 预置不足时整笔不成
    const T = cloneState(S); T.f = newFacility(S.f.id); T.L.asset.delete(S.ctx.fac);
    for (const c of W.codes) ladd(T.L, S.ctx.aggFree, c, 10n ** 15n);       // N7：可花分区再多同种料也不能代替专用分区的预置
    const rr = txn(T, () => v19Materialize(T, planBuild(r, W))); A(S, rr.rejected === 'insufficient' && T.ok, '专用分区无预置时物化未整笔拒绝（可花分区的同种料不得被拿去物化）');
    return S;
  },
  换料(r, W) {
    const S = setup(r, W, anyMode(r));
    burnDays(S, r, ri(r, 0, 2));
    S.f.condition = rb(r, 0, 90000000);
    const plan = randomPlan(r, W);
    const lot0 = openLot(structuredClone(S.f), W);
    if (!lot0) return S;
    const total = lot0.fillL + lot0.replaceL;
    const maxMin = Math.ceil(total * W.rules.minutesPerM3 / LPM3) + ri(r, 0, 100);
    const M = ri(r, 1, maxMin);
    const splits = [[M], randomSplit(r, M, 8), randomSplit(r, M, 60), randomSplit(r, M, 200)];
    const runs = splits.map(sp => { const C = cloneState(S, r); const done = runSplit(C, sp, plan, lot0); if (done && W.rules.minutesPerM3 < LPM3) COV.smallMpm3Done++; return C; });
    for (const C of runs) absorb(S, C);
    A(S, runs.every(C => coreSer(C) === coreSer(runs[0])), '切分不同 materialKg/三项累计/repairLot/余数/出账/出资方入账/收下分钟 不逐位相同');   // G1、G3
    // N5"一笔内比例变化"：各自一份世界数据，提交之间改 salvageFraction 的有效值；结果须与不改时逐位相同
    const drifted = splits.slice(1).map(sp => { const C = cloneState(S, r); C.W = structuredClone(W); runSplit(C, sp, plan, lot0, r, true); return C; });
    for (const C of drifted) absorb(S, C);
    if (drifted.length && lot0.replaceL > 0) COV.salvageDrift++;
    A(S, drifted.every(C => coreSer(C) === coreSer(runs[0])), '一笔之内 salvageFraction 有效值变化后，取出/损失/出资方入账与不变时不逐位相同（N5）');
    const R = cloneState(S); for (const c of W.codes) R.L.bal.get('acct_stock').set(c, 0n);
    const rr = txn(R, () => v19Repair(R, maxMin, plan));
    A(S, rr.rejected === 'insufficient' && R.ok, '缺料未整笔拒绝'); absorb(S, R);
    return S;
  },
  原地翻修(r, W) {
    const S = setup(r, W, anyMode(r));
    burnDays(S, r, ri(r, 0, 1));
    if (r() < 0.7) maybeRepair(S, r, 400);                                  // 可能留下未完一笔
    if (S.f.lot) COV.rebuildWithLot++;
    txn(S, () => v19Rebuild(S, planBuild(r, W)));
    const P = cloneState(S);                                                 // G2：翻修后任意修缮不使任何料为负（checkTxn 逐笔断言）
    for (let i = 0; i < 12 && !P.f.terminated; i++) maybeRepair(P, r, 100000);
    absorb(S, P);
    const F = cloneState(S); for (const c of W.codes) F.L.bal.get('acct_stock').set(c, 0n);
    const fr = txn(F, () => v19Rebuild(F, planBuild(r, W)));
    A(S, fr.rejected === 'insufficient' && F.ok, '翻修缺料未整笔回滚');
    return S;
  },
  拆除(r, W) {
    const S = setup(r, W, anyMode(r));
    burnDays(S, r, ri(r, 0, 2));
    if (r() < 0.5) maybeRepair(S, r, 3000);
    if (r() < 0.3) txn(S, () => v19Rebuild(S, planBuild(r, W)));            // 翻修后再拆：散料归翻修后的持有人
    txn(S, () => v19Demolish(S));
    A(S, S.f.terminated, '拆除未终止');
    return S;
  },
  损毁(r, W) {
    const S = setup(r, W, anyMode(r));
    burnDays(S, r, ri(r, 0, 2));
    if (r() < 0.5) { S.f.condition = rb(r, 30000000, 90000000); txn(S, () => v19Repair(S, ri(r, 1, 3000), randomPlan(r, W))); }
    while (S.f.condition > W.rules.collapseCond) txn(S, () => v19Damage(S, rb(r, 1, 40000000)));
    txn(S, () => v19Collapse(S));
    A(S, S.f.terminated, '损毁未终止');
    return S;
  },
  燃烧(r, W) {                                                               // G7：燃烧事务先提交，损毁另起一个事务
    const S = setup(r, W, anyMode(r));
    if (r() < 0.5) maybeRepair(S, r, 300);
    for (let d = 0, n = ri(r, 1, 12); d < n; d++) {
      const b8 = r() < 0.15 ? 0n : rb(r, 1, 50000000);
      txn(S, () => v19Burn(S, b8));
      if (S.f.condition <= W.rules.collapseCond) { txn(S, () => v19Collapse(S)); break; }
    }
    return S;
  },
  承载物终止(r, W) {
    const S = setup(r, W, anyMode(r)); COV.carrier++;
    burnDays(S, r, ri(r, 0, 2));
    if (r() < 0.5) maybeRepair(S, r, 3000);
    txn(S, () => v19CarrierEnd(S));
    A(S, S.f.terminated, '承载物终止未终止建筑行');
    return S;
  },
  扩建(r, W) {
    const S = setup(r, W, anyMode(r));
    if (r() < 0.4) maybeRepair(S, r, 500);
    const items = [...Array(ri(r, 0, 3))].map(() => ({ mat: pick(r, W.codes), kg: rb(r, 1, 5000000) }));
    if (items.length) COV.extendLaid++;
    txn(S, () => v19Extend(S, items));
    const F = cloneState(S); for (const c of W.codes) F.L.bal.get('acct_stock').set(c, 0n);
    const fr = txn(F, () => v19Extend(F, [{ mat: W.codes[0], kg: 1n }]));
    A(S, fr.rejected === 'insufficient' && F.ok, '扩建缺料未整笔拒绝');
    if (r() < 0.5) maybeRepair(S, r, 3000);                                 // 扩建后的行照常修缮、守恒
    return S;
  },
  // N3、A19-4.2"扩建后烧掉一部分料再修到没有待办，envelopeMassKg 回到扩建后的值（差在 1 升料之内）"；A19-1.2 补缺"现存升数 E 不小于 envelopeVolumeL"。
  // 第十三版 A：建楼数据多数是墙里实有体积不是整数升的楼（建成锚 = 向上取整的 E）；"差在 1 升内"对未扩建（锚 = 建成）与扩建过（锚 = 扩建后）的同一栋楼都断言。
  // 用同样的料：整栋只用一种可燃料 m，扩建砌 m，补缺也选 m（多料时"同样的料"无从对齐，这一组只取单料）。
  扩建后补缺(r, W0) {
    const W = structuredClone(W0); const m = W.codes[0]; W.M[m].fire = W.M[m].fire > 0n ? W.M[m].fire : 1000n;
    W.envReq = [{ v: SC }];
    const S = setup(r, W, r() < 0.5 ? 'genesis' : 'build');
    S.ctx.funders = S.ctx.funders.length ? S.ctx.funders : [{ acct: 'acct_f0', bp: SC }];
    // 建成时 setup 用 planBuild 选料；这里重建一栋只含 m 的
    S.f = newFacility(S.f.id); S.L.asset.delete(S.ctx.fac);
    const V = ri(r, 50, 2000), d = W.M[m].dens;
    const kg0 = BigInt(V) * d - (r() < 0.75 ? rb(r, 1, Number(d) - 1) : 0n);   // 第十三版 A：墙里实有体积不是整数升（质量不是整升的密度倍）
    txn(S, () => v19BuildRuntime(S, { V, items: [{ mat: m, L: V, kg: kg0 }] }));
    if (S.f.terminated || !S.f.materialKg.get(m)) return S;
    A(S, BigInt(S.f.envelopeVolumeL) === E_ref(S.f, W), '建成锚 ≠ 建成那一刻的现存升数 E（第十三版 A）');
    if (kg0 % d !== 0n) COV.nonIntRefill++;
    const U = cloneState(S);                                                  // 未扩建：锚是建成时的质量与设计体积
    burnAndRefill(U, r, m, U.f.materialKg.get(m), '未扩建：'); absorb(S, U); COV.buildRefill++;
    txn(S, () => v19Extend(S, [{ mat: m, kg: rb(r, 1, 50000000) }]));         // 扩建过：锚是扩建后的质量与设计体积
    burnAndRefill(S, r, m, S.f.materialKg.get(m), '扩建后：'); COV.extendRefill++;
    return S;
  },
  // 第十三版 B：房间行 areaM2 的写权按卷五单项登记名单（写者 + 行范围）判，"只在翻修事务内写"按 construction.mjs 的调用点判
  房间面积翻修事务内写(r) {
    const S = { ok: true, msgs: [] }; const Z_ = makeZones(r); COV.areaIn++;
    const trace = [];
    A(S, ConstructionMjs.buildRow({ cause: pick(r, BUILD_CAUSES) }, Z_, trace).every(x => x.ok), '建行事务内建行函数给房间行落面积未成功');
    const tx = { cause: REBUILD_CAUSE };
    const want = splitLast(Z_.floorArea, Z_.newShares);
    const positions = Z_.zones.map(() => ({ x: ri(r, 0, 99), y: ri(r, 0, 99) }));
    ConstructionMjs.rebuildRooms(tx, Z_, positions, trace).forEach((x, i) => {
      const z = Z_.zones[i];
      A(S, x.pos.ok === true && z.pos.x === positions[i].x && z.pos.y === positions[i].y, '翻修事务内 relocate 位置量未被接受');
      A(S, x.area.ok === true && z.areaM2 === want[i], '翻修事务内 construction.mjs 整值写面积未成功');
    });
    A(S, Z_.zones.reduce((a, z) => a + z.areaM2, 0) === Z_.floorArea, '翻修后房间面积之和 ≠ 楼面面积');
    const before = ser(Z_.zones);                                             // construction.mjs 的扩建、修缮路径在各自事务里不写房间面积
    ConstructionMjs.extendFixture({ cause: 'cause_extend' }, Z_, trace); ConstructionMjs.repairStep({ cause: 'cause_repair' }, Z_, trace);
    A(S, ser(Z_.zones) === before, '扩建或修缮路径改了房间行');
    A(S, areaTraceOk(trace) && trace.length === 2 * Z_.zones.length, '房间面积写入不只出自建行函数（建行事务）与翻修一步（翻修事务）两处调用点');
    return S;
  },
  房间面积写权外被拒(r) {
    const S = { ok: true, msgs: [] }; const Z_ = makeZones(r); COV.areaOut++;
    const trace = [];
    ConstructionMjs.buildRow({ cause: 'cause_build' }, Z_, trace);
    const before = ser(Z_.zones);
    for (const z of Z_.zones) {
      const v = z.areaM2 + ri(r, 1, 50);
      A(S, areaWrite(z, v, pick(r, ['facilities.mjs', 'mechanism.mjs', 'settlement-writer']), 'other', { cause: REBUILD_CAUSE }, trace).rejected !== undefined, '翻修事务内由未登记写者写房间面积未被拒（单项登记名单只登记 construction.mjs）');
      A(S, relocateZone(z, { x: 1, y: 2, areaM2: v }, { cause: REBUILD_CAUSE }, AREA_REG.writer).rejected !== undefined, 'relocate 的 placement.rows 带面积未被拒（面积不是位置量）');
      A(S, relocateZone(z, { x: 1, y: 2 }, null, AREA_REG.writer).rejected !== undefined, '翻修事务外 relocate 房间行未被拒');
      A(S, relocateZone(z, { x: 1, y: 2 }, { cause: REBUILD_CAUSE }, 'facilities.mjs').rejected !== undefined, '翻修事务内由别的调用者 relocate 房间行未被拒');
    }
    A(S, ser(Z_.zones) === before, '被拒的写入改动了房间行');
    // 行范围外：聚落的分区（挂 comp_zone、不在 comp_facility 之内），面积由建行写者落初值后无人改写，construction.mjs 也写不进
    const Zs = makeZones(r, ['comp_settlement']); Zs.zones.forEach(z => { z.areaM2 = ri(r, 1, 900); });
    const beforeS = ser(Zs.zones);
    for (const z of Zs.zones) A(S, areaWrite(z, z.areaM2 + 1, AREA_REG.writer, 'rebuildRooms', { cause: REBUILD_CAUSE }, trace).rejected !== undefined, '聚落分区（行范围外）的面积写入未被拒');
    A(S, ser(Zs.zones) === beforeS, '被拒的写入改动了聚落分区');
    A(S, areaTraceOk(trace) && trace.length === Z_.zones.length, '面积写入出自两处调用点之外，或被拒的写入留了记录');
    // 代码路径约束：调用点静态计数恰两处；负对照——翻修一步若在翻修事务外被调用，卷二不拦（写权不判事务），调用点检查必须查出
    A(S, AREA_SITES.join(',') === 'buildRow,rebuildRooms', `construction.mjs 写房间行 areaM2 的调用点不恰是建行函数与翻修一步两处：${AREA_SITES.join(',')}`);
    const bad = [], Zc = structuredClone(Z_);
    ConstructionMjs.rebuildRooms({ cause: pick(r, ['cause_extend', 'cause_repair', 'cause_build', 'cause_demolish']) }, Zc, Zc.zones.map(() => ({ x: 1, y: 2 })), bad);
    A(S, bad.length === Zc.zones.length && !areaTraceOk(bad), '翻修一步在翻修事务外写了面积，代码路径检查未查出');
    return S;
  },
  工位占用记录(r) {
    const S = { ok: true, msgs: [] }; const A_ = (c, m) => A(S, c, m);
    const SW = makeStationWorld(r);
    const base = stationRun(SW, A_);
    COV.foldRet += base.st.cov.ret; COV.foldRows += base.st.cov.rows;
    const Dx = ri(r, 0, SW.days - 2), by = ri(r, 1, DAY - 1);               // 补结不变
    const late = stationRun(SW, A_, Dx, by); COV.deferred++;
    A(S, ser(late.minutesOf[Dx]) === ser(base.minutesOf[Dx]), `第 ${Dx} 日推迟日结后占用分钟变了`);
    return S;
  },
  // 第十五版 C：嵌套设施行与房间行一样带 areaM2，只在外层建筑翻修事务内由 construction.mjs 重算（李白把关：逐行断言 + 计数）
  嵌套设施行面积(r) {
    const S = { ok: true, msgs: [] }; let viol = 0;
    const chk = (c, m) => { if (!c) viol++; A(S, c, m); };
    const T = makeNestedTree(r), rows = T.rows, trace = [];
    const areas = () => new Map([...rows].map(([id, x]) => [id, x.areaM2]));
    const fixedOf = (id, host) => { const x = rows.get(id); return ser({ ...x, areaM2: null, roomShares: id === host ? null : x.roomShares }); };
    chk(ConstructionMjs.buildRow({ cause: pick(r, BUILD_CAUSES) }, T, trace).every(x => x.ok), '建行事务内建行函数给建筑之内各行落面积未成功');
    chk(areaSumOk(rows, T.outer), '建成后面积和校验不过');
    chk([...rows.values()].every(x => Number.isInteger(x.areaM2)), '建成后有行没有面积');
    const outer0 = rows.get(T.outer).areaM2, settle0 = ser(T.settle.map(id => rows.get(id)));
    const nestedIds = [...rows.values()].filter(x => x.id !== T.outer && x.comps.includes('comp_facility')).map(x => x.id).sort(byCode);
    chk(nestedIds.length >= 1 && nestedIds.every(id => chainHasFacility(rows, id) && inAreaScope(rows.get(id))), '嵌套设施行不在 inside: [comp_facility] 行范围内');
    const scopeIds = [...rows.values()].filter(x => inAreaScope(x)).map(x => x.id).sort(byCode);
    chk(scopeIds.every(id => chainHasFacility(rows, id)) && [...rows.keys()].filter(id => !scopeIds.includes(id)).every(id => !chainHasFacility(rows, id)), '卷二判的行范围与包含链上有建筑行的行集合不一致');
    chk(!scopeIds.includes(T.outer) && T.settle.every(id => !scopeIds.includes(id)), '最外层建筑行或聚落分区落进了行范围');
    const kinds = shuffle(r, ['outer', 'outer', 'self', 'outside', 'outScope', ...[...Array(ri(r, 0, 3))].map(() => pick(r, ['outer', 'self', 'outside', 'outScope']))]);
    for (const kind of kinds) {
      if (kind === 'outer' || kind === 'self') {                              // 翻修事务：外层建筑翻修，或对嵌套设施行自己翻修
        const host = kind === 'outer' ? T.outer : pick(r, nestedIds);
        const shares = randShares(r, kidsOf(rows, host).filter(isRoomRow).length);
        const bad = kind === 'outer' && r() < 0.3;
        const hasGround = kidsOf(rows, host).some(k => k.comps.includes('comp_facility') && !k.underground);
        const pre = areas(), preFix = new Map([...rows.keys()].map(id => [id, fixedOf(id, host)])), n0 = trace.length;
        const res = ConstructionMjs.rebuildRooms({ cause: REBUILD_CAUSE }, T, { host, shares, bad }, trace);
        const changed = [...areas()].filter(([id, a]) => a !== pre.get(id)).map(([id]) => id);
        for (const id of rows.keys()) chk(fixedOf(id, host) === preFix.get(id), `翻修改了 ${id} 面积以外的字段（嵌套设施行自己的形制、用料不随外层翻修变）`);
        if (res.rolledBack) {
          NEST.rollback++;
          chk(bad, '正确布局被面积和校验拒绝');
          chk(changed.length === 0 && trace.length === n0, '面积和校验不过而翻修未整笔回滚');
        } else {
          chk(!(bad && hasGround), '漏扣地面附屋占地的布局未被面积和校验拦下');
          chk(res.ok === true, '翻修事务内 construction.mjs 写建筑之内各行面积未成功');
          chk(areaSumOk(rows, host), '翻修后面积和校验不过');
          for (const id of changed) {                                         // 逐行断言
            chk(chainHasFacility(rows, id), `被改写面积的行 ${id} 包含链上没有建筑行`);
            chk(id !== host && isDescendant(rows, id, host), `改写了翻修宿主 ${host} 之外的行或宿主自己 ${id}`);
            chk(id !== T.outer && !T.settle.includes(id), `最外层建筑行或聚落分区 ${id} 被改写`);
          }
          chk(trace.slice(n0).every(t => t.row !== host && isDescendant(rows, t.row, host) && chainHasFacility(rows, t.row)), '翻修写入落在宿主之内各行之外');
          NEST.rewritten += changed.length; if (kind === 'self') NEST.self++;
          if (kind === 'outer') NEST.nestedTouched += changed.filter(id => nestedIds.includes(id)).length;
        }
      } else if (kind === 'outside') {                                       // 事务外写入一律被拒
        const pre = areas(), n0 = trace.length;
        for (const id of scopeIds) {                                          // 别的写者（任意事务，含翻修事务）：卷二按"不是登记的写者"拒
          const z = rows.get(id);
          const res = areaWrite(z, z.areaM2 + ri(r, 1, 50), pick(r, ['facilities.mjs', 'mechanism.mjs', 'settlement-writer']), 'other', { cause: pick(r, ['cause_extend', 'cause_repair', REBUILD_CAUSE, null]) }, trace);
          chk(res.rejected !== undefined, `未登记写者写 ${id} 面积未被拒`); if (res.rejected) NEST.reject++;
        }
        ConstructionMjs.extendFixture({ cause: 'cause_extend' }, T, trace); ConstructionMjs.repairStep({ cause: 'cause_repair' }, T, trace);
        chk(ser(areas()) === ser(pre) && trace.length === n0, '翻修事务外的写入改动了面积或留了记录');
        const Tc = structuredClone(T), badTr = [];                           // 负对照：翻修一步在翻修事务外被调用，卷二不判事务，调用点检查必须查出
        ConstructionMjs.rebuildRooms({ cause: pick(r, ['cause_extend', 'cause_repair', 'cause_build', 'cause_demolish']) }, Tc, { host: Tc.outer, shares: randShares(r, kidsOf(Tc.rows, Tc.outer).filter(isRoomRow).length), bad: false }, badTr);
        const caught = badTr.length > 0 && !areaTraceOk(badTr);
        chk(caught, '翻修一步在翻修事务外写了嵌套设施行面积，代码路径检查未查出'); if (caught) NEST.pathCaught++;
      } else {                                                                // 行范围外：construction.mjs 在翻修事务里写最外层建筑行、聚落站点与分区，卷二拒
        const pre = areas(), n0 = trace.length;
        for (const id of [T.outer, ...T.settle]) {
          const res = areaWrite(rows.get(id), rows.get(id).areaM2 + 1, AREA_REG.writer, 'rebuildRooms', { cause: REBUILD_CAUSE }, trace);
          chk(res.rejected !== undefined, `行范围外 ${id} 的面积写入未被拒`); if (res.rejected) NEST.reject++;
        }
        chk(ser(areas()) === ser(pre) && trace.length === n0, '被拒的写入改动了面积或留了记录');
      }
    }
    chk(rows.get(T.outer).areaM2 === outer0, '最外层建筑行的面积建成后被改写');
    chk(ser(T.settle.map(id => rows.get(id))) === settle0, '聚落站点或分区被改写');
    chk(areaTraceOk(trace) && trace.every(t => chainHasFacility(rows, t.row)), '面积写入出自两处调用点之外，或落在包含链上无建筑行的行');
    NEST.viol += viol; NEST.runs++;
    return S;
  },
};

// ---------- 主程序 ----------
const SEEDS = [11, 23, 37, 41, 59, 67, 73, 89];
const RUNS_PER_SEED = 30;
const tally = {}; const fails = [];
for (const [si, [name, fn]] of Object.entries(scenarios).entries()) {
  tally[name] = { pass: 0, total: 0 };
  for (const seed of SEEDS) {
    for (let i = 0; i < RUNS_PER_SEED; i++) {
      const r = mulberry32(seed * 1000003 + i * 7919 + si * 104729);
      const W = makeWorld(r);
      let S;
      try { S = fn(r, W); } catch (e) { S = { ok: false, msgs: ['异常 ' + e.message] }; }
      tally[name].total++;
      if (S.ok) tally[name].pass++; else if (fails.length < 12) fails.push(`${name} seed=${seed} run=${i}: ${S.msgs.join(' | ')}`);
    }
  }
}
console.log('== 卷六/卷十九 围护实物账守恒、工位占用记录 ==');
for (const [n, t] of Object.entries(tally)) console.log(`${t.pass === t.total ? 'PASS' : 'FAIL'}  ${n}: ${t.pass}/${t.total}`);
// 覆盖：各项新定法确实被数据触发到（不是放宽，空跑即判失败）
const covOk = Object.values(COV).every(v => v > 0);
console.log(`${covOk ? 'PASS' : 'FAIL'}  覆盖  minutesPerM3<1000 做完的笔 ${COV.smallMpm3Done}；翻修时有未完一笔 ${COV.rebuildWithLot}；物化 ${COV.materialize}；承载物终止 ${COV.carrier}；扩建有砌料 ${COV.extendLaid}；保留期折叠 ${COV.foldRet} 条；条数上限折叠 ${COV.foldRows} 条；补结 ${COV.deferred} 组；未扩建补缺 ${COV.buildRefill}；扩建后补缺 ${COV.extendRefill}；非整数升建成（全部建成事务） ${COV.nonIntBuild}；非整数升补缺组 ${COV.nonIntRefill}；一笔内比例变化 ${COV.salvageDrift}；面积事务内写 ${COV.areaIn}；面积写权外被拒 ${COV.areaOut}`);
// 第十五版 C：嵌套设施行计数（违例须为 0；各项须被触发到，空跑即判失败）
const nestOk = NEST.viol === 0 && NEST.runs > 0 && NEST.rewritten > 0 && NEST.nestedTouched > 0 && NEST.self > 0 && NEST.reject > 0 && NEST.pathCaught > 0 && NEST.rollback > 0;
console.log(`${nestOk ? 'PASS' : 'FAIL'}  嵌套设施行  组数 ${NEST.runs}；被改写行数 ${NEST.rewritten}（其中外层翻修改写的嵌套设施行 ${NEST.nestedTouched}）；嵌套设施自身翻修 ${NEST.self}；拒绝次数 ${NEST.reject}；代码路径查出 ${NEST.pathCaught}；面积和不过回滚 ${NEST.rollback}；违例 ${NEST.viol}`);
if (fails.length) { console.log('-- 失败样例 --'); for (const s of fails) console.log(s); }
process.exitCode = Object.values(tally).every(t => t.pass === t.total) && covOk && nestOk ? 0 : 1;
