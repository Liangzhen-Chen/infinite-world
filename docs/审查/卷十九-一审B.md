# 卷十九 一审 B（审查员 B，claude-opus-5-5 中档，11-13）

审查对象：`卷十九-建筑与设施.md`（1068 行，第一版）。
侧重：断言能否交给机器判定、有没有整类绕法；模板是否齐全；§1.2 现状与 §7 迁移清单是否完整。
已读：全卷；台账卷十九小节与第五节；卷十九素材包全文；卷二 §1.5、§1.12、§2.1、§5.7、§6.4；卷三 §4.1 维度表与跨卷行；卷五 §2.1、§4.5、§4.13；卷六 §4.8、§4.18、§4.19；卷十八 §4.1 持有种类表；卷二十 §2.7、§4.5；卷二十六跨卷行。
代码抽查：§7 所列 31 处 file:line 逐行打开核对，**全部属实**（public-projects:39/119/130/167/347/348，building-maintenance:49/239/284，facility-state:30/35/36，education-state:238/279，medicine-state:29/39，law-codes:59，finance-assets:234/242/302/537，water-cycle:33，promotion:54/60/61，engine:423/424/829/831/834，agriculture:256）。问题出在**漏列**，见 B 组。

模板：§0–§8 齐全；16 个子系统六小节齐全；每节数据实例都有非西陲与非人类或超自然的例子；每节扫描式、不变量式、扩展性式三类断言齐全。模板项无真问题。

---

## 真问题（共 27 条）

### A 组：断言不能交机器判定，或有整类绕法（类别 7）

**A1. A19-4.3 三组对照"产物行各不相同"可被平凡满足，也可能误报失败**
- 位置：第 388 行。
- 类别：7。
- 证据："只换备料""只换主匠技能""只换意图"三组，只要求产物行不同。`builder` 字段（第 87 行）随主匠变化，换主匠时 `builder` 一定不同，断言恒真。反过来，品质档是骰出来的（第 367 行），同一骰值键下两种技能完全可能落在同一档，导致"各不相同"误报失败。
- 建议：每组指定必须变化的维度。换料组看 `material`、`wallThicknessM`、`envelopeUaWPerK`、`storeysMax`；换意图组看 `intendedType` 与 `type`；技能组改成分布断言，例如固定 N 个种子，技能高者 `qualityTier` 的均值严格更高，并且排除 `builder`、`builtDay`。

**A2. S19-4、A19-1.1 写的"任何以材料、物品命名的固定字段"无法机器判定，范围也越过了本卷**
- 位置：第 231、273 行；§7 第 3 行（第 879 行）。
- 类别：7，兼 4。
- 证据：
  - 扫描器拿不到"以材料命名的字段名"清单，把字段改名为 `timber`、`m1` 就能绕过。
  - 89 处 `.wood`、`.stone` 实际分布在 18 个文件里，大半不归本卷：forest-water.mjs（林木存量）、stock.mjs:212（聚落 wood/stone/iron 期初库存）、transport.mjs:170/172（造车船用木、铁）、agriculture.mjs:189/468–470（农具与粮仓修理用木、铁）、medicine.mjs:260、settlement-profile.mjs、quest-board.mjs:98/105、governance.mjs:139/177–186。其中 magic.mjs:112/153 的 `.stone` 是法术投石，属于误报。
  - §7 第 3 行把 89 处整体划给本卷改，等于替卷五、卷六、卷十七、卷二十五改代码。
- 建议：
  - 字段名清单由加载器从材料表、物品表代号去前缀后生成，写明生成方法。
  - S19-4 只管建造、修缮、备料路径。
  - §7 第 3 行按文件拆开，标明各自的归属卷；不归本卷的行写"交卷 X"。

