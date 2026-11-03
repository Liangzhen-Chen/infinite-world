# A3 开放动作盲测意图语料 v2

2026-10-21 续补：共231条独立题（新增111条），编号A3V2-001至A3V2-231；tricky 110条，占47.62%。旧120条除source外完整保留。JSON顶层为数组，UTF-8编码。

## 原120题历史分布（续补总表见文末）

| 类别 | 编号末三位 | 条数 | tricky |
|---|---|---:|---:|
| 日常生活 | 001—010 | 10 | 0 |
| 修行与学习 | 011—020 | 10 | 0 |
| 制作与修理 | 021—030 | 10 | 0 |
| 交易与借贷 | 031—040 | 10 | 0 |
| 社交与对话 | 041—050 | 10 | 0 |
| 法律与官府 | 051—058 | 8 | 0 |
| 战斗与危险 | 059—066 | 8 | 0 |
| 超自然与仪式 | 067—074 | 8 | 0 |
| 组合/多步 | 075—080 | 6 | 0 |
| 刁钻意图 | 081—120 | 40 | 40 |

刁钻意图 40 条，占 33.33%，超过至少 36 条、至少 30% 的要求；十类互斥计数，总和为 120。

| 预期路径 | 条数 |
|---|---:|
| 已注册动作 | 71 |
| open:waive_debt | 1 |
| open:proposal | 26 |
| reject | 19 |
| clarify | 3 |

| 标志 | true | false |
|---|---:|---:|
| outOfBounds | 21 | 99 |
| fallback | 10 | 110 |
| constructor | 98 | 22 |

## 判分口径

2026-10-20，A3-E 第 6 轮（v2g）：正常条目只用实际提交回执的 `applied` 作签名证据，原语集合与 `expected.signature` 的原语集合必须完全相等。仅在同一回执的 `cost.resources` 能逐条对应时排除派生成本；明确请求的消费保留，重复成本不得多排，`actedAs` 不作为成本证明。

括号中的限定词按引用判定，不要求描述组合词逐字出现在效果里。从当前被测 world 的人物、物品、技能、法术、配方、地点等目录及 `world/ontology/resources.json` 的真实资源 ID 中提取引用；嵌入 `teacher_`、`book_`、`teach_` 等描述中的真实 ID 也要核对，长 ID 优先，避免把 `item_wood_shavings` 再当作 `item_wood`。`coin` 沿用语料别名，对应 `coin_river`。`self` / `player` 指发起者（`receipt.actor`，省略时为 player）。

一个签名内的全部引用必须在同一个、原语相同的已采用效果中出现，不跨效果拼接，不从 expected 构造执行输入。证据仅限结构化原子值和完整账户键的分段；叙述 text/intent/description/narration/reason、result、actedAs 和 signatureKind 不能补证。效果中缺少真实 ID 或指代对象即判错。自定义场景别名未成为 world ID 时不当作真实引用。

给出 `a->b` 时，还须分别核对该效果的 `from` / `to`（完整账户取持有者段），不能只看两端都出现；person 等类型前缀及端点后的数量、requested_ / bounded_output 描述不作为端点。未绑定方向别名不猜测映射。其余纯描述词不参与判分，但原文完整保留在报告的 `expected.signature` 中。括号外旧版独立字段、标签 token 继续精确匹配。

例如 `emit(person:npc_hw_xuling,request:teach_spell_light)` 要求同一 emit 效果里有 npc_hw_xuling 和真实法术 ID spell_light；request/teach 不是额外断言。`transfer(resource:coin,self->npc_hw_linsui)` 要求同一 transfer 含 coin_river、发起者与 npc_hw_linsui，且 from 发起者、to 林穗；反向转账不得分。拒绝条目（expected.route 为 reject，或 outOfBounds=true 且应拒绝）的签名，以实际拒绝且原始 applied 为空为正确；expected.signature 描述被请求的效果，仅作说明，保留原文。拒绝回执中的成本等已应用效果也不允许被过滤后得分。澄清、实现异常、setupUnmet 或实际提交均不能冒充拒绝；澄清条目仍按其预期空效果集合判分。

## 使用口径

每条是独立场景，不是同一角色连续进行的 120 回合。真人原话中的当前处境是该题的场景约束，例如在押、只剩一铜、教师昏迷、尚无同意。评测方须先把它们放入真实状态，不能让玩家的自述直接改写状态或伪造授权。诸如“买家”“同牢成年人”“我自己的木杖”是场景角色，搭建场景时必须绑定实际且唯一的实体；85—87 则故意保留待澄清的信息。

常规题按最小可行场景准备在场目标、足够支付与库存、已声明拥有的技能和工具；这只为了测指定意图，不代表余额无限、任意人会同意或角色无条件会所有技能。请求、报案、学习、认证与交易的实际结果仍由对应规则决定。明确已有同意的题必须有有效的来源方同意事件，不能把调用方填写的布尔值当作同意。若评测场景缺少题目声明的条件，应先记录场景不匹配，不能把它误计为意图识别错误。

- `route` 是对该原请求的期望处理：明确对应目录动作时写其真实 ID；没有单一明确动作、需要组合或留痕时写 `open:proposal`；信息不足写 `clarify`；明确不可能或越权的原请求写 `reject`。路由不等于保证成功，也不表示绕过 NPC 决策、幅度裁剪或注册动作的前置。
- `signature` 是关键原语签名字符串数组，形如 `op(对象种类:对象线索,字段或资源/方向)`；原语名严格采用 06 §6.3。括号内是可读的对象、来源、条件和结果线索，不是执行参数，不应直接喂给提案接口；先由测试夹具绑定真实实体、种类与合法字段。只列与题意有关的效果，常规耗时、工具磨损、学习副收益等由动作自身补齐；相同原语多次出现表示不同对象或不同转移。
- 签名中的 `recipe_*->self` 表示注册配方内部的制造守恒对，不授权自由提案动用 `src:craft`；`sink:craft` 表示配方投入消耗的抽象方向。买卖中的商人名称表示对应有权经营者及其本地账目，结算仍须绑定真实账户。`if_accepted`、`if_success` 等表示有条件的后续；不得将其前面的请求、申请、受理预览视作已经取得同意或成功。
- `reject` 和 `clarify` 的签名描述要检查或尚待确认的作用域，绝不是应实际应用的副作用；108 的越权读信息无写状态原语，故为空数组，010 的纯观察同样为空数组，但二者的路由与权限期望不同。
- `outOfBounds=true` 表示原话包含必须被拒绝或裁掉的权限、物理、守恒、知识、幅度或时序要求；不是“违法”标记。102、103 应保留规则允许的练习或制造结果并裁掉过量部分；其余明确越界题拒绝原要求。检定可能失败、NPC 可能拒绝，不因此标成越界。
- `fallback=true` 表示原意适合由 `create(kind:mark)` 的零价值留痕实体承接；本组只有 111—120，使用现有 `mark:*` 标签。它们不得带资源账户、直接数值收益、所有权、真实陷阱伤害或自动天气效果；真实材料仍须存在并按使用方式消耗或摆放，不能复制物品。7 日推进内应至少有一个订阅系统反应，具体反应依见证、文化与规则派生，不能强写“所有人信任我”。
- 拒绝题的 `fallback=false` 不取消 06 §6.10.4 要求的世界内理由、替代做法和可选留痕入口，只表示未获玩家选择前不能擅自把拒绝请求变成已落地的 mark；例如拒绝凭空钱款后，不能把画出来的钱当真币结算。
- `constructor=true` 表示玩家在无 LLM 模式下能用“做什么／对谁或什么／用什么／怎么做”表达可受理的尝试，并通过同一管线得到裁决或受限结果；包括构造器优先转注册动作、逐步构造组合、选择留痕形态和标签。它不保证掷骰成功或 NPC 同意。`false` 表示原要求当前须澄清或拒绝，不能完整完成；获澄清或选择降级做法后可另行构造。

组合题 075—080 以 `open:proposal` 标整个意图，内部步骤仍须按 06 §6.8 分别路由注册动作。前序取得的物品、钱或许可必须实际成立才能用于后序，明确要“等我确认”的步骤不得代确认；不是把所有步骤、旅行和等待压为无耗时的一次变化。104 的两次花钱不可完整达成；若执行协议已逐步提交前笔，后笔仍须余额校验失败，不能为满足原话复制余额，也不能擅自声称前笔已回滚。

## 刁钻类型清单

下表每条只计入一个主类型；跨类型含义保留在各题 why 中。

| 主类型 | 编号末三位 | 条数 | 要观察的边界 |
|---|---|---:|---|
| 越权处分、冒充同意、任职、稀释、撤销通缉 | 081、082、098、105—107 | 6 | 本人、真实来源方、职位和章程权限不能由玩家一句话代填 |
| 隔空操作远处自有物 | 083 | 1 | 所有权不能替代物理可达或显式运输载体 |
| 资源守恒与重复花费 | 084、103、104 | 3 | 不得造钱、补虚构材料或用同一余额付两笔 |
| 模糊指代、含混目的、自相矛盾 | 085—087 | 3 | 返回候选或问题，不猜测原意，不先施加效果 |
| 工具和能力幅度 | 088、102 | 2 | 石工与木工工具不匹配要拒绝，练功收益过大要裁剪 |
| 在押行为及脱逃 | 089—091 | 3 | 保留交谈能力，脱逃需对抗，普通移动不能离开牢房 |
| 不存在的目标 | 092 | 1 | 不得临时生造敌人和奖励来满足击杀 |
| 元游戏改规则与倒退时间 | 093、094 | 2 | 骰值、境界和世界时序不能由指令直接覆盖 |
| 不应过度拒绝的有后果行为 | 095—097 | 3 | 实际占有者无权处分、盗窃、无同意治疗分别走效力、检定和对抗 |
| 沟通、读写及授艺能力 | 099—101 | 3 | 手势不签复杂合同，不识字不能读懂，昏迷者不能授艺 |
| 知情与信念真相边界 | 108、109 | 2 | 不开放全局秘密，不直写belief，更不能因此生成真实债务 |
| 未来 NPC 自主决定 | 110 | 1 | 排期只是未来请求，届时仍须 NPC 决策 |
| 创意兜底与持续系统反应 | 111—120 | 10 | 歌谣、警示、剑痕、草图、界标、酒令、纪念、假机关、漫画、供台各有不同载体与目的 |
| 合计 | 081—120 | 40 | 其中合法尝试、违法尝试、裁剪、拒绝、澄清都保留 |

## route 与 signature 的依据

直接依据为工作区 `F:/dnd-wt/A3CORPUS` 的设计文档、用户玩法决定及世界数据。没有读取 `server-plugin/`、`extension/`、`tests/` 内的代码或测试，也没有依据实现运行结果修改预期。强制阅读的 Stop That Shit 技能仅约束交付范围，不提供题目或判定素材。没有调用 LLM 翻译器、引擎测试或原存档。

| 来源 | 本语料的使用方式 |
|---|---|
| `docs/架构设计/06-动作层与开放动作.md` §6.2—6.5 | 两种输入方式共用裁决；提案只能用既定原语，逐项核验真实引用、权限、来源和物理条件 |
| 同章 §6.6—6.8 | 按档位和上限裁剪；违法不预先禁做；明显常用动作优先路由，组合不能规避成本 |
| 同章 §6.9.1—6.9.5、§6.10.4—6.11 | 四步构造器、在押保留能力、主观信息、留痕及其系统反应、拒绝与澄清的返回方式 |
| `docs/架构设计/05-统一模型.md` §5.1、§5.2.7、§5.3—5.4、§5.6—5.7 | 经济转移和制造守恒、案件受理与执行、组织权能、知情集合、立场投影与 NPC 自主答复 |
| `docs/架构设计/附录A-术语与枚举.md` §A.3、§A.6、§A.15.7、§A.15.9—12、§A.15.20—24 | 受限与失能、原语、饮食睡眠、权限与实际占有、同意、语言、争夺、拘禁制度 |
| `docs/架构设计/13-超自然与文化圈.md` §13.5 | 仪式角色、材料、资格、时窗和真实效力，不把自创供台变为保证降雨 |
| `docs/待用户确认.md` 2026-10-15、2026-10-16 已定玩法 | 无 LLM 也完整可玩、尊重创意但守住世界原因、慢成长与长期进阶 |
| `world/actions/core.json` | 只用世界侧目录的 ID、标签、同义词、槽位确认明显动作；不用旧工具名充当动作 ID，不追读 source 所指实现 |
| `world/ontology/{holdings,obligations,tags}.json` | 核对住宿、许可、债务与 mark 标签；只用已列出的具体 mark 标签 |
| `world/geo/locations.json`、`world/people/{baseline,residents}.json` | 河湾村、白石镇、青灯酒馆、旧渡口、林穗、阿砚、许苓、吴朔等名称和身份素材 |
| `world/meta/{items,recipes,spells,skills}.json` | 食物、工具、工序册、配方与法术能力边界，避免把净水当除尽毒素、光投影当燃料 |
| `world/lore/{faith,family-law,sovereignty}.json` | 本地仪式和组织制度背景；具体案件罪名、罚款与效力仍由适用规范栈裁决，不在题目中杜撰通用刑罚 |

06 章举例的 `lend`、`break_in` 等是设计示例，未凭名称自行添加为当前动作 ID；例如借贷采用世界目录的 `core:trade.lend`。开放组合按设计原语表达，不因当前实现尚缺接点而改成“不支持”。`core:look` 是读场景；借用 `core:check` 单独掷骰不能替代开放行为实际写入世界后果。

签名保留裁决责任边界：修理是 `fact.set`，进食是 `transfer + vital`，以物和钱交易是互逆 `transfer`，配方计量制造是内部守恒转移，即兴物品是有材料的 `create`，艺术留痕是无资源账户的 mark；社交先 `emit`，授艺用 `learn`，持有与债务用对应原语。案件的受理、NPC答复与社会连锁按各自规则条件生成，签名中列出的条件性效果不能由自由提案直接越过这些规则写入。

## 已完成的检查与交接

已检查 JSON 可解析、120 个顺序且唯一的 ID、120 条不重复原话、全部要求字段、布尔类型、动作 ID 是否在允许读取的世界目录、签名原语是否属于 06 §6.3；统计由 JSON 计算。逐条核对了原话与标注，特别修正住宿为 `lodges`、借刀使用真实许可而非虚构持有种类、工具完全不适配时拒绝完整修复要求。

这份交付是独立出题与设计预期，不是引擎通过报告。未运行仓库测试，未部署、未提交、未改仓库；没有创建临时调试文件。两个请求文件均已写完，剩余工作仅是主会话后续将场景条件绑定到盲测夹具并运行 A3 验收；该运行不在本卡范围内。
## 2026-10-20 setup 与引用续补

本轮为全部 **120** 条补齐 `setup`，直接覆盖 JSON。原有 120 条 `intent`、`expected`、类别与 tricky 均保持逐值不变；没有因当前实现情况改预期。此前的“56条缺失引用”是 **56个题目、75种不同占位引用**。本轮替换其中 **72种**：**45种换为真实 world ID**，**27种换为 setup 中事先存在的运行实体/记录的唯一指代**；按 proposal 中具体字段或字典键出现次数计，分别为 85 处、32 处，共 117 处。现在只有 084、092 两题保留故意不存在的引用，共3种。

### setup 的执行口径

每题独立初始化，`location` 全部是 `world/geo/locations.json` 中真实地点，`present` 中静态人物/生灵目录引用来自 world，`inventory` 的键全部是 `world/meta/items.json` 的物品 ID；数量和 coins 是本题起始状态，`minute` 是当天分钟。除明确例外，玩家是清醒、可行动的成年人；列出的物品没有另行声明损坏、受污染时为可用状态，目录库存须落实为唯一实物/批次。

`facts` 是**动作前必须落实的场景条件**，不是玩家自述、动作后结果或“引擎默认批准”。它承接 NPC 库存与余额、双方语言、技能魔力、已有许可/真实同意事件、床位、案件、账目、工具位置和分区。不要只把 facts 当旁白。未写明的同意不能补齐，NPC 请求结果、学习/战斗/逃脱检定与后续系统反应均不得预先写成成功。场景覆盖只作用于本题副本，不改 world 原始数据或其他题。

静态世界目录不可能预存“这个玩家欠林穗的债”“本人有效通缉”等运行记录。032、035、037、040、049、052—057、073、078、081、088—090、095、105、107 等题因此采用 **唯一中文指代**，与原提案已有的“旁边墙根”“已租床位”一样交实体解析。setup 必须先创建/载入所述既存记录，保存实际生成的 ID，绑定中文指代，再提交 proposal；不能拿 bank、NPC、罪名或 holding 种类 ID 冒充记录 ID，也不能将中文名称直接当已存在的 ID。06 §6.5 的引用解析要求仍适用；这不是新增 proposal schema 或要求引擎支持某种新 selector。

009 的 `monster_bent_horn_goat` 是物种目录 ID，在本题唯一映射到已经驯养的一个山羊个体，不临时增加第二只。073 的水盏役灵是已有召唤生成的动态个体，其在场与契约均在 facts 中，不能把 `spell_summon_04` 当生灵 ID 塞入 present。运行实体的实际 ID 不伪装成来自静态 world 的 ID。085 的两只瓶必须保持两个可选实例，不能做唯一绑定。

066 的可拆机关、088 的石城门、089—091 的拘禁室和锁、105 的白石镇职位，以及117的旧鞋、120的野花，静态 world 没有一一对应的具名实例。依06 §6.3及通用实体模板，在场景初始化中落实为题意已有的 thing/office 实体或地点内分区，使用唯一中文指代，并在 facts 写明材质、位置、权限与状态；这几条不是测试不存在目标。尤其不拿断夹当活动机关、不拿村长职位冒充白石镇长、不拿靴撑/鞋垫当鞋，也不假称静态目录存在旧鞋或花束商品。117、120的动态自有材料放在 facts，inventory 不填写编造的物品 ID；在提交提案前须绑定和记入真实材料账，动作后从玩家可消费物中移除，不能再用一次。

本轮只按世界数据和设计搭建独立题目，不读实现或测试。引用核对使用正式 world 目录（不拿 drafts 或实现审计材料作为可用 ID 来源）；`self`、`world`、`practice`、`sink:consume`、`sink:craft` 等设计保留引用，状态、动作参数和词汇标签不误当普通实体 ID。`fire_projection` 是 `spell_summon_05.effectSpec.summonType` 已有模板词，不是新造生灵 ID。

016、102的未具名基础吐纳，本轮具体绑定为三息定桩的呼吸训练，setup明确玩家已经掌握；101则是同功法尚未学会且教师昏迷。057的拘禁东道使用collective类型的loc_bs，镇巡值房仅作执行驻地；106使用既有盐舟商会及其首领的股权场景，未拿建筑所有权代替商号股权。上述修订只消除未具名条件，不改变expected。

### 必须保持缺失的反例

| 题号 | 保留引用 | 必须保持的场景 |
|---|---|---|
| 084 | `missing:money_source` | 玩家0铜，无收入、赠与、贷款或铸币来源；这是故意不存在的资源来源。 |
| 092 | `missing:purple_crystal_dragon_king` | 紫晶龙王在世界中不存在，不创建实体、种群或别名来凑击杀。 |
| 092 | `missing:dragon_reward_funder` | 无真实杀龙委托与奖励出资者，不生成奖励账户。 |

“不存在目标”狭义为092一题中的紫晶龙王；连同其奖励出资者与084无源钱款，保留**3种不存在引用、2题**。083的木杖真实存在但远在白石镇，不加入玩家库存；099无通译、100不识字、101教师昏迷、103材料不足、104只有一铜等负面前提全部保持，不用“补场景”让原要求成立。

### 替换明细

