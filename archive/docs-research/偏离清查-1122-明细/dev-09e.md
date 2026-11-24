共 10 条，甲 2 乙 6 丙 2，有理由 1 无理由 9。
本卡读了：卷十八 :270–300、:305–350、:380–544；卷二 :510–565；卷九 :626–645（只用于核 holding 四原语输入契约）；server-plugin/kernel/holdings.mjs :1–958（重点 :538–958，全段读完）；server-plugin/kernel/terminate.mjs :350–420（转移协议两步）；server-plugin/kernel/mount.mjs 全文、server-plugin/index.mjs :1–30（装配调用者）；docs/研究/公共部件审查-乙-1122.md、docs/研究/偏离清查-1122.md、docs/审查/5-3-DS只核-1119.md、docs/卡回报/ds-b5-3.md、ds-b5-3b.md、ds-b5-4.md 的相关行。未读：卷十八 :350–380、:409–424、:544 以后；卷二 :565 以后；holdings.mjs 本卡范围 :538–958 无未读段。

---

### 1 R18-1.12② 的“按建立先后从空集逐条放回”没有实现
- 位置：server-plugin/kernel/holdings.mjs:878-893
- 设计原文：卷十八:531「条件为假时，把同一持有者在该种类下的现役边按建立先后排序（先按 `terms.since` 升序，同刻按边 id 的代号序），从空集开始逐条放回：放回后条件为真的留下，为假的在同一事务内按该行“离任”格处置」
- 代码实际：只对本次触及的边逐条调 `holdWhileHolds`，为假即 `closeEdge`；没有按 `terms.since`/边 id 排序，也没有从空集逐条放回。
- 理由：无（docs/问题.md、docs/审查/李白裁定-1117.md、卷十八封卷后勘误均未见登记；ds-b5-3.md:25 摘了原句，代码未照做）
- 影响：数据错（现唯一带 `holdWhile` 的 `hk_wielding` 在超手时会把同一人的手持边一起关掉，而不是按取得先后留下前几条）
- 严重程度：甲
- 合并：无（docs/审查/卷十八-五处提案.md:83 已写明不按先后放回的后果，但未并入审查清单）

### 2 关闭一条边后，没有把该边的标的重新纳入重算集合
- 位置：server-plugin/kernel/holdings.mjs:886-890（触发集合另见 :768-793）
- 设计原文：卷十八:531「关闭一条边即写到它的标的，以该标的为标的的其余这类边在同一事务内照本条再重算，直到不再有边关闭。」
- 代码实际：`ends` 在 recompute 入口由 `touchedFrom` 一次算出；recompute 内 `closeEdge` 新写下的持仓路径不回流到 `ends`，被关边的标的没有被加进重算集合。
- 理由：无
- 影响：规则缺（同一标的的其余 `holdWhile` 边可能不再被复核）
- 严重程度：乙
- 合并：无

### 3 开边时立即求 holdWhile，未等本事务全部写入完成
- 位置：server-plugin/kernel/holdings.mjs:595-596
- 设计原文：卷十八:530「求值所用的假设状态是本事务全部写入完成之后的状态（含这些新边本身）」
- 代码实际：`openHolding` 写边后立刻按“组内只写了这一条”的当前状态求 `holdWhile`，为假即抛 `E-HK-HOLD-WHILE`；提交前的 `recompute` 虽按最终状态再核一遍，但先前的拒写已让整笔回滚。
- 理由：无
- 影响：规则缺（成组写入若要靠后写的边才成立，会被提前拒掉）
- 严重程度：乙
- 合并：无

### 4 checkShareSums 对空组与缺 share 静默放过
- 位置：server-plugin/kernel/holdings.mjs:810-815
- 设计原文：卷十八:342「同一标的各现役边的 `terms.share` 之和必须等于它（持有写者在事务提交时核对）」
- 代码实际：`edges.length === 0` 直接 `continue`；缺 `share` 的边按 0 计入；比较用 `Math.abs(sum - shareSum) > Number.EPSILON`。
- 理由：无
- 影响：数据错（把某标的最后一条份额边关掉后，合计 0 不再核对，`shareSum` 非空也可留下零持有人）
- 严重程度：甲
- 合并：浮点比较部分见 docs/研究/公共部件审查-乙-1122.md:99、:159（乙 4）

