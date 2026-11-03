你是《无限原野》的执行会话（Sol）。工作目录 F:/dnd-wt/W5S（分支 w5s）。遵守 AGENTS.md（全部原创）与 docs/PLAN.md 开头规则（含“派生优先”）；不启动其他会话。node_modules 与 SillyTavern 用 cmd /c mklink /J 联接到 F:/dnd 下同名目录，清理时不得递归删除。不合并 master，不用 git stash，不读 secrets.json（DeepSeek 只用环境变量 DEEPSEEK_API_KEY），不碰 dist/。沙箱拦截 git 时改动留在工作区由主会话代提交。测试加 --test-isolation=none。
卡 W5 收尾（docs/PLAN.md「## 剩余工作总表」W5 条）：
1. 白石归途殿“借凳归途日”没有主办人：候选季澄 npc_bs_076_1。按派生优先原则，让其作息在节日当天到归途殿门廊（作息派生自其职务/习俗，而不是硬改一个时间表；若现有作息系统只能写作息数据，就写进作息数据并说明），并调整该节日的发布状态，使 tests/w5-festival-publication.test.mjs 中“等候主办人的节日不能预约”断言对它不再适用（因为已有主办人），断言本身不改。
2. 炭阶地宫、苔灯坞、榆根里、裂炉营四处 T157/T159 聚居地组织对 T142 远方势力的反向关系缺失（原审核正文不能改）：按 T110/T111 补反向关系的做法，把反向关系写进独立数据（如 rules 或关系覆盖表），由加载器合并；关系值要与远方势力一侧的已有关系对称合理。若需要新写叙述性事实，走 L1→真实 L2→L4（≤0.3元，独立预算账），否则不调模型。
不加工具，静态提示增量0；不放松或删除已有断言。
验收：node --test tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs tests/w5-festival-publication.test.mjs tests/festival.test.mjs tests/festival-runtime.test.mjs tests/faction-clock.test.mjs tests/standing.test.mjs tests/monster-society-content.test.mjs tests/data-coverage.test.mjs；buildWorld 临时目录发布构建。最后合 master 再跑 CORE。
最后回复不超过8行：改动、验收结果、L2（若有）、偏离、未解决，同样写到 F:/dnd/logs/sessions/W5S-sol-001.final.txt。
