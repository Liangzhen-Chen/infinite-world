模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二复审 B（第二版）

审查对象：卷二-维度表规范与统一入口.md 第二版（782 行，全文已读）。对照：审查B.md 六条必改、李白硬规矩（统一底层、禁读自然语言、输入边六点）。代码只做静态 Grep/Read，未运行任何东西。

## 结论：有条件通过

上轮六条必改正文基本落实，没有"只在附录声称"的。语言边界的原则条款写全了，但**验收断言没跟上**（拔掉输入边、中英对等、关键词/子串输入、机器扫描方法都没有可执行的验收），另有一处自相矛盾（B8）。下面 5 条必改不改，卷二不能收口。

## 一、上轮必改逐条核对

| 上轮必改 | 判定 | 正文证据 |
|---|---|---|
| 1 extends/precedence 求值顺序；全局全序限制；set/map 的 extend/remove | 已解决 | L124-127 先展平后取值；L141-142 冲突与全序限制明说；L126 `+:`/`-:`；L145 三层轨迹示例；A11（L706） |
| 2 补缺失实体类（配方/作物/事件/知识/法典）；作品载具天气挂靠；设施 14→17 | 已解决 | L50-57 表文件；L583-622 §5.18-5.22；L617-627 §5.23 归属表；L201 comp_work/relic/vehicle；L578 17 类，数过 17 个名字 |
| 3 随机：joint 用组 id；自带 PRNG 与精度；实例 id 交卷十；只存偏离；入口纯读 | 大部分已解决，PRNG 部分 | L230、L231、L240、L237、L314 均落实。PRNG 部分：见建议 S2（lognormal 的 exp 表未定义）。另引出新矛盾，见必改 M1 |
| 4 修正体系：stage/op 统一；modifiable 限 number/integer 与 map 子键；capability 归属；set 与来源豁免；索引方向 | 已解决，但引入内部矛盾 | L372 stage 即运算；L384/L378 set 与 unpenalized；L359 子键寻址；L437-441 body.<capability>；L420-435 索引方向。矛盾见必改 M4 |
| 5 砍/降级：量纲推导、运行态追踪、copula、分类机制收敛、判定表 | 已解决 | L162（W-DIM-UNIT-DIM 首期不实现）；L333；L227；L149-156 判定表（components 废除，组件即类别 L196-201） |
| 6 §7 断言分档 | 已解决 | L693 G 组；L738-741 G1-G3 不阻塞收口 |
| 补充：A/B 的 §1.3 内容"表"覆盖面 | 已解决 | 见第 2 行 |

## 二、语言边界核对（§1.9、S13、B10）

**条款层（§1.9 L217-223）：六点齐全。**
1. 规则层含 consistency-review 一字不读：L218，成立。
2. 翻不出或歧义退回菜单、不猜不填默认：L219，成立。
3. 不开 AI 只许显示名整串精确对应，禁关键词/正则/整句猜意：L220，成立。
4. 可整体拔掉、中英对等：L221，成立。
5. `lookupByLabel` 只在 projection/input、内部精确等于：L222，成立。
6. 机器扫描：L223、S13（L721）。

**验收层：不够。** 条款有了，可验收的断言没有：
- 可整体拔掉（L221）没有任何断言。G1/G2（L739-740）测的是清空/互换 labels，不是拔掉输入边后菜单仍可完整游玩。
- 中英平等：B10（L734）只描述了一种语言；B9 测 nameParts 的中英，但不是输入边。
- "禁关键词/整句猜意"：B10 只测"多一个字符/少一个字符"，没有测"整句里含某菜单项名"、"含关键词"、"带标点/空白/大小写差异"这类典型猜法。
- "不填默认值"：没有测"缺参数/参数歧义 → 退回菜单"。
- 重名歧义（两个菜单项显示名相同）：L219 说歧义退回，B10 未测。
- S13（L721）只写"规则目录内中英字面量参与判断、正则、文字匹配 = 0"。没写检测办法（AST 还是正则 grep）、扫哪些目录（consistency-review 在哪个目录要点名）、怎样区分"中英字面量参与判断"与合法的代号字面量/id 格式正则（L206 的 `^[a-z]...` 校验正则本身就是对字符串的正则，是否豁免？）。这样写，卷十二无法机器化，也会被误报或漏报。

