# INITFOOD 旧初粮修订批 审查 A（第 1 位独立审查）

对象：F:/dnd-wt/INITFOOD，分支 t-initfood，HEAD f8bec8b6（核对一致）。范围：`git diff 921bf299..f8bec8b6`（本批 3 个提交 92a123db、9bb1ad55、f8bec8b6）；合并 921bf299 用 `git show --cc` 看，没有冲突解决的改动（干净合并）。只读：只用 git diff/show、grep、sed、sort/comm（用于核对"代码搬移无变化"），未运行 node/python/测试、未调模型、未读 key。

结论：changes。没有阻断；5 项需改（其中 2 项会让测试在发布前变红，必须在汇报里明说或先处理）。核心设计（删除型修订、读者改读运行时规律、导入环打断）成立。

## 1. world/design/initfood-approval.mjs

| 子项 | 结论 | 依据 |
|---|---|---|
| 条目恰为 4 条 | 通过 | buildEntries 取 `world.settlementProfiles` 中 `details.economy.publicStock.food` 为数字的行。我 grep world/geo/settlements.json：`"publicStock"` 共 5 处，其中 4 处带 food（行 571=18000、1529=22000、2462=22000、3441=25000），第 5 处（行 5435，白石镇）是 null。所以恰为榆坡、围亭、泉口、桑坂四村。 |
| after 全为 REMOVE | 通过 | 条目 `after:REMOVE`；p1-revision-approval 的 setPath/isPublished/sameValue 已支持 REMOVE（WATER-1D 带来），applyCandidate、isPublished 对 REMOVE 走"键不存在"分支。 |
| supersedes 接到正确回执 | 通过（需补测试，见 N-1） | 每条 `supersedes` 两项：`world/drafts/w1/village-ledgers/<村>.json#<村>` 与 `…/candidate.json#<村>`，field 为 `economy.publicStock.food`。对照待修订批清单：分件回执 loc_bs_{yupo,weiting,liquan,sangban}.json 行 115 的 `economy.publicStock.food`，candidate.json 行 113/743/1373/2003，值与 before 一致（18000/22000/22000/25000）。12 行 = 4 个正式值 + 4 分件 + 4 candidate，对得上。 |
| limitYuan 0.3 / maxRequests 40 生效 | 通过 | 链路：`run → runRevision(cfg:limitYuan=0.3,maxRequests=40)`；`--prepare` 写 budget.json（waveLimitYuan=0.3，cards.INITFOOD.limitYuan=0.3，maxRequests=cfg.maxRequests）；`--review` 先断言 `card.limitYuan<=cfg.limitYuan && card.maxRequests<=cfg.maxRequests`，客户端预算取 card.limitYuan，allocation 带 card.maxRequests。 |
| 到额真的会停 | 通过 | content-budget.mjs:161 `已有请求数 + 本轮 > card.maxRequests → throw stop('单卡调用次数上限，已停止')`；:162 `ledger.spent+reserved+ceiling > limit` 或 card 级同判 → `stop('共享或单卡费用上限')`；:140 stop 把错误固定为 stopped，后续 guard 一律抛出；content-pipeline.mjs:227、:362 把已记录的 budgetStop 带到下次运行，所以到额后续跑也继续停。budget.json 若已存在则不被覆盖，但 --review 的断言会拒绝超出本批上限的账。以上与 WATER-1D（0.5/60）同一机制，本批没改 content-budget/content-pipeline/deepseek-client（diff 为空）。 |
| 其它 | 需改（N-2） | READONLY_ENTRIES 登记了 `initfood-approval.mjs --verify`，发布前 `--verify` 会 ENOENT（缺 world/drafts/initfood/review），全量只读检查把 ENOENT 记为崩溃（tests/fixtures/readonly-runner.mjs:36-60）。 |

