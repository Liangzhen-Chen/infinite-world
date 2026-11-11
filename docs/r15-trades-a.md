# 第15条回扫（制作痕迹与包装），行当批物品 A 半

范围：mrw-items-1.json 第1-29件 + mrw-items-2.json 第1-10件，共39件。正文读自 F:/dnd-wt/M27/world/drafts/w3/trades/items/<id>.json。只判第15条一项。

判据：
1. 写制作痕迹，须物品自己有以它为 output 的配方，且与配方的材料、工具、processFacts 一致。
2. 没有配方的物品，制作痕迹只在骨架 use、seasonality 已写明时才算有出处；骨架没有的，算骨架外内容。
3. 包装、收纳器物骨架没有就算错；“容器另备”声明不算错。

统计：通过 34，不过 5。

## 不过的5件

1. item_copper_sheet（无配方）。description「表面留有辊压的细密纹路」：“辊压”是制作痕迹，骨架没有配方，use、seasonality 也没写。
2. item_mortise_chisel（无配方）。description「铁匠铺锻成的直口木凿」与「凿身中段留有锻打锤痕」：写了锻造和锤痕，骨架没有配方，也没有这类事实。
3. item_bone_folder（无配方）。description「骨料磨成的压片」与「两端修成圆弧」：“磨成”“修成”是制作痕迹，骨架只有“圆端不会把表面割开”，没有配方。
4. item_needle_case（有配方）。description「夹身压得扁平」：配方 processFacts 只有“裁皮折成浅夹，缝住短边和底边，外翻口包住针尖”，没有“压”，配方里的 bone_folder 也不在这张配方的工具中，与配方对不上。
5. item_linseed_oil（无配方）。inspection「瓶塞松脱或油面浮膜者不收」：“瓶塞”是骨架外的包装部件，骨架只写“小瓶来货”。

## 通过的34件说明

- 有配方且正文与材料、工具、processFacts 一致：belt_strap、boot_gaiter、boot_scraper、cabbage_barley、chalk_powder、coin_wrap、gall_wash、honey_curd_spread、leather_grip、leather_thimble、leek_fish_pot、foot_rest、hinge_pin、leather_hinge。
- 无配方、正文没有写制作痕迹，或痕迹出自骨架 use、seasonality：
  - bench_plane、book_trades_wood、carrot（去叶留根见 use）、dry_peas（剥荚晒干见 use）。
  - fresh_apple、flat_file、gum_grain、hand_bellows、hazelnut（剥壳见 use）、hemp_thread、hen_egg。
  - ink_brush、lampblack（收集筛净见 use）、grooving_wheel、hand_auger、iron_punch、leather_shears、leek、cabbage、calcite_chalk。
- 包装、容器：cabbage、carrot、hen_egg、honey_curd_spread、gall_wash、chalk_powder、leek_fish_pot 都只是“容器另备、不随货提供”声明，合规。linseed_oil 的“小瓶”见骨架 seasonality，合规，只有“瓶塞”不过。
