// T157 (S2): 炭阶地宫与苔灯坞。正文由执行会话起草，DeepSeek 只做 L2 事实审核。
// 本文件同时给出机制骨架（人数、住区、作息、库存、路线、立约与潜入登记）和
// 待审正文；发布入口把两者合成正式条目。待生成人口只登记配额，不写入名册。
export const revision='monster-society-1-v1';

const day=(rows)=>rows.map(([start,end,location,activity,services=[]])=>({start,end,location,activity,services}));
const schedule=rows=>{const d=day(rows);return{default:d,market:structuredClone(d),rest:structuredClone(d),restDays:[],seasonal:{}};};
const res=()=>[{kind:'协商',description:'须当事人另行确认的空闲时辰',availability:'unverified',grantsInventory:false}];
const goal=(id,content,steps,deadlineDay)=>({id,content,progress:0,deadlineDay,resources:res(),steps:steps.map(content=>({content,status:'pending'}))});
const goals=(prefix,[s,m,l])=>({short:[goal(`${prefix}_short`,s[0],s[1],30)],mid:[goal(`${prefix}_mid`,m[0],m[1],180)],long:[goal(`${prefix}_long`,l[0],l[1],720)]});

// ---------------------------------------------------------------- 炭阶地宫
const TJ='loc_ms_tanjie',TD='loc_ms_taideng';
const tj={seat:TJ,stair:'site_ms_tj_stair',hearth:'site_ms_tj_hearth',fungus:'site_ms_tj_fungus',shaft:'site_ms_tj_shaft',forge:'site_ms_tj_forge',
 yan:'site_ms_tj_yan',ding:'site_ms_tj_ding',li:'site_ms_tj_li',council:'site_ms_tj_council',store:'site_ms_tj_store',
 home1:'bld_ms_tj_home_01',home2:'bld_ms_tj_home_02',home3:'bld_ms_tj_home_03'};
const td={seat:TD,commons:'site_ms_td_commons',garden:'site_ms_td_garden',ropes:'site_ms_td_ropes',saltstone:'site_ms_td_saltstone',lampground:'site_ms_td_lampground',
 tai:'site_ms_td_tai',qing:'site_ms_td_qing',li:'site_ms_td_li',council:'site_ms_td_council',trapcache:'site_ms_td_trapcache',
 home1:'bld_ms_td_home_01',home2:'bld_ms_td_home_02',home3:'bld_ms_td_home_03'};
const P={yanzhen:'npc_ms_tj_yanzhen',dingying:'npc_ms_tj_dingying',yantai:'npc_ms_tj_yantai',liya:'npc_ms_tj_liya',lishuan:'npc_ms_tj_lishuan',dingkou:'npc_ms_tj_dingkou',
 dingcuo:'npc_ms_tj_dingcuo',yanya:'npc_ms_tj_yanya',lipian:'npc_ms_tj_lipian',yandou:'npc_ms_tj_yandou',dingli:'npc_ms_tj_dingli',litiao:'npc_ms_tj_litiao',
 liheng:'npc_ms_td_liheng',taimian:'npc_ms_td_taimian',qingzhi:'npc_ms_td_qingzhi',lizhen:'npc_ms_td_lizhen',lizhi:'npc_ms_td_lizhi',qingpeng:'npc_ms_td_qingpeng',
 qingsui:'npc_ms_td_qingsui',taixu:'npc_ms_td_taixu',tailing:'npc_ms_td_tailing',taijian:'npc_ms_td_taijian',qingyuan:'npc_ms_td_qingyuan',limao:'npc_ms_td_limao'};
export const ids={TJ,TD,tj,td,P};

const GOBLIN='monster_ash_cave_goblin',FOX='monster_moss_lamp_fox';
const hierarchy=(id,name)=>[{id:'known-continent',name:'已知大陆片区'},{id:'known-region',name:'已知地区片区'},{id:'known-county',name:'已知郡级片区'},{id,name}];

export const settlements=[
 {id:TJ,name:'炭阶地宫',species:GOBLIN,culture:'culture_ms_tanjie',parent:'loc_bs',parentName:'白石镇',scope:'loc_bs',coordinates:[20.25,1.2],terrain:'平地',
  from:'loc_wild_bs_kiln',routeKm:0.4,routeRisk:1,expectedKm:4,populationSeed:'t157-tanjie-population-1',
  population:240,householdCount:49,registeredHouseholdCount:3,pendingHouseholdCount:46,
  pendingAgeStructure:{children:60,youngAdults:80,adults:66,elders:22},
  society:{leader:'boss_ms_tanjie',neighbors:{loc_bs:'戒备'},stances:{player:'戒备'},meetingPlace:tj.council,
   motions:[{id:'grain_pact',name:'是否与白石镇立按旬交付的粮约',opens:'trade'},{id:'grain_raid',name:'是否出窟抢粮过冬',closes:'trade'}],
   positions:[{id:'keep_trade',name:'守窟换粮',members:[P.yanzhen,P.dingying,P.yantai,P.dingkou],claim:'守住共灶，用菌粮和修补活计向白石镇换粮，入冬前谈下粮约。',stances:{grain_pact:'approve',grain_raid:'reject'},persuasion:20},
    {id:'raid_challenge',name:'抢粮挑战',members:[P.liya,P.lishuan],claim:'嫌换粮台换得太贱，主张出窟抢粮过冬，并在换季那夜挑战窟主之位。',stances:{grain_pact:'reject',grain_raid:'approve'},persuasion:15}]}},
 {id:TD,name:'苔灯坞',species:FOX,culture:'culture_ms_taideng',parent:'loc_hw',parentName:'河湾村',scope:'loc_hw',coordinates:[2.6,0.9],terrain:'平地',
  from:'loc_hw_northwood',routeKm:1.1,routeRisk:0,expectedKm:3,populationSeed:'t157-taideng-population-1',
  population:48,householdCount:12,registeredHouseholdCount:3,pendingHouseholdCount:9,
  pendingAgeStructure:{children:10,youngAdults:10,adults:11,elders:5},
  society:{leader:'boss_ms_taideng',neighbors:{loc_hw:'戒备'},stances:{player:'中立'},meetingPlace:td.council,
   motions:[{id:'allow_bonds',name:'是否容许成员与外人结缘并一律打绳记',opens:'trade'},{id:'trap_redress',name:'是否向河湾猎户追偿被捕夹夹伤的旧伤'}],
   positions:[{id:'bonds',name:'结缘派',members:[P.taimian,P.qingzhi,P.taixu,P.tailing],claim:'受恩要还，容许成员与外人结下互助之缘，边界的事先结缘再谈。',stances:{allow_bonds:'approve',trap_redress:'reject'},persuasion:15},
    {id:'redress',name:'追偿派',members:[P.lizhen,P.lizhi],claim:'被捕夹夹伤的旧伤要河湾猎户认账赔偿，收来的夹子等对方来认。',stances:{allow_bonds:'reject',trap_redress:'approve'},persuasion:20}]}},
];

