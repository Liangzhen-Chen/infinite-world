共 6 条，甲 1 乙 5 丙 0，有理由 0 无理由 6

本卡读了：卷十八 docs/统一底层设计/卷十八-社会关系与家族.md :309-355、:384-409、:425-540（另读 :195-244 核 §2.3 事件动词、:262-276 核 §2.4 变量表），卷九 docs/统一底层设计/卷九-AI接口.md :624-641；代码 server-plugin/kernel/holdings.mjs :1-550（应卡只读此段，另为确认 export 与调用者顺读至 :958，超出段仅用于旁证，不计入本卡条目）、server-plugin/kernel/vocab.mjs :52-101、server-plugin/kernel/events.mjs :1-135、server-plugin/kernel/load/world.mjs :25/:160（只确认调用者）。未通读：卷十八其余各节、holdings.mjs 之外的内核文件正文。

---

### 1 现役判定只看 terms.until === null，把"建立时带预定到期"的现役边当成已关闭
- 位置：server-plugin/kernel/holdings.mjs:245-251（activeEdges，过滤在 :248）
- 设计原文：卷十八 R18-1.10 :526「`until` 建立时取边当刻的 `terms.until`（可空；建立时就带预定到期的边即为该值），结束时取实际结束时刻」；键表 :461「`until: integer minute nullable`」
- 代码实际：`activeEdges` 只收 `e.record.terms[S.until] === null` 的边；建立时就带 `terms.until`（尚未到期）的现役边被当成已结束，容量、holderMax、exclusive、uniqueTriple、openHoldingsOfKind 全部不计它，closeHolding/transferHolding 还按"already closed"拒（:635、:668，超出本卡段，同根）
- 理由：无（docs/审查/6-7-Opus只核-1119.md:51 只把它记为问题，不是裁定理由）
- 影响：读数错（带预定到期的边——卷十七关卡放行/围方放行等——在容量与计数里消失，过早关闭被拒）
- 严重程度：甲
- 合并：见 docs/审查/6-7-Opus只核-1119.md:51（同类已由只核指出，当时判"不在该卡"）

### 2 种类表读口直读 engine.vocab.index，未走 §3.1 的 holdingKind 唯一读入口
- 位置：server-plugin/kernel/holdings.mjs:159（kindRow）、:546（assertCarriesRel）
- 设计原文：卷十八 §3.1 :360「`holdingKind(engine, kindHandle)` … 种类表唯一读入口」
- 代码实际：`kindRow` 与 `assertCarriesRel` 直接 `engine.vocab.index.get(code)` 取条目，未走 kernel/vocab.mjs 的 `vocab(engine, family, id)` 或 §3.1 指定的 `holdingKind`
- 理由：无（K5-05 只裁"不搬 holding-kinds.mjs"，没有裁定可直读 engine.vocab 内部）
- 影响：只是形式（公共部件绕过；读法与错误码各自一份，暂未出错）
- 严重程度：乙
- 合并：见 docs/研究/公共部件审查-乙-1122.md「表行与表头读口（缺）」同类；该节只列 holdings.mjs:172（engine.tables），未列 vocab.index

### 3 terms 整数键一律放行 null（since、rank、asOf、anchorAt、graspAnchorBps 本不可空）
- 位置：server-plugin/kernel/holdings.mjs:200（类型校验）、:207（since 落盘）
- 设计原文：卷十八 §4.1.1 键表 :461「`since: integer minute`」、:469「`rank: integer`」、:474「`asOf: integer minute`」、:487「`graspAnchorBps: integer [0, 10000]`」、:488「`anchorAt: integer minute`」（仅 `until` 标 nullable）
- 代码实际：`prepareTerms` 对 `TK.integer` 一律 `v === null || Number.isSafeInteger(v)`，`since` 显式写 null 时 `:207` 直接把 null 落进 `terms.since`；`graspAnchorBps` 的 [0,10000] 区间也未核
- 理由：无
- 影响：数据错（不可空整数键可写成 null，R18-1.10 事件载荷 `since` 随之为 null）
- 严重程度：乙
- 合并：无

### 4 代号键只按 CODE_RE，不核词表族（rel/endReason/honor/via/origin/cert 等）
- 位置：server-plugin/kernel/holdings.mjs:198（`isCode` 校验），类型表 :91-96
- 设计原文：卷十八 §4.1.1 键表 :467「`rel` | ref vocab relation」、:474「`honor` | ref vocab honor」、:489「`via` | ref vocab kchan」、:491「`origin` | 封闭枚举 edge_origin」、:492「`cert` | ref vocab cert」、:493-497 actBasis/basis/estate 等；`endReason` 为 ref vocab end_reason（:461）
- 代码实际：`TERMS_TYPES` 把这些键统一记为 `TK.code`，校验只做 `CODE_RE.test`，不查条目是否登记在对应词表族
- 理由：无
- 影响：规则缺（未登记或族错的代号可写进 terms，暂未出错）
- 严重程度：乙
- 合并：无

