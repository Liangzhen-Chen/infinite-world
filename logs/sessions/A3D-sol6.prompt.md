【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 A3-D 第 6 轮（前置失败的结构化拒绝契约）。工作区 F:/dnd-wt/A3D（分支 a3d，已同步 a3a）。项目《无限原野》Node 规则引擎。差距 F:/dnd/logs/sessions/a3-gap-v2i.md、逐条结果 F:/dnd/logs/sessions/a3-score-v2i.json（a3a aee340b7，含判分口径修正）。不改语料 tests/fixtures/a3-intents-v2.json 的 expected/text/setup，不改判分口径；依据写设计文档章节（docs/架构设计/）。重跑 node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/<卡名>-score.json 报六项指标；跑 tests/a3-*.test.mjs、本卡相关测试与 CORE。
问题：“抛错无路由”24 条——world_propose/world_act 在动作已选定后，前置条件不满足时直接 throw 中文 message（code=null），判分拿不到 route、拒绝原因、修复提示或兜底反应。按 06 §6.9–6.11 与 A3 退出标准（不支持率 0、兜底反应 100%），把“已路由、前置不满足”统一改成结构化预览/回执：保留已解析 route/action、稳定 reason code、缺什么与修复建议（可执行的下一步动作或所需条件），零世界效果；需兜底反应的照设计走反应。真正的程序错误仍要抛，不得吞。改公共入口一处，不逐 handler 补 try。判分器若需读取新字段，只做最小读取适配并说明。注意不要把这 24 条里属于 setup 不足的（如案件未登记、距离视线事实缺失）在引擎里放行——只改报告形状。报告 F:/dnd/logs/sessions/A3D-sol6.final.txt；回复 ≤150 字。
