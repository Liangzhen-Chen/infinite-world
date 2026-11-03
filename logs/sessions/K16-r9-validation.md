# K16 R9 逐文件验收

基线fc0c1dfa；affected-tests2 WORKTREE深度0选择58文件，与R8必验范围合并为105文件。每文件独立Node，--test-isolation=none，TEMP/TMP=F:/dnd-tmp；至多两个测试进程。输出只保留规定摘要；单个失败用例仅保留最后30行。export-actions先完成，再跑同步四件套。

本轮只改household-subsistence的晨间共享/步行邻接、npc-state的纯作息覆盖及活跃时段短路，新增一项保留工时边界与日内患病语义的生计测试；原38项断言未删改。npc-schedule试验已完全撤回。docs/actions.json由规定导出命令更新5处原基线失同步行号。TFA锁定模块及禁区未触及。

结果：{"pass": 100, "baseline-fail": 3, "outside-EPERM": 1, "outside-known-40min": 1}。

|文件|结果|秒|FIELDS|摘要|
|---|---|---:|---|---|
|tests/a1-lt-scenarios.test.mjs|pass|55.703|False|ℹ pass 14 / ℹ fail 0|
|tests/a2-dialogue.test.mjs|pass|37.987|False|ℹ pass 8 / ℹ fail 0|
|tests/a3-causal-chain.test.mjs|pass|4.896|False|ℹ pass 5 / ℹ fail 0|
|tests/a3-cost-mark.test.mjs|pass|9.379|False|ℹ pass 6 / ℹ fail 0|
|tests/a3-daily.test.mjs|pass|9.785|False|ℹ pass 17 / ℹ fail 0|
|tests/a3-derived-difficulty.test.mjs|pass|18.371|False|ℹ pass 11 / ℹ fail 0|
|tests/a3-intent-proposal.test.mjs|pass|15.259|False|ℹ pass 9 / ℹ fail 0|
|tests/a3-marks.test.mjs|pass|19.138|False|ℹ pass 5 / ℹ fail 0|
|tests/a3-open-actions.test.mjs|pass|6.48|False|ℹ pass 7 / ℹ fail 0|
|tests/a3-owner-ding.test.mjs|pass|19.227|False|✖ N/O: fine settlement pays the public account through this fine’s on-duty office, with replay protection〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (90.8669ms) # TODO / ✖ N/O: absent, off-duty or unrelated office cannot collect public fines〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (89.0242ms) # TODO / ✖ N/O: full corpus fine proposal routes to the real public collection and emits only booked payment and settlement〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (113.5271ms) # TODO / ✖ O: the native snapshot writer books the existing collateral without relying on the corpus ledger rebuild〔前提待真实动作：给质押债权签入 1440 分钟宽限；归 A3 生产者卡〕 (95.9034ms) # TODO / ✖ O/P: historical delivery claim reads real damaged cargo and original handover links without replay or invented compensation〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (88.3602ms) # TODO / ✖ P/Q: the same new receipt retains source and review status across save and submission, with no second paper or premature verdict〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (81.59ms) # TODO / ✖ Q: existing stages, judgment, appeal period and defendant persist without inventing charges or penalties〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (90.5241ms) # TODO / ✖ Q: unrelated judgments, forged registration and nonexistent parties are rejected without opening a new case〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (439.564ms) # TODO / ✖ P/Q: legal requests consume native incidents, papers, cases and current offices without inventing outcomes〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (114.1891ms) # TODO / ✖ Q: ordinary law actions also read restored cases before demanding adjudication powers〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (93.6172ms) # TODO / ✖ P/Q: absent authority, private incidents, expired appeal, forged paper and unagreed defence remain rejected〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (1076.5787ms) # TODO / ✖ P/Q: native legal requests survive real campaign export/import and replay〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (234.265ms) # TODO / ✖ Q: an incapacitated incumbent cannot receive a new request or appear as a current handler〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (86.6736ms) # TODO / ✖ N–Q: the case, fine, paper and office premises of the combined corpus are loaded〔前提待真实动作：S5 能满足的柜台/存单/质押/维持债权已转正式用例；剩余 051/052/054/055/056/057/058/107 需在岗机构身份、已立案阶段、判决/罚款及原始证据纸本；归 S4〕 (67.8255ms) # TODO / ✖ N–Q: campaign export/import and reducer replay retain the fine claim and the case paper〔前提待真实动作：A3V2-054 罚款需在岗机构与已立案判决，A3V2-052 新收据纸本需机构案件阶段与原始证据文书；柜台/存单/质押/维持债权已转正式用例；归 S4〕 (143.2453ms) # TODO / ℹ pass 15 / ℹ fail 0 / ✖ failing tests: / ✖ N/O: fine settlement pays the public account through this fine’s on-duty office, with replay protection〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (90.8669ms) # TODO / ✖ N/O: absent, off-duty or unrelated office cannot collect public fines〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (89.0242ms) # TODO / ✖ N/O: full corpus fine proposal routes to the real public collection and emits only booked payment and settlement〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (113.5271ms) # TODO / ✖ O: the native snapshot writer books the existing collateral without relying on the corpus ledger rebuild〔前提待真实动作：给质押债权签入 1440 分钟宽限；归 A3 生产者卡〕 (95.9034ms) # TODO / ✖ O/P: historical delivery claim reads real damaged cargo and original handover links without replay or invented compensation〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (88.3602ms) # TODO / ✖ P/Q: the same new receipt retains source and review status across save and submission, with no second paper or premature verdict〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (81.59ms) # TODO / ✖ Q: existing stages, judgment, appeal period and defendant persist without inventing charges or penalties〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (90.5241ms) # TODO / ✖ Q: unrelated judgments, forged registration and nonexistent parties are rejected without opening a new case〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (439.564ms) # TODO / ✖ P/Q: legal requests consume native incidents, papers, cases and current offices without inventing outcomes〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (114.1891ms) # TODO / ✖ Q: ordinary law actions also read restored cases before demanding adjudication powers〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (93.6172ms) # TODO / ✖ P/Q: absent authority, private incidents, expired appeal, forged paper and unagreed defence remain rejected〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (1076.5787ms) # TODO / ✖ P/Q: native legal requests survive real campaign export/import and replay〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (234.265ms) # TODO / ✖ Q: an incapacitated incumbent cannot receive a new request or appear as a current handler〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕 (86.6736ms) # TODO / ✖ N–Q: the case, fine, paper and office premises of the combined corpus are loaded〔前提待真实动作：S5 能满足的柜台/存单/质押/维持债权已转正式用例；剩余 051/052/054/055/056/057/058/107 需在岗机构身份、已立案阶段、判决/罚款及原始证据纸本；归 S4〕 (67.8255ms) # TODO / ✖ N–Q: campaign export/import and reducer replay retain the fine claim and the case paper〔前提待真实动作：A3V2-054 罚款需在岗机构与已立案判决，A3V2-052 新收据纸本需机构案件阶段与原始证据文书；柜台/存单/质押/维持债权已转正式用例；归 S4〕 (143.2453ms) # TODO|
|tests/a3-owner-yi.test.mjs|pass|54.326|False|ℹ pass 12 / ℹ fail 0|
|tests/a3-owner2-G.test.mjs|pass|6.396|False|✖ G1: accepted public work enters the local source ledger once and is read without crediting again〔前提待真实动作：通过真实批准、施工、验收建立当地公共工程贡献来源；归 S4〕 (12.8473ms) # TODO / ✖ G3: pending application and ordinance retain source; inspection never approves or charges〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (66.286ms) # TODO / ✖ G3: aggregate votes are preserved without invented electors, chair, majority charter or completed decision〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (72.0546ms) # TODO / ✖ G4: native transport inspection reads nine-day delay and actual damage without inventing a delivery claim or compensation〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (97.0832ms) # TODO / ✖ G4: invalid pawn ticket stays invalid and grants neither ownership nor redemption〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (90.8028ms) # TODO / ℹ pass 4 / ℹ fail 0 / ✖ failing tests: / ✖ G1: accepted public work enters the local source ledger once and is read without crediting again〔前提待真实动作：通过真实批准、施工、验收建立当地公共工程贡献来源；归 S4〕 (12.8473ms) # TODO / ✖ G3: pending application and ordinance retain source; inspection never approves or charges〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (66.286ms) # TODO / ✖ G3: aggregate votes are preserved without invented electors, chair, majority charter or completed decision〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (72.0546ms) # TODO / ✖ G4: native transport inspection reads nine-day delay and actual damage without inventing a delivery claim or compensation〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (97.0832ms) # TODO / ✖ G4: invalid pawn ticket stays invalid and grants neither ownership nor redemption〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕 (90.8028ms) # TODO|
|tests/a3-owner2-R.test.mjs|pass|26.487|False|ℹ pass 17 / ℹ fail 0|
|tests/a3-owner2-T.test.mjs|pass|6.251|False|✖ T1: native absolute dates use real short/leap months and derive autumn darkness without an item〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (39.4636ms) # TODO / ✖ T4: native office derives one monthly quota; publish escrows real money and cancellation refunds without restoring quota〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (95.1728ms) # TODO / ✖ T4: forged powers/usage/escrow, absent office term, closed office and wrong-seat publishing fail〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (95.0454ms) # TODO / ✖ T4: a dedicated escrow expires through the real clock, refunds its owner and retains the failure and used quota〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (88.2117ms) # TODO / ✖ T1/T4: a native skipped leap month does not create another publishing allowance〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (86.6975ms) # TODO / ✖ T1–T4: real save/reopen/replay retains native clock, private task and paid prize exactly once〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (117.6121ms) # TODO / ℹ pass 6 / ℹ fail 0 / ✖ failing tests: / ✖ T1: native absolute dates use real short/leap months and derive autumn darkness without an item〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (39.4636ms) # TODO / ✖ T4: native office derives one monthly quota; publish escrows real money and cancellation refunds without restoring quota〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (95.1728ms) # TODO / ✖ T4: forged powers/usage/escrow, absent office term, closed office and wrong-seat publishing fail〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (95.0454ms) # TODO / ✖ T4: a dedicated escrow expires through the real clock, refunds its owner and retains the failure and used quota〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (88.2117ms) # TODO / ✖ T1/T4: a native skipped leap month does not create another publishing allowance〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (86.6975ms) # TODO / ✖ T1–T4: real save/reopen/replay retains native clock, private task and paid prize exactly once〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕 (117.6121ms) # TODO|
|tests/a3-precondition-receipt.test.mjs|pass|58.624|False|✖ A3 native legal 56: original premises submit only a request in routed and direct calls〔归 S4：机构案件与货损原件前提；登记 docs/A3-后续阶段登记.md S5CT CT01〕 (103.5453ms) # TODO / ℹ pass 38 / ℹ fail 0 / ✖ failing tests: / ✖ A3 native legal 56: original premises submit only a request in routed and direct calls〔归 S4：机构案件与货损原件前提；登记 docs/A3-后续阶段登记.md S5CT CT01〕 (103.5453ms) # TODO|
|tests/a3-prims-rites.test.mjs|pass|18.448|False|ℹ pass 15 / ℹ fail 0|
|tests/a3-producers.test.mjs|pass|11.366|False|ℹ pass 9 / ℹ fail 0|
|tests/a3-r13.test.mjs|pass|21.88|False|ℹ pass 8 / ℹ fail 0|
|tests/a3-r9-effects.test.mjs|pass|152.272|False|✖ R9: legal requests never prepay, appoint, accept or adjudicate without the recipient decision〔前提待真实动作：形成指定案件阶段、在岗机构身份及证据原件；归 S4〕 (84.7013ms) # TODO / ℹ pass 3 / ℹ fail 0 / ✖ failing tests: / ✖ R9: legal requests never prepay, appoint, accept or adjudicate without the recipient decision〔前提待真实动作：形成指定案件阶段、在岗机构身份及证据原件；归 S4〕 (84.7013ms) # TODO|
|tests/a3-setup-institutions.test.mjs|pass|16.975|False|✖ obligations: native old fines and delivery claims preserve claims without fresh funding; overpaid/unresolved-source snapshots are rejected〔前提待真实动作：A3V2-054 需镇巡值房在岗机构身份与已立案判决（白石章程无裁判权），A3V2-056 需在岗机构与已签收货损文书；二者均属机构/案件阶段；归 S4〕 (75.3856ms) # TODO / ℹ pass 17 / ℹ fail 0 / ✖ failing tests: / ✖ obligations: native old fines and delivery claims preserve claims without fresh funding; overpaid/unresolved-source snapshots are rejected〔前提待真实动作：A3V2-054 需镇巡值房在岗机构身份与已立案判决（白石章程无裁判权），A3V2-056 需在岗机构与已签收货损文书；二者均属机构/案件阶段；归 S4〕 (75.3856ms) # TODO|
|tests/action-registry.test.mjs|pass|10.861|False|ℹ pass 7 / ℹ fail 0|
|tests/actions-catalog.test.mjs|pass|15.693|False|ℹ pass 4 / ℹ fail 0|
|tests/advance-registry.test.mjs|baseline-fail|57.657|False|✖ 对照：full存档推进结果可重放且与快照逐字节相同 (40193.7388ms) / ✖ 对照：quiet存档推进结果可重放且与快照逐字节相同 (14740.6378ms) / ℹ pass 3 / ℹ fail 2 / ✖ failing tests: / ✖ 对照：full存档推进结果可重放且与快照逐字节相同 (40193.7388ms) / ✖ 对照：quiet存档推进结果可重放且与快照逐字节相同 (14740.6378ms)|
|tests/arch-metrics.test.mjs|pass|0.662|False|ℹ pass 5 / ℹ fail 0|
|tests/combat.test.mjs|pass|3.51|False|ℹ pass 4 / ℹ fail 0|
|tests/contracts.test.mjs|pass|10.007|False|ℹ pass 4 / ℹ fail 0|
|tests/data-coverage.test.mjs|pass|11.839|False|ℹ pass 8 / ℹ fail 0|
|tests/draw-water.test.mjs|pass|11.082|False|ℹ pass 9 / ℹ fail 0|
|tests/education.test.mjs|pass|311.388|True|ℹ pass 16 / ℹ fail 0|
|tests/engine.test.mjs|pass|34.532|False|ℹ pass 22 / ℹ fail 0|
|tests/entity-life.test.mjs|pass|8.235|False|ℹ pass 12 / ℹ fail 0|
|tests/entity-view.test.mjs|pass|2.47|True|ℹ pass 7 / ℹ fail 0|
|tests/family-politics.test.mjs|pass|10.65|False|ℹ pass 19 / ℹ fail 0|
|tests/finance-assets.test.mjs|pass|20.026|False|ℹ pass 12 / ℹ fail 0|
|tests/forest-water.test.mjs|pass|12.414|False|ℹ pass 13 / ℹ fail 0|
|tests/habitat-derivation.test.mjs|pass|124.383|False|ℹ pass 6 / ℹ fail 0|
|tests/invariants.test.mjs|pass|1.031|False|ℹ pass 1 / ℹ fail 0|
|tests/invariants/i01-conservation.test.mjs|pass|30.725|False|ℹ pass 2 / ℹ fail 0|
|tests/invariants/i02-non-negative.test.mjs|pass|28.889|False|ℹ pass 3 / ℹ fail 0|
|tests/invariants/i15-single-account.test.mjs|pass|17.878|False|ℹ pass 2 / ℹ fail 0|
|tests/invariants/i16-event-primary-write.test.mjs|pass|64.85|False|ℹ pass 2 / ℹ fail 0|
|tests/invariants/i31-total-order.test.mjs|pass|94.977|False|ℹ pass 18 / ℹ fail 0|
|tests/labor-market.test.mjs|pass|10.043|False|ℹ pass 16 / ℹ fail 0|
|tests/law-codes.test.mjs|pass|2.058|False|ℹ pass 6 / ℹ fail 0|
|tests/law.test.mjs|pass|100.258|False|ℹ pass 16 / ℹ fail 0|
|tests/m3-narrative-regressions.test.mjs|pass|34.795|False|ℹ pass 14 / ℹ fail 0|
|tests/magic-area.test.mjs|pass|9.589|False|ℹ pass 12 / ℹ fail 0|
|tests/magic-status.test.mjs|pass|290.616|False|ℹ pass 5 / ℹ fail 0|
|tests/magic.test.mjs|pass|9.454|False|ℹ pass 6 / ℹ fail 0|
|tests/military.test.mjs|pass|22.422|False|ℹ pass 6 / ℹ fail 0|
|tests/monster-society-content-t159.mjs|pass|94.71|False|ℹ pass 14 / ℹ fail 0|
|tests/monster-society-content-t162.mjs|pass|571.065|False|ℹ pass 7 / ℹ fail 0|
|tests/monster-society-content.test.mjs|pass|818.878|False|ℹ pass 33 / ℹ fail 0|
|tests/monster-society.test.mjs|pass|113.895|False|ℹ pass 11 / ℹ fail 0|
|tests/npc-growth.test.mjs|pass|25.66|False|ℹ pass 9 / ℹ fail 0|
|tests/npc-life-family.test.mjs|pass|213.79|False|ℹ pass 7 / ℹ fail 0|
|tests/npc-life-health.test.mjs|pass|391.596|False|ℹ pass 7 / ℹ fail 0|
|tests/npc-life-migration.test.mjs|pass|336.401|False|ℹ pass 7 / ℹ fail 0|
|tests/npc-life-t164.test.mjs|pass|201.496|False|ℹ pass 8 / ℹ fail 0|
|tests/npc-memory.test.mjs|pass|12.967|False|ℹ pass 11 / ℹ fail 0|
|tests/npc-population.test.mjs|pass|2.719|False|ℹ pass 2 / ℹ fail 0|
|tests/npc-schedule.test.mjs|pass|1789.288|True|ℹ pass 12 / ℹ fail 0|
|tests/numeric-persistence.test.mjs|pass|22.382|False|ℹ pass 1 / ℹ fail 0|
|tests/ontology.test.mjs|pass|0.912|False|ℹ pass 5 / ℹ fail 0|
|tests/overfit-guard.test.mjs|outside-EPERM|20.596|False|✖ overfit guard: world/actions synonyms of 4+ characters are not copied from the corpus (2.5539ms) / ✖ overfit guard: every allowlist entry carries a reason and still matches a real hit (1.192ms) / ℹ pass 2 / ℹ fail 2 / ✖ failing tests: / ✖ overfit guard: world/actions synonyms of 4+ characters are not copied from the corpus (2.5539ms) / ✖ overfit guard: every allowlist entry carries a reason and still matches a real hit (1.192ms)|
|tests/perf-s5-cache.test.mjs|pass|1.868|True|ℹ pass 16 / ℹ fail 0|
|tests/plugin.test.mjs|pass|24.826|False|ℹ pass 7 / ℹ fail 0|
|tests/population-on-demand.test.mjs|pass|35.25|False|ℹ pass 6 / ℹ fail 0|
|tests/population-publication.test.mjs|pass|14.373|False|ℹ pass 6 / ℹ fail 0|
|tests/population-seeded.test.mjs|pass|3.462|False|ℹ pass 3 / ℹ fail 0|
|tests/quest-sources.test.mjs|baseline-fail|22.714|False|✖ 过期没人接的任务撤下：人物托管退回本人，公账托管退回公账 (8465.1202ms) / ℹ pass 7 / ℹ fail 1 / ✖ failing tests: / ✖ 过期没人接的任务撤下：人物托管退回本人，公账托管退回公账 (8465.1202ms)|
|tests/record-index-check.test.mjs|outside-known-40min|未跑|None||
|tests/remote-generation.test.mjs|pass|138.197|False|ℹ pass 5 / ℹ fail 0|
|tests/reputation-law.test.mjs|pass|12.871|False|ℹ pass 9 / ℹ fail 0|
|tests/s3-sv.test.mjs|pass|3.653|False|ℹ pass 6 / ℹ fail 0|
|tests/s4-layout.test.mjs|pass|5.968|False|ℹ pass 9 / ℹ fail 0|
|tests/s4-perception.test.mjs|pass|13.441|False|ℹ pass 11 / ℹ fail 0|
|tests/s5-07.test.mjs|pass|25.112|False|ℹ pass 19 / ℹ fail 0|
|tests/s5-09.test.mjs|pass|205.309|False|ℹ pass 18 / ℹ fail 0|
|tests/s5-law-business-lifecycle.test.mjs|pass|21.934|False|ℹ pass 13 / ℹ fail 0|
|tests/s5-law-delivery-capacity.test.mjs|pass|26.326|False|ℹ pass 12 / ℹ fail 0|
|tests/s5-law-disease-contact.test.mjs|pass|18.515|False|ℹ pass 7 / ℹ fail 0|
|tests/s5-law-household-budget.test.mjs|pass|8.076|False|ℹ pass 27 / ℹ fail 0|
|tests/s5-law-household-labor.test.mjs|pass|3.867|False|ℹ pass 16 / ℹ fail 0|
|tests/s5-law-household-meals.test.mjs|pass|10.429|False|ℹ pass 13 / ℹ fail 0|
|tests/s5-law-land-value.test.mjs|pass|15.703|False|ℹ pass 9 / ℹ fail 0|
|tests/s5-law-maintenance.test.mjs|pass|30.943|False|ℹ pass 13 / ℹ fail 0|
|tests/s5-law-periodic-market.test.mjs|pass|14.07|False|ℹ pass 24 / ℹ fail 0|
|tests/s5-law-procurement.test.mjs|pass|7.421|False|ℹ pass 10 / ℹ fail 0|
|tests/s5-law-production-inputs.test.mjs|pass|43.5|False|ℹ pass 10 / ℹ fail 0|
|tests/s5-law-public-maintenance.test.mjs|pass|219.687|False|ℹ pass 15 / ℹ fail 0|
|tests/s5-law-seasonal-credit.test.mjs|pass|17.429|False|ℹ pass 21 / ℹ fail 0|
|tests/s5-law-soak-report.test.mjs|pass|0.825|False|ℹ pass 6 / ℹ fail 0|
|tests/s5-law-soak.test.mjs|pass|150.61|False|ℹ pass 7 / ℹ fail 0|
|tests/s5-law-subsistence.test.mjs|pass|20.869|True|ℹ pass 39 / ℹ fail 0|
|tests/s5-law-tenancy-sharing.test.mjs|pass|632.904|False|ℹ pass 15 / ℹ fail 0|
|tests/s5-law-water-source.test.mjs|pass|5.847|True|ℹ pass 12 / ℹ fail 0|
|tests/s5-playthrough.test.mjs|baseline-fail|13.531|False|✖ S5 一局：集日买卖 → 租田种收并卖自产粮 → 存钱与具名存单 → 存档重放 (11566.5711ms) / ℹ pass 0 / ℹ fail 1 / ✖ failing tests: / ✖ S5 一局：集日买卖 → 租田种收并卖自产粮 → 存钱与具名存单 → 存档重放 (11566.5711ms)|
|tests/save-roundtrip.test.mjs|pass|133.378|False|ℹ pass 6 / ℹ fail 0|
|tests/spell-research.test.mjs|pass|11.759|False|ℹ pass 7 / ℹ fail 0|
|tests/storage.test.mjs|pass|0.756|False|ℹ pass 16 / ℹ fail 0|
|tests/w3-journey.test.mjs|pass|10.737|False|ℹ pass 5 / ℹ fail 0|
|tests/weather.test.mjs|pass|49.088|False|ℹ pass 10 / ℹ fail 0|
|tests/works.test.mjs|pass|11.619|False|ℹ pass 8 / ℹ fail 0|
|tests/world-content2.test.mjs|pass|3.833|False|✖ 020 题设按真实席位（旧磨坊）搭建后，能唯一找到木工考官，申请不预先授予资格；白石行会窗口没有木工考官〔前提待真实动作：创建并授权木工申请登记窗口职位、登记转介及考核；归 S4〕 (240.9478ms) # TODO / ℹ pass 5 / ℹ fail 0 / ✖ failing tests: / ✖ 020 题设按真实席位（旧磨坊）搭建后，能唯一找到木工考官，申请不预先授予资格；白石行会窗口没有木工考官〔前提待真实动作：创建并授权木工申请登记窗口职位、登记转介及考核；归 S4〕 (240.9478ms) # TODO|

