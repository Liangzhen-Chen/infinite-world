核对标识：chk-1116-y17（会话标识见主会话台账）；所核提交：4c09a73a

# kernel 李白 01:25 / 01:30 落地只核

范围：4c09a73a（同批 63795f96、d9de6b78 只是照录与 PLAN）。对照李白 01:25（审查/李白裁定-1116-0125-kernel五项.md）与 01:30（PLAN.md 末段）。不看执行记录。本机只跑了仓库里已有的脚本：gen-card-ledger.mjs（含 GEN_CHILD 子进程模式）、transcribe-migrows.mjs、check-卷十一.mjs、check-vol2.mjs、check-vol2-ext.mjs。

## 一 01:25 五项逐条

**第 1 条 M14-82c（按登记卷定对象）**：生成器改成整类判法（regVolOf：规则表键、词表族条目先找登记卷，找不到才用判据一），没有按行号写特判，check-卷十一 第 14 项"生成器代码无卷名字面量"通过。M14-82c 改回卷十四，**符合裁定**。但"登记处"的认法错了，见 T1：13 行里有 7 行被改到了错误的卷。

**第 2 条 机械替换类清扫卡（B1）**
- 必填矩阵：清扫卡的 rowKeys 栏改成"列（机械替换类）／其余—"，splitAxis、segNo 改成"必（机械替换类）／其余—"。:205 改成"默认不改代码（例外见 R11-7.8）"。R11-7.8 补了"全仓库"的范围（server-plugin/、extension/，不含 tools/）、开卡时按版本库重列，以及不豁免上限、按 ①③ 切同阶段段卡、跨段由 segNo 最小那张认领、四件核对只由 segNo 最大那张做。勘误 1116k5 写了必要理由。**符合裁定**。
- 卡账：M2-13 列出 140 个文件（isRuntime 只认 server-plugin/、extension/），拆成 SWEEP-1-1 到 SWEEP-1-7。各段的 .mjs 数是 7、25、25、25、25、25、3，都不超过 25；segNo 从 1 连续编号；rowKeys 只有段 1 写了 [M2-13]；accept 只有段 7 有。M2-13 已经有了接收卡。**符合裁定**。
- 卷二 M2-13：去掉了"129"，改成引用卡账摘要的脚本读数，并写明了范围。**符合裁定**。
- 遗留问题：段 1 到段 6 的 accept 为空，必填矩阵里清扫卡的 accept 仍是"必"，所以这 6 张卡计入 E-MIG-CARD-INCOMPLETE。执行者在 pending 里标了待裁，见 Q3。段 1 的 splitAxis 标的是 consumer_group，实际是按模块组切的（display 一组、rules层 一组），见 Q4。

**第 3 条 M2-19b/19c（B2）**：两行保留 relocate_only。现有文件栏写明了 prompt.mjs 和 turn.mjs，落点写明了各自搬走的导出名。19b 是 parseExamples、promptSections、staticMessages、injectToolExamples、actionNarrationContract；19c 是 assembleMessages、modelContextProjection、modelToolResult。两组不相交，并与基线 d54c89a3 的导出逐个对上。prompt.mjs 里另有一个 isOutOfCharacter，它是场外判定，按卷九 :528 与 M9-15 走 M2-19a 和卷九那条线，不属于提示拼装，所以不算漏。两张搬迁卡 files 相交，C-卷二-outputGate-1 的 dependsOn 是 [C-卷二-aiGate-1]，也就是串行、按卡号升序。**符合裁定**。

