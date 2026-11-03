# A3 原语与开放动作——拆卡草案

2026-10-20；工作区 `F:/dnd-wt/A3P`。供主会话独立审定后派工，未写入 PLAN，未改代码、架构文档或原存档。本报告只规划迁移阶段 A3，不是旧内容卡 T104/A3。

## 一、完成标准与边界

依据：`docs/架构设计/10-现状映射与迁移路线.md:101` 的 A3 行及 112/114/116 行追加项；06 章 §§6.3–6.11；05 章 §§5.2–5.7；附录 A 的原语、权能、行为能力、同意与身体需求量定义；12 §12.8.1 的 RX；13 §13.5 的仪式形状；`docs/待用户确认.md:79–85` 的两层玩法决定。

完整结果：无 LLM 的注册动作和四步构造器、LLM 的自由意图提案、NPC 的数据动作，最终共用原语校验和引擎事实。合法但暂不能达到的意图有世界内理由、降级做法、就近动作与可选择的留痕；禁止用 mark 冒充原意图已成功。保留 S1 账户守恒/物理可达、S2 持有与生命周期、S3 义务及托管、A2 主观视图与拒绝权、回放与锚点回滚。

A3 不承包 S4 完整规范栈、布局生成和刑事程序，S5 完整市场/生态，S6 完整知情重建，A4 聚类候选卡，S7 性能重构，S8 旧工具全面退役和包安装卸载。但 A3 必须提供上述消费者能用的真实事件、标签、只读接点与回执，不能把本阶段的同意/权能/构造器/日常动作推给后续。F6 在现有法律、立场、记忆、传闻消费者上走通完整链；跨法域新程序另按条目记 S4，不能因此把 F6 整题判过。

用户本次要求优先：只读规划，唯一写入为本报告；不派子代理；不提交；不部署；不读取 secrets.json。后续建议核心模型 `gpt-6.1-sol medium`，机械标注和独立审查 `gpt-6-luna`。d20 复用本项目原创 checks/数据，不引入 SRD 受限内容；本报告不作版权许可结论。

## 二、现状证据及退出标准差距

`docs/当前状态.md` 首段仍停在 10-18 的“S3 收尾”，应以用户本次说明及 `docs/PROGRESS.md:458` 的 10-20 完成记录为准。A1/A2/S1/S2/S3 均是输入基线；S3-I 的义务动作继续走 world_act，不另加静态工具枚举。

本次只读运行 `node tools/intent-score.mjs --json`：238 条，113 条 creative（47.48%），registered/open/fallback/infeasible 分别为 122/68/39/9，标注校验无错误。**其 route/signature=100% 是 `stubTranslate()` 回显 expect 的自比结果**，不是裁决器达标；116 条“未支持”和 39/39 无反应也来自当前支持能力的静态判定，不是 116 次真实执行失败。定位：`tools/intent-score.mjs:63–89`。必须保留语料，替换执行与计分方法。

| A3 退出标准（逐项） | 已有 | 缺口与验收证据 | 责任卡 |
|---|---|---|---|
| 意图语料，刁钻占比 ≥30%（06 要求总数 ≥200） | 238 条、47.48%，21 个 domain | 需运行夹具、提案输入/构造器四步输入与独立期望；保留 238 条分母，不删难题，不把路由结果填成标准答案 | E |
| 路由 ≥90% | A1 有目录与字符串搜索 | 缺签名多重集 + BM25 的实际路由，阈值初值 0.7、缺槽补问、歧义候选、匹配后的真实执行；计分取实际 receipt.routed | B/E |
| 签名 ≥85% | 语料有 expect.signature、ontology 有原语名 | 缺输入翻译与最终原语计划；分别报告输入签名/裁剪后签名，不能拿 expect 同时作输入和结果；T0/T1 不冒充真实 LLM 翻译准确率 | A/B/D/E |
| 越界 0 漏网 | S1/S2/S3 底层有写入权限、账户守恒与持有校验 | 缺统一幅度/字段白名单/来源阶/时间/收益/重复衰减，及从公开提案到旧别名的防绕过；每条超界保留 trimmed 原因和原子性断言 | A/B/C/E |
| 不支持率 0 | 注册动作已有部分可玩 | 无 world_propose；缺世界内拒绝/降级/最近邻/留痕协议。世界内“做不到”可以正确拒绝；不能用伪成功或任意改账消除拒绝率 | B/D/E |
| 兜底反应率 100% | mark 属 thing 的词汇与标签已登记；现有 magic-marks 是特定法术留痕 | 缺通用无价值 mark 创建、按标签订阅、7 天内实际反应、同作者×标签×地点衰减和数量上限。反应率取真实事件，不数 reactors 标注 | B/E |
| F5：奇怪但合理计划得到公平裁定 | 净水/制造/交易底层各有能力 | 缺从开放意图→配方/法术动作→水源、容器、工时、库存、售价的连续结算；不许凭空生成清水收入 | B/C/E |
| F6：做坏事有完整后果链 | crime/law/world-events/standing/记忆已有链 | 无同意还主要是拒绝或 force 特例；缺统一对抗、theft 标识、描述标签和接现有司法/社会反应；无目击不能全城全知 | A/B/C/E |
| 无 LLM 构造器可完成 ≥70% 意图，其余兜底承接 | A1 有对象菜单/表单/快捷栏，A2 有对话面板 | 缺四步构造器、分区/方位选择、纯预览/确认、fallback 和 pending 展示；以 238 条为分母至少 167 条实际完成预期的注册/开放效果，其余给正确降级/留痕，不把拒绝和留痕计入完成分子 | B/D/E |

06 §6.11 同时保留拒绝正确率 ≥95%、叙述一致 ≥95%、三档不越权；无 LLM L/T/S/F 已有场景不得回归。真实模型 T2 与长期浸泡不是本规划会话运行内容；阶段收口需真实提示栈时由主会话按现有授权调度，不能用桩成绩替代。

