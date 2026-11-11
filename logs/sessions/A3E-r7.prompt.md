【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 A3-E 第 7 轮（场景加载器）。工作区 F:/dnd-wt/A3E（分支 a3e，已同步 a3a）。项目《无限原野》Node 规则引擎。差距 F:/dnd/logs/sessions/a3-gap-v2i.md、逐条结果 F:/dnd/logs/sessions/a3-score-v2i.json（a3a aee340b7，含判分口径修正）。不改语料 tests/fixtures/a3-intents-v2.json 的 expected/text/setup，不改判分口径；依据写设计文档章节（docs/架构设计/）。重跑 node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/<卡名>-score.json 报六项指标；跑 tests/a3-*.test.mjs、本卡相关测试与 CORE。 本卡可改 tools/a3-score.mjs 的 setup 加载部分与其自检。
处理 setup 未满足 7 条（009 057 070 089 090 091 106）：实现语料已声明的 setup.instances、setup.holdings、嵌套 setup.status（拘押/受限等）的加载——一律经引擎原生创建/持有/状态接口建立（实例经 world 定义实例化、持有经 holdings 账本、拘押经 regime/status 正规路径），不直接往 state 塞“已成立”的结论；字段语义不明的写入 setupUnmet 并注明，不猜。完成后这 7 条 setupUnmet 应为空（之后能否通过另算）。另统计 24 条“抛错无路由”里属于 setup 未建立文本所述事实的（如 051–058 案件未登记、063/071/097 距离视线、039/095 NPC 当值时刻、015/018 识字、032 余额），逐条写：文本是否陈述了该事实、setup 是否缺对应结构化字段、建议字段形状——供语料作者下一轮补，不自行改语料。报告 F:/dnd/logs/sessions/A3E-r7.final.txt；回复 ≤150 字。
