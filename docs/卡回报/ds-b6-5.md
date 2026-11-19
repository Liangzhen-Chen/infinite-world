# ds-b6-5 回报：块 6 第 6-5 张《状态容器最小、谓词与 terminal 第二读数》

写：Claude Sonnet 中档（会话内子代理），一轮。未经只核。

## 自查表

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 见“卷文出处” |
| 2 | 没有按 id/名字/场景写特例 | 是 | action-capacity.mjs、status.mjs 无族 id、容器 id、能力 id；族条目经词表索引按实例的 family 取，阈值键集取阈值表自己 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | capacity.test.mjs：空实例列表、无实例、别人的标记、阈值恰等于、能力值恰为 0、阈值未建、阈值既无值又未登记（抛）、状态行不存在（抛）、非 capability 代号（抛）、S3 两种撞名、S4 未登记（抛） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望值按卷四 §4.2.5 示例手算（左手丧失 0.7、单腿 0.5、双腿 0、左臂传手 0.5）；状态行、测试族、阈值表都在测试里造 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 门禁第一次报实例名字面量（'status_family'）：不是改名骗过，而是去掉这个字面量——族条目改按实例 family 代号经词表索引取，本来就不需要族名 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 21 files，+530/−39（本报告未计入）；卡文外的接点文件与三处既有测试期望值更新均在“偏离”逐项列明 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → tests 902 / pass 902 / fail 0；`node tools/accept/run.mjs pre_commit` → "verdict": "pass" |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | “这个人能不能动、醒没醒、死没死”有了唯一出处（6-6 人物表、6-13 动作目录读它）；阈值卷文没给数，不编，登未建 |

## 卷文出处

- 卷二 §2.5 :510：唯一通用谓词 `can(engine,state,subject,capabilityId)` 与派生谓词 `awake`、`capacity → full|limited|none`，全部在 action-capacity.mjs，读 `bodyView().dims.body.*`、`rules.capacity` 阈值表与 statusView 各实例 family 条目的 terminal／incapacitating／suppressesAwake 字段；实现里不出现任何族 id 或容器 id。
- 卷二 §2.5 :511：`terminated` 只读两样：终止标记 state.terminated[subject] 与 statusView 的 `terminal`（带 terminal:true 的状态实例存在而标记尚未写入的那一段同样算已终止）；复生窗口期照常为真；`dead` 是同一函数的别名；terminal 的读者只有 action-capacity.mjs。
- 卷二 §1.11 :351–:354：awake = body.consciousness ≥ rules.capacity.awakeMin；can 对存在 incapacitating 实例的主体返回 {ok:false, reason:<该实例 status id>}；awake 还需无 suppressesAwake 实例；首批赋值 sfam_dead{terminal}、sfam_unconscious{incapacitating, suppressesAwake}、sfam_sleep{suppressesAwake}；运行态实例 state.statuses[subjectId][]。
- 卷二 §2.7 :569（statuses 登记）、:575（sys.status）；卷四 §3.2 :413、P-5 :448、§4.11.2 :1018（本卷不导出 can/awake/capacity）；块6 体检 :155（不建 modifier.mjs）；对照表第 14、15 行。

## 做了什么

- 状态容器最小版：`server-plugin/status.mjs`，`statusView` 读 `state.statuses[subject]`，每个实例带它的状态行的 `family`（状态行是 kind status 表的行，`family` 维度）。不求档、不求修正集合、不判"作数"（卷二十一 R21-1.11 归后面的卡），不建状态实例写者、不建 modifier.mjs（块 6 无玩法写它）。
- 数据：新建 `world/ontology/dimensions/status.json`（表头只有 family 一个维度，无行；行内容归卷二十一）；`_vocab.json` 新增 status_family 族，三条首批赋值（卷二 :352 原赋值）；`_unbuilt-derived.json` 去掉已建成的 status 实体表；`state-owners.json` 加 statuses 键、pathTypes、keyKinds、`sys.status`、`sys.capacity.predicates` 补 can／awake／capacity；`kernel/state-types.d.ts` 由生成器重写。
- 谓词：`action-capacity.mjs` 的 `can`、`awake`、`capacity`、`terminated`（读两样）、`dead`。
- `rules.capacity`：registry 加表头与类型，`tables/capacity.json` 三键登在 unbuilt（卷文只给形状，旧数据也没有数；不编）。真实世界 awake、capacity 读数现为未知（原因 unbuilt）。
- 加载期：`checkBodyTables` 加 status_family 三字段"每条必写布尔"。
- 6-4 遗留：S3 加载期 E-DIM-DUPLICATE-KEY（第二张带 capabilities 段的表、某表 kind 恰叫 body）＋ installVocab 兜底抛；S4 `meanDailyFoodNeed` 按 rules.body.unbuilt 里登的 metabolism 给未知并带原因，没登记即抛；S2 dimensions.mjs 抽 `registeredRows`，行为不变。

