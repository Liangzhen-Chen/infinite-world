# 卡回报：ds-g1-pos（G1 位置类型、事件可选 pos、分片行）

写者 DeepSeek v4-pro，工作区 F:/dnd-wt/ds-g1，分支 ds/g1-pos。日期 2026-11-21。

## 一、交卷自查表

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | part_by_chunk 按里块切、片键直取路径第二/三段（R27-4.6 :555）；格基底不存档（R27-4.13 :570）；例 7 :590；A27-4.9 :605 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 只按段形状判（save.mjs:320 用 GRID_PATH_SEGS.length 与 GRID_KEY.cells，固定代号经 markersOf），不认具体格空间/里块/格键值 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 非 cells 路径 gauge.\*.level、3 段 cells.\*.\*、doc_data 行均 E-SAVE-SHARD-UNCOVERED（save.test.mjs:446–448）；缺/空段由 statePathSegments 返回 null 拒 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 夹具两格空间三里块、非空里块 4 个、每片键与值按字面量手算（save.test.mjs:385–398、407–416） |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 数字 4/2 不写字面量，由 GRID_PATH_SEGS 形状派生（save.mjs:46、256），非为降计数改名 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 共 130 行（5 文件 114 增 16 删） |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：1287 pass / 0 fail |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 存档分片支持按里块切 cells 差分，离屏不写差分即不重写、体量与泡内改动成比例；纯切拼机制，无写死/特例 |

## 二、改了哪些文件

- `world/ontology/named-structs.json`：卷二 §1.5 命名 struct 登记表新增 `struct:pos`（w/x/y/z: integer:count、coarse: boolean）。
- `tests/accept/named-structs.test.mjs`：登记表对照测试加 `struct:pos` 字段与数值单位期望，行数 46→47。
- `server-plugin/kernel/events.mjs`：载荷公共字段加可选 `pos`，给了按 struct:pos 校验（缺字段/类型不对/多余字段 E-EVT-SHAPE），不给补 null。
- `tests/kernel/events.test.mjs`：新增 pos 卡内测试（合法写入、缺省 null、五种非法拒）。
- `tools/accept/items.json`：经 `node tools/accept/register.mjs` 登记 `vol27.A27-4.9`（state registered，指向 tests/kernel/save.test.mjs 的不变量测试）。
- `tests/kernel/holdings.test.mjs`：3 处事件载荷期望补 `pos: null`（事件公共字段新增后按新行为更新，非降门槛）。
- `tests/accept/item-revisions.test.mjs`：非扫描式条目计数 48→49、卷二十七 1→2、首登 46→47（新增 A27-4.9 后按新读数更新）。

## 三、对照表第 1–6、16 行各怎么落

- **#1 struct:pos 登记**：落 `world/ontology/named-structs.json`（登记）+ `tests/accept/named-structs.test.mjs`（校验）。缺字段/越界/coarse 非布尔的拒收另见 events 的 pos 校验。
- **#2 人物表 pos/facing、location 派生**：未落（见"偏离与未落" 2），移交 G5（M5-38 / 6-24）。
- **#3 place 表 anchor/portal 用 struct:pos**：未落（同上），移交 G5（6-24 重做）。
- **#4 事件公共字段加可选 pos**：落 `server-plugin/kernel/events.mjs`，测试名 `事件载荷公共字段 pos：可选；给了按 struct:pos 校验…`（tests/kernel/events.test.mjs:210）。
- **#5 格差分 cells.\* 按 part_by_chunk 一片**：未落（见"偏离与未落" 1）。
- **#6 格基底不存档 + A27-4.9 进 items.json**：items.json 登记已落（`vol27.A27-4.9`，state registered）；"存档分片里无基底/缓存"卡内测试未落（随 part_by_chunk 落地后写）。
- **#16 A27-4.9 进 items.json**：已落（同上，非新检测器，指向卡内测试）。

## 四、两条验收末行

