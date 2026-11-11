# 卡 W8-D：服务排队 + 威慑 + 运价/发车表（S5-10 余项）

先读 F:/dnd/logs/sessions/w8-common.md（共同规则，必须遵守），再读 F:/dnd/logs/sessions/s5w8-survey.md 第 1.3、1.4、2.1（D25/D26）条；docs/架构设计/ 中服务容量/排队/urgency 与威慑的段落（grep "serviceCapacity" "排队" "urgency" "deterrence" "威慑"）；指南中 B18.5 容量题集要求。

工作树 F:/dnd-wt/W8D，分支 t-w8d-service。

## 背景
- 服务排队：槽 service:capacity 已声明但只在 entity-view 展示；真正排队只有 medicine（server-plugin/service-queue.mjs）；education 超容量直接拒绝；讼师、匠人无排队。
- 威慑：combat:deterrence 只在 transport.quoteTransport 用，base=护卫数/(护卫数+1)。
- 运价/发车表：transport.mjs SPECS 硬编码；world/ 下 carriers/transport.json 表未被读取（D25①③、D26①④ todo）。

## 要做
1. 服务排队通用化：serviceCapacity 由服务者的槽与在岗状态派生（不手填）；service-queue.mjs 做成通用队列（先到先得 + urgency 加权拖延规则以架构文档为准；文档没写的按"急症/急务优先，其余先到先得，回执写明排第几、预计何时"）；education、讼师（legal-representation）、匠人（manufacturing/repair 中的委托）接入同一队列，超容量排队而不是直接拒绝（若文档要求拒绝则按文档）。medicine 改用通用实现且行为不变。
2. 容量题集：按 B18.5 要求补到 ≥20 题（放在现有题集目录与格式里，grep B18），题目前提用真实动作。
3. 威慑：deterrence 输入扩展为 战力/装备/护送义务/标签（以规则表与架构文档为准，规则表缺字段时只追加字段，不改已有数值）；遭遇与劫掠候选（grep 劫/robbery/encounter 的候选选择处）读取同一派生威慑值。
4. 运价/发车表：transport.mjs 改读 world/ 下的 carriers/transport 表（硬编码 SPECS 移入数据表或改为读取，数值保持一致使默认世界行为不变）；D25/D26 todo 转正式用例。transport.mjs 与 medicine.mjs 中直读 basePrice 的地方（摸底 1.1 列出）也由本卡按卡 A 同一口径迁到市场报价/valuation 角色（只读调用 valuation.mjs/market.mjs，不改这两个文件——它们归卡 A；需要新估值角色就写进汇报）。

## 可改文件
server-plugin/service-queue.mjs、medicine.mjs、education*.mjs、legal-representation.mjs、manufacturing.mjs、repair.mjs、entity-view.mjs、transport.mjs、transport-route.mjs、劫掠/遭遇候选所在文件（先 grep 确认，若是 engine.mjs 则不要改、写进汇报）、world/ 下 carriers/transport 与 slots 相关数据（只追加或搬移硬编码，数值不变）；对应测试与新测试。

## 测试
新增 tests/w8d-service.test.mjs：容量 1 的大夫两位病人第二位排队且回执写明位次；急症插前；学堂满员排队；讼师/匠人排队；威慑随护卫装备变化（手算）；运价读表与原 SPECS 数值一致。另跑：tests/medicine*.test.mjs、education*.test.mjs、transport*.test.mjs、legal-representation*.test.mjs、daily-b2-*.test.mjs、受影响模块测试。