**A3. S19-7"本卷的无量纲系数字面量为 0"无法判定**
- 位置：第 234 行。
- 类别：7。
- 证据：扫描器无法分辨某个数字字面量"是不是本卷的系数"。现有代码里就有这类常数，例如 facilities.mjs:53 的 `stone?8:20`、:87 的 `stone?4:25`。
- 建议：改成按模块界定的扫描，例如"facilities.mjs、construction.mjs、mechanism.mjs 中除 0、1、-1 外的数值字面量计数为 0"，或改用卷一 R-6 已有的扫描码。

**A4. A19-6.1"手写的分区布局散文为 0"无法判定**
- 位置：第 454 行。
- 类别：7。
- 证据："散文"不是机器可识别的对象。
- 建议：改成可数的东西，例如"`layout` 族以外不存在含 `zones` 或 `share` 字段的布局数据；world/design 下的布局脚本已删除或改为输出 `layout_` 条目"。

**A5. A19-4.2 的"登记为损耗的部分"没有定义，成了逃生口**
- 位置：第 387 行；对照 §4.4 规则 6（第 366 行）。
- 类别：7，兼 1。
- 证据：
  - 规则 6 定义 `envelopeMassKg` = 消耗总质量，全卷没有"损耗"的规则、维度或规则表键。
  - 断言允许"出账 = envelopeMassKg + 损耗"，于是任意差额都可以记成损耗。
- 建议：二选一。删掉损耗项，令出账等于 `envelopeMassKg`；或者在 `build.json` 登记损耗率键，写明损耗由什么量推出，并在断言里写死这一算式。

**A6. A19-12.2 访客上限的不变量与规则矛盾**
- 位置：第 651、670 行。
- 类别：7，兼 5。
- 证据：
  - §4.12 规则 3 只让 `stationFor` 与服务请求在满座时返回已满，进入本身不受限。卷五 `canEnter` 不读容量（卷五 §4.13 规则 4）。所以访客可以超员进入，"在内访客数不超过 `functions[headline]`"在规则上就不成立。
  - "访客"也没有机器定义：业主、雇工、住客、在押者怎样区分，没有写。
- 建议：
  - 要么把容量写进进入判定，由本卷给卷五提供一个可行性量，并写清超员时的去向；要么把不变量改成"同时被服务的人数 ≤ functions[headline]"。
  - "访客"按持有边定义：没有所有、雇佣、住宿或羁押边的在场者。

**A7. 设施分类可以借代理字段绕过 S19-1 与 S19-2，属于整类绕法**
- 位置：S19-1、S19-2（第 228–229 行）；A19-2.1（第 309 行）。
- 类别：7。
- 证据：现有代码已有不读 purpose、name 却照样分类的写法，三条扫描都抓不到：
  - promotion.mjs:54 按 `access.mode==='private'` 数住房；
  - facility-state.mjs:35 用 `base.lodging` 判 house，:44 用 `base.tags?.includes('stone')` 判材料；
  - education-state.mjs:238 用 `id.startsWith('bld_')` 圈定建筑；
  - public-projects.mjs:101 写死 `plan.facilityType==='house'`。

  另外，§3.1 规定 `facilityView` 的返回里含 `dims.intendedType`，模块可以对 `intendedType` 分支，重新造出"填出来的类型"。这违反主张 1，而 S19-2 只禁直读原始字段，没禁经视图读。
- 建议：
  - 加一条扫描："对地点或建筑集合做 filter、count 或分类时，谓词只许读 `facilityView().type`、`services`、`functions`、`stations`；读 `access`、`lodging`、`tags`、`rooms`、id 前缀来分类的计数为 0。"
  - 再加一条："§4.2 规则 2 之外读 `intendedType` 的计数为 0。"

**A8. A19-2.2 依赖一份"人工核对的类型"，但没说这份数据放在哪里**
- 位置：第 310 行；§7 第 17 行（第 893 行）。
- 类别：7。
- 证据：断言要求迁移后的 `type` 等于人工核对结果。这份结果的文件、格式、由谁写、是否进版本库，全都没写，机器无从比对。
- 建议：规定人工核对结果落成一份数据文件（例如 `world/migration/facility-types.json`），由卷十一迁移卡产出并提交；断言改为与该文件逐行比对。

