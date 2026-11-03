【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 卡 s509c-remote：S5-09 第 3 会话（修门禁回归）

第 2 会话的门禁（与共同基线 adb09c69 两次独立复跑对照）发现以下 5 项基线两次都通过、本卡失败，均为真回归。修实现，不改这些测试（导出类除外）：
1. tests/actions-catalog.test.mjs「actions.json 是最新导出」——运行 `node tools/export-actions.mjs` 重新导出，确认差异只来自本卡。
2. tests/education.test.mjs「统计层按种子人口与学馆容量授业，分段与重放一致，接近后还原技能且不重算」
3. tests/mining-jurisdiction.test.mjs「展开的远方郡按各自统治政体的九省法典立案：王国寒炉与赭牙部盟的盗采分别判罚」
4. tests/s3-e04.test.mjs「E04-3: upper court, stolen provenance, receiving case and witnessed report」
5. tests/scale.test.mjs「统计层只留住区聚合；接近后种子重放逐字节恢复身份，保留已参与事件的整户」（2 个用例）
这些很可能都与你第 2 会话改的 remote-generation/population、advance-registry/npc-schedule 中"推进前恢复、钉住者保留"有关：物化/并回改变了展开郡的人物身份、技能或事件参与者。逐个查根因。

（tests/baseline/regression.test.mjs 的 23 项是历史预期失败、tests/probes/run-001 超时，都不归本卡。）

逐文件跑上述 5 个 + tests/s5-09.test.mjs、wildlife-encounters、CORE。不跑慢档。汇报（≤250 字，F:/dnd/logs/sessions/s509c-remote.final.md）：每项根因与改法、测试结果。