N-1（需改，p1 测试没有触到真实回执）tests/initfood-revision.test.mjs 只用合成行验证路径寻址（`draft=[{economy:{publicStock:{food:s.before}}}]`），没有读真实的 8 个回执文件。REMOVE 型取代有一个静默空操作的洞：applySupersedes（approved-revisions.mjs:102-111）对 REMOVE 的判断是 `sameValue(cur,s.after)`，而 `cur===undefined` 就等于"已经删了"，所以回执侧路径写错（如末段拼错）时不报错、也不删，回执里的旧值照旧存在。改法：加一条测试，读 loc_bs_*.json 与 candidate.json 的真实行，断言每个 supersedes 的 `getPath(行, s.parts)` 当前等于 `s.before`（发布前成立），并在 applySupersedes 对 REMOVE 且 `cur===undefined` 时要求父对象存在（路径中间段拼错会抛错）。

N-2（需改，登记时机）`--verify` 入口在批次发布前必然失败且是"缺文件"型崩溃，全量只读检查（夜间层）会红。改法：要么把该登记放进发布提交，要么让 `--verify` 在 review 目录缺失时打印原因并 exit 1（非 ENOENT 栈）。若按前者，同步确认 tests/readonly-entries.test.mjs 日常层（"每个 ro 开关须有入口登记"）不受影响（--verify 本就是已归类 ro 开关，其他脚本已登记）。

## 2. 读者改造

| 子项 | 结论 | 依据 |
|---|---|---|
| settlement-profile 缺 food 时用 openingFood 推导 | 通过（带 N-3） | settlement-profile.mjs:withOpeningFood：`stock.food===undefined && document && farmProfile && stock.openingDay!==undefined` 才推导，登记了 food 就照登记（旧数据兼容）；farmProfile 取自 `rules.agriculture.settlements`；调用 `openingFood(engine,document.state,farmProfile,stock.openingDay)`，即 `farmTargetFood(..., day*1440)`，与运行时 initializeAgriculture 同一函数（agriculture-migration.mjs 未改逻辑，只换了导入来源）。 |
| 共享 world-entities.mjs、物种表完整 | 通过 | world-entities.mjs 的列表与原 engine.mjs:259 逐项一致（npcs、residents、locations、items、professions、skills、spells、recipes、monsters、bosses、cultures、deities、factions、history、factionPeople、eras、regions、festivals，顺序也一致）；engine 现用同一函数；reader 另加 `document.state.created`。物种代谢读 `engine.byId.get(speciesId).nature.metabolism`，而物种在 monsters 里（world/meta/monsters.json 含 `"metabolism"`），已被包含。tests/settlement-mouths.test.mjs 断言 worldEntityRows 的 id 集等于 WorldEngine.byId 键集，并用"残缺 byId 得到错误餐口 10"的反例证明意义。 |
| catalog.test 新期望按规律手推 | 通过（带 N-4） | 期望 = `min(ceil(人口 × (sowDays[1]+growthDays+reserveDays)), 容量 − 种粮)`，与待修订批清单手推值一致（榆坡 80 × 295 = 23600 等，容量 50000 − 种粮未受限）。注意它是用 rules 里的参数把公式重写了一遍，不是字面数。 |
| village-ledgers.test 新期望 | 通过（带 N-4、N-5） | 期望 `登记里 food 为 undefined`，`doc.state.settlements[p].food == min(ceil(人口×(sowDays[1]+growthDays+reserveDays)), 容量−种粮)`，注释给了榆坡 80 × 295 = 23600 的手算。settlement-mouths.test 的手推数字我逐个核对：全慢物种 10 人 × 0.5 = 5；混合 (6×0.5+4×1)/10 = 0.7 → 7；征 4 人 5×6/10 = 3；farmTargetDays 0 日 = 205+90 = 295、第 205 日 = 90、第 206 日 = 359+90，全部正确。 |

