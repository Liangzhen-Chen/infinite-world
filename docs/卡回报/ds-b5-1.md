# 卡回报：ds-b5-1《原语契约与执行器骨架》

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 见下「只核修改轮（2026-11-19）」与「只核第二轮改轮（2026-11-19）」：卷九 :633（`shares` map<id, number>）／:653／:658／:659／:661／:663／:707、卷二 §1.9 :285、§2.7 :790、§2.6 :499–:503、卷二 :2901；`kernel/transaction.mjs:94`／`:163`、`kernel/scheduler.mjs:599`／`:654`；卷二十 :483 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 契约按字段类型记号（`account`／`dimension`／`shares`）分开校（`server-plugin/primitives-runtime.mjs:27–28`、`:104–:121`），无实体 id、文件名、场景分支；`shares` 键整类按 `isCode` 校（`:135`），R9-2.7 未按任何单 id 特判（未建，记「部分」） |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | `tests/kernel/primitives-runtime.test.mjs`「特殊值不留绕过口子」qty 0／−1、空串、null、空 cause；「代号文法」大写、单字符、点分段、账户少一段、维度键下划线与前导大写，均 `E-ACT-PRIMITIVE`；「shares 键按 id 文法校」空键、非 ASCII 键、49 字符键均 `E-ACT-PRIMITIVE`；「文法总长上限经 engine.rules 读」缺键、0、−1、非整数、空 rules 都报 `E-DIM-STRUCT-FIELD`（不回落默认） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 余额按三元键手算 `10−3=7`、`0+3=3`；文法边界照卷二 §1.9 :285 的 `{1,47}`／`{0,47}` 手算成总长 48 过、49 拒（含 `shares` 键）；目录 20 行 15 族照卷九 :625 手写 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 未改任何允许写法；48 字符上限登记为 `kernelConstants.grammarMaxLength`（`world/rules/tables/kernel-constants.json`、`world/rules/registry.json`），执行器经 `engine.rules` 读（`primitives-runtime.mjs:91–:97`／`:241`），规则层无裸数值；`c_const_literal` 0 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 本轮 3 文件、63 insertions(+)/11 deletions(-)（含本回报）：`server-plugin/primitives-runtime.mjs`、`tests/kernel/primitives-runtime.test.mjs`、本回报 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 608` / `ℹ pass 608` / `ℹ fail 0`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`、`c_const_literal current 0` |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 执行器改为在调用方（`resolve()` 提交段／推进钩子调度方）已开的内核事务里执行、不再自开事务、不再 import 表外 `T`，契约校验按字段类型与 id 键文法分开；玩家行动的统一提交面更接近块 6 可接线状态。未写死、未特判、未跳过规则引擎 |

## 只核修改轮（2026-11-19，照 docs/审查/5-1-DS只核-1118.md 改）

### 逐条落点

1. **事务（必须改 2、拿不准 7 合看）——已改：执行器不自开事务，跑在调用方已开的内核事务里。**
   - 证据：卷九 §4.2.2 :653「执行器归规则层……只由 `resolve()` 的提交段与推进钩子的调度方调用」；R9-2.3 :658「在一次内核事务里逐个交给对应通道的适配器」；R9-3.1 :707 `commit` 段「执行器一次事务」；`kernel/transaction.mjs:94` 原文「kernel 组内用，不在 kernelApi」；卷二 §2.7 :790「规则层 import kernel 只经 kernelApi 中 callers 含 rules 的条目」；`kernel/scheduler.mjs:599`／`:654` 每个推进项都在 `runTransaction` 里跑，`submitProposal`（`transaction.mjs:163`）把提案处理包在 `runTransaction` 里。
   - 结论：规则层不能调 `runTransaction`，执行器只能跑在调用方事务里；「一次 execute 一次事务」由调用方事务保证。已删 `import { runTransaction }`、`TX_FILE` 与 `state-owners.json` 的 `runTransaction` 行（`:115`）；`execute` 不再 catch，适配器拒绝即抛出，由调用方事务整笔回滚。测试改写为「execute 不自开事务：事务外调用被账本拒写，事务内随调用方提交或回滚」。
