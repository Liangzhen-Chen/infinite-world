【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
【省额度规则】测试输出必须过滤，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（不要用 grep/head）；禁止读完整输出。
沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 3 个 node 进程。用中文汇报。

卡 R36（三个小回归）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/R36（分支 r36，基于最新 master）。分诊：F:/dnd/logs/sessions/R36-triage.md。
1. tests/action-registry.test.mjs：静态提示 10600 token，要求 ≤10593（A1 前基线）。用 git log -p 找出近期哪次改动让提示变长（A2 对话、S2c、R35 等改了提示源或工具描述），在不删信息的前提下精简到 ≤10593（静态提示总上限 12000 是硬约束，这条 10593 是 A1 的口径，不许改阈值）。
2. tests/arch-metrics.test.mjs：import 图出现新增向上依赖或未标层模块。列出具体违例（模块→被引模块），通过移动函数到正确层或改为注入/查询接口修掉；新模块补标层（tools/system-map.mjs 与层定义）。不许把违例加进基线。
3. tests/w2-s4.test.mjs“隔离发布只追加本批…”：在并发运行时失败（单跑曾通过）。查是否与其他测试（如 w2-s2/w2-s3）共用固定的发布目录/文件；若是，改为测试各自使用 tools/tmp-root.mjs 的临时目录（断言不改）。若是实现问题则修实现。
跑：这三个文件；再并发跑 tests/w2-s2.test.mjs tests/w2-s3.test.mjs tests/w2-s4.test.mjs（--test-concurrency=3）确认无互相干扰；CORE。
报告 F:/dnd/logs/sessions/R36-luna.final.txt；回复 ≤120 字。
