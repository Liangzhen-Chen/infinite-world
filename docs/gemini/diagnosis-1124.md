# 《无限原野》整仓深度诊断与重构方案

基线：只读核查 `origin/master`（代码与设计主干对照基线 `3b7ea6a7f` / `2ff6f20ad`，并核最新主线 `d95b5c4db` 仅补入 `ds/c4-grid`、`ds/c7-misc` 与 `当前状态.md` 交接），时间：2026-11-24 13:55 GMT（伦敦时间）。全部结论均对照仓库原文、代码、脚本与提交历史亲核；凡无提交或文件证据支撑的主会话口头汇报，一律标为「主会话自称，未核」。唯一评判标准为亮圳的北极星（`docs/产品原则.md`），其余一切现行规矩、裁定、流程与架构细则均纳入审视与推翻范围。

---

## 一、总判（结论先行）

当前项目真正的病根不是“代码写得慢”，而是**四重结构性错位**正在把系统拖向北极星的反面：

1. **底层架构反转且防线空转**：设计要求无领域语义的小内核 + 强约束规则层，现实却是 `kernel/` 吞掉 71.5% 的文件与 85.5% 的代码行数，门禁放过 97% 的内核出口，核心运行期机制（`declareInputs`、`modifierSource`、`unitOfPath`）全仓零调用，甚至运行期新建实体（`state.created`）被 `writePath` 当成非法黑户拒写。
2. **多处已封卷设计存在量级与契约级死锁**：5,340 万区格纯函数无索引 + 一写全清缓存，在 59 人极简数据下已击穿全部预算；`time` 原语在“单事务 `execute` + 禁嵌套事务 + 自开事务 `advance`”三角约束下结构性不可实现；100 m 区格尺规撞碎聚落/住区层级。
3. **重型物理骨架与核心世界内容断成“两张皮”**：五文化圈、神灵、超自然在服务端与维度表中为 0 引用，物理文献出处刚性与 `null` 键缺陷锁死了第二物种与内容扩容；面向玩家的无 AI 菜单动作、存档挂接与前端交互在生产入口上仍是真空。
4. **治理方法论逆着“执行者必会遗忘”的现实走**：持续叠加文本规矩与形式自查（裁定改 84 次、`CLAUDE.md` 改 25 次、勘误 175 次），却缺远端 CI、`tsc`、三方模型硬核验，甚至派卡脚本仍在自动注入已作废的旧规矩，且规则禁止使用独立 $200/月非交互 API 额度，白白加剧资源错配。

---

## 二、七条深层根因与可落地解决方案

### 1. 〔架构边界 · AI 不执行〕L0 内核吞噬七成领域代码，`kernelApi` 与 `writePath` 防线三层穿透

**结论**：卷一与 `docs/架构设计/03-分层与玩法包.md` 规定 L0 内核不含任何领域语义，且规则层只能经 `kernelApi` 封闭出口交互、所有状态写入必经 `writePath`。但现实恰好反转：`kernel/` 成了豁免约束的特权大泥球，门禁放过了 97% 的内核出口，规则层已出现 14 处裸导内核内部符号（甚至直接裸调禁用的 `runTransaction`），内核自己 36 处绕过 `writePath`，而规则层 4 个导出反被倒灌进 `kernelApi.exports`。

**严重度**：致命

**仓库证据**：
- **体量与职责反转**：全仓 `server-plugin/` 共 151 个 `.mjs`（32,556 行），其中 `server-plugin/kernel/` 独占 **108 个文件（71.5%）、27,836 行（85.5%）**（清单见 `server-plugin/kernel/files.json:1-110`），规则层仅 34 个文件（13.4%）。地理/足迹/建筑/体元/洞穴/路网（`kernel/place.mjs` 1,663 行等）、物品/腐坏/配方/估值（`kernel/item*.mjs`、`recipe.mjs`、`valuation.mjs`）、气候/天气/历法、政体统治、世界生成 18 个文件（`kernel/gen/`）全部沉入内核。
- **集中静态加载器造成高频返工**：`server-plugin/kernel/load/world.mjs:17-43, 134-169` 用 22 条静态 import 串死全领域。`origin/master` 历史上 `world/ontology/state-owners.json` 被改 **54 次**、`kernel/files.json` **48 次**、`kernel/load/world.mjs` **36 次**、`kernel/place.mjs` **26 次**（代表提交 `c12bab430`、`1946b9a11`、`96ec3809b`、`d7a8bb32a`、`d43cb1aae`）。
- **门禁放过 97% 出口，14 处裸绕过直接合入**：`tools/accept/detectors/import_edge.mjs:4` 明文不核导出级限制；`tools/accept/lib/api-callers.mjs` 仅核 `items.json` 点名的 **5/182** 个 `kernelApi.exports`。实存 14 处规则层绕过：`server-plugin/world-create.mjs:10-15`（提交 `4c7eb9486`）直接裸导 `kernel/transaction.mjs#runTransaction`（`transaction.mjs:230` 明标不在 `kernelApi`）、`KernelError`、`generateFill`、`applyGovernorCalls`、`applyOpeningAssets`、`VIA`；`server-plugin/field-step.mjs:12`（`d7a8bb32a`）裸导 `kernel/det-math.mjs` 4 个内部函数；`primitives-runtime.mjs:33` 裸导 `CODE_RE`/`KEY_RE`；`person.mjs:12` 裸导 `distributionMeanFixed`；`opening-people.mjs:12` 裸导 `KernelError`。
- **反向污染与写口双轨**：`world/ontology/state-owners.json:255-268` 将 4 个规则层导出（`grid-diff.mjs#alterCells`/`clearDiffs`、`sight.mjs#losView`、`perceive.mjs#perceiveEvent`）塞入 `kernelApi.exports`，`kernel/load/state-owners.mjs` 不校验路径前缀。全仓非测试代码中，经 `writePath` 写入仅 **18 处**，而内核内部裸调 `txSet` **33 处** + `txDelete` **3 处**；`server-plugin/kernel/storage.mjs:191-196` 的 `writerOk` 完全未实现 `rewriteRows` 校验（`docs/问题.md:632`），`tools/accept/detectors/path_access.mjs:242` 不认 `dated` 标志（`docs/问题.md:630`）。

**若不改会怎样**：L0 彻底失去稳定无语义底座的作用，玩法包无法按架构独立演进；任何规则层模块都能绕过事务、事件日志与写权校验直接篡改底层状态，改一处状态路径或表结构必须全仓盲查。

**【可落地的解决方案】**：
- **改什么机制**：
  1. **导出级默认拒绝门禁**：改造 `tools/accept/detectors/import_edge.mjs`，对所有跨模块组导入（尤其 `rules -> kernel/*`）按具名符号逐个核对 `state-owners.json#kernelApi.exports`（或 `groupApi.exports`）及 `callers`/`callerFiles`，禁止跨组 `import *` 或默认导入；未登记符号一律在 `pre_commit` 报 `E-VIEW-INPUT-IMPORT`（零基线豁免）。同步清掉现有 14 处裸导。
  2. **加载器强校验归属 + 冻结内核扩容**：在 `server-plugin/kernel/load/state-owners.mjs` 硬校验 `kernelApi.exports` 路径必须以 `kernel/` 开头，把 4 条规则层导出迁入卷二 `:683` 已定义的 `groupApi.exports`。在 `tools/accept/run.mjs` 增设**内核白名单冻结检查**：除 `kernel/files.json` 既有 L0 基座文件外，禁止向 `server-plugin/kernel/` 新增任何业务领域文件；在 `kernel/load/world.mjs` 增加 `registerDomainValidator(kind, fn)` 插件注册口，停止继续把领域校验和业务搬进内核。
  3. **写口能力化与补漏**：在 `server-plugin/kernel/storage.mjs#writerOk` 补齐 `rewriteRows` 运行期校验；在 `tools/accept/detectors/path_access.mjs` 补齐 `dated` 静态拒写；将 `txSet`/`txDelete` 设为 `call_edge` 零违例受限入口，仅允许 `kernel/storage.mjs` 与 `kernel/ledger.mjs`（受守恒保护）极少数核心原语调用，其余内核写入统一走能力对象或 `writePath`。
- **谁执行**：内核与门禁架构专卡（写码、出题、审卡严格三方不同模型；出题方仅按卷二 §2.6–§2.7 写越权反例）。
- **怎么验收生效**：① 故意在任意规则层文件添加 `import { runTransaction } from './kernel/transaction.mjs'`，执行 `node tools/accept/run.mjs pre_commit` 必须非 0 退出并报 `E-VIEW-INPUT-IMPORT`；② 故意向 `kernelApi.exports` 写入非 `kernel/` 路径，执行 `node --test tests/kernel/state-owners.test.mjs` 必须拒载；③ 故意在 `server-plugin/kernel/` 下新增一个未批准 `.mjs` 文件，提交钩子直接阻断；④ 越权改写 `rewriteRows` 范围外的行，运行期单测必抛 `E-VIEW-UNDECLARED-WRITE`。
- **为何不依赖 AI 记忆也能生效**：边界从“文档声明”变成 `pre_commit` + 加载器硬断言。哪怕主会话与写码代理完全忘记分层规矩，裸导内核函数、往 `kernel/` 塞业务、或倒灌 `kernelApi` 都会在提交或加载瞬间被机器拦死。

---

### 2. 〔AI 不执行 · 系统性走偏〕「派生优先、单一真相」三大核心管线全线空转，滋生私有缓存、静默兜底与僵尸校验

**结论**：北极星“引擎是世界一部分、派生优先、不写死”在卷二里有三根机械承重柱：① `declareInputs` + 精准 `stateMemo`；② `installModifierSource` + `derived-process.json` 统一九步修正管线；③ 统一加载校验与“未知不兜底”契约。现实中这三根柱子全部架空——全仓生产代码 0 调用、20+ 个私有 `WeakMap` 各自为政、111 个派生跳过 RX 手写、三分之二错误码从未抛出、缺依赖时静默跳过校验或拿近似值顶替，数据契约被原样硬抄回 `.mjs`。

