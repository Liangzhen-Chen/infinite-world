# 补值卡 C 回报：李白 11-19 20:3x ②–⑥（access 次序与一般成员 entryRankMax、durability extScale、实例批次、item 字段登记、quality/wear/持有种类代号）

## 交卷前自查
| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 裁定原文 docs/审查/李白裁定-1117.md 末节"20:3x"②–⑥；卷五 §4.13.3 规则 1（:1033，"挂在祖先上的低档持有进不了后代里门槛更高的地点"）；卷三乙 :304（劣次常良优精绝）、:310（完好旧损残毁）、:1930/:1948、§4.10.5（:1409）；卷二 §1.2 :101–102、§3.3 :1408 第 6 条 |
| 2 | 没有按 id/名字/场景写特例 | 是 | ② 按持有种类行的 `membership` 列整类填（7 行）；③ 按维度声明整维读，无物品特判；⑥ 登记词表条目 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 测试对 `membership` 整类断言 entryRankMax 小于每个 needsGrant 档的 rank；durability 用损次数 0 仍拒（原用例保留） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | ③ 用例前提在临时世界里造（铁 wearResistance 60、wearPerUse 0.002、dailyUses 40），期望值手算：0.002÷60→0.00003333、×40→0.00133333、750 日→1−0.9999975=0.0000025、30000 次→0；② 测试按行字段整类判 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 无 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 共 5513 行，其中约 5300 行是两份勘误前快照整卷拷贝，实质改动约 200 行；多出的文件在"偏离"栏说明 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：tests 1057 / pass 1057 / fail 0；`node tools/accept/run.mjs pre_commit` verdict pass |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 工具磨损真能每用一次磨一点、品质与磨损档有了确定次序、穿戴与装入有了持有种类行，6-22 物品行转换与后续用损、穿戴规则有了可读的代号；④ 未写（见下），没有拿简化版顶上 |

## ② access 次序与一般成员 entryRankMax
- `_vocab.json` access 三档 public 0 < private 1 < council 2 认可，每条加 basis"设定数待调（李白 11-19 20:3x ②）"。
- 持有种类行：`membership` 为真的整类（hk_member_of、hk_household_member、hk_household_head、hk_business_member_of、hk_devotee_of、hk_citizen_of、hk_enlisted，共 7 行）改 `grantsEntry: true`、`entryRankMax: 0`（卷五 §4.13.3 规则 1 要求 grantsEntry 为真才计入 entryRankMax，E-HK-ROW-FIELDS 要求二者配套）。
- 测试 tests/kernel/holdings.test.mjs：新增"一张镇民身份进不了私宅"（对整类断言 entryRankMax 0 小于私宅、议会档 rank，hk_permit 仍够私宅档不够议会档）。`canEnter` 本身（卷五 §4.13.2）尚未实现，所以测试落在数据口径上，不是调用 canEnter。

## ③ durability extScale
- `world/ontology/dimensions/item.json` instanceDimensions.durability：`precision: 8`、`stockMode: "extScale"`。
- `kernel/item-state.mjs`：durabilityOn、wearStep（use、worn、passive）、wearCost、useWear 全程 10⁸ 标度（fixedUnits8、fixedMultiply8、除法 a×SCALE²÷b 向零截断）；自然劣化量仍按 10⁴ 标度算（D-2 例 0.9136 不变）再升标度减。
- 测试 tests/kernel/item-lots.test.mjs 新增"③ durability 声明 extScale…"：§4.10.5 铁斧，单次用损 0.00003333、一日 40 次 0.00133333、单次后耐久 0.99996667、750 日逐日磨剩 0.0000025、一次 30000 次磨到 0（10⁴ 标度下单次是 0，磨不动）。

## ④ 实例与批次：不写，列例子
先核了：`createItemInstance` 每件实例开一个新批次、数量 1（dimension-writers.mjs:150–155，post 一条 delta 1 的新批次腿），所以"一实例一批次"在**建出来那一刻**成立。但**之后**一个批次可以装多件实例：`item-lots.mjs` 的 `transferGoods` 与 `ledger.mjs` 的 `mergeLots` 对实例批次没有任何区分，`lotsUnmergeable` 只比 source / qualityTier / purports / batchTag / material / project 与 temperature / burn / leakAnchorDay，同种铁斧的实例批次这些全同，就并成一批。

具体复现（临时探针，已删，不留在仓库）：用测试夹具给 PA 建 item_inst_a、item_inst_b 两把铁斧、给 PB 建 item_inst_c 一把；`transferGoods({from: PA, to: PB, item: 'item_test_axe', qty: 2})` 的结果是 moved lot_0→lot_3、lot_1→lot_4，随后 lot_3、lot_4 都并入 PB 原有的 lot_2；结束后 PB 名下只有一个批次 lot_2，数量 3，装着三把斧。另外 `transferGoods` 按"数量"选批次（先陈后新），调用者没法指定搬哪一件实例。

