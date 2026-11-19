// 状态谓词单点（规则层）：卷二《维度表规范与统一入口》§2.5 :495 已终止谓词 `terminated(engine,state,subject)`，别名 `dead`（唯一定义）。
// 块 5 只做 terminated／dead（方案 §3.5 第 8 条：can／awake／capacity 移块 6）。李白 11-18 22:10 丙3：块 5 只读终止标记 state.terminated；
// statusView 各实例 `terminal` 字段那一读数随块 6 状态容器卡补（验收记"部分"，PLAN 挂块 6）。
// 其他所有卷与文件只调用本谓词，不自读 state.terminated（:495）；本文件是 stateKeys.terminated 的登记读者（view:capacity）。

import { readPath } from './kernel/storage.mjs';
import { P } from './kernel/handles/generated.mjs';

/**
 * `terminated(engine, state, subject)`（卷二 §2.5 :495）：实体是否已过终止协议。返回 {ok, reason}：ok 为真即已终止，reason 是终止原因的 verb 代号；
 * 未终止 {ok: false, reason: null}。复生窗口期内终止标记还在，照常为真；只有复生步骤删去标记后才为假。
 * @param {object} engine @param {object} state @param {string} subject
 * @returns {{ok: boolean, reason: string | null}}
 */
export function terminated(engine, state, subject) {
  const mark = readPath(state, P.terminated(subject));
  return mark === undefined ? { ok: false, reason: null } : { ok: true, reason: mark.cause };
}

/** 同一函数的第二个导出名（:495"dead 与 terminated 是同一个函数的两个导出名"）。 */
export const dead = terminated;
