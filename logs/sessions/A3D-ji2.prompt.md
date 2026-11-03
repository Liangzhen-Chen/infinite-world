【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：100 分钟（到 90 分钟时停手写交接）。

卡 A3-己2（战斗签名）。工作区 F:/dnd-wt/A3D（分支 a3d，已同步 a3a）。上一轮 F:/dnd/logs/sessions/A3D-ji.final.txt。项目《无限原野》Node 规则引擎。依据 docs/架构设计/ 与 F:/dnd/logs/sessions/A3-owner-plan.md。最新逐条结果 F:/dnd/logs/sessions/a3-score-v2s.json（a3a：路由 79%、签名 68%、构造器 66%、全通过 82/120；整组测试仅阶段门槛 1 败）。机制测试已固定读 tests/fixtures/a3-intents-v2-r7.json，只有阶段验收读活语料。规则：原生写入 + 真实消费者 + 加载器三件齐；只动本卡负责模块，共享接线最小登记并在报告列出；不改语料；不造原文没有的权利、同意、任职者或成功；不删改既有断言（过期断言改为验证新真实行为并写依据）。重跑 node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/<卡名>-score.json 报六项指标；跑 tests/a3-*.test.mjs（保持仅阶段门槛失败）、本卡相关模块测试与 CORE；静态提示 ≤10593。
059 060 061 现签名不符（遭遇轮次已接通）。逐条对照 expected.signature 与 actual.signatureEffects 及 checkBranches，按根因修 combat/遭遇轮次/回执；expected 与设计冲突的写章节依据交主会话。报告 F:/dnd/logs/sessions/A3D-ji2.final.txt；回复 ≤150 字。
