# ds-b3-4 回报（3-4 卷二 §1.5 命名 struct 机读登记与 S6-14 静态扫）

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷六 §3.5 S6-14 :337「状态模式检查：遍历存档状态的模式声明（卷二 §2.7 的状态登记表），实体行、偏离行、状态键上凡是单位属于任一资源种类行 `unit` 的数值字段，除 `accounts.*`、`ledgerTotals.*`、`outflowTotals.*` 与合同、义务记录里的应付数额外，计数为 0」；卷二 §1.3 :123–:126（实体行 `rows.<id>`、偏离行 `state.created[id].props`）；§1.5 :200–:248（命名 struct 登记）；§2.7 :675 pathTypes 示例（`pendingPost.*`: `list<struct:pendingPost>`）、:811 类型文法与 dimension 行；卷六 §4.1 规则 11 :382「实体行上不存在任何数量字段」；卷六 §2.4 :200「`resource`、`qty`、`done` 三列：资源引用、integer、integer，含义为「应给付与已给付」。原句见下「依据原句」 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 整改后检测器按维度表 `dimensions` 表头单位、`keyKinds` 的实体 kind 与 pathTypes 类型串展开（tools/accept/detectors/state_pattern.mjs:82、:159-203、:216-260）；应付数额只按 named-structs.json 里字段的 `role: "payable"` 标记豁免（同文件 :31-32、:126-150、:268），不认 `qty`/`done` 字段名；无按 id、文件名、卷名的分支 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 资源种类表缺失/空表、未登记命名 struct 仍报 `E-ACC-ITEM-PARAM`；维度表缺失按统一加载器同口径跳过并有专门用例（tests/accept/state-pattern.test.mjs:76）；`number nullable` 无单位不计入；豁免只对 `contracts`/`obligations` 记录键生效（同文件 :175） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望值按卷六 :337 与卷二 §2.7 文法手算，夹具自带 `copper` 资源种类、维度表与命名 struct 前提；不抄仓库当前 `state_pattern` 读数 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 实现只在检测器规则层与机读登记角色上改：实体行、dimension 展开、list<…> 解析与 payable 角色都按卷文与统一加载器口径；没有按字段名/实体 id 开分支，没有为过门禁删检或换名 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 接主线并转 in_core 这轮 `git diff --stat` 共 14 行：tests/accept/temp-repo.mjs +4、tools/accept/criteria.json +6/−2（登记器盖指纹 rev 4）、tools/accept/items.json +1/−1（登记器转 in_core）；另按卡文新增 docs/审查/3-4-Sonnet终核-1118.md 并更新本回报。卡文清单外只多 tests/accept/temp-repo.mjs 四行：S6-14 转 in_core 后进必过集合，临时仓库缺命名 struct 与维度表数据会报 E-ACC-ITEM-PARAM，门禁四处测试因此红；按 AGENTS.md「完成本卡必需的……接点……已有任务授权，先说明实际扩展」先说明，主会话可核 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 570 / ℹ pass 570 / ℹ fail 0`；`node tools/gen-det-tables.mjs --check` → `det tables up to date (4097/81/4097)`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`、无 E-ACC-CRITERION-UNVERSIONED、`openHits.state_pattern` 0、`versions.criteria.state_pattern` 4；另 3 个 implemented（非必过）条目 vol12.A12-4.5/S12-2/S12-3 仍列不过，rebase 后即存在、本卡未改其代码，不影响 verdict |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | S6-14 的静态守卫覆盖实体行、偏离行与状态键全部容器形式，块 6 的写者不能在任何状态结构里另存数量；本轮转 in_core 封块；未写死、未开特例、未跳过规则引擎 |

## 依据原句

- `docs/统一底层设计/卷二-维度表规范与统一入口.md:200`（§1.5 命名 struct 登记首句）：
  `**命名 struct 登记**（供 `pathTypes` 的 `struct:<名>` 与各表引用；EA-Q4；新增命名 struct 须在此登记并说明定义处）。`
