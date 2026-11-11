卡 a3p-domain（A3 收口第 2 步 b：领域规则按物品属性推导）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3DR（分支 t-a3dr，自 a3a，已含工具用途标签）。先读 docs/产品原则.md（二.1 派生优先、二.2 自由度优先、二.3 拒绝要给世界内原因与降级做法）。

目标（一句话）：玩家手里任何具备所需用途、且完好可用的工具都能用来拆机关、开锁、翻地、收割；中转地点从真实路线推出；修理是否可行由材料、损伤、规模、工具与工作量判断——不再认死某个物品 ID 或场景名单。

现状（主会话已核实）：world/rules/tables/domain-rules.json 中 physicalMechanisms 各指定 1 个 tool ID（tripwire→item_smith_tongs，lock→item_iron_wire）；privateField.sowTool/harvestTool 指定 item_hoe/item_sickle；map.transitPlaces 指定 loc_bs、bld_bs_shrine；handRepair 以 refusedMaterials/Scales/DamageKinds 名单一刀切拒绝。消费处约在 environment.mjs:113–119、agriculture.mjs:447、map-state.mjs:18、items.mjs:357–358、domain-rules.mjs:48–50/75–95/118–119（请复核）。用途标签词表 world/meta/item-use-tags.json（soil_work、harvest、cut、grip、probe、pry、pierce、unlock、drinkable、liquid_container），已在 world/meta/items.json 的 tags 上发布。
要做：
1. domain-rules.json 把工具 ID 改为用途要求（如 requiresUse:"grip"/"unlock"/"soil_work"/"harvest"），消费处按玩家实际持有、标签匹配、耐久>0 选工具（多件可用时选择规则写清楚，如耐久最高或玩家指定），并删除旧 ID 校验。这是规则配置改动，不是世界事实，可直接改；不改 items.json。
2. transitPlaces：从现有路线/地图层级推出中转节点（如多条路线交汇的已知节点），不泄露玩家未知地点；推不出时说明依据，不保留名单作暗兜底。
3. handRepair：按设计 06 §6.7 fact.set“破坏/改造按 技能阶×工具×时间 的工作量折算”——先 rg 查现有工作量/修理规则；有就接上，使徒手修城门这类请求变成“需要什么工具、多少工时”的可行性答复或带原因的拒绝；没有现成工作量表时，用实体自身的材质/损伤/规模字段判断并在拒绝里给出所缺工具与可行替代（如请工匠），并在报告里写明工作量表缺口。不允许删掉限制后让徒手瞬间修好城门。
4. 以上文件里属于业务拒绝的普通 Error 改为现有 ActionRejection（带世界内原因、缺项与可行下一步）；程序故障（TypeError、接点缺失）仍抛错，不得捕获所有 Error。
5. 旧存档读取兼容保留（旧档里没有标签的物品：明确说明未知，不虚构能力）。
可改：server-plugin/domain-rules.mjs、environment.mjs、agriculture.mjs、items.mjs、map-state.mjs；world/rules/tables/domain-rules.json；tests/domain-rules.test.mjs；新增 tests/a3-domain-properties.test.mjs。锁定：其余所有文件（尤其 action-router、primitives*、open-actions、world/meta/）。
验收：node --test --test-isolation=none tests/domain-rules.test.mjs tests/a3-domain-properties.test.mjs tests/environment.test.mjs tests/a3-body.test.mjs tests/a3-daily.test.mjs tests/daily-b2-mechanisms.test.mjs
新测试须覆盖：同用途标签不同 ID 结果相同；同 ID 去掉标签结果不同；耐久为 0 的工具不可用；城门/裂损不能被徒手瞬修且拒绝带缺项与替代；中转节点不泄露未知地点；工具消耗、农产账本与时间不变。
不调用真实模型。预计规模：中（约 400–700 行含测试）。
通用：所有 node 命令先设 TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，测试用 --test-isolation=none，输出过滤为摘要。题集与 tools/a3-score.mjs 冻结。不为测试新增生产接口或世界内容。最小完整改动，删除优先。改旧测试仅限对齐设计，保留断言意图，逐处写依据。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行（改动文件、验收命令与结果、偏离、未解决问题），同样写到 F:/dnd/logs/sessions/a3p-domain.final.txt。
