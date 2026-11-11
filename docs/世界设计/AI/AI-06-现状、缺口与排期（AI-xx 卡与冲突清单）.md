# AI-06 现状、缺口与排期（AI-xx 卡与冲突清单）

（2026-11-10 AI-TOP 第 6 册（收口册）。只写设计与排期，不改代码、数据与 00–14 各册。事实基础：盘点全文；实施日程.md（WD-01…WD-38、13 批、热点文件互斥）；命名与古神方案 §9（NM-0…NM-5）；PLAN.md「EC-1」「PT-AI」节；docs/设计/通用门能力-设计稿.md（卡 1–4）与 Jev 判断层接入方案（J-N、J0–J4）。）

---

## 本册回答什么 / 依赖哪些册

**回答**：现在做到哪了、缺什么、各项排到哪个阶段——以卡的形式（AI-xx 编号，带依赖），与实施日程的 WD 卡、命名方案的 NM 卡、EC-1、通用门卡 1–4、Jev J0–J4 衔接；全系列验收 VAI 总索引；全系列待定项总表；与已完成的世界设计册（00–14、命名方案、实施日程）的冲突清单（文件:§、冲突点、建议），不改原册。

**依赖**：AI-00 … AI-05 全部。

---

## 1. 现状对照：五个问题各做到哪、缺什么

状态口径沿用 00 册：**完成** = 有数据、有读它的规则、有入口用到；**做一半** = 三者缺一；**未动** = grep 不到。

### 1.1 问题 a（无 AI 档）

| 项 | 状态 | 证据 | 缺 | 卡 |
|---|---|---|---|---|
| 动词目录（可做之事） | 完成 | action-affordances.mjs；visibility.catalog | entityCard 探测清单写死（通用门卡 1 改） | 通用门卡 1 |
| 候选按钮 | 做一半 | runtime.js:525–541 | 无两步大类聚合；无 `family` 字段 | AI-03 |
| 预填构造器 | 未动 | Jev 方案 §3.3 | 全部 | AI-03 |
| 效果族选项面板 | 未动 | 构造器 effects 槛位只有 oneOf 变体 | 族表 label/slots/compose/examples | 通用门卡 1 + AI-04 |
| 形式模板 intentForms | 未动（字段在、数据 1 条） | grep 计数 | ≈1000 条内容 + L1 校验 | AI-02 |
| 槛位抽取（中文数字、别名） | 做一半 | timeSlots 已有；mannerAliases 无 | mannerAliases；qty 中文数字；单位反向表 | AI-02 |
| 模板对白 | 做一半 | dialogue.mjs:46；8 个 common 模板 | 必备键集合 ≈30 × 五圈；reasonPhrases；三级回退 | AI-05 |
| 论据影响决定 | 未动 | 待确认:170 | argumentModifiers 表、面板、R1 参数 | AI-07 |
| 模板叙述变体 | 未动 | events.json 单级文本 | variants、文化 locale、回执槛位 | AI-11 |
| understand=off 不抛错 | 未动 | runtime.js:106 | 改为预填构造器 | AI-03 |
| 命中率度量 | 做一半 | 冻结题集 a3-score-v5b（已污染） | 新题集 N；R24/C2/S 指标 | AI-21 |

### 1.2 问题 b（有 AI 档边界）

| 项 | 状态 | 证据 | 缺 | 卡 |
|---|---|---|---|---|
| 提案 schema 封闭 | 完成 | primitive-schema.mjs:57 | — | — |
| 信封与候选哈希校验 | 未动 | 主会话 11-04 采纳"提案外信封" | envelope 形状、服务端重校验 | AI-10 |
| 八步管线 | 做一半 | V1–V4、V6–V8 已有；V5 只 9 类 | 效果族表（通用门卡 1–4） | 通用门卡 1–4 |
| 拒绝统一形状 | 做一半 | reject() 有码与文字；无 alternatives/canMark 结构 | rejection{code, worldReason, alternatives, canMark}；rejectionPhrases | AI-08 |
| 决定卡 | 做一半 | npcDecision 有 outcome/reason/conditions/alternatives/trace；reason 是字符串 | reasons key+args；quotes；voice；进 facts | AI-06 |
| 数字出处确定性审查 | 未动 | consistency-review 八类靠模型 | numbersWithoutSource、outcomeMismatch | AI-09 |
| R3 对白契约 | 做一半 | narrate.must/mustNot 已有 | 决定卡进 facts；outcomeWords | AI-06、AI-09 |
| 离屏规划进同一管线 | 未动 | planner 单独 validate | 改候选选择 + 走 actionBoundary | AI-16 |

### 1.3 问题 c（三级落地）

