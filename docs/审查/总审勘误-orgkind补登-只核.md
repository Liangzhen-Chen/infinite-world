核对标识：chk-1114-sp3（主会话派发的独立只核子代理，claude-opus-5-5 中档）；所核提交：git log 最新'nine copy rows'一条（40f988a5）与 3974a026

# 总审勘误 · orgkind 补登 · 只核

- 依据：李白 11-14 22:49 第二条②，原文"全书每个 orgkind 都有代号（缺即报 FAIL）"；20:59 通则 1，即由登记卷给出代号与全部主列。
- 所核提交：3974a026。只读，未改任何卷。脚本输出：`审查/脚本输出/总审勘误-chk-1114-sp3-脚本输出.txt`。
- 卷八以 3974a026 版本为准（主会话说明另一批正在改派系 `dissolveRX`）。我核对时，工作区卷八、`版本快照/卷八-v5.md` 与 `git show 3974a026:` 三者哈希相同（ccac7d64…），所以脚本跑的就是该提交版本。

## 一、代号与条目（核对 1）

R8-1.1 共 13 种，每种都有正式条目：

| 种类 | 代号 | 登记卷:行 | 主列 7 布尔 + memberEnds + dissolveRX + template | 模板行 |
|---|---|---|---|---|
| 国家 | `orgkind_state` | 卷八:265 | 全列 | `org_tpl_state` |
| 城镇 | `orgkind_town` | 卷八:266 | 全列 | `org_tpl_town`，带 `tenure_household` |
| 村社 | `orgkind_village` | 卷八:267 | 全列 | `org_tpl_village`，带 `tenure_common` |
| 行会 | `orgkind_guild` | 卷八:268 | 全列，沿用原代号 | `org_tpl_guild` |
| 商号 | `orgkind_firm` | 卷八:269 | 全列 | `org_tpl_firm` |
| 商队 | `orgkind_caravan` | 卷八:286 | 全列 | `org_tpl_caravan` |
| 军团 | `orgkind_army` | 卷八:287 | 全列 | `org_tpl_army` |
| 派系 | `orgkind_faction` | 卷八:288 | 全列，`internal` 真 | `org_tpl_faction` |
| 怪物族群 | `orgkind_monster_band` | 卷八:289 | 全列 | `org_tpl_monster_band`，带 `tenure_common` |
| 家户 | `orgkind_household` | 卷十八:154 | 全列 | `org_tpl_household` |
| 家族 | `orgkind_lineage` | 卷十八:155 | 全列 | `org_tpl_lineage` |
| 教团、修会 | `orgkind_cult`、`orgkind_order` | 卷七:246–251 | 原有，本次未动 | 原有 |

**主列。** 卷八:216 定义的 `orgkind` 条目字段是：

- 七个布尔：`sovereign`、`settlement`、`internal`、`hasTreasury`、`canTax`、`canWar`、`publicWorks`；
- `memberEnds`、`dissolveRX`、`template`。

11 条新登记都写全了这些字段。

**`memberEnds`。** 新登记各条都写 `["agent"]`。这与 `hk_member_of` 的 `from` 只收 `["agent"]` 一致（卷十八:549）。

**模板行。** 写法与卷七已核合的教团、修会模板逐字段同形：`abstract`、`orgKind`、`termination`（liquidate / null / 0）、`charter "1 == 1"`、`charterRules`、`covert false`。

- `settlement` 为真的三种（城镇、村社、怪物族群）都带 `tenure`，合卷八:133 的加载校验"条目 `settlement` 为真的种类必须写"。
- 其余种类都不带 `tenure`。

**理由。** 各条在正文都写了依据或设计理由：

- 国家：R8-11.2、§4.15；
- 军团：卷十三 R13-10.1、R13-10.9；
- 派系：R8-12.1；
- 怪物族群：卷八 §4.1 地穴族群例（卷八:622，`sovereign`、`settlement` 都为真）；
- 家户、家族：R18-2.5、R18-2.6、R18-3.6。

所取的值与这些依据处没有冲突。

