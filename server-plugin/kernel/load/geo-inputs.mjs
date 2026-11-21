// 真实世界地理生成输入的读入口（数据卡 world/geo/elevation-controls.json、water-bodies.json、settlements.json；卷十 R10-1.7 :374、卷五 §4.3 规则 8 控制海拔）。
// 这些文件是转换输入（加载器暂不读它们进表），本读入口把它们整理成"作者输入"交给生成阶段当作者数据读（手写优先）：
//   authored：id → 维度键值（控制海拔写进 anchorElevationM；水体行带它们写明的组件类、水体类、液体、下游，父取包含树的根）；
//   downhill：高低次序链（河面海拔自上游向下游不增）；
//   buildingIds：旧数据里标明是建筑的行 id（建筑不是区域足迹，不进自然量的区域足迹行）。
// 只读文件、整理形状，不补任何值（文件里写 unknown 或没有的量留缺，由生成阶段补）。字段名只在 world/geo 数据卡定义的这几处；本文件不认任何具体行 id。

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseJsonStrict } from './json-text.mjs';

const GEO_DIR = 'world/geo';
const FILES = Object.freeze({ controls: 'elevation-controls.json', water: 'water-bodies.json', settlements: 'settlements.json' });

function readJson(root, name) {
  const path = join(root, GEO_DIR, name);
  if (!existsSync(path)) return null;
  const parsed = parseJsonStrict(readFileSync(path, 'utf8'));
  if (parsed.errors.length) throw new Error(`E-DIM-STRUCT-FIELD ${GEO_DIR}/${name}: ${parsed.errors[0].code} at ${parsed.errors[0].pointer}`);
  return parsed.value;
}

/**
 * @param {string} root 仓库根 @param {{rootId: string, elevationDim: string}} opts rootId：地点表包含树的根行 id（水体行的父，取自表里 parent 为空的那一行）；elevationDim：控制海拔写进的维度键
 * @returns {{authored: Map<string, Record<string, any>>, downhill: Array<{chain: string[]}>, buildingIds: string[]}}
 */
export function readGeoInputs(root, opts) {
  const authored = new Map();
  const put = (id, dims) => authored.set(id, { ...(authored.get(id) || {}), ...dims });
  const controls = readJson(root, FILES.controls);
  const rows = controls && controls.rows && typeof controls.rows === 'object' ? controls.rows : {};
  for (const id of Object.keys(rows).sort()) if (Number.isFinite(rows[id].anchorElevationM)) put(id, { [opts.elevationDim]: rows[id].anchorElevationM });
  const downhill = controls && controls.downhill && Array.isArray(controls.downhill.chain) ? [{ chain: [...controls.downhill.chain], dim: opts.elevationDim }] : [];
  const water = readJson(root, FILES.water);
  for (const b of water && Array.isArray(water.bodies) ? water.bodies : []) {
    const dims = { parent: opts.rootId, classes: [...b.classes] };
    if (typeof b.waterKind === 'string') dims.waterKind = b.waterKind;
    if (typeof b.liquid === 'string') dims.liquid = b.liquid;
    if (b.downstream === null || typeof b.downstream === 'string') dims.downstream = b.downstream;
    put(b.id, dims);
  }
  const settlements = readJson(root, FILES.settlements);
  const buildingIds = [];
  for (const s of Array.isArray(settlements) ? settlements : []) for (const id of Array.isArray(s.buildingIds) ? s.buildingIds : []) buildingIds.push(id);
  return { authored, downhill, elevationDim: opts.elevationDim, buildingIds: [...new Set(buildingIds)].sort() };
}
