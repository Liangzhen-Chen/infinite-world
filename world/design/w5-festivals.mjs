// Dates nominate an annual gathering, not an unconditional world event.
const rows = [
 ['ditchmeal','修渠灶饭日','river','furrow','furroworder',2,15,'西陲河谷','loc_hw_fields','南田渠旁已获借用的空地','本轮修渠验收通过才开灶；未通过只议修补，不宣称田渠已畅通','自带薄饼共食，先给病者留份；修渠人用泥哨换拍','item_oat_flatbread',1,'consume',60,'自带食物，旁听不收费','询问邻户下次合工意愿','上游有人想以捐食换取优先分水','分水仍须原有议事，捐粮不买水权'],
 ['threshold','水痕描槛日','river','lintel','riverhomes',1,8,'西陲河谷','loc_hw','获屋主同意的门槛与村中空地','只描屋主指认的旧水痕，不据此改变地界','拿白垩比对旧水位，孩童听老人讲搬粮路线','item_calcite_chalk',1,'consume',45,'自备白垩，访门先征同意','向邻居请教避水经验','租户与屋主记得的水痕高度不同','进入房屋需屋主许可，口述不替代地契'],
 ['borrowbench','借凳归途日','river','return','returnorder',9,25,'西陲河谷','bld_bs_shrine','白石归途殿门廊获准借用处','殿方允许且不妨碍日常登记才摆借凳','旅人坐自己的行囊，居民借来矮凳听返乡消息','item_three_leg_stool',1,'borrow',90,'借凳须归还；食宿另议价','交换归途消息与寻亲线索','候座旅人误以为借凳便可免费住宿','庆日不改变复活等级、登记费或住宿债务'],
 ['orchardshare','果枝空篮日','river','furrow','riverhomes',8,18,'西陲河谷','loc_hw_orchard','果园管理者划出的树外空地','管理者确认当日可入园，未获准则不举办','把自有果实切分带来，空篮朝上表示还没分到','item_fresh_apple',2,'consume',75,'自有苹果两枚；公共果实不得自取','与照护果树的人商议下次帮工','有人把空篮当作强制分果凭据','空篮仅表达需要，不创设收获份额'],
 ['steps','清阶开庭日','civic','lintel','thresholdhouse',1,15,'中陆诸邦',null,'各家同意开放的门阶','家户分别允准，未开放的庭门保持关闭','扫阶后唱厅堂歌，门内人把礼领收起才迎邻客','item_wood_shavings',1,'consume',60,'自有干木刨屑吸湿后收走','请求相邻业主约定共修门阶时间','打扫者要求替不识字者直接盖印','扫阶无代签权，立契须本人读明白'],
 ['lampturn','公灯交值日','civic','lintel','civicartisans',6,25,'中陆诸邦',null,'工坊合修拱廊的值灯台','有持灯者自愿接值且场所准用才点灯','交回旧灯托，点自己的蜡烛照看接缝木作','item_wax_candle',1,'consume',60,'自备细蜂蜡烛，工具借用另征同意','寻找愿意示范镶木接缝的匠人','有人要求未承诺的工坊补足公灯','节庆邀请不等于新增轮值债务'],
 ['missingpage','留白忆亲日','civic','mirror','quietledger',11,12,'中陆诸邦',null,'家属允许使用的小院','只展示本人及家属同意公开的文字','皮纸上留一处空白，承认记不清的往事','item_parchment',1,'consume',45,'自备一张皮纸，不强迫捐款','听亲属讲述愿意公开的记忆','旁人想把空白填成断言再收进讼卷','悼念不证明事实，不免债也不窥读私人档案'],
 ['copies','副契晾墨日','civic','lintel','oathkeepers',4,5,'中陆诸邦',null,'证契堂获准开放的抄写席','只抄持有人允许复制的契页','在桌边试写姓名，用旧誊本练辨责任词句','item_soot_ink',1,'consume',90,'自备树胶烟墨；正式抄契与认证另议费用','向抄写者学习辨认责任措辞','练习纸被人误当成已签新契','练习不产生契约效力，认证权限没有改变'],
 ['wellrope','交绳歇井日','steppe','well','wellkin',3,10,'风脊草原',null,'迁帐队伍议定的共享井外','队伍确有交接且饮水通道畅通才聚集','卸下旧井绳请下一队逐段摸查，不在井口设摊','item_flax_cord',1,'borrow',60,'带一束自有麻绳供示范，旧井绳仍为共有','找见证人商议同行次序','过路商想把共有井绳买走','示范绳不能替换井绳，饮水通行不得阻断'],
 ['hoofsong','识蹄骨哨日','steppe','well','hoofguild',7,20,'风脊草原',null,'牧户允许进入的空栏外','畜主在场同意，畜群不受惊才示范','成年人对比旧蹄印，少年在栏外听长音','item_calcite_chalk',1,'consume',50,'自备白垩画蹄形，不收取畜主未同意的费用','寻找愿意带学识蹄的人','围观者要求骑陌生牲畜试走','庆日不授骑乘权，不组织少年危险追逐'],
 ['seeds','晒种会','canopy','canopy','seedcourt',5,15,'翡翠林盟',null,'育苗院同意开放的晒台','幼树成活已经查验且当日干燥才晒种；未满足则只议照护','照护者带自有种子匣讲失败苗株，唱呼应短歌','item_lidded_seed_box',1,'borrow',80,'自备种子匣，种子转让另获所有者同意','请教幼苗养护并约帮工','访客把听歌当成获赠种子的凭据','晒种不发采伐配额，不承诺催生成活'],
 ['bindings','换绑听枝日','canopy','canopy','forestcouncil',10,8,'翡翠林盟',null,'获准停用的架台旁','承重管理者允许停用并安排合格工人后才换绑','在地面传递自有麻绳，对照旧绑结的磨痕','item_flax_cord',2,'consume',100,'自备两束麻绳，登台资格另审','报名后续轮班养护','赶路人催促未验收的架台重新通行','节日不替代承重验收，禁止敲击巢树试音'],
 ['scentcloth','晒嗅布日','beast','scent','scentkin',3,22,'翡翠林盟东缘',null,'养育群允许使用的通风坡台','布的保管者同意展示且不混换原物','隔开摆放各群保管的嗅布，分别说鼻闻与亲见','item_linen_cloth',1,'borrow',60,'自备干净麻布演示，证布只由保管者经手','结识别群口述者并比较季节经验','有人想洗净旧布让气味一致','不得清洗或替换证布，嗅证仍需交叉复核'],
 ['oldvoices','低鸣忆路日','beast','scent','scentkin',9,12,'翡翠林盟东缘',null,'养育群的会客坡屋','屋主允入，口述者愿意讲述才开唱','嗅觉衰退者先讲熟路，低鸣和唱接住停顿','item_dried_fruit',1,'consume',70,'自带干果，给口述者的食物可拒收','听失踪亲友曾走过的道路','年轻追踪者把模糊记忆当成现成追捕依据','口述保留不确定处，不迫使老人带路'],
 ['sailpatch','补帆夜','coast','tide','patchsail',4,18,'琥珀海岸与盐风群岛',null,'船户借出的避风修帆棚','棚主允用、破帆确属带来者或受托维修才开工','各户摊自己的破帆，拉缆歌随穿针停顿','item_patch_bundle',1,'consume',120,'自备锁边补衣片作小补料，大破口另议料工','与船户约定以后补帆的工价','救起的帆被捞取者当成可自由出售','救助不转移所有权，补帆不保证适航'],
 ['tidebook','空泊阅潮日','coast','tide','harboroffice',8,5,'琥珀海岸',null,'港方允许围看的岸上潮簿席','港方公布可阅内容，风浪恶劣只在岸上说明','拿自带陶杯比画吃水差异，轮唱返航歌','item_clay_cup',1,'borrow',50,'自带陶杯，出航与泊位仍另议','询问救助记号怎样登记','商人要求节日免去未缴的泊费','旁听不获泊位许可，潮簿不承诺当日可航'],
 ['rescuegear','封湾验具日','north','lamp','winterstore',10,20,'北境星湾',null,'冬储户获准共用的内廊','户主与器具保管人同意，未清点完不宣布备妥','核对自家救船具，把缺失处写在带来的皮纸上','item_parchment',1,'consume',90,'自备皮纸；缺失器具由原有承担者另行筹措','与邻户约定可承担的守候班','有人要把未检查的冰道标成已开','查具不授权破冰，救助不要求必死冒险'],
 ['wick','换芯长夜','north','lamp','lamporder',12,20,'北境星湾',null,'守灯户同意开放的共用内廊','有自备灯火且不动用未获准冬储才聚会','交换自己的备用蜡烛，低声轮唱陪守灯人','item_wax_candle',1,'transfer',60,'自备一根细蜂蜡烛，交换须双方同意','陪伴轮守者并交换平安消息','客人想借庆典多燃冬储油表演','火光不延长昼长，不挪用储油也不强排新班'],
 ['jarfair','换罐候雨市','salt','shade','watercourt',1,25,'灰盐荒地',null,'水议席准许摆摊的阴巷口','本年已经有可收集的首场雨且水源经确认才能换罐；否则仅登记意愿','带自有空罐轻敲辨裂，饮水器与工艺器分开','item_clay_pot',1,'transfer',80,'自有陶罐可议交换，水与运费各自议价','找愿互换容器的家户','商人把工艺废水当雨水展示','敲罐不检毒，弃井不能承接废水'],
 ['shademeasure','量影歇行日','salt','shade','shadeorder',6,12,'镜沼与灰盐荒地',null,'获住户允许借阴的巷边','阴处可容身且饮水份额先获所有者同意','沿墙坐下复述供水条件，量杯不离持有人手','item_clay_cup',1,'borrow',40,'自带陶杯与自有饮水，不承诺免费补水','商议旱路同行的携水分担','旅人借借阴要求长期饮水份额','借阴不取得井权，量杯不召来清水'],
 ['stretcher','停炉补架日','forge','wedge','wedgeorder',5,8,'寒炉山地',null,'炉主允许停用的担架龛旁','炉主已经确认安全停炉，具资格者负责修补','拿自有麻绳补旧担架，检查排烟口留出的通风处','item_flax_cord',2,'consume',120,'自备两束麻绳，替换木件另经所有者同意','报名协助不接触热炉的搬运','工头想借节日把事故楔重新放回料堆','不取消工伤份额，事故楔保持隔离'],
 ['wrongwedge','退楔示裂日','forge','wedge','kilnkin',11,5,'寒炉山地',null,'家属获准观看的事故物保管席','保管者允许展示，事故物不离指定位置','用自带木楔对比事故楔的裂纹，不再次承重试险','item_wooden_peg',1,'borrow',60,'自有木楔用于示范，事故物不得买卖','向老匠询问识别危险磨痕','买家想把事故楔作护身物带走','纪念不赋予护身效果，不替代工伤查账'],
 ['oldseal','撤旧符日','reed','bank','bankorder',7,8,'镜沼潮汀支流',null,'道院许可的堤外验符席','先由负责者验堤；效期和撤换权限核实后才能处理旧符','把账袋与符袋分开，拿空白皮纸记录待验处','item_parchment',1,'consume',90,'自备皮纸只作记录，施术材料和费用另议','请道士解释符契的材料与效期','债务人要求把债契混进旧符销掉','节日不抹债、不强迫认罪，符效须实际施术'],
 ['dryrubbing','晴檐拓尺日','reed','bank','reedpaper',2,25,'镜沼与灰盐荒地',null,'纸坊准许借用的干燥檐下','水尺保管人同意，尺面可操作才作拓样','并排看自带旧拓样，纸墨与符料各存各袋','item_soot_ink',1,'consume',70,'自备树胶烟墨，正式纸材需另获供应','约同业复核水尺磨损','商贩宣称普通拓纸可直接驱邪','拓印不改变水位，不令普通纸获得术式']
];
export const festivalCalendar={epoch:'春历',monthsPerYear:12,daysPerMonth:30,marketDays:[5,15,25],months:['雨月','芽月','花月','麦月','晴月','雷月','穗月','果月','雁月','霜月','雪月','灯月']};
export const festivals=rows.map(([slug,name,culture,deity,organizer,month,day,region,location,venue,condition,custom,item,quantity,use,minutes,cost,social,conflict,permission])=>({
 id:`festival_${slug}`,name,aliases:[],category:'festival',scope:'global',culture:`culture_${culture}`,deity:`deity_${deity}`,organizer:`faction_${organizer}`,
 calendar:{epoch:'春历',month,day,durationDays:1,marketDay:[5,15,25].includes(day),rule:'annual_nomination_with_conditions'},
 venue:{region,location,description:venue,precision:location?'existing_location':'regional_unmapped'},condition,custom,
 participation:{minutes,admissionCopper:0,cost,attendance:'自愿参加；旁听不收费，材料、交易、场所和专业服务各自取得同意'},
 resourceNeeds:[{item,quantity,use,source:'参加者自有且同意提供；不代表组织库存或自动发放',unit:'物品目录份或件'}],
 socialOpportunity:social,possibleConflict:conflict,permission,
 runtime:{status:'design_only',scheduler:'pending_M5',effects:[],cancellation:'条件未满足则不执行该项活动；不得以节日名义迁移NPC、扣款或发放资源'},
 references:[`culture_${culture}`,`deity_${deity}`,`faction_${organizer}`,...(location?[location]:[]),item],proseFields:['customScene','participationScene','tensionScene']
}));
export default festivals;