**第 4 条 改调入口子行（B3）**：按"规则原文必须写着本行要改的那件事"逐条复核。
- M2-20 改引 R27-7.3，归 sys.offscreen_save。原文是"按 kernel 发的请求编号记进输入序列"，对得上。
- M2-12c 措辞改成"同类见 M22-5"。
- M2-5b 改引 R9-18.5（旁路记录只经 report 写）；M2-18 改引 R9-10.8（静态块取自 prompt 类模板）。两条原文都对得上。
- M2-11c、M2-12a、M2-16 改成待补。我在全书核了：R9-2.8 写的是 learn 原语的字段；R29-7.1 写的是前端适配器只做三件事；ajv、validate/narrow、NetCap、ClientTimerCap、derived-fields 在卷二以外都没有规则原文写着本行要改的事。改成待补有依据。
- 我顺带核了同类的 M2-15b（R9-9.2）、M2-15c（R27-4.11）、M2-15d（R29-3.1）、M2-17（R29-7.9）、M2-19a（R9-9.3，配卷二十九 :456 和卷九 :528 尾注协议退役改读结构化 turn）。原文都写着本行要改的事，成立。
- **符合裁定**。

**第 5 条 R11-2.5 取法（B4）**：第一步改成了原文：zeroRow 按"没有这样的行"处理，取首卡在 R11-7.2 次序中最前的候选。次序用子进程反复迭代、取不动点；6 轮不收敛时摘要写"算不出，报主会话"。旧的"行数最多"只留作对照列，没有再用。按"§6.11 拆行""M14-82c""并组"三类分开报：登记卷改了 13 行；并组改了对象的 277 行，列待查的 282 行。**取法照原文落实了**。

**为什么算不出（实测）**：我用同一个脚本的 GEN_CHILD 模式从 {} 起跑了 10 轮。第 1 到 4 轮各不相同；第 5 轮起在两个状态之间来回（摘要哈希 61800a18 与 1d94ae10 交替，周期 2），不是越来越接近某个值。两个状态里有 37 个对象的首卡次序对调，例如 sys.combat 98↔10、sys.capacity 12↔93、sys.migration 101↔9、table:law_code 36↔104。机制是负反馈：某个对象排得靠前，就会赢下冲突组，组里的行连同它们的文件和 entries 跟着进卡，dependsOn 和阶段随之后移；下一轮它排到后面，冲突组又判给别的对象。

**判断：不是实现问题，是 R11-2.5 这条规则在这种情形下没有解。**
- R11-2.5 用 R11-7.2 的次序来破平局，而 R11-7.2 的次序又由 R11-2.5 的结果决定（卡的行、文件、入口、依赖）。这个定义是自指的，不保证有不动点；在本数据上迭代确实进入周期。
- 另外，卡账当前还有 item⇄recipe 一个环。R11-7.2 的原文是"成环即拒收"，所以此时 R11-7.2 的次序本身也没有定义。

这一点要请李白补裁，见 Q1。

## 二 01:30 entries

**派生只认 §3 入口表的名字：部分偏离。**
- 抽查：在 39 张 entries 非空的卡里，按种子 20261115 抽 30 张（取法见附录乙）。有 4 张不符（13.3%）：LEDGER-1a 和 C-卷三乙-item-2、C-卷九-sys.ai_interface-2 收了退役名（readBook、workmanshipTier，取自卷三乙 §3.4"退役的旧入口"表）；C-卷五-place-1 收了"卷九:canEnter"（canEnter 定义在卷五 §3.2 :303）。
- 未抽中的 LEDGER-1，entries 直接取乙4补 的系统入口表，没有经过 §3 过滤，里面有 `placeId`、`scope`（卷六 §3 里的参数名，不是入口）。
- 详见 T2、T4、T5。

**拒收是否整类：没有做到整类。**
- 首列表头是"读什么"的别名表（卷二十一、卷二十六的 `personView(...)....`）被排除了，这是对的。
- 但卷二十三 §3.1 首列表头是"入口"，表里的 `itemView(...).dims.beauty`、`knowledgeView(...).dims.appeal` 是维度别名，生成器把它们取成了名字 itemView、knowledgeView（T2）。
- 列表写法的 §3 入口一个都没收（T3）。
- launches 一侧仍是旧的名字集合，含别名键（T5）。

