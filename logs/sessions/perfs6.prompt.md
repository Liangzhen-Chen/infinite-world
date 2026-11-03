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

# 卡 PERFS6：推进性能第二轮（自治决策热点）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/PERFS6，分支 t-perf-s5law2，基于 s5a@16df4939（已含 PERFS5：bench 400s→86.5s，master 71.6s，比值 1.21；目标 ≤1.10，约还需省 8 秒）。

## 剩余热点（PERFS5 交接，F:/dnd/logs/sessions/PERFS5.final.md 第 69 行起）
- advanceNpcAutonomy inclusive 12.2s（master 1.9s）；subjectiveView 5.7s；settleNpcReflection 2.9s（master 0.9s）。
- 主因：K03 building_maintenance provider 的 relevant() 对 condition<100 的业主几乎每天为真；K05 business_lifecycle provider 对所有营业店主每天为真；于是每天为大量店主构建 subjectiveView 并跑候选。PERFS5 已试"维修相关性收窄"并撤回（粗筛改变了行为）。

## 要做（按顺序）
1. **先找行为不变的省法**：为 relevant()/candidates 设计**精确**预筛——能证明当日不会产生通过决策的候选时直接跳过（例如维修：可避免服务损失的上界 ≤ 成本下界即不可能 agree；续营：现状已是最优且无现金缺口、无可恢复/暂停切换的可能）。上界/下界必须只读廉价事实、且证明成立；FIELDS_INDEX_CHECK 或等价对照证明逐字节不变。subjectiveView 的构建可按 (观察者, 状态身份, 时刻) 记忆化共享（同一推进内多个 provider 共用）。
2. 若第 1 步后仍 >1.10，**主会话已批准一条规律层改动**（写入设计依据：05 §5.7 有限理性/满意即止）：经营复盘按计划期一次（K05 的 horizonDays 周期边界），遇事件即时复盘（现金缺口出现、建筑 condition 跌破派生阈值、租约/雇佣到期或被拒、店铺被毁）；维修评估同理在损耗跨越整点状况或事件后才复评。这会改变世界结果：金快照按"字段｜旧→新｜原因"出字段表，主会话审核后统一重生成；手算锚点与 s5-law-business-lifecycle / s5-law-maintenance 的规律断言须仍成立（不得放宽）。
3. 目标：bench 相对 master ≤1.10（perf-gate.sh F:/dnd-wt/PERFS6 默认配对）。

## 验收
bench/perf-gate 数字；第 1 步部分：advance-registry 5/5 不变、numeric-digest 一致；若做第 2 步：字段表 + 相关专项全过。CORE 三件、同步四件套；FIELDS_INDEX_CHECK=1 跑 s5-law-* 全部、npc-autonomy、building-maintenance、business-contracts、npc-schedule、shop-restock、s5-02、settlement-trade。汇报：每处修法、是否改变行为、提速数字。
