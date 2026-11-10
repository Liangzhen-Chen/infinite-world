# J2 严格 L4 复读（第 1 批，46 件；已按第 15 条重判）

统计：批 3，不批 43。（较初判改判 8 件：批改不批。）
重判依据：bones.json recipes 中以这 46 件为 output 的配方为 0 条，物品都没有自己的配方，故第 15 条下物品说明里的制作痕迹一律算骨架外内容；包装、收纳器物骨架里没有也算错（“容器另备”如实交代的不算）。原先的不批无一被第 15 条推翻。
不批按类别（一件可跨类）：
- A 名称无出处/写错（4）：cucumber、caraway_seed、soap_flake、beech_blank
- B 骨架外尺寸、数量、模糊用量（4）：cucumber、ash_stave、caraway_seed、reed_bundle
- C 骨架外器具、容器、包装、火源（28）：pear、mutton、pork_fat、butter、cream、walnut、mustard_seed、poppy_seed、dry_mushroom、bristle_bundle、shell_button_blank、reed_bundle、silver_wire、tin_sheet、brass_strip、goat_skin、alum_grain、quill_set、pine_pitch、wheat_grain、broad_bean、lentil、caraway_seed、fine_sand、flour_paste_powder、red_dyewood、linen_canvas、hard_cheese
- D 骨架外制作痕迹、制法、来源、用途（22）：parsnip、hard_cheese、walnut、poppy_seed、cork_sheet、linen_canvas、steel_bar、silver_wire、tin_sheet、goat_skin、red_dyewood、clean_lard、flour_paste_powder、soap_flake、wool_felt_sheet、bone_blank、horn_blank、slate_splinter、garlic、fine_sand、horsehair_bundle、iron_wire
- E storage 越界（骨架外处置、后果、地点）（9）：iron_wire、fine_sand、steel_bar、brass_strip、horsehair、bristle、goat_skin、pine_pitch、hard_cheese

名称出处核对：npc_hw_yanzhe 名为严辙（文中写“颜哲”错）；npc_hw_meiling 名为梅绫（文中写“梅玲”错）；旧渡口、公用果园、北林边、旧磨坊、小学堂、织坊、铁匠铺、青灯酒馆均在世界地点里有出处，“木料棚”没有。

## 逐件

