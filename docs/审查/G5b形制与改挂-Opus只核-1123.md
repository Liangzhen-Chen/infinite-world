# G5b 形制补缺与子站点改挂：Opus 只核（第 1 轮）

复核者：Claude Opus 5.5 中档。对象：分支 ds/g5b-convert，写者提交 768e5db86（父 1f5317880，与 origin/master 的合并基 07b9ebec9）。只读核对，不改代码。
依据：李白裁定-1117.md「G5b子站点选甲0505」（:1582，G5b-D/E/F）、origin/master 上「G5b上格两处0513」（事件 08673f69，G5b-G/H/I）；卷十 R10-7.12、R10-3.12、R10-1.7；卷八 R8-18.9 ③、R8-5.1；卷十九 §4.5 规则 1–2；卷二 §5.6。

## 自查表

| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句逐条摘出、到卷:行 | 是 | 见各项 |
| 2 | 没有按 id/名字/场景写特例 | 是（被核代码） | siteform.mjs 补缺对全部 `form` 缺的建筑行；convert-geo 对 subsite 清单每行同一处理 |
| 3 | 限额/校验试特殊值 | 是 | form 写 null、不在登记→E-GEN-ROW-INVALID（gen-siteform 测试）；m3PerL 为 0 有分支（water.mjs:81） |
| 4 | 新测试不依赖当前偶然数字 | 否 | geo-g5b-data 的 86、15 个郡抄自现产出（见第 5 项） |
| 5 | 无为降计数改写、无假常量 | 是 | — |
| 6 | 本卡只写审查文件 | 是 | 只提交本文件 |
| 7 | 测试 | 本机跑 | `node --test tests/kernel/gen-siteform.test.mjs tests/kernel/gen-water.test.mjs tests/kernel/geo-g5b-data.test.mjs`：tests 49 pass 49 fail 0；`node tools/world-plan-partition-check.mjs`：SUMMARY raw-overlap=0 seed-misses=0 errors=0 area-mismatch=0 heaven-errors=0 heaven-area-short=0 heaven-door-miss=0。全量与转换脚本未跑（卡文不要求） |
| 8 | 离块 6 | — | 真实世界上格的前置；见定稿清单 |

`git merge-tree --write-tree origin/master 768e5db86` 无冲突（树 1bd268702）；分支落后主线 3 个提交（含 1123 批勘误 8907defc6），合入前须再合一次主线。

## 1. 形制补缺（gen/siteform.mjs，卷十 1123k31）——必须改

**按设施类型：不合裁定。** G5b-G 原文："补缺阶段按设施类型从形制登记里用种子取一个……设施类型在登记里找不到形制的，列清单写进交接文件，不报错不自造"。写者把勘误写成"候选 = 登记里的全部条目……所以不按类型筛"（卷十 R10-7.12 新 `form` 子条），等于改了裁定的口径，又把裁定的缺口条件"该设施类型找不到形制"换成了另一个条件"登记一个也没有"（`form_registry_empty`）。结果是 328 栋（连城墙 bld_hc_citywall、城门 bld_hc_stone_gate 在内）全补成 bldform_river_house，这正是北极星不允许的"拿简化版顶上"。卷十九 §4.5 规则 1（:635）说形制不规定用途，这句话的意思是任何类型都可以用任何形制，并没有授权在没有类型数据时等权乱取；按类型筛的那一步是规则 2 ③（:637，读 `intendedType` 类型行的 `maxSkyExposure`、`maxAperture`）。
判：照裁定字面执行。行上没有设施类型（`intendedType` 缺，或不是登记维度），或者按类型筛完一个形制也不剩，都算"该设施类型在登记里找不到形制"：不补、不报错，记缺口（建议代号 `form_type_unmatched`），按行列进交接文件。勘误句改成"候选 = 按卷十九 §4.5 规则 2 ③ 对本行 `intendedType` 筛后的登记条目"。"按类型怎样筛"要用到的类型行、`intendedType` 维度和形制内容，归主会话请李白定的前置卡"水深规则与形制内容"。写者自定的"等权全登记"不能当作临时口径留下。

