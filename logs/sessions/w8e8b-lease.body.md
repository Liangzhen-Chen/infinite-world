# W8-E8 续：接通玩家菜单与集体田租入

主会话审过你的交接。工坊库存部分接受。你停在接点处是对的；现在放开下列文件，请继续完成。

## 放开的文件
- server-plugin/finance-operations.mjs：操作集合里加入租入田地、工坊存取。
- extension/tools.mjs：只加必要的枚举值和槽位。静态提示必须 ≤10587：
  - 用 `node -e` 调 tools/build-card.mjs 的 loadPromptBundle 看 estimatedTokens，前后对比写进汇报；
  - 超了就压缩你新增的文字，不得删别人的。
- world/actions/core.json：菜单动作，改完 `node tools/export-actions.mjs` 重导。
- server-plugin/environment-state.mjs：只读即可。主会话已修 recordTillage 的非整数面积，改为有理数口径，s5-05 的 RangeError 已修，不用你处理。

## 集体田的租入
南田 feature_s1_field 的持有人是 loc_hw 集体，这是事实，不要造个人田主。集体资产出租要真实授权：
- 由该聚落当前有权管理集体资产的在任者（村长或里正一类，grep governance/office/organization 的现任与职权）当面同意；
- 租金入聚落公账（treasury），走现有账本；
- 无人在任或在任者不在场时拒绝，并写明原因与替代办法。
- 若架构文档对集体地出租另有规定（grep "集体" "公田" "租"），以文档为准。
- 不得为测试新建人物、职位或田地。若现有世界里确实没有能授权的在任者，停下写进汇报。

## 收尾
- tests/s5-playthrough.test.mjs 农事 todo 转正式步骤：
  - 全程走玩家菜单：租田 → 播种 → 推进到成熟 → 分批收割（背不动就多跑几趟，中间把粮存进工坊或卖掉均可，按真实动作）→ 卖自产粮 → 存钱庄；
  - 每步手算锚点。
- 更新 docs/可玩版本-S5.md。
- 逐文件跑：w8e8-premises、s5-playthrough、finance-assets、business-contracts、s5-05、a3-domain-properties、w8c-carry、holdings-writers、advance-registry、arch-metrics、actions-catalog、action-registry、turn-contract-client、a3-discoverability*（静态提示上限）。
