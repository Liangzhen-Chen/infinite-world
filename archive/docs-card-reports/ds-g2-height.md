# 卡回报：ds-g2-height（G2 高度场与区格派生）

写者 DeepSeek v4-pro，工作区 F:/dnd-wt/ds-g2，分支 ds/g2-height。日期 2026-11-21。

## 一、交卷自查表

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 高度场控制面＋起伏＋地表层号＋取值域（卷五 §4.3 规则 8 :654–:658）；区格地形类 cellclass（规则 9 :659）；每区格独立种子（§4.1 规则 15 :502、卷二十七 R27-5.9 :635）；grid.json 键表（§2.3 :271）；确定性 A27-5.6 :662；性能门 R27-6.9 :692 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 控制点只按距离平方与 id 码点序排序、不认具体 id；地形类只按 cellclass 条目条件与 priority、并列取代号码点序；种子键成分是流代号＋整数，不按格空间号/区格值分支 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 控制点恰在列上 d2=0 取该点值；无 cellclass 条目成立返回 null（不设缺省）；waterAny 空=不限、非空且列不在水体=不成立；reliefM=0 起伏为 0；h 越界截到 [−12000,9000]（grid.test.mjs 各测试） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望值按公式手算成字面量：150、50、0、−1、−4000、3000、9000、−12000（grid.test.mjs）；种子键 sha256 期望在测试里用 createHash 现算，不抄运行态读数 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 未改既有业务代码；2 由 1+1、2^k 由 1n<<k、2^64 由十六进制字串派生（无量纲系数只在 grid.json，S5-7），非为降计数改名 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 12 文件（含本回报），603 增 41 删，共 644 行 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 1302 / ℹ pass 1302 / ℹ fail 0` |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 区格层高度场与地形类纯函数落地，G3 足迹/zoneAt 可在其上算；全整数定点、派生不存档、无写死/特例 |

## 二、改了哪些文件

- `world/rules/tables/grid.json`（新）：G2 读到的 6 个常数（storeyM=3、regionCellM=100、heightCtrlK=4、reliefOctaves=4、surfaceElevationMinM=−12000、surfaceElevationMaxM=9000；heightCtrlK/reliefOctaves 暂定·待试玩标定）。
- `world/rules/registry.json`：登 `grid` 表行（type/domain/packOverridable 逐键）。
- `world/ontology/dimensions/_vocab.json`：登 `cellclass`、`cellmark` 两族（开放、空条目）；`terrain` 族 10 个封闭条目补 `reliefM`/`reliefRough`（暂定·待试玩标定）。
- `world/rules/tables/seed-keys.json`：登 `grid` 生成流 role_seed 一行（stream=grid、site=cell，成分世界种子/流代号/w/区格 x/y，不放版本）。
- `server-plugin/kernel/grid.mjs`（新）：高度场与区格派生纯函数（controlSurfaceAt、reliefAt、surfaceHeightAt、surfaceStorey、cellClassOf、regionCellSeedKey）。
- `server-plugin/kernel/handles/keys.mjs`：加 `gridSeedKeyText`（区格种子键文本，卷二 §2.8 :852 拼接只在 keys.mjs）。
- `server-plugin/kernel/files.json`：登 `kernel/grid.mjs`。
- `tests/kernel/grid.test.mjs`（新）：14 条卡内测试（见第三节）。
- `tools/accept/items.json`：经 register.mjs 登 `vol27.A27-5.6`（state registered，指向 grid.test.mjs 确定性测试）。
- `tools/accept/criteria.json`：keys.mjs 进 12 个检测器 import 闭包、判据代码指纹随之变，经 register.mjs 给这 12 个类别 rev+1 并补同号修订记录（判据本身未改）。
- `tests/accept/item-revisions.test.mjs`：非扫描式条目计数 49→50、卷二十七 2→3、首登 47→48（新增 A27-5.6 后按新读数更新，不放宽断言）。

## 三、对照表第 7–15 行各怎么落（测试名）

- **#7 高度场纯函数、不存档**：`grid.mjs` 的 `controlSurfaceAt`（控制面平方反比加权）、`reliefAt`（起伏噪声）、`surfaceHeightAt`（合成＋截断）、`surfaceStorey`（层号向下取整）。测试：`控制面：单个控制点…`、`控制面：该列恰在某控制点上时取该点的值`、`控制面：平方反比加权（两点等距取平均，手算 150）`、`起伏：reliefM=0 时起伏恒为 0`、`地表高：取值域截到 [−12000, 9000]`、`地表层号：floor(h ÷ storeyM)…`。
- **#8 每区格独立种子、不带版本**：`grid.mjs` 的 `regionCellSeedKey`＋`seed-keys.json` role_seed 行；新模块进 `files.json`，由 A27-8.1.b/c 自动守。测试：`每区格独立种子键：确定性、64 位十六进制、无版本成分`。
- **#9 区格地形类由 cellclass 条目派生**：`grid.mjs` 的 `cellClassOf`（priority 最大、并列取代号码点序，waterAny/onRoad/inSettlement 空=不限）。测试：`区格地形类：每区格恰一条成立且 priority 最大…`、`区格地形类：waterAny 非空而列不在水体足迹里即不成立…`。无条目成立返回 null（不设缺省，加载校验码 E-GRID-CELL-NO-TERRAIN 归内容卡，见偏离）。
- **#11/#12 生成只写行与输入、派生量无写者**：本卡只落"派生量无写者"——grid.mjs 全是纯函数、不写状态；写者登记（state-owners 的 cells/gridKey）归 G3/G6，本卡不碰。
- **#13 确定性、与遍历次序无关**：`grid.test.mjs` 的 `确定性：同一世界种子派生两遍、两种遍历次序，逐格相同（A27-5.6）`；A27-5.6 进 items.json（state registered）。
- **#14 性能门 pm_chunk_derive_ms**：只登记指标名（R27-6.9 已在卷二十七规则表），不写采集点、不本机跑推进世界基准，标"待腾讯云"。
- **#15 grid.json 与词表族登记**：`grid.json`＋`registry.json` 行；`_vocab.json` 的 cellclass/cellmark 族与 terrain.reliefM/reliefRough。

## 四、两条验收末行

1. `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 1302 / ℹ pass 1302 / ℹ fail 0`。
2. `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；`"failed"` 仅基线既有 `vol12.A12-4.5`、`vol12.S12-2`、`vol12.S12-3`（不计）；`vol5.S5-10` 不在 failed，`"openHits"` 中 `"seed_sites": 0`、`"geometry_bypass": 0`、`"const_literal": 0`。

