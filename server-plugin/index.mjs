// 新骨架入口（S1-1 卡 A/B1/B2；docs/gemini/kickoff-1125.md:493 的入口形状；Gemini 裁定 msg_82485b7f7ab7）。
// 装配层：读世界维度表、命名 struct、state-owners、规则表登记 registry.json 及其登记的全部规则表、存档排除表，读源码清单、取摘要能力，
// 交 mountKernel 组装、核对并建 engine 与 state、日志簿；再由宿主 router 取路由能力挂 menu 与存档两路（S1-3b）。本文件不写状态。
// 读文件只在装配层（本文件），kernel 内的规则零件不读世界文件；不引任何归档文件。
// saveSlot / loadSlot / replay_apply 是进程内的存读档薄壳（saveSlot 调 kernel 的 writeSlot，loadSlot 调 readSlot，replay_apply 经 mountKernel 复演）；玩家经 menu 路由存读档时由 menu-entry 调同一 kernel 函数。

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { mountKernel } from './rules/load/mount.mjs';
import { mergeOwners, shardDirOf } from './rules/load/registry-shards.mjs';
import { createDigestCap } from './textcore/digest.mjs';
import { writeSlot, mountSaveRoutes } from './kernel/save.mjs';
import { readSlot } from './kernel/load/save.mjs';
import { createRouterCaps } from './rules/transport/router-caps.mjs';
import { mountMenuEntry } from './rules/transport/menu-entry.mjs';

const REPO = new URL('../', import.meta.url);
const WORLD_ONTOLOGY = new URL('world/ontology/', REPO);
const DEFAULT_SAVE_ROOT = new URL('saves/', REPO);

// 维度表目录里除下划线开头的元表外都是实体表；文件名即 kind（加载器按 E-DIM-SCHEMA-KIND 核）。排序只为确定性。
function readDimensionDocs() {
  const dir = new URL('dimensions/', WORLD_ONTOLOGY);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .sort()
    .map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
}

/** 动作目录文件（world/actions/*.json，卷九 §2.2），按文件名排序只为确定性。 */
function readActionDocs() {
  const dir = new URL('../actions/', WORLD_ONTOLOGY);
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
}

/**
 * state-owners 声明表（卷二 :57）= 主文件与 state-owners.d/ 下分片按文件名次序的合并结果（S2-SH；合并规则在 rules/load/registry-shards.mjs）。
 * 合并在装配层一次完成，结果进 doc_data；读档复演用存档里的这一份，不再读分片目录。
 */
function readOwners() {
  const rel = (/** @type {URL} */ u) => u.href.slice(REPO.href.length);
  const main = new URL('state-owners.json', WORLD_ONTOLOGY);
  const dir = new URL(`${shardDirOf(rel(main))}/`, REPO);
  const names = existsSync(dir) ? readdirSync(dir).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) : [];
  const shards = names.map((n) => ({ file: rel(new URL(n, dir)), doc: JSON.parse(readFileSync(new URL(n, dir), 'utf8')) }));
  return mergeOwners({ file: rel(main), doc: JSON.parse(readFileSync(main, 'utf8')) }, shards).doc;
}

/** 世界数据原文（即存档的 doc_data 副本，卷二十七 :543、:547）：规则表按 registry.json 每行的 file 逐个读（不点名表），按登记 code 收进 tableDocs；组装与核对在 rules/load/registry.mjs#loadWorld。 */
function readWorld() {
  const json = (/** @type {string} */ f) => JSON.parse(readFileSync(new URL(f, WORLD_ONTOLOGY), 'utf8'));
  const rulesDir = new URL('../rules/', WORLD_ONTOLOGY);
  const registryRows = JSON.parse(readFileSync(new URL('registry.json', rulesDir), 'utf8')).rows;
  const tableDocs = Object.fromEntries(registryRows.map((/** @type {{code: string, file: string}} */ r) => [r.code, JSON.parse(readFileSync(new URL(r.file, rulesDir), 'utf8'))]));
  return {
    dimensionDocs: readDimensionDocs(),
    namedStructsDoc: json('named-structs.json'),
    owners: readOwners(),
    registryRows,
    tableDocs,
    digestExclude: json('../rules/tables/digest-exclude.json').paths,
    primitivesDoc: json('primitives.json'),
    // 词表族（能力族条目的 dimKey 等，bodyView 读；S1-2b）。
    vocabDoc: json('dimensions/_vocab.json'),
    // 单位表（日与分钟的换算等，rules/lifecycle/terminate.mjs 写终止标记的日时读；S2-0a）。
    unitsDoc: json('dimensions/_units.json'),
    // 采样表（normal 分位数表与 exp 表，rules/gen/sample.mjs 读、mount 装入时核摘要；S1-3c）。
    distributionsDoc: json('dimensions/_distributions.json'),
    // 上下行 wire schema 的唯一数据源（卷二 :983；S1-3b），随 doc_data 进存档，读档复演同用存档里的一份。
    wire: json('../schema/wire-v1.json'),
    // 效果族表与动作目录（卷二 §3.9、卷九 §2.2；S1-3a）。
    effectsDoc: json('dimensions/_effects.json'),
    actionDocs: readActionDocs(),
  };
}

