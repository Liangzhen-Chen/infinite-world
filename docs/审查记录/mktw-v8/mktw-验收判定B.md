# MKTW 判定 B（独立，未读判定 A）

依据：冻结规则 v7，`head -112 冻结规则.md | sha256sum` = bae32cd9e6a277600a025468df53596b604ce767fffe02db1d6bc88a8b809d54，与规则一致。
数据：F:/dnd-tmp/mktw/out6，91 个 jsonl，均有 done 行。全部用 grep/awk/sed 读取，未运行 node 或其他脚本。
性质：这批是**基线**（现代码、手写倍数未删）。规则"两类运行"写明基线只记录、不判通过。下文"不通过"指按规则文字机械判定的结果，用来记"缺规律证据"，不是验收结论。

## 取数与夹具
- 取行：单模式矩阵 = winter-without-*、autumn-without-*、yupo-winter-without-*、yupo-autumn-without-* 共 24 个文件，mode=without。pair- 情形不进组。
- 分组：(settlement, season, phase, item) 共 2×2×2×4=32 组。relPrice=listPrice/regionalBase。全表 |relPrice−ratioClamped| ≤ 4.5e-10，两者在矩阵里同值。
- advance=0 行：cov 与 level 完全相等，可信。
- 所有 after 行 fixtureUntrusted=null，advance.days=8。
- 但 after 行 level=0.05 的 cov 为 0（仓见底，level>0 且 cov≤0），记**夹具不可信**，不进任何组：
  - loc_hw winter after 0.05
  - loc_hw normal after 0.05（该行还在地板，relPrice 0.5）
  - loc_bs_yupo winter after 0.05
  - loc_bs_yupo normal after 0.05 的 cov=0.0040>0，可信。
- 各 after 组可信输出数：hw winter 5、hw normal 5、yupo winter 5、yupo normal 6。before 组 6。都不少于 3。
- 在顶 = ratioClamped 等于 limits[1]=3；在地板 = atFloor 或等于 limits[0]=0.5（均读自 start 行）。可信输出中**没有任何在地板的**。

## R1 冬荒高于平时（winter 矩阵、advance=0）
基线取 normal before-advance 的 cov=1.5（level 1.5），不在顶、不在地板，可用。冬季 cov<0.5 的可信输出：cov 0.4、0.2、0.05。

| 聚落 | 物品 | 基线 relPrice | 冬季 cov 0.4 / 0.2 / 0.05 | 结论 |
|---|---|---|---|---|
| loc_hw | ration | 0.617021 | 0.617021 / 0.617021 / 0.617021 | **不通过**（相等，不是上涨） |
| loc_hw | oat_flatbread | 0.617021 | 同上 | **不通过** |
| loc_hw | bread | 0.617021 | 同上 | **不通过** |
| loc_hw | oats | 2.000 | 3.000 / 3.000 / 3.000 | 通过，冬季三个输出全在顶（封顶） |
| loc_bs_yupo | ration | 1.0 | 1.0 / 1.0 / 1.0 | **不通过** |
| loc_bs_yupo | oat_flatbread | 1.0 | 同上 | **不通过** |
| loc_bs_yupo | bread | 1.0 | 同上 | **不通过** |
| loc_bs_yupo | oats | 2.000 | 3.000 ×3 | 通过，封顶 |

- 整体：**不通过**（8 项中 6 项不通过）。
- oats 的触顶缺口区间（冬季 before 组）：上一档 cov 1.5（level 1.5，缺口 −0.50，rc=2.0，不在顶）与 cov 0.9（level 0.9，缺口 0.10，rc=3，在顶）之间。两个聚落相同。
- 三种食物对仓覆盖率完全不响应：hw 的 supply 47、demand 29 在 6 个档位下不变。
- 分诊：**规律缺口**。这三种物品的稀缺度没有接入粮仓缺口。

## R2 越缺越贵（按组，无倍数）
- a) 不下降：32 组可信输出中**没有任何一对下降**。
- 食物三件（ration、oat_flatbread、bread）：2 聚落 × 2 季 × 2 phase × 3 物品 = 24 组，每组全部输出 relPrice 相等，且都不在顶、不在地板。
  - 例：hw winter before ration，cov 1.5→0.05 全是 0.617021。
  - 例：yupo normal after bread，cov 1.2332→0.0040 全是 1.000000。
  - 违反 b)（未封顶必上涨），**24 组全部不通过**。
  - 这 24 组：未封顶、未封底。
