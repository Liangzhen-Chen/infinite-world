模型：claude-opus-5-5，中档（主会话 11-13 按运行记录补注）

# 卷二十 一审 B（侧重：机判与绕过、模板齐全、现状与迁移清单）

审查对象：`卷二十-时间日历天气与环境.md`（907 行，正文 825 行）。
已读：本卷全文；审卷须知；素材包；台账 X-14/X-17/X-33/X-38、卷二十小节、§五；卷二 §1.4、§2.1–§2.5、§2.7、§5.13、§5.22–§5.23；卷一 §8、§9；卷五 §4.3、§4.16；卷二十七 §0.2、§3.1、§4.1、§4.3、§4.5 相关行。
抽查代码（静态读）：scheduler.mjs、weather.mjs、obligation-calendar.mjs、hazard-calendar.mjs、world-clock.mjs、advance-layers.mjs、water-cycle.mjs、seasonal-hazards.mjs、world-events.mjs、effects.mjs、environment.mjs、derived.mjs、engine.mjs、character.mjs；world/meta/rules.json、world/ontology/calendar.json、balance/pace.json。

本卷引用的 file:line 核对结果：weather.mjs:27、:211，hazard-calendar.mjs:28、:88，advance-layers.mjs:5，water-cycle.mjs:13、:33、:185，seasonal-hazards.mjs:374，world-events.mjs:46 均属实。错的一处是"市集日在历法文件"，见第 29 条。

模板：§0–§8 与附录都在；11 个子系统各有六个小节；每个子系统都有非西陲例和非人类或超自然例；三类断言都有。模板没有缺节。问题集中在：断言能否交给机器判定、算式本身是否自洽、迁移清单是否完整。

---

## 真问题（31 条）

### 一、断言不能机判，或存在整类绕过（类 7）

**1. T-3 只扫"字面量"，读表值就能整类绕过** —— §3.4 T-3（L235）
- 证据：现有代码大量用 `rules.calendar.daysPerMonth × monthsPerYear` 当年长和月长。这些都是表值，不是字面量，所以 T-3 一处也扫不到。位置：building-maintenance.mjs:44、:196；business.mjs:367；facility-state.mjs:27；finance-assets.mjs:96、:181、:196、:210、:212；husbandry-traits.mjs:37。新代码也可以在任何规则表里放一个 `yearLen` 后自己做整除。
- 改法：判据改为按类型认定，不再按字面量。凡是对 day 或 minute 类型的量做整除、取余，或乘、除月长、年长类字段的表达式，只许出现在 `calendarView`、`rules.astro` 的实现里。`rules.calendar` 和 `calendar` 族字段要进读者表，在其他地方读即报 E-CAL-LOCAL。上面列出的调用点进 §7，作为基线。

**2. 环境规则表只有一半受保护；两条"按形态扫"没有机判口径；逐日累加可以绕过** —— T-4（L236）、§4.8.6（L572）、§4.11.6（L682）
- 证据：
  - T-4 只保护 `rules.weather / thermal / astro`。`rules.light / sound / water / fields / season / calendar / agroclock` 不受保护，别的卷可以直接读 `rules.light` 自己算照度。
  - §4.8.6 写"按函数名与算式形态扫"，§4.11.6 写"扫 envAt 在循环内被累加的形态"，两处都没有可执行的判据。
  - 最常见的绕过写法两条都抓不到：每天由一个钩子读 `placeView().dims['env.tempC']`，再累加进自己的状态字段（例如作物进度）。
- 改法：
  - T-4 覆盖 §2.9 的全部九张规则表，在 `state-owners.json` 里登记读者。
  - 把 `env.*` 的 Fact 标成"不可累加"类型，按卷一 §3.1 做类型感知扫描。在 `envAccum` 实现之外，对这类值做 `+=`、reduce、写入状态，都报错。

**3. T-2 后半句"自增计时字段后与阈值比较"没有判定口径** —— L234
- 证据：现有代码就是这种形态。environment.mjs:65–80 每天累加 `shelteredMinutes / clearMinutes`，再和 `rule.shelteredDryMinutes` 比较。T-2 的现有文字无法稳定命中这种写法。
- 改法：按类型判。单位为 minute 或 day 的状态字段，在调度器之外只能写成时刻（since 型），不能做增量写；增量写即报 E-DUE-UNDECLARED。上面的位置列入 §7。

