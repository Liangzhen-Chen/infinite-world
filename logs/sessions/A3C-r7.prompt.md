【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 A3-C 第 7 轮（效果签名）。工作区 F:/dnd-wt/A3C（分支 a3c，已同步 a3a）。项目《无限原野》Node 规则引擎。差距 F:/dnd/logs/sessions/a3-gap-v2i.md、逐条结果 F:/dnd/logs/sessions/a3-score-v2i.json（a3a aee340b7，含判分口径修正）。不改语料 tests/fixtures/a3-intents-v2.json 的 expected/text/setup，不改判分口径；依据写设计文档章节（docs/架构设计/）。重跑 node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/<卡名>-score.json 报六项指标；跑 tests/a3-*.test.mjs、本卡相关测试与 CORE。
处理签名不符 19 条：005 019 021 022 023 024 026 029 030 031 038 059 062 067 072 103 113 115 118，及仅构造器失败 002 003 049 075。逐条对照 expected.signature 与 actual.signatureEffects，按根因归并（制造 6 条优先：103 只扣木料与工坊费、没有产出木楔——计量产出须按实际投入裁剪到可做批数并真实入账；施法、存汇款、战斗、休息、研究、开放提案各查）。修引擎/原语/目录实现，不改 expected；若认定 expected 与设计冲突，写章节依据列入报告由主会话裁定。距离/视线（063 071 097）若设计规定依赖 S4 坐标，只写依据不伪造。报告 F:/dnd/logs/sessions/A3C-r7.final.txt；回复 ≤150 字。
