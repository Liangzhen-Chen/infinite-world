【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：100 分钟（到 90 分钟时停手写交接）。

卡 A3-性能1。工作区 F:/dnd-wt/A3C（分支 a3c，已同步 a3a）。项目《无限原野》Node 规则引擎。A3 合入 master 前须过性能门：F:/dnd-tools/perf-gate.sh 比较 60 天推演，分支不得比 master 慢 10% 以上。现状：master≈149s，a3a≈200s（主会话已修一处：environmentFeatures 每次重建持有索引，见 server-plugin/environment.mjs 的 documentView/featureOwners）。10 天剖析对比（node --cpu-prof 跑 node F:/dnd-tools/bench-farm-pests.mjs 10 1，汇总用 node F:/dnd-tools/prof-top.mjs <文件.cpuprofile> 30）：master 19.4s、a3a 26.9s；差额主要在 catchUpLocal（13%→22%）与 environmentFeatures（约 9%，被 advanceMagicObjects/advanceHeatScenes/advanceWaterEarth/advanceCare 等每个推进系统各自对全部世界物件调用）。
要求：按算法根因修——推进系统只处理有动态状态/相关登记的物件（例如由 records 中 physical_feature 状态、热场景/水土/照护登记反查），不要每 tick 对全部目录物件求 environmentFeatures；或在一次推进步内对同一文档版本只求一次并显式传递（注意草稿 copy-on-write 会就地写自己的副本，不能只按文档对象身份缓存）。不改变任何行为结果：跑 tests/environment*.test.mjs、tests/magic-*.test.mjs、tests/holdings*.test.mjs、tests/farm-pests*.test.mjs、tests/agriculture.test.mjs、tests/a3-*.test.mjs、CORE；推进快照类测试结果必须逐字一致。验收：在本工作区跑 bash F:/dnd-tools/perf-gate.sh F:/dnd-wt/A3C（沙箱能跑则跑；不能跑就用 bench 10 天对比 master 的 19.4s 报数）达到 PASS。报告 F:/dnd/logs/sessions/A3C-perf1.final.txt（改了什么、前后数字、剖析对比）；回复 ≤150 字。
