模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷一 五审 B（第五版，844 行）

只做静态阅读。对照：卷一-四审B.md；卷二-v5.md（§2.7 L405–416、S13 L1220–1221、S19 L1229）；代码 population.mjs、extension/input-view.mjs。
**结论：有条件通过。** 四审 6 条真问题已落实 5 条半，7 条小项全部落实；本轮新发现 6 条真问题，都是"白名单写法"落到细节时的自相矛盾或漏洞，改完即通过。

## 一、四审逐条核对

| 四审条目 | 第五版证据 | 判定 |
|---|---|---|
| 真1 屏蔽词位置 | `world/i18n/blocklist.<lang>.json`：L212、L366、L718、C-7 L789；旧 `meta/blocklist.json` 只在 C-7 "迁入后删除"与对账旧词表 L849 出现；原 L775 ⑤ 已删，L775 现仅余 aiGate 一条 | 已解决 |
| 真2 extension 目录重叠 | `extension/input-view.mjs` 整体迁入 `server-plugin/input/`，extension/ 余下全属显示层：L206、L242、C-4 L786；五组文件级不相交 E-GROUP-OVERLAP L357 | 部分（见新真问题 1） |
| 真3 V-26 与规范化冲突 | L719：首尾空白、大小写差异命中；全半角、标点、多一字少一字 → fallback；候选编号命中，越界与非整数 fallback | 已解决 |
| 真4 旧判据残留 | R-2.1 L267、G4 L57、L94、R-2.9 L275、V-2 L694、V-20 L699、术语表 L759 全改为句柄口径；C-1 L783 唯一写全 | 已解决 |
| 真5 AGE_CLAIM | L216：`AGE_CLAIM` 删除；开 AI 时 AI 随叙述输出 `{kind: age, value}`，规则层只校验 `value ≤ personView().dims.age`，不开 AI 不运行。代码：population.mjs:357 定义、:384 `matchAll`、:359 `chineseNumber`，行号与卷一一致 | 已解决 |
| 真6 闸内算法与 V-24 | C-5 L787（NFC → 折叠 → `indexOf`，中文一律子串，禁正则）；V-25 L702、V-29 L703 白名单；V-24 L701 整组禁用字符串比较与搜索方法；唯一模板引擎 `projection/templates.mjs` L208；blocklist 条目去掉 `match` 字段 L718 | 大部分解决（见新真问题 2、3、4） |
| 小1 toLowerCase 措辞 | L238、C-3 L785 改为 `toLowerCase()` 无 locale，并给 İ / Σ 预期 | 已解决，但 Σ 预期有误（新真问题 5） |
| 小2 错误码统一 | L206、L242 都用 E-VIEW-INPUT-IMPORT（卷二 S16） | 已解决 |
| 小3 关系代号属性化 | L216、L229：`relation` 词表族每行带 `intimate: boolean`，"不在代码里列举哪些关系算亲密" | 已解决（卷二未登记，见新真问题 6） |
| 小4 nameParts 拼装归属 | 只在 `output-gate/render-name.mjs`（C-6 L788、L208、V-25 L702） | 已解决（与 C-5 白名单的冲突见新真问题 2） |
| 小5 措辞并存 | L212 改为"位置与 schema 见 §2.3 第 7 条" | 已解决 |
| 小6 "五组" | L357 改为"五个代码模块组 + 一类数据" | 已解决（术语表 L758 仍漏 gate 组，见小项） |
| 小7 L-1 加 AI 边 | L77、L214 仍作"第三个允许读语言的位置"；L-1 L100 同步措辞未单独核到（L-1 行被长行折叠） | 记账，见小项 |

## 二、重点核对

### 2.1 代码核对

