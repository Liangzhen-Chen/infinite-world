卡 A2 补完（Codex luna 执行）。项目《无限原野》Node 规则引擎。用中文汇报。工作区 F:/dnd-wt/A2（分支 a2）。沙箱不允许 git 写操作：只用 git status/diff/log/show；改完不提交，由主会话代提交。node 命令加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp，最多 2 个 node 进程。浏览器（Chrome）测试在本沙箱会 spawn EPERM，跳过不算失败，由主会话在沙箱外跑。

依据：独立审查报告 F:/dnd/logs/sessions/A2-luna-review.final.txt；执行报告 F:/dnd/logs/sessions/A2-sol-001.final.txt；规格 docs/架构设计/10-现状映射与迁移路线.md 第 99 行、05-统一模型.md §5.7、02-不变量.md I25。

修：
1. server-plugin/npc-decision.mjs:28,37 一带：公钥拒绝必须进入 explain() 依据，explain 与实际决策一致；补测试断言。
2. I25：在 tests/a2-decision.test.mjs（或新文件）补“秘密会籍”与“standing 立场”的双世界用例：同一事实只在一个世界分支里被某 NPC 知道，另一分支 NPC 的主观视图与决策不得泄漏；断言具体字段，不要只断言不报错。
3. N2 场景脚本化测试（无 LLM 可玩），参照审查报告与指南 N1–N5 的写法。
4. 若时间允许：执行报告里未完成的“部分旧同意路径”改走新决策规则（不得替 NPC 填同意）。
跑：tests/a2-*.test.mjs（UI 浏览器项可跳过）、tests/engine、storage、plugin、advance-registry、save-roundtrip、holdings-reconcile、prompt*（静态提示 ≤12000）。金快照不可重生成。
硬规则：不删/跳过既有测试、不放宽断言；不读 secrets.json；不改 docs/架构设计/；世界内容只写 world/。
报告写 F:/dnd/logs/sessions/A2-luna-fix.final.txt；最后回复 ≤200 字：改了什么（文件）、测试命令与通过/失败数、未完成项。如实写。