**4. 价格禁令只是黑名单，可以经供需系数绕过** —— T-6（L238）、§4.9.3 第 4 条、§4.9.6 ②
- 证据：
  - 只有季节行用了白名单 `allowedTargets`。天气行、现象行、场的分档后果、灾异阶段，都只禁止"价格键"。
  - 现有冬荒的 `price_shift`，乘的正是"settlement-trade 的季节价格系数"（seasonal-hazards.mjs:19、:95–97），不是价格键本身，换个名字就能绕过 T-6。
  - §4.9.6 ② 只要求 target 是"登记的命名空间"，价格系数命名空间同样已经登记，所以等于没有约束。
- 改法：把 `allowedTargets` 提升为 `rules.env.allowedTargets`，同时约束季节、天气、现象、场分档和灾异阶段五类行。卷六的价格、供给、需求系数命名空间永不列入。

**5. 节奏分类全靠数据自报，误标无法机判** —— §4.10.3 第 3 条、§4.10.6
- 证据：`dueKinds` 的 latency 或 equilibrium 由人手填。把均衡类误标成延迟类，就绕过了"节奏不改概率"；现 pace.json 的 `pace.registry` 注释写的正是这个风险。§4.10.6 ① 是浸泡统计，带容差，不是确定判据。
- 改法：
  - 加载期派生约束：凡是作为 `event_type.cooldownDays`、年基率或钩子节拍来源的 due_kind，强制归为 equilibrium。
  - 加一条确定性不变量：换档前后，全部均衡类到期项的 `dueMinute` 多重集逐项相同。

**6. 两条不变量无法判定** —— §4.6.6 ④（L497）、§4.7.6 ③（L536）
- 证据：
  - ④"`fillRatio` 不超过 1 的部分才留在本水体"不通，读不出可以检查的命题。
  - ③ 先说"蔓延出合计等于蔓延入合计"，又说"差额计入衰减"，自相矛盾，而且差额没有落到任何记录里。
- 改法：
  - ④ 改为"期末余额 ≤ capacityL；溢出量 = 转给下游的量 + 转入漫溢汇的量"。
  - ③ 改为"蔓延出 = Σ蔓延入 + 开放度损失"，开放度损失作为该步的一个派生量单独记下。

### 二、自相矛盾（类 5）

**7. `calendarView` 自称纯函数，但签名缺状态和地点** —— §3.1（L203）、§4.2.3 第 1 条和第 3 条
- 证据：
  - 返回值含 `eraYear`，它要读 `eras.*` 状态和法域。
  - `dayStart` 取日出或日落时，要读地点的 `env.daylightMinutes`。
  - 签名却只有 `(engine, calendarId, minute)`。
- 改法：拆成两个入口。纯投影部分（年、月、日、闰）保持纯函数；`eraYear` 和非午夜起日的部分，另设一个带 `state, placeId` 参数的入口，或者明确由调用方传入。

**8. §4.2.6 不变量 ③ 与同节的扩展性断言冲突** —— L342 对 L343
- 证据：③ 要求"更换文化的历法，不改变任何事件的分钟"；扩展性断言却要求换历法后"节日日期、市集日全部随之变化"。周期日事件 `verb_recurrence_started` 的分钟一定会变。
- 改法：③ 限定为"与历法无关的事件"，并以事件类型列表划定范围；周期日事件明确排除在外。

**9. 天气"纯函数"不成立：weightRX 有循环依赖，还会读运行态的场** —— §2.5 `weightRX`（L132）、§4.3.3 第 3 条、§4.3.5 超自然例（L379）、§4.3.6 ③
- 证据：
  - 变量域写的是"天气单元的 env 基值"，其中包括 `env.weather`，也包括含天气 `tempOffsetC` 的 `env.tempC`，形成循环。
  - `wx_miasma_fog` 读"污秽场基值"。场是 `env-fields.mjs` 写入的运行态，玩家的动作能产生排放，这就违反了 ③"插入玩家动作不改变天气"。
- 改法：
  - weightRX 的变量域收窄为单元的静态维度加 `solarPhase`，加载期做依赖检查，有环即报错。
  - 超自然天气改读单元的静态维度（例如单元行上的"污秽基值"维度），不读 `fields.*`。

**10. 积雪折叠的起点与锚段定义冲突** —— §4.3.3 第 2 条对第 5 条
- 证据：锚段按日序每 `anchorDays` 切一段；积雪却要求"锚段起点取单元最暖的太阳相位"。除非 `anchorDays` 等于年长，并且对齐到最暖日，两者不能同时成立。而 `yearDays` 是有理数，最暖日并不落在整数日上。
- 改法：积雪单独设"融雪年段"（起点为最暖相位所在的日），与天气锚段分开命名。同时补上融化曲线的键（见第 20 条）。

