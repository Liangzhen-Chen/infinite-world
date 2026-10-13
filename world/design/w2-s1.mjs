// T69 authored candidates. Mechanics remain in the existing consumers.
export const revision='w2-s1-1';
const material=(item='item_charcoal')=>[{item,amount:1}];
const spell=(key,name,group,stage,mp,minutes,duration,rangeMeters,effectSpec,effect,extra={})=>({
 id:`spell_s1_${key}`,name,aliases:[],scope:null,skill:`skill_s1_${key}`,stage,mp,minutes,duration,durationLimit:duration,
 rangeMeters,difficulty:stage?15:10,materials:material(),mechanism:effectSpec.operation??effectSpec.kind,
 effectSpec,effect,learnFee:stage?40:12,learnMinutes:stage?240:120,teachers:[],...extra,mp:stage?Math.max(6,mp):Math.min(5,mp),
});
const area=(damageType,protect=false)=>({kind:'area',power:protect?12:8,radiusMeters:3,intervalMinutes:2,trigger:protect?'presence':'pulse',effect:protect?{kind:'protection',power:12,damageTypes:damageType,stacking:'strongest'}:{kind:'damage',power:8,damageType}});
const los={targeting:{lineOfSight:true}};
const protective={targeting:{lineOfSight:true,consent:'support_magic'}};
export const spells=[
 spell('ember_circle','炭环火场','area',1,8,1,6,6,area('fire'),'半径3米的火焰伤害区域，入场与每2分钟脉冲结算；波及包括施术者在内的有效生命目标，不留下地火。',los),
 spell('cold_circle','霜纹围场','area',1,8,1,6,6,area('cold'),'半径3米的寒冷伤害区域，入场与每2分钟结算，不冻结水体或减慢行动。',los),
 spell('wind_circle','回风切场','area',1,8,1,6,6,area('wind'),'半径3米的风伤区域，入场与每2分钟结算，不推动人物或搬动物件。',los),
 spell('earth_circle','砾声震场','area',1,8,1,6,6,area('earth'),'半径3米的土系伤害区域，入场与每2分钟结算，不挖土或破坏建筑。',los),
 spell('physical_cover','避刃小庭','area',0,5,1,10,6,area(['physical'],true),'半径3米内为本人和同意者提供每人12点有限物理吸收，离场撤去，重新进入保留余量。',protective),
 spell('fire_cover','避焰小庭','area',0,5,1,10,6,area(['fire'],true),'半径3米内为本人和同意者提供每人12点有限火伤吸收，不提高火焰抗性，不灭火。',protective),
 spell('cold_cover','避寒小庭','area',0,5,1,10,6,area(['cold'],true),'半径3米内为本人和同意者提供每人12点有限冷伤吸收，不改变体温或天气。',protective),
 spell('wind_cover','避风刃庭','area',0,5,1,10,6,area(['wind'],true),'半径3米内为本人和同意者提供每人12点有限风伤吸收，不遮挡正常空气。',protective),
 spell('light_cover','明暗缓冲庭','area',0,5,1,10,6,area(['light','shadow'],true),'半径3米内为本人和同意者提供每人12点光与暗影伤害共用额度，不提供夜视。',protective),
 spell('anchor_read','锚面辨纹','movement',0,2,1,0,3,{kind:'anchor_sense',power:1},'实地辨识完整空间锚点，记录其所属和位置；不提供使用许可。',los),
 spell('solo_step','独行短渡','movement',0,4,1,0,3,{kind:'blink',power:1,maxDistanceMeters:8,maxLoadKg:120,maxCompanions:0},'本人及携物短移至同地点已登记落脚点，最多8米，载荷含身体且最多120千克；不携同行者。',los),
 spell('paired_step','携伴短渡','movement',0,6,1,0,3,{kind:'blink',power:1,maxDistanceMeters:8,maxLoadKg:240,maxCompanions:1},'携一名已同意同行的清醒近端伙伴短移，最多8米、总载荷240千克；须有实际接触位置。',los),
 spell('anchor_cross','双锚通行','movement',1,12,2,0,3,{kind:'teleport',power:1,maxDistanceMeters:100000,maxLoadKg:400,maxCompanions:2},'在实地已辨識且获所有者许可的两锚间传送本人及至多两名同行者，总载荷最多400千克、实际路线最多100千米。',los),
 spell('short_letter','近路寄句','message',1,3,1,0,0,{kind:'message',power:1,maxChars:40,maxDistanceMeters:10000,delayMinutes:2},'经本人自愿许可向清醒收者发送至多40字，实际距离最多10千米，施法后延迟2分钟到达。'),
 spell('marked_letter','符持远笺','message',1,4,1,0,0,{kind:'mind_message',power:1,maxChars:40,maxDistanceMeters:100000,delayMinutes:3,markText:'远笺'},'持有写着远笺的有效自有符记，向本人许可的清醒收者发送至多40字；最多100千米，施法后3分钟到达。'),
 spell('mood_link','四情细桥','message',1,5,1,12,0,{kind:'consent_link',power:1,maxChars:4,maxDistanceMeters:10000,delayMinutes:1,upkeepMp:1,upkeepMinutes:3},'最多12分钟的双方自愿连接，只主动发送平静、紧张、高兴或难过；每3分钟维持1魔力，消息延迟1分钟。'),
 spell('team_link','三人节拍','message',1,6,1,12,0,{kind:'team_link',power:1,maxChars:4,maxDistanceMeters:10000,delayMinutes:1,upkeepMp:2,upkeepMinutes:3,maxMembers:3},'本人和两名逐人同意的小队连接，最多12分钟，仅主动发送前进、撤退、防守、合围、停步；每3分钟每名对端成员维持2魔力，合计4魔力。'),
 spell('tinder','点绒诀','utility',0,2,1,0,3,{kind:'object',operation:'ignite',power:5000},'点燃登记器物里最多5000毫克真实干火绒，燃料实际消耗；不召出燃料。'),
 spell('snuff','断燃诀','utility',0,2,1,0,3,{kind:'object',operation:'extinguish',power:1},'停止登记器物的实际燃烧，已有热量留存，器壁仍可能烫手。'),
 spell('warm_vessel','器温缓升','utility',0,3,1,0,3,{kind:'object',operation:'heat',power:5000,limitC:40},'向非活体热器物最多输入5000焦耳热量，整体温度不超过40摄氏度；不加水、不点燃。'),
 spell('touch_temperature','触器知温','utility',0,1,1,0,0,{kind:'object',operation:'sense_heat',power:1},'接触登记器物读取整体温度，不诊断病症或透视内部。'),
 spell('leak_seal','水口暂封','utility',0,3,1,10,3,{kind:'water_earth',operation:'seal',power:20},'暂时封闭压力不高于20千帕的容器漏口，实际水仍在原容器，10分钟后恢复泄漏。'),
 spell('channel_read','浅沟量流','utility',0,2,1,0,3,{kind:'water_earth',operation:'survey_water',power:5},'测量一段最多5米的小水道水深、实际流量与流速；不测水质或预报河流。'),
 spell('slow_current','缓沟诀','utility',0,3,1,5,3,{kind:'water_earth',operation:'slow_flow',power:50},'把非洪峰小水道的有效流量与流速最多降低一半，持续5分钟，不净水或封死沟渠。'),
 spell('herb_read','草性核读','growth',1,2,1,0,3,{kind:'care',operation:'herb_sense',power:1},'读取已识别活药草的已知常见性质，不鉴定未知草种或开药方。'),
 spell('seedling_cover','薄霜护芽','growth',1,5,1,1440,3,{kind:'care',operation:'seedling',power:3},'保护现有幼苗抵御耐霜边界以下最多3摄氏度的轻霜，持续1440分钟；缺水肥仍会受损。'),
 spell('root_guide','幼根循水','growth',1,6,1,4320,3,{kind:'care',operation:'roots',power:10},'引导现有幼根朝一米内可达水源生长，持续4320分钟，消耗实际水肥；不凭空增水。'),
 spell('graft_join','接穗养合','growth',1,6,1,4320,3,{kind:'care',operation:'graft',power:50},'在园艺手艺达到100、兼容接穗已对齐接合时促进接口愈合并降低排异，持续4320分钟，须持续水肥。'),
 spell('field_growth','田垄催候','growth',1,8,1,2880,3,{kind:'growth',power:100,unit:'permille'},'对获田主同意且实际播种的批次登记100千分比有限加速，最多2880分钟，日结额外消耗水和营养，不直接产粮。'),
 spell('fruit_store','采果缓败','growth',1,4,1,1440,3,{kind:'care',operation:'preserve_food',power:50},'使完整封闭容器内已剔坏的真实果实批次腐败速度降低50%，最多1440分钟，不还原已腐坏果实。'),
];

