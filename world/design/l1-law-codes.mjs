// L1 authored mechanics and prose. Publication requires the content pipeline.
const royal=[
 ['xichui','西陲河谷','渠闸与田界以历次水册和邻田证言互证，擅改闸序按盗采公共水土受理。'],
 ['hanlu','寒炉山地','矿界争议查矿契与坑道痕迹；熔炉事故须分清故意伤人与失手，不按出身归罪。'],
 ['xingwan','北境星湾','船货争议核泊簿与交货见证；冰期救援取用公物须登记归还，不能据此私售船货。'],
 ['hupo','琥珀海岸','港务验货单须与实货互证；扣船须逐项列明货主，不能以一船嫌疑没收无关货物。'],
 ['zhonglu','中陆诸邦','契据核原签与当事人陈述；封地官与商户涉案时回避，爵位不能替代证据。'],
 ['jingzhao','镜沼灰盐','堤阵与盐田争议查分水簿及现场痕迹；未验明污染来源不得连坐整户。'],
 ['wushan','雾杉高地','冠雪台原巡山差受理后保存现场记录；夏营休闭时递件转王国郡府，不延长拘押期限。'],
];
const common={theft:{baseFine:10,valueMultiplier:1},theft_attempt:{baseFine:5,valueMultiplier:0},assault:{baseFine:20,valueMultiplier:0},assault_attempt:{baseFine:5,valueMultiplier:0},homicide:{baseFine:100,valueMultiplier:0},fraud:{baseFine:20,valueMultiplier:1},smuggling:{baseFine:20,valueMultiplier:2},illegal_mining:{baseFine:15,valueMultiplier:2},enslavement:{baseFine:100,valueMultiplier:2},trafficking:{baseFine:100,valueMultiplier:2},mental_magic:{baseFine:40,valueMultiplier:0}};
const royalStances={duel:'只准成年自愿、有见证且点到为止的决斗；生死约不免伤人杀人责任。',magic:'伤人、胁迫与未经同意的心智施法按相应侵害审理；机构许可只在登记用途和期限内有效。',smuggling:'隐匿应验货物属走私，罚款按货值加计；须先验明货物与携带者。',mining:'无权采掘他人矿脉或公用资源属盗采，返还所得并按货值加罚。',enslavement:'强迫终身服役属奴役，解除拘束并追究实施者；依法限期劳役不得转卖。',trafficking:'买卖人口或抵债转卖人身属犯罪，受害者不因被买卖承担债务。'};
const make=(id,polity,name,courts,enforcement,procedure,evidence,stances,extra={})=>({id,polity,name,courts,enforcement,procedure,evidence,stances,
 evidenceRequired:2,penalties:structuredClone(common),reportMinutes:15,searchMinutes:10,hearingMinutes:60,maximumDetentionMinutes:1440,
 communityMinutesPerCopper:30,prisonMinutesPerCopper:60,maximumSentenceMinutes:10080,duels:{touch:true,death:false},...extra});
