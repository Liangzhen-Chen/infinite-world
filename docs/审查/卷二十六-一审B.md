模型：claude-opus-5-5，中档（主会话 11-13 按运行记录补注）

# 卷二十六 一审 B（需求、心理与情绪 第一版）

审查员 B（claude-opus-5-5 中档）。侧重：断言能否机判与绕过路；模板齐全；现状与迁移清单（抽查 file:line）。
必读已读：卷二十六全卷；台账 §二 卷二十六小节、X-02/X-06/X-07/X-25/X-27/S-15/S-20/S-27 与第五节；素材包；卷一 §0.4、R-6、§8.2；卷二 §1.8、§1.10、§1.11、§2.4、§2.7、§3.2、§5.5、§5.17、§6.8；卷四 §4.3、§4.10；卷二十七 §4.1、§4.8；写卷须知（含补充裁定）。
代码抽查 18 处 file:line（server-plugin/ 下），见各条证据。

模板核对：§0–§8 与术语表齐全；九个子系统各六小节齐全；每节数据实例都有西陲、非西陲、非人类或超自然；三类断言齐全。模板本身不缺节（另见 B26-17：首批登记的代号缺数据行）。

---

## 真问题（21 条）

### B26-1 人格与价值改成派生，违背写卷须知补充裁定　类别 4、5
- 位置：§2.1 第 104–107 行（`persInnate`、`valueOffset` 采样，`personality`、`values` 派生且"禁手填"）；R26-1.2（第 286 行）、R26-2.2（第 356 行）；§5.3 第 877 行；§8 Q3（第 935 行，"本稿采用"甲）。
- 证据：写卷须知"补充裁定"末条：personality、values 仍是卷二 §5.5 的存储维度，生成时按种子抽基础值，后天变化一律经修正项叠加、读有效值，"基础值不改成派生。卷二 §5.5 维持现状"。卷四 §2.1 第 182 行也写 `personality` always（经采样）。本卷把已裁定的事项当开放问题自选了被否的一侧，并要求卷二改表。
- 改法：`personality`、`values` 保持采样存储维度；删 `persInnate`、`valueOffset`（`prefOffset`/`preference` 不在裁定内，可保留）。群体基线与文化缺省二选一写定：其一，作为采样参数（分布均值引用物种/文化行的字段，Q3 乙）；其二，像卷四 A-2 那样由加载器为每个物种/文化行生成 `unpenalized` 修正项，目标 `person.personality[<轴>]`、`person.values[<轴>]`。R26-2.2 的"人格对价值的牵引"同样改为加载器生成的修正项（`valueRX` 读人格基值）。§5.3、§8 Q3 相应删改。

### B26-2 现有的 `npcs.*.mental`（含压力 0–100）没写进现状和迁移清单　类别 4（迁移不全）
- 位置：§1.2 第 74 行（"压力……无实现"）；§3.4；§7 只有 M26-6 把 `mental` 当"文字字段"、M26-8 写"待核"。
- 证据（均已读到）：写者有 5 处：`contracts.mjs:45`（暗影契约每分钟加压力）、`magic-mind-space.mjs:230`（comfort 减压）、`:239`、`:333`、`magic-ritual.mjs:316`、`:405`（邪秽干扰加压）。读者有：`npc-decision.mjs:25`（`stress>=90` 判忙）、`magic-consent.mjs:109`（`stress>=80` 拒绝同意）、`entity-view.mjs:29`（`personMental` 缺省 `{fatigue:0,alertness:50,stress:0}`）、`magic-ritual.mjs:242-243`、`action-limits.mjs:49`（alertness）。`mental` 是数值结构，不是文字。
- 改法：§1.2 如实写现状。§7 逐个文件加行：加减压力的写点改成效果族输出，对 `gauge_stress` 容器给 severity 增减量（接收方卷十五、卷七）；阈值读点改成容器档修正项（接收方卷九、卷十五）；`fatigue` 交卷二十一，`alertness`、`interference` 写明归属。

### B26-3 现有的个人士气字段漏了　类别 4（迁移不全）
- 位置：§1.2 第 75 行（"士气：只在军团级"）；§7 M26-10。
- 证据：`office-salary.mjs:57-58` 欠俸时写 `npcs.*.morale`（`unpaidMoraleLoss`）；`entity-view.mjs:191-193` 读它，缺省 `moraleBase 60`；`npc-memory.mjs:210` 把它拼进文字传给模型。
- 改法：§1.2 改正。§7 加一行：欠俸改成想法行（`event` 触发，动词为欠俸或领俸），或改成指向 `gauge_morale`/`gauge_mood` 的效果族；删除这个字段；接收方卷八（职位俸禄）。

