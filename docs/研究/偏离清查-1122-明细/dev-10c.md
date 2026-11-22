共 7 条，甲 0 乙 7 丙 0，有理由 3 无理由 4；
读了卷二十 :200–:323、:400–:459、:560–:629、:670–:719（比卡给范围多读 :290–:323 与 :623–:676 的 :654，为补全 §2.6 表与 dated 依据）；文件读全：server-plugin/kernel/calendar.mjs:1–:462、server-plugin/kernel/dated.mjs:1–:71；另按需读了 kernel/storage.mjs:316–:405、kernel/load/rules.mjs:130–:158/:280–:308、kernel/validate/dimensions-validate.mjs:68–:107、kernel/climate.mjs:78–:137/:300–:330、tests/kernel/calendar-climate.test.mjs:1–:230/:440–:484、world/rules/tables/{astro,calendar,season}.json、world/ontology/dimensions/_vocab.json 的 calendar 与 season 族、world/meta/rules.json:150–:190、world/rules/registry.json:196–:218、docs/研究/公共部件审查-甲-1122.md B2/B3、docs/审查/李白裁定-1117.md 相关行、docs/问题.md:414–:424/:623–:626。没读到：卷二十 :324–:399（除 :289–:306）、:460–:559、:623–:676 其余段、:720 以后；calendar-era.mjs 与 recurrence 求值器仓库内不存在，无可读；卷二 :797 未读原文（只据 docs/问题.md:625 转引）；卷七 §4.18 规则行未读（归卷七，不属本卡）。

### 1 weekDays 的 onUnknown=gap 未实现，缺值被当加载错误且旬序得 NaN
- 位置：server-plugin/kernel/calendar.mjs:141（另 :417）
- 设计原文：卷二十 :235，`weekDays` 取值域 [1, null]、onUnknown 为 `gap`（摘："| `weekDays` | integer | day | [1, null] | gap | 现"旬" | — |"）
- 代码实际：加载校验对缺失或非整数的 weekDays 一律 push E-DIM-DOMAIN-RANGE（:417）；calendarView 直接用 `(p.day - 1) / row.weekDays` 求 weekOfMonth（:141），缺值时不报 W-DIM-GAP、不返回未知，得 NaN。
- 理由：无。
- 影响：规则缺（卷文允许的 gap 被改成加载失败；纯函数入口没有未知交出路径）。
- 严重程度：乙
- 合并：无

### 2 intercalation 的 mode: days 被加载拒收，卷文 :241 实际已规定其含义
- 位置：server-plugin/kernel/calendar.mjs:386（另 :67、:426）
- 设计原文：卷二十 :241，摘："`intercal_mode` 取 `month`、`days`……`days` 是把 `days` 个闰日加进 `afterMonth` 那个月，不另成月。"（:234 同列 `mode: enum intercal_mode`）
- 代码实际：CHECK.intercalModes 只列 'month'；加载校验对 mode:'days' 报 E-DIM-DOMAIN-ENUM（:426），运行期 segmentsOfYear 也抛（:67），自述理由"leap meaning unspecified in vol 20"（:58、:67）与 :241 不符；函数注释 :395 又写 mode 属（month、days），与实现相反。
- 理由：world/rules/tables/calendar.json:3 登记 unbuilt `intercalModeDays`（李白 11-19 13:3x ④）；但登记理由只对"闰日在月内的排位与 leap 标记"成立，对"含义未写"不成立。
- 影响：规则缺（卷文允许的历法行无法加载）。
- 严重程度：乙
- 合并：无

### 3 季节三数值维度 growth/wetness/warmth 的加载校验缺失
- 位置：server-plugin/kernel/calendar.mjs:431–:450（checkCalendarClimateTables 的季节段）
- 设计原文：卷二十 :307–:309，摘："`growth` | fraction | [0, 1] | error""`wetness` ……""`warmth` ……"
- 代码实际：只核 scheme 引用、order 自 0 连续、phaseFrom/phaseTo 相接并铺满 [0,1]（:434–:450）；不核三键是否存在、是否为 [0,1] 内的数。缺键的行整行通过加载，读侧 seasonDimension 再按未知交出。
- 理由：无。
- 影响：规则缺（onUnknown=error 的数据错误漏过加载）。
- 严重程度：乙
- 合并：无
- 备注：三行在 :307–:309，紧随本卡给的 :294–:306；为补全 §2.6 表多读两行。

