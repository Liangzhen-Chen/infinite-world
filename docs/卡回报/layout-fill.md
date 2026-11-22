# 真实世界上格前置卡 B《卷十 R10-7.11 建筑落位（anchor、facing）》卡回报

写：Claude Sonnet 5.5 中档（包卡，李白 11-23 事件 36015fd8 G5b-K）；DeepSeek 委派 0 张（理由：改动集中在站点面积一节与内核 probe 的接点，机械部分只有测试夹具与登记行，量小、与手算期望耦合紧，由我直接写比写卡更省）。分支 ds/layout-fill（工作区 F:/dnd-wt/ds-layout），基于 master 29cbd904a，未 push。

## 交卷前自查（卡头第三节）

| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | siteform.mjs 站点面积一节头注释摘卷十 R10-7.11（:693–:700）、R10-7.5（:680）、R10-3.12（:496）、R10-7.12（:684–:690）；推不出处见"已定"与"缺口" |
| 2 | 没有按 id/名字/场景写特例 | 是 | 排位按"站点行 = 作者写的、非政区、非存量单元、非水体的区域足迹行"与"直挂建筑"的结构认，不看 id、名字；z、朝向、纬度都走规则层/原语层（layoutOf、defaultFacing、placeLatitude、probe.surfaceStoreyAt） |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | gen-siteform.test.mjs "落位：世界没有格空间表…layoutGapCells 缺（或 0）即 E-RULES-UNREGISTERED"；facing 0 档也写（"朝向缺时面向赤道…0 档也写"）；N 加到父足迹格数仍排不下报错、作者定面积的站点不加 N；作者写的 anchor、facing 类型不对即 E-GEN-ROW-INVALID，不当作"没写"去补 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 夹具自造（区格 100 m、gapCells 2、细格 1 m），期望格号按卷文手算成字面量，推算写在用例注释；真内核用例的层号 15 按"控制海拔 46、起伏幅度 ≤ 0.94 → floor(h ÷ 3) = 15"手算 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 未碰检测器；gapCells 登规则表 layoutGapCells（有出处与暂定标记） |
| 6 | 只改了卡文列出的文件；diff 共约 320 行 | 部分 | 卡文无硬锁文件清单。改了 siteform.mjs、worldgen.mjs、place.mjs（probe 加 surfaceStoreyAt）、_vocab.json（gstage_siteform 的 after）、registry.json、worldgen.json（规则表）、seed-keys.json、tools/convert-geo-g5b.mjs（只改日志与错误分组）、docs/问题.md 一行、两个测试文件；diff 约 300 行加 16 行减（不含新测试文件 70 行） |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | 见"验收" |
| 8 | 这张卡让块 6 哪一步更近了，且没有违背北极星 | 是 | 真实世界建筑行的 anchor、facing 现在由补缺阶段按卷十 R10-7.11 排出来（有形制的 17 栋已排下），整体加载少掉这两类缺值里"能排"的部分；没有缩规模、没有编值（缺形制的 328 栋不排位不编尺寸） |

## 一、做成了什么

站点面积阶段（gen/siteform.mjs siteAreas → placeBuildings）现在对"直挂在站点下、有形制、有平面格数与层数"的手写建筑行：
- 缺 anchor、facing 的，按 `layoutOf`（kernel/layout.mjs，G11 已有的唯一算法）排出来，写成 generated 偏离行（by gstage_siteform，seedKey 登 seed-keys 新行 site_gen_layout_anchor）；作者写了的原样不动，anchor 已写的当障碍；只缺一项的只补一项。anchor 写 {w, x, y, z, coarse: false}，w 取站点足迹所在格空间序号，z 取锚点所在列的地表层号。
- 朝向缺时取 `defaultFacing`（意图、文化偏好两路现无来源，传空 → 面向赤道，纬度取站点 coord 经 placeLatitude）。
- R10-7.5 重排：试排用站点的真足迹（ctx.footprints 加 `extra` 叠一份试写的 targetAreaM2 = N × A），排不下的站点同一轮一起 N 加一重排，直到都排得下；加到父足迹区格数仍排不下即 E-GEN-ROW-INVALID（字段 site、reason、need_cells、max_cells）。作者写了 targetAreaM2 或 boundary 的站点 N 取作者足迹的区格数、不加，排不下同样报错，站点面积不动。
- 缺 form（缺口 form_type_unmatched）的建筑：不排位、不当障碍、不写 anchor 与 facing，不编尺寸。

## 二、卷文逐条落实与测试名

