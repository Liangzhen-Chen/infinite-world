核对标识：chk-1116-y21（会话标识见主会话台账）；所核提交：dec49dc5

# kernel 第三轮只核（李白 02:30、02:45）

对照：李白 02:45（y19 三项）、02:30（kernel 两环）、02:18 三份裁定；kernel-1116次轮-设计要点表.md；上轮 kernel-0218-只核.md（chk-1116-y19，挡封 1 条 T1）。不看执行记录。本机只跑仓库已有脚本：gen-card-ledger.mjs 两次、check-卷十一.mjs 一次；其余只用 grep、sed -n 读卷文和卡账输出。

## 一 逐项核对

### 1. 02:45 ① 散文入口：大量误收（挡封 T1）

- **代码**：gen-card-ledger.mjs 新增的 :72–93 行。实际收法比裁定宽两处：
  - 只要段落文字里出现"入口"两个字就收（`/入口/.test(para)`），不管原句说的是"是入口"、"没有本卷的入口"，还是"禁止的旁路"；
  - 小节标题带"入口"的，整节每一段都收，段里所有小写开头的反引号名都当成函数名。
- **裁定原文**：02:45 ① 只收"标题或该段文字明说是'入口'的段落"里的**函数名**；写者表里的状态路径照旧不收。
- **回查**：生成器报散文写法新收 165 个。我按卷文原句回查了 17 卷约 110 个名字，误收约 95 个。各卷情况：
  - **卷五 28 个，全错**。§3.1（:287–290）是 placeView、routeView 返回字段的子列表：tree、zones、stocks、habitatCapacity……outerEdges、env、edge、path、from、to、waterway、distanceM、requirement、bearingDeg。另有 §3.2"调度登记"段（:313）里的钩子代号 compareCulture。
  - **卷十五 17 个，错 16 个**。
    - §3.1 :332 是返回形状登记段：readShapes、requirement、effects、skill、minutes、costResource、type、shape。
    - §3.2 写入口段：create、entity、holding、kind、obligation、status，这些是原语名或参数名。同段的 resolve、transition 是卷九的入口，被记成了卷十五的。
  - **卷十九 10 个，全错**。都出自 §3.1"**视图字段**"一行：condition、effective、functions、intendedType、material、occupancy、opsLevel、services、type，加钩子 settleFacilities。
  - **卷二十五 10 个，全错**。
    - :243 原文"物种读 `speciesView`、配方读 `recipeView`、材料读 `materialView`、地点读 `placeView`、环境读 `envAt`……"，这些入口分属卷四、卷三乙、卷五、卷二十，都被收成卷二十五的。
    - :258 原文"收割没有本卷的入口：它就是卷五的 `take`"，下文还有 `intent`、`die`、`butcherOutcome`、`craftOutcome`，也都收了进来。
  - **卷二十六 8 个，全错**。personView、statusView 属卷二 §2.1；psych、psychReaders、exposed、severity、since、psychOut 是状态路径或字段名。
  - **卷二十三 8 个，错 5 个**。classes、enables、workkind 是字段名；itemView、knowledgeView 是别卷入口。isWork、isAdornment、isComposition 三个收对了。
  - **卷三乙 23 个，错 3 个**。§3.2 的 20 个收对。错的 3 个出自 §3.3 写者表后的"`purports` 的写者"段：purports、stockLots、itemInstances，都是状态路径，裁定写明不收。
  - **其他卷**：
    - 卷二十一 personView、statusView、dead；
    - 卷十八 orgView、personView、pathTypes；
    - 卷二十九 ctx、locale、viewer；
    - 卷十七 relocate、viaRelocate；
    - 卷二十二 dims、mentions；
    - 卷八 cancel、schedule；
    - 卷八b paceClass、cancel、schedule 等；
    - 卷十一 entries、merged（§3.4 禁止的旁路 S11-7）；
    - 卷十三 emit；卷三甲 materialView（原文"本卷不设入口"）；卷二十七 cadenceMinutes。
  - **收对的**：卷四 10 个（§3.3 :434，02:45 点名的 loadOf 等），以及卷三乙 §3.2 的 20 个。卷九 11 个里，interpret、narrate、narrateTurn 原文写明"由卷二 §2.9 登记"，归卷存疑，其余可算本卷入口。