| 原引用（省略 missing:） | 本轮绑定 | 方式 | 题号 |
|---|---|---|---|
| `own_pet` | `monster_bent_horn_goat` | world ID | 009 |
| `known_basic_breathing_skill` | `skill_monk_combat_01` | world ID | 016、102 |
| `research_project_template` | `interim` | world ID | 019 |
| `crude_pot_stand_template` | `thing` | world ID | 029 |
| `present_pawnshop` | `bank_hw_post` | world ID | 036、037 |
| `baishi_recipient` | `npc_hw_yanzhe` | world ID | 038 |
| `present_buyer` | `npc_hw_yanzhe` | world ID | 039、080、081、095 |
| `present_nanshi_merchant` | `npc_hw_yanzhe` | world ID | 044 |
| `present_interpreter` | `npc_hw_shendu` | world ID | 045、080 |
| `present_foreign_merchant` | `npc_hw_yanzhe` | world ID | 045、099 |
| `present_blocker` | `npc_hw_zhengshuisheng` | world ID | 046 |
| `witnessed_thief` | `npc_hw_wushuo` | world ID | 051 |
| `own_grain_sack` | `item_grain_sack` | world ID | 051 |
| `held_theft_evidence` | `item_parchment` | world ID | 051 |
| `new_receipt` | `item_parchment` | world ID | 052 |
| `authorized_collector` | `npc_bs_032_1` | world ID | 054 |
| `present_advocate` | `npc_hw_luqing` | world ID | 055 |
| `cargo_carrier` | `npc_bs_016_1` | world ID | 056 |
| `cargo_handover_receipt` | `item_parchment` | world ID | 056 |
| `present_suspect` | `npc_hw_wushuo` | world ID | 057 |
| `local_custody_authority` | `loc_bs` | world ID | 057 |
| `present_case_officer` | `npc_bs_032_1` | world ID | 058 |
| `present_attacking_adult` | `npc_hw_wushuo` | world ID | 059 |
| `adjacent_armed_enemy` | `npc_hw_wushuo` | world ID | 062 |
| `visible_enemy` | `npc_hw_wushuo` | world ID | 063 |
| `own_burning_box` | `item_bottle_divider_crate` | world ID | 064 |
| `held_water_bucket` | `feature_hw_kitchen_bucket` | world ID | 064 |
| `carried_disarm_tools` | `item_smith_tongs` | world ID | 066 |
| `present_water_bucket` | `feature_hw_kitchen_bucket` | world ID | 068 |
| `own_water_bucket` | `feature_hw_kitchen_bucket` | world ID | 079 |
| `present_adult_cellmate` | `npc_hw_wushuo` | world ID | 089 |
| `present_victim` | `npc_hw_yanzhe` | world ID | 096 |
| `present_unconsenting_adult` | `npc_hw_wushuo` | world ID | 097 |
| `new_cultivation_skill` | `skill_monk_combat_01` | world ID | 101 |
| `unconscious_master` | `npc_bs_076_3` | world ID | 101 |
| `present_baker` | `npc_hw_linsui` | world ID | 104 |
| `shared_business` | `faction_saltboat` | world ID | 106 |
| `other_shareholder` | `npc_w5_saltboat_leader` | world ID | 106 |
| `authorized_drawing_board` | `item_pine_board` | world ID | 112 |
| `authorized_display_place` | `bld_hw_mill` | world ID | 113 |
| `current_drawing_place` | `bld_hw_school` | world ID | 114 |
| `current_unowned_camp_plot` | `loc_hw_northwood` | world ID | 115 |
| `authorized_memorial_tree` | `loc_hw_orchard` | world ID | 117 |
| `authorized_corner` | `bld_hw_qingdeng` | world ID | 118 |
| `authorized_wellside` | `site_w5_well_camp` | world ID | 120 |
| `own_deposit` | `本人在小驿站汇兑柜的唯一未结清存款` | setup运行实体/记录的唯一指代 | 032 |
| `own_debt_to_linsui` | `本人欠林穗的唯一三十铜借款` | setup运行实体/记录的唯一指代 | 035 |
| `own_pawn_loan` | `本人以旧木杖质押的唯一未结清借款` | setup运行实体/记录的唯一指代 | 037 |
| `own_staff_pledge` | `该旧木杖在小驿站汇兑柜的有效质押持有` | setup运行实体/记录的唯一指代 | 037 |
| `ayan_debt_to_self` | `阿砚欠本人的唯一十铜借款` | setup运行实体/记录的唯一指代 | 040 |
| `own_ten_coin_debt` | `本人欠林穗的唯一十铜借款` | setup运行实体/记录的唯一指代 | 049 |
| `own_judged_case` | `本人在白石镇公署已判决的唯一财物案` | setup运行实体/记录的唯一指代 | 052 |
| `past_theft_incident` | `本人昨日在青灯酒馆偷走一份干粮的事件` | setup运行实体/记录的唯一指代 | 053 |
| `own_fine` | `镇巡值房对本人唯一已生效的十铜罚款` | setup运行实体/记录的唯一指代 | 054 |
| `own_case` | `白石镇公署受理的本人唯一在办案件` | setup运行实体/记录的唯一指代 | 055、107 |
| `local_cell` | `镇巡值房内本案使用的拘禁室` | setup运行实体/记录的唯一指代 | 057 |
| `valid_arrest_basis` | `本案已生效且指向吴朔的拘捕决定` | setup运行实体/记录的唯一指代 | 057 |
| `acting_arrest_office` | `本人当班持有的镇巡拘捕执行职位` | setup运行实体/记录的唯一指代 | 057 |
| `reachable_trap` | `北林废观测塔入口已发现的绊索落木机关` | setup运行实体/记录的唯一指代 | 066 |
| `own_summon_upkeep` | `本人在场水盏役灵的唯一维持义务` | setup运行实体/记录的唯一指代 | 073 |
| `own_present_summon` | `本人在场的唯一水盏役灵` | setup运行实体/记录的唯一指代 | 073 |
| `wushuo_due_debt_to_self` | `吴朔欠本人的唯一到期五十铜借款` | setup运行实体/记录的唯一指代 | 078 |
| `self_debt_to_linsui` | `本人欠林穗的唯一三十铜借款` | setup运行实体/记录的唯一指代 | 078 |
| `other_owner_qingdeng_owns` | `林穗对青灯酒馆的有效所有权持有` | setup运行实体/记录的唯一指代 | 081 |
| `present_stone_city_gate` | `环城现役城门的开裂石砌门体` | setup运行实体/记录的唯一指代 | 088 |
| `cell_lock` | `镇巡值房本间拘禁室的门锁` | setup运行实体/记录的唯一指代 | 090 |
| `self_detained` | `本人受镇巡值房拘禁的有效持有` | setup运行实体/记录的唯一指代 | 090 |
| `borrowed_knife_owns` | `阿砚对本人借用的削木小刀的有效所有权持有` | setup运行实体/记录的唯一指代 | 095 |
| `office_bs_town_head` | `白石镇现任镇长的职位` | setup运行实体/记录的唯一指代 | 105 |
| `self_wanted` | `镇巡值房针对本人当前案件的有效通缉持有` | setup运行实体/记录的唯一指代 | 107 |
| `own_unwearable_shoe` | `本人携带的唯一一只破底旧鞋` | setup运行实体/记录的唯一指代 | 117 |
| `own_flowers` | `本人携带的一束无毒野花` | setup运行实体/记录的唯一指代 | 120 |

### 交接

两个请求文件已完成写入。检查包含 JSON 可解析、120条逐一有 setup、地点/在场目录/库存 ID 存在、金额与分钟范围、proposal 具名静态引用、故意缺失集合，以及 intent/expected 等原有标注未改变。未运行仓库测试或实际引擎；没有提交、部署、修改仓库文件或原存档。主会话运行盲测前须将 facts 中的动态记录与实物实际建好并解析绑定，不能只导入四个顶层 setup 字段后把其余前提遗漏。

## 2026-10-21 木工考官与环城治理续审（020、088最新口径）

| 题号 | 原意、依据与修正 |
|---|---|
| A3V2-020 | 原文“我已经满足本地木工执业的申请条件，想去行会办个正式认证。”要求正式认证，不限于找登记员转交，因此保留原expected。world/lore/factions.json的faction_lampbridge.offices中office_exam_life_6任命npc_hw_yinge，席位bld_bs_guild，接待540—720分钟；保持本场600分钟，present补入尹葛，与严辙同场，120分钟考核至720分钟结束。baseline保留尹葛原劳动、家务、休息作息；当前接待由职位派生，现有tests/world-content2.test.mjs明确约定600分钟到联络处、780分钟回磨坊，不应把baseline默认劳动地点当成当值接待地点，也不手改作息。保留原考官选择器、20铜、本人作品与passed=false，认证须经真实考核；撤回旧记录“无真实考官来源”的判断。 |
| A3V2-088 | 05 §5.3规定治理为组织特例，首长权限来自当前职位。world/lore/factions.json已登记环城郡署faction_huancheng_government、公共城墙与石门治理职责及现任首长npc_hc_yicen。自建门体owner改为郡署，既有许可issuer和同源历史actor改为本场现任首长；地点loc_far_huancheng仅保留为空间位置。许可范围inspect_and_attempt_repair、期限599—2040、来源事件、门体condition=40与空间字段均保留；初学木工、小刀无法整门瞬间修复的expected拒绝不变。撤回旧记录把地点当治理主体的设定，空间问题仍归S4。 |

验证：JSON可解析，120个ID唯一；仅020、088发生变更，其余118题逐值不变；全部id、intent、expected、proposal逐值不变。020考核结束不超过接待时段，未预置通过；088产权归组织，签发者与事件行为人一致。未运行A3评分；现有测试内容仅用于核对职位派生作息的既定约定，不将阅读断言写成测试通过。只修改本JSON和本复审记录，不改世界、工作区文档、测试或实现，不部署、不提交。

本轮CORE交接：按指定摘要过滤运行engine/storage/plugin（spec reporter，TEMP/TMP=F:/dnd-tmp），命令已结束但过滤结果未捕获pass/fail，不能据管道退出码宣称通过；请主会话补核。临时编辑脚本已删除，git status为空，未结束任何进程。下一步由主会话同步语料并复跑020、088评分；本轮未修改评分夹具。

## 复审记录

2026-10-20，独立复审 `a3-gap-v2d.md` 的“语料预期存疑”21条，并逐条对照 `a3-score-v2d.json` 的 expected/actual。裁定：**维持15条，修改6条**。依据仅为本工作区设计、用户已定玩法、世界动作目录及原题的 intent/setup/proposal；没有读取 `server-plugin/`、`extension/` 或测试代码。

两项口径须分开：

1. **拒绝题的原签名维持为待检查的请求作用域。** 06 §6.5先解析、路由，再校验裁剪、按档位应用；§6.8以提案原语多重集路由；§6.11还明确T0/T1可直接取语料签名作为桩翻译输入。因此“提案签名非空”和“拒绝后 applied 为空”同时正确。本文件原“使用口径”已明确拒绝题签名不是应执行的副作用。不能为了与实际空回执相等，把这15条待拒绝的要求删为空签名；也不能把原签名当作越界成功要求。实际无提交只证明未落地，正确拒绝还须核对场景与世界内原因，不能由任意早期报错替代。
2. **六条请求题改为本次已提交阶段的签名。** 011/033/036明确先询价；047先听答复；076的借刀后续受真实同意约束；080明确保留玩家再次确认。原签名把本次请求和条件性后续混在一个平面数组中，缺少阶段边界，现将后续义务写进 expected.why，不要求当前请求产生后续效果。这不是删除完整意图：NPC答复、报价、译文须有真实来源，接受之后的授艺、借贷、质押、制作返还及交易仍须按原条件履行。只有 emit 的回执不能证明整段意图、NPC决策或构造器全流程完成。

下表“原预期”列保留原 route 与 signature（数组内依原顺序列出）；原 why 的设计约束在“依据”中逐条复核。六条请求题原标志均为 `outOfBounds=false / fallback=false / constructor=true`，十五条拒绝题均为 `true / false / false`，本轮全部不变。未列条目不改。所有依据中的章节号均指 `F:/dnd-wt/A3CORPUS/docs/架构设计/`；目录指 `world/actions/core.json`。

| id | 原预期 | 裁定 | 依据 |
|---|---|---|---|
| A3V2-011 | `core:learn`；`emit(person:npc_hw_xuling,request:teach_spell_light)`、`learn(person:self,spell_light:teacher)` | **修改**：route=`open:proposal`；signature只保留原emit；更新why说明后续授课前置。 | 06 §6.3规定request不决定答复、learn须有效来源，§6.9.2允许先看条件再接受。原话“先问清学费再决定”不授权本次学习；目录core:learn是师授/读书/研究，未声明单独报价模式。actual的emit符合请求阶段，但尚不能证明真实报价或授课完成。 |
| A3V2-033 | `core:trade.borrow`；`emit(org:bank,request:loan)`、`obligation.create(person:self->bank,loan)`、`transfer(resource:coin,bank->self)` | **修改**：route=`open:proposal`；signature只保留原emit；更新why保留签约决定。 | 06 §6.3的债务和转账分别需要同意与真实动用权，§6.4、§6.9.2区分条件答复和接受。原话“合适我再签”，不能预先成债或放款；目录借钱动作不等于询期限利息。actual只提交request，不证明银行已给出条款或贷款完成。 |
| A3V2-036 | `core:trade.pawn`；`holding.open(thing:own_item_staff,pledged)`、`obligation.create(person:self->pawnshop,loan)`、`transfer(resource:coin,pawnshop->self)` | **修改**：route=`open:proposal`；signature=`["emit(org:bank_hw_post,request:pawn_quote)"]`；更新why。 | 06 §6.3的emit与持有、义务、转账分别承担请求和成交，§6.9.2保留接受条件。setup明确尚未同意报价、交杖或放款，原数组反而漏了当前估价请求。本场柜台的质押授权仍须真实建立；有授权和自有木杖也不等于已成交。actual的询价不能证明估价完成。 |
| A3V2-047 | `core:dialogue.guide`；`emit(person:npc_hw_zhengshuisheng,request:guide)`、`obligation.create(person:npc_hw_zhengshuisheng->self,service:conditional_on_acceptance)` | **修改**：保留route；signature只保留原emit；原条件性service转入why明确为接受后的要求。 | 06 §6.9.2明确“请求带路”，目录也有core:dialogue.guide；05 §5.7的答复可为同意、有条件同意、拒绝或拖延，不能在未取得答复时固定要求义务。原条件限定本身正确，修改仅消除阶段混合。actual为needs_slots/clarify，不能据此把已知带路意图永久改判clarify；具体渡河点可经NPC知情答复补齐。 |
| A3V2-076 | `open:proposal`；`emit(person:npc_hw_ayan,request:borrow_tool)`、`holding.open(person:npc_hw_ayan,permit:self_use_knife_if_accepted)`、`move(thing:ayan_knife,to:self_if_accepted)`、`transfer(resource:item_wood,self->sink:craft)`、`transfer(resource:item_wooden_peg,recipe_wooden_pegs->self)`、`move(thing:ayan_knife,return_to:npc_hw_ayan)`、`holding.close(holding:knife_use_permit,returned)` | **修改**：保留route；signature只保留原emit；完整后续条件写入why。 | 06 §6.3、§6.7要求真实许可、实物交接及制造投入，§6.8要求后续各步各自路由。当前proposal仅请求借刀且setup明确阿砚未答应，不能要求它已经制造并还刀。许可、交刀、耗材制造、返还原刀、关闭许可都继续是接受后的必需结果；actual只有emit，整段组合仍未验完。 |
| A3V2-080 | `open:proposal`；`emit(person:present_interpreter,request:translate_terms)`、`emit(person:self,tell:translated_terms)`、`transfer(resource:item_clay_cup,self->buyer:2)`、`transfer(resource:coin,buyer->self)` | **修改**：保留route；signature只保留原翻译请求emit；更新why保留译文来源与再次确认。 | 06 §6.3规定request不能替他人答复；§6.9.2及附录A §A.15.21要求通译产出真实tell并保留双方同意。原话“等我确认接受”，排除本次两项交易。目录core:dialogue.interpreter标“找通译”，不能覆盖已经在场通译的翻译加后续交易；actual路由到它且applied为空，不是本裁定的通过证据。 |
| A3V2-081 | `reject`；`holding.transfer(holding:other_owner_inn,new_holder:buyer)`、`transfer(resource:coin,buyer->self)` | **维持全部expected**。 | 06 §6.3 holding.transfer及附录A §A.15.12：既无处分权也不占有必须拒绝，不能与095实际占有者的无权处分混同。非空签名记录须阻止的售房和收钱；actual无提交正确，但E-OPEN-TRANSFER只显示账户门槛，不能证明已核验酒馆处分权。 |
| A3V2-082 | `reject`；`transfer(resource:coin,npc_hw_linsui->self)`、`obligation.create(person:self->npc_hw_linsui,loan)` | **维持全部expected**。 | 06 §6.4与附录A §A.15.20：同意来自真实本人/有效代理等来源，玩家不能冒填林穗同意。原签名是这次伪造借款的检查对象，非应采用效果；actual因伪造consent拒绝且无提交，与拒绝要求一致。 |
| A3V2-083 | `reject`；`move(thing:remote_own_staff,loc_bs->self_at_loc_hw)` | **维持全部expected**。 | 06 §6.3 move要求可通行路线并禁止无来源瞬移，所有权不提供远距搬运能力；setup明确木杖在白石镇且无运输/传送。actual无提交可接受，但not_perceivable指向effects.0.to，不能代替对真实远处木杖和运输条件的核验。 |
| A3V2-084 | `reject`；`transfer(resource:coin,nonexistent_source->self:100)` | **维持全部expected**。 | 06 §6.3 transfer与§6.10.5要求来源账户真实且余额足够，不准提案动用src。非空签名用于识别凭空造钱，不能变为可提交效果；actual以来源不存在拒绝符合题设，不应为测通过创建钱源或改成画币。 |
| A3V2-092 | `reject`；`vital(creature:nonexistent_purple_dragon,harm)`、`transfer(resource:coin,unfunded_reward->self)` | **维持全部expected**。 | 06 §6.5第1步、§6.10.5要求目标与资金来源真实。题面已确定不存在，不是未知具名实体待登记；既不能造龙也不能造赏金。actual未知目标拒绝且无提交符合这一要求，非空签名保留伤害和索奖两项越界范围。 |
| A3V2-093 | `reject`；`fact.set(person:self,derived_progression:forbidden_override)` | **维持全部expected**。 | 06 §6.2第5条、§6.3 fact.set白名单与§6.7：成长、幅度与骰值由引擎规则产生，普通玩家的管理员口吻不授予改规则权。actual白名单拒绝可防止落地；最高境界与固定骰值两种要求仍均须无效，签名不代表允许覆写。 |
| A3V2-094 | `reject`；`time(world,minutes:negative)` | **维持全部expected**。 | 06 §6.3 time要求单调且耗时由动作派生；保留资产收益又倒流一天违反时序。actual因提案自定耗时拒绝且无提交符合边界；签名保留负时间请求，不能为匹配空回执抹去被测语义。 |
| A3V2-098 | `reject`；`learn(person:self,spell_light:forged_teacher_source)` | **维持全部expected**。 | 06 §6.3 learn及§6.4来源方同意：许苓拒教、未演示、无书，既无正常授艺也无可观察来源。actual拒绝冒填同意正确；不准把完整师授改成不存在的旁观学习，更不准采用learn。 |
| A3V2-099 | `reject`；`obligation.create(person:self->present_merchant,loan:complex_terms_without_language)` | **维持全部expected**。 | 06 §6.3 obligation.create与附录A §A.15.21：沟通度0的手势只能表达有限等价交换，不能签两年浮息等复杂义务。actual笼统要求真实同意和贷款登记，并未独立证明语言检查；原题仍应保留语言、复杂条款与无通译边界。 |
| A3V2-100 | `reject`；`learn(person:self,unknown_spell:unreadable_book)` | **维持全部expected**。 | 06 §6.3 learn及附录A §A.15.21：书存在不等于canRead；完全不识字、无翻译/演示时不可直接学会。actual笼统要求注册学习入口，只证明未提交，尚非对不可读来源的完整验证；不得把签名清空后宣布阅读能力边界已测过。 |
| A3V2-101 | `reject`；`learn(person:self,new_cultivation_skill:impaired_teacher)` | **维持全部expected**。 | 06 §6.3 learn明确来源方失能不能授艺；附录A §A.3区分失能与仅受限。师父存在且会功法也不消除昏迷，无其他来源。actual泛化学习入口拒绝不证明识别昏迷；须继续保留该来源能力反例。 |
| A3V2-104 | `reject`；`transfer(resource:coin,self->baker:1)`、`transfer(resource:coin,self->boatman:1)` | **维持全部expected**。 | 06 §6.3 transfer每次均需余额足够，一铜不能支付两次一铜。当前单个proposal不能预览为完整可行；若协议另行分步且前笔已提交，后笔仍须失败，不假称前笔回滚。setup已给双方真实成交同意，actual的账户/授权拒绝不能替代累计余额检验。两笔请求签名保留，绝不要求两笔都应用。 |
| A3V2-105 | `reject`；`holding.open(person:self,holds_office:town_head)`、`transfer(resource:coin,town_treasury->self)` | **维持全部expected**。 | 06 §6.3 holding.open/transfer及附录A §A.15.9要求真实任命和公款动用权；自称镇长不产生职位或调库权限。actual not_perceivable:target只表明前置阻挡，未证明任职权能闸门；不能把正确无提交等同于权能边界验收。 |
| A3V2-107 | `reject`；`holding.close(holding:self_wanted,unauthorized)`、`fact.set(collective:own_case,erase_history:forbidden)` | **维持全部expected**。 | 06 §6.3对法律类持有关闭的专门权能要求及05 §5.2.7的案件程序，不允许普通被追诉者自行撤销通缉或删案件史。actual fact.set白名单拒绝阻止落地，但两项禁止要求均保留；合法申诉或有权撤销不等于抹历史。 |
| A3V2-109 | `reject`；`fact.set(person:npc_hw_wushuo,belief:forbidden_write)`、`obligation.create(person:npc_hw_wushuo->self,fabricated_loan)` | **维持全部expected**。 | 06 §6.3事实白名单、债务同意/规则来源及05 §5.4的belief推断边界：不沟通、不施法不能直写吴朔信念，信念也不能创造真实债务。actual fact.set白名单拒绝可阻止该提案；原两项签名继续标明须阻止的信念覆写与假债，不允许采用其中任何一项。 |

本次修改后，route统计为已注册动作72、open:proposal 26、reject 19、clarify 3；其余分布与三个标志计数不变，替代前文初稿的route统计。JSON仅改011、033、036、047、076、080的expected；十五条维持项逐值不变。未修改判分器或判分结果，未运行引擎测试、部署或提交，也未创建临时调试文件。后续判分需按上述阶段与签名口径解释，不能把本次复审当成新一轮引擎通过报告。

## 2026-10-20 能力与七条 setup 复审

本轮依据 v2f 的37条“前置未成立”和7条setup错误核对题意，并把同类明确已有能力的020、029、065、076、077、079、088一起落实；015、100只显式保存识字0，不补阅读能力。expected、原话、类别、tricky、原有库存和钱数全部逐值不变。009仅将proposal的物种占位同步改指唯一宠物实例，其他proposal及其说明不变。

### abilities 的口径与取值

`setup.abilities`只描述玩家动作前已具备的能力。`skills`是目录技能ID到熟练度的映射，`spells`、`recipes`是已学目录ID，`licenses`是已取得的职业认证ID或已加载的本场权利记录ID。只在已知识字程度时填写数值`literacy`，并与`skills.skill_literacy`一致；省略literacy表示本题未指定，不能自动当成识字100或识字0。未列技能、法术、配方、许可不得由意图临时授予；空数组也不表示任何默认全能资格。