**A9. S19-1"purpose 字段在数据表中的出现次数为 0"范围过宽**
- 位置：第 228 行。
- 类别：7。
- 证据：`purpose` 在数据里另有正当含义：world/actions/business.json 的动作槽、rules/tables/seed-keys.json、账户键第三段（ledger.mjs:20）、workstation-services.mjs:117 的付款用途。world/drafts 下还有 199 个文件、2803 处 `purpose`。按原文扫描，要么误报，要么被迫豁免一大片。
- 建议：限定为"place 表、facility_type 表、建筑与房间行中的 `purpose` 键计数为 0"，并写明 world/drafts 怎么处理（删除或排除）。

### B 组：现状描述与迁移清单不完整（类别 4、1）

**B1. facilities.mjs 的木石分支与旧类型写入全部漏列**
- 位置：§7（第 873–898 行）。
- 类别：4。
- 证据：
  - facilities.mjs:53 洪水伤害 `material==='stone'?8:20`；
  - :87 火灾伤害 `stone?4:25`；
  - :123 劣化率读 `rule.material[view.material]` 与 `stone?1:3`；
  - :138 按 `['wood','stone']` 记区域劣化；
  - :163 建成时写入 `purpose`、`facilityType` 和 `material:p.material??'wood'`。

  这些全是木石二元写死与旧类型写入，§7 一行都没有。
- 建议：补行，改法对应 §4.1 规则 6、§4.16 规则 2 与 3、§4.4 规则 3。

**B2. facility-state.mjs 的写死不止 :35、:36**
- 位置：§7 第 4、14 行。
- 类别：4。
- 证据：
  - :9–16 `FACILITY_TYPES` 每行写死 `wood`、`stone`、`capacity`、`purpose` 中文；
  - :21 `facilityRepairMaterials` 按 `material==='stone'` 分支；
  - :44 由 `tags` 判材料；
  - :170–172 校验"建筑材质须为木或石"。

  第 14 行只写了"退役"，没给行号，也没说这些写死怎样消失。
- 建议：逐行列出，并对应 S19-4。

**B3. 退役函数的调用方漏列**
- 位置：§3.4（第 222 行）；§7 第 14 行。
- 类别：4。
- 证据：
  - `prepareFacilityProject`：activities.mjs:275。activities.mjs:279–281 还直接扣减 `settlements.wood/stone`。
  - `granaryCapacity`：agriculture.mjs:217/218/303/343/397/462/510，settlement-trade.mjs:140。
  - `facilityRepairMaterials`：faith.mjs:242（寺观修缮写死 `item_wood`、`item_stone`）。
  - `assertLodgingCapacity`、`selectLodgingBed`：engine.mjs:674–675。
  - `facilityServices`、`capacity`：entity-view.mjs:570。

  卷十一拿到 §7 无法据此开卡。
- 建议：§7 逐个列出调用点，写明各改读哪个视图字段。

**B4. agriculture.mjs 里另有一套粮仓完好度，与 §4.1 规则 9 直接冲突**
- 位置：§7 第 16 行（第 892 行）只列了 :256。
- 类别：4，兼 2。
- 证据：
  - agriculture.mjs:60 `storageDays` 读 `r.granary.condition>=50`；
  - :113–118 完好度低于 50 时缩短存粮保质期；
  - :189、:468–470 用 `repairWood` 修粮仓。

  这正是规则 9 禁止的"建筑受损连带存粮"，而且粮仓完好度存在农事记录里，不在建筑行上，§4.1 的唯一写者被架空。
- 建议：补行，写明 `r.granary.{condition,capacity}` 删除，改读 `facilityView().storage` 与建筑 `condition`，保质由卷三 §4.12 按环境决定。