- oats 8 组：
  - before ×4（hw winter、hw normal、yupo winter、yupo normal）：cov 1.5 → rel 2.0，cov 0.9 → 3.0（顶），此后到 cov 0.05 都是 3.0。
    - 相邻对 (1.5, 0.9) 上涨，其余是顶内相等，只记录。**通过**。
    - 触顶缺口区间：cov 1.5（level 1.5，缺口 −0.50）与 cov 0.9（level 0.9，缺口 0.10）之间。未封底。
  - hw winter after：cov 1.4174（rel 2.3956）→ 0.8174（3.0，顶）。**通过**。
    - 触顶区间：cov 1.4174（level 1.5，缺口 −0.417）与 cov 0.8174（level 0.9，缺口 0.183）之间。
  - hw normal after：cov 1.4391（2.2775）→ 0.8391（3.0，顶）。**通过**。
    - 触顶区间：cov 1.4391（level 1.5，缺口 −0.439）与 cov 0.8391（level 0.9，缺口 0.161）之间。
  - yupo winter after：cov 1.3422（2.9221，未顶）→ 0.8178（3.0，顶）。**通过**。
    - 触顶区间：cov 1.3422（level 1.5，缺口 −0.342）与 cov 0.8178（level 0.9，缺口 0.182）之间。
  - yupo normal after：6 个输出全在顶，最大 cov 1.2332（level 1.5）。按 d) 记"整组封顶，不可测"。
    - 触顶区间：不晚于 cov 1.2332 顶住，更小缺口无数据。
- 整体：**不通过**（24 组不通过；oats 7 组通过，1 组不可测）。
- 分诊：食物三件是规律缺口，同 R1。

## R3 稀缺度同向
- 矩阵：全部相邻 cov 输出里 rc 与 relPrice 同值。rc 相等 → rel 相等（≤1e-9），rc 上升（oats 2.0→3.0 等）→ rel 同升。无违反。**通过**。
- 序列（相邻两天，4 物品逐日比较）：drought-without 6 对、flood-without 6 对、flood-control 6 对、bs-tight-without 20 对，每个物品全部 ok。**通过**。

## R4
- **旱情（drought-without）**：D0=day0（clocks 为 null），D1=day1（首次含 "dry"）。granary.food 8640→8566，下降，故判。
  - item_oats：ratioClamped 3→3，relPrice 3.0→3.0，满足 ≥。**通过**（oats 在顶，相当于封顶下的平凡通过）。
  - 复位部分：6 天内阶段史只有 dry、drought，没有 rain。**不可判（时钟未走到）**，不影响前半。按 R8 应加大天数重跑才能判复位。
- **洪水（flood-without、flood-control、flood-with）**：F1=day2（首次含 crest），F0=day1。对照 mode=control，stagesDeleted 含 route_closure 项，夹具成立。
  - ration：supply_without 8→7，Δ=−1；control 8→7，Δ=−1。封路无影响。
  - bread：8→7，两边相同。封路无影响。
  - oats：8→8，两边相同。封路无影响。
  - 三物品全部"封路无影响"，归类**②无源头原因**，10578 并入待替换清单。
  - 备注：with 模式的 supply 序列也与 without、control 逐日相同，见"数据可疑"。
- **周贸易季节系数（season-with、season-without）**：
  - without 的 16 行（4 个 buyer × 4 季）：seasonFactors 全为 [1,1,1,1]，seasonFactorsReset=true。
  - with 的 16 行：seasonFactors=[0.9,1,1.1,1.2]，下标 3（冬）1.2 大于下标 2（秋）1.1。
  - **通过**。四季 regionalBase 差异只记录，来自运输 risk 与环境，不判。
- **待替换项**（epidemic、spring、spring-bs）：待替换不判。

## R5 无特例
- ① R1、R2、R3 在 loc_hw 与 loc_bs_yupo 上同样成立：**不通过**。
  - R3 通过；R1、R2 在两个聚落同样不通过，同因：食物三件不响应缺口。
  - 四个物品逐项在两聚落结论一致，没有聚落特例。