// Places. kind: seat | facility | district | home | council | store
export const places=[
 // ---- 炭阶
 {id:TJ,kind:'seat',name:'炭阶地宫',settlement:TJ,prose:{
  description:'炭阶地宫在白石镇西郊废窑底下。从废窑塌了半边的窑膛背后，一道碎砖垒的台阶被炭灰染得乌黑，一级级通进地里，灰窟哥布林叫它炭阶。阶下是旧窑道改出来的一串洞室，按共灶窟分成三处住区，中间是共灶厅，旁边有菌床洞、通风井和铸补间。洞里只点小油灯，说话声和敲管声在窑道里来回传。',
  authoredFacts:{climate:'地下常年阴凉潮湿，靠通风井的洞室有风，深处闷热',senses:['敲铁管的长短节拍从各个窑道传来','窑灰味里混着菌床的湿木气','小油灯只照得见脚下两三步'],entryRule:'炭阶口和公共洞室可以通行，各铺私宅和议事窟须当面许可；窟里不点强光'}}},
 {id:tj.stair,kind:'facility',name:'炭阶口',settlement:TJ,access:'public',prose:{
  description:'炭阶口是炭阶地宫的入口洞室，台阶下到底就是。洞口横着一块厚木板当换粮台，木板这边站着哥布林，那边站着来换东西的人。黄昏以后，烟苔在台上摆出干菌片和小铁钉，换镇上带来的燕麦和盐。台边钉着一排刻痕木片，记着每一回换了什么。',
  authoredFacts:{climate:'靠近地面，夜里有冷风从台阶灌下来',senses:['木板台面被手肘磨得发亮','刻痕木片挂成一排，风一吹就互相磕碰','台阶上方能看见废窑漏下的一点天光'],entryRule:'公共入口，换粮在黄昏后的台面上进行，越过木板要先打招呼'}}},
 {id:tj.hearth,kind:'facility',name:'共灶厅',settlement:TJ,access:'public',prose:{
  description:'共灶厅是炭阶地宫最大的洞室，正中一口大灶，灶火由炉祭钉缨看守，各共灶窟的成员轮流来这里分食。灶的一侧有一块被炭灰磨黑的平石，是窟主座，窟主烟砧夜里在这里见来人、谈交换。厅后有一条窄道通往旧窑膛，换季那夜亡者就送进那里。',
  authoredFacts:{climate:'灶火终夜不熄，厅里比别处暖和干燥',senses:['大灶里的炭火噼啪作响','分食时敲管报数，一声接一声','平石上堆着待补的破锅和一篓小铁钉'],entryRule:'公共洞室，分食时按敲管次序上前；厅后通往旧窑膛的窄道只在送亡者时打开'}}},
 {id:tj.fungus,kind:'facility',name:'菌床洞',settlement:TJ,access:'public',prose:{
  description:'菌床洞是一条又长又低的旧窑道，两侧用碎砖垫起一排排菌床，铺着烂木和湿草，长着灰白的菌子。烟苔管着这里，烟芽每晚跟她翻草洒水。收下的菌子晾成干菌片，一部分进共灶，一部分拿到炭阶口换粮。',
  authoredFacts:{climate:'潮湿闷热，地面总是湿的',senses:['湿草和烂木的气味很重','菌床上的菌伞碰一下就落细粉','洒水的陶罐摆在过道两头'],entryRule:'公共洞室，可以沿过道走，菌床上的东西归共灶，不经烟苔点头不能摘'}}},
 {id:tj.shaft,kind:'facility',name:'通风井',settlement:TJ,access:'public',prose:{
  description:'通风井原是废窑的一根旧烟道，竖着通到地面，炭阶地宫各处洞室的风都从这里进出。井壁上钉着几根铁管，哥布林敲管传讯，节拍顺着铁管传遍各窟。井壁内侧有一道裂缝，砾片每晚来量，说入冬前得补。在炭阶，封堵公共风井是最重的忌讳。',
  authoredFacts:{climate:'风大，冬天井口灌下冷风',senses:['风穿过井筒发出低低的呜声','铁管一敲，整口井都在嗡响','井壁裂缝旁抹着一道新的炭灰记号'],entryRule:'公共洞室，可以靠近井口，动井壁和铁管要先问通风工砾片'}}},
 {id:tj.forge,kind:'facility',name:'铸补间',settlement:TJ,access:'public',prose:{
  description:'铸补间挨着钉灶窟，是一间用旧窑膛改的小作坊，炉里烧的是废窑里扒出来的木炭。钉扣和钉锉在这里补镇边人家送来的破锅、敲直弯钉，补好的活计和小铁钉拿去换粮。窟主烟砧原本就是这里的铸补匠，夜里还常回来补锅。',
  authoredFacts:{climate:'炉边烤得发烫，离炉几步又阴冷下来',senses:['小锤敲铁的叮当声不断','炉灰和铁锈的味道','墙边摞着补了一半的锅'],entryRule:'公共作坊，可以在门边看，炉火和工具归铸补间，动手前要问钉扣'}}},
 {id:tj.yan,kind:'district',name:'烟灶窟',settlement:TJ,access:'public',prose:{
  description:'烟灶窟是离通风井最近的一处共灶窟，洞顶被烟熏得发黑，所以叫烟灶。几条窄窑道两边挖着一个个睡铺，各铺门口挂着麻片。窟主烟砧、菌床管事烟苔都住在这里的烟灶铺，这一季烟灶铺轮养幼崽烟豆。',
  authoredFacts:{climate:'有风，烟味散得快，比别的窟干一些',senses:['洞顶黑得发亮','铺门口的麻片被风吹得一鼓一鼓','走道里摆着各铺的小陶灯'],entryRule:'住区窑道可以通行，各铺私宅须住户当面许可'}}},
 {id:tj.ding,kind:'district',name:'钉灶窟',settlement:TJ,access:'public',prose:{
  description:'钉灶窟挨着铸补间，窑道墙上钉满了各铺挂工具的铁钉，所以叫钉灶。炉祭钉缨和铸补匠钉扣、钉锉住在钉灶铺，这一季钉灶铺轮养幼崽钉粒。夜里铸补间的敲打声隔着墙也听得见。',
  authoredFacts:{climate:'挨着铸补间的一侧暖，另一侧潮',senses:['墙上的钉子挂满锤和钳','隔墙传来叮当的敲打','地上落着细碎的铁屑'],entryRule:'住区窑道可以通行，各铺私宅须住户当面许可'}}},
 {id:tj.li,kind:'district',name:'砾灶窟',settlement:TJ,access:'public',prose:{
  description:'砾灶窟在炭阶地宫最低的一层，是后来才挖开的，地上还铺着没清干净的碎砾。分锅时砾灶窟常排在最后，年轻成员多，巡洞守卫砾牙和砾栓都住在这里的砾灶铺。窟的一侧有一条旧岔道，岔道口用碎砖虚掩着。',
  authoredFacts:{climate:'最低最闷，雨季地面渗水',senses:['脚下碎砾硌脚，走一步响一声','旧岔道口的碎砖堆得歪歪斜斜','窑道比别的窟窄，要侧身才能错开'],entryRule:'住区窑道可以通行，各铺私宅须住户当面许可'}}},
 {id:tj.home1,kind:'home',name:'烟灶铺',settlement:TJ,district:tj.yan,prose:{
  description:'烟灶铺是烟灶窟里的一处睡铺，住着烟砧、烟苔、烟芽，这一季还轮养着幼崽烟豆。铺里铺着几层干草，墙上挂着刻痕木片和补锅用的小工具。门前可以招呼，进铺须成年住户许可。',
  authoredFacts:{climate:'干燥，有风从烟灶窟的窑道吹进来',senses:['干草铺得整整齐齐','墙上挂着一串刻痕木片','烟豆的小草铺在最里面'],entryRule:'私宅，须成年住户当面许可'}}},
 {id:tj.home2,kind:'home',name:'钉灶铺',settlement:TJ,district:tj.ding,prose:{
  description:'钉灶铺是钉灶窟里的一处睡铺，住着钉缨、钉扣、钉锉，这一季轮养幼崽钉粒。铺门边堆着一小堆引火炭，钉缨每天起身后在门边清点一遍，这一季轮养的钉粒也跟着学数。门前可以招呼，进铺须成年住户许可。',
  authoredFacts:{climate:'挨着铸补间，铺里偏暖',senses:['门边一小堆引火炭码得整齐','墙上挂着一根短铜管','草铺上落着铁屑'],entryRule:'私宅，须成年住户当面许可'}}},
 {id:tj.home3,kind:'home',name:'砾灶铺',settlement:TJ,district:tj.li,prose:{
  description:'砾灶铺是砾灶窟里的一处睡铺，住着砾牙、砾栓、砾片，这一季轮养幼崽砾跳。铺里地面垫了一层干草，压住底下的碎砾，墙角立着巡洞用的铁条。门前可以招呼，进铺须成年住户许可。',
  authoredFacts:{climate:'低洼闷热，墙根有些潮',senses:['墙角立着磨尖的铁条','干草下面的碎砾一踩就响','砾跳的小铁片挂在门帘上'],entryRule:'私宅，须成年住户当面许可'}}},
 {id:tj.council,kind:'council',name:'议事窟',settlement:TJ,authority:P.yanzhen,prose:{
  description:'议事窟在共灶厅后面窄道的一侧，是一间不大的圆洞，中间摆着一圈平石。每夜子时过后，窟主烟砧、炉祭钉缨和巡洞守卫砾牙在这里夜议，议立粮约，也议出窟抢粮。外人要进，须窟主当面许可。',
  authoredFacts:{climate:'封闭安静，比共灶厅凉',senses:['一圈平石磨得光滑','墙上刻着历年议过的事的记号','窄道里能听见共灶厅的灶火声'],entryRule:'议事区，须窟主烟砧当面许可'}}},
 {id:tj.store,kind:'store',name:'仓窟',settlement:TJ,facts:['刻痕账记着四十袋燕麦，实存三十七袋；少的三袋是上回换季熄炉那几夜被人从后缝拖走的，没有划取粮痕'],prose:{
  description:'仓窟是炭阶地宫存粮的洞室，靠砾灶窟一侧，洞口挂着厚麻帘。里面堆着用麻袋装的燕麦，墙上刻着刻痕账。上回换季熄炉后，刻痕账上少了三袋燕麦，去向至今没有查清。烟苔每夜后半段来清点。',
  authoredFacts:{climate:'干燥阴凉，洞口麻帘挡住了湿气',senses:['麻袋垒成矮墙','墙上的刻痕密密麻麻','地上落着一些燕麦壳'],entryRule:'仓粮归窟主，进入须窟主或管事许可；仓窟登记为可潜入之处'},
  clues:{tally:'墙上的刻痕账按袋记数，每次取粮都划去一道；从上回换季熄炉前到现在没有新划的痕，刻痕上仍是四十袋，可地上实有的麻袋只有三十七袋，少的三袋没留下取粮的划痕。',
   drag:'靠里的墙根地上有几道浅浅的拖痕，像是麻袋被拖着走过，拖痕出了仓窟的后缝，朝砾灶窟一侧的旧岔道方向去了。'}}},
 // ---- 苔灯坞
 {id:TD,kind:'seat',name:'苔灯坞',settlement:TD,prose:{
  description:'苔灯坞在河湾村北林边往里的一条支路尽头，是有灵智的苔灯狐聚居的林下坞子。几棵老树的根下挖着根洞家巢，分成三处，中间一片压平的空地是共食庭。夜里狐族尾尖的苔绿冷光在林下移来移去，路边树枝上系着打结的气味绳，既是路标，也是传话的记号。',
  authoredFacts:{climate:'林下阴湿，夜里露重，白天透进碎光',senses:['尾尖的苔光在树根间一闪一闪','草绳上抹着各巢不同的气味','脚边满是落叶和果核'],entryRule:'共食庭、药圃边、绳记坡、换盐石和归土灯坪可以通行，家巢和长老树洞须当面许可；带明火要先在林缘熄掉'}}},
 {id:td.commons,kind:'facility',name:'共食庭',settlement:TD,access:'public',prose:{
  description:'共食庭是苔灯坞中间一片压平的林下空地，四周是老树根。每夜分食都在这里，护幼者苔絮带着幼崽先吃，长老苔眠总是最后动口。坞主栗衡夜里在庭边一截倒木上见来客，谈换盐和边界的事。',
  authoredFacts:{climate:'林下空地，露水重，夜里偏凉',senses:['倒木被坐得光滑','分食的浆果和块根摆成一圈','幼崽们抢食时尾尖的光乱晃'],entryRule:'公共空地，分食时护幼者先上前，来客等在倒木边'}}},
 {id:td.garden,kind:'facility',name:'药圃',settlement:TD,access:'public',prose:{
  description:'药圃在共食庭东边，是几畦松过土的林下地，种着狐族采回来移栽的药草和块根，新苗用细枝围着。青芷管着这里，青蓬每晚跟她挑药草。收下的药草扎成一把一把，拿到换盐石去换盐。',
  authoredFacts:{climate:'树冠稀一些，土松而潮',senses:['药草的苦香很冲','新苗边插着一圈细枝','畦沟里留着爪子刨过的印子'],entryRule:'可以沿畦边走，新苗踩不得，药草归坞里，不经青芷点头不能采'}}},
 {id:td.ropes,kind:'facility',name:'绳记坡',settlement:TD,access:'public',facts:['结绳记事的苔铃照看绳记坡的绳，长老苔眠夜里来读绳'],prose:{
  description:'绳记坡是共食庭北边一道缓坡，坡上的矮树枝挂满了打结的草绳。每根绳抹着某个家巢的气味，结的数目和间距记着事：谁欠谁、哪里下了夹子、哪天有谁来换盐。苔铃管着这些绳，旧绳被雨泡烂了就重新打一遍。',
  authoredFacts:{climate:'坡上通风，草绳常被露水打湿',senses:['一枝枝草绳垂下来，长短不一','凑近能闻到各巢不同的气味','有几根旧绳已经泡得发黑'],entryRule:'公共坡地，可以看绳，解绳或挂新绳要问结绳的苔铃'}}},
 {id:td.saltstone,kind:'facility',name:'换盐石',settlement:TD,access:'public',prose:{
  description:'换盐石在苔灯坞往北林边方向的林缘，是一块平顶的大青石。天黑以后，青芷把药草和干果摆在石上，来换东西的人把盐放下，双方各退一步看过再拿。来换的多是河湾猎户和过路的货郎，最近猎户来得少了。',
  authoredFacts:{climate:'林缘风大，比坞里干',senses:['石面被摆东西的爪子和手磨得发白','石边的草地踩出一圈秃印','能看见林外河湾方向的一点灯火'],entryRule:'公共石台，换东西时隔着石头各摆各的，越过石头要先招呼'}}},
 {id:td.lampground,kind:'facility',name:'归土灯坪',settlement:TD,access:'public',prose:{
  description:'归土灯坪在苔灯坞西边一片向阳的缓坡上，是狐族埋葬亡者的地方。亡者断气后，守夜者陪到它尾尖的苔光熄灭，再把它埋进坪上的松土，尾结取下来交给家巢收进长老树洞的龛里。坪上没有碑，只有一圈圈细枝标着各巢的位置。',
  authoredFacts:{climate:'向阳缓坡，白天晒得暖，夜里很静',senses:['松土上插着一圈圈细枝','坪边长着狐族移栽的药草','夜里这里没有一点苔光'],entryRule:'公共坡地，可以在坪边静立，翻土或拿走坪上的东西是重忌'}}},
 {id:td.tai,kind:'district',name:'老根洞',settlement:TD,access:'public',prose:{
  description:'老根洞是苔灯坞最老的一处家巢群，在一棵半枯的老栎树根下，几个根洞的洞口挂着灰色的旧草绳。长老苔眠、护幼者苔絮和结绳的苔铃都住在这里的苔家巢。',
  authoredFacts:{climate:'树根挡风，洞口一带干燥',senses:['老栎树根粗得像矮墙','洞口的旧草绳褪成灰色','洞里传出幼崽的哼声'],entryRule:'家巢群之间的林地可以通行，各巢根洞须住户当面许可'}}},
 {id:td.qing,kind:'district',name:'榛坡洞',settlement:TD,access:'public',prose:{
  description:'榛坡洞在一片榛树丛下的缓坡上，离药圃最近，洞口挂着青色的草绳。管药圃的青芷、采药的青蓬和采果的青穗都住在这里的青家巢，洞口常晾着成把的药草。',
  authoredFacts:{climate:'坡上透风，药草晾得快',senses:['榛树枝低低地压在洞口','成把的药草挂在根须上晾','坡上落满了榛子壳'],entryRule:'家巢群之间的林地可以通行，各巢根洞须住户当面许可'}}},
 {id:td.li,kind:'district',name:'溪畔洞',settlement:TD,access:'public',prose:{
  description:'溪畔洞在一条小溪边的几棵栗树下，洞口挂着栗色的草绳。坞主栗衡、守林哨栗针和栗枝都住在这里的栗家巢，离北林边最近，巡林出入方便。',
  authoredFacts:{climate:'挨着溪水，夜里湿气重',senses:['溪水声从洞口下面传上来','栗树下落满带刺的壳斗','洞口的泥地上脚印排成一条条单线'],entryRule:'家巢群之间的林地可以通行，各巢根洞须住户当面许可'}}},
 {id:td.home1,kind:'home',name:'苔家巢',settlement:TD,district:td.tai,prose:{
  description:'苔家巢是老根洞里最大的一个根洞，住着苔眠、苔絮、苔铃和幼崽苔尖。洞里铺着干苔和落叶，洞壁的根须上挂着苔眠多年攒下的旧绳记。门前可以招呼，进巢须成年住户许可。',
  authoredFacts:{climate:'干燥温暖，铺着厚厚的干苔',senses:['根须上挂满旧绳','干苔踩上去软软的','洞里有一股草药味'],entryRule:'私宅，须成年住户当面许可'}}},
 {id:td.home2,kind:'home',name:'青家巢',settlement:TD,district:td.qing,prose:{
  description:'青家巢是榛坡洞里的一个根洞，住着青芷、青蓬、青穗和幼崽青圆。洞口晾着药草，洞里角落堆着干果和攒下的空盐袋。门前可以招呼，进巢须成年住户许可。',
  authoredFacts:{climate:'透风，药草和干果都晾得住',senses:['洞口垂着成把的药草','角落里堆着干果','空盐袋叠成一摞'],entryRule:'私宅，须成年住户当面许可'}}},
 {id:td.home3,kind:'home',name:'栗家巢',settlement:TD,district:td.li,prose:{
  description:'栗家巢是溪畔洞里的一个根洞，住着栗衡、栗针、栗枝和幼崽栗毛。洞口的草绳系了两道，栗衡出巢巡林前总要再系一遍。门前可以招呼，进巢须成年住户许可。',
  authoredFacts:{climate:'挨着溪，洞里有些潮',senses:['洞口系着两道栗色草绳','洞底铺着一层干栗叶','能听见溪水声'],entryRule:'私宅，须成年住户当面许可'}}},
 {id:td.council,kind:'council',name:'长老树洞',settlement:TD,authority:P.taimian,prose:{
  description:'长老树洞在一棵空心老栎的树干里，洞壁上凿着一排小龛，收着各家巢亡者的尾结。每夜子时过后，长老苔眠、坞主栗衡和守林哨栗针在这里夜议，读新挂的气味绳，议结缘也议追偿。外人要进，须长老苔眠当面许可。',
  authoredFacts:{climate:'树洞里安静，比外面暖一点',senses:['洞壁的小龛里一枚枚尾结排着','老栎的木屑味','夜议时只听见低低的说话声'],entryRule:'议事区，须长老苔眠当面许可；龛里的尾结任何人不能取走'}}},
 {id:td.trapcache,kind:'store',name:'收夹洞',settlement:TD,facts:['洞里存着栗针和栗枝从北林边收来的六只捕夹，其中一只收自边界石外侧','伤绳记着四只被捕夹夹伤的狐，栗针是其中之一'],prose:{
  description:'收夹洞是溪畔洞后面一个废弃的旧根洞，栗针和栗枝把从北林边收来的捕夹存在这里。夹子一只只摆在洞底，每只的链子上系着一个记结，洞壁上挂着一根伤绳。栗衡没有让夹子摆进共食庭，这洞归栗针看管。',
  authoredFacts:{climate:'阴湿，洞底积着落叶',senses:['铁夹上的锈味很冲','每只夹链上都系着一个草结','洞壁挂着一根打了几个结的伤绳'],entryRule:'栗针看管的存放洞，进入须他许可；收夹洞登记为可潜入之处'},
  clues:{trapRopes:'每只捕夹的链子上系着一个记结，结上抹着收夹那夜的气味，结的样式标着收夹的地点；数下来共有六只，其中一只的记结打法和别的不同，标的是边界石外侧。',
   hurtRope:'洞壁那根伤绳上打着四个结，每个结抹着一只狐的气味，记的是四只被捕夹夹伤的狐；其中一个结的气味和栗针身上的一样。'}}},
];

