# MKTW 基线判定 A（冻结规则 v7，out6 共 91 个情形）

总判定：有不通过项；另有封顶项、不可测项、无法判定项、待替换不判项。本轮是基线（手写倍数尚未删除），以下是机械结果，不改规则。

## 前置核对
- `head -112 冻结规则.md | sha256sum` = bae32cd9e6a277600a025468df53596b604ce767fffe02db1d6bc88a8b809d54，与 v7 一致。
- out6 共 91 个 jsonl（另有 progress.log）。首行 hash 全为 7ee14004…；末行均 EXIT=0 + FINISHED。cases.txt 的 97 行里，drought/epidemic/flood/season/spring/spring-bs 是总称，实际拆为 -with/-without（flood 另有 -control），91 个文件都在。
- 所有 after-advance 行 advance.days=8；所有 cell 行 fixtureUntrusted=null。
- 矩阵取行口径：情形名以 winter-、autumn-、yupo-winter-、yupo-autumn- 开头、mode=without（24 个文件、48 个 cell 行、192 个 item 行）；pair- 与 yupo-pair- 只用于 R5②。
- relPrice = listPrice ÷ regionalBase；自行用 awk 重算。
- 夹具不可信：before 行无（cov=level）；after 行只有 3 个因 level>0 而 cov≤0（仓见底）：loc_hw winter adv8 level 0.05、loc_hw normal adv8 level 0.05、loc_bs_yupo winter adv8 level 0.05（cov=0）。已排除。yupo normal adv8 level 0.05 cov=0.004028>0，可信。
- 每组可信输出数：adv0 全为 6；adv8 为 5（hw winter、hw normal、yupo winter）或 6（yupo normal），均 ≥3。

## 关键数据（relPrice；cov 从大到小）
| 组 | 食物三项（ration/flatbread/bread） | oats |
|---|---|---|
| loc_hw winter adv0 | 全程 0.617021（cov 1.5→0.05 六档不变） | 2.0（cov1.5）→3.0（0.9、0.6、0.4、0.2、0.05，ratioClamped=3 在顶） |
| loc_hw normal adv0 | 同上 0.617021 | 同上 2.0→3.0 |
| loc_bs_yupo winter/normal adv0 | 全程 1.0 | 2.0→3.0 |
| loc_hw winter adv8 | 0.617021（cov 1.4174…0.1174） | 2.3956（1.4174）→3.0（0.8174…0.1174） |
| loc_hw normal adv8 | 0.617021 | 2.2775（1.4391）→3.0（0.8391…0.1391） |
| yupo winter adv8 | 1.0 | 2.9221（1.3422）→3.0（0.8178…0.1178） |
| yupo normal adv8 | 1.0 | 3.0 从 cov 1.2332 起全程在顶 |

## R1 冬荒高于平时（winter 矩阵 adv0）：不通过
基线 = 平时 adv0 的 cov=1.5 输出（不在地板、不在顶）。冬季可信 cov<0.5 输出 = 0.4、0.2、0.05（adv0 全可信）。
- 食物三项 × 2 聚落（共 6 个物品）：冬季 relPrice 与基线相等，不满足"严格大于"。loc_hw：冬 0.617021 = 平 0.617021；loc_bs_yupo：冬 1.0 = 平 1.0。不通过（6 项）。
- oats × 2 聚落：冬 3.0 > 基线 2.0，上涨，成立；冬季三档均在顶，封顶，不判不通过。通过（封顶）。
- 触顶缺口区间（两个聚落、冬、adv0 相同）：从 cov 1.5（level 1.5，缺口 1−cov=−0.5）到 cov 0.9（level 0.9，缺口 0.1）之间开始顶住。

## R2 越缺越贵：不通过（32 组：24 组食物不通过，oats 7 组通过且封顶，1 组整组封顶不可测）
- 食物三项 × loc_hw、yupo × winter、normal × adv0、adv8 = 24 组：相邻对 relPrice 全相等（hw 0.617021，yupo 1.0），不在顶也不在地板，违反 b)"未封顶必上涨"；a) 不下降成立。不通过。每组均未封顶、未封底。
- oats（8 组）：a)、b) 成立（唯一不是"两者都在顶"的相邻对是 o1→o2，皆上涨）。
  - hw winter adv0：触顶区间 cov 1.5（level 1.5，缺口 −0.5）到 0.9（level 0.9，缺口 0.1）；2.0→3.0；未封底。通过（封顶）。
  - hw normal adv0、yupo winter adv0、yupo normal adv0：同上。通过（封顶）。
  - hw winter adv8：cov 1.4174（level 1.5，缺口 −0.4174）到 0.8174（level 0.9，缺口 0.1826）；2.3956→3.0。通过（封顶）。
  - hw normal adv8：cov 1.4391（level 1.5，缺口 −0.4391）到 0.8391（level 0.9，缺口 0.1609）；2.2775→3.0。通过（封顶）。
  - yupo winter adv8：cov 1.3422（level 1.5，缺口 −0.3422）到 0.8178（level 0.9，缺口 0.1822）；2.9221→3.0。通过（封顶）。
  - yupo normal adv8：o1（cov 1.2332，level 1.5）就在顶，"不晚于 cov 1.2332（缺口 −0.2332）顶住，更小缺口无数据"；整组封顶，不可测（规则 d）。
