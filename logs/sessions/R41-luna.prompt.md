【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

卡 R41（R39/R40 引入的两处结构回归，主会话已定位）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/R39（分支 r39，已含 R39/R40 并合入最新 master）。
1. tests/arch-metrics.test.mjs：新增 4 条 L0→L1 向上依赖，都在 server-plugin/advance-registry.mjs：liveNation（noble-state.mjs，第 451 行 nations 系统的 nextMinute）、sameScheduleInputs（education-state.mjs，第 160–161 行）、facilityRuntime（facility-state.mjs，第 192 行）、withScheduleCache/sameNpcScheduleInputs（npc-schedule.mjs，第 94、203 行）。按项目已有的注册注入做法（L1 模块向内核注册，内核只认接口；参照 S3-I 对义务内核的注册方式，git log -S registerObligation 或 grep register 于 advance-registry/engine），在 advance-registry 增加小型钩子注册接口，由这 4 个 L1 模块在自身加载时注册；钩子缺失时取保守行为（不复用缓存/不跳过运行），不改变结果。不许把违例加进基线。
2. tests/holdings-writers.test.mjs：两处未经 holdingSet/holdingRemove 的记录写入：advance-registry.mjs:458 `d.remove(['state','records',key])`（local_actor_position 清理）与 npc-schedule.mjs:306 `d.set(['state','records',regionProgressKey(...)])`。按 server-plugin/holding-sources.mjs 的包装与写入者登记规则改为包装写入并登记写入者（参照同文件中已有调用，例如 npc-obligations.mjs 的 holdingSet/holdingRemove 用法）；若这两类记录确实不是持有来源，则按该测试的豁免机制登记并写明理由。
修后跑：这两个测试、tests/advance-registry.test.mjs（金快照不变）、tests/invariants/i31-total-order.test.mjs、tests/holdings-reconcile.test.mjs、CORE；并运行 `node F:/dnd-tools/bench-farm-pests.mjs 30 2` 一次确认未明显变慢（当前约 64 秒）。
报告 F:/dnd/logs/sessions/R41-luna.final.txt；回复 ≤120 字。
