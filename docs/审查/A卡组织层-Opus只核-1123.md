# 前置卡 A 收窄版《卷八组织层机制与试玩地区开局组织》Opus 只核（第 1 轮）

复核者：Claude Opus 5.5 中档。对象：分支 ds/polity-org，写者提交 e5d144fa3（写 Sonnet 5.5 中档），`git diff origin/master...e5d144fa3`。依据：卷八（政治与人口）、卷十（世界随机生成）、卷十八（社会关系与家族）；李白 11-23 A-1～A-3、G5b-H；docs/研究/世界设计完整方案-1122.md。

## 本机跑过的命令

- `node --test tests/kernel/gen-polity.test.mjs tests/kernel/polity-title.test.mjs tests/kernel/polity-opening-hw.test.mjs tests/kernel/polity-load-checks.test.mjs tests/kernel/events.test.mjs tests/kernel/gen-water-grid.test.mjs tests/kernel/terminate.test.mjs tests/accept/detectors.test.mjs`：`tests 142 / pass 142 / fail 0`。
- `node tools/accept/run.mjs pre_commit`（不带 --write）：`"verdict": "pass"`，失败只剩 vol12 A12-4.5、S12-2、S12-3 三项基线。注意 A12-4.5 的命中里多了 `social.orgTraits`（见建议 6）。
- 快照核对：`git rev-parse origin/master:docs/统一底层设计/卷八-政治与人口.md` 与 `e5d144fa3:…/版本快照/卷八-v5-勘误前-1123k40.md` 同为 1c402c70…。

## 十项结论

1. **setGovernor、governorOf**
   - 语义合 R8-5.1 :773，判"过"：先取自身的边，再沿包含树取最近祖先的边，都没有返回 null；eligible 读时现算（:775）。
   - "先关同地旧边"判**必须改**（M1）。结果对，层错了。卷十八 R18-1.5 :521 要求 exclusive 种类"新边成立前旧边必须先按协议甲的'离任'格处置"，该由持有写者做。hk_governs 的离任格是 ho_revert，R18-1.2 :518 规定"授予者为空或已终止时按关闭处置"。持有写者 vacateEdge（holdings.mjs:426）没接这一支，terminate.mjs:410 已有同口径实现。写者在 title.mjs:134 为统治边单开关边循环，正是红线说的"为某一种情况单开分支"；hk_fief、hk_administers 等同格的种类仍然走不通。
   - kernelApi 登记判"过"：governorOf 只供 rules 调；holdingAllowed、setGovernor 带 callerFiles gen/holdcalls.mjs。
   - governorOf.direct 判**须李白**，见第 8 项第 1 条。
2. **R8-18.9 ①②③ 生成器**
   - 缺输入时进 deferred、列缺口、不建行，与卷十水体阶段口径一致，判"过"。漏网的情况见 M3。
   - originSite 连边认手写边，合 1123k32 改后的 :1267，判"过"。子站点边的原因取原站点那条边的原因，这是临时做法：卷文"以同一原因"指 holdCause，等 holdCause 裁定后统一改。
   - 写入路径：卷十 R10-1.2、R10-9.1、R10-9.9 定了"写回器在世界创建事务内建行"，卷八 R8-18.9 也写明"由写回器写入"。所以 createRows 放在 gen/writeback.mjs 属于卷十口径，可以接受。但它不核必填，也没有单测，判**必须改**（M2）。
   - 同种子同结果判"过"，有测试 A10-1.2。
3. **前任改动的留、改、删**
   - 抽核 6 处，写者的判法都对：模板行改名 class_org_*（A-1）；夹具由 `classes` 改 `extends`（abstract 类别行只供继承，卷二 §1.3）；删去 genHoldCause 的取值（卷文没给）；originSite 认手写边；_unbuilt 里 requirement 族删掉后改进 _vocab；office 表补 holder、acting 两个派生列。
   - DeepSeek 写的部分抽核 10 行以上：
     - 一致：9 条 orgkind 条目、9 条类别行与卷八 :265–:295 逐字一致；org 表 orgKind、polity、seat、parent、tenure、tier、treasury、headOffice 与 §2.1 一致；polity 表 domainLimitBase、councilOffices、holderEligibility 与 §2.3 一致；_vocab 19 族齐，封闭族 tenuremode、term、powerscope、succsource 的代号与卷八 :1535–:1543 一致。
     - 漏了的：office.json 的 venue 缺 `nullable`（卷八 :171 写的是 ref vocab requirement nullable），见 M4。org 表的 priceRule（必填 always）、forceValues 两列没建，也没登进任何缺口表，见 M8。
     - 结论：写者说的"逐条对卷八核过"不完整。
