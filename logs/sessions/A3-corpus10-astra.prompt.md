【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

你是 A3 意图语料的原出题者（续）。工作区 F:/dnd-wt/A3CORPUS（只读参考，已切到最新 a3a），不读 server-plugin/ 与 extension/。
1. A3V2-020（木工认证）：世界内容已补真实考官——灯桥工匠会任命尹葛（npc_hw_yinge）为木工考官，按其任职在白石商旅行会联络处 bld_bs_guild 验样（职位与时段见 world/lore/factions.json 的 offices、world/people/baseline.json 中尹葛作息）。现评分报“无法唯一找到题设地点的合格考官”。按意图原文判断：原文若是“去找考官认证”，则场景应设在考官当值的时刻与地点、present 列入考官（时刻须与其作息/职位时段一致，不得让人物违背作息出现）；若原文只是找登记员办手续，则 expected 应为登记/转交而非直接认证。
2. A3V2-088（城门）：内容卡已建立环城治理——城墙、石门等公共设施归 faction_huancheng_government（郡署），现任首长可派生。语料里自建的 a3v2_088_stone_gate 的 owner、permits.issuer、history.actor 写成了地点 loc_far_huancheng，按 05 §5.3 改为该治理组织/现任首长（保持原题“能力越界须拒绝”的本意）；空间部分仍归 S4，不必改。
直接改 F:/dnd/logs/sessions/a3-intents-v2.json 与 a3-intents-v2.md（复审记录逐条写依据）；不改 id 与 intent 原文。回复 ≤80 字。
