共 12 条，甲 0 乙 11 丙 1，有理由 1 无理由 11；本卡读了 卷二:566-881、卷二:1540-1649（§4.3 错误码表 1565-1637）、卷一:440-464（含 :453）、server-plugin/kernel/load/state-owners.mjs:1-557、world/ontology/state-owners.json:1-399、server-plugin/kernel/files.json 全文（脚本比对仓库实际 106 个 .mjs）；另佐证读 server-plugin/kernel/storage.mjs:180-289、tools/accept/detectors/import_edge.mjs:1-60、tools/accept/lib/api-callers.mjs:1-64、server-plugin/kernel/declare.mjs:1-5、server-plugin/kernel/events.mjs:205-254、tests/kernel/state-owners.test.mjs:55-76、tools/accept/items.json 摘读。没读到：卷二其余节、卷一 :453 以外、tools/accept 其余检测器全文。

### 1 E-GROUP-SIZE、E-GROUP-OVERLAP 两码无任何抛出点
- 位置：server-plugin/kernel/load/state-owners.mjs:227-236（只取 pathTypes 等五张表，全文不读模块组声明）；tools/accept/detectors/import_edge.mjs:26-58（只按矩阵判 import，不展开 glob 不计数不求交）
- 设计原文：卷二:825"inputEdge.modules 展开后文件数 ≤ 8（E-GROUP-SIZE）；七组、两份共享库与装配文件在文件级互不相交……（E-GROUP-OVERLAP；门禁按展开后的文件集合两两求交）"
- 代码实际：全仓生产代码与 tools/accept 无一处发出这两个码（只有 error-codes.mjs 登记、docs 设计侧脚本 check-vol2-ext.mjs 引用、tests/accept 提到），声明表的 inputEdge/display/kernel 等组键也没有任何加载期或扫描期读取。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 2 声明表没有 dataFiles，E-FILE-UNASSIGNED 只核 kernel 的 filesList
- 位置：world/ontology/state-owners.json:1（顶层键只有 version/stateKeys/systems/…/importMatrix，无 dataFiles）；server-plugin/kernel/load/state-owners.mjs:227-233（不读 dataFiles）；tools/accept/detectors/import_edge.mjs:16-25（只在组声明了 filesList 时核该清单）
- 设计原文：卷二:709"`dataFiles`……非代码文件的登记……两类之外的文件 E-FILE-UNASSIGNED（§2.9 第 5 条）"；卷二:1588 同义；卷二:600"`retired`……合入后目录下仍有文件即 E-FILE-UNASSIGNED"
- 代码实际：任何 server-plugin/extension 下既非代码组文件、又不在 dataFiles 的文件都不会被判；只有 kernel 组成员对 files.json 的归属核一遍。当前 server-plugin/kernel/files.json 自身是 .json、无 dataFiles 可依，按卷文应属未归属（实况不报）。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 3 rewriteRows 的行范围与组件类代号都不核；运行期不按行范围拒写
- 位置：server-plugin/kernel/load/state-owners.mjs:535-546（只核形状与两列表非空）、:556（把 rewriteRows 放进 merged）；server-plugin/kernel/storage.mjs:93（装载写者时映射不取 rewriteRows）、:210-215（writerOk 只比 rewrite 文件名）
- 设计原文：卷二:796"`rewriteRows` 是它的行范围……范围外的行对改写写者同样拒写"；同段"范围只写组件类代号，不写实体 id"
- 代码实际：加载期接受任意字符串作 withComponent/inside，不核是否为已登记组件类；运行期根本不看行范围，任何行的写入只要写者文件名对就放行。现数据全是字符串写法，暂未出错。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 4 kernelApi / groupApi / assembly / retired 及模块组行没有任何加载期结构核对
- 位置：server-plugin/kernel/load/state-owners.mjs:227-522（全文只核 pathTypes、textPaths、textWriters、stateKeys、systems、phases、readShapes、memberRecomputable；kernelApi、groupApi、assembly、retired、inputEdge 等组键一次未读）
- 设计原文：卷二:601"callers 写组键……callerFiles 写具体文件，至少写一个，两者可并存、取并集"；卷二:674"表外的名字别的组不得 import；这些导出一律不接收 state"；卷二:599"`calls` 是它可调用函数的封闭清单"
- 代码实际：export 串格式、callers/callerFiles 至少一项、acceptsState 布尔、export 重复、assembly.calls 封闭性都无核对；错的数据要等扫描器在使用点报或静默放行。
- 理由：无（import_edge.mjs:4 仅注释自述"矩阵格里只经 kernelApi/groupApi 的某些导出"的细目未覆盖）
- 影响：规则缺
- 严重程度：乙
- 合并：无（甲-1122 记的是 kernelApi 具体行内容，非表结构核对）

