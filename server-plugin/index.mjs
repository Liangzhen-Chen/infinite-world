// 新骨架入口（S1-1 卡 A/B1/B2；docs/gemini/kickoff-1125.md:493 的入口形状；Gemini 裁定 msg_82485b7f7ab7）。
// 装配层：读世界维度表、命名 struct、state-owners、规则表 host 与 saveLayout、存档排除表，读源码清单、取摘要能力，
// 建 engine 与初始 state、日志簿，返回 {engine, state, logBook, submitProposal, advance, save}。本文件不写状态。
// 读文件只在装配层（本文件），kernel 内的规则零件不读世界文件；不引任何归档文件。
// saveSlot / loadSlot / replay_apply 是存读档的公共入口（绑定 engine 后调 kernel 的 writeSlot / readSlot / replayApply）；S1-3 接 menu 后由 menu-entry 调同一 kernel 函数。

import { readdirSync, readFileSync } from 'node:fs';
import { mountKernel } from './rules/load/mount.mjs';
import { createDigestCap } from './textcore/digest.mjs';
import { writeSlot } from './kernel/save.mjs';
import { readSlot, replayApply } from './kernel/load/save.mjs';

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

/** 世界数据（即存档的 doc_data 副本，卷二十七 :543）。 */
function readWorld() {
  const json = (/** @type {string} */ f) => JSON.parse(readFileSync(new URL(f, WORLD_ONTOLOGY), 'utf8'));
  const registry = json('../rules/registry.json').rows;
  const spec = (/** @type {string} */ code) => registry.find((/** @type {any} */ r) => r.code === code);
  return {
    dimensionDocs: readDimensionDocs(),
    namedStructsDoc: json('named-structs.json'),
    owners: json('state-owners.json'),
    hostRows: json('../rules/tables/host.json').rows,
    hostSpec: spec('host'),
    saveLayoutRows: json('../rules/tables/save-layout.json').rows,
    saveLayoutSpec: spec('saveLayout'),
    digestExclude: json('../rules/tables/digest-exclude.json').paths,
    primitivesDoc: json('primitives.json'),
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

/** 装配层注入 kernel 的能力：摘要能力、存档根目录（可覆盖，file: URL，以 / 结尾）、源码清单。 @param {{saveRoot?: URL}} opts */
function capsOf(opts) {
  return { digestCap: createDigestCap(), saveRoot: opts.saveRoot === undefined ? DEFAULT_SAVE_ROOT : opts.saveRoot, sources: readSources() };
}

/**
 * SillyTavern 服务端插件入口：装配 engine、初始 state 与日志簿（S1-1 卡 B2）。
 * @param {{saveRoot?: URL}} [opts] saveRoot 覆盖默认存档根目录（仓库 saves/）
 */
export async function init(opts = {}) {
  return mountKernel(readWorld(), capsOf(opts));
}

/** 存槽（薄壳）。 @param {{engine: any, state: any, logBook: any}} world @param {number} [slot] */
export function saveSlot(world, slot = 0) {
  return writeSlot(world.engine, world, slot);
}

/**
 * 读档（薄壳，不复演）：以当前程序与世界数据装配的 engine 比两个指纹。
 * @param {{slot: number}} manifest @param {{saveRoot?: URL}} [opts]
 */
export function loadSlot(manifest, opts = {}) {
  const caps = capsOf(opts);
  const current = mountKernel(readWorld(), caps);
  return { ...readSlot(current.engine, manifest.slot), caps };
}

/** 读档复演（薄壳）：由存档的 doc_data 重建 engine（卷二十七 :543 世界只读自己的副本），再 replay_apply（:740）。 @param {any} loaded */
export function replay_apply(loaded) {
  const { engine } = mountKernel(loaded.docData, loaded.caps);
  return replayApply(engine, loaded);
}
