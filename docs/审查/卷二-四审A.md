模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二 四审 A（第四版，最后一轮）

审查对象：docs/统一底层设计/卷二-维度表规范与统一入口.md（1391 行，已读 §0–§5、§7、附录 A–F；§6 只抽查前缀与派生显式写入）。对照：卷二-三审A.md 的 M1–M9、卷一当前条文（只抽查编号与引用）、F:/dnd-tmp/vol2/stacking.mjs（只读，未运行）。

## 总判：有条件通过

三审 A 的 M1–M9 九条，8 条已解决，1 条（M8）部分解决（卷二一侧已对齐，但正文仍有 4 处旧卷一编号，且卷一现行条文与附录 F 的"一致"声明有 3 处对不上）。第四版新增的 impl 组、三种行、effectCall、前缀改名、14 种类型、§5 改表、consent 字段，引入 8 条新矛盾，都是"改一处漏一处"型，不需要改方案，只需同步。没有发现条款读自然语言判断逻辑。

## 一、M1–M9 逐条核对

| 条 | 判定 | 行号证据 | 说明 |
|---|---|---|---|
| M1 惩罚表越界 | 已解决 | L473 `penalty(n) = n <= 8 ? S[n] : 0`；L475；B3 L1217；脚本 L26–27 | 伪代码、系数表注、B3 三处同一写法；B3 加了序号 8/9/10 的断言（0.10×0.0001 截断为 0）。 |
| M2 附录 B 顺序 | 已解决 | L454、L464–466、L476；附录 B L1295；脚本 L23 | 规则顺序为传统→教义→种族→负侧，已改；L476 明文"豁免条仍按全序键排序"。我按新顺序手算：加后 10500；×(10000+2000)/10000 = 12600；教义 1000×8691/10000 = 869.1 截 869，12600×10869/10000 = 13694.94 截 13694；种族 13694×10500/10000 = 14378.7 截 14378；负侧 14378×8500/10000 = 12221.3 截 12221。结果 **1.2221**，与作者一致；explain 的系数序列 1.0000 / 0.8691 / 1.0000 / 1.0000 与顺序吻合。脚本第 23 行已按新顺序改写。 |
| M3 state 外传 | 部分解决 | §2.3 L348、L357、L360；A12 L1182 | `impl` 组已加，辅助函数与示例矛盾解除。但新写法把"视图调视图"也禁了，见新必改 N1。 |
| M4 实体行 | 部分解决 | §1.2 L78、L106；§1.3 L110–114、L132；附录 A L1256、L1282–1290；A15 L1183 | 三种行、`rows` 节、`instanceTable:null`、fac_forge 实体行、faith 的 parent 与 extends 分离均已写。但 extends 的目标规则与适用类型表仍只说类别行，见 N2；附录 A 夹具仍通不过自己的校验器，见 N6。 |
| M5 效果引用 | 已解决 | §1.5 L168；§3.9 L558；§1.11 L262、L269；§5.1 L671；§5.3 L718；§5.7 L779；§5.11 L827；§5.21 L977；附录 A L1267 | `effectCall = struct{family: ref effect, params}` 为唯一形状；附录 A 改为合法的 `{"type":"ref","kind":"effect"}` 结构；各表同步。 |
| M6 前缀 | 部分解决 | §1.9 L202–206；§5 各表 | 前缀改名与全表登记已落实（flora_、lore_、etype_；词表族 70 余项带前缀；E-DIM-VOCAB-PREFIX L605）；我逐项核对，没有族前缀与实体前缀相同、互为前缀的情况；旧前缀 `plant_/know_/evt_` 在正文已无残留（仅 L204 的改名说明）。但 §5 的"类型"列把族写成前缀缩写而不是族名，见 N4。 |
| M7 onUnknown 列 | 已解决 | L622；§5.1–5.22 各表 | 每个维度表都有 onUnknown 列，5.8–5.17 已表格化，always 维度一律 error。 |
| M8 附录 F 与卷一 | 部分解决 | 附录 F L1370–1389；正文 L118、L295、L532、L534 | 附录 F 已按卷一 3A.1–3A.9 重写；consent 字段已加（L550、L557）。但正文还有 4 处沿用旧编号，卷一现行条文也有 3 处与"一致"的说法不符，见 N7。 |
| M9 string/union | 部分解决 | §1.5 L166–178；§5.0 L632；§5.4 L722；§5.18 L915–916 | 14 种类型清单已落实（number、integer、boolean、string、enum、ref、union、set、map、list、struct、curve、distribution、rx，数得 14），全文只有这一处计数；string 限显示字段；`params: map<ref vocab param, integer>` 已有 ref key。但 §5.18 的 inputs 联合违反 union 自己的限制，见 N3。 |

