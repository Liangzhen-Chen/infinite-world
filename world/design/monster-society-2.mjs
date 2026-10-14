// T159 (S4): 榆根里与裂炉营；另为 T157 的炭阶地宫、苔灯坞补上地方组织与势力时钟。
// 正文由执行会话起草，DeepSeek 只做 L2 事实审核。本文件同时给出机制骨架（人数、
// 分物种配额、住区、作息、库存、资源来源、路线、立约、潜入与议题时钟）和待审正文；
// 发布入口把两者合成正式条目。待生成人口只登记配额，不写入名册。
import {ids as t157} from './monster-society-1.mjs';
export const revision='monster-society-2-v1';

const day=(rows)=>rows.map(([start,end,location,activity,services=[]])=>({start,end,location,activity,services}));
const schedule=rows=>{const d=day(rows);return{default:d,market:structuredClone(d),rest:structuredClone(d),restDays:[],seasonal:{}};};
const res=()=>[{kind:'协商',description:'须当事人另行确认的空闲时辰',availability:'unverified',grantsInventory:false}];
const goal=(id,content,steps,deadlineDay)=>({id,content,progress:0,deadlineDay,resources:res(),steps:steps.map(content=>({content,status:'pending'}))});
const goals=(prefix,[s,m,l])=>({short:[goal(`${prefix}_short`,s[0],s[1],30)],mid:[goal(`${prefix}_mid`,m[0],m[1],180)],long:[goal(`${prefix}_long`,l[0],l[1],720)]});

const YG='loc_ms_yugen',LL='loc_ms_lielu';
const yg={seat:YG,gate:'site_ms_yg_gate',nursery:'site_ms_yg_nursery',shed:'site_ms_yg_shed',ditch:'site_ms_yg_ditch',rootslope:'site_ms_yg_rootslope',
 crown:'site_ms_yg_crown',stone:'site_ms_yg_stone',sett:'site_ms_yg_sett',council:'site_ms_yg_council',store:'site_ms_yg_store',
 home1:'bld_ms_yg_home_01',home2:'bld_ms_yg_home_02',home3:'bld_ms_yg_home_03'};
const ll={seat:LL,gate:'site_ms_ll_gate',forge:'site_ms_ll_forge',shop:'site_ms_ll_shop',adit:'site_ms_ll_adit',yard:'site_ms_ll_yard',
 tents:'site_ms_ll_tents',huts:'site_ms_ll_huts',rocks:'site_ms_ll_rocks',council:'site_ms_ll_council',store:'site_ms_ll_store',
 home1:'bld_ms_ll_home_01',home2:'bld_ms_ll_home_02',home3:'bld_ms_ll_home_03'};
const P={jiecang:'npc_ms_yg_jiecang',jieyin:'npc_ms_yg_jieyin',gonghou:'npc_ms_yg_gonghou',xuxiao:'npc_ms_yg_xuxiao',jiecha:'npc_ms_yg_jiecha',jieqing:'npc_ms_yg_jieqing',
 jieya:'npc_ms_yg_jieya',xushi:'npc_ms_yg_xushi',xuhe:'npc_ms_yg_xuhe',xumo:'npc_ms_yg_xumo',gongni:'npc_ms_yg_gongni',gongtuan:'npc_ms_yg_gongtuan',
 yayue:'npc_ms_ll_yayue',yajin:'npc_ms_ll_yajin',cuozhen:'npc_ms_ll_cuozhen',cuomang:'npc_ms_ll_cuomang',yashi:'npc_ms_ll_yashi',yahang:'npc_ms_ll_yahang',
 yasun:'npc_ms_ll_yasun',cuoqian:'npc_ms_ll_cuoqian',cuohui:'npc_ms_ll_cuohui',cuosu:'npc_ms_ll_cuosu',panfu:'npc_ms_ll_panfu',panlei:'npc_ms_ll_panlei'};
export const ids={YG,LL,yg,ll,P};

const ELM='monster_knot_elm_sprite',WEASEL='monster_stone_whisker_weasel',BADGER='monster_burrow_badger';
const ORC='monster_split_tusk_orc',GOBLIN='monster_ash_cave_goblin',TROLL='monster_moss_back_troll';
const hierarchy=(id,name)=>[{id:'known-continent',name:'已知大陆片区'},{id:'known-region',name:'已知地区片区'},{id:'known-county',name:'已知郡级片区'},{id,name}];

export const settlements=[
 {id:YG,name:'榆根里',culture:'culture_ms_yugen',parent:'loc_bs_yupo',parentName:'榆坡村',locParent:'loc_bs',scope:'loc_bs_yupo',coordinates:[18.75,12.9],terrain:'丘陵',
  from:'loc_wild_yp_north',routeKm:2.5,routeRisk:1,expectedKm:5,populationSeed:'t159-yugen-population-1',purpose:'节榆木精与开了灵智的石须穴鼬、穴脚林獾混居的林下聚居地',
  population:64,householdCount:17,registeredHouseholdCount:3,pendingHouseholdCount:14,
  pendingAgeStructure:{children:13,youngAdults:14,adults:19,elders:6},
  speciesNames:{[ELM]:'节榆木精',[WEASEL]:'开了灵智的石须穴鼬',[BADGER]:'开了灵智的穴脚林獾'},
  pendingSpeciesStructure:{
   [ELM]:{population:25,households:6,ageStructure:{children:6,youngAdults:6,adults:9,elders:4},districts:[yg.crown]},
   [WEASEL]:{population:14,households:4,ageStructure:{children:4,youngAdults:4,adults:5,elders:1},districts:[yg.stone]},
   [BADGER]:{population:13,households:4,ageStructure:{children:3,youngAdults:4,adults:5,elders:1},districts:[yg.sett]}},
  society:{leader:'boss_ms_yugen',neighbors:{loc_bs_yupo:'中立'},stances:{player:'中立'},meetingPlace:yg.council,
   motions:[{id:'shared_allocation',name:'是否让地窟成员进议根洞，与树穴同议林产分配'},{id:'logging_line',name:'是否与榆坡划定伐界，容村民在界外伐木',opens:'trade'}],
   positions:[{id:'keep_grove',name:'护林派',members:[P.jiecang,P.jieyin,P.jiecha],claim:'林产由护林的木精按树分份，穴居者按出的力领份；先和榆坡把伐界说定。',stances:{shared_allocation:'reject',logging_line:'approve'},persuasion:20},
    {id:'shared_council',name:'共议派',members:[P.xuxiao,P.xushi,P.gongni,P.jieqing],claim:'排水运土的也该在议根洞里有一席，林产由树穴和地窟同议分配；伐界要等分配说定再谈。',stances:{shared_allocation:'approve',logging_line:'reject'},persuasion:15}],
   supplies:[{item:'item_hazelnut',species:ELM,place:yg.nursery,use:'木精护着的榛树结的榛仁，分给穴居者或拿到根门换东西'},
    {item:'item_walnut',species:ELM,place:yg.nursery,use:'老林核桃树落下的果仁，木精拣收后按份分'},
    {item:'item_dried_fruit',species:ELM,place:yg.nursery,use:'林下浆果晒成的干果'},
    {item:'item_herb',species:ELM,place:yg.nursery,use:'育苗地边的药草，木精照看'},
    {item:'item_wood',species:ELM,place:yg.rootslope,use:'木精只拣枯枝落木，修具棚做柄用'},
    {item:'item_tool_handle',species:WEASEL,place:yg.shed,use:'穴鼬在修具棚削出的铲柄和小工具柄'},
    {item:'item_ration',from:'loc_bs_yupo',place:yg.gate,use:'在根门用林产向榆坡人换来的干粮，给吃粮的穴居者'},
    {item:'item_fish',from:'loc_bs_yupo',place:yg.gate,use:'向榆坡人换来的鲜鱼，石须穴鼬最认的吃食'}]}},
 {id:LL,name:'裂炉营',culture:'culture_ms_lielu',parent:'loc_bs_liquan',parentName:'砾泉村',locParent:'loc_bs',scope:'loc_bs_liquan',coordinates:[36.2,15.35],terrain:'丘陵',
  from:'loc_wild_lq_adit',routeKm:3.6,routeRisk:1,expectedKm:6,populationSeed:'t159-lielu-population-1',purpose:'裂牙兽人、灰窟哥布林与苔背巨魔主从同营的矿道营地',
  population:104,householdCount:27,registeredHouseholdCount:3,pendingHouseholdCount:24,
  pendingAgeStructure:{children:21,youngAdults:28,adults:33,elders:10},
  speciesNames:{[ORC]:'裂牙兽人',[GOBLIN]:'灰窟哥布林',[TROLL]:'苔背巨魔'},
  pendingSpeciesStructure:{
   [ORC]:{population:67,households:16,ageStructure:{children:16,youngAdults:20,adults:24,elders:7},districts:[ll.tents]},
   [GOBLIN]:{population:19,households:5,ageStructure:{children:5,youngAdults:6,adults:6,elders:2},districts:[ll.huts]},
   [TROLL]:{population:6,households:3,ageStructure:{children:0,youngAdults:2,adults:3,elders:1},districts:[ll.rocks]}},
  society:{leader:'boss_ms_lielu',neighbors:{loc_bs_liquan:'戒备'},stances:{player:'戒备'},meetingPlace:ll.council,
   motions:[{id:'tribute_to_trade',name:'是否把砾泉的纳贡改为按件贸易',opens:'trade',closes:'tribute'},{id:'shared_first_fire',name:'是否让各族按轮次共点共炉首火'}],
   positions:[{id:'keep_tribute',name:'守贡派',members:[P.yayue,P.yajin,P.yashi,P.yahang],claim:'兽人掌营地的武力和分配，砾泉照旧纳粮换走矿道，工匠和搬运的按兽人分的份吃饭。',stances:{tribute_to_trade:'reject',shared_first_fire:'reject'},persuasion:20},
    {id:'craft_trade',name:'工匠派',members:[P.cuozhen,P.cuomang,P.cuoqian,P.cuohui],claim:'把纳贡改成按件贸易，修好的矿具和挖出的石料按件换粮，工匠按工分粮，不再由兽人一手分配。',stances:{tribute_to_trade:'approve',shared_first_fire:'approve'},persuasion:15}],
   supplies:[{item:'item_stone',species:ORC,place:ll.adit,use:'兽人在矿口挖出的石料，巨魔搬到卸石场'},
    {item:'item_iron',species:ORC,place:ll.adit,use:'兽人从旧矿道里挖出、在共炉边粗炼的铁料'},
    {item:'item_iron_nail',species:GOBLIN,place:ll.shop,use:'哥布林在修具棚敲出的小铁钉'},
    {item:'item_mining_pick',species:GOBLIN,place:ll.shop,use:'哥布林修好的旧矿镐'},
    {item:'item_charcoal',species:GOBLIN,place:ll.forge,use:'哥布林看着共炉烧出的木炭，木柴由巨魔从坡上背来'},
    {item:'item_ration',from:'loc_bs_liquan',place:ll.store,use:'砾泉村为走矿道送来的贡粮，存在贡粮棚由兽人分'}]}},
];