**名字存储：合格。** 生成名只存 `nameParts{bank, pattern, parts[{slot,wordId}], seq}`（L213），重名与按名查人比较 nameParts 或 id；B9（L733）测中英切换时 id/维度/事件流相同。玩家起名存 `state.displayNames[id]={text,lang}`，display:true，规则层禁读（L215、L339）。玩家文字天然属于某语言，这样处理是正确的（只作显示）。

## 三、迁移核对

- **physicalMetal 名称匹配真删除不搬：是。** L650 明写 `nameWords/forms/modifiers/tailForms/excludeTags` 整块删除不搬、metalClass/metalProps 删除；L642 名称匹配结果"仅作候选"、人工核对后写成显式 material map；S14（L722）为 0。代码核对：item-class.mjs:492 `metalClass`、:503 用 `new RegExp(...)` 对物品名匹配、:507 `metalProps`，与删除对象吻合。小缺口见 S5（validatePhysicalMetal 与调用点）。
- **capability 归 body 命名空间：** L437-441 + L363，成立。
- **旧槽字段对照表（L447-459）到 derived.mjs 抽查，全部对得上：**
  - `STAGES=['add','mul','max','min','clamp']`：derived.mjs:14（表述"与现有兼容，中间插入 set/post" L410 正确）
  - `relative`：derived.mjs:15、:75、:259；`kindBounds`：:54、:75、:258
  - `stageBounds / maxModifiers / totalBounds`：:54、:55、:87、:88
  - `alias`：:60、:85
  - `exclusiveGroup / priority`：:237、:240-243
  - `paceable`：:247、:257、:271
  - `baselines`：:211；`derivedFactValues`：:110、:156
  - `slot.closed`：:72（对照"closed = modifiable:false"成立）
  - 另：`startsWith('bld_')`/`'loc_'`/`'faction_'`：derived.mjs:107，对得上 E-VIEW-ID-PARSE 的举例（L208）。
  - 其他行号：storage.mjs:275 `groups.get(dependencies)`、entity-view.mjs:385/560/582、item-class.mjs:344、action-capacity.mjs:29/33/39（中文 reason）均对。
  - 抽查 12 处，零偏差。
- 叠加惩罚表 S[0..7] 与 EVE 公式 exp(-(n/2.67)²)：0.8694/0.5706/0.2830 复算一致；附录 B 手算 1.2222 复算一致。

## 四、必改

**M1　B8 与 §1.10/§3.6/§1.11 自相矛盾（L732 对 L240、L439、L247）。**
B8 写"受伤改变 `body.moving` 偏离后 source 变为 state.created…"。但 `body.moving` 是 `derived` 维度（L439，手填会触发 E-DIM-DERIVED-WRITTEN，L106），受伤走的是状态容器档的 `modifiers[]`（L247、L463），不写 created。两种机制并存、各说各话。必须改成：受伤 = 状态实例（`state.statuses`）加 modifier，`bodyView().dims.moving` 的 source 由"base"变为"modified"，`Fact.base` 不变；"偏离写回 created"只适用于非派生维度（如 durability、成长）。并在 §1.10 写一句例外规定：派生维度不接受偏离行。

**M2　输入边验收断言不可执行（B10 L734 + 缺 G 门）。**
补以下断言（可分到 B 或 G 组）：(a) 整串精确相等才命中，并写明"相等"的口径（是否 Unicode 规范化、大小写、首尾空白——选一种写死，两种语言同一口径）；(b) 整句含菜单项名、含关键词、近似拼写 → 全部退回菜单，不得有任何命中；(c) 缺参数或参数歧义 → 退回菜单，不填默认；(d) 两项同名 → 退回菜单；(e) 不开 AI 时无任何自由文本被解析；(f) AI 超时/不可用 → 仍回菜单；(g) **整体删除 projection/input 目录后，按菜单走完一轮完整流程（含开局、交易、战斗/对话各一）仍可玩**；(h) zh 与 en 各跑一遍同一批输入用例，结果集同构。

**M3　S13 机器扫描写成了口号，不是可验收条款（L721，L223）。**
必须写明：扫描对象目录清单（含 consistency-review）；检测手段（AST：字符串字面量与正则字面量、`new RegExp`、`.test/.match/.includes/.startsWith/.indexOf/.toLowerCase` 作用于字符串；含非 ASCII 字符的字面量；除了代号表登记的 ASCII 代号外的英文自然语言字面量）；白名单只允许"由数据表/词表登记的代号字面量"与"代号格式校验正则（仅限校验器与加载器文件，点名）"；基线数字（现状 74 行，L223）与目标 0；脚本放哪里（卷十二）。否则"规则目录里任何用于判断的文字匹配"无法落地。