## 二、第四版新增内容检查

- impl 实现函数组：解决了 M3 的示例矛盾，但视图调视图与调用 dim/modified 被一并禁止（N1）。
- 三种行：结构清楚；但 extends 目标规则与取值总表没跟上（N2）；派生维度"显式写"与"派生不接受手填"冲突是旧伤口，这轮仍在（N5）。
- effectCall、consent：形状一致，示例（L550、L558）、卷二 A14 与附录 F 对得上；consent 与卷一现行字段表不一致（N7）。
- 前缀改名与类型数 14：前缀改名在卷二内已无旧名残留；类型数 14 全卷一致（L178、L574、L1345、L1382–1383）；但卷一仍写"十一种"（N7）。族名与前缀的写法没统一（N4）。
- §5 改表：onUnknown 列齐全；§5.25 计数 10+12=22 正确（L1043）；见 N3、N4 的类型与命名问题。
- 屏蔽词与输入规范化（李白新裁定）：B10(a)(b)(i) 与 §1.9 第 3 条一致；屏蔽词与"校验器只读键"矛盾（N5 之外的 N8）。

## 三、新必改

### N1 视图调视图被新规则禁止（L351、L354、L357、L360）
- L360 把"state 整体传给 impl 组外的函数"列为 E-VIEW-DYNAMIC-STATE，只有声明节点的 impl 组与存储层（storage、ledger、primitives）可持有 state。但 `uses` 里正是 `view:facilityView`、`view:statusView`、`dim:place`、`modified:place`（L351），placeView 的 impl 必须把 state 传给这些函数；L354 示例里 `stateMemo(state, …)` 属存储层尚可，而 `dim(engine,state,…)`、`modified(engine,state,…)`、被调用的另一个入口，按字面都在 impl 组外。
- 必改：补一句例外——传给 `uses` 里登记的声明节点入口（view、dim、modified、relation、scope 的入口函数）不算外传；扫描器按 uses 表放行，其余仍禁。并在 A12 加一条正例（传给 uses 内入口通过）。

### N2 实体行的 extends 目标规则没跟上（L112、L122、L131、L132、L152、A11 L1181）
- L112 说实体行的 `extends` 可指向"同表 abstract 类别行或另一实体行"；但 L122 适用类型表写的是"类别行"，L131 规定"`extends` 目标须是同表类别行，且为 abstract 或与子行同属每一个 precedence 组"，实体行不在 precedence 组里，规则对它无意义；L132 又说 faith 实体行之间用 extends，与 L131 直接冲突。
- L152 覆盖顺序总表没有"实体行"一级；L139 的 `instanceRow(id)` 把偏离行与实体行合并，总表仍写"作者实例行"。实体行同时有 `classes` 与 `extends` 时谁先（extends 展平后属实体自身值，classes 走类别链）没有写。A11 只测了"实体行 extends abstract 类别行"，没测"实体行 extends 实体行"与环。
- 必改：L122 与 L131 按三种行重写（实体行可 extends 同表实体行或 abstract 类别行；precedence 组检查只对类别行）；L152 补一级；E-DIM-CYCLE 的范围写明含实体行；A11 补实体行互 extends 与成环的用例。

### N3 union 与 ref 的写法超出自己的文法（L168、L169、L915、L754、L806、L856、L875）
- L169 规定 union "只允许标量或 distribution 之间的联合"。§5.18 `inputs: union[ref vocab req, struct…]`（L915）是 ref 与 struct 的联合，违反该条，而它正是 TA-M9 的修法；`outputs.qty: union[number, distribution]` 合规。
- `ref kinds[office, vocab election]`（L806）、`ref kinds[facility_type, vocab fixture]`（L875、L918）、`ref kinds[vocab matcat, vocab class]`（L856）：L168 的 `kinds` 只列实体类，`vocab` 是另一种形态，混写没有文法。
- 必改：要么放宽 union 为"同类形态的联合"并把 ref 形态写成 `{"anyOf":[ref…]}`，要么在 L168 给出混合 ref 的写法（`{"refs":[{"kind":…},{"vocab":…}]}`）；二者择一并同步 §5。