N-3（需改，语义）withOpeningFood 用的是当前活状态：`s.population`（state.settlements 当前人口）、`rec?.field?.seedBank`、当前建成的公共粮仓容量，而显示的是"公共仓期初库存"（openingDay=0）。游戏进行到第 300 日后，"期初"数字会随人口、种粮、新建粮仓变动，不再是开局那一天的值。另外 farmTargetFood 对 `state.settlements[id]` 为空会 `s.population` 报 TypeError（农事聚落有 rules 但存档里还没有该聚落记录时，例如迁移前的存档读公开资料）。改法二选一：①按世界登记人口（world.settlementProfiles 的 population）与 profile.initialSeed、基础容量推导，不读活状态；②保留活状态，但文本改称"按当前人口推导的目标持有"，并在 farmProfile 之外加 `document.state.settlements?.[id]` 守卫。

N-4（建议）catalog.test、village-ledgers.test 的期望是 rules 参数代入的同一条公式，与实现同构（改公式两边会一起变）。清单里已手推出 4 个字面值（榆坡 23600、围亭 29500、泉口 28320、桑坂 32450，依赖村人口 80/100/96/110），建议在其中一个测试里同时断言这 4 个字面值，作为独立于公式的检验（它们是由人口和 295 天手算的，不是写死的拟合）。不阻断。

N-5（需改，发布前变红 + 残留）
- 这批提交的测试与读者是"发布后"的状态，但正式文件 world/geo/settlements.json 仍是旧值（本批尚未 `--publish`）。所以发布前：catalog.test（正式文件有 food=18000，withOpeningFood 不推导，期望 23600 → 红）、village-ledgers.test（approvedProfiles 的 readApprovedSupersedes 尚无本批 publication.json，生成器不再产出 food、回执里有 food，指纹对不上 → 抛"四村档案尚未全部通过审核"）、tools/publish-w1-villages.mjs 均会失败。这是预期的过渡状态，但要在汇报与交付说明里写明"发布前这三处红"，且合入 master 前必须先发布（或把读者做成两态兼容）。
- 同一个测试里仍有两处被市场卡标"待重推"的断言未处理：tests/village-ledgers.test.mjs:43 `ledger.openingFood === p.initialFood`（initialFood 已不存在，等于 undefined）与 :104 `p.initialFood++` 的负例；tests/village-trade-live.test.mjs:111 同类。第一处就在刚改的循环旁，按同一条规律改成"== 目标持有"只需一行；若留给后续批，请在汇报里明说，否则这个测试文件无论发布与否都不会绿。

## 3. 生成器 world/design/w1-village-profiles.mjs 与 tools/w1-village-profiles-content.mjs

| 子项 | 结论 | 依据 |
|---|---|---|
| 不再产出 food | 通过 | ledgerSeeds 去掉 food；villageEconomy 的 publicStock 只剩 openingDay、seed、treasuryCopper、wood、iron、source、closing、closingReason；删掉对 primitives-body 的 farmTargetDays 导入（同时去掉该文件的导入环来源）。 |
| revertReceiptRow 衔接 | 通过 | approvedProfiles：对 villageProfileCandidates 的每一行，仅当存在"已核验审批的"supersedes（readApprovedSupersedes）、回执文件等于 `world/drafts/w1/village-ledgers/<id>.json` 且 targetId 等于行 id、行里该字段现值等于 after（REMOVE 即键不存在）时，才把它还原成 before，再交给 readApprovedContent 比指纹；返回时再对读回的行 applySupersedes，得到当前有效内容（无 food）。 |
| 会不会掩盖真实失配 | 通过 | 只还原"恰等于 after"的字段：生成器若产出别的 food 数值（不等于 REMOVE），不还原，指纹照常报不符；其它任何字段的漂移也照常报；filter 限定在 village-ledgers 目录的回执；返回时 applySupersedes 对"既非 before 也非 after"的值抛错（approved-revisions.mjs:109）。 |
| 其它 | 同 N-5 | 发布前 supersedes 为空，approvedProfiles 会因指纹失配而抛错（这是前文所说的过渡态）。 |

## 4. 修订机制（parsePublication 的 parts / formalParts）