## 基线子测逐项对照

基线通过只读加载fc0c1dfa原始模块，在独立Node复跑；未切换工作树、未写Git。每个失败子测名必须与本轮相同，不能只按文件同败。

|文件|本轮失败名|基线失败名|同名|
|---|---|---|---|
|tests/advance-registry.test.mjs|对照：full存档推进结果可重放且与快照逐字节相同 / 对照：quiet存档推进结果可重放且与快照逐字节相同|对照：full存档推进结果可重放且与快照逐字节相同 / 对照：quiet存档推进结果可重放且与快照逐字节相同|True|
|tests/overfit-guard.test.mjs|overfit guard: every allowlist entry carries a reason and still matches a real hit / overfit guard: world/actions synonyms of 4+ characters are not copied from the corpus|overfit guard: every allowlist entry carries a reason and still matches a real hit / overfit guard: world/actions synonyms of 4+ characters are not copied from the corpus|True|
|tests/quest-sources.test.mjs|过期没人接的任务撤下：人物托管退回本人，公账托管退回公账|过期没人接的任务撤下：人物托管退回本人，公账托管退回公账|True|
|tests/s5-playthrough.test.mjs|S5 一局：集日买卖 → 租田种收并卖自产粮 → 存钱与具名存单 → 存档重放|S5 一局：集日买卖 → 租田种收并卖自产粮 → 存钱与具名存单 → 存档重放|True|

