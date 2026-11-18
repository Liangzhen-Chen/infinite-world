# MKTW v8 判定 A（冻结规则 v8，out8 共 58 个情形，实现 mktw-12 / t-mktw 48a9f7b4）

只读判定，本机未运行 node 或任何脚本，只用 bash、gawk、grep、sed 读数据与 git 只读命令。与判定者 B 背对背。按规则条文机械判，不改规则。

## 总览
| 条 | 结论 |
|---|---|
| R1 | 通过（8/8，封顶） |
| R2 | 通过（32/32 组，每组内部输出 5 个） |
| R3 | 通过（矩阵 192 对、序列 452 行）；R3 补充：tiny-hold 4 行不通过，其余全过 |
| R4 旱情 | 夹具不足（无在田批次），不判 |
| R4 洪水 | 通过，归类②（无源头原因） |
| R4 季节系数 | 已删除（①③ 满足；② 有 2 处非 military 命中，见下，请主会话确认归属） |
| R4 待替换 | 不判 |
| R5① | 通过（R1、R2、R3 两聚落成立） |
| R5② | 通过（有区分力的配对仅 after 侧 lv0.2，各聚落 4 对） |
| R5③ | 通过（(i)(ii)(iii)(iv) 全满足） |
| R5④ | 通过 |
| R5⑤ | 不通过（loc_hw 20/56 对，最大相对差 1.2e-4；原因是夹具的固定货架持有，非季节加价） |
| R6 | 不通过（① 在 k=2 不满足；②③④⑤ 通过） |
| R7 | 通过 |
| R8 | 报告口径见各条 |
| R9 | 夹具不足（sangban 21 天未进 famine），不判；③ 通过；④ 无区分力 |
| R10 | 通过 |

## 前置核对
- `head -165 冻结规则.md | sha256sum` = 6d49b10c568a0d20c874a7eb2a82e3201f5e40062c8a1092988f6b2adc562e66，一致；cases-v8.txt 的 sha256 开头 f3bf245e，一致。
- out8 共 58 个 jsonl（另有 progress.log）；首行 hash 全为 ffbf95c6…；末行均 EXIT=0；没有 kind=error 行。
- 6 个 -1.0 文件名的 case 字段为 -1，同一情形，已按映射处理。
- 所有 after-advance 行 advance.days=8；fixtureUntrusted 全为 null。
- 夹具可信：矩阵 224 个 without 行（28 文件 × 2 phase × 4 物品）全可信（before 行 |cov−level|≤0.25×level，after 行 cov>0）；cov 取 poolCoverage。例：loc_hw 平时 level 0.05 的 after 行 cov=0.0065 仍 >0，可信。
- 每个运行所属对照类别：矩阵 winter-/autumn-/yupo-* without = C1（同世界、只改池 cov）；winter-noclock、yupo-winter-noclock、bs-tight-noloc_bs = C2；drought-without 与 drought-noclock = C3；buys-1.0/-0.75 = 同世界连续购买序列；flood 三个 = 沿用 v7 洪水对照。

## 矩阵数据（四物品、两聚落，relPrice；cov 降序；T=在顶）
- loc_hw winter adv0：cov 1.5：0.6667；1.0：1.0000；0.75：1.3333；0.6：1.6666；0.4：2.5002；0.2：3.0T；0.05：3.0T。
- loc_hw winter adv8：cov 0.980：1.0204；0.895：1.1179；0.665：1.5027；0.528：1.8936；0.345：2.8999；0.162：3.0T；0.024：3.0T。
- loc_bs_yupo normal adv8：cov 1.382：0.7235；0.882：1.1333；0.769：1.3012；0.607：1.6482；0.391：2.5572；0.175：3.0T；0.014：3.0T。
- 其余组形态相同（价格 = holdTarget ÷ holdActual，夹入 [0.5,3]）。