**B5. place 上的 `lodging`、`rooms`、`workstations`、`features` 等字段没有迁移行**
- 位置：§7 第 17 行。
- 类别：4。
- 证据：
  - world/geo/locations.json 中有 `rooms` 414 处、`lodging` 3 处、`workstations` 6 处，`features` 里有 altar、container、door、lamp 等物件。
  - `lodging` 的读者包括 action-affordances.mjs:116/136/203、credit.mjs:391、engine.mjs:668（夜价、周价）、finance-assets.mjs:238、building-maintenance.mjs:172、body-needs.mjs:14。
  - body-needs.mjs:14 把 `lodging.kind` 的中文值 `客房`、`空屋`、`通铺` 映射成种类，属于读自然语言（类别 3 的现存实例）。

  按本卷设计，房间应变成 `comp_zone` 子行，床位与物件应变成固定装置实例，但第 17 行只写了"生成固定装置实例"。
- 建议：
  - 补三行：`rooms` 迁为子行；`lodging` 迁为床位固定装置加卷六合同种类行；`features` 中属于固定装置的物件迁为 `comp_fixture` 物品。
  - 上列读者各自改读 `beds`、`restSite`。

**B6. 固定装置现有数据的描述错误，词表与配方引用也漏迁**
- 位置：§1.2（第 61 行）；§7 第 15、18 行（第 891、894 行）。
- 类别：4。
- 证据：
  - workstation-services.mjs:27–38 的 `fixtureStations` **不读 purpose**。它读 `place.fixtures` 与 `FACILITY_TYPES[facilityType].fixtures`，并按 `affords` 去重（:33），"每类 1 个"由这里而来。"工位靠 purpose 识别"不准确，读 purpose 的只是 facilityKind 的兜底。
  - mechanics/locations.json 实际有 **265 个地点、268 条固定装置**（hearth 255、forge 4、workbench 4、kiln 2、loom 2、pill_furnace 1），不是"11 行"。这个数抄自卷二 §5.7。每条还带 `fee` 与 `thermalRequirement`。
  - world/ontology/fixtures.json（6 条，带 `affords`）是现成的固定装置词表，§7 没列。
  - world/meta/recipes.json 等处约 520 条配方的 `workstation` 引用 `cooking`、`smithing` 等 affords 代号，另有 1 条直接引用工位实例 id `station_hw_kitchen`。§7 没有把这些迁到固定装置类代号。
  - 借用许可已有雏形：actions/core.json:67 的 `promise.grant_access` 带 `fixtures` 槽，workstation-services.mjs:117 核对付款。"借用许可没有结构"也不准确。
- 建议：
  - 改正 §1.2。
  - §7 补三行：fixtures.json 迁到 `fixture` 族；配方 `workstation` 改为固定装置类代号，并单独列出那条实例 id 引用；每装置的 `fee` 如何并入卷六 §4.10 与 `ownerFeeRate`。

**B7. 炉窑现状描述失实，magic-object.mjs 的热工模型迁移只写了一句**
- 位置：§1.2（第 62 行"炉窑热量卡未合入"）；§7 第 21 行（第 897 行）。
- 类别：4，兼 1。
- 证据：
  - magic-object.mjs 已有完整的热工模型：`validateThermalModel`（:43）逐物件写死 `heatCapacityJPerC`、`fuelJPerMg`（燃料热值写在炉子上，不读材料）、`burnMgPerMinute`、`efficiencyPermille`、`passiveExchangeJPerMinute`。
  - 窑炉另有 `wallOffsetsC`、`safeGradientC`、`safeRiseCPerMinute`、`crackPermillePerStress`（:52–53，热应力裂损）。
  - 还有 `prepareThermalWorkstation`（:272）、`prepareNpcFurnace`（:288）、`roomState`（:348）。

  §4.7 只用 `heatDamagePoint` 处理炉体受损，没有承接现有的升温速率与热应力裂损机制；也没交代这套逐物件常数怎样拆回材料维度与 `hearth` 条目。
