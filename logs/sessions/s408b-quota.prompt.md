【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

续做 s408-quota（同一工作区 F:/dnd-wt/S408；主会话已把未完成改动提交为 WIP，并合入最新 s4a，含 03 法域规范栈与 A3 回归修复）。你报告“改任被 org_join 的真实同意前提阻塞，最小接点为 server-plugin/action-registry.mjs:65–104 与组织同意入口”。主会话授权你修改 action-registry.mjs 与组织同意入口所在模块（逐处列出）：按设计决定 B（任免只走章程里明确的任免链），任命/改任由有任免权的机关作出，被任命者以真实动作表示接受（或章程规定的同意来源），不得用调用参数代填同意，不放宽同意校验。然后完成原卡剩余验收（原卡 F:/dnd/logs/sessions/s408-quota.body.md 与 s4-plan 第 08 节），逐文件单独运行；浏览器类列出交主会话。
锁定：tools/arch-layers.mjs、tools/system-map.mjs、server-plugin/environment*.mjs（另一张集成卡在改）。最后回复不超过 8 行，同样写到 F:/dnd/logs/sessions/s408b-quota.final.txt。不再启动其他会话或子代理。
