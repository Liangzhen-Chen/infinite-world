// 测试夹具共用：把真实地点表缩成"小格世界"。真实世界的格空间是全规模外包框（区格数千万级），足迹、形心、海拔要全规模划分与高度场，手算不了、本机也慢；
// 需要"落在某个真实地点上的位置、纬度、海拔"的夹具，只留世界根、指定的一个真实地点（自成一个小格空间的层根，足迹是整个外包框，形心就是框中心，手算得出）、
// 以及调用方另加的几行；行的有效值取作者行加真实世界已烘入的 generated 节（作者行缺的必填列在那里）。
// 世界必有格空间表（卷五 §4.1.1 :425、:431）：世界根在真实世界里是层根，所以夹具里它另开一个 2 × 2 区格的空格空间（w 1）；指定地点是格空间 w 0 的层根
// （层根的足迹不在父足迹内，卷五 §4.1 规则 3 除外）。真实物品行与组织行引用真实地点行（origin、seat），夹具另用 miniDropRealRefs 去掉。
const clone = (v) => JSON.parse(JSON.stringify(v));

/** 真实世界的世界根行 id（旧数据"已知大陆"，tools/convert-geo-g5b.mjs WORLD_ROOT）。 */
export const WORLD_ROOT = 'loc_world';

/**
 * 原地改一份真实 place.json 的解析结果。
 * @param {any} doc @param {{place: string, box: {x0: number, y0: number, cellsX: number, cellsY: number}, extra?: (effective: (id: string) => any) => Record<string, any>}} opts
 */
export function miniPlaceDoc(doc, opts) {
  const effective = (id) => { const { generated: _mark, ...gen } = doc.generated[id] ?? {}; return { ...clone(doc.rows[id]), ...clone(gen) }; };
  const row = effective(opts.place);
  const extra = opts.extra ? opts.extra(effective) : {};
  doc.rows = {
    [WORLD_ROOT]: effective(WORLD_ROOT),
    [opts.place]: { ...row, parent: WORLD_ROOT, classes: [...row.classes, 'comp_layer_root'], ledgerHolder: true },
    ...extra,
  };
  doc.generated = {};
  doc.edges = [];
  doc.gridSpaces = [{ w: 0, box: opts.box, root: opts.place }, { w: 1, box: { x0: 0, y0: 0, cellsX: 2, cellsY: 2 }, root: WORLD_ROOT }];
}

/**
 * 气候读数用的小格世界（腐坏、估值等读"所在地点的当日温度"的测试）：地点要有纬度与海拔，两者都由足迹派生（卷五 §4.1.3 规则 13、卷二十 §2.7 :334），
 * 要手算得出、且与旧数据（纬度由 coord.y、海拔取太原单元的 779 m）读数一致：
 * - 纬度：place 行的旧 coord.y 是 100 m 的整数倍（区格边长），小格空间取 3 个区格一列，上两格（yc − 1、yc）归 place、下一格（yc + 1）归 child，
 *   place 足迹的形心 y = ((yc − 1) × 100 + 50 + yc × 100 + 50) ÷ 2 = yc × 100 = 旧 coord.y，纬度与旧值逐位相同；
 * - 海拔：place 与 child 的地形都取 terrain_river（起伏 reliefM 为 0），child 的控制海拔 779 m 是唯一控制点（层根不是控制点），所以两者海拔都是 779 m，
 *   与旧数据"地点没有自己的海拔、读单元的 779"等价（单元与地点之差为零，海拔修正为零）。
 * child 取调用方指定的真实地点行（取其列），挂在 place 下、种子在下一格中心、目标面积 1 区格。
 * more：另外要保留的真实地点行（如被真实物品行的 origin 引用的村），各占 place 下再下一格，列同 child，不是账本持有人。
 * @param {any} doc @param {{place: string, child: string, more?: string[]}} opts
 */
export function miniClimatePlaceDoc(doc, opts) {
  const old = doc.rows[opts.place].coord;
  if (old.y % 100 !== 0) throw new Error(`mini climate world: ${opts.place} coord.y ${old.y} is not a multiple of the region cell edge (100 m)`);
  const yc = old.y / 100;
  const more = opts.more ?? [];
  const at = (k) => ({ x: 50, y: (yc + 1 + k) * 100 + 50 });
  miniPlaceDoc(doc, {
    place: opts.place,
    box: { x0: 0, y0: yc - 1, cellsX: 1, cellsY: 3 + more.length },
    extra: (effective) => Object.fromEntries([
      [opts.child, { ...effective(opts.child), parent: opts.place, coord: at(0), targetAreaM2: 10000, anchorElevationM: 779, terrain: 'terrain_river', ledgerHolder: true }],
      ...more.map((id, i) => [id, { ...effective(id), parent: opts.place, coord: at(i + 1), targetAreaM2: 10000, anchorElevationM: 779, terrain: 'terrain_river' }]),
    ]),
  });
  doc.rows[opts.place].terrain = 'terrain_river';
}
