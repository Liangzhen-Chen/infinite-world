# MKTW v8 判定 B（独立，未读判定 A）

依据：冻结规则 v8。`head -165 冻结规则.md | sha256sum` = 6d49b10c568a0d20c874a7eb2a82e3201f5e40062c8a1092988f6b2adc562e66，一致。cases-v8.txt 的 sha256 = f3bf245e…，一致。
数据：F:/dnd-tmp/mktw/out8，58 个 jsonl，全部 EXIT=0，均有 done 行。清单里 6 个 xxx-1.0 与探针 case 字段 xxx-1 按同一情形处理，文件名是 xxx-1.0.jsonl。
方法：只用 grep、awk、sed，未运行 node、python 或其他脚本。我写的 awk 解析片段在 F:/temp/claude/ 下，只读 jsonl。
判定性质：这批是 v8 实现后的验收运行，下列结论按规则字面机械判定。

## 取数与夹具
- 矩阵：28 个 without 文件（winter、autumn、yupo-winter、yupo-autumn，各 7 档），4 物品，before、after 两个 phase，共 224 个 cell×物品行。形成 32 组（settlement, season, phase, item）。
- 每组 7 个输出，全部可信。
  - before 行：|poolCoverage−level|≤0.25×level，最大偏差约 1e-4。
  - after 行：fixtureUntrusted 全为 null，advance.days=8，cov 全部大于 0。
  - 没有夹具不可信的输出（v7 里 level 0.05 的 after 行 cov=0，现在 after 行 cov 最低为 0.0065）。
- 所有行 relPrice 与 listPrice÷regionalBase 同值，在矩阵里 |差| < 1e-9。
- 四物品同池同价：同一 cell 内 4 个物品 scarcityRaw 相同。
- 池 cov 夹具：hw 与 yupo 在 level 1.0 时 cov 分别为 1.0000、1.0000。hw 的 winter 与 normal 的 holdTarget 不同（667096 对 232480），这是世界数据。
- 每个运行所属对照类：矩阵 = C1；winter-noclock、yupo-winter-noclock = C2；bs-tight-noloc_bs = C2 特例（与 bs-tight 配对）；drought-without 与 drought-noclock = C3；flood 三份、spring、epidemic 与旧版相同；buys 是同世界连续购买序列；zero-hold、tiny-hold 是 R10 夹具。

## R1 冬荒高于平时：通过（8 项全部）
基线 = 同聚落、同物品、平时、advance=0、level 1.0 的单个输出，可信，不在顶也不在地板。
- loc_hw：4 物品基线 relPrice = 0.999932405（cov 1.0001）。
- loc_bs_yupo：4 物品基线 relPrice = 1.000000000（cov 1.0000）。
- 基线 relation：8 个（聚落×物品）全部 =1。

冬季 cov<0.5（advance=0）的输出：level 0.4、0.2、0.05。

| 聚落 | 冬季 cov 0.4 | cov 0.2 | cov 0.05 | 对基线 |
|---|---|---|---|---|
| loc_hw（4 物品相同） | 2.500164 | 3.0（顶） | 3.0（顶） | 全部上涨 |
| loc_bs_yupo（4 物品相同） | 2.500000 | 3.0（顶） | 3.0（顶） | 全部上涨 |

- ① 基线恒等式：relPrice÷(scarcity×quality×depth×spread×relation) 偏差最大 2.2e-16；加性项 additiveSum=0；quality、depth、spread 都等于 qualityExpected、depthExpected、spreadExpected（1e-9）；scarcity=clamp(holdTarget÷holdActual)。满足。
- 基线 scarcity 与 1 的接近程度只记录：hw 0.999932，yupo 1.0。
- ② 冬季输出没有在地板的。
- 触顶缺口区间（冬季 before 组）：cov 0.4（level 0.4，缺口 0.60）与 cov 0.2（level 0.2，缺口 0.80）之间。两个聚落相同。
- 与 v7 对照：v7 基线（cov 1.5 或 0.9）在地板或在顶，8 项不可测；v8 基线在带内，转为通过。