**88 条边逐条结论**：见附录甲。原分量 1（14 张卡）的 88 条边：
- 24 条按别名拒收：卷二十:placeView、卷二十一:personView、卷二十六:personView 各 8 条。
- 39 条的入口名是 §3 表里登记的合法名字，但按新判法，源卡各行的卷节对不上这个入口，所以不成边。
- 20 条的入口是卷五 placeView、卷十九 facilityView，它们是 §3.1 列表写法的真入口，生成器没收（T3）。按新判法也不成边。
- 5 条是来源 1 的表间引用边，在新卡账里全部保留。
- 新卡账里这 14 张卡之间已经没有环，deity⇄time_env 环消失。

**剩余环 C-卷三乙-item-1 ⇄ C-卷三乙-recipe-1：两条都是真依赖，不是误配。**
- recipe-1 → item-1（来源 1）：配方行的投入和产出引用物品表，引用方依赖被引用表的首卡，成立。
- item-1 → recipe-1（来源 2）：item-1 的 M3b-21、M3b-27 两行落点是"§4.16 V-1"。卷三乙 :1707 V-1 的原文是"基础价值 valueBase 取产出它的定价配方，用各消耗项的参考价值加工时算"，要读配方行；recipeView 的返回含 §4.16 的 inputValue（:420）。所以对上 recipeView 在语义上是对的。
- 按 R11-7.2，"成环即拒收，退回有关各卷改迁移节"，应退回卷三乙，把 V-1 这两行改归后续卡或配方一侧。见 Q2。

**entries 待查三类数字**：一节多入口 261、找不到 435、无节号 207。重跑后逐字可复现，分类与 01:30"一节多入口或找不到列待查"一致。但两个数都不准：
- 多入口一项被抬高：退役表和卷二十三的别名进了名字集合（T2）；没有"节"栏时，定义节取整行出现的所有节号，连"卷二 §2.1/§2.2"这种别卷的节号和返回说明里的节号也算进来（T6）。
- 找不到一项也偏大：9 个列表写法的入口没收（T3）。

## 三 读数复现

- **重跑生成器**：gen-card-ledger.mjs 跑完后卡账 json 和摘要逐字不变（git status 为空）；transcribe-migrows.mjs 也逐字不变。
- **卡数与阶段**：卡 116 张；n = 7；阶段 0 到 7 各 3、59、19、16、7、2、5、5 张；断链 0；孤儿行 3 行（M2-11c、M2-12a、M2-16）。都对得上。但见 T7：另有 5 行没被转录。
- **固定卡阶段冲突 6 处，与摘要一致**：
  - LEDGER-1a 依赖 recipe-1(阶段 2)、plant-1(阶段 4)、travel-1(阶段 3)；
  - LEDGER-1b 依赖 plant-1；
  - LEDGER-1c 依赖 recipe-1、worldgen-1(阶段 6)。
- **冲突原因**：都是来源 2。这几张账本子卡里的外卷行，是并组时改判给 sys.economy 才进卡的：
  - M25-1/20/28/32/42 原属 table:plant；
  - M17-2/3/13 原属 sys.travel；
  - M10-9/10/13/15 原属 sys.worldgen；
  - M3b-4/5 原属 facility_type 或 recipe。
  这些行全在 282 行待查名单里。它们的卷节带出了 recipeView、forageOptions/butcherOutcome、gateQuote、genView 这些入口，而上线这些入口的卡在更晚的阶段。所以冲突来自 B4 那次不收敛的取法，Q1 定了之后要重算。
- **检查脚本**：
  - check-卷十一：失败项 0，第 14 项"重跑生成器与附录甲逐行比对"通过；
  - check-vol2：PASS；check-vol2-ext：PASS。
