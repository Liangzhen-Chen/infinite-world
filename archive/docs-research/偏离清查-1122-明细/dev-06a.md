共 4 条，甲 1 乙 3 丙 0，有理由 0 无理由 4。

本卡读了：卷五 :85-241（§2.1 place 表）、:305-346（§3.1-3.2 入口与判定入口）、:417-546（§4.1 格世界与足迹）；卷二 :1795-1842（§5.6 地点 place）。代码：server-plugin/kernel/place.mjs :1-96（读 import 与常量便于定位）、:97-518 全读；为判落点补读 kernel/footprint.mjs :400-445 / :479-518 / :620-722 / :788-854、kernel/place-volume.mjs :160-223 / :237-247、kernel/place-plan.mjs :100-160。未读：卷五 §4.2（`bearingView` 的算法只核到 §3.1 :319 的签名）、§4.3 / §4.5（区域派生量与体积算式）、卷十、卷十九（`checkVolumeCells`、`volumesUnderRegionRows`、`blueprintOf` 只是转交，卷文不在本卡段内）。另核：全仓 Grep `regionCell|zoneAt`，非 place.mjs 的生产实现 0 处（footprint.mjs 的 `zoneOfPos` / `regionOfPos` 是 zoneAt / regionOf 的几何部分，唯一调用方 place.mjs:322 / :391）；本卡代码段无 16 / 32 等区格宽字面量（格宽只见 `grid.regionCellM`）；全仓 `Math.sqrt` 仅 kernel/sample.mjs:289（采样矩阵），无 `Math.atan2`。

---

### 1 landCell 区域足迹的代表格只按区域归属行筛，未核 zoneAt 恰为 place
- 位置：server-plugin/kernel/place.mjs:445（实现在 kernel/footprint.mjs:691-701，判据 :695-696）
- 设计原文：卷五:504「落格 `landCell({place, kind, seedKey, coarse})`：只在 `place` 的足迹内、且 `zoneAt` 恰为 `place` 的格里取（落在更深后代足迹里的格不算）」；卷五:321「`zoneAt` 照该格实际所在求（中心列地表层格落在建筑、房间足迹里就是那处）」；验收卷五:542「泡外移动到某建筑、房间、体积或村落的个体与批次，`zoneAt(pos)` 等于动作目标地点」。
- 代码实际：区域足迹 coarse 为真时 `landRegionCell` 只筛 `plan.owner[k] === me`（该区格的最深**区域**归属行是本行），取到该区格中心列地表层格就直接返回（footprint.mjs:695-701）；若这格压在建筑（含 o = −1 的地下室）或房间、体积的足迹里，返回格的 `zoneAt` 是那处，不是目标 `place`。position.mjs:198 给地点写泡外位置时正调这一支。
- 理由：无（问题.md:644 的「“zone 恰为 place”筛选照卷十七 :302 不加」只针对展开落格走 `extrudeCell` 的一支，不是 `landCell` 的代表格）。
- 影响：读数错——泡外按地点写下的 `pos`，`zoneAt(pos)` 可能不等于动作目标地点，正是 A5-1.2「泡外位置」要验的一条。
- 严重程度：甲
- 合并：无

### 2 zoneAt 的体积分支按行 id 字典序取，未取包含树上最深的体积行
- 位置：server-plugin/kernel/place.mjs:326（实现在 kernel/place-volume.mjs:200-203）
- 设计原文：卷五:498「`zoneAt(pos)` = 包含该位置的足迹中，在包含树上最深的那一行；规则 3 保证它唯一」；卷五:461「体积足迹的父行必须是覆盖它全部格列的那个最深区域足迹行或另一个体积足迹」（允许嵌套体积）。
- 代码实际：一列同一层被多个体积行覆盖时，`zone = zone === null || v.id < zone ? v.id : zone`（place-volume.mjs:202）取代号最小者，不比包含树深度；子体积 id 不小于父体积行时，`zoneAt` 返回父体积行。
- 理由：无
- 影响：读数错（嵌套体积处“在哪个地点”错）
- 严重程度：乙（现有世界数据未见嵌套体积，暂未触发）
- 合并：无