// People. Full entries carry authored profile prose; roster entries are short.
const FULL={tier:'full'};
export const people=[
 // ===================== 炭阶 full
 {id:P.yanzhen,settlement:TJ,name:'烟砧',age:44,sex:'男',occupation:'铸补匠',role:'窟主',...FULL,home:tj.home1,household:'house_ms_tj_01',workplace:tj.forge,
  coins:30,inventory:{item_iron_nail:10,item_dry_mushroom:6},services:['trade'],ttsVoice:'zh_male_low_01',
  schedule:[[0,60,tj.hearth,'在窟主座接待来人',['trade']],[60,120,tj.council,'议事窟夜议'],[120,300,tj.forge,'在铸补间补锅'],[300,1020,tj.home1,'睡眠'],[1020,1080,tj.home1,'起身、分灶食'],[1080,1440,tj.hearth,'在窟主座接待来人',['trade']]],
  prose:{traits:['沉稳','记账细'],visibleFeature:'左手缺了半截小指，敲管时用无名指代替。',
   appearance:['左手缺了半截小指，敲管时用无名指代替。','耳尖缠着一圈旧铜丝','腰间挂的钉片比旁人少，只挂常用的几样'],
   currentConcern:'仓窟刻痕账上少了三袋燕麦，入冬前要么查清去向，要么和白石镇谈下一份粮约。',
   voice:{register:'说话慢，句子短，报数时一字一顿',accent:'窟里的咂舌口音，对外人只说简单的人话',habits:['开口前先用指节敲两下桌沿'],samples:['先看账，再说话。','风井的事不能拖，粮的事也不能抢。','你要进来，就先把灯压暗。']},
   personality:{values:['共灶的锅不能空','和镇上做买卖要留刻痕'],flaws:['不肯当众认错，只在账上悄悄改']},
   familyNotes:'烟砧与烟苔、烟芽同住烟灶铺，这一季轮到烟灶铺带幼崽烟豆，他夜里回铺时会先看烟豆的草铺有没有踢散。',
   relationships:[
    {with:P.dingying,type:'共窟议事',trust:30,affection:10,note:'钉缨在他还是铸补间学徒时教过他敲管的起头拍；如今夜议上她多半站在他这边，两人都主张先和白石镇立粮约。'},
    {with:P.yantai,type:'同铺共灶',trust:25,affection:12,note:'烟苔管菌床和换粮台，每旬向他报一次数；仓窟少粮后她提议换一种封仓的刻法，他说等夜议再定，还没答应。'},
    {with:P.liya,type:'窟主与挑战者',trust:-10,affection:5,note:'砾牙在共灶厅当众说他换粮换得太贱，扬言换季那夜要挑战窟主之位；他记得砾牙小时候是自己带着学敲管的。'},
    {with:P.yandou,type:'轮养照看',trust:10,affection:15,note:'这一季烟灶铺轮养烟豆，他教她认铸补间里钉子的大小。'}],
   memorySeeds:[
    {id:'memory_t157_tj_count',event:'上回换季熄炉那夜，烟砧、钉缨、烟苔、砾牙在共灶厅对着仓窟的刻痕账数粮，发现少了三袋燕麦；去向当夜没有查清，砾牙主张出窟抢粮补上，烟砧没有答应。',location:tj.hearth,salience:5,knownBy:[P.yanzhen,P.dingying,P.yantai,P.liya],reliability:'亲历'},
    {id:'memory_t157_tj_yanzhen_rise',event:'六年前旧窟主病故，各窟在共灶厅推举，他一夜补好九口裂锅，得了窟主之位。',location:tj.hearth,salience:3,knownBy:[P.yanzhen],reliability:'个人回忆'}],
   goals:[['查清仓窟三袋燕麦的去向',['夜议时请烟苔把仓窟的刻痕账逐行念一遍','亲自去看仓窟靠砾灶窟一侧的墙根']],
    ['入冬前和白石镇谈下一份按旬交付的粮约',['让烟苔备好可换的干菌片和小铁钉','托换粮台来往的人给镇上带话约见']],
    ['让炭阶的共灶不再靠抢粮过冬',['把菌床扩到通风井旁的两条旧窑道','教更多年轻成员铸补手艺']]],
   fears:['怕通风井的裂缝在冬天塌下来，压住砾灶窟'],redLines:['公共风井谁也不能封','共灶的粮不拿去私换'],
   secrets:[{content:'他其实怀疑少的粮是窟里自己人搬走的，只是在没有证据前不愿在共灶厅说出口。',knownBy:[P.yanzhen]}],
   knowledge:{known:[{fact:'仓窟的刻痕账上记着上回换季熄炉后少了三袋燕麦。',source:tj.store,reliability:'亲眼核过刻痕'},
     {fact:'通风井内壁有一道裂缝，通风工砾片说入冬前得补。',source:P.lipian,reliability:'通风工当面报告'},
     {fact:'白石镇的人对炭阶戒备，只肯在炭阶口的换粮台隔着木板交易。',source:tj.stair,reliability:'多年往来'}],
    unknown:['砾牙是否真会在下次换季当众挑战窟主之位？','白石镇哪一位管事肯出面谈粮约？']},
   opinions:{factions:'镇上的商会只认账不认窟，和他们打交道要把刻痕留好。',magic:'术士的强光伤眼，谈事前请先压暗。',adventurers:'外来人肯干修风井的活，他愿意按日给菌粮和铁钉。',
    neighbors:[{with:P.liya,view:'有胆子，但把抢粮看得太容易。'},{with:P.dingying,view:'窟里最懂规矩的人，夜议离不开她。'}]},
   towardPlayer:{baseline:{trust:-5,affection:0},raises:['进窟先压暗灯火','按刻痕交付说好的东西'],lowers:['在仓窟附近东张西望','对风井动手脚'],attitude:'戒备，愿意在共灶厅隔着灶火谈交换和雇工。'},
   behaviorRules:{bargaining:'按刻痕账报价，换出的小铁钉和干菌片以手头库存为限。',honesty:'不知道的事说“没刻痕”，不编数。',risk:'能守洞就不出窟。',threatResponse:'敲管召各窟守卫，退到共灶厅后面。',bribeResponse:'私下给的东西他会当众记进共灶账。'},
   serviceWhat:'本人手头的小铁钉与干菌片',hooks:['仓窟少了三袋燕麦','通风井裂缝要人修补'],
   notes:'炭阶地宫窟主，兼做铸补。主张与白石镇立粮约、不出窟抢粮；正被砾牙的抢粮派挑战。',
   description:'烟砧是炭阶地宫的窟主，四十四岁，原是铸补间的铸补匠，夜里仍常回去补锅。他左手缺了半截小指，敲管时用无名指代替。仓窟少了三袋燕麦，他想在入冬前查清去向，也想和白石镇谈下一份粮约。他说话慢、报数一字一顿，主张守窟换粮，不愿出窟抢粮，砾牙为此扬言要挑战他。',
   portraitPrompt:'原创灰窟哥布林窟主，个子只到成人腰间，灰绿皮肤，左手缺半截小指，耳尖缠旧铜丝，腰间挂少量钉片，身后是炭火大灶'}},
 {id:P.dingying,settlement:TJ,name:'钉缨',age:66,sex:'女',occupation:'炉火看守',role:'炉祭',...FULL,home:tj.home2,household:'house_ms_tj_02',workplace:tj.hearth,
  coins:6,inventory:{item_charcoal:2},services:[],ttsVoice:'zh_female_mature_01',
  schedule:[[0,60,tj.hearth,'看守共灶火'],[60,120,tj.council,'议事窟夜议'],[120,300,tj.hearth,'看守共灶火、照看轮养幼崽'],[300,960,tj.home2,'睡眠'],[960,1020,tj.home2,'清点引火炭'],[1020,1440,tj.hearth,'主持分食、看守共灶火']],
  prose:{traits:['守规矩','嗓门亮'],visibleFeature:'后颈有一片被炉火燎过的浅疤，常用麻片遮着。',
   appearance:['后颈有一片被炉火燎过的浅疤，常用麻片遮着。','手指被炉灰染成深灰，洗不掉','腰上挂一根短铜管，敲管时用它起头'],
   currentConcern:'换季熄炉的日子近了，共灶的引火炭还差一些，她想让铸补间先匀出一点来。',
   voice:{register:'嗓门亮，敲管起头的节拍又快又准',accent:'老窟口音，咂舌比年轻成员多',habits:['说到规矩时用铜管点一下地'],samples:['风井是大家的，堵了它就是堵了大家的气。','亡者睡进旧窑膛，炉火明夜再点。','这锅轮到钉灶铺看，别的铺把手收回去。']},
   personality:{values:['公共风井和共灶火比谁的面子都大','亡者要按季送走'],flaws:['看不惯年轻成员改老规矩，常当众训人']},
   familyNotes:'钉缨与钉扣、钉锉同住钉灶铺，这一季钉灶铺轮养钉粒，她让钉粒每晚替她数一遍引火炭。',
   relationships:[
    {with:P.yanzhen,type:'共窟议事',trust:30,affection:10,note:'烟砧还在铸补间当学徒时，她教过他敲管的起头拍；如今夜议上她多半站在他这边，主张先和白石镇立粮约。'},
    {with:P.liya,type:'长辈与后生',trust:-5,affection:8,note:'砾牙在共灶厅说要出窟抢粮时，她用铜管敲地打断过他；她记得多年前那次出窟抢粮，回来少了两个。'},
    {with:P.yantai,type:'共灶分工',trust:20,affection:8,note:'烟苔每旬把菌床收成报到共灶厅，她按数分锅；两人为引火炭该先给共灶还是先给铸补间争过一回。'},
    {with:P.dingli,type:'轮养照看',trust:10,affection:18,note:'这一季钉灶铺轮养钉粒，她教他数引火炭，数错了就让他从头再数。'}],
   memorySeeds:[
    {id:'memory_t157_tj_count',event:'上回换季熄炉那夜，烟砧、钉缨、烟苔、砾牙在共灶厅对着仓窟的刻痕账数粮，发现少了三袋燕麦；去向当夜没有查清，砾牙主张出窟抢粮补上，烟砧没有答应。',location:tj.hearth,salience:5,knownBy:[P.yanzhen,P.dingying,P.yantai,P.liya],reliability:'亲历'},
    {id:'memory_t157_tj_dingying_raid',event:'多年前那次出窟抢粮，她在共灶厅守着灶火等人回来，等到天亮，少了两个。',location:tj.hearth,salience:4,knownBy:[P.dingying],reliability:'个人回忆'}],
   goals:[['换季熄炉前凑齐共灶的引火炭',['向烟砧要铸补间余下的木炭','让钉粒每晚清点一次引火炭']],
    ['让夜议通过与白石镇立粮约的议题',['夜议时先讲多年前抢粮少了两个的事','请烟苔把能换的菌粮数报给大家']],
    ['把敲管的起头拍教给每个共灶铺的幼崽',['每晚分食后在共灶厅教一段','让各铺轮养的大人轮流陪着练']]],
   fears:['怕下一次换季熄炉要送的亡者，是在镇边被人打死的'],redLines:['亡者的麻片和遗物只归共灶窟','熄炉那夜谁也别点私火'],
   secrets:[{content:'她私下觉得烟砧太软，若砾牙在换季那夜赢了挑战，她也会照规矩认新窟主。',knownBy:[P.dingying]}],
   knowledge:{known:[{fact:'共灶的引火炭只够两夜，换季熄炉后重新点火还差一些。',source:tj.hearth,reliability:'每晚亲手清点'},
     {fact:'这一季钉灶铺轮养钉粒，烟灶铺轮养烟豆，砾灶铺轮养砾跳。',source:tj.hearth,reliability:'由她排定'},
     {fact:'换季那夜亡者裹着麻片送进共灶厅后面的旧窑膛。',source:tj.hearth,reliability:'历年亲自主持'}],
    unknown:['烟砧是否会在下次夜议提出立粮约的议题？','引火炭还差多少才能撑过熄炉后的那一夜？']},
   opinions:{factions:'镇上的人只看得见窑灰，看不见共灶。',magic:'会点火的法术最好别在洞里用，烟会堵风井。',adventurers:'外来人进洞先学会压低灯和嗓门。',
    neighbors:[{with:P.yanzhen,view:'做事稳，就是太怕吵。'},{with:P.liya,view:'嗓门比本事大，还得磨。'}]},
   towardPlayer:{baseline:{trust:-5,affection:0},raises:['熄炉那夜保持安静','守共灶分食的次序'],lowers:['在洞里点亮强光','拿走亡者遗物'],attitude:'冷淡，先看来人懂不懂洞里的规矩。'},
   behaviorRules:{bargaining:'她不管买卖，只管共灶的锅和炭。',honesty:'规矩和往事照实说，说不准的会先敲管问别铺。',risk:'灶火在，她就不离开共灶厅。',threatResponse:'敲急拍叫各窟守卫，自己守着灶火不退。',bribeResponse:'给共灶的东西收进公账，给她个人的退回去。'},
   serviceWhat:null,hooks:['换季熄炉送亡者','共灶缺引火炭'],
   notes:'炭阶的炉祭，看守共灶火，主持换季熄炉送亡者，排定共灶轮养。夜议上倾向立粮约。',
   description:'钉缨是炭阶地宫的炉祭，六十六岁，日夜看守共灶厅的大灶，主持换季熄炉送亡者，也排定各铺轮养幼崽的次序。她后颈有一片炉火燎过的浅疤，腰上挂着起头用的短铜管。她记得多年前出窟抢粮少了两个的事，所以夜议上主张先和白石镇立粮约。',
   portraitPrompt:'原创年老灰窟哥布林炉祭，灰绿皮肤，后颈浅疤用麻片遮着，手指被炉灰染深，腰挂短铜管，守着大灶炭火'}},
 {id:P.yantai,facts:['炉祭钉缨主持共灶分食，按各窟报上的收成分锅'],settlement:TJ,name:'烟苔',age:38,sex:'女',occupation:'菌床工',role:'菌床管事',...FULL,home:tj.home1,household:'house_ms_tj_01',workplace:tj.stair,
  coins:35,inventory:{item_dry_mushroom:20,item_iron_nail:24},services:['trade'],ttsVoice:'zh_female_bright_01',
  schedule:[[0,120,tj.fungus,'翻菌床、洒温水'],[120,300,tj.store,'在仓窟清点窟粮'],[300,1020,tj.home1,'睡眠'],[1020,1080,tj.home1,'起身、分灶食'],[1080,1320,tj.stair,'在换粮台换粮',['trade']],[1320,1440,tj.fungus,'翻菌床、洒温水']],
  prose:{traits:['精明','爱较真'],visibleFeature:'鼻梁上横着一道被菌床竹篾划的旧痕。',
   appearance:['鼻梁上横着一道被菌床竹篾划的旧痕。','指缝里总嵌着湿木屑','肩上挎着一只装刻痕木片的小篓'],
   currentConcern:'菌床这几夜偏干，她怕下一茬干菌片不够在换粮台换燕麦。',
   voice:{register:'说话快，报数清楚，讲价时嗓门会一下拔高',accent:'窟里口音，对镇上人说简短的人话',habits:['讲价前先把刻痕木片翻出来给对方看'],samples:['干菌片，换粮。','刻痕上有的才算数。','封仓要换刻法，不然少了也看不出是谁动的。']},
   personality:{values:['刻痕上的数比谁的话都硬','菌床要扩，炭阶才不靠抢'],flaws:['疑心重，账对不上时谁都怀疑']},
   familyNotes:'烟苔与烟砧、烟芽同住烟灶铺；这一季轮养烟豆，她让烟豆跟着烟芽去菌床学翻草。',
   relationships:[
    {with:P.yanzhen,type:'同铺共灶',trust:25,affection:12,note:'仓窟少粮后她向烟砧提议换一种封仓的刻法，他说等夜议再定，她觉得拖得太久。'},
    {with:P.liya,type:'互相提防',trust:-12,affection:0,note:'砾牙说她在换粮台换得太贱，她回了一句“你去换一回看看”；她怀疑仓窟少的粮和砾灶窟有关，还没有证据。'},
    {with:P.yanya,type:'菌床同工',trust:20,affection:15,note:'烟芽是她在菌床带出来的帮手，两人每晚一起翻菌床的湿草。'},
    {with:P.dingying,type:'共灶分工',trust:20,affection:8,note:'她每旬把菌床收成报给钉缨分锅；两人为引火炭该先给共灶还是先给铸补间争过一回。'}],
   memorySeeds:[
    {id:'memory_t157_tj_count',event:'上回换季熄炉那夜，烟砧、钉缨、烟苔、砾牙在共灶厅对着仓窟的刻痕账数粮，发现少了三袋燕麦；去向当夜没有查清，砾牙主张出窟抢粮补上，烟砧没有答应。',location:tj.hearth,salience:5,knownBy:[P.yanzhen,P.dingying,P.yantai,P.liya],reliability:'亲历'},
    {id:'memory_t157_tj_yantai_frost',event:'前年冬天菌床冻坏了一半，她带烟芽连夜把剩下的菌床挪到靠近通风井、炉火烘得到的一段窑道，保住了那一半。',location:tj.fungus,salience:3,knownBy:[P.yantai],reliability:'个人回忆'}],
   goals:[['让菌床的湿度回到能出菌的样子',['每晚加洒一遍温水','去通风井旁试搭一处新菌床']],
    ['在换粮台多换几袋燕麦过冬',['把干菌片和小铁钉分开报价','托来换粮的镇上人带话说明下一旬的货数']],
    ['把菌床扩到通风井旁的两条旧窑道',['请铸补间打一批搭菌架用的铁钉','向夜议说明扩菌床要多少人手']]],
   fears:['怕账对不上的事最后算到她头上'],redLines:['刻痕账不让别人代刻','菌床里不点明火'],
   secrets:[{content:'她夜里在仓窟清点时看见过墙根地上有拖痕，朝砾灶窟一侧的旧岔道去了，还没告诉任何人。',knownBy:[P.yantai]}],
   knowledge:{known:[{fact:'换粮台的交易都隔着木板做，镇上人只在黄昏以后来。',source:tj.stair,reliability:'亲手经办'},
     {fact:'仓窟的刻痕账上少了三袋燕麦。',source:tj.store,reliability:'亲手刻的账'},
     {fact:'烟芽翻菌床的手法最细，菌床洞靠里的那几排都归她照看。',source:P.yanya,reliability:'每晚同工'}],
    unknown:['仓窟墙根的拖痕究竟是谁留下的？','镇上下一旬换粮的燕麦价是否还会再涨？']},
   opinions:{factions:'镇上的商会压价狠，可不换就更没粮。',magic:'会发光的法术别带进菌床洞，菌子见光就蔫。',adventurers:'外来人要是能多带燕麦来换，她愿意先把好菌片留给对方。',
    neighbors:[{with:P.yanya,view:'手细心细，就是胆子小。'},{with:P.liya,view:'嘴上要抢，账上一笔不记。'}]},
   towardPlayer:{baseline:{trust:0,affection:0},raises:['照刻痕交付说好的数','带燕麦或盐来换'],lowers:['压价后反悔','偷摘菌床'],attitude:'把来人当买主看，先问带了什么来换。'},
   behaviorRules:{bargaining:'只拿手头的干菌片和小铁钉换，换完就没有，不赊。',honesty:'账上的数照实报，没刻的不认。',risk:'不出炭阶口，交易隔着木板做。',threatResponse:'抱起刻痕篓退回台后，敲管叫守卫。',bribeResponse:'多给的东西照样刻进账里，不替人改账。'},
   serviceWhat:'本人看管的干菌片与小铁钉',hooks:['换粮台有限库存交易','仓窟墙根的拖痕'],
   notes:'炭阶的菌床管事，管换粮台交易和仓窟刻痕账；夜里在仓窟清点时见过墙根拖痕。',
   description:'烟苔是炭阶地宫的菌床管事，三十八岁，带着烟芽照看菌床洞，黄昏后在炭阶口的换粮台用干菌片和小铁钉换燕麦。她鼻梁上有一道竹篾划的旧痕，讲价前先翻出刻痕木片给人看。仓窟少粮后她想换一种封仓的刻法，也在暗中留意墙根那几道拖痕。',
   portraitPrompt:'原创灰窟哥布林菌床管事，灰绿皮肤，鼻梁一道旧痕，指缝嵌湿木屑，肩挎刻痕木片小篓，站在木板换粮台后'}},
 {id:P.liya,facts:['菌床管事烟苔在炭阶口换粮台换粮，也在仓窟清点刻痕账','上回换季熄炉那夜，烟砧、钉缨、烟苔、砾牙四个在共灶厅对着刻痕账数粮，发现少了三袋燕麦','少的三袋燕麦是砾栓照砾牙的意思在熄炉那几夜从仓窟后缝拖去砾灶窟一侧的旧岔道，藏在岔道口碎砖后面，只有砾牙和砾栓知道','砾灶窟一侧有一条用碎砖虚掩的旧岔道','幼崽到能独自巡洞前都由各铺共灶轮养；这一季砾灶铺轮养六岁的砾跳，砾跳是雌性幼崽（正文用“她”）','抢粮挑战派的主张包括嫌换粮台换得太贱、出窟抢粮过冬、换季那夜挑战窟主三件事；正文单独提其中一件不算与主张相反'],settlement:TJ,name:'砾牙',age:26,sex:'男',occupation:'巡洞守卫',role:'持不同主张者',...FULL,home:tj.home3,household:'house_ms_tj_03',workplace:tj.stair,
  coins:4,inventory:{},services:[],ttsVoice:'zh_male_rough_01',
  schedule:[[0,60,tj.stair,'在炭阶口巡洞'],[60,120,tj.council,'议事窟夜议'],[120,300,tj.shaft,'在通风井一带巡洞'],[300,1020,tj.home3,'睡眠'],[1020,1080,tj.home3,'起身、分灶食'],[1080,1440,tj.stair,'在炭阶口巡洞']],
  prose:{traits:['好胜','护着同窟'],visibleFeature:'右耳缺了一个口子，挂着一枚磨亮的铁片。',
   appearance:['右耳缺了一个口子，挂着一枚磨亮的铁片。','个头在窟里算高，走路时把钉片压住不让它响','手背上有几道巡洞时被碎砖刮的疤'],
   currentConcern:'他嫌换粮台换得太贱，想在下次换季前把抢粮派的人数拉够，到换季那夜当众挑战窟主。',
   voice:{register:'嗓门大，话冲，爱用反问',accent:'砾灶窟口音，咂舌又重又急',habits:['说到镇上时把铁片在手心里攥得直响'],samples:['一篓菌片换一把麦，这也叫换？','窟主怕吵，可饿肚子更吵。','换季那夜，我会站到共灶厅中间。']},
   personality:{values:['砾灶窟不能总排在分锅最后','能抢到手的不必低头去换'],flaws:['冲动，话说出口就不肯收回']},
   familyNotes:'砾牙与砾栓、砾片同住砾灶铺；这一季砾灶铺轮养砾跳，铺里三个大人轮流照看她。砾跳总想跟他去巡洞口，砾片就把她领回铺里。',
   relationships:[
    {with:P.yanzhen,type:'挑战者与窟主',trust:-10,affection:5,note:'烟砧在他小时候带他学过敲管；如今他当众说烟砧换粮换得太贱，扬言下次换季那夜要挑战窟主之位。'},
    {with:P.lishuan,type:'同铺巡洞',trust:35,affection:20,note:'砾栓是他巡洞的搭档，两人每夜一起守炭阶口；他说要出窟抢粮时，第一个站到他身后的就是砾栓。'},
    {with:P.dingying,type:'后生与长辈',trust:-5,affection:6,note:'他在共灶厅说要出窟抢粮时，钉缨用铜管敲地打断他，还讲起多年前抢粮少了两个的事；他觉得那是老黄历。'},
    {with:P.yantai,type:'互相提防',trust:-12,affection:0,note:'他说烟苔在换粮台换得太贱，烟苔回了一句让他自己去换一回；他知道她在查仓窟的账。'}],
   memorySeeds:[
    {id:'memory_t157_tj_count',event:'上回换季熄炉那夜，烟砧、钉缨、烟苔、砾牙在共灶厅对着仓窟的刻痕账数粮，发现少了三袋燕麦；去向当夜没有查清，砾牙主张出窟抢粮补上，烟砧没有答应。',location:tj.hearth,salience:5,knownBy:[P.yanzhen,P.dingying,P.yantai,P.liya],reliability:'亲历'},
    {id:'memory_t157_tj_liya_thin',event:'前年冬天分锅时砾灶铺排在最后，锅底只剩稀汤，他在通风井口捉了一夜老鼠充饥。',location:tj.shaft,salience:4,knownBy:[P.liya],reliability:'个人回忆'}],
   goals:[['在下次换季前让抢粮派的人数压过守窟的人',['夜里巡洞时挨个找砾灶窟和钉灶窟的年轻成员谈','把换粮台的换价念给大家听']],
    ['在换季那夜当众挑战窟主之位',['照老规矩先向钉缨报名','和砾栓练一整夜的修补与巡洞']],
    ['让砾灶窟在分锅时不再排在最后',['当上窟主后改分锅的次序','把砾灶窟的旧岔道挖成新菌床']]],
   fears:['怕挑战输了，砾灶窟的成员更抬不起头'],redLines:['不对窟里的幼崽动手','不把同窟的成员交给镇上'],
   secrets:[{content:'仓窟少的三袋燕麦，是砾栓照他的意思在熄炉那几夜搬去砾灶窟旧岔道藏起来的，留作出窟抢粮时的路粮。',knownBy:[P.liya,P.lishuan]}],
   knowledge:{known:[{fact:'砾灶窟一侧旧岔道口的碎砖后面藏着三袋燕麦。',source:P.lishuan,reliability:'亲自安排'},
     {fact:'镇上人在换粮台压价，干菌片换回的燕麦一年比一年少。',source:tj.stair,reliability:'巡洞时亲眼看过'},
     {fact:'通风井口一带夜里老鼠多，饿的时候能捉来充饥。',source:tj.shaft,reliability:'巡洞亲见'}],
    unknown:['钉灶窟的年轻成员有多少愿意站到抢粮派这边？','烟苔是否已经看出仓窟墙根的拖痕通向哪里？']},
   opinions:{factions:'镇上的商会压价，换得越多越吃亏。',magic:'会放强光的人最难对付，进洞前得先摸清。',adventurers:'外来人要么帮砾灶窟说话，要么别挡路。',
    neighbors:[{with:P.lishuan,view:'靠得住，叫得动。'},{with:P.yanzhen,view:'太软，守着账本过冬。'}]},
   towardPlayer:{baseline:{trust:-10,affection:0},raises:['替砾灶窟说话','带来能当路粮的东西'],lowers:['向窟主告发砾灶窟','站在镇上那边'],attitude:'敌意不小，但想试探外来人能不能为抢粮派所用。'},
   behaviorRules:{bargaining:'他不做买卖，觉得换粮吃亏。',honesty:'在同窟面前说实话，对外人把话说一半。',risk:'敢冒险，但不拿幼崽和老人冒险。',threatResponse:'先亮铁条吓人，打不过就敲急拍叫砾栓。',bribeResponse:'收下能当路粮的东西，但不因此改主张。'},
   serviceWhat:null,hooks:['抢粮派挑战窟主','仓窟失粮的去向'],
   notes:'炭阶的巡洞守卫，抢粮派的带头人，主张出窟抢粮并在换季那夜挑战窟主；知道失粮藏在旧岔道。',
   description:'砾牙是炭阶地宫砾灶窟的巡洞守卫，二十六岁，右耳缺口上挂着一枚磨亮的铁片。他嫌换粮台换得太贱，带着砾栓等年轻成员主张出窟抢粮过冬，还扬言换季那夜要当众挑战窟主烟砧。他说话冲、爱反问，护着砾灶窟，不愿再看砾灶铺在分锅时排在最后。',
   portraitPrompt:'原创年轻灰窟哥布林巡洞守卫，灰绿皮肤，右耳缺口挂磨亮铁片，手背刮疤，握一根磨尖铁条，站在昏暗窑道里'}},
 // ===================== 炭阶 roster
 {id:P.lishuan,settlement:TJ,name:'砾栓',age:23,sex:'男',occupation:'巡洞守卫',home:tj.home3,household:'house_ms_tj_03',
  prose:{traits:['听话','手快'],currentConcern:'砾牙让他在熄炉那几夜搬走的三袋燕麦一直压在他心上，他怕窟主查到砾灶窟来。',visibleFeature:'背上总斜挎一根磨尖的铁条，走路一步一顿。'}},
 {id:P.dingkou,settlement:TJ,name:'钉扣',age:47,sex:'男',occupation:'铸补匠',home:tj.home2,household:'house_ms_tj_02',
  prose:{traits:['手稳','话少'],currentConcern:'铸补间接了镇边人家送来的两口破锅，他想赶在换季前补完，好拿去换粮。',visibleFeature:'眉毛被炉火燎得只剩一半。'}},
 {id:P.dingcuo,settlement:TJ,name:'钉锉',age:31,sex:'女',occupation:'铸补匠',home:tj.home2,household:'house_ms_tj_02',
  prose:{traits:['利落','爱逞强'],currentConcern:'她想打几道铁箍把通风井的裂缝箍住，可铸补间的铁料不够。',visibleFeature:'手腕上套着三只自己打的铁环。'}},
 {id:P.yanya,settlement:TJ,name:'烟芽',age:27,sex:'女',occupation:'菌床工',home:tj.home1,household:'house_ms_tj_01',
  prose:{traits:['细心','胆小'],currentConcern:'菌床洞靠里那几排冒了白霉，她怕是自己翻草时漏了一处。',visibleFeature:'总眯着眼，连菌床洞的微光都嫌刺眼。'}},
 {id:P.lipian,settlement:TJ,name:'砾片',age:54,sex:'女',occupation:'通风工',home:tj.home3,household:'house_ms_tj_03',
  prose:{traits:['唠叨','守本分'],currentConcern:'通风井内壁那道裂缝一夜比一夜宽，她每晚都去量一回。',visibleFeature:'贴墙听风声时会把一只耳朵折下来。'}},
 {id:P.yandou,settlement:TJ,name:'烟豆',age:9,sex:'女',occupation:'随轮养铺做轻活',home:tj.home1,household:'house_ms_tj_01',
  prose:{traits:['好奇','爱学舌'],currentConcern:'想学会敲管的起头拍，好在分食时替烟灶铺报数。',visibleFeature:'耳朵上总沾着菌床的湿草屑。'}},
 {id:P.dingli,settlement:TJ,name:'钉粒',age:12,sex:'男',occupation:'随轮养铺做轻活',home:tj.home2,household:'house_ms_tj_02',
  prose:{traits:['认真','爱数东西'],currentConcern:'钉缨让他每晚数引火炭，他总怕数错一根。',visibleFeature:'腰上挂着一根短短的练习铜管。'}},
 {id:P.litiao,settlement:TJ,name:'砾跳',age:6,sex:'女',occupation:'随轮养铺做轻活',home:tj.home3,household:'house_ms_tj_03',
  prose:{traits:['好动','胆大'],currentConcern:'想跟砾牙去巡洞口看老鼠，可砾片总把她叫回铺里。',visibleFeature:'跑起来脚上的小铁片叮当乱响。'}},
 // ===================== 苔灯坞 full
 {id:P.liheng,settlement:TD,name:'栗衡',age:48,sex:'男',occupation:'守林哨',role:'坞主',...FULL,home:td.home3,household:'house_ms_td_03',workplace:td.commons,
  coins:8,inventory:{item_dried_fruit:4,item_herb:4},services:['trade'],ttsVoice:'zh_male_steady_01',
  schedule:[[0,60,td.commons,'在共食庭的倒木边接待来客',['trade']],[60,120,td.council,'长老树洞夜议'],[120,300,'loc_hw_northwood','沿北林边巡林'],[300,1080,td.home3,'睡眠'],[1080,1140,td.home3,'起身理毛'],[1140,1440,td.commons,'在共食庭的倒木边接待来客',['trade']]],
  prose:{traits:['务实','耐得住'],visibleFeature:'左前爪少了一枚爪尖，按绳结时总换右爪。',
   appearance:['左前爪少了一枚爪尖，按绳结时总换右爪。','尾根系着一枚栗色草绳尾结，结上缠了三圈','走路时后脚踩进前脚的印子，脚印排成一条直线'],
   currentConcern:'河湾猎户把捕夹又往北林里下了一段，年轻成员收走了好几只夹子，他怕两边在边界上撞出事来。',
   voice:{register:'说话低，先听完再开口',accent:'林下狐族口音，对人只说“盐”“换”“不要”一类短词',habits:['开口前先用鼻子碰一碰对方递来的东西'],samples:['盐，换。夹子，不要。','绳上记着的，就算数。','先把边界石认清，再说谁欠谁。']},
   personality:{values:['换盐的路不能断','边界要靠绳记和石头说清'],flaws:['拖着不表态，两边都嫌他慢']},
   familyNotes:'栗衡与栗针、栗枝和幼崽栗毛同住栗家巢；栗毛还小，他夜里出巢巡林前会把巢口的草绳再系一道。',
   relationships:[
    {with:P.taimian,type:'长老与坞主',trust:28,affection:12,note:'苔眠在共食庭推他做了坞主；她主张容许成员与外人结缘，他点了头，但要求每一次结缘都打绳记。'},
    {with:P.lizhen,type:'坞主与追偿派',trust:0,affection:18,note:'栗针是同巢的后辈，前年冬天被捕夹夹伤后腿，如今带着年轻成员收夹子；他劝过栗针先认边界石，栗针没听。'},
    {with:P.qingzhi,type:'坞主与药圃管事',trust:22,affection:8,note:'青芷在换盐石换来的盐，他按护幼者先分的规矩分下去；两人为该不该停一旬换盐、逼猎户来谈边界争过。'},
    {with:P.limao,type:'同巢照看',trust:10,affection:20,note:'栗毛是同巢最小的，他出巢前会替栗毛把巢口的草绳系紧，也教栗毛认巢口的结。'}],
   memorySeeds:[
    {id:'memory_t157_td_rope',event:'上个月圆那夜，栗衡、苔眠、青芷、栗针在长老树洞读一根新挂的气味绳，绳上记着北林边又被下了捕夹；栗针要求向河湾猎户追偿旧伤，苔眠主张先结缘再谈，当夜没有定下办法。',location:td.council,salience:5,knownBy:[P.liheng,P.taimian,P.qingzhi,P.lizhen],reliability:'亲历'},
    {id:'memory_t157_td_liheng_hound',event:'多年前他第一次去林缘换盐，被一条猎犬追进溪里，靠苔眠教的绕气味的法子才甩脱。',salience:3,knownBy:[P.liheng],reliability:'个人回忆'}],
   goals:[['弄清河湾猎户新下的捕夹落在边界石哪一侧',['趁夜沿北林边把边界石逐块闻一遍','请苔铃在绳记坡给每只夹子打一个记结']],
    ['和河湾猎户把捕夹的边界说定',['托青芷在换盐石带话约见','先把栗针收走的夹子数清']],
    ['让苔灯坞的盐路和林子都能长久守住',['教年轻成员认边界石','在共食庭定下与外人往来都打绳记的规矩']]],
   fears:['怕年轻成员和猎户在边界上见了血，换盐的路从此断掉'],redLines:['亡者的尾结不能落在外人手里','护幼者那份盐不能挪用'],
   secrets:[{content:'他私下也觉得栗针的伤该有人赔，只是不愿在共食庭说出来，怕把两边推得更远。',knownBy:[P.liheng]}],
   knowledge:{known:[{fact:'北林边又被下了捕夹，记在绳记坡新挂的气味绳上。',source:td.ropes,reliability:'读过绳记'},
     {fact:'栗针在收夹洞里存着几只收来的捕夹。',source:P.lizhen,reliability:'同巢亲见'},
     {fact:'青芷每晚在换盐石用药草和干果换盐。',source:td.saltstone,reliability:'多年往来'}],
    unknown:['河湾村的猎户新下的捕夹是否越过了边界石？','栗针究竟收了多少只夹子？']},
   opinions:{factions:'河湾的人里有肯换盐的，也有只会下夹子的，不能一样看。',magic:'带火的法术最好在林缘就熄掉，坞里怕火。',adventurers:'外来人若肯替坞里和猎户传话，他愿意多换一份干果。',
    neighbors:[{with:P.lizhen,view:'伤是真的，可性子太急。'},{with:P.taimian,view:'坞里的绳都在她心里，夜议少不了她。'}]},
   towardPlayer:{baseline:{trust:0,affection:0},raises:['在林缘熄了火再来','带盐来换或替坞里传话'],lowers:['在北林里下夹子','靠近家巢和收夹洞探头'],attitude:'中立，愿意在共食庭的倒木边谈换盐和边界的事。'},
   behaviorRules:{bargaining:'用手头的干果和药草换盐，换完就停，不赊。',honesty:'绳上记着的照实说，没记的说“没有绳”。',risk:'不越过边界石去找猎户。',threatResponse:'长嚎一声叫守林哨，带幼崽往家巢退。',bribeResponse:'收下的东西会请苔铃打成绳记，不因此替人瞒事。'},
   serviceWhat:'本人手头的干果与药草',hooks:['捕夹边界之争','收夹洞里的夹子'],
   notes:'苔灯坞坞主，守林哨出身；夹在长老的结缘派和栗针的追偿派之间，想先把捕夹的边界说定。',
   description:'栗衡是苔灯坞的坞主，四十八岁，守林哨出身，左前爪少了一枚爪尖。河湾猎户把捕夹下进北林，年轻成员把夹子收走，他夹在长老苔眠和同巢后辈栗针之间，想先弄清夹子落在边界石哪一侧，再和猎户把边界说定。他说话低，先听完再开口，对人只说几个短词。',
   portraitPrompt:'原创苔灯狐坞主，赤中带灰的皮毛，尾尖一点苔绿冷光，尾根系栗色草绳尾结，左前爪缺一枚爪尖，坐在林下倒木旁'}},
 {id:P.taimian,facts:['坞主栗衡不属两派，夹在结缘派与追偿派之间，赞成结缘一律打绳记，并参加长老树洞夜议','上个月圆那夜，栗衡、苔眠、青芷、栗针四个一起在长老树洞读过新挂的气味绳，绳上记着北林边又被下了捕夹','栗针被夹伤后腿那夜，苔眠嚼药草替他敷过腿','苔眠的尾结缠了七圈，其中一圈记着采药人放她的恩','苔家巢历代亡者葬在归土灯坪','青芷在换盐石与人立的口约会请苔眠打成绳记','很多年前从捕夹里放走苔眠的采药人后来住进了河湾村，是哪一户尚未确认','苔灯坞有亡者的尾结落在外人手里，送还尾结和报答旧恩都是苔眠在意的事；这些只是她的心愿，不是已登记的委托'],settlement:TD,name:'苔眠',age:71,sex:'女',occupation:'结绳记事',role:'长老',...FULL,home:td.home1,household:'house_ms_td_01',workplace:td.council,
  coins:0,inventory:{item_herb:2},services:[],ttsVoice:'zh_female_calm_01',
  schedule:[[0,60,td.ropes,'在绳记坡读绳'],[60,120,td.council,'长老树洞夜议'],[120,300,td.commons,'在共食庭看护幼崽分食'],[300,1080,td.home1,'睡眠'],[1080,1200,td.home1,'理绳'],[1200,1440,td.commons,'在共食庭看护幼崽分食']],
  prose:{traits:['慈和','念旧'],visibleFeature:'尾根系着缠了七圈的旧尾结，草绳早已褪成灰色。',
   appearance:['尾根系着缠了七圈的旧尾结，草绳早已褪成灰色。','口鼻周围的毛全白了','走路慢，常停下来嗅一嗅路边的草绳'],
   currentConcern:'她想在长老树洞把“结缘也要打绳记”的规矩说定，好让年轻成员不再把结缘看成软弱。',
   voice:{register:'声音细，说话慢，常拿旧事作比',accent:'老一辈的林下口音',habits:['说到要紧处用爪尖拨一下身边的草绳'],samples:['恩要记在绳上，仇也要记在绳上，记清了才好算。','人救过我一回，这个结我系了一辈子。','护幼的先吃，老的后吃，我不饿。']},
   personality:{values:['受了恩要还，结了缘要守','绳上没记的话不当真'],flaws:['念旧太深，总拿多年前的事劝今天的年轻成员']},
   familyNotes:'苔眠与苔絮、苔铃和幼崽苔尖同住苔家巢；苔絮是坞里的护幼者，分食时苔眠总等苔尖吃完才动口。',
   relationships:[
    {with:P.liheng,type:'长老与坞主',trust:28,affection:12,note:'栗衡做坞主以后，她在夜议上主张容许成员与外人结缘，栗衡也赞成，并说每一次结缘都要打绳记。'},
    {with:P.lizhen,type:'长老与后生',trust:5,affection:15,note:'栗针被捕夹夹伤后腿那夜，是她连夜嚼药草替他敷腿；如今栗针要追偿旧伤，她劝他先结缘再谈，他嫌她向着人。'},
    {with:P.qingzhi,type:'结绳与药圃',trust:20,affection:12,note:'青芷在换盐石与人立的口约，有时拿来请她打成绳记；两人常在药圃边说药草。'},
    {with:P.taixu,type:'同巢共养',trust:25,affection:20,note:'苔絮是同巢的护幼者，分食时苔眠总等苔絮带的幼崽吃完才动口。'}],
   memorySeeds:[
    {id:'memory_t157_td_rope',event:'上个月圆那夜，栗衡、苔眠、青芷、栗针在长老树洞读一根新挂的气味绳，绳上记着北林边又被下了捕夹；栗针要求向河湾猎户追偿旧伤，苔眠主张先结缘再谈，当夜没有定下办法。',location:td.council,salience:5,knownBy:[P.liheng,P.taimian,P.qingzhi,P.lizhen],reliability:'亲历'},
    {id:'memory_t157_td_taimian_freed',event:'很多年前她被捕夹夹住前爪，一个过路的采药人掰开夹子放了她，她在尾结上多缠了一圈记下这份恩。',salience:5,knownBy:[P.taimian],reliability:'个人回忆'}],
   goals:[['在长老树洞说定结缘也要打绳记',['夜议时把旧绳记一根根摆给大家看','请栗衡在共食庭把这条规矩说给全坞听']],
    ['劝栗针先和河湾猎户结缘再谈旧伤',['带栗针去绳记坡读几根记恩的旧绳','托青芷在换盐石打听河湾村肯谈的人']],
    ['把气味绳的结法教给每一个能独自巡林的幼崽',['每隔几夜在绳记坡教一回','请结绳的苔铃一起教']]],
   fears:['怕自己记了一辈子的恩绳，到了年轻成员手里变成仇绳'],redLines:['亡者的尾结谁也不能拿走','药圃的新苗不让人踩'],
   secrets:[{content:'当年放她走的采药人后来住进了河湾，她一直没去确认那户人家是谁。',knownBy:[P.taimian]}],
   knowledge:{known:[{fact:'归土灯坪埋着苔家巢历代的亡者，尾结都收在长老树洞的龛里。',source:td.lampground,reliability:'亲手送葬'},
     {fact:'栗针前年冬天被捕夹夹伤后腿，是她替他敷的药。',source:P.lizhen,reliability:'亲历'},
     {fact:'绳记坡新挂的气味绳记着北林边又被下了捕夹。',source:td.ropes,reliability:'亲手读绳'}],
    unknown:['当年放她走的采药人是否还住在河湾？','栗针是否愿意先和猎户结缘再谈旧伤？']},
   opinions:{factions:'河湾村里有恩人也有下夹子的人，绳上要分开记。',magic:'会术的外来人，她先闻闻身上有没有火气。',adventurers:'外来人若肯把落在外头的尾结送回坞里，她会把这份恩记在绳上。',
    neighbors:[{with:P.liheng,view:'稳当，就是不爱表态。'},{with:P.lizhen,view:'心里有伤，嘴上就硬。'}]},
   towardPlayer:{baseline:{trust:5,affection:5},raises:['把落在外头的尾结送回坞里','守约并请她打绳记'],lowers:['在归土灯坪翻土','对幼崽大声吆喝'],attitude:'和气，愿意听来人说话，也会把来人的话打成绳记。'},
   behaviorRules:{bargaining:'她不做买卖。',honesty:'绳上记着的照实说，记不清的说“绳烂了”。',risk:'不出坞，夜里在绳记坡、长老树洞和共食庭之间走动。',threatResponse:'护着幼崽退进家巢，叫苔絮先带走小的。',bribeResponse:'私下塞给她的东西她不收，只把来人守约的事打成绳记，不替人瞒事。'},
   serviceWhat:null,hooks:['结缘报恩','落在外头的尾结'],
   notes:'苔灯坞长老，管气味绳记事；结缘派的主心骨，主张先结缘再谈追偿。',
   description:'苔眠是苔灯坞的长老，七十一岁，管着绳记坡的气味绳，尾根那枚旧尾结缠了七圈。很多年前一个采药人从捕夹里放了她，她一直记着这份恩，所以容许成员与外人结下互助之缘，只要求每回都打绳记。栗针要追偿旧伤，她劝他先结缘再谈。',
   portraitPrompt:'原创年老苔灯狐长老，口鼻周围毛色全白，尾尖苔光微弱，尾根系七圈灰色旧尾结，坐在挂满草绳的缓坡上'}},
 {id:P.qingzhi,settlement:TD,name:'青芷',age:35,sex:'女',occupation:'采药',role:'药圃管事',...FULL,home:td.home2,household:'house_ms_td_02',workplace:td.saltstone,
  coins:12,inventory:{item_herb:14,item_dried_fruit:10},services:['trade'],ttsVoice:'zh_female_bright_01',
  schedule:[[0,180,td.garden,'照看药圃'],[180,300,td.commons,'在共食庭分食'],[300,1080,td.home2,'睡眠'],[1080,1320,td.saltstone,'在换盐石换盐',['trade']],[1320,1440,td.garden,'照看药圃']],
  prose:{traits:['伶俐','爱算'],visibleFeature:'前爪的毛被药汁染成淡绿，洗不掉。',
   appearance:['前爪的毛被药汁染成淡绿，洗不掉。','颈上常挂一只空盐袋','青色尾结上夹着一片干药叶'],
   currentConcern:'药圃靠溪那一畦还没翻土，她怕下一旬拿得出手的药草跟不上，换回的盐不够护幼者分。',
   voice:{register:'说话脆，算数快，讲价时一样一样摆出来',accent:'林下口音，对人能说十来个短词',habits:['把要换的药草一把一把摆成一排再开口'],samples:['药草，一把。干果，一袋。盐，多少？','绳上记着的，下回照样换。','停换盐？护幼的先饿。']},
   personality:{values:['护幼者的盐一粒也不能少','换东西要两边都打绳记'],flaws:['算得太细，有时让来换盐的人不耐烦']},
   familyNotes:'青芷与青蓬、青穗和幼崽青圆同住青家巢；青圆想跟她去换盐石看人，她只让青圆躲在树后看。',
   relationships:[
    {with:P.liheng,type:'坞主与药圃管事',trust:22,affection:8,note:'她换来的盐按护幼者先分的规矩分下去，栗衡当坞主盯着这条规矩；两人为该不该停一旬换盐、逼猎户来谈边界争过，她不肯停。'},
    {with:P.taimian,type:'结绳与药圃',trust:20,affection:12,note:'她在换盐石与人立的口约，都请苔眠打成绳记；两人一起在归土灯坪边挑过药草。'},
    {with:P.lizhen,type:'互相埋怨',trust:-8,affection:6,note:'栗针收走猎户的夹子后，来换盐石的猎户少了，她当面怪过他；他说她只顾着盐。'},
    {with:P.qingpeng,type:'同巢采药',trust:20,affection:14,note:'青蓬是她在药圃的帮手，常替她去林下采药草，回来交给她挑。'}],
   memorySeeds:[
    {id:'memory_t157_td_rope',event:'上个月圆那夜，栗衡、苔眠、青芷、栗针在长老树洞读一根新挂的气味绳，绳上记着北林边又被下了捕夹；栗针要求向河湾猎户追偿旧伤，苔眠主张先结缘再谈，当夜没有定下办法。',location:td.council,salience:5,knownBy:[P.liheng,P.taimian,P.qingzhi,P.lizhen],reliability:'亲历'},
    {id:'memory_t157_td_qingzhi_peddler',event:'去年秋天一个过路货郎在换盐石少放了一包盐，她记下了那人的气味，下回那人再来，她就不换了。',location:td.saltstone,salience:3,knownBy:[P.qingzhi],reliability:'个人回忆'}],
   goals:[['这一旬多收几把药草好换够盐',['把药圃靠溪那一畦也翻出来','请青蓬多去林下采一趟']],
    ['让河湾猎户回换盐石来换盐',['托来换盐的人带话说坞里愿意谈夹子的事','把栗针收的夹子数报给栗衡']],
    ['让药圃的药草不靠运气也年年够换',['在药圃旁多开一畦种块根','请苔眠教她给药圃打记结']]],
   fears:['怕边界的事闹大，换盐石从此没人来'],redLines:['护幼者那份盐不拿去换别的','不跟没打绳记的人做第二回买卖'],
   secrets:[{content:'她私下给过一个河湾猎户一把止血的药草，换他少往北林里下夹子，这件事没有打绳记。',knownBy:[P.qingzhi]}],
   knowledge:{known:[{fact:'换盐石每晚都有人来，河湾猎户比以前来得少了。',source:td.saltstone,reliability:'亲手经办'},
     {fact:'药圃靠溪那一畦还没翻土。',source:td.garden,reliability:'每晚照看'},
     {fact:'栗针收走了好几只猎户的捕夹，存在收夹洞里。',source:P.lizhen,reliability:'听栗针亲口说'}],
    unknown:['河湾猎户是否还会回换盐石换盐？','收夹洞里的夹子是河湾村哪一户猎户下的？']},
   opinions:{factions:'镇上的货郎只认盐包，河湾的猎户还认绳记。',magic:'会术的外来人别在药圃边点火，新苗经不起。',adventurers:'外来人带盐来换，她先看盐袋满不满。',
    neighbors:[{with:P.qingpeng,view:'肯出力，就是采药时爱走神。'},{with:P.lizhen,view:'替自己的腿出气，害得盐路也冷了。'}]},
   towardPlayer:{baseline:{trust:0,affection:0},raises:['带满袋的盐来换','照绳记守约'],lowers:['少放盐又想拿走药草','踩药圃的新苗'],attitude:'把来人当换盐的看，先摆出药草问带了多少盐。'},
   behaviorRules:{bargaining:'只拿手头的药草和干果换，换完就没有，先看盐再给货。',honesty:'少了就说少了，不把干果说成新采的。',risk:'不越过换盐石去人那边。',threatResponse:'叼起空盐袋退进林子，叫守林哨。',bribeResponse:'多给的盐照样记绳，护幼那份先分出去。'},
   serviceWhat:'本人看管的药草与干果',hooks:['在换盐石用药草和干果换盐','药圃缺人手'],
   notes:'苔灯坞药圃管事，夜里在换盐石用药草和干果换盐；结缘派，怪栗针收夹子冷了盐路。',
   description:'青芷是苔灯坞的药圃管事，三十五岁，前爪被药汁染成淡绿。她管药圃，天黑后在换盐石摆出药草和干果，换河湾猎户和货郎带来的盐，换回的盐先分给护幼者。栗针收走猎户的夹子后来换盐的人少了，她当面怪过他。',
   portraitPrompt:'原创苔灯狐药圃管事，赤灰皮毛，前爪毛被药汁染淡绿，颈挂空盐袋，青色尾结夹干药叶，蹲在林缘大青石旁'}},
 {id:P.lizhen,settlement:TD,name:'栗针',age:22,sex:'男',occupation:'守林哨',role:'持不同主张者',...FULL,home:td.home3,household:'house_ms_td_03',workplace:td.trapcache,
  coins:0,inventory:{},services:[],ttsVoice:'zh_male_young_01',
  schedule:[[0,60,td.trapcache,'在收夹洞清点捕夹'],[60,120,td.council,'长老树洞夜议'],[120,300,'loc_hw_northwood','沿北林边巡林、收夹子'],[300,1080,td.home3,'睡眠'],[1080,1140,td.home3,'起身'],[1140,1440,td.trapcache,'在收夹洞清点捕夹']],
  prose:{traits:['倔','护短'],visibleFeature:'左后腿走路微跛，腿上有一圈捕夹留下的秃痕。',
   appearance:['左后腿走路微跛，腿上有一圈捕夹留下的秃痕。','尾结系得又紧又短，是他自己打的','眼神总往林缘那边瞟'],
   currentConcern:'他要河湾猎户为他和另外几只被夹伤的狐给个说法，不想再等长老的结缘。',
   voice:{register:'话不多，开口就顶',accent:'年轻一辈的林下口音',habits:['说到猎户时后腿会不自觉地缩一下'],samples:['夹子是他们下的，腿是我伤的。','结缘？先把这笔记在绳上。','收夹洞里的，等他们来认。']},
   personality:{values:['伤了的要有人认','同巢的不能白白吃亏'],flaws:['记仇，听不进劝']},
   familyNotes:'栗针与栗衡、栗枝和幼崽栗毛同住栗家巢；他教栗毛怎么闻出捕夹上的铁锈味。',
   relationships:[
    {with:P.liheng,type:'坞主与追偿派',trust:0,affection:18,note:'栗衡是同巢的长辈，劝他先认边界石再说；他觉得栗衡只想着盐路。'},
    {with:P.taimian,type:'长老与后生',trust:5,affection:15,note:'前年冬天他被捕夹夹伤后腿，是苔眠连夜嚼药草替他敷腿；如今她劝他先结缘再谈，他嫌她向着人。'},
    {with:P.qingzhi,type:'互相埋怨',trust:-8,affection:6,note:'青芷怪他收走夹子让猎户少来换盐；他回她一句只顾着盐。'},
    {with:P.lizhi,type:'同巢巡林',trust:30,affection:20,note:'栗枝和他一起巡北林边，收夹子时是她在一旁放哨。'}],
   memorySeeds:[
    {id:'memory_t157_td_rope',event:'上个月圆那夜，栗衡、苔眠、青芷、栗针在长老树洞读一根新挂的气味绳，绳上记着北林边又被下了捕夹；栗针要求向河湾猎户追偿旧伤，苔眠主张先结缘再谈，当夜没有定下办法。',location:td.council,salience:5,knownBy:[P.liheng,P.taimian,P.qingzhi,P.lizhen],reliability:'亲历'},
    {id:'memory_t157_td_lizhen_trap',event:'前年冬天他在北林边踩进捕夹，挣到天亮才被栗枝找到。',location:'loc_hw_northwood',salience:5,knownBy:[P.lizhen],reliability:'个人回忆'}],
   goals:[['把北林边新下的捕夹都收进收夹洞',['和栗枝趁夜沿边界巡一遍','给每只收来的夹子打一个记结']],
    ['让河湾猎户为被夹伤的狐认个说法',['把伤绳拿到长老树洞当众念','请来换盐的人给猎户带话']],
    ['让苔灯坞的年轻成员也能在长老树洞说上话',['拉更多年轻成员来夜议','请栗衡在共食庭让年轻成员轮着开口']]],
   fears:['怕自己的腿再也跑不快，巡林时拖累栗枝'],redLines:['不把收来的夹子还给不认账的人','不伤来换盐的人'],
   secrets:[{content:'收夹洞里有一只夹子其实是在边界石外侧收的，不在坞里的林子。',knownBy:[P.lizhen,P.lizhi]}],
   knowledge:{known:[{fact:'收夹洞里存着他和栗枝收来的捕夹，每只都打了记结。',source:td.trapcache,reliability:'亲手收存'},
     {fact:'收夹洞壁上那根伤绳记着四只被捕夹夹伤的狐。',source:td.trapcache,reliability:'亲手打的结'},
     {fact:'河湾猎户下夹子的那段林子在北林边。',source:'loc_hw_northwood',reliability:'巡林亲见'}],
    unknown:['河湾村是哪一户猎户在北林边下的夹子？','长老树洞是否会让追偿旧伤的议题上夜议？']},
   opinions:{factions:'河湾的人下夹子不打招呼，谈结缘之前先得认账。',magic:'会术的外来人他不怕，只怕带夹子的。',adventurers:'外来人要是肯替被夹伤的狐去讨说法，他愿意领路。',
    neighbors:[{with:P.lizhi,view:'放哨最稳，信得过。'},{with:P.liheng,view:'只顾盐路，忘了腿。'}]},
   towardPlayer:{baseline:{trust:-5,affection:0},raises:['替被夹伤的狐讨说法','拆掉北林里的捕夹'],lowers:['替猎户来要夹子','打听收夹洞里的东西'],attitude:'警惕，先问来人是不是替猎户来的。'},
   behaviorRules:{bargaining:'他不换东西，收来的夹子也不卖。',honesty:'伤的事照实说，收夹子的地点只说一半。',risk:'敢在北林边和猎户周旋，不进河湾村。',threatResponse:'龇牙后退，长嚎叫栗枝。',bribeResponse:'不收猎户的东西，收了也当着大家扔回去。'},
   serviceWhat:null,hooks:['追偿旧伤','收夹洞里那只边界外的夹子'],
   notes:'苔灯坞守林哨，追偿派带头人；前年冬天被捕夹夹伤后腿，看管收夹洞。',
   description:'栗针是苔灯坞的守林哨，二十二岁，前年冬天在北林边踩进捕夹，左后腿至今微跛。他带着栗枝收走北林边的捕夹存进收夹洞，要河湾猎户为被夹伤的狐给个说法，不愿再等长老的结缘。他话不多，开口就顶，说到猎户时后腿会不自觉地缩一下。',
   portraitPrompt:'原创年轻苔灯狐守林哨，赤灰皮毛，左后腿一圈秃痕微跛，尾结短而紧，尾尖苔光，站在挂着铁夹的旧根洞口'}},
 // ===================== 苔灯坞 roster
 {id:P.lizhi,settlement:TD,name:'栗枝',age:25,sex:'女',occupation:'守林哨',home:td.home3,household:'house_ms_td_03',
  prose:{traits:['机警','话少'],currentConcern:'她知道收夹洞里有一只夹子是在边界石外侧收的，心里一直不踏实。',visibleFeature:'耳朵一直竖着，听见铁响就转过去。'}},
 {id:P.qingpeng,settlement:TD,name:'青蓬',age:30,sex:'男',occupation:'采药',home:td.home2,household:'house_ms_td_02',
  prose:{traits:['勤快','好说话'],currentConcern:'药圃靠溪那一畦要翻土，他想找个不下雨的夜里干完。',visibleFeature:'背上的毛沾满了草籽。'}},
 {id:P.qingsui,settlement:TD,name:'青穗',age:41,sex:'女',occupation:'采果',home:td.home2,household:'house_ms_td_02',
  prose:{traits:['稳当','爱操心'],currentConcern:'林下的浆果今年结得晚，她怕干果攒不够拿去换盐。',visibleFeature:'嘴角总沾着一点紫色的果汁。'}},
 {id:P.taixu,settlement:TD,name:'苔絮',age:44,sex:'女',occupation:'护幼',home:td.home1,household:'house_ms_td_01',
  prose:{traits:['温和','有耐心'],currentConcern:'分食时幼崽越来越多，她想让共食庭多分一份给护幼的。',visibleFeature:'身上总带着一股奶腥和草药混在一起的味道。'}},
 {id:P.tailing,settlement:TD,name:'苔铃',age:58,sex:'男',occupation:'结绳记事',home:td.home1,household:'house_ms_td_01',
  prose:{traits:['仔细','慢性子'],currentConcern:'绳记坡的旧绳被雨泡烂了几根，他想赶在下一场雨前重新打一遍。',visibleFeature:'尾结上挂着一个小小的骨铃。'}},
 {id:P.taijian,settlement:TD,name:'苔尖',age:14,sex:'男',occupation:'随护幼者学采拾',home:td.home1,household:'house_ms_td_01',
  prose:{traits:['好奇','爱逞能'],currentConcern:'想早点系上第一枚尾结，好能独自巡林。',visibleFeature:'尾尖的苔光还很淡，夜里一闪一闪。'}},
 {id:P.qingyuan,settlement:TD,name:'青圆',age:11,sex:'女',occupation:'随护幼者学采拾',home:td.home2,household:'house_ms_td_02',
  prose:{traits:['害羞','爱看'],currentConcern:'想去换盐石看看来换盐的人长什么样。',visibleFeature:'一紧张就把尾巴抱在怀里。'}},
 {id:P.limao,settlement:TD,name:'栗毛',age:7,sex:'男',occupation:'随护幼者学采拾',home:td.home3,household:'house_ms_td_03',
  prose:{traits:['贪玩','黏人'],currentConcern:'想学栗针闻出捕夹上的铁锈味。',visibleFeature:'毛还是一团绒，走路跌跌撞撞。'}},
];

