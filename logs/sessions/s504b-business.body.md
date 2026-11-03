# 卡 s504b-business：S5-04 第 2 会话

第 1 会话（独立柜台、4 个 todo、遗产偿债、新签/续签工价派生、缺勤罢工工时）门禁结果（与共同基线 0960452b 两次独立复跑对照）：本卡导致 3 项失败，都是本卡自身应完成的同步：
1. tests/action-registry.test.mjs「注册表：数据声明、带命名空间、与 S0 动作清单一一对应且为最新同步」（2 个用例）
2. tests/actions-catalog.test.mjs「actions.json 是最新导出」——运行 `node tools/export-actions.mjs`
3. tests/advance-registry.test.mjs「对照：full存档推进结果可重放且与快照逐字节相同」（2 个用例）——经营账户改变了推进状态：先确认差异只来自本卡的有意改动，再按测试自带流程 `UPDATE_ADVANCE_GOLDEN=1` 重生成快照并复跑通过；不放宽其它断言。
（runtime 浏览器测试为已知偶发；tests/baseline 的 23 项历史预期失败与 tests/probes 超时不归本卡。）

先修以上 3 项，再按你的交接继续：收支接柜台、进货/定价/雇解读主观行情（S5-02 市场投影）、役畜工时、客户订单竞争、客流香火与丝绸产业链供需、内部调拨不重复征税、商号账簿/签发收据有来源。约束同第 1 会话（派生优先、真实动作前提、手算锚点、不放宽断言、已发布内容走审批、不改 docs/、不跑慢档、不自己跑全部 affected）。

汇报（≤300 字，F:/dnd/logs/sessions/s504b-business.final.md）：3 项修复、新增机制与锚点、测试结果、偏离、第 3 会话计划。
