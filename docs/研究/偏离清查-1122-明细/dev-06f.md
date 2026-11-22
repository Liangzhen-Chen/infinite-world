# 偏离清查 06f（卷五、卷十九、卷八：建筑蓝图、布局、头衔）

共 4 条，甲 0 乙 4 丙 0，有理由 1 无理由 3。
本卡读：卷五 :450-529、:730-828；卷十九 :98-329、:333-489、:531-722；卷八 :720-796。文件：server-plugin/kernel/blueprint.mjs:1-747、place-building.mjs:1-432、place-plan.mjs:1-193、layout.mjs:1-378、title.mjs:1-156；另核 place.mjs:247-253、:934-1000、:1600-1680，grid-base.mjs:213-251，det-math.mjs:127-252，footprint.mjs:50-66、:223-262，docs/问题.md:597/616/617/751/774、world/ontology/dimensions/_unbuilt-derived.json:100-105/205/216、docs/PLAN.md:184/187、docs/审查/A卡组织层-Opus只核-1123.md、docs/卡回报/polity-org.md:56。没读：卷五 :1-449、:530-729、:829 起；卷十九 :23-97、:489-531、:1149 起与全部附；place.mjs、footprint.mjs、gen/* 的其余部分。

### 1 卷八 §4.4 头衔与法理：六个入口与 state.dejure 全无实现
- 位置：server-plugin/kernel/title.mjs:1（全文件只实现 §4.5 领地持有权；server-plugin/ 全目录 grep `officeView|dejureOf|usurpOptions|createTitle|revokeOffice|stepDejure` 为 0）
- 设计原文：卷八:732，摘原句"读：`officeView`、`dejureOf`、`usurpOptions`。写：`createTitle`、`revokeOffice`、`stepDejure`。"
- 代码实际：上述入口、运行态 `state.dejure`、R8-4.3 法理初值、R8-4.4 漂移（`driftTo`/`driftSince`/到期项）、R8-4.5 创设、R8-4.6 篡夺、R8-4.7 撤销、R8-4.8 领地价值全无实现；office 表的五个派生列只在 _unbuilt-derived.json:101–105 登了"派生读未建"。
- 理由：无（_unbuilt-derived.json:101–105 只登 office 派生列；六个入口与 state.dejure 没有裁定、勘误或问题.md 登记）
- 影响：规则缺 / 玩法不可达
- 严重程度：乙
- 合并：无

### 2 建筑的"门"出口按一处开口一项，卷文要每格一项
- 位置：server-plugin/kernel/place-building.mjs:421（`doorExitsOf` 每处开口压成一项）；server-plugin/kernel/place.mjs:970-972（`exitsOf` 每项只取该组首格落一个 cell）
- 设计原文：卷五:486，摘原句"**门**：P 是建筑或房间时，蓝图外壳上的门格与此刻是开口的窗格、破洞格（§4.5 规则 2），每格一项；"
- 代码实际：蓝图把一处门、窗沿墙厚各占 w 个门格（blueprint.mjs:318、:336 全部写成 door/window 格），`doorExitsOf` 却按 `bp.openings` 一项一组返回（cells 是整组），`exitsOf` 再把一组折成一个出口，出口数按"处"不按"格"。
- 理由：无（place.mjs:931 的注释自述"一处开口一项，cell 取开口的首格"，没有裁定、勘误或问题.md 登记）
- 影响：规则缺（卷十三 R13-11.9 合围按 `exits` 逐项看出口，出口项偏少；现形制墙厚 0.4 m 折 1 细格，w=1 时两组相等，墙厚超过 1 细格才显现）
- 严重程度：乙
- 合并：无

### 3 加载期只核建筑锚点，不核整块建筑足迹是否在父足迹内
- 位置：server-plugin/kernel/place-building.mjs:362-368（`checkBuildingRows` 只核锚点所在区格的最深归属行是父行或其后代）
- 设计原文：卷五:461，摘原句"同一格空间内，子足迹是父足迹的子集……同父的兄弟足迹两两不相交（区域按区格，建筑、房间、体积按细格）；"
- 代码实际：`checkBuildingRows` 核了 ① 蓝图可行、② 锚点在父行的区域足迹内、③ 同父建筑两两不相交（:370-387）；建筑足迹整块越出父足迹、或与同父的体积行相交，都不报错。锚点在父内不保证整块足迹在父内（蓝图外包可能伸出父的区域边界）。
- 理由：无
- 影响：规则缺（手写或物化的建筑足迹越界能过加载；运行时 `siteFit` 只管建造一侧）
- 严重程度：乙
- 合并：无

### 4 `holdingAllowed` 只按组织维度求值，站点类型与信仰旗标不进求值
- 位置：server-plugin/kernel/title.mjs:96-105（`placeId` 在 :97 只核是不是字符串）与 :73-89（`eligibilityHolds` 只绑组织表的维度）
- 设计原文：卷八:774，摘原句"`holderEligibility` 在（组织维度、该站点的类型代号、组织当家者信仰的解锁旗标）上为真，且政体行 `landless` 为假。旗标读卷七的 `faithUnlocked`。"
- 代码实际：求值作用域只有 org 表的维度，`placeId` 不进求值；`holderEligibility` 一旦引用站点类型或 `faithUnlocked` 即编译失败抛错（不按假）；现数据靠政体行写 `1 == 1` 才通。
- 理由：有（PLAN.md:187 李白 11-23 排期明许延后，卷八:196 允许政体行写 `1 == 1`；属计划延后，不是勘误、也不是问题.md 条目）
- 影响：规则缺（暂未出错；写入带站点类型的政体行即抛）
- 严重程度：乙
- 合并：无（A卡组织层审查与本条不重叠）

## 已登记未建

- **卷五 §4.6 站点类型**：`site` 词表族未建（_unbuilt-derived.json:216，card pre_first_reader_card；PLAN.md:184 排"站点类型 2.0"到块 6 之后），`reclassifySite`、`assignSite`、`placeProgress`（`place-progress.mjs`）与 §4.6 规则 3–6 的升降、废弃、靠持有边存续随之未建。本卡所列文件里没有读站点 `rank`、`capacity` 的代码，无法判"按条目字段还是按代号"。
- **门窗扇状态（leafOpen）**：卷十九 §2.3、§4.5 规则 10；问题.md:774 已登。place-building.mjs:171 自述"扇按没装算"，`blueprintOf` 的 `openingAreasOf(...,[],...)`（:186）把 `leafClosedM2` 恒算 0。
- **固定装置（fixture）**：卷十九 §2.3、§3.2 `blueprintOf` 的"所在固定装置"；fixture 族未建（_unbuilt-derived.json:205）；place-building.mjs:129 `fixture` 恒 null。
- **房间行与 idslot_room**：卷十九 §4.5 规则 6；问题.md:616 登 deferred `room_rows_unbuilt`。房间行未建，本卡只核了房间足迹的派生代码（place-building.mjs:299-330）。
- **office 派生列**：`holder`、`vacant`、`org`、`seatPlace`、`dejureLiege`、`acting`，_unbuilt-derived.json:100-105（card polity_org_card）。
- **storeysMax**：卷十九 §4.4 规则 4 的材料承重上限与 `storeyCurve`/`storeyStress` 未建，生成期用 `planBlueprint` 输入域上限顶替（问题.md:617）。

## 拿不准

1. **设计露天比例是否计入楼梯格**：blueprint.mjs:467-470 的分母把绝对层偏移为 0 那层的楼梯格计入（`k0 !== interior && k0 !== stairs` 才跳过，楼梯格算进去）；卷十九:668 写"室内格中"，而 §4.5 规则 7 第 8 点又写"室内格（含其中的楼梯格）"，两处措辞相抵，判不了。
2. **`governorOf().eligible` 的地点取哪个**：title.mjs:119 用那条边的标的 `e.subject` 算 `holdingAllowed`；卷八:775 只说"读时现算的 `holdingAllowed`"，没写第二个参数取被问地点还是边标的，继承来的统治边两者可能不同。
3. **同角色房间行的对应次序**：place-building.mjs:152-165 按房间行 id 字典序当作"建房间行的先后"；卷十九:650 的位次是"房间在蓝图里的房间序号"（由 `idslot_room` 给出）。`idslot_room` 未登、房间行未建，现判不了 id 序是否等于房间序号序（两位数序号不加前导零时两者会不同）。

## 跨卷待判

1. **R8-5.5 的封建契约**：卷八:777 要求 `setGovernor` 封授时"同时双方订立一份封建契约（§4.10）"；title.mjs:130-155 只开统治边并发"统治者变更"事件，不订契约。卷六的契约写者未建（terminate.mjs:491 自述"contracts writer not built"）。要读卷六 §4.10 的契约种类与卷八 §4.10 的条款才能判是否有别的路径补上、以及这是否算已登记未建。