- 建议：
  - §7 第 21 行展开为逐项对照：哪些并入 `hearth`，哪些由材料维度推出，哪些删除。
  - 热应力裂损要么在 §4.7 增加规则与维度，要么在 §8 写明有意删除并说明理由。

**B8. 按名称识别公共工程的代码漏列**
- 位置：§7。
- 类别：4，兼 3。
- 证据：
  - hidden-passives.mjs:38 `/引水|水道/.test(p.name)`；:99 `/堤|水道/.test(p.name)` 加 `(p.wood||p.stone)`。
  - public-projects.mjs:350 写死 `type:'建房'`。
  - governance.mjs:139 公共工程请愿的 `wood`、`stone` 参数。
- 建议：补行，改为读工程的 `intent.intendedType`，或读建成后的 `facilityView().functions`。

### C 组：跨卷接口对不上（类别 4、5）

**C1. 卷五要求设施类型行给出进入门槛档，本卷没有这个字段**
- 位置：§2.2（第 116–134 行）。
- 类别：1，兼 4。
- 证据：
  - 卷五 §4.13 规则 5 写"建筑与分区取设施类型行给出的档（卷十九）"，经类别行继承。卷五 `accessClass` 是 always/error。
  - 本卷 §2.2 没有 `accessDefault` 或同类字段。
  - 本卷的 `type` 是视图派生，不是存储引用，类别行继承链也接不上：存储维度 `accessClass` 不能从派生出来的 `type` 继承。
- 建议：
  - §2.2 增加 `accessDefault: enum access`。
  - 写明建筑行的 `accessClass` 由谁、在什么时机按 `intendedType`（存储）取缺省；或者与卷五商定改走 `intendedType` 继承。
  - 列入 §8。

**C2. 住宿合同种类行两卷互相推给对方**
- 位置：§4.8.1（第 498 行）、§4.8 规则 5（第 510 行）。
- 类别：4。
- 证据：
  - 本卷写"租约、租金、合同种类行归卷六 §4.18"。
  - 卷六 §4.18 规则 9 写"住宿是卷十九登记的合同种类行"。
  - 台账卷十九小节"住宿、租房、床位 | §4.8 | 卷六 §4.18 | 合同种类行"把定义判给本卷。

  结果是没有任何一卷登记住宿合同种类。
- 建议：按台账，本卷 §2 登记住宿合同种类行（条款字段、到期调 `releaseBed`）；卷六只做给付结算。

**C3. 公共工程出现两份运行态记录，需求块类型也不一致**
- 位置：§3.3（第 212–213 行）、§4.9 规则 5（第 545 行）。
- 类别：4。
- 证据：
  - 卷六 §4.19 有运行态 `projects.<工程>{sponsor, target, requirement: ref vocab requirement, budget, appropriated, spent, jobs}`，规则 5 写"完工时…由卷十九的写者落定"。
  - 本卷另设 `buildProject.<工程>` 与工程备料账户。两份记录怎样对应（id、谁开户、谁记工时）没有写。
  - 本卷的 `maintenance.need` 是内联需求块，卷六的字段是 `ref vocab requirement`，形状对不上。卷一 3A.7 允许命名与内联两种，但卷六的类型只收命名。
- 建议：
  - 写明公共工程只开一份 `buildProject`，卷六的 `projects` 只存拨款侧并引用其 id；或者反过来。
  - 两卷的需求块字段统一成卷一 3A.7 的联合类型。

**C4. 卷六要求本卷登记产率修正项，§5.3 没有**
- 位置：§5.3（第 857 行）。
- 类别：4。
- 证据：卷六 §4.8 规则 5 写"炉窑类型、完好度、所在地点的环境量对产率的作用，由卷十九在过程槽上登记修正项"。§5.3 只列了 wear、upkeep、breach、provides、ability、hearthLoss 和三个 build 键。
- 建议：增加产率目标键与来源规则，例如 `fixture.yield` 由固定装置品质、`condition` 与 `ops.level` 进入；如有意不做，写进 §8。