### 范围和三轮追加项：实现差距

| 要求 | 代码现状 | A3 需要做的事 |
|---|---|---|
| K2/K6/M4 统一原语 | `interactions.mjs` 为物理计算与写入；`effects.mjs`/`effect-registry.mjs` 为时钟消费者；`magic-primitives.mjs` 明说目标、同意、代价由调用者管；`world/ontology/primitives.json` 仅词汇 | 以现有 ledger/holdings/obligation 接口为唯一写入口，三套调用翻译到统一校验/执行；保留 K2 参数表和 150 法术 effectSpec，适配器不能继续有独立绕过写法。原语表实际含 rescale 共 19 项，现注释“18”应对齐，不能漏实现 |
| RX 定点/守卫提取/定义补丁 | 未定位到通用 RX 编译求值器；`npcDecisionLibrary` 只是导出对象；action-registry 仍要求 call/projection | 实现 12 §12.8.1 的受限表达式、只读库绑定、定点数/预算/确定性、静态字段检查与守卫输出；动作可直接声明 outcomes；仅按 patchable 追加 preconditions/consent.scope，reserved 与删改 outcomes 拒绝，顺序交换等价 |
| world_propose/查提/分级 | engine.reduce 经 resolveToolCall 后派到旧 handler；HTTP /execute 先把 world_act 翻译为旧工具；没有公开 world_propose | 保留动作身份/提案上下文贯穿事务；只读 affordance/预览；off/limited/full、intent/narration 配置；同一事件保存意图、骰值、裁剪、applied 与 must/mustNot；旧回放不被新规则重解释 |
| 同意三来源及 given/revoked | `magic-consent.mjs` 有本人许可、撤销与紧急治疗；旧逻辑拒绝拘束者，force 为例外；目录还会显示 CONSENT_PENDING | 统一本人事件、真实代理资格、法典紧急条款；读目的/期限/撤销。NPC 走 A2 决策，不能信任调用者 consent:true；无同意的治疗/精神/辅助走对抗与标签；交易/借贷不能强迫对方出钱；修旧受限≠失能 |
| authority() | 持有 writer 权限与人/组织视图有局部权能，未定位到统一查询 | 汇总有效持有、法典授权、章程、有效决议、发行认可及 mandate scope，返回依据和 actedAs。非法可发生不等于任意账户可动用；托管款、无占有处分、无权解除法律持有仍保留拒绝 |
| learn 来源方意愿 | `learning.mjs` 读 personTeaching/当班服务、收费、学习检定 | 来源为人读教者 consent 或教者发起 service；不愿教只有可观察偷学 ×0.25、可被察觉；失能不能教，在押可教；练习确定增量，读书/研究按自学档位 |
| 争夺 pending | `scheduler.mjs:104` 有 submitContest，现内部回执仅 `{status:'pending',id}`；S2 已做争夺整提案原子 | 对外 pending{contest,standing} 与最终同一回执关联，刻末在同回合内结算；输家不残留付款/物品/义务，LLM 等最终结果，不让前端多一次点击决定输赢 |
| world_create 模板边界 | `activities.mjs:249` 拼接 data 创建 npc/org；研究成果有项目门槛；item/bld 一律拒绝 | 新叙述登记只接受 core person/creature/item/building 通用模板与允许事实，不生资源/账户/可兑现库存；其他创意转 mark。研究 skill/spell/recipe 与建组织改为注册成果/建组织动作，旧合法调用映射保留，不能切断已完成玩法 |
| 制造配方、盗窃、受限动作 | 制造/盗窃/拘束各有旧路径；S2 已有 confined/effective；普通动作仍多为旧别名 | 计量制造必须路由配方，src:craft 只由配方内部消费；theft 来自动作可信声明，调用者不能自封；受限目录与执行同读 regime，保留交谈、授艺、签约、随身支用、结社、申诉、观察、等待、脱逃 |
| 仪式、兜底反应、日常读表 | 有 magic-ritual、world-events 订阅器和 balance 表，未形成通用 rite/mark 管线；全树未定位到 action-costs/durationSlot/body.stamina/satiety 运行消费者 | 仪式 project/stages/windows/materials/interrupt/backlash；mark 订阅现有事件系统；日常时间、身体、学习、耐久和产物 outcomes 实际读表。无须另造日志/账本或通用工作流框架 |
| A2 转交 | PROGRESS:440 明记旧同意路径和 belief→standing 转 A3 | 同意迁移归 C，统一语义归 A；只读 A2 四域中的 belief 修正当前 standing，I25 同观测双世界不泄漏真相；S6 的整套可重建投影仍留 S6 |

## 三、五张卡与并行顺序

顺序：**A 先交共享内核及接口 → B/C/D 三路并行 → E 集成验收**。E 的语料/测试夹具准备可以提前，与核心实现独立；最多三路执行。A 所有共享接点始终由 A 唯一写入：下游需要额外接线时报主会话，A 在其尾段串行补接，不许多卡同时编辑 engine/index/schema。末段必须把真实消费者接上，不能以接口桩代替交付。

规模是工作量估计而非承诺：A、C 为 XL，B、D 为 L，E 为 M–L；不能把完整 A3 塞进一次 50 分钟执行。每卡内部按下述可验证检查点交接，主会话按实际吞吐续用同卡，不能以改名重置失败次数。下列新文件为建议名称；可用等责现有模块替换，但先由主会话确认唯一所有者。

### A3-A：原语内核、RX 与共用权限接点（XL；约 10–16 人工小时；gpt-6.1-sol medium）

**目标**：交付实际可运行的统一原语事务、只读派生库和 RX，使下游不再分别决定“谁能写、写多少、写到哪里”。共享接点先稳定；先交 transfer/持有/义务的完整调用切片，再交其余原语和全部安全语义，不以第一片当全卡完成。