**M4　`modifiable` 对 map 维度的规定自相矛盾（L107、L359 对 L476、L506、附录 A）。**
L107、L359 允许 map 的数值子键为修正键（附录 A `upkeepPerDay` 即如此）；但 L476（L1 检查"modifiable 仅 number/integer"）与 L506（E-DIM-MODIFIABLE-TYPE："非 number/integer 标 modifiable"）按字面会拒绝它。统一口径：`modifiable` 仅限 number/integer，或 value 为 number 的 map；改 L476、L506 并补一条 fixture（附录 A 本身应通过校验）。

**M5　第二版大量"同第一版"，作为独立母本不自足；验收口径依赖不存在的栏（L348、L463、L569、L573、L641、L657、L659、L687、L749、L758）。**
尤其 A9（L700）要求"known/total ≥ §6.12 的'改后'列"，而 §6.12（L687）本身写"同第一版 §6.11"，当前文件里没有这列。第一版随提交被覆盖后这些引用悬空。必须把被引用的内容（§5.2 材料维度清单、§5.3-5.17 字段、§6.12 齐全率表、附录 A 全表、附录 C）并入正文，或明确指到另一份已提交文件的路径，并在 A9 里把"改后"数值写进来。

## 五、建议（不阻塞）

- S1　`kindOf(id)` 读表头前缀表（L208）与 E-VIEW-ID-PARSE 禁 `startsWith`（L208、S12）形似冲突；写明 `kindOf` 是唯一许可点。`player` 是"显式无前缀实例"（L208、L99），算一个专项特例，建议改成表头 `singletonIds:[…]` 的通用字段。
- S2　lognormal 用"exp(normal) 同样查表"（L236）：exp 表未定义（点数、定义域），分位数表线性插值也未规定用定点整数。跨机逐位一致只在 G3 验，建议在 `_distributions.json` 约定里把 exp 表与插值算术写死。
- S3　`W-DIM-LABEL-MISSING`（L518）需要读 labels 的键，与 L488"校验器不读 labels 内容"需要一句澄清（只查键存在，不读值）。
- S4　`class_*` 的 broader（L249）是否参与 `memberOf` 展开（L122 只写了 tags 沿 broader 展开）：L143 却说 precedence 默认顺序由"标签 broader 深度"派生。写明 class 族是否同样展开。
- S5　§6.2 删除清单（L650）应补 item-class.mjs:517-524 `validatePhysicalMetal` 及 :633 的调用点；离线映射脚本不得放进 server-plugin（否则 S14 的 nameWords = 0 与脚本自身冲突）。§6.11 对 professions `aliases` 的离线用法（L678）同样要写"人工核对 + 脚本不入库"。
- S6　B7（L731）"一类一起变化"是主观判断，建议改为可检查形式（每条期望值改动须带对应维度/规则表的 diff 引用）。S10 "裸十进制常数只在规则表"同样缺检测手段。
- S7　入口清单第 5 行叫 `body` 而文件与 kind 叫 `body_plan`（L40、L98 要求 kind 与文件名一致，L284 与 L440"body 不是第 23 张表"）。建议在表里直接写"kind=body_plan，bodyView 的主体是 person"。

## 六、有无暗含专项规则或读文字判断

- 未发现读自然语言判逻辑的条款。`basis/sources/citation/label/aliases` 均标为文档/显示字段，校验器按字段集合排除（L194、L211、L339），不是手写名单。
- 未发现为具体物品/神/地区写专项规则的条款；`item_charcoal`、`FOREST_ITEM` 等出现在迁移节是"被改造的旧读者"（L653），改为按维度阈值/类别读，方向正确。
- 唯一专项味道：`player` 无前缀特例（S1）。
- 空泛条款：M2、M3、M5 即上述不可验收之处；其余条款（A1-A11、S1-S12、B1-B6、B9、B11、B12）均有可执行判据。

## 偏离指令之处

无。按指令只读、未提交 git。未逐条核对第一版文件（它已被第二版覆盖），故对"同第一版"的内容只能判为引用悬空（M5）。