判定：通过，带 N-1 的补强。
- 新规则：`s.field===e.field || e.field.endsWith('.'+s.field)`；`parts` 为回执侧路径，`formalParts` 为正式文件侧路径（`parseFieldPath(e.field)`），revertSuperseded 用 `formalParts ?? parts`（老回执两者相同，行为不变）；revertReceiptRow 与 applySupersedes 用回执侧 `parts`。
- 通用性：只靠字符串后缀，不含任何字段名/文件名；`.` 边界保证按路径段匹配（`conomy…`、`publicStock.seed` 被 initfood-revision.test 的反例拒绝）。
- 不误配：对旧批次，原本只有"相等"才放行，现在多放行"整段后缀"，旧批次的声明仍是相等，不受影响。残留的宽松点：后缀可以很短（如 field 写成 `food`），回执侧路径是否真的指向回执里的那个值，规则层没有校验（既有行为，等于路径本来就没校验）。这是 N-1 要补的真实回执检验的理由；不需要再加限制。
- rowOf 的变更（FILE_COLLECTIONS，按文件名后缀取 world 集合）：只新增 settlements.json → settlementProfiles，其它文件仍默认 locations，行为向后兼容。

## 5. 导入无环

判定：通过。抽查（我用 grep 对 agriculture-migration.mjs、settlement-mouths.mjs、world-entities.mjs 各做了一遍静态 `from './…'` 闭包）：
- settlement-mouths.mjs 的闭包 = {holdings, storage}；world-entities.mjs 无导入。
- agriculture-migration.mjs（settlement-profile 新增的导入）的闭包有 44 个模块，其中不含 settlement-profile、catalog、retrieval、scene-card、engine、primitives-body。grep 全 server-plugin：导入 settlement-profile 的只有 catalog、retrieval、scene-card（settlement-mouths.mjs 里出现该名字只是注释），三者都不在上面的闭包里，所以 settlement-profile → agriculture-migration 不成环。
- 代码搬移：primitives-body.mjs 删去的行与 settlement-mouths.mjs 新增的行（去掉首部 5 行说明与导入后）按行集合做 comm，两边差集为空：纯搬移，无改动；primitives-body 重新导出同名函数，既有调用方不变；tests/settlement-mouths.test.mjs 断言 `viaBody===settlementMouths`。
- 局限：我的闭包只覆盖静态导入；动态 `import()` 在这些模块里只见到 storage.mjs 的方法名 `import`，不是模块导入。

## 6. 放宽断言、写死数字、为测试造设施

- 放宽断言：没有。village-ledgers.test 把"登记值等于运行时存粮"改为"登记里不存在，运行时存粮等于规律值"，是换了对象而不是放宽；catalog.test 同理。
- 写死数字：initfood-approval 的 `LIMIT_YUAN=0.3, MAX_REQUESTS=40` 是李白批准的上限（本来就该写死）；tests 里的 295、205 之类都来自 rules 或在注释里给出手推。ledgerSeeds 中的 area/fresh/wood 是既有生成器参数，本批只删 food。
- 为测试造设施：world-entities.mjs 不是测试专用，WorldEngine 本身改用它，是打断导入环与保证 reader 与引擎同源所必需；settlement-mouths.mjs 是同一目的的代码搬移；tests/initfood-revision.test.mjs、settlement-mouths.test.mjs 只用现有模块与合成数据。没有发现专为让测试通过而加的设施。
- 提示：tests/initfood-revision.test.mjs 的"条目恰为带登记初粮的村"用 holders() 与 entries 对比，是自比；建议再加字面断言 `entries.length===4` 与目标 id 集（榆坡、围亭、泉口、桑坂），防止世界数据变动时两边同时漂移。

## 逐条结论汇总

| 项 | 结论 |
|---|---|
| 1 条目恰 4 条 | 通过 |
| 1 after 全为 REMOVE | 通过 |
| 1 supersedes 接对回执 | 通过（N-1 补真实回执测试） |
| 1 0.3 元 / 40 次生效且到额停 | 通过 |
| 1 --verify 登记时机 | 需改（N-2） |
| 2 读者推导 / 共享实体表 | 通过；N-3 需改（活状态 vs 期初、缺状态守卫） |
| 2 测试新期望 | 通过；N-4 建议字面值；N-5 需改（发布前变红、两处 initialFood 残留） |
| 3 生成器 / revertReceiptRow | 通过 |
| 4 supersedes 后缀映射 | 通过（补 N-1） |
| 5 导入无环 | 通过 |
| 6 放宽/写死/造设施 | 通过（建议加 entries.length===4 字面断言） |