**唯一所有权**：新 `server-plugin/primitives.mjs`、`primitive-policy.mjs`、`rx.mjs`（可拆同前缀子文件）、`action-authority.mjs`、`action-consent.mjs`、`action-capacity.mjs`；现有 `engine.mjs`、`index.mjs`、`action-gateway.mjs`、`action-registry.mjs`、`world-events.mjs`、`scheduler.mjs`、`holding-kinds.mjs`、`law.mjs` 的旧拘束拦截接点、`location-access.mjs` 的必要接点；`tools/load-world.mjs`、`tools/create-schemas.mjs`、`tools/arch-layers.mjs`、`tools/build-action-registry.mjs`；`schemas/` 中动作/原语/存档所需 schema；`world/ontology/` 本卡必要词汇与模板字段。ledger/holdings/obligation 内核默认只调用，若确有接口缺口也仅 A 修改其必要导出，不重写已完成账本。新增测试 `tests/a3-kernel.test.mjs`、`a3-rx.test.mjs`、`a3-policy.test.mjs`、`a3-transaction.test.mjs`。

**检查点与验收内容**：

1. 原语 19 项可校验/执行并发真实事件，保留 S1–S3 writer/源汇/预算/守恒/生命周期；fact.set 白名单不能写钱、身份、真相信念或任意路径。无来源转移、跨地点偷取、托管挪用、失败后半笔转移全部不成立。带合法性问题但可发生的处分，保留实际效果和标签。
2. authority 统一六来源与 actedAs；本人持有、经营/监护/委托、失效职位、超 scope、无权但实际占有、无占有、法律类开立与解除、escrow/collected 用途分别测试。不得把“违法成立”扩大成“越过账户边界”。
3. consent 三来源 + purpose/until + given/revoked，含持续效果撤销声明；玩家/NPC 同一语义；capacity none 禁发起，limited 可发起但标记，confined 按 regime。来源本人判断不能变成客户端布尔开关；保留未成年人不进入恋爱/亲密情节。
4. RX 支持声明所需完整语法、受限 lambda/有界集合、只读视图、标准库包括 npcDecision；无 eval/new Function/原型访问/I/O；固定点数按 14 §14.6 的精度、取整及溢出定义，不另定一套金额规则；编译及运行预算、确定性 roll、解释和守卫提取。守卫是谓词预筛选，后续仍求完整谓词；不能因提取漏候选。fast-check 已安装，可用于预算/确定性/守卫等价性质测试。
5. 动作定义补丁只追加允许字段，双包交换顺序等价；schema、加载器、运行校验同口径。注册动作与旧别名必须经同一入口，防止 /execute 或直接 reduce 绕过。
6. 事务支持 preview 不写状态/时间/骰序、commit 时重读当前事实；争夺整提案进入既有调度器，阶段 3′ 完结后才发布最终 applied；重复 eventId 不重扣；旧存档旧工具事件回放、anchor 回滚和新提案重放可用。父子事件不重复触发社会反应。

**先行交给 B/C/D/E 的接口**（由 A 定具体签名，含正常及失败返回样例）：

- `compileRX/evaluateRX/extractGuards`；`authority/consent/canAct` 的只读结果带依据，不能把隐藏真相塞入玩家回执。
- `planPrimitives/commitPrimitives`：共享 actor/frame/source/eventId，source 与 actedAs 由服务器确证，客户端不能伪造 rule 来源；成本、检定和结算分离，返回 receipt。
- `ActionDefinition`：保留 legacy call，增加原语 outcomes/signature/cost/check/theft/rite/patchable，现有 source=catalog 义务操作不丢；cost 迁移必须标清由原 handler 还是统一层结算，二者不能同时扣。
- `Proposal/Receipt`：intent/effects/means/context 与服务器解析的 participants；receipt 的 routed/candidates/applied/trimmed/check/consequences/narrate/alternatives/fallback，以及 pending 与最终结果关联键；可记录意图供 A4 使用，不实现 A4 聚类。
- HTTP：沿用 /actions 查询和 /execute 写入，补只读 /propose 预览（或同职责的明确 preview 路由）；真正提交仍走存档事务。查询补 affordance，不增加单独“原语执行”后门。

**验收文件**：上述四个 a3 测试 + `tests/ledger-reconcile.test.mjs`、`tests/entity-authority.test.mjs`、`tests/s3-i29.test.mjs`、`tests/s3-action-catalog.test.mjs`、`tests/ontology.test.mjs`、`tests/arch-metrics.test.mjs` + CORE。按变更补现有同刻调度器测试文件（用 `rg -l 'submitContest|resolveContest' tests -g '*.test.mjs'` 定位，不另做全仓测试）。推演：P1/P2/P3/P4/P8（见第五节）。

### A3-B：开放裁决、路由、mark 与仪式（L；约 8–12 小时；gpt-6.1-sol medium）

**目标**：任意提案经解析、路由、裁剪、派生、检定、应用得到可信回执；没有模型也可调用，拒绝仍给世界内出路。

**唯一所有权**：新 `server-plugin/open-actions.mjs`、`action-router.mjs`、`action-limits.mjs`、`action-rite.mjs`、`mark-actions.mjs`、`mark-reactions.mjs`；`server-plugin/checks.mjs`、`retrieval.mjs` 仅所需抽取/复用；新 `world/actions/open.json`（独立 namespace，含 leave_mark 等，不和 core.json 重复 namespace）、`world/rules/tables/open-actions.json`（幅度/难度/档位/反噬/衰减）、`world/rules/open-reactions.json`、`world/rules/open-tagging.json`、`world/actions/locale/zh-CN/open.json`（世界数据加载接点 A，action-text 的多文件模板读取归 D）；新增 `tests/a3-open-actions.test.mjs`、`a3-routing.test.mjs`、`a3-marks.test.mjs`、`a3-rites.test.mjs`、`a3-limits.test.mjs`。

**检查点与验收内容**：

