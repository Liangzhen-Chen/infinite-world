【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 续卡 s501d-derived：从中断处继续（上一轮因"Selected model is at capacity"被平台中断）

你的 s501c 改动仍在工作区（derived.mjs、primitives-runtime.mjs、subjective-view.mjs、load-world.mjs、tests/s5-01.test.mjs，未提交）；主会话已删除你的临时 .s501c-* 文件。当前 tests/s5-01.test.mjs 为 22 过 1 败。请从中断处继续完成 s501c 卡的全部要求（见 F:/dnd/logs/sessions/s501c-derived.body.md：自查表、补齐属于 S5-01 的项、机制断言、验收），并写 UTF-8 交接 F:/dnd/logs/sessions/s501c-derived.final.md。临时文件请写到 F:/dnd-tmp，不要放在工作区根目录。
