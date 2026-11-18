# MKTW 实现后验收判定 A（冻结规则 v7，out7 共 91 个情形，实现 dbc0082e）

总判定：R2、R3、R5②、R5④、R7、R9 通过；R1、R6 不可测；R5③ 不通过；R4 洪水与旱情前半通过，季节系数按现形态无法判定。重点：价格对缺口只有一道"悬崖"，没有渐变（见"悬崖核查"）。机械结果，不改规则。

## 前置核对
- `head -112 冻结规则.md | sha256sum` = bae32cd9e6a277600a025468df53596b604ce767fffe02db1d6bc88a8b809d54，与 v7 一致。
- out7 共 91 个 jsonl，首行 hash 全为 17b66b08…（基线为 7ee14004…）；末行均 EXIT=0；无 error 行（基线有 2 个）。after-advance 行的 advance.days 全为 8；fixtureUntrusted 183 处全为 null。
- 取行口径同基线：矩阵 = winter-/autumn-/yupo-winter-/yupo-autumn- 开头、mode=without（24 文件、48 个 cell 行、192 个 item 行）；pair- 与 yupo-pair- 只用于 R5②。relPrice = listPrice ÷ regionalBase，自行用 awk 重算；矩阵里 relPrice 与 ratioClamped 逐行相等。
- 夹具不可信（只有 after 行 level>0 而 cov≤0，共 3 个）：loc_hw winter adv8 level 0.05、loc_hw normal adv8 level 0.05、loc_bs_yupo winter adv8 level 0.05。已排除；其余全可信。
- 每组可信数：adv0 为 6；adv8 为 5（hw winter、hw normal、yupo winter）或 6（yupo normal）。

## 矩阵数据（四个食物物品 ration、oat_flatbread、bread、oats 的数完全一样；relPrice）
| 组 | cov 从大到小：relPrice（F=在地板，T=在顶） |
|---|---|
| loc_hw winter/normal adv0 | 1.5：0.5F；0.9、0.6、0.4、0.2、0.05：3.0T |
| loc_bs_yupo winter/normal adv0 | 同上 |
| loc_hw winter adv8 | 1.4174：0.5F；0.8174、0.5174、0.3174、0.1174：3.0T |
| loc_hw normal adv8 | 1.4391：0.5F；0.8391、0.5391、0.3391、0.1391：3.0T |
| loc_bs_yupo winter adv8 | 1.3422：0.5F；0.8178、0.5178、0.3178、0.1178：3.0T |
| loc_bs_yupo normal adv8 | 1.2332：0.5F；0.8543、0.5543、0.3543、0.1543、0.0040：3.0T |

## R1 冬荒高于平时（winter 矩阵 adv0）：不可测（8 项：4 物品 × 2 聚落）
- 平时 adv0 的 cov 1.5 输出在地板（0.5F），按规则改取平时 cov 在 [0.75,1.0) 中最大的可信输出 = cov 0.9，其 relPrice=3.0，在顶；规则"基线若在顶，记不可测"。冬季可信 cov<0.5 输出为 0.4、0.2、0.05（均 3.0T）。
- 不得改判通过。基线判定是"不通过"（食物三项冬等于平），现在转为"不可测"：不是价格表现好了，而是没有可比的非封顶基线。冬季输出全在顶，只报封顶，不判不通过。
- 触顶缺口区间（冬、adv0、两聚落、四物品相同）：从 cov 1.5（level 1.5，缺口 1−cov=−0.5）到 cov 0.9（level 0.9，缺口 0.1）之间顶住。

## R2 越缺越贵：通过（32 组全部通过，全部带封底与封顶）
- 每组恰有一个非"都在顶、都在地板"的相邻对，即 o1（0.5F）→ o2（3.0T），上涨，满足 b)；a) 无任何下降；o2 以后全在顶，不要求上涨，只记录价格相等。
- 离底缺口区间（封底段只有 o1）与触顶缺口区间相同：
  - hw winter adv0、hw normal adv0、yupo winter adv0、yupo normal adv0：cov 1.5（level 1.5，缺口 −0.5）到 cov 0.9（level 0.9，缺口 0.1）。
  - hw winter adv8：cov 1.4174（level 1.5，缺口 −0.4174）到 0.8174（level 0.9，缺口 0.1826）。
  - hw normal adv8：1.4391（缺口 −0.4391）到 0.8391（缺口 0.1609）。
  - yupo winter adv8：1.3422（缺口 −0.3422）到 0.8178（缺口 0.1822）。
  - yupo normal adv8：1.2332（缺口 −0.2332）到 0.8543（缺口 0.1457）。
