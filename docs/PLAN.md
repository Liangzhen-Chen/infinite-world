# 执行计划

## 所有代理遵守的执行规则

1. 子代理不再启动子代理，不执行 Claude 校准。
2. 只跑相关测试；提交前加跑 `node --test tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs`。不跑全量测试，不调用真实模型，除非卡片要求。本文以下称这条命令为 CORE；每张执行卡的验收都包含 CORE。
3. 输出过长只截取报错部分；读过的文件只看相关行。用 `rg` 定位，不通读仓库。
4. 同一个错误两种修法仍失败：停止，提交已通过测试的部分，在不超过 10 行的摘要里写明现象、已试方法和判断。主会话派规划代理处理一次；仍不行标记卡住，继续其他块。
5. sol_worker 在自己的 worktree 和分支工作，完成后提交并回不超过 10 行摘要。`docs/PROGRESS.md` 和 `docs/CHANGELOG.md` 只由主会话更新；PLAN 由主会话维护或委派规划代理修改。
6. 同时最多 3 个 sol_worker，只并行没有依赖且改动文件不重叠的块。真实 DeepSeek 块同时只运行一个；内容可以先并行准备，模型阶段由主会话授予运行槽。
7. 新树为 `F:/dnd-wt/T编号`，分支为 `t编号`，从依赖已合入的主线建立；依赖安装方式沿用现有 worktree。已有树优先在原树收尾。不得覆盖其他会话的改动；仅凭修改时间不能认定已无人工作。
8. 主会话先核验卡片验收，再合并；合并后跑 CORE，更新 PROGRESS/CHANGELOG，再删除已完成且干净的任务树。存在未提交差异、其他会话活动或未合入成果时保留树。
9. 每完成一个里程碑或内容波次打 `review-编号` 标签，交规划代理看上次标签以来的 `git diff --stat`、最新报告及抽样内容；问题写成卡片或已知问题，再派修复。标签不代表已部署。
10. 不读取 `secrets.json`；DeepSeek 只用环境变量 `DEEPSEEK_API_KEY`。不部署到用户酒馆，不动原存档。需要用户决定的事由主会话写入 `docs/待用户确认.md`，跳过并继续其他工作。
11. 世界内容只写进 `world/`，不手改 `dist/`。不缩减规模、不降低断言或评分、不删除失败测试；保留基线的 23 项预期失败。最新失败原文和有限范围的证据不能被概括为整体验收通过。
12. 内容沿第 10 章逐条处理：L1 全量，L2 全量事实审核，最多两次定点修正，L4 被标记条目加随机 5 条，每批人工阅读不超过 10 分钟；波次随机 10 条六项平均至少 4，单项至少 3。未经 L2 的新事实不得记成已审核发布。
13. 内容波次预算上限 20 元，试玩每轮 30 元，浸泡每次 50 元；卡片可以设置更低的增量上限。持久预算含已花费和预留，不新建空账绕过历史花费。同一条真实失败最多重跑一次，报告写明重跑后通过。
14. 主会话每次 compact 后按 AGENTS 执行 Claude 校准；子代理不执行。角色启动失败才用默认代理，在派活消息写角色并由主会话登记。
15. 本轮目标覆盖完整指南，部署及待用户决定事项除外。原时间预算继续记录；超过 1.5 倍需决定的块记录选项后跳过，不因一个块停下无人值守队列。全部可执行卡完成，或剩余都卡住/依赖卡住/待用户决定时，由主会话运行 `npm test`、`npm run build:release`、`npm run build:final`，如实记录失败，覆盖当前状态后停止。

## 调度依据与门槛

2026-10-11 初始核查主线为 `69aad08`，规划期间主会话报告 `4bf28de` 已作为 `f11af04` 合入且相关与核心通过。四村档案和沿路线送货已经在主线，不能重新做一遍。初始四村经济数值和治理权限缺口归 T02；T03 负责公开资料真实检索。后续已确认 40 条传闻仍为 authored-seed/pending-event，源 NPC 无完整 claim，故新增 T21 闭合本人认知到实际获知路径。T02、T03、T21 全部完成才能关闭用户第 1 项的四村收尾，只有公开检索或往聊天塞入 claim 的测试不足以关闭。

已有完整档 152、轻量名册 294，不代表人物深度达标。榆坡已修 6 人，`70011af` 已选择性合入另外 4 人；T04 本次审计记录为 152 full、1840 项字段缺口，实际执行以同一基线的 `auditNpcDepth` 输出为准。10 名已深修人物的六类深度已通过，但 `opinions.neighbors[].view` 等旧设定仍有规则式措辞，不能按整个人“已修”而跳过 L1。原 17 人 traits 已由 `legacyTraitsAuditIds`/`legacyTraitsExpected` 对照提交 `1bc8f3b` 的固定名单和值核验通过，后续只核验，禁止再改。T06–T10 按 id/field/code 清单只补不达标项；T11 通过前不新增任何人口，之后仍先做 M2 验收、14 条法术，再扩人口。

旧树清单：`w1-village-profiles/codex/yupo-depth-next` 的 `70011af`、`review-calibration/codex/review-calibration` 的 `e4abb2b` 已检查合入。`npc-delivery/codex/soak-semantic-time` 的 `241552d` 与 `npc-depth/codex/npc-depth` 的 `035d792` 是已停止并保存的未验证 WIP，分别归 T14、T20；原目录名不表示现任务内容。交接见 `docs/交接.md`，开工再次确认状态与归属。

初始可并行组为 T01、T14、T20，它们在三个原树分别收尾；主线整合串行。T02 与任何修改 `server-plugin/engine.mjs`、`world/meta/rules.json` 的卡不能并行。T06–T10 候选作者只改各自目录，可并行起草；审核槽和 T11 正式发布串行。新增测试文件名或 CLI 在下文明确标为新增，不能当作现有已运行证据。

当前内容费用沿用 `F:/dnd/world/drafts/m4-object/budget.json` 共享持久账，它含旧混合来源；各卡的 W1/W2 名称不构成新建零余额预算的理由。主会话分配运行槽时读取实际 spent/reserved 并记录本卡差值，增量上限和已有累计上限同时有效；模型预算文件只由取得运行槽的任务串行更新。

预算阻断修订：T06 中断后共享账为 spent=1.10760808、reserved=0.083736、limit=2.94801504；后一个数来自本卡起始 0.94801504 加增量 2，不是波次 20 元授权的变更。当前流水线不把旧 ledger.limit 直接用作下一卡限额，因此不能断言它已直接卡住 T07；但元数据混淆且旧卡绝对累计阈值会被其他卡花费挤占，归 T22 修复。T06/T07 真实审核在 T22 验收前冻结，保留全部 spent/reserved，未知终止请求不退款。

## 近期完整任务卡

### T01 已验证旧分支增量收尾

目标：保住旧成果，合入榆坡 4 人增量和送货付款前置，核对主线已有真实送货链。涉及文件：原两树提交涉及的 `world/design/w1-yupo-depth-next.mjs`、`tools/npc-depth*.mjs`、`tools/publish-w1-villages.mjs`、`tests/npc-depth-next.test.mjs`、`tests/playtests/npc_courier.json` 及对应人物候选；不另写主功能。

实现要点：以 `git diff --stat master...分支` 排除已合入 `4bf28de`；`70011af` 沿冻结 base/foundation 和审核指纹追加 4 人，榆坡达到 10/30；`e4abb2b` 明确两铜价格及付款授权。复用 `publishVillages` 的幂等及旧字段保护。送货复用 `npc-obligations.mjs`，真实路线、本人路费、固定交接地点、到期原因必须保留；不要按树名再实现送货。主会话选择性合入代码和内容，CHANGELOG 由主会话登记。

验收：`node --test tests/npc-depth.test.mjs tests/npc-depth-next.test.mjs tests/w1-village-profiles.test.mjs tests/w1-villages-publish.test.mjs tests/npc-obligations.test.mjs` 及 CORE 全过；送货脚本仍为 8–20 轮并通过离线前置核验。模型预算 0。不要做：新增人口、重写已经通过审核的正文、把旧真实失败标为已复测。依赖：无；原树无其他活动。并行：可与 T14/T20 并行，正式合入串行。

### T02 四村产业、税贸账与治理权限

目标：四村档案不再以 null 代替用户要求的经济与权限资料，数字能由引擎读取并核对。涉及文件：`world/design/w1-village-profiles.mjs`、`world/geo/settlements.json`、`world/meta/rules.json`、对应 `world/drafts/w1/village-profiles/` 与 `world/drafts/w1/village-ledgers/`、`tools/w1-village-profiles-content.mjs`、`tools/population-validation.mjs`、`tools/publish-w1-villages.mjs`、`extension/tools.mjs`、`schemas/world.schema.json`，必要时 `server-plugin/agriculture.mjs`、`server-plugin/agriculture-migration.mjs`、`server-plugin/law.mjs`、`server-plugin/engine.mjs`；测试 `tests/w1-village-profiles.test.mjs`、新增 `tests/village-ledgers.test.mjs`。农事初始化适配仅服务开发世界/测试副本，不在本卡新增发布迁移或操作原存档。

实现要点：保留 `settlementProfiles[].details` 与已审核 problems/rumors/calendar；把 `economy` 从 `pending-ledger` 迁为有单位、周期、来源、期初期末的生产/库存/税/贸易记录。粮食复用 `rules.agriculture.settlements`、`state.settlements` 和 `advanceAgriculture` 的守恒，跨村贸易必须有两端同量记账，未发生的合同不得计为已收付。实际公共调用是 `world_field` 携带 `operation:'farm_settle_trade'`、`contract`、`phase:'pickup'|'deliver'`、`authority`；内部 `world_farm/settle_trade` 通过既有 `modelToolCall` 映射，不新增第 26 个公共工具。新经济明细由 world 数据提供，旧世界升级不重置耗尽库存或私人财产。治理复用 `rules.law.codes` 与 `law.mjs` 的 `authority` 在场检查，明示官员、执法区域、可执行事项和转交机构；普通协调者不得自动获搜查征税权。现有缺口断言改为验证新账及拒绝无权操作，保持原问题、传闻来源及秘密隔离。本卡只闭合四村登记粮约与税贸，不扩到全世界自动贸易。

验收：新定向测试覆盖每村年粮等式、税贸双方对账、期初/结算分离、无权拒绝、重复升级及重放；`node --test tests/village-ledgers.test.mjs tests/w1-village-profiles.test.mjs tests/w1-villages-publish.test.mjs tests/law.test.mjs`、CORE 通过。仅跑农业相关命名测试，不启动旧三年全批。事实变更走现有 `reviewProfiles`/`--review`，为本卡补显式候选目录/预算参数，4 村增量上限 1.2 元且计入 W1 20 元总账，L1/L2 无硬错、L4 完成后才写正式源。不要做：凭空补用户粮食、扩人口、全世界周贸易系统；后者归 R07。依赖：T01；并行：不能与其他引擎、规则、四村发布器改动并行。