4. **4 个相邻测试**：都是本卡合理变动带来的正当修正，判"过"。
   - events：verb 族多三条 kindOnly 行，并加断言核它们的字段。
   - gen-water-grid：真实世界里 deferred 多出 gstage_polity，用例只排除该阶段，仍断言水体阶段没有缺口。
   - terminate：org 表已载入，"表未载入"的反例改用一个没有实体表的类，断言的意图不变。
   - detectors：orgTraits 只被加载期校验器读到，按消费者口径如实列入，与 bodyPartChainMaxDepth 同一先例。
5. **并入的三小项**
   - 第 5 项判"过"。rolesKinds.governs（:326、:765）、holdForcibleCauses = {conquer, usurp}（:401、:775）、genSettlementKind = orgkind_village（:376、:267）都是卷八推得出的。三条动词行的各栏照 :395 的共同取值与 :401 写，逐栏核过。
   - 第 8 项判"过"。九行全假，与卷八 :1414 一致。卷七、卷十八那四种 orgkind 还没登条目，现在写它们的行反而会触发 E-KIN-ORG-TRAITS（键必须是已登记条目，:300），所以随它们自己的卡补是对的。
   - 第 9 项判"过"。12 个码都已在 error-codes.mjs 登记，每个码有一反一正。例外是 E-KIN-ORG-TRAITS 的闸门，见 M5。
6. **试玩地区手写数据 world/design/opening-polity-hw.json**
   - 位置判"过"：在 world/ 下，是作者数据旁表，同 world/geo/subsite-reparent.json 的先例，眼下只有测试读它。
   - 来源标"作者"、不写国号（卷八 :119；D1 未定），判"过"。
   - 不写郡组织行，依据站得住，判"过"：卷八 orgkind 九条里没有郡级种类（:258–:289）；头衔是带辖区的职位行（:103）；设计方案 :116–:118 定外省由王命郡守治理，郡守是职位。
   - 李白 A-2 要的"磨坊归河湾村在真实世界查得到"，本卡**未达成**：组织行进不了 org.json（E-ORG-TREASURY 等第 6 项 purpose_general），place.json 数据行也没换（上格排在 A–D 之后）。现在只在夹具里验证过。PLAN 须挂一条"真实表上磨坊查回"用例，与第 6 项、上格绑在一起。
7. **卷八勘误 1123k40**
   - 流程合规，判"过"：快照与改前文同一个 blob，不升版本，修订记录追加在末尾。
   - 修订记录说"条目字段表 template 栏、R8-18.9 ⑤、§5.3 等"也改了，实际只改了两个数据块和 R8-18.9 ②。卷八里已经没有 org_tpl_ 字样，那几处本来就没有这个字面量。记录须与实际一致（1115c3 先例），见 M6。
   - 卷七、卷十八各 4 处 org_tpl_ 现在不会造成加载不一致：那四种 orgkind 没登进 _vocab，orgTraits 也只核已登记的条目。判"过"，交它们各自的卡勘误。
8. **写者列的"须李白"7 条**：真须李白 3 条，另 4 条卷文可推，见下节。
9. **另动的文件**：registry.json、state-owners.json、files.json、load/world.mjs 都没有越界，也没有改宽校验，判"过"。world.mjs 只加了一处 checkPolityTables 调用。
10. **红线**，判"过"：
    - title.mjs、gen/polity.mjs、gen/holdcalls.mjs、validate/polity-tables.mjs 里没有组织、地点、职位 id 的字面量，也不按种类代号分支。
    - 规则层没有 Math.*。
    - 只有整数比较和取摘要前半（`>> 1`），没有需要 det-math 定点的算术。

## 必须改（8 条）

- **M1 换边的旧边处置放回持有写者原语层。** 在 holdings.mjs 的 vacateEdge 里，ho_revert 的边照 R18-1.2 :518 处理：授予者为空或已终止的按关闭；授予者在世的仍拒 E-ACT-WRITER-NOT-READY。口径同 terminate.mjs:410。setGovernor 删掉自关循环（title.mjs:133–:136），只调 openHolding，交 checkExclusive 处置。测试：统治边换边时旧边经离任格关闭；ho_revert 的边授予者在世时仍拒。
- **M2 createRows 补必填核对和单测。**
  - 必填：R10-9.1 要求新建整行与手写行"完全相同"地分级校验，含必填；A10-9.3 规定漏给来源时以 E-GEN-ROW-INVALID 失败。新建行按表头 required 核缺列，包括 byEnum 条件必填。
  - 单测：缺必填、表不在 writesKinds 里、id 已存在、classes 不是本表类别行、写了派生列，五种情况各一反一正。现在没有任何测试调到 createRows。
