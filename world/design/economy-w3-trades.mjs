// W3 second batch. Each row is a deliberately chosen supply or process.
// Mechanical quantities are authored here; the model only drafts descriptions.
const raw = [
 ['pearl_barley','脱壳大麦',4,.5,180,'loc_bs','npc_hw_yanzhe','秋收后充足，春末多为存粮','food','已脱壳的大麦粒，可熬浓汤；不是麦芽，不直接当酿酒曲'],
 ['dry_peas','晒干豌豆',4,.3,180,'loc_hw_fields','npc_hw_linsui','秋后晒干，雨季须隔潮','food','剥荚晒干的豌豆，浸水后煮软；豆粒破皮并不代表熟透'],
 ['turnip','带皮芜菁',3,.4,10,'loc_hw_fields','npc_hw_meiling','晚秋至初冬采收','food','一份带皮芜菁，可切片烩煮，根须与坏斑需削去'],
 ['leek','青叶韭葱',2,.2,3,'loc_hw_fields','npc_hw_meiling','春秋可采，暑热时易萎蔫','food','叶与葱白相连的一束韭葱，切段煮鱼或炒软，夹泥处先洗净'],
 ['onion','黄皮洋葱',3,.25,30,'loc_bs','npc_hw_yanzhe','夏末干燥入库，春季芽多','food','晒干外皮的洋葱，剥去薄皮后烹煮；切开会出辛味汁液'],
 ['hen_egg','鸡蛋小篮份',5,.24,5,'loc_hw_fields','npc_hw_linsui','春夏产蛋较多，冬日供应少','food','四枚鸡蛋为一份，重量含蛋壳；按份售蛋不附篮子，须煮熟后食用'],
 ['hazelnut','去壳榛仁',6,.2,60,'loc_hw_northwood','npc_hw_meiling','秋季剥壳，春季多为存仁','food','去壳榛子仁供烘食或碾碎拌糕，表面仍有薄种皮'],
 ['carrot','束装胡萝卜',3,.3,7,'loc_hw_fields','npc_hw_meiling','秋季较甜，夏季根细','food','去叶留根的胡萝卜，可切条烹煮；一束按份出售，大小略有差别'],
 ['cabbage','紧叶甘蓝',3,.5,5,'loc_hw_fields','npc_hw_meiling','冷凉季采收，暑天容易失水','food','紧叠叶片的甘蓝，可切丝炖煮；虫损外叶与硬根另行剔除'],
 ['honey','滤蜜小罐份',6,.1,180,'loc_hw_apiary','npc_hw_anhuai','夏末取蜜后集中供应','food','一百克滤过蜂蜜，仍可能结晶；按蜜重售卖，容器由买者自备'],
 ['rapeseed_oil','菜籽油小份',5,.1,90,'loc_bs','npc_hw_yanzhe','夏季榨油后补货','food','食用菜籽油供少量煎烙，买者自备容器；不是机械润滑油'],
 ['fresh_apple','晚熟苹果',3,.25,10,'loc_hw_orchard','npc_hw_meiling','秋季采收，春季无鲜果','food','一份晚熟苹果，可生吃或去核煮软；碰伤果须及早处理'],
 ['rye_flour','细筛黑麦粉',5,.4,30,'bld_hw_mill','npc_hw_ayan','秋冬新粉多，雨季防结块','food','四百克细筛黑麦粉，可和水作烙饼；不含现成酵种'],
 ['pine_board','风干松木短板',6,1,null,'bld_hw_mill','npc_hw_ayan','冬伐料经风干后逐批下锯','wood','风干松木短板供小件木作，毛边未刨，板材并非已拼好的家具'],
 ['willow_rod','柔柳条束',3,.35,90,'loc_hw_dock','npc_hw_zhengshuisheng','春季修枝后较多','wood','已去叶的细柳条束，趁柔韧时编小筐；干裂条不宜强弯'],
 ['hemp_thread','细捻麻线团',5,.15,365,'bld_hw_weaving','npc_hw_sulan','全年少量纺成，收麻季补货','fiber','细捻麻线用于缝革和结网，可涂少量蜂蜡减摩；不等同于承重缆索'],
 ['linseed_oil','木用亚麻油',6,.1,180,'loc_bs','npc_hw_yanzhe','秋后榨制，小瓶来货','material','木器表面薄涂用油，不作为食品销售；施工布料须摊开晾置'],
 ['copper_sheet','薄铜片',14,.2,null,'loc_yandu','npc_hw_yanzhe','随河运小批输入','metal','一张可冷剪弯折的薄铜片，用于标牌与装饰包角；不作承重梁材'],
 ['red_ochre','赤土色粉',4,.1,null,'loc_bs','npc_hw_yanzhe','旱季采磨，雨季只售干粉','pigment','筛过的赤色土粉用于木牌着色，须配黏结材料；不是药物'],
 ['lampblack','收烟墨粉',4,.05,null,'loc_bs','npc_hw_yanzhe','作坊按油烟收集，产量有限','pigment','收集并筛净的黑色烟粉，用树胶调墨；细粉应避免扬起吸入'],
 ['calcite_chalk','软白垩块',3,.2,null,'loc_bs','npc_hw_yanzhe','石料车带来少量软块','mineral','较软的白色划记石，可在木板与布料上临时作记号；不能当生石灰'],
 ['pumice','轻质磨石',5,.3,null,'loc_yandu','npc_hw_yanzhe','由外地河船运入','mineral','多孔磨石用于木面和熟革边缘细磨，不适合重磨钢刃'],
 ['parchment','刮薄羊皮纸',12,.06,365,'loc_bs','npc_hw_luqing','依抄写订单进货','paper','一张处理好的羊皮纸，可书写或裁作书签；并非食用或包药材料'],
 ['oak_gall','干瘿小包',5,.08,180,'loc_hw_northwood','npc_hw_wushuo','秋季采集后晾干','material','干树瘿用于鞣色和调制深色写液，须按具体配方加工；不是可食坚果'],
 ['gum_grain','净树胶粒',6,.05,365,'loc_yandu','npc_hw_yanzhe','河运分批输入，受潮批次退货','material','干净树胶粒遇水软化，可作颜料黏结剂；不能代替承重榫接'],
];
const tools = [
 ['frame_saw','窄框木锯',28,1.1,150,'npc_hw_duanyan','woodworking',6,'锯断松木短板，锯齿须沿锯路推进；不能拿去锯石'],
 ['mortise_chisel','直口木凿',18,.35,130,'npc_hw_duanyan','woodworking',6,'配木槌凿出小榫眼，刃口朝离手的方向下切'],
 ['wood_mallet','枣木敲凿槌',10,.55,110,'npc_hw_ayan','woodworking',6,'敲击木凿或轻校木榫；不作铁匠热锻锤'],
 ['hand_auger','横柄手钻',26,.65,140,'npc_hw_duanyan','woodworking',6,'旋转横柄在木板上开孔，遇节疤须减力退屑'],
 ['bench_plane','短底木刨',35,.9,160,'npc_hw_duanyan','woodworking',6,'顺纹刨平短板，刀口厚薄由楔片调整；不用于铁片'],
 ['wood_rasp','粗齿木锉',16,.3,120,'npc_hw_duanyan','woodworking',6,'锉修木件曲面与粗毛刺，齿缝积屑后清理'],
 ['leather_shears','短刃裁革剪',23,.4,130,'npc_hw_duanyan','weaving',20,'剪裁鞣熟软革与麻布，握柄逐段合剪；不剪铁线'],
 ['stitching_awl','缝革扁锥',14,.15,110,'npc_hw_duanyan','weaving',20,'在熟革上刺开扁缝孔，便于穿针，不能代替钻木孔'],
 ['bone_folder','平脊骨压片',8,.08,90,'npc_hw_sulan','weaving',20,'压平熟革折边或纸折线，圆端不会把表面割开'],
 ['grooving_wheel','缝距齿轮柄',19,.16,120,'npc_hw_duanyan','weaving',20,'沿皮边滚出浅缝距记号，印痕只定位不贯穿皮料'],
 ['flat_file','平齿铁锉',20,.42,160,'npc_hw_duanyan','smithing',5,'冷态锉平铁件毛边与接缝，细屑另扫入废堆'],
 ['round_file','圆身孔锉',19,.28,140,'npc_hw_duanyan','smithing',5,'修整金属孔缘，沿孔轴推拉；不当撬棒使用'],
 ['iron_punch','短身冲子',13,.3,150,'npc_hw_duanyan','smithing',5,'配锻锤在热铁片上冲孔，需砧台承托'],
 ['rivet_set','凹头铆窝杆',14,.32,140,'npc_hw_duanyan','smithing',5,'凹端托住铆钉头配合手锤压铆，工具本身不作耗材'],
 ['hand_bellows','皮囊小风箱',38,1.6,160,'npc_hw_yanzhe','smithing',5,'向小炉稳定送风，软革囊有单向风瓣；不是储气罐'],
 ['stone_mortar','浅腹石臼',18,1.8,140,'npc_hw_yanzhe','woodworking',14,'石臼与石杵一套，研碎干颜料或树胶；接触颜料后不再盛食品'],
 ['fine_sieve','细目工艺筛',13,.3,90,'npc_hw_yanzhe','woodworking',14,'筛匀颜料颗粒与磨料，筛面不能拦住所有细尘；不作饮水净化器'],
 ['reed_pen','斜口芦苇笔',3,.02,50,'npc_hw_luqing','woodworking',22,'蘸现成墨液写字，开缝笔尖的墨量有限，需反复蘸墨'],
 ['ink_brush','短毫画笔',7,.04,70,'npc_hw_luqing','woodworking',16,'细毛笔头涂写木牌或纸面，颜料和水另备'],
 ['mining_pick','普通矿镐',28,2.8,100,'npc_hw_duanyan','smithing',17,'木柄铁镐用于挖掘已松裂的土石与矿脉表层，使用会磨损；不是武器或自动找矿器'],
 ['sheet_shears','弯柄金属剪',31,.85,150,'npc_hw_duanyan','smithing',5,'剪裁薄铜片，短行程分次合剪；不剪厚铁坯，刃口缺损后先维修'],
];
// group rows: id/name/price/weight/shelf/minutes/proficiency/materials/tools/facts
const craft = {
 kitchen:[
 ['barley_pea_stew','麦豆稠汤',15,.82,1,80,100,'pearl_barley:1,dry_peas:1,water:3,salt:1,wood_shavings:2','cooking_pot,wood_spoon,kitchen_knife','两类干粮先用配方内一部分水泡软，剩余水煮汤；木匙搅底，盐调味，煮到豆粒无硬心。'],
 ['leek_fish_pot','韭葱鱼煨锅',13,.63,1,45,100,'leek:1,fish:1,water:1,salt:1,wood_shavings:1','cooking_pot,kitchen_knife,wood_spoon','洗净韭葱切段与鱼块一同小火煨，木匙拨开浮沫；保留鱼刺提醒，残渣弃置。'],
 ['pea_spread','盐煮豌豆泥',11,.42,1,90,0,'dry_peas:1,water:2,salt:1,wood_shavings:2','cooking_pot,wood_spoon','豌豆在规定清水内泡软并煮透，用木匙压成粗泥，刮净锅底焦点，不掺额外油脂。'],
 ['turnip_oat_cake','芜菁燕麦饼',14,.54,1,55,100,'turnip:1,oat_flour:1,rapeseed_oil:1,salt:1,wood_shavings:1','cooking_pot,kitchen_knife,mixing_paddle','芜菁剁细后利用汁水拌粉与盐，以菜籽油薄铺锅底烙熟，搅糊板帮助翻动，焦屑弃置。'],
 ['honey_nut_cake','蜜榛黑麦糕',27,.6,2,70,100,'rye_flour:1,hazelnut:1,honey:1,hen_egg:1,wood_shavings:2','cooking_pot,kitchen_knife,mixing_paddle','榛仁切碎，四枚蛋去壳，与蜂蜜及黑麦粉拌匀，用厚锅低火烘凝；蛋壳弃置，不用酵种。'],
 ['onion_egg_soup','葱香蛋花汤',16,.68,1,35,0,'onion:1,hen_egg:1,water:2,salt:1,wood_shavings:1','cooking_pot,kitchen_knife,wood_spoon','洋葱切薄煮软，四枚蛋去壳打散，以木匙引成细流入热汤，煮熟后调盐。'],
 ['honey_curd_spread','蜜拌鲜乳酪',25,.38,1,20,0,'fresh_curd:1,honey:1,hazelnut:1','cooking_pot,kitchen_knife,wood_spoon','榛仁切成细末，以木匙压松鲜乳凝块，拌入蜂蜜和榛末；不经熟成，不加入未列奶油。'],
 ['vinegar_carrot','短浸醋萝卜',11,.26,2,120,0,'carrot:1,fruit_vinegar:2,salt:1','cooking_pot,kitchen_knife','胡萝卜削去坏处切细条，裹盐后浸入果醋，连切配与短浸共120分钟；不是长期发酵酸菜。'],
 ['cabbage_barley','甘蓝麦粒烩',14,.78,1,75,100,'cabbage:1,pearl_barley:1,water:2,salt:1,wood_shavings:2','cooking_pot,kitchen_knife,wood_spoon','麦粒以规定水煮软，切丝甘蓝后段入锅，木匙翻匀，硬根与虫损叶弃置。'],
 ['apple_rye_griddle','苹果黑麦烙饼',18,.59,1,45,100,'fresh_apple:1,rye_flour:1,water:1,rapeseed_oil:1,wood_shavings:1','cooking_pot,kitchen_knife,mixing_paddle','苹果去核切薄，粉加规定清水拌糊，油润锅底，将果片夹在两层糊中烙熟。'],
 ],
 wood:[
 ['lidded_seed_box','分格种子匣',27,1.1,null,160,150,'pine_board:2,iron_nail:4,linseed_oil:1','frame_saw,mortise_chisel,wood_mallet,bench_plane','锯板后凿出滑盖槽，隔板插入浅槽，钉合底板并薄涂木用油；匣内为空，不提供种子。'],
 ['three_leg_stool','斜脚矮凳',30,1.45,null,180,150,'pine_board:2,wooden_peg:3,linseed_oil:1','frame_saw,hand_auger,wood_mallet,wood_rasp','厚板削圆作座面，斜钻三孔，短板裁脚后装榫木楔，锉平接触边再涂油。'],
 ['wall_shelf','短板壁架',25,1.2,null,140,100,'pine_board:2,iron_nail:4','frame_saw,mortise_chisel,wood_mallet,bench_plane','短板分作架面和两支三角托，凿浅槽并钉接；成品需另选合适墙面安装，不能自立。'],
 ['foot_rest','倾面脚凳',23,1.15,null,120,100,'pine_board:2,wooden_peg:2','frame_saw,mortise_chisel,wood_mallet,wood_rasp','削成前低后高的侧板，横板入槽，以木楔夹紧，锉圆脚跟常碰的前缘。'],
 ['bread_board','提孔干货板',19,.72,null,90,100,'pine_board:1,linseed_oil:1','frame_saw,hand_auger,bench_plane,wood_rasp','刨平短板并钻提孔，边缘圆修，薄涂木用油后待表面干爽；供放置已包好的干货，不直接切食物。'],
 ['thread_rack','绕线立架',26,1.05,null,150,150,'pine_board:2,wooden_peg:4','frame_saw,hand_auger,wood_mallet','锯出底座和立柱，钻孔装四根木楔作挂头，校正站稳；线团另备，架子没有纺线能力。'],
 ['walking_crutch','腋托木拐',28,1.3,null,180,150,'pine_board:2,linen_cloth:1','frame_saw,hand_auger,wood_rasp,whittling_knife','锯成拐身和腋托，做穿接榫并以布条包托部；按固定尺寸制作，不声明医疗矫正效果。'],
 ['shutter_panel','拼条窗扇',30,1.65,null,200,150,'pine_board:2,iron_nail:6','frame_saw,bench_plane,wood_mallet','刨平板条拼成短窗扇，背面横档钉住；铰链和安装作业另算，成品不自带窗框。'],
 ['tool_tray','开口工具盘',25,1.25,null,140,100,'pine_board:2,iron_nail:4','frame_saw,mortise_chisel,wood_mallet','锯出盘底与浅围边，四角作搭口，用钉固定后削去毛刺；交货为空盘。'],
 ['willow_creel','扁口柳条篓',20,.72,180,180,100,'willow_rod:3,hemp_thread:1','whittling_knife,bone_folder','柔柳条交叉编底，竖经收口，麻线扎住篓沿；用骨压片压伏凸头，篓口不带盖。'],
 ],
 leather:[
 ['belt_strap','素面软革腰带',41,.26,365,100,100,'tanned_leather:1,belt_buckle:1,hemp_thread:1','leather_shears,stitching_awl,sewing_needle','沿皮边剪长条，打折回孔后装腰带扣，以麻线缝住扣端；皮边毛刺修平。'],
 ['coin_wrap','折口零钱夹',28,.2,365,85,100,'tanned_leather:1,hemp_thread:1','leather_shears,stitching_awl,sewing_needle,bone_folder','软革折出两层浅兜，锥开针孔，麻线缝合侧边，圆压片压平折口；交付不含钱币。'],
 ['leather_thimble','绕指护针套',25,.06,365,55,100,'tanned_leather:1,hemp_thread:1','leather_shears,stitching_awl,sewing_needle','裁小皮条绕指成套，内侧补折一层，在边缘穿孔缝合；用于顶缝针，不挡刀刃。'],
 ['scroll_wrap','束带卷稿套',41,.41,365,120,150,'tanned_leather:1,hemp_thread:1,linen_cloth:1','leather_shears,stitching_awl,sewing_needle,bone_folder','皮内衬麻布并包边缝合，余皮剪束带，卷起后系紧；遮尘防磨，不保证纸稿浸水不湿。'],
 ['sheath_pouch','钝口工具皮套',28,.25,365,100,100,'tanned_leather:1,hemp_thread:1','leather_shears,stitching_awl,sewing_needle','对折皮料，预开缝孔后沿边缝合，口部留宽；只套钝口小工具，不作为尖刀刀鞘。'],
 ['boot_gaiter','系带护靴片',36,.42,365,110,150,'tanned_leather:1,hemp_thread:2','leather_shears,stitching_awl,sewing_needle,grooving_wheel','裁成一对护片，按缝距滚痕逐孔刺穿，以麻线缝住边缘并留系带孔；挡泥不增加护甲。'],
 ['leather_hinge','折页软革铰片',26,.18,365,70,100,'tanned_leather:1,hemp_thread:1','leather_shears,stitching_awl,sewing_needle,bone_folder','裁出对称长条，压出弯折线，锥开两端安装孔，麻线锁住孔缘；用于轻木匣，安装钉另备。'],
 ['rein_patch','缰绳接头护片',27,.22,365,85,150,'tanned_leather:1,hemp_thread:1','leather_shears,stitching_awl,sewing_needle','皮料折成包覆片，侧边预孔缝合，留下穿带通道；是护片而非完整缰绳，不附坐骑。'],
 ['needle_case','扁皮长针夹',27,.16,365,80,100,'tanned_leather:1,hemp_thread:1','leather_shears,stitching_awl,sewing_needle','裁皮折成浅夹，缝住短边和底边，外翻口包住针尖；空夹出售，针另备。'],
 ['leather_grip','缠柄熟革条',26,.2,365,65,100,'tanned_leather:1,hemp_thread:1','leather_shears,stitching_awl,bone_folder','皮料剪长条，压平卷边，以锥开首尾系孔附麻线；供现有工具重新缠柄，工具另备。'],
 ],
 iron:[
 ['drawer_pull','拱背抽屉拉手',25,.42,null,100,100,'iron:1,charcoal:2','smith_hammer,smith_tongs,flat_file,iron_punch','铁料拉出拱背，锻平两端耳片后冲孔，冷却再锉去毛边；安装钉另备。'],
 ['door_latch','落杆门闩',29,.95,null,150,150,'iron:1,charcoal:3','smith_hammer,smith_tongs,flat_file,iron_punch','分锻闩杆与两个套耳，套耳冲安装孔，冷态试滑；只作内闩，无钥匙锁芯。'],
 ['boot_scraper','门前刮泥架',28,.82,null,130,100,'iron:1,charcoal:3','smith_hammer,smith_tongs,flat_file','锻平刮泥边并弯出两脚，锉钝接触边；固定在门前木台上刮鞋底，台座另备。'],
 ['stove_grid','小炉挡炭栅',33,1.42,null,180,150,'iron:1,charcoal:4','smith_hammer,smith_tongs,flat_file,rivet_set','分出边框和短栅条，热铆连接，冷却检查空隙均匀；用于小炉挡住大炭块，细灰仍会落下。'],
 ['bucket_handle','弯耳提桶梁',26,.7,null,110,100,'iron:1,charcoal:2','smith_hammer,smith_tongs,round_file','拉出半圆提梁，两端卷耳，冷却后锉平耳口；配已有桶耳安装，木桶另备。'],
 ['hinge_pin','长头铰销',11,.14,null,65,100,'iron_scrap:1,charcoal:1','smith_hammer,smith_tongs,flat_file','把边料拉细，锻出长扁销头，冷锉杆身便于穿入铰耳；不附整副铰链。'],
 ['tent_stake','弯头帐钉',24,.72,null,90,100,'iron:1,charcoal:2','smith_hammer,smith_tongs,flat_file','铁坯拉成长钉，头端弯钩，尖端锉去脆薄毛边；锤入普通土层，不能保证锚住碎岩。'],
 ['strap_eye','双孔绑带耳',12,.13,null,70,100,'iron_scrap:1,charcoal:1','smith_hammer,smith_tongs,iron_punch,round_file','边料压成短片，冲两孔并把中段拱起，冷态锉圆孔缘；用于穿带，带与固定钉另备。'],
 ['pot_lifter','夹口提锅钩',27,.88,null,130,150,'iron:1,charcoal:3','smith_hammer,smith_tongs,flat_file','分锻两支夹臂和铰销，卷耳对合，锉平夹口后试空合；只夹小锅卷边，不附耐热手套。'],
 ['sack_pricker','直柄开袋锥',11,.15,null,60,100,'iron_scrap:1,charcoal:1','smith_hammer,smith_tongs,flat_file','边料拉出短尖与厚握柄，锉平接缝，尖口保持钝锥状；拨开粗袋缝，避免割断整条缝线。'],
 ],
 artisan:[
 ['ochre_paint','赤土胶彩',14,.17,3,40,100,'red_ochre:1,gum_grain:1,water:1','stone_mortar,fine_sieve,ink_brush','树胶用规定清水泡软，石臼研散色粉，筛去粗粒再混匀；作木牌表面颜料，不做人体涂药。'],
 ['soot_ink','树胶烟墨',15,.2,7,50,100,'lampblack:1,gum_grain:1,water:1','stone_mortar,fine_sieve,reed_pen','烟粉与泡软树胶研合，筛去颗粒后试笔；墨色可写字，受水浸仍可能晕开。'],
 ['gall_wash','淡瘿染液',15,.24,7,90,100,'oak_gall:1,water:2,charcoal:1','stone_mortar,cooking_pot,linen_filter','干瘿捣碎以规定水煮出浅褐色液，滤布滤渣；仅为淡染液，未加铁盐，不称铁胆墨。'],
 ['chalk_powder','细白划粉',8,.14,null,35,0,'calcite_chalk:1','stone_mortar,fine_sieve','白垩在石臼中捣细后过筛，粗粒留在废堆；粉用于短时放样划记，不是墙面强胶料。'],
 ['polishing_powder','轻石细磨粉',10,.22,null,50,100,'pumice:1','stone_mortar,fine_sieve','轻质磨石分次捣碎，细筛后收粉，粗粒弃置；供木面和皮边轻磨，不研食品。'],
 ['parchment_bookmark','折首皮纸签',21,.035,365,35,0,'parchment:1,hemp_thread:1','leather_shears,stitching_awl,bone_folder','羊皮纸裁成长签，折首压平，刺小孔系麻线；空白签可夹书，不教授技能。'],
 ['copper_nameplate','素铜空白铭牌',23,.14,null,85,100,'copper_sheet:1','sheet_shears,iron_punch,smith_hammer,flat_file','薄铜片用金属剪成形，冲两角安装孔并锉圆边；牌面空白，刻字另算。'],
 ['waxed_thread','上蜡麻缝线',12,.15,365,30,0,'hemp_thread:1,beeswax:1','bone_folder','麻线贴蜂蜡块反复拉过，再以骨压片轻压贴合表面；余蜡附在线束包纸上交付，不另成副产品。'],
 ['wax_seal_blank','圆面封印蜡饼',12,.045,null,40,0,'beeswax:1,charcoal:1','cooking_pot,wood_spoon','小火软化蜂蜡，以木匙压成无字扁圆饼并冷却；用时再软化，不附官方印记或身份效力。'],
 ['wood_marking_kit','白垩放样条',19,.18,null,40,0,'calcite_chalk:1,linen_cloth:1','leather_shears,flat_file','白垩用铁锉修成易握短条，麻布剪条包住一端并以布边自系；用于在木面划线，布余片弃置。'],
 ],
};
const groupSpec={kitchen:{skill:3,station:'cooking',origin:'bld_hw_qingdeng',teacher:'npc_hw_linsui'},wood:{skill:6,station:'woodworking',origin:'bld_hw_mill',teacher:'npc_hw_ayan'},leather:{skill:20,station:'weaving',origin:'bld_hw_weaving',teacher:null},iron:{skill:5,station:'smithing',origin:'bld_hw_forge',teacher:'npc_hw_duanyan'},artisan:{skill:14,station:'woodworking',origin:'bld_hw_mill',teacher:null}};
const iid=name=>`item_${name}`;
export function economyW3Trades(world){
 const items=[],recipes=[],supply=[];
 const stock=(npc,item,quantity)=>{let row=supply.find(row=>row.npc===npc);if(!row){row={npc,stock:{},reason:'W3行商与手工业首批有限开市库存；售罄不自动回满'};supply.push(row);}row.stock[item]=quantity;};
 for(const[slug,name,basePrice,weight,shelfLifeDays,origin,seller,seasonality,tag,use]of raw){items.push({id:iid(slug),name,aliases:[],scope:null,quality:'木',weight,basePrice,durability:100,origin,shelfLifeDays,seasonality,tags:[tag,'w3_trades'],use,acquisition:{seller,mode:'有限库存'}});stock(seller,iid(slug),4);}
 for(const[slug,name,basePrice,weight,durability,seller,station,skill,use]of tools){items.push({id:iid(slug),name,aliases:[],scope:null,quality:basePrice>=25?'铜':'石',weight,basePrice,durability,origin:seller==='npc_hw_yanzhe'?'loc_bs':seller==='npc_hw_luqing'?'bld_hw_school':seller==='npc_hw_ayan'?'bld_hw_mill':seller==='npc_hw_sulan'?'bld_hw_weaving':'bld_hw_forge',shelfLifeDays:null,seasonality:'作坊与行商按订单补货，现货有限',tags:['tool','w3_trades'],use,checkBonus:{bonus:0,skills:[`skill_life_${skill}_core`]},acquisition:{seller,mode:'有限备用工具库存'}});stock(seller,iid(slug),2);}
 const byId=new Map([...world.items,...items].map(row=>[row.id,row]));
 for(const[group,rows]of Object.entries(craft)){
  const spec=groupSpec[group];
  for(const[slug,name,basePrice,weight,shelfLifeDays,minutes,minimumProficiency,inputs,requiredTools,processFacts]of rows){
   const materials=inputs.split(',').map(value=>{const[n,count]=value.split(':');return{item:iid(n),amount:Number(count)};});
   const cost=materials.reduce((sum,row)=>sum+byId.get(row.item).basePrice*row.amount,0);
   if(basePrice<cost)throw new Error(`${slug}价格${basePrice}低于投料${cost}`);
   const mass=materials.filter(row=>!['item_charcoal','item_wood_shavings'].includes(row.item)).reduce((sum,row)=>sum+byId.get(row.item).weight*row.amount,0);
   if(weight>mass+.0001)throw new Error(`${slug}重量${weight}超过非燃料投入${mass}`);
   const hotArtisan=['gall_wash','wax_seal_blank'].includes(slug),metalArtisan=slug==='copper_nameplate';
   const origin=hotArtisan?'bld_hw_qingdeng':metalArtisan?'bld_hw_forge':spec.origin,station=hotArtisan?'cooking':metalArtisan?'smithing':spec.station;
   const recipe=`recipe_w3b_${slug}`,product={id:iid(slug),name,aliases:[],scope:null,quality:group==='iron'?'铜':'木',weight,basePrice,durability:group==='iron'?150:100,origin,shelfLifeDays,seasonality:group==='kitchen'?'按当季原料制作，当日小批供应':'按订单制作，材料缺货时暂停交付',tags:[group==='kitchen'?'food':group==='leather'?'leather':group==='wood'?'wood':group==='iron'?'metal':'material','w3_trades'],use:processFacts,acquisition:{recipe}};
   items.push(product);byId.set(product.id,product);
   recipes.push({id:recipe,name:`制作${name}`,aliases:[],scope:null,skill:`skill_life_${spec.skill}_core`,minimumProficiency,minutes,difficulty:minimumProficiency>=150?20:minimumProficiency?15:10,materials,tools:requiredTools.split(',').map(iid),workstation:station,output:{item:product.id,quantity:1},byproducts:[],learningRequired:true,learnFee:6,learnMinutes:90,teachers:spec.teacher?[spec.teacher]:[],toolWear:1,failure:{recoverFraction:group==='iron'?.25:0,injury:group==='iron'?2:group==='wood'?1:0},prerequisites:minimumProficiency?[{skill:`skill_life_${spec.skill}_core`,minimum:minimumProficiency}]:[],processFacts});
  }
  const name={kitchen:'谷蔬小灶记',wood:'短板榫接图说',leather:'熟革折缝手册',iron:'门窗炉具锻作录',artisan:'纸墨与小料手记'}[group];
  const book={id:`item_book_trades_${group}`,name,aliases:[],scope:null,quality:'木',weight:.24,basePrice:28,durability:90,origin:'bld_hw_school',shelfLifeDays:365,seasonality:'小学堂按预约誊写，每类仅一册现货',tags:['paper','book','w3_trades'],use:`记载${name}所属十个工序的用料和手艺；识字100可读，阅读时间300分钟，制造仍须达到对应配方熟练度。`,book:{grade:'初级',author:'河谷工匠匿名合抄',edition:'白石集市校订本',origin:'bld_hw_school',teaches:recipes.filter(row=>craft[group].some(product=>row.id===`recipe_w3b_${product[0]}`)).map(row=>row.id),readingMinutes:300,prerequisites:[]},acquisition:{seller:'npc_hw_luqing',mode:'有限抄本库存'}};
  items.push(book);stock('npc_hw_luqing',book.id,1);
 }
 for(const recipe of recipes)for(const tool of recipe.tools)if(!byId.has(tool)&&!world.items.some(row=>row.id===tool))throw new Error(`工具不存在 ${recipe.id}/${tool}`);
 return{items,recipes,supply};
}