## 自定裁定

1. **返回形状**（卷文只说真假、full|limited|none）：`can`、`awake` → {ok, known, reason}；`capacity` → {level, known, reason}；known 为假即读不出（阈值未建 reason 'unbuilt'，能力值未知 'unknown_value'）；`terminated` 保持卷二 :511 的 {ok, reason}。理由：未知必须能和假区分开（卷二 §1.6，不把未知当假）。
2. **terminal 实例命中时 terminated 的 reason** 取该状态实例的状态代号（对应 can 对 incapacitating 的写法 :352）；标记与实例同在，先读标记。
3. **`can` 对一般能力的口径**：卷文没给一般能力的阈值（rules.capacity 只管 consciousness、moving、manipulation 三项的 full／limited），现取 body 值 > 0 为能、= 0 为不能；incapacitating 实例先挡；无身体图 {ok:false, reason:'no_body'}。**待李白认可或改口径**（已记 docs/问题.md）。
4. **`capacity`**：full 各项全部 ≥ 阈值取 full，否则 limited 各项全部 ≥ 阈值取 limited，否则 none；键集取阈值表（limited 与 full 同键，卷文以省略号带过）；取等算过。无身体图 level 'none'。
5. **S6**：bodyView 保持卷二 §2.2 签名（无 clock）。读 clock 的修正项现会按"缺读数即 E-MOD-RX"抛（不当 0，响而不默）；首个读 clock 的 body.* 修正项（6-6 生命阶段）进来时，由 bodyView 经 clockView 取 day 再传。本卡没有这样的修正项，不先做。
6. **statuses 的 keyKinds** 取 faith、item、org、person、place（状态行 target 含 body/mind/place/org/faith，终止对象含 item；卷文没列 kind，取并集）。
7. **statusView 遇到指向不存在状态行的实例**抛 E-DIM-UNKNOWN-READ，不静默当作没有族。

## 偏离（卡文外的文件）

- `world/ontology/dimensions/status.json`、`_vocab.json`、`_unbuilt-derived.json`、`world/rules/registry.json`、`tables/capacity.json`、`tables/body.json`（登 metabolism）、`kernel/validate/body-tables.mjs`（S3 与族字段核对）、`kernel/state-types.d.ts`（生成）：状态表与阈值表登记，本卡必需，AGENTS 允许的普通 schema/数据接点。
- 改了三处既有测试：`tests/kernel/body.test.mjs`（未建实体表的样本由 status 改 culture：status 表本卡建成，原样本不再成立，断言本意不变）、`tests/kernel/state-owners.test.mjs`（P 成员加 statuses）、`tests/accept/s2s3.test.mjs`（写分量加 c_write_statuses）；`tests/kernel/body-world.mjs` 加状态行与 rules.body.unbuilt 默认值的夹具钩子。均为随本卡数据变化的期望值更新，没有放宽断言。
- 未写 PLAN.md（主会话统一记）。

## 未解决 / 待报

- `rules.capacity` 三键阈值卷文无数，真实世界 awake／capacity 为未知，待李白给数或试玩标定（docs/问题.md）。
- `can` 一般能力口径见自定裁定 3。
- "无身体图"分支（no_body）没有用例：夹具里没有无物种的主体可造，代码路径来自 bodyView 返回 null 的既有口径。
- 状态实例写者（status.mjs 的写函数）、档与修正集合、"作数"判定、status_tick 钩子：不在本卡，随卷二十一首张卡。

## 合入前一小轮（主会话指示）

can 不再比较族名字面量，改判条目带 dimKey；删 installVocab 的不可达兜底（加载期 E-DIM-DUPLICATE-KEY 与测试保留）；state-owners 格式噪声。901/901，pre_commit pass。
