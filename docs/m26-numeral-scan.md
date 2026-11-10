# L1-NUMERAL 存量扫描（只读，未改任何正文）

规则：tools/content-numerals.mjs 规则 (a) 中文数字合法性 / 数字直接接钟，(b) 带总括词的时长与 minutes 一致。基于 HEAD t-l1-numeral（工作树 F:/dnd-wt/L1NUM）。
扫描范围：world/drafts 下 status=passed 的记录 3417 条（只扫 draft 字段）；world 下已发布 JSON 133 个文件（不含 drafts、不含 world/design 的 .mjs 源）。

命中总数：5 处，涉及 5 条记录/对象。

## 按规则

- (a) 数字直接接钟：4
- (a) 中文数字不合法：1

## 按审批集/文件

| 审批集（draft 目录或 world 文件） | 命中数 |
|---|---|
| w3/journey/recipes | 3 |
| world/meta/recipes.json | 2 |

## 本轮 w3-journey L4 补核涉及的条目（48e476ad 新写 L4 note 的 13 条）中的命中

- recipe_w3c_paper_cord_tags（world/drafts/w3/journey/recipes/recipe_w3c_paper_cord_tags.json）：(a) 中文数字不合法｜中文数字「七十零」不合法：「零」只能出现在百、千、万之后用来补位，此处位置不合法（原文「程约七十零分钟」）
- recipe_w3c_slate_writing_tile（world/drafts/w3/journey/recipes/recipe_w3c_slate_writing_tile.json）：(a) 数字直接接钟｜数字「九十」后直接接「钟」不合法，时长应写「分钟」（原文「全程九十钟，」）

## 全部命中清单

| 来源 | 文件 | 条目 | 字段 | 规则 | 原文片段/说明 |
|---|---|---|---|---|---|
| draft | world/drafts/w3/journey/recipes/recipe_w3c_mushroom_barley_pot.json | recipe_w3c_mushroom_barley_pot | process | (a) 数字直接接钟 | 数字「九十」后直接接「钟」不合法，时长应写「分钟」（原文「全程九十钟，」） |
| draft | world/drafts/w3/journey/recipes/recipe_w3c_paper_cord_tags.json | recipe_w3c_paper_cord_tags | process | (a) 中文数字不合法 | 中文数字「七十零」不合法：「零」只能出现在百、千、万之后用来补位，此处位置不合法（原文「程约七十零分钟」） |
| draft | world/drafts/w3/journey/recipes/recipe_w3c_slate_writing_tile.json | recipe_w3c_slate_writing_tile | process | (a) 数字直接接钟 | 数字「九十」后直接接「钟」不合法，时长应写「分钟」（原文「全程九十钟，」） |
| published | world/meta/recipes.json | recipe_w3c_mushroom_barley_pot | 125.process | (a) 数字直接接钟 | 数字「九十」后直接接「钟」不合法，时长应写「分钟」（原文「全程九十钟，」） |
| published | world/meta/recipes.json | recipe_w3c_slate_writing_tile | 159.process | (a) 数字直接接钟 | 数字「九十」后直接接「钟」不合法，时长应写「分钟」（原文「全程九十钟，」） |

## 说明

- 本扫描的规则经过一次收窄：初版把"共约20分钟""合计约120分钟"（分步小计）和"一百千米/四百千克"（千是国际单位前缀）也算命中，共 41 处；确认为误报后已从规则里排除，上表为最终结果 5 处（4 条记录：recipe_w3c_mushroom_barley_pot、recipe_w3c_slate_writing_tile、recipe_w3c_paper_cord_tags 各在 draft 记录里命中；mushroom_barley_pot、slate_writing_tile 另在已发布的 world/meta/recipes.json 命中）。
- "本轮李白批准的 9 条"在仓库里找不到对应清单（48e476ad 新写 L4 note 共 13 条：items batch-4 的 6 条 + recipes batch-1 的 7 条）。上面按这 13 条列出命中：recipe_w3c_paper_cord_tags（七十零）、recipe_w3c_slate_writing_tile（九十钟）；其余 11 条无命中。
- (b) 规则在存量里无命中（带总括词的时长已被 w3 原有规则拦过）。
- 只扫 status=passed 且有 draft 对象的记录；其他形态的批准文件（如 m5-authority 的 l4.json、各 approval-summary）与 world/design 下 .mjs 源码内的正文未扫。