- `docs/统一底层设计/卷二-维度表规范与统一入口.md:204–:248`：四十五行命名 struct 表；本卡的机读表逐行照录，`source` 字段写到行号。
- `docs/统一底层设计/卷六-经济.md:337`（S6-14）：
  `**状态模式检查**：遍历存档状态的模式声明（卷二 §2.7 的状态登记表），实体行、偏离行、状态键上凡是单位属于任一资源种类行 `unit` 的数值字段，除 `accounts.*`、`ledgerTotals.*`、`outflowTotals.*` 与合同、义务记录里的应付数额外，计数为 0。`
- `docs/统一底层设计/卷十二-验收与自动扫描.md:1058`（R12-10.7）：
  `**R12-10.7 没跑的要写出来**：没执行的条目列为 `not_run`，前置不满足的列为 `blocked`，都不许省略。`
- `docs/统一底层设计/卷十二-验收与自动扫描.md:539–:547`：§2.12 错误码表与「无码状态不许出现」整类规则。

## 已定

- **命名 struct 登记落处**：`world/ontology/named-structs.json`。卷文只说“在此（卷二 §1.5）登记”，没有指定仓库落处；按现有同类登记最近处取 `world/ontology/`（`state-owners.json` 同卷 §2.7 的状态登记表就在此处），机读表与 `state-owners.json` 的 `pathTypes` 同目录、同读法。理由：命名 struct 是 `pathTypes` 的 `struct:<名>` 的展开定义，与状态登记表是一对；不放进 `world/rules/`（那是规则表），也不塞进 `state-owners.json`（§2.7 的字段是封闭的）。
- **S6-14 违例码**：用已登记的 `E-DIM-STRUCT-FIELD`（卷二 §4.3 :1528「E-DIM-DOMAIN-RANGE / -ENUM / -SIZE / -CURVE / E-DIM-STRUCT-FIELD / E-DIM-REF-DIM … 取值域与类型」）。理由：卷六码表与卷十二 §2.12 都没有“账本外存数量”的专码（`docs/审查/块3-3b-只核原始输出.md:25` 已记“也没有码”）；同一类运行期拒收在账本内核里就用此码（server-plugin/kernel/ledger.mjs:452、:775 的批次属性拒数量走 `E-DIM-STRUCT-FIELD`）。这是“已登记码”，不是自造码；若李白要专码，按 07:27 的整类规则另开勘误补登后换码即可，检测器只读 `params.code`。
- **豁免粒度**：按状态路径第一段判——`accounts`、`ledgerTotals`、`outflowTotals` 三项账本键，加 `contracts`、`obligations` 两项合同/义务记录键；不按字段名，也不为单个实体或单个路径开口子。

## 做了什么

- `world/ontology/named-structs.json`：卷二 §1.5 :204–:248 四十五个命名 struct 的机读登记。每行 `name`、`source`（卷:行）、`type`；`type` 用与 `pathTypes` 同形的类型串（`integer:<unit>` / `number:<unit>` / `struct:<名>`），容器用 `{"list"|"set"|"map"|"struct"}` 节点。`struct:byState<T>` 带 `typeParam`。
- `tools/accept/detectors/state_pattern.mjs`：S6-14 检测器。资源单位集经 `world/rules/registry.json` 的 `economyResources` 行派生；展开 `pathTypes` 的类型串与命名 struct（含 `struct:byState<number>` 的类型参数替换）；只按单位命中，豁免第一段为 `accounts`、`ledgerTotals`、`outflowTotals`、`contracts`、`obligations` 的模式；资源表缺失/空表、引用未登记命名 struct 报 `E-ACC-ITEM-PARAM`。
- 经登记器新增：检测器 `state_pattern`、扫描类别 `state_pattern`（判据 `rev` 1）、条目 `vol6.S6-14`（`implemented`，`expect: zero`）、用例 `state_pattern-01`/`-02`（must_fail）与 `-11`（must_pass）。
- 真实仓库 `pathTypes` 18 条、命名 struct 45 行展开后 0 命中：账本三路径的余额结构被 S6-14 点名豁免，其余数值字段的单位（minute、count、day、score 等）不在资源种类表的 `bps` 里。

