| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 见"卷文出处"：卷三乙 :149、:326、:566、:886–:900、:904–:917、:420、:425、:630–:672、:678、:980–:992、:936、:179、:215–:216；卷二 §5.1 :1615、§2.2 :466；卷十八 §4.1.1 :457；表头每个维度 source、owner 写卷节 |
| 2 | 没有按 id/名字/场景写特例 | 是 | server-plugin/kernel/item.mjs 无物品、材料、类别、组件类代号判断；聚合口径、承担组、固相量、尺寸档、类别、本源成分到类别全读规则表与表头；检测器改动整类（实体前缀不含词表 classPrefix），不点名 class_ |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | tests/kernel/item.test.mjs 与 item-review.test.mjs：share 和、空列表、重复、massKg 缺/0/负/超限、classes 手写（class 族与材料组件）、bulkForm 缺/多写、I-9 缺栏、I-7 缺 wearResistance/散粒/非结构组、M-9 双来源、类别不命中、when 恒真与读 class 族、聚合表缺行/多行/重复行、端类型两种名/未知名/可终止表、matter 族不一致 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望值按卷文公式手算成字面量；前提全在 tests/kernel/item-world.mjs 临时世界里造；真实 world 只验表头与登记（含 columns 条数 18、substanceClass 九条取卷三乙 :566） |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 改的是检测器误报（read.mjs 实体前缀去掉 classPrefix，补必须报 instance_name-43、必须不报 instance_name-44，criteria 经登记器 rev 加一）；对应旧用例 detectors.test.mjs 里 fxclass_a 的期望按主会话裁定改；named-conditions.mjs 行为等价保留；substanceClass 回规则表 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | `git diff --cached --shortstat origin/master`：31 files，+5023/−90（含卷三乙勘误前快照约 3000 行）；卡文外文件见"偏离" |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → ℹ tests 1001 / ℹ pass 1001 / ℹ fail 0；`node tools/accept/run.mjs pre_commit` → "verdict": "pass" |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 游戏有了"东西"这一层：物品表头（卷三乙 §2.2 全集）、itemView/materialView、派生密度体积尺寸档与类别、I-7、库存槽、端类型解析启用；6-3、6-9、6-22 有了底；卷文没给的值一律登未建、不编数 |

# ds-b6-2 回报：块 6 第 6-2 张《物品表头与读入口》（只核改一轮）

写：Claude Sonnet 中档。第一轮 d634928d9；本轮照 docs/审查/6-2-Sonnet只核-1119.md 与主会话批示改，已合入 origin/master（merge）。

## 本轮改了什么

- **M1**：门禁 S6-2.b 误报在检测器修（tools/accept/read.mjs prefixesFromDir 不再把词表 classPrefix 当实体前缀）；cases 补 instance_name-43（真实体 id，必须报）、-44（类别代号，必须不报）；旧用例 fxclass_a 期望随改。本源成分到类别回规则表 `rules.materials.substanceClass`（卷三乙 :326、:566，九条），删 substance 条目的 materialClass；补 M-9 :678 "一个类别只许一条来源"（本源成分与派生大类、材料与 classRules 同一类别即 E-DIM-DERIVED-CONFLICT）及测试。
- **M2**：I-7 加载期（具有 class_formed 的物品，结构组固态材料缺 strength、sharpnessMax、wearResistance、armorMult 之一按 onUnknown：error 报错、gap 不阻）与使用时（不具有 class_formed 则固相量不适用）；class_formed 按其定义条件（可能物态集含固且 bulkForm bearsLoad）直接算，不依赖未给值的 classRules；已写进 rules.items.unbuilt 的 basis 与问题.md。
- **M3**：emits、attachModifiers、launch、guard 四维在表头声明；launchsrc 三值进 markers 代码枚举；units 加 kg_m_per_s、mrad；families 登 field；columns 加三项（他卷必填列原为 15，现 18）。
- **S2**：材料派生组件挂进物品行也报 E-DIM-DERIVED-WRITTEN（checkItemClasses 在 world.mjs 内先于其他校验），测试改断言此码。
- **S3**：走卷三乙勘误 1119k8（第 51 行，卷三乙 §4.1.1 :663 段末补 `solidOnly`；快照 卷三乙-v7-勘误前-1119k8.md，覆盖 卷三乙-v7.md）。理由：标记与口径、承担组同处登记，物品层读聚合表即得。
- **S4**：端类型解析排除可终止实体类（类别行写了 termination），测试覆盖。
- 其余：REQUIRED_POLICIES 删 always；MATTER_STATES 与 _vocab matter 族由加载期一致性校验对齐（markers 是定义源，_vocab 不能引用代码，故用校验，测试覆盖不一致即失败）；itemView 补 options、不是物品表实体返回 null（卷二 §2.2 :466 规定返回 View | null，卷三乙 §3.1 未另定拒收）、数值可修正维度走唯一管线；possibleMatterStates 备注函数名改 matterStatesOf；问题.md 补 S1、@用途、K6-29。

## 自定裁定

1. itemView、materialView 放 kernel/item.mjs（同 placeView）。
2. 类别与可能物态集加载期求一次，挂 `itemDerived`，运行期只读。
3. guard.coverBps 取 dimensionless（卷文无单位；bps 被 S6-14 计为资源数量）。
4. attachModifiers 元素取 struct:modifier 子集（卷二 §1.5 struct 引用写不成一个表头类型）。
5. matter 族定义源在 markers（代码内用其比较），_vocab 登记同一组，加载期校验一致。

## 偏离

卡文外文件：markers.mjs（agg_mode、launchsrc、MATTER_STATES、REQUIRED_POLICIES、holding_kind）与 markers.test.mjs、named-conditions.mjs（S1，行为等价，主会话记问题.md）、tools/accept（read.mjs、cases.json、criteria.json）、tests/accept（bypass 两份、detectors.test.mjs 一条期望）、卷三乙勘误与快照、registry.json、climate.json、items.json、materials.json、_unbuilt-derived.json、_units.json、files.json、state-owners.json、docs/问题.md。

## 复核第 2 轮（最后一小轮）

- coverBps 改回 bps 实测不行：S6-14 对表头顶层 struct 数值叶子也计，pre_commit 报 `item.guard.coverBps`（资源单位 bps 撞名），故仍用 dimensionless，已写问题.md 待李白裁定。
- lit_scope 的类别代号字面量扫描恢复：prefixesFromDir 另给 classPrefixes，仅规则表一支（data_shape）不计；加 instance_name-45（代码写死 class_metal，必须报）；run.mjs 夹具前缀带 classPrefixes；criteria 经登记器。
- 问题.md 补 I-7 gap 项、envTempDomain 无值时 I-7/I-8/I-9 不运行。
- 全量 1001/1001，pre_commit pass。

## 未决

- 环境温度域（卷二十 Q-30）与 rules.items 首批值卷文没给：真实世界里物品物态、密度、体积、尺寸档、类别读出为未知。
- 实例与批次读法随 6-3；acceptsMaterial 候选条件校验挂 6-3、6-22。

## 命令与末行

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → ℹ tests 1001 / ℹ pass 1001 / ℹ fail 0
- `node tools/accept/run.mjs pre_commit` → "verdict": "pass"