**11. 室温"纯函数"的断言与规则自身矛盾** —— §4.5.6 ④（L457）对 §4.5.3 第 2 条、§4.5.1
- 证据：室内热源包括场的 `heatWPerScore`（运行态）、设施的产热（运行态），以及物种的代谢产热（取决于在场的人和物），并不只是"种子、分钟、表、修正项"。
- 改法：④ 改为"室外 `env.tempC` 是（种子、分钟、表、修正项）的纯函数；室内温度 = 室外温度 + 热源合计 ÷ UA，其中热源合计由声明过的状态派生"。

**12. `envAccum` 签名缺参数；冻结度日不在封闭清单里** —— §4.11.2 对 §4.11.3 第 1 条；§4.6.3 第 4 条、§4.9.5 凌汛例
- 证据：
  - 积温和霜日数需要"调用方给的基准温度或阈值"，签名里没有这个参数。
  - 冻结要用"低于熔点的累计度日"，但 `accumKinds` 封闭为四种，不含此项，也没有说明由谁持有这个累计量。
- 改法：签名加 `params`（基准值或阈值）；`accumKinds` 增加"负积温（低于给定阈值）"；冻结目标份额改为调用 `envAccum`。

**13. 同刻全序对到期项和反应项没有定义完整；上限语义改了却没列迁移** —— §4.1.3 第 4 条和第 7 条（L261、L269）
- 证据：
  - 六元键里的 `phase / sortKey` 来自 `state-owners.json`。按卷二 §2.7，只有推进钩子带 phase；到期项和反应项都没有 phase，`due_kind` 也没有排序位次。
  - 现有到期项按 `dueClass` 位次排序（scheduler.mjs:46）。反应项按起因 seq 广度优先，再按 `(priorityClass, packId, ruleId)` 排序（scheduler.mjs:213–241）。反应项是运行中因果生成的，静态六元键表达不了。
  - 现有代码在超限时截断并继续，core/legal 两类还豁免深度限制（scheduler.mjs:217–231）。本卷改成"中止并报错"，§7 没有列出这项语义变更。
- 改法：在 `rules.clock.dueKinds` 里加整数 `rank`；反应段写明"起因 seq 广度优先，在此之上再用静态键"；`priorityClass` 改为登记的代号；§7 加一行"超限语义由截断改为报错"。

### 三、缺维度（类 1）

**14. 风向没有维度** —— §4.7.3 第 3 条"按风向偏置"；§2.8 `advectedByWind`
- 证据：§2.7 只有 `env.windMps`。现有代码已有 `airModel.windVector`（magic-air.mjs:149）。
- 改法：天气行增加风向分布，`env.windDirDeg` 设为派生值，偏置系数入表。

**15. 湿度整个缺失** —— §2.7
- 证据：现有 `humidityAt`（weather.mjs:151–157），以及 `microclimate.humidityPercent`、`state.weather[loc].humidityPercent`、天气行的 humidity 都在用；卷三的腐坏、干燥会读湿度。本卷 `env.*` 里没有湿度，§7 也没写去向。
- 改法：加入 `env.humidity`（fraction），由天气行和单元派生；或者写明归哪一卷，并在 §7 列出处置。

**16. "淋湿程度"没有维度，也没有写者** —— §4.5.3 第 4 条
- 证据：`feltTempC` 要读淋湿程度。现有的 `weather_exposure` 记录（environment.mjs:60–85）是一个状态，有累计计时字段，但没有出现在 §3.2 的写者表里，也没有进 §7。
- 改法：指明归属。如果是状态容器，归卷二十一，以 `since` 型实例记录；本卷只提供降水暴露量。§7 加一行。

**17. 气候派生量缺维度** —— §4.3.3 第 3 条、§4.4.3 第 3 条、§4.6.3、§4.9.1
- 证据：weightRX 和 `schemeRules` 都读"降水季节份额"或"降水季节性"，但 `comp_weather_cell` 的 requires 里只有 `annualPrecipMm`。"洪量"出现在 §4.9.1，但不在 §2.7 的派生列表里。
- 改法：单元增加 `precipSeasonality`（或按相位给出的降水份额曲线）；水体增加派生维度 `floodL`（当日转入漫溢汇的量）。

