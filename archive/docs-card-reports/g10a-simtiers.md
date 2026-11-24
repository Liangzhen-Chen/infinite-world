| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷二十七 R27-1.12 :310（范围：玩家控制实体 pos 的格空间与区格，同空间 \|Δx\|、\|Δy\| ≤ r 之并，不同格空间各自成泡，外包框之外不算）、:311（只由状态算出）；§3.1 :223–:224（bubbleView、inBubble 签名与读法）；§2.2 :153（bubbleRadiusRegionCells 整数、1–4、取值域外加载失败、没有"不限"值）；S27-11 :260；A27-1.11 :369、A27-1.12 :370（两次调用相同、泡只随位置与登记变、无玩家控制实体时泡为空）；卷九 R9-3.9 :721（玩家席位边 = 玩家控制登记）；对照表 #59、#60、待定 6 |
| 2 | 没有按 id/名字/场景写特例 | 是 | sim-tiers.mjs 只读规则表键、持有种类（rules.control.seatKind 指名）与维度 pos；区格序号经 kernel regionOf、外包框经 gridSpaceBox 取，不自算；无任何 id/名字分支 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | tests/kernel/sim-tiers.test.mjs：规则表 0、5、-1、2.5、null、"unlimited"、"inf" 加载均报 E-DIM-DOMAIN-RANGE；缺 simTiers 表、缺 rules.control.seatKind、半径 0/-1/null/"unlimited"/1.5 均抛 E-RULES-UNREGISTERED（不返回空泡或全泡）；inBubble 实参缺失/非整数/NaN/字串均抛 E-DIM-STRUCT-FIELD |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 夹具世界自造（person-world：300×100 区格格空间，cellM 1、regionCellM 100）；期望值手算：3×3=9、两实体并 5×3=15、角上 2×2=4、半径 2 得 25、半径 4 得 81；半径经引擎副本的规则表改，不读仓库当前表值（仅"真实表首值 1"一条读真实表，对应卷文首值） |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 未动任何既有业务写法；唯一的既有文件改动是加导出与登记；sim-tiers.mjs 数字字面量只有 0、1、-1（dx、dy 循环下标与 r<1 判） |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是（含两处必要扩展，见下） | git diff --cached --stat：16 files changed（含本回报），+约 540 −4 行，终数见提交说明；扩展项：kernel/place.mjs、kernel/holdings.mjs 各加只读导出，state-owners.json 登记 kernelApi 与 sys.simTiers，tests/accept/temp-repo.mjs 带上 sim-tiers.mjs |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：ℹ tests 1654 / ℹ pass 1654 / ℹ fail 0 |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 现场泡有了唯一读入口（只由状态算出、不落盘），G9 的离屏拒写与 G10 的展开收起可直接读它；未写死、未缩规模、未走特例 |

## 改了哪些文件

- 新：`server-plugin/sim-tiers.mjs`（bubbleView、inBubble、bubbleRadiusRegionCells 唯一读点）；`world/rules/tables/sim-tiers.json`（首值 1）；`tests/kernel/sim-tiers.test.mjs`（17 个测试）；`tests/accept/bypass/sim_bypass-{01,02,11}.txt`（门禁用例夹具）。
- 改：`world/rules/registry.json`（登 simTiers 表，键 bubbleRadiusRegionCells，整数、1–4）；`server-plugin/kernel/place.mjs`（加导出 `regionOf`、`gridSpaceBox`）；`server-plugin/kernel/holdings.mjs`（加只读导出 `openHoldingsOfKind`）；`world/ontology/state-owners.json`（kernelApi 三条、systems.sys.simTiers 声明 inBubble 为谓词，读者文件由它派生）；`tools/accept/{scanclasses,criteria,items,cases}.json`（经登记器 register.mjs 登记，非手改；登记器顺手把 geometry_bypass 行里 callees 键序重排，语义不变）；`tests/accept/temp-repo.mjs`（临时仓库带上 sim-tiers.mjs，同 action-capacity.mjs 先例）。

