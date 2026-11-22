共 11 条，甲 0 乙 3 丙 8，有理由 6 无理由 5；另列跨卷待判 2 条、拿不准 2 条、已登记未建见末。
本卡读了卷二十 :120–:319、:395–:434，另为核 anchorDays/历法/节奏读 :596–:647、:960–:984、:1019–:1051（grep 定位）、:1403；读了 world/rules/tables/{clock,astro,calendar,season,weather,climate,climate-proto}.json 全、world/ontology/calendar.json 全、world/ontology/dimensions/_vocab.json 的 calendar/season/weather/due_kind/reaction_priority 五族、world/rules/registry.json:165–365；代码只按需 grep/读 server-plugin/kernel/{weather,climate,calendar,scheduler,place,item}.mjs 的对应行。未读：§2.7 正文 :314–397、§3–§7 正文、_vocab 其余族、其他气候原型（现有只 cpr_taiyuan 一行）。
数值核（结论，无偏离）：yearDays 36524219/100000 = 365.24219 日，与 anchorDays 360 差 5.24219 日（astro.json basis 写 5.24，对）；_units day.si 86400 ÷ minute.si 60 = 1440 分/日，cadence {itemRot:1440, rebaseBubble:1440}、phaseOffset {0,0} 自洽；日历 19 年 = 19×354+7×29 = 6929 日、235 月、平均 364.68 日，与卷二十 :613 一致；climate-proto 季节曲线 12 个相位点 x = (b+0.5)/12，六种天气齐全；气候值与卷文域逐项核过（thermalLagPhase 1/12 ∈ [0,1/4)、elevationTempGradient −0.0065 ≤ 0、minutesPerMeterEast 0 ≥ 0、humidity/cloud ∈ [0,1]、windDirSpreadDeg ≤ 180、persistence ≥ 1、precipMm/windMps clamp ≥ 0、envTempDomain −89.2<56.7、tempExtremeC −23.3<39.4、season growth/wetness/warmth ∈ [0,1]）；季节四段 [0,1/4)[1/4,2/4)[2/4,3/4)[3/4,4/4] 首尾相接、order 0–3 连续，覆盖全年。§2.1/§2.2 列出的键与 §2.9 的 weather/climate/season/calendar 四表键除第 1 条的 paceSoakTol 外都在表里或有 unbuilt 登记；metadata：七张表的每个值行都带 source、basis、grade（climate-proto 行级三项齐备，缺 `file` 字段，卡文只要求前三项，不记）。
§2.9 的 water/fields/light/sound/agroclock/env 六张表本仓不存在，迁移体检测试表已记为未建（docs/迁移体检/格子G12-G16-规矩检查对照.md:7），本卡数据清单也不含它们，未计条。climate 与 climate-proto 的分工卷文有定义：:400 区分 rules.climate 与 rules.thermal，:405 明写 rules.climateProto 各行带 seasonCurve 与 tempExtremeC，不属"拿不准"。

### 1 `rules.clock.paceSoakTol` 在 clock.json 缺失，卷文要求必填
- 位置：world/rules/tables/clock.json:2–9
- 设计原文：卷二十 :138，`paceSoakTol` | fraction | [0, 1] | onUnknown error | §4.10.6 浸泡容差
- 数据实际：表里无此键，也没有进 unbuilt；scheduler.mjs:49 的 tableKeys 不含它，加载期不报缺。
- 理由：有。docs/问题.md:286「paceSoakTol 卷文无值，归块 7」；registry.json:180 同「随块 7 节奏卡（收尾待办）」。
- 影响：规则缺（浸泡容差无值、无校验；暂未出错）
- 严重程度：乙
- 合并：无

