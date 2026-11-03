你是独立代码审查者。项目《无限原野》Node 规则引擎（规则引擎是唯一真相源）。用中文汇报。工作区 F:/dnd-wt/A2（分支 a2）。只读审查：不改代码、不做 git 写操作；可以运行测试（node 命令加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp，最多 2 个 node 进程）。

审查对象：git diff master...HEAD（卡 A2：NPC 决策规则骨架、四域主观视图、自治候选、计划、对话动作与面板）。执行者报告：F:/dnd/logs/sessions/A2-sol-001.final.txt（不要轻信）。规格：docs/架构设计/10-现状映射与迁移路线.md 第 99 行（A2 范围与退出标准）、05-统一模型.md §5.7、02-不变量.md I25。

请检查并逐条给出证据（文件:行）：
1. 退出标准逐项：M2 验收 N1–N5、N11、N13 类场景无 LLM 可玩且有脚本化测试？I25 双世界测试是否真正验证主观视图互不泄漏？自治是否改用同一决策规则并采用包动作？
2. 正确性：决策是否确定（同输入同结果）、explain() 是否与实际决策一致、主观视图是否会泄漏 NPC 不该知道的事实、对话动作是否绕过同意规则或替 NPC 填同意。
3. 测试强度：断言是否空泛（只断言“不报错”）、有没有为过测试的特判。
4. 自己跑一遍：A2 新增的 tests/a2-*.test.mjs 与 tests/engine.test.mjs tests/advance-registry.test.mjs tests/save-roundtrip.test.mjs，报告通过/失败数。
结论写 F:/dnd/logs/sessions/A2-luna-review.final.txt。最后回复 ≤200 字：通过/不通过；必须修的问题（按严重度，最多 6 条，每条带文件:行）；退出标准缺项。