- **误收的后果已经进了卡账**：
  - 别卷的入口被记到错的卷上，又绕过了 01:30 的拒收：
    - personView 被 C-卷二十一-status-1 和 C-卷二十六-sys.psyche-1 上线，记作卷二十一、卷二十六的入口；卷四 person-1 也上线它。personView 实际由 3 张卡上线。
    - itemView 由 sys.arts-1（记作卷二十三）和 item-1 两张卡上线。
    - knowledgeView 由 knowledge-1 上线，卷记成了卷二十三。y19 报过这个卷名记错，当时它已被拒收摘掉；本轮它进了 launches。
    - 摘要报"重复上线 0 个"，是因为查重按"卷:名"做键，同一个函数挂在两个卷下就查不出来。
  - entries 出现假入口边：
    - C-卷二十-sys.time_env-2 的 entries 有"卷二十一:personView"，dependsOn 因此多出 →C-卷二十一-status-1。
    - status-2、psyche-3、psyche-4 的 entries 把 personView 当成本对象自己的入口。02:30 的"入口与对象不符"规则因此失效：personView 的上线对象被误判成 status 或 psyche。
  - entryNames 由 577 增到 701；一节多入口由 641 增到 713。增量里有一部分是这些假名字造成的，所以这几项读数不能作为分诊依据。

### 2. 02:45 ③ 卷二 §2.1

- **收入本身**：22 个照收，取的是 §2.1 表（:411–433）第 3 栏，即"入口"栏的首个名字，与原表一一对上。与 01:30 的别名拒收不冲突，§2.1 里没有"名(...).字段"的写法。
- **挡封 T2：拒收改挂没有核对对象**。新代码 :740 把"本卷 §3 查不到、但卷二 §2.1 有"的名字，一律改挂到卷二后保留，没有核对该卡的对象是不是 §2.1 那一行的 kind。
  - 结果：C-卷二十-sys.time_env-1（sys.time_env）的 launches 变成"卷二 §2.1:placeView"，同时 C-卷五-place-1 上线"卷五 §3.1:placeView"。同一个函数两张卡上线，查重读数仍是 0。
  - 02:45 ③ 举的 eventTypeView→event_type-1 是对的；但 time_env 不是 place 表的主办对象。
  - 背后还有一个双登记问题：§2.1 上的 placeView、itemView、speciesView 等，同时登记在各主办卷的 §3（卷五 :287、卷三乙 :416 等），生成器给它们各建一个键。见需李白裁 2。

### 3. 02:30 第 2 条：入口与对象不符（40 行）

- **抽查**：抽查 18 行，对照来源卷落点与 targetObject：M7-29、M21-11、M5-33、M13-28、M7-28、M11-3、M1-5、M4-5、M18-4、M25-34、M20-24、M5-15b、M18-27b、M10-40、M29-3、M11-1、M5-30a、M5-30c。另有 M16-1、M16-3、M16-30 三行，已由 02:30 判过。
- **结论：误伤本对象自己的入口 0 行**。推出的入口都确实属于别的对象：
  - bodyView 属 body_plan、treatmentPreview 属 status、officeView 属 office、combatReadings 属 sys.combat、vowsOf 属 deity；
  - migRows 属 sys.migration、openingOf 属 sys.worldgen、composeScreen 属 sys.display_l10n、stance 属 sys.social。
- **记账两处（推出入口的取法偏弱，规则本身没错）**：
  - 25 行 bodyView 都由"卷二 §2.5 状态谓词"推出：§2.5 正文顺带提到 bodyView，就成了唯一入口。
  - M5-15b、M29-3 落点里真正用的本对象入口（perceive、canEnter；exploreGrade）在第二个节号上，生成器只取第一个节号。这两类结果都是列待查，不会多算边。
- **M4-8**：没有落进"不符"，规则没有误伤它。但它现在不计 speciesView 入口边。原因是卷四 §4.1（:457–513）正文除了 speciesView，还有 renewableOf、carcassOf，这两个是 02:45 ① 新收的真入口，按 01:30"一节多入口列待查、不推定"，M4-8 进了一节多入口。全卡账 entries 里 speciesView 出现 0 次，y19 时是 3 次。这与"M4-8 必须仍计入口边"的要求不一致，见需李白裁 1。
- **规则口径**：比对用的是"行自己的对象"，不是卡的对象。所以并组进来的行仍会给所在卡带来别对象的入口，例如 sys.worldgen-1 带卷十一:migRows、sys.capacity-1 带卷十六:lairOf。这合 02:30 的字面，并组问题归 zeroRow 待查。记账。