- 对照基线：食物三项 24 组（价格全相等）不通过 → 全部转通过；oats 7 组通过、1 组整组封顶不可测 → 8 组全部通过（yupo normal adv8 不再整组封顶，因 o1 在地板）。
- 但通过的形态是"0.5 → 3.0 一步到位"，规则的 a)b)c) 只要求"未封顶必上涨"，不检查坡度，见悬崖核查。

## R3 稀缺度同向：通过
- 矩阵相邻对（可信）148 对，违例 0；序列 drought-without 24 对、flood-without 24 对、bs-tight-without 80 对，违例 0。

## R4
- 旱情：前半通过（字面），复位不可判。drought-without：D1=第 1 天（首次含 dry），D0=第 0 天；food 8640→8566 下降；oats ratioClamped 3→3，relPrice 3.0→3.0，满足 ≥。clocks 只有 dry、drought，没有 rain（rain 阶段已随旱情价格倍数删去），D2 无 → 复位不可判。注意：liquan 在第 0 天 cov=1.0 时四个食物物品 supply=0、ratioClamped=3 已在顶，7 天内不变，该检验无区分力；food 的下降与 with 运行逐日相同（日常消耗）。
- 洪水：通过，归类 ②"无源头原因"，10578 并入待替换清单。三输出同日对齐，fixtureUntrusted 均 null；control 的 mode=control，stagesDeleted 含 route_closure（18 项）。F1=第 2 天（crest），F0=第 1 天。supply Δ：ration without 20.2843→20.0920（−0.1923），control 相同；oats 14.4888→14.3514（−0.1374），control 相同；bread 32.9620→32.6495（−0.3125），control 相同。三物品 |Δwithout−Δcontrol| = 0 → 全部"封路无影响"。flood-with 的 supply 与 without 逐日相同。
- 周贸易季节系数：无法判定（按现形态）。规则要求 without 的 seasonFactors 全为 1 且 seasonFactorsReset=true，with 冬系数>秋系数；现输出 16+16 行 seasonFactors=null、seasonFactorsReset=false、seasonFactorsRemoved=true，字段已删，缺 seasonFactors 字段，规则文字对"已删除"形态没有条文。旁证：with 与 without 的 16 对 regionalBase 全相等（如 weiting 秋 3.6421、冬 3.8460 两种模式一样），rules.json 里 settlementTrade.seasonFactors 已删（该键出现次数 2→1，剩下一处是别的表）。要判通过需主会话定条文。
- 疫病、青黄不接：待替换不判。仅记录：spring-without、spring-bs-without 不再报错（基线 day1 报时钟无效），跑满 7 天；epidemic-without 7 天。

## R5
- ①：R2、R3 在 loc_hw、loc_bs_yupo 两聚落、四物品均通过；R1 不可测 → 整条不能判通过，记"部分通过（R2、R3），R1 不可测"。
- ②：通过。24 个 pair 文件共 192 行 modeDiff，withHazard 全为 1，equal 全为 true（基线 38 行 oats 不等，因季节系数已删）。注意 with/without 现在差别只剩 flood、epidemic、spring 等待替换项，所以此条在矩阵上已无区分力。
- ③：不通过。loc_hw 四物品 environment 全为 1；loc_bs_yupo 的 item_oats environment 恒为 1.2414213562（winter、normal 各 12 行，共 24 行），magicFactor=1、forestWaterFactor=1，豁免条件无字段证据。与基线相同，未改善。
- ④：通过。`git diff d252f1f0..dbc0082e` 的新增行（server-plugin、world/design）里没有按聚落 id、物品 id、季节分支的新逻辑；market.mjs 新增代码只用 goods:food 类、饱腹、配方链；rules.json 的改动是删除 price_shift 与把 hazard_phase 的 minimum 改为 stage 名。只 grep 了 diff，没有逐行读完 market.mjs 的 100 行外的上下文。

