共 12 条，甲 0 乙 7 丙 5，有理由 8 无理由 4。
本卡读了：卷十 :407-474、:619-719；卷五 :626-695、:787-828。代码：server-plugin/kernel/gen/siteform.mjs :1-371、water.mjs :1-107、waterband.mjs :1-109、waterfoot.mjs :1-201；另读 water-bed.mjs :1-131（卡③点名的公共部件）。没读到：卷十 §4.12.1（不在卡给范围，抽取点代号未核）、卷五 §2.1/§4.1（水体行须为存量单元、足迹相邻判据只按卷十与问题.md 转述）、place.mjs（河床调用的 ordered 判据与站点足迹读法未核）、blueprint.mjs 与 layout.mjs 只按调用点读了需要的段落、未通读。卷十 §4.6 栖地派生、§4.2 省郡骨架与卷五 §4.6 站点类型在本卡列出的四个文件里没有对应实现（在别的阶段或未建），未立条。

### 1 水体阶段不按 whenRX 分类、不改规则行按 whenRX 选
- 位置：server-plugin/kernel/gen/water.mjs:70
- 设计原文：卷十:435，摘原句“对每块地表存量单元，取 rules.gen.water.rows 里 whenRX（读本单元的场值、地形、相邻单元的海拔聚合）为真者中 priority 最大的一行（并列取行序最小）；命中即这块单元是水体”。
- 代码实际：只遍历已挂 comp_waterbody 的行；规则行按“waterKind 字符串相等 + priority 最大”重找，waterKind 不写、liquid 不由 liquidRX 抽（缺即 deferred liquid_missing）。
- 理由：有。world/rules/registry.json:595 明写 waterRows “本卡只落 priority、waterKind、depthM，whenRX 与 liquidRX ……落地后补”；docs/问题.md:591 ③ 同条。
- 影响：规则缺（卷十命中的水体、waterKind 与液体都生成不出来）；现有手写水体行按 waterKind 找回水深规则，四种 waterKind 各有行，尚未读数错。
- 严重程度：乙
- 合并：无

### 2 waterfoot 的 whenRX 读不到父行维度
- 位置：server-plugin/kernel/gen/waterfoot.mjs:122
- 设计原文：卷十:436，摘原句“补的分布取 rules.gen.water.fill.rows 里 whenRX（只读本行已有的 waterKind 与父行维度）为真者中 priority 最大的一行”。
- 代码实际：ctx.when(r.whenRX, d) 只把本行维度绑给 RX（gen/when.mjs:31-39），父行维度读不到；现有数据行只写 waterKind == water_river/water_sea，未触到。
- 理由：有。docs/问题.md:615、docs/PLAN.md:159（RX 读父行维度入口待卷二登记，排在 G14 后）。
- 影响：规则缺（按卷文写父行维度条件的规则行会永假、命中不到，需补的行报 E-GEN-ROW-INVALID），暂未出错。
- 严重程度：乙
- 合并：无

### 3 siteform 的 bldfill whenRX 读不到形制条目数值字段
- 位置：server-plugin/kernel/gen/siteform.mjs:110
- 设计原文：卷十:689，摘原句“取 rules.gen.bldfill.rows 里 whenRX（只读本行 intendedType 代号与所挂形制条目的数值字段）为真者中 priority 最大的一行”。
- 代码实际：ctx.when(r.whenRX, d) 只绑本行维度（intendedType、form 等），形制条目的数值字段读不到；规则表改用 known(form)/form == 具体形制代号分行。
- 理由：有。docs/问题.md:615、docs/PLAN.md:159；按形制代号分行的做法与 intendedType 口径的出入见 docs/问题.md:813。
- 影响：规则缺（按意图与形制数值分行的规则写不出来），现由按代号分行顶替，暂未出错。
- 严重程度：乙
- 合并：无

### 4 §4.7 的分片模板、清单、店铺派生没有实现，落位恒按不分片跑
- 位置：server-plugin/kernel/gen/siteform.mjs:331
- 设计原文：卷十:673，摘原句“候选是 applies 对该站点为真的 layout 条目（判法归卷十九）。在候选里取 culturePref(seatOf(站点), rules.gen.layout.prefKind 所指种类, 模板代号).weight 最大者”。
- 代码实际：input.zones 恒为 []、无 R10-7.1–7.4、R10-7.6–7.10 的代码；站点面积只用不分片公式 N = max(1, ceil(全部占地 ÷ (coverage × A)))，gen.layout/manifest/shops 三个维度没有读写。
- 理由：无（仅 siteform.mjs:181-191 注释自述“模板与分片角色未接线”；docs/问题.md:731 只登记“R10-7.5 不分片站点”已落，没把整节未建登记为未建）。
- 影响：玩法不可达（远方聚落物化出来没有分片、没有清单与店铺）。
- 严重程度：乙
- 合并：无

