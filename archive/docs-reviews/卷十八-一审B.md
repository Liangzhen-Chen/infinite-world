模型：claude-opus-5-5，中档（主会话 11-13 按派活记录补注）
# 卷十八 一审 B

审查对象：`卷十八-社会关系与家族.md`（1064 行）。侧重：断言能否机判与绕过路径、模板齐全、现状与迁移清单完整（含 ROMANCE 正则处置）。
已读：本卷全文；审卷须知；素材包 卷十八-素材.md；全书概念台账 卷十八小节（430–444 行）与第五节；卷二 §1.5、§1.12（314 行）、§2.9 第 4 条 rxTree（786–802 行）；卷一 234、248 行；卷四 §4.4 相关行；卷零 849 行；卷二十六 相关行。
代码抽查（静态读）：standing.mjs:25/61/105、family-law.mjs:19/42/77–83、notables.mjs:23/25/97/102/161、deterrence.mjs:3、boss-negotiation.mjs:98–101、npc-cognition.mjs:40/128、lies.mjs:21/96、duels.mjs:19、npc-decision.mjs:13、npc-memory.mjs:37、npc-rumors.mjs:7，§7 已列的这些行号全部对得上。另查到 §7 漏列的位置见第 1、15 条。world/ontology/holdings.json 现役 42 种，与 §8 Q1 一致。

## 真问题（15 条）

### 1. 未成年人与亲密判定的旧实现大面积漏出 §7，ROMANCE 正则没有去向（类别 7、8）
- 位置：§7（985–1001 行）；R18-9.2（736 行）；A18-9.1（767 行）。
- 证据：本卷 §7 没有提到 population.mjs，也没有提到另外几处“第二处亲密资格判定”。下面这些是实查到的：
  - population.mjs:356 定义 `ROMANCE=/恋爱|恋人|情人|…|心仪/`；:405–407 用 `identity.age<18`、`flags.romanceable` 和 `ROMANCE.test(all)` 拒收档案；:398 用 `k.relation==='子女'` 加 `/(我|他|她)…(儿子|女儿|孩子|子女)/` 读背景文字。
  - action-consent.mjs:10 用 `/romance|intima|恋爱|亲密/.test(scope+purpose)` 加 `actionAge(...)<18`。
  - npc-relations.mjs:114–117、128 用 `age<18`、`flags.minor`、`eventType==='恋慕'` 拦恋爱写入。
  - npc-life.mjs:174（`adultAge??18`）、:233（`flags.romanceable`）、:244（未成年拒婚）、:340/:349（出生时写死 `flags:{minor:true,romanceable:false}`）、:991（校验 `adultAge<18` 报错，是以年计的常数）。
  - activities.mjs:311（`flags={minor:entity.age<18,romanceable:entity.age>=18}`）、population-service.mjs:46、remote-generation.mjs:398（写死 `romanceable:true`）。
- 后果：A18-9.1 要求全库只有 `intimateAllowed` 一处做亲密资格判定，按现状扫描必然失败，但卷十一拿不到迁移清单。`flags.minor` 与 `flags.romanceable` 是派生量 `adult` 的落盘副本（多一个写者），本卷没说要退役。卷一 248 行规定档案校验改为拒收“未成年且任一关系行 `intimate` 为真”的档案，这条校验本卷没有承接，也没有指明交给哪一卷。
- 建议：§7 逐行补齐上面这些位置并写明去向。ROMANCE 正则删除，数值半边改调本卷谓词（见第 2 条），文字半边交卷九 §4.19 的 `reject:minor_romance`。`flags.minor` 与 `flags.romanceable` 删除，改读 `adult`。档案校验的数值规则写进 R18-9.x 或明确交给卷四。