## R6 逐件涨幅：不可测
buys-without 与 buys-with 数值一致。bread 与 ration 的 10 件购买全部 atFloor=true、ratioClamped=0.5（supply 约 6021 与 3705，demand 约 1098 与 676，ratio 约 0.18），规则要求"atFloor 则不可测，须换场景，不得放宽区间"。
用新诊断字段看成因（只记录）：
- bread k=2：quotedRiseVsPrev=+0.0033%；k=3：+0.0033%；k=4：+0.0033%。explanationParts：scarcity=0.5、curve=0.5（夹取在下限），environment=1、quality=1、spread=1，relation=0.979 不变；唯一在动的是 depth：1.0000332→1.0000664→1.0000996。valueSlot 与 priceSlot 的 contributions 均为空数组（没有倍数槽位介入）。k=2、k=3 的 consistencyError=0。所以涨幅只来自深度项，量级 0.003%，与"供给 −1 带来的稀缺度涨幅"无关——稀缺度被地板夹住了。
- 基线 k=3 的 6.195% 是供给 45/需求 29→30 的 demand +1 台阶；现在 demand 约 1098，demandDelta 为 −0.625、+1、−0.625，对 ratio 影响可忽略，且被地板吞掉，所以 k=3 的尖峰消失。
- ration k=2：quotedRiseVsPrev=−0.1019%（价格由 1.4685 降到 1.4670），expectedRise=+0.0054%，consistencyError=0.00107（>1e-6）。成因：explanationParts.relation 由 0.979 变为 0.97795，rounding 项由 −0.4685 变为 −0.4670，说明价格里有一个按阶梯量化的 relation 项，k=1 与 k=2 之间跨了一档，这是报价取整引起的负涨幅；k=3、k=4 回到 +0.0054%，consistencyError≈2e-16。该行在地板上，不进 R6 判定，但提示"在地板时 relation 量化会让逐件价格出现小幅回落"。
- 要测 R6 必须换到不在地板也不在顶的缺口（本批数据里没有这样的情形，因为价格对缺口是悬崖式的，见下）。

## R7 开关核验（按实际 rules.json 重算）：通过
- 重算：rules.json 的 `"kind": "price_shift"` 条数由 50 变 35，差 15（famine 钟 11 处 + loc_bs tight 1 处 + 旱情 3 处，与提交说明 "famine ×12 incl. loc_bs tight, drought ×3" 一致）；输出里 priceShiftEffectsInWorld 矩阵 with、without 全为 35，stripped=0，stagesDeleted=[]（famine:loc_bs:tight 已不在世界里，所以不再出现在 stagesDeleted，符合"按实际重算"）。
- 各类剥离：flood-without stripped=1（priceShift 34），spring 两个 without stripped=15（20），epidemic-without stripped=19（16）——均为待替换项，35−剥离数自洽。
- seasonFactorsRemoved=true。
- famine 阶段日 hazardFactor：矩阵 with 的 after 行 famineStages=["tight"]，但 hazardFactor 为 1（倍数已删），平时为 1。全部 91 个文件里 hazardFactor 不为 1 的只有 flood、epidemic、spring 等待替换情形（1.1、1.15、1.2、1.3、1.5）。

## R9 bs-tight：通过
- 夹具：with 的 famine:loc_bs_sangban 阶段史 d1 [tight]、d8 起 [tight,famine]，含 famine，夹具足够。
- ① without 的 sangban d8 起含 famine。通过。
- ② without 的 famine:loc_bs d1 起为 [famine]。通过。
- ③ without 的 famine:loc_ms_tanjie：d1 [tight]，d8 起 [tight,famine]；famine 在 loc_bs 的 famine（d1）之后。通过（基线 20 天只有 tight，已修复，hazard_phase 按阶段名生效）。
- ④ loc_bs 与 sangban 的 starvation 21 天逐日全为 0（with 与 without 各 42 个读数）。通过。
- ⑤ F1=d1、F0=d0：loc_bs 的 oats、ration ratioClamped 3→3（不下降），relPrice 3.0→3.0，不回退。通过。
- 注意：with 与 without 现在是同一个世界（两边都没有 tight 和 famine 倍数），所以对比无区分力，两条运行的阶段史完全一致。

