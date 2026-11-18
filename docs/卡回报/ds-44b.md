| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 见下方"卷文原句"与"11-18 21:3x 裁定"节：李白 11-18 21:3x 裁定第 1–4 条（`docs/审查/李白裁定-1117.md` 末节）；卷二 §1.9 :285（代码内封闭枚举值不带前缀）、:289（别卷定义的代码内封闭枚举补登）；卷二十七 §2.1 :123、§2.2 :171、R27-5.2 :570–:575 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 旧名 `fn_exp` 被拒不是另开分支，而是走 map 键的代码内枚举检查（server-plugin/kernel/validate/types.mjs:188 `E-DIM-DOMAIN-ENUM`），`CODE_ENUMS.detfn` 是唯一取值表；加载校验仍按值形状触发，不按表名/键名分支（server-plugin/kernel/load/rules.mjs:241–268） |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | tests/kernel/det-numeric-tables.test.mjs：mathAllow 空表合法、step=0 拒、values 短一项拒、缺一值拒、`fnTables: {}` 空表按 detfn 每值各报缺行、多出 detfn 外的行与旧写法 `fn_exp` 均报 E-DIM-DOMAIN-ENUM、safeIntMax≠2⁵³−1 拒；tests/kernel/det-numeric-fn.test.mjs：域外两端拒、恰在边界收、sqrt(0) 收、负底拒、safeIntMax+1 报 E-DET-OVERFLOW |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 插值/周期/折回用测试自装 fixture 表并按卷文公式手算（tests/kernel/det-numeric-fn.test.mjs:1–16）；真实表只断键集与形态（七值新名、2⁵³−1、长度公式），不抄表值 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 常数全部在 world/rules/tables/det-numeric.json（data）与 tools/gen-det-tables.mjs（离线生成器）；detfn 七值单一定义在 markers.mjs 的 CODE_ENUMS，本轮只改值、不加假常量 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 本轮只动卡文所列的卷十七正文、版本快照与回报。本轮 1167 行：勘误前快照 `卷十七-封卷-勘误前-1118k24.md` 1105 行整文件新增、正文 5 增 4 删、现行快照 5 增 4 删、本回报 42 增 2 删（`git diff --numstat` 与 `wc -l` 实测）。本卡四提交累加 5004 + 1167 = 6171 行；前三次为测试先行 97 增 70 删、实现 205 增 117 删、勘误 afdede57 4499 增 16 删 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | 本轮：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` 末行 `ℹ tests 591 / pass 591 / fail 0`；`node tools/gen-det-tables.mjs --check` → `det tables up to date (4097/81/4097/9901/15709/15709/2001)`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`（items 仍列 vol12.A12-4.5、vol12.S12-2、vol12.S12-3 三项既有项，本轮只改文档未触碰） |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 规则层算衰减、角度、开方只走这一处定点数学设施，函数名与卷二 §1.9 的代码内封闭枚举规则对齐，后续调用不会因 `fn_` 与卷十九 ffunc 前缀同形而混用；未写死、未跳规则引擎、未缩规模 |

## 卷文原句

- 卷二十七 §2.2 :123（族 detfn）：`fn_exp`、`fn_ln`、`fn_sin`、`fn_cos`、`fn_atan`、`fn_sqrt`、`fn_pow` 七值。
- 卷二十七 §2.2 :167–:168：`mathAllow` 空表 = 全禁；`safeIntMax` 为 2⁵³−1，固定值。
- 卷二十七 §2.2 :171：`fnTables` 为 `map<detfn, struct fnTable{inScale, outScale, domainMin, domainMax, step, values}>`，缺行即加载失败；`step` ≥ 1，`values` 长度 = (`domainMax`−`domainMin`)÷`step`+1，入库带摘要；`fn_exp` 行不带 `values`，指向卷二 §1.10 冻结表。
- 卷二十七 R27-5.1 :568：状态整数绝对值不超过 `safeIntMax`；一次写入超出即报 E-DET-OVERFLOW，不截断。
- 卷二十七 R27-5.2 :570–:575：每函数一行；两点间线性插值、全程整数、除法向零截断、按 `outScale` 给出；域外报 E-DET-DOMAIN、不外推不钳位；`fn_exp` 直接用卷二冻结表；`fn_sqrt` 用 §1.10 整数开方（牛顿法固定步数）、不查表；`fn_pow` 由 `fn_exp` 与 `fn_ln` 组合、底数须为正；`fn_sin`/`fn_cos` 表覆盖一个整周期、输入先按周期取余；`fn_atan` 域外恒等式折回；表值离线生成入库带摘要、门禁逐位比对；各行标度步长首次标定写依据。
- 卷二 §1.10 :326：整数开方用牛顿法固定 32 步。
- 卷二 §3.3 :1328–:1341：定点指数、整数次幂、自然对数的唯一定义（本卡复用，不另写）。
- 李白 11-18 16:3x 裁定第 4 条：`detfn` 不在 `_vocab.json` 新登族，直接在 `world/rules/registry.json` 的 `det-numeric` 表行处理七值。

