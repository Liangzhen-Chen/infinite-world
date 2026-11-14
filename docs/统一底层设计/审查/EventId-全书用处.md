# EventId 全书用处清单（李白 11-14 745706f9 ①；11-14）

定义处：卷二 §1.5"事件 id 类型 `EventId`"（本批补登）；同步 §2.6"按路径读写"第 1 条、§2.8 第 1 条、§2.9 第 2 条两处品牌清单、§1.5 `map` 行。

范围：现行各卷正文 Grep 字面 `EventId`（不含 版本快照/、审查/）；另对"事件 id"在字段类型位置的写法与无类型的事件引用字段做了定向搜索（`eventId`、`eventRef`、`: 事件 id`、`onset` 等），未逐条通读全部散文"事件 id"。

## 一、字面 `EventId` 用处（与新定义一致）

| 卷:行 | 用处 | 判定 |
|---|---|---|
| 卷二十四:133 | 表 A 事件记录 `id` 类型 | 一致（定义来源） |
| 卷二十四:147 | `payload.causedBy: list<EventId>`（表内 HTML 转义写法） | 一致 |
| 卷二十四:241 | 运行实例 `startEvent: EventId` | 一致 |
| 卷八b:266 | 事实记录 `event: EventId` | 一致 |
| 卷十八:191 | 婚姻事件载荷 `consentAct: EventId` | 一致 |
| 卷十八:198 | 谎言揭穿载荷 `lie: EventId` | 一致 |
| 卷十八:199、303、870 | 舆论对象两个可空字段 `subjectEntity` / `subjectEvent: EventId nullable`，恰一非空 | 一致（合 §1.5 union 规则） |
| 卷十八:327、821 | `state.lies[lieId]`，`lieId: EventId`；`claim.event: EventId nullable` | 一致（EventId 作映射键） |
| 卷十八:328、341、870 | `state.opinion.lastFired.byEvent[groupId][EventId][triggerRow]` | 一致（映射键） |
| 卷十八:419、462 | 边与亲子记录 `consentAct: EventId nullable` | 一致 |
| 卷十八:1580 | 附录：`lieId` 取 `EventId` | 一致 |
| 卷二十二:169、170 | 知情记录与公共知情 `root: EventId` | 一致 |
| 卷二十七:502、506、536、996 | 日志折叠：状态中类型为 `EventId` 的路径（含映射键）所引事件留原样；A27-4.8 | 一致（依赖 pathTypes 能写 `EventId`，本批已在卷二写明） |

## 二、与新定义不一致或待对齐（只列，不改；交下一批）

| # | 卷:行 | 现写法 | 问题 | 建议 |
|---|---|---|---|---|
| 1 | 卷二十二:169 | `corroborated: set<身份键或 EventId 或 EntityId>` | 三种字串形态同列一个集合成员、无判别字段，违卷二 §1.5 `union` 行与 `EventId`"用法"条 | 拆成各自集合或成员带判别字段；已对齐（提交待入） |
| 2 | 卷二十二:715 | 解释树节点 `ref: 事件 id、修正项来源代号或规则行代号` | 类型写成散文"事件 id"，且与别种代号混在一个字段、无判别 | 写 `EventId`，并按 §1.5 拆字段或加判别字段；已对齐（提交待入） |
| 3 | 卷九:213 | `state.lastCommit[actorId]` 值 `struct{at: integer:minute, eventId}` | `eventId` 字段未写类型；卷二十七 R27-4.12 ② 按 pathTypes 认 `EventId` 路径，未写类型即认不到 | 写 `eventId: EventId`；已对齐（提交待入） |
| 4 | 卷二十一:231、433、1215 | 状态实例 `onset`："实例 id，即该实例出现事件的事件 id"（"与卷二十四 `startEvent` 同类型"） | 类型未写 `EventId`（散文）；且卷二 §1.5 `struct:statusInstance` 尚无 `onset`（随卷二十一 §5.3 回填请求待办，本批不加字段） | 写 `onset: EventId`；卷二回填 `struct:statusInstance` 时按 `EventId` 登记；已对齐（提交待入） |
| 5 | 卷八b:267 | `state.offenseFactOfEvent[eventId] → factId` | 键段以占位名写，未写明类型 | 写明键为 `EventId`；已对齐（提交待入） |
| 6 | 卷二十六:297 | 想法条目 `eventRef?` | 未写类型，且用 `?` 表可缺，与卷二 `nullable` 写法不同 | 写 `eventRef: EventId nullable`（若确指事件）；已对齐（提交待入） |
| 7 | 卷十八:1318 | 附录"旧缺口只记：`EventId`、`EdgeId` 不在 §2.8 的品牌类型清单" | `EventId` 部分已由本批补登，说明过时（`EdgeId` 不在本批范围） | 卷十八下次勘误时注明 `EventId` 已登记；已对齐（提交待入） |
| 8 | 卷二十三:150 | `subjects` 成员 `ref: EntityId 或 EventId 或身份键`，由同级 `kind` 判别 | 单个字段随同级 enum 变类型，不是卷二 §1.5 认可的"带判别字段的 struct"（`oneOf` 判别联合，成员各是 struct）；原列第一节"一致"判偏宽（卷二 EventId 只核小项，1114az 移入） | 按 §1.5 拆成各自可空、恰好一个非空的字段，或改为 `oneOf` 判别联合；已对齐（提交待入） |

## 三、卷二本卷内

本卷原无 `EventId` 字样；已同步的五处见卷首"定义处"。原未处理一项：§2.9 第 2 条强转豁免文件表没有产出 `EventId` 的 kernel 文件；已由 1114az 勘误并入 `kernel/handles/keys.mjs` 行，§2.8 第 1 条补构造函数 `kernel.eventId(…)`。