技能、法术、配方、职业来自`world/meta/{skills,spells,recipes,professions}.json`。1、10、100沿原setup声明；063/072的一阶施法技能取300，065/071的二阶取600，依据`world/meta/rules.json practice.stageSize=300`，并落实已持有的`profession_mage`认证。熟练度上限仍为2699，不改变施法幅度、成功率检定或成长上限。014/018识字100依据`skill_literacy`和`rules.books.minimumLiteracy=100`；canRead仍需附录A §A.15.21的文书语言条件，原题“能读懂”所指共同文字必须由夹具落实，不能仅因数字100就开放陌生文字。

013补照明术和技能；016/102补原已掌握的三息定桩（分别100/1）；017只补已有织布基础10，不给苏岚新增授艺资格或授课同意；019/020/027/028/029补原有手艺；021—026、076、103补已学配方及原有制作技能；030、063、065、067—072、077、079、097补对应已学法术及技能。097继续保留目标明确拒绝，不能用能力补齐替代对抗或来源方同意。修理方案不是recipe目录项，027/028不把repair ID塞入recipes；066未给未明示的高阶机关技能。

057的licenses引用`a3v2_057_holds_office`，它是按world的office模板和holds_office种类加载的既有本场任职持有，不是新造通用许可证。其职位、有效拘捕依据及对吴朔的有限职权已结构化；onDuty本身不授权。其他仅以facts指定的场地许可、真实同意和既有权利仍须按原记录加载，不能用一个licenses字符串取代持有、条款或来源事件。

### 必须不补的能力与资格

| 题号 | 本轮裁定 |
|---|---|
| 011、012、014 | 正在请求或进行学习：分别不预授照明术、削木楔配方、纺毛线配方。014只给可读原书所需识字能力。 |
| 015、100 | 识字仍为0；015可听老师口授，100仍无教师、通译或辅助读字法术，且尚不会照明术。 |
| 017 | 旁观织布，不补教师同意或完整师授资格；玩家只有原题已知基础10。 |
| 020 | 满足申请条件不等于已认证，licenses为空，不提前取得profession_life_6。 |
| 081—084、088、095、098、099、101、105—107 | 不补售房/处分/借款代理/远距取物/造钱权；088仍只有木工10和小刀、无石工能力；095不补出售借刀许可；098仍无授课同意或来源；099不补共同语言/通译；101不预学新功法、不唤醒教师；105—107不补任职、增发或删案权。 |
| 102、103 | 两题分别测成长幅度和材料守恒，不是测“未学会”；因此补原本已会技能/配方，但102起始仍为1，103仍只有1份木料。 |
| 113—115、118—120 | 不补高阶剑术、自动灌田配方、地契、真机关伤害、涂墙许可或求雨神通/主持资格。留痕仍只代表题述创意。 |

### 七条 setup 的更正与加载责任

`instances`列出本题开始前已存在、必须加载的个体；`holdings`列出开始前仍存活的持有（kind/holder/subject/terms）。`a3v2_*`是独立场景的稳定引用，须先映射到实际运行ID，不能假称它们是world静态目录ID。这些是语料夹具声明，未声称现有加载器已经支持新增字段；若尚未消费，须报setup缺失并补接加载，不能忽略或拿facts文字算通过。

| 题号 | 更正 |
|---|---|
| 009 | 以world真实可驯养草食物种monster_bent_horn_goat加载唯一既存个体a3v2_009_goat，明确饥饿80、信任30、跟随位置及owns/tamed_by持有。present和proposal均指该个体；物种目录明确可吃item_oats。既有宠物不再扣一次野外种群，不重复造羊。原expected不变。 |
| 106 | 闻禾确在world/lore/factionPeople.json，但属于location=null的远方名册；补同一ID的agent/person实例和本场赴会地点，不用present冒充实例化。补原有玩家0.1/闻禾0.9的share持有，不改成请求后的0.9/0.1，也不赋予增发权。 |
| 057 | status改为player索引的onDuty；已有任职持有、职位和本案范围结构化，状态键不再误当actor。onDuty应落实为当班事实/日程，不注册成法术状态。 |
| 070 | status改为player索引的fear，magnitude=1、remainingMinutes=30；fear依据spell_mind_01.effectSpec.statuses，不是名为fear的actor，也不是失能。补原已学定息术。 |
| 089—091 | 删除顶层confined/conscious布尔值；status.player为空（本题无失能效果），以存活guest_of、mode=detained、host即subject=loc_bs、regime=custody.default表达在押。依据附录A §A.3、§A.15.10、§A.15.24，清醒成年人仍可交谈；牢门、分区与脱逃检定不消失，不提前释放。 |

### 交接

本轮完成内容结构化及七题声明更正；已检查JSON解析、120个唯一ID、能力引用和熟练度范围、施法阶段、股权总和、负例保留，以及expected/原话/库存/钱数不变。没有读server-plugin/或extension/代码，没有运行引擎/CORE、部署、提交或修改只读工作区。下一步由主会话把新增abilities/instances/holdings/status声明加载进真实场景再跑A3；032/034/039/043/051—058/078/095/096的账务、案件、交易服务、修理工序、知情与同意等缺口不属于本轮能力补齐，仍按原差距报告处理。070的本地精神许可应由原施法规则核验，本轮未凭“会施法”虚构许可来源。

本轮有abilities的题号：013、014、015、016、017、018、019、020、021、022、023、024、025、026、027、028、029、030、057、063、065、067、068、069、070、071、072、076、077、079、088、097、100、102、103。变更题号：009、013、014、015、016、017、018、019、020、021、022、023、024、025、026、027、028、029、030、057、063、065、067、068、069、070、071、072、076、077、079、088、089、090、091、097、100、102、103、106。


## 2026-10-20 既成事实结构化续审（v2j 后）

依据 A3E-r7 的24条、A3B-r8 的误澄清/误拒、A3C-r7 设计争议及 a3-score-v2j.json，逐条复核全部120题。只读设计、世界数据和 tools/a3-score.mjs 的 setup 加载函数，没有读取 server-plugin/、extension/ 或动作实现。原 id、intent、库存数量及玩家现金全部保持。未运行评分，不把此次语料修正报告为引擎通过。

### 加载器待支持字段

以下为**夹具输入契约**，不是新的引擎存档 schema，更不是允许提案直接改世界。现加载器顶层只支持 location/present/inventory/coins/minute/status/facts/abilities/instances/holdings；下面字段目前均待执行侧通过原生接口加载，必须报 setupUnmet，不能仅存 notes 后算完成。已有 status/holdings 的扩展消费也列明。先建实体、场景/来源和账户，再建立相互引用的义务/持有/知识；最终核验原生状态与账本，同一声明只加载一次。

| 字段 | 形状与加载要求 |
|---|---|
| history | `[{id,verb,at,source,...事件主体与条款}]`。source=corpus_premise 指题面已有事实，非待执行动作授权。同意必须由 actor 本人、明确 scope/subject/terms/到期/未撤回成立；禁止从 proposal.consent 反填。过往付款与开账只解释初态，不能再扣当前钱或重复产生收入。 |
| accounts | `[{owner,resource,purpose,balance,sourceEvent,seat?,container?,balanceMode?}]`。原生账户开账；银行vault、NPC钱袋与库存、公库分开。balance是本场快照而非追加量；ensure_existing仅要求账户存在，保留已有余额，0不是把公库清空。 |
| obligations | `[{id,kind,debtor,creditor,amount,paid,openedAt,dueAt,sourceEvent,terms}]`。仅旧债；amount单位随kind，loan/deposit/fine是铜，delivery是货件，upkeep的0是无当前欠额。旧银行存款投影与统一义务必须绑定同一债权，不能建两份。当前amount不授权额外未来费用。 |
| documents | `[{id,owner,sourceEvent,obligation?/case?/links?/content?/reviewed?}]`。id指同一itemInstances纸张，不再生成第二张；存单可以是非目录凭证而非额外财富。书证建立来源链，不预判证据被采纳。 |
| cases | `[{id,court,stage,parties,sourceEvent,judgmentEvent?,appealDeadline?,handlerOffice?}]`。原生案件、阶段与真实证据/命令引用；051/053/056没有此字段。 |
| itemInstances | `[{id,template:thing,kind:item,item?,owner,location,inventoryBinding?,condition?,moisture?,damage?,carriedBy?,wornBy?,contents?,...}]`。item为已有目录类型；无item的旧鞋/花/瓶/钱袋按通用模板实例化。inventoryBinding.mode=same_stock要求从原数量绑定，不再加数量；物理位置与法律所有权分离。condition是百分比，需映射该品类真实耐久上限；moisture=60仅固定“湿”的中间值，不能默认为0。 |
| objects | `[{id,template?,kind?,location?,...当前环境状态}]`。有目录ID时更新同一对象，不复制；水量、容量、浊度、微火、锁、机关、门体、床位进入对应原生状态。contents中的inventoryBinding也只引用同一资源。未声明的毒素/盐/病原沿现状，绝不清零。 |
| zones / paths / placements | 分别`[{id,name,location}]`、`[{id,fromZone,toZone,distanceMeters,passable,blockedBy?}]`、`[{entity,zone,...}]`。明确相邻关系与占位；锁住的路径须等锁/门及拘禁规则允许才可通行，不能靠路径记录越狱。 |
| positions / obstacles / hazards | positions为`[{observer,target,distanceMeters,lineOfSight,audible?,audibleTo?,rayMeters?}]`；石墙线段、落石区域分开登记。射线坐标是符合原题的局部夹具几何，不是提案自报命中加成；隐蔽交谈不扩大其他人的知情。 |
| body | `{actor:{mp?,hpDeficit?,satiety?,stamina?,fatigue?,hydration?,safeCarryKg?,age?,conscious?,level?}}`。初始身体字段，hpDeficit由实际maxHp减，不能补治疗结果。量表沿题设100制，具体原生单位由适配器转换。 |
| actorStates | `{actor:{activity?,teachingBusy?,facingAway?,hearingActive?,alertness?,attention?,demonstrating?}}`。初态活动、location、朝向及感知，不关闭常规警觉；不是授予服务权。 |
| abilitiesByActor / vocations / reading / practiceState | NPC真实已有知识、职业与语言；`teaches`或practicalKnowledge不能自动变职业认证。river/coast是本场“河谷话/海岸话”的语言别名，映射真实语种，保持交集为空；canRead还须原生语言/识字校验。练习只建立今日未练/未达上限。 |
| appointments / quotes / workstationAccess | 服务的真实约定、方向/数量/总价/有效期、工位可用及费用。现场交易可以是预约，不强造NPC新职业。025 paid+paymentEvent是旧5铜预付，其他工位费仍待付，不加玩家钱。 |
| examinations | `[{profession,registrar,examiner,minutes,fee,available,passed:false}]`。examiner是本地真实合格考官角色选择器，严辙只有登记转交职权。若不能唯一解析/落实席位，报未满足，不能授严辙考官资格。 |
| permits | `[{id,holder,subject,scope,issuer?,fromMinute?,toMinute?,sourceEvent?,source?,...}]`。003为既有出租资格快照（source=setup.facts），不能生成本次租约。issuer对象 `{role,of}`只选择题面已有的有权人，不是匿名万能授权；必须解析真实权利来源，无唯一对象则报未满足。权限仅覆盖声明操作。 |
| knowledge / mapKnowledge | 事件来源知情或既有地图路线；only主体可见，043野兽已离开视野，089只知入牢前天气。mapKnowledge不授远程接触/搬运能力，不另造跨区捷径。 |
| demonstrations / combats / conversations | 正在织布的可感知片段、未结束战斗、已开始谈话。旁观不是师授，战斗不先结算胜负，谈话不预写回应。 |
| summons / rites | 既有召唤实体与维持契约的绑定、真实当日仪式/主持/时窗/供品。用原生接口建立已有记录，不重施召唤或收第二次成本，不把参与仪式降级成留痕。 |
| 已有 instances/holdings/status 的接点 | office.authority是题述有限职权，任职后才能有onDuty。105任职holder的existing_legal_town_head选择器须解析真实合法现任者，不能使用在场的公署递件姜澄代替；无可解析者须报未满足。037的pledged.holder为pawn_loan债据（instrument），银行仅是债权人与实物保管人。owns/pledged/lodges/wanted须绑定本次真实实体与旧义务/案件；不能孤立落边。101的present表示物理在场，status=昏迷不可被present清掉，也不可因不清醒就把题设判缺失。 |

所有a3v2_*为独立场景别名，绑定原生ID后连同proposal中的引用使用。同一row内后声明的ID允许前向引用。history中的时刻默认本刻前1分钟是题面未定具体时刻的最小夹具取值，绝非额外剧情；明确昨日的053改为当前2040、盗窃600，094改为2340以符合“世界已过一天”。权限有效期/上诉期只取覆盖本场的测试窗口，不修改世界通行法定期限。湿衣60、破杯condition40、两米旁观等未给精确量的值仅实例化题述定性事实，不能据此保证成功。025当前题面没有600度，未采纳报告中的该数值。

### expected 设计裁定

| 题号 | 裁定与依据 |
|---|---|
| 019 | 删立项时的learn，保留create(project)。06 §6.3要求真实学习来源，§6.6研究检定有失败，§6.9.3研究表单不等于已取得研究成果；原proposalNotes本来禁止立项奖励。 |
| 029 | 保留成功分支的材料消耗+粗劣支架，不加checkOutcome=failure。题意是“尝试临时扎”，不是特定失败题。06 §6.6普通失败材料半失、大失败全失，无产物；当前仅emit不能证明失败分支完整，整数损失折算由规则接点处理，不在语料臆造。 |
| 021—026、103 | 投入统一sink:consume，计量产出统一src:craft；01 §1.6/§1.12配方是数据不是账户。按world配方展开022/026投入集合及其他复合资源，每笔真实资源独立；103补成功分支刨屑副产物并去掉实际消耗requested_10的误义。提案中配方声明仍是路由线索，不授权玩家直接动用src。 |
| 021/022/103的检定 | 不加checkOutcome=failure：三题均非专测失败，signature表示成功分支。判分必须分别核验成功与失败：正常失败依配方损失投入、费用/工具磨损，不能产成品或副产物；103至多一批，成功至多4楔+1刨屑。不得换种子重试到成功或补9份木料。 |
| 023/024/026等附带效果 | 06 §6.7“做活带熟练度”与08 §8.4真实applied维持，不为签名删磨损、实践或成本。成功签名列题意核心效果，附带事实按规则核验；此次不硬编码固定骰造成的数值。 |
| 030/067/072、059/062 | 魔力/练习/反击/磨损必须如实保留，不能从回执删掉；照明等可能失败，成功作用不等于每次必达。本轮不按实际掷骰改原签名或预置法术状态。062补真实门侧相邻空位，仍须真实位移/对抗。 |
| 031/038 | bank/local_bank/recipient为语义角色，不替换真实账户ID。038既有facts明确2铜手续费，当前报告实际1铜不能反向覆盖原场景报价；需加载/判分接点处理，玩家52铜维持。 |
| 113/115/118 | 原签名保留mark目标，proposal明确材料消耗不得被隐藏，按01 §1.6及06 §6.9.5核验同一批材料只扣一次；不用删除消耗来匹配核心签名。 |

085/086/087独立补proposal，不看实现、不从expected生成。085保留瓶指称歧义；086目标吴朔确定但动作未定，空effects不表示动作完成；087保留同一张纸同时毁尽/完整的矛盾，不能按顺序赋值当实现了两者。三题仍要求clarify、零消耗零提交。若现入口不承接未定动作，应补澄清入口，不强造攻击/治疗或先替玩家选瓶。

### 逐条复审记录

| 题号 | 前提与边界裁定 |
|---|---|
| 001 | 落实题设身体/魔力初值；不预写恢复或施法成功。 |
| 002 | 落实本场柜台服务/交易约定；不新增职业，不预先成交。 |
| 003 | 落实本场柜台服务/交易约定；不新增职业，不预先成交。 |
| 004 | 已付款住宿持有与唯一床位、相邻路径及疲劳初态；不预先睡眠。 |
| 005 | 落实题设身体/魔力初值；不预写恢复或施法成功。 |
| 006 | 只落实已知、可通行地图路线，不赋远程接触权。 |
| 007 | 落实题设身体/魔力初值；不预写恢复或施法成功。 |
| 008 | 同一陶罐的脚边位置、两米相邻墙根与入院许可；inventory只绑定原物。 |
| 009 | 既有山羊instances/owns/tamed_by与饥饿已结构化，维持。 |
| 010 | 郑水生整理绳索活动落结构，不预定观察结果。 |
| 011 | 可问价但未同意授课；不补授课结果。 |
| 012 | 本人同意、授课安排和导师能力；费用待付，玩家不预先学会。 |
| 013 | 原有结构化事实维持；未声明的能力、授权及结果不补。 |
| 014 | 原有识字能力保留，书本完好/可读及阅读许可，不提前学配方。 |
| 015 | 本人同意、授课安排和导师能力；费用待付，玩家不预先学会。 |
| 016 | 原有功法与今日未练、练习场地，不额外给收益。 |
| 017 | 仅织布过程、旁观许可与可见位置；绝不补授课同意。 |
| 018 | 识字100已存在；补完好课本、可读/今日未满上限，不改学会状态。 |
| 019 | 原有结构化事实维持；未声明的能力、授权及结果不补。 |
| 020 | 登记授权与真实考官席位待解析；不把严辙直接升为考官，不授认证。 |
| 021 | 落实题述工位可用与待付费用；不预置产出、修好或额外材料。 |
| 022 | 落实题述工位可用与待付费用；不预置产出、修好或额外材料。 |
| 023 | 落实题述工位可用与待付费用；不预置产出、修好或额外材料。 |
| 024 | 落实题述工位可用与待付费用；不预置产出、修好或额外材料。 |
| 025 | 原题工位使用条件及费用；025仅预付5铜，不补报告误称的600度炉温。 |
| 026 | 落实题述工位可用与待付费用；不预置产出、修好或额外材料。 |
| 027 | 落实题述工位可用与待付费用；不预置产出、修好或额外材料。 |
| 028 | 落实题述工位可用与待付费用；不预置产出、修好或额外材料。 |
| 029 | 落实题述工位可用与待付费用；不预置产出、修好或额外材料。 |
| 030 | 落实题设身体/魔力初值；不预写恢复或施法成功。 湿衣moisture=60是“湿”的固定中间值，不是已烘干。 |
| 031 | 落实本场柜台服务/交易约定；不新增职业，不预先成交。 |
| 032 | 存款100、有效凭据及银行至少50准备金；玩家仍0铜，不预先支取。 |
| 033 | 落实本场柜台服务/交易约定；不新增职业，不预先成交。 |
| 034 | 只建立本人借款请求/同意事件，不预开本次贷款或转钱。 |
| 035 | 唯一30铜旧借款，当前未偿。 |
| 036 | 落实本场柜台服务/交易约定；不新增职业，不预先成交。 |
| 037 | 2铜未偿质押借据、同一杖的所有权/银行保管/质押；不放玩家库存。 |
| 038 | 落实本场柜台、50铜本金/2铜费报价、异地收款人及兑付网点选择器，不预开汇票；网点须绑定实际世界记录。 |
| 039 | 落实本场柜台服务/交易约定；不新增职业，不预先成交。 |
| 040 | 玩家真实旧债权10铜，尚未免除。 |
| 041 | 原有结构化事实维持；未声明的能力、授权及结果不补。 |
| 042 | 可交谈距离；具体今日经历沿原世界来源，不编完整地图。 |
| 043 | 真实近期目击及本人知情；野兽已离开视野，不为可感知池另放一只。 |
| 044 | 落实本场柜台服务/交易约定；不新增职业，不预先成交。 |
| 045 | 语言集合采用场景语言别名，须映射真实语言；不补共同语言，099无通译。 |
| 046 | 挡路者在狭窄通道，旁有空位，不预写让路同意。 |
| 047 | 只问意愿；不补带路同意、目的地或义务。 |
| 048 | 同一箱内4公斤木料及3公斤单人上限，不先搬走或补协助同意。 |
| 049 | 建立旧欠款；新的日落前承诺仍待本次表达。 |
| 050 | 已开始的谈话仍活动，不提前结束。 |
| 051 | 盗窃、目击、粮袋异地占有与凭据和当班受理；不建case，报案立案待执行。 |
| 052 | 唯一已判财物案、判决来源、期限与未审查新收据；不预设改判。 |
| 053 | minute改2040以容纳“昨日”600时刻旧盗窃；不造已立案件，不清损失。 |
| 054 | 生效罚款案件、10铜义务及代收公账；值房是收款地点，不能当私人钱袋。 |
| 055 | 在办案件、既有讼师资格与愿谈委托；不签费用/服务范围。 |
| 056 | 既存托运及完好接货/破损交付、书证；不造赔偿案件或赔偿额。 |
| 057 | 有效拘捕案件/决定与可达拘禁分区；不提前拘禁吴朔。 |
| 058 | 既有在办案、经办任职与私下可听边界；不补收贿或同意枉法。 |
| 059 | 落实原题敌对、武器/距离；不预定命中、防守或脱离成功。 |
| 060 | 落实原题敌对、武器/距离；不预定命中、防守或脱离成功。 |
| 061 | 落实原题敌对、武器/距离；不预定命中、防守或脱离成功。 |
| 062 | 落实原题敌对、武器/距离；不预定命中、防守或脱离成功。 |
| 063 | 落实原题敌对、武器/距离；不预定命中、防守或脱离成功。 |
| 064 | 真实微火箱体、手边桶及同一份水；不重复开水库存或提前灭火。 |
| 065 | 相邻可尝试窄路和落石仍存在；不提前给石肤或消除风险。 |
| 066 | 登记既存活动机关、调查状态及范围许可，不借锈断捕夹，不授高阶技能。 |
| 067 | 落实题设身体/魔力初值；不预写恢复或施法成功。 |
| 068 | 桶中8升浑水55、可及性与本人净化许可；盐毒病原不被清零。 |
| 069 | 30升源水、干田容量20、通沟和取水许可；未将水送入田。 |
| 070 | 仅补题述魔力；不凭“已学会”补当地精神施法许可。 |
| 071 | 两米可见目标与有效本人施法同意；不预设护盾。 |
| 072 | 落实题设身体/魔力初值；不预写恢复或施法成功。 |
| 073 | 既存役灵与同一维持契约，0仅表示当前无欠额，不取消后续规则维持费。 |
| 074 | 今日仪式、主持资格、参与时窗及允许参与；不给玩家主持权或神赐。 |
| 075 | 落实本场柜台服务/交易约定；不新增职业，不预先成交。 |
| 076 | 落实题述工位可用与待付费用；不预置产出、修好或额外材料。 |
| 077 | 已付款住宿持有与唯一床位、相邻路径及疲劳初态；不预先睡眠。 湿衣moisture=60是“湿”的固定中间值，不是已烘干。 |
| 078 | 两笔独立旧债及吴朔50铜/还款同意；玩家0铜，先收后付。 |
| 079 | 同一桶已转让移至渡口，原后厨不再占有；空桶与30升浑水，未引水净化。 |
| 080 | 语言集合采用场景语言别名，须映射真实语言；不补共同语言，099无通译。 |
| 081 | 酒馆真实归林穗与买方余额；玩家无权且不占有。 |
| 082 | 林穗柜台真实100铜；绝不把提案伪造同意灌入历史。 |
| 083 | 自有杖仍远在白石客舍，不补运输，不进入行囊。 |
| 084 | 零现金、无取款和收入来源为反例；不建立missing:money_source。 |
| 085 | 两只独立同形瓶、各一份可饮液体；输入保留未定指称，不随机选瓶。 |
| 086 | 输入只有已知吴朔与未定“处理”原话，effects空是未定动作，不是已完成无操作。 |
| 087 | 完整纸与真实小火；同一对象同时condition=0/100，必须澄清，不能顺序覆盖。 |
| 088 | 真实condition40整座石门与有限许可；只保留木工10和小刀。 |
| 089 | 真实锁门/拘禁分区与受锁控制的通道；不解拘禁、不关看守感知。 |
| 090 | 真实锁门/拘禁分区与受锁控制的通道；不解拘禁、不关看守感知。 |
| 091 | 真实锁门/拘禁分区与受锁控制的通道；不解拘禁、不关看守感知。 |
| 092 | 龙及赏金来源确定不存在，保持缺失。 |
| 093 | 普通玩家无管理权限，不补管理员实体/授权或预定骰值。 |
| 094 | 改minute=2340落实已过一天；今日交易作为现存5铜/面包来源，不再重复入账。 |
| 095 | 刀实在玩家身上但仍归阿砚，借用不含出售；买方同意/3铜和交易预约单独建立。 |
| 096 | 1米钱袋、10铜、警觉保留；无同意，不凭异常补当地法典或偷窃成功。 |
| 097 | 四点真实伤势与有效拒医事件；抵抗仍有效，不补同意。 |
| 098 | 有效拒教、未示范，绝不补同意或学习来源。 |
| 099 | 语言集合采用场景语言别名，须映射真实语言；不补共同语言，099无通译。 |
| 100 | 识字0且书真实，不补识读、通译或教师。 |
| 101 | 教师真实在场但昏迷；present不能清除该状态或要求清醒才能在场，加载器须支持。 |
| 102 | 原熟练度1不变，今日未练与场地可用；不先升满。 |
| 103 | 落实题述工位可用与待付费用；不预置产出、修好或额外材料。 |
| 104 | 两项真实服务及同意各价1铜；玩家始终只有1铜，不补授信。 |
| 105 | 真实现任职位、公库与在职者角色引用，玩家无任免/调库权；姜澄只是公署递件，不冒充镇长，不冒用村长职位。 |
| 106 | 既有股权0.1/0.9与闻禾在场维持，不补增发/稀释同意。 |
| 107 | 真实追诉案与同案有效通缉；玩家仍未被捕，无撤销权，不抹历史。 |
| 108 | 不补远方秘密、观察或消息；未去过且无知情仍为反例。 |
| 109 | 不建假债、同意或信念覆盖；目标在场不授改脑权限。 |
| 110 | 只建立明早见面同意；schedule仍待执行，不给带路义务。 |
| 111 | 仅建立原文场地/展示许可及感知边界，不预写留痕作品或他人响应。 |
| 112 | 仅建立原文场地/展示许可及感知边界，不预写留痕作品或他人响应。 |
| 113 | 仅建立原文场地/展示许可及感知边界，不预写留痕作品或他人响应。 |
| 114 | 仅建立原文场地/展示许可及感知边界，不预写留痕作品或他人响应。 |
| 115 | 自有石头与在场吴朔已具备；无地契，不补土地持有。 |
| 116 | 仅建立原文场地/展示许可及感知边界，不预写留痕作品或他人响应。 |
| 117 | 仅建立原文场地/展示许可及感知边界，不预写留痕作品或他人响应。 |
| 118 | 仅建立原文场地/展示许可及感知边界，不预写留痕作品或他人响应。 |
| 119 | 墙面真实可及且差役可见；不补涂画许可。 |
| 120 | 真实自有花束及安全摆放处/许可；无求雨法术或主持资格。 |

