// 新骨架入口（S1-1 卡 A/B1；docs/gemini/kickoff-1125.md:493 的入口形状；Gemini 裁定 msg_82485b7f7ab7）。
// 装配层：读世界维度表、命名 struct、state-owners 的 stateKeys 与 pathTypes、规则表 host，建 engine（含路径句柄 P）与初始 state，
// 返回 {engine, state, submitProposal, advance}。状态由登记写者文件的初始化函数在一笔事务里建，本文件不写状态。
// 读文件只在装配层（本文件），kernel 内的规则零件不读文件；不引任何归档文件。

import { readdirSync, readFileSync } from 'node:fs';
import { mountKernel } from './rules/load/mount.mjs';

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
 * SillyTavern 服务端插件入口：装配 engine 与初始 state，返回 {engine, state, submitProposal, advance}（S1-1 卡 B1）。
 * @returns {Promise<{engine: any, state: any, submitProposal: (p: any) => any, advance: (m: number) => any}>}
 */
export async function init() {
  const json = (/** @type {string} */ f) => JSON.parse(readFileSync(new URL(f, WORLD_ONTOLOGY), 'utf8'));
  return mountKernel({
    dimensionDocs: readDimensionDocs(),
    namedStructsDoc: json('named-structs.json'),
    owners: json('state-owners.json'),
    hostRows: json('../rules/tables/host.json').rows,
    primitivesDoc: json('primitives.json'),
  });
}