1. 实体解析与歧义候选；候选过滤参与者/可见性；签名 Jaccard 0.6 + 文本 BM25 0.4、阈值 0.7；缺槽提示补全，命中采用注册动作数值和模板；不把整段中文意图硬编码成个案 if。
2. 幅度按 op×来源 stage 与材料/工具/余额/可达派生；物品 stage 与使用者技能阶分开；K2 倍率后仍受上限。context ±5 且需理由；time 不由提案任填；durationSlot 按表限定；最近邻成本 max/收益 min，无最近邻难度 +2/耗时 ×1.5；每日产出上限、24 小时同签名衰减。制造计量产品必须路由现有配方，无配方只能真实材料的 crude 个体或无价值 mark。
3. 复用 checks 的骰子、优势劣势、协助与隐藏被动；五档与 rite 反噬表只有一处定义；确定性交易/制作/练习不被强加随机检定。失败代价、半成功数值与不可分割对象的 outcomes 一致，不出现半把钥匙/半个持有。
4. 不同意的治疗/辅助/精神效果走 A 的对抗判定输入，失败无效果并有可感知后果；强制/改记忆标签交合法性扩展点。theft 声明只读注册动作，自己/他人账户和合法代理路线分清。完整 F6 接已有消费者，正式 S4 规范栈不在此重写。
5. mark 无资源/账户/直接数值奖励，材料真实扣减，保存 intent/form/location/zone/author；每个 core mark 标签真实订阅且可起反应。7 日反应衰减、数量上限/替换最旧与不再产生收益按数据。区分“未触发反应”与“衰减后净增益为零”，防刷时仍可有可观察事件，不能每次生成新的高收益反应冒充 100%。
6. rite 读主观诊断与真实对象的不同职责，资格/角色/时窗/材料、project 多阶段、到期/中断/未完成/反噬均通过原语；一段仪式无需另造持久项目框架。存档重放不会重复消耗、誓约或反噬。

**验收文件**：上述五个 a3 测试 + `tests/retrieval.test.mjs`、`tests/checks.test.mjs` + CORE。接 C 后 P5/P6/P7/P9、F5/F6 实测由 E 汇总；不得因独立测试用了假 handler 就宣告阶段达标。

### A3-C：旧入口归一与日常动作闭环（XL；约 12–20 小时；gpt-6.1-sol medium）

**目标**：把真实调用者接到 A/B，交付所有 A3 日常判据；旧工具仍可重放，但新执行不绕过同意、时间、费用和上限。A2 转交项一并关闭。

**唯一所有权**：`server-plugin/interactions.mjs`、`effects.mjs`、`effect-registry.mjs`、`magic*.mjs`、`learning.mjs`、`education.mjs`、`npc-growth.mjs`、`professions.mjs`、`activities.mjs`、`manufacturing.mjs`、`agriculture.mjs`、`wildlife.mjs`、`sites.mjs`、`medicine.mjs`、`medicine-state.mjs`、`finance-bank.mjs`、`quest-board.mjs`、`festival.mjs`、`organizations.mjs`、`dialogue.mjs`、`npc-rumors.mjs`、`npc-autonomy.mjs`、`standing.mjs`、`subjective-view.mjs` 的本卡调用接点；新 `server-plugin/action-costs.mjs`、`body-needs.mjs`、`daily-actions.mjs`、`primitive-adapters.mjs`。`world/actions/core.json` 与原 `locale/zh-CN/events.json`；`world/rules/tables/balance/{action-costs,body,learning,crafting,yields,event-weights}.json` 的必要数值/映射；`world/` 中涉及饵、药、鱼汤配方、动作奖品的正式数据，按 ID 定位，禁止手改发布人物档案或 dist。此列表不是要逐文件都改：仅按实际调用链改所需文件。

测试所有权：新增 `tests/a3-adapters.test.mjs`、`a3-daily.test.mjs`、`a3-consent-legacy.test.mjs`、`a3-body.test.mjs`；既有 `tests/daily-b2-*.test.mjs`、`tests/a1-daily-probes.test.mjs`、`tests/spell-consent.test.mjs`、`tests/runtime-invention.test.mjs` 中因设计对齐需要改的用例。`tests/helpers/daily-b2.mjs` 保持复用；只有 C 可改其公共 helper。E 自己另写 helper，不与 C 抢文件。

**检查点与验收内容**：

1. K2 变成原语内部参数计算；K6 消费者输出原语计划，M4 effectSpec 经适配器转换。逐现存 effect kind/法术族对照接线，不仅演示 damage/heal。法术阶段、材料物理、区域/周期效果、费用、死亡结算继续有效；原有 K6 失败整事务撤销保留。
2. 旧 magic-consent/入会/学习/交易服务移到 A2 决策与 A 的 consent，撤去“对话功能完成后开放”的过时阻挡而保留拒绝伪同意。belief 修正 standing 只读该观察者的主观域，双世界同观测同结果。NPC 和玩家用相同规则，不把 NPC 的同意改为默认同意。
3. 将新 world_create 通用模板登记接入；研究成果/建组织等已有合法功能改经注册动作，旧别名适配，保持项目/资格/材料证明。叙述中新登记的无价值 item 不得立刻卖钱、当材料或变成库存资源；真正有价产物仍经配方/工程。
4. 统一动作时间/身体/学习/工具磨损的实际消费者，内部 handler 不能再和统一层双扣。body 按 value/asOf 闭式，睡眠/进食/活动推算与阈值；不逐分钟写状态，不另造资源账本。原有 hp 恢复和夜间 NPC 活动同时保留。
5. 按第四节 22 条及 4 条表级接线逐项完成。D18 修理报价/上限/同一实例；D19 多日 service 学习不一次解锁/重复收全费；D32 药物来自医师库存或有材料配方；D35 奖品来自主办库存且不可重复领奖。S1 已完成不代表 body、饵物品或田地动作已实现，具体缺口由本卡必要接点补齐。