**三条测试**：
- 同种子同结果：`deepEqual(a, b)` 两次运行加"换种子至少一行不同"。守得住确定性，过。
- 作者 form 不改：提案里不带 `form`，墙厚取作者形制的缺省值 0.8。过。
- 登记为空记缺口：测试本身对，但守的是写者换掉的条件，随上条一起改成"无类型或筛后为空即缺口"，并加一条用例：有 `intendedType` 的行能补出，没有的进缺口。
- "30 行三个形制都取到"是固定种子下的偶然结果，建议删掉，或改成手算某一行的 drawByKey 值。

**种子键**：seed-keys.json 新行的 stream `gen_siteform`、site `site_gen_bldfill_form`、role_seed、前缀 `gen_`，与卷十 §4.12.1 :888 一致；genDraw 直接调 drawByKey（draw.mjs:15–16），对象段是行 id，时刻取 genesisMinute，键里没有版本成分。过。提案的 seedKey 有形制抽取就取形制键，否则取面积键，测试已经钉住。过。

## 2. 勘误流程——必须改

- **"卷十、卷八都没有勘误表"不实。** 卷十每次封卷后勘误除了在正文内联标注，还在卷末"附 第二版修订记录"里追加一段"封卷后勘误 1121k5/1121k16/1121k20（依据…；不升版本号；改前快照 …；改稿 …）"（卷十 :1396–:1400）。主线 1123k5 也这样记（origin/master 卷十 :1401）。卷八在"附录 第五版修改记录"表里逐行记"| 封卷后勘误 1116s2（…改前快照…）| — | — |"（卷八 :1706–:1707）。本分支只做了内联标注，两卷修订记录里都没有 1123k31、1123k32。
  补法：卷十修订记录末尾追加"封卷后勘误 1123k31"和"封卷后勘误 1123k32（卷十部分：R10-3.12）"两段，写明依据（事件 08673f69 G5b-G/H）、不升版本号、改前快照 `版本快照/卷十-v3-勘误前-1123k31.md`（1123k32 的卷十部分同用这一份，并写明快照取自 1f5317880，不含主线 1123k5）、改稿模型，结尾写"历史修订记录不回改"；卷八第五版修改记录表追加 1123k32 一行，快照 `版本快照/卷八-v5-勘误前-1123k32.md`。
- **快照本身合规。** `卷十-v3-勘误前-1123k31.md` 与 1f5317880 的卷十同 blob（18b7b0588…），`卷八-v5-勘误前-1123k32.md` 与 1f5317880 的卷八同 blob（4ecd5015c…）。git mv 加 restore 做出的结果等同于复制，命名照旧例。过。
- **工作区**：`git status --short` 输出为空，没有残留的 git mv 或暂存。过。
- **另一处合并残留（第 1 轮新发现，必须改）**：合并提交 080262e38 把本分支旧的 1121k22 行和主线的 1121k22 行都留下了，卷二修订记录（:3381 与 :3383）、卷五修订记录（:1612 与 :1615）各有两行 1121k22。分支那一行的快照写的是"git 对象 …，快照目录文件过大不另抄"，和主线那一行（有快照文件）冲突。删分支这两行，只留主线行。

## 3. 卷八 1123k32（R8-18.9 ③、卷十 R10-3.12）——必须改 1 处，其余过

- 方向对：originSite 子站点按 R8-5.1 的统治边归原村（`governorOf` 先取自身统治边），坐标不动，不靠包含关系；R10-3.12 写明生成器只读这个字段，不给原站点加面积，与 G5b-E 一致。
- **必须改**：条件写成了"`originSite` 所指站点在 ② 里建了聚落组织"。原站点要是有手写的聚落组织或手写统治边（R8-18.9 末句：手写优先，跳过 ② 或 ③），子站点就连不上，和 G5b-H"从该站点的统治组织连统治边"不符。改成"取 `originSite` 所指站点的统治边持有者（③ 前半本阶段交出的，或作者手写的）"；原站点开局无主时，P 也无主。
- 建议：加一条加载校验，`originSite` 必须指向站点行，不能是政区，也不能指向自身或自身的祖先。现在只有 geo-g5b-data 在数据层核这一点。
- 代码未落：docs/问题.md 新第 7 条逐项写清缺的东西（组织表、orgkind、polity 规则表、建行写者、setGovernor、governorOf、idslot），并指向卷八开局组织卡，过。建议在 tools/convert-geo-g5b.mjs:157 的注释后补一句"开局统治边未落，见 docs/问题.md 第 7 条"。G5b-H 要求的测试"经统治边查回原村"现在做不了，须等卷八开局组织卡，不能拿数据层测试顶替后就当它交了。