item_wheat_grain，不批：description“五百克一包”、inspection“翻看包内上下层”。理由：包装骨架外（第 15 条，骨架无包装，也未写容器另备）。
item_broad_bean，不批：storage“装入干燥容器”。理由：收纳器物骨架外，且未写容器另备（第 15 条）。
item_lentil，不批：description“三百克一包”“袋内偶见细砂与碎壳，为晒后脱荚、筛分时留下”（包装与制作痕迹骨架外）；storage“装入干燥容器”（收纳器物骨架外）。
item_parsnip，不批：description“根身有横向环纹与切去硬头留下的平口”。理由：骨架 use 是“切除硬头烹煮”，切除是使用者的工序，正文写成已切去，与骨架矛盾（且 inspection 的“硬头切面”随之矛盾）。
item_beet，批
item_pear，不批：description“近梗处有采果剪留下的短梗痕”。理由：采果剪是骨架外器具。
item_plum，批
item_cucumber，不批：description“长约一掌”（尺寸骨架外，身体尺度，第 8 条）；description“集市由梅玲按当季货源小批摆出”（名字应为梅绫，写错）。
item_garlic，不批：description“成辫挂售”“蒜辫”、inspection“检查蒜辫”。理由：编辫是骨架外的制作形态，物品无自己的配方（第 15 条）。
item_dill，批
item_mutton，不批：description“肉面留有剔骨刀走过的浅痕”。理由：剔骨刀是骨架外器具。
item_pork_fat，不批：description“分割刀留下的平直切痕与少量修整缺口”。理由：分割刀是骨架外器具。
item_butter，不批：description“表面留有木模刮平的细痕”（木模骨架外器具）；description/inspection/storage 的“纸包”“原纸包”（骨架外包装）。
item_cream，不批：inspection“揭盖先看乳皮”、storage“盛器加盖”（盖骨架外，容器只许交付时另备）；description“撇取时刮过的浅痕”（撇取隐含勺，骨架外器具）。
item_hard_cheese，不批：description“由盐渍压榨后的乳块经长时间阴凉熟成而成……便于旅途中切配食用”（制法与用途骨架外）；storage“切开后尽快食完”“以干布包裹”（骨架外处置、布）。
item_walnut，不批：description“去青皮后阴干，手工敲壳取仁，拣净碎壳后分装……装布袋扎口”。理由：工序（敲壳需器具）、布袋均为骨架外。
item_mustard_seed，不批：description“装成一小纸包”、storage“扎紧纸包”。理由：纸包是骨架外包装。
item_poppy_seed，不批：description“筛去碎壳与尘杂”（筛为骨架外器具）；“掺入面团或撒在面点表面”（用途细化到骨架外，骨架只有烘焙用）。
item_caraway_seed，不批：storage“装入干燥密闭的容器”（收纳器物骨架外）；description“由颜哲分装”（名字应为严辙）；description“研碎少许调入麦食”、inspection“取少量摊在掌上”（少许、少量为模糊用量，第 8 条）。
item_dry_mushroom，不批：description“以炭火余温烘至卷边”（骨架无燃料却写用火）；“装入粗布袋”（骨架外包装）。
item_parsnip 见上。
item_steel_bar，不批：description“辊轧压平的浅槽”（骨架外工序）；storage“置于铁匠铺干燥料架”“现货售罄须等待另一次实际补货”（料架为骨架外设施，补货句不属存放建议）。
item_iron_wire，不批：storage“受潮后擦净晾干”。理由：骨架外具体处置做法（第 9 条明例），且擦需布；description“拉拔细纹”亦属骨架外工序。
item_brass_strip，不批：description“表面经粗布擦过”“剪裁与轻捶”（粗布、剪为骨架外器具）；storage“木盒或布套”“避免与铁件混放受潮生绿”“取用后按原卷向卷回”（骨架外容器、后果与处置）。
item_silver_wire，不批：description“束身以麻纸条缠腰固定”（麻纸条骨架外），inspection/storage 的“纸腰”同；description“供绕制饰件、缠柄或作细工嵌线之用”（骨架只有绕饰，缠柄、嵌线为骨架外用途）。
item_tin_sheet，不批：description“以钝器压出”（钝器骨架外器具）；“适合小型饰件与器物表面的浅浮雕加工”（用途超出骨架的小型装饰压纹）；storage“干燥木板”。
item_ash_stave，不批：description“长约两臂”。理由：骨架外尺寸，身体尺度（第 8 条）。
item_beech_blank，不批：description“从旧磨坊木料棚取出”。理由：“木料棚”无出处（第 10 条）。
item_cork_sheet，不批：description“由栓皮栎外层树皮切制压平而成”。理由：树种与制法为骨架外内容。
item_linen_canvas，不批：storage“干燥木架或布袋”（收纳器物骨架外，第 15 条）；description“五百克一卷”“边缘留有裁切毛茬”（包装与制作痕迹）；description“草木灰漂洗后的浅黄灰调”。理由：漂洗工序与草木灰为骨架外内容。
item_wool_felt_sheet，不批：description“由织坊将羊毛湿压成密实片体，边缘保留裁切后的短绒，表面可见纤维交错压合的浅纹”。理由：制作痕迹，物品无自己的配方（第 15 条）。
item_goat_skin，不批：description“边缘经刮刀修齐”（刮刀）、“石灰脱毛后残留”（工序）、“作衬里”（骨架只有折包）、“遇水易回软变形”（骨架外属性）；storage“逾期皮质易脆裂”（后果说法，第 9 条）；inspection“说明受潮已久”。
item_horsehair_bundle，不批：storage“逾期毛质易脆断”。理由：后果说法，骨架外（第 9 条）；description“手工梳理”亦为骨架外工序。
item_bristle_bundle，不批：description“以麻绳松松拢住”、inspection“绳结是否松脱”（麻绳骨架外包扎物）；“取自动物背脊”（来源骨架外）；storage“逾期鬃质变脆”（后果说法）。
item_quill_set，不批：inspection“再核对根数与重量”。理由：核对重量隐含量具，骨架外；根数骨架未给。
item_reed_bundle，不批：description“外圈以两道细篾箍束”。理由：细篾为骨架外材料，“两道”为骨架外数量（非工序自然得出）。
item_shell_button_blank，不批：description“整组以麻绳松系”、inspection“绳结是否松脱”。理由：麻绳骨架外。
item_bone_blank，不批：description“一端留有锯切平口”“表面经刮削与晾晒”、inspection“锯口平整，弧面有细刮痕”。理由：制作痕迹，物品无自己的配方（第 15 条）。
item_horn_blank，不批：description“已去髓修边”“外弧留细密锉痕与横向锯口，内壁见刮削纹”。理由：制作痕迹，物品无自己的配方（第 15 条）。
item_red_dyewood，不批：storage“装入干布袋或木匣”（收纳器物骨架外，第 15 条）；description“供染布与器物着色”。理由：骨架只有“供染色”，染布、器物为骨架外用途。
item_alum_grain，不批：inspection“确认包装未破损”。理由：description 无包装，骨架外包装，且前后不一致。
item_clean_lard，不批：description“不用于煎烙”（骨架外禁忌）；“护面料”用途模糊超出骨架（骨架为皮革薄涂或调护蜡）；“搅拌后”“切取处”隐含器具。
item_pine_pitch，不批：description“松脂经慢火熬去稀薄部分”（骨架无燃料，骨架外火与工序）；storage“逾期变脆发暗”（后果说法）。
item_soap_flake，不批：description“由颜哲摊售”（名字应为严辙）；“淡淡碱味”（成分骨架外）。
item_flour_paste_powder，不批：description“装于纸包内”“以一百克为一包”、storage“纸包封口”（包装骨架外，第 15 条）；description“粉体由磨细的浆料干燥而成”“外壁留有捆扎压痕”。理由：制法与捆扎骨架外。
item_fine_sand，不批：description“经清水淘洗、摊晒至干，装袋”“一袋”、storage“扎紧袋口”（制作痕迹与包装骨架外，第 15 条）；storage“受潮后摊开晾干再收”。理由：骨架外具体处置做法（第 9 条明例）。
item_slate_splinter，不批：description“表面留有顺层剥离的浅平痕”。理由：剥离痕属制作痕迹，物品无自己的配方（第 15 条）。
