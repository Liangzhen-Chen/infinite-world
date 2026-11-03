# K16 验收状态

affected-tests2：.base=9729614a，WORKTREE，深度0，共247文件；按超过120文件的新口径，卡内必须跑62文件，其余交主会话合并关卡。

正式验收各文件独立node进程、双路运行，TEMP/TMP=F:/dnd-tmp，仅保留摘要。临时诊断误载测试曾短时超并发，已停止且不计验收，详交接。TODO保留且不算失败；取消、超时和局部诊断不计通过。

|文件|状态|耗时秒|证据|
|---|---|---:|---|
|tests/a1-lt-scenarios.test.mjs|通过|102.85|required-r5 # pass 14；# fail 0|
|tests/a3-causal-chain.test.mjs|通过|4.17|required-r5 # pass 5；# fail 0|
|tests/a3-cost-mark.test.mjs|通过|13.91|required-r5 # pass 6；# fail 0|
|tests/a3-daily.test.mjs|通过|10.13|required-r5 # pass 17；# fail 0|
|tests/a3-derived-difficulty.test.mjs|通过|25.42|required-r5 # pass 11；# fail 0|
|tests/a3-marks.test.mjs|通过|17.73|required-r5 # pass 5；# fail 0|
|tests/a3-open-actions.test.mjs|通过|11.15|required-r5 # pass 7；# fail 0|
|tests/a3-owner-ding.test.mjs|通过|17.63|gate-r8 # pass 15；# fail 0|
|tests/a3-owner2-G.test.mjs|通过|3.97|fixes-r7 # pass 3；# fail 0|
|tests/a3-owner2-R.test.mjs|通过|22.84|fixes-r7 # pass 17；# fail 0|
|tests/a3-owner2-T.test.mjs|通过|5.76|fixes-r7 # pass 6；# fail 0|
|tests/a3-precondition-receipt.test.mjs|通过|86.98|fixes-r7 # pass 38；# fail 0|
|tests/a3-prims-rites.test.mjs|通过|15.41|fixes-r7 # pass 15；# fail 0|
|tests/a3-producers.test.mjs|通过|9.5|fixes-r7 # pass 9；# fail 0|
|tests/a3-r13.test.mjs|通过|38.58|required-r5 # pass 8；# fail 0|
|tests/a3-r9-effects.test.mjs|通过|1633.68|required-r5 # pass 3；# fail 0|
|tests/action-registry.test.mjs|通过|11.16|fixes-r10 # pass 7；# fail 0|
|tests/actions-catalog.test.mjs|通过|15.51|fixes-r10 # pass 4；# fail 0|
|tests/advance-registry.test.mjs|2项金快照差异，3项运行断言通过|158.45|balanced-r13 not ok 2 - 对照：full存档推进结果可重放且与快照逐字节相同；not ok 3 - 对照：quiet存档推进结果可重放且与快照逐字节相同；# pass 3；# fail 2|
|tests/arch-metrics.test.mjs|通过|0.71|fixes-r10 # pass 5；# fail 0|
|tests/education.test.mjs|通过|215.7|gate-r9 # pass 10；# fail 0|
|tests/engine.test.mjs|通过|50.32|fixes-r10 # pass 22；# fail 0|
|tests/entity-view.test.mjs|通过|2.46|fixes-r10 # pass 7；# fail 0|
|tests/forest-water.test.mjs|通过|20.67|required-r5 # pass 12；# fail 0|
|tests/invariants.test.mjs|通过|0.91|required-r5 # pass 1；# fail 0|
|tests/invariants/i01-conservation.test.mjs|通过|93.77|required-r5 # pass 2；# fail 0|
|tests/invariants/i02-non-negative.test.mjs|通过|67.45|required-r5 # pass 3；# fail 0|
|tests/invariants/i15-single-account.test.mjs|通过|57.0|required-r5 # pass 2；# fail 0|
|tests/invariants/i16-event-primary-write.test.mjs|通过|160.94|required-r5 # pass 2；# fail 0|
|tests/invariants/i31-total-order.test.mjs|通过|276.83|fixes-r10 # pass 18；# fail 0|
|tests/law-codes.test.mjs|通过|1.67|required-r5 # pass 6；# fail 0|
|tests/monster-society-content.test.mjs|超时或取消，不计通过|1241.06|balanced-r13 |
|tests/monster-society.test.mjs|通过|535.95|fixes-r10 # pass 11；# fail 0|
|tests/npc-life-family.test.mjs|通过|568.42|fixes-r10 # pass 7；# fail 0|
|tests/npc-life-health.test.mjs|通过|892.85|required-r5 # pass 7；# fail 0|
|tests/npc-life-migration.test.mjs|通过|586.3|fixes-r10 # pass 7；# fail 0|
|tests/npc-life-t164.test.mjs|失败|676.49|fixes-r10 not ok 7 - 名册家人在照护、离世、迁居需要时进入状态：配偶照护并继承，家人随迁，议事资格按当前户籍；# pass 7；# fail 1|
|tests/npc-schedule.test.mjs|失败|523.65|remaining-r11 not ok 11 - 正式人物整月与逐日等待一致，中间作息不膨胀存档补丁；# pass 11；# fail 1|
|tests/perf-s5-cache.test.mjs|通过|0.79|balanced-r13 # pass 13；# fail 0|
|tests/plugin.test.mjs|通过|27.17|fixes-r10 # pass 7；# fail 0|
|tests/record-index-check.test.mjs|超时或取消，不计通过|0.4|fixes-r10 |
|tests/remote-generation.test.mjs|基线同败：自动接入（同名子测）|267.17|required-r5 not ok 3 - 自动接入：派生商店与补货、交易事件、声望与立场传导、行政级别、传闻、路线与栖地接口；# pass 4；# fail 1|
|tests/s5-law-business-lifecycle.test.mjs|通过|18.36|required-r5 # pass 13；# fail 0|
|tests/s5-law-delivery-capacity.test.mjs|通过|20.64|required-r5 # pass 10；# fail 0|
|tests/s5-law-disease-contact.test.mjs|通过|32.2|required-r5 # pass 7；# fail 0|
|tests/s5-law-household-budget.test.mjs|通过|9.74|required-r5 # pass 27；# fail 0|
|tests/s5-law-household-labor.test.mjs|通过|3.57|required-r5 # pass 16；# fail 0|
|tests/s5-law-household-meals.test.mjs|通过|10.76|balanced-r13 # pass 13；# fail 0|
|tests/s5-law-land-value.test.mjs|通过|42.68|required-r5 # pass 9；# fail 0|
|tests/s5-law-maintenance.test.mjs|通过|36.55|required-r5 # pass 13；# fail 0|
|tests/s5-law-periodic-market.test.mjs|通过|16.94|required-r5 # pass 22；# fail 0|
|tests/s5-law-procurement.test.mjs|通过|6.41|required-r5 # pass 10；# fail 0|
|tests/s5-law-production-inputs.test.mjs|通过|38.67|remaining-r11 # pass 10；# fail 0|
|tests/s5-law-public-maintenance.test.mjs|通过|240.25|required-r5 # pass 15；# fail 0|
|tests/s5-law-seasonal-credit.test.mjs|通过|58.8|required-r5 # pass 21；# fail 0|
|tests/s5-law-soak-report.test.mjs|通过|0.95|required-r5 # pass 6；# fail 0|
|tests/s5-law-soak.test.mjs|通过|166.66|balanced-r13 # pass 7；# fail 0|
|tests/s5-law-subsistence.test.mjs|通过|9.6|final-r14 # pass 18；# fail 0|
|tests/s5-law-tenancy-sharing.test.mjs|通过|704.73|remaining-r11 # pass 15；# fail 0|
|tests/s5-law-water-source.test.mjs|通过|4.2|balanced-r13 # pass 8；# fail 0|
|tests/save-roundtrip.test.mjs|通过|787.29|fixes-r10 # pass 6；# fail 0|
|tests/storage.test.mjs|通过|0.99|fixes-r10 # pass 14；# fail 0|

分类：{"通过": 56, "失败": 2, "超时或取消，不计通过": 2, "2项金快照差异，3项运行断言通过": 1, "基线同败：自动接入（同名子测）": 1}

entity-view、record-index-check、perf-s5-cache强制FIELDS_INDEX_CHECK=1；npc-schedule在fixes-r10为FIELDS=1，在remaining-r11为普通完整运行，不能用后者替代FIELDS验证。同步先export-actions，再actions-catalog/action-registry/advance-registry/arch-metrics。金快照未重生成。

正式世界的长短步比较、家庭、I31、存档、T159/T162保留生计；各个固定班次/工时/财产手算夹具的隔离依据见对应diff注释。
