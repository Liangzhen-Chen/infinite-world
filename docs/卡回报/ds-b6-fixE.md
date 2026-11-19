# 块 6 补值卡 E《物品类别规则读材料量（内核）》回报

写：Claude Opus 5.5 中档（主会话派的子代理）；分支 ds/b6-fixE，基 fa4698a6e，后合 origin/master（合并提交 36fec1ed1）。

## 自查表

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 见下"卷文依据"：卷三乙 :984（C-1）、:985（C-8）、:425（materialView）、:672（静态条件按 T-14）、:675（M-1）、:898（材料派生组件含有/具有）；卷二 :382、:405、:1212、:1216–:1220；卷四 :855 |
| 2 | 没有按 id/名字/场景写特例 | 是 | server-plugin/kernel/item.mjs materialFieldProblem 按聚合表与材料表头整类判；读数走既有 aggregateDim；不适用按 rows.mjs requirement 整类判；不点名任何材料、维度、类别 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 口径 none、不存在的键、map 型、classes 都在加载期 E-MOD-RX（item.test.mjs 新用例"只收聚合到物品层的材料维度"）；未知、不适用不交读数，连取反也不命中（新用例"未知按未知传播"）；onUnknown error 照 M-1 报 E-DIM-REQUIRED-MISSING |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望按 M-1 公式手算：mean 易燃度 = 木份额×0.5（0.25、0.3、0.5、0）；sum 热值 = 0.5×18 = 9、0.4×18 = 7.2；hmean 密度单料静态固栏 0.9、1；前提都在测试夹具里造 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 新代码里原写的"数组字面量 .includes(typeof …)"被 literal_compare 计入，改成 S13 (d) 白名单里的 typeof 直接比较（同文件既有写法）；没改任何既有代码 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | diff 共 2264 行（合入提交 11aaa5e7b：12 个文件 +2218 −46，含卷四勘误前快照；主会话 11-19 22:1x 按李白巡查补填）。卡文所列：item.mjs、item.test.mjs、state-owners.json、criteria.json（经 register.mjs）、本回报；授权扩展 rows.mjs（主会话补值卡 E 裁定①，只加 export）、卷四勘误 1119k15（裁定②：正文、现行快照、勘误前快照）、dimensions.mjs（Opus 只核后主会话授权，applicable 改用 requirement）。代码与测试 diff 约 +175 −20 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：1091 pass / 0 fail；`node tools/accept/run.mjs pre_commit`："verdict": "pass" |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 6-22 给物品配了材料后，类别规则可以写"材料量过线"的条件（如 material.heatValue、material.flammability），混料物品里不适用的份不参加，类别由材料派生，不手写、不特判 |

## 卷文依据
- 卷三乙 :984 C-1 ②："按 M-1 聚合的材料量（分态量、固相量一律按静态读法 T-14 取）……不得读当时物态与物温"；:985 C-8 ②"when 的变量与 C-1 相同"。
- 卷三乙 :425：materialView 给物品模板 id "按 M-1 与 rules.items.aggregation 把各材料组聚合成物品的材料量……给模板时按静态读法取栏（T-14）"。
- 卷三乙 :672："对模板与一切静态条件（C-1、C-8、S-4、运法规则的 when），按静态读法 T-14，不读温度"。
- 卷三乙 :675 M-1：① 不适用的份"不参加聚合，不触发 onUnknown"（例"铁没有热值"）；② 未知按该维 onUnknown，gap 的结果带 partial。
- 卷二 :382 未知传播总则："first(rules) 的某条 when 含未知变量 → 该条按未命中处理……applicable:false 的变量视同未知"。
- 卷二 :405 加载期规则分类体例："另可读代号等于本表 kind 的已登记命名空间行……读修正前的基值"。
- 卷二 :1212、:1216–:1220：命名空间读法、"随字段"、set 字段只作 member 的 set；行由领域卷自登记，代号不得一个是另一个的前缀。
- 卷四 :855 material 行："被求值的那一份材料的维度（变量口径同卷三乙 §4.3 C-1）"。