## 本提交（实现）

- `world/rules/registry.json`：新增 `detNumeric` 登记行（file `tables/det-numeric.json`）；`fnTables` 按卷文写成 `map<detfn, struct fnTable>`，`safeIntMax` 取值域固定 [2⁵³−1, 2⁵³−1]，`mathAllow` 为字符串表。
- `world/rules/tables/det-numeric.json`：`tools/gen-det-tables.mjs` 离线生成；ln 9901 点、sin/cos 各 15709 点、atan 2001 点，各带 sha256；`fn_exp`/`fn_sqrt`/`fn_pow` 不查表、无 values。
- `server-plugin/kernel/det-math.mjs`：新增 `installDetNumeric`、`installDetTables` 与 `fn_exp/fn_ln/fn_sin/fn_cos/fn_atan/fn_sqrt/fn_pow`；`checkedFixed` 溢出码改 E-DET-OVERFLOW，上限取登记的 `safeIntMax`。
- `server-plugin/kernel/load/rules.mjs`：fnTable 形状的跨字段检查（长度公式、step 整除、basis、values 必须有摘要、缺行即失败），七值集合从登记引用的代码内枚举派生；全部规则表过关后把 det-numeric 装进内核。
- `tools/gen-det-tables.mjs`：BigInt 高精度（W=10⁶⁰）生成 ln/sin/cos/atan，`--check` 同时逐位比对 `_distributions.json` 与 det-numeric 表。
- `.gitattributes`：det-numeric 表 `text eol=lf`，Windows 检出后 `--check` 仍逐位一致。
- `tools/accept/criteria.json`：内核文件改动使判据闭包指纹变动，经 `tools/accept/register.mjs` 对受影响类别逐行 rev+1 并加修订记录。

## 须复核的取舍（写明理由，不自行改裁定）

1. **detfn 七值的单一定义放在 `server-plugin/kernel/handles/markers.mjs` 的 `CODE_ENUMS.detfn`，`registry.json` 引用它并在 volume 原句里记全七码。** 理由：卷二 §1.5 的 enum 禁止 inline 取值，map 键只能是词表族或代码内枚举；struct 字段名又必须是小驼峰（`KEY_RE`），`fn_exp` 这类带下划线的族代号不能当字段名。因此"map<detfn,…>"只能经代码内枚举落地；`_vocab.json` 未动，符合李白 16:3x 不登词表族的裁定；七值仍只在一处定义。
2. **`fn_sqrt` 的固定步数 32 登在规则表 `fn_sqrt.iterations`**，不在代码里写常数：卷二十七 :575 要求标度、步长等首次标定时写依据，且 const_literal 门禁要求数值常数走登记数据。
3. **修了既有测试的一处基线字面量**：`tests/accept/detectors.test.mjs` 原断言 registry 行数恰为 9（当前偶然数字，加一张登记表即失败），改为从登记派生（`rows.length >= 1` + 逐行文件存在 + 零命中不变）；不放宽任何实际检查。
4. **`fn_exp` 行带 values 的机械拦截**：类型层把 `values` 设为可选（卷文允许的行无 values），加载器按"有 values 必须有 sha256"拦截；若同时伪造 values+sha256，靠 `--check` 逐位比对生成结果兜住（生成文件不含 values）。未在加载器按函数名分支（红线）。

## 测试先行提交

81d77fe0：两张测试 + 本回报的旧版（223 行）。当时 10 条预期失败（实现未落），本提交后 549/549 全过。

## 只核（DeepSeek，2026-11-18）