**严重度**：致命

**仓库证据**：
- **依赖闭包与记忆体架空**：全仓非测试代码扫描，`declareInputs` **0 调用**、`inputsOf` **0 调用**、`stateMemo` 仅在 `server-plugin/kernel/dimensions.mjs:529` 调用 **1 次**。`server-plugin/kernel/memo.mjs:54-56`（提交 `55a847af6`、`0fe87ebbf`）改为任一状态写入即 `memos.delete(state)` 整树全清；`kernel/load/world.mjs:225` 将 `dim`/`modified` 的 `uses` 全硬置 `[]`；`tools/accept/detectors/decl_cmp.mjs:251` 至今写死抛 `E-ACC-ITEM-UNIMPLEMENTED decl_cmp inputs: declareInputs not built`。结果全仓长出 **20 余个模块级 `WeakMap`/`Map` 私有缓存**（仅 `kernel/place.mjs` 就自建 5 个：`:167, :825, :1106, :1121, :1339`，并直读 `state.created`）。
- **运行态修正管线与过程槽为空壳**：`server-plugin/kernel/dimensions.mjs:50` `modifierSource` 恒为 `null`，全仓非测试代码 `installModifierSource` **0 调用**；`world/rules/tables/derived-process.json:1` 全文仅为空壳 `{"version":1,"slots":{},"consumers":{}}`（提交 `4c28ab76e`），`server-plugin/` 中 `grep "derived-process"` 为 **0 命中**；`world/ontology/dimensions/_unbuilt-derived.json`（改 23 次）积压 **111 条未建派生、63 条未建列、36 个未建族**，逼出 `server-plugin/person.mjs:70-78` 硬编码分流表。
- **三分之二错误码为僵尸码 + 遇缺静默跳过**：`server-plugin/kernel/error-codes.mjs` 共登记 **623 个码**，其中 **417 个（66.9%）** 在全仓 `server-plugin/` 中 **0 引用**；`kernel/validate/dimensions-validate.mjs:4-5` 明写未实现 L4 不变量与分布参数校验；`kernel/item.mjs:502-532` 遇 `rules.climate.envTempDomain` 缺失时整段静默跳过 I-7/I-8/I-9 三项核心校验。
- **静默顶替未知 + 契约硬抄双份**：`kernel/place.mjs:1381-1383` 拿地点自身 `elevationM` 静默顶替缺失的 `surfaceRefElevationM`（算错室内/地下温度，`docs/问题.md:990`）；`world/ontology/dimensions/person.json:21, 36` 仍挂超宽占位钳位 `[0, 100000]` 与 `[0, 1000]`；`kernel/rx.mjs:368-374` 把合法显式 `null`（“已知没有”）当异常 `fail()` 报错；`server-plugin/primitives-runtime.mjs:49-70`（改 45 次）一字不差硬抄 `world/ontology/primitives.json` 20 条契约；`kernel/holdings.mjs:77-78` 硬写 9 项 `TEMPLATE_NAMES`（与卷一 `:417` “八类”矛盾）；`kernel/load/state-owners.mjs:50` 硬写 22 项 `ENTITY_KINDS`。

**若不改会怎样**：20+ 私有缓存与事务回滚、`replay_apply` 脱节，必爆难以复现的 `E-REPLAY-DIVERGE`；动态修正（伤病、法术、议价、关系）无法接入只能被迫在各领域写死公式；坏数据和错温度在“全绿加载”掩护下静默污染世界。

**【可落地的解决方案】**：
- **改什么机制**：
  1. **启动期装配完整性硬断言**：在 `server-plugin/kernel/mount.mjs#mountKernel` 尾部增加不可跳过检查——若任意已加载表存在 `modifiable: true` 维度而 `modifierSource === null`，或任意已声明消费的 `process.<slot>` 在 `derived-process.json#slots` 中缺失，`mountKernel`/`loadWorld` 直接抛错阻断启动。
  2. **接通 `decl_cmp` + 禁私有缓存 AST 门禁**：删除 `tools/accept/detectors/decl_cmp.mjs:251` 的 `UNIMPLEMENTED` 桩并激活 `vol2.S9`/`S15`；在 `tools/accept/lib/ast-rules.mjs` 新增零违例规则，禁止 `server-plugin/` 在 `kernel/memo.mjs` 之外声明以 `state`/`engine` 为键的顶层 `WeakMap`/`Map`；改造 `kernel/memo.mjs` 支持按顶层状态键切片失活（不再一写全清）。
  3. **元数据加载注入 + 码表活性审计 + 消灭静默跳过**：由 `kernel/load/world.mjs` 直接注入 `primitives.json`、`entity-templates.json` 与 `_vocab.json#kind` 进 `engine`，删除 `CATALOG`/`TEMPLATE_NAMES`/`ENTITY_KINDS` 三份代码副本；修掉 `rx.mjs:368-374` 显式 `null`、`place.mjs:1383` 顶替、`person.json:21,36` 占位上下界、`item.mjs:502-532` 静默跳过；在 `tools/accept/` 增设错误码活性脚本，要求 `error-codes.mjs` 显式标注 `active`（必有抛出点）与 `deferred`（绑未建卷），不允许无归属僵尸码。
- **谁执行**：分两张依赖串行卡——卡 A（内核求值/缓存/`rx.mjs`/元数据注入）+ 卡 B（门禁激活 `S9/S15`/禁私有缓存/码表审计）。
- **怎么验收生效**：① 注释掉 `installModifierSource` 接线后跑 `mountKernel` 必抛错；② 在任意模块顶层新增 `const cache = new WeakMap()` 跑 `node tools/accept/run.mjs pre_commit` 必报违例；③ 新增一个未在 `server-plugin/` 抛出且未标 `deferred` 的错误码，审计脚本返回非 0；④ 给 `item.mjs` 传缺 `envTempDomain` 的规则表，加载测试必拒载而非通过。
- **为何不依赖 AI 记忆也能生效**：启动装配断言、加载校验拒收、私有缓存 AST 禁令和码表审计全由代码与脚本执行。执行者哪怕完全遗忘卷二 §2.3 和 §3.5，写私有缓存会被提交钩子拦，漏接修正源则连引擎启动单测都过不了。

---

### 3. 〔设计内在矛盾 / 做不成〕量级预算碰撞、事务与调度器死锁、100 m 区格尺规与多卷原文互撕

**结论**：多处卡死不是写码偷懒，而是已封卷的几条设计铁律**在数学量级和架构契约上互相打架**——任何忠实按卷文写出的代码都会撞墙。包括：5,340 万区格纯函数现算在 59 人极简世界就击穿性能预算；`time` 原语在单事务执行器与自开事务调度器之间形成结构性死锁；100 m 区格尺规与聚落内部米级住区层级互斥；多卷在校验时机、落格与物态粒度上原文直接冲突。

**严重度**：致命

**仓库证据**：
- **量级铁律自相矛盾（59 人即击穿预算）**：`docs/研究/地理格子世界方案与迁移计划-1119.md:22-26, 134-142` 要求 100 m 区格 / 1 m 细格、基底不存纯函数现算、泡展开 `≤ 200 ms/区格`；G5b 实际外包框达 `8,900 × 6,000 = 5,340 万区格`（`docs/问题.md:748`）。仅 509 行地点的 `place.json` 已达 **3.78 MB / 328,176 行**，`loadWorld` 耗时 **~7.0 s / 峰值 ~745 MB**（`96ec3809b` 提交说明）；单郡约 10⁶ 区格气候首读耗时 **~68 s 至 1.8 分钟**（`docs/问题.md:989`）；单区格仅放 **20 个个体**的泡展开已耗时 **~400 ms**（超预算一倍，`docs/问题.md:654`）；`bubble.mjs:58-88`、`sim-tiers.mjs:52-61`、`item-state.mjs:201`、`perceive.mjs` 全线全表扫描。
- **事务与调度器结构死锁**：`卷一:122`、`卷九:647,663,723`（R9-2.3、R9-3.11）要求所有原语（含 `time`）在 `execute()` 单次事务内原子完成；`kernel/transaction.mjs` 严禁嵌套事务；`kernel/scheduler.mjs:589,604,660` 的 `advance()` 每刻必须自行 `runTransaction`。`server-plugin/primitives-runtime.mjs:10-12` 与 `docs/问题.md:764` 确认 `time` 在现行卷文下不可实现，只能恒拒 `E-ACT-WRITER-NOT-READY`。
- **100 m 尺规撞碎聚落层级**：`卷五 §4.1 规则 3` 要求非建筑地点按 100 m 区格划分且同父种子不得同区格；实测 86 个子站点落父足迹外被迫改挂郡，16 个住区作区域站点有 8 处撞格（`E-GRID-SEED-SAME-CELL`），改作建筑又因卷十 R10-7.1 缺“建筑下建筑”导致 19 栋私宅无解，最终只能硬把私宅上提到营地、丢弃“住区—家户”层级（`docs/问题.md:729-749, 880-884`）。
- **跨卷原文直接互撕**：① `卷五 规则 11` 要求加载期核体积顶面暴露，但体积派生依赖开局后的战役种子，致 `checkVolumeCells` 全仓 0 生产调用者（`docs/问题.md:612`）；② 展开落格 `卷十七:297-304` 与 `卷二十七:317`/`卷五:501` 互翻（`server-plugin/bubble.mjs:13`）；③ `卷三乙:1463`（整件物态）与 `:669,681`（逐份物态）反转，同卷 `:285` 与 `K-3:1046` 批次判同键漏 `spot`；④ `卷五:323` 与 `卷二十:853` 不符（最新提交 `f3c8ee61f` 刚再爆一例）；⑤ `卷二十七 R27-4.3` 严格 `rulesDigest` 拒读与海量“暂定待标定参数”+ `卷二十八 §1.3` 可追加内容包存在刚性张力。

