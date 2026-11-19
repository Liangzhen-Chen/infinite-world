// 状态容器读入口 `statusView`（卷二《维度表规范与统一入口》§1.11 :334–:354、§2.1 入口 21 :458、§2.7 :569 `statuses` 登记）：
// 主体名下的状态实例 `state.statuses[subjectId][] = {status, severity, since, source, bodyPart}`（§1.5 struct:statusInstance）原样读出，
// 每个实例带上它的状态行所属的族代号 `family`（状态行是 kind status 表的行，`family` 是该表维度，§1.11 :338）。
// 块 6 只做最小版（迁移体检 6-5）：不求档、不求修正集合、不判"作数"（卷二十一 R21-1.11、§3.1 与 modifier.mjs 归后面的卡）；
// 本文件不读族条目的 terminal、incapacitating、suppressesAwake 字段（读者只有 action-capacity.mjs，§2.5 :495、卷四 P-5 (b)）。
// 状态实例的写者（§1.11 :354 唯一写者 status.mjs）块 6 没有玩法写它，不在本卡建；本文件纯读，不设缓存。

import { dim } from './kernel/dimensions.mjs';
import { readPath } from './kernel/storage.mjs';
import { kindOf } from './kernel/vocab.mjs';
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
