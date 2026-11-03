# K16 R6 验收

每个文件各一条node --test --test-isolation=none，使用共享PID门控，最多3个Node/2个测试进程，测试输出仅过滤摘要，失败只留单用例最后30行。所有Node的TEMP/TMP=F:/dnd-tmp。未删除/跳过测试、未放宽断言；A3原TODO保留，不记作实际断言通过。

受影响清单255，卡内必验72（含清单外额外验收8个），剩余191交主会话合并门禁（K16-r6-remaining-tests.txt）。卡内普通模式已通过69文件，非零退出3文件：["tests/advance-registry.test.mjs", "tests/monster-society-content.test.mjs", "tests/remote-generation.test.mjs"]。未变化模块的已通过证据直接复用；日程、教育、本轮源模块及CORE/同步件为最终状态复验。

|文件|摘要|秒|结果|
|---|---|---:|---|
|tests/a1-lt-scenarios.test.mjs|# pass 14 / # fail 0|53.39|通过|
|tests/a3-causal-chain.test.mjs|# pass 5 / # fail 0|4.36|通过|
|tests/a3-cost-mark.test.mjs|# pass 6 / # fail 0|9.57|通过|
|tests/a3-daily.test.mjs|# pass 17 / # fail 0|9.42|通过|
|tests/a3-derived-difficulty.test.mjs|# pass 11 / # fail 0|14.86|通过|
|tests/a3-marks.test.mjs|# pass 5 / # fail 0|15.97|通过|
|tests/a3-open-actions.test.mjs|# pass 7 / # fail 0|7.08|通过|
|tests/a3-owner-ding.test.mjs|# pass 15 / # fail 0|13.33|通过|
|tests/a3-owner2-G.test.mjs|# pass 3 / # fail 0|4.1|通过|
|tests/a3-owner2-R.test.mjs|# pass 17 / # fail 0|17.62|通过|
|tests/a3-owner2-T.test.mjs|# pass 6 / # fail 0|4.99|通过|
|tests/a3-precondition-receipt.test.mjs|# pass 38 / # fail 0|38.83|通过|
|tests/a3-prims-rites.test.mjs|# pass 15 / # fail 0|13.24|通过|
|tests/a3-producers.test.mjs|# pass 9 / # fail 0|8.32|通过|
|tests/a3-r13.test.mjs|# pass 8 / # fail 0|15.94|通过|
|tests/a3-r9-effects.test.mjs|# pass 3 / # fail 0|109.21|通过|
|tests/action-registry.test.mjs|# pass 7 / # fail 0|8.48|通过|
|tests/actions-catalog.test.mjs|# pass 4 / # fail 0|12.29|通过|
|tests/advance-registry.test.mjs|# pass 3 / # fail 2|47.22|仅full/quiet金快照2处变化，见字段表，未重生成|
|tests/arch-metrics.test.mjs|# pass 5 / # fail 0|0.63|通过|
|tests/contracts.test.mjs|# pass 4 / # fail 0|7.74|通过|
|tests/draw-water.test.mjs|# pass 9 / # fail 0|9.57|通过|
|tests/education.test.mjs|# pass 14 / # fail 0|35.65|通过|
|tests/engine.test.mjs|# pass 22 / # fail 0|25.89|通过|
|tests/entity-view.test.mjs|# pass 7 / # fail 0|2.1|通过|
|tests/forest-water.test.mjs|# pass 12 / # fail 0|8.7|通过|
|tests/invariants.test.mjs|# pass 1 / # fail 0|0.87|通过|
|tests/invariants/i01-conservation.test.mjs|# pass 2 / # fail 0|19.09|通过|
|tests/invariants/i02-non-negative.test.mjs|# pass 3 / # fail 0|18.45|通过|
|tests/invariants/i15-single-account.test.mjs|# pass 2 / # fail 0|12.46|通过|
|tests/invariants/i16-event-primary-write.test.mjs|# pass 2 / # fail 0|43.43|通过|
|tests/invariants/i31-total-order.test.mjs|# pass 18 / # fail 0|74.44|通过|
|tests/law-codes.test.mjs|# pass 6 / # fail 0|1.92|通过|
|tests/monster-society-content-t159.mjs|# pass 14 / # fail 0|72.19|通过|
|tests/monster-society-content-t162.mjs|# pass 7 / # fail 0|574.15|通过|
|tests/monster-society-content.test.mjs||377.99|三项夹具失败已修，定向3/3通过；最终完整复验因卡片时限未完成，需主会话补跑|
|tests/monster-society.test.mjs|# pass 11 / # fail 0|79.35|通过|
|tests/npc-life-family.test.mjs|# pass 7 / # fail 0|166.57|通过|
|tests/npc-life-health.test.mjs|# pass 7 / # fail 0|304.77|通过|
|tests/npc-life-migration.test.mjs|# pass 7 / # fail 0|235.48|通过|
|tests/npc-life-t164.test.mjs|# pass 8 / # fail 0|190.09|通过|
|tests/npc-memory.test.mjs|# pass 11 / # fail 0|8.5|通过|
|tests/npc-population.test.mjs|# pass 2 / # fail 0|1.98|通过|
|tests/npc-schedule.test.mjs|# pass 12 / # fail 0|126.01|通过|
|tests/perf-s5-cache.test.mjs|# pass 16 / # fail 0|1.72|通过|
|tests/plugin.test.mjs|# pass 7 / # fail 0|18.45|通过|
|tests/population-on-demand.test.mjs|# pass 6 / # fail 0|19.89|通过|
|tests/population-publication.test.mjs|# pass 6 / # fail 0|10.43|通过|
|tests/population-seeded.test.mjs|# pass 3 / # fail 0|3.14|通过|
|tests/record-index-check.test.mjs|# pass 2 / # fail 0|1843.58|通过|
|tests/remote-generation.test.mjs|# pass 4 / # fail 1|91.99|基线同名第3子测既有失败：carrier restock 0；其余通过|
|tests/s5-law-business-lifecycle.test.mjs|# pass 13 / # fail 0|14.38|通过|
|tests/s5-law-delivery-capacity.test.mjs|# pass 10 / # fail 0|14.08|通过|
|tests/s5-law-disease-contact.test.mjs|# pass 7 / # fail 0|12.12|通过|
|tests/s5-law-household-budget.test.mjs|# pass 27 / # fail 0|5.99|通过|
|tests/s5-law-household-labor.test.mjs|# pass 16 / # fail 0|3.27|通过|
|tests/s5-law-household-meals.test.mjs|# pass 13 / # fail 0|6.93|通过|
|tests/s5-law-land-value.test.mjs|# pass 9 / # fail 0|10.3|通过|
|tests/s5-law-maintenance.test.mjs|# pass 13 / # fail 0|18.4|通过|
|tests/s5-law-periodic-market.test.mjs|# pass 22 / # fail 0|12.45|通过|
|tests/s5-law-procurement.test.mjs|# pass 10 / # fail 0|5.51|通过|
|tests/s5-law-production-inputs.test.mjs|# pass 10 / # fail 0|25.97|通过|
|tests/s5-law-public-maintenance.test.mjs|# pass 15 / # fail 0|158.92|通过|
|tests/s5-law-seasonal-credit.test.mjs|# pass 21 / # fail 0|10.74|通过|
|tests/s5-law-soak-report.test.mjs|# pass 6 / # fail 0|0.81|通过|
|tests/s5-law-soak.test.mjs|# pass 7 / # fail 0|89.1|通过|
|tests/s5-law-subsistence.test.mjs|# pass 38 / # fail 0|7.0|通过|
|tests/s5-law-tenancy-sharing.test.mjs|# pass 15 / # fail 0|412.74|通过|
|tests/s5-law-water-source.test.mjs|# pass 12 / # fail 0|3.44|通过|
|tests/save-roundtrip.test.mjs|# pass 6 / # fail 0|108.2|通过|
|tests/spell-research.test.mjs|# pass 7 / # fail 0|9.08|通过|
|tests/storage.test.mjs|# pass 14 / # fail 0|0.75|通过|

