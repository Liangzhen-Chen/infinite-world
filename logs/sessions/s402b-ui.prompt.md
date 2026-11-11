【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

续做 s402-perception（你的改动已合入 s4a）。新工作区 F:/dnd-wt/S402B（分支 t-s402b，自 s4a）。主会话在沙箱外跑 tests/s4-space-ui.test.mjs 失败：第 47 行 `dialog.getByRole('button',{name:/观门侧廊/}).first().click()` 30 秒超时——玩家经 act('core:move',{destination:'bld_bs_reed_dao'}) 真实到达芦衡观后，#fields-dialog 中没有出现“观门侧廊”分区按钮。查明根因（对话框移动后未刷新 / 分区选项未进入界面投影 / 按钮命名或可见条件与测试不符），修产品或修测试取法（须有依据，不放宽断言）。你在沙箱内无法运行浏览器：用离线可测部分（界面投影/菜单数据）复现并修复，列出需主会话沙箱外补跑的命令。
可改：extension/ 下地点菜单与对话框相关文件、server-plugin/action-affordances.mjs（仅分区选项投影）、tests/s4-space-ui.test.mjs。锁定：server-plugin/law.mjs、server-plugin/engine.mjs（另一张卡在改）。
最后回复不超过 6 行，同样写到 F:/dnd/logs/sessions/s402b-ui.final.txt。不再启动其他会话或子代理。
