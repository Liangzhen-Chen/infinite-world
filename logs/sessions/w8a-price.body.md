# 卡 W8-A：价格调用迁移（S5-10 余项"迁价格调用"）

先读 F:/dnd/logs/sessions/w8-common.md（共同规则，必须遵守），再读 F:/dnd/logs/sessions/s5w8-survey.md 第 1.1 条与登记表"22 处手填价"。

工作树 F:/dnd-wt/W8A，分支 t-w8a-price。

## 背景
S5 已有估值与市场投影：server-plugin/valuation.mjs（估值角色登记表：物品市场估值、股份净资产、地产租金资本化，无依据标 unvaluable）、market.mjs（marketQuote/区域价）、settlement-trade.mjs regionalTradeBase、tender.mjs（法定单位报价）。但约 20 个文件 36 处仍直接读物品目录的 `basePrice` 当作现价/价值。

## 要做
1. 先列清单：grep server-plugin/ 里所有读 `basePrice` 的地方，逐处判定用途：(a) 现价/成交价/赔偿/罚没估值/税基 等"当下的价值" → 改读市场投影或 valuation 角色；(b) 规则定义里"基准价"本身（如区域价公式的输入、估值函数内部）→ 保留并注释为何保留；(c) 已签合同/历史记录里的冻结价 → 不改。清单写进汇报（处数按 a/b/c 计）。
2. 逐处迁移 (a) 类：选该领域应有的估值依据（买卖用当地市场报价；罚款/赔偿/抵押按 valuation 登记角色；税基按成交额）。若某领域在 valuation.mjs 没有角色，按 valuation.mjs 现有注册方式登记一个新角色（写明依据），不要在调用点手写公式。
3. 无法给出估值依据的（无市场、无同类成交）按 valuation 的 unvaluable 口径处理，回执/文案如实说"无从估价"，不得回落到 basePrice 冒充。
4. 不得改变"已签合同冻结、历史成本不重写"：迁移只影响此后新产生的报价与估值。

## 可改文件
server-plugin/ 下读 basePrice 的文件，**除了** transport.mjs、medicine.mjs、labor-market.mjs、credit.mjs、finance-bank.mjs、engine.mjs、items.mjs、primitives-body.mjs、body-needs.mjs、service-queue.mjs、education*.mjs、entity-view.mjs（这些归其他卡；若其中有 (a) 类调用，列进汇报即可）。可改 valuation.mjs、market.mjs。对应测试与新测试。

## 测试
新增 tests/w8a-price-migration.test.mjs：至少覆盖 罚没/赔偿估值、税基、节庆或婚丧开销、走私货值 各一条，前提用真实动作产生，锚点手算（写清市场报价怎么来）；一条"无市场 → 无从估价"负例；一条"已签合同价不随市场变"对照。另跑：你改到的每个模块的测试、tests/valuation*.test.mjs、tests/s5-0*.test.mjs 中涉及市场的、tests/settlement-trade.test.mjs、tests/ledger-price.test.mjs（慢，约 15 分钟，最后跑一次）。

## 金快照
预期会变：按共同规则出 F:/dnd/logs/sessions/w8a-golden-table.md。