2. **`T` import（必须改 1）——已改：不再 import 表外 `T`，类型记号取契约数据自身的字符串。**
   - 证据：卷二 §2.7 :790／:782（表外 import 即 `E-VIEW-INPUT-IMPORT`）；`kernel/handles/markers.mjs#T` 不在 `state-owners.json` 的 kernelApi。`CATALOG` 里 `T.type.enum`／`T.type.number` 改为数据里本来就有的 `'enum'`／`'number'`；`TYPE_CHECK` 改用标识符键；原 `carriesStringType` 的 `T.type.string` 比较改为「契约各位置出现的类型记号必须是执行器认识的类型表（`TYPE_CHECK` 的键），`string` 不在表内」（`primitives-runtime.mjs` 的 `specTokens`／`unknownSpecType`）。
3. **R9-2.5／R9-2.7（必须改 3）——记「部分」并挂卡，不留白。**
   - R9-2.5 `fact.set` 目标核对：**部分、挂「卷二 §2.7 维度写者声明落卡」＋对应实体表建表卡（块 6／7）**。卷九 :661 要求「某张维度表里登记的非文字维度，并且该维度的写者声明允许经执行器写」。现状：维度表只建成 `world/ontology/dimensions/material.json` 一张（item／person／place 等在块 6／7）；「允许经执行器写」是卷文明说尚未建的新声明——卷二 :2901「`tissueDelta`、`aetherStored`『声明允许经执行器 `fact.set` 写』——本卷没有这种声明，属新声明，机制」。规则层也没有「查维度登记与写者声明」的 kernelApi 读入口（只有 `dim()` 读值）。不造桩、不按维度名特判。
   - R9-2.7 `create`／`destroy` 守恒配对：**部分、挂 5-4（`destroy` 适配器与终止写者）＋卷二 §2.6 实体创建卡（块 6／7）；源汇账户的表达另报主会话/李白。** 现状：`create`／`destroy` 的目标写者未建（本卡按 `E-ACT-WRITER-NOT-READY` 拒收）；「涉及实物時」要判实体类别，而实体表只建成 material 一张；R9-2.7 说「指向登记源汇账户的 `transfer`」，但原语 `transfer` 契约只有 `from`／`to` 账户 id（卷九 :629），而卷六的源／汇是 `post` 的 `flow` 腿代号（`ledger.mjs:494–:504`），不是账户持有人，现有 `transfer` 契约表达不了「指向登记源汇」。须先由卷六／卷九对齐这一表达，未自编。
4. **代号文法（必须改 4）——已改可落部分；48 字符上限记「等主会话/李白」。**
   - 已改：按字段类型分开校——实体 id（`id`）单段 CODE、账户 id（`account`，transfer 的 `from`／`to`）恰四段 CODE、类别 id／枚举值（`ref`／`enum`）CODE、维度键（`dimension`，`fact.set.field`）KEY；CODE 至少 2 字符、KEY 至少 1 字符；大写、单字符、点分段、账户少一段、维度键下划线／前导大写都拒（`primitives-runtime.mjs:80–:121`；测试「代号文法按字段类型分开校」）。`primitives.json` 同步：`transfer.from`／`to` 由 `id` 改 `account`、`fact.set.field` 由 `ref` 改 `dimension`。
   - **48 字符上限：未落，等主会话/李白。** 理由（实测）：规则层写 `2`／`48` 数值字面量被 S10 `const_literal` 门禁拒（本机 `node tools/accept/run.mjs pre_commit` 实测 `c_const_literal current 2`）；把上限登记成规则表常数要改 `world/rules/registry.json` 与 `world/rules/tables/kernel-constants.json`，两文件不在本卡文件清单，且 `registry.json` 是共用独占文件；加 kernelApi 文法条目（`CODE_RE`／`KEY_RE`）是闭集变动，须卷二条目或李白裁定。两条路都超出本卡授权，未造假常量、未改测试过关。当前两道文法均不设上限，`a+b.repeat(47)`（48 字符）照卷文形状收下并走到适配器。
