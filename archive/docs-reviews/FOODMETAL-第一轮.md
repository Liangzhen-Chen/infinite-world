通过

范围：F:/dnd-wt/MPH，t-mph 上 cafffbf5..d89f8aad 相对 5c750f92 的改动。所有 citation 页均已 WebFetch 核对。`node world/design/matprops-approval.mjs --verify` 的结果：ok:true，d 卡 4/4，调味佐餐卡 43 条中 40 条 L2 通过、3 条人工核对，无未解决项。

## A. 食物外观：需改的条目

### 类别行（physical.classes，共 20 条）

1. cream 第 2 条「由乳中较轻的乳脂浮到上层撇得」：这是分离工艺，不是外观。删。
2. cream 第 4 条「液态时流质偏软，陈放后渐稠」：原句 "Liquid and soft the first days, it gets heavier" 出自表格里 crème fleurette（30% 乳脂的法式奶油）一行，只说这一种，并连着 "develops a more pronounced taste"。写成 cream 类通则是以偏概全；"gets heavier"（变沉）也被改成"渐稠"。删，或改成该奶油自己的描述。
3. vinegar 第 2 条「未过滤的醋可显浑浊」：所引苹果醋原句只说 "sometimes sold unfiltered and unpasteurized with the mother of vinegar present"，没说浑浊。页面里写"cloudy"的是具体的椰子醋（cloudy, white）和葡萄干醋，都不是"未过滤"的结论。这一句是撰写者拼接推出来的，应拆开，或改为"椰子醋为浑浊的白色液体"之类的具体陈述。引文里的 "Distilled vinegar:"、"Coconut vinegar:" 标签页面上没有，是撰写者加的，应去掉。
4. fresh_herb（整类四条）：全部取自 Wikipedia「Dill」一个物种，却写成"鲜香草"类通则。香芹、欧芹等会被错写成"叶如蕨"。第 4 条「植株高约 0.5–1.5 米」是植株高度，不是食材外观。必须二选一：把类别键收窄到只有莳萝的物品（按 item 写），或补出该类其他成员的页面，写成真正共同的外观。目前不能当类别事实用。
5. cheese 第 3 条「气味转浓」：原句是 "intensify flavor"（风味），不是气味；"气味很冲"另有出处，拼在一起略过度。建议拆成两条，或把"气味转浓"改为"风味转浓"。cheese 没有任何颜色或形态词，类别里只写这三条是不完整，但不算错。
6. spice_seed 三条：每条把三个物种并列写，原句各自存在，数值与原页一致（<1 mm、1–2 mm、约 3 mm；肾形/凹点；石板蓝等）。这是 3 个物种的混合，不是一类的共同外观。请在 basis 里说明：这是三种代表籽粒的并列词条，不是类别共性。

### 物品行（items.json，17 件，实有 56 条，指令说 58 条，数目对不上，请核实）

7. item_honey 第 4 条「滤过的蜜去掉了大部分细颗粒、花粉粒和气泡」：引文是改写，不是原句。页面原句是 "filtered to the extent that all or most of the fine particles, pollen grains, air bubbles, or other materials normally found in suspension, have been removed"；而且这是加工状态，不是蜂蜜本身的外观。改为原句，或删。
8. item_leek 第 2 条「叶基发白，往上渐成浅绿」：页面只列出白色叶基、浅绿部分、深绿部分，没有说"渐成"。"渐"是撰写者加的程度。改成"叶基白，上部浅绿"即可。
9. item_onion 第 1 条「外皮有黄褐、红紫等色」：原文是 "Yellow or brown onions"、"Red or purple onions"，页面没说是外皮还是肉。"外皮"是撰写者加的。去掉"外皮"，写"洋葱有黄褐与红紫等色"。
10. item_butter 第 3 条「半固体乳化物，约含 81% 乳脂」：81% 乳脂是成分，不是外观。第 2 条的稠度已写了软硬。删第 3 条（butter 仍有 3 条，够 2 条下限）。
11. item_beet 第 2 条「红色来自甜菜红素」：这是色素成因，不是外观；且第 1 条"红到深红"和第 3 条"深紫"两色并列、来源页又说有黄、白栽培种，需要在 term 里注明"红甜菜"。建议删第 2 条。
12. item_cabbage 第 4 条「叶球重约 500–1000 克」：重量不是外观，但属于可核实的物性，不算错。是否保留请协调者定；我倾向保留，不阻断。

### 其余食物条目（通过）

