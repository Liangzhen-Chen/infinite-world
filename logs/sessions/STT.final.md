# STT：settlement-trade 三处失败分诊

基线：t-st-triage，s5a@8a657c62。只修改 `tests/settlement-trade.test.mjs` 的两处严格锚点；不提交，由主会话代提交。生产代码、世界数据及金快照均未修改。

| 失败 | 引入提交／s5a 合并点 | 根因与具体代码 | 性质与处理 |
| --- | --- | --- | --- |
| 周发货后私人物品快照（原第 3 用例） | c930d578／804996a6 | `world/meta/rules.json:1929` 新增铁镰进货；`server-plugin/shop.mjs:282,315,329,341,382` 按周期付款、入库。铁匠段炎第 1 天补货，不是居民买走铁镰。 | 已批准规律变化。`tests/settlement-trade.test.mjs:75`：严格预期段炎钱袋 200→180、铁镰缺项→1 把（木品质、耐久 100、0.5kg）。原全人物钱袋/物品深比较、现金总额、粮钱守恒及输入不变断言全部保留。 |
| 长短推进及重启全状态比较（原第 4 用例） | eabde194／6b704e70 | `server-plugin/environment.mjs:73` 将触发淋雨的真实外层事件 ID 存入 `weather_exposure:player.sourceEvent`；`server-plugin/environment-state.mjs:9`、`applied-effects.mjs:30`、`ui-personal.mjs:11` 用于来源展示和回执。 | 仅来源标签差异。完整递归比较 `tradeState` 后，长/短推进唯一差异为该字段 large→small-22500；JSON 重启唯一差异 large→restart。不是农业记录，耕作、粮食、现金、税账、运输、湿润物理字段均一致。按卡片要求不改断言，交主会话决定。 |
| 旧档河湾公款（原第 16 用例） | c930d578／804996a6 | 同一新增进货行：第 1、8 天各补一把，每次货款进河湾公库。旧断言误把“不能凭空生成四村公仓/订单”扩成“现有河湾公库不能有合法进货收入”。 | 已批准规律变化。`tests/settlement-trade.test.mjs:259`：公款严格锚点 640→680（cash+40）。仍逐村断言无托管村庄、无周订单、无周贸易时钟；原断言未删除。 |

手算与实测：铁镰目录价 10；货架目标 2、实际可售存量第 1 天 0／第 8 天 1，稀缺系数均为 `2/max(1,供给)=2`，其余系数均 1，一把 20 铜。周期 firstDay=1、cycleDays=7，每批 1、上限 2。正常周发货用例到货早于第 8 天，实测仅第 1 天补 1 把、支付 20。旧档推进至第 8 天 540 分，实测两批各 1 把、各支付 20；段炎钱袋 200→160、库存 2、柜台余额 0；河湾期末库款 620 + 任务托管 60 = 公款 680。货物账 `src:import|item_sickle|local_supply` 为 1／2，来源为规则明确的模拟范围外本地产出，钱款进入现有公库，无钱货凭空出现。

主会话待决：建议此用例仅对 `weather_exposure:player.sourceEvent` 作来源标签投影，并另断言其对应实际触发事件；其余全部记录及湿润状态、起止/累计时间、粮钱税运继续严格比较。不能全局删除所有 sourceEvent，更不能改生产记录为假来源。此建议未实施，当前整文件保留 1 处失败。

历史定位使用工作区内临时源码副本，通过只读 `git show/diff` 还原，各版本整文件单独运行：

| 版本 | settlement-trade pass/fail |
| --- | --- |
| 6b704e70 | 17/1，仅来源标签比较 |
| 804996a6^1（d47ec5c7） | 17/1，仅来源标签比较 |
| 804996a6 | 15/3，三处原失败均复现 |
| 本卡修改后 | 17/1，仅保留待主会话决定的来源标签比较 |

验证：所有测试每文件独立 node 进程，`--test --test-isolation=none`；TEMP/TMP 为 F:/dnd-tmp。Windows PowerShell 原生输出解码会损坏 ℹ/✖，改由临时 Python 包装器按相同正则过滤 UTF-8 摘要；失败详情仅查看单个用例最后 30 行。未结束任何进程。

| 检查／命令 | 结果（pass/fail） |
| --- | --- |
| `node tools/export-actions.mjs` | 已重导，docs/actions.json 与 HEAD 字节一致，无内容差异 |
| `tests/engine.test.mjs` | 22/0 |
| `tests/storage.test.mjs` | 14/0 |
| `tests/plugin.test.mjs` | 7/0 |
| `tests/actions-catalog.test.mjs` | 4/0 |
| `tests/action-registry.test.mjs` | 7/0 |
| `tests/advance-registry.test.mjs` | 5/0；未设置 UPDATE_ADVANCE_GOLDEN，未重生成金快照 |
| `tests/arch-metrics.test.mjs` | 4/0 |
| `tests/invariants/i01-conservation.test.mjs` | 2/0 |
| `tests/invariants/i02-non-negative.test.mjs` | 3/0 |
| `tests/invariants/i15-single-account.test.mjs` | 2/0 |
| `tests/invariants/i16-event-primary-write.test.mjs` | 2/0 |
| `tests/shop-restock.test.mjs` | 7/0 |
| `tests/w8e3-consumers.test.mjs` | 10/0 |
| `node tools/numeric-digest.mjs` | exit 0；与临时还原的未修改 HEAD 输出全量比较相等，状态及全部函数摘要无变化 |
| `git diff --check` | 通过 |

上述每个测试文件均单独以 `node --test --test-isolation=none tests/<文件>.test.mjs` 执行，无同进程多文件预加载。测试仅有表内所列项；未跑全量、发布构建或真实试玩。本轮未遇到 EPERM。agriculture 为指定长测，未运行，交主会话外跑 `node --test --test-isolation=none tests/agriculture.test.mjs`。

本卡仅实质改动 tests/settlement-trade.test.mjs；报告位于本文件。不触及 docs/架构设计/、world/design/、dist/、docs/待办.md、docs/问题.md，不改原存档、不部署、不读取 secrets.json。PROGRESS/CHANGELOG/当前状态未改，留主会话维护。工作树原有未跟踪 `.base` 保留；export-actions 使 actions.json 状态显示 M，但只读 diff 为空，且实测与 HEAD 字节一致，无需合入内容。剩余事项只有来源标签比较的主会话裁定与 agriculture 外跑。

临时源码副本、诊断脚本、测试摘要包装器和数值摘要临时文件均已删除；最终 diff 仅测试文件 10 行新增、1 行替换，未提交。