### B26-4 决策里读价值文字和风险厌恶，清单只收了一处　类别 3（迁移不全）
- 位置：§3.4 第 254 行、§7 M26-7（只列 `finance-assets.mjs:82`，写"待核"）。
- 证据：
  - `npc-decision.mjs:18,21`：`weight=name=>values.includes(name)…`，再用 `weight('家人')`、`weight('体面')`。这是拿中文字面量去查人格价值文字数组，属于典型的读文字定逻辑，§3.4 和 §7 都没收。
  - `npc-decision.mjs:11-12`：`redLines` 用 `r.includes(t)` 做文字包含判断（`baseline.json` 里有 275 处 `redLines`），本卷和"相邻但不归本卷"一栏都没提。
  - `traits.riskAversion` 有 4 个读点：`npc-decision.mjs:17`、`autonomy-candidates.mjs:37`、`finance-bank.mjs:267`、`finance-assets.mjs:82`。"待核"可以结案：它读的是 `subjectiveView().self.traits`，也就是定义行 `personality` 的副本（`subjective-view.mjs:95`）。数据里没有这个字段，所以永远落到 `??1`，即 E-VIEW-FALLBACK。
  - `finance-assets.mjs:84-87` 每次决策按 `rules.agriculture.fieldRent.riskPreferences` 另抽一个风险偏好档，等于在人格之外又造了一条风险性格的通道。
- 改法：§7 每个读点各加一行。风险厌恶写定由什么得出（例如由 `pers_caution` 经驱力或噪声得出），旧旁路一并退役。家人、体面改读 `values` 轴（经卷七词表）或驱力权重。`redLines` 写明归属（卷九 red_lines 阶段，或卷七规范），列进"相邻但不归本卷"一栏。

### B26-5 人格文字的生成方和其他消费方不在迁移清单　类别 4（迁移不全）
- 位置：§7 M26-1（只列 `baseline.json`）。
- 证据：`population-service.mjs:12`（让模型生成 `personality{traits,values,flaws}`）、`population.mjs:367,380`（schema 把 personality 设为必填）、`remote-generation.mjs:799`（`PROFILE_KEYS`）、`npc-memory.mjs:209`（读 `personality.values/flaws` 拼人设）、`npc-autonomy.mjs:354`（把 `traits.values`、`redLines` 输出到计划里）、`nation-founding.mjs:223` 的数值字段 `npc.ambition ?? base.ambition`（M26-4 只写了正则，没写这个字段）。只删 baseline，生成器会继续产出文字人格。
- 改法：每处各加一行迁移，接收方卷十（生成走 `instantiatePerson` 加采样）、卷九与卷二十九（人设和叙述只读代号，由显示层出文字）、卷八（野心改读驱力）。

### B26-6 宠物心情、天气心情、需求目标系统的现状不全　类别 4（迁移不全）
- 位置：§1.2 第 74 行；§7 M26-9（写"待核"）；相邻一栏。
- 证据：`pets.mjs:56,123,192,274`：`mood` 初值 60，增减 -1、+2、+5 都写死在代码里，可以结案，不必"待核"。`weather.mjs:140` 输出 `moodModifier`（来自 `rules.states[kind].mood`），本卷没有接收。`npc-intelligence.mjs:147-158` 的 `detectNeeds` 已经有一套需求（food/money/safety/status，content 是中文句子），其中 `status` 就是"挽回脸面""说得上话"这类心理需求，和 §4.3 直接重叠，台账 14.12 也写了"需求→目标→候选"。三者都没进 §7。
- 改法：M26-9 写实（数值和字段都删掉，宠物改用心理量行）。天气心情改成一条 `state` 触发的想法行，读所在地点的天气维度（卷二十）。`detectNeeds` 写明处置：社交、地位类需求并入 need 族；生存类归卷九/卷六；中文 content 退役。

### B26-7 "心理只经修正项影响行为"没有扫描把守，整类可绕　类别 7
- 位置：§1.3 第 92 行，R26-4.7、R26-5.8、R26-8.4；§3.5 P26-2、P26-7；§5.1 第 852 行（`psych` 对卷九、十三、二十一、二十三、三开放）。
- 证据：任何模块都可以读 `personView().psych.gauges[*].severity` 或 `.stage`，再拿自己规则表里的阈值做分支。这正是现有代码的写法：`magic-consent.mjs:109` 的 `stress>=80`、`npc-decision.mjs:25` 的 `>=90`，把常数挪进表后，P26-1 到 P26-7 一条都拦不住。P26-2 只禁七族字面量。档 id（`despair`、`raging`、`broken`）不带前缀、不在七族里，`stage==='raging'` 不违例。P26-7 的"心情好坏布尔判断"没有可机判的定义。
- 改法：① 把 `psych` 和心智类容器的读者登记成闭集（显示与叙述投影、卷十三聚合、卷二十一诊治），闭集外读即 E-VIEW-UNDECLARED-READ。② 规定闭集里只有卷十三聚合可以对 severity 做算术，任何模块都不得对 severity 或 stage 做比较或分支。③ 档 id 登记为带前缀的代号族，纳入 P26-2。④ P26-7 改写成按①②判定。