- **AGE_CLAIM**：population.mjs:357 `const AGE_CLAIM=/(\d{1,3}|[一二三四五六七八九十两]{1,3})\s*岁/g`；:384 `all.matchAll(AGE_CLAIM)`，卷一 L216 指向的就是这一行。ROMANCE :356、:407；blocklist :409。一致。设计稿，代码尚未改，符合预期。
- **relation 族属性 intimate**：全仓库代码与卷二-v5 都没有 `intimate`（Grep 零命中）。population.mjs:386–390 现有的 `relationships[].relation` 只与户籍 `kin.relation` 作比较。属性是新增设计，卷二未登记。
- **input-view 迁入**：extension/input-view.mjs 存在（Glob 命中），但内容主体是浏览器 DOM 代码：`mountInput` 用 `document.querySelector('#send_textarea')`、`createElement`、`addEventListener`（:9–29）。真正与文字有关的只有 :1 `inputForMode`、:5 `prepareInput` 两个小函数。整体迁入 `server-plugin/input/`（Node 服务端目录）会把 UI 挂载代码放进输入边，见新真问题 1。

### 2.2 能否机判；有无绕路

**C-5（NFC → 折叠 → indexOf）。** 可交机器，但当前写法是"方法名黑名单"，有这些缝：
- `+` 拼接、模板字符串、`text[i]`、`[...text]`、`for…of text`、`Array.from`、`.length`、`<`/`>` 比较、`sort` 比较器、`Intl.Segmenter`、`Buffer/TextEncoder`：都不是"字符串方法"，白名单没提，可用来手工实现分词或关键词分类。
- `indexOf` 同名于数组方法，要靠类型区分。
- C-5 ③ 把 labels 也列为可作 `indexOf` 的词表条目：闸拿菜单显示名当 needle 做子串查找，就成了"关键词猜意图"的现成通路（A-22）。
- 显示闸的 `replace` 裁决（L224"命中片段换为替代词"）需要切片与拼接，C-5 并不允许（见新真问题 2）。

**V-24（显示层整组禁字符串方法）。** 列表只有 `===/!==` 与 `includes/startsWith/endsWith/indexOf/search/match/test/split/replace/localeCompare` 与正则。未覆盖：`switch(text)`、`obj[text]`、`Map/Set.get/has(text)`、`<`/`>`、`slice/substring/charAt/at/trim/toLowerCase/normalize`、数组迭代拼字符等。因此可用 `Map.get(text)`、`switch` 绕开。

**模板引擎 templates.mjs。** "只许 `replace` 做槛位替换，替换目标只能是模板串"（L208）：槛位记号（`{x}`）与 `replace` 是否允许正则（单次 `replace(string, ...)` 只换第一处，多槽位需要 `replaceAll` 或循环）未定。"替换目标只能是模板串"需要类型归因（该串来自 labels 查表）才可判。

**能否直接引用卷二第六版的"按类型白名单"：** 能引，条件是卷二第六版把"类型白名单"写成**按组**的能力表，卷一只留一行引用：
- 规则层（V-2/V-20）：string 值只许句柄相等比较、原样传递、`Map` 键查表。直接引用卷二 S13，卷一不再写方法列表。
- 输入边（V-23）：`normalizeInput` 链 → `Map` 键；引卷二 S18。
- 闸组（V-25/V-29）：string 值只许 `normalize('NFC')`、`toLowerCase()`、以**blocklist 词表条目**为 needle 的 `indexOf`，结果只许与 `-1`/`0` 比较并产出 pass/replace/block/reject 代号；引卷二 S19。
- 显示层（V-24）：string 值只许原样传递、按**代号键**查语言包、传给 templates.mjs；不许比较、不许作 `Map.get`/`switch` 的键（除代号句柄）。
- 这样 L208、L238、V-23/V-24/V-25/V-29 里各自重复写的方法清单可删，只保留附录甲 C-4/C-5 的"组 × 允许的 string 类型操作"一张表，避免再出现四审问题 4 那种旧口径残留。

## 三、真问题

