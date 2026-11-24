共 9 条，甲 0 乙 6 丙 3，有理由 3 无理由 6。

本卡读了：卷五 :547-625（§4.2 全部规则与验收断言）、卷四 :586-626（§4.3 属性）并以 Grep 定位 :154、:155、:1560；perceive.mjs :1-292、sight.mjs :1-240、bubble.mjs :1-123、kernel/validate/sense-tables.mjs :1-85、world/rules/tables/perception.json 全文；为核公共部件另读了 kernel/place.mjs :330-402、:600-840、kernel/det-math.mjs :120-155、kernel/place-building.mjs :270-290、:170-171、kernel/footprint.mjs :420-426、:796-804。未读：卷二十 §4.8.2（propagate 返回形状）、卷五 §3.1 :316（losView 返回形状）、卷二十七（泡与缓存规则）、卷九（emit 调用点）——均不在本卡给的卷:行范围。

已核不记：sight.mjs `AXES = ['x','y','z']` 是三根轴名，不是四邻/八邻方向表，与公共部件审查-甲 D6 的 8 处方向常量不重复；卷四 §4.3 属性不参与判定式，代码未读 attr，符合；卷四 :154/:155 的 `senses`/`sourceStrength` 字段与 :1560 的 `cap_*` 清单，代码读法符合，数据未填见"已登记未建"。

### 1 远景眼位海拔用"层号 × 层高"，不是区格地表高
- 位置：server-plugin/sight.mjs:188（eyeOf）、:205-206（eyeA/eyeB）
- 设计原文：卷五:606 "视线高度在 a 的眼位海拔（a 所在格的地面海拔加一层高的一半）与 b 的目标海拔之间按水平距离线性插值"
- 代码实际：a、b 两端都取 `pos.z × storeyM + storeyM ÷ 2`（层号 × 层高），没有读该格地表高 h（`surfaceStorey` 与 `surfaceHeightM` 是两回事，卷五 :631）；遮挡高一侧的 regionOcclusionM 读的是精确地表高，两端口径不一致。
- 理由：问题.md:776（登记了 b 侧卷文未给与"两端取同一口径（层号 × storeyM + storeyM ÷ 2）"，但 a 侧卷文明写"地面海拔"，改成层号未单列）
- 影响：读数错（眼位最多低 3 m，可能把本应看得见的远景判成看不见）
- 严重程度：乙
- 合并：无

### 2 门窗扇按"没装/空气"缺省，不是按未知带缺口
- 位置：server-plugin/sight.mjs:20-21；server-plugin/kernel/place-building.mjs:171（leafOpen 恒按没装）
- 设计原文：卷五:605（现文；卡文与代码注释写 :603）"门、窗按此刻的状态取对应材料"
- 代码实际：gridView 把门窗洞读作空气，视线穿过门窗洞恒按空气判；文件头自述"门窗洞按空气处理"，不是未知。
- 理由：问题.md:774 登记该项未建，但实现按缺省"空气"交出，不是按未知带缺口（与 dev-format 第二节的豁免条件不符）
- 影响：读数错（关着的门窗被当成空气，视线可穿）
- 严重程度：乙
- 合并：无

### 3 事件目击候选与 withinReach 同一判据写了两份
- 位置：server-plugin/perceive.mjs:253-261（perceiveEvent 候选）；对照 :190-199（withinReach）
- 设计原文：卷五:598 "与规则 10 `withinReach` 是同一个距离、同一个可及距离，两者任一未知即不入候选"
- 代码实际：候选判定在 perceiveEvent 内联重算 `straightM` + `envValue` + 比大小，没有调同文件导出的 withinReach（rangeDim 为空时要用 candidateRadiusM，可只对非空支调它）。
- 理由：无
- 影响：只是形式（现两处结果一致，日后改一处易漏另一处）
- 严重程度：丙
- 合并：无

### 4 propagate / envAt 接缝把返回值定成 number|null，与卷二十的 Fact 形状不符
- 位置：server-plugin/perceive.mjs:56-59（处理函数类型）、:173（到达强度）、:167-177（可及距离）
- 设计原文：卷五:583 "签名以卷二十 §4.8.2 为准……把返回的到达量原样用作'到达强度'"
- 代码实际：registerPropagate 收 `number | null`，registerEnvAt 收 `number | null`，perceive 以 `isNum` 收；若 G14 按卷二十交 Fact，到达强度/环境维度读不到（全判未知），若交入时拆成裸数则丢缺口代号。接缝还开在规则层 perceive.mjs，卷二 :469 把 propagate/envAt 定为横切入口。
- 理由：无
- 影响：规则缺（G14/G16 交入时全判未知或丢缺口）
- 严重程度：乙
- 合并：见 docs/研究/公共部件审查-乙-1122.md:118-124（#9），修法同处