## 外跑与FIELDS范围

record-index-check在R8的FIELDS完整单文件已运行2400.091秒仍未结束；依共同规则“单文件超过40分钟不跑”，本轮未重复，交主会话沙箱外运行，不记通过。overfit两个子测均停在同一个newSynonymHits的git show调用，测试只断言status而丢弃error.code；同参数探针确认status=null、error.code=EPERM，另列环境限制，不放宽测试。该文件静态源码扫描不由运行时加载钩子替换，不以基线复现宣称扫描通过。

|FIELDS文件|退出|秒|超时|
|---|---:|---:|---|
|tests/s5-law-subsistence.test.mjs|0|20.869|False|
|tests/s5-law-water-source.test.mjs|0|5.847|False|
|tests/npc-schedule.test.mjs|0|1789.288|False|
|tests/entity-view.test.mjs|0|2.47|False|
|tests/education.test.mjs|0|311.388|False|
|tests/perf-s5-cache.test.mjs|0|1.868|False|

### 单失败用例尾部：tests/overfit-guard.test.mjs

--test-name-pattern=^overfit\ guard:\ world/actions\ synonyms\ of\ 4\+\ characters\ are\ not\ copied\ from\ the\ corpus$

```
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2342.2444

✖ failing tests:

test at tests\overfit-guard.test.mjs:76:1
✖ overfit guard: world/actions synonyms of 4+ characters are not copied from the corpus (2.3015ms)
  AssertionError [ERR_ASSERTION]: the master catalog must be readable to detect new synonyms: undefined

  null !== 0

      at newSynonymHits (file:///F:/dnd-wt/K16/tests/overfit-guard.test.mjs:70:9)
      at TestContext.<anonymous> (file:///F:/dnd-wt/K16/tests/overfit-guard.test.mjs:77:13)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1103:25)
      at Test.start (node:internal/test_runner/test:1000:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:358:17) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: null,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }
```