// Prose is written by Sol; DeepSeek only reviews these fixed drafts.
const texts=[
 ['炭线圈出一块小场，火意只灼生命目标。走入者立即受一次火伤，留在场中者每两分钟再受一次；最多维持6分钟，施术者也在其作用之内。','把一份木炭捻碎划弧，朝实际可见的圈心合掌。开场前看清同行者的位置，火场不能替你辨认敌友。','火焰抗性与有限火伤防护会降低实际损失。','狭窄渡口不宜随意开场，旁人走入也会受伤。守路时须先让借道者退到圈外。'],
 ['一圈细白纹限定冷伤的范围。圈内生命在进入时和每两分钟受一次寒冷伤害，最多6分钟；河水不会因此冻成可走的冰面。','用一份木炭描出闭环，抬手对准六米内可见的中心。先留出绕行位置，再把寒意送入圈中。','离开圈界后不再承受场内脉冲，冷伤防护可消耗余量缓冲损失。','这类场地适合迫使追近者重新选位。同行者若留在圈内，也需要离开才能避开后续冷伤。'],
 ['回旋的风纹在半径三米内施加风系伤害。生命进入时与每两分钟各受一次，最多6分钟；风纹不会把人吹离原位。','以一份木炭画出回转纹路，指向近处可见的圈心。圈中不分敌我，开场前应给附近的人留出退路。','风伤防护消耗自身余量来缓冲风伤。','护送时可把风场放在追近的方向。它不能帮人过河，也不能替搬运工推走堆货。'],
 ['砾声沿小场传播，圈内生命承受土系伤害。进入时和每两分钟结算一次，最多6分钟；声音不改变地面高差，也不撬开岩壁。','将一份木炭压成碎末，用指腹画下圈心。施术前核对可见位置，避免把等候的同伴圈入场内。','走出圈界就避开后续场内脉冲，实际防御会影响伤害数值。','道路争执中开场会波及站在圈内的其他人。砾声无法代替工匠验墙，修屋时另用实际支撑。'],
 ['小庭给圈内本人和自愿受护者各留十二点物理伤害吸收余量，最多10分钟。离开半径三米范围就撤去；再入场只保留原来未用的余量。','耗一份木炭描出庭界，选取近处可见中心。替别人设护前取得其本人同意，不能把未回应的人算作受护者。','同一击只采用最强吸收层，余量耗尽就不再挡刃。','搬货路过交锋处时，可以在庭内等伤者缓过气。防护不替人决定是否参战，也挡不住火伤和冷伤。'],
 ['庭内自愿者各有十二点火伤吸收余量，最多10分钟。离庭会撤护，再入不会补满；这份余量消耗后，火焰依旧能造成伤害。','用一份木炭勾出庭界，对准近处可见的空地。向别人施护须先问清本人意愿，再让其进入三米范围。','只有火伤可消耗这层防护，刀伤和冷伤照常结算。','靠近交锋中的焰术时可留一处缓冲地。火场与热器壁仍需另行处理，庭界不会把它们熄灭。'],
 ['寒伤到来时，小庭用每人十二点共定余量吸收一部分损失，最多10分钟。离庭撤护，重新进入不补余量，正常低温仍需衣物照顾。','以一份木炭划出三米庭界，朝可见中心张开双手。让愿意受护者先给出同意，再请其站进庭内。','火伤或物理打击不能由这层冷伤余量吸收。','面对寒冷伤害时可在庭内整队。它不能保住地里幼苗，也不能把湿衣变干，野外宿营仍要准备。'],
 ['风刃伤害可由庭中每名自愿者的十二点余量缓冲，最多10分钟。三米庭界之外不受护；再次入场延续旧余量，不构成可反复领满的盾。','耗一份木炭描庭，选定近处可见中心。受护者须本人同意，圈外同伴要先走进庭界才能获得防护。','余量只吸收风系伤害，不能把普通大风挡在庭外。','遇到风系袭击时，可留庭给装卸人员撤步。庭内仍能通风，粉尘和天气需要按实际情况处理。'],
 ['光伤和暗影伤害共用每名自愿者十二点余量，最多10分钟。庭界半径三米，离开会撤护，再入不会补额；两种伤害也不会各得一份余量。','取一份木炭画下相接的明暗双线，朝近处可见圈心合拢手指。请受护者先确认愿意留在庭内。','防护只吸收光与暗影伤害，眩点等注意力干扰仍需另防。','在明暗交替的交锋处可给同伴留出受护位置。庭界不发光，也不让人看见黑暗里的未知目标。'],
 ['纹路辨识记住实地锚面的所属与位置，给日后双锚通行留下凭据。它只认识完整、可见的锚点，不能因见到旧拓本就远处认锚。','以一份木炭勾摹锚面轮廓，站在三米内看清纹路。辨识结束后仍须向所有者另求使用许可。','锚面损坏、所属或位置改变，需要重新实地辨识。','路过公用锚面可先熟悉它，等有许可再安排通行。辨识不等于占有锚点，同行者的许可也须另列。'],
 ['短渡只带本人及携物，移向同地点已登记的可用落脚点，最多八米。身体也计入一百二十千克载荷，不能带正在同行的伙伴。','耗一份木炭在脚边划出落脚纹，目视目标位置再合步。私有落脚点需要所有者有效许可，墙体仍会阻断路径。','载荷超过上限、落脚点不可见或途中有空间封锁就无法短渡。','搬货者可独自换到近处落脚点，随后按正常途径照顾同行的人。坐骑和役灵须先解除同行，不能一并带走。'],
 ['携伴短渡带本人和至多一名清醒近端同行者到同场景落脚点，最多八米。总载荷含两人的身体与携物，上限二百四十千克。','用一份木炭描出并排的足纹，先确认伙伴已同意同行并有实际近端位置。私有落点的许可须覆盖两人。','伙伴不清醒、超载或隔墙时不能完成短渡。','这一渡适合接应一名已同行的伙伴，不能把路边陌生人直接带走。落点拥堵时仍应先协调位置。'],
 ['双锚通行连接两个实地已辨识的完整锚点，实际路线最多一百千米。可带两名同行者，总载荷含身体最多四百千克，不能越过空间封锁。','耗一份木炭勾合两锚纹路，站在唯一出发锚点三米内。两端所有者的许可须覆盖本人、同行名单和到达时刻。','未知或损坏锚点、失效许可与超额载荷都会阻止通行。','使用公用锚面仍须取得所有者许可。接货的人可以提前约定目的地，但约定本身不代替两端通行授权。'],
 ['把本人写下的短句送给自愿接收的清醒者，最多四十字、实际距离十千米。施法完成后还要等两分钟，途中许可失效就不能按原约送达。','耗一份木炭划下收句纹，念清要发送的文字。同地点须先有实际接触位置，远处则沿可确认路线计算距离。','收者睡着、正在途中或撤回同意，消息不能正常送达。','可约定货物到达的时间，或告诉同伴暂缓出发。短句只代表发信者主动说出的话，不能窥听收者心事。'],
 ['有效的远笺符记承载本人主动发送的短句，最多四十字、实际距离一百千米。施法完成后三分钟到达，自愿接收许可必须覆盖该时刻。','消耗一份木炭，握住自己持有且字样为远笺的有效刻记物。先征得收者同意，再写下需要传递的短句。','符记失效、转手或破损时不能继续用它寄句。','长路途中可向清醒同伴报平安。收者可以撤回接收意愿，持符的人不能因此读取对方想法或追查秘密。'],
 ['双方自愿建立四情细桥，最多12分钟。只能主动声明平静、紧张、高兴或难过，消息延迟一分钟；每三分钟维持消耗一点魔力。','耗一份木炭描出双线，取得对方的连接同意。保持实际距离十千米以内，任一方睡眠或途中位置失去确认时连接受限。','本人可撤回许可或主动断开，魔力不足也无法维持。','守路的人可用简单情绪提醒伙伴留意自身状态。紧张只是本人发出的信号，不能当作敌人来袭或某个秘密已被查明。'],
 ['三人节拍由本人和两名逐人同意者组成，最多12分钟。各人只主动发送前进、撤退、防守、合围或停步；每三分钟按两名对端各收两点，合计维持消耗四点魔力。','耗一份木炭画下三条相接的线，逐人确认其接收名单。成员两两实际距离不得超过十千米，节奏信号延迟一分钟。','许可须覆盖全部成员；撤回后人数不足就无法保留三人连接。','狭路同行时能传递简短的战术节奏。合围只是成员主动建议的信号，不强迫其他人执行，也不自动共享视线。'],
 ['点绒只启燃登记器物中的真实干火绒，至多五千毫克。火绒燃烧会减少原有燃料并留下相应灰分，火盆空了就需要另添燃料。','消耗一份木炭划出点火纹，面对三米内的登记火器。检查火绒是否干燥、尚未点燃且没有超出点燃量。','潮湿、已燃或过量的火绒不能靠此诀点燃。','厨房开火前应得到器主许可。用法术起火不免除看火责任，炉中燃料也不会因咒语自动补足。'],
 ['断燃停止登记火器正在进行的燃烧，原来积存的热量仍在。熄下的火盆可能仍会烫手，也可能需要等它自然散热再收起。','耗一份木炭在掌侧画下断纹，对准三米内获准使用的燃烧器物。确认目标仍在燃烧，便可截住燃势。','未在燃烧的器物没有可截断的燃势；熄火后热量并不归零。','收工时可先止火再安排冷却。断燃不能代替工匠判断器壁温度，搬移火盆前仍需实际查看。'],
 ['缓升向非活体热器物最多输入五千焦耳，整体温度上限四十摄氏度。温升受该器物热容量约束，不会凭空得到热水或新燃料。','耗一份木炭描出升温纹，面对三米内获准使用的热器物。先看清对象的用途与耐热边界，避免把活体当作器物。','器物已达温度上限时不能再靠本术继续升温。','备料时可把偏冷的器物缓缓温起。掌握的只是整体温度，具体工艺仍应按材料要求另作判断。'],
 ['触器知温读取实际接触的登记热器物整体温度。结果不提供器壁各处温差，不透视内部，也不能用于诊断活人的发热病症。','耗一份木炭在指侧描一小纹，直接接触获准使用的器物。远处目测或仅看到炉火，都不能替代这次接触。','未登记热量状态的对象不能借此术推测温度。','熄火后可据实际温度决定是否继续等待散热。温度读数不说明所有裂痕或受力情况，搬运仍需留意器物本身。'],
 ['水口暂封作用于真实容器漏口，压力不得高于二十千帕，最多10分钟。封口期间减少的漏水仍留在容器里，到期后原漏口继续泄漏。','消耗一份木炭勾下封口纹，对准获准使用的容器。核对容器和承接漏水的去处都在实际射程内，再暂压漏口。','超过压力上限的漏口不能封住；到期并不等于漏口已经修复。','漏桶送修前可短时保住存水。器主仍应安排实际修补，不能把暂封当作长期不漏的承诺。'],
 ['量流读取一段最多五米浅沟的实测水深、有效流量和流速。它只观察这段水道，不能从局部结果推断整条河未来是否涨水。','耗一份木炭沿掌心画出沟线，站在实际射程内面对登记沟段。结果随沟中真实流量变化，读完可再核对现场。','水道长度或流速没有实测依据时，不能补出确定数值。','灌溉前可先看小沟能送多少水。量流不判断水是否可饮，也不提供水源所有权，取用仍按原有条件。'],
 ['缓沟降低非洪峰小水道的有效流量与流速，最多一半、最多5分钟。水量仍按实际沟渠流动，术式不会净水或把沟底挖宽。','耗一份木炭描出缓弧，面对三米内获准使用的沟段。只对流量上限不超过每分钟二十升的小段施术，不能挡住洪峰。','洪峰或超过小沟流量边界时，不能用缓沟强行阻水。','换容器接水或检查沟口时可争取较缓的水势。到期后效果消失，后续送水仍须照看沟渠的实际堵塞。'],
 ['草性核读沿已识别活药草的性质作一次核对，只给出已知常见用途。遇到未知草种仍要研究，术式不替人开出治疗方案。','耗一份木炭画出草性纹，面对三米内的真实活植株。先确认这是已识别药草，再核读其常见性质。','未经识别的草种没有可核读的已知性质。','采集者可以核对活草与笔记是否相符。性质说明不能代替剂量、制备和实际病症判断，也不会凭空增加药材。'],
 ['护芽给现有幼苗抵御轻霜的帮助，最多1440分钟。只覆盖耐霜边界以下三摄氏度以内的轻霜，幼苗原有水分和营养仍照常消耗。','耗一份木炭划出嫩叶纹，取得苗主的有效同意。对准三米内活幼苗，检查供水与营养后再设护。','强霜越过边界仍会伤苗，缺水缺肥也不会因护芽免除损失。','苗床遇轻霜时可减少冻伤。照料者仍须安排浇水与实际肥料，不能用护芽把枯死植株恢复成新苗。'],
 ['幼根循水帮助活幼苗的根系朝一米内可达水源生长，最多4320分钟。每次增加都受实际水与营养约束，不改变整田批次的成熟日程。','耗一份木炭画出根向纹，取得幼苗与水源的使用同意。选定可达的现有水源，让源头与幼根处在实际近距。','水源不可达或水肥不足时，幼根不能凭法术继续增生。','盆苗移栽前可先安排根向，减少日后绕根的麻烦。接触水源后只取其中现有的水，施术者仍要检查供水能否持续。'],
 ['接穗养合促进兼容砧木与接穗接口的愈合，降低排异，最多4320分钟。砧木和接穗必须已经对齐接合，术式不代替切口或绑扎。','耗一份木炭画下合枝纹，凭达到一百的园艺手艺核对已接接口。取得两株的使用同意，留足实际水与营养。','接穗不兼容、尚未接合或缺少水肥时，不能完成养合。','园艺工可用养合照顾已做好的接口。枝条是否成活仍受实际供养影响，不能把一次施术当作整株必然丰产的保证。'],
 ['催候对已投入真实种粮的批次登记一成生长加速，最多2880分钟。额外生长在每日核算时消耗实际水和营养，低温与资源不足都会限制所得。','准备一份木炭并取得田主有效生长同意。站在三米内面对已种田垄，核对该批次的实际水与营养，再开始施术。','同田持续或冷却期间不能重复催候，已用满批次额度也无法加速。','播后可为需要赶上时序的批次留出有限帮助。种粮投入和基本产量不因咒语增加，收成仍要等成熟后实际收获。'],
 ['采果缓败照顾完整封闭容器里的真实果实，最多1440分钟，腐败速度降低一半。坏果必须先剔除，已经腐坏的部分不会变回新鲜果肉。','耗一份木炭描出合盖纹，先取得容器主的有效同意。检查果批已剔坏、容器完整且封闭，再对三米内的果藏施术。','容器破损或敞开就不能保持效果，已有坏果也不能靠缓败修复。','采后等待运送时能少损失一部分果实。缓败不让货物永久耐存，搬运者仍需核对封口、交接和真实剩余果量。'],
];
export function spellDraft(s){
 const i=spells.findIndex(row=>row.id===s.id),[theory,casting,counter,socialConsequences]=texts[i];
 const failed=['炭纹散开时，已花的魔力、木炭和施法时间仍计入这一次尝试，场地没有新的术式效果。','若收束没有成功，本次魔力与一份木炭仍已用去，施法时间也不会退回，目标不获得这次效果。','手势未能闭合时，此次所用魔力和木炭已消耗，时间照常过去；没有新的效果留在目标上。'][i%3];
 return {id:s.id,prose:{theory,casting,failure:failed,counters:[counter,'施法前若魔力或一份木炭不足，就无法开始这次施术。'],socialConsequences,
 proficiencyEffects:['初学时先核对对象和条件，再练习把纹路完整收束。','练熟之后，符合条件的尝试更容易完成，失败仍承担同样消耗。','进一步熟练能改善成功把握，不能越过距离或对象边界。','熟练不改变固定施法时间、用量和效果期限，也不赋予额外能力。']},source:structuredClone(sources.mappings[i])};
}
const volumes=[
 ['cover','近场防护读本',0,spells.slice(4,9)],['area','交锋圈域读本',1,spells.slice(0,4)],
 ['movement','锚面与短渡读本',1,spells.slice(9,13)],['message','自愿传讯读本',1,spells.slice(13,17)],
 ['utility','器物与小沟读本',0,spells.slice(17,24)],['growth','植株与采后读本',1,spells.slice(24)],
];
export const books=volumes.map(([key,name,stage,rows])=>({id:`item_book_s1_${key}`,name,aliases:[],scope:null,quality:'木',durability:80,weight:.2,basePrice:stage?80:24,tags:['paper','book'],origin:'bld_hw_school',shelfLifeDays:365,seasonality:'现有抄本售罄后不自动补货',book:{grade:stage?'中级':'初级',author:'未署名抄本',edition:'河谷分题习术本',origin:'bld_hw_school',teaches:rows.map(s=>s.id),readingMinutes:stage?240:120,prerequisites:[]}}));
export const sources={books:books.map(item=>({item,stock:{owner:'npc_hw_luqing',item:item.id,quantity:2}})),mappings:spells.map(s=>{
 const b=books.find(b=>b.book.teaches.includes(s.id));
 return {spell:s.id,book:b.id,sourceOwner:'npc_hw_luqing',minimumLiteracy:100,requiresCertification:s.stage?'profession_mage':null,readingMinutes:b.book.readingMinutes,teachers:[],skill:{id:s.skill,name:s.name,aliases:[],scope:null,attribute:'精神',profession:'profession_mage',stage:s.stage,action:'cast',description:`用于施展${s.name}，材料及效果以对应法术为准。`,learnFee:s.learnFee,learnMinutes:s.learnMinutes,prerequisites:[],combatAction:null}};
})};
export function bookDraft(b){return {id:b.id,prose:{description:`这册未署名抄本收录${b.book.teaches.map(id=>spells.find(s=>s.id===id).name).join('、')}。识字达到100并持有完好的书，才可每次用${b.book.readingMinutes}分钟研读一种；一阶法术还须有法师认证。阅读失败仍花去时间，书与购书成本不会退还。`,inspection:'逐页对照标题和篇末，检查有无缺页、大片洇墨或错接的书帖。抄本的笔迹只说明书写习惯，不能据此认定未署名作者的身份。',storage:'擦净手上的泥水再翻页，读后合进干燥书匣。用纸条标出篇次，避免折角遮住施术条件；存放时远离炉火与潮湿的器壁。'}};}

