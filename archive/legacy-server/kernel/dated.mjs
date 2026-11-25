// 按日生效改写（卷二 §2.7 `dated` 写者 :796；§1.3 取值最上一级 :164；卷五 §4.1 规则 16 :509、§3.3 :371；卷二十七 R27-1.16 :327）。
// 大范围改写（改山形、地形类、区域边界、气候）改的是生成输入，不能当场生效：写者只追加 `{fromDay, value, cause}`，`fromDay` 须大于写入时的当前日，
// 读取取求值日 d 当天有效的那一条（生效日不晚于 d 的各条里最后追加的），一条都没有就照 §1.3 往下取建行值。记录永久保留、只追加，存在 dated 写者登记的路径上（state 里，进状态哈希）。
// 本文件是三个 kernelApi 入口：writeDated（追加，拒写不落记录）、datedValueAt（dim() 读路径用）、inputVersionAt（"当日有效输入版本"，派生缓存的键）。
// 不认任何具体顶层键、维度或实体类：记录路径、实体类、写者文件全按加载期收下的声明表（storage.mjs 的 dated 模式）。

import { KernelError } from './errors.mjs';
import { clockView } from './scheduler.mjs';
import { appendDated, datedRecordsOf, datedRecordsAll, canonical } from './storage.mjs';
import { sha256Text } from './save.mjs';
import { checkField } from './dim-value-check.mjs';
import { T } from './handles/markers.mjs';

const FIELD = T.dated_field;

/**
 * 求值日核对（kernel 组内用）：给了就须是非负安全整数（没有"不限"之类的特殊值：负数、小数、NaN、非数、null 都拒，E-DIM-STRUCT-FIELD），不给（undefined）合法。
 * @param {unknown} day
 * @returns {void}
 */
export function assertEvalDay(day) {
  if (day !== undefined && (!Number.isSafeInteger(day) || day < 0)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `evaluation day must be a non-negative integer, got ${JSON.stringify(day)}`);
}

// 求值日：给了取给的（核过），不给取当前日。
function dayOf(engine, state, day) {
  if (day === undefined) return clockView(engine, state).day;
  assertEvalDay(day);
  return day;
}

/**
 * kernelApi `writeDated(engine, state, path, record)`（卷二 §2.7 dated）：往 dated 写者模式的记录路径追加一条 `{fromDay, value, cause}`。
 * 只在事务内、只有该模式登记的改写写者文件能写；fromDay 不大于写入时的当前日（`clock.minute` 整除一日分钟）即 E-DATED-FROMDAY，拒写、不落任何记录，事务整笔回滚。
 * @param {any} engine @param {any} state @param {string} path 记录路径（P 句柄给出） @param {{fromDay: number, value: any, cause: string}} record
 * @returns {void}
 */
export function writeDated(engine, state, path, record) {
  appendDated(state, path, record, clockView(engine, state).day, (kind, id, dimension, def, value) => checkField(engine, state, def, value, dimension, id, kind));
}

/**
 * 某行某维度在求值日 d 的有效改写值（§1.3 最上一级）：生效日不晚于 d 的各条里最后追加的那一条；没有记录路径、没有记录或各条都晚于 d 为 `{found: false}`。
 * day 不给取当前日（只在确有记录时才读时钟：没有登记任何 dated 写者时与本条之前逐位相同）。kernel 组内用（dim() 的读路径），不在 kernelApi。
 * @param {any} engine @param {any} state @param {string} kind @param {string} id @param {string} dimension @param {number} [day]
 * @returns {{found: false} | {found: true, value: any, fromDay: number, cause: string}}
 */
export function datedValueAt(engine, state, kind, id, dimension, day) {
  const recs = datedRecordsOf(state, kind, id, dimension);
  if (recs === null) return { found: false };
  const d = dayOf(engine, state, day);
  let hit = null;
  for (const r of recs) if (r[FIELD.fromDay] <= d) hit = r;
  return hit === null ? { found: false } : { found: true, value: hit[FIELD.value], fromDay: hit[FIELD.fromDay], cause: hit[FIELD.cause] };
}

/**
 * kernelApi `inputVersionAt(engine, state, day?)`："当日有效输入版本"：求值日 d 已生效的全部改写记录内容的确定性摘要（sha256 十六进制串）。
 * 摘要对象：按记录路径字典序、同路径按追加次序，每条 (路径, fromDay, value, cause)，经 storage 的规范序列化 canonical 与 save.mjs 的 sha256Text；没有有效记录是空列表的摘要。
 * 它是内容身份而不是计数：事务回滚、刻级回退后另追加不同内容的记录得不同版本，两份存档内容不同版本不同，所以可作跨写入、跨日留存的派生缓存（如 G2 细格基底）的键。
 * 过去的日子追加记录后它不变（新记录的 fromDay 都晚于写入时的当前日），将来日子追加后它变。day 不给取当前日。
 * @param {any} engine @param {any} state @param {number} [day]
 * @returns {string}
 */
export function inputVersionAt(engine, state, day) {
  const d = dayOf(engine, state, day);
  const effective = datedRecordsAll(state)
    .map(({ path, records }) => ({ path, records: records.filter((r) => r[FIELD.fromDay] <= d) }))
    .filter((x) => x.records.length > 0);
  return sha256Text(canonical(effective));
}