// Places. kind: seat | facility | district | home | council | store
export const places=[
 // ---- 榆根里
 {id:YG,kind:'seat',name:'榆根里',settlement:YG,prose:{
  description:'榆根里在榆坡北岗老林再往深处去的一片老榆林下，是节榆木精和开了灵智的石须穴鼬、穴脚林獾混住的聚居地。几棵老榆的根下掏着树穴，树穴底下连着穴居者挖的石窟和土窟，分成三处住区；林下有育苗地、修具棚、排水沟和归根坡。白天木精在林下慢慢挪动，入夜它们扎根不动，换穴鼬和林獾出窟干活。',
  authoredFacts:{climate:'林下背阴潮湿，雨后积水，排水沟一夜不通，育苗地就泡水',senses:['树干上一处处刻着节疤样的记号','石面上抹着几种颜色的湿土图','黄昏时敲树干的笃笃声和刨土声混在一起'],entryRule:'根门、育苗地、修具棚、排水沟、归根坡和三处住区的林地可以通行，各家树穴窟洞和议根洞须当面许可；进林先熄火'}}},
 {id:yg.gate,kind:'facility',name:'根门',settlement:YG,access:'public',prose:{
  description:'根门是进榆根里的入口，两棵老榆的根在地面上交错拱起，像一道低矮的门。白天林主节苍站在根门旁见来客，用榛仁、核桃和干果换榆坡人带来的盐、鱼和干粮。根门的树皮上刻着一排节疤记号，下面的石头抹着土染图，记着每回换了什么。',
  authoredFacts:{climate:'林缘透进些光，比林子深处干爽',senses:['交错的老根被踩得发亮','树皮上的节疤记号一排排往上刻','石头上的湿土图颜色深浅不一'],entryRule:'公共入口，白天在这里和木精交换，越过拱根往里走要先打招呼'}}},
 {id:yg.nursery,kind:'facility',name:'育苗地',settlement:YG,access:'public',prose:{
  description:'育苗地在老榆林中间一片向阳的空地上，一行行插着细榆条和榛苗，苗根旁埋着木精翻进去的腐叶。长老节荫白天守在这里，给伤了的苗糊湿泥。空地四周挖着排水沟，雨大时全靠穴居者连夜把水引走。在榆根里，伤了育苗根是最重的忌讳。',
  authoredFacts:{climate:'向阳，土松而湿，雨后容易积水',senses:['苗根旁的腐叶踩着发软','细榆条上挂着几片新叶','苗行间插着刻了节疤的小木签'],entryRule:'公共林地，可以沿苗行边走，苗根踩不得，苗边的林产不经木精点头不能拿'}}},
 {id:yg.shed,kind:'facility',name:'修具棚',settlement:YG,access:'public',prose:{
  description:'修具棚是排水沟边一座用枯枝和树皮搭的矮棚，棚里堆着铲头、筐子和木精拣来的枯枝。入夜后须晓在这里削铲柄、补土筐，修好的铲子给挖沟的林獾用，多出的小工具柄也拿到根门换东西。棚柱上刻着谁借走了哪把铲。',
  authoredFacts:{climate:'棚顶挡雨，棚里堆着木屑，干燥',senses:['刀削枯枝的沙沙声','木屑和湿泥的气味','棚柱上一道道借铲的刻痕'],entryRule:'公共工棚，可以在棚口看，铲和工具归修具棚，动手前要问须晓'}}},
 {id:yg.ditch,kind:'facility',name:'排水沟',formalName:'榆根排水沟',settlement:YG,access:'public',prose:{
  description:'排水沟是穴居者在林下挖的一圈沟渠，把育苗地和树穴根下的积水引到坡下。排水头拱厚每夜带林獾清沟运土，挖出的土堆在沟沿，干了再填回树根旁。沟线怎么走，要先和木精对过节疤记号，不能挖断育苗根。',
  authoredFacts:{climate:'沟里常年有水，夜里湿气重',senses:['沟底流水细细地响','沟沿的新土堆成一道矮埂','土里留着林獾宽爪刨过的印子'],entryRule:'公共沟渠，可以沿沟沿走，下沟清土要跟拱厚说一声'}}},
 {id:yg.rootslope,kind:'facility',name:'归根坡',settlement:YG,access:'public',prose:{
  description:'归根坡在榆根里西边的一道缓坡上，是送亡者归根的地方。木精亡故后，身躯埋回坡上老榆的根旁；穴鼬和林獾亡故后，埋在坡下各窟外的土里。每处都插一根新榆条，活下来的榆条就是记号。坡上的枯枝落木由木精拣起，拿去修具棚做柄。',
  authoredFacts:{climate:'缓坡朝西，傍晚有余光，夜里很静',senses:['一根根新榆条高矮不齐','坡上的落叶没人去扫','老榆根旁的土比别处松'],entryRule:'公共坡地，可以在坡边静立，拔走坡上的榆条是重忌'}}},
 {id:yg.crown,kind:'district',name:'老榆树穴',settlement:YG,access:'public',prose:{
  description:'老榆树穴是木精住的地方，在几棵最粗的老榆底下，根与根之间掏出一个个树穴。木精入夜扎根时就站在穴里，看上去和树桩没有两样。林主节苍、长老节荫、守林的节杈和育苗的节青都住在这里的节家树穴，小木精节芽也由他们带着。',
  authoredFacts:{climate:'树根挡风，穴里干爽',senses:['老榆根粗得像矮墙','穴口挂着刻了节疤的树皮片','夜里穴里站着一动不动的身影'],entryRule:'住区林地可以通行，各家树穴须住户当面许可'}}},
 {id:yg.stone,kind:'district',name:'鼬石窟',settlement:YG,access:'public',prose:{
  description:'鼬石窟在老榆树穴底下，是穴鼬沿着林下埋着的碎石层挖出来的一串窄窟，有一条斜道通到树穴根下。穴鼬白天蜷在石缝里睡，入夜才出窟。修具的须晓、巡夜的须石、搬土的须禾和小穴鼬须末住在这里的须家石窝。',
  authoredFacts:{climate:'石缝阴凉，比土窟干',senses:['窟壁的碎石被须尖蹭得发亮','斜道口抹着灰白色的土染','石缝里垫着枯草和兽毛'],entryRule:'住区窟道可以通行，各家石窝须住户当面许可'}}},
 {id:yg.sett,kind:'district',name:'獾土窟',settlement:YG,access:'public',prose:{
  description:'獾土窟在排水沟下游的一片坡地里，是林獾挖的一处主穴连着几个侧口，侧口外堆着推出来的新泥扇。排水头拱厚、挖沟的拱泥和小林獾拱团住在这里的拱家土窝。雨后侧口最忙，林獾要把灌进窟里的泥水推出去。',
  authoredFacts:{climate:'土窟潮湿，雨后侧口积泥',senses:['侧口外的泥扇推成半月形','窟里传出低哑的咕噜声','枯叶和干草垫在主穴深处'],entryRule:'住区窟道可以通行，各家土窝须住户当面许可'}}},
 {id:yg.home1,kind:'home',name:'节家树穴',settlement:YG,district:yg.crown,prose:{
  description:'节家树穴是老榆树穴里最大的一处，住着节苍、节荫、节杈、节青和小木精节芽。穴壁上挂着刻满节疤记号的树皮片，节芽扎根的地方垫着一圈软腐叶。门前可以招呼，进穴须成年住户许可。',
  authoredFacts:{climate:'干爽，树根间有风穿过',senses:['树皮片一层层挂在穴壁上','腐叶垫得软软的','老根上留着多年的节疤刻痕'],entryRule:'私宅，须成年住户当面许可'}}},
 {id:yg.home2,kind:'home',name:'须家石窝',settlement:YG,district:yg.stone,prose:{
  description:'须家石窝是鼬石窟里的一处窄窝，住着须晓、须石、须禾和小穴鼬须末。窝里垫着枯草和兽毛，角落放着须晓带回来的半截铲柄。门前可以招呼，进窝须成年住户许可。',
  authoredFacts:{climate:'阴凉，石缝透着一点风',senses:['枯草和兽毛垫得厚','角落里斜靠着半截铲柄','石壁上抹着几道灰白土色'],entryRule:'私宅，须成年住户当面许可'}}},
 {id:yg.home3,kind:'home',name:'拱家土窝',settlement:YG,district:yg.sett,prose:{
  description:'拱家土窝是獾土窟里的主穴，住着拱厚、拱泥和小林獾拱团。主穴深处垫着枯叶和干草，侧口边靠着两把挖沟的木铲。门前可以招呼，进窝须成年住户许可。',
  authoredFacts:{climate:'潮湿，雨后侧口要清泥',senses:['枯叶垫在主穴深处','侧口边靠着两把木铲','土墙上留着宽爪的刨痕'],entryRule:'私宅，须成年住户当面许可'}}},
 {id:yg.council,kind:'council',name:'议根洞',settlement:YG,authority:P.jieyin,prose:{
  description:'议根洞在最老的一棵榆树根下，是一个圆形的大树穴，洞壁上刻满了历代议过的事。每天黄昏木精扎根以前，林主节苍和长老节荫在这里议事，议林产怎么分，也议跟榆坡的伐界。这里历来只坐木精，穴居者只在根门外等消息。外人要进，须长老节荫当面许可。',
  authoredFacts:{climate:'洞里安静阴凉，黄昏时透进一点余光',senses:['洞壁刻满层层节疤记号','老根盘成一圈当座','洞口外听得见刨土声'],entryRule:'议事区，须长老节荫当面许可'}}},
 {id:yg.store,kind:'store',name:'林产窖',settlement:YG,facts:['分账树皮记着本季分给地窟的林产份数比上一季少刻了三道，刻痕是新削掉的','林产窖由林主节苍所有，拱厚每天天亮前把林獾运进窖的干果篓数刻上树皮，留给林主看'],prose:{
  description:'林产窖是老榆树穴旁挖进土坡的一个窖，存着木精收下的榛仁、核桃和干果，窖口挂着一块分账树皮，用节疤记号刻着每季分给树穴和地窟各多少份。本季地窟那一栏比上季少了三道刻痕。天亮前拱厚来这里把篓数刻上树皮。',
  authoredFacts:{climate:'窖里干燥阴凉',senses:['榛仁和核桃装在树皮篓里','窖口挂着刻满记号的分账树皮','地上落着几粒干果'],entryRule:'林产归林主，进入须节苍或拱厚许可；林产窖登记为可潜入之处'},
  clues:{bark:'窖口的分账树皮用节疤记号分成两栏，一栏记树穴，一栏记地窟；地窟那栏本季比上季少了三道刻痕，削口还是新的，木屑没干。',
   tally:'窖里的树皮篓按季码着，篓沿刻着数；本季的篓数和分账树皮上两栏相加对不上，多出来的三份榛仁仍在窖里，没有分出去。'}}},
 // ---- 裂炉营
 {id:LL,kind:'seat',name:'裂炉营',settlement:LL,prose:{
  description:'裂炉营在砾泉旧矿道口再往里走的一条矿道支路尽头，是裂牙兽人、灰窟哥布林和苔背巨魔同住的矿道营地。坡上搭着一片皮棚和石窝，中间是一口共炉；兽人掌着武力和分配，哥布林修矿具，巨魔搬石料。营口立着一块抹满炉灰的契板，营里的约定都画在上面。',
  authoredFacts:{climate:'坡上风硬，共炉边暖，石窝里阴冷',senses:['共炉的烟顺着坡往上飘','矿镐敲石头的声音从矿口传出来','炉灰契板上按满了大小不一的手印'],entryRule:'营口、共炉、修具棚、矿口、卸石场和三处住区可以通行，各家棚窝和议事棚须当面许可；矿口深处要先问兽人'}}},
 {id:ll.gate,kind:'facility',name:'营口',formalName:'裂炉营口',settlement:LL,access:'public',prose:{
  description:'营口是裂炉营的入口，立着一块用石板做的炉灰契板，营里与外面立的约都用指头蘸炉灰画在板上，各族按手印。砾泉人送贡粮时在这里交割，兽人照板上画的数收下。最近板上有一处手印被抹掉了，没人重画。',
  authoredFacts:{climate:'坡口风大，契板上的炉灰常被吹散一层',senses:['契板上的炉灰画痕一道压一道','板脚堆着几块垫粮袋的石头','被抹掉的手印留下一块灰白的空处'],entryRule:'公共入口，交割和立约在契板前进行，往里走要先报来意'}}},
 {id:ll.forge,kind:'facility',name:'共炉',settlement:LL,access:'public',prose:{
  description:'共炉是裂炉营正中一口石砌的大炉，各族的饭和铁都在这口炉上做。炉老牙烬日夜守着炉火，每天的首火由她点燃。营头牙钺白天在炉边见来人、收贡、派活。私占共炉首火是营里最重的忌讳，可首火向来只由兽人点，工匠们为此不服。',
  authoredFacts:{climate:'炉边烤得发烫，离炉几步就被坡风吹凉',senses:['炉膛里的炭火终日不灭','炉边架子上挂着一排旧工具','烤肉和铁锈的气味混在一起'],entryRule:'公共炉场，可以在炉边等候，首火和炉膛只归炉老照看'}}},
 {id:ll.shop,kind:'facility',name:'修具棚',settlement:LL,access:'public',prose:{
  description:'修具棚是共炉旁一座矮皮棚，哥布林夜里在这里修矿镐、敲铁钉。工匠头锉针坐在棚口，修好的矿镐交给兽人下矿，多出的铁钉和旧镐也在棚口换东西。棚里的工具挂得满满当当，锉芒常在这里和工匠们说改贡的事。',
  authoredFacts:{climate:'挨着共炉，棚里暖，夜里点小油灯',senses:['小锤敲铁的叮当声不停','棚壁上挂满补好的镐头','地上落着铁屑和炭渣'],entryRule:'公共工棚，可以在棚口看和换东西，工具归修具棚，动手前要问锉针'}}},
 {id:ll.adit,kind:'facility',name:'矿口',settlement:LL,access:'public',prose:{
  description:'矿口是裂炉营挖石取铁的坑道口，旧矿道被兽人重新打通，往里撑着新砍的木柱。白天营头牙钺带兽人下矿，夜里哥布林进去补撑木。挖出的石料和铁料堆在口外，等巨魔搬去卸石场。',
  authoredFacts:{climate:'坑道里阴冷，口外有风',senses:['坑道深处有滴水声','新撑木的树皮还没剥净','口外的碎石堆一层压一层'],entryRule:'公共矿口，可以在口外看，进坑道要先问兽人'}}},
 {id:ll.yard,kind:'facility',name:'卸石场',settlement:LL,access:'public',prose:{
  description:'卸石场在矿口下方一块平地上，巨魔夜里把矿口外的石料一趟趟背下来，码成石垛。送往砾泉换粮的石料也从这里装走。磐负和磐垒白天背靠石垛睡觉，背上的青苔把太阳挡得严严实实。',
  authoredFacts:{climate:'平地开阔，白天晒，夜里凉',senses:['石垛码得比人还高','地上留着水盆大的脚印','巨魔的呼噜声嗡嗡作响'],entryRule:'公共场地，可以在场边看，别在白天吵醒巨魔'}}},
 {id:ll.tents,kind:'district',name:'兽人棚区',settlement:LL,access:'public',prose:{
  description:'兽人棚区在共炉上坡一侧，一顶顶兽皮棚按队搭着，棚前插着矿镐和猎矛。营头牙钺、炉老牙烬、守营的牙石、挖矿的牙夯和小兽人牙笋住在这里的牙家皮棚。兽人的孩子留在棚区里，不跟队下矿。',
  authoredFacts:{climate:'坡上风大，皮棚里比外面暖',senses:['棚前插着成排的矿镐和猎矛','火塘边堆着啃过的骨头','皮棚被风吹得哗哗响'],entryRule:'住区可以通行，各家皮棚须住户当面许可'}}},
 {id:ll.huts,kind:'district',name:'工棚区',settlement:LL,access:'public',prose:{
  description:'工棚区在共炉下坡一侧，是哥布林搭的一排矮棚，挨得很紧。工匠头锉针、锉芒、锉钳、拾炭的锉灰和小哥布林锉粟住在这里的锉家矮棚。哥布林白天挤在棚里睡，黄昏才出来干活。',
  authoredFacts:{climate:'低洼，挨得紧，棚里闷',senses:['棚檐下挂着成串的铁钉','棚门口垫着炭渣','白天棚里只有鼾声'],entryRule:'住区可以通行，各家矮棚须住户当面许可'}}},
 {id:ll.rocks,kind:'district',name:'石窝',settlement:LL,access:'public',prose:{
  description:'石窝在卸石场后面的一片乱石里，是巨魔用大石块垒的窝，顶上盖着枯枝和苔藓。搬运的磐负和磐垒住在这里的磐家石窝。石窝离共炉最远，分粮时巨魔常排在最后。',
  authoredFacts:{climate:'乱石间阴冷，石缝漏风',senses:['大石块垒得歪歪斜斜','窝顶的苔藓湿漉漉的','地上散着啃剩的草根'],entryRule:'住区可以通行，各家石窝须住户当面许可'}}},
 {id:ll.home1,kind:'home',name:'牙家皮棚',settlement:LL,district:ll.tents,prose:{
  description:'牙家皮棚是兽人棚区里最大的一顶，住着牙钺、牙烬、牙石、牙夯和小兽人牙笋。棚里铺着兽皮，火塘边摆着几只磨亮的骨碗。门前可以招呼，进棚须成年住户许可。',
  authoredFacts:{climate:'火塘烘着，棚里暖',senses:['兽皮铺了好几层','火塘边摆着磨亮的骨碗','棚柱上挂着一张旧弓'],entryRule:'私宅，须成年住户当面许可'}}},
 {id:ll.home2,kind:'home',name:'锉家矮棚',settlement:LL,district:ll.huts,prose:{
  description:'锉家矮棚是工棚区里的一间矮棚，住着锉针、锉芒、锉钳、锉灰和小哥布林锉粟。棚里堆着没修完的镐头，锉粟的小草铺挨着门口。门前可以招呼，进棚须成年住户许可。',
  authoredFacts:{climate:'闷而暖，炭渣味重',senses:['墙角堆着没修完的镐头','门口的小草铺上放着一枚铁环','棚顶挂着一串铁钉'],entryRule:'私宅，须成年住户当面许可'}}},
 {id:ll.home3,kind:'home',name:'磐家石窝',settlement:LL,district:ll.rocks,prose:{
  description:'磐家石窝是石窝里最大的一处，用几块大石垒成，顶上盖着枯枝和苔藓，住着磐负和磐垒。窝里地上铺着枯草，角落堆着嚼过的树皮。门前可以招呼，进窝须成年住户许可。',
  authoredFacts:{climate:'阴冷，石缝漏风',senses:['地上铺着厚厚的枯草','角落堆着嚼过的树皮','石壁上长着一层薄苔'],entryRule:'私宅，须成年住户当面许可'}}},
 {id:ll.council,kind:'council',name:'议事棚',settlement:LL,authority:P.yayue,prose:{
  description:'议事棚是共炉后面一顶大皮棚，棚中间埋着一块平石，石上落满炉灰。每天傍晚兽人收工以后，营头牙钺、炉老牙烬在这里议事，工匠头锉针也来报工，议的是贡粮怎么分、首火由谁点。外人要进，须营头牙钺当面许可。',
  authoredFacts:{climate:'棚里闷，炉灰味重',senses:['平石上的炉灰画了又抹','棚壁挂着几块旧契板','棚外能听见共炉的火声'],entryRule:'议事区，须营头牙钺当面许可'}}},
 {id:ll.store,kind:'store',name:'贡粮棚',settlement:LL,facts:['炉灰账记着上一期砾泉送来二十四袋干粮，兽人份分了十六袋，工匠和搬运合分八袋','贡粮棚由营头牙钺所有，他每天中午来清点贡粮'],prose:{
  description:'贡粮棚是兽人棚区旁一顶加了石墙的皮棚，存着砾泉送来的贡粮。棚柱上用炉灰画着账，记着每一期收了多少、分给谁。营头牙钺每天中午来清点，别人要进得先问他。',
  authoredFacts:{climate:'石墙挡风，棚里干燥',senses:['粮袋码成一垛','棚柱上的炉灰账一道一道','地上落着粮袋漏出的碎屑'],entryRule:'贡粮归营头，进入须牙钺许可；贡粮棚登记为可潜入之处'},
  clues:{ledger:'棚柱上的炉灰账画着上一期砾泉送来的贡粮，兽人那份画了两大道，工匠和搬运合起来只画了一道；按道数算，兽人份是另一份的两倍。',
   print:'炉灰账底下按着几枚手印，兽人的手印都在，工匠头锉针的手印也在，可锉芒的那一枚被抹掉了，只剩一块灰白的空处。'}}},
];