## 做了什么
1. `server-plugin/kernel/item.mjs` compileWhens：类别规则作用域除 item 行外再收 material 行；`material.<维度键>` 只收聚合表里口径不为 none、且物品层读数是 RX 读数的材料维度（分态量按静态读法取一栏，是数值），不合在加载期报 E-MOD-RX。6-2 的"不得恒真、不得读 class 族"照旧。
2. checkItemTables：每件物品给 material 命名空间一个读数函数，调同一个 aggregateDim（与 materialView 给模板 id 同一条路），按件缓存；未知、不适用不交读数（按未命中）；onUnknown 为 error 的未知照 M-1 报 E-DIM-REQUIRED-MISSING。evalWhen 改成按命名空间代号分派读数。
3. （主会话裁定①）`server-plugin/kernel/validate/rows.mjs` 给现成 `requirement` 加 export；item.mjs loadReader 在值缺且"条件必填的条件都不满足"时给不适用（卷三乙 :675 M-1 ①），与运行期 dim 同口径。改前铁木各半读 material.heatValue 加载即 E-DIM-REQUIRED-MISSING。
4. `world/ontology/state-owners.json` material 行 entry 补一句类别规则里的读法；返回形状、类型、登记卷不变。
5. （Opus 只核 docs/审查/6-fixE-Opus只核-1119.md 必须改 1，主会话授权）`server-plugin/kernel/dimensions.mjs` 运行期 `applicable()` 改为调 rows.mjs `requirement`（"；"多项、byEnum、已声明命名条件全认，卷二 :105、:152），给它的是有效行视图：成员关系取 memberClasses（含偏离行类别与材料派生组件），值取偏离行 props 覆盖展平行；不另写判定。改前木铁各半读 moisture，加载期判铁不适用、运行期判适用缺值，分叉。item.mjs loadReader"与运行期 dim 同口径"注释现在属实。
6. 判据指纹：rows.mjs、dimensions.mjs 在 9 类判据检测器的 import 闭包里，经 register.mjs 给 dual_write、handfill_derived、instance_name、item_form、namelist、param_consumed、seed_sites、state_pattern、undeclared_io 各 rev+1 并写修订记录（输入 F:/dnd-tmp/fixE-register.mjs，只挑指纹变了的类别）。
7. （主会话裁定②）卷四封卷后勘误 1119k15：§4.7.7 `material` 行读入口栏补"类别规则里的 `material.<键>` 读的是物品按份额聚合的材料量（卷三乙 C-1 ② :984、materialView :425）"，附录加勘误行；勘误前快照 `版本快照/卷四-v10-勘误前-1119k15.md` 与 origin/master 正文同 blob（6e50798e），改后覆盖 `版本快照/卷四-v10.md`（cmp 相同）；不升版本。

## 测试（tests/kernel/item.test.mjs 新增 6 条，测试先行，改前全部失败）
- 多项条件必填：含水率策略"byDigestible；byClass:comp_edible；byClass:comp_drinkable；byClass:comp_burnable"，木挂可燃含水 0.4、铁都不满足；木铁各半 mean = 0.4（只算木），类别命中 `>= 0.4`，运行期 materialView（全列与只读 moisture 两种）都给 0.4，铁自身 moisture 不适用。
- 类别随份额变：易燃度 mean，木五成 0.25 不入、六成 0.3 恰入、全木入、全铁不入；classRules 同一读法；与 materialView 读数一致。
- 不适用的份不参加：木可燃热值 18、铁不可燃，木五成 9 恰入、四成 7.2 不入，全铁不适用不命中；与 materialView 读数一致。
- 分态量静态读法：冰水可固可液取固栏 0.9 不入，木 1 入。
- 未知传播：温度域没给，density 未知，条件与取反都不命中，落到下一条。
- 变量域拒收：口径 none、不存在的键、map 型、classes 均 E-MOD-RX；合格写法能加载。

## 自定裁定
- 用已登记的 `material` 命名空间，不另开新行：卷四 :855 定其变量口径"同卷三乙 C-1"；新开 `item.material` 之类会与 item 行前缀冲突（卷二 :1220 第 1 点）。
- `material.classes` 在类别规则里拒收（E-MOD-RX）：C-1 要的是材料派生组件的"具有"（卷三乙 :898），materialView 对 set 取并集是"含有"，两层不许混。
- 类别在加载期派生、读修正前的值：沿 6-2 既有结构与卷二 :405 体例，运行期 itemView 只读 itemDerived。
- 带 partial 的聚合值照已知值交读数：卷三乙 :675 ② gap 的结果就是带标记的值。

## 偏离
- 无（rows.mjs 与卷四勘误 1119k15 均由主会话补值卡 E 裁定授权）。

## 未解决
1. C-1 ② 另几类变量不在本卡（主会话裁定③，记 PLAN 挂卡）：材料派生组件的"具有"（要 rules.items.materialCompMin）、各本源成分与各派生大类的份额、折算量（fuelEnergyMJ、saltPerKg、pileFlammability）。
2. map 型聚合量（nutrients、strength 等）按卷二 §2.9 不是 RX 读数，本卡拒收；粮食条件若要读某营养键，需另定读法。

## 验收
- 开工前 `git fetch origin && git rebase origin/master`：up to date；主会话裁定后 `git fetch origin && git merge origin/master`（合并提交 36fec1ed1）；Opus 只核后再 `git merge origin/master`（含补值卡 F，criteria.json 冲突取 master 版后经 register.mjs 重登）。
- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：ℹ tests 1091 / ℹ pass 1091 / ℹ fail 0。
- `node tools/accept/run.mjs pre_commit`：`"verdict": "pass"`。条目里 vol12.A12-4.5、vol12.S12-2、vol12.S12-3 三条失败与改前基线相同，不是本卡带来的。