**若不改会怎样**：全规模九省 31 郡一旦装入真实人口与存货，开档将达数十分钟、跨格移动秒级卡顿；所有耗时动作因 `time` 死锁永久不可玩；后续每张跨卷卡都会不断撞上卷文互撕被迫停工勘误。

**【可落地的解决方案】**：
- **改什么机制**：
  1. **确立「确定性可重建派生索引与烘焙投影」层**：修订卷五、卷二十、卷二十七 §4.1——明确“权威状态（进 `saveDigest`）”与“确定性可重建索引/烘焙层（不进 `saveDigest`，可一键重建并验一致）”的边界。将郡级百万区格静态海拔均值等烘焙进世界构建产物（随地形 `dated` 改写按郡增量失效）；在内核新建随事务原子同步的 3 张衍生索引（`regionSubjects`、`instanceHolder`、`playerSeats`），并让 `bubbleTransition` 按区格复用单次 `gridView` 读窗。
  2. **解除 `time` 事务死锁**：修订卷九 §4.2–§4.3，将时间推进拆为 `resolve()` 返回的 **`postCommit.advanceMinutes` 提交后协议**——`execute()` 单事务原子写状态与事件并提交，提交后由 `submitProposal` 外层调 `scheduler.advance()` 逐刻推进，既无嵌套事务又保 `replay_apply` 确定性。
  3. **修正尺规与跨卷契约机器化**：修订卷五 §4.1 与卷十 R10-7.1，将聚落内住区/街坊设为**逻辑/细格亚区**（不参与 100 m 区域足迹划分与同格互斥）；将 `checkVolumeCells` 归入 `startGame` 绑定种子阶段；将卷二十七指纹拆为 `engineRulesDigest`（逻辑指纹）与 `dataPacksDigest`（支持只增追加）。建立 `world/ontology/contracts.json` 单一机器契约表，由脚本统一生成跨卷枚举/签名/校验时机检查，不再靠人工在 29 个 Markdown 里同步。
- **谁执行**：架构勘误与内核解锁卡（先由独立跨卷勘误一次合并拍板，再由三方分离落码）。
- **怎么验收生效**：① 端到端测试提交一个耗时 30 分钟的动作，验证状态原子落盘 + 时钟推进 30 分钟 + `save/load/replay_apply` 后 `saveDigest` 逐字节一致；② 真实世界气候首读与 20 人泡展开压进自动性能门禁（首读 `< 3 s`、泡展开 `< 100 ms`），进腾讯云基准脚本；③ 恢复“营地→住区→19 栋私宅”三层树并全量 `loadWorld` 绿灯。
- **为何不依赖 AI 记忆也能生效**：把性能阈值、时间推进复演、三层聚落加载全部焊进自动化测试与 CI；把跨卷共享契约收进单一 `contracts.json` 校验器，改一处不同步则构建即红，无需任何人记住 29 卷行号。

---

### 4. 〔盲区（方向⑤）〕运行期新建实体沦为内核“二等黑户” + 活局/存档/无 AI 交互主干全线悬空 + 规则错禁 $200/月独立 API 额度

**结论**：这是主会话和李白都当成“以后顺手接上”或完全没注意到的三大致命盲区：① `storage.mjs`、`handles/keys.mjs`、`valuation.mjs` 全部只认加载期静态 `idIndex`，导致**任何运行期新建实体（新生儿、新建房屋、打造实例、新组织）根本写不进任何 `ref` 状态路径、也进不了修正管线**；② 北极星要求“不依赖 AI 也能完整游玩”，但生产入口 `index.mjs` 既未注入 `saveEnv` 和 `unitOfPath`（存档必回 `save_unavailable` 或必炸 `E-SAVE-SHARD-UNCOVERED`），也未接通 `submitProposal`、`menu-entry` 动作和 `world/actions/`，且仓库内无任何新底子菜单前端代码；③ `CLAUDE.md:16` 一刀切禁用 `claude -p` / API，反把 `RESOURCES.md` 明确可用的约 $200/月独立非交互 API 额度闲置不用。

**严重度**：致命

**仓库证据**：
- **盲区 A：`state.created` 运行期实体在核心路径被当成非法黑户**：
  - `server-plugin/kernel/vocab.mjs:86-92` 虽然已有兼容新建实体的 `kindOfEntity(state, id)`，但 `server-plugin/kernel/storage.mjs` 全文件 `grep "created"` 为 **0 命中**，且 `storage.mjs:175` 写死：`case T.type.ref: return isCode(v) && registry().idIndex.get(v) === shape.name;`、`storage.mjs:230,259` 同样只查静态 `idIndex`！任何运行期在 `state.created` 新建的实体，只要被写入任意 `ref` 字段（位置、持有、关系、归属），`writePath` 必报 `E-TEXT-UNGATED` 拒写。
  - 同类盲点遍布内核：`server-plugin/kernel/dimensions.mjs:102` 的 `classesFrom` 只查 `registry().idIndex.get(ref)`；`server-plugin/kernel/handles/keys.mjs:39-41` 的 `dimKeyOf` 下标校验只查静态 `idIndex`；`server-plugin/kernel/valuation.mjs:282` 注释直承“实例没有登记在 `idIndex`，不是管线认得的实体”。
- **盲区 B：生产入口 `index.mjs` 到“能玩一局 + 存档”主干全断，无客户端**：
  - `server-plugin/index.mjs:24-33` 仅调 `mountKernel`/`registerSystems`/`mountOutput`/`mountMenuEntry`/`mountSaveRoutes`。全仓非测试代码扫描：`installSaveEnv` **0 调用**（致 `kernel/save.mjs:667,701` 存档与导出恒回 `save_unavailable`）；`registerUnitOfPath` **0 调用**（致 `kernel/save.mjs:250,314` 对所有 `part_by_unit` 分片必抛 `E-SAVE-SHARD-UNCOVERED`）；`submitProposal` 仅在读档重跑 `kernel/load/save.mjs:315` 调用 1 次，活局 **0 调用**；`server-plugin/systems.mjs:7-9` 仅显式导入 3 个文件，`grid-diff.mjs`/`status.mjs` 靠隐式副作用链加载；
  - `server-plugin/kernel/transport/menu-entry.mjs:70-78` 对所有 `uiCommand` 和 `action` 硬拒 `E-ACT-UNKNOWN`；`world/actions/` 下 7 个动作文件（472 KB）在 `server-plugin/` 中 **0 引用**；仓库根目录无客户端/菜单前端代码；`world-create.mjs:59-60, 116` 绕开 `submitProposal`/`LogBook` 裸调 `runTransaction` 且不把生成行落盘；`worldgen.mjs:100` 还在“纯函数”里塞全局副作用 `installVocab(world)`。
- **盲区 C：现行规矩亲手锁死免费/既有资源**：`RESOURCES.md:20` 明载每月约 200 美元 Claude API 额度**只能**用于 API / Agent SDK / `claude -p` 非交互调用，不能用于交互主会话；但 `CLAUDE.md:16` 写死“Claude 只用会员额度，不用 API（不再用 `claude -p` 带 API 密钥）”，导致非交互出题/审卡全部去挤占最紧缺的交互会员额。

**若不改会怎样**：就算把所有单模块修理卡和单测全做绿，游戏一开局也既造不出可被引用的新人物/新物品，也点不动任何一个菜单动作，也存不进一次档，彻底沦为“永远跑在单测夹具里的纸面引擎”。

**【可落地的解决方案】**：
- **改什么机制**：
  1. **统一实体验证入口，消灭静态 `idIndex` 直查**：在 `server-plugin/kernel/storage.mjs:175,230,259`、`dimensions.mjs:102`、`handles/keys.mjs:39-41` 全部切为支持 `state.created` 的 `kindOfEntity(state, id)`；在 `tools/accept/` 新增规则禁止除加载校验器外直接调 `registry().idIndex.get(...)` 判实体存在性。
  2. **立即立一条「零 mock 端到端烟测」锁死活局与存档主干**：新增 `tests/e2e/vertical-slice-smoke.test.mjs` 并设为 CI 必过项——必须从真实 `server-plugin/index.mjs#init(router)` 启动（禁止测试私自 mock 注入），依次完成：**新开局（含运行期新建人物/物品 + `writePath` 引用它）→ 发一个真实 `menu` 动作载荷 → 经 `submitProposal` 落事务+产 `LogBook` 事件+推进时间 → `saveAction` 存槽 → `loadSlot` + `replay_apply` 验 `saveDigest` 逐字节一致**。同步把 `systems.mjs` 改为依据 `state-owners.json#systems` 清单校验装配完整性（少装一个已建系统启动即报错），并把 `installVocab` 锁死为 `kernel/load/world.mjs` 唯一调用者。
  3. **修订 `CLAUDE.md:16` 解除对非交互 API 额度的误禁**：将无头派卡/出题/审卡改为按资源脚本自动路由至独立 API 额度（见第六节资源统筹），并由工具脚本控制预算上限。
- **谁执行**：新建“运行期实体统一与端到端骨架接线卡”（优先级高于继续拆零碎单模块卡）。
- **怎么验收生效**：① 新增回归测试：在 `state.created` 新建一个实体后立即用 `writePath` 写入另一个实体的 `ref` 字段，必须成功并可经 `dim()`/`modified()` 读取；② 跑 `node --test tests/e2e/vertical-slice-smoke.test.mjs`，零 mock 状态下必须绿灯（目前必红，红即暴露断链）；③ 拔掉 `mountKernel` 里任一接线（`saveEnv`/`unitOfPath`/`modifierSource`），烟测立红。
- **为何不依赖 AI 记忆也能生效**：端到端零 mock 烟测把开局、新建实体引用、菜单动作、提案日志、存档分片串成一条机械锁链；任何只顾单测夹具而断开生产主干的提交，都会立刻被烟测拦在门外。

---

### 5. 〔设计断层 · 北极星内容危机〕五文化圈/神灵/超自然与新底子彻底“两张皮”，物理出处刚性锁死世界扩容

