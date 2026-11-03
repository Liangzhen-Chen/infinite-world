【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：100 分钟（到 90 分钟时停手写交接）。

你是 A3 意图语料的原出题者（续）。工作区 F:/dnd-wt/A3CORPUS（只读参考，已切到最新 a3a），不读 server-plugin/ 与 extension/。
1. A3V2-063、065、071 的 setup.body.player.mp 声明为 15/28/28，而玩家原生魔力上限为 8（由属性/境界派生）。按意图原文判断：若原文要求“魔力充足”，改为不超过原生上限的值，或通过原文已陈述的境界/修为（abilities 等现有字段）使上限合法提高——不得直接写超上限的当前值；若原文本意就是测魔力不足，写入复审记录。
2. 复核 a3-score-v2p.json 中你的语料仍报 “Only the current owner/manager may grant this permit” 的 008、012：permits 的 issuer 是否为世界中真实的当前所有者/管理者；不是则按原文改正，或记录为世界内容缺口。
直接改 F:/dnd/logs/sessions/a3-intents-v2.json 与 a3-intents-v2.md（复审记录）；不改 id 与 intent 原文。回复 ≤80 字。
