# K15 最终交接

K15 功能已落地，但本卡尚未通过验收：性能门失败。家户按天领取实际公粮配额、消耗真实私粮库存并记录缺餐；无公粮城市同样结算。库存减少后沿用 K02 预算和 K08 客流，自然形成买→吃→再买，不注资、不清空库存、不手写采购缺口。公粮先在原农业路径扣除，家户只分配其营养，不再次扣公粮。自粮和购入食品沿用既有可互换私粮袋，按营养数据取用。

工作树 F:/dnd-wt/K15，分支 t-k15-law，基线 07477535。未提交、未部署、未改原存档。主会话需先处理性能阻碍及快照审核，再决定合并。

## 实现与边界

- server-plugin/household-budget.mjs：新增 householdMealPlan，复用家庭、库存、承诺和种子预留逻辑；按 body 推导需求、物品营养分配私粮，避开已知不安全实例。公共标准营养按基础口粮计算，高代谢只提高个人需求，不凭空增加配给。
- server-plugin/npc-life.mjs：新增 advanceHouseholdMeals，复用 stateMemo 和索引，每户每日一次；先读计划后写库存，使用既有 itemDelta 账本消费。结算事实存入 state.family.meals，存读档及重放保留每日防重。沿用死亡、征召、折叠人口边界。
- server-plugin/advance-registry.mjs：保持原公粮扣除，收集实际配给后编排家户进餐，再更新缺餐和既有饥荒口径；无粮仓城市也进入该结算。
- 公粮只覆盖原登记人口口径，未登记个体自行消费私粮；登记人数大于聚落旧统计时也不超分实际扣除公粮。最终场景 45 组配给对照均无超额；河湾首段实际扣 58、分配 58，其余四个无登记个体未凭空领粮。
- server-plugin/agriculture.mjs 的私田段包含上游已验收提交 38353582 的“先查成熟批次、再查权利”修复。这是为保留原 s5-05 断言而带入的现成依赖；本文件与该提交逐字 diff 为空，合并时去重，不作为新的 K15 私田改造。
- docs/actions.json 已按要求重导。没有修改 building-maintenance.mjs、npc-autonomy.mjs。

## 验证

所有测试逐文件独立运行，TEMP/TMP 均设 F:/dnd-tmp。PowerShell 对 ℹ 的编码过滤不可靠，改用 Node 内置 TAP reporter，仅查看摘要；命令形式：

```powershell
$env:TEMP='F:/dnd-tmp'
$env:TMP='F:/dnd-tmp'
node --test --test-isolation=none --test-reporter=tap tests/<文件>.test.mjs 2>&1 | Select-String -Pattern '^# (pass|fail)|not ok' | Select-Object -First 40
```

表中为最后一次有效结果；未变化结果直接复用。农业私田依赖带入后重跑原 s5-05、CORE 及同步四件套。

| 文件/检查 | 通过/失败 | 说明 |
| --- | --- | --- |
| s5-law-household-meals | 11/0 | 手算、公粮/无公粮、高代谢、未登记个体、旧人口偏低、共享粮袋、重复日结、切分重放、原生存储重启/导入/回滚、买吃再买、营养/预留/实例 |
| FIELDS_INDEX_CHECK=1 s5-law-household-meals | 11/0 | 相同专项，索引检查开启 |
| s5-law-household-budget | 27/0 | 原预算回归 |
| s5-law-periodic-market | 22/0 | 真实客流和时序 |
| s5-02 | 16/0 | 相关资源回归 |
| s5-05 | 16/0 | 原测试与断言零修改 |
| shop-restock | 7/0 | 商店补货 |
| npc-life-health | 7/0 | 照护、死亡、继承 |
| settlement-trade | 18/0 | 真实运输、库存、税款 |
| agriculture 相关短测 | 12/1 | 唯一失败为独立迁移 CLI，spawnSync 返回 EPERM，须主会话沙箱外补跑 |
| engine / storage / plugin | 22/0；14/0；7/0 | CORE 分别单独运行 |
| export-actions | 完成 | 248 actions、25 public tools、232 subops、handler 248、dispatch 226 |
| actions-catalog / action-registry / arch-metrics | 4/0；7/0；5/0 | 分别单独运行 |
| advance-registry | 3/2 | 仅 full/quiet 原金快照不一致；未重生成 |
| npc-life-family / npc-life-migration | 7/0；7/0 | 补充消费者回归 |
| i01-conservation / i02-non-negative / i15-single-account / i16-event-primary-write | 2/0；3/0；2/0；2/0 | 分别单独运行 |
| npc-life-t164（补充） | 7/1 | 原有继承用例失败，见下段 |

农业短测过滤为：
`--test-name-pattern='农业引用|新战役|粮仓买卖|粮仓拒绝|柜台在场|破损粮仓|缺劳力|旧粮账|志愿播种|农事库存随|满仓|加工劳力|独立迁移CLI'`。没有运行该文件的多年长浸泡；过滤符合本卡“农业相关短测”，没有删除或改 skip。

