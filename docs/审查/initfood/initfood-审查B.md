# INITFOOD 旧初粮修订批 审查 B（花费与数据安全角度）

对象：F:/dnd-wt/INITFOOD，分支 t-initfood，HEAD f8bec8b6，diff 921bf299..f8bec8b6（16 个文件）。只读；未读审查 A；未运行任何脚本；未读 key。核心文件：world/design/initfood-approval.mjs、world/design/p1-revision-approval.mjs（runRevision）、tools/content-pipeline.mjs、tools/content-budget.mjs、tools/deepseek-client.mjs。

总结论：changes。1 个需改（发布后测试自己变红）+ 若干提示；花费与安全两项通过。

## 1. --review 的模型调用次数与硬上限：通过

- 前置：world/drafts/initfood 目前不存在。必须先 `--prepare`（不调模型，modelCalls:0；只读 DeepSeekClient().rates，不联网、不读 key），它冻结候选并写 budget.json：`cards.INITFOOD = {limitYuan:0.3, maxRequests:40}`（p1-revision-approval.mjs:165-166，来自 initfood-approval.mjs 的 LIMIT_YUAN=0.3、MAX_REQUESTS=40，tests/initfood-revision.test.mjs 有断言）。`--review` 与 `--prepare` 必须是两次独立运行（frozen 在模块导入时读取）。
- 条目数：buildEntries 对每个带登记 publicStock.food 的村出一条，实际 4 条（yupo、weiting、liquan、sangban；loc_hw 没有登记，不在内）。
- 每条的请求数：候选冻结（reuseFrozenDrafts:true），起草请求被跳过（buildDraftRequest 若被调用会直接抛错），每次尝试只发 1 个复核请求。重试：content-pipeline.mjs:272 循环上限 Math.max(3, …) = 3 次尝试；其中传输类错误（费用上限、环境变量、fetch failed、timeout、HTTP 429/5xx，第 344 行）直接返回，不重试；复核结论不通过且为冻结候选时 `if(frozen)break`（第 340 行），只发 1 次；只有解析类错误才会进入下一轮尝试。所以每条最多 3 次，全批理论上限 4 × 3 = 12 次，典型 4 次。远低于 40。
- 单次费用上界：复核请求带 max_tokens 400、非流式、thinking 关闭；估价 = UTF-8 字节 × 2 元/百万 + 400 × 8 元/百万；输入约几 KB（中文 3 字节/字）→ 约 0.01 元量级/次，12 次约 0.12 元，低于 0.3；`--prepare` 写出的 cost-estimate.json 的 firstPassCeilingYuan 即首轮上界，建议跑 `--review` 前先读这个数核对（我未运行，不给精确值）。按每次 0.01 元算，0.3 元会先于 40 次触顶，两个上限同时有效。
- 停止逻辑在本批生效：content-budget.mjs:161 按卡的 maxRequests 计数（统计 ledger 中该卡全部非 cancelled-unissued 的请求，含失败后状态为 unknown 的），超限 `stop('单卡调用次数上限')`；:162-165 同时校验波次额度与单卡 limitYuan（0.3，预留 + 已花 + 本次上界），超限即停；ledger 持久在 budget.json，重跑累计，再次进入已 stop 的记录会 `budget.stop`，不得续跑。runRevision 的断言（第 174 行）要求 card.limitYuan ≤ 0.3 且 card.maxRequests ≤ 40，否则 --review 直接拒绝；client 的 budgetYuan 也被设为 card.limitYuan。
- 观察：budget.json 是本地文件账；`--prepare` 只在文件不存在时写入，且已冻结时拒绝重 prepare（`assert.ok(!frozen,'候选已冻结')`），所以不能靠重 prepare 清零。若有人手动删除 world/drafts/initfood 整个目录再 prepare 会得到新账，这不属脚本缺陷，但审查者应在跑前核对目录不存在、跑后核对 usage.jsonl 的行数 ≤ 12。
- 判定：通过。

## 2. --publish 改动范围：通过