5. **目录加载期校验（必须改 5）——部分、挂加载器卡。**
   - `checkPrimitiveCatalog` 已导出并由测试调用；接进加载器要改 `server-plugin/kernel/load/world.mjs`（读 `world/ontology/primitives.json` 并调它），该文件不在本卡清单，记「部分、挂加载器卡（统一加载器的收尾接点，建议随 5-7 块验收与整合接线）」。测试补了反向用例（`string` 类型、行数不符、旧格式字段都拒）。
6. **`sys.ai_interface` 系统行（拿不准 8）——部分、挂块 6 卡。**
   - 卷二 §2.7 :778–:781 要求每个系统行必写 `entryCallerFiles` 与 `entryJudges`；`sys.ai_interface` 的 writers／view／predicates 来自卷九动作管线（`activity.mjs`、`npc-agenda.mjs`、`open-actions.mjs` 等），本基线未建（块 6），无可填的真值。未造空行假数据，记「部分、挂块 6 动作管线卡」。
7. **`schedule`（拿不准 6）——不建，等李白裁定。**
   - 卷九 :457 `due_scheduled` 行：「原语 `schedule` 写入到期堆的项……契约只有绝对时刻 `at` 与 `action` 或 `rule`，没有种类字段」；:644 契约行同。卷二十 :483 `struct:dueItem = {dueMinute, kind, owner: EntityId, ref: Handle, registeredMinute}`。契约缺 `owner`／`ref`／`registeredMinute`／`kind` 的来源，卷文推不出，按卡头规矩不编造。

### 已定（技术问题自定，写理由）

- **已定：执行器不自开事务，跑在调用方事务里。** 理由见第 1 条：`runTransaction` 是 kernel 组内用、不在 kernelApi，规则层不可 import；推进钩子调度方与 `submitProposal` 都已把处理包在事务里。
- **已定：契约类型记号 `account`（账户 id）与 `dimension`（维度键）。** 理由：`id` 字段里 transfer 的 `from`／`to` 是 `holder.purpose.kind.key` 账户 id，其余 `id` 是单段实体 id；`fact.set.field` 是维度键，文法与实体 id 不同（卷二 §1.9 :285）。不区分就会把 `id:'a.b'` 放行、把 camelCase 维度键误拒。类型记号是执行器对卷九 :629／:636 字段语义的细化，`primitives.json` 同步改。
- **已定：`string` 类型改用「类型记号须在 `TYPE_CHECK` 键内」判定。** 理由：`TYPE_CHECK` 无 `string` 键，任何 `string` 记号即报；不写字面量比较，也不为一条检查造新设施。

### 测试末行（本机 F 盘；不推进世界的小检查）

```
node --test tests/kernel/primitives-runtime.test.mjs
ℹ tests 11
ℹ pass 11
ℹ fail 0

node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs
ℹ tests 606
ℹ pass 606
ℹ fail 0

node tools/accept/run.mjs pre_commit
"verdict": "pass"

git diff --stat（不含本回报）
4 files changed, 137 insertions(+), 66 deletions(-)
```

## 卷文原句（照卡头规矩摘出）