## R1 冬荒高于平时：通过（8/8 物品聚落组合，冬季输出 24 个）
- 基线 = 同聚落、同物品、平时、adv0、level 1.0，均可信、不在顶不在地板、additiveSum=0。
- 基线恒等式：8 个基线行 |relPrice ÷ (scarcity×quality×depth×spread) − 1| ≤ 2.2e-16；quality、spread、depth 与 qualityExpected、spreadExpected、depthExpected 相对差 0；scarcity = hT÷hA（loc_hw：232480÷232495.72 = 0.999932；loc_bs_yupo：320320÷320320 = 1）。
- 基线 relation：loc_hw 四物品 1，loc_bs_yupo 四物品 1（逐个核对，均为 1）。基线 scarcity：loc_hw 0.999932，loc_bs_yupo 1.000000（设计预期 1 成立）。
- 冬季 adv0、cov<0.5 的输出（level 0.4、0.2、0.05）：loc_hw lv0.4（cov 0.3999）relPrice 2.5002，> 基线 0.999932；loc_bs_yupo lv0.4 为 2.5000，> 1.0；lv0.2、lv0.05 两聚落均为 3.0（在顶）。无一在地板。
- 触顶缺口区间（adv0，两聚落）：从 cov 0.4（level 0.4，缺口 0.600）到 cov 0.2（level 0.2，缺口 0.800）之间开始顶住。理论上 1÷cov 到 3 即 cov≈0.333。
- 对比 v7：v7 为"不可测"，现转为通过。

## R2 越缺越贵：通过（32 组：loc_hw、loc_bs_yupo × winter、normal × adv0、adv8 × 4 物品）
- 每组可信输出 n=7；内部输出（不在顶不在地板）个数均为 5（满足 e) ≥3）：level 1.5、1.0、0.75、0.6、0.4 对应的输出。
- a) 无下降；b) 内部相邻对全上涨（相对差均显著）；封顶段（lv0.2、lv0.05 两个）内价格相等，只记录。f) ①：32 组 × 7 输出的 quality、spread、depth 全等于 Expected（相对 1e-9，违例 0）；f) ②：内部相邻对的乘积恒等式最大偏差 4.4e-16（≤1e-9）。
- 触顶缺口区间（四物品相同）：
  - loc_hw normal adv0：cov 0.3999（lv0.4，缺口 0.600）～0.2000（lv0.2，缺口 0.800）。
  - loc_hw winter adv0：0.4000～0.2000。
  - loc_hw normal adv8：0.3776（缺口 0.622）～0.1620（缺口 0.838）。
  - loc_hw winter adv8：0.3448（缺口 0.655）～0.1617（缺口 0.838）。
  - loc_bs_yupo normal adv0：0.4000～0.2000；winter adv0：0.4000～0.2000。
  - loc_bs_yupo normal adv8：0.3911（缺口 0.609）～0.1754（缺口 0.825）；winter adv8：0.3708（缺口 0.629）～0.1846（缺口 0.815）。
- 离底：32 组均未封底（最低价 0.6667 > 0.5，无 atFloor）。
- 对比 v7：32 组"地板→顶"一步通过，现在每组有 5 个内部点、逐档渐变（如 loc_hw winter adv0：0.6667→1.0→1.3333→1.6666→2.5002），悬崖已消失。

## R3
- 矩阵：相邻 cov 对 192 对，违例 0（ratioClamped 同向时 relPrice 不下降/不上升，相等时相对差 ≤1e-9）。序列（相邻两天，按物品）：drought-without 88、drought-noclock 88、flood-without 24、flood-control 24、bs-tight 80、bs-tight-noloc_bs 80、famine-hw-without 40，违例 0。
- R3 补充（scarcityRaw = hT÷hA；ratioClamped = clamp；scarcityCap = limits[1]=3）：矩阵与 noclock 272 行、日序列 452 行、buys，违例 0；zero-hold-hw 4 行 hA=0，按 R10 处理。
- **tiny-hold-hw 4 行不通过 R3 补充**：holdActual=1（饱腹单位），holdTarget=232480，hT÷hA=232480，但 scarcityRaw=8941.54（ration，= 232480 ÷ 26）、19373.3（flatbread，÷12）、14530（bread，÷16）、6386.8（oats，÷36.4）。引擎把 supply 取为 max(1 件, supply)（market.mjs:215 的 `q.demand/Math.max(1,q.supply)`；探针另输出 scarcityRawUnprotected = 232480，与 hT÷hA 相等）。规则只登记了 holdActual=0 的离散来源，没有登记"不足 1 件按 1 件"。ratioClamped 仍是 3，不影响 R10。分诊：规则缺口（离散来源未登记），不是价格错误。

