# 《无限原野》可执行重写指南（整理工作区 → 新骨架重开 → 复审与排期）

- **代码基线**：`origin/master` 提交 `ae71f231e`（2026-11-24 15:12 伦敦时间，合入 `ds/c1-time` 及 `4f5ddda87` 亮圳【裁定1124b】）。
- **撰写时间**：2026-11-24 15:40–15:50（伦敦时间）。
- **与诊断的关系**：本指南直接承接整仓深度诊断 `/workspace/neon-advisor/reports/diagnosis-1124.md`（2026-11-24 13:59 伦敦时间）。诊断回答「病根在哪」，本指南回答「采用什么主策略、全仓每一棵树怎么处置、工作区怎么按序整理、新 `CLAUDE.md` 全文怎么定、复审过关后按什么顺序开写、11-30 20:00 硬期限如何务实取舍、以及整理完复审时逐条怎么查」。
- **核查边界**：本轮按最大批判授权独立评判（包括亮圳既有前提、李白提案、现行规矩与 11-30 期限）；全程只读 `repo/`，未改动仓库内任何文件，未写入任何密钥；凡无仓库提交或文件证据支撑的主会话口头说法，均标「主会话自称，未核」。

---

## 一、主策略裁决：选「骨架重来，零件严审留用」（修正版）

**结论**：唯一可行的主策略是**修正版「骨架重来，零件严审留用」**——立即冻结现有目录上的零碎修理卡（C8–C11），在清理工作区后**重建极简无领域语义的 L0 新骨架与零 mock 玩家闭环**，把现有 `server-plugin/` 迁入只读零件仓，仅允许通过 6 条机械准入闸的旧代码按“新骨架所需”逐件搬回，其余一律按新骨架重写。**明确否决「原地修」和「全盘从零重写」**。

### 1.1 为什么另外两条路走不通

- **否决「原地修」**：
  - 现有病灶不是局部 bug，而是四根承重柱一起反转：L0 `server-plugin/kernel/` 吞掉全服务端 **71.5% 文件（108/151）、85.5% 代码行数（27,836/32,556）**（`server-plugin/kernel/files.json:1-110`）；运行期新建实体 `state.created` 被 `storage.mjs:175,230,259`、`dimensions.mjs:102`、`handles/keys.mjs:39-41`、`valuation.mjs:282` 全线拒收；`time` 原语在单事务执行器与自开事务调度器间死锁（`primitives-runtime.mjs:10-12`、`scheduler.mjs:589,604,660`）；`baseline.json` 积压 **523 条未锁违例**；91/182 条门禁沉睡；生产入口 `index.mjs` 对菜单、存档、修正源全部悬空。
  - 最新合入 `ae71f231e`（C1 时间与年龄）就是原地修低效的现成证据：仅收口 2 处分钟换算，就触动 14 个文件、拖出 2,137 行勘误前快照、花费 Claude API $1.11（出题 $0.56 + 审卡 $0.55），却依然离“玩家点开菜单、存一次档”零推进。继续原地修 C8–C11 等于在承重墙倒置的大泥球里逐间粉刷，一周后仍无一局可玩。
  - **原地修唯一窄适用范围**：无（仅允许在整理前做 1 笔紧急门禁/CI 落地，不做任何业务原地修补）。
- **否决「全盘从零重写」**：
  - 仓库已有经过手算与大量单测验证、且与旧架构泥球解耦的硬资产：定点数学 `kernel/det-math.mjs` 与 366 KB 预计算表 `world/rules/tables/det-numeric.json`、规范字节序列化 `kernel/bytes.mjs`、确定性采样 `kernel/sample.mjs`、双分录账本算法 `kernel/ledger.mjs`（经 C3 收口）、显示/屏蔽底层 `textcore/` 与 `gate/`、24.8 MB 开源字体与 94 张 SVG 视觉资产 `assets/`、以及 `world/lore/`（1.3 MB）、`world/geo/`（1.45 MB）、`world/people/`（5.09 MB）的大量手写世界内容。
  - 距 11-30 20:00 仅剩 **6 天 4 小时**，全盘从零重写连确定性定点数学、账本与世界基础数据都重造不完，只会把真实内容也一并扔掉。
  - **从零重写唯一窄适用范围**：L0 核心骨架（装配、存储写口、事务与时间推进协议、缓存与衍生索引、存档挂载、菜单/动作派发、`index.mjs`）、旧 `world-create.mjs` 与全表扫描的旧空间/泡展开管线，以及缺失的新底子无 AI 菜单前端。

### 1.2 对既有前提、亮圳决定、李白提案与【裁定1124b】的正面批判与修正

按本轮最大批判授权，直指当前互相打架、导致“做不成可玩世界”的五处根子：

1. **硬期限「2026-11-30 20:00 伦敦时间」与“先整理 + 再重写骨架 + 顾问复审 + 九省 31 郡全规模立体格子可玩”直接互斥**：
   - 现在是 2026-11-24 15:40 伦敦时间，剩余不足 **6.2 天**。当前仓库 896 MB 中有 **810 MB 历史死文件**（`docs/统一底层设计/版本快照/` 467 MB + `world/drafts/` 343 MB），工作区整理 + 亮圳点头删除 + 顾问复审至少耗掉 **1–1.5 天**，留给新骨架编码和验收的仅 **4.5–5 天**。
   - **必须二选一，不要自欺**：
     - **建议守什么**：守 11-30 20:00 这个检查点，但把 11-30 交付口径明确改为**「干净工作区 + 新 L0 极简骨架 + 远端 CI 绿灯 + 零 mock 最小可玩竖切片（真实开局→新建实体可被引用→无 AI 菜单点击真实动作→`submitProposal` 落事务与日志→提交后推进时间→存槽读档并 `replay_apply` 逐字节一致）+ 真实浏览器可点开的极简菜单页 + 挂接五文化圈/第二物种加载无阻塞」**。
     - **建议放什么**：放掉「11-30 前把 C8–C11 全清、把 419 条旧偏离修完、把全量经济/市场/战斗/AI 叙述塞进 11-30」的幻想。旧修理卡清单（Q-18）随着骨架重来自然作废，只在新骨架搬零件时按新闸门一次清零，不再单独为旧泥球还债。
2. **「九省 31 郡不缩规模」+「立体格子 B（5,340 万区格纯函数不存）」的教条解读，与“真实可玩”在算力上冲突**：
   - 证据：`docs/问题.md:748,989,654`、`96ec3809b` 提交实测——仅 59 人极简世界，`loadWorld` 已耗时 **7 s / 745 MB**，单郡约 10⁶ 区格气候首读 **68 s–1.8 分钟**，20 人泡展开 **400 ms**（超 200 ms 预算一倍），100 m 尺规直接撞碎 16 个住区与 19 栋私宅的聚落层级（`docs/问题.md:729-749,880-884`）。
   - **怎么改**：**守**“九省 31 郡完整省郡/聚落/文化圈数据结构不缩水”；**推翻**“5,340 万区格基底与郡级聚合一概不许烘焙、派生索引一概不许物化”与“聚落内住区必须按 100 m 区域足迹强划互斥”的教条。确立“权威状态（进 `saveDigest`）”与“确定性可重建烘焙/索引层（不进 `saveDigest`，可校验重建）”两层边界，并把住区降为逻辑/细格亚区。
3. **「不准硬编码红线」被误用成了“全字段强制现实论文出处 + 全族展平必填”，亲手堵死了修仙与五文化圈**：
   - 证据：`docs/问题.md:908-979` 记录落第一条 `species_human` 被 `E-DIM-SOURCE-PLACEHOLDER` 卡停，最终仍靠 14 项特批暂定值绕过；`server-plugin/` 中五文化圈与神灵为 **0 引用**；`death.mjs:77`/`body.mjs:172` 因全族展平 `null` 键锁死第二个物种。
   - **怎么改**：**守**“数据与规则分离、不按 ID/场景写特判、调用公共部件”；**推翻**“奇幻/文化/游戏内部刻度也必须走现实文献出处校验”。加载校验器机械分两档：`literature`（物理/材料/天文）与 `design_spec`（指向仓库设计册/裁定号，允许明确标定刻度），同时由视图层统一过滤 `null` 键，解封第二物种与 `world/lore/`。
4. **「不为旧存档做兼容」应保留，但卷二十七严格 `rulesDigest` 与“增量加内容/调暂定值”的冲突必须拆开**：
   - 保留“开发期不为旧存档写迁移分支”，这是好规矩。但同时把 `saveDigest` 校验拆成 `engineRulesDigest`（逻辑变化直接拒读）与 `dataPacksDigest`（支持只增数据表/文化包），避免每加一个怪物或调一个暂定参数就废掉全部试玩存档夹具。
5. **批评【裁定1124b】（提交 `4f5ddda87`）与「三方不同模型（Z-5）」的落地漏洞**：
   - **肯定方向**：【裁定1124b】终于废除了 `CLAUDE.md:16` 误禁 `claude -p`/API 的昏招，释放了 `RESOURCES.md:20` 闲置的 ~$200/月独立非交互额度，最新 `ae71f231e` 已跑通（总 API 费 $1.11 < ¥8，单项均 < ¥5）。
   - **四处致命漏洞（必须修）**：
     - ① **文本自相打架**：`4f5ddda87` 只改了 `CLAUDE.md:16`，紧挨着的 `CLAUDE.md:17` 仍白纸黑字写着「写代码默认由主会话派 Sonnet 子代理包卡」，`CLAUDE.md:22-25` 仍写着「Sonnet 子代理统筹」——变钝的主会话下次重读必被 `:17` 带回会员子代理；
     - ② **脚本环境变量错位且仍在投毒**：`CLAUDE.md:16` 写 `ANTHROPIC_API_KEY`，但仓库脚本 `tools/dispatch/run-card.sh:12` 检查的是 `CLAUDE_API_KEY`；且 `run-card.sh:17` 调的 `tools/dispatch/compose-card.mjs:12` 仍在往每张卡末尾硬塞已废止的 `docs/卡回报/<分支>.md` 与 `E-ACC-CARD-SELFCHECK`，还硬编码了 Windows 路径 `F:/dnd-tools/claude-cli/...`；
     - ③ **无机械防绕开**：会员子代理能否被主会话拉起、单项 API 费用是否超过 ¥5（≈$0.70），目前全靠“主会话记得遵守”，一旦失忆直接打穿额度或超费；必须由唯一派卡入口脚本读取 `claude -p --output-format json` 的 `total_cost_usd` 自动记账并硬控单次 `--max-budget-usd 0.65`（约 ¥4.7，天然低于 ¥5 红线），超时/超预算由 CLI 自己中断；
     - ④ **Z-5 三方模型门禁至今仍只核“标识字符串”不核“模型族”**（`tools/accept/lib/card-archive.mjs:240-269`），且 C5 写码方偷看测试照常合入；必须用物理分支隔离 + 门禁核模型族替代人工自觉。
6. **对李白「骨架重来，零件留用」提案的三项必须修正**：
   - **修正 1（最小闭环定义太浅）**：李白只写“开局、点菜单、存档”，漏了诊断最致命的两条断链。最小闭环必须写死为 6 步零 mock 链条：**`index.mjs#init` 启动 → 真实新开局 → 运行期在 `state.created` 新建实体并用 `writePath` 写入另一实体的 `ref` 字段 → 经真实菜单入口发动作经 `submitProposal` 落事务与 `LogBook` → `postCommit` 推进时间（解除 `time` 死锁）→ 存槽读档并 `replay_apply` 验 `saveDigest` 逐字节一致**。
   - **修正 2（必须先给 L0 新骨架划硬天花板）**：不规定“新 `server-plugin/kernel/` 上限 ≤15 个纯 L0 文件，严禁任何地点/物品/生物/气候/生成逻辑进入”，所谓的“留零件”很快会把旧 `kernel/` 108 个文件换皮搬回来。
   - **修正 3（立即停掉旧队列，绝不边派旧卡边整理）**：在亮圳对删除清单点头前的准备阶段，**立即停止派发 C8–C11 及任何基于旧骨架的功能卡**；只允许跑“工作区整理 + 门禁/CI 落地”这一条线，避免边清边产新垃圾。

### 1.3 「零件」的明确定义与 6 条机械准入检查

**什么才算值得留的「零件」**（满足以下三类之一才有资格申请搬入，其余直接留归档仓或重写）：
1. **无领域耦合的纯算法/基座模块**：输入输出封闭、确定性可手算、不依赖旧 `loadWorld` 静态大泥球、不含私有全局缓存（如 `det-math.mjs`、`bytes.mjs`、`clone.mjs`、`errors.mjs`、`textcore/`、`gate/`、拆清后的 `ledger.mjs` 与 `rx.mjs`）。
2. **领域纯计算子算法（降级搬入 `rules/`，不得回 `kernel/`）**：如网格几何 `grid-geom.mjs`、寻路核心 `route-grid.mjs`、历法天文换算 `calendar.mjs`、材料热物性/腐坏纯公式——但必须剥离对 `state.created` 黑户的静默假设与私有 `WeakMap`。
3. **世界数据与设计资产**：已验证的数据表（`det-numeric.json`、`material.json`、`species.json`、`world/i18n/`、`assets/`）、可作结构化迁移输入的真实世界内容源（`world/lore/`、`world/geo/`、`world/people/`）、以及经过勘误收口的现行设计文本。

**明确不算零件、直接淘汰/重写的代码**：任何含 20+ 跨领域静态 import 的大泥球（`kernel/load/world.mjs`、`kernel/place.mjs` 1,740 行）、只查静态 `idIndex` 拒收运行期新建实体的存储/键/估值壳、全仓 0 生产调用者的孤岛模块（如旧 `menu-entry.mjs`、旧 `world-create.mjs`）、带整文件豁免或历史基线债务的胶水代码。

**搬入新骨架的 6 条机械准入闸（缺一不可，CI 自动拦截，不靠 AI 记忆）**：

| # | 准入闸名称 | 机械检查方式（命令 / 脚本） | 不通过的处理 | 为何不依赖 AI 记忆 |
|---|---|---|---|---|
| 1 | **分层与体积红线** | 新 `server-plugin/kernel/files.json` 硬白名单（≤15 个纯 L0 文件）+ `import_edge.mjs` 导出级默认拒绝 | 任何业务文件试图进 `kernel/` 或规则层裸导内核私有符号，CI 直接非 0 拒合 | 目录白名单与 AST 出口比对由 CI 强制执行 |
| 2 | **类型与契约检查** | `npx tsc --noEmit --allowJs --checkJs` 零报错 | 类型不符或调用未声明签名直接红灯，不允许打补丁绕过 | 编译器静态兜底，无需代理记忆 182 个接口签名 |
| 3 | **零黑户 & 零私有缓存** | AST 扫描：禁止加载器外直查 `registry().idIndex.get`；禁止 `kernel/memo.mjs` 外声明顶层状态 `WeakMap/Map`；禁止加载器外调 `installVocab` | 命中即 `pre_commit` / CI 阻断，必须改走 `kindOfEntity(state, id)` 与切片 `stateMemo` | 语法树硬禁，忘规矩也提不上去 |
| 4 | **零基线债务迁入** | 新骨架所有搬入文件在 `tools/accept/baseline.json` 对应违例必须为 **0**，且禁止在 `scanclasses.json` 挂整文件豁免 | 带 1 条旧违例即拒搬，必须先修干净或重写 | CI 校验新目录文件在基线表命中数必须为 0 |
| 5 | **真实生产消费者可达** | 搬入的导出入口必须在 `server-plugin/index.mjs` 依赖图内至少有 1 处非测试调用者（脚本自动构建 import/call 图校验），并被零 mock E2E 烟测覆盖 | 仅单测调用的孤岛代码禁止迁入主线 | 入口可达图自动判定，杜绝“孤岛封卡” |
| 6 | **行为单测绿灯 & 拒静默兜底** | 在 GitHub Actions 干净容器 `npm ci` 下跑过对应手算行为单测 + 缺依赖/显式 `null`/未知值负向测试 | 静默跳过校验或拿他字段顶替未知直接失败 | 远端干净环境全自动执行，彻底消除本机漏跑与环境漂移 |

---
## 二、全仓五类资产处置清单（覆盖全部代码、数据、工具、测试、文档与脚本）