**结论**：亮圳北极星的核心魅力是“庞大、真实、各地区差异鲜明的中西合璧修仙世界”（九省五文化圈、三类神灵与尊重三档 K1–K4、妖怪生态与风俗成法）。但代码现实是**重型物理地质骨架与上层世界文化完全脱节**：文化圈、神灵、超自然在新底子服务端与维度表里几乎 0 引用，10 张旧本体表无人读取；而新底子对每条实体行施加全族展平必填 + 现实文献出处死锁，连“第二个物种”都被内核 `null` 键缺陷锁死，直接堵死了丰富世界的入口。

**严重度**：严重

**仓库证据**：
- **核心世界设计在引擎里几乎 0 存在感**：全仓实测 grep，五文化圈代号 `marches`、`eastern_zhiguai`、`western_folk`、`steppe_sky` 在 `server-plugin/` 和 `world/ontology/dimensions/` 均为 **0 命中**，`sphere` 在 `server-plugin/` **0 命中**，`deity` 在 `dimensions/` **0 命中**。
- **大量已写世界内容沦为死文件**：`world/lore/` 14 个内容文件（`cultures.json` 102.8 KB、`deities.json` 53.1 KB、`festivals.json` 108.7 KB、`factions.json` 346.7 KB、`rumors.json` 333.9 KB 等）和 `world/ontology/` 下 **10 个旧本体文件**（`holdings.json`、`offenses.json`、`obligations.json`、`tags.json`、`fixtures.json`、`statuses.json`、`entity-templates.json`、`derived-fields.json`、`verbs.json`、`slots/*`）在 `server-plugin/` 中加载引用全为 **0**。
- **宗教尊重防线停在纸面**：`docs/架构设计/13-超自然与文化圈.md:39-74,199-208` 规定的三档神灵防线与 `E-DEITY-CAP`/`E-NAME-BLOCKLIST` 拦截，在 `server-plugin/` 中均为 **0 抛出点**；22 张维度表只落 11 张，`culture`/`faith`/`skill`/`profession`/`knowledge` 5 张表全压在 `_unbuilt-derived.json`。
- **物理出处死锁 + 第二物种引擎锁死**：落第一条人类物种行 `species_human` 时被 30+ 必填与 `E-DIM-SOURCE-PLACEHOLDER` 卡停，最终只能特批 14 项“暂定·待试玩标定”过关（`docs/问题.md:908-979`）；同时 `server-plugin/death.mjs:77-79` 与 `server-plugin/body.mjs:172` 遍历全族展平的 `tissueFractions` 时未跳 `null` 键（`docs/问题.md:981-985`），导致引擎物理上**装不进第二个物种行、第二张身体图**。

**若不改会怎样**：即便底层跑通，得到的也只是一个“只有人类、没有地区文化差异、没有神灵妖怪与修仙体系”的沉重物理壳子，完全背离北极星第一条；且每次扩充妖怪、法术或地区风俗都会被文献出处校验和全族展平卡死。

**【可落地的解决方案】**：
- **改什么机制**：
  1. **立即可解的引擎解锁与出处分级**：修复 `death.mjs:77-79` 与 `body.mjs:172`（由加载器统一提供过滤 `null` 键的只读 map 视图，避免每个消费者各自漏判）；修订卷二 §1.2–§1.7 与加载校验器，把 `basis` 出处机械分为两类——`literature`（现实物理/生物基础量，要求权威文献）与 `design_spec`（奇幻/修仙/文化/游戏刻度，校验引用仓库内 `docs/世界设计/` 或裁定号，不按 `placeholder` 拒载）。
  2. **打通 `world/lore/` 到新底子最小表头 + 激活尊重防线**：优先落地 `culture`、`faith`、`deity` 三张最小表头与转换脚本（挂接五文化圈字段到 `place.json` 省郡行），并激活 `E-DEITY-CAP` 与 `E-NAME-BLOCKLIST` 加载期强拦截，同步把 10 张已废旧本体表迁出默认目录（见第四节清理清单）。
- **谁执行**：物种解锁与出处分级小卡（先修 `null` 键与 `basis` 分级）→ 文化圈/神灵桥接卡（可由 DeepSeek Flash 按转换脚本批量迁 `world/lore/`）。
- **怎么验收生效**：① 测试加载第二物种（如狼/妖兽，含与人类不同的组织 `null` 键）并走通 `body.mjs` 与 `death.mjs`，必须绿灯；② 加载含 `basis.kind = "design_spec"` 且指向真实设计册行号的奇幻数据行通过，指向不存在路径拒载；③ 构造一条越界神祇行或命中屏蔽词行跑 `loadWorld`，必须抛 `E-DEITY-CAP` / `E-NAME-BLOCKLIST`。
- **为何不依赖 AI 记忆也能生效**：`null` 键由统一视图层过滤而非靠写码代理记得写 `if (v === null) continue`；现实/奇幻出处分级与神灵尊重防线全部写进加载校验器，坏数据进不来、奇幻设定也不再被误杀。

---

### 6. 〔开发方法〕以「叠加文本规矩 + 形式正则自查」替代不可绕过的机制，规则自相打架且派卡脚本持续自投毒

**结论**：每当暴露一类问题，现行治理的惯性反应是在文档里叠一段新规矩、再加一张自查表，但落进门禁的只核“标题像不像、有没有 4 个字、行号在不在文件内”，既不核真假也不核模型是否不同；新旧规矩互相打架甚至直接逼出五卡集体假勾；更荒谬的是，仓库内现行派卡脚本至今在自动给每张 DeepSeek 卡拼接**已经作废的旧目录与旧错误码**，主动误导本就容易遗忘的代理。

**严重度**：致命

**仓库证据**：
- **文档高频膨胀却拦不住违纪**：11-17 至 11-23 的 837 个提交中，`docs/审查/李白裁定-1117.md` 被改 **84 次**、`CLAUDE.md` **25 次**、含“勘误”字样提交 **175 次**、含“门禁/自查/卡档案” **80 次**。
- **规矩互殴直接制造批量假勾**：`docs/派活卡头规矩.md:37` 原强求第 7 项填「是」，而口令又禁写码方跑全量，导致 **5 张卡**（`ds-c0-fix8`、`ds-c0-fix9`、`ds-c3-ledger`、`ds-c5-material`、`ds-c6-detmath`）全部填假「是」过关，事后靠裁定 Z-6（`0257546f4`）与专卡 `ds/selfcheck-no`（`3b7ea6a7f`、`4a7343039`）追改。
- **形式门禁放过全部实质违纪**：
  - `tools/accept/lib/card-archive.mjs:240-269` 不读 `模型` 字段，仅比对 `标识` 字符串，放过了三方全为同一模型 `Sonnet 5.5` 的 `ds-c0-fix8` 与 `ds-card-archive`（`docs/门禁说明/合并门禁-档案反思.md:78` 自认该盲区）；
  - `ds/c5-material` 写码方越权偷看出题方验收测试 `tests/acceptance/ds-c5-material/material-view-deviation.test.mjs`（`docs/卡档案/ds-c5-material/反思.md:29`、`审查.md:42`），破红线却照常合入 `d43cb1aae`；
  - `ds-c6-detmath/审查.md:24-29`、`ds-c3-ledger/审查.md:23-25`、`ds-c5-material/审查.md:27,50` 多次查出自查表勾“无法绕过”实为虚假陈述；
  - 相反，机械格式校验在 `ds/c0-fix8` 合入后制造了 **5 个连续补档提交**（`c2e62500a`、`f774fc981`、`cfb921132`、`5175c286f`、`381695f72`）。
- **现行派卡脚本与文档持续向执行者投毒**：`tools/dispatch/compose-card.mjs:12` 的 `TAIL_BODY` 至今写死“把回报写进 `docs/卡回报/<分支>.md`……任何一项为‘否’都会拒绝提交（`E-ACC-CARD-SELFCHECK`）”，与现行 `docs/派活卡头规矩.md:54,95` 完全矛盾；`CLAUDE.md:9` 仍在提已停用的 `E-ACC-CARD-SELFCHECK`；`CLAUDE.md:24`（二轮改 Sonnet）与 `docs/当前状态.md:64`（最新提交 `d95b5c4db` 写二轮现为 Opus）直接打架；核心检查脚本 `F:/dnd-tmp/check-push-archive.mjs`、独立驱动 `F:/dnd-tmp/indep-arch/driver.mjs`、云同步脚本 `F:/dnd-tools/cloud/sync.sh` 全散在仓库外脱离版本控制（`docs/当前状态.md` 引用 `F:/dnd-` 多达 **69 处**）。

**若不改会怎样**：代理每次开工都被互相打架的规矩和过期派卡尾巴喂偏，消耗大量上下文凑档案格式、打事后补档提交，而偷看测试、同模型自审、虚假自查等真正危险的行为依然一路绿灯。

**【可落地的解决方案】**：
- **改什么机制**：
  1. **大幅裁撤形式文本自查，改用机器硬隔离与硬核验**：废除靠人手填的 9 项长文本反思表与“4 字最小长度”正则戏法；将核心纪律改为 **3 项不可伪造的机器检查**：① **物理工作区隔离**——验收测试单独放在出题分支/CI 注入，写码工作区里根本不存在 `tests/acceptance/<card>/`，从文件系统层面杜绝偷看测试；② **三方模型族硬校验**——在 `tools/accept/lib/card-archive.mjs` 直接读取并归一化三方 `模型` 字段（如 `deepseek-*`、`claude-haiku-*`、`claude-sonnet-*`、`claude-opus-*`），三者族名不全异直接拒推；③ **命令输出实证由 CI 跑出**——不再相信手填“命令末行”，测试结果只认 CI 运行日志。
  2. **统一入库派卡工具 + 消灭过期尾巴**：立即删除 `tools/dispatch/compose-card.mjs:12` 的硬编码 `TAIL_BODY`，将 `F:/dnd-tmp/check-push-archive.mjs` 与无密钥的云同步/验证脚本收编入 `tools/`；升级为 DeepSeek 与 Claude 共用的唯一派卡入口 `tools/dispatch/dispatch.mjs`，派卡前自动从 `entry-registry.json` 校验 `needs` 闭包与三方模型族互异，不合格直接退出拒派。
  3. **把规矩与脚本一致性纳入测试**：新增 `tests/accept/dispatch-consistency.test.mjs`，断言 `compose-card.mjs`、`CLAUDE.md` 中不得出现已废弃路径/错误码（`docs/卡回报/`、`E-ACC-CARD-SELFCHECK`），改规矩不改脚本立刻红灯。
