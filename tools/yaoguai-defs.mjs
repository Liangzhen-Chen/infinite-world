// YG-1 妖怪志：母题定义、环境映射、去重判定。描述均为自拟的规则化概括，不取自任何整理本文字。
// 被 tools/yaoguai-index.mjs build 读取。

// 现有系统键（涉及系统）。stage 指 docs/架构设计/10 迁移阶段；“阴间包”为待建包。
export const SYSTEMS={
 法律:'法律与规范层（罪名、立案、官府处置；S4 规范栈）',
 立场:'立场与印象（事件印象汇总；S6 改可重建缓存）',
 宗教:'信仰、祠庙、祭祀与术士资格（rw07-faith、T93 仪式资格）',
 医疗:'疾病与健康（illness/heal）',
 家族:'亲属与家户（kin、婚姻、继承；rw09-family）',
 传闻:'传闻生成与传播（rumor、tell）',
 知情:'知情集合、主观视图与推断（S6 belief）',
 战斗:'战斗、首领与弱点（combat、boss mechanics）',
 经济:'交易、账户与物品（trade、transfer）',
 生态:'野外种群、栖地与害兽（wildlife、population）',
 灵智:'野兽灵智累积、立意、点化、借形（T160/T161 wildlifeAwakening）',
 怪物社会:'精怪聚居地与怪物社会（monsterSociety、立约、潜入）',
 法术:'法术与效果原语（spells、magic）',
 灾害:'天气与灾害（hazard、seasonal-hazards）',
 阴间:'亡魂、冥府与转生（待建“阴间包”，PLAN 后置缺口）'
};