### T03 四村档案的引擎查询与真实检索

目标：引擎与 `world_search` 都能查到公开数值账、治理、地方问题、节俗和集日。涉及文件：`server-plugin/settlement-profile.mjs`、`server-plugin/catalog.mjs`、`server-plugin/retrieval.mjs` 及其索引构建调用点；`tests/w1-village-profiles.test.mjs`、`tests/catalog.test.mjs`、`tests/retrieval.test.mjs`。

实现要点：沿 `publicSettlement` 公共白名单、`settlementScene`、`catalogDefinition` 与 `MemoryIndex` 的现有检索入口；T02 数值显示单位与结算时点。地方问题每村至少 5 项且有两种以上解法，作者解法不作为 NPC 已同意。40 条有来源的传闻保存在权威档案，玩家检索只暴露已经合法获知的 claim/source；truth/fact、隐秘处、未授权解决方案不得进入公开索引。检索到日历不等于节日已举办，场景上限 6000 字符不变。

验收：上述 3 文件定向测试及 CORE 通过；四村均以自然中文关键词命中公开资料，未接触角色看不到传闻真相，query 不改世界。模型预算 0。不要做：自动让全村知道传闻、免费发库存、重做通用检索架构。依赖：T02；并行：可与 T04 单独验证器工作并行，不能与 T15 检索/审稿接口改动并行。

验收边界：本卡已能证明公共经济/权限自然检索与 truth 隔离；“把 claim 塞进聊天后能搜到”仅证明已有聊天可检索。真实证据为四村源 NPC 分别 10/9/9/9，共 37 人，knowledge/memorySeeds/authoredFacts 没有完整 claim，npcContext/scene 没有传闻入口；采用此结论，不再重查 37 人。玩家通过源人物实际听到传闻并进入长期检索的缺口归 T21，本卡完成不等于四村收尾完成。

### T04 完整人物质量门槛与字段审计

目标：实现完整人物质量验证器和逐字段审计，为 T11 接入 `npm run build:release`/final 准备可验证门槛。涉及文件：`tools/npc-profile-validation.mjs`、`tools/npc-depth-content.mjs`、新增 `tools/audit-npc-depth.mjs`、新增 `tests/npc-depth-gate.test.mjs`；本卡不改 `tools/validate-world.mjs` 的正式发布入口，接入归 T11。

实现要点：在现有 `validateNpcProfiles` 所在模块新增独立的完整度验证入口，设计 T11 调用合同；现有引擎结构校验不变。`knowledge.known` 至少 3 条 `{fact,source,reliability}`，至少一条事实具体涉及另一个人物或地点；unknown 是具体待知事项；goals 各期限中的 content 与 steps[].content 不同；voice.register 不等于 habits[0]；memorySeeds 至少一条由本人和他人共享，knownBy 引用存在，另一完整档有同事件且事实兼容；relationships[].note 写具体来由。以可检验规则抓占位和重复，以审核抓语义，不能只用字符长度冒充具体性。L1 检查知识/人物设定里的主持人、玩家不能、不要让、禁止等规则措辞，并区分世界内真实禁令的事实陈述。审计 stdout 输出 id/field/reason，覆盖全部 full 档和已修 17 人 traits。

验收：新增门槛负例分别拒绝六类缺口、合法事实不误报，`node --test tests/npc-depth-gate.test.mjs tests/world-validation.test.mjs tests/npc-depth.test.mjs` 及 CORE 通过；`node tools/audit-npc-depth.mjs` 如实报出现有缺口。本卡只能记“验证器已实现”，正式构建门槛未接入，T11 才完成用户此项；这样既有发布器仍能处理在途审核补丁，不形成补内容之前禁止发布补内容的循环依赖。模型预算 0。不要做：降低 full 定义、把人降成名册以通过、成批改内容、删除旧测试。依赖：T01；并行：可与 T02/T03，文件边界不重叠。

### T05 可复用的定点人物修订流水线

目标：后续按村准备 3–5 当事人小批，保留已有达标字段及审核证据，正式人物文件只由统一发布步骤写。涉及文件：`tools/npc-depth.mjs`、`tools/npc-depth-content.mjs`、`tools/npc-depth-review.mjs`、`tools/npc-depth-l4.mjs`，新增 `tools/publish-npc-depth.mjs`、`tests/npc-depth-pipeline.test.mjs`。本卡不改 T02 正在使用的 `tools/publish-w1-villages.mjs`，旧发布器对新补丁的兼容接入归 T11；不改 T04 验证器。

实现要点：复用 `depthEntries`、`contextFor`、`applyDepthDraft`、`verifyUnchanged`、`sourceFingerprint`、`runContentPipeline` 和 `readApprovedContent`；保留旧榆坡两批的原调用、五字段 `changedFields` 及已审核指纹，为新增批次实现按审计路径的修订合同。新增显式 `--design`、`--root`、`--budget-root`，发布器新增 `--manifest` 与预演/`--publish`，参数需 CLI 帮助和测试。新 design 冻结 before/baseHash、对应 `auditNpcDepth(...).issues` 的 id/field/code 及实际 patch 路径，字段范围从失败项推导，不能把任意顶层字段加入通用白名单。

准确白名单：六类深度字段之外，`findNpcRuleWording` 扫描的 `notes`、`familyNotes`、`description`、`personality`、`opinions`、`secrets`、`authoredFacts` 仅在对应叶子路径实际报 `rule-wording` 时允许修正；例如 `opinions.neighbors[0].view` 只改 view，保留 with 和其他邻居项。`knowledge`、`voice`、`relationships`、`memorySeeds`、`goals` 同样只修报错的具体项；条目缺失类 issue 才允许向该数组补足必要条目。保留已达标兄弟字段、数组成员及对象键，不允许删除、清空、改成 null 或减少数组来逃门槛。规则措辞改为已有来源支持的具体事实，不能用另一句“并非全知”代换。

仅措辞补丁允许没有 sharedEvent、memoryNarrative 或新记忆；当前 `verifyUnchanged` 强制 memorySeeds 加一只保留在旧两批合同，新批次按失败路径判断。旧记忆的 event 若自身报规则措辞，只改有问题的文字，保持 id、knownBy、地点、事实和其他历史内容；确有共享记忆缺口才补共享事件，优先选择同批存在相同缺口的当事人，不把一方秘密传播给另一方。冻结所有非失败字段、钱物、身份、年龄、技能、服务以及原 17 人 traits。L2 输入覆盖本次全部修订叶子，含 opinions/notes，不能仍只审共享记忆；同一补丁重跑零写入。候选全部在各自 world 目录，不并发写 baseline。

验收：`node --test tests/npc-depth-pipeline.test.mjs tests/npc-depth.test.mjs tests/npc-depth-next.test.mjs tests/w1-villages-publish.test.mjs` 及 CORE；prepare 不调用模型、过期指纹/篡改审核拒绝、旧两批仍可重发、不同村候选可独立准备。新增回归须证明：opinions-only 与 notes-only 修复不增记忆，未报错叶子和原 17 traits 改动被拒绝，删除/清空字段或数组成员被拒绝，L2 上下文确实含每个新修订项。模型预算 0。不要做：通用框架重构、重审无改动条目、重写已达标六类、写 PROGRESS。依赖：T01/T04；并行：T04 合入后可与 T02/T03 并行，严格不改旧四村发布器/验证器；完成后解锁 T06–T10。

### T06 榆坡剩余人物深度

目标：榆坡 30 份已有 full 档全部达到 T04，仅修剩余不达标字段。涉及文件：新增 `world/design/w1-yp-depth-rest.mjs`、`world/drafts/w1/yp-depth-rest/`、`tests/npc-depth-yp.test.mjs`；不直接改 baseline 或共用工具。

实现要点：已修 10 人的合格六类内容沿 T01 证据保留，但逐人修审计命中的 opinions/notes 等规则措辞，不能整人跳过或追加无必要的记忆。从 `details.problems` 的轮水册、工场占位等实际问题每次选择 3–5 当事人，按失败路径补 known/unknown/steps/共享经历和关系来由。剩余居民也依据各自家庭/地点实际事实补缺，不复制一套措辞。复用 T05 CLI，design 使用 before/baseHash/issues/patch，sharedEvent 仅在实际共享记忆缺口时存在；共享经历双方兼容，无新增钱物或秘密授权。

验收：`node --test tests/npc-depth-yp.test.mjs`、CORE；`node tools/npc-depth.mjs --design world/design/w1-yp-depth-rest.mjs --root world/drafts/w1/yp-depth-rest --prepare` 后在取得模型槽时用同参数加 `--budget-root` 运行审核。增量预算 2 元且 W1 累计不超过 20；L1/L2 无硬错、L4 完成、全部 30 人合并视图过 T04；提交候选与逐条审核。不要做：重复改已达标字段、新增 NPC、整批重写、发布其他村。依赖：T02/T04/T05；并行：作者阶段与 T07–T10 文件隔离，模型阶段独占。

本轮阻断：候选已在 `41f4998` 保存，30 人合并审计零缺口、prepare 与相关/CORE 通过；真实起草出现 `{candidate:{id,contract,patches}}`，顶层严格合同拒绝，25 次已发生请求费用 0.15959304 元，L2/L4 未完成。候选准备完成不等于审核通过。T22 通过后只续跑受此接口错误影响的 id，保留原失败及用量，不重做合格旧正文、不重跑游戏，仍沿同一 T06 的 2 元增量额度。

T06 本次卡住复核：现有 28 人 passed-L1-L2，未完成 L4，不能发布整批。汤桓当前两条 hard 仍为 `knowledge.unknown[0]` 的约工便条与裘砚共享记忆，`contentRevisions[0].changes=[]`，表明补来源复核未改这两叶；不把同一候选重复审查计作两种内容修法。执行代理已按两次失败停止，由本次规划只给一次有实质差异的收尾方案；仍失败即标卡住，不循环模型碰运气。孔馥 10 叶已修，修订后状态 failed 的原因是预算入口拒绝，没有新的 L2 结论。

定点处理：汤桓 unknown[0] 改为“嫌泥点碍路的住户希望自己先清扫哪一处，何时方便再去收尾。”只利用原档住户嫌散泥碍路与收尾目标，不保留无来源的约工便条，不声称住户已同意。共享记忆先保留双方一致的现候选，补入冻结原档裘砚 `relationships` 中 `with=npc_yp_tanghuan/type=同村日常往来/note=认识同村汤桓` 的实际来源；上一补件列汤桓/章颐/利莎/汤茹而遗漏此当事人。这只补充可核验关系证据，不以已过审核的另一候选证明新事实，也不预判“相认/知道职业/货签”整句必定相容。L2 若仍认为事件超出原始来源，停止；不可只改汤桓一侧共享事件而保留裘砚已通过的另一侧，也不可用本次授权重新审核其他 28 人。