## 五、待腾讯云项

- `pm_chunk_derive_ms` 实测（R27-6.9 第 1 项，暂定 10 ms/里块）：G2 只登记指标名、不写采集点、不本机跑推进世界基准；实测随第 2/3 步在腾讯云登记测试台一次。

## 六、偏离与未落

- **未落 1**：`E-GRID-CELL-NO-TERRAIN` 未登 `error-codes.mjs`——本卡的 `cellClassOf` 无条目成立返回 null（不设缺省），"数据给全兜底条目"的加载校验随 cellclass 内容卡落（现无 cellclass 条目），该码登记随首个调用它的卡（口径同对照表"待定"）。
- **未落 2**：cellclass/cellmark 族的条目（数据）未填——族已登记（空条目），实际条目是世界内容，归后续内容卡/G3。
- **偏离 1**：`keys.mjs` 加 `gridSeedKeyText`（卷二 §2.8 :852 拼接只在 keys.mjs），牵动 12 个检测器 import 闭包判据代码指纹，按 R12-14.3 经 register.mjs 给这 12 个类别 rev+1 并补同号修订记录（判据本身未改）。
- **偏离 2**：terrain 族 10 个封闭条目的 reliefM/reliefRough 卷文无数值，取暂定值并标"暂定·待试玩标定"。
- **偏离 3**：卡文 #15 所列 cellM/chunkRegionCells/landSearchRadiusCells/roadPaceFactor/bubbleCostCap/longCostCap/farSight* 等键，A12-4.5 param_consumed 门禁要求每个登记参数有运行期消费者，而 G2 只读到 6 键（storeyM/regionCellM/heightCtrlK/reliefOctaves/surfaceElevationMinM/surfaceElevationMaxM），故只登这 6 键，其余随其消费者卡（G3/G4/G6）登；surfaceElevationMinM/MaxM 取卷五 §4.1.1 :425（§2.3 未列，作为常数入 grid.json 满足 S5-7）。
- **偏离 4**：`tests/accept/item-revisions.test.mjs` 计数 49→50、卷二十七 2→3、首登 47→48（新增 A27-5.6 后按新读数更新，不放宽断言）。

