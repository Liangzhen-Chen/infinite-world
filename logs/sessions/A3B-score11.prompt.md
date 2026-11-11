【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 A3-判分器第 11 轮（工作区 F:/dnd-wt/A3B，分支 a3b，已同步 a3a）。项目《无限原野》。只改 tools/a3-score.mjs 及其自检 tests/a3-score-self.test.mjs，不改引擎与语料。最新逐条结果 F:/dnd/logs/sessions/a3-score-v2z.json。
①core:profession.certify 的失败分支契约：现报 “no native failure contract available”。按原生认证失败规则（未达技能/作品门槛时不授证、费用按原生规则、不写认证持有）验证失败分支，正反例自检。②角色端点在空回执时误匹配（A3E-content2b.final.txt 第五节“角色签名空回执错误匹配”）：无回执或回执中无对应角色对方时必须判不匹配，补反例。③tests/a3-score-self.test.mjs 第 190 行附近 “A3 signature r9: role endpoints use resolved counterparties and exact account purposes” 与第 9 轮语料冲突（见 A3B-reg1b.final.txt 第 32 行）：该自检若读的是活语料，改为读冻结快照 tests/fixtures/a3-intents-v2-r7.json 或自带构造的行，保持原断言意图；若是判分器真缺陷则修判分器。跑 tests/a3-score-self.test.mjs、tests/a3-*.test.mjs、CORE；重跑 node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/A3B-score11-score.json。所有 node 加 TEMP/TMP=F:/dnd-tmp，最多 2 个 node。报告 F:/dnd/logs/sessions/A3B-score11.final.txt；回复 ≤150 字。