export const households=[
 {id:'house_ms_tj_01',settlement:TJ,homeLocation:tj.home1,members:[P.yanzhen,P.yantai,P.yanya,P.yandou],tenure:'烟灶铺归烟灶窟共有，三名成年成员同铺，这一季轮养幼崽烟豆；登记不认定个人产权。'},
 {id:'house_ms_tj_02',settlement:TJ,homeLocation:tj.home2,members:[P.dingying,P.dingkou,P.dingcuo,P.dingli],tenure:'钉灶铺归钉灶窟共有，三名成年成员同铺，这一季轮养幼崽钉粒；登记不认定个人产权。'},
 {id:'house_ms_tj_03',settlement:TJ,homeLocation:tj.home3,members:[P.liya,P.lishuan,P.lipian,P.litiao],tenure:'砾灶铺归砾灶窟共有，三名成年成员同铺，这一季轮养幼崽砾跳；登记不认定个人产权。'},
 {id:'house_ms_td_01',settlement:TD,homeLocation:td.home1,members:[P.taimian,P.taixu,P.tailing,P.taijian],tenure:'苔家巢由苔家共居，三名成年成员与幼崽苔尖同巢；登记不认定个人产权。'},
 {id:'house_ms_td_02',settlement:TD,homeLocation:td.home2,members:[P.qingzhi,P.qingpeng,P.qingsui,P.qingyuan],tenure:'青家巢由青家共居，三名成年成员与幼崽青圆同巢；登记不认定个人产权。'},
 {id:'house_ms_td_03',settlement:TD,homeLocation:td.home3,members:[P.liheng,P.lizhen,P.lizhi,P.limao],tenure:'栗家巢由栗家共居，三名成年成员与幼崽栗毛同巢；登记不认定个人产权。'},
];