## 七、Sonnet 审核整合（Claude Sonnet 5.5 中档，2026-11-21）

详见 docs/审查/G2-Sonnet审核整合-1121.md。改动：①控制面权重原按 SCALE⁴÷d² 取整，远距（约 10⁵ m 级）权为 0 致分母归零除零，改为通分整数权 Π_{j≠i} d_j²（grid.mjs controlSurfaceAt）；②起伏格点哈希绕过 seed_sites 登记（经常量对象传代号），改字面量调用并在 seed-keys.json 登 grid/relief 第二行；③reliefOctaves 过大格距为 0 时报 E-DET-DOMAIN；新增 3 条手算测试（权比 120、十万米远点 150、octaves 越界）。保留：偏离 1–4 均保留（E-GRID-CELL-NO-TERRAIN 须随 cellclass 内容卡/G3 与加载校验同卡落；terrain 暂定 relief 值须试玩标定）。须 Opus 核：通分与卷文"除法向零截断"逐位口径；seed_sites 检测器把紧跟 return 的调用当声明跳过（本卡先赋值再返回规避，检测器未动）。

验收末行（改后实跑）：
1. `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 1305 / ℹ pass 1305 / ℹ fail 0`。
2. `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；failed 仅基线既有 vol12.A12-4.5、vol12.S12-2、vol12.S12-3；vol5.S5-10 不在 failed，openHits seed_sites 0、geometry_bypass 0、const_literal 0。
diff（git diff origin/master...HEAD，含本回报与审查记录）：13 文件，658 增 41 删，共 699 行（本节追加前）。

交卷自查表（本次审核整合）：1 是（卷文句出处见审查记录各条）；2 是（无 id/名字特判）；3 是（空控制点、octaves 越界、远距均试）；4 是（新测试期望手算 120/150）；5 是（未改允许写法；SEED 常量对象为去绕过而删）；6 是（改 grid.mjs、grid.test.mjs、seed-keys.json 及审查/回报文档，diff 共 699 行）；7 是（上两条验收）；8 是（区格高度场对远距控制点不再崩溃，G3 可在其上算，未违北极星）。

## 八、修改轮（Opus 只核判不过，五处，2026-11-21）

改：①空控制点集拒收 E-DET-DOMAIN（原返回 0n）；②并列测试改为 heightCtrlK=1 真并列取小 id；③seed-keys relief 行 prefix 改 grid_；④terrain reliefM 按"相邻区格高差上界 3.75×reliefM ÷ regionCellM = 目标坡度 s"重推（山地 13.3 等），逐条写推算；⑤docs/问题.md 记账。详见审查记录"修改轮"节。

验收末行：
1. `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 1306 / ℹ pass 1306 / ℹ fail 0`。
2. `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；failed 仅 vol12.A12-4.5、S12-2、S12-3（基线）；vol5.S5-10 不在 failed，seed_sites 0、geometry_bypass 0。
diff（git diff origin/master...HEAD）：15 文件，745 增 41 删，共 786 行（本节追加前）。自查表 6：只改卡内文件及审查/回报/问题.md，是。