**验收文件**：四个新增 a3 文件；既有 `tests/interactions.test.mjs`、`effects.test.mjs`、`magic-primitives.test.mjs`、`spell-consent.test.mjs`、`learning.test.mjs`、`manufacturing.test.mjs`、`runtime-invention.test.mjs`、`s3-sv.test.mjs`、`a2-dialogue.test.mjs`；修改到的 magic 家族测试、daily-b2 各相关文件和 a1-daily-probes；CORE。P1/P2/P6/P7/P9 与 F5/F6。不要一次全跑未改到的长测；列表内因沙箱 EPERM 未运行的交主会话补。

### A3-D：四步构造器、两阶段工具与回执展示（L；约 6–10 小时；gpt-6.1-sol medium）

**目标**：玩家不用 LLM，从对象/场景点“其他…”完成四步、看清代价/危险/法律后果、确认结算。自由文字可预填，模型关闭或失败不阻塞模板结果。

**唯一所有权**：`extension/ui-actions.mjs`、`actions-view.mjs`、`actions-view.css`、`tools.mjs`、`runtime.js`、`turn.mjs`、`prompt.mjs`、设置相关既有前端文件（按需）、新 `action-builder.mjs`；`server-plugin/action-affordances.mjs`、`action-text.mjs`、`scene-card.mjs`、`consistency-review.mjs` 及现有 consistency 消费链所需文件；静态提示源文件由 `tools/build-card.mjs` 定位后仅 D 修改，`tools/build-card.mjs`/`tools/export-actions.mjs` 与 `docs/actions.json` 的必要同步归 D。新增 `tests/a3-builder.test.mjs`、`a3-builder-ui.test.mjs`、`a3-tool-surface.test.mjs`；既有 `tests/a1-actions-ui.test.mjs`、`action-registry.test.mjs`、`actions-catalog.test.mjs`、`prompt.test.mjs` 的接口对齐由 D 负责。

**检查点与验收内容**：

1. 做什么/对谁或何物/用什么/怎么做均是玩家语言，不要求玩家填写原语 JSON；entity/zone/direction 从当前可知可及视图读。优先注册动作，未知意图给近邻与留痕；本地不偷调模型。
2. 预览显示难度、耗时、费用、预期效果、路由、可知见证/后果、世界内限制；点击确认才写。取消和多次预览无改变；确认时 stale 状态重算，不能拿预览的旧同意/旧余额直接提交。
3. 受限菜单按 regime，不清空；离开被挡说明原因，同时显示脱逃及其工具/方法/守卫设施预览。禁用项执行时也有同一规则，不能仅藏按钮。D08 昼夜直接读 weather/daylight 给模板场景头，不另算太阳时间。
4. world_actions/查询提供 affordance；只新增 world_propose 一个公开职责；openActions=off 隐藏开放提案但注册 leave_mark 仍可用，limited 拦住不允许的 create/holding/obligation，full 也必须校验权限。该分级针对 LLM 入口，不把无 LLM 构造器一并关死。
5. intent off/match/propose 与 narration off/async/sync 通过现有流程；pending 是中间状态，最终同回合到达，前端和 LLM 不把 pending 当已成功。叙述约束读实际 applied + must/mustNot；失败改写沿用现有一次重试和模板兜底，不另建审查服务。
6. 工具描述/提示枚举控制见第七节；旧别名回放保留；新动作详情走动态检索。同步工具数断言仅为真实公开面变化，保留完整集合/调用映射断言，不用“>=1”替代。

**验收文件**：三个新增 a3 文件 + `tests/a1-actions-ui.test.mjs`、`tests/action-registry.test.mjs`、`tests/actions-catalog.test.mjs`、`tests/prompt.test.mjs`、实际改动的 runtime/turn/consistency 测试 + CORE。浏览器至少 390×844、桌面；覆盖构造、预览取消、成功、拒绝降级、留痕、pending、受限、无 LLM。沙箱 EPERM 的 UI/HTTP 测试由主会话外跑，必须看到真实后端状态断言；mock 截图不替代。

### A3-E：独立语料执行、推演与阶段验收（M–L；约 5–8 小时；gpt-6-luna；复杂裁决缺陷回原 Sol 卡）

**目标**：让阶段退出指标由实际执行结果产生；核对 B/C/D 实现与设计，不能为了评分改核心规则或降低断言。

**唯一所有权**：`tools/intent-score.mjs`、`tests/intents.test.mjs`、`tests/intents/*.json` 的输入夹具补全（不改期望来迎合实现）；新 `tests/helpers/a3-intents.mjs`、`tests/a3-intent-execution.test.mjs`、`tests/a3-probes.test.mjs`、`tests/a3-f5-f6.test.mjs`、`tests/a3-replay.test.mjs`；`docs/probes/daily/executable-status.md` 的 A3 状态行与短验收报告。PLAN/PROGRESS/CHANGELOG 仍由主会话维护，架构文档锁定。

**检查点与验收内容**：

1. 在 A 接口确定后补齐全部 238 条可运行夹具、原始提案输入及无 LLM 构造器选择；expected 只作为评分 oracle。T0 可从标注签名获得模拟翻译输入，但不能注入 expected route/expected receipt/标准裁剪结果。T1 走真实 builder；标准答案由独立标注者核对。注册动作、open、mark、世界内不可能四组都跑，不只选容易的 122 条。
2. score 返回实际 route/signature/clipping/rejection/narration/unsupported/reacted/builderCompleted，并有分母、失败 id 和原因。T0/T1 标清级别，保留语料 ≥200/creative≥30% 断言。把原“unsupported>0”骨架断言升级为 0 的依据是 06 §6.11/A3 退出标准，不能只把 support 开关改 true。
3. mark 创建后推进至最多 7 日，读真实 reaction 事件及关联实体；没有订阅/没有见证/收益上限分别有正反例。刻意重复刷 mark 的测试单列衰减语义，不靠增加无效果空事件伪造奖励。
4. 第五节推演题落成引擎测试；第四节 22 判据逐项指向 C/D 的具体断言，另外 4 条表级接线必须升成引擎断言。总表仍保留其他阶段未完成项，不能把同一道题其他 S4/S5/S6 判据顺便标通过。
5. 新提案导出/导入、进程内重放、删除锚点重算、不同步长、重复提交、pending 失败/回滚；与旧合法别名的状态/账本等价。审查差异只交原责任卡修，不越过文件所有权自行改引擎。

