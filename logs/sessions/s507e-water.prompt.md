【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

# 续卡 s507e-water：完成 S5-07 最后一项（正式求雨绑定）

主会话沙箱外复核：你的工作区门禁仅 a3-builder-ui 失败，单跑 1/0（负载偶发）；overfit 4/0。按你上一会话的交接，剩余"正式求雨绑定"（E18 神迹争夺：求雨/降雨落区与受益村、香火、后续配额的正式内容绑定）尚未完成。请完成：内容经审批管线发布（L2 DeepSeek 审阅属已授权额度，上限 0.2 元，报实际花费）；对应机制断言含手算锚点；然后对照 s507-water.body.md 原卡全部要求逐条自查，列出"已做/未做"。
不要自己跑慢档测试；交卡后自动门禁会重跑。汇报 ≤250 字（UTF-8，F:/dnd/logs/sessions/s507e-water.final.md）。
