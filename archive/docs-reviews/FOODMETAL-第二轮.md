通过（第二轮复审 754a20ff；下文为第一轮 4276c02a 记录）

范围：F:/dnd-wt/MPH，t-mph 4276c02a 相对 5c750f92。只读；未跑测试。引文用 WebFetch 打开原页核对，共约 35 页次、约 90 条原句（食物类别 salt/cheese/spice_seed 全 9 条，18 件食材 56 条中的 54 条，金属 copper/brass/silver/tin/steel 与密度表）。

## 1. 引文核对
原句均存在，数值与原页一致；括号内的英寸换算、"which can..." 等后半句在 citation 中被省略，不影响词义。未发现编造原句。下列是 term 与原句、或与"这件食材"不符的条目：

阻断（改后再审）：
- A1 item_hazelnut 第 1 条「坚果近球形至椭圆」：原句主语是带壳的 hazelnut cob（"A hazelnut cob is roughly spherical to oval, about 15–25 mm long..."）。该物品是「去壳榛仁」，已无壳、不是整颗坚果，这条描述的不是它。删，或改成仁自己的描述。
- A2 item_dill 第 4 条「花小，白至黄色，有香气」：该物品是「鲜莳萝束」（嫩叶扎束，茎与叶），没有花；且原句有条件 "In hot or dry weather, ... flowers form in small umbels"，term 略去了条件。删。
- A3 item_hen_egg 第 3 条「生蛋白无色透明，煮熟变白而不透明」：后半是加工后状态，该物品是生蛋；且这一条的主体是蛋白（albumen），不是物品整体。改成只写生蛋白无色透明，或删（本件另有 3 条，够下限）。
- A4 铜（physicalMetal.classes.copper）第 3 条「在空气中渐生红色锈膜，屋面铜久成绿色铜绿」：原句 "acquires a reddish tarnish when exposed to air"、"Copper used in buildings, usually for roofing, oxidizes to form a green patina"。"渐"与"久"是撰写者加的时间程度，原句没有。去掉"渐""久"；"屋面铜"的条件原句有，可留。
- A5 item_beet 第 2 条「甜菜根呈深紫色」：该物品是「红根甜菜」，物品文本是表皮暗红；第 1 条「红到深红」与它自相矛盾。原句是 "Usually, the deep purple roots of beetroot are eaten..."，另一处 "root colors are shades of red and dark red" 前有 "Unless otherwise noted"（页面还有黄、白栽培种）。两条并列写成同一物的常态不成立。删第 2 条，第 1 条 term 注明"红甜菜根"已有，可留。

建议（不阻断）：
- B1 item_onion 第 2 条「外层鳞片干而脆」：原句语境是秋季叶枯、收获时；term 略去条件。第 4 条「切开时气味辛辣」是气味，不是外观。可保留，建议注明或删。
- B2 item_honey 第 1 条「色自淡黄到深褐」：原句是 "generally pale yellow and dark brown in color ... but other colors can occur"，"自…到"把并列改成连续区间。可改"多为淡黄或深褐"。
- B3 item_dry_peas 第 3 条、item_cabbage 重量等数值条：不是外观，属可核实物性，保留与否协调者定。
- B4 tin 的 basis 写"页面里可作外观的只有银白色与可抛光两条"：Tin 页导语还有 "A metallic-gray metal"，说法略不准；按未知不写外观的结论不变，建议改成"银白与灰两种相互冲突的写法，不足 3 条稳定词条"。
- B5 silver 第 2 条「可抛光到很亮」："很亮"是 "high polish" 的加重，建议"可高度抛光"。

通过的（原句在、term 忠实、对象正确）：salt 3、cheese 3（气味条已按 pungent-smelling 原句，"有的"保留限定）、spice_seed 3（并列三种，basis 已说明）、dry_peas 前两条、lentil、walnut、fresh_apple、plum、turnip、carrot、parsnip、cabbage、leek、garlic、butter、honey 其余、brass 5 条（含 patina 的弱酸性水条件已写回）、silver 第 1、3 条、copper 第 1、2 条、steel 与 tin 不写外观（Steel 页确无颜色/光泽原句；Tin 页 α 锡仅低于 13.2 °C 稳定）。
密度：钢 7850、铜 8940、锡 7280、银 10490（Engineering ToolBox 原值）；黄铜 8.4–8.73 取中值 8.565，Engineering ToolBox 各黄铜行（8400–8746）与之相容。