### B26-8 P26-1 扫的对象与实际旁路对不上　类别 7
- 位置：§3.5 第 261 行。
- 证据：P26-1 扫"状态路径"，但人格、价值、偏好是采样或派生的，不落状态，只有偏离行在 `npcs.*.props.*`/`created.*.props.*`。现有旁路全是读定义行：`engine.byId.get(id).personality`（`duels.mjs:18`、`npc-crime.mjs:42`、`nation-founding.mjs:223`、`npc-cognition.mjs:38`、`npc-memory.mjs:209`），卷二 §2.4 对这类读取的码是 E-VIEW-BYPASS-CATALOG，不是 E-VIEW-BYPASS。P26-1 还漏了 `gaugeTarget`、`gaugeInflow`、`driveWeight`、`decisionNoise`，以及在 `personView` 之外直接调采样函数取这些维度。
- 改法：P26-1 把三类都写进去：定义行读取（E-VIEW-BYPASS-CATALOG）、偏离行路径、`personView` 实现组之外对这些维度调 `sample`。维度名单补全。

### B26-9 若干断言的判据没有定义，机器判不了　类别 7
- 位置：A26-5.I（第 615 行）、A26-7.I（第 727 行）的"统计容差内"；A26-9.S（第 839 行）的"决策相关模块"和"除 personView 外没有第二个返回人格或权重的函数"；A26-5.S（第 614 行）的"行为、战斗、治安模块"；A26-7.S（第 726 行）的"制造、作品模块"；A26-8.S 的"战斗、军团模块"。
- 证据：容差没进规则表（§2.4 只有 `corrTolerance`）。模块集合没有指向卷二 §2.7 的模块组或 import 矩阵。"返回人格的函数"没有类型或路径上的判据。
- 改法：容差进 `rules.psych`，写明样本量和种子。模块集合改成引用 §2.7 登记的系统或模块组名，或者干脆写成"psych 的 import 只许 kernel、status、modifier、视图入口"这样的白名单。"第二个函数"改成按 pathTypes 或返回品牌类型判定。

### B26-10 A26-4.I 要求复算推力，但读入口不给因子　类别 5、7
- 位置：§3.1 第 225 行，`psych.thoughts` 的形状是 `{thought, gauge, magnitude, eventRef?}`；A26-4.I 第 542 行写"任一想法推力可由 psych.thoughts 给出的各因子复算严格相等"。
- 证据：入口只给 `magnitude`，不给 P、V、R、D、K、基础推力和对象偏好，这条断言无从机判。
- 改法：`thoughts` 条目加上 `factors{base, pref, P, V, R, D, K}`（数值），或改为经 `explain()` 给出。

### B26-11 `needSatisfiers` 的派生依赖 RX 的符号，静态判不了　类别 7
- 位置：R26-3.5（第 409 行）；§4.3.5 `eff_social_contact` 的 `"severityDeltaRX": "-magnitude"`。
- 证据："负向 severity 变化"要求在加载期判定一条 RX 的正负。RX 可以读参数和状态，参数域也可以跨零，一般情况不可判定。作者可以写一个运行时为负、静态看不出来的式子，也可以反过来。
- 改法：效果族的 status 输出加一个封闭枚举字段 `direction`（relieve / aggravate），由校验器在参数域端点上用区间求值核对它与 RX 一致（不一致报错）。`needSatisfiers` 只读 `direction`。

### B26-12 发作容器的 severity 没有驱动者，"第二档"到不了　类别 5
- 位置：§2.3 约束 1（第 172 行，`perDay` 为空）；R26-4.4 只推进心理量；§4.6.5 `status_ep_melancholy` 的 `wasting` 档 minSeverity 0.8，`severityInitial` 0.6（第 648–652 行）；实例第 664 行写"容器升到第二档后进食驱力被置 0"。
- 证据：没有任何规则改变发作容器的 severity。它恒为初值，多档发作的高档永远到不了，与实例矛盾。
- 改法：发作行加推进字段（如 `severityInflowRX`），由 R26-4.4 按累积型推进；或者规定发作档只按"所系心理量"取档。两种都要在 R26-5.x 写明。

