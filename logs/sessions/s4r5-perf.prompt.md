【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 卡 s4r5-perf：S4 性能退化（约 10 倍）定位与修复

工作区 F:/dnd-wt/S4R5（分支 t-s4r5，基于 s4a 6df89a9d）。对照基线：F:/dnd-wt/A3A（a3a，S4 之前）。

## 现象（单文件单进程耗时，秒）
| 文件 | a3a | s4a |
|---|---|---|
| tests/r06-bs-craft.test.mjs | 105 | >1800（超时） |
| tests/w2-s4.test.mjs | 127 | 1354 |
| tests/w2-s2.test.mjs | 88 | 932 |
| tests/w2-s3.test.mjs | 66 | 841 |
| tests/ledger-price.test.mjs | 1782 | >1800 |
| tests/s3-run001.test.mjs | 1074 | 1274 |
| tests/w4-b3.test.mjs | 585 | 853 |
S4 新增了区内布局（place-layout）、感知（perception：每个世界事件按视/听/触判定见证，magic-light 的 lightAt 遍历光源与地点 feature）、规范栈（norm-stack）、机构在岗（officeOnDuty）、文书（交易写 item_sale 并给单件建实例 trackTransferUnit）、立案、任免同意、室内派生照明（magic-light 里新加的 occupied 判定会遍历全部 NPC 并查日程）。

## 要求
1. 用 CPU 剖析定位热点：`node --cpu-prof --cpu-prof-dir=F:/dnd-tmp/prof --test --test-isolation=none tests/r06-bs-craft.test.mjs`（可加 --test-name-pattern 只跑一个慢用例），再 `node F:/dnd-tools/prof-top.mjs <文件.cpuprofile> 30` 看自耗与累计耗时前列。与 a3a 同一用例对比。
2. 修根因：常见是每次调用重建全量视图/索引（应按 document 版本缓存，像 environment-state 的 per-document 视图那样）、每事件 × 每 NPC × 每光源的嵌套遍历、在热路径里调 subjectiveView/scheduleAt。缓存须随文档变化失效、复演结果不变；不得改变规则结果。
3. 不改测试、不改断言、不延长超时。
4. 修后这 7 个文件耗时应回到 a3a 的 1.3 倍以内（ledger-price/s3-run001 回到 a3a 水平即可）；若某项做不到，说明剩余开销来自哪条 S4 规则、为何必须付出。
5. 本卡只管性能，不负责这些文件里的断言失败（另有卡在修）；但若修性能后某失败消失，照实汇报。

## 验收
上述 7 个文件逐个计时（报 a3a/修后秒数与 pass/fail）；s4-layout、s4-perception、magic-light、draw-water、s4-filing、s4-documents、arch-metrics、system-map、CORE 各一次全过；`sh F:/dnd-tools/perf-gate.sh F:/dnd-wt/S4R5` 若沙箱能跑则跑，不能则说明。
## 汇报（≤350 字）
热点函数与根因、改了哪些文件、各文件前后耗时、验收 pass/fail、偏离与未解决。