全仓当前（`ae71f231e`，不含 `.git` 与 `node_modules`）共 **12,879 个文件 / 895.9 MB**，其中仅 `docs/统一底层设计/版本快照/`（467 MB，1,495 文件）与 `world/drafts/`（343 MB，7,937 文件）就占了 **90.4%**（810 MB），均在 git 历史中完整留存且生产代码引用为 0。

五类口径定义（严格区分，不模糊）：
- **保留**：原样留在默认阅读/编译路径，无需改动或仅做极小路径适配。
- **改后保留**：主体留用，但必须先完成指定改造并通过对应检查，未改完前不得进入新骨架。
- **重写**：路径/职责仍需存在，但旧内容与新骨架冲突，**旧文件先归档至 `archive/`（供零件参考），再在原路径或新分层路径按新骨架重写**。
- **删除（须亮圳点头后执行）**：点头前绝不删；点前先打只读标签 `pre-rewrite-20261124` 留底，点头后用 `git rm` 从工作树移除（下方逐项注明“仅靠 git tag 留底”还是“先归档一份再删”）。
- **归档**：用 `git mv` 移出默认阅读/编译路径到 `archive/`（保留在工作树备查但不进默认检索与编译），并在清单中写明归档目标路径。

### 2.1 `server-plugin/` 全树处置（155 文件 / 2.09 MB）

> 核心原则：新 `server-plugin/kernel/` 只保留 **≤15 个纯 L0 基座文件**（无任何领域语义）；原 `kernel/` 中所有地理、物品、气候、历法、政体、生成业务先整体移入只读零件仓 `archive/legacy-server/`，后续仅按 6 条准入闸逐件降级搬入 `server-plugin/rules/` 或重写。

| 路径 | 类别 | 代表文件与目录内例外 | 理由与仓库证据 |
|---|---|---|---|
| `server-plugin/textcore/`（7 文件） | **保留** | `brand.mjs`、`digest.mjs`、`fail.mjs`、`labels.mjs`、`ops.mjs`、`release.mjs`、`text-types.mjs`（无例外） | 体积小（13.1 KB）、无领域状态耦合、`createDigestCap` 已被 `index.mjs` 与 `mount.mjs` 实调 |
| `server-plugin/gate/`（4 文件） | **改后保留** | `fail.mjs`、`load-blocklist.mjs`、`matcher.mjs`、`screen.mjs`（例外：`load-blocklist.mjs:3` 须清理旧 `world/meta/blocklist.json` 注释并补接 `E-NAME-BLOCKLIST` 实抛） | 显示/屏蔽核心干净（9.8 KB），需补齐 `docs/架构设计/13-超自然与文化圈.md:199-208` 要求的实抛接线 |
| `server-plugin/output-gate/`（8 文件） | **改后保留** | `display-load.mjs`、`enums.mjs`、`envelope-exit.mjs`、`mount.mjs`、`redact.mjs`、`reply-composer.mjs`、`select.mjs`、`templates.mjs` | 出口闸骨架完整（27.3 KB），需与新 `menu-entry` 接通真实动作回包并消除对旧枚举的隐式假设 |
| `server-plugin/kernel/` 纯 L0 算法零件（6 文件） | **保留**（入新 `kernel/`） | `bytes.mjs`、`clone.mjs`、`det-math.mjs`、`errors.mjs`、`named-structs.mjs`、`named-struct-match.mjs` | 纯确定性工具/数学/错误构造，C6 刚收口 `det-math.mjs`（`6d91ceff1`），无状态耦合 |
| `server-plugin/kernel/` 需修补的 L0 基座（10 文件） | **改后保留**（修完入新 `kernel/`） | `error-codes.mjs`（删/标 `deferred` 417 个僵尸码）、`rx.mjs`（修 `:368-374` 显式 `null` 报错）、`sample.mjs`（保分派表）、`vocab.mjs`（锁 `installVocab` 单调用者）、`events.mjs`（保持单事务事件日志）、`ledger.mjs`（经 C3 `dc45411e1` 收口，拆清与 `txSet` 权限边界）、`declare.mjs`（接通 `declareInputs`）、`subscribers.mjs`、`report.mjs`、`advance-registry.mjs` | 均为真正 L0 机制，但分别存在 66.9% 僵尸码、显式 `null` 误炸、`declareInputs` 0 调用等明确缺陷（`diagnosis-1124.md` 二.2） |
| `server-plugin/kernel/` 需重写的核心 L0 骨架（9 文件） | **重写**（旧版先归档 `archive/legacy-server/kernel/`） | `storage.mjs`（`:175,230,259` 拒收 `state.created` 黑户且缺 `rewriteRows` 校验）、`dimensions.mjs`（`:50` `modifierSource=null`、`:102` 拒新建实体）、`memo.mjs`（`:54-56` 一写全清致 20+ 私有缓存）、`transaction.mjs` & `scheduler.mjs`（`time` 事务死锁 `:589,604,660`）、`save.mjs` & `save-session.mjs`（`installSaveEnv`/`registerUnitOfPath` 0 调用）、`mount.mjs`（缺启动装配完整性断言）、`files.json`（108 行大泥球清单改为 ≤15 行纯 L0 白名单） | 这 9 个文件是诊断出的架构反转与死锁总源头，必须按新契约重写（支持 `state.created`、切片缓存、可重建索引、`postCommit` 时间协议、启动强断言） |
| `server-plugin/kernel/handles/`（7 文件） | **改后保留**（合并精简入新 `kernel/handles/`） | 代表：`keys.mjs`、`markers.mjs`、`entity-id.mjs`、`vocab-handle.mjs`、`patterns.mjs`、`display-lang.mjs`、`generated.mjs`（例外：`keys.mjs:39-41` 必改，消灭静态 `idIndex` 黑户校验） | 句柄和键串文法经 C2 收口有价值，但 `keys.mjs` 拒收运行期新建实体，必须改完才准入 |
| `server-plugin/kernel/load/`（11 文件） | **重写**（核心 4 文件）+ **改后保留**（工具 7 文件） | **重写**：`world.mjs`（22 条静态跨领域 import 改插件注册口 `registerDomainValidator`）、`state-owners.mjs`（`:50` 删硬抄 `ENTITY_KINDS`，强校验 `kernelApi` 前缀 `kernel/`）、`rules.mjs`、`save.mjs`；**改后保留**：`json-text.mjs`、`flatten.mjs`、`layout.mjs`、`vocab-load.mjs`、`display-langs.mjs`、`codepoint-tables.mjs`、`geo-inputs.mjs` | `load/world.mjs`（改 36 次）和 `load/state-owners.mjs`（改 54 次）是内核吞噬业务与高频冲突的机械枢纽 |
| `server-plugin/kernel/transport/`（3 文件） | **改后保留**（2）+ **重写**（1） | **改后保留**：`router-caps.mjs`、`reply-channel.mjs`；**重写**：`menu-entry.mjs`（`:70-78` 全拒 `E-ACT-UNKNOWN`，须接入真实最小动作与 `submitProposal`） | 现行 `menu-entry.mjs` 是假入口，无法点动任何玩家菜单动作 |
| `server-plugin/kernel/validate/`（11 文件） | **改后保留**（纯类型 2 文件）+ **归档并降级迁 `rules/validate/`**（9 文件） | **改后保留（入新 `kernel/validate/`）**：`types.mjs`、`rows.mjs`、`dimensions-validate.mjs`（补 `literature`/`design_spec` 分级出处与 L4 校验，拆出领域逻辑）；**归档迁 `archive/legacy-server/kernel/validate/`** 待降级迁领域包：`body-tables.mjs`、`cell-grades.mjs`、`effects-validate.mjs`、`field-tables.mjs`、`named-conditions.mjs`、`polity-tables.mjs`、`price-tables.mjs`、`sense-tables.mjs` | 把领域表校验塞进 `kernel/` 导致内核膨胀；统一加载器提供插件注册口后，各领域校验回归领域包 |
| `server-plugin/kernel/` 内被错误塞入的领域业务（37 文件） | **归档**至 `archive/legacy-server/kernel-domain/`（按需过 6 闸后降级迁入 `server-plugin/rules/`） | 代表：`place.mjs`（1,740 行，含 5 私有 `WeakMap` 与 `:1383` 海拔静默顶替）、`footprint.mjs`、`grid*.mjs`（6 文件）、`place-*.mjs`（3）、`route-grid.mjs`、`route-edges.mjs`、`cave.mjs`、`blueprint.mjs`、`water-bed.mjs`、`wall-flow.mjs`、`calendar.mjs`（含刚合 `ae71f231e` 的 `astroView` 换算）、`climate.mjs`、`weather.mjs`、`item.mjs`（`:502-532` 静默跳过校验）、`item-state.mjs`、`recipe.mjs`、`valuation.mjs`（`:282` 拒新建实例）、`holdings.mjs`（`:77-78` 硬写 `TEMPLATE_NAMES`）、`terminate.mjs`、`title.mjs`、`effects.mjs`、`dated.mjs`、`dimension-writers.mjs`、`layout.mjs`、`reverse-index.mjs`、`view-registry.mjs`、`dim-value-check.mjs`、`footprint-kind.mjs`。<br>**例外**：`calendar.mjs` 历法换算与 `route-grid.mjs` 寻路核心最干净，可首批过 6 闸降级迁 `rules/`；`place.mjs` 必须拆解重写，不得整体搬回 | 卷一与 `docs/架构设计/03-分层与玩法包.md` 严禁领域业务滞留 L0；其中多项带私有缓存、静默兜底与黑户缺陷，必须先隔离，过 6 闸才按领域包迁回 |
| `server-plugin/kernel/gen/`（18 文件） | **归档**至 `archive/legacy-server/kernel-gen/`（按需改造后迁 `rules/gen/`） | 代表：`worldgen.mjs`（`:100` 藏全局副作用 `installVocab`）、`siteform.mjs`（32.8 KB）、`polity.mjs`、`water*.mjs`（3）、`holdings-open.mjs`、`assetcalls.mjs`、`holdcalls.mjs`、`stages.mjs`、`order.mjs`、`writeback.mjs` 等 18 文件 | 世界生成属业务领域而非 L0 内核；且当前多为单测孤岛（开局持有/资产生产 0 调用） |
| `server-plugin/kernel/*.d.ts`（2 文件） | **重写** | `state-types.d.ts`、`types.d.ts` | 随新 L0 骨架与 `tsc --checkJs` 接入重新由 `tools/gen-state-types.mjs` 生成 |
| `server-plugin/` 顶层主干入口（4 文件） | **重写**（旧版先归档 `archive/legacy-server/root/`） | `index.mjs`（补齐 `saveEnv`、`unitOfPath`、`modifierSource` 与 `menu-entry` 真实挂载）、`systems.mjs`（改为核对 `state-owners.json#systems` 完整性，不再仅硬写 3 行 import）、`primitives-runtime.mjs`（`:49-70` 删硬抄 `CATALOG` 副本，改由加载器注入 `primitives.json` 并实现 `postCommit` 时间推进）、`world-create.mjs`（`:10-15` 删裸导 `runTransaction`，接入 `submitProposal`/`LogBook` 与新开局落盘） | 这 4 个文件直接控制生产入口与开局主干，全部存在裸导内核或主干悬空（`diagnosis-1124.md` 二.1 & 二.4） |
| `server-plugin/` 顶层其余规则模块（20 文件） | **归档**至 `archive/legacy-server/rules/`（逐件过 6 闸后迁入新 `server-plugin/rules/`） | 代表：`action-capacity.mjs`、`body.mjs`（`:172` 须先修 `null` 键）、`death.mjs`（`:77-79` 须先修 `null` 键）、`bubble.mjs`（全表扫描 400 ms 超预算）、`demand.mjs`、`env-fields.mjs`、`field-step.mjs`（`:12` 裸导 `det-math`）、`grid-diff.mjs`（被倒灌进 `kernelApi`）、`item-condition.mjs`、`item-lots.mjs`、`life.mjs`、`opening-people.mjs`（`:12` 裸导 `KernelError`）、`perceive.mjs`（倒灌 `kernelApi`）、`person.mjs`（`:12` 裸导、`:70-78` 硬编码分流）、`position.mjs`、`price.mjs`、`sight.mjs`（倒灌 `kernelApi`）、`sim-tiers.mjs`、`species.mjs`、`status.mjs`。<br>**例外**：`death.mjs`、`body.mjs`、`species.mjs`、`life.mjs`、`position.mjs` 为最小闭环与第二物种优先迁移零件，修完即迁 | 先统一收进只读零件仓清空根部混乱；迁回新 `server-plugin/rules/` 时逐个清理裸导、倒灌、`null` 键与全表扫描 |

### 2.2 `world/` 全树处置（8,252 文件 / 345.24 MB）

