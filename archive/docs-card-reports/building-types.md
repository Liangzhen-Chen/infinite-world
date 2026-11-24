# 卡回报：真实世界上格收尾之一《其余 326 栋建筑的设施类型》

写者：Claude Sonnet 5.5 中档统筹与审核；逐栋对应由 DeepSeek（deepseek-flash）分五批做，Sonnet 逐行核后才写进数据。分支 ds/building-types，基于 master ef7d16bb9。照的卷：卷十九 §2.1 :106（intendedType 必填）、卷十九 §2.2（设施类型表头）、卷二 §5.7 :1867（首批设施类型）；设定原文 docs/世界设计/13-建筑、聚落形态与服饰器物.md :107、:111、:170；依据旧数据 world/geo/locations.json（逐栋行号写在数据里）。

## 交卷前自查（卡头第三节）

| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 本卡是作者数据卡，类型表 world/ontology/dimensions/facility_type.json（卷十九 §2.2）、intendedType 必填 卷十九 :106、设定 13-建筑 :107/:111；每栋依据"world/geo/locations.json:行号"写在 world/geo/building-classes.json 各行 intendedBasis |
| 2 | 没有按 id/名字写特例 | 是 | 规则只有两条通用的：用途字段为私宅一律 fac_house（测试 building-types.test.mjs 第三条按旧数据 purpose 核，不按 id）；其余按名字、用途、描述逐栋读；没有按 id 前缀、村名批量套；转换脚本未改 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 本卡没有新增限额或校验代码；对不上的 70 栋不写 intendedType（不写占位值、不写空串），仍由加载器 E-DIM-REQUIRED-MISSING 报出并列进 docs/问题.md 清单 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | tests/kernel/building-types.test.mjs 三条：类型都是表的行、依据所引行号落在自己的旧记录里、旧用途私宅的建筑都取 fac_house；没有任何计数断言 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 未改任何代码（tools、server-plugin 均未动）；缺值下降全来自新写的作者数据 |
| 6 | 只改了卡文列出的文件；diff 共约 1560 行（几乎全是数据行） | 是 | 改：world/geo/building-classes.json（加 256 行 intendedType 与其依据、改 note）、docs/问题.md（新小节）；新增：tests/kernel/building-types.test.mjs、docs/卡回报/building-types.md。未碰形制条目、siteform、server-plugin |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs：tests 2033 pass 2033 fail 0；pre_commit verdict pass |
| 8 | 这张卡让块 6 哪一步更近了，且没有违背北极星 | 是 | 真实世界整体加载里"形制、面积、层数、朝向"缺口从 326 降到 70，补缺阶段能给 256 栋建筑挑形制；对不上的 70 栋如实列清单，没有自编类型 |

## 做法与结果

- 清单取法：node 脚本（F:/dnd-tmp/list-btypes.mjs，Write 写）读 settlements.json 的 buildingIds 与 building-classes.json 的 5 行，减去 start-buildings.json 的 19 栋，得 326 栋；每栋带名字、所属、用途、房间、描述与它在 locations.json 里的行号。
- 数据位置：不另起写法。转换脚本本来就读 start-buildings.json 与 building-classes.json 两处的 intendedType（tools/convert-geo-g5b.mjs:211–212）；start-buildings.json 被 start-region 测试限定为河湾村 19 栋，所以写进 building-classes.json（每行 id、intendedType、source 作者、intendedBasis），没动转换脚本。
- 写了 256 栋：229 栋用途私宅取 fac_house；office 5、workshop 9、school 4、granary 4、forge 2、shrine 2、inn 1，共 27 栋。
- 对不上 70 栋，11 类，清单在 docs/问题.md“待李白：设施类型对不上的建筑”：共用灶房 7、检看场地院 4、贸易货运与交换点 16、议事处 7、治安值房 1、住区 16、种植圃 4、葬地 4、基础设施与露天场地 8、存物洞 1、城防 2。同节还列了 4 处边界判断（议事屋记事屋取官署、武馆观寺取学堂、存粮洞棚取粮仓、修具棚取作坊）请李白核。
- 汇总脚本 F:/dnd-tmp/merge-btypes.mjs 合并五批输出，并核：条数与次序同输入、类型在表内、私宅必为 fac_house 且非私宅不为 fac_house、每个引用行号落在该栋自己的记录里、用途行含该用途文字、对不上的有 kind 与 reason；0 个问题才写盘。数据文件由该脚本写（不是手敲 256 行）。

