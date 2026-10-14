// T103 authored candidates: light, care and mind spells for the Baishi still
// temple (止波寺), the lamp shrine's witch and priest teachers, and two
// bookshop volumes. Mechanics stay in the existing consumers (magic-light,
// magic-care, magic-mind-space, magic-object and the shared heal, protection,
// status and relief primitives); DeepSeek only reviews these fixed drafts.
export const revision='w2-s3-1';

const JI='npc_bs_076_3',SHU='npc_bs_078_2',MIAO='npc_bs_080_3',SELLER='npc_hw_luqing';
export const routes={
 佛:{profession:'profession_monk',teacher:JI,material:'item_s3_incense',phrase:'一支线香'},
 巫:{profession:'profession_witch',teacher:SHU,material:'item_s3_rice',phrase:'一小包祝米'},
 祭:{profession:'profession_priest',teacher:MIAO,material:'item_s3_lamp_oil',phrase:'一小盏灯油'},
 法:{profession:'profession_mage',teacher:null,material:'item_charcoal',phrase:'一份木炭'},
 通:{profession:null,teacher:null,material:'item_charcoal',phrase:'一份木炭'},
};
const open={river:'public',city:'public',port:'public'},guarded={river:'consent',city:'permit',port:'permit'},personal={river:'consent',city:'consent',port:'consent'},mentalLaw={river:'permit',city:'permit',port:'permit'};
const mind={lineOfSight:true,consent:'mental_magic',permit:'mental_magic'},support={lineOfSight:true,consent:'support_magic'},sight={lineOfSight:true};
export const routeOf={};
const spell=(key,name,route,stage,mp,minutes,duration,rangeMeters,effectSpec,effect,extra={})=>{
 const r=routes[route],id=`spell_s3_${key}`;routeOf[id]=route;
 const {law=open,mechanism=effectSpec.operation??effectSpec.status??effectSpec.kind,...rest}=extra;
 return {id,name,aliases:[],scope:null,skill:`skill_s3_${key}`,stage,mp,minutes,duration,durationLimit:duration,rangeMeters,
  difficulty:stage?15:10,materials:[{item:r.material,amount:1}],mechanism,effectSpec,effect,
  learnFee:stage?40:12,learnMinutes:stage?240:120,teachers:r.teacher?[r.teacher]:[],law,...rest};
};
const optics=(operation,power)=>({kind:'optics',operation,power});
const mindOp=(operation,power=1)=>({kind:'mind_space',operation,power});

