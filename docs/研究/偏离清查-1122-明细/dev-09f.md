共 5 条，甲 0 乙 5 丙 0，有理由 0 无理由 5。
读了：卷三乙 :1712-1806、:1277（R-6）、:1316-1329（§4.8.5 例 1/例 4）；卷六 :138-167、:252-291、:405-449、:480-519、:910-923、:1178-1222；卷二十六全文 Grep "demand|需求日量" 0 命中（该卷是心理需求，非市场 demand），只按命中读了 :538-564 心理需求段。代码：server-plugin/kernel/valuation.mjs :1-404、server-plugin/price.mjs :1-73、server-plugin/demand.mjs :1-137、server-plugin/kernel/validate/price-tables.mjs :1-43；另 Grep 了 server-plugin 的 import 边、world/ontology/dimensions/_vocab.json 的 puse_frame/puse_basis。没读到：server-plugin/market.mjs（§4.2 市场投影，不在本卡文件清单）、kernel/recipe.mjs 的实现（只按 valuation.mjs 的调用点核，未读实现）。
demand.mjs 已有部分（折算、窗口、成交取均价/众数币）核过，与卷六:499、:918 一致，未列偏离；价格四角色的未建路由见"已登记未建"。

### 1 V-4 容器内容物与附件的整体估值未做，且不记缺口
- 位置：server-plugin/kernel/valuation.mjs:257-340（subjectOf 只取模板/实例/批次自身，itemValue 只算单件与批次件数）
- 设计原文：卷三乙:1734 "整体估值：容器 = 自身 + 内容物；带附件者 = 自身 + 各附件；批次 = 件数 × 单件"。
- 代码实际：itemValue 只乘材质、成色、新鲜项并对批次乘件数，容器内容物与 attachments 既不加、也不进 gaps/partial。
- 理由：无正式裁定（6-9 回报"偏离与说明"第 6 条自述"V-4 容器与附件整体估值…只做了批次"；docs/审查/6-9-Sonnet只核-1120.md:24 判可封，未入裁定/勘误/问题.md）。
- 影响：读数错（装着东西的容器、带附件的实例估值偏小，且 value 不带 partial，调用方看不出少了什么）
- 严重程度：乙（暂未在玩法路径上对装内容物的容器估过值）
- 合并：无

### 2 priceFor 不读用途行的 subjectCtx，也不交给价格槽
- 位置：server-plugin/price.mjs:65-72（priceFor 全程没读 row.subjectCtx）
- 设计原文：卷六:1214 "用途行的 `subjectCtx` 非空时…`priceFor` 把它原样交给价格槽，作为修正项 `when` 的求值上下文"。
- 代码实际：priceFor 只读 role/frame/includesScarcity/liquidationCurveKey/basisRule，subjectCtx 从不读取，routeWorth 也只调 valuation，没有任何价格槽接点。
- 理由：无（只在 docs/审查/卷六-v3单核.md:111 向卷二请求登记过程上下文族，无裁定/勘误/问题.md 记录）。
- 影响：规则缺（带 subjectCtx 的用途行会按无上下文求价，本应只在特定查询参与的修正项被静默忽略）
- 严重程度：乙
- 合并：无

### 3 V-1 质量链判据只认 reaction，漏掉"不指名物品"的产出
- 位置：server-plugin/kernel/valuation.mjs:128-129
- 设计原文：卷三乙:378（R-6 甲）质量链"用于带 `reaction` 或不指名物品的条目"；:1731 V-1 "基础产出件数用基础留存率 `r0`（R-6）"。
- 代码实际：byRecipe 只把 `out.reaction` 存在时判为质量链（返回 gap `pricing_mass_chain_unbuilt`）；`out.item` 为空且无 reaction 的产出按件数链 `÷ out.qty` 算，而该条目的 qty 在卷文里表示质量分配权重。
- 理由：无（注释只写"R-6 甲：件数要消耗质量与反应产率"，未提不指名物品；6-9 回报第 2 条也只列"带 reaction 的产物"）。
- 影响：读数错（若出现 item 为空、无 reaction、qty 为数字的配方，valueBase 会把质量权重当件数）
- 严重程度：乙（现行数据里未见到这类被估值的配方）
- 合并：无

### 4 估值单位 'copper' 写死在两处，未读物品表头 unit
- 位置：server-plugin/kernel/valuation.mjs:34、server-plugin/price.mjs:20
- 设计原文：卷三乙:179（物品表头 `valueBase` 登记 `unit`）；:1722 "`valuation(...)` → `{value: Fact 铜, …}`"。
- 代码实际：两处都把单位写成常量对象 `UNIT = {copper:'copper'}`，不读物品表头已登记的 unit。
- 理由：无（公共部件审查-乙-1122.md 第 2 节第 5 点、第 13 条、清单第 11 项已记，计划并入 6-12；未入裁定/勘误）。
- 影响：只是形式（当前值与表头一致，不产生错数；但属"写死"红线）
- 严重程度：乙
- 合并：见 docs/研究/公共部件审查-乙-1122.md 第 2 节第 5 点、第 13 条、清单第 11 项