- **冻结目录**：a9c07de3..4c09a73a 对 tools/、server-plugin/、extension/、world/ 的 diff 为空。
- **快照**：
  - 卷十一-封卷-勘误前-1116k5.md 与父提交的卷十一逐字相同；改后的卷十一与 卷十一-封卷.md、卷十一-v2.md 逐字相同；
  - 卷二-v17补26-勘误前-1116k5.md 与父提交相同，改后与 卷二-v17补26-现行.md 相同；
  - 两卷都写了勘误记录，矩阵改动写了必要理由。

## 问题

### 真问题

- **T1　登记卷判法把维度表的字段行当成了登记处（01:25 第 1 条）。**
  - regVolOf 认"任一表格首格开头写着该代号"就算登记。13 行里有 7 行因此被改到了错误的卷：
    - M20-12、M20-13、M20-16（`calendar`）改判卷七。依据只是卷七 :165 culture 表的 `calendar` 字段行，那一行自己写着来源是卷二十；词表族 calendar 定义在卷二十 §2.3。
    - M20-42、M20-52、M20-63（`season`）改判卷三乙。依据是卷三乙 :392 物品表的字段行；卷二十 §2.6 写着"词表归本卷"。
    - M20-46（`sense`）改判卷四。卷四 :289 自己写着"内容与字段归卷五 §4.2"，卷二十 :382 也写"族 sense 归卷五"。
  - 其余 6 行（M14-82c、M13-26、M13-33、M3b-13b、M5-26、M10-31）的取卷站得住。
  - 整类修法：登记处只认词表族的定义节（"词表族 `X`"标题，或"本卷拥有的词表族"登记表）和规则表键表，不认维度表里的字段行；不能按行改。
- **T2　§3 入口表解析过宽（01:30 第 1、3 条）。**
  - 只要表头首格含"入口"就收，结果收进了：
    - 卷三乙 §3.4 和卷三甲"退役的旧入口"表，共 11 个旧名。readBook、workmanshipTier 已进了 5 张卡的 entries：LEDGER-1a、C-卷三甲-material-1、C-卷二十三-sys.arts-4、C-卷九-sys.ai_interface-2、C-卷三乙-item-2。
    - 卷二十三 §3.1 的维度别名 `itemView(...).dims.beauty`、`knowledgeView(...).dims.appeal`。
  - 应只收读入口、判定入口、写入口这类表；行首写成"`名(...).字段`"的是别名，应拒收。
- **T3　漏了列表写法的 §3 入口。** 卷五 §3.1 的 placeView、routeView，卷十九 §3.1 的 facilityTypeView、facilityView，卷七的 sameFaith、ordained，卷十八的 related、intimateEligible、intimateAllowed，共 9 个，是用列表写的。它们不在 524 个名字里，落到这些入口定义节的行都被记成"找不到"。
- **T4　入口归卷错。**
  - entryOfRow 在本卷没有这个上线键、而别卷恰好有一个同名键时，就取别卷的。结果卷五 §3.2 的 canEnter 被记成了"卷九:canEnter"。卷九这个键来自乙4补 sys.ai_interface 的入口表，不在卷九 §3。
  - 因此 C-卷五-place-1 平白多了对 C-卷九-sys.ai_interface-1 的依赖。
  - 01:30 的口径是"到该卷 §3 取"，卷应当取名字所在的那个 §3 所属的卷。
- **T5　拒收只做在了 entries 一侧。**
  - LEDGER-1 的 entries 不经 §3 过滤，含 `placeId`、`scope`。
  - launches 仍用旧的名字集合，含别名键：卷二十:placeView、卷二十一:personView、卷二十六:personView。§3 里登记的入口（如卷五 canEnter、take、setAspect）没有上线卡，但摘要报"没有卡上线的入口 0"。这个 0 是按旧名字集合算的，和 entries 用的 §3 集合不是同一口径。
