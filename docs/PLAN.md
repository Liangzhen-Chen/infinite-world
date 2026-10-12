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

已完成：榆坡4人、带路回执及送货付款前置已集成；相关、合后核心及8轮隔离HTTP前置通过，未跑模型。 完整任务卡及验收约定见[已完成卡](PLAN_已完成.md#t01)。

### T02 四村产业、税贸账与治理权限

已完成：四村生产/库存/分阶段税贸和权限已合入；L1/L2/L4、相关与合后CORE通过，人口未增。 完整任务卡及验收约定见[已完成卡](PLAN_已完成.md#t02)。

### T03 四村档案的引擎查询与真实检索

已完成：公开账/权限真实HTTP检索通过；传闻实际获知链由T21闭合。 完整任务卡及验收约定见[已完成卡](PLAN_已完成.md#t03)。

### T04 完整人物质量门槛与字段审计

已完成：独立审计152full/1840缺口及17traits名单回归；T11-A已接全体release/final。 完整任务卡及验收约定见[已完成卡](PLAN_已完成.md#t04)。

### T05 可复用的定点人物修订流水线

已完成：定点叶子合同/冻结指纹/可迁移manifest与预演发布已合入；相关与合后CORE通过，无真实模型。 完整任务卡及验收约定见[已完成卡](PLAN_已完成.md#t05)。

### T06 榆坡剩余人物深度

目标：榆坡 30 份已有 full 档全部达到 T04，仅修剩余不达标字段。涉及文件：新增 `world/design/w1-yp-depth-rest.mjs`、`world/drafts/w1/yp-depth-rest/`、`tests/npc-depth-yp.test.mjs`；不直接改 baseline 或共用工具。

实现要点：已修 10 人的合格六类内容沿 T01 证据保留，但逐人修审计命中的 opinions/notes 等规则措辞，不能整人跳过或追加无必要的记忆。从 `details.problems` 的轮水册、工场占位等实际问题每次选择 3–5 当事人，按失败路径补 known/unknown/steps/共享经历和关系来由。剩余居民也依据各自家庭/地点实际事实补缺，不复制一套措辞。复用 T05 CLI，design 使用 before/baseHash/issues/patch，sharedEvent 仅在实际共享记忆缺口时存在；共享经历双方兼容，无新增钱物或秘密授权。

验收：`node --test tests/npc-depth-yp.test.mjs`、CORE；`node tools/npc-depth.mjs --design world/design/w1-yp-depth-rest.mjs --root world/drafts/w1/yp-depth-rest --prepare` 后在取得模型槽时用同参数加 `--budget-root` 运行审核。增量预算 2 元且 W1 累计不超过 20；L1/L2 无硬错、L4 完成、全部 30 人合并视图过 T04；提交候选与逐条审核。不要做：重复改已达标字段、新增 NPC、整批重写、发布其他村。依赖：T02/T04/T05；并行：作者阶段与 T07–T10 文件隔离，模型阶段独占。

本轮阻断：候选已在 `41f4998` 保存，30 人合并审计零缺口、prepare 与相关/CORE 通过；真实起草出现 `{candidate:{id,contract,patches}}`，顶层严格合同拒绝，25 次已发生请求费用 0.15959304 元，L2/L4 未完成。候选准备完成不等于审核通过。T22 通过后只续跑受此接口错误影响的 id，保留原失败及用量，不重做合格旧正文、不重跑游戏，仍沿同一 T06 的 2 元增量额度。

T06 本次卡住复核：现有 28 人 passed-L1-L2，未完成 L4，不能发布整批。汤桓当前两条 hard 仍为 `knowledge.unknown[0]` 的约工便条与裘砚共享记忆，`contentRevisions[0].changes=[]`，表明补来源复核未改这两叶；不把同一候选重复审查计作两种内容修法。执行代理已按两次失败停止，由本次规划只给一次有实质差异的收尾方案；仍失败即标卡住，不循环模型碰运气。孔馥 10 叶已修，修订后状态 failed 的原因是预算入口拒绝，没有新的 L2 结论。

定点处理：汤桓 unknown[0] 改为“嫌泥点碍路的住户希望自己先清扫哪一处，何时方便再去收尾。”只利用原档住户嫌散泥碍路与收尾目标，不保留无来源的约工便条，不声称住户已同意。共享记忆先保留双方一致的现候选，补入冻结原档裘砚 `relationships` 中 `with=npc_yp_tanghuan/type=同村日常往来/note=认识同村汤桓` 的实际来源；上一补件列汤桓/章颐/利莎/汤茹而遗漏此当事人。这只补充可核验关系证据，不以已过审核的另一候选证明新事实，也不预判“相认/知道职业/货签”整句必定相容。L2 若仍认为事件超出原始来源，停止；不可只改汤桓一侧共享事件而保留裘砚已通过的另一侧，也不可用本次授权重新审核其他 28 人。

预算与验收：授权仍仅原 T06 单卡 2 元，当前 spent=1.81851976、未知 reserved=0.083736、剩余最多 0.09774424；共享 spent=2.7665348 与 20 元波次限额不改变单卡上限。等待 T22 公共 review 稳定预算入口验收后，再按同一卡、同一共享账运行，禁止临时 client 空账或释放未知预留。可无损精简重复上下文：保留完整 before、全部候选 patches、全部 issues、原始引用人物/地点/地方问题、约束及复核边界；去掉由 before+patches 重复表示的 facts/revisions，原人 sourceRecords 仅去掉与 before 严格相等的字段，明确字段来源映射。1800 输出额度不降，不截断正文或隐藏被报错字段。对当前两份保存请求作离线投影，保守预留分别约 0.049068 与 0.045006 元，总计 0.094074 元；此数不含新增裘砚来源及调整后的提示，最终请求须由稳定入口重新按 UTF-8 字节和现有最高费率计算，不能照抄估数或依赖缓存折扣。优先续审已修孔馥一次，再判断汤桓最终请求是否仍可预留；每人仅一次本次规划续审，余额不足或任一仍 hard/截断即保存卡住。两者通过后仍完成本卡原 L1、L4、合并审计和相关/CORE，不把 L2 当 L4，不重跑游戏；本段不另派重叠公共流水线卡。

### T07 苇汀人物深度

主会话授权的合后特定换行窄修：原方案hash9c58016d及sourceHash保持；指定苇汀源原CRLF/钉死Git blob纯LF只差换行，sourceCheckoutEvidence逐文件绑定planHash/file/originalHash/blob/LFhash及原CRLF重建hash。当前必须严格等于钉死LF文本或完整CRLF重建，混合/字符/字段/伪凭证拒绝。仅必要npc-depth/复审/发布收据传递路径+hash，publication重新验证；缺选项旧合同不变，T06/其他源不得套用。本卡世界/测试及这几处公共依赖由原T07执行者0模型收尾，模型槽仍未授。

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

T10 本次卡住规划结论：官方 first-review 自然结束为 19 passed-L1-L2、13 manual，尚无这 19 人 L4 已批准的结论；原 card limit=3、spent=1.99097608、reserved=0，剩余最多 1.00902392。12 个新背景参与者三次真实响应均漏 reviewedPaths；抽查罗巍原始响应 finish_reason=stop，已含 contradictions/backgroundReviews/完整风险路径，所以 coverage 失败是真实协议不合格，不能补造。陆青属于这12人但另有真实 hard：`goals.long[0].steps[1].content` 把白蕙称为“学者”；只将该词改为“学员”，走原 audit 权限及真实 hard 绑定的受控修订，不能当纯协议重发原错句。第13人许苓的 `relationships[0].note` 所述陶芷照顾患关节病母亲，原 `npc_hw_taozhi.notes` 明确支持，而旧 people 投影漏 notes；仅经 `--source-evidence` 补许苓本人和陶芷原 notes/关系等必要字段，严格匹配冻结来源，不新增知情授权，不预判所有 soft 已解决。

本次只授权 T26 修复后对上述13个实际失败 id 各做一次有证据的定点 L2：npc_hw_chenbai、npc_hw_xuling、npc_hw_wushuo、npc_hw_luowei、npc_hw_gucen、npc_hw_meiling、npc_hw_yanzhe、npc_hw_luqing、npc_hw_anhuai、npc_hw_shendu、npc_hw_xinglu、npc_hw_feikai、npc_hw_xiejin，最终白名单以 `first-review/protocol-failure-evidence.json.failed` 精确白名单为准。先选罗巍确认真实三字段合同与全部 coverage，再在同一原卡余额内串行处理其余；首个仍漏 coverage/有 hard/截断则停止并记录卡住，不再整批尝试。原19个 passed 的 draft/review/hash/费用及13个旧失败/attempts/原始响应全保留，修复不清 recovery 次数；复审通过仍须新 L4，剩余19人照常做真实 L4，不能伪造批准。当前旧提示经现有 compact 后13请求保守预留总上界约1.547662元，单条约0.056686–0.128234元，尚未计新 schema/来源补件，不能保证剩余1.00902392元足够；最终逐请求按实际字节/最高费率预留，余额不足即停，不扩大单卡上限或动T06未知预留。不重开T06。

### T11 人物分批原子整合与全体质量门槛

调度依据：用户明确的硬限制是第 1、2 项完成前不得新增人口，并要求卡住后继续其他块；人物优先级不等于让已卡住 T06 阻断全部无关验收。指南 D.3 第 1 项要求原有 18 人完整档，D.6 的 W1 允许 M2 期间并行；C.4 的全量测试及 release 仍是里程碑关闭条件。故允许先整合已完整审核的河湾 32 人并进行 M2 专项验收。T06 保持卡住/待用户决定，不拆分其失败记录规避停止规则，不增加人口，不将分批整合称为全体人物达标。

T11-A 完整任务卡：目标是提供按批准内容卡分批、整批原子 preview/apply 的发布机制，并将 T04 全体 full 深度门槛接入 release/final。涉及 `tools/publish-npc-depth.mjs`、`tools/validate-world.mjs`、必要的 `tools/build-world.mjs` 入口、新增 `tests/npc-depth-batch-publication.test.mjs`、`tests/npc-depth-gate.test.mjs`、`tests/world-validation.test.mjs`；与 T25 对公共发布器的修改串行，复用其旧/新审核凭证，不能另造绕审核的入口。新增明确 `--batch-manifest <world内清单>`，清单列本次已批准的完整卡 manifest、原世界 hash 和预期 id 集合；默认 preview，`--publish` 才 apply。现有单 manifest 合同保留。优先一次整合 T10 全部 32 人，随后 T08/T09/T07 各卡审核完整后可逐批；本次不提供把 T06 的通过人物拆出来的特殊通道。

实现要点：复用现有单卡 foundation/candidate/context/record/L2/L4 hash 与原审计权限校验，将无写入准备提成公共函数；在同一当前世界快照上逐卡构造 next，确认所有卡通过后才对 people/baseline.json 做一次原子替换，发布前再次检查磁盘原文件 hash 防并发覆盖。任何一张卡、任一引用或跨人约束失败均零写入，不能先写通过的前一张卡。新共享事件必须闭合：所有参与者在本批已批准候选中一起更新，或正式源已经存在同 event id/地点/事实/knownBy 的相容审核结果；另一参与者仍待审、卡住或内容不同则整组延后，不发布半边记忆。对事件依赖形成的连通组检查完整覆盖，普通关系引用仍要合法且不修改对方合格字段。保留原有及后来 memorySeeds、17 人固定 traits、运行钱物和正式教学服务；基线冲突停在具体字段，不直接复制 worktree baseline。preview 返回精确 id/path 变化、事件闭合结果、源/结果 hash 和全世界质量缺口；所选人物必须零缺口，全世界未选人物缺口照实保留。

release/final 门槛独立于发布批次：validateWorld 的 release/final 必须遍历正式源全体 full，调用 validateNpcDepth 和 findNpcRuleWording，不接受 selectedIds、地区过滤、跳过参数或仅验证本批；仍保留全部负例及 17 人 traits 回归。未修全时 build:release 非零退出是正确行为，不能用局部通过替代。分批 apply 写经完整审核的世界源不等于发行构建成功；门槛接入可先完成，其失败清单作为 T11-C 的未完成证据。不要提前将 T04 的阶段性缺口断言改成“所有正式源合格”，改用明确阶段状态及独立负例，不删除失败测试。

T11-A 验收：`node --test tests/npc-depth-batch-publication.test.mjs tests/npc-depth-gate.test.mjs tests/world-validation.test.mjs tests/npc-profile-publication.test.mjs` 与 CORE。临时目录证明两张全审卡成功一次写入、第二卡坏 hash/缺 L4/共享伙伴未批准时第一卡也零写入，预演零写入、并发磁盘变化拒绝、重复 apply changed=[]；正式钱物/教学服务/traits 不变，后续兼容回放不丢记忆。门槛测试用“所选32人合格、未选任一full不合格”世界，release/final仍拒绝；修全才通过。模型预算0，不调用模型、不修改审核正文、不部署。依赖 T04/T05/T24/T25；与公共 publisher、validate-world 或世界人口写入串行，可与各村独立候选审核并行。

T11-B 完整任务卡：目标是把已完成 L1/L2/L4 的原有/河湾 32 人按 T11-A 合法整合，形成 M2 可用的正式源快照；以后以相同流程逐卡整合其他全审村。涉及本批 `world/drafts/w1/depth-publication.json` 或独立具名清单、`world/people/baseline.json`、必要的现有版本元数据，以及 `tools/publish-w1-villages.mjs`、必要的 `tools/m2-people-publish.mjs` 对已审核补丁的幂等保留；相关 `tests/w1-villages-publish.test.mjs`、`tests/npc-profile-publication.test.mjs`。执行前核对本次全部人物的真实 L1/L2/L4、批次成员与新旧凭证，不把 offline 零缺口当已批准。T10 32 人与原 M2 18 人 id 包含关系和 M2 会话实际 NPC 引用逐一作机器集合检查；若场景还引用未批准 full，延后该场景并报告，不删场景凑12项。初始人物总数保持152 full/294名册，版本升级只沿现有 world_upgrade，旧文档状态、财物、记忆与消耗库存不回退。

T11-B 验收：`node tools/publish-npc-depth.mjs --batch-manifest world/drafts/w1/depth-publication.json` 预演、核对批准闭包后同命令加 `--publish`，再预演 changed=[]；运行 `node --test tests/npc-depth-batch-publication.test.mjs tests/npc-profile-publication.test.mjs tests/w1-villages-publish.test.mjs tests/npc-depth-gate.test.mjs` 及 CORE。保存32人逐人质量零缺口、全世界剩余缺口及精确世界/hash清单；主会话运行 build:release，未选 full 尚缺时必须失败并归 T11-C，不修改退出码。没有任何卡内或跨卡半边共享事件；旧发布重跑须通过已校验的补丁发布凭证识别合法后续修订，不恢复旧 opinions/notes、不抹新补丁；无凭证或与凭证不符的后续变化仍拒绝，不删除旧冲突断言。模型预算0，原卡审核成本仍在原卡；不得借本卡复审T06。依赖 T11-A、T10 真正审核完成、T03/T21/T24；其他村批次各依赖其原卡完整审核，不依赖T06。世界写入串行，完成后可审核本子块，不打完整人物波次达标标签。

T11-C 全体人物质量关闭：只有 T06–T10 全部所需人物和事件完成并整合后才可关闭。全体正式 full 的 validateNpcDepth/findNpcRuleWording 零缺口，原17traits固定值不变，随机10人平均至少4、单项至少3；主会话跑 npm run build:release 并须成功，保留其他类别失败；必要相关测试和CORE通过后打 review-w1-depth 并派审核。依赖全体内容卡及 T11-A/B，当前随 T06 保持卡住，不通过拆批假称本卡全部完成。原第1、2项完成前不新增人口的限制一直有效。

### T12 修复 M2 审核截断和引用失败

已完成：单N完整审核及旧报告CLI已合入；mock/相关/合后CORE通过，真实调用0，旧失败不改。 完整任务卡及验收约定见[已完成卡](PLAN_已完成.md#t12)。

### T13 M2 真实前置与行动链修复

已完成：五链实际位置/60分钟/燕麦/濒死司法/十天结算，定向40及合后CORE38过；模型0，叙述错留T15。 完整任务卡及验收约定见[已完成卡](PLAN_已完成.md#t13)。

### T14 原送货树的 M3 语义耗时 WIP 收尾

已完成：WIP及89ed384已集成；语义时间负例/显式交谈/恢复通过，合后CORE通过；未跑300轮模型。 完整任务卡及验收约定见[已完成卡](PLAN_已完成.md#t14)。

### T15 知情边界与离屏回忆的实际失败修复

已完成：私密任务边界/实际8次木8费16回忆及替人发言回归，定向61与合后CORE过；真实模型留T17。 完整任务卡及验收约定见[已完成卡](PLAN_已完成.md#t15)。

### T16 M2 汇总门槛与选工具实测口径

已完成：有效N/账本/知情/盲辨及工具实测口径合入，相关18/合后CORE过；原真实失败报告不变，模型0。 完整任务卡及验收约定见[已完成卡](PLAN_已完成.md#t16)。

### T17 M2 里程碑真实验收

目标：以修复后的正式提示栈取得 M2 联合验收证据；真实专项证据与全世界 release/里程碑关闭分别报告。涉及文件：仅 `docs/测试报告/最新/` 的报告、失败摘要及费用记录；执行前读取实际脚本 id，默认十场 id 为 npc_social,npc_private,npc_shove,guide,npc_delivery,npc_quest_social,npc_home_visit,npc_offscreen,npc_voices,npc_courier，若文件内 id 不同以实际值构造 `--only`。

实现要点：河湾32人须先完成真实L1/L2/L4并通过T11-B整合；执行前核对本轮场景全部NPC、显式/隐式共享事件参与者及离屏自治依赖均来自批准正式源，保存源hash，不能仅凭“场景都在河湾”推断无依赖。已确认的默认十场无四村显式NPC引用；若运行前置发现实际依赖未审内容则针对该场停止，不能删场景降低至少12项要求。运行器读取这份正式源与现行提示，不得用旧dist、删减世界快照或改build开关绕全体门槛。先用 T12 重评工具核查保留失败，重评不算修复后的试玩；用真实 HTTP 存储与 MemoryIndex、正式角色卡/提示源、实际模型前缀和历史，禁止伪造工具结果。主会话独占模型槽，保存 prompt/scenario hashes、实际 token 和花费上界、选错/漏调用分母。测试前置失败是失败，不用人工改世界续场。

验收：`npm run test:playtests -- --milestone M2 --only npc_social,npc_private,npc_shove,guide,npc_delivery,npc_quest_social,npc_home_visit,npc_offscreen,npc_voices,npc_courier --repeat 1 --parallel 4`；这些 id 已在现有 JSON 核对，若 T13 新增必要 N 项会话则同步加入。单轮总预算 30 元，T12 重评增量最多 2 元并合并预算，缺环境变量记阻碍，不读密钥文件。至少 12 项完整覆盖且通过率不低于 90%，账本断言至少 90%，N6/N16 零泄漏，N17 十天新增行动自然呈现，选错工具率为实测数且有分母；N12 若计入必须匿名盲辨通过。每条失败最多一次复测，失败保留并交规划拆修复卡。主会话跑 CORE、`npm test`、`npm run build:release` 作为里程碑检查；子代理不跑全量。不要做：反复整批重跑、自动宣告 M2 完成。启动依赖：T10真实L1/L2/L4、T11-A及T11-B河湾批、T12–T16及T23完成；不依赖仍卡住的T11-C。并行：模型阶段不可与任何模型卡并行。N类联合指标达到可记录“M2专项通过”，打 `review-m2-evidence` 供审核；若 npm test/build:release 仍失败，M2完整里程碑和发布门槛保持未关闭，不能打完整 `review-m2` 达标标签。T11-C完成且全检查通过后才关闭；已取得模型证据保留，后续只在相关人物/引擎/提示/场景变化使证据失效时按原预算和单条复测限制补验，不为等待全世界修全再整轮付费重跑。

### T18 已审核 14 法术的学习来源

目标：每条已有候选都有玩家实际能获得的学习来源。涉及文件：`world/design/w2-reuse-candidates.mjs`、新增 `world/design/w2-reuse-learning.mjs`、`world/drafts/w2-reuse/` 的来源审核记录，必要的新书/教学数据候选；新增 `tests/w2-reuse-learning.test.mjs`。不提前改正式人口。

实现要点：复用 `reuseSpellCandidates` 的已实现效果，17 正式法术与 14 候选保持去重；参考 `tools/publish-m4-batch2.mjs` 中 spell/book/learning source 合并形状及现有书籍取得方式。来源可为实际已有合资格教师或有可买/可借路径的书，导师 services/serviceCatalog 白名单、技能条件、价格和地点作息必须一致，不能只是 catalog 文本里提到一本不存在的书。新来源按审核流水线，原法术已审核正文不重写。

验收：`node --test tests/w2-reuse-learning.test.mjs tests/w2-reuse.test.mjs tests/m4-publication.test.mjs`、CORE；14 条来源引用、取得、学习失败成本和学习后施放路径均可验证。内容 L2 只审来源增量，上限 1 元并计 W2/M4 共用 20 元账，L1/L2 无硬错、L4 完成；候选正文审核指纹没有改动则复用。不要做：新增法术、新增处理器、无成本赠书或免费学会。依赖：T17 达标；并行：可与不触碰魔法目录的 M3 整理，无其他模型块时审核。

### T19 14 法术正式发布与效果复核

目标：把审核完整的 14 条法术并入 world 正式源及可用取得链，预计目录从 17 增至 31。涉及文件：新增 `tools/publish-w2-reuse.mjs`、`world/meta/spells.json`、对应书籍/教学/库存正式源、`tests/w2-reuse.test.mjs`、新增 `tests/w2-reuse-publication.test.mjs`。

实现要点：复用 `readApprovedContent`、`mergeM4Batch2` 的严格冲突/幂等策略及 `world_upgrade`；更新原“候选尚未发布”的测试预期为发布后仍检查内容一致和效果实际改变，不能直接删检查。14 条技能/材料/许可、距离、持续效果消耗保持已有机制语义；学习来源随世界升级进入已建战役，不回补已售空商品和旧现金。

验收：`node tools/publish-w2-reuse.mjs` 预演后 `--publish`，重复零写入；`node --test tests/w2-reuse-publication.test.mjs tests/w2-reuse.test.mjs tests/m4-publication.test.mjs tests/magic-primitives.test.mjs`、CORE。主会话波次 `npm run build:release` 通过、打 `review-w2-reuse`，模型预算 0。不要做：部署、把相近效果算成缺失机制、用目录数代替效果测试。依赖：T18；并行：正式 world 目录写入串行。

### T20 原人物树的玩家账本面板 WIP 收尾

已完成：WIP及305e8f9已集成；玩家账本隐私过滤、390×844截图与相关/合后CORE通过。 完整任务卡及验收约定见[已完成卡](PLAN_已完成.md#t20)。

### T21 四村传闻从源人物到玩家获知的可达性

已完成：40逐源真实获知及四村HTTP全链、拒绝边界/重启往返撤销通过；合后CORE过，未实跑模型叙述。 完整任务卡及验收约定见[已完成卡](PLAN_已完成.md#t21)。

### T22 人物起草顶层合同与共享/单卡预算护栏

已完成：严格合同、稳定预算与单失败ID复审已合入；完整源留证/无损精简、相关71/合后CORE38过，模型0。 完整任务卡及验收约定见[已完成卡](PLAN_已完成.md#t22)。

### T23 review-001 四村税贸真实作息联动验证

已完成：四份粮约正式作息提运/交割、无人拒绝与重载防重复通过；相关11/合后CORE38过，模型0。 完整任务卡及验收约定见[已完成卡](PLAN_已完成.md#t23)。

### T24 旧人物发布器保留已发布教学增量

已完成：精确已发教学/技能来源凭证与幂等保留合入，相关25/合后CORE过，非法增量仍拒，模型0。 完整任务卡及验收约定见[已完成卡](PLAN_已完成.md#t24)。

### T25 人物定点审核明确新背景事件的作者出处

已完成：独立新背景/受控修订/首次双审及原provider失败原文落盘合入，合后83过，工具0模型、T06仍冻结。 完整任务卡及验收约定见[已完成卡](PLAN_已完成.md#t25)。

### T26 人物 L2 三字段请求合同与精简提示一致性

主会话追加的同文件窄修边界：T09真实独立来源验证将event.id的_1误识别为_10/_11，事件ID只按递归字符串值精确相等判断，原叙述长句越界检查及未参与者不可获知均保留；补前缀正例/精确嵌套引用负例。T10唯一规划授权的陆青真实hard窄改被cardId只允许T07挡住，显式再允许T10，仍拒T06与任意卡，原authorizationHash/失败recordHash/draftHash/reviewHash/audit路径权限/同卡一次恢复和预算不变。原T07凭证不改；陆青唯一学者→学员和许苓冻结notes补件由T10准备，publisher需沿真实受控manifest/design绑定，不另造恢复框架。以上均直接阻塞未完成卡，模型0。

目标：修复 T10 已证实的请求歧义，保留严格逐叶与背景风险覆盖。`buildReviewRequest` 继承 defaultReviewRequest 的“只返回 contradictions”后，再追加模糊的 reviewedPaths/backgroundReviews 要求；模型三次 stop 响应仍缺 reviewedPaths，不能靠提高次数解决。只修输出合同和 compact 后的字段定位，不改 T25 身份、事实、秘密、跨人、授权和发布标准。

涉及文件：`tools/npc-depth-content.mjs` 的 buildReviewRequest、必要的 `tools/npc-depth-review.mjs` compactReviewRequest 提示一致性；新增 `tests/npc-depth-review-output.test.mjs`，补 `tests/npc-depth-authored-background.test.mjs`、`tests/npc-depth-review.test.mjs`。不修改 content-budget、世界正文/来源/候选、T07受控凭证、任何真实 record 状态或原始响应。T10 作者词语修订及来源补件在原T10树独立完成，实际费用仍归T10。

实现要点：对 authoredBackground 或 controlledRevision 请求，从第一条 system 就明确唯一完整顶层 schema：`{contradictions:[...],reviewedPaths:[逐个实际审过的draft.patches.path],backgroundReviews:[{eventId,sourceHash,reviewedRiskPaths,contradictions}]}`；无背景但有受控修订时明确背景数组应为空，普通旧合同保持兼容。列出本条待审 patch 路径和适用 event/risk 路径作为任务清单，说明审查后逐一返回；不能在解析端从清单补 coverage，也不能要求模型不审就照抄。明确字段类型、精确覆盖/重复或额外路径拒绝、真实 hard 原句/原因不可省略、无矛盾才 contradictions=[]，仍由原 checkIncrementalReview 校验。保留1800输出额度和全部风险/候选事实，不用删字段或降 hard 保长度。compact 只去掉原本可从 before+patches/issues 重建的 facts/revisions，提示统一指向实际仍存在的 skeleton.before、draft.patches 与 publishedFacts，不能继续指示读取已删的 context.revisions；来源补件仍逐值与冻结 world 比对。若进一步去重，只允许可证明重建等价的重复数据，不能删除不同事件/秘密风险或只留通过叶。

验收命令：`node --test tests/npc-depth-review-output.test.mjs tests/npc-depth-authored-background.test.mjs tests/npc-depth-review.test.mjs tests/npc-depth-sources.test.mjs tests/npc-depth-pipeline.test.mjs` 与 CORE，模型预算0。用罗巍真实缺 reviewedPaths 的最小响应作 fixture，证明仍失败且原响应/usage保存；完整三字段才通过，漏/重复/额外patch路径、缺事件、错sourceHash、漏风险及hard矛盾均仍拒绝。检查 authored-only、controlled-only、两者同时存在、旧合同四种请求及compact/uncompact，schema没有互斥提示、引用字段确实存在、不可重建来源不被删。许苓原notes补件合法、篡改notes/不属于冻结源的字段拒绝；mock验证19个passed零请求，13失败白名单只用既有一次复审入口，原attempts/失败/预算/预留及T06停止状态不变。不运行任何真实模型来验协议。

T08/T09 风险核查：T08 的 `lq-depth/author-v2/first-review/authored-background.json` 已走同一 authored 分支，因此首次付费前须合入本修复并做请求合同预检；当前未有本次真实失败证据，不写成已失败。T09 当前树未见 authored-background 成品，基础旧分支不会仅因此要求三字段，但后续一旦 opt-in 背景或受控修订即有同风险。两卡的 people 投影普遍未包含 notes/sex/workplace，实际叶引用这些源时先读现成 source-reading-packets/出处投影定位补件，不整批扩投所有私人字段，不用候选自身证明事实；原未变source选择/声明冻结，需要新增证据时显式保存来源与hash。公共修复不改既有entry/context/foundation的内容指纹，不为了换提示让已通过记录全部失效。

不要做：真实模型探格式、伪造reviewedPaths、放宽coverage、把陆青真实hard当协议错、自动批准L4、重领预算/次数、重开T06。依赖：T25/T22现有合同和T10冻结失败证据；独立树 `F:/dnd-wt/T26`、分支`t26`。可与T24或不重叠作者文件并行；不可与修改相同npc-depth-content/review文件的块并行。完成后由主会话在原T10一次规划授权范围、原余额和独占模型槽内执行13条上限的定点复审，逐条预留，仍失败或不足即卡住。

## 下一批完整卡：T27–T44【全部待调度】

调度顺序仍为活动人物卡、T11-B/M2专项、T18–T19的14法术；本批不抢占其模型槽或同文件工作。只有前序卡卡住、等待独占资源或无可执行工作时，主会话才选择下列无依赖块。源码机制可在人物阻断期间推进，模型验收和内容发布另按卡内依赖。新增人口仍禁止，T06仍冻结，T11-C及全体full的release/final门槛不变；原23项预期失败保留。所有世界定义仅写world/，测试在隔离存档，CORE指三个既定核心文件，提交前必跑。新增测试/CLI在卡内明确注明，不能当现成通过记录。

本批细化R01/R02/R03/R07/R08的一部分；这些粗卡仍保存未覆盖范围。M4当前已有共享伤害、防护、状态、物件热过程、首领反制；M3已有编年史/检索/审查/历史窗口；不重新建同类系统。T34–T37只补机制图明确标missing-consumer的四类。治疗病理、空气/地形/仪式等剩余消费者、NPC教学成长、完整政体及远方内容仍在原粗卡，做完本批再细化，不以本批代替全部指南。

### T27 M1真实维修磨损与学习判定前置【待调度】

目标：补已记录的维修失败链与“学会”偶然性，不改变检定。涉及：tests/playtests/craft.json、literacy.json、learning.test.mjs、repair.test.mjs，新增tests/m1-repair-learning-preconditions.test.mjs；仅有确定引擎缺陷才改repair.mjs/learning.mjs并报告边界。实现：复用activities.craft→repair、正式工具耐久和学习结果；用已有制造/采集或实际战斗动作造成损耗，再给可负担材料修理，禁止直接改durability/强刷成功种子；学习断言区分付费/耗时/检定/合法失败，名称由正式resolver解析。

验收：`node --test tests/m1-repair-learning-preconditions.test.mjs tests/repair.test.mjs tests/learning.test.mjs`、CORE；公共路由完整链、成功/失败均对钱物分钟，原失败报告保留；模型0。不要做：降低既有成功验收目标、伪造损坏、修改概率。依赖：T13已合；可并行T29/T30，改repair/learning时与同文件卡串行。

### T28 M1材料施法与历史操作场景补齐【待调度】

目标：补G1材料扣除和M6–M9真实HTTP场景缺口。涉及：tests/playtests/magic.json、reconcile.json，新增tests/playtests/world_upgrade.json、tests/m1-history-preconditions.test.mjs；复用playtest-runner已有API，不重建运行器。实现：正式有材料消耗的已学法术，真实材料购买后施法；reconcile分支使用消息修改、重生成、删除的实际端点；升级在合成旧版本导出副本上走world-upgrade，保持角色/关系/库存/记忆，未授权的原档补粮不进入夹具。

验收：`node --test tests/m1-history-preconditions.test.mjs tests/magic.test.mjs tests/population-publication.test.mjs tests/playtest-runner.test.mjs`、CORE；G1扣料扣魔力、重试不重扣、编辑删除重放一致、升级继续行动及往返一致。新自然会话8–20轮、不提示工具名；模型0，后续真实轮沿原预算。不要做：新法术、原档迁移、部署、以测试造工具成功。依赖：T13；可与T27/T29并行，仅拥有上述场景，不改共用断言文件。

### T29 真实试玩持久费用与续跑身份【待调度】

目标：消除tools/playtests.mjs每次new DeepSeekClient后独立30元、重启另领额度的缺口。涉及：tools/playtests.mjs、新增tools/playtest-budget.mjs、tests/playtest-budget.test.mjs，必要playtest-runner参数传递。实现：复用content-budget原子预留/measurement结算语义及m3 soakClient持久账经验，新增明确--run-dir/--run-id/--card/--increment选项；主持/审稿/改写/盲辨/规划全入同一试玩波次账，原不同波次和内容账绝不混并。已有费用按可核验记录接续，未知请求保留上界，换目录不能新领同run额度；缓存折扣仅在真实usage后结算。保护T17既有预算，不后台启动模型。

验收：`node --test tests/playtest-budget.test.mjs tests/playtest-runner.test.mjs tests/playtest-review.test.mjs`、CORE；mock覆盖强杀预留、并行原子预约、重复response、仅重跑失败一次、恢复不重复工具、缺用量不退款、30元波次及增量任一不足拒发。模型0。不要做：降低覆盖、重写历史成本、改T06账。依赖：T22记账语义已验证；可并行T27/T30/T34，不与真实试玩运行或playtests写者并行。

### T30 M3既存叙述错误的审查闭环【待调度】

目标：让问题文档中可重现的“声称检索却未检索”、还款抹逾期史、场外尾注及未登记专名进入真实改写/拒交路径。涉及：server-plugin/consistency-review.mjs、consistency-service.mjs、必要consistency-evidence.mjs，tests/m3-consistency*.test.mjs中相应文件及新增tests/m3-narrative-regressions.test.mjs。实现：复用deterministicConsistencyReview、reviewConsistency和一次纯文字改写；从保留失败截取最小原文+原回执，已修且测试覆盖者只引用。区分“打算检索”、借用玩家原话、真实旧逾期记录、普通物件与新专名；审查不能调用账本工具或自动创造人口。

验收：`node --test tests/m3-narrative-regressions.test.mjs tests/m3-consistency.test.mjs tests/m3-consistency-integration.test.mjs tests/m3-consistency-evidence.test.mjs`、CORE；严重未修拒交、改写一次、工具钱物不重做、合理描写不误报、场外零尾注零计时。模型0。不要做：把warning统计抹掉、正则吞正文、声明已过真实叙述验收。依赖：T14/T15；可并行T27/T29，不与审查服务消费者改动并行。

### T31 M3记忆/文风真实场景与长历史前置【待调度】

目标：把指南M2–M9、V1–V7缺项变成可复现会话与评分，另给M1第200回合问第10回合保留明确长程项。涉及：新增tests/playtests/m3_memory.json、m3_language.json，tests/history-window-integration.test.mjs、retrieval.test.mjs，新增tests/m3-acceptance.test.mjs；tools/playtest-metrics.mjs仅新增M3汇总，保留M2。实现：复用MemoryIndex、chronicleContext、既有历史窗口与真实HTTP，使用已获授权记忆；四种“账本/帐本/灶台/老板娘”查询命中同一事件且不命中系统用语。合成200回合仅用于离线重放/检索回归，不能计作200次真实模型会话；M1长程实证尚缺时报告未覆盖，不冒充M3全部关闭。

验收：`node --test tests/m3-acceptance.test.mjs tests/history-window-integration.test.mjs tests/retrieval.test.mjs tests/chronicle.test.mjs tests/npc-acceptance.test.mjs`、CORE；固定事实可用，裁历史不丢已索引事件，M6–M9断言100%，V评分≥95%、陈词≤0.5/千字，未测不能通过。模型0。不要做：重建检索、强加向量服务、删未覆盖项。依赖：T28/T30；与同场景/metrics写者串行，可并行M4引擎卡。

### T32 M3短程M/V与M1遗留真实复验【待调度】

目标：取得修后真实提示栈证据，不以离线夹具关闭M3。涉及：仅隔离报告与失败摘要；使用T27/T28/T31的场景。实现：先核对T17专项和本轮全部引用NPC已批准，保留正式完整世界与提示hash；会话各8–20自然轮，HTTP检索、真实审查及一次改写全启用。未完成200回合M1明确留在R02，不删门槛。

验收：`npm run test:playtests -- --only craft,literacy,magic,reconcile,world_upgrade,m3_memory,m3_language --repeat 1 --parallel 4 --run-dir docs/测试报告/m3-mv-wave --run-id m3-mv-wave --card T32 --increment 30`，以T29实际新增CLI及文件id核对；同持久波次上限30、单卡最多30，所有角色费用共计，每条失败最多复测一次且计原额。账本/时间/存档100%、魔法等评分≥90%、V≥95%，原问题逐项真证据；未达保留失败交规划。不要做：部署、额外新轮预算、报告M3全完成。依赖T17专项/T11-B/T29/T31及本轮NPC批准；唯一模型槽，报告目录不与T17最新覆盖写。

### T33 M3两人格150回合浸泡【待调度】

目标：复用现成浸泡器完成行商/建设者各150回合及11.4指标。涉及：docs/测试报告/m3-soak-wave内产物，必要仅错误复现另拆卡，不在运行中顺手改引擎。实现：沿m3-soak-state/adapter/runner的run.json、all-model-calls.json和任务tape；先读旧pilot费用/配置，属于同run的费用必须接续，不能重命名抹账。正式验收用一个持久run，两人格共上限50；先用--max-tasks小样确认审查语义时间，再同目录继续，样本费用包含在50元内。

验收：`node tools/m3-soak.mjs --directory docs/测试报告/m3-soak-wave --init`，后以`--run --turns 150 --budget 50`续跑及`--report`；每25轮五题来自50–200轮前真实事件，不足记失败。结构召回≥95%、细节≥80%、矛盾≤1/100轮、语义时间偏差≤10%，报告费用/p50/p95/cache目标≥70%，所有角色均入账。不要做：空探针算通过、用回放时差替语义、再领50元、原档。依赖T32/T11-C及全部实际参与NPC批准；独占模型。M1 200回合实证和R2部署仍另列，不能据本卡关闭全部M3。

### T34 M4区域效果持续消费者【待调度】

目标：补mechanismMap中区域多目标/跨边界/友军波及缺口。涉及：新增server-plugin/magic-area.mjs、tests/magic-area.test.mjs，magic.mjs/magic-primitives.mjs、engine.mjs时间移动接点，world/design/w2-mechanism-map.json仅生成结果。实现：沿effectSpec和state.effects登记施术来源、地点/范围、expires、触发游标；复用resolveVitalityPrimitive/consumeMagicProtection及既有目标/同意检查。单位进出、移动和时间跳步按同一时间轴结算，不每回合重触发；法术/首领用同消费者，未实现原描述仍missing-consumer。

验收：`node --test tests/magic-area.test.mjs tests/magic-primitives.test.mjs tests/magic.test.mjs tests/bosses.test.mjs`、CORE；多目标、友军、出界/到期、免疫、跨步与小步相同、回滚重试无双伤。模型0。不要做：新正式法术/首领、削弱同意、把区域状态登记当生效。依赖现有M4原语；优先T19，若前序卡住可先机制；与T29/T27并行，与其他magic/engine接点卡串行。

### T35 M4已知锚点与许可位移【待调度】

目标：补anchor_sense/blink/teleport等真实位移消费者，保留路线玩法。涉及：新增server-plugin/magic-movement.mjs、tests/magic-movement.test.mjs，magic-targeting.mjs、magic.mjs、location-access.mjs必要接点。实现：state.records保存发现过的锚点及所属/许可引用，复用location-access、天气路线/同行义务约束；effectSpec校验距离、载荷、代价与前置，移动成功写实际位置并留下事件，禁止只有效果标志。未知锚点、过期/他人许可、空间封锁拒绝且钱物不扣；越障与传送分别受可用地形/锚点约束。

验收：`node --test tests/magic-movement.test.mjs tests/home-permission.test.mjs tests/magic.test.mjs tests/npc-obligations.test.mjs`、CORE；许可撤销、载荷超额、失败原子、重复/导入重放及同行位置一致。模型0。不要做：默认王都瞬移、绕过私宅/司法、新增远方人口。依赖现有目标及权限模块；与T34/T36同magic文件串行，可并行T30。正式法术发布另走T19/R04。

### T36 M4限距传讯与自愿精神连接【待调度】

目标：补传讯/consent_link消费者，禁止把精神状态当同意或记忆改写。涉及：新增server-plugin/magic-message.mjs、tests/magic-message.test.mjs，magic.mjs、npc-cognition.mjs必要接点。实现：沿state.effects与npcCognition消息队列、sourceEvent/knownBy，记录发送者/收者、字数、距离、到达分钟、许可和维持消耗；到达才产生听说记忆，断联/过期停止后续消费。复用magic-status有限状态，拒绝秘密自动填充、人格控制和替人承诺；原mind_message/team_link未支持部分仍明确缺口。

验收：`node --test tests/magic-message.test.mjs tests/npc-cognition.test.mjs tests/npc-memory.test.mjs tests/magic-status.test.mjs`、CORE；越距/超字数/无同意拒绝，到达前未知、合法收者单次获知、私聊无旁人泄漏、重放守恒。模型0。不要做：新工具、自动全知、无限通信、发布新法术。依赖既有认知/状态机制；与T34/T35及认知写者串行，可与T27/T29并行。

### T37 M4受资源约束的作物生长【待调度】

目标：给growth原语接真实农田/植物产量，避免“加速”空记效果。涉及：新增server-plugin/magic-growth.mjs、tests/magic-growth.test.mjs，agriculture.mjs、environment.mjs、magic.mjs必要接点；阶段界限写world/meta/rules.json，沿现有数值审计。实现：effectSpec指已登记田块/植物、有限比例/持续，复用agriculture field/batches和真实水/种粮/营养等已有资源；缺对应资源状态先明确拒绝，不能凭空补出。影响成熟/收成须在农事日结消费，保存来源与已用额度，不能治疗病理或自动操控NPC田地。

验收：`node --test tests/magic-growth.test.mjs tests/magic-object.test.mjs tests/village-ledgers.test.mjs`、CORE；无种/无授权拒绝，有限加速、资源账守恒、跨季及跳步一致、同田不叠无限收益、旧档零补发。模型0。不要做：重写热系统/农业、整年全量长模拟、新法术正文。依赖现有农业/目标；与agriculture/magic/rules写者串行，可与T30并行；正式内容仍独立审核。

### T38 M5周度贸易流和区域价格【待调度】

目标：把四村试行粮约之外的规则周贸易接成有来源的结算。涉及：新增server-plugin/settlement-trade.mjs、tests/settlement-trade.test.mjs，engine.mjs时间接点、world/design/m5-trade-rules.mjs与必要rules配置。实现：复用T02 actual stock/fiscal、天气route通行、quotes每日锁价；只在现有聚落配置明确供需/运力/路线，记录发货/在途/到货/税账。量由实际余粮/资金/仓容约束，按距离和路况耗时，税从真实交易分列，不自动完成玩家carry合同；income为来源可核验转账而非每日印钱。

验收：`node --test tests/settlement-trade.test.mjs tests/village-ledgers.test.mjs tests/economy-supply.test.mjs tests/weather.test.mjs`、CORE；跨周/封路/钱粮不足/到货腐坏、大小步和重启一致、报价同日不漂，旧档不生成新公仓。模型0。不要做：人口增长、虚构供货NPC、原档补粮、重复T23。依赖T02/T23；源码不依赖人物批准，真实S/F依赖批准源；与T37及engine时间写者串行。

### T39 M5租赁雇佣采购与开店账【待调度】

目标：补现有chargeTrade/repayDebt之外的合同类型和可核验经营盈亏。涉及：server-plugin/contracts.mjs、新增server-plugin/business.mjs、tests/business-contracts.test.mjs，activities.mjs、extension/tools.mjs既有工具的operation枚举。实现：统一当事人/标的/数量/到期/托管/履约/违约记录，复用原债务去重和quotes；店铺须合法租赁和现有库存，收益来自实际顾客交易，日收入表是报价锚点而非无条件送钱。NPC雇工只做有空档且明确同意的工作，未付报酬/没到货不能完成。

验收：`node --test tests/business-contracts.test.mjs tests/economy-supply.test.mjs tests/npc-obligations.test.mjs`、CORE；租铺/进货/售出/费用/亏损一条真实工具链，重复还款无二次扣费，违约/停业/破产不负库存，期末现金货物有来源。模型0。不要做：新经济账副本、自动借贷同意、无限NPC消费。依赖T38及现有服务窗口；与contracts/activities/工具路由写者串行，可并行独立M3报告卡。

### T40 M5玩家发单与NPC离屏接单【待调度】

目标：修quest当前仅NPC发布、player接单的明确缺口。涉及：activities.mjs的quest委托薄适配、新增server-plugin/quest-board.mjs、tests/quest-board.test.mjs，npc-autonomy.mjs、extension/tools.mjs必要接点及现有world_quest参数。实现：复用state.quests/questQuota、D–S quotaUnits、托管和deliver/visit/build可验证目标；玩家从已有授权身份额度发布，默认无官职只能合法私人规则。接单者限现有full且有实际能力/作息/路线/材料，离屏任务沿advanceNpcAutonomy，失败/取消/超期有原因及退款规则，进度只给有渠道知情者。

验收：`node --test tests/quest-board.test.mjs tests/npc-autonomy.test.mjs tests/playtest-npc-evidence.test.mjs tests/npc-obligations.test.mjs`、CORE；额度不足/无资金拒绝，NPC到场履约或失败、托管守恒、并发抢单只一人、十日离开后事件可追查、无关NPC不知。模型0。不要做：新冒险者人口、随机宣布完成、放宽T15私密。依赖T42身份授权接口后接正式玩家官职，私人/测试身份可先机制；与T39/T42的activities路由串行。

### T41 M5户籍公民与分聚落贡献【待调度】

目标：增加现有人物世界中的居民/公民申请及可见贡献，避免贡献自动授官。涉及：新增server-plugin/civic.mjs、tests/civic.test.mjs，activities.mjs聚落操作、extension/tools.mjs、state-notices.mjs、extension/ledger-view.mjs，world/design/m5-civic-rules.mjs；界面只接已有账本面板最小条目。实现：沿state.records与settlements记录居住起日、申请/担保/费用/犯罪审核、按聚落贡献流水；复用law案件状态、正式在场管理人和真实工程/教学/捐赠事件，sourceEvent幂等。达到阈值只开放申请，土地/官职仍须授权；旧档未知居住史不能补造。

验收：`node --test tests/civic.test.mjs tests/law.test.mjs tests/runtime.test.mjs`、CORE；条件逐项拒绝、费用只扣一次、不同村贡献不串、失败/私人工事不刷贡献、账本面板可见。模型0。不要做：新居民实体、替名册生成full、原档迁移、凭贡献自动封官。依赖现有T20/law/T02；与activities/UI同文件写者串行，可与T34的独立消费者开发并行但最终接点串行。

### T42 M5议事否决与NPC管事授权【待调度】

目标：补村民大会意见、上级任命与离屏管事，落实S3/S4。涉及：新增server-plugin/governance.mjs、tests/governance.test.mjs，civic.mjs、activities.mjs、extension/tools.mjs、npc-autonomy.mjs接点；规则仅现有四村权限/现有居民。实现：沿authorization记录增加权限范围/期限/撤销/审批主体，议案记录有资格的实际参与者与意见，未参加者不代投；按既有任命来源核验上级，不因玩家自称获得官职。管事在批准税率/地块/费用上限内办理真实申请、扣钱/公账/建房project，越权送议事，玩家不在可日结且留事件。

验收：`node --test tests/governance.test.mjs tests/civic.test.mjs tests/npc-autonomy.test.mjs tests/law.test.mjs`、CORE；大会否决不落工程、撤权后不代办、重复收费拒绝、日结和手动一致、预算不足停工。模型0。不要做：新官员人口、无视否决、未定爵位自动赋权、扩大四村任命。依赖T41/T02；与T40/T39和自治接点串行，可并行无引擎写入测试报告。

### T43 M5多法典程序与区域声望传播【待调度】

目标：在既有crimeAction/lawAction/advanceLaw上补地区/势力分账及有路程的消息后果。涉及：server-plugin/law.mjs、npc-cognition.mjs必要接口、新增server-plugin/reputation.mjs、tests/reputation-law.test.mjs；world/design/m5-law-rules.mjs只配置现有政体与来源。实现：沿legal_case的evidence/witnesses/处罚时间、records及认知传播sourceEvent，记录聚落口碑、势力信誉、名望/恶名各自增量。不同辖区采用已配置法典，不因跨村自动定罪；公示/信使沿真实路线延迟，友好与敌对评价不一。缺政体规则则明确无执行权限，不套默认刑罚。

验收：`node --test tests/reputation-law.test.mjs tests/law.test.mjs tests/npc-cognition.test.mjs`、CORE；同事两地不同口碑、传播前未知、伪证/无证拒判、上诉/已服刑不重复罚，司法钱物守恒与旧案件重放。模型0。不要做：新官员/政体人口、全球即时通缉、把所有听说变事实。依赖既有law/T15，正式制度内容另审；与T36及law/cognition写者串行，可并行T29。

### T44 M5历法节日与确定性世界时钟【待调度】

目标：补W5仅候选节日无运行器、势力阶段无消费的机制，先不冒称24节日/300传闻完成。涉及：新增server-plugin/world-clock.mjs、festival.mjs、tests/world-clock.test.mjs、festival.test.mjs，engine.mjs日周接点、scene-card.mjs最小可见事实；world/design/m5-clock-rules.mjs引用已存在文化/势力/聚落。实现：沿360日年/calendar、weather种子和state.records保存clock阶段/触发条件/游标；节庆须实际日期、组织授权、支出、参与与关系事件，玩家不参与也按资源条件推进。四村日历可先适配；24条候选先L1/L2/L4发布才进入正式节日库。时钟不直接生成新人口/秘密/免费库存，具体消费者只接已实现经济/农事/生态状态，未知效果仍拒绝。

验收：`node --test tests/world-clock.test.mjs tests/festival.test.mjs tests/weather.test.mjs tests/village-ledgers.test.mjs`、CORE；跨日/月/年一次触发、分步与大步同种子一致、组织费守恒、取消/无人参与/资金不足有结果、离开30日后仅通过合法场景/消息显现。模型0。不要做：把常量阶段当完整世界演变、发布未审节日、新觉醒NPC、全村传播秘密。依赖T38/T42消费者；核心纯函数可先做，engine/scene接点串行；正式内容波次仍R08/R09。

本批可并行的文件组：T27、T29、T34各占测试前置/费用运行器/magic区域；或T28、T30、T41在不同时改共用路由时执行。所有触及engine时间轴、activities、magic.mjs、npc-cognition或world/meta/rules.json的接线串行，不能用“模块不同”掩盖共享文件冲突。T32/T33及任何内容真实审核同一时间只一个模型块。T40依赖T42，但T42不依赖T40，避免任务/任职环依赖。

扩波依赖不变：R04法术150与R05首领40含8智能存在，先T18/T19及适用消费者/真实平衡；缺消费者保持待细化，不用研究型标签减少正式目标。R06新人口严格依T11-C全体达标及原第1项、T17验收、T19，当前不可执行；R14再依W1完成。M5/M3机制或局部专项通过不会解禁人口，也不替代全体full构建门槛。需要用户决定的原档、部署和T06停止上限继续跳过，不在本批增开询问。

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
