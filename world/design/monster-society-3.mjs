// T162：回汐埠与灰棚集。个体成精沿用 T160/T161，族群觉醒沿用 U11。
export const revision='monster-society-3-v1';
const HX='loc_ms_huixi',GS='loc_ms_huipeng';
const FOX='monster_red_ear_fox',WEASEL='monster_stone_whisker_weasel',OTTER='monster_grey_otter',TORTOISE='monster_plate_back_tortoise';
const GOBLIN='monster_ash_cave_goblin',ORC='monster_split_tusk_orc';
const hx={seat:HX,gate:'site_ms_hx_reed',garden:'site_ms_hx_dew',landing:'site_ms_hx_landing',school:'site_ms_hx_listen',grave:'site_ms_hx_return',
 water:'site_ms_hx_water',land:'site_ms_hx_land',council:'site_ms_hx_council',store:'site_ms_hx_store',home1:'bld_ms_hx_01',home2:'bld_ms_hx_02',home3:'bld_ms_hx_03',home4:'bld_ms_hx_04'};
const gs={seat:GS,gate:'site_ms_gs_gate',scale:'site_ms_gs_scale',repair:'site_ms_gs_repair',kitchen:'site_ms_gs_kitchen',grave:'site_ms_gs_return',
 tents:'site_ms_gs_tents',carts:'site_ms_gs_carts',council:'site_ms_gs_council',store:'site_ms_gs_store',home1:'bld_ms_gs_01',home2:'bld_ms_gs_02',home3:'bld_ms_gs_03'};
const P=Object.fromEntries(['yiheng','qiaosui','xianpu','luchi','yixian','yimo','qiaofu','qiaoyou','xianwen','xianduan','luman','luya','shenge','zheqian','zhenhe','sangou','shengli','shengya','zhewang','zheyou','sanfu','zhenbei','zhenya','sanzhi'].map((n,i)=>[n,`npc_ms_${i<12?'hx':'gs'}_${n}`]));
export const ids={HX,GS,hx,gs,P};
const hierarchy=(id,name)=>[{id:'known-continent',name:'已知大陆片区'},{id:'known-region',name:'已知地区片区'},{id:'known-county',name:'已知郡级片区'},{id,name}];
export const settlements=[
 {id:HX,name:'回汐埠',culture:'culture_ms_huixi',parent:'loc_bs_weiting',parentName:'苇汀村',locParent:'loc_bs',scope:'loc_bs_weiting',coordinates:[31.8,5.5],terrain:'湿地',from:'loc_wild_wt_mist',routeKm:1.8,routeRisk:0,expectedKm:4.1,
  populationSeed:'t162-huixi-1',purpose:'已立意的狐、鼬、獭、龟自愿共居的芦滩精怪之乡',population:48,householdCount:12,registeredHouseholdCount:4,pendingHouseholdCount:8,
  pendingAgeStructure:{children:8,youngAdults:8,adults:16,elders:4},speciesNames:{[FOX]:'赤耳林狐',[WEASEL]:'石须穴鼬',[OTTER]:'灰颈河獭',[TORTOISE]:'叠甲丘龟'},
  pendingSpeciesStructure:Object.fromEntries([[FOX,hx.land],[WEASEL,hx.land],[OTTER,hx.water],[TORTOISE,hx.water]].map(([sp,d])=>[sp,{population:9,households:2,ageStructure:{children:2,youngAdults:2,adults:4,elders:1},districts:[d]}])),
  society:{leader:'boss_ms_huixi',neighbors:{loc_bs_weiting:'中立'},stances:{player:'中立'},meetingPlace:hx.council,
   motions:[{id:'open_bank',name:'是否将空芦棚留给新来立意者'},{id:'reed_trade',name:'是否与苇汀共认芦界并按件换物',opens:'trade'}],
   positions:[{id:'receive',name:'接岸派',members:[P.yiheng,P.xianpu,P.yixian],claim:'给新来立意者留空棚，先问愿不愿留下，再谈怎样分担口粮。',stances:{open_bank:'approve',reed_trade:'approve'},persuasion:15},
    {id:'quiet',name:'静滩派',members:[P.qiaosui,P.luchi,P.luman],claim:'先认清旧有的芦界与粮份，新来的暂住棚外，免得一场汛水冲散存粮。',stances:{open_bank:'reject',reed_trade:'reject'},persuasion:15}],
   supplies:[{item:'item_herb',species:FOX,place:hx.garden,use:'露根圃照看的药草，经纤蒲本人库存交易取得，用于喂灵与借形'},
    {item:'item_fish',species:OTTER,place:hx.landing,use:'河獭沿旧水道捕来的鲜鱼，只按手头库存交换'},
    {item:'item_ration',from:'loc_bs_weiting',place:hx.gate,use:'与苇汀换来的干粮，另在地方组织公账留接岸储备'}]}},
 {id:GS,name:'灰棚集',culture:'culture_ms_huipeng',parent:'loc_bs_sangban',parentName:'桑坂村',locParent:'loc_bs',scope:'loc_bs_sangban',coordinates:[22,4.2],terrain:'平原',from:'loc_sb_path',routeKm:2.4,routeRisk:0,expectedKm:2.6,
  populationSeed:'t162-huipeng-1',purpose:'灰窟哥布林与裂牙兽人共同经营的地上跨族集市',population:72,householdCount:18,registeredHouseholdCount:3,pendingHouseholdCount:15,
  pendingAgeStructure:{children:12,youngAdults:18,adults:24,elders:6},speciesNames:{[GOBLIN]:'灰窟哥布林',[ORC]:'裂牙兽人'},
  pendingSpeciesStructure:{[GOBLIN]:{population:45,households:11,ageStructure:{children:9,youngAdults:14,adults:18,elders:4},districts:[gs.tents]},[ORC]:{population:15,households:4,ageStructure:{children:3,youngAdults:4,adults:6,elders:2},districts:[gs.carts]}},
  society:{leader:'boss_ms_huipeng',neighbors:{loc_bs_sangban:'中立'},stances:{player:'中立'},meetingPlace:gs.council,
   motions:[{id:'open_scale',name:'是否将公秤与换签交各族轮值'},{id:'ore_trade',name:'是否按明签接裂炉矿货而不代收贡粮',opens:'trade'}],
   positions:[{id:'old_sign',name:'守签派',members:[P.shenge,P.zheqian,P.shengli],claim:'公秤继续由熟识绳签的哥布林掌管，矿货要先认清货主再进集。',stances:{open_scale:'reject',ore_trade:'approve'},persuasion:15},
    {id:'shared_scale',name:'共秤派',members:[P.sangou,P.zhenhe,P.sanfu],claim:'会认刻度的各族都可轮值公秤，每次交接把空秤交给下一位看。',stances:{open_scale:'approve',ore_trade:'approve'},persuasion:15}],
   supplies:[{item:'item_flax_cord',species:GOBLIN,place:gs.repair,use:'哥布林修补的绳索，经绳额本人有限库存交易'},
    {item:'item_tool_handle',species:ORC,place:gs.repair,use:'砧禾削出的木柄，经本人库存交易'},
    {item:'item_ration',from:'loc_bs_sangban',place:gs.gate,use:'桑坂换来的干粮，按货换粮，不以通路索贡'}]}}
];