1. `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 1283 / ℹ pass 1283 / ℹ fail 0`。
2. `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；failed 仅基线既有 `vol12.A12-4.5`、`vol12.S12-2`、`vol12.S12-3`（不计）。

## 五、偏离与未落

- **未落 1（卡文 item 3 分片规则行）**：`part_by_chunk` 不在 `server-plugin/kernel/save.mjs:39` 的 PARTITIONS（只有 part_single/part_by_unit/part_by_segment 三值）；也没有"现有分片规则数据文件"可加行——`world/rules/tables/save-layout.json` 只有 snapshotEveryEvents/segmentEvents/keepSnapshots 三个标量键、无 shards 键（tests/kernel/ledger.test.mjs:333 也注明"save-layout.json 还没有 shards 键，登收尾待办"）。而加 `part_by_chunk` 必须改 PARTITIONS 与切/拼片代码，与卡文"save.mjs、load/save.mjs 代码不动"矛盾，按卡规停下未落、不自编。
- **未落 2（对照表 #2、#3）**：人物/地点表头转 pos 依赖唯一写者 position.mjs（尚不存在，G12 6-27）与 zoneAt（G3）；death.mjs:184 仍读 location（G5 #44 才改读 pos）；迁移计划 §2.1 把 G1 定为"块 2 三处小改"、person/place 表头转换归 G5。未落，移交 G5。
- **未落 3（A27-4.9 的卡内测试）**：因 part_by_chunk 未落地（未落 1），"存档分片里无基底/缓存、cells.\* 每片同（格空间,里块）"的卡内测试无从写；本卡只按对照表 #16 登记 items.json 条目。
- **偏离 1**：卡文 item 1 写"在 dimensions.mjs 与 validate/types.mjs 登记、校验"，但命名 struct 的实际登记数据在 `world/ontology/named-structs.json`（照现有先例）；dimensions.mjs/validate/types.mjs 无需代码改动，struct:pos 值校验落在 events.mjs 与 named-structs 对照测试。
- **偏离 2**：受"事件公共字段加 pos"与"items 加 A27-4.9"牵连，更新两处非卡文列出的既有测试期望（holdings.test.mjs 载荷形状加 pos:null；item-revisions.test.mjs 计数 48→49），均按新行为更新、不放宽断言。

## 六、修改轮（part_by_chunk 分片方式）

主会话卡文已改授权（卷二十七第五版 :130 列 part_by_chunk、:555 切法、:570 R27-4.13、:605 A27-4.9），上轮"未落 1"停下之处本卡落码。"未落 2"（人物/地点表头转 pos，移交 G5）判成立，不动。

**改了哪些文件**

- `server-plugin/kernel/save.mjs`：PARTITIONS 加 `part_by_chunk`（:39）；`compileLayout` 校验 part_by_chunk 只用于 `cells.<w>.<chunk>.<cellKey>`（:315–321）；`takeSnapshot` 按（格空间,里块）各成一片、一行是摘要列表（:416–420、:436–443）；`chunkKeyOf` 片键取首末段之间的格空间号与里块号（:256）；`GRID_KEY`/`GRID_PATH_SEGS` 为固定代号与段形状定义源（:43–46）。
- `server-plugin/kernel/load/save.mjs`：`assemble` 把 part_by_chunk 与 part_by_unit 同按摘要列表逐片拼回（:154–158）。
- `tests/kernel/save.test.mjs`：夹具 DECL/LAYOUT/LAYOUT_B 加 cells 路径与 part_by_chunk 行，新增 4 条卡内测试；受牵连的既有 pathRows 计数 4→5、3→4 按新读数更新。
- `tools/accept/items.json`：经 `node tools/accept/register.mjs` 把 vol27.A27-4.9 指向 tests/kernel/save.test.mjs（补 impl、state registered→implemented；rev 不变，state/impl 不在内容指纹内）。
- `tests/accept/item-revisions.test.mjs`：非 registered 集合加 vol27.A27-4.9（implemented）。

**测试名**（tests/kernel/save.test.mjs）

1. `part_by_chunk：每片只含同一（格空间, 里块）的格键、片数等于非空里块数、片里没有基底与缓存字段`（:407）
2. `part_by_chunk：存盘读回，cells 差分逐键相同`（:419）
3. `part_by_chunk：一个里块的格改了只有那一片的摘要变、其余片不变（卷二十七 §4.4.5 例 7）`（:429）
4. `part_by_chunk：用在非 cells 路径或 doc_data 即 E-SAVE-SHARD-UNCOVERED（对照表 #5）`（:443）

**两条验收末行**