## 测试名（tests/kernel/sim-tiers.test.mjs）

规则表首值 1；规则表 0/5/-1/2.5/null/"不限" 加载失败；规则表 1、4 两端通过；真实世界加载零 error；单个控制实体泡 9 格；inBubble 泡内外与格空间号；无席位边泡为空；已关闭边与别种持有边不算；两个控制实体并集 15 格不重复；外包框角上 4 格；外包框另一端 4 格；半径 2/4 取规则表；格空间不存在无泡；两次调用相同且改无关状态泡不变；不落盘、结果冻结；缺表/缺键/半径特殊值抛 E-RULES-UNREGISTERED；inBubble 实参不合抛 E-DIM-STRUCT-FIELD。

## 门禁条目

- 新条目 `vol27.S27-11.a`（对照表 #60 读点唯一）：新扫描类 `sim_bypass`，检测器用现有 `path_access`（read 方式，paths `bubbleRadiusRegionCells`，code E-SIM-BYPASS，范围 rules/kernel/textcore/inputEdge/gate/outputGate/aiGate/assembly；读者文件取自 `systems.sys.simTiers.predicates` 派生，不点名文件，同 vol2.K6-24 口径）；用例 sim_bypass-01（成员链读，必报）、-02（解构读，必报）、-11（别处只调 inBubble、sim-tiers.mjs 自读，必不报），三条 pass。条目键带 `.a`：S27-11 的 alterCells 调用链半条归 vol5.S5-9（G9），"自算玩家周围区格"语义不可纯静态判，由 #59 单元测试守，已写在条目 source 与 criteria。
- `vol5.S5-10` 未动，仍 pass。

## 委派与改正

未委派 DeepSeek：本卡主体是跨 kernel/规则层/登记表/门禁的接点，没有可单独切出的机械部分。过程中两处改正（均在本机跑出后自改）：(1) 测试里规则表取值域错误一开始用 readRules 断言，实际取值域由 loadWorld 的 L1 校验报，改用 loadWorld；(2) 首版 sim-tiers.mjs 用了 `{any}` 与空串比较，被 vol1.V-2.a/V-2.b 门禁抓到，改为 `{object}` 与 `length < 1`（照 death.mjs 先例）。另一处：临时仓库测试（runner.test.mjs）因 predicateFiles 找不到 sim-tiers.mjs 失败，补 temp-repo.mjs。

## 须 Opus 核（内核）

1. **玩家控制登记尚未落**：卷九 R9-3.9 的 `rules.control.seatKind` 与席位持有种类行仓库里没有。本卡按 R9-3.9 原文读法实现（`openHoldingsOfKind(state, rules.control.seatKind)` 取在世边，受控实体取边的 subject），真实引擎上该键不存在时抛 E-RULES-UNREGISTERED，不退回空泡。是否认可"读法先到、登记后到"，请核。
2. 新增三个内核只读导出（regionOf、gridSpaceBox、openHoldingsOfKind）及 kernelApi 登记的口径：是否应改成别的形状（例如 gridSpaceBox 并入已有入口）。
3. `sys.simTiers` 用 `predicates: [sim-tiers.mjs#inBubble]` 来派生读者文件：借 predicates 字段是权宜（bubbleView 不是谓词），卷二十七主体卡落系统声明时可改为 view 登记，请核是否同意。
4. 控制实体 pos 读不出（未知）时抛 E-DIM-UNKNOWN-READ（不跳过）：与 death.mjs 同口径，请核。
5. 泡未纳入"竖向层"（卷文本版不设层数常数，R27-1.12 :310 末句）：本卡不碰层，已写明。

## 两条验收末行

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：ℹ tests 1654、ℹ pass 1654、ℹ fail 0。
- `node tools/accept/run.mjs pre_commit`：`"verdict": "pass"`；failed 仅 vol12.A12-4.5、vol12.S12-2、vol12.S12-3（基线既有，不计）；sim_bypass-01/02/11 均 pass，openHits sim_bypass 为 0，vol5.S5-10 与 vol27.S27-11.a 均不在 failed。