| 项 | 状态 | 证据 | 缺 | 卡 |
|---|---|---|---|---|
| L-T mark | 完成 | mark-actions、mark-reactions、openTagging | 念头记录、念头累计提示、反应扩到 memory | AI-12 |
| L-F crude 制作 | 做一半 | action-limits.mjs:267–283 | derived 派生函数、个人配方、起名校验、存档层 feature、不进 goods 的估价 | AI-13 |
| L-C 管线 | 完成（开发期） | content-pipeline、content-budget、决定 B | 采样器、L1-E/D/R、inbox、禁区校验 | AI-14 |
| 分级函数 | 未动 | — | canonization.levels | AI-12 |

### 1.4 问题 d（分工）

| 项 | 状态 | 证据 | 缺 | 卡 |
|---|---|---|---|---|
| 天气/遭遇/检定/名册种子 | 完成 | weather.mjs:70、wildlife.mjs:48、checks.mjs:111、population.mjs:40 | — | — |
| 命名读数据 | 未动 | 字库在代码 | NM-3 | NM-3 |
| 性格骨架派生 | 未动 | traits 是自由文字 | traits.json、traitPool、traitBias、IDENTITY_KEYS 扩 | AI-15 |
| 档案润色白名单 | 做一半 | PROFILE_FIELDS、硬约束 | 收窄为 prose 类；polish=pending | AI-15 |
| 离屏规划无 key 可用 | 未动 | 无 key 不启用 | 规则排序路径 | AI-16 |
| 传闻措辞变体 | 未动 | — | claimVariants + 确定性比对 | AI-17 |
| 种子键登记 | 未动 | 键散落 | seed-keys.json + E-SEED-KEY | AI-18 |
| 哈希范围 | 未核 | storage.mjs digest | 核查 + digest-exclude | AI-18 |

### 1.5 问题 e（成本、速度、复现、测试）

| 项 | 状态 | 证据 | 缺 | 卡 |
|---|---|---|---|---|
| 费用账 | 完成（开发期） | deepseek-client、content-budget、playtest-budget、model-budget | 玩家侧预算与可见；预留回收 | AI-19 |
| 旁路记录 | 做一半 | 规划线有"重放不调模型"；主持回合只有 consistency 记录 | 统一 sideband 格式 | AI-18 |
| 录制回放测试 | 未动 | — | 夹具、绑定、回放器 | AI-21 |
| 永不停场 | 完成 | 1a89e057/fe94e70b/5a1e7825 | 写成验收 | AI-09 |
| 三态发布/句级裁剪/补审队列 | 未动 | canCommit :294 | 全部 | AI-09 |
| 分级超时/降级表 | 未动 | 180 秒单一 | model-timeouts、degrade-rules | AI-19 |
| 历史裁剪 | 做一半 | runner 有 historyWindow 参数 | history-window.json 与宿主应用 | AI-10 |
| 无 AI 通关 | 做一半 | s5-playthrough 一局；M26 状态不明 | 12 局套件 + 覆盖报告 | AI-20 |
| 真实试玩一轮 | 未做 | PLAN.md:130 已批 ≤6 元 | 报价与执行 | AI-22 |
| PT-AI | E1/E2 达成，E3/E4 未做 | PLAN.md PT-AI 节 | E3 运行位置与密钥、E4 报价 | AI-22 |
| 新扩展部署到用户酒馆 | 未做 | 使用说明.md:3 | 不在本系列范围，列为前置 | 前置（见 §2.4） |

---

## 2. 实现卡 AI-01 … AI-23

口径与实施日程一致：每张卡"一类规则 + 它的数据"整类落地；验收带"grep 无字面量分支"；同批不改同一热点文件；规模只写"无依据"或引用已有人日；测试云上跑、两轮审查 + 独立批准绑定内容哈希。

### 2.1 阶段 A：基础设施（不碰热点文件，可与 EC-1、NM-0/1、通用门卡 1 并行）

**AI-18 种子键登记、哈希范围核查、sideband 格式**
- 来源：AI-04 §6；AI-05 §4.1–4.2。
- 数据/模块：world/rules/tables/seed-keys.json；storage.mjs digest 范围核查报告（只读）；digest-exclude.json（若需）；`<store>/<campaign>/sideband/<turn>.json` 写入点（consistency-service、npc-planning-service、population-service、extension/turn-contract 的调用处统一经一个 `recordSideband()`）。
- 验收：VAI-04-10、VAI-04-11、VAI-05-3、VAI-00-4。
- 依赖：无。
- 规模：无依据。