### 5 份额按 JS 浮点保存与比较，不经定点
- 位置：server-plugin/kernel/holdings.mjs:716、:815
- 设计原文：卷十八:470「`share` | number（定点，同一标的各边合计见 `shareSum`）」
- 代码实际：`terms.share` 存 JS 浮点（如 0.4、0.6），`rescaleHolding` 与 `checkShareSums` 都用浮点求和加 `Number.EPSILON` 容差判等。
- 理由：无（乙 4 已列为必修）
- 影响：读数错
- 严重程度：乙
- 合并：docs/研究/公共部件审查-乙-1122.md:99、:159（第 7 条与乙 4）

### 6 checkHoldingKindRows 漏查“被关系条目 consent 指向”的行是否含 origin
- 位置：server-plugin/kernel/holdings.mjs:914-916
- 设计原文：卷十八:521「所以 `concluded` 为真、或被某条 `consent` 不取“不需同意”的关系条目以 `kind` 指向的种类行，`termsKeys` 须含 `origin`……缺了加载失败（E-HK-PROTOCOL）」
- 代码实际：只查 `row.concluded === true` 的行；关系条目已在词表里，指向的种类行没有再查 `termsKeys` 是否含 `origin`。
- 理由：无（这是加载期数据核对，不依赖尚未建的关系写者）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 7 端类型名闭集写死在代码里
- 位置：server-plugin/kernel/holdings.mjs:77-80、:167-169
- 设计原文：卷十八:457「种类行的 `from`、`to` 列出允许的端类型。数据里写名字：先按模板名解析，解析不到再按目录行的实体表名解析」（封卷后勘误 1118k25「持有种类端类型先收为模板名闭集」）
- 代码实际：13 个模板名写在 `TEMPLATE_NAMES` 常量里，不读数据表。
- 理由：有，李白 11-18 22:10 丙5（docs/审查/李白裁定-1117.md:1093）准块 5 先收闭集、按实体表解析的核对挂后
- 影响：只是形式（按裁定暂留）
- 严重程度：乙
- 合并：docs/研究/公共部件审查-乙-1122.md:77（写死常量，裁定暂留）

### 8 holdWhile 的四个变量名与两个视图名写死在代码里
- 位置：server-plugin/kernel/holdings.mjs:100-104、:386-391
- 设计原文：卷十八:276「`holdWhile`（手持行）| `holder.graspLimbs`、`holder.handsHeld`、`subject.wieldHands`、`subject.wielders`……经 `personView`、`itemView` 读出」
- 代码实际：四个变量名与 `personView`/`itemView` 写死在常量与 `viewField` 调用里，不按种类行登记取变量名与读入口。
- 理由：无正式裁定；docs/审查/5-3-DS只核-1119.md:66 只建议记“部分/挂账”
- 影响：只是形式（现只有手持行用这四个，行为对）
- 严重程度：丙
- 合并：docs/审查/5-3-DS只核-1119.md:66；ds-b5-3.md:113 记为非阻塞

### 9 closeHolding 把非法 endReason 静默当 null
- 位置：server-plugin/kernel/holdings.mjs:636
- 设计原文：卷十八:461「`endReason: ref vocab end_reason nullable`」
- 代码实际：`const endReason = isCode(p.endReason) ? p.endReason : null;`，传 0、空串、对象都静默写成空，不拒收。
- 理由：无
- 影响：只是形式（非法理由被吞成“没有理由”）
- 严重程度：丙
- 合并：无

### 10 holdWhile 的“未知”判定过宽：未引用的读数缺失也当假
- 位置：server-plugin/kernel/holdings.mjs:386-396
- 设计原文：卷十八:532「求值结果未知按假处理，与“为假”同一出口。」
- 代码实际：先把四个读数逐个要求为有限数，任一缺失即整条 `holdWhile` 返回假，即使条件树并未引用那个变量。
- 理由：无
- 影响：规则缺（把“未引用且缺读数”误判成“结果未知”）
- 严重程度：乙
- 合并：无

---

## 专项核对结论（非偏离）

