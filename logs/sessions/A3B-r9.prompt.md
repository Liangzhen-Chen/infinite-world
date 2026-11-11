【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 A3-B 第 9 轮（引擎侧真问题：兜底、错拒、可感知性）。工作区 F:/dnd-wt/A3B（分支 a3b，已同步 a3a）。项目《无限原野》Node 规则引擎。逐条结果 F:/dnd/logs/sessions/a3-score-v2j.json；不改语料与判分口径，依据写 docs/架构设计/ 章节。
处理：①兜底未反应 117、120（预期 fallback，现落 clarify）：06 §6.9.5——查为何没有给出兜底选项/反应，修；②088 预期拒绝（初学木工+小刀修整座石门，06 §6.3/§6.7 工具技能工时不匹配），现为实体澄清——在场物解析或越界判定先后顺序问题，修到给出带依据的拒绝；③E-OPEN-ENTITY 错拒 006、057、079，以及 057/091/106 在“主体可感知性”处拒绝（setup 已由加载器真实建立在场人物/拘押/持有）——查可感知性判定是否漏读这些原生状态，修；④054 E-TRANSFER-ACCOUNT、074 E-RITE-SOURCE、078 E-OPEN-OBLIGATION 逐条判断是错拒还是正确拒绝（正确的写依据）；⑤路由名残余：001 wildlife.eat vs eat.meal、047 guide vs guide_request、089 dialogue.tell vs open:proposal、009 pet.feed vs leave_mark——按 06 判定。A3D-r7 正在同一时段改公共入口的拒绝契约（server-plugin/action-rejection.mjs、engine.mjs 边界），不要动这两处。跑 tests/a3-*.test.mjs、相关模块与 CORE；重跑 node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/A3B-r9-score.json。报告 F:/dnd/logs/sessions/A3B-r9.final.txt；回复 ≤150 字。