## R4
- **旱情：夹具不足（无在田批次），不判。**两运行逐日天气相同（23 天 0 日不同）、ration 的 holdTarget 与 holdActual 逐日相同（0/23 不同），夹具判定通过。但 sowcheck 行：第 386 日 fieldBatches=0，判词"夹具不足（无在田批次）"；全部 23 天 agriculture.cohorts 为空（mode=managed）。整年触发表 firesYear=[]，D2=null；窗止日 endDay=386，harvestDoneDay=null。①②③ 均不判。分诊：夹具或探针缺陷（开局日 364 之后没有播种批次产生；另外整年触发表为空，说明该种子该年也没有 dry/drought 触发，二者须分别查）。
- **洪水：通过，归类②"无源头原因"，10578 并入待替换清单。**三输出同日对齐，fixtureUntrusted 均 null；control 的 mode=control 且 stagesDeleted 含 route_closure（18 项）。F1=第 2 天，F0=第 1 天。supply Δ：ration without 25.6305→20.5920（−5.0385），control 同；oats 18.3075→14.7086（−3.5989），control 同；bread 41.6495→33.4620（−8.1875），control 同。|Δwithout−Δcontrol| = 0，三物品全"封路无影响"。
- **季节系数：已删除（按 v8 删除形态）。**①rules.json 的 settlementTrade 段无 seasonFactors（grep 0 处；全文件剩一处属 warDiplomacy，military 范围外）；②grep 全部命中点：server-plugin/war-diplomacy.mjs:71（military）；server-plugin/settlement-profile.mjs:24 与 world/design/w1-village-profiles.mjs:164（产出行字段 'seasonFactors'，值来自 freshSeasonFactors，属 production 记录，不在 settlement-trade 路径）；settlement-trade.mjs 的 diff 里原读点已删。**这两处既不是 military 也不是删除标记，规则文字"只允许属于 military 或删除标记"没有覆盖，请主会话确认归属。**③season-without 16 行 seasonFactors=null、seasonFactorsRemoved=true；④只记录：四季 regionalBase 现为各聚落常数（weiting 3.7080、liquan 与 sangban 3.7628、yupo 3.6800，四季相同），v7 时的季节差已消失。
- 疫病、青黄不接：待替换不判；spring、spring-bs、epidemic 均跑满 7 天且无 error（基线时 spring 报错，现已修复）。

## R5
- ① 通过：R1、R2、R3 在 loc_hw 与 loc_bs_yupo 四物品均通过（见上）。
- ② 通过（有限区分力）。winter-noclock 对 winter-without，按（聚落、level、phase、物品）配对共 48 对（每聚落 24：before 12、after 12）。只比去 relation 的分量 relPrice÷relation：48 对全部 holdTarget、holdActual 相等，价格分量全部相等；持有不等配对 0；relation 逐对相同。with 侧钟阶段史非空的配对：before 各聚落 0 对；after 各聚落 4 对（lv0.2，tight，minute 917280，由 famineClockHistory 与 famineStages 读出）。loc_hw、loc_bs_yupo 均 ≥1，可构造。限制：tight 阶段只有 rumor 效果，famine 阶段（含 famine effect）未触达，所以只证明"进入 tight 不改价格读点"。
  - 闭包报告（读自 start 行 closureReport）：famine:loc_hw 与 famine:loc_bs_yupo：tight = rumor；famine = famine + rumor。famine:loc_ms_taideng 与 famine:loc_ms_yugen：tight 与 famine 各含 wildlife_stir（habitat_hw_wood，factor 1.5 与 2.5，持续 14400 与 28800 分钟）和 standing（对 loc_hw 的好感 delta −3、−6）。wildlife_stir、standing 不读价，famine effect 可能改人口或持有；本批数据里与 hold、relation 无差异，但控制变量并非完全纯，供主会话判断。
  - closureMatches=true；clocksRemoved 与闭包一致：loc_hw：[famine:loc_hw, famine:loc_ms_taideng]；loc_bs_yupo：[famine:loc_bs_yupo, famine:loc_ms_yugen]。