### 5 `eventDerive`"全表只许一处"未核
- 位置：server-plugin/kernel/load/state-owners.mjs:399（只核是 `<文件>#<函数>` 形字符串）
- 设计原文：卷二:813"eventDerive（`"<文件>#<函数>"`，全表只许一处）"
- 代码实际：两个系统同时登记 eventDerive 不会被发现；全仓也无其他核对点（grep eventDerive 只有 events.mjs 的运行实现）。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 6 textWriters 的写者没有核"只在 aiGate 组内"
- 位置：server-plugin/kernel/load/state-owners.mjs:297-301（只核非空字符串、恰一条）
- 设计原文：卷二:711"每条 textPath 恰一个写者（E-WRITER-MISSING），写者只在 aiGate 组内"
- 代码实际：任何字符串都收；把写者写成规则层文件也加载通过。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 7 declareStateWriter 的加载期对照登记未建
- 位置：server-plugin/kernel/declare.mjs:5"declareStateWriter、declareLedgerWriter……本卡不需要，随用到它们的那张卡建"
- 设计原文：卷二:793"写者模块用 `declareStateWriter(module,key,{fields,reason})` 对照登记（E-VIEW-UNDECLARED-WRITE）"
- 代码实际：该码只在运行期由 storage.mjs:266、:268 等抛出；加载期没有"写者模块声明 vs state-owners 登记"的对照这一路。
- 理由：无（仅注释自述）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 8 readShapes 的 `shape` 行只核 `struct:` 前缀，不核命名 struct 已登记
- 位置：server-plugin/kernel/load/state-owners.mjs:478（`typeof r.refFamily === 'string' && r.refFamily.startsWith('struct:')`）
- 设计原文：卷二:816"`type` 为 `shape` 时写 §1.5 已登记的命名 struct"
- 代码实际：`struct:anything` 都通过；与同段 `code` 行查 ctx.kinds、`handle` 行查 ctx.families 的做法不一致。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 9 协议键与格前缀以代码字面量列表写死
- 位置：server-plugin/kernel/load/state-owners.mjs:67（`PROTOCOL_KEY_LIST = ['holdings','statuses','modifiers','terminated','due','stockLots']`）、:70（`GRID_KEY_PREFIX_LIST = ['cells','fieldCells']`）
- 设计原文：卷二:553"属于协议自己处置的键（账户、`stockLots`、`holdings`、`statuses`、`modifiers`、`terminated`、到期堆）"；卷二:860"只用于 `cells.*.*.*` 与 `fieldCells.*.*.*` 的前三个 `*` 段"
- 代码实际：两份封闭清单写在 kernel 代码里，卷文新增协议键或格前缀须改代码（红线：数值、规则、种类一律放数据表）。此处注释自述出处，但卷文未把它定为代码内封闭枚举。
- 理由：无（仅注释自述）
- 影响：规则缺（写死）
- 严重程度：乙
- 合并：见 docs/研究/公共部件审查-乙-1122.md 二.4（该文只论协议键绕开 writePath，未论写死）

### 10 sys.status、sys.capacity 的 view 等登记字段缺失
- 位置：world/ontology/state-owners.json:30（sys.capacity 无 view）、:32（sys.status 无 view、predicates、sources、sinks）
- 设计原文：卷二:583"`sys.status`: {`view`: `status.mjs#statusView`, `predicates`: [], … `sources`: {}, `sinks`: []}"；卷二:587"`sys.capacity`: {`view`: `action-capacity.mjs#can`, …}"；卷二:787、:764 六列转录表同样登记这两处 view
- 代码实际：status.mjs#statusView（server-plugin/status.mjs:1）与 action-capacity.mjs#can 都已存在并在用，但声明表未登 view，readShapes 的 entry 闭集（state-owners.mjs:418-421）里因此没有这两个入口，别的卷按卷二:816 填 readShapes 会判 entry 未登记。
- 理由：无
- 影响：规则缺（登记缺）
- 严重程度：乙
- 合并：无

