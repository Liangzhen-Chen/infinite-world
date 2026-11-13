模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷零 第二版 · 复审 B

对象：F:/dnd/docs/统一底层设计/卷零-覆盖表.md（1121 行，§8 为修订记录）。
方法：只做静态阅读，逐条到 F:/dnd/server-plugin 与 extension 核对 file:line。没有运行任何代码。

## 结论：有条件通过

第一版的 8 条必改，7 条已解决，1 条部分解决（M4）。第二版抽查的 file:line 全部吻合，没有发现残留的关键词或最长匹配，也没有暗含专项字段。需要补的有 3 处小的必改（R1–R3），都不推翻方案。

## 一、M1–M8 逐条判定

| 编号 | 判定 | 落实位置与说明 |
|---|---|---|
| M1 两种模式 | 已解决 | L785（口径）、L788、L795–825（每行分“不开 AI / 开 AI”列）、L941 与 §0.5 S2b（L36：不开 AI 禁 includes/正则/indexOf，只许 `===`；拔掉输入边后动作仍可由菜单到达）。检索扩展归卷九 §4.19，不再放显示层（L809–810、814）。 |
| M2 逐行列出 | 已解决 | L828–897 逐行列出 60 行，含我指出的 :13、:14、:64、:181、:191、:204，并说明与 06b 的 44 行的口径差（L831–832）。L930–939 的统计算术对：30（15+10+5）+60（7+53）+10（1+9）=100。 |
| M3 claimSchema 扩展 | 已解决 | L918–928：kind 注册表、subject 为 id、predicate 为维度代号、value、polarity，沿用 modality、time、references。不再有 craftClaims/paymentClaims。引文同一性检查登记为 S2 例外（L834、§0.5 S2）。 |
| M4 安全三项 | 部分 | 去向都有（L808、824、825、909），屏蔽词三处出处列全（L791：consistency-service.mjs:259–265、consistency-review.mjs:256–257、population.mjs:409）。缺口见 R1。 |
| M5 6.1 升级 | 已解决 | L969、L151/L357/L568 三处口径统一为纳入，并标“需报李白”。 |
| M6 3.6 升级 | 已解决 | L966：写明 28 个 domain 各一段专项逻辑，改为数据表，检定调用带 `domain` 代号。 |
| M7 火器引用 | 已解决 | E9 已改为 PLAN.md:277（核对一致）；E10（L1018 附近）如实记录 spells.json/w2-s1 的“登记火器”并说明词义不同；E5 已改标“架构需求文档”，并说明世界设计册对“爆竹”仍为 0 命中。 |
| M8 grep 反例与“同源” | 已解决 | L955–992：valuation:33、interactions:13/109、derived:15/107 已补。8.8 现有自己的证据（transition.mjs:579–591，我核对：:582 `kind:'wreck'`、:587 salvage 取调用方参数）。10.26 现有 standing.mjs:25 `STANCE_VALUE={敌对:-60,…}` 和 :61（核对一致）。13.8 如实写“未找到独立代码，待卷核”，这是诚实的处理，不算缺陷。S1 的 id 前缀判型口径在 L43。 |

## 二、§3.5 抽查

**散点 30 行：抽查 22 行**，code 与处置全部吻合。
- 抽查行：action-router 75/123/262/263/421/678、action-constructor 34/38、action-time 15/23、action-registry 139、retrieval-lexicon 19/31/33、scene-card 109/113/133、npc-memory 205、education 30、activities 257、high-nobility 48、consistency-evidence 162/165–167、population 384/392/407/409/411。
- 不开 AI 列只剩菜单显示名 `===`，或模板字段、菜单分组代号，没有残留关键词或最长匹配（action-time 的最长匹配已删，action-registry:139 的打分检索已删）。
- 翻不出来时退回菜单：L785 总则，L801（421 行）与 L804（38 行）明写。其余行靠总则覆盖，可以接受。
- 总数核对：移出 15、改代号 10、删除 5，合计 30，与 L934–936 一致。

**consistency-review 60 行：抽查 24 行**，均吻合：:26、33、74、78、167、172、173、194、198、211、217、220、222、234、235、241、242、247、253、256、257、274、277、364。
- :253 的 `startsWith('方家')` 特判被明确删除（L885），是好的处置。
- :74、:235 用 `npc_` 前缀加名字 includes，归“名字→id 在输入边”，处置对。