function place(id,kind,name,settlement,description,climate,senses,entryRule,extra={}){return{id,kind,name,settlement,...extra,prose:{description,authoredFacts:{climate,senses,entryRule}}};}
export const places=[
 place(HX,'seat','回汐埠',HX,'回汐埠在苇汀下游雾滩外的回水湾，水岸与高芦台间架着低棚。这里住着已经立意的狐、鼬、獭、龟，水边留给善水的，干岸留给穴居的。居民仍保留本相，借形只是暂时换个样子。新来的先在认岸芦门招呼，不因会说话就能取走别家的粮。','回水湾潮湿，汛时水位上涨',['灰白水痕绕过棚脚','芦叶互擦','鱼鳞气混着湿草气'],'公共岸路可行；私宅与议事棚须当面许可'),
 place(hx.gate,'facility','认岸芦门',HX,'认岸芦门是回汐埠干岸上的两束弯芦，来客把脚上的淤泥蹭去再进。漪衡白天在这里接待外来者，用手边的鲜鱼换盐和干粮。他先问来者想往哪去，再解释哪些是公共岸路。门旁留着空棚的旧芦席，是否给新来者铺开，仍要在议汐棚说定。','干岸略高，雨后仍湿',['弯芦上结着旧水草','芦席卷在门侧','脚印由泥滩转上干土'],'公共入口，鲜鱼只能向漪衡交易'),
 place(hx.garden,'facility','露根圃',HX,'露根圃夹在高芦台与回水湾之间，纤蒲沿湿土种着药草，把能踩的缝隙用碎芦茎标出来。白天她在这里换出自己拣好的药草。听息的野兽留在圃边也会受灵地滋养，觉醒需要逐日积累。圃中的草并非无主，想带走仍须先问她。','背风湿润，午后有浅光',['草根挂着水珠','碎芦茎铺在步道','狐尾扫过叶面'],'公共小径可行，取草须交易或获许可'),
 place(hx.landing,'facility','回汐拆鱼石',HX,'回汐拆鱼石贴着回水湾，平石的边沿被獭爪磨得发亮。漪衡捕回的鱼先在这里清理，再带到认岸芦门交换。漪弦照看石边的杂草，不许鱼骨留在进出水道里。来访者能在石旁歇脚，湿滑的石心通常留给搬鱼的居民。','水边湿滑，风从湾口来',['平石上留着鱼鳞','浅水拍着石边','湿毛气很重'],'公共岸地，鱼货归各自持有人'),
 place(hx.school,'facility','听潮矮台',HX,'听潮矮台是芦台边的一块旧木板，敲穗白天伏在板后，慢慢听来客把话说完。新立意者在这里练习把愿与不愿说清，年长者会等它们停顿。这里没有一敲即会的捷径，也不颁主持仪式的凭据；要做点化，仍须向白石镇已登记的师承求教。','芦墙挡风，木板常潮',['旧板有浅浅爪印','龟甲擦过草席','湾水的声响断续传来'],'公共矮台，教导须双方同意'),
 place(hx.grave,'facility','归汐高岸',HX,'归汐高岸在回汐埠不易被小汛淹到的岸头。亡者依本相埋在干土里，旧芦席压在土上，亲近者沿席边插芦茎。敲穗记得每一处旧土的位置。居民忌讳把亡者的本相拿来取笑，也不以借形后的容貌替换埋葬时的称呼。','高岸较干，风大',['芦茎向湾口倾斜','旧席下露出细土','芦叶拍打席面'],'公共纪念岸，不能掘土取物'),
 place(hx.water,'district','回汐水窝岸',HX,'回汐水窝岸沿浅水弯进去，河獭住在有水口的窝棚，丘龟住在稍高的晒甲土台。漪衡一家与敲穗一家在这里各有私窝。公共岸路绕过窝口，不直穿睡处。夜里水声盖住脚步，来客要在门前出声，不能凭一张通行约钻进窝里。','近水潮湿，土台背风',['窝口挂着旧苇帘','龟爪拖出细沟','水下有断续的气泡'],'公共岸路可行，各家私窝须成年住户许可'),
 place(hx.land,'district','回汐干芦台',HX,'回汐干芦台比水窝岸高，狐与穴鼬把睡窝藏在芦根间。纤蒲一家住草窝，芦迟一家住石窝，窝外空地相通。幼体在成年居民看得到的地方练认芦记，不替外客跑腿。夜里穴鼬出窝，白天狐窝旁只留轻轻的草叶声。','芦根遮阴，土缝干爽',['赤耳尖从芦后露出','须尖沾着细砂','窝口铺着旧干草'],'公共台地可行，睡窝另须住户许可'),
 place(hx.council,'council','议汐棚',HX,'议汐棚的矮顶用旧芦席搭成，傍晚漪衡、敲穗、纤蒲和芦迟在这里谈空棚与芦界。接岸派想给新来立意者留住处，静滩派担心存粮和汛水。敲穗听完双方再将芦记放稳，外客想进棚须先在听潮矮台向她取得当面许可。','棚内背风，地上垫干芦',['成束芦记放在地上','矮顶透着晚光','说话前先有一阵沉默'],'议事区，须敲穗当面许可',{authority:P.qiaosui}),
 place(hx.store,'store','回汐存芦棚',HX,'回汐存芦棚靠着认岸芦门，芦席包住换来的干粮。漪衡看管棚里的储备，棚壁留着空棚去留的芦记。接岸派与静滩派都在这里核过粮份，尚未议定以前，空席仍卷着。绕棚可走公共岸路，进棚取粮要先问漪衡。','高脚席架较干',['席包边沿扎着芦结','棚壁留着旧水线','卷席压在空架上'],'存粮有主，须看管者许可'),
 place(GS,'seat','灰棚集',GS,'灰棚集在桑坂园外路口向西的平地上，灰窟哥布林把棚顶涂上炉灰防潮，裂牙兽人把旧车停在外圈。这里是地上集市，白天看空秤、认绳签，再按各自库存换货。哥布林不按炭阶的共灶份额分货，每棚自己负担差错，公秤由谁轮值正闹着分歧。','平地多风，棚顶雨后转深灰',['绳签拍在棚柱上','空秤轻轻摆动','修绳的麻屑散在地上'],'公共集路可行，私棚与议签棚另须许可'),
 place(gs.gate,'facility','灰棚迎车口',GS,'灰棚迎车口在桑坂来路上，地面压着旧车辙。绳额白天在棚口换出自己修好的绳索，先把整根绳铺给客人看。过路不交贡粮，来换矿货的也要先说清货主。傍晚货主收拢棚帘，各家的货跟着持有人收回，不在路口留下任取的公货。','无遮拦，风直穿集口',['麻绳铺在旧木板上','车辙积着浅灰','棚帘下端磨得发毛'],'公共入口，贸易只动卖方实际库存'),
 place(gs.scale,'facility','灰棚公秤台',GS,'灰棚公秤台搭在集路中央，空秤先亮给双方看，货放下以后才递绳签。折签白天守着旧签，怕不会读签的外族误认货主；散钩则想让各族轮值。秤台是公共地方，这些习惯不另收一份称量钱，也不能替任何人承诺货的成色。','台面干燥，侧面进风',['秤盘底有磨亮的圈','绳签的毛头朝同一边','折签把空盘抬给人看'],'公共设施，公秤不代替当事人同意'),
 place(gs.repair,'facility','灰棚补具檐',GS,'灰棚补具檐下堆着修绳与削柄留下的碎料。兽人工匠砧禾白天在这里削小工具木柄，散钩把破绳拆开重新认结。砧禾只换自己库存里的成品，借用工具要另问工具主人。檐下的断签装在一只旧篓里，谁都看得到，谁也不能随手改成自己的货签。','檐下避雨，午后有侧光',['木屑落在麻屑上','旧柄靠着棚柱','刀背敲木的声音很闷'],'公共檐地，工具与成品有主'),
 place(gs.kitchen,'facility','灰棚候饭灶',GS,'灰棚候饭灶供收摊后歇脚，锅边摆着各棚自己带来的食物。兽人和哥布林各认自己的袋子，愿意分食才推到旁人面前。幼体由同棚成年者照看，不替陌生货主看摊。灶旁谈起炭阶的共灶分份，有人羡慕安稳，有人说自己认货签更踏实。','灶边温暖，棚外多风',['锅沿凝着水汽','粮袋各系不同绳头','碗勺碰在一起'],'公共歇脚处，食物须本人同意才能取'),
 place(gs.grave,'facility','灰棚归签坡',GS,'灰棚归签坡在车棚外的缓坡，亡者安葬后，亲近者把他的旧货签拆开，绳留给家人，签埋入土中。兽人也可沿用自己的送葬话，集上不强改。这里忌把亡者的签挂回秤台冒充旧债，折签有时来辨认被风吹出的碎木片。','坡地干燥，风吹草低',['细绳系在枝头','旧签半埋土里','草根间有淡灰'],'公共纪念坡，不能挖签冒认债务'),
 place(gs.tents,'district','灰棚矮棚排',GS,'灰棚矮棚排是哥布林住的地方，低棚之间留着能推小车的过道。绳额一家、折签一家和散钩住在这里，睡棚与货摊分开。孩子在棚帘内学认自己的绳结，成年者收摊才带他们出来。过道可走，门帘后的睡处要先问住户。','低棚挡风，雨后有灰味',['门帘只到来客膝头','绳结挂在低处','过道被小车磨平'],'公共过道可行，私棚须成年住户许可'),
 place(gs.carts,'district','灰棚卸车圈',GS,'灰棚卸车圈围着停用的旧车，砧禾一家住在加高的车棚里。车轮旁留着哥布林搬货时站脚的位置，兽人收回长柄工具才让小车经过。这里不靠体格大小分货，谁修好的柄归谁持有。外客能穿过圈外集路，睡棚与工具箱仍归住户照管。','外圈风大，车底避雨',['旧轮辐缠着防滑绳','长柄靠在车底','草席压着车棚边缘'],'公共圈外路可行，车棚内部须住户许可'),
 place(gs.council,'council','灰棚议签棚',GS,'灰棚议签棚比别的棚高，傍晚绳额、折签、砧禾和散钩能坐在一起看签。争论的是公秤能否轮值，以及裂炉矿货怎样按明签进入。折签负责看门，外客进棚要先问她。公账备下的修绳与木柄只有议定后才分，不因喊得响就先给一方。','高棚通风，地面铺碎木',['断签摆在席边','长短凳子围成一圈','散钩说话时拨弄绳头'],'议事区，须折签当面许可',{authority:P.zheqian}),
 place(gs.store,'store','灰棚公货柜',GS,'灰棚公货柜设在迎车口内侧，绳额保管议签棚留下的修绳与木柄储备。柜门的绳结完整，断下来的旧签收在旁边。守签派与共秤派尚未议定轮值以前，柜里的货不提前分给任何一棚。柜外是公共集路，打开柜门要先问绳额。','棚内干燥，灰顶挡雨',['柜门绳结收得紧','断签压在木片下','柜脚垫着平石'],'公货有看管者，取货须许可')
];