/** 目录下全部 .mjs 的 URL（递归，按名字排序只为确定性）。 @param {URL} dir @returns {URL[]} */
function mjsUnder(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((d) => (d.isDirectory() ? mjsUnder(new URL(`${d.name}/`, dir)) : d.name.endsWith('.mjs') ? [new URL(d.name, dir)] : []));
}

/** 源码清单（engineRulesDigest 用，卷二十七 :544）：kernel/files.json 登记的内核文件 ∪ server-plugin/rules 下全部 .mjs，按仓库相对路径排序。 */
function readSources() {
  const kernel = JSON.parse(readFileSync(new URL('server-plugin/kernel/files.json', REPO), 'utf8'));
  const rules = mjsUnder(new URL('server-plugin/rules/', REPO)).map((u) => u.href.slice(REPO.href.length));
  return [...kernel, ...rules].sort().map((path) => ({ path, text: readFileSync(new URL(path, REPO), 'utf8') }));
}

/**
 * 存档根目录归一（唯一一处）：路径字串经 pathToFileURL 转 file: URL，URL 照用；两者都确保以 / 结尾。kernel 只收 URL。
 * @param {string | URL | undefined} root @returns {URL}
 */
function saveRootOf(root) {
  const url = root === undefined ? DEFAULT_SAVE_ROOT : typeof root === 'string' ? pathToFileURL(root) : new URL(root.href);
  return url.href.endsWith('/') ? url : new URL(`${url.href}/`);
}

/**
 * 装配层注入 kernel 的能力：摘要能力、存档根目录（可覆盖，路径字串或 file: URL）、源码清单、修正来源。
 * 修正来源显式交空数组（S1 无修正项数据；卷二 :1386 的数据来源接入时由修正规则模块产出）；不交 unitOfPath（S1 分片全为整片，卷二十七 :553）。
 * @param {{saveRoot?: string | URL}} opts
 */
function capsOf(opts) {
  return { digestCap: createDigestCap(), saveRoot: saveRootOf(opts.saveRoot), sources: readSources(), modifierSources: Object.freeze([]) };
}

/**
 * SillyTavern 服务端插件入口（卷二 :1033 init(router)；主会话裁定 Q2：init(router, opts)）：装配 engine、初始 state 与日志簿，
 * 由宿主 router 取路由能力，挂 menu 路由（mountMenuEntry）与 save_export、save_import 两路（mountSaveRoutes）。返回开局的这一局。
 * @param {any} router 宿主交入的 express Router（必传，卷二:1033）
 * @param {{saveRoot?: string | URL}} [opts] saveRoot 覆盖默认存档根目录（仓库 saves/）
 */
export async function init(router, opts = {}) {
  const caps = capsOf(opts);
  const world = mountKernel(readWorld(), caps);
  const { requestCap, replyCap } = createRouterCaps(router);
  mountMenuEntry(requestCap, replyCap, { world, caps });
  mountSaveRoutes(requestCap, replyCap, world);
  return world;
}

/** 存槽（薄壳）。 @param {{engine: any, state: any, logBook: any}} world @param {number} [slot] */
export function saveSlot(world, slot = 0) {
  return writeSlot(world.engine, world, slot);
}

/**
 * 读档（薄壳，不复演）：以当前程序与世界数据装配的 engine 比两个指纹。
 * @param {{slot: number}} manifest @param {{saveRoot?: string | URL}} [opts]
 */
export function loadSlot(manifest, opts = {}) {
  const caps = capsOf(opts);
  const current = mountKernel(readWorld(), caps);
  return { ...readSlot(current.engine, manifest.slot), caps };
}

/**
 * 读档复演（薄壳）：由存档的 doc_data 装配 engine（卷二十七 :543 世界只读自己的副本）并复演（:740），返回与 init 同形（可接着玩）另带 saveDigest。
 * @param {any} loaded loadSlot 的结果
 */
export function replay_apply(loaded) {
  return mountKernel(loaded.docData, loaded.caps, loaded);
}