### 2 clock.json 的 `paceFactor` 是卷二十没有的键
- 位置：world/rules/tables/clock.json:8
- 设计原文：卷二十 :134–:138 的 §2.1 键表无 paceFactor；§4.10.3 :1030 写"`num/den` 是当前档的 `factor`"，当前档属 §2.10 `pace_level`
- 数据实际：表里 `paceFactor {num:1, den:1}`，scheduler.mjs:263 读它做入堆缩放，取代缺失的 pace_level.factor。
- 理由：有。docs/问题.md:288「卷二十 §2.1 表补 paceFactor 一行（{num:1,den:1}、待补、只缩放延迟类，K4-43、:969）」勘误批待补。
- 影响：只是形式（出处缺口；值 1/1 不改变读数）
- 严重程度：丙
- 合并：无

### 3 clock.json 的 `contestDefault` 不在 §2.1 键表
- 位置：world/rules/tables/clock.json:9
- 设计原文：卷二十 :134–:138 的 §2.1 键表无 contestDefault
- 数据实际：值 `"lottery"`，source 写"方案 §1.2 第 10 行 :53"，scheduler.mjs:725 读它作争夺缺省。
- 理由：有。docs/问题.md:287「卷二十 §2.1 补 clock.json 的 contestDefault 键」。
- 影响：只是形式（出处缺口）
- 严重程度：丙
- 合并：无

### 4 §2.10 的 `pace_level` 词表族整族不存在
- 位置：world/ontology/dimensions/_vocab.json:2–3146（无 pace_level）；world/ontology/dimensions/_unbuilt-derived.json:201–239（families 也未登）
- 设计原文：卷二十 :418–:420，词表族 `pace_level` 带字段 `factor`，族内恰有一行 factor 等于 1（E-PACE-NO-UNIT）
- 数据实际：全仓库 grep pace_level 0 条；scheduler.mjs:39 只有代码内封闭枚举 PACE_CLASS（equilibrium/latency），没有任何档位行。
- 理由：有。docs/迁移体检/块4.md:65（K4-48 五档系数与 pace.mjs 归属待裁、块 4 无 pace.*）、:14（_vocab 无 pace_level）；docs/问题.md:286、:288 同批归块 7。
- 影响：规则缺（换档无数据可选；暂未出错）
- 严重程度：乙
- 合并：无

### 5 §2.5 的 `phenomenon` 词表族不存在，也未登记未建族
- 位置：world/ontology/dimensions/_vocab.json:2–3146（无 phenomenon、无 phen_ 前缀）；world/ontology/dimensions/_unbuilt-derived.json:201–239（未登）
- 设计原文：卷二十 :279–:296，词表族 `phenomenon` 带 `whenRX`、`modifiers`，现象行不带效果调用
- 数据实际：全仓库 grep phenomenon / phen_ 0 条；weather.json:6 的 unbuilt 里 "phenomena" 只是功能名，不是族。
- 理由：无
- 影响：玩法不可达（地区现象无数据入口；现无引用，暂未出错）
- 严重程度：乙
- 合并：无

### 6 各规则表 source/basis 的"卷:行"整体过期
- 位置：world/rules/tables/astro.json:3–9、weather.json:3–6、climate.json:3–5、season.json:3、calendar.json:3、clock.json:3–4；world/ontology/dimensions/_vocab.json:607、:614
- 设计原文：卷二十 §2.2 字段表实为 :215–:226（yearDays :217、phaseEpochMinute :220、thermalLagPhase :224）；§2.9 键表实为 :404–:414（weather :404、climate :405、season :410、calendar :411）；§2.5 实为 :279–:296；§2.1 due_kind 条目实为 :151、:153
- 数据实际：astro 各行 source 写 :211/:214/:218/:217/:216/:215/:219–:220（:211、:214 是空行）；weather/climate/season/calendar 写 :395/:396/:401/:402（均非键所在行）；clock 写 :132–:133（表头）；due_kind basis 写 :145/:147。
- 理由：无
- 影响：只是形式（溯源断链；键与值本身存在）
- 严重程度：丙
- 合并：无

