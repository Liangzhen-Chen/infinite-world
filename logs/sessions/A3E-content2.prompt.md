【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：100 分钟（到 90 分钟时停手写交接）。

卡 A3-内容2（补考官与环城治理）。工作区 F:/dnd-wt/A3E（分支 a3e，已同步 a3a）。项目《无限原野》。上一轮审计 F:/dnd/logs/sessions/A3E-content1.final.txt（第 107–119 行列了缺口与依据）。
主会话决定（用户授权世界内容写 world/）：世界里每个职业都必须至少有一个可到达、按其认证要求有授予权的真实考官，否则该职业在游戏中永远无法认证——这是内容缺口，允许新增有据的考官职位与任职事实。要求：①对审计出的“无考官职业”清单逐个补：优先在已有行会/组织下设考官职位并由已有合格人物任职（按 professions.json 的认证要求，如“本地行业师傅或登记行会”、技能门槛），确无合格者时按 lore 新增人物，写清来源与理由；不复制现成条目、不改 dist/。020 的 profession_life_6（木工）必须在题设地点或其行会可到达处有考官。②环城（loc_far_huancheng）：按地区纲要已有的姓名与职责建立治理组织、首长职位与任职者，并让城门/城墙等公共设施归属可派生到该组织；settlementProfiles 若要求整套人口/村账，按既有数据形状补齐最小一致集合并通过现有校验。③跑世界数据校验测试（tests/ 中 world/lore/schema 相关）、CORE、tests/a3-*.test.mjs；重跑 node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/A3E-content2-score.json，报 020/088 结果。报告 F:/dnd/logs/sessions/A3E-content2.final.txt（补了哪些人物/职位/组织，依据）；回复 ≤150 字。
