# P-2b world/rules 旧文件清单（李白 11-17 裁定技术问题 (1)）

判据：该文件（或它所承载的表）是否出现在某卷的**规则表定义**里。卷文迁移表只写"旧文件并入/迁入/取代/删除"的，旧文件本身不在规则表定义里，删除（标签 `old-final-1117` 可查，迁移卡按卷文从标签取旧值）。在卷规则表里的，本卡只登记新底子现已要读的；其余留给该卷首卡按卷文重建，本卡不登记、不读（加载器只按 `world/rules/registry.json` 读，未登记的文件不进 `engine.rules`）。

本卡新建：`world/rules/registry.json`（规则表登记，卷二 §4.1 :1497）、`world/rules/tables/valuation.json`（`rules.valuation.unitValue`，卷三乙 :1693、:1707，设定值）。

| 路径（world/rules/ 下） | 卷文出处 | 处置 |
|---|---|---|
| tables/kernel-constants.json | 卷二 §7 S10 :2386、§3.3 :1331、:1333；卷一 :1026 | 留，本卡登记（表代号 `kernelConstants`），校验器上限经登记读 |
| tables/currency.json | 卷六 §2.5 :234（`currency.json` 键表）、M6 :1535 | 留，卷六首卡按卷文重建（卷文路径为 economy/ 下），不登记 |
| tables/market.json | 卷六 §2.5 :225（`market.json` 键表）、M6 :1535 | 留，卷六首卡按卷文重建，不登记 |
| tables/seed-keys.json | 卷一 :474、:638；卷二 :314；卷二十七 M27-10 :851；卷十 M10-34 :1049 | 留，卷二十七首卡按 R27-8.1 重写，不登记 |
| tables/digest-exclude.json | 卷一 :475、:643；卷二十七 M27-11 :852 | 留，卷二十七首卡改为按卷二 §2.9 第 3 条生成，不登记 |
| open-reactions.json | 卷九 M9-20 :1553（并入留痕反应规则） | 删 |
| open-tagging.json | 卷九 M9-20 :1553（标注表按代号重写或退役） | 删 |
| programs.json | 无 | 删 |
| tables/open-actions.json | 卷九 M9-20 :1553（并入 `cap_row`） | 删 |
| tables/bargaining.json | 卷六 M6 :1535（并入卷六 §2.5 各表，议价基线进 market `bargainBaseline` :225） | 删 |
| tables/domain-rules.json | 无 | 删 |
| tables/balance/action-costs.json | 卷九 M9-20 :1553（并入 `cost_row`） | 删 |
| tables/balance/attributes.json | 卷四 M4-50 :1452（迁入 `rules.attr.*` 等） | 删 |
| tables/balance/body.json | 无 | 删 |
| tables/balance/combat.json | 卷十三 M13-25 :1535（迁入 `rules.combat`） | 删 |
| tables/balance/crafting.json | 卷六 M6-27 :1535；卷三乙 :2062 | 删 |
| tables/balance/credit.json | 卷六 M6 :1535（并入 economy/credit.json，卷六 :235） | 删 |
| tables/balance/ecology.json | 无 | 删 |
| tables/balance/economy.json | 卷六 M6 :1535（并入卷六 §2.5 各表） | 删 |
| tables/balance/event-weights.json | 卷二十四 M24-16 :907 | 删 |
| tables/balance/health.json | 卷二十一 :206、:1297（旧表整删；新表 tables/health.json，卷二十一 :172） | 删 |
| tables/balance/law.json | 卷八b M8b-28 :1349（迁入 `rules.law`） | 删 |
| tables/balance/learning.json | 卷十四 M14-82 :1521 | 删 |
| tables/balance/loot.json | 无（新键 `rules.combat.loot.*` 卷十三 :333 起，未提旧文件） | 删 |
| tables/balance/magic.json | 卷十五 M15-25 :1301（迁入 `rules.arcana.*`） | 删 |
| tables/balance/pace.json | 卷二十 M20-43 :1234 | 删 |
| tables/balance/population.json | 卷四 M4-49 :1451 | 删 |
| tables/balance/progression.json | 卷十四 :1521 | 删 |
| tables/balance/social.json | 卷十八 M18-13 :1431 | 删 |
| tables/balance/targets.json | 无 | 删 |
| tables/balance/tax.json | 卷六 M6 :1535（归卷八 `taxbase` :239、`rules.polity.tax` :311） | 删 |
| tables/balance/transport.json | 卷十七 M17-16 :901（并入 tables/travel.json） | 删 |
| tables/balance/yields.json | 卷二十五 M25-58 :918；卷六 :1535（产量表删除） | 删 |

合计：原 33 个，删 28 个；留 5 个（登记 1 个：kernel-constants；留给首卡 4 个：currency、market 归卷六，seed-keys、digest-exclude 归卷二十七）。删前核过：除 kernel-constants 外，server-plugin/、tools/、tests/ 无代码读这些文件；world/design/ 下旧设计脚本（a3-world-catalog、s505、s507）与 world/drafts/ 旧草稿仍提到旧路径，属旧内容，不在本卡。