**C5. 导热率请卷三登记，卷三早已登记，名字还不同**
- 位置：§4.1 规则 4（第 254 行）、§8 Q3（第 908 行）。
- 类别：4。
- 证据：卷三 §2.1 第 133 行已登记 `thermalConductivity`（W_per_m_K）。本卷公式用 `conductivity`，Q3 还在请卷三登记 `conductivity`。
- 建议：公式改用 `thermalConductivity`，删掉 Q3 的前半句。

**C6. 持有种类请求没有对照卷十八现表**
- 位置：§2.3（第 140 行）、§8 Q4（第 909 行）。
- 类别：4。
- 证据：
  - 卷十八 §4.1 已有 `hk_lodges`（标的为 place）、`hk_permit`、`hk_operates`、`hk_enshrined_in`、`hk_guest_of`。
  - 本卷要的床位边标的是固定装置（物品），与 `hk_lodges` 的标的种类冲突。时段进入许可与 `hk_permit` 是否同一种，没有说明。Q4 仍按全部新增来提。
- 建议：Q4 逐条写明复用、改造还是新增；床位边与 `hk_lodges` 的关系要明确。

**C7. 卷二十把散热能力和隔声量登记为派生维度，本卷算式读的却是视图字段**
- 位置：第 96 行、§4.1 规则 2–5（第 252–255 行）。
- 类别：4。
- 证据：
  - 卷二十 §2.7 第 248–249 行把 `envelopeUaWPerK`、`soundLossDb` 登记为 `derived number`。按卷二 §1.12，派生维度只能是 RX 加封闭原语，而且"派生变量一律读基值"。
  - 本卷算式读视图字段 `envelopeAreaM2`（含 `sqrt` 与形制条目的几何字段），这些都不在原语与基值范围内。
  - 第 96 行又写本卷是"唯一写者或派生实现方"，两种身份并存。
- 建议：
  - 二选一并写死。一是改为视图字段，由 `facilityView` 计算，请卷二十改登记方式，记入 §8。二是改写成只读基值的 RX，并确认 RX 支持开方；不支持就把周长系数改成存储维度。

**C8. 本卷把 `armorMult` 解释为减免比例，与卷三定义域、卷十三归属冲突**
- 位置：§4.16 规则 2（第 793 行）。
- 类别：4，兼 5。
- 证据：
  - 公式用 `能量 × (1 − armorMult[类型])`。
  - 卷三第 130 行 `armorMult` 的取值域是 [0,4]，并注明"含义归卷十三 §4.2"。值大于 1 时，本式的扣减变为负数，等于修墙。
  - 本卷自定了这个系数的含义。
- 建议：改为调用卷十三给出的折算函数，或按卷十三的定义写式；至少在式中截断到 [0,1]，并在 §8 请卷十三确认含义。

### D 组：规则缺维度、常数不在规则表、自相矛盾、不确定（类别 1、2、5、6、9）

**D1. "当日利用率""当日进入人次""当日工位作业分钟"没有维度，也没有写者**
- 位置：§4.1 规则 6（第 256 行）、§4.11 规则 4（第 617 行）、§4.15 规则 1（第 756 行）。
- 类别：1。
- 证据：三个量直接进入劣化、脏污、耗材的算式，但没有定义算法，也没有存放位置。§3.3 的 `facilityState` 只有 `lastSettledDay`、`fireHeatMJ`。离屏折叠与"推进 N 天与逐日一致"（A19-1.3）都依赖它们。
- 建议：
  - 在 §2.1 或 §3.3 登记日计数状态，写明写者与清零时机。
  - 利用率给出定义，例如"当日占用边累计分钟 ÷（席位数 × 1440）"。
  - 写明离屏时这些量由什么推出。