| 卷文 | 落实 | 测试（tests/kernel/） |
|---|---|---|
| R10-7.11 第 1–2 点（站点区格 S、不分片即整个站点足迹当一个分片） | 试排读真划分的 S（probe.cells），zones 恒空 | gen-layout-fill："真划分上的落位：缺 anchor、facing…"（真 planFootprints） |
| R10-7.11 第 3 点（障碍、两遍、游标） | layoutOf 已有；这里作者写了 anchor 的当障碍、缺的按行 id 序（ordinal 恒 0，同组按 key） | gen-siteform："落位：作者写了 anchor、facing 的建筑不动…并作障碍"；gen-layout-fill："…作者写了 anchor、facing 的建筑不动并作障碍：bld_1 绕到 x0 = 227" |
| R10-7.11 第 4–5 点（行架、锚点、z） | layoutOf 已有；z 由 probe.surfaceStoreyAt 读（place.mjs 新加） | gen-siteform："落位手算：三栋…(7,2)、(10,5)、(25,2)"；gen-layout-fill 层号 15 手算 |
| R10-7.5 末（试排、N 加一、加到所在存量单元格数、仍排不下 E-GEN-ROW-INVALID） | placeBuildings 重排循环 | gen-siteform："落位：排不下 N 加一重排"、"落位：N 加到所在存量单元的区格数仍排不下即 E-GEN-ROW-INVALID…"、"落位：作者定了面积（targetAreaM2）的站点…" |
| R10-3.12 / R10-1.7（手写优先、生成补缺、同种子同结果） | 只出作者没写的维度；来源标记 | gen-siteform："落位：同种子同结果，与行输入次序无关"；gen-layout-fill："…同种子同结果" |
| R10-7.12 缺 form 不编（1123k31） | 缺 form 的行不参加落位 | gen-siteform："落位：缺 form 的建筑…不排位、不当障碍" |
| 卷十九 §4.5 规则 11（朝向：意图 > 文化 > 面向赤道） | defaultFacing；纬度未知记缺口 facing_latitude_unknown | gen-siteform："落位：朝向缺时面向赤道…" |
| gstage 次序（落位读控制海拔） | gstage_siteform 的 after 加 gstage_fields、gstage_order | gen-layout-fill："落位读地表层号要全部控制海拔…" |

## 三、已定（理由）

1. **gstage_siteform 的 after 加 gstage_fields、gstage_order**（_vocab.json）。理由：落位给锚点 z 要地表层号（R10-7.11 第 5 点、卷五 §4.3 规则 8），读全部区域足迹行的控制海拔；站点面积阶段原先 after 为空，真实世界里它排在自然量阶段之前，控制海拔还没补出来，17 栋全部 anchor_z_unknown。同卷十 1121k16 给 gstage_fields 加 after 的理由（补足迹先于任何读海拔的阶段）。卷十 :354 条目写的是 after gstage_economy，经济阶段未建，这里只加实际依赖；须在卷十 :354 或后续勘误里认这一依赖（卷文不改，须主会话或李白定是否走勘误）。
2. **seedKey 登新抽取点 site_gen_layout_anchor**：落位不抽取（R10-7.11 首句），这里只登来源标记要的骰值键；purpose 里写明。
3. **ordinal 恒 0**：手写行没有清单序位，同遍内由 layoutOf 按 key（行 id）升序；与"同种子同结果、与输入次序无关"一致。物化时清单行的 ordinal 另算。
4. **N 加一的上界**：站点父行是存量单元时取其足迹区格数（卷文原句）；父行不是存量单元时卷文推不出"所在存量单元"，取父行足迹区格数作终止界（只是让循环必止，不是新规则；真实世界这类站点的父行多是郡）。
5. **直挂非站点行（存量单元、政区、层根）的手写建筑不排位**：落位是站点的事（R10-7.11）；这类行缺的 anchor、facing 由加载校验报必填缺值，不另记缺口（另记缺口会改变 gen-worldgen 里"建筑直挂世界根"一例的缺口断言，且重复加载校验）。
6. **规则表加 layoutGapCells**（卷十 :183 rules.gen.layout.gapCells，键名取驼峰平铺同 layoutCoverage 先例）：值 2，出处与暂定标记写在 worldgen.json。
7. **意图朝向、文化偏好两路无来源**：chooseForm 未建、卷七 §4.28 输出接口未建，传空；有来源时只改 siteform 传参，defaultFacing 不改。

## 四、缺口与实测

