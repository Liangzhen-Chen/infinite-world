# 卡 W8-B：钱庄贷款/典当/替工工钱按法定单位计价 + 037 赎当回执补债权人

先读 F:/dnd/logs/sessions/w8-common.md（共同规则，必须遵守），再读 F:/dnd/logs/sessions/s5w8-survey.md 第 4 节，以及 F:/dnd/logs/sessions/s5f2-contracts.body.md（S5-F2 的做法，本卡照同一路径）。

工作树 F:/dnd-wt/W8B，分支 t-w8b-credit。

## 背景
S5-F/F2 已让赊账、住宿、租铺、押金、雇工、进货借款在签约地法定单位 ≠ coin_river 时冻结为"资源+整数数量"，统一走 server-plugin/tender.mjs 的 contractTerms/contractFreeze；付款换币按付款时兑换上取整、零头归收款方；显示用 claim-unit.mjs 的 claimUnit；托管实物用 goods-escrow.mjs。还没改的：钱庄贷款（finance-bank.mjs）、典当（credit.mjs 当物借款/赎当）、合伙出资与分红、替工/零工工钱（labor-market.mjs）。另：037 当物赎回回执缺债权人——core:trade.redeem 的 repayCredit 只返回 {debt,repaid,status}+bank。

## 要做
1. 钱庄贷款、典当借款与赎当、替工工钱：签约地法定单位 ≠ coin_river 时条款冻结为同一资源整数单位（contractFreeze 同一路径，不另造换算）；同一合同所有金额字段同一单位；还款/赎当/付薪可换币，规则同 S5-F。利息按冻结资源计，舍入规则写明（借方不得因舍入少付、零头归债权人）。
2. 合伙出资与分红：先 grep 它在哪个文件。若在 credit.mjs/finance-bank.mjs/labor-market.mjs 里就一并改；若在 finance-assets.mjs 或 business.mjs（归卡 A），**不要改**，写进汇报。
3. coin_river 法域（默认世界全部如此）行为与现在完全一致：金额、回执、文案、账本都不变，金快照应不变。
4. 037：赎当回执补 creditor（当铺/钱庄主体 id 与名称），与其他债务回执字段口径一致；把 tests 里相关 todo（grep 037 / redeem）转正式用例。

## 可改文件
server-plugin/credit.mjs、finance-bank.mjs、labor-market.mjs、tender.mjs（只追加导出，不改已有函数行为）、goods-escrow.mjs、claim-unit.mjs；extension/mail-view.mjs 或 state-notices.mjs 中仅限这几类合同的显示文案；对应测试与新测试。

## 测试
新增 tests/w8b-credit-tender.test.mjs：沿用 tests/s5-f-tender.test.mjs / s5-f2-contracts.test.mjs 的"改写三个法域法定单位的测试世界"做法；用真实动作产生：钱庄借款按券冻结并按券还、汇率变化后本金不变、换币还款上取整零头归钱庄、典当借款与赎当同一单位、替工工钱按券付、coin_river 法域对照不变、037 回执含 creditor。另跑：tests/credit.test.mjs、finance-*.test.mjs、labor-market.test.mjs、s5-03*.test.mjs、s5-f-tender、s5-f2-contracts、a3 中 037 所在测试。