| 路径 | 类别 | 代表文件与目录内例外 | 理由与仓库证据 |
|---|---|---|---|
| `world/i18n/`（4 文件，117 KB） | **保留** | `blocklist.zh.json`、`casefold.json`、`labels.zh.json`、`locales.json` | 已被 `gate/`、`textcore/`、`load/` 实调，干净单一真相源 |
| `world/rules/tables/`（45 文件）+ `world/rules/registry.json` | **改后保留** | 代表：`det-numeric.json`（366 KB，**原样保留**）、`astro.json`、`calendar.json`、`clock.json`、`currency.json`、`save-layout.json`、`worldgen.json` 等。<br>**例外（必须先改）**：`derived-process.json`（当前为空壳 `{"version":1,"slots":{},"consumers":{}}`，须补真实过程槽或显式声明）、`fields.json`/`light.json`/`sound.json`/`env.json`（补齐暂定标定项与 `design_spec` 出处）、`attr.json`（补加载期消费者接线） | 规则参数外置符合北极星，但须清除空壳表与未接消费者表（`diagnosis-1124.md` 二.2，`docs/问题.md:981,995`） |
| `world/ontology/` 现行契约与维度表（`primitives.json`、`named-structs.json`、`state-owners.json`、`dimensions/` 17 文件） | **改后保留** | **改后保留**：`state-owners.json`（移出 `:255-268` 4 个倒灌的规则层导出进 `groupApi`，改小内核边界）、`primitives.json`（成为唯一原语真相源）、`named-structs.json`；`dimensions/` 下 `_vocab.json`、`_units.json`、`_distributions.json`、`material.json`（1.08 MB）、`item.json`、`species.json`、`body_plan.json`、`facility_type.json`、`office.json`、`org.json`、`polity.json`、`recipe.json`、`status.json`。<br>**例外**：`dimensions/person.json`（`:21,36` 清除 `[0, 100000]` 占位钳位）；`dimensions/place.json`（3.87 MB，须按新聚落亚区与可重建烘焙层重转）；`dimensions/_unbuilt-derived.json`（改 23 次积压 111 项，随新骨架建立 `contracts.json` 后收口）；`dimensions/_effects.json`（仅 3 字节空壳，补全或删） | 维度表体系是世界核心数据结构，但 `state-owners.json` 已被反向污染，`place.json` 3.87 MB 触发 7 s / 745 MB 加载瓶颈，需按新骨架调整 |
| `world/ontology/` 死本体文件（2 个可删 + 8 文件与 `slots/` 归档） | **删除**（2 文件，点头后）+ **归档**（8 文件 + `slots/`） | **删除（亮圳点头后，git tag 留底即可）**：`verbs.json`（8.6 KB）、`holdings.json`（29.7 KB）——`server-plugin/` 加载引用为 0，若需核对遗漏动词/原因，可先抽一份 1 页迁移对照再删（裁定 X-E/Z-1 实证无读者）；<br>**归档至 `archive/legacy-ontology/`**：`derived-fields.json`、`entity-templates.json`、`fixtures.json`、`obligations.json`、`offenses.json`、`statuses.json`、`tags.json`、`slots/core.json`、`slots/consumers.json` | 全部 10 项在 `server-plugin/` 加载引用为 **0**，混在新底子 `world/ontology/` 下严重误导写码代理（`diagnosis-1124.md` 二.5 & 五） |
| `world/geo/`（13 文件，1.45 MB） | **保留**（源输入）+ **改后保留**（2 文件） | 代表：`geo-model.json`、`regions.json`、`settlements.json`、`routes.json`、`locations.json`、`building-classes.json`、`elevation-controls.json`、`water-bodies.json`、`start-buildings.json`、`weather-cell.json`、`biomes.json`、`gen-open.json`。<br>**例外（改后保留）**：`geo-model.json` 与 `subsite-reparent.json`（须配合聚落住区亚区规则恢复 19 栋私宅与 86 子站点层级，不留临时强拆） | 九省 31 郡的作者地理源文件，属北极星核心资产，作为新转换器与烘焙层输入保留 |
| `world/people/`（4 文件，5.09 MB） | **保留**（作者数据源） | `baseline.json`（4.6 MB）、`residents.json`（509 KB）、`households.json`（77 KB）、`opening-roster-hw.json`（10 KB） | 人物与家户作者数据源，被 `opening-people.mjs` 与 `tools/convert-people-hw.mjs` 读取 |
| `world/lore/`（14 文件，1.30 MB） | **改后保留**（标注为迁移源，优先桥接 3 表） | `cultures.json`、`deities.json`、`faith.json`、`factions.json`、`factionPeople.json`、`faction-relations.json`、`festivals.json`、`history.json`、`rumors.json`、`family-law.json`、`sovereignty.json`、`eras.json`、`office-succession.json`、`promotion-facilities.json` | 全仓五文化圈、神灵、势力、传闻的真实内容资产，但目前在 `server-plugin/` 为 **0 引用**；保留在 `world/lore/` 并优先打通 `cultures`/`deities`/`faith` 最小表头加载 |
| `world/meta/`（20 文件，2.37 MB）、`world/law/`（1 文件）、`world/ecology/`（2 文件） | **归档**至 `archive/legacy-world-data/`（显式转换输入仓） | `world/meta/`：`items.json`、`monsters.json`、`recipes.json`、`rules.json`、`spells.json`、`skills.json`、`professions.json`、`careers.json`、`bosses.json` 及 `mechanics/` 9 文件；`world/law/bindings.json`；`world/ecology/species.json`、`renewables.json` | `server-plugin/` 运行期加载引用为 **0**（仅 `tools/convert-items.mjs` 与 `material-candidates.mjs` 读 `meta/`）。移入归档源目录防止与新底子 `dimensions/`、`rules/tables/` 混淆，转换脚本显式指定源路径读取 |
| `world/actions/`（12 文件，455 KB） | **归档**至 `archive/legacy-actions/`（原路径改由卷九新底子动作表**重写**） | `core.json`（413 KB）、`business.json`、`documents.json`、`institutions.json`、`law.json`、`open.json`、`transport.json`、`locale/` 5 文件 | `server-plugin/` 实际代码引用为 **0**（仅 `menu-entry.mjs:72` 一行注释），属旧版动作定义；移出默认 `world/` 后按新骨架最小可玩闭环重写 `world/actions/` 并纳入 `loadWorld` 强校验 |
| `world/art/`（3 文件）、`world/audio/`（1 文件）、`world/templates/`（15 文件） | **归档**至 `archive/legacy-world-ui/` | `world/art/STYLE.md`、`mapping.json`、`portrait-prompts.json`；`world/audio/synthesis.md`；`world/templates/dialogue/common/plain/*.json`（15 文件） | `server-plugin/` 与 `tools/` 引用全为 **0**，属旧版酒馆对话模板与美术映射，块 6 无 AI 最小闭环不消费，移出默认 `world/` |
| `world/design/`（147 文件，2.9 MB） | **删除**（亮圳点头后，仅靠 git tag `pre-rewrite-20261124` 留底） | 代表：`a3-content-approval.mjs`、`w5-sites-*.mjs`、`agriculture-foundation.mjs`、`yaoguai`/生态/职业批处理旧脚本等 147 个文件 | 全仓 `server-plugin/` 与 `tools/` 引用为 **0**，全部为 10 月旧底子 A3/W1–W5 的一次性内容批审批脚本，无编译/运行价值 |
| `world/drafts/`（7,937 文件，**343 MB**） | **删除**（亮圳点头后，仅靠 git tag `pre-rewrite-20261124` 留底；**严禁**再拷贝进 `archive/`） | 72 个旧草稿子目录（`a3-*`、`w1`–`w5`、`s4-*`、`s5-*`、`m2-*`、`m4-*`、`yaoguai`、`spells`、`bestiary` 等共 7,937 文件） | 占全仓近四成磁盘体积（343 MB），生产与工具引用全为 **0**，且历史完整留在 git，留在工作树只拖慢搜索、扫描与代理上下文 |

---
### 2.3 `tests/` 全树处置（654 文件 / 2.66 MB）

| 路径 | 类别 | 代表文件与目录内例外 | 理由与仓库证据 |
|---|---|---|---|
| `tests/kernel/`（146 文件，2.19 MB） | **归档**至 `archive/legacy-tests/kernel/`（随零件过 6 闸逐个迁回新 `tests/kernel/`） | 代表：`det-math.test.mjs`、`bytes.test.mjs`、`ledger*.test.mjs`、`calendar-climate.test.mjs`、`place*.test.mjs`、`body-world.mjs`、`perceive-world.mjs` 等。<br>**例外（首批随保留零件留在 `tests/kernel/`）**：`det-math.test.mjs`、`bytes.test.mjs`、`state-owners.test.mjs`、`calendar-climate.test.mjs`、`ledger*.test.mjs`（仅测 L0 纯算法与已保留零件的部分） | 旧测试深度绑定旧 `kernel/` 108 文件与测试夹具，先迁出避免新骨架被 100+ 历史夹具拖红，搬入一个零件同步迁回并升级对应行为测试 |
| `tests/accept/`（25 个 `.test.mjs`/辅件 + `bypass/` 454 个样例） | **改后保留**（核心门禁单测）+ **归档**（过期 C0 细碎样例） | **改后保留**：`card-archive.test.mjs`（改测模型族互异）、`dispatch-compose.test.mjs`（删旧尾巴断言，改测禁出现 `docs/卡回报/`/`E-ACC-CARD-SELFCHECK`）、`detectors.test.mjs`、`api-callers.test.mjs`、`entry-registry*.test.mjs`、`runner.test.mjs`、`gate-self.test.mjs`。<br>**删除（点头后，git tag 留底）**：`card-selfcheck.test.mjs`（随 9 项长文本正则自查废除而淘汰）；<br>**归档至 `archive/legacy-tests/accept-bypass/`**：`bypass/`（454 个 C0 猫鼠 AST 细碎绕过样本）中已被 `tsc --checkJs` 与导出封闭替代的条目 | 门禁本身须由测试锁死，但旧自查表正则与九轮 AST 猫鼠样例不应继续拖累 CI（`diagnosis-1124.md` 二.6 & 二.7） |
| `tests/acceptance/`（20 文件，129 KB，12 个旧卡子目录） | **归档**至 `archive/legacy-tests/acceptance/` | `ds-c1-time/`、`ds-c3-ledger/`、`ds-c4-grid/`、`ds-c5-material/`、`ds-c6-detmath/`、`ds-c7-misc/`、`ds-j1-menu/`–`ds-j4-zoneat/`、`ds-selfcheck-no/`、`ds-xvol-cde/` | 均为旧骨架修理卡的黑盒验收历史；**新骨架开启后，`tests/acceptance/<card>/` 只存放新竖切片卡在独立出题分支产出的黑盒验收测试** |
| `tests/cloud/`（7 文件，46 KB） | **改后保留**（并扩为真实性能红线集） | `real-world-load.test.mjs`、`real-world-footprints.test.mjs`、`opening-holdings-hw.test.mjs`、`world-create-hw.test.mjs`、`item-rot-real-world.test.mjs`、`building-types-world.test.mjs`、`gen-worldgen.test.mjs` | 腾讯云长测与真实世界性能基准骨架，需随新骨架接入硬性能预算（首读 `<3s`、泡展开 `<100ms`） |
| （新建）`tests/e2e/vertical-slice-smoke.test.mjs` | **重写 / 新增必过门禁** | 零 mock 端到端烟测（从真实 `server-plugin/index.mjs#init` 启动） | 锁死开局、新建实体 `ref` 写入、真实菜单动作、`submitProposal`、`postCommit` 推进时间、存槽读档 `replay_apply` 逐字节一致 |

### 2.4 `tools/` 全树处置（59 文件 / 2.85 MB + 仓库外脚本收编）

| 路径 | 类别 | 代表文件与目录内例外 | 理由与仓库证据 |
|---|---|---|---|
| `tools/accept/` 核心执行器与总登记表（`run.mjs`、`commit-hook.mjs`、`pre-push.mjs`、`entry-registry.json`、`entry-report.mjs`、`read.mjs`、`register.mjs`） | **改后保留** | **改后保留**：`run.mjs`（增加 L0 内核 ≤15 文件白名单冻结校验与断链/禁引用 `archive/` 检查）、`commit-hook.mjs`、`pre-push.mjs`（本地降级为快速预检，真正裁判权交 GitHub CI）；`entry-registry.json`（清空 349 条 `file: null` 旧壳，仅登记新骨架真实入口与生产调用者）。<br>**重写/重置**：`baseline.json`（旧 523 条全未锁违例清零重立，新骨架全行 `locked: true` 且新文件零豁免）、`scanclasses.json`（清除 C3 等文件级整片豁免）、`items.json`/`criteria.json`（802 KB）/`hits.json`（1.05 MB）/`cases.json`（149 KB）（精简瘦身，停用手工 AST 猫鼠补丁，切由 `tsc --checkJs` 承接） | 现有 `tools/accept/` 达 2.74 MB，其中 91/182 条沉睡、523 条违例未锁、`criteria.json` 重盖 90 次（`diagnosis-1124.md` 二.7），必须瘦身并锁定 |
| `tools/accept/detectors/`（13 文件，159 KB） | **改后保留**（核心 7）+ **重写**（2）+ **归档**（4） | **重写**：`import_edge.mjs`（`:4` 改为导出级默认拒绝，核实每个具名符号在 `kernelApi`/`groupApi` 与 `callers` 中）；`typed_pos.mjs`（接入 `tsc --noEmit --allowJs --checkJs` 替代占位）。<br>**改后保留**：`decl_cmp.mjs`（删 `:251` `UNIMPLEMENTED` 桩）、`path_access.mjs`（补 `:242` `dated` 静态拒写，改按 AST 取值来源判根）、`call_edge.mjs`（把 `txSet`/`txDelete` 锁死零违例受限入口）、`data_shape.mjs`、`file_set.mjs`、`ledger_count.mjs`、`lit_scope.mjs`。<br>**归档至 `archive/legacy-tools/accept-detectors/`**：`doc_struct.mjs`、`decl_guard.mjs`、`seed_sites.mjs`、`state_pattern.mjs` 中仅服务旧文本格式的冗余规则 | 补齐诊断揭示的三层穿透（`import_edge` 不核导出、`decl_cmp` 未实现、`path_access` 漏 `dated` 与局部变量误报） |
| `tools/accept/lib/`（9 文件，157 KB） | **改后保留**（6）+ **重写**（1）+ **删除**（1，点头后）+ **归档**（1） | **重写**：`card-archive.mjs`（`:240-269` 砍掉凑字数正则，改为硬核三方归一化**模型族名**完全不同 + 校验验收目录分支权限）。<br>**删除（亮圳点头后，git tag 留底）**：`card-selfcheck.mjs`（6.1 KB，9 项长文本自查表正则戏法，已制造 5 卡批量假勾）。<br>**改后保留**：`ast.mjs`、`ast-rules.mjs`（增禁顶层状态 `WeakMap` 与禁加载器外直查 `idIndex.get` 规则）、`api-callers.mjs`、`required-tests.mjs`、`item-form.mjs`、`js-scan.mjs`。<br>**归档**：`js-state.mjs`（旧词法按名认根 `docs/问题.md:1017`） | 废除形式正则自查，把防线收束为不可伪造的 AST + 模型族 + CI 硬校验 |
| `tools/dispatch/`（5 文件，11.9 KB） | **重写**（3 文件合并统一）+ **保留**（2 文件） | **保留**：`sampling.json`、`sampling-body.mjs`（DeepSeek 温度分档干净有效）。<br>**重写**（旧版先归档 `archive/legacy-tools/dispatch/`）：合并 `compose-card.mjs`（删 `:12` 投毒 `TAIL_BODY`）、`run-card-ds.sh`、`run-card.sh`（修 `CLAUDE_API_KEY` vs `ANTHROPIC_API_KEY` 错位、删硬编码 `F:/dnd-tools/...` 绝对路径、增加 `--max-budget-usd 0.65` 硬控单次 <¥5 上限）为唯一派卡入口 **`tools/dispatch/dispatch.mjs`**（派前自动核 `needs` 闭包 + 三方模型族互异） | 现行 `compose-card.mjs:12` 每张卡都在向代理投毒过期规矩，`run-card.sh` 环境变量与【裁定1124b】不匹配（`diagnosis-1124.md` 二.6） |
| `tools/` 顶层工具脚本（15 文件） | **保留**（7）+ **改后保留**（5）+ **归档**（3） | **保留**：`backup.mjs`、`gen-det-tables.mjs`、`gen-digest-exclude.mjs`、`gen-sort-keys.mjs`、`gen-state-types.mjs`、`entry-registry.mjs`、`entry-registry-merge.mjs`。<br>**改后保留**：`convert-geo-g5b.mjs`（适配聚落住区亚区与烘焙输出）、`convert-items.mjs`、`convert-people-hw.mjs`（显式读归档/源目录）、`dim-coverage.mjs`（改写到构建输出而非污染仓库 `logs/`）、`world-plan-partition-check.mjs`。<br>**归档至 `archive/legacy-tools/`**：`derive-subsite-reparent.mjs`（临时强拆住区产物）、`material-candidates.mjs`、`path-segment.mjs` | 保留确定性表生成与总登记表工具，改造数据转换器适配新源目录与烘焙层 |
| 仓库外漂浮工具（`F:/dnd-tmp/check-push-archive.mjs`、`F:/dnd-tools/cloud/sync.sh`、`F:/dnd-tools/notify/`、`F:/dnd-tmp/indep-arch/driver.mjs`） | **改后保留并收编入库**至 `tools/cloud/`、`tools/dispatch/`、`tools/notify/` | 全部去除硬编码 IP（如 `[云机IP已抹]`）、密钥与 `F:/dnd-` 盘符路径，改为读取环境变量并受 CI/测试覆盖 | `docs/当前状态.md` 引用仓库外 `F:/dnd-` 多达 69 处，换机即失且脱离审查（`diagnosis-1124.md` 二.6 & 五） |

### 2.5 `docs/` 全树处置（3,768 文件 / 513.12 MB）