const water=(capacityMl,waterMl)=>({capacityMl,waterMl,turbidity:0,saltMg:0,toxinUg:0,pathogenRisk:0,odor:'无明显气味'});
const feature=(id,name,kind,position,state,extra={})=>({id:`feature_s1_${id}`,name,aliases:[],kind,owner:'npc_hw_luqing',access:'consent',position,state,...extra});
const plant=(stage='seedling')=>({alive:true,stage,health:100,frostToleranceC:0,waterMlPerMinute:.01,nutrientMgPerMinute:.001,rootLengthMeters:.1,herbKnown:true,commonProperties:['叶片可作带清香的非治疗性浸饮'],graftGroup:'same_school_stock'});
export const placements={
 bld_hw_school:[
  feature('anchor_school','学塾庭前锚面','silt_heap',[0,0],{siltGrams:0,anchorIntact:true},{spaceAnchor:true}),
  feature('landing','学塾庭中落脚石','silt_heap',[4,0],{siltGrams:0,blinkLanding:true}),
  feature('hearth','学塾习术火盆','object',[0,0],{}, {thermalModel:{heatCapacityJPerC:1000,maximumC:350,ambientC:20,passiveExchangeJPerMinute:50,burnMgPerMinute:100,fuelJPerMg:20,efficiencyPermille:900,ashPermille:50,ignitionMaximumMg:5000,ignitable:true,dryable:false,fuels:[{item:'item_charcoal',milligramsPerUnit:250000}]},thermalInitial:{temperatureC:20,fuelMg:4000,moistureMg:0}}),
  feature('leak_bucket','学塾待修漏桶','container',[.5,0],{...water(10000,8000),leakMlPerMinute:10,pressureKpa:10},{waterEarthProcess:'leak',links:{drain:'feature_s1_drain'}}),
  feature('drain','漏桶承水盘','container',[.5,.5],water(10000,0)),
  feature('herb','学塾已识香草','plant',[.5,0],{waterMl:50000,nutrientMg:10000,temperatureC:10,plant:plant('mature')},{careProcess:'plant'}),
  feature('seedling','学塾盆栽幼苗','plant',[0,0],{waterMl:50000,nutrientMg:10000,temperatureC:10,plant:plant()},{careProcess:'plant'}),
  feature('root_water','幼苗近旁清水盏','container',[.5,0],water(50000,30000)),
  feature('stock','学塾接合砧木','plant',[0,0],{waterMl:50000,nutrientMg:10000,temperatureC:10,plant:{...plant('mature'),graft:{scion:'feature_s1_scion',cutAligned:true,attached:true,rejection:30,union:20}}},{careProcess:'plant'}),
  feature('scion','学塾已接同类接穗','plant',[.5,0],{waterMl:50000,nutrientMg:10000,temperatureC:10,plant:plant('mature')},{careProcess:'plant'}),
  feature('fruit','学塾封闭果藏','container',[0,.5],{...water(1,0),closed:true,integrity:100,temperatureC:20,foodLots:[{id:'school_fruit',kind:'fruit',amountGrams:1000,spoiledGrams:0,badGrams:0,decayGramsPerMinute:.01}]},{careProcess:'food'}),
 ],
 loc_hw_dock:[feature('anchor_dock','渡口候渡锚面','silt_heap',[0,0],{siltGrams:0,anchorIntact:true},{spaceAnchor:true,owner:'npc_hw_luqing'})],
 loc_hw_fields:[{id:'feature_s1_field',name:'河湾燕麦生长田垄',aliases:[],kind:'soil',owner:'loc_hw',access:'public',position:[0,0],growth:{field:'farm_hw_oats',settlement:'loc_hw'},state:{...water(1000000,500000),nutrientMg:100000,worked:true,baseMoisturePercent:15,moisturePercent:65}}],
};
// The existing small channel gains its already measurable length/depth/velocity.
export const channelFacts={lengthMeters:3,depthCm:8,velocityMetersPerSecond:.2};
