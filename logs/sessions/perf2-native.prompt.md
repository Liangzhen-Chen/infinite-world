【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 卡 perf2-native：A3 原生运行时使长推进慢约 40%（性能门不过）

工作区 F:/dnd-wt/PERF2（分支 t-perf2，基于 s4a 1d533ec3，即将与 A3 一并合入主线）。对照：F:/dnd-wt/BIS0 检出 master（756315ee，无原生运行时，走旧派发，这是 master 当时的生产路径）；F:/dnd-wt/A3A（a3a）。

## 实测（同一负载下，`node F:/dnd-tools/bench-farm-pests.mjs 30 2`，60 天推进）
master 70.5 秒；a3a 98.0 秒；s4a 101.6–106.4 秒。性能门要求不慢于 master 10%（≤77.5 秒）。A3 起 tests/farm-pests-fixture 走生产原生运行时（primitives-runtime，生产服务器 server-plugin/index.mjs 也装它），S4 再加约 8%。

## 要做
1. CPU 剖析定位热点：`node --cpu-prof --cpu-prof-dir=<本工作树>/.prof F:/dnd-tools/bench-farm-pests.mjs 30 1`（在本工作树根目录运行），`node F:/dnd-tools/prof-top.mjs <文件> 40` 看自耗与累计；同法在 BIS0（master）对比，找出原生路径相对旧派发多出来的开销（例如每次推进/每个 NPC 动作都重建原语帧、权限上下文、注册表解析、深拷贝 structuredClone、事件规范化/canonical、持有索引重建、日程缓存因 knowledge 写入整体失效等——之前 S4R5 交接提到 knowledge 写入会清空全体作息缓存）。
2. 修根因：缓存须随文档变化正确失效；不得改变规则结果（同输入同输出，确定性不变）；不改测试、不放宽阈值、不延长超时；不新增复演版本标记（用户决定规则只一版）。
3. 目标：s4a 基准 ≤ 77.5 秒（master×1.1）；做不到时说明剩余开销来自哪条规则、是否为原生架构必须付出，并给出下一步方案。

## 验收
基准前后各跑 2 次取中位（同机同负载，写明当时是否有其他测试在跑）；engine、storage、plugin、arch-metrics、system-map、performance、s4-perception、s4-layout、draw-water、farm-pests-harvest、npc-schedule、advance-registry 逐个单独进程全过（沙箱拦 spawn 用 --test-isolation=none）。
## 汇报（≤350 字）
热点前后占比、根因、改动文件、基准前后秒数、验收 pass/fail、偏离与未解决。