// People. Full entries carry authored profile prose; roster entries are short.
const FULL={tier:'full'};
export const people=[
 // ===================== 榆根里 full
 {id:P.jiecang,settlement:YG,species:ELM,name:'节苍',age:96,sex:'男',occupation:'护林',role:'林主',...FULL,home:yg.home1,household:'house_ms_yg_01',workplace:yg.gate,
  facts:['节榆木精不吃东西，林产对木精自己没有用处，是拿来分给穴居者和换东西的','林主节苍与长老节荫属护林派，须晓属共议派，拱厚不属两派'],
  coins:0,inventory:{item_hazelnut:8,item_walnut:6,item_dried_fruit:4},services:['trade'],ttsVoice:'zh_male_low_01',
  schedule:[[0,300,yg.home1,'扎根睡眠'],[300,360,yg.nursery,'巡看育苗地'],[360,1080,yg.gate,'在根门见来客、换林产',['trade']],[1080,1140,yg.council,'议根洞黄昏议事'],[1140,1440,yg.home1,'扎根睡眠']],
  prose:{traits:['慢性子','护短'],visibleFeature:'右肩的节疤裂过一道，用湿泥糊着，泥干了就再糊。',
   appearance:['右肩的节疤裂过一道，用湿泥糊着，泥干了就再糊。','头顶的细榆条比别的木精多出三枝','脚下的须根比旁人长，走过的土坑也深'],
   currentConcern:'分账树皮上地窟那一栏少刻了三道，须晓要进议根洞理论，他想先把伐界和榆坡说定，再说分份的事。',
   voice:{register:'说话极慢，一句话中间要停好几回',accent:'像风过枝条的沙沙声里夹着字',habits:['开口前先用指节在树干上敲两下'],samples:['拿枯的，不砍活的。','树的事，树先说。','分份刻在树皮上，刻了就算。']},
   personality:{values:['老林和新苗比什么都要紧','话说出口就刻上树皮'],flaws:['认定木精护林在先，听不进穴居者的委屈']},
   familyNotes:'节苍与节荫、节杈、节青同住节家树穴，小木精节芽也由他们带着；他每天天亮前先看一眼节芽扎根的地方有没有积水。',
   relationships:[
    {with:P.jieyin,type:'同穴议事',trust:35,affection:12,note:'节荫比他早长成，他当上林主那年是她在议根洞头一个刻下同意的记号；如今两人都主张林产由木精按树分份。'},
    {with:P.gonghou,type:'林主与排水头',trust:20,affection:6,note:'拱厚每夜带林獾清沟，天亮前把运进林产窖的篓数刻上树皮；节苍信他刻的数，却没答应让他进议根洞。'},
    {with:P.xuxiao,type:'林主与异议者',trust:-8,affection:4,note:'须晓在根门当着来换东西的人说分份不公，要进议根洞理论；他当时只说“树先说”，没有让她进。'},
    {with:P.jieya,type:'同穴照看',trust:10,affection:18,note:'小木精节芽跟着他学认苗，他每天教她分辨哪根是榆苗、哪根是杂草。'}],
   memorySeeds:[
    {id:'memory_t159_yg_cut',event:'上个月分林产那天黄昏，节苍、节荫、拱厚、须晓在根门对着分账树皮清点，地窟那一栏比上一季少刻了三道；须晓当场要进议根洞理论，节荫没有让她进。',location:yg.gate,salience:5,knownBy:[P.jiecang,P.jieyin,P.gonghou,P.xuxiao],reliability:'亲历'},
    {id:'memory_t159_yg_jiecang_flood',event:'很多年前的一场大雨冲垮了育苗地，他守着泡烂的苗站了一夜，第二天才有林獾来挖第一条沟。',location:yg.nursery,salience:4,knownBy:[P.jiecang],reliability:'个人回忆'}],
   goals:[['先和榆坡把伐界说定',['请来根门换东西的榆坡人给村里带话','把北岗老林里该留的老树刻上节疤记号']],
    ['让分账树皮上的数重新对得上',['请节荫把本季分份逐行念一遍','亲自到林产窖看篓沿的刻数']],
    ['让育苗地十年后长成新的一片榆林',['每季多栽一行榆苗','请拱厚把排水沟再往坡下引一段']]],
   fears:['怕榆坡人越过老林砍到育苗地边上'],redLines:['活树和新苗谁也不能砍','林产不拿去换伤林的东西'],
   secrets:[{content:'分账树皮上那三道是他让节杈削掉的，那三份榛仁留在窖里，他想拿去和榆坡换伐界的承诺。',knownBy:[P.jiecang,P.jiecha]}],
   knowledge:{known:[{fact:'分账树皮上地窟那一栏本季比上季少了三道刻痕。',source:yg.store,reliability:'亲眼看过'},
     {fact:'拱厚每夜带林獾清沟，天亮前把运进林产窖的篓数刻上树皮。',source:P.gonghou,reliability:'每天读他刻下的篓数'},
     {fact:'榆坡人来根门换东西，多是用盐、鱼和干粮换榛仁和干果。',source:yg.gate,reliability:'多年往来'}],
    unknown:['榆坡哪一位肯出面和榆根里说伐界？','须晓是否会在黄昏议事时闯进议根洞？']},
   opinions:{factions:'榆坡人里有拣枯枝的，也有想砍活树的，要分开看。',magic:'带火的法术在林外就熄掉。',adventurers:'外来人肯替榆根里去榆坡传伐界的话，他愿意多给一篓榛仁。',
    neighbors:[{with:P.xuxiao,view:'手巧，嘴太快。'},{with:P.jieyin,view:'议根洞里最稳的一个。'}]},
   towardPlayer:{baseline:{trust:0,affection:0},raises:['进林前熄火','只拣枯枝不碰活树'],lowers:['踩进育苗地','在林里点火'],attitude:'中立，愿意在根门谈换林产和伐界的事。'},
   behaviorRules:{bargaining:'用手头的榛仁、核桃和干果换东西，换完就停，不收钱。',honesty:'刻在树皮上的照实说，没刻的说“没刻”。',risk:'不离开榆根里去榆坡。',threatResponse:'用枝条敲树干叫守林的节杈，自己挡在育苗地前。',bribeResponse:'收下的东西当众刻进分账树皮，不因此替人改份数。'},
   serviceWhat:'本人手头的榛仁、核桃与干果',hooks:['分账树皮少了三道','和榆坡划伐界'],
   notes:'榆根里林主，护林派；白天在根门见客换林产，想先和榆坡说定伐界，不愿让穴居者进议根洞。',
   description:'节苍是榆根里的林主，九十六岁的节榆木精，右肩节疤裂过一道，常年用湿泥糊着。白天他在根门见客，用榛仁、核桃和干果换榆坡人带来的盐、鱼和干粮。分账树皮上地窟那一栏少了三道，须晓要进议根洞理论，他想先和榆坡说定伐界，再谈分份。他说话极慢，认定木精护林在先。',
   portraitPrompt:'原创节榆木精林主，半人高的老榆树干身形，肩背满是节疤，右肩裂口糊着湿泥，头顶几枝细榆条，脚下长须根，站在两棵老榆交错的拱根下'}},
 {id:P.jieyin,settlement:YG,species:ELM,name:'节荫',age:131,sex:'女',occupation:'照看育苗根',role:'长老',...FULL,home:yg.home1,household:'house_ms_yg_01',workplace:yg.nursery,
  facts:['议根洞历来只坐木精，穴居者只在根门外等消息','节荫是议根洞的负责人，外人进议根洞须她当面许可'],
  coins:0,inventory:{item_herb:3},services:[],ttsVoice:'zh_female_mature_01',
  schedule:[[0,300,yg.home1,'扎根睡眠'],[300,1080,yg.nursery,'照看育苗根、糊湿泥'],[1080,1140,yg.council,'议根洞黄昏议事'],[1140,1440,yg.home1,'扎根睡眠']],
  prose:{traits:['守旧','细致'],visibleFeature:'身上的节疤一圈压一圈，数不清有多少圈。',
   appearance:['身上的节疤一圈压一圈，数不清有多少圈。','须根上总沾着育苗地的湿泥','头顶的榆条已经不发新叶，只剩几片老叶'],
   currentConcern:'育苗地东头那一行榆苗根旁积了水，她怕排水沟再不往那边挖，苗根就要烂了。',
   voice:{register:'声音低而干，像老树皮摩擦',accent:'说到树的事会把字拖得很长',habits:['说到规矩时用枝条点一下地'],samples:['苗根伤了，一季都补不回来。','议根洞里的话，要刻上去才算。','新的那几个，先学认根。']},
   personality:{values:['育苗根比谁的面子都大','议根洞的规矩是老榆传下来的'],flaws:['看不起穴居者翻土的本事，常说他们只会刨']},
   familyNotes:'节荫与节苍、节杈、节青同住节家树穴，节芽扎根的地方是她亲手垫的腐叶。',
   relationships:[
    {with:P.jiecang,type:'同穴议事',trust:35,affection:12,note:'节苍当上林主那年，她在议根洞头一个刻下同意的记号；她觉得他太看重伐界，忘了育苗地东头的积水。'},
    {with:P.xuxiao,type:'长老与异议者',trust:-10,affection:2,note:'上个月在根门清点以后，须晓追到议根洞口要进去，是她用枝条拦住的；她说议根洞历来只坐木精。'},
    {with:P.gonghou,type:'看苗与挖沟',trust:15,affection:5,note:'她每季把哪里积水告诉拱厚，拱厚照她指的地方挖沟；两人为沟线离苗根多远争过好几回。'},
    {with:P.jieya,type:'同穴照看',trust:12,affection:20,note:'小木精节芽扎根的那圈腐叶是她垫的，她教节芽怎样给伤苗糊湿泥。'}],
   memorySeeds:[
    {id:'memory_t159_yg_cut',event:'上个月分林产那天黄昏，节苍、节荫、拱厚、须晓在根门对着分账树皮清点，地窟那一栏比上一季少刻了三道；须晓当场要进议根洞理论，节荫没有让她进。',location:yg.gate,salience:5,knownBy:[P.jiecang,P.jieyin,P.gonghou,P.xuxiao],reliability:'亲历'},
    {id:'memory_t159_yg_jieyin_badger',event:'早年第一批开了灵智的林獾来到榆根里，她看着它们在育苗地边刨坏了半行苗，后来才答应让它们挖沟。',location:yg.nursery,salience:3,knownBy:[P.jieyin],reliability:'个人回忆'}],
   goals:[['赶在下一场雨前把育苗地东头的积水排掉',['请拱厚把沟往东头引','给积水那一行苗根糊上新泥']],
    ['守住议根洞只坐木精的老规矩',['黄昏议事时先说老榆传下的规矩','请节苍别在伐界的事上松口']],
    ['把育苗根的认法教给每个小木精',['每天带节芽认一遍苗','让节青轮着陪小木精练']]],
   fears:['怕穴居者进了议根洞，往后沟线都从苗根底下过'],redLines:['伤了育苗根的要赔一季劳力','议根洞里的刻痕谁也不能削'],
   secrets:[{content:'她心里清楚这一季地窟的林獾清沟比往年都卖力，分份少刻三道说不过去，只是不肯当众认。',knownBy:[P.jieyin]}],
   knowledge:{known:[{fact:'育苗地东头那一行榆苗根旁积了水。',source:yg.nursery,reliability:'每天亲手照看'},
     {fact:'拱厚的林獾照她指的地方挖沟，沟线要先对过节疤记号。',source:P.gonghou,reliability:'每季当面说定'},
     {fact:'议根洞历来只坐木精，穴居者只在根门外等消息。',source:yg.council,reliability:'老榆传下的规矩'}],
    unknown:['林产窖分账树皮上那三道是谁削掉的？','排水沟要多少夜才能引到育苗地东头？']},
   opinions:{factions:'榆坡人只认得树，不认得苗。',magic:'能让苗长快的法术她不信，苗要一年一年长。',adventurers:'外来人进林先学认苗，别一脚踩下去。',
    neighbors:[{with:P.jiecang,view:'稳当，只是太惦着伐界。'},{with:P.xuxiao,view:'手巧，可不懂老林的规矩。'}]},
   towardPlayer:{baseline:{trust:-5,affection:0},raises:['沿苗行边走','帮着给伤苗糊泥'],lowers:['踩伤苗根','打听议根洞里的事'],attitude:'冷淡，先看来人认不认得苗。'},
   behaviorRules:{bargaining:'她不管换东西，只管苗。',honesty:'苗的事照实说，议根洞里的事只说已刻上的。',risk:'苗在，她就不离开育苗地。',threatResponse:'用枝条敲树干叫人，自己挡在苗行前。',bribeResponse:'给育苗地的东西收下，给她本人的退回去。'},
   serviceWhat:null,hooks:['育苗地东头积水','议根洞只坐木精的规矩'],
   notes:'榆根里长老，掌议根洞许可，护林派；白天照看育苗根，主张议根洞只坐木精。',
   description:'节荫是榆根里的长老，一百三十一岁的节榆木精，身上的节疤一圈压一圈。她白天守在育苗地给伤苗糊湿泥，黄昏在议根洞议事，外人进议根洞须她点头。上个月须晓要进议根洞理论，是她拦在洞口。她担心育苗地东头积水，也守着议根洞只坐木精的老规矩。',
   portraitPrompt:'原创年老节榆木精长老，矮而粗的老榆树干身形，节疤层层叠叠，头顶榆条只剩几片老叶，须根沾满湿泥，站在一行细榆苗旁'}},
 {id:P.gonghou,settlement:YG,species:BADGER,name:'拱厚',age:48,sex:'男',occupation:'排水运土',role:'排水头',...FULL,home:yg.home3,household:'house_ms_yg_03',workplace:yg.ditch,
  facts:['拱厚不属护林派也不属共议派','林獾挖沟的沟线要先和木精对过节疤记号'],
  coins:0,inventory:{item_ration:2},services:[],ttsVoice:'zh_male_steady_01',
  schedule:[[0,270,yg.ditch,'带林獾清沟运土'],[270,330,yg.store,'把运进林产窖的干果篓数刻上树皮'],[330,1080,yg.home3,'睡眠'],[1080,1140,yg.shed,'在修具棚领铲、修铲'],[1140,1440,yg.ditch,'带林獾清沟运土']],
  prose:{traits:['踏实','少言'],visibleFeature:'前爪第三趾的爪缘磨得发圆，掌垫上总沾着红褐色的土。',
   appearance:['前爪第三趾的爪缘磨得发圆，掌垫上总沾着红褐色的土。','肩背的毛被沟沿的泥糊成一绺一绺','鼻头上有一道被铲刃蹭破的旧疤'],
   currentConcern:'长老节荫要他把沟引到育苗地东头，可挖沟的林獾觉得分份少了，干活不如往常卖力。',
   voice:{register:'话少，一次只说一两句',accent:'鼻息短促，说话间夹着低低的咕噜',habits:['说话前先用前爪刨两下地'],samples:['沟通了，苗就不泡。','少了三道，林獾都看见了。','我挖沟，不进洞。']},
   personality:{values:['沟不能断','说好的份数就该给'],flaws:['有委屈不说，闷着干活']},
   familyNotes:'拱厚与拱泥、小林獾拱团同住拱家土窝；拱团还小，他不让她下沟，只让她在侧口边看。',
   relationships:[
    {with:P.jieyin,type:'挖沟与看苗',trust:15,affection:5,note:'节荫每季告诉他哪里积水，他照她指的地方挖沟；两人为沟线离苗根多远争过好几回。'},
    {with:P.jiecang,type:'排水头与林主',trust:20,affection:6,note:'他天亮前把运进林产窖的篓数刻上树皮留给节苍看，每回都刻得清清楚楚；节苍信他的数，却没答应让他进议根洞。'},
    {with:P.xuxiao,type:'地窟同伴',trust:18,affection:10,note:'须晓修好的铲子都先给他的林獾用；她拉他一起去议根洞理论，他说要先把沟挖完再说。'},
    {with:P.gongtuan,type:'同窝照看',trust:10,affection:20,note:'小林獾拱团总想跟着下沟，他每回都把她推回侧口，教她认哪块土松。'}],
   memorySeeds:[
    {id:'memory_t159_yg_cut',event:'上个月分林产那天黄昏，节苍、节荫、拱厚、须晓在根门对着分账树皮清点，地窟那一栏比上一季少刻了三道；须晓当场要进议根洞理论，节荫没有让她进。',location:yg.gate,salience:5,knownBy:[P.jiecang,P.jieyin,P.gonghou,P.xuxiao],reliability:'亲历'},
    {id:'memory_t159_yg_gonghou_first',event:'他刚开灵智那年跟着几只林獾来到榆根里，头一夜就在育苗地边刨坏了半行苗，是挖了一整季沟才被准许留下。',location:yg.nursery,salience:4,knownBy:[P.gonghou],reliability:'个人回忆'}],
   goals:[['赶在下一场雨前把沟引到育苗地东头',['先清干净下游那段淤泥','请须晓多修两把铲']],
    ['让林獾这一季的分份照数给足',['天亮前把运进窖的篓数刻清','请节苍把分账树皮重刻一遍']],
    ['让地窟成员不用再在根门外等消息',['把沟挖得没人能挑错','等议根洞松口再去说']]],
   fears:['怕林獾心里不服，哪一夜沟没清，育苗地就泡了水'],redLines:['不挖断育苗根','说好的份数不能少'],
   secrets:[{content:'他天亮前刻篓数时就看出篓数和分账树皮对不上，多出的三份榛仁还在窖里，可他没跟须晓说。',knownBy:[P.gonghou]}],
   knowledge:{known:[{fact:'育苗地东头那一行榆苗根旁积了水，节荫要他把沟引过去。',source:P.jieyin,reliability:'当面吩咐'},
     {fact:'林产窖的篓数和分账树皮两栏相加对不上，多出三份榛仁。',source:yg.store,reliability:'天亮前刻数时亲眼点过'},
     {fact:'须晓修好的铲子先给挖沟的林獾用。',source:P.xuxiao,reliability:'每夜亲手领铲'}],
    unknown:['多出来的三份榛仁节苍打算拿去换什么、换给谁？','议根洞是否会让地窟成员进去议事？']},
   opinions:{factions:'榆坡人来砍树，雨水就往窟里灌。',magic:'能让土变干的法术他想见识一回。',adventurers:'外来人肯下沟清一夜淤泥，他愿意分一口干粮。',
    neighbors:[{with:P.xuxiao,view:'敢说话，比我强。'},{with:P.jieyin,view:'认苗没人比得上，就是不肯让一步。'}]},
   towardPlayer:{baseline:{trust:0,affection:0},raises:['帮着清一夜沟','绕开育苗地走'],lowers:['踩塌沟沿','在侧口边吵闹'],attitude:'中立，夜里在沟边可以搭话，白天在窝里睡。'},
   behaviorRules:{bargaining:'他手里只有一点干粮，不拿去换。',honesty:'篓数照实说，别人的事不多说。',risk:'不离开排水沟太远。',threatResponse:'低头拱背，咕噜一声叫拱泥，护着侧口。',bribeResponse:'不收，说“我挖沟”。'},
   serviceWhat:null,hooks:['把沟引到育苗地东头','林产窖多出的三份榛仁'],
   notes:'榆根里排水头，开了灵智的穴脚林獾，夜里带林獾清沟运土；不属两派，想把沟挖完再谈议事。',
   description:'拱厚是榆根里的排水头，四十八岁，开了灵智的穴脚林獾，前爪第三趾磨得发圆。他每夜带林獾清沟运土，天亮前把运进林产窖的篓数刻上树皮。节荫要他把沟引到育苗地东头，可林獾觉得分份少了，干活不如往常卖力。他话少，有委屈闷着，不属护林派也不属共议派。',
   portraitPrompt:'原创开了灵智的穴脚林獾排水头，前爪粗短，掌垫沾红褐土，肩背毛糊着泥，鼻头一道旧疤，蹲在林下排水沟沿上'}},
 {id:P.xuxiao,settlement:YG,species:WEASEL,name:'须晓',age:29,sex:'女',occupation:'修具',role:'持不同主张者',...FULL,home:yg.home2,household:'house_ms_yg_02',workplace:yg.shed,
  facts:['须晓属共议派，主张让地窟成员进议根洞','须晓修的小工具柄用的是木精拣来的枯枝'],
  coins:4,inventory:{item_tool_handle:6,item_wood:2},services:['trade'],ttsVoice:'zh_female_bright_01',
  schedule:[[0,300,yg.shed,'削铲柄、补土筐',['trade']],[300,1080,yg.home2,'睡眠'],[1080,1140,yg.gate,'在根门外等议事的消息'],[1140,1440,yg.shed,'削铲柄、补土筐',['trade']]],
  prose:{traits:['机敏','好强'],visibleFeature:'须尖凝着一层细砂，说话激动时须子一抖一抖。',
   appearance:['须尖凝着一层细砂，说话激动时须子一抖一抖。','前爪的毛被刀柄磨秃了一块','颈侧的浅色斑比别的穴鼬大'],
   currentConcern:'地窟那一份少刻了三道，她想进议根洞当面问清，可议根洞只坐木精，她只能在根门外等。',
   voice:{register:'说话快，一句接一句',accent:'句尾常带一声短促的“嗤”',habits:['说到要紧处用须尖蹭一下石头'],samples:['少了三道，谁削的？','我们清沟运土，凭什么只在门外等？','铲柄修好了，拿去用。']},
   personality:{values:['出了力就该有份','有话要当面说'],flaws:['话说得太冲，常把能谈的事谈僵']},
   familyNotes:'须晓与须石、须禾、小穴鼬须末同住须家石窝；须末夜里常跑到修具棚看她削柄，她让他只递木屑。',
   relationships:[
    {with:P.jiecang,type:'异议者与林主',trust:-8,affection:4,note:'她在根门当着来换东西的人说分份不公，要进议根洞理论；节苍只说“树先说”，没有让她进。'},
    {with:P.jieyin,type:'异议者与长老',trust:-10,affection:2,note:'上个月是节荫用枝条拦在议根洞口没让她进；她记着这件事，见了节荫总不打招呼。'},
    {with:P.gonghou,type:'地窟同伴',trust:18,affection:10,note:'她修好的铲子都先给拱厚的林獾用；她拉他一起去议根洞理论，他说要先把沟挖完。'},
    {with:P.jieqing,type:'共议派同伴',trust:15,affection:8,note:'育苗的节青是唯一站在共议派这边的木精，常在黄昏替她带出议根洞里的消息。'}],
   memorySeeds:[
    {id:'memory_t159_yg_cut',event:'上个月分林产那天黄昏，节苍、节荫、拱厚、须晓在根门对着分账树皮清点，地窟那一栏比上一季少刻了三道；须晓当场要进议根洞理论，节荫没有让她进。',location:yg.gate,salience:5,knownBy:[P.jiecang,P.jieyin,P.gonghou,P.xuxiao],reliability:'亲历'},
    {id:'memory_t159_yg_xuxiao_wake',event:'她开灵智以后离开塔基的石缝，在林边转了一个冬天，是一只老林獾把她领到榆根里的地窟。',location:yg.stone,salience:3,knownBy:[P.xuxiao],reliability:'个人回忆'}],
   goals:[['弄清分账树皮上那三道是谁削掉的',['找机会看林产窖里的篓数','问节青议根洞里有没有说起']],
    ['让地窟成员在议根洞里有一席',['拉拱厚和共议派一起去议根洞外等','请来根门的外人替地窟说句话']],
    ['让修具棚修的工具也算进林产分份',['把每夜修好的铲子刻在棚柱上','攒够数再去议根洞讲']]],
   fears:['怕自己说得太冲，连拱厚也不肯站出来'],redLines:['不偷林产窖的东西','修好的铲子不扣给挖沟的林獾'],
   secrets:[{content:'她曾在收工回窝前趴在林产窖外，听见拱厚一边刻篓数一边嘀咕数目不对，只是还没进窖看过。',knownBy:[P.xuxiao]}],
   knowledge:{known:[{fact:'分账树皮上地窟那一栏本季比上季少刻了三道。',source:yg.store,reliability:'在根门清点时亲眼看过'},
     {fact:'议根洞历来只坐木精，穴居者只在根门外等消息。',source:yg.council,reliability:'被拦在洞口过'},
     {fact:'节青常在黄昏替她带出议根洞里的消息。',source:P.jieqing,reliability:'多次当面听说'}],
    unknown:['林产窖分账树皮上那三道是谁削掉的？','节荫愿不愿让地窟成员进议根洞？']},
   opinions:{factions:'榆坡人换东西还算公道，比议根洞讲理。',magic:'会术的外来人她想见识见识，只要别在林里点火。',adventurers:'外来人要是肯替地窟在议根洞说句话，她愿意多修一把铲送他。',
    neighbors:[{with:P.gonghou,view:'肯干，就是不肯开口。'},{with:P.jiecang,view:'慢得像树，偏心也像树。'}]},
   towardPlayer:{baseline:{trust:0,affection:0},raises:['替地窟说话','在修具棚换她修的柄'],lowers:['替议根洞来劝她闭嘴','白天吵醒石窝'],attitude:'中立偏热络，夜里在修具棚愿意多说几句。'},
   behaviorRules:{bargaining:'用修好的小工具柄换东西，按她手头的数，不赊。',honesty:'她知道的直说，猜的会说明是猜的。',risk:'敢在根门顶撞林主，不敢闯议根洞。',threatResponse:'贴地缩身，嗤嗤两声叫须石。',bribeResponse:'收下也照样说分份不公。'},
   serviceWhat:'本人修好的小工具柄',hooks:['分账树皮少了三道','地窟成员争议事权'],
   notes:'榆根里修具的穴鼬，开了灵智，共议派带头人；夜里在修具棚削铲柄，要进议根洞争林产分份。',
   description:'须晓是榆根里的修具匠，二十九岁，开了灵智的石须穴鼬，须尖凝着细砂。她夜里在修具棚削铲柄、补土筐，修好的铲子先给挖沟的林獾。地窟那一份少刻了三道，她要进议根洞当面问清，却被拦在洞口。她说话快，好强，是共议派的带头人。',
   portraitPrompt:'原创开了灵智的石须穴鼬修具匠，细长灰褐身形，须尖凝细砂，前爪握一截削了一半的铲柄，蹲在枯枝搭的矮棚口'}},
 // ===================== 榆根里 roster
 {id:P.jiecha,settlement:YG,species:ELM,name:'节杈',age:34,sex:'男',occupation:'守林',home:yg.home1,household:'house_ms_yg_01',
  prose:{traits:['听话','警觉'],currentConcern:'他照节苍的话削掉了分账树皮上的三道，夜里扎根时总觉得不踏实。',visibleFeature:'左臂的枝条断过一截，新抽的嫩条比别处细。'}},
 {id:P.jieqing,settlement:YG,species:ELM,name:'节青',age:23,sex:'女',occupation:'育苗',home:yg.home1,household:'house_ms_yg_01',
  prose:{traits:['温和','有主见'],currentConcern:'她觉得地窟清沟出了大力，分份该多给，可在议根洞里不敢顶撞节荫。',visibleFeature:'头顶的榆条上总挂着几片嫩绿的新叶。'}},
 {id:P.jieya,settlement:YG,species:ELM,name:'节芽',age:9,sex:'女',occupation:'随育苗地学认苗',home:yg.home1,household:'house_ms_yg_01',
  prose:{traits:['好奇','爱学样'],currentConcern:'想早点学会认苗，好跟节荫一起给伤苗糊泥。',visibleFeature:'个子才到大人膝盖，须根细得像一把草。'}},
 {id:P.xushi,settlement:YG,species:WEASEL,name:'须石',age:41,sex:'男',occupation:'巡夜',home:yg.home2,household:'house_ms_yg_02',
  prose:{traits:['沉默','护家'],currentConcern:'他夜里巡林时看见榆坡那边有人在老林边上做记号，想告诉须晓又怕惹事。',visibleFeature:'尾尖秃了一块，是早年被石块砸的。'}},
 {id:P.xuhe,settlement:YG,species:WEASEL,name:'须禾',age:57,sex:'女',occupation:'搬土',home:yg.home2,household:'house_ms_yg_02',
  prose:{traits:['唠叨','能吃苦'],currentConcern:'分到的干粮少了，她把自己那份省给须末，夜里搬土时腿发软。',visibleFeature:'须子灰白，一走动就掉砂。'}},
 {id:P.xumo,settlement:YG,species:WEASEL,name:'须末',age:12,sex:'男',occupation:'随修具棚递木屑',home:yg.home2,household:'house_ms_yg_02',
  prose:{traits:['机灵','好动'],currentConcern:'想学须晓削铲柄，可她只让他递木屑。',visibleFeature:'须尖还没凝砂，软软地翘着。'}},
 {id:P.gongni,settlement:YG,species:BADGER,name:'拱泥',age:36,sex:'女',occupation:'挖沟',home:yg.home3,household:'house_ms_yg_03',
  prose:{traits:['直爽','爱抱怨'],currentConcern:'分份少了三道，她在沟边跟别的林獾说这一季干脆少挖几夜。',visibleFeature:'肩背上总抖落着细土粒。'}},
 {id:P.gongtuan,settlement:YG,species:BADGER,name:'拱团',age:6,sex:'女',occupation:'随家人在侧口学认土',home:yg.home3,household:'house_ms_yg_03',
  prose:{traits:['贪玩','胆大'],currentConcern:'想跟拱厚下沟，可每回都被推回侧口。',visibleFeature:'圆滚滚的，前爪上的泥总是干了又湿。'}},
 // ===================== 裂炉营 full
 {id:P.yayue,settlement:LL,species:ORC,name:'牙钺',age:46,sex:'男',occupation:'带队挖矿',role:'营头',...FULL,home:ll.home1,household:'house_ms_ll_01',workplace:ll.forge,
  facts:['牙钺与牙烬属守贡派，锉针与锉芒属工匠派，巨魔不属两派','砾泉村为走矿道向裂炉营纳粮，交割画在营口的炉灰契板上'],
  coins:40,inventory:{item_stone:12,item_iron:4},services:['trade'],ttsVoice:'zh_male_low_01',
  schedule:[[0,360,ll.home1,'睡眠'],[360,690,ll.adit,'带队下矿'],[690,720,ll.store,'清点贡粮棚'],[720,1200,ll.forge,'在共炉边见来人、收贡、派活',['trade']],[1200,1260,ll.council,'议事棚议事'],[1260,1440,ll.home1,'睡眠']],
  prose:{traits:['强硬','讲信用'],visibleFeature:'左边獠牙裂到牙根，裂口里嵌着一圈铁箍。',
   appearance:['左边獠牙裂到牙根，裂口里嵌着一圈铁箍。','肩上的皮甲拼了好几种兽皮','右手少了半片指甲，是早年挖矿砸的'],
   currentConcern:'锉芒当众抹掉了契板上的手印，工匠们要把纳贡改成按件贸易，他担心分配一松，营里就管不住了。',
   voice:{register:'嗓门低沉，说话短，像下命令',accent:'带着很重的兽人口音',habits:['说完一句就用拳头捶一下胸口'],samples:['这是我们的营。','贡粮照板上画的分。','要换，先在契板前说。']},
   personality:{values:['营里要有人说了算','画在契板上的约就要守'],flaws:['把工匠的不服当成挑衅，不肯细听']},
   familyNotes:'牙钺与牙烬、牙石、牙夯同住牙家皮棚，小兽人牙笋也在棚里；他不让牙笋跟队下矿，只让他在棚区里学认矿石。',
   relationships:[
    {with:P.yajin,type:'同棚议事',trust:35,affection:14,note:'牙烬看着他长大，他当上营头那天的首火是她点的；如今两人都主张照旧纳贡、由兽人分粮。'},
    {with:P.cuozhen,type:'营头与工匠头',trust:15,affection:4,note:'锉针修的矿镐他每天带下矿，她傍晚到议事棚报工；她提过按件换粮，他说等契板上的约到期再议。'},
    {with:P.cuomang,type:'营头与异议者',trust:-12,affection:0,note:'锉芒在营口当众抹掉契板上自己的手印，说工匠不认这份分法；他没有让人重画，也没有罚他。'},
    {with:P.yasun,type:'同棚照看',trust:10,affection:18,note:'小兽人牙笋总想跟队下矿，他每回都把牙笋留在棚区，教他认哪块石头里有铁。'}],
   memorySeeds:[
    {id:'memory_t159_ll_board',event:'上一期砾泉送贡粮那天，牙钺、牙烬、锉针、锉芒在营口对着炉灰契板分粮，工匠和搬运合起来那份只有兽人那份的一半；锉芒当众抹掉了契板上自己的手印，牙钺没有让人重画。',location:ll.gate,salience:5,knownBy:[P.yayue,P.yajin,P.cuozhen,P.cuomang],reliability:'亲历'},
    {id:'memory_t159_ll_yayue_cave',event:'十四年前他带着几队兽人打通了这条旧矿道，第一夜塌了一段，是他和队里的兽人连夜把压住的人刨出来的。',location:ll.adit,salience:4,knownBy:[P.yayue],reliability:'个人回忆'}],
   goals:[['让锉芒在契板上重新按手印',['在共炉边当众问锉芒要什么','让牙烬出面说契板的规矩']],
    ['守住砾泉的纳贡，不让营里的分配乱掉',['下一期交割时亲自在营口点数','请砾泉人给村里带话，贡约照旧']],
    ['让裂炉营在这条矿道上站稳十年',['把矿道再往里打通一段','教牙笋这一辈认矿']]],
   fears:['怕营里分成几伙，砾泉人看出来就不再送贡粮'],redLines:['共炉首火不让私占','画在契板上的约不能赖'],
   secrets:[{content:'他私下觉得按件换粮未必吃亏，只是怕一松口，兽人就不再听他的。',knownBy:[P.yayue]}],
   knowledge:{known:[{fact:'上一期砾泉送来的贡粮，兽人份是工匠和搬运合起来那份的两倍。',source:ll.store,reliability:'亲手清点'},
     {fact:'锉芒在营口抹掉了炉灰契板上自己的手印。',source:P.cuomang,reliability:'当场看见'},
     {fact:'砾泉村为走矿道向裂炉营纳粮，交割画在营口的炉灰契板上。',source:ll.gate,reliability:'亲自立的约'}],
    unknown:['砾泉村谁肯出面谈按件贸易？','锉芒是否会带工匠停工？']},
   opinions:{factions:'砾泉人怕我们，可也离不开这条矿道。',magic:'会冻人的法术最好别在营里用。',adventurers:'外来人肯护送石料去砾泉，他按趟给干粮。',
    neighbors:[{with:P.cuomang,view:'有胆子，没规矩。'},{with:P.yajin,view:'营里最懂契板的人。'}]},
   towardPlayer:{baseline:{trust:-5,affection:0},raises:['进营先在营口报来意','照契板上的约交付'],lowers:['不打招呼闯矿道','替工匠来压他'],attitude:'戒备，愿意在共炉边谈换石料、护运和通行。'},
   behaviorRules:{bargaining:'用手头的石料和铁料换粮和盐，按库存换，换完就停。',honesty:'契板上画的照实说，没画的说“没画”。',risk:'能守营就不出营。',threatResponse:'吼一声叫牙石，带兽人挡在共炉前。',bribeResponse:'私下给的东西他会当众画进契板。'},
   serviceWhat:'本人手头的石料与铁料',hooks:['契板上被抹掉的手印','改贡为贸易之争'],
   notes:'裂炉营营头，裂牙兽人，守贡派；白天带队下矿、在共炉边收贡派活，不愿改动纳贡和分配。',
   description:'牙钺是裂炉营的营头，四十六岁的裂牙兽人，左边獠牙裂到牙根，嵌着一圈铁箍。他白天带队下矿，午后在共炉边见来人、收贡、派活。锉芒当众抹掉了契板上的手印，工匠们要把纳贡改成按件贸易，他怕分配一松营里就管不住。他说话短，讲信用，属守贡派。',
   portraitPrompt:'原创裂牙兽人营头，比常人高一头，灰褐皮肤，左边獠牙裂到牙根嵌铁箍，拼皮甲，背矿镐，站在石砌大炉旁'}},
 {id:P.yajin,settlement:LL,species:ORC,name:'牙烬',age:68,sex:'女',occupation:'看守共炉',role:'炉老',...FULL,home:ll.home1,household:'house_ms_ll_01',workplace:ll.forge,
  facts:['共炉每天的首火由炉老牙烬点燃','私占共炉首火是裂炉营最重的忌讳'],
  coins:2,inventory:{item_charcoal:4},services:[],ttsVoice:'zh_female_mature_01',
  schedule:[[0,360,ll.home1,'睡眠'],[360,1200,ll.forge,'看守共炉、点首火'],[1200,1260,ll.council,'议事棚议事'],[1260,1440,ll.home1,'睡眠']],
  prose:{traits:['严厉','念旧'],visibleFeature:'两颗獠牙都裂了口，嘴角被炉火燎得发黑。',
   appearance:['两颗獠牙都裂了口，嘴角被炉火燎得发黑。','手指关节粗大，指缝里嵌着炉灰','脖子上挂着一串亡者留下的小铁片'],
   currentConcern:'工匠们要按轮次点首火，她觉得首火一乱，营里的规矩就散了，可她也知道首火本该是大家的。',
   voice:{register:'嗓音沙哑，说话慢而重',accent:'兽人老口音，常夹着旧时的号子',habits:['说到规矩时用火钳敲一下炉沿'],samples:['首火是共炉的，不是谁家的。','亡者的工具挂到炉边，归共营。','画了灰的约，就是约。']},
   personality:{values:['共炉的火不能断','亡者的工具归所属共营'],flaws:['嘴上说首火是大家的，手上从不让别族碰']},
   familyNotes:'牙烬与牙钺、牙石、牙夯同住牙家皮棚，她睡前给小兽人牙笋讲营里的旧事。',
   relationships:[
    {with:P.yayue,type:'同棚议事',trust:35,affection:14,note:'她看着牙钺长大，他当上营头那天的首火是她点的；她觉得他太硬，可在议事棚里总站在他那边。'},
    {with:P.cuozhen,type:'炉老与工匠头',trust:20,affection:8,note:'锉针每天傍晚借共炉的火修镐，烧出的木炭交到她手里；两人为首火该由谁点争过一回。'},
    {with:P.cuomang,type:'长辈与后生',trust:-5,affection:6,note:'锉芒抹掉契板手印那天，她用火钳敲炉沿让他住手；她记得锉芒小时候是在共炉边烤火长大的。'},
    {with:P.yasun,type:'同棚照看',trust:10,affection:16,note:'她睡前给小兽人牙笋讲营里的旧事，教他认炉边挂的每一件亡者工具。'}],
   memorySeeds:[
    {id:'memory_t159_ll_board',event:'上一期砾泉送贡粮那天，牙钺、牙烬、锉针、锉芒在营口对着炉灰契板分粮，工匠和搬运合起来那份只有兽人那份的一半；锉芒当众抹掉了契板上自己的手印，牙钺没有让人重画。',location:ll.gate,salience:5,knownBy:[P.yayue,P.yajin,P.cuozhen,P.cuomang],reliability:'亲历'},
    {id:'memory_t159_ll_yajin_tool',event:'早年营里一个哥布林工匠死在塌方里，他的锤子是她亲手挂上共炉边的工具架的。',location:ll.forge,salience:4,knownBy:[P.yajin],reliability:'个人回忆'}],
   goals:[['让首火的事在议事棚里有个说法',['先听锉针说按轮次怎么点','请牙钺别当场回绝']],
    ['把共炉边的亡者工具都按共营挂好',['清点工具架上每件工具的来处','让各族认回自己共营的那排']],
    ['让营里的小辈都记得共炉的规矩',['每天睡前给牙笋讲一段旧事','让锉粟也来炉边听']]],
   fears:['怕首火的事吵到动手，共炉边见了血'],redLines:['亡者的工具不能拿走','共炉的火一夜不能断'],
   secrets:[{content:'她心里知道，按兽人老家的规矩，共炉首火本该由住在炉边的各家轮着点，营里一直只由兽人点，这事她没跟工匠们说过。',knownBy:[P.yajin]}],
   knowledge:{known:[{fact:'共炉每天的首火由她点燃，向来只由兽人点。',source:ll.forge,reliability:'亲手点了多年'},
     {fact:'锉针每天傍晚借共炉的火修镐，烧出的木炭交给她。',source:P.cuozhen,reliability:'每天傍晚当面收下'},
     {fact:'锉芒在营口抹掉了炉灰契板上自己的手印。',source:ll.gate,reliability:'当场看见'}],
    unknown:['若在共炉按轮次点首火，各族多少天轮一回？','牙钺是否肯在议事棚里让首火的事上议？']},
   opinions:{factions:'砾泉人送粮是为走路，不是怕我们。',magic:'会点火的外来人别碰共炉。',adventurers:'外来人先在炉边坐下，听完再说话。',
    neighbors:[{with:P.yayue,view:'太硬，可营里离不了他。'},{with:P.cuozhen,view:'手稳，心也稳。'}]},
   towardPlayer:{baseline:{trust:-5,affection:0},raises:['在共炉边守规矩','帮着清点亡者工具'],lowers:['乱动炉火','拿炉边挂的工具'],attitude:'冷淡，先看来人懂不懂共炉的规矩。'},
   behaviorRules:{bargaining:'她不管买卖，只管炉火。',honesty:'规矩和旧事照实说，不知道的说“炉灰上没有”。',risk:'炉火在，她就不离开共炉。',threatResponse:'敲急声叫牙石，自己守着炉火不退。',bribeResponse:'给共炉的炭收下，给她本人的退回去。'},
   serviceWhat:null,hooks:['首火之争','共炉边的亡者工具'],
   notes:'裂炉营炉老，守共炉、点首火，主持亡者工具归营；守贡派，嘴上认首火归共炉。',
   description:'牙烬是裂炉营的炉老，六十八岁的裂牙兽人，两颗獠牙都裂了口，脖子上挂着亡者留下的小铁片。她日夜守着共炉，每天的首火由她点燃，亡者的工具也由她挂上炉边的工具架。工匠们要按轮次点首火，她怕规矩散了，在议事棚里多半站在牙钺那边。',
   portraitPrompt:'原创年老裂牙兽人炉老，灰褐皮肤，双獠牙裂口，嘴角燎黑，颈挂一串小铁片，手持火钳守着石砌大炉'}},
 {id:P.cuozhen,settlement:LL,species:GOBLIN,name:'锉针',age:44,sex:'女',occupation:'修矿具',role:'工匠头',...FULL,home:ll.home2,household:'house_ms_ll_02',workplace:ll.shop,
  facts:['锉针属工匠派，每天傍晚到议事棚报工','修具棚的木炭由哥布林看着共炉烧出，交给炉老牙烬'],
  coins:18,inventory:{item_iron_nail:30,item_mining_pick:2},services:['trade'],ttsVoice:'zh_female_bright_01',
  schedule:[[0,300,ll.shop,'修矿镐、敲铁钉',['trade']],[300,1020,ll.home2,'睡眠'],[1020,1200,ll.shop,'修矿镐、敲铁钉',['trade']],[1200,1260,ll.council,'到议事棚报工'],[1260,1440,ll.shop,'修矿镐、敲铁钉',['trade']]],
  prose:{traits:['稳重','算得精'],visibleFeature:'右耳尖缺了一块，是早年被飞出的铁屑削掉的。',
   appearance:['右耳尖缺了一块，是早年被飞出的铁屑削掉的。','腰上缠着三圈挂工具的绳子','指缝里总嵌着黑亮的铁屑'],
   currentConcern:'她想把纳贡改成按件贸易，让修好的矿镐直接换粮，可又怕锉芒闹得太凶，牙钺一怒连报工都不让她报。',
   voice:{register:'说话快而清楚，报数一个不落',accent:'咂舌少，人话说得比别的哥布林好',habits:['说到数时用小锤在砧上点一下'],samples:['一把镐，换几袋粮，说清楚。','修好的先给下矿的用。','锉芒，话留着到议事棚说。']},
   personality:{values:['出了工就该照工分粮','修得好的东西不扔'],flaws:['太想两边都不得罪，常把话说得含糊']},
   familyNotes:'锉针与锉芒、锉钳、锉灰同住锉家矮棚，小哥布林锉粟也在棚里；她不让锉粟碰锤子，只让他认工具的名字。',
   relationships:[
    {with:P.yayue,type:'工匠头与营头',trust:15,affection:4,note:'她修的矿镐牙钺每天带下矿，傍晚她到议事棚报工；她提过按件换粮，牙钺说等契板上的约到期再议。'},
    {with:P.cuomang,type:'同棚工匠',trust:20,affection:12,note:'锉芒是她带出来的徒弟，手艺好，脾气急；他抹手印那天她拉了他一把，没拉住。'},
    {with:P.yajin,type:'工匠头与炉老',trust:20,affection:8,note:'修具棚看着共炉烧出的木炭由她交到牙烬手里；两人为首火该由谁点争过一回。'},
    {with:P.cuosu,type:'同棚照看',trust:8,affection:16,note:'小哥布林锉粟总想摸锤子，她只让他认工具的名字，说等长大了再学。'}],
   memorySeeds:[
    {id:'memory_t159_ll_board',event:'上一期砾泉送贡粮那天，牙钺、牙烬、锉针、锉芒在营口对着炉灰契板分粮，工匠和搬运合起来那份只有兽人那份的一半；锉芒当众抹掉了契板上自己的手印，牙钺没有让人重画。',location:ll.gate,salience:5,knownBy:[P.yayue,P.yajin,P.cuozhen,P.cuomang],reliability:'亲历'},
    {id:'memory_t159_ll_cuozhen_pick',event:'她来裂炉营的头一年，一夜修好了十二把断柄的矿镐，第二天牙钺才准工匠在共炉边搭棚。',location:ll.shop,salience:3,knownBy:[P.cuozhen],reliability:'个人回忆'}],
   goals:[['让议事棚把改贡为贸易提上来议',['先把每把镐换几袋粮算清楚','请牙烬在议事棚里听她说完']],
    ['让工匠按工分粮',['把每夜修好的镐数画在棚柱上','攒一季的数给牙钺看']],
    ['让修具棚的手艺传到下一辈',['等锉粟长大了教他敲钉','把修镐的法子画在旧契板上']]],
   fears:['怕锉芒带工匠停工，兽人一怒把修具棚拆了'],redLines:['修好的镐不扣给下矿的人','不偷贡粮棚的粮'],
   secrets:[{content:'她私下和砾泉一个石匠说过按件换镐的价，这事牙钺还不知道。',knownBy:[P.cuozhen]}],
   knowledge:{known:[{fact:'上一期贡粮里工匠和搬运合起来那份只有兽人那份的一半。',source:ll.gate,reliability:'在契板前亲眼看过'},
     {fact:'锉芒在营口抹掉了炉灰契板上自己的手印。',source:P.cuomang,reliability:'当场拉过他'},
     {fact:'牙钺每天带下矿的矿镐是修具棚修的。',source:P.yayue,reliability:'修好就亲手送到矿口'}],
    unknown:['砾泉村是否肯按件换修好的矿镐？','牙钺会在哪一夜让议事棚议改贡的事？']},
   opinions:{factions:'砾泉的石匠识货，按件换对两边都好。',magic:'土石类的法术伤不了我们多少，别在矿道里乱用就行。',adventurers:'外来人肯护送修好的镐去砾泉，她愿意多给一把旧镐。',
    neighbors:[{with:P.cuomang,view:'手艺好，性子急。'},{with:P.yayue,view:'讲信用，就是听不进。'}]},
   towardPlayer:{baseline:{trust:0,affection:0},raises:['在修具棚换她修的东西','替工匠在议事棚说句话'],lowers:['白天吵醒工棚','乱动修具棚的工具'],attitude:'中立，夜里在修具棚口愿意谈换东西和改贡的事。'},
   behaviorRules:{bargaining:'用修好的矿镐和铁钉换东西，按手头的数，不赊。',honesty:'数照实报，不知道的说“还没算”。',risk:'不带工匠停工。',threatResponse:'咂舌叫锉钳，带工匠退进修具棚。',bribeResponse:'收下的东西当众画进棚柱。'},
   serviceWhat:'本人修好的矿镐与铁钉',hooks:['改贡为贸易','按件换镐的价'],
   notes:'裂炉营工匠头，灰窟哥布林，工匠派；夜里在修具棚修矿镐，傍晚到议事棚报工，想把纳贡改成按件贸易。',
   description:'锉针是裂炉营的工匠头，四十四岁的灰窟哥布林，右耳尖缺了一块。她夜里在修具棚修矿镐、敲铁钉，修好的镐交给兽人下矿，傍晚到议事棚报工。她想把纳贡改成按件贸易，让工匠按工分粮，又怕锉芒闹得太凶。她报数一个不落，属工匠派。',
   portraitPrompt:'原创灰窟哥布林工匠头，个子只到人腰，灰绿皮肤，右耳尖缺一块，腰缠三圈挂工具的绳子，坐在皮棚口的小铁砧前'}},
 {id:P.cuomang,settlement:LL,species:GOBLIN,name:'锉芒',age:26,sex:'男',occupation:'修矿具',role:'持不同主张者',...FULL,home:ll.home2,household:'house_ms_ll_02',workplace:ll.shop,
  facts:['锉芒属工匠派，抹掉了营口炉灰契板上自己的手印','锉芒夜里进矿道补撑木'],
  coins:3,inventory:{item_iron_nail:4},services:[],ttsVoice:'zh_male_bright_01',
  schedule:[[0,300,ll.adit,'进矿道补撑木'],[300,1020,ll.home2,'睡眠'],[1020,1200,ll.shop,'修矿具'],[1200,1260,ll.gate,'在营口契板前和工匠们说话'],[1260,1440,ll.adit,'进矿道补撑木']],
  prose:{traits:['冲动','讲义气'],visibleFeature:'右手手背上一片烫伤的疤，形状像半个手印。',
   appearance:['右手手背上一片烫伤的疤，形状像半个手印。','耳朵上穿着两枚自己打的小铁环','走路总带着一股炭渣味'],
   currentConcern:'他抹掉了契板上的手印，要工匠们一起不认这份分法，可锉针劝他别闹，他觉得再等下去工匠只会越分越少。',
   voice:{register:'说话又快又冲，声音尖',accent:'咂舌多，急了就夹着哥布林话',habits:['说到气头上用指头在地上画灰道'],samples:['我出的工，凭什么少一半？','手印我不按了。','首火也该我们点一回。']},
   personality:{values:['工匠出的力该有工匠的份','不服就当面说'],flaws:['一急就不管后果']},
   familyNotes:'锉芒与锉针、锉钳、锉灰同住锉家矮棚，小哥布林锉粟最爱跟着他，他夜里下矿前总给锉粟带一块炭渣玩。',
   relationships:[
    {with:P.yayue,type:'异议者与营头',trust:-12,affection:0,note:'他在营口当众抹掉契板上自己的手印，说工匠不认这份分法；牙钺没有让人重画，他反倒更不服。'},
    {with:P.cuozhen,type:'徒弟与师傅',trust:20,affection:14,note:'锉针是带他出来的师傅，他抹手印那天她拉了他一把；他觉得她太想两边都不得罪。'},
    {with:P.yajin,type:'后生与长辈',trust:-5,affection:6,note:'他小时候在共炉边烤火长大，是牙烬守着炉火看他长大的；抹手印那天她用火钳敲炉沿让他住手，他没有停。'},
    {with:P.panfu,type:'下矿同伴',trust:15,affection:10,note:'夜里他补撑木，巨魔磐负替他把木柱背进矿道；他劝磐负也来争粮，磐负只说“饿”。'}],
   memorySeeds:[
    {id:'memory_t159_ll_board',event:'上一期砾泉送贡粮那天，牙钺、牙烬、锉针、锉芒在营口对着炉灰契板分粮，工匠和搬运合起来那份只有兽人那份的一半；锉芒当众抹掉了契板上自己的手印，牙钺没有让人重画。',location:ll.gate,salience:5,knownBy:[P.yayue,P.yajin,P.cuozhen,P.cuomang],reliability:'亲历'},
    {id:'memory_t159_ll_cuomang_burn',event:'他小时候在共炉边偷着点过一回火，被烫伤了手背，那块疤到现在还在。',location:ll.forge,salience:3,knownBy:[P.cuomang],reliability:'个人回忆'}],
   goals:[['让工匠们都不在契板上按这份分法的手印',['夜里在营口契板前一个个去说','拉锉钳和锉灰先站出来']],
    ['让议事棚议按轮次点首火',['去问牙烬早年首火是谁点的','在共炉边当众提一回']],
    ['让工匠不再看兽人的脸色吃饭',['把纳贡改成按件贸易','让工匠也能在议事棚说上话']]],
   fears:['怕自己闹到最后，连锉针也被赶出修具棚'],redLines:['不偷贡粮','不对共炉动手'],
   secrets:[{content:'他夜里补撑木时发现矿道深处有一段新塌的，还没告诉任何人，怕兽人借这事说工匠补得不好。',knownBy:[P.cuomang]}],
   knowledge:{known:[{fact:'上一期贡粮里工匠和搬运合起来那份只有兽人那份的一半。',source:ll.gate,reliability:'在契板前亲眼看过'},
     {fact:'巨魔磐负夜里替他把木柱背进矿道。',source:P.panfu,reliability:'每夜同去'},
     {fact:'锉针每天傍晚到议事棚报工。',source:P.cuozhen,reliability:'同棚亲见'}],
    unknown:['早年共炉的首火是谁点的？','砾泉村是否知道营里在争分粮？']},
   opinions:{factions:'砾泉人送的粮，进了兽人棚就出不来。',magic:'会术的外来人他不在乎，只要肯站工匠这边。',adventurers:'外来人要是替工匠在议事棚开口，他愿意带路下矿看撑木。',
    neighbors:[{with:P.cuozhen,view:'手艺比谁都好，就是太软。'},{with:P.yayue,view:'只认兽人的份。'}]},
   towardPlayer:{baseline:{trust:0,affection:0},raises:['替工匠说话','在营口听他讲完'],lowers:['替兽人来劝他按手印','白天吵醒工棚'],attitude:'热络但急，先问来人站哪边。'},
   behaviorRules:{bargaining:'他手里只有几枚铁钉，不拿去换。',honesty:'分粮的事照直说，矿道的事只说一半。',risk:'敢在营口当众顶撞营头，不敢碰共炉。',threatResponse:'尖叫一声叫锉钳，往修具棚退。',bribeResponse:'不收兽人的东西。'},
   serviceWhat:null,hooks:['抹掉的手印','按轮次点首火'],
   notes:'裂炉营年轻工匠，灰窟哥布林，工匠派里最激进的一个；抹掉契板手印，主张改贡为贸易、轮点首火。',
   description:'锉芒是裂炉营的年轻工匠，二十六岁的灰窟哥布林，右手背上有一片像半个手印的烫疤。他傍晚在修具棚修矿具，入夜后进矿道补撑木。上一期分粮时他当众抹掉了契板上自己的手印，要工匠们都不认这份分法，还要议事棚议按轮次点首火。他说话又快又冲，讲义气。',
   portraitPrompt:'原创年轻灰窟哥布林工匠，灰绿皮肤，耳挂两枚小铁环，右手背有半个手印形烫疤，蹲在抹满炉灰的石契板前'}},
 // ===================== 裂炉营 roster
 {id:P.yashi,settlement:LL,species:ORC,name:'牙石',age:27,sex:'男',occupation:'守营',home:ll.home1,household:'house_ms_ll_01',
  prose:{traits:['勇猛','直来直去'],currentConcern:'牙钺让他盯着锉芒，他觉得为几袋粮跟工匠翻脸不值得。',visibleFeature:'右边獠牙的裂口刚裂不久，还渗着血丝。'}},
 {id:P.yahang,settlement:LL,species:ORC,name:'牙夯',age:38,sex:'男',occupation:'挖矿',home:ll.home1,household:'house_ms_ll_01',
  prose:{traits:['能干','爱抱怨'],currentConcern:'修具棚这几天交来的镐修得慢，他下矿时总得换着用。',visibleFeature:'两条胳膊粗得像撑木，手掌全是老茧。'}},
 {id:P.yasun,settlement:LL,species:ORC,name:'牙笋',age:10,sex:'男',occupation:'随棚区学认矿石',home:ll.home1,household:'house_ms_ll_01',
  prose:{traits:['好胜','爱模仿'],currentConcern:'想跟队下矿，可牙钺只让他在棚区里认石头。',visibleFeature:'獠牙才冒出一点尖，还没有裂口。'}},
 {id:P.cuoqian,settlement:LL,species:GOBLIN,name:'锉钳',age:35,sex:'男',occupation:'修矿具',home:ll.home2,household:'house_ms_ll_02',
  prose:{traits:['老实','跟随'],currentConcern:'锉芒要他也去抹手印，锉针又让他别闹，他夹在中间不知道听谁的。',visibleFeature:'左手总戴着一只磨破了的皮手套。'}},
 {id:P.cuohui,settlement:LL,species:GOBLIN,name:'锉灰',age:52,sex:'女',occupation:'烧炭',home:ll.home2,household:'house_ms_ll_02',
  prose:{traits:['精明','嘴碎'],currentConcern:'巨魔背来的木柴越来越湿，烧出的木炭不够修具棚用。',visibleFeature:'脸上总是一层黑灰，只露出两只大眼睛。'}},
 {id:P.cuosu,settlement:LL,species:GOBLIN,name:'锉粟',age:8,sex:'女',occupation:'随工棚学认工具名',home:ll.home2,household:'house_ms_ll_02',
  prose:{traits:['好奇','胆小'],currentConcern:'想摸一摸锤子，可锉针只让她认工具的名字。',visibleFeature:'手腕上套着一枚锉芒给的小铁环，大得直往下滑。'}},
 {id:P.panfu,settlement:LL,species:TROLL,name:'磐负',age:51,sex:'男',occupation:'搬运',home:ll.home3,household:'house_ms_ll_03',
  prose:{traits:['懒散','力大'],currentConcern:'分到的粮总不够一顿，他夜里搬完石料还得去坡上嚼草根。',visibleFeature:'背上的青苔厚得能藏住一只小鸟。'}},
 {id:P.panlei,settlement:LL,species:TROLL,name:'磐垒',age:47,sex:'女',occupation:'搬运',home:ll.home3,household:'house_ms_ll_03',
  prose:{traits:['慢性子','记仇'],currentConcern:'上回分粮巨魔又排在最后，她打算下一期交割时先坐到贡粮棚门口。',visibleFeature:'一只手指头比别的粗一圈，是早年被石块压的。'}},
];

