// Authored ecology and species bones for guide 3.8. Lore may not change numbers.
const habitats=[
    ['habitat_hw_wood','北林边林下','loc_hw_northwood'],['habitat_hw_field','南田田埂','loc_hw_fields'],
    ['habitat_hw_water','旧渡口河滩','loc_hw_dock'],['habitat_hw_orchard','公用果园边缘','loc_hw_orchard'],
    ['habitat_hw_apiary','南坡蜂场外围','loc_hw_apiary'],['habitat_hw_tower','废观测塔林隙','site_beilin_tower'],
].map(([id,name,location])=>({id,name,location}));
const rows=[
 ['bristle_boar','路鬃野猪',0,3,7,'杂食','三至六只','背上硬毛夹着泥，拱开栎树根找橡实','hide'],
 ['red_ear_fox','赤耳林狐',0,1,4,'肉食','独居','赤耳尖从蕨丛露出，把剩余猎物埋在倒木旁','hide'],
 ['grey_ridge_wolf','灰脊林狼',0,5,9,'肉食','四至八只','灰色背线连成一条，狼群从下风绕向林兔','hide'],
 ['brown_deer','褐背短鹿',0,2,6,'草食','三至五只','短腿适合浓密灌木，秋天用角擦剥软树皮','hide'],
 ['brush_squirrel','梢尾松鼠',0,1,2,'杂食','独居','尾尖像细刷，分散藏果却常忘记最深的一穴',null],
 ['burrow_badger','穴脚林獾',0,2,5,'杂食','两至三只','前爪粗短，雨后在旧穴口堆出新泥扇','hide'],
 ['black_throat_marten','黑喉貂',0,1,4,'肉食','独居','喉部乌黑，沿高枝追逐松鼠而少踏林地','hide'],
 ['silver_hedgehog','银尖刺猬',0,1,2,'虫食','独居','刺尖浅白，夜间沿潮湿石边翻找甲虫',null],
 ['leaf_hare','落叶林兔',0,1,3,'草食','两至四只','褐斑像枯叶，从倒木底下留出的侧口逃跑','hide'],
 ['hook_toe_civet','钩趾攀狸',0,3,6,'杂食','独居','弯趾勾住树皮，过冬前偷食树洞里的干果','hide'],
 ['mottled_field_mouse','斑鼻田鼠',1,1,2,'草食','十至二十只','鼻端有白斑，在燕麦田埂挖连通粮穴',null],
 ['yellow_mole','黄肩鼹鼠',1,1,2,'虫食','独居','肩毛土黄，掘土堆呈两小丘相连而不是圆堆',null],
 ['oat_pheasant','麦斑野雉',1,1,3,'杂食','三至七只','羽上麦粒纹，收割时跟在镰刀后啄落穗',null],
 ['grey_field_pipit','灰冠田鹨',1,1,2,'虫食','五至十二只','灰冠上抖起一撮羽，短鸣总在飞起后响',null],
 ['bent_horn_goat','弯角野山羊',1,3,7,'草食','四至九只','角向内弯，沿田埂石坎走而避开深泥','hide'],
 ['reed_hare','苇背长兔',1,2,4,'草食','两至六只','背毛像干苇，洪水后在高田埂搭草窝','hide'],
 ['black_fin_perch','黑鳍河鲈',2,2,5,'肉食','三至十尾','黑色背鳍露出浅水，守住桥墩背水面的幼鱼群','fish'],
 ['whisker_catfish','须唇河鲶',2,3,6,'杂食','独游','长须贴泥搜寻，浑水中仍能找到旧渡口石缝','fish'],
 ['silver_crucian','薄鳞银鲫',2,1,3,'草食','八至二十尾','薄鳞泛银，在缓流里逐片啄食水草嫩边','fish'],
 ['stone_loach','石斑溪鳅',2,1,2,'杂食','四至十二尾','石点斑纹藏在砾底，夏季夜里移向浅水','fish'],
 ['grey_otter','灰颈河獭',2,2,5,'肉食','两至四只','灰颈毛在湿时更亮，固定在一块平石上拆鱼','hide'],
 ['round_marsh_beaver','圆额沼狸',2,1,4,'草食','三至六只','圆额和短尾，啃断水边细柳却不修横河大坝','hide'],
 ['short_bill_duck','短喙水鸭',2,1,2,'杂食','六至十五只','短喙翻拣浮叶下的籽粒，起飞先连拍水面三次',null],
 ['lead_heron','铅羽鹭',2,1,3,'肉食','独栖','铅灰长羽，单脚停在旧渡口最浅的一段岸',null],
 ['claw_stone_crab','钳脚石蟹',2,1,3,'杂食','散居','一钳宽一钳细，只横过阴面石缝寻找腐叶',null],
 ['red_water_shrimp','红足水虾',2,1,2,'杂食','群游','红足在清水显眼，遇到晃动阴影钻进柳根',null],
 ['orange_flower_bee','桔背花蜂',4,1,2,'花蜜','小群','桔背绒毛粘花粉，巢在蜂场外坡洞而非蜂箱',null],
 ['spade_dung_beetle','铲角蜣虫',3,1,2,'腐食','独居','扁角如小铲，把果园落果和粪团埋在树根外',null],
 ['copper_moth','铜纹蛾',3,1,2,'植物汁液','散栖','铜纹翅沿折线闪光，黄昏先聚在裂果再飞灯边',null],
 ['striped_bat','缟翼蝠',5,2,4,'虫食','十二至三十只','翼膜有两道浅缟，离塔缝时先绕一圈再散开',null],
 ['thorn_sprout','刺茎行芽',5,10,14,'土壤养分','两至五株','带刺的针叶幼树靠侧根慢移，把塔砖当暖石','resin'],
 ['mud_lamp_frog','泥灯腹蛙',2,10,12,'虫食','三至八只','腹下暖黄光只在鼓气时亮，雨声掩去其鸣叫',null],
 ['phosphor_moss_lizard','磷背苔蜥',5,12,17,'虫食','独居','背苔留冷光，脱下的老苔在一夜内熄灭',null],
 ['ember_throat_civet','火喉穴狸',5,14,19,'杂食','两只','喉囊储一点热气，喷出只够烘干穴口湿草','hide'],
 ['stone_coil_bug','石壳盘虫',5,10,15,'腐食','五至十二只','盘起时像有裂缝的圆石，爬动露出六对细足',null],
 ['resin_lump','树脂团妖',0,10,14,'腐木','独居','透光树脂中包着碎松针，拖行留黏丝而不吞石','resin'],
 ['vine_claw_beast','藤爪牵枝兽',5,16,22,'草食','独居','两条长藤爪能牵低枝，受惊把枝梢织成挡路网',null],
 ['mist_swallow_moth','吞雾泽蛾',2,18,24,'水汽与花蜜','两至六只','翅下白斑收凝露，晨雾散去后伏在湿苇背面',null],
 ['rust_scale_fish','锈鳞脊鱼',2,10,15,'杂食','四至八尾','锈色厚鳞抗砂流，泛红水痕来自鳞粉不是血','fish'],
 ['echo_cave_bat','回声穴蝠',5,12,18,'虫食','四至九只','把短声折回砖洞，能分开真墙和薄木遮板',null],
 ['broken_horn_rhino','碎角丘犀',5,20,27,'草食','独居','扁额旧角断成两棱，沿废塔的石阶磨擦厚皮','hide'],
 ['shadow_mane_jackal','影鬃林豺',0,18,23,'肉食','三至五只','鬃毛在背光时显出暗波，群体轮换守住撤路','hide'],
 ['leaf_face_spider','叶面跳蛛',3,11,16,'虫食','独居','脸盘像果叶脉纹，用短丝在枝间反弹换方向',null],
 ['iron_beak_bird','铁喙啄禽',5,13,18,'虫食','两至三只','黑硬喙敲虫道时响如敲钉，避开完好塔砖',null],
 ['root_wood_goblin','盘根木魈',5,20,28,'腐木','独居','身体是缠根的旧树节，拾碎枝堵住漏风塔孔',null],
 ['wax_eater_swarm','噬蜡蜂群',4,10,16,'蜂蜡与花蜜','群体','翅尖带白粉，从蜂箱裂口搬走小蜡屑而非蜜团',null],
 ['stone_whisker_weasel','石须穴鼬',5,15,22,'肉食','独居','须尖凝细砂，走动先用须探塔洞石屑厚薄','hide'],
 ['bubble_fin_badger','泡鳍水獾',2,17,24,'肉食','两至三只','侧腹软鳍积小泡，潜水时从阴岸突然换到亮岸','hide'],
 ['ice_scale_python','冰鳞溪蟒',2,18,25,'肉食','独居','贴水鳞片吸热使周围发凉，离水后鳞色渐暗','hide'],
 ['broken_thorn_bear','断棘榛熊',0,24,30,'杂食','独居','背棘多有折痕，撬开榛木朽根时留下成对深沟','hide'],
];
export function wildlifeFoundation(){
    const nocturnal=new Set(['bristle_boar','red_ear_fox','grey_ridge_wolf','burrow_badger','black_throat_marten','silver_hedgehog','leaf_hare','hook_toe_civet',
        'mottled_field_mouse','reed_hare','whisker_catfish','stone_loach','round_marsh_beaver','striped_bat','mud_lamp_frog','ember_throat_civet','echo_cave_bat',
        'shadow_mane_jackal','root_wood_goblin','stone_whisker_weasel','ice_scale_python']);
    const monsters=rows.map(([suffix,name,h,lo,hi,diet,grouping,distinction,material],i)=>{
        const template=i<30?1:2,food=diet==='草食'?['item_oats']:diet==='肉食'?['item_fish']:['item_ration'];
        const possible=!(diet==='植物汁液'||diet==='花蜜'||diet==='土壤养分'||diet==='腐木'||diet==='水汽与花蜜'||diet==='蜂蜡与花蜜');
        const drops=material?[{item:{hide:'item_rawhide',fish:'item_fish',resin:'item_resin'}[material],amount:1}]:[];
        return{id:`monster_${suffix}`,name,aliases:[],template,levelRange:[lo,hi],habitatTags:[habitats[h].name],grouping,diet,drops,intelligence:template===1?0:1,
            taming:{possible,conditions:possible?['有合适食物并建立持续信任','具备对应阶段驯兽能力']:['需要进一步的生态研究']},
            ...(possible?{tamingRule:{category:template===1?'support':'combat',minimumSkill:template===1?100:300,minimumPlayerLevel:lo,
                trustThreshold:template===1?30:60,minutes:60,difficulty:template===1?10:15,food:food.map(item=>({item,hungerRelief:35,trustGain:5})),skills:['辨认口令','跟随训练'],rideable:false,riderWeightKg:60,carryKg:1}}:{}),
            wildlife:{habitat:habitats[h].id,population:template===1?12:3,capacity:template===1?24:6,recoveryPerWeek:template===1?2:1,
                activeHours:nocturnal.has(suffix)?[1080,360]:[360,1080],predatorOf:[],distinction,
                gather:{minutes:20,tool:drops.length?'item_kitchen_knife':null,consumes:drops.length?[{item:'item_water',amount:1}]:[]}}};
    });
    const find=suffix=>monsters.find(m=>m.id===`monster_${suffix}`);
    for(const [predator,prey]of [['grey_ridge_wolf','leaf_hare'],['red_ear_fox','brush_squirrel'],['black_throat_marten','brush_squirrel'],
        ['shadow_mane_jackal','brown_deer'],['grey_otter','silver_crucian'],['bubble_fin_badger','black_fin_perch'],['ice_scale_python','round_marsh_beaver']])find(predator).wildlife.predatorOf=[find(prey).id];
    for(const [name,population,capacity,recoveryPerWeek]of [['grey_ridge_wolf',4,6,.05],['red_ear_fox',3,4,.1],['black_throat_marten',2,3,.05],
        ['shadow_mane_jackal',3,4,.05],['grey_otter',3,4,.1],['bubble_fin_badger',2,3,.05],['ice_scale_python',2,3,.05],
        ['brush_squirrel',40,70,4],['leaf_hare',30,60,3],['brown_deer',30,60,3],['silver_crucian',30,60,4],['black_fin_perch',30,60,3]])
        Object.assign(find(name).wildlife,{population,capacity,recoveryPerWeek});
    return{monsters,rules:{version:1,trackMinutes:60,maximumPresent:6,corpseMinutes:2880,seasonRecovery:[1,1.2,0.8,0.25],
        scarcityMaximum:2,habitats:structuredClone(habitats)}};
}
export function withWildlife(world,monsters){const candidate=structuredClone(world),bones=wildlifeFoundation();
    const habitats=new Map((candidate.rules.wildlife?.habitats??[]).map(h=>[h.id,h]));for(const habitat of bones.rules.habitats)habitats.set(habitat.id,habitat);
    candidate.rules.wildlife={...bones.rules,habitats:[...habitats.values()]};
    const updates=monsters??bones.monsters,catalog=new Map(candidate.monsters.map(row=>[row.id,row]));for(const row of updates){const kept=Object.fromEntries(['ecology','interactions','husbandry'].filter(k=>catalog.get(row.id)?.[k]!==undefined&&row[k]===undefined).map(k=>[k,catalog.get(row.id)[k]]));catalog.set(row.id,{...row,...kept});}candidate.monsters=[...catalog.values()];return candidate;}