### 5 “站点”按排除法认，把作者的非政区、非存量单元、非水体的区域足迹行都当站点写面积
- 位置：server-plugin/kernel/gen/siteform.mjs:223
- 设计原文：卷十:682，摘原句“站点的 targetAreaM2 写 N × A，足迹种子 coord 写所在存量单元的 coord”。
- 代码实际：siteRows = 作者写的、parent 非空、regionLevel 为空、不挂 comp_tract/comp_waterbody 的全部区域足迹行；其中没有 targetAreaM2/boundary 的每行都写 targetAreaM2（无建筑也写 1 区格面积），不看 comp_settlement/siteType。
- 理由：有。docs/问题.md:750（卷十没有站点正面标识，作者分片行出现前须按组件类排除）。
- 影响：规则缺/可能误写（作者分片行一出现就会被当站点量面积）；现真实数据没有分片行，暂未出错。
- 严重程度：乙
- 合并：无

### 6 水体行未核同挂 comp_tract（存量单元）
- 位置：server-plugin/kernel/gen/water.mjs:38
- 设计原文：卷十:435，摘原句“水体阶段对每块地表存量单元……命中即这块单元是水体……水是存量单元（露天的池是区域足迹，井下含水层是体积足迹）……水体行必须是存量单元”。
- 代码实际：waters 只按挂 comp_waterbody 取行，不检查是否也挂 comp_tract；tracts 集合由 comp_tract 单独取，未挂 comp_tract 的水体行不计入自身 catchmentM2，也不会出现在别人的汇水里。
- 理由：有。docs/问题.md:591“卷十封卷后勘误清单：水体行须同挂 comp_tract 的加载校验（G5b 水体行进表前必做）”。
- 影响：规则缺（校验没有做，数据错时会静默少算汇水面积）。
- 严重程度：乙
- 合并：无

### 7 补出的 facing 只走纬度缺省，意图与文化偏好两路无来源
- 位置：server-plugin/kernel/gen/siteform.mjs:305
- 设计原文：卷十:699，摘原句“（facing 取卷十九形制选择给出的朝向，§5.3 C10-23）”。
- 代码实际：defaultFacing(grid, { intentFacing: null, culturePref: null, latitudeDeg })——两路传空，一律按纬度面向赤道。
- 理由：有。docs/卡回报/layout-fill.md:47（chooseForm 未建、卷七 §4.28 输出接口未建；有来源时只改传参）。
- 影响：读数错（有意图或文化偏好来源的站点，朝向会取错），现在两路都还没有来源。
- 严重程度：乙
- 合并：无

### 8 capacityM3 加了一道卷文没有的“小于 1 即拒收”
- 位置：server-plugin/kernel/gen/water.mjs:85
- 设计原文：卷十:435，摘原句“capacityM3 = ⌊surfaceM2 × 按该行 depthM 抽得的水深⌋（整立方米）”。
- 代码实际：整立方米数 < 1 时抛 E-GEN-ROW-INVALID；卷文只说向下取整，乘积不足 1 时为 0 是合法读数。
- 理由：无。
- 影响：只是形式/边界（区格边长 100 m 下水面至少 1 万 m²、最深类水深下界 0.1 m，实际到不了；以后细格变小时会拒掉合法浅水）。
- 严重程度：丙
- 合并：无

### 9 四邻方向常量在 waterband 另写一份
- 位置：server-plugin/kernel/gen/waterband.mjs:12
- 设计原文：卷十:439，摘原句“带永远是含中心线的四邻连通块”。
- 代码实际：NEIGHBORS = [[1,0],[-1,0],[0,1],[0,-1]] 自写常量，未引公共部件（公共部件尚不存在，审查已排期抽出）。
- 理由：有。docs/研究/公共部件审查-甲-1122.md:197（D6，同一常量 8 处之一）与 :307（排 G14 后、G15 前抽到 footprint.mjs）。
- 影响：只是形式。
- 严重程度：丙
- 合并：见 docs/研究/公共部件审查-甲-1122.md D6 与汇总 :307

### 10 下游行既无 boundary 也无 coord 时按“没有下游”处理
- 位置：server-plugin/kernel/gen/waterfoot.mjs:170
- 设计原文：卷十:439，摘原句“T_D = D 有 boundary（作者画的，或 D 是流水时本阶段已写的窄带）时取 boundary 的全部格，否则取 D 的种子区格”。
- 代码实际：D 不是本阶段处理的作者水体行、也没有 boundary 与 coord 时 target 为空，centerLine 只返回种子区格，不报缺口。
- 理由：无（仅 waterfoot.mjs:10-11 注释自述“已定……按‘下游为空’处理，不编 D 的位置”）。
- 影响：只是形式（D 本该由本阶段先处理而必有种子；此处是作者数据不全时的兜底）。
- 严重程度：丙
- 合并：无