- 封底：32 组均未封底（可信输出里没有 atFloor；loc_hw normal adv8 level 0.05 的食物 atFloor=true，但该行不可信已排除）。

## R3 稀缺度同向：通过
- 矩阵（相邻 cov，可信行）：148 对，违例 0。含不可信行共 160 对，违例 0。
- 序列（相邻两天，按物品）：drought-without 24 对、flood-without 24 对、bs-tight-without 80 对，违例 0。

## R4
- 旱情：前半通过（字面），复位不可判。
  - drought-without：D1=第 1 天（首次含 dry），D0=第 0 天；granary.food 8640→8566，下降。oats ratioClamped 3→3（≥），relPrice 3.0→3.0（≥），成立。
  - D2：without 的阶段史只有 dry、drought，没有 rain（rain 已被 strip 清空），复位部分不可判。
  - 注意：oats 从第 0 天就是 supply=0、demand=8640、ratioClamped=3（在顶），该检验没有区分力；food 下降与 with 运行逐日完全相同（8566、8519…），像日常消耗，不像 crop_damage 落仓。
- 洪水：通过，归类 ②"无源头原因"，10578 并入待替换清单。
  - 三输出同日对齐，fixtureUntrusted 均 null；control 的 mode=control，stagesDeleted 含 route_closure（18 项）。
  - F1=第 2 天（麦月 2 日，首次含 crest），F0=第 1 天。supply Δ：ration without 8→7（−1），control 8→7（−1）；bread 同（−1，−1）；oats 8→8（0，0）。三个物品 |Δwithout−Δcontrol|=0，全部"封路无影响"。
  - flood-with、without、control 的 supply 与 ratioClamped 七天逐日完全相同。
- 周贸易季节系数：通过。
  - without 的 16 行 seasonFactors 全为 [1,1,1,1]，seasonFactorsReset 全为 true。
  - with 的 16 行 seasonFactors=[0.9,1,1.1,1.2]；冬（season=3）系数 1.2 > 秋（season=2）系数 1.1，成立。
  - 旁证：with/without 的 regionalBase 比，weiting 冬 4.6152/3.8460=1.2，秋 4.0063/3.6421=1.1。
  - without 同聚落四季 regionalBase 差异只记录：如 weiting 3.642（秋）到 4.345（夏），来自运输 risk，不判。
- 疫病、青黄不接：待替换不判。仅记录：spring-without（price:loc_hw）与 spring-bs-without（price:loc_bs）在 day1 报错"灾害时钟地点、季节或间隔无效"，只跑 2 天；epidemic-without 跑满 7 天。

## R5
- ①：不通过（继承 R1、R2：两聚落食物三项均不上涨、不递增；R3 两聚落均通过）。
- ②：不通过（字面）。24 个 pair 文件共 192 行 modeDiff，withHazard=1 的 162 行里 equal=false 有 38 行，全是 item_oats（environment、regionalBase、listPrice 为 false），seasonFactorWith 为 1.1（24 行）或 1.2（14 行）；食物 124 行全 true。分布：pair-autumn 12、pair-winter 7、yupo-pair-autumn 12、yupo-pair-winter 7。见"可疑之处"3。
- ③：不通过。loc_hw 全为 1；loc_bs_yupo 的 item_oats environment 恒为 1.2414213562（winter、normal 各 12 行共 24 行），这些行 magicFactor=1、forestWaterFactor=1，规则豁免条件（含魔法/林水）无字段证据。其余物品环境全为 1。
- ④：无法判定（需 grep 与读 diff，不在输出里；缺：被测代码 diff）。