- 只写两类文件：正式文件 world/geo/settlements.json（本批唯一的 entries.file）与 world/drafts/initfood/publication.json（记录）。`--publish` 先 `readApprovedContent` 核对每条审批与候选逐字相同，再对每个文件算 editJSONText；写入前所有目标先校验。
- 文本删除只动目标键：editJSONText（p1-revision-approval.mjs:68-80）先断言当前值等于 before（"发布前事实已改变"则拒），再用 scan 定位 `[{id:target}, details, economy, publicStock, food]` 的键值区间，removalSpan 只删该键及其后随逗号与空白（若是末键则删前面的逗号）；删后断言 `JSON.parse(out)` 与对结构做同样 delete 后的期望深度相等（第 79 行）。我核对了 settlements.json：4 处 `"food": N,` 都在 publicStock 里 openingDay 与 seed 之间，后随逗号，属于第一种路径。键只定位到被点名的村，其它村、其它字段不会被动。
- 清单之外的已批准内容：不触碰。village-ledgers 的分件与 candidate.json 回执是已批准审批记录，本批不改（initfood-approval.mjs 头注释、回执不改写以保指纹）；取代关系走 supersedes 声明（每条 2 个回执，共 8 个），读者在读取时 revert，指纹比对不受影响。supersedes 的后缀规则（approved-revisions.mjs:37）放宽为"回执字段是修订字段的整段后缀"，我核对了测试：非整段后缀（`conomy.publicStock.food`、`publicStock.seed`）被拒。
- 该改动影响所有修订批共用的 parsePublication：对既有批次，原来要求 s.field===e.field 的声明仍通过（相同即满足），语义是放宽不是改变，既有已批回执不会失败。
- 判定：通过。

## 3. 发布前后哪些测试/校验变红，合入顺序：需改

**发布前红（正常，"发布后才成立"）**：
- `world/design/initfood-approval.mjs --verify`（已登记进 tools/readonly-entries.mjs，所以日常检查与 readonly-entries-run 的只读入口会实跑它）：发布前 `isPublished` 为假、readApprovedContent 读不到 review 回执，红；
- tests/village-ledgers.test.mjs:36 起 `assert.equal(detail.economy.publicStock.food, undefined)`：发布前登记值仍在，红；
- tests/catalog.test.mjs:86 起 publicStock.food 期望为推导值：发布前读登记值 18000（settlement-profile.mjs 只在 stock.food === undefined 时才推导），红。
这些在发布后才成立，符合预期。

**需改（发布后反而红）**：tests/initfood-revision.test.mjs 顶部 `const entries = await initfood.buildEntries(world)`，而 buildEntries 首行 `assert.ok(rows.length>0,'没有带登记公仓初粮的聚落')`；发布后世界里没有 food 键，rows 为空，整个测试文件在加载时抛错。另外"条目：每个带登记公仓初粮的村一条"（对 holders() 与 e.before）与"文本删除"（对原文件）都只对发布前的世界成立。即这个测试发布前绿、发布后红。改法：测试改读冻结候选（initfood.frozenEntries()，发布后 candidate.json 仍在）；`before`、`target` 与 holders 的对照分支为"未发布（rows 存在）/已发布（food 已不存在，改验 publication.json 与 isPublished）"。文本删除用例改读 git 里发布前的 settlements.json 内容（或用夹具文本），不要依赖当前正式文件仍有 food。

**既有遗留红（不属本批，但会让 master 红）**：tests/village-ledgers.test.mjs:43 仍 `assert.equal(record(...).ledger.openingFood, p.initialFood)`，initialFood 已从 rules.json 删（计数为 0），p.initialFood 是 undefined，必红；:104 同样改一个已不存在的字段，注释自己写"待重推，未改值"。这是 MKTW ①b 留下的，本批没处理；合入前要么本批顺手改（按已有 :36-:40 的手推公式），要么在合入说明里明写由哪一批改。需改。

**合入顺序建议**：
1. t-water1d 已是 HEAD 祖先（921bf299 即合并提交），无需单独合。t-mktw 不是 HEAD 的祖先；本批改动面（settlement-profile、primitives-body 拆出 settlement-mouths、settlements.json、readonly 登记）与 t-mktw 的市场改动不同文件，但 settlement-mouths/primitives-body 的拆分若 t-mktw 也改了 primitives-body 会冲突，合入时先让 t-mktw 变基到最新 master，再合 t-initfood（或相反），以后合者变基。
2. t-initfood 必须以"含发布的单一合入单元"进 master：先在分支上 --prepare → --review（审后）→ L4 主会话读 → --publish → --verify，再改 initfood-revision 测试与 village-ledgers :43/:104，然后一次合入。不要先合"未发布"的 HEAD：那样 master 上 --verify、village-ledgers、catalog 三处同时红。
3. 发布提交里应带上 world/drafts/initfood/ 整个目录（candidate.json、review、budget.json、usage.jsonl、publication.json），否则 readApprovedSupersedes 读不到 publication，w1-village-profiles-content 的 approvedProfiles（revertReceiptRow）与 --verify 都会失败。

