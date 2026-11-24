核对标识：chk-1116-y23（会话标识见主会话台账）；所核提交：791c53e1

# kernel 第四轮只核（李白 03:00）

对照：李白 03:00（y21 散文入口收窄，本轮主依据）、02:45（y19 三项）、02:30（kernel 两环）；上轮 kernel-0245-只核.md（chk-1116-y21，挡封 T1、T2）。不看执行记录。

本机只跑了仓库已有脚本：gen-card-ledger.mjs 两次、check-卷十一.mjs 一次。其余只用 grep、awk、sed -n 读卷文与卡账输出。

偏离自报：有一次用 awk 把输出重定向到 F:/dnd-tmp/launches.txt。这个临时文件在仓库外，但违反"禁用 shell 重定向写文件"，之后没再用；仓库没受影响。

## 今夜三条件判定

| 条件（03:00 第 5 条） | 本轮 | 判定 |
|---|---|---|
| 挡封不超过 1 条 | 1 条（T5，见下） | **达到** |
| T4 名字归卷 0/30 | 0/30 | **达到** |
| 误收 0 | 散文收下的 35 个逐一回查，误收 0 | **达到** |

三条都达到，按 03:00 kernel 不必停。但还有 1 条挡封没修，见末行。

## 一 逐项核对

### 1. 散文三条件：35 个逐一回查，误收 0

- **回查方法**：每个名字都回到卷文原句，查三点：所在小节或句式、函数签名、别卷 §3 是否已登记。
  - **卷三乙 20 个**：都在 §3.2 标题"谓词与纯函数入口"下的 :426。每个名字在本卷都有调用形签名，例如 requirementCheck :1175、documentStanding :1651、valuation 和 scarcity :1698–1699、substituteQty :1756。别卷 §3 都没有登记。**全对**。
  - **卷四 10 个**：出自 §3.3（标题"写入口与唯一写者"）:434 的肯定句"……是只读入口"，名字是主语。签名在 §4.6、§4.7、§4.9 和 §5.1（:726–781、:920、:1129–1137）。**全对**。
  - **卷二十三 3 个**：isWork、isComposition、isAdornment，出自 §3.1（"读入口与谓词"）:252，以调用形定义。**全对**。
  - **卷十二 1 个**：accRun，出自 §3.2（"唯一写者与执行入口"）:558"执行只有一个入口：`accRun(...)`"。**对**。
  - **卷九 1 个**：execute，出自 §3.1（"读入口与谓词"）:490"写入口另见 §3.2：…`execute()`…"。执行器 `execute(engine, state, primitives, cause)` 定义在 :652，别卷 §3 都没有登记。**对**。
- **y21 点名的约 95 个误收已全部消失**：卷五 28、卷十五 16、卷十九 10、卷二十五 10、卷二十六 8，以及 personView、itemView、knowledgeView 等别卷入口。另有 20 个候选因"别卷已登记"被拒，口径合 (c)。
- **否定句**：卷二十五 :258"收割没有本卷的入口"已不收。卷三甲 :263"本卷不设运行期入口"也不收。
- **函数名判法**（"本卷某处写成过调用形 `名(`"）：
  - 对 03:00 第 1 条第二点（不含"."，不是状态路径、字段、参数）来说，这是按写法做的代理判据。本轮效果合格：卷五返回字段子列表、卷十五 readShapes 段、卷十九视图字段一类全被挡掉；缩进子列表一律不收，也帮了忙。
  - **可能漏收的例子**：卷九 :490 的 `interpret`、`narrate`、`narrateTurn` 是函数，但全卷从没写成调用形（`interpret(` 在卷九出现 0 次）。它们若按规则该收，会被这条判据挡掉。本轮它们另有"由卷二 §2.9 登记"一句，所以没有成为实际漏收。
  - **可能误收的例子**：卷十五 §3.2（标题含"写入口"）:373 的散文里有 `transition`、`create`，都是卷九的原语名，而卷九 §3 并未把 transition 登记成入口，所以 (c) 挡不住它。只要卷十五某处写过 `transition(`，它就会被收成卷十五的入口。本轮卷十五没有这种写法，所以没有发生。
  - 两例都是"写法凑巧"的风险，不影响本轮结果，记账。