| 路径 | 类别 | 代表文件与目录内例外 | 理由与仓库证据 |
|---|---|---|---|
| `docs/产品原则.md`（3.3 KB） | **保留**（北极星真相源） | 单文件（注：若亮圳同意本指南对出处分级/烘焙层的修正，仅在旁附一条生效裁定，不破坏北极星四句主干） | 全仓第一真相源，短小清晰（29 行） |
| `docs/统一底层设计/` 现行 29 卷正文 + `卷零-覆盖表.md` + `全书概念台账.md` + `写卷须知.md` + `审卷须知.md`（35 文件） | **改后保留** | 现行 29 卷 Markdown（卷一至卷二十九、卷三甲/乙、卷八b、卷零）。<br>**例外（必须先随新骨架勘误同步）**：卷一/卷二（L0 边界、出处分 `literature`/`design_spec`）、卷五/卷十（聚落住区亚区、烘焙层、`checkVolumeCells` 时机）、卷九（`postCommit.advanceMinutes` 解除 `time` 死锁）、卷二十（与卷五:323 冲突 `f3c8ee61f`）、卷二十七（拆分 `engineRulesDigest`/`dataPacksDigest` 与可重建索引边界）。<br>**归档至 `archive/design-aux/`**：`全书概念台账(草稿).md`（与正式台账重复）、`收尾待办.md`（200 KB 历史待办）、`素材包/`（28 文件，660 KB）、`脚本/`（168 个写卷期一次性核对脚本，3.3 MB） | 29 卷是规则公式与不变量的参考书，但必须先修完诊断出的 5 处结构死锁，并清出草稿/素材包/写卷脚本，避免检索污染 |
| `docs/统一底层设计/版本快照/`（1,495 文件，**467 MB**） | **删除**（亮圳点头后，仅靠 git tag `pre-rewrite-20261124` 留底；**严禁**再进 `archive/`） | 历次勘误前整卷全量副本（如刚合的 `ae71f231e` 改 5 行却复制出 2,137 行 `卷二十-v11-勘误前-1124k170.md`） | 占全仓体积 **52.1%**（467 MB），git 本身就是版本快照系统，在工作树手工复制 1,495 份整卷副本是极度浪费且让 grep 瘫痪的坏规矩（后续同时废除“勘误复制整卷快照”规矩，改记前一个 commit SHA） |
| `docs/世界设计/`（20 主文件 + `AI/` 7 文件，919 KB） | **保留**（世界内容真相源）+ **归档**（3 个过程文件） | **保留**：`00-世界内容总清单与现状对照.md` 至 `14-历史传说与玩家来历.md`、`命名与古神方案.md`、`AI/AI-00`–`AI-05`。<br>**归档至 `archive/docs-world-process/`**：`_AI现状盘点.md`、`_brief.md`、`实施日程.md`、`待决清单.md`、`AI/AI-06-现状、缺口与排期.md`（过期排期与过程状态） | 五文化圈、神灵、风俗、妖怪生态的核心创意来源，是 `design_spec` 出处的合法指向目标 |
| `docs/架构设计/`（27 文件，1.34 MB） | **保留**（核心 4 份）+ **归档**（23 份） | **保留**：`01-世界本体.md`、`02-不变量.md`、`03-分层与玩法包.md`、`13-超自然与文化圈.md`（短且与北极星高度一致，含 K1–K4 三档尊重防线）。<br>**归档至 `archive/docs-arch-legacy/`**：其余 23 份（`04`–`12`、`14`–`15`、`修订记录.md` 147 KB、`数值平衡调研.md` 150 KB、`标杆标准.md`、`差距清单.md`、`目标架构.md`、`附录A` 等——规则细则已被 `docs/统一底层设计/` 替代或属 10 月旧体系） | 保留高密度原则层 4 份，移出 23 份历史重叠架构文档，防代理在“架构设计 vs 统一底层设计”两套口径间打架 |
| `docs/派活卡头规矩.md`（141 行，19 KB） | **重写**（旧版先归档 `archive/docs-governance/`） | 重写为 ≤50 行的精简版：删掉第三节 9 项长文本自查表与第五节 4 字空话正则，只保留北极星 4 条、硬红线与新三闸（物理分支隔离 + 模型族互异 + CI 实证） | 现行 141 行与旧自查表直接制造了五卡批量假勾和 5 连补档提交（`diagnosis-1124.md` 二.6） |
| `docs/PLAN.md`、`docs/PLAN_已完成.md`、`docs/当前状态.md`、`docs/问题.md` | **重写**（3 份）+ **归档**（`当前状态.md`、`PLAN_已完成.md`） | **`docs/当前状态.md`（61.8 KB）**：**归档**至 `archive/docs-status/当前状态-至1124.md`，原路径删除/取代为 CI 自动生成的 ≤80 行 **`docs/状态快照.generated.md`**；<br>**`docs/PLAN.md`（46 KB）**：旧内容整体归档至 `archive/docs-status/PLAN-旧骨架-至1124.md`，**重写**为精简的新骨架竖切片排期（不含“当前在做”手工流水账）；<br>**`docs/PLAN_已完成.md`**：**归档**至 `archive/docs-status/`；<br>**`docs/问题.md`（239 KB / 1,020 行）**：混杂 10 月 A3/S2c/M4R/U15 僵尸记录（`:12-60`），旧全文归档至 `archive/docs-status/问题-至1124.md`，**重写**为仅保留新骨架未闭合阻断项的精简表 | `当前状态.md` 日期倒置、含 69 处 `F:/dnd-` 路径与死链 `修理卡拆分工期-1122.md`；`PLAN.md:58-63` 停在块 4；`问题.md` 80% 为 10 月旧引擎遗留，持续污染压缩重启的代理 |
| `docs/审查/`（1,554 文件，29 MB） | **归档**至 `archive/docs-reviews/` + **新建单一真相源** | 含 `李白裁定-1117.md`（280 KB，改 84 次，新旧互盖）与 1,553 份历史只核/复核/清单。<br>**例外（保留/新建在 `docs/审查/`）**：仅新建 **`docs/审查/现行有效裁定.json`**（只存仍生效裁定，废止即删，附 commit），历史 `李白裁定-1117.md` 冻结移入 `archive/docs-reviews/` | 29 MB / 1,554 个历史审查件放默认目录让全文搜索瘫痪；84 次追加的流水裁定必然让失忆代理读到已推翻旧条 |
| `docs/卡档案/`（17 目录 / 83 文件，498 KB） | **归档**至 `archive/docs-card-archives-legacy/` | `ds-c0-*`、`ds-c1-time`、`ds-c3-ledger`–`ds-c7-misc`、`ds-j1`–`ds-j4` 等旧骨架卡档案；原目录清空留给新骨架极简卡元数据 | 区分旧骨架与新骨架交付记录 |
| `docs/卡回报/`（127 文件，1.2 MB） | **归档**至 `archive/docs-card-reports/`（可改删，建议先归档） | 全部 127 份已被 `派活卡头规矩.md:54` 废止的旧卡回报 | 与 `docs/卡档案/` 并列极易误导，门禁禁止再向 `docs/卡回报/` 写入 |
| `docs/门禁说明/`（3 文件，65 KB） | **保留**（1）+ **归档**（2） | **保留**：`DeepSeek温度分档.md`；<br>**归档至 `archive/docs-governance/`**：`提交门禁-C0.md`（49.5 KB）、`合并门禁-档案反思.md`（13.8 KB，自认 16 条盲区） | 旧门禁说明随 C0 猫鼠 AST 与长文本反思表一起退场，新门禁由 `.github/workflows/ci.yml` 与脚本自带文档取代 |
| `docs/研究/`（74 文件，1.33 MB） | **归档**（70 文件）+ **改后保留**（4 份关键拍板参考） | **改后保留（标为“参考背景，以现行卷文与 `现行有效裁定.json` 为准”）**：`地理格子世界方案与迁移计划-1119.md`、`世界地理建模附表-1122.md`、`世界设计完整方案-1122.md`、`文化圈隔断方案-1124.md`。<br>**归档至 `archive/docs-research/`**：其余 70 文件（含 `偏离清查-1122*` 55 文件、`公共部件审查-*`、`地理三维化-G1G2G3-1119.md` 已搁置、`总登记表总纲-1122.md`、`人类物种出处-1122.md`、`行为/离屏/位面/长任务` 等历史研究） | 移出旧骨架偏离清查与已搁置方案，保留 4 份直接关系九省地理与世界结构的设计底稿 |
| `docs/迁移体检/`（17 文件，591 KB） | **归档**至 `archive/docs-migration-checks/` | `块1`–`块6`、`格子G1-G5`/`G6-G11`/`G12-G16` 规矩检查对照等 17 文件 | 全为旧骨架按块/按格拆卡的过时对照表，新骨架按竖切片推进 |
| `docs/归档/`（29 文件，1.74 MB） | **归档合并**至 `archive/docs-old-archive/`（其中 1 MB `PLAN-历史-至1118.md` 可在点头后删除） | `PLAN-历史-至1118.md`（1.02 MB）、`PROGRESS.md`、`无限原野_开发指南v2.md`、`编造排查清单-1111.*`、`m26-*`/`m27-*` 等 | 统一收拢到仓根唯一归档目录 `archive/`，消灭 `docs/归档/` 与新归档两套并存 |
| `docs/probes/`（43 文件，1.11 MB） | **删除**（亮圳点头后，仅靠 git tag 留底） | `a1b/`、`daily/`、`run-001`–`run-011/`、`proposer.prompt.md`、`verifier.prompt.md` | 全部是 10 月旧底子 A3/run-001 探针日志，与新底子毫无关系 |
| `docs/` 顶层旧方案、旧底子 A3 残留与杂项（22 文件）+ 旧子目录（`内容审查/` 9、`设计/` 2、`统一底层调研/` 11、`参考/` 2、`妖怪志/` 3） | **删除**（A3 重复产物 8 文件，点头后）+ **归档**（其余） | **删除（亮圳点头后，git tag 留底，原已有 `snapshot-20261010`）**：`A3-交付物与试玩方案.md`、`A3-后续阶段登记.md`、`A3-接点归属.md`、`A3-退出审计.md`、`U15动词.md`、`actions.json`（310 KB）、`system-map.html`（319 KB）、`system-map.json`（630 KB）。<br>**归档至 `archive/docs-legacy/`**：`新底子方案-v0.md`、`新底子方案-§3.5建议.md`、`无限原野_开发指南v3.md`、`门禁提交流程重设方案.md`、`验证分层方案.md`、`骨架可核实事实设计.md`、`交接-1117.md`、`待办.md`、`待用户确认.md`、`决策.md`、`CHANGELOG.md`、`花费明细-1118.md`、`L4-必查清单.md`、`事件推演测试.md`、`承运与邮递.md`、`docs/内容审查/`、`docs/设计/`、`docs/统一底层调研/`。<br>**保留（移入 `docs/世界设计/参考资料/` 或归档备查）**：`docs/参考/`（2 文件）、`docs/妖怪志/`（3 文件，古籍妖怪核验资料，服务修仙世界内容） | 彻底清空 `docs/` 顶层噪音（29 个顶层杂乱文件压缩到仅 4 个现行真相源） |

### 2.6 根目录配置、脚本与其余顶层目录处置

| 路径 | 类别 | 代表文件与目录内例外 | 理由与仓库证据 |
|---|---|---|---|
| `CLAUDE.md`（61 行）与 `AGENTS.md`（65 行） | **重写并合并**（旧版先归档 `archive/docs-governance/`） | 重写 `CLAUDE.md` 为 **≤80 行唯一现行硬规则索引**（删除 `:9` 已废 `E-ACC-CARD-SELFCHECK`、删除 `:17-25` 与【裁定1124b】冲突的“派 Sonnet 会员子代理”旧条、删除全部 `（已过期）` 历史叠层）；`AGENTS.md` 瘦身为 ≤25 行（只保留红线/安全原创/`@CLAUDE.md` 指向，消灭两份文件互殴与 `AGENTS.md:34` 已被违背的手写 150 行状态要求） | 现行两文件相互冲突，刚合的 `4f5ddda87` 改了 `:16` 却留着 `:17` 反着说，失忆代理读一次偏一次 |
| `.githooks/`（3 文件：`pre-commit`、`commit-msg`、`pre-push`） | **改后保留** | 保留钩子挂载结构，精简为本地快速预检；真正合入裁判权移交新建的 **`.github/workflows/ci.yml`** + GitHub `master` 分支保护 | 解决本地钩子只查工作树、合并提交免查、可被环境漂移绕过的 16 条盲区（`docs/门禁说明/合并门禁-档案反思.md:69-83`） |
| `package.json`、`package-lock.json`、`.gitignore`、`.gitattributes` | **改后保留** | `package.json` 新增 `typescript` 到 `devDependencies`，补 `typecheck`（`tsc --noEmit --allowJs --checkJs`）、`test:e2e`、`test:all` 脚本；`.gitignore` 明确忽略烘焙缓存与本地临时产物 | 缺 `typescript` 致半数门禁沉睡；无 `npm ci` 远端 CI 致腾讯云缺 `acorn` 爆 26 败 |
| `使用说明.md`（11 行） | **重写** | 原文仍指向 `开发指南 v2` 和 4 个 `package.json` 里根本不存在的命令（`build:release`/`build:final`/`progress`/`test:baseline`） | 严重过时死指引，重写为新骨架的真实启动、测试与试玩说明 |
| `启动酒馆.cmd`、`启动酒馆.ps1`、`设置测试API.cmd`、`设置测试API.ps1` | **改后保留**（2）+ **归档**（2） | **归档至 `archive/legacy-sillytavern/`**：`启动酒馆.cmd`、`启动酒馆.ps1`（`:31` 硬打开旧 `play-town.html` 且耦合旧 `SillyTavern/public/.../infinite-fields`）；<br>**改后保留**：`设置测试API.cmd`、`设置测试API.ps1`（改掉 `:9` 过时的“无需将密钥发给 Codex”并按需支持同时设置 `DEEPSEEK_API_KEY` 与 `ANTHROPIC_API_KEY`，不打印不入库） | 区分亮圳本地旧酒馆启动脚本与新引擎无 AI 独立最小入口（若亮圳仍要双击玩旧酒馆，可明示保留在根但改名 `启动旧版酒馆.*`） |
| `assets/`（105 文件，24.78 MB） | **保留** | `LICENSES.md`、`audio/LICENSE.txt`、`fonts/`（3 套开源中文字体 24.8 MB）、`visual/backgrounds/`（80 张 SVG）、`visual/crests/`（14 张 SVG）、`logo.*`、`manifest.json` | 完整开源授权的纯静态美术字体资产，可直接给新骨架无 AI 极简菜单前端复用，零耦合 |
| `prompt/`（6 文件，7.1 KB） | **归档**至 `archive/legacy-prompt/` | `constitution.md`、`style.md`、`world-primer.md`、`examples.md`、`first-message.md`、`cliches.json` | 全仓代码引用为 **0**，属旧版 LLM 叙述提示词；块 6 无 AI 闭环不依赖，留作未来块 7 AI 叙述层参考 |
| `schemas/`（8 文件，381 KB） | **归档**至 `archive/legacy-schemas/` | `world.schema.json`（264 KB）、`action.schema.json`（84 KB）、`ontology.schema.json`（28 KB）等 8 份 | 全仓 `server-plugin/` 与 `tools/` 引用全为 **0**，属旧底子 JSON Schema，与新维度表体系脱节，留在根路径误导代理 |
| `logs/`（21 文件，535 KB） | **删除**（亮圳点头后，仅靠 git tag 留底；保留空目录或 `.gitignore` 忽略运行日志） | `logs/arch/`（7 文件：astra/fable/opus 旧提案）、`logs/sessions/`（13 文件：A3/S2C/S5/PR02 旧会话日志） | 全为 10 月历史讨论与旧会话输出，不应长期躺在 git 工作树里（运行期覆盖率报告统一改写到忽略目录） |
| `跑团资料/`（10 文件，134 KB） | **归档**至 `archive/legacy-sillytavern/跑团资料/` | `无限原野世界书.json`、`无限原野主持人.json`、`中文跑团预设.json`、`战役入口.json`、`无限原野扩展/*`（`core.js`/`index.js`/`seed.json` 等） | `server-plugin/` 引用为 **0**，属旧版 SillyTavern 扩展与角色卡，移出根目录避免与新底子混淆 |

---
## 三、工作区整理步骤（供李白与主会话照做；亮圳点头前绝不先删）

> **铁律（点头前不删）**：删文件属于亮圳保留的审批闸门。在亮圳对下方第 4 步「待点头删除清单」明确点头之前，李白与主会话**只做清单核对、打只读留底 tag、编写可复演搬家/归档脚本、在独立整理分支 `chore/workspace-cleanup` 上完成归档搬迁与 PR 预演**，绝不在本地或远端执行 `git rm` 删除任何旧文件，也不提前合并进 `master`。

### 3.1 分步执行顺序（含对在途卡的打断节点）

#### Step 0：冻结旧队列、清点在途卡、打只读留底标签（**本步即打断所有旧骨架在途卡**）
- **打断说明**：**本步是唯一且必须的打断节点**。此刻（`ae71f231e`，刚合完 C1）立刻停止排期和派发 C8、C9、C10、C11、挡块 6 旧 77 条以及任何基于旧 `server-plugin/kernel/` 的功能/勘误卡。
- **在途卡处置**：
  1. 扫描主会话开发机全部本地 worktree（`git worktree list` 与 `F:/dnd-wt/*`）及未合并远端分支（如 `origin/ds/b2w3`、11 月初 `t-*` 旧分支）。
  2. 尚未写完或尚未合入的旧骨架卡（如若 C8–C11 已有草稿）一律停止继续投入 API/会员额度；若其中存在独立纯算法改动，仅运行 `git diff > patch` 保存到归档分支或待搬清单，日后作为零件按第 1.3 节 6 闸重新审核，**严禁再往旧 `master` 硬合**。