const fullSeeds=[
 [P.yiheng,HX,OTTER,'漪衡',46,'男','接待换鱼','埠头',hx.home1,hx.gate,'把湿爪先在芦席上抹干，才指给来客看路。','空芦棚该不该给新来的立意者，他想先把粮份讲明。',['耐心','爱留余地'],{item_fish:12,item_ration:4},'把空棚留给新来者','先认岸，再认话。'],
 [P.qiaosui,HX,TORTOISE,'敲穗',91,'女','记芦界','长老',hx.home2,hx.school,'甲背的旧水痕很浅，说话前会把下颌放稳。','上回涨水的位置仍在，她怕大家只记得空棚不记得水。',['沉稳','固执'],{},'先守旧芦界','这道水痕还在。'],
 [P.xianpu,HX,FOX,'纤蒲',29,'女','照看药圃','药圃管事',hx.home3,hx.garden,'左耳尖有一道旧缺口，分草时总先闻叶背。','露根圃的步道被踩宽了，她想让新来者学会认草根。',['细心','急于帮忙'],{item_herb:30},'把灵地照看好','别拔根，先看叶。'],
 [P.luchi,HX,WEASEL,'芦迟',38,'男','补芦棚','持不同主张者',hx.home4,hx.store,'须尖夹着干砂，说到粮份时尾巴绷得很直。','他补过的棚脚还留水痕，想在接人以前先留足干粮。',['谨慎','记旧账'],{},'先查棚脚和存粮','棚能补，湿粮难救。'],
 [P.shenge,GS,GOBLIN,'绳额',44,'男','修绳换货','集头',gs.home1,gs.gate,'额头勒着退色绳圈，讲价前会把绳头解开给人看。','散钩要改公秤轮值，他担心错签会砸掉集市的名声。',['讲信用','恋旧'],{item_flax_cord:16},'让来客认清每一张货签','空手看秤，带货认签。'],
 [P.zheqian,GS,GOBLIN,'折签',73,'女','看秤存签','长老',gs.home2,gs.scale,'右手只戴一只旧护腕，折断的签也收得整齐。','有些旧签磨得认不出结尾，她不肯凭印象说是谁的。',['认真','不肯认输'],{},'把旧签的来路认清','我记不清，就先搁着。'],
 [P.zhenhe,GS,ORC,'砧禾',36,'男','削柄修具','生产管事',gs.home3,gs.repair,'掌心有厚茧，拿起小木柄时却只用指尖。','他想试值公秤，却怕旁人只见他的个头不听他读签。',['手稳','拘谨'],{item_tool_handle:18},'让各族按手艺轮值','柄长短，手知道。'],
 [P.sangou,GS,GOBLIN,'散钩',26,'女','拆绳认结','持不同主张者',gs.home2,gs.repair,'腰侧挂着弯钩，说到不平处就把绳结一拉一松。','公秤轮值总轮不到砧禾，她要在议签棚把这件事说完。',['直率','性急'],{},'把公秤交给会认刻度的人','先给他看空秤。']
];
const rosterSeeds=[
 [P.yixian,HX,OTTER,'漪弦',32,'女','照看水道',hx.home1,'把鱼骨从进出水道里拣净。','颈侧毛里常夹着碎芦叶。'],[P.yimo,HX,OTTER,'漪沫',12,'男','随成年居民认岸',hx.home1,'认清哪一处水口回自己的窝。','灰颈毛还蓬着细绒。'],
 [P.qiaofu,HX,TORTOISE,'敲伏',47,'男','晒席',hx.home2,'雨后把湿席翻到向阳的一面。','甲缘带着一点干草。'],[P.qiaoyou,HX,TORTOISE,'敲幼',14,'女','随成年居民认芦',hx.home2,'别把归汐高岸的芦记认错。','背甲上的浅纹还很清楚。'],
 [P.xianwen,HX,FOX,'纤纹',33,'男','看圃道',hx.home3,'补上被踩断的步道芦茎。','赤耳外侧有一撮白毛。'],[P.xianduan,HX,FOX,'纤短',10,'女','随成年居民认草',hx.home3,'学着只闻叶背，不拔草根。','尾尖沾着草屑。'],
 [P.luman,HX,WEASEL,'芦慢',42,'女','织芦席',hx.home4,'把晒透的芦叶留给补棚。','须尖的砂比芦迟浅一些。'],[P.luya,HX,WEASEL,'芦芽',13,'男','随成年居民认窝',hx.home4,'记住干芦台每一家窝口的芦结。','细尾总在草叶后晃动。'],
 [P.shengli,GS,GOBLIN,'绳砾',35,'女','补棚',gs.home1,'把风掀起的棚角系牢。','左腕缠着一段旧麻绳。'],[P.shengya,GS,GOBLIN,'绳芽',11,'女','随成年居民认签',gs.home1,'认清自己睡棚的绳结。','指尖常沾着棚灰。'],
 [P.zhewang,GS,GOBLIN,'折网',31,'男','整理断签',gs.home2,'把散落的断签送回旧篓。','鼻梁上有一道浅疤。'],[P.zheyou,GS,GOBLIN,'折幼',9,'男','随成年居民认棚',gs.home2,'收摊后再到公共过道上玩。','护腕大得露出半截指头。'],
 [P.sanfu,GS,GOBLIN,'散缚',28,'男','拆旧绳',gs.home2,'把还能用的麻股分出来。','掌边挂着细麻屑。'],[P.sanzhi,GS,GOBLIN,'散枝',19,'女','看摊帘',gs.home1,'在大风前把空棚帘卷起。','一侧耳沿比另一侧薄。'],
 [P.zhenbei,GS,ORC,'砧背',40,'女','搬修具',gs.home3,'把修好的柄与坏柄分开放。','肩头的衣布补得很厚。'],[P.zhenya,GS,ORC,'砧芽',12,'男','随成年居民认木',gs.home3,'记住哪篓木料不能伸手碰。','短牙刚从唇边露出。']
];
const homes=[[HX,hx.home1,hx.water,'漪家水窝'],[HX,hx.home2,hx.water,'敲家甲窝'],[HX,hx.home3,hx.land,'纤家草窝'],[HX,hx.home4,hx.land,'芦家石窝'],[GS,gs.home1,gs.tents,'绳家矮棚'],[GS,gs.home2,gs.tents,'折家矮棚'],[GS,gs.home3,gs.carts,'砧家车棚']];
export const households=homes.map(([s,h],i)=>({id:`house_t162_${i+1}`,settlement:s,homeLocation:h,members:[],tenure:'同住共居，不认定个人产权；进入须成年住户当面许可。'}));
// Household membership is shared by residence and population publication.
for(const h of households)h.members=[...fullSeeds.filter(r=>r[8]===h.homeLocation),...rosterSeeds.filter(r=>r[7]===h.homeLocation)].map(r=>r[0]);
for(const [s,h,d,name]of homes){const names=households.find(x=>x.homeLocation===h).members.map(id=>[...fullSeeds,...rosterSeeds].find(r=>r[0]===id)[3]);places.push(place(h,'home',name,s,`${name}在${s===HX?'回汐埠的芦根间':'灰棚集的睡棚一侧'}，住着${names.join('、')}。门前的过道留给来往的人，睡处用旧席隔开，换下的席子靠在里侧慢慢晾干。同住的成年者照看幼体，也各自认清带回来的东西。来客可以在门前招呼，进屋仍须成年住户当面许可。`,'席内背风，雨后要晾晒',['旧席隔开睡处','门边留着脚印','草叶在门口轻响'],'私宅，须成年住户当面许可',{district:d}));}
export const people=[];
for(const r of fullSeeds){const[id,s,sp,name,age,sex,occupation,role,home,workplace,feature,concern,traits,inventory,aim,saying]=r;
 const peers=fullSeeds.filter(q=>q[1]===s&&q[0]!==id),seat=settlements.find(x=>x.id===s),council=s===HX?hx.council:gs.council;
 const homeRow=homes.find(h=>h[1]===home),house=households.find(h=>h.homeLocation===home);
 const first=peers[0],second=peers[1];
 const memory=`上次在${s===HX?'认岸芦门':'灰棚公秤台'}，${fullSeeds.filter(q=>q[1]===s).map(q=>q[3]).join('、')}把${s===HX?'空席铺开又卷回，最后约好在议汐棚再谈空棚':'空秤亮给彼此看，最后约好在议签棚再谈轮值'}。`;
 people.push({id,settlement:s,species:sp,name,age,sex,occupation,role,tier:'full',home,household:house.id,workplace,coins:s===GS?40:12,inventory,services:Object.keys(inventory).length?['trade']:[],ttsVoice:sex==='女'?'zh_female_mature_01':'zh_male_low_01',facts:[`${name}是${seat.name}的${role}，以本相生活。`],
 schedule:[[0,360,home,'休息'],[360,1080,workplace,occupation,Object.keys(inventory).length?['trade']:[]],[1080,1140,council,'议事'],[1140,1440,home,'休息']],
 prose:{traits,visibleFeature:feature,appearance:[feature,s===HX?'脚边常带着芦叶。':'衣边沾着棚灰。'],currentConcern:concern,
 voice:{register:name==='敲穗'?'话慢，停顿很长':name==='散钩'?'短句多，着急时字跟着绳头跳':'声音不高，先等对方收声',accent:s===HX?'尾音像隔着一层芦叶':'末字收得短',habits:[name==='绳额'?'开口前先解绳头':name==='纤蒲'?'说话时轻捻叶背':'先看看对方手里的东西'],samples:[saying,concern,`${first[3]}的话也听完。`]},
 personality:{values:[aim,'答应的事先做完'],flaws:[name==='散钩'?'有时抢在别人把话说完以前开口':name==='敲穗'?'把旧汛水的担心带进每次议事':'熟人的反对更难听进去']},
 familyNotes:`${name}与${house.members.filter(x=>x!==id).map(x=>[...fullSeeds,...rosterSeeds].find(q=>q[0]===x)[3]).join('、')}同住${homeRow[3]}；回去时会先看门边的席子是否淋湿。`,
 relationships:[{with:first[0],type:'共同议事',trust:10,affection:4,note:`${first[3]}与他一同看过${s===HX?'空棚和旧水痕':'空秤与断签'}，分歧一直留到现在。`},{with:second[0],type:'同地往来',trust:8,affection:5,note:`${second[3]}记得上回的争论，${name}愿意等对方把打算说完。`}],
 memorySeeds:[{id:`memory_t162_${s}_meeting`,event:memory,location:s===HX?hx.gate:gs.scale,salience:5,knownBy:fullSeeds.filter(q=>q[1]===s).map(q=>q[0]),reliability:'亲历'},
 {id:`memory_t162_${id}`,event:`${name}曾在下雨的夜里守着${homeRow[3]}的破席，天亮才发现雨水只从一处旧折痕漏下。`,location:home,salience:3,knownBy:[id],reliability:'个人回忆'}],
 goals:[[aim,[`与${first[3]}再谈一次`,s===HX?'到岸边核对旧芦记':'把旧签摆在空秤旁逐张核对']],[concern,[`听听${second[3]}的打算`,'在议事时讲清自己的理由']],[`让${seat.name}的幼体认得回家的路`,['带同住者看门前的记号','把受潮的旧席换到干处']]],
 fears:[s===HX?'汛水把住处和存粮一起泡坏':'一张错签让来客再也不信集上的话'],redLines:[s===HX?'不能替立意者答应归属':'不能替货主改签','幼体不替外客做工'],
 secrets:[{content:`${name}私下怕${first[3]}会把分歧当成不再往来的理由，因而一直没提自己昨晚的犹豫。`,knownBy:[id]}],
 knowledge:{known:[{fact:`${seat.name}的私宅须成年住户当面许可。`,source:home,reliability:'长居亲历'},{fact:concern,source:workplace,reliability:'本人打算'}],unknown:[`${first[3]}是否愿意让一步？`,'下次来访者愿意带什么交换？']},
 opinions:{factions:s===HX?'苇汀来客应逐个听过，不能把一村人算成一种心思。':'裂炉有自己的分粮办法，灰棚仍按各自的货签认货。',magic:s===HX?'借个形貌不等于换了一个人。':'法术不能替物主认签。',adventurers:'肯停步听话的人，可以把事情谈清。',neighbors:[{with:first[0],view:`${first[3]}记事的方法与我不同。`},{with:second[0],view:`${second[3]}会把该做的事留下记号。`}]},
 towardPlayer:{baseline:{trust:0,affection:0},raises:['先问物主再伸手','耐心听完分歧'],lowers:['闯进私宅','替别人答应条件'],attitude:'愿在公共地方听来意。'},
 behaviorRules:{bargaining:Object.keys(inventory).length?'只换本人手头的货，卖完就停。':'手头没有可售货，不代别人许诺。',honesty:'不清楚的就说没看见。',risk:'遇险先护住同住幼体。',threatResponse:'呼叫成年邻居，留出退路。',bribeResponse:'不能靠送礼替别人改议事的说法。'},
 ...(Object.keys(inventory).length?{serviceWhat:'本人有限库存中的物品'}:{}),hooks:[concern,aim],notes:`${seat.name}的${role}，白天在${places.find(x=>x.id===workplace).name}，傍晚到议事处。`,
 description:`${name}是${seat.name}的${role}。${feature}${concern}白天可以在${places.find(x=>x.id===workplace).name}找到本人，傍晚转到议事处。${saying}`,
 portraitPrompt:`原创幻想非人居民${name}，保留${sp}本相，${feature}${s===HX?'芦湾湿岸':'灰顶地上市集'}背景，无文字。`}});
}
for(const[id,s,sp,name,age,sex,occupation,home,concern,feature]of rosterSeeds)people.push({id,settlement:s,species:sp,name,age,sex,occupation,home,household:households.find(h=>h.homeLocation===home).id,tier:'roster',prose:{traits:[age<18?'好奇':'踏实'],currentConcern:concern,visibleFeature:feature}});