## R2 越缺越贵：通过（32 组全部）
- 每组 7 个输出，内部输出（既不在顶也不在地板）5 个：before 为 level 1.5、1.0、0.75、0.6、0.4，after 为同样 5 档。e) 梯度可测满足。
- a) 没有任何一对下降。
- b) 内部相邻对每一对都上涨（相邻 relPrice 严格增大），以及 (level 0.4 → 0.2) 这对由内部到顶，上涨（例 hw winter before：2.500164→3.0）。顶内相邻对只受 a)，价格相等。
- f) ① 32 组全部 7 个输出的 quality、depth、spread 与目录派生值相等（偏差 0）。
- f) ② 内部输出子序列每个相邻对：|(relPrice 比) ÷ (持有比×非稀缺项比×relation 比) − 1| 最大 4.4e-16（≤1e-9）。32 组 f) 违反数为 0。
- 离底缺口：32 组全部"未封底"（没有任何可信输出在地板）。
- 触顶缺口区间（缺口=1−cov）：

| 组 | 最后一个不在顶 | 首个在顶 |
|---|---|---|
| hw winter before | cov 0.4000（level 0.4，缺口 0.600） | cov 0.2000（level 0.2，缺口 0.800） |
| hw normal before | cov 0.3999（缺口 0.600） | cov 0.2000（缺口 0.800） |
| yupo winter before | cov 0.4000 | cov 0.2000 |
| yupo normal before | cov 0.4000 | cov 0.2000 |
| hw winter after | cov 0.3448（level 0.4，缺口 0.655） | cov 0.1617（level 0.2，缺口 0.838） |
| hw normal after | cov 0.3776（缺口 0.622） | cov 0.1620（缺口 0.838） |
| yupo winter after | cov 0.3708（缺口 0.629） | cov 0.1846（缺口 0.815） |
| yupo normal after | cov 0.3911（缺口 0.609） | cov 0.1754（缺口 0.825） |

- 四个物品每个聚落季 phase 的区间相同（共 32 组，上表 8 行各代表 4 个物品）。
- 与 v7 对照：v7 每组只有"地板→顶"一步，v8 每组有 5 个内部输出，梯度成立，且稀缺度 = 1÷cov 随持有连续变化（如 yupo normal before：cov 1.5→0.667、1.0→1.0、0.75→1.333、0.6→1.667、0.4→2.5）。

## R3 稀缺度同向：通过
- 矩阵：32 组按 cov 相邻共 192 个相邻对，rc 与 relPrice 无任何违反。
- 序列（相邻两天，4 物品）：drought-without 88 对、drought-noclock 88 对、flood-without 24 对、flood-control 24 对、bs-tight 80 对（loc_bs 的 items）、bs-tight-noloc_bs 80 对，违反 0。
- R3 补充条（公式一致）：
  - 矩阵 224 行、noclock 48 行：scarcityRaw = holdTarget÷holdActual（1e-9）全部满足；ratioClamped = clamp(scarcityRaw, 0.5, 3) 全部满足；scarcityCap=3 与 limits[1] 相等。
  - 序列行（drought、flood、bs-tight 各 day 行）公式违反 0。
  - zero-hold-hw：holdActual 为 0，见 R10。
  - **tiny-hold-hw 4 行不满足字面**：ration scarcityRaw=8941.538，而 holdTarget÷holdActual=232480÷1=232480；输出里 scarcityRawUnprotected=232480.00000000003。scarcityRaw 实际等于 holdTarget÷poolWeight（232480÷26=8941.538；flatbread 19373.33=232480÷12；bread 14530=232480÷16；oats 6386.81=232480÷36.4）。
    - 含义：引擎对"小于一件货折算量的持有"做了保护（持有下限取 poolWeight），规则 R3 补充条没有登记这条。
    - 对价格没有影响：两种口径都 ≥3，ratioClamped=3。
    - 分诊：规则缺位（未登记的保护机制），记录，不归实现缺陷。

