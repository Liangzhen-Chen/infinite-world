# KICKOFF 开工包（S5 合入后第一批）

编制 2026-11-11。只读核对 docs 与 F:/dnd-wt/MKT（b7f2bb85，未改动、未运行程序）。行号以 MKT 为准；设计文档行号比 MKT 小 4–26 行（如 holdings.mjs:318 现为 :322，faith_omen 现在 faith.mjs:196），派卡时让执行者按函数名找。每卡验收都含"grep 无字面量分支"，测试云上跑，两轮审查加内容哈希批准，不逐卡重复。规模为我按触及文件数与风险估的相对档，设计册无人日依据。

## 一、八张卡

### 卡 1　NM-0 红线与口径文档（命名/古神）
- 目标：把"古神只能对话与赐物"和"十二神口语名"写成正式口径，后续数据卡有据可依。
- 改动：只改 docs：架构设计 13 §13.1:13、04 §0、03、需求-超自然、修订记录（新条文全文见命名方案 §6.2）。无代码。
- 验收：§6.1 列的每处原条文已替换；§10 九个待拍板点逐条有结论。
- 依赖：**红线反转须李白核对（PLAN:663 记亮圳 02:30 已定，与命名 §10-1 要求点头矛盾，见第三节）；核对前不开工**。不与任何卡冲突。
- 规模：小（纯文档）。

### 卡 2　NM-1 神名与重字改名
- 目标：十二神在界面与文本里显示口语职司名（田公/田垄之母等），"覆灯"不再同时是神名、族称、地名、考试名。
- 改动（均核实存在）：deities.json 12 条加 `names{zh,west}`、`namesByCulture`、改 `name` 与 prose；另 10 个数据文件的旧名替换（cultures、factions、festivals、history、rumors、regions、monsters、rules、spells、baseline；MKT 上实测 202 次，与设计数字一致，引擎代码 0 次）；county_xingwan_fudeng 郡名改北湾郡（id 不动）、rules.json 考试"覆灯值课"改冬储值课；world/design 6 个脚本与 tools/w2-s4-content.mjs；tests 2 个（tests/fixtures/legacy-r2-primitives.json 冻结夹具、tests/w5-integration.test.mjs，共 204 次）。**设计里"按观察者文化的 naming.style 取 names[style]"这段显示读取代码目前不存在**（faith-catalog.mjs:13/20、faith.mjs:120 都直接读 name）；须新增一处按字段读取的投影，位置由执行者先报。
- 派生：显示名读 `names[观察者文化.naming.style]`；cultures.json 现在没有 naming.style（只有散文 structure），本卡须先给 18 条文化补该枚举，**因此与 WD-01 同改 cultures.json**。
- 验收：N1（旧名数据内 0）、N2（覆灯 0）、N3（deity_* id 集合与旧版相等）、N4 E-NAME-DUP；church.name 与 taboo 字节不变（magic-ritual.mjs:81 逐字比较）；**"规则状态哈希"**（本卡验收用）：推演 30 日后的存档文档，删去"显示文字类"字段后用 storage.mjs 的 `canonical()` 序列化取 sha256，改名前后相同才算过。删除规则：**按路径限定、只删字符串值**——限定路径下键为 `name`、`names`、`aliases`、`prose`、`description`、`label`，以及编年/事件摘要的 `text`、`summary`、`keywords`、叙述 `lines`；同名但值是对象、数组、数字的一律保留（否则会吞掉规则状态）。**排除口径的唯一来源是卡 3 的 digest-exclude.json（AI-05 §4.2，数据表、不改算法）**，卡 2 只在同一实现上叠加"名字类"一层，不另写一份；**卡 2 依赖卡 3 先合入**（不建临时表，避免两份口径）。不能直接用 storage.mjs 的 `digest`：它是整份存档完整性校验（:686/:712），含全部名字，改名必变。执行者须报告被删路径前缀清单，由主会话核定。**反向对照**：在存档副本里改一个持有数量，哈希必须变。**种子**：全仓 grep 种子拼接处（不只 `randomSeed:`；如 remote-generation.mjs:816 是 `seed:\`${s.name}:${s.id}:…\``，聚落名进了种子），NM-1 若触及聚落名，该处差异须逐条解释而非放水。**按名解析**：id 驱动的推演抓不到按名字解析的行为（summons.mjs:147 用 `row.name===requested` 与法术 aliases 匹配玩家输入；magic-care.mjs:167 用 `r.name.includes('园艺')`；spells.json 在改名范围内）；须加检查：每个被改名实体，新名解析回原 id，旧名处置有结论。云上等价不变量（同时要过）：实体 id 集合相等、账本总额相等、事件类型序列相等且**带 actor id 与金额**（否则分配错位抓不到）；旧存档钉住旧快照重放哈希不变（storage.mjs:601/:620 initialHash，同版确定性，不加兼容代码）。
- 依赖：S5 合入 master 与 NM-0 批准；卡 3（AI-18）先合入，提供 digest-exclude.json；EC-1 收口（同改 rules.json 与 residents；EC-1 目前只有诊断、估 3–4 工作日，所以启动条件是"EC-1 收口"而非日期，命名方案的"11-12 起 NM-1"不成立）；**必须先于 WD-01**。
- 规模：中（约 30 个文件，机械替换为主，风险在热点文件与冻结夹具）。