**claimSchema 是否通用**：通用。kind 是规则表注册表行，每行登记允许的 predicate 集合与 value 类型，新错误类型加一行即可。未发现暗含专项字段。两点建议，不阻断：
1. 现有 `modalities`（consistency-review.mjs:309：fact/intention/reported/question/figurative）没有“假设/条件”一类。:13、:157、:214 的“如果/假如”被映射到现有枚举，会塞进 intention 或 question 而失真。建议加 `hypothetical`。
2. `kind:'meta'`（:192）和 `figurative` 是让 AI 给自己的文字打标。若 AI 不打标，检查就被绕过。它们只产生 warning 级问题，可接受，但应在注册表里标明“自报类，只许 warning”。

## 三、§3.5.3b（consistency-service 10 处）

代码核对：
- :75、:243、:251、:304 用 `isOutOfCharacter`。根源是 extension/prompt.mjs:37 的 `/^[（(]场外[）)]/` 正则（核对一致）。
- :161 的 `matchAll(/<q who=…/)`、:259–265 读 blocklist.json、:267/:283 的 `normalizeReplyProtocol`、:285/:299 的 `parseTurn`，均吻合。

两个问题的回答：

1. **isOutOfCharacter 改为界面给 `channel` 代号：处置对。** 前缀判断本来就是“文字→封闭代号”，应由界面开关承担。这是输入边的职责，不是规则层。
2. **parseTurn 与 `<q who>` 标签，不开 AI 时“不运行”：不会让游戏缺功能。** 它们只处理模型草稿的尾注。不开 AI 就没有模型草稿，时间推进由菜单动作自带时长承担。开 AI 时由结构化 `turn`、`segments` 字段承接，思路对。

遗留的三处问题见 R2。

## 四、安全三项

- **注入防线**：归输入边/AI 边，输出 `reject:injection`，retrieval.mjs:20 与 retrieval-lexicon.mjs:26 改读该代号（L808）。方向对。不开 AI 时无自由文字写入，防线不触发，成立。
- **屏蔽词**：三处出处列全。词表进语言包，显示闸输出 pass/replace/block。
- **未成年人检查**：数值半边（年龄维度）留规则层，文字半边走独立分类通路，不靠被检对象自报（L824）。这是正确的拆法。

缺口是 R1：只有“显示闸”接手，没有“生成时拒绝”。

## 五、必改项（3 条，较小）

### R1　屏蔽词与未成年人检查：显示闸不够，需补生成时拒收（M4 的剩余部分）
位置：L824、825、877、887、888、909。
- 现状：population.mjs:409、:407 是在完整档生成校验里 `add(...)` 报错，即生成时拒收。consistency-review:256/257 也是生成时发出问题。
- 改为“只在显示闸 replace/block、不计状态哈希”后，违规文字会照样写进存档、进入后续提示，只是显示时被遮盖。AI 之后读到的仍是真人名或违规内容，可能继续复述。
- 改法：
  - 显示闸之外，在 `boundary:input` 的 AI 输出边加一道生成时守门，只输出 `reject:blocklist`、`reject:minor_romance` 这类代号，规则层读代号决定拒收重写。
  - 显示闸只管最后一层呈现。两层共用同一语言包词表。
  - L939 的接手方统计相应改为“守门+显示闸”。

### R2　consistency-service 的 10 处不全，且不能填默认值
- 漏列：consistency-service.mjs:159 也调用 `isOutOfCharacter`；:262/:263 把 `record.playerText` 当 `query` 传给 reviewNpcKnowledge 和 reviewHistoricalEvidence，是自由文字查询，应改为传 topicCode 或 id。
- extension 侧的读文字行没计入 100：extension/turn-contract.mjs:21（`isOutOfCharacter`）、extension/turn.mjs:32/37（`<回合>` 正则）、:97（`fullyTimedWait` 读玩家原文 `/等|停留|休息|睡/` 判等待）。L901 说“extension 侧对应改为界面给结构化字段”，应把这几行写进表里逐行处置，并重算总数。
- 不填默认：turn.mjs 在尾注缺失时回退 `extraMinutes: 10`（`fallback`）。改为结构化 `turn` 后，该字段必须是必填、缺失即报错重试，不得保留默认 10。请在 :267 行的处置里写明。

### R3　§4.9 之外的小一致性
L1119 的修订记录写“§3.5 重写为两种模式逐行 90 行”，L1120 又改为 100。把 L1119 的“90”改为“100”，避免读者对账出错。

## 六、其余建议（不阻断）

- modality 加 `hypothetical`（见第二节）。
- 13.8 写明“待卷核”并报李白，处理得当。请在卷十五写作的第一步登记结论，并回填 §4。

## 七、重点问题回答

- 第五条：6.1 与 3.6 已升级为纳入（L966、969），火器 E9、E10、E5 均已改正。
- 第四条：屏蔽词三处出处齐，注入防线与未成年人检查方向正确，缺口在 R1。

审查 B 复审 · 2026-11-13
