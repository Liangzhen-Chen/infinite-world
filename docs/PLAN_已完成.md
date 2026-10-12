# 已完成任务卡原文

仅归档已完成卡，验收标准和来源不删；活动调度见PLAN/PROGRESS。以下完整卡原文按编号保存。

<a id="t01"></a>

### T01 已验证旧分支增量收尾

目标：保住旧成果，合入榆坡 4 人增量和送货付款前置，核对主线已有真实送货链。涉及文件：原两树提交涉及的 `world/design/w1-yupo-depth-next.mjs`、`tools/npc-depth*.mjs`、`tools/publish-w1-villages.mjs`、`tests/npc-depth-next.test.mjs`、`tests/playtests/npc_courier.json` 及对应人物候选；不另写主功能。

实现要点：以 `git diff --stat master...分支` 排除已合入 `4bf28de`；`70011af` 沿冻结 base/foundation 和审核指纹追加 4 人，榆坡达到 10/30；`e4abb2b` 明确两铜价格及付款授权。复用 `publishVillages` 的幂等及旧字段保护。送货复用 `npc-obligations.mjs`，真实路线、本人路费、固定交接地点、到期原因必须保留；不要按树名再实现送货。主会话选择性合入代码和内容，CHANGELOG 由主会话登记。

验收：`node --test tests/npc-depth.test.mjs tests/npc-depth-next.test.mjs tests/w1-village-profiles.test.mjs tests/w1-villages-publish.test.mjs tests/npc-obligations.test.mjs` 及 CORE 全过；送货脚本仍为 8–20 轮并通过离线前置核验。模型预算 0。不要做：新增人口、重写已经通过审核的正文、把旧真实失败标为已复测。依赖：无；原树无其他活动。并行：可与 T14/T20 并行，正式合入串行。

<a id="t02"></a>

### T02 四村产业、税贸账与治理权限

目标：四村档案不再以 null 代替用户要求的经济与权限资料，数字能由引擎读取并核对。涉及文件：`world/design/w1-village-profiles.mjs`、`world/geo/settlements.json`、`world/meta/rules.json`、对应 `world/drafts/w1/village-profiles/` 与 `world/drafts/w1/village-ledgers/`、`tools/w1-village-profiles-content.mjs`、`tools/population-validation.mjs`、`tools/publish-w1-villages.mjs`、`extension/tools.mjs`、`schemas/world.schema.json`，必要时 `server-plugin/agriculture.mjs`、`server-plugin/agriculture-migration.mjs`、`server-plugin/law.mjs`、`server-plugin/engine.mjs`；测试 `tests/w1-village-profiles.test.mjs`、新增 `tests/village-ledgers.test.mjs`。农事初始化适配仅服务开发世界/测试副本，不在本卡新增发布迁移或操作原存档。

实现要点：保留 `settlementProfiles[].details` 与已审核 problems/rumors/calendar；把 `economy` 从 `pending-ledger` 迁为有单位、周期、来源、期初期末的生产/库存/税/贸易记录。粮食复用 `rules.agriculture.settlements`、`state.settlements` 和 `advanceAgriculture` 的守恒，跨村贸易必须有两端同量记账，未发生的合同不得计为已收付。实际公共调用是 `world_field` 携带 `operation:'farm_settle_trade'`、`contract`、`phase:'pickup'|'deliver'`、`authority`；内部 `world_farm/settle_trade` 通过既有 `modelToolCall` 映射，不新增第 26 个公共工具。新经济明细由 world 数据提供，旧世界升级不重置耗尽库存或私人财产。治理复用 `rules.law.codes` 与 `law.mjs` 的 `authority` 在场检查，明示官员、执法区域、可执行事项和转交机构；普通协调者不得自动获搜查征税权。现有缺口断言改为验证新账及拒绝无权操作，保持原问题、传闻来源及秘密隔离。本卡只闭合四村登记粮约与税贸，不扩到全世界自动贸易。

验收：新定向测试覆盖每村年粮等式、税贸双方对账、期初/结算分离、无权拒绝、重复升级及重放；`node --test tests/village-ledgers.test.mjs tests/w1-village-profiles.test.mjs tests/w1-villages-publish.test.mjs tests/law.test.mjs`、CORE 通过。仅跑农业相关命名测试，不启动旧三年全批。事实变更走现有 `reviewProfiles`/`--review`，为本卡补显式候选目录/预算参数，4 村增量上限 1.2 元且计入 W1 20 元总账，L1/L2 无硬错、L4 完成后才写正式源。不要做：凭空补用户粮食、扩人口、全世界周贸易系统；后者归 R07。依赖：T01；并行：不能与其他引擎、规则、四村发布器改动并行。

<a id="t03"></a>

### T03 四村档案的引擎查询与真实检索

目标：引擎与 `world_search` 都能查到公开数值账、治理、地方问题、节俗和集日。涉及文件：`server-plugin/settlement-profile.mjs`、`server-plugin/catalog.mjs`、`server-plugin/retrieval.mjs` 及其索引构建调用点；`tests/w1-village-profiles.test.mjs`、`tests/catalog.test.mjs`、`tests/retrieval.test.mjs`。

实现要点：沿 `publicSettlement` 公共白名单、`settlementScene`、`catalogDefinition` 与 `MemoryIndex` 的现有检索入口；T02 数值显示单位与结算时点。地方问题每村至少 5 项且有两种以上解法，作者解法不作为 NPC 已同意。40 条有来源的传闻保存在权威档案，玩家检索只暴露已经合法获知的 claim/source；truth/fact、隐秘处、未授权解决方案不得进入公开索引。检索到日历不等于节日已举办，场景上限 6000 字符不变。