salt（3）、cheese 前两条、plum、apple、hazelnut、walnut、lentil、parsnip、carrot、turnip、garlic、egg、dry_peas 等：原句均在页面，term 忠实，未加程度。说明：Plum 页写的是 plums 总称，不是 Prunus domestica 专指，与"李"一致，不算错；dry_peas 第 1 条出自 field pea 小节，与"干豌豆"一致。

## B. 金属 physicalMetal

密度全部正确：钢 7850→7.85、铜 8940→8.94、锡 7280→7.28、银 10490→10.49（Engineering ToolBox 金属表）；黄铜 Wikipedia 8.4–8.73 g/cm³，中值 8.565；Engineering ToolBox 的 Brass-rolled 8430–8730、Yellow 8470、Brass casting 8400–8700 都落在同区间内，一致。锡 7.289（Wikipedia）与 7.28 相容。

需改的外观条目：

13. steel 第 1、2 条（银灰色镜面、金属光泽微带灰色）：原句取自 Wikipedia「Iron」页，第 1 条原句明说是 "pristine and smooth pure iron"，第 2 条是铁元素的信息框，两条都不是钢。第 3 条「受潮易生锈，锈为棕到黑色」：前半句出自 Carbon steel 页，页面实为 "...high moisture levels and/or salt"，被截短；后半句 "brown-to-black hydrated iron oxides" 是铁页的锈。把钢的外观写成纯铁的外观，不符合"描述的是这一种材料本身"。钢页（Wikipedia「Steel」）若有颜色或光泽原句就用它；没有就别写 appearance，按未知。term 里的括号自注（"取自铁页"）只能说明来源，不能让条目成立。
14. tin 第 3 条「13.2 °C 以下久置会转成暗灰色粉末状（锡疫）」：页面只说 α-tin 是 "dull-gray powdery material"、"stable below 13.2 °C and is brittle"，以及 β-tin 在低温下 "tends to transform spontaneously into α-tin"，并说杂质可使转变温度降到 0 ℃ 以下。"久置"页面没有，是加的程度。这也是变化过程，不是静态外观。改成"α 锡（灰锡）为暗灰色粉末状"，或删。
15. brass 第 2、3 条的 citation 与页面略有出入：第 2 条原句在分号后有 "conversely"，第 3 条 "green-blue patina" 页面实为 "a patina of green-blue copper carbonate"。词义没变，不阻断，但 citation 应写成页面原文，不要自行拼接。copper、silver 的外观条目与原句一致，通过。

## C. 金属名称归类规则（server-plugin/item-class.mjs）与 tests/foodmetal.test.mjs

通过，没有写死物品 id：

- metalClass 的函数体里没有物品 id（测试用正则断言了这一点）。规则靠数据里的 nameWords、forms、modifiers、tailForms、excludeTags，逻辑是排除标签 → 标签优先 → 名称尾部锚定 → 取最长材料词。
- 我用 metalClass 对真实 world/meta/items.json 跑了一遍（只读，未改文件）。命中 10 件：铁料、铁边料小块、小铁钉、门柜小铰链、薄铜片、淬用钢条、退火铁线卷、黄铜窄带、细银丝束、压薄锡片，类别全部正确。
- 未命中但名称含金属字的 26 件（工具、书、成品、货币、金银花、含铁矿石、铁锄、铁镰、铁挂钩等）全部是未知，没有误归。
- 正例覆盖六类与"黄铜带取黄铜不取铜"；反例覆盖金银花、书、工具、成品、货币、夹字、尾字不在表、修饰字不在表、"钢束"（连写尾字之前须有形态字）。
- 提醒两点，不阻断：
  - ① modifiers（窄、细、薄、熟、退火）和 tailForms（束、卷、叠）这批词，是对着 3 个真实名称（黄铜窄带、细银丝束、退火铁线卷）加的。词表是闭合的、按类写，符合"规则按类"，但覆盖面窄。"宽铜片""粗铁线"仍归不出。可接受，因为缺项就是未知，且不会误归。
  - ② 名称锚定只管结尾，前缀不限（如"淬用钢条""压薄锡片"）。"假钢条"之类会误归。当前世界数据里没有这种名称，测试里也没有前缀反例，建议补一个。
- 标签优先的副作用：带 iron 标签的"门柜小铰链""小铁钉"按铁类取值。这与已批准的 physical 行为一致，不算新问题。

## D. 两处"放宽断言"的判断：不算放宽，正当，没有让已审条目逃过