### 2. 守门读的“数值半边”在三卷里说法不一（类别 4）
- 位置：R18-9.2（736 行）、§3.2（226 行）。
- 证据：本卷说守门读的数值半边“就是 `intimateAllowed`”，这是一个双人函数，而且判定线是可配置的 `minor.intimateMinRelMaturity`（校验只要求 ≥ 1，可以配成 1.1）。卷四 §4.4 L-7（510 行）和交互（514 行“卷九 §4.19（守门读 `adult`）”）说读的是 `adult`。卷零 849 行把数值半边归卷四 §4.4。档案校验只针对一个人，双人函数套不上去；判定线一旦配到大于 1，两套判据就会分叉。
- 建议：在 kin.mjs 定义单人谓词 `intimateEligible(p)`，`intimateAllowed(a,b)` 改为两人各调一次。守门与档案校验一律调单人谓词。同时提请卷四把 514 行的“读 `adult`”改为引用本谓词，或者删掉可配置的判定线、只保留 `adult`。

### 3. 亲密硬下限有整类绕过（类别 7）
- 位置：R18-9.1（735 行）、§4.12.1（875 行）、A18-9.2（768 行）。
- 证据：硬下限只拦两种东西：带 `intimate` 的关系条目，以及挂了 `social_act` 行且 `intimate` 为真的动作。`social_act` 是“挂在动作目录条目上”的可选行，所以没挂这一行的亲密动作不受拦截。持有种类也一样，别卷登记的、`carriesRel` 为假的种类（比如卷八b 日后登记的人身依附类种类）没有 `intimate` 字段。另外 `relMaturity = ageYears ÷ species.maturityYears`，内容包可以把一个人形物种的成熟龄登记得很小，本卷和 E-KIN-REGIME-AGE 都不检查这一点。
- 建议：把 `intimate: boolean` 设为动作目录条目和持有种类行的必填字段，缺了就在加载期报错。持有写者对所有 `intimate` 为真的种类调硬下限，不论是否带关系。A18-9.2 的性质测试改为遍历全部种类行和全部动作条目。成熟龄的下限交卷二十八内容审批做一条数值校验（读物种维度，不点名物种），并写进 §5.2。

### 4. 迁移持有种类表时丢了旧表的字段（类别 1、8）
- 位置：§4.1.1（262 行）、§4.1.5 列定义（289 行）、§7 第 998 行。
- 证据：world/ontology/holdings.json 每行除了新表的列，还有这些字段：`hooks`（例如 :290、:329、:367、:406、:478、:734、:835、:894、:958、:1024，都是“`judgment:insolvency` 时转 `estate`”）、`visibility`、`contest`（如 `rank`）、`incompatibleWith`（kin 的 spouse 变体为 `forbid`）、`transferable`（owns 为 true）、`terms`（kin 为 `type, affinal`），变体级的 `concluded`（spouse 为 true），以及顶层 `reasons` 族（18 种关闭原因：divorce、judgment、conquest、escaped、pardoned……）。新表的列里一个都没有，§4.1.1 的 `termsKeys` 也不在数据实例的列里。§7 只提了 `variants`。附录自检第 10 项“旧行逐格一致”只核对了新列。
- 建议：逐个字段写明去向。破产钩子归卷八b 还是保留为种类行的列，要写清楚；`transferable`、`visibility`、`contest` 加列，或者写明归哪一卷；`reasons` 登记为封闭词表族（终止原语和事件都要引用它）；`termsKeys` 补进数据实例。

### 5. 关系条目和持有种类之间没有对应字段，婚配的“须同意”在迁移中丢失（类别 1、5）
- 位置：§2.2 relation 行（121 行）、R18-1.5（276 行）、R18-5.1（537 行）、R18-12.3（887 行）。
- 证据：`carriesRel` 为真的种类有 hk_kin、hk_bond、hk_guardian_of、hk_companion 四种，但关系条目没有字段说明自己挂在哪一种上。写者可以把 `rel_lover` 写在 hk_kin 上，从而拿到亲属的传导系数，校验拦不住。`concluded` 只按种类给值：hk_kin 为 false，可旧表里 spouse 变体是 `concluded:true`。hk_bond 也为 false，于是 `rel_lover` 只要双向好感够了、接触次数够了，R18-5.1 就会直接提出亲密关系边，不经过任何同意动作，这和 R18-12.3 里求爱需要 `needsConsent` 互相矛盾。
- 建议：关系条目加 `kind: ref vocab holding_kind`（加载期校验该种类的 `carriesRel` 为真），再加 `concluded: boolean`。`intimate` 为真的关系一律 `concluded`，形成时必须走同意动作。

