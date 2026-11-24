# 块 6 补值卡 H 只核（Sonnet，11-19）

对象：分支 ds/b6-fixH，HEAD bdc6b6898，基点 eddbcc5fa（origin/master 现为 43c9e8528，未涉本卡文件）。依据：李白 11-19 22:0x 第六批 ②③、P-3 推导规则、卷三甲体例与 §4.2.5。

## 结论：必须改（小改，三处），改完可合

## 逐项

1. 新增 6 行出处与算式：Feedipedia node/12391（燕麦）用 WebFetch 复核，干物质 87.9、粗蛋白 11.0、粗纤维 13.9、脂肪 5.4、灰分 3.0、总能 19.5（星号方程）全部与数据一致；含水 1−0.879=0.121、碳水 100−11−5.4−3=80.6 手算无误。大麦、黑麦的算式按其引用值手算同样对（0.129、0.836；0.134、0.863）。measured 格没问题。小瑕疵：citation 文字里留有浮点尾巴（80.60000000000001、13.900000000000002、2.1999999999999997），建议顺手写成 80.6、13.9、2.2。
2. "参照同类行 designed""沿用 mat_wheat 暂定值"：做法本身在 P-3 里有依据（P-3-推导规则:32"查不到出处填设定值、basis 写参照哪一行"；:40 能量格"有同类行的照抄其值并写明参照行"；P3-T1 取同本源成分中位数覆盖 edibleFraction、rotRate、salvageFraction、workDifficulty 等），纤维、布行的"设：参照 mat_hemp_fiber/mat_cotton_cloth/mat_goat_hair"属此类，不算编数。**但有一处是错的，必须改**：mat_oat、mat_barley、mat_rye 的 density.solid、decomposePoint、flammability、含水以外的 nutr_salt 等格，数值从小麦照抄，basis 却原样复制 mat_wheat 的"卷三甲 §4.5.5 例 1 全集表'××'栏的卷文值，没有依据代号指向出处（:528 折 C 级）"。例 1 全集表是小麦那一行，不是燕麦/大麦/黑麦，这是把别的行的卷文出处说成本行的，属出处失实。必须改为"设：参照 mat_wheat 同类谷物的值（未找到本谷物自己的合格出处，待补）；设定，可在试玩后调"（与纤维行同写法）。另 density、decomposePoint、flammability 不在 P3-T1 清单里，所以不能引 P3-T1，只能按 :32/:40 写成参照 mat_wheat。flammability 0 对谷物是照抄小麦，同样按此写。
3. 极限氧 17.4、25.2 只读到转述：已标 designed"待核原文"，没有标 measured，诚实；但把未核数字算进易燃度 0.59/0.40 写进数据，等于二手数入库。判：应改为不用这两个数——mat_flax_fiber、mat_linen_cloth 的 flammability 改为参照 mat_hemp_fiber/mat_cotton_cloth 的设定值，mat_sheep_wool 参照 mat_goat_hair，basis 写"极限氧原文未读到，待核"；测试里 0.59/0.4 的期望与 `1−LOI÷42` 那组测试同步改为只测"标 designed、basis 含待核"。（若李白认为转述可作暂定值，保留亦可，但须明报；我倾向改，因为李白 ② 是"按真实成分派生"，原文没读到不算。）
4. 布绳皮纸 wearResistance：9 行（皮 30、生皮 22、麻绳 20、羊皮 18、麻布 14、棉布 12、羊毛 10、毡 9、纸 4）均标"设定数待调（非硬度换算）"，类内顺序有测试，与李白 ③ 原意一致。wearPerUse 标定式写在回报与卷三甲勘误里，Laitala & Klepp 2021 的"约 30 次/年"我未重新抓取，写者自述读到原文，本卡不写 wearPerUse 值，无需据此入库。通过。
5. 熟铁锚点与陶砖瓦：如实写"未能替换/未填"，没有编数，符合"查不到按 P-3、不编"；部分完成属实，李白 ③ 的两项仍欠。勘误 1119k18 体例核过：勘误前快照 blob dff7e930（与基点 master 正文同 blob）、附录第 27 行、现行快照与正文 cmp 相同、不升版本、历史修订未回改。通过。
6. material.test.mjs 行数 93→99：这是把仓库当前行数抄进断言的做法（卡头第二节第 4 条）。本行改动是沿袭旧断言的机械更新，但按口径应改：删掉该处行数断言，保留"零 E、零缺口、全格设定值"的行为断言，或改为断言行数等于数据文件自身行数无意义则直接删。卷三乙预期表的 93 未动，需写者确认那处同样是 93 的来源。
7. 6-22 候选清单重跑：必要（测试与脚本 --check 要求清单与数据一致），属新增行的派生产物，只增 item_linen_cloth 一件，核对属实。通过。
8. 亲跑：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` 末行 tests 1099 / pass 1099 / fail 0（写者回报写的是 1096，rebase 后多 3 个）。`node tools/accept/run.mjs pre_commit` verdict "pass"（输出里 items.fail 3 项为 E-ACC-PARAM-UNCONSUMED 等，非本卡文件，未影响 verdict，我未追查是否先有）。

## 另记
- 写者回报自认用了 node -e、sed -i、heredoc，属违禁，已记。
- 改 flammability 时注意 I-7/校验器对 cellGrades 与 flammability 的一致性，改完需重跑上述两条命令。

## 必须改清单
A. 三个谷物行 density.solid/decomposePoint/flammability/nutr_salt 的 basis 去掉对"例 1 全集表"的失实引用，改写为参照 mat_wheat 的设定。
B. 亚麻纤维、麻布、绵羊毛的易燃度不用未核极限氧：改参照同类设定值，写"待核"。
C. material.test.mjs 删去/改写整表行数 99 的断言。
D.（建议）citation 里浮点尾巴改成整洁小数。
