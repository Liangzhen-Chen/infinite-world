// 格差分的读侧（卷五 §3.3 :362、§4.1 规则 15 :503、规则 16 :511；卷二 §1.5 :253 struct:gridCellDiff）：纯读，不写状态。
// 差分存在 `cells.<w>.<里块>.<格键>`，每格一条 `{material, fixture, mark, sinceMinute}`（material、fixture、mark 为空即该项不覆盖基底）；
// 唯一写者是规则层的 grid-diff.mjs（只经 alterCells），本文件只给 gridView 与写者共用的读入口，不碰写。
// 全空记录（三项都为空）读作"没有差分"：状态存储没有删除原语（卷二 §2.6 只有 writePath），alterCells 清除一格的差分写成全空记录，读侧一律不当差分。
// 格键、里块号的编解码只经 kernel/handles/keys.mjs 的 gridKeyOf、gridKeyParse，不自己拼串。

import { gridKeyOf, gridKeyParse } from './handles/keys.mjs';

const FIELD = Object.freeze({ material: 'material', fixture: 'fixture', mark: 'mark', sinceMinute: 'sinceMinute' });
const ROOT_KEY = 'cells';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * `cells.<w>.<里块>.<格键>` 路径的三段文本（w 段、里块号段、格键段；唯一可逆，卷二 :852）：写者经它拼路径（P.cells(w, chunk, cell)），不自己拼串。
 * @param {{cellM: number, regionCellM: number, chunkRegionCells: number}} grid rules.grid @param {{w: number, x: number, y: number, z: number}} pos
 * @returns {{w: string, chunk: string, cell: string}}
 */
export function diffPathSegments(grid, pos) {
  return gridKeyOf(grid, pos);
}

/**
 * 这条记录是不是真有覆盖（三项里至少一项非空）。
 * @param {unknown} rec
 * @returns {boolean}
 */
export function isActiveDiff(rec) {
  return isObj(rec) && (rec[FIELD.material] !== null && rec[FIELD.material] !== undefined
    || rec[FIELD.fixture] !== null && rec[FIELD.fixture] !== undefined
    || rec[FIELD.mark] !== null && rec[FIELD.mark] !== undefined);
}

// 状态里某（格空间, 里块）那一片：没有为 undefined。
function chunkOf(state, w, chunk) {
  const root = isObj(state) ? state[ROOT_KEY] : undefined;
  const space = isObj(root) ? root[String(w)] : undefined;
  return isObj(space) ? space[chunk] : undefined;
}

/**
 * 差分读口：每次 gridView 调用或每笔 alterCells 建一个，内部只缓存本次的里块索引（不跨调用、不进状态）。
 * - `cellAt(w, x, y, z)`：该格的有效差分记录（冻结副本）或 null；
 * - `columnTop(w, x, y)`：该列有差分的最高层号或 null（没有）；
 * - `activeIn(w, box)`：闭区间格范围 {x0, y0, z0, x1, y1, z1} 内有差分的格，按 (x, y, z) 字典序，每项 {x, y, z, rec}。
 * @param {any} state @param {{cellM: number, regionCellM: number, chunkRegionCells: number}} grid rules.grid
 */
export function createDiffReader(state, grid) {
  /** @type {Map<string, Map<string, Map<number, any>>>} 里块片键 → 列键 → 层号 → 记录（只含有效差分） */
  const chunks = new Map();
  const indexOf = (w, chunkText) => {
    const memoKey = `${w}|${chunkText}`;
    let idx = chunks.get(memoKey);
    if (idx !== undefined) return idx;
    idx = new Map();
    const raw = chunkOf(state, w, chunkText);
    if (isObj(raw)) {
      for (const cellText of Object.keys(raw)) {
        const parsed = gridKeyParse([String(w), chunkText, cellText]);
        if (parsed === null || !isActiveDiff(raw[cellText])) continue;
        const col = `${parsed.x},${parsed.y}`;
        if (!idx.has(col)) idx.set(col, new Map());
        idx.get(col).set(parsed.z, raw[cellText]);
      }
    }
    chunks.set(memoKey, idx);
    return idx;
  };
  const freeze = (rec) => Object.freeze({ material: rec[FIELD.material] ?? null, fixture: rec[FIELD.fixture] ?? null, mark: rec[FIELD.mark] ?? null, sinceMinute: rec[FIELD.sinceMinute] });
  return {
    cellAt(w, x, y, z) {
      const key = gridKeyOf(grid, { w, x, y, z });
      const rec = chunkOf(state, w, key.chunk);
      const hit = isObj(rec) ? rec[key.cell] : undefined;
      return isActiveDiff(hit) ? freeze(hit) : null;
    },
    columnTop(w, x, y) {
      const key = gridKeyOf(grid, { w, x, y, z: 0 });
      const col = indexOf(w, key.chunk).get(`${x},${y}`);
      if (col === undefined || col.size === 0) return null;
      let top = null;
      for (const z of col.keys()) if (top === null || z > top) top = z;
      return top;
    },
    activeIn(w, box) {
      const out = [];
      // 范围两个对角所在里块定出里块号范围（里块号随格坐标单调不减）；每个里块只扫一次，再按格范围筛。
      const lo = gridKeyParse(Object.values(gridKeyOf(grid, { w, x: box.x0, y: box.y0, z: 0 })));
      const hi = gridKeyParse(Object.values(gridKeyOf(grid, { w, x: box.x1, y: box.y1, z: 0 })));
      for (let chunkX = lo.cx; chunkX <= hi.cx; chunkX += 1) {
        for (let chunkY = lo.cy; chunkY <= hi.cy; chunkY += 1) {
          for (const [col, byZ] of indexOf(w, `${chunkX}:${chunkY}`)) {
            const [cx, cy] = col.split(',').map(Number);
            if (cx < box.x0 || cx > box.x1 || cy < box.y0 || cy > box.y1) continue;
            for (const [z, rec] of byZ) if (z >= box.z0 && z <= box.z1) out.push({ x: cx, y: cy, z, rec: freeze(rec) });
          }
        }
      }
      return out.sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);
    },
  };
}