### 11 siteform 注释称 materialKg 补法未落，实际已由 envelope 阶段实现
- 位置：server-plugin/kernel/gen/siteform.mjs:19
- 设计原文：卷十:692，摘原句“materialKg、condition 缺时……开局按形制默认料补，作者可逐栋覆盖”。
- 代码实际：siteform 头注释仍写“materialKg 缺时的补法（R10-7.12 末“未落”，仍由作者写）”；gen/envelope.mjs:1-20 已按 1123k60 补 materialKg、condition、wallFlowKg。
- 理由：无。
- 影响：只是形式（注释误导后来者，行为本身已符合卷文）。
- 严重程度：丙
- 合并：无

### 12 占用格键跨父、跨格空间一律互斥，比卷文“同父兄弟”宽
- 位置：server-plugin/kernel/gen/waterfoot.mjs:78
- 设计原文：卷十:436，摘原句“……扣去作者 boundary 覆盖的格、作者已写的与骨架阶段已生成的同父兄弟种子格、本阶段先处理的水体行已取的种子格与已写的窄带格”。
- 代码实际：boundaryKeys 与 taken 是全局“x,y”键，不分父行、不分格空间；seedAt 按父分表（这一半合卷文），但已齐行与先处理行的占用跨父也互斥。
- 理由：有。docs/问题.md:621（Opus S1：占用格键不分格空间；已齐行把作者 coord 跨父也计占用，比卷文“同父兄弟”宽，保守；归多格空间开时）。
- 影响：规则缺/偏保守（多格空间或父足迹重叠时会误排斥种子格与窄带格，报 E-GEN-WATER-FOOTPRINT）；现单格空间、父足迹互不相交，暂未出错。
- 严重程度：丙
- 合并：无

## 已登记未建
- **storeysMax 用蓝图输入域上限顶替卷十九 buildPlan 的材料上限**：卷十:690“storeysMax 取卷十九 buildPlan 对本行 form、materialKg、wallThicknessM 给出的层数上限”；siteform.mjs:117-124 现取 blueprint.limits.storeysMax，每个补层数的行记缺口 storeys_max_unchecked。登记：docs/问题.md:617。
- **房间行不补建、只列缺口**：卷十:691“按 R10-7.8 ② 同一个建行函数补建房间行”；siteform.mjs:154-172 记 deferred room_rows_unbuilt 与 `<roomRole>#<序号>`，不造行。登记：docs/问题.md:616。
- **站点无存量单元祖先时的“临时退路”**（卡文点名要核 siteform.mjs:242 是否登记）：卷十:682“一路往上都没有时，起始 N 不判，加一的上界临时退回父行足迹的区格数、照常排位（李白 11-23 事件 da3cd65a 选甲；临时退路，等真实世界存量单元卡补上存量单元后撤）”；siteform.mjs:242-251 照此实现，并另记 tract_footprint_unplanned。登记：docs/问题.md:748（原登记在“G5b 机制遗留”第 2 条，已写明“临时退路、存量单元卡补后撤”）。

## 拿不准
- **手写站点缺 coord 时是否该写所在存量单元的 coord**：卷十:682 只说生成站点的“足迹种子 coord 写所在存量单元的 coord”，手写站点缺 coord 时 siteform.mjs:294-296、326 记缺口 layout_footprint_unplanned / layout_footprint，不写 tract coord；这句是否也适用于补缺，卷文推不出。
- **排水去处海拔未知时静默把 downstream 记空**：卷十:435 的派生链以代表海拔严格下降为前提；water.mjs:46-52 在自身或候选 elevationM 未知时返回 null（不记缺口、不报错），卷文没写未知时怎么交。
- **建筑行下的建筑（19 栋私宅）不落位**：卷十:699 的落位只讲站点下的建筑；siteform.mjs:260 明写直挂非站点行的手写建筑不排位。卷文没写“建筑下的建筑”，须李白定（docs/问题.md:875-878，已裁③改挂方案、实测另有一批同区格种子问题）。
- **河床“有表序”判据不在 water-bed.mjs**：卷五:664“有表序的行（flowing 为真且 boundary 非空）”由调用方交入 info.ordered（water-bed.mjs:88-121 只读它）；交入处 place.mjs 不在本卡文件清单，本次未核该判据是否照此取。

## 跨卷待判
- **生成期选站点类型是否与运行期同律**：卷五:807“卷十物化远方聚落时用同一资格判断选类型，写回同一字段”，对应卷十:475 §4.3（远方聚落按需物化）。物化阶段未建，本卡四个文件里没有选 siteType 的代码；要判须同时读卷五 §4.6 与卷十 §4.3。
