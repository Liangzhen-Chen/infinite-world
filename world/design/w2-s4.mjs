// T104 authored candidates: space, bound-servant and rite spells. The Taoist
// talisman arrays, the still temple's precepts and ferrying of wandering souls,
// the lamp shrine's altar and kiln rites, the witch's spirit readings and two
// bookshop volumes. Mechanics stay in the existing ritual, mind-space, summon
// and movement consumers; DeepSeek only reviews these fixed drafts.
export const revision='w2-s4-1';

const DAO='npc_bs_077_1',JI='npc_bs_076_3',SHU='npc_bs_078_2',MIAO='npc_bs_080_3',MAGE='npc_bs_077_2',SELLER='npc_hw_luqing';
export const routes={
 道:{profession:'profession_taoist',teacher:DAO,material:'item_s2_talisman',phrase:'一张朱砂黄符'},
 佛:{profession:'profession_monk',teacher:JI,material:'item_s3_incense',phrase:'一支线香'},
 祭:{profession:'profession_priest',teacher:MIAO,material:'item_s3_lamp_oil',phrase:'一小盏灯油'},
 巫:{profession:'profession_witch',teacher:SHU,material:'item_s3_rice',phrase:'一小包祝米'},
 法:{profession:'profession_mage',teacher:null,material:'item_charcoal',phrase:'一份木炭'},
 通:{profession:null,teacher:null,material:'item_charcoal',phrase:'一份木炭'},
};
const open={river:'public',city:'public',port:'public'},guarded={river:'consent',city:'permit',port:'permit'};
const sight={lineOfSight:true};
export const routeOf={};
const spell=(key,name,route,stage,mp,minutes,duration,rangeMeters,effectSpec,effect,extra={})=>{
 const r=routes[route],id=`spell_s4_${key}`;routeOf[id]=route;
 const {law=open,mechanism=effectSpec.operation??effectSpec.summonType??effectSpec.kind,...rest}=extra;
 const op=effectSpec.operation??effectSpec.kind,school=effectSpec.kind==='summon'||['reassign','coordinate'].includes(op)?'召唤':effectSpec.kind==='mind_space'&&op!=='contract_sense'?'空间':'信仰';
 return {id,name,school,aliases:[],scope:null,skill:`skill_s4_${key}`,stage,mp,minutes,duration,durationLimit:duration,rangeMeters,
  difficulty:stage?15:10,materials:[{item:r.material,amount:1}],mechanism,effectSpec,effect,
  learnFee:stage?40:12,learnMinutes:stage?240:120,teachers:r.teacher?[r.teacher]:[],law,...rest};
};
const rite=(operation,power,extra={})=>({kind:'ritual',operation,power,...extra});
const space=(operation,power=1)=>({kind:'mind_space',operation,power});
const servant=(summonType,power)=>({kind:'summon',summonType,power,upkeepMp:1,upkeepMinutes:5});
export const TABLET='feature_s4_rest_tablet';