- 卷九 :625：「原语目录（`world/ontology/primitives.json`，封闭，设计目录 20 个、15 族：现役 19 个、14 族，另加转化原语 `transform`……每个原语一份参数契约，字段全部是代号、id、数值」。
- 卷九 :653：「写：`execute(engine, state, primitives, cause)`，执行器归规则层，文件 `server-plugin/primitives-runtime.mjs`，入口 `execute`；只由 `resolve()` 的提交段与推进钩子的调度方调用……读：`primitiveContract(op)`。效果族求值调卷二 §3.9 的 `effects()`，本卷不重写。」
- 卷九 R9-2.3 :658：「`execute` 先逐个按契约校验（不合即 E-ACT-PRIMITIVE，整批不执行），再按“原语在目录中的固定序、同原语按列表下标”排定次序，在一次内核事务里逐个交给对应通道的适配器；任一适配器拒绝则整批回滚。」
- 卷九 R9-2.4 :659：「每个原语一个适配器。适配器里没有实体 id、没有按类别名写的分支；领域差别只来自参数与目标写者。」
- 卷九 R9-2.5 :660：「原语参数的类型是卷二 §1.5 里除 `string` 之外的类型。」
- 卷九 :408／:410：`E-ACT-PRIMITIVE`「原语不在封闭目录或参数不合契约」；`E-ACT-WRITER-NOT-READY`「原语适配器或其目标写者尚未上线」。
- 李白 11-18 22:10 五.1：执行器归规则层，`server-plugin/primitives-runtime.mjs`、入口 `execute`，kernelApi 不登执行器；五.2：`emit`／`learn`／`transform` 遇到即整笔拒收；丙6：只建目标写者已存在的适配器，其余按 `E-ACT-WRITER-NOT-READY` 拒收；丙7：块 5 期间带 record 的边关闭整笔拒收；丙8：`primitives.json` 同路径改写；丙9：新码含义。
- 卷九 §4.2.1 :628–:646：20 行原语的必填字段与类型（逐行抄进 `CATALOG` 与 `primitives.json`）。

## 已建适配器

- `transfer` → `kernel/ledger.mjs#transfer`（写者现已在基线）。原语 `from`、`to` 是账户 id，适配器按 `holder.purpose.kind.key` 拆成账本三元键与资源，`qty` 原样给，`reason` 取 `execute` 的 `cause`。

## 拒收原语清单与挂卡（19 个，均 `E-ACT-WRITER-NOT-READY`）

| 原语 | 为什么现在拒收 | 挂到 |
|---|---|---|
| `emit` | 事件写载体与 `perceiveEvent` 未建（五.2） | 块 6 第一张建地点/感知的卡（第 6 块验收前必须完成） |
| `learn` | 卷十四 `gainSkill` 未建（五.2） | 卷十四首卡（块 7） |
| `transform` | 卷十六 `proposeTransform` 未建（五.2） | 卷十六首卡（块 7） |
| `holding.open`／`holding.close`／`holding.transfer`／`holding.rescale` | 持有写者 `kernel/holdings.mjs` 未建 | 5-3 持有写者 |
| `destroy` | `kernel/terminate.mjs` 未建 | 5-4 终止与复生 |
| `obligation.create`／`obligation.settle`／`obligation.cancel` | 合同状态机写者未建 | 卷六 §4.16 合同卡（块 6／7） |
| `fact.set` | 目标维度写者未建 | 卷二 §2.7 对应系统行落卡（块 6／7） |
| `vital` | 身体量写者未建 | 卷二十一 §4.1 首卡（块 7） |
| `status` | `status.mjs` 未建 | 状态容器卡（块 6／7） |
| `move` | `position.mjs` 未建 | 卷十七首卡（块 7） |
| `create` | 实体创建写者／`mark-actions.mjs` 未建 | 卷二 §2.6 实体创建卡（块 6／7） |
| `schedule` | 写者 `kernel/scheduler.mjs#schedule` 已在，但卷九 :644 只给 `at` 与 `action`／`rule`，未写到期项 `owner`／`ref` 的来源；卷文推不出，按卡头规矩不编造 | 卷二十首卡（块 7）补映射后建 |
| `transition` | 各状态机写入口未建 | 各领域卷首卡（块 6／7） |
| `time` | 世界时钟推进入口（`advance` 的来源参数）未定 | 卷二十首卡（块 7） |

另：丙7「带 record 的边关闭」属 `holding.close` 的后续语义，随 5-3／卷十八首卡（块 7），本卡在 `holding` 整族拒收时已覆盖。

## “部分”三项（如实记，不写成通过）