export const spells=[
 // 佛门禅定与医护：季笙在止波寺授课，施术耗一支线香。
 spell('still_mind','观心照','佛',0,2,1,0,3,mindOp('sense_mind'),'察看本人或经本人同意者此刻身上有无错觉、强迫一类外来精神干扰，只答有无与几处；不读想法、不辨来源，恐惧不在其列。',{targeting:mind,law:mentalLaw}),
 spell('bead_guard','念珠护念','佛',1,6,2,43200,3,mindOp('memory_guard'),'护住本人或经同意者已有且尚未模糊的一段具体记忆三十天，期间这段记忆不因时日淡化或遗忘；不判断记忆真假，也不能找回已模糊的记忆。',{targeting:mind,law:mentalLaw}),
 spell('feeling_bead','寄念一珠','佛',0,2,1,1440,0,mindOp('record_feeling'),'把施术者自己写下的一句不超过80字的感受封进手中一件单件物品，一天内持有此物者检视可读出；不读取别人的心意。'),
 spell('post_guard','定桩护身','佛',1,6,1,30,3,{kind:'protection',power:8,damageTypes:['physical'],stacking:'strongest'},'本人或经同意者最多30分钟内，外来刀棍拳脚等物理伤害合计吸收8点，吸收完或期满即散；同时有几层防护只取最强一层。',{targeting:support}),
 spell('mend_palm','抚伤掌','佛',0,3,1,0,1,{kind:'heal',power:4},'手掌按住一米内的本人或经本人同意者，回复4点生命，不超过其上限；对濒死者可直接施救并使其脱离濒死。',{targeting:sight}),
 spell('rest_field','寮房养息','佛',1,8,2,60,3,{kind:'area',power:2,radiusMeters:2,intervalMinutes:10,trigger:'pulse',effect:{kind:'heal',power:2}},'以施术者所在处为中心、半径2米，最多60分钟；施成时和此后每10分钟，圈内看得见的本人及已同意治疗者各回复2点生命，离圈即不再受益。',{targeting:sight}),
 spell('herb_cool','药柜凉藏','佛',1,6,2,60,3,{kind:'care',operation:'preserve',power:50},'对封好的登记药柜，最多60分钟内每分钟另付维持魔力，柜温每分钟降0.5摄氏度、不低于1度，柜中药材变质减半；魔力不足即停，结束后柜温回到原样。'),
 spell('lamp_dim','低灯安寝','佛',0,2,1,30,3,optics('dim',60),'把三米内一盏登记灯具或自己手持的术光调暗到原亮度的四成，最多30分钟；不熄灯、不改灯油用量。'),
 spell('door_shade','闭隙静室','佛',0,2,1,30,3,optics('privacy',1),'遮住三米内一道关着的登记门缝（缝宽不超过10厘米），最多30分钟内隔着这道缝望不进去；门一打开即不再遮挡。'),
 spell('cool_cloth','凉帕退热','佛',0,2,1,0,1,{kind:'object',operation:'cool',power:2000,limitC:15},'手碰一件登记的湿敷帕等器物，把其热量最多带走2000焦耳，降温到15摄氏度为止，热散到周围；不造冰、不治病。'),
 // 巫祝安抚：舒绵在东街灯祠授课，施术耗一小包祝米。
 spell('startle_ease','收惊','巫',1,6,1,0,3,{kind:'relief',statuses:['fear','compulsion'],power:3},'为三米内本人或经本人同意者合计解去至多3点恐惧或轻度强迫状态；须持当地精神施法许可，不抹记忆、不改喜恶。',{targeting:mind,law:mentalLaw,mechanism:'calm'}),
 spell('calm_guard','安神护','巫',0,3,1,60,3,{kind:'status',status:'travel_calm',power:3},'本人或经同意者最多60分钟内心神较稳，恐惧对出手准头的影响最多抵消3点；不能解除已有的恐惧状态。',{targeting:support}),
 spell('shade_ward','避阴护','巫',1,6,1,60,3,{kind:'status',status:'shadow_ward',power:30},'本人或经同意者最多60分钟内所受暗影伤害减少三成；不挡刀剑、火焰与寒冷。',{targeting:support}),
 spell('fog_lamp','雾里一盏','巫',0,3,1,30,3,optics('fog_light',2),'在三米内登记的雾灯台处点起一团亮光最多30分钟，一米处约20勒克斯；起雾时站在灯旁三米内的人能看远一倍，雾越浓仍越看不远。'),
 spell('way_lamp','归路灯标','巫',0,3,1,90,3,optics('waymark',1),'在施术者此刻所在的这一头，为一条两端都亲自到过的相邻路线留下一点约1勒克斯的灯标，最多90分钟，查看这条路时可见；不开路、不给进入许可。'),
 spell('wind_cold_guard','避风寒护','巫',0,3,1,30,3,{kind:'protection',power:6,damageTypes:['cold','wind'],stacking:'strongest'},'本人或经同意者最多30分钟内，外来寒冷或风刃伤害合计吸收6点，吸收完或期满即散；不挡刀剑与火焰。',{targeting:support}),
 // 灯祠祭礼：苗笙在东街灯祠授课，施术耗一小盏灯油。
 spell('lamp_focus','聚灯照案','祭',0,3,1,30,3,optics('focus_light',60),'把三米内一盏实有的灯六成的光聚到一块登记的聚光面上，最多30分钟；灯向别处照的光同样少了六成，不添亮度。'),
 spell('mirror_turn','铜镜回光','祭',0,3,1,30,3,optics('reflect',40),'借一面登记镜面把三米内一盏实有灯的光最多四成转向一处登记观看点，最多30分钟；镜面反射率更低时按镜面为准，只照到观看点一米内。'),
 spell('veil_dark','帷暗','祭',1,6,1,10,3,optics('dark_area',70),'在三米内登记对象周围它自身登记的半径内，把各处光照压低七成，最多10分钟；不熄灯，圈外不受影响。',{law:guarded}),
 spell('lamp_screen','灯前帘','祭',0,2,1,10,3,optics('light_screen',1),'在三米内一处登记通道立一道看不透的光帘最多10分钟，施术者这一侧的人隔着通道望不过去，另一侧看来不受遮挡；声音和行走照常。'),
 // 法师读本（陆青书铺）：光影辨析。
 spell('color_read','辨色光','法',0,2,1,0,3,optics('color',1),'在有光处读出三米内一份登记矿物或染料样品各波长的反光比例；只给读数，不判定名称、成色或价值。'),
 spell('shadow_rule','量影','法',0,2,1,0,3,optics('shadow_measure',1),'借一盏比被测物高的实有灯、被测物和一面登记墙面，算出被测物高度、影长与影端位置；光路被挡则量不成。'),
 spell('reveal','破隐光','法',1,6,1,0,10,optics('reveal',1),'对十米内看得见的一个活体，解除其身上的折光隐身效果；不解其他状态，也不揭示没有施术的藏身处。',{targeting:sight}),
 spell('shadow_bind','缚影','法',1,6,1,2,10,optics('bind_shadow',1),'十米内看得见、正站在微光阴影里的一个活体，最多2分钟内挪不开步；把那处照亮或光线全暗即解，对强光下的人无效。',{targeting:sight,law:guarded}),
 spell('split_shadow','分影','法',1,6,1,1,10,optics('decoy',3),'为本人或经同意者在一名睁眼、看得见、目标处有光的观察者眼前多投一道虚影，最多1分钟内其下一次出手准头降低6%，用过一次即散。',{targeting:support,law:guarded}),
 // 通用读本（陆青书铺）：看护，无职业限制。
 spell('revive_breath','回息','通',0,5,1,0,3,{kind:'heal',power:10},'对三米内看得见的本人或经本人同意者回复10点生命，不超过上限；对濒死者可直接急救并使其脱离濒死。',{targeting:sight}),
 spell('wear_read','察器痕','通',0,1,1,0,3,optics('reveal_wear',1),'在有光处读出三米内一件登记器物表面的磨痕种类、深浅与长短；表面以下的损伤看不出来。'),
 spell('night_lamp','守夜灯','通',0,2,1,240,0,{kind:'light',power:10},'让掌心或手中一件单件物品发出一米处约100勒克斯的亮光，最多240分钟；可随时遮光、复光或熄灭，物件离手即不再发光。'),
 spell('heat_guard','防烫护手','通',0,3,1,30,1,{kind:'protection',power:6,damageTypes:['fire'],stacking:'strongest'},'本人或一米内经同意者最多30分钟内，外来火焰伤害合计吸收6点，吸收完或期满即散；不降低炉温，不挡刀剑。',{targeting:support}),
 spell('cloth_dry','晾帕收潮','通',0,2,1,0,3,{kind:'object',operation:'dry',power:1000,limitC:10},'借三米内一件登记可晾干器物自身高于10摄氏度的余热，蒸去其中至多1000毫克水分，每毫克用去3焦耳，器物随之变凉；不另生热。'),
];