- ② modeDiff 里 withHazard=1 的行，equal 必须全为 true：**不通过**。
  - 4 个情形族（pair-autumn、pair-winter、yupo-pair-autumn、yupo-pair-winter）里，withHazard=1 的行 equal=false 共 38 行，**全部是 item_oats**。
  - 构成：autumn 24（2 聚落×2 phase×6 档）、winter before 12、winter after 2（lv 0.05 各 1）。
  - 失败字段：environment、regionalBase、listPrice。with 的 seasonFactorWith 是 1.1（秋）或 1.2（冬），without 为 1。
  - 例：pair-autumn-*，oats withListPrice 9.9 对 withoutListPrice 9。
  - 其余 3 种物品在 withHazard=1 行都是 true。
  - 机械判不通过。归因：seasonFactors 每天都生效，不存在"不触发被去掉倍数的日期"，规则 ② 与 seasonfactor 类被剥离之间有张力（见可疑项）。
  - withHazard=1.2 的行（famine 期）不在 ② 约束范围，只记录。
- ③ 无倍数矩阵 environment 恒为 1：**不通过**。
  - loc_hw：全部行为 1。
  - loc_bs_yupo 的 item_oats：24 行 environment=1.2414213562373095，magicFactor 与 forestWaterFactor 均为 1。
  - 机械判不通过。来源不明（不是魔法或林水），见可疑项。
- ④ 按聚落、季节、物品 id 分支的新逻辑：**无法判定**。缺 diff 与代码，输出数据里无此信息。

## R6 逐件涨幅（buys-without；buys-with 逐行相同）
item_bread 的 quotedRiseVsPrev：
- k=2：2.4986%，在 [2.0%, 3.2%] 内。
- k=3：**6.1952%**，超出区间。
- k=4：2.7043%，在区间内。

k=3 超出区间，**不通过**。这与规则写明的"改前基线预期约 6.2%"吻合，只记录。
- 这几行 atFloor、atTop 均为 false，是可测的。
- consistencyError：k=2 为 1.10e-3，大于 1e-6。该行未夹取，一致性**不通过**；k=3…10 为 0。
- 其他读数：k=5 2.7555%，k=6 2.8093%，k=7 2.8659%，k=8…10 为 0（见数据可疑）。
- item_ration（非 R6 对象）：k=2 2.4986%，k=3 2.6554%，k=4 2.7043%，k=5 2.7555%，之后 0。

## R7 开关核验
- 24 个无倍数矩阵文件：strippedClasses=[winter, drought, seasonfactor]，stripped=15，stagesDeleted 含 `famine:loc_bs:tight`，seasonFactorsReset=true。**通过**。
- 条数的重算：15 来自规则文（famine 钟 11 处加 loc_bs tight 1 处、旱情 3 处），我只核对了输出里的 stripped 字段，没有逐条重数 rules.json。
- 其他无倍数情形：
  - drought-without：stripped=3，stagesDeleted 含 price:loc_bs_liquan:rain:emptied。
  - bs-tight-without 与 famine-hw-without：stripped=12，含 famine:loc_bs:tight（winter 类，单独运行）。
  - flood-without：stripped=1。
  - season-without：seasonFactorsReset=true。
- 有倍数运行：famine 阶段日（winter-with after，lv 0.05 除外）的 hazardFactor 为 1.2，作用在 ration、oat_flatbread、oats 上；bread 为 1.0。before 行和秋季为 1。
  - rules.json 里 loc_hw 的 famine price_shift 物品列表含 oats、ration、oat_flatbread、不含 bread，与输出吻合。
  - 1.2 是否等于配置值，我没有逐条核对 rules.json 里的 factor 数值。
- 整体：**通过**，限于以上核对范围。

## R9 bs-tight 缺粮回退
夹具：with 运行里 famine:loc_bs_sangban 阶段史含 famine（day8 起），夹具足够。
无倍数运行：
- ① sangban 含 famine（day8 起，与 with 一致）：满足。
- ② famine:loc_bs 含 famine（day1 起，famineActive=true）：满足。
- ③ famine:loc_ms_tanjie 依次含 tight 与 famine：**不满足**。
  - 20 天内阶段史始终只有 ["tight"]，没有 famine。
  - 对照：with 运行里 tanjie 20 天全是 null，loc_bs 也全是 null。
  - 可能只是 20 天太短，规则要求同时满足，机械判不满足。