## 验收命令与末行

- `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 530 / ℹ pass 530 / ℹ fail 0`
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；`state_pattern-01/02/11` 全 `pass`，`openHits.state_pattern` 0
- `node tools/accept/register.mjs F:/dnd-tmp/b34-register.json` → `registered: items, detectors, scanclasses, cases, criteria`（随后 `itemStates` 登记把 `vol6.S6-14` 置 `implemented`）

## 只核（2026-11-18，DS 只核 3-4）

核查原文：`docs/审查/3-4-DS只核-1118.md`。结论：**必须改**，不建议按现状转 `in_core` 封块。

- **M1 实体行没扫**：检测器只遍历 `state-owners.json` 的 `pathTypes`（`tools/accept/detectors/state_pattern.mjs:101-123`），不读 `world/ontology/dimensions/*.json` 的 `rows.<id>`。S6-14 :337 点名「实体行」，卷六 §4.1 规则 11 :382「实体行上不存在任何数量字段」；`tests/accept/state-pattern.test.mjs:25` 名为「实体行」实为直接数值路径。修卡按维度表 `dimensions` 表头 `unit` 与实体行数值扫。
- **M2 偏离行没扫**：`created.*.props.*` 登记为 `dimension`（`state-owners.json:35`），检测器 `leaves` 对 `"dimension"` 直接返回（`state_pattern.mjs:71-97`）。卷二 §2.7 :811 要求按维度表展开，统一加载器已有同逻辑（`kernel/load/state-owners.mjs:255-268`），应复用。
- **M3 `list<…>` 简写没解析**：`pendingPost.*` 是 `list<struct:pendingPost>`（`state-owners.json:43`），检测器字符串分支只认数值与 `struct:<名>`，整条跳过。复用 `kernel/validate/types.mjs:34` 的 `listItemType`。
- **M4 豁免过宽**：S6-14 :337 只豁免合同、义务记录里的**应付数额**；检测器按顶层键整类放过 `contracts`、`obligations`（`state_pattern.mjs:22`、:116）。卷六 §2.4 :200 定义 `qty` 为应给付、`done` 为已给付；`state_pattern-11.txt:18` 把 `done` 一起当豁免，测试固化了过宽行为。收窄须在记录类型登记处给应付字段加机器可读标记，检测器只豁免带标记的叶子，不按字段名。
- **M5 测试不能区分**：忽略实体行、`dimension`、`list<…>`、整键豁免的实现三条例用全过；需补 `dimension` 夹具、`list<…>` 夹具与 `obligations.done` 必报用例。

可接受项：`E-DIM-STRUCT-FIELD` 已登记（卷二 §4.3 :1528），卷六/卷十二无更贴切专码，运行期账本批次属性拒数量同码（`ledger.mjs:452`、`:775`），满足「有码」；45 行命名 struct 与卷二 §1.5 :204–:248 无漏无多，抽查 16 行逐字段一致（动态单位/「见定义处」字段照录为 opaque，未擅补）。