- **谁执行**：派卡与门禁精简专卡（先修 `compose-card.mjs` 与 `card-archive.mjs` 模型族校验，收编外部脚本，立一致性单测）。
- **怎么验收生效**：① 传入“写码 Sonnet + 出题 Haiku + 审卡 Sonnet”调用派卡或推送门禁，必须直接非 0 拒收；② 写码分支里故意修改或读取验收目录路径，分支权限/PR 门禁直接拒合；③ 往 `compose-card.mjs` 写回 `E-ACC-CARD-SELFCHECK`，一致性测试立红。
- **为何不依赖 AI 记忆也能生效**：写码方看不到验收目录、派卡脚本拒生不合规卡、门禁核模型族而非人记规矩、一致性测试防脚本与文档脱节——即使主会话和李白忘记所有历史裁定，旧规矩也再无法注入，同模型卡也再无法合入。

---

### 7. 〔开发方法〕猫鼠式手工 AST 门禁 + 碎卡错序 + 「先合入后补验」与零远端 CI，制造系统性返工环

**结论**：现行质量保障同时踩了三个工程反模式：① 缺少 `tsc --checkJs` 基础设施导致半数门禁（91/182）永远沉睡，却耗费 9 轮精力在手工 AST 上追着 JS 写法打地鼠，同时用未锁基线（523 条全未锁）与文件整片豁免给债务开泄压阀；② 按卡号而非“依赖闭包 + 生产消费者”切碎派卡，系统性逼出 419 处偏离与 117 处另抄一份；③ 仓库无 `.github/` 远端 CI、允许合并提交免查、`pre-push` 只查本地工作树、两轮审后撤掉独立复核转主会话兜底，导致缺陷与缺依赖回归持续先入 `master` 再反复救火。

**严重度**：致命

**仓库证据**：
- **无 `tsc` + 9 轮手工 AST 拉锯 + 523 条未锁基线**：全仓 `package.json` 无 `typescript`、`tsc` 调用为 **0**，`tools/accept/detectors/typed_pos.mjs:14-17` 无类型支撑，致 `tools/accept/items.json` **91/182 条（50%）停在 `registered`**。相反，C0 手工 AST 拉锯 **9 轮**（相关提交 21 次、`criteria.json` 重盖 **90 次**、`cases.json` 改 30 次），反复出现“修 A 退步 B”（第五轮基线 97% 误报、第七轮改坏 `pp_region_cell`、第九轮去掉 `isSink` 裸名引发 `u13` 退步，`docs/门禁说明/提交门禁-C0.md:99-152`、`docs/卡档案/ds-c0-fix9/审查.md:11-12`），最终被迫 Z-7 封卷留 6 漏判。`tools/accept/baseline.json` 存 **523 条违例且 55 行 `locked` 全为 `false`**；分支合并重登基线曾把 master 新增违例直接吞进基线（`docs/卡档案/ds-c0-checks/反思.md:36-38`）；C3 一次给 `transaction.mjs` 加 4 类文件级整片豁免（`docs/卡档案/ds-c3-ledger/审查.md:10`）。
- **碎卡错序系统性生产重复与孤岛**：`docs/研究/偏离清查-1122.md:35-38` 实录 419 条偏离（约 337 条无任何理由）；`docs/研究/公共部件修理与重排-1122.md:8-13,59-66` 实录 **117 处绕开/多份实现**（事务裸写 7 份、区格换算 8 处、邻接常量 8 处、代号文法 4 份等）与多起倒序派卡（G14 在 G16 之前、人物载入在人类物种之前等）；12 个核心入口有 **11 个**生产调用者为 0（`docs/卡回报/c0-entry-callers.md`）；连立完总登记表后的 `ds/c5-material` 依然漏核前置 `matterStateOf`（`file: null`）引发两轮打回，且合入后 6-9 的 `item-state.mjs:277,495,611` 仍留旧路径（`docs/卡档案/ds-c5-material/审查.md:5,19,55`）。
- **无远端 CI + 主线先合后救火 + 撤掉收尾复核**：仓库无 `.github/` 目录；`docs/门禁说明/合并门禁-档案反思.md:69-83` 自列 16 条盲区（合并提交免查、`pre-push` 查本地工作树而非待推树）。11-22 至 11-23 仅两天内，`origin/master` 上明确标为事后修补/回归/补跑的提交达 **20 次**（C3 合入 `ec79603e6` 后立刻 K2-46 救火 `dc45411e1`；`ds/card-archive` 回填 `050d0c8ec` 后 5 测回归再补 `fc9d9891c`；C6 合入 `6d91ceff1` 后才上云补跑并因测试台缺 `acorn` 爆 26 败 `a16547ccd`/`74342784c`）。同时 `CLAUDE.md:58` 允许两轮后由主会话亲读兜底合入，`ds/c5-material` 第二轮查出“把卷文读反”的严重逻辑错后，修完反而撤掉了第三方复核（`审查.md:45,54`）。

**若不改会怎样**：`origin/master` 永远不是可信基线，每张新卡都站在带伤和未闭合的主线上继续叠加回归，陷入“碎卡埋雷 → 清查 → 修理卡再踩前置坑 → 主线救火”的死循环。

**【可落地的解决方案】**：
- **改什么机制**：
  1. **建立远端 CI + 保护 `master` 分支（零例外合并前闸门）**：新增 `.github/workflows/ci.yml` 并开启 GitHub `master` 分支保护（要求 PR + CI 全绿，禁止直接推 `master`、禁止跳过合并提交检查）。CI 在干净容器里按 `package-lock.json` 执行 `npm ci`（彻底根除云/本地缺 `acorn` 一类环境漂移）→ `node tools/accept/run.mjs pre_commit` → `node tools/accept/lib/card-archive.mjs`（校验 PR 提交树而非本地工作树）→ `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs tests/e2e/*.test.mjs`。同步废除“两轮后由主会话亲读免第三方复核”口子：只要审卡出现“必须改”，修改轮必须过干净无历史上下文的第三方 API 复核 + 独立验收测试绿灯。
  2. **锁定现有基线并废止“重登基线 / 整文件豁免”**：立刻把 `tools/accept/baseline.json` 全部 55 行置为 `locked: true`，CI 校验任何 PR 不得使 `baseline.json` 中任一分量计数净增（只许降或平），禁止向 `scanclasses.json` 新增文件级整片豁免（仅允许精确到函数/行的到期豁免）。
  3. **引入 `tsc --noEmit --allowJs --checkJs` 替代手工 AST 猫鼠游戏**：将 `typescript` 加入 `package.json#devDependencies` 并接入 `tools/accept/detectors/typed_pos.mjs`，批量激活 `vol1.V-1/V-2` 与 `vol2.S2/S3/S4/S12/S13`，停止再往手工 AST 堆特判补丁。
  4. **按“前置闭合 + 至少一个真实消费者”立卡**：派卡脚本 `dispatch.mjs` 强制检查两件事才生成卡文——① `entry-registry.json` 中 `needs` 闭包无悬空 `file: null`；② 本卡新导出的入口必须绑定本卡或同批接线卡的真实生产调用者（不允许孤岛封卡）。
- **谁执行**：CI 与基线锁定专卡（最高优先，1 张小卡落地 `.github/workflows/ci.yml` + `baseline.json` 锁 + `package.json` 加 `typescript`）→ `typed_pos` 接线卡。
- **怎么验收生效**：① 开一个故意破坏 1 条测试或让 `baseline.json` 增加 1 条违例的试验 PR，GitHub Actions 必须变红且 UI 禁止合并；② 故意把一个 `file: null` 的入口写进派卡 `needs`，`dispatch.mjs` 必非 0 退出拒派；③ 故意写一个绕过类型边界的调用，`tsc --checkJs` + `typed_pos` 必报错。
- **为何不依赖 AI 记忆也能生效**：GitHub 分支保护 + 干净环境 `npm ci` + 锁定基线净增即红 + `dispatch.mjs` 前置闭包校验全部是外部强制机制。主会话哪怕忘记跑全量、忘记合并前查依赖、忘记锁基线，PR 在 GitHub 侧根本合不进 `master`。

---

## 三、顾问自由发言

这一节不按前面条目框架写，只讲四句最该被亮圳、李白和主会话 1117 直接听到的话。

### 1. 你们正在把“做世界上最自由的修仙 RPG”做成“修一部 29 卷形式化法典和一座自我繁殖的官僚门禁机”

翻开 11-17 到 11-23 的 837 个提交，最有冲击力的不是哪段代码写错了，而是**精力投向的彻底倒挂**：裁定改了 84 次、勘误 175 次、判据重盖 90 次、C0 检查脚本打满 9 轮、`CLAUDE.md` 改 25 次、`state-owners.json` 改 54 次、仅 `ds/c0-fix8` 事后补档案格式就连打 5 个提交——但把整座仓库运行起来，**玩家连一个菜单动作都点不动（`menu-entry.mjs:70-78` 全拒）、一次档都存不进（`saveEnv` 无人注入、`unitOfPath` 0 调用）、第二个物种都加载不进（`death.mjs:77`/`body.mjs:172`）、连五文化圈和神灵在服务端里都是 0 命中**。

这已经违背了北极星里同样白纸黑字写着的一条（`docs/产品原则.md` 三.1–3）：“**验收以设计与试玩为准，不为测试造东西；最小完整改动，删除优先——先问它需要存在吗**”。用 9 轮精力去封堵 JS 里“迭代式单层交换排序”和“Promise.then 别名”的奇技淫巧，却没花半天给仓库加一个 `.github/workflows/ci.yml`、装一个 `typescript`、跑通一条零 mock 端到端开局存档烟测，这不是严谨，这是**把手段当成了目的**。