### 2. 漏收：一处，挡封 T5

- **扫描范围**：卷五、十五、十九、二十一、二十五、二十六 §3 的全部非表格行，以及其余各卷 §3 中带"入口"标题的小节散文（卷一、七、三甲、三乙、四、六、八、八b、九、十、十一、十二、十三、十四、十六、十七、十八、二十、二十二、二十三、二十四、二十七、二十八、二十九）。
- **六个大户卷**：没有合三条件却没收的名字。散文里提到的名字，要么已在本卷表格或列表里登记（如卷五 placeView、routeView，卷十九 facilityView、facilityTypeView），要么是别卷入口、字段或钩子。
- **漏收（T5）在卷九 §3.1 :490**：
  - 原文："边界侧入口（不属规则层，规则层不可调用）：输入边的 `decode()`；AI 边的 …、`effectiveTier()`；`replaySource()` ……没有它"。
  - 这句是肯定句，在标题写明入口的小节里，名字都是调用形，别卷 §3 也没有登记，合三条件。`replaySource()` 是否算入口可议，见需李白裁 1。
  - 漏收原因：生成器的 NEG 是整句判否，句中出现"不属"（不属规则层）、"没有"（装配清单没有它）就整句丢弃。但这两处否定说的是"不在规则层"，不是"不是入口"。
  - 旁证：同节表格已把同性质的 `aiAllows`（"不在规则层，属 AI 边"）登记成卷九入口。§4.14.2 :1163 也把 `aiAllows` 与 `effectiveTier` 并列为该节的统一入口。
  - 其余各卷没有发现第二处这样的漏收。

### 3. 重复登记以主办卷 §3 为准

- **只归卷二的两个**：
  - knowledgeView：卷二十二 §3.1 表（:337–358）没有登记，全卷只在 :34、:770、:902 出现，都不在 §3。
  - eventTypeView：卷二十四 §3.1 :338 写的是"卷二 §2.1 的 `eventTypeView` …入口归卷二，本卷不重定义"，首格不以反引号开头，不算登记。
  - 两个都只归卷二，**属实**。
- **其余 20 个都在主办卷 §3**：
  - itemView、materialView、recipeView 在卷三乙 :418–420；
  - speciesView、bodyView、personView 在卷四 :409–411；
  - placeView、routeView 在卷五 :287、:290；
  - facilityTypeView、facilityView 在卷十九 :229–230；
  - orgView、officeView、polityView 在卷八 :467–469；
  - lawCodeView、offenseView 在卷八b :436、:440；
  - faithView、deityView、cultureView 在卷七 :391；
  - professionView、skillView 在卷十四 :477–478；
  - plantView 在卷二十五 :230；
  - statusView 在卷二十一 :274。
  - placeView 归卷五，**属实**。
- **T2 改挂**：只有两处——knowledgeView 挂 C-卷二十二-knowledge-1（表 knowledge），eventTypeView 挂 C-卷二十四-event_type-1（表 event_type），都是该行实体的主办对象。代码 :768–769 只在 `objectKind === 'table'` 且对象等于 §2.1 该行的表时改挂，不是按名字特判。**T2 已修**。

### 4. 假上线退回、按名查重

- 从卡账 json 抽出全部 397 条 launches，按入口名（不含卷）查重：**重复 0**。
  - personView 只由 C-卷四-person-1 上线；
  - placeView 只由 C-卷五-place-1 上线；
  - itemView 只由 C-卷三乙-item-1 上线；
  - statusView 只由 C-卷二十一-status-1 上线，speciesView 只由 C-卷四-species-1 上线。
- y21 记录的 status-1、psyche-1、sys.arts-1、time_env-1 上的假上线都已退回。
- 摘要里的"重复上线 0 个"现在按名字计，与我抽出的结果一致。

### 5. M4-8 与 M3b-9、M3b-15、M3b-28