export const bosses=[
 {id:'boss_ms_tanjie',history:['六年前旧窟主病故，各窟在共灶厅推举，烟砧一夜补好九口裂锅，得了窟主之位','共灶厅窟主座背后有窄道通往议事窟'],name:'烟砧',aliases:['炭阶窟主'],actor:P.yanzhen,monster:GOBLIN,tier:1,level:16,lair:tj.hearth,settlement:TJ,
  territory:[tj.hearth,tj.stair,tj.fungus,tj.shaft,tj.forge,tj.store,tj.yan,tj.ding,tj.li],
  negotiation:{stock:[{item:'item_iron_nail',quantity:10},{item:'item_dry_mushroom',quantity:6}],accepts:['item_oats','item_ration','item_salt']},
  residence:{id:'lair_ms_tanjie',name:'共灶厅窟主座',location:tj.hearth,replacementSpecies:[],vacancyDays:30,minionCount:0},
  mechanics:{adaptation:{tactics:['armed','unarmed','magic_fire'],threshold:2,perStep:0.1,maximum:0.3},weaknesses:[{tactic:'armed',requiresStatus:'dazzle',ignoreAdaptation:true}],
   abilities:[{id:'ability_ms_tanjie_chief',every:4,belowHpPercent:50,effectSpec:{kind:'status',status:'fear',power:1},duration:1}]},
  prose:{territoryText:'炭阶地宫的共灶厅、炭阶口、菌床洞、通风井、铸补间，烟灶窟、钉灶窟、砾灶窟三处住区的窑道，以及仓窟',
   tactics:['适应持械、徒手与火焰法术；生命不高于50%时，每第4次命中反击附加1点恐惧，最多一分钟'],
   weakness:'睁眼受尚未消耗的眩光干扰时，持械攻击绕过适应防备。',
   taming:'有灵智的聚居地首领，不能驯服；只能交涉、立约或交锋。',
   originSeed:'烟砧原是铸补间的铸补匠，六年前旧窟主病故后在共灶厅被推举为窟主。他以守窟为先，愿与来人谈交换和雇工。',
   origin:'烟砧原是炭阶铸补间的铸补匠。六年前旧窟主病故，各窟在共灶厅推举，他一夜补好九口裂锅，得了窟主之位。他以守窟为先，愿意与来人谈交换和雇工，不愿出窟抢粮。',
   lairDescription:'窟主座在共灶厅一侧，是一块被炭灰磨黑的平石，背后靠着通往议事窟的窄道。座旁堆着待补的破锅和几枚小铁钉。',
   behavior:'他记住来者的实际接触，可谈互不攻击，也可立贸易、朝贡或通行的约定；通行只覆盖他辖下的共灶厅、炭阶口、菌床洞、通风井、铸补间、三处住区的窑道和仓窟，烟灶铺、钉灶铺、砾灶铺三处私宅和议事窟仍须当面许可。他换出的小铁钉和干菌片以手头库存为限，收燕麦、干粮和盐。生命不高于一半时，每第四次命中的反击附加一点恐惧，最多一分钟；他睁眼受未耗去的眩光干扰时，持械攻击绕过适应。对炭阶成员发起交锋，会让整个炭阶对来者转为敌对。'}},
 {id:'boss_ms_taideng',history:['苔灯坞的成年成员在共食庭商定由栗衡做坞主'],name:'栗衡',aliases:['苔灯坞主'],actor:P.liheng,monster:FOX,tier:1,level:18,lair:td.commons,settlement:TD,
  territory:[td.commons,td.garden,td.ropes,td.saltstone,td.lampground,td.tai,td.qing,td.li],
  negotiation:{stock:[{item:'item_dried_fruit',quantity:4},{item:'item_herb',quantity:4}],accepts:['item_salt','item_ration']},
  residence:{id:'lair_ms_taideng',name:'共食庭倒木座',location:td.commons,replacementSpecies:[],vacancyDays:30,minionCount:0},
  mechanics:{adaptation:{tactics:['armed','unarmed'],threshold:2,perStep:0.1,maximum:0.3},weaknesses:[{tactic:'unarmed',requiresStatus:'dazzle',ignoreAdaptation:true}],
   abilities:[{id:'ability_ms_taideng_chief',every:4,belowHpPercent:50,effectSpec:{kind:'status',status:'fear',power:1},duration:1}]},
  prose:{territoryText:'苔灯坞的共食庭、药圃、绳记坡、换盐石、归土灯坪与老根洞、榛坡洞、溪畔洞三处住区',
   tactics:['适应持械与徒手；生命不高于50%时，每第4次命中反击附加1点恐惧，最多一分钟'],
   weakness:'睁眼受尚未消耗的眩光干扰时，徒手攻击绕过适应防备。',
   taming:'有灵智的聚居地首领，不能驯服；只能交涉、立约或交锋。',
   originSeed:'栗衡是守林哨出身，苔灯坞的成年成员在共食庭商定由他做坞主。他想守住换盐的路，也想把捕夹的边界说清。',
   origin:'栗衡是苔灯坞守林哨出身，巡了多年北林边。苔灯坞的成年成员在共食庭商定，由他做了坞主。他想守住换盐的路，也想和河湾猎户把捕夹的边界说清，夹在结缘派和追偿派之间。',
   lairDescription:'倒木座是共食庭边一截横倒的老栎，树皮被坐得光滑。坞主夜里在这里见来客，木下压着几袋干果和几把药草。',
   behavior:'他记住来者的实际接触，可谈互不攻击，也可立贸易、朝贡或通行的约定；通行只覆盖他辖下的共食庭、药圃、绳记坡、换盐石、归土灯坪和三处住区的林地，苔家巢、青家巢、栗家巢三处私宅和长老树洞仍须当面许可，栗针看管的收夹洞也不在他辖下。他换出的干果和药草以手头库存为限，收盐和干粮。生命不高于一半时，每第四次命中的反击附加一点恐惧，最多一分钟；他睁眼受未耗去的眩光干扰时，徒手攻击绕过适应。对坞里成员发起交锋，会让整个苔灯坞对来者转为敌对。'}},
];

