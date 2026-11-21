# G9 前置内核子卡《dated 按日生效写者机制》只核（Opus 5.5 中档，内核跨卷）

- 被核：分支 ds/dated-kernel 提交 436712547（diff 取 `git diff $(git merge-base HEAD origin/master)...HEAD`）；写者 Claude Sonnet 5.5 中档，回报 docs/卡回报/dated-kernel.md。
- 依据：docs/产品原则.md；CLAUDE.md；对照表 docs/迁移体检/格子G6-G11-规矩检查对照.md #52、#53、待定 5；卷二 :164（§1.3 最上一级）、:796（§2.7 `dated`）；卷五 :372（§3.3）、:511（§4.1 规则 16）；卷二十七 :327、:570、:636。
- 本人复跑：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 1631 / ℹ pass 1631 / ℹ fail 0`。pre_commit 三项基线 fail（vol12.A12-4.5、S12-2、S12-3）不计。

## 一、写者"须 Opus 核"三问

### ① 取值取"最后追加"而非 fromDay 最大 —— 过
- 卷二 :164 原句："取生效日 `fromDay ≤ d` 的各条中最后追加的那一条的值（source=dated）"。字面就是按追加次序取，不是按 fromDay 取最大；fromDay 相同时同样取后追加的。卷二 :796、卷五 :372/:511 都只引 §1.3，没有另一种口径。
- 实现 server-plugin/kernel/dated.mjs:51（顺序扫、后者覆盖）与卷文一致；tests/kernel/dated.test.mjs "最后追加的赢" 用例按卷文手算（8、7 先后追加，第 8 日取 fromDay 7 那条值 6），期望正确。
- 与"过去日不变"不冲突：新记录 fromDay 必大于写入日，对 d ≤ 当日的取值集合不变。
- 设计提示（不改本卡）：此口径下后追加的早生效记录会永久遮住先追加的晚生效记录（"后来的决定作废先前的排期"）。若李白本意是"晚生效的排期不被取消"，须改裁定；卷文现状下本卡照做是对的。

### ② 记录路径形与"同一实体类至多一条 dated 模式" —— 必须改（收紧过严、并漏出位置量）
卷二 :796 只写"`writePath` 对该行该维度只往它的改写记录末尾追加"，没写改写记录存在哪条路径；写者把 dated 模式本身定为记录路径（`list<…>`、两个 `*` 段：实体类、dimKey），writePath 一律拒、另开 kernelApi `writeDated`。"记录另存一条 list 路径、经专门入口追加"属于卷文未写、实现须定的部分，可接受但须随卷二勘误报李白定（见四、跟改项）。但写者另补的两条收紧推不出且与卷文冲突：
1. **dimension 段强制为 dimKey 通配**（server-plugin/kernel/load/state-owners.mjs:355 `roles.includes(KEY_DIMKEY)`）：一条 dated 模式就覆盖该实体类的全部维度。卷二 :796 明写"place 表的位置量（`parent`、`anchor`、`facing`）不按日生效改写……两类改写写者落在不同模式上"，卷五 :372 只把"除组件类的挂载、`parent`、`anchor`、`facing` 之外的各量"列为可按日改写；单项登记名单也要求"一行一个维度，不写通配"（卷二 :799）。现形状下卷五无法只登它那几维，任何 place 的 dated 写者都能对 `parent` 追加记录，storage.mjs:322 起的 appendDated 也只核"是该表维度、非派生、非 string"，不拦。
2. **同一实体类至多一条 dated 模式**（state-owners.mjs:344–:360）：卷二 :796 的唯一性口径是"一条模式至多一个改写写者"；同一实体类不同维度归不同系统是常态（卷五改山形/地形类，卷二十 §4.3.3 第 10 条改地点的气候覆盖，都落在 place 上），现规则会把第二家直接报 E-DATED-WRITER。
- 改法：dated 模式的维度段允许"dimKey 通配"或"固定的维度名字面段"两种（字面段在加载期核为所列每个实体类的维度）；唯一性改为"同一（实体类，维度）至多一条 dated 模式"（通配段视为覆盖该类全部维度，与字面段相交即报 E-DATED-WRITER）；storage.mjs:362–:371 `datedRecordsOf` 相应改为按（类，维度）找唯一命中而不是第一条命中实体类就返回。补测试：字面维度段模式可登记、两家分登同类不同维度通过、通配与字面相交报码、字面模式下对未登维度追加被拒。

### ③ 门禁 path_access / js-state 不认 dated —— 建议（挂门禁卡，本卡不补）
- 运行期已关死：storage.mjs:212 `writerOk` 对 dated 模式一律 false，直接 writePath 写 dated 路径即 E-VIEW-UNDECLARED-WRITE（测试"写者核对"覆盖）；appendDated 另核 `w.rewrite === tx.file`（storage.mjs:322 起）。所以不存在"绕过 writeDated 而落盘"的口子，只是静态门禁对"登记写者直接 writePath dated 路径"给了假阴性（tools/accept/detectors/path_access.mjs:242 与 tools/accept/lib/js-state.mjs:189 的写者记录没有 dated，静态口径与 writerOk 不再同构）。
- 改法：门禁卡里两处写者记录加 `dated`，静态判定照 writerOk 对 dated 模式判不合法；随首个真 dated 写者卡或下一张门禁卡做均可，记入 docs/问题.md。

## 二、其他必须改

### ④ 追加的 value 不按维度定义核类型/值域 —— 必须改
- storage.mjs:337–:339 只核非有限数与 `plainValue`（任意代号串、数、对象都过），没有按维度表定义核类型、单位、值域、引用。写者注释自称"同 writeItemDeviation 的口径"，但 writeItemDeviation 在 server-plugin/kernel/dimension-writers.mjs:168 调 `checkField`（校验器 checkValue）。现状可往 number 维度 `mass` 追加 `'evt_x'` 或超出 domain 的数，`dim()` 最上一级原样交出——规则引擎读到不合表头的值。
- 改法：appendDated 对 value 用与 checkField 同一个校验（把 dimension-writers.mjs 的 checkField 抽到共用处或导出给 kernel 组内，不复制），不合即该校验给的码、不落记录。补测试：number 维度写代号串、写出 domain 的数各拒一次。

### ⑤ `inputVersionAt` 用"条数"作版本，不能当跨写入的缓存键 —— 必须改
- dated.mjs:62–:64 返回"fromDay ≤ d 的记录条数"。它对（state, d）是确定的、在同一条只追加的历史里单调，但不是内容的身份：事务回滚（transaction.mjs:118 前的撤销）与刻级回退（transaction.mjs 刻日志）会撤掉已追加的记录，之后另追加一条不同内容的记录，条数回到同一个值；回滚前若有基底缓存按旧条数存了，回滚后同键命中旧基底，世界读错。同一进程里两份存档条数相同、内容不同也同键。kernel 自己的 stateMemo 因每写/每回滚整清而不受影响，但卷五 :511、卷二十七 :327 要的正是跨写入、跨日留存的基底缓存，条数不够用。
- 改法：版本取当日有效记录内容的确定性摘要——按记录路径字典序、同路径按追加次序，把 (路径, fromDay, value, cause) 规范化后用内核现有的状态哈希原语求值（不新造哈希）；datedRecordsAll（storage.mjs:381）须同时交出路径并排好序（现"次序不保证"）。仍满足"过去日追加不变、将来日追加才变"。补测试：两份状态条数相同内容不同 → 版本不同；事务追加后回滚再追加另一值 → 版本与回滚前不同。

### ⑥ 一次求值里两个"日"可不一致 —— 必须改
- dimensions.mjs:498 `evaluate` 的基值按 `opts.day` 取（不给即当前日），而同一次的修正项与 when 按 `opts.clock`（dimensions.mjs:501；rxBindings 在 :320 又以 `clock.day` 作求值日）。`modified(…, {clock: {day: 3}})` 在当前日 5 时：修正项按第 3 日、基值却按第 5 日的 dated 记录，同一次求值混两日。卷二 :164 只有"一个可选的求值日参数"。
- 改法：求值日只认一个出处——`opts.day` 不给而 `opts.clock.day` 给了时取 `clock.day`；两者都给且不等即 E-DIM-STRUCT-FIELD。`modified` 的 memo 键（dimensions.mjs 的 stateMemo 一行）随之只用这一个日。补测试：只给 clock.day 时基值按该日的 dated 记录。

## 三、再核各项

| 项 | 判 | 证据 |
|---|---|---|
| E-DATED-FROMDAY 命名、拒写不落记录、整笔回滚 | 过 | 卷二 :796"拒写的错误码随首个 dated 写者卡登记"；待定 5 已定由本子卡命名；error-codes.mjs 新组 vol2.s2.7；storage.mjs:335；测试"拒写 fromDay""整笔回滚"覆盖 0、负、小数、NaN、Infinity、字串、null、undefined |
| E-DATED-WRITER（加载期一码） | 过 | 与 E-RELOC-FIELDS 对 viaRelocate 的分法同构；state-owners.mjs:537–:542（缺写/非布尔、真而无 rewrite、与 viaRelocate 同真、有 create）。"dated 真则 create 须空"是写者补的（卷二未写），理由成立（建行写者对记录路径无写入口），列入跟改项报李白 |
| 当前日来源 | 过 | `clock.minute` 整除一日分钟（卷二 :164、:796），dated.mjs 经 scheduler.mjs clockView；无记录时不读时钟，与改前逐位相同 |
| cause | 建议 | storage.mjs:336 只核代号形态；卷二 :796"cause 是触发它的事件记录，卷二十四"。事件记录存在性核对待卷二十四事件日志读口可用时补，记 docs/问题.md |
| 行范围 rewriteRows | 建议（基线既有） | 卷二 :796"行范围……照上两条"；appendDated 不核行范围，但基线 writePath（storage.mjs:210 起）同样不核 rewriteRows，属全局缺口，不归本卡，记 docs/问题.md |
| 17 类判据 rev+1 | 过 | criteria.json 每类 rev 加一、补同号修订记录，判据未改；经 tools/accept/register.mjs 登记器写回（写者一次性脚本只调 register），同 G8 先例。修订记录文字漏列 dated.mjs，不影响 |
| 3 份既有夹具补 `dated: false` | 过（新行为必然） | 卷二 :796"自那张卡起 `dated` 与 `viaRelocate` 同样在每个写者对象行上必写"；diff 只加字段、断言期望未动；world/ 下无写者对象行（grep viaRelocate 0 命中），世界数据无需跟改 |
| 码表条数 605→607 | 过 | tests/kernel/error-codes.test.mjs 手数字面量加 2，附来由 |
| 测试只调入口、未造运行设施 | 过 | dated.test.mjs 只调 writeDated、dim、modified、inputVersionAt、mergeStateOwners、writePath/readPath；声明表与 gadget 夹具是测试数据，用既有 fixture.mjs 与 installStorage，无新增仅供测试的生产代码；期望按卷文手算 |
| 不写死、不特例 | 过 | 记录路径、实体类、写者文件全取声明表；无 id/表名字面量 |
| 卷二十七确定性 | 过（⑤ 修后） | 记录在 state 内、随存档进哈希（卷二十七 :570）；取值只依追加次序与 fromDay；唯 inputVersionAt 的内容身份见 ⑤ |
| import 链 dimensions→dated→scheduler | 过 | 无环；只在有记录时读时钟 |

## 四、卷二跟改项（主会话报李白、派勘误；本卡不改卷文）
写者回报所列三条照收，另加：
1. 改写记录的存放：卷二 :796 原句是"`writePath` 对该行该维度……追加"，实现改为"dated 模式即记录路径（list）、writePath 拒、经 kernelApi `writeDated` 追加"。这是卷文未写的落地形，须李白认可后写进卷二 §2.7（含 ② 改后的"维度段可为 dimKey 通配或字面维度名、同（类，维度）至多一条"）。
2. `dated` 真时 `create` 须空、单一求值日参数（⑥）、`inputVersionAt` 为内容摘要（⑤）写进 §2.7 kernelApi 表。

## 总判
**打回修改**：必须改 4 条（②维度段与唯一性过严且漏出位置量；④value 不按维度定义核；⑤inputVersionAt 条数会撞键；⑥基值日与修正日两出处）。① 过，③ 挂门禁卡。改完须再复核一次（内核，Opus）才可封。

---

# 第二轮（末轮）只核：5d5439ff7..c91924c66

## ② 维度段与唯一性：过
- state-owners.mjs 的 mergeStateOwners dated 段：维度段可以写 dimKey 通配，也可以把最后一段写成字面维度名。唯一性按（实体类，维度）算：通配与同类任何 dated 模式相交即 E-DATED-WRITER；字面与同类同维度或通配相交同码。给了 ctx.tableDims 时，字面维度核为所列各类的维度。
- storage.mjs 的 `datedRecordsOf` 在字面模式下只认它那一维，维度由 `datedDimensionOf` 取。
- 用例：dated.test.mjs "字面维度段……"覆盖登记、分登两维、通配与字面相交、同类同维两条、字面维度不在表里。"字面维度模式运行期"对 `size`、`parent` 追加得 E-PATH-UNDECLARED，不落记录（`state.shaped.gad_box` 只剩 `mass`）。位置量可以不登、也登不进，满足卷二 :796、卷五 :372。
- 建议：没传 ctx.tableDims 时字面维度不核（`isObj(dims)` 为假就跳过）。运行期 appendDated 仍以 E-DIM-REF-MISSING 拒，不留口子，记一笔即可。

## ④ value 按维度定义核：过
- 新文件 server-plugin/kernel/dim-value-check.mjs 的 `checkField`，函数体与原 dimension-writers.mjs 里的逐行相同。唯一改动是 `fail(code, why, entity)` 换成 `new KernelError(code, {entity}, why)`，二者等价（dimension-writers.mjs:37 的 `fail` 就是这个构造）。dimension-writers.mjs 用包装保留缺省 `kind = item`。既有行为不变，没有放宽；既有测试全过。
- `writeDated` 经 `fitValue` 把校验交入；`appendDated` 缺 `fitValue` 即拒，不给口子。用例：代号串、101、−1、数组都拒，100 通过。

## ⑤ inputVersionAt 改内容摘要：过
- dated.mjs 按路径字典序、同路径按追加次序取当日有效记录，先经 storage.mjs `canonical`（与存档同一规范序列化）规范化，再经 save.mjs `sha256Text`（注入的 DigestCap，同 sample.mjs 先例）求摘要。`datedRecordsAll` 改交 `{path, records}` 并排好序。结果确定，与遍历次序无关。
- 用例"inputVersionAt 是内容身份不是计数"：条数相同、内容不同的两份状态版本不同；事务内追加后取版本，整笔回滚，再追加另一值，版本既不等于回滚前、也不等于空。按条数实现这条用例必败，撞键确实守住了。测试装 DigestCap 同 dimensions.test.mjs 先例，不算为测试造设施。

## ⑥ 求值日单一出处：必须改（只解决一半，且新出 memo 撞键）
- dimensions.mjs 的 `evalDayOf` 让基值只认一个日：opts.day 优先，没有就取 clock.day，两者都给且不等即拒。这一半对了。但 `evaluate` 仍把原样的 `opts.clock` 交给 `registeredRows`（dimensions.mjs:508），经 `prepareRow` 到 `rxBindings(…, clock)`（:397、:404）。结果是只给 `opts.day: 8` 时，修正项的 when / valueRX 读不到第 8 日；它们读的维度在 rxBindings 里 `clock.day` 为空，按当前日取。同一次求值仍然混用两日，⑥ 的原问题在 opts.day 这条路径上没解。
- 新问题：`modified` 的 memo 键改成了 `[target, id, day]`（day 取自 evalDayOf）。`{day: 8}` 与 `{clock: {day: 8}}` 两种调用得同一个键，交给修正项的 clock 却不同（一个 undefined，一个 {day: 8}）。先调用的那种算出的结果会被后调用的命中，读错。改前两者键不同，不会撞。
- 改法：`evaluate` 里用同一求值日组修正项的时钟，即 `const day = evalDayOf(opts); const clock = day === undefined ? opts.clock : { ...(isObj(opts.clock) ? opts.clock : {}), day };`，再交 `registeredRows(…, clock)`。这样两种调用语义相同，memo 同键也就正确。补用例：装一条修正项，其 valueRX 读 dated 维度或 when 读 clock.day；`modified(…, {day: 8})` 与 `modified(…, {clock: {day: 8}})` 结果相同、都按第 8 日；两种调用先后互换，结果不变。

## ③ 及遗留：过
docs/问题.md 新节记了三条：门禁 path_access :242 / js-state :189、cause 是否存在、rewriteRows 行范围，与第一轮建议一致。

## 其他
- 本人复跑 `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`，结果 `ℹ tests 1636 / ℹ pass 1636 / ℹ fail 0`。
- 没有新特判，没有放宽断言。第一轮的既有用例只改了 inputVersionAt 那条，由条数改为摘要，随接口语义变；期望仍可手算验证，合理。

## 第二轮总判
**不过**：②④⑤ 已解决。⑥ 还须改一处：evaluate 交给修正项的时钟要带同一求值日，否则 opts.day 路径仍混日，modified 的 memo 在两种写法间也会撞键。本轮已是第二轮（末轮），按"每卷最多审两轮"交主会话定。改动只有一行加一条用例，建议主会话亲读 diff 后封，不再开第三轮复核。
