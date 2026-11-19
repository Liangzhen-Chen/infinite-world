# 6-1 未建派生五项 回报

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷三乙:571–:584、:617–:628、:296、:707–:722、:1310；卷三甲:185、:289、:345、:563；卷十五:174、:979；卷十二:785；李白 11-19 12:5x (a)–(d)、13:2x ①② |
| 2 | 没有按 id/名字/场景写特例 | 是 | 代码无 matcat_/subst_/mat_/comp_ 代号；分类、换算、下标、未建名都按表头、规则表、未建登记数据（dimensions-validate.mjs buildRuleIndexes、convertUnit、readUnbuiltNames） |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | rx.test 缺键/非代号下标/known 非读数均 E-MOD-RX；material.test 删条件、值不在族、列表缺、substance 空不命中、写错未建名、删未建名、未建名已入词表、未建名进派生式均报；删换算即 E-MOD-RX；detectors.test 只被未建派生引用、表头别处提到、写错键仍报 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 竹 0.25 照卷三甲:345；hydration=moisture÷1 逐行算；categories 对卷三乙 EXPECT 表 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | const_literal 0；param_consumed 回到基线 2（按 13:2x ① 改检测器口径，不改测试期望、不加白名单） |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 约 890 行（另两份勘误前快照）；卡文与续派授权外的必需接点：handles/patterns.mjs（词法收 `[` `]`）、load/vocab-load.mjs（conversions）、validate/rows.mjs（导出 valueOf）；检测器 decl_cmp.mjs、tools/accept/read.mjs、tests/accept/detectors.test.mjs 按 13:2x ① |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs：tests 747 pass 747 fail 0；node tools/accept/run.mjs pre_commit commit：verdict pass |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | materialView（6-2）可读 charYield、hydration、categories；hardness/toughness 缺数据不硬造，仍登记 |

勘误 1118k31：卷二（规则表值、map 下标、无关系原语 known、conversions、ruleIndex、未建名）；卷十二 A12-4.5 消费者口径补数据侧两类。

rules.materials 12 键谁读：charReaction ← charYield 派生式；charDecomposeMin、charHeatMin ← 炭质条件；fatMeltMax、fatHeatMin ← 蜡脂条件；volatileMin ← 蜡脂与挥发可燃物条件；grainMoistureMax、grainEnergyMin、grainPart、grainCarbMin、grainFamily ← 谷物条件；matcatRules ← categories 的 ruleIndex。没有只被 hardness/toughness 用的键，无需删。

supernatural：照卷三乙 :584 登条目与条件 member(comp_arcane, material.classes)；comp_arcane 照卷十五 :174、:979，登在 _unbuilt-derived.json names，求值按未命中。
