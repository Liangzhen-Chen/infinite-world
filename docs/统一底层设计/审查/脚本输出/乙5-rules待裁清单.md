# 乙-1/乙-4 补 1115y6：待裁清单（脚本生成，勿手改；按李白 11-15 16:55 裁定改完后的现行卷文重新生成，替代 1115y5 的版本）

- 现行卷文里落点对象仍是 rules、待裁、待补的迁移行：4 行；其中 rules 0 行、待裁 3 行、待补 1 行。
- 16:55 裁定的 15 行已全部落点（改写记录见 审查/脚本输出/乙6-改写记录.md）。

| 迁移行 | 卷 | 对象 | 落点（原文） | 为什么 | 候选 |
|---|---|---|---|---|---|
| M2-10a | 卷二 | 待裁 | applyChainLaws 一个函数同时做据点储量与再生规划、拜师需求、价格底线 | 一个函数 applyChainLaws 分属卷五（据点储量与再生规划）、卷十四（拜师需求）、卷六（价格底线，卷六 M6-29、M6-30 已定删旧价），对上多个系统；16:55 裁定没有涉及 | 候选 sys.place（再生与储量）、sys.profession（拜师）、sys.economy（价格底线）；或拆三个子行 |
| M2-10b | 卷二 | 待裁 | 居留、公民资格的天数、费用、贡献与工程点数等常数 | civicRules 居留与公民资格常数，各卷没有登记对应的 rules.* 键；16:55 裁定没有涉及 | 候选 rules.civic（需先由卷八登记）；或 sys.org |
| M2-12b | 卷二 | 待裁 | tools/（离线组，卷二 §2.9 进程表） | 繁简转换移到 tools/（离线组），离线组不在卷二 §2.9 登记的非规则组里，对象写不出；16:55 裁定没有涉及 | 候选 content-scripts（离线模块组键，卷二 §2.7）；需李白确认繁简转换算不算内容构建脚本 |
| M11-7 | 卷十一 | 待补 | C11-7 | 李白 16:55 第四条：照旧待补，不算迁移处置，不进计数 | 无 |

## M14-82 对照里对不上的项（李白第二条：每个子行写"旧字段 → 新键名"，对不上列给李白）

| 子行 | 旧键 | 已取对象 | 对不上的旧字段 |
|---|---|---|---|
| M14-82a | practice | rules.profession | dailyCaps、stageSize、maximum、repeatMultiplier（练习增量上限与阶段）；§2.5 rules.profession 只有 kinds、lapseDays、tierByRelAge、params 等，没有同义键 |
| M14-82b | levels | rules.growth | initial（初始属性总和与上下限）、experience；levels 的 maximum、freeAttributePoints 可对 levelThresholds、attrPointsPerLevel |
| M14-82c | education | rules.learning | minimumAge、maximumAge、examinations（各地课业名单，是只对一地成立的数据行） |
| M14-82d | training | rules.learning | institutions 的机构、教师、门规、入门费、仪式（数据行）；旧内容里没有"教师肯不肯教"字段，没有拆 rules.teach 子行 |
| M14-82e | books | rules.learning | grades 五档、minimumLiteracy；readingMinutes 可对 carrierLevelCurve；旧内容里没有考证书费用，没有拆 rules.cert 子行 |
| M14-82f | npcGrowth | rules.growth | 旧字段是日后升级成长（每日教学与工作增量），不是初始技能，故取 rules.growth；maximumGain、maximumProficiency、minimumPractice、switchCooldownDays、teach、work 在 growth 键里没有同义键，vocations 是只对一地成立的名单 |
