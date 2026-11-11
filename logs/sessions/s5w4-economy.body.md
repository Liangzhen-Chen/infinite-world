# 卡 W4：经济守恒接线（S5 收口）

工作树 F:/dnd-wt/S5W4（分支 t-s5w4，基于 s5a 最新）。你可以在本分支上自己 git commit；不要 merge、不要切分支、不要动其他工作树。

## 先读
- F:/dnd/docs/产品原则.md；F:/dnd/docs/无限原野_开发指南v3.md 的 C 节、D.1 W4 行、E.1；docs/架构设计/修订记录.md 末节 G0（第 3 条写回不丢原始事实、第 7 条价格四角色、第 11 条配方）；15 章 §15.1.1（在场或载体）、§15.2（估值与供需）。
- 已合入、勿重做：W1 信贷、W2 经营（独立柜台、按实到计工、配方守恒）、W3 运输与借出。

## 要修（审计已交叉核实）
1. **F048（P1）**：payDividend / rentDue 直接 financeTransfer，收付双方不在场也没有载体。按 15 §15.1.1 改为：在场交付，或经已有载体（账户托付、汇票、代收人、承运）结算；都不具备时形成到期应付（真实债务），不凭空转账。
2. **F058（P1）**：持有估值回落 basePrice，组织/地点没有该字段，股份、地产在责任上限里按 0 计。改为经估值角色派生（看 market.mjs 的 economy:value 与 derived 槽），没有可派生依据时如实标"不可估值"并在责任上限计算里明确处理，不能静默当 0。
3. **F007（P1）**：质押、典当、遗产、责任上限的估值绕开市场。统一走估值角色（不是成交价）。
4. **F026（P1，含客流）**：店铺货架需求只读 3 家静态店，其余聚落非口粮需求退化为 1，系统性压价。需求改为读全部派生商铺与全部聚落的真实居民需求；供给计入全部持有者（这一条是设计，保留）。在此基础上补"客流"：玩家或 NPC 营业时，附近真实居民按其需求、钱袋与距离产生购买决策（经现有 NPC 决策/日程路径，NPC 自己决定买不买），不刷出凭空顾客。
5. **F014 遗留**：W2 卖书时"可花钱袋的四分之一"是写死的 /4。改为从现有规则/参数派生（找商店客人已有的同类参数；没有就在 world/rules 现有表里登记一个参数，经 export 与 actions 同步，不写进代码字面）；买不买由 NPC 决策路径决定，而不是按识字排序自动指派。
6. **F010（P1）**：本地补货仍来自 import 源。改为来自真实上游（承运到货、本地生产）；确无模拟范围内来源的，保留 import 但必须带运费/关税等真实成本并在回执里写明来源。
7. **F071（P1）**：donate 用当日新批次覆盖账本 lot（ledger.mjs:205 附近 `{...l,...(lot??{})}`），旧粮刷新保质期。改为保留转出批次的原始元数据（G0 第 3 条）。
8. **F072（P1）**：releaseFish 用无 selection 的 itemDelta 扣首项，放归标记打在 target 上。改为扣实际被放归的那一件。
9. **F085（P1）**：义务回写时 legacy.kind 被规范种类覆盖（pawn/player_loan 丢失），通用 settle/collect 不恢复。回写保留业务子类型。
10. **F075（P1）**：研究阶段可降到 0 而 ceiling 以原型 power 兜底（焰矢 16 伤 1 MP 可登记）。阶段下限与 ceiling 按实际阶段派生。
11. **F043（P3）**：捐粮回执分"实收 / 交割损毁"，贡献按实收计。

## 验收（测试前提用真实游戏动作产生，结算数值附手算锚点，不用被测函数算期望值）
- 每项至少一条手算锚点测试；客流：玩家开店营业一天，附近有需求、有钱的真实居民前来购买，人数与成交按其钱袋/需求手算可验；没有需求或没钱的人不来。
- 不变量 I1/I2/I15/I16 通过；对账（tests/helpers/ledger-audit）无漂移。
- 既有测试不删、不放宽；改断言逐处写设计依据。

## 交卡前必跑（逐文件单独进程，TEMP=F:/dnd-tmp，同时最多 2 个 node 进程，输出只看摘要）
CORE（tests/engine、storage、plugin）+ tests/invariants/ 全部；先 `node tools/export-actions.mjs` 再 actions-catalog、action-registry、advance-registry、arch-metrics（不得设 UPDATE_ADVANCE_GOLDEN；若因本卡有意改动不一致，列"字段：旧→新、原因、设计条款"）；tests/ledger-price、ledger-stock、market 相关、finance-assets、s5-02、s5-03、s5-03-w1、s5-04、s5-05、works、s2c-estate、save-roundtrip、holdings-roundtrip；本卡新增/修改的测试；tests/overfit-guard。
命令示例：`TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node --test --test-reporter=tap tests/<文件> 2>&1 | grep -E "^# (pass|fail)|^not ok" | head -20`。不读完整输出；单文件超过 25 分钟停掉你自己启动的那个进程，记"超时未完成"。

## 硬约束
不删/跳过测试、不放宽断言；不读 secrets.json；不部署；不改 docs/（actions.json 导出除外）、docs/架构设计/、world/design/、dist/；只结束你自己启动的进程，禁止按名称批量杀 node；临时文件结束前删。若某项需要大面积改数据形状，停下汇报。新增世界参数只能在 world/rules 现有表里登记，不新建内容文件。

## 汇报（≤300 字）
提交号；每项根因与改法；命令与结果；金快照差异（若有）；偏离；未解决。