- 真实世界实测（node tools/convert-geo-g5b.mjs，一次，fill 约 125 s；失败不写盘属预期）：anchor 缺值 345 → **328**，facing 缺值 345 → **328**；剩下的 328 栋正是缺 form 的行（form_type_unmatched x328，卷十 R10-7.12 1123k31：不补、不编，待形制数据与 intendedType 登记）；有形制的 17 栋（loc_hw 下）已排下，整体加载校验对这 17 栋没有报 anchor 出父足迹或兄弟相交错。
- 其余整体加载缺值与本卡无关：condition、materialKg x345，form、planCells、storeys x328，五个水体的 capacityL、catchmentM2、surfaceM2 x5（water_rule_missing）。
- 未落：分片角色归并（模板与分片角色未接线，zones 恒空）；落位的 ordinal（手写行没有）；楼层 z 不含河床修正（建筑不落水体足迹）。
- 命令纪律自报：本会话用过 `cd` 一次（首次跑测试时，之后改用绝对路径）；读后台输出用 Grep 读持久化文件，不是管道。

## 五、碰了内核接口的部分（须 Opus 终核）

1. **kernel/place.mjs planFootprints 返回的 probe 加 `surfaceStoreyAt(id, x, y)`**：与 gridView 细格读法同一套（所属最深足迹的 terrain 条目、nearControlPoints、columnSurface），不含河床修正；读不到返回 null。读者是落位（z）。须核：与 gridView 逐列同值（本卡只有真内核手算用例，层号 15）；河床修正不含是否可接受。
2. **gen/worldgen.mjs footprints 闭包加 `o.extra`**（试排用的行提案叠加，不进 generated）与 `latitudeDegOf`（placeLatitude 的薄包装）。
3. **_vocab.json gstage_siteform.after**（上"已定"第 1 条）：阶段次序是内核装配的一部分。
4. **registry.json、worldgen.json 加 layoutGapCells；seed-keys.json 加 site_gen_layout_anchor**（门禁 seed_sites、param_consumed 已过）。
5. siteform.mjs placeBuildings 的重排循环与 E-GEN-ROW-INVALID 字段。

## 五续、修改轮（Opus 终核 M1–M4 与李白 b41e0801 第⑩条，取甲）

- M1：place.mjs 抽 `bedCorrectedColumn`（columnSurface 减河床修正 δ），gridView 细格分支与 probe.surfaceStoreyAt 共用；siteform 试排不再传 `bed: false`；删"建筑不落在水体足迹里"一句。新测试（grid-view.test.mjs）"落位读的地表层号与 gridView 同一读法…逐列相等，含水体区格一列"（loc_b 水底 δ = 30，层 0 而非 10）。
- M2：gstage_siteform.after = fields、order、water，basis 改写为卷十 :345–:354 传递次序的已建前驱；不勘误。
- M3：删 seed-keys 的 site_gen_layout_anchor，落位提案 seedKey 写 ''（测试断言改 ''）。
- M4 与李白第⑩条：问题.md 遗留第 2 条改为"已裁"。"所在存量单元"= 沿 parent 往上第一个 roleTract 祖先；起始 N 的判与 N 加一上界都按它；撤父行足迹临时上界。卷十 R10-7.5 补取法，勘误 1123k45（快照取 git 对象 aeb68257…，未另存文件：环境禁复制与重定向）。新用例"所在存量单元 = 沿 parent 往上第一个存量单元…"（祖父 3 格排下、2 格报 need 2 max 2；无存量单元记缺口）。
- **追加（李白 da3cd65a 甲，第二次修改）**：一路往上没有存量单元时不再记缺口、不再不排：起始 N 不判，N 加一上界退回父行足迹区格数，照常排位；注释、卷十 1123k45 句、问题.md 都写明"临时退路，存量单元卡补后撤"。新用例：gen-siteform"…临时退回父行足迹格数作上界、照常排位"（父行 3 格排下、2 格报 need 2 max 2）；gen-layout-fill"站点一路往上没有存量单元…"（真划分，锚点 (213, 2)、层 15）。真实世界全规模不进测试（一次 130 s、800 MB），用转换脚本跑一次，计数见提交回报。

## 六、验收（第一轮数；修改轮数见提交说明）

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`（分四批，默认报告器）：kernel a–f 449 pass 0 fail；g–o 670 pass 0 fail；p–z 635 pass 0 fail；accept 203 pass 0 fail；合计 tests 1957 pass 1957 fail 0 = 基线 1944 + 新增 13（gen-siteform 9、gen-layout-fill 4）。
- 修改 _vocab.json 之后全量测试整体重跑一遍（上面数是重跑后的）。
- `node tools/accept/run.mjs pre_commit`（不带 --write）：verdict pass，仅 vol12 三项基线（A12-4.5、S12-2、S12-3）。