门禁实况：`node --test tests/accept/named-structs.test.mjs tests/accept/state-pattern.test.mjs` → `ℹ tests 13 / ℹ pass 13 / ℹ fail 0`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`，`state_pattern-01/02/11` 全 `pass`，`openHits.state_pattern: 0`。条目现 `implemented` 不阻塞；转 `in_core` 后当前仓库仍 0 命中，但这是只扫了一部分的 0，先修 M1–M5 再转。

拿不准交主会话：① S6-14 按单位字面会把 `mealCap: g`、`appearanceRefs: count` 等物理/属性维度算数量，是否要收窄需改卷文；② item/person/place 维度表缺表时跳过还是报错；③ `struct:modifier.value` 等动态单位字段静态扫能否解析；④ PLAN 历史行说 3-4 还含「经统一加载器读」与「账本运行期按单位拒数量」，本分支都没做（`ledger.mjs:82` 仍 `lotForbidden: ['lotSeq','qty']`），是否属本卡范围。详见核查原文第七节。

本次只核提交只加 `docs/审查/3-4-DS只核-1118.md` 与本节。

## 3-4 只核整改（M1–M5，2026-11-18）

核查原文：`docs/审查/3-4-DS只核-1118.md`。本卡照 M1–M5 整改，测试先行。

**第 0 步 rebase**：`git fetch origin && git rebase origin/master` 成功（4-4a 合入）。rebase 后 `kernel/det-math.mjs` 改动使 `state_pattern` 的判据代码指纹（检测器 import 闭包经 `validate/types.mjs` 含 det-math）失效，`vol12.S12-13`（`in_core`，必过）因此红；按卡文用登记器重盖 `state_pattern` 判据指纹（`criteria.json` rev 1→2，log 记 4-4a 指纹重盖），未手改 `criteria.json`。

**本轮（测试先行）改了什么**：

- `tests/accept/state-pattern.test.mjs`：补 M1 实体行（维度表 `rows.<id>` 上的资源单位数值）、M2 `dimension` 偏离行（按 `keyKinds` 的 kind 维度表表头展开、缺表跳过）、M3 `list<…>` 与嵌套 `list<…>`、M4 应付数额按 `fieldRoles` 的 `payable` 角色豁免（`done` 必报、合同未标字段必报、角色标记只对 `contracts`/`obligations` 生效）四组必报/必不报；旧「实体行」误名改为「状态键上的资源数量字段」。
- 新增夹具 `tests/accept/bypass/state_pattern-03/04/05/06/07/12.txt`（M1、M2、M3、`obligations.done` 必报、合同未标字段必报、义务 `qty` 应付不报）；本提交尚未经登记器登记，下一提交与实现一起登记。
- 实况：本提交上 6 条新必报用例对旧检测器失败（M1/M2/M3 未扫、`done` 被整键豁免），按测试先行预期；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`。

**实现（M1–M5 落点）**：

- **M1 实体行**：`tools/accept/detectors/state_pattern.mjs:82`（读 `LAYOUT.dimensionsDir` 下非 `_` 开头的维度表，kind 取表内 `kind`，与统一加载器同目录约定）、`:94-121`（按维度表头类型树取数值叶子位置与单位）、`:216-236`（对 `rows.<id>` 逐行核对：该行确有该维度的数值叶子且单位属于资源种类行 `unit` 才报，命中文件是维度表文件，不是 `state-owners.json`）。卷二 §1.3 :125、卷六 §4.1 规则 11 :382。用例：tests/accept/state-pattern.test.mjs:38、bypass/state_pattern-03。
- **M2 偏离行**：`state_pattern.mjs:239-260`——`pathTypes` 值为 `dimension` 时按 `keyKinds` 取该路径可出现的实体 kind（`dimKey` 段用固定代号定位；无 `dimKey` 时取模式最后一段作字面维度名），再按这些 kind 的维度表表头单位展开；kind 的表未建则跳过（与 `kernel/load/state-owners.mjs:259-260` 同口径：无表即无字段）。卷二 §2.7 :811。用例：tests/accept/state-pattern.test.mjs:57、:76（缺表跳过）、bypass/state_pattern-04。
- **M3 list<…> 简写**：`state_pattern.mjs:159-203`——字符串类型串先复用 `kernel/validate/types.mjs` 的 `listItemType` 解析 `list<…>`，另展开 `set<…>`、`map<键, 值>`（顶层逗号切分），数值串复用 `parseNumberType`；命名 struct 的对象节点容器（list/set/map/inline struct/union）照旧展开。卷二 §2.7 :675、:811。用例：tests/accept/state-pattern.test.mjs:88、:101、bypass/state_pattern-05。
- **M4 豁免收窄**：`world/ontology/named-structs.json:11` 登记 `fieldRoles`（`{"<字段路径>": {"role": "payable", "source": "卷:行"}}`，payable = 应付数额，语义出处卷六 §2.4 :200「应给付」）；检测器 `state_pattern.mjs:31-32` 定角色代号、`:126-150` 取行内 payable 字段并随 struct 展开累积、`:268` 只在状态顶层键属于 `contracts`/`obligations` 时豁免带 payable 的叶子；账本三路径仍整键豁免（`:27`）。不认 `qty`/`done`。用例：tests/accept/state-pattern.test.mjs:122（qty 不报）、:145（done 必报）、:162（合同未标字段必报）、:175（角色标记出记录键照报）、bypass/state_pattern-06/07/12；`state_pattern-11` 随实现改为 qty/fee 带 payable 角色、去掉 done。
- **M5 用例**：单元测试见 tests/accept/state-pattern.test.mjs:38/57/76/88/101/122/145/162/175；绕法用例经登记器登记 `state_pattern-03`（忽略实体行即失败）、`-04`（忽略 dimension 即失败）、`-05`（忽略 list<…> 即失败）、`-06`（整键豁免 obligations 即失败）、`-07`（整键豁免 contracts 即失败）、`-12`（把应付也报出即失败），tools/accept/cases.json:1023-1073。