- ③ 通过。(i) 源码无按物品 id、聚落、lane 的新分支：dbc0082e..48a9f7b4 的 diff 里 market.mjs、settlement-trade.mjs、transport 相关新增行只含 goods:food 类、饱腹、配方链、placeSettlement、unitFreight 等通用实现；(ii) 矩阵与 noclock 272 个物品行：probe 的 transportFromInputs 与 transport 相对差 0，environment = transport × environmentFactors（环境因子 1）全对，hazard、magic、forestWater 全为 1；transport-coverage 12 点我自己按"12 个月最便宜路线 Σ 路程×计费重量×packRate + routeCost，transport = clamp(1+运费÷基价, [1,3])"手推，12 点全与探针值相对差 0；(iii) 非平凡点 8 个（未被夹取且 >1）：ration（计费重量 1 kg）、cooking_pot（1.5 kg）、pottery_wheel（8 kg）× {loc_hw 24 km、loc_bs_yupo 10 km}，iron（2 kg）× {loc_bs_yupo 34 km、loc_bs 24 km}；计费重量 4 种、路程 4 种，满足至少 3 种 × 2 种；被夹取点数 0；(iv) 本地点 transport=1：ration、cooking_pot、pottery_wheel → loc_bs，iron → loc_hw，4 点。loc_bs_yupo item_oats environment=1.2267，来自运输，满足公式（v7 的 1.2414 已不再出现）。
- ④ 通过：新增代码只用 goods:food、饱腹、配方链和通用 holdTarget、holdActual；没有读家户私有预算（注释写明只计经营者与居民卖方存货与公账）。注意：只读了 diff 的新增行，没有逐行通读 market.mjs 全文。
- ⑤ **不通过**：同聚落、同物品、adv0、同 level 的 winter 与 normal，56 对中 36 对相等，20 对不等，全在 loc_hw（loc_bs_yupo 28 对全等）。最大相对差 1.2e-4（loc_hw level 0.4 bread：2.500164 对 2.500470）；level 1.0：0.999976 对 0.999932。成因：夹具的 holdActual = level × holdTarget + 固定的 15.7155（店铺货架），冬季 holdTarget=667096、平时 232480（存粮目标随日期，由 farmTargetFood 派生），所以实际 cov 与 level 略有不同，价格 = hT÷hA 随之微差。不是季节加价。分诊：夹具 / 规则口径（规则按名义 level 比价，与有固定常量持有的夹具不相容），不是实现缺陷。不得改判通过。