验收：上述 3 文件定向测试及 CORE 通过；四村均以自然中文关键词命中公开资料，未接触角色看不到传闻真相，query 不改世界。模型预算 0。不要做：自动让全村知道传闻、免费发库存、重做通用检索架构。依赖：T02；并行：可与 T04 单独验证器工作并行，不能与 T15 检索/审稿接口改动并行。

验收边界：本卡已能证明公共经济/权限自然检索与 truth 隔离；“把 claim 塞进聊天后能搜到”仅证明已有聊天可检索。真实证据为四村源 NPC 分别 10/9/9/9，共 37 人，knowledge/memorySeeds/authoredFacts 没有完整 claim，npcContext/scene 没有传闻入口；采用此结论，不再重查 37 人。玩家通过源人物实际听到传闻并进入长期检索的缺口归 T21，本卡完成不等于四村收尾完成。

<a id="t04"></a>

### T04 完整人物质量门槛与字段审计

目标：实现完整人物质量验证器和逐字段审计，为 T11 接入 `npm run build:release`/final 准备可验证门槛。涉及文件：`tools/npc-profile-validation.mjs`、`tools/npc-depth-content.mjs`、新增 `tools/audit-npc-depth.mjs`、新增 `tests/npc-depth-gate.test.mjs`；本卡不改 `tools/validate-world.mjs` 的正式发布入口，接入归 T11。

实现要点：在现有 `validateNpcProfiles` 所在模块新增独立的完整度验证入口，设计 T11 调用合同；现有引擎结构校验不变。`knowledge.known` 至少 3 条 `{fact,source,reliability}`，至少一条事实具体涉及另一个人物或地点；unknown 是具体待知事项；goals 各期限中的 content 与 steps[].content 不同；voice.register 不等于 habits[0]；memorySeeds 至少一条由本人和他人共享，knownBy 引用存在，另一完整档有同事件且事实兼容；relationships[].note 写具体来由。以可检验规则抓占位和重复，以审核抓语义，不能只用字符长度冒充具体性。L1 检查知识/人物设定里的主持人、玩家不能、不要让、禁止等规则措辞，并区分世界内真实禁令的事实陈述。审计 stdout 输出 id/field/reason，覆盖全部 full 档和已修 17 人 traits。

验收：新增门槛负例分别拒绝六类缺口、合法事实不误报，`node --test tests/npc-depth-gate.test.mjs tests/world-validation.test.mjs tests/npc-depth.test.mjs` 及 CORE 通过；`node tools/audit-npc-depth.mjs` 如实报出现有缺口。本卡只能记“验证器已实现”，正式构建门槛未接入，T11 才完成用户此项；这样既有发布器仍能处理在途审核补丁，不形成补内容之前禁止发布补内容的循环依赖。模型预算 0。不要做：降低 full 定义、把人降成名册以通过、成批改内容、删除旧测试。依赖：T01；并行：可与 T02/T03，文件边界不重叠。

<a id="t05"></a>

### T05 可复用的定点人物修订流水线

目标：后续按村准备 3–5 当事人小批，保留已有达标字段及审核证据，正式人物文件只由统一发布步骤写。涉及文件：`tools/npc-depth.mjs`、`tools/npc-depth-content.mjs`、`tools/npc-depth-review.mjs`、`tools/npc-depth-l4.mjs`，新增 `tools/publish-npc-depth.mjs`、`tests/npc-depth-pipeline.test.mjs`。本卡不改 T02 正在使用的 `tools/publish-w1-villages.mjs`，旧发布器对新补丁的兼容接入归 T11；不改 T04 验证器。

实现要点：复用 `depthEntries`、`contextFor`、`applyDepthDraft`、`verifyUnchanged`、`sourceFingerprint`、`runContentPipeline` 和 `readApprovedContent`；保留旧榆坡两批的原调用、五字段 `changedFields` 及已审核指纹，为新增批次实现按审计路径的修订合同。新增显式 `--design`、`--root`、`--budget-root`，发布器新增 `--manifest` 与预演/`--publish`，参数需 CLI 帮助和测试。新 design 冻结 before/baseHash、对应 `auditNpcDepth(...).issues` 的 id/field/code 及实际 patch 路径，字段范围从失败项推导，不能把任意顶层字段加入通用白名单。

准确白名单：六类深度字段之外，`findNpcRuleWording` 扫描的 `notes`、`familyNotes`、`description`、`personality`、`opinions`、`secrets`、`authoredFacts` 仅在对应叶子路径实际报 `rule-wording` 时允许修正；例如 `opinions.neighbors[0].view` 只改 view，保留 with 和其他邻居项。`knowledge`、`voice`、`relationships`、`memorySeeds`、`goals` 同样只修报错的具体项；条目缺失类 issue 才允许向该数组补足必要条目。保留已达标兄弟字段、数组成员及对象键，不允许删除、清空、改成 null 或减少数组来逃门槛。规则措辞改为已有来源支持的具体事实，不能用另一句“并非全知”代换。

仅措辞补丁允许没有 sharedEvent、memoryNarrative 或新记忆；当前 `verifyUnchanged` 强制 memorySeeds 加一只保留在旧两批合同，新批次按失败路径判断。旧记忆的 event 若自身报规则措辞，只改有问题的文字，保持 id、knownBy、地点、事实和其他历史内容；确有共享记忆缺口才补共享事件，优先选择同批存在相同缺口的当事人，不把一方秘密传播给另一方。冻结所有非失败字段、钱物、身份、年龄、技能、服务以及原 17 人 traits。L2 输入覆盖本次全部修订叶子，含 opinions/notes，不能仍只审共享记忆；同一补丁重跑零写入。候选全部在各自 world 目录，不并发写 baseline。