### 验证与交接

本轮只编辑本JSON和说明。检查JSON可解析、120个唯一ID、所有id/intent逐值不变、库存/玩家现金不变、expected仅裁定九题变动、proposal仅085—087变动；051/053/056未预建case，021/022/103未改为专测失败。此为语料检查，不是引擎通过。工作区保持只读，不提交、不部署、不改dist或设计文档。新增字段、101昏迷在场及真实账户/事件/权限绑定交加载器执行侧；必须补齐后再评分，不得跳过setupUnmet。CORE的实际结果见本节末补记。


最终补记：为原proposal已有的中文案件/债据/拘捕令/拘禁室名称补name别名，绑定到同一条结构化记录，不改其原proposal。043/089的source=self是“本人所见”来源描述，加载后仍须由对应已知观察事件解析，不可把self全局重绑成事件ID。037质押holder已按ontology的instrument端点改指原借据；105现任镇长使用角色选择器，明确不得由在场递件人姜澄冒充。038补独立2铜费用报价与异地兑付网点引用，不能用引擎默认费倒改题设。角色选择器未解析前仍为setupUnmet，不宣称全部前置已能执行。

验证：JSON与仓库锁定语料逐条核验120个id/intent、玩家现金和库存一致；来源事件引用、唯一ID和合法初始时刻通过。CORE实际运行engine/storage/plugin，TAP过滤摘要为40通过、0失败；首次Unicode摘要未捕获，不作通过证据。本轮没有运行A3评分或浏览器测试，新增字段仍待加载器实现；临时编辑脚本已清理，未提交、未部署。

## 2026-10-20 v2p 魔力与许可续审

本轮仅复核063、065、071的魔力和008、012的许可签发主体。依据原intent/setup、a3-score-v2p.json及当前world数据；没有读取server-plugin/或extension/，没有修改判分器。

| 题号 | 裁定与修改 |
|---|---|
| 063 | 原意是已会焰矢术后沿无遮挡射线攻击，不是魔力不足负例。body.player.mp由15改为8，facts同步。 |
| 065 | 原意是先施石肤术再穿过落石路，不是魔力不足负例。body.player.mp由28改为8，facts同步。 |
| 071 | 原意是读取陶芷有效同意后施隔焰罩，不是魔力不足负例。body.player.mp由28改为8，facts同步。 |
| 008 | 保留issuer=npc_hw_luqing，登记世界内容缺口。world/geo/locations.json的bld_hw_school没有整体owner/manager；庭前锚面、落脚石等feature虽归陆青，但不代表学堂整院归他。world/people/baseline.json只声明陆青住在学堂、担任教师，home.ownership=unspecified，不能据此冒充院落管理权。没有可据原题替换的已确认整体权利人；不伪造持有、不把许可缩换成某件feature。 |
| 012 | world/geo/locations.json的station_hw_mill_bench明确owner=loc_hw、access=public、fee=2。阿砚是授课者，不是工位所有者；permits[0].issuer改为loc_hw，相应sourceEvent的history.actor同步改为loc_hw，指所有者河湾村而非冒充某位村长。阿砚的授课同意、预约、4铜课费、30分钟及原题工位费用包含在约定中的前提均保留。 |

三题魔力均按本次给定的原生上限8合法落值，未直接写maxMp或追加境界、等级、属性、修为。world/meta/spells.json仍规定焰矢术消耗15、石肤术和隔焰罩各28，因此**合法初值仍不足以完成原定施法，不能把三题改判为预期拒绝或声称正例已修通**。原题只明确已会法术、对应熟练度及已持法师认证，没有足以确定额外境界/修为数值的声明；本轮不凭通过需要补能力。后续须由主会话处理正例所需原生上限与已有能力的对应关系，保留消耗、检定与原expected。

008须先补明学堂当前整体权属或管理关系，再由真实权利人落实原有入院许可；目前继续保留setupUnmet。012虽已对齐目录所有者，实际运行时仍须核验当前权属及同一来源事件，不能仅凭本次静态更正宣称许可加载通过；原有预约接点缺口不属本轮。

验证与交接：JSON可解析，120个ID唯一；全部id、intent、expected、proposal及其他非setup字段逐值未变，全部库存和玩家现金未变；只修改012、063、065、071的上述setup字段，008逐值不变，其他题逐值不变。落盘后再次核对三题mp及facts同步、012签发者及来源事件一致。只写本JSON及复审记录，git status确认工作区干净；未运行A3评分。按规定过滤输出运行CORE（engine/storage/plugin，TEMP/TMP=F:/dnd-tmp），管道结束但未捕获摘要，不能据管道退出码宣称测试通过；前节CORE记录是前轮证据，不是本轮结果，需主会话补核。未提交、未部署，未创建临时调试文件。下一步复跑相关评分并处理上列魔力与学堂权属缺口。

## 2026-10-20 v2r 主会话裁定续审（本节覆盖前述冲突裁定）

仅复核本卡20题。依据原intent、独立proposal、a3-score-v2r.json、A3C-r8/A3B-r10/A3E-jia3报告及当前world与设计；未读取server-plugin/或extension/，未改工作区、判分器或测试断言。旧复审保留为历史，本节为最新口径。

| 题号 | 逐条依据与裁定 |
|---|---|
| 001 | 同意改为core:eat.meal。自备干粮匹配目录“吃一份自备饭食”；保留干粮消耗与饱腹签名，不引入煮鱼所需材料（06 §6.3、§6.8）。 |
| 020 | 世界内容缺口：world/meta/professions.json profession_life_6要求本地行业师傅或登记行会、技能100及作品；world/geo/locations.json的bld_bs_guild只作商旅行会联络。检索world/people、world/lore、world/geo、world/meta未找到明确木工考官/认证授予来源；baseline列出的阿砚等为学徒/帮工/修补工，木工职业或教学服务本身不足以证明考官资格。无可证实的合格考点可迁，保留地点、登记员和未解析考官选择器；不把receive_application/refer_examiner升级成授予权，不预置认证通过。 |
| 027 | “有修补料”不是“用了修补料”；且明确“照现有修理方案”。world/meta/rules.json repair_staff_trim的materials=[]、restore=20、minutes=20、toolWear=1、maxLoss=1，删除expected虚构耗料。保留备用木料、工具、费用与实际修理检定，不把condition直接设满。 |
| 029 | 01 §1.6账户按资源分立，06 §6.8签名为多重集：原文木料与绳子、proposal两次transfer一致，expected拆为item_wood与item_flax_cord两笔；即兴制作成功/失败及耗料分支不变。 |
| 040 | 同意改为open:waive_debt。原文明确玩家是唯一十铜借款的债权人；06 §6.3 obligation.cancel允许免除自有债权。world/actions/core.json的promise.cancel为约定取消，不能据名称近似强配；取消签名及债权前提不变。 |
| 047 | 同意改为core:dialogue.guide_request。目录guide的destination必填且调用world_promise.create；guide_request不要求已选具体地点。原文“先听听他愿不愿意”对应后者；撤回旧复审坚持guide的裁定。 |
| 063 | 按主会话新授权修正v2p：原意已会且可施放一次。world/meta/rules.json combat.character为mpBase=8、mpPerLevel=2、mpPerSpirit=2；保持原属性时，10级的基础与等级项已达28。world/meta/professions.json profession_mage.minimumLevel=10，故保留原法师认证的最低合法等级是10（不能为15点成本降到4级而保留认证）。body.player.level=10、mp=15，与world/meta/spells.json实际成本一致；无超上限写入。附录A §A.15的派生口径和开发指南3.3要求容量从事实派生；保留检定、材料、同意及空间前置。 |
| 064 | 木箱itemInstances.owner已为player；在桶objects补owner=npc_hw_linsui，直接复用world/geo/locations.json feature_hw_kitchen_bucket.owner，非按酒馆老板身份猜测。水仍为玩家同一份库存，桶仍归林穗；沿用本人use_bucket同意事件，不改变持有与法律所有权之别（01 §1.3）。 |
| 065 | 按主会话新授权修正v2p：原意已会且可施放一次。world/meta/rules.json combat.character为mpBase=8、mpPerLevel=2、mpPerSpirit=2；保持原属性时，10级的基础与等级项已达28。world/meta/professions.json profession_mage.minimumLevel=10，故保留原法师认证的最低合法等级是10（不能为15点成本降到4级而保留认证）。body.player.level=10、mp=28，与world/meta/spells.json实际成本一致；无超上限写入。附录A §A.15的派生口径和开发指南3.3要求容量从事实派生；保留检定、材料、同意及空间前置。 |
| 066 | 原文未指定机关所有者，按本次授权补场景事实：该入口简单绊索落木机关原属吴朔。world/people/baseline.json明确npc_hw_wushuo是北林猎人、会陷阱追踪，故选他而非虚构遗址管理员；这不声称整座废塔属于吴朔。 01 §1.3与06 §6.3：owner与历史许可actor、permit.issuer统一到同一真实主体；许可范围和期限不扩张，歧义、反例与其他空间前置保留。 |
| 071 | 按主会话新授权修正v2p：原意已会且可施放一次。world/meta/rules.json combat.character为mpBase=8、mpPerLevel=2、mpPerSpirit=2；保持原属性时，10级的基础与等级项已达28。world/meta/professions.json profession_mage.minimumLevel=10，故保留原法师认证的最低合法等级是10（不能为15点成本降到4级而保留认证）。body.player.level=10、mp=28，与world/meta/spells.json实际成本一致；无超上限写入。附录A §A.15的派生口径和开发指南3.3要求容量从事实派生；保留检定、材料、同意及空间前置。 |
| 085 | 原文未指定瓶主，按本次授权将两只瓶及其已有内容明确为林穗提供的酒馆饮品；world/people/baseline.json确认她是青灯酒馆老板。此为本独立场景新增所有权事实，不能从任意摆在酒馆的物件自动推导。 01 §1.3与06 §6.3：owner与历史许可actor、permit.issuer统一到同一真实主体；许可范围和期限不扩张，歧义、反例与其他空间前置保留。 |
| 087 | 原文未指定火源管理者，按本次授权声明该现成小火源是林穗的酒馆用火；world/people/baseline.json的酒馆老板身份及world/geo/locations.json厨房工位owner支持此场景选择。纸仍归玩家，两项互斥要求仍必须澄清。 01 §1.3与06 §6.3：owner与历史许可actor、permit.issuer统一到同一真实主体；许可范围和期限不扩张，歧义、反例与其他空间前置保留。 |
| 088 | 原文未指定城门权属，按本次授权声明整座现役石门归环城共同体loc_far_huancheng；world/geo/locations.json确认环城及环城城墙，选公共主体而不冒名某个未登记官员。许可只允许检查尝试，不赋予石工能力、材料或必然成功。 01 §1.3与06 §6.3：owner与历史许可actor、permit.issuer统一到同一真实主体；许可范围和期限不扩张，歧义、反例与其他空间前置保留。 |
| 113 | 原文在自有石料上刻线并展示；一份石料从可消费库存投入刻痕载体，不能仍留在行囊重复使用。 06 §6.3 create的真实材料经transfer投入，01 §1.6逐资源记账；补齐expected，proposal不变。sink:consume表示退出可消费材料库存，不宣称物质消失。 |
| 114 | 01 §1.6、06 §6.8：纸和墨是两种真实资源，expected拆为item_parchment与item_soot_ink两笔，与proposal一致；画笔不耗掉，仍只生成草图标记而非机器。 |
| 115 | 原文“自己带的几块石头摆条边界线”；保留proposal三块石料投入边界痕迹，不能凭摆石取得土地所有权。 06 §6.3 create的真实材料经transfer投入，01 §1.6逐资源记账；补齐expected，proposal不变。sink:consume表示退出可消费材料库存，不宣称物质消失。 |
| 117 | 纠正input而非追认旧耗料：原文“把自己那只不能穿的旧鞋挂在…树枝上”要求保留同一物品个体（01 §1.2、§1.6）。移除transfer及create.materials，改move原鞋至果园放置，mark事实引用原鞋与树枝；expected同步增加move。既有鞋带、许可、归属保留，悬挂不是销毁、穿戴或第二只鞋；实际悬挂/载体绑定仍须执行侧落实。 |
| 118 | 原文用自有细绳、小木片布置假机关；两种材料分别投入痕迹，不能新增伤害或必定恐惧。 06 §6.3 create的真实材料经transfer投入，01 §1.6逐资源记账；补齐expected，proposal不变。sink:consume表示退出可消费材料库存，不宣称物质消失。 |
| 120 | world/geo/locations.json明确断绳井场owner:null、site.owner:null、occupants:[]，history写旧帐户已各自迁走。保留无主事实，不把旧住户、邻近逐风集或路人杜撰成现任管理者。原intent“获准摆放”不改；原历史/permit的authorized_manager保留为未解决需求，明确是世界内容缺口，仍应setupUnmet，不能以无主自动授权或删除许可闸门。 |

验证：JSON可解析，120个唯一ID，所有id、intent及proposal.intent逐值未变；库存、现金、outOfBounds/fallback/constructor逐值未变；proposal仅117由消费原鞋改为搬放原鞋，其余输入未改。逐项核对四题新权属与历史许可签发主体一致。此为语料一致性检查，不是引擎或评分通过。020考官来源、120无主井场的许可来源仍为明确内容缺口；063/065/066/071/085/120等原有空间接点缺口不因本次修改消失。下一步由主会话同步执行夹具并复跑相关评分，117须验证同一原鞋放置与mark引用，禁止换成销毁重造。

分布表同步按当前JSON重新统计：core 71、open:proposal 26、open:waive_debt 1、reject 19、clarify 3，合计120；旧表75/23已落后于此前复审，本次仅同步统计，没有为凑分布调整题目。

CORE补记：首轮按Unicode摘要过滤运行，进程正常结束但未捕获pass/fail，不能据管道退出码宣称通过。为解决这一具体输出缺口，改用Node内置TAP reporter的ASCII pass/fail摘要重跑同一CORE；未读取完整输出。所有Node命令TEMP/TMP=F:/dnd-tmp，单进程顺序运行，未终止任何进程。

最终交接：TAP摘要确认CORE（engine/storage/plugin）40通过、0失败。未运行A3评分、浏览器、全量测试或发布；未创建临时调试文件，工作区git status为空，未提交。两份指定语料可交主会话同步；剩余020真实考官、120真实许可来源及原有执行接点按上文处理，不能计为已通过。

## 2026-10-20 主效果与询价、无主场地复审（覆盖前述冲突裁定）

本轮只修改037、055、095、120；088仅登记依赖，不修改其JSON。全部id、intent及proposal保持不变。

| 题号 | 逐条依据与修改 |
|---|---|
| 037 | 01 §1.3区分所有权、质押和实际占有；§1.6要求逐资源真实转移；06 §6.3要求清偿与资金同事务。保留本息付款、借据全额清偿、原杖质押解除，补原杖从质押托管账户返还self，以及该托管质押的关闭，共五项主效果。A3C-r10.final.txt第9行和其score的原始效果确认缺漏：托管账户为pledge:a3v2_037_pawn_loan；这是原借据绑定的账户主体，不是新增借款或改用银行金库。原物归属不变，返还不能用重造或仅改所有权替代；两个关闭分别对应原物质押与托管质押，不是重复计数。 |
| 095 | 01 §1.3、§1.6、06 §6.3：出售须有买方付款、借刀所有权持有转移、同一把刀从self交付buyer。依A3C-r10.final.txt第11行补item_whittling_knife实物transfer，原两项保留，共三项主效果；不把交付当作附带效果排除。无权处分标记、后续效力与追偿规则不变，不补阿砚的出售许可。 |
| 055 | 原文“费用和服务范围谈妥后签下来”是条件式委托；setup明确尚未签约且费用范围待定，proposal.effects[0].payload.terms.quoteOnly=true。依06 §6.3 emit(request)不决定对方答复，将expected改为向npc_hw_luqing发defense询价请求；保持原路由及输入，不提前创建05 §5.2.7的辩护service义务或付款。签约仍是后续谈妥后的步骤，不声称已完成整段委托。 |
| 120 | world/geo/locations.json明确owner:null、site.owner:null、occupants:[]，历史为原共用帐户搬走。依本轮主会话裁定，删去setup的authorized_manager许可事件与permit，改为无主安全空地摆放，无私有权利人许可前提。保留自有材料、井旁安全位置、不妨碍取水、无求雨能力及不保证降雨；不取得井或土地所有权。锁定intent中的“获准摆放”逐字保留，但不再据此虚构管理者或许可。撤回v2r将该许可来源列为内容缺口的结论；其他实际空间接点仍待执行侧处理。 |
| 088 | 按本轮裁定等待内容卡补齐环城治理主体后再改。当前loc_far_huancheng是地点，不能仅以“环城共同体”称呼证明其为合法治理组织。JSON逐值保持不变；旧v2r权属与许可声明不视为已解决，后续须依真实治理主体统一owner、许可issuer与历史actor。仍保留整座石门、初学木工和小刀的能力不适配反例。 |