### 单失败用例尾部：tests/overfit-guard.test.mjs

--test-name-pattern=^overfit\ guard:\ every\ allowlist\ entry\ carries\ a\ reason\ and\ still\ matches\ a\ real\ hit$

```
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 19905.4156

✖ failing tests:

test at tests\overfit-guard.test.mjs:100:1
✖ overfit guard: every allowlist entry carries a reason and still matches a real hit (17623.4407ms)
  AssertionError [ERR_ASSERTION]: the master catalog must be readable to detect new synonyms: undefined

  null !== 0

      at newSynonymHits (file:///F:/dnd-wt/K16/tests/overfit-guard.test.mjs:70:9)
      at TestContext.<anonymous> (file:///F:/dnd-wt/K16/tests/overfit-guard.test.mjs:103:34)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1103:25)
      at Test.start (node:internal/test_runner/test:1000:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:358:17) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: null,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }
```

### 单失败用例尾部：tests/quest-sources.test.mjs

--test-name-pattern=^过期没人接的任务撤下：人物托管退回本人，公账托管退回公账$

```
  +     10
  -     9
      ],
      [
        10,
        'item_oat_flatbread',
        4,
  +     14
  -     13
      ],
      [
        11,
        'item_bread',
  +     4,
  +     8
  -     6,
  -     13
      ]
    ]

      at TestContext.<anonymous> (file:///F:/dnd-wt/K16/tests/quest-sources.test.mjs:174:9)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [Array],
    expected: [Array],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
```

### 单失败用例尾部：tests/s5-playthrough.test.mjs

--test-name-pattern=^S5\ 一局：集日买卖\ →\ 租田种收并卖自产粮\ →\ 存钱与具名存单\ →\ 存档重放$

```
✖ S5 一局：集日买卖 → 租田种收并卖自产粮 → 存钱与具名存单 → 存档重放 (9994.7366ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 11642.3864

✖ failing tests:

test at tests\s5-playthrough.test.mjs:31:1
✖ S5 一局：集日买卖 → 租田种收并卖自产粮 → 存钱与具名存单 → 存档重放 (9994.7366ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

  null !== 'loc_hw'

      at TestContext.<anonymous> (file:///F:/dnd-wt/K16/tests/s5-playthrough.test.mjs:67:9)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: null,
    expected: 'loc_hw',
    operator: 'strictEqual',
    diff: 'simple'
  }
```

未新增删除、跳过或断言放宽；既有A3 TODO保持原样，文件按Node退出码及fail计数记结果。诊断用单个子测不充作整文件验收。未设置UPDATE_ADVANCE_GOLDEN。advance-registry旧快照的有意K16差异仍留给主会话审核统一重生成；本轮相对开工前golden/numeric新增差异0。