### 卡 3　AI-18 种子键登记、旁路记录（sideband）、哈希范围核查
- 目标：每次模型调用都留可回放记录，换模型或断网重放不改任何规则状态。
- 改动：新建 world/rules/tables/seed-keys.json（**不存在**）与加载校验 E-SEED-KEY；统一函数 `recordSideband()`（**不存在**），接入 consistency-service.mjs:39、:277 的 `client.generate`、population-service.mjs:34、:36、npc-planning-service.mjs（经 tools/npc-autonomy-planner.mjs），写 `<store>/<campaign>/sideband/<turn>.json`；只读报告：storage.mjs:14 `digest` 的覆盖范围；**新建 world/rules/tables/digest-exclude.json（AI-05 §4.2，规则状态哈希排除口径的唯一数据表，按路径限定、只删字符串值）及读取函数，`digest` 算法不改**。
- 数据来源：前缀表取 AI-04 §6.1；现有种子散在 combat.mjs:63、farm-pests.mjs:34、weather.mjs:70、population.mjs:40、remote-generation.mjs:57，先全量盘点再登记。
- E-SEED-KEY 发现方式：扫描 server-plugin 的种子调用点（sha256 拼接串、`stream(`、seededRandom 入参）提取前缀，与登记表双向比对。
- 验收：VAI-04-10（grep 范围是 server-plugin；extension/core.js:175 的 Math.random 在范围外，另行登记处置）、VAI-04-11；写入点单测（每次调用恰写一条，含 requestHash/model/status）；哈希范围核查报告；digest-exclude.json 单测（加载校验、按路径只删字符串值、反向对照：改持有数量哈希必变、改显示名哈希不变）。**VAI-05-3（断网重放）与 VAI-00-4 完整版移到卡 5**，因读取方在卡 5 的 replay.mjs。
- 主持模型（酒馆）调用的记录通道（客户端到服务端，经 extension/turn-contract.mjs）设计里未写：本卡先出方案报主会话，并与通用门卡 1（同改 turn-contract.mjs）协调。
- 依赖：无。冲突：consistency-service.mjs 成为新热点（AI-09 在 B6 也改）。
- 规模：中（接入点 4 处加种子盘点；风险是接入点漏）。

