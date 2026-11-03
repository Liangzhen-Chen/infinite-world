【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

卡 a3wh-scenario（A3 试玩准备：第五条闭环“奇思妙想”的试玩场景）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3WH（分支 t-a3wh，自 a3a）。先读 docs/产品原则.md（一.1 最自由、二.3 尊重想象力）与 docs/A3-交付物与试玩方案.md 第二节。

目标（一句话）：新增一个 8–20 回合的真实试玩场景 tests/playtests/a3_whimsy.json，让玩家用自然语言做注册动作清单之外的事——例如把河水净化后装壶卖钱、在墙上刻下记号并引起路人反应、提出一个世界规则不允许的要求而得到世界内原因与可行替代——每回合都有能由引擎状态验证的断言。

要求：
1. 格式与现有场景一致（参考 tests/playtests/npc_quest_social.json、craft.json、trade.json；tools/playtests.mjs:38 要求 8–20 回合且每回合有断言）。requirements 引用 A3 的设计条目编号（如开放提案、裁剪、mark 反应、拒绝替代），从 docs/架构设计/06 与 docs/A3-交付物与试玩方案.md 查证，不编号。
2. 断言只验证引擎可验证的事实（库存、钱、记录、关系、回执状态 committed/refused、回执中有 reason 与 alternatives/repair 字段等），不验证叙述文字；不预设玩家一定成功——裁剪、拒绝也是合法结果，断言写成“状态与回执一致”。
3. 所有用到的地点、人物、物品必须是世界里真实存在的（rg world/ 核对 ID）；不得为场景新增世界内容。
4. 用现有离线校验检查场景结构（rg tests/playtest-runner.test.mjs 及 tools/playtest*.mjs 中的 schema/结构校验，运行不调用真实模型的那部分）；不调用真实模型。
5. 另外在报告里估算：五条闭环（lodging/trade/credit 合为河湾吃住交易一条可从现有场景选、craft、literacy、npc_social 或 npc_quest_social、a3_whimsy）各选哪个场景、各多少回合、合计回合数。
可改：新增 tests/playtests/a3_whimsy.json。锁定：其余所有文件。
验收：离线结构校验命令通过（写出具体命令与结果）；node --test --test-isolation=none tests/playtest-runner.test.mjs。
预计规模：小。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要。不再启动其他会话或子代理。最后回复不超过 10 行（新增文件、校验命令与结果、五条闭环的场景与回合数、未解决问题），同样写到 F:/dnd/logs/sessions/a3wh-scenario.final.txt。
