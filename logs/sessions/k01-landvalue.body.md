# 卡 K01：土地估值与签约依据（S5 规律卡，第 1 波）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K01，分支 t-k01-law。范围按 s5-cards.md 的 K01 节。审计原文：F:/dnd/logs/audit/LAW-astra-001/tables/ 中土地与租佃表的 LAND01。

## 已有，不重做
- finance-assets.mjs:fieldRentBasis（按亩、选作物、年产量×签约当地报价×惯例份额 3/10 → monthlyAnchor）；rent_in/rent_out 签约冻结 rentBasis；部分先付、约定到期、余款形成 rent 义务。
- 3/10 是待标定惯例，本卡不改。

## 要做（按 K01 节）
1. `registerValuer('property',…)`：田地按自身产出派生估值（产量×报价，扣去出租时只得租金净收益，不重复计自营产出），建筑按服务收益与 condition；土地价值不随建筑 condition 变化，随真实地力/产量变化。
2. rentBasis 补齐可追溯依据：产量与报价的时点和来源、份额来源，写进签约快照；旧约不随现价改变，新估价/新约随现价改变。
3. 核对 s5-cards §0 列的四个待核点（租入/租出延期是否对称；报价带是否把双方同意的例外价误作绝对拒绝；延期被拒后现付是否真能选；到期未收作物条款），沿真实路径验证，确有错才修，没错写证据。
4. 无可知报价或产量时，给出"缺依据"失败，不用默认值顶上。

## 手算锚点
2亩×每亩年产120×签约价3铜×3/10=216铜/年，月锚18；改1亩为9；现价变6只影响新估价/新约。

## 验收
C；逐文件：finance-assets、w8e8-premises、s3-finance-scenarios、w8a-price-migration、新增 s5-law-land-value。s5-playthrough 是长测，不跑，列给主会话。