1. **R9-2.3「成功后恰产出一条以本事务原语为 `primitives` 的事件」**：事件写入口归 5-2，本卡只留调用面（`execute` 成功后返回 `{ok:true}`），该半边记“部分”。
2. **卷九 :653「效果族求值调 `effects()`」**：效果族表与 `effects()` 归 5-5，本卡不写，记“部分”。
3. **A9-2.1 适配器文件扫描**：只建了 `transfer` 一个适配器，扫描覆盖“已建部分”；其余原语按上表拒收，记“部分”。

## 已定事项（技术问题自定，写理由）

- **已定：`transfer` 的 `from`／`to` 取账户 id（`holder.purpose.kind.key`）。** 理由：卷九 :644 只给 `from`、`to`、`qty`，而 §4.2.5 数据实例说 transfer 搬的是“钱”“货”，账户（卷六 §4.1 规则 1）包含资源；不另加 `resource` 字段（旧格式字段已删），由账户 id 拆出三元键与资源，资源不同的两账户即契约不合。
- **（已被只核改轮取代，见上文第 1 条与"已定：执行器不自开事务"；现码不自开事务、kernelApi 无新增。主会话合入时标注，Sonnet 终核 1119 要求）** 首版原写：**已定：`execute` 自开一次内核事务，kernelApi 增 `kernel/transaction.mjs#runTransaction`（callers `rules`，acceptsState 真），不登执行器。** 理由：R9-2.3 要求“在一次内核事务里”，R9-3.1 `commit` 段写“执行器一次事务”，体检 docs/迁移体检/块5.md 选项 B 写“执行器经 kernelApi 调 transaction／storage／ledger”；五.1 只禁“登执行器”，未禁事务入口。此处是新增的 kernelApi 接点，建议复核重点看。
- **已定：`schedule` 本卡不建适配器。** 理由见上表：契约到 `due` 项的 `owner`／`ref` 映射卷文未写，按“卷文推不出就停下”不编造。
- **已定：契约数据在代码 `CATALOG`（可执行唯一一份）与世界侧 `primitives.json`（按卷九改写）两处，卡内测试逐行比对防漂移。** 理由：规则层不能读 `world/` 文件（卷二 §2.7 import 矩阵规则层无 `node:fs`），而加载器读 `primitives.json` 的接点不在本卡文件清单内；`checkPrimitiveCatalog` 做逐行 canonical 比对，任一处改动不同步即测试失败。
- **`server-plugin/kernel/files.json` 未改。** 理由：执行器与适配器都在规则层（`server-plugin/primitives-runtime.mjs`），`files.json` 只列 `kernel/` 下的文件。

## 复核

本卡属内核／跨卷，按 CLAUDE.md 分档与卡文要求，DeepSeek 只核后交另一个 Sonnet 中档终核（≤2 轮）；复核原文入库 `docs/审查/` 后由主会话把路径写进提交说明。

## 验收命令与末行

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ pass 604` / `ℹ fail 0`。
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`。

## 只核（DeepSeek，2026-11-18）

- 只核原文：`docs/审查/5-1-DS只核-1118.md`。
- 结论：**必须改** 5 条——`T` import 是 kernelApi 表外（E-VIEW-INPUT-IMPORT）；`runTransaction` 无卷二 §2.7 条目；R9-2.5 的 `fact.set` 核对与 R9-2.7 的守恒配对未实现且未记“部分”；代号文法无 48 字符上限、比卷二 §1.9 宽；K5-12 的加载期封闭校验只由测试调用、未接加载器。
- 拿不准 3 条报主会话/李白——`schedule` 不建适配器的理由成立但丙6 点名，处置宜报裁定；`execute` 自开事务与现内核 `submitProposal`／调度器事务包裹的嵌套风险（块 6 接线时核）；`sys.ai_interface` 系统行未补（K5-52/K5-60 执行器半）。
- 测试复跑：5-1 `tests 9 / pass 9 / fail 0`；全量 `tests 604 / pass 604 / fail 0`。
- `node tools/accept/run.mjs pre_commit` 未复跑，本只核不据它下结论。

