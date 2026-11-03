# W8-0 摸底（s5a f04eb933，只读；工作量 小≤半天/中/大）

## 1 S5-10 四项
- 1.1 迁价格调用｜valuation.mjs/market.mjs 已就位，但约 20 个文件 36 处仍直读 basePrice（finance-assets 8、law 3、festival 3、business 3、transport 2、smuggling 2，另 world-events/settlement-trade/npc-crime/military/medicine/labor-market/finance-tax/extraction/elections/dialogue/boss-negotiation/agriculture/primitives-runtime 各 1）｜缺：逐处改读市场投影/估值（已签合同冻结、历史成本不重写）；会动金快照｜大
- 1.2 负重｜world/rules/tables/balance/attributes.json 有 attr.carry（20+2×力量），全库无读取；玩家无上限（仅 ui-personal 显示总负重，pets.mjs 坐骑有载荷检查）；A3V2-048 卡在 body.player.safeCarryKg｜缺：身体派生上限+临时修正不得越上限、拿取/买入/拾取检查、他人搭手｜body-needs/primitives-body/items/engine｜中
- 1.3 服务排队｜slot service:capacity 已声明但仅 entity-view 展示；排队只有 medicine（service-queue.mjs）；education 超容量直接拒绝；讼师/匠人无｜缺：serviceCapacity 经槽派生、通用 urgency 拖延与排队、容量题集≥20（B18.5）｜中
- 1.4 威慑｜combat:deterrence 仅 transport.quoteTransport 使用，base=护卫数/(护卫数+1)｜缺：战力/装备/护送义务/标签输入，遭遇与劫掠候选读取｜transport.mjs｜中

## 2 测试 todo（共 72 行 + a1-daily-probes 循环 21 条）
- 2.1 归 S5 共 11 行（daily-b2）：D25①③、D26①④ 运价/发车表（transport.mjs SPECS 硬编码，carriers/transport.json 表未被读）；D32⑤ health:recoveryRate；D09④ 淋湿 wet 暴露状态；D10⑤ 田地已锄进度；D14 草药分种/季节密度｜缺：对应消费者
- 2.2 疑似已实现、todo 陈旧：D02⑤（market.mjs 已有 side/spread.buy）、D40①（s5-06 有蛋用例）、D27③/D28⑤（标 S3，具名存单已在 S5-03）｜转正式用例｜小
- 2.3 a1-daily-probes:218 循环 21 条理由文字陈旧，无归属；daily-b2 另 8 条无阶段标签（D04 客房占位、D11 月薪、D37①免税口径、D06①步速等）｜需逐条定归属｜小
- 2.4 a3-owner-ding:446 S5 部分已转，余归 S4。归 S4 31、S6 7、S1/S3/A2/A3 17：只计数

## 3 登记表（F:/dnd 版；s5a 工作树版少最后两行）
- 柜台 5/存单 4/组合 4：已兑现（W8a 9cfb34cf，pass 17/42/15 todo 2/4/15）
- 存单挂失补发：已兑现（W1 report_lost）；多法域计价：已兑现（S5-F/F2，默认世界全 coin_river 无可见差别）
- 22 处手填价：即 1.1，未兑现
- A3V2-048：即 1.2。F5 水质定价：market 有单件水质，已具备；E15 香火/E16 丝绸链：W2b 已做；E6 客户订单竞争、E18 降雨落区/香火配额耦合：无代码，未兑现
- A3V2-200–203/216/218/220：见 6

## 4 PLAN 遗留现状
- 钱庄贷款/合伙/典当仍按铜（credit.mjs 仅赊账冻结，finance-bank.mjs 0 处 tender）；替工工钱 labor-market.mjs 无 tender｜中
- 037 赎当回执缺 creditor：repayCredit 仅返回 {debt,repaid,status}+bank，未修｜小
- 存档非整数：numeric-persistence 白名单 13 条，均已写理由；评估即决定改或维持（建议维持，登记 S7）｜小
- 玩家作坊柜台付薪：finance-assets.test 无柜台专用用例｜小
- W3b 随行：伴随者已改真实带路承诺；在途任务（s5-09:283）仍直写 npcAutonomy.tasks｜小
- business.mjs consent:true 现 2 处（server-plugin 共 17 处/9 文件），属 C1，非 W8
- 店存与行囊分离、NPC 店款进店主钱袋：并入 S7，不入 W8

## 5 可玩版本
- 无 AI 框架：tests/helpers/ui-script.mjs（uiSession 走菜单+execute，不调模型）
- 交易：a1-daily-probes、s5ca-commit-semantics 覆盖；播种采收：a3-domain-properties（farm.private_sow/harvest）；存单支取：s5-03-w1、a1-daily-probes D27。均为分散单测
- 缺口：无把三条流程串成一条的通关脚本；无浏览器级验证（m6-03 只测行囊）；无"可玩版本一页说明"｜中

## 6 登记题复跑（全部无需模型，0 调用）
- 意图题：node tools/a3-score.mjs --corpus <fixtures 文件> [--summary]，产出 setupUnmet/路由率；上次结果 logs/sessions/a3-score-v5d.json（10-22）。
- 推演：node tools/probe-score.mjs --run run-001（基线 tests/probes/run-001/baseline.json）。实测 E01/07/09/13/15 共 27 条：合理 5、部分 16、错误 1、缺失 5，远离"100%"，需主会话先界定"S5 负责的子集"（未能确认）。
- a3-score 全量本次 580 秒超时未出结果（耗时>10 分钟，需单独长跑）；10-22 旧结果里 200–203/216/218/220 均为 setupUnmet（A3 自有的 history/accounts 开账与 instances 前提），需跑新结果确认是否仍卡 A3 侧而非 S5。

## 建议分卡（文件互不重叠）
- 卡A 价格迁移（并行）：1.1 除 transport/medicine/labor-market 外各文件；独占金快照重生成
- 卡B 信贷计价+回执（并行）：4 中钱庄/合伙/典当/替工、037 creditor；credit.mjs、finance-bank.mjs、labor-market.mjs
- 卡C 负重（并行）：1.2；独占 engine.mjs、extension/tools.mjs、body-needs/items/primitives-body；顺带 D32⑤、D09④ 若成本小
- 卡D 服务排队+威慑+运价表（并行）：1.3、1.4、2.1 的 D25/D26；service-queue/medicine/education/entity-view/transport.mjs/slots
- 卡E 收口（必须最后）：2.2–2.4 转正、新增通关脚本、登记表与 PLAN 更新、14 类评估、登记题复跑、C.10 九条核对；只动 tests/daily-b2-*、a1-daily-probes、a3-owner-ding、新测试与 docs