### 5 感知与视线入口在生产代码里没有真实调用者
- 位置：server-plugin/sight.mjs:231（losView）；server-plugin/perceive.mjs:237（perceiveEvent，只经 primitives-runtime.execute，而 execute 无生产调用者）、:65/:75（registerPropagate/registerEnvAt 无交入者）
- 设计原文：卷五:579 "它是全书唯一的'是否感知到'判定（台账 X-14）"；卷五:594 "唯一实现，只算一次"
- 代码实际：losView 零调用者；perceiveEvent 的调用方 execute 自身无生产调用者；两个接缝在生产代码里无登记处（Grep 只命中 perceive.mjs 与测试）。
- 理由：无（问题.md:770 只登记 propagate/envAt 未建，未登记 losView 与 execute 无调用者）
- 影响：玩法不可达（NPC 看不见、听不见，事件写不出 witnesses）
- 严重程度：乙
- 合并：见 docs/研究/公共部件审查-乙-1122.md:119-120、:201

### 6 视线读材料不透光直读 dim('material')，未经 materialView
- 位置：server-plugin/sight.mjs:124-133（opaqueReader，:129 处 `dim(engine, state, 'material', material, S.opaque)`）
- 设计原文：卷五:605 "不透光读格材料的材料维度（卷三甲 §2.1 `opaque`，分态布尔，按格的当时物态取栏……）"
- 代码实际：按表名 'material' 直读材料维度；甲组要求的唯一材料读口 materialView（kernel/item.mjs:658）已存在，未调。
- 理由：无
- 影响：规则缺（绕过单一材料读口，材料读法再改时此处会漏）
- 严重程度：乙
- 合并：见 docs/研究/公共部件审查-甲-1122.md:282（R11）与同文 :311（修法 #12，声明 G14 开写前做）

### 7 sense 族与 capability 族条目直读 engine.vocab.families
- 位置：server-plugin/perceive.mjs:89-93（senseEntries 自写枚举）、:129-130（capability 族直取）
- 设计原文：卷五:554 "`sense` 族条目字段（本卷定义，只有判定用的三项）"
- 代码实际：自写按族名取条目、排序的小函数，直读 `engine.vocab.families`；乙组要求的 `familyEntries(engine, family)` 读口尚缺，修法已排在块 6 之后。
- 理由：无
- 影响：规则缺（绕过词表读口，族内部结构一变即静默取空）
- 严重程度：丙
- 合并：见 docs/研究/公共部件审查-乙-1122.md:143、:187（#12）

### 8 表行与表头直读加载器内部结构
- 位置：server-plugin/perceive.mjs:214（`engine.tables.get(kindOf(sp)).doc.dimensions`）；server-plugin/bubble.mjs:59-60（`engine.tables.get('person').flat.rows`）
- 设计原文：卷五:591 "基值 = 行为人所在实体表的 `sourceStrength[s]` 列……个体取其物种行"
- 代码实际：sourceLevelsOf 直读表头 doc.dimensions 判列存在；personIds 直读表行 flat.rows；规则层没有"取某维度定义""列出某表全部行 id"的读口，乙组已列缺口。
- 理由：无
- 影响：规则缺（绕过表读口，加载器内部结构一变即静默取空）
- 严重程度：丙
- 合并：见 docs/研究/公共部件审查-乙-1122.md:144

### 9 感知源只认 person，按实体种类写死
- 位置：server-plugin/perceive.mjs:211（sourceLevelsOf）、:281（perceivesEntity）
- 设计原文：卷五:602 "E 的位置：个体读 `pos`；物品读批次的 `spot`……E 所在的表没有登记 `sourceStrength` 列时，E 不作感知源"
- 代码实际：`kindOfEntity(...) !== 'person'` 即返回空/无源强；物品、地点即使日后补了 sourceStrength 列与位置读入口，也一律判没有感知到。
- 理由：问题.md:773（数据未落：物品/地点 sourceStrength 列与批次 spot 未登记）
- 影响：规则缺（按表名而非"有无 sourceStrength 列与位置读口"判）
- 严重程度：乙
- 合并：见 docs/研究/模块化评估-1122.md:175