**18. 周期日锚点的参数没有类型定义** —— §2.4（L122–126）、§4.2.3 第 4 条
- 证据：
  - `periodDays / offsets / 轮起点 / leapPolicy / 第 n 次 / 分数 / 季节点(起中止)` 等参数，全文没有字段表。`anchor` 一栏写"见 §4.2.3"，但 §4.2.3 只是文字描述。
  - `ref vocab parameter` 这个族没有定义。
  - `appliesRX` 的变量域含 `faith.*`，可 `ctx = {placeId, cultureId}` 里没有信仰。
  - `calendarFrom = place` 的含义没有定义。
- 改法：在 §2.4 给出 `recur_anchor` 八个分支各自的字段表；`ctx` 加入 `faithId`，或删去 `faith.*`；定义 `place` 来源。

**19. 闰月的义务处置字段丢了** —— §2.3 `intercalation`（L111）
- 证据：calendar.json 的 `leap.obligationsSkip` 正被 obligation-calendar.mjs:62 用来决定"闰月不作计息锚点"。本卷的 struct 里没有这个字段，§4.2.3 第 2 条却说"现分离保留"。
- 改法：`intercalation` 增加 `obligationAnchor: enum`（或 `obligationsSkip: boolean`）。

### 四、常数不在规则表（类 2）

**20. 有若干常数没有给规则表键** —— §2.9（L188）
- 证据：
  - §4.8.3 第 5 条的能见"基准"距离；
  - §4.8.3 第 1 条云量对照度的遮挡系数；
  - §4.7.3 第 3 条风向偏置系数；
  - §4.3.3 第 5 条融雪曲线；
  - §4.4.6 ③ 分点日照容差；
  - §4.10.6 ① 浸泡容差。
- 改法：在 §2.9 逐一补键，例如 `light.baseSightM`、`light.cloudOcclusionCurve`、`fields.windBias`、`weather.meltCurve`、`astro.equinoxDaylightTol`、`clock.paceSoakTol`。

### 五、接口对不上（类 4）

**21. 与卷五 §4.16 的字段名和室内模型不一致**
- 证据：
  - 卷五 L796 定的是 `placeView().env = {weather, tempC, light, sound, scent, waterLevel, statuses}`。本卷用的是 `dims['env.*']`，名字是 `env.lux / env.soundDb`；没有 `scent`（气味是 `env.fieldIntensity`）；水位叫 `fillRatio`，不叫 `waterLevel`。
  - 卷五 §4.16.3 第 2 条说室内折算"由卷二十按 `skyExposure` 算"，本卷全文不读 `skyExposure`，用的是 `comp_enclosure.aperture`。
- 改法：两卷统一字段名和形状（建议以本卷的 `env.*` 为准，回填卷五），并写明 `skyExposure` 与 `aperture` 的关系（一个派生自另一个，或两者都读）。

**22. 递减率和年均温在两卷重复定义** —— 本卷 §2.7、§2.9 `thermal.lapseCPerM`、§4.5.3 第 1 条，对卷五 §4.3（L292、L311）
- 证据：卷五已经让地点派生 `annualMeanTempC`、`annualPrecipMm`，并持有 `climate.json.lapseRate`。本卷又在 `comp_weather_cell` 里要求这些字段，并另设 `lapseCPerM`。
- 改法：海拔修正只留一处。建议由卷五给出地点的年均温（已含海拔修正），本卷的季节和昼夜摆动在它之上叠加；删去 `thermal.lapseCPerM`，或者让卷五改读本卷的键。

**23. 与卷二十七的推进计划和节奏接口不一致**
- 证据：
  - 卷二十七 L167、L222、L577 写的是：它提供 `advancePlan(...)` 给"卷二十 §4.1 调度器排入全序"。本卷 §4.1.4 写的是调度器自己读矩阵、放大节拍，全文没有出现 `advancePlan`。
  - 卷二十七 L321 写"卷二十 §4.10 节奏参数决定一次动作推进多少分钟（costPlan 输入）"，与本卷 §4.10.3 第 5 条"节奏不改节拍"冲突。
- 改法：本卷 §4.1.4 改为"调度器消费 `advancePlan`"；与卷二十七一起确定节奏是否影响动作推进的时长，二选一，并回填对方卷。