// [theory, casting, counter, socialConsequences]
const texts={
 still_mind:['观心照察看三米内本人或经本人同意者此刻身上的外来精神干扰，只回答有没有、共有几处，例如错觉、强迫一类。它不读出对方在想什么，也不说明干扰从何而来；恐惧不在察看之列。','点燃一支线香插在身前，站在三米内看清对方，合掌数息三遍。对他人施术须先有其本人仍有效的同意，并持有当地颁发、仍有效的精神施法许可。','对方没有同意、许可过期或看不见对方时无从施术；察看结果只说此刻，不预言以后。','止波寺用它替自愿求助的人看一看是否受了旁人的术法干扰。查出有干扰也只是线索，不能据此指认是谁下的手，更不能未经同意去照别人的心。'],
 bead_guard:['念珠护念护住本人或经本人同意者心中一段已有、尚未模糊的具体记忆，最多三十天。护住期间这段记忆不会因时日久远而淡化或被忘掉；术式不判断记忆是否真实，已经模糊的记忆也找不回来。','点一支线香，捻念珠一圈，指定要护住的那一段记忆，站在三米内看清对方。对他人施术须其本人同意，并持有当地仍有效的精神施法许可。','未曾经历、已经模糊或指不出具体哪一段的记忆护不住；同意撤回或许可失效后护念不再作数。','可帮人记牢一次重要的约定或亲人的嘱托。护住的记忆照样可能本来就记错，不能拿来充当证词的担保。'],
 feeling_bead:['寄念一珠把施术者自己写下的一句不超过八十字的感受封进手中一件实际持有的单件物品，一天之内持有这件物品的人检视时可以读出这句话。它只封存施术者本人写下的话，读不出别人的心意。','点一支线香，把要封的物件握在掌心，默念要寄的那句话后吹熄香头。','手中不是单件物品、话超过八十字或物件不在手中时封不进去；一天后字句散去。','僧人常把一句安慰的话封进念珠交给远行的人。封进去的只是施术者自己的话，旁人读到也该当作留言，不当作誓约。'],
 post_guard:['定桩护身让本人或经本人同意者在最多30分钟内，把外来刀棍拳脚等物理伤害合计吸收八点；吸收满八点或期满就散去。身上同时有几层防护时，每次受伤只取最强的一层来挡。','点一支线香，站成定桩步，掌心按向三米内要护的人。替他人施术须先有其本人同意。','火焰、寒冷等非物理伤害挡不住；吸收完八点后照常受伤。','习武切磋时可先护住一层，以免失手伤人。它挡不了多少，不能当作刀枪不入，更不能借此逞强去挨打。'],
 mend_palm:['抚伤掌用手掌按住一米内的本人或经本人同意者，回复四点生命，不超过其生命上限。对濒死者可不等同意直接施救，并使其脱离濒死。','点一支线香，掌心贴在伤处近旁，随呼吸缓缓按压三下。对清醒的他人须先得其本人同意。','死者无法回复；离开一米或看不见对方时按不到。','寺中师徒练功磕碰时常用。回复有限，伤重的人仍要请医师诊治，不能拿它代替照料。'],
 rest_field:['寮房养息以施术者所在处为中心，在半径两米内最多维持60分钟。施成时和此后每隔10分钟，圈内看得见的本人以及已同意接受治疗的人各回复两点生命；走出圈外就不再受益。','点一支线香立在中央，绕圈缓行一周再回到圈心坐定。圈内他人须各自先同意接受治疗。','未同意的人、看不见的人或走出两米外的人不受益；圈心随施术时位置定下，之后不随人移动。','寮房里几个人一同歇息时可借它回些气力。每次回复不多，重伤仍要另行治疗；未同意的人不要拉进圈里。'],
 herb_cool:['药柜凉藏作用于封好且完好的登记药柜，最多60分钟。期间每分钟另付维持魔力，柜温每分钟降半度、不低于一摄氏度，柜中药材变质的速度减半；魔力不足便提前停止，结束时柜温回到施术前的样子。','点一支线香放在柜顶，确认柜门已经关好，掌心按住柜门静立片刻。药柜属寺中，须先得保管人许可。','柜门没关、柜子破损或柜中仍有已坏的药材时不能施术；魔力不够维持就会中断。','暑天可替寺里多保存一阵药材。省下的只是变质的速度，药材到了年限仍要清点更换。'],
 lamp_dim:['低灯安寝把三米内一盏登记灯具或施术者自己手持的术光调暗到原来亮度的四成，最多30分钟。它不熄灯，也不改变灯油用量。','点一支线香，对着灯焰缓缓压掌三次。寺里的灯属保管人，须先得许可。','已经熄灭或被遮住的灯调不了；期满后亮度恢复。','夜里有人养病时可让灯光柔和些，又不至于全黑。灯暗了，走动的人要留心脚下。'],
 door_shade:['闭隙静室遮住三米内一道关着的登记门缝，缝宽不超过十厘米，最多30分钟内隔着这道缝望不进去。门一打开，遮挡便不再起作用。','点一支线香，在门缝前从上到下抹过一遍。禅房属寺中，须先得保管人许可。','门开着或缝太宽时遮不住；只挡视线，不挡声音。','禅修或换药时可免旁人从门缝里窥看。它不锁门，有人推门仍可进来。'],
 cool_cloth:['凉帕退热用手碰到一件登记的湿敷帕之类的器物，把它的热量最多带走两千焦耳，降到十五摄氏度为止，热散到周围。它不结冰，也不能直接治好发热。','点一支线香，一手托住帕子，一手从上抚过。帕子属寺中，须先得保管人许可。','已经不高于十五摄氏度的器物降不下去；离开一米便碰不到。','照看发热的人时可让敷帕凉得快些。敷帕只是帮人舒服一点，病情仍要请医师看。'],
 startle_ease:['收惊为三米内本人或经本人同意者合计解去至多三点恐惧或轻度强迫状态，先解哪一个按次序排定。它不抹去记忆，也不改变一个人的喜恶。','撒一小包祝米在对方脚边，站在三米内看清对方，轻声唤其名字三遍。对他人须其本人同意，并持当地颁发、仍有效的精神施法许可。','没有同意或许可时不能施术；超过三点的部分要另行再解。','孩子受了惊吓或有人被术法吓住时，巫祝常为其收惊。施术前要说清做什么，不能借安抚之名去左右别人的想法。'],
 calm_guard:['安神护让本人或经本人同意者在最多60分钟内心神较稳，恐惧对出手准头造成的影响最多抵消三点。它不解除已有的恐惧状态，期满即止。','撒一小包祝米绕身一圈，站在三米内看清要护的人。替他人施术须先得其本人同意。','只减轻恐惧对准头的影响，不挡伤害；恐惧状态本身仍在。','夜里去祠后守灵前可先稳一稳心神。心里怕不怕仍是自己的事，它不会让人变得不知危险。'],
 shade_ward:['避阴护让本人或经本人同意者在最多60分钟内所受的暗影伤害减少三成。刀剑、火焰和寒冷都不在其内。','撒一小包祝米在脚前成一道弧线，站在三米内看清要护的人。替他人施术须先得其本人同意。','只减暗影伤害，其他伤害照常；期满即止。','行夜路去偏僻处时可多一层防备。减去的只是三成，不能当作可以去招惹暗处凶物的凭仗。'],
 fog_lamp:['雾里一盏在三米内登记的雾灯台处点起一团亮光，最多30分钟，一米处约二十勒克斯。起雾时站在灯旁三米内的人能比平时看远一倍，雾越浓仍越看不远。','撒一小包祝米在灯台座上，站在三米内对着灯台托掌。雾灯台属灯祠，须先得管灯的人许可。','不在灯旁三米内的人看不远；期满亮光散去。','雾天夜里有人来祠里求助，可借它照出门前一段路。光不算亮，不能替代真正的灯火。'],
 way_lamp:['归路灯标在施术者此刻所在的这一头，为一条两端都亲自到过、眼下走得通的相邻路线留下一点约一勒克斯的灯标，最多90分钟；查看这条路时就能看见它。它不开辟道路，也不给任何进入许可。','撒一小包祝米在路口，站定后朝路的方向指一指。','没去过另一头的路标不了；路线不通时也标不上。','巫祝送人夜归时常在路口留一盏小标，好让人记得从哪里转。灯标谁都看得见，别人也能循着它找来。'],
 wind_cold_guard:['避风寒护让本人或经本人同意者在最多30分钟内，把外来的寒冷或风刃伤害合计吸收六点；吸收满六点或期满就散去。刀剑和火焰不在其内。','撒一小包祝米在对方衣襟上，站在三米内看清要护的人。替他人施术须先得其本人同意。','吸收完六点后照常受伤；物理与火焰伤害挡不住。','冬夜守灵或在风口候人时可多一层遮挡。护得有限，仍要添衣避风。'],
 lamp_focus:['聚灯照案把三米内一盏实有的灯六成的光聚到一块登记的聚光面上，最多30分钟。灯照向别处的光也同样少了六成，总亮度并不增加。','倒一小盏灯油添进灯里，站在三米内一手指灯、一手指向聚光面。灯和聚光面属灯祠，须先得管灯的人许可。','灯已熄灭、被遮住或已有聚光时聚不成；光路被挡也不行。','读经或替人看伤口时可把供案照亮。别处随之变暗，旁人走动要小心。'],
 mirror_turn:['铜镜回光借一面登记的镜面，把三米内一盏实有灯的光最多四成转向一处登记的观看点，最多30分钟；镜面本身的反射率更低时以镜面为准，光只照到观看点一米以内。','倒一小盏灯油添进灯里，站在三米内转动镜面对准观看点。灯和镜面属灯祠，须先得管灯的人许可。','灯与镜之间、镜与观看点之间被挡住时回不了光；同一盏灯已在聚光或回光时不能重复。','祠里可借镜光照亮侧席，方便老人看清供单。光向一处偏去，灯下便暗了些。'],
 veil_dark:['帷暗在三米内一个登记对象周围、它自身登记的半径以内，把各处光照压低七成，最多10分钟。它不熄灭任何灯，圈外的光照不受影响。','倒一小盏灯油在对象前的地上，站在三米内向下拂袖。卧榻属灯祠，须先得管灯的人许可。','没有登记半径的对象用不上；期满光照恢复。','偏殿有人歇息时可让卧榻一带暗下来。在城里对别人的地方压暗光线须先有许可，以免被当作遮掩行迹。'],
 lamp_screen:['灯前帘在三米内一处登记通道立起一道看不透的光帘，最多10分钟。施术者这一侧的人隔着通道望不过去，从另一侧看过来不受遮挡；声音和行走都照常。','倒一小盏灯油在通道口画一道横线，站在三米内对着通道展掌。侧廊属灯祠，须先得管灯的人许可。','只挡视线，不挡人也不挡声音；宽过两米的通道立不起来。','祭礼时可挡住前院望向内廊的视线。它不拦人，真要有人走过照样能过去。'],
 color_read:['辨色光在有光的地方读出三米内一份登记矿物或染料样品在各个波长上的反光比例。它只给出读数，不判定样品叫什么、成色如何、值多少钱。','耗一份木炭在样品旁画一道短线，站在三米内让光照在样品上，眯眼细看。','完全无光、不是矿物或染料的样品，或没有登记光谱的样品读不出。','可替人比对两份颜料是否同出一处。读数需要懂行的人解读，不能直接当作鉴定结论。'],
 shadow_rule:['量影借一盏比被测物更高的实有灯、被测物本身和一面登记墙面，算出被测物的高度、投在墙上的影长和影端位置。灯与物、物与墙之间的光路被挡住时量不成。','耗一份木炭在墙面标一个起点，站在三米内依次看灯、看物、看墙。','灯比被测物低、没有登记墙面或光路被挡时无从计算。','修檐挂匾前可先量出高度。量出的是此刻灯下的影，换了灯位要重量。'],
 reveal:['破隐光对十米内看得见的一个活体，解除其身上的折光隐身效果。它不解其他状态，对没有施术、只是藏在暗处的人也揭示不了什么。','耗一份木炭在掌心划一道，对准十米内的目标张开手掌。','看不见目标或目标身上没有折光效果时，施术不会有收获。','巡夜时可识破借光术藏身的人。随意对路人施术会被视为无礼，得罪人时要自己担着。'],
 shadow_bind:['缚影让十米内看得见、正站在微光阴影里的一个活体在最多2分钟内挪不开步。把那处照亮，或光线完全暗下去，束缚即解；站在明亮处的人不受影响。','耗一份木炭在地上画一道指向目标影子的短线，站在十米内看准目标脚下。','目标处于强光或全黑中时缚不住；期满自然解开。','可用来拦住暗处逃跑的人，也可能被用来困人。城里对他人施术须先有许可，乱用会惹上官司。'],
 split_shadow:['分影为本人或经本人同意者，在一名睁着眼、看得见、目标处有光的观察者眼前多投一道虚影，最多1分钟内这名观察者下一次出手的准头降低百分之六；用过一次就散。','耗一份木炭在脚边画一个侧影，站定后看准十米内的观察者。替他人施术须先得其本人同意。','闭眼、看不见或目标处全暗时骗不过观察者；虚影不挡伤害。','对练时可练习闪避。拿来骗人动手属于欺瞒，城里对他人施术须先有许可。'],
 revive_breath:['回息对三米内看得见的本人或经本人同意者回复十点生命，不超过其生命上限。对濒死者可不等同意直接急救，并使其脱离濒死。','耗一份木炭在伤者身旁画一个圈，站在三米内看清对方，随其呼吸节律按掌。对清醒的他人须先得其本人同意。','死者无法回复；看不见或超过三米时救不到。','路遇有人倒地时可先稳住性命。回复之后仍要请医师处理伤口，不能以为已经治好。'],
 wear_read:['察器痕在有光的地方读出三米内一件登记器物表面的磨痕种类、深浅和长短。表面以下的暗伤看不出来，也不说明是谁造成的。','耗一份木炭在器物边沿点一下，站在三米内顺着光看过去。','完全无光或器物没有登记表面痕迹时读不出。','看病人用过的药臼、拐杖磨损到什么程度，可帮人决定是否该换。读出的只是表面，不能当作谁动过手脚的证据。'],
 night_lamp:['守夜灯让施术者的掌心或手中一件单件物品发出一米处约一百勒克斯的亮光，最多240分钟。可以随时遮光、复光或熄灭；物件离手就不再发光。','耗一份木炭在掌心或物件上画一个小圈，合掌后缓缓张开。','手中不是单件物品或已放下时不发光；期满光散。','守夜照看病人时可以有一盏不冒烟的灯。亮光引人注意，夜行时要自己斟酌。'],
 heat_guard:['防烫护手让本人或一米内经本人同意者在最多30分钟内，把外来的火焰伤害合计吸收六点；吸收满六点或期满就散去。它不降低炉温，也挡不了刀剑。','耗一份木炭在手背画一道横线，替他人施术时须握住对方的手并先得其本人同意。','吸收完六点后照常受伤；寒冷与物理伤害挡不住。','煎药、端炉时可防一时烫伤。护得有限，仍要用布垫着拿热器。'],
 cloth_dry:['晾帕收潮借三米内一件登记、可以晾干的器物自身高于十摄氏度的余热，蒸去其中至多一千毫克水分，每蒸去一毫克用去三焦耳，器物随之变凉。它不另外生热。','耗一份木炭在器物旁划一道向上的短线，站在三米内掌心向上一托。','器物不能晾干、没有水分或已不高于十摄氏度时收不了潮。','雨天可让晾着的布帕快干一些。蒸出的水汽留在附近，屋里会略潮。'],
};
const key=s=>s.id.slice('spell_s3_'.length);
export function spellDraft(s){
 const i=spells.findIndex(row=>row.id===s.id),[theory,casting,counter,socialConsequences]=texts[key(s)],r=routes[routeOf[s.id]];
 const failed=[`心念散开时，已花的魔力、${r.phrase}和施法时间仍计入这一次尝试，目标没有新的术式效果。`,`若收束没有成功，本次魔力与${r.phrase}仍已用去，施法时间也不会退回，目标不获得这次效果。`,`手印未能合拢时，此次所用魔力和${r.phrase}已消耗，时间照常过去；没有新的效果留在目标上。`][i%3];
 return {id:s.id,prose:{theory,casting,failure:failed,counters:[counter,`施法前若魔力或${r.phrase}不足，就无法开始这次施术。`],socialConsequences,
  proficiencyEffects:['初学时先核对对象和条件，再练习把手印完整收束。','练熟之后，符合条件的尝试更容易完成，失败仍承担同样消耗。','进一步熟练能改善成功把握，不能越过距离或对象边界。','熟练不改变固定施法时间、用量和效果期限，也不赋予额外能力。']},source:structuredClone(sources.mappings[i])};
}