## 4. 世界真实性（开局存量）：通过

目标持有 = min(ceil(餐口 × (距收获 + reserveDays)), 容量 − 种粮)。距收获（开局日 0）= sowDays[1] + growthDays = 25 + 180 = 205（farmTargetDays：(harvest − dayOfYear) 取模 360 再加 reserveDays；rules.json reserveDays 均为 90，granaryCapacity 50000，initialSeed 2160/1920/2520/2880，核对一致）。推导值：yupo 80 → 23600（容量 − 种粮 = 47840）；weiting 100 → 29500（48080）；liquan 96 → 28320（47480）；sangban 110 → 32450（47120）。均未触顶、均不为 0：无空仓、无溢仓。若餐口按物种代谢折算大于人口（例如非人类居民），上限分别约允许 1.4–1.6 倍的餐口，仍有余量；这点由 f8bec8b6 把物种表并入 settlement-profile 保证一致。
对比旧登记值 18000/22000/22000/25000，天数约 225、220、229、227 天，新值 295 天，比旧值多约 30%，但仍低于容量的 66%（32450/50000），收获后过冬与 90 天保底的逻辑是自洽的。年内守恒与溢出由未改动的 village-ledgers 守恒测试继续检验。
提示（非缺陷）：settlement-profile 的 withOpeningFood 需要 document 才推导，无存档视图下"公共仓期初粮食"一项缺项（不是错误值）；清单第 4 行"人口 = 餐口"的前提在 village 同物种构成下成立。

## 5. 安全：通过

- 读 key 只在 tools/deepseek-client.mjs 一处：`process.env.DEEPSEEK_API_KEY` 读到局部变量，只放进 Authorization 头；HTTP 错误消息里会 `replaceAll(key,'[凭据已屏蔽]')` 与 Bearer 屏蔽后才抛。本批新增/改动文件（initfood-approval.mjs、p1-revision-approval.mjs、approved-revisions.mjs 等）无 process.env、无 console 输出环境变量；runRevision 只打印条目数、通过数、费用数。
- 联网：全仓此链路唯一的 fetch 是 deepseek-client.mjs 的 `https://api.deepseek.com/chat/completions`；content-pipeline、content-budget、runRevision 里没有其它 fetch/网络调用。`--prepare`、`--publish`、`--verify` 不联网。
- 落盘内容：content-budget 把请求与响应写进 root/budget-responses/<id>.json（含请求体与模型响应、无 header、无 key）；usage.jsonl 只有用量。写入范围限于 world/drafts/initfood/ 与 --publish 的 settlements.json 与 publication.json。
- 判定：通过。

## 逐条判定

| 项 | 判定 |
|---|---|
| 1 模型调用次数、0.3 元/40 次上限、停止逻辑 | 通过（上限 12 次；两个上限同时有效；跑前读 cost-estimate.json） |
| 2 --publish 改动范围、文本删除只动目标键 | 通过 |
| 3 发布前后测试与合入顺序 | 需改：initfood-revision.test 发布后自红；village-ledgers.test :43、:104 的 MKTW 遗留红；合入须带发布提交与回执目录 |
| 4 开局存量真实性 | 通过 |
| 5 安全（key、环境变量、联网） | 通过 |

汇报要点：changes；唯一实质需改为 initfood-revision.test.mjs（发布后因 buildEntries 的 assert 与读正式文件而变红）及 village-ledgers.test.mjs:43/104 的 initialFood 遗留。

---

# 复审（HEAD 10968d75，增量 f8bec8b6..10968d75；只读，未运行任何东西）

