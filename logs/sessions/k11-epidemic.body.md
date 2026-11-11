# 卡 K11：疫病接触口径（S5 规律卡，第 1 波）

先读：
- F:/dnd/logs/sessions/w8e-common.md（共同规则）
- docs/产品原则.md
- docs/架构设计/07-离屏与性能.md §7.3.1、14-确定性与时序.md §14.5.1（10-29 新修订）
- F:/dnd/logs/audit/LAW-astra-001/s5-cards.md 的 §0（公共约束与共同验收 C）与 K11 全节

工作树 F:/dnd-wt/K11，分支 t-k11-epidemic，基于 s5a@d47ec5c7。

## 任务
按 s5-cards.md 的 K11 节执行：规律表述、文件所有权、原语、手算与失败路径、验收、并行边界都以该节为准。

审计原文在 F:/dnd/logs/audit/LAW-astra-001/tables/10-人口与健康.md 的 POP02，需要时读。

补充两点：
- 随机性与个体差异按 05 §5.7 新增的"差异、噪声与少数行为"条和 14 §14.5.1 执行。共同冲击（同一接触群的疫情）共享事件，不给每个个体独立掷"疫情"。
- 本卡只读 world/meta/rules.json；world/rules/tables/balance/health.json 可改。

## 汇报
按共同规则；另附手算锚点与实测对照表。