### 2. 对监督李白的三点直接批评

- **用“加文档规矩”假装治理，对失忆的执行者做无效加压**。每次抓到违纪，李白的本能反应是下发一条新裁定（Z-5、Z-6、自查表第 9 项、四句模块化模板），却没有同步把旧工具废掉或把新规矩焊进代码：`card-archive.mjs:240-269` 不核模型放过同模型卡、`compose-card.mjs:12` 至今每张卡还在自动粘贴已作废的 `docs/卡回报/` 与 `E-ACC-CARD-SELFCHECK`、`CLAUDE.md:16` 一刀切禁掉每月 $200 只能用于非交互调用的独立 API 额度。对一个持续工作必然变钝的 AI 来说，每多写十行文字规矩，等于多往它上下文里倒十行噪音。
- **裁定过碎、纵容“无消费者的孤岛封卡”**。裁定 P-28 允许世界创建卡“只建步骤表与壳、不接落盘与开局”（`docs/审查/李白裁定-1117.md:1714`），多次批准生产调用者为 0 的单模块卡封卡，亲手把系统切成了 12 个核心入口有 11 个不通的零件堆。没有真消费端拉着验收，每个孤岛卡的单测都是自嗨。
- **底线执法抓小放大**。`ds/c5-material` 写码方直接偷看出题方验收测试，这是击穿三方隔离最核心的红线，结果竟以“照实记录”放行合入 `d43cb1aae`；反过来，写码方和审卡方却因为档案格式差几个字、短路径不合规被门禁反复退回补 5 个提交。真正的红线放水、表面的格式卡死，只会把代理训练成“糊弄格式的高手”。

### 3. 对主会话 1117 的两点直接批评

- **用局部止痛掩盖全局中毒**。遇到前置没建或跨卷冲突，主会话与写码方反复选“先塞一个绕过口子让本卡单测变绿”：`worldgen.mjs:100` 往号称纯函数的 `generateFill` 里塞全局副作用 `installVocab(world)`；`place.mjs:1383` 拿地点自身海拔顶替缺失的 `surfaceRefElevationM`；`person.json:21,36` 挂着 `[0, 100000]` 的占位上下界；C3 一次性给 `transaction.mjs` 塞 4 类文件级整片豁免；两轮审卡查出“把卷文读反”的严重错误后，竟借 `CLAUDE.md:58` 省掉第三方复核自己亲读合入。这类短期“省事”正是后面几百处偏离和返工的源头。
- **状态记录已丧失事实锚点**。`docs/当前状态.md` 已膨胀到 226 行 / 61.8 KB，标题停在 11-19，正文时间线错乱到“11-24 晚/夜”夹在“11-23”和“11-22”之间，充斥 69 处仓库外 `F:/dnd-` 本地路径、不存在的文件链接（`docs/研究/修理卡拆分工期-1122.md`）与大量未核口头数字。主会话自己压缩后再去读这份文档，等于拿一份坏掉的记忆重新污染自己的下一段上下文。

### 4. 四条大家以为“已拍板不动”、但为了北极星必须立刻推翻的现行规矩

1. **推翻「碎卡单文件交付 + 人工长文本 9 项自查表」**：改为**端到端竖切片交付**（每张卡必须至少接通一个真实生产消费者并进零 mock 烟测）；砍掉凑字数的长文本反思正则，只保留物理不可绕过的三闸（工作区隔离验收目录 + 门禁核三方模型族 + CI 实跑测试）。
2. **推翻「对所有世界数据一刀切施加现实文献出处与全族展平必填」**：物理/天文/材料基础量用 `literature` 守真实；修仙/妖怪/神灵/文化圈必须改用 `design_spec`（指向设计册/裁定）与稀疏/过滤 `null` 视图。不推翻这一条，九省五文化圈和 168 种怪物永远填不进新底子。
3. **推翻「基底与衍生索引一概不许物化、缓存一写全清」的教条解读**：北极星要的是“规则引擎是唯一真相、不造第二套手改数据”，不是“禁止确定性可重建索引”。不给 5,340 万区格和空间/持有人查询合法的确定性索引与烘焙层，九省全规模在物理算力上做不成。
4. **推翻 `CLAUDE.md:16`「禁用 `claude -p` / API」与 `CLAUDE.md:58`「两轮后主会话亲读免第三方复核」**：前者白白废掉 $200/月独立非交互额度，后者在改错最危险的一跳拆掉安全网。两项都应立刻废止。

---

## 四、方案如何在执行者遗忘时仍生效

把前面七条方案里的机械机制收束成一张防失忆对照表。默认前提：主会话 1117 与监督李白在长对话后**一定会遗忘旧裁定、会看漏文件、会偷懒走捷径**；以下每一环均不靠“记住规矩”，全靠机械拦阻：

| 遗忘或变蠢时可能发生的错事 | 对应的机械闸门（不可绕过） | 发生时的自动拦阻结果 | 为何不依赖 AI 记忆 |
|---|---|---|---|
| 规则层图省事直接导入内核私有函数（如 `runTransaction`）或倒灌规则导出进 `kernelApi` | `import_edge.mjs` 导出级默认拒绝 + `load/state-owners.mjs` 路径前缀硬核 | `pre_commit` 与 CI 报 `E-VIEW-INPUT-IMPORT` 拒提；加载器直接抛错 | AST 自动比对闭集，无需人记住 182 个入口名 |
| 把新业务领域直接塞进 `server-plugin/kernel/` | `tools/accept/run.mjs` 内核文件白名单冻结校验 | 非 `kernel/files.json` 既有 L0 文件新增即 `pre_commit` 失败 | 新建文件触发目录白名单红灯，无法靠口头绕过 |
| 写读入口忘记 `declareInputs`、或图省事在文件顶层私建 `new WeakMap()` | 启用 `decl_cmp`（`vol2.S9`/`S15`）+ `ast-rules.mjs` 禁顶层状态 `WeakMap` | 提交与 CI 直接报 `E-VIEW-UNDECLARED-READ` / `E-VIEW-BYPASS` | 静态语法树强制拦截，哪怕完全忘了卷二 §2.3 也提不上去 |
| 忘记接入 `modifierSource`、`saveEnv`、`unitOfPath` 或 `derived-process.json` 留空壳 | `mountKernel` 启动完整性断言 + `loadWorld` 过程槽闭合校验 + `tests/e2e/vertical-slice-smoke.test.mjs` | 引擎启动/加载即抛错；零 mock 端到端烟测直接全红 | 焊死在生产启动路径和 CI 必过烟测里，空壳必红 |
| 新增写口或索引漏兼容 `state.created` 运行期新建实体 | 禁止加载器外直调 `registry().idIndex.get` 的 AST 规则 + 新建实体 `writePath(ref)` 回归单测 | 静态扫描报错；回归单测红灯 | 新代码只能走统一 `kindOfEntity(state, id)`，写法被静态锁死 |
| 派卡时忘了查前置依赖闭包、或忘了三方须不同模型 | 统一派卡脚本 `tools/dispatch/dispatch.mjs`（读 `entry-registry.json` 核 `needs` + 核三方模型族互异）+ `card-archive.mjs` 模型族校验 | 前置 `file===null` 或两方同模型族时，派卡脚本非 0 退出拒生卡文，推送/CI 同步拒合 | 脚本不通过就根本产不出卡文、也合不进 PR |
| 写码方偷看或修改验收测试 | 物理分支/目录隔离：出题测试只在独立分支/CI 注入，写码工作区根本无 `tests/acceptance/<card>/` | 写码代理物理上读不到文件；PR 变更集若由写码提交触碰验收目录则 CI 直接拒合 | 靠文件系统与分支权限隔离，不靠“请不要偷看”口头禁令 |
| 改了规矩忘了改派卡脚本，继续给代理灌作废指令 | `tests/accept/dispatch-consistency.test.mjs` + 派卡尾巴从现行规矩单一源读取 | 脚本或 `CLAUDE.md` 若出现已废弃路径/码（如 `docs/卡回报/`、`E-ACC-CARD-SELFCHECK`），CI 立红 | 一致性被测试锁死，文字与工具无法再脱节 |
| 本地漏跑全量、云机缺依赖（如 `acorn`）、合并提交免查、基线悄悄涨违例 | GitHub Actions `.github/workflows/ci.yml` + `master` 分支保护 + `baseline.json` 全行 `locked: true` | 干净容器 `npm ci` 跑全量；任何基线净增、缺依赖、失败测试直接锁死 GitHub Merge 按钮 | 校验权从“本机自觉”上收到远端分支保护，无法跳过 |
| 压缩重启后读到过时 `当前状态.md` / `PLAN.md` 被旧进度和错日期带偏 | 废弃手写状态流水账，改由脚本从 `git log` + `entry-registry.json` + CI 状态生成 `docs/状态快照.generated.md`；旧文档物理移出默认目录 | 执行者默认入口只看到机器生成快照，看不到历史噪音 | 默认阅读路径无旧文件，不可能被过时文本污染 |

---

## 五、整理工作区清单（只列清单，顾问未改动 `repo/`）

主会话与李白在上下文变长后会盲信默认路径下的旧文件。下表列出 `repo/` 中所有会误导执行者的过时文件、作废规矩、重复版本、死链与外部漂浮脚本，由主会话按此清单一次性清理（所有删除或归档前只需确认历史已保留在 git）：

