【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 续卡 perf2b-native：第二轮——课程派生、槽位、环境读取

你的第一轮（knowledge 不再使作息失效、接待叠加缓存）已提交 t-perf2，中位 107.1→101.4 秒，目标 ≤77.5 秒（master 70.5×1.1）。按你交接的下一步继续：
1. 课程全量派生：拆开合同条款与考勤依赖，只在真正的输入变化时重算（education-state 等）；
2. 槽位读取与环境读取：复用按文档版本缓存的环境索引（environment-state 已有 per-document 视图与 withEnvironmentFeatures 读作用域，可扩展其覆盖）；
3. 其余剖析前 20 的热点，凡是"每步/每 NPC 重建同一份派生数据"的，按输入版本缓存。
约束同上一卡：结果不变（同输入同输出、确定性、三天补丁与文档哈希一致）；不改测试/阈值/超时；不加复演版本标记。
**测量须隔离负载**：基准前先确认机上没有其他 node 测试在跑（PowerShell 查 node.exe 命令行；若有主会话的扫描在跑，在汇报写明并以同时测 master 的对照比值为准：报 branch/master 比值）。
验收同上一卡，另报前后剖析占比。汇报（≤300 字）。
