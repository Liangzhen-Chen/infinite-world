【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：120 分钟（到 110 分钟时停手写交接）。

卡 A3-第二轮 G（制度与旧凭证，接点 G1–G4）。工作区 F:/dnd-wt/A3E（分支 a3e，已同步 a3a）。项目《无限原野》Node 规则引擎。依据 F:/dnd/logs/sessions/A3-owner-plan2.md（第二轮接点码表、逐题阻塞表、卡与模块独占表）及其引用的 docs/架构设计/ 章节；最新逐条结果 F:/dnd/logs/sessions/a3-score-v4b.json；出题人逐题说明见 F:/dnd/logs/sessions/a3-intents-v2.md“第11轮待支持”。规则：每个接点交付①原生写入/存储（进存档与回放）②引擎内真实消费者③ tools/a3-setup/ 加载（经原生接口，不往 state 塞结论）；只动本卡独占模块，共享接线（engine/action-router/primitive-schema/a3-setup index 与 loaders）最小登记并在报告逐处列出；不改语料与判分口径，不改 expected；不造原文没有的权利、同意、任职者、日期或成功；世界内容只写 world/；混合题中归后续阶段的部分写入 docs/A3-后续阶段登记.md 对应行（题号、阶段、接点），不假装通过。新增测试 tests/a3-owner2-<卡号>.test.mjs（正例+越权/伪造/非法输入反例+存档往返）。验收：本卡负责题号的 A3 部分逐题达成（列出每题 setupUnmet 剩余项与路由/签名结果及归因）；旧 99 题仍全过。重跑 node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/<卡名>-score.json；跑 tests/a3-*.test.mjs（保持仅阶段门槛与浏览器 EPERM 已知失败）、本卡相关模块测试与 CORE；静态提示 ≤10593。所有 node 加 TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程。回复 ≤150 字。 G 不新增 S4 规范（多数制章程等归 S4，写登记）。负责题：141 144 176 177 178 180 211 212 213 214 217 220 230 231 的 G 部分。报告 F:/dnd/logs/sessions/A3E-G.final.txt。
