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

# 卡 K12：真实运力与交付（S5 规律卡，第 2 波）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K12，分支 t-k12-law，基于 s5a@db6ee2ff。范围按 s5-cards.md 的 K12 节：规律、文件所有权、原语、手算与失败路径、验收、并行边界都以该节为准。审计原文：F:/dnd/logs/audit/LAW-astra-001/tables/ 中迁移与交通表的 MIG02、市场表的 MKT03（S5 部分）。

## 要点
- 运费报价不是瞬移许可：可交付量由真实货物、载具载重、同窗已承诺量和时间决定。装货、在途、到达、领取各阶段货在哪里要明确；到达前买方不能使用在途货。
- 一笔到达后才释放占用；毁损按真实损失与赔付条款，不造第二份货。
- 班次、夜停、封路改变到达时刻；现场两人当面交货不受远程路线容量限制。
- 随机性（路上耽搁、货损等）只经种子抽签（14 §14.5.1），共同冲击（封路、洪水）整条路线共享。
- 本卡不改 market/shop/business；只调用已有日程接口，不改 npc-schedule。

## 手算锚点
载重20、同窗已承诺12：第二笔9必须拒绝，或在真实分批协议下最多先运8。

## 验收
C；逐文件：transport、s5-08-w3a-transport、s5-08、s3-obligation-state、npc-schedule、新增 s5-law-delivery-capacity（重放、取消、毁损、占用释放、多笔并发）。
