# ds-b2w3 回报（B2-W3《派生式求值》照李白 11-18 20:20 裁定 B 收尾）

**状态：完成。** 加载期只编译能写成的派生式；写不成的五处进机读"未建派生"登记，登记里的跳过不报错，未登记又编不过的仍报 E-MOD-RX；`producedBy` 从 `derived` 移出，改由加载器建全表反查索引；真实 `world/` 下 `loadWorld` 通过。卷二按 1118k23 勘误（先存快照、改正文、附录追加一行、不升版本）。

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷二 §1.12 :356–:389（原语表 :362–:370、变量读基值 :378、TA-S1 :379、RA-N3 :380、派生不落存储 :388）、§1.1 文件布局、§2.9 第 4 条 :1182–:1183；卷三乙 :143（producedBy 类型）、:627（全表反查索引原句）；裁定原文 `docs/审查/李白裁定-1117.md` 末节 20:20。详见下「依据原句」。 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 实现只按表头 `derived`/`reverseIndex` 与登记表通用处理：validate/dimensions-validate.mjs:155–:263 读登记决定跳过，:278–:325 按维度头建反查索引；不认表名、维度名或 id。 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | tests/kernel/dimensions.test.mjs 新用例：登记里的派生跳过；未登记空串/坏语法仍 E-MOD-RX；登记了非派生 `mass` 报 E-DIM-REF-MISSING；登记了已能编译 `volumeX` 报 E-DIM-STRUCT-FIELD；反查维度手填报 E-DIM-DERIVED-WRITTEN。`_unbuilt-derived.json` 的 `missing` 空/重复/乱序/越枚举、`card` 空或不合文法的检查在 validate/dimensions-validate.mjs:160–:180。 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望按卷文公式或真实行手算：`mat_coke.producedBy = ['reaction_char']`（material.json:4201 是唯一指向它的行）、`mat_oak.producedBy = []`、未建登记恰五项。无一处抄仓库当前读数或计数。 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 门禁 `const_literal` 现值 0、`c_text_kernel_1/3/4` 现值 0；未造权重、密度或换算常数，未补聚合原语。 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 接主线一轮：冲突文件 server-plugin/kernel/load/world.mjs（两边装配都保留，见 :21–:36、:61–:69、:74–:80）与 tools/accept/criteria.json（经登记器重盖后 `git diff --stat` 末行 `1 file changed, 48 insertions(+), 16 deletions(-)`）；另本回报文件。原卡实现与测试 diff 仍为 442 行（`git diff --numstat 76758716..HEAD` 中 server-plugin、tests、world、tools/accept 各文件合计，不含卷二正文/快照与回报文档）。 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | 接主线后：`node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 549 / ℹ pass 549 / ℹ fail 0`；`node tools/gen-det-tables.mjs --check` → `det tables up to date (4097/81/4097)`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`。 |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 真实世界材料表恢复可加载，派生求值有了可玩的读入口（可编译的派生按 §1.3 求值、`producedBy` 可读），块 6 的物品/材料竖切片不再被加载期卡住；未写死、未开特例、未跳过规则引擎、未造假数据。 |

## 依据原句

- 卷二 :356：`### 1.12 派生与聚合原语`；:358：``derived` = RX + 封闭聚合原语（`_vocab.json` `aggregate` 族，前缀 `agg_`）`。
- 卷二 :362–:370 十项原语表；:378：`**派生变量一律读基值**；修正只施于最终被读的维度`；:379（TA-S1）：`RX 中任一变量 known:false → 结果未知……`；:380（RA-N3）：`维度级——节点是 (kind.dim)，边是公式引用；自引用必须带 recursive:{relation}，否则 E-DIM-DERIVED-CYCLE……`；:388：`派生量不落存储：derived 的结果只在读时算……`。
- 卷二 §2.9 第 4 条 :1182：`数据侧（world/ 表与 rules/ 文件）的 RX 仍以文本写（§1.5 rx 类型），由 kernel/load 在加载期 compileRX 为 rxTree 并登记 RxId`；:1183：`加载期编译失败即 E-MOD-RX`；:1185：`其余类型（string、set、map、list、struct、curve、distribution、rx）不能作 RX 读数……`。
- 卷三乙 :143：`producedBy | set<ref vocab reaction>，derived`；:627：`producedBy = 全表里凡有某一行的 reactionProducts[r] 指向本行的那些反应代号 r 的集合；加载期遍历一次材料表建成只读的反查索引，没有哪一行指向它就是空集。它只反查一层。`
- 裁定原文（李白 11-18 20:20 裁定 B）：整类规则——凡 derived 写不成现行 RX 的进机读"未建派生"登记；加载期只编可写的，登记里的跳过不报错；没登记又编不过的仍报 E-MOD-RX；运行期读登记里的未建派生用已登记码、不静默给值；producedBy 改由加载器建索引、从 derived 移出；categories 拿不准就进登记；登记出处写进卷二 §1.12 勘误一条。

