【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 卡 s509b-remote：S5-09 第 2 会话（先修回归，再补余项）

第 1 会话已由主会话提交到 t-s509（a0d9fcf4）。门禁（r3，与共同基线 adb09c69 两次独立复跑对照）发现 1 个真回归，必须先修：
- tests/wildlife-encounters.test.mjs「绕行从已抵达节点重新计时；返回与观察不会重新抽取同窗口或生成动物」：基线两次都通过，本卡失败。你改过 server-plugin/wildlife.mjs（物化标记）和 remote-generation.mjs，查明是哪处改动让绕行/返回时重新抽取或重新生成了动物，改实现，不改该测试。
（scale 在共同基线上同样失败，是老问题，不归本卡。）

然后做上次交接的余项：人物账户的退出并回、跨郡/降层 churn，并补对应的手算锚点。约束同第 1 会话；不跑慢档、不自己跑全部 affected；交卡后门禁自动跑。

汇报（≤300 字，F:/dnd/logs/sessions/s509b-remote.final.md）：回归根因与改法、余项改动、锚点、测试结果、偏离、是否还需第 3 会话。