const rulesText={
 conditions:[
  {id:'age_experience',name:'年岁与随人经历',text:'年岁过七百二十日才开始计积累，最多四十分；受照料并与照料者同处的经历每日一分、最多二十分。两者相加不足立意所需的一百分，仍须有灵气来源。'},
  {id:'spirit_land',name:'灵地滋养',text:'普通野兽在露根圃、芦衡观或止波寺停留，每日得两分；只看一眼、反复观察不长进度。灵地提供滋养，不赋予所有权。'},
  {id:'spirit_item',name:'喂食灵物',text:'登记的药草是灵物，每日喂一份实际库存可得十分，同日不能叠加；物品耗尽即不能再喂。'},
  {id:'mentor',name:'有资格的点化',text:'先向白石镇已有师承入门并取得灵觉主持资格，点化每次一小时、每日一次、得二十五分。一次点化不会造出整乡，也不改变九阶战力。'}
 ],
 stages:[
  {id:'tingxi',name:'听息',text:'积累达到三十分会辨听称呼，尚不能以同意结缘，不等于已经可以交谈或借形。'},
  {id:'liyi',name:'立意',text:'积累达到一百分能表达愿与不愿，原宠物归属解除；有实际往来后可自愿结缘、随行、留守或交谈。既有身体、伤势与生态来源保留，修习走逐日传授。'},
  {id:'borrow_form',name:'借形',text:'立意后至少修习三次，有灵觉主持资格者再耗三份药草、修习两小时传授借形；每次使用耗一份药草和半小时，形貌持续六小时，可选人形。身体与战力不变，到时散形，可提前恢复本相。'}
 ],
 settlement:'回汐埠先有四十八名常住者，与野生种群分开。新增结缘者须本人到场、自愿留居，每九十日检查一次，可并入登记的精怪之乡；在其他栖地结群须至少两名自愿成员且口粮足够，不满足则保持游居。原生态转出的个体不回填野生数量，死亡或离开不凭空补一只。'
};
export const routeRules=rulesText;
export function applySpiritRules(rules){const r=structuredClone(rules);r.wildlifeAwakening.spiritLands=[...r.wildlifeAwakening.spiritLands.filter(x=>x.location!==hx.garden),{location:hx.garden,pointsPerDay:2}];r.wildlifeAwakening.society.homes=[...new Set([...r.wildlifeAwakening.society.homes,HX])];
 // A3-内容1：组织原文的公共储备；治理首长沿现有公库来源读取现任首领。
 r.questSources.funds={...r.questSources.funds,[HX]:'faction_ms_huixi',[GS]:'faction_ms_huipeng'};return r;}