### 7 astro.json 的 basis 文字与算术过期
- 位置：world/rules/tables/astro.json:7（metersPerDegreeNorth）、:8（latitudeOriginDeg）
- 设计原文：卷二十 :222「由南北向的米数推纬度：地点取形心 `centroid` 的 y…；第十一版起不读 `coord`」
- 数据实际：:7 source 仍写"由 coord.y 推纬度"；:8 basis 写"37.783 − 5000 ÷ 111120 = 37.738004"（实为 37.737996）、"垄渠得 37.7829"（按该式手算 37.7830，差 0.0001）；代码 place.mjs:1333–1344 已按 centroid 读。
- 理由：无
- 影响：只是形式（读数不受影响）
- 严重程度：丙
- 合并：无

### 8 astro.json 的 yearDays basis 把默认历法年写成 12×30
- 位置：world/rules/tables/astro.json:3
- 设计原文：卷二十 :613，第一行历法平年 354 日、闰年 383 日；12×30 = 360 日是第二行
- 数据实际：basis 写"历法年（12 月 × 30 日）与天气锚段 anchorDays 360 不随它变"；_vocab.json:233–239 的 cal_default 是 30/29 相间。
- 理由：无
- 影响：只是形式（yearDays 值与"锚段无关"的判断本身成立）
- 严重程度：丙
- 合并：无

### 9 weather.json 的 unbuilt 混入两个非 rules.weather 键名
- 位置：world/rules/tables/weather.json:6
- 设计原文：卷二十 :404，weather 键只有 `anchorDays/weightScale/persistBase/meltCurve`；现象是 §2.5 的词表族 `phenomenon`，积雪是 §4.3.3 第 5 条
- 数据实际：unbuilt = ["meltCurve","phenomena","snowCover"]，后两项不是规则表键。
- 理由：有。basis 引李白 11-19 13:3x ①（docs/审查/李白裁定-1117.md:1233：第 5 条积雪、第 6 条现象往后排）。
- 影响：只是形式（清单命名；未建登记功能正常）
- 严重程度：丙
- 合并：无

### 10 calendar.json 的 unbuilt 混入非 rules.calendar 键的功能名
- 位置：world/rules/tables/calendar.json:3
- 设计原文：卷二十 :411，rules.calendar 键只有 `driftTolerance`、`relativeDepthMax`
- 数据实际：unbuilt 11 项里 8 项不是键名：addMonthEndClamp、cultureCalendarRead、dayOfYear、dayStartSunrise、dayStartSunset、eraView、intercalModeDays、weekDay。
- 理由：有。basis 引李白 11-19 13:3x ④（docs/审查/李白裁定-1117.md:1236：weekDay、dayOfYear、月末截断撤掉登缺口）。
- 影响：只是形式
- 严重程度：丙
- 合并：无

### 11 registry.json 的卷二十条目与卷文/代码不符
- 位置：world/rules/registry.json:215（astro）、:361（climateProto）
- 设计原文：卷二十 :222 纬度取形心 centroid；§2.9 :405 明写 `rules.climateProto` 各行
- 数据实际：:215 写"读者只有 kernel/calendar.mjs 的 astroView 与 kernel/climate.mjs"（漏 kernel/place.mjs:1328–1344），又写"thermalLagPhase…上界 1/4 未核"（calendar.mjs:452–459 已核，kernel-constants.json:15–16 已登）；:361 写"卷二十 :395 未列此表，6-29 改一轮自定"（:405 已列）。
- 理由：无
- 影响：只是形式（登记文字；加载不读这几句）
- 严重程度：丙
- 合并：无

## 跨卷待判

