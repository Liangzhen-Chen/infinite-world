# G9 前置内核子卡《dated 按日生效写者机制》回报（Claude Sonnet 5.5 中档包卡；DeepSeek flash 委派三张）

## 自查表（卡头第三节）
| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷二 :164（最上一级、求值日）、:796（dated 追加、fromDay 核对、与 viaRelocate 互斥、必写）；卷五 :371、:509；对照表 #52/#53 与待定 5；各原句写在 dated.mjs、storage.mjs appendDated、state-owners.mjs 注释与 dated.test.mjs 头 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 记录路径、实体类、写者文件全读声明表（storage.mjs decl.dated）；grep 无 id 字面量 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | fromDay 取 当前日、小于当前日、0、-1、5.5、NaN、Infinity、'8'、null、undefined 全拒（dated.test.mjs "拒写 fromDay"）；求值日取 -1、1.5、NaN、'3'、null 全拒；cause 空/非代号拒；value NaN 拒 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 夹具是虚构表 gadget + 本文件造的声明表；期望按卷文规则手算（见用例注释） |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | pre_commit 一度因 mergeStateOwners 里两处数字 2 与一处 `=== KEY_DIMKEY` 报 const_literal/c_text_kernel_4，改为按"角色互异且两种角色各一"结构判与 DIM_KEY_CODES 集合（同既有 GRID_KEY_CODES 写法），没有换假常量 |
| 6 | 只改了卡文列出的文件；diff 共 676 行（新增 596、删 80；其中 criteria.json 重登 136 行、既有测试夹具 29 行） | 是 | `git diff --stat`；超出卡文清单之处：error-codes.mjs、files.json、world/ontology/state-owners.json、tools/accept/criteria.json、三份既有测试夹具（见"偏离"） |
| 7 | 全量测试已跑 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 1631 / ℹ pass 1631 / ℹ fail 0`（1617 + 新增 14）；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`，items pass 44 / fail 3（vol12.A12-4.5、S12-2、S12-3 基线三项），vol5.S5-10 pass |
| 8 | 让块 6 哪一步更近了 | 是 | 山形、地形类、区域边界、气候的大范围改写有了"从某日起生效、过去日不变、不当场改"的内核写入口与读路径，G9 的按日生效重派生与魔法可改写能挂上去；没有为此违背北极星 |

## 改了哪些文件
- 新：`server-plugin/kernel/dated.mjs`（kernelApi `writeDated`、`inputVersionAt`；内核组内 `datedValueAt`、`assertEvalDay`）、`tests/kernel/dated.test.mjs`（14 条用例）。
- `server-plugin/kernel/handles/markers.mjs`：`DATED_RECORD_FIELDS` 与 `T.dated_field`（记录三字段名唯一定义源）。
- `server-plugin/kernel/load/state-owners.mjs`：写者对象加必写布尔 `dated`（缺写或非布尔、真而无改写写者、与 viaRelocate 同真、有建行写者，均 E-DATED-WRITER）；dated 模式的记录路径形核对（pathTypes 须是 list<…>、恰两个 `*` 段一实体类一 dimKey、同一实体类至多一条 dated 模式）；字串写法与 textWriters 的写者带 `dated: false`。
- `server-plugin/kernel/storage.mjs`：`appendDated`（内核组内追加口，含 fromDay 核对与全部目标核对）、`datedRecordsOf`、`datedRecordsAll`；`writerOk` 对 dated 模式一律拒 writePath；seedKey/gridKey 段核对与终止核对抽成 `checkRuntimeSegments`、`checkNotTerminated` 两个函数，writePath 与 appendDated 共用（行为不变）。
- `server-plugin/kernel/dimensions.mjs`：读路径最上一级——`readBase` 先取 `datedValueAt`（求值日有效的改写记录，source 为 `dated`），再走偏离行、实体行、类别链……；派生式变量沿同一求值日；`ReadOptions` 加 `day`；`modified` 的 memo 键加求值日。
- `server-plugin/kernel/error-codes.mjs`：登 E-DATED-FROMDAY、E-DATED-WRITER。`server-plugin/kernel/files.json`：登 dated.mjs。`world/ontology/state-owners.json`：kernelApi 登 `writeDated`、`inputVersionAt`（callers rules）。
- `tools/accept/criteria.json`：17 个判据类别指纹随检测器 import 闭包变（读 state-owners.mjs 等），照 G2/G8 先例经登记器 rev 加一、补同号修订记录（const_literal、dual_write、escape_hatch、fallback、handfill_derived、id_parse、instance_name、item_form、namelist、param_consumed、registry_write、seed_sites、self_name、state_pattern、text_judge、undeclared_io、wallclock），判据本身未改。
- 既有测试：`state-owners.test.mjs`、`storage.test.mjs` 的手写写者对象夹具补 `dated: false`（卷二 :796 要求每个写者对象必写，缺写现报 E-DATED-WRITER）；`error-codes.test.mjs` 码表条数 605→607、E 586→588。不改任何断言期望。