- **打留底标签**：在当前基线 `ae71f231e` 上打不可变只读标签 `pre-rewrite-20261124` 并推送标签到 `origin`（只增标签、不改历史）。从此以后，810 MB 的历史版本快照与草稿已永久封存在 git 对象库里。
- **验收标准**：
  ```bash
  git tag -l pre-rewrite-20261124 && git rev-parse pre-rewrite-20261124
  # 期望：输出 ae71f231e839142703eba0cf631e1230646ce68e；且主会话无运行中的旧骨架写码子进程
  ```

#### Step 1：先立防回潮门禁与远端 CI（先筑新墙，再拆旧屋）
在整理分支 `chore/workspace-cleanup` 上先行落地机械防线，确保后续搬迁不会出现新死链或倒灌：
1. 在 `package.json` 的 `devDependencies` 加入 `typescript`，同步更新 `package-lock.json`，补齐 `npm run typecheck`（`tsc --noEmit --allowJs --checkJs`）。
2. 新建 `.github/workflows/ci.yml`：干净 Linux 容器执行 `npm ci` → `npm run typecheck` → 门禁全检 → `node --test` 全量单测（含后续 `tests/e2e/`）。
3. 落地三项新机械校验脚本（挂入 `tools/accept/run.mjs` 与 CI）：
   - **禁引用已归档/已废弃路径检查**（`tools/accept/detectors/archive_ref.mjs`）：扫描 `server-plugin/`、`tools/`、`CLAUDE.md`、`AGENTS.md`、`docs/`（不含 `archive/`），凡出现 `archive/`（除显式白名单数据转换器注释/输入参数外）、`docs/卡回报/`、`E-ACC-CARD-SELFCHECK`、`F:/dnd-` 本地绝对路径、或仓库内断链 Markdown 路径，一律非 0 报错。
   - **三方模型族硬校验**：改造 `tools/accept/lib/card-archive.mjs`，解析并归一化三方 `模型` 字段为模型族（`deepseek` / `claude-haiku` / `claude-sonnet` / `claude-opus` / `gemini`），三方族名不全异即拒。
   - **统一派卡脚本 `tools/dispatch/dispatch.mjs`**：删除 `compose-card.mjs:12` 硬编码旧尾巴，统一处理 DeepSeek 与 `claude -p`（修复 `ANTHROPIC_API_KEY` 环境变量口径，强制注入 `--max-budget-usd 0.65` 将单次 API 费用锁在 ¥5 红线内，自动核对 `needs` 闭包与三方模型族）。
4. 收编仓库外 `F:/dnd-tmp/check-push-archive.mjs`、`F:/dnd-tools/cloud/sync.sh`、`F:/dnd-tools/notify/` 的无密钥版本进 `tools/`，彻底消灭外部未版本化依赖。
- **验收标准**：
  ```bash
  npm ci && npx tsc --version
  node tools/accept/run.mjs pre_commit
  grep -rnE "docs/卡回报/|E-ACC-CARD-SELFCHECK|F:/dnd-" tools/dispatch/ CLAUDE.md AGENTS.md || true
  # 期望：grep 命中数为 0；向 compose/dispatch 故意写入 E-ACC-CARD-SELFCHECK 时一致性单测必红
  ```

#### Step 2：建立单一真相源文件（仍不删旧文件）
在 `chore/workspace-cleanup` 上生成并锁定新工作区的全部真相源：
1. 新建 `docs/审查/现行有效裁定.json`：从 `docs/审查/李白裁定-1117.md` 中只抽取**至今仍然生效且未被推翻**的裁定条目（含【裁定1124b】、格子世界 B、K1–K4、不缩九省规模、不为旧存档兼容等），每条带 `id`、`summary`、`commit`、`status: "active"`；后续推翻即直接从该 JSON 删除，不再堆叠历史流水。
2. 新建 `tools/gen-status-snapshot.mjs`，自动产出 ≤80 行的 `docs/状态快照.generated.md`（来源 `git log -n 10` + `entry-registry.json` 接通率 + `baseline.json` 计数 + CI 状态），并在 CI 检查其与代码状态一致、禁止手改。
3. 新建 `world/ontology/contracts.json`：集中登记跨卷共享枚举、签名与校验时机（先收口诊断中互撕的 5 处契约：`time` 提交后推进、`checkVolumeCells` 归开局绑种子、`tissueFractions` 过滤 `null` 视图、聚落住区亚区、出处分 `literature`/`design_spec`）。
4. 编写新版 `CLAUDE.md`（≤80 行，彻底清掉 `:17-25` 与【裁定1124b】冲突的旧分工）、新版 `AGENTS.md`（≤25 行）、新版 `docs/派活卡头规矩.md`（≤50 行）、新版 `docs/PLAN.md`（仅列新骨架竖切片队列）与新版 `docs/问题.md`（仅列未闭合阻断项），以及新版 `使用说明.md`。
- **验收标准**：
  ```bash
  wc -l CLAUDE.md AGENTS.md docs/派活卡头规矩.md docs/状态快照.generated.md
  # 期望：CLAUDE.md ≤80 行，AGENTS.md ≤25 行，派活卡头规矩.md ≤50 行，状态快照.generated.md ≤80 行
  node -e "JSON.parse(require('fs').readFileSync('docs/审查/现行有效裁定.json','utf8')); JSON.parse(require('fs').readFileSync('world/ontology/contracts.json','utf8')); console.log('JSON OK')"
  ```

#### Step 3：执行归档搬迁（只用 `git mv`，不删除，不越亮圳审批线）
按第二章全部标为「归档」的条目编写幂等脚本 `tools/cleanup/archive-move.sh`（先在分支执行，不碰删除项）：
- 将过时文档移至 `archive/docs-*`（`docs/当前状态.md`、`docs/PLAN_已完成.md`、`docs/卡回报/`、`docs/卡档案/`、`docs/审查/` 除新建 JSON 外全部、`docs/研究/` 70 份历史研究、`docs/迁移体检/`、`docs/归档/`、`docs/门禁说明/` 旧 2 份、`docs/架构设计/` 23 份旧稿、`docs/统一底层设计/` 下草稿/收尾待办/素材包/脚本、`docs/` 顶层 15 份旧方案与 `内容审查/`/`设计/`/`统一底层调研/`）。
- 将无加载器旧世界数据与资产移至 `archive/legacy-*`（`world/ontology/` 8 个旧表 + `slots/`、`world/meta/`、`world/law/`、`world/ecology/`、`world/actions/`、`world/art/`、`world/audio/`、`world/templates/`、`prompt/`、`schemas/`、`跑团资料/`、`启动酒馆.*`）。
- 将旧 `tests/kernel/`（保留首批 5 个 L0 纯零件单测除外）、`tests/acceptance/` 与旧 `tests/accept/bypass/` 冗余项移至 `archive/legacy-tests/`。
- 将旧 `server-plugin/` 中待重写与待逐件降级搬入的业务代码移至只读零件仓 `archive/legacy-server/`（详见 Step 5）。
- **验收标准**：
  ```bash
  ls docs/ | sort
  # 期望默认 docs/ 顶层仅剩：PLAN.md、产品原则.md、问题.md、派活卡头规矩.md、状态快照.generated.md，以及子目录 世界设计/、统一底层设计/、架构设计/、审查/、卡档案/、门禁说明/、研究/（仅 4 份参考）
  node tools/accept/run.mjs pre_commit
  # 期望：断链与禁引用 archive/ 门禁全部通过（零误引用）
  ```

#### Step 4：向亮圳提交「待点头删除清单」→ 点头后执行删除
在 Step 3 整理 PR 预演绿灯后，由李白把下面这份**精确到路径与体积的删除清单**一次报给亮圳点头（**未点头前，脚本 `tools/cleanup/delete-approved.sh` 只提交不执行，或相关文件保留在分支内**）：

| 待亮圳点头删除路径 | 文件数 | 占磁盘体积 | 留底方式 | 删除理由 |
|---|---|---|---|---|
| `docs/统一底层设计/版本快照/` | 1,495 | **467 MB** | git tag `pre-rewrite-20261124` 永久留底（不进 `archive/`） | 占全仓 52%，git 本身即版本快照，工作树存 1,495 份整卷副本严重拖垮搜索与代理 |
| `world/drafts/` | 7,937 | **343 MB** | git tag `pre-rewrite-20261124` 永久留底（不进 `archive/`） | 占全仓 38%，10 月旧草稿，全仓代码引用为 0 |
| `world/design/` | 147 | 2.9 MB | git tag `pre-rewrite-20261124` 留底 | 旧 A3/W1–W5 一次性批审批脚本，全仓引用为 0 |
| `docs/probes/` | 43 | 1.1 MB | git tag `pre-rewrite-20261124` 留底 | 旧 A3/run-001 探针日志，与新底子无关 |
| `docs/A3-*`（4 文件）、`docs/U15动词.md`、`docs/actions.json`、`docs/system-map.{html,json}` | 8 | 1.3 MB | git tag `snapshot-20261010` + `pre-rewrite-20261124` 双留底 | 10 月旧底子 A3/U15 残留产物，自注已过时 |
| `logs/`（`logs/arch/` + `logs/sessions/`） | 21 | 535 KB | git tag `pre-rewrite-20261124` 留底 | 10 月旧会话日志与 arch 提案，不应进 git 工作树 |
| `world/ontology/verbs.json`、`world/ontology/holdings.json` | 2 | 38 KB | 先抽 1 页未落词条对照进 `archive/legacy-ontology/迁移对照.md`，再删（+ git tag 留底） | 生产与测试加载引用为 0（Z-1 实证），已被 `_vocab.json` 替代 |
| `tools/accept/lib/card-selfcheck.mjs`、`tests/accept/card-selfcheck.test.mjs` | 2 | 14 KB | git tag `pre-rewrite-20261124` 留底 | 已废除的 9 项长文本正则自查表 |
| **合计** | **9,655** | **~815.9 MB** | 100% 留存于不可变 git tag | 工作树从 **896 MB / 12,879 文件**瘦身至 **< 65 MB / < 1,200 默认工作文件** |

- **点头后验收标准**：
  ```bash
  du -sh --exclude=.git --exclude=node_modules .
  # 期望：总工作树体积 < 80 MB（含 24.8 MB assets/ 字体与 archive/）
  test ! -e docs/统一底层设计/版本快照 && test ! -e world/drafts && test ! -e docs/probes && echo "DELETE OK"
  ```

#### Step 5：新骨架目录就位 + 重置锁定基线 + 落零 mock 烟测红灯桩
1. 确认新 `server-plugin/` 默认编译目录只留：
   - `server-plugin/kernel/`：仅放首批保留的 6 个纯 L0 算法零件 + 新骨架接口桩（受 `kernel/files.json` ≤15 文件硬白名单保护）；
   - `server-plugin/rules/`：空领域包目录（后续按竖切片过 6 闸逐件迁入或重写）；
   - `server-plugin/gate/`、`server-plugin/output-gate/`、`server-plugin/textcore/`；
   - `server-plugin/index.mjs`、`server-plugin/systems.mjs`（新骨架入口桩）。
2. 重置 `tools/accept/baseline.json`（全行 `locked: true`，新骨架所有目录违例数强制 **0**），清零 `scanclasses.json` 整文件豁免，重置 `tools/accept/entry-registry.json` 只登新骨架已落入口（删除 349 条 `file: null` 旧债务壳）。
3. 落盘 `tests/e2e/vertical-slice-smoke.test.mjs`（作为新骨架开工后的唯一北极星红灯验收标尺，明确标注“整理完此时预期为红，首个竖切片完成时必须转绿”）。
- **验收标准**：
  ```bash
  node -e "const fs=require('fs'); const f=JSON.parse(fs.readFileSync('server-plugin/kernel/files.json','utf8')); if(f.length>15) process.exit(1); console.log('L0 files:', f.length);"
  node -e "const fs=require('fs'); const b=JSON.parse(fs.readFileSync('tools/accept/baseline.json','utf8')); const unlocked=(b.entries||[]).filter(x=>!x.locked); if(unlocked.length) process.exit(1); console.log('Baseline locked OK');"
  ```

#### Step 6：独立顾问复审闸门（开工前硬停靠点）
整理分支 `chore/workspace-cleanup` 提 PR 后，**不得直接开写新功能卡**。必须先由独立顾问（Gemini 4 Neon）按上述 Step 0–Step 5 验收命令与目录清单做一次整仓复审：
- 核对默认路径无残留旧文档/旧本体/死链；
- 核对 `CLAUDE.md`/`dispatch.mjs`/`ci.yml`/`card-archive.mjs` 四者口径一致、无自相矛盾；
- 核对 `master` 已开启 GitHub 分支保护（PR + CI 全绿方可合并）。
复审通过、整理 PR 合入 `master` 后，正式进入新骨架竖切片开发。

---

### 3.2 整理后的新目录结构与「六份单一真相源」

整理完毕后，主会话与子代理在**默认阅读/编译路径**中只能看到干净结构；一切历史资料全在 `archive/`（受 `.gitignore`/门禁隔离，默认不读、不编译、禁被生产代码引用）：

```text
repo/
├── .github/workflows/ci.yml        # 唯一合并裁判：npm ci + tsc + 门禁 + 全量测试
├── .githooks/                      # 本地快速预检（防浪费 CI）
├── CLAUDE.md                       # [真相源②] ≤80 行唯一现行硬规矩
├── AGENTS.md                       # [真相源②附属] ≤25 行红线与安全边界，@CLAUDE.md
├── package.json / package-lock.json# 锁定 acorn + typescript 等全部依赖
├── 使用说明.md                      # 新骨架真实启动与试玩说明
├── 设置测试API.{cmd,ps1}            # 环境变量助手（不入库密钥）
├── server-plugin/                  # 唯一生产代码编译路径
│   ├── index.mjs                   # 唯一插件装配入口
│   ├── systems.mjs                 # 按清单校验装配完整性
│   ├── kernel/                     # 纯 L0 无领域内核（白名单硬上限 ≤15 文件）
│   │   ├── files.json              # L0 冻结白名单
│   │   ├── handles/                # 键串与句柄
│   │   ├── load/                   # 插件化加载器（不再静态 import 领域）
│   │   ├── transport/              # 路由能力、回复通道、菜单入口
│   │   └── validate/               # 仅纯类型与通用维度校验
│   ├── rules/                      # 全部领域玩法包（地理/物品/生物/经济/文化/神灵/生成）
│   ├── gate/                       # 屏蔽词闸
│   ├── output-gate/                # 出口投影与脱敏闸
│   └── textcore/                   # 文本摘要与标签底座
├── world/                          # 仅留现行加载数据与明确作者源
│   ├── ontology/                   # contracts.json [真相源⑤] + primitives/named-structs/state-owners + dimensions/
│   ├── rules/                      # registry.json + tables/
│   ├── geo/                        # 九省 31 郡作者地理源
│   ├── people/                     # 人物与家户作者源
│   ├── lore/                       # 五文化圈、神灵、势力、传闻源（优先桥接）
│   ├── i18n/                       # 标签、屏蔽词、大小写折叠
│   └── actions/                    # （重写）新底子动作表，进 loadWorld 强校验
├── assets/                         # 字体、SVG 背景与徽章（纯静态复用）
├── tools/                          # 全部工具统一版本化入库（零仓库外 F:/dnd-* 漂浮脚本）
│   ├── accept/                     # 瘦身门禁 + 锁定 baseline.json + entry-registry.json [真相源⑤]
│   ├── dispatch/                   # 唯一派卡入口 dispatch.mjs + sampling.json
│   ├── cloud/                      # 无密钥腾讯云自动开关机与长测脚本
│   ├── notify/                     # 无密钥结构化通知脚本
│   └── cleanup/                    # 整理搬迁与验证脚本
├── tests/
│   ├── kernel/                     # 随保留零件与新 L0 同步维护的行为单测
│   ├── accept/                     # 门禁与派卡一致性单测
│   ├── acceptance/                 # 仅新骨架独立出题分支产出的黑盒验收测试
│   ├── e2e/                        # 零 mock 端到端闭环烟测（CI 必过）
│   └── cloud/                      # 腾讯云全规模与性能红线基准
├── docs/                           # 默认阅读路径极度干净（顶层仅 5 文件）
│   ├── 产品原则.md                  # [真相源①] 北极星
│   ├── 状态快照.generated.md        # [真相源④] CI 自动生成 ≤80 行，禁止手写
│   ├── PLAN.md                     # 新骨架竖切片排期（无手工流水账）
│   ├── 问题.md                      # 仅未闭合阻断项
│   ├── 派活卡头规矩.md              # ≤50 行精简硬规矩
│   ├── 审查/现行有效裁定.json       # [真相源③] 仅存生效裁定，废止即删
│   ├── 卡档案/                     # 仅存新骨架精简卡档案
│   ├── 门禁说明/DeepSeek温度分档.md # 现行温度分档说明
│   ├── 架构设计/                   # 仅 4 份原则层（01/02/03/13）
│   ├── 世界设计/                   # [真相源⑥-内容] 五文化圈、神灵、风俗、妖怪（含参考/妖怪志）
│   ├── 统一底层设计/                # [真相源⑥-规则] 仅现行 29 卷 + 卷零 + 正式台账（0 快照、0 脚本）
│   └── 研究/                       # 仅 4 份九省地理/世界/文化圈核心参考底稿
└── archive/                        # 物理隔离归档仓（CI 禁止生产代码与现行文档引用）
    ├── legacy-server/              # 旧 server-plugin 零件只读仓（过 6 闸才可迁回）
    ├── legacy-ontology/            # 旧 8 张无加载器本体 + slots/ + 迁移对照
    ├── legacy-world-data/          # 旧 world/meta、law、ecology
    ├── legacy-actions/             # 旧 world/actions
    ├── legacy-world-ui/            # 旧 art、audio、templates
    ├── legacy-tests/               # 旧 kernel/acceptance/bypass 测试
    ├── legacy-tools/               # 旧派卡与冗余检测器
    ├── legacy-prompt/              # 旧 LLM 提示词
    ├── legacy-schemas/             # 旧 JSON Schema
    ├── legacy-sillytavern/         # 旧酒馆启动脚本与跑团资料
    └── docs-*/                     # 全部历史状态、审查、卡回报、研究、体检、旧架构归档
```