- **T6　没有"节"栏时，入口的定义节取整行出现的全部节号。** 这会把别卷的节号（如卷三乙各入口写的"签名卷二 §2.1/§2.2"）和返回说明里的节号也当成本卷的定义节，各入口互相重叠，"一节多入口"的 261 偏高。item-1 对上 recipeView 是从返回说明里的 §4.16 碰上的，这一次碰巧语义正确。
- **T7（范围外，旧缺陷）转录静默丢行。** transcribe-migrows 的 migRow 正则是 `^M\d+[a-z]*-\d+[a-z]?$`，悄悄丢掉了 M2-10a1、M2-10a2、M2-10a3、M5-10b1、M5-10b2 五行，也不报问题。这五行不在卡账里，也不计入孤儿行，所以"孤儿行 3"偏低。chk-1116-y15 的 O5 把 M2-10a2、M2-10a3 判成"符（未改）"，是误判。

### 需李白补裁

- **Q1　R11-2.5 第一步自指，在本数据上无解（B4）。** 实测见第一节第 5 条：从第 5 轮起两种状态来回，37 个对象的次序对调；同时 item⇄recipe 成环，R11-7.2 的次序本身也没有定义。可选方向：
  - ① 只用并组前的卡族（每行取自己的 targetObject）一次算出 R11-7.2 次序，不回代；
  - ② 对象之间的先后只按来源 1 的表间引用拓扑，再按代号排；
  - ③ zeroRow 转录之前，对象不一致的组不取，计 E-MIG-ROW-ORPHAN 进待查。
  现在卡账用的是第 6 轮的次序，这本身就是一种近似，不符合"不再近似"；99 组的接收卡、n = 7、阶段分布和 6 处冲突都依赖这一选择。
- **Q2　item⇄recipe 两条都是真依赖。** 按 R11-7.2，环要退回卷三乙改迁移节：V-1 估值这两行（M3b-21、M3b-27）是改归 item 的后续卡，还是归配方一侧，请定。
- **Q3　机械替换段卡的 accept。** 段 1 到段 6 不做四件核对，但必填矩阵里清扫卡的 accept 是"必"。这几张卡是另给判据（例如机械替换的脚本复核项），还是在矩阵里把机械替换的非末段卡改成"列"，请定。
- **Q4　清扫段卡切段次序 ① 的"消费者组"。** 清扫卡没有对象，没有消费者组可言；生成器拿模块组来代替，却标成 consumer_group。请确认这样取可以，或者改一个枚举值。

### 措辞小项

- 摘要第二节 dependsOn 一行写"无环（失败：C-卷三乙-item-1→…）"，自相矛盾。
- 摘要第四节还写着"v0 只能用本对象自己的入口……跨对象入口依赖没算进去、n 是下界"，与 01:30 的新判法（entries 可以跨卷）不符。
- 卷十一待补清单第 2 项和摘要只把"阶段读数暂不可用"归因于成环和冲突，没写不动点不收敛同样让接收卡和阶段读数不可用。
- 段卡的 pending 里，通用的"accept:卡的行落点没有写验收编号"一条和专门写的那条重复。
- 搬迁卡之间加的依赖记作来源 4，但方向是按 R11-7.2 的卡号平局次序定的，摘要应当写明。
- transcribe 的问题提示仍写"处置不是五值之一"，现在已经是六种。

## 附录甲　原分量 1 的 88 条边逐条结论

代号说明：
- A：别名，不是该卷 §3 的入口，拒收。卷二十 §3.1 那一行写着"当前环境（别名）"，入口在第二栏；卷二十一、卷二十六的首列表头是"读什么"。
- L：是 §3 表里登记的合法名字，但新判法下源卡各行的卷节对不上它，不成边。
- LL：§3.1 列表写法的真入口，生成器没收（T3），新判法下也不成边。
- S：来源 1 的表间引用，在新卡账里保留。

新卡账里，A、L、LL 三类边一条都没有出现。

