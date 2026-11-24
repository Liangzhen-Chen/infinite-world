# 4-4c 终核（Sonnet 5.5 中档，只读）

（原文由主会话从 F:/dnd-tmp/review/ 原样入库。）

结论：**可封**

范围：`git diff origin/master...ds/44c`（det-math.mjs、sample.mjs、sample.test.mjs、criteria.json、只核与卡回报）。

## 1. 初值、步数、收尾的推导
- 初值 y0 = 2^⌈k/2⌉（k=bitLength(n)）。n < 2^k，故 y0 ≥ 2^(k/2) > √n，牛顿法从上方单调下降，整数迭代不会跌破 ⌊√n⌋。
- 相对误差：y0/√n ≤ 2^⌈k/2⌉ / 2^((k-1)/2) ≤ 2，初始相对误差 e0 ≤ 1。每步 e' ≈ e²/(2(1+e))：1 → 0.25 → 0.025 → 3e-4 → 4.7e-8 → 1e-15 → 5e-31 → 1e-61。
- 最大输入：detfn sqrt 域 2⁵³−1 经 outScale²/inScale=10⁸ 放大约 9×10²³（≈2⁸⁰，√n≈2⁴⁰）；sample 调用点远小于此。要让 e·√n < 1 需 e < 2⁻⁴⁰≈10⁻¹²，第 6 步已满足，第 7–8 步入整数不动点（⌊√n⌋ 或 ⌊√n⌋+1）；32 步余量 ≥ 24 步。
- 收尾 min(y, ⌊n/y⌋)：不动点处 y ∈ {⌊√n⌋, ⌊√n⌋+1}，取小者即 ⌊√n⌋，成立。
- 卷文只写"牛顿法固定步数 32"，未定初值；2^⌈k/2⌉ 是标准且确定的整数初值，属合理实现，不用写死特例。步数来自 `fnTables.sqrt.iterations`（det-numeric.json:3687 = 32），缺则抛 E-DIM-STRUCT-FIELD。
- n=0 直接返回 0；负数抛 E-DET-DOMAIN（零/空/负无绕过口）。

## 2. 测试先行与期望值
- 新增四个测试：左支 0.51、右支 2.7、与 detfn sqrt 同值 5196、缺步数即拒。步数行由测试自己装（`SQRT_ROW`），不读生成表。
- 手算核过：5196²=26998416 ≤ 27000000 < 5197²；左支 r=54、f=5000>54；右支 9972963 → v=27037 → 2.7；51961524 → ÷10⁴ = 5196。均为字面量，无放宽断言，无为测试造的设施。
- 实跑 `node --test tests/kernel/sample.test.mjs tests/kernel/det-numeric-fn.test.mjs`：27 通过 0 失败。

## 3. 全仓一份
- grep：运行时代码仅 `det-math.mjs:471` 一份 `fixedSqrtInt`；`sample.mjs:288` 只调用，无步数常数；sample 的 isqrt 已删。
- 说明（非阻断）：`tools/gen-det-tables.mjs:35、:211` 另有 isqrt/isqrtBig，是离线生成器（BigInt 高精度，用于产表），不是内核运行路径，不属于"全仓运行时一份"的范围，已按卷文生成口径存在；建议问题.md 记一句边界即可。
- criteria.json 只经登记器改（各检测器指纹重盖，ref 写明 4-4c，口径不变）。

## 结论
可封。无必须改项。
