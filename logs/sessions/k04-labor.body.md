# 卡 K04：家户劳力与保留工资（S5 规律卡，第 2 波）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K04，分支 t-k04-law，基于 s5a 当前头（.base）。范围按 s5-cards.md 的 K04 节：规律、文件所有权、原语、手算与失败路径、验收、并行边界都以该节为准。审计原文：tables/ 中劳动与家户表的 LAB01、HH02。

## 已合入，可直接用
- K02 household-budget.mjs（householdBudget/householdResources/householdBufferTarget/householdOptions、市场替代）。本卡在同模块补时间预算/机会成本派生，不另建第二份出勤账。
- K01 土地估值、K03 业主维护、K12 真实运力。

## 要点
- 劳动选择比较现金/实物报酬与家庭生产、照料、通勤机会成本；同一人的同一段时间只能用一次（种地、打工、照顾家人、赶集）。
- 保留工资因人而异（05 §5.7，种子抽签）；决策带噪声；允许少数人不划算也去或不去。
- 包食与现金分列；缺食识别读营养/用途事实，不按物品名。
- 无照料人不能虚构替工；已签排他时段不被越过。

## 手算锚点
可用480分钟，已需农事180、照料60、通勤60 → 本时段雇工最多180分钟；每分钟2铜实挣360。

## 验收
C；逐文件：labor-market、npc-schedule、npc-obligations、s3-labor-justice、npc-life-health、s5-law-household-budget、新增 s5-law-household-labor（含无照料人、病童、道路中断、排他时段）。agriculture 是长测，列给主会话。新断言按实际分钟与真实库存计算，不调用被测函数自证。