**验收文件**：`tests/intents.test.mjs`、四个新增 a3 集成文件、`tests/probes/run-001.test.mjs`（阶段要求）、`tests/a3-daily.test.mjs`（复用 C 有效证据，无变化不重跑）+ CORE；`node tools/intent-score.mjs --json` 必须输出真实执行指标。阶段全量、baseline 的 23 项预期失败、build:release 及真实提示栈由主会话统一跑一次，沙箱阻碍如实列出；不在本卡重复造另一套全量扫描器。

## 四、A3 日常 22 条逐项交付表

来源是 executable-status 的 **22 个“需机制（含 A3）”判据，分属 16 个场景**，不是任意选 22 个 test()。除 D08.1 前端投影归 D，其余归 C；E 负责核对覆盖。每条沿已有 daily-b2/a1 测试保留原先钱/物/时/身份不变量；原 todo 只有在变成对应的可执行断言后才可改成 test，不得删除占位来掩盖遗漏。

| # | 判据 | 必须执行并断言的结果 | 补充边界 |
|---|---|---|---|
| 1 | D04.4 住店体力 | stamina 从 30 按 9 小时单间恢复，封顶 100；房钱、hp、夜间运行保留 | C：读 sleep/recover 与实际住宿设施 |
| 2 | D05.2 吃饭饱食 | nutrition 加饱食、hungry 阈值解除 | C：不能只改叙述 |
| 3 | D05.3 当场吃完 | 买到的熟食真实 transfer→sink:consume，不留新增餐食 | C：原存粮不误扣、不能重复吃同份 |
| 4 | D05.5 用餐耗时 | 整次点餐/食用约 20–30 分钟，按 eat.meal=25 的组合动作约定 | C：不再叠加两笔旧交易时间变 35 |
| 5 | D08.1 天黑 | 同一 daylight 数据使无 LLM 场景头明确天色已暗 | D：不泄漏不可见 NPC 状态 |
| 6 | D12.3 春播工时 | 2 亩×0.5 工日×480=480 劳动分钟 | C：真实田地/种子动作，不拿表乘法当结果 |
| 7 | D12.5 春播磨损 | 所用锄头实例耐久下降，损耗读动作/工具数据 | C：无工具/耗尽不能继续满额播种 |
| 8 | D13.3 秋收工时 | 2 亩×1 工日=2 工日，按工休约定落到约 1–2 天历时 | C：区分劳动分钟和历时，不能写两个矛盾数字 |
| 9 | D13.4 秋收磨损 | 所用镰刀实例耐久下降 | C：真实收获事务，不能重复收已空田 |
| 10 | D14.3 持续采药 | durationSlot=120，允许 30–480，真实推进约 2 小时 | C：当前地点/季节/存量仍受限 |
| 11 | D14.4 工作学习 | learn(source:practice) 约按 work 1.7/小时增量，日上限/衰减生效 | C：2 小时不能整阶跃升 |
| 12 | D15.2 钓鱼耗饵 | 从实际 10 条饵扣本次使用量，不能负数/不耗饵钓无限鱼 | C：补正式饵数据和钓鱼动作，不混同耗水/磨刀 |
| 13 | D16.5 做饭 60 分钟 | 半时辰=60，所选真实配方制作耗时与回执一致 | C：现 `recipe_w3_fish_broth` 为 30，按题面对该配方定点修正为约 60 或使用真实 60 分钟配方；不把全体制造翻倍。原“耗时=recipe.minutes”断言保留 |
| 14 | D18.2 修好同一把剑 | 修理 service 按事前报价与目标上限完成原实例 | C：原题允许“100/100 或铁匠说明的上限”；预览必须先说明磨损上限，最终达到该上限。不能只断言 >20；同一实例/附加属性/收费不变 |
| 15 | D19.3 三天授课 | 按约定 3 天服务推进，教材/教师意愿有效，分段学习，学费总额不重复扣 | C：可正常作息，不能单次 learn 30 分钟冒充三天；S3 service 复用 |
| 16 | D20.1 练习两小时 | practice durationSlot=120，时间/体力/学习同时落地 | C：练习是确定增量，有上限，不转自学随机骰 |
| 17 | D32.3 三天外敷药 | 医师真实库存转出或配方扣料制成 3 天份，患者得到可用药 | C：原药材扣减、诊费、非瞬时痊愈断言保留 |
| 18 | D33.2 睡眠体力 | 20+12×8 封顶 100，与住宿/露宿条件对应 | C：饱食消耗不因睡眠被抹去，hp 旧保证保留 |
| 19 | D35.2 灯会奖品 | 原购得两月饼保留，答对实际登记谜题→主办库存转花灯 1 | C：A2 决策/答案机制复用，不让 LLM 自报答对即领奖；防重复 |
| 20 | D35.5 散场时间 | “看到散场”按 endsAt 推进至亥时 | C：不是固定再加 N 小时，不重放重复领奖 |
| 21 | D36.5 当面入会 | 到场请求→A2 同意/条件/拒绝→实际 15 分钟；资金进公库/退回语义保留 | C：旧“次日日界才表态”不能假扮当面完成 |
| 22 | D38.4 阅读与旁听耗时 | read.notice 5 + talk.overhear 10=15 分钟，钱不变 | C：提供能实际触发的读/旁听动作及来源；S6 完整语言失真/传导、S4 公告征税仍单列 |