## R6 逐件涨幅：不通过（① 在 k=2 不满足）
bread、ration 在 buys-1.0（池 cov 1.0）与 buys-0.75 两个夹具下各 10 件。
- 夹具判定：k=1..10 全部 ratioClamped 在 (0.5,3) 内（bread 1.0000~1.0003 与 1.3333~1.3340；ration 同量级），不在顶不在地板，夹具成立。
- ① consistencyError：k=2 行 4 个序列全为 0.00107（bread 1.0：0.001073、bread 0.75：0.001073、ration 1.0：0.001073、ration 0.75：0.001073），> 1e-6，不通过；k=3 起为 0 或 2e-16。
- k=2 的成因（用诊断字段）：explanationParts.relation 由 0.979（k=1）变为 0.97795（k=2），而 scarcity、depth 只微升。quotedRiseVsPrev：bread 1.0 k=2 为 −0.0990%（k=3、4 为 +0.00826%）；bread 0.75 k=2 为 −0.0963%（k=3、4 为 +0.0110%）；ration 1.0 k=2 为 −0.0938%；ration 0.75 k=2 为 −0.0894%。expectedRise（只含稀缺度与深度，不含 relation）k=2 为 +0.00826%，故 consistencyError ≈ relation 的相对变化 0.00051 … 0.00107。这是"买得多、关系变好"的真实规律（relation 分量，规则 ⑤ 已登记），但规则 ① 没有把 relation 的离散步登记进去，所以字面不通过。分诊：规则缺口（① 应在恒等式里计 relation）或探针 expectedRise 字段缺 relation，二者择一。
- ② 分量比值恒等式（c_k = scarcity×depth 的逐件比，对 e_k 与 τ）：4 个序列全部满足，最大偏差 2.2e-16。bread k=2、3、4 的 c_k：1.0 夹具 8.259e-05、8.259e-05、8.260e-05；0.75 夹具 1.101e-04、1.101e-04、1.101e-04。ration：1.342e-04（1.0）、1.790e-04（0.75）。
- ③ 乘性恒等式（baseline×environment×scarcity×quality×depth×spread×relation = listPrice）：在 listPrice 非空的行全部满足（违例 0）；additiveSum 全为 0。
- ④ 账单比（含 ι = curve÷scarcity，这里 ι=1）：违例 0。
- ⑤ 方向条：c_k ≥ 0（c_k<0 的行数 0）。
- 其它：bread 自 k=7、ration 自 k=5 起 net 不再增加（bread net 停在 6、ration 停在 4），k=8..10 与 k=6..10 的 c_k=0，且这些行 listPrice 为 null；ok 仍为 true。这是探针或市场的购买上限（疑为 maxShare 0.3 或每日份额），建议核对。

## R7 开关核验：通过
- ① 矩阵、drought、bs-tight、famine-hw 等 75 个运行：stripped=0，stagesDeleted=[]，priceShiftEffectsInWorld=35。重算：rules.json 的 `"kind": "price_shift"` 现共 35 条，逐钟归类：price:loc_bs、loc_bs_sangban、loc_bs_weiting、loc_bs_yupo、loc_hw 各 3 条（青黄不接共 15）、epidemic 钟共 19、flood:loc_bs 1；famine 钟与 price:loc_bs_liquan（旱情）为 0。35 = 15 + 19 + 1。rules.json 与 48a9f7b4 相同（`git diff` 无差）。
- ② hazardFactor：只有 spring、spring-bs、epidemic、flood 的 with 文件（待替换项）出现 ≠1（1.1、1.15、1.2、1.3、1.5）；其余所有文件逐行为 1；famine 阶段日（lv0.2、0.05 after 行进入 tight）hazardFactor 为 1。
- ③ noclock 的 clocksRemoved 恰等于闭包集合（见 R5②）；"其余钟条数相同"本批数据没有该计数字段，未核。
- ④ seasonFactorsRemoved=true（season-without 16 行与各矩阵行）。
- ⑤ flood-without stripped=1（priceShift 34）、spring 15（20）、epidemic 19（16），与 v7 相同。

## R9 bs-tight：夹具不足（sangban 未进 famine），不判回退；③ 通过；④ 无区分力
- 先判夹具：bs-tight 里 famine:loc_bs_sangban 在 21 天 series 内阶段史恒为 null（三个钟 famine:loc_bs、famine:loc_bs_sangban、famine:loc_ms_tanjie 全程 null），不含 famine。故 R9 记"夹具不足（sangban 未进 famine）"，①②⑤ 不判。（v7 时同夹具第 1 天 sangban 即 tight。）
- 成因（读数据）：sangban 池 cov=0.40（holdActual 618217 ÷ holdTarget 1545544，价格 2.5），但粮仓 coverageOfReserve=1.687（food 16704，reserveTarget 9900），famine 钟的 granary_short 条件读粮仓而不是池，所以不触发。池 holdTarget 约为粮仓 reserveTarget 的 150 倍以上（换算差异：目标 156 饱腹/件，持有 37 饱腹/件），池 cov 与粮仓 cov 脱钩。分诊：规律缺口或夹具（池口径下夹具设持有不能使 famine 钟的粮仓条件成立）。须主会话定处理，规则里 level 调整须先改规则重冻。
- ③ 静态检查通过：rules.json 中 9 处 hazard_phase 引用均按 stage 名，且全部解析到现存钟与阶段（famine:loc_bs famine 2 处、famine:loc_bs_liquan tight 与 famine 各 1、famine:loc_bs_sangban tight、famine:loc_bs_yupo tight、famine:loc_hw tight、flood:loc_bs_weiting crest、flood:loc_hw crest；famine:loc_bs 现只有 famine 阶段）。
- ④ 无区分力：bs-tight 与 bs-tight-noloc_bs（C2 特例，closureMatches=true，clocksRemoved=[famine:loc_bs, famine:loc_ms_tanjie]）的 loc_bs 四物品 84 个（天、物品）读数 holdTarget、holdActual 全相等（持有不等天数 0）；sangban extraItems 逐日逐字节相同（md5 相同）；loc_ms_tanjie 无聚落钱粮账，无物品行（无对象）。可比较的非顶点：loc_bs 全在地板 0.5（hT=112，hA 483~823），sangban 在带内（2.5 到 2.72），但持有不等天数 0，故"④ 无区分力"，R9 整条只能记"部分通过 / 不可判"，不得写通过。starvation 非零天数：loc_bs、loc_bs_sangban、loc_ms_tanjie 均为 0。
- 另见 famine-hw-without（level 0.4、11 天）：famine:loc_hw 全程 null，没有进 tight；hazardFactor 全 1。