## 只核修改轮二（2026-11-19，48 字符上限落成登记常数）

### 卷文原句

- 卷二 §1.9 :285：「**代号**：实体 id、类别 id、枚举值 `^[a-z][a-z0-9_]{1,47}$`；维度键与 struct 字段名 `^[a-z][a-zA-Z0-9]{0,47}$`。」——尾段 `{1,47}`／`{0,47}`，总长至多 48。
- 卷二 §7 S10 :2404：数值来自 `engine.rules` 即不计（登记豁免口径；先例 `kernelConstants.diceKeyMaxQualifiers`、`handleRadix`）。

### 落点

- 先查现有定义：这两条上限的单一定义在 `server-plugin/kernel/validate/types.mjs:11–12` 的 `CODE_RE`／`KEY_RE`（内核组），不在 `world/ontology/state-owners.json` 的 kernelApi，规则层读不到，卡文也不许给 kernelApi 加行；kernel-constants 现有键无表达此上限者。故新登一个常数 `grammarMaxLength`（两条文法上限同值，一条登记，不按文法分叉）。
- 登记：`world/rules/tables/kernel-constants.json` 增 `{"key":"grammarMaxLength","value":48,...}`（basis「卷二 :285 代号与键文法长度上限」）；`world/rules/registry.json` 的 kernelConstants 行补 `type` integer、`domain` [1,null]、`packOverridable` false，volume 补 §1.9 :285。
- 执行器：`server-plugin/primitives-runtime.mjs:85` 记表代号与键；`:91–:97` 读 `engine.rules.kernelConstants.grammarMaxLength`，缺键、非正整数抛 `E-DIM-STRUCT-FIELD`（不回落默认）；`:100–:121` CODE／KEY／账户每段统一按总长判；`:138–:144`、`:176–:192`、`:209–:211`、`:241–:248` 把上限传进契约校验与适配器。规则层无 48 字面量。
- 测试：`tests/kernel/primitives-runtime.test.mjs` 的「代号文法按字段类型分开校」补 48/49 边界（实体 id、类别 id、账户段、维度键：总长 48 过、49 拒 `E-ACT-PRIMITIVE`）；新增「文法总长上限经 engine.rules 读」覆盖缺键、0、−1、非整数、空 rules，全部 `E-DIM-STRUCT-FIELD`。

### 未改的部分（照上一轮不变）

- R9-2.5 `fact.set` 目标核对：部分，挂「卷二 §2.7 维度写者声明落卡」＋实体表建表卡。
- R9-2.7 `create`／`destroy` 守恒配对：部分，挂 5-4 与卷二 §2.6 实体创建卡；已裁（李白 11-19 00:20，勘误 1118k26）：规则已改为 `create`／`destroy` 由写者同事务经账本 post 源汇腿；规则已改、码待 5-4／实体创建卡；5-1 代码行为不变（仍按 `E-ACT-WRITER-NOT-READY` 拒收）。
- `checkPrimitiveCatalog` 接加载器：部分，挂加载器卡。
- `sys.ai_interface` 系统行：部分，挂块 6 动作管线卡。
- `schedule`：已裁（李白 11-19 00:20，勘误 1118k26：卷九 §4.2.1 补 `schedule` 原语整类映射——`kind` 恒 `due_scheduled`、`dueMinute = at`、`owner` 取提案行动者、`ref` 取待执行项记录句柄）；落码挂块 6 首张 AI 定时动作卡前；5-1 代码行为不变（仍按 `E-ACT-WRITER-NOT-READY` 拒收）。

### 测试末行（本机 F 盘；不推进世界的小检查）

```
node --test tests/kernel/primitives-runtime.test.mjs
ℹ tests 12
ℹ pass 12
ℹ fail 0

node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs
ℹ tests 607
ℹ pass 607
ℹ fail 0

node tools/accept/run.mjs pre_commit
"c_const_literal": { "b0": 0, "current": 0, "diff": 0, "last": 0 }
"verdict": "pass"

git diff --stat（不含本回报）
4 files changed, 78 insertions(+), 35 deletions(-)
```

