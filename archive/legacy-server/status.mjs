// 状态容器读入口 `statusView`（卷二《维度表规范与统一入口》§1.11 :334–:354、§2.1 入口 21 :458、§2.7 :569 `statuses` 登记）：
// 主体名下的状态实例 `state.statuses[subjectId][] = {status, severity, since, source, bodyPart}`（§1.5 struct:statusInstance）原样读出，
// 每个实例带上它的状态行所属的族代号 `family`（状态行是 kind status 表的行，`family` 是该表维度，§1.11 :338）。
// 块 6 只做最小版（迁移体检 6-5）：不求档、不求修正集合、不判"作数"（卷二十一 R21-1.11、§3.1 与 modifier.mjs 归后面的卡）；
// 本文件不读族条目的 terminal、incapacitating、suppressesAwake 字段（读者只有 action-capacity.mjs，§2.5 :495、卷四 P-5 (b)）。
// 状态实例的写者（§1.11 :354 唯一写者 status.mjs）：块 6 第 6-6 张只建 `addStatusInstance`（卷四 §4.8.3 D-2 `die` 写终止类实例）；
// 档、修正集合、"作数"判定、移除与状态行内容归卷二十一。读入口不设缓存。

import { dim } from './kernel/dimensions.mjs';
import { readPath, writePath } from './kernel/storage.mjs';
import { kindOf, kindOfEntity } from './kernel/vocab.mjs';
import { clockView } from './kernel/scheduler.mjs';
import { registerDelegate } from './kernel/transaction.mjs';
import { E, P } from './kernel/handles/generated.mjs';

// 状态行的族维度名（卷二 §1.11 :338，卷文定名）。
const FAMILY_DIM = 'family';

// 登记码错误（形状同 kernel/errors.mjs#KernelError，kernel/transaction.mjs 的 codeOf 按 e.code 认）。
function deny(code, detail) {
  const e = new Error(`${code} ${detail}`);
  e.code = code;
  e.fields = {};
  return e;
}

/**
 * `statusView(engine, state, subjectId)`（卷二 §2.1 入口 21；签名按 §2.2）：主体名下全部状态实例，保持写入次序。
 * 返回 `{instances}`，每项 `{status, severity, since, source, bodyPart, family}`；没有实例即空列表（不是未知：容器里没有就是没有）。
 * 实例指向的状态行读不到 `family`（状态行不存在、族维度未知）是数据错误，照抛 E-DIM-UNKNOWN-READ，不静默当作没有族。
 * @param {object} engine @param {object} state @param {string} subjectId
 * @returns {Readonly<{instances: ReadonlyArray<Readonly<{status: string, severity: number, since: number, source: string | null, bodyPart: string | null, family: string}>>}>}
 */
export function statusView(engine, state, subjectId) {
  const list = readPath(state, P.statuses(subjectId));
  const instances = (Array.isArray(list) ? list : []).map((inst) => {
    const f = dim(engine, state, kindOf(inst.status), inst.status, FAMILY_DIM);
    if (!f.known || typeof f.value !== 'string') throw deny(E.E_DIM_UNKNOWN_READ, `statusView: status row ${inst.status} has no readable ${FAMILY_DIM} (instance on ${subjectId})`);
    return Object.freeze({ ...inst, family: f.value });
  });
  return Object.freeze({ instances: Object.freeze(instances) });
}

/**
 * 状态实例写者（卷二 §1.11 :354 唯一写者 status.mjs；块 6 最小版，只追加）：在以本文件为节点的事务里给主体追加一个实例
 * `{status, severity, since: 今日, source, bodyPart}`。状态行必须是 status 表的行（family 可读），主体必须是已存在、未终止的实体
 * （writePath 核终止）；不求档、不判"作数"、不做上限与互斥（卷二十一）。
 * @param {object} engine @param {object} state
 * @param {{subject: string, status: string, severity: number, source: string | null, bodyPart: string | null}} spec
 */
export function addStatusInstance(engine, state, spec) {
  kindOfEntity(state, spec.subject);
  const f = dim(engine, state, kindOf(spec.status), spec.status, FAMILY_DIM);
  if (!f.known || typeof f.value !== 'string') throw deny(E.E_DIM_UNKNOWN_READ, `addStatusInstance: status row ${spec.status} has no readable ${FAMILY_DIM}`);
  const list = readPath(state, P.statuses(spec.subject));
  const inst = { status: spec.status, severity: spec.severity, since: clockView(engine, state).day, source: spec.source, bodyPart: spec.bodyPart };
  writePath(state, P.statuses(spec.subject), [...(Array.isArray(list) ? list : []), inst]);
  return Object.freeze({ ...inst, family: f.value });
}

// 被委托写者：卷四 D-2 的 die（death.mjs）经 state-owners systems.sys.death.writeDelegations 登记的委托调本函数（kernel/transaction.mjs runDelegated）。
registerDelegate('status.mjs#addStatusInstance', addStatusInstance);