## R4
- **旱情：夹具不足（无在田批次）**，不判。
  - 两个运行 drought-without、drought-noclock 的 sowcheck 行（第 386 日）fieldBatches=0，verdict="夹具不足（无在田批次）"。
  - 整季触发表 firesYear=[]（两个运行都是空），D2=null；窗止日 endDay=386，harvestDoneDay=null；agriculture.mode=managed，cohorts=[] 全程为空。
  - 先判夹具：两运行逐日 weather、poolCoverage、holdTarget、holdActual 等整行逐字节相同（23 个 day 行 cmp 一致），所以夹具两侧同世界无差异，但没有在田批次，① 与 ②③ 无对象。
  - 价格全程由 poolCoverage 变化解释（cov 1.0 → 1.0266，relPrice 随 holdActual 同向），但不是旱情源头效应。
  - 分诊：夹具或探针缺陷（见可疑项：触发表为空、没有在田批次）。
- **洪水：②无源头原因**（与基线相同）。
  - F1=day2（首次含 crest），F0=day1。
  - supply_without：ration 25.630→20.592；bread 41.649→33.462；oats 18.307→14.709。flood-control 的 Δ 逐项相同（差 0）。
  - 三个物品全部"封路无影响"。10578 并入待替换清单。
  - 对照 flood-control 的 stagesDeleted 含 route_closure×1 项，夹具成立；flood-with 的 supply 序列也与 control 逐日相同。
- **周贸易季节系数（删除形态）：实质已删除，② 有 2 处命中待主会话裁定**。
  - ① 满足：rules.json 的 settlementTrade 段无 seasonFactors；唯一的 seasonFactors 键在 warDiplomacy 段（military，范围外）。
  - ② 命中点：
    - server-plugin/war-diplomacy.mjs:71（军事，r.seasonFactors）。
    - server-plugin/settlement-profile.mjs:24（村庄生产行字段名清单）。
    - world/design/w1-village-profiles.mjs:164（农副产生产行的 seasonFactors，freshSeasonFactors）。
    - settlement-trade.mjs、market.mjs、transport.mjs 无命中。
    - 规则允许的只有"属于 military 或删除标记"，后两处是"生产行季节系数"，与价格无关但不属允许的两类，我不自行裁定。
  - ③ 满足：season-without 的 16 行（4 个 buyer × 4 季）seasonFactors=null，seasonFactorsRemoved=true。
  - ④ 记录：同聚落四季的 regionalBase 完全相等（例 loc_bs_yupo 四季均 3.6799999999999997；weiting 3.7080350850198274）。没有季节差。
- 待替换项（spring、spring-bs、epidemic）：待替换不判。

## R5
- ① R1、R2、R3 在 loc_hw 与 loc_bs_yupo 同样成立：**通过**。两个聚落的结论完全一致，无特例。
- ② C2 源头钟有无（winter-noclock 与 winter-without，各 level 1.0、0.6、0.2，两聚落，before、after，4 物品）：**通过，区分力有限**。
  - 配对 48 对，相等配对 48，持有不等配对 0。
  - 48 对 holdTarget 与 holdActual 都相等（1e-9），去 relation 后的价格分量（relPrice÷relation）全部相等，违反 0。
  - with 侧（有钟）钟阶段史非空配对数：
    - before：loc_hw 0、loc_bs_yupo 0。
    - after：loc_hw 4（level 0.2，阶段 tight，4 个物品）、loc_bs_yupo 4（level 0.2，阶段 tight）。
    - 两聚落各至少 1 对，要求满足；但只到 tight 阶段。
  - clocksRemoved 与闭包一致：loc_hw = famine:loc_hw + famine:loc_ms_taideng；yupo = famine:loc_bs_yupo + famine:loc_ms_yugen；closureMatches=true。
  - 闭包报告（effect.kind）：
    - famine:loc_hw：tight = rumor；famine = famine、rumor。
    - famine:loc_ms_taideng：tight、famine 都是 wildlife_stir、standing（对 loc_hw 的好感，delta −3 与 −6）。
    - famine:loc_bs_yupo：tight = rumor；famine = famine、rumor。
    - famine:loc_ms_yugen：tight、famine 都是 wildlife_stir、standing。
    - famine:loc_bs：famine = famine。
    - famine:loc_ms_tanjie：tight、famine 都是 wildlife_stir、standing。
    - 其中 `famine` effect（settlement，minutes 172800）可能改持有或人口，这批数据只到 tight 阶段，没有触到它，C2 控制变量在 famine 阶段可能不纯，需另行说明并交主会话。