### N4 族名与前缀缩写混用，改名后没统一（L202、L206、L254、L256、L269；§5 全部类型列）
- L202 说 §5 的"类型"列写族名，L206 给出"族名→前缀"的映射（如 body_part→bpart_、capability→cap_、parameter→param_、language→lang_、doctrine_group→dgroup_、usage_per→uper_、faith_layer→flayer_、know_family→kfam_、evt_family→efam_、politykind→pkind_、eff_output→effout_、status→vstat_、status_family→sfam_、resource→res_、plant_part→ppart_）。
- 但 §5 与 §1.11、§3.9 里引用词表时写的是前缀缩写：`ref vocab bpart`（L722）、`ref vocab cap`（L722）、`ref vocab param`（L722、L847）、`ref vocab lang`（L669、L853、L892）、`ref vocab dgroup`（L840）、`enum uper`（L649）、`enum flayer`（L837）、`enum kfam`（L970）、`enum efam`（L986）、`enum pkind`（L812）、`enum effout`（L557）、`enum vstat`（L632）、`enum sfam`（L269、L909）、`ref vocab res`（L978）、`ref vocab ppart`（L946）；同一文件的 L254、L256 却写 `status_family`、`body_part`。
- 后果：按 L202 的"凡出现的族必须登记"（E-DIM-REF-MISSING），这些缩写查不到族。
- 必改：规定词表族的键名就是族名（如 `body_part`），§5 全部改写成族名，或明文规定"族键 = 前缀去掉下划线"并重写 L206 的映射列；不许两种写法并存。

### N5 派生维度"必须显式写值"与"派生不得手填"冲突（L94、L190、L248、L645、L646；§6.1 L1059、L1060）
- L94、L248：有 `derived` 的维度不得手填，E-DIM-DERIVED-WRITTEN。但 L190、L645–646、L1059–1060 规定 `categoryKind`、`sourceMode` 是 derived，推不出时"必须在实体行显式写值 + basis"（约 116 件、32 件）。这是三审 A 之前就有的缺口，第四版加了实体行后更明显：显式写的值放哪一级、与派生值冲突谁赢，取值算法（L137–145）里实例行在派生之前，所以只要写了就永远覆盖派生。
- 必改：给 derived 加一个声明 `allowExplicit:true`，仅此类维度可在实体行/偏离行写值；规定"派生命中则显式值须相等或报 E-DIM-DERIVED-CONFLICT，派生未命中才采用显式值"；E-DIM-DERIVED-WRITTEN 对 `allowExplicit` 维度豁免；L5 把"显式补写"单列统计。

### N6 附录 A 夹具通不过自己的校验器（L104、L106、L1252–1290、A15 L1183）
- `class_workshop_hot` 带 `sources`（L1276），L104 规定"有 sources 时必须有 `memberDeviationThreshold`"，夹具表头没有；A15 声称夹具整体通过 L0–L3。
- L106 规定 `classes/rows/generated` 三节均须存在，夹具主体 JSON（L1252–1280）没有 `rows`，实体行在后面单独的片段里，读者无法得到一个完整可校验的文件。
- precedence 与 broader 深度一致（L148、E-DIM-PRECEDENCE-BROADER）要求词表 `class` 族登记 broader 链，夹具声明"由 `_vocab.json` 夹具提供"但没有给出，无法核对手写顺序是否合规。
- 必改：夹具改成一个完整的 JSON（含 `rows`、`memberDeviationThreshold`），并附上它依赖的 `_vocab.json` 片段（class 族 broader、service/fixture/matcat/param 族）与 `_effects.json` 的 `eff_repair_item` 一行。

### N7 卷一编号与现行条文对不上（L118、L295、L532、L534；附录 F L1374–1389）
- 正文仍用旧编号：L118"卷一 I45、§3A.6 的 copyFrom"（卷一现行继承是 3A.8，3A.6 是效果族表）；L295"卷一 §3A.6 指定本卷定义需求块"（现行是 3A.7）；L532"卷一 §3A.2 材质/品质乘子"（现行是 3A.3/3A.4）；L534"卷一 §3A.5 效果族"（现行是 3A.6，3A.5 是状态容器）。附录 F 重写了，正文没改。
- 附录 F 声称"一致"的几行，与卷一现行文本不符：①3A.9（卷一 L371）仍写"维度类型（卷二 §1.5 十一种）"，卷二是 14 种（附录 F L1382 称一致）；②3A.6（卷一 L368）的最小字段为 `{family, targetSelector, requirement, magnitudeRX, outputs, cost, cooldownDays, basis}`，没有 consent，而附录 F L1379 把"同意/权能要求代号"列为卷一最小字段并称一致，卷二 §3.9 又新增 `consent` 与 `params`；③卷一 L133 仍写 `E-DIM-EXTEND-ON-INSTANCE`，卷二已改名 `E-DIM-EXTEND-ON-OVERRIDE`（L113、L603、A11），附录 F L1381 只说"口径细化"。
- 必改：正文四处按卷一现行编号改；附录 F 对②③和 3A.9 写成"待卷一同步"并列出卷一需要改的三处文字，或先与卷一对齐后再标"一致"。