- 两条转移协议的顺序与事件：持有者端先于标的端（terminate.mjs:405、:419），两条路都经 `closeHolding` 发 `ended` 与常住结束事件（holdings.mjs:418-421）；未发现顺序或事件对不上卷文（未建分支见下）。
- `installHoldingEngine` 有生产调用者：mount.mjs:54 调，经 index.mjs:28 的 `mountKernel` 上生产路径，不是只有测试调用。
- `state.holdings` 的写只在 holdings.mjs：terminate.mjs:376、place.mjs:1305 只读；四个导出写函数 `openHolding`/`closeHolding`/`transferHolding`/`rescaleHolding` 都先 `needTx`。

## 已登记未建

1. **准入入口与随附事件**（卷十八 R18-1.13:534、卷二:541）：`checkAdmission` 只做“非空即拒”，不调入口、不发 `events`；自动让出与 recompute 的内部关边（holdings.mjs:437、:890）也不过 admission。代码 :441-443、:580、:633、:665、:717。登记：docs/卡回报/ds-b5-3.md:65。
2. **关系写者与史实回填**（卷十八 :389、R18-1.7:523）：`carriesRel`/`intimate` 与带 `record` 的边一律整笔拒 `E-ACT-WRITER-NOT-READY`（holdings.mjs:543-553、:634）。登记：ds-b5-3.md:141；李白 11-18 22:10 丙7（docs/审查/李白裁定-1117.md:1097）；前一轮已计为有理由（docs/研究/偏离清查-1122.md:113）。
3. **生成路径 seeded 例外**（卷十八 R18-1.5:521）：运行期不认 `origin=seeded`，只认本笔 `terms.consentAct`（holdings.mjs:445-450）。登记：ds-b5-3.md:138。
4. **协议甲的候补/授予者移交与其余离任处置**（卷十八 R18-1.2:518、R18-1.8:524）：`ho_succeed` 有在世承接者、`ho_revert` 有在世授予者、`ho_estate` 等整笔拒（terminate.mjs:409-412）；recompute 的非关闭 `vacated` 同理（holdings.mjs:427-433、:889）。登记：ds-b5-4.md:55。
5. **端类型按实体表解析与授予者模板核对**（卷十八 :457、§2.5:288-289）：`assertEnds` 只核两参数是代号形，不核两端类型是否落在该行 `from`、`to`；`grantedBy` 的授予者模板也不核（holdings.mjs:538-540、:176-186）。登记：ds-b5-3.md:139 + 卷十八:457 封卷后勘误 1118k25。
6. **目录行三传导系数为 0 的加载核对**（卷十八 :457）：`checkHoldingKindRows` 不核 `conduct`/`conductBack`/`adopt`；按实体表解析的核对随第一张实体表卡启用（同上 1118k25）。
7. **事务事件 id 作链首**（卷十八 R18-1.10:526、R18-1.11:528）：无事务事件时链首取“边句柄+变化”或钩子主体 id，接线后改取事务事件 id（holdings.mjs:296-307）。登记：ds-b5-3.md:137。

## 拿不准

1. `rescaleHolding` 给新增持有人建边时，其余 terms 以 `current[0].record.terms` 为 base（holdings.mjs:730-737）；卷文没写新增持有人边的 `rank`、`grantor` 等应从哪条旧边取，可能把别个持有人的条款带过去。
2. `rescaleHolding` 不过 `checkExclusive`（holdings.mjs:741 注释称“exclusive 不用于改份额”）；卷文 R18-1.5:521 没写 `shareSum` 与 `exclusive` 并存时改份额该怎么办。
3. `closeHolding` 不核两端是否已终止（holdings.mjs:625-639）；卷二:549 要求对已终止实体的写入拒写，但终止第 4 步的协议内部写必须放行，代码没有按 `cause` 区分，是否有真实可达路径待判。
4. `resolveCloseTarget` 同时给边 id 与三元定位时不拒（holdings.mjs:601-615）；卷九:631 写“二选一必填”，但卷九不在本卡指定的比对卷段内。

## 跨卷待判

- 份额定点口径（条目 5）跨卷十八与卷二十七:620；docs/研究/公共部件审查-乙-1122.md 第 7 条已判过，无新增待判。