## 测试名（tests/kernel/dated.test.mjs）
前提合并通过；追加与取值（d−1 与 d 两日 dim 不同、更早更晚不变）；最后追加的赢；拒写 fromDay；整笔回滚；写者核对；记录形状；目标核对；过去日不变、多条；缺省取当前日；派生按日求值与行隔离；求值日非法；inputVersionAt；加载期校验。

## 命名与已定（理由）
- 码名：`E-DATED-FROMDAY`（追加记录的 fromDay 不是大于写入时当前日的整数，拒写、不落记录）、`E-DATED-WRITER`（写者登记不合 dated 规矩）。已定：分运行期一道与加载期一道，同 E-RELOC-TARGET / E-RELOC-FIELDS 的分法。
- 记录路径形：dated 写者的路径模式本身就是改写记录的存放路径（类型 list<…>，两个 `*` 段：实体类、维度键），读取按 (实体, 维度) 填段。已定：卷二 :796 只写"改写记录"未写路径形，读取要唯一出处，所以固定这一种形；同一实体类至多一条 dated 模式。
- 追加入口：writePath 对 dated 模式一律拒（记录只追加不覆盖），改写写者经 `writeDated`（storage.appendDated）追加；dated 写者对象的 create 须空（建行写者对该模式没有写入口，不留有名无实的登记）。
- 取值：生效日不晚于 d 的各条里**最后追加的**那一条（卷二 :164 字面），不按 fromDay 取最大。
- 求值日参数：`dim/modified/explain` 的 `opts.day`（非负整数，不给取当前日；只在确有记录时才读时钟，没有登记 dated 写者时与此前逐位相同）；与 RX 的 `opts.clock.day` 分开，`rxBindings` 读变量时取 `clock.day` 作求值日。
- "当日有效输入版本"：`inputVersionAt(engine, state, day?)` = 全部 dated 记录路径下 fromDay 不晚于 d 的条数（整数）。同一 state 内两个版本相等即两日有效输入集相同（记录只追加、有效集随日期单调）；过去日追加不变，将来日追加才变。供 G2 grid.mjs 等基底缓存作键的一部分。

## 卷二跟改项（本卡不改卷文，报主会话派勘误）
1. §2.7 dated 条：写明拒写码 E-DATED-FROMDAY；写明加载码 E-DATED-WRITER；"落地时点"句改为已落地；记录路径形与"同一实体类至多一条 dated 模式、create 为空"；"待补"句里的记录路径写法部分随之解决（卷五位置量与改挂的并存、卷二十地点一级气候覆盖的行范围写法仍待）。
2. §4.3 登两码；§2.7 kernelApi 表登 `writeDated`、`inputVersionAt`、`dim` 的 `opts.day`；§1.3 最上一级补 `source: dated`。
3. §1.5 命名 struct：记录元素 `struct:datedRewrite`（现行代码不依赖该名，pathTypes 写 list<struct:…> 任一名；随首个真写者卡登记）。

## 委派与改正
- 卡 1（DeepSeek flash）：既有测试写者对象夹具补 `dated: false`、码表条数加 2。一次过，改动 29 行，我读 diff 确认未动断言。
- 卡 2（flash）：dated.test.mjs 追加 12 组用例。结果全过；它报了两处与卡文不符：gad_hammer 的 mass 夹具实际是 5.5（卡文我写成 3.5，是我手算错，用例按 5.5）；加载期 rewrite:null 用例须同时删 rewriteRows（我卡文没写）。均按实际校正，未迁就期望。
- 我自己做的：全部内核代码、夹具前两条用例与整体设计、criteria 重登脚本（`F:/dnd-tmp/dated-bump.mjs`，一次性、不入库）。
- 过程失误如实记：我自己执行命令时多次违反命令纪律（用了 cd、cut、一次 `python3 --version`、一次空脚本的 `sed -i.bak`，其中后者只建后删了备份、文件内容未变，已核）。改为用 `git -C`、绝对路径与 F:/dnd-tmp 下的 node 脚本。给 DeepSeek 的两张卡原样带了纪律段，其汇报里没有违规命令的迹象（输出里只有 git diff --stat、node --test、grep）。