**24. 灾异的抽签与卷二十四的加权抽取重叠** —— §4.9.3 第 2 条
- 证据：台账 §五说卷二十四负责"加权抽取"，卷二 §5.22 也说 `weightRX` 是权重。本卷却把 `weightRX` 当概率，自己用固定位次抽签，然后又说卷二十四 §4.3 可以"压制或放行"。这样一次灾异经过两次随机，抽签权也归属不清。
- 改法：本卷只负责按节拍检查 `triggerRX`，并给出候选；抽签由卷二十四 §4.3 用统一的键完成。或者反过来，由卷二十四写明灾异族不进加权池。二者择一。

**25. `localSightClear` 留在本卷，违反 X-14** —— §4.8.3 第 5 条（L555）
- 证据：`localSightClear`（environment.mjs:227）返回"能否看清"的布尔值，是感知判定，按 X-14 归卷五 §4.2。本卷只写了"改读 env.sightM"，等于默许判定继续留在环境模块里。
- 改法：§7 写明 `localSightClear` 迁往卷五 §4.2，由它调用 `propagate` 和 `env.sightM`。

### 六、读自然语言（类 3）

**26. 调度器按中文类名排序，本卷没有列出** —— §1.2 16.1 行、§7
- 证据：
  - scheduler.mjs:46 的 `dueSortKey`，用中文数组 `['协议续步与承接实体阶段','义务','案件阶段',…]` 的 indexOf 决定同刻顺序。
  - :36 的 `LAYER_RANK` 接受中文键"智能 / 规则 / 统计"。
  - :158、:202 在内核里写了中文 reason"刚被人抢先了"。
  §1.2 只说"十进制常数 10 个"。
- 改法：§1.2 和 §7 各加一行；排序改用第 13 条的 `due_kind.rank`。

### 七、现状与迁移清单不全（类 2，§7 缺项）

**27. 360 日年、90 日季的算术遍布全仓库，§7 只列了一处** —— §7 L766、L773
- 证据：
  - 以 360 作年长的算术出现在 32 个文件里，包括 weather.mjs:20、:63–65、:95（倾角 23.44 和 /360 写在代码里）、:128–132；hazard-calendar.mjs:13、:24、:28、:46；world-clock.mjs:21、:52、:62；seasonal-hazards.mjs:34、:174（季节限定为 0..3）、:303；effects.mjs:203、:207，以及 agriculture、festival、faith、wildlife 等模块。
  - weather.mjs:95 的倾角和年长，应改由本卷 `rules.astro` 提供，§7 没有写。
- 改法：§7 加一行"全仓 360/90 年季算术，以 T-3 基线计数（32 文件）"，逐文件列出清单交给卷十一。

**28. 写死的天气状态 id 和旧天气结构没有迁移项** —— §7
- 证据：
  - weather.mjs:59 写死 `kinds=['clear','cloudy','rain','storm','snow','fog']`，:213 校验"必须保持已实现六类"，:147 `precipitationAt` 点名 `rain / storm / snow`。
  - environment.mjs:71、:77 点名 `rain / storm / clear`；`forestWater.water.rainShare[kind]` 以天气 id 为键。
  - `rules.weather.regions`（22 个地区，每个带地点名单、室内名单、按季节序号的温度、纬度）要迁成 `comp_weather_cell`，§7 没写。
  - 天气行上的 `walk / horse / cart / boat / hit / mood / crop`（weather.mjs:137–140），以及路线的 `closedSeasons`（weather.mjs:190、seasonal-hazards.mjs:306），都没有写去向。
  - 现有状态 `state.weather`（engine.mjs:301 初始化，weather.mjs:151、subjective-view.mjs:97 读取）与"天气无状态"矛盾，没有写退役。
- 改法：§7 逐项补行。点名天气 id 的地方改读天气行的维度（降水相态、`precipMm` 等）。

**29. 历法现状写错了文件；还有一个全档案共用的"当前历法"没有处理** —— §1.2 16.2 行（L67）、§7 L767
- 证据：
  - calendar.json 里没有市集日和旬名。月名"雨月…"、纪元名"春历"、旬名、`marketDays [5,15,25]`、`daysPerMonth`、`monthsPerYear` 都在 world/meta/rules.json 的 L162–190。
  - character.mjs:29 在建角色时写入全档案共用的 `calendar:active = core:calendar_default`，engine.mjs:624、:1306，entity-view.mjs:206，perception.mjs:66 都读它。这与"按文化取历法"直接冲突。
  - obligation-calendar.mjs:9–12 按历法 id 分支，:92、:94 回退到 30/360；weather.mjs:42–44 写死历法 id 白名单，并限定月 ≤ 12、日 ≤ 30。
  - `engine.calendar(minute)`（engine.mjs:305）、`minuteForCalendarDate`、`localWeather` 不在 §3.3 的退役入口里。