- 四行都在摘要"一节对应多个入口 709 行"的名单里，不在"找不到入口"的名单里。
- 卷四 §4.1.2 :465 原文提到 speciesView；§4.1 整节还有 renewableOf、carcassOf，这两个是本轮按 :434 收下的卷四入口。按通用规则这是一节多入口，代码里没有为 M4-8 写特例。
- 卷四卷文本提交未改，最近一次改动是 7b4031b0 乙-7。**属实**。

### 6. T4 重抽（种子 20261115，抽法同 y18、y19）

- **抽法**：entries 非空的卡现在有 32 张（按 json 顺序编 #1–#32）。按 (20261115 mod 32 + 31k) mod 32 + 1 抽 k = 0..29，抽中 #1–#28、#31、#32。未抽中的 #29 time_env-1 和 #30 plant-1 我也一并看了。
- **① 名字归卷不符：0/30**。每个名字都回到所记卷的 §3 原表核对：
  - 卷六 §3.1 :277 起：priceFor 等 32 个；
  - 卷九 :478 起：sceneCard、reviewClaims、aiAllows；
  - 卷十六 :314、:324、:341：speciesThreat、lairOf、awakenOrg；
  - 卷二十三 :242–243：knownForms、actOutcome；
  - 卷二十八 :296、:300：loadWorld、requiredTier；
  - 卷二十四 :348：originEvents；
  - 卷五 :287、:290、:303、:304：placeView、routeView、canEnter、take；
  - 卷十一 :307–308：migRows、migCard；
  - 卷二十一 :274 起：careOptions、treatmentPreview、prevalenceOf；
  - 卷二十九 :427：composeScreen；
  - 卷十七 :265：tripMinutes；
  - 卷十八 :364：stance；
  - 卷十 :265：instanceIdOf；
  - 卷四 :423、:434：instantiatePerson、typicalSpeedOf；
  - 卷十五 :337：interactionsFor；
  - 卷十四 :483：professionsOf；
  - 卷二十六 :302：needSatisfiers；
  - 卷二十 :426、:429：astroView、envAt；
  - 卷二十五 :251 等：butcherOutcome、clearCultivation。
  - 全部归卷正确。#29、#30 也正确。
- **② 该列待查而未列：2/30**。我按卷文自己判：
  - #12 C-卷九-sys.ai_interface-6：M9-22 落点 R9-14.8，落到卷九 §4.14；
  - #31 C-卷九-sys.ai_interface-2：M9-18 落点 R9-14.2，同样落到 §4.14。
  - 两张卡都把 aiAllows 当作"唯一入口"记进 entries。但卷九 §4.14.2 :1163 同时列出 `aiAllows` 与 `effectiveTier`，按 01:30 应列一节多入口待查。它们被记成唯一，是因为 T5 漏收了 effectiveTier。
  - 其余卡没有发现同类问题：卷九 §4.10 只有 sceneCard；卷五、卷十六、卷二十一、卷二十 各落点节里只出现一个本卷登记名，与原文相符。
- **y21 的 7/30 已清零**：status-1、status-2、time_env-2、psyche-1、psyche-3、psyche-4、sys.arts-1 都不再带 personView 或 itemView。
- **T4 原因核实**：y21 的 7/30 来自 T1 假名字，T1 修好后归零，与 03:00 第 4 条"先查因"一致。

### 7. 无环、红线、复现

- **主卡族无环**：我从卡账 json 抽出全部 222 条 dependsOn 边，用 Kahn 拓扑排序验证，115 张卡全部排完，**无环**，没有指向不存在的卡。y21 的假边 time_env-2→status-1 已消失。
- **子进程卡族**：仍没写进 json，只能信摘要 :34 的"无"（记账，同 y21）。
- **红线**：新增行里没有按迁移行号、条目号、卷名写的特判。
  - NEG 是通用词表，签名栏按表头含"签名"定栏，缩进子列表是通用写法规则；
  - 改挂按 §2.1 表的 kind 与卡对象比对，查重按名字；
  - 没有出现 personView、placeView、M4-8 等字面量。