### 卡 4　AI-01 aiProfile 统一开关
- 目标：设置页一键选四档（无 AI/轻理解/叙述/全开），亮圳答复 P00-1 前，默认值保持现行为的等价档（extension/turn.mjs:2–4 现为 intent=propose、narration=sync，即全开档），默认值只放一处常量；T0 作为可选项先上，"T0 为默认"只是待确认的推荐值，不在本卡生效（否则升级会静默关掉现有玩家的 AI；且"off 改预填构造器入口"推迟到 AI-03）。档位只存客户端设置，不进存档。
- 改动：extension/turn.mjs:2–4 `actionModes`、extension/ui-settings.mjs:13/:41–45/:59（intent/narration 两个下拉改四档卡片，读旧写新一次）、extension/runtime.js 的读取点 :106、:229、:287、:340、:344、:345（"自由输入理解已关闭"文案）、:491、:499、:523–524。`aiProfile`、`understand/narrate/npcVoice/assist` 均**不存在**；"off 改为预填构造器入口"依赖 AI-03（B3），本卡先保持 off 现状。
- 派生：全部读 aiProfile，行为只按枚举值分支，不按文案。
- 验收：切换档位前后存档文档 diff 为 0（档位只在 ui-settings）；旧键迁移一次且往返无损；T0 文案与 AI-01 §8 一致；T0 下全部玩法可走菜单与构造器。**不含回放类判据**，VAI-00-4 完整版（T0 对 T2 回放 30 日哈希相同）在卡 5。本卡不依赖卡 3。
- 依赖：无；若 Jev J3 同期做，合并其 `judge` 开关（P00-2 待决）。
- 规模：小到中（纯客户端 3 文件，读取点 10 余处）。

### 卡 5　AI-21 录制回放与新题集 N
- 目标：用真实试玩留下的旁路记录回放，不再调模型也能做回归。
- 改动：tools/replay.mjs、tools/replay-fixtures/、tools/coverage-report.mjs（均**不存在**）；夹具绑定提交、contentHash、模型 id、种子；题集 N 由不读代码的 Sonnet 子代理编写。
- 验收：VAI-05-14（改 contentHash 后文字断言标 stale，结算回归仍跑）；R24 基线测出；**VAI-05-3**（带旁路记录的存档断网重放 0 次 fetch、哈希相同）与 **VAI-00-4 完整版**（同存档 T0/T2 各推 30 日，规则状态哈希相同）。夹具只来自真实试玩，不手写应答。
- 依赖：**卡 3**。冲突：与 tools/ptai（PT-AI 驱动，已存在）共用轨迹格式，先对齐。
- 规模：中。不在第一批并行，卡 3 合入后开。

### 卡 6　WD-01 文化圈数据底座与亲和度/密度派生
- 目标：九省有归属圈与文化构成，18 种文化有结构化字段，圈亲和度由属性算出而非手填。
- 改动：新建 world/lore/spheres.json、faith-models.json（均**不存在**）；world/geo/regions.json 9 省/31 郡加 sphere/cultureMix/polityLaw/growingSeason（现 0 处）；world/lore/cultures.json **18 条补 §3.2 全部字段 + 新增 1 条 culture_mist，共 19 条**（01 §3.6.1 中陆次要文化，进中陆 cultureMix；缺它 E-REGION-MIX 加载失败；须同步修订 01 M0 与 V1 的"18 条"为 19）。01 M3 其余部分落点：中陆 civic 散文与 goods 改写归 WD-06——**实施日程 WD-06 现无此范围（只有 02 §5、§6、§10、M2、M5，验收 02 V5–7、V15，仅补 cuisine），须在日程补记"WD-06 待补范围与验收"：范围＝civic 的 facts/prose 与 goods 字段改写；验收＝civic 记录不再含西陲式主粮、新旧字段一致、cultures.json 同批仍只此一卡**；新法典与 customs.json 归 WD-16；作物归 WD-04，新食物物品（items.json）归 WD-06。E-CULTURE-* 具体校验码由执行者先报清单；tools/load-world.mjs（170 行，:47 读 regions，:89 组装 world）加读取与加载期派生，校验码 E-CULTURE-*、E-SPHERE-AFFINITY-HANDWRITTEN、E-REGION-MIX（现均不存在，validate-world.mjs 也没有）。
- 派生：亲和度 = 主粮/语系/信仰/法律四项相似度 + 邻接，按 01 §3.6 公式；禁止手填。
- 验收：01 V1（删任一文化 cuisine 即加载失败并点名）、V2（6×6 对称、对角为 1、改 culture_civic 的 faith.model 后只重算含 eastern 的行列、手写 affinity 加载失败）、V15；全量基线不变。
- 依赖：排在整条命名链（NM-1…NM-5）之后——NM-4 存量改名同改 geo/regions.json 与 lore，与本卡冲突，必须串行，所以本卡在命名链第二包前无法开工（不是第一批可跑项）。不依赖 EC-1；反过来 EC-1 的开局派生依赖 WD-01（PLAN 11-10 09:2x，可先用类标签过渡）。冲突：cultures.json 每批一张；AI-15 的三个字段并入与否（P06-1）按技术项，主会话推进后知会。
- 规模：大（18 条文化十余字段、9 省 31 郡数据，且 02/07/12 的字段取值要同时定）。