**另需升格的 4 条表级结果**（不挤占以上 22）：D22.5 打听=15 分钟，D23.4 接任务=7 分钟，D27.5 存钱=15 分钟，D31.4 combat.bout=1 分钟/回合（典型 3–15 回合约 3–15 分钟）。归 C；尤其避免 world_act 外补时间与旧 handler 再 advance 一次。D22 请喝酒未真正交给对方的旧测试占位，要沿本次消费/赠予动作补齐真实转移；其 S6 印象传播不得虚报完成。

题面缺正式人物/地名时沿 daily-b2 现有本项目夹具映射；不能去改发布 NPC 档案凑技能。田地/草药/配方/医药等仅可补本题所需真实输入与动作连接，不借题重建整个 S5。共享判据依赖后续阶段时明确标“A3 动作断言通过，其他判据仍待 Sx”，不跳过 A3 对应断言。

## 五、推演题与 F5/F6 的执行验收

路线没有给 A3 独占的一整轮 E/N 题号，以下按追加项从现有推演题抽取 **A3 子判据**，不会宣称整个跨阶段场景提前通过。既有题面与后续 design-review 冲突时按当前架构/附录定义；在测试旁写逐处依据，保留原始题面，不修改架构文档。

| 测试组 | 来源 | A3 必须断言 | 实现责任 |
|---|---|---|---|
| P1 非自愿施术与盗窃 | run-005 E15②，兼 E15①守恒 | 无同意读心不被简单“未支持”拒绝：对抗成败+unconsented；强制/改记忆另加标签；钱袋真实转手后不能从原扒手身上重复掉落；合法目的不自动提供同意 | A/B/C |
| P2 同意三来源与教者意愿 | run-006 E19①②③④、run-007 E17①；run-007 E6① | 语言不通≠昏迷；自称监护人无效；有 guardian/mandate/明确紧急条款才代为同意；撤销/用途越界生效；教师愿教/service 与偷学 ×0.25 分支；传授不扣教师技艺 | A/C |
| P3 受限可玩 | run-006 E13③、N3；E5 的放人/替身接点 | 探监许可后能受教/授艺；在押角色可交流/签约/观察/等待/脱逃，普通移出被挡；无权直接 close 拒绝，有权无依据 close 留标签；越狱成功发 escaped，现有案件承接钩子接通。新余刑/规范程序归 S4 | A/D/C |
| P4 同刻争夺 | run-006 design-review 的“争夺池粒度”专项；run-007 E18①的有限名额部分 | 两个提案争最后一份货/名额，pending→最终一次结算；钱/货/义务整提案原子，输家无残留；持有多个 contest 标的也不能只赢半单；反应晚于胜负；LLM 等最终回执 | A/B/D |
| P5 制造不可绕过配方 | run-006 私铸/制造源汇专项、N7 符箓绘制；run-007 E16① | “造一百斤盐/一批符”命中配方且受投入/工时/设施限制；开放 transfer 不可用 src:craft/src:mint；无配方不产计量资源；材料守恒、成果/副产物/失败消耗全记 | B/C |
| P6 仪式 | run-006 E13①②、N7；run-007 E18① | rite 主祭/地点/角色/时窗、分阶段与中断、反噬；有限来源耗完不能第二次施效，失败原因可知；诊断错误不直接读真相给玩家。S5 新天气槽和 S6 完整传闻不算本卡通过 | B/C/D |
| P7 兜底实效 | 06 §6.9.5/§6.11，238 语料中的 39 条 fallback | 每条经真正 mark 创建，7 日内至少一次合理反应；作者×标签×地点衰减、数量上限、材料扣减，不能凭留痕创造钱/装备/技能。off 也有注册 leave_mark | B/D/E |
| P8 数据扩展不越权 | 第五轮 A3 追加（前置补丁、authority） | 两规则包分别追加前置，加载顺序交换结果一样、来源可解释；禁改 reserved/outcomes；mandate 超范围标记与实际占有边界；RX 不接触宿主、守卫不漏匹配、定点重放一致 | A/E |
| P9 创建与旧玩法兼容 | 第三轮 world_create 追加 + 既有 runtime-invention/S3-I | 通用模板登记无资源/账户/兑现能力；伪造金钱/服务/高阶属性被裁剪；非模板转 mark；已研究配方/法术仍可登记并实际制作/施放；S3-I 的义务动作全部仍可查可执行 | A/C/D/E |
| F5 | 指南 11.3 F5 | 从“净水卖水”的构造器/提案开始，真实水源与容器、施法/加工、计量产出、出售/费用/时间连续落账；直接造钱/超量提案裁剪；有 LLM 与无 LLM 同 seed 同事实 | B/C/D/E |
| F6 | 指南 11.3 F6 | 盗窃或强施成功/失败→真实物/状态改变→合法性描述→按实际见证进入现有 law/standing/memory/rumor；有目击与无人目击双夹具，不全知、不无故封动作、不丢原子性 | A/B/C/E |

F5/F6 要通过实际公开入口并校验原语与账本，不许直接往 state 放“已净化”“已立案”后称流程通过。E 统一编排 `a3-f5-f6.test.mjs`，B/C 各测自己责任层，D 负责无 LLM 入口。

## 六、验证与交接规则

各卡文件列表中的 node 测试统一按用户命令形式执行（逐相关文件或小组，串行，避免嵌套子进程）：

```powershell
$env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'
node --test --test-isolation=none <本卡相关文件> 2>&1 | Select-String -Pattern '^ℹ (pass|fail)|^✖|^not ok' | Select-Object -First 40
```

CORE（每卡最终状态一次，主会话合并后一次）：

```powershell
node --test --test-isolation=none tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs 2>&1 | Select-String -Pattern '^ℹ (pass|fail)|^✖|^not ok' | Select-Object -First 40
```

