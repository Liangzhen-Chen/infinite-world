# MKTW 实现后验收判定 B（独立，未读判定 A）

依据：冻结规则 v7。`head -112 冻结规则.md | sha256sum` = bae32cd9e6a277600a025468df53596b604ce767fffe02db1d6bc88a8b809d54，一致。
数据：F:/dnd-tmp/mktw/out7，91 个 jsonl，均有 done 行。用 grep/awk/sed 读取，未运行 node 或其他脚本。
对照：F:/dnd-tmp/review/mktw-验收判定B.md（基线）。实现提交 dbc0082e（含 acb35c6b、c6b57fe8、02115f15）。

## 取数与夹具
- 取行口径同基线：单模式矩阵 24 个 without 文件，32 组（settlement, season, phase, item）。
- relPrice 与 ratioClamped 逐行同值（差为 0）。
- 所有 fixtureUntrusted 为 null；advance=0 行 cov 等于 level，可信。
- 夹具不可信（仍然）：3 个 after 行 level=0.05 的 cov=0，不进组：hw winter、hw normal、yupo winter。涉及 12 组（每个 ×4 物品）。这 12 组各剩 5 个输出，其余 20 组各 6 个。
- **32 组形状完全相同**：cov 1.5 档在地板（0.5），其余全在顶（3.0）。四种物品同价，因为已并池，ratio 相同。
- 可信输出里：地板 = 每组的第 1 个（cov 最大）；顶 = 其余全部。没有第三种取值。

## R1 冬荒高于平时（advance=0）：不可测（8 项全部）
- 基线取平时 before 的 cov 1.5，在地板（0.5）。按规则改取 [0.75, 1.0) 里 cov 最大的可信输出，即 cov 0.9。
- cov 0.9 的价格是 3.0，在顶。规则写明"基线若在顶，同样记不可测"。
- 8 项（2 聚落 × 4 物品）都是此情况。冬季 cov 0.4、0.2、0.05 三个输出也都是 3.0（在顶）。
- 基线判定里这是"不通过"（食物三件相等）；现在转为"不可测"，原因是平时的可比基线本身已被推到顶。
- 冬季输出触顶区间：见下文 R2。冬季没有输出在地板。

## R2 越缺越贵：通过（32 组全部）
- a) 没有任何一对下降。
- b) 每组只有一个相邻对 (o1 在地板, o2 在顶) 需要上涨：0.5 → 3.0，上涨。其余相邻对两者都在顶，只受 a)，价格相等，仅记录。
- d) 没有整组封顶或整组封底的组（基线里 yupo normal after 的整组封顶也不存在了）。
- c) 缺口区间：每组的**离底区间与触顶区间是同一个区间**，也就是悬崖。缺口 = 1−cov。

| 组 | 离底：最后在地板的 o1 | 触顶：首个在顶的 o2 |
|---|---|---|
| 4 个 before 组（hw、yupo × winter、normal） | cov 1.5（level 1.5，缺口 −0.50） | cov 0.9（level 0.9，缺口 +0.10） |
| hw winter after | cov 1.4174（缺口 −0.417） | cov 0.8174（缺口 +0.183） |
| hw normal after | cov 1.4391（缺口 −0.439） | cov 0.8391（缺口 +0.161） |
| yupo winter after | cov 1.3422（缺口 −0.342） | cov 0.8178（缺口 +0.182） |
| yupo normal after | cov 1.2332（缺口 −0.233） | cov 0.8543（缺口 +0.146） |

- 以上区间只来自矩阵档位。另有两个情形给出更窄的上界：
  - drought-without 的 loc_bs_liquan，cov 1.0000（food 8640 等于目标）时四件食物已是 3.0（supply=0）。
  - spring-without 的 loc_hw，cov 1.0000（food 5220 等于目标）时也是 3.0（supply 51.86，只剩货架存量）。
  - 所以 3.0 在 cov = 1.0（缺口 0）已经顶住。