export const households=[
 {id:'house_ms_yg_01',settlement:YG,homeLocation:yg.home1,members:[P.jiecang,P.jieyin,P.jiecha,P.jieqing,P.jieya],tenure:'节家树穴由节家木精共居，四名成年木精与小木精节芽同穴；登记不认定个人产权。'},
 {id:'house_ms_yg_02',settlement:YG,homeLocation:yg.home2,members:[P.xuxiao,P.xushi,P.xuhe,P.xumo],tenure:'须家石窝由须家穴鼬共居，三名成年成员与小穴鼬须末同窝；登记不认定个人产权。'},
 {id:'house_ms_yg_03',settlement:YG,homeLocation:yg.home3,members:[P.gonghou,P.gongni,P.gongtuan],tenure:'拱家土窝由拱家林獾共居，两名成年成员与小林獾拱团同窝；登记不认定个人产权。'},
 {id:'house_ms_ll_01',settlement:LL,homeLocation:ll.home1,members:[P.yayue,P.yajin,P.yashi,P.yahang,P.yasun],tenure:'牙家皮棚归兽人棚区共营，四名成年兽人与小兽人牙笋同棚；登记不认定个人产权。'},
 {id:'house_ms_ll_02',settlement:LL,homeLocation:ll.home2,members:[P.cuozhen,P.cuomang,P.cuoqian,P.cuohui,P.cuosu],tenure:'锉家矮棚归工棚区共营，四名成年哥布林与小哥布林锉粟同棚；登记不认定个人产权。'},
 {id:'house_ms_ll_03',settlement:LL,homeLocation:ll.home3,members:[P.panfu,P.panlei],tenure:'磐家石窝归石窝共营，两名成年巨魔同窝；登记不认定个人产权。'},
];