## 4. originSite 表头（place.json）——必须改 1 处

- 命名用驼峰，`type: ref`、`kind: place`、`nullable: true`、`required: never`、`modifiable: false`，写法同 `downstream`、`parent`。过。
- **必须改**：卷二 §5.6 是 place 表头的登记表，跨卷维度都登在这里，例如 :1816 `planCells`、:1817 `breaks`，owner 写卷十九。本次没有补 originSite 一行，place.json 和卷二不再一一对应。补一条卷二封卷后勘误（同批号，先拍快照），owner 写"卷八 R8-18.9 ③"。卷五 §2.1 的列表也收别卷维度（如 `planCells` :172），同步补一行引用，不另写定义。定义只留在卷八一处。

## 5. 子站点改挂 86 行——必须改 2 处

- 一视同仁：convert-geo-g5b.mjs:281–284、:314–317 对清单每行做同一件事（改 parent、写 originSite），不按 id 特判。过。
- **3 轮收敛是不是同一条规则，核不了**：清单是由一次全规模补缺后逐层核划分推出来的，可仓库里没有推导脚本，Grep 只在转换脚本、测试和文档里找到 subsite-reparent。world-plan-partition-check.mjs 也不查子站点。清单注释自称"来源生成推导，须重推，不手改单行"，但没有重推工具，等于一份写死的派生结果。必须改：提交推导和核对入口（可作为转换脚本的一个 `--subsites` 模式：按"种子不在旧父站点足迹内 → 改挂到含种子的最深政区或存量单元"逐轮推，到 0 为止，`--check` 时与清单逐行比对）。
- **数据与清单一致**：转换后 86 行的 parent、originSite 与清单逐行相同，清单外的行没有 originSite（测试已守）；originSite 都等于旧 locations.json 的旧父，这一项有独立来源，过。
- **测试期望**：originSite 这一项是从改挂前数据（旧 locations.json）逐行比对的，过。新挂处不是：`NEW_PARENTS` 的 15 个郡和总数 86 都抄自现产出，违卡头二.4。必须改：对 86 行逐行断言"种子区格在新挂郡的足迹里"（文件里现成的 countyPartition / ownerIdAt 就能用）。86 这个数要么删，要么改由推导入口得出。
- 观察（不挡）：loc_site_glass_dunes 距原属雁渡 58 km，loc_site_silt_canyon 的原属是 glass_dunes 这个荒野点。照裁定字面一视同仁可以，但"雁渡统治 58 km 外的沙丘"是否合理，建议随卷八开局组织卡一并报李白看。

## 6. water.mjs 容量整升整除——过

- 算法：S、D、M 是 10⁴ 标度的定点整数，整升数 = ⌊S·D ÷ (M·标度)⌋。原来的三步是 ⌊⌊⌊S·D/标度⌋·标度/M⌋/标度⌋，化简为 ⌊⌊S·D/标度⌋/M⌋；正整数嵌套向下取整可以合并，所以两者恒等。范围内结果与原来相同，没有精度丢失；只是 bigint 中间值不再过 checkedFixed 的安全上限。
- 全程是 bigint 整数，没有浮点；`Number()` 之后才判 `isSafeInteger`，超过 2⁵³ 的 bigint 转出来至少是 2⁵³，一定判为不安全，所以不会误放行。门禁 vol5.S5-10 管的是几何原语（Math.hypot/atan2/sqrt、fixedSqrtInt/atan），water.mjs 不涉及，不违。
- 测试：1e9 m² × 4 m ÷ 0.001 = 4e12 L；5e11 × 40 ÷ 0.001 = 2e16 L 超过 2⁵³ ≈ 9.007e15，报错。两例都是手算，过。
- 建议：先拿 bigint 与 `BigInt(Number.MAX_SAFE_INTEGER)` 比较再转 Number，语义更直。

## 7. 转换脚本顺序与失败不写盘——过