---

# 复审（HEAD 10968d75，增量 f8bec8b6..10968d75）

只读：git diff、grep、sed，未运行任何脚本或测试。结论：approve。上次 N-1 至 N-5 全部落实，没有新增阻断；3 点小提示，不要求改动。

## 一、上次需改项核对

| 项 | 结果 | 依据 |
|---|---|---|
| N-1 读真实回执，REMOVE 路径写错会报错 | 已落实 | tests/initfood-revision.test.mjs 新增"真实回执"一条：读每个取代声明指向的真实回执文件（分件回执取 `draft`，candidate.json 取 `profiles` 里的行；我核对了两种文件的实际结构：loc_bs_yupo.json 顶层有 `draft`，candidate.json 顶层有 `profiles`），断言父对象存在、键存在、值等于 before，并在真实行上 applySupersedes 能删掉。approved-revisions.mjs 的 applySupersedes 另加：删除型且回执路径的父对象不存在或不是对象 → 抛"回执路径的父对象不存在"（紧跟在"值既非 before 也非 after"的分支之后，只在 `cur` 等同已删时走到）。末段拼错的情形由真实回执那条测试兜住，注释写明。新增测试还覆盖父对象缺失与父为 5 两种反例。对既有批次无回归：WATER-1D 唯一的 REMOVE 路径是单段 `['nutrition']`，父对象即行本身。 |
| N-2 --verify 登记时机 | 已落实 | initfood-approval.mjs 把 ENOENT（仅在只带 --verify、不带 --prepare/--review/--publish 时）转成 `approvalIncomplete`，由 content-pipeline.mjs 既有的 `reportApprovalIncomplete` 输出"审批未齐，无法完成检查：…"并设 `process.exitCode = 2`；全量只读检查的崩溃判定把"无异常栈的非 0 退出"归为主动报告的失败（readonly-runner.mjs:60-66），所以不再是崩溃。登记项移到列表末尾并加注释。小提示：移到末尾使其后 ~70 个入口的序号各 −1，按序号取模的分组（RUN_GROUPS=4）会重新洗牌，对结果无影响，只是各组耗时分布改变。 |
| N-3 期初库存读活状态、缺记录抛错 | 已落实 | agriculture-migration.mjs 新增 `openingStockFood(engine,profile,day=0)`：只读世界登记人口（`engine.world.settlementProfiles`）、`profile.granaryCapacity − profile.initialSeed`、同一条 `farmTargetDays`，缺登记行人口按 0；餐口经 `mealMouthsOf(engine,{},…)`，所以非人类聚落的物种代谢仍生效（空状态对 settlementMouths 安全：无存档 npc 就不查死亡，`stateMemo` 对空对象可用）。`farmTargetFood`（运行时用）也改为对缺 `state`、缺 `state.settlements[id]` 取空值，不再 TypeError。settlement-profile 的 withOpeningFood 改调 `openingStockFood`，并去掉了对 `document` 的依赖，所以无存档视图也有"期初库存"，进行中的游戏数字不再随人口、种粮、新建粮仓变化。新测试手推 80 人 × 295 = 23600、200 人封顶 47840、缺登记行为 0，以及 `farmTargetFood` 缺状态为 0。我核对：开局时 `state.settlements[id].population` 等于世界登记人口、容量等于 profile.granaryCapacity、种粮等于 initialSeed，两个函数在开局日数值一致；catalog.test（读 openingStockFood）与 village-ledgers.test（读运行时 openingFood）都与同一规律对账，所以运行时与公开资料互相钉住。 |
| N-5 发布前变红、initialFood 残留 | 已落实 | catalog.test、village-ledgers.test 文件头加"INITFOOD 修订批发布后才成立，发布前会红是预期，与发布提交一起进 master"的说明；village-ledgers.test 第 43 行与第 104 行、village-trade-live.test 第 111 行的 initialFood 都改了：开局账存粮按 `ruleOpeningFood` 规律手推；负例改为 `initialSeed++`，我核对 w1-village-profiles.mjs:184 确有 `publicStock.seed===p.initialSeed` 的校验，所以该负例会真的让 validateWorld 失败；`grep initialFood` 现在只剩注释。 |
| 测试发布前后都成立（附带） | 已落实 | initfood-revision.test.mjs 改为读冻结候选（`frozenEntries() ?? buildEntries(world)`），用 `isPublished(world, entries)` 分发布前后两种断言；条目断言改为字面的四个村 id（对应我上次"自比"的提示）；文本删除测试改用夹具文本（单行与缩进两种布局）。 |
| N-4（4 个字面值断言） | 同意不加 | 理由成立：4 个值是 `人口 × 295` 的派生，加进测试就是把可变的世界数据（人口）写死。现有的 settlement-mouths.test 已用手算数字（23600、47840、0）独立于世界数据地钉住了公式，catalog.test 与 village-ledgers.test 分别钉住公开资料与运行时，足够。我撤回这条建议。 |

