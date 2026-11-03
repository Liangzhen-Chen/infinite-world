# 卡 K03：业主维护闭环（S5 规律卡，第 1 波）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K03，分支 t-k03-law。范围按 s5-cards.md 的 K03 节。

## 已有（W8-E8 第八轮，已合入），承接不另建
server-plugin/building-maintenance.mjs：登记业主本人在场时，经 registerAutonomyProvider/registerAutonomyKind 生成修缮候选，进 npcDecision；缺料只向同地、有公开报价库存的真实卖家买，付本人钱；走 facilityRepairMaterials、holdWorks/settleWorks、completeFacilityProject；做满工时才恢复。损耗按 world/meta/rules.json facilities.wear 五年参考寿命（暂定）。测试 tests/building-maintenance.test.mjs。

## 主会话审出的差距（本卡要补）
1. 触发写死：只有 condition<60（已降级）才出候选。改为成本收益：比较"现在修"与"暂缓"的预期——维修成本（材料+工时机会成本）对比可避免的停工/降级损失（按该建筑服务收益与损耗速率推算到降级的时间）。这样会出现预防性维修，也会出现合理暂缓。可选项至少有：修、暂缓；若现有原语支持，再加缩小经营或转让/关门的出口（不支持就写明缺什么、归哪张卡）。
2. 写死上限：`if(quantity>20)return []` 无依据，删除或改为从业主预算/搬运能力派生（负重见 carry.mjs）。
3. 噪声与差异：拖延倾向因人而异，决策带噪声（05 §5.7，种子抽签）；允许个别业主拖到停用，但不允许整类设施漏出候选。
4. 没有产权人的集体建筑（学堂、驿站）归 K10，不在本卡处理；本卡只确认它们不被误当私产修。
5. 不降低天气/余数损耗来掩盖候选缺失。

## 手算锚点
零噪声：维修成本7、可避免停工损失10 → 修，净收益3；成本12 → 暂缓占优。完工只扣一份材料/工钱；重放不重复修。

## 验收
C；逐文件：facilities、repair、m1-repair-learning-preconditions、npc-autonomy、shop-restock、building-maintenance、新增 s5-law-maintenance。本卡独占 world/meta/rules.json 的 facilities 维护段。
