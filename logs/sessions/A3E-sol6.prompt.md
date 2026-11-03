【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 A3-E 第 6 轮（判分工具：能力前置与拒绝条目口径）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3E（分支 a3e，已同步最新 a3a）。你是验收工具作者：不改引擎实现。
1. setup 新增 abilities 字段（{skills:{id:熟练度}, spells:[id], recipes:[id], literacy, licenses:[id]}，出题者正在补入 F:/dnd/logs/sessions/a3-intents-v2.json）：用引擎正式的状态结构为玩家建立这些能力（读现有学习/法术/配方/识字的存档字段与测试夹具做法），建立失败记 setupUnmet。
2. 拒绝条目口径：expected.route 为 reject（或 outOfBounds=true 且应拒绝）的条目，签名判定改为“实际拒绝且已采用效果为空”即签名正确（拒绝后不应有已应用效果；expected.signature 视为被请求的效果仅作说明）。把口径写进工具注释与 a3-intents-v2.md 的“判分口径”节；自检补对应用例。
3. 语料更新后（文件修改时间晚于本卡开始），复制到 tests/fixtures/a3-intents-v2.json 并重跑 → F:/dnd/logs/sessions/a3-score-v2g.json，更新聚类 F:/dnd/logs/sessions/a3-gap-v2g.md。
跑：a3-score-self、CORE。报告 F:/dnd/logs/sessions/A3E-sol6.final.txt；回复 ≤150 字。