- **M3 realmRows、openTiers 未建时不得顶成空表。** worldgen.mjs:298 写了 `polity.genRealmRows || []` 和 `polity.genOpenTiers || []`，genPolity 也不把这两项列为缺口。其余输入一到位，就会静默生成"零政体、聚落无层级"，不报缺口，这是卡头 §二.3 说的绕过口子。改为保留 undefined，由 need() 记 `input_rules_gen_realmRows`、`input_rules_gen_openTiers`。
- **M4 office.json 的 venue 加 `"nullable": true`。** 卷八 :171 写明"null 即办公不要求房间与陈设"。
- **M5 去掉 E-KIN-ORG-TRAITS 的闸门。** polity-tables.mjs:56 写了 `if (isObj(rules.social))`，没登 social 表时整条校验跳过。改为：social 表缺时，每条 orgkind 条目各报一次 E-KIN-ORG-TRAITS。polity-load-checks.test.mjs 的 view 默认带齐 traits，另加一条"social 表缺即报"的用例。
- **M6 改 1123k40 修订记录的措辞。** 只写实际改了的地方：§2.4 两个数据块的 template 取值与模板行 id，R8-18.9 ② 的 null。
- **M7 发 R8-5.6 统治者变更事件。** 卷八 :403 把动词行的各栏都给全了；A8-5.2 :794 要求"每次统治边更换恰发一条变更事件"。卷文可推，不须李白。补的内容：verb 行 governorChanged、setGovernor 在同一事务里 emit `{from, to, cause}`、system emits 登记、"一次换边恰一条事件"的测试。主会话若嫌超出本卡，须明列成紧随小卡，并在 docs/问题.md 挂住，不能只留一句代码注释。
- **M8 org 表两列不得静默缺。**
  - forceValues 是派生列，归卷十三。照 forcePower 的做法登 _unbuilt-derived；它用到的 forcevalue 族登进 _unbuilt 的族清单（卷十三 §4.10）。
  - priceRule 是 always 必填列。类型 `list<struct{match: rx, modifier: ref}>` 里的 ref 没写指向，这是技术项，由主会话参照卷八 :343 的 ModKey 写法定，不须李白。定下之前记进 docs/问题.md，并在回报"未落"里写明。

## 写者列的"须李白"逐条

1. **governorOf.direct：真须李白。**
   - 矛盾所在：:773 说 direct 为真指"统治者是该边的持有组织本身"，而 governorOf 返回的 org 就是边的持有组织，照字面 direct 恒真；:1267 却说主权组织开局"经下级聚落组织统治（direct 为假）"。另一处相关的张力：:260 说国家"驻地之外各站点经下级聚落组织统治"，暗示驻地由国家直持；而 R8-18.9 ② 给每个站点都建聚落组织，包括驻地。手写数据里王都归王国，取的是 :260 的读法。
   - 现状：本卡没有任何消费者读 direct，不挡块 6。
   - 选项 A：照写者读法，direct 指"边挂在被问地点自身"，勘误 :773 与 :1267 的括注，同时裁定驻地是否由国家直持。
   - 选项 B：照 :773 字面，等于删掉这个字段。
   - 建议 A。
2. **郡组织行：不须李白，卷文可推。** 依据见第 6 项：卷八 :103、:258–:289，设计方案 :116–:118。由主会话改卡的口径。郡守职位行等职位种类行和权能词表定了以后，另开卡。
3. **holdCause：真须李白。**
   - 卷八 :378 只给了约束：不得在 forcibleCauses 里。
   - 已登记的和平原因只有封授。R8-5.5 :777 规定封授"同时双方订立一份封建契约"，开局时村社自持本站点，不是封授。
   - 选项 A：取 verb_grant。
   - 选项 B：照 :401 的写法新登一条 kindOnly 原因"开局"，走卷八勘误。
   - 建议 B。裁定后，两条手写统治边与子站点连边的原因一并改用它。
4. **王国继承制 succession_pending 占位：真须李白（可转亮圳）。**
   - 王位继承是设计方案的待定裁定 D2（世界设计完整方案-1122 王位一段）。
   - 现在没有读者，不挡块 6；但"pending"占位加随手取的 orderSource，属于假数据顶上。
   - 选项 A：照 D2 的建议取"议案选出"（succsrc_motion），条目按含义命名，标待调。
   - 选项 B：等 D2 定。
   - 建议 A，与国号 D1 同批报。
