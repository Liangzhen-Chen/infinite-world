# 乙-1/乙-4 补 1115y5：待裁清单（脚本生成，勿手改；按现行 migrows 重新生成，替代 乙1c-rules待裁清单.md）

- 依据：李白 11-15 16:25 裁定（审查/李白裁定-1115-1625-rules待裁与拟名.md）；脚本 脚本/卷十一/apply-1115y5.mjs。
- 各类实改行数（对裁定计数 36+4+112+2+6+11+19+2+5+2=199）：1a 36、1b 4、1c 112、1d 2（M8b-4 与 M14-82 拆行）、1e 6、1f 11、1g 19、1h 2、1i 5（不改）、1j 2（M1-6、M1-8，22d451da 已处理）；合计 199。
- 现行 migrows 中对象为 rules 的行（不含别名行）：197 行；裁定清单里不在这批的（本来就不是 rules 对象，如 1g 的 M20-29 等已拆的或对象为别的值）：无。
- 三（裸 tools、tests 按规则号取系统键）：改 23 行；列出 1 行。

## 一、1i：留给李白裁，对象仍写 rules（5 行）

| 迁移行 | 卷 | 落点（原文） | 候选 |
|---|---|---|---|
| M1-10 | 卷一 | — | physicalMetal 名称字词匹配归谁没写；候选 sys.item（卷三乙物品类别）、sys.material（卷三甲物质） |
| M11-4 | 卷十一 | 卷一 §6.5；R11-1.9 | 卷一 §6.5 账本母卡 LEDGER-1 的对象没定义；候选 sys.economy（卷六账本，R6 终态见 §4.1 规则 11） |
| M20-88 | 卷二十 | 迁规则表（卷一常数入表的规矩） | 六个文件分属多卷，规则表键没写；候选按文件：education.mjs→sys.profession、finance-assets.mjs 与 finance-bank.mjs→sys.economy、medicine.mjs→sys.status、pets.mjs→sys.species、quest-sources.mjs→sys.event_type |
| M20-90 | 卷二十 | 卷二各登记节（单位 §1.4、命名 struct §1.5、词表 §1.9、原语与命名空间 §1.12、§2.9；清单见 §8 第 5 条）；1115k2 核后 | 要按卷二十 §8 第 5 条逐项拆；候选：词表族与规则表键登记项各归其所属卷的系统或卷二的登记节，逐项待拆 |
| M14-69 | 卷十四 | 同 M14-16、M14-27、M14-31、M14-37 | 被指的四行对象不同；候选见下面“被指行现取对象”：同 M14-16、M14-27、M14-31、M14-37 → 现取 M14-16=profession、M14-27=profession、M14-31=sys.profession、M14-37=sys.profession |

## 二、1d：M14-82 旧键六个（卷十四 §2.5 各键没有写旧键对应，无 basis 栏，逐个对不上）

| 子行 | 旧键 | 候选（按键名） |
|---|---|---|
| M14-82a | practice | rules.profession（kinds、lapseDays） |
| M14-82b | levels | rules.growth（levelThresholds） |
| M14-82c | education | rules.learning |
| M14-82d | training | rules.learning 或 rules.teach |
| M14-82e | books | rules.cert 或数据行通用字段 |
| M14-82f | npcGrowth | rules.growth |

## 三、1g：列给李白的子行

| 子行 | 原文 | 候选 |
|---|---|---|
| M5-22d | remote-generation 两处 | sys.place 或 sys.worldgen（卷十 §4.1，remote-generation 在卷十 M10-1 删除） |
| M5-10b | 家户决策归卷六、卷九 | sys.economy（卷六 §4.12 家户预算）、sys.ai_interface（卷九决策） |
| M5-30c | 气候基准 | sys.time_env（卷二十气候基准） |

## 四、三：裸 tools、tests 取不出对象的行

| 迁移行 | 卷 | 落点（摘） | 为什么 |
|---|---|---|---|
| M11-7 | 卷十一 | C11-7 | 李白裁定：M11-7 仍待补（本行不是迁移处置） |

## 五、其他取不出的行

无。

## 六、同类修正与显示对象

本卷规则号优先的同类修正 2 行：M5-11：sys.monsters→sys.place；M5-14：sys.species→sys.place。

卷二十九不在六类的显示文件对象改 move_out 21 行：M29-2：templates→outputGate（处置 recode→move_out）；M29-4：map→display（处置 recode→move_out）；M29-5：templates→outputGate（处置 recode→move_out）；M29-6：templates→outputGate（处置 recode→move_out）；M29-7：labels→outputGate（处置 to_data→move_out）；M29-8：labels→outputGate（处置 recode→move_out）；M29-9：panels→display（处置 recode→move_out）；M29-10：assets→display（处置 to_data→move_out）；M29-21：panels→display（处置 recode→move_out）；M29-22：labels→outputGate（处置 to_data→move_out）；M29-23：epithets→display（处置 to_data→move_out）；M29-24：assets→display（处置 to_data→move_out）；M29-25：labels→outputGate（处置 to_data→move_out）；M29-26：templates→outputGate（处置 replace_entry→move_out）；M29-27：templates→outputGate（处置 to_data→move_out）；M29-28：panels→display（处置 replace_entry→move_out）；M29-34：panels→display（处置 replace_entry→move_out）；M29-35：panels→display（处置 replace_entry→move_out）；M29-40：panels→display（处置 replace_entry→move_out）；M29-41：panels→display（处置 replace_entry→move_out）；M29-43：panels→display（处置 replace_entry→move_out）。

## 七、1f 的别名与取对象

别名行（锚点全在对方行锚点之内，不单独计数）：M8-24→M27-16、M14-45→M14-32、M14-46→M14-32、M14-71→M14-8、M14-79→M14-89、M4-28→M4-5。

锚点不在对方行锚点之内、只取对方行对象的：M29-3→M17-12（对象 sys.travel，锚点不在对方行锚点之内，取对象不标别名）；M11-1→M27-7（对象 sys.offscreen_save，锚点不在对方行锚点之内，取对象不标别名）；M11-3→M9-2（对象 sys.ai_interface，锚点不在对方行锚点之内，取对象不标别名）；M20-27→M13-31（对象 sys.combat，锚点不在对方行锚点之内，取对象不标别名）；M14-96→M14-58（对象 sys.profession，锚点不在对方行锚点之内，取对象不标别名）。
