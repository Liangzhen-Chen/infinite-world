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
限时：120 分钟（到 110 分钟时停手写交接）。

# 卡 W8-E4：服务容量题集补到 ≥20 题（标杆 B18.5）

先读 F:/dnd/logs/sessions/w8e-common.md（必须遵守）。再读：
- docs/架构设计/标杆标准.md 第 336 行 B18.5 与第 414 行，要求为"超容量请求按紧迫度排队的顺序正确率 100%；容量派生可解释；≥20 题，含医、讼、学、匠"；
- server-plugin/service-queue.mjs（W8-D 的通用队列：急者先、同级先到先得，回执写位次与预计时刻）；
- tests/w8d-service.test.mjs（现有 4 类用例）。

工作树 F:/dnd-wt/W8E4（分支 t-w8e4-capacity）。

## 要做
1. 新建容量题集，格式沿用仓库已有的同类题集（标杆 §414 行说"夹具 + RX 断言"；先 grep 现有的同意题集/沟通题集 B18.7/B18.3 怎么放，照同一目录与格式），≥20 题。
   - 医、讼、学、匠各 ≥4 题。
   - 覆盖：容量 1/多、急症插队、同级先到先得、在岗与不在岗、助手与设施改变容量（派生可解释：回执或视图能说明容量从哪来）、满员后有人完成补入、跨日预计时刻。
   - 每题前提由真实动作产生，手算期望顺序写在题里。
2. 新测试 tests/w8e4-capacity-set.test.mjs 逐题跑，断言顺序与位次 100% 正确，并断言容量说明含来源。
3. 若某题暴露引擎错误：在 service-queue.mjs 等文件修，修法写进汇报。不准为过题改题或写特判。

## 可改文件
新题集文件、新测试、server-plugin/service-queue.mjs、medicine.mjs、education*.mjs、legal-representation.mjs、repair.mjs、manufacturing.mjs（仅限排队相关的修正）。

## 汇报额外要求
给出题数分布（医/讼/学/匠）和通过率；列出发现并修好的引擎问题。