assemblePlace（:404–:428）的顺序是：作者行 → loadDoc 读未校验的表 → generateFill → 并进 generated 节 → loadDoc 整体校验一次 → `!final.ok` 抛错。main（:431–:447）只在 assemblePlace 返回、且不是 `--check` 时才写 place.json 和 labels，失败不写盘。过。
建议：① writeTempDims 用的是 `os.tmpdir()`（在 C 盘），按项目规矩应放 F:/dnd-tmp 或取环境变量；② subsite-reparent.json 不存在时静默当空表（:158–:159），建议改成必有，缺了就报错；③ 补缺的 deferred 缺口（如 form 缺口）只打印计数，裁定要求列清单进交接文件，建议按行输出。

## 8. 定稿清单

**改完必须改项即可合进主线**（卷文先行，代码行为如实）：
- server-plugin/kernel/gen/water.mjs、tests/kernel/gen-water.test.mjs（现在就可合）
- server-plugin/kernel/gen/siteform.mjs、tests/kernel/gen-siteform.test.mjs、world/rules/tables/seed-keys.json（按第 1 项改成无类型即缺口之后）
- 卷十 R10-7.12、R10-3.12，卷八 R8-18.9 ③，两份快照，两卷修订记录补记，卷二 §5.6 / 卷五 §2.1 originSite 行，卷二、卷五重复 1121k22 行删除（第 2–4 项）
- world/ontology/dimensions/place.json 的 originSite 表头
- tools/convert-geo-g5b.mjs 的 subsite 读入部分，docs/问题.md、docs/当前状态.md（措辞随第 1 项改；"找不到形制的设施类型：0 类"要改，现在根本没按类型查）

**须等前置卡**：
- world/geo/subsite-reparent.json 与 geo-g5b-data 的子站点三条测试：清单由站点面积推出，站点面积又取决于建筑的 `planCells`，后者取决于补出的形制。第 1 项一改，占地会变，清单必须重推。所以要等"形制内容"前置卡定了形制和类型、推导入口提交之后，再推一次、再核。
- G5b-H"经统治边查回原村"的行为测试、gstage_polity：等卷八开局组织卡。
- place.json 数据行（未换）：等形制内容、R10-7.11 落位（anchor、facing）、开局建账（condition、materialKg）、水深规则（海、湖的 capacityL、surfaceM2、catchmentM2）四张前置卡，转换整体加载过了再换。

## 必须改汇总（7 条）

1. 形制候选改回"按设施类型"，无类型或筛后为空即记缺口、不补，测试跟改（第 1 项）。
2. 卷十、卷八修订记录补记 1123k31、1123k32（第 2 项）。
3. 删卷二、卷五各一行重复的 1121k22 合并残留（第 2 项）。
4. R8-18.9 ③ 连边对象改为原站点的统治边持有者，含手写（第 3 项）。
5. 卷二 §5.6（并卷五 §2.1 引用）补 originSite 行（第 4 项）。
6. 提交子站点改挂的推导与核对入口（第 5 项）。
7. 子站点测试改成逐行核"种子在新挂郡足迹内"，不抄 86 与 15 个郡（第 5 项）。

命令纪律自报：本轮跑测试时误用了一次 `cd … ; node --test … | tail`（含 cd 与管道），只读，无副作用；之后改用纯命令。

## 第二轮

复核者：Claude Opus 5.5 中档。对象：写者提交 06dd9fd4c，读的是 `git diff d6b35a21b 06dd9fd4c`，共 11 个文件。本轮只核第 1 轮七条的落实情况、新快照、推导入口和定稿清单，不加新要求。本轮命令只用了 git、node --test、node 仓库脚本，没用 cd，也没用管道。

本机实跑：
- `node --test tests/kernel/gen-siteform.test.mjs tests/kernel/geo-g5b-data.test.mjs`：tests 43 pass 43 fail 0。
- `node tools/derive-subsite-reparent.mjs --check`：round 1 有 64 行违规，round 2 有 22 行，round 3 为 0；derived 86 rows in 3 rounds; stored 86; differing 0，耗时约 128 s。
- `git status --short` 为空。

### 1. 七条逐条