npc-life-t164 的“名册家人在照护…”原断言预期配偶钱 40、实得 13。两种调账解释尝试未能解决，已全部撤回，测试文件零 diff，不放宽断言。固定 07477535 代码下单独该用例同样失败；已停此块，交主会话规划处理一次。不能据此声称整个账本不守恒，也不把未证明的消费来源写成结论。最终人口配给版本未重复运行整份补充文件。

改动的旧测试依据逐处保留断言意图：
1. periodic-market：午夜买入的食物可当日吃掉，库存断言改为“库存＋真实进餐量”，保留原时点与归属检查。
2. settlement-trade：原精确私产快照只扣通过 itemDelta 捕获的成功 npc-life/meal 写入；现金、公粮、合同及其他物资检查保留。
3. npc-life-health：三件遗产锚点改用耐久非食物；食品遗产按购入量减真实已吃量精确比较，保留死亡、现金、隐私等检查。未删测试、未放宽断言。
s5-05 和 npc-life-t164 最终均无修改。未运行全量、build:release、真实提示栈试玩或 test:baseline，不声称它们通过；baseline 文件未改。

## 性能阻碍

使用已冻结 master 工作树 F:/dnd-wt/PERFBASE，提交 3bbd7e0c；为遵守禁止 git 写操作，顺序在两棵树运行相同 `node F:/dnd-tools/bench-farm-pests.mjs 30 2`，没有执行含 checkout 的包装脚本，也没有并行跑基准。

最终人口配给版本：master 105475 ms，K15 135261 ms，比值 1.282398672671249，即慢 28.24%，超过 1.10 门限；首组超过 1.15，按既有门规则不追加配对。随后只带入上游私田依赖，没有宣称性能改善。此前三组中位数也未过门，不能用较快单次替代最终结果。

已尝试将进餐事实由通用 records 移入 family，避免扩大通用记录扫描；性能仍失败。早期 CPU 诊断摘要保留于 K15-profile-summary.json，只是旧版本定位线索，不能替代最终基准。下一步由主会话规划家户日结/通用调度开销优化；不要继续采样挑选通过值。

## 金快照与数值复核

共享 S5A 在本会话中已前进到 K07/K14，不能冒充精确 074 基线。已用 git show 07477535 读取四个相关生产模块，通过临时 Node registerHooks 在规范模块 URL 下加载原源码，其余仍为本工作树基线文件；冻结加载的 advance-registry 原金快照 5/0，确认场景有效。由此重导最终 before；after 为最终 K15 真实代码。临时加载文件已经删除，主会话可在实际固定 074 工作树复现。

完整字段表：[K15-golden-table.md](F:/dnd/logs/sessions/K15-golden-table.md)。共 5604 条去重的“字段：旧→新、原因”，保留适用推进步，覆盖 full 五步和 quiet 四步；不是截断的差异摘要。变化归于进餐事实、真实库存消费/再购、缺餐及下游日常状态，没有表外路径。45 组公粮配额核对无超分。

原始件：K15-golden-before.json、K15-golden-after.json、K15-numeric-before.json、K15-numeric-after.json、K15-diff-summary.json；都在 F:/dnd/logs/sessions/。K15-golden-diff.txt 是工具默认截断摘要，审核应以完整字段表为准。未设置 UPDATE_ADVANCE_GOLDEN，未修改金快照文件。

Node 前后均 v24.13.1；13 个数值函数哈希及采样全部不变。状态哈希因上述有意状态变化而变化：

| 场景 | 旧 → 新 |
| --- | --- |
| full | 28a5db8ece66a580e4523ca21b0ba3dbe8e5c54aef2da9a861981bcdbc921340 → 0b2801b92219cbd6116bbd8cb54c09b8a89b4892d77023b6e07b7e6c80e658cc |
| quiet | 00ca362dfe34d9f6ce6bb2425cea3e4148a8f04930f33b843441f374f5a0db5e → 8f83f63f5cd4574b1b683897698ede1b7c11528045cbdd527e2fa78b6be22c49 |

## 交接状态

git diff --check 无空白错误，仅 docs/actions.json 的 Git 行尾提示。改动路径为上述四个生产模块、actions 导出、三份旧测试和新增专项，未触及任何禁区。预先存在的未跟踪 .base 保持原样。无 git 写操作。

临时调试/基线加载文件与原始 cpuprofile 均已删除；保留的 JSON/Markdown 为交付证据。没有结束任何进程，没有按名称杀 node。

主会话下一步：处理性能失败；审核字段表后统一更新金快照；沙箱外补跑农业 CLI；将原有 T164 失败交规划处理一次；去重上游 38353582 后再合并提交。本工作区按用户要求保留未提交改动，未伪称工作区干净或本卡验收通过。