5. **统治者变更事件 R8-5.6：不须李白。** 卷八 :403 各栏给全了，见 M7。
6. **genIdSlots 键名：不须李白。** R8-18.9 ⑤ 与 :1397 点了三条位次；规则层不许出现代号字面量，所以句柄必须进规则表。键名是技术项，由主会话写"已定"，并补一条卷八 §2.6 封卷后勘误登记这个键。
7. **priceRule、forceValues：不须李白。** forceValues 照卷十三的做法登未建；priceRule 的类型由主会话定。见 M8。

另：写者的"须李白"第 6 条（卷七、卷十八 org_tpl_ 勘误）也不须李白。A-1 已经定了改名，只是排在它们各自的卡里。

## 建议（不挡合入）

1. governorOf 返回值多了 `subject` 字段，卷八 §3.1 :474 只给 `{org, direct, eligible}`。要么删掉，要么写进回报"偏离"。
2. "首领职位不在本组织 offices 内"借用了 E-OFFICE-ORG。卷八 :131 没给这一条的码，而 E-OFFICE-ORG 的定义是"实任行被 0 个或 2 个组织列入"。借码须写进回报。
3. 夹具 polity-world.mjs:35 的 succession_test 用了封闭族里没有的 `succsrc_none`，加载却没拦。可见 succession 条目的字段没有校验，记进 docs/问题.md；夹具改用合法代号。
4. A8-18.2 要求"政区遍历次序打乱重跑，产出逐字节相同"，这条没测。代码里各处都排了序，补一条打乱输入的用例就够。
5. org.domainLimit 的 bounds `[0, 1000000]` 卷文没有出处（item.json 有同样的先例），应在 basis 里标待调。
6. social.orgTraits 给 A12-4.5 新增了一条命中，被这项已有的基线失败遮住了。回报里要如实写出。
7. 卷八 §2.1 :133 要求"settlement 种类必须写 tenure（加载校验）"，没实现，也没列进"未落"。

## 结论

本轮不封：必须改 8 条，修完至少再核一次才能封。M7 若由主会话拆成紧随小卡，本卡可以只修另外 7 条再核。真须李白 3 条（governorOf.direct、holdCause、王位继承 D2），三条都不挡块 6，可以攒批报。

---

# 第二轮（最后一轮）

对象：写者提交 de1c0e752（在 36a927894 之上），`git diff 36a927894 de1c0e752`。只核 M1–M8 的落实、李白 11-23 事件 b41e0801 ⑦⑧⑨ 的落法、未落的写法，以及能否合入。不加新要求。

## 本机跑过的命令

- `node --test tests/kernel/gen-polity.test.mjs tests/kernel/polity-title.test.mjs tests/kernel/polity-opening-hw.test.mjs tests/kernel/gen-create-rows.test.mjs tests/kernel/polity-load-checks.test.mjs tests/kernel/events.test.mjs tests/kernel/terminate.test.mjs tests/kernel/holdings.test.mjs`：`tests 153 / pass 153 / fail 0`。
- `node tools/accept/run.mjs pre_commit`（不带 --write）：`"verdict": "pass"`，失败只剩 vol12 三项基线。

## M1–M8 逐条

- **M1 落实。**
  - holdings.mjs 新加 vacatesByClose，vacateEdge 与提交前重算两处都改用它。ho_revert 授予者为空或已终止时按关闭，在世仍拒 E-ACT-WRITER-NOT-READY，合 R18-1.2 :518，与 terminate.mjs:410 同口径。
  - "已终止"的判法沿用本文件 assertNotTerminated 的标记读法，同一文件内一致。
  - setGovernor 已删自关循环，只调 openHolding，由 checkExclusive 经离任格处置。
  - 两条测试（关闭、在世拒收）都在。
- **M2 落实了一半，仍须改（R2-1）。**
  - createRows 已补必填核对，gen-create-rows.test.mjs 共 8 条覆盖到位。
  - 但新文件 validate/required-dims.mjs 与已有的必填判定重复：validate/rows.mjs:158 的 `requirement()` 是 required 策略的唯一实现。它支持"；"并列多个条件，以及 byClass、ifPresent、anyOf、byFootprint、命名条件。
  - 新文件只认整串的 `always` 和单个 `byEnum`。表头写成"byEnum:…；always"这类多条件时，它会漏核。它还按"建行阶段读不到类别链"跳过 byClass，可提案里已经带着 classes，env 里也有词表。
  - 这违背"跨卷共用定义只一处"。