## 2. 金属名称归类规则
通过。我写了只读诊断脚本（F:/dnd-tmp/diag-r2.mjs，对 world/meta/items.json 全部 486 件跑 metalClass），命中 10 件，全部正确：铁料、铁边料小块、小铁钉、门柜小铰链 -> iron；薄铜片 -> copper；淬用钢条 -> steel；退火铁线卷 -> iron；黄铜窄带 -> brass；细银丝束 -> silver；压薄锡片 -> tin。W3 里含金属字的其余 26 件（铁钳、铁挂钩、铁锅架、铁锉、金属剪、铜铭牌、钢规、角尺、锭模、吊线锤、各类钢凿/钢刀、铁线网片、黄铜腕圈、锡饰边、铁短链、银开口环、铜钥、泊绳银片、含铁矿石、铁锄、铁镰、金银花、书）均为未知，无误归，无漏归。唯一边界：素铜空白铭牌（材料、w3_trades）归未知——名称尾"铭牌"不是形态字，按规则是成品坯，可接受。
规则里无物品 id；reEsc 转义集完整（. * + ? ^ $ { } ( ) | [ ] \），nameWords/forms/modifiers/tailForms 均经转义；校验函数检查 forms 为单字、excludeTags 非空。
提醒：名称锚定只管结尾，前缀不限，"假钢条"类会误归，当前数据无此名称，建议后续补反例。

## 3. 投影与指纹
`node world/design/matprops-approval.mjs --verify`：ok:true，d 卡 4/4，调味佐餐卡 43 条（L2 通过 40，人工核对 3：item_turnip、class_spice_seed、item_caraway_seed），unresolved 为空。
我另对 5c750f92 与现在的 items.json 逐条比对：原有 25 件带 props 的物品，去掉 appearance 后与旧 props 逐字相同，0 件变化；items.json 件数 55 不变，非 props 字段无变化；material-props 的 classes（已批准类别）0 条变化，physical.classes 八类 sources 不变、条数不变。故已审条目一条未丢、指纹不变。
appearance 不在审批指纹里（刻意投影掉）；它在 L1 有确定性检查：itemAppearanceErrors（物品行 2–6 条、term 与 citation 必填、词组不重复、citation 须匹配 Wikipedia「页面」：原句 的格式、不许多余字段）、validatePhysical（类别行 3–6 条，行字段白名单）、validatePhysicalMetal（nameWords 类别存在、与 physical 不重复、forms 单字等）。限度：L1 只查格式，不核对原句真伪、也不防"term 加料"，所以 --verify 通过不代表外观已核对，真伪靠本类人工审查；这一点需在 PLAN 记明，外观目前没有 L2 记录。

## 4. 测试
tests/foodmetal.test.mjs 新增 178 行，全是增；tests/matprops-approval.test.mjs 唯一被改的一行是条目计数公式，加了对 appearance 的排除，与 entriesFor 的投影同构，仍断言总数，不算放宽。第一轮删去的类别（cream/vinegar/fresh_herb）与不写外观的件（水、面包等）有显式 assertEqual undefined。没有发现被删或放宽的断言。建议补两条测试：A1–A5 的修正（榛仁不含整果描述、莳萝无花、鸡蛋无熟态、铜无"渐/久"）可用 term 反向正则锁住。

## 结论
需改。阻断：A1–A5（A1、A2 描述的不是这件食材，A3 带加工状态，A4 加了时间程度，A5 自相矛盾）。改后送第三轮，仅复核这 5 条与新增测试。

## 复审 754a20ff（只读）
结论：通过。A1–A5 均已改到位，`--verify` 仍 ok:true（d 4/4，调味佐餐 43 条，无未解决项）。
- A1 榛仁：无 appearance，整件按未知。
- A2 莳萝：3 条（叶、叶香、茎），花已删；原句 WebFetch 已核。
- A3 鸡蛋：仍 4 条（壳色、形状、生蛋白无色透明、蛋黄随饲料）；并非新补原句，是原有的第 4 条保留，第 3 条只删"煮熟变白"，剩余截取的 "Colorless and transparent initially" 在页面（蛋白节）原句内，已核。
- A4 铜：4 条，"渐""久"已去，改为"暴露在空气中会带上红色的失泽层""建筑上的铜（多用于屋面）氧化后呈绿色铜绿"，与原句 acquires a reddish tarnish when exposed to air、Copper used in buildings, usually for roofing, oxidizes to form a green patina 一致。
- A5 甜菜：深紫删，拆成"红到深红的各种色调"与"切片可见深浅不一的环带"，两句均为页面原句片段（"Unless otherwise noted" 前缀略去，物品即红根甜菜，可接受）。
- 建议项：洋葱剩 2 条、蜂蜜"多为淡黄或深褐"、银"可高度抛光"、锡 basis 改为银白与灰冲突，均已照改；全库 17 件物品 51 条。