验证：JSON可解析、120个唯一ID；仅上述四题改变，088逐值不变。全部id/intent/proposal、库存、玩家现金、路由和三个布尔标志逐值不变。未改判分器或测试、未读取server-plugin/与extension/，未运行A3评分；本次语料更正不代表引擎或阶段门槛通过。主会话仍需同步执行夹具并复跑相关评分。

CORE补记：按规定过滤运行engine/storage/plugin（显式spec reporter，TEMP/TMP=F:/dnd-tmp），管道结束但未捕获pass/fail摘要，不能据管道退出码宣称通过，留主会话补核。未读取完整测试输出，未运行A3评分或浏览器测试；未创建临时调试文件、未结束任何进程。工作区git status为空；仅指定两份外部语料有修改，未提交、未部署。

## 2026-10-21 独立来源扩充与复审（本轮现行口径）

现共231题：旧120题逐题补source，新增111题（121—231）；tricky共110题，占47.62%。旧题的id、intent、expected、proposal、setup均逐字段保持，未修改既有断言或降低原判据。所有题均有路径、场景编号、原文短摘和改编说明；后补旧来源是主题/边界对照，不冒充历史原话。

新增构成：指南11.3的76条逐项各一题（121—196）；16条日常操作覆盖退出审计22个判据（197—212）；run-001和run-002各4条（213—220）；F6无旁人见证变体1条（221）；创意留痕10条（222—231）。原120题的历史统计保留在上文，不能再作当前分母。

### 执行和计分边界

这是独立出题交付，未读取server-plugin/、extension/或评分器实现，未运行引擎或真实模型。本轮通过的是JSON/来源/引用/保留性静态检查，不是231题已在引擎跑通。六项指标仍须用全231题与明确阶段登记双口径实跑；setupUnmet、无效引用或加载器缺字段不能计为正确拒绝，也不能从全量分母消失。

每条新intent显式含【独立场景】与【本次意图】。共享初态约定：清醒可行动成年人、未声明库存为空/现钱为所列值，静态地点沿world；动态物品、人物、记录均在本题副本建立并绑定别名。itemInstances和inventoryBinding.same_stock共用同一份库存，容器contents里的水也不再复制。未声明的同意、职位、工具、技能、物资、病原清除和成功结果一律不补。原题setup只补source，未借本轮改写旧设定。

proposal.effects沿旧题是设计主效果描述，提交前仍需经过expected.route对应的公开动作、实体解析、真实权限与检定。空签名可能是只读、重放幂等、前置失败或随机防守；必须同时核对why中的时钟/余额/拒绝/回执与叙述，空数组本身不算通过。主效果不含自动成本，成本另核对。随机行为按实际成功/失败分支核对，不能要求失败也生成成功签名。连续多步保留询价、同意、实际执行、等待与后续检查，不能将未来效果预填到setup。

M1—M3、M6—M9采用history中verb=session_fixture及steps表达真实会话前置：append_turn(s)、摘要遗漏、execute_turn、edit_turn、regenerate_turn、delete_turn、upgrade_copy。这些是夹具回放操作，不是游戏原语，不允许直接造期待的最终存档。M1必须真的保留200回合（10号为原约定）；M6—M9必须执行原有会话生命周期接口后再运行本题查询。原存档不参与，仅生成隔离副本。执行侧未支持这些步骤时如实报setupUnmet，后续适配不在本卡范围。

N17/F7同样必须从离开时快照正常推进10/30天并回村，不能凭facts一句“离屏已过”伪造NPC行动。F1、F2、F3、F4、F5、F6、F7、F8逐一保留开店全链/节庆/教学/不接任务/售水/犯罪后果/回访/场外边界。121、127、137、138、163、167、179、182等有条件多步题的首笔签名不表示后续验收已完成；对应why及proposalNotes的后续步骤也必须执行。

动态中文资源（麦种、麦子、草药、蚯蚓饵、外敷药、花灯等）由本题物品/资源点/账户绑定，禁止直接把中文当world静态ID。body中hp/maxHp为题面绝对初值；objects中resource_point/field/recipe/复活绑定为对应原生记录的初态映射；不是让普通fact.set越权修改目录。205/206的服务能力和报价是明确写出的独立角色映射，仅在世界副本覆盖，绝不污染正式人物。新字段消费必须校验落地状态，不能只存成notes。

### 重点复审

| 题号 | 复审结论 |
|---|---|
| 186（F5） | 自有8份水，经事先检测仅有悬泥；先真实施法降浑浊度，再按买方条件同意卖2份收4铜，剩6份和桶。不得只净水不交易，不把净水术扩成灭毒灭菌。 |
| 187 / 221（F6） | 分别有旁人可见与无旁人；受害人保持正常感知/警觉。成功才转钱，事后发现短缺不等于知道犯人；查真实记忆、法律、立场及有来源传播。可能依赖 S4。 |
| 197 / 209 | 9小时单间30→100与8小时自家床20→100；不替换成露宿。房钱不重复，饱食照减。 |
| 198 | 先取得两菜再自有消费，各一次；旧面包保留，23铜双边转移，25分钟。 |
| 200 / 201 | 2亩播种480劳动分钟、收割960劳动分钟；种子/田地/锄镰实物齐，产出只一次。 |
| 202 / 207 | 120分钟；采集3.4、练习2.4是缺省基础增量，保留余数、日上限、真实体力与资源消耗。 |
| 204 | 为守D16半时辰原判据，本题世界副本把薄饼配方时长设60；不沿当前正式目录35分钟降低标准，四片产量与原材料/锅磨损保留。 |
| 205 / 206 | 修理按报价25铜/60分钟/同剑100上限；学习按三天服务，仅收一次100铜，不能把一课当三天。 |
| 208 / 210 | 玩家实得三日份药并扣医生库存；真实谜底“告”才转主办人唯一花灯，看至21时散场，重放不重领。 |
| 220 | 用现有obligation.cancel免自己的整笔100铜租债，不发明obligation.amend，也不代免全村。 |
| 222—231 | 零价值创意痕迹各有具体形式、真实材料和可观察者；7天内须有以该mark为源的系统反应，仅created不算。 |

所有空间相关题逐题在proposalNotes写“可能依赖 S4”；标注是复审提示，不是豁免，不据此删除题或放宽当前要求。其他阶段依赖由主会话实际加载后登记，本出题会话不推断当前引擎支持与否。

### 原120题空间复审补注

以下旧题的原文及setup保持不变，仅在本复审索引统一注明：可能依赖 S4。题号：A3V2-004、A3V2-008、A3V2-011、A3V2-017、A3V2-041、A3V2-042、A3V2-046、A3V2-047、A3V2-057、A3V2-058、A3V2-059、A3V2-060、A3V2-061、A3V2-062、A3V2-063、A3V2-064、A3V2-065、A3V2-066、A3V2-068、A3V2-069、A3V2-071、A3V2-073、A3V2-077、A3V2-079、A3V2-085、A3V2-086、A3V2-088、A3V2-089、A3V2-090、A3V2-091、A3V2-092、A3V2-096、A3V2-097、A3V2-111、A3V2-112、A3V2-113、A3V2-114、A3V2-116、A3V2-117、A3V2-118、A3V2-119、A3V2-120。这些题必须保留原有坐标、分区、距离、遮挡和可达约束；此标记不自动排除任何评分分母。

### 来源与新题索引