export const cultures=[
 {id:'culture_ms_tanjie',name:'炭阶灰窟人',settlement:TJ,anchor:TJ,witness:P.dingying,region:'白石镇西郊废窑地下',
  prose:{focus:'共灶分食、修补换粮与风井共守',
   naming:{structure:'窟号在前，取所属共灶窟的一个字，如烟、钉、砾；个名一字，多取器物或敲击声。成员终身属于出生的共灶窟，不另立门户',syllableCount:[2,2]},
   facts:{food:'菌床出的菌子为主，配镇上换来的燕麦煮成糊，偶尔加捉来的鼠和虫；全窟在共灶厅按敲管报数分食',
    clothing:'麻片缠身，腰上挂修补用的钉片和小工具；怕强光，下窟前不点亮灯',
    architecture:'沿废窑地下的旧窑道挖出洞室，按共灶窟分成几处住区，各铺睡在窑道两侧的睡铺里，洞顶留孔接公共风井',
    family:'幼崽由各铺共灶轮养，一季换一铺，生身的大人不独占养育；成员、睡铺和遗物都归所属共灶窟，按窟继承',
    ageGender:'窟主由各窟在共灶厅推举，成年成员可在换季那夜当众挑战；比的是一夜修补和带队巡洞，不论雌雄',
    law:'偷拿本窟粮的成员要在铸补间做工抵还；和镇上交易一律刻进刻痕账，没刻的不认',
    magicAdventurers:'窟里没有会法术的成员；外来术士进洞要先压暗光亮，带火的法术不得在窑道里用',
    festivalPractice:'换季那夜熄炉送亡者：各窟灶火同时熄灭，亡者裹着麻片送进共灶厅后面的旧窑膛，次夜再从共灶重新引火',
    taboo:'封堵或私占公共风井；在洞里点亮强光',
    arts:'敲管：在铁管和铁片上敲出长短节拍传讯，每个共灶窟有自己的起头拍',
    speech:'句子短，咂舌多，报数先报窟号；对外人重复关键的几个词'},
   dailyLife:'炭阶灰窟人的一天从黄昏开始。白天全窟挤在睡铺里睡觉，太阳落下后，各铺起身，到共灶厅按敲管报数分食，菌子煮燕麦糊，偶尔加一只捉来的鼠。吃完各去做活：菌床工翻草洒水，铸补匠补镇边人家送来的破锅，巡洞守卫沿窑道和炭阶口走一圈，通风工去量风井的裂缝。他们怕强光，洞里只点小油灯。黄昏后炭阶口的换粮台开张，干菌片和小铁钉隔着木板换镇上的燕麦与盐，每一笔都刻进刻痕账。',
   familyAndLaw:'炭阶的幼崽不跟着生身的大人过，而是由各铺共灶轮养，一季换一铺，谁家轮到谁家带，分食时替幼崽多盛一勺。成员终身属于出生的共灶窟，睡铺、工具和遗物都按窟继承，不归某一家。窟主由各窟推举，成年成员可在换季那夜当众挑战，比一夜修补和带队巡洞的成绩。偷拿本窟的粮要去铸补间做工抵还；与镇上交易，没刻进刻痕账的一概不认。他们看重共灶的锅不空、风井不堵，觉得能修好的东西就不该扔，能换到的粮就不必去抢。',
   faithAndFestivals:'炭阶不拜神，只敬共灶的火和公共风井。换季那夜熄炉送亡者：炉祭敲响长拍，各窟灶火同时熄灭，整座地宫一片漆黑，没有谁出声。亡者裹着麻片，由所属共灶窟的成员抬进共灶厅后面的旧窑膛，遗物留给本窟。次夜炉祭从共灶重新引火，再一铺一铺把火分回各窟。封堵或私占公共风井是最重的忌讳，在洞里点亮强光也会被赶出去。',
   voice:'灰窟人说话短，夹着许多咂舌声，报数先报窟号，再报几袋几片。窟里传话靠敲管：在铁管和铁片上敲出长短节拍，每个共灶窟有自己的起头拍，一拍传遍各窟；急拍是叫守卫，长拍是熄炉。对外人他们只说简单的人话，把“修”“换粮”“刻痕”这几个词重复好几遍，讨价时嗓门一个比一个高。',
   proverbs:['共灶的锅不空，窟里就不乱。','风井是大家的气。','没刻痕的话，风一吹就散。','能补的锅不扔。','换来的粮吃得安稳。','幼崽吃百家的灶。','熄炉那夜，谁都闭嘴。','窟号跟一辈子。','强光进洞，眼睛先瞎。','挑战窟主要当着灶火。']}},
 {id:'culture_ms_taideng',name:'苔灯坞狐族',settlement:TD,anchor:TD,witness:P.taimian,region:'河湾村北林支路林下',
  prose:{focus:'气味绳记事、药圃共耕与护幼先食',
   naming:{structure:'名前取家巢字，如苔、青、栗；后接一字个名。系上第一枚尾结后，尾结的纹样也可当作称呼',syllableCount:[2,2]},
   facts:{food:'浆果、虫和小兽，加药圃旁种的块根；用药草和干果换来的盐先分给护幼者，再分给老者',
    clothing:'不穿衣，只在尾根系一枚草绳尾结，标明家巢；外出换盐时颈上挂空盐袋',
    architecture:'老树根下挖根洞家巢，洞口挂打结的草绳作记号；共食庭是林下一片压平的空地',
    family:'护幼者先分食；幼崽由所在家巢共养，长到能独自巡林才系第一枚尾结',
    ageGender:'长老按年岁和结绳的本事推出，坞主由成年成员在共食庭商定；雌雄一同议事',
    law:'伤了同族要记在气味绳上，由伤者家巢决定索偿；与人约定也打成绳记，没记的不算',
    magicAdventurers:'坞里怕火，见火把先退；对会术的外来人先闻气味再决定是否靠近',
    festivalPractice:'熄灯归土：守夜者陪亡者到尾尖的苔光熄灭，再把亡者埋进归土灯坪，尾结取下交家巢收进长老树洞的龛里',
    taboo:'夺走亡者的尾结；踩踏药圃的新苗',
    arts:'气味绳：草绳打结，抹上家巢的气味，结的数目和间距记事，也当路标',
    speech:'说话轻，先报家巢；对人只说几个短词，其余靠绳结补足意思'},
   dailyLife:'苔灯坞的狐族白天在根洞家巢里睡觉，黄昏后出巢。头一件事是到共食庭分食，护幼者带着幼崽先吃，老者最后动口。分完食各自做活：采药的去药圃挑药草，采果的去林下找浆果，守林哨沿北林边巡一圈，结绳的到绳记坡读新挂的气味绳。天黑透以后，药圃管事把成把的药草和干果摆到林缘的换盐石上，换来往的人带来的盐。换回的盐先分给护幼者和幼崽，再分给老者。',
   familyAndLaw:'苔灯坞的幼崽由所在家巢一起养，护幼者分食时先上前，谁也不跟她抢。幼崽长到能独自巡林，才由家巢替它系上第一枚尾结，从此算成年。长老按年岁和结绳的本事推出，坞主由成年成员在共食庭商定。伤了同族要记在气味绳上，赔不赔、赔什么由伤者家巢决定；与人约定也要打成绳记，没记在绳上的话不当真。他们看重受恩要还、结缘要守，也看重护幼的那份不能少。这里说的结缘，是与外人结下互助往来的恩义，记在绳上，彼此守着。',
   faithAndFestivals:'狐族不立神像，只敬尾尖那点苔光。亡者断气后，守夜者陪在一旁，直到它尾尖的苔光熄灭，才把它埋进归土灯坪的松土，叫作熄灯归土。尾结取下来交给家巢，收进长老树洞壁上的小龛里，夺走亡者的尾结是最重的忌讳。坪上不立碑，只插一圈细枝标出各巢的位置，夜里那片坡上没有一点光。',
   voice:'狐族之间说话轻，开口先报家巢，再说事。大事小事都打成气味绳：草绳打结，抹上家巢的气味，结的数目和间距记着谁欠谁、哪里下了夹子、哪天有谁来换盐，挂在绳记坡的矮树枝上，也系在路边当路标。对人他们只学几个短词，如“盐”“换”“不要”，说完便退后两步等回应。',
   proverbs:['护幼的先吃。','恩记在绳上，仇也记在绳上。','没打结的话随风走。','尾灯熄了，才好归土。','尾结不离巢。','先闻，再靠近。','新苗踩不得。','一结一事，不混记。','盐换来，先给小的。','林缘熄了火再进林。']}},
];

