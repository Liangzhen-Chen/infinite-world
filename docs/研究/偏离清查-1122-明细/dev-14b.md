共 6 条，甲 0 乙 4 丙 2，有理由 3 无理由 3。

本卡读了：卷一 :130-169、:350-389、:395-475（Grep 定位 §3A.9 :417）；卷九 :268-297、:425-444、:615-686；卷二 :283-322、:560-719、:968-1002、:1013、:2342；卷二十四 :126-160（Grep 定位表 A、R24-1.1）。文件：server-plugin/primitives-runtime.mjs :1-453 全读；world/ontology/primitives.json 全文；server-plugin/systems.mjs :1-20；server-plugin/index.mjs :1-33；server-plugin/kernel/mount.mjs :1-69；world/ontology/state-owners.json :25-55、:130-330（Grep + 节选，未通读）；server-plugin/kernel/transaction.mjs :1-80；kernel/ledger.mjs :108-152、:404、:749-765；kernel/holdings.mjs :560-750；kernel/events.mjs :1-120、:263-281、:363 附近；kernel/load/world.mjs :190-251；kernel/load/state-owners.mjs :110-140、:400-433；kernel/declare.mjs :108-137；kernel/error-codes.mjs、grid-diff.mjs、kernel/title.mjs、perceive.mjs 用 Grep 定位。未读：state-owners.json 全文、卷二 §2.8/§2.9 其余部分、卷九 §4.3 以后、卷一其余各节、kernel 其他文件与 tests。

## 已核不记（已在别处记录或本卡范围外）