核查原文：`docs/审查/4-4b-DS只核-1118.md`。结论：**必须改两项 + 一项须李白裁定**；其余照卷文做对。

- 必须改 1：`server-plugin/kernel/load/rules.mjs:244` 在 `fnTables: {}` 时先早退，绕过卷二十七 :171 的"缺行即加载失败"与 self-check 第 3 项的"空表无法绕过"。补空对象测试并按 `requireAll` 前置判定。
- 必须改 2：`det-math.mjs` 的 `fn_ln/fn_sin/fn_cos/fn_atan/fn_exp/fn_sqrt/fn_pow` 七个导出未登 `world/ontology/state-owners.json` kernelApi，违反卷二十七 :564；补七行或写明留给哪张卡。
- 须裁定：detfn 七值放 `CODE_ENUMS`（markers.mjs:36-38）——卷二 §1.5 :181 确实禁止行内枚举，但卷二 §1.9 :288 的代码内封闭枚举清单没有 detfn，且 markers.mjs:9 自述与本条冲突；请李白确认补入 §1.9 或认可现写法。
- 已复核：表值 4 点独立手算一致（ln2/sin0.5/cos0.5/atan0.25）；插值负值向零截断、域外 E-DET-DOMAIN、sqrt 32 步、pow 负底拒、checkedFixed 改码与 safeIntMax 登记值均正确；测试期望手算；detectors 去 9 属偶然数字但 `>=1` 非派生（建议比较表文件集）。
- 命令末行：`node --test tests/kernel/det-numeric-fn.test.mjs tests/kernel/det-numeric-tables.test.mjs` → tests 17 / pass 17 / fail 0；`node tools/gen-det-tables.mjs --check` → `det tables up to date (4097/81/4097/9901/15709/15709/2001)`。

## 只核改（2026-11-18）

只核原文 `docs/审查/4-4b-DS只核-1118.md`。本卡照改两项；detfn 七值落 `CODE_ENUMS` 的机制依据已报李白裁定，本卡不动。

- 测试先行（本提交）：`tests/kernel/det-numeric-tables.test.mjs` 加三例——`fnTables: {}` 空表按 `CODE_ENUMS.detfn` 每值各报 `E-DIM-STRUCT-FIELD`（卷二十七 :171）；多出 detfn 之外的一行报 `E-DIM-DOMAIN-ENUM`（:123 七值封闭）；detfn 七值各登 `kernelApi`（:564）。此时空表一例仍被 `rules.mjs:244` 的空对象早退绕过、kernelApi 一例七行未登，两条预期失败；多出一行已由 map 键的枚举类型检查覆盖。
- 实现（本提交）：`server-plugin/kernel/load/rules.mjs` 的 `fnTableSetOf` 把 `requireAll` 判定移到空对象早退之前——时空表不早退，缺行循环按 `CODE_ENUMS[enumFam]` 每值报 `E-DIM-STRUCT-FIELD`，仍不写死函数名；`world/ontology/state-owners.json` 照 `fixedExp` 行补 `fn_exp`、`fn_ln`、`fn_sin`、`fn_cos`、`fn_atan`、`fn_sqrt`、`fn_pow` 七行（callers `["rules"]`、acceptsState false），`tests/kernel/handles.test.mjs` 的"登记所指导出存在"随之覆盖。
- `tools/accept/criteria.json`（rebase 前）：`rules.mjs` 在检测器 import 闭包内，重盖后 8 个类别的 print 变化（dual_write、handfill_derived、instance_name、item_form、namelist、param_consumed、seed_sites、undeclared_io），经登记器各 rev 加一并追加"判定口径不变"记录；其余类别 print 未变，不动 rev。旧记录一条未删，print 由登记器现算，未手写。接主线后此份重盖按主线基线重做，见下节。
- 流程说明：本轮测试先行提交（rebase 前 a341168a，rebase 后 5eb776c2）提交时误带 `--no-verify`，未走提交关口（该时点只有测试与本回报，代码未动；关口本身可通过，但仍是本轮操作失误，已记录，后续提交均不加该参数，历史不回改）。

## 接主线（B2-W3，origin/master 6660f7e1）