// Two bookshop volumes for the mage and general spells.
const volumes=[
 ['optics','光影辨析读本',1,['color_read','shadow_rule','reveal','shadow_bind','split_shadow']],
 ['care','看护灯火读本',0,['revive_breath','wear_read','night_lamp','heat_guard','cloth_dry']],
];
export const books=volumes.map(([k,name,stage,keys])=>({id:`item_book_s3_${k}`,name,aliases:[],scope:null,quality:'木',durability:80,weight:.2,basePrice:stage?80:24,tags:['paper','book'],origin:'bld_hw_school',shelfLifeDays:365,seasonality:'现有抄本售罄后不自动补货',
 book:{grade:stage?'中级':'初级',author:'未署名抄本',edition:'白石分题习术本',origin:'bld_hw_school',teaches:keys.map(k=>`spell_s3_${k}`),readingMinutes:stage?240:120,prerequisites:[]}}));

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

// Ritual materials sold by the three teachers. Prose is reviewed with the batch.
const item=(id,name,weight,basePrice,tags,extra,prose)=>({id,name,aliases:[],scope:null,quality:'木',weight,basePrice,durability:100,origin:'loc_bs',shelfLifeDays:365,seasonality:'常年少量供应',tags,...extra,_prose:prose});
const itemRows=[
 item('item_s3_incense','线香',.002,1,['incense','ritual'],{acquisition:{seller:JI,mode:'有限库存'}},{
  use:'一支约一拃长的线香，点燃后可烧一刻钟上下；止波寺所授术法施展时耗用一支。',
  description:'用柏木粉和榆皮粉调成的细香，色呈浅褐，干透后笔直不弯。止波寺静息廊里常年点着，闻起来是淡淡的木香，烟细而不呛。',
  inspection:'看香身是否笔直完整、粗细均匀，有无受潮发软或断裂；凑近闻应是干燥的木香，有霉味的不用。',
  storage:'成把用纸包好，平放在干燥的木匣里，远离灯火和水汽；点过的残香不要放回匣中。'}),
 item('item_s3_rice','祝米小包',.05,1,['grain','ritual'],{acquisition:{seller:SHU,mode:'有限库存'}},{
  use:'一小包约五十克的糙米，巫祝安抚时撒在人脚边或身旁；灯祠舒绵所授术法施展时耗用一包。',
  description:'用粗纸包起的一小包糙米，米粒带着淡黄的谷皮，颗粒完整，摸上去干爽。灯祠里习惯用它撒米收惊，撒过的米随后扫起喂鸡，不再入口。',
  inspection:'打开纸包看米粒是否干燥完整，有无虫眼、结块或霉点；有异味的整包弃去。',
  storage:'放在有盖的陶罐里，置阴凉干燥处，防潮防鼠；一年内用完。'}),
 item('item_s3_lamp_oil','灯油小盏',.02,2,['oil','ritual'],{acquisition:{seller:MIAO,mode:'有限库存'}},{
  use:'一小盏约二十毫升的菜籽灯油，添进灯里可多点一阵；灯祠苗笙所授术法施展时耗用一盏。',
  description:'装在小陶盏里的菜籽油，色泽淡黄，略有油香。灯祠供灯和廊灯都用这种油，一盏油盖着油纸，便于随身携带。',
  inspection:'看油色是否清亮，有无浑浊、沉渣或酸败的哈喇味；油纸破了或洒出过的盏不宜带在身上。',
  storage:'放在阴凉处，盏口盖紧油纸，远离明火与孩童；洒出的油要及时擦干，免得滑脚。'}),
];
export const items=itemRows.map(({_prose,...row})=>row);
export const itemProse=Object.fromEntries(itemRows.map(r=>[r.id,r._prose]));
export function itemDraft(i){return{id:i.id,prose:structuredClone(itemProse[i.id])};}
export const recipes=[];

