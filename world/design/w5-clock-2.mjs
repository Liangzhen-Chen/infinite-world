// T111 (B5): executable faction clocks for the remaining 20 W5 factions by ID,
// plus the three T142 non-human polities (listed apart as the third group).
// The T142 rows stay verbatim in factions.json: their running clocks are
// separate data in rules.factionClock, keyed by their published clock ids.
import {clockRuntime,CARRIERS as P} from './w5-clock-1.mjs';
export const revision='w5-clock-v1';

export const specs={
 faction_reedpact:{carriers:P.post,
  s3:'听说芦语契约学派公布了知情同意范本的不适用范围，哪些情形不能套用都写明了。',
  alt:'拒绝试用只存范本',altClaim:'芦语学派那份契约范本据说有人拒绝参加试用，学派只保存范本，暂不推行。',
  pause:{name:'补见证请暂缓试用',attribute:'智力',difficulty:12},redirect:{name:'提供反例拒绝试验',attribute:'智力',difficulty:13,cost:{coins:10}}},
 faction_reedpaper:{carriers:P.post,
  s3:'听说晴檐纸坊盟对照了合用屋檐的返潮损耗，湿季晾纸按损耗重分檐下的位置。',
  alt:'改纸厚并调班晾晒',altClaim:'纸坊盟据说改抄厚一些的纸，晾晒按调过的班次轮，返潮少了不少。',
  pause:{name:'修檐请暂缓试排',attribute:'敏捷',difficulty:12,cost:{coins:10}},redirect:{name:'协助调班改纸厚',attribute:'智力',difficulty:12}},
 faction_returnorder:{carriers:P.hw,standing:'loc_hw',
  s1:'借宿小堂在河湾开始核对留席册，提供坐席的人家要当面确认还能不能用。',
  s3:'借宿小堂撤下了留席册里已经不能用的位置，开放的时段也重新标了出来。',
  alt:'补入新提供的坐席',altClaim:'借宿小堂的留席册据说补进了几处新提供的坐席，愿意带路的人也登记了。',
  pause:{name:'核对门标请暂缓标注',attribute:'智力',difficulty:11},redirect:{name:'提供坐席并实际带路',attribute:'魅力',difficulty:11}},
 faction_riverhomes:{carriers:P.hwDock,standing:'loc_hw',rivalEnd:'escalated',
  s1:'沿河住户在河湾收集岸线怎么用的旧事，愿意的人家具名作证。',
  s3:'沿河住户联盟据说推举了限期代表，章程写明可以退出，和盐舟商会的岸线之争更挑明了。',
  alt:'公开账目保留不入会权利',altClaim:'沿河住户联盟据说先公开了账目，章程保留了不入会的权利，和盐舟商会的岸线争执暂时缓下。',
  pause:{name:'公开账目请暂缓推举',attribute:'智力',difficulty:12},redirect:{name:'提供替代渡运',cost:{coins:20}}},
 faction_saltboat:{carriers:P.bsDock,standing:'loc_bs',rivalEnd:'escalated',extra3:[{kind:'regional_quote',item:'item_oats'}],
  s1:'盐舟商会在白石码头公示了泊位租约，船户可以去看条款。',
  s3:'盐舟商会签下了有期限的泊位合同，零散船户和沿河住户对岸线仍有不满。',
  alt:'公开费表保留公用泊位',altClaim:'盐舟商会据说公开了费表，留出公用泊位，船户的异议暂时平息。',
  pause:{name:'对账请商会暂缓签约',attribute:'智力',difficulty:13},redirect:{name:'提供替代运力',cost:{coins:40}}},
 faction_saltcaravan:{carriers:P.post,
  s3:'听驮商说，阴巷驮商联队签了双向运送条款，返程不再空驮，载荷和水量都先核过。',
  alt:'减重合单分趟走',altClaim:'驮商联队那批返程货据说减了重、合了单，分两趟走，驮畜没再超载。',
  pause:{name:'提醒超载请暂缓撮合',attribute:'智力',difficulty:12},redirect:{name:'沿途修补驮具',attribute:'敏捷',difficulty:12,cost:{coins:15}}},
 faction_scentkin:{carriers:P.post,
  s3:'听林道商人说，砾耳交证群试行了嗅布交叉借还的记录，两群各自保管、互相核对。',
  alt:'先核实来路再借还',altClaim:'交证群那批嗅布据说先核实了来路，借还记录推后，来历不明的几块单独存放。',
  pause:{name:'核实来路请暂缓借还',attribute:'智力',difficulty:13},redirect:{name:'提供储藏材料',cost:{items:{item_linen_cloth:2}}}},
 faction_seaweed:{carriers:P.post,
  s3:'听说浅绳海草合社清点了晾架损耗后续了约，港务厅的船道还在和晾架争地。',
  alt:'修架后改船道',altClaim:'海草合社的晾架据说修好了，港方同意让船道绕开晾架，双方的争执缓了下来。',
  pause:{name:'修架请暂缓续约',attribute:'体质',difficulty:12,cost:{coins:10}},redirect:{name:'提出改船道方案',attribute:'智力',difficulty:14}},
 faction_seedcourt:{carriers:P.post,
  s3:'听说育芽小院联席复查了接管苗圃的成活情况，结果都归了档。',
  alt:'低扰动移苗',altClaim:'那片失养苗圃据说改用低扰动的法子移苗，没移的幼苗留在原地照护。',
  pause:{name:'接班浇护请暂缓分配',attribute:'体质',difficulty:11},redirect:{name:'提出低扰动移苗办法',attribute:'智力',difficulty:13}},
 faction_shadeorder:{carriers:P.post,
  s3:'听说量杯同行社交接了离井者的代领记录，份额用途写明，只由受托人代领。',
  alt:'撤销旧委托另立见证',altClaim:'量杯同行社那份代领委托据说被撤销了，离井者另找见证重新立了一份。',
  pause:{name:'提供见证请暂缓交接',attribute:'精神',difficulty:12},redirect:{name:'修罐并协助撤销旧委托',cost:{items:{item_clay_pot:1}}}},
 faction_silvermirror:{carriers:P.post,
  s3:'听说银镜研究院开放了平价旁听的基础课名额，诸门通行署对来往学生的票费仍有说法。',
  alt:'质疑预算后缩减名额',altClaim:'银镜研究院的旁听课据说经人质疑预算后缩了名额，导师工时照实核算。',
  pause:{name:'质疑预算请暂缓开课',attribute:'智力',difficulty:14},redirect:{name:'做助教补足工时',attribute:'智力',difficulty:13}},
 faction_starpact:{carriers:['npc_hw_wushuo','npc_bs_032_1'],extra1:[{kind:'wildlife_stir',habitat:'habitat_deep_star_bowl',minutes:10080,factor:2}],
  s1:'去过沉星山坳的人说，守窝群在山坳里留下了新的边界痕，原来的通道走不通了。',
  s3:'沉星山坳的守窝群据说稳住了新的绕行区，冒险者绕着走就不受打扰。',
  alt:'退回巢材后放宽边界',altClaim:'有人把拿走的巢材退回沉星山坳，守窝群据说放宽了边界，熟悉踪迹的人在旁观察。',
  pause:{name:'绕行不扰请暂缓划界',attribute:'敏捷',difficulty:12},redirect:{name:'退回巢材并请人观察',attribute:'精神',difficulty:13}},
 faction_stonethread:{carriers:P.bsMarket,standing:'loc_bs',
  s1:'石缕测岩院在白石登记两处用泉人的旧水痕，来水的变化要一起核对。',
  s3:'测岩院公布了泉眼观测的误差和还说不清的地方，用泉的人可以去看记录。',
  alt:'加入测量补旧记',altClaim:'泉眼观测据说有人拿出旧记、加入了轮班，测岩院的记录补齐了一段空缺。',
  pause:{name:'提供旧记请暂缓公布',attribute:'智力',difficulty:12},redirect:{name:'参加轮班实测',attribute:'体质',difficulty:11}},
 faction_thresholdhouse:{carriers:P.post,
  s3:'听说阶槛家院确认了限期的代管人，继承顺序和修桥债都公开了。',
  alt:'凭修桥证据重核债务',altClaim:'阶槛家院的继承档据说因有人拿出修桥证据而重核了债务，代管人暂缓确认。',
  pause:{name:'翻检契书请暂缓公开',attribute:'智力',difficulty:13},redirect:{name:'提供修桥证据',attribute:'智力',difficulty:14}},
 faction_tidebrokers:{carriers:P.post,
  s3:'听说双桩航价所公开了有争议的费目，河海联运的分项票照新写法开。',
  alt:'按船户口述改费目',altClaim:'航价所的分项票据说按船户当面说的费目改了写法，和盐舟商会的代理之争缓了下来。',
  pause:{name:'提供旧票请暂缓试写',attribute:'智力',difficulty:12},redirect:{name:'直接询问船户',attribute:'魅力',difficulty:12}},
 faction_watercourt:{carriers:P.post,
  s3:'听说缺杯水议席议定了边井的等价登记，旧的取水记号照样保留。',
  alt:'实测杯容后登记',altClaim:'水议席的边井分册据说先实测了杯容，登记照实测的容量算。',
  pause:{name:'实测杯容请暂缓分册',attribute:'智力',difficulty:12},redirect:{name:'提出低损耗输水办法',attribute:'智力',difficulty:14}},
 faction_wedgeorder:{carriers:P.bsCraft,standing:'loc_bs',
  s1:'退楔会在白石应工伤家属的请求，开始核对事故楔上的原刻痕。',
  s3:'退楔会当着家属对读了副本册，能公开的部分都抄了出来。',
  alt:'补入遗漏刻痕再对读',altClaim:'退楔会的副本册据说补进了一道遗漏的刻痕，和家属对读推后了几天。',
  pause:{name:'寻找遗漏刻痕请暂缓抄录',attribute:'智力',difficulty:13},redirect:{name:'修补担架',cost:{items:{item_flax_cord:2}}}},
 faction_wellkin:{carriers:P.post,
  s3:'听草原来的驮商说，粗绳帐盟重议了旱季饮水的次序，新迁来的小帐也轮到发言。',
  alt:'补送水后再议次序',altClaim:'粗绳帐盟的饮水次序据说有人自愿补送了水，重议推后，新来的小帐先有水用。',
  pause:{name:'提出水量记录请暂缓重议',attribute:'智力',difficulty:12},redirect:{name:'自愿补送水',cost:{items:{item_water:6}}}},
 faction_wellorder:{carriers:P.post,
  s3:'听说井环帐会见证了旱季送水的实际送达，水程按能走的路约定。',
  alt:'改走替代井',altClaim:'井环帐会那趟送水据说改去了一口替代井，路程短了，送到的水也照实记下。',
  pause:{name:'明确拒绝超出能力的路程',attribute:'精神',difficulty:12},redirect:{name:'提出替代井',attribute:'智力',difficulty:13}},
 faction_winterstore:{carriers:P.post,
  s3:'北境来信说，覆廊冬储会把救船用的油和生活用油分开存放，紧急借用要公议。',
  alt:'补罐后核账分区',altClaim:'冬储会的储油据说有人补了新罐，核过账再分区，紧急借用办法暂缓公议。',
  pause:{name:'核账请暂缓分隔',attribute:'智力',difficulty:12},redirect:{name:'补上储油新罐',cost:{items:{item_clay_pot:2}}}},
};
// Third group: the T142 polities. Monthly councils that restart each year.
export const farSpecs={
 faction_far_orcmoot:{carriers:P.bsCargo,cycle:'year',s3Delta:3,
  s3:'寒炉回来的货商说，赭牙部盟在断契坡重画了炉契，停战互市又续了一年。',
  alt:'补足欠盐后续约',altClaim:'断契坡那边据说有人替双方核实了越界和私掘的指控，欠付的盐补足了，炉契照旧续上。',
  pause:{name:'核实越界指控请暂缓议约',attribute:'智力',difficulty:14},redirect:{name:'补足欠付的盐',cost:{items:{item_salt:20}}}},
 faction_far_lignum:{carriers:P.post,cycle:'year',
  s3:'听说杉根联邑的长老议定了今年发出的木牌数目，外林春季的伐痕也查对过了。',
  alt:'补种育苗坡后再发牌',altClaim:'杉根联邑据说先让人补种了育苗坡，偷伐的人也被找了出来，木牌照往年的数目发。',
  pause:{name:'请守界者暂缓发牌',attribute:'魅力',difficulty:13},redirect:{name:'替育苗坡补种',attribute:'体质',difficulty:12}},
 faction_far_scentmoot:{carriers:P.post,cycle:'year',
  s3:'听林道商人说，砾耳猎林共席在石台议决划出了今年的育幼地，禁猎季里外人不得进入。',
  alt:'林民让出配额后划地',altClaim:'猎林共席那次议事据说林民席位让出了一段采伐配额，育幼地划得比原先大。',
  pause:{name:'核实越界嗅迹请暂缓议决',attribute:'智力',difficulty:13},redirect:{name:'说服林民席位让出配额',attribute:'魅力',difficulty:14}},
};
export const batchIds=Object.keys(specs),farIds=Object.keys(farSpecs);
// Reverse relation entries, as [target, source]: this batch's rows, and every
// entry answering a T142 polity (the third group) on an editable W5 row.
export const REVERSE=[['faction_wellkin','faction_hoofguild'],['faction_reedpact','faction_mossstudy'],['faction_saltboat','faction_tidebrokers'],
 ['faction_riverhomes','faction_furroworder'],['faction_wedgeorder','faction_hollowcircle'],['faction_kilnkin','faction_far_orcmoot'],
 ['faction_starpact','faction_far_lignum'],['faction_scentkin','faction_far_scentmoot'],['faction_forestcouncil','faction_far_scentmoot']];
// The T159 society rows are reviewed verbatim and keep their collective stance;
// these three answers are not written (reported as open).
export const LOCKED_REVERSE=[['faction_ms_lielu','faction_far_orcmoot'],['faction_ms_yugen','faction_far_lignum'],['faction_ms_taideng','faction_far_scentmoot']];
export function buildClocks(factions,source='T111 w5-clock-2'){
 return batchIds.map(id=>{const f=factions.find(f=>f.id===id);if(!f)throw Error(`未登记势力：${id}`);return {id,runtime:clockRuntime(f,specs[id],source)};});
}
// Separate data for rules.factionClock: the published clock id and its
// interval/probability are kept exactly as T142 published them.
export function buildFarClocks(factions,source='T111 w5-clock-2 far'){
 return farIds.map(id=>{const f=factions.find(f=>f.id===id);if(!f)throw Error(`未登记势力：${id}`);
  const {id:clock,name,intervalDays,probability}=f.clock;return {id:clock,faction:id,name,intervalDays,probability,...clockRuntime(f,farSpecs[id],source)};});
}
