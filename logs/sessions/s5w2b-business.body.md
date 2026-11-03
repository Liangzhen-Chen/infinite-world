# 卡 W2b：S5-04 经营剩余闭环

工作树 F:/dnd-wt/S5W2B（分支 t-s5w2b，基于 s5a 最新）。你可以在本分支上自己 git commit；不要 merge、不要切分支、不要动其他工作树。另一张卡 W4 同时在改 market.mjs 的需求/客流、finance-assets、ledger 批次；**本卡不要改 market.mjs、finance-assets.mjs、ledger.mjs**，需要那边的接口就在汇报中写明。

## 先读
- F:/dnd/docs/产品原则.md；F:/dnd/docs/无限原野_开发指南v3.md 的 C 节、E.1；docs/架构设计/修订记录.md 末节 G0；S5-04 设计（05、15 章经营/用工小节，PLAN 中 S5-04 条目）。
- F:/dnd/logs/sessions/s504-business.final.md、s504b-business.final.md 与 W2 的汇报要点（已完成：独立柜台、内部调拨、库存承诺、主观行情、工钱条款冻结、按实到分钟计薪计产、配方同资源守恒、书卖真实读者、资本项、NPC 应聘自决）。

## 要做（W2 交回的 S5-04 剩余清单）
1. **NPC 店主自治**：NPC 店主的进货、定价、用工经现有 npcDecision / 自治候选路径产生并真实执行（钱从其柜台出、货进其店存）；不由玩家代决定。
2. **香火**：寺观的香火收入来自真实来访者的供奉决定（经 NPC 决策与日程），钱进寺观公库账户；不按固定数凭空入账。
3. **丝绸产业链内容**：S5-04 计划所需的新物品与配方，只走审批管线（world/drafts → 审核 → 发布，不手改 dist/）。审核若需付费的 DeepSeek 调用，本卡上限 0.2 元，超过就停下汇报；每次调用如实写入草稿目录的 budget.json。
4. **低薪辞工**：雇员在工钱明显低于当地派生工价时，经 NPC 决策主动辞工（不只欠薪与被挖走）。
5. **工钱走柜台**：商号雇工工钱从该店柜台账户支付，不从店主个人钱袋；柜台不足时形成欠薪债。
6. **店存与行囊分离**：店内存货是店的持有，不与店主个人行囊共用；调拨经已有内部调拨动作。
7. **旧 workshop 路径缺勤**：缺勤时形成欠薪/违约记录，而不是静默跳过。
8. **役畜物种数据**：现有物种缺 labor 声明的，补数据只走审批管线（同第 3 条额度）。
9. business.mjs 里租铺、采购、雇工、售货仍由调用方 `consent:true` 代填：本卡**不改**（同意单入口 C1 统一处理），只列出位置。

## 验收（测试前提用真实游戏动作产生，结算数值附手算锚点）
- NPC 店主一周内真实进货、调价、招工各至少一次，钱货流向可对账。
- 寺观一天的香火 = 真实来访者供奉之和（手算）。
- 柜台不足时欠薪成债，雇员可据此辞工或讨薪。
- 丝绸链：从原料到成品能在真实世界里走通一次（内容经审批发布）。
- 不变量与对账无漂移；既有测试不删、不放宽；改断言逐处写设计依据。

## 交卡前必跑（逐文件单独进程，TEMP=F:/dnd-tmp，同时最多 2 个 node 进程，输出只看摘要）
CORE + tests/invariants/ 全部；先 `node tools/export-actions.mjs` 再 actions-catalog、action-registry、advance-registry、arch-metrics（不得设 UPDATE_ADVANCE_GOLDEN；不一致时列"字段：旧→新、原因、设计条款"）；tests/s5-04、a3-owner-ding、business-contracts、labor-market、manufacturing、works、faith 相关、npc-autonomy 相关、save-roundtrip、holdings-roundtrip、ledger-price；本卡新增/修改的测试；tests/overfit-guard。
命令示例：`TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node --test --test-reporter=tap tests/<文件> 2>&1 | grep -E "^# (pass|fail)|^not ok" | head -20`。不读完整输出；单文件超过 25 分钟停掉你自己启动的那个进程，记"超时未完成"。

## 硬约束
不删/跳过测试、不放宽断言；不读 secrets.json（DeepSeek key 只从环境变量）；不部署；不改 docs/（actions.json 导出除外）、docs/架构设计/、world/design/、dist/；只结束你自己启动的进程，禁止按名称批量杀 node；临时文件结束前删。发现要大面积改数据形状，停下汇报。

## 汇报（≤300 字）
提交号；每项根因与改法；命令与结果；DeepSeek 花费；金快照差异（若有）；仍未完成的 S5-04 项；偏离。
