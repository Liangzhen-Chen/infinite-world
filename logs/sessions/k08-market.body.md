# 卡 K08：集期与市场消费者（S5 规律卡，第 3 波）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K08，分支 t-k08-law，基于 s5a@dafae4cd。范围按 s5-cards.md 的 K08 节：规律、文件所有权、原语、手算与失败路径、验收、并行边界都以该节为准。审计原文：tables/ 中市场表的 MKT02、MKT03（S5 部分）。

## 已合入，可直接用
K02 household-budget（消费/缓冲/市场替代、householdOptions）、K12 真实运力（运单、在途、到站领取）、K05 business 续营（本卡在 business.mjs 只改客流与服务相关函数，不动 K05 的 businessLifecycle/operatingOptions）。

## 要点
- 集日只是约定碰头的日子：有没有货，看是否真有人带着货来；赶集、补货、套利只用本人可知的信息，并计入真实的路程、运输和储存成本。
- 顾客花钱接 K02 预算，不再按"钱袋固定份额"无条件花光积蓄。
- 保留 MKT01 已修的深度例外（双方约价不受深度拦截）和 K02 的储备。
- 个体差异与决策噪声按 05 §5.7、14 §14.5.1；完整搜价/传闻选择归 S6，不在本卡。

## 验收
C；逐文件：shop-restock、business-contracts、s5-02、s5-05（若超 40 分钟列主会话）、w8e6-leftovers、settlement-trade、s5-law-household-budget、s5-law-business-lifecycle、新增 s5-law-periodic-market。
