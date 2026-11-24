# 6-3 批次字段与物品写者 回报（含改三轮）

模型：Claude Sonnet 5.5 中档（会员额度）。工作树 F:/dnd-wt/ds-b63，分支 ds/b6-3。已合入 origin/master（6-24、补值卡 A/B）。第三轮照 Opus 只核 docs/审查/6-3-Opus只核-1119.md（bf7dfed47）12 条逐条改。

## 自查表

| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 函数头注与测试标题逐条写卷三乙 §2.3 :225、§3.3 :434–:461、I-2 :908、K-1 至 K-9 :1031–:1044、§2.8 :400–:413、§4.10、§4.12，卷九 R9-2.7 :667，卷二十 §4.5 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 新代码不认任何物品、材料、物态、类别代号；持有人种类走冻结映射 ENV_OF_KIND；必填与适用读表头与 component 族条目；坏透读材料 rotRate 适用性与资源行汇登记 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 测试：qty 0、1.5、负；taint 越界；durability 越界；times 0；腐坏率 0；曲线取 0；缺锚点或缺 spoilage 读未知带缺口不当不可腐；容量或载重上限未知按装不下拒（canContain 加了此检查） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 真实数据用例（item-rot-real）按 tempCurve 与太原单元当日均温手算成字面量（夏 2 日 0.539996、冬 2 日 0.1432、坏透日第 94 日），并断言夏冬读数之比（温度依赖） |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | criteria.json 的 param_consumed、undeclared_io 判据原文恢复，只经 tools/accept/register.mjs 整行登记（M1）；业务代码没有为躲检测改写 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 本轮 diff 共 705 行（`git diff 81ea0c483 --shortstat`：新增 423、删 282）。超出卡文清单的是本卡必需的接点（state-owners、_vocab、rules 表、kernel/place.mjs 纬度与气候输入唯一定义、测试夹具），无其他会话文件 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：见末节；`node tools/accept/run.mjs pre_commit` verdict pass |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 物品批次与实例有了账本写入、腐坏与耐久按锚点公式读、坏透由 itemRot 结算并发事件；垄渠郡里食物按温度坏得有快慢 |

## 改三轮：12 条逐条对应

- **M1** 恢复 criteria.json 里 param_consumed、undeclared_io 的 criterion 与 source 原文（rev 41/43，带 log），只经登记器、整行传入。detector 的（表，键）判据保留；MARKER_KEYS（unbuilt）写死是已知待办。
- **M2** 删 registerPlaceEnv、resetPlaceEnv、defaultPlaceEnv 与 state-owners.kernelApi 条目。envOf：持有人种类经冻结映射取接线函数（place → placeClimateInput），真实路径唯一。测试全部改用真实地点行（垄渠郡）作持有人。
- **M3** 纬度与天气单元推导移到 kernel/place.mjs 唯一定义（placeLatitude、placeClimateInput，沿包含树取最近天气单元祖先）；item-state 只调用。
- **M4** 坏透发 verb_item_spoiled：itemRot 另立 sys.itemRot（environment，sortKey 1，emits verb_item_spoiled），settleRotted 在 post 到 sink_decay 的同事务内 emit；载荷 lot 形状 {holder, item, purpose, lotKey}（_vocab 里 struct 登记）。测试断言事件条目、载荷与账本。events.test、scheduler-due.test 改到 sys.itemRot。
- **M5** 缺 spoilage 或 rotAnchorDay 的可腐批次、缺耐久或锚点的耐用实例，读数按未知带缺口（rot_anchor_missing、wear_anchor_missing），不当不可腐；useWear 对此拒（E-DIM-UNKNOWN-READ）；整件不可腐仍是不适用。
- **M6** createItemInstance 不写耐久、腐坏初值（拒收 durability、wearAnchorDay、spoilage、rotAnchorDay 字段）；初值由 item-condition.mjs initDurability、item-lots.mjs initInstanceRot 在各自事务里写一次。
- **M7** “含有材料派生组件”并为 dimensions.mjs memberClasses 一处读有效值；requiredFor 只看自有类。
- **M8** 机读缺口补齐：rules.items.unbuilt 加 instanceLotPointer、resourceItemRef、wearPerUseResolution；rules.wear.unbuilt、rules.rot.unbuilt 补全；volume 的文字改为准确描述；item.test 的期望同步。
- **M9** quality 七档（含 quality_fine）不自定 rank，词表条目不带 rank；档次序待李白（见下）。
- **M10** 三种持有种类行（装入、穿戴、装备）等挂卡理由不成立：卷三乙 :1405/:1584/:1930/:1951 写明本卷登记。但卷文没给这些行的代号，只写中文名，所以不自编，报李白（见待裁定）。回报不再写“挂卷十八”。
- **M11** 日拍性能：rottenLots 只判当日值（rotStep 加 expiry:false，不做坏透日二分搜索）；逐日温度因子按（接线 input，曲线）稳定记忆，值与不记忆逐位相同；资源行不允许汇、材料不可腐的账户在遍历材料前剔除。复杂度：每拍 O(批次数 × 距锚点天数) 次映射查找，每地点每日首次访问一次 dailyMeanTemp；真实规模估算 458 地点 × 数十批次 × 每批至多数十日，量级 10^5 次读，锚点随条件变化重设，实际常远低于此。**实测一条归腾讯云测试台（推进世界的长测）**，本卡本机没有跑。
- **M12** item-rot-real 改为手算精确值与温度依赖断言（夏冬对比、坏透日）；标题与断言一致。

另：canContain 容量或载重上限未知时按装不下拒（只核 §二.2）。

## 待李白裁定（不自定）

1. 用损单次小于 1e-4 被定点截成 0，与卷三乙 §4.10.5 例子冲突（wearPerUseResolution）。
2. 实例与其新批次之间无指针（instanceLotPointer）。
3. resource 条目的 item 字段（物品到资源种类的指向，卷文没写，自定；resourceItemRef）。
4. quality 档代号到次序的对应与第二档代号。
5. 装入、穿戴、装备三种持有种类行的代号；劣化等级（wear 族）代号；rules.wear.levels 与 quality 表的值。
6. 世界种子流登记（rules.seedKeys）未建，天气湿度读数按未知带缺口（weather_ctx_unbuilt）；itemThermal 建成后补 sys.itemRot 的 after。

## 备注

- itemRot 钩子忽略 ctx.unit，待卷二十七 advancePlan 那张卡。
- P-6 曲线与档表为暂定值（标“暂定·待试玩标定”），出处读到的只有 Q10 定义，没有食品腐坏的权威典型值。

## 验证

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：见提交说明。
- `node tools/accept/run.mjs pre_commit`：verdict pass。