### 4 recurrenceNext 未实现，且自述的 unbuilt 登记不存在
- 位置：server-plugin/kernel/calendar.mjs:4–:5（注释）
- 设计原文：卷二十 :438，摘："周期日 | `recurrenceNext(engine, state, rule, ctx, fromMinute)` | 下一次起始分钟或未知"；:603 还规定排程去重键与 due_recurrence。
- 代码实际：server-plugin/kernel 下没有 recurrence 求值器（只有 calendar.mjs、dated.mjs、scheduler.mjs）；注释自述"未前移（登记在 rules.calendar.unbuilt…）：…recurrenceNext…"，但 world/rules/tables/calendar.json:3 的 unbuilt 列表无 recurrenceNext（也无 recurrence 相关项）；struct:recurrence 只登记在 world/ontology/named-structs.json，没有字段校验与求值器。
- 理由：无（仅注释自述）。
- 影响：规则缺／玩法不可达（周期日、市集日、节日无入口）。
- 严重程度：乙
- 合并：无

### 5 world/meta/rules.json 的旧全局历法块未退役，违反 :619 扫描断言
- 位置：world/meta/rules.json:162–:190
- 设计原文：卷二十 :600，摘："现"全世界 5/15/25"写在 `world/meta/rules.json`（与月名、纪元名、旬名、月长、年月数同在 L162–190），是把习俗写进了全局规则，退役。"；:619 "`rules.json` 与历法行中不再有市集日、月名、旬名字段"。
- 代码实际：该块原样仍在（months 月名、daysPerMonth 30、monthsPerYear 12、epoch 春历、tens 旬名、marketDays 5/15/25）；schemas/world.schema.json:1721–:1754 仍声明并把 daysPerMonth、monthsPerYear 等列为 required；world/design/w5-festivals.mjs:28、w1-village-profiles.mjs:137、weather-foundation.mjs:29 仍读写 world.rules.calendar.*。运行期 server-plugin 无读者（Grep 无命中）。
- 理由：无。
- 影响：规则缺（扫描断言不满足；习俗仍留在全局规则与生成脚本里）。
- 严重程度：乙
- 合并：无

### 6 dated 的 cause 只核代号形态，不核触发事件记录存在
- 位置：server-plugin/kernel/dated.mjs:38–:40（实际校验在 server-plugin/kernel/storage.mjs:344）
- 设计原文：卷二十 :654，摘："只追加、生效日必须晚于写入时的当前日、带来源事件（`cause`，卷二十四），所以有记录、后果可追溯。"
- 代码实际：fromDay 必须是整数且严格大于当前日、只追加两条都核（storage.mjs:343、:365）；cause 只核是否为代号形态（storage.mjs:344），不核该事件记录是否存在。
- 理由：docs/问题.md:625 已登记（"cause 不核事件记录存在……待事件日志读口可用时补"）。
- 影响：规则缺（卷文比实现严，后果可追溯性弱）。
- 严重程度：乙
- 合并：无（同一处已记 docs/问题.md:625）
- 备注：dated 的设计依据 :654 不在本卡所列段落，是全卷 Grep 定位后读的原句。

### 7 日历六入口与 perYearToPerStep 在生产代码无调用者（日期类玩法未接）
- 位置：server-plugin/kernel/calendar.mjs:117–:322（calendarDayIndex 至 rateBasisView）
- 设计原文：卷二十 :446，摘："**日历入口** = 上表"历法日序"到"计息基准"七项……全书凡是要把时间值换成年、月、日、季，或要用年长、月长的地方，只能调这七项"。
- 代码实际：入口齐备且测试覆盖；server-plugin 内 import calendar.mjs 的只有 life.mjs:9、person.mjs:15、kernel/climate.mjs:13（都只取 astroView）与 kernel/load/world.mjs:19（取加载校验器）。calendarDayIndex/calendarView/calendarMinuteOf/calendarSpan/calendarAdd/rateBasisView 与 astroView().perYearToPerStep 在生产代码无调用者；日期、年龄（calendarSpan 口径）、周年、市集日都尚未接到界面。
- 理由：docs/研究/公共部件审查-甲-1122.md B3 已判"生产无调用（仅测试）……不挡块 6"；李白 11-19 13:4x（裁定-1117:1256）定"试玩只需第几天，星期、月份、当地历法细节往后放"。
- 影响：玩法不可达（非错算；日期类玩法尚未接上）。
- 严重程度：乙
- 合并：见 docs/研究/公共部件审查-甲-1122.md 第三节 B3（B2 记 astroView 年龄换算另案）