- 封底段只有 o1 一个；封顶段是其余全部，价格相等。封顶段内无法判断缺口大小对价格的任何影响。
- 与基线对照：24 组食物 "全平"不通过 → 通过（食物与 oats 并池后同价，随池上涨）。oats 7 组仍通过，1 组由"整组封顶，不可测"转为"通过"。

### 悬崖核查（重点）：**存在悬崖**
- 数据直读：
  - hw 平时 after：cov 1.4391 → 0.5；cov 0.8391 → 3.0。
  - yupo 平时 after：cov 1.2332 → 0.5；cov 0.8543 → 3.0。
  - cov 1.0 的两处观测：drought、spring，都已是 3.0。
  - 价格 0.5 → 3.0（6 倍），而覆盖率只相差 0.23 左右（yupo）。cov ≤ 1.0 以下一律 3.0，没有梯度。
- 机理（来自逐行 supply、demand 与 acb35c6b 的 diff）：
  - ration 的 demand 在 cov 1.5、0.9、0.6、0.4 全是 675.814，**不随库存变**。
  - supply = max(0, 库存 − 目标留存 − 承诺) 再加货架存量。cov < 1 时仓贡献为 0，supply 固定为 51.86（hw）。
  - ratio = 675.8/51.86 = 13.03，直接钉在上限 3。
  - cov ≥ 1 时：hw cov 1.5 时 supply 3705.9，ratio 0.18，在地板。
- 推算（不是数据直读，假设 demand 不变）：连续过渡带只有 cov ≈ 1.03 到 1.25（hw）。
  - 地板在 supply ≥ 1351.6，即 cov ≥ 1.249。
  - 顶在 supply ≤ 225.3，即 cov ≤ 1.033。
- 结论：库存一跌破 90 天储备（甚至只是等于），价格就钉到上限，缺口再深也不再涨。"需求 = 目标留存 + 缺口 + 承诺"里的缺口项：
  - 只来自家户预算的 procurementShortfall，一户只记一次。
  - 公共粮仓自己的缺口没有进 demand。
  - 没有进 demand 的缺口体现在 supply 的 max(0, …) 截断上，这是悬崖的来源。
- 分诊：规律缺口（缺口深度没有接入价格）。按 v7，"封顶不算不达标"，所以 R2 判通过；但悬崖要单独报告，规则 c) 已要求报区间。

## R3 稀缺度同向：通过
- 矩阵：rc 与 relPrice 同值，相等时相等，上升时同升。
- 序列（相邻两天，4 物品）：drought-without、flood-without、flood-control、bs-tight-without，无任何违反。

## R4
- **旱情**：D0=day0，D1=day1（首次含 dry）。granary.food 8640 → 8566，下降，要判。
  - 四件食物（含 oats）ratioClamped 3→3，relPrice 3.0→3.0，满足 ≥。**通过**。这是在顶的平凡通过。
  - 复位：6 天内无 rain，**不可判**。与基线相同。
- **洪水**：F1=day2，F0=day1。control 的 stagesDeleted 含 route_closure。
  - ration：without 20.284→20.092，control 20.284→20.092，Δ相同。
  - bread、oats：Δ也相同。三项都是"封路无影响"。
  - 归类 ②无源头原因，与基线一致。
  - with 序列与 control 逐日相同，沿用基线可疑点：观测面是否看得到封路。
- **周贸易季节系数**：规则字面**不通过**，实质已删除。
  - without 的 16 行：seasonFactors=null，seasonFactorsReset=false，seasonFactorsRemoved=true。规则要求"全为 1 且 reset 为 true"，字面不满足。
  - with 的 16 行同样是 null，没有"冬 > 秋"可比。
  - with 与 without 的 regionalBase 逐行相同（如 weiting 冬 3.8460 对 3.8460）。系数确已去除。
  - 规则 v7 未覆盖"删除"形态，应由主会话决定怎么写，我不改规则。rules.json 里 settlementTrade 的 seasonFactors 已无；仍留一处 `seasonFactors [1,1,0.95,0.7]` 在 military 段（范围外）。