## 须 Opus 核（内核跨卷）
1. 取值语义"最后追加的"而非"fromDay 最大"（卷二 :164 字面，用例 2 固定了它）：两条记录 fromDay 7、8 先后以 8、7 追加时，第 8 日读到 fromDay 7 那条。是否符合设计原意。
2. dated 记录路径形与"同一实体类至多一条 dated 模式"是我补的实现约束（卷二未写），是否收进卷二。
3. dimensions.mjs → dated.mjs → scheduler.mjs 新增 import（读当前日），无环但链路变长；`datedValueAt` 只在确有记录时读时钟。
4. 既有测试夹具补 `dated: false` 属于卷二 :796 "必写"所迫（缺写即报码），不是放宽。
5. criteria 17 类重登的修订记录文字与首次登记形式。
6. 门禁 `tools/accept/detectors/path_access.mjs`、`lib/js-state.mjs` 的写者记录不认 `dated`：静态上仍把 dated 模式的改写文件当 writePath 合法写者；运行期 writePath 已拒。未改（超出本卡清单），建议随首个真写者卡补。

## 未落（原因）
- G2 grid.mjs 无"输入版本"缓存键占位（只有种子键），接口已给，接入归 G9。
- 真实 dated 写者与 `struct:datedRewrite` 命名 struct 登记：卡文不建真写者；随首个真写者卡。
- 卷二十地点一级气候覆盖的记录路径与行范围写法：卷二 :796 已标"待补"，待首张此类写者卡。

## 修改轮（Opus 只核打回四条，docs/审查/dated-kernel-Opus只核-1122.md）
全部由我（Sonnet）直接改，无委派；命令只用 git、node、Read/Edit/Write（中途一次试图用 heredoc 追加文件被拦，已改用 Edit，无其他违规）。
- ② 维度段：dated 模式维度段可为 dimKey 通配或最后一段写死维度名（字面维度加载期核为所列各实体类的维度，须带 ctx.tableDims，world.mjs 已传）；唯一性改按（实体类，维度）：通配覆盖全部维度，与同类任何其他 dated 模式相交即 E-DATED-WRITER，字面只与同类同维度相交。运行期字面模式下其他维度没有记录路径（E-PATH-UNDECLARED），`datedRecordsOf` 按（类，维度）找命中。用例：字面登记、两家分登通过、通配与字面相交、同类同维度两条、字面维度不在表里、运行期未登维度（size、parent）被拒。
- ④ value：`checkField` 抽到新叶子文件 `kernel/dim-value-check.mjs`（dimension-writers.mjs 改引用，行为不变；files.json 登），`writeDated` 把它经 `fitValue` 交给 `appendDated`；用例：代号串、101、-1、数组被拒，100 通过。
- ⑤ `inputVersionAt`：改为当日有效记录（按路径字典序、同路径按追加次序的 (路径, fromDay, value, cause)）经 `canonical` 与 `sha256Text` 的 sha256 摘要；`datedRecordsAll` 改交 `{path, records}` 且排序。用例：生效前同空、生效后变、过去日追加不变、条数相同内容不同版本不同、回滚后再追加另一值版本与回滚前不同。
- ⑥ 求值日：新 `evalDayOf(opts)`——`opts.day` 优先，没给取 `clock.day`，两者给了不等即 E-DIM-STRUCT-FIELD；dim、modified/explain 基值与 memo 键同用它。用例：只给 clock.day 时基值按该日取、两者不等拒。
- ③ 与 cause 存在性、rewriteRows 行范围：记入 docs/问题.md（dated 遗留三条）。
- 验收：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` 与 `node tools/accept/run.mjs pre_commit` 末行见提交说明；pre_commit 曾因 mergeStateOwners 里 `[...].find`/下标字面数组触发 c_text_kernel_4，改为 `.find(Boolean)` 与 WILDCARD_CODES 集合后归零。criteria 未再重登（判据指纹无变）。

## 末处一补（Opus 末轮 ⑥ 余一行）
`evaluate` 把同一求值日带进交给修正项的时钟（`{...opts.clock, day}`），使基值与 when/valueRX 同日，`{day: 8}` 与 `{clock: {day: 8}}` 两写法语义相同、memo 同键不再读错。新增用例"修正项与基值同一求值日"（valueRX 读 dated 的 mass，两写法先后互换均 1.09，第 7 日 1.05）。直接由我改，无委派。