- `git fetch origin && git rebase origin/master`：本分支 5 个提交接到主线；冲突只在 `tools/accept/criteria.json`，按卡文取主线一侧（rebase 里 `--ours`）；`server-plugin/kernel/load/world.mjs`、`validate/dimensions-validate.mjs` 等主线改动自动合入，无行为取舍。
- rebase 后经 `node tools/accept/register.mjs` 重盖：17 个类别 print 变化（const_literal、dual_write、escape_hatch、fallback、handfill_derived、id_parse、instance_name、item_form、namelist、param_consumed、registry_write、seed_sites、self_name、state_pattern、text_judge、undeclared_io、wallclock），各 rev 加一、追加"判定口径不变"；`state_pattern` 为主线新增类别。旧记录一条未删，print 由登记器按当前检测器闭包现算，未手写。
- 接主线只动 criteria 与本回报；代码、数据与测试在 rebase 中按两边保留，未再改。

## 11-18 21:3x 裁定：detfn 七值去前缀与勘误 1118k24

依据：李白 11-18 21:3x 裁定（`docs/审查/李白裁定-1117.md` 末节"附：李白 11-18 21:3x 裁定：4-4b detfn 七值落处"）。裁定四条：① detfn 七值去前缀为 `exp ln sin cos atan sqrt pow`（代码内封闭枚举值不带前缀，卷二 §1.9 :285、:289）；② 做勘误 1118k24，卷二 §1.9 :289 补登 detfn、卷二十七 :123 从词表族表移为代码内封闭枚举并去前缀，:171、:570 与 R27-5.2 凡写 `fn_*` 处同号改；③ 整类：今后代码内封闭枚举一律登 §1.9 这一处清单、值不带前缀，带前缀的同类值只在回报列出；④ 空 fnTables 与 kernelApi 照改，kernelApi 登记名随新值。

### 卷文原句（本轮）

- 卷二 §1.9 :285：`_vocab.json` 开放族的枚举值一律带族前缀；代码内封闭枚举值不带前缀（本节末）。
- 卷二 §1.9 :289（别卷定义的代码内封闭枚举补登）：取值与含义只在所列各卷，本卷不重列；它们在 §1.5 的 enum 类型里写作 `enum <名>（代码内封闭）`，校验器按代码常量表核对，不要求前缀。
- 卷二十七 §2.1 :123（改前，词表族表）：`detfn` 的条目为 `fn_exp`、`fn_ln`、`fn_sin`、`fn_cos`、`fn_atan`、`fn_sqrt`、`fn_pow`。
- 卷二十七 §2.2 :171：`fnTables` 为 `map<detfn, struct fnTable{…}>`；`fn_exp` 行不带 `values`，指向卷二 §1.10 的冻结表。
- 卷二十七 R27-5.2 :570–:575：族 `detfn` 的每个函数在 `fnTables` 里有一行；`fn_exp` 直接用卷二冻结表；`fn_sqrt` 用整数开方；`fn_pow` 由 `fn_exp` 与 `fn_ln` 组合；`fn_sin`、`fn_cos` 按周期取余；`fn_atan` 域外折回。

### 测试先行（本提交）

- `tests/kernel/det-numeric-fn.test.mjs`：导入、fixture 键与调用全部改为新名 `exp ln sin cos atan sqrt pow`；七个新名各一条求值用例，期望沿用上一轮手算字面量，只改名（插值向零截断 0/−75、域外 E-DET-DOMAIN、exp=fixedExp 且 ⌊e×10⁸⌋=271828182、sqrt 32 步 141421356、pow 负底拒、sin/cos 周期取余、atan 折回 117809724）。
- `tests/kernel/det-numeric-tables.test.mjs`：真实表键集断言改为 `atan cos exp ln pow sin sqrt`；缺行、多行、step、长度、整除、basis、exp 不带 values 的 fixture 键同步改名；新增"旧写法 `fn_exp` 等前缀名被拒、不兼容"一例，期望 `E-DIM-DOMAIN-ENUM`（由 map 键的代码内枚举检查拒绝，不为旧名另开分支）。
- `tests/kernel/det-math-exp.test.mjs`：注释里的旧名改为 `exp`（只改注释，无断言变化）。
- 本轮预期失败：`node --test tests/kernel/det-numeric-fn.test.mjs tests/kernel/det-numeric-tables.test.mjs` → `ℹ tests 14 / pass 4 / fail 10`（fn 文件因导出未改名整体导入失败计 1，tables 9 条因世界数据仍用旧键而失败）；实现与全量重跑见下一提交。

