// 围护的实物账 wallFlowKg 的开局写入点（卷十九 §2.1 :109、§4.1 规则 11 表第一行"开局建行"与其下"作者手写的建筑行怎样建账"，封卷后勘误 1121k4、1123k60）：
// 开局建行同一事务里，每种料 laidKg = 行上 materialKg 的该料质量，takenKg、lostKg 为 0，守恒式 laidKg − takenKg − lostKg = materialKg 从那一刻成立；
// materialKg 里值为 0 的料也逐料照记（0 照记 0），不跳过。本文件是开局流水账值的唯一构造函数（由 gen/envelope.mjs 调）；
// wallFlowKg 的运行期写路径 created.*.props.wallFlowKg 在 state-owners 声明写者是本文件（systems.wallFlow），storage.mjs writePath 核写者（E-VIEW-UNDECLARED-WRITE），别的文件写它即被拦。
// 其余事由（物化、运行期建成、修缮、燃烧、拆除等）的加记函数归卷十九建造卡，落地时加进本文件。
// 纯函数：不读 state、墙钟，不用 Math.*。

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 开局建行的围护流水账（卷十九 :109，封卷后勘误 1124k10：三个求和映射）：{laidKg: {料: 该料质量}, takenKg: {料: 0}, lostKg: {料: 0}}，料按代号序，0 也逐料照记。
 * @param {Record<string, number>} materialKg 行上 materialKg（作者写的或开局按形制默认料补出的）
 * @returns {{laidKg: Record<string, number>, takenKg: Record<string, number>, lostKg: Record<string, number>}}
 */
export function openingWallFlow(materialKg) {
  const out = { laidKg: {}, takenKg: {}, lostKg: {} };
  for (const code of Object.keys(materialKg).sort(cmp)) {
    out.laidKg[code] = materialKg[code];
    out.takenKg[code] = 0;
    out.lostKg[code] = 0;
  }
  return out;
}