- **M3 落实。** worldgen 不再写 `|| []`；genPolity 记 `input_rules_gen_realmRows`、`input_rules_gen_openTiers`。用例区分了"未建"与"作者明写空表"。
- **M4 落实。** office.venue 已加 nullable。
- **M5 落实。** 闸门已去；social 表缺时每条 orgkind 各报一次，有用例。
  - 顺带加了"holdCause 不得在 forcibleCauses 里"的加载核（卷八 :378），借用 E-DIM-DOMAIN-RANGE。卷文没给专码，可以接受。
- **M6 落实。** 1123k40 记录已改为只写两个数据块与 R8-18.9 ②。
- **M7 大体照 :403，仍缺一处，须改（R2-2）。**
  - 已对上的：verb_governor_changed 的 kindOnly 假、kindFrom = cause；payloadShape {from, to, cause}；perceivable 假、senses 空；公共各栏照 :395。sys.title 已登 emits。actor 为 null，targets 取旧新两组织、去空、升序。同一事务发出，同一持有者再写不发。
  - 缺的：:395 写明"`payload.place` 是公共载荷字段，统治者变更取该统治边的标的地点"。title.mjs 的 emit 载荷没写 place，events.mjs:270 会把它补成 null。
  - 须改：payload 加 `place: placeId`，测试断言 `payload.place` 等于该地点。
- **M8 落实。**
  - forceValues 已作派生列进 org.json 并登 _unbuilt-derived；forcevalue 族进了族清单，前缀是占位，docs/问题.md 写明了。
  - priceRule 已记 docs/问题.md 第 1 条。

## 李白三条的落法与勘误流程

- **⑦ 落实。** 1123k41 把 :773 改为"边挂在被问地点自身为真、继承来的为假，org 恒是边的持有组织"，:1267 括注随改，两处一致。测试两种情形各一例。
- **⑧ 落实。**
  - 1123k42 在 :401 加"开局（opening）"，写明只作开局统治边的原因、不属 forcibleCauses、不连带封建契约；:378 写明取值。
  - verb_opening 动词行的各栏照 :395 共同取值；规则表 genHoldCause 取 verb_opening，并从 unbuilt 移出。
  - 手写的两条统治边改用它。
- **⑨ 落实。**
  - succession_pending 改为 succession_by_motion：orderSource 取 succsrc_motion，poolRX、cost 标待调，basis 引 b41e0801 与 D2。
  - 测试断言条目名与 basis 里不含"pending""占位"。这条测的是命名，偏弱，不挡合入。
- **勘误流程合规。**
  - 不升版本，记录追加在末尾，历史行不回改。
  - 写者说的"git 复制同一 blob"在中间状态无法逐字核实，因为那些状态没有提交。我改核内容：
    - 1123k41 快照与 36a927894 时的卷八只差一行，即 M6 改过的 1123k40 记录，符合"先 M6、后 k41"的次序；
    - 1123k42 快照与 1123k41 快照只差 :773、:1267 两行；
    - 最终卷八与 1123k42 快照只差 :378、:401 两行，加 k41、k42 两条记录。
  - 唯一瑕疵：k41 的记录行与 k42 一起写入，所以 k42 的改前快照里没有 k41 那一行。规则正文的次序没错，不挡合入。

## 未落写明了没有

写明了。卡回报"修改轮"一节写"未落：真实世界组织行迁入等 D 卡（ds/data-d）的 purpose_general 合入"；docs/问题.md 新节第 7 条写明"真实表磨坊查回原村"用例与上格绑在一起。第 1 轮的建议 1–7 全部记进 docs/问题.md 新节。

## 仍须改（2 条，均小）

- **R2-1 必填判定只留一处。** createRows 改为复用 validate/rows.mjs 的 `requirement()`，必要时给它加一个"按提案值与 classes 求值"的入口，并删去 required-dims.mjs。gen-create-rows.test.mjs 补一条"；"多条件的用例。
- **R2-2 统治者变更事件补 payload.place。** 取被问的地点（:395），并加断言。

顺手改两处，不单列：
- writeback.mjs:17 把 isObj、cmp 两个 const 挤到了同一行，还原成两行。
- polity.json 里 genIdSlots 的 basis 仍写"须李白认或改名"，改成主会话"已定"的写法。

## 能否合入

本轮判**不过**，2 条要改，都是局部小改，不加新设计。照 CLAUDE.md"两轮后的小改由主会话判断"：写者改完后，主会话亲读这两处 diff，跑上面 8 个测试文件和 pre_commit，过了即可合入 A 卡，不必再开第三轮核。