## 已定（小技术决定）

- **已定：未建登记文件放 `world/ontology/dimensions/_unbuilt-derived.json`，理由**：它是维度层的加载期登记，与 `_units.json`、`_vocab.json`、`_effects.json` 同目录、同下划线前缀惯例，加载器已有的公共表读取路径直接覆盖；不当维度表（加载器按 `_` 前缀排除）。`missing` 用非空去重有序列表，因为 hardness/toughness 同时缺数据与原语，单值写不下。
- **已定：运行期读未建派生用 `E-MOD-RX`，理由**：卷二 :1183、:1234 已把 RX 编译/求值失败登记为 E-MOD-RX，现行 map/set 派生拒收与聚合原语未建也报此码；不新造语义码。
- **已定：登记双向核的码用已登记码，理由**：条目所指不是本表 derived 维度报 `E-DIM-REF-MISSING`（引用缺失），登记了却已能编译、`card` 不合文法报 `E-DIM-STRUCT-FIELD`（结构字段），重复报 `E-DIM-DUPLICATE-KEY`，`missing` 取值不合报 `E-DIM-DOMAIN-ENUM`；不新增错误码。
- **已定：判据指纹变动经仓库登记器重盖，理由**：validate/dimensions-validate.mjs 在共用检测器 import 闭包内，改动后 8 个扫描类别（dual_write、handfill_derived、instance_name、item_form、namelist、param_consumed、seed_sites、undeclared_io）的 print 变化；用 `tools/accept/register.mjs` 逐类 rev 加一并追加修订记录，判定口径不变（R12-14.3）。

## 未建派生登记全部条目（`world/ontology/dimensions/_unbuilt-derived.json`）

| table | dimension | missing | card |
|---|---|---|---|
| material | categories | data, primitive | pre_first_reader_card |
| material | charYield | data, primitive | pre_first_reader_card |
| material | hardness | data, primitive | pre_first_reader_card |
| material | hydration | constant | pre_first_reader_card |
| material | toughness | data, primitive | pre_first_reader_card |

`producedBy` 不在登记里：它按裁定第 2 条从 `derived` 移出，material.json 改为 `reverseIndex: "reactionProducts"`，由加载器建索引。

## 实现与测试证据

- 加载期：登记解析与双向核（`server-plugin/kernel/validate/dimensions-validate.mjs`, `readUnbuiltRegistry`）；派生编译对登记项跳过、对已能编译的登记项报错（`compileDerived`）；反查索引建在展平与自检之后（`buildReverseIndexes`），行上手填报 `E-DIM-DERIVED-WRITTEN`。
- 读时：`server-plugin/kernel/dimensions.mjs` 只消费加载器交下的 `t.derived`；`t.unbuilt` 命中的派生维度抛 `E-MOD-RX`；`reverseIndex` 维度读加载器索引，无行指向返回冻结空数组，`Fact.source` 为 `index`。
- 数据：`world/ontology/dimensions/material.json` 的 `producedBy` 删 `derived`、加 `reverseIndex`；五处未建派生留原文并登记。
- 测试（`tests/kernel/dimensions.test.mjs`、`tests/kernel/material.test.mjs`）：登记跳过、未登记报错、运行期抛码、双向核、反查索引夹具、真实世界 `loadWorld` 通过、未建登记恰五项、`mat_coke.producedBy = ['reaction_char']`、`mat_oak.producedBy = []`、读 `hardness` 抛 E-MOD-RX。

## 接主线（B2-W3 接到 origin/master 4-4a）