- ④ loc_bs 与 sangban 的 starvation 逐日不大于 with：满足。两边 21 天均为 0。
- ⑤ F1=day1，F0=day0：
  - oats ratioClamped 3→3，relPrice 3.0→3.0，不回退，满足。
  - ration ratioClamped 0.875→1.25，relPrice 0.875→1.25，不回退，满足。

R9 整体：因 ③，**不通过**，记"缺粮回退"。
- 分诊：hazard_phase 错位（famine:loc_bs 删掉 tight 后，famine 直接在 day1 触发，而 tanjie 只到 tight）。属于**实现缺陷**（hazard_phase 依赖未同步）或 20 天不足，两者数据上分不开，须加大天数重跑才能区分。

## R8 汇总
| 规则 | 结论 |
|---|---|
| R1 | 不通过（食物三件，两聚落各 3 项；oats 通过且封顶） |
| R2 | 不通过（24 组食物不通过，oats 7 通过、1 不可测） |
| R3 | 通过 |
| R4 旱情 | 前半通过（oats 在顶，平凡通过）；复位不可判（6 天没到 rain） |
| R4 洪水 | ②无源头原因（10578 并入待替换） |
| R4 季节系数 | 通过 |
| R5 ① | 不通过 |
| R5 ② | 不通过（38 行 oats，seasonFactor 每天生效） |
| R5 ③ | 不通过（yupo oats environment=1.2414） |
| R5 ④ | 无法判定（缺 diff） |
| R6 | 不通过（k=3 为 6.2%；k=2 的 consistencyError=1.1e-3）；基线只记录 |
| R7 | 通过 |
| R9 | 不通过（③ tanjie 无 famine） |

- 夹具不可信（不进任何组）：3 个 after 行（hw winter after 0.05、hw normal after 0.05、yupo winter after 0.05，cov=0）。
- 封底：可信输出里没有在地板的，所有组"未封底"。

## 数据与探针可疑之处
1. **oats 的价格只和"仓超过储备目标的部分"有关**：supply=food−reserveTarget，不足为 0（例：hw food 7830 目标 5220，supply 2610，rc=2；food 4698 时 supply 0，rc=3）。按这个公式，oats 的 rc 在 cov 约 1.333 以下就顶到 3（此为推算，非数据直读）。所以几乎所有真实缺口都落在封顶段内，oats 的"越缺越贵"基本不可测，3 倍上限是否过低另开待查，规则已把这点排除在外。
2. **食物三件的 supply/demand 与仓无关**：hw 为 47/29，yupo 里 rc=1。要么探针没有接入粮仓缺口，要么引擎本来就没接。这是 R1、R2 的主要失败来源。
3. **yupo 的 oats environment=1.2414**，magic 与 forestWater 都是 1，来源不明。导致 R5③ 机械不通过。
4. **R5② 与 seasonfactor 的张力**：seasonFactors 每天生效，withHazard=1 的日子 oats 仍与 without 不同，规则 ② "equal 必须全为 true"在 seasonfactor 类被剥离时不可能满足。这是规则/设计层的问题，不是探针问题。
5. **洪水三种模式 supply 序列完全相同**（with、without、control），连 with 里的封路也没有改变观测聚落的 supply。可能是 loc_bs 这个观测面看不到封路效果，"无源头原因"结论的可靠性依赖探针观测点是否正确。
6. **R9 ③**：with 运行里 loc_ms_tanjie 20 天始终 null、loc_bs 也 null，而 without 里 loc_bs 第 1 天就 famine，说明删 tight 改变了时钟行为。20 天可能不足以让 tanjie 走到 famine。
7. buys 的 bread 在 k=8…10、ration 在 k=6…10 涨幅为 0，可能是 supply 耗尽或夹取；atFloor/atTop 为 false，但值得核对。
8. R6 的 k=3 为 6.2%，与 k=2、k=4 的 2.5%、2.7% 差异明显，与"改前基线 ~6.2%"一致。
9. famine-hw 里 hw 的 famine 时钟在 with 与 without 里逐日相同，tight 阶段仍在；该情形不在 R 条文里，只记录。