- ③ 运输因子：**通过**（(i)(ii)(iii)(iv) 满足）。
  - (ii) transport-coverage 12 个点，用探针输出的 {origin、billableKg、packRate、路线 km、routeCost、12 个月 cost、目录基价、limits.transport} 手推 transport=clamp(1+单位运费÷目录基价, [1,3])，与探针值差 0。
  - 手推点：
    - ration→hw 1.16（24km，1kg）。
    - ration→yupo 1.066667（10km）。
    - pot→hw 1.051429（1.5kg）。
    - pot→yupo 1.021429。
    - wheel→hw 1.137143（8kg）。
    - wheel→yupo 1.057143。
    - iron→yupo 1.113333（34km，2kg）。
    - iron→loc_bs 1.08（24km，2kg）。
  - (iii) 非平凡点（未夹取且>1）8 个，计费重量 1、1.5、8、2（至少 3 种互不相同），路线路程 10、24、34 三种（至少 2 种）。被夹取点数 0。
  - (iv) 本地点 transport=1：ration→loc_bs、pot→loc_bs、wheel→loc_bs、iron→loc_hw 共 4 个。
  - (i) 运输价路径（transport.mjs 的 unitFreight）无按物品 id 或聚落的分支；只有 transport.mjs:170、172、695 的制造/修缮用 item_wood、item_iron，不涉价格。
  - loc_bs_yupo 的 item_oats 环境 1.2414 在矩阵里已不存在（矩阵里 oats 的 environment=1，无非 1 值）；矩阵 environment 与 transport 取值：hw ration 1.16，其余矩阵物品为 1，magic、forestWater、hazardFactor 恒为 1。
- ④ 特例分支与 I12：**通过（范围限于 diff 的新增行）**。
  - git diff dbc0082e..48a9f7b4 的 server-plugin 新增行里 loc_*、item_*、season 字面量只命中 `p.settlement===place`（通用比较）。
  - 前一阶段 d252f1f0..dbc0082e 的新增行也只命中一处通用比较。
  - I12 读点：稀缺度读 holdTarget、holdActual，注释写明只计公开量（仓库公账、经营者与居民在售货）；market.mjs:212 的 cheapestOfClass 在没有货架时读 state.npcs 的 inventory（居民持有，用于判断"最便宜的一类货"）。这是否属于 I12 可知量，我不判，列为可疑项。
- ⑤ 同 cov 冬秋同价：**字面不通过（20 对，全在 loc_hw）；实质成立**。
  - 56 对（2 聚落 × 7 档 × 4 物品）中 36 对相等，20 对不相等（hw 的 level 1.5、1.0、0.75、0.6、0.4 各 4 物品）。最大相对差 1.2e-4（hw level 0.4：winter 2.500164 对 normal 2.500470）。
  - 原因：两侧池 cov 本身不同。hw level 0.4 winter cov=0.399974、normal cov=0.399925；relPrice×cov 在两侧都约等于 1。yupo 的 56 对中全部相等（其他持有为 0，没有取整差）。
  - 分诊：夹具取整（hw 的不可调货架存量 1501.3 使同 level 的实际 cov 在冬秋略有差），探针缺陷，不是残留季节加价。

## R6 逐件涨幅：不通过（① 字面），② 至 ⑤ 满足
同世界连续购买序列 buys-1.0（cov 1.0）与 buys-0.75（cov 0.75），item_bread 与 item_ration 各 10 件。
- 夹具：全部读数 ratioClamped 严格介于 0.5 与 3 之间（bread cov 1.0 为 0.99993 到 1.000345；cov 0.75 为 1.3333 到 1.3340），既非 atFloor 也非 atTop。
- ① consistencyError ≤1e-6：**不通过**。四条序列（两运行×两物品）的 k=2 一律是 1.0726e-3（bread cov1.0 1.0726e-3，ration 1.0727e-3，cov0.75 同量级）。k=3…10 为 0 或 ≤4.4e-16。
  - 原因：k=1 的 relation=0.979，k≥2 的 relation=0.97795（买一件后关系得到折让），比值 −0.107%。quotedRiseVsPrev k=2 为负：bread cov1.0 −0.0990%，cov0.75 −0.0963%；ration −0.0938%、−0.0894%。
  - consistencyError 的预期值 expectedRise 只含 scarcity×depth，不含 relation，所以 ① 字面与 ⑤"relation 属真实规律，不计入方向"相互矛盾；规则 ② 才是去掉 relation 的口径。
  - 分诊：规则口径内部不一致（探针 expectedRise 不含 relation），不是实现缺陷。