## 悬崖核查（农事聚落库存跌破 90 天储备时）
结论：是悬崖。库存一跌到 90 天储备（cov=1.0）及以下，价格立刻钉在上限 3.0；上方 cov 约 1.2 以上则钉在下限 0.5，缺口侧没有渐变。
- 缺口侧证据：loc_hw spring-with d0 cov=1.0000（刚好等于储备），ration 等四物 ratioClamped=3（supply 51.86，demand 674.8）；liquan drought-without d0 cov=1.0，四物全在顶（supply 0，demand 1000.8 等）；其后 cov 0.9664（d6）仍在顶；矩阵 cov 0.9 到 0.05（8 天后 0.004）全部 3.0。最小观测缺口（1−cov）= 0 就在顶。
- 盈余侧证据：cov 1.2332（yupo normal adv8）、1.3422、1.4174、1.4391、1.5 全在 0.5 地板。
- 两侧之间没有数据（cov 1.0 到 1.2332 之间无采样）。
- 机制（读代码 market.mjs 新增行）：公仓可售份额 = 库存 − 口粮储备（餐口 × reserveDays）− 承诺，且取 max(0, …)；库存不超过储备时供给只剩店里货架（hw 约 51.86、yupo 为 0），而需求约 676（hw）、835（yupo）固定不变，ratio=需求/供给 约 13 到几百，远超 3 倍上限。由数据反推（推断，非直接观测）：hw 供给 = 51.86 + 1.4×(food − 储备)（lv1.5：3705.86；winter adv8 lv1.5：3102.46，两点吻合），则上限被离开的位置约在 cov≈1.024（ratio 降到 3），下限被触到的位置约在 cov≈1.18（ratio 降到 0.5）；yupo 约 1.028 与 1.166。也就是整个渐变区只有约 0.15 的 cov 宽度，库存稍低于储备就是满额上限。
- 规则是否因此判不通过：不。v7 的 b) 只要求"未封顶必上涨"，o1→o2 的 0.5→3.0 满足；c) 只要求报区间。该问题要靠规则之外的判断（是否需要缺口侧的渐变带、或 3 倍上限是否过低，后者规则已声明另开待查）。
- 相关：缺口档 0.9 到 0.05 的价格完全相同（都是 3.0），R2 在这一段只能"封顶不判"，无法再检验缺口越大是否越贵。

## 与基线对照
- 转为通过：R2（基线 24 组食物价格全相等不通过）、R5②（基线 38 行 oats 因季节系数不等）、R9（基线 tanjie 卡在 tight）、R7（按重算口径）、R5④（基线无法判定，现可 grep diff）。
- 变为不可测：R1（基线不通过，现基线价在地板、回退基线在顶）、R6（基线 6.195% 与一致性不过，现全部在地板）。
- 仍不通过：R5③（yupo oats environment=1.2414，源头不明）。
- 仍待判：R4 旱情（oats/食物第 0 天已在顶，区分力为零，复位不可判）、R4 季节系数（字段已删，规则无条文）、R5①（因 R1 不可测）。
- 洪水归类仍是 ②；R3 仍通过。

## 可疑之处与分诊
1. 悬崖（上文）：判规则通过，但行为上缺口档 0.9 到 0.05 完全同价，R1、R6 因此无法找到非封顶对照；这是规律缺口候选（需缺口侧的渐变带），也可能是上限 3 倍的问题，规则另开待查，我不判。
2. epidemic 情形（待替换，不判）：day0 granary food=8000、cov=1.5326，但 ration ratioClamped=3、supply=51.86，与矩阵 cov 1.5（地板）矛盾；day1 food 直接变 0。granarySet=null，疑为未设 fixture 时 supply 未重算或疫病情形把仓清空，建议核对探针。
3. liquan（旱情）与 loc_bs 的 supply 恒为 0 或很小，食物价格全程在顶，旱情检验、洪水检验在这些聚落上没有区分力。
4. yupo oats environment=1.2414 来源不明（magic、forestWater 为 1）。
5. R6 的 ration k=2 出现 −0.10% 的负涨幅，来自 relation 量化阶梯，不是稀缺度；说明价格里存在按 0.00005 级别取整的项。
6. with/without 在矩阵上已无差别，R5②、R9 的对比只剩形式意义。
7. 全部 91 个文件首行 hash 相同、无 error，数据看起来完整。
