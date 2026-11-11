# K16 R8 逐文件验收

每文件一个独立Node，--test-isolation=none；TEMP/TMP=F:/dnd-tmp；至多两个测试进程。正式测试输出只保留规定摘要；失败详情只看单个用例最后30行。单用例详情不计作整文件验收。

受影响49文件；与R7全部必验/未完成范围合并为88文件。结果：{"baseline-fail": 4, "outside-40min": 1, "outside-EPERM": 1, "pass": 82}。

|文件|结果|秒|FIELDS|摘要|
|---|---|---:|---|---|
|tests/a1-lt-scenarios.test.mjs|pass|48.574|False|ℹ pass 14 / ℹ fail 0|
|tests/a3-causal-chain.test.mjs|pass|4.101|False|ℹ pass 5 / ℹ fail 0|
|tests/a3-cost-mark.test.mjs|pass|8.777|False|ℹ pass 6 / ℹ fail 0|
|tests/a3-daily.test.mjs|pass|9.233|False|ℹ pass 17 / ℹ fail 0|
|tests/a3-derived-difficulty.test.mjs|pass|13.8|False|ℹ pass 11 / ℹ fail 0|
|tests/a3-intent-proposal.test.mjs|pass|13.052|False|ℹ pass 9 / ℹ fail 0|
|tests/a3-marks.test.mjs|pass|15.341|False|ℹ pass 5 / ℹ fail 0|
|tests/a3-open-actions.test.mjs|pass|6.42|False|ℹ pass 7 / ℹ fail 0|
|tests/a3-owner-ding.test.mjs|pass|13.68|False|ℹ pass 15 / ℹ fail 0|
|tests/a3-owner2-G.test.mjs|pass|4.774|False|ℹ pass 4 / ℹ fail 0|
|tests/a3-owner2-R.test.mjs|pass|16.8|False|ℹ pass 17 / ℹ fail 0|
|tests/a3-owner2-T.test.mjs|pass|4.901|False|ℹ pass 6 / ℹ fail 0|
|tests/a3-precondition-receipt.test.mjs|pass|36.775|False|ℹ pass 38 / ℹ fail 0|
|tests/a3-prims-rites.test.mjs|pass|11.924|False|ℹ pass 15 / ℹ fail 0|
|tests/a3-producers.test.mjs|pass|7.493|False|ℹ pass 9 / ℹ fail 0|
|tests/a3-r13.test.mjs|pass|14.451|False|ℹ pass 8 / ℹ fail 0|
|tests/a3-r9-effects.test.mjs|pass|97.881|False|ℹ pass 3 / ℹ fail 0|
|tests/action-registry.test.mjs|pass|8.516|False|ℹ pass 7 / ℹ fail 0|
|tests/actions-catalog.test.mjs|pass|13.224|False|ℹ pass 4 / ℹ fail 0|
|tests/advance-registry.test.mjs|baseline-fail|37.676|False|ℹ pass 3 / ℹ fail 2|
|tests/arch-metrics.test.mjs|pass|0.663|False|ℹ pass 5 / ℹ fail 0|
|tests/contracts.test.mjs|pass|7.235|False|ℹ pass 4 / ℹ fail 0|
|tests/data-coverage.test.mjs|pass|7.972|False|ℹ pass 8 / ℹ fail 0|
|tests/draw-water.test.mjs|pass|9.827|False|ℹ pass 9 / ℹ fail 0|
|tests/education.test.mjs|pass|200.004|True|ℹ pass 16 / ℹ fail 0|
|tests/engine.test.mjs|pass|24.171|False|ℹ pass 22 / ℹ fail 0|
|tests/entity-view.test.mjs|pass|2.194|True|ℹ pass 7 / ℹ fail 0|
|tests/forest-water.test.mjs|pass|9.448|True|ℹ pass 13 / ℹ fail 0|
|tests/habitat-derivation.test.mjs|pass|953.667|True|ℹ pass 6 / ℹ fail 0|
|tests/invariants.test.mjs|pass|1.052|False|ℹ pass 1 / ℹ fail 0|
|tests/invariants/i01-conservation.test.mjs|pass|18.822|False|ℹ pass 2 / ℹ fail 0|
|tests/invariants/i02-non-negative.test.mjs|pass|19.015|False|ℹ pass 3 / ℹ fail 0|
|tests/invariants/i15-single-account.test.mjs|pass|11.959|False|ℹ pass 2 / ℹ fail 0|
|tests/invariants/i16-event-primary-write.test.mjs|pass|40.421|False|ℹ pass 2 / ℹ fail 0|
|tests/invariants/i31-total-order.test.mjs|pass|63.933|False|ℹ pass 18 / ℹ fail 0|
|tests/law-codes.test.mjs|pass|1.952|False|ℹ pass 6 / ℹ fail 0|
|tests/monster-society-content-t159.mjs|pass|62.012|False|ℹ pass 14 / ℹ fail 0|
|tests/monster-society-content-t162.mjs|pass|463.423|False|ℹ pass 7 / ℹ fail 0|
|tests/monster-society-content.test.mjs|pass|494.267|False|ℹ pass 33 / ℹ fail 0|
|tests/monster-society.test.mjs|pass|73.142|False|ℹ pass 11 / ℹ fail 0|
|tests/npc-life-family.test.mjs|pass|150.168|False|ℹ pass 7 / ℹ fail 0|
|tests/npc-life-health.test.mjs|pass|242.196|False|ℹ pass 7 / ℹ fail 0|
|tests/npc-life-migration.test.mjs|pass|186.329|False|ℹ pass 7 / ℹ fail 0|
|tests/npc-life-t164.test.mjs|pass|150.348|False|ℹ pass 8 / ℹ fail 0|
|tests/npc-memory.test.mjs|pass|8.438|False|ℹ pass 11 / ℹ fail 0|
|tests/npc-population.test.mjs|pass|2.078|False|ℹ pass 2 / ℹ fail 0|
|tests/npc-schedule.test.mjs|pass|102.396|False|ℹ pass 12 / ℹ fail 0|
|tests/numeric-persistence.test.mjs|baseline-fail|15.255|False|ℹ pass 0 / ℹ fail 1|
|tests/ontology.test.mjs|pass|0.789|False|ℹ pass 5 / ℹ fail 0|
|tests/overfit-guard.test.mjs|outside-EPERM|18.745|False|ℹ pass 2 / ℹ fail 2|
|tests/perf-s5-cache.test.mjs|pass|1.729|True|ℹ pass 16 / ℹ fail 0|
|tests/plugin.test.mjs|pass|17.847|False|ℹ pass 7 / ℹ fail 0|
|tests/population-on-demand.test.mjs|pass|18.981|False|ℹ pass 6 / ℹ fail 0|
|tests/population-publication.test.mjs|pass|9.739|False|ℹ pass 6 / ℹ fail 0|
|tests/population-seeded.test.mjs|pass|3.09|False|ℹ pass 3 / ℹ fail 0|
|tests/quest-sources.test.mjs|baseline-fail|14.59|False|ℹ pass 7 / ℹ fail 1|
|tests/record-index-check.test.mjs|outside-40min|2400.091|True||
|tests/remote-generation.test.mjs|pass|80.951|False|ℹ pass 5 / ℹ fail 0|
|tests/reputation-law.test.mjs|pass|8.811|False|ℹ pass 9 / ℹ fail 0|
|tests/s4-layout.test.mjs|pass|4.379|False|ℹ pass 9 / ℹ fail 0|
|tests/s4-perception.test.mjs|pass|8.933|False|ℹ pass 11 / ℹ fail 0|
|tests/s5-07.test.mjs|pass|15.531|False|ℹ pass 19 / ℹ fail 0|
|tests/s5-09.test.mjs|pass|114.828|False|ℹ pass 18 / ℹ fail 0|
|tests/s5-law-business-lifecycle.test.mjs|pass|14.088|False|ℹ pass 13 / ℹ fail 0|
|tests/s5-law-delivery-capacity.test.mjs|pass|15.997|False|ℹ pass 12 / ℹ fail 0|
|tests/s5-law-disease-contact.test.mjs|pass|11.448|False|ℹ pass 7 / ℹ fail 0|
|tests/s5-law-household-budget.test.mjs|pass|5.947|False|ℹ pass 27 / ℹ fail 0|
|tests/s5-law-household-labor.test.mjs|pass|3.289|False|ℹ pass 16 / ℹ fail 0|
|tests/s5-law-household-meals.test.mjs|pass|7.097|False|ℹ pass 13 / ℹ fail 0|
|tests/s5-law-land-value.test.mjs|pass|9.957|False|ℹ pass 9 / ℹ fail 0|
|tests/s5-law-maintenance.test.mjs|pass|18.443|False|ℹ pass 13 / ℹ fail 0|
|tests/s5-law-periodic-market.test.mjs|pass|8.808|False|ℹ pass 24 / ℹ fail 0|
|tests/s5-law-procurement.test.mjs|pass|5.065|False|ℹ pass 10 / ℹ fail 0|
|tests/s5-law-production-inputs.test.mjs|pass|24.484|False|ℹ pass 10 / ℹ fail 0|
|tests/s5-law-public-maintenance.test.mjs|pass|130.373|False|ℹ pass 15 / ℹ fail 0|
|tests/s5-law-seasonal-credit.test.mjs|pass|10.817|False|ℹ pass 21 / ℹ fail 0|
|tests/s5-law-soak-report.test.mjs|pass|0.786|False|ℹ pass 6 / ℹ fail 0|
|tests/s5-law-soak.test.mjs|pass|84.552|False|ℹ pass 7 / ℹ fail 0|
|tests/s5-law-subsistence.test.mjs|pass|14.807|True|ℹ pass 38 / ℹ fail 0|
|tests/s5-law-tenancy-sharing.test.mjs|pass|392.596|False|ℹ pass 15 / ℹ fail 0|
|tests/s5-law-water-source.test.mjs|pass|4.878|True|ℹ pass 12 / ℹ fail 0|
|tests/s5-playthrough.test.mjs|baseline-fail|8.952|False|ℹ pass 0 / ℹ fail 1|
|tests/save-roundtrip.test.mjs|pass|101.733|False|ℹ pass 6 / ℹ fail 0|
|tests/spell-research.test.mjs|pass|8.51|False|ℹ pass 7 / ℹ fail 0|
|tests/storage.test.mjs|pass|0.746|False|ℹ pass 16 / ℹ fail 0|
|tests/w3-journey.test.mjs|pass|7.468|False|ℹ pass 5 / ℹ fail 0|
|tests/weather.test.mjs|pass|29.897|False|ℹ pass 10 / ℹ fail 0|
|tests/works.test.mjs|pass|8.036|False|ℹ pass 8 / ℹ fail 0|