// 规则形状：norm 规范条款｜reaction 反应规则｜inference 推断规则｜modifier 修正项｜clock 时钟｜action 动作｜derive 派生
const M=(id,label,o)=>({id,label,...o});
export const MOTIFS=[
 M('化形修炼','修炼化形',{tag:'motif:shapeshift',trigger:'动物或物类达到年岁、得灵物灵地、行特定仪式（拜月、拜星、顶骨）',process:'灵智累积到立意后取得人形，可维持一段时间',outcomes:['化形成功，混入人间','仪式失败，退回原形','被识破后失去人形或逃走'],systems:['灵智','知情','传闻'],shapes:['clock','action','derive'],stage:'现有（T160/T161 借形）；条件数据化待 S5 修正项'}),
 M('年久成精','年久成精',{tag:'motif:aging_spirit',trigger:'器物、草木、动物或空屋存在年数超过阈值',process:'到期后获得灵智或开始作怪',outcomes:['成精作祟','成精无害、可交谈','被毁去本体后消失'],systems:['灵智','生态','知情'],shapes:['clock','derive'],stage:'S5（器物年岁事实+时钟）',absorbs:["新:影子成精","新:偶人同命"]}),
 M('异类魅惑','异类魅惑',{tag:'motif:seduction',trigger:'独处的人（夜行、独宿、旅居）被化人形的异类接近',process:'异类以美色或亲近诱人往来，持续接触损耗精气',outcomes:['受害者病弱或死亡','被家人或术士识破驱走','发展为人妖婚配'],systems:['医疗','家族','知情','宗教','立场'],shapes:['action','reaction','clock'],stage:'A3（开放动作）+S6（识破）'}),
 M('人妖婚配','人妖婚配',{tag:'motif:interspecies_marriage',trigger:'异类主动求偶、受恩相许或被人强留（藏衣等）',process:'结为夫妻同居，常带一项禁忌或期限',outcomes:['育子后离去','禁忌被破即离去','被识破遭驱逐','白头偕老'],systems:['家族','知情','法律','宗教'],shapes:['action','norm','reaction'],stage:'S2 持有（kin 允许 creature 一端）+S4 规范（异类婚姻效力）'}),
 M('禁忌破约','禁忌破约',{tag:'motif:broken_taboo',trigger:'约定或禁忌被违反（窥看原形、说破身份、限期未到即开视）',process:'破约事件发生即触发',outcomes:['异类离去并收回所赐','降祸或报复','恩惠中止'],systems:['知情','立场','家族'],shapes:['norm','reaction'],stage:'S3（承诺义务）+S6'}),
 M('报恩','报恩',{tag:'motif:repay_kindness',trigger:'人救助、放生、安葬或供养了异类或亡魂',process:'受恩者记下恩情，日后以财物、预警、助力或婚配回报',outcomes:['赠物致富','危难相救','以身相许'],systems:['立场','经济','知情'],shapes:['reaction','clock'],stage:'S6（立场缓存与欠情印象）；现有苔灯坞“结缘派”可读',absorbs:["新:搁浅求放","新:惜字善报","新:灵畜劝善"]}),
 M('复仇索命','复仇索命',{tag:'motif:vengeance',trigger:'冤死、被杀、被害或被辜负者死后化鬼，或动物被伤',process:'纠缠加害者，致病、致幻或公开罪行',outcomes:['加害者病死','罪行被揭露后鬼散','受祭祀或超度后平息'],systems:['阴间','法律','医疗','传闻','立场'],shapes:['reaction','clock','inference'],stage:'阴间包（亡魂实体）+S4（罪行揭露进入立案）'}),
 M('鬼魂申冤求助','申冤求助',{tag:'motif:ghost_petition',trigger:'亡魂有未了之事：尸骨未葬、冤情未白、遗愿未达',process:'托梦、现形或附物向生人求助',outcomes:['生人代为安葬或申冤后鬼得安息','拒绝后受扰'],systems:['阴间','法律','知情','宗教'],shapes:['action','reaction'],stage:'阴间包+S4（申冤作为立案来源）+S6',absorbs:["新:托梦求生"]}),
 M('思亲眷恋','思亲眷恋',{tag:'motif:lingering_kin',trigger:'亡者挂念在世亲人（幼子、父母、配偶）',process:'夜间回家照料、送物或叮嘱',outcomes:['被发现后离去','亲人安顿后不再出现'],systems:['阴间','家族','知情'],shapes:['clock','reaction'],stage:'阴间包'}),
 M('附身凭依','附身凭依',{tag:'motif:possession',trigger:'精怪或亡魂进入活人或器物',process:'被附者言行改变，借其口提要求或作乱',outcomes:['满足要求后离去','被术士驱出','被附者死亡'],systems:['医疗','宗教','法律','知情'],shapes:['status','reaction','action'],stage:'A3（status 原语+开放动作）；身份与责任归属待 S4'}),
 M('借尸还魂','借尸还魂',{tag:'motif:body_borrow',trigger:'魂魄离体或死者魂附入他人新尸',process:'复活者带原魂记忆而用他人身体',outcomes:['两家争认','身份经官府裁定'],systems:['阴间','家族','法律','知情'],shapes:['transition','norm'],stage:'阴间包+S2（身份与持有交接）+S4'}),
 M('摄魂夺魄','摄魂夺魄',{tag:'motif:soul_theft',trigger:'被妖物呼名、闻气、照影或夜间失魂',process:'魂魄被摄去，身体昏沉',outcomes:['招魂取回','魂失而死'],systems:['医疗','宗教','阴间'],shapes:['status','action'],stage:'A3+阴间包',absorbs:["新:离魂"]}),
 M('找替身','找替身',{tag:'motif:substitute',trigger:'溺死、缢死等横死之鬼须找替身方得转生',process:'诱骗生人重演死法',outcomes:['得替身后离去','被识破、劝退或超度'],systems:['阴间','法律','传闻'],shapes:['reaction','clock'],stage:'阴间包'}),
 M('作祟扰宅','作祟扰宅',{tag:'motif:haunting',trigger:'宅院空置、凶宅、或妖物占据住所',process:'怪声、掷物、移物、现形，住户不安或遭祸',outcomes:['迁居','请人驱除','找出本体（器物、骨殖）毁去'],systems:['经济','宗教','传闻','知情'],shapes:['clock','reaction','derive'],stage:'S5（房屋价值修正项）+S6（凶宅传闻）'}),
 M('冒充人神','冒充人神',{tag:'motif:impersonation',trigger:'妖物化作熟人、官员、神祇或亲属',process:'借身份取得供奉、钱财、亲近或权威',outcomes:['被识破（犬、镜、细节破绽）','受骗者受害'],systems:['知情','法律','宗教'],shapes:['inference','action'],stage:'S6（主观视图与伪装）'}),
 M('索祭淫祀','索祭淫祀',{tag:'motif:extortion_cult',trigger:'妖物自称神灵，要求祭品（牲畜、钱、甚至活人）',process:'不祭则降祸，祭则暂安',outcomes:['官员或勇者拆庙除妖','长期受供'],systems:['宗教','法律','经济','立场'],shapes:['norm','clock','obligation'],stage:'S3（朝贡式义务）+S4（淫祀禁令）'}),
 M('祭祀安抚','祭祀安抚',{tag:'motif:propitiation',trigger:'人以供奉、立庙、安葬、诵经对待作祟者',process:'受祭后停止作祟或转为庇护',outcomes:['平息','升为地方神','祭祀中断后复作'],systems:['宗教','立场','经济'],shapes:['reaction','clock'],stage:'现有 mark:offering 可接；完整需 A3',absorbs:["新:超度解脱","新:孤魂野鬼"]}),
 M('镇物克制','镇物克制',{tag:'motif:ward',trigger:'使用特定克制物：符箓、桃木、柏枝、铜铁、镜、犬、鸡鸣、火、经卷等',process:'克制物在场或施用时妖物受伤、退避或现形',outcomes:['驱退','杀伤','被困'],systems:['战斗','宗教','法术','经济'],shapes:['modifier','reaction'],stage:'S5 修正项（弱点倍率，现有 boss weaknesses 可读）'}),
 M('呼名辟除','呼名辟除',{tag:'motif:name_power',trigger:'知道某精怪的名字并呼之',process:'被呼名者退去或失去作用',outcomes:['退去','不再伤人'],systems:['知情','战斗','宗教'],shapes:['action','derive'],stage:'S6（知情：名字作为知识）',absorbs:["新:呼名役使"]}),
 M('照妖现形','照妖现形',{tag:'motif:reveal',trigger:'镜照、犬吠、醉酒、睡眠、雷雨或特定物品使化形者露出原形',process:'原形暴露',outcomes:['逃走','被杀','坦白身份后和解'],systems:['知情','战斗'],shapes:['reaction','inference'],stage:'S6'}),
 M('斗法驱除','斗法驱除',{tag:'motif:exorcism',trigger:'受害者请术士、僧道、天师',process:'设坛、画符、斗法',outcomes:['收服或诛杀','术士落败受伤','妖物与术士讲和'],systems:['宗教','法术','战斗','经济'],shapes:['action'],stage:'现有职业与法术可承接；委托接口待 A3'}),
 M('雷击诛妖','雷击诛妖',{tag:'motif:thunder_judgment',trigger:'妖物作恶积累或遇雷雨',process:'雷击',outcomes:['妖物死，现原形','人被误伤或得庇护'],systems:['灾害','宗教','传闻'],shapes:['reaction','clock'],stage:'S5（天气事件反应）'}),
 M('官府处置','官府处置',{tag:'motif:official_action',trigger:'妖事报官，或官员亲遇',process:'官员审问、下令捕杀、拆庙或判断冤情',outcomes:['依法处置','官员反受其害','以妖为证断人案'],systems:['法律','立场','传闻'],shapes:['norm','action'],stage:'S4（规范层：精怪的法律地位）'}),
 M('致病行疫','致病行疫',{tag:'motif:plague',trigger:'疫鬼巡行、妖物接触或嗅闻、季节到来',process:'接触者发病，可成片流行',outcomes:['病死','驱疫后痊愈','祭送疫神后止息'],systems:['医疗','宗教','灾害'],shapes:['clock','reaction','modifier'],stage:'现有 illness；疫源实体待 S5',absorbs:["新:印面散疫"]}),
 M('食人害命','食人害命',{tag:'motif:man_eater',trigger:'凶兽或妖物遇人',process:'捕食或杀伤',outcomes:['伤亡','被猎杀','被镇住'],systems:['战斗','生态','传闻'],shapes:['reaction','clock'],stage:'现有（遭遇、首领）'}),
 M('吸血吸精','吸血吸精',{tag:'motif:drain',trigger:'夜间、睡眠或亲近中被接触',process:'精气、血液逐日损耗',outcomes:['衰弱致死','及时识破后恢复'],systems:['医疗','知情'],shapes:['clock','status'],stage:'A3（status）+S6（诊断推断）'}),
 M('致灾异象','致灾异象',{tag:'motif:calamity',trigger:'灾怪现身或被冒犯',process:'旱、涝、火、风、虫等灾害降临一地',outcomes:['持续成灾','除去灾怪后恢复','祭祀后缓解'],systems:['灾害','生态','宗教','经济'],shapes:['clock','modifier'],stage:'S5（地区修正项）'}),
 M('征兆预言','征兆预言',{tag:'motif:omen',trigger:'见到某妖或某异象',process:'被解读为吉凶征兆，或妖物直接预言',outcomes:['应验','解读失误'],systems:['传闻','知情','立场'],shapes:['inference','reaction'],stage:'S6（推断规则：征兆→belief）；现有 mark:omen'}),
 M('赐福招财','赐福招财',{tag:'motif:fortune',trigger:'遇见吉兽、福精，或受其青睐',process:'得钱财、子嗣、官运或丰收',outcomes:['致富','福随其离开而去'],systems:['经济','立场','传闻'],shapes:['reaction','transfer'],stage:'S1（转移来源须有源汇账户）'}),
 M('宝物入药','宝物入药',{tag:'motif:material',trigger:'获取妖物身体部分或其宝物',process:'食用、佩戴、入药或作器',outcomes:['治病、辟火、辟邪、增益','触犯禁忌受祸'],systems:['经济','医疗','生态','法术'],shapes:['derive','action'],stage:'现有（掉落与材料）；功用为修正项待 S5'}),
 M('幻术迷惑','幻术迷惑',{tag:'motif:illusion',trigger:'入山、夜行、宿于荒宅',process:'幻化出宅院、宴席、道路或美人',outcomes:['迷路','醒来身处坟墓荒野','财物被换成秽物'],systems:['知情','法术','传闻'],shapes:['status','inference'],stage:'S6（主观视图）',absorbs:["迷路引路"]}),
 M('戏弄恶作剧','戏弄恶作剧',{tag:'motif:prank',trigger:'精怪好动或被冒犯',process:'藏物、乱物、学人说话、扰睡',outcomes:['被宽容','被驱走','升级为作祟'],systems:['立场','传闻'],shapes:['reaction'],stage:'A3（兜底 mark 反应）'}),
 M('论学交谈','论学交谈',{tag:'motif:discourse',trigger:'书生、隐士夜读或独处时精怪来访',process:'谈诗论道、对答、作诗',outcomes:['相交为友','因言辞露出本相','受教益'],systems:['知情','立场','传闻'],shapes:['action'],stage:'A2（对话动作）',absorbs:["新:精怪为友","新:嗜酒结友"]}),
 M('交易往来','交易往来',{tag:'motif:exchange',trigger:'鬼市、精怪集市或私下交换',process:'以物易物、买卖或借贷',outcomes:['公平成交','冥币化纸、货物变质','违约受罚'],systems:['经济','阴间','怪物社会'],shapes:['action','obligation'],stage:'现有（精怪聚居地交易）；鬼市待阴间包'}),
 M('守护庇佑','守护庇佑',{tag:'motif:guardian',trigger:'精怪或亡魂与某家、某地有约或有情',process:'护宅、护人、护产育、驱他怪',outcomes:['持续庇护','约破后离去'],systems:['立场','宗教','家族'],shapes:['modifier','reaction'],stage:'S5 修正项',absorbs:["新:宅仙守家"]}),
 M('考验试炼','考验试炼',{tag:'motif:trial',trigger:'神怪有意试探人的品行或胆量',process:'设难题、诱惑或惊吓',outcomes:['通过得赏','失败受罚或无事'],systems:['立场','知情'],shapes:['action'],stage:'A3'}),
 M('人化异类','人化异类',{tag:'motif:human_transform',trigger:'人因病、罪罚、咒、年老或执念变为兽或物',process:'形体逐渐改变',outcomes:['入山不返','被家人认出','变回人形'],systems:['医疗','家族','知情','阴间'],shapes:['transition'],stage:'S2（实体种类变更协议）',absorbs:["新:改相","新:鱼化兽","新:石物互化"]}),
 M('尸变','尸变',{tag:'motif:revenant',trigger:'尸体未及时入葬、受阴气或久停',process:'尸起扑人、夜行吸血',outcomes:['被烧毁或镇住','黎明倒地'],systems:['阴间','战斗','宗教'],shapes:['clock','reaction'],stage:'现有（墓地亡灵怪物）；成因待阴间包'}),
 M('伥鬼役使','伥鬼役使',{tag:'motif:thrall',trigger:'被猛兽或妖物所害之魂被其役使',process:'为主引路、诱人、开道',outcomes:['主死而伥散','被超度'],systems:['阴间','战斗','怪物社会'],shapes:['holding','reaction'],stage:'阴间包（役使作为持有）'}),
 M('阴间官僚','阴间官僚',{tag:'motif:underworld_office',trigger:'寿尽、误勾、生魂入冥或冥吏出差',process:'冥吏勾魂、冥府审判、簿册查对',outcomes:['依簿收魂','误勾放还','行贿或求情改判'],systems:['阴间','法律','宗教'],shapes:['norm','clock','office'],stage:'阴间包（冥府组织与职位）',absorbs:["新:阴兵过境"]}),
 M('冥婚','冥婚',{tag:'motif:ghost_marriage',trigger:'亡者婚配未了，或生人与亡魂结缘',process:'阴阳缔婚、合葬或亡魂来就',outcomes:['亡魂安息','生者受累'],systems:['阴间','家族','宗教'],shapes:['holding','norm'],stage:'阴间包+S2（kin 一端为亡魂）'}),
 M('异域异族','异域异族',{tag:'motif:far_people',trigger:'远方地理记载',process:'记其形貌、风俗、物产',outcomes:['可作远方人群或传闻知识'],systems:['知情','传闻'],shapes:['derive'],stage:'现有（书本、传闻）'}),
 M('妖怪聚落','妖怪聚落',{tag:'motif:spirit_settlement',trigger:'同类精怪成群居住，或有国、有君、有市',process:'有内部秩序、首领、婚嫁与对外往来',outcomes:['与人立约往来','与人冲突'],systems:['怪物社会','立场','法律','经济'],shapes:['collective','norm'],stage:'现有（精怪聚居地 monsterSociety）'}),
 M('山神统辖','山神统辖',{tag:'motif:local_authority',trigger:'山神、土地、水府管束一地精怪',process:'裁断精怪纠纷、准许或禁止其活动',outcomes:['精怪受罚','人向神申诉得解'],systems:['宗教','法律','怪物社会'],shapes:['norm','office'],stage:'S4（神祇作为规范来源）'}),
 M('兴云布雨','兴云布雨',{tag:'motif:rain_control',trigger:'龙类、水族或雨师行动、被冒犯或被求',process:'降雨、发水、断流',outcomes:['旱解','水灾'],systems:['灾害','宗教','生态'],shapes:['clock','modifier'],stage:'S5'}),
 M('产育相关','产育相关',{tag:'motif:childbirth',trigger:'临产、育婴、求子',process:'害孕产或护孕产、夺婴、送子',outcomes:['难产或婴亡','顺产','婴儿被换'],systems:['医疗','家族','宗教'],shapes:['modifier','reaction'],stage:'S5 修正项（产育风险）'}),
 M('动物复仇或护子','动物复仇护子',{tag:'motif:animal_retribution',trigger:'人伤害、捕杀动物或掏其幼崽',process:'同类或亡兽之灵报复',outcomes:['加害者受祸','放还后止息'],systems:['生态','立场','法律'],shapes:['reaction'],stage:'现有（苔灯坞追偿派）；种群级立场待 S6'}),
 M('被捕被食','被捕被食',{tag:'motif:hunted',trigger:'人捕获、烹食或献上异物',process:'猎捕、宰杀',outcomes:['得肉得材','食后受祸','放生后报恩'],systems:['生态','经济','法律'],shapes:['action','derive'],stage:'现有（狩猎、掉落）'}),
 M('饿鬼果报','饿鬼果报',{tag:'motif:hungry_ghost',absorbs:['新:饿鬼果报','新:佛教饿鬼','新:食尸'],trigger:'生前悭吝、欺诈、杀生等罪业',process:'死后堕为饿鬼，受饥渴、火焚、只能食秽物等苦',outcomes:['受施食、诵经后稍得解脱','长期受苦'],systems:['阴间','宗教'],shapes:['derive','reaction'],stage:'阴间包（亡魂状态由生前事件派生）'}),
 M('回煞','回煞',{tag:'motif:soul_return_day',absorbs:['新:回煞'],trigger:'人死后到了特定日子（俗称回煞、头七）',process:'亡魂由煞神押送返家，家人须回避或设祭',outcomes:['平安送走','冲撞者受害'],systems:['阴间','宗教','家族'],shapes:['clock','norm'],stage:'阴间包（死亡后时钟到期项）'}),
 M('轮回还债','轮回还债',{tag:'motif:rebirth_debt',absorbs:['新:轮回还债','新:还债','新:一日轮回'],trigger:'生前欠债不还或负人',process:'转生为债主家的牲畜或子女，以劳役或钱财偿清',outcomes:['债清即死去','债主知情后放免'],systems:['阴间','经济','家族'],shapes:['obligation','transition'],stage:'阴间包+S3（义务随转生转移）'}),
 M('求仙服食','求仙服食',{tag:'motif:immortal_seeking',absorbs:['新:尸解成仙','新:仙隐','新:地下修仙','新:避世服食','新:食字成仙'],trigger:'人或物服食灵药、异物，或隐居修炼',process:'形体改变、长生或隐去',outcomes:['成仙不返','服食不当而死'],systems:['灵智','医疗','宗教'],shapes:['transition','clock'],stage:'后置（仙道包）'}),
 M('异兽记载','异兽记载',{tag:'motif:bestiary',trigger:'博物地理书的条目',process:'只记形貌、叫声、功用与征兆',outcomes:['作物种、材料或书本知识'],systems:['生态','知情'],shapes:['derive'],stage:'现有（书本与野外种群）'})
];