1. **input-view.mjs 整体迁入输入边会把 DOM 代码塞进输入边，也使文件级清单脱离实际。** L206、L242、C-4 L786。该文件 :9–29 是浏览器端挂载代码（`document.querySelector`、按钮、键盘事件），既不属"文字→代号"，也无法在 `server-plugin/`（Node 目录）里被浏览器加载；V-21 "整体删除 `server-plugin/input/`"（L716）也会连带删掉输入框与模式按钮的挂载。改法：把 `inputForMode`、`prepareInput` 拆成独立文件放 `server-plugin/input/`（或浏览器侧同名小文件，注明由卷九定路径），`mountInput` 留在 extension/ 属显示层；清单与 V-21 的"删什么"按拆分后的文件写。
2. **闸内白名单与闸的职责自相矛盾：`replace` 裁决与 `nameParts` 拼装做不出来。** C-5 L787、V-25 L702 只许 NFC、折叠、`indexOf`；但 L224 要求 `replace`（命中片段换成替代词）需要切片与拼接；`render-name.mjs`（L208、L702）要把 `parts[]` 拼成字串（`join`/模板）。两者都在 `outputGate.modules` 内，被 V-25 判违例。改法二选一：(a) `replace` 裁决由闸只给出命中区间代号，真正替换由 `projection/templates.mjs` 做（闸输出 `block` 即整字段改模板叙述，最简单）；(b) 明列 `render-name.mjs` 允许 `join`/模板，并单独扫描，同 templates.mjs 做法。
3. **V-24 的方法清单有漏洞，可被 `switch`、`Map.get(text)`、`obj[text]`、`<`/`>` 绕过**（L208、L701）。改为类型白名单写法（见 2.2）：显示层 string 值只许原样传递、按代号键查语言包、传入 templates.mjs；对 string 值的任何比较、作键查表（代号句柄除外）一律违例。
4. **C-5 ③ 把 labels 列为可作 needle 的词表**（L787）。闸组内用菜单显示名做子串查找 = 现成的关键词匹配，与 A-22 冲突。改为：needle 只能来自 `blocklist.<lang>.json` 条目；`tools/name-blocklist-check.mjs` 因要拼装 labels，单列（L368 已单列）；`indexOf` 的结果只许与 `-1`/`0` 比较并转为裁决代号，不许 `slice`、不许把位置传出。
5. **C-3 的 Σ 预期写错**（L785）。JS `toLowerCase()` 按 Unicode SpecialCasing 处理词尾 Σ：孤立 "Σ" → "σ"，但词内位于末尾的 "Σ"（如 "ΑΣ"）→ "ς"。"希腊词尾 Σ 折叠为 σ，与 ς 不等"与规范相反；按此写的 V-26 用例会失败。改为：孤立 Σ → σ；词尾 Σ → ς（因此 "ΑΣ" 命中 "ας"，不命中 "ασ"）；说明"不特判"即接受该语言细节。İ 的预期（折叠为 i + U+0307，与 "i" 不等）正确。
6. **`relation.intimate` 卷二未登记，也不在卷一"卷二需确认"清单里**（L216、L229 vs L775；卷二-v5 零命中）。要么卷二第六版补 `relation` 词表族与 `intimate: boolean` 属性（L775 追加一条），要么卷一说明该族由哪一卷定义。否则规则层未成年检查（L229）没有可读的数据维度。

## 四、措辞与记账小项（不阻断）

1. L773 "验收 V-1 … V-30" 应为 V-1 … V-31（L704 有 V-31）。
2. 术语表 L758 "输入边、显示层组、AI 输出边守门、显示闸、语言包五组"漏 `gate` 组，而 L357 与 C-4 是"五个代码组 + 一类数据"。
3. L208 与 V-24 L701 都完整写了方法清单，与附录甲"每个概念只在一处写全"的原则不符；类型白名单改写后一并收为引用（见 2.2）。
4. L-1（L100）是否已把 AI 边并入"允许读语言的位置"，与图 L77、L214"第三个允许读语言的位置"同步，请核。
5. L363 gate 组"允许读源码文本（它扫别人）"：扫描用 AST，写"允许解析源码"更准；该组若做文字比对只许 C-5，已写。
6. L775 卷二需确认的 aiGate 允许比对文字一项：卷二-v5 §2.7 L416 仍写"仅 gate 与 outputGate"，S19 L1229 也未含 aiGate；属跨卷待办，卷二第六版须落，不是卷一问题。
7. 附录丙脚本输出 L849 的旧词清单里含"extension/input/、template-engine"：这是对账旧词，不是要求，保留即可。