export const spells=[
 // 道门符阵与驱邪：裴澄在芦衡观授课，施术耗一张朱砂黄符；仪式类须持观中实际颁发的主持资格。
 spell('expel','驱邪符','道',1,6,2,0,10,rite('exorcise',1),'持芦衡观主持资格，对十米内看得见的一个在场低阶邪祟（如游魂、鬼火、瓦灯魅）施符，把它驱离此地；若对象并非邪祟，反伤其1点生命（不致死）并留下误伤记录。神性、高阶或未知灵体无效。'),
 spell('ward_seal','护界符','道',1,6,2,60,1,rite('ward',3),'持芦衡观主持资格，在施术者本人身上立一道护界，60分钟内，施术者在此地时，游魂、鬼火一类灵体不再新寻来近身；已在眼前的不受影响，离开此地即不再起作用。'),
 spell('door_lock','锁隙符','道',0,3,1,30,3,space('lock_space'),'贴在三米内一道上了机械锁的登记门上，最多30分钟内锁缝被封，门锁着时便越不过这道门；持对应钥匙开锁后门即可通行。须门的主人许可。',{law:guarded}),
 spell('door_alarm','门警符','道',0,3,1,120,3,space('alarm'),'贴在三米内一道登记门框上，最多120分钟内，施术者经过这道门时门框发出警号并记下时刻；只记有人经过，不辨认是谁。须门的主人许可。'),
 spell('seal_way','封界符阵','道',1,8,3,30,3,space('block_space'),'在三米内一道连通两处的登记门户布下符阵，最多30分钟内施术者不能经此门户往来，门前挂出“空间封界：此通道暂时封闭”的公开标示。须门户主人许可。',{law:guarded}),
 spell('mend_rift','补隙符','道',1,8,3,0,3,space('repair_space'),'对三米内一处半径不超过半米、强度不超过1的登记非神性空间裂隙施符，把强度降低1，降到零即闭合；须所在处主人许可。'),
 spell('true_anchor','校锚符','道',0,4,2,0,3,space('calibrate_anchor'),'把三米内一块已有空间锚点、偏移不超过半米的登记锚石校回原位，偏移归零；须锚石主人另给的锚点许可，不新建锚点。'),
 spell('dust_talisman','扫尘符役','道',0,3,1,30,10,servant('dust_servant',100),'以符召出一个尘役，最多30分钟，每5分钟另付1点魔力维持；它在十米内一处登记积尘处每次收去至多100克浮尘，不搬重物。须积尘处主人许可。'),
 spell('home_purify','镇宅符阵','道',0,4,2,0,5,rite('purify_area',1),'持芦衡观主持资格，在施术者周围五米内找出看得见的低阶邪祟，驱离其中一个；圈内没有可确认的低阶邪祟则不能施术。'),
 // 佛门守戒与度亡：季笙在止波寺授课，施术耗一支线香。
 spell('vow_guard','持戒护身','佛',1,6,2,90,1,rite('discipline',10),'持止波寺主持资格，且已入门持续守戒满一天者，为本人立护身，最多90分钟内外来刀棍拳脚与暗影伤害合计吸收10点；一旦破戒或离开施术之地即散。'),
 spell('ferry','度亡','佛',1,10,5,0,5,rite('ferry',1,{destination:TABLET}),'持止波寺主持资格，对五米内看得见的一个在场无主的低阶游魂诵经度亡：它从此地散去、不再回来，名下记入止波寺度亡牌位，当地游魂数随之少一个。只对游魂有效，不能用于活人、遗体，也不能使人复生。'),
 spell('still_vow','止波立愿','佛',0,2,2,0,1,rite('witness_oath',1),'持止波寺主持资格，为本人当场立下一句不超过80字的愿，作为止波师承见证的誓约存档；只记录所立之愿，不强制履行。'),
 spell('calm_flat','安滩法会','佛',1,12,10,10080,0,rite('consecrate',1,{group:'亡灵'}),'持止波寺主持资格，在有自行聚成亡灵的野外栖地设坛，七天内这里的游魂、鬼火一类亡灵不再新聚成形；已在的照旧，七天后恢复。同一处同类法会不能叠加。'),
 // 灯祠祭礼：苗笙在东街灯祠授课，施术耗一小盏灯油。
 spell('purify','净场','祭',1,8,3,0,10,rite('purify_area',3),'持灯祠主持资格，在施术者周围十米内找出看得见的低阶邪祟，最多驱离三个；圈内没有可确认的低阶邪祟则不能施术。'),
 spell('altar_clean','净坛','祭',0,3,3,0,3,rite('clean_altar',40),'持灯祠主持资格，清理三米内一座完整、属衡檐的登记神坛上受托的普通污染，每次至多除去40点；须神坛保管人许可。'),
 spell('lamp_oath','灯前立誓','祭',0,2,2,0,1,rite('witness_oath',1),'持灯祠主持资格，为本人在灯前立下一句不超过80字的誓言，作为门印证契堂见证的誓约存档；只记录，不强制履行。'),
 spell('lintel_vow','门印守戒','祭',1,6,2,90,1,rite('discipline',6),'持灯祠主持资格，且信奉衡檐、持续守戒满一天者，为本人立护身，最多90分钟内外来刀棍拳脚与暗影伤害合计吸收6点；一旦破戒或离开施术之地即散。'),
 spell('kiln_settle','镇窑灯礼','祭',1,12,10,10080,0,rite('consecrate',1,{group:'妖怪'}),'持灯祠主持资格，在有自行生成器物精怪的野外栖地点灯行礼，七天内这里的瓦灯魅一类器物精怪不再新生成；已在的照旧，七天后恢复。同一处同类灯礼不能叠加。'),
 // 巫祝问灵：舒绵在东街灯祠授课，施术耗一小包祝米。
 spell('spirit_look','观灵','巫',0,2,1,0,10,rite('spirit_sense',1),'持灯祠主持资格，看出十米内看得见的在场灵体各是什么性质（凶或善）、是否低阶、是否带神性；不驱赶，也不说出来历。'),
 spell('spirit_ask','问灵','巫',1,6,5,0,0,rite('spirit_census',1),'持灯祠主持资格，在野外栖地撒米问灵，得知此地登记的自行聚成的灵体各有几只尚未现身、几只在场、累计新聚和已被度亡的数目，以及它们在哪些季节、因何聚成。'),
 // 法师读本（陆青书铺）：空间与役灵。
 spell('sleeve_store','袖里封存','法',0,3,1,30,0,space('store',2),'把手中一件不超过2千克的自有单件物品封进身边的空间夹层，最多30分钟；期满它落在封存时所站之处，可再拾起。'),
 spell('far_take','隔空取物','法',0,3,1,0,10,space('retrieve',2),'把十米内看得见、落在地上的一件不超过2千克的自有单件物品取回手中；别人手里的东西取不到。'),
 spell('rust_bite','蚀锈','法',1,6,2,30,3,space('corrode',1),'对三米内一件登记的无生命金属、木或石料施术，最多30分钟内每分钟按材料抗蚀性削去其完整度；完整度归零即不再挡路挡视线。须物主许可。',{law:guarded}),
 spell('rubble_servant','碎石役','法',1,6,2,60,10,servant('rubble_servant',2000),'召出一个碎石役，最多60分钟，每5分钟另付1点魔力维持；它把十米内一处登记碎石堆的碎石每次至多2千克搬到另一处容量够的登记堆放处。须两处主人许可。'),
 spell('reassign','改派役灵','法',1,6,1,0,10,rite('reassign',1),'让本人在场的两个役灵互换手上已登记的工序，各自仍只做契约里写明的那类活计；须两处作业对象的主人许可。'),
 spell('coordinate','协役','法',1,6,1,0,10,rite('coordinate',2),'让本人在场的两个役灵当即各做一次手上已登记的工序；须作业对象的主人许可。'),
 spell('anchor_cargo','锚送轻物','法',1,10,2,0,3,space('anchor_cargo',2),'站在三米内一块已辨识的锚石旁，把手中一件不超过2千克的自有单件物品送到另一块已辨识的锚石处，物品落在那里的地上；两块锚石各须其主人的锚点许可，相距不超过100公里。'),
 // 通用读本（陆青书铺）：量距与契纹，无职业限制。
 spell('measure','量距','通',0,1,1,0,10,space('measure',1),'量出十米内两件看得见、彼此之间不隔墙的登记对象相距多少米；只读，不需许可。'),
 spell('contract_read','契纹自查','通',0,2,1,0,0,space('contract_sense',1),'查看一份本人是当事人的契约或誓约，签下后哪些条款被改过、改前改后各是什么；不判定谁对谁错。'),
];

