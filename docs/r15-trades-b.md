# 第15条回扫（制作痕迹与包装），行当批我负责的 62 件

范围：mrw-items-1.json 第30至57件（28）、mrw-items-2.json 第11至19件（9）、items-untouched-25.txt（25），读 items/<id>.json 当前正文，只判第15条。
统计：过 60、不过 2。

判法：有以该物品为 output 的配方，则写的制作动作、工具、材料必须与配方 materials、tools、processFacts 一致；无配方的物品（原料、工具、书类），只能写骨架 use、seasonality、name 里已有的加工事实，不得另写锻、刮等制作痕迹；包装、收纳器物骨架没有就算错，“容器另备”声明不算错。

## 不过
- item_wood_rasp（无配方的工具），d“铁匠铺锻打的粗齿木锉”：写了“锻打”这一制作痕迹，骨架没有以它为 output 的配方，use、seasonality 里也没有锻打，按骨架外内容算错。应只写“铁匠铺出的粗齿木锉”。（同类的 frame_saw“铁匠铺出的”、sheet_shears“铁匠铺出的”、mining_pick“铁匠铺备售的”都没写锻打，过。）
- item_parchment（无配方的原料），i“有无透光沙眼与未刮净的毛根；……粗涩起毛处即为刮薄不均”：用“毛根”“刮净”“刮薄不均”推演刮制工序的痕迹，该物品无配方，骨架只有 name“刮薄羊皮纸”和 use“处理好的羊皮纸”，工序痕迹属骨架外。这条较边缘，已按严格口径判不过。

## 过（60 件）
- 有配方的 35 件（ochre_paint、onion_egg_soup、parchment_bookmark、pea_spread、polishing_powder、scroll_wrap、shutter_panel、soot_ink、stove_grid、thread_rack、three_leg_stool、turnip_oat_cake、vinegar_carrot、walking_crutch、wax_seal_blank、waxed_thread、wood_marking_kit、rein_patch、sack_pricker、strap_eye、tent_stake、tool_tray、barley_pea_stew、honey_nut_cake、apple_rye_griddle、lidded_seed_box、wall_shelf、bread_board、willow_creel、sheath_pouch、drawer_pull、door_latch、bucket_handle、pot_lifter、copper_nameplate）：制作动作与配方材料、工具、processFacts 逐项对上，无骨架外器具和包装；“容器另备”“线团另备”“安装钉另备”等如实声明不算错。
- 无配方的原料、工具、书类件：只写了 use、seasonality、name 已有的事实，如洋葱“晒干外皮”、豌豆、蜂蜜“滤过”、松板“冬伐料经风干后逐批下锯，未刨光”、四册书“按预约誊写”；无布袋、木架、陶罐等骨架外包装收纳器物。工具类件里的 i 描述（木框、柄、筛网）来自 name 和 use 的结构，不算制作痕迹。

核数：有配方 35 件全过；无配方 27 件中 25 件过、wood_rasp 与 parchment 不过；合计 62 件，过 60、不过 2。
