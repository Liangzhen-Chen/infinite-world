模型：claude-opus-5-5，中档

# 卷十四 一审 B（侧重：断言能否机判与绕过路径、模板齐全、现状与迁移清单完整）

审查对象：卷十四-职业技能与学艺.md（1338 行，整卷读完）。另读：审卷须知；全书概念台账 卷十四小节与 §五、X-03、X-28、S-04、S-18；素材包 卷十四；卷一 §0.4、§3A；卷二 §1.5、§1.9、§1.13、§2.5、§2.9 第 4 条（rxTree）、§3.2、§3.5、§5.5、§5.14、§5.15。
代码抽查（静态读）：hidden-passives.mjs 全文；entity-view.mjs:110–170；local-exams.mjs:40–83；career-metrics.mjs:60–96、:123–126、:186–203；pets.mjs:20–30；works.mjs:30、:201、:258–279；education-state.mjs:238/261/279/325；learning.mjs:57/92/128；education.mjs:30/117/123；primitives-effects.mjs:294；training.mjs:15；medicine-state.mjs:9；另对 server-plugin/*.mjs 全量 grep 了 `profession_`、`skill_` 字面量与 `contextReason`、hidden-passives 各导出函数、`personCertified/personTeaching/certifiedForSkill` 的调用方。

抽查结论：§7 已列的位置全部属实（hidden-passives 28 键与正则 :47–53、:69–71、:83、:87–88、:123，pets:26–27，medicine-state:9，works:30，education-state:238/279/325，learning:57，education:30，local-exams:46，entity-view:165，primitives-effects:294 均与原行一致）；§7.2 的 28 个领域键与源码 matchers 键集合一致。问题在于清单**漏了若干整类调用方与现存机制**（见 R-15 至 R-18）。

模板：§0–§8 齐全；12 个子系统六小节齐全、顺序正确；每节数据实例都有非西陲与非人类或超自然例；三类断言每节都有。模板无缺节。

---

## 真问题（18 条）

### R-1 本卷的 RX 写法超出卷二 rxTree 的表达能力，且未列入回填（类别 4）
- 位置：§2.1 第 131 行（`standing.when: rx`）；§2.4 第 184、189 行（`issuer`、`admit`）；§2.5 第 209 行（`refusals.when`）；§4.7.5 第 640、644 行；§4.8.5 第 689–695 行；§4.9.5 第 741 行；§4.10.5 第 784–786 行。
- 证据：卷二 §2.9 第 4 条的 rxTree 变体是封闭的：`num dim handle add/sub/mul/div cmp and/or not agg clock`。本卷的式子用到：集合成员 `has` / `in`（`ctx.service.broader has service_treatment`、`ctx.skill in class_skill_medicine`、`target.classes has comp_sapient`）；函数调用（`kinDistance(teacher, student)`、`contractDays(...)`、`memberOf(...)`、`hasStatusFrom(...)`）；`ctx.*`、`edge.since`、`event.*`、`issuer.*`、`subject.deeds.<deed>.lastDay` 这类路径变量（rxTree 只有 `dim{key: DimKey}`，没有上下文、事件、边、事迹计数这几个命名空间）；`broader has` 还需要沿上位链求传递闭包。§5.4 第 954–979 行的回填表没有一行要求卷二扩展 rxTree。
- 后果：HO-6/HO-7/HO-8、LS-5、TR-2、EX-2 以及 §7.2 全部 28 项的新表达，按现行卷二都编译不出来。
- 建议：在 §5.4 增一行回填卷二 §2.9 第 4 条：集合成员 op（含沿 `broader` 的传递闭包）；具名的变量命名空间（`ctx` / `event` / `edge` / `subject` / `teacher` / `student` / `issuer`），每个命名空间各有一张封闭的字段表；把 `kinDistance` 等改写成 `agg` 加登记的 relation，或者登记一张封闭的 RX 函数表。同时把本卷所有示例改成这套文法能编译的写法。

### R-2 RX 变量"封闭"只写在正文里，校验器拦不住，等级门槛、显示字段都能从旁门进来（类别 7）
- 位置：第 131 行 `standing` 的校验只写了"RX 可编译"；第 184 行 `issuer`、第 189 行 `admit`、第 209 行 `refusals` 没有任何校验码；§2.7 第 249–265 行只给 `deed.filter`（E-DEED-FILTER）和 `perks.when`（"只引用已登记的上下文字段"）设了闭包校验。
- 证据：LS-5（第 529 行）、TR-2（第 769 行）、HO-8（第 678 行）、EX-2（第 616 行）都写了"可读变量是封闭的"，但没有对应的错误码。GR-6（第 864 行）只禁止需求块里出现等级选择器，而 `standing.when`、`admit`、`issuer`、`refusals.when` 写一句 `subject.level >= 5` 照样通过；读名称维度的式子同理。
- 建议：每个 RX 字段登记它可读的变量集（与 R-1 的命名空间表合一），新增 E-RX-VAR-UNLISTED 一类的码，在加载期按字段核对。等级字段不进任何一张可读变量表。在 §6 的反向测试里加一条："`admit`、`issuer`、`standing` 读等级或显示字段，必须失败"。

### R-3 检定上下文由 AI 填写这条路没有堵死；数值型 `args.context` 正好能通过 B-7（类别 7）
- 位置：HO-7 第 677 行（"AI 不能填写其中任何字段"）；B-7 第 324 行（"检定上下文里只许有代号、实体 id、数值"）；§4.8.6 第 704 行只要求删除 `contextReason`；§7.3 第 1088 行同此。
- 证据：checks.mjs:78、primitives-checks.mjs:40–41 现有 `args.context`，这是模型给的整数加值，范围在 ±contextLimit 内，`contextReason` 只是它的附带理由。只删理由、不删数值，模型仍能直接给加值；而且它是"数值"，B-7 判它合法。另外，hidden-passives.mjs:81 的 `tool==='check'&&args.skill`，技能本身也由调用方任选。新设计只说上下文"由规则层从真实动作构造"，没有可机判的不变量，也没说通用的 check 工具今后是否还存在、它的 `ctx.action` 从哪里来。如果模型能自报一个"测绘类"动作代号，就是旧 contextReason 换了个代号形式回来。
- 建议：B-7 改成"检定入参中不得有调用方给出的加值与动作代号；`ctx` 只能由执行中的动作行派生"。加一条不变量式断言："每次检定的 `ctx` 逐字段等于由该次动作事件（卷九 §4.1）派生的值"。§7 列出 checks.mjs:78、primitives-checks.mjs:40–41 的 `args.context` 并写明删除，同时说明通用 check 工具怎样处置。

### R-4 B-1/B-2 扫不到技能类 id，而技能类正是本卷引用技能的主要写法（类别 7）
- 位置：B-1 第 318 行（只说职业、技能**实体** id）；B-2 第 319 行（只管本卷拥有的词表族）；SK-6 第 441 行；§4.3.6 第 465 行。
- 证据：`skillRef` 可以指技能类（第 112 行），示例里通篇用 `class_skill_forging`、`class_skill_medicine`、`class_skill_literacy`。`class` 族不归本卷，`class_` 也不是实体前缀，所以 .mjs 写 `skillValue(e,s,id,'class_skill_medicine')` 时 B-1、B-2 都不命中。`knows` 选择器用到的知识 id（`lore_`）同样不在本卷的扫描范围内。
- 建议：B-1 改为"任何 .mjs 中不得出现 `skillRef` 可取的值（技能 id 与技能类 id），也不得出现人需求块各选择器键的取值（知识、认证、节点、事迹等）"；按 idIndex 与族前缀判，不按字面形态判。

### R-5 PF-4 说 `fit` 只随练习与闲置变化，这与 SK-5 矛盾；"首次跌破日"也没有存放处（类别 5、6）
- 位置：PF-4 第 348 行；SK-5 第 440 行；§4.1.6 第 378 行。
- 证据：SK-5 的第 ④ 步（身体折算，读 `bodyView`）和第 ⑤ 步（修正项管线，状态、灵感等）都会让 `skillValue` 进而让 `fit` 随伤病、状态起落，所以"只随练习与闲置天数变化"不成立。PF-4 要求按"连续为空的天数"解除从业边，但 §2.6 没有任何状态键存"tier 开始为空的日子"。一次推进多日时，中间的伤病史不可复原，所以"一次推进与逐日推进在同一天解除"这句不能保证。§4.1.6 的"处于宽限期内"也就无从机判。
- 建议：二选一。其一，从业失效只读 SK-4 的基值（不含身体折算与修正项），这样确实只是练习与闲置日的函数，可以解析求出跌破日。其二，增设状态键 `practiceLapse.<person>.<profession> = 首次为空日`，由 practice.mjs 在日界写入，并承认失效以日界采样为准。

### R-6 契机监听只订阅事迹与技能事件，漏掉随时间、认证、节点、生锈而变的条件（类别 5、7）
- 位置：HO-4 第 674 行（契机条件可写持有期、认证、节点、知识）；HO-5 第 675 行；§5.3 第 949 行（订阅：事迹变化、技能增长）；§4.8.6 第 708 行（"一次推进多日与逐日推进，契机出现事件的集合与发生日相同"）。
- 证据：`tenure` 选择器只随天数满足，没有任何事件；认证通过、取得节点、获得知识各有事件，但 opportunityWatch 没订阅；生锈让条件失去，也是纯时间效应。所以"契机出现"事件会漏发或晚发，第 708 行的断言必然失败。
- 建议：opportunityWatch 另加日界检查，并订阅认证、节点、知识、持有边各类事件；或者对每个可能随时间变化的选择器给出"下一次可能成立的日"的解析式，在日界补发事件。断言改为"在日界粒度上相同"。

### R-7 EX-5 说考核里唯一的随机来自 check 步骤，但 endorse 与 rite 步骤也有随机（类别 5、6）
- 位置：EX-3 第 621 行（endorse 由居民的立场与卷九决策给出）、第 623 行（rite 执行效果族）；EX-5 第 625 行；§4.7.6 第 656 行（复演逐字节相同）。
- 证据：卷九的决策带卷二十六 §4.9 的决策噪声（LF-6 第 728 行本卷自己也这么用）；效果族的结算也可能含检定。这两处的抽取点没有登记，§5.4 第 978 行反而写着"本卷无骰值键抽取点"。
- 建议：EX-5 改为"随机只来自 check 步骤的检定、endorse 所调用决策的噪声、rite 效果族内的抽取，三者的键都按卷二十七 §4.8 登记"，并在 §5.4 第 978 行补登。

### R-8 EX-1 要求按"当地承认度阈值"判资格，但 `certs` 选择器与 `qualifies` 都表达不了（类别 4、5）
- 位置：§2.6 第 242 行（`certs: set<ref vocab cert>`）；§3.1 第 281 行（`qualifies(personId, reqRef)` 没有地点参数）；EX-1 第 615 行；EX-6 第 626 行（"使用方在需求块里写要求的最低承认度"）。
- 证据：选择器只是一个集合，没有承认度阈值字段；`certStanding` 需要 `placeId`，`qualifies` 却拿不到地点。
- 建议：`certs` 改成 `map<ref vocab cert, fraction（最低承认度）>`，或者 `struct{any: set, minStanding}`；`qualifies` 增加 `ctx{place}` 参数，地点缺失时按 gap 处置。

### R-9 "须持续满足"的标记没有定义；撤销的触发也不是事件（类别 1）
- 位置：EX-8 第 628 行。
- 证据：卷二 §1.13 的需求块候选项字段是封闭的（classes、items、abilities、qty、consumed），本卷 §2.6 加的八种选择器里也没有"持续"标记；"条件不再成立"本身不是事件，而 §3.3 说 `revoke` 只由订阅到的事件触发。
- 建议：给 `cert` 条目加 `standingRequirement: 人需求块 nullable`，读取时求值（与 HO-8 同一做法，不存撤销），或者明确由日界检查。

### R-10 `variantOf` 与卷一 3A.8 的继承统一实现对不上（类别 4、5）
- 位置：§2.1 第 124 行；§3.1 第 277 行（view 时给出 `effective`）；PV-1 第 394 行；§4.2.5 第 407–411 行。
- 证据：卷一 3A.8 的继承统一实现是 `extends / abstract / + / - / ~ / *`，由加载器一处展平。本卷另设维度 `variantOf`，在读入口里给 `effective`，又说"用继承统一实现"，两者不是同一个机制。map 维度怎样合并也没说：草原变体写了 `skills`，示例说"把看火换成燃料技能"，这是整体覆盖；按 `+` 合并的话，看火会保留。E-PROF-VARIANT-CYCLE 又和加载器自带的判环重复。
- 建议：明确 `variantOf` 就是 `extends`，由加载器展平（`effective` 删去，或只作为展平结果的别名）；示例改用 `-skill_fuel_tending` 这类显式运算；判环归卷二，本卷只保留"领域不相交"这一项校验。

### R-11 缺一个列出某人全部技能的读入口，GR-4 和 UB-2 只能违反 B-4（类别 1、4）
- 位置：B-4 第 321 行；UB-2 第 815 行（"监护人读数最高的 fallbackSkills 项"）；GR-4 第 862 行（`learnLoad = Σ 各技能 …`）。
- 证据：§3.1 只有按单项技能取值的 `skillValue`，没有按人枚举技能的入口。growth.mjs 和 upbringing.mjs 要枚举一个人的全部技能及其基值，就只能直接读 `skillRecord`，正好违反 B-4。
- 建议：§3.1 和 §5.1 增加 `skillsOf(engine, state, personId, {base?: boolean})`，返回 `[{skill, base, value}]`，在 skill.mjs 中实现；GR-4 与 UB-2 改为调用它。

### R-12 生锈可以被极短的练习整类绕过（类别 7）
- 位置：SK-3 第 438 行（封顶后无论增量多少都写 `lastDay = 当日`）；SK-4 第 439 行。
- 证据：一段 1 分钟、难度极低的练习，增量为 0（`challengeCurve` 给 0），也会把 `lastDay` 刷新、宽限期重新起算。每隔 `rustGraceDays` 练 1 分钟，大师的技能就永不衰退。"有难度的重复"（§1.1）在生锈这一侧失效了。
- 建议：只在 `gain > 0` 时（或者本段时长不低于规则表常数 `rules.skill.minPracticeMinutes` 时）更新 `lastDay`；或者让闲置量按"实际练习量与维持量之比"折算，维持量查规则表曲线。

### R-13 事迹重放的不变量判不了：过滤式读的是事件发生后会变的实体状态（类别 7、6）
- 位置：HO-2 第 672 行（可"经入口读到目标与地点的基值维度"）；§4.8.6 第 706 行（"count 等于从事件日志重放得到的值"）；§7.3 第 1082 行（"目标带投降类状态族"）；§4.12.6、§4.9.6 的重放类断言同此。
- 证据：过滤式在处理事件时读目标的当前状态，比如投降状态、地点的站点类型。日后重放时，这些状态已经变了或者实体已终止，重放结果必然不同，断言也就没法交给机器判定。
- 建议：过滤式只许读事件载荷（由卷二十四在事件发生时写入所需的代号快照）；需要的目标状态由事件类型行声明进载荷。E-DEED-FILTER 增加一个条件："引用了载荷以外的实体当前状态"。

### R-14 若干断言没有给出可以机判的判据（类别 7）
- 位置与证据：
  - UB-8 第 821 行与 §4.11.6 第 844 行：只写"技能阶分布的差不超过 `consistencyTolerance`"，没定义距离（逐阶绝对差的最大值？总变差？KS？），也没定义样本量与种子；Q-12 第 1156 行承认工具不存在。
  - B-9 第 326 行与 §4.3.6 第 466 行、§4.12.6 第 886 行："在 .mjs 中出现本卷规则表所列的数值常数"。0.5、1、300 这类值在代码里到处都是，按值扫不出结论。
  - §4.1.6 第 377 行：把 `role` 作为"个体状态字段名"扫描，与本卷自己的 `deed.role`（第 185 行）以及合同、组织里的 role 同名，判据边界不清。
- 建议：UB-8 写明距离函数、样本量与种子集合（例如"每阶占比之差的最大值，N=2000，种子取规则表 `rules.upbringing.calibrationSeeds`"）。B-9 改为"规则路径中的数值字面量只许 0、1、-1，其余经规则表句柄"（与卷一 R-6 对齐）。第 377 行改为按 state-owners 的 person 路径白名单判。

### R-15 迁移清单漏了"按职业门控学与教"这一整套现存机制（类别 2：按职业分支没有去向）
- 证据（全部静态核过）：
  - entity-view.mjs:123–126 `personCertified`：学习要先持有技能"所属职业"的认证；entity-view.mjs:127–140 `personTeaching`：按 `c.roles.includes(role)`、职业 `skillTree`、`teachingStages[role]` 判断能不能教。这正是 B-3 所禁的"按从业某职业分支"。
  - 调用方：engine.mjs:1104（突破导师）、:1107（"未认证职业不能跨越初级阶段"）、:1124（玩家走 `certifiedForSkill`、居民走 `personCertified`，两条路）；npc-growth.mjs:39；primitives-learning.mjs:83、:147（`uncertifiedMaximumProficiency` 上限）；education.mjs:63；learning.mjs:101；primitives-effects.mjs:279；action-affordances.mjs:208；professions.mjs:26；career-metrics.mjs:186、:203。
  - 现存的技能"阶段与突破"机制（works.mjs:274 `stage: floor(prof/300)`、`breakthroughs`、突破导师）在本卷没有对应概念，也没有处置。
- §3.4 第 312 行只退役了 `personCareer`，§7 也没有上述各行。
- 建议：§7 增设一小节逐行处置。"认证才能学深"改写为 DG-2 的 `capWithoutPrereq`，前置里写 `certs` 选择器。"能否教"改为 `canOffer(教师, 授课服务)`。突破阶段要么并入 `sband` 加前置图，要么明确删除，并说明理由。

### R-16 用 id 前缀反推类别的若干文件整份不在 §7（类别 2）
- 证据：action-router.mjs:408、:446（`startsWith('skill_'/'spell_'/'recipe_')`）；credit.mjs:498（取雇主第一个 `skill_` 开头的键）；education.mjs:56、:62、:64、:71、:73、:83；education-state.mjs:238（`startsWith('bld_')`）、:249、:364；primitives-learning.mjs:48；works.mjs:102；entity-view.mjs:117（`startsWith('profession_')` 并且 `id==='player'` 分支）、:128、:130、:136（`startsWith('recipe_')`）。其中 action-router.mjs、credit.mjs 在本卷完全没有出现。
- 建议：§7.5 补列，处置统一写成"改用 `kindOf(id)`（卷二 §1.9）"；entity-view.mjs:117–119 的玩家分支并入 §7.1 的五个名字那一行。

### R-17 运行期新建技能（技能融合）没有去向（类别 4、1）
- 位置：§2.2（技能表只是数据表）；§7.6 第 1131 行。
- 证据：works.mjs:258–279 的融合实验在运行期往 `state.created` 写一条 `skill_created_*` 新技能行（带 `prerequisites`、`attribute`、`profession:null`、`stage`），然后直接写 `state.skills`。本卷没有说运行期技能行怎样产生、由谁登记、新行的 `baseGainPerHour/sources/learningCurve` 等必填维度从哪里派生，LS-8 也只处理"已有技能的更高段"。
- 建议：要么在 §4.4 或 LS-8 中规定，研究可以产出新技能行，经卷二十二 §4.9 的研究产物登记，必填维度由两项来源技能派生（写成规则表曲线）；要么明确退役融合，并报李白。两者都要进 §7。

### R-18 隐藏加成的调用方与"内部直传领域"的路径没有列入迁移；第 26、27 项的旧判定也不全（类别 2、5）
- 证据：
  - 调用方：checks.mjs:36、:76、:109、:116；primitives-checks.mjs:32–50、:78；engine.mjs:492；activities.mjs:127；magic.mjs:157；pets.mjs:193、:225；entity-view.mjs:400；professions.mjs:47（隐藏职业认证分支）。§7.3 只退役了被调用的函数，没写这些调用方改读什么。
  - 内部直传 `passiveDomain` 的路径（§7.3 第 1086 行只写"调用方传 ctx"）：engine.mjs:1160–1161（`backlash`，只查 `'player'`）；npc-growth.mjs:108–110（`teaching`，条件是 `teacherId==='player'` 且**物种**不同）。§7.2 第 26 项把旧判定写成"只有 :53 正则"，新表达却改读"**文化**不同"。与旧事实不符，而且没有说明。第 27 项也漏了 engine.mjs:1160 这条路径。
- 建议：§7.3 增加"调用方"一栏，逐行写明改读 `modified()` 的哪个过程槽。第 26 项写明旧判定是物种不同，新表达选物种还是文化需给理由（或两条都写成数据）；第 27 项补上发起来源。

---

## 小项（只记账）

1. §2.1 第 121 行职业的 `toolAbilities` 是 set，§2.4 第 180 行服务的 `toolAbilities` 是 map<ability,integer>，同名不同型。
2. 同名不同型：`person.perks`（第 169 行，set<perk>）与 `profession.perks`（第 130 行，list<修正项>）。
3. `prereqGraph`（第 480 行）没进 §3.1 和 §5.1；`sharedLanguage`、`admits`、`schoolsOf`、`lifestyleAppeal`、`growthView`、`examOptions` 在 §5.1 第 907–909 行写"见 §3.1"，但不在 §3.1 表中。
4. 卷二 §5.5 已把从业持有种类定名为 `practices`，本卷 §4.1.1、§5.4 第 974 行只写"从业"，没有给出代号。
5. SK-1 与 SK-3 写"换日清零"，§4.3.6 第 468 行写"不练习时 skillRecord 不被改写"。应写明清零是读取时按 `markDay` 比较，不是日界写入。
6. §7.2 第 7 项"目标不是自己"：旧代码 :76 是 `a.target!=='player'`（目标不是玩家），宜注明旧逻辑本身就是玩家特例。
7. local-exams.mjs:53（学生缺省为 `'player'`）、:69（玩家免查清醒与在场）、:72（玩家与居民走两个检定函数）、:83（`row.student!=='player'`）都是 B-8 违规，§7.5 第 1124 行只写"全文件取代"，宜逐行列出，方便卷十二出扫描。
8. `skill_literacy` 的"16 处"只点名了 6 处；book-gates.mjs:18、documents.mjs:26、governance.mjs:53、primitives-effects.mjs:318、education-state.mjs:163/:357 没点名，其中 documents.mjs、governance.mjs 在全卷都没有出现。
9. 技能 id 字面量还有 extraction.mjs:141、works.mjs:201（`skill_life_13_core` 缺省值），§7.1 第 1019 行只列了 :118。
10. 第 760 行"本卷登记 `know_family` 为手艺一类的知识行"，措辞不清（是知识行 `family` 字段的一个取值，还是一个族名？）。
11. 第 118 行 `domains`（≤3）的上限写在类型里，没有放进规则表。
12. career-metrics.mjs:63 用 `opponentLevel >= player.level` 做战斗凭据的门槛，属于 GR-6 与 Q-8 所说的等级依赖，§7.4 宜点名。