在不新增变更/失败的情况下复用已报告证据；最后一段接线有变化，只补相关测试及必要 CORE。PowerShell 不把带通配符的不存在路径当已运行文件；测试清单先用 rg 定位。浏览器和子进程 EPERM 如实记录，交主会话外跑；不把这些失败更名成 skip，不改断言。读取失败详情仅单失败用例最后 30 行。禁止按名称/批量杀 node，只能结束本人启动且记录 PID 的进程；最多 3 个 node 并发；临时调试文件结束前删除。

**测试改动的逐处依据要求**：D16 保留 recipe.minutes 一致性、数据按时辰口径修；D18 按原题“或事先说明上限”，必须预览声明且达到上限，不退成“有所恢复”；同意由拒绝升级为对抗依据 06 §6.5/附录 A.15.20，同时保留伪同意/越权/失败零效果；intent 骨架升级实测依据 06 §6.11；工具计数对齐公开集合且保留成员检查。每一处具体修改旁注或交接报告写依据，其他断言不降低。

新增表只因实际执行器需要而加；不新建独立“计划覆盖清单校验器”。mark 每标签订阅校验属于 06 明文要求，应接既有 world/schema 构建链，且配运行测试，不另造形式证明项目。内容数据有改动时走现有定点验证，不整批重审目录。

## 七、静态提示、工具面与主要风险

1. **提示余量只有 1,407 token**：按用户指定 A1 口径/最新 S3-I 的 10,593 对比硬上限 12,000。PROGRESS 中 A1 刚合入曾报 10,571，不能挑较小数字替代当前基线。本会话未重建提示，10,593 是历史记录输入。D 要用 `loadPromptBundle().budget.estimatedTokens` 的现有口径实测 before/after，包含工具 schema，不仅量说明文字。world_propose 原语语法/示例、world_create 模板约束、同意/回执约束是主要新增来源；若按 06 估计新语法约 600 token，还要计 schema 成本，不能先承诺够用。
2. **工具面当前记录为 27，A3 只增 world_propose 后约 28，S8 才收至 ≤16**。按 `toolDefinitions()` 的公开工具统计，不数内部 define，也不把 world_act 目录动作算工具。A3 不另开 world_consent/world_rite/world_mark 等工具；新日常/义务/研究动作进目录。先在现有查询补 affordance；world_query 若最终替换 world_read，只替换公开职责并保留旧名解析，不能两个都长期公开又不计数。最终 16 的预算是查询/搜索/目录/动作目录/执行/提案六项 + 八个高频别名 + create/remember 两项；A3 不抢做 S8 全量退役。
3. **强制压回 10,593 不能靠删必要信息**：优先动态 world_actions/affordance（场景可做段 ≤600 token）、短工具说明、单一原语语法与示例、目录元数据。禁止把新动作/术式/全部原语参数枚举重复塞入静态多个位置；若超 12,000，D 先去重和搬动态详情，再验真实工具调用能力，不提高 budget.limit。
4. **最大实现风险是共享入口和时间双扣**：现在 HTTP 在存档前把 world_act 降成旧调用，engine 另有拘束拦截与服务/同意检查，body 与 action-costs 又未接通。若只在外围套 propose，既会旁路旧保障，也会重复扣钱/时间/技能。A 的保留 action envelope、唯一成本归属、旧回放兼容必须先行；C 移走已迁移 handler 的重复责任。
5. **规范可发生性不能等同“无权都放行”**：被拘禁仍可行动、无同意可对抗、无权占有人可处分，有明确例外；escrow/collected、无占有、跨地 transfer、随意释放法律持有仍不可。authority 返回来源和标签；完整民事效力/跨法域处置归 S4。预览未实现的规范细节不得伪装成定罪结论。
6. **238 条执行与 mark 反应可能成为假绿**：旧评分自比；全用 mark 可以把不支持率刷到 0 却违反 ≥70% 完成率；订阅器存在不等于发生反应。E 必须分别统计计划结果、实际状态、原始意图完成和留痕；重复衰减、私密见证、7 日时窗另测。原语加时间后会改变既有推进快照，只有具体变化可解释时才更新，不能批量接受新快照。
7. **RX 不是几个字符串 if**：明确要求编译、定点与守卫，A 很可能是关键路径。复用已安装依赖和现有谓词/视图，不用 eval，亦不自造通用编程语言/沙箱服务。按真实动作与标准语法闭合，不为 S5/S6 未实现领域函数造假的返回值；未知函数应准确报缺接点，由对应阶段补库。
8. **文件所有权与阶段接点**：A 共享文件、C 核心目录、D 静态工具和导出清单、B 新 open 数据各自唯一；schemas/ontology 接点由 A 在串行集成尾段统一写，不能让 B/C/D 各补一份。新模块归层也统一由 A 更新，防止重演 S3 的 L0→L1 依赖回归。主会话派工前核对 R39 等在跑会话对 engine/scheduler 的所有权，再合入 A；不得据状态文件旧时间猜测文件无人占用。

## 八、本次已做与下一步

已读上述设计相关段、A1/A2/S3 完成记录、实际 gateway/registry/engine/consent/effect/learning/create/scheduler/评分器及日常测试责任处；只读执行意图评分器。相关 `intents.test.mjs`、`action-registry.test.mjs`、`s3-action-catalog.test.mjs` 测试命令使用用户过滤管道；明确记录 nodeExit=0，终端过滤未显示 pass/fail 行，不报告测试数量，也不据此称 A3 验收通过。未运行 CORE、全量、release、浏览器或真实模型，均非本次只读拆卡的代码验证需求。

没有代码修改、Git 写操作、部署、秘密读取、进程终止或临时调试文件。剩余工作全部是五卡执行与阶段验收。下一步由主会话独立审定本草案及文件分工，先派 A；A 交付可运行共享契约后启动 B/C/D，空槽安排 E 准备独立语料，最终由 E 与主会话汇总真实验收。没有额外向用户申请已授权实现选择。