### 卡 7　WD-02 词汇登记（tags.json 一次登记）
- 目标：四册要用的词一次进词表，后续卡不再各改一遍。
- 改动：world/ontology/tags.json 唯一文件。现状：goods 族仅 10 条，无 material:、super:/form:/anchor: 等十族、skill family 词。登记：goods 子树 48 词 + 7 新 tag（02）、03 的十族、10 §3.1 的 family 族、13 的 material 子词。
- 验收：加载全绿；tools/ontology.mjs:80–82 已有 E-VOCAB-BROADER（上位词必须存在），补单测（tests/ontology.test.mjs 已存在）：每个新词有 family、上位词链走到 `族:*`。
- 依赖：无。可与卡 6 并行（不同文件）。冲突：03 的词表与 tools/yaoguai-defs.mjs 的 harm:* 建议要对一次。
- 规模：小到中（纯数据但词多；02 的"7 新 tag"未逐词列出，需执行者回头找）。

### 卡 8　WD-25 材料属性扩充（战斗职业线第一张；属 B3，**本批不开工，仅预备**）
- 目标：兵器、建材、器物的硬度、抗性、保温等由材料推出，兵器数值不再手填，地区差异来自本地材料与匠人。
- 改动：action-limits.mjs:15 `MATERIAL_RESISTANCE`，且 :59 同处**还有一张设计未提的别名字面量表** `{iron:'metal',copper:'metal',bronze:'metal',clay:'earth',hemp:'fiber'}`，须一并改读数据；world/meta/mechanics/material-props.json（76KB，按"类别键"组织，键须是现有标签，不是设计里的 `material:*` 条目）、item-class.mjs 类别行；combat.mjs（装备只读 `equipment.attack/defense/hit`，:70–73）；world/meta/items.json 中 12 件带 `combat{}` 的兵器按 form×材料反推（现 quality 为 木386/石26/银21/铁19/铜17/金7）。form 表（`forms` 类别行）与 edgeHold/hardness/insulation 等维度**现在不存在**。
- 派生：attack=form.baseAttack×edgeHold/4×workmanship；defense=form.baseDefense×hardness/5；weight=form.volume×density。不写地区兵器名单。
- 验收：13 V1（原 10 个材质硬度逐项相等）、09 V09-5（12 件兵器相等或带理由的 Override；新造草原复合弓数值由角筋/牛筋推出）；grep 无 `MATERIAL_RESISTANCE` 与别名表字面量。
- 依赖：WD-02、WD-04（同改 material-props.json）。排期在 B3，不属于本批，只做预备（读码、列迁移表）。它是战斗职业线最早的卡；09 的 C0/C1/C2（职业变体、入门派生、训练读门规）归 WD-26（B9），WD-22（B7）只做流派表数据。
- 规模：大（大表、兵器反推、两处代码）。

## 二、建议顺序与并行分组

