# 补值卡 E《物品类别规则读材料量（内核）》Opus 只核（1119）

核者：Claude Opus 5.5 中档（非写者）。对象：分支 ds/b6-fixE，工作树 F:/dnd-wt/ds-b6fe，HEAD 99453ce33；`git diff origin/master...HEAD`（9 文件）。
依据：李白 11-19 21:0x ①(c)（origin/master 审查/李白裁定-1117.md :1380 起）；卷三乙 :425、:675（M-1 ①）、:898、:984（C-1 ②）、:985（C-8）；卷二 :105（`.required` 语法，"；"并列任一成立即必填、byDigestible/byReader 命名条件）、:152（取值算法）、:1220；卷四 :855（勘误 1119k15）。

## 结论：必须改（1 条）；其余各项可封

### 必须改 1：加载期与运行期对"多项／命名条件必填"的维度不适用判定不同口径，类别派生与 materialView 读数分叉

- 现象（亲测，探针测试已删，未提交）：夹具木料挂 comp_burnable、moisture 0.4，铁不挂；物品木铁各半，`categoryRules` 首条 `material.moisture >= 0.3`。加载期类别派生得 `category_test_fuel`（铁那份判不适用、mean 只算木 = 0.4）；同一物品运行期 `materialView(eng,{},id).dims.moisture` = `{known:false, applicable:true, reason:E-DIM-REQUIRED-MISSING}`，带 `dimensions:['moisture']` 时直接抛 E-DIM-REQUIRED-MISSING；`materialView(eng,{},'mat_test_iron').dims.moisture` = `{known:false, applicable:true}`。
- 根因：新加载期读法 server-plugin/kernel/item.mjs:126-129 用 rows.mjs `requirement`（全策略：多项"；"、byEnum、byDigestible、byReader），而运行期 server-plugin/kernel/dimensions.mjs:121-129 `applicable()` 只认单项 `byClass:`/`ifPresent:`，其余一律"适用"。对 `byDigestible；byClass:comp_edible…` 这类策略，取冒号前整段做 policy，判为适用。
- 受影响的已聚合维度（material.json 表头 + items.json 口径）：moisture（mean，onUnknown error）、energyDensity（sum，error）、carbContent、fiberContent（dmean，gap）、insulation、breathabilityBase（mean，error，byReader）。heatValue（单项 byClass:comp_burnable）两边一致，故本卡复现用例（item.test.mjs 新用例 2）测到的那一类是通的，但卡的第 2 重点"加载期与运行期读数一致"只对单项策略成立。
- 卷文：卷三乙 :425 类别规则读的量与 materialView 给模板 id 是同一个量；卷三乙 :675 M-1 ①"这份材料不满足该维的必填条件"即不适用；卷二 :105"一个维度可并列多个条件，以'；'分隔，任一成立即必填"、:152 条件不满足即不适用。按卷文，加载期判法是对的，运行期 `applicable()` 不合卷二 :105。item.mjs:127 注释"与运行期 dim 同口径"不实。
- 改法（落在规则层，一处修全类）：运行期 dimensions.mjs `applicable()` 改用与 rows.mjs `requirement` 同一判定（含"；"多项、byEnum、命名条件；命名条件按卷三甲 §2.1 判据），不另写一份；或抽出共用判定由两边引用。这是内核文件、超出本卡文件表，由主会话定归属（本卡续做或另开内核卡，按 CLAUDE.md 内核交 Opus 写、Opus 复核）；改后加一条测试：木铁混料读上述任一多项策略维度（如 moisture），断言加载期类别派生与 `materialView` 同一读数，期望手算。在修好之前，本卡至少不得保留"同口径"的注释。

## 逐项核对（通过）

1. 读法与变量域：`material.<键>` 在 checkItemTables 内经同一 `aggregateDim`（item.mjs:226）按件缓存、加载期算一次（item.mjs:535-551），ctx 的 matter/formed 与 materialView（item.mjs:670）同源。未知、不适用不交读数，evalWhen 缺读数按未命中，取反也不命中（item.mjs 新 evalWhen；新用例 4 测 `!(material.density < 1)`）。加载期拒收整类判：口径 none、表头无此键（materialFieldProblem，聚合表 + 材料表头）、map 型（dimRxType 抛）、`material.classes`（表头无此维），均 E-MOD-RX；不点名任何维度、材料。分态量按 T-14 静态栏（isPerState 放行，aggregateDim 取栏），合卷三乙 :984"一律按静态读法"。onUnknown error 照 M-1 ② 报 E-DIM-REQUIRED-MISSING。加载期读修正前基值、运行期 materialView 读有效值，属卷二 :405 与卷三乙 M-12 ① 既定体例，非本卡偏差。
2. rows.mjs 只加 `export` 与 JSDoc，函数体未动；铁木各半读 heatValue，铁按 byClass 不满足判不适用（item.mjs:126-129），用例 2 手算 0.5×18=9 恰入、0.4×18=7.2 不入，并断言 `materialView` 同值 9、全铁 `applicable:false`，确实测到。限制见必须改 1。
3. 沿用已登记 `material` 命名空间、不新开 `item.material`：卷二 :1220"不得一个是另一个的前缀"，理由成立；scope 只多收 `KIND.material` 一行（item.mjs compileWhens）。`material.classes` 拒收：卷三乙 :898 C-1 要"具有"（份额 ≥ materialCompMin），materialView 对 set 取并集是"含有"，两层不许混，理由成立；"具有"另挂卡（回报未解决 1）。
4. 6-2 两条限制仍在：`reads` 计 dim 与 ns 读，`!reads` 报恒真；class 族句柄仍报（item.mjs compileWhens walk）；原用例"C-1、C-8 when 不得恒真、不得读 class 族条目"未改仍过。
5. 勘误 1119k15 体例：勘误前快照 blob 6e50798e = origin/master 卷四正文 blob（git rev-parse 两者相同）；附录加勘误行，写依据、必要理由、快照路径、不升版本不改卷首；正文与 `版本快照/卷四-v10.md` cmp 相同；卷首未动。state-owners.json `material` 行只改 entry，形状、类型、登记卷不变。9 类判据经 register.mjs 各 rev+1 并记修订（diff 中 9 条 `+ "rev"`），判据本身未改。
6. 测试期望手算：mean 0.6×0.5+0.4×0=0.3 恰到阈值、0.25 不入；sum 9 / 7.2；单料 hmean 取固栏 0.9 / 1；全按夹具前提，无抄基线。亲跑：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` 末行 `ℹ tests 1087 / ℹ pass 1087 / ℹ fail 0`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`。

## 备注（不阻封）

- 物品逐条 `categoryRules.find` 惰性求值，onUnknown error 的未知只在该条被求到时报；与"first 命中即止"一致，可接受。
- 回报自查表第 6 项"diff 共 __ 行"留空未填。