export const cultures=[
 {id:'culture_ms_huixi',name:'回汐认岸俗',settlement:HX,anchor:HX,witness:P.qiaosui,region:'苇汀下游雾滩外',prose:{focus:'保留本相、自愿认岸的精怪共居',naming:'自取一声易认的称呼，同窝者常共用起首音；并不因此认定血缘。',facts:['回汐埠的居民已经立意，野外未立意的同类另记生态。','苔灯坞的猎道传来的消息可在认岸芦门打听，远方砾耳社会仍独立。'],
 dailyLife:'獭在水边拆鱼，龟在高岸晒席，狐看草根，穴鼬补芦棚。居民多以本相过日子，借形后仍认原来的称呼。新来的先说愿不愿留，空棚是否接人由议汐棚商量；接岸派和静滩派都要为口粮留余地。',
 familyAndLaw:'同窝照看幼体，幼体不替外客做工。住区岸路公共，睡窝要成年住户许可；有人想走，不能以养过它为由扣下。结缘指互助往来，不认归属，也不代替本人表达。',
 faithAndFestivals:'小汛退去时，居民沿旧水痕换芦记，给湿席找干岸。亡者依本相葬在归汐高岸，以旧芦席压土，亲近者插芦茎。忌把亡者的本相当笑话，忌用借形的容貌冒认别人。',
 voice:'水边的短芦记辨岸路，高处的长芦记辨旧水线；口信仍由本人慢慢讲。敲穗停顿长，纤蒲常先请人看叶背，芦迟说粮时总看棚脚。',proverbs:['水退了，痕还在。','先认岸，再认话。','湿席别卷进干席。','借了形，仍认旧名。','芦根不能替脚答应。','空棚也要留粮。','听完停顿才接话。','窝前招呼，窝里等允。','分草先看根。','想走的留一条干路。']}},
 {id:'culture_ms_huipeng',name:'灰棚明签俗',settlement:GS,anchor:GS,witness:P.zheqian,region:'桑坂园外平地',prose:{focus:'地上集市以货主绳签认货，各棚自负差错',naming:'常用绳结、手艺或旧工具给自己取名；同棚共住不推定婚配。',facts:['灰棚的哥布林住地上低棚，白天认签换货。','炭阶按共灶分份，灰棚按各自货签认货；灰棚不向过路者索贡。','裂炉矿货可按明签来换，接赭牙诸部矿道仍须各地同意。'],
 dailyLife:'空秤先给双方看，绳签随货主收回；修绳、削柄的成品归持有人，议签棚的储备另记公账。白天开摊，傍晚看签，睡棚与货摊分开。兽人工匠砧禾想试值公秤，哥布林散钩替他主张，折签怕错签要自己担责。',
 familyAndLaw:'幼体随成年居民认棚认结，不替陌生货主看摊。公路可走，私棚须住户许可。货签只辨货主，不替本人许约；共食先问粮袋主人，体格大的也不能拿走别人的份。',
 faithAndFestivals:'换灰顶时，各棚留一段旧绳，提醒自己修过哪块漏处。亡者葬在归签坡，旧货签拆开，绳留家人，签埋土里。各族保留自己的送葬话，忌把亡者的签挂回公秤冒认旧债。',
 voice:'哥布林用绳签的结尾传货主的记号，当面才认定要换什么；兽人常指着木柄先说用途。折签宁肯说记不清，散钩急时拉松绳结；地上集市不用炭阶炉灰掌印作分粮凭据。',proverbs:['空秤先亮。','签随货主走。','绳长也有头。','断签不接旧债。','修好的柄，先问谁做。','棚低，话别压低。','麻股分清再搓。','大手也认小刻度。','收帘先认人。','灰顶漏处自己补。']}}
];

