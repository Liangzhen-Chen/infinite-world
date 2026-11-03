【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：45 分钟（到 35 分钟时停手写交接）。

# 续卡 s5a-ledgerprice：S5-05 合入后 ledger-price 的真回归（在集成工作区）

工作区 F:/dnd-wt/S5A（s5a，没有其他执行者在用）。tests/ledger-price.test.mjs 在 S5-05 分支扫描为 10/2、合入 s5a 后 11/1，失败报 E-BODY-FACT（你上一会话判断为"既有夹具倒拨时间"）。主会话核实：S5-02 合入、S5-05 合入前，s5a 上该文件 12/0，所以这是 S5-05 带入的回归，不是既有失败。
请找出根因并修复：若 S5-05 的身体/资源事实写入使得测试夹具里"把时间往回拨"的前提不再合法，按真实动作或 applyIntentSetup 重建前提（不倒拨时间、不直接改 state），保留原断言意图；若是实现缺陷修实现。不放宽断言。
复跑 ledger-price（约 100 秒）、ledger-stock、s5-05、CORE。汇报 ≤200 字（UTF-8，F:/dnd/logs/sessions/s5a-ledgerprice.final.md）。