- ② 分量与预期恒等式 |(1+c_k)÷((1+e_k)×τ) −1|：bread 与 ration 的 k=2…10 全部 ≤2.2e-16。
- ③ 乘性项恒等式：listPrice÷(baseline×environment×scarcity×quality×depth×spread×relation) −1：k=1…10 全部 0；additiveSum=0，无加性项。
- ④ 账单比与离散步：|(quotedExactTotal 比)÷((listPrice 比)×(ι 比)) −1| 全部 0。
- ⑤ 方向条：c_k≥0，k=2…10 全部满足。
- k=2、3、4 三行（bread）：
  - cov 1.0：c_k=8.2588e-5、8.2592e-5、8.2597e-5；quotedRiseVsPrev=−0.0990%、+0.00826%、+0.00826%。
  - cov 0.75：c_k=1.1012e-4、1.1013e-4、1.1014e-4；quotedRiseVsPrev=−0.0963%、+0.01101%、+0.01101%。
- 涨幅量级：每件约 0.008% 到 0.018%，远小于旧基线的 2.6%，因为池持有量（232480 饱腹单位）远大于旧口径里的整数件数。
- 与 v7 对照：v7 全部在地板，不可测；v8 在带内，可测，② 至 ⑤ 成立。

## R7 开关核验：通过（按新结构重算）
- rules.json 的 price_shift 共 35 条：price:*（青黄不接）15 条、epidemic:* 19 条、flood:loc_bs 1 条。famine、旱情（price:loc_bs_liquan）、winter 类钟里没有 price_shift。
- ① 矩阵 28、drought 两个、bs-tight 两个、famine-hw-without、zero-hold、tiny-hold：stripped=0，stagesDeleted=[]，priceShiftEffectsInWorld=35，等于当前 rules.json 总条数。
- ② famine 阶段日与平时 hazardFactor 逐行全为 1：矩阵、famine-hw、bs-tight、drought、zero/tiny 共 1122 个读数，全为 1。hazardFactor=1.1 只出现在 flood-with、flood、spring-with、spring、spring-bs-with、spring-bs 里（待替换的 with 世界）。
- ③ noclock 运行 clocksRemoved 恰等于闭包钟 id 集合（见 R5②）；"其余钟的条数与有钟世界相同"在输出里没有可核对的字段，我无法判定该半句。drought-noclock 的 clocksRemoved=[price:loc_bs_liquan]（C3）。
- ④ 26 个相关运行 seasonFactorsRemoved=true。
- ⑤ flood-without stripped=1、spring-without 与 spring-bs-without 各 15、epidemic-without 19，与 v7 相同；它们与 with 仍是不同世界（priceShiftEffectsInWorld 34、20、20、16，对 35）。
- famine-hw-without：famine:loc_hw 钟 11 天始终 null（没有进 tight），只记录。

## R9 bs-tight：夹具不足（sangban 未进 famine）；④ 无区分力；③ 通过
- 先判夹具：bs-tight 运行里 famine:loc_bs_sangban 阶段史在 20 天 series 内始终为 null，不含 "famine"（clocks、clockHistory、famineClockHistory 全程 null；famineActive=false）。三个钟（famine:loc_bs、famine:loc_bs_sangban、famine:loc_ms_tanjie）20 天都没有进入任何阶段。
- 规则：记"夹具不足（sangban 未进 famine）"，不判回退，按 R8 报，加大天数或调 level 重跑（level 调整须先改规则重冻）。
- ③ 静态检查：**通过**。rules.json 里 9 处 hazard_phase 引用全部解析到现存的钟与阶段名：
  - flood:loc_hw/crest、flood:loc_bs_weiting/crest。
  - famine:loc_bs_sangban/tight、famine:loc_hw/tight、famine:loc_bs_yupo/tight。
  - famine:loc_bs/famine（2 处）。
  - famine:loc_bs_liquan/tight 与 famine:loc_bs_liquan/famine。
  - 这些钟里实际含对应阶段 id（famine:loc_bs 只有 famine 阶段，tight 已删）。