## 二、新问题

没有阻断，也没有必须改的项。三点小提示：
1. 文本删除测试改用夹具后，不再用真实 settlements.json 的文本布局跑 editJSONText；真实文件的删除目前只在 `--prepare` 的"textEditsVerified"里验证（p1-revision-approval.mjs 的 prepare 路径）。可接受，但如果想保留测试层的覆盖，可以在发布前（`!published`）追加一条对真实文件文本的断言。
2. READONLY_ENTRIES 重排的分组副作用见上，无需处理。
3. 发布前仍有两个红测试（catalog、village-ledgers）及 publish-w1-villages 不可用，这是已说明的过渡态；合入 master 的顺序（先 `--prepare/--review/--publish` 后合入）要在交付说明里再写一遍，防止有人单独合入代码提交。

## 三、逐项汇总

| 项 | 结论 |
|---|---|
| 读真实回执 + REMOVE 路径报错 | 通过 |
| --verify 走 reportApprovalIncomplete、退出码 2 | 通过 |
| openingStockFood 不读活状态、缺记录按 0 | 通过 |
| initialFood 残留清理 | 通过 |
| 发布后才成立的文件头说明 | 通过 |
| 不加 4 个字面值 | 同意 |

---

# 二次复审（10968d75..c6f3d858：world.schema.json 去掉 publicStock.food）

只读：git diff、grep、sed，未运行脚本或测试。结论：approve（附 2 条小改，其中 1 条是 L1 判定的加固，不阻断）。

## 一、是否整类成立
成立。改动在 schemas/world.schema.json 的 `settlementProfile` 完整经济分支的 `publicStock`：删掉 `properties.food` 与 `required` 里的 `food`，该对象仍是 `additionalProperties:false`，所以今后任何聚落（不限这 4 个村）手填 food 都被拒，缺 food 合法；其余必填项（openingDay、seed、treasuryCopper、wood、iron、source、closing、closingReason）不变。这与"手填初粮退役、运行时推导"一致，也解释了上次 `--prepare` 的现象：删掉 food 后，数据不再满足"完整经济"分支（food 必填），落到 anyOf 的"无经济"分支。生成器本批已不再产出 food，所以此前生成的候选在旧 schema 下本来就会失败，这次修正使两者重新一致。新增 tests/settlement-schema.test.mjs：无 food 合法、带 food 被拒、缺 seed 仍被拒，结构合理。