export const bosses=[
 {id:'boss_ms_yugen',history:['榆根里的木精长老在议根洞推举节苍做林主，是节荫头一个刻下同意的记号','根门旁两棵老榆的拱根是林主见客的地方'],name:'节苍',aliases:['榆根林主'],actor:P.jiecang,monster:ELM,tier:1,level:22,lair:yg.gate,settlement:YG,
  territory:[yg.gate,yg.nursery,yg.shed,yg.ditch,yg.rootslope,yg.store,yg.crown,yg.stone,yg.sett],
  negotiation:{stock:[{item:'item_hazelnut',quantity:8},{item:'item_walnut',quantity:6},{item:'item_dried_fruit',quantity:4}],accepts:['item_salt','item_fish','item_ration']},
  residence:{id:'lair_ms_yugen',name:'根门拱根座',location:yg.gate,replacementSpecies:[],vacancyDays:30,minionCount:0},
  mechanics:{adaptation:{tactics:['armed','unarmed'],threshold:2,perStep:0.1,maximum:0.3},weaknesses:[{tactic:'armed',requiresStatus:'dazzle',ignoreAdaptation:true}],
   abilities:[{id:'ability_ms_yugen_chief',every:4,belowHpPercent:50,effectSpec:{kind:'status',status:'fear',power:1},duration:1}]},
  prose:{territoryText:'榆根里的根门、育苗地、修具棚、排水沟、归根坡、林产窖，与老榆树穴、鼬石窟、獾土窟三处住区的林地和窟道',
   tactics:['适应持械与徒手；生命不高于50%时，每第4次命中反击附加1点恐惧，最多一分钟'],
   weakness:'睁眼受尚未消耗的眩光干扰时，持械攻击绕过适应防备。',
   taming:'有灵智的聚居地首领，不能驯服；只能交涉、立约或交锋。',
   originSeed:'节苍是榆根里年长的护林木精，木精长老在议根洞推举他做林主。他以护林为先，愿与来人谈林产交换和伐界。',
   origin:'节苍在北岗老林深处护了几十年林，榆根里的木精长老在议根洞推举他做林主，节荫头一个刻下同意的记号。他以护林为先，愿意和来人谈林产交换，也想和榆坡说定伐界，却不肯让穴居者进议根洞。',
   lairDescription:'根门拱根座是两棵老榆在地面上交错拱起的根，林主白天站在拱根旁见客。根下压着几篓榛仁和核桃，树皮上刻着一排节疤记号。',
   behavior:'他记住来者的实际接触，可谈互不攻击，也可立贸易、朝贡或通行的约定；通行只覆盖他辖下的根门、育苗地、修具棚、排水沟、归根坡、林产窖和三处住区的林地窟道，节家树穴、须家石窝、拱家土窝三处私宅和议根洞仍须当面许可。他换出的榛仁、核桃和干果以手头库存为限，收盐、鲜鱼和干粮。生命不高于一半时，每第四次命中的反击附加一点恐惧，最多一分钟；他睁眼受未耗去的眩光干扰时，持械攻击绕过适应。对榆根里成员发起交锋，会让整个榆根里对来者转为敌对。'}},
 {id:'boss_ms_lielu',history:['十四年前牙钺带几队兽人打通了这条旧矿道，营里的兽人在共炉边推他做营头','共炉边是营头见来人、收贡、派活的地方'],name:'牙钺',aliases:['裂炉营头'],actor:P.yayue,monster:ORC,tier:1,level:36,lair:ll.forge,settlement:LL,
  territory:[ll.gate,ll.forge,ll.shop,ll.adit,ll.yard,ll.store,ll.tents,ll.huts,ll.rocks],
  negotiation:{stock:[{item:'item_stone',quantity:12},{item:'item_iron',quantity:4}],accepts:['item_ration','item_oats','item_salt']},
  residence:{id:'lair_ms_lielu',name:'共炉营头座',location:ll.forge,replacementSpecies:[],vacancyDays:30,minionCount:0},
  mechanics:{adaptation:{tactics:['armed','unarmed','magic_fire'],threshold:2,perStep:0.1,maximum:0.3},weaknesses:[{tactic:'armed',requiresStatus:'dazzle',ignoreAdaptation:true}],
   abilities:[{id:'ability_ms_lielu_chief',every:4,belowHpPercent:50,effectSpec:{kind:'status',status:'fear',power:1},duration:1}]},
  prose:{territoryText:'裂炉营的营口、共炉、修具棚、矿口、卸石场、贡粮棚，与兽人棚区、工棚区、石窝三处住区',
   tactics:['适应持械、徒手与火焰法术；生命不高于50%时，每第4次命中反击附加1点恐惧，最多一分钟'],
   weakness:'睁眼受尚未消耗的眩光干扰时，持械攻击绕过适应防备。',
   taming:'有灵智的聚居地首领，不能驯服；只能交涉、立约或交锋。',
   originSeed:'牙钺十四年前带兽人打通了这条旧矿道，营里的兽人推他做营头。他掌着营地的武力和分配，愿与来人谈换石料和通行。',
   origin:'十四年前牙钺带着几队裂牙兽人打通了砾泉旧矿道的这条支路，营里的兽人在共炉边推他做了营头。后来哥布林工匠和苔背巨魔陆续投到营里，由兽人分粮。他愿意和来人谈换石料和通行，却不愿改动纳贡和分配。',
   lairDescription:'共炉营头座是共炉边一块磨平的大石，营头白天坐在这里见来人、收贡、派活。石旁堆着石料和几块铁料，炉边架子上挂着亡者留下的旧工具。',
   behavior:'他记住来者的实际接触，可谈互不攻击，也可立贸易、朝贡或通行的约定；通行只覆盖他辖下的营口、共炉、修具棚、矿口、卸石场、贡粮棚和三处住区，牙家皮棚、锉家矮棚、磐家石窝三处私宅和议事棚仍须当面许可。他换出的石料和铁料以手头库存为限，收干粮、燕麦和盐。生命不高于一半时，每第四次命中的反击附加一点恐惧，最多一分钟；他睁眼受未耗去的眩光干扰时，持械攻击绕过适应。对裂炉营成员发起交锋，会让整个裂炉营对来者转为敌对。'}},
];

