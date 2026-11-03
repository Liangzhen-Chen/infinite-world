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
限时：180 分钟（到 170 分钟时停手写交接）。

K15 第三轮：按根因修性能（主会话诊断，放开上一轮"与 K15 输出逐字节一致"的约束——那条约束是主会话设错了，挡住了真正的病根）。

## 主会话诊断
慢的不是进餐计算本身。server-plugin/npc-life.mjs:83 每户每日无条件 `d.set(['state','family','meals',key], {...})`，加上每行 itemDelta——全世界每户每天写存档。PERFS5 的 stateMemo 规则是"任何 cursor 写入使记忆失效"，于是各系统的记忆每天被冲掉，教育排课/日程等重新全量计算（你上轮剖析的剩余热点 storage.take、education-state records 扫描正是此现象）。请先用剖析确认或否定这条判断。

## 要做
1. **只记该记的**：口粮消耗仍真实走 itemDelta 账本（不能省）。family.meals 只在有变化时写：缺餐、连续缺餐计数变化、家户成员/来源变化；"今日已结算"的防重用一个按聚落或按日的紧凑水位（例如每个聚落一个 lastSettledDay），不为每户每日改写整条记录。缺餐统计仍可重算、存读档与重放保持正确。
2. **记忆按范围失效**：在 server-plugin/storage.mjs 的 stateMemo/记录索引机制中，把"任何写入都失效"改为按受影响的状态子树/记录类别失效（例如写 state.family.* 不使依赖 state.records 某类别或 state.npcs 日程的记忆失效）。键必须仍包含全部显式输入；FIELDS_INDEX_CHECK=1 必须仍能检出任何陈旧命中。这是通用改进，适用于所有每日写存档的规律。
3. 行为：除进餐记录的存储形状外，世界结果（库存、钱、缺餐数、成交、价格等）应与当前 K15 一致；金快照差异重新出字段表 K15-golden-table.md（应比 5604 条少），逐项给出旧→新与原因。
4. 目标：bench-farm-pests 30 2 三对中位相对 master ≤1.10。

## 验收
三对数字；FIELDS_INDEX_CHECK=1 跑 s5-law-household-meals、s5-law-household-budget、npc-life-health、s5-law-periodic-market、perf-s5-cache、holdings-registry、npc-schedule、education 相关测试；CORE、同步四件套；numeric-digest 说明变化。汇报：剖析是否确认诊断、两处修法、提速数字、字段表摘要。
