# 卡回报 ds-b5-5（块 5 第 5-5 张《效果族表与 effects()》）

## 交卷前自查（卡头第三节八项）

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷二 :1456（效果族 = 一行数据、不写 handler）、:1479（字段类型、`op` 取 primitives.json、`consent.mode` 封闭枚举）、:1480（effectCall 的 params 键须在族 params 声明内、值在 domain 内，E-EFF-PARAM；params 每行必写，无参数写 `{}`）、:1482（`effects(engine,state,familyId,ctx)` 纯函数、返回输出清单）、:1491（校验项）、:1507（L2 码）、:1579（E-EFF-* 码表）、:581（kernelApi 行）；体检块5 K5-32、K5-46、K5-06；对照表 #32–#36。 |
| 2 | 没有按 id/名字/场景写特例 | 是 | `server-plugin/kernel/effects.mjs`、`validate/effects-validate.mjs` 不含任何族 id、原语名；输出种类只经 `T.code_enum.eff_output` 句柄与 markers.mjs 的字段表。 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | `tests/kernel/effects.test.mjs`：params 缺写/null/空数组、domain 倒置/缺端/非有限、`[0,0]`；调用参数 -1、101、NaN、字串 '50'、边界 0 与 100；cooldownDays -1 与 1.5；原语目录不交或为空时原语输出一律拒；consent 缺 power 键。 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望值按公式手算（mass=80、param_potency=50 → magnitude 40，修正值 4，delta -40，耗费 20）；族行全是测试内造的夹具；生产表只断言为空表。 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 门禁命中（常量字面量、字串比较、regex）全部靠把字段名表、必填表、输出种类字段表放进定义源 `handles/markers.mjs` 并引用消除，没有改写本来允许的写法；`new RegExp` 一处在 validate 文件里（拆后缀）。 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 卡文列表内文件之外的都是完成本卡必需的普通接点（AGENTS.md 授权，已在此逐项说明）；diff 619 增 39 删（含新文件，不含本回报）。接点：`server-plugin/kernel/handles/markers.mjs`（效果族标记导出，定义源只此一处）、`server-plugin/kernel/load/world.mjs`（读 primitives.json 交校验）、`server-plugin/kernel/validate/dimensions-validate.mjs`（接点）、`tests/accept/temp-repo.mjs`（门禁临时仓库须复制新 import 的 effects-validate.mjs，否则判据指纹对不上，14 个门禁测试挂）、`tools/accept/criteria.json`（经登记器重盖 17 类判据指纹，rev+1 带修订记录）。 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 680`、`ℹ pass 680`、`ℹ fail 0`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`（4 条 fail 项与基线同：A12-4.5、S12-2、S12-3、A6-1.1.a，非本卡）。 |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 法术、神迹、怪物能力以后只加一行族数据即可求值，菜单竖切片的"使用/施法"不必写 handler；未写死、未特判、未造桩，生产表不造行。 |

## 改了什么

- 新建 `world/ontology/dimensions/_effects.json`：空表 `{}`。卷二 :1493 收录的别卷族（eff_take_up、eff_seal_item 等）行字段以登记卷为准，登记卷未落真实行，故不造行（挂卡：卷十四 §5.1、卷三乙 §4.15.5、卷七 §2.5 等落行时填入）。
- 新建 `server-plugin/kernel/validate/effects-validate.mjs`：加载期族行校验（L2）。params 每行必写（缺写、非表 E-EFF-PARAM）、参数代号在词表 parameter 族、单位已登记、域 [lo,hi] 有限且 lo<=hi；targetSelector.scope 封闭枚举（E-DIM-DOMAIN-ENUM）；consent.mode/power（E-EFF-CONSENT）；RX 逐条编译（E-EFF-RX，未登记命名空间保持 E-RX-NS-UNKNOWN）；outputs 种类封闭枚举与字段（E-EFF-OUTPUT）；modifier 目标须是已登记可修正数值维度（E-MOD-KEY-UNREGISTERED）、stage 枚举（E-MOD-STAGE）；primitive 的 op 在原语目录、参数名在该原语契约内（E-EFF-PRIMITIVE，目录未交即一律拒）；event 的 verb 在词表 verb 族（E-EVT-VERB）。
- 新建 `server-plugin/kernel/effects.mjs`：`effects(engine,state,familyId,ctx)` 纯函数；校验调用参数（E-EFF-PARAM）、族未知 E-EFF-FAMILY-UNKNOWN；返回 `{family, magnitude, targetSelector, requirement, consent, cost, cooldownDays, outputs}`，outputs 里 `<名>RX` 换成求值后的 `<名>`、`paramsRX` 换成 `params`。
- 改 `dimensions-validate.mjs`（接点，结果挂 report.effects）、`load/world.mjs`（读 world/ontology/primitives.json，不存在则不交）、`handles/markers.mjs`、`files.json`、`state-owners.json`（kernelApi 加 `kernel/effects.mjs#effects` 一行，照卷二 :581）。