所以按卡文与李白裁定④"若存在一个批次装多件实例，先别写"：没有改 createItemInstance、没有生成 `lot_<实例id>` 键、没有写转手同事务搬批次改持有边。还有一处现状：批次键由账本发（`lot_` + 按 handleRadix 的序号，审计要求序号小于 lotNext），`lot_<实例id>` 过不了审计里的序号核对，要改账本的键文法。待李白定：实例批次是否在账本层"不并、不拆、转手保键"（需让 lotsUnmergeable 认得实例批次，并让 post 接受由实例 id 确定的键）。

## ⑤ item 字段登记（勘误 1119k12）
- 卷六 §2.1 资源种类表字段加 `item` 一行（`ref item nullable`，`resfam_goods` 行必填，其余 null）；卷三乙 :1948 交互表行补写条目字段 `item`。两卷附录各加修订行（卷六一条、卷三乙第 52 条），不升版本。
- 体例：勘误前快照 `卷六-v10-勘误前-1119k12.md`、`卷三乙-v7-勘误前-1119k12.md` 与 origin/master 正文同 blob（改前 cmp 通过）；改后正文覆盖现行快照 `卷六-v10.md`、`卷三乙-v7.md`，cmp 一致。号取 1119k12（6-6 用 1119k11）。
- 代码不用改：`kernel/item-state.mjs` 的 resourceKindsOf、itemOfResource 已按条目 `item` 字段读。"待裁定"标记：docs/问题.md 第 313 行"物品→资源种类…请认可或改"可由主会话删（问题.md 不在本卡文件清单，我没动）。

## ⑥ quality、wear、持有种类
- `_vocab.json` quality 七档带 rank：awful 1、poor 2、normal 3、good 4、excellent 5、masterwork 6、legendary 7（原 quality_fine 占位删，换 quality_poor）；wear 五档 intact 0、worn 1、damaged 2、broken 3、ruined 4。
- 持有种类新增 hk_wearing（agent→thing）、hk_containing（thing→thing），列同 hk_wielding 体例（40 列）；hk_wielding 即"装备"不另立。没有"已有别名"可沿用（仓库里没有 hk_wearing / hk_containing / 装备别名），所以新建。
- rules.quality 的 unbuilt 去掉 tierCodes；rules.wear 的 unbuilt 去掉 wearKinds；rules.containers 的 unbuilt 只剩 maxNesting；registry.json 两处说明同步；basis 里更新为已定。
- 测试：holdings 数据行数 47→49；item-lots 里 quality 七档 rank、wear 五档 rank 与 unbuilt 变化的断言。

## 自定裁定
1. 一般成员类的范围取持有种类行 `membership` 为真的整类（7 行），不含 hk_resident_of（`membership` 假、domicile 真，卷十八 :568）——理由：卷五 :1033 说的是"一般成员关系"，按行字段整类填、不点名；若李白要把居住关系也算一般成员，改该行两列即可。
2. hk_containing 的端类型取 thing→thing（容器是物，内容也是物；卷三乙 K-2 :1036 容器不作账本持有人，容器内量仍记在所属持有人账户上）；hk_wearing 取 agent→thing，仿 hk_wielding；其余列仿 hk_wielding，没有自编语义字段（holdWhile、termsKeys 空）。卷十八 §4.1 的正式列值待卷十八登记时核。
3. 10⁸ 标度的除法与读出函数（fixedDivide8、fixedToNumber8）已加进 `kernel/det-math.mjs`（与既有 fixedUnits8、fixedMultiply8 同处，item-state.mjs 只引用，不本地另写）。det-math 在门禁判据代码指纹的 import 闭包里，十二类判据（const_literal、dual_write、handfill_derived、instance_name、item_form、namelist、param_consumed、registry_write、seed_sites、self_name、state_pattern、undeclared_io）已经 tools/accept/register.mjs 各升 rev 加一并写修订记录（criteria.json）。两函数只在内核内部用，未登记 kernelApi（同类 fixedMultiply8 也未登记）。
4. quality_fine 删除（卷三乙 :304 七档里没有它）；卷十四 :961 的 `minQuality: quality_fine` 引用了七档之外的代号，请卷十四跟改（我没动卷十四）。

## 偏离指令的地方
- 动了 `server-plugin/kernel/item-state.mjs`（卡文文件清单没列，但 durability 的算术就在这里，③ 必须改）、`world/rules/registry.json`、`world/rules/tables/containers.json`、`wear.json`（unbuilt 与说明同步，⑥ 要求"相应 unbuilt 条目删除"）、`tests/kernel/holdings.test.mjs`。
- 命令纪律：中途我有一次用了输出重定向（`git diff > F:/dnd-tmp/detmath.patch`）和一次 heredoc 被拦；重定向写出的 F:/dnd-tmp/detmath.patch 是临时文件，不进仓库。另外 F:/dnd-tmp/snap-1119k12.mjs 用于拷贝勘误快照（Write 写成、node 运行）。

## 未解决
- ④ 待李白裁定（见上）。
- 卷十四 :961 的 quality_fine。
- docs/问题.md 第 313、311–312、314 行对应条目（6-3 用损截 0、实例批次指针、item 字段、quality/wear）可在李白答复后由主会话清。