预算与验收：授权仍仅原 T06 单卡 2 元，当前 spent=1.81851976、未知 reserved=0.083736、剩余最多 0.09774424；共享 spent=2.7665348 与 20 元波次限额不改变单卡上限。等待 T22 公共 review 稳定预算入口验收后，再按同一卡、同一共享账运行，禁止临时 client 空账或释放未知预留。可无损精简重复上下文：保留完整 before、全部候选 patches、全部 issues、原始引用人物/地点/地方问题、约束及复核边界；去掉由 before+patches 重复表示的 facts/revisions，原人 sourceRecords 仅去掉与 before 严格相等的字段，明确字段来源映射。1800 输出额度不降，不截断正文或隐藏被报错字段。对当前两份保存请求作离线投影，保守预留分别约 0.049068 与 0.045006 元，总计 0.094074 元；此数不含新增裘砚来源及调整后的提示，最终请求须由稳定入口重新按 UTF-8 字节和现有最高费率计算，不能照抄估数或依赖缓存折扣。优先续审已修孔馥一次，再判断汤桓最终请求是否仍可预留；每人仅一次本次规划续审，余额不足或任一仍 hard/截断即保存卡住。两者通过后仍完成本卡原 L1、L4、合并审计和相关/CORE，不把 L2 当 L4，不重跑游戏；本段不另派重叠公共流水线卡。

### T07 苇汀人物深度

目标：苇汀现有 30 份 full 档达到 T04。涉及文件：新增 `world/design/w1-wt-depth.mjs`、`world/drafts/w1/wt-depth/`、`tests/npc-depth-wt.test.mjs`。

实现要点：依据 `world/design/w1-villages-weiting.mjs` 和四村档案中苇束、认户等本地问题，每次派生 3–5 当事人的具体认知、未知事项、行动步骤及共同经历；全村剩余字段按 T04 的 id/field/code 清单定点补，包含报错的 opinions/notes 等设定叶子。复用 T05，不删字段或数组成员，不改合格兄弟字段；仅措辞修正不新增共享记忆。候选不改正式 baseline，保留原身份财物和审核正文中未失败部分。

验收：`node --test tests/npc-depth-wt.test.mjs`、CORE；T05 命令的 design/root 换成本卡路径，prepare 后在独占槽审核。增量预算 3 元且计入 W1 20 元；L1/L2/L4 通过，30 人合并视图无 T04 缺口。不要做：复制榆坡事实、扩大人口、通过编造已完成交易丰富经历。依赖：T02/T04/T05；并行：作者阶段可与 T06/T08/T09/T10，模型独占。

两次修法后规划复核：丁素原档为渔家杂活雇工，当前问题是两户约的杂活撞时。`knowledge.unknown[0]` 改为“雇她做岸边杂活、时段撞在一起的两户，分别愿意将哪一段杂活改约到什么时段。”这明确了雇佣关系和撞时对象，保留工序与新时段两个实际未知，不新增客户姓名、已同意改约或已完成结果；不要仅为了正则将“约”换成“约定”，不改 validator 词表。仅重跑此叶子的候选验证及本卡相关测试；全 401 项最后一项过后保存候选，真实审核等 T22 及模型运行槽。

T07 本次受控内容修订：`world/design/w1-wt-depth.mjs:11` 将 `weitingRoster` 的 row[6] traits 误作 concern，正确事项列为 row[7]；同文件邻人观点生成器固定“与他”，对薛萤等女性错误。只修作者根源及派生失败叶，不改 `w1-villages-weiting.mjs`、source.json、base.json、source hashes、原审计 issues/许可路径，也不改原性别或 goal.content。先逐 id/path 比较旧候选与修正生成结果：家庭备注只把误植的 traits 换为该名册人物原 concern；邻人代称按冻结来源性别，未知性别用姓名，已正确男性叶不得顺手润色。贺芩 `goals.mid[0].steps[0].content` 定点改为“把两份混记号的席边分别摆给各物主看，请各自指出旧补处，再核对各自认出的部分。”与原中目标“当面请物主认旧补处”一致，不再用借盆工序替代；其余未知、共享事件等已正确叶保持原值。

这是本次规划给出的唯一修根源方案。L4 即使发现未被 L2 报出的同索引错误，也须列入本次实际变更清单，不能将旧 passed 视作修后通过；其余已过叶和未变 id 的审核冻结。30 人可离线检查字段映射，但禁止清批重审：仅实际改动 id 的候选/审核哈希失效，已审者走公共受控修订复审，未审者继续首次审核；若所有家庭备注都受影响，照实列出 30 人，而不谎称其仍被旧审核覆盖。冻结原候选、所有请求响应/失败、预算与 before/after hash；生成独立修订记录关联旧指纹和本次 path 白名单，不覆盖或伪造旧 L2/L4。来源声明与基线不能为了让候选通过而变化。

本次验收：在 `tests/npc-depth-wt.test.mjs` 增加名册 concern 列契约、家庭备注不把性格当事务、女性指代及贺芩步骤保持原目标的回归；运行该文件、`tests/npc-depth-pipeline.test.mjs`、`tests/npc-depth-review.test.mjs` 和 CORE。保存完整 id/path 差异，断言除本次名单外旧候选叶逐值相同、基线/来源/审计权限 hash 不变，离线全 30 人审计零缺口。随后使用 T22 公共复审入口逐条 L2，再对新 draft/review hash 做 L4，原哈希 L4 不可复用。仍计同一 T07 单卡 3 元与 W1 波次 20 元，先读实际账并预留下一请求最高费用，保留已发生费用及终止请求未知预留；不新目录、新卡号或重置 revision 来重领额度。预算不足或同一错误两种修法仍失败则保存卡住，不再次找模型碰运气，不扩大至 T06。

T07 六名 manual 补充复核（属于同一次规划处理）：冻结报告为 `world/drafts/w1/wt-depth/sourced/frozen-initial-report.json`，30 人已有 24 passed-L1-L2、6 manual、L4 为 0，原 102 请求/attempts=3 全部保留。单卡 spent=1.99304752、reserved=0、余 1.00695248；共享 spent=4.7697264、reserved=0.083736。上述余额是本次快照，调用前仍读实际账；T25 的零预算合同修复不增加 T07 额度或重试次数，也不解冻 T06。

六人逐叶处理如下。贺芩修三条家庭 note 的 traits/concern 映射及 mid step，按上段方案；支采 `opinions.neighbors[2].view` 的薛萤改“她”，家庭 note 的同索引实错一并列入变更，薛萤 workplace 若被质疑只补冻结原档来源。倪筠两条家庭 note 修映射；`relationships[2].note` 与 `opinions.neighbors[2].view` 关于屈槐在苇束堆放地工作的内容已有冻结 `npc_wt_quhuai.workplace.location=loc_wt_reeds`，是审核来源投影未带 workplace，补原字段及地点 ID/名称，不改正确候选。其四人共享会面转 T25 的明示新背景事件合同，不能仅拿其他参与者候选互证，也不能将 currentConcern 一概视作公开事实。丁素仅修 `opinions.neighbors[2].view` 中茹芹的错误代词及 L4 实际发现的同类叶，原已修未知事项保持。

龚潞两条家庭 note 修映射；`opinions.neighbors[2].view` 的景遥为女性，改“她”，其职业与 `workplace.location=bld_wt_hall` 均有冻结原档来源，补原字段。`knowledge.unknown[1]` 的“龚妍愿不愿陪自己向邻人说明下次换肩的安排”是未定同意，与本人 mid“当面约定换肩和换边”及龚妍原 concern“丈夫挑轻头的事让她被邻人问起”相容；三个 pending 步骤也分别指向现有短/中/长目标，不能仅因旧骨架未列具体步骤就判新增已发生事实。保留这些正确叶，附原目标、step.status、配偶关系与原 concern，由新 L2 实际判断，不改旧 hard 级别。五人会面按 T25 审核，既有秘密“曾把轻的一头留给自己”仍不得复制进其他人的 knowledge 或 memory。

向祯 `knowledge.known[1]` 的居处与配偶由冻结 home 和 relationship 直接支持，不能因第一人称或重复已知关系判无依据；原 home 地点名称并非新产权断言，保留。`knowledge.unknown[0]` 的向菲晚归看不清记号有名册 row[7] 原 concern，补该原来源；unknown[1] 询问郑汐何时能听、mid step 提议请向菲指认，均不是已获同意/已参与的事实，核对原 mid“白日沿原路找回拐点”后保留。两条家庭 note 修索引。五人共享事件中的“戚鹭区分听来的旧水情”必须在独立新背景出处中限定为当场一般性区分亲见/听说，不提、暗示或推断既有秘密“把别人的险遇说成自己经历过”；L4 对照戚鹭原 secret 和原记忆逐句检查，不能借作者权限授权这项秘密外传，无法隔离则该事件停止发布。

来源投影与冻结规则：用现有 `--source-evidence` 提供严格匹配冻结原档的 sex、workplace、home、relationships、goals 及已审核名册 concern；该附件是审核资料，不能据此把他人所有字段灌进 NPC 知识。后续真实 L4 已在 `7f8aacb` 的 `sourced/l4-invalidations.json` 对 24 个旧 passed 给出 64 个实错路径及 quote/source/draft-review hash；原 passed 记录保留，但 operativeStatus=invalidated-by-L4，当前可批准数为 0。只按该实际清单与 6 个 manual 的核实失败叶修订，正确兄弟叶、旧请求和原 foundation/sourceDeclaration 保持冻结，不因 T25 或统一换提示从零重起全村审核。必要新背景出处由 T25 显式另存并校验，不覆写原来源。T07 在 T25 通过前可完成离线差异清单和 L4，付费复审等合同与稳定入口；仍按前述单次规划方案、原增量预算和两修停止线执行。

### T08 砾泉人物深度

目标：砾泉现有 30 份 full 档达到 T04。涉及文件：新增 `world/design/w1-lq-depth.mjs`、`world/drafts/w1/lq-depth/`、`tests/npc-depth-lq.test.mjs`。

实现要点：依据 `world/design/w1-villages-liquan.mjs`、旧标辨字等具体问题，分 3–5 人小批补认知与共同过去；区分居民听过的说法和本人亲历，unknown 不直接泄露问题答案。T04 的 id/field/code 清单覆盖全部不达标字段，包含 opinions/notes 等设定叶子，使用 T05 patch 和指纹约定；不删字段或数组成员，不改合格兄弟字段，仅措辞修正不新增记忆。

验收：`node --test tests/npc-depth-lq.test.mjs`、CORE；T05 的 design/root 用本卡路径，prepare 与正式事实审核分开。增量上限 3 元且 W1 总额不超过 20；L1/L2/L4 完成，30 人合并视图无 T04 缺口。不要做：把古迹传言写成真相、给角色新增技能和授权、新增人口。依赖：T02/T04/T05；并行：作者阶段可与其他村，模型独占。

### T09 桑坂人物深度

目标：桑坂现有 30 份 full 档达到 T04。涉及文件：新增 `world/design/w1-sb-depth.mjs`、`world/drafts/w1/sb-depth/`、`tests/npc-depth-sb.test.mjs`。