const issue=(s,status,extra={})=>({kind:'society_issue',settlement:s,issue:s===HX?'new_bank':'scale_shift',status,...extra});
export const organizations=settlements.map((s,i)=>{const isHX=i===0,lead=isHX?P.yiheng:P.shenge,core=isHX?[P.qiaosui,P.xianpu]:[P.zheqian,P.zhenhe],motion=isHX?'open_bank':'open_scale',item=isHX?'item_ration':'item_flax_cord',contact=isHX?hx.gate:gs.gate;
 return{id:isHX?'faction_ms_huixi':'faction_ms_huipeng',name:isHX?'回汐认岸议':'灰棚明签会',settlement:s.id,culture:s.culture,region:isHX?'苇汀下游雾滩外':'桑坂园外平地',leader:lead,coreMembers:core,foundedYear:isHX?-26:-18,memberCount:isHX?10:12,treasuryCopper:40,items:{[item]:30,...(!isHX?{item_tool_handle:24}:{item_herb:12})},contact,relations:[],
 clock:{id:isHX?'clock_ms_huixi':'clock_ms_huipeng',name:isHX?'空棚接岸之争':'公秤轮值之争',stages:[
 {id:'raise',name:'开议',condition:{kind:'motion',id:`society_motion:${s.id}:${motion}`,statuses:['议事中','通过','否决']},cost:{items:{[item]:2}},effect:issue(s.id,'已开议')},
 {id:'decide',name:'按议定分物',condition:{kind:'motion',id:`society_motion:${s.id}:${motion}`},cost:{items:{[item]:2}},effect:issue(s.id,'已按议定分物',{motion,outcomes:{'通过':{result:isHX?'空棚留给新来立意者':'各族轮值公秤',cost:{items:{[item]:4}},shares:[{to:isHX?P.xianpu:P.zhenhe,item,quantity:4}],news:[{target:s.parent,act:'aid'}]},'否决':{result:isHX?'空棚暂不接人':'公秤仍由旧签手值守',shares:[{to:lead,item,quantity:2}]}}})},
 {id:'settle',name:'落实一季',condition:{kind:'always'},cost:{items:{[item]:2}},effect:issue(s.id,'本季安排已落实')}],interventions:[{id:`${s.id}_pause`,stage:'decide',location:contact,minutes:60,attribute:'魅力',difficulty:15,effect:'pause'},{id:`${s.id}_resume`,stage:'decide',location:contact,minutes:30,effect:'resume'}]}};});