- 正则字面量：primitives-runtime.mjs、systems.mjs、index.mjs、kernel/mount.mjs 四文件零处（无 `= /…/`、`new RegExp`、`.match(`），本卡不新增条。
- isCode/isKey 手写文法：dev-01 #7、公共部件审查-乙-1122.md 第五节第 4 条已记，不重复。
- canonical 自写：dev-01 #8、公共部件审查-乙-1122.md 第十节已记，不重复。
- primitives-runtime.mjs 在根目录而不在 kernel/**：dev-01 #5 已按李白五.1（李白裁定-1117.md:1081）记为丙（有理由），不重复。
- index.mjs:17 的 `export const info`：卷二 :1013 第四种许可语句（李白裁定-1117.md:1487，勘误 1121k9）已放行，代码符合；注释仍写"等裁定"已由 dev-01 #6 记，不重复。
- execute 无生产调用者：dev-14a #5、公共部件审查-乙-1122.md:201 已记，不重复。
- 规则层自造 deny/Error：公共部件审查-乙-1122.md:140 已记，不重复。
- grammarMaxLength：登记在 world/rules/registry.json:4-7 与 tables/kernel-constants.json:16（值 48），primitives-runtime.mjs:110-117 经 engine.rules 读、缺键或非正整数即拒；规则表直读 engine.rules 已见公共部件审查-乙-1122.md:86，不重复。
- 直接 writePath：执行器零处。transfer→kernel/ledger.mjs#transfer（内部经 post）；holding 四条→kernel/holdings.mjs；destroy→kernel/terminate.mjs；move/create→runDelegated 调 position.mjs#placeSubject；emit→kernel/events.mjs#emit 与 perceive.mjs#perceiveEvent。未见自己另算账本、持有或位置。
- 目录封闭：CATALOG 20 行 15 族（含 transform），与卷九 :625 的设计目录一致；checkPrimitiveCatalog 校行数、族数、旧字段、无 string 类型、逐行相等，与卷一 §3A.9 :417"原语 op 封闭"一致。
- 契约参数与卷九 :629-:647 逐行核：20 行的必填/二选一/条件必填字段无一处与表不符（move 的 subject 另见第 1 条；其余字段见第 1 组拿不准核对节）。
- 逐个执行器核过：transfer（from/to 账户 id 拆段、资源同种校验在契约期、qty 原样交 ledger.transfer）；holding 四条（open/close/transfer/rescale 原样转交 terms，close 认边 id 或三元，transfer 认 holding/id + newHolder/holder）；destroy（交 terminate）；move（runDelegated 到 position.mjs#placeSubject，facing 缺省 null）；create（CREATORS 按实体类查表，未登记类 E-ACT-WRITER-NOT-READY，person 建行与初值位置同事务）；emit（本事务内调一次 perceiveEvent，再经 kernel/events.mjs#emit 写事件，primitives 取整批）。事务：execute 不自开事务、失败不 catch，由调用方事务整笔回滚，与卷九 R9-2.3 :663 一致；排序：sortPrimitives 按目录固定序、同原语按列表下标（R9-2.3 原文）。未发现字段漏传、越权写或另算账本/持有/位置。

### 1 move 契约写 subject 可选，运行期 CONTRACT_EXTRAS 强制必填
- 位置：server-plugin/primitives-runtime.mjs:60（CATALOG optional subject）、:202-204（CONTRACT_EXTRAS.move）；world/ontology/primitives.json:139-145
- 设计原文：卷九:639 `move` 行"契约必填字段"栏只有 `to`（表头注明"可选字段从略"）；行动者由提交段给（卷九 §2.9 :437 提交段那一行）
- 代码实际：CATALOG:60 与 primitives.json:139-145 都把 `subject` 列为 optional，两边逐行一致；但 :202-204 在契约校验之后另加 `Object.hasOwn(p,'subject')`，缺 subject 即 E-ACT-PRIMITIVE。
- 理由：docs/问题.md:759 登记"move 契约加了可选 subject、facing…resolve 落地时撤 subject 必填"；docs/审查/G12位置写者-Opus只核-1123.md:46 判"可接受（过渡）"
- 影响：规则缺（比卷九 :639 的契约严；move 不带 subject 的合法调用被拒；现无生产调用者）
- 严重程度：乙
- 合并：G12位置写者-Opus只核-1123.md:46；docs/问题.md:759；dev-01 拿不准第 2 条（本卡给出结论）

### 2 emit 把缺省 payload 静默当空表，绕过表 A 的 onUnknown=error
- 位置：server-plugin/primitives-runtime.mjs:312
- 设计原文：卷二十四:143 `payload` 行 onUnknown = error"形状由动词行 payloadShape 给"
- 代码实际：`const payload = ev.payload === undefined ? {} : ev.payload;`，缺省即当空载荷交给 kernel/events.mjs（events.mjs:363 同式，不在本卡文件范围），缺 payload 的事件不会按 error 拒收。
- 理由：无（docs/问题.md:780 明写"payload 须由提交段按动词行 payloadShape 备齐，适配器原样交内核校验"，未授权把缺省当空表）
- 影响：规则缺（事件可少 payload 落库，表 A 的字段校验被空值跳过）
- 严重程度：乙
- 合并：无

### 3 规则层用 typeof 裸字串比较做收窄，卷一 :368 明文不设此例外
- 位置：server-plugin/primitives-runtime.mjs:121（代表；全文 :74-410 共 19 处，见 :74、:96、:121、:129、:138、:146-154、:163、:175、:188、:216、:374、:409-410）
- 设计原文：卷一:368 "本卷不设'JS 语言记号'例外：`typeof x === 'string'` 这类与裸字串比较的写法在规则层同样违例；确需的类型收窄只在卷二 §2.9 登记的 `narrow` 内部做"
- 代码实际：契约校验与文法函数用 `typeof … === 'string'/'object'/'number'` 的裸字串比较判类型，未经 kernel/validate/narrow。
- 理由：无
- 影响：规则缺（规则层扫描违例；读数不受影响）
- 严重程度：乙
- 合并：无（dev-01 #7 只记手写文法，未记 typeof）

### 4 grid-diff.mjs 从未被 import，其加载期 registerDelegate 在运行时不执行
- 位置：server-plugin/systems.mjs:7-10；server-plugin/grid-diff.mjs:188-189
- 设计原文：卷二:1013 "`registerSystems` 是规则层唯一对装配文件开放的导出（`server-plugin/systems.mjs`，它 import 各系统模块，触发它们的 `declare*` 与 `registerAdvanceHook` 登记）"；state-owners.json:48 已登记 sys.gridDiff
- 代码实际：systems.mjs 只 import item-lots、death、position（另 import primitives-runtime 供目录核对）；全仓无任何文件 import grid-diff.mjs，故 :188-189 的两条 registerDelegate 在运行期从不发生；state-owners.json:302 却把 grid-diff.mjs 列为 registerDelegate 的 callerFile。
- 理由：无（docs/问题.md:638 只记"已经 registerDelegate 登记、没有任何调用者"，未记该模块从未被 import、登记在运行时不发生）
- 影响：规则缺（将来任一 runDelegated('grid-diff.mjs#alterCells'/'#clearDiffs') 会先撞 kernel/transaction.mjs:71 的 E-ACT-WRITER-NOT-READY；现无调用者）
- 严重程度：乙
- 合并：无

### 5 原语契约在 CATALOG 与 primitives.json 各一份；卷九点名的 primitive-schema.mjs 不存在
- 位置：server-plugin/primitives-runtime.mjs:48-69、:433-453；world/ontology/primitives.json:1-238
- 设计原文：卷九:625 "原语目录（`world/ontology/primitives.json`，封闭…）；现行契约在 `server-plugin/primitive-schema.mjs`"
- 代码实际：20 行 15 族的 op/family/channel/required/optional/oneOf/unless 逐字段完全一致；唯一差别是 primitives.json 顶层多 `version:2`（全仓无读者、checkPrimitiveCatalog 不核、不在 OLD_TOP_FIELDS）；完整契约在 CATALOG 与 primitives.json 各存一份，靠 checkPrimitiveCatalog 逐行比对防漂移；卷九点名的 server-plugin/primitive-schema.mjs 不存在。
- 理由：李白 11-18 22:10 丙8（李白裁定-1117.md:1099，primitives.json 旧条目按新契约逐行转换）＋五.1（:1081，执行器归规则层 primitives-runtime.mjs）；5-1 终核已接受两份数据（5-1-Sonnet终核-1119.md:17）
- 影响：只是形式（防漂移测试在；卷九对 primitive-schema.mjs 的文件指认未更新）
- 严重程度：丙
- 合并：dev-01 拿不准第 1 条（本卡给出逐行结果）

### 6 execute 签名多出第五参数 event，卷九写四参数
- 位置：server-plugin/primitives-runtime.mjs:369
- 设计原文：卷九:657 "写：`execute(engine, state, primitives, cause)`"
- 代码实际：`execute(engine, state, primitives, cause, event)`，第五参数承载提交段的事件上下文 `{actor?, actorAs?, targets?, payload?, rollKey?, idParts}`；批里有 emit 而无它即整笔拒收。
- 理由：docs/问题.md:780 登记"execute 新增第五个参数 event（提交段上下文：actor、targets、payload、idParts，卷九 §2.9）…resolve() 提交段（6-14）落地时交入上下文"；PLAN.md:14 卡 6-14
- 影响：只是形式（对外签名与卷九不一致；现无生产调用者）
- 严重程度：丙
- 合并：无

## 第 1 组两条拿不准的核对结果

1. **CATALOG 与 primitives.json 双份**：逐行对照 20 行，`op`、`family`、`channel`、`required`、`optional`、`oneOf`、`unless` 全部相等，行序与族数（15）也相同；没有哪一行不同。唯一字段差是 primitives.json 顶层 `version:2`，CATALOG 是数组无此项；此字段无读者，checkPrimitiveCatalog 只拒 OLD_TOP_FIELDS（$schema/kind/namespace/note/entries）与 OLD_ROW_FIELDS（event/params/writable），故 `version` 未被核。结论：双份本身按丙8（primitives.json 按新契约逐行转换）与五.1（执行器归规则层）有理由，见第 5 条；卷九 :625 的 primitive-schema.mjs 指认是未更新处。
2. **move 的 subject optional 与 required**：CATALOG:60（optional subject）与 primitives.json:139-145（optional subject）两边一致，且与卷九 :639 一致（该行必填栏只有 `to`，表头写明可选字段从略；行动者由提交段给，:437）。不一致的是第三个地方 CONTRACT_EXTRAS.move（:202-204）的强制 required；即"与卷九 :639 一致"的是 CATALOG/primitives.json 两侧，不是运行期额外校验。按有记录理由属过渡，见第 1 条。

## 特殊值核查（subject 缺 / qty 0 / 空 targets）

| 原语 | subject 缺 | qty 0 | 空 targets | 结论 |
|---|---|---|---|---|
| transfer | — | 契约 integer 收下，kernel/ledger.mjs:758 拒非正整数（E-DIM-DOMAIN-RANGE） | — | 不可绕过 |
| holding.open | 必填，缺即 E-ACT-PRIMITIVE | — | — | 不可绕过 |
| holding.close | oneOf 恰取一组，缺即拒 | — | — | 不可绕过 |
| holding.transfer | subject 非必填（卷九 :632 未列）；holder/newHolder 恰取一 | — | — | 不可绕过 |
| holding.rescale | subject 必填；shares 空表/0/负值契约收下，holdings.mjs:713/:716 拒（E-HK-PROTOCOL） | — | — | 不可绕过 |
| move | 契约 optional，CONTRACT_EXTRAS 强制（第 1 条） | — | — | 有偏离 |
| create | —（facts 空表契约收下，由创建例程自核） | — | — | 未发现绕过 |
| destroy | entity 必填 | — | — | 不可绕过 |
| emit | — | — | 空表按表 A :137 targets onUnknown=gap 允许 | 空 targets 合规；payload 缺省见第 2 条 |
| fact.set | — | value/delta 为 number，0 合规 | — | 未发现绕过 |
| vital | — | delta 为 number，0 合规 | — | 未发现绕过 |
| status | — | duration/magnitude 为 integer，0 契约合规；适配器未建 | — | 未发现绕过 |
| transform | subject 必填 | — | — | 适配器未建 |
| schedule | — | — | — | 适配器未建 |
| transition | — | — | — | 适配器未建 |
| learn | subject 必填；minutes 0 为卷九 R9-2.8 :668 明许（瞬时动作） | 0 合规 | — | 适配器未建 |
| time | — | minutes 0 契约合规 | — | 适配器未建（已裁不落） |
| obligation.create/settle/cancel | id 必填 | — | — | 适配器未建 |

## 装配核查（state-owners systems 15 项）

| 系统 | 实现模块 | 从 index.mjs 可达 | 依据 |
|---|---|---|---|
| sys.itemRot | item-lots.mjs | 直接 import | systems.mjs:7 |
| sys.death | death.mjs | 直接 import | systems.mjs:8 |
| sys.position | position.mjs | 直接 import | systems.mjs:9 |
| sys.capacity | action-capacity.mjs | 间接（death.mjs:20） | state-owners.json:30 |
| sys.status | status.mjs | 间接（death.mjs:21） | :32 |
| sys.person | person.mjs | 间接（primitives-runtime.mjs:31） | :34 |
| sys.economy | kernel/ledger.mjs | 间接（item-lots.mjs:7） | :38 |
| sys.items | kernel/item-state.mjs、kernel/dimension-writers.mjs | 间接（item-lots.mjs:6、death.mjs:11） | :42 |
| sys.title | kernel/title.mjs | **不可达**：只被 kernel/gen/holdcalls.mjs:6 import，而 holdcalls 全仓无 importer | :45 |
| sys.social | **无实现文件** | — | :46 |
| sys.gridDiff | grid-diff.mjs | **不可达**：全仓无 importer（第 4 条） | :48 |
| sys.simTiers | sim-tiers.mjs | 间接（position.mjs:38） | :49 |
| sys.wallFlow | kernel/wall-flow.mjs | 间接（load/world.mjs:41→gen/worldgen.mjs:21→gen/envelope.mjs:19） | :53 |
| sys.time_env | kernel/scheduler.mjs | 间接（index.mjs:9） | :54 |
| sys.dimension_entry | **无实现文件**（narrow.mjs 不存在） | — | :33 |

除上表外，state-owners.json 的 systems 条目不直接 import 者共 12 项，其中 8 项经上列 import 闭包仍被加载；真正不可达的是 sys.title、sys.gridDiff、sys.social、sys.dimension_entry 四项。

## 已登记未建

1. **11 个原语无适配器**（execute:386 整笔拒 E-ACT-WRITER-NOT-READY）：obligation.create/settle/cancel（卷九 :634-635）、fact.set（:636）、vital（:637）、status（:638）、transform（:642）、schedule（:644）、transition（:645）、learn（:646）、time（:647）。登记处：李白 11-18 22:10 丙6/丙9（李白裁定-1117.md:1095、:1101）与 docs/卡回报/ds-b5-1.md:79-96。
2. **schedule 适配器的整类映射已裁、码未落**：卷九 :651（李白 11-19 00:20，勘误 1118k26）给了 kind=due_scheduled、dueMinute=at、owner、ref 的取法；kernel/scheduler.mjs:362 `schedule` 写者已在，适配器未建。
3. **time 适配器不落**：卷九 R9-3.11 :723 写者为卷二十调度器；李白 11-23 事件 412004ce 裁继续拒收、交接形状随 6-13（PLAN.md:160、docs/问题.md:758）。
4. **learn / transform 随对方卷**：五.2（李白裁定-1117.md:1083）挂卷十四/卷十六首卡；卷九 R9-2.8 :668、:642 给了入参与写入口。
5. **status 适配器未建但写者已在**：status.mjs:51 `addStatusInstance` 已存在，卷九 :638 规定 status 原语落 status.mjs；丙6 挂状态容器卡（PLAN.md:14 卡 6-5 已合，适配器未加）。
6. **fact.set 的 R9-2.5 目标核对未落**：卷九 :661 要求目标维度在维度表登记、写者允许经执行器写；5-1 只核已记（5-1-DS只核-1118.md:32），适配器亦未建。
7. **R9-2.7 create/destroy 守恒配对部分**：卷九 :663 要求涉实物时由写者同事务 post 源汇腿；destroy 已走 terminate，create 只建 person（非实物），其余类拒收；5-1 只核记"部分"（5-1-DS只核-1118.md:28-34）。
8. **emit 的 sourceLevels 只有基值**：卷九 R9-2.10 :670 要求以行为人的动作行 sourceStrength 作加性修正；perceive.mjs:14-15 自述依赖未建，只有物种行基值（合并 dev-14a 已登记未建第 1 条、模块化评估-1122.md:175）。
9. **sys.dimension_entry 的实现与 narrow.mjs 未建**：卷二 :588 明写 view/predicates/writers/sources/sinks"本卷未就本系统写明，待补"；kernelApi 登记的 kernel/validate/narrow.mjs#narrow（state-owners.json:648）文件不存在；卷二 M2-12a :2342 定其职责。块 6 无输入边（index.mjs:4），入口未被使用。
10. **declareInputs 与 systems[*].inputs 镜像整体未建**：全仓无 declareInputs 调用方（docs/问题.md:532），load 仍会写回空 inputs（卷二 :880、load/world.mjs:232-250），依赖闭包无内容。

## 拿不准

- **sys.title 的运行时地位**：kernel/title.mjs 存在、sys.title 已登记（state-owners:45，emits verb_governor_changed），但只被离线生成代码 kernel/gen/holdcalls.mjs 引用且 holdcalls 本身无 importer；PLAN 未见该系统建卡记录。是有意只作生成期，还是漏接线，需裁定。
- **sys.social 无实现文件**：state-owners:46 条目只有空字段（tables/writers/entryCallerFiles/entryJudges/emits 都为空），全仓无 social.mjs；是占位登记还是应删，卷文与 PLAN 未见。
- **systems 条目全部缺 `view`**：卷一 :453 写 systems[<id>]={view,…}，卷二 :583/:587 示例中 sys.status/sys.capacity 都有 view；实际 15 个条目无一有 view。inputsBySystem（kernel/declare.mjs:123）只按 view+predicates 归节点，缺 view 会使 view 节点不进 inputs 镜像；但 declareInputs 整体未建（上节 10），现在无实害。是否按缺字段记，拿不准。
- **sys.status 的 phase status_tick 缺**：卷二 :586 示例有 `status_tick`，实际 sys.status（state-owners:32）无 phase，status.mjs 也未 registerAdvanceHook；示例是否必须落，拿不准。
- **execute 要求每批必有 emit**：primitives-runtime.mjs:377-380 在无 emit 时整笔拒 E-ACT-WRITER-NOT-READY；卷九 R9-2.3 :663 只写"成功后恰产出一条事件"，未写每批必有 emit；钩子输出清单（R9-2.6 :666）若不含 emit，事件动词没有来源。卷文未给无 emit 批的处置。
- **move 的 facing 可选字段**：卷九 :639 契约表未列，CATALOG:60 自加 optional（G12 只核 :46 要求核卷九是否随 C17-11 勘误加 facing）；与 subject 不同，facing 未在 docs/问题.md 单列。
- **sys.ai_interface 未登记**：卷九迁移表多行"系统"栏写 sys.ai_interface（如卷九 :1539-1546），state-owners.json 无该系统键；docs/卡回报/ds-b5-1.md:125 已把它列为拿不准，本卡确认仍缺。
- **primitives.json 顶层 version:2**：无读者、checkPrimitiveCatalog 不核，也不在丙8 要删的旧字段清单；是否算应删的旧格式字段，拿不准（见第 5 条）。

## 跨卷待判

- 无新增。卷一 :145/:465 把 primitives*.mjs 的目标路径写在 server-plugin/kernel/**，与卷九 :653 及李白 11-18 22:10 五.1（执行器归规则层、文件 server-plugin/primitives-runtime.mjs）的冲突，已由 dev-01 #5 按五.1 处理并记为丙（有理由），本卡不重复判。
