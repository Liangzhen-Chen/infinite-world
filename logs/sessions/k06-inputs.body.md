# 卡 K06：生产投入与季节机会（S5 规律卡，第 3 波）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K06，分支 t-k06-law，基于 s5a@a3125085。范围按 s5-cards.md 的 K06 节：规律、文件所有权、原语、手算与失败路径、验收、并行边界都以该节为准。审计原文：tables/ 中生产与资产表的 AS03、土地表的 LAND02。

## 已合入，可直接用（只读调用）
K04 npc-state.mjs:householdWorkTime（家户时间预算，结构派生）与 labor-market 结薪口径；K02 household-budget（种用/食用/承诺分配，种子只扣一次）；K01 fieldRentBasis 与签约快照契约。

## 文件边界（本波与 K08、FXE6 并行）
- 可改：agriculture.mjs、domain-rules.mjs:privateCropYieldBase 及作物规则消费、world/meta/rules.json 农业段。
- finance-assets.mjs：**只允许改 fieldRentBasis**（若年茬预测与实际可播可收不一致）；recordFinanceSale/成本分摊链本波归 K08，不得触碰。
- 不改 market/shop/business/npc-state/labor-market；需要接点写进汇报。

## 要点
- 作物（及其他生产）的预期回报必须用实际可投入的劳力、工具、种子和有效农时：种子不够就不能得整块地的产出（允许部分种植则按合法面积）；已签雇工时段不能同时算作田间劳力；农具或设施瓶颈不因多雇人消失。
- 签约预期的年茬数必须能在声明的播期/生长期内真实完成；跨季与灾害改变真实产量，但不倒改已签定额租。
- 分批搬运不能重复收获；同一份种子/同一段工时只用一次。
- 个体差异与噪声按 05 §5.7、14 §14.5.1（例如播种时机的个人偏好），共同冲击（天气灾害）整片地区共享。

## 验收
C；逐文件：agriculture（长测：若超 40 分钟列主会话外跑）、finance-assets、w8e8-premises、w8c-carry、seasonal-hazards、s5-03-w1、新增 s5-law-production-inputs（明确"同份种子/工时只用一次"）。s5-playthrough 留主会话。