### 实现（本提交）

- `server-plugin/kernel/handles/markers.mjs`：`CODE_ENUMS.detfn` 由 `fn_exp…fn_pow` 改为 `exp ln sin cos atan sqrt pow`（仍只此一处定义）。
- `server-plugin/kernel/det-math.mjs`：七个导出与内部查表键、错误串、注释同改；`ln`/`atan`/`exp`/`sqrt`/`pow` 为函数声明，`sin`/`cos` 为箭头函数，与既有导出 `fixedExp` 等不冲突（已定：导出名直接用新值，理由——detfn 是内核定点数学设施对规则层的公开名，卷二 §1.9 :285 要求值不带前缀，且 `#exp` 等合 kernelApi 的 `文件#导出名` 文法）。
- `world/rules/tables/det-numeric.json`：`fnTables` 七个键改新名，`pow` 行的 basis 与表 source 串同改；表值、sha256 未动。
- `tools/gen-det-tables.mjs`：生成器的七个键、失败信息、basis 串、计数键、摘要行同改；`node tools/gen-det-tables.mjs --check` 逐位一致。
- `world/rules/registry.json`：det-numeric 行的 volume 串改记七值新名，并改引卷二十七 §2.1 :123 与李白 21:3x 裁定。
- `world/ontology/state-owners.json`：kernelApi 七行 `kernel/det-math.mjs#exp` 等随新名。
- 旧名加载拒收不另写分支：`fnTables` 的键是 `enum detfn`，map 键走 `checkValue` 的代码内枚举检查（`validate/types.mjs:188`），旧名 `fn_exp` 报已登记的 `E-DIM-DOMAIN-ENUM`，与"多出 detfn 之外的行"同一路径（红线：不为某个名字开特例）。
- `tools/accept/criteria.json`：markers.mjs、det-math.mjs 在 17 个扫描类别的检测器 import 闭包内，按判据版本规则经 `tools/accept/register.mjs` 逐类 rev 加一、log 追加一条（旧记录全留），print 由登记器按当前闭包现算；未手改。
- 测试：`node --test tests/kernel/det-numeric-fn.test.mjs tests/kernel/det-numeric-tables.test.mjs` → `ℹ tests 21 / pass 21 / fail 0`；`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 591 / pass 591 / fail 0`；`node tools/gen-det-tables.mjs --check` → `det tables up to date (4097/81/4097/9901/15709/15709/2001)`。
- 门禁现状（如实记）：`node tools/accept/run.mjs pre_commit` 仍为 `verdict: fail`，失败项 `vol12.A12-4.5`（E-ACC-PARAM-UNCONSUMED）、`vol12.S12-2`（E-ACC-REGISTRY-WRITE）、`vol12.S12-3`（E-ACC-ITEM-COUNT/ORPHAN/UNREGISTERED）。在 `origin/master` 的干净工作树（b1845a77）上跑同一条命令，失败项完全相同；本卡没有新增失败：改动前本卡多出的 `vol12.S12-13`（crit_version 17）已随判据重盖清零，其余 openHits 与 master 一致。master 的三项不属本卡文件（卷二/卷二十七登记的条目缺口与 offline 工具写者），未在本卡修。

### 裁定第 3 条整类核查（只列不改）

- `CODE_ENUMS` 全表（`server-plugin/kernel/handles/markers.mjs:10–38`）：除 `detfn` 外没有族前缀形的值。唯一带下划线的是 `wire_route` 的 `save_export`、`save_import`（`markers.mjs:24`），是复合词、不是族前缀（前缀表里 route 族用 `route_`），按卷二 §1.9 不算违例；`stock_mode.extScale` 等其余值均无下划线。
- 卷二 §1.9 的代码内封闭枚举清单：逐项核对，无第二处带族前缀的同类值。
- 跨卷引用（本卡无所有权，未改，请主会话排卷十七勘误）：`docs/统一底层设计/卷十七-交通与路途.md` :335、:513、:1010、:1076 仍写 `fn_sin`、`fn_cos`，改名后是悬空引用；本卡文件清单只含卷二与卷二十七，未动卷十七。
- `docs/审查/李白裁定-1117.md`、`docs/审查/4-4b-DS只核-1118.md`、`docs/迁移体检/块4*.md` 与本回报里的 `fn_*` 是历史记录/裁定原文，按"历史修订不回改"保留。