### 5 R18-1.9 的 hooks 处置未实现，种类行 hooks 列从不读
- 位置：server-plugin/kernel/holdings.mjs:274-341（事件段只有发出、没有收件处置），本卡范围内无 `row.hooks` 读取
- 设计原文：卷十八 R18-1.9 :525「种类行的 `hooks` 列出终止以外的触发。事件类型匹配 `on`、且事件的当事实体是这条边的 `role` 一端时，持有写者按 `do` 处置这条边」；§2.6 :340 `hooks` 列
- 代码实际：全文（:1-958）没有读取 `hooks` 或事件触发的处置代码；只在发 R18-1.10/1.11 事件，从不消费种类行 `hooks`
- 理由：无（docs/迁移体检/块5.md 的 K5 表未列 R18-1.9，docs/卡回报/ds-b5-3.md 也未提 hooks）
- 影响：规则缺（事件到来时该处置的边不处置，静默放过；依赖的破产判决/主权易手/离队等事件来源尚未建，暂不可达）
- 严重程度：乙
- 合并：无

### 6 核同意当事人时不核"本笔同意"，旧同意事件可复用
- 位置：server-plugin/kernel/holdings.mjs:466-473（checkConsentCovers，:468 用 findEvent）
- 设计原文：卷九 §4.2.1 :630「可选 `terms.consentAct`（本笔同意事件编号…）」；卷十八 R18-1.5 :521「持有原语 … 经可选 `terms.consentAct` 带入本笔同意」
- 代码实际：`findEvent`（server-plugin/kernel/events.mjs:117）扫整本事件日志取事件，只核 `actor ∪ targets` 覆盖两端，不核该事件是否本笔事务发出；上一笔的同意事件可在新开/转移时复用
- 理由：无（ds-b5-3.md:67 原先只记"只核代号存在"，未记本笔限制）
- 影响：规则缺/可绕过（用历史事件充当本笔同意）
- 严重程度：乙
- 合并：无

---

## 已登记未建（不记偏离，单列）

- 带关系的边与 `terms.rel` 转交 kernel/relations.mjs（块 5 未建）：holdings.mjs:543-553；裁定见 docs/审查/李白裁定-1117.md 11-18 22:10 B（卡文已注明，不重复）。
- 准入入口 `admission` 未接线，非空整笔拒收：holdings.mjs:441-443；docs/卡回报/ds-b5-3.md:65，挂卷十四/第一张建 admission 入口的卡（K5-30、K5-38）。
- 生成路径例外 `seeded` 未实现，运行期一律拒：holdings.mjs:445-450；docs/卡回报/ds-b5-3.md:138，挂生成路径卡。
- 协议甲除"关闭"外的处置（ho_stay/ho_succeed/ho_revert 在世授予者等）未接线：holdings.mjs:435-439、:427-433；归 5-4 终止与复生。
- 持有变化事件 `actor` 恒为 null（应有事务事件的 actor）：holdings.mjs:18-20、:311；卷十八 §2.3 :222；块 6 事务事件接线。
- 写入时 from/to 实例端类型核对（assertEnds 只判代号）与 grantedBy 授予者模板核对缺失：holdings.mjs:538-540、:475-478；卷十八 :288、:289；docs/审查/5-3-DS只核-1119.md:68、docs/卡回报/ds-b5-3.md:139，随第一张实体模板卡。
- 端类型名按实体表解析（现只按模板名闭集）：holdings.mjs:77-80、:167-174；卷十八 §4.1.1 :457（封卷后勘误 1118k25），K5-34 / docs/迁移体检/块6-规矩检查对照.md:22。

## 拿不准

- `share` 必须 >0：卷十八 R18-1.5 与 §4.1.1 键表只写"`share` 为 number、合计等于 `shareSum`"，未写单条须大于 0；代码 :516、:713 拒 0 与负数。是否有合法的 0 份额，卷文推不出。
- `contest` 列（§2.6 :335，取值 rank/lottery）只有列义，正文没给求值规则：代码 checkExclusive :507 无条件让新边胜、旧边按离任处置，`contest` 非 null 的行（如 §4.1.5 :610、:618 的 hk_household_head、hk_holds_office）被忽略。是规则缺还是由别的层消费，卷文推不出。
- `TERMS_TYPES`/`COMMON_TERMS`/`HOLD_WHILE_DIMS` 是卷文表格（§4.1.1 键表、§2.4 :276）的代码副本，是否应按"写死红线"进数据表交主会话判；`TEMPLATE_NAMES` 已由 docs/研究/公共部件审查-乙-1122.md §5 记（合并），四个 holdWhile 读数名写死已由 docs/卡回报/ds-b5-3.md:113 记（合并）。
- checkCapacity :480 在容量维度读数未知时报 `E-DIM-UNKNOWN-READ`，不是 §2.5 :292 的 `E-HK-CAPACITY`；卷文未说未知读数归哪个码。

## 跨卷待判

- R18-1.12 ② 的放回顺序（卷十八 :531「按建立先后排序（先按 `terms.since` 升序，同刻按边 id 的代号序），从空集开始逐条放回」）与 holdings.mjs:851-894 的提交前重算实现（按 `eachEdge` 顺序、不按 `since` 排序、不重置空集，反复关到稳定）不同。该实现超出本卡 :1-550 范围，且与卷二 §2.6 :515 提交前重算钩子语义交叠，需读两卷判定以谁为准，留给后段卡。
