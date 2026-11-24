# 偏离清查 05a（卷四：个体、年龄成长、物种读入口）

共 7 条，甲 0 乙 6 丙 1，有理由 0 无理由 7；跨卷待判 2 条、拿不准 3 条、已登记未建 7 项。

本卡读了：卷四 :204-276、:298-324、:401-435、:627-677；为核 E-LIFE-STAGES 与 E-SPECIES-MATURITY 另读了 :374-375（超出卡给范围 2 行，条内已注明）。代码通读：server-plugin/person.mjs:1-194、life.mjs:1-163、species.mjs:1-56、opening-people.mjs:1-90、status.mjs:1-62；另 Grep 全仓（perceive、bubble、grid-diff、sim-tiers、position、kernel/validate/body-tables、error-codes）与数据（_unbuilt-derived.json、life.json、attr.json、body.json、person.json、species.json 的相应行）。未读：卷四其余章节、卷十六/十七/十八/二十/二十六原文；species.json、person.json 只按需读键。

### 1 personView 的 occupation、presentedKey 只交固定未知占位
- 位置：server-plugin/person.mjs:80-81
- 设计原文：卷四 :411「`personView(engine, state, personId)` … 另附的派生字段：`occupation`（§4.10 结构体）；`presentedKey`（当前示人的身份键号）；`body`（= bodyView 的引用，不复制）」
- 代码实际：两项都返回同一个 `{known:false, applicable:true, reason:'unbuilt'}` 常量，没有调用任何来源；person.mjs 只导出 personView、instantiatePerson、birthMinuteOfAge、speciesAttributeMeans、bandMidpoint
- 理由：无（person.mjs:3 仅注释自述"块 6 未建"；问题.md、裁定-1117 里两词 0 条）
- 影响：玩法不可达——职业结构与示人身份读不出
- 严重程度：乙
- 合并：无

### 2 阶段表只核了 E-LIFE-STAGES 的三分之一
- 位置：server-plugin/life.mjs:67-75（stageTable）
- 设计原文：卷四 :374「E-LIFE-STAGES：首行两个下界都是 0；各行的 `relMaturityMin`、`relAgeMin` 都不小于上一行（且至少一项更大）；条目 `adult` 为假的行 `relMaturityMin < 1` 且 `relAgeMin = 0`；`adult` 为真的行 `relMaturityMin = 1`，其中第一行 `relAgeMin = 0`」；:639「这些都是逐行的数值检查（E-LIFE-STAGES）」
- 代码实际：只核「非空、每行两个下界是 ≥0 的数、首行两个下界都是 0」，单调性、至少一项更大、adult 真/假行的边界全不核
- 理由：无（仅 docs/卡回报/ds-b6-who.md:7 自述测试覆盖"空表、首行下界非 0"两项）
- 影响：规则缺——乱序或 adult 行写错的阶段表能加载，lifeStage 取"最后一个满足"会取错行（现 life.json 数据恰好合规）
- 严重程度：乙
- 合并：无

### 3 E-SPECIES-MATURITY 全仓未实现
- 位置：server-plugin/life.mjs:67-75；server-plugin/kernel/validate/body-tables.mjs:205-206
- 设计原文：卷四 :639「再加上物种行的 E-SPECIES-MATURITY（成熟龄小于寿命下限乘以最小的老年下界），任何个体在 `relMaturity` 到 1 的那一刻 `relAge` 必小于老年下界，一定先进入第一个成年行，不会跳过」；错误码行 :375
- 代码实际：E-SPECIES-MATURITY 只在 server-plugin/kernel/error-codes.mjs:99 登记，全仓 0 处抛出；body-tables 只核 `maturityYears !== 0`，不比寿命 clamp 下限与阶段表里大于 0 的最小成年/老年下界
- 理由：无（问题.md、裁定-1117 里该码 0 条）
- 影响：规则缺——成熟龄与寿命下限不相容的物种行能加载，个体可一成年就落进老年行，§4.4.6 的"不跳过第一个成年行"断言失守
- 严重程度：乙
- 合并：无

### 4 建人时给定值不核卷四声明的取值域
- 位置：server-plugin/person.mjs:163-170
- 设计原文：卷四 :216「`lifespanYears` … 取值域：物种分布的 clamp」；:220「`adultMassKg` … 物种分布的 clamp」；:222「`attributes` … 取值域：`rules.attr.bounds`」
- 代码实际：spec 给了就原样进 props（:165、:166、:169）；writePersonRow→kernel/dim-value-check 只按表头类型与 domain 核（person.json:27 [0.01,100000]、:21 [0,null]），不核物种分布的 clamp、不读已建成的 rules.attr.bounds（world/rules/tables/attr.json:3，[0,99]）；采样路径反而由 sample.mjs:365 clampAndTrunc 按分布自带 clamp 钳住，两条来源取值域不一致
- 理由：无（问题.md:887 只记"采样寿命可能低于已有年龄"的待裁问题，不是给定值越界）
- 影响：规则缺——调用方可建出寿命/成年体重超出物种 clamp、属性超出 rules.attr.bounds 的个体，后续曲线与检定读到越界基值
- 严重程度：乙
- 合并：无

### 5 rewriteSpecies 入口未实现
- 位置：server-plugin/person.mjs:1-194（无该导出）
- 设计原文：卷四 :424「`rewriteSpecies(engine, state, subjectId, speciesId)` | person.mjs（person） | 已有个体偏离行的 `species` 一项（§4.10 P-8；C16-2 Q-5）」
- 代码实际：全仓 grep rewriteSpecies 只在 docs 命中，没有实现；individual `species` 建行后无任何改写路径
- 理由：无（卷十六转化原语未建是它的唯一调用方，但入口本身也没有未建登记；审查文只记"入口对象未定"）
- 影响：规则缺——物种改写无入口（现无调用方，暂未出错）
- 严重程度：乙
- 合并：无