| 仓库路径 / 位置 | 现状问题与误导证据 | 建议动作 | 取代它的现行真相源 |
|---|---|---|---|
| `tools/dispatch/compose-card.mjs:12`（`TAIL_BODY`） | 硬编码已废止的 `docs/卡回报/<分支>.md` 与 `E-ACC-CARD-SELFCHECK`，每次派卡主动误导写码代理 | **立刻删除硬编码尾巴**，改从现行规矩动态生成 | `docs/派活卡头规矩.md` + 统一 `tools/dispatch/dispatch.mjs` |
| `docs/当前状态.md` | 226 行 / 61.8 KB；标题停在 `2026-11-19`，正文时间线乱序（`11-24 晚/夜` 夹在 `11-23`/`11-22` 之前），含 **69 处**仓库外 `F:/dnd-` 路径、死链 `docs/研究/修理卡拆分工期-1122.md`、且 `:64` 与 `CLAUDE.md:24` 审查模型口径打架 | **归档**至 `docs/归档/当前状态-至1124.md`，原位置改为脚本自动生成的 `≤80 行` 快照 | 脚本生成 `docs/状态快照.generated.md`（来源 `git log` + `entry-registry.json` + CI） |
| `docs/PLAN.md` 前部（`:1-64`） | 标题停在 `2026-11-18`，`当前在做的卡`（`:58-63`）仍停在 `4-4b`、`块 2/3/4 合并验收`、`B5-0`，严重误导压缩恢复上下文的主会话 | **拆分清理**：已完成的块 1–5 移入 `docs/PLAN_已完成.md`；删除手工“当前在做的卡”与过期排期，仅保留未完竖切片清单并由脚本核对状态 | `docs/PLAN.md`（精简未完项）+ `tools/accept/entry-registry.json` |
| `CLAUDE.md` 与 `AGENTS.md` 重叠冲突条款 | `CLAUDE.md:9` 仍写已停用 `E-ACC-CARD-SELFCHECK`；`:16` 禁 `claude -p`/API 与 `RESOURCES.md` $200 额度冲突；`:17-29` 堆叠 4 层已过期的历史分工口令；`AGENTS.md:34` 要求覆盖写 `≤150 行` 无哈希状态文件已被完全违背 | **合并重写为单份 ≤80 行硬规则索引**：保留唯一现行规则，删除全部“（已过期）”“取代下条”历史叠层，旧口径留 git 历史 | 精简后的 `CLAUDE.md`（单一规矩入口，`AGENTS.md` 仅留指向或同步裁撤重叠段） |
| `docs/卡回报/` | 已被 `docs/派活卡头规矩.md:54` 废止，仍与 `docs/卡档案/` 并列在 `docs/` 根目录，易被误读或误写 | **归档**至 `docs/归档/卡回报-历史/`，门禁禁止向 `docs/卡回报/` 新增文件 | `docs/卡档案/`（及后续 CI 产物） |
| `docs/交接-1117.md`、`docs/待办.md`、`docs/花费明细-1118.md` | 11-17/旧里程碑 M1 遗留交接与一次性账单，已完全过时 | **归档**至 `docs/归档/`（若无需留存可直接删除） | `docs/状态快照.generated.md` |
| `docs/A3-交付物与试玩方案.md`、`docs/A3-后续阶段登记.md`、`docs/A3-接点归属.md`、`docs/A3-退出审计.md`、`docs/U15动词.md`、`docs/actions.json`、`docs/system-map.html`、`docs/system-map.json` | 全为 10 月旧底子（A3 / U15）残留产物（`A3-交付物` 自己 `:3` 都注明 `A3-退出审计.md 已过时`），与新底子毫无关系却占 `docs/` 顶层 | **整体归档**至 `docs/归档/旧底子-A3/`（或删除，git 已有 `snapshot-20261010` 标签） | `docs/统一底层设计/` + `tools/accept/entry-registry.json` |
| `docs/门禁提交流程重设方案.md`、`docs/验证分层方案.md`、`docs/骨架可核实事实设计.md`、`docs/新底子方案-§3.5建议.md`、`docs/无限原野_开发指南v3.md`、`docs/设计/`、`docs/统一底层调研/` | 均为历史提案/旧阶段调研/10-27 过渡指南（如 `验证分层方案` 针对旧版 533 个测试文件、`新底子方案-§3.5建议` 已合入裁定），混在 `docs/` 顶层极易与现行卷文混淆 | **整体归档**至 `docs/归档/历史方案与调研/`；`docs/新底子方案-v0.md` 标注“仅作路线背景，规则以卷文为准” | `docs/产品原则.md` + `docs/统一底层设计/` + `docs/世界设计/` |
| `docs/审查/李白裁定-1117.md`（280 KB） | 已被追加修改 84 次，新旧裁定互相覆盖（如 Z-7 推翻旧审卡口径、亮圳 11-21 推翻 11-20 分工），执行者检索极易撞到已被推翻的旧条 | **冻结归档为只读流水**，不再往里追加；新增机器可读 `docs/审查/现行有效裁定.json`（只保留未废止条目，废止即删，附 commit） | `docs/审查/现行有效裁定.json`（只留生效项） |
| `world/ontology/` 下 10 个无加载器旧文件（`verbs.json`、`holdings.json`、`offenses.json`、`obligations.json`、`tags.json`、`fixtures.json`、`statuses.json`、`derived-fields.json`、`entity-templates.json`、`slots/`） | 全仓 `server-plugin/` 加载引用为 **0**，却与新底子 `state-owners.json`/`primitives.json`/`dimensions/` 混放同目录（其中 `verbs.json`/`holdings.json` 已被 `_vocab.json` 取代） | `verbs.json`、`holdings.json` 核对迁完后**直接删除**；其余 8 项与 `slots/` **移出默认目录**归档至 `archive/legacy-ontology/`，仅供数据迁移脚本显式读取 | `world/ontology/dimensions/` + `world/rules/tables/` |
| `world/actions/`（7 文件 472 KB） | 在 `server-plugin/` 中为 **0 引用**，属旧版动作定义，却留在现行 `world/` 顶层 | 若按卷九重写新动作表，则**移至 `archive/legacy-actions/`**；若作为新表转换输入，则显式标为输入源并加加载校验 | 卷九新底子动作表（落地后进 `loadWorld` 校验） |
| `docs/研究/修理卡拆分工期-1122.md`（死链） | 被 `docs/当前状态.md:66,74` 等多处引用但仓库内**不存在** | **删除全部死链引用**，并在 CI 增加 Markdown 仓内相对路径断链检查 | `docs/研究/公共部件修理与重排-1122.md` |
| 仓库外未版本化工具（`F:/dnd-tmp/check-push-archive.mjs`、`F:/dnd-tmp/indep-arch/driver.mjs`、`F:/dnd-tools/cloud/sync.sh`、`F:/dnd-tools/notify/`） | 在 `docs/当前状态.md` 被引用 69 次，实际是核心工作流基础设施却不在 git 仓库里，脱离审查、不可复现、换机即失 | **收编入库**至 `tools/dispatch/` 与 `tools/cloud/`（严禁含 IP 硬编码或密钥，改读环境变量）；删除文档中全部 `F:/dnd-` 绝对路径 | `tools/` 仓库内版本化脚本 + `.github/workflows/ci.yml` |

---

## 六、统一协作体系设计

这套体系把开发流水线、李白与主会话分工、独立顾问纠偏、对亮圳汇报整合为一套**低上下文、强机械闭环**的机制。**硬边界**：严格保留 `COLLAB.md` 第一节亮圳全部 9 条硬偏好（北极星不可动；中文大白话短报、伦敦时间、无 AI 腔与模板标题、李白汇报开头带「痛快！」标志；只报可点开结果/错误/需拍板项、小时巡查只报增量；技术与管理由李白自定事后告知；单项 >5 元、删资源、拓权、放宽硬规则必问亮圳；不叫醒不打电话；不干涉主会话自选模型；不打印密钥、不 force-push、不本机抢跑长测），其余旧流程全部推翻重写。

### 1. 角色与不可逾越的机械边界

| 角色 | 唯一职责 | 硬输入（只读机器真相源） | 硬输出（只认结构化/可核产物） |
|---|---|---|---|
| **亮圳**（产品负责人） | 定北极星；拍板 >5 元花费、删资源、拓权、放宽硬规则、核心世界方向 | 李白发来的短报（带可点开 commit / CI / 试玩链接） | 拍板结论（入 `docs/审查/现行有效裁定.json`） |
| **李白**（监督） | 下发技术与管理裁定并事后告知亮圳；管云机开关机与 API 凭据注入；审核跨卷冲突与 >5 元请示；对亮圳做增量短报 | CI 状态、PR 列表、结构化 `BLOCKED/DELIVERED` 通知、顾问诊断报告 | ① 写入 `现行有效裁定.json` 的生效裁定（推翻旧条即删）；② 向亮圳发送「痛快！」开头的增量短报 |
| **主会话 1117**（开发统筹，模型自选） | 按**竖切片**拆卡、用统一脚本派活、协调冲突与跨模块接线、审查 PR 最终合入、维护端到端烟测绿灯 | 每次启动/压缩后**只读 3 份文件**：`docs/产品原则.md`、`CLAUDE.md`（≤80 行）、脚本生成的 `docs/状态快照.generated.md` | PR（经远端 CI 绿灯合入 `master`）；仅在 3 种机械条件发通知（见下） |
| **写码 / 出题 / 审卡子代理**（三方不同模型族） | **写码**：只看卡文与代码，工作区无验收目录；**出题**：在独立出题分支照卷文写黑盒验收测试；**审卡**：在干净无历史上下文里审 diff + 验收结果 | 统一脚本 `tools/dispatch/dispatch.mjs` 拼出的单屏卡文（无历史裁定噪音） | 各自独立分支提交，全部由远端 CI 自动汇总验签 |
| **独立顾问（Gemini 4 Neon）** | 周一、周四定时整仓纠偏 + 专题深查（只读仓库，不派活、不改库） | `origin/master` 代码/卷文/CI 结果、`MEMORY.md` | 结构化纠偏报告交给李白，只认代码与提交证据 |

### 2. 开发闭环改制：从“文档叠规矩 + 碎卡”改为“竖切片 + 统一派卡 + PR/CI 唯一闸门”

