你是 A3 意图语料的原出题者（续）。项目《无限原野》。工作区 F:/dnd-wt/A3CORPUS（只读参考，已切到最新 a3a）。仍不读 server-plugin/、extension/ 的引擎代码；可以读 tools/a3-score.mjs 中 setup 加载部分，只为了解当前支持的结构化 setup 字段形状（instances/holdings/status/abilities/present/inventory/coins/minute/location 等）。
背景：执行侧报告多条失败源于“意图原文陈述的事实只写在 setup.facts 文字里，没有结构化建立”，见 F:/dnd/logs/sessions/A3E-r7.final.txt（24 条逐条：文本是否陈述、缺什么字段、建议形状）、A3B-r8.final.txt（逐条误澄清：缺债据/质押/报价/局部分区/机关实例/考官授权等）、A3C-r7.final.txt（如 030 湿衣服 moisture）。逐条结果 F:/dnd/logs/sessions/a3-score-v2j.json。
任务：
1. 逐条判断：意图原文明示或必然隐含的既成事实（已立案的案件、存款余额、债务/借据/质押、报价、当值时刻、在场机关或可感知目标的距离视线、局部分区、湿衣服等），用结构化 setup 建立；现有加载器不支持的字段，按建议形状写入并在 a3-intents-v2.md 的“加载器待支持字段”列出（由执行侧实现）。意图本身就是测“未立案/没钱/不在班/看不见”的，不补，并在复审记录说明。不得为了让动作通过而补原文没有的事实。
2. 085、086、087 缺独立执行输入：按与其他条目相同的方式补 proposal/input（你独立写，不看实现）。
3. 执行侧对 expected 提出的设计冲突，由你按设计文档逐条裁定并记录理由（可改可不改）：019 研究立项是否应含 learn；029 即兴制作失败；制造类 expected 的账户端点写法（sink:craft、recipe_xxx->self 对比 01 §1.6/§1.12 的 sink:consume/src:craft——判分侧将按账本语义做端点对应，你只需保证语义正确）；021/022/103 制造检定失败无产出（判分侧将对带检定动作分别验证成功分支与失败分支，expected.signature 写成功分支；若某条本意是测失败，加 expected.checkOutcome:"failure"）。
直接改 F:/dnd/logs/sessions/a3-intents-v2.json 与 a3-intents-v2.md；不改 id 与 intent 原文。回复 ≤100 字。
