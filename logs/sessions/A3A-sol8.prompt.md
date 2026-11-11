【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 A3-A 第 8 轮（处理并行卡的接点请求）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3A（分支 a3a，已合入 A3-B/C/D 第 1 轮与 A3-A 第 6 轮，主会话已提交）。
任务：逐条处理 F:/dnd/logs/sessions/A3B-sol2.final.txt、A3C-sol2.final.txt、A3D-sol2.final.txt 以及你上轮 A3A-sol7.final.txt 中遗留项（B 待安装原生工厂、D 两处旧文案断言需按设计对齐——改断言须写依据、保留意图） 中的“对 A3-A 的请求”（含 各卡归层修正——在 tools/arch-layers.mjs 与 tools/system-map.mjs 按设计层次登记，不许把违例加进基线）。只改 A3-A 拥有的文件与登记工具；保持已交付接口向后兼容。A3-B/C/D 第 2 轮将在其他工作区并行，基于你本轮交付的接点。
跑：tests/a3-*.test.mjs、tests/arch-metrics.test.mjs、tests/system-map.test.mjs、CORE、tests/law.test.mjs。报告 F:/dnd/logs/sessions/A3A-sol8.final.txt；回复 ≤150 字：逐条请求处理结果、测试结果。