实现要点：依据 `world/design/w1-villages-sangban.mjs`、晒纹与公共工场等地方问题，以 3–5 当事人构造兼容的已知事实和共享记忆；目标步骤保持未完成，不把参观花样写成已掌握技能。按 T04 的 id/field/code 修全村缺口，包含 opinions/notes 等设定叶子，复用 T05；不删字段或数组成员，不改合格兄弟字段，仅措辞修正不新增记忆。

验收：`node --test tests/npc-depth-sb.test.mjs`、CORE；T05 命令使用本卡 design/root；增量上限 3 元且 W1 总额不超过 20，L1/L2/L4 通过，30 人合并视图无 T04 缺口。不要做：整批替换文案、未经许可共享私人物资、新增人口。依赖：T02/T04/T05；并行：作者阶段可与其他村，模型独占。

### T10 原有人物与河湾剩余档案补缺

目标：152 人中四村以外的 full 档也达到门槛，原 17 名 traits 修复经验证保留，知识规则句改成具体事实。涉及文件：新增 `world/design/w1-existing-depth.mjs`、`world/drafts/w1/existing-depth/`、`tests/npc-depth-existing.test.mjs`；现有 `world/drafts/m2/` 仅按审计定位读取，不整目录读写。

实现要点：T04 按集合差异得出具体 id，不假定原 18 人六类都不合格；原 17 人 traits 已按 `1bc8f3b` 固定值通过，保持不变并继续核验。每次 3–5 当事人小批，只改审计失败的深度字段和 opinions/notes/familyNotes 等具体设定叶子；已发布经历事实、服务、关系数值及合格兄弟字段不变。把“主持人不要……”等规则话改为有出处的世界内事实，不能清空或删除字段/数组项；仅措辞修正不追加记忆。真实法律禁令保留事实和发布者，继续过 `findNpcRuleWording`。

验收：`node --test tests/npc-depth-existing.test.mjs tests/m2-people-content.test.mjs tests/npc-profile-publication.test.mjs`、CORE；T05 命令使用本卡 design/root；增量上限 3 元且 W1 总额不超过 20，L1/L2/L4 完成，原 17 人 traits 无占位，四村外合并视图过 T04。不要做：把原人物再造一遍、重置教学/库存、假造用户旧经历。依赖：T04/T05；并行：候选与四村文件不重叠可并行，模型独占。

### T11 人物补丁发布及四村/人物波次检查

目标：正式源全体 full 档达到新门槛，将 T04 验证器强制接入 release/final，重复发布保留后续世界变化。涉及文件：`tools/validate-world.mjs`、必要的 `tools/build-world.mjs` 入口、`tools/publish-w1-villages.mjs` 的新补丁兼容、T05 发布器输出的 `world/people/baseline.json`、必要的版本元数据及 `world/drafts/w1/depth-publication.json` 清单；`tests/world-validation.test.mjs`、`tests/npc-profile-publication.test.mjs`、`tests/w1-villages-publish.test.mjs`、`tests/npc-depth-gate.test.mjs`。

实现要点：按审核指纹串行应用 T06–T10 补丁，不直接复制各树 baseline；合并已存在 memorySeeds 及既有更晚修订，冲突停在具体 id。逐条核对补丁属于冻结审计失败叶子，原有字段/数组成员未被删空，17 人 traits 固定值保留；新审核清单接入旧四村发布器，重复发布不得恢复旧 opinions/notes 或抹掉新补丁。全部候选合并视图必须经 `validateNpcDepth` 全项和 `findNpcRuleWording` 无缺口，不仅是六类深度；再将质量验证强制接入 `validateWorld` 的 release/final 分支，同一提交包含正式内容和入口，不留跳过开关。T04 测试里“现有正式数据存在缺口”的阶段性断言改为合格正式源和独立缺口夹具，保留所有负例及 17 人固定值回归；engine 旧夹具结构约定保持。复用 `world_upgrade`，旧文档状态、财物、记忆与消耗库存不回退。正式数量仍为现有人口；审查抽样包含各村地方问题当事人及原人物。

验收：`node tools/publish-npc-depth.mjs --manifest world/drafts/w1/depth-publication.json` 预演后 `--publish`，重跑零写入；`node --test tests/npc-profile-publication.test.mjs tests/w1-villages-publish.test.mjs tests/npc-depth-gate.test.mjs`、CORE；主会话在波次检查运行 `npm run build:release`，预期人物质量零缺口。如其他类别构建失败明确登记，不能降低门槛。随机 10 人平均至少 4、单项至少 3；不调用新模型。不要做：增加人口、部署；依赖：T03/T06–T10/T21；并行：不可与写人物或版本数据的卡并行。通过后主会话打 `review-w1-depth` 并派规划审核。

### T12 修复 M2 审核截断和引用失败

目标：现成会话证据能被完整逐 N 项审核，不靠重跑游戏来修评分器。涉及文件：`tools/npc-acceptance.mjs`、`tools/playtest-review.mjs`、新增 `tools/review-playtest-report.mjs`、`tests/npc-acceptance.test.mjs`、`tests/playtest-review.test.mjs`、`tests/playtest-npc-evidence.test.mjs`。

实现要点：保留 `reviewNpcRequirements` 的逐字 quote、合法回合和完整编号校验，按单个 N 项或有限窗口组织证据，避免一次整场 5000 token 输出截断；缺项、length、编造引文都失败，不用人工 true 代替。复用已保存 `sceneBeforeReply`、calls/assertions、N17 新增行动证据；新增 CLI `--input`、`--output`、`--budget` 只重评已存报告，不调用游戏工具、不覆盖旧失败原文。`reviewPlaytest` 的两回合分段保留完整性聚合。

验收：上述 3 测试及 CORE；mock 覆盖 length、错误引文、缺 N 项、重复 N 项，任何不完整均未通过；只读旧报告重评命令在 T17 才调用模型，本卡预算 0。不要做：放宽引文、删低分会话、重启已完成进程。依赖：T01；并行：可与人物候选，无重叠测试/工具时可与 T14。

已知恢复限制：已合入实现以 `logs/playtest-review-budget/<evidenceHash>.json.lock` 的 `wx` 排他创建保护预算，正常退出在 finally 删锁；强制终止可以遗留空锁，现有锁不带可核验的 PID/启动身份。保守判定为可人工恢复的已知限度，本次不新增自动解锁卡，也不宣称强杀后能安全自动恢复。重跑前主会话确认原运行进程及其后续任务确已结束、没有同证据哈希的其他重评；无法确认则不删锁。确认后仅移除该确切 `.lock`，保留同哈希预算 JSON、usage 日志及 spent/reserved，绝不清预算或仅凭文件年龄解锁；恢复客户端会将旧预留计入费用上界。原输出可能为空或不完整，保留并换新的输出文件名，同一份输入证据继续使用同哈希累计预算；不修改输入来换预算。若后续证据显示锁拥有者无法确认或无人值守反复被此阻断，再拆带身份核验和强杀回归的小卡。

### T13 M2 真实前置与行动链修复

目标：修复最新失败里的私宅等候、推搡司法、燕麦购买与三人同场前置，保留 8–20 轮真实自然输入。涉及文件：`tests/playtests/npc_home_visit.json`、`npc_shove.json`、`npc_quest_social.json`、`npc_voices.json`、`npc_offscreen.json`、`tools/playtest-assertions.mjs`；必要的引擎缺陷限 `server-plugin/engine.mjs`、`law.mjs`、`agriculture.mjs`，相关单文件测试。

实现要点：依据最新失败回合定位实际服务时间、位置和物品可得路径；等待 60 分钟必须实际 60，乡巡链按真实在场权限走，燕麦只买到指定商品才继续条件委托。N12 三人同时在场可说话，从现有作息路径安排，不能直接移人；N17 使用离开十天窗口内新增结算行动。前置改变不能把“60 分钟”改成当前错误的 13 分钟，不能在玩家句里提示工具名。新增离线前置测试用真实引擎和现有工具路由，测试夹具不强制成功骰点。

验收：`node --test tests/playtest-runner.test.mjs tests/playtest-npc-evidence.test.mjs tests/npc-obligations.test.mjs tests/law.test.mjs`，改动农业时仅其对应命名测试，CORE；新增 `tests/m2-preconditions.test.mjs` 全部链路通，日志有实际位置/分钟/钱物证据。模型预算 0，真实复测统一 T17。不要做：虚构到货和库存、改断言掩盖失败、为每条叙述加新工具。依赖：T01/T03/T21；并行：不与 T02 或任何 engine/law/agriculture 改动并行，可与 T12。

### T14 原送货树的 M3 语义耗时 WIP 收尾

目标：完成 `241552d` 的语义时间核验，区分“回放一致”与“符合玩家要求/行动耗时”。涉及文件：原 `F:/dnd-worktrees/npc-delivery` 的 `tools/m3-soak-timing.mjs`、`tools/m3-soak-adapter.mjs`、`tools/m3-soak-state.mjs`、`tests/m3-soak-timing.test.mjs`、`tests/m3-soak-adapter.test.mjs`。

实现要点：先核对 WIP 的导出及调用接口，只围绕已存在 semantic timing 变更补完；等待钟点、持续分钟、工具自身已计时、允许等待后交谈、尾注再次计时分别核验。语义时间证据绑定原输入和实际调用，不把重放前后时间差零作为语义通过；未确定样本记录 unknown，不能悄悄算零偏差。

验收：`node --test tests/m3-soak-timing.test.mjs tests/m3-soak-adapter.test.mjs tests/m3-soak.test.mjs`、CORE；60→13/36 和“六小时→六时辰”负例能够暴露，合法等待后明确交谈不误报，恢复后测量不重复。模型预算 0。不要做：启动 300 轮、再做送货机制、丢失原 WIP。依赖：无，原树已停止需重新确认；并行：可与 T01/T20。完成后由主会话合入并改 PROGRESS 状态。

### T15 知情边界与离屏回忆的实际失败修复

目标：无关人物不泄漏私密任务，NPC 回忆与本次实际制作材料、次数、费用和成败吻合。涉及文件：`server-plugin/consistency-evidence.mjs`、`consistency-review.mjs`、`consistency-service.mjs`、`npc-cognition.mjs`、`npc-memory.mjs`，必要时 `extension/prompt.mjs`；`tests/m3-consistency-evidence.test.mjs`、`tests/m3-consistency-integration.test.mjs`、`tests/npc-cognition.test.mjs`。

实现要点：沿已有审稿专用 knowledge 和任务/历史许可摘要修最小缺口；实际 sceneBeforeReply 与来源事件成为证据，未知委托不因审稿看见就转发给说话人。阿砚回忆只使用 N17 当前离开窗口里的结算记录，材料和失败成本来自账本。仍最多一次纯文字改写，不再次执行交易；严重未修正仍阻止尾注，warning 仍保持需复核。