## R10 空持有封顶：通过
- zero-hold-hw（loc_hw、autumn 第 545 日、adv0）：四物品 holdActual=0（前置条件满足，cleared=35），scarcityRaw=3（= scarcityCap），ratioClamped=3，divZeroCapped=true；无 error，listPrice（ration 10.44、flatbread 9、bread 6、oats 9）、ratioClamped、relPrice（≈3.0）均为有限正数。
- tiny-hold-hw（持有 1 饱腹单位）：holdTarget÷holdActual = 232480 ≥ 3，ratioClamped=3，relPrice=3.0，有限。scarcityRaw 的口径见 R3 补充。
- ③ 不逆向：autumn level 0.05（cov 0.0500，relPrice 3.0）→ tiny-hold（3.0）→ zero-hold（3.0），相邻不下降（三者都在顶，相等）；level 0.05 锚点按规则不剔除。
- ④ holdTarget 为 0 的输出：没有出现。

## 与上一轮（v7 实现验收）对照
- 转为通过：R1（v7 不可测）、R2（v7 悬崖式 32 组"通过"，现 5 个内部点渐变）、R5②（有对照，不再是同世界）、R5③（运输因子逐点手推）、R7、R10。
- 仍不过 / 新暴露：R5⑤（夹具货架常量）、R6①（relation 步）、R3 补充 tiny-hold、R9（sangban 夹具）、R4 旱情（无在田批次）。

## 可疑之处
1. 池口径下 famine 钟读粮仓而不读池：sangban 池 cov 0.40 而粮仓 cov 1.687，famine:loc_bs_sangban、famine:loc_hw（famine-hw level 0.4）都不触发 tight/famine，矩阵里也只有 level 0.2、0.05 的 after 行进入 tight。R9 与 R5② 因此区分力很弱。
2. 季节性存粮目标：同聚落冬季 holdTarget 是平时的 2.9 倍（loc_hw 667096 对 232480，loc_bs_yupo 1121120 对 320320），由 farmTargetFood 随日期派生；价格比较是 hT÷hA，所以同 level 价格仍同（除固定货架常量差）。是设计内行为，但请确认冬季目标放大 2.9 到 3.5 倍符合预期。
3. 旱情夹具：开局 364 日后无播种批次，整年触发表为空；需单独查是探针没触发播种还是该种子该年无旱。
4. loc_hw winter adv8 level 1.5 的 cov 0.980（比 level 1.5 的名义低 0.52），level 1.0 降到 0.8945：冬季 8 天持有消耗很大，但仍可信（after 行不查 |cov−level|）。
5. 购买序列在 bread k=7、ration k=5 后不再变化，listPrice 为 null，疑似购买量上限。
6. 本次数据里 with 与 without 在矩阵上已无对照意义，已按 v8 不再使用。
