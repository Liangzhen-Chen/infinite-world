【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 A3-A 第 1 轮（原语内核、RX 与共用权限接点；迁移核心阶段 A3）。项目《无限原野》：中西合璧修仙文字 RPG，Node 规则引擎是唯一真相源。工作区 F:/dnd-wt/A3A（分支 a3a，基于最新 master：S1/S2/S3/A1/A2 已完成）。
卡定义：F:/dnd/logs/sessions/A3-astra-plan.md 的“A3-A”一节（第 57–81 行）与第 8 条文件所有权；只改 A3-A 拥有的文件。另有执行者在 F:/dnd-wt/R39 改推进性能（advance-registry、npc-schedule、npc-obligations、storage），本卡不碰这些文件；engine.mjs 只做 A3-A 必需的接线并尽量集中、少量。
本轮目标：交付原语内核与权限接点的可测试骨架（primitives.mjs、primitive-policy.mjs、rx.mjs、action-authority.mjs、action-consent.mjs、action-capacity.mjs），把接口签名与必填事实写进报告“接口”一节，供 A3-B/C/D 使用；完成计划中 A3-A 的第一批验收测试。整卡规模大，本轮做不完正常——按小步完成，到时限写清已完成/剩余/下一步。
设计依据：docs/架构设计/06-动作层与开放动作.md、05-统一模型.md 原语、02-不变量.md 相关条目、docs/待用户确认.md 用户玩法决定（两层动作、LLM 提原语由引擎校验、不支持率为 0 兜底为带标签实体、d20 避开 SRD 受限部分）。静态提示 ≤12000（A1 口径 10593 的测试仍须通过）。
跑：计划所列 A3-A 验收文件（能跑的）+ CORE。金快照不可改。
报告 F:/dnd/logs/sessions/A3A-sol.final.txt；回复 ≤200 字：交付接口、测试结果、剩余项。