验收：`node --test tests/npc-depth-pipeline.test.mjs tests/npc-depth.test.mjs tests/npc-depth-next.test.mjs tests/w1-villages-publish.test.mjs` 及 CORE；prepare 不调用模型、过期指纹/篡改审核拒绝、旧两批仍可重发、不同村候选可独立准备。新增回归须证明：opinions-only 与 notes-only 修复不增记忆，未报错叶子和原 17 traits 改动被拒绝，删除/清空字段或数组成员被拒绝，L2 上下文确实含每个新修订项。模型预算 0。不要做：通用框架重构、重审无改动条目、重写已达标六类、写 PROGRESS。依赖：T01/T04；并行：T04 合入后可与 T02/T03 并行，严格不改旧四村发布器/验证器；完成后解锁 T06–T10。

<a id="t12"></a>

### T12 修复 M2 审核截断和引用失败

目标：现成会话证据能被完整逐 N 项审核，不靠重跑游戏来修评分器。涉及文件：`tools/npc-acceptance.mjs`、`tools/playtest-review.mjs`、新增 `tools/review-playtest-report.mjs`、`tests/npc-acceptance.test.mjs`、`tests/playtest-review.test.mjs`、`tests/playtest-npc-evidence.test.mjs`。

实现要点：保留 `reviewNpcRequirements` 的逐字 quote、合法回合和完整编号校验，按单个 N 项或有限窗口组织证据，避免一次整场 5000 token 输出截断；缺项、length、编造引文都失败，不用人工 true 代替。复用已保存 `sceneBeforeReply`、calls/assertions、N17 新增行动证据；新增 CLI `--input`、`--output`、`--budget` 只重评已存报告，不调用游戏工具、不覆盖旧失败原文。`reviewPlaytest` 的两回合分段保留完整性聚合。

验收：上述 3 测试及 CORE；mock 覆盖 length、错误引文、缺 N 项、重复 N 项，任何不完整均未通过；只读旧报告重评命令在 T17 才调用模型，本卡预算 0。不要做：放宽引文、删低分会话、重启已完成进程。依赖：T01；并行：可与人物候选，无重叠测试/工具时可与 T14。

已知恢复限制：已合入实现以 `logs/playtest-review-budget/<evidenceHash>.json.lock` 的 `wx` 排他创建保护预算，正常退出在 finally 删锁；强制终止可以遗留空锁，现有锁不带可核验的 PID/启动身份。保守判定为可人工恢复的已知限度，本次不新增自动解锁卡，也不宣称强杀后能安全自动恢复。重跑前主会话确认原运行进程及其后续任务确已结束、没有同证据哈希的其他重评；无法确认则不删锁。确认后仅移除该确切 `.lock`，保留同哈希预算 JSON、usage 日志及 spent/reserved，绝不清预算或仅凭文件年龄解锁；恢复客户端会将旧预留计入费用上界。原输出可能为空或不完整，保留并换新的输出文件名，同一份输入证据继续使用同哈希累计预算；不修改输入来换预算。若后续证据显示锁拥有者无法确认或无人值守反复被此阻断，再拆带身份核验和强杀回归的小卡。

<a id="t13"></a>

### T13 M2 真实前置与行动链修复

目标：修复最新失败里的私宅等候、推搡司法、燕麦购买与三人同场前置，保留 8–20 轮真实自然输入。涉及文件：`tests/playtests/npc_home_visit.json`、`npc_shove.json`、`npc_quest_social.json`、`npc_voices.json`、`npc_offscreen.json`、`tools/playtest-assertions.mjs`；必要的引擎缺陷限 `server-plugin/engine.mjs`、`law.mjs`、`agriculture.mjs`，相关单文件测试。

实现要点：依据最新失败回合定位实际服务时间、位置和物品可得路径；等待 60 分钟必须实际 60，乡巡链按真实在场权限走，燕麦只买到指定商品才继续条件委托。N12 三人同时在场可说话，从现有作息路径安排，不能直接移人；N17 使用离开十天窗口内新增结算行动。前置改变不能把“60 分钟”改成当前错误的 13 分钟，不能在玩家句里提示工具名。新增离线前置测试用真实引擎和现有工具路由，测试夹具不强制成功骰点。

验收：`node --test tests/playtest-runner.test.mjs tests/playtest-npc-evidence.test.mjs tests/npc-obligations.test.mjs tests/law.test.mjs`，改动农业时仅其对应命名测试，CORE；新增 `tests/m2-preconditions.test.mjs` 全部链路通，日志有实际位置/分钟/钱物证据。模型预算 0，真实复测统一 T17。不要做：虚构到货和库存、改断言掩盖失败、为每条叙述加新工具。依赖：T01/T03/T21；并行：不与 T02 或任何 engine/law/agriculture 改动并行，可与 T12。

<a id="t14"></a>

### T14 原送货树的 M3 语义耗时 WIP 收尾

目标：完成 `241552d` 的语义时间核验，区分“回放一致”与“符合玩家要求/行动耗时”。涉及文件：原 `F:/dnd-worktrees/npc-delivery` 的 `tools/m3-soak-timing.mjs`、`tools/m3-soak-adapter.mjs`、`tools/m3-soak-state.mjs`、`tests/m3-soak-timing.test.mjs`、`tests/m3-soak-adapter.test.mjs`。

实现要点：先核对 WIP 的导出及调用接口，只围绕已存在 semantic timing 变更补完；等待钟点、持续分钟、工具自身已计时、允许等待后交谈、尾注再次计时分别核验。语义时间证据绑定原输入和实际调用，不把重放前后时间差零作为语义通过；未确定样本记录 unknown，不能悄悄算零偏差。

