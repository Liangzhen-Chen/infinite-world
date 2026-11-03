# K16 R7 逐文件验收

每文件独立Node；TEMP/TMP=F:/dnd-tmp；至多两个测试进程。未完成不计通过。

|文件|结果|秒|摘要|
|---|---|---:|---|
|tests/a1-lt-scenarios.test.mjs|pass|50.703|ℹ pass 14 / ℹ fail 0|
|tests/a3-causal-chain.test.mjs|pass|4.057|ℹ pass 5 / ℹ fail 0|
|tests/a3-cost-mark.test.mjs|pass|9.388|ℹ pass 6 / ℹ fail 0|
|tests/a3-daily.test.mjs|pass|9.222|ℹ pass 17 / ℹ fail 0|
|tests/a3-derived-difficulty.test.mjs|pass|14.773|ℹ pass 11 / ℹ fail 0|
|tests/a3-marks.test.mjs|pass|15.23|ℹ pass 5 / ℹ fail 0|
|tests/a3-open-actions.test.mjs|pass|6.746|ℹ pass 7 / ℹ fail 0|
|tests/a3-owner-ding.test.mjs|pass|13.461|✖ N/O: fine settlement pays the public account through this fine’s on-duty office, with replay protection〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (62.5536ms) # TODO / ✖ N/O: absent, off-duty or unrelated office cannot collect public fines〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (61.8007ms) # TODO / ✖ N/O: full corpus fine proposal routes to the real public collection and emits only booked payment and settlement〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (78.1553ms) # TODO / ✖ O: the native snapshot writer books the existing collateral without relying on the corpus ledger rebuild〔前提待真实动作：给质押债权签入 1440 分钟宽限；归 A3 生产者卡〕 (67.2525ms) # TODO / ✖ O/P: historical delivery claim reads real damaged cargo and original handover links without replay or invented compensation〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (60.7783ms) # TODO / ✖ P/Q: the same new receipt retains source and review status across save and submission, with no second paper or premature verdict〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (56.4513ms) # TODO / ✖ Q: existing stages, judgment, appeal period and defendant persist without inventing charges or penalties〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (57.2294ms) # TODO / ✖ Q: unrelated judgments, forged registration and nonexistent parties are rejected without opening a new case〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (264.2225ms) # TODO / ✖ P/Q: legal requests consume native incidents, papers, cases and current offices without inventing outcomes〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (68.9172ms) # TODO / ✖ Q: ordinary law actions also read restored cases before demanding adjudication powers〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (63.7521ms) # TODO / ✖ P/Q: absent authority, private incidents, expired appeal, forged paper and unagreed defence remain rejected〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (686.4827ms) # TODO / ✖ P/Q: native legal requests survive real campaign export/import and replay〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (137.9381ms) # TODO / ✖ Q: an incapacitated incumbent cannot receive a new request or appear as a current handler〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (62.4167ms) # TODO / ✖ N–Q: the case, fine, paper and office premises of the combined corpus are loaded〔前提待真实动作：S5 能满足的柜台/存单/质押/维持债权已转正式用例；剩余 051/052/054/055/056/057/058/107 需在岗机构身份、已立案阶段、判决/罚款及原始证据纸本；归 S4〕 (59.0606ms) # TODO / ✖ N–Q: campaign export/import and reducer replay retain the fine claim and the case paper〔前提待真实动作：A3V2-054 罚款需在岗机构与已立案判决，A3V2-052 新收据纸本需机构案件阶段与原始证据文书；柜台/存单/质押/维持债权已转正式用例；归 S4〕 (120.7212ms) # TODO / ℹ pass 15 / ℹ fail 0 / ✖ failing tests: / ✖ N/O: fine settlement pays the public account through this fine’s on-duty office, with replay protection〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (62.5536ms) # TODO / ✖ N/O: absent, off-duty or unrelated office cannot collect public fines〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (61.8007ms) # TODO / ✖ N/O: full corpus fine proposal routes to the real public collection and emits only booked payment and settlement〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (78.1553ms) # TODO / ✖ O: the native snapshot writer books the existing collateral without relying on the corpus ledger rebuild〔前提待真实动作：给质押债权签入 1440 分钟宽限；归 A3 生产者卡〕 (67.2525ms) # TODO / ✖ O/P: historical delivery claim reads real damaged cargo and original handover links without replay or invented compensation〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (60.7783ms) # TODO / ✖ P/Q: the same new receipt retains source and review status across save and submission, with no second paper or premature verdict〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (56.4513ms) # TODO / ✖ Q: existing stages, judgment, appeal period and defendant persist without inventing charges or penalties〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (57.2294ms) # TODO / ✖ Q: unrelated judgments, forged registration and nonexistent parties are rejected without opening a new case〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (264.2225ms) # TODO / ✖ P/Q: legal requests consume native incidents, papers, cases and current offices without inventing outcomes〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (68.9172ms) # TODO / ✖ Q: ordinary law actions also read restored cases before demanding adjudication powers〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (63.7521ms) # TODO / ✖ P/Q: absent authority, private incidents, expired appeal, forged paper and unagreed defence remain rejected〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (686.4827ms) # TODO / ✖ P/Q: native legal requests survive real campaign export/import and replay〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (137.9381ms) # TODO / ✖ Q: an incapacitated incumbent cannot receive a new request or appear as a current handler〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (62.4167ms) # TODO / ✖ N–Q: the case, fine, paper and office premises of the combined corpus are loaded〔前提待真实动作：S5 能满足的柜台/存单/质押/维持债权已转正式用例；剩余 051/052/054/055/056/057/058/107 需在岗机构身份、已立案阶段、判决/罚款及原始证据纸本；归 S4〕 (59.0606ms) # TODO / ✖ N–Q: campaign export/import and reducer replay retain the fine claim and the case paper〔前提待真实动作：A3V2-054 罚款需在岗机构与已立案判决，A3V2-052 新收据纸本需机构案件阶段与原始证据文书；柜台/存单/质押/维持债权已转正式用例；归 S4〕 (120.7212ms) # TODO|
|tests/a3-owner2-G.test.mjs|pass|3.831|✖ G1: accepted public work enters the local source ledger once and is read without crediting again〔前提待真实动作：通过真实批准、施工、验收建立当地公共工程贡献来源；归 S4〕 (13.3422ms) # TODO / ✖ G3: pending application and ordinance retain source; inspection never approves or charges〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (60.4735ms) # TODO / ✖ G3: aggregate votes are preserved without invented electors, chair, majority charter or completed decision〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (62.2271ms) # TODO / ✖ G4: native transport inspection reads nine-day delay and actual damage without inventing a delivery claim or compensation〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (57.0844ms) # TODO / ✖ G4: invalid pawn ticket stays invalid and grants neither ownership nor redemption〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (53.2286ms) # TODO / ✖ G4: rent imports as rent, creditor waiver is local, unauthorised waiver fails; storage export/import and replay preserve source〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (48.4262ms) # TODO / ℹ pass 3 / ℹ fail 0 / ✖ failing tests: / ✖ G1: accepted public work enters the local source ledger once and is read without crediting again〔前提待真实动作：通过真实批准、施工、验收建立当地公共工程贡献来源；归 S4〕 (13.3422ms) # TODO / ✖ G3: pending application and ordinance retain source; inspection never approves or charges〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (60.4735ms) # TODO / ✖ G3: aggregate votes are preserved without invented electors, chair, majority charter or completed decision〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (62.2271ms) # TODO / ✖ G4: native transport inspection reads nine-day delay and actual damage without inventing a delivery claim or compensation〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (57.0844ms) # TODO / ✖ G4: invalid pawn ticket stays invalid and grants neither ownership nor redemption〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (53.2286ms) # TODO / ✖ G4: rent imports as rent, creditor waiver is local, unauthorised waiver fails; storage export/import and replay preserve source〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (48.4262ms) # TODO|
|tests/a3-owner2-R.test.mjs|pass|16.703|ℹ pass 17 / ℹ fail 0|
|tests/a3-owner2-T.test.mjs|pass|4.875|✖ T1: native absolute dates use real short/leap months and derive autumn darkness without an item〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (35.9646ms) # TODO / ✖ T4: native office derives one monthly quota; publish escrows real money and cancellation refunds without restoring quota〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (58.5935ms) # TODO / ✖ T4: forged powers/usage/escrow, absent office term, closed office and wrong-seat publishing fail〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (54.1893ms) # TODO / ✖ T4: a dedicated escrow expires through the real clock, refunds its owner and retains the failure and used quota〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (56.7373ms) # TODO / ✖ T1/T4: a native skipped leap month does not create another publishing allowance〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (56.5486ms) # TODO / ✖ T1–T4: real save/reopen/replay retains native clock, private task and paid prize exactly once〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (72.1661ms) # TODO / ℹ pass 6 / ℹ fail 0 / ✖ failing tests: / ✖ T1: native absolute dates use real short/leap months and derive autumn darkness without an item〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (35.9646ms) # TODO / ✖ T4: native office derives one monthly quota; publish escrows real money and cancellation refunds without restoring quota〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (58.5935ms) # TODO / ✖ T4: forged powers/usage/escrow, absent office term, closed office and wrong-seat publishing fail〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (54.1893ms) # TODO / ✖ T4: a dedicated escrow expires through the real clock, refunds its owner and retains the failure and used quota〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (56.7373ms) # TODO / ✖ T1/T4: a native skipped leap month does not create another publishing allowance〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (56.5486ms) # TODO / ✖ T1–T4: real save/reopen/replay retains native clock, private task and paid prize exactly once〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (72.1661ms) # TODO|
|tests/a3-precondition-receipt.test.mjs|pass|36.38|✖ A3 native legal 56: original premises submit only a request in routed and direct calls (60.6792ms) # TODO / ℹ pass 38 / ℹ fail 0 / ✖ failing tests: / ✖ A3 native legal 56: original premises submit only a request in routed and direct calls (60.6792ms) # TODO|
|tests/a3-prims-rites.test.mjs|pass|12.336|ℹ pass 15 / ℹ fail 0|
|tests/a3-producers.test.mjs|pass|7.689|ℹ pass 9 / ℹ fail 0|
|tests/a3-r13.test.mjs|pass|15.778|ℹ pass 8 / ℹ fail 0|
|tests/a3-r9-effects.test.mjs|pass|98.805|✖ R9: legal requests never prepay, appoint, accept or adjudicate without the recipient decision〔前提待真实动作：形成指定案件阶段、在岗机构身份及证据原件；归 S4〕 (79.5405ms) # TODO / ℹ pass 3 / ℹ fail 0 / ✖ failing tests: / ✖ R9: legal requests never prepay, appoint, accept or adjudicate without the recipient decision〔前提待真实动作：形成指定案件阶段、在岗机构身份及证据原件；归 S4〕 (79.5405ms) # TODO|
|tests/action-registry.test.mjs|pass|9.004|ℹ pass 7 / ℹ fail 0|
|tests/actions-catalog.test.mjs|pass|13.772|ℹ pass 4 / ℹ fail 0|
|tests/advance-registry.test.mjs|golden-review|41.963|✖ 对照：full存档推进结果可重放且与快照逐字节相同 (27745.1939ms) / ✖ 对照：quiet存档推进结果可重放且与快照逐字节相同 (11762.0129ms) / ℹ pass 3 / ℹ fail 2 / ✖ failing tests: / ✖ 对照：full存档推进结果可重放且与快照逐字节相同 (27745.1939ms) / ✖ 对照：quiet存档推进结果可重放且与快照逐字节相同 (11762.0129ms)|
|tests/arch-metrics.test.mjs|pass|0.656|ℹ pass 5 / ℹ fail 0|
|tests/contracts.test.mjs|pass|7.734|ℹ pass 4 / ℹ fail 0|
|tests/draw-water.test.mjs|pass|9.97|ℹ pass 9 / ℹ fail 0|
|tests/education.test.mjs|pass|33.607|ℹ pass 16 / ℹ fail 0|
|tests/engine.test.mjs|pass|26.447|ℹ pass 22 / ℹ fail 0|
|tests/entity-view.test.mjs|pass|2.153|ℹ pass 7 / ℹ fail 0|
|tests/forest-water.test.mjs|pass|8.791|ℹ pass 12 / ℹ fail 0|
|tests/invariants.test.mjs|pass|0.995|ℹ pass 1 / ℹ fail 0|
|tests/invariants/i01-conservation.test.mjs|pass|19.314|ℹ pass 2 / ℹ fail 0|
|tests/invariants/i02-non-negative.test.mjs|pass|18.643|ℹ pass 3 / ℹ fail 0|
|tests/invariants/i15-single-account.test.mjs|pass|12.246|ℹ pass 2 / ℹ fail 0|
|tests/invariants/i16-event-primary-write.test.mjs|pass|42.619|ℹ pass 2 / ℹ fail 0|
|tests/invariants/i31-total-order.test.mjs|pass|69.131|ℹ pass 18 / ℹ fail 0|
|tests/law-codes.test.mjs|pass|1.952|ℹ pass 6 / ℹ fail 0|
|tests/monster-society-content-t159.mjs|pass|65.577|ℹ pass 14 / ℹ fail 0|
|tests/monster-society-content-t162.mjs|pass|486.786|ℹ pass 7 / ℹ fail 0|
|tests/monster-society-content.test.mjs|pass|551.066|ℹ pass 33 / ℹ fail 0|
|tests/monster-society.test.mjs|pass|80.52|ℹ pass 11 / ℹ fail 0|
|tests/npc-life-family.test.mjs|pass|157.89|ℹ pass 7 / ℹ fail 0|
|tests/npc-life-health.test.mjs|pass|264.511|ℹ pass 7 / ℹ fail 0|
|tests/npc-life-migration.test.mjs|pass|208.645|ℹ pass 7 / ℹ fail 0|
|tests/npc-life-t164.test.mjs|pass|169.754|ℹ pass 8 / ℹ fail 0|
|tests/npc-memory.test.mjs|pass|9.0|ℹ pass 11 / ℹ fail 0|
|tests/npc-population.test.mjs|pass|2.073|ℹ pass 2 / ℹ fail 0|
|tests/npc-schedule.test.mjs|pass|116.65|ℹ pass 12 / ℹ fail 0|
|tests/perf-s5-cache.test.mjs|pass|1.723|ℹ pass 16 / ℹ fail 0|
|tests/plugin.test.mjs|pass|19.154|ℹ pass 7 / ℹ fail 0|
|tests/population-on-demand.test.mjs|pass|20.192|ℹ pass 6 / ℹ fail 0|
|tests/population-publication.test.mjs|pass|9.833|ℹ pass 6 / ℹ fail 0|
|tests/population-seeded.test.mjs|pass|3.207|ℹ pass 3 / ℹ fail 0|
|tests/record-index-check.test.mjs|pass|1520.794|ℹ pass 2 / ℹ fail 0|
|tests/remote-generation.test.mjs|baseline-failure|93.108|✖ 自动接入：派生商店与补货、交易事件、声望与立场传导、行政级别、传闻、路线与栖地接口 (10992.5798ms) / ℹ pass 4 / ℹ fail 1 / ✖ failing tests: / ✖ 自动接入：派生商店与补货、交易事件、声望与立场传导、行政级别、传闻、路线与栖地接口 (10992.5798ms)|
|tests/s5-law-business-lifecycle.test.mjs|pass|14.549|ℹ pass 13 / ℹ fail 0|
|tests/s5-law-delivery-capacity.test.mjs|pass|14.006|ℹ pass 10 / ℹ fail 0|
|tests/s5-law-disease-contact.test.mjs|pass|12.35|ℹ pass 7 / ℹ fail 0|
|tests/s5-law-household-budget.test.mjs|pass|6.136|ℹ pass 27 / ℹ fail 0|
|tests/s5-law-household-labor.test.mjs|pass|3.345|ℹ pass 16 / ℹ fail 0|
|tests/s5-law-household-meals.test.mjs|pass|7.199|ℹ pass 13 / ℹ fail 0|
|tests/s5-law-land-value.test.mjs|pass|10.079|ℹ pass 9 / ℹ fail 0|
|tests/s5-law-maintenance.test.mjs|pass|18.712|ℹ pass 13 / ℹ fail 0|
|tests/s5-law-periodic-market.test.mjs|pass|10.354|ℹ pass 22 / ℹ fail 0|
|tests/s5-law-procurement.test.mjs|pass|5.191|ℹ pass 10 / ℹ fail 0|
|tests/s5-law-production-inputs.test.mjs|pass|25.247|ℹ pass 10 / ℹ fail 0|
|tests/s5-law-public-maintenance.test.mjs|pass|163.205|ℹ pass 15 / ℹ fail 0|
|tests/s5-law-seasonal-credit.test.mjs|pass|11.375|ℹ pass 21 / ℹ fail 0|
|tests/s5-law-soak-report.test.mjs|pass|0.727|ℹ pass 6 / ℹ fail 0|
|tests/s5-law-soak.test.mjs|pass|86.989|ℹ pass 7 / ℹ fail 0|
|tests/s5-law-subsistence.test.mjs|pass|7.103|ℹ pass 38 / ℹ fail 0|
|tests/s5-law-tenancy-sharing.test.mjs|pass|418.883|ℹ pass 15 / ℹ fail 0|
|tests/s5-law-water-source.test.mjs|pass|3.696|ℹ pass 12 / ℹ fail 0|
|tests/save-roundtrip.test.mjs|pass|112.214|ℹ pass 6 / ℹ fail 0|
|tests/spell-research.test.mjs|pass|9.48|ℹ pass 7 / ℹ fail 0|
|tests/storage.test.mjs|pass|0.77|ℹ pass 16 / ℹ fail 0|

FIELDS：

|文件|exit|秒|timeout|摘要|
|---|---:|---:|---|---|
|tests/storage.test.mjs|0|0.705|False|ℹ pass 16 / ℹ fail 0|
|tests/education.test.mjs|0|198.29|False|ℹ pass 16 / ℹ fail 0|
|tests/record-index-check.test.mjs|1|2400.077|True||
|tests/npc-schedule.test.mjs|0|1298.084|False|ℹ pass 12 / ℹ fail 0|
|tests/entity-view.test.mjs|0|2.344|False|ℹ pass 7 / ℹ fail 0|
|tests/perf-s5-cache.test.mjs|0|3.642|False|ℹ pass 16 / ℹ fail 0|
|tests/s5-law-subsistence.test.mjs|0|15.043|False|ℹ pass 38 / ℹ fail 0|
|tests/s5-law-water-source.test.mjs|0|3.907|False|ℹ pass 12 / ℹ fail 0|