1. **形制按设施类型：落实，带一处自补（见"仍须改"第 2 条）。**
   - 已改到位：卷十 R10-7.12 :685 改为"按卷十九 §4.5 规则 2 ③ 对本行 `intendedType` 所指设施类型行筛"。无类型、类型行不存在、筛后为空，都记 `form_type_unmatched`，不补、不报错，并写明"不拿'全部登记等权'顶替"。
   - 代码：siteform.mjs 的 candidatesOf 从 facility_type 族取 `maxSkyExposure`、`maxAperture`，值为空即无要求；候选为空就进缺口，不补出也不计占地。
   - 测试：有类型的行能补出；无类型、类型不在族里、登记为空三种情况都进缺口；有一例真的按露天比例剔除了无顶形制。"三个形制都取到"那条偶然断言已删。
   - 真实世界现在补出 0 栋，328 栋进缺口。这与裁定的字面意思一致。
2. **卷十、卷八修订记录：落实。** 卷十 :1402 补记 1123k31，其后一段补记 1123k32 的卷十部分，写明快照取自 1f5317880、不含主线 1123k5。卷八第五版修改记录表补了 1123k32 一行。
3. **重复的 1121k22：落实。** 06dd9fd4c 里卷二、卷五各只剩 1 行 1121k22，即主线那一行。
4. **R8-18.9 ③：落实。** 现在的写法是"取 `originSite` 所指站点的统治边持有者（③ 前半本阶段交出的聚落组织，或作者手写的统治组织或手写统治边的持有者）"，原站点开局无主时 `P` 也无主。
5. **originSite 登记：行落实，快照不合规（见下一项）。**
   - 卷二 §5.6 补了一行：`ref place nullable`，never/skip，owner 卷八 R8-18.9 ③，勘误号 1123k33。
   - 卷五 §2.1 补了一行，只引用卷八的定义，勘误号 1123k34。
6. **推导入口：落实。** tools/derive-subsite-reparent.mjs 已入库，`--check` 推出的结果与清单逐行一致，3 轮收敛在同一条规则下：种子不在父足迹里，就改挂到含该种子格的最深政区或存量单元，再求一次足迹，直到没有违规。
7. **逐行核新挂处：落实。** 新测试对清单每一行核两件事：种子格在新挂处的祖先链上，且不在原父站点的足迹里。抄来的 86 和 15 个郡已删；"清单外没有 originSite"改成与清单行数相比。

### 2. 1123k33、1123k34 的快照——必须改

卷二 1123k33 写"勘误前快照 = git 对象 `4d99a0379…`……快照目录文件过大不另抄"，卷五 1123k34 写"= git 对象 `d4e4bb77a…`"。两个哈希本身对得上：它们正是 768e5db86 的卷二、卷五 blob（第 1 轮 diff 的 index 行）。但 G5b 机制 Opus 只核 M1 已经判过只记 git 对象不合规，1123 批与可燃量勘误都已改成存快照文件，而且本轮删掉的那两行重复 1121k22 正是这种写法。

补法：
- 用 `git show 768e5db86:<卷二路径>` 和 `git show 768e5db86:<卷五路径>` 取出原文，以 Write 写成 `版本快照/卷二-v18-勘误前-1123k33.md` 与 `版本快照/卷五-v12-勘误前-1123k34.md`。
- 写完用 `git hash-object` 核对，须与 4d99a0379、d4e4bb77a 相同。
- 两行的快照栏改为文件路径，并注明"与 768e5db86 同 blob"。

### 3. 推导入口与转换脚本改动——过（附建议）

- **推导入口不推进世界，也不写仓库。**
  - 读旧数据与附表，fillPlace 走生成补缺纯计算，planFootprints 用 `withCells: false` 只求足迹。
  - 改挂只改内存里的候选表 doc，不写盘；`--check` 只读清单作比较，不带参数时打印 JSON 到 stdout，由人写入。
  - 唯一的副作用是 loadDoc 在 `os.tmpdir()` 建临时目录、用后即删（第 1 轮建议 ①，未改）。
  - 结果是确定的：同一份数据跑两次得同一张表，`--check` 已证与入库清单一致。距离用 `Math.hypot` 只作留痕，注释写明不进规则层；脚本在 tools/，不在规则层组，不触 S5-10。