export const cultures=[
 {id:'culture_ms_yugen',name:'榆根里共居者',settlement:YG,anchor:YG,witness:P.jieyin,region:'榆坡北岗老林深处',
  prose:{focus:'树穴与地窟同住、林产分份与护育苗根',
   naming:{structure:'名前取族号字：木精取节，穴鼬取须，林獾取拱；后接一字个名。生在哪一族就用哪一族的字，不因住处改动',syllableCount:[2,2]},
   facts:{food:'木精不吃东西，靠根须吸林下水土、白天晒太阳；穴鼬吃虫鼠，最认换来的鲜鱼；林獾吃块根、落果和虫，也吃换来的干粮；林产按份分给穴居者，或拿到根门换东西',
    clothing:'不穿衣；木精在节疤上缠记号草绳，穴鼬和林獾在身上抹各窟的土色',
    architecture:'老榆根下掏树穴，树穴底下连着穴居者挖的石窟和土窟；林下挖排水沟，把积水从育苗地引到坡下',
    family:'小木精和幼崽由同穴同窝的成员一起照看；幼崽不下沟挖土，只在侧口边看',
    ageGender:'林主由木精长老在议根洞推举；议根洞历来只坐木精，穴居者在根门外等消息，眼下正为此起争执；雌雄都能议事',
    law:'伤了育苗根的要赔一季劳力；林产分份刻在分账树皮上，没刻的不算',
    magicAdventurers:'怕火，带火的外来人要在林外熄掉；会法术的先在根门报来意',
    festivalPractice:'归根葬：木精亡故后，身躯埋回归根坡老榆的根旁；穴鼬和林獾亡故后，埋在坡下各窟外的土里，各插一根新榆条',
    taboo:'伤育苗根；在林里点火',
    arts:'节疤记号和土染图：木精在树皮上刻节疤样的记号，穴居者用不同颜色的湿土在石上画图，两样对着看才是完整的路标和账',
    speech:'木精说话极慢，像风过枝条；穴鼬话快带嗤声，林獾话少带咕噜；彼此招呼靠敲树干和刨地的节拍'},
   dailyLife:'榆根里的一天分成两班。天亮后木精出树穴，在林下慢慢挪动晒太阳，把腐叶埋到苗根旁，给伤苗糊湿泥，林主在根门见来换东西的榆坡人。黄昏时两班交接，木精到议根洞议事，穴居者在根门外等消息。天黑后木精扎根不动，穴鼬和林獾出窟：林獾清沟运土，穴鼬修铲巡夜。天亮前排水头把运进林产窖的干果篓数刻上树皮，林獾再回窟里睡。',
   familyAndLaw:'榆根里的小木精和幼崽由同穴同窝的成员一起照看，谁有空谁看，幼崽不下沟挖土，只在侧口边学认土。林主由木精长老在议根洞推举，议根洞历来只坐木精，穴居者出了力，却只能在根门外等分份的消息，这正是眼下的争执。伤了育苗根的要赔一季劳力；林产分份刻在分账树皮上，没刻的不算。他们看重护林和守约，觉得出了力就该有份，可谁来定份数，木精和穴居者说法不同。',
   faithAndFestivals:'榆根里不拜神，只敬老榆的根。亡者要归根：木精亡故后，同穴的木精把它的身躯埋回归根坡老榆的根旁；穴鼬和林獾亡故后，埋在坡下各窟外的土里。每处都插一根新榆条，榆条活下来，就算亡者归了根。伤育苗根和在林里点火是最重的忌讳，犯了的要赔一季劳力，点火的会被赶出林子。',
   voice:'木精说话极慢，一句话里要停好几回，像风吹过枝条；穴鼬说话快，句尾带一声短促的嗤；林獾话少，说话间夹着低低的咕噜。彼此招呼靠敲树干和刨地的节拍，记事和指路靠节疤记号和土染图：木精在树皮上刻记号，穴居者在石上抹不同颜色的湿土，两样对着看才完整。对外人他们只说几个词，比如“树”“不砍”“换”。',
   proverbs:['苗根伤了，一季补不回。','刻在树皮上的才算。','拿枯的，留活的。','沟通了，苗就不泡。','树穴和地窟，一根底下。','新榆条活了，亡者就归了根。','林里不见火。','白天归树，夜里归窟。','出了力，就有份。','节疤配土图，路就不迷。']}},
 {id:'culture_ms_lielu',name:'裂炉营人',settlement:LL,anchor:LL,witness:P.yajin,region:'砾泉旧矿道支路',
  prose:{focus:'共炉首火、炉灰画契与各族分工',
   naming:{structure:'名前取营族字：兽人取牙，哥布林取锉，巨魔取磐；后接一字个名。生在哪个营族就用哪个字',syllableCount:[2,2]},
   facts:{food:'兽人打猎吃烤肉，也吃分到的贡粮；哥布林吃虫鼠和分到的粮；巨魔一顿吃一大袋，不够就嚼苔藓草根；砾泉送来的贡粮由兽人分',
    clothing:'兽人穿拼起来的皮甲，哥布林腰缠挂工具的绳子，巨魔不穿衣，背上长着青苔',
    architecture:'坡上按族分住：兽人住皮棚，哥布林住矮棚，巨魔住乱石垒的石窝；中间是一口石砌的共炉',
    family:'幼体不下矿、不搬运、不服劳役，由所在棚窝照看，只学认矿石和工具的名字',
    ageGender:'营头由兽人在共炉边推举，掌营地的武力和分配；工匠和搬运的在议事棚里只能报工，眼下正有工匠挑战这层主从；雌雄都能下矿',
    law:'炉灰画契：营里营外的约用指头蘸炉灰画在契板上，各族按手印，没画的不认；抹掉手印就是不认这份约',
    magicAdventurers:'兽人怕冷，巨魔怕火，冻人和烧人的法术在营里都不受欢迎；外来人要先在营口报来意',
    festivalPractice:'亡者的工具归所属共营，挂到共炉边的工具架上；亡者由本族抬到矿口外的碎石坡下葬，堆一堆石',
    taboo:'私占共炉首火；拿走炉边挂的亡者工具',
    arts:'炉灰画契：用指头蘸炉灰在石契板上画数、画约，按手印为凭',
    speech:'兽人说话短而重，哥布林又快又尖，巨魔一次只说一两个词；营里招呼靠吼声和敲铁'},
   dailyLife:'裂炉营里各族作息不同。天亮后兽人起来，炉老点燃共炉的首火，营头带队下矿，挖出的石料和铁料堆在矿口外。黄昏时哥布林醒来，到修具棚修矿镐、敲铁钉，借共炉的火烧木炭；入夜后巨魔把矿口外的石料背到卸石场，码成石垛。傍晚兽人收工以后，营头和炉老在议事棚议事，工匠头来报工。砾泉送贡粮时，各族在营口的契板前交割。',
   familyAndLaw:'裂炉营的幼体不下矿、不搬运、不服劳役，由所在的棚窝照看，只学认矿石和工具的名字。营头由兽人推举，掌着武力和分配；哥布林修具、巨魔搬运，按兽人分的份吃饭，工匠头在议事棚里只能报工。营里营外的约都用炉灰画在契板上，各族按手印，没画的不认；抹掉手印，就是当众不认这份约。他们看重画了灰的约和共炉的火，可工匠们越来越觉得，出了工就该照工分粮。',
   faithAndFestivals:'裂炉营不拜神，只敬共炉的火。每天的首火由炉老点燃，私占共炉首火是营里最重的忌讳。亡者的工具归所属共营，由炉老挂到共炉边的工具架上，谁也不能拿走；亡者由本族抬到矿口外的碎石坡下葬，各族都来堆一块石。炉老点首火时，各族要在炉边站一会儿，不出声。',
   voice:'兽人说话短而重，像下命令；哥布林说话又快又尖，夹着咂舌；巨魔说得极慢，一次只说一两个词。营里隔着坡招呼靠吼声和敲铁，立约记事靠炉灰：用指头蘸炉灰在石契板上画数，各族按手印为凭。对外人他们常说“换”“画上”“走矿道”，先在营口问清来意。',
   proverbs:['画了灰的约，就是约。','首火是共炉的。','亡者的工具挂炉边。','先报来意，再进营。','镐修好了，矿才挖得动。','巨魔饿了，石头就背不动。','幼体不下矿。','手印抹了，约就断了。','炉火不断，营就不散。','出了工，就该有份。']}},
];