### 勘误 1118k24（本提交）

照 1118k23 的同一手续：先存勘误前快照，改正文，附录追加一行写依据，覆盖现行快照，不升版本号，历史修订不回改。

- 快照：`版本快照/卷二-v17补26-勘误前-1118k24.md`（930737 字节，改前全文）；`版本快照/卷二十七-v4-勘误前-1118k24.md`（243472 字节，改前全文）。改后覆盖 `版本快照/卷二-v17补26-现行.md`、`版本快照/卷二十七-v4.md`、`版本快照/卷二十七-封卷.md`。
- 卷二 §1.9 :289："别卷定义的代码内封闭枚举补登"加 `detfn`（内核定点数学设施提供的超越函数七值，取值归卷二十七 §2.1；李白 11-18 21:3x 裁定第 2 条）。
- 卷二十七 §2.1 :123：`detfn` 行从词表族表删除，表后加"代码内封闭枚举 `detfn`（值不带前缀：`exp`、`ln`、`sin`、`cos`、`atan`、`sqrt`、`pow`；§2.2 `fnTables` 用它作 map 键；登记见卷二 §1.9）"一段。
- 卷二十七 §2.2 :171：`fn_exp` 行改 `exp` 行。
- 卷二十七 R27-5.2 :573–:574：`fn_exp`/`fn_sqrt`/`fn_pow`/`fn_ln`/`fn_sin`/`fn_cos`/`fn_atan` 全去前缀。其余本卷 `族 detfn`、`§2.1 detfn` 等是枚举族名引用，不改。
- 两卷附录各追加一行 1118k24 勘误记录，写明依据、改前快照路径、改动范围与"原句不改/历史修订不回改"。
- 勘误后重跑：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 591 / pass 591 / fail 0`（文档改动不触发判据闭包，criteria 无新变化）。

## 卷十七 1118k24 补改（本轮，2026-11-18）

依据：李白 11-18 21:3x 裁定第 2 条"全仓 fn_exp 等七个旧写法一并改净"（原文见 `docs/审查/李白裁定-1117.md` 末节）；卡文目标列卷十七 :335、:513、:1010、:1076。

### grep 结果与逐处判断

命令：`grep -rn "fn_exp\|fn_ln\|fn_sin\|fn_cos\|fn_atan\|fn_sqrt\|fn_pow" docs/统一底层设计 server-plugin world tools tests --include=*.md --include=*.mjs --include=*.json`

改后命中与判断（改前卷十七正文的四处命中即卡文所列）：

- 改（四处均指卷二十七 §4.5 R27-5.2 的内核定点数学设施 detfn，不是卷十九 ffunc 的 `fn_` 前缀条目；卷十九 grep 零命中）：
  - :335 §4.1.3 R17-1.4 风项：`fn_sin(windDirDeg)`、`fn_cos(windDirDeg)` 与"`fn_sin`、`fn_cos` 是卷二十七……"→ `sin`、`cos`。
  - :513 §4.5.1 维度："风向分量的三角函数用卷二十七 §4.5（确定性数值）的 `fn_sin`、`fn_cos`"→ `sin`、`cos`。
  - :1010 修订记录"二审后修改"二-1："风项改调卷二十七 `fn_sin`、`fn_cos`"→ `sin`、`cos`（见下"须复核的判断"）。
  - :1076 附录待补第 17 项："风项的三角函数用卷二十七 `fn_sin`、`fn_cos`"→ `sin`、`cos`。
- 不改（卡文例外：勘误前快照、历史修订、附录原文；以及负向测试）：
  - 本轮新增勘误行（正文与现行快照各 1 处命中）：附录原文，写明旧名改新名，保留旧名（同卷二十七 1118k24 勘误行写法）。
  - 卷二十七正文 `卷二十七-离屏性能存档与确定性.md:1044` 与现行快照 `卷二十七-v4.md`、`卷二十七-封卷.md` 各 1 处：1118k24 勘误行原文，保留。
  - 卷十七旧快照 `卷十七-v2c..v2g.md`、各 `卷十七-…-勘误前-*.md`；卷二十七旧快照 `卷二十七-v2.md`、`v3.md`、各 `v4-勘误前*.md`、`v4-封卷前-1114.md`：历史快照，保留。
  - `tests/kernel/det-numeric-tables.test.mjs:83–84`：旧名被拒的负向用例，保留。
  - `server-plugin/`、`world/`、`tools/`：零命中。

### 勘误手续（同号 1118k24）

- 改前快照：`版本快照/卷十七-封卷-勘误前-1118k24.md`（1105 行、203264 字节，与改前正文逐字节相同）。
- 正文：上述四处改 `sin`、`cos`；封卷后勘误表追加一行（依据、改动范围、改前快照、不升版本号；旧名只在该勘误行里出现）。
- 改后覆盖 `版本快照/卷十七-封卷.md`，与正文 `diff` 为空。
- 不升版本号。

### 须复核的判断

- :1010 位于"修订记录（第二版）·二审后修改"，属历史修订记录；卡文做法第 2 条把"历史修订记录"列为不改例外，目标与目标重复又点名"含卷十七四处"。本轮按目标改了该处，并在勘误行写明"只改代号，规则与叙述不变"；若复核按例外口径要求保留原句，回退该行一行即可。请主会话定。
- 卷十七 :335 的 `fnTables`、`isqrt`、`A27-5.1` 等其余名称不动，只换函数名。

### 测试（本轮）

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 591 / pass 591 / fail 0`。
- `node tools/gen-det-tables.mjs --check` → `det tables up to date (4097/81/4097/9901/15709/15709/2001)`。
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；items 仍列 vol12.A12-4.5、vol12.S12-2、vol12.S12-3 三项（上一轮报告已记为 origin/master 既有项）；本轮只改文档，未触碰这些条目。