### 3 landCell 的体积分支未核 zoneAt 恰为 place
- 位置：server-plugin/kernel/place.mjs:435（coarse 为真）、:488（coarse 为假，landFineCell 内）
- 设计原文：卷五:504（同第 1 条引句）；卷五:542。
- 代码实际：体积足迹的候选一律取 `volumeCellsOf(ctx, place)` 的全部凿空细格，不筛 `zoneAt`；同格被更深体积（或建筑）覆盖时，`landCell(体积行)` 可能落到别的行的格上，返回格的 `zoneAt` 不是目标体积行。
- 理由：无（代码注释 :430 / :452 自述“zoneAt 恰为 place”，实现未核）
- 影响：规则缺——写出位置的 `zoneAt` 可能不是目标体积行
- 严重程度：乙（与第 2 条同受“嵌套体积”条件限制）
- 合并：无

### 4 placeFootprint 的返回结构缺 cells，非区域足迹的 regionCells 用空数组
- 位置：server-plugin/kernel/place.mjs:264-308（建筑与房间 :271、体积 :278、区域 :290-308）；placeView 原样转出（place.mjs:1023）
- 设计原文：卷五:221「`footprint` | struct{kind: 足迹种类, w: 格空间, regionCells: list nullable, cells: list nullable, zRange}」；卷五:311「`footprint`（§4.1 规则 10–13）」。
- 代码实际：返回 `{kind, w, cellCount, areaM2, centroid, elevationM, zRange, waterAccess, regionCells}`，三支都没有 `cells`（建筑、房间、体积的细格集合在内部 `f.cells` 里有，未交出；区域足迹本应 `cells: null`）；建筑、房间、体积的 `regionCells` 给 `[]`（:271 / :278），卷文类型为 list nullable（不适用应为 null）。
- 理由：无（仅 placeFootprint 注释自述“regionCells 为空”）
- 影响：规则缺——按卷五:221 读 `placeView().footprint.cells` 的消费者（卷十七 `mapGeomView` 转出足迹、卷二十九画细格图）拿不到建筑、房间、体积的细格
- 严重程度：乙
- 合并：无

---

## 已登记未建（问题.md 有记录，不另计偏离）

- **`landCell` 的 `kind` 参数与“物另要求承面”未实现**：§3.1 :320 的签名含 `kind`，规则 14 :504「`kind` 为物时另要求格上有承面或地面」；place.mjs:413 只解 `{place, seedKey, coarse}`，landFineCell 注释 :453 自述未落。登记：问题.md:646（批次（物）落格未落，随批次写者卡）。
- **place.mjs:442「非区域足迹种类的 landCell 未建」**：问题.md:530 登记归 G7 / G8；G7 / G8 已落（:418-439 建筑、房间、体积三支都在前面返回），该抛错现不可达，属过时登记的残留死分支，记账备核。
- **`landCell` 的 `coarse` 为假（可立足细格）**：问题.md:590 登记未落；现已由 landFineCell（:455）落，登记过时。

## 拿不准

- **`straightM` 对 `coarse` 位置未取区格中心与地表层**：卷五:470 要求「只到区格精度的位置取该区格中心与地表层」，place.mjs:342 转交的 footprint.mjs:796-804 完全不看 `coarse`，直接用它存的 x、y、z。但卷五:324 规定 `straightM` 是只收两位置、不读状态的纯函数（地表层须在落格时已写入），卷十七 :303 又允许把目标格原样写成 `coarse` 真——按哪种读法判，需卷五澄清后再定。
- **非区域足迹的 `waterAccess` 恒为空集**：place.mjs:271 / :278 给建筑、房间、体积一律 `waterAccess: []`；卷五:143 写的是「本行足迹与其四邻区格内，各水体行足迹的 `waterKind` 之并」，细格足迹怎么取“四邻区格”卷文未写，问题.md 也无登记，先记待核。

## 跨卷待判

- 无。