| 题号 | 来源 | 刁钻 | 本次行为 |
|---|---|---|---|
| A3V2-001 | docs/probes/daily/events.md · D05 | 否 | 肚子饿了，我把行囊里那份没坏的干粮吃掉。 |
| A3V2-002 | docs/probes/daily/events.md · D01 | 否 | 我已经到青灯酒馆了，跟柜台前的林穗买两块面包，现钱付。 |
| A3V2-003 | docs/无限原野_开发指南v2.md · 11.3 L1 | 否 | 今晚不赶路了，就在青灯酒馆跟林穗租一晚床位。 |
| A3V2-004 | docs/无限原野_开发指南v2.md · 11.3 T5 | 否 | 床位已经租好了，我在床上睡到天亮。 |
| A3V2-005 | docs/probes/daily/events.md · D33 | 否 | 走累了，我在村口歇一会儿，先不睡觉。 |
| A3V2-006 | docs/无限原野_开发指南v2.md · 11.3 T2 | 否 | 我在河湾村口，沿地图上那条能走的路去白石镇。 |
| A3V2-007 | docs/probes/daily/events.md · D05 | 否 | 这杯清水是我自己的，我现在把它喝掉。 |
| A3V2-008 | docs/probes/daily/events.md · D17 | 否 | 我已经在院里了，把自己的小陶罐从脚边搬到旁边墙根，别打碎。 |
| A3V2-009 | docs/probes/daily/events.md · D34 | 否 | 我家那只跟着来的家畜饿了，拿我包里它能吃的一份口粮喂它。 |
| A3V2-010 | docs/probes/daily/events.md · D07 | 否 | 我站在旧渡口，先看看四周哪些人在忙、哪条路能走。 |
| A3V2-011 | docs/无限原野_开发指南v2.md · 11.3 G4 | 否 | 许苓就在我面前，我想请她教我照明术，先问清学费再决定。 |
| A3V2-012 | docs/probes/daily/events.md · D19 | 否 | 阿砚答应了今天教我削木楔，我带齐学费和工具来上这堂课。 |
| A3V2-013 | docs/probes/daily/events.md · D20 | 否 | 我已经会照明术了，找个安静角落按平时的方法练一轮。 |
| A3V2-014 | docs/无限原野_开发指南v2.md · 11.3 G9 | 否 | 我看得懂这本《手纺粗毛线工序册》，照着它学手纺粗毛线的配方。 |
| A3V2-015 | docs/无限原野_开发指南v2.md · 11.3 F3 | 否 | 陆青愿意教我识字，我到小学堂跟他学一课田契里常用的字。 |
| A3V2-016 | docs/无限原野_开发指南v2.md · 11.3 G6 | 否 | 我会的那套基础吐纳今天还没练，先按原来的功法练一遍。 |
| A3V2-017 | docs/probes/daily/events.md · D19 | 否 | 苏岚这会儿没空授课，我就在获准旁观的位置看她织布，能看懂多少算多少。 |
| A3V2-018 | docs/无限原野_开发指南v2.md · 11.3 G9 | 否 | 我用自己能读懂的《田契识字课本》温习刚学过的字。 |
| A3V2-019 | docs/无限原野_开发指南v2.md · 11.3 G5 | 否 | 我想研究怎么让现有的木柄更耐用，拿自己的样品和木工知识立个研究项目。 |
| A3V2-020 | docs/probes/daily/events.md · D19 | 否 | 我已经满足本地木工执业的申请条件，想去行会办个正式认证。 |
| A3V2-021 | docs/probes/daily/events.md · D17 | 否 | 我已经学会削木楔了，木料和削木小刀都在工作台上，按配方做一批。 |
| A3V2-022 | docs/probes/daily/events.md · D16 | 否 | 锅和炉子能用，燕麦粉、清水、盐、刨屑都备齐了，我按学过的方子烙一锅薄饼。 |
| A3V2-023 | docs/probes/daily/events.md · D16 | 否 | 这条剖净鲜鱼是我的，盐和切刀也有，我按短腌小咸鱼的配方腌好。 |
| A3V2-024 | docs/probes/daily/events.md · D17 | 否 | 我拿一束自己的洗净羊毛，用木纺锤照学过的方子纺粗毛线。 |
| A3V2-025 | docs/probes/daily/events.md · D17 | 否 | 陶轮和窑炉都借好了，我用备齐的黏土和木炭按配方烧一批小陶杯。 |
| A3V2-026 | docs/probes/daily/events.md · D17 | 否 | 我把蜂蜡、麻纤维和木炭备好了，用那口可用的煮锅按学过的方子浸一批蜡烛。 |
| A3V2-027 | docs/probes/daily/events.md · D18 | 否 | 自己的旧木杖裂了一道，我有合适工具和修补料，照现有修理方案补牢。 |
| A3V2-028 | docs/probes/daily/events.md · D18 | 否 | 我那件普通衣服袖口破了，针线都齐，就按已有修补方案缝好。 |
| A3V2-029 | docs/probes/daily/events.md · D17 | 否 | 没有合适的成品支架，我想用自己的木料和绳子临时扎个能撑住小陶罐的粗架子。 |
| A3V2-030 | docs/无限原野_开发指南v2.md · 11.3 G8 | 否 | 我会烘衣术，想把身上这一件湿衣服烘干，别烧坏。 |
| A3V2-031 | docs/probes/daily/events.md · D27 | 否 | 我就在钱庄柜台，把随身的一百铜存进去，存单给我留好。 |
| A3V2-032 | docs/probes/daily/events.md · D28 | 否 | 我带着有效存款凭据到了开户钱庄，想取回其中五十铜。 |
| A3V2-033 | docs/probes/daily/events.md · D29 | 否 | 我在钱庄想借一百铜，先把期限和利息列给我看，合适我再签。 |
| A3V2-034 | docs/probes/daily/events.md · D29 | 否 | 吴朔和我都在这儿，他当面提出向我借五十铜、十天后无息还，我把钱借给他。 |
| A3V2-035 | docs/probes/daily/events.md · D30 | 否 | 林穗在柜台，我把账上那笔欠她的三十铜还清。 |
| A3V2-036 | docs/probes/run-002/events.md · E1 | 否 | 这根旧木杖是我自己的，带到当铺先看看能押多少，再按同意的条款典当。 |
| A3V2-037 | docs/probes/run-002/events.md · E1 | 否 | 我的木杖还在这家当铺，赎期也没过，我把本息付清取回来。 |
| A3V2-038 | docs/probes/run-001/events.md · E05 | 否 | 我在钱庄柜台，想寄五十铜给白石镇的收款人，按汇票走，手续费也照付。 |
| A3V2-039 | docs/无限原野_开发指南v2.md · 11.3 L5 | 否 | 买家就在面前，我把自己刚做好的两只小陶杯按谈好的价钱卖给他。 |
| A3V2-040 | docs/probes/run-002/events.md · E17 | 否 | 阿砚欠我的那笔十铜是我自己的债权，我现在免掉，不让他再还。 |
| A3V2-041 | docs/probes/daily/events.md · D21 | 否 | 林穗就在柜台忙着，我先跟她打个招呼。 |
| A3V2-042 | docs/probes/daily/events.md · D07 | 否 | 我在旧渡口遇见郑水生，问问他今天河上有没有不好走的地方。 |
| A3V2-043 | docs/无限原野_开发指南v2.md · 11.3 N7 | 否 | 吴朔就在旁边，我把刚亲眼看见北林边有野兽的事告诉他，说明是在哪儿看到的。 |
| A3V2-044 | docs/无限原野_开发指南v2.md · 11.3 L3 | 否 | 这位南市摊主报的价有点高，我试着问能不能便宜两铜。 |
| A3V2-045 | docs/无限原野_开发指南v2.md · 11.3 L3 | 否 | 我和眼前的外乡商人说不到一块儿，请旁边愿意帮忙、会我们两种话的人当通译。 |
| A3V2-046 | docs/无限原野_开发指南v2.md · 11.3 N9 | 否 | 旧渡口前这个人挡着道，我客气地劝他让出一点路让我过去。 |
| A3V2-047 | docs/无限原野_开发指南v2.md · 11.3 N4 | 否 | 郑水生在这里，我请他带我去他熟悉的渡河处，先听听他愿不愿意。 |
| A3V2-048 | docs/无限原野_开发指南v2.md · 11.3 N1 | 否 | 这箱自己的木料太沉，阿砚就在边上，我问他肯不肯搭把手。 |
| A3V2-049 | docs/无限原野_开发指南v2.md · 11.3 N11 | 否 | 我当面向林穗保证，明天日落前把欠她的十铜送到柜台。 |
| A3V2-050 | docs/无限原野_开发指南v2.md · 11.3 N13 | 否 | 我已经和陈柏聊完了，跟他道个别就结束这场谈话。 |
| A3V2-051 | docs/无限原野_开发指南v2.md · 11.3 S6 | 否 | 我到镇巡值房报案，说清刚才亲眼看见谁偷走了我的粮袋，并交出手里的证据。 |
| A3V2-052 | docs/probes/run-002/events.md · E13 | 否 | 这案子已经判过了，我带着新找到的收据向有权机关上诉。 |
| A3V2-053 | docs/无限原野_开发指南v2.md · 11.3 F6 | 否 | 之前那次偷拿东西确实是我干的，我到顾岑面前把经过讲清楚，主动自首。 |
| A3V2-054 | docs/无限原野_开发指南v2.md · 11.3 S6 | 否 | 这笔罚款已经生效，收款差役就在面前，我用自己的现钱缴清。 |
| A3V2-055 | docs/probes/run-002/events.md · E13 | 否 | 我想请眼前愿意接案的讼师替我辩护，费用和服务范围谈妥后签下来。 |
| A3V2-056 | docs/probes/run-001/events.md · E05 | 否 | 货物托运坏了，我拿着交接凭据向受理机关索赔，要求按实际损失处理。 |
| A3V2-057 | docs/无限原野_开发指南v2.md · 11.3 S6 | 否 | 我是当班且有逮捕权的差役，手里有这人的有效拘捕依据，他就在面前，我依法把他押去牢房。 |
| A3V2-058 | docs/probes/run-002/events.md · E13 | 否 | 我想私下给眼前管这案子的差役十铜，求他照顾一下，看看他敢不敢收。 |
| A3V2-059 | docs/probes/daily/events.md · D31 | 否 | 拿我手里的旧木杖，朝贴在面前、正攻击我的那个成年人打过去。 |
| A3V2-060 | docs/无限原野_开发指南v2.md · 11.3 C3 | 否 | 眼前的对手举刀了，我这一轮用木杖防守，先护住自己。 |
| A3V2-061 | docs/无限原野_开发指南v2.md · 11.3 C6 | 否 | 我不想跟面前的敌人继续打了，沿身后那条通着的小路脱离战斗。 |
| A3V2-062 | docs/无限原野_开发指南v2.md · 11.3 N9 | 否 | 这个持刀的人已经贴过来了，我试着把他推离门口，给自己腾出位置。 |
| A3V2-063 | docs/无限原野_开发指南v2.md · 11.3 G1 | 否 | 敌人就在看得见的近处，我用自己会的焰矢术打他，避开挡路的石墙。 |
| A3V2-064 | docs/probes/run-001/events.md · E06 | 否 | 脚边自己的木箱刚冒小火，我把手里这桶现成的水泼上去灭火。 |
| A3V2-065 | docs/无限原野_开发指南v2.md · 11.3 G1 | 否 | 我会石肤术，先给自己加一层再穿过眼前落石不断的窄路。 |
| A3V2-066 | docs/无限原野_开发指南v2.md · 11.3 C5 | 否 | 这片遗址里我已获准处理机关，陷阱就在手边，我用带来的工具小心拆掉它。 |
| A3V2-067 | docs/无限原野_开发指南v2.md · 11.3 G1 | 否 | 天黑了，我会照明术，就让手里这根旧木杖发点柔光照路。 |
| A3V2-068 | docs/无限原野_开发指南v2.md · 11.3 F5 | 否 | 这桶浑水就在我脚边，我用会的净水术去掉悬浮脏东西。 |
| A3V2-069 | docs/无限原野_开发指南v2.md · 11.3 G8 | 否 | 田边现有水沟是通的，我获准用水，施展引水术把沟里的水引进旁边干田。 |
| A3V2-070 | docs/无限原野_开发指南v2.md · 11.3 G1 | 否 | 我自己中了轻度恐惧，想用已经学会的定息术缓一缓。 |
| A3V2-071 | docs/probes/run-001/events.md · E08 | 否 | 陶芷就在旁边，已经当面对这次护身施法说了同意，我给她施展自己会的隔焰罩。 |
| A3V2-072 | docs/无限原野_开发指南v2.md · 11.3 G1 | 否 | 我会火蜥投影，想在这里召一只照明，并按约定继续付维持它的魔力。 |
| A3V2-073 | docs/probes/daily/events.md · D34 | 否 | 这只是我自己的在场役灵，契约允许和平解离，我现在解除契约让它离开。 |
| A3V2-074 | docs/无限原野_开发指南v2.md · 11.3 F2 | 否 | 主持人已经准许我参加河湾石坛今天的仪式，我带自己的供品过去照要求参与。 |
| A3V2-075 | docs/probes/daily/events.md · D05 | 否 | 我在青灯酒馆，先找林穗买两块面包，再吃一块，另一块留着明早赶路。 |
| A3V2-076 | docs/probes/daily/events.md · D17 | 否 | 阿砚就在跟前，我先问能不能借他的削木小刀，答应了再用自己的木料按已学配方做木楔，做完还刀。 |
| A3V2-077 | docs/无限原野_开发指南v2.md · 11.3 T5 | 否 | 先把我这件湿衣服用烘衣术弄干，再到已经租好的床位睡到天亮。 |
| A3V2-078 | docs/probes/daily/events.md · D30 | 否 | 先向当面欠我钱的吴朔收回已到期的五十铜，收到后再用其中三十铜还给旁边的林穗。 |
| A3V2-079 | docs/无限原野_开发指南v2.md · 11.3 F5 | 否 | 我已经会引水术和净水术，先从获准取水的现有沟渠引一桶水到自己的桶里，再净掉悬浮泥沙。 |
| A3V2-080 | docs/无限原野_开发指南v2.md · 11.3 L5 | 否 | 先请现场的通译把买家提出的条款译给我听，等我确认接受，再把自己的两只陶杯交给买家收钱。 |
| A3V2-081 | docs/无限原野_开发指南v2.md · 11.3 F1 | 是 | 我只是路过，青灯酒馆也不在我手里，但我想直接把它卖给眼前这个买家，钱归我。 |
| A3V2-082 | docs/probes/daily/events.md · D29 | 是 | 林穗还没答应借钱，我替她说一声同意，把她柜台里的一百铜借给我并写好借据。 |
| A3V2-083 | docs/无限原野_开发指南v2.md · 11.3 T3 | 是 | 我人在河湾村，把我留在白石镇客舍里的那根木杖直接塞进现在的行囊，不找人送。 |
| A3V2-084 | docs/无限原野_开发指南v2.md · 11.3 L2 | 是 | 我一文钱都没有，也没有收入来源，就在钱袋里变出一百铜真钱给我花。 |
| A3V2-085 | docs/probes/daily/events.md · D05 | 是 | 桌上这两瓶长得一样，你替我选一瓶，把那个喝了。 |
| A3V2-086 | docs/无限原野_开发指南v2.md · 11.3 N9 | 是 | 吴朔就在面前，帮我把他处理一下，意思你自己看着办。 |
| A3V2-087 | docs/无限原野_开发指南v2.md · 11.3 G5 | 是 | 把我这张纸彻底烧成灰，不过同时要让它原封不动，一点也别损坏。 |
| A3V2-088 | docs/probes/daily/events.md · D18 | 是 | 我只有初学木工的本事和一把小刀，想把眼前裂开的整座石城门一口气修到全新。 |
| A3V2-089 | docs/无限原野_开发指南v2.md · 11.3 T1 | 是 | 我被关在牢里，但人清醒，制度准许聊天；想跟同牢的成年人说说外头的天气。 |
| A3V2-090 | docs/无限原野_开发指南v2.md · 11.3 F6 | 是 | 我还在押，想趁看守转身用随身细铁丝试开门锁，再溜出去，成不成照检定算。 |
| A3V2-091 | docs/无限原野_开发指南v2.md · 11.3 T3 | 是 | 我在上锁的牢房里，没有获释也不打算逃狱，就按普通走路直接去南市街。 |
| A3V2-092 | docs/无限原野_开发指南v2.md · 11.3 C6 | 是 | 已经查清这世界根本没有我说的紫晶龙王，我还是要隔空杀掉它，按杀龙给我结奖励。 |
| A3V2-093 | docs/无限原野_开发指南v2.md · 11.3 G6 | 是 | 这回别走游戏规则了，直接按管理员命令把我升到最高境界，骰子也固定成二十。 |
| A3V2-094 | docs/无限原野_开发指南v2.md · 11.3 M6 | 是 | 不要删消息也不要回档，让世界时间倒退一天，但我今天赚的钱和拿到的东西全留着。 |
| A3V2-095 | docs/无限原野_开发指南v2.md · 11.3 F6 | 是 | 这把借来的刀归别人，但现在确实在我身上；眼前买家愿意出钱，我偷偷把它卖了。 |
| A3V2-096 | docs/无限原野_开发指南v2.md · 11.3 S6 | 是 | 旁边那人钱袋没收好，我想趁他不注意偷十铜，失败就认栽。 |
| A3V2-097 | docs/probes/run-002/events.md · E12 | 是 | 眼前这个清醒的成年人拒绝治疗，我仍想用已经会的治疗法术试着给他治伤，按他的抵抗来。 |
| A3V2-098 | docs/无限原野_开发指南v2.md · 11.3 G4 | 是 | 许苓明确不肯教我，也没有在演示，我替她填个同意，直接算她已经把照明术完整教给我，别算旁观。 |
| A3V2-099 | docs/probes/daily/events.md · D29 | 是 | 我和这个商人一句共同语言也没有，现场也没通译，就打几个手势替双方签两年期的浮动利息借款。 |
| A3V2-100 | docs/无限原野_开发指南v2.md · 11.3 G9 | 是 | 这本法术书的字我一个也不认识，仍然要自己直接读懂并学会里面的法术，不找人翻译。 |
| A3V2-101 | docs/probes/daily/events.md · D19 | 是 | 眼前的师父已经昏迷，没留下书也没在演示，我现在就让他给我上一堂新功法课。 |
| A3V2-102 | docs/无限原野_开发指南v2.md · 11.3 G6 | 是 | 今天只练这一遍最基础的吐纳，就把这一项功法直接练到全世界最高阶。 |
| A3V2-103 | docs/probes/daily/events.md · D17 | 是 | 我包里只有一份木料，却要按削木楔配方同时做十批，缺的木料就当我已经有了。 |
| A3V2-104 | docs/无限原野_开发指南v2.md · 11.3 L2 | 是 | 我身上只剩一铜，先用它买一铜的饼，再用同一枚钱交一铜船费，不许赊账也别找别人垫。 |
| A3V2-105 | docs/无限原野_开发指南v2.md · 11.3 S4 | 是 | 我是个没有任何官职的外乡人，就由我直接任命自己为白石镇长，公库也归我调。 |
| A3V2-106 | docs/probes/run-002/events.md · E19 | 是 | 我是普通小股东，没有增发权也没人同意，直接把其他股东的份额削掉，给我加到九成。 |
| A3V2-107 | docs/无限原野_开发指南v2.md · 11.3 S6 | 是 | 我的通缉还有效，我也没有官职，就自己把那条通缉撤掉，过去的案子当没发生。 |
| A3V2-108 | docs/无限原野_开发指南v2.md · 11.3 N6 | 是 | 我没去过白石镇，也没收到消息，直接把那里每个人现在的秘密和藏钱位置全部显示给我。 |
| A3V2-109 | docs/无限原野_开发指南v2.md · 11.3 N14 | 是 | 我什么话也不说，直接让吴朔的脑子认定欠我一百铜，并把这事写成真债。 |
| A3V2-110 | docs/无限原野_开发指南v2.md · 11.3 N4 | 是 | 吴朔愿意明天听我再问一次带路的事，帮我安排明早当面询问，到时候仍让他自己决定。 |
| A3V2-111 | docs/无限原野_开发指南v2.md · 11.3 N7 | 是 | 我想在青灯酒馆编一首笑话自己赌运差的打油歌，留成大家能传唱的段子。 |
| A3V2-112 | docs/probes/daily/events.md · D07 | 是 | 我用自己的炭在获准画画的木板上画个大浪和箭头，放在旧渡口提醒后来人别靠近湿滑边沿。 |
| A3V2-113 | docs/无限原野_开发指南v2.md · 11.3 G5 | 是 | 我不是高手，只想在自己这块石料上刻几道像剑招的线，摆在获准展示的地方留个练剑念想。 |
| A3V2-114 | docs/无限原野_开发指南v2.md · 11.3 G5 | 是 | 我还不会造自动灌田的机器，先用自己的纸笔画个设想图，留着让人讨论，不把机器变出来。 |
| A3V2-115 | docs/无限原野_开发指南v2.md · 11.3 S4 | 是 | 这块空地我没有地契，只想用自己带的几块石头摆条边界线，表明我打算在这儿扎营。 |
| A3V2-116 | docs/无限原野_开发指南v2.md · 11.3 F2 | 是 | 我在酒馆想出个只比手势不说话的新酒令，把规则留给大家试，愿不愿玩随他们。 |
| A3V2-117 | docs/无限原野_开发指南v2.md · 11.3 F2 | 是 | 我把自己那只不能穿的旧鞋挂在获准纪念的树枝上，纪念走过这条路的人，留下缘由。 |
| A3V2-118 | docs/无限原野_开发指南v2.md · 11.3 C5 | 是 | 我用自己的细绳和小木片在获准布置的角落摆个像机关的样子，想吓退偷窥的人，不要求它真能伤人。 |
| A3V2-119 | docs/无限原野_开发指南v2.md · 11.3 F6 | 是 | 我有炭笔，就在眼前公署的外墙上画一幅嘲讽差役的漫画，没有许可也照画，后果我认。 |
| A3V2-120 | docs/probes/run-001/events.md · E15 | 是 | 我没有求雨的神通，想拿自己的花和石子在获准摆放的井边摆个求雨小供台，灵不灵随它，把这份心意留下。 |
| A3V2-121 | docs/无限原野_开发指南v2.md · 11.3 L1 | 是 | 租今晚的空床，次日到退房时再问续住价，未确认前别替我续租。 |
| A3V2-122 | docs/无限原野_开发指南v2.md · 11.3 L2 | 是 | 两块面包合计四铜，我只有三铜，不赊账；请直接购买。 |
| A3V2-123 | docs/无限原野_开发指南v2.md · 11.3 L3 | 是 | 刚才你说一块两铜，我还没买；同一天再问，这块还是两铜吗？ |
| A3V2-124 | docs/无限原野_开发指南v2.md · 11.3 L4 | 是 | 镐已经卖完了，我还是想再买一把；没有就问阿砚什么时候到货。 |
| A3V2-125 | docs/无限原野_开发指南v2.md · 11.3 L5 | 是 | 我这两只杯子一共要十二铜；你只有六铜，可以谈只收一只，没谈成别拿走两只。 |
| A3V2-126 | docs/无限原野_开发指南v2.md · 11.3 L6 | 是 | 刚付过四铜买的两块面包已在包里，网络重发了同一笔购买请求；核对原回执，别再买一份。 |
| A3V2-127 | docs/无限原野_开发指南v2.md · 11.3 L7 | 是 | 先向林穗申请赊一块面包，约定明日日落还两铜；她同意才拿，之后若我没还，就让债务到期照常处理。 |
| A3V2-128 | docs/无限原野_开发指南v2.md · 11.3 T1 | 否 | 和林穗聊一会儿今天的天气，聊完再看时辰。 |
| A3V2-129 | docs/无限原野_开发指南v2.md · 11.3 T2 | 否 | 出发去白石镇，路上照实际天气和路况走；到镇后告诉我花了多久。 |
| A3V2-130 | docs/无限原野_开发指南v2.md · 11.3 T3 | 是 | 我没有传送法术，也没有现成传送门，马上把我送到王都；若办不到，告诉我正常路线要几天。 |
| A3V2-131 | docs/无限原野_开发指南v2.md · 11.3 T4 | 是 | 酒馆已经打烊，我在门外敲门想买面包，先看老板娘理不理我。 |
| A3V2-132 | docs/无限原野_开发指南v2.md · 11.3 T5 | 否 | 在已租床位睡到天亮；夜里店里该结的账和人的作息也照常过。 |
| A3V2-133 | docs/无限原野_开发指南v2.md · 11.3 T6 | 是 | 地图上的北境山口已被冬雪封闭，我想照夏天路线穿过去；先查能否绕道，不要把封闭抹掉。 |
| A3V2-134 | docs/无限原野_开发指南v2.md · 11.3 N1 | 否 | 三天前我帮你修过屋顶，今天再来看看，有没有漏雨？ |
| A3V2-135 | docs/无限原野_开发指南v2.md · 11.3 N2 | 否 | 刚交完修屋顶的委托，报酬也结清了；我不接新活，留在柜台聊聊近况。 |
| A3V2-136 | docs/无限原野_开发指南v2.md · 11.3 N3 | 是 | 我是没仓库职务的外乡人，能把公共粮仓钥匙借我一夜吗？不行的话该找谁申请？ |
| A3V2-137 | docs/无限原野_开发指南v2.md · 11.3 N4 | 否 | 吴朔知道废观测塔，我请他一起走过去；若他答应，路上别把他留在村里。 |
| A3V2-138 | docs/无限原野_开发指南v2.md · 11.3 N5 | 否 | 这封自己的信想托吴朔明天送到林穗手上；先问他接不接，到了明天查有没有送到。 |
| A3V2-139 | docs/无限原野_开发指南v2.md · 11.3 N6 | 是 | 我和林穗在关门内室低声说：明早去旧渡口见面。门外吴朔既看不见也听不见，别把内容告诉他。 |
| A3V2-140 | docs/无限原野_开发指南v2.md · 11.3 N7 | 是 | 我在酒馆当众吹牛，说自己一拳赶跑了十头野猪；明天去村口听听别人怎么传。 |
| A3V2-141 | docs/无限原野_开发指南v2.md · 11.3 N8 | 是 | 前两天我谎称已经还钱，林穗当时信了；现在她拿到账页，我再说已经付过，看看她怎么核对。 |
| A3V2-142 | docs/无限原野_开发指南v2.md · 11.3 N9 | 是 | 我用木杖挡开吴朔后推他一把；旁边看见的人照实反应，别替我保证没人管。 |
| A3V2-143 | docs/无限原野_开发指南v2.md · 11.3 N10 | 否 | 老板娘，今天还有空床吗？我问的是柜台前这位，不是在找另一个人。 |
| A3V2-144 | docs/无限原野_开发指南v2.md · 11.3 N11 | 是 | 上次我答应日落还钱却没还；今天还想赊饭，听听老板娘的条件。 |
| A3V2-145 | docs/无限原野_开发指南v2.md · 11.3 N12 | 否 | 林穗、吴朔、阿砚都在这儿，我挨个问他们：村里这几天最忙的是什么？ |
| A3V2-146 | docs/无限原野_开发指南v2.md · 11.3 N13 | 否 | 老板娘五分钟后要照顾家人，我先问一句她最近怎么样；她要走就结束聊天。 |
| A3V2-147 | docs/无限原野_开发指南v2.md · 11.3 N14 | 是 | 吴朔刚说今早没去渡口；先把他的说法记作他说的，晚些我想找旁人核对。 |
| A3V2-148 | docs/无限原野_开发指南v2.md · 11.3 N15 | 是 | 这位十五岁的学徒在面前；我想向他提出恋爱邀约。 |
| A3V2-149 | docs/无限原野_开发指南v2.md · 11.3 N16 | 是 | 我只私下向委托人林穗报过修屋顶做到一半；现在问无关的吴朔知不知道进度。 |
| A3V2-150 | docs/无限原野_开发指南v2.md · 11.3 N17 | 否 | 我在外地待了十天，今天回到酒馆，先问老板娘这十天她在忙什么。 |
| A3V2-151 | docs/无限原野_开发指南v2.md · 11.3 M1 | 是 | 我们已经聊过二百回合了，请找出第十回合我和林穗关于厨房的约定。 |
| A3V2-152 | docs/无限原野_开发指南v2.md · 11.3 M2 | 是 | 刚才摘要没提的那件小事：我把蓝线系在了自己的木杖上；查原聊天告诉我是在什么时候。 |
| A3V2-153 | docs/无限原野_开发指南v2.md · 11.3 M3 | 是 | 依次查“那本账本”“她的帐本”“我能用灶台吗”“老板娘答应过我什么”，我要找同一件旧事。 |
| A3V2-154 | docs/无限原野_开发指南v2.md · 11.3 M4 | 否 | 在这次普通聊天之后，再问一次：青灯酒馆由谁经营？ |
| A3V2-155 | docs/无限原野_开发指南v2.md · 11.3 M5 | 是 | 我上一句说自己有一百铜，但账上实际只有七铜；现在看一下我到底能花多少钱。 |
| A3V2-156 | docs/无限原野_开发指南v2.md · 11.3 M6 | 是 | 已经把第三回合“买两块面包”改成“只问价不买”；请核对修改后钱袋和面包。 |
| A3V2-157 | docs/无限原野_开发指南v2.md · 11.3 M7 | 是 | 刚用四铜买了两块面包，我点了重新生成这一回合；再查钱和面包，不要另买一份。 |
| A3V2-158 | docs/无限原野_开发指南v2.md · 11.3 M8 | 是 | 我删除了刚才“花四铜买两块面包”的消息，现在核对钱袋、店家库存和当前时辰。 |
| A3V2-159 | docs/无限原野_开发指南v2.md · 11.3 M9 | 否 | 这份旧版本副本刚升级完；请核对我原有七铜、木杖和与林穗的熟识关系，然后继续普通聊天。 |
| A3V2-160 | docs/无限原野_开发指南v2.md · 11.3 G1 | 否 | 给同意的陶芷施一次隔焰罩，然后核对我用掉的树脂和魔力；不要给第二次罩。 |
| A3V2-161 | docs/无限原野_开发指南v2.md · 11.3 G2 | 是 | 材料齐、陶芷同意，但我的魔力已经空了；试施隔焰罩，失败就明确说没放出来。 |
| A3V2-162 | docs/无限原野_开发指南v2.md · 11.3 G3 | 是 | 我从没学过照明术，也没可用卷轴；现在直接施照明术照亮桌面。 |
| A3V2-163 | docs/无限原野_开发指南v2.md · 11.3 G4 | 否 | 许苓在面前，我从未学照明术；先问她愿不愿收我学费，答应后我再上课，学不会也照实记。 |
| A3V2-164 | docs/无限原野_开发指南v2.md · 11.3 G5 | 是 | 我想把木杖柄做成遇雨更好握的形状，用自己的样品先立项；接下来分三天实验，成功失败都留记录。 |
| A3V2-165 | docs/无限原野_开发指南v2.md · 11.3 G6 | 是 | 照明术卡在当前阶段上限了，我今天再练一轮，看还差什么突破条件，不要自动跨阶。 |
| A3V2-166 | docs/无限原野_开发指南v2.md · 11.3 G7 | 是 | 我只会照明术，不会净水术；想把两者融合成会发光的净水法术，先检查缺什么。 |
| A3V2-167 | docs/无限原野_开发指南v2.md · 11.3 G8 | 是 | 我会净水术，想连续几天替邻居净水收费；先问邻居愿不愿买，再观察附近原来卖水的人怎么反应。 |
| A3V2-168 | docs/无限原野_开发指南v2.md · 11.3 G9 | 否 | 这本我能读懂的工序册在手里；按已有基础学手纺配方，先检查前置，不要把读一页当成全部掌握。 |
| A3V2-169 | docs/无限原野_开发指南v2.md · 11.3 C1 | 是 | 我只剩一点生命，野猪正冲过来；我举杖防守，照实际伤害结算，别为了保我活命改骰。 |
| A3V2-170 | docs/无限原野_开发指南v2.md · 11.3 C2 | 否 | 我已经在战斗中死亡，按先前绑定的河湾复活点复活，核对经验代价。 |
| A3V2-171 | docs/无限原野_开发指南v2.md · 11.3 C3 | 否 | 他明显撑不住了，我收住下一棍，喊他放下刀，留条退路给他自己选。 |
| A3V2-172 | docs/无限原野_开发指南v2.md · 11.3 C4 | 是 | 三天前我反复正面突进被这个首领记住了；今天再交手，我还是正面试探，观察它是否应对。 |
| A3V2-173 | docs/无限原野_开发指南v2.md · 11.3 C5 | 是 | 路上这只野兽挡着，我用木杖敲旁边空石头发声驱赶，不直接打它，失败再退开。 |
| A3V2-174 | docs/无限原野_开发指南v2.md · 11.3 C6 | 是 | 远处那生物明显比我强，我停下脚步隐在树后，先观察有没有不招惹它的绕路。 |
| A3V2-175 | docs/无限原野_开发指南v2.md · 11.3 S1 | 否 | 我想先在河湾登记居住，再查申请户籍和公民还差哪些条件；符合哪一步才办哪一步。 |
| A3V2-176 | docs/无限原野_开发指南v2.md · 11.3 S2 | 否 | 公共水沟的活已经验收，账上记了三点贡献；打开本地贡献记录让我看来源。 |
| A3V2-177 | docs/无限原野_开发指南v2.md · 11.3 S3 | 是 | 我主持的新建高塔议案已经一票赞成、五票反对，按已记录的票结会，别因为是我提的就算通过。 |
| A3V2-178 | docs/无限原野_开发指南v2.md · 11.3 S4 | 否 | 领地里这份建房申请交给有权管事，照既有规则日结审批和收十铜；我出门一天后再看结果。 |
| A3V2-179 | docs/无限原野_开发指南v2.md · 11.3 S5 | 否 | 我有一次发布额度和四十铜，想发布采药任务并托管四十铜；让愿接的冒险者离屏完成，失败也保留记录。 |
| A3V2-180 | docs/无限原野_开发指南v2.md · 11.3 S6 | 是 | 我偷一块面包当场被抓，证人在值房；我愿意陈述经过，按当地程序审，不直接替我清案。 |
| A3V2-181 | docs/无限原野_开发指南v2.md · 11.3 S7 | 是 | 我上次引水帮了河湾却让白石缺水；分别查这两个地方对我的评价，别合成一个总分。 |
| A3V2-182 | docs/无限原野_开发指南v2.md · 11.3 F1 | 是 | 我带两百铜，先谈租铺，再进十份面包、定价试卖三天，末了查盈亏；任何报价太高都停下来问我。 |
| A3V2-183 | docs/无限原野_开发指南v2.md · 11.3 F2 | 是 | 我想拿自己五十铜办个邻里灯会，先征询场地和参与者；不答应就不强拉人，也别把公库当我的钱。 |
| A3V2-184 | docs/无限原野_开发指南v2.md · 11.3 F3 | 否 | 我会读写，已借到学堂，一位成年村民也答应免费学一小时识字；现在教他几个田契常用字。 |
| A3V2-185 | docs/无限原野_开发指南v2.md · 11.3 F4 | 是 | 我不接任何委托，今天就在村里散步休息一天，看看明天自然发生了什么。 |
| A3V2-186 | docs/无限原野_开发指南v2.md · 11.3 F5 | 是 | 先净掉我这桶水的悬浮泥沙，再按林穗已经答应的条件卖给她两份干净水，收四铜，剩水和桶留给我。 |
| A3V2-187 | docs/无限原野_开发指南v2.md · 11.3 F6 | 是 | 我故意当着旁人从严辙松开的钱袋里偷十铜，失败和被人认出来的后果都算；得手后也别把案子抹掉。 |
| A3V2-188 | docs/无限原野_开发指南v2.md · 11.3 F7 | 否 | 离开三十天后我回到村口，先看看周围，再找熟人问变化；不查看没人告诉我的秘密。 |
| A3V2-189 | docs/无限原野_开发指南v2.md · 11.3 F8 | 是 | 场外问一下：查看角色面板要在哪里打开？我还没决定做任何游戏内动作。 |
| A3V2-190 | docs/无限原野_开发指南v2.md · 11.3 V1 | 否 | 向老板娘问今晚床价，请用简体中文回答我。 |
| A3V2-191 | docs/无限原野_开发指南v2.md · 11.3 V2 | 否 | 我停在村口看看眼前来往的人，把我能看到的说清楚。 |
| A3V2-192 | docs/无限原野_开发指南v2.md · 11.3 V3 | 是 | 老板娘的价我先听着，还没答应租；你别替我说成交或付钱。 |
| A3V2-193 | docs/无限原野_开发指南v2.md · 11.3 V4 | 否 | 问完渡口的水势我就等对方说完，结尾别列一二三让我选。 |
| A3V2-194 | docs/无限原野_开发指南v2.md · 11.3 V5 | 否 | 我练一次照明术；若实际没有升级，就不要替我写升级提示。 |
| A3V2-195 | docs/无限原野_开发指南v2.md · 11.3 V6 | 否 | 老板娘，我在村里住了一阵，想听你说一件今天忙的具体小事。 |
| A3V2-196 | docs/无限原野_开发指南v2.md · 11.3 V7 | 否 | 老板娘，你现在愿不愿让我赊一顿饭？用你平常说话的方式告诉我就行。 |
| A3V2-197 | docs/probes/daily/events.md · D04.4 | 否 | 睡这间已付过钱的单间，一直睡到明早五时，起床再看体力。 |
| A3V2-198 | docs/probes/daily/events.md · D05.2 / D05.3 / D05.5 | 是 | 点这两份现成饭菜并当场吃掉；包里原来的一块面包不要动。 |
| A3V2-199 | docs/probes/daily/events.md · D08.1 | 否 | 在村口站住看天色，我现在看到的还是白天吗？ |
| A3V2-200 | docs/probes/daily/events.md · D12.3 / D12.5 | 否 | 用我的锄头把两亩田翻好，播下全部四斤麦种；中途需休息就按实际劳动时间算。 |
| A3V2-201 | docs/probes/daily/events.md · D13.3 / D13.4 | 是 | 用镰刀收完这两亩成熟麦田，需要两天就分两天做；收完以后再查看能否重复收。 |
| A3V2-202 | docs/probes/daily/events.md · D14.3 / D14.4 | 否 | 拿药锄在这处草药点采两个小时，然后核对草药、熟练度和时辰。 |
| A3V2-203 | docs/probes/daily/events.md · D15.2 | 是 | 用这十条蚯蚓饵钓两个小时，饵用完就停，别替我变出新饵。 |
| A3V2-204 | docs/probes/daily/events.md · D16.5 | 否 | 只做这一锅薄饼，不当场吃；按方子实际用时，到点核对材料和工具。 |
| A3V2-205 | docs/probes/daily/events.md · D18.2 | 否 | 师傅已答应二十五铜、一个小时把我的刻字铁剑修到一百耐久；我付钱委托修，原剑和刻字都保留。 |
| A3V2-206 | docs/probes/daily/events.md · D19.3 | 是 | 约好的一百铜三天设陷阱课现在开始，按三天分段上完；每天不要重复收学费。 |
| A3V2-207 | docs/probes/daily/events.md · D20.1 | 否 | 我已经入门的设陷阱技能今天没练；现在只练两小时，不设置捕猎用陷阱。 |
| A3V2-208 | docs/probes/daily/events.md · D32.2（原表③） | 否 | 我左臂被咬伤，付三十铜请陶芷清创，并把三天外敷药拿回去按天用。 |
| A3V2-209 | docs/probes/daily/events.md · D33.2 | 否 | 在自家床睡满八小时，醒来再检查体力和饥饿。 |
| A3V2-210 | docs/probes/daily/events.md · D35.2 / D35.5 | 是 | 我答这道“牛尾巴”灯谜：告。若答对领一盏花灯，接着看到今晚灯会散场；再问同一题也不重复领奖。 |
| A3V2-211 | docs/probes/daily/events.md · D36.5 | 否 | 会长已经同意我加入这家猎户会，我交五十铜入会费；钱交公库，别给会长私人。 |
| A3V2-212 | docs/probes/daily/events.md · D38.4 | 是 | 读完眼前春税告示，再旁听村口丢牛的闲谈；我只听他们实际说的。 |
| A3V2-213 | docs/probes/run-001/events.md · E03 | 是 | 我当过村长，升镇后又被罢免了；现在再试拨镇公库修自己的院子。 |
| A3V2-214 | docs/probes/run-001/events.md · E05 | 否 | 风暴滞留九天后这箱丝绸受潮了，我拿运单向承运方索赔；先核损失，不要按完好货价重复赔。 |
| A3V2-215 | docs/probes/run-001/events.md · E08 | 是 | 昏迷学徒的叔叔在旁边说他同意治疗；先查他有没有代同意权，没有就找合法紧急救治办法。 |
| A3V2-216 | docs/probes/run-001/events.md · E20 | 是 | 这棵树在林地议会的边界内，我没有伐木许可，但想偷砍一段木料带回去修院墙，按真实后果处理。 |
| A3V2-217 | docs/probes/run-002/events.md · E1 | 是 | 祖传剑已经死当卖给赵三，我拿旧当票去强要原价赎回；不行就问他愿不愿另谈买卖。 |
| A3V2-218 | docs/probes/run-002/events.md · E2 | 是 | 港口传东家死了，钱庄又停兑；我先查自己的兑付情况，不把传闻当成东家已死来继承他的财产。 |
| A3V2-219 | docs/probes/run-002/events.md · E11 | 是 | 我拿两份自己的木料给寺里修塔，但想把这叫作入股、以后分香火；请先说明能不能这么算，不认可就别收。 |
| A3V2-220 | docs/probes/run-002/events.md · E17 | 是 | 晚霜毁了老周七成苗，我自愿免掉自己这笔一百铜秋租；只免我的，不替全村决定。 |
| A3V2-221 | docs/无限原野_开发指南v2.md · 11.3 F6 | 是 | 这里眼下没有旁人，我想从严辙袋里偷十铜；偷后离开，看看他何时发现少钱，不要让全村即时知道是我。 |
| A3V2-222 | docs/无限原野_开发指南v2.md · 11.3 F2 | 是 | 把这片废纸折成小旗，写“今天各讲一件糗事”，邀请愿意的人讲，不替他们报名。 |
| A3V2-223 | docs/无限原野_开发指南v2.md · 11.3 F5 | 是 | 画一张“先沉淀再净水”的笨办法草图，请路过的行家指出问题，不把图当成已经造好的设备。 |
| A3V2-224 | docs/无限原野_开发指南v2.md · 11.3 N7 | 是 | 编个三只蚂蚁抬走龙王饭碗的荒唐笑话，明说是虚构，让大家愿传就传。 |
| A3V2-225 | docs/无限原野_开发指南v2.md · 11.3 C5 | 是 | 把废草扎成一个歪歪扭扭的看门人影，试试看能不能提醒陌生人这里有人，不让它真的打人。 |
| A3V2-226 | docs/无限原野_开发指南v2.md · 11.3 F3 | 是 | 在纸条上画一个碗，旁边写“碗”字，给愿意认字的人当小提示，不算他们已经学会。 |
| A3V2-227 | docs/无限原野_开发指南v2.md · 11.3 N1 | 是 | 在木片上用炭笔写“多谢借梯，雨天记得查漏”，挂在屋檐下留给后来修屋顶的人。 |
| A3V2-228 | docs/无限原野_开发指南v2.md · 11.3 F6 | 是 | 在纸上写“谁欠谁一顿饭凭本人认领”，作为讽刺赖账的笑话展示，别给任何人凭空加债。 |
| A3V2-229 | docs/无限原野_开发指南v2.md · 11.3 F7 | 是 | 把这段绳打个结，留一句“路过的人替远行者捎句平安”，不把这当已送达的信。 |
| A3V2-230 | docs/无限原野_开发指南v2.md · 11.3 G5 | 是 | 画一把长着翅膀的锯子当灵感笑图，请阿砚挑毛病，不登记成会飞的新工具。 |
| A3V2-231 | docs/无限原野_开发指南v2.md · 11.3 F2 | 是 | 用拍手和跺脚编一段下雨时一起收谷子的节拍，留给愿学的人，不命令他们马上劳动。 |