**D2. 炉温与鼓风式里有三处"折算"没有定义**
- 位置：§4.7 规则 2、3（第 471–472 行）。
- 类别：2，兼 1。
- 证据："当值者的鼓风能力等级折算""燃速倍率的温度折算""燃料能烧到的上限 × 燃速倍率的温度折算"都没有规则表键。前一项是温度乘以一个未定义的量，量纲不明。`kiln.json` 只有 `flameCurve`、`draftCurve`、`igniteMinutes`。
- 建议：每个折算登记为 `kiln.json` 的曲线键，写清 x、y 的单位。

**D3. 评价与歇息的折算也不在规则表**
- 位置：§4.11 规则 2（第 612–613 行）、§4.8 规则 3（第 508 行）。
- 类别：2。
- 证据：
  - "减去 `dirt` 的折算"没有键。
  - 财富项"经品质修正"既没有键，也没有修正目标键（§5.3 未列）。
  - 歇息式里的"所在房间的 impression 折算"没有键，`lodging.json` 只有 `restCurve`。
- 建议：在 `rating.json`、`lodging.json` 补键，§5.3 补修正键。

**D4. 层数上限读的"抗压强度"没有指向维度，补上也会写死**
- 位置：§4.4 规则 4（第 363 行）。
- 类别：1，兼 2。
- 证据：卷三没有"抗压强度"字段，只有 `strength: map<stress, number>`。规则层要读其中某个键，就得在代码里点名 `stress_compress` 这类词表代号，违反 S19-3。
- 建议：在 `build.json` 增加键，例如 `storeyStress: ref vocab stress` 或一组按应力加权的权重；规则只读这个键。

**D5. 围护需求块"按单位厚度"与"墙厚由质量推出"互相矛盾，`bform.wallThicknessM` 成了第三个来源**
- 位置：§4.4 规则 1（第 360 行）、规则 6（第 366 行）；§2.4 `bform` 字段（第 149 行）。
- 类别：5。
- 证据：
  - 规则 1 说 `envelopeReq` 是"每平方米围护、单位厚度"的需求块，却只乘面积，不乘厚度。
  - 规则 6 又让 `wallThicknessM` = 质量 ÷（面积 × 密度），由实际用料反推。
  - `bform` 条目自己也有 `wallThicknessM` 字段。

  厚度到底是输入还是输出，三处说法不一。另外需求块的 `qty` 是物品数量，要从它得出质量，需要说明怎样换算（卷三 §4.17）。
- 建议：统一为一种。例如：形制给目标厚度；需求块按"面积 × 目标厚度 × 密度"折算成质量需求；规则 6 的反推只用来校验，或者删除。

**D6. 选形制只看文化、料、气候，没有技能；签名里的意图也没进公式（北极星）**
- 位置：§4.5 规则 2（第 404 行）、§3.2 `chooseForm` 签名（第 190 行）、A19-5.2（第 422 行）。
- 类别：9，兼 5。
- 证据：
  - 打分 = 文化偏好 × 备料可得度 × 气候适配度。当地匠人会不会这种形制（`skill`、`skillMin`）不在其中。可能选出一个无人能造的形制，随后 `buildPlan` 失败，NPC 在这里卡住。
  - 签名带 `intendedType`，打分式没用它。
  - A19-5.2 只验料的满足比例，不验技能可行。
- 建议：
  - 打分加入"当地可用匠人中达到 `skillMin` 者的比例或最高技能余量"；写明 `intendedType` 怎样参与，或从签名删去。
  - A19-5.2 增加"选出的形制存在可开工的主匠"。

**D7. 选形制用到的量没有定义，常数也不在规则表**
- 位置：§4.5 规则 2（第 404 行）。
- 类别：2，兼 1。
- 证据：
  - "当地最易得的料"的排序依据没有写。
  - "年均气温所需保温的满足程度"没有曲线键。
  - 三个因子的折算没有一个在 `build.json`。
- 建议：在 `build.json` 增加 `climateFitCurve` 等键；"最易得"写成"可取料范围内按可得量排序的首位，平局按代号字典序"。

