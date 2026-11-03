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

# 卡 K10：公共维护预算接点（S5 规律卡，第 3 波）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K10P，分支 t-k10-law，基于 s5a@dafae4cd。范围按 s5-cards.md 的 K10 节：规律、文件所有权、原语、手算与失败路径、验收、并行边界都以该节为准。审计原文：tables/ 中组织与公共财政表的 ORG01（S5 部分）。

## 已合入，可直接用
K03 building-maintenance.mjs:maintenanceOptions（修/暂缓的成本收益比较、材料与工时口径），只读调用；不另建第二套维修执行器。

## 背景
W8-E8 诊断：学堂、驿站这类集体建筑只有经理/柜员，没有私人产权人，K03 的业主自修不覆盖它们，一季后会因失修停用。

## 要点
- 公共设施的维修需求，只有经过合法责任人（有职权的官职/管事）、公共预算或公共工程，才变成真实施工和支付；不把首领私囊当公账，不把管事当业主。
- 预算不足、无人负责、无材料无工匠时如实失败或推迟，世界照常承担停用后果；但不允许所有公共设施因没有任何候选而系统性失修。
- 负责人的个体差异与决策噪声按 05 §5.7、14 §14.5.1。
- 组织权能扩展或 world/meta 改动须先报主会话串行，不重做治理系统。

## 验收
C；逐文件：governance、governance-projects、s2c-governance、s4-offices、facilities、building-maintenance、s5-law-maintenance、新增 s5-law-public-maintenance（含一季推进后学堂/驿站这类集体建筑有负责人评估并可修）。