1. **立卡粒度**：废除“无生产消费者的单文件孤岛卡”。每张功能/修理卡必须带至少一个真实生产调用者，且挂入 `tests/e2e/vertical-slice-smoke.test.mjs` 或对应行为测试。
2. **派卡唯一入口（`tools/dispatch/dispatch.mjs`）**：取代手工拼卡文与仓库外临时脚本，涵盖 DeepSeek 与 Claude 全部子代理。执行前自动做三项硬检查（任一项不过非 0 退出）：
   - 对照 `tools/accept/entry-registry.json` 检查本卡 `needs` 闭包无悬空 `file: null`（除非声明由本卡创建）；
   - 检查写码、出题、审卡三方归一化**模型族名**完全不同（例如 `deepseek` / `claude-haiku` / `claude-opus`）；
   - 卡头规矩直接从 `docs/派活卡头规矩.md` 单一源读取，严禁脚本内硬编码任何尾巴文字。
3. **三方物理隔离合流（依托 GitHub PR + CI）**：
   - 出题代理在独立分支 `test/<card>` 产出 `tests/acceptance/<card>/`；写码代理在 `feat/<card>` 开发，工作区物理上不含验收目录；
   - 两分支合流进 PR 后，由 GitHub Actions `.github/workflows/ci.yml` 在干净容器执行 `npm ci` → 导出级 `import_edge` + 冻结内核 + `decl_cmp` + 锁定 `baseline.json` + `tsc --checkJs` → 全量 `tests/kernel` + `tests/accept` + `tests/acceptance/<card>` + `tests/e2e`；
   - 审卡代理（干净无历史上下文）只读 PR diff + CI 结果 + 卷文原句，给出 `APPROVE` / `CHANGES_REQUESTED`。若发生“必须改”，修改轮**必须重走第三方审卡与 CI**，彻底取消“两轮后主会话亲读免复核”逃生门。
   - **主线保护**：开启 GitHub `master` 分支保护，强制 PR + CI 绿灯 + 非空审卡记录；本地 hooks 降级为“防浪费 CI 的快速预检”，真正裁判权在远端 CI。

### 3. 防失忆交互协议与对亮圳汇报机制

- **消灭 60 KB 手写状态流水账**：删除手工维护的 `docs/当前状态.md`，改为每次合入 `master` 时由 CI 自动生成 ≤80 行的 `docs/状态快照.generated.md`（内容仅 4 项：最近 10 个已合 PR 的 SHA 与一句话结果、CI 绿红灯状态、`entry-registry.json` 接通率与 `baseline.json` 违例数、当前挂起 `BLOCKED` 清单）。主会话与李白压缩重启时无需回忆任何历史对话。
- **主会话 → 李白通知（只留 3 种、JSON 结构化，禁流水账）**：
  1. `MILESTONE`：完成一个可玩竖切片或整块 CI 绿灯（附 PR/commit 链接与试玩入口）；
  2. `BLOCKED`：卷文矛盾、前置缺口、连续两次失败或需拍板项（必填：冲突文件:行、两种备选方案、各自代价）；
  3. `COST_OR_CLOUD`：需开腾讯云跑长测或触及花费/权限/删资源闸门（附预估费用）。
  *注*：原 `/compact` 压缩核对通知直接取消——因为状态快照由 CI 自动生成，不再需要人肉核对记忆。
- **李白 → 亮圳汇报（完全对齐硬偏好）**：
  - 每条以「痛快！」开头（作为李白没忘规矩的活体自检），中文大白话，伦敦时间，2–4 句一段，不带模板标题与 AI 腔；
  - **严格区分事实与自述**：凡经过 commit SHA / CI 链接核实的写为事实；尚未入库或未验的主会话口头说法一律标「主会话自称，未核」，不把口头数字报成进度；
  - 小时巡查**只报增量**（无新合入 PR、无新阻断、无新试玩变化则不发）；绝不汇报期限焦虑或额度流水，只有触及 >5 元花费、删资源、拓权、放宽硬规则或世界方向拍板时才请亮圳点头。

---

## 七、资源统筹（按 `RESOURCES.md` 实有家底，最大化省 Claude 与外部监督额度）

> 说明：`RESOURCES.md` 登记的可用家底为腾讯云 `dnd-runner`、DeepSeek API（V4.1 Flash）、Claude Ultra 交互会员 + 约 $200/月独立非交互 Claude API 额度、Gemini 4 Neon、GitHub 仓库、李白 box 机（未登记 Grok 资源；若监督侧有 Grok 或同类外部模型轮询，统一按“先由李白 box 机免费脚本抓 git/CI 增量，有实质变化才调一次模型”的硬规则执行，消灭空转耗额）。

核心统筹原则只有两条：**① 立刻废除 `CLAUDE.md:16` 对非交互 `claude -p` / API 的误禁，把 $200/月独立 API 额度从闲置变为三方出题与独立审卡的主力，彻底解放 Claude Ultra 交互会员额；② 把 80% 的机械写码、数据转换与大文本核对压给极低价的 DeepSeek V4.1 Flash，把免费/轻量 CI 交给 GitHub Actions，腾讯云仅在真实世界长测时按分钟开机并自动关机。**

### 1. 任务 → 模型 / 机器 / 额度精确映射表

| 任务类型 | 跑在哪里 | 使用模型与额度来源 | 预估单次 / 月度花费量级 | 省额度硬机制 |
|---|---|---|---|---|
| **主会话 1117 统筹、排竖切片、处理复杂架构冲突** | 主会话开发机 | 主会话自选（现 Claude Opus 5.5 High，走 **Claude Ultra 会员额**，不干涉自选） | 计入已有会员（0 额外边际费） | 禁止主会话亲自读整仓大文件或做批量替换；状态改读 ≤80 行 `状态快照.generated.md`，大幅压低单轮上下文消耗 |
| **机械写码、批量数据迁表（如 `world/lore/` → 维度表）、单卷补漏、文件片段比对** | 写码工作区（由 `dispatch.mjs` 无头调起） | **DeepSeek V4.1 Flash**（严禁 `v4-pro`） | 单卡约 ¥0.05–¥0.50；月度约 ¥10–¥40（极低） | 写码前先由 `dispatch.mjs` 裁剪只贴必要卷文行与目标函数，绝不把全卷/全历史塞进 prompt |
| **独立出题（照卷文写黑盒验收测试）** | 独立出题分支（无头调用） | **Claude Haiku（优先）或 Sonnet**，走 **独立 $200/月 Claude API 额度**（`claude -p` / Agent SDK） | 单卡约 $0.05–$0.30；月度可控在 $20–$40 内 | 解禁 `CLAUDE.md:16` 后不再占交互会员额；只喂卷文原句与接口签名，不喂写码分支代码 |
| **独立审卡（第一轮 & 必须改后的复核轮）** | 干净无历史上下文（无头调用） | 普通单卷卡：**Claude Sonnet API**；跨多卷/内核难卡：**Claude Opus API**（均走 **$200/月独立 API 额度**） | 普通卡 ~$0.20–$0.60；难卡 ~$1.00–$2.50；月度可控在 $80–$130 内 | 先过 GitHub CI 全量门禁再触发审卡——CI 红灯直接打回写码，**0 成本拦掉低级错误**，不再拿昂贵的 Opus 去审连测试都没过的半成品 |
| **常规合入全量测试、门禁扫描、`tsc --checkJs`、零 mock 烟测** | **GitHub Actions**（干净 Linux 容器） | 无模型费用（`npm ci` 锁死含 `acorn` 与 `typescript`） | 免费额度内（¥0） | 彻底替代本机/腾讯云跑常规 `kernel + accept` 单测，并消灭环境缺依赖问题 |
| **真实世界长测、九省全规模气候/泡展开性能基准、块验收** | **腾讯云 `dnd-runner`**（南京按量/竞价，由李白脚本开关机） | 无模型费用 | 单次开机跑完（15–40 分钟）约 ¥1–¥3（低于 ¥5 闸门）；月度约 ¥10–¥25 | 脚本封装“开机 → `npm ci` → 跑 `tests/cloud/` 与基准 → 回传摘要 → **自动关机**”，防忘关机烧钱；单次预估 >¥5 必先请示亮圳 |
| **周一 / 周四整仓深度纠偏与重大跨卷架构诊断** | 李白 box 机（`/workspace/neon-advisor/` 只读克隆） | **Gemini 4 Neon**（Antigravity `agy`） | 计入既有 Gemini Pro 额度（每周仅 2 次常规 + 极少专题） | 不进入日常写码/审卡流水线，专盯架构漂移、设计矛盾与跨卷走偏 |
| **小时巡检、状态快照生成、断链检查、短校验** | **李白 box 机**（本地定时脚本） | **纯 Node/Git 脚本（0 模型调用）**；仅检测到新 PR / `BLOCKED` / CI 红灯时才唤醒监督模型写短报 | ¥0（最大化省李白/Grok 等监督模型额度） | 无增量不唤模型、不报亮圳；避免定时轮询空烧 token |

### 2. 花费闸门与上线顺序

- **花费闸门硬执行**：DeepSeek 充值、腾讯云单次长测预估超过 ¥5、新增付费 CI 配额或修改 API 月上限，一律停下报亮圳批准；不超过 ¥5 的常规单次云机长测由李白直接按脚本开关机，事后在增量短报中带一句实耗即可。
- **立即见效的 3 步切换顺序**：
  1. **第一步（当天可做，零额外花费）**：合并 `.github/workflows/ci.yml` 开启 `master` 保护 + 锁死 `baseline.json` + 删除 `compose-card.mjs:12` 过期尾巴 + 补齐 `card-archive.mjs` 模型族互异核对 + 废除 `CLAUDE.md:16` 对非交互 API 的误禁；
  2. **第二步（紧接其后，打通北极星生命线）**：落地“运行期实体 `state.created` 统一校验 + 解除 `time` 事务死锁 + 零 mock 端到端开局/菜单/存档烟测 + 解除 `death.mjs`/`body.mjs` 第二物种 `null` 键死锁”；
  3. **第三步（按清理清单收尾）**：归档旧文档与 10 张旧本体表、接通 `tsc --checkJs` 与 `import_edge` 导出级默认拒绝、激活 `declareInputs`/`modifierSource` 与文化圈/神灵最小表头。
