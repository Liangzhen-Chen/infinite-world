【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 A3-C 第 6 轮（旧入口回执补完）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3C（分支 a3c，已同步最新 a3a）。差距 F:/dnd/logs/sessions/a3-gap-v2f.md 中“已提交动作缺已采用原语回执”15 条（002、004、005、012、015、041、042、045、046、048、049、050、059、075 组合 sequence、080）：补齐这些动作（含组合动作）的已采用原语回执与派生成本来源标记，状态与账本对账一致；另“明确请求的物料 transfer 超出 expected 原语集”3 条（113、115、118）协助 A 区分显式消费与派生成本。不改语料与判分工具。重跑判分报指标。跑 tests/a3-*.test.mjs、CORE、ledger-reconcile。报告 F:/dnd/logs/sessions/A3C-sol6.final.txt；回复 ≤150 字。
