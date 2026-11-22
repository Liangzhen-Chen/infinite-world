## 自查表

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷四 :127–:170（物种维度与校验栏）、:196–:202（身体图不变量）、:285–:287（tissue、body_part、taxon 条目字段）、:305（rules.attr.bounds）、:461（comp_sapient）、:559–:565、:614–:616、:660、:901、:1463（M4-50）；李白裁定 :1672–:1699 与 11-22 16:04 P-15～P-17 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 只加数据行与词表条目；校验器、加载器、规则层代码未改 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | packSize 0 不写（distribution、域 [1,10000] 拒 0），写 null；coolingC 没放宽必填，按"未建列"登记（登记项只许 ASCII 卡号，故写 vol21_calibration）；引用不存在的物种仍被拒（tests/kernel/species-human.test.mjs 倒数第二条） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | species-human.test.mjs 的期望值是数据列字面量与卷文手算（节段比 497+81+88+12+322=1000、组织份额 100、bounds [0,99]），没有抄计数 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 无规则层代码改动；只改测试夹具（见 6） |
| 6 | 只改了卡文列出的文件；diff 共 2331 行增、7 行删（16 个文件，主要是勘误快照整份拷贝约 1870 行；对基线 128acf446） | 否（有必需的接点扩展） | 卡文列出的数据文件之外：world/rules/registry.json 与新增 world/rules/tables/attr.json（rules.attr.bounds 的登记，M4-50）；_vocab.json 加 comp_sapient（李白 11-22 16:04 批准）；_unbuilt-derived.json 加 coolingC 列（P-16）；测试夹具 tests/kernel/body-world.mjs、perceive-world.mjs（真实世界现带人类行，夹具自带词表与物种行，默认先把 tissue、body_part、taxon 族与 species、body_plan 两张表的真实行还原成空，f.realHuman 为真才保留；没放宽任何校验）；卷四勘误 1124k60 与快照 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | 见本文末"验收命令" |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 世界里有了人类物种行与人形身体图，person 行能引用 species，下一张"试玩地区人物载入"卡可以开；暂定值全部标"暂定·待试玩标定"并引裁定，没有抄卷四示例数 |
| 9 | 前置数据行是否已存在：本卡读写依赖的数据行、组件类、规则表逐项查过存在（列文件:行） | 否（有缺，按李白裁定补了） | 不存在：comp_sapient（_vocab.json component 族，前任报告说有是错的，李白 16:04 批准补登）、rules.attr 表（新建）、body_part/tissue/taxon 条目（新建）。存在：mat_flesh（material.json:9123）、mat_bone（:4124）、mat_fat（:8525）、mat_rawhide（:15818）、diet_omnivore、sex/gait/attr/capability 族条目 |

## 结果

人类物种行 species_human、身体图 body_humanoid、tissue 五条、body_part 八条、taxon 三条、comp_sapient、rules.attr.bounds [0, 99] 落进真实世界，真实世界加载成功、无错误。rules.attr.bounds 迁自旧数据 world/rules/tables/balance/attributes.json（snapshot-20261010 标签里没有，从 Git 标签 old-final-1117 用 git show 读），上限 attr.cap.human 99，下限 0 取同文件 attr.mod 曲线首节点。coolingC 登为归卷二十一标定的未建列。勘误 1124k60（mat_hide 改 mat_rawhide）已追加，快照 版本快照/卷四-v10-勘误前-1124k60.md。

## 出处、暂定、缺口

- 有出处：maturityYears、寿命均值、diet 与 dietShares、承载与代谢倍率、睡眠时数、组织到材料映射、节段质量比（Dempster/Winter 表 4.1，经 BMClab 文件）、taxon 链。
- 摘要级、李白 P-14 认可：步速（Bohannon 1997）、体温（Mackowiak 1992）、双胎率（Monden 2021）、性别比区间（Chao 2019）。
- 暂定·待试玩标定 14 项（逐项见 docs/问题.md「暂定值待李白核」）；缺口见同节（共用 mat_flesh、coolingC、senses 等未建列）。

## 偏离

- 命令纪律：全量测试第一次用了输出重定向到 F:/dnd-tmp/sp-full.out；探测与拷贝脚本写在 F:/dnd-tmp（sp-load.mjs、sp-copy.mjs）；勘误快照用 node 拷贝（内容与原卷字节相同）。
- 没派 DeepSeek：数据量小，每项都要逐项核出处。
- 联网只试了一次 ICRP 89 的组织质量表，PMC 被浏览器验证拦住，没读到。
- 第一轮全量测试暴露夹具与真实人类行冲突（21 个失败）。根因：夹具往词表族加条目，而 death.mjs 与 body.mjs 遍历组织份额映射时不跳 null 键。已改夹具，没动规则层。这个遍历不跳 null 的问题，将来真实组织族再加条目时会露出，记在此处。

## 验收命令

- `node --test --test-concurrency=3 tests/kernel/*.test.mjs tests/accept/*.test.mjs` → tests 2062、pass 2062、fail 0。
- `node tools/accept/run.mjs pre_commit`（不带 --write）→ verdict pass。
- `node tools/convert-geo-g5b.mjs --check` → 退出码 0。