## 二、来源卷归属（核对 1 续）

- 九种在卷八、两种在卷十八、两种在卷七。卷八:256 的"别卷登记"句仍只列卷七、卷十八，与现状一致。
- **怪物族群由卷八代登。** 原 C16-7 写"由本卷（卷十六）登记"。现改为卷八登记代号、全部主列与模板行，C16-7 同批改为"由卷八 §2.4 代登"，并注明字段依据卷十六 R16-3.1、R16-3.2、R16-3.5。
  - 改后登记卷唯一，两卷说法一致，没有一种由两卷各登一半。
  - 通则 1 要求由登记卷给出代号与全部主列。卷八作为登记卷，这两项都给全了，所以合通则 1。
  - 理由也成立：卷十六自检第 5 项禁止正文写实体 id 字面量，而模板行是组织行。
- 卷十六其余提到怪物族群组织的地方（:49 被依赖行、:149 别卷登记清单）都没有声称自登 orgkind，不需要再改。

## 三、orgTraits（核对 1 续）

13 种全有同键行，`domestic`、`descentGroup` 两项都写了：

- **卷八 §5.3 数据块（共 11 行）：**
  - 原有 3 行：`guild`、`cult`、`order`；
  - 本次补 8 行：`state`、`town`、`village`、`firm`、`caravan`、`army`、`faction`、`monster_band`。
  - 这 11 行两项皆假，依据写在 §5.3 卷十八行。
- **卷十八:169–170（2 行，原有）：** 家户 `domestic` 真，家族 `descentGroup` 真。

合 E-KIN-ORG-TRAITS。

## 四、标出不判：派系 `dissolveRX`

- 卷八:288 写 `orgkind_faction.dissolveRX: null`，正文解释为"不因条件自动解散"。
- R8-12.5 却写：通牒议案"准，则施行议案效果，派系按 `dissolveRX` 解散"。
- 照 null 的写法，通牒被准后派系不会解散，两处冲突。

此项已报李白（23:19 另有裁定，由另一批落实），本次只标出，不判不可封。

## 五、脚本（核对 2）

| 脚本 | 结果 |
|---|---|
| `book/check-orgkind-codes.mjs` | RESULT 失败 0（A/B/C 三组全 PASS，13 种） |
| `vols/check-卷八.mjs` | 失败项 0 |
| `vols/check-卷八b.mjs` | 失败项 0 |
| `vols/check-卷十八.mjs` | 失败项 0 |
| `vols/check-卷十六.mjs` | 失败项 0 |

## 六、快照、覆盖、勘误行（核对 3）

**改前快照**与 3974a026^ 逐字节一致：

- `卷八-v5-勘误前-1114w3j.md`
- `卷十八-勘误前-1114w3j.md`
- `卷十六-v2-勘误前-1114w3j.md`

**改后覆盖**与 3974a026 版本逐字节一致：

- `卷八-v5.md`
- `卷十八-v8.md`
- `卷十八-封卷.md`
- `卷十六-封卷.md`

**勘误行。** 三卷都有 1114w3j 勘误行，写明依据、位置、改法与必要理由。版本号不升，卷首未动。

## 七、无多改（核对 4）

三卷改动只有四类，外加快照：

- 卷八：§2.4 新增两段条目与数据块；§5.3 卷十八行与 orgTraits 数据块；
- 卷十八：§2.2 族表后一段与数据块；
- 卷十六：C16-7 一格；
- 三卷的勘误行。

记账小项（措辞，不阻断）：卷八 1114w3j 勘误行的位置栏写了"§2.4 表后别卷登记句"，但该句（卷八:256）本次没有改，位置栏多列了一处。

## 结论

- 13 种 orgkind 全有代号和正式条目，主列、模板行、orgTraits 行都全。
- 怪物族群由卷八代登，合通则 1。
- 脚本 0 失败；快照、覆盖与勘误行都合格；没有多改。
- 派系 `dissolveRX` 与 R8-12.5 的冲突待李白，本次只标出。

可封卷（dissolveRX 待李白）
