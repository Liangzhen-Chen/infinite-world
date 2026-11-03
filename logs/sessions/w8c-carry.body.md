# 卡 W8-C：负重（S5-10 余项）+ 小项 D32⑤ 恢复速率、D09④ 淋湿

先读 F:/dnd/logs/sessions/w8-common.md（共同规则，必须遵守），再读 F:/dnd/logs/sessions/s5w8-survey.md 第 1.2、2.1 条；指南与 docs/架构设计/ 中关于负重/body.safeCarryKg 的段落（grep "负重" "carry" "safeCarry"）；A3 题 A3V2-048 的原文（grep tests/ 与 fixtures）。

工作树 F:/dnd-wt/W8C，分支 t-w8c-carry。

## 背景
world/rules/tables/balance/attributes.json 已有 attr.carry（20+2×力量），全库无读取；玩家可无限携带（只有 ui-personal 显示总负重，pets.mjs 坐骑有载荷检查）。A3V2-048 卡在 body.player.safeCarryKg 前提。

## 要做
1. 身体派生的安全负重：从属性表 attr.carry 与当前身体状态派生（伤病、疲劳等若规则表已有修正就用，没有不要编）；临时修正（法术/药物/坐骑/背具）只能在派生基础上叠加，且不得越过规则表给的上限。派生值不入存档（派生优先）。
2. 检查点：拿取、买入、拾取、接受赠与、搬运等让物品进入行囊的动作，超过安全负重时：按规则表行为（拒绝 / 允许但减速或加疲劳——**以规则表或架构文档为准，文档没写就选"拒绝并在回执里说明差多少、可如何处理（放下、找人搭手、用坐骑）"**），回执如实；他人搭手（同行同伴或雇工）可分担，按真实同伴/雇佣关系。
3. NPC 是否同样受限：若现有 NPC 搬运路径已经有载荷概念就接上同一派生；没有就只做玩家，并在汇报里写明。
4. 小项（成本小就做，成本大写进汇报）：D32⑤ health:recoveryRate 消费者；D09④ 淋湿 wet 暴露状态。对应 tests/daily-b2-*.test.mjs 里的 todo 转正式用例。
5. A3V2-048：让其前提可由真实动作满足，相关 todo 转正式用例。

## 可改文件
server-plugin/engine.mjs、items.mjs、primitives-body.mjs、body-needs.mjs、pets.mjs、ui-personal.mjs、extension/tools.mjs（只有本卡可改；静态提示 ≤10587）、world/rules/ 下与负重直接相关的规则表（只追加字段，不改已有数值）；对应测试与新测试。不改 transport.mjs（归卡 D）。

## 测试
新增 tests/w8c-carry.test.mjs：力量不同的两人安全负重不同（手算 20+2×力量）；买入超重被拒且回执说明差额；放下后可买；同伴搭手分担；临时修正不越上限；派生值不在存档里。另跑：受影响模块测试、tests/daily-b2-*.test.mjs、tests/a1-daily-probes.test.mjs、tests/pets*.test.mjs、A3V2-048 所在测试、tests/turn-contract-client.test.mjs、tests/a3-discoverability*.test.mjs（静态提示上限）。

## 注意
engine.mjs 是公共接点，只做负重相关的最小改动；改完 `node tools/export-actions.mjs` 不要提交它生成的 docs/actions.json（主会话合并后统一重导）。