- 改法：改正 §1.2 和 §7 的文件位置；§7 加上 `calendar:active` 的退役，以及上述 id 分支和入口。

**30. 灾害时钟和世界时钟的行按具体地点、文化、派系写死** —— §7、§4.9
- 证据：
  - `rules.worldClock` 的行要求 `settlement / culture / faction` 指向具体 id（world-clock.mjs:34）。
  - `rules.hazardClock` 的行绑定 `settlement` 和季节序号（seasonal-hazards.mjs:174）。
  - `effectTable.seasons` 按具体聚落登记（effects.mjs:203）。
  - 这三处都是"为具体地区写规则"。§7 没写这些行要改为由 `triggerRX` 选主体地点的 event_type 行。
  - hazard-calendar.mjs:20 的 `hazardRoll` 也是自拼键，§7 只列了 world-clock。
  - world-clock.mjs:19–29 是封闭的条件 switch；:52 `worldClockScene` 在规则层拼中文。
  - 设计期生成脚本 world/design/seasonal-hazards.mjs、m5-clock-rules.mjs 也没有处置。
  - `hazardPriceFactor` 同时承载战争的 `war_disruption` 价格乘数（hazard-calendar.mjs:89–90），删掉这个入口后，战争价格效果没有接收方。
- 改法：§7 逐项补行，写明行数据由按地点绑定改为 RX 条件，并指定战争价格效果的接收卷（卷六）。

**31. 调度器的双路径、配置事件和第二条节奏通路没有迁移项** —— §7（类 2，兼类 6）
- 证据：
  - scheduler.mjs:262–266 按 `process.env.SCHEDULER_WIRE_ADVANCE` 和 `state.scheduler.wireAdvance` 在新旧两条路径之间切换。行为取决于进程环境，违反 R-8 和 R-9（不准双写）。
  - :246–258 允许输入事件 `config_set` 把 `depthLimit` 写进存档，与"上限在 `rules.clock`"冲突。
  - derived.mjs:247–271 对 `slot.paceable` 的派生槽直接乘节奏系数，这是 `schedule` 之外的第二条节奏通路，与 §4.10"只在入堆时缩放"冲突。
- 改法：§7 加三行：删除环境变量和存档开关；`config_set` 退役；派生槽的节奏缩放并入 `schedule`，或明确禁止。

---

## 小项（只记账）

- §8 问题 3 已过时：卷二 §5.22（L1325）和 §5.23（L1335）已经写明"天气不是事件类型"，与台账 X-33 一致，这个开放问题可以删去。
- 卷五 §4.10 的标题是"地形修正"，本卷 §0.2 和 §4.3.4 称它为"路况"。
- §1.2 第 67 行引 weather.mjs:27（缺省参数）；拼中文前缀、按月份整除求季节的实际位置在 :20–23。
- `comp_weather_cell` 的 requires 里列了 `seasonScheme`，§4.4.3 第 3 条又说它由 `schemeRules` 派生、可以显式指定，必填与派生两种说法冲突。
- §4.11.3 说"闭区间内各日"，不变量 ① 用的却是 `[a,c]` 加 `(c,b]`，而参数是分钟。日边界怎么切应写明。
- §4.7.3 `quenchPerMm × 当步降水`：降水按日计，步长按分钟，折算办法没写。
- §4.7.3 第 2 条：同一排放者在同一步有多个带 `chance` 的 `emits` 时，对象、时刻、位次都相同，抽签结果会完全相关。键的对象部分应加上场代号。
- §4.4.6 ③：在纬度 ±90 度，分点日照公式没有定义，需要排除极点或另作规定。
- §1.2 漏列 perception.mjs、forest-water.mjs（水侧读的是 `rules.forestWater.water`，不是 `rules.water`）、water-volume.mjs。
- water-cycle.mjs:12 的 `turbidity / pathogenRisk` 不是材料余额，§4.6.3 第 5 条"污染物是材料余额"没有覆盖到，应写明去向。
- T-5 中"调用次数"无法静态判定，建议改为"骰值键的序号来源只能是 `drawSlots` 常量"。
- `rules.clock.cadence` 与 `state-owners.json` 的 phase/sortKey 分两处登记钩子，§4.1.6 扩展性断言里的"声明表"指哪一处不清楚。
