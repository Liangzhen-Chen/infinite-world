【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

【交卡前必跑（10-26 起）】交卡前逐文件跑完以下检查并在汇报中写结果；不过的先修，不要留给门禁：
- CORE：tests/engine、tests/storage、tests/plugin；
- 同步四件套：先 `node tools/export-actions.mjs` 重导，再跑 tests/actions-catalog、tests/action-registry、tests/advance-registry、tests/arch-metrics。**不得重生成 advance-registry 金快照**（不得设 UPDATE_ADVANCE_GOLDEN）；若它因本卡有意改动而不一致，在汇报中逐项列出"字段：旧→新、原因"，由主会话审核后统一重生成。
- 本卡新增或修改的测试，以及本卡直接改到的模块的同名测试；
- 自查改动路径：不得触及禁区（docs/架构设计/、已审 W1 骨架 world/design/、dist/、docs/待办.md、docs/问题.md）。确有必要改的，停下写进汇报。
限时：240 分钟（到 230 分钟时停手写交接）。

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
