# 块 6 补值卡 G Sonnet 只核（11-19）

范围：ds/b6-fixG HEAD 4666ffc85 对 origin/master 的 diff（material.json +8 行 wearResistance、tests/kernel/material-wear.test.mjs、docs/卡回报/ds-b6-fixG.md）。依据：李白 21:0x ①(b)；卷三甲 :119、§4.2.5 :388-391；卷三乙 I-7 :914。核者 Claude Sonnet 5.5 中档，非写者。

## 结论：本部分可合入（带三条记入问题的提醒，不挡合入）

## 逐项

1. 刻度与换算式。卷三甲 :119 只给 [1,100]，§4.2.5 只给例值（熟铁 60、竹 22、水 5、骨 35），没给换算刻度。李白裁定要求"换算到已有刻度、两锚点"，没规定函数形式，所以对数线性是写者自定，可接受：Archard 磨耗反比于硬度，对数防硬材料超 100。手算回代：H=61 得 22；H=1274.9 得 22+38=60，两锚点成立。风险：单调但只靠两点定形，任何硬度到分值都是"暂定"，写者已全行标暂定、designed 级，正确。
2. 竹锚点。Wikipedia Janka 页（亲读）：钢球直径 11.28 mm，投影面积 100 mm²（1 cm²）；天然竹 6100 N，北方红橡 5700 N。6100 N÷100 mm²=61 MPa 成立。提醒：Janka 球压入半深，真实接触面是球冠不是投影面，与 Brinell（球冠面积）不严格同口径，木与金属同轴比有系统偏差；写者已在基础里标"暂定"，可接受，但记入问题。熟铁锚点用低碳钢 130 HB 代用：不是编数据，因为出处（Engineering ToolBox Mild steel 130）真实、代用关系与"待核"写明、全行标暂定；判"代用料、待核、标暂定"，可接受，不必改为未建。注意锚点本身是 §4.2.5 例值，换算只负责把真实硬度对到该刻度，熟铁 60 是否对应 1274.9 MPa 若日后核出真值要整批重算（见提醒 a）。
3. 出处复核（WebFetch 亲读原文）。Wood Database 美洲榆：830 lbf（3,690 N），12% 含水率，与 basis 一致。Wikipedia 元素硬度页：铜两列 235–878 与 520，金 188–245 与 189，银 245–250 与 206，铅 38–50 与 37.5–41.8（铸）；写者取第二列，与报告一致（取第二列的理由是"带注的列"，勉强成立，已在 basis 写明另一列区间）。Janka 页红橡 5700 N 一致。手算全部复核通过（H→分）：红橡 57→21.15→21.2；榆 36.9→15.72→15.7；柳 19.2→7.55→7.5；铸铁 260×9.80665=2549.7→68.67→68.7；铜 520→48.79→48.8；金 189→36.13→36.1；银 206→37.22→37.2；铅 39.65→16.60→16.6。柳条用黑柳 Janka 为代用料（桑科柳条编织品实际是多种柳枝，且代的是木材不是柳条），基础已写"代用料"，可接受。
4. 没补的行。逐行对照 diff：只新增 8 行 wearResistance，未动其余行，无编数。wearResistance 在 material 表为 required never，卷二 columns 登记体例（_unbuilt-derived.json 的 columns）要求 required 非 never，写者说不能登，成立（现有 _unbuilt-derived 里 wearResistance 条目属 item 表，不是 material 表）。缺口的机读追踪：I-7 :914 规定结构组材料缺 wearResistance 在加载期按 `onUnknown`=报错，所以任何 6-22 配料用到缺值材料都会加载报错暴露，这就是机读可追，不必另登。回报里的未填清单是文字，建议 6-22 配料卡把"报错的材料清单"原样回灌补值卡 H，不另造登记。判：不须另有机读登记。
5. 测试 tests/kernel/material-wear.test.mjs：期望为字面量 21.2/15.7/7.5/68.7/48.8/36.1/37.2/16.6，注释里给了 MPa 手算输入，与我独立手算一致；没抄基线；锚点断言 22、60 守例值；cellGrades 断言 grade designed、basis 以"暂定，待试玩标定："起头、citation null（与 material.test.mjs 体例一致）。可挑剔处：测试没有重算公式，只钉终值，这正合卷文"手算成字面量"的规矩。
6. 亲跑结果：见文末。

## 提醒（记入问题，不挡合入）
a. 熟铁 60 ↔ 130 HB 的锚点代用是整批暂定的根，日后查到熟铁直接硬度要整批重算（公式单点改）。
b. Janka 投影面与 Brinell 球冠面不同口径，木材行相对金属行有系统偏差。
c. 铜、金、银取第二列的理由是带注的列，需试玩后或核出更权威源再定。

## 验证命令与末行
- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：tests 1066 / pass 1066 / fail 0。
- `node tools/accept/run.mjs pre_commit`：verdict pass（items fail 3 项：vol12.A12-4.5、vol12.S12-2 与一项 E-ACC-ITEM-COUNT，均为 vol12 卡项、与本 diff 的 material 数据无涉，未在 master 上对照，判为既有，不影响 verdict）。