### 6 takeRenewable 入口未实现
- 位置：server-plugin/life.mjs:1-163（无该导出）
- 设计原文：卷四 :427「`takeRenewable(engine, state, subjectId, renewableId, fraction)` | life.mjs（life） | `renewables.*`（采走一部分后重设积存锚点 `since` 与余数 `sinceRem`，§4.7 T-9）」
- 代码实际：life.mjs 只有 lifeFacts、lifeInputs、massOf；全仓 grep takeRenewable 0 处；§2.6 :338-339 两条 `renewables.*` 路径没有写者
- 理由：无（life.mjs:5 只自述 lifeTick 不建，未提 takeRenewable；问题.md:935 只记 renewable 族 0 条目）
- 影响：玩法不可达——活体产出（乳、毛、卵等）采不走
- 严重程度：乙
- 合并：无

### 7 个体 species、pos、facing 被别处直读 person 表，绕过 personView
- 位置：server-plugin/perceive.mjs:109（species）；server-plugin/bubble.mjs:79、grid-diff.mjs:91、sim-tiers.mjs:56（pos）；server-plugin/position.mjs:74、:84（pos、facing）
- 设计原文：卷四 :411「`personView(engine, state, personId)` … 个体的全部维度」；:403「§3.1 三个读函数」
- 代码实际：这些文件用 `dim(engine, state, kindOfEntity(state, id), id, 'species'|'pos'|'facing')` 直读 person 表；species 不经 personView；pos/facing 另有位置读口 `whereOf`（position.mjs:308），grid-diff、sim-tiers、bubble 未走它（position.mjs 自身是 pos/facing 的声明写者）
- 理由：无
- 影响：只是形式——读的是基值，与 personView 此刻结果相同；今后 personView 加视角裁剪或派生时会漏
- 严重程度：丙
- 合并：无

---

## 已登记未建

- lifeTick 与 L-3–L-6（背景死亡、受孕、分娩）：卷四 :426；rules.life.unbuilt（world/rules/tables/life.json:25）；偏离清查-1122.md:54-59 已记，不重复计。
- 人 personality、sensitivity、origin、pos、facing 建行不写：_unbuilt-derived.json:179-183（未建列）、问题.md:894。
- culture 出生事实不写（G-4 要求由 instantiatePerson 按出生地写一次）：卷四 :228、:984；问题.md:893；文化表登 _unbuilt-derived.json:190。
- 亲本遗传、技能初值 initialSkills/seedSkills、母语熟练度：卷四 :984 P-4；docs/卡回报/ds-b6-6.md:37；卷十四未建。
- speciesView 的 meanMassKg 与 meanDailyFoodNeed：_unbuilt-derived.json:17（species.meanMassKg）、world/rules/tables/body.json:4（unbuilt metabolism）；species.mjs:19-27、:52-54 按登记交未知。metabolism 建成后 meanDailyFoodNeed 仍只有"未建则未知"一条分支，须同时补计算。
- personView 其余未建派生维（attrMod、lookKey、nativeLanguage、fatKg、loadCapacityKg、moveSpeed、dailyFoodNeed/Water/Sleep、damageTaken、attackRef 一族、level 等）：_unbuilt-derived.json:53-99；personView 经 readDim 读到按未知带 E-MOD-RX。
- 阶段表 modifiers 四行全空：world/rules/tables/life.json:6-9 的 modifiers 均为 []，:14 的 basis 自述卷文 :656 只是示例、无出处，待李白。

## 拿不准

- **派生链用未截断的中间量**：卷四 :214-221 以 `ageYears`、`relMaturity`（维度值 precision 4）为公式输入，life.mjs:97-98、:105、:113、:123、:138 却用未截断的定点中间量求 relMaturity/relAge/lifeStage/massKg。边界上（如 relMaturity 恰在 0.0526 附近）按截断值判定与按中间量判定会差一行。卷文没写舍入发生在哪一步，不判。
- **物种值直读 dim 不经 speciesView**：person.mjs:153-178 与 life.mjs:101 直接 `dim(..., 'species', ...)` 读 sexes/lifespanYears/bodyMassKg/attributesBase/traitsBase/maturityYears，未走 §3.1 :409 的 speciesView。卷文只列"三个读函数"，没有像 :977 那样明写"唯一入口"，是否算绕过不判。
- **G-6 的适用范围**：opening-people.mjs:73-74 把名册的 ageYears 先换 birthMinute 再建行，因此不走 instantiatePerson 的 ageYears 成年校验；名册确有 6–17 岁未成年人（world/people/opening-roster-hw.json）。P-4 允许直接给出生时刻，G-6 写在角色创建一节，是否只约束角色创建不判；代码注释的理由"阶段表未建"已过期（life.json 已建）。

## 跨卷待判

- **`location` 维度不存在**：卷四 :272 把 `location` 列为 person 的 always 维度（ref place），person 表头没有它；卷二 §5.5 与问题.md:179 改为"所在地点不存，读 zoneAt(pos)"。两处口径冲突，须 05c 数据卡与裁定一并处理。
- **采样寿命可小于现有年龄**：instantiatePerson 无条件按物种分布采样 lifespanYears（person.mjs:165），名册里年长者会抽到小于自己年龄的寿命（问题.md:887）。卷四没有"在世者寿命 ≥ 年龄"的条件采样规则，待李白定；代码照卷文原样采样，不算本卡偏离。