## A. 上次三项
| 项 | 判定 | 依据 |
|---|---|---|
| 1. initfood-revision.test 发布前后都成立 | 通过 | 条目改为 `initfood.frozenEntries() ?? buildEntries(world)`；`published=isPublished(world,entries)`，条目用例分两支：未发布则正式文件值等于 before，已发布则为 undefined；文本删除用例改用夹具文本（紧凑与缩进两种排版），不读正式文件；新增"真实回执"用例读取 8 个回执文件，核对回执侧路径真实存在且值等于 before，并在真实行上 applySupersedes 能删掉。新增 applySupersedes 的父对象检查（approved-revisions.mjs:110），路径中间段写错会抛错而不是静默当成已删。 |
| 2. village-ledgers :43、:104 的 initialFood 残留 | 通过 | :43 现用 ruleOpeningFood（手推公式，人口取审定档案）；负例改为改动仍存在的 initialSeed；village-trade-live.test 的同类断言也改为手推。grep 全部 tests/*.mjs，initialFood 只剩 3 处注释。 |
| 3. 合入说明写明需与发布提交一起进入 | 通过（可再加强） | tests/catalog.test.mjs 与 tests/village-ledgers.test.mjs 文件头各加了"注意（合入顺序）：发布前会红是预期，与发布提交（world/drafts/initfood/ 整个目录、settlements.json 的删除）一起进入 master，不改断言"；readonly-entries 里 initfood --verify 的注释说明审批未齐以退出码 2 结束，发布后通过。提交信息本身没写合入顺序；建议合入时在 PLAN 或合入说明里再写一遍（非必须）。 |

附带核对：`--verify` 现在通过 reportApprovalIncomplete 把"缺冻结候选/审批回执"（ENOENT）转为 APPROVAL_INCOMPLETE、退出码 2、明确原因，而不是崩溃；approvalIncomplete 与 reportApprovalIncomplete 均已在 tools/content-pipeline.mjs:433-441 存在，只对 verifyOnly（不含 --prepare/--review/--publish）的 ENOENT 生效，其它错误原样抛出，不会吞掉 --review/--publish 的真实错误。

## B. 三项旧结论是否仍成立
1. **花费上限：仍成立。**本增量没有改 content-pipeline.mjs、content-budget.mjs、deepseek-client.mjs、p1-revision-approval.mjs（diff 统计无这些文件）；--review 仍是 4 条目 × 每条最多 3 次尝试 = 上限 12 次，0.3 元/40 次的卡账与停止逻辑未动。initfood-approval.mjs 的改动只是 --verify 包装，没有新增请求。
2. **改动范围：仍成立。**--publish 仍只写 settlements.json 的 4 个 food 键与 world/drafts/initfood/publication.json；新增的只是测试与 applySupersedes 的读取期检查（只抛错，不写）。
3. **安全：仍成立。**增量里没有新增 process.env、网络调用或文件写入；测试新增的是读 8 个已批回执文件（只读）。

## C. openingStockFood 是否引入额外模型调用或文件写入：否
- `openingStockFood(engine,profile,day)` 是纯函数：读 engine.world.settlementProfiles 的登记人口，用 mealMouthsOf(engine,{},…)（空状态）与 farmTargetDays 算 min(ceil(餐口×(距收获+reserveDays)), profile.granaryCapacity − profile.initialSeed)；不读存档、不写任何文件、不调模型、不联网。settlement-profile.mjs 的 withOpeningFood 只把结果写进返回给调用方的 pick 副本（publicStock 是 pick 出的新对象），不改世界数据。
- farmTargetFood 增加了对缺失 state/记录的空值保护，只是不抛 TypeError，行为对正常存档不变。
- 真实性：公开资料现在无存档视图也有"期初库存"，数值只由登记人口、基础容量、种粮、reserveDays 决定，游戏中不随人口变动；四村为 23600/29500/28320/32450，与上次核对的开局存量一致（settlement-mouths.test 手推了 80 人 → 23600、200 人封顶 47840、缺登记行 0）。

## D. 小提示（不阻断）
1. readonly-entries 把 initfood --verify 移到清单末尾；发布前该入口以退出码 2 结束，若 readonly-entries-run 的逐字节比对把非 0 退出视为失败，则发布前（合入前）仍会红，这与"必须随发布提交一起进入"的说明一致，合入前须以发布后的状态跑一次该组测试。
2. 合入说明建议在 PLAN 再写一遍（见 A.3）。

## E. 复审结论：approve
上次三项均已落实；花费上限、改动范围、安全三项结论不变；openingStockFood 无额外模型调用与文件写入。

---

# 二次复审（10968d75..c6f3d858，两个提交 155fee0f、c6f3d858；只读，未运行任何东西）

增量只有两个文件：schemas/world.schema.json（settlementProfile 的完整经济形态里 publicStock 删去 `food` 属性定义与 required 项，5 行删除）、新增 tests/settlement-schema.test.mjs（23 行）。

## 1. 对花费、改动范围、安全的影响：无
- 没有触及 content-pipeline、content-budget、deepseek-client、p1-revision-approval、initfood-approval，`--review` 仍是 4 条目、每条最多 3 次尝试、上限 12 次，0.3 元/40 次不变；schema 修改本身不调模型，这次 `--prepare` 的 0 次调用也正是它被 L1 拦下的结果。
- --publish 的写入范围不变（settlements.json 的 4 个 food 键 + publication.json）。schema 文件本身是本增量的改动，属于代码，不是运行时写入。
- 新测试只读 schemas 与 world，用 Ajv 本地校验，无网络、无 key、无写文件。结论：三项仍成立。

## 2. 删 schema 字段是否在发布前后让别处出错
schema 的 publicStock 有 `additionalProperties:false`，所以现在带 `food` 即违规。
- **发布后：一切一致。**4 个 food 键被删，validateWorld 的 schema 步骤（tools/validate-world.mjs:38-49，直接用 world.schema.json）无该字段错误；生成器 world/design/w1-village-profiles.mjs 已不再产出 food（上一增量），其 validateVillageLedger 检查（第 184 行）只核对 seed、treasury、closing，不涉 food；tools/publish-w1-villages.mjs 与 create-schemas.mjs 都没有 publicStock/food，不受影响（schema 文件是手维护的，不会被生成器覆盖）；settlement-profile.mjs 的 withOpeningFood 在 food 缺失时推导，与 schema 一致。世界里仍含 publicStock 的 JSON 只有历史测试报告 frozen-inputs（文档，不校验）、legacy-r2-primitives.json（a3-legacy-replay.test 的回放夹具，该测试不做 world schema 校验）、baishi-skeleton 候选（publicStock 为 null）。
- **发布前：新增一批预期内的红。**发布前正式 settlements.json 仍带 food，validateWorld 会报 4 条 schema 错误（additionalProperties food），所以全仓约 55 处 `validateWorld(world…)` 断言 ok 的测试（例如 village-ledgers、economy-supply、law、environment 等）在发布前都会红。这比上一稿"3 处发布前红"宽得多，属于同一类"发布后才成立"，但合入顺序的要求因此更严格（见 3）。
- `--prepare` 本身不受影响：它比较的是 baseline 与 candidate 的错误差集（added 为空即通过，removed 为 4 条 food 错误），不要求 baseline 为 0 错误。已有的修订批流水线（p1、water1d 等）不依赖这个字段，不受影响。
- 新测试逻辑：base() 先从行里删 food 再校验 → 合法（发布前后都成立）；加回 food → 被拒；删 seed → 被拒。`validate.errors.some(...) || validate.errors.length > 0` 后半恒真，是冗余断言（前半是否命中不会失败），不影响正确性，建议去掉后半，小项。

## 3. master 合入顺序是否仍可行：可行，条件更严
- 仍须以"含发布的单一合入单元"进 master：schema 删字段、settlements.json 删 4 个 food 键、world/drafts/initfood/ 整个目录（含 publication.json）、测试期望同批进入。先合 schema 而不合数据（或反过来）都会让 master 上约 55 处测试同时红。
- 具体顺序：t-initfood 上先 --prepare → --review → L4 → --publish → --verify，确认 `validateWorld(world)` 的 schema 步骤零错误，再以该分支一次合并；合并后跑一次全量。t-mktw 如在 t-initfood 之前合入 master，它不涉及 schema 与 settlements.json，无冲突风险，但合 t-initfood 之前要先变基并重跑 validateWorld 相关测试。t-water1d 已是祖先，无需额外安排。
- 另一个回退考虑：若 --publish 之前就把含 schema 改动的分支合入，回退办法是同一批还原 schema 的两处（food 属性与 required），因为 schema 与数据必须同进同退；建议合入说明写明这一点。

## 4. 结论：approve
花费上限、改动范围、安全结论不变；schema 变更与发布后的世界一致；合入顺序仍可行，但必须"schema + 数据 + 回执目录 + 测试"同一合入单元。小项：去掉新测试里恒真的 `|| validate.errors.length > 0`。

---

# 三次复审（6b078b88..6d4b21de，两个提交 550152db、6d4b21de；只读，未运行任何东西）

净改动文件只有 3 个：tests/initfood-revision.test.mjs、world/design/initfood-approval.mjs、world/design/p1-revision-approval.mjs（`git diff 6b078b88 6d4b21de --name-only`）。

## 1. 花费上限与停止逻辑：不受影响
- 本增量没有改 content-pipeline、content-budget、deepseek-client，也没有改 runRevision；p1-revision-approval.mjs 只新增了导出函数 preflightEntries，不在 --prepare/--review 的路径里调用（全仓只有测试调用它）。
- preflightEntries 不调模型：它只跑 pipelineL1（本地校验）与 reviewRequest（只构造请求体并 JSON.stringify，检查 max_tokens 为正整数）。
- 条目编号改为 initfood-<聚落id>（如 initfood-loc_bs_yupo），仍是 4 条；只影响审查记录文件名与账本键，不影响计数。旧编号含点号，会被流水线的安全格式拒绝，这次改动正是为了让 --review 不在中途因格式停下（那样已花的预留会白耗），属于降低浪费。
- 被撤掉的冻结物里 budget.json 为：spentYuan 0、reservedYuan 0、cards.INITFOOD {limitYuan 0.3, maxRequests 40}、requests {}；cost-estimate.json 的 modelCalls 0、firstPassCeilingYuan 0.055312（4 次首轮上界合计）。据此单次上界约 0.014 元，最坏 12 次约 0.17 元，仍低于 0.3；0.3 元先于 40 次触顶，两个上限都有效。
- 一处小提示：preflight 的编号正则带 `/i`，而流水线的安全格式（`^[a-z][a-z0-9_-]+$`）不带，预检比流水线宽松一点；本批编号全是小写，无影响；建议去掉 `/i` 以求与流水线一致（小项）。

## 2. 重跑前删 world/drafts/initfood/ 再 --prepare：安全，附一个条件
- 该目录只属于本批：root 常量 'world/drafts/initfood' 只在 initfood-approval.mjs 定义；全仓其它引用只是注释与测试里的说明文字；其它批次各有自己的 root（world/drafts/<批次名>），不是它的前缀或子目录，删除不会波及别的批次。当前该目录在工作区不存在，也不在 git 跟踪里（git ls-files 为 0 项），所以"先删再 prepare"实际是"直接 prepare"。
- --prepare 要求 `!frozen`（候选未冻结），所以没有残留 candidate.json 才能重新冻结；它只在 budget.json 不存在时才建账，因此删除目录会让账归零。
- 条件（必须写进操作说明）：只能在"尚未 --review"（budget.json 的 requests 为 {}、spentYuan 为 0）时删除重建；一旦发出过任何模型请求，不得删除该目录重来，否则 0.3 元/40 次的累计账被清零，等于绕过上限。当前这次是 0 次调用、账为空，符合条件。建议在操作说明里加一句"删除前先 cat budget.json 确认 requests 为空"。
- 删除用精确路径（不要用通配符），避免误删 world/drafts 下其它目录。

## 3. 撤掉冻结物的提交：干净
- 550152db 把 4 个文件（budget.json、candidate.json、cost-estimate.json、l1.json）带进了仓库；6d4b21de 恰好删除这 4 个文件（425 行删除，无其它改动）。两提交合计：这 4 个文件净为零（`git diff 6b078b88 6d4b21de --name-only` 只剩 3 个代码/测试文件）。
- 副作用：冻结物已不在，`frozen` 在导入时读不到 candidate.json 就是 undefined，run 退回 buildEntries（新编号），测试里的 `frozenEntries() ?? buildEntries(world)` 同样走新编号，一致。历史里仍留下这 4 个文件（旧编号版本），内容无害（账为空、0 次调用、无 key）；若要从历史里彻底去掉需要重写历史，不建议，也不必要。
- 提醒：合入前核对工作区没有残留的 world/drafts/initfood（git status 干净、该目录不存在），避免旧编号的 candidate.json 被当成"已冻结"而让 --prepare 拒绝（"候选已冻结"）。

## 4. 结论：approve
花费上限与停止逻辑不变，重跑前删目录安全但仅限账为空时，撤销提交干净。小项：preflight 的编号正则去掉 `/i`；操作说明加"删前确认 requests 为空"。