- **第 0 步**：卡 1（待李白核对红线反转）。派卡前让执行者先报要改的文件清单，比对热点。
- **第 1 组（可并行）**：卡 3、卡 4、卡 7；卡 2 在 EC-1 收口、卡 1 获批且卡 3 合入后加入。卡 3 与卡 4 分属 server-plugin 与 extension，无交集（卡 4 不再依赖卡 3）。
- **第 2 组**：卡 5 在卡 3 合入后。**卡 6 不在本包可开工范围**：须等命名链 NM-1…NM-5 全部完成（NM-4 与其同改 regions.json）。
- 与 PLAN:134 路线的先后：PLAN 写"先修审查、再通用门、再 Jev"，通用门 4 张卡 S5 合入后才开工；本包各卡与通用门同改 extension/turn-contract.mjs 的（卡 3 记录通道）须让通用门卡 1 先行或协调，其余不冲突。
- **第 3 组（仅预备）**：卡 8，待 WD-02、WD-04（B2）合入才开工。
- 硬串行链：NM-0 → NM-1；AI-18 → NM-1（排除口径表）；AI-18 → AI-21；WD-02 → WD-25。

### 范围取舍：本包不出卡的项目
AI-06 §3 的 B0 还含 NM-2…NM-5、通用门卡 1、AI-19、AI-10，B1 含 AI-08；本包只取各线"第一批 1–3 张"，其余留下一包。另注：卡 3、卡 5 的 VAI 分配偏离 AI-06 §2.1 原文（原文 AI-18 含 VAI-05-3、VAI-00-4），理由是读取方在卡 5 的 replay.mjs。
- NM-2（古神数据与闸门）：依赖 NM-0 批准和 NM-1，且与 WD-09 同改 deities.json；NM-1 合入后出。
- NM-3（命名数据与生成器）：按裁定不并入 WD-01，接在 NM-2 之后。
- NM-4（存量改名）：依赖 NM-3 与 EC-1；与 WD-01 同改 regions.json，必须串行。NM-5 收口验收随链末尾。NM-2…NM-5 留到命名链第二包。
- AI-08（B1）：依赖通用门卡 1，留下一包。
- 通用门卡 1：不在四条线内，已有独立设计稿与排期，且与 AI 卡同改 extension/turn-contract.mjs，由其自己的包出。
- AI-19（超时降级与成本）、AI-10（信封哈希与补跑契约）：同依赖卡 3，卡 3 合入后在 AI 第二包出，可与卡 5 并行。

## 三、上报项与裁定

**需上报**
1. **红线反转**（李白核对）：13 §13.1 的"不区分历史神话/在世宗教"是"用户最终规则"，命名方案要推翻（§10-1 要求明确点头）。PLAN:663 却记作"亮圳 02:30 四条决定，已定，照改并写明理由"。两种说法矛盾：请李白核对亮圳 02:30 的决定是否已含此反转；若已含，降为知会，卡 1 不再"阻塞于批准"，只需写明理由。
2. **P00-1 默认档位**（亮圳，AI-00:300、AI-06:317）：推荐 T0；答复前卡 4 保持现行为等价档。
3. **legacy 夹具处置**（李白，涉及删除，非本批阻塞）：tests/fixtures/legacy-r2-primitives.json（含 33 次覆灯）与 server-plugin/legacy/seed.json 更新还是删除重生成；倾向删除重生成。

**技术项（主会话可推进，知会即可）**：P06-1 AI-15 的三个 cultures 字段并入 WD-01（AI-06 推荐并入，cultures 字段一次到位）。