## FIELDS检查

完整日程FIELDS在相同静态目录/晨间共享读取实现上通过。随后只撤回未形成稳定收益的额外路线前沿缓存，补跑普通整月日程、I31、家庭、存读档、T164、T162和CORE，并再次对水源/觅食/水域模块跑FIELDS。

|文件|退出码|秒|超时|摘要|
|---|---:|---:|---|---|
|tests/education.test.mjs|0|200.004|False|ℹ pass 16 / ℹ fail 0|
|tests/entity-view.test.mjs|0|2.194|False|ℹ pass 7 / ℹ fail 0|
|tests/forest-water.test.mjs|0|9.448|False|ℹ pass 13 / ℹ fail 0|
|tests/habitat-derivation.test.mjs|0|953.667|False|ℹ pass 6 / ℹ fail 0|
|tests/npc-schedule.test.mjs|0|1247.573|False|ℹ pass 12 / ℹ fail 0|
|tests/perf-s5-cache.test.mjs|0|1.729|False|ℹ pass 16 / ℹ fail 0|
|tests/record-index-check.test.mjs|1|2400.091|True||
|tests/s5-law-subsistence.test.mjs|0|14.807|False|ℹ pass 38 / ℹ fail 0|
|tests/s5-law-water-source.test.mjs|0|4.878|False|ℹ pass 12 / ℹ fail 0|
|tests/storage.test.mjs|0|0.732|False|ℹ pass 16 / ℹ fail 0|

基线复跑使用2414a6b8的三个开工前原始模块，独立Node加载；其余生产代码/世界数据和相应失败测试均未修改。advance-registry、numeric-persistence、quest-sources、s5-playthrough的失败子测名逐项相同，详见JSON中的baselineSame。

overfit的子进程git show被沙箱EPERM拒绝，独立只读探针已记录error=EPERM/status=null；须主会话外跑。record-index-check的FIELDS运行2400.091秒达到40分钟上限，未完成，不计通过；只结束了本会话已记录PID56796。

numeric-persistence命中records.agriculture.lastReport.pestDamageAddedMaxPercent，值在开工前已存在；s5a后续0faa9d14已将该字段有理数化，本树按本卡指定6907af37基线未合该后续提交。quest-sources:174为旧K15补货数组锚点，前面的任务超期、托管清零和退款断言通过；本轮不改市场/商店或放宽断言。s5-playthrough:67在集日11点期待行商原始位置loc_hw，实际为null；开工基线同样失败，需主会话核对生计出行与实际交易时窗。
