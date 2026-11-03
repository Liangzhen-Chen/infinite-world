【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

卡 s4in-integrate（s4a 集成：A3 修复合入后的 3 个失败）。工作区 F:/dnd-wt/S4IN（分支 t-s4in，自 s4a 433a53cd）。先读 docs/产品原则.md。逐个单独运行定位并修根因：
1. tests/arch-metrics.test.mjs：S4 新模块（server-plugin/norm-stack.mjs、place-layout.mjs、perception.mjs 等）未归层——在 tools/arch-layers.mjs 按实际职责归层，不抬逆向依赖基线。
2. tests/system-map.test.mjs：新模块归入系统（tools/system-map.mjs），运行 node tools/system-map.mjs 重新生成 docs/system-map.*，不绕过完整性检查。
3. tests/draw-water.test.mjs 1 个用例失败：A3 的日常取水与 S4 的分区可及性（place-layout / perception：同分区不等于可接触、须走近）交互。判断是取水应改用 S4 的可及性判定（产品），还是测试前提需按真实走近动作产生（测试），修根因，不放宽断言。
验收（逐个单独运行）：上述 3 个 + tests/s4-layout.test.mjs、tests/s4-perception.test.mjs、tests/a3-intent-proposal.test.mjs、tests/environment.test.mjs。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要。不改 docs/（system-map 生成物除外）。不再启动其他会话或子代理。最后回复不超过 6 行，同样写到 F:/dnd/logs/sessions/s4in-integrate.final.txt。