## 二、有无其他 schema 副本
没有。全仓只有 `schemas/world.schema.json` 一份 world schema（find 只命中它）；schemas/ 下其它 6 份（action、balance-*、economy-lore、ontology、pack-manifest、spell-lore）与聚落公仓无关，grep 里 `publicStock` 只在 world.schema.json 出现；含 publicStock 的其它 json 是 docs/测试报告 的冻结输入与 tests/fixtures/legacy-r2-primitives.json（存档夹具），不是 schema，也不被 world schema 校验。引用该 schema 的测试（w1-villages、w1-hewan、population-seeded 等）读同一份文件，用的是各自的行，不含手填 food。

## 三、发布前后 L1 的 addedErrors 判定会不会失真
- 校验入口：validate-world.mjs 在 schema 出错时立即返回（`if(errors.length)return {ok:false,errors,warnings}`），只带 schema 错误。
- 发布前（`--prepare` 阶段）：基线世界仍带 4 个 food，按新 schema 会报 schema 错误，baseline 只含这些 schema 错误（提前返回，不含更深的校验）；候选世界去掉 food，schema 通过，继续走后面的校验。`added = candidate.errors 中不在 baseline.errors 里的`。后果有两种方向：
  - 不会把真实新错误掩盖掉的常态：候选若在更深的校验里有错误，它们不在基线里（基线提前返回），会被列为 added，使 `--prepare` 的断言（added 为空）失败，是"过严"而不是"漏报"。
  - 理论上的掩盖：候选若仍有 schema 错误，且错误串（路径加通用文案，如 anyOf 的"must match a schema"）与基线里这 4 个村的错误串逐字相同，就会因"基线已有"而不算新增。可能性很低（候选只是删去一个键），但这是 L1 判定唯一的逻辑漏洞。
  - 之前各批的 l1.json baselineErrors 都是 0；这一批会是非 0（基线带旧 food），读 l1.json 的人要知道这是 schema 修改导致，不是世界原本就有错误。
- 发布后：正式世界已无 food，基线与候选都应为 0 错误，判定恢复常态。`--verify` 不跑 L1。
- 加固建议（小改，不阻断）：`--prepare` 对本批要求 `candidate.errors.length===0`（绝对值）而不只是 added 为空，并在 l1.json 或交付说明里记录 `baselineErrors>0 的原因是新 schema 拒绝发布前的 food`；L4 读 l1.json 时核对 candidateErrors=0。这样基线是否带错都不影响判定的可信度。该改动属于 p1-revision-approval.mjs 的通用代码，只在本批 cfg 上开关即可（例如 cfg.requireCleanCandidate）；若不想动通用代码，则由 L4 在读 l1.json 时人工核对 candidateErrors 并写进 L4 记录。

## 四、小问题
1. tests/settlement-schema.test.mjs 第 19 行 `assert.ok(validate.errors.some(…additionalProperty==='food') || validate.errors.length > 0)`：`validate` 返回 false 之后 `errors.length>0` 恒为真，`||` 后半句使整条断言空转，等于没断言"被拒的原因就是 food"。去掉 `||` 后半句，只保留 additionalProperties/food 的断言（ajv `allErrors:true` 下该错误应出现；anyOf 包裹时错误出现在分支里，同样会列出）。
2. 发布前正式文件仍带 food，会让 validateWorld 与依赖它的测试（以及任何跑 `validateWorld(world)` 的发布前流程）变红，这是执行者已说明的预期过渡状态，与前面 catalog.test、village-ledgers.test 的"发布后才成立"同类，合入顺序（先发布后合入）在交付说明里已有；本次不再重复。

## 五、结论汇总

| 项 | 结论 |
|---|---|
| schema 改动整类成立 | 通过 |
| 其他 schema 副本 | 无 |
| L1 addedErrors 判定 | 通过（建议加固：要求 candidate.errors 为 0；记录 baselineErrors 非 0 的原因） |
| 新测试 | 需小改（第 19 行空转的断言） |

---

# 三次复审（6b078b88..6d4b21de：条目编号与静态预检）

只读：git diff/show/status、grep、sed，未运行脚本或测试。结论：approve（附 2 条可选加固，不阻断）。

