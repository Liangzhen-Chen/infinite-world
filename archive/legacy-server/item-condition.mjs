// 实例成色的写入（卷三乙《物态类别与物品》§4.10 耐久与劣化 D-1 用损、D-2 重设锚点；§3.3 唯一写者表：`itemInstances.<id>.durability / wearAnchorDay` 的声明写者是本文件；块 6 第 6-3 张）。
// 本文件的函数在以本文件为节点的事务里调（runTransaction 的 file 是 item-condition.mjs）。公式与读数在内核 kernel/item-state.mjs（useWear、durabilityOn），本文件只经 writePath 落笔。
// 自然劣化不写状态（锚点式，D-2）；只有用损、损伤、修理、换地点或容器、材料组成变了这些条件变化才写（把当日耐久写回、锚点日设为当日）。

import { useWear, durabilityOn } from './kernel/item-state.mjs';
import { clockView } from './kernel/scheduler.mjs';
import { writePath, readPath } from './kernel/storage.mjs';
import { P } from './kernel/handles/generated.mjs';

/**
 * 实例耐久初值（卷三乙 §2.3、§3.3：durability、wearAnchorDay 的声明写者是本文件）：建实例（kernel/dimension-writers.mjs，不写这两项）之后，
 * 在以本文件为节点的事务里落下初值与锚点日（今日）；已有值再写即拒（初值只写一次，此后只有用损与重设锚点改它）。
 * @param {object} engine @param {object} state @param {string} instanceId @param {number} durability 取值域 [0,1]
 */
export function initDurability(engine, state, instanceId, durability) {
  if (typeof durability !== 'number' || !(durability >= 0 && durability <= 1)) throw Object.assign(new Error('E-DIM-DOMAIN-RANGE durability is a number in [0, 1]'), { code: 'E-DIM-DOMAIN-RANGE', fields: {} });
  if (readPath(state, P.itemInstances_durability(instanceId)) !== undefined) throw Object.assign(new Error('E-VIEW-UNDECLARED-WRITE durability initial value is written once'), { code: 'E-VIEW-UNDECLARED-WRITE', fields: {} });
  writePath(state, P.itemInstances_durability(instanceId), durability);
  writePath(state, P.itemInstances_wearAnchorDay(instanceId), clockView(engine, state).day);
}

/**
 * 一次或几次用损（D-1）：耐久减 times × wearPerUse ÷ wearResistance，下限 0；写 durability 与 wearAnchorDay（算法见 kernel/item-state.mjs useWear）。
 * 实例没有耐久维度返回 null；否则返回写下的 {durability, wearAnchorDay}。
 * @param {object} engine @param {object} state @param {string} instanceId @param {number} [times]
 */
export function applyUse(engine, state, instanceId, times = 1) {
  const w = useWear(engine, state, instanceId, times);
  if (w === null) return null;
  writePath(state, P.itemInstances_durability(instanceId), w.durability);
  writePath(state, P.itemInstances_wearAnchorDay(instanceId), w.wearAnchorDay);
  return w;
}

/**
 * 条件变化重设锚点（D-2：实例换了地点或容器、材料组成变了）：当日耐久读得出且锚点日不是当日时，把当日耐久写回、锚点日设为当日；
 * 读不出（环境未接线，自然劣化未知）或已是当日都不写，返回 false（不编数）。
 * @param {object} engine @param {object} state @param {string} instanceId
 */
export function reanchorWear(engine, state, instanceId) {
  const today = clockView(engine, state).day;
  const d = durabilityOn(engine, state, instanceId, today);
  if (!d.known || !d.applicable) return false;
  writePath(state, P.itemInstances_durability(instanceId), d.value);
  writePath(state, P.itemInstances_wearAnchorDay(instanceId), today);
  return true;
}