### N8 屏蔽词校验与"校验器只读键"矛盾（L209、L211、L580、A17 L1185、S7 L1196）
- L209 与 L580：校验器对 labels 只查键，不读值；S7：labels 只被 inputEdge、display、outputGate 三个模块组 import。
- L211：屏蔽词在"内容构建的离线校验阶段由校验器"对 `bank × pattern` 全部组合的**拼装结果**与 blocklist 比对，这要读 labels 的值并拼接，违反上两条；校验器 `dimensions-validate.mjs` 不在三个模块组里。
- 必改：把屏蔽词校验划给单独的离线工具（如 `tools/name-blocklist-check.mjs`，不进 server-plugin，不在加载期运行），并在 L209、L580、S7 注明它是"读 labels 值的唯一例外"；或者把 blocklist 比对改成只对词库代号、不拼字串（二选一）。另外，组合数量爆炸的上限（`bank × pattern × 词数`）需要写明（可抽样或按槽位分段比对）。

## 四、建议（非阻断）

- S1 §4.3 错误码表缺：E-I18N-BLOCKLIST（L211）、E-VIEW-NAME-RESEED（L211、S17）、E-VIEW-FAMILY-MISMATCH（L1205、A16）、E-DIM-INVARIANT-DOCTRINE-GROUP（L840）、E-DIM-DERIVED-CONFLICT（若采纳 N5）。
- S2 S13 的类型归因（"一侧是 Fact，其声明类型为 enum <family>"，L1205）依赖静态类型推断，JS 没有类型；建议把规则层比较改成句柄方法 `fact.is(V.sfam.sfam_sleep)`，由句柄在运行时核对 family，E-VIEW-FAMILY-MISMATCH 变成运行期错误加扫描禁用 `===`，更可行。
- S3 B10(a) "去首尾空白"没有写明空白的集合（Unicode White_Space 含全角空格 U+3000），而 (b) 要求中间的全角空格不命中；建议写明"首尾只裁 Unicode White_Space，不处理中间"。
- S4 A 组编号 A13、A14 排在 A15–A17 之后（L1183–1187），建议理顺。
- S5 L3 与 L231（附录 D）的版本说明里重复列出"旧版快照"（L3 出现两次）；附录 D 的 TA-M7 行写"5.8–5.17 改为表"已落实。
- S6 5.12 的 `byClass:class_faith_layer_faith`（L840–841）把枚举 `layer` 的取值又做成类别，二者冗余，建议改成 `ifPresent` 或直接按 layer 值判必填。
- S7 其他卷（卷零、卷一）里若出现旧前缀 `plant_/know_/evt_`：我抽查了卷零与卷一，没有发现；但 §6 迁移表和各领域卷尚未生成，建议在卷十二加一条"前缀表与全文引用一致"的扫描。

## 五、前缀改名与类型数的一致性抽查结论

- 前缀改名：L204 实体前缀表、L206 族前缀表、§5.19（flora_，L932）、§5.21（lore_，L966）、§5.22（etype_，L982）、§6 迁移、附录 A、附录 D（L1342）均已用新名，没有旧名残留。唯一不一致是 N4（族名与缩写）。
- 类型数：L178、L574、L1345、L1382、L1383 全部是 14，无"十一/十二"残留；卷一 L371 仍写十一种（N7）。
- 实体类数：§1.1（22 个文件）、§2.1（22 行）、§5.1–5.22、§5.25（10+12）、L1171（22 张表 + 4 公共表）一致。

## 六、通过条件

N1–N8 逐条在卷内改完。夹具级断言补三条：①N1 的正例（视图调 uses 内入口通过，调 uses 外函数报错）；②N2 的实体行互 extends 与成环；③N6 的完整附录 A 夹具通过 L0–L3。N5 采纳 `allowExplicit` 后需在 A 组补一条。改完不需要再做整轮审查，由主会话核对 N1、N2、N4、N7 的文字和附录 A 的 JSON 即可收口。
