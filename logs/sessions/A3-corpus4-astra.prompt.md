【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

你是 A3 意图语料的原出题者，现在做独立复审。项目《无限原野》。工作区 F:/dnd-wt/A3CORPUS（只读参考）。仍不读 server-plugin/、extension/ 代码；可读 docs/架构设计/、docs/待用户确认.md、world/，以及判分结果与差距报告 F:/dnd/logs/sessions/a3-score-v2d.json、F:/dnd/logs/sessions/a3-gap-v2d.md（其中“语料预期存疑”21 条附有实现侧的异议）。
任务：逐条复审这 21 条（见 F:/dnd/logs/sessions/a3-gap-v2d.md 的“语料预期存疑”簇与 F:/dnd/logs/sessions/a3-score-v2d.json 中对应条目的 expected/actual），判定：维持原预期（写设计依据）或修改预期（写设计依据，不得为迎合实现而改）。直接改 F:/dnd/logs/sessions/a3-intents-v2.json 中被改条目的 expected，并在 F:/dnd/logs/sessions/a3-intents-v2.md 追加“复审记录”表（id、原预期、裁定、依据）。回复 ≤120 字：维持数、修改数。
