# K16 r10 final (continuation after Codex quota stop)

Tree: F:/dnd-wt/K16 (s5a@0faa9d14 already an ancestor; no merge done). Nothing committed.

## Classification (24 files; 23 pass now)
| file / subtest | class | root cause / action |
|---|---|---|
| a3-score-self, a3-setup-agency, high-nobility, magic-area-actions, mining-jurisdiction, r06-bs-craft, s4-filing, s4-office-quests, s4-offices, s5-03, s5-04b, s5-08, schedule-cache, w2-s2, w2-s3, w2-s4, w8e8-premises | 1 | duty/office hours overlaid by subsistence slots; fixed by the uncommitted predecessor edits kept (household-subsistence physicalBlocked: service slots, office reception hours, law-actor office hours, employment shifts, market-keeper service windows; notBefore; catch-up actors limited to the pending interval). Pass with no test change. |
| finance-bank 聚落级别... ; s3-finance E05-6 | 1 | keeper without authored routine: predecessor's npc-state "sparse office" fallback gave keeper an invented home routine outside reception hours (credit.mjs:77 rejected). Removed fallback in npc-state; household-subsistence.mjs now blocks reception hours for a holder with no authored routine (variable `authored`). |
| r06-bs-dock x2 | 1 (K16 changed reviewed world content) | K16 had added feature_bs_river to loc_bs_hebu; that changes approved-content fingerprints (content-pipeline.mjs:229). Not an ablation of content: dock basin is now derived (water-cycle.mjs, publicDock from published purpose 码头/渡口, same 500000000/400000000 ml state), locations.json back to s5a content. New test in s5-law-water-source. |
| s5-05 公私批次共用账户 | 2 | Real spring sowing is capacity = present field workers; hands now fetch household water, so 139 not 144 area units sown (2361 vs 2446). Test now derives expected public yield from the actually sown area (floor(area*17*179.9/180)), still asserts account sharing exactly. Law-off (minimumAge=999) gives 144. |
| world-clock 真实周贸易 | 2 | Same cause in statistical settlements: granary 17291 vs 17300, seed 1400 vs 1384 at yupo day 14. Anchors recomputed; independent check 2389429*10100/10091=2391560 matches. Four settlements x2 anchors and the scene literal updated. |
| quest-sources 过期没人接 (inn bread paidCopper trace) | 2 (unresolved) | Law-off passes; day 1 identical, from day 2 inn bread price is higher (demand D larger; household meal/inn demand shifted by water/forage trips). Hand-calculated D trace (comments lines ~140-160) not re-derived; test left unchanged and still failing. |
Additional: sparse-incumbent test in s5-law-subsistence rewritten to assert plan duties (not npcSchedule fallback).

## Commands (one file at a time, 2 parallel)
All 24 + s5-law-subsistence 45/0, s5-law-water-source 13/0, s5-law-household-meals 13/0, engine 22/0, storage 16/0, plugin 7/0, numeric-persistence 1/0. Only quest-sources 7/1.
Not run: 60-day hashes, 30-day audit, performance ratios (not done this round).