- **待替换项**：epidemic stripped 19，spring stripped 15，不判。

## R5
- ① R1、R2、R3 在两聚落同样成立：R2、R3 通过且两聚落一致；R1 不可测。**部分：R1 不可测，其余通过**，不得判通过。无聚落特例。
- ② modeDiff：withHazard=1 的 192 行，equal 全为 true。**通过**（基线 38 行 oats 不等，原因 seasonFactors 已删）。
- ③ environment 恒为 1：**不通过**，与基线相同。loc_bs_yupo 的 item_oats 24 行 environment=1.2414213562373095（regionalBase 3.7243），magic 与 forestWater 都是 1；其余 168 行为 1。
- ④ 特例分支：grep d252f1f0..dbc0082e 的 server-plugin 新增行里 loc_*、item_*、season 字面量。只命中 market.mjs 的一处 `s.settlement===place`（通用比较，不是特定聚落 id）。**通过**（范围限于 server-plugin 新增行）。

## R6：不可测
- buys-without 与 buys-with 逐行相同。夹具是 cov 1.5，ratio 0.18。
- item_bread 全部 10 次购买的 atFloor 都是 true（ratioClamped=0.5）。k=2、3、4 的 quotedRiseVsPrev 为 0.00332%、0.00332%、0.00332%，在地板。
- 规则要求这类行记"不可测"，须换到不在地板的场景。不得放宽区间。这批没有换。
- 与基线对照：基线 k=3 6.2%（超区间），现在被地板淹没，**不是修好了**。
- 用新诊断字段分析 k=2：
  - item_ration k=2 的 quotedRiseVsPrev = −0.1019%，预期 +0.0054%，consistencyError=1.07e-3，大于 1e-6。
  - valueSlot 与 priceSlot 的 contributions 都是空 []，加法型修正不是原因。
  - explanationParts.relation：k=1 为 0.979，k≥2 为 0.97795。比值 0.97795/0.979 = −0.1073%，正好等于 q 与预期之差 (−0.1019% − 0.0054% = −0.1073%)。
  - 所以 k=2 的误差成因是第一次购买后"relation"（关系系数）下降 0.005。这不是深度项或供给。
  - bread 的 relation 全程 0.979，consistencyError=0，没有这个误差。基线里 bread 与 ration 的 k=2 误差同为 1.1e-3，现在只剩 ration。
- k=3：新数据在地板，无法分析。基线没有诊断字段，也无法回溯。
  - 新数据里 bread 的 demand 随每次购买抖动：−0.625、+1.0、−0.625、−0.625、0。ration 的 demand 不变。
  - 这说明 bread 对购买有需求侧响应，ration 没有。这可以解释基线 bread k=3 与 ration k=3（2.7%）为何不同，但只是推测，缺基线 demand 字段，无法证实。
- 所有未夹取行的 consistencyError：没有未夹取行，故一致性条款不可测。

## R7 开关核验：通过（按新结构重算）
- 实际 rules.json：price_shift 剩 35 条（spring 15、epidemic 19、flood 1，三者相加正好 35）。famine 钟还有 10 个，loc_bs 没有 tight。
- 24 个矩阵 without 文件：strippedClasses=[winter, drought, seasonfactor]，stripped=0，stagesDeleted=[]，priceShiftEffectsInWorld=35，与 with 相同。
- 含义：删除类已经不在 rules.json 里，所以"剥离"为 0，且 with 与 without 世界的 price_shift 数相同（35 = 35）。stagesDeleted 不再含 `famine:loc_bs:tight`，因为 tight 已被删。
- 其他无倍数情形：drought stripped 0、bs-tight stripped 0、flood stripped 1（priceShift 34）、epidemic 19、spring 15。
- 有倍数运行：famine 阶段日 hazardFactor 在所有 with 行都是 1（旧的 1.2 已不存在），平时也是 1。这与"price_shift 已删"一致。
- seasonFactorsRemoved=true，seasonFactorsReset=false（字段形态变了，见 R4）。
- 整体：按重算后的预期（剥离 0、with=without=35）**通过**。我只能核对输出字段与 rules.json 的 price_shift 总数，没有逐条重数。

