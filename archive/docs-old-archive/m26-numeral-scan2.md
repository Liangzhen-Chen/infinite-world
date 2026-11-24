# L1-NUMERAL 存量扫描（第二版，新规则）（只读，未改任何正文）

规则：tools/content-numerals.mjs 规则 (a) 中文数字合法性 / 数字直接接钟，(b) 带总括词的时长与 minutes 一致。基于分支 t-numeral2 提交 76908a20（工作树 F:/dnd-wt/NUM2，新规则：夹字白名单 + 数字连写不判）。
扫描范围：world/drafts 下 status=passed 的记录 3419 条（只扫 draft 字段）；world 下已发布 JSON 133 个文件（不含 drafts、不含 world/design 的 .mjs 源）。

命中总数：12 处，涉及 12 条记录/对象。

## 按规则

- (a+) 数字与单位间夹字：8
- (a) 数字直接接钟：4

## 按审批集/文件

| 审批集（draft 目录或 world 文件） | 命中数 |
|---|---|
| w3/journey/recipes | 6 |
| world/meta/recipes.json | 6 |

## 本轮 w3-journey L4 补核涉及的条目（48e476ad 新写 L4 note 的 13 条）中的命中

- recipe_w3c_slate_writing_tile（world/drafts/w3/journey/recipes/recipe_w3c_slate_writing_tile.json）：(a) 数字直接接钟｜数字「九十」后直接接「钟」不合法，时长应写「分钟」（原文「全程九十钟，」）

## 相比旧规则不再命中（成语误判消除）


## 全部命中清单

| 新增 | 来源 | 文件 | 条目 | 字段 | 规则 | 原文片段/说明 |
|---|---|---|---|---|---|---|
| 新 | draft | world/drafts/w3/journey/recipes/recipe_w3c_cork_float_set.json | recipe_w3c_cork_float_set | process | (a+) 数字与单位间夹字 | 数字「九十」与时间单位「分钟」之间夹了「整」，写法不合法，概数应写「九十多分钟」或「九十来分钟」（原文「耗时九十整分」） |
|  | draft | world/drafts/w3/journey/recipes/recipe_w3c_mushroom_barley_pot.json | recipe_w3c_mushroom_barley_pot | process | (a) 数字直接接钟 | 数字「九十」后直接接「钟」不合法，时长应写「分钟」（原文「全程九十钟，」） |
| 新 | draft | world/drafts/w3/journey/recipes/recipe_w3c_parsnip_cream_pot.json | recipe_w3c_parsnip_cream_pot | process | (a+) 数字与单位间夹字 | 数字「五十」与时间单位「分钟」之间夹了「整」，写法不合法，概数应写「五十多分钟」或「五十来分钟」（原文「全程五十整分」） |
| 新 | draft | world/drafts/w3/journey/recipes/recipe_w3c_slate_stylus.json | recipe_w3c_slate_stylus | process | (a+) 数字与单位间夹字 | 数字「九十」与时间单位「分钟」之间夹了「加」，写法不合法，概数应写「九十多分钟」或「九十来分钟」（原文「全程九十加分」） |
|  | draft | world/drafts/w3/journey/recipes/recipe_w3c_slate_writing_tile.json | recipe_w3c_slate_writing_tile | process | (a) 数字直接接钟 | 数字「九十」后直接接「钟」不合法，时长应写「分钟」（原文「全程九十钟，」） |
| 新 | draft | world/drafts/w3/journey/recipes/recipe_w3c_walnut_honey_bites.json | recipe_w3c_walnut_honey_bites | process | (a+) 数字与单位间夹字 | 数字「七十」与时间单位「分钟」之间夹了「整」，写法不合法，概数应写「七十多分钟」或「七十来分钟」（原文「全程七十整分」） |
| 新 | published | world/meta/recipes.json | recipe_w3c_parsnip_cream_pot | 118.process | (a+) 数字与单位间夹字 | 数字「五十」与时间单位「分钟」之间夹了「整」，写法不合法，概数应写「五十多分钟」或「五十来分钟」（原文「全程五十整分」） |
| 新 | published | world/meta/recipes.json | recipe_w3c_walnut_honey_bites | 122.process | (a+) 数字与单位间夹字 | 数字「七十」与时间单位「分钟」之间夹了「整」，写法不合法，概数应写「七十多分钟」或「七十来分钟」（原文「全程七十整分」） |
|  | published | world/meta/recipes.json | recipe_w3c_mushroom_barley_pot | 125.process | (a) 数字直接接钟 | 数字「九十」后直接接「钟」不合法，时长应写「分钟」（原文「全程九十钟，」） |
|  | published | world/meta/recipes.json | recipe_w3c_slate_writing_tile | 159.process | (a) 数字直接接钟 | 数字「九十」后直接接「钟」不合法，时长应写「分钟」（原文「全程九十钟，」） |
| 新 | published | world/meta/recipes.json | recipe_w3c_slate_stylus | 179.process | (a+) 数字与单位间夹字 | 数字「九十」与时间单位「分钟」之间夹了「加」，写法不合法，概数应写「九十多分钟」或「九十来分钟」（原文「全程九十加分」） |
| 新 | published | world/meta/recipes.json | recipe_w3c_cork_float_set | 190.process | (a+) 数字与单位间夹字 | 数字「九十」与时间单位「分钟」之间夹了「整」，写法不合法，概数应写「九十多分钟」或「九十来分钟」（原文「耗时九十整分」） |