| # | 从 | 到 | 入口 | 结论 |
|---|---|---|---|---|
| 1 | 卷七-deity-1 | 卷二十-time_env-1 | 卷二十:placeView | A |
| 2 | 卷七-deity-1 | 卷二十二-knowledge-1 | 卷二十二:subjectiveView | L |
| 3 | 卷七-deity-1 | 卷五-place-1 | 卷五:placeView | LL |
| 4 | 卷七-deity-1 | 卷十-worldgen-1 | 卷十:composeName | L |
| 5 | 卷七-deity-1 | 卷十九-facility_type-1 | 卷十九:facilityView | LL |
| 6 | 卷七-deity-1 | 卷四-person-1 | — | S |
| 7 | 卷三甲-material-1 | 卷十九-facility_type-1 | 卷十九:facilityView | LL |
| 8 | 卷二十-time_env-1 | 卷七-deity-1 | 卷七:faithOf | L |
| 9 | 卷二十-time_env-1 | 卷二十一-status-1 | 卷二十一:personView | A |
| 10 | 卷二十-time_env-1 | 卷二十二-knowledge-1 | 卷二十二:subjectiveView | L |
| 11 | 卷二十-time_env-1 | 卷二十六-psyche-1 | 卷二十六:personView | A |
| 12 | 卷二十-time_env-1 | 卷五-place-1 | 卷五:placeView | LL |
| 13 | 卷二十-time_env-1 | 卷十九-facility_type-1 | 卷十九:facilityView | LL |
| 14 | 卷二十-time_env-1 | 卷十八-social-1 | 卷十八:holdingKind | L |
| 15 | 卷二十-time_env-1 | 卷四-person-1 | 卷四:personView | L |
| 16 | 卷二十一-status-1 | 卷七-deity-1 | 卷七:faithOf | L |
| 17 | 卷二十一-status-1 | 卷二十-time_env-1 | 卷二十:placeView | A |
| 18 | 卷二十一-status-1 | 卷二十二-knowledge-1 | 卷二十二:subjectiveView | L |
| 19 | 卷二十一-status-1 | 卷二十六-psyche-1 | 卷二十六:personView | A |
| 20 | 卷二十一-status-1 | 卷五-place-1 | 卷五:placeView | LL |
| 21 | 卷二十一-status-1 | 卷十九-facility_type-1 | 卷十九:facilityView | LL |
| 22 | 卷二十一-status-1 | 卷十八-social-1 | 卷十八:holdingKind | L |
| 23 | 卷二十一-status-1 | 卷四-person-1 | 卷四:personView | L |
| 24 | 卷二十二-knowledge-1 | 卷二十-time_env-1 | 卷二十:placeView | A |
| 25 | 卷二十二-knowledge-1 | 卷五-place-1 | 卷五:placeView | LL |
| 26 | 卷二十二-knowledge-1 | 卷十九-facility_type-1 | 卷十九:facilityView | LL |
| 27 | 卷二十六-psyche-1 | 卷七-deity-1 | 卷七:faithOf | L |
| 28 | 卷二十六-psyche-1 | 卷二十-time_env-1 | 卷二十:placeView | A |
| 29 | 卷二十六-psyche-1 | 卷二十一-status-1 | 卷二十一:personView | A |
| 30 | 卷二十六-psyche-1 | 卷二十二-knowledge-1 | 卷二十二:subjectiveView | L |
| 31 | 卷二十六-psyche-1 | 卷五-place-1 | 卷五:placeView | LL |
| 32 | 卷二十六-psyche-1 | 卷十九-facility_type-1 | 卷十九:facilityView | LL |
| 33 | 卷二十六-psyche-1 | 卷十八-social-1 | 卷十八:holdingKind | L |
| 34 | 卷二十六-psyche-1 | 卷四-person-1 | 卷四:personView | L |
| 35 | 卷五-place-1 | 卷七-deity-1 | 卷七:faithOf | L |
| 36 | 卷五-place-1 | 卷二十-time_env-1 | 卷二十:placeView | A |
| 37 | 卷五-place-1 | 卷二十一-status-1 | 卷二十一:personView | A |
| 38 | 卷五-place-1 | 卷二十二-knowledge-1 | 卷二十二:subjectiveView | L |
| 39 | 卷五-place-1 | 卷二十六-psyche-1 | 卷二十六:personView | A |
| 40 | 卷五-place-1 | 卷十九-facility_type-1 | 卷十九:facilityView | LL |
| 41 | 卷五-place-1 | 卷十八-social-1 | 卷十八:holdingKind | L |
| 42 | 卷五-place-1 | 卷四-person-1 | 卷四:personView | L |
| 43 | 卷八b-offense-1 | 卷二十一-status-1 | 卷二十一:personView | A |
| 44 | 卷八b-offense-1 | 卷二十二-knowledge-1 | 卷二十二:subjectiveView | L |
| 45 | 卷八b-offense-1 | 卷二十六-psyche-1 | 卷二十六:personView | A |
| 46 | 卷八b-offense-1 | 卷十九-facility_type-1 | 卷十九:facilityView | LL |
| 47 | 卷八b-offense-1 | 卷四-person-1 | 卷四:personView | L |
| 48 | 卷十-worldgen-1 | 卷二十一-status-1 | 卷二十一:personView | A |
| 49 | 卷十-worldgen-1 | 卷二十二-knowledge-1 | 卷二十二:subjectiveView | L |
| 50 | 卷十-worldgen-1 | 卷二十六-psyche-1 | 卷二十六:personView | A |
| 51 | 卷十-worldgen-1 | 卷八b-offense-1 | 卷八b:normStack | L |
| 52 | 卷十-worldgen-1 | 卷十九-facility_type-1 | 卷十九:facilityView | LL |
| 53 | 卷十-worldgen-1 | 卷十八-social-1 | 卷十八:opinionOf | L |
| 54 | 卷十-worldgen-1 | 卷四-person-1 | 卷四:personView | L |
| 55 | 卷十九-facility_type-1 | 卷七-deity-1 | 卷七:faithOf | L |
| 56 | 卷十九-facility_type-1 | 卷二十二-knowledge-1 | 卷二十二:subjectiveView | L |
| 57 | 卷十九-facility_type-1 | 卷八b-offense-1 | 卷八b:normStack | L |
| 58 | 卷十八-social-1 | 卷二十二-knowledge-1 | 卷二十二:subjectiveView | L |
| 59 | 卷四-body_plan-1 | 卷七-deity-1 | 卷七:faithOf | L |
| 60 | 卷四-body_plan-1 | 卷二十-time_env-1 | 卷二十:placeView | A |
| 61 | 卷四-body_plan-1 | 卷二十一-status-1 | 卷二十一:personView | A |
| 62 | 卷四-body_plan-1 | 卷二十二-knowledge-1 | 卷二十二:subjectiveView | L |
| 63 | 卷四-body_plan-1 | 卷二十六-psyche-1 | 卷二十六:personView | A |
| 64 | 卷四-body_plan-1 | 卷五-place-1 | 卷五:placeView | LL |
| 65 | 卷四-body_plan-1 | 卷十九-facility_type-1 | 卷十九:facilityView | LL |
| 66 | 卷四-body_plan-1 | 卷十八-social-1 | 卷十八:holdingKind | L |
| 67 | 卷四-body_plan-1 | 卷四-person-1 | 卷四:personView | L |
| 68 | 卷四-person-1 | 卷七-deity-1 | 卷七:faithOf | L |
| 69 | 卷四-person-1 | 卷二十-time_env-1 | 卷二十:placeView | A |
| 70 | 卷四-person-1 | 卷二十一-status-1 | 卷二十一:personView | A |
| 71 | 卷四-person-1 | 卷二十二-knowledge-1 | 卷二十二:subjectiveView | L |
| 72 | 卷四-person-1 | 卷二十六-psyche-1 | 卷二十六:personView | A |
| 73 | 卷四-person-1 | 卷五-place-1 | — | S |
| 74 | 卷四-person-1 | 卷五-place-1 | 卷五:placeView | LL |
| 75 | 卷四-person-1 | 卷十九-facility_type-1 | 卷十九:facilityView | LL |
| 76 | 卷四-person-1 | 卷十八-social-1 | 卷十八:holdingKind | L |
| 77 | 卷四-person-1 | 卷四-species-1 | — | S |
| 78 | 卷四-species-1 | 卷七-deity-1 | 卷七:faithOf | L |
| 79 | 卷四-species-1 | 卷三甲-material-1 | — | S |
| 80 | 卷四-species-1 | 卷二十-time_env-1 | 卷二十:placeView | A |
| 81 | 卷四-species-1 | 卷二十一-status-1 | 卷二十一:personView | A |
| 82 | 卷四-species-1 | 卷二十二-knowledge-1 | 卷二十二:subjectiveView | L |
| 83 | 卷四-species-1 | 卷二十六-psyche-1 | 卷二十六:personView | A |
| 84 | 卷四-species-1 | 卷五-place-1 | 卷五:placeView | LL |
| 85 | 卷四-species-1 | 卷十九-facility_type-1 | 卷十九:facilityView | LL |
| 86 | 卷四-species-1 | 卷十八-social-1 | 卷十八:holdingKind | L |
| 87 | 卷四-species-1 | 卷四-body_plan-1 | — | S |
| 88 | 卷四-species-1 | 卷四-person-1 | 卷四:personView | L |