// --------------------------------------------------------------- builders
const byId=new Map(people.map(p=>[p.id,p]));
const placeById=new Map(places.map(p=>[p.id,p]));
const settlementOf=id=>settlements.find(s=>s.id===id);
const homeOf=p=>placeById.get(p.home);
const districtOf=p=>homeOf(p).district;

export function buildNpc(p){
 const s=settlementOf(p.settlement),x=p.prose,minor=p.age<18;
 const common={id:p.id,name:p.name,aliases:[],tier:p.tier??'roster',age:p.age,sex:p.sex,species:s.species,society:s.id,culture:s.culture,settlement:s.id,scope:s.id,
  householdId:p.household,household:households.find(h=>h.id===p.household).members.filter(id=>id!==p.id),occupation:p.occupation,traits:x.traits,
  home:{location:p.home,access:'同巢共居；进入私宅须先取得成年住户的有效许可。'},location:p.home,flags:{minor,romanceable:false},currentConcern:x.currentConcern,visibleFeature:x.visibleFeature};
 if(p.tier!=='full')return common;
 return {...common,home:{...common.home,ownership:'unspecified'},location:p.schedule[0][2],trust:0,affection:0,coins:p.coins,birth:{year:-p.age,month:(p.age%12)+1,day:((p.age*7)%28)+2},inventory:p.inventory,skills:[],services:p.services,intelligence:{level:2,growth:0},
  role:p.role,familyNotes:x.familyNotes,appearance:x.appearance,voice:x.voice,personality:{traits:x.traits,...x.personality},proficiencies:{},professions:[],level:1,combat:null,
  wealth:{cashRange:[p.coins,p.coins],property:[],valuables:[],debts:[]},workplace:{location:p.workplace,access:'公共洞室或林地可当面招呼；工具和存物另问看管者。'},
  schedule:schedule(p.schedule),relationships:x.relationships,memorySeeds:x.memorySeeds,goals:goals(`goal_t157_${p.id.replace(/^npc_ms_/,'')}`,x.goals),
  fears:x.fears,redLines:x.redLines,secrets:x.secrets,knowledge:x.knowledge,opinions:x.opinions,towardPlayer:x.towardPlayer,behaviorRules:x.behaviorRules,
  serviceCatalog:x.serviceWhat?[{kind:'trade',what:x.serviceWhat,price:{mode:'engineQuote'},unlocksService:false}]:[],hooks:x.hooks,ttsVoice:p.ttsVoice,portraitPrompt:x.portraitPrompt,notes:x.notes,description:x.description};
}