// [theory, casting, counter, socialConsequences]
const texts={
 expel:['驱邪符借朱砂黄符上的符纹把一个低阶邪祟逼离此地，只对在场、看得见、十米以内的单个对象有效。邪祟被驱离后从这里消失，不留下任何材料。若认错了对象，符力会反伤对方1点生命，但不致死，并留下误伤记录。','先在芦衡观取得仍有效的主持资格。施术时点燃一张朱砂黄符，看清十米内的目标，用两分钟持符诵咒，符烧尽即发出。','神性、高阶或来历不明的灵体驱不动；目标看不见、超出十米或主持资格失效时无从施术。','芦衡观教人先辨清再施符，误伤普通生灵会留下记录，伤及他人家畜还要赔偿。驱离不等于消灭，雾夜里同类仍可能再聚出新的。'],
 ward_seal:['护界符在施术者本人身上立一道界，60分钟内施术者在这片地方时，游魂、鬼火一类灵体不会再新寻来近身。已经在眼前的灵体不受影响，离开此地后这道界也就不起作用。','先取得芦衡观仍有效的主持资格。站定后烧一张朱砂黄符，用两分钟绕身画界，界成即生效。','只护施术者本人；不能替旁人立界，也不驱赶已到眼前的邪祟。主持资格失效时无从施术。','常有要在雾夜过滩的人请道士同行立界。护界只管灵体不再近身，挡不住野兽与人，过滩仍要结伴、带火把。'],
 door_lock:['锁隙符封住一道上了机械锁的门的锁缝，最多30分钟内，门锁着时便越不过这道门；用对应的钥匙开了锁，门就照常可走。它只加固本来就有的锁，没有锁的门封不住。','取得门主人的许可后，站在门前三米内，把一张朱砂黄符贴在锁旁，用一分钟压实符角。','门没有登记机械锁和钥匙、主人未许可或超出三米时不能施术；钥匙开锁后符不再阻挡。','观里用它在夜间封住经阁。替别人封门须得到门主人同意，擅自封锁他人门户会被当作扰邻。'],
 door_alarm:['门警符贴在一道门框上，最多120分钟内施术者经过这道门时，门框会发出警号，并记下经过的时刻。它只记有人经过，不辨认是谁。','取得门主人许可后，在门框三米内贴一张朱砂黄符，用一分钟念定符纹。','门框不是登记的门、主人未许可或超出三米时不能施术；警号只记时刻，不记身份。','可用来确认自己夜里进出的时刻。警号声响会惊动邻里，在借住的地方使用前先和主人说好。'],
 seal_way:['封界符阵布在一道连通两处的门户上，最多30分钟内施术者不能经过这道门户往来于两处，门前同时挂出“空间封界：此通道暂时封闭”的公开标示。','取得门户主人许可后，站在门户三米内，用三分钟在门槛两侧摆开朱砂黄符布阵。','门户不是登记的、没有连通两处或主人未许可时不能施术；阵期满即撤。','封界必须挂出公开标示，不能悄悄封路。城中封闭公共通道还须当地许可，擅封会被追究。'],
 mend_rift:['补隙符针对一处很小的非神性空间裂隙：半径不超过半米、强度不超过1。每次施符把强度降低1，降到零裂隙就闭合，原本被它挡住的位移路线随之通畅。','取得裂隙所在处主人的许可，站到三米内，用三分钟把朱砂黄符压在裂口上。','更大的裂隙、带神性的异常或主人未许可时不能施术；补上的只是这一处。','芦衡观符室角落那道旧阵残隙就是这样补的。补隙前要先告诉主人，补好后裂隙不再挡路。'],
 true_anchor:['校锚符把一块已有空间锚点、偏移不超过半米的锚石校回原位，偏移归零，之后这块锚石才能稳当地用于传送。它不新建锚点，偏移太大的锚石也校不回来。','取得锚石主人另给的锚点许可，站在三米内，用两分钟把朱砂黄符贴在锚石上校正。','锚石损坏、偏移超过半米、主人未给锚点许可时不能施术。','锚石是主人的财物，校正前必须得到许可；校正后能否借用它传送，仍要主人另行同意。'],
 dust_talisman:['扫尘符役召出一个尘役，最多存在30分钟，每5分钟施术者须另付1点魔力维持。尘役只做一件事：在十米内一处登记的积尘处收走浮尘，每次至多100克；它不搬重物。','取得积尘处主人许可，站在十米内，用一分钟烧符召役，并指定要清扫的地方。','积尘处主人未许可、没有浮尘或超出十米时不能施术；魔力不足维持时尘役散去。','观中常用它清扫经阁书架。尘役只扫浮尘，堆着的杂物仍要人手搬走。'],
 home_purify:['镇宅符阵在施术者周围五米内找出看得见的低阶邪祟，驱离其中一个。圈内若没有可确认的低阶邪祟，这道符阵就布不起来。','先取得芦衡观仍有效的主持资格，站定后用两分钟在身边五米内布下朱砂黄符。','神性或高阶灵体不在驱离之列；五米内看不见邪祟时无从施术。','适合在屋舍、窑口这种窄处使用；范围比灯祠的净场小，一次也只驱离一个。'],
 vow_guard:['持戒护身给已入门守戒的人用：须持续守戒满一天，没有破戒。施成后最多90分钟内，外来刀棍拳脚与暗影伤害合计吸收10点。一旦破戒，或离开施术之地，护身即散。','先在止波寺入门并守戒满一天，再取得仍有效的主持资格。施术时点一支线香，合掌用两分钟诵戒文。','守戒不满一天、已破戒或主持资格失效时不能施术；只护本人。','止波寺以此劝人守戒：护身来自持戒，戒一破就没有了。'],
 ferry:['度亡针对在场、无主的低阶游魂：施术者诵经五分钟后，这个游魂从此地散去、不再回来，名字记入止波寺的度亡牌位，当地游魂的数目随之少一个。它只对游魂有效，不能用于活人或遗体，也不能使任何人复生。','先在止波寺取得仍有效的主持资格。雾夜里找到游魂后，在五米内点一支线香，看着它诵经五分钟。','鬼火、瓦灯魅这类不是游魂的对象度不了；有主、神性或高阶的灵体，以及看不见、超出五米时都不能施术。','滩上人家常请僧人去度溺水而亡者留下的游魂。度走的游魂不会留下材料，止波寺牌位上能查到这一笔。'],
 still_vow:['止波立愿让施术者为本人当场立下一句不超过80字的愿，作为止波师承见证的誓约存档。它只记录所立之愿，不会强制履行。','取得止波寺仍有效的主持资格后，点一支线香，用两分钟把愿说出并确认字句。','愿文空白或超过80字时不能施术；只能为本人立愿。','立愿之后可以拿誓约存档自查。没做到并不会受罚，但寺里人会记得你立过什么愿。'],
 calm_flat:['安滩法会在有自行聚成亡灵的野外栖地设坛，七天内这里的游魂、鬼火一类亡灵不再新聚成形。已在的照旧，七天后恢复原样。同一处同类法会在期限内不能再做一次。','取得止波寺仍有效的主持资格，在栖地点一支线香设坛，诵经十分钟。','没有登记的野外栖地、这里没有自行聚成的亡灵，或同类法会仍在期限内时不能施术。','滩上人家在雾季前常请寺里做一场，七天后若要再安，须重新设坛。'],
 purify:['净场在施术者周围十米内找出看得见的低阶邪祟，最多驱离三个。圈内若没有可确认的低阶邪祟，便不能施术。','取得灯祠仍有效的主持资格，点一小盏灯油，站定后用三分钟环身行礼。','神性或高阶灵体不在驱离之列；十米内看不见低阶邪祟时无从施术。','灯祠在窑场、渡口这类人多处做净场。驱离不等于消灭，同类仍可能再聚。'],
 altar_clean:['净坛清理一座完整、属衡檐的登记神坛上受托的普通污染，每次至多除去40点。它不修补坛体，也不处理普通污染以外的东西。','取得灯祠主持资格和神坛保管人许可，站在三米内，点一小盏灯油，用三分钟擦拭坛面。','坛体残破、不属衡檐、不是受托的普通污染，或保管人未许可时不能施术。','灯祠门印神坛由苗笙保管。替人净坛要先问清是受谁所托。'],
 lamp_oath:['灯前立誓让施术者为本人在灯前立下一句不超过80字的誓言，作为门印证契堂见证的誓约存档。它只记录，不强制履行。','取得灯祠仍有效的主持资格，点一小盏灯油，用两分钟在灯前读出誓言。','誓文空白或超过80字时不能施术；只能为本人立誓。','门印证契堂看重对读与留档，立过的誓日后可以拿出来核对。'],
 lintel_vow:['门印守戒给信奉衡檐、持续守戒满一天的人用。施成后最多90分钟内，外来刀棍拳脚与暗影伤害合计吸收6点；一旦破戒或离开施术之地即散。','先在灯祠入门、信奉衡檐并守戒满一天，再取得仍有效的主持资格。施术时点一小盏灯油，用两分钟对着门印诵读。','守戒不满一天、已破戒、主持资格失效时不能施术；只护本人。','灯祠用它提醒信众守戒，护身的强弱不如止波寺的持戒护身。'],
 kiln_settle:['镇窑灯礼在有自行生成器物精怪的野外栖地点灯行礼，七天内这里的瓦灯魅一类器物精怪不再新生成。已在的照旧，七天后恢复。同一处同类灯礼在期限内不能叠加。','取得灯祠仍有效的主持资格，在栖地点一小盏灯油，行礼十分钟。','没有登记的野外栖地、这里没有自行生成的器物精怪，或同类灯礼仍在期限内时不能施术。','西郊废窑常有瓦灯魅游走，窑工会请灯祠去点灯行礼。'],
 spirit_look:['观灵让施术者看出十米内看得见的在场灵体各是什么性质：凶还是善，是否低阶，是否带神性。它不驱赶灵体，也不说出灵体的来历。','取得灯祠仍有效的主持资格，撒一小包祝米，静看一分钟。','十米内看不见的灵体看不出来；主持资格失效时无从施术。','舒绵教人先观灵再请人驱邪，免得误伤善灵。'],
 spirit_ask:['问灵在野外栖地施术，得知这里登记的自行聚成的灵体各有几只尚未现身、几只在场、累计新聚和已被度亡的数目，以及它们在哪些季节、因何聚成。只读，不改变什么。','取得灯祠仍有效的主持资格，在栖地撒一小包祝米，静候五分钟。','没有登记的野外栖地，或这里没有自行聚成的灵体时不能施术。','滩上人家请巫祝问灵，好决定是否请僧人度亡或做安滩法会。'],
 sleeve_store:['袖里封存把手中一件不超过2千克的自有单件物品封进身边的空间夹层，最多30分钟。期满后物品落在封存时所站的地方，可以再拾起。','手持要封存的单件物品，用一分钟把它推入袖中的夹层。','手里不是单件、超过2千克或不是自己的东西时不能施术。','只适合暂放随身小物。期满物品会落地，在人多处要记得回来取。'],
 far_take:['隔空取物把十米内看得见、落在地上的一件不超过2千克的自有单件物品取回手中。别人手里的东西取不到。','看准落在地上的物品，用一分钟把它牵回掌中。','看不见、超过十米或2千克、不是自己的东西时不能施术。','它只能取回自己掉落的物品，不能拿别人的东西。'],
 rust_bite:['蚀锈作用于一件登记的无生命金属、木或石料，最多30分钟内每分钟削去它的完整度，削去多少取决于材料抗蚀性。完整度归零后，这件东西不再挡路、不再挡视线。','取得物主许可，站在三米内，用两分钟把术力附在材料表面。','活物、植物或未登记的材料不能施术；物主未许可时不能施术。','学馆用它拆除锈死的旧门闩。蚀毁他人器物须先得许可，否则要照价赔偿。'],
 rubble_servant:['碎石役召出一个搬石的役灵，最多存在60分钟，每5分钟施术者须另付1点魔力维持。它把十米内一处登记碎石堆的碎石搬到另一处容量够的堆放处，每次至多2千克。','取得两处主人的许可，站在十米内，用两分钟召役并指定从哪里搬到哪里。','两处主人未许可、目的地容量不足或超出十米时不能施术；魔力不足维持时役灵散去。','学馆清理院角碎砖时常用它。役灵只搬碎石，不拆墙也不运人。'],
 reassign:['改派役灵让施术者在场的两个役灵互换手上已登记的工序。各自仍只做契约里写明的那类活计，改派不能让它们做新的事。','站在两个役灵十米内，用一分钟下令互换。','需要两个在场、属于自己且已有工序的役灵；作业对象的主人未许可时不能施术。','改派只是调换两处活计的先后，役灵能做的事没有增加。'],
 coordinate:['协役让施术者在场的两个役灵当即各做一次手上已登记的工序。','站在两个役灵十米内，用一分钟下令同时动手。','需要两个在场、属于自己且已有工序的役灵；作业对象的主人未许可时不能施术。','急着收工时可以用它多赶一轮，每轮仍按各自的契约限量。'],
 anchor_cargo:['锚送轻物让施术者站在一块已辨识的锚石三米内，把手中一件不超过2千克的自有单件物品送到另一块已辨识的锚石处，物品落在那里的地上。两块锚石各须其主人的锚点许可，相距不超过100公里。','先辨识两块锚石并取得两位主人的锚点许可，站在出发锚石旁，用两分钟把物品送出。','锚石未辨识、偏移、损坏，主人未许可或距离超过100公里时不能施术。','送到的东西落在对方锚石旁的地上，要先和那边的主人说好，以免被当作无主之物。'],
 measure:['量距量出十米内两件看得见、彼此之间不隔墙的登记对象相距多少米。只读，不需要许可。','看准两件对象，用一分钟比量。','看不见、超过十米或两件对象之间隔墙时量不出来。','可用来量院子、门廊尺寸。量得的距离只是读数，不能当作地界证明。'],
 contract_read:['契纹自查查看一份本人是当事人的契约或誓约，签下后哪些条款被改过、改前改后各是什么。它不判定谁对谁错。','取出契约或想定誓约，用一分钟查看契纹。','不是本人参与的契约查不了。','发现条款被改后，仍须找对方或见证人核对；契纹只是线索，不是判决。'],
};
const key=s=>s.id.slice('spell_s4_'.length);
export function spellDraft(s){
 const i=spells.findIndex(row=>row.id===s.id),[theory,casting,counter,socialConsequences]=texts[key(s)],r=routes[routeOf[s.id]];
 const failed=[`心念散开时，已花的魔力、${r.phrase}和施法时间仍计入这一次尝试，目标没有新的术式效果。`,`若收束没有成功，本次魔力与${r.phrase}仍已用去，施法时间也不会退回，目标不获得这次效果。`,`手印未能合拢时，此次所用魔力和${r.phrase}已消耗，时间照常过去；没有新的效果留在目标上。`][i%3];
 return {id:s.id,prose:{theory,casting,failure:failed,counters:[counter,`施法前若魔力或${r.phrase}不足，就无法开始这次施术。`],socialConsequences,
  proficiencyEffects:['初学时先核对对象和条件，再练习把手印完整收束。','练熟之后，符合条件的尝试更容易完成，失败仍承担同样消耗。','进一步熟练能改善成功把握，不能越过距离或对象边界。','熟练不改变固定施法时间、用量和效果期限，也不赋予额外能力。']},source:structuredClone(sources.mappings[i])};
}