## R9 bs-tight：通过
- with 与 without 的逐日输出**逐字节相同**（因为 tight 已从 rules 里删除，两个世界一致）。
- 夹具：sangban 在 day8 起含 famine，夹具足够。
- ① sangban 含 famine：是（day8）。
- ② famine:loc_bs 含 famine：是（day1）。
- ③ famine:loc_ms_tanjie 依次含 tight 与 famine：是，day1 tight，day8 [tight, famine]。基线里 tanjie 只有 tight，现在修好了（hazard_phase 按阶段名引用）。
- ④ starvation：两边 21 天都是 0，不大于。
- ⑤ F1=day1，F0=day0：oats rc 3→3、rel 3.0→3.0；ration rc 3→3、rel 3.0→3.0。不回退。
- 与基线对照：不通过 → 通过。

## R8 汇总与基线对照
| 规则 | 基线 | 现在 | 说明 |
|---|---|---|---|
| R1 | 不通过 | **不可测** | 平时基线（cov 0.9）本身在顶，8 项 |
| R2 | 不通过 | **通过**（有悬崖） | 食物不再平；每组 floor→top，见悬崖核查 |
| R3 | 通过 | 通过 | |
| R4 旱情 | 前半通过 | 前半通过（顶内平凡）；复位不可判 | 6 天没到 rain |
| R4 洪水 | ② | ② | 同基线 |
| R4 季节系数 | 通过 | **字面不通过，实质已删** | 规则未覆盖删除形态 |
| R5 ① | 不通过 | R1 不可测，其余通过 | |
| R5 ② | 不通过 | **通过** | 192 行全等 |
| R5 ③ | 不通过 | 不通过 | yupo oats environment=1.2414，未变 |
| R5 ④ | 无法判定 | 通过 | 只看 server-plugin 新增行 |
| R6 | 不通过 | **不可测** | 全部在地板；ration k=2 误差来自 relation |
| R7 | 通过 | 通过（按新结构重算） | stripped 0，with=without=35 |
| R9 | 不通过 | **通过** | tanjie 现含 famine |

## 数据与探针可疑之处
1. **悬崖**（见上）：公共粮仓缺口没有进价格，缺口越深价格不动。R2 的"通过"只靠封顶、封底豁免。没有缺口梯度可证明"越缺越贵"，这是规律层问题。
2. **R1 不可测**：平时在 cov 0.9 就已在顶，冬荒与平时无法比较。这说明实现后"平时"也被悬崖钉到顶。R1 需要新夹具（例如更贴近 cov 1.0 附近的平时输出）才能判，规则不能改。
3. **R6 的夹具在地板**：cov 1.5 过宽，应换成连续带内（约 cov 1.05 到 1.2）。这是探针/夹具问题。
4. **R5③**：yupo oats 的 environment 1.2414 来源仍不明，magic 与 forestWater 为 1。
5. **demand 与库存无关**（ration 675.814 在各档位不变），与"需求 = 目标留存 + 缺口 + 承诺"的描述不完全吻合：缺口项只来自家户预算，不含粮仓自身缺口。
6. R9 现在 with 与 without 逐字节相同，意味着该情形不再测"删除 tight 的差异"，只测删除后的绝对行为。
7. 洪水观测面看不到封路效果（沿用基线），"无源头原因"的可靠性依赖观测点。
8. R4 季节系数：规则字面与现实现状脱节，需主会话改版（我不改）。