## 只核第二轮（DeepSeek，2026-11-19）

- 只核原文：`docs/审查/5-1-DS只核2-1119.md`。
- 核查提交：`90991d7a`、`164669eb`（HEAD）。
- 复跑：`node --test tests/kernel/primitives-runtime.test.mjs` → `tests 12 / pass 12 / fail 0`；`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `tests 607 / pass 607 / fail 0`；`node tools/accept/run.mjs pre_commit` → `c_const_literal current 0`、`verdict pass`。
- 结论：**必须改** 1 条代码（`holding.rescale.shares` 的键未按 id 文法校；与第一轮第 4 条同类，`tests/kernel/primitives-runtime.test.mjs` 无 shares 键用例），1 条文档口径（本回报 R9-2.7／schedule 两行仍写「等李白裁定」；00:20 裁定与勘误 1118k26 已在 origin/master 落地，应改「已裁、码待卡／落码挂块 6 前卡」）。
- 五条复核：第一轮第 1、2 条落实；第 3 条标量字段与 48 上限落实；第 4、5 条按部分／挂卡记录（除 shares 键）。详见只核原文。

## 只核第二轮改轮（2026-11-19，照 docs/审查/5-1-DS只核2-1119.md 改）

### 卷文原句

- 卷九 :633：「`holding.rescale`｜`holdingKind`、`subject`，`shares`（map<id, number>）」——`shares` 的键是实体 id。
- 卷九 R9-2.3 :658：「执行器先逐个按契约校验（不合即 E-ACT-PRIMITIVE，整批不执行）」。
- 卷二 §1.9 :285：「实体 id、类别 id、枚举值 `^[a-z][a-z0-9_]{1,47}$`」——实体 id 键按 CODE 文法、总长至多 48（上轮已登记 `kernelConstants.grammarMaxLength`）。

### 落点

- 代码：`server-plugin/primitives-runtime.mjs` 的 `TYPE_CHECK.shares` 由只查值改为键值两边都查——`Object.keys(v).every((k) => isCode(k, maxLength))` 复用已有 `isCode` 与登记常数，不另写正则、不加数字；值仍按 `number` 有限数校。空键、非 ASCII 键、49 字符键在 `checkContract` 报 `E-ACT-PRIMITIVE`，48 字符合法键过契约后因 `holding` 写者未上线报 `E-ACT-WRITER-NOT-READY`。
- 整类 grep：执行器契约（`CATALOG`／`world/ontology/primitives.json`）里的容器类型参数只有两处——`holding.rescale.shares`（`map<id, number>`，本轮改）与 `create.facts`（卷九 :640 只写「`facts`（map）」，未写键的类型，非 id）；无 `list`／`set` 类型参数。故按 id 文法的整类覆盖即 `shares`，未给 `facts` 自编键文法。
- 测试先行：新增 `tests/kernel/primitives-runtime.test.mjs`「holding.rescale 的 shares 键按 id 文法校」——先跑见失败（空键走到 `E-ACT-WRITER-NOT-READY`，未按 R9-2.3 报 `E-ACT-PRIMITIVE`），改后 13/13 通过。
- 回报口径：上节「未改的部分」的 R9-2.7 与 `schedule` 两行已按 00:20 裁定与勘误 1118k26 改写（取代上节第 3、7 条中「等李白裁定」的表述）；5-1 代码行为不变，`create`／`destroy`／`schedule` 仍按 `E-ACT-WRITER-NOT-READY` 整笔拒收。

### 测试末行（本机 F 盘；不推进世界的小检查）

```
node --test tests/kernel/primitives-runtime.test.mjs
ℹ tests 13
ℹ pass 13
ℹ fail 0

node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs
ℹ tests 608
ℹ pass 608
ℹ fail 0

node tools/accept/run.mjs pre_commit
"c_const_literal": { "b0": 0, "current": 0, "diff": 0, "last": 0 }
"verdict": "pass"
```
