【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 续卡 s505b-resources：S5-05 第 2 会话

接着第 1 会话（田地成熟入账、批次采收、腐坏扣量、产量接派生槽，未提交）：
1. 林、矿、药、渔并入同一库存（资源点账户）；古树慢再生；有限饵料耗尽停产；源汇预算与累计取整（RW-06/W1）——不同推进步长结果完全一致。
2. 机制断言补齐（tests/s5-05.test.mjs）：每条都要有**手算的数字字面量**锚点（按 docs/架构设计/05-统一模型.md §5.5 与世界数据，注释写计算步骤），不得用被测函数算期望值。
3. 完整验收：affected 全部文件对比 master；agriculture、farm-pests-clock、farm-pests-hunt、farm-pests-harvest 单独计时并与 master 对比（不得变慢）；overfit、arch-metrics、system-map、performance、CORE 全过；静态 ≤10593。
4. 若有规则/资源数据要改 world/，走审批管线。
约束同第 1 会话。汇报 ≤350 字（UTF-8，F:/dnd/logs/sessions/s505b-resources.final.md）。