验收：上述定向测试、CORE；用保存失败原文形成回归，未知角色对话泄漏被拒绝/修正，允许的亲历或已合法转述不误报，改写不能改变账本。模型预算 0，真实验证在 T17。不要做：全知传播、在提示里禁止正常小动作、把 warning 视为通过。依赖：T01/T13；并行：不与同文件审稿/检索改动并行，可与 T14。

### T16 M2 汇总门槛与选工具实测口径

目标：统一报告有效 N 覆盖、账本率、零泄漏和选错工具率，退出码与报告一致。涉及文件：`tools/playtest-metrics.mjs`、`tools/playtests.mjs`、`tools/npc-acceptance.mjs`、`tests/npc-acceptance.test.mjs`、`tests/playtest-runner.test.mjs`。

实现要点：复用 `summarizeNpcAcceptance` 的 measured/pass 与 N6/N16/N17 强制项，至少 12 个有效项、N 项通过率至少 90%、账本断言至少 90%，知情泄漏零失败且 N6/N16 均有完整证据。`toolSelectionMetrics` 保留 opportunities/missed/wrong 分母，枚举类别错误与参数/目标错误分开记录；工具全漏调用不是错类零风险。标注所有被测明确行动及条件前置，不用未标注样本冒充实测。N12 缺匿名盲辨仍失败。

验收：上述测试、`tests/playtest-npc-evidence.test.mjs`、CORE；mock 验证高账本率但泄漏/未测/N12缺样本仍失败，12 项联合门槛正确，opportunities=0 为未测。模型预算 0。不要做：调整现有门槛、丢弃失败样本、杜撰实测数字。依赖：T12/T13/T15；并行：不可与 T12 相同文件并行。

### T17 M2 里程碑真实验收

目标：以修复后的正式提示栈取得 M2 联合验收证据。涉及文件：仅 `docs/测试报告/最新/` 的报告、失败摘要及费用记录；执行前读取实际脚本 id，默认十场 id 为 npc_social,npc_private,npc_shove,guide,npc_delivery,npc_quest_social,npc_home_visit,npc_offscreen,npc_voices,npc_courier，若文件内 id 不同以实际值构造 `--only`。

实现要点：先用 T12 重评工具核查保留失败，重评不算修复后的试玩；用真实 HTTP 存储与 MemoryIndex、正式角色卡/提示源、实际模型前缀和历史，禁止伪造工具结果。主会话独占模型槽，保存 prompt/scenario hashes、实际 token 和花费上界、选错/漏调用分母。测试前置失败是失败，不用人工改世界续场。

验收：`npm run test:playtests -- --milestone M2 --only npc_social,npc_private,npc_shove,guide,npc_delivery,npc_quest_social,npc_home_visit,npc_offscreen,npc_voices,npc_courier --repeat 1 --parallel 4`；这些 id 已在现有 JSON 核对，若 T13 新增必要 N 项会话则同步加入。单轮总预算 30 元，T12 重评增量最多 2 元并合并预算，缺环境变量记阻碍，不读密钥文件。至少 12 项完整覆盖且通过率不低于 90%，账本断言至少 90%，N6/N16 零泄漏，N17 十天新增行动自然呈现，选错工具率为实测数且有分母；N12 若计入必须匿名盲辨通过。每条失败最多一次复测，失败保留并交规划拆修复卡。主会话跑 CORE、`npm test`、`npm run build:release` 作为里程碑检查；子代理不跑全量。不要做：反复整批重跑、自动宣告 M2 完成。依赖：T11–T16 及 T23 全部完成；并行：模型阶段不可与任何模型卡并行。达标打 `review-m2`。

### T18 已审核 14 法术的学习来源

目标：每条已有候选都有玩家实际能获得的学习来源。涉及文件：`world/design/w2-reuse-candidates.mjs`、新增 `world/design/w2-reuse-learning.mjs`、`world/drafts/w2-reuse/` 的来源审核记录，必要的新书/教学数据候选；新增 `tests/w2-reuse-learning.test.mjs`。不提前改正式人口。

实现要点：复用 `reuseSpellCandidates` 的已实现效果，17 正式法术与 14 候选保持去重；参考 `tools/publish-m4-batch2.mjs` 中 spell/book/learning source 合并形状及现有书籍取得方式。来源可为实际已有合资格教师或有可买/可借路径的书，导师 services/serviceCatalog 白名单、技能条件、价格和地点作息必须一致，不能只是 catalog 文本里提到一本不存在的书。新来源按审核流水线，原法术已审核正文不重写。

验收：`node --test tests/w2-reuse-learning.test.mjs tests/w2-reuse.test.mjs tests/m4-publication.test.mjs`、CORE；14 条来源引用、取得、学习失败成本和学习后施放路径均可验证。内容 L2 只审来源增量，上限 1 元并计 W2/M4 共用 20 元账，L1/L2 无硬错、L4 完成；候选正文审核指纹没有改动则复用。不要做：新增法术、新增处理器、无成本赠书或免费学会。依赖：T17 达标；并行：可与不触碰魔法目录的 M3 整理，无其他模型块时审核。

### T19 14 法术正式发布与效果复核

目标：把审核完整的 14 条法术并入 world 正式源及可用取得链，预计目录从 17 增至 31。涉及文件：新增 `tools/publish-w2-reuse.mjs`、`world/meta/spells.json`、对应书籍/教学/库存正式源、`tests/w2-reuse.test.mjs`、新增 `tests/w2-reuse-publication.test.mjs`。

实现要点：复用 `readApprovedContent`、`mergeM4Batch2` 的严格冲突/幂等策略及 `world_upgrade`；更新原“候选尚未发布”的测试预期为发布后仍检查内容一致和效果实际改变，不能直接删检查。14 条技能/材料/许可、距离、持续效果消耗保持已有机制语义；学习来源随世界升级进入已建战役，不回补已售空商品和旧现金。

验收：`node tools/publish-w2-reuse.mjs` 预演后 `--publish`，重复零写入；`node --test tests/w2-reuse-publication.test.mjs tests/w2-reuse.test.mjs tests/m4-publication.test.mjs tests/magic-primitives.test.mjs`、CORE。主会话波次 `npm run build:release` 通过、打 `review-w2-reuse`，模型预算 0。不要做：部署、把相近效果算成缺失机制、用目录数代替效果测试。依赖：T18；并行：正式 world 目录写入串行。

### T20 原人物树的玩家账本面板 WIP 收尾

目标：完成 `035d792` 已有小块界面，不把它算成完整 M6。涉及文件：原 `F:/dnd-worktrees/npc-depth` 的 `extension/ledger-view.mjs`、`extension/runtime.js`、`extension/style.css`、`tools/deploy-engine.mjs` 打包清单，及 `tests/runtime.test.mjs`、`tests/history-window-integration.test.mjs`、`tests/m3-consistency-browser.test.mjs`。

实现要点：只收尾已存在的玩家可读账本投影，读引擎真实状态，正常面板不泄漏 raw JSON、未知 NPC 私密信息或调试字段。打包入口可改文件清单，不执行 activate/deploy。在隔离页面验证渲染、历史剪裁、审核提示与移动视口，沿现有 Playwright 测试设施截图。

验收：上述三个测试和 CORE，隔离页面 390×844 无横溢/控制台错，截图及浏览器验证报告归最新报告；模型预算 0。不要做：借此重做完整界面、动用户酒馆、启动图像或语音付费服务。依赖：无，确认原树已停止；并行：可与 T01/T14，不能与 extension/runtime 的其他卡并行。

### T21 四村传闻从源人物到玩家获知的可达性

目标：40 条已有来源传闻能先进入 source/carriers 本人的未核实认知，再通过真实在场交谈让玩家获知，并由现有编年史/记忆索引检索。涉及文件：新增 `server-plugin/npc-rumors.mjs` 和 `tests/village-rumor-access.test.mjs`；接入 `server-plugin/npc-memory.mjs`、`server-plugin/scene-card.mjs`、`server-plugin/engine.mjs` 的 remember 分支、`server-plugin/chronicle.mjs`、`extension/tools.mjs`。本卡不改 T03 的 settlement-profile/catalog/retrieval/index 文件与测试，不改 T06–T10 的 world/design、world/drafts、baseline 或人物验证器；若发现非改这些文件不可，先回主会话调整所有权，不自行扩大范围。

实现要点：只读 `world.settlementProfiles[].details.rumors`，复用既有 `{id,claim,source,carriers,status,propagation}`；新增 helper 返回最小投影 `{id,claim,source,reliability:'未核实'}`，只给 source 或明确 carriers 本人，不把 witnesses 自动视为已听过 claim。动态投影单独放入 npcContext 的传闻字段，scene 按当前在场者及查询选择相关条目；每条 claim 可通过对应话题读到，不被 known 前 100/180 字截断永久遮蔽，场景仍不超过 6000 字符。该投影不改任何已达标的静态 knowledge/memorySeeds/opinions 叶子，不预先写 player 记忆，不把全村种子塞进自动传播的 memoryStream。`truth`、`fact`、verification、hiddenPlaces 和作者解法均不进入人物提示、工具返回、事件摘记或玩家搜索。

优先复用既有安全入口：当前 `WorldEngine.remember` 只验证自由文本，`shareNpcMemory` 要求收件人为完整 NPC；两者原样均不足以证明玩家合法获知。最小方案是在现有 `world_remember` 增加可选 `rumor` 引用，沿已有 subject/key/source/content 接入受校验分支，不新增公共工具。调用合同为 subject 指玩家、rumor 与 key 指同一登记传闻、source 指当前讲述者；content 只能与该人可讲的 claim 一致，实际回执与记忆文本从登记 claim 生成，不能相信模型传入的真相或篡改说法。该动作代表一次实际问询/讲述，校验玩家可行动、讲述者清醒在场、既有义务/活动允许交谈，并按现有会话计时约定结算一次；不能因两人仅同处一地就自动获知全部传闻。若执行者找到已有同时满足这些条件的安全调用，直接复用，说明证据，不再添加可选字段。

获知后记录的权威事实是“玩家在何时何地听到某人说 claim，尚未核实”，不是 claim 的内容为真。将该交谈产生的、仅说话人与玩家可见的确定性事件交给 `recordNpcMemories`/`collectChronicleFacts` 既有链，复用 `syncChronicleIndex` 和真实 `/search`；若用交谈 memoryStream，保留参与人、sourceEvent、sourceType 及未核实措辞，使事件摘记知道听说来源，不能仅把自由文本 `remember.content` 提升为 verified。去重依事件/传闻/讲述者与现有回放语义，重复调用不重复计时或新增同一获知；撤销/重生成、重启、导入导出后，获知与索引同步。新增事件不得被现有自动 NPC 传播当作向全村公开的许可，本卡不接完整传播路线/失真机制，仍归 R08/R09。

