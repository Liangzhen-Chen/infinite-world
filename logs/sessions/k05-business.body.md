# 卡 K05：经营续营与退出（S5 规律卡，第 2 波）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K05，分支 t-k05-law，基于 s5a 当前头（.base）。范围按 s5-cards.md 的 K05 节：规律、文件所有权、原语、手算与失败路径、验收、并行边界都以该节为准。审计原文：tables/ 中生产与资产表的 AS02。

## 已合入，可直接用（只读调用，不改其参数形状）
- K01 土地/资产估值（finance-assets property 估值）；K02 household-budget（现钱时间线、缺口、筹措方案）；K03 building-maintenance.mjs:maintenanceOptions（修/暂缓比较）。

## 要点
- 续营还是暂闭、转让、退出，看未来增量收益、现金周转缺口与转换成本；过去已花掉收不回的钱不进判断。
- 资金一时周转不开，可以暂闭或借贷，不直接判永久失败；关门不抹债，欠薪欠租照旧。
- 出售经营不得同时保留同一经营权/库存；有资产但没有买方，不能自动变现。
- 店主个体差异与决策噪声（05 §5.7，种子抽签）：允许个别人赌气关店或硬撑亏本，但不允许整类店铺系统性同时倒闭。
- 本卡独占 world/meta/rules.json 的经营段（经营计划期、转换成本等）；现有参数能表达时不新增。

## 手算锚点
未来收入20、未来可变成本18、过去不可收回成本100 → 续营增量收益2（不是−98）；现钱1、第2天需付5、第5天才收20 → 显示资金缺口，可暂闭/借贷。

## 验收
C；逐文件：business-contracts、finance-assets、shop-restock、labor-market、s3-obligation-state、新增 s5-law-business-lifecycle。s5-playthrough 长测列给主会话。