export const ORG_PROSE=Object.fromEntries(organizations.map((o,i)=>[o.id,{kind:'聚居地议事',contactMode:`白天在${i===0?'认岸芦门找漪衡':'灰棚迎车口找绳额'}当面谈。`,assets:i===0?'旧芦棚、接岸储备与认岸芦记':'公秤、断签篓与公货柜',resourceScope:'公账物资与居民本人库存分开，未议定不预分。',publicGoal:i===0?'给常住者和新来者讲清住处与粮份':'让各族货主认清每次换出的东西',privateGoal:i===0?'漪衡担心敲穗不再信任他，想保住接岸以后仍能共议的关系。':'绳额担心错签损坏名声，想让改制以后仍有人为每张签负责。',method:'在议事处由到场成年成员表态，首领闭合，再按结果扣公账分物。',divisions:i===0?'接岸派主张留空棚，静滩派要先守芦界和粮份。':'守签派怕轮值错签，共秤派主张按手艺轮值。',offers:'公共地点接触、有限库存贸易与议题调停',demands:'不闯私宅，不替本人许诺，不先取公账物资',reputation:{trusted:'愿意把旧记号的来路讲清。',neutral:'先在公共入口谈来意。',distrusted:'收起货物，只答已公开的事。'},relationReason:{},trigger:'对应议题开议后推进，未开议不扣公账。',stageEffects:[['开议扣公账两份物资','议题已开议'],['扣两份物资，再按结果扣额外物资与分给居民','议题通过或否决'],['再扣两份物资落实一季','上一阶段已完成']],counterplay:'可在公共入口请求暂缓或恢复，暂缓须魅力检定。',prose:{
 conduct:i===0?'认岸议在议汐棚听空棚之争，接岸派要给新来者留一处干岸，静滩派先看旧水痕和粮份。双方在场表达以后，漪衡闭合议题。公账的干粮先供商议与落实，议定分出的粮进入居民本人库存，不从来客的包里扣。':'明签会在议签棚谈公秤轮值，守签派要求认签的人担责，共秤派希望兽人工匠也能值秤。绳额闭合议题以后才动公货柜的储备，修绳与木柄各有来源，居民私货仍留在本人手里，过路来客不因此交贡。',
 internalLife:i===0?'漪衡私下怕敲穗把接岸看成忘了旧汛，敲穗却更怕一场水把所有人的席包一起泡坏。纤蒲愿教新来者认草根，芦迟盯着棚脚。这里的分歧关乎住处与粮份，不因谁会借形就让谁多一份。':'绳额私下担心失去每张签都能找回货主的旧办法，折签宁肯慢也不肯凭印象认债。砧禾会削细柄，却在众人面前不善争辩；散钩说得快，常把他的沉默当成需要代说的理由。',
 playerEncounter:i===0?'来客白天可在认岸芦门见漪衡，也能到露根圃向纤蒲买药草。若要替双方传话，先分别听过接岸与静滩的说法。进议汐棚须敲穗许可，在入口请求暂缓仍有时间代价，粮份不会因传话就凭空多出。':'来客白天能在迎车口换绳，也能在补具檐向砧禾买木柄。想看轮值之争可先到公秤台听折签，再找散钩。进议签棚须折签许可，提出暂缓可给双方留时间，但不能拿走公货柜中的储备。'}}]));

export const bosses=settlements.map((s,i)=>{const p=people.find(p=>p.id===(i===0?P.yiheng:P.shenge)),lair=i===0?hx.gate:gs.gate;return{id:s.society.leader,name:p.name,aliases:[],actor:p.id,monster:p.species,tier:1,level:i===0?5:20,lair,settlement:s.id,history:[`${p.name}由本地常住成年者推为接待来客的首领。`],territory:places.filter(x=>x.settlement===s.id&&!['seat','home','council','store'].includes(x.kind)).map(x=>x.id),
 negotiation:{stock:Object.entries(p.inventory).map(([item,quantity])=>({item,quantity})),accepts:['item_salt','item_ration']},residence:{id:i===0?'lair_ms_huixi':'lair_ms_huipeng',name:i===0?'认岸芦门座':'迎车口绳座',location:lair,replacementSpecies:[],vacancyDays:30,minionCount:0},
 mechanics:{adaptation:{tactics:['armed','unarmed'],threshold:2,perStep:0.1,maximum:0.3},weaknesses:[{tactic:'armed',requiresStatus:'dazzle',ignoreAdaptation:true}],abilities:[{id:`ability_t162_${i}`,every:4,belowHpPercent:50,effectSpec:{kind:'status',status:'fear',power:1},duration:1}]},
 prose:{territoryText:`${s.name}的公共入口、设施与住区过道`,tactics:['适应持械与徒手，半血时每第四次命中反击附加一点恐惧、最多一分钟。'],weakness:'未消耗的眩光干扰下，持械攻击绕过适应。',taming:'已立意或具灵智的首领不能驯服，只能交涉。',originSeed:`${p.name}在${s.name}长居，由常住成年者推为接待来客的首领。`,origin:`${p.name}由常住成年者推为接待来客的首领，处理入口贸易和议事闭合；${p.prose.currentConcern}`,lairDescription:`${p.name}白天在${places.find(x=>x.id===lair).name}见来客，货只按本人库存交换，傍晚到议事处。`,behavior:`${p.name}能谈互不攻击、贸易、朝贡或通行约；通行只覆盖公共地点，私宅、存物处和议事区另须当面许可。贸易是否可立另看内部议题；对聚居地成员发起交锋会令当地敌对。生命不高于一半时每第四次命中反击附加一点恐惧、最多一分钟；未消耗眩光下持械绕过适应。`}};});