## 结论摘要

- 命中总数 12 处（draft 6 + 已发布 recipes.json 6），涉及 6 个配方；旧规则下命中 4 处（slate_writing_tile、mushroom_barley_pot 的 draft 与 recipes.json 各 1），"数字直接接钟"这 4 处不变。
- 新增命中 8 处（夹字规则，4 个配方的 draft 与 recipes.json 各 1）：slate_stylus（九十加分钟）、parsnip_cream_pot（五十整分钟）、walnut_honey_bites（七十整分钟）、cork_float_set（九十整分钟）。
- 4 条之外的新命中：parsnip_cream_pot、walnut_honey_bites、cork_float_set 三条（均为"整分钟"，且均已发布在 recipes.json）。
- paper_cord_tags 不在任何数字规则的命中里：它的问题是"叠好的小片"前文没有交代（叙事问题，不是数字问题），也不是数字规则能判的；recipes.json 里的正文与 draft 已不同（draft 是重写后的"全程耗时70分钟"，recipes.json 仍是旧稿）。
- 成语类（九九八十一等）：存量里原本就没有命中，故"不再命中"清单为空；该改动只消除将来的误判。

## 三、发布路径规划（只读，未实现）

1. 批次文件：slate_writing_tile 在 world/drafts/w3/journey/recipes/batch-1.json（ids 含它，批内 42 条；l4 approved=false，另有 l4History）；mushroom_barley_pot 在 world/drafts/w3/journey/recipes/batch-0.json（43 条，l4 approved=true）。单条记录在 world/drafts/w3/journey/recipes/<id>.json 的 draft.process。slate_stylus、paper_cord_tags 都在 batch-1。
2. 正式正文：world/meta/recipes.json（数组），每条配方的 process 字段。注意：journey 骨架 85 条配方（batch-0 的 43 + batch-1 的 42）全部已在 recipes.json 里，不止李白说的两条；即 slate_stylus（179 行起）、paper_cord_tags、parsnip_cream_pot、walnut_honey_bites、cork_float_set 的坏正文也已在正式文件里（除 paper_cord_tags 外，recipes.json 的 process 与 draft 逐字相同；paper_cord_tags 的 draft 已重写而 recipes.json 仍是旧稿）。
3. 现有发布命令：node tools/w3-journey-publish.mjs --publish（经 inspectJourney 读 batch 里 L4 通过的草稿，assembleTradesCandidate -> assembleW3，再写 world/meta/items.json、recipes.json、world/people/baseline.json）。但 tools/w3-content.mjs:64-65 的 merge 对 id 已存在的行保留旧行，只补新行，所以 **做不到更新已发布配方的 process**：重写草稿后跑它，recipes.json 一字不变。同时 inspectJourney 对 batch-1 要求 L4 通过（目前 approved=false）。这与派生价（basePrice 更新靠级联批）是同一个问题：发布工具只会"新增行"，改已发布行必须走另一条路。
4. 缺什么：一条"已审批的正文修订"通道。仓库里已有现成机制可借：P1 修订批 / 级联批（world/design/p1-revision-approval.mjs、p1-cascade-approval.mjs，目录 world/drafts/p1-revision、p1-cascade，含 candidate.json 冻结候选、l1/review 记录、publication.json 回执，回执里的 before/after + supersedes）。它按 "文件、条目 id、字段路径、before、after" 改正式文件，只改指名字段的字节，发布前断言 before 与现状一致，发布后写回执，approved-revisions.mjs 通用读取。设计的 path 字段能写 ['process']，原则上不用改机制本身。
5. 按整类的建议补法：
   - 新建一个"正文修订批"（例如 world/drafts/w3-body-revision，沿用 P1 的 candidate/publication 格式），条目清单由 numeral 重扫结果生成：slate_stylus、slate_writing_tile、mushroom_barley_pot、paper_cord_tags 加上本次新发现的 parsnip_cream_pot、walnut_honey_bites、cork_float_set，共 7 条（李白原批 4 条 + 3 条）。每条 before=recipes.json 现有 process，after=重写并过 L1（含新规则）、L2 复核、L4 的新正文。
   - 同时把 w3-journey 的 batch 草稿记录（world/drafts/w3/journey/recipes/<id>.json）也更新为新正文，否则以后重新装配会拿旧 draft 与正式行比对；merge 保留正式行，因此 recipes.json 以修订批为准，draft 与它保持一致即可（并让 batch 指纹随之更新，重做 L4 备注）。
   - 在 w3-wave-score 之类消费设计源的地方，按 approved-revisions 的 supersedes 读取修订值（已有通用读取，无需新增特判）。
   - 长期更好的整类做法：给 assembleW3 的 merge 加"已审批正文修订可覆盖指名字段"的受控入口（读取 publication.json 回执），而不是放开 merge 覆盖已有行。本次不实现，只作方案。