### 6. “每人至多属于一个家户”没有机制保证；户主重复计入成员（类别 7、5）
- 位置：A18-2.2（407 行）；hk_household_member、hk_household_head（293–294 行）。
- 证据：`exclusive` 的含义是“同一标的至多一条现役边”，管的是标的一端，管不到持有者一端。hk_household_member 本身 `exclusive` 也是 false。没有任何字段或校验能阻止一个人同时有两条家户成员边，A18-2.2 只能事后抓违例。另外 hk_household_head 挂在上位词 hk_member_of 下，而且 `membership` 为真，户主如果同时有一条成员边，`org.memberCount`（传承行 `requires` 要读它）就会把户主算两次。
- 建议：种类行增加持有者一端的上限，例如 `holderMax: integer nullable`，由持有写者校验，家户成员行取 1。规定户主不另写成员边，或者计数时按持有者去重，写进 §4.2.1。

### 7. 立场数据实例的算术和种类表不一致（类别 5）
- 位置：§4.4.5【西陲】【非西陲】（508–509 行）；§4.10.5【西陲】（810 行）；附录自检第 12 项。
- 证据：例子写“成员边 `conduct` 0.5 传来 −15”。商人是持有者，按 R18-4.4 用 `conduct`，可种类表里成员类边的 `conduct` 是 hk_member_of 0.4、hk_business_member_of 0.3、hk_household_member 0.6，没有 0.5（0.5 是 hk_member_of 的 `adopt`）。按 0.4 算，传来的是 −12，合计 −14，档位是“中立”（lt 15），不是“戒备”。§4.10.5 的西陲例子又以“戒备”为前提往下推。自检第 12 项标的是通过，说明脚本没有对照种类表复算。
- 建议：改正系数和结论，并把§4.10 的例子一起改；自检脚本的复算要从表里取系数。

### 8. 本卷的 RX 超出了卷二 rxTree 的运算集（类别 4）
- 位置：§4.2.5 `weightRX: "3 - min(subject.birthOrder, 2)"`（394 行）；§4.12.5 `chanceRX` 中的 `max(...)`（901 行）；§4.10.5 `guest.heldBy(host).excluding`、`guest.holds(host).permit`（801–804 行）；§4.4.5 `observer.culture.acceptance[target.culture]`（501 行）。
- 证据：卷二 §2.9 第 4 条（789–799 行）的 rxTree 只有 num、dim、handle、四则、cmp、and/or/not、agg、clock，没有 min/max，没有方法调用，也没有按另一个实体的值去索引。本卷还用到了好几个没有绑定说明的变量：`stanceTier`、`pressure`、`groupSize`、`informedShare`、`event.meritShare`、`elder.*`、`org.memberCount`、`subject.netWorth`、`subject.household.netWorth`。卷二 314 行规定 filter/when 只读基值维度，可这里读的大多是派生量。
- 建议：每个 rx 字段在 §2.4 或各节维度里列出它的变量表（名字、来源入口、类型）。确实需要的运算（min/max、按持有边查询）提请卷二 §2.9 增加 op，并写进 §5.2，或者改写成 agg 的形式。

### 9. 待遇规则读的是种类表里没有的字段，实质上是在点名种类（类别 1、2）
- 位置：§4.10.5（801–804 行）；R18-10.5（790 行）。
- 证据：`excluding` 和 `permit` 都不在 §4.1.1 的种类行字段里。`permit` 实际上就是 `hk_permit` 这个种类名，这违反了 R18-10.5“读种类字段的行，不点名种类”，也违反了 S18-2。
- 建议：种类行加 `excludes: boolean`（被逐、通缉两行为真）和 `grantsEntry: boolean`（许可行为真），待遇规则改读这两个字段。

### 10. 有常数不在规则表里，有判定缺字段（类别 2、1）
- 位置：R18-3.5“支系成员数与名望达到规则表阈值”（427 行）；R18-5.5“保留度低于阈值则不转述”（541 行）；R18-12.2“权重 = 基础 + …”（886 行）；R18-2.7“落到其家户所在聚落的职位”（376 行）。
- 证据：§2.4 规则表没有立支阈值、转述阈值、对象选择基础权重这几个键。R18-2.7 没有说明兜底的是哪一类职位，也没有给出判定这类职位的字段（例如职位行的 `guardianOfLastResort`）。`kin.accept` 没有数据实例，§4.12.5 例子里用到的 wRegard=1、wCompat=0.5、acceptMin=25 找不到出处。
- 建议：在 §2.4 补 `lineage.branchRX`、`lies.discloseMin`、`social.pickBase` 等键。职位兜底改为读职位行上的一个布尔字段，由卷八登记。补 `kin.accept` 的数据实例。

