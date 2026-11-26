// 新骨架入口（S1-1 卡 A；docs/gemini/kickoff-1125.md:493 的入口形状；Gemini 裁定 msg_82485b7f7ab7）。
// 本卡只做装配的第一段：读世界维度表、命名 struct 与 state-owners 的 stateKeys 登记，建 engine 雏形与最小 state，然后抛「卡 B/C 未实现」。
// 抛出的错误对象带 engine 与 state 属性，后续卡（B 事务/时间推进/存档、C 加载器移入 rules/ 与挂载强断言）改成返回值。
// 读文件只在装配层（本文件），kernel 内的规则零件不读文件；不引任何归档文件。

import { readdirSync, readFileSync } from 'node:fs';
import { buildRegistry } from './rules/load/registry.mjs';
import { installNamedStructs } from './kernel/named-structs.mjs';

const WORLD_ONTOLOGY = new URL('../world/ontology/', import.meta.url);

// 维度表目录里除下划线开头的元表外都是实体表；文件名即 kind（加载器按 E-DIM-SCHEMA-KIND 核）。排序只为确定性。
function readDimensionDocs() {
  const dir = new URL('dimensions/', WORLD_ONTOLOGY);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .sort()
    .map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
}

/**
 * SillyTavern 服务端插件入口。新骨架装配尚未实现，调用即抛（错误对象带 engine 与 state）。
 * @returns {Promise<never>}
 */
export async function init() {
  const registry = buildRegistry(readDimensionDocs());
  const structs = installNamedStructs(JSON.parse(readFileSync(new URL('named-structs.json', WORLD_ONTOLOGY), 'utf8')));
  // 顶层状态键的登记表（state-owners.json 的 stateKeys，卷二 §2.7 :580）；内核按它判 writePath 的顶层键是否已声明。
  const owners = JSON.parse(readFileSync(new URL('state-owners.json', WORLD_ONTOLOGY), 'utf8'));
  const stateKeys = Object.freeze({ ...(owners && owners.stateKeys ? owners.stateKeys : {}) });
  const engine = Object.freeze({ registry, structs, modifierSources: Object.freeze([]), stateKeys });
  const initial = { created: {} };
  throw Object.assign(new Error('新骨架未实现：S1-1 卡 B/C'), { engine, state: initial });
}