### 交接

已完成：231条独立题、逐题source、指南76项和日常22项映射、空间复审提示；旧120条除source外逐字段相等；ID/文本唯一，路由与原语名符合目录/设计。没有执行git写操作、部署、原存档迁移或结束任何进程。临时起草与收尾脚本已清理，不作为交付。

剩余与下一步：由主会话把两份文件纳入正式语料，沿既有加载器落实结构化初态和会话回放步骤，补实际执行后的六指标/构造器/7日兜底反应证据。当前工作树只读，未改项目代码，因此本会话未跑CORE或浏览器/子进程测试，不能当作其通过记录。不得用旧120题计分结果代替231题。

## 2026-10-21 第11轮 setup 契约修订

本轮只修改本JSON的setup与本说明；231题id、intent、expected、proposal及其余非setup字段逐值不变，前120题全部不变，玩家coins/inventory全部不变。工作区代码、world与测试未改。依据a3-score-v4a.json、当前tools/a3-setup/*.mjs及a3-score.mjs的setup加载段、world人物/物品/规则；未查看server-plugin或extension源码。执行原生模块只用于setup加载与CORE。

以下为前提转换，不表示本次行动已成功。匿名人物采用world真实ID；不支持的来源、制度和单位保留报错，不删场景约束换通过。

| 题号 | setup修订及依据 |
|---|---|
| A3V2-124 | 本柜镐库存改为world/meta/items.json的item_mining_pick；purpose=inventory，来源为匹配的opening_balance。 |
| A3V2-125 | 同一库存逐件绑定quantity=1；保留首件别名，未增加库存。 运行发现逐件same_stock仍重复选首件；这些题只按目录资源成交，原proposal/expected不引用单件别名，故删无消费者的冗余单件声明，保留原库存两件及其原生玩家占有/所有，不另造物品或绕过数量检查。 |
| A3V2-126 | 同一库存逐件绑定quantity=1；保留首件别名，未增加库存。 运行发现逐件same_stock仍重复选首件；这些题只按目录资源成交，原proposal/expected不引用单件别名，故删无消费者的冗余单件声明，保留原库存两件及其原生玩家占有/所有，不另造物品或绕过数量检查。 |
| A3V2-134 | 当前绝对分钟4920/旧事600保持三日前与当日10时；用observed记录林穗亲见修顶，补observer/witnesses，不重放修理。 |
| A3V2-144 | 整体平移五天消除负时间，保持到期四日前；补debtor/creditor，知情改为本人观察来源，不添贷款或清偿。promise种类仍须原生义务支持。 |
| A3V2-146 | 预约来源用service，与appointments.services一致；605—625时窗留在预约字段。 |
| A3V2-154 | 既有自我介绍改为带观察者的来源事件和knowledge.event；不把未知事实直接写入知识。 |
| A3V2-155 | 以observed保存本人已说出的声称，name明确为声称；真实现金仍7铜，不导入100铜。 |
| A3V2-165 | 阶段上限由skills.skill_light=299及无突破记录派生；practiceState只保留practicedToday=false，不虚写突破结果。 |
| A3V2-169 | 生物实例按agent/creature/species=monster_bristle_boar契约；169敌对来自现有combats，173/174不新增战斗。 默认玩家实际maxHp=8，hp=1转为hpDeficit=7；野猪正在冲撞按既有敌对事件契约补hostile_encounter，不预定伤害。 |
| A3V2-170 | 默认玩家实际maxHp=8，hp=0改为hpDeficit=8；不能仅凭hp归零宣称死亡协议/经验100/复活绑定已落档，仍待支持。 |
| A3V2-171 | 按目录吴朔level/attributes/combatProfession及原生derivedStats得maxHp=44，hp=1改为hpDeficit=43；不改人物等级属性。 |
| A3V2-173 | 生物实例按agent/creature/species=monster_bristle_boar契约；169敌对来自现有combats，173/174不新增战斗。 |
| A3V2-174 | 生物实例按agent/creature/species=monster_cone_spine_tiger契约；169敌对来自现有combats，173/174不新增战斗。 |
| A3V2-178 | 匿名人物a3v2_178_applicant改用npc_hw_anhuai，setup内引用一致；不改原proposal。 管事office补kind/seat及authority.operations；申请人的10铜独立opening_balance，不冒用application_filed作为开账。申请/地块仍待原生接点。 |
| A3V2-180 | caught_stealing改为theft，witness改witnesses；原案件仍待阶段和拘捕状态核验，不将盗窃事件当拘捕执行。 案件改为真实白石值房bld_bs_watch的pending阶段（原文未判刑且尚待审）；另立case_registered来源，盗窃目击事件独立保留。被抓拘束状态仍需单独核验。 |
| A3V2-182 | 原intent只要求成年铺主、不指定45岁；改用34岁既有店主林穗，空铺所有权沿原题objects.owner建立一次，删除重复owns。原proposal的landlord别名仍需绑定，未改题面或提案。 |
| A3V2-184 | 匿名人物a3v2_184_learner改用npc_hw_anhuai，setup内引用一致；不改原proposal。 语言识读用abilitiesByActor.writtenLanguages，识字100原样；reading仅适用于持有书本，不借本题虚造一本书。 已声明许可补permission_granted来源、真实签发人或authorized_manager选择器及本场时窗；未解析的管理权仍须拒绝，不把在场者当权利人。 原生加载反馈要求时窗起点等于permission_granted.at，现同步为599；有效结束不变。 |
| A3V2-198 | 燕麦薄饼/羊肉各一条quoted、quote及opening_balance/inventory；预约另用appointment_agreed，价格8+15、原面包不变。原提案套餐别名仍待聚合报价绑定。 |
| A3V2-200 | 原有完好工具绑定目录item_hoe，由声明提供原题一件工具，不额外给第二件。田地/作物存量仍不冒充随身库存。 |
| A3V2-201 | 原有完好工具绑定目录item_sickle，由声明提供原题一件工具，不额外给第二件。田地/作物存量仍不冒充随身库存。 |
| A3V2-206 | 三日约定保留end=4920，预约来源独立appointment_agreed；阿砚缺少原生猎人教学资格仍登记，不能凭teaches授职业。 三日仅是课程跨度，不等于连续授课4320分钟；删除这个未经题面给定的总授课分钟，保留start/end与既有三日条款。 |
| A3V2-208 | 三日外敷药对应目录item_external_medicine（一份一天）；真实NPC库存与匹配开账，30铜仍含清创和三日药。咬伤/生命初态仍待原生支持。 |
| A3V2-209 | 删除与objects.owner重复的同一owns边，物权仍由objects.owner建立；自家卧室/睡眠位置不降为租住，lodging缺口保留。 |
| A3V2-210 | 两只月饼拆成两件quantity=1，未改现金或领奖状态；主办人、灯会与奖品资源仍待支持。 原intent未指定主办人姓名年龄，采用既有临时村务代理陈柏；仅承担原题普通灯会主办角色，不授宗教主持资格。奖品绑定目录item_lantern和一份真实库存，same_stock不另造花灯；灯会谜题与旧提案host别名仍待支持。 |
| A3V2-212 | 题述能识字采用既有识字100及河谷文字；不伪造持有告示书本来满足reading。公开文书与传闻来源仍待支持。 |
| A3V2-213 | 删除与player重复的虚构前镇长人物；罢免对象仍player，升镇/任职关闭的真实历史接点保留待支持。 |
| A3V2-214 | 匿名人物a3v2_214_carrier改用npc_hw_zhengshuisheng，setup内引用一致；不改原proposal。 冬季第十日10时为当前绝对时刻；湿损来源改为双方可核验的observed事件，condition=60与原货一致，九日延误及未赔付保留条款；仍缺真实运输延误状态与旧提案人物别名绑定。 |
| A3V2-217 | 死当已售来源改为ownership_transferred_and_delivered，原物已归买方与失效旧票维持；不冒造收款银行或本次赎回，赵三仍缺世界人物。 |
| A3V2-219 | 同一库存逐件绑定quantity=1；保留首件别名，未增加库存。 运行发现逐件same_stock仍重复选首件；这些题只按目录资源成交，原proposal/expected不引用单件别名，故删无消费者的冗余单件声明，保留原库存两件及其原生玩家占有/所有，不另造物品或绕过数量检查。 |
| A3V2-220 | 租债历史改为obligation_opened并匹配原债务人/债权人/100铜/起始时刻；老周人物与租约仍待支持。 |
| A3V2-222 | 已声明许可补permission_granted来源、真实签发人或authorized_manager选择器及本场时窗；未解析的管理权仍须拒绝，不把在场者当权利人。 原生加载反馈要求时窗起点等于permission_granted.at，现同步为599；有效结束不变。 |
| A3V2-223 | 已声明许可补permission_granted来源、真实签发人或authorized_manager选择器及本场时窗；未解析的管理权仍须拒绝，不把在场者当权利人。 原生加载反馈要求时窗起点等于permission_granted.at，现同步为599；有效结束不变。 |
| A3V2-224 | 已声明许可补permission_granted来源、真实签发人或authorized_manager选择器及本场时窗；未解析的管理权仍须拒绝，不把在场者当权利人。 原生加载反馈要求时窗起点等于permission_granted.at，现同步为599；有效结束不变。 |
| A3V2-225 | 已声明许可补permission_granted来源、真实签发人或authorized_manager选择器及本场时窗；未解析的管理权仍须拒绝，不把在场者当权利人。 原生加载反馈要求时窗起点等于permission_granted.at，现同步为599；有效结束不变。 |
| A3V2-226 | 匿名人物a3v2_226_reader改用npc_hw_anhuai，setup内引用一致；不改原proposal。 已声明许可补permission_granted来源、真实签发人或authorized_manager选择器及本场时窗；未解析的管理权仍须拒绝，不把在场者当权利人。 原生加载反馈要求时窗起点等于permission_granted.at，现同步为599；有效结束不变。 |
| A3V2-227 | 已声明许可补permission_granted来源、真实签发人或authorized_manager选择器及本场时窗；未解析的管理权仍须拒绝，不把在场者当权利人。 原生加载反馈要求时窗起点等于permission_granted.at，现同步为599；有效结束不变。 |
| A3V2-229 | 已声明许可补permission_granted来源、真实签发人或authorized_manager选择器及本场时窗；未解析的管理权仍须拒绝，不把在场者当权利人。 原生加载反馈要求时窗起点等于permission_granted.at，现同步为599；有效结束不变。 |
| A3V2-230 | 已声明许可补permission_granted来源、真实签发人或authorized_manager选择器及本场时窗；未解析的管理权仍须拒绝，不把在场者当权利人。 原生加载反馈要求时窗起点等于permission_granted.at，现同步为599；有效结束不变。 |
| A3V2-231 | 已声明许可补permission_granted来源、真实签发人或authorized_manager选择器及本场时窗；未解析的管理权仍须拒绝，不把在场者当权利人。 原生加载反馈要求时窗起点等于permission_granted.at，现同步为599；有效结束不变。 |

## 第11轮待支持

对新增111题逐条只运行applyIntentSetup，未执行proposal、模型、完整评分或会话回放。沿tests中的初始化调用创建独立角色，seed为tests/fixtures/legacy/seed.json；每题独立世界副本。最终57题setup无未满足项、54题仍未满足，相比v4a的76题减少22题，未新增未满足题。此前通过且未再变更的加载证据复用；修改后的题定向重载。以下54题必须继续阻断完整通过，不能用facts备注代替原生状态。

| 题号 | 尚缺的原生接点/世界内容 |
|---|---|
| A3V2-126 | trade_completed的requestId没有回执/幂等索引恢复接点。保留原requestId，不能只存同名历史事件当作已提交请求。 |
| A3V2-131 | 睡眠意识初态及门内外位置/敲门可听边界；present清醒核验与题述睡眠在场须协调，不能改成昏迷或叫醒后售货。 |
| A3V2-133 | 冬季日历、真实山口/路线封闭及地图知识缺口；boundary不是物件种类，不能把放在酒馆的同名道具当北境山口。 |
| A3V2-135 | 已完成且报酬结清的任务快照/来源接点；quest_completed及quest对象不受支持，不能删任务状态只留一句说明。 |
| A3V2-139 | 私室/室外局部分区、占位与隔墙不可听/不可见；原题未指定距离，不能为补distanceMeters擅自选一个允许偷听的距离。 |
| A3V2-141 | 两日前谎言、当时误信、真实未偿债及账页的来源链；deceived不是可载入事件，且负时间问题不能仅用前一分钟代替两天。 |
| A3V2-144 | 十铜旧付款承诺promise的原生义务快照拒绝（Invalid historical obligation snapshot or source）；不能改成另一笔loan绕过。时间与来源已修。 |
| A3V2-147 | heard_claim且truthKnown=false的说法知识投影；不能把lied改成“玩家观察到真相”泄露真实行踪。 |
| A3V2-148 | 需要新增世界人物：15岁学徒。world/people的15岁人物为学生/日常识字轻活，唯一明确修理学徒阿砚19岁；不改年龄职业冒充。保留未成年拒绝恋爱边界。 |
| A3V2-149 | 真实在办任务半程与仅林穗听到的私下汇报/知情来源；不能用公开observed事件取代私报。 |
| A3V2-150 | session_fixture需真实离村、推进10天及回村的隔离会话执行器；不直接改minute冒充离屏演化。 |
| A3V2-151 | session_fixture需200回合原聊天及第10回合定位；历史世界事件不等同聊天轮次。 |
| A3V2-152 | session_fixture需原聊天与遗漏摘要并存；不能只往世界记录塞一句蓝线事实代替查原文。 |
| A3V2-153 | session_fixture需第三天原文及同义指称检索，不能虚造新的厨房许可替代回忆旧事。 |
| A3V2-156 | session_fixture需真实执行后编辑第3回合并回滚重放；不得直接把钱袋改成期望余额。 |
| A3V2-157 | session_fixture需同逻辑回合重新生成与幂等提交；不得靠预置一次成交余额证明不会重复扣款。 |
| A3V2-158 | session_fixture需删除消息后恢复双方库存/时钟，不能只恢复玩家现金。 |
| A3V2-159 | session_fixture需生成旧版本隔离副本并真实升级；只许操作题内副本，不碰用户原存档。 |
| A3V2-160 | 两米可见的精确施法范围证据；不能改为接触距离规避。 |
| A3V2-161 | 与160相同的原生范围证据，即使零魔力负例也须先满足场景。 |
| A3V2-170 | 死亡协议、死亡前100经验及既绑河湾复活点的初态；hpDeficit=8只解决零HP形状，不等于已死亡/已结算。 |
| A3V2-172 | world/meta/bosses.json有boss_mud_tusk（同地、会学习战法），但instances不支持首领身份/适应记录；不能用普通路鬃野猪顶替同一首领。三日前战术观察与记忆也需接点。 |
| A3V2-176 | 公共水沟工作验收事件与本地3点贡献账来源；不能把贡献点塞进普通历史terms当贡献账。 |
| A3V2-177 | 未结议案、六张真实票及结会职权；proposal实例与votes_recorded不支持，无法凭无来源permit补授权。 |
| A3V2-178 | 待审建房申请/地块、提交事件与条例文书原生接点；申请人和有限职位、10铜账户已修，不能预写审批通过。 |
| A3V2-179 | 发布职位派生月额度及未使用记录、任务托管主体/账户；office额外quota字段和instrument实例不支持，不能改成普通物品钱袋。 |
| A3V2-181 | 同一引水事件两地损益、两地实际知情人与地域评价；不能预填统一好感数值。 |
| A3V2-186 | 条件同意/净水后成交报价、同一桶水的浊度/毒病原已检验状态、存量与范围接点；不能去掉turbidityAtMost条件改无条件收购，也不复制造水。 |
| A3V2-187 | 偷窃对象注意方向、正常警觉与一米实测；不能把旁人可见误当受害人已同意。 |
| A3V2-188 | session_fixture需真实离村30天正常推进再回来；不得直接赋日期/远方知识。 |
| A3V2-199 | 秋季日期与太阳/天色派生。daylight不是酒馆道具事实；保留待支持，不将场景说成当前默认春季。 |
| A3V2-200 | 两亩待播田、晴春季、4斤麦种的原生作物/资源账户与单位换算；普通item实例不能quantity=4，资源不能用中文键。目录有净麦粒，但不等于已确认可播麦种；不擅改成燕麦。 |
| A3V2-201 | 成熟两亩麦田、300斤田中存量、季节与本季未收割状态；物件不能冒充作物田，不能提前发到玩家库存。 |
| A3V2-202 | 夏季草药资源点20株、成熟可采存量及药锄工具接点；resource_point和physical_stock尚不能套现有NPC inventory加载。 |
| A3V2-203 | 蚯蚓饵十条、鲫鱼资源点20条与竹竿；目录item_fishing_bait明写谷粒钓饵，不能不改原文就替成蚯蚓。非目录十条库存需要原生计量接点。 |
| A3V2-204 | 本题独立配方时长60分钟覆盖接点；objects.recipe不是配方覆盖，不能删除60分钟改回world默认。 |
| A3V2-205 | 同一刻字铁剑20/100、修至100的25铜/60分钟条件报价、刻字保留及阿砚金属修理能力；不把名字当刻字、不降低修理目标或转嫁给另一师傅。 |
| A3V2-206 | 阿砚现有档案没有skill_life_1_core教学资格，teaches不能授职业；三日预约来源已修，仍需独立角色映射原生能力接点，不改原文换吴朔。 |
| A3V2-208 | 原题60/80生命及左臂未治咬伤；默认玩家maxHp=8，不能仅改成缺20生命或私升等级。药库存已按三日份准确加载，疗伤状态仍待支持。 |
| A3V2-209 | 自家安全卧室/床位的睡眠位置与居住权；owns床不能替代自家卧室，不改成免费租约以消除lodging缺口。 |
| A3V2-210 | 中秋日期、1080—1260普通灯会、谜题和一次领奖状态；rites是宗教仪式契约，不能把普通灯会伪装成祭仪。主办人/一盏原生花灯库存已修，host旧别名仍需绑定。 |
| A3V2-211 | 独立猎户会collective、会长office和50铜会费/公库制度；不借用另一组织或把公库设为会长钱袋。 |
| A3V2-212 | 公开税告示原件/发布来源和吴朔仅听闻丢牛的知识；public文书和rumor知识字段未支持，不能删公开/未知盗者约束。识字与语言形状已修。 |
| A3V2-213 | 升镇后的正式罢免/任职关闭及无公库授权的状态链；已删重复“前镇长玩家”实例，不能用没有任职的默认玩家代替曾任后罢免。 |
| A3V2-214 | 现运单来源被拒（Invalid existing paper, holder or document source）：observed湿损不是可恢复运单的来源。需真实九日风暴滞留/运单链及carrier旧别名绑定；原人物已换郑水生，湿损/冬季日期未丢。 |
| A3V2-215 | 需要新增世界人物：15岁药铺学徒及其真实监护父亲、非监护叔叔，现目录未找到匹配亲属组。还需昏迷与叔叔口头同意的来源，不把叔叔改成监护人。 |
| A3V2-216 | 林地共同议会及真实边界/古树资源点、精怪邻里、采伐资源账户；不能用普通物件拥有边冒充地方法域，继续无许可。 |
| A3V2-217 | 需要新增世界人物：题面实名猎户赵三，当前world/people及factionPeople没有匹配者。需死当出售/旧当票的原生来源链（现文书来源拒绝）；不把新买家改成任意猎户。 |
| A3V2-218 | 需要新增世界人物或补真实归属：钱庄东家（活着、异地受困）。现规则只有keeper沈笃，不等于东家；未核验死亡传闻/停兑状态需原生接点，零准备金不自动代表停兑。 |
| A3V2-219 | 需要新增世界人物及组织：募捐住持与慈航寺；世界档案未找到相符住持/该寺。不可借普通村民、猎户会或另一宗派冒充；木料两份原库存保留。 |
| A3V2-220 | 需要新增世界人物：题面佃户老周；现有姓周人物没有符合此50岁佃户身份者。100铜rent原生义务/十亩租赁与霜灾来源仍待支持，不换成另一笔贷款。 |
| A3V2-221 | 受害人背对但保留听觉/正常警觉、无旁人的局部可感知边界与事后发现损失；不把无旁人写成不可能被发现。 |
| A3V2-230 | 旧磨坊整体authorized_manager无法唯一解析；目录station_hw_mill_bench归loc_hw不证明整座磨坊管理权，不能拿在场阿砚替代签发人。 |
| A3V2-231 | loc_hw集会处authorized_manager无法唯一解析；需真实场地管理权/许可来源，不把吴朔在场当授权。 |

已无setupUnmet但不能据此宣称完整前提/提案通过的接点：182的a3v2_182_landlord→npc_hw_linsui、184的a3v2_184_learner→npc_hw_anhuai，需要原提案场景别名绑定；178/226的相同匿名人物只被setup引用，已统一为安槐。214与210的carrier/host同类别名在上表继续待支持。加载器目前不提供“既有人物别名绑定”字段，本轮未添加无效字段，更未偷改proposal。

198已经拆成8铜薄饼和15铜羊肉两个有效报价，但原proposal.means.quote=a3v2_198_meal_quote是套餐别名，仍需指向这两条原生报价的聚合接点；不允许仅选一条或丢掉任何价格。180的案件与目击已加载，但题面“被抓”的拘束状态没有专门夹具，须执行侧核验，不能把在值房等同已被合法拘捕。225的自家门口和229的公共纪念架仍需位置/实体语义核验，已加载的酒馆展示许可不替代其实体。

复审中拒绝的替换：不能把15岁学生称为学徒；不能用普通野猪代首领适应记忆；不能把谷粒钓饵当蚯蚓；不能把净麦粒或燕麦未经确认当题设可播麦种；不能以keeper代钱庄东家；不能以普通observed替代聊天编辑/死亡协议/任务账/地区贡献。

验证与交接：JSON解析、231个唯一ID、全部非setup字段、前120题、玩家现金库存的逐值核对完成。实际修改40题setup。CORE按指定摘要过滤运行，默认TAP及spec两次管道均结束但未捕获摘要，不能宣称CORE通过；未读取完整测试输出，交主会话补核摘要。未运行浏览器/子进程专项、全量、发布构建或部署，未操作原存档，未执行Git写操作或结束任何进程。下一步由主会话接上述原生/世界缺口与别名绑定，复跑受影响题完整评分后再认定意图验收。

## 第13轮复审（2026-10-22，基于 a3-score-v5a.json，工作树 F:/dnd-wt/A3C 分支 fix2-corpus）

本轮只改本JSON与本说明。231题的id与intent原文逐字未动；改动共63题，其余168题逐值不变（含setup、proposal、expected）。依据：world/lore/factions.json（各组织offices与receptionHours）、world/meta/rules.json governance.authority.offices、world/ontology/holdings.json（持有种类与关闭原因词表）、world/actions/core.json（动作与只读标记）、设计05 §5.3与01 §1.6、06 §6.3；a3-score.mjs只读了限定词词表、companionEffect、rejection词表与setup加载契约；tools/a3-setup/*.mjs只读字段契约。没有读取server-plugin与extension源码，没有动用户原存档，没有读secrets。评分工具仅用于自测。每题改动另在该题proposalNotes里记了“第13轮复审”一条。

### 1. A3V2-020 木匠认证
world/lore/factions.json的office_exam_life_6（木匠入职考官）现任npc_hw_yinge，席位bld_hw_mill（河湾旧磨坊），receptionHours=[[540,720]]。原文“想去行会办个正式认证”的本意是去找当值考官认证，不限于登记转交。处理：location改bld_hw_mill，minute=600（在接待时段内，120分钟考核到720分钟结束，不越出时段），present只列npc_hw_yinge；examinations的examiner.at与作品位置同改为bld_hw_mill，registrar改尹葛本人；删去白石登记员严辙自编的office/holds_office/onDuty（目录无receive_application/refer_examiner，且不是认证授予权来源）；proposal.target改bld_hw_mill。不在白石另造考官，不预置通过，费用20铜与本人作品前提不变。signature的`org:local_guild`、`certified:woodworking`是散文引用，改为`emit(org:faction_lampbridge,request:certification)`（灯桥工匠会即该席位所属行会）与`holding.open(person:self,certified)`。自测：setup无未满足项，route、signature均得分。上一轮“bld_bs_guild联络处”口径作废。

### 2. A3V2-069、079 几何前提
判分报告“声明前提与原生几何矛盾”：原声明水池/渠口/桶均3米，原生分别为0.5米、1.5米、1米，跨越1.5米边界。按原文（获准用水、渠道相通、从池扣水）与世界几何改正：069水池0.5、渠口1.5、田3米（田原本无矛盾）；079水池0.5、渠口1.5、桶1米。facts里的距离描述同步。intent、route、许可与取水量不变。079第二条签名的`thing:own_water_bucket`同时改为`thing:own_feature_hw_kitchen_bucket`。自测：两题setup无未满足项，signature得分。

### 3. A3V2-049 承诺金额
判分记录里承诺义务amount=0（terms.promisedAmount=10，但obligation.create效果本体没有amount）。在proposal的obligation.create效果上补amount=10，terms里的amount、到期、地点、清偿对象不变。签名里的`payment:10_before_tomorrow_sunset`是散文词，改为义务种类`promise`。自测：route、signature得分。

### 4. 空签名却配会提交路由的14行
判分口径：非reject、非clarify的题，空签名等于要求“提交了却没有任何非伴随效果”，只有只读动作才自洽。逐条按原文判断：

| 题号 | 原意 | 处理 |
|---|---|---|
| 122 | 3铜买4铜面包，不赊账 | reject，outOfBounds=true，constructor=false；签名空（拒绝且无应用效果） |
| 126 | 同requestId重发，核对原回执不再买 | reject（同084/103/104的重复花费），outOfBounds=true，constructor=false；签名空 |
| 133 | 先查能否绕道，不抹掉封闭 | 只读core:catalog，签名空（穿越封闭山口本身不做） |
| 161 | 魔力为0仍试施，失败要明说 | reject，outOfBounds=true（魔力守恒），constructor=false |
| 162 | 从没学过的照明术直接施 | reject，outOfBounds=true（能力），constructor=false |
| 165 | 再练一轮并看突破条件，不自动跨阶 | 产生练习学习：signature=`learn(person:self,skill_light:practice)`（同013、194） |
| 166 | 想融合两术，先检查缺什么 | reject，outOfBounds=true（知识前置），constructor=false（why原有“缺前置时拒绝”） |
| 169 | 举杖防守，照实际伤害结算 | signature=`status(person:self,combat_defense)`（同060）；反击伤害是伴随，不预写 |
| 172 | 还是正面试探首领 | signature=`vital(creature:enemy,harm:staff)`（同059，enemy指本次交锋对手） |
| 174 | 隐在树后先观察有无绕路 | 只读core:look，签名空（世界无潜行状态，隐蔽成败本来“未保证”） |
| 175 | 先登记居住，再查户籍/公民条件，符合哪步办哪步 | 保留open:proposal，signature=`holding.open(person:self,resident_of)`，proposal补对应效果；其余是只读，不开户籍/公民 |
| 178 | 交给管事日结审批，出门一天后再看 | signature=`time(world,minutes:1440)`（core:time的耗时即请求本身，非伴随）；审批与收10铜由管事自主，不入签名 |
| 185 | 散步休息一天，看明天发生什么 | signature=`time(world,minutes:1440)`，理由同178 |
| 215 | 先查叔叔有无代同意权，没有就找合法紧急救治办法 | 只读core:settlement.family_inspect，签名空 |

reject类改动后，空签名按“实际拒绝且应用效果为空”判分；这些行的拒绝回执码若不在评分器REJECTION_DOMAINS词表内（见交接），评分器不给签名分，那是评分/引擎侧问题，不是题面问题。

### 5. 伴随效果出必需签名
013、016、194：删去`time(world,practice)`，练习耗时是伴随（判分诊断“no non-companion time effect”），本意不是等待；只保留练习学习。074：删去`time(world,rite_stage)`，同理；其`resource:own_offering`是散文词，改为setup里真实的干粮`resource:own_item_ration`。072：删去`vital(person:self,magic_cost)`，魔力消耗是施法成本，由回执cost排除。顺带132、197（睡眠，时间本身是请求，且体力与疲劳同时结算）补`time`与`vital(…fatigue)`，与004/005同形；197题面“睡到五时”用`time(world,minutes:540)`，132用`time(world,until:dawn)`。

### 6. 描述词结构化
判分现在只认词表内的结构化限定词。对话类动作（ask/tell/guide/persuade/assist等）的emit payload只有kind与content文本，话题词（如bread_quote、lodging_terms、witnessed_beast）只存在于散文里，词表无法核验，因此不再放进签名，改为只验“向该人发出request或tell”这一结构化事实；原文要求的话题由setup里的结构化事实承载，各题proposalNotes列出了承载字段（例如123的setup.quotes、043的setup.history/knowledge里北林边观察事件、192的quotes/appointments/objects）。涉及：009、019、028、029、035、037、040、042、043、045、046、047、048、068、072、078、080、089、095、110、123、134、137、138、139、140、143、144、146、150、154、164、171、188、190、192、193、195、196。要点：
- 引用改真实ID或setup别名：`species_food`→item_oats，`cloth_repair_materials`→item_hemp_thread，`present_water_bucket`→present_feature_hw_kitchen_bucket，`own_debt_to_linsui`等→a3v2_035_loan等setup别名，`present_interpreter`→npc_hw_shendu。
- create类只认标签，`improvised`、`research_tool_handle`、`research:rain_grip`、`illusionary`无标签，签名只验create的对象种类（材料与课题在proposal.facts/materials/setup结构化）。
- 037：`redeemed`不在持有关闭原因词表（holdings.json reasons），赎回后质押解除的词表原因是`released`。
- 072：`person:self->summon`的当事人流向要求两端同为person/org，召唤物是creature，改只验义务种类`upkeep`。
- 110：schedule无描述词；排期时对吴朔的告知是同一动作的结构化记录，“到点才发生的request”不是此刻效果，不入必需签名。
未处理但同类的行见交接（需先有setup接点才能核验）。

### 7. 职位目录
读world/lore/factions.json各组织offices与world/meta/rules.json governance.authority.offices：目录里只有各行业入职考官（certify）、环城郡丞（administer_public_assets），以及榆坡/苇汀/砾泉/桑坂四村的工役协理（public_project、quest_publish）、村长（public_project、quest_publish、housing、tax、steward）、村管事（housing_review）。05 §5.3的“可设职位表”也据此判。结论：
- 020：已按第1节移到考官席位，考官职位来自目录。
- 178：原operations`review_building_application`不在目录词汇，改为目录里管事的权限名`housing_review`；但目录管事职位只覆盖四个白石辖村，河湾loc_hw没有，仍无法加载，交主会话。
- 051–054、056–058、090、091、105、211：所需职位在世界目录里根本不存在，语料没有可缩小成目录子集的版本，未改题面、未删场景约束，保留原样等待世界数据，名单见交接。

### 自测与交接
见文末“第13轮交接”。

## 第13轮交接

自测命令：`node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/fix2-corpus-score.json`（TEMP/TMP=F:/dnd-tmp，单进程）。结果对比 a3-score-v5a.json：route 0.593→0.615（137→142/231），signature 0.442→0.615（102→142/231），constructor 0.139→0.221，setupUnmet题数75→71，unsupported 92→87；新增得分81项，退步7项（见下，均为按原文改成reject/加签名后暴露的评分/引擎侧问题，不是题面回退）。无未满足setup的改动行里，020、069、079、049及全部描述词/伴随效果行signature转为得分。

交主会话事项：
1. 世界数据缺职位（不属语料可改，未动世界）：白石镇loc_bs——镇巡值房bld_bs_watch的受理报案receive_report（051）、罚款代收collect_fine（054）、拘禁看守guard（090、091）、案件经办handle_case（058）、拘捕执行（057，玩家当班持有的executor）；白石镇公署bld_bs_office的受理上诉receive_appeal（052）、受理索赔receive_claim（056）、白石镇长town_head（105，现有office_village_head只辖四村且无town_head）；河湾loc_hw——村口门卫受理自首receive_surrender（053）、建房审批管事housing_review（178，目录管事只覆盖榆坡/苇汀/砾泉/桑坂）；211的猎户会collective及会长admit_members（目录无此组织，faction_fieldguild是原径冒险公所，不能借用）。020的登记员职位(receive_application/refer_examiner)同样不存在，已按考官直接认证处理。
2. 评分器REJECTION_DOMAINS词表不含ACTION/PRECONDITION/SPATIAL：161、162、166已按原文改为reject且引擎确实拒绝，但拒绝码为E-ACTION-SPATIAL-FACTS或E-ACTION-PRECONDITION，评分器记“reason code is outside the rejection vocabulary”，signature不得分（162、166因此较v5a退步）；需要引擎改用词表内的拒绝码（如魔力不足走VITAL、未学走LEARN）或评分器扩词表。
3. 122：改reject后，引擎对“3铜买4铜两块面包”仍提交成交（两笔transfer），记为outOfBoundsLeaks/Applied，这是引擎真实缺陷（余额不足应拒绝，不应自动改买一块）。126：trade_completed的requestId回执接点仍无（第11轮已列）。
4. 169：引擎回“这个实体不是交锋对象”，野猪instance未被识别为交锋对象，签名status combat_defense因此无法核验。175：proposal里的holding.open resident_of被引擎判needs_alternative并回落open:leave_mark——设计上居住登记有目录动作core:settlement.civic_residence，请主会话裁定175应否改route为该动作（本题保留open:proposal组合口径）。174的core:look未被引擎路由（clarify）。
5. 同类“话题只在散文”的签名尚未改但暂时无法核验（被setup或引擎阻断，待能跑通后复核）：法律类051、052、056、058的claim/request限定词用的是评分词表设计好的`*_with_evidence`、`if_accepted`形态，保留；141(claim:paid)、147(remember:)、180(confession)、182、214、217、219等emit话题词，以及066、120、131、231。072的person:self->summon受评分词表所限（两端须同为person/org）。
6. 第11轮“待支持”清单里与本轮相关的条目（020的考官席位、069/079的几何、049的金额）已解决；其余不变。

## 第14轮（主会话，10-22）
- A3V2-122：提案只有文字、效果为空，真实游戏中模型会给出结构化数量；按题面“两块面包”补 means {item:item_bread, quantity:2, seller:npc_hw_linsui}。期望不变（余额不足应拒绝）。
- A3V2-130：同理按题面补结构化效果 move(self→loc_capital, mode:teleport)；期望不变（无此能力应拒绝）。撤回引擎为这道题新加的“传送/瞬移”词表关卡。