### 4. 02:45 ②：两族无环

- **主卡族**：我从卡账 json 逐张抄出 dependsOn，手工验证：
  - 根是 kernel、aiGate、host、content-scripts；
  - 阶段 1 内的链条为 outputGate→aiGate、LEDGER-1→aiGate/kernel、capacity-1→monsters-1→LEDGER-1、各后续卡→本对象首卡；
  - 阶段 2–5 的边都指向更低阶段，或指向本对象首卡。
  - **无环，属实**。
- **子进程卡族**：没有写进 json。生成器用同一个 cyclesOf 跑子进程，读数为"无"。我没能独立重算。
- **注意**：主卡族的边里含 T1 造出的假边（time_env-2→status-1）。T1 修完后，两族都要重算。

### 5. :630（现 :648–656）迁移行处置 132→13

- **合原定义**：卷十一 §2.3 :214 写 disp 必须"恰一个" mig_disp 值，否则拒收；落点（target）只在为空时拒收（delete 例外）。新判法是"disp 不在 mig_disp 中，或落点整格以待补、待定开头"，合这一原定义。
- **枚举值来源**：mig_disp 的取值从卷十一 §2.1 的枚举表读（:130 起），不在脚本里写死。
- **不是特判**：只认"待补、待定"两个通用词，旧判法里也有这两个词。没有专门匹配"（节号待补）"这个字样。
- **132→13 的原因**：乙-7 给 123 行加了"（节号待补）"，旧判法把这些行误算成处置未完成；新判法不再计入。这 123 行已在 entries 无节号待查里，**合理**。
- **记账**：非 delete 行的落点为空时，新旧判法都不计；按 §2.3 应该计。

### 6. entries 重抽（种子 20261115，取法同 y17–y19）

- **抽法**：entries 非空的卡现在只有 30 张。按 (20261115 mod 30 + 31k) mod 30 + 1 抽，k = 0..29，步长 31 对 30 取余为 1，所以 30 张全抽中。
- **① 名字归卷不符：7/30**。我按卷文自己判：
  - #4 status-1，卷二十一:personView；#13 status-2，卷二十一:personView；#30 time_env-2，卷二十一:personView；
  - #21 psyche-1、#26 psyche-3、#27 psyche-4，卷二十六:personView；
  - #5 sys.arts-1，卷二十三:itemView。
  - personView 登记在卷二 §2.1 :417 和卷四；itemView 登记在卷二 §2.1 :412 和卷三乙 :416。七个都来自 T1。
  - 其余名字都回查了各卷 §3 原表，归卷没错：stance 在卷十八 :364，loadWorld、requiredTier 在卷二十八 :296、:300，migRows、migCard 在卷十一 :307–308，等等。
- **② 该列待查而未列：至少 7/30**。上面 7 个都是假名字造成的"唯一"，按实际原文应列待查（§3 找不到，或一节多入口）。其余 23 张没有逐行查完。
- **y19 点名的四张已改清**：#15 material-1、#28 item-2、#29 item-3 的 entries 已空，相关行进了一节多入口；sys.monsters-1 不再接 speciesView。
- 验收要求两项都为 0，**本轮都没达到**。y19 时 ① 是 0/30。

### 7. 红线

我自己 grep 了新增行：
- 没有按迁移行号、条目号写的特判；
- 卷名字面量 1 处：`/^卷十一-/`，用来读 mig_disp 枚举；
- 节号字面量："### 2.1"、'§2.1'。登记卷由 CFG.registry.file 取，节号依据 02:45 ③；
- §2.1 用固定第 3 栏（c[2]）取入口，没有按表头定栏。K1 已要求 §3 表按表头定栏，这里是同一类做法的退步，但结果对。

以上都不是"为某个意图单写一条"，记账。check-卷十一 第 14 项不查本脚本（y19 已更正口径）。

### 8. 复现