### B26-13 `conduct` 触发的键和缺省没写定，日常事件会挤掉真违背　类别 4、7
- 位置：R26-4.1 `conduct`（第 479 行）；R26-4.2 的 K（第 486 行）；`thought_conduct`、`thought_conduct_strain` 的 `stackLimit 5`。
- 证据：台账第 261 行和 S-27 写明评价行"引 offenseId 或 actionId"，本卷却按"事件"取评价，事件到 actionId/offenseId 的映射没有给出。没有评价行的事件（吃饭、走路）x 是 0 还是不成立，也没写。如果按 0 成立，它们按新近程度占掉 `stackTable` 的名额，三顿饭就能把一次欺诈的推力挤出前五。
- 改法：没有评价行的事件不成立；写明经卷二十四事件类型行上的 actionId/offenseId 字段去取评价行。

### B26-14 A26-2.I 与 R26-1.2、R26-2.2 互相矛盾　类别 5
- 位置：A26-2.I 第 390 行。
- 证据：换出生地会同时换文化的 `personalityBias`，于是 `personality` 基值变化，经 `valueLoad` 也改变 `values`。只有两文化人格基线相同时，"变化量恰等于两文化缺省值之差"才成立。
- 改法：按 B26-1 改写后重述，例如"两文化 personalityBias 相同时……"，或者把人格项的变化量一并写进等式。

### B26-15 同一示例个体的人格数值前后不一　类别 5
- 位置：§4.1.5 第 332 行定 `npc_example_west_smith` 只抽到 `z_0=1`，其余为 0，于是沉稳 = 0.35×0.25 = 0.0875，合群、守规都是 0；§4.2.5 第 381 行用守规 0.40；§4.3.5 第 452 行用合群 0.50；§4.4.5、§4.5.5、§4.9.5 用沉稳 0.60。
- 证据：同一个 id、同一组 z，各节取值互相冲突，附录二的核算也就失去依据。
- 改法：给这个示例个体列一张完整的十二轴向量（由一组 z 和 L 算出，进附录二），各节一律引用这张表。

### B26-16 `comp_sentient` 没有定义　类别 1
- 位置：第 512、579、588、596、654、759 行，心情、压力、狂怒、木僵、狂暴、士气的 `applies` 都用它。
- 证据：卷二 §1.8 首批组件类只有 `comp_sapient`；卷四第 134 行的 `sapient` 等价于 `comp_sapient`；本卷卷末代号表也没登记 `comp_sentient`。它决定哪些动物有心情、压力和士气，是本卷的核心维度。
- 改法：在 §2.2 和卷末登记 `comp_sentient`（族 component，`table: species`，写清 requires），或改为由卷四某个已有维度派生，并在 §0.2 写明出处。

### B26-17 首批登记的代号缺数据行，"娱乐"需求没写　类别 1、8
- 位置：卷末第 971–972 行登记了 `need_recreation`、`gauge_need_recreation`；§4.3.5 没有它们的心理量行、容器行和满足途径。另外，首批心理量 `gauge_stress`、`gauge_need_beauty`、`gauge_need_worship` 指向的 `status_stress`、`status_need_beauty`、`status_need_worship` 都没有容器行。
- 证据：台账第 549 行要求心理需求写全"社交、娱乐、美观、祈祷"。§2.3 约束 2 和 E-PSY-GAUGE-STATUS 会让本卷自己的首批数据加载失败。附录一自检第 12 项只查了 pers 和 drive。
- 改法：补娱乐需求的四行（需求、心理量、容器、满足途径）。补齐首批心理量对应的容器行。自检脚本把 need、gauge 到 status 的闭合也查进去。

### B26-18 推进结果依赖分拍方式，违背"分段推进同摘要"　类别 6
- 位置：R26-4.4 第 492 行（closedForm "差不超过定点截断误差乘以拍数"）；R26-5.3 每拍掷一次骰。
- 证据：写卷须知补充裁定要求"一次推进 N 天与分段推进合计 N 天，必须得到同一份存档摘要"；卷二十七 R27-1.6 用绝对时间整拍边界来保证逐字节相同。本卷明说允许有差，也没写拍要对齐绝对时间边界；危险率的骰值键时刻成分也没定。
- 改法：写明心理量推进和发作判定只在绝对时刻能被 `tickMinutes` 整除的边界上结算，零头留给下次（引卷二十七 R27-1.6），骰值键的时刻取拍边界；删掉"近似相等"的 closedForm 说法，改为逐字节相同。

