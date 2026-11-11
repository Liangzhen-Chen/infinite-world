【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 A3-A 第 6 轮。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3A（分支 a3a，第 5 轮已提交并合入最新 master）。
从交接 F:/dnd/logs/sessions/A3A-sol5.final.txt 继续 A3-A 剩余：NPC 骑乘与 creature 移动、NPC 检定/学习、rule 预约（计划 F:/dnd/logs/sessions/A3-astra-plan.md 的 A3-A 节）。“任意坐标/方位”主会话已裁定归 S4（地点与法域：分区、邻接、方位），本卡不做，只保证接口能接上。A3-B/C/D 正在其他工作区基于你已交付的接口开发：不得破坏已交付接口（如需改，保持向后兼容并在报告列明）。
跑：A3-A 验收文件、tests/a3-*.test.mjs、CORE、tests/law.test.mjs。报告 F:/dnd/logs/sessions/A3A-sol6.final.txt；回复 ≤150 字。