验收：`node --test tests/m3-soak-timing.test.mjs tests/m3-soak-adapter.test.mjs tests/m3-soak.test.mjs`、CORE；60→13/36 和“六小时→六时辰”负例能够暴露，合法等待后明确交谈不误报，恢复后测量不重复。模型预算 0。不要做：启动 300 轮、再做送货机制、丢失原 WIP。依赖：无，原树已停止需重新确认；并行：可与 T01/T20。完成后由主会话合入并改 PROGRESS 状态。

<a id="t15"></a>

### T15 知情边界与离屏回忆的实际失败修复

目标：无关人物不泄漏私密任务，NPC 回忆与本次实际制作材料、次数、费用和成败吻合。涉及文件：`server-plugin/consistency-evidence.mjs`、`consistency-review.mjs`、`consistency-service.mjs`、`npc-cognition.mjs`、`npc-memory.mjs`，必要时 `extension/prompt.mjs`；`tests/m3-consistency-evidence.test.mjs`、`tests/m3-consistency-integration.test.mjs`、`tests/npc-cognition.test.mjs`。

实现要点：沿已有审稿专用 knowledge 和任务/历史许可摘要修最小缺口；实际 sceneBeforeReply 与来源事件成为证据，未知委托不因审稿看见就转发给说话人。阿砚回忆只使用 N17 当前离开窗口里的结算记录，材料和失败成本来自账本。仍最多一次纯文字改写，不再次执行交易；严重未修正仍阻止尾注，warning 仍保持需复核。

验收：上述定向测试、CORE；用保存失败原文形成回归，未知角色对话泄漏被拒绝/修正，允许的亲历或已合法转述不误报，改写不能改变账本。模型预算 0，真实验证在 T17。不要做：全知传播、在提示里禁止正常小动作、把 warning 视为通过。依赖：T01/T13；并行：不与同文件审稿/检索改动并行，可与 T14。

<a id="t16"></a>

### T16 M2 汇总门槛与选工具实测口径

目标：统一报告有效 N 覆盖、账本率、零泄漏和选错工具率，退出码与报告一致。涉及文件：`tools/playtest-metrics.mjs`、`tools/playtests.mjs`、`tools/npc-acceptance.mjs`、`tests/npc-acceptance.test.mjs`、`tests/playtest-runner.test.mjs`。

实现要点：复用 `summarizeNpcAcceptance` 的 measured/pass 与 N6/N16/N17 强制项，至少 12 个有效项、N 项通过率至少 90%、账本断言至少 90%，知情泄漏零失败且 N6/N16 均有完整证据。`toolSelectionMetrics` 保留 opportunities/missed/wrong 分母，枚举类别错误与参数/目标错误分开记录；工具全漏调用不是错类零风险。标注所有被测明确行动及条件前置，不用未标注样本冒充实测。N12 缺匿名盲辨仍失败。

验收：上述测试、`tests/playtest-npc-evidence.test.mjs`、CORE；mock 验证高账本率但泄漏/未测/N12缺样本仍失败，12 项联合门槛正确，opportunities=0 为未测。模型预算 0。不要做：调整现有门槛、丢弃失败样本、杜撰实测数字。依赖：T12/T13/T15；并行：不可与 T12 相同文件并行。

<a id="t20"></a>

### T20 原人物树的玩家账本面板 WIP 收尾

目标：完成 `035d792` 已有小块界面，不把它算成完整 M6。涉及文件：原 `F:/dnd-worktrees/npc-depth` 的 `extension/ledger-view.mjs`、`extension/runtime.js`、`extension/style.css`、`tools/deploy-engine.mjs` 打包清单，及 `tests/runtime.test.mjs`、`tests/history-window-integration.test.mjs`、`tests/m3-consistency-browser.test.mjs`。

实现要点：只收尾已存在的玩家可读账本投影，读引擎真实状态，正常面板不泄漏 raw JSON、未知 NPC 私密信息或调试字段。打包入口可改文件清单，不执行 activate/deploy。在隔离页面验证渲染、历史剪裁、审核提示与移动视口，沿现有 Playwright 测试设施截图。

验收：上述三个测试和 CORE，隔离页面 390×844 无横溢/控制台错，截图及浏览器验证报告归最新报告；模型预算 0。不要做：借此重做完整界面、动用户酒馆、启动图像或语音付费服务。依赖：无，确认原树已停止；并行：可与 T01/T14，不能与 extension/runtime 的其他卡并行。

<a id="t21"></a>

### T21 四村传闻从源人物到玩家获知的可达性

目标：40 条已有来源传闻能先进入 source/carriers 本人的未核实认知，再通过真实在场交谈让玩家获知，并由现有编年史/记忆索引检索。涉及文件：新增 `server-plugin/npc-rumors.mjs` 和 `tests/village-rumor-access.test.mjs`；接入 `server-plugin/npc-memory.mjs`、`server-plugin/scene-card.mjs`、`server-plugin/engine.mjs` 的 remember 分支、`server-plugin/chronicle.mjs`、`extension/tools.mjs`。本卡不改 T03 的 settlement-profile/catalog/retrieval/index 文件与测试，不改 T06–T10 的 world/design、world/drafts、baseline 或人物验证器；若发现非改这些文件不可，先回主会话调整所有权，不自行扩大范围。

实现要点：只读 `world.settlementProfiles[].details.rumors`，复用既有 `{id,claim,source,carriers,status,propagation}`；新增 helper 返回最小投影 `{id,claim,source,reliability:'未核实'}`，只给 source 或明确 carriers 本人，不把 witnesses 自动视为已听过 claim。动态投影单独放入 npcContext 的传闻字段，scene 按当前在场者及查询选择相关条目；每条 claim 可通过对应话题读到，不被 known 前 100/180 字截断永久遮蔽，场景仍不超过 6000 字符。该投影不改任何已达标的静态 knowledge/memorySeeds/opinions 叶子，不预先写 player 记忆，不把全村种子塞进自动传播的 memoryStream。`truth`、`fact`、verification、hiddenPlaces 和作者解法均不进入人物提示、工具返回、事件摘记或玩家搜索。