### 11. 有封闭枚举、词表族和字段只用不定义（类别 1）
- 位置：§4.9.1、§4.9.5（721、754–755 行）；§4.3.5（439 行）；R18-7.5（637 行）；§4.11.1（825 行）对照 §2.2（123 行）。
- 证据：`transfer.direction` 用了 `to_bearer_house`、`to_nonbearer_house`，`divorce.initiators` 用了 `either`、`none`，附表里没有这两个枚举的取值。`legacy.track` 引用的 `track_example_kin` 所属的族既没登记，也没有前缀。R18-7.5 的“丑闻标记”是加在卷二十四事件类型行上的字段，没有字段名，§5.2 也没向卷二十四提出这一项。`fear_tier` 的 `complyFactor` 不在 §2.2 列出的条目字段里。
- 建议：在附表和 §2.2 补齐取值和字段，并在 §5.2 列出对卷二十四的字段请求。

### 12. A18-11.2“无新事件时 dread 单调不增”这个命题不成立（类别 5、7）
- 位置：A18-11.2（868 行）。
- 证据：恐惧轴有静态行 `target.deterrence - observer.deterrence`（855 行），威慑量会随装备、随从、能力变化，这些变化不是立场事件。胆量读的是有效人格，人格会被修正项改变（比如醉酒）。所以没有新事件时 `dread` 也可能上升。“无新事件”本身也没有可以机判的定义。
- 建议：改为“在静态行输入和胆量不变的区间内，事件部分 E 单调趋近 0”，并给出机判方法：固定维度快照，在两个时刻读 E。

### 13. 私人关系的形成和解除，触发点不全，也没有一致性断言（类别 7）
- 位置：R18-5.1、R18-5.2（537–538 行）；A18-5.x。
- 证据：解除只在两种时刻求值：条目到期删除时、新条目生成时。下面这些情况都会让读数越过 `drop` 却不触发解除：条目线性衰减时在两次到期之间越过阈值；静态部分 S 变化（文化接纳、关系基数）；传导部分 C 变化（对方入会、离会）。本卷也没说读数里是否包含该关系自己的 `stanceBase`：包含的话，`rel_friend` 的 +20 会让“低于 10 才解除”几乎达不到。断言里没有“现役关系边与 form/drop 一致”这一条。
- 建议：规定比较时用的读数不含本边的 `stanceBase`。线性衰减可以算出越线时刻，登记为到期项。持有边或维度变化事件也要触发重新求值。补一条不变量式断言：每个推进拍结束时，现役关系边都不满足 `drop`。

### 14. 好几条扫描式断言没给出机判判据，存在整类绕过（类别 7）
- 位置：S18-1、A18-4.1（247、515 行）；A18-9.1（767 行）；A18-3.1（452 行）；A18-10.1（817 行）。
- 证据：
  - A18-4.1 只查 `state.stance` 和 7 个旧路径。别的系统换个字段名存“每对一个数”就能绕过。现有的 npc-relations.mjs 正是这样：relationEvidence 有 trust/affection/respect/romance 四维，加减量写死在 :20、:28、:34。“以数值增量为参数的立场写函数”没有可执行的判据。
  - A18-9.1 的“第二处亲密资格判定”没有给扫描模式。
  - A18-3.1 的“姓氏或家名字面量”没说拿什么词表去比。
  - A18-10.1 的“待遇判断”范围不明。
- 建议：
  - A18-4.1 改为：state-owners 里，除 stance 之外，任何声明为“实体对实体到数值”结构的字段都报 E-STANCE-BYPASS；stance.mjs 导出的函数一律不收数值参数，用签名扫描来查。
  - A18-9.1 改为：kin.mjs 之外，同一函数里同时读 `adult` 或 `relMaturity`、又读 `intimate` 字段，即为命中。
  - A18-3.1 改为拿世系组织行的显示名表做比对。
  - A18-10.1 写明所扫的文件或系统键。