### A 同两部历法有两份定义：ontology/calendar.json 与 _vocab 的 calendar 族
- 位置：world/ontology/calendar.json:8–33 与 world/ontology/dimensions/_vocab.json:230–259
- 设计原文：卷二十 §2.3 :228–:239 规定词表族 calendar 的字段；卷二 §1.9 :295 登记 calendar→`calendar_` 族；卷二 §1.1 :59 仍写 ontology/calendar.json「保留职能」、§5.6 :1962 仍写 ref calendar（ontology/calendar.json）
- 数据实际：两处各存同两部历法（12 月 30/29 相间、19 年 7 闰；12 月各 30 日），加载器只读 _vocab（kernel/load/world.mjs:44 只载 dimensions/），ontology 旧文件无运行时读者。差异：① months 用 `id`（字符串）而非 `ordinal`（整数）；② `leap{cycle,years,afterMonth,days,obligationsSkip}` 而非 §2.3 的 `intercalation[]{cycleYears,years,mode,afterMonth,days,obligationAnchor}`（缺 mode，obligationsSkip:true 对应 obligationAnchor:false）；③ `rateBasis{month,year}` 而非 `{monthDays,yearDays}`；④ 缺 weekDays、dayStart、era（_vocab 有 10/midnight/continuous）；⑤ 标识 core:calendar_default / legacy:30-day 与 cal_default / cal_legacy_30。
- 理由：无（已记为待判：docs/研究/偏离清查-1122.md:130 该文件无运行时加载器、要逐卷判；docs/迁移体检/块4.md:14「旧 world/ontology/calendar.json 仍在」）
- 影响：数据错（若按卷二 :1962 去读旧文件，字段名与 §2.3 对不上；现无读者，暂未出错）
- 严重程度：乙
- 合并：见 docs/研究/偏离清查-1122.md:130（只记"无加载器"，未判存废）

### B 三个词表族前缀与卷二 §1.9 登记不符
- 位置：world/ontology/dimensions/_vocab.json:261（calendar→`cal_`）、:2510（season→`sea_`）、:2519（season_scheme→`ssch_`）
- 设计原文：卷二 §1.9 :295 登记 calendar→`calendar_`、season→`season_`、season_scheme→`sscheme_`（卷二十 :1403 同列 calendar_、sscheme_ 为卷二十所定）
- 数据实际：条目 cal_default/cal_legacy_30、sea_four_*、ssch_four 分别用 cal_、sea_、ssch_；加载器只核前缀彼此不重叠（dimensions-validate.mjs:239–247），不核卷二登记表。
- 理由：无
- 影响：只是形式（无报错；与登记表断链）
- 严重程度：丙
- 合并：无

## 拿不准

- 降水量、风速、风向的抽取与降水相态（卷二十 §4.3.3 :642）在 server-plugin 没有读者；weather.mjs:173 注释称"登记在 rules.weather.unbuilt"，但 weather.json:6 的 unbuilt 清单没有这几项。李白 11-19 13:3x ①（裁定-1117.md:1233）写前移"第 1–4 条…当日量含 cloud 与 tempOffsetC"，13:4x ②（:1254）又要求"机制照写、缺的值机读登未建"。块 6 是否必须写这几项抽取、还是允许先登未建，卷文推不出，交主会话判。
- drawSites：卷二十 §2.1 :137 写五个抽取点（天气状态、降水量、风速、风向、排放几率），§4.3.3 :638 写四个（状态、降水量、风速、风向）；clock.json:5 按五个登记。同一卷两处口径不一，数据按五个，判哪处为准要看卷二十勘误。

## 已登记未建（Grep server-plugin 零引用的键）

- astro：axialTiltDeg、synodicDays、lunarEpochMinute、equinoxDaylightTol、polarLatitudeCapDeg（astro.json:9；server-plugin 里只有 calendar.mjs:5、:350、climate.mjs:133 的注释提到，无读取）——登记见 astro.json:9、李白 11-19 12:4x 丙6/丙7。
- calendar 规则：driftTolerance、relativeDepthMax（calendar.json:3；server-plugin 0 命中）。
- climate：geothermalGradient、groundDampCurve、cloudDamp、diurnalPeakMinute、windChillCurve、radiantSunCurve、radiantFieldCurve（climate.json:5；server-plugin 0 命中）。
- weather：meltCurve（weather.json:6；0 命中）；phenomena、snowCover 是非键功能名，见第 9 条。
- season：schemeRules（season.json:3；只在 climate.mjs:101 注释出现，0 读取）。
- 另有 climate-proto 的 `tempExtremeC` 无读者，但卷二十 :405 明写"只作各地数据，不参与 T-13"，按设计无读者，不算缺口。
- clock 的 paceSoakTol 不属于本节：它连 unbuilt 都没登，见第 1 条。