// 环境 → 九省地理与现有 biome 词（world/geo/biomes.json 的 林 河 滩 田 埂 果园 蜂 草 圃 汀 苇 泉）与地点类型
export const ENV_MAP={
 深山:{biome:['林'],provinces:['prov_hanlu','prov_wushan','prov_zhonglu'],note:'寒炉山地、雾杉高地、白冠/赤褶郡'},
 山林:{biome:['林'],provinces:['prov_feicui','prov_wushan','prov_xichui'],note:'翡翠林盟、雾杉高地、西陲丘陵林'},
 林野:{biome:['林','草'],provinces:['prov_feicui','prov_xichui'],note:'林缘、北林边一类'},
 河川:{biome:['河','滩'],provinces:['prov_xichui','prov_zhonglu'],note:'河湾、渡口、河段节点'},
 江湖:{biome:['河','汀','苇'],provinces:['prov_jingzhao','prov_xichui'],note:'镜沼芦滩、下渡郡河口'},
 海洋:{biome:['滩'],provinces:['prov_hupo','prov_xingwan'],note:'琥珀海岸、北境星湾'},
 海岛:{biome:['滩'],provinces:['prov_hupo'],note:'盐风群岛郡'},
 泽沼:{biome:['汀','苇'],provinces:['prov_jingzhao','prov_feicui'],note:'镜沼灰盐、苔院郡泥沼'},
 田野:{biome:['田','埂','圃','果园'],provinces:['prov_xichui','prov_zhonglu','prov_fengji'],note:'村庄田地，害稼类'},
 村落:{biome:[],provinces:['*'],note:'聚落内，人居'},
 宅院:{biome:[],provinces:['*'],note:'建筑与房间'},
 空宅凶宅:{biome:[],provinces:['*'],note:'空置建筑，需“空置年数”事实'},
 墓地:{biome:[],provinces:['*'],note:'现有 loc_wild_sb_barrow 一类古冢'},
 寺观:{biome:[],provinces:['*'],note:'止波寺、芦衡观一类宗教建筑'},
 祠庙:{biome:[],provinces:['*'],note:'祠、神龛，现有遗迹旧神龛'},
 官署:{biome:[],provinces:['*'],note:'公署、郡府'},
 宫廷:{biome:[],provinces:['prov_zhonglu'],note:'王畿郡'},
 城镇街市:{biome:[],provinces:['*'],note:'镇、城、集市'},
 道路:{biome:[],provinces:['*'],note:'routes.json 路线段'},
 驿亭客舍:{biome:[],provinces:['*'],note:'驿站、客店'},
 桥梁渡口:{biome:['河'],provinces:['prov_xichui','prov_jingzhao'],note:'雁渡、芦语渡一类'},
 舟船:{biome:['河'],provinces:['prov_xichui','prov_hupo'],note:'车船物品个体'},
 井泉:{biome:['泉'],provinces:['prov_fengji','*'],note:'井环郡井泉'},
 厕所:{biome:[],provinces:['*'],note:'宅内房间'},
 灶:{biome:[],provinces:['*'],note:'宅内设施'},
 洞穴:{biome:[],provinces:['prov_hanlu','prov_xichui'],note:'现有炭阶地宫、砾泉矿道'},
 地下:{biome:[],provinces:['prov_hanlu','prov_xichui'],note:'地宫、矿道、墓穴'},
 荒野:{biome:['草'],provinces:['prov_fengji','prov_jingzhao'],note:'风脊旱草坡、灰盐旱地'},
 草原:{biome:['草'],provinces:['prov_fengji'],note:'风脊草原'},
 沙漠:{biome:[],provinces:['prov_jingzhao'],note:'灰盐郡盐碱旱地与沙'},
 雪山寒地:{biome:[],provinces:['prov_xingwan','prov_hanlu','prov_wushan'],note:'冰雪台地、雪坡、粒雪台原'},
 异域:{biome:[],provinces:[],note:'九省之外：只作书本与传闻知识'},
 天空:{biome:[],provinces:['*'],note:'飞行类，天气事件'},
 阴间:{biome:[],provinces:[],note:'无现有地点；需阴间包'},
 梦境:{biome:[],provinces:[],note:'不是地点：托梦作为 tell 事件'},
 战场:{biome:[],provinces:['*'],note:'古战场遗址'},
 书斋:{biome:[],provinces:['*'],note:'宅内房间、学堂'}
};