优先复用既有安全入口：当前 `WorldEngine.remember` 只验证自由文本，`shareNpcMemory` 要求收件人为完整 NPC；两者原样均不足以证明玩家合法获知。最小方案是在现有 `world_remember` 增加可选 `rumor` 引用，沿已有 subject/key/source/content 接入受校验分支，不新增公共工具。调用合同为 subject 指玩家、rumor 与 key 指同一登记传闻、source 指当前讲述者；content 只能与该人可讲的 claim 一致，实际回执与记忆文本从登记 claim 生成，不能相信模型传入的真相或篡改说法。该动作代表一次实际问询/讲述，校验玩家可行动、讲述者清醒在场、既有义务/活动允许交谈，并按现有会话计时约定结算一次；不能因两人仅同处一地就自动获知全部传闻。若执行者找到已有同时满足这些条件的安全调用，直接复用，说明证据，不再添加可选字段。

获知后记录的权威事实是“玩家在何时何地听到某人说 claim，尚未核实”，不是 claim 的内容为真。将该交谈产生的、仅说话人与玩家可见的确定性事件交给 `recordNpcMemories`/`collectChronicleFacts` 既有链，复用 `syncChronicleIndex` 和真实 `/search`；若用交谈 memoryStream，保留参与人、sourceEvent、sourceType 及未核实措辞，使事件摘记知道听说来源，不能仅把自由文本 `remember.content` 提升为 verified。去重依事件/传闻/讲述者与现有回放语义，重复调用不重复计时或新增同一获知；撤销/重生成、重启、导入导出后，获知与索引同步。新增事件不得被现有自动 NPC 传播当作向全村公开的许可，本卡不接完整传播路线/失真机制，仍归 R08/R09。

验收：`node --test tests/village-rumor-access.test.mjs tests/npc-memory.test.mjs tests/npc-cognition.test.mjs tests/chronicle.test.mjs tests/m3-retrieval.test.mjs` 及 CORE 全过，模型预算 0。新增测试覆盖全部 40 条源/携带者投影和非持有者隔离，并对各条登记 claim 通过受校验的实际引擎动作产生可追溯获知，不仅检查静态数组；每村至少一条经合法移动/等候接近人物→话题场景→真实工具路由交谈→Store 持久事件→真实 `/search` 的完整链。测试可用隔离世界/存档，不能向聊天、玩家记忆或 heard 记录直接塞 claim 代替交谈，也不能直接改 NPC 位置绕过到场。首次交谈前自然关键词搜不到未获知 claim，交谈后能搜到带讲述者和未核实标记的 claim；未到场、睡眠/失能、冒充 source、改 claim、请求 truth、只看 public catalog 均不得产生获知。覆盖重放/重复、重启、导入导出和撤销后索引清除；静态 NPC 内容前后不变，公共工具仍 25 个。给出链路证据，不宣称本卡通过了真实模型叙述。

不要做：重复核验 37 人缺口、改写 40 条已审核正文或静态 NPC 合格字段、新增人口、公开真假、自动全村传播、借此完成 300 传闻或世界时钟、调用真实模型、降低知识门槛。依赖：T02 已合入；按 T03 已确认的检索合同实施，最终联合验收要求 T03 完成。并行：可与 T03 和 T06–T10 作者块并行，因为文件所有权分开；不与 T13/T15 或任何 engine/npc-memory/scene-card/chronicle/tools 改动并行。新树 `F:/dnd-wt/T21`、分支 `t21`；本卡是用户第 1 项四村完成前置，也是 T11/T13 依赖。

<a id="t22"></a>

### T22 人物起草顶层合同与共享/单卡预算护栏

目标：修复 T06 反复返回 candidate 外壳的接口不一致，严格事实/字段校验不变；将稳定单卡额度与共享 20 元总账分开，使中断和交错续跑不多花、不假退款。涉及文件：`tools/npc-depth-content.mjs` 的 `patchDraftRequest`/`extractDraft`、`tools/npc-depth.mjs` 的 allocation/运行与恢复、`tools/content-pipeline.mjs` 的请求/记账/定点恢复；必要时新增 `tools/content-budget.mjs`，新增 `tests/npc-depth-contract.test.mjs`、`tests/npc-depth-budget.test.mjs`，补 `tests/npc-depth-pipeline.test.mjs`、`tests/content-pipeline.test.mjs`。不改作者 design、30 人补丁正文、T04 验证器或发布白名单；实际失败记录的受控恢复由主会话在本卡通过后执行，不在测试中改真实预算账。

合同实现：`patchDraftRequest` 明确顶层且仅有 `{id,contract:'audit-patch-v1',patches:[{path,value}]}`，给实际字段 schema/示例，去掉“返回 candidate JSON”歧义。如保留有限 unwrap，只接受顶层恰好一个 candidate 键、值为非数组对象、内层恰好 id/contract/patches 的单层外壳；标准顶层仍支持。两种格式最终都必须与 `patchDraft(entry)` 严格 deepEqual，再走原 `validateDraft`、失败路径授权、preservedShape 和 `verifyUnchanged`；不修正模型给错的 id/contract/path/value，不丢多余键、不合并内外层、不递归寻找候选。其他旧人物批次合同保持不变。mock 必须使用本次赵枫失败中的单层外壳形状，不能只返回从请求里取出的理想 candidate。