## 已登记未建

1. **sourceStrength 修正命名空间与动作行加性修正未建**（问题.md:771；perceive.mjs:14-15、sourceLevelsOf 只有物种行基值）：按未知带缺口——读不到基值给 null（未知），修正项静默不加，不拿别的量顶替；margin 也不经卷二 §3.3 求值管线（无登记的 margin 修正目标键）。
2. **kchan 四行亲身感知通道未登**（问题.md:772，卷五 :569-572）：按未知带缺口——perceive 不写知情，通道行归卷二十二；sense_tables 未加"每个 sense 恰一条 kchan 行"的校验。
3. **物种 `senses`/`sourceStrength`、物品与地点 `sourceStrength` 数据未落**（问题.md:773，卷四 :154-155）：按未知带缺口——阈值/源强读不到为 null → margin 未知、perceived 假；perceivesEntity 对物品、地点判没有感知到。全库 Grep：species.json 只有表头，无 `sense_*` 行值。
4. **explain 记"无发生位置"未建**（问题.md:777，卷五 :596）：按未知带缺口——发生位置未知时 perceiveEvent 只返回空表，不记 explain。
5. **rangeDim 所指环境维度（env.sightM 等）不存在**（问题.md:770，sense-tables.mjs:6）：按未知带缺口——加载期只核 rangeDim 是非空串或 null；perceive 经 registerEnvAt 取位置层维度，未交入即 null → 未知。
6. **水层未接**（问题.md:774、G6 遗留 1）：按未知带缺口——水体足迹地表以上格 gridView 读 known=false，视线遇到按 clear=null（未知），不报成干地。
7. **门窗扇状态**：见编号 2——按缺省"空气"，不是按未知带缺口，不列本节。

## 拿不准

- **远景采样的"每隔区格"取法**：sight.mjs:199-211 按主轴区格步数取采样、并列取最近区格；斜线时沿线实际间距约 √2 × step，卷五 :606 只说"在连线上每隔 farSightStepRegionCells 个区格取一个"，未定沿轴还是沿线。现 step=1（grid.json）最细，A5-2.2 只测"把中间一个采样区格地表抬高"，判不出算不算偏离。
- **远景"看见了什么"没有返回入口**：卷五 :606 "读地点层判看见了什么：清楚的区格上有哪些地点与建筑……以及卷二十……炊烟、火光、灯火这类场"；losView 只返回 clear/layer/blockedAt，没有清楚区格上的地点/建筑/环境场清单。losView 的返回形状定义在卷五 §3.1 :316（本卡未给该范围），未判是应由显示层另读 zoneAt 与卷二十场，还是 losView 该给。
- **sourceLevelsOf 把"读不到"与"没有键"都写成 null**：规则 7 说基值读不到按规则 3 为未知，规则 9 说"某感官没有键时按空传，propagate 取来源地点该通道的场值"；perceiveEvent :262 把 null 原样交给 perceive，未知与"持续源"不可区分。现在 propagate 未交入、恒为未知，暂不出错；G14 交入后若 sourceStrength 仍缺，会把未知当持续源算。
- **楼板顶面取法**（问题.md:776，卷五 :605 只写"墙、楼板、山体岩土都是不透光材料"）：sight.mjs:137-156 定"竖向穿过格面时下面一格顶面不透光即挡、水平穿过不碰顶面、两端格自身顶面在内"，卷文没有原句规定取法，已由主会话定；本卡只记不判。
- **localSightClear 的迁移**：卷五 :593 "现 `environment.mjs:227` 的 `localSightClear` 迁到这里（§7）"；本工作树 server-plugin 下已无 environment.mjs，也无同名替代，"此刻能不能看清"现只能经 perceive（envAt 未交入→未知）。是否算迁完拿不准。

## 跨卷待判

- **编号 4 的 propagate 返回形状**：卷五 :583 要"签名以卷二十 §4.8.2 为准"，本卡未读卷二十：卷二十 :916 是否返回 Fact（带 known、gaps）据公共部件审查-乙-1122.md:122；要读卷二十 §4.8.2 才能确认是偏离还是已在 G14 卡内处理。
- **远景环境场**：卷五 :606 要读卷二十在地点层给出的炊烟、火光、灯火场（读法归卷二十）；本卡未读卷二十 §3/§4，不能判 losView 缺该项是规则缺还是读者侧的事。
