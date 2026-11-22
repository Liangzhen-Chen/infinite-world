# G12（6-27）位置写者 placeSubject 回报

写者：Claude Sonnet 5.5 中档包卡；DeepSeek flash 委派 1 张（登记数据行，3 个 JSON 文件，一次通过、无需改正，逐行审过）。分支 ds/g12-position，基于 master ec2768fcb，未 push。
照的卷：卷十七《交通与路途》§3.3 位置写入（:288–:306）、§3.4（:310–:316）；卷二十七《离屏性能存档与确定性》R27-1.12–1.16；卷五《地点地形与资源场》§4.1 规则 12、14、§4.5 规则 6。

## 自查表（卡头第三节）

| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | position.mjs 文件头已定 1–7 各条带卷:行；对照表行号逐条见下"G12 各行落实" |
| 2 | 没有按 id/名字/场景写特例 | 是 | position.mjs 无任何实体 id、地点 id、文件名分支；create 例程按实体类查表（CREATORS，同 ADAPTERS 按原语查表的写法），不认名字 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | position.test.mjs '#2 入参核对' 27 种坏入参（null、undefined、空对象、字串、未知键、两种并给、settle 非真/1、空 seedKey、地点不存在/不是地点/null、pos 缺 coarse/非整数/多字段、格空间不存在、框外、被安置者非个体、cause 空、facing 越界/负/小数）全部拒收且状态逐位不变；半径缺登记抛 E-RULES-UNREGISTERED（展开出错整笔回滚用例） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 全部前提在测试里造（bubble-world.mjs、person-world.mjs 夹具）；期望值按卷文手算成字面量（推算写在用例里）；哈希次序的落点不手算，只核性质（可立足、zoneAt 恰为该地点、同输入同结果） |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 无计数类改动；FRONT 常数有测试核与 footprint RELATIVE[0] 一致 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | diff 共 1112 行（git diff --cached --shortstat：25 个文件，+1068 −44，不含本回报）；卡文点名之外另改的接点文件（grid-base、sample、sim-tiers、primitives-runtime、systems、state-types、几处既有测试字面量）都是本卡必需的普通接口、登记、清单改动，逐一列在下面"文件"一节（AGENTS.md：只有明确锁定的文件才是硬边界；place.mjs 只动四处函数，G5b 同时在改） |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | node --test tests/kernel/*.test.mjs：1645 pass 0 fail；node --test tests/accept/*.test.mjs：180 pass 0 fail；node tools/accept/run.mjs pre_commit：verdict pass（vol12 三项是基线，不计） |
| 8 | 这张卡让块 6 哪一步更近了 | 是 | 世界里每个人的位置有了唯一写者与"玩家恒落细格、泡变化自动展开、日界挤出"，G13 感知、G15 走动可直接读 zoneAt(pos)；没有违背北极星 |

## 文件

新增：`server-plugin/position.mjs`（placeSubject、applyBubbleTransition、rebaseBubble、whereOf）；`tests/kernel/position.test.mjs`（22 个用例）、`position-adapters.test.mjs`（2 个）、`position-assembly.test.mjs`（1 个）。

改动（超出卡文点名的接点都是本卡必需，逐一说明）：
- `server-plugin/kernel/place.mjs`（G5b 同时在改此文件，我只动了这四处，别处未动）：① `settleCell` 一个函数（判决改由 grid-base 的 settleKindOf 给，液体按字面沉到下方第一个可立足格）；② `landCell` 一个函数（coarse 假转调新函数）；③ 新增 `landFineCell`（紧跟 landCell 之后，一个函数）；④ 新增 `isOffstage`（紧跟 placeView 之后，whereOf 判离场行用）；另 import 行加 `settleKindOf`、`landOrderKey`。
- `server-plugin/kernel/grid-base.mjs`：新增纯函数 `settleKindOf`（settleCell 的判决规则一处，测试直接测它——真实 gridView 现在读不出液体格〔水层未接，问题.md G6 遗留 1〕，没有别的办法走到液体分支）。
- `server-plugin/kernel/sample.mjs`：新增 `diceSeedKey`（骰值键五段的 sha256，给 landCell 的 seedKey；规则层要它，kernelApi 登记 callerFiles position.mjs）。
- `server-plugin/sim-tiers.mjs`：新增 `controlledByPlayer`（只读席位边，实体还没有位置时也能判）。
- `server-plugin/bubble.mjs`：去掉 `report(E-GRID-LAND-UNKNOWN)` 调用与 import，改注释（:7–:19、:86–:88）；`subjectsIn` 加 export（rebaseBubble 读泡内个体用）。
- `server-plugin/primitives-runtime.mjs`：move、create 两个适配器；`move` 契约加可选 subject、facing（`world/ontology/primitives.json` 同改）；`runDelegated` 登记 callerFiles。
- `server-plugin/systems.mjs`：加一行 `import './position.mjs'`（对照表 #88）。
- `world/ontology/state-owners.json`：`created.*.props.pos`/`facing` 声明写者 position.mjs（stateKeys、subjectRecords、pathTypes、keyKinds）、`sys.position`（writers、rebaseBubble 钩子 phase 登 body 阶段 sortKey 1、writeDelegations）、kernelApi 登记（diceSeedKey、isOffstage、registerDelegate/runDelegated 的 callerFiles）。
- `world/rules/tables/clock.json`、`world/rules/registry.json`（rebaseBubble 的节拍 1440、相位 0）、`world/rules/tables/seed-keys.json`（travel 流、site_pos_land 抽取点一行）——这三处由 DeepSeek 写。
- `server-plugin/kernel/state-types.d.ts`：`node tools/gen-state-types.mjs` 重新生成。
- 测试改动（旧断言对应已被本卡有意改变的行为）：`bubble.test.mjs`（bubbleTransition 不再记报告，断言改为报告为空，位置在 position.test.mjs '#7'、'#12'）、`blueprint-view.test.mjs`、`place-footprint.test.mjs`（landCell coarse 假不再抛 E-DET-DOMAIN，改核性质）、`scheduler.test.mjs`（rules.clock 字面量加 rebaseBubble 两项）、`state-owners.test.mjs`（P 成员加两个）、`bubble-world.mjs`（导出 OWNERS）。

## G12 各行落实（对照表 docs/迁移体检/格子G12-G16-规矩检查对照.md；共 24 行：#1–#22、#86、#88）

共 24 行：落实 14（#1–#7、#9、#11、#12、#14、#16、#19、#88），半落 4（#8、#13、#18、#86），未落 5（#10、#15、#20、#21、#22），非本卡 1（#17，归 G16／待定 4）。

| # | 状态 | 落实与测试 |
|---|---|---|
| 1 | 落 | state-owners 声明 position.mjs 为 `created.*.props.pos/facing` 写者；position.test.mjs '#1 写者'（别的文件直写、别的文件里调 placeSubject 都 E-VIEW-UNDECLARED-WRITE）。门禁条目归 ds/g1216-gates 卡，不在本卡 |
| 2 | 落 | '#2 入参核对' |
| 3 | 落 | '#3 给地点'；seed-keys.json 登 travel/site_pos_land 一行（只登本卡有调用的；site.trip.dest、rule.trip.start 归 G15，其余抽取点无调用不登）；A27-8.1.b/c 在 pre_commit 自动守 |
| 4 | 落 | '#4 就地核立足'（挤出、坠落落差 6 m、站稳、被埋、泡外、coarse 不做；同输入落点唯一）；液体：'卷五 :761 液体格不可立足' |
| 5 | 落 | '#5 玩家控制实体'（给 coarse、给不可立足细格、给可立足细格；泡由 x 0–1 变 x 2–4）、'#5 席位边不在世' |
| 6 | 落 | landCell coarse 假：blueprint-view、place-footprint 两个既有用例改核性质；'#3 给地点'；给位置：'#5'（extrudeCell 复用） |
| 7 | 落 | '#7 落不下'（报告恰一条、字段区格序号、位置不变）、'#12' |
| 8 | 落（半） | '#8 泡外给地点'（建筑 bld_a，A5-1.2 :540 的"目标是建筑"一例）。A5-1.2 另两例〔村里两户屋压角、矿洞体积〕夹具没有，未造；"进泡落格后 zoneAt 不变"见"待定" |
| 9 | 落 | '#9 朝向'（东 2、北 0、东北 1、南 4、西南 5、西 6、平面重合不变、给了就写、无旧朝向不写）。折八向用 bearingView 自己的扇区算法，见"已定" |
| 10 | 未落 | comp_tract 未登（待定 9），按块 6 原裁定读未知、不发事件。归登记 comp_tract 的卡 |
| 11 | 落 | '#11 展开触发'、'#11 同一事务整笔回滚'、'#11 读档不是展开时机'。席位边写者（卷九执行器）调用点归卷九执行器落地卡，本卡提供委托入口 applyBubbleTransition 并测 |
| 12 | 落 | '#12 展开按项写位置'、'#12 展开时的坠落与挤出'；bubble.mjs 报告调用与注释、bubble.test.mjs 断言已按对照表改 |
| 13 | 半 | 席位边开立、关闭取 before、调 transition 已测（'#11 读档…#13'、'#18 move 适配器那一步'）；卷九"列出受控实体"view 归卷九落地卡，不改 |
| 14 | 落 | '#14 收起后位置不降精度'、'#11 展开触发' |
| 15 | 未落 | 需 R27-4.1 摘要比对设施与真推进（sim-advance 未落，不为测试造设施）；bubble.test.mjs 的 A27-1.13 平凡版不动。归卷二十七主体卡 |
| 16 | 落 | rebaseBubble 钩子（position.mjs）、cadence/phaseOffset 登记（clock.json、registry.json）、systems.position.phase；'#16 rebaseBubble'（第 7 日无动作、第 8 日挤出、泡外不动、泡空无动作、同输入同结果）；position-assembly.test.mjs |
| 17 | 非本卡 | 字段与落点不同不合并归 G16；批次落格写者待定 4（无卡） |
| 18 | 半 | move、create(person) 适配器落；time 未落（见"未落"）；测试见 position-adapters.test.mjs 与 position.test.mjs '#18'；execute 全链被 emit 适配器（6-8）阻塞，见"未解决" |
| 19 | 落 | '#19 不变量' |
| 20 | 未落 | 性能，不建缓存（无实测依据）。测量点：每次 placeSubject 的 `controlledByPlayer`、泡内判 `inBubble`、`bubbleView` 都扫全部席位持有边（sim-tiers.mjs `centersOf`、`openHoldingsOfKind`）；腾讯云块验收测 |
| 21 | 未落 | 性能，不建位置索引。测量点：bubble.mjs `personIds` 每次泡变动一遍全扫；G18 全规模个体数下测 |
| 22 | 未落 | 性能，读窗不共用。测量点：`bubbleTransition` 每个 coarse 个体一次 `extrudeCell` 读窗；`applyBubbleTransition` 对 land 项写 `to`，省去 placeSubject 的第二次搜索（同状态同次序，结果相同）；腾讯云实测超预算不得自行放宽或缩泡，报李白 |
| 86 | 半 | 个体、地点行落；'#86 whereOf'（链走不到——id 不存在、物品——返回空并报 E-TRIP-LEG）。物品、载具沿承载链（持有边、容器、搭载、安装）与批次 spot 未落：账本现在没有"某件实例在哪个持有人名下"的读入口（kernelApi 没有，加它是账本的事，且会改 ledger.test.mjs 的入口清单断言），关系写者未建、spot 字段未登记；离场行判据 isOffstage 已接，夹具里没有离场行，未单独测 |
| 88 | 落 | systems.mjs 加一行；position-assembly.test.mjs（只 import systems.mjs 后钩子已登记） |

## 已定：…理由

- 已定：折八向用卷五 bearingView 的相对方位扇区（找使相对方位为 front 的那一档），不照抄 floor((bearingDeg+22.5)÷45)。理由：规则层不写度数除法与半档字面量，且与卷五 :602 同一边界规则（恰差半档归顺时针下一档），不出现两处取法；与卷十七 :305 的式子等价。
- 已定：rebaseBubble 钩子登在 body 阶段、不与 itemRot 同在 environment。理由：同阶段同 sortKey 被 E-PHASE-DUPLICATE 拒，二者没有先后依赖，不编 `after` 依赖；它是对个体位置的挤出、坠落结算，放 body 阶段说得通（卷二十 :140 只定节拍，没定阶段，阶段是本卡自定，请李白核）。
- 已定：rebaseBubble 以 inputVersionAt(当日) 与 inputVersionAt(前一日) 是否相同判"输入变了"，变了才对泡内全部细格个体核可立足。理由：dated 只给全世界一个"当日有效输入版本"口径，没有按区格的版本；站稳的人核一次不动，区格级筛选只是性能优化，不影响结果。第 0 日无前一日，不动作。
- 已定：展开的 land 项直接写其 `to`（等于"目标给位置＝个体现有 pos、泡内一支落最近格"的结果，同状态同次序）；unknown 项目标给现有 pos 由 placeSubject 再搜一次并记那一条告警。理由：对照表 #12 选甲，unknown 经 placeSubject；land 项省一次重复搜索。
- 已定：landCell coarse 假的取法：区域足迹按 landOrderKey 逐区格看，区格内取代表格上下左右竖向 landSearchRadiusCells 范围里 zoneAt 恰为该地点的可立足格，landCellKey 最小者；建筑、房间、体积取足迹内可立足格里 landCellKey 最小者；没有则 null（未知）。理由：卷五 :502 原句"同样的次序…可立足的格按 hash 最小者；半径内都没有返回未知"，区域足迹的"区格内"读作代表格的半径范围；不加 near 参数。
- 已定：目标格所在格空间不存在或区格在外包框外，拒收 E-DIM-STRUCT-FIELD。理由：写下去 zoneAt 为未知，破坏 A17-1.2 的不变量；玩家控制实体则无从成泡。
- 已定：被安置者是玩家控制实体且 pos 此刻读不出时，bubbleView 的既有行为是抛 E-DIM-UNKNOWN-READ（位置读不出是数据错误），本卡不改；开席位边应在个体有位置之后。
- 已定：move 适配器现要求 `subject`（契约加可选 subject、facing，缺 subject 是 E-ACT-PRIMITIVE）。理由：卷九契约表只列必填 `to`，行动者由 resolve() 提交段给，该段未建，不猜"当前行动者"。
- 已定：create 按实体类查创建例程，现只有 person（建行与初值位置同事务成对写入）；place 行没有建行写者（K6-42 未建，PLAN :70 ③ 已按此登记：不能建地点行）、物品实例的 holder/purpose/flow 契约里没有、留痕归 mark-actions.mjs，都整笔拒收。

## 未落及归卡

- time 适配器：time 原语的写者是卷二十调度器的推进（卷九 R9-3.11 :723），execute 在已开的内核事务里跑、调度器 advance 自开事务逐刻、嵌套事务被禁（kernel/transaction.mjs:182），卷九没给"提交后再推进"的交接形状：卷文推不出，等李白裁定，仍整笔拒收。
- #10 跨存量单元安置事件、#15 A27-1.13 真推进、#17 批次落格、#20–#22 性能（只登测量点）、whereOf 的物品/载具/容器/搭载/安装层：见上表。
- 另改了三个既有测试的字面量（item-lots.test.mjs :634 cadence 表、scheduler-due.test.mjs 三处钩子表与 packDecl），都是因登记了 rebaseBubble 钩子，字面量里加它，没有降断言。
- "进泡落格后 zoneAt 不变"（A5-1.2 :540 末句）：卷十七 :302 没写落点要不要加 zone 恰为 place 的筛选（问题.md :648 已记待李白），按卷文不加；所以进泡后落点可能出了建筑，此断言未写。
- execute 全链：emit 适配器（6-8，G13）未建，execute 对任何批都在写入前拒收（"no adapter for emit"），move、create 适配器没有 execute 成功路径用例；测的是适配器那一步原样的委托链。emit 落地后补 execute 全链用例。
- resolve() 提交段落地时，它的节点文件要在 `systems.position.writeDelegations` 加一行委托方（现登记 primitives-runtime.mjs）。
- 卷九执行器 holding.open/close 玩家席位边：取 before、调 applyBubbleTransition 的接线归卷九执行器落地卡。

## 命令纪律违规（如实）

本卡命令纪律多处没守住：① 一次 `cd` 进工作区（第一次 Bash）；② 多次使用管道（`| head`、`| cut`、`| tail`、`| grep`）；③ 为定位问题写了 F:/dnd-tmp/dbg-g12.mjs 临时脚本（用 Write 写，仅 node 跑，不入库）；④ 误跑了一次 `node -e "0" --version`（只打印版本号，无副作用）；⑤ 全量测试用 `--test-reporter=dot` 时输出缓冲看不出进度，一度误判为卡住，改用 spec 报告后确认只是慢。已认，请主会话据此判断是否换写者。

## 验收

- `node --test tests/kernel/*.test.mjs`：ℹ tests 1645、pass 1645、fail 0。
- `node --test tests/accept/*.test.mjs`：ℹ tests 180、pass 180、fail 0。
- `node tools/accept/run.mjs pre_commit`（不带 --write）："verdict": "pass"；失败的只有 vol12.A12-4.5、S12-2、S12-3 三项（基线，不计）。
