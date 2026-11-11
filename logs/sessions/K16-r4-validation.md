# K16 r4 验收

逐文件独立Node进程；每个文件的普通/FIELDS摘要和进程时长见JSON。仅保留摘要与单失败用例尾30行。

影响清单253文件；卡内64文件，合并关卡另跑192文件。

|文件|状态|普通秒|FIELDS秒|
|---|---|---:|---:|
|tests/a1-lt-scenarios.test.mjs|通过|48.06||
|tests/a3-causal-chain.test.mjs|通过|4.0||
|tests/a3-cost-mark.test.mjs|通过|8.99||
|tests/a3-daily.test.mjs|通过|9.79||
|tests/a3-derived-difficulty.test.mjs|通过|12.13||
|tests/a3-marks.test.mjs|通过|14.2||
|tests/a3-open-actions.test.mjs|通过|7.25||
|tests/a3-owner-ding.test.mjs|通过|14.88||
|tests/a3-owner2-G.test.mjs|通过|3.76||
|tests/a3-owner2-R.test.mjs|通过|17.77||
|tests/a3-owner2-T.test.mjs|通过|4.82||
|tests/a3-precondition-receipt.test.mjs|通过|53.12||
|tests/a3-prims-rites.test.mjs|通过|12.54||
|tests/a3-producers.test.mjs|通过|7.47||
|tests/a3-r13.test.mjs|通过|22.42||
|tests/a3-r9-effects.test.mjs|通过|104.49||
|tests/action-registry.test.mjs|通过|5.8||
|tests/actions-catalog.test.mjs|通过|11.6||
|tests/advance-registry.test.mjs|仅两项金快照差异，待主会话审核|75.95||
|tests/arch-metrics.test.mjs|通过|0.79||
|tests/contracts.test.mjs|通过|6.54||
|tests/education.test.mjs|通过|47.07|2400.08|
|tests/engine.test.mjs|通过|18.86||
|tests/entity-view.test.mjs|通过||2.08|
|tests/forest-water.test.mjs|通过|14.26||
|tests/invariants.test.mjs|通过|0.96||
|tests/invariants/i01-conservation.test.mjs|通过|46.67||
|tests/invariants/i02-non-negative.test.mjs|通过|37.45||
|tests/invariants/i15-single-account.test.mjs|通过|28.71||
|tests/invariants/i16-event-primary-write.test.mjs|通过|81.33||
|tests/invariants/i31-total-order.test.mjs|通过|121.1||
|tests/law-codes.test.mjs|通过|1.86||
|tests/monster-society-content.test.mjs|通过|1201.8||
|tests/monster-society.test.mjs|通过|222.19||
|tests/npc-life-family.test.mjs|通过|338.59||
|tests/npc-life-health.test.mjs|通过|615.17||
|tests/npc-life-migration.test.mjs|通过|347.48||
|tests/npc-life-t164.test.mjs|通过|335.61||
|tests/npc-memory.test.mjs|通过|8.76||
|tests/npc-schedule.test.mjs|通过|268.36||
|tests/perf-s5-cache.test.mjs|通过||1.72|
|tests/plugin.test.mjs|通过|16.07||
|tests/record-index-check.test.mjs|超40分钟，外跑||2400.07|
|tests/remote-generation.test.mjs|基线同名失败（沿用r2核对）|117.49||
|tests/s5-law-business-lifecycle.test.mjs|通过|13.13||
|tests/s5-law-delivery-capacity.test.mjs|通过|13.49||
|tests/s5-law-disease-contact.test.mjs|通过|21.49||
|tests/s5-law-household-budget.test.mjs|通过|6.0||
|tests/s5-law-household-labor.test.mjs|通过|3.5||
|tests/s5-law-household-meals.test.mjs|通过|7.08||
|tests/s5-law-land-value.test.mjs|通过|11.33||
|tests/s5-law-maintenance.test.mjs|通过|18.56||
|tests/s5-law-periodic-market.test.mjs|通过|11.2||
|tests/s5-law-procurement.test.mjs|通过|5.01||
|tests/s5-law-production-inputs.test.mjs|通过|26.29||
|tests/s5-law-public-maintenance.test.mjs|通过|157.31||
|tests/s5-law-seasonal-credit.test.mjs|通过|11.17||
|tests/s5-law-soak-report.test.mjs|通过|0.81||
|tests/s5-law-soak.test.mjs|通过|104.36||
|tests/s5-law-subsistence.test.mjs|通过||176.22|
|tests/s5-law-tenancy-sharing.test.mjs|通过|423.32||
|tests/s5-law-water-source.test.mjs|通过||3.51|
|tests/save-roundtrip.test.mjs|通过|343.8||
|tests/storage.test.mjs|通过|0.77||

advance-registry若只有原两项full/quiet金差异：运行时检查仍须通过；完整旧→新与原因见K16-golden-table.md（12297项，本轮相对r3为0新增）。未重生成金快照。

remote-generation仅在失败子测名逐项与r2既有9729614a基线证据相同时登记基线同败；未重新运行未变化的基线。

FIELDS新增缓存机制在perf-s5-cache和两项生计文件完整运行；education普通文件仍须完整通过。FIELDS全文件超40分钟单列外跑，不算通过。