// Two bookshop volumes for the mage and general spells.
const volumes=[
 ['space','空间役灵读本',1,['sleeve_store','far_take','rust_bite','rubble_servant','reassign','coordinate','anchor_cargo']],
 ['measure','量距契纹读本',0,['measure','contract_read']],
];
export const books=volumes.map(([k,name,stage,keys])=>({id:`item_book_s4_${k}`,name,aliases:[],scope:null,quality:'木',durability:80,weight:.2,basePrice:stage?80:24,tags:['paper','book'],origin:'bld_hw_school',shelfLifeDays:365,seasonality:'现有抄本售罄后不自动补货',
 book:{grade:stage?'中级':'初级',author:'未署名抄本',edition:'白石分题习术本',origin:'bld_hw_school',teaches:keys.map(k=>`spell_s4_${k}`),readingMinutes:stage?240:120,prerequisites:[]}}));

const mapping=s=>{
 const r=routes[routeOf[s.id]],b=books.find(b=>b.book.teaches.includes(s.id));
 return {spell:s.id,book:b?.id??null,teacher:r.teacher,sourceOwner:b?SELLER:r.teacher,minimumLiteracy:b?100:null,requiresCertification:s.stage&&r.profession?r.profession:null,
  readingMinutes:b?.book.readingMinutes??null,teachers:s.teachers,
  skill:{id:s.skill,name:s.name,aliases:[],scope:null,attribute:'精神',profession:r.profession,stage:s.stage,action:'cast',description:`用于施展${s.name}，材料及效果以对应法术为准。`,learnFee:s.learnFee,learnMinutes:s.learnMinutes,prerequisites:[],combatAction:null}};
};
export const sources={books:books.map(item=>({item,stock:{owner:SELLER,item:item.id,quantity:2}})),mappings:spells.map(mapping)};

