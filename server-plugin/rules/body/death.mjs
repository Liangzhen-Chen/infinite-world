// 个体死亡（卷四 §4.8 D-1–D-4；S2-0b）：die 是全书致死的唯一入口（D-1），只做「身死」——写终止类状态实例（D-2），
// 随后在同一事务内调终止协议 terminate（D-3）；settleBody 是登记给个体类的清理函数，在协议第 1 步内、标记之前产出尸体（D-4）；
// dieByDestroy 是登记给个体类的终止发起方，destroy 原语经 engine.lifecycle.destroy 按 state-owners systems.death.terminationTrigger 路由到这里（草案 §4.1）。
// 不写死任何状态行、组件类、死因或材料组代号：一律取 rules.death（world/rules/tables/death.json）；不按 kind、物种或 id 分支。
// 复生（requestRevive，D-6）与 inherit/liquidate 下在所在地点新建尸体归 S2-0c。

import { KernelError } from '../../kernel/errors.mjs';
import { T } from '../../kernel/handles.mjs';
import { setEntityProp } from '../../kernel/storage.mjs';
import { clockMinute } from '../../kernel/scheduler.mjs';
import { ruleValue } from '../load/registry.mjs';
import { terminate, registerTerminationCleanup, registerTerminationTrigger } from '../lifecycle/terminate.mjs';
import { addStatus } from '../status/status.mjs';
import { terminated } from './action-capacity.mjs';
import { carcassOf } from './carcass.mjs';
import { bodyOf } from './body.mjs';

/** 终止协议与身体读入口共用的 engine 形状。 @typedef {import('../lifecycle/records.mjs').LifeEngine & import('./body-plan.mjs').BodyEngine} DeathEngine */
/** @typedef {import('../lifecycle/terminate.mjs').TerminationInfo} TerminationInfo */

const DEATH = 'death';
// rules.death 的键（卷四 §2.5 :318；destroyCause、corpseMaterialGroup 为 S2-0b 新增，裁定 R4、G2）。
const RULE = Object.freeze({
  terminalStatus: 'terminalStatus', corpseClass: 'corpseClass', destroyCause: 'destroyCause', corpseMaterialGroup: 'corpseMaterialGroup',
});
// 尸体的物品维度（卷三乙 §2.3 :236 实例维度、§4.2 :905 classes；卷四 §4.8.1 :867 requires massKg、material）。
const CORPSE_DIM = Object.freeze({
  classes: 'classes', ofSpecies: 'ofSpecies', ofPerson: 'ofPerson', diedMinute: 'diedMinute', massKg: 'massKg', material: 'material',
});

/**
 * kernelApi `die(engine, state, subjectId, {cause, source}, tx)`（卷四 :428 D-1、D-2；勘误 1126s20 末尾加 tx）：
 * 已终止（卷二 §2.5 谓词）即无操作返回；否则经 status.mjs 写 rules.death.terminalStatus 所指状态行的实例，再同一事务内调 terminate。
 * 终止类实例的实例 id 取该状态行代号：同一主体只会身死一次（幂等），实例随即在协议第 5 步清掉（卷四 :881），不留存。
 * @param {DeathEngine} engine @param {unknown} state @param {string} subjectId @param {{cause: string, source: string | null}} death @param {unknown} tx
 */
export function die(engine, state, subjectId, death, tx) {
  if (terminated(engine, state, subjectId).ok) return;
  const d = Object(death);
  const status = String(ruleValue(Object(engine.docData), DEATH, RULE.terminalStatus));
  addStatus(engine, state, subjectId, status, status, tx);
  terminate(state, subjectId, d.cause, d.source === undefined ? null : d.source, tx);
}

/**
 * 终止发起方（destroy 原语路由，草案 §4.1、裁定 R4）：cause 取 rules.death.destroyCause（卷二十五 :579），source 暂为 null（事件类型表未建）。
 * @param {DeathEngine} engine @param {unknown} state @param {string} subjectId @param {unknown} tx
 */
export function dieByDestroy(engine, state, subjectId, tx) {
  die(engine, state, subjectId, { cause: String(ruleValue(Object(engine.docData), DEATH, RULE.destroyCause)), source: null }, tx);
}

/**
 * 清理函数 settleBody(engine, state, {id, cause, mode, successorId}, tx)（卷四 :430、D-4；卷二 :561）：协议第 1 步内、标记之前，个体尚未标记、状态实例还在。
 * carcassOf({subjectId}) 为空（物种无实体、参与部位全失）即不产尸体，残骸不补组件类；
 * mode 为 wreck：协议原地生成的残骸就是尸体，经物品写者补 rules.death.corpseClass 与 ofSpecies、ofPerson、diedMinute、massKg、material；
 * material 按 rules.death.corpseMaterialGroup 归一组（组织→材料组映射卷文未找到，裁定 G2）。
 * inherit / liquidate 要在所在地点新建尸体，位置与地点持有未建 → E-ACT-WRITER-NOT-READY（S2-0c）。
 * @param {DeathEngine} engine @param {unknown} state @param {TerminationInfo} info @param {unknown} tx
 */
export function settleBody(engine, state, info, tx) {
  const carcass = carcassOf(engine, state, { subjectId: info.id });
  if (carcass === null) return;
  if (info.mode !== T.code_enum.successor_mode.wreck || info.successorId === null) {
    throw new KernelError('E-ACT-WRITER-NOT-READY', {}, `settleBody: mode ${info.mode} needs a new corpse at the death place, wait for S2-0c (position and place holdings)`);
  }
  const doc = Object(engine.docData);
  const group = String(ruleValue(doc, DEATH, RULE.corpseMaterialGroup));
  const corpse = info.successorId;
  setEntityProp(state, corpse, CORPSE_DIM.classes, [String(ruleValue(doc, DEATH, RULE.corpseClass))], tx);
  setEntityProp(state, corpse, CORPSE_DIM.ofSpecies, bodyOf(engine, state, info.id).speciesId, tx);
  setEntityProp(state, corpse, CORPSE_DIM.ofPerson, info.id, tx);
  setEntityProp(state, corpse, CORPSE_DIM.diedMinute, clockMinute(engine, state), tx);
  setEntityProp(state, corpse, CORPSE_DIM.massKg, carcass.massKg, tx);
  setEntityProp(state, corpse, CORPSE_DIM.material, Object.keys(carcass.material).sort().map((m) => ({ group, materialRef: m, share: carcass.material[m] })), tx);
}

/** 清理函数登记项（卷二 :561；装配层收进 engine.terminationCleanups，handlerRef 与 state-owners systems.death.terminationCleanup.handler 一致）。 */
export const SETTLE_BODY_CLEANUP = registerTerminationCleanup('rules/body/death.mjs#settleBody', settleBody);
/** 终止发起方登记项（草案 §4.1；装配层收进 engine.terminationTriggers，与 systems.death.terminationTrigger.handler 一致）。 */
export const DIE_BY_DESTROY_TRIGGER = registerTerminationTrigger('rules/body/death.mjs#dieByDestroy', dieByDestroy);
