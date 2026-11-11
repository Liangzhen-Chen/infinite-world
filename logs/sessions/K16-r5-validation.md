# K16 R5 验收

影响清单253文件，卡内64文件，其余192文件交主会话合并关卡。每文件独立node --test --test-isolation=none；TEMP/TMP=F:/dnd-tmp。只保留摘要与单失败尾30行，不读取完整测试输出。已有TODO保留，进程exit0不把TODO断言称为实际通过。完整逐次记录K16-r5-results.jsonl；诊断preload运行不算正式验收。

|文件|状态|普通秒|FIELDS秒|
|---|---|---:|---:|
|tests/a1-lt-scenarios.test.mjs|通过|51.19||
|tests/a3-causal-chain.test.mjs|通过|4.24||
|tests/a3-cost-mark.test.mjs|通过|9.6||
|tests/a3-daily.test.mjs|通过|9.34||
|tests/a3-derived-difficulty.test.mjs|通过|14.67||
|tests/a3-marks.test.mjs|通过|15.22||
|tests/a3-open-actions.test.mjs|通过|7.0||
|tests/a3-owner-ding.test.mjs|通过|14.0||
|tests/a3-owner2-G.test.mjs|通过|3.89||
|tests/a3-owner2-R.test.mjs|通过|17.32||
|tests/a3-owner2-T.test.mjs|通过|4.87||
|tests/a3-precondition-receipt.test.mjs|通过|38.82||
|tests/a3-prims-rites.test.mjs|通过|12.54||
|tests/a3-producers.test.mjs|通过|8.04||
|tests/a3-r13.test.mjs|通过|18.23||
|tests/a3-r9-effects.test.mjs|通过|101.88||
|tests/action-registry.test.mjs|通过|8.49||
|tests/actions-catalog.test.mjs|通过|11.84||
|tests/advance-registry.test.mjs|仅两项金差异，待审核|50.69||
|tests/arch-metrics.test.mjs|通过|0.71||
|tests/contracts.test.mjs|通过|7.84||
|tests/education.test.mjs|通过|37.39|202.38|
|tests/engine.test.mjs|通过|26.52||
|tests/entity-view.test.mjs|通过|2.18|2.19|
|tests/forest-water.test.mjs|通过|8.44||
|tests/invariants.test.mjs|通过|0.93||
|tests/invariants/i01-conservation.test.mjs|通过|20.42||
|tests/invariants/i02-non-negative.test.mjs|通过|19.86||
|tests/invariants/i15-single-account.test.mjs|通过|12.61||
|tests/invariants/i16-event-primary-write.test.mjs|通过|47.24||
|tests/invariants/i31-total-order.test.mjs|通过|84.72||
|tests/law-codes.test.mjs|通过|1.92||
|tests/monster-society-content.test.mjs|通过|734.63||
|tests/monster-society.test.mjs|通过|104.67||
|tests/npc-life-family.test.mjs|通过|215.24||
|tests/npc-life-health.test.mjs|通过|362.7||
|tests/npc-life-migration.test.mjs|通过|258.76||
|tests/npc-life-t164.test.mjs|通过|211.11||
|tests/npc-memory.test.mjs|通过|8.68||
|tests/npc-schedule.test.mjs|通过|153.39||
|tests/perf-s5-cache.test.mjs|通过||1.76|
|tests/plugin.test.mjs|通过|20.18||
|tests/record-index-check.test.mjs|超40分钟，外跑||2400.09|
|tests/remote-generation.test.mjs|基线同名失败|94.65||
|tests/s5-law-business-lifecycle.test.mjs|通过|14.61||
|tests/s5-law-delivery-capacity.test.mjs|通过|13.9||
|tests/s5-law-disease-contact.test.mjs|通过|13.32||
|tests/s5-law-household-budget.test.mjs|通过|6.04||
|tests/s5-law-household-labor.test.mjs|通过|3.31||
|tests/s5-law-household-meals.test.mjs|通过|7.29||
|tests/s5-law-land-value.test.mjs|通过|10.11||
|tests/s5-law-maintenance.test.mjs|通过|19.18||
|tests/s5-law-periodic-market.test.mjs|通过|10.73||
|tests/s5-law-procurement.test.mjs|通过|5.64||
|tests/s5-law-production-inputs.test.mjs|通过|25.58||
|tests/s5-law-public-maintenance.test.mjs|通过|154.65||
|tests/s5-law-seasonal-credit.test.mjs|通过|10.89||
|tests/s5-law-soak-report.test.mjs|通过|0.83||
|tests/s5-law-soak.test.mjs|通过|89.01||
|tests/s5-law-subsistence.test.mjs|通过|6.2|14.17|
|tests/s5-law-tenancy-sharing.test.mjs|通过|406.45||
|tests/s5-law-water-source.test.mjs|通过|3.59|3.58|
|tests/save-roundtrip.test.mjs|通过|115.94||
|tests/storage.test.mjs|通过|0.83||

remote-generation若同名失败，沿用9729614a已核对基线，按子测名比对R4，不将整文件同败等同于无回归。advance只容许full/quiet两项金差异，运行时仍须全过。金快照未重生成，逐字段旧→新及原因见K16-golden-table.md/fields.json。

完整FIELDS外跑/未通过：[{"file": "tests/record-index-check.test.mjs", "seconds": 2400.09, "timeout": true, "failures": []}]