定点恢复：现有 pipeline 对同指纹 manual 默认跳过，attempts=3 即使 retryManual 也无下一次循环；不能只修提示后宣布可续跑。增加显式、可审计的协议恢复入口和 CLI 帮助，以调用者指定的受影响 id 为白名单，只处理有该合同错误证据、尚无合格 L2 的记录。保留原 attempts/错误/指纹/用量，独立记录一次协议恢复机会，不重置内容重写次数；passed 条目始终跳过，无关 manual 不受影响。若原完整响应确实保存，可先以新解析器离线恢复合法 draft；本次单条 JSON 仅见 assert 错误差异时，不能把错误字符串当原始响应伪造成功，使用保存的冻结候选进行一次受限恢复请求，然后正常 L1/L2/L4。仍出合同错就停，不再盲试；不清整批记录，不凭新 revision 重跑全部审核。

预算事实与方案：现有 `runContentPipeline` 会把 client.budgetYuan 写入共享 limitYuan，而 `runDepth` 将本卡起始共享余额加增量当 client 上限，正常 finally 才恢复 20；强杀后 finally 不运行。下一卡使用新 client，所以旧 2.94801504 不直接限制它，但旧卡复跑时其他卡的费用会消耗其固定阈值。改为共享账固定 waveLimitYuan=20、总 spent/reserved 与每个稳定 card/allocation 的累计 spent/reserved/增量上限分别核验；T06 上限 2，T07 上限 3，换输出目录、revision、重启都不得新领额度。共享额度是所有卡花费之和，单卡只计本卡；保留历史混合余额不强行分给新卡。可将分卡分录与共享聚合放在同一原子写入中，避免两份账间强杀导致漏记；如果分文件，须有请求标识和保守恢复合同及相应故障测试。仍同一时间只跑一个真实模型块，不引入并发调度系统。

请求发出前同时检查并持久化共享与单卡预留，成功按响应 measurement 结算；无最终用量的终止请求继续保留预留或显式转为等额“未知费用上界”，两种账的占用总额均不得下降且只计一次。旧账迁移必须检查匹配的 allocation 中 waveLimitYuan=20、increment=2、startingSpent=0.94801504 与 legacy limit=2.94801504，未知来源的低限额不能擅自提高。本次 T06 已知归属为请求费用 0.15959304 加未决预留 0.083736，共占用 0.24332904；本卡剩余最多 1.75667096，共享剩余最多 18.80865592。后续 T07 单卡最多 3，仍逐请求受剩余共享额约束。用量的二进制浮点尾差可按既有精度容差处理，不得把真实预留归零。移除依靠 finally 改回共享上限的办法，流水线预算写入须保留分卡元数据；恢复前后出具账面差异，不能以初始化空 budget.json 修复。

验收命令：`node --test tests/npc-depth-contract.test.mjs tests/npc-depth-budget.test.mjs tests/npc-depth-pipeline.test.mjs tests/content-pipeline.test.mjs tests/deepseek-transport.test.mjs` 及 CORE；模型预算 0，只用 mock 和临时账。合同测试覆盖合法顶层/有限外壳、wrong id、wrong contract、改 path/value、增删 patch、额外键、混合内外层、数组/null/多层壳，非法内容仍拒绝。恢复测试覆盖 manual+attempts3 仅指定协议错误可获一次恢复、passed 零调用、无关 manual 不重跑、L2 仍必需且失败不算完成。预算测试用当前精确余额重现强杀残留，在预留后中断与跨卡交错后，T06 恢复不被 T07 费用挤占/不重领额度，T07 不能超过 3，共享不能超过 20；卡/共享任一不足都在调用 mock 前拒绝，遗留 0.083736 不丢失不重复扣计。验证原旧内容流水线合同仍可运行，不仅测试新适配器。

不要做：真实模型试探格式、重跑游戏、改人物事实或知识门槛、批量放宽 JSON、伪造 L2/L4、清空预算/预留/失败记录、新建空账、把未知费用当已退款。依赖：T05 与已保存的 T06 失败证据；独立 `F:/dnd-wt/T22`、`t22`。可并行：T07 仅本村最后叶子的离线修订、T08–T10 候选作者、T21 引擎传闻；不可与任何改公共内容流水线的块并行，T06/T07 真实审核冻结到本卡及合后 CORE 通过，由主会话按原增量额度逐卡恢复。

<a id="t23"></a>

### T23 review-001 四村税贸真实作息联动验证

目标：补齐 P2 验收证据缺口。`tests/village-ledgers.test.mjs:16` 删除全部 NPC schedule/tier，且 `at` 与送达前直接摆放管理员；现有检查证明账本守恒和权限拒绝，尚不能证明保留正式作息时可完整办理。抽样四村管理员的默认柜台时段均为 480–720、780–1020 分钟，未发现柜台永久不可达，故本卡不把缺证据说成已确认功能故障，也不阻塞人物离线修订。

涉及文件：新增 `tests/village-trade-live.test.mjs`；只拥有该测试文件，不改已审核世界内容、T22 流水线或现有税贸实现。实现要点：复用 `loadWorld`、`WorldEngine.createCharacter/reduce`、`applyPatches` 与现有 `modelToolCall` 公共路由，在正式日程未删改的新建内存存档中，从默认出生点以 `world_move/world_time` 到卖方议事屋，按 `world_field` 的 `farm_settle_trade` 提粮，再走现有道路到买方实际在场窗口交付。四份试行粮约分别使用独立存档，保持原开局资源；不得修改 NPC 位置、活动、状态、日程、tier 或直接增加粮钱来造成功。路途中实际扣费、吃粮、损耗照实保留；对照分阶段 ledger 的 prepaid/paid/received/tax 和玩家、买卖双方实际铜钱增量，不用旅途中总差额误判税贸守恒。至少一条链验证休息/不在场时拒绝且无扣款，再正常等待到实际柜台窗口成功；重复请求与导出重载不能重复收付。产量仍只是天气前潜力，未经模拟不推断长期生存。

