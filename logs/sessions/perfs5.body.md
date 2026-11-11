# 卡 PERFS5：S5 规律卡合入后的推进性能退化（5.3 倍）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/PERFS5，分支 t-perf-s5law，基于 s5a@037a3458。

## 实测（主会话，机器基本空闲）
基准 `node F:/dnd-tools/bench-farm-pests.mjs 30 2`：f0de40b9（W8-E6 前）76 秒；当前 s5a 400 秒（5.3 倍）；master 约 77 秒。性能门要求 s5a/master ≤ 1.10（F:/dnd-tools/perf-gate.sh）。
退化沿合并点累积：E6→K12 段 +97 秒，K02 +30，K04 +60，K08 +47，K06 +50。
剖析对照已在 F:/dnd/logs/sessions/perf-diff.txt（`node F:/dnd-tools/profile-diff.mjs base tip 30`）。增长最大：
- entity-view.mjs personRoutine +59s、personBusiness +14s、personBusinesses +5.8s、personConstraint +5.5s、placeSettlement +5.3s、personEmployment +3.4s
- holdings.mjs aliveHoldings +25s、push +20.5s、index +13.4s
- contract-state.mjs contractTerms +40s
- obligation-state.mjs obligationRows +13s；action-authority.mjs currentControllers +12s
- household-budget.mjs seedNeeds +5s、futureSources +3.3s、householdResources +2.8s、commitmentAllocation +1.9s
- npc-state.mjs baseNpcSchedule/npcSchedule/householdWorkTime（K04 tradesAt 每时段遍历全体 NPC；K06/FXM agriculturalWorkforce 每村每日对每个成员算 householdWorkTime）

## 要做
1. 用 `node --cpu-prof` 自行复测，按热点逐个定位"重复计算"的调用链（谁在循环里反复调用、每次扫全部记录）。
2. 只用不改变行为的手段提速：按文档 revision（d.cursor.revision / recordsMemo 等现有机制）记忆化、建索引（按 subject/holder/kind 的映射）、把每人每日不变的派生提到循环外、避免反复 structuredClone/contractTerms 解析。参考 S5-P1（docs/PLAN.md 中"S5-P1 推进性能回退"条）的做法与 storage.mjs recordsMemo。
3. **行为必须逐字节不变**：tests/advance-registry.test.mjs 金快照不重生成且必须通过；`node tools/numeric-digest.mjs` 前后一致；同版重放确定性不变。缓存键必须包含所有输入（状态 revision、时刻、观察者），不得跨文档/跨时刻串值；不得为提速改规律、减少世界规模或跳过计算。
4. 目标：bench 相对 master ≤1.10。每处改动附剖析前后数字。

## 验收
bench 前后数字；advance-registry 5/5（不设 UPDATE）、numeric-digest 一致；CORE 三件、同步四件套；逐文件跑受影响模块的引用测试（至少：s5-law-* 全部、npc-schedule、labor-market、农业相关短测、holdings-writers、finance-assets、s5-02、shop-restock、settlement-trade、s5-08、npc-obligations、a3-consent-rights）。agriculture 长测列主会话。汇报：每个热点的根因、修法、提速数字。