- **check-卷十一**：失败项 0。
- **生成器连跑两次**：卡账 json 的 md5 两次都是 4d34dee2…，与提交里的版本相同；工作区无变化。读数：卡 115，n = 5，阶段分布 3/74/17/17/2/2，launchDup 0，notLaunched 225，matrixBad 102，acceptBad 0，phaseCycle no。
- **快照**：勘误前-1116k6c 与父提交卷十一逐字相同；封卷.md 与现行卷十一逐字相同。

### 8. "入口与对象不符"本轮行数

**已导出，不是缺口**：摘要第 43 行写明 18 行，按来源卷分了组，并逐行列出"名属谁、行属谁"，例如 M5-22b/c/d placeView 属 table:place，行属 offense、org、worldgen。由 y21 的 40 行降到 18 行，是因为假名字（personView 等）不再推出入口。"执行方没导出"的说法与输出不符，规则执行没有缺口。

## 挡封真问题（1 条）

- **T5 散文否定判据过宽，漏收卷九边界侧入口**
  - 出处：gen-card-ledger.mjs 新 :76 的 NEG，加上 addProse 里的整句判否。只要句中出现"没有、不属"等词就整句丢弃，不看否定的是不是"入口"。
  - 结果：卷九 §3.1 :490 的 `decode()`、`effectiveTier()`（可能还有 `replaySource()`）合 03:00 三条件却没有收。
  - 后果：
    - ② 有 2/30 张卡（sys.ai_interface-6、sys.ai_interface-2）把一节多入口（§4.14：aiAllows、effectiveTier）记成唯一入口 aiAllows；
    - 这些名字也不在 launches 和 notLaunched 里，上线义务漏了。
  - 整类修法：否定只在否定词直接管到"入口"时成立，如"没有…入口""不是…入口""不设…入口"。句中否定别的事（"不属规则层""没有它"）的，不判否定句。修后重跑，回查卷九 :490，并复核 ② 那两张卡。

## 不挡封记账

- 函数名用"本卷写成过调用形"作代理判据：本轮无误收。可能漏收的例子是卷九 interpret、narrate、narrateTurn（从未写成调用形）；可能误收的例子是卷十五 §3.2 的 `transition`（别卷 §3 未登记，若本卷写过 `transition(` 就会被收）。
- statusView 归卷二十一（:274 表中登记，注"卷二已定"）；materialView 登记在卷三乙，由卷三甲的 material-1 上线。两处都合"主办卷 §3"的字面。
- entries 非空的卡由 30 张变成 32 张，抽样用的模数随之变化，#29、#30 没抽到；我额外看了这两张，没有问题。
- 子进程卡族的环仍只有生成器读数，没写进 json（同 y21）。
- y21 的其余记账项（bodyView 由 §2.5 顺带推出；落点只取第一个节号；并组行把别对象的入口带进卡；非 delete 行落点为空不计；§2.1 按固定栏取名）本轮没改，也没有恶化。

## 需李白裁

1. **卷九 §3.1 :490 的边界侧入口算不算卷九 §3 的入口**：
   - 涉及 `decode()`、`effectiveTier()`、`replaySource()`（仅测试装配注入），以及原文写明"由卷二 §2.9 登记"的 `interpret`、`narrate`、`narrateTurn`。
   - 我按 03:00 三条件判，decode、effectiveTier 该收，据此把 T5 列为挡封。
   - 若裁定边界侧（规则层不可调用）不算卷九 §3 入口，T5 降为记账，但同表的 aiAllows 也要按同一口径处理。

## 防空转

- **挡封条数**：本轮 1 条（T5），y21 是 2 条（T1、T2），**条数下降**。T5 是新出现的一类（漏收，方向与 T1 相反），不是旧问题复发。
- **y17–y21 已清的问题有无复发**：
  - y21 T1（散文误收）、T2（改挂不核对象）都已清；
  - y21 的 T4 ① 7/30 归零；
  - y19 点名的 material-1、item-2、item-3 entries 仍为空，sys.monsters-1 不接 speciesView；
  - y17 的借名归卷、拒收两条没有回退；
  - 假边 time_env-2→status-1 已消失。
  - **未见复发**。

不可封卷