验收：`node --test tests/village-rumor-access.test.mjs tests/npc-memory.test.mjs tests/npc-cognition.test.mjs tests/chronicle.test.mjs tests/m3-retrieval.test.mjs` 及 CORE 全过，模型预算 0。新增测试覆盖全部 40 条源/携带者投影和非持有者隔离，并对各条登记 claim 通过受校验的实际引擎动作产生可追溯获知，不仅检查静态数组；每村至少一条经合法移动/等候接近人物→话题场景→真实工具路由交谈→Store 持久事件→真实 `/search` 的完整链。测试可用隔离世界/存档，不能向聊天、玩家记忆或 heard 记录直接塞 claim 代替交谈，也不能直接改 NPC 位置绕过到场。首次交谈前自然关键词搜不到未获知 claim，交谈后能搜到带讲述者和未核实标记的 claim；未到场、睡眠/失能、冒充 source、改 claim、请求 truth、只看 public catalog 均不得产生获知。覆盖重放/重复、重启、导入导出和撤销后索引清除；静态 NPC 内容前后不变，公共工具仍 25 个。给出链路证据，不宣称本卡通过了真实模型叙述。

不要做：重复核验 37 人缺口、改写 40 条已审核正文或静态 NPC 合格字段、新增人口、公开真假、自动全村传播、借此完成 300 传闻或世界时钟、调用真实模型、降低知识门槛。依赖：T02 已合入；按 T03 已确认的检索合同实施，最终联合验收要求 T03 完成。并行：可与 T03 和 T06–T10 作者块并行，因为文件所有权分开；不与 T13/T15 或任何 engine/npc-memory/scene-card/chronicle/tools 改动并行。新树 `F:/dnd-wt/T21`、分支 `t21`；本卡是用户第 1 项四村完成前置，也是 T11/T13 依赖。

### T22 人物起草顶层合同与共享/单卡预算护栏

目标：修复 T06 反复返回 candidate 外壳的接口不一致，严格事实/字段校验不变；将稳定单卡额度与共享 20 元总账分开，使中断和交错续跑不多花、不假退款。涉及文件：`tools/npc-depth-content.mjs` 的 `patchDraftRequest`/`extractDraft`、`tools/npc-depth.mjs` 的 allocation/运行与恢复、`tools/content-pipeline.mjs` 的请求/记账/定点恢复；必要时新增 `tools/content-budget.mjs`，新增 `tests/npc-depth-contract.test.mjs`、`tests/npc-depth-budget.test.mjs`，补 `tests/npc-depth-pipeline.test.mjs`、`tests/content-pipeline.test.mjs`。不改作者 design、30 人补丁正文、T04 验证器或发布白名单；实际失败记录的受控恢复由主会话在本卡通过后执行，不在测试中改真实预算账。

合同实现：`patchDraftRequest` 明确顶层且仅有 `{id,contract:'audit-patch-v1',patches:[{path,value}]}`，给实际字段 schema/示例，去掉“返回 candidate JSON”歧义。如保留有限 unwrap，只接受顶层恰好一个 candidate 键、值为非数组对象、内层恰好 id/contract/patches 的单层外壳；标准顶层仍支持。两种格式最终都必须与 `patchDraft(entry)` 严格 deepEqual，再走原 `validateDraft`、失败路径授权、preservedShape 和 `verifyUnchanged`；不修正模型给错的 id/contract/path/value，不丢多余键、不合并内外层、不递归寻找候选。其他旧人物批次合同保持不变。mock 必须使用本次赵枫失败中的单层外壳形状，不能只返回从请求里取出的理想 candidate。

定点恢复：现有 pipeline 对同指纹 manual 默认跳过，attempts=3 即使 retryManual 也无下一次循环；不能只修提示后宣布可续跑。增加显式、可审计的协议恢复入口和 CLI 帮助，以调用者指定的受影响 id 为白名单，只处理有该合同错误证据、尚无合格 L2 的记录。保留原 attempts/错误/指纹/用量，独立记录一次协议恢复机会，不重置内容重写次数；passed 条目始终跳过，无关 manual 不受影响。若原完整响应确实保存，可先以新解析器离线恢复合法 draft；本次单条 JSON 仅见 assert 错误差异时，不能把错误字符串当原始响应伪造成功，使用保存的冻结候选进行一次受限恢复请求，然后正常 L1/L2/L4。仍出合同错就停，不再盲试；不清整批记录，不凭新 revision 重跑全部审核。

预算事实与方案：现有 `runContentPipeline` 会把 client.budgetYuan 写入共享 limitYuan，而 `runDepth` 将本卡起始共享余额加增量当 client 上限，正常 finally 才恢复 20；强杀后 finally 不运行。下一卡使用新 client，所以旧 2.94801504 不直接限制它，但旧卡复跑时其他卡的费用会消耗其固定阈值。改为共享账固定 waveLimitYuan=20、总 spent/reserved 与每个稳定 card/allocation 的累计 spent/reserved/增量上限分别核验；T06 上限 2，T07 上限 3，换输出目录、revision、重启都不得新领额度。共享额度是所有卡花费之和，单卡只计本卡；保留历史混合余额不强行分给新卡。可将分卡分录与共享聚合放在同一原子写入中，避免两份账间强杀导致漏记；如果分文件，须有请求标识和保守恢复合同及相应故障测试。仍同一时间只跑一个真实模型块，不引入并发调度系统。

请求发出前同时检查并持久化共享与单卡预留，成功按响应 measurement 结算；无最终用量的终止请求继续保留预留或显式转为等额“未知费用上界”，两种账的占用总额均不得下降且只计一次。旧账迁移必须检查匹配的 allocation 中 waveLimitYuan=20、increment=2、startingSpent=0.94801504 与 legacy limit=2.94801504，未知来源的低限额不能擅自提高。本次 T06 已知归属为请求费用 0.15959304 加未决预留 0.083736，共占用 0.24332904；本卡剩余最多 1.75667096，共享剩余最多 18.80865592。后续 T07 单卡最多 3，仍逐请求受剩余共享额约束。用量的二进制浮点尾差可按既有精度容差处理，不得把真实预留归零。移除依靠 finally 改回共享上限的办法，流水线预算写入须保留分卡元数据；恢复前后出具账面差异，不能以初始化空 budget.json 修复。

验收命令：`node --test tests/npc-depth-contract.test.mjs tests/npc-depth-budget.test.mjs tests/npc-depth-pipeline.test.mjs tests/content-pipeline.test.mjs tests/deepseek-transport.test.mjs` 及 CORE；模型预算 0，只用 mock 和临时账。合同测试覆盖合法顶层/有限外壳、wrong id、wrong contract、改 path/value、增删 patch、额外键、混合内外层、数组/null/多层壳，非法内容仍拒绝。恢复测试覆盖 manual+attempts3 仅指定协议错误可获一次恢复、passed 零调用、无关 manual 不重跑、L2 仍必需且失败不算完成。预算测试用当前精确余额重现强杀残留，在预留后中断与跨卡交错后，T06 恢复不被 T07 费用挤占/不重领额度，T07 不能超过 3，共享不能超过 20；卡/共享任一不足都在调用 mock 前拒绝，遗留 0.083736 不丢失不重复扣计。验证原旧内容流水线合同仍可运行，不仅测试新适配器。

不要做：真实模型试探格式、重跑游戏、改人物事实或知识门槛、批量放宽 JSON、伪造 L2/L4、清空预算/预留/失败记录、新建空账、把未知费用当已退款。依赖：T05 与已保存的 T06 失败证据；独立 `F:/dnd-wt/T22`、`t22`。可并行：T07 仅本村最后叶子的离线修订、T08–T10 候选作者、T21 引擎传闻；不可与任何改公共内容流水线的块并行，T06/T07 真实审核冻结到本卡及合后 CORE 通过，由主会话按原增量额度逐卡恢复。

### T23 review-001 四村税贸真实作息联动验证

目标：补齐 P2 验收证据缺口。`tests/village-ledgers.test.mjs:16` 删除全部 NPC schedule/tier，且 `at` 与送达前直接摆放管理员；现有检查证明账本守恒和权限拒绝，尚不能证明保留正式作息时可完整办理。抽样四村管理员的默认柜台时段均为 480–720、780–1020 分钟，未发现柜台永久不可达，故本卡不把缺证据说成已确认功能故障，也不阻塞人物离线修订。

涉及文件：新增 `tests/village-trade-live.test.mjs`；只拥有该测试文件，不改已审核世界内容、T22 流水线或现有税贸实现。实现要点：复用 `loadWorld`、`WorldEngine.createCharacter/reduce`、`applyPatches` 与现有 `modelToolCall` 公共路由，在正式日程未删改的新建内存存档中，从默认出生点以 `world_move/world_time` 到卖方议事屋，按 `world_field` 的 `farm_settle_trade` 提粮，再走现有道路到买方实际在场窗口交付。四份试行粮约分别使用独立存档，保持原开局资源；不得修改 NPC 位置、活动、状态、日程、tier 或直接增加粮钱来造成功。路途中实际扣费、吃粮、损耗照实保留；对照分阶段 ledger 的 prepaid/paid/received/tax 和玩家、买卖双方实际铜钱增量，不用旅途中总差额误判税贸守恒。至少一条链验证休息/不在场时拒绝且无扣款，再正常等待到实际柜台窗口成功；重复请求与导出重载不能重复收付。产量仍只是天气前潜力，未经模拟不推断长期生存。

验收命令：`node --test tests/village-trade-live.test.mjs tests/village-ledgers.test.mjs` 与 CORE；四份粮约在保留正式作息和实际行走后均完成，源方预收归零、总货价 60 铜分列净额 57/税 3、买方实际支付与库存变化一致，报告保留关键分钟、位置、玩家及买卖双方钱物快照。模型预算 0；不运行真实模型或长年农业模拟。如果真实前置失败，最多按执行规则试两种修法，保存复现证据后交规划定点拆卡，不能在本卡扩大引擎文件所有权。

不要做：删日程、强移 NPC、强制骰点、静默补资源、部署、拿本卡代替模型自然叙述验收、重复 T21 的 40 条传闻验证。依赖：T02/T21 已合入；新树 `F:/dnd-wt/T23`、分支 `t23`。可并行：T22、T06–T10 内容作者和审核；与修改 agriculture/engine/作息运行的卡串行，避免验收版本漂移。本卡完成后作为 T17 前置证据归档；T13 可先执行，T17 开始前须完成本卡或处理其实际失败。

### T24 旧人物发布器保留已发布教学增量

目标：解除 T10 的旧 M2 发布兼容阻断，保留许苓已正式发布的四项教学服务及新增技能，同时继续拒绝无来源的变化。现状是 `tools/m2-people-publish.mjs:37` 将正式 services/skills 与旧 M2 baseline 逐值等同；正式许苓在 `spell_light/profession_mage` 外已有 `spell_earth_03/spell_fire_07`，来源为 `world/drafts/m4-batch2/learning-sources.json` 的 teacherChanges。旧档审核有效不意味着可撤回后续发布。