// Local organisations with executable T109 clocks. A clock's deciding stage
// reads the closed council motion; each outcome carries its own price, item
// shares to named members and news to the neighbouring village.
const tP=t157.P,tj=t157.tj,td=t157.td;
const issue=(settlement,id,status,extra={})=>({kind:'society_issue',settlement,issue:id,status,...extra});
export const organizations=[
 {id:'faction_ms_yugen',name:'榆根议根会',settlement:YG,culture:'culture_ms_yugen',region:'榆坡北岗老林深处',leader:P.jiecang,coreMembers:[P.jieyin],foundedYear:-90,memberCount:14,treasuryCopper:0,
  items:{item_hazelnut:30,item_walnut:20,item_dried_fruit:16,item_wood:12},contact:yg.gate,
  clock:{id:'clock_ms_yugen',name:'林产分份之争',motion:'shared_allocation',
   stages:[{id:'raise',name:'议根洞开议林产分份',condition:{kind:'motion',id:`society_motion:${YG}:shared_allocation`,statuses:['议事中','通过','否决']},cost:{items:{item_dried_fruit:2}},effect:issue(YG,'forest_share','议根洞开议林产分份')},
    {id:'decide',name:'按议定分出本季林产',condition:{kind:'motion',id:`society_motion:${YG}:shared_allocation`},cost:{items:{item_hazelnut:4}},
     effect:issue(YG,'forest_share','按议定分出本季林产',{motion:'shared_allocation',outcomes:{
      '通过':{result:'树穴地窟同议分份',cost:{items:{item_wood:4}},shares:[{to:P.gonghou,item:'item_hazelnut',quantity:6},{to:P.xuxiao,item:'item_walnut',quantity:4}]},
      '否决':{result:'仍由木精按树分份',cost:{items:{item_hazelnut:6}},shares:[{to:P.jiecang,item:'item_hazelnut',quantity:6}]}}})},
    {id:'settle',name:'照新分法落实一季',condition:{kind:'always'},cost:{items:{item_wood:2}},effect:issue(YG,'forest_share','照议定分法落实一季')}],
   interventions:[{id:'yg_mediate_pause',stage:'decide',location:yg.gate,minutes:60,attribute:'魅力',difficulty:15,effect:'pause'},{id:'yg_mediate_resume',stage:'decide',location:yg.gate,minutes:30,effect:'resume'}]},
  relations:[{faction:'faction_ms_taideng',score:0}]},
 {id:'faction_ms_lielu',name:'裂炉共炉议',settlement:LL,culture:'culture_ms_lielu',region:'砾泉旧矿道支路',leader:P.yayue,coreMembers:[P.yajin,P.cuozhen],foundedYear:-14,memberCount:9,treasuryCopper:30,
  items:{item_ration:24,item_stone:40,item_iron:10,item_iron_nail:20},contact:ll.forge,
  clock:{id:'clock_ms_lielu',name:'贡粮改制之争',motion:'tribute_to_trade',
   stages:[{id:'raise',name:'议事棚开议改贡',condition:{kind:'motion',id:`society_motion:${LL}:tribute_to_trade`,statuses:['议事中','通过','否决']},cost:{items:{item_ration:2}},effect:issue(LL,'tribute','议事棚开议改贡')},
    {id:'decide',name:'按议定处置下一期贡粮',condition:{kind:'motion',id:`society_motion:${LL}:tribute_to_trade`},cost:{items:{item_stone:4}},
     effect:issue(LL,'tribute','按议定处置下一期贡粮',{motion:'tribute_to_trade',outcomes:{
      '通过':{result:'改贡为按件贸易',cost:{items:{item_iron:4}},shares:[{to:P.cuozhen,item:'item_ration',quantity:6}],news:[{target:'loc_bs_liquan',act:'aid'}]},
      '否决':{result:'照旧纳贡换通行',shares:[{to:P.yayue,item:'item_ration',quantity:6}]}}})},
    {id:'settle',name:'头一批石料运往砾泉',condition:{kind:'always'},cost:{items:{item_stone:6}},effect:issue(LL,'tribute','照议定落实一期')}],
   interventions:[{id:'ll_mediate_pause',stage:'decide',location:ll.forge,minutes:60,attribute:'魅力',difficulty:15,effect:'pause'},{id:'ll_mediate_resume',stage:'decide',location:ll.forge,minutes:30,effect:'resume'}]},
  relations:[{faction:'faction_ms_tanjie',score:0}]},
 {id:'faction_ms_tanjie',name:'炭阶共灶议',settlement:t157.TJ,culture:'culture_ms_tanjie',region:'白石镇西郊废窑地下',leader:tP.yanzhen,coreMembers:[tP.dingying,tP.yantai],foundedYear:-40,memberCount:12,treasuryCopper:20,
  items:{item_dry_mushroom:40,item_iron_nail:30},contact:tj.hearth,
  clock:{id:'clock_ms_tanjie',name:'过冬粮约之争',motion:'grain_pact',
   stages:[{id:'raise',name:'夜议开议粮约',condition:{kind:'motion',id:`society_motion:${t157.TJ}:grain_pact`,statuses:['议事中','通过','否决']},cost:{items:{item_dry_mushroom:2}},effect:issue(t157.TJ,'winter_grain','夜议开议粮约')},
    {id:'decide',name:'按议定备下过冬的粮路',condition:{kind:'motion',id:`society_motion:${t157.TJ}:grain_pact`},cost:{items:{item_iron_nail:4}},
     effect:issue(t157.TJ,'winter_grain','按议定备下过冬的粮路',{motion:'grain_pact',outcomes:{
      '通过':{result:'与白石镇谈按旬粮约',cost:{items:{item_dry_mushroom:10}},shares:[{to:tP.yantai,item:'item_iron_nail',quantity:10}],news:[{target:'loc_bs',act:'aid'}]},
      '否决':{result:'抢粮派得势',shares:[{to:tP.liya,item:'item_iron_nail',quantity:4}],news:[{target:'loc_bs',act:'harm'}]}}})},
    {id:'settle',name:'过冬粮路落实一旬',condition:{kind:'always'},cost:{items:{item_dry_mushroom:4}},effect:issue(t157.TJ,'winter_grain','照议定落实一旬')}]},
  relations:[{faction:'faction_ms_lielu',score:0}]},
 {id:'faction_ms_taideng',name:'苔灯绳议',settlement:t157.TD,culture:'culture_ms_taideng',region:'河湾村北林支路林下',leader:tP.liheng,coreMembers:[tP.taimian,tP.qingzhi],foundedYear:-70,memberCount:8,treasuryCopper:0,
  items:{item_herb:24,item_dried_fruit:20},contact:td.commons,
  clock:{id:'clock_ms_taideng',name:'捕夹旧伤之争',motion:'trap_redress',
   stages:[{id:'raise',name:'长老树洞开议追偿',condition:{kind:'motion',id:`society_motion:${t157.TD}:trap_redress`,statuses:['议事中','通过','否决']},cost:{items:{item_herb:2}},effect:issue(t157.TD,'trap_wounds','长老树洞开议追偿')},
    {id:'decide',name:'按议定答复河湾',condition:{kind:'motion',id:`society_motion:${t157.TD}:trap_redress`},cost:{items:{item_dried_fruit:2}},
     effect:issue(t157.TD,'trap_wounds','按议定答复河湾',{motion:'trap_redress',outcomes:{
      '通过':{result:'向河湾猎户追偿旧伤',cost:{items:{item_herb:3}},shares:[{to:tP.lizhen,item:'item_herb',quantity:2}],news:[{target:'loc_hw',act:'harm'}]},
      '否决':{result:'先结缘再议边界',cost:{items:{item_dried_fruit:4}},shares:[{to:tP.qingzhi,item:'item_herb',quantity:4}],news:[{target:'loc_hw',act:'aid'}]}}})},
    {id:'settle',name:'绳记落定一季',condition:{kind:'always'},cost:{items:{item_herb:2}},effect:issue(t157.TD,'trap_wounds','照议定落实一季')}]},
  relations:[{faction:'faction_ms_yugen',score:0}]},
];
// Organisation prose: reviewed with the batch, assembled into the faction row.
const ORG_PROSE={
 faction_ms_yugen:{kind:'聚居地议事',contactMode:'白天在榆根里根门当面找林主节苍；不是寄信处，木精入夜扎根后无人应答',
  assets:'分账树皮上记在议根会名下的榛仁、核桃、干果和枯枝',resourceScope:'议根会公账，按议定分给成员或拿去根门交换；非成员不能直接取用',
  publicGoal:'护住老林和育苗地，照分账树皮分林产',privateGoal:'伐界说定以前不让地窟成员进议根洞，林产窖里留下的三份榛仁留着和榆坡谈伐界',
  method:'黄昏在议根洞议定，刻上树皮才算',divisions:['护林派要林产由木精按树分份','共议派要地窟成员进议根洞同议'],offers:'林产交换和老林里的路',demands:'进林熄火，不砍活树，不踩育苗地',
  reputation:{trusted:'林主肯在根门谈伐界，也肯立长一些的交换约',neutral:'先在根门说清来意',distrusted:'不在根门交换，进林会被敲树干赶出'},
  relationReason:{faction_ms_taideng:'同是林下聚居的精怪，只经过往货郎听过对方，没有往来'},
  trigger:'有人在议根洞提出让地窟成员同议林产分份',stageEffects:[['议根洞开议林产分份','议题在议根洞提出'],['按议定分出本季林产','议根洞闭合此议'],['照新分法落实一季','上一阶段已落实']],
  counterplay:'在议根洞说服护林派，或在根门请林主暂缓落实',
  prose:{conduct:'榆根议根会是榆根里木精长老在议根洞里的议事。每天黄昏木精扎根以前，林主节苍和长老节荫在洞里议事，议定的事刻在树皮上才算。议根会名下记着一批去壳榛仁、碎壳净核桃仁、干果小袋和木料。议根洞历来只坐木精，清沟运土的穴鼬和林獾只在根门外等消息。',
   internalLife:'护林派觉得林产是木精护出来的，理当由木精按树分份；共议派觉得排水运土出了大力，地窟成员该进议根洞同议。本季分账树皮上地窟那一栏少了三道，那三份榛仁还在林产窖里。公开说的是护林和照树皮分份，林主私下打算伐界说定以前不让地窟成员进洞，那三份榛仁留着和榆坡谈伐界。议题在议根洞闭合以后，本季林产照议定分出：同议，地窟成员也分到林产；否决，仍由木精按树分份。',
   playerEncounter:'白天到根门可以找到林主节苍，这里不是寄信处，入夜木精扎根后便无人应答。来客可以用粗盐小包、剖净鲜鱼或干粮向林主换林产，也能请林主谈伐界。想替地窟说话的人，得先取得长老节荫许可进议根洞，在黄昏议事时说服护林派；议定的分法落实以前，还可以在根门请林主暂缓。'}},
 faction_ms_lielu:{kind:'聚居地议事',contactMode:'白天在裂炉营共炉边当面找营头牙钺；不是寄信处，兽人收工后改在议事棚议事',
  assets:'炉灰账上记在共炉议名下的干粮、石料、铁料和小铁钉',resourceScope:'共炉议公账，按议定分给成员或运往砾泉交换；非成员不能直接取用',
  publicGoal:'守住矿道和共炉，照契板上的约交割',privateGoal:'营头想守住兽人掌分配的老规矩，不让分配权落到工匠手里',
  method:'傍晚在议事棚议定，用炉灰画上契板为凭',divisions:['守贡派要照旧纳贡、由兽人分粮','工匠派要改贡为按件贸易、按工分粮'],offers:'石料、铁料、修好的矿镐和矿道通行',demands:'进营先报来意，照契板交付',
  reputation:{trusted:'可在共炉边谈护运和按件换石料',neutral:'先在营口说清来意',distrusted:'不在营口交割，进矿道会被赶出'},
  relationReason:{faction_ms_tanjie:'同有灰窟哥布林，可相隔一镇，只经货郎听过对方，没有往来'},
  trigger:'有人在议事棚提出把砾泉的纳贡改为按件贸易',stageEffects:[['议事棚开议改贡','议题在议事棚提出'],['按议定处置下一期贡粮','议事棚闭合此议'],['头一批石料运往砾泉','上一阶段已落实']],
  counterplay:'在议事棚说服守贡派，或在共炉边请营头暂缓落实',
  prose:{conduct:'裂炉共炉议是裂炉营傍晚在议事棚里的议事。兽人收工以后，营头牙钺和炉老牙烬在棚里议事，工匠头锉针也来报工；议定的事用炉灰画上契板，各族按手印。共炉议名下记着一批干粮、石料、铁料和小铁钉，按议定分给成员或运往砾泉。砾泉为走矿道送来的贡粮，向来由兽人分。',
   internalLife:'守贡派要照旧纳贡、由兽人分粮；工匠派要把纳贡改成按件贸易，修好的矿镐和石料按件换粮，工匠按工分粮。锉芒抹掉了营口炉灰契板上自己的手印。公开说的是守住矿道和照契板交割，营头私下只想守住兽人掌分配的老规矩。议题在议事棚闭合以后，下一期贡粮照议定处置：改贡，六份干粮分到工匠头锉针手里，砾泉听到的是好消息；不改，这六份干粮归营头牙钺。',
   playerEncounter:'白天到共炉边可以找到营头牙钺，这里不是寄信处，兽人收工后他改在议事棚。来客先在营口报来意，就能用干粮、带壳燕麦或粗盐小包向营头换石料和铁料，也能谈互不攻击、朝贡或通行的约。想替工匠说话的人，得先取得营头许可进议事棚，在傍晚说服守贡派；议定的处置落实以前，还可以在共炉边请营头暂缓。'}},
 faction_ms_tanjie:{kind:'聚居地议事',contactMode:'夜里在炭阶地宫共灶厅窟主座当面找窟主烟砧；不是寄信处，白天全窟睡觉',
  assets:'共灶攒下的干菌片和小铁钉',resourceScope:'共灶议公账，按议定分给成员或拿到换粮台交换；非成员不能直接取用',
  publicGoal:'守住共灶和风井，用菌粮和修补活计换粮',privateGoal:'窟主想先查清仓窟少粮的去向，再决定和白石镇谈多大的粮约',
  method:'子时过后在议事窟夜议，刻进刻痕账才算',divisions:['守窟换粮的要和白石镇立粮约','抢粮挑战的要出窟抢粮过冬'],offers:'干菌片、小铁钉和修补活计',demands:'进窟压暗灯火，按刻痕交付',
  reputation:{trusted:'可在共灶厅谈雇工和粮约',neutral:'先在炭阶口说清来意',distrusted:'不在换粮台交易，进窟会被敲管赶出'},
  relationReason:{faction_ms_lielu:'同有灰窟哥布林，可相隔一镇，只经货郎听过对方，没有往来'},
  trigger:'有人在议事窟提出与白石镇立按旬交付的粮约',stageEffects:[['夜议开议粮约','议题在议事窟提出'],['按议定备下过冬的粮路','议事窟闭合此议'],['过冬粮路落实一旬','上一阶段已落实']],
  counterplay:'在议事窟说服抢粮挑战的一派，或替共灶查清少粮的去向',
  prose:{conduct:'炭阶共灶议是炭阶地宫子时过后在议事窟里的夜议。每夜子时过后在议事窟夜议，议定的事刻进刻痕账才算。共灶议名下记着一批干菌片和小铁钉。',
   internalLife:'守窟换粮的一派要入冬前和白石镇立按旬交付的粮约；抢粮挑战的一派嫌换得太贱，要出窟抢粮过冬。仓窟少了三袋燕麦，去向没有查清。公开说的是守住共灶和风井，窟主私下想先查清少粮的去向，再决定粮约谈多大。议题在议事窟闭合以后，过冬的粮路照议定备下：立约，共灶拿出一批干菌片，烟苔领到一份铁钉，消息让白石镇缓和；否决，抢粮的一派得势，砾牙领到几枚铁钉，消息让白石镇更戒备。',
   playerEncounter:'夜里到共灶厅窟主座可以找到窟主烟砧，这里不是寄信处，白天全窟睡觉。来客压暗灯火，可以拿燕麦、干粮或粗盐向窟主换干菌片和铁钉。想推动粮约的人，得先取得窟主许可进议事窟，在夜议时说服抢粮挑战的一派。'}},
 faction_ms_taideng:{kind:'聚居地议事',contactMode:'天黑以后到夜议以前，在苔灯坞共食庭倒木边当面找坞主栗衡；不是寄信处，白天狐族在根洞里睡',
  assets:'坞里攒下的药草和干果',resourceScope:'绳议公账，按议定分给成员或拿到换盐石交换；非成员不能直接取用',
  publicGoal:'守住换盐的路，把捕夹的边界说清',privateGoal:'坞主私下也觉得栗针的伤该有人赔，只是不愿在共食庭说出来',
  method:'子时过后在长老树洞夜议，打成绳记才算',divisions:['结缘派要先与外人结缘再谈边界','追偿派要河湾猎户先认账赔偿'],offers:'药草、干果和林下的路',demands:'林缘熄火，不下夹子，不踩新苗',
  reputation:{trusted:'可在共食庭谈换盐和边界',neutral:'先在换盐石说清来意',distrusted:'不在换盐石交换，进林会被长嚎赶出'},
  relationReason:{faction_ms_yugen:'同是林下聚居的精怪，只经过往货郎听过对方，没有往来'},
  trigger:'有人在长老树洞提出向河湾猎户追偿旧伤',stageEffects:[['长老树洞开议追偿','议题在长老树洞提出'],['按议定答复河湾','长老树洞闭合此议'],['绳记落定一季','上一阶段已落实']],
  counterplay:'在长老树洞说服追偿派或结缘派，或替坞里弄清夹子落在边界石哪一侧',
  prose:{conduct:'苔灯绳议是苔灯坞子时过后在长老树洞里的夜议。夜议时读新挂的气味绳，议定的事打成绳记。树洞壁上的小龛里收着各家巢亡者的尾结。绳议名下记着一批药草和干果。',
   internalLife:'结缘派要先与外人结下互助之缘，再谈捕夹的边界；追偿派要河湾猎户先为被夹伤的狐认账赔偿。公开说的是守住换盐的路，坞主私下也觉得栗针的伤该有人赔，只是不愿在共食庭说出来。议题在长老树洞闭合以后，坞里照议定答复河湾：追偿，河湾听到的是坏消息；先结缘，河湾听到的是好消息。',
   playerEncounter:'天黑以后到夜议以前，可以在共食庭倒木边找到坞主栗衡，这里不是寄信处，白天狐族在根洞里睡。来客可以拿盐或干粮向坞主换干果和药草，也能谈捕夹的边界。想推动追偿或结缘的人，得先取得长老苔眠许可进长老树洞，在夜议时说服持另一主张的成员。'}},
};
export {ORG_PROSE};