- `git fetch origin && git rebase origin/master`：本分支 10 个提交接到 95084d4a（4-4a 已合）之后；冲突只在两个文件，无第三个。
- `server-plugin/kernel/load/world.mjs`：两边功能都保留，逐段合——主线的 `_distributions.json` 冻结表读入与 `installExpTable`/`installSampleDistributions` 装配、`installFixedConstants` 的 fixedLn 常数与 LN2（:18–:19、:51–:69），加本分支的 `unbuiltDerived: '_unbuilt-derived.json'` 布局键（:27–:29）与 `unbuilt` 源读入（:78）。头部注释两边合并为"派生编译与环已在 L1，relation 闭包与作用域收集仍未建"（:121–:122）。
- `tools/accept/criteria.json`：rebase 中按卡文取主线一侧（`--ours`），rebase 完成后经 `node tools/accept/register.mjs` 重盖 8 个受影响类别，各 rev 加一并追加一条修订记录（排在 4-4a 记录之后）：dual_write 25→26、handfill_derived 26→27、instance_name 42→43、item_form 27→28、namelist 27→28、param_consumed 19→20、seed_sites 6→7、undeclared_io 21→22。旧修订记录（含 4-4a 的 11 条）一条未删；print 由登记器按当前检测器闭包现算，未手写。
- 重盖输入由 base（15886cd6）、主线（95084d4a）、本分支（efdf3e83）三份判据登记做三方合并后交登记器，冲突段逐类保留"4-4a 记录 + B2-W3 记录"，不经手抄旧记录。

## 提交

- `cd411620`：测试先行（未建派生登记、双向核、运行期抛码、反查索引、真实 world 清单）。
- `53e7ffd2`：实现、数据、卷二 1118k23 勘误、真实 loadWorld 通过。
- `efdf3e83`：判据指纹按入库前状态重盖一次（8 类各 rev 加一，不重复加版）。
- 接主线提交：world.mjs 冲突随原提交按两边保留解决；criteria.json 经登记器重盖；本回报追加"接主线"一节并更新自查表第 6、7 项。

## 验收命令与末行

- `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 549 / ℹ pass 549 / ℹ fail 0`
- `node tools/gen-det-tables.mjs --check` → `det tables up to date (4097/81/4097)`
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；components `c_const_literal.current = 0`、`c_text_kernel_1/3/4.current = 0`
- 判据指纹：`tools/accept/criteria.json` 经 `tools/accept/register.mjs` 重盖（8 类 rev 加一、追加修订记录，旧记录全留）。

## 只核（DeepSeek，11-18；只读，不改代码）

只核原文 `docs/审查/B2-W3-DS只核2-1118.md`。**结论：可封**，无必须改；两条拿不准与五条记账不挡封。

- 裁定第 1 条四要素齐全：`_unbuilt-derived.json` 四字段五条；`dimensions-validate.mjs:232–:250` 登记跳过、`:246` 未登记报错、`dimensions.mjs:167–:172` 运行期抛 `E-MOD-RX`；双向核四码均新勘误 §1.12 :389 写明。
- 上一轮四条必须改均已落实：本表编译范围（`dimensions-validate.mjs:207–:227`）、map 派生拒收（`:151、:216–:218`）、回报事实与 442 行、加载期编译（`:124–:129、:253–:272`）。
- 反查索引整类：`buildReverseIndexes:281–:323` 只按 `.reverseIndex` 表头建索引，无 `producedBy` 特判；读入口 `dimensions.mjs:159–:164` 返回 `source:'index'`、空集冻结 `[]`。
- 勘误手续照 k20：勘误前快照与勘误前正文逐字节相同，现行快照与勘误后正文逐字节相同，只多 4 行（§1.1 :40、§1.12 :389–:390、附录 :3163），版本仍第十七版。
- 实跑：`node --test tests/kernel/dimensions.test.mjs` 28/28；`tests/kernel/material.test.mjs` 26/26（含真实 `loadWorld`）；全量 534/534；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`（3 条已知 fail）。
- 拿不准：`CARD_CODE_RE` 只收小写、项目卡号有大写（排期填真卡号前请定）；`categories` 按卷三乙 :327/:571/:678 是加载期一次分类，归未建登记是按裁定第 3 条挂账，请确认。
- 封卡前请补：`docs/问题.md:297–:298` 按裁定第 5 条标已裁定；`efdf3e83` 删了同卡内重复 rev 记录，请确认 R12-11.11 口径。
