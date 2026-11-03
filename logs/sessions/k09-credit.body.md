# 卡 K09：季节授信（S5 规律卡，第 3 波）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K09，分支 t-k09-law，基于 s5a@dafae4cd。范围按 s5-cards.md 的 K09 节：规律、文件所有权、原语、手算与失败路径、验收、并行边界都以该节为准。审计原文：tables/ 中信用与债务表的 CR01。

## 已合入，可直接用（只读调用）
K01 土地估值（property / 承租权估值）、K02 household-budget（现钱时间线、缺口、筹措方案 householdOptions 的 fundingOffer 接口）、K05 businessLifecycle 的资金缺口与 funding 路线。K04 家户劳力尚在做，若需要它的收入预测，只读已合入接口，缺的写进汇报，不要等。

## 要点
- 放不放贷、放多少、多久，看已知的还款时点（例如秋收）、在先债权、抵押能否收回、出借方本身的资金约束；利率加价不能代替风险判断。
- 家户筹措候选只在借款人真实可达、出借人知情并同意、真实交付后才增加资源。
- 出借人个体差异与决策噪声按 05 §5.7、14 §14.5.1。
- finance-assets、household-budget、world/meta/rules.json 本波只读。

## 验收
C；逐文件：credit、finance-bank 相关测试（grep）、s3-finance-scenarios、s5-03 系列、npc-obligations、s5-law-household-budget、新增 s5-law-seasonal-credit。
