【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：45 分钟（到 35 分钟时停手写交接）。

# 续卡 s506e-ecology：最后一个回归 npc-depth-wt

主会话沙箱外复核：tests/npc-depth-wt.test.mjs 在 s5a 上连续两次 21/0、历次全量扫描 21/0；在你的工作区 20/1（门禁曾误判为基线同败，已核实为本卡回归）。其余：runtime、a3-builder-ui 单跑通过（负载偶发）；npc-depth-lq 28/0、npc-depth-sb 19/0、overfit 4/0 均已在沙箱外通过。
请找出 npc-depth-wt 失败用例的根因并修复（合法变化按设计对齐并用手算锚点；实现缺陷修实现；不放宽断言）。只需复跑 npc-depth-wt 与 s5-06、CORE。汇报 ≤150 字（UTF-8，F:/dnd/logs/sessions/s506e-ecology.final.md）。