验收命令：`node --test tests/village-trade-live.test.mjs tests/village-ledgers.test.mjs` 与 CORE；四份粮约在保留正式作息和实际行走后均完成，源方预收归零、总货价 60 铜分列净额 57/税 3、买方实际支付与库存变化一致，报告保留关键分钟、位置、玩家及买卖双方钱物快照。模型预算 0；不运行真实模型或长年农业模拟。如果真实前置失败，最多按执行规则试两种修法，保存复现证据后交规划定点拆卡，不能在本卡扩大引擎文件所有权。

不要做：删日程、强移 NPC、强制骰点、静默补资源、部署、拿本卡代替模型自然叙述验收、重复 T21 的 40 条传闻验证。依赖：T02/T21 已合入；新树 `F:/dnd-wt/T23`、分支 `t23`。可并行：T22、T06–T10 内容作者和审核；与修改 agriculture/engine/作息运行的卡串行，避免验收版本漂移。本卡完成后作为 T17 前置证据归档；T13 可先执行，T17 开始前须完成本卡或处理其实际失败。

<a id="t24"></a>

### T24 旧人物发布器保留已发布教学增量

目标：解除 T10 的旧 M2 发布兼容阻断，保留许苓已正式发布的四项教学服务及新增技能，同时继续拒绝无来源的变化。现状是 `tools/m2-people-publish.mjs:37` 将正式 services/skills 与旧 M2 baseline 逐值等同；正式许苓在 `spell_light/profession_mage` 外已有 `spell_earth_03/spell_fire_07`，来源为 `world/drafts/m4-batch2/learning-sources.json` 的 teacherChanges。旧档审核有效不意味着可撤回后续发布。

涉及文件：`tools/m2-people-publish.mjs`、`tests/npc-profile-publication.test.mjs`、新增 `tests/npc-publication-increments.test.mjs`；如确需抽取只读凭证 helper，可新增 `tools/npc-publication-sources.mjs`。不改 M4/W1 其他发布器、T10 作者候选或正式世界数据。复用 `hashContent/readApprovedContent`、`readM4Publication` 的审核与来源映射校验、`mergeM4Batch2` 已有追加去重语义及 `publishNpcProfiles` 发布前文件哈希/临时文件替换。世界 `rules.version` 和 `npcStockUpdateVersion=1` 只能作为版本背景，不单独充当内容授权；若复用模块有加载副作用，只抽取所需只读验证，不运行模型或重发 M4。

实现要点：为 mergeNpcProfiles 提供经验证、与当前 world/root 绑定的后续已发布增量凭证，按 npc id 分别列 services/skills。凭证须来自原 M4 审核记录及 teacherChanges/mappings，且对应正式 spell、skill、teacher 关系确已存在并相符；只有候选 JSON 或仅 ID 已登记不够。本次精确增量为许苓服务 `spell_earth_03/spell_fire_07` 与技能 `skill_fire_07/skill_earth_03`。旧 baseline 各项必须完整保留，当前数组仅可等于按原发布顺序去重追加这些已发布项的结果；拒绝删除、替换、乱改技能表示、额外未审核项、其他 NPC 冒领和来源不匹配。不得让所有超集默认合法。intelligence/aliases/flags、来源事实、作息、年龄与已发布完整档后续变动仍走原严格冲突检查。合并结果直接保留当前受保护 services/skills，不重算教学表、不覆盖运行钱物；未传有效凭证的直接纯函数调用仍拒绝未知变化。

验收命令：`node --test tests/npc-profile-publication.test.mjs tests/npc-publication-increments.test.mjs tests/npc-traits-publication.test.mjs tests/m4-publication.test.mjs` 与 CORE，模型预算 0。证明真实正式世界的 prepare 不再在许苓 services/skills 拒绝；临时目录首次预演/写入后再次预演 changed=false，许苓服务和技能完全保留、钱物与 17 人 traits 不变。反例涵盖删原服务、伪造新服务/技能、技能同 ID 内容冲突、伪造或缺失来源、未正式发布的合法草稿、错导师、来源审核哈希变化与其他身份冲突；仍保留旧 L2/L4 及候选篡改拒绝测试。不得将后续完整档内容冲突也一并忽略：遇到新的真实不兼容差异，报告具体字段给规划，不在本卡放宽。

不要做：重置 services/skills、重跑模型、改旧审核基线或补丁白名单、静默回滚后来人物修订、部署或修改存档。依赖：已合入 M4 学习来源和 T10 `4f0bfe4` 的阻断证据；独立树 `F:/dnd-wt/T24`、分支 `t24`。可并行：T07 定点作者修订、T22 公共预算入口；不可与写 m2-people-publish 或同测试文件的卡并行。完成后解锁 T10 的该项发布回归与 T11；主会话合后 CORE 并记录真实结果。

<a id="t25"></a>

### T25 人物定点审核明确新背景事件的作者出处

目标：修复 audit-patch-v1 对用户授权新增背景的合同遗漏。用户要求从地方问题派生 3–5 当事人的已知、未知、目标与共享记忆；旧 `buildReviewRequest` 对 legacy 明确 facts 是经设计补入的事实，patch 分支却一律要求候选新增事实已有旧来源，且没有独立新事件出处。新背景可经作者设计后审核，不能只因 before 没发生过而拒绝；同时候选文字自身不能成为授权、完成状态、财物变化或秘密传播的证据。

涉及文件：`tools/npc-depth-content.mjs`、`tools/npc-depth-review.mjs`、`tools/publish-npc-depth.mjs`、必要的 `tools/npc-depth.mjs` 指纹衔接；新增 `tests/npc-depth-authored-background.test.mjs`，补 `tests/npc-depth-sources.test.mjs`、`tests/npc-depth-review.test.mjs`。只做公共合同与 mock 夹具，不写 T07 世界正文。实际事件出处由 T07 作者另存 `world/drafts/w1/wt-depth/authored-background.json`，与原 source.json、base.json、sourceDeclaration 分离且不覆写；其他卡不得自动套用新出处或获得恢复机会。

