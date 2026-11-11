【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

续做 s404-offices（同一工作区 F:/dnd-wt/S404；主会话已把你的未完成改动提交为 WIP，并合入最新 s4a——其中 02 感知见证已完成，law.mjs 与 engine.mjs 现解锁给你）。按你上轮报告的两处共享接点完成：(1) server-plugin/law.mjs 第 44、152 行附近改用当前任职与 officeOnDuty()，接通原生收件与案件经办，不读 facts.onDuty 快照；(2) engine.scoped() 第 562 行附近远方会长按 setup 实例化时重复添加已有目录人物的问题，修根因（不制造远方人物、不跳过重复检查）。然后按原卡全部验收命令逐文件单独运行（原卡见 F:/dnd/logs/sessions/s404-offices.body.md 与 s4-plan 第 04 节），另跑 tests/law.test.mjs、tests/s4-perception.test.mjs、tests/s4-layout.test.mjs。
锁定：extension/ 地点菜单相关（另一张卡在改）。最后回复不超过 8 行，同样写到 F:/dnd/logs/sessions/s404b-shared.final.txt。不再启动其他会话或子代理。