### 11 `ledgerSystem` 机读标记未登记
- 位置：world/ontology/state-owners.json:1-399（无 ledgerSystem）；tests/kernel/state-owners.test.mjs:75 显式断言它不存在
- 设计原文：卷二:754"`ledgerSystem: sys.economy`——……卷十一的生成器按这一标记取账本母卡对象"
- 代码实际：声明表无该键，加载器也不读取。
- 理由：有理由，见 docs/审查/终核复核批-只核.md:79"复核明写『不挡』，本批没有做，照记"；另 docs/审查/李白终核卷十一复核-1116-1052.md:89"以后挪进 sys.economy 登记项本身"
- 影响：规则缺（已登记待做）
- 严重程度：丙
- 合并：无

### 12 矩阵格括号里的导出细目没有统一核对
- 位置：tools/accept/detectors/import_edge.mjs:4"未覆盖（写进 P-1 汇报）：矩阵格里『只经 kernelApi / groupApi 的某些导出』的细目"；:34-57 判法只看说明符与组，不看导出名；tools/accept/lib/api-callers.mjs:21-33 只按条目 params.entries 逐个入口核，条目只有两条（items.json 内 api-callers 出现 2 次）
- 设计原文：卷二:825"矩阵里括号中的名字必须是 kernelApi 清单或 `groupApi`……里已有的条目，本卷脚本第 23 项按这两张表的数据核对"
- 代码实际：除条目点名的两处入口外，"outputGate 只许 import readSealed/onReply 等"这类括号名单在 import 处不判。
- 理由：无（仅注释自述）
- 影响：规则缺
- 严重程度：乙
- 合并：无

## 已登记未建
- 六个运行组/共享库目录未建：server-plugin/input、gate、output-gate、ai-gate、textcore 不存在，extension/ 下无任何文件（git ls-files 0 条）。E-GROUP-SIZE/OVERLAP 目前空转，见第 1 条。
- 卷二:715 首条 `memberRecomputable: ["identities.*.*"]` 未登记（卷四身份键未建），加载器 support 已在 state-owners.mjs:379-382。
- 卷二:792 别卷顶层键（conceptions、simProgress、simDegrade、aggregates、lifestyleXp、examSessions、pendingDose、epi、relationFacts、esteemRem、cells 已建、fieldCells）只登了 cells；其余未登，对应领域卷未建。
- 卷二:722-752 补全表除 sys.status、sys.capacity 外的 20 余个系统未登记（sys.deity、sys.item、sys.material…），对应领域卷未建。
- 卷二:572、:578 示例的 `npcs`、`modifiers` 两个 stateKey 未登记（人物、修正系统未建）。
- 卷二:797 dated 写者"自那张卡起必写"：加载器已支持（state-owners.mjs:547-553、:342-374），现数据无 dated 写者，未到首张卡。
- 卷二:709 dataFiles 与卷二:600 retired 的两项扫描（第 1、2 条）属卷十二验收设施，尚未接线。

## 拿不准
- 单位码矛盾：卷二:856"不带单位即 E-DIM-UNIT-UNKNOWN，这里是 state-owners 加载期报出"；卷二:1573"W-DIM-UNIT-DIM……`pathTypes` 的数值路径……没带单位、或单位不在 `_units.json`"。代码 state-owners.mjs:188 对两种情况都报 error 级 E-DIM-UNIT-UNKNOWN。两处卷文指向不同码与级别，请李白定；代码现行为与 :856 一致、与 :1573 不一致。
- 卡文说"每个 system 带 phase"，卷二 §2.7 并无此要求（:587 sys.capacity 示例无 phase，:588 sys.dimension_entry 也无）。现数据 15 个系统中 13 个无 phase，按卷文不算缺。
- `stateKeys.<键>.writers` 的相对路径允许空串表示整个键（state-owners.mjs:326-327，数据 ledgerTotals 在用）；卷二:855 只写"相对该 stateKey 的路径"，未写空串写法。
- 卷二:820"阶段序列封闭（上面 8 个）"：加载器只核钩子的 phase 在文件自列的 phases 里（state-owners.mjs:428），不核 phases 是否恰为那 8 个。现数据与 8 个一致。

## 跨卷待判
- 第 5 条 eventDerive 唯一性的违例码归卷二十四（卷二:813 写"错误码与核对口径归卷二十四 §2.7、R24-2.1"），卷二 §4.3 未列该码；补此核须先跨卷取码。
- 第 8 条 shape 行所指命名 struct 的登记处在卷一 §1.5（卷二:816 引用），加载器要拿到该登记须跨卷取数据来源。