// Registered scene objects at the still temple and the lamp shrine.
const f=(id,name,kind,owner,access,position,state,extra={})=>({id:`feature_s3_${id}`,name,aliases:[],kind,owner,access,position,state,...extra});
const lamp=(lux,height)=>({emissionLuxAt1m:lux,heightMeters:height,lit:true,covered:false});
const cloth=moistureMg=>({thermalModel:{ambientC:20,heatCapacityJPerC:400,maximumC:100,passiveExchangeJPerMinute:200,burnMgPerMinute:1,fuelJPerMg:1,efficiencyPermille:1,ashPermille:0,ignitionMaximumMg:1,ignitable:false,dryable:true,fuels:[]},thermalInitial:{temperatureC:20,fuelMg:0,moistureMg}});
export const placements={
 bld_bs_still_temple:[
  f('hall_lamp','静息廊长明灯','lamp',JI,'consent',[0,1],lamp(20,2)),
  f('chan_door','禅房门缝','aperture',JI,'consent',[1,0],{widthMeters:.8,apertureMeters:.02,open:false}),
  f('herb_cabinet','寺中药柜','container',JI,'consent',[0,-1],{capacityMl:1000,waterMl:0,turbidity:0,saltMg:0,toxinUg:0,pathogenRisk:0,odor:'干燥药香',
   closed:true,integrity:100,temperatureC:18,insulationPercent:100,foodLots:[{id:'lot_s3_dried_herbs',kind:'herb',amountGrams:3000,spoiledGrams:0,badGrams:0,decayGramsPerMinute:.02}]},{careProcess:'food'}),
  f('compress_cloth','寺中湿敷帕','object',JI,'consent',[.5,-.5],{},cloth(20000)),
 ],
 bld_bs_temple:[
  f('altar_lamp','祠堂供灯','lamp',MIAO,'consent',[0,1],lamp(30,1.5)),
  f('offering_table','灯祠供案','surface',MIAO,'consent',[1,0],{focusAreaM2:.5}),
  f('bronze_mirror','祠中铜镜','surface',MIAO,'consent',[1,1],{reflectivityPercent:60,reflectionAreaM2:.3}),
  f('side_seat','祠中侧席','surface','loc_bs','public',[2,1],{}),
  f('rest_couch','偏殿卧榻','prop',MIAO,'consent',[-1,0],{radiusMeters:1.5}),
  f('side_passage','灯祠侧廊','passage',MIAO,'consent',[0,-1],{widthMeters:1.5}),
  f('fog_stand','祠前雾灯台','prop',SHU,'consent',[1,-1],{radiusMeters:2}),
  f('porch_lamp','祠前廊灯','lamp','loc_bs','public',[-1,1],lamp(20,2.5)),
  f('ore_tray','祠前矿样盘','sample','loc_bs','public',[-1,-1],{sampleType:'mineral',sampleGrams:30,heightMeters:.1,
   spectrum:[{wavelengthNm:450,reflectance:.12},{wavelengthNm:550,reflectance:.2},{wavelengthNm:650,reflectance:.62}]}),
  f('incense_post','祠前香柱','prop','loc_bs','public',[-.5,1.5],{heightMeters:1}),
  f('screen_wall','祠前影壁','surface','loc_bs','public',[0,2],{}),
  f('old_mortar','祠前旧药臼','surface','loc_bs','public',[-2,0],{wear:[{kind:'研磨凹痕',depthMm:1.5,lengthMm:40},{kind:'细裂纹',depthMm:.3,lengthMm:12}]}),
  f('drying_cloth','祠前晾帕','object','loc_bs','public',[-1,-2],{},cloth(5000)),
  f('dark_corner','祠后暗角','prop','loc_bs','public',[5,-5],{}),
 ],
};
export const stations={};

// Teaching and stock added to existing residents; reviewed prose stays unchanged.
export const mentors={
 [JI]:{teach:spells.filter(s=>routeOf[s.id]==='佛').map(s=>s.id),inventory:{item_s3_incense:12}},
 [SHU]:{teach:spells.filter(s=>routeOf[s.id]==='巫').map(s=>s.id),inventory:{item_s3_rice:10}},
 [MIAO]:{teach:spells.filter(s=>routeOf[s.id]==='祭').map(s=>s.id),inventory:{item_s3_lamp_oil:8}},
};
