# W8-E6 交接（2026-10-28）

实现已落在工作树，未提交、未部署。四项需求已实现；验收未全绿：finance-assets 的五项旧夹具负重失败待主会话处理，overfit 两项需沙箱外补跑。新增六条手算用例、CORE、同步四件套通过，金快照未重生成且无变化。

## 实现与调用接点

- valuation 增加 baseline 角色，直接复用 economy:value 的基准和修正，不含当地稀缺、不重复应用修正；transport forward 的机会成本读取此角色。
- 法律链路保留 value:null，以 unvaluable/valuationNote 标明“无法核定案值”；扒窃、收赃、火损、玩家/NPC 走私不再转成零。立案、初审及新审理/上诉仅算基础罚则；不登记零元损失，赔偿继续未知，不能按零元结清，返还真实原物仍可办理。
- dialogue、elections、world-events 的赠礼保留未知值和文字回执。standing 只计原有心意基额 3；选举赠礼只计原有基额 2；义务送礼的 kindness 原有非价值部分保留。
- post 把实际抵达时刻交 quoteTransport 选择真实班次。transport 无班次行时随到随走，删除重复的整点模校验，由报价返回的真实发车时刻核验。新用例覆盖非整点班次与无班次。
- compat/v2-phase1-engine 仍被 engine.mjs:17 和 combat.test.mjs:11 引用，保留。其报价改用 marketQuote 与现行 bargain 区间；finance-assets 安装报价函数，避免兼容内核反向依赖 L1。独立运行兼容交易需加载该价格领域运行时；未安装时报无法估价，不退回旧公式。
- labor-market 补货采购改读市场报价，最终按该数量 totalCoins 实付，避免目录价成交和小数落账。
- docs/actions.json 已按最终代码重导；未更改既有测试和断言。

实际改动文件：server-plugin/{valuation,transport,post,law,legal-appeal,npc-crime,smuggling,dialogue,elections,standing,world-events,labor-market,finance-assets}.mjs、server-plugin/compat/v2-phase1-engine.mjs、tests/w8e6-leftovers.test.mjs、docs/actions.json。law 相关和赠礼相关接点属于本卡授权。未改 agriculture、body-needs、environment 及其他会话锁定文件。

## basePrice 排查清单（最终行号）

| 位置 | 处理和理由 |
|---|---|
| transport.mjs:525（旧 525） | 已替换：forward 的机会成本读取 valuation baseline。 |
| labor-market.mjs:285 | 已替换：实际补货成交用 marketQuote；按数量的 totalCoins 扣钱。 |
| compat/v2-phase1-engine.mjs:112（旧 107） | 已替换：marketQuote + 现行 bargain 区间，不保留第二套价格公式。 |
| boss-negotiation.mjs:126 | 保留：W8-A 已注明的巢穴交换目录价值基准，无市场报价。 |
| business.mjs:290、295 | 保留：无历史成交记录时的期初成本与成本分摊，历史成本不按现价重算。 |
| business.mjs:444 | 保留：货架候选的“有估值基准”资格过滤，不拿目录数值成交。 |
| derived.mjs:215 | 保留：economy:value 公式本身的事实基准输入。 |
| finance-assets.mjs:77、94 | 保留：有无估值基准的资格判断；实际存货估值随后走市场派生。 |
| finance-assets.mjs:122 | 保留：期初没有历史记录的成本基准。 |
| finance-assets.mjs:135（同一行两处） | 保留：取得物品的真实总成本按目录相对权重分摊，不作现价。 |
| finance-assets.mjs:138、148、154 | 保留：历史批次成本与期初无记录部分的成本基准。 |
| market.mjs:155 | 保留：抵押物调用市场自身 itemValue 的公式基价，随后应用稀缺/品质/派生修正。 |
| market.mjs:233 | 保留：市场公式自己的缺省基价输入。 |
| market.mjs:278（同一行两处） | 保留：解释中的目录 baseline 与环境比率分母，不用于绕开报价。 |
| market.mjs:325 | 保留：主观报价无记忆时的 catalog_prior；仍进入同一 marketQuote 的估算派生，不冒充已知当地成交价。 |
| settlement-trade.mjs:89 | 保留：区域基准公式起点，随后应用环境、路程、风险、季节。 |
| valuation.mjs:10（新增） | 有无估值基准的资格判断，数值由 explainDerived 读取，不直接拿目录值当基准估值。 |

本树剩余检索未发现 agriculture.mjs、body-needs.mjs、environment*.mjs 的 basePrice 字面调用；这些文件均未触碰。

## 验收结果