### 5 价格/需求/估值整条链在游戏路径上没有生产调用者
- 位置：server-plugin/price.mjs:65（priceFor 入口）、server-plugin/demand.mjs:102（唯一调 priceFor 的地方）
- 设计原文：卷六:280 "`priceFor` | `(puseCode, subjectRef, ctx)` | Fact{value, role, explain}"；卷六:262 "`demand` | … | Fact{perDay, parts}"；卷三乙:1722 "全书估值只有这一个入口（台账 I-02）"。
- 代码实际：server-plugin 里没有模块 import demand.mjs；price.mjs 只被 demand.mjs import；valuation 只被 price.mjs 与加载校验 import。除测试外无生产调用者，估值/报价/需求链在游戏里不可达。
- 理由：无（公共部件审查-乙-1122.md 第 2 节第 3 点、清单第 14 项已记，接线归 6-12；未入裁定/勘误）。
- 影响：玩法不可达（报价与日需求目前只能在测试里跑）
- 严重程度：乙
- 合并：见 docs/研究/公共部件审查-乙-1122.md 第 2 节第 3 点、清单第 14 项

## 已登记未建
- V-1 选择器：嵌套 `req`、`matcats`/`where`、`classes` 配 `pool`、选择器组合、质量链 reaction（valuation.mjs:90、:92、:93、:100、:128；卷三乙:1731）；登记：docs/卡回报/ds-b6-9.md 偏离 2、docs/审查/6-9-Sonnet只核-1120.md:24。
- 装饰项 beauty×beautyValue + 名气加成 renownBonus（含 ctx.scope 转传）（valuation.mjs:333；卷三乙:1733）；登记：docs/迁移体检/块6.md:153、:159，docs/卡回报/ds-b6-9.md 偏离 3，docs/审查/6-9-Sonnet只核-1120.md:19。
- 取向、故障、附魔等登记修正项未读（valueBase 只套品质档）（valuation.mjs:282-283；卷三乙:1732）；登记：docs/迁移体检/块6.md:155（modifier.mjs 写者归块 7）。
- V-6 表象：实例带 purports 且调用方给 frame 时按未知带缺口，不按 purports 代入（valuation.mjs:303-304；卷三乙:1736）；登记：docs/卡回报/ds-b6-9.md 偏离 5、docs/审查/6-9-Sonnet只核-1120.md:17、:24。
- 价格四角色里 prole_trade（6-12）、prole_term、prole_gate 三条路由未建，返回 `price_route_unbuilt:<角色>`（price.mjs:54-55、:70-71；卷六:1186-1189）；登记：docs/审查/6-9-Sonnet只核-1120.md:19，docs/卡回报/ds-b6-9.md 偏离 6（本卡第③项要求单列）。
- 急售折价曲线 `market.liquidationCurve` 与当地日成交量未建（price.mjs:38；卷六:1200）；登记：docs/审查/6-9-Sonnet只核-1120.md:19、docs/卡回报/ds-b6-9.md；6-12。
- `basisRule` 与 `ctx.scope` 未传给 valuation（price.mjs:35；卷六:1200）；登记：docs/审查/6-9-Sonnet只核-1120.md:19（交 6-12 与卷二十三卡）。
- price-tables 对 liquidationCurveKey 只核形状、不核所指（price-tables.mjs:3、:38；卷六:144）；登记：文件头自述，6-12 建表（price.mjs:6 同）。
- demand 四来源 use/derived/replace/stockup 的输入未建，四项按未知带缺口、perDay 为 null（demand.mjs:110-136；卷六:492-497）；登记：docs/审查/6-11-Sonnet只核-1120.md:18、:26-29、:45（上一轮已登记，本卡只核已有部分）。
- registerValuer 无生产登记方（地产、合同债权、牲畜等别类实体估不出）（valuation.mjs:239-244；卷三乙:1724）；登记：公共部件审查-乙-1122.md 第 2 节第 3 点。

## 拿不准
- V-1 `items` 的"首个模板"：代码 `[...c.items].sort(cmp)[0]` 取字典序最小（valuation.mjs:96-98），卷三乙:1731 只说"首个模板"，没说按列表序还是代号序；若指列表首项，选不同物品时参考价值会不同。需卷二/卷三乙定。
- V-1 "基础产出件数用 r0"（卷三乙:1731）与 §4.8.5 例 1"除以基础产出件数 1"（该配方 yield:1、wasteFraction:0.05 → r0=0.95，卷三乙:1318）字面冲突；代码只除 out.qty（valuation.mjs:130、:147），按例 1 不算错。卷文措辞待勘误。
- demand.mjs 的 habitualOf 只核用途行 includesScarcity 为假，不核 role 是估值角色（demand.mjs:101）；docs/审查/6-11-Sonnet只核-1120.md:12 小备注判"不会出错数，只是报错点在下游"，是否补 role 核待 6-12 接线时定。

## 跨卷待判
- subjectCtx 的取值族：卷六:144 说"取值族是过程上下文表的代号族，由卷二登记"，卷二现无该族（卷二:1476 只有过程上下文修正管线；docs/审查/卷六-v3单核.md:111 已向卷二请求登记）。price-tables.mjs:38-40 只核 string/null、price.mjs 不读该字段；判"校验缺失"还是"等卷二词表"，要读卷二才能定。