1. `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 1287 / ℹ pass 1287 / ℹ fail 0`
2. `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；failed 仅基线既有 `vol12.A12-4.5`、`vol12.S12-2`、`vol12.S12-3`（不计）

**diff 行数**：5 文件，114 增 16 删，共 130 行。

**cells.\* 的 shards 数据行**：`world/rules/tables/save-layout.json` 无 `shards` 键，本卡不建、不加数据行；随 6-16 建表时登 `part_by_chunk`（回报写明此移交）。

## 七、修改轮二（照 Opus 只核必改 2 条）

### 交卷自查表

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷二十七 R27-4.6 :555"片的键直接取路径的这两段""用于别的路径即加载失败 E-SAVE-SHARD-UNCOVERED"；A27-4.9 :605；对照表 #16 :30、6-20 先例 items.json:3266–3288 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 只按段形状与段数判：片键下标由 GRID_PATH_SEGS.length 派生（save.mjs:258）、覆盖模式段数核 GRID_PATH_SEGS.length（save.mjs:352），不认具体格空间/里块/格键值 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 段数校验是 `!== GRID_PATH_SEGS.length`，无数值特例可绕过；5 段 cells 模式被拒（save.test.mjs:451 新测试）、4 段合法仍过（save.test.mjs:407） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 新测试只声明一条 5 段 cells 模式并断言 E-SAVE-SHARD-UNCOVERED，段数 4 由 GRID_PATH_SEGS 派生，不抄基线读数 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 片键下标/段数均从 GRID_PATH_SEGS 派生，不写数字字面量；items.json 退回 registered 去 impl 是照卷文与 6-20 先例恢复，非为降计数改代码 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 4 文件（save.mjs、save.test.mjs、items.json、item-revisions.test.mjs），共 33 行（26 增 7 删） |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 1288 / ℹ pass 1288 / ℹ fail 0` |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | part_by_chunk 片键照卷文固定第二/三段并核覆盖段数，离屏分片确定性（片只随泡内改动增长）被守住；纯规则层修正，无写死/特例 |

### 必改 1（part_by_chunk 片键与覆盖段数）

- `server-plugin/kernel/save.mjs:258`：`chunkKeyOf` 片键由 `segs.slice(1, -1)`（"首末段之间"）改为 `segs.slice(1, GRID_PATH_SEGS.length - 1)`，固定取第二、三段（格空间号、里块号），下标由 GRID_PATH_SEGS 段形状派生，不写数字字面量。
- `server-plugin/kernel/save.mjs:352`：`compileLayout` 对 part_by_chunk 行覆盖的每条 pathTypes 模式核段数恰为 GRID_PATH_SEGS.length（4），否则 E-SAVE-SHARD-UNCOVERED（"用于别的路径即加载失败"）。

### 必改 2（A27-4.9 退回 registered、去 impl）

- `tools/accept/items.json`、`tests/accept/item-revisions.test.mjs`：`git restore --source=47dcc8871 -- <两文件>` 恢复到 47dcc8871。核 diff 只剩三处——items.json 去掉 `"impl": "tests/kernel/save.test.mjs"`、state implemented→registered；item-revisions 非 registered 集合去掉 vol27.A27-4.9。照对照表 #16（state registered、指向该卡内测试）与 6-20 先例（items.json:3266–3288：本机测试只是普通 kernel 测试、非该条目完整实现时 impl 留空、state 留 registered）。

### 新测试（tests/kernel/save.test.mjs:451）

- `part_by_chunk：覆盖段数不为 4 的 cells 路径模式（更深的 cells.*.*.*.*）即 E-SAVE-SHARD-UNCOVERED（R27-4.6 :555）`：装进一条 5 段的 cells 模式（直接改已合并 pathTypes/keyKinds 再 installStorage，不经 mergeStateOwners/buildP——同顶层键的 cells.*.*.* 与 cells.*.*.*.* 会撞 P 成员名，与本题无关），断言 compileLayout 拒。
- "片键取第二、三段（第二、三段相同而第四段不同的两格同一片、第三段不同分片）"已由既有测试 `part_by_chunk：每片只含同一（格空间, 里块）的格键…`（save.test.mjs:407，w0.c0 含 k1、k2 同片；w0.c0 vs w0.c1 分片）覆盖，不重复造测试。

### 建议取舍（Opus 只核 4 条建议，均不采纳，各一句理由）

1. 建议 1（events.mjs POS_FIELDS 对 named-structs struct:pos 字段集合断言）：不采纳——kernel 侧无命名 struct 读者，Opus 也判"不判必须改"，且不在本卡必改范围。
2. 建议 2（#4 感知读 pos 半句记对照表移交）：不采纳（本卡不动代码）——这是主会话的流程项，感知读 pos 移交感知卡。
3. 建议 3（part_by_chunk 夹具换 gridKey/1121k1 串形）：不采纳（本卡）——gridKey 类代码未落（归 G6/G7），seedKey 文法收不下 `0`、`-1:2`、`3:4:0`，留待 gridKey 落地那张卡换夹具，请主会话记对照表移交节。
4. 建议 4（"无基底"断言偏弱）：不采纳——真正守"基底进不了存档"的是 R27-4.4 未声明路径拒存（既有测试已覆盖），本卡测试断言不出更强。

### 两条验收末行

1. `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 1288 / ℹ pass 1288 / ℹ fail 0`
2. `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；failed 仅基线既有 `vol12.A12-4.5`、`vol12.S12-2`、`vol12.S12-3`（不计）

### diff 行数

4 文件，26 增 7 删，共 33 行。