// --------------------------------------------------------------- builders
const byId=new Map(people.map(p=>[p.id,p]));
const placeById=new Map(places.map(p=>[p.id,p]));
const settlementOf=id=>settlements.find(s=>s.id===id);

export function buildNpc(p){
 const s=settlementOf(p.settlement),x=p.prose,minor=p.age<18;
 const common={id:p.id,name:p.name,aliases:[],tier:p.tier??'roster',age:p.age,sex:p.sex,species:p.species,society:s.id,culture:s.culture,settlement:s.id,scope:s.id,
  householdId:p.household,household:households.find(h=>h.id===p.household).members.filter(id=>id!==p.id),occupation:p.occupation,traits:x.traits,
  home:{location:p.home,access:'同住共居；进入私宅须先取得成年住户的有效许可。'},location:p.home,flags:{minor,romanceable:false},currentConcern:x.currentConcern,visibleFeature:x.visibleFeature};
 if(p.tier!=='full')return common;
 return {...common,home:{...common.home,ownership:'unspecified'},location:p.schedule[0][2],trust:0,affection:0,coins:p.coins,birth:{year:-p.age,month:(p.age%12)+1,day:((p.age*7)%28)+2},inventory:p.inventory,skills:[],services:p.services,intelligence:{level:2,growth:0},
  role:p.role,familyNotes:x.familyNotes,appearance:x.appearance,voice:x.voice,personality:{traits:x.traits,...x.personality},proficiencies:{},professions:[],level:1,combat:null,
  wealth:{cashRange:[p.coins,p.coins],property:[],valuables:[],debts:[]},workplace:{location:p.workplace,access:'公共林地、窟道或营地可当面招呼；工具和存物另问看管者。'},
  schedule:schedule(p.schedule),relationships:x.relationships,memorySeeds:x.memorySeeds,goals:goals(`goal_t159_${p.id.replace(/^npc_ms_/,'')}`,x.goals),
  fears:x.fears,redLines:x.redLines,secrets:x.secrets,knowledge:x.knowledge,opinions:x.opinions,towardPlayer:x.towardPlayer,behaviorRules:x.behaviorRules,
  serviceCatalog:x.serviceWhat?[{kind:'trade',what:x.serviceWhat,price:{mode:'engineQuote'},unlocksService:false}]:[],hooks:x.hooks,ttsVoice:p.ttsVoice,portraitPrompt:x.portraitPrompt,notes:x.notes,description:x.description};
}

const round=n=>Math.round(n*1000)/1000;
const STORE_SITE={
 [yg.store]:{owner:P.jiecang,manager:P.jiecang,occupants:[P.gonghou],resources:[{id:'yg_store_hazelnut',name:'窖存榛仁',item:'item_hazelnut',quantity:24,minutes:5}],
  clues:x=>[{id:'yg_store_bark',name:'分账树皮',text:x.clues.bark,minutes:10},{id:'yg_store_tally',name:'篓沿刻数',text:x.clues.tally,minutes:15}],infiltration:{minutes:30,check:{attribute:'敏捷',difficulty:15},damage:3}},
 [ll.store]:{owner:P.yayue,manager:P.yayue,occupants:[P.yayue],resources:[{id:'ll_store_ration',name:'贡粮',item:'item_ration',quantity:18,minutes:5}],
  clues:x=>[{id:'ll_store_ledger',name:'炉灰账',text:x.clues.ledger,minutes:10},{id:'ll_store_print',name:'抹掉的手印',text:x.clues.print,minutes:10}],infiltration:{minutes:30,check:{attribute:'敏捷',difficulty:20},damage:6}},
};
export function buildLocation(place){
 const s=settlementOf(place.settlement),x=place.prose;
 if(place.kind==='seat')return{id:s.id,name:s.name,aliases:[],parent:s.locParent,scope:s.scope,coordinates:s.coordinates,terrain:s.terrain,openHours:[0,1440],owner:null,
  purpose:s.purpose,rooms:[],inventory:{},mapHierarchy:hierarchy(s.parent,s.parentName),
  monsterSociety:structuredClone(s.society),authoredFacts:{...x.authoredFacts,noMechanics:'公共林地、窟道与营地只登记通行、作息与有限库存；不新增工作站、产量或收费服务'},description:x.description};
 const index=places.filter(p=>p.settlement===s.id&&p.kind!=='seat').indexOf(place);
 const angle=index*0.55,[cx,cy]=s.coordinates,coordinates=[round(cx+0.03*Math.cos(angle)),round(cy+0.03*Math.sin(angle))];
 const parent=place.kind==='home'?place.district:s.id;
 // A generic reviewed name is published under a qualified catalog name and kept as an alias.
 const base={id:place.id,name:place.formalName??place.name,aliases:place.formalName?[place.name]:[],parent,scope:s.id,coordinates,terrain:s.terrain,openHours:[0,1440],owner:null,purpose:{facility:'公共设施',district:'住区',home:'私宅',council:'议事区',store:'存放处'}[place.kind],
  rooms:[],inventory:{},authoredFacts:{...x.authoredFacts,noMechanics:'只登记通行与作息；不新增工作站、产量或收费服务'},description:x.description};
 if(place.kind==='facility'||place.kind==='district')base.access={mode:'public'};
 if(place.kind==='home'){const h=households.find(h=>h.homeLocation===place.id);base.access={mode:'private',requiresConsent:true,residents:h.members};}
 if(place.kind==='council'){base.access={mode:'council',requiresConsent:true,authority:place.authority};}
 if(place.kind==='store'){const t=STORE_SITE[place.id];base.owner=t.owner;
  base.site={owner:t.owner,manager:t.manager,occupants:t.occupants,entryMechanisms:[],mechanisms:[],resources:t.resources,clues:t.clues(x),truths:[],infiltration:t.infiltration};}
 return base;
}

export function buildRoutes(){
 const rows=[];
 for(const s of settlements)rows.push({id:`route_t159_${s.id}`,from:s.from,to:s.id,lengthKm:s.routeKm,terrainMultiplier:1.2,modes:['walk'],closedSeasons:[],toll:0,risk:s.routeRisk});
 for(const p of places.filter(p=>p.kind!=='seat')){const s=settlementOf(p.settlement),from=p.kind==='home'?p.district:s.id;
  rows.push({id:`route_t159_${p.id}`,from,to:p.id,lengthKm:p.kind==='home'?0.02:0.08,terrainMultiplier:1.2,modes:['walk'],closedSeasons:[],toll:0,risk:0});}
 return rows;
}

const ageKey=a=>a<18?'children':a<35?'youngAdults':a<60?'adults':'elders';
export function buildSettlementProfile(s){
 const members=people.filter(p=>p.settlement===s.id),registered={children:0,youngAdults:0,adults:0,elders:0};
 for(const p of members)registered[ageKey(p.age)]++;
 const ageStructure=Object.fromEntries(Object.keys(registered).map(k=>[k,registered[k]+s.pendingAgeStructure[k]]));
 const pending=Object.values(s.pendingAgeStructure).reduce((a,b)=>a+b,0);
 const districts=places.filter(p=>p.settlement===s.id&&p.kind==='district').map(p=>p.name).join('、');
 const facilities=places.filter(p=>p.settlement===s.id&&p.kind==='facility').map(p=>p.name).join('、');
 const bySpecies=Object.entries(s.pendingSpeciesStructure).map(([sp,g])=>{const named=members.filter(p=>p.species===sp).length;return `${s.speciesNames[sp]}${named+g.population}名（具名${named}名，待生成${g.population}名${g.households}户，住${placeById.get(g.districts[0]).name}）`;}).join('；');
 return{id:s.id,parent:s.locParent,population:s.population,householdCount:s.householdCount,residentIds:members.map(p=>p.id),visitors:[],commuters:[],externalRelatives:[],
  facts:[`${s.name}共${s.population}名成员、${s.householdCount}户；登记具名成员${members.length}名${s.registeredHouseholdCount}户，另有${pending}名${s.pendingHouseholdCount}户按稳定种子待生成，不计入当前名册。`,
   `分物种配额：${bySpecies}。`,
   `住区：${districts}；公共设施：${facilities}。`,
   ...s.society.positions.map(x=>`内部立场“${x.name}”：${x.claim}`),
   ...(s.id===YG?['榆根里的穴鼬和林獾都是已经立意、开了灵智的成员；北岗老林里未开灵智的同类另记在野外种群，不计入本聚居地人口。']:['裂炉营的幼体不下矿、不搬运、不服劳役。'])],
  kinship:[],coordinates:s.coordinates,terrain:s.terrain,climate:places.find(p=>p.id===s.id).prose.authoredFacts.climate,
  buildingIds:places.filter(p=>p.settlement===s.id&&p.kind!=='seat').map(p=>p.id),ageStructure,
  registrationMode:'seeded-on-demand',populationSeed:s.populationSeed,registeredPopulation:members.length,pendingPopulation:pending,
  registeredHouseholdCount:s.registeredHouseholdCount,pendingHouseholdCount:s.pendingHouseholdCount,registeredAgeStructure:registered,pendingAgeStructure:structuredClone(s.pendingAgeStructure),
  pendingSpeciesStructure:structuredClone(s.pendingSpeciesStructure)};
}

export function buildBoss(b){
 const x=b.prose;
 return{id:b.id,name:b.name,aliases:b.aliases,monster:b.monster,tier:b.tier,level:b.level,lair:b.lair,territory:x.territoryText,tactics:x.tactics,weakness:x.weakness,drops:[],taming:x.taming,
  intelligence:3,minions:[],actor:b.actor,residence:b.residence,mechanics:b.mechanics,originSeed:x.originSeed,cognition:{goal:'avoid_conflict',territory:b.territory},negotiation:b.negotiation,
  origin:x.origin,lairDescription:x.lairDescription,behavior:x.behavior};
}

export function buildCulture(c){
 const x=c.prose,prose={dailyLife:x.dailyLife,familyAndLaw:x.familyAndLaw,faithAndFestivals:x.faithAndFestivals,voice:x.voice,proverbs:x.proverbs};
 return{id:c.id,name:c.name,aliases:[],scope:'global',category:'culture',region:c.region,anchor:c.anchor,focus:x.focus,naming:x.naming,facts:x.facts,
  references:[c.anchor,c.witness],witness:c.witness,witnessRelation:'可询问相关实践；本人在此聚居地长居',prose,
  description:Object.values(prose).map(v=>Array.isArray(v)?v.join('；'):v).join('\n')};
}

export function buildFaction(o){
 const x=ORG_PROSE[o.id],members=[o.leader,...o.coreMembers];
 const rep=x.reputation,stageEffects=x.stageEffects.map(([effect,requires],i)=>({stage:i+1,effect,requires}));
 return{id:o.id,name:o.name,aliases:[],category:'faction',scope:'global',kind:x.kind,culture:o.culture,region:o.region,contactAnchor:o.settlement,contactMode:x.contactMode,
  foundedYear:o.foundedYear,leader:o.leader,coreMembers:o.coreMembers,
  resources:{treasuryCopper:o.treasuryCopper,memberCount:o.memberCount,assets:x.assets,resourceScope:x.resourceScope,items:structuredClone(o.items)},
  publicGoal:x.publicGoal,privateGoal:x.privateGoal,method:x.method,divisions:x.divisions,offers:x.offers,demands:x.demands,
  reputation:{trusted:{minimum:40,response:rep.trusted},neutral:{minimum:-19,response:rep.neutral},distrusted:{maximum:-20,response:rep.distrusted}},
  relations:o.relations.map(r=>({faction:r.faction,score:r.score,reason:x.relationReason[r.faction]})),
  clock:{id:o.clock.id,name:o.clock.name,intervalDays:1,probability:1,initialStage:0,trigger:x.trigger,stageEffects,counterplay:x.counterplay,
   execution:'已接入势力时钟：每日检查，议题闭合后按议定结果扣公账、分物并传消息',settlement:o.settlement,source:'T159 聚居地议题时钟',cycle:'once',
   stages:structuredClone(o.clock.stages),contact:{location:o.contact,representative:o.leader},...(o.clock.interventions?{interventions:structuredClone(o.clock.interventions)}:{})},
  references:[o.culture,o.settlement,...members,...o.relations.map(r=>r.faction)],prose:structuredClone(x.prose),
  description:Object.values(x.prose).join('\n'),
  publicDescription:`${o.name}活动于${o.region}，公开目标是${x.publicGoal}。行事方式：${x.method}。可提供${x.offers}；${x.demands}。`,descriptionVisibility:'gm_private'};
}

export function buildBatch(){
 return{npcs:people.filter(p=>p.tier==='full').map(buildNpc),residents:people.filter(p=>p.tier!=='full').map(buildNpc),households:structuredClone(households),
  settlementProfiles:settlements.map(buildSettlementProfile),locations:places.map(buildLocation),routes:buildRoutes(),bosses:bosses.map(buildBoss),cultures:cultures.map(buildCulture),
  factions:organizations.map(buildFaction)};
}
export {byId as peopleById,placeById,settlementOf};
