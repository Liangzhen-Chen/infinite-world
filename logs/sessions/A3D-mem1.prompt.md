【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：100 分钟（到 90 分钟时停手写交接）。

卡 A3-内存回归（工作区 F:/dnd-wt/A3D，分支 a3d，已同步 a3a）。项目《无限原野》Node 规则引擎。下列测试在 master 全过（见 F:/dnd/logs/sessions/sweep-master-bedb5078.tsv），在 a3a 上单独运行也因内存失败：npc-depth-sb、w2-s1、w4-b2、wildlife-creatures-mixed 报 “RangeError: Array buffer allocation failed”；w2-reuse-publication 报 “JavaScript heap out of memory”（29 秒即崩）。master 对照可用 F:/dnd-wt/BIS0（已检出 master，只读使用，不改文件）。
要求：①定位内存增长根因：对同一测试在 a3a 与 master 上测量文档/存档序列化大小、state.records 与 holdings 各分支条目数随推进的增长、单次 structuredClone/序列化体积，找出 A3 引入的哪类数据在无界增长或被反复深拷贝（例如每 tick 写入的物件/环境记录、事件记录、回执、缓存保留的旧文档等）。②按根因修实现（不得调大 Node 内存上限、不得改测试规模、不删测试）；修后上述 5 个文件单独运行全部通过，且推进结果与修前一致（推进快照类测试逐字一致）。③跑 tests/a3-*.test.mjs（保持仅阶段门槛与 a3-score-self r9 一项已知失败）、CORE、相关模块测试；用 node F:/dnd-tools/bench-farm-pests.mjs 10 1 报 10 天耗时（现约 14s）。所有 node 加 TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程。报告 F:/dnd/logs/sessions/A3D-mem1.final.txt（根因、前后内存数据、改动）；回复 ≤150 字。
