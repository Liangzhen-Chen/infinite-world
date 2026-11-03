【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

续做 a3w-props（同一工作区 F:/dnd-wt/A3W，接着未提交改动）。主会话已审脚本：复用共享管线、标签写在本批数据里、词表合理，同意。授权重跑一次 L2：本次最多 40 次调用，含上一轮 0.10223952 元在内累计不超过 1 元；上轮失败回执保留，如实记账（预算台账不清零、不另开空账）。
重跑前先用 1 个条目试审，确认响应符合 contradictions JSON 结构后再跑全批；若试审仍失败，停下报告原因，不再烧调用。
L2 全批通过后执行 --publish 写正式 items.json 与词表，再跑闸门测试；有 manual/未通过的条目不发布该条（发布脚本若要求全批通过，就把未通过条目移出本批并在报告列出）。
验收：node --test --test-isolation=none tests/a3-world-approval.test.mjs tests/a3-content-approval.test.mjs tests/a3-daily.test.mjs tests/daily-b2-mechanisms.test.mjs tests/a3w-props-approval.test.mjs
最后回复不超过 10 行：调用次数与金额（本次/累计）、通过/未通过条目、发布的标签→物品、验收结果、未解决问题；同样写到 F:/dnd/logs/sessions/a3w-props2.final.txt。不再启动其他会话或子代理。
