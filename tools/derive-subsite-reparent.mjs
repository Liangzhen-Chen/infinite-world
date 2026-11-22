// 子站点改挂清单的推导与核对入口（李白 11-23 事件 47df4cc8 G5b-D 选甲）：world/geo/subsite-reparent.json 是本脚本的产出，不是手写数据。
// 规则（一条，逐轮收敛）：转换脚本读旧数据加附表、不带清单（convertGeo opts.subsites = {}），生成补缺（站点面积由占地反推）后，对候选表反复求区域足迹（卷五 planFootprints，纯读，
// 不推进世界）；凡区域行的种子区格落在父足迹之外（E-GRID-FOOTPRINT-OUTSIDE-PARENT），坐标不动，按坐标改挂"足迹含该种子区格的最深政区或存量单元行"（非水体；该格若在别的站点足迹里，
// 因只取政区与存量单元，自然上到它们），原父站点记 originSite，距离 = 种子点到原父站点足迹最近区格方块的欧氏距离（米，四舍五入）。改挂后再求足迹，直到没有违规；
// 下一层的违规要上一层改挂后才冒出来，所以要多轮。生成补缺随种子与站点面积变，清单须重推。
// 用法：node tools/derive-subsite-reparent.mjs            打印推导结果（JSON，由人写入 world/geo/subsite-reparent.json）
//       node tools/derive-subsite-reparent.mjs --check    与入库清单逐行比对（parent、originSite、distanceM），有差异退出码 1
// 全规模求足迹一遍约十几秒，补缺约两分钟，须单独跑，不进全量测试。距离只是留痕，用到浮点（hypot），不进任何规则层。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { planFootprints } from '../server-plugin/kernel/place.mjs';
import { convertGeo, fillPlace, loadDoc } from './convert-geo-g5b.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const CELL_M = 100; // rules.grid.regionCellM
const MAX_ROUNDS = 20;

/**
 * @param {(msg: string) => void} [log]
 * @returns {{rows: Record<string, {distanceM: number, originSite: string, parent: string}>, rounds: number[]}} rounds：每轮违规行数（末项恒为 0）
 */
export function deriveSubsites(log = () => {}) {
  const out = convertGeo(join(REPO, 'world/geo'), { subsites: {} });
  const { doc } = fillPlace(out, log);
  const classesOf = (id) => (doc.rows[id] && Array.isArray(doc.rows[id].classes) ? doc.rows[id].classes : []);
  const depthOf = (id) => { let d = 0; for (let p = doc.rows[id] && doc.rows[id].parent; p; p = doc.rows[p] && doc.rows[p].parent) d += 1; return d; };
  const isJurisdictionOrTract = (id) => doc.rows[id] !== undefined && !classesOf(id).includes('comp_waterbody') && (typeof doc.rows[id].regionLevel === 'string' || classesOf(id).includes('comp_tract'));
  const moves = new Map();
  const rounds = [];
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const world = loadDoc(doc);
    const base = {};
    for (const [id, flat] of world.tables.get('place').flat.rows) base[id] = { ...flat, classes: classesOf(id) }; // flat 行不带 classes，补上才与生成补缺同一口径
    const fp = planFootprints(world, { base, withCells: false, bed: false, heights: false });
    const bad = fp.errors.filter((e) => e.code === 'E-GRID-FOOTPRINT-OUTSIDE-PARENT' && /seed cell/.test(e.detail));
    rounds.push(bad.length);
    log(`round ${round}: ${bad.length} seeds outside their parent footprint (${fp.errors.length} plan errors)`);
    if (bad.length === 0) {
      if (fp.errors.length > 0) throw new Error(`derive-subsite-reparent: other footprint errors remain: ${fp.errors[0].code} ${fp.errors[0].id} ${fp.errors[0].detail}`);
      break;
    }
    for (const e of bad) {
      const r = doc.rows[e.id];
      const sx = Math.floor(r.coord.x / CELL_M);
      const sy = Math.floor(r.coord.y / CELL_M);
      let best = null;
      for (const id of Object.keys(fp.footprints)) {
        if (id === e.id || !isJurisdictionOrTract(id) || !fp.probe.has(id, sx, sy)) continue;
        const dep = depthOf(id);
        if (best === null || dep > best.dep || (dep === best.dep && id < best.id)) best = { id, dep };
      }
      if (best === null) throw new Error(`derive-subsite-reparent: no jurisdiction or stock unit contains the seed of ${e.id}`);
      let dmin = Infinity;
      for (const c of fp.probe.cells(r.parent)) {
        const dx = Math.max(c.x * CELL_M - r.coord.x, 0, r.coord.x - (c.x + 1) * CELL_M);
        const dy = Math.max(c.y * CELL_M - r.coord.y, 0, r.coord.y - (c.y + 1) * CELL_M);
        const d = Math.hypot(dx, dy);
        if (d < dmin) dmin = d;
      }
      const prev = moves.get(e.id);
      moves.set(e.id, { originSite: prev ? prev.originSite : r.parent, parent: best.id, distanceM: prev ? prev.distanceM : Math.round(dmin) });
      r.parent = best.id;
    }
    if (round === MAX_ROUNDS) throw new Error('derive-subsite-reparent: not converged');
  }
  const rows = {};
  for (const [id, m] of [...moves].sort((a, b) => (a[0] < b[0] ? -1 : 1))) rows[id] = { distanceM: m.distanceM, originSite: m.originSite, parent: m.parent };
  return { rows, rounds };
}

function main() {
  const t0 = Date.now();
  const log = (m) => process.stderr.write(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}\n`);
  const { rows, rounds } = deriveSubsites(log);
  if (process.argv.includes('--check')) {
    const kept = JSON.parse(readFileSync(join(REPO, 'world/geo/subsite-reparent.json'), 'utf8')).rows;
    const ids = [...new Set([...Object.keys(rows), ...Object.keys(kept)])].sort();
    const diff = ids.filter((id) => JSON.stringify(rows[id]) !== JSON.stringify(kept[id]));
    process.stderr.write(`derived ${Object.keys(rows).length} rows in ${rounds.length} rounds; stored ${Object.keys(kept).length}; differing ${diff.length}${diff.length > 0 ? `: ${diff.slice(0, 5).join(' | ')}` : ''}\n`);
    process.exit(diff.length === 0 ? 0 : 1);
  }
  process.stdout.write(`${JSON.stringify({ rounds, rows }, null, 1)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