export function bookDraft(b){
 const names=b.book.teaches.map(id=>spells.find(s=>s.id===id).name).join('、'),stage=b.book.grade==='中级';
 return {id:b.id,prose:{description:`这册未署名抄本收录${names}。识字达到100并持有完好的书，才可每次用${b.book.readingMinutes}分钟研读一种；${stage?'其中的一阶法术还须有法师认证，零阶的几种不限职业。':'书中均为零阶法术，研读不需职业认证。'}阅读失败仍花去时间，书与购书成本不会退还。`,
  inspection:'逐页对照标题和篇末，检查有无缺页、大片洇墨或错接的书帖。抄本的笔迹只说明书写习惯，不能据此认定未署名作者的身份。',
  storage:'翻页前擦净手上的灰土与灯油，读后合进干燥书匣。用纸条标出篇次，避免折角遮住施术条件；存放时远离灯火与潮湿的墙角。'}};
}

// The scripture-room key exists so the registered mechanical lock is real; it is not sold.
const item=(id,name,weight,basePrice,tags,extra,prose)=>({id,name,aliases:[],scope:null,quality:'木',weight,basePrice,durability:100,origin:'loc_bs',shelfLifeDays:3650,seasonality:'不对外出售',tags,...extra,_prose:prose});
const itemRows=[
 item('item_s4_scripture_key','经阁铜钥',.05,6,['key','metal'],{},{
  use:'芦衡观经阁门上那把机械锁的钥匙，插进锁孔转半圈即可开锁；由观中保管，不对外出售。',
  description:'一把巴掌长的黄铜钥匙，柄上錾着一个小小的“阁”字，齿口磨得发亮。用一根褪色的红绳拴着，平日挂在观中裴澄的腰间。',
  inspection:'看齿口有无崩缺、弯折，柄与杆的接口有无裂纹；插进锁孔应转动顺滑，卡住时不要硬拧。',
  storage:'挂在干燥处，不与潮湿的铁器放在一起，免得生出铜绿；红绳磨断前及时换新。'}),
];
export const items=itemRows.map(({_prose,...row})=>row);
export const itemProse=Object.fromEntries(itemRows.map(r=>[r.id,r._prose]));
export function itemDraft(i){return{id:i.id,prose:structuredClone(itemProse[i.id])};}
export const recipes=[];