// 去重判定：alias 把异写/异名映射到规范名后按名合并；keepApart 列出同名但不是同一妖怪的规范名（不合并）。
export const DEDUP={alias:{},keepApart:['木龙','鵸鵌']};// 木龙：湖中巨木精与随船大蛇；鵸鵌：《山海经》基山与翼望山两种同名异鸟

// 互动方式 → world/ontology/verbs.json 现有动词（无合适动词的标 new: 为建议新增）
export const INTERACT_VERBS={魅惑:['deceive','impress'],婚恋:['marry'],交易:['trade'],报恩:['gift','help'],复仇:['harm'],申冤求助:['request','claim'],
 托梦:['tell'],附身:['new:possess','status_applied'],作祟:['new:haunt'],捕食伤人:['harm','combat'],冒充欺诈:['deceive'],幻术迷惑:['cast','deceive'],
 赠物赐福:['gift','transfer'],预言示警:['tell'],交战:['combat','clash'],被驱除:['new:exorcise'],被收服:['new:exorcise','pact'],受祭祀:['new:offer'],
 索取供奉:['request','new:offer'],被取材食用:['wildlife','destroyed'],守护:['help'],戏弄:['new:haunt'],论学交谈:['tell','learn'],致病:['health','status_applied'],
 偷盗:['steal'],迷路引路:['move','deceive'],遇之无事:[],驯养役使:['pet','pact','summon']};
// 危害 → tags.json 的 harm:* 族（现有 harm:injury/property/reputation、pollution；其余建议新增）
export const HARM_TAGS={致病:'new:harm:illness',杀人:'harm:injury',食人:'harm:injury',迷惑:'new:harm:mind',盗窃:'harm:property',扰宅:'new:harm:haunting',
 致旱:'new:harm:drought',致水:'new:harm:flood',致火:'fire',致疫:'new:harm:epidemic',夺魂:'new:harm:soul',毁物:'harm:property',伤畜:'harm:property',
 毁稼:'harm:property',害孕产:'new:harm:childbirth',无害:null};