- ④ 价格层同持有判据（bs-tight 与 bs-tight-noloc_bs，3 聚落×4 物品×21 天 = 252 个比较点）：
  - 在顶的点 0 个，可比较点 252。
  - 两侧 holdTarget 与 holdActual 全部相等，持有不等的天数 = 0。去 relation 价格分量全部相等。
  - 记"**④ 无区分力**"，不判通过。可比较的非顶点数 252，持有不等天数 0。
  - starvation 全程只记录：loc_bs、sangban 都是 0；starvationNonzeroDays 为 0、0、0。
  - noloc 世界没有被校验拒绝：clocksRemoved=[famine:loc_bs, famine:loc_ms_tanjie]，closureMatches=true。
- ⑤ F1（famine:loc_bs 首次含 famine 的那天）：series 里不存在，不可测。
- ①②：不满足（阶段史为空）。
- 整条 R9：只能记"夹具不足 / 部分（③ 通过）"，不得写通过。
- 此外：bs-tight 的 loc_bs 与 loc_ms_tanjie 的 4 物品 ratioClamped 全程为 0.5（地板，holdTarget 112 对 holdActual 823→522）；sangban 为内部点（2.5 到 2.65，随持有下降上升）。loc_bs 与 tanjie 在地板，所以这两个聚落的点虽然"不在顶"，实际同样没有区分力。

## R10 空持有封顶：通过
前置条件：zero-hold-hw 里 4 个物品 holdActual=0（ration、flatbread、bread、oats 全是 0），满足，除零路径已触达。
- ① 无 error 行；listPrice、ratioClamped、relPrice 都是有限正数。
  - zero-hold：ration listPrice 10.44，flatbread 9，bread 6，oats 9；relPrice 约 3（ration 2.9999999999999996）。
  - tiny-hold：ration 10.44，flatbread 9，bread 6，oats 9。
- ② zero-hold：scarcityRaw=3（等于 scarcityCap），ratioClamped=3，divZeroCapped=true，scarcityRawUnprotected=null；4 物品全满足。
- ② tiny-hold：holdActual=1（约 0.9999999999999999），scarcityRaw 8941.538（ration）、19373.33（flatbread）、14530（bread）、6386.81（oats），均大于 3，ratioClamped=3，divZeroCapped=false。预期：holdTarget÷holdActual≥3 时 ratioClamped=limits[1]，一致。
- ③ 不逆向：autumn level 0.05（advance=0，hw）→ tiny-hold → zero-hold，4 物品的 relPrice 都是 3.0（三者在顶，相等，相邻不下降）。level 0.05 锚点实测 cov=0.04999，未按夹具可信度剔除（规则写明）。
- ④ holdTarget 为 0 的输出：没有出现（三个夹具里 holdTarget 都是 232480）。
- R3 补充条在 tiny-hold 行的字面差异见 R3。

## R8 汇总
| 规则 | v8 结论 | 要点 |
|---|---|---|
| R1 | 通过 | 基线 hw 0.999932、yupo 1.0；冬季 0.4 档 2.5002/2.5，0.2 与 0.05 档顶 3.0；8 项 |
| R2 | 通过 | 32 组，每组内部输出 5 个；a)、b)、e)、f) 全满足；未封底；触顶 cov 0.4→0.2 之间（缺口 0.60→0.80） |
| R3 | 通过（tiny-hold 4 行字面差异记录） | 序列与矩阵无违反 |
| R4 旱情 | 夹具不足 | sowcheck：无在田批次；触发表空；D2=null |
| R4 洪水 | ②无源头原因 | 三物品 Δ 与 control 相同 |
| R4 季节系数 | 实质已删除；② 待裁定 | 三处命中非 settlement-trade |
| R5 ① | 通过 | |
| R5 ② | 通过（区分力有限） | 48 对全等；持有不等 0 对 |
| R5 ③ | 通过 | 12 点手推全等；非平凡 8 点 |
| R5 ④ | 通过（范围限 diff 新增行） | I12：cheapestOfClass 读居民存货，列为可疑 |
| R5 ⑤ | 字面不通过（hw 20 对） | 实质：价格=1/cov，差由夹具 cov 差引起 |
| R6 | 不通过（① 字面） | ② 至 ⑤ 满足；k=2 误差来自 relation |
| R7 | 通过 | 35 条；hazardFactor 全为 1；③ 后半句无字段 |
| R9 | 夹具不足；③ 通过；④ 无区分力 | 钟全程 null |
| R10 | 通过 | zero、tiny、锚点全满足 |