- world/design/matprops-approval.mjs 的 entriesFor：我对比了 5c750f92 和现在的 items.json，原有 25 件带 props 的物品，现在仍是 25 条条目，一件没丢；这 25 件的 props 除了新增的 appearance，没有任何字段改动。投影只去掉 appearance，所以这 25 条的指纹（row 内容）与改动前完全相同。新加的 17 件里，有 8 件本来就是已审条目，其余 9 件是只含 appearance 与 basis 的纯外观行，被 `Object.keys(row).some(k=>k!=='basis')` 排除。如果有人给纯外观行再加数值维度，它会立刻变成条目、要求审批，这条路径没有被堵死。
- tests/matprops-approval.test.mjs 第 15 行：计数公式与 entriesFor 的过滤同构，改后仍断言类别行数与物品行数之和，没有放宽。
- 代价要说清：appearance 被投影掉后，这 17 件的外观文本不在任何 D12 指纹里，改动不会被 --verify 发现。这是设计选择（外观是后加维度，登记为不入 D12），因此外观数据的可靠性只靠 L1（格式）和本审查（L2/L4）。不要把 --verify 通过当作外观数据已核对。建议后续对外观另设指纹或批准记录，或至少在 PLAN 里记明。

## 结论

需改。阻断项：2、3、4、7、8、9、13、14（原句不存在、以偏概全或带加的程度）；建议项：1、5、6、10、11、12、15。改完请再送审。

---
## 复审（提交 2092d52b）：不批，仅一条阻断

已改到位：cream、vinegar、fresh_herb 类别外观已删，按未知；steel 外观已删，metalProps 对钢给出 appearance 未知，密度 7.85 仍在；honey 滤蜜条、butter 成分条、beet 色素条、cabbage 重量条已删，honey、leek、onion 现为页面原句；单件外观 18 件 56 条，与数据一致；physical 与 physicalMetal 的 L1 返回空，--verify ok。

阻断：
- 锡第 3 条「α 锡（灰锡）为暗灰色粉末状」与物品不符，判不批。页面原句 "α-tin is a dull-gray powdery material" 存在，但 α 锡是 13.2 °C 以下才稳定的同素异形体；Wikipedia 同页说 β 锡在低温下才会转 α，杂质可把转变温度压到 0 °C 以下，锑或铋能阻止转变。W3 的锡片常温下是银白的 β 锡，把 α 锡写进"锡类外观"，会让锡片被描述成粉末。
- 处理：删这条，锡只留"银白色"和"可抛光"两条（锡类规则要求 3–6 条，需放宽或另补一条静态外观原句，例如 Tin 页别处的颜色或光泽句；补不到就改为 2 条并相应改校验）。

忠实性核对（均通过）：
- 黄铜 5 条：原句都在。"bright, golden appearance" 在导语；"more golden coloured" 与 "more zinc are harder and more silvery" 分句引用，词义不变；硫化铜 "reacts with sulfur to form a brown and eventually black surface layer" 与 "can then oxidize in air to form a patina of green-blue copper carbonate" 逐字存在。第 5 条原句有条件：硫化层接触弱酸性水（如城市雨水）之后。term 略去该条件，写成"可在空气中氧化成……"，属建议项，可补"（经弱酸性雨水后）"。
- 乳酪「有的乳酪气味特别冲」：原句 "consumers may perceive some cheeses that are especially pungent-smelling ... as unpalatable"，逐字存在，term 忠实，没有写不可口的评价。
- 莳萝 4 条：原句都在。"stems are slender and hollow with finely divided, softly delicate leaves" 一句；"small white to yellow scented flowers"；"fern-like leaves ... aromatic"。身高条已删。莳萝现在是单件外观，不再是类别通则。

---
## 最终（提交 4276c02a）：通过
- 锡：外观整类删除，仅留密度 7.28；metalProps 对锡返回外观未知，L1 为空，--verify ok。
- 黄铜第 5 条：term 已写回弱酸性水条件，citation 为页面原句 "regularly exposed to slightly acidic water such as urban rainwater ... can then oxidize in air to form a patina of green-blue copper carbonate"，忠实。
- 第一轮全部阻断项已关闭。

---
## 最终确认（提交 754a20ff）：通过
核对 4276c02a..754a20ff 的数据改动，均为收紧，与第一轮结论无冲突，--verify ok：
- 榛仁整件 props 删除，原本只有 appearance 与 basis，不是审批条目，原有审批条目数不变。
- 莳萝删花条、鸡蛋只写生蛋白、洋葱删带条件与气味条、蜂蜜改"多为淡黄或深褐"、铜去掉"渐""久"并拆成两条原句、甜菜拆成两条并删深紫、银"可高度抛光"，均与所引原句一致，未加程度。
- 锡 basis 改写为 Tin 页对外观有银白与灰两种冲突写法，因此不写外观，与"锡按未知"一致。