## 接主线与转 in_core（2026-11-18）

- **接主线**：`git fetch origin && git rebase origin/master` → `Successfully rebased and updated refs/heads/ds/b3-4.`，9 个提交无冲突。主线 B2-W3 已合入。
- **重盖判据指纹**：rebase 后 `node tools/accept/run.mjs pre_commit` 报 `vol12.S12-13 E-ACC-CRITERION-UNVERSIONED`（必过条目）。先用登记器空交行文件点出失效类别：`node tools/accept/register.mjs F:/dnd-tmp/reg-empty.json` → `E-ACC-CRITERION-UNVERSIONED state_pattern: detector code changed without rev`（仅此一类）。再交 `criteria` 行经登记器重盖：rev 3→4，log 追加「接主线 B2-W3 后重盖，判定口径不变」，print 由 `249cd611…` 重算为 `28478ee6…`。未手改 `criteria.json`。
- **转 in_core**：`node tools/accept/register.mjs F:/dnd-tmp/reg-s614.json`（`itemStates: {"vol6.S6-14": "in_core"}`）→ `registered: items`。卷十二 R12-11.7：「`implemented` 到 `in_core`：它在当前主干上为 `pass`」——转前 `pre_commit` 中 S6-14 不在不过清单、`openHits.state_pattern` 0；转后它在必过集合中仍 pass，真实仓库 0 命中。
- **临时仓库补数据（已定）**：转 in_core 后 `node --test` 有 4 条红（runner.test.mjs 的 R12-8.5、R12-8.9、提交钩子、必跑测试）：`tempRepo()` 只带 `world/ontology/state-owners.json`，S6-14 转必过后在临时仓库因缺命名 struct 登记与维度表报 `E-ACC-ITEM-PARAM` 被拒。已在 `tests/accept/temp-repo.mjs` 按同目录约定补拷 `world/ontology/named-structs.json` 与 `world/ontology/dimensions`（合计约 658KB），让必过条目在临时仓库与真实仓库同口径；不改任何测试期望与门槛，全量 570/570 过。
- **验收**：
  - `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 570 / ℹ pass 570 / ℹ fail 0`
  - `node tools/gen-det-tables.mjs --check` → `det tables up to date (4097/81/4097)`
  - `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；无 `E-ACC-CRITERION-UNVERSIONED`；`openHits.state_pattern` 0；`versions.criteria.state_pattern` 4
- **遗留**：`pre_commit` 仍列 3 个 implemented（非必过）条目不过：`vol12.A12-4.5 E-ACC-PARAM-UNCONSUMED`、`vol12.S12-2 E-ACC-REGISTRY-WRITE`、`vol12.S12-3 E-ACC-ITEM-COUNT/ORPHAN/UNREGISTERED`。rebase 后首次执行即存在，本卡未改其代码；不阻塞 verdict，交主会话处置。

**M4 在真实仓库的落点**：当前 `world/ontology/state-owners.json` 的 `pathTypes` 18 条里尚无 `contracts.*`/`obligations.*`，卷二 §1.5 的 45 个命名 struct 也没有合同/义务记录行；所以 payable 角色目前只由夹具演示（state_pattern-06/07/12 与 tests/accept/state-pattern.test.mjs:122/145/162/175）。等这些状态路径登记时，其命名 struct 登记行须按本卡文法给应付字段加 `role: "payable"` 与卷:行出处；检测器不认字段名，未加标记的数量字段照报（state_pattern-06/07）。

**登记**：`node tools/accept/register.mjs F:/dnd-tmp/b34-register-2.json` → `registered: cases, criteria`（criteria rev 3，log 记 M1–M5 整改）。

**验收实况**：

- `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 553 / ℹ pass 553 / ℹ fail 0`。
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；state_pattern-01/02/03/04/05/06/07/11/12 全 pass；`openHits.state_pattern` 0（真实仓库资源单位只有 `bps`，`material.json` 无 `bps` 维度；item/person/place 维度表未建，`created.*.props.*` 按同口径跳过）。

## 3-4 只核第二轮（2026-11-18）

只读核查，不改代码；核查原文 `docs/审查/3-4-DS只核2-1118.md`。本轮核 `cc4e501d`、`19e45da1`、`7913a349`（diff `a29e5cc8..HEAD`），对应第一轮 M1–M5。

**结论：可封。** M1–M5 均落实；合同/义务豁免已收窄为命名 struct 登记里 `role: "payable"` 的应付数额，检测器不认 `qty`/`done` 字段名；六个新用例分别抓住忽略实体行 / 忽略 dimension / 忽略 `list<…>` / 整键豁免义务 / 整键豁免合同 / 反向往上报应付六种错误；真实仓库 0 命中，门禁 `pass`。

**三条不改代码的登记前置**（详见核查原文第六节）：① `fieldRoles` 文法写在 `named-structs.json:11` 的 `grammar` 节，不在卷二 §1.5 四十五行原表里，第一轮把文法归属留给主会话，封卡前请主会话确认；② 卷六 §2.4 :200 只明写"`resource`、`qty`、`done` … 应给付与已给付"，`qty=应给付、done=已给付` 是按列序的合理对应、非逐字；真实合同/义务记录登记时 `source` 必须写到具体字段与卷:行；③ 当前 `state-owners.json` 无 `contracts.*`/`obligations.*`、命名 struct 无合同/义务行，`7913a349` 的"由夹具演示、登记时带卷:行"说法成立，未登记路径由加载器 E-PATH-UNDECLARED 拒写，不存在静默漏查。

**本轮验证**：

- `node --test tests/accept/state-pattern.test.mjs tests/accept/named-structs.test.mjs` → `ℹ tests 21 / ℹ pass 21 / ℹ fail 0`。
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；`state_pattern-01/02/03/04/05/06/07/11/12` 九条全 `pass`；`openHits.state_pattern: 0`。
- 基线事实：`git merge-base HEAD origin/master` 为 `978bbb41`（4-4a）；当前 `origin/master`=`95084d4a` 只多一个改 `docs/PLAN.md`、`docs/当前状态.md` 的提交，合并前主会话顺手 rebase 即可。

上方八项自查表与"3-4 只核整改"一节记的是实现提交（`19e45da1`/`7913a349`）的实况；本次只核提交按卡文只新增审查原文与本节。