合计：A 24 条，L 39 条，LL 20 条，S 5 条。

本附录只核了两件事：入口名对不对得上 §3，以及新卡账里有没有这条边。L 类各源卡的每一行卷节没有再逐行复核。

## 附录乙　O5 与 entries 抽样（种子 20261115）

**O5**：总体与 chk-1116-y15 相同，是卷二 §6.11 的 69 行 M2 行，按卷内次序编号。起点 20261115 mod 69 = 24，步长 31，第 k 个样本取 (24+31k) mod 69 + 1，k = 0..29，共 30 行，与 y15 抽的是同一批行。

上次不符的两行现在相符：
- M2-19c 归 C-卷二-aiGate-1，outputGate-1 依赖它；
- M2-13 归 SWEEP-1-1。

改动过的几行也相符：
- M2-12a 改为待补、计孤儿，合 01:25 第 4 条；
- M2-5b 改引 R9-18.5，M2-18 改引 R9-10.8，都归 C-卷九-sys.ai_interface-1；
- M2-15c 归 offscreen_save-1，M2-17 归 display_l10n-1，M2-43b 归 social-1。

relocate_only 的 kernel 各行（M2-3a、M2-33、M2-36、M2-37、M2-40、M2-42、M2-44）都归 C-卷二-kernel-1，M2-12b 归 content-scripts-1。各条"同 X"别名行不单独计数，相符。

**不符 2 条：M2-10a2、M2-10a3**，这两行没被转录，不在卡账里（T7）。不符 2/30，比例 6.7%。这两条是转录阶段的旧缺陷，与 01:25、01:30 无关。

**entries 抽样**：总体是 entries 非空的 39 张卡，按卡账次序编号。起点 20261115 mod 39 = 30，步长 31，抽 30 张，取到的编号是 2–7、10–15、18–23、26–31、33–38。逐个入口对各卷 §3 表首格核对。

不符 4 张：
- LEDGER-1a：readBook 是退役名；
- C-卷九-sys.ai_interface-2：workmanshipTier 是退役名；
- C-卷五-place-1：卷九:canEnter 归卷错；
- C-卷三乙-item-2：workmanshipTier 是退役名。

不符 4/30，比例 13.3%。

不可封卷