## 可疑之处
1. **R9 夹具**：bs-tight 20 天里三个冬荒钟一次都没进阶段（全程 null），而矩阵里 hw、yupo 在 level 0.2、8 天后能进 tight。sangban level 0.4 的夹具没有触发 tight，原因没有在输出里（可能是日期、季节窗或 granary_short 条件按"池 cov"与"仓 cov"口径不一致）。需要探针作者查。
2. **R9 ④ 与 R5② 的区分力有限**：R9 ④ 252 点持有全等；R5② 持有不等 0 对；with 侧阶段只到 tight（只有 rumor 与 wildlife_stir、standing 效果，不读价不改持有）。这两条目前只证明"钟的 tight 阶段不读价"，没有检验 famine 阶段。
3. **R4 旱情**：firesYear=[]（整年没有触发）、没有在田批次（agriculture.cohorts 全程 []，sowcheck=0）。按规则文字 D2 来自整季触发表，表空本身也需查（rules 里 price:loc_bs_liquan 钟的触发应在 season 1，year 索引或窗口是否与 hazard-calendar 的检查日对得上）。这是探针或夹具缺陷。
4. **R6 购买序列**：bread 的 k≥7、ration 的 k≥6 的购买 unitPrice=null、cost 缺失，holdAfter 与 holdBefore 相同，但 ok=true。买家可能没钱或供给取整限制，k≥8 的"c_k=0"没有信息量。k=2、3、4 不受影响。
5. **R6 ① 与 ⑤ 的内部矛盾**：consistencyError 口径不含 relation，k=2 恒为 1.07e-3；规则 ⑤ 却说 relation 是真实规律。建议主会话在规则里把 ① 改为去 relation 口径（我不改）。
6. **R5⑤ 的 hw 20 对**：夹具取整使冬秋同 level 的实际 cov 差约 5e-5，字面要求 1e-9 相等，永远过不了；yupo（无其他持有）一致。
7. **tiny-hold 的 scarcityRaw 与规则公式不一致**：引擎对 holdActual<poolWeight 的情形做了保护（holdActual 下限取 poolWeight），规则 R3 补充条没有登记；价格不受影响（均在顶）。
8. **I12**：market.mjs:212 的 cheapestOfClass 在没有货架时读 state.npcs 的 inventory（居民存货，判断最便宜货类）。是否属公开可知量，需主会话裁定；它影响哪个物品被当作"类里最便宜"，不直接进稀缺度。
9. **季节系数 ②**：settlement-profile.mjs:24 与 w1-village-profiles.mjs:164 的 seasonFactors 是村庄生产行（农副产季节系数），不是 settlementTrade 价格项，也不属 military。规则允许的两类不含它们。
10. **洪水观测面**：with、without、control 的 supply 序列逐日完全相同，封路效果在这个观测面不可见，"无源头原因"的可靠性依赖观测点是否正确（与前几轮相同）。
11. **bs-tight 里 loc_bs 与 tanjie 的价格在地板**：holdTarget 112、holdActual 数百，ratio 0.14 到 0.2，被夹到 0.5。这两个聚落作为 R9 ④ 的比较对象没有梯度。
12. **hw winter 与 normal 的 holdTarget 差别大**（667096 对 232480，约 2.9 倍）：同 level 的冬季池更大。这是世界数据（货架目标与合同承诺），但 R5⑤ 的"同 level"比较因此对应不同的绝对持有。