## 一、条目 id
通过。initfood-approval.mjs 的 buildEntries 把 id 改为 `initfood-${r.id}`，`r.id` 是 settlementProfiles 里的聚落 id，机械推出；四个聚落 id（loc_bs_yupo、loc_bs_weiting、loc_bs_liquan、loc_bs_sangban）得到 `initfood-loc_bs_yupo` 等，全部匹配 `^[a-z][a-z0-9_-]+$`（含下划线、连字符，无点、冒号、斜杠）。该正则与 content-pipeline.mjs:195 `/^[a-z][a-z0-9_-]+$/i` 逐字一致（含 i 标志）。tests/initfood-revision.test.mjs 断言 `e.id === 'initfood-'+e.target`，并用旧编号（含点）、`a/b`、`1abc`、`a:b` 作反例，预检均报"条目编号不安全"；重复 id 报"条目编号重复或缺失"。我 grep 了仓内对旧格式 `<聚落>-<FIELD>` 的依赖，除这个反例外没有；supersedes 的 receipt 用聚落 id，不用条目 id，不受影响。

## 二、preflightEntries 对照 runContentPipeline 入口断言
覆盖了与"条目"相关的全部静态断言，未覆盖的都是常量或运行时项：
| 流水线入口断言（content-pipeline.mjs） | 预检 |
|---|---|
| :194 条目数组且 id 唯一 | 覆盖（空数组、重复） |
| :195 id 安全格式 | 覆盖（同一正则） |
| :196 concurrency 1–16 | 不覆盖，p1 传常量 1，恒成立 |
| :197 batchSize 1–50 | 不覆盖：p1 传 `batchSize: entries.length`，条目超过 50 条时才会在 --review 抛错；本批 4 条无影响 |
| :198 validateDraft/buildDraftRequest 为函数 | 不覆盖，调用方固定传入 |
| 冻结候选路径的 L1（:282 起 `l1(frozen,entry,context)`，错误即抛） | 覆盖：预检用 `pipelineL1(validateDraft)(draftFor(e), e, contextFor(e))`，顺序、参数与流水线一致，含通用数字规则 |
| 复核请求构造、请求体可序列化、max_tokens | 覆盖（预检另加的检查） |
| 预算账（openContentBudget）、协议恢复 id、budget.json 与单卡上限 | 不覆盖，属运行时/--review 断言，已由 p1 的 `--review` 前置断言与 content-budget 处理 |
没有发现遗漏的"格式类"断言。两条可选加固：①预检里加 `entries.length<=50`（批次上限），与 :197 同步，否则大批次仍会在 --review 才暴露；②目前 preflightEntries 只被测试调用，`--prepare` 没有调用它。让 `--prepare` 在冻结前先跑一遍预检并在有问题时拒绝冻结，才真正做到"跑模型之前不会出现格式类错误"（这次的错误本来在 --review 的第一行断言就停了，0 次调用，成本已经是 0；加固只是更早暴露）。

## 三、撤除冻结物后的仓库状态
干净。550152db 误带入 world/drafts/initfood/{budget,candidate,cost-estimate,l1}.json（425 行），6d4b21de 用 git rm 撤掉；`git diff --stat 6b078b88..6d4b21de` 的净变更只有 3 个文件（initfood-approval.mjs、p1-revision-approval.mjs、tests/initfood-revision.test.mjs），world/drafts 下零变更；`git status --short` 无输出；world/drafts/initfood 目录不存在，需要时重跑 `--prepare` 重新冻结（0 次调用，账为空）。

## 四、其他改动
没有。三个文件的 diff 逐行看过：initfood-approval.mjs 只改了 id 与一行注释；p1-revision-approval.mjs 只新增 preflightEntries（不改 runRevision、不改既有导出）；测试文件只新增预检那一条与导入。

## 五、结论汇总

| 项 | 结论 |
|---|---|
| id 由聚落 id 机械推出且合格式 | 通过 |
| preflightEntries 覆盖入口格式断言 | 通过（可选：加批次上限检查；在 --prepare 里调用） |
| 冻结物撤除后仓库状态 | 通过 |
| 其他改动 | 无 |