---

## 已登记未建（卷文明写/裁定后按未知带缺口交出，不重复记为偏离）

- `eraView` 与 `eras.*` 写者 calendar-era.mjs：卷二十 :435、:457、:589；登记 world/rules/tables/calendar.json:3（`eraView`），李白 11-19 13:3x ④。
- 日出／日落起日（calendarDayIndex、calendarMinuteOf、calendarAdd、calendarSpan 的 dayStart 分支）：卷二十 :431、:585；登记 calendar.json:3（`dayStartSunrise`、`dayStartSunset`）。
- `calendarView` 返回的 weekDay、dayOfYear：卷二十 :432；登记 calendar.json:3（`weekDay`、`dayOfYear`）；卷文未写起点与取值域，李白 11-19 12:36 ④／1256 ④ 同意撤掉并登记。
- `lunarPhase` 与 synodicDays：卷二十 :436、:221；登记 world/rules/tables/astro.json:9（`synodicDays`），calendar.mjs:368–:371 返回 null 并报 W-DIM-GAP。
- axialTiltDeg、equinoxDaylightTol、polarLatitudeCapDeg、lunarEpochMinute（连同日照公式 daylightMinutes）：卷二十 :219–:226；登记 astro.json:9；kernel/climate.mjs:133–:135 按未知交出。
- tracksSolar 与 driftTolerance（§4.2.3 第 7 条的 W-CAL-DRIFT）：卷二十 :239、:411、:601；登记 calendar.json:3。
- relativeDepthMax（relative 锚点嵌套上限）：卷二十 :276；登记 calendar.json:3。
- 按文化解析历法的 place／contract 两源（现 calendarFrom 只收 cultureCalendar）：卷二十 :254、:588；登记 calendar.json:3（`cultureCalendarRead`）。
- addMonthEndClamp（加年、加月落不到原日期时的口径）：卷二十 §4.2.3 未给月末截断／缺该闰月的口径；登记 calendar.json:3；实现 calendar.mjs:231–:235、:285–:289 返回 null 并报缺口，不截断。
- season.schemeRules（按纬度与 precipSeasonality 派生方案）：卷二十 :691；登记 world/rules/tables/season.json:3。

## 拿不准

1. mode days 的闰日排位与 leap 标记：卷二十 :241 只说"加进 `afterMonth` 那个月、不另成月"，未写闰日排在月首还是月末、calendarView 的 `leap` 是否一律为假。代码据此整类拒收（第 2 条）。要不要补建、按哪端排，待判。
2. astroView 入参未校验整数：solarPhase、yearIndex、perYearToPerStep 对 minute／rate 直接转 BigInt（calendar.mjs:360、:374、:376），非整数时抛原生 RangeError／TypeError 而非 KernelError；卷二十 :436 未写入参域与错误码，是否并进"入参须安全整数"的统一口径待判。
3. §4.2.6 的"T-3 为 0"无法机判：tools/accept/criteria.json 只登了 vol20.T-4（:3049），无 vol20.T-3。本卡手工 Grep server-plugin 的 `365|360|/ 30|% 7|1440`，除 calendar.mjs 自身（按历法行数据与 minutesPerDay）外未见年月日季换算；world/ 里的 360 是数据（weather.anchorDays、cal_legacy_30 的 rateBasis），不是代码换算。检测器归属哪张门禁卡待判。

## 跨卷待判

- rules.astro.yearDays 的直接读者：卷二十 :217 说 yearDays"只由 `astroView` 读"；但 world/ontology/dimensions/_units.json:291、:296 的 siFromRule 由 server-plugin/kernel/validate/dimensions-validate.mjs:80–:81 在加载期直读 rules.astro.yearDays 派生 year／per_year 的 SI。理由：李白 11-19 15:5x ③（year 取回归年派生 si）与卷二 §1.4 勘误 1119k5（裁定-1117:1325、dimensions-validate.mjs:80 注释）。要判的是补卷二十 :217 勘误，还是改实现经 astroView。
- 年龄口径：卷二十 :434 写"年龄……只能用 calendarSpan/calendarAdd"，卷四 :214 用天文年分数；已由 李白裁定-1117:1730 Q-7 判（年龄走天文年、calendarSpan 只管当地日期与显示），修法在 docs/研究/公共部件审查-甲-1122.md B2 与修理文档 C1，不重记。