**主会话裁定（裁定人＝主会话，2026-11-11，依据如下）**
- **材料表形状＝做法 B**：material-props.json 新增 `materials` 段，条目 id 用 `material:*`，类别行引用之；MATERIAL_RESISTANCE 与别名表迁入新段。依据：13 §3.1:45/:67（每个 `material:*` 同时是 goods 子词，上位链进 tags.json）、09 §5.3、实施日程 WD-25"扩充维度与条目"，卡 7 已登记 material 子词。代价：两套键并存，item-class 派生多一层映射，迁移校验更重。
- **NM-3 不并入 WD-01，WD-34 取消命名部分**。依据：命名方案 §9.2 首选 B0 链及第 3 点；并入会让"大"卡再加 population.mjs、remote-generation.mjs，失败难分责。代价：WD-01 后移。
- **E-SENSITIVE 由 NM-2 先引入，三档**（增 ancient_attested，命名 §9.1 NM-2 行、03:259 已同步）；WD-05/WD-09 的"两档"改为沿用三档。
- **骰值键统一 `name:*`**（AI-04 §6.1、AI-06 C-4）；seed-keys.json 同时登记 01 M3 的 `sphere:` 前缀键，否则 E-SEED-KEY 误报。
- **规则状态哈希另立、storage.mjs digest 不改**，口径由卡 3（digest-exclude.json）唯一给出；AI-06 写 AI-18 核查、AI-05 写 AI-21 核查，取最新的 AI-06。

## 四、未解决与事实
- PLAN（11-11 09:17）：**S5 尚未合 master**，合并前唯一一轮全量预计 12:30Z 完成，本包各卡以 S5 合入为前提。
- **EC-1 只有诊断**，已扩为六步、估 3–4 工作日，依赖 m2-6 先合入；**通用门 4 张卡未开工**（PLAN:196"S5 合入后才开工"）。
- 未读 AI-01–05 全文；goods 48 词、"7 新 tag"、"202/204 次"总数未独立复核（覆灯数据内 33 次已核）。

## 修订记录
**第一轮（changes）**
1. WD-01 补 culture_mist，M3 其余落点：法典与 customs 归 WD-16，作物归 WD-04（civic 归 WD-06 见第二轮 3）。
2. 卡 4 收窄为"档位不进存档"，去掉回放依赖；VAI-00-4 完整版与 VAI-05-3 移卡 5。
3. 新增"范围取舍"小节。
4. 卡 8 标"B3，本批不开工，仅预备"，C0/C1/C2 归 WD-26（B9）。
5. 卡 2 定义规则状态哈希并给等价不变量。
6. 卡 4 默认档改待确认（第二轮 2 再改）。
7. 卡 6 删"依赖 EC-1"；列出材料表两做法；卡 3 补 E-SEED-KEY 发现方式并更正 Math.random 范围。

**第二轮（changes）**
1. 卡 2：哈希按路径限定、只删字符串值，列具体键（text/summary/keywords/lines 等）；加反向对照；更正 remote-generation.mjs:816 为 `seed:`+s.name，改全仓 grep；加 summons.mjs:147、magic-care.mjs:167 的"新名解析回原 id"检查；排除口径引用卡 3 的 digest-exclude.json，不另立；事件序列带 actor id 与金额。
2. 卡 4：亮圳答复前保持现行为等价档，默认值一处常量，T0 为待确认推荐值。
3. 卡 6：culture_mist 后共 19 条并同步修订 01；日程补记 WD-06 范围与验收（列出内容）；新食物物品归 WD-06 而非 WD-04。
4. 第四节补 S5 未合、EC-1 仅诊断估 3–4 天、通用门未开工；卡 2 依赖改为 S5 合入与 NM-0 批准、EC-1 收口；补 PLAN:134 先后关系。
5. 范围取舍补 AI-08；NM-4 与 WD-01 同改 regions.json，卡 6 排在命名链之后；注明卡 3/5 偏离 AI-06 §2.1 的理由。
6. 裁定小节写明五条裁定（裁定人、依据）；上报项改为红线反转（附 PLAN:663 矛盾）、P00-1、legacy 夹具；P06-1 改技术项。

- 主会话补改（第二轮复审唯一遗留项）：卡 3 新增产出 world/rules/tables/digest-exclude.json 与单测；卡 2 改为依赖卡 3 先合入，不建临时表；串行链加 AI-18 → NM-1。
- 主会话补改 2：第二节第 1 组卡 2 加入条件补"卡 3 合入"（第二轮复审指出，改后 approve）。