- check-卷十一：失败项 0。
- gen-card-ledger.mjs 连跑两次：卡账 json 的 md5 都是 b16083b9…，摘要与提交逐字相同，git 工作区无变化。读数：卡 115，n = 5，阶段分布 3/75/17/16/2/2，matrixBad 102，acceptBad 0，phaseCycle no，launchDup 0，notLaunched 355。
- 快照：勘误前-1116k6b 与父提交卷文逐字相同；封卷.md 与现行卷文逐字相同。

## 挡封真问题

- **T1 散文入口误收（02:45 ① 实现过宽）**
  - 出处：gen-card-ledger.mjs :72–93。凡含"入口"二字的段落、标题带"入口"的整节，段内小写开头的反引号名一律收。
  - 误收的种类：字段名、参数名、状态路径、钩子代号、别卷入口，以及原文明说"没有本卷的入口"的段落（卷二十五 :258）里的名字。
  - 回查约 110 个名字，误收约 95 个：卷五 28/28、卷十五 16/17、卷十九 10/10、卷二十五 10/10、卷二十六 8/8、卷二十三 5/8、卷三乙 3/23 等。
  - 后果：
    - entries 归卷不符 7/30；
    - personView 实际 3 张卡上线，itemView 2 张；
    - knowledgeView 以卷二十三的名义进了 launches；
    - 多出假依赖边 time_env-2→status-1；
    - 01:30 拒收与 02:30 对象不符两道检查都被绕过。
  - 整类修法：只收"标题或该段文字说某名**是**入口"的段落里的函数名，可用"有括号签名，或在原句的'是…入口'句式里"来判。排除写者表后的状态路径段、§3.5 禁止的旁路、"没有本卷的入口"一类否定句。名字若已登记在别卷 §3 或卷二 §2.1，只按引用处理，不收成本卷入口。
- **T2 卷二 §2.1 改挂没有核对对象（02:45 ③ 实现）**
  - 出处：gen-card-ledger.mjs :740。被拒收的 launches，只要名字在 §2.1 就改挂卷二后保留，不看这张卡的对象是不是 §2.1 该行的 kind。
  - 实例：sys.time_env-1 上线 placeView，同时 place-1 也上线 placeView。
  - 整类修法：只在卡对象等于 §2.1 该行 kind 时改挂，否则照旧拒收。查重按函数名做，不按"卷:名"。

## 不挡封记账

- 25 行 bodyView 由卷二 §2.5 的顺带提及推出；落点只取第一个节号，M5-15b、M29-3 本对象的真入口在第二个节号上。两类结果都是待查，不多算边。
- "入口与对象不符"按行自己的对象比，并组行仍把别对象入口带进卡，等 zeroRow。
- 非 delete 行落点为空的，pending 不计，与 §2.3 拒收不一致，新旧判法同样如此。
- 卷名字面量 `/^卷十一-/`；§2.1 按固定栏位取入口。
- 子进程卡族的环没写进 json，只能信生成器读数。
- 卷九的 interpret、narrate、narrateTurn 原文写"由卷二 §2.9 登记"，归卷九存疑。

## 需李白裁

1. **M4-8 与 speciesView**：卷四 §4.1 正文同时有 speciesView、renewableOf、carcassOf，后两个是 ① 新收的真入口。按 01:30"一节多入口列待查、不推定"，M4-8 已不计 speciesView 入口边，全账 entries 里 speciesView 为 0。这与 02:30"M4-8 接 speciesView 不动"冲突。请定：是按 01:30 列待查，还是按某条规则仍取 speciesView。
2. **双登记**：卷二 §2.1 的 22 个读函数，多数同时登记在各主办卷 §3，例如 placeView 在卷二 :417 和卷五 :287，itemView 在卷二 :412 和卷三乙 :416。请定：以哪一处为准，另一处只算引用。这条决定 T2 和上线查重怎么修。

## 防空转

本轮挡封 2 条（T1、T2），y19 是 1 条，**条数增加**。

复发判定：y17 T4"名字归卷不符"在 y18、y19 已判清，y19 的 ① 是 0/30。本轮因 T1，① 变成 7/30，别卷入口又以错的卷名进了 entries 和 launches，**属已清问题复发**。这不是 y19 T1 的余项：余项是"漏收"，本轮是修法过宽造成的"误收"和归卷错。

按 02:18、02:45，kernel 应停，把本清单报李白。y19 T1 本身（卷三乙 §3.2、卷四 §3.3 的真入口漏收）**已改清**。

不可封卷