## FIELDS_INDEX_CHECK=1

|文件|摘要|秒|结果|
|---|---|---:|---|
|tests/education.test.mjs|# pass 14 / # fail 0|190.02|通过|
|tests/s5-law-water-source.test.mjs|# pass 12 / # fail 0|3.68|通过|
|tests/s5-law-subsistence.test.mjs|# pass 38 / # fail 0|14.53|通过|
|tests/record-index-check.test.mjs||2400.06|40分钟未完成，交主会话沙箱外补跑|
|tests/npc-schedule.test.mjs|# pass 12 / # fail 0|1308.34|通过|
|tests/perf-s5-cache.test.mjs|# pass 16 / # fail 0|1.72|通过|
|tests/entity-view.test.mjs|# pass 7 / # fail 0|2.15|通过|

新增教育在场测试手算：仅60分钟出席，minutes=60、completedMinutes=0、熟练度=0；原测试误把未满120分钟课时写为已完成60，现新增明确待完成/已完成双断言，未削弱“恰好一次出席”的原意。

怪物夹具依据：at辅助函数先完成玩家真实步行，再安装本用例声明的具名成员位置及相同localUntil水位并移除旧行程；手动落座议事同样安装一致水位，防止局部补算重放到夹具快照之前。守卫/议事两个用例明确提供相关家户一日已有口粮，数量由householdMealPlan.needs和item_ration营养派生（5口×60/30=10份），只确立在岗前提；潜入发现、指定守卫、敌对立场、许可、议事通过的原断言全部保留。T159第一项只需快照水位；其余两项补齐值守家户口粮前提。修后定向3/3通过，不能冒充完整33项复验通过。

新增源模块手算：30去程+80采集+30返程=140分钟，08:00→10:20；真实阶段截止与全局12:00边界分开。预约/睡眠间隔、夜行商人长采集段、读时补齐身体/存读档一致性均保留严格断言。

record-index-check若40分钟超时不作通过。npc-schedule整月深比较、I31、t164、family、save-roundtrip、T162的结果逐文件如上。金快照/numeric-digest状态hash变化见逐字段表，数学函数hash不变。
