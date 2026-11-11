# 卡 K02：家户预算与缓冲（S5 规律卡，第 1 波）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K02，分支 t-k02-law。范围按 s5-cards.md 的 K02 节。审计原文：tables/ 中家户经济表的 HH01、HH03。

## 要做（按 K02 节）
1. 新增 server-plugin/household-budget.mjs：householdBudget / householdResources / householdBufferTarget，纯派生，不写钱物。分别给出：现钱、未来来源（带到账日，不算现钱）、食用/种用/已承诺/可售，以及到下一次可靠收入前的缺口；主观预期与内核事实分开标注。
2. 同模块提供消费、出售、保留、筹措的可行方案与边际预算接口，供 K08（实际买卖）、K09（授信/亲友筹措）接入；本卡至少接一个真实消费者：market.mjs 的 reserveAllocation/personalReserves/reserveShortfall/saleableStock/forwardSupply 改为复用预算，保证承诺只扣一次，并保留报价已有的实物约束。
3. 家户成员共享一袋粮不重复保留；不能自动取得他人钱袋；互济只在对方真实同意并完成转移后才计入。
4. 个体差异：储备倾向因人而异（节俭/挥霍），按 05 §5.7 从种子抽签，不强制每个人都存够。
5. npc-state.mjs 家户 selector 只读，不改。不写日程（HH02 归 K04）。

## 手算锚点
同一资源可食可播：库存20、食用10、种用4、排他承诺3 → 可售3；种用若是独立物品则分开算。现钱5、第6天工资10、第3天应付8 → 当场现金仍是5，第3–6天缺口3显现。

## 验收
C；逐文件：s5-02、s5-05、shop-restock、w8e6-leftovers、npc-obligations、新增 s5-law-household-budget（含非共享家计、单身、孩童照料、共同歉收、双世界私密案例：NPC 看不到别家账）。
