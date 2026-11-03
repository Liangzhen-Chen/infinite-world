【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

卡 A3-A 第 10 轮（独立验收暴露的原语缺陷）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3A（分支 a3a，已合入 A3-E 判分工具与 v2 语料 tests/fixtures/a3-intents-v2.json）。
主会话用 tools/a3-score.mjs 对 v2 语料（120 条，含逐条 setup）实测，完整结果 F:/dnd/logs/sessions/a3-score-v2c.json。最大一类失败：preview 报错“账户键无效：player”29 条、“账户键无效：npc_hw_yanzhe”3 条——自指/人物解析为实体 id 后，transfer 等原语把它直接当账本账户持有人，未经账本的 actor→账户键映射（参照 server-plugin/money.mjs、stock.mjs 中 accountKey/actorId 的用法）。
任务：修原语层账户解析，使人物/玩家/组织/地点等实体作为 transfer 的 from/to 时按账本规则映射到正确账户（行囊、钱袋、公库等按资源与用途），不合法时给出明确拒绝理由。补测试。然后重跑 `node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json` 报各指标变化（不改语料与判分工具）。
跑：tests/a3-*.test.mjs、ledger-reconcile、CORE。报告 F:/dnd/logs/sessions/A3A-sol10.final.txt；回复 ≤150 字。
