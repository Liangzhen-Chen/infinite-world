# 卡 W2：经营与真实工时（S5-04 收口）

工作树 F:/dnd-wt/S504（分支 t-s504，含 S5-04 前两会话成果 b169e960，已合入 s5a 最新 → ba97085f）。你可以在本分支上自己 git commit；不要 merge、不要切分支、不要动其他工作树。

## 先读
- F:/dnd/docs/产品原则.md；F:/dnd/docs/无限原野_开发指南v3.md 的 C 节、D.1 W2 行、E.1；docs/架构设计/修订记录.md 末节 G0；S5-04 相关设计（docs/架构设计/05、15 中经营/用工小节，以及 PLAN 中 S5-04 条目）。
- 前两会话已做（勿重做）：独立柜台经真实租赁与开户动作建立、本人支用、柜台随遗产；内部调拨不重复征税；库存承诺；主观行情；工钱条款签约冻结（行情变后照原价付、续签用新价）；缺勤/罢工减少工时；恢复 a3-owner-ding 的 4 个 todo。
- 注意：上一会话曾自行重生成 tests/fixtures/advance-registry-golden.json（违反规则），主会话已还原；它当时的改动存在 F:/dnd/logs/sessions/s504-golden-wip.diff（据称仅工价 24→30）。本会话**不得**重生成金快照；若 advance-registry 因有意改动不一致，汇报中逐项列"字段：旧→新、原因、设计条款"。

## 要做
1. **S5-04 第 3 会话计划**：NPC 招工/辞工候选接入真实执行（NPC 自己决定，经现有 npcDecision 路径）；役畜工时派生；客流与香火；丝绸产业链所需的内容补充只走审批管线（不手改 dist/，内容若必须经付费审阅，先停下汇报金额）。
2. **F083（P1）真实到岗**：午夜 present 判断没有到岗/位置谓词，整天的工资和进度照付。改为：雇员在工作时段真实在岗（位置、作息、状态）才产出和计工时；迟到/缺勤按实际在岗时间。测试里删作息、钉住位置的做法要改为真实前提。
3. **F050（P1）配方守恒**：registerRecipe 允许"1 木 → 200 木"这种同资源无转化比的自产。按 G0 第 11 条：只禁止同资源无转化比的自产；产出由材料数量与单位、工具、工时、技能阶段裁决；**不设按估值算的产出上限**。
4. **F025（P1，已收窄）**：店铺账目不得混入玩家个人收支；资本注入不计营业收入；关店保留欠款。核对前两会话的柜台改动是否已经覆盖，没覆盖的补上。
5. **F014（P1）出版重复需求**：同一作品重复出版的固定需求与重复计分去掉，需求按真实买家与市场派生。
6. 做完后，对照 S5-04 设计列出仍未落地的闭环（写进汇报，不要自己扩大范围）。

## 验收（测试前提用真实游戏动作产生，结算数值附手算锚点）
- 玩家能开店、调拨、雇人、看到真实利润与欠薪；注资不计收入。
- 雇员迟到 2 小时、缺勤 1 天：工资/产出按实际在岗时长手算一致。
- 有货、有工位、在岗才生产；"1 木→200 木"配方被拒，给出世界内原因。
- NPC 自己决定应聘/辞职（不能由玩家代填同意）。
- 既有测试不删、不放宽；改断言逐处写设计依据。

## 交卡前必跑（逐文件单独进程，TEMP=F:/dnd-tmp，同时最多 2 个 node 进程，输出只看摘要）
CORE（tests/engine、storage、plugin）；先 `node tools/export-actions.mjs` 再 actions-catalog、action-registry、advance-registry、arch-metrics；tests/s5-04、a3-owner-ding、business-contracts、credit、holdings-reconcile、holdings-roundtrip、save-roundtrip、labor-market/manufacturing 相关测试、ledger-price；本卡新增/修改的测试；tests/overfit-guard。
命令示例：`TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node --test --test-reporter=tap tests/<文件> 2>&1 | grep -E "^# (pass|fail)|^not ok" | head -20`。不读完整输出；单文件超过 20 分钟停掉你自己启动的那个进程，记"超时未完成"。

## 硬约束
不删/跳过测试、不放宽断言；不读 secrets.json；不部署；不改 docs/（actions.json 导出除外）、docs/架构设计/、world/design/、dist/；只结束你自己启动的进程，禁止按名称批量杀 node；临时文件结束前删。发现要大面积改数据形状，停下汇报。

## 汇报（≤300 字）
提交号；新增机制与锚点；命令与结果；金快照差异（若有，旧→新）；S5-04 剩余闭环；偏离；未解决。