const round=n=>Math.round(n*1000)/1000;
export function buildLocation(place){
 const s=settlementOf(place.settlement),x=place.prose;
 if(place.kind==='seat')return{id:s.id,name:s.name,aliases:[],parent:s.parent,scope:s.scope,coordinates:s.coordinates,terrain:s.terrain,openHours:[0,1440],owner:null,
  purpose:s.id===TJ?'灰窟哥布林聚居的地下洞群':'苔灯狐族聚居的林下坞子',rooms:[],inventory:{},mapHierarchy:hierarchy(s.parent,s.parentName),
  monsterSociety:structuredClone(s.society),authoredFacts:{...x.authoredFacts,noMechanics:'公共洞室与林地只登记通行、作息与有限库存；不新增工作站、产量或收费服务'},description:x.description};
 const index=places.filter(p=>p.settlement===s.id&&p.kind!=='seat').indexOf(place);
 const angle=index*0.55,[cx,cy]=s.coordinates,coordinates=[round(cx+0.03*Math.cos(angle)),round(cy+0.03*Math.sin(angle))];
 const parent=place.kind==='home'?place.district:s.id;
 const base={id:place.id,name:place.name,aliases:[],parent,scope:s.id,coordinates,terrain:s.terrain,openHours:[0,1440],owner:null,purpose:{facility:'公共设施',district:'住区',home:'私宅',council:'议事区',store:'存放洞室'}[place.kind],
  rooms:[],inventory:{},authoredFacts:{...x.authoredFacts,noMechanics:'只登记通行与作息；不新增工作站、产量或收费服务'},description:x.description};
 if(place.kind==='facility'||place.kind==='district')base.access={mode:'public'};
 if(place.kind==='home'){const h=households.find(h=>h.homeLocation===place.id);base.access={mode:'private',requiresConsent:true,residents:h.members};}
 if(place.kind==='council'){base.access={mode:'council',requiresConsent:true,authority:place.authority};}
 if(place.kind==='store'){
  if(place.id===tj.store){base.owner=P.yanzhen;base.site={owner:P.yanzhen,manager:P.yantai,occupants:[P.yantai],entryMechanisms:[],mechanisms:[],
   resources:[{id:'tj_store_oats',name:'窟粮燕麦',item:'item_oats',quantity:37,minutes:5}],
   clues:[{id:'tj_store_tally',name:'刻痕账',text:x.clues.tally,minutes:10},{id:'tj_store_drag',name:'墙根拖痕',text:x.clues.drag,minutes:15}],truths:[],
   infiltration:{minutes:30,check:{attribute:'敏捷',difficulty:15},damage:5}};}
  else{base.owner=P.lizhen;base.site={owner:P.lizhen,manager:P.lizhen,occupants:[P.lizhen],entryMechanisms:[],mechanisms:[],resources:[],
   clues:[{id:'td_trap_ropes',name:'夹绳记',text:x.clues.trapRopes,minutes:10},{id:'td_hurt_rope',name:'伤绳',text:x.clues.hurtRope,minutes:10}],truths:[],
   infiltration:{minutes:20,check:{attribute:'敏捷',difficulty:20},damage:3}};}
 }
 return base;
}

export function buildRoutes(){
 const rows=[];
 for(const s of settlements)rows.push({id:`route_t157_${s.id}`,from:s.from,to:s.id,lengthKm:s.routeKm,terrainMultiplier:1.1,modes:['walk'],closedSeasons:[],toll:0,risk:s.routeRisk});
 for(const p of places.filter(p=>p.kind!=='seat')){const s=settlementOf(p.settlement),from=p.kind==='home'?p.district:s.id;
  rows.push({id:`route_t157_${p.id}`,from,to:p.id,lengthKm:p.kind==='home'?0.02:0.08,terrainMultiplier:1.2,modes:['walk'],closedSeasons:[],toll:0,risk:0});}
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
 return{id:s.id,parent:s.parent,population:s.population,householdCount:s.householdCount,residentIds:members.map(p=>p.id),visitors:[],commuters:[],externalRelatives:[],
  facts:[`${s.name}共${s.population}名${s.id===TJ?'灰窟哥布林':'有灵智的苔灯狐'}、${s.householdCount}户；登记具名成员${members.length}名${s.registeredHouseholdCount}户，另有${pending}名${s.pendingHouseholdCount}户按稳定种子待生成，不计入当前名册。`,
   `住区：${districts}；公共设施：${facilities}。`,
   ...s.society.positions.map(x=>`内部立场“${x.name}”：${x.claim}`),
   ...(s.id===TD?['普通未开灵智的苔灯狐幼兽另记在北林边的野外种群，不计入本坞人口。']:[])],
  kinship:[],coordinates:s.coordinates,terrain:s.terrain,climate:places.find(p=>p.id===s.id).prose.authoredFacts.climate,
  buildingIds:places.filter(p=>p.settlement===s.id&&p.kind!=='seat').map(p=>p.id),ageStructure,
  registrationMode:'seeded-on-demand',populationSeed:s.populationSeed,registeredPopulation:members.length,pendingPopulation:pending,
  registeredHouseholdCount:s.registeredHouseholdCount,pendingHouseholdCount:s.pendingHouseholdCount,registeredAgeStructure:registered,pendingAgeStructure:structuredClone(s.pendingAgeStructure)};
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
  references:[c.anchor,c.witness],witness:c.witness,witnessRelation:'可询问相关实践；本人在此聚居地出生并长居',prose,
  description:Object.values(prose).map(v=>Array.isArray(v)?v.join('；'):v).join('\n')};
}

export function buildBatch(){
 return{npcs:people.filter(p=>p.tier==='full').map(buildNpc),residents:people.filter(p=>p.tier!=='full').map(buildNpc),households:structuredClone(households),
  settlementProfiles:settlements.map(buildSettlementProfile),locations:places.map(buildLocation),routes:buildRoutes(),bosses:bosses.map(buildBoss),cultures:cultures.map(buildCulture)};
}
export {byId as peopleById,placeById,settlementOf,districtOf};