export const lawTemplates=[...royal.map(([suffix,province,note])=>make(`law_royal_${suffix}`,'王国',`${province}王国诉讼章`,['村镇初审','郡府复审','王都终审'],'在任地方主官主持审理，巡差与守卫受理调查；涉案者回避。',`先报案记录原由，通知双方陈述，证据足够才裁判；不服初审可携卷到郡府，仍不服到王都，同层不得重复上诉。${note}`,'独立证言须交叉核对；自认或有出处的契据须核实。仅传闻、单一气味或施法取得的心声不能独立定罪。',royalStances,{province:`prov_${suffix}`})),
 make('law_orcmoot','赭牙部盟','赭牙盟火约',['部营听断','部盟会火复议','大帐众部终议'],'部营守誓者调查，非涉案的部营议者听断；大帐终议须让不同部的议者听取双方。','向部营守誓者陈明失物或伤情，双方各指见证在会火前陈述；不服逐级送部盟与大帐，首领涉案须退出本案听断。','现场痕迹与独立见证互证；战利品须说明取得场合，强者自称胜出不算证据。',{
 ...royalStances,duel:'成年双方在守誓者前约明点到为止的比斗可免斗殴责任；撤约后追击或生死决斗仍按伤人杀人审理。',magic:'禁咒迫誓与操弄战友心智；疗伤须征得同意，施法痕迹须由不涉案者复查。',mining:'部营共用矿道须获当值议者准许，私挖侵占按盗采追还。',enslavement:'俘虏可暂留待交换，不得世袭役使；强迫终身服役按奴役追究。',trafficking:'不许将俘虏、幼者或外来者当货物转卖，盟火前解除买卖并追究卖者。'}),
 make('law_forest','翡翠林盟','林地共同议会护林约',['林地邻席听诉','共同议会复议','异席合议终断'],'护林者保全现场，由无利害关系的林地代表听诉，采伐纠纷另请受影响林地的代表陈述。','先在邻席说明受损林地与当事人，议会听取异议再定修复与罚偿；逐级复议须换无利害关系的议者。','树伤、足迹与独立证言相互核对；林中回响仅作线索，不能当作树木自行指认。',{
 ...royalStances,duel:'只准不伤根脉且成年自愿的点止比试，生死约无免罪效力。',magic:'施法不得操弄议者或损伤公共林地；心声与林地感应不能单独作证。',mining:'采掘须获受影响林地议席同意，越界盗采须修复土壤并赔偿。',enslavement:'不得以债务或族属使人终身从役，限期修复林地的判罚不得继承。'}),
 make('law_bays','星湾诸湾','星湾诸湾船约',['湾内船户听断','诸湾会复议','异湾合席终断'],'湾内推举的执桨人查验货舱，非涉案船户议者听断。','先封存争议货单而不扣无关船员，双方到湾席陈述；不服送诸湾会与异湾合席，不借王国终审替代湾约。','泊簿、封绳与收货见证互证，风浪传言不作定罪依据。',{
 ...royalStances,smuggling:'未向本湾申验的暗舱货按走私追究；同王国的贸易争端依双方协作另办。',mining:'擅取共用滩石与海底矿料属盗采，不能以航路先到自称所有。'}),
 make('law_lignum','杉根联邑','杉根根席约',['扎根处听诉','联邑根席复议','异坡长根会终议'],'守林者护住受损根区，根席由不同坡的无涉案者听诉，不能只由年长者自断。','原告在根席陈明侵害，允许移动缓慢的当事人就地答辩，由守林者传递同一份记录；不服逐级送联邑与异坡会。','伤根切面、脂液残留与目击陈述互证，气味与树龄不能决定谁说真话。',{
 ...royalStances,duel:'只许自愿点止且不伤扎根处的比试，砍根致命不得凭挑战免责。',magic:'不得以火咒胁迫答辩或操弄根席，疗伤需受治者同意。',mining:'根区下开矿须获受影响扎根处同意，破坏公共根土按盗采与侵害分别审查。',enslavement:'强迫迁根或终身割脂属奴役，欠债不能取得另一人的身体使用权。',trafficking:'苗体与已开灵者均不得被当作人口货物，诱捕转卖者须返还并受审。'}),
 make('law_scent','砾耳兽裔','砾耳养育群共席约',['养育群听诉','猎林共席复议','异群合席终断'],'嗅迹记录者保留气味及足迹记录，养育群的无涉案议者听断；外来者可请林民席转述。','受害者先向养育群陈诉，双方分别陈述再公开对质；复议送猎林共席，终断换异群议者，林民席有同等陈述权。','气味会受雨与串迹影响，须与独立目击或实物互证；不能只凭族群气味归罪。',{
 ...royalStances,duel:'成年自愿点止比试须有异群见证，追咬投降者按斗殴处理，生死约不免罪。',magic:'禁操弄嗅觉与心智诱导指认，受影响证词须排除后重核。',mining:'穴道与育幼坡共土不得私挖，越界采掘须修复并赔偿。',enslavement:'不得以养育恩情强制终身服役，受罚劳役有期限且不转给后代。',trafficking:'拐卖幼者及外来者均须追究，购买者不能取得对被卖者的支配权。'}),
 make('law_tents','风脊诸帐','风脊轮帐水草约',['本帐听诉','邻帐轮议','诸帐会终断'],'当值护井者调查，无涉案的轮帐议者听诉；涉及水源时请下游帐陈述。','先在本帐登记争端，不得扣走整群牲畜代人到案；逐级请邻帐与诸帐会复议，当值帐同案回避。','井绳刻记、牲畜标记与独立见证互证，追踪方向本身不等于偷盗。',{
 ...royalStances,smuggling:'避开轮帐货验私运应申验货物属走私，不把正常迁牧当走私。',mining:'共井下与共同牧地采掘须经受影响帐同意，私挖按盗采追偿。'}),
 make('law_city','细嵌城邦','细嵌市契审约',['街区审席','城邦复席','异业公议终席'],'市契差员查验封样，由无涉案的审席主持；行会同业涉案须另换审席。','双方呈原契与样货，审席听完争点再裁判；不服由城邦复席与异业公议复核，自治契案不转王都替代终席。','原契签押、交货封样与独立见证互证，行会名望不能替代证据。',{
 ...royalStances,smuggling:'越过本城验货手续私运受验货物属走私，城外商籍不能自动免验。',mining:'城邦登记的公共矿权不得以私契重复出售，无权采掘按盗采追究。'}),
 make('law_wells','灰盐诸井','缺杯水议席井约',['井旁听诉','缺杯水议席复议','异井合席终断'],'护井人保全井口与水册，涉案井户退出听断；缺水户也有陈述资格。','先登记受损井份和取水时段，双方对册陈述；上诉逐级请缺杯水议席与异井合席，不能停掉申诉者的救命饮水。','水册、井壁痕迹与独立证言互证；井水变味须查来源，不按族属定污染者。',{
 ...royalStances,magic:'施法不得夺水胁迫作证，净水前须保存可复核的样本，心声不得单独定罪。',smuggling:'绕井验私运应验盐货属走私，救命饮水的公开取用不冒称私运。',mining:'未经水议席许可挖盐毁井属盗采，须修井并赔偿受损井户。',enslavement:'欠水债不得抵押人身，强令终身汲水属奴役。'}),
];
export const lawDraft=t=>({id:t.id,name:t.name,procedure:t.procedure,evidence:t.evidence,enforcement:t.enforcement,stances:t.stances,
 sentencing:`本约受理偷盗、斗殴、欺诈、走私、盗采、奴役与人口买卖。罚款按罪名基额加涉案财值倍数计算，受害财值另作赔偿；不能缴罚者依法限期劳役或监禁，未经证实不得先罚。`,courts:t.courts.join('，继而')});