**全仓唯一六份单一真相源（防失忆强制锚点）**：

| 编号 | 真相源路径 | 唯一管什么 | 为何忘做/做错时会自动拦住（不靠 AI 记忆） |
|---|---|---|---|
| ① | `docs/产品原则.md` | 产品北极星与不可动摇底线 | 仅 29 行，作为主会话启动必读 3 文件之首，审卡必对照 |
| ② | `CLAUDE.md`（≤80 行）+ `docs/派活卡头规矩.md`（≤50 行） | 唯一现行开发/派卡/模型分工规矩 | `tests/accept/dispatch-consistency.test.mjs` 断言 `CLAUDE.md` 与 `dispatch.mjs` 一致且不含已废术语，改一漏一 CI 必红 |
| ③ | `docs/审查/现行有效裁定.json` | 全部仍然生效的拍板裁定（废止即删） | JSON Schema 校验强结构化，历史 280 KB 流水裁定已移出 `docs/`，代理默认读不到被推翻旧条 |
| ④ | `docs/状态快照.generated.md`（≤80 行） | 项目当前进度、已合 PR、CI 与接入率 | CI 自动生成并校验无手工篡改，彻底消灭 62 KB 日期错乱手写流水账 |
| ⑤ | `world/ontology/contracts.json` + `tools/accept/entry-registry.json` | 跨卷共享契约与生产入口唯一登记表 | `dispatch.mjs` 派卡前校验 `needs` 闭包，`import_edge.mjs` 与 `loadWorld` 启动强校验，漏登即构建/启动失败 |
| ⑥ | `docs/统一底层设计/`（29 卷现行正文）+ `docs/世界设计/` | 规则公式与世界文化设定 | 旧版 1,495 份快照已删除、草稿/素材/旧架构 23 份已归档，默认检索只命中唯一现行版本 |

### 3.3 防回潮机械锁（整理完后，如何保证失忆执行者不会把工作区重新搞脏）

1. **禁止往旧路径回写**：`tools/accept/detectors/archive_ref.mjs` 挂进 `pre_commit` 和 GitHub CI——任何 PR 若新增 `docs/卡回报/*`、`docs/当前状态.md`、`docs/统一底层设计/版本快照/*`、`world/drafts/*`、或在新代码中引用 `archive/`，CI 直接非 0 阻断。
2. **禁止 `CLAUDE.md` 与 `docs/状态快照.generated.md` 再度膨胀**：CI 增加行数上限检查（`CLAUDE.md ≤ 100 行`、`派活卡头规矩.md ≤ 60 行`），且禁止在 `CLAUDE.md` 中出现“（已过期）”“取代下条”等叠层字样——想改规矩必须直接替换旧行，逼迫单一真相源保持干净。
3. **禁止勘误再复制整卷快照**：废除“勘误前复制整卷 `.md` 到 `版本快照/`”的旧规矩，勘误记录只记前一个 commit SHA；若 PR 新增超 500 KB 的 `.md` 快照副本，CI 直接拒收。
4. **禁止未过 6 闸偷搬零件**：`server-plugin/kernel/files.json` 白名单上限 15 文件、`baseline.json` 全行 `locked: true`、`tsc --checkJs` 零报错、入口可达性图检查四重锁死；任何“顺手把旧 `place.mjs` 拷回来”的捷径都会在提交瞬间被机器拦死。

---

## 四、新规矩全文（整份替换 `repo/CLAUDE.md`）与设计说明

> **使用方式**：下方 4.1 节「以下为拟替换全文」代码块内的文本（共 34 行，远低于 80 行上限）可直接整份覆盖现行 `repo/CLAUDE.md`；现行 `repo/AGENTS.md` 同步裁撤重叠段，仅保留安全/原创/红线并 `@CLAUDE.md`；4.2 节为设计说明与防失忆对照，**不进 `CLAUDE.md`**。

### 4.1 以下为拟替换全文（可直接整份覆盖 `repo/CLAUDE.md`）

```markdown
@AGENTS.md

# 无限原野：唯一现行规矩（<=80 行；禁止叠层与过期条款，改规矩直接替换旧行）

## 1. 启动只读 3 文件与六份单一真相源
- 每次启动或压缩后，只读 3 份文件：`docs/产品原则.md`、`CLAUDE.md`、`docs/状态快照.generated.md`（由 CI 生成，严禁手写）。
- 全仓唯一真相源：① 北极星 `docs/产品原则.md`；② 规矩 `CLAUDE.md` + `docs/派活卡头规矩.md`（<=50 行）；③ 生效裁定 `docs/审查/现行有效裁定.json`（废止即删，不追流水账）；④ 进度 `docs/状态快照.generated.md`；⑤ 契约与入口 `world/ontology/contracts.json` + `tools/accept/entry-registry.json`；⑥ 现行设计 `docs/统一底层设计/` + `docs/世界设计/`。
- `archive/` 为物理隔离历史仓：严禁生产代码与现行文档引用，严禁往 `docs/卡回报/`、`docs/当前状态.md`、`docs/统一底层设计/版本快照/`、`world/drafts/` 回写文件。

## 2. 北极星与落地红线（无特例）
- 守北极星四句：九省 31 郡全规模真实差异世界；规则引擎唯一真相；不依赖 AI 可完整游玩；有 AI 接得住无穷想法。
- **不准硬编码红线**：数值、规则、种类放数据表，禁止按 ID/名字/场景写特例，已有公共部件必须调用。出处由加载器机械分两档：`literature`（现实物理/材料/天文）与 `design_spec`（奇幻/修仙/文化刻度，校验指向仓库设计册或生效裁定号），不再用现实论文卡死世界内容。
- **确定性边界**：区分“权威状态（进 `saveDigest`）”与“确定性可重建索引/烘焙层（不进 `saveDigest`，可一键重建并验一致）”。不为旧存档做兼容，但 `saveDigest` 拆为 `engineRulesDigest` 与 `dataPacksDigest`（支持只增内容包）。
- **L0 内核红线**：`server-plugin/kernel/` 只留无领域语义底座（`kernel/files.json` 硬上限 <=15 文件），一切地理/物品/生物/经济/文化/生成代码一律进 `server-plugin/rules/`。

## 3. 模型、额度与三方硬分离（亮圳【裁定1124b】+ Z-5）
- **主会话只调度**：主会话（模型自选，走 Claude Ultra 会员额）只负责拆竖切片卡、调用派卡脚本、解冲突与 PR 最终审阅合入；**严禁把会员额度花在写码、出题、审卡、测试分析等任何子任务上**。
- **子任务全走 API 唯一入口**：所有写码、出题、审卡、测试分析必须经 `tools/dispatch/dispatch.mjs` 调用 **DeepSeek API（只许 `deepseek-flash`，严禁 `v4-pro`）** 或 **Claude API（`claude -p` / SDK，读环境变量 `ANTHROPIC_API_KEY`）**。单次 API 调用强制 `--max-budget-usd 0.65`（锁在单项 5 元红线内），并输出调用收据随 PR 校验。
- **默认三方组合**：写码 `deepseek-flash`，出题 `claude-haiku` API，审卡普通卡 `claude-sonnet` API / 跨卷内核难卡 `claude-opus` API；三方归一化**模型族**必须完全不同，由 `card-archive.mjs` 与 CI 硬核（不再只核标识串）。
- **物理隔离验收目录**：出题只在独立分支 `test/<card>` 写 `tests/acceptance/<card>/`，写码分支 `feat/<card>` 物理不含验收目录；写码提交触碰验收目录 CI 直接拒合。
- **无免复核逃生门**：凡审卡判「必须改」，修改轮必须经干净无历史上下文的第三方 API 复核 + CI 全绿，取消「两轮后主会话亲读免复核」。

## 4. 立卡、搬零件与合入五条硬门槛（任一条不过 CI 拒合）
1. **必须接真实玩家入口**：禁止无生产消费者的孤岛卡。新导出入口须在 `server-plugin/index.mjs` 可达依赖图内至少有 1 处非测试调用者，`dispatch.mjs` 派前核 `needs` 闭包无悬空 `file: null`。
2. **零 mock 端到端冒烟必过**：`tests/e2e/vertical-slice-smoke.test.mjs` 必须从真实 `index.mjs#init` 启动，完整走通“开局 -> `state.created` 写 `ref` -> 真实菜单动作 -> `submitProposal` 事务与日志 -> `postCommit` 推进时间 -> 存槽读档 `replay_apply` 验 `saveDigest` 逐字节一致”，严禁测试私自 mock 顶替。
3. **远端 CI 与静态类型必绿**：GitHub `master` 开分支保护，唯一合入闸门是 `.github/workflows/ci.yml`（干净容器 `npm ci` -> `npx tsc --noEmit --allowJs --checkJs` -> 导出级默认拒绝 `import_edge` -> L0 白名单冻结 -> 锁定 `baseline.json` 违例零净增 -> 禁顶层状态 `WeakMap` 与禁加载器外直查 `idIndex.get` -> 禁引用 `archive/` -> 全量单测）；取消合并提交免查。
4. **旧零件搬入 6 闸**：从 `archive/legacy-server/` 搬回旧代码必须一次全过“分层归属、tsc 零错、零黑户/零私有缓存、基线违例 0 且零整文件豁免、真实生产消费者可达、干净容器行为单测绿灯”，否则重写。
5. **过程纪律**：不改测试降门槛、不用 `--no-verify`、不 force-push、不改写历史、勘误不复制整卷快照（只记前一个 commit SHA）。

