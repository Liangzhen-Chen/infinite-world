【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

【交卡前必跑（10-26 起）】交卡前逐文件跑完以下检查并在汇报中写结果；不过的先修，不要留给门禁：
- CORE：tests/engine、tests/storage、tests/plugin；
- 同步四件套：先 `node tools/export-actions.mjs` 重导，再跑 tests/actions-catalog、tests/action-registry、tests/advance-registry、tests/arch-metrics。**不得重生成 advance-registry 金快照**（不得设 UPDATE_ADVANCE_GOLDEN）；若它因本卡有意改动而不一致，在汇报中逐项列出"字段：旧→新、原因"，由主会话审核后统一重生成。
- 本卡新增或修改的测试，以及本卡直接改到的模块的同名测试；
- 自查改动路径：不得触及禁区（docs/架构设计/、已审 W1 骨架 world/design/、dist/、docs/待办.md、docs/问题.md）。确有必要改的，停下写进汇报。
限时：300 分钟（到 290 分钟时停手写交接）。

# 卡 TFB：城镇粮食供应链 B——产地售粮、实运实售

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。设计依据（必读）：F:/dnd/logs/arch/townfood/design.md（astra 审计，含文件:行证据与手算）。本卡实现其中"B 产销"。

## 背景
白石镇登记 90 户 30 天 2700 户日中约一半缺粮，缺粮日镇上零售端无食品货架：村里有公仓余粮（agriculture.mjs:141/:213/:237），镇上铺子能收货（shop.mjs:402 收到站运单、:427 买在场货），但没有任何人主动把余粮卖出、运到镇上（settlement-trade.mjs:197 只在双公仓之间；K08 有消费无生产者发货；K12 有收货无主动采购发运）。

## 要做（按设计 §3，派生，不按名字特判）
1. 新模块 server-plugin/food-supply.mjs：planFoodSupply / advanceFoodSupply。产地（有公仓或私粮的聚落/家户）余粮 = 真实库存 − 自用到下次收成前的缺口 − 种粮 − 已签交付（预期产量不是现货）。经营者（公仓管理人或有权出售的人）按真实获知的报价（观察/消息，不全知）与净收益（扣运费、税、误工）决定售/运/不动，允许拒卖（噪声沿 14 §14.5.1）。
2. 运输：复用 transport.mjs 的 bookTransport/collectTransport（CT07 已合入车行等客与逐日行程钟点）；无车则人力分趟，运量受真实运力与负重限制。到场后经 K08/K12 现有成交路径卖给镇上铺子/集市；拒绝、腐坏、封路、损毁沿原账。
3. 镇上铺子的补货目标 = 供给间隔需求 − 库存 − 有效在途；数量 = min(真实余粮、运力、需求、现金/到岸价)。生成县同用此规律（行商不刷新）。
4. 性能：边界重算、聚落索引/路径缓存，持久量只增在途单与聚落统计，不新增逐户日写。
5. 不实现城镇抽象人口需求（卡 A，后续）与燕麦加工（卡 C）：本卡验收看"粮食实物真实到达镇上货架并被登记户买走"，加工成可食口粮另卡。若铺子只能卖不可直接食用的燕麦，如实报告到户营养缺口。
## 文件所有权
新建 server-plugin/food-supply.mjs；agriculture.mjs、shop.mjs、transport.mjs、advance-registry.mjs（daily 块接线）、settlement-trade.mjs（如需）、tools/arch-layers.mjs、tools/system-map.mjs、world/meta/rules.json 的新规则段与对应测试。不改 npc-life.mjs、household-budget.mjs、npc-state.mjs、household-subsistence.mjs（K16 在改）。
## 验收
共同规则清单（同文件逐子测对照）；新增 s5-law-food-supply 机制测试（两个镇及一个生成县实运实售；双卖/未知报价拒绝；封路/货损/无人接货；重放一致），手算锚点；跑 agriculture、shop-restock、settlement-trade、transport、s5-law-periodic-market（保留 :180/:194/:385"无货不生货"断言）；settlement-trade.test.mjs:81/:120 及 advance-registry 锚点变化逐字段解释（金快照字段表 TFB-golden-table.md，不重生成）；30 天审计：白石镇货架食品到货量、被登记户买走量。汇报 ≤300 字。