// Registered scene objects: the Taoist scripture room, gate, anchor stone and an
// old array rift; the still temple's ferrying tablet; the lamp shrine's altar;
// the school yard's rubble, cart and rusted latch.
const f=(id,name,kind,owner,access,position,state,extra={})=>({id:`feature_s4_${id}`,name,aliases:[],kind,owner,access,position,state,...extra});
export const placements={
 bld_bs_reed_dao:[
  f('scripture_door','经阁门','door',DAO,'consent',[-1,0],{locked:true,open:false,keyItem:'item_s4_scripture_key',lockGapMm:1,blockRadiusMeters:.4}),
  f('scripture_shelf','经阁书架','prop',DAO,'consent',[-2,0],{dustGrams:400,collectedDustGrams:0,heavyWasteGrams:0}),
  f('gate','观门','door',DAO,'consent',[0,1.6],{locked:false,open:true,blockRadiusMeters:.6},{connects:['bld_bs_reed_dao','loc_bs_dongxue']}),
  f('anchor_stone','观中锚石','rock',DAO,'consent',[1,-2],{anchorIntact:true,anchorOffsetMeters:[.3,0]},{spaceAnchor:true}),
  f('old_rift','旧阵残隙','surface',DAO,'consent',[-1,-2],{blocksSpace:true,blockRadiusMeters:.2,spaceAnomaly:{divine:false,radiusMeters:.2,intensity:1}}),
 ],
 bld_bs_still_temple:[
  f('rest_tablet','度亡牌位','prop',JI,'consent',[-1,1],{names:[]}),
 ],
 bld_bs_temple:[
  f('lintel_altar','门印神坛','altar',MIAO,'consent',[-2,1],{deity:'deity_lintel',church:'门印证契堂',integrity:100,contamination:60,pollutionKind:'ordinary'}),
 ],
 bld_bs_school:[
  f('brick_pile','院角碎砖堆','silt_heap',MAGE,'consent',[2,1],{rubbleGrams:6000,capacityGrams:10000,siltGrams:0}),
  f('tile_pile','檐下碎瓦堆','silt_heap',MAGE,'consent',[3,1],{rubbleGrams:5000,capacityGrams:10000,siltGrams:0}),
  f('rubble_cart','运渣板车','silt_heap',MAGE,'consent',[3,2],{rubbleGrams:0,capacityGrams:20000,siltGrams:0}),
  f('iron_latch','锈死的旧门闩','surface',MAGE,'consent',[0,-2],{material:'metal',integrity:100,corrosionResistance:.2}),
 ],
};
export const stations={};

// Teaching added to existing residents; reviewed prose stays unchanged.
export const mentors={
 [DAO]:{teach:spells.filter(s=>routeOf[s.id]==='道').map(s=>s.id),inventory:{}},
 [JI]:{teach:spells.filter(s=>routeOf[s.id]==='佛').map(s=>s.id),inventory:{}},
 [MIAO]:{teach:spells.filter(s=>routeOf[s.id]==='祭').map(s=>s.id),inventory:{}},
 [SHU]:{teach:spells.filter(s=>routeOf[s.id]==='巫').map(s=>s.id),inventory:{}},
};
// New ritual scopes the existing institutions now register for these rites.
export const ritualScopes={bld_bs_still_temple:{profession_monk:['ferry','consecrate']},bld_bs_temple:{profession_priest:['consecrate'],profession_witch:['spirit_census']}};