## DeepSeek 委派（deepseek-flash，前台）

| 批 | 卡文 | 条数 | DS 结果（非 null / null） | 我的逐行核 |
|---|---|---|---|---|
| 1 | F:/dnd-tmp/btypes-card1.md | 66（全非私宅） | 20 / 46 | 逐行读全部 66 条，无错；但与第 2 批的议事处处理不一致，见第 2 批 |
| 2 | F:/dnd-tmp/btypes-card2.md | 66（31 非私宅 + 35 私宅） | 44 / 22 | 逐行读全部 66 条，改 4 条：3 处议事棚（议事棚、议汐棚、灰棚议签棚）DS 取官署，与第 1 批三处议事窟洞和街议厅不一致，统一为对不上；裂炉营修具棚 DS 判对不上，与另两处修具棚（取作坊）不一致，改取作坊。改后 42 / 24 |
| 3 | F:/dnd-tmp/btypes-card3.md | 66（全私宅） | 66 / 0 | 脚本核全批：用途均私宅、均 fac_house、行号均对；抽读无误 |
| 4 | F:/dnd-tmp/btypes-card4.md | 66（全私宅） | 66 / 0 | 同上 |
| 5 | F:/dnd-tmp/btypes-card5.md | 62（全私宅） | 62 / 0 | 同上（含洞、棚、窝里的私宅，用途字段均为私宅） |

按卡文“错一栋整批重核”：第 2 批有 4 栋改动，我已把整批逐行重读重核（不另派 DeepSeek 重跑）；第 1 批的跨批不一致已在第 2 批改动里统一。每批抽核不少于 15 栋：第 1、2 批逐行全核；第 3–5 批全是用途私宅，由汇总脚本对 229 栋逐栋核用途、类型与行号。

## 验收

- 转换脚本 node tools/convert-geo-g5b.mjs --check（不写盘；整体加载仍未过，属 A/B/C 卡与后续）：intendedType 缺 326 → 70；form 缺 326 → 70；planCells、storeys 缺 326 → 70；facing、anchor 缺 326/345 → 89；condition、materialKg 仍 345（B、C 卡）；补缺阶段 gstage_siteform/form_type_unmatched 70 栋（正是 70 栋对不上的）。
- node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs（一次跑完，默认报告器）：tests 2033、pass 2033、fail 0（基线 2030 + 本卡新测试 3）。
- node tools/accept/run.mjs pre_commit（不带 --write）：verdict pass；失败 3 项仅 vol12.A12-4.5、S12-2、S12-3 基线。

## 偏离指令处

- 开头一次 `cd` 与一次管道 `| head`（等 DeepSeek 前的探路命令，无副作用）违反了命令纪律；之后没再用 cd，测试输出另存文件再读尾部。
- 数据文件 world/geo/building-classes.json 由 F:/dnd-tmp 下的 merge-btypes.mjs 写盘（Write 写的脚本），不是 Edit/Write 手敲 256 行。
- DeepSeek 对 start-buildings.json 以外建筑没有现成的类型出处，只能按名字、用途、描述判断；边界处写进问题.md 请李白核。

## 未解决

- 70 栋对不上，须李白定：加新设施类型，还是这批不要 intendedType（须改必填口径）。
- 补缺阶段 form 已能给这 256 栋挑到形制（本次转换 form_type_unmatched 只报 70，即没写类型的那 70 栋）；但整体加载仍未过：condition、materialKg 各 345（B、C 卡）、room_rows_unbuilt 272、storeys_max_unchecked 275 等补缺遗留仍在，不属本卡。