## 偏离卡文处与未解决

1. 卷二 :1479 写 verb 在 verbs.json，现行动词是词表 `verb` 族（events.mjs 同取该族，旧 verbs.json 无前缀、非本体），按词表 verb 族校验；请李白确认或补勘误。
2. effects() 返回对象而不只是"输出清单"：卷九单入口要核 consent、cost、selector，一并交出；调用方给 `ctx.params`、`ctx.dims`（基值）、`ctx.nsReads`（命名空间读数，调用内只读同一份）。`magnitude` 与各声明参数作为 RX 变量读（按维度键机制，不新增 RX 文法）。
3. 部分项挂卡：`requirement` 只核代号在词表 requirement 族，需求块本体（§1.13）随其表核；status 输出的 `apply` 只核代号已登记（状态表未建）；primitive 输出的 id 型参数（from/to 等账户）无法用 RX 表达（RX 数据档无实体 id 变体），卷文 :1469–:1472 示例写 `source.id` 属占位，等李白裁定 ctx 绑定 id 的办法；spawn 输出卷文未定字段，只核 RX 字段可编译。
4. 执行者直接 `node` 跑了一个仓库外的临时脚本（F:/dnd-tmp/make-reg-input.mjs，只生成登记器交行文件，不写 criteria.json）来给 17 类判据升版；criteria.json 本身由 `tools/accept/register.mjs` 盖。另有两次误用 heredoc 命令（生成空文件，已删，无实际内容）。
5. 已接主线 5-3b（rebase 无冲突，pre_commit 仍 pass，无需重盖判据）。

## 部分与挂卡

- effectCall 加载期核对（卷二 :1480、:1492：引用族的 params 键须在族声明内、值在 domain 内）本卡只在 effects() 调用期核；加载期核对挂各引用方表落卡（item useEffects、knowledge effectRef、species specialAttacks、deity miracles、facility_type serviceEffects、event_type/status stages，块 6/7 各实体表卡），引用方表未建。

## 报李白

五处已按李白 11-19 10:4x 裁定 ②a–e 落实：返回照 outputs 声明逐条（数组）；命名空间读数由调用方预取冻结传入，effects() 只取本族 RX 引用到的键；效果族 outputs 的 target 未注册报 E-EFF-OUTPUT；勘误 1118k29 已写卷二（:1479、:1482、:1507、附录一行，快照与现行 cmp 一致）；primitive 输出 id 型参数只认 `idParams` 的 `target` 与 `ctx.<登记字段>` 两种来源，给不出加载拒 E-EFF-PARAM。

e 项涉及的族/原语清单：生产 `_effects.json` 是空表，当前没有任何族被拒。规则作用于所有带 id 型参数的原语（按 world/ontology/primitives.json 现行目录，required 内含 id 型参数的有 transfer 的 from/to 为 account 型不计，vital.target、fact.set.entity、move 无、destroy.entity、transition.entity 等；oneOf 组含 id 的有 holding.close、holding.transfer）：以后任何族写这些原语，必须写 idParams。另：登记卷写明的 ctx 字段现无登记（effectCtxFields 空），第二种来源暂不可用，请李白指定哪卷登记。