**D8. 失火结算节奏有两种说法，结果会随推进方式变化**
- 位置：§4.16 规则 3（第 794 行）。
- 类别：6。
- 证据："每日（或火场存在的每个结算步）以 … 查 `fireCurve` 得起火概率"，骰值键含世界时刻。按日抽一次和按结算步抽多次，起火概率与骰值都不同，违反"一次推进与分段推进同一结果"。
- 建议：只定一种固定世界时刻网格，例如每世界分钟或每世界时，起火概率按网格步长折算；写进规则表；离屏折叠须与网格逐步一致。

**D9. 公众时段进入许可的持有者没有定义**
- 位置：§4.12 规则 2（第 650 行）；§3.3（第 216 行）。
- 类别：1，兼 4。
- 证据："本卷为公众写一条到时刻即失效的进入许可持有边"。持有边须有 `holder: EntityId`（卷二 `struct:holding`），"公众"不是实体。卷五 §4.13 规则 1 判进入时，查的是行为者本人、家户或组织的边。
- 建议：
  - 二选一：给每个站点指定一个"公众"组织实体作为持有者，并请卷五确认 `canEnter` 会查它；或者改为在开放时段内把实例的 `accessClass` 偏离到 `needsGrant` 为假的档。
  - 写进 §8。

**D10. `specificity` 标成 derived，但它不能用封闭原语表达**
- 位置：§2.2 第 123 行。
- 类别：1，兼 4。
- 证据：`specificity` = `functionNeeds` 的键数 + 已填围合与材料条件数。卷二 §1.12 的原语是对关系做 `count`，没有"数 map 键数"或"数非空字段"，所以写成 `derived` 加载不了。
- 建议：改为加载器在加载设施类型表时计算并缓存，由 `facilityTypeView` 返回，不标 `derived`；或请卷二加原语，记入 §8。

---

## 小项（只记账）

1. §8 Q1 列"六个类型行字段"，漏了卷二 §5.7 的 `public`。§4.9 已说明"公共"不是属性，应一并列出废除。
2. §2.4 `hearth.chamberL` 全卷没有用到；`mechanism.json.concealCurve` 和 `wear.json.serviceFloor` 在规则里也没有出现。
3. 卷三 §4.4 第 637 行与 §4.12 第 1051 行写"仓储类设施的容积与保存系数（设施类型行上的同名维度）"，本卷放在容器类固定装置上。Q2 只提了能力，应一并请卷三改措辞。
4. 卷三 §4.8 例 1 用 `workstation:fixture_forge`，本卷 `fixture` 族前缀是 `fx_`，两卷应统一。
5. 卷二十六第 1114 行写的是读 `placeView`，Q6 已覆盖，收尾时核对。
6. 写卷须知第二波补充说设施类型"收尾时改为派生维度声明"，本卷实现为视图字段 `facilityView().type`。实质一致，措辞收尾时统一。
7. Q1 请卷二"回填"字段，与写卷须知补充裁定第 1 条（不要求卷二回填条目，收尾统一汇总）口径不一。
8. §2.1 第 87 行一行写两个维度（`builder` / `builtDay`），类型、单位用斜杠并列，建议拆成两行。
9. §7 第 20 行 promotion-facilities.json 可以去掉"待核"：已核实其 `names` 字段正是 promotion.mjs:60 做显示名包含匹配的数据源。
10. 素材包与 §1.2 的"436 个建筑实例"和 locations.json 的 458 条地点不是同一口径（`purpose` 435 处已复核），建议注明 436 是怎样数出来的。
11. 读活动文字判睡眠的代码遍布全仓（agriculture.mjs:44、law.mjs:85/571、festival.mjs:87、magic-light.mjs:203、legacy-primitives.mjs:181 等），这些归卷二 §2.5 的 `awake` 谓词。本卷 S19-5 只管床位与歇息，建议在 §7 注明"其余交卷二与卷十一"，免得被误读为本卷全包。
