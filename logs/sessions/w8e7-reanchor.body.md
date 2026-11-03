# 卡 W8-E7：W8-A 价格派生后的旧测试重锚（手算）

先读 F:/dnd/logs/sessions/w8e-common.md（共同规则）。

工作树 F:/dnd-wt/W8E7，分支 t-w8e7-reanchor（基于 s5a 3d45e13f）。

## 背景
W8-A 把两处现价从"目录基价×数量"改为当地市场估值（server-plugin/valuation.mjs 的 goodsWorth，单份值 = 区域基价 × 稀缺，稀缺 = clamp(需求/供给, 0.5, 3)）。二分确认下列失败自 W8-A 合入（b69daa34）开始，之前全过：
1. **粮仓售粮**（agriculture.mjs 约 409 行 world_farm buy）：
   - tests/m2-preconditions.test.mjs 用例"燕麦从在场粮仓柜台购买…"：期望 coins 150（10 份×3 文），实际扣 50；
   - tests/m2-task-flow.test.mjs 3 个用例；
   - tests/m2-action-context.test.mjs 1 个用例（actual -50）；
   - 它们读的场景夹具 tests/fixtures/t64-scenarios.json 里 id "npc_quest_social" 的 delta（state.player.coins -30、settlements.loc_hw.treasury 等）。
2. **盗采案值**：tests/mining-jurisdiction.test.mjs:93 期望罚金 `{'王国':15+ore*2,'赭牙部盟':31+ore*3}`，用的是目录 basePrice 4；实际赭牙部盟 37（矿石在当地估值 2）。

## 要做
- 先确认新数值是设计行为，不是 bug：W8-A 卡注明"粮仓售粮、偷窃案值走 valuation goods"，见 docs/PLAN.md W8-A 行。若发现估值本身算错（如供给/需求取错地点），停下写进汇报，不要改测试。
- 是设计行为则重锚。期望值**不得调用被测函数**（goodsWorth、marketSupply、marketQuote 等）算出：
  - 按设计公式写手算数字字面量，注释写清计算步骤（供给、需求从场景里哪些量来，稀缺多少，单价，总价）；
  - 可以在测试里读状态里的原始量（库存、人口等）做交叉核对，但最终断言必须是字面量。
- t64-scenarios.json 的期望 delta 同样改成手算值，在相邻的说明字段或测试注释里写依据。
- 每个失败用例原来的断言意图要保留：守恒、对账、拒绝条件不变。

## 可改文件
tests/m2-preconditions.test.mjs、tests/m2-task-flow.test.mjs、tests/m2-action-context.test.mjs、tests/mining-jurisdiction.test.mjs、tests/fixtures/t64-scenarios.json（只改 npc_quest_social 相关条目）。不改 server-plugin/。

## 测试
逐文件跑上面 4 个测试文件；另跑 t64 夹具的其他使用者（grep -l t64-scenarios tests/*.test.mjs）。
