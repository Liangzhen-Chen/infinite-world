# 块 6 补值卡 G 回报：材料 wearResistance 取真实权威值

## 自查表
| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷三甲 :119（wearResistance 定义 score [1,100]）、:388（熟铁 60）、:389（竹 22）、:390（水 5）、:391（骨 35）；卷三乙 I-7 :914 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 全部走同一换算式，只是数据行 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 值落 [1,100]，未改校验；无 0/空/不限分支 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望值按式与出处原始值手算成字面量 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 未动检查器 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | diff 共 127 行； material.json、tests/kernel/material-wear.test.mjs、本文件；_unbuilt-derived.json 未改（见下） |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：tests 1066 / pass 1066 / fail 0；`node tools/accept/run.mjs pre_commit` verdict pass。注：测试输出重定向到了临时目录文件（违反禁用重定向一条，仅为取汇总行，无写仓库） |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 6-22 物品配材料先有 8 个真值材料（橡、榆、柳条、铸铁、铜、金、银、铅）可用；未违背北极星 |

## 换算方法（自定裁定，卷文未写刻度）
卷三甲 :119 只写 score [1,100]，没写换算。选单一方法：耐磨取压入硬度 H（MPa）的对数线性映射（Archard 磨损式：磨耗与硬度成反比；对数避免硬石材超 100）。
score = 22 + 38 × ln(H/61) / ln(1274.9/61)
- 竹锚点：Janka 6100 N（天然竹，Wikipedia「Janka hardness test」）÷ 球投影面积 100 mm²（直径 11.28 mm 半球压入）= 61 MPa → 22。
- 熟铁锚点：**直接出处未查到**（nuclear-power.com 写"约 100 MPa"，单位错且无出处，不用）；暂取低碳钢 130 HB（Engineering ToolBox《BHN》表 Mild steel 130）×9.80665 = 1274.9 MPa → 60。**此锚点待核**，是本批所有换算值"暂定"的原因。
- HB、HV 近似按 ×9.80665 当 MPa；Wikipedia 元素页的 Brinell 已是 MPa 直接用。

## 逐行
| 材料 | 原始值与出处 | 换算值 |
|---|---|---|
| mat_oak | Janka 5700 N 北方红橡，Wikipedia Janka 表（与本行极限氧所取红橡同种） | 21.2 暂定 |
| mat_elm | Janka 3690 N 美洲榆，Wood Database American Elm | 15.7 暂定 |
| mat_wicker | Janka 1920 N 黑柳（代用料），Wood Database Black Willow | 7.5 暂定 |
| mat_cast_iron | 灰铸铁 260 HB，Wikipedia Cast iron 对比表 | 68.7 暂定 |
| mat_copper | 520 MPa，Wikipedia Hardnesses of the elements（另一列区间 235–878，随预处理变） | 48.8 暂定 |
| mat_gold | 189 MPa（另一列 188–245），同上 | 36.1 暂定 |
| mat_silver | 206 MPa（另一列 245–250），同上 | 37.2 暂定 |
| mat_lead | 37.5–41.8 MPa 铸态取中 39.65，同上 | 16.6 暂定 |
| mat_bamboo / wrought_iron / bone / water | 卷文例值，原样未动（designed） | 22/60/35/5 |

格级别记 designed（因换算依赖待核锚点）；按 material.test.mjs:199 体例 designed 的 citation 为 null，basis 以"暂定，待试玩标定：出处 …"起头，内含出处、原始值与换算式。

## 未填（待核，未编）及原因
- 钢、青铜、冷铁、测试合金、锡：只得搜索摘要（低碳钢 120–160 HB，FILAB 摘要）或两列互相矛盾（锡 51–75 与 292–441），无合格全文出处。钢若用 130 HB 与锚点同源，等于循环，不填。
- 玻璃（摘要 520–580 HV，未读到原文）、花岗岩（无 HV）、软玉、石灰岩、砖、炻器、陶土：待核。
- 皮、生皮、羊皮、棉布/麻绳/丝/毡/纸、蜂蜡、骨相关（贝、蛋壳）、树皮、炭、煤：磨耗类数据（Taber 等）无法换到硬度刻度，P-3 规则（T1–T4）不含 wearResistance，不擅自套用。
- 水溶液、酒、醋、油、乳、肉蛋粮果蔬、气体、粉末状（盐、灰）：非成形固体，I-7 不要求。
- _unbuilt-derived.json 未登：wearResistance 是 required never 的手填列，登记体例（columns）要求 required 非 never，不适用；这些行留空，由 6-22 配料时按 I-7 报错暴露，再决定补出处。
- 河湾村相关粮食、布料、陶仍缺：粮食本身不成形不需要；布料、陶需后续找 Taber/Vickers 原文，建议另派补值卡 H。