## R6 逐件涨幅：不通过
buys-without 与 buys-with 数值一致；bread 的 atFloor、atTop 均为 false。
- k=2：quotedRiseVsPrev=2.4986%，在 [2.0%, 3.2%]。
- k=3：6.1952%，超上限 3.2%。
- k=4：2.7043%，在区间内。
- 一致性：k=2 的 consistencyError=0.0011，>1e-6（expected 2.6087%）；k=3、4 为 0。
- 说明：k=3 时 demand 29→30（demandDelta=+1）。R6 判据只看数值，不通过。

## R7 开关核验：通过
- 默认 without（矩阵 24 个文件 48 个 cell 行 + season-without）：stripped=15；stagesDeleted 含 famine:loc_bs:tight（另有 price:loc_bs_liquan:rain:emptied）；seasonFactorsReset=true；priceShiftEffectsInWorld 35，with 为 50，差 15。
- with：stripped=0，seasonFactorsReset=false。
- famine 阶段日 hazardFactor：with 矩阵 after 行 tight 日为 1.2，与 world/meta/rules.json 中 famine:loc_hw tight 的 factor 1.2 一致；平时（before 行、秋季）为 1。
- 备注：bs-tight-without、famine-hw-without 的 strippedClasses 只有 ["winter"]，stripped=12（50−38=12，内部一致），与规则里"默认三类 =15"不同（旱情 3 条未剥）；drought-without=3，flood-without=1，spring/epidemic 各按自身类。未把这些算作 R7 失败。我没有逐条数 rules.json 的 15。

## R9 bs-tight：不通过（缺粮回退）
- 夹具：with 的 famine:loc_bs_sangban 阶段史为 [tight]（d1）、[tight, famine]（d8 起），含 famine，夹具足够，可判。
- ① 通过（without 的 sangban d8 起含 famine）。
- ② 通过（without 的 famine:loc_bs 自 d1 起为 [famine]）。
- ③ 不通过：without 的 famine:loc_ms_tanjie 到 d20 只有 [tight]，没有 famine。
- ④ 通过（loc_bs 与 sangban 的 starvation 21 天逐日全为 0，不大于 with）。
- ⑤ 通过：F1=d1、F0=d0。oats ratioClamped 3→3（≥），relPrice 3.0→3.0；ration ratioClamped 0.875→1.25（上升），relPrice 0.875→1.25（不回退）。
- 分诊：像 hazard_phase 依赖错位（tanjie 在 without 下卡在 tight）。20 天内应不应到 famine，无字段可证。

## 分诊与可疑之处
1. 食物三项价格与粮仓缺口完全无关：supply、ratio 在 cov 1.5 到 0.05、冬与平时、adv0 与 adv8 全不变（hw 恒 47/29，yupo 恒 supply 0），relPrice 不动。R1、R2 食物不通过属规律缺口候选，需主会话分诊。
2. oats 在 cov≤0.9 即钉在 ratioClamped=3；yupo normal adv8 在 cov 1.23 已在顶。顶得很早，R1、R2 对 oats 的区分度很低。3 倍上限是否过低，规则声明另开待查，不判。
3. R5② 口径冲突：modeDiff.withHazard 只反映灾害系数，不含周贸易季节系数；季节系数在 with 里每一天都推高 oats，使 withHazard=1 的 oats 行必然不等。按字面判不通过；若规则本意是排除季节系数项，则口径应改（不由我改）。
4. R5③ 的 yupo oats environment=1.2414：magic、forestWater 均为 1，来源不明（可能是作物或地形项），规则无对应说明。
5. R4 旱情：oats 第 0 天已在顶，且 food 下降与 with 完全同步，该检验形同虚设（应作"源头未触及仓"类规律缺口分诊）；without 的阶段史没有 rain，复位不可判。
6. R6：k=3 的 demand 在购买序列中途变化 +1；bread 自 k=8、ration 自 k=6 起 ok=true 但 supply 不再下降（涨幅 0），疑似购买量或库存口径。探针只记录，不判。
7. R9：with 运行里 famine:loc_bs 20 天阶段史为 null（granary food=0，coverage=0），without 却自 d1 即 famine，with 侧无阶段基线；tanjie 在 without 下 d1 即 tight，with 下为 null。
8. spring-without、spring-bs-without 在 day1 报"灾害时钟地点、季节或间隔无效"，是剥空阶段后的实现缺陷或探针缺陷，待替换项不判，另报。
9. yupo 食物 supply=0、demand=1、ratio=1，物价恒 1.0，说明该聚落食物没有市场深度，R1、R2 在 yupo 食物上本就没有区分力。