## 只核2（DeepSeek，2026-11-18）

只核第二轮，只读不改代码。核查原文：`docs/审查/4-4b-DS只核2-1118.md`。结论：**可送终核**；建议四条不阻塞。

- 第一轮两项已落实：`fnTables: {}` 经 `server-plugin/kernel/load/rules.mjs:243-252` 按 `CODE_ENUMS.detfn` 每值报 `E-DIM-STRUCT-FIELD`，测试 `tests/kernel/det-numeric-tables.test.mjs:71`；七函数按新名登 `world/ontology/state-owners.json:85-91`，测试 `:89`。
- 裁定四条核对：`CODE_ENUMS.detfn` 单一定义（`markers.mjs:38`）；`registry.json:58` 以 `vocab: detfn` 引用；旧名经 `validate/types.mjs:188` 报 `E-DIM-DOMAIN-ENUM`；全仓 grep 旧名只剩历史只核/回报/裁定原文、勘误前快照、卷二十七 :1044 与卷十七 :1051 勘误行、卷十七 :1010 历史修订记录、负向测试与块 4 体检审计记录。
- 勘误手续：三卷勘误前快照与改前正文 blob 哈希相等（`e9681234…`、`12fbb74a…`、`9bc0541a…`）；现行快照与正文 `cmp` 无差异；附录各一行（卷二 :3164、卷二十七 :1044、卷十七 :1051）；不升版本；历史修订记录未回改（卷十七 :1010 已由 300ff0ca 恢复原句）。
- 建议：① `markers.mjs:9` 注释仍说别卷定义取值者在此缺席，与新增 detfn 矛盾；② `registry.json:71` volume 串仍复述七值，与裁定“只引用、不行内列”字面冲突；③ `markers.mjs:36`、`registry.json:71` 引卷二十七 §2.1 :123 已过期（定义在 :130）；④ 表驱动行删 `values` 仍可加载（第一轮已记，非本轮两项）。
- 命令末行：`node --test tests/kernel/det-numeric-fn.test.mjs tests/kernel/det-numeric-tables.test.mjs` → `ℹ tests 21 / ℹ pass 21 / ℹ fail 0`；`node tools/gen-det-tables.mjs --check` → `det tables up to date (4097/81/4097/9901/15709/15709/2001)`；另跑全量 `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 591 / ℹ pass 591 / ℹ fail 0`。
- 本提交只改卡文所列的两份文档：`docs/审查/4-4b-DS只核2-1118.md`（整文件新增）与本回报（追加本节），未动代码、数据、测试与快照。
