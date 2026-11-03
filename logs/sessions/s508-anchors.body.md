# 卡 S508A：港口运货测试四处价格断言分诊

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/S508A，分支 t-s508-anchors，基于 s5a@3790d3f8。

## 背景（主会话二分结果）
s5a 上这几处断言失败，首个失败合并点是 a550398d（merge t-w8e6-leftovers：baseline 估值角色、无从估价不当 0、驿传按真实班次、**市场供给不计估价对象本人行囊**）。它之前的 f0de40b9 全过。

| 用例位置 | 期望 → 实际 |
|---|---|
| tests/s5-08-w3a-transport.test.mjs:60 destroyed carrier | 货值 479 → 498 |
| tests/s5-08.test.mjs:77 real market quote | 报价 138 → 143 |
| tests/s5-08.test.mjs:214 two published road legs | 关税 [150,150] → [900,900] |
| tests/s5-08.test.mjs:254 fare and goods | 报价总额 385 → 521 |

## 要做
对每一处，用 `git diff f0de40b9 a550398d -- server-plugin/` 中的实际改动，手算新旧两个数各自怎么来的（公式、输入、出处 文件:行）。然后判断：
- 新值是 E6 那几条规律的正确结果 → 把断言锚点改成新值，注释写手算式和依据（这是更新已变规律下的锚点，不是放宽：保持严格等值断言）。
- 新值不对（例如关税 6 倍来自把税基算错、重复计价、单位混淆）→ 修代码，不动断言，写明根因。
关税 150→900 要特别核实：税基、税率、货量各是多少，哪一个变了 6 倍、凭什么。

## 验收
逐文件：s5-08、s5-08-w3a-transport、w8e6-leftovers、w8a-price-migration、transport、settlement-trade、finance-assets；CORE 三件与同步四件套。若改代码导致金快照变化，按共同规则出字段表。
汇报加一张表：每处的旧值算式、新值算式、结论（改锚点/修代码）与依据。