## 5. 测试机、花费闸门、安全与通知
- **运行位置**：本机只跑几秒内纯函数/单测；常规全量走 GitHub Actions；推进世界长测与九省性能基准走腾讯云 `dnd-runner`（经 `tools/cloud/` 自动开机 -> `npm ci` -> 测 -> 自动关机），不在本机抢跑长测。
- **亮圳审批闸门**：**单项花费 > 5 元、删文件/云资源、充值、拓权、放宽硬规则**，必须先停下报亮圳同意；<= 5 元常规操作与技术管理决策由李白自定。
- **安全与原创**：不打印、不提交任何密钥，不读 `SillyTavern/data/*/secrets.json`；不复制《再生勇士》正文/人名/地名/情节（受 `world/i18n/blocklist.zh.json` 拦截）；未成年 NPC 不进亲密情节。
- **通知（只 3 种 JSON，经 `tools/notify/` 发李白）**：`MILESTONE`（竖切片合入含 PR/CI/试玩链接）、`BLOCKED`（冲突文件:行 + 两种备选与代价）、`COST_OR_CLOUD`（云机/花费/审批闸门）。取消 `/compact` 核对通知，取消手写状态汇报。
```

### 4.2 以下为说明，不进 `CLAUDE.md`

#### （一）与现行 `CLAUDE.md`（61 行）、`AGENTS.md`（65 行）、`docs/派活卡头规矩.md`（141 行）的留废对照

| 现行旧条款与位置 | 处置结论 | 原因与仓库证据 |
|---|---|---|
| `CLAUDE.md:17-25`（“写代码默认由主会话派 Sonnet 子代理包卡”、“审核省额度 1123：Sonnet 子代理统筹”） | **彻底废除** | 与最新提交 `4f5ddda87`（`CLAUDE.md:16` 亮圳【裁定1124b】会员只给主会话调度）直接互殴，留着必误导失忆主会话继续用会员子代理 |
| `CLAUDE.md:9`（`E-ACC-CARD-SELFCHECK`）与 `派活卡头规矩.md` 第三节/第五节（9 项长文本自查表 + 4 字空话正则） | **彻底废除** | 制造了 5 张卡集体假勾（`ds-c0-fix8`/`fix9`/`c3`/`c5`/`c6`）和 5 连补档提交（`diagnosis-1124.md` 二.6），却放过 C5 偷看测试与同模型自审 |
| `CLAUDE.md:58`（“两轮后的小改由主会话亲读 diff 放行免复核”） | **彻底废除** | `ds/c5-material` 第二轮查出“把卷文读反”后改完竟撤掉第三方复核（`docs/卡档案/ds-c5-material/审查.md:45,54`），在最危险一跳拆掉安全网 |
| `CLAUDE.md:42,45`（硬编码 `D:/Anaconda/python.exe`、`F:/dnd-tools/`、`F:/dnd-tmp/`）与 `AGENTS.md:34`（“覆盖写 ≤150 行 `当前状态.md`”） | **彻底废除** | 69 处仓库外路径无法版本化与 CI 验证；`当前状态.md` 已烂成 61.8 KB 日期倒置毒文档 |
| `CLAUDE.md:57`（“勘误追加勘误前快照”） | **彻底废除** | 在工作树制造 1,495 个文件 / **467 MB** 垃圾副本（`ae71f231e` 改 5 行带出 2,137 行快照），改记前一个 commit SHA 即可零成本溯源 |
| `CLAUDE.md:47`（禁 `node -e`/`sed -i`/heredoc 等长串命令禁令） | **下沉移出 `CLAUDE.md`** | 记过栏贴满 20+ 次无害读命令误触（`docs/PLAN.md:87-107,230`），对代码质量 0 贡献却白耗大量上下文；工具权限直接由 `dispatch.mjs` 传入 `--allowedTools` 白名单在 CLI 层控制 |
| 北极星 4 句、不准硬编码红线、不为旧存档做兼容、单项 >5 元/删资源报亮圳、长测在腾讯云、主会话自选模型、安全与原创红线 | **保留并机械化** | 对齐 `COLLAB.md` 第一节亮圳硬偏好；同时明确修正“现实文献出处卡死奇幻/文化”与“禁确定性可重建索引/烘焙层”两处有害教条（见第一章 1.2 节） |

#### （二）执行者遗忘/变蠢时，新规矩为何不靠 AI 记忆也能生效（机械防绕开表）

| 失忆或偷懒可能触发的违规 | 自动拦住的机械关卡 | 诚实评估剩余缺口与补强 |
|---|---|---|
| 主会话忘了【裁定1124b】，习惯性用会员额度拉起内置子代理写码或审卡 | `tools/dispatch/dispatch.mjs` 每次调用 DeepSeek / `claude -p` 时把调用元数据（模型族、时间戳、token、费用、prompt/diff 哈希）写入 PR 随附的 `.dispatch-receipt.json`；**GitHub CI 与 `card-archive.mjs` 校验 PR 必须带三方有效收据且均走 API 端点**，缺失即拒合 | **必须直说的宿主层缺口**：若主会话的 Claude Code 客户端仍开放内置写码 `Agent` 工具，失忆主会话可能在发 PR 前先浪费会员额再被 CI 拦。**补强**：在亮圳/主会话启动参数或 `.claude/settings.json` 中收窄主会话内置子代理权限，只允许主会话经 Bash 调用 `node tools/dispatch/dispatch.mjs`，从入口断绝误耗会员额 |
| 子任务调用 Claude API 单次超 5 元红线 | `dispatch.mjs` 对所有 `claude -p` 调用硬编码传入 `--max-budget-usd 0.65`（约 ¥4.7），超限由 CLI 强制中止并非 0 退出；超 5 元必须人工确认后显式传 `--approved-budget` 并登记裁定号 | 不靠人估算 token，CLI 自己断电 |
| 写码、出题、审卡混用同一模型族（如两个 Sonnet 会话） | `dispatch.mjs` 派前即校验模型族互异，不异直接拒绝生成任务；`card-archive.mjs` 与 CI 再次独立核验三方归一化模型族 | 双重机器核验，无法靠换标识字符串糊弄 |
| 写码方偷看或改验收测试 | 出题测试只在 `test/<card>` 分支，写码分支 `feat/<card>` 工作区里根本不存在 `tests/acceptance/<card>/`；CI 校验 `feat/<card>` 提交若触碰 `tests/acceptance/` 直接红灯 | 物理不存在文件，彻底根除 C5 式违规 |
| 交付无生产消费者的孤岛卡、或删/mock 冒烟测试 | CI 跑入口可达性脚本（断言新导出从 `index.mjs` 可达）+ 跑零 mock `tests/e2e/vertical-slice-smoke.test.mjs` + 跑 `tsc --checkJs` + 查 `baseline.json` 零净增 | 孤岛卡和假绿测试在 GitHub Merge 按钮前被直接锁死 |
| 在 `CLAUDE.md` 里继续叠历史规矩、或回写旧路径 | CI 检查 `CLAUDE.md <= 100 行`、`派活卡头规矩.md <= 60 行`、禁出现“已过期/取代下条/docs/卡回报/E-ACC-CARD-SELFCHECK/F:/dnd-”及禁引用 `archive/` | 文档与脚本脱节立刻红灯 |

---
## 五、重新开写的顺序（整理与顾问复审为硬门闩 → 最小闭环 → 后续扩展）

> **硬顺序红线**：① **整理工作区（第三章 Step 0–Step 5）必须排在任何新写码之前**；② **「整理完后由独立顾问 Gemini 复审通过并合入 `master`」是开写第一张卡的硬门闩**——复审不通过，严禁派发 S1-1；③ 任何旧代码未通过第 1.3 节 6 条机械准入闸，严禁从 `archive/legacy-server/` 搬回。

### 5.1 阶段 0：整理工作区与顾问复审（硬门闩）

- **阶段 0A（工作区整理，Step 0–Step 5）**：
  - 目标：冻结旧队列、打 `pre-rewrite-20261124` 标签、落地 `.github/workflows/ci.yml` + `tsc` + 新门禁与 `dispatch.mjs`、建立 6 份单一真相源、归档旧文件、获亮圳点头后执行 816 MB 删除清单、清出新 `server-plugin/` 骨架空仓与红灯 E2E 烟测桩。
  - 执行：主会话调度 + DeepSeek flash 写搬家与门禁脚本 + Claude Sonnet API 审脚本 + 李白把删除清单报亮圳点头。
  - 完成标准：第三章 Step 0–Step 5 所有命令行验收全通过，整理 PR 在 GitHub CI 绿灯（仅新 E2E 红灯桩按 `todo`/阶段标记待 S1-3 转绿，或设独立 job 观测）。
- **阶段 0B（Gemini 复审硬门闩）**：
  - 目标：独立顾问（Gemini 4 Neon）逐条核验第七章复审勾选清单，确认默认路径干净、门禁/CI 实效而非纸面文章、无残留投毒脚本或假整理。
  - 完成标准：Gemini 给出明确「复审通过」结论 → 整理 PR 合入 `master` → 开启 GitHub `master` 分支保护 → **门闩解锁，允许开工 S1-1**。

### 5.2 阶段 1：最小闭环竖切片（4 张强衔接卡，串行优先，零孤岛）

| 步骤 | 目标与解决的根因 | 依赖 | 搬入的旧零件（须过 6 闸）与重写文件 | 完成标准（机械命令 / 试玩现象） | 执行分工（全走 API，主会话只调度） |
|---|---|---|---|---|---|
| **S1-1：新 L0 核心底座与启动强断言** | 建立 ≤15 文件的无领域语义 `kernel/`，一次性解除三大死锁：① `storage.mjs`/`dimensions.mjs`/`handles/keys.mjs` 全切 `kindOfEntity(state, id)`，消灭 `state.created` 黑户；② `memo.mjs` 改为按顶层状态键切片失活；③ `transaction.mjs`+`scheduler.mjs` 支持 `postCommit.advanceMinutes` 解除 `time` 死锁；④ `load/world.mjs` 改插件注册口 `registerDomainValidator`、`mount.mjs` 补启动完整性强断言（`saveEnv`/`unitOfPath`/`modifierSource`/`derived-process` 缺一即拒启动） | 阶段 0B 复审通过并合入 `master` | **原样保留入 `kernel/`（6）**：`bytes.mjs`、`clone.mjs`、`det-math.mjs`、`errors.mjs`、`named-structs.mjs`、`named-struct-match.mjs`。<br>**改后保留入 `kernel/`**：`error-codes.mjs`（清 417 僵尸码）、`rx.mjs`（修显式 `null`）、`sample.mjs`、`vocab.mjs`、`events.mjs`、`ledger.mjs`、`declare.mjs`、`subscribers.mjs`、`report.mjs`、`advance-registry.mjs`、`handles/*`（修 `keys.mjs`）、`load/` 7 工具文件、`validate/` 3 通用文件（补 `literature`/`design_spec` 分级）。<br>**重写（9）**：`storage.mjs`、`dimensions.mjs`、`memo.mjs`、`transaction.mjs`、`scheduler.mjs`、`save.mjs`、`save-session.mjs`、`mount.mjs`、`load/world.mjs`、`load/state-owners.mjs`、`kernel/files.json`（≤15 行） | ① `npx tsc --noEmit --allowJs --checkJs` 0 错；<br>② `kernel/files.json` ≤15 文件且 `baseline.json` 违例 0；<br>③ 回归单测：`state.created` 新建实体后 `writePath(ref)` 写入成功且 `dim()`/`modified()` 可读；<br>④ 负向单测：注释掉 `saveEnv`/`modifierSource`/`unitOfPath` 任一项，`mountKernel` 必抛错；<br>⑤ `postCommit.advanceMinutes` 单测：无嵌套事务且 `replay_apply` 后 `saveDigest` 逐字节一致 | 主会话调度；DeepSeek flash 搬迁纯零件与机械适配；Claude Sonnet API 写核心骨架契约；Claude Haiku API 独立分支出黑盒测试；**Claude Opus API** 审卡（内核难卡）；GitHub CI 自动全检 |
| **S1-2：真实开局 + 最小领域包 + `submitProposal`/`time` 闭环** | 接通真实开局落盘与最小可玩规则集，修掉第二物种 `null` 键死锁，补齐确定性可重建烘焙层雏形（避免开档 68 s 气候首读） | S1-1 合入 `master` 且 CI 绿 | **重写**：`world-create.mjs`（删裸导 `runTransaction`，改经 `submitProposal` + `LogBook` 落盘）、`primitives-runtime.mjs`（读加载器注入 `primitives.json` 删硬抄 `CATALOG`，实现 `postCommit.advanceMinutes`）、`systems.mjs`（核 `state-owners.json#systems` 完整性）、精简可重建烘焙版 `rules/place-core.mjs`（绝不搬 1,740 行 `place.mjs` 泥球）。<br>**从 `archive/legacy-server/` 改后过 6 闸降级搬入 `rules/`**：`calendar.mjs`、`species.mjs`、`body.mjs`（修 `:172` 过滤 `null` 键）、`death.mjs`（修 `:77-79` 过滤 `null` 键）、`life.mjs`、`position.mjs`、`opening-people.mjs`（去裸导 `KernelError`） | ① 真实开局测试：从 `world/geo/`+`world/people/`+`world/ontology/dimensions/` 创建河湾试玩区开局成功且加载 `< 3 s`；<br>② 第二物种回归单测：加载带 `null` 组织键的第二物种走通 `body.mjs`/`death.mjs` 绿灯；<br>③ 真实活局提案测试：经 `submitProposal` 执行“新建实体写 `ref` + 耗时 30 分钟”动作，状态落盘 + `LogBook` 增事件 + 时钟推进 30 分钟；<br>④ GitHub CI 全绿且入口可达图无孤岛 | 主会话调度；DeepSeek flash 写搬迁、去裸导与 `null` 键修补；Claude Haiku API 出题；Claude Sonnet API 审卡（若改跨卷契约升级 Opus API）；GitHub CI 全检 |
| **S1-3：最小菜单动作表 + 真实入口 + 存档四路路由 + 零 mock E2E 烟测转绿** | 彻底打通玩家无 AI 后端全链路：菜单动作不再全拒、存档不再 `save_unavailable`/`E-SAVE-SHARD-UNCOVERED`、**零 mock E2E 烟测首次转绿并锁死为后续所有 PR 的不可退回底线** | S1-2 合入 `master` 且 CI 绿 | **重写**：`world/actions/` 最小动作集（观察周围、移动、创建/交互物品、休息推进时间、存槽/读档，纳入 `loadWorld` 强校验）、`kernel/transport/menu-entry.mjs`（接入 `submitProposal` 与 `output-gate`）、`server-plugin/index.mjs`（真实注入 `saveEnv`、`registerUnitOfPath`、最小 `modifierSource` 与全部路由）。<br>**过 6 闸搬入**：`textcore/`（保留）、`gate/`（补 `E-NAME-BLOCKLIST` 实抛）、`output-gate/`（接真实回包）、`router-caps.mjs`、`reply-channel.mjs` | ① `node --test tests/e2e/vertical-slice-smoke.test.mjs` **零 mock 全绿**（真实 `index.mjs#init(router)` 启动 → 新开局 → 新建实体写 `ref` → HTTP POST 发真实菜单动作 → 事务落盘+日志+推进时间 → `saveAction` 存槽 → `loadSlot` + `replay_apply` 验 `saveDigest` 逐字节一致）；<br>② 拔掉 `index.mjs` 里任一接线，烟测必红；<br>③ 腾讯云 `dnd-runner` 跑一次 `tests/cloud/real-world-load.test.mjs` 实测耗时/内存后自动关机（预估费用 ¥1–¥2 < ¥5） | 主会话调度；DeepSeek flash 写动作表与路由接线；Claude Haiku API 写黑盒与 E2E 验收；Claude Sonnet API 审卡；李白触发 `tools/cloud/` 腾讯云实跑并核关机 |
| **S1-4：极简无 AI 浏览器菜单前端（可点开试玩交付物）** | 让亮圳在浏览器直接点开真玩一局，不依赖旧版 SillyTavern 扩展或任何 LLM | S1-3 合入 `master` 且 E2E 绿 | **原样复用**：`assets/`（开源字体与 94 张 SVG 静态挂载）。<br>**新建（极简无框架 HTML/ESM）**：`client/index.html` + `client/app.mjs`（由 `index.mjs` 托管静态路由），呈现地点/时间/人物/文化圈标签、点击执行真实菜单动作、查看事件日志、点击存槽/读档 | ① CI 自动跑 `playwright-core` 无头浏览器冒烟：打开页面 → 点「新开局」→ 点至少 2 个动作看时间与世界状态变化 → 点「存档」→ 刷新点「读档」验证状态一致、0 控制台报错；<br>② 本地一行命令 `npm start` 打开 `http://127.0.0.1:8080/`，亮圳 10 秒内可亲自试玩 | 主会话调度；DeepSeek flash 写静态前端与路由；Claude Haiku API 写 Playwright 黑盒测试；Claude Sonnet API 审卡；GitHub CI 跑 Playwright 冒烟 |

### 5.3 阶段 2：最小闭环绿灯后的扩展顺序（11-30 之后，每步仍须保持 E2E 全绿）

1. **S2-1（五文化圈、神灵与尊重三档桥接）**：将 `world/lore/` 的 `cultures.json`、`deities.json`、`faith.json` 接入维度表与 `place.json` 省郡行，激活 `E-DEITY-CAP` 与 `E-NAME-BLOCKLIST` 加载拦截，打通“引擎 + 文化内容”两张皮。
2. **S2-2（九省 31 郡空间烘焙、聚落三层树与涉水移动）**：落地郡级静态海拔/气候烘焙产物（首读 `< 3 s`）、恢复“营地→住区→私宅”三层树、按 6 闸搬入 `route-grid.mjs` 与空间衍生索引（20 人泡展开 `< 100 ms`）、补齐河湾村涉水/游泳规则，腾讯云 `tests/cloud/` 全绿。
3. **S2-3（日常经济与物品生态竖切片）**：按 6 闸改造并搬入 `item.mjs`（消 `:502-532` 静默跳过）、`item-lots.mjs`、`recipe.mjs`、`valuation.mjs`（消 `:282` 黑户拒算）、`demand.mjs`、`price.mjs`，接入菜单买卖/制作/腐坏闭环。
4. **S2-4（多物种生态、动态修正管线与法术超自然）**：点亮真实 `modifierSource` 与 `derived-process.json` 修正槽（伤病/情绪/法术/关系），迁入 `world/meta/monsters.json`、`spells.json`（走 `design_spec` 出处分级），兑现中西合璧修仙玩法。
5. **S2-5（可选 AI 理解与叙述层）**：在无 AI 全部核心玩法可玩后，挂载 `aiGate`（提议→规则引擎校验→结算→叙述），按需参考 `archive/legacy-prompt/` 重写提示栈，实现“有 AI 接得住无穷想法”且不越权写状态。

---

## 六、工期估算到硬期限 2026-11-30 20:00（伦敦时间）与实话建议

**时间锚点**：此刻为 **2026-11-24 15:45（伦敦时间）**，距离硬期限 **2026-11-30 20:00（伦敦时间）** 仅剩 **6 天 4 小时（148 小时）**。

### 6.1 能不能赶到？直说结论，不画饼

- **按旧口径（11-30 交「整理 + 重写 + 复审 + C8–C11/挡块 6 全清 + 九省 31 郡全玩法完整可玩」）**：**绝对赶不到（0% 概率）**。历史实测一张跨卷内核卡经三方开发、CI、两轮审卡需 0.5–1 天（`docs/PLAN.md:195`），仅工作区整理 + 亮圳点头 + Gemini 复审就会吃掉 **1–1.5 天**，剩余 4.5 天在物理上装不下几十张旧债卡和全量系统。
- **按修正口径（11-30 20:00 交「干净工作区 + Gemini 复审通过 + 远端 CI 绿灯 + 新 L0 极简骨架 + 零 mock 最小闭环 + 浏览器真能点开玩的无 AI 菜单版，且已解锁第二物种与五文化圈入口」）**：**紧绷但可达成（实测可行率约 65%–75%）**，前提是满足三个硬条件：① 今天立刻停掉 C8–C11 旧队列；② 亮圳在 11-25 12:00 前对 816 MB 删除清单点头；③ 阶段 1 四张卡严禁中途加塞需求或重写大块旧经济/战斗。

### 6.2 逐日建议完成时点（全部为伦敦时间）

| 截止时点（伦敦时间） | 必须完成里程碑 | 关键风险与硬止损线 |
|---|---|---|
| **2026-11-24 22:00** | **Step 0–Step 3 完成**：旧队列冻结、打 `pre-rewrite-20261124` 标签；CI / `tsc` / `archive_ref` / `card-archive` 模型族校验 / `dispatch.mjs` 落分支；6 份单一真相源初稿与归档搬迁 PR 预演绿灯；**删除清单呈报亮圳** | 若今晚未发出删除清单，11-25 白天将白等亮圳点头，整条进度滑坡 1 天 |
| **2026-11-25 12:00** | **亮圳对删除清单点头 → Step 4–Step 5 完成**：执行 816 MB `git rm`、隔离旧 `server-plugin/` 到 `archive/legacy-server/`、锁定 `baseline.json`、落盘红灯 E2E 烟测桩，提交整理 PR 给 Gemini 复审 | **依赖人工节点**：亮圳未点头绝不先删，可先请 Gemini 预审 Step 1–3 与 Step 5 结构 |
| **2026-11-25 18:00（硬门闩，最晚 22:00 修完合入）** | **阶段 0B Gemini 复审通过**：整理 PR 合入 `master` 并开启 GitHub 分支保护 | **硬止损线**：若 11-25 22:00 前复审未过，**不要砍复审强行开工**，立刻如实报亮圳把 11-30 顺延 1–2 天 |
| **2026-11-26 22:00** | **S1-1 合入 `master`**：新 L0 极简内核底座（≤15 文件）、`state.created` 统一校验、切片 `memo`、`postCommit` 时间协议、启动强断言全部 CI 绿灯 | 本周最难一张卡（Opus API 审卡）；若卡在 `ledger.mjs` 迁入超过 4 小时，先仅接最小账本接口，复杂分账放 S2-3 |
| **2026-11-27 22:00** | **S1-2 合入 `master`**：真实开局、`primitives-runtime` 读 JSON + `time` 推进、`death`/`body` 修掉 `null` 键（第二物种绿灯）、精简烘焙版 `place-core` | 绝不试图在 S1-2 顺手搬 1,740 行 `place.mjs` 或 5,340 万格精细气候计算 |
| **2026-11-28 22:00** | **S1-3 合入 `master`**：最小 `world/actions/`、`menu-entry` 接通 `submitProposal`、`saveEnv`/`unitOfPath` 实装、**零 mock E2E 烟测首绿** + 腾讯云单次实测（≤¥2，自动关机） | 11-28 晚必须看到 E2E 首绿，这是“真闭环”还是“假进度”的分水岭 |
| **2026-11-29 20:00** | **S1-4 合入 `master`**：极简无 AI 浏览器菜单前端上线 + Playwright 无头 CI 冒烟全绿 | 前端不追求华丽排版，先复用 `assets/` 字体与 SVG 做到清晰可点、状态实时准确 |
| **2026-11-30 20:00（硬期限）** | **交付验收**：留 11-30 全天（12–20 小时缓冲）吸收返工轮、修复试玩瑕疵、请亮圳亲手打开浏览器试玩一局并验收 CI 绿灯链接 | 不得用“测试数量”顶替亮圳亲手点开能玩 |

### 6.3 赶到 11-30 会牺牲什么 & 建议怎么对亮圳直说

- **赶到 11-30 必须明确放掉的东西**（不放必炸）：
  1. 放弃旧骨架的 C8–C11 修理卡与旧挡块 6 的 77 条清账（旧骨架已经整体归档，修它纯属沉没成本）；
  2. 11-30 当天**不包含**复杂市场定价/经济循环、战斗/法术、AI 叙述层、以及九省 31 郡全量 5,340 万格精细气候演算（九省 31 郡数据结构和文化圈字段完整保留不缩水，但 11-30 试玩聚焦河湾试玩区最小闭环，复杂系统按阶段 2 在 12 月第 1–2 周叠加）。
- **建议李白直接对亮圳讲的口径（贴合亮圳偏好，直接给拍板项，不贩卖焦虑）**：
  > 痛快！按 Gemini 独立顾问刚出的重写指南，结论很直接：距 11-30 20:00 剩 6 天，先把 896 MB 烂工作区清理干净、过一次 Gemini 复审至少占 1.5 天，剩下 4.5 天不可能交出“九省全系统完备版”，但够交出「新 L0 极简骨架 + 远端 CI 保护 + 浏览器点开真能开局、点菜单动作、推进时间、存读档且复演逐字节一致的最小无 AI 可玩版」（同时保留九省 31 郡完整数据结构、解封第二物种与五文化圈入口）。旧队列 C8–C11 建议立刻停掉止损。现在需要你拍两件事：① 同意对 816 MB 零引用旧快照/旧草稿清单（历史全部先打 git tag `pre-rewrite-20261124` 永久留底）点头执行删除；② 确认 11-30 20:00 的交付标准收束为上面这个最小可玩闭环，复杂经济/战斗/AI 排在 12 月按竖切片往里加。另外建议同步批准把奇幻/文化数据的出处校验从“硬要现实论文”改为“指向仓库设计册”，并允许可重建烘焙索引，不然五文化圈和 5,340 万格在物理上落不了地。

---
## 七、整理完后给 Gemini 复审时必须检查的勾选清单（开工前硬门闩）

> **复审铁律**：以下任一标有 **`[一票否决]`** 的条目未过，复审一律判「不通过」，**禁止合入 `master`、禁止开写 S1-1**。所有检查必须以命令输出、文件原文、GitHub API/CI 实跑记录为准；凡主会话口头称“已做/已跑”而无仓库证据的，一律标「主会话自称，未核」并按未过处理。

### A. 留底标签、删除审批与默认目录干净度
- [ ] **A1 `[一票否决]` 不可变留底标签存在**：`git rev-parse pre-rewrite-20261124` 指向整理前旧基线 `ae71f231e`（或整理前最后 `master` SHA）且已推至 `origin`；无 force-push、无历史改写。
- [ ] **A2 `[一票否决]` 删除严格匹配亮圳点头范围**：核对 `git diff --diff-filter=D --stat pre-rewrite-20261124..HEAD`，确认被删文件 100% 落在亮圳明确点头的 8 类清单内（467 MB `版本快照/`、343 MB `world/drafts/`、`world/design/`、`docs/probes/`、8 份 A3/U15 顶层残留、`logs/`、`verbs.json`/`holdings.json`、`card-selfcheck.*`），无擅自多删，也无未删干净的超大残留；工作树体积（不含 `.git` 与 `node_modules`）实测 `< 80 MB`。
- [ ] **A3 `[一票否决]` `docs/` 顶层与默认阅读路径已清净**：`ls docs/` 顶层仅剩 5 个文件（`产品原则.md`、`状态快照.generated.md`、`PLAN.md`、`问题.md`、`派活卡头规矩.md`），旧 `当前状态.md`、`PLAN_已完成.md`、`docs/卡回报/`、`docs/迁移体检/`、`docs/归档/`、1,553 份旧审查、23 份旧架构、70 份旧研究、168 个写卷脚本与草稿已全部迁出至 `archive/`。
- [ ] **A4 `[一票否决]` `world/` 默认目录零死本体与零旧数据混放**：`world/ontology/` 下不再存在 10 张零加载器旧表（`slots/` 等 8 项在 `archive/legacy-ontology/`，`verbs.json`/`holdings.json` 已留迁移对照并删）；`world/meta/`、`world/law/`、`world/ecology/`、`world/actions/`（旧）、`world/art/`、`world/audio/`、`world/templates/`、`prompt/`、`schemas/`、`跑团资料/`、`启动酒馆.*` 全部已迁至 `archive/`。

### B. 六份单一真相源与零自相矛盾
- [ ] **B1 `[一票否决]` 新 `CLAUDE.md` 与 `AGENTS.md` 短而硬且零互殴**：实测 `wc -l CLAUDE.md <= 80`、`AGENTS.md <= 25`、`docs/派活卡头规矩.md <= 50`；全文 `grep -E "已过期|取代下条|Sonnet 子代理|E-ACC-CARD-SELFCHECK|docs/卡回报/|F:/dnd-"` 为 **0 命中**。
- [ ] **B2 `[一票否决]` 手写进度文档彻底消灭，改由脚本生成**：仓库内不存在 `docs/当前状态.md`；执行 `node tools/gen-status-snapshot.mjs --check` 通过，确认 `docs/状态快照.generated.md` `<= 80 行` 且内容与 `git log` / `entry-registry.json` 一致。
- [ ] **B3 `[一票否决]` 生效裁定与机器契约表有效**：`docs/审查/现行有效裁定.json` 与 `world/ontology/contracts.json` 均为合法 JSON；前者仅含仍生效裁定（含【裁定1124b】与亮圳刚拍板的 11-30 口径/出处分级/烘焙层裁定），无已推翻旧条；后者覆盖诊断指出的 5 处跨卷死锁契约；`docs/审查/` 下不再躺着 280 KB 的 `李白裁定-1117.md`。
- [ ] **B4 `docs/PLAN.md` 与 `docs/问题.md` 已脱胎换骨**：`PLAN.md` 仅列新骨架竖切片（S1-1 至 S1-4 及阶段 2），不含任何旧“块 4 / 4-4b / C8–C11”残留；`问题.md` 不含 10 月 A3/S2c/M4R/U15 僵尸记录；`使用说明.md` 不含不存在的 `build:release`/`开发指南 v2` 死指引。

### C. 新规矩已落地为门禁与远端 CI（不是只改了 Markdown）
- [ ] **C1 `[一票否决]` 远端 CI 实跑绿灯且 `master` 分支保护开启**：存在 `.github/workflows/ci.yml` 并在整理 PR 上已有至少一次真实 GitHub Actions 绿灯运行记录（干净容器 `npm ci` 含 `acorn` 与 `typescript`）；确认 GitHub 仓库设置已开启 `master` 分支保护（要求 PR + CI 必过、禁直接 push `master`、取消合并提交免查）。
- [ ] **C2 `[一票否决]` `tsc --checkJs` 与导出级默认拒绝实效验证**：`npx tsc --noEmit --allowJs --checkJs` 实跑返回 0；**负向破坏验证**（在审查或单测里确认）：故意往规则层加一句 `import { ... } from '../kernel/<private>.mjs'` 或往 `server-plugin/kernel/` 新建一个未登记 `.mjs` 文件，`node tools/accept/run.mjs pre_commit` 必须非 0 拒提。
- [ ] **C3 `[一票否决]` 三方模型族硬校验与物理隔离验证**：核查 `tools/accept/lib/card-archive.mjs` 代码及单测——故意传入“写码 `claude-sonnet` + 出题 `claude-haiku` + 审卡 `claude-sonnet`”（即便标识字符串不同），门禁必须非 0 拒收；故意在 `feat/` 写码分支改动 `tests/acceptance/`，CI 必须非 0 拒合；废除“两轮后主会话亲读免第三方复核”条款。
- [ ] **C4 `[一票否决]` 基线 100% 锁定且新骨架零债务**：检查 `tools/accept/baseline.json` 全部条目 `locked === true` 且新 `server-plugin/` 内违例数为 **0**；`scanclasses.json` 无整文件豁免；`tools/accept/detectors/archive_ref.mjs` 实测故意在生产代码或现行文档里写 `archive/`、`docs/卡回报/` 或断链 Markdown 时必报非 0。
- [ ] **C5 `[一票否决]` 防黑户与防私有缓存 AST 规则生效**：核查 `tools/accept/lib/ast-rules.mjs` 与单测——故意在 `kernel/memo.mjs` 外声明模块顶层 `new WeakMap()` 或在加载器外写 `registry().idIndex.get(...)`，`pre_commit` 必非 0 阻断。

### D. 派卡工具、【裁定1124b】防绕开与仓库外脚本收编
- [ ] **D1 `[一票否决]` 唯一派卡入口 `tools/dispatch/dispatch.mjs` 就位且彻底清除投毒尾巴**：`compose-card.mjs:12` 旧 `TAIL_BODY` 已不存在；`dispatch.mjs` 统一接管 DeepSeek（强制只允许 `deepseek-flash`）与 Claude API（`claude -p`，读 `ANTHROPIC_API_KEY`，不再错用 `CLAUDE_API_KEY`）；单次 API 调用硬传 `--max-budget-usd 0.65`；派前自动校验 `entry-registry.json` 的 `needs` 闭包与三方模型族互异。
- [ ] **D2 `[一票否决]` 主会话会员额度防误耗机械闭环**：`dispatch.mjs` 会产出含模型族/端点/费用/哈希的调用收据，CI/门禁校验 PR 必须附带三方有效 API 收据（主会话偷用会员内置子代理无收据必被拒）；核查主会话本地配置是否已收窄内置写码子代理权限（如未收窄，复审需显式标注剩余宿主风险并要求立改）。
- [ ] **D3 `[一票否决]` 零仓库外漂浮脚本与零密钥泄露**：全仓（不含 `archive/`）`grep -rnE "F:/dnd-|119\.45\.|sk-[A-Za-z0-9]|ANTHROPIC_API_KEY="` 为 **0 命中**（不含环境变量名声明）；`tools/cloud/`（含自动开机→`npm ci`→测试→自动关机）与 `tools/notify/` 已版本化入库且零硬编码 IP/密钥。

### E. 新骨架目录与最小闭环零件处置
- [ ] **E1 `[一票否决]` 新 `server-plugin/kernel/` 纯净且达标**：`server-plugin/kernel/files.json` 条目数 `<= 15`，逐文件核查确认无任何地理/物品/生物/气候/生成业务逻辑混入；原 108 文件大泥球与旧规则层已完整移入只读仓 `archive/legacy-server/`。
- [ ] **E2 `[一票否决]` 首批保留 L0 零件已过检查**：保留在 `server-plugin/kernel/` 的 6 个纯算法零件（`bytes.mjs`、`clone.mjs`、`det-math.mjs`、`errors.mjs`、`named-structs.mjs`、`named-struct-match.mjs`）均无 `baseline.json` 违例、过 `tsc --checkJs` 且对应 `tests/kernel/` 行为单测在 CI 全绿。
- [ ] **E3 `[一票否决]` 零 mock 端到端烟测桩真实有效**：审读 `tests/e2e/vertical-slice-smoke.test.mjs` 原文——确认它直接导入 `server-plugin/index.mjs#init`，覆盖“开局 → `state.created` 写 `ref` → 真实菜单动作 → `submitProposal` → `postCommit` 推进时间 → 存槽读档 `replay_apply` 验 `saveDigest`”，**零 mock 替换内部函数、零硬编码假通过**。

### F. 最大批判度专项防作弊核查（防“假整理”与“换皮搬砖”）
- [ ] **F1 `[一票否决]` 没用“换皮改名”偷渡旧泥球**：核查 `git status` 与新建/保留的 `server-plugin/rules/`——确认没有把 1,740 行 `place.mjs`、`kernel/load/world.mjs`、`world-create.mjs` 等未改造泥球换个文件名偷偷塞进 `rules/` 假装“已重写”。
- [ ] **F2 `[一票否决]` 没删弱门禁断言来换整理 PR 绿灯**：对比 `pre-rewrite-20261124..HEAD` 在 `tools/accept/` 与 `tests/accept/` 的 diff，确认保留下来的门禁测试没有为凑绿灯注释断言、放宽错误码或绕开检查。
- [ ] **F3 `[一票否决]` 物理隔离 `archive/` 确实脱离编译与测试 glob**：核查 `tsconfig.json`/`jsconfig.json`、`package.json` 测试脚本、`.github/workflows/ci.yml` 与 `tools/accept/run.mjs`，确认 `archive/` 既不被 `server-plugin/` 导入，也不被默认测试通配符误扫，但被 `archive_ref.mjs` 禁止反向引用。
- [ ] **F4 `[一票否决]` 旧在途队列已彻底停机**：核查远程分支与主会话回报，确认 C8–C11 与旧骨架 worktree 已全部封存停止，没有“一边整理一边在后台继续往旧分支烧额度”的暗流。
- [ ] **F5 亮圳两项关键拍板已落进 `现行有效裁定.json`**：确认亮圳已明确拍板（或给出替代决定）并入库：① 816 MB 删除清单点头记录；② 11-30 20:00 交付口径（最小闭环可玩）以及出处分级（`literature`/`design_spec`）与可重建烘焙层授权。
