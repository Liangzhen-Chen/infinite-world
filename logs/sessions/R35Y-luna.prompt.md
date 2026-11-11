【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
【省额度规则】测试命令一律加过滤：`node --test --test-isolation=none <文件> 2>&1 | grep -E "^ℹ (pass|fail)|^✖|^not ok" | head -40`；禁止读完整输出；细节只看单个失败用例最后 30 行。不要反复全量重跑：每个文件修好后只跑一次确认，最后统一跑一次验收组。
沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 3 个 node 进程。用中文汇报。分诊详情：F:/dnd/logs/sessions/R35B-triage.md。

卡 R35Y。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/R35B（分支 r35b）。
1. 继承时点（主会话已裁定）：tests/entity-life.test.mjs 6 项、tests/npc-life-health.test.mjs、tests/npc-life-t164.test.mjs 共 8 项期望“死亡当刻继承人到账”，与 docs/架构设计/04-转移协议.md §4.4（遗产为临时法人，经各阶段期限后分配）冲突。把这 8 项改为：先推进过遗产各阶段（recordEntityDeath 缺省 {notice:DAY,filing:DAY}，见 F:/dnd/logs/sessions/R35X-sol.final.txt），再做原有全部断言（继承人身份、人口/遗产/义务/组织空缺/宠物/契约守恒逐项保留，一项不删、不放宽）；在改动处加注释“依 04 §4.4 遗产分配在阶段期限后”。
2. tests/festival.test.mjs 与 tests/festival-runtime.test.mjs：有未来义务占用活动窗口、睡眠、远方的人被节日移入现场（期望 no-attendance，实际 held）——修实现（节日参与判定读义务占用/在场），不改断言。
3. tests/entity-transitions.test.mjs 剩余 1 项（升格通知只在批准后产生）——修实现。
4. tests/world-events.test.mjs K10 订阅者列表：若差异只是 S2c 依设计新增的订阅者（organization_succession、governance_vacancy 等），更新期望列表并注释来源；若有顺序错误则修实现。
5. tests/reputation-law.test.mjs 裁判见证入口碑——修实现。
跑上述文件 + tests/transition-*、tests/s2c-*、CORE。报告 F:/dnd/logs/sessions/R35Y-luna.final.txt；回复 ≤150 字。