### B26-19 常数缺逐条出处　类别 2
- 位置：§2.4 第 192 行，整张 `psych.json` 只有一个总 `basis`；`gauge_need_social`、`gauge_need_beauty`、`gauge_mood`、`gauge_stress`、`gauge_morale` 和全部 `thought_*`、`episode_*` 行没有 `basis`，行内 RX 却带常数（如 `"0.08 * (1 + 0.6 * …)"`、`"0.12 * (1 - 0.5 * …)"`）。
- 证据：卷一 R-6 第 2 条：每个数值条目带 basis，RX 里的常数算表内常数，所在条目同样须有 basis。
- 改法：`psych.json` 逐键给 basis；每个心理量、想法、发作数据行补 `basis` 和 `status: placeholder`。

### B26-20 加权抽取的"整数化"没写定，值域在 [-1,1] 的维度全为 0　类别 5、7
- 位置：R26-5.5（第 561 行）"按值（取非负部分、整数化）"；A26-7.X 第 728 行称可绑定到任意 person map 维度（例如属性）。
- 证据：没有缩放系数。对 `preference`、`values` 这类 axis 维度，整数化后权重全为 0，卷二 §1.10 的 categorical 会报 E-DIM-SAMPLE-WEIGHTS，行为未定义。R26-5.3 又自定义了一套"按危险率占比"的分数权重抽法，和卷二 categorical 必须用非负整数权重的规定不一致。
- 改法：权重 = floor(值 × `rules.psych.pickScale`)，写明全为 0 时的处置（不触发，或退回取顶）。两处抽签都改为引用卷二 §1.10 categorical，危险率先按同一个缩放系数整数化。

### B26-21 相关矩阵的校验与卷二不一致　类别 4
- 位置：R26-1.1 第 285 行（"任一主元不为正即 E-DIM-SAMPLE-CORR"，即要求正定）；§2.5 第 200 行写"正定"。
- 证据：卷二 §1.10 规定同一个码 E-DIM-SAMPLE-CORR 校验"半正定"。卷二放行的半正定矩阵，在本卷的分解里会报错。同一个码有两种判据。
- 改法：二者统一。要么本卷改用允许零主元的分解（LDLᵗ），要么请卷二把该码改成正定（记进 §8）。

---

## 小项（只记账）

1. §0.3 引卷零覆盖表的行号整体差 14：3.10 在第 169 行（不是 155），3.1 在第 160 行，8.4 在第 263 行，14.12 在第 357 行，B 表在第 560–566 行。
2. §0.2 "规则四形状见卷一 §2.5"：卷一的规则四形状在 §4.2。
3. P26-6 的"白名单"应写明引卷一 R-6 第 1 条。
4. 发作 `gate.maxSeverity` 写 1.01，超出 severity 的域 [0,1]。建议改成区间端点可闭的写法。
5. 心情、士气容器的 severity 越高越好，需求、压力则越高越糟。卷二十一的诊治等通用规则如果把"降 severity"当成缓解，就会误用。建议在 §2.3 写明心智类容器的极性由行数据声明。
6. 骰值键的序号成分应引卷二十七 R27-8.5（由调度器全序给出），R26-9.4 的 `seq` 写明来源。
7. 数值示例：§4.4.5 目标 0.32 无来源（基线 0.56 加 -0.056 应为 0.504）；§4.5.5 危险率从 0.084 跳到"合计 0.12"；§4.9.5 的驱力算例"人格项 0.5×0.60"对不上任何驱力行（`drive_status` 的载荷轴是野心）。
8. R26-7.3 写"所需材料类别"，但 `preference` 的键域还含分类学类别和审美代号，取顶可能取到非材料。
9. R26-7.5 说人口门槛写在 `hazardRX`，数据却写在 `applies`（第 708 行）。
10. §4.6.5 提到"服从驱力"，§4.5.5 提到"敌意驱力"，drive 族里都没有。示例发作 `status_ep_brood`、`berserk`、`feral`、`fallen`、`haunt`、`inspired` 的容器行也缺。
11. A26-1.I：十二轴共 66 对，n=10000 时单元素标准误约 0.01，再加上钳位，`corrTolerance 0.03` 处在边缘。建议写明固定种子。
12. R26-4.2：立场读数未知时 R 怎么取没写（只写了偏好未知）。
13. 台账第 547 行把卷十列为人格的使用方（生成走 `instantiatePerson`），§5.1 没有列卷十。
14. 发作容器行的 `duration` 字段（卷二 §1.11 有）应规定为空，时长只由发作行给出，免得两处都写。