**AI-21 录制回放基础设施与新题集 N**
- 来源：AI-05 §4.3、§7.3–7.4；AI-01 §7。
- 数据/模块：tools/replay-fixtures/（夹具 + 绑定元数据）；tools/replay.mjs（用 sideband 替代 client.generate）；tools/coverage-report.mjs 骨架；题集 N 由不读代码的 Sonnet 子代理一次性编写（J-N 卡同口径，可合并为一张题集卡）。
- 验收：VAI-05-14；R24 基线测出。
- 依赖：AI-18。
- 规模：无依据。

**AI-19 分级超时、降级表、玩家侧预算与成本可见、预留回收**
- 来源：AI-05 §2.2–2.4、§3.2、§5.1。
- 数据/模块：model-timeouts.json；degrade-rules.json；ui-settings aiProfile.budget；model-usage.jsonl 玩家侧；deepseek-client unknownReserved 单列；设置页与回合尾费用显示。
- 验收：VAI-05-5、VAI-05-12、VAI-05-13。
- 依赖：AI-18（sideband 费用字段）。
- 规模：无依据。

**AI-10 信封与候选哈希、补跑契约、历史裁剪**
- 来源：AI-02 §2.2；AI-05 §6.4–6.5。
- 数据/模块：envelope 校验（action-router resolveProposalEntities 处）；extension/turn-contract.mjs 补跑工具面动态（无候选才含 world_no_action）；history-window.json 与 extension/prompt.mjs、playtest-runner historyWindow 读同一表；world_search 结果不进历史。
- 验收：VAI-00-3、VAI-02-11、VAI-05-10、VAI-05-11。
- 依赖：AI-18。
- 规模：无依据。

**AI-01 aiProfile 统一开关**
- 来源：AI-00 §3。
- 数据/模块：ui-settings.mjs aiProfile（取代 intent/narration，读旧写新一次）；runtime.js:106/320 的 off 行为改为预填构造器入口（与 AI-03 衔接）；设置页四档卡片与文案（AI-01 §8）。
- 验收：VAI-00-4；T0 卡片文案。
- 依赖：无；若 Jev J3 同期做，与其 `judge` 开关合并（P00-2）。
- 规模：无依据。

### 2.2 阶段 B：裁决与对白骨架（随通用门卡 1–4；改 server-plugin 裁决链，不碰 WD 热点数据文件）

**AI-08 拒绝统一形状与 rejectionPhrases**
- 来源：AI-02 §5.2。
- 数据/模块：receipt.rejection{code, worldReason, alternatives[], canMark}；alternatives 生成（同族可派生行 + 同目标登记动作 + leave_mark）；world/templates/rejections/common.json（首版 common 一份，文化变体后补）。
- 验收：VAI-02-5、VAI-02-12。
- 依赖：通用门卡 1（族表存在才能生成"同族可派生行"）。
- 规模：无依据。

**AI-06 决定卡**
- 来源：AI-02 §7.2。
- 数据/模块：npc-decision.mjs 输出 reasons[{key,args}]（字符串由模板生成）、quotes、voice、due；consent 入口（通用门 §6.2 的 consentOf）产出 decisionCard 进 receipt.facts；turn-contract 的 narrate.must/mustNot 读决定卡。
- 验收：VAI-02-7、VAI-02-8。
- 依赖：通用门卡 1（consentOf 统一入口）；AI-15（voice 读骨架；在 AI-15 前 voice 取现有 profile 文字或 null）。
- 规模：无依据。

**AI-12 三级分级与 L-T 扩展**
- 来源：AI-03 §2–§3。
- 数据/模块：canonization.json levels/thresholds；open-actions.mjs 分级函数（按 effects op 集合）；records thought:*；念头簿投影（personal-panels）；openReactions 扩到 memory（greet `{lastTopic}`）；inbox 本地写入。
- 验收：VAI-03-1、VAI-03-2、VAI-03-3。
- 依赖：AI-08（拒绝形状的 canMark）。
- 规模：无依据。

**AI-03 两步澄清、预填构造器、understand=off 行为**
- 来源：AI-01 §2.2、§2.4、§4.3。
- 数据/模块：runtime.js 候选面板两步化；action-affordances 投影 `family/familyLabel`（动作数据字段，缺省 id 前段）；action-builder 预填（target/means/qty/at/族）；open-actions.json generic.mannerAliases；qty 中文数字与单位反向表（读 12 册 units）。
- 验收：VAI-01-1、VAI-01-4、VAI-01-5。
- 依赖：通用门卡 1（族行 slots/compose 供预选）；AI-01。
- 规模：无依据。