const day=rows=>rows.map(([start,end,location,activity,services=[]])=>({start,end,location,activity,services}));
const schedule=rows=>{const d=day(rows);return{default:d,market:structuredClone(d),rest:structuredClone(d),restDays:[],seasonal:{}};};
const goals=(prefix,rows)=>Object.fromEntries(['short','mid','long'].map((k,i)=>[k,[{id:`${prefix}_${k}`,content:rows[i][0],progress:0,deadlineDay:[30,180,720][i],resources:[{kind:'协商',description:'须当事人另行同意的空闲时辰',availability:'unverified',grantsInventory:false}],steps:rows[i][1].map(content=>({content,status:'pending'}))}]]));
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
  schedule:schedule(p.schedule),relationships:x.relationships,memorySeeds:x.memorySeeds,goals:goals(`goal_t162_${p.id.replace(/^npc_ms_/,'')}`,x.goals),
  fears:x.fears,redLines:x.redLines,secrets:x.secrets,knowledge:x.knowledge,opinions:x.opinions,towardPlayer:x.towardPlayer,behaviorRules:x.behaviorRules,
  serviceCatalog:x.serviceWhat?[{kind:'trade',what:x.serviceWhat,price:{mode:'engineQuote'},unlocksService:false}]:[],hooks:x.hooks,ttsVoice:p.ttsVoice,portraitPrompt:x.portraitPrompt,notes:x.notes,description:x.description};
}

const round=n=>Math.round(n*1000)/1000;
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
 // A3-内容1：与正式数据同一来源。所有权属于组织，看管与进门许可仍由原人物负责。
 if(place.kind==='store'){
  const manager=s.id===HX?P.yiheng:P.shenge,owner=s.id===HX?'faction_ms_huixi':'faction_ms_huipeng';
  base.owner=owner;base.site={owner,manager,occupants:[manager],entryMechanisms:[],mechanisms:[],resources:[],clues:[],truths:[],infiltration:{minutes:30,check:{attribute:'敏捷',difficulty:15},damage:3}};
  base.authoredFacts.ownershipBasis=s.id===HX?'A3-内容1：world/lore/factions.json#faction_ms_huixi.resources 列有旧芦棚与接岸储备；漪衡为看管者，公账与本人库存分开。':'A3-内容1：world/lore/factions.json#faction_ms_huipeng.resources 列有公货柜；绳额为看管者，分物仍须议定。';
 }
 if(place.id===gs.scale){base.owner='faction_ms_huipeng';base.authoredFacts.ownershipBasis='A3-内容1：world/lore/factions.json#faction_ms_huipeng.resources 列有公秤；公共通行与各族轮值的争议仍按原文处理。';}
 return base;
}

export function buildRoutes(){
 const rows=[];
 for(const s of settlements)rows.push({id:`route_t162_${s.id}`,from:s.from,to:s.id,lengthKm:s.routeKm,terrainMultiplier:1.2,modes:['walk'],closedSeasons:[],toll:0,risk:s.routeRisk});
 for(const p of places.filter(p=>p.kind!=='seat')){const s=settlementOf(p.settlement),from=p.kind==='home'?p.district:s.id;
  rows.push({id:`route_t162_${p.id}`,from,to:p.id,lengthKm:p.kind==='home'?0.02:0.08,terrainMultiplier:1.2,modes:['walk'],closedSeasons:[],toll:0,risk:0});}
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
   '常住居民与野外种群分开；幼体不替外客做工。'],
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
 const x=c.prose,prose={dailyLife:x.dailyLife+(c.settlement===HX?'\n'+x.facts.magicAdventurers:''),familyAndLaw:x.familyAndLaw,faithAndFestivals:x.faithAndFestivals,voice:x.voice,proverbs:x.proverbs};
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
   execution:'已接入势力时钟：每日检查，议题闭合后按议定结果扣公账、分物并传消息',settlement:o.settlement,source:'T162 聚居地议题时钟',cycle:'once',
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

// Rules prose is published in the public culture entry and reviewed as individual route facts.
for(const [i,c]of cultures.entries()){
 const x=c.prose,notes=x.facts;
 x.naming={structure:x.naming,syllableCount:[2,2]};
 x.facts={food:i===0?'各按本相食性进食；狐鼬獭可换鲜鱼，丘龟沿湿岸取苔。':'各自持有干粮与食物，共食须本人同意。',clothing:i===0?'保留本相，以芦结辨窝。':'护腕与绳圈用旧料修补。',architecture:i===0?'水窝与干芦台分岸共居。':'地上低棚与车棚围成集路。',family:x.familyAndLaw,ageGender:'成年成员可议事；幼体不做工。',law:x.familyAndLaw,magicAdventurers:notes.join(''),festivalPractice:x.faithAndFestivals,taboo:i===0?'不冒认借形者，不掘归汐高岸。':'不冒签，不取他人货。',arts:x.voice,speech:x.voice};
}
cultures[0].prose.facts.magicAdventurers+=[...routeRules.conditions.map(x=>x.text),...routeRules.stages.map(x=>x.text),routeRules.settlement].join('\n');
const relations=['faction_ms_huipeng','faction_ms_huixi'];
for(const [i,o]of organizations.entries()){
 o.relations=[{faction:relations[i],score:0}];
 ORG_PROSE[o.id].relationReason={[relations[i]]:'两地各自认岸或认签，暂未立共同约定。'};
 ORG_PROSE[o.id].divisions=settlements[i].society.positions.map(p=>p.claim);
}
for(const p of people.filter(p=>p.tier==='full')){
 p.prose.appearance.push(p.sex==='女'?'停步时先侧头听声音。':'常把前爪或双手收在身前。');
 const peer=people.find(q=>q.settlement===p.settlement&&q.tier==='full'&&q.id!==p.id&&!p.prose.relationships.some(r=>r.with===q.id));
 p.prose.relationships.push({with:peer.id,type:'同地议事',trust:6,affection:3,note:`${peer.name}在议事处听过他的主张，两人仍会在公共地方招呼。`});
 p.prose.knowledge.known.push({fact:peer.prose.currentConcern,source:peer.id,reliability:'议事时听本人说过'});
 p.prose.knowledge.unknown[1]=p.settlement===HX?'苇汀哪位愿意来议汐棚谈清芦界？':'桑坂哪位肯把自己认货签的办法带来公秤台？';
}
