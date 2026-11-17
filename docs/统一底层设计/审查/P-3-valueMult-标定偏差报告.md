# P-3 valueMult 标定偏差报告（卷三乙 §7 M3b-27）

供李白核。命令：`node tools/calibrate-valuemult.mjs`（只读，不写数据）。旧数据取标签 `old-final-1117`；旧价只作标定输入，不写进任何行。

## 做到哪一步

M3b-27（卷三乙 :2059）要求用旧 items.json 的 `basePrice` 离线标定 `valueMult` 与 `rules.valuation.unitValue`，并出"派生 valueBase 对旧价"的偏差报告。派生式是卷三乙 §4.16 V-1（:1707）：
① 有定价配方的物品：（各消耗项参考价值 + 工时 × `rules.crafting.laborRate`）×（1 + `valueAdd`）÷ 基础产出件数；
② 否则：`massKg × 按 M-1 聚合的 valueMult × unitValue`。

| 步 | 内容 | 结果 |
|---|---|---|
| 1 | 取旧物品与旧价 | 486 件，全部有 basePrice 与 weight |
| 2 | 按 V-1 分路 | 有产出配方（旧 recipes.json 的 output 或 byproducts）350 件走 ①；无配方 136 件走 ② |
| 3 | ② 路列方程：旧价 ÷ 重量 = Σ 材料份额 × valueMult × unitValue | **停在这里**：M-1 的输入是物品的材料组成（卷三乙物品表 `material` 列），旧 items.json 与 mechanics/items.json 都没有这一列，136 件里带材料组成的 0 件 |
| 4 | 定尺度 unitValue | 未做：规则表 `rules.valuation.unitValue` 未载入、卷文无数；材料表现有 5 个卷文例值（熟铁 10、竹 1、山羊毛 2、黑火药 30、鬼火油 60）可作尺度锚，但要先有第 3 步的方程 |
| 5 | ① 路 | 未做：要新配方表与 `laborRate`、`valueAdd`，均未载入 |
| 6 | 偏差报告 | 无可算项：标定用到的旧物品 0 件，偏差超阈值 0 件 |

阈值：M3b-27 写"偏差超阈值的逐件核对"，卷文没给阈值的数，也没指向哪个规则表键。

## 缺什么

1. 物品的材料组成（物品表迁移卡产出，卷三乙 §4.2 `material` 列）。不按物品名称或标签对材料行，那是自补对应关系。
2. `rules.valuation.unitValue`（及走 ① 路时的 `rules.crafting.laborRate`、`valueAdd` 与新配方表）。
3. 阈值的出处。

在此之前材料表 88 行的 valueMult 缺值（5 行有卷文例值），加载报 88 条 E-DIM-REQUIRED-MISSING；按改令不暂定。
