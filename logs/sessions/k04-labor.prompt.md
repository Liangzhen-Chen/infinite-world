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

# 卡 K04：家户劳力与保留工资（S5 规律卡，第 2 波）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K04，分支 t-k04-law，基于 s5a 当前头（.base）。范围按 s5-cards.md 的 K04 节：规律、文件所有权、原语、手算与失败路径、验收、并行边界都以该节为准。审计原文：tables/ 中劳动与家户表的 LAB01、HH02。

## 已合入，可直接用
- K02 household-budget.mjs（householdBudget/householdResources/householdBufferTarget/householdOptions、市场替代）。本卡在同模块补时间预算/机会成本派生，不另建第二份出勤账。
- K01 土地估值、K03 业主维护、K12 真实运力。

## 要点
- 劳动选择比较现金/实物报酬与家庭生产、照料、通勤机会成本；同一人的同一段时间只能用一次（种地、打工、照顾家人、赶集）。
- 保留工资因人而异（05 §5.7，种子抽签）；决策带噪声；允许少数人不划算也去或不去。
- 包食与现金分列；缺食识别读营养/用途事实，不按物品名。
- 无照料人不能虚构替工；已签排他时段不被越过。

## 手算锚点
可用480分钟，已需农事180、照料60、通勤60 → 本时段雇工最多180分钟；每分钟2铜实挣360。

## 验收
C；逐文件：labor-market、npc-schedule、npc-obligations、s3-labor-justice、npc-life-health、s5-law-household-budget、新增 s5-law-household-labor（含无照料人、病童、道路中断、排他时段）。agriculture 是长测，列给主会话。新断言按实际分钟与真实库存计算，不调用被测函数自证。