**AI-04 效果族选项面板与 examples**
- 来源：AI-01 §2.3、§4.6。
- 数据/模块：action-builder 三栏；族表行 label/hint/examples（E-FAMILY-EXAMPLE）；"找不到族"文案与留痕/告诉设计者按钮。
- 验收：VAI-01-1；族表每行 examples ≥1。
- 依赖：通用门卡 1；AI-12（告诉设计者 → inbox）。
- 规模：无依据。

### 2.3 阶段 C：内容、模板与审查（随 WD 批次，受热点文件互斥）

**AI-02 形式模板 intentForms 数据化（两批内容卡 + 一条 L1 校验）**
- 来源：AI-01 §4.2。
- 数据/模块：world/actions/*.json 每玩家可见动作 intentForms ≥3（三语序）；tools/load-world L1：E-INTENT-SLOT、E-INTENT-LITERAL；模板作者不读题集。
- 验收：VAI-01-2、VAI-01-3（首版线）。
- 依赖：AI-21（题集 N 与指标）；不与 WD 卡争文件（world/actions 不在实施日程热点表）。
- 规模：≈1000 条内容，两批；人日无依据。

**AI-11 叙述模板变体、文化 locale、narrateMust/outcomeWords**
- 来源：AI-01 §6；AI-02 §6.2、§7.2。
- 数据/模块：world/actions/locale/zh-CN/events.json variants + narrateMust + outcomeWords 区段；locale/<culture>/events.json 五圈覆盖键；action-text.mjs 变体匹配与 `narr:*` 抽取；回执槛位白名单。
- 验收：VAI-01-6。
- 依赖：AI-18（种子键）；文化 id 需 WD-01 后稳定（B1）。
- 规模：无依据。

**AI-05 对白模板集合、reasonPhrases、三级回退**（与 WD-27 合并，见冲突 C-1/C-2）
- 来源：AI-01 §5.1。
- 数据/模块：world/templates/dialogue/<sphere>/plain/*.json 五圈必备键 ≈30 × ≥2 变体；reasons.json；dialogue.mjs:46 回退改三级（文化 → 圈 → common，缺 common 报 E-DIALOGUE-SET）；槛位 {address.*}{quote}{terms}{reason}{concern}{lastTopic}。
- 验收：VAI-01-7。
- 依赖：WD-08（语言）、WD-03（文化归属）、AI-06（决定卡 reasons key）。排在 B5 与 WD-27 同位。
- 规模：无依据。

**AI-09 审查确定性项、三态发布、句级裁剪、补审队列、永不停场验收**
- 来源：AI-02 §6.3、§7.2；AI-05 §5.3、§6.1–6.3。
- 数据/模块：consistency-review.mjs 确定性段 + numbersWithoutSource（含单位换算容差）+ outcomeMismatch；consistency-service.mjs:294 canCommit 改三态；句级裁剪（按。！？；切句）；pending-model.jsonl 队列与补审器；turnOutcome/publishedSource/unverified 回合字段；试玩报告 publishedSource 分布。
- 验收：VAI-02-6、VAI-05-6、VAI-05-7、VAI-05-8、VAI-05-9。
- 依赖：AI-06（决定卡）、AI-18（sideband）、P05-2 拍板（可先带开关实现）。
- 规模：无依据。

**AI-07 论据：argumentModifiers、论据面板、R1 抽论据**
- 来源：AI-01 §5.2；AI-02 §7.3–7.4。
- 数据/模块：world/rules/tables/npc-decision.json（kinds/rows/maxTotalDelta）；npc-decision.mjs 第 3 段前折算修正并写 reasons；NPC 卡"怎么说"折叠区（可用论据 = 有 ref）；world_propose 与含 consent.from 的动作 slots 加 arguments；Jev 第 3 步固定模板。
- 验收：VAI-01-8、VAI-02-9、VAI-02-10、VAI-02-13。
- 依赖：AI-06；AI-15（traits 枚举）；通用门卡 1。
- 规模：无依据。

**AI-15 性格骨架派生与档案润色白名单**
- 来源：AI-04 §3.2–3.3。
- 数据/模块：world/rules/tables/traits.json；cultures.json values.traitPool/values.core/speech.registerByClass（**热点文件，须并入该批唯一的 cultures 卡**，见冲突 C-6）；professions.json traitBias；population.mjs 派生（新键 profile:*）、IDENTITY_KEYS 扩、PROFILE_FIELDS 收窄；population-service polish=pending；152 完整档补枚举（P04-4）。
- 验收：VAI-04-1…VAI-04-5。
- 依赖：WD-01（cultures 字段底座）。建议并入 B1 的 WD-01 加字段，或排在 B5（WD-35 占 cultures）之后的 B6 单独一张。
- 规模：无依据。

### 2.4 阶段 D：三级落地与生成分工（随 WD-25、NM-3、WD-33）

**AI-13 L-F 派生：derive-instance、professions.grants、naming.thing、个人配方、存档层 feature、杂物估价**
- 来源：AI-03 §4。
- 数据/模块：server-plugin/derive-instance.mjs（读 material-props、professions.grants、canonization 的 tierMul/qualityMul/crudeDiscount/dailyOutputCap）；itemInstances 扩字段；records recipe:personal:* 与工坊卡"再做一件"；records features:<loc>:*（14 册 §3.4 同形）；naming.thing 模板（并入 NM-3，P03-5）；market 杂物估价路径（08 册缺口，冲突 C-8）。
- 验收：VAI-03-4…VAI-03-8。
- 依赖：WD-25（material-props 扩充，B3）；NM-3（naming.mjs）；通用门卡 1–4（V5 族表）。
- 规模：无依据。

**AI-14 L-C 采样器与新 L1 校验**
- 来源：AI-03 §5。
- 数据/模块：tools/canon-sampler.mjs（读存档 records / ptai 轨迹 / inbox → 草案骨架五形态）；content-pipeline L1-E/L1-D/L1-R；E-CANON-SCOPE 禁区；world/drafts/canon-<批>/ 预算口径沿用。
- 验收：VAI-03-9…VAI-03-14。
- 依赖：AI-13；AI-12（inbox）。
- 规模：无依据。

**AI-16 离屏规划改候选选择**
- 来源：AI-04 §3.4；AI-02 §8。
- 数据/模块：tools/npc-autonomy-planner.mjs 请求改编号选择、validate 改 ⊆ 候选；npc-planning-service 无 key 走 utility 排序 + `autonomy:*` tie-break；提议进 actionBoundary 八步管线；删旧提议路径（P04-6）。
- 验收：VAI-04-6、VAI-04-7。
- 依赖：AI-18；通用门卡 1（actionBoundary 统一）。
- 规模：无依据。

**AI-17 传闻措辞变体**
- 来源：AI-04 §5.2。
- 数据/模块：rumor seed claimVariants（存档层）；R2 首次讲述生成 ≤2 变体；确定性比对（实体集、数量、方向词）；`rumor:tell:*` 抽取。
- 验收：VAI-04-9。
- 依赖：WD-33（传闻派生，B11）；AI-18。
- 规模：无依据。

### 2.5 阶段 E：验收与真实试玩

**AI-20 无 AI 通关套件 P-01…P-12 与覆盖报告**
- 来源：AI-05 §7.1–7.2。
- 数据/模块：tests/playthrough/P-01…P-12（prelude 真实动作；T0；云上并行）；tools/coverage-report.mjs 全部指标。
- 验收：VAI-05-1、VAI-05-2、VAI-05-4。
- 依赖：**分期**——P-01/02/03/08/12 可在阶段 B 后先跑（现有玩法）；P-04（论据）等 AI-07；P-10 等 AI-12/13；P-11 等 WD-38 前的五圈内容（B5 后逐步）。每批收口时加入可跑的局。
- 规模：无依据（s5 一局 5222 秒作参考）。

**AI-22 真实试玩一轮与 PT-AI 启用**
- 来源：AI-05 §7.3；PLAN.md PT-AI 节 E3/E4。
- 数据/模块：DeepSeek 主持 + 脚本玩家一轮（沿用已批 ≤6 元口径，先报价）；夹具沉淀为录制回放集；PT-AI E3（运行位置与密钥）、E4（报价）。
- 验收：AI-05 §7.3 真实试玩口径；PT-AI 轨迹进 canon-sampler 输入。
- 依赖：AI-20 首批局通过；AI-21；AI-09。P05-4：排在 T0 套件通过与回放集建成之后。
- 规模：费用先报价；人日无依据。

**AI-23 收口验收（不写代码）**
- 来源：本册 §4 VAI 总表。
- 数据/模块：无。全部 VAI 复跑；grep 红线全扫；待定项全部关闭或登记。
- 依赖：AI-01…AI-22。
- 规模：无依据。

### 2.6 前置（不在本系列，但本系列可玩性验收依赖）

- **新扩展部署到用户酒馆**（盘点 §1：用户酒馆仍是旧扩展）。T0 可玩的最终判断要在用户机器上做；排期由主会话定。
- **m2-6 合入、EC-1**（PLAN.md）：EC-1 修开局口粮与居民间交易，否则 P-01 市井局无法通过"居民间成交"类断言。
- **通用门卡 1–4 与回归**：V5 效果族表是 AI-04/08/13 的前提。
- **Jev J0–J4**：T1 档；第三方隐私未拍板前只做离线评测（用户 11-04）。

---

## 3. 排期：与 WD 批次的衔接

| 批 | WD / NM / 其他 | AI 卡（同批不改同一文件） | 说明 |
|---|---|---|---|
| B0（EC-1 后、B1 前） | NM-1 → NM-2 → NM-3 → NM-4 → NM-5；通用门卡 1 | AI-18、AI-21、AI-19、AI-10、AI-01 | 全是基础设施与客户端，不碰 cultures/remote-generation/rules.json |
| B1 | WD-01、WD-02 | AI-08 | AI-15 的 cultures 字段**建议并入 WD-01**（C-6） |
| B2 | WD-03、04、05；通用门卡 2–4 | AI-06、AI-12 | AI-06 改 npc-decision.mjs / consent 入口；WD-03 改 dialogue.mjs 招待分支——**同批不改 dialogue.mjs**，AI-06 不碰 dialogue |
| B3 | WD-06、07、08、25 | AI-03、AI-04 | 客户端为主；WD-25 为 AI-13 前置 |
| B4 | WD-09、10、11 | AI-02（第一批内容）、AI-11 | world/actions 与 locale 不在 WD 热点 |
| B5 | WD-35、12、27 | AI-05（与 WD-27 合并为一张）、AI-16 | AI-05 改 dialogue.mjs:46——WD-27 同改该行，故合并 |
| B6 | WD-13、14 | AI-15（若未并入 WD-01，此处 cultures 空档）、AI-09 | AI-09 改 consistency-*，无冲突 |
| B7 | WD-15、16、22、36 | AI-07、AI-02（第二批内容） | AI-07 改 npc-decision.mjs（B2 的 AI-06 已完成） |
| B8 | WD-17、18、34、24 | AI-13 | AI-13 需 NM-3 的 naming.mjs 与 WD-25；WD-34 同改 population.mjs（命名改读）——AI-13 不碰 population.mjs |
| B9 | WD-19、20、26 | AI-14、AI-20（首批局 P-01/02/03/08/12） | — |
| B10 | WD-21、31、30 | AI-20（P-05/06/07/09） | — |
| B11 | WD-23、28、32、33 | AI-17、AI-20（P-04/P-10） | AI-17 依赖 WD-33 同批——改为 **B12** 若同改 npc-rumors.mjs |
| B12 | WD-29、37 | AI-17（若后移）、AI-20（P-11）、AI-22 | AI-22 报价后执行 |
| B13 | WD-38 | AI-23 | 收口 |

说明：
- 阶段 A 的五张卡不等世界设计批次，建议 11-12 EC-1 收口后立即开工，与 NM 卡并行（NM 改数据与 naming/population/remote-generation，阶段 A 改 storage/consistency/extension/tools，无交集）。
- 热点文件新增两处需登记进实施日程 §1：**npc-decision.mjs**（AI-06 B2、AI-07 B7）、**dialogue.mjs**（WD-03 B2、WD-27/AI-05 B5）、**consistency-service.mjs**（AI-09 B6、AI-18 B0）。
- 【待定·李白】P06-1：AI-15 并入 WD-01 还是单列 B6。推荐并入（cultures 字段一次到位，WD-01 "缺字段加载失败"的口径下后补字段要再过一遍加载校验）。不选的代价：B6 多一张 cultures 卡，且 B1–B5 物化的居民没有性格枚举。

---

## 4. 全系列验收总索引（VAI）

| 册 | 条目数 | 编号 | 需要模型？ |
|---|---|---|---|
| AI-00 | 6 | VAI-00-1…6 | 回放（0 元） |
| AI-01 | 11 | VAI-01-1…11 | 否（题集 N 本地） |
| AI-02 | 13 | VAI-02-1…13 | 回放 |
| AI-03 | 14 | VAI-03-1…14 | 否（VAI-03-12 回放） |
| AI-04 | 12 | VAI-04-1…12 | 回放 |
| AI-05 | 16 | VAI-05-1…16 | 否/回放；真实试玩另报价 |
| 合计 | 72 | — | 真实模型费用：只有 AI-22 一轮（先报价）与 Jev 离线评测（已批余 1.76 元） |

验收顺序：T0 套件（VAI-05-1）→ 等价性（VAI-00-1）→ 回放类 → 真实试玩。任何一条不达标，按"降标准前先查根因"：读证据到文件:行，写失败类别，落到数据或规则整类，不调参、不加名单。

---

## 5. 全系列待定项总表

| 编号 | 归属 | 事项 | 推荐 |
|---|---|---|---|
| P00-1 | 亮圳 | 默认档位 | 已定：T0 |
| P00-2 | 李白 | aiProfile 迁移是否随 Jev J3 | 已定：不做迁移 |
| P00-3 | 李白 | 哈希范围现状核查 | AI-18 先核 |

- 修订记录 2026-11-11：P00-1 已定：默认 T0（亮圳 2026-11-11 15:19 伦敦，原话：玩家第一次打开游戏默认不开 AI，所有操作靠菜单和规则完成，想用 AI 的玩家自己去设置里开）。同日 16:40（马德里）亮圳：游戏未发布、无老玩家，不做升级提示与旧键迁移。
| P01-1 | 亮圳 | 对白模板首版按 5 圈 | 5 圈 |
| P01-2 | 亮圳 | 论据面板默认折叠 | 折叠 |
| P01-3 | 李白 | 大类聚合用 family 字段 | 加字段 |
| P01-4 | 李白 | R24 是否正式指标 | 先测基线 |
| P01-5 | 李白 | narr:* 不入哈希 | 不入 |
| P02-1 | 亮圳 | 偷抢骗杀不拒绝只记后果 | 维持 |
| P02-2 | 亮圳 | 威胁记仇是否永久 | TTL 遗忘，立场不回弹 |
| P02-3 | 李白 | 决定卡 key 化随通用门卡 1 | 一起 |
| P02-4 | 李白 | 数字出处容差 ±1 显示单位 | 采用 |
| P02-5 | 李白 | arguments 参数挂到含 consent.from 的动作 | 自动，不列名单 |
| P03-1 | 亮圳 | 玩家申请只写本地 | 本地 |
| P03-2 | 亮圳 | 粗制物不进 goods | 维持 |
| P03-3 | 亮圳 | 固化不回填旧存档 | 维持 |
| P03-4 | 李白 | canonization 阈值 N=3/M=10 | 采用标待校准 |
| P03-5 | 李白 | naming.thing 并入 NM-3 | 并入 |
| P03-6 | 李白 | 表外字 ≤1 放行 | 采用 |
| P04-1 | 亮圳 | 换模型文字不同可接受 | 接受 |
| P04-2 | 亮圳 | AI 不起绰号 | 维持 |
| P04-3 | 亮圳 | 不做性格合理性过滤 | 维持 |
| P04-4 | 李白 | 152 完整档重算枚举 | 重算，prose 保留 |
| P04-5 | 李白 | traitPool 首版规模 | 内容卡定 |
| P04-6 | 李白 | 删 planner 旧提议路径 | 删 |
| P05-1 | 亮圳 | 事后替换模板叙述加记号 | 允许 |
| P05-2 | 亮圳 | 模型审查失败：A 发布标 unverified / B 模板 | A |
| P05-3 | 亮圳 | 玩家预算缺省 0.2/5/50 元 | 采用可改 |
| P05-4 | 亮圳 | 真实试玩一轮排在 T0 套件与回放集之后 | 之后 |
| P05-5 | 李白 | 分级超时数值 | 首版标待校准 |
| P05-6 | 李白 | 句级切分按。！？； | 采用 |
| P05-7 | 李白 | 套件时长目标 | 先观测 |
| P05-8 | 李白 | 补跑前本地唯一候选直接用 | 采用 |
| P06-1 | 李白 | AI-15 并入 WD-01 | 并入 |

计数：**亮圳 15 条，李白 19 条**。

---

## 6. 与已完成册的冲突清单（只列，不改原册）

| # | 文件:§ | 冲突点 | 建议 |
|---|---|---|---|
| C-1 | 12-语言、命名与度量.md §7 M6；实施日程 WD-27 | "dialogue.mjs:46 回退改报错，不回退到 common" vs AI-01 §5.1 需要文化 → 圈 → common 三级回退（否则 18 文化 × 30 键 × 2 变体才能开 T0） | 12 M6 改为"三级回退，缺 common 才报 E-DIALOGUE-SET"；WD-27 验收同步 |
| C-2 | 实施日程 WD-27 | "对话模板 40 个" vs AI-01 §5.1 首版必备键 ≈30 × 五圈 × ≥2 变体 ≈ 300 条 | WD-27 与 AI-05 合并为一张，范围取 AI-01 §5.1；或 WD-27 只做 40 个 common，AI-05 补圈级 |
| C-3 | 12 册 §3.5 | 必备集"8 个文件名（ask/default/greet×3/haggle×3）" vs AI-01 §5.1 必备键集合（request 四态、threaten、bribe、persuade、promise、farewell、smalltalk） | 12 §3.5 的必备集扩为 AI-01 §5.1 表；原 8 个保留在内 |
| C-4 | 命名与古神方案 §4.2（"全部骰值走新键 name:*"）vs 12 册 §7 M3（"新键 sphere:name:*"） | 同一件事两个键前缀 | 统一为 `name:*`（命名方案晚于 12 册，且 AI-04 §6.1 按它登记）；12 册 M3 注记 |
| C-5 | 命名与古神方案 §4.2 naming 形状 | 无派生物名模板，AI-03 §4.2 需要 `naming.thing {templates, pools}` 给粗制物起缺省名 | NM-3 加 `thing`（P03-5）；不加则粗制物缺省名只能用性状拼接（"皮·护腕"），风味差 |
| C-6 | 实施日程 §1 热点文件 cultures.json"每批只放一张"；WD-01"缺字段加载失败" | AI-15 要加 values.traitPool / values.core / speech.registerByClass 三字段 | 并入 WD-01（P06-1）；若不并入，B6 单列并接受 B1–B5 居民无性格枚举 |
| C-7 | 14-历史传说与玩家来历.md §3.4（碑刻 feature 在 locations.json）与 §12（首版无动态历史生成） | AI-03 §4.2 玩家立碑落在**存档层** records features:*；AI-03 §5.2 多存档玩家事迹可固化为 legend/rumor seed | 不冲突但需对齐：14 §3.4 的 feature schema 作存档层同形；legends/rumors 的 status 枚举加 `canon-derived`（与 authored-seed 并列） |
| C-8 | 08-经济社会学模型接入核对与方案.md（valueOf、goods 定价） | AI-03 §4.3 粗制物"不进 goods，只按性状估价卖杂货"需要 market 有杂物估价路径（value × crudeDiscount），08 册未写 | 08 册 §3 补一条"非 goods 实例的估价路径"，或 AI-13 卡补并在 08 册注记 |
| C-9 | 00 册 §二"NPC 自治与玩家动作两套（AUDIT3 06-14/06-18）" | AI-02 §8/AI-16 要求离屏规划提议进同一 actionBoundary 管线 | 不是冲突，是 00 已登记缺口的消费者；通用门卡 1 统一入口后 AI-16 落地 |
| C-10 | 12 册 §7 M3"现有 548 居民名不变（不重生成）"；盘点"152 完整档静态数据" | AI-04 §3.2/P04-4 要对 152 完整档**重算 traits 枚举**（名字不动，但 world/people 数据改） | 名不动；traits 枚举作新增字段写入 world/people（内容卡），prose 保留；与 NM-4 存量改名同批或其后 |
| C-11 | Jev 判断层接入方案 §3.2 降级矩阵"有 Jev、有 LLM：待用户定" | AI-00 §3.2 T2 档 understand=llm（Jev 不进前门）按主会话 11-04 ③"第一版 Jev 不进前门" | 一致；Jev 方案 §3.2 表格该行注"已定：不进" |
| C-12 | 通用门能力-设计稿 §7（world_propose 替换 world_check） | AI-02 §7.4 给 world_propose 加 arguments 参数；工具数不变 | 不冲突；通用门 §7.1 工具面变化表加一行 arguments |
| C-13 | 实施日程 WD-37（character.mjs 白名单加 culture/background） | AI-04 §3.2 accent 派生读玩家/居民出生地 region 与现居 region | 不冲突；AI-15 依赖 WD-37 的 birthplace 字段只对玩家；居民出生地已在 population 骨架 |
| C-14 | 12 册 §4.5 / 命名方案 §4.1"生成代码里不出现文化 id 字面量" | AI-04 §3.2 派生读 cultures[c] 的 traitPool——按 culture id 取数据不是字面量分支 | 一致；验收 grep 口径同 N8 |
| C-15 | 实施日程 §1 热点表 | 未列 npc-decision.mjs、dialogue.mjs、consistency-service.mjs，而 AI 卡与 WD-03/WD-27 会同改 | 热点表加三行（本册 §3 说明） |

计数：**15 条**，其中真冲突（需改原册措辞或范围）6 条（C-1…C-6），对齐/注记 9 条。

---

## 7. 自检（随机抽三条）

1. **§2.1 AI-18**：文件、模块、写入点、验收、依赖写了；"digest 范围核查报告（只读）"是第一步，结论决定是否要 digest-exclude。可开工。
2. **§3 排期表**：每批 AI 卡与同批 WD 卡的文件互斥逐一核过（dialogue.mjs、population.mjs、npc-decision.mjs 三处显式避开）；AI-17 的 B11/B12 取舍写了条件。可照排。
3. **§6 C-8**：冲突点、落点、两种处理写了；选哪种由 08 册维护者定——这是一处需主会话分派的点，已在建议栏写明。可处理。
