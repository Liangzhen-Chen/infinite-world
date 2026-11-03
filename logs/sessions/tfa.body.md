TOWNFOOD 卡 A：城镇人口的粮食需求（共同规则见 s5law-common.md，设计见 F:/dnd/logs/arch/townfood/design.md 第 2 节和第 4 节“A人口”）。

## 背景
本树切自 t-k16@fc0c1dfa。K16 是家户自给（打水、采集），还没有合入 s5a，第九轮性能优化正在同时进行。白石镇骨架 1000 人：306 人、90 户已经实体化，另有 694 人、210 户待生成（world/design/w1-baishi-skeleton.mjs:78）。

现在只有实体户会吃饭；待生成的人口既不消费，也不形成需求，所以 30 日审计里城镇缺粮 721 户日，全部是“没有可买粮的货架”。产销链（TFB：food-supply.mjs、shop、transport）在另一条分支，已经能把粮运到柜台，但缺少买方需求。本卡负责需求这一侧。

## 要做
1. 未实体化人口按身体当量进入统计层，形成聚落级的消费与劳动收入账户。
   - 依据：npc-life.mjs:48 的成员餐和公粮抵私粮；登记户保留原路径不动。
   - 账户只存整数或有理数。
   - 不按户逐日写，新增持久量为 O(聚落统计账户)。
2. 统计人口的粮食需求通过 market.mjs 的读取（:152–178）进入集市与货架需求。
   - 物化转移份额：人口被生成为实体户时，统计账户按份额转出，两组不重计，也不凭空发钱发粮。
   - 现货和在途不重计（market.mjs:181）。
3. 统计人口挨饿是真实结果：买不到就记缺口，不补粮。
   - 缺口要能进入现有的饥饿或迁出规律，或已有的统计指标。
   - 如果找不到可接的现有规律，写明并交给主会话，不要新造。
4. 数值从既有表派生（W/rules/tables/balance/body.json:10 每日 60 饱食等），新字段尽量为零。新增规则须登记来源。

## 验收
- 新增 tests/food-demand.test.mjs，需求前提一律用真实游戏动作产生，覆盖：
  - 1000 = 306 + 694；
  - 物化前后守恒；
  - 非公仓消费；
  - 无逐户日写；
  - 买不到时记录真实缺口。
- 用 affected-tests2 生成清单。核心与相关测试在卡内跑，大清单交给关卡。必跑：
  - npc-life、household-budget、population、remote-generation、market 相关测试；
  - s5-law-household-meals、numeric-persistence、save-roundtrip、i31；
  - CORE 与同步四件套。
- 30 日审计：报告城镇统计人口的需求量与缺口。本卡没有供给侧，缺口大是预期结果，如实报数。
- 性能：30 日×2 对 t-k16@fc0c1dfa 三对中位 ≤1.05。
- 金快照字段表逐字段解释，不重生成金快照。
- 汇报 ≤300 字，写入 TFA-final.md。

## 文件所有权
- 可改：server-plugin/{npc-life,household-budget,population,remote-generation,market}.mjs、新增的 food-demand 相关模块与测试、相应规则表。
- 不得改：household-subsistence、water-cycle、npc-state、npc-schedule、education-state（K16 第九轮正在改）；food-supply、agriculture、shop、transport、advance-registry（归 TFB）。
- 确需改动不得改的文件时，停下写明理由交主会话。