所有测试均每个文件一条 node --test --test-isolation=none 命令，最多并发三个 Node。TEMP/TMP=F:/dnd-tmp。PowerShell 对 Unicode 摘要前缀解码异常，过滤模式使用保留 pass/fail 数字行的等价摘要过滤；失败细节只读取单个失败用例末 30 行。

| 文件 | pass | fail |
|---|---:|---:|
| tests/engine.test.mjs | 21 | 0 |
| tests/storage.test.mjs | 12 | 0 |
| tests/plugin.test.mjs | 7 | 0 |
| tests/transport.test.mjs | 9 | 0 |
| tests/post.test.mjs | 6 | 0 |
| tests/w8e6-leftovers.test.mjs | 6 | 0 |
| tests/action-registry.test.mjs | 7 | 0 |
| tests/arch-metrics.test.mjs | 4 | 0 |
| tests/actions-catalog.test.mjs | 4 | 0 |
| tests/numeric-persistence.test.mjs | 1 | 0 |
| tests/advance-registry.test.mjs | 5 | 0 |
| tests/s5-08-w3a-transport.test.mjs | 5 | 0 |
| tests/a3-domain-properties.test.mjs | 11 | 0 |
| tests/law-codes.test.mjs | 6 | 0 |
| tests/npc-relations.test.mjs | 9 | 0 |
| tests/standing.test.mjs | 5 | 0 |
| tests/world-events.test.mjs | 8 | 0 |
| tests/npc-crime.test.mjs | 8 | 0 |
| tests/finance-assets.test.mjs | 4 | 5 |
| tests/overfit-guard.test.mjs | 2 | 2 |
| tests/law.test.mjs | 16 | 0 |
| tests/labor-market.test.mjs | 16 | 0 |
| tests/s4-norm-stack.test.mjs | 12 | 0 |
| tests/combat.test.mjs | 4 | 0 |
| tests/verbs-extra.test.mjs | 15 | 0 |
| tests/a2-dialogue.test.mjs | 8 | 0 |
| tests/deepseek-transport.test.mjs | 5 | 0 |
| tests/s4-trial.test.mjs | 10 | 0 |

CORE 最终已再次逐文件通过；最终 export-actions 完成后 actions-catalog 再次通过。其他通过结果复用未受最终文字回执接点影响的证据。

未跑：tests/w8a-price-migration.test.mjs、tests/ledger-price.test.mjs（按卡片允许，慢测留待主会话）；浏览器测试未跑。未跑全量、build:release、真实提示栈试玩（本卡不是里程碑收口）。

## 未解决的验收项与下一步

1. finance-assets 五项均在真实入囊处被既有负重保护拒绝。tests/helpers/finance.mjs:19 的旧夹具给玩家面包/木料/燕麦各 100；入股用例买回面包时已有约 262.6kg、上限 30kg。四个工坊用例在产物入囊时已有约 217.2kg，加 4.8kg 后超重。失败用例为“商号入股…”、“工坊实际支付…”、“低薪要求…”、“world_time真实离屏…”、“F083…”。本卡 finance-assets 仅加报价安装接点，未改工坊/负重实现；未通过调大容量、虚减重量、跳断言来掩盖。需主会话协调旧夹具/工坊承载路径归属后处理，当前不能宣称该文件验收通过。
2. overfit 的 synonyms 及 allowlist 检查需要 spawnSync('git',...) 读取 master。沙箱实测 status:null、error:EPERM；请主会话沙箱外逐文件补跑。字面扫描与正反控制通过。
3. 法律新用例曾两次因证据不足停块，按规则交 Astra 一次只读规划，经独立核对后采纳：自认 2 + 两名真实目击者各至少 .5 >= 盗窃阈值 3。沿真实偷窃样本和两次 submit_evidence 取得证据，搜索仍限 100 次，所有原断言保留；最终六条全过。无持续卡住的本卡实现块。

## 金快照与数值

advance-registry 5/0，未设置 UPDATE_ADVANCE_GOLDEN、未重生成。无“字段：旧→新”变更需要审核。
numeric-digest 已运行，输出 w8e6-numeric-after.json；full/quiet 状态及全部 functions 摘要与已有 w8e3-numeric-before.json 逐项相同。未改超越函数或数值持久化规则。

## 边界与清理

git diff --check 通过。改动路径未触及 docs/架构设计/、world/design/、dist/、docs/待办.md、docs/问题.md。未改世界内容、未读 secrets.json、未写原存档、未调用 DeepSeek 或其他外部模型 API（Astra 仅做项目要求的只读规划）、未部署、未执行 Git 写操作、未结束任何进程。没有本会话临时调试文件待删；开工即存在的未跟踪 .base 保持原样。PROGRESS/CHANGELOG/当前状态交主会话更新。

