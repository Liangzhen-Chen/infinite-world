【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 a3h-replay（A3 收口：旧存档回放兼容）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3H（分支 t-a3h，自 a3a）。master（F:/dnd，已落地 S1–S3）是旧版本，只读，不得修改 F:/dnd 下任何文件。

目标（一句话）：在旧版本（master）引擎下产生、含 K2/K6/M4 类事件（交互/效果/法术）的存档，导入新引擎（a3a）后重放得到相同最终哈希、读档投影不变；新原语适配层不会给旧事件补写新回执。

审计疑点（推断，未实测）：server-plugin/interactions.mjs:89、effects.mjs:42、magic.mjs:99 走 native-primitives.mjs:29 → primitives.mjs:223 写持久回执，无事件版本门控；storage.mjs:661 重算旧事件、:665 校验哈希。
步骤：
1. 先实测：在 F:/dnd-tmp 下写临时脚本，用 master 的引擎（import F:/dnd/server-plugin/…）走真实游戏动作产生一份含上述三类事件的存档（不读、不动用户原存档）；把这份由旧引擎真实产生的存档存为测试夹具 tests/fixtures/legacy-r2-primitives.json（这是合法的兼容性数据，不是测试专用接口）。临时脚本结束前删除。
2. 新增 tests/a3-legacy-replay.test.mjs：用 a3a 引擎导入该夹具并重放，断言最终哈希一致、投影一致、无新增回执。
3. 若失败：按事件版本（存档/事件已有的 revision 或版本字段）对旧事件保留旧结算路径，新事件走原语适配；不删哈希校验、不放宽比较。若测试直接通过，说明审计疑点不成立，如实报告，不做代码改动。
可改：server-plugin/interactions.mjs、effects.mjs、magic.mjs、native-primitives.mjs；新增上述测试与夹具。若必须改 primitives.mjs 或 storage.mjs，先停下在报告中说明原因与最小改动（这两个文件有其他卡在用）。锁定：其余文件。
验收：node --test --test-isolation=none tests/a3-legacy-replay.test.mjs tests/a3-native-state.test.mjs tests/a3-legacy-primitives.test.mjs tests/a3-prims-rites.test.mjs
不调用真实模型。预计规模：小到中。
通用：先读 docs/产品原则.md。所有 node 命令先设 TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，测试一律用 --test-isolation=none（沙箱禁子进程），输出过滤为摘要。题集 tests/fixtures/a3-intents-v2.json 与 tools/a3-score.mjs 冻结不改。不为测试新增生产接口、加载器分支或世界内容。最小完整改动，删除优先。改旧测试仅限对齐设计，保留断言意图，逐处写依据。不再启动其他会话或子代理。最后回复不超过 10 行（改动文件、验收命令与结果、偏离卡片处、未解决问题），同样内容写到 F:/dnd/logs/sessions/<卡名>.final.txt。CORE（engine/storage/plugin 三个测试）由主会话在沙箱外跑，你不必跑。