实现要点：新增可选、显式 opt-in 的作者出处包，标识 `kind=authored-background`、稳定 event id、revision、参与者 IDs、地点、past-but-unresolved 状态、允许叙述的事实、尚未发生/尚未约定的结果，以及逐字段 `sourceRefs`。来源引用记录路径/ID/字段与内容 hash，指向已发布地方问题、原职业/日常活动等事实；区分来源本来已存在的事实与本次新设计的共同在场/发言。不能将模型候选、review 结果或另一人的候选列为来源，也不能把当前自动生成 prose 提升为已审核来源。公共地方问题有 ID 就引用；普通日常关切若仅在人物私有档，必须明确本次获授权设计的公开说话范围，不能把其全部 concern/secrets 默认公开。作者新事件仍需 L2 查相容性及 L4 实审，出处声明不等于自动通过。

L1 跨人约束：事件只关联本卡原审计允许的新增 memorySeeds 路径、现有人物及有效公开地点；3–5 人是每项地方问题的当事人网络范围，并非每条共享记忆人数下限，允许同一问题网络内的两人旧事，不强迫已审核两人记忆重做。所有参与者的对应 event id/事实/地点/knownBy 集合一致，未参与者无新增获知；不能改原 memory/secrets.knownBy、原身份性别、钱物技能、原目标内容/进度/步骤状态或其他合格叶。新事件只描述交流待办与未解决分歧，不隐含真实交付、付款、授权、完成任务或新增人口。与原秘密有语义接触的内容必须进入显式风险清单给 L2/L4；自动字符串检查只是补充，不能替代语义审核。候选能逐条追溯到冻结出处，超出参与者/地点/事实范围的叙述拒绝。未来询问或 pending 步骤不作为已经同意/已执行事实，真实目标偏移和具体性不足仍拒绝。

审核与发布：仅请求明示该出处的 id 获得相应审核上下文；原 before 与全部补丁仍可见，另列新设计事实、原来源、禁止泄漏的秘密及待定结果，不能笼统宣布 entry.facts 全为权威。保持旧 record/attempts/失败和原 foundation/sourceDeclaration；新出处 hash、适用 id/path、候选 hash、review hash 和 L4 必须组成可检查的增量凭证。如当前发布合同不能承载增量，新增显式凭证字段并保留原指纹映射，禁止直接改旧 passed/foundation 来装成同一审核。发布器复核原来源 hash、新出处 hash、全参与者候选一致与新审核覆盖；篡改出处、成员、候选或缺新 L4 都拒绝。来源证据扩展优先复用现有只读 `--source-evidence`，不复制其账本或复审流程。T06 已达停止界限，必须继续冻结；本卡不会清理 recovery 标记、增加重试、改预算、追认任何旧失败为成功。

受控内容修订衔接是本卡必做部分：当前 `npc-depth-review` 对 passed 直接跳过，改 patch 又会触发 entry 指纹冲突，不能只改提示后要求 T07 重跑。提供显式修订入口，将旧完整 record、原 baseline/foundation/source hash、实际 L2 hard 或 L4 invalidation 的 id/path/quote/source/hash、批准的 before/after patch 差异及本次规划标识绑定成修订链。允许路径须同时满足原 audit 许可与这次真实失效清单，不能删成员、改正确兄弟叶、改原来源/基线或靠换 revision 领取新机会；仅补审核来源的条目可保持 draft 不变并登记补件 hash。原 passed 保持历史记录但失效条目不能跳过，旧 attempts/失败/费用不清；每个获本次规划授权的失效 id 只给已授权的定点修订复审机会，成功仍需新的 L4 和发布覆盖，不循环生成新修订机会。T06 不在本次适用列表。所有实际付费继续用原 T07 cardId/root/共享账及 3 元限额；本卡的 source 合同阶段不能另开有费审核绕预算。

验收：`node --test tests/npc-depth-authored-background.test.mjs tests/npc-depth-sources.test.mjs tests/npc-depth-review.test.mjs tests/npc-depth-pipeline.test.mjs` 与 CORE，模型预算 0。mock 证明合法新交流背景及 3–5 人问题网络内的两人记忆能进入完整 L2/L4/发布凭证链，缺旧 before 同事件本身不构成失败；反例覆盖候选自证/互证、缺地方或原字段来源、原身份冲突、秘密复制或扩大 knownBy、完成待定交易、偏离目标、成员缺档/双方事实不一致、改未失败叶、过期出处/来源/review/L4 hash 及未 opt-in 的旧候选，全部仍拒绝。通过模拟隐藏失败字段/漏审一叶证明新合同没有降低逐叶覆盖。源投影漏 sex/workplace 与未知/待办误当已发生事实形成回归；覆盖 passed+真实L4失效、manual+hard、伪造失效清单、无权限叶、兄弟叶变动、旧hash不匹配、已用本次机会、未变passed零调用以及修订后L4缺失拒发。临时预算账证明合同变更不清费用/预留、不重领额度或恢复次数；T06 状态及已耗恢复机会原样保留。

不要做：调用真实模型、将 hard 批量降 soft、把新叙述当旧证据、为过审核改来源事实、整村重新审核、重开 T06。依赖：现有 T22 稳定单条复审/来源验证接口；独立树 `F:/dnd-wt/T25`、分支 `t25`。可并行：T24、T07 的独立 world 作者修正与 L4；不可与修改同一公共人物流水线的块并行。T07 付费复审须等本卡验收；本卡零新增模型授权，后续仍只有 T07 原 3 元单卡剩余额度及原停止规则。