### 15. §7 迁移清单在家族、婚姻、继承、关系代码上漏项多（类别 8）
- 位置：§7（985–999 行）；§3.4（243 行）。
- 证据（均为实查，§7 没有列）：
  - family-state.mjs:7（`adultAge??18`）；:8–9、:14、:27–29 是中文关系类型集合（“子女”“父亲”“兄弟”“儿媳”……），也就是 §7 第 994 行“relationship.type 中文枚举”的实际所在，但那一行没给 file:line。:27、:29 用 `'女男'`、`p.sex==='女'` 读性别名，违反 §4.2.1“读 `bears`，不读性别名”。:34 有 `'在婚'`。
  - family-inheritance.mjs:27、:30、:33、:35：监护状态 `'代管中'`、`'待指定'`、`'已结束'`，以及中文理由。
  - family-diplomacy.mjs:12、:17、:30、:35、:37 是中文状态；:25 用 `adjustStanding` 写死联姻好感 `marriageStanding??10`；:33 是本地清醒判定。整个文件（婚盟转联盟）的去向（卷八 §4.14）也没写。
  - family-politics.mjs:66 “养亲须比子女年长至少十八岁”，是以年计的常数，违反 S18-5。
  - npc-relations.mjs:17–34：中文义务类型和状态（`'已完成'`、`'违约'`、`'付款'`、`'带路'`）；写死的立场增量（trust:3、−5 等），这些应当改成来源行。旧的 respect、romance 两维映射到哪条新轴，没有交代。
  - npc-life.mjs:209–212、:362、:368、:944 有 `'在婚'`、`'丧偶'`、`r.type==='配偶'`；:992 有 `kinTypes` 含 `'配偶'`。
  - household-subsistence.mjs:303 有本地状态列表 `['患病','濒死','昏迷']`。
  - reputation.mjs:65 有 `sourceType:'目击'`。
  - 第 988 行只写“7 份旧存储删除”。宠物忠诚、首领认知、灵怪积怨各自改成哪种来源行或关系基数，没有映射。§3.4 的“18 个调用文件”、第 989 行 memoryStream 的“22 个直写模块”（素材包口径共 40 个文件含读），都没给清单。
- 建议：按文件逐行补齐，每行写明去向；7 份旧存储逐份写出映射；18 个文件和 22（或 40）个文件给出清单，或者明确引用素材包或调研中的具体行。

## 小项（只记账）

- 跨卷引用标题和原文不一致：卷六 §4.1 原题“账本三元键与守恒”（本卷写“账本与资源种类表”）；卷六 §4.12 原题“家户预算与日耗”。
- E-HK-PROTOCOL 写的是“三种触发乘持有者模板的每个格”，但数据里每种触发只有一个值，不分模板。措辞对不上。
- R18-5.3 读“p 对事件受事者的好感”，p 本人就是受事者时怎么取值，没有写。
- §4.6.5【西陲】把“某村”当作群体，但触发行的 `groupFilter` 读的是 `group.orgKind`，地点居民集合没有这个字段。
- R18-7.3 的年度消退按比例转出，取整方式没写（R18-2.5 写了）。
- `ireg.escheat` 写着“取账本登记的汇或上级组织”，一个字段混用两种类型。
- §4.4.5 只给了好感轴的档位表；`stance_tier`、`treatment` 的条目（order、access、serviceFactor）都没有数据实例。
- R18-2.1“按生母所在家户”建议改写为“按生育方（`bears`）所在家户”，和 §4.2.1 的口径保持一致。
- 附录自检第 10、12 项的通过结论不可靠（见第 4、7 条），自检脚本需要补上对照旧表和种类表的核对。

## 模板核对结论

§0–§8、术语表齐全；十二个子系统各有六小节；每节的数据实例都覆盖了西陲、非西陲、非人类、超自然；每节都有扫描式、不变量式、扩展性式三类断言。模板层面没有缺节。问题集中在断言能否机判（第 3、12、13、14 条）和迁移清单（第 1、4、15 条）。
