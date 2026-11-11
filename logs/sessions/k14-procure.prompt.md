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

# 卡 K14：维修与生产投入的筹料闭环（K13 浸泡发现 AS01）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K14，分支 t-k14-law，基于 s5a@07477535。

## 浸泡发现（F:/dnd/logs/sessions/K13.final.md "系统性问题" 一节）
青灯酒馆在 20/20 组一年中从 70 降到 39–42，从未维修：业主现金 190–502、维修成本 106、修缮效用 1385–2198 均为正，但自身没有木/石。server-plugin/building-maintenance.mjs:193 缺料分支只看 :200 同地点可见 engineQuote 卖家、:201 卖家须在同一建筑——缺少把维修需求带到合法已知供给的出行或委托。基线 001 同聚落公库有木 28/石 12，但公库不属业主，不能自动取用。证据：F:/dnd/logs/audit/K13-soak/s5-law-soak-k13-final/mechanism-evidence.json。

## 规律（通用，不只酒馆、不只维修）
主体为自己的资产/生产需要投入品而手头不足时，按**本人可知**的供给来源（已知店铺/集市/卖家、已收报价、熟人）比较：亲自出行购买（K08 market_trip：真实路程、时段、路费，占家户时间 K04）、托人代购或下单送货（现有 delivery/transport 义务，K12 运力）、或暂缓。选划算且可行的，真实付款、对方同意、真实交付后材料才到手。无可知供给时明确记录供应约束，不凭空补料、不动公库、不回血。
个体差异与噪声沿用 K03 已有偏好/噪声，不另造。

## 文件所有权
- 可改：server-plugin/building-maintenance.mjs（缺料分支）、必要时 npc-autonomy.mjs 的候选/计划接点（多步计划：出行→购买→返回→施工）。
- 只读调用：business.mjs/npc-state.mjs 的 market_trip、transport.mjs、household-budget.mjs、market.mjs 报价；需要改这些文件时停下报告（K15 并行，拥有 business/household-budget/npc-life/agriculture/advance-registry）。
- 本卡与 K15 不重叠：不改 business.mjs、household-budget.mjs、npc-life*、agriculture.mjs、advance-registry.mjs。

## 验收
手算锚点：酒馆缺木 4/石 2，已知白石市场有货、往返 X 分钟、路费 Y，修缮净收益为正时生成出行购买计划并最终完工；无可知供给时记录约束、不修。新增 s5-law-procurement 专项（含重放、存读档、对方不同意、负重限制、无供给）。逐文件：building-maintenance、s5-law-maintenance、s5-law-public-maintenance、npc-autonomy、s5-law-periodic-market、s5-law-household-labor、CORE、同步四件套；FIELDS_INDEX_CHECK=1 跑上述专项。金快照若变出字段表。性能：bench-farm-pests 30 2 相对 master 不得超过 1.10（F:/dnd-tools/perf-gate.sh），超了说明。
