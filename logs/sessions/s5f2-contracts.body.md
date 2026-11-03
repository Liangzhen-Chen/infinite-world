# 卡 S5-F2：住宿与经营合同按法域法定单位冻结（接 S5-F）

工作树 F:/dnd-wt/S5F2（分支 t-s5f2，基于 s5a 7863a6a0）。你可以在本分支上自己提交（`sh F:/dnd-tools/guard-commit.sh F:/dnd-wt/S5F2 "<msg>" <路径...>`，它先跑 overfit-guard）；不要 merge、不要切分支、不要动其他工作树，不要用 git stash。另一位执行者在 F:/dnd-wt/S5W5 做数值纪律（超越函数近似、世界时钟、可能动 currency.mjs 的数学部分）；本卡不要改数学近似相关代码。

## 背景
- S5-F（已合入 s5a）：server-plugin/tender.mjs 提供 tenderUnit / tenderQuote / contractTerms / paymentPlan / payInKind / repaymentPlan / claimCopper；商品赊账已按"所在法域法定单位的资源+数量"冻结（contracts.mjs chargeTrade 的 terms），还款可换币按还款时兑换，零头留给债权人；显示单位用 claim-unit.mjs 的 claimUnit。测试 tests/s5-f-tender.test.mjs 里有改写三个法域法定单位的测试世界做法，可照用。
- 遗留（S5-F 执行者评估）：住宿与经营合同仍全部按铜计——engine.mjs 住宿段约 L632–641；business.mjs 约 L115、L150（租金 cost、押金 escrow）；credit.mjs 的 openLoan（雇工、进货本金）；contracts.mjs repayDebt 里同步 `contract.paid`。只改信用部分会让合同字段单位不一致。
- 判据（指南 D.1 S5-F 行）：报价单位、实际币种付款、合同资源、成交统计分币种；不改账本格式；同一商品跨法域报价可不同；不产生小数活羊；**旧债本金不随汇率改写**。

## 先读
F:/dnd/docs/产品原则.md（北极星）；指南 E.1 第 6–8 条；tender.mjs 全文；上面列的代码段。只汇报与本卡相关的部分。

## 要做
1. 住宿与经营合同（租铺、押金、雇工工资、进货/采购借款等）在签约地法定单位 ≠ coin_river 时，合同条款冻结为"资源 + 整数数量"，一律走 tender.mjs 的 contractTerms 同一路径，不另造换算。合同内各金额字段单位必须一致（同一合同不得一部分按铜、一部分按券）。
2. 付款与还款：按冻结资源支付；用别的币种支付时按支付时兑换率换算、向上取整成整数单位、零头留给收款方（与 S5-F 同规则）。押金退还按冻结资源原数退。
3. 法定单位 = coin_river 的地方（默认世界全部如此）行为与现在完全一致：金额、回执、文案、账本都不变。金快照若变化，**不要重生成**，汇报变了哪些字段及原因。
4. 文案与提示中这些合同的金额按 claimUnit 显示。
5. 测试：在 tests/s5-f-tender.test.mjs 追加（或新建 tests/s5-f2-contracts.test.mjs）用例，前提用真实动作（租铺、雇工、住宿）在改写过法定单位的测试世界里产生，每条带手算锚点注释：住宿按券冻结；租铺租金与押金同一单位；兑换率变化后合同金额不变；换币付租按支付时兑换取整；押金原数退还；coin_river 法域行为不变。不得删测试、不得放宽断言；受牵连的旧测试逐处写依据再改。

## 跑
新测试；s5-f-tender；你改到模块对应的测试（business-contracts、credit、contracts、lodging/住宿相关、s5-0x 系列中涉及租铺雇工的）；tests/overfit-guard.test.mjs；`tests/invariants*.test.mjs`；tests/advance-registry.test.mjs。命令一律 `TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node --test --test-reporter=tap <文件>`，只看 `# pass`/`# fail`/`not ok` 行。若要改 extension/tools.mjs，静态提示必须仍 ≤10593（用 loadPromptBundle 的 estimatedTokens 核对）。

## 进程规则
只结束你自己启动并记下 PID 的进程，禁止按名称或批量杀 node；同时最多 2 个 node 测试进程。临时文件放 F:/dnd-tmp，用完删掉（只删你自己建的）。

## 汇报（≤300 字）
改了哪些文件；哪些合同类型改成冻结资源；命令与 pass/fail 数；金快照是否变化；偏离本卡的地方；未解决的问题。不要贴完整代码或完整日志。