涉及文件：`tools/m2-people-publish.mjs`、`tests/npc-profile-publication.test.mjs`、新增 `tests/npc-publication-increments.test.mjs`；如确需抽取只读凭证 helper，可新增 `tools/npc-publication-sources.mjs`。不改 M4/W1 其他发布器、T10 作者候选或正式世界数据。复用 `hashContent/readApprovedContent`、`readM4Publication` 的审核与来源映射校验、`mergeM4Batch2` 已有追加去重语义及 `publishNpcProfiles` 发布前文件哈希/临时文件替换。世界 `rules.version` 和 `npcStockUpdateVersion=1` 只能作为版本背景，不单独充当内容授权；若复用模块有加载副作用，只抽取所需只读验证，不运行模型或重发 M4。

实现要点：为 mergeNpcProfiles 提供经验证、与当前 world/root 绑定的后续已发布增量凭证，按 npc id 分别列 services/skills。凭证须来自原 M4 审核记录及 teacherChanges/mappings，且对应正式 spell、skill、teacher 关系确已存在并相符；只有候选 JSON 或仅 ID 已登记不够。本次精确增量为许苓服务 `spell_earth_03/spell_fire_07` 与技能 `skill_fire_07/skill_earth_03`。旧 baseline 各项必须完整保留，当前数组仅可等于按原发布顺序去重追加这些已发布项的结果；拒绝删除、替换、乱改技能表示、额外未审核项、其他 NPC 冒领和来源不匹配。不得让所有超集默认合法。intelligence/aliases/flags、来源事实、作息、年龄与已发布完整档后续变动仍走原严格冲突检查。合并结果直接保留当前受保护 services/skills，不重算教学表、不覆盖运行钱物；未传有效凭证的直接纯函数调用仍拒绝未知变化。

验收命令：`node --test tests/npc-profile-publication.test.mjs tests/npc-publication-increments.test.mjs tests/npc-traits-publication.test.mjs tests/m4-publication.test.mjs` 与 CORE，模型预算 0。证明真实正式世界的 prepare 不再在许苓 services/skills 拒绝；临时目录首次预演/写入后再次预演 changed=false，许苓服务和技能完全保留、钱物与 17 人 traits 不变。反例涵盖删原服务、伪造新服务/技能、技能同 ID 内容冲突、伪造或缺失来源、未正式发布的合法草稿、错导师、来源审核哈希变化与其他身份冲突；仍保留旧 L2/L4 及候选篡改拒绝测试。不得将后续完整档内容冲突也一并忽略：遇到新的真实不兼容差异，报告具体字段给规划，不在本卡放宽。

不要做：重置 services/skills、重跑模型、改旧审核基线或补丁白名单、静默回滚后来人物修订、部署或修改存档。依赖：已合入 M4 学习来源和 T10 `4f0bfe4` 的阻断证据；独立树 `F:/dnd-wt/T24`、分支 `t24`。可并行：T07 定点作者修订、T22 公共预算入口；不可与写 m2-people-publish 或同测试文件的卡并行。完成后解锁 T10 的该项发布回归与 T11；主会话合后 CORE 并记录真实结果。

### T25 人物定点审核明确新背景事件的作者出处

目标：修复 audit-patch-v1 对用户授权新增背景的合同遗漏。用户要求从地方问题派生 3–5 当事人的已知、未知、目标与共享记忆；旧 `buildReviewRequest` 对 legacy 明确 facts 是经设计补入的事实，patch 分支却一律要求候选新增事实已有旧来源，且没有独立新事件出处。新背景可经作者设计后审核，不能只因 before 没发生过而拒绝；同时候选文字自身不能成为授权、完成状态、财物变化或秘密传播的证据。

涉及文件：`tools/npc-depth-content.mjs`、`tools/npc-depth-review.mjs`、`tools/publish-npc-depth.mjs`、必要的 `tools/npc-depth.mjs` 指纹衔接；新增 `tests/npc-depth-authored-background.test.mjs`，补 `tests/npc-depth-sources.test.mjs`、`tests/npc-depth-review.test.mjs`。只做公共合同与 mock 夹具，不写 T07 世界正文。实际事件出处由 T07 作者另存 `world/drafts/w1/wt-depth/authored-background.json`，与原 source.json、base.json、sourceDeclaration 分离且不覆写；其他卡不得自动套用新出处或获得恢复机会。

实现要点：新增可选、显式 opt-in 的作者出处包，标识 `kind=authored-background`、稳定 event id、revision、参与者 IDs、地点、past-but-unresolved 状态、允许叙述的事实、尚未发生/尚未约定的结果，以及逐字段 `sourceRefs`。来源引用记录路径/ID/字段与内容 hash，指向已发布地方问题、原职业/日常活动等事实；区分来源本来已存在的事实与本次新设计的共同在场/发言。不能将模型候选、review 结果或另一人的候选列为来源，也不能把当前自动生成 prose 提升为已审核来源。公共地方问题有 ID 就引用；普通日常关切若仅在人物私有档，必须明确本次获授权设计的公开说话范围，不能把其全部 concern/secrets 默认公开。作者新事件仍需 L2 查相容性及 L4 实审，出处声明不等于自动通过。

L1 跨人约束：事件只关联本卡原审计允许的新增 memorySeeds 路径、现有人物及有效公开地点；3–5 人是每项地方问题的当事人网络范围，并非每条共享记忆人数下限，允许同一问题网络内的两人旧事，不强迫已审核两人记忆重做。所有参与者的对应 event id/事实/地点/knownBy 集合一致，未参与者无新增获知；不能改原 memory/secrets.knownBy、原身份性别、钱物技能、原目标内容/进度/步骤状态或其他合格叶。新事件只描述交流待办与未解决分歧，不隐含真实交付、付款、授权、完成任务或新增人口。与原秘密有语义接触的内容必须进入显式风险清单给 L2/L4；自动字符串检查只是补充，不能替代语义审核。候选能逐条追溯到冻结出处，超出参与者/地点/事实范围的叙述拒绝。未来询问或 pending 步骤不作为已经同意/已执行事实，真实目标偏移和具体性不足仍拒绝。

审核与发布：仅请求明示该出处的 id 获得相应审核上下文；原 before 与全部补丁仍可见，另列新设计事实、原来源、禁止泄漏的秘密及待定结果，不能笼统宣布 entry.facts 全为权威。保持旧 record/attempts/失败和原 foundation/sourceDeclaration；新出处 hash、适用 id/path、候选 hash、review hash 和 L4 必须组成可检查的增量凭证。如当前发布合同不能承载增量，新增显式凭证字段并保留原指纹映射，禁止直接改旧 passed/foundation 来装成同一审核。发布器复核原来源 hash、新出处 hash、全参与者候选一致与新审核覆盖；篡改出处、成员、候选或缺新 L4 都拒绝。来源证据扩展优先复用现有只读 `--source-evidence`，不复制其账本或复审流程。T06 已达停止界限，必须继续冻结；本卡不会清理 recovery 标记、增加重试、改预算、追认任何旧失败为成功。

受控内容修订衔接是本卡必做部分：当前 `npc-depth-review` 对 passed 直接跳过，改 patch 又会触发 entry 指纹冲突，不能只改提示后要求 T07 重跑。提供显式修订入口，将旧完整 record、原 baseline/foundation/source hash、实际 L2 hard 或 L4 invalidation 的 id/path/quote/source/hash、批准的 before/after patch 差异及本次规划标识绑定成修订链。允许路径须同时满足原 audit 许可与这次真实失效清单，不能删成员、改正确兄弟叶、改原来源/基线或靠换 revision 领取新机会；仅补审核来源的条目可保持 draft 不变并登记补件 hash。原 passed 保持历史记录但失效条目不能跳过，旧 attempts/失败/费用不清；每个获本次规划授权的失效 id 只给已授权的定点修订复审机会，成功仍需新的 L4 和发布覆盖，不循环生成新修订机会。T06 不在本次适用列表。所有实际付费继续用原 T07 cardId/root/共享账及 3 元限额；本卡的 source 合同阶段不能另开有费审核绕预算。

验收：`node --test tests/npc-depth-authored-background.test.mjs tests/npc-depth-sources.test.mjs tests/npc-depth-review.test.mjs tests/npc-depth-pipeline.test.mjs` 与 CORE，模型预算 0。mock 证明合法新交流背景及 3–5 人问题网络内的两人记忆能进入完整 L2/L4/发布凭证链，缺旧 before 同事件本身不构成失败；反例覆盖候选自证/互证、缺地方或原字段来源、原身份冲突、秘密复制或扩大 knownBy、完成待定交易、偏离目标、成员缺档/双方事实不一致、改未失败叶、过期出处/来源/review/L4 hash 及未 opt-in 的旧候选，全部仍拒绝。通过模拟隐藏失败字段/漏审一叶证明新合同没有降低逐叶覆盖。源投影漏 sex/workplace 与未知/待办误当已发生事实形成回归；覆盖 passed+真实L4失效、manual+hard、伪造失效清单、无权限叶、兄弟叶变动、旧hash不匹配、已用本次机会、未变passed零调用以及修订后L4缺失拒发。临时预算账证明合同变更不清费用/预留、不重领额度或恢复次数；T06 状态及已耗恢复机会原样保留。

不要做：调用真实模型、将 hard 批量降 soft、把新叙述当旧证据、为过审核改来源事实、整村重新审核、重开 T06。依赖：现有 T22 稳定单条复审/来源验证接口；独立树 `F:/dnd-wt/T25`、分支 `t25`。可并行：T24、T07 的独立 world 作者修正与 L4；不可与修改同一公共人物流水线的块并行。T07 付费复审须等本卡验收；本卡零新增模型授权，后续仍只有 T07 原 3 元单卡剩余额度及原停止规则。

## 后续粗卡：全部待细化

粗卡不得直接交执行代理。近期卡完成后规划代理按最新源码和证据拆成同样字段的可执行卡，仍保留以下完整范围；已有实现先审计差距再派增量。部署 R1–R5/正式版均单独列为待用户确认，不是源码开发的依赖。

### R01 M0/M1 剩余验收与原始问题追踪【待细化】

范围：核对构建 release/final 分层、正式 prompt/build-card、25 工具共用定义、场景 6000 字符、输出边界、10 类 8–20 轮试玩及账本至少 90%。补现成材料施法 G1、真实维修磨损前置、修改消息/世界升级、学习失败合理断言；不重做已完成提示层。部署后副本连续 20 分钟和酒馆冒烟留待用户，R1 迁移/兼容清理只在实际发布时做。验收：相关测试、真实提示栈预算 30 元；待细化时标注 B.4 每个问题对应证据。

### R02 M3 记忆、检索、一致性与 300 回合浸泡【待细化】

范围：D.4、8、9 章余项；编年史、固定记忆、中文称呼/近义词、相关性/最近性/显著度检索、成批裁历史、未登记名字登记/改写、场外无尾注和自然中文表达。可选本地向量检索不阻塞必需机制。清空问题文档叙述组中的已复现硬错，M/V 会话通过后跑行商与建设者各 150 回合。复用 `m3-soak.mjs --directory <隔离目录> --init|--run --turns 150 --budget 50` 和 T14 语义计时；先补缺失测量，不能沿用 pilot 5/6 宣称通过。每 25 回合问 50–200 回合前 5 题，结构事实召回≥95%、细节≥80%，矛盾≤1/100 回合，时间误差≤10%，费用/p50/p95/cache 报告齐全，缓存目标≥70%。依赖 T17/T14；R2 部署另记待确认。

