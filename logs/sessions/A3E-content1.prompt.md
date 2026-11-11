【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：100 分钟（到 90 分钟时停手写交接）。

卡 A3-内容1（世界内容缺口：职业考官与聚落治理）。工作区 F:/dnd-wt/A3E（分支 a3e，已同步 a3a）。项目《无限原野》Node 规则引擎。依据 docs/架构设计/。最新逐条结果 F:/dnd/logs/sessions/a3-score-v2t.json（a3a：A3 自有 99 题中全通过 91；整组测试仅阶段门槛 1 败）。机制测试固定读 tests/fixtures/a3-intents-v2-r7.json。规则：只动本卡负责模块，共享接线最小登记并在报告列出；不改语料；不造原文没有的权利、同意、任职者或成功；不删改既有断言（过期断言改为验证新真实行为并写依据）。重跑 node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/<卡名>-score.json 报六项指标；跑 tests/a3-*.test.mjs、本卡相关模块测试与 CORE；静态提示 ≤10593。 本卡写 world/（按既有 lore 与数据形状，不改 dist/，每处写依据），可加 world 校验测试。
①全量审计 world/meta/professions.json 的每个职业：世界中是否至少存在一个可到达的、按其认证要求（如“本地行业师傅或登记行会”）有认证权的真实考官（人物 services/职位/行会）；列出没有考官的职业清单。020 的 profession_life_6 已确认缺。按 lore 为缺口职业在合理聚落补考官（人物或行会职位），复用已有人物优先，不复制现成数据。②聚落治理：环城（loc_far_huancheng）settlementGovernment(...).head 为 null——审计所有聚落是否有可派生的治理主体/首长；缺的按 lore 补（组织、职位与任职者），城门/城墙等公共设施归属可派生到该治理组织。③报告列出补了什么、依据、受影响题号（020、088 等）。不改语料。报告 F:/dnd/logs/sessions/A3E-content1.final.txt；回复 ≤150 字。