- **convert-geo-g5b.mjs 的改动：**
  - ① `convertGeo(geoDir, opts)` 只多一个可选参数，`opts.subsites` 未给时读入库清单。清单改为必有：文件缺了 readJson 直接抛错，第 1 轮建议 ② 已采纳。
  - ② 原 assemblePlace 拆成 fillPlace（作者行到生成补缺）和 assemblePlace（fillPlace 后整体校验，不过即抛）。main 仍只在 assemblePlace 通过后才写盘，失败不写盘的保证没变。
  - ③ loadDoc 只是加了 export。
  - 三处都不改变转换的输出。
- 建议（不挡）：
  - 推导入口靠 `/seed cell/.test(e.detail)` 从错误说明文字里挑违规，等于读自然语言判逻辑。宜让 planFootprints 的错误带一个固定事由代号再筛。
  - siteform.mjs 的 designOf 用 `catch (e) { break; }` 把所有异常都当成"展不开"，会把编程错误也吞掉。宜只认 planCellsOf 的越上限码。

### 4. 仍须改（2 条）

1. 1123k33、1123k34 改存快照文件，见第 2 项。
2. **形制设计围合值的取法须写进卷文。** siteform.mjs 的 designOf 用"该形制最小可展开平面（面积自 1 m² 起逐次加倍到可展开，层数取 `max(1, 1 − storeyBase)`）的蓝图 design"作为规则 2 ③ 的比较值。卷十九 :637 原文是"按入参（面积、层数、墙厚）算出的蓝图"，卷十 R10-7.12 :685 只写了"形制的设计围合值"，没写用哪组入参。补缺阶段面积是在形制定了之后才抽，所以入参本来就推不出来，这一取法是写者自定的，卷文没有出处（违卡头二.1）。
   - 现在真实世界没有一行带类型，这个取法不影响任何数据，但 D 卡填类型后它就会生效。
   - 补法：卷十 R10-7.12 `form` 子条补一句"已定：比较值取该形制最小可展开平面的设计围合值，理由：补缺时面积在形制之后才抽"，记进 1123k31 修订记录；docs/问题.md 记一条，交 D 卡或李白确认。不改代码。

### 5. 定稿清单

李白已裁 G5b 收口，机制与数据核过就合。上面两条改完后，**整个分支都可以合进主线**：
- 代码与测试：server-plugin/kernel/gen/water.mjs、server-plugin/kernel/gen/siteform.mjs、world/rules/tables/seed-keys.json、tests/kernel/gen-water.test.mjs、tests/kernel/gen-siteform.test.mjs、tests/kernel/geo-g5b-data.test.mjs。
- 卷文：卷十、卷八、卷二、卷五的勘误（1123k31–k34）及其快照文件。
- 数据与工具：world/ontology/dimensions/place.json 的 originSite 表头、world/geo/subsite-reparent.json、tools/derive-subsite-reparent.mjs、tools/convert-geo-g5b.mjs。
- 文档：docs/问题.md、docs/当前状态.md、docs/卡回报/g5b-convert.md。

第 1 轮我把 subsite-reparent.json 列为"须等形制"，现在改判可合，理由有二：形制补缺已改为补 0 栋，清单在现行规则下由入库的推导入口重推得出、逐行一致；D 卡改了形制以后，用 `--check` 就能发现清单过时并重推，不会悄悄失真。

合入前须再合一次 origin/master。第 1 轮 merge-tree 无冲突，本轮未重跑；合后照规矩跑全量测试。

**须等前置卡**：
- A 卷八开局组织层：gstage_polity、setGovernor、governorOf，以及 G5b-H 要求的"经统治边查回原村"行为测试。
- B R10-7.11 建筑落位：建筑行的 anchor、facing。
- C 开局建账：condition、materialKg。
- D 水深规则与形制内容：海、湖 5 行的 capacityL、surfaceM2、catchmentM2；设施类型数据、`intendedType` 维度和更多形制，有了这些 328 栋才补得出形制，补出后站点占地会变，清单要用 `--check` 重推。
- place.json 数据行：等 A–D 都落、转换整体加载通过后再换，现在不换。

**结论：不过**，仍须改 2 条，都只改文档（快照文件，卷文"已定"一句），不改代码。按"每卷最多两轮"，改完由主会话亲读 diff 就可合，不必再请第三轮。