### R03 M4 原语、154 骨架与平衡【待细化】

范围：复核 7.6 的 12–15 种共享原语及效果消费者，`world/design/w2-mechanism-map.json`/`tools/w2-mechanism-map.mjs` 逐条实际映射，特别保留 missing-consumer 状态。无法映射者按指南研究型/合理替换处理，同时保证正式可学法术至少 150，不能删骨架后降低规模。首领模板每种能力实际生效。验收：每原语处理器测试、正式学习/施法链、3.3 平衡区间多种子报告；单人限制与标准五人胜率沿现有规则，不改数值只为过线。依赖 T19；世界内容与引擎消费者分卡。

### R04 W2 法术达到 150【待细化】

范围：31 条之后分 25–50 条候选批，依 R03 已实现机制组织，不为数量重复同义法术。每条门类/阶段/消耗/材料/时间/距离/持续/合法性/反制/社会后果齐全，取得来源可玩；全量 L1/L2、L4、wave 评分及 world_upgrade。每波累计预算 20 元，断点续跑，作者与审核分开；依赖 T19/R03。与不写 magic/items/人口正式文件的工作可并行。

### R05 W4 首领 40 个与 8 个智能存在【待细化】

范围：现有 4 到 40，至少 8 个智能存在有记忆、目标、领地、谈判和拒绝理由，能力来源共享原语；150 怪物的生态模拟结果仅有旧记录，核验是否仍适用，缺的 20 种子三年模拟在波次末跑一次。保留掉落守恒、驯服/骑乘/召唤边界、觉醒前后生态与身份。内容审核每波 20 元，上线模拟和 world_upgrade。依赖 R03；首领与法术目录编辑隔离。

### R06 W1 白石镇与 LOD0 人口、建筑、地方生活【待细化】

范围：T11 人物门槛和 T17/T19 完成后解锁。河湾 58 人/22 户且至少 30 full；另四村 40–150 人全员名册、至少 12 full；白石镇 800–1500 人的合理种子人口，至少 80 full、200 以上名册，LOD0 合计至少 250 full、500 名册。名册、full 和未生成 seed 各自计数，不能用 seed 充实际名册。现有约 152/294 只作起点，补齐差额并逐份过 T04。所有聚落按 4.7 完整档，野外地点至少 15；经济账、建筑所有权/进入、年龄亲缘、事实引用和本地问题互相一致。先骨架后 25–50 条小批，20 元/波，world_upgrade 不覆盖旧玩法变化。依赖 T11/T17/T19；不得先建人口再补质量。

### R07 M5 经济、任务、身份、治理和法律【待细化】

范围：D.7、3.10–3.13、5.10–5.11；周贸易流、收入税与合同真实结算，NPC 冒险者公告栏接单/离屏完成，户籍/贡献/任职/爵位/领地与管事，政体法典和跨区声望，群体舆论及人物成长/人生变化。复用现有农业、义务、司法、任务工具，不另造绕过账本的完成记录；合同两端对账，玩家不在世界继续且有可追查事件。S/F 真实会话通过，预算 30 元/轮，守恒/存档失败当场修；R3 部署排除。依赖 T17、T02，地区扩展与人口批需规划文件隔离。

### R08 W5 节日运行、世界时钟及觉醒【待细化】

范围：已有 24 节日候选经审核发布，历法触发实际作息、生产/停工、集市/仪式参与，不能只展示名称。四村地方节俗与世界节日关联避免重复计数；组织资产、计划、40 势力钟阶段实例化，历史真相调查门槛、传闻源头事件、怪物觉醒有真实代价和消息延迟。复用 `w5-festivals.mjs`、world lore/social 目录及 NPC 日程/时间推进。测试跨日/跨月/重放不重复活动，未知信息不泄漏；20 元/内容波，真实 S/F 预算 30。依赖 T03/R07 的相关机制。

### R09 W5 遗迹据点 60 与传闻 300【待细化】

范围：至少 60 处遗迹/野外据点，其中至少 15 在白石镇所属城市范围；每处历史、占据者、物权/继承、危险机关、进入/难度/可得资源/时间变化齐全，宝物不刷新。至少 300 传闻含真/半真/假、源头事件、携带者、路线、逐手变化，四村现有 40 条可复用但不能重复计数。传播必须沿真实时间路线和认知边界，真相不进公开目录。并复核已达 10 文化、12 神祇、40 势力、80 带年份历史各自机制/引用缺口；20 元/波、四层审核。依赖 R08 传播/时钟接口；内容可先候选后发布。

### R10 W3 生活长流程与目录审核收尾【待细化】

范围：已有 410 物品/200 配方不重新扩数量；补完整取得、制作、失败副产品、热源、修理、耐久、保存/腐败、价格成本、职业认证与自创技能/配方、材料施法链路验收。复核 519 条审核/正式源指纹与随机评分，NPC 炉火照管不能靠绕过维护实现。真实生活流程覆盖 11.3 对应项，30 元/轮；相关性质测试保证财物守恒与重复发布保留售空状态。

### R11 M6 主题、消息、顶栏和全部面板【待细化】

范围：第 12.1–12.4、12.9–12.12；本地授权字体、双主题和 16 品质色、`<q who>` 说话人、系统事件卡、未知说话人登记、隐藏回执/尾注、信件告示、中文日期/天气/地点/钱袋/生命魔力。角色/技能/法术书/行囊/人物/任务约定/领地/编年史/传闻全部面板，玩家知情视图，T20 只是一块。自然语言快捷按钮、说/做切换和可关闭少量快捷键；继续/创建/存档/设置和前情提要，错误正常语言、debug 才见 JSON。390×844 可用、字号/高对比/减少动画、Playwright 截图基线无控制台错误。隔离运行不部署；依赖 T20/R07 各状态接口。

### R12 M6 地图和世界素材【待细化】

范围：world/geo SVG 四级缩放，亲历/可靠转述/传闻不同迷雾，路线/季节封闭/玩家标记，耗时花费风险出行预览只填输入框待玩家发送。统一美术说明、游戏纹章、约 80 张类型×时段×天气背景、LOD0 人物头像及 world 中可复用提示、`assets/LICENSES.md`。按指南允许职业纹章替代头像，但不能把所有背景/素材永久省略；新付费服务需用户决定则登记，先完成不依赖服务的接口和有许可素材。地图视口和鼠标/触摸可操作，截图基线。依赖 R06/R11，图像技能适用时由后续执行者读取，规划不调用模型。

### R13 M6 中文声音与按说话人语音【待细化】

范围：环境循环与情境音乐淡入淡出，仅 CC0/允许使用音频和许可清单；一次进入点击启用声音。按 `<q who>` 拆分台词、旁白独立声线、npc.tts_voice 与性别/年龄默认回退，中文多声线、文本哈希缓存、跳过/重播/关闭。先核实已安装可用服务与系统语音，新增付费/登录配置列待确认并继续独立实现；不能读酒馆密钥。自动测试加实际中文播放证据和手机操作。依赖 R11，完整 M6 验收与 R4 部署分开记录。

### R14 W6 LOD1 约 30 聚落/至少 500 full【待细化】

范围：按 4.1/4.7 建约 30 个 LOD1 聚落，LOD1 合计至少 500 份完整档；不把 LOD0 的 250 份重复计作新增目标。所有新 full 过 T04，地方经济、官员、建筑/进入、名册、关系与传闻有真实引用。规则离屏/智能层预算依 5.9 分层，不对所有人物每回合调用模型。分地理区 25–50 条内容批，四层审核、20 元/波、升级保持既有变化。依赖 R06/W1 完成，M5 期间可并行准备。

### R15 M7 LOD2/LOD3 与跨地区旅行贸易【待细化】

范围：本帝国 20 省/100 郡纲要和道路/地理/文化/政体约束，LOD3 稳定种子生成器，生成后入库不重生矛盾实体；跨区实际路线、季节路况、时耗花费、贸易库存与消息传播。不得以没有生成的远方人数冒充已实现 full 数量。跨地区 11.3 会话通过，种子确定性和进出地区重启一致，30 元/真实轮；R5 部署排除。依赖 R07/R14，地理纲要可先准备。

### R16 全规格差距逐项闭合【待细化】

范围：在 M5/M7 细化时建立第 3–9 章逐小节映射，覆盖职业多阶段/认证、属性死亡重生、16 品质、技能突破/自创、魔法研究、宠物坐骑召唤、任务层级、身份贡献领地爵位、法律经济、时间天气以及 6.2 全部玩法动词和 6.3 运行时创造。现有实现逐项列真实入口/测试/缺口，不新增一份泛泛“完成证明”；有缺口派功能卡，有已覆盖证据直接引用。其他玩家可选层默认关闭保持规格，不能成为必需系统的替代。技术范围含 7.5 的性能、缓存/上下文预算和配置开关；依赖各相关里程碑，先于 M8。

### R17 M8 全部真实会话、1500 回合浸泡与性能【待细化】

范围：11.1–11.5 全覆盖，11.3 每项都有断言或评分，完整发布会话每个 3 次；五人格各 300 回合，11.4 召回/矛盾/语义时间门槛与费用延迟缓存报告；10,000 事件/5,000 消息性能达到 7.5。每轮真实试玩 30 元，每次浸泡 50 元，超过停止并登记，禁止拆 run 清预算。指南要求的原档迁移与用户酒馆实玩属于待授权例外；使用合成/已有授权只读副本做可完成的重启、重生成、导入导出核验，明确不等同真实部署验收。依赖所有必需源码/内容卡和 R16。

### R18 最终构建、用户体验清单与停止【待细化】

范围：主会话运行 `npm test`、`npm run test:baseline`、`npm run build:release`、`npm run build:final`，基线保持 23 预期失败；数量和各波次评分全部核对，包括 150 法术/400 物品/200 配方/150 怪物/40 首领及 8 智能存在/LOD0 250 full 与500名册/LOD1 500 full/60据点/300传闻。B.4 每个原始问题可追溯到修复和验收。准备指南 11.7 的 30 分钟用户体验清单，更新当前状态≤150行，PROGRESS 逐块状态真实，待确认列补粮选择/原档迁移/部署及任何新增服务选择。无可执行块时即使构建仍失败也按用户停止条件保留报告停止，不能写全部完成；全部通过也不部署。

## 需要主会话维护的初始状态

T01 待收尾，分支 `codex/yupo-depth-next` 与 `codex/review-calibration`；已合入的带路审稿修正不重复。T14 待收尾，分支 `codex/soak-semantic-time`，WIP 未验证。T20 待收尾，分支 `codex/npc-depth`，WIP 未验证。T02–T13、T15–T19 待依赖，拟建对应 t02–t19；R01–R18 均待细化。以上是规划初表，实时状态只认 PROGRESS，本文不随每次测试追加日志。
