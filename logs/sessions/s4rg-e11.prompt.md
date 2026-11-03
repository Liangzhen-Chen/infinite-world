【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：45 分钟（到 35 分钟时停手写交接）。

# 续卡 s4rg-e11：E11 入会前提改为真实同意

你的 4 个测试修复已由主会话提交（t-s4rg 61b8e7e1）。主会话对 E11 的决定：
- tests/probes/run-001/e11.mjs 的**题目、预期判定和评分不改**（E11 考的是约斗继任，不是入会）。
- 只改场景前提：第 24 行 `org_join(...member:m,consent:true)` 用调用参数替 NPC 填同意，违反新规则。改为让每个 NPC 经现有同意流程自己决定入会：NPC 要求的入会费/条件由玩家用真实游戏动作满足（例如玩家先把所需铜钱交给该 NPC、或按 requestContractConsent 支持的方式由玩家承担费用），然后由 NPC 本人同意。用已有动作，不新增测试专用接口，不直接写 state，不改 organizations.mjs 的同意规则。
- 如果现有动作里没有任何真实方式让 NPC 同意（例如 NPC 的决定与钱无关、给钱也不同意），停下汇报 NPC 拒绝的具体原因，不要改场景其他部分。
- 同样检查 run-001 其他 probe（tests/probes/run-001/*.mjs）里是否还有 `consent:true` 代填 NPC 入会/退会/任命的地方，有就同样处理并在汇报列出。

验收：`tests/s2c-run001r.test.mjs` 5/5；`node tools/probe-score.mjs --run run-001` 无脚本异常、较基线退步 0（沙箱拦 spawn 时用 --test-isolation=none，probe-score 直接 node 跑）；organizations、s4-office-quests 各一次全过。
汇报（≤250 字）：改了哪些文件、NPC 原拒绝原因与用的真实动作、命令与 pass/fail、偏离与未解决。
