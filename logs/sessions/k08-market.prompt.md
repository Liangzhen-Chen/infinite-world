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

# 卡 K08：集期与市场消费者（S5 规律卡，第 3 波）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K08，分支 t-k08-law，基于 s5a@dafae4cd。范围按 s5-cards.md 的 K08 节：规律、文件所有权、原语、手算与失败路径、验收、并行边界都以该节为准。审计原文：tables/ 中市场表的 MKT02、MKT03（S5 部分）。

## 已合入，可直接用
K02 household-budget（消费/缓冲/市场替代、householdOptions）、K12 真实运力（运单、在途、到站领取）、K05 business 续营（本卡在 business.mjs 只改客流与服务相关函数，不动 K05 的 businessLifecycle/operatingOptions）。

## 要点
- 集日只是约定碰头的日子：有没有货，看是否真有人带着货来；赶集、补货、套利只用本人可知的信息，并计入真实的路程、运输和储存成本。
- 顾客花钱接 K02 预算，不再按"钱袋固定份额"无条件花光积蓄。
- 保留 MKT01 已修的深度例外（双方约价不受深度拦截）和 K02 的储备。
- 个体差异与决策噪声按 05 §5.7、14 §14.5.1；完整搜价/传闻选择归 S6，不在本卡。

## 验收
C；逐文件：shop-restock、business-contracts、s5-02、s5-05（若超 40 分钟列主会话）、w8e6-leftovers、settlement-trade、s5-law-household-budget、s5-law-business-lifecycle、新增 s5-law-periodic-market。
