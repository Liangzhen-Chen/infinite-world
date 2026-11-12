import {villageFacts} from './w1-villages.mjs';
import {trialProcedureFor} from './s4-law-content-data.mjs';
import {creditTenderNormalizer} from './s5-credit-content-approval.mjs';
const normalizeCreditTender=await creditTenderNormalizer();

// Problems remain proposals. The T02 source charter separately registers public accounts and authority.
// Resolution options remain proposals until the parties actually agree.
const raw={
 yp:{
  coordinators:['zhaofeng','gaoxin','lisha'],industries:['坡麦与菜圃农事','榆枝篱笆、木桶和旧农具修补','麻线与旧衣整理'],
  meeting:'轮水记录由赵枫保管，代笔疑问找高忻，菜圃换工由利莎联络。有关住户在坡口议事屋核对原话，改动须让受影响的人复述确认；记录人不能替缺席户答应。',
  custom:'借用避风位先留一条搬运通道；换工要分别说清劳力和工具，不能把别人路过当成答应帮忙。',
  problems:[
   ['轮水册漏行','hall','zhaofeng','qiaoduan','先核对原记录再改','先防自家沟口继续受损','把有争议的那一行另附口述副页，由上下坡各找一名见证人核对，原页暂不涂改','乔端需另腾核对时间；其他轮次仍按已无争议的约定执行','双方先同意一次临时沟口照看，事后再按实耗工时补换工，不用临时处置证明谁先前有错','临时照看需要有人自愿接手，也不能预支未同意住户的轮水'],
   ['穗袋挡住篱边检看处','yard','wenxu','jiangmi','想留避风干位','要空出拆篱检查的过道','把检看分成两段，温绪在蒋弥检查一段时自己挪开该段穗袋','蒋弥要等两次挪袋，温绪承担返潮风险','在原位用不同结绳标明临时界线，请两人按拆篱动作试走后再决定袋位','结绳只标界不产生新储物架，穗袋主人仍须同意移动'],
   ['共灶门外清理算谁的活','kitchen','hanpei','zhusheng','认为清圈不含灶外杂物','要求脏物不影响入灶路径','把清圈、搬出门外和灶边清扫分别记作工序，让两人只认自己接下的一段','分段交接较费口舌，没人承接的部分仍会积着','由朱笙先指出必须通行的最窄范围，韩培只帮清这条线，余物留给主人另约','短期能过人，不能因此宣称共灶已打扫完毕'],
   ['旧架记号和抄地名挤同一张桌','hall','qinli','gaoxin','要摆开旧架记号','需要完整空桌抄地名','请高忻先描下秦砺所需的相对位置，旧架收回后以描图复核','描图不能替代实物尺寸，遇到关键部位仍得重摆','把抄写安排在一次旧架检看中途，请秦砺保留边缘定位物，双方轮换桌面','秦砺要多次停手，高忻不能独占整个下午'],
   ['桶件与待补衣抢干净暂存位','workroom','taozi','luxia','要按物主分开桶件','要留干净位置放送补衣','先约交接顺序，物主到场时才带来桶件或衣物，缩短堆放时间','迟到的一户要另约，不能要求两名手艺人空等','卢夏按衣主分包自带包布，陶咨按桶主记木件；双方共同划出接触脏物的一侧','包布由衣主自行提供，隔开并不保证木件绝不沾尘'],
  ],
  rumors:[
   ['赵枫和乔端正为轮水册漏行各执一词。','true','zhaofeng','qiaoduan','轮水册漏行','争议存在，尚没有查明哪一方记错。','分别询问两人所指的是哪一行。'],
   ['高忻做代笔，轮水问题都由她一个人定。','partial','gaoxin','qinli','旧架记号和抄地名挤同一张桌','高忻做代笔；轮水当事人的同意不能被代笔人代替。','找赵枫核对谁能同意变更。'],
   ['共灶做饭的人得把所有灶外杂物都收拾掉。','false','zhusheng','hanpei','共灶门外清理算谁的活','朱笙要保住入灶路径，不等于已承接所有清理。','向两人问清各自接下了哪一道工。'],
   ['温绪不肯挪穗袋，是怕袋子离了避风位受潮。','true','wenxu','jiangmi','穗袋挡住篱边检看处','温绪要留避风干位；这只是他一方的需要。','当面问温绪可接受怎样的临时挪放。'],
   ['蒋弥要检查篱笆，所以篱边的袋子都归他处置。','false','jiangmi','wenxu','穗袋挡住篱边检看处','修补篱笆不转移穗袋所有权。','先向袋主取得挪动同意。'],
   ['秦砺的旧架记号摊开了，高忻就没有抄地名的地方。','partial','qinli','gaoxin','旧架记号和抄地名挤同一张桌','两人争用厅边桌位，并未查明整间屋都无处可用。','请两人指认所需桌面，别把争位说成无处下笔。'],
   ['卢夏要把待补的衣裳放得离桶件远些。','true','luxia','taozi','桶件与待补衣抢干净暂存位','卢夏需要干净位置，陶咨又要按物主分开桶件。','到缝线屋问两人各自需要多少地方。'],
   ['榆坡共用劳动处的旧料，外来人随便拿就行。','false','taozi','luxia','桶件与待补衣抢干净暂存位','共用场地不等于无主材料。','问具体物主是否同意。'],
   ['轮水册那一行只要重抄，乔端就不再着急了。','partial','qiaoduan','zhaofeng','轮水册漏行','乔端还担心沟口继续受损；抄字本身不处理沟口。','问乔端眼前最急的是哪一处。'],
   ['韩培认为自己答应的是清圈，不包括灶外所有杂物。','true','hanpei','zhusheng','共灶门外清理算谁的活','这是韩培的立场，朱笙仍要求入灶路径不受影响。','让双方分别复述原先约定。'],
  ],
  festival:{name:'榆枝认名日',month:2,day:10,place:'hall',host:'zhangyi',practice:'愿意来的住户带自己的旧农具口述名称，听的人记下叫法差异；不把展示物当交换物。'},
  seasonal:['春雨后黄土黏在鞋沿，篱脚新芽透绿，坡上说话容易被风截断。','夏午后榆影缩到篱根，干草气味留在向阳坡；清早的刮枝声更容易听清。','秋风把干穗壳推到路边，黄昏麦田上方的斜光照出地势高低。','冬日榆枝相碰发脆响，向阳黄土颜色浅，背风处有人停步搓手。'],
  daily:['清早坡口人声隔着篱笆传来，低处还未照到日光。','正午土坡反光，往共灶方向走才闻见附近人家做饭的气味。','傍晚坡腰树影越过路面，搬东西的人互相提醒让道。','入夜后篱枝响声比白日清楚，没亮灯的窗口只剩轮廓。'],
  hidden:{name:'议事屋旧纸夹层',place:'hall',keeper:'zhaofeng',detail:'旧木柜靠墙一侧有窄缝，纸角会滑进柜底；不是可供通行的暗道。',clue:'从侧面可见柜底有纸屑压痕。',access:'须请保管记录的人同意挪柜；不能以发现夹缝为由取走记录。'},
 },
 wt:{
  coordinators:['zhengxi','keli','xiangzhen'],industries:['浅滩渔作与旧网修补','苇束分垛与席料收边','木台、鱼篓和晒架检看'],
  meeting:'郑汐在汀口记事屋记岸界口述，柯荔核对苇场工签，向祯记录更路。岸边的口头处置要同时问到渔户和搬苇的人，不能只凭最先到屋里的人指界。',
  custom:'下岸处先留能退脚的空地；苇束按物主分垛，帮搬不意味着分得一束。雨后改走哪边先核实现场，旧脚印不能当安全保证。',
  problems:[
   ['议事屋外空位兼作修篓处','hall','zhengxi','wangpu','要让来指界的人能站开','想在明亮处摆开修篓','将指界讨论分成先看岸边、再回屋记述，修篓只在当事人回屋前收起靠门部分','往返耗时，王浦需接受临时收摊','让王浦示范翻篓所需范围，再请郑汐按来人站位画出不挡门的边界','遇到多人同时来时还需重新协商'],
   ['苇束挤占下岸退脚处','bank','zhouzhu','wupeng','需要空出退脚位置','搬运时想缩短抬束距离','按退脚动作试走后留出一条斜向空道，其他苇束仍靠近搬运点','可堆面积变小，伍蓬需要分趟处理','把卸束与渔户下岸错开，经双方口头确认后只在无人下岸时短暂停放','需要有人当场交接，不能依据空岸擅占全天'],
   ['旧网晾位挡住岸阶检看','bank','weilian','huangting','要保留迎光辨网的位置','检看空响石需腾空脚边','魏涟先挑最需迎光的网段，黄霆先检看其他踏石，最后交换位置','两项工序都变零碎，不能省略最后那段检查','先让黄霆指出必须卸重的位置，魏涟只挪相应网角并由自己看管','剩余网仍可能影响动作，需当场确认能否检查'],
   ['湿席处理与备灶争用水盆','workroom','heqin','lvmo','希望等席边湿处理结束再归还','备灶前要取回干净盆','由贺芩先结束一小段处理，清洗后交还，余段另约不占备灶时段','席边工序中断，清洗仍需实际水量和时间','两人确认盆主后共同约定单次借用截止点，下一次借盆前先询问备灶安排','不增加新盆；错过时段只能重约'],
   ['近路搬木件压到菜床边','garden','duke','liuyan','希望走宽的近侧','反对木屑和脚步压进土床','杜珂先空手试转弯，让刘燕标出不可踩的边，再由搬运者自己判断能否通过','若转不开只能改走远处，不能移除菜床','把较难转弯的木件在已获许可的劳动处拆成可搬部分，再沿既有路搬运','拆装要有合适工具与物主同意，也未必适用于每件木台'],
  ],
  rumors:[
   ['周渚与伍蓬在争下岸处该空出多少地方。','true','zhouzhu','wupeng','苇束挤占下岸退脚处','退脚位置和搬运距离是双方的不同需求。','分别请两人演示下岸和抬束的动作。'],
   ['伍蓬搬苇，所以岸边所有苇束都可以卖给外人。','false','wupeng','zhouzhu','苇束挤占下岸退脚处','雇工搬运不产生苇束所有权或交易服务。','先找具体苇束的物主。'],
   ['黄霆说有空响石，岸阶便全都不能走了。','partial','huangting','weilian','旧网晾位挡住岸阶检看','有待检看的位置，不等于整段岸阶都已判定危险。','问清具体位置，并核实当时水岸情况。'],
   ['魏涟辨旧网时想保留迎光的位置。','true','weilian','huangting','旧网晾位挡住岸阶检看','迎光辨网与踏石检看争用脚边空处。','问魏涟哪段网最需要光。'],
   ['谁先拿到水盆，谁就可以留到自己用完为止。','false','heqin','lvmo','湿席处理与备灶争用水盆','借用时长没有因此自动确定，吕沫仍在等归还。','问盆主和借用者原先如何约定。'],
   ['贺芩还在处理湿席边，吕沫等盆备灶。','true','heqin','lvmo','湿席处理与备灶争用水盆','两种用途冲突，尚无解决结果。','直接问两人各自何时需要盆。'],
   ['郑汐嫌王浦修篓碍事，往后都不许在屋外修了。','partial','zhengxi','wangpu','议事屋外空位兼作修篓处','郑汐要让来指界的人站开；没有永久禁用修篓处的决定。','问郑汐需要清出哪一块和多久。'],
   ['刘燕不愿搬木件的人踩进菜床。','true','liuyan','duke','近路搬木件压到菜床边','她反对踩压和木屑落入土床，不代表反对一切搬运。','请刘燕指出菜床边界。'],
   ['杜珂走惯的近路，涨水时也一定安全。','false','duke','liuyan','近路搬木件压到菜床边','常用路径不保证雨后或涨水时安全。','核实现场路况，不以旧经验替代观察。'],
   ['汀口屋前光线好，所以指界的人只能挤着修篓等。','partial','wangpu','zhengxi','议事屋外空位兼作修篓处','修篓需要亮处，但议事站位仍可商量。','让双方说清实际要占的位置。'],
  ],
  festival:{name:'苇结认户日',month:9,day:10,place:'hall',host:'leizhi',practice:'居民在歇工时比较自家苇束结法，容易混淆的记号当面说清；不得借认结宣称别家的苇束归自己。'},
  seasonal:['春季岸泥颜色深，芦苇新尖低于去年的干茎；雨后人会停步辨认旧脚印。','夏季湿岸带草腥气，晒席边轻颤，午后虫鸣会盖过远处短句。','秋季干苇相擦发沙声，低斜日光照亮捆口，搬束时短茎落在鞋边。','冬季岸风透过篱隙，干苇影细长，浅水边的暗色处不宜凭颜色猜承重。'],
  daily:['清早岸边能听到近处踩泥声，远处人影常被低地雾气模糊。','正午网目和苇席的影子落在地上，背风处仍有潮气。','傍晚收起的席边擦过木架，干路口的人相互问回家方向。','夜里近水的声音比人声连续，未照明的踏石边缘难分。'],
  hidden:{name:'木台下的旧桩窝',place:'yard',keeper:'duke',detail:'修篓木台后侧下方有旧支桩留下的凹窝，只能俯身看，不是地下通路。',clue:'侧面泥痕围着一处比旁边暗的木缝。',access:'须由木台检看人确认支撑情况，未确认前不得钻入或撬动承重件。'},
 },
 lq:{
  coordinators:['luanpei','fushen','shaluo'],industries:['泉下坡田与分户菜床','泉槽清理和碎石整边','木柄、工衣与旧铆接件修整'],
  meeting:'栾佩抄轮泉簿，符审协调现场队次，沙萝核对工签。簿上的次序与现场临时让位分别注明，不能把一次让位说成永久改次；涉及泉槽用途的事要听取取水户和清槽人。',
  custom:'清槽泥先问附近菜户放在哪里；旧标和新路记并列核对，不能为了好看磨去旧字。筛料、洗具与取水各自说清用途。',
  problems:[
   ['对轮泉簿的人挤进石件检看范围','yard','luanpei','jiaoyan','要让对簿的人有站位','石件翻看需要留出安全边','让栾佩先在记事屋收集疑问，只请涉及同一行的人分次到石件旁核对','来人可能要跑两趟，抄录者不能代未到者同意','焦岩先演示石件翻转范围，栾佩在范围外安排两人一组对簿','多人到齐时核对更慢，安全边不能随拥挤缩小'],
   ['清槽泥挤近菜沟口','spring','chuyin','xulong','泥不能堵到菜沟口','清槽时要有不必反复抬远的暂放处','把清槽分成短段，每段泥先移出沟口后再开下一段，由双方确认暂放边界','胥珑来回次数增多，清槽总时长可能增加','储茵与胥珑协商让愿意的换工者负责后半段转运，清槽人专心前段','需要真实有人同意帮工，不能自动扣别人劳力'],
   ['旧石标和新路记争朝向','path','shenshu','ningye','希望保留旧字可读面','新记号需在来路先看得见','先拓描旧字朝向供辨认，再把新路记放在不遮旧面的现有可用位置','拓描不能替代原标保护，位置也需实地确认','请不熟路的人分别从来路试辨两个记号，只调整新记号的角度','需要自愿参与者，试走不意味着正式测绘完成'],
   ['刻痕废石挡到灶口来往','kitchen','zhenxi','ganqi','希望留下不同刻痕对照','灶口来往不能被石片挡住','甄希先选能代表差异的少量石片，其余在物主同意后移回原劳动处','学工失去部分连续对照，不能把废石当无主物抛走','让甘祺按端物转身路径指出危险边，甄希只在路径外摊开并在备灶前收回','刻痕练习时段缩短，收纳仍由甄希负责'],
   ['阴棚下检柄与筛料互相妨碍','workroom','zhouwu','huoji','想在不晒手的位置慢拆缠条','筛料不愿被要求搬去更远处','把拆旧缠条与复缠分开，宙梧在筛料停歇时做最怕石粉混入的那一步','两人工序需要互相等待，停歇不能由外人指定','由霍霁先示范筛料抖落方向，再让宙梧选择背向落尘的位置','仍需检查有无扬尘，不能保证换个方向就完全隔绝'],
  ],
  rumors:[
   ['胥珑清出的泥让储茵担心会堵到菜沟口。','true','xulong','chuyin','清槽泥挤近菜沟口','双方对暂放位置有不同需求，不能把担心说成已堵死。','请储茵指出沟口、胥珑指出暂放处。'],
   ['砾泉的水经过石槽，拿来喝就一定干净。','false','luanpei','jiaoyan','对轮泉簿的人挤进石件检看范围','石槽轮用不赋予净化效果。','按实际水质和用途核实，不能把清槽当成净水。'],
   ['慎书护着旧标，所以任何新路记都放不了。','partial','shenshu','ningye','旧石标和新路记争朝向','慎书要保留旧字可读面，不是反对一切新记号。','问他哪一面需要保留。'],
   ['宁野希望新路记在来路上先被看见。','true','ningye','shenshu','旧石标和新路记争朝向','这是新路记朝向的需求，尚未解决摆位。','从来路看一次，再问宁野具体指哪一处。'],
   ['甄希留下的刻痕石片全是拿来卖的成品。','false','zhenxi','ganqi','刻痕废石挡到灶口来往','石片用于练习对照，没有因此生成商品或可售库存。','先问石片用途和物主。'],
   ['甘祺要甄希挪石片，是不让他再练刻痕。','partial','ganqi','zhenxi','刻痕废石挡到灶口来往','甘祺要求灶口来往不受阻，没有取消学工练习。','把练习时间和灶口路线分开问。'],
   ['宙梧想在阴处慢慢拆旧柄缠条。','true','zhouwu','huoji','阴棚下检柄与筛料互相妨碍','阴处工位与霍霁筛料占位有冲突。','问两人工序能否错开。'],
   ['只要轮泉簿上有名字，旁人就不得临时借过。','false','luanpei','jiaoyan','对轮泉簿的人挤进石件检看范围','簿册记录轮用，不等于独占全部周边空间或获得执法权。','核实轮次指的是何种用途和范围。'],
   ['焦岩翻看石件时，需要给动作留出安全边。','true','jiaoyan','luanpei','对轮泉簿的人挤进石件检看范围','来对簿的人不能因此忽略正在进行的检看。','请焦岩指出动作范围。'],
   ['霍霁嫌搬远，说明筛料只能在现在的阴棚做。','partial','huoji','zhouwu','阴棚下检柄与筛料互相妨碍','不愿搬远是他的立场，并未证明别处都不能筛料。','问不愿搬的工时和落尘理由。'],
  ],
  festival:{name:'旧标辨字日',month:8,day:10,place:'hall',host:'shenshu',practice:'愿意参与的居民比较旧石标的读法，把不确定的字留空；活动不授予磨刻旧标或改界的权利。'},
  seasonal:['春季泉槽近处的苔色深，碎石坡晴后较早发白，湿土气味留在沟边。','夏日向阳石面刺眼，阴槽仍能听见细水声，筛料处鞋面易见干粉。','秋季泉边落叶积在凹处，傍晚石色偏暖，擦柄的声音从棚下传来。','冬季背阴泥地与干碎石分界更清楚，泉声细，行人试探落脚才搬重物。'],
  daily:['清晨阴处未亮，泉槽水声在空院间回响。','正午石粉在日光里显白，靠槽的空气仍偏凉。','傍晚工衣拍打声从晾处传来，石面亮处逐渐退到坡顶。','夜间坡路标记难辨，远处说话停下后能听清近水细响。'],
  hidden:{name:'记事屋背墙旧签槽',place:'hall',keeper:'luanpei',detail:'背墙木板后留有过去夹放窄签的浅槽，积灰使槽口与板缝混在一起；槽不能容人。',clue:'一处板缝比旁边宽，边缘磨得较光。',access:'须问记录保管者能否检查；找到纸木残片也不能擅自改写轮泉次序。'},
 },
 sb:{
  coordinators:['zhangluo','gulu','shikui'],industries:['桑园修枝与叶料分拣','丝线绕束和衣物补绣','晒架、木梭与边沟维护'],
  meeting:'张洛记录桑园换工，顾露协调晒架工时，史葵替不便书写的人记下原话。临时换工须说清是否包括分拣和搬架；未见当事人确认的代笔不当成同意。',
  custom:'采叶与分拣是否合算先讲清；晒位只借时段，不转让丝线和布匹。冬季桑树无鲜叶可采，仍可检查枝干和整理沟边。',
  problems:[
   ['修枝与采叶工先后难排','orchard','zhangluo','yuanqing','要按已确认轮次排工','树势变化时希望先理枝','袁卿先指出必须先理的具体枝位，张洛只就受影响的轮次逐户重问','重排范围缩小但问人耗时；其余轮次不自动顺延','保留原轮次，让同意的住户将部分采叶工换成理枝工，后续补工另记','需要本人同意且有适合工具，不保证每户愿意换'],
   ['采完叶是否已经收工','orchard','zhonglan','tianmo','要叶料分清才能交接','希望采完就开始休息','让双方把采下、送到、分拣三个交接点分别签认，未约的分拣另议','交接手续多一些，不能借分段追加未同意的工钱','田陌按物主分开放叶料再离开，钟岚在后续自愿换工中补做细拣','只是候选交换，需明确粗分到何种程度才被双方接受'],
   ['辨茧壳与晒位签桌争亮处','hall','zhenyun','gulu','辨壳需要亮处','分配晒架时要摊开原签','顾露先在别处按人归好签，只有核对有争议的几张才到窗边摊开','归签费时，甄芸仍需为争议核对短暂停手','甄芸把最难辨的茧壳留在亮处集中看，其他整理移到自己同意的位置','不增加光照工具，也不能由外人判断所有茧壳已辨完'],
   ['修梭木屑留样挡灶口','yard','yexun','zhuchai','修梭期间想留原先木屑作比对','入灶过道不能带进木屑','叶荀只保留能辨出差异的样屑，自己用现有容器收起，其余经物主同意清离过道','容器要实际存在且可借，收样会中断修梭','把比对环节放到备灶前完成，双方约清扫检查点再让端物的人通过','若未完成比对则重约，不能自动延迟共灶所有人'],
   ['补绣怕吵，检架又要摇动','workroom','panyao','gaoshu','缝细纹需要安静','检看异响需要摇动旧架','高枢先做静态检看，把必须摇架的一段集中告知，潘瑶此时改做不需数针的整理','两人都要调整工序，仍需保留足够检看时间','潘瑶把正在数的细纹作好记号后暂停，让高枢请她一起分辨声音来自何处','需要潘瑶愿意听，听出声源也不等于修好织架'],
  ],
  rumors:[
   ['张洛与袁卿对修枝和采叶先后有分歧。','true','zhangluo','yuanqing','修枝与采叶工先后难排','一方守已确认轮次，一方在意树势变化。','问清受影响的是哪段枝、哪一轮工。'],
   ['桑坂冬天也有现采的鲜桑叶。','false','yuanqing','zhangluo','修枝与采叶工先后难排','当地桑树冬季落叶，冬日劳动是枝干检查和地面整理。','核实季节并看树上是否实际有叶。'],
   ['田陌采完就想歇，叶料因此全都不能用了。','partial','tianmo','zhonglan','采完叶是否已经收工','争议是分拣是否算收工，没有叶料全部损坏的事实。','问钟岚还差哪一道分拣。'],
   ['钟岚要把叶料分清才肯接手。','true','zhonglan','tianmo','采完叶是否已经收工','这是她对交接的要求，尚待双方确认范围。','让两人当面说清分到什么程度。'],
   ['晒架排到哪户，架上的丝线就都归那户。','false','gulu','zhenyun','辨茧壳与晒位签桌争亮处','晒位分配不转移他人丝线所有权。','问丝线物主，而不是只看晒位签。'],
   ['顾露抢窗边，是因为别处都不能看签。','partial','gulu','zhenyun','辨茧壳与晒位签桌争亮处','顾露要摊开原签，并未证明所有其他位置都不能看。','询问哪些签需当面对照。'],
   ['甄芸辨茧壳时在意窗边光线。','true','zhenyun','gulu','辨茧壳与晒位签桌争亮处','她与晒位核签争用亮处。','问她最难辨的是哪部分。'],
   ['叶荀留着木屑，竺钗就可以把他的木梭全扔掉。','false','yexun','zhuchai','修梭木屑留样挡灶口','清扫过道不赋予处置木梭财物的权利。','先让物主选留样和收纳办法。'],
   ['潘瑶怕检架声打断数针，高枢偏得摇架找异响。','true','panyao','gaoshu','补绣怕吵，检架又要摇动','两种工序确有冲突，尚无错时安排。','问两人能否把摇架集中到短时段。'],
   ['高枢说要查异响，旧架肯定已经修好了。','partial','gaoshu','panyao','补绣怕吵，检架又要摇动','有检看需要是真；检看不等于修缮完成。','询问检看结果和还需哪一步。'],
  ],
  festival:{name:'晒纹对样日',month:9,day:20,place:'workroom',host:'kongliu',practice:'愿意来的织缝者带自己的旧样比较转角画法，先问物主才临摹；不因看过花样就自动掌握技艺。'},
  seasonal:['春季桑枝间透出嫩绿，园边沟有湿土味，修枝声和人声隔坡相应。','夏季桑叶在风中轻响，晒布拍架，向阳面晒热的木头带浅浅干味。','秋季树影疏开，落叶挤在边沟，晾线在斜光中容易看出粗细差异。','冬季裸枝透出宽天光，园里不见鲜叶采收，架脚旁有人整理碎叶与篾条。'],
  daily:['清早园外路口的影子拉长，住户带着自家工具往劳动处走。','午后晾物影子交叠，布角拍架声随阵风停起。','傍晚收线时木架轻响，园坡背阴处先暗下来。','夜里没灯的桑枝只见交错轮廓，近屋能听见收拾家务的细响。'],
  hidden:{name:'缝补屋窗下浅格',place:'workroom',keeper:'gulu',detail:'窗下旧板内侧留有放样纸的浅格，格口被布边遮住；不是储藏可取货物的仓库。',clue:'窗板边缘有反复抽插留下的亮痕。',access:'须先问使用该位置的人，再请物主辨认格内东西；看见样纸不等于获准复制。'},
 },
};

const pid=(v,key)=>`npc_${v}_${key}`;
const lid=(v,key)=>`${['fields','orchard','garden','path','bank','reeds','spring'].includes(key)?'loc':'bld'}_${v}_${key}`;
export function villageProfileCandidates(world){
 return Object.entries(raw).map(([v,r])=>{
  const f=villageFacts[v],existing=world.settlementProfiles.find(p=>p.id===f.id);
  const problems=r.problems.map(([title,place,a,b,pa,pb,sa,ca,sb,cb],i)=>({id:`problem_${v}_${i+1}`,title,location:lid(v,place),status:'unresolved',stakeholders:[{person:pid(v,a),position:pa},{person:pid(v,b),position:pb}],options:[{proposal:sa,costOrLimit:ca},{proposal:sb,costOrLimit:cb}],public:true}));
  return {id:f.id,name:f.name,parent:existing.parent,coordinates:existing.coordinates,terrain:f.terrain,climate:f.climate,
   population:existing.population,householdCount:existing.householdCount,ageStructure:existing.ageStructure,
   outsiderRatio:null,outsiderRatioReason:'常住登记未记录出生地与迁入史；访客名单为空不能推算外来常住人口为零。',
   buildingIds:existing.buildingIds,
   economy:villageEconomy(world,v,r.industries),
   governance:villageGovernance(world,v,r),
   problems,
   rumors:r.rumors.map(([claim,truth,source,witness,title,fact,verification],i)=>({id:`rumor_${v}_${i+1}`,claim,truth,source:pid(v,source),carriers:[pid(v,source)],witnesses:[pid(v,witness)],sourceProblem:problems.find(p=>p.title===title).id,fact,verification,status:'authored-seed',propagation:'pending-event',distortion:'把当事人的需要说成全村规矩，或把尚未办完的工事说成已有结果。'})),
   calendar:{marketDays:[...world.rules.calendar.marketDays],marketLocation:'loc_bs',marketNote:'沿用白石镇每月集日；村内没有因此增加摊商、库存或自动前往赶集的作息。',festivals:[{...r.festival,location:lid(v,r.festival.place),host:pid(v,r.festival.host),status:'custom-only'}].map(({place,...row})=>row)},
   sensory:{seasonal:r.seasonal,daily:r.daily},hiddenPlaces:[{id:`hidden_${v}_1`,name:r.hidden.name,location:lid(v,r.hidden.place),knownBy:[pid(v,r.hidden.keeper)],detail:r.hidden.detail,clue:r.hidden.clue,access:r.hidden.access,status:'unregistered-feature'}],
   pendingProfileSections:['外来常住人口比例','传闻事件种子与沿路传播','节日参与作息','隐秘处发现与物权登记'],
  };
 });
}

// These are new-world opening allocations, never a grant to an imported save.
export const ledgerRevision='w1-village-ledgers-1';
export const previousProfileHashes={loc_bs_yupo:'7a91077ea81f9b5d36f0608b6b35a5e11894bb589864657a00ac2a384098dcda',loc_bs_weiting:'3a65547f599b6ff65f359144852cc40c8b61de546199b1e0bea8de8def41ca95',loc_bs_liquan:'fe8e9672e9ec003de05829b5d4d4e51b419abfb42b4991241456572fa94b8ade',loc_bs_sangban:'9482a046d2a08ba8b56a8427548e1aa24e3379bf9500fd966d76475eab24927e'};
// 不再手填开局存粮（food）：开局存粮由运行时目标持有规律推导（server-plugin/agriculture-migration.mjs openingFood）。
const ledgerSeeds={yp:{area:1800,fresh:35,field:'fields',wood:4},wt:{area:1600,fresh:55,field:'garden',wood:3},lq:{area:2100,fresh:38,field:'fields',wood:4},sb:{area:2400,fresh:45,field:'fields',wood:3}};
export function villageLedgerRules(world){
 const {warehouse,...base}=world.rules.agriculture.settlements.find(p=>p.settlement==='loc_hw'),crop=world.rules.agriculture.crop;
 return Object.entries(ledgerSeeds).map(([v,s])=>({ ...base,settlement:villageFacts[v].id,counter:lid(v,'hall'),manager:pid(v,raw[v].coordinators[0]),fieldLocation:lid(v,s.field),fieldId:`farm_${v}_oats`,areaUnits:s.area,farmWorkers:12,freshWorkers:10,processingWorkers:4,toolCapacity:12,freshFoodPerDay:s.fresh,granaryCapacity:50000,initialSeed:Math.ceil(s.area*crop.seedPerHa/crop.areaUnitsPerHa),opening:{name:villageFacts[v].name,population:world.settlementProfiles.find(p=>p.id===villageFacts[v].id).population,treasury:1200,wood:60,iron:12,woodPerDay:s.wood,foodPerDay:0},source:`${ledgerRevision}/公共田与粮仓开局登记`,tradeContract:{id:`trade_${v}_oats_1`,seller:villageFacts[v].id,buyer:villageFacts[Object.keys(ledgerSeeds)[(Object.keys(ledgerSeeds).indexOf(v)+1)%4]].id,item:world.rules.agriculture.grainItem,quantity:20,unitPriceCopper:3,taxBps:500,status:'unfulfilled',source:`${ledgerRevision}/四村试行粮约`,deliveryDays:7}}));
}
export function villageLawCodes(world){
 // T43's settlement, provenance and appeal panel belong to the HW court.
 // Village appointments retain their reviewed local officers and procedure.
 // S5 recognition is separately approved; never inherit it into W1's frozen
 // candidate or review context from the current HW charter.
 const source=world.rules.law.codes.find(c=>c.id==='law_hw_property');
 const {settlement,source:provenance,appeal,procedure,magicAuthorities,...template}=source.recognition?.legalTender?normalizeCreditTender(source):source;
 return Object.entries(raw).map(([v,r])=>({...template,id:`law_${v}_property`,name:`${villageFacts[v].name}公共粮约与财物规约`,locations:[villageFacts[v].id,...world.locations.filter(l=>l.parent===villageFacts[v].id).map(l=>l.id)],officers:[pid(v,r.coordinators[2])],judges:[pid(v,r.coordinators[0])],court:lid(v,'hall')}));
}
function villageEconomy(world,v,industries){
 const p=villageLedgerRules(world).find(p=>p.settlement===villageFacts[v].id),c=world.rules.agriculture.crop;
 return {status:'registered-opening',industries,source:p.source,period:{startDay:0,endDay:360,status:'unsettled',calendar:'360日年'},production:[{name:'公共燕麦田',location:p.fieldLocation,item:world.rules.agriculture.grainItem,areaHa:p.areaUnits/c.areaUnitsPerHa,quantity:p.areaUnits*c.yieldPerHa/c.areaUnitsPerHa,unit:'粮单位',unitKg:world.rules.agriculture.foodUnitKg,cycleDays:360,status:'potential-before-weather',source:'田亩×既有燕麦每公顷产量；实际收成沿advanceAgriculture受天气、劳动与仓储影响'}, {name:v==='wt'?'鱼菜等当日农副产':'菜圃等当日农副产',quantity:p.freshFoodPerDay,unit:'粮单位',unitKg:world.rules.agriculture.foodUnitKg,cycleDays:1,seasonFactors:[...p.freshSeasonFactors],status:'potential-before-weather',source:'公共农副产班组登记；只在实际日结产粮'}, {name:'公共木料',quantity:p.opening.woodPerDay,unit:'木料单位',cycleDays:1,status:'worker-limited',source:'既有农事剩余劳力木料公式；私人手艺产物不计入公共仓'}],publicStock:{openingDay:0,seed:p.initialSeed,treasuryCopper:p.opening.treasury,wood:p.opening.wood,iron:p.opening.iron,source:p.source,closing:null,closingReason:'尚未结算；实时期末由state.settlements与agriculture账读取'},priceFactor:{region:1,transport:1,season:1,shop:1,source:'开局公共粮约固定价；不改私人商家的报价'},tax:{basis:'已交割公共粮约的货价',rateBps:500,collector:p.manager,recipient:p.settlement,openingReceiptsCopper:0,source:`${ledgerRevision}/村级粮约税章`,note:'只从实际收款内分列5%；不额外扣私人钱包，不对尚未履约合同入账'},tradePartners:[p.tradeContract.buyer],tradeContracts:[p.tradeContract],tradeLedger:{openingPaidCopper:0,openingReceivedCopper:0,openingExportedFood:0,openingImportedFood:0,status:'unsettled',source:'未履约试行合同；提粮与送达分别落账，不自动沿周结算'}};
}
function villageGovernance(world,v,r){
 const p=villageLedgerRules(world).find(p=>p.settlement===villageFacts[v].id),code=villageLawCodes(world).find(c=>c.court===p.counter);
 return {coordinators:r.coordinators.map(k=>pid(v,k)),meetingPlace:p.counter,meeting:r.meeting,customs:[r.custom,'私人材料与各户财物不因放在共用场地而共有。'],head:p.manager,enforcers:code.officers,authority:'源开局村级任命单列权限；其余协调者只记录和联络，不因职业获得搜查或征税权。',appointment:{source:`${ledgerRevision}/白石镇村级任命册`,effectiveDay:0,head:p.manager,officers:code.officers,lawCode:code.id},jurisdiction:[...code.locations],permissions:{head:['在登记议事屋核验粮约、分列已收税款','本人在场时按本村法典审理财物案'],enforcers:['本人在场时按已报案件和本村法典搜查、拘押'],coordinators:['自愿协调、记录口述、转交申诉']},limits:['不得代表缺席户签约','无权扣取私人税款或跨村搜查','粮约仅从公共仓与实际携货结算'],referral:{institution:'白石镇议事机构',location:'loc_bs',matters:['跨村权限争议','任命申诉','超出本村法典的争议'],status:'referral-only',note:'转交不等于镇内已创建执法NPC或自动作出裁决'}};
}
export function validateVillageLedger(details,world){
 const errors=[],check=(ok,message)=>{if(!ok)errors.push(message);},e=details.economy,g=details.governance;
 const p=villageLedgerRules(world).find(p=>p.settlement===details.id),code=villageLawCodes(world).find(c=>c.id===g.appointment?.lawCode);
 const actual=world.rules.agriculture?.settlements.find(row=>row.settlement===details.id),actualCode=world.rules.law?.codes.find(row=>row.id===g.appointment?.lawCode);
 if(actual)check(JSON.stringify(actual)===JSON.stringify(p),'运行农事规则与审核开局账不符');
 // S4LAW supersedes procedure/appeal only. Compare the complete exact newer
 // candidate as well as the historical edition; no arbitrary fields are hidden.
 if(actualCode){
  // S5-03 may supersede only its exactly approved recognition clause. All
  // old appointment/procedure fields retain the original exact comparison.
  const comparable=actualCode.recognition?.legalTender?normalizeCreditTender(actualCode):actualCode,expected=code;
  check(JSON.stringify(comparable)===JSON.stringify(expected)||JSON.stringify(comparable)===JSON.stringify({...expected,...trialProcedureFor(expected)}),'运行法典与审核任命不符');
 }
 check(e.status==='registered-opening'&&e.period?.startDay===0&&e.period?.endDay===360&&e.period?.status==='unsettled','经济账周期或状态无效');
 check(p&&e.publicStock?.seed===p.initialSeed&&e.publicStock?.treasuryCopper===p.opening?.treasury&&e.publicStock?.closing===null,'开局账与农事源不符或冒充期末结算');
 check(p&&e.production?.[0]?.quantity===p.areaUnits*world.rules.agriculture.crop.yieldPerHa/world.rules.agriculture.crop.areaUnitsPerHa&&e.production[0].unitKg===world.rules.agriculture.foodUnitKg,'年粮潜力数值或单位不符');
 check(e.production?.every(row=>row.quantity>=0&&row.cycleDays>0&&row.source),'产业产量缺单位周期或来源');
 check(e.tax?.rateBps===p?.tradeContract?.taxBps&&e.tax?.collector===p?.manager&&e.tax?.openingReceiptsCopper===0,'税章或未收税款不符');
 check(e.tradeContracts?.length===1&&JSON.stringify(e.tradeContracts[0])===JSON.stringify(p?.tradeContract)&&Object.values(e.tradeLedger??{}).filter(v=>typeof v==='number').every(v=>v===0),'未履约合同不得记已收付');
 check(code&&g.head===p?.manager&&code.judges.includes(g.head)&&JSON.stringify(g.enforcers)===JSON.stringify(code.officers)&&JSON.stringify(g.jurisdiction)===JSON.stringify(code.locations),'任命或执法辖区与法典不符');
 check(g.appointment?.effectiveDay===0&&g.appointment.source&&g.referral?.location==='loc_bs','权限来源或转交机构缺失');
 return errors;
}

export function withVillageLedgerRules(world){
 const next=structuredClone(world),profiles=villageLedgerRules(world),laws=villageLawCodes(world);
 // Preserve the exact approved S4 procedure and S5 tender supplements when
 // replaying W1 publication. Neither supplement changes W1's review context.
 for(let i=0;i<laws.length;i++){
  const approved={...laws[i],...trialProcedureFor(laws[i])},actual=world.rules.law.codes.find(c=>c.id===laws[i].id);
  const comparable=actual?.recognition?.legalTender?normalizeCreditTender(actual):actual;
  if(JSON.stringify(comparable)===JSON.stringify(laws[i])||JSON.stringify(comparable)===JSON.stringify(approved))laws[i]=structuredClone(actual);
 }
 const replace=(rows,incoming,key)=>[...rows.filter(row=>!incoming.some(p=>p[key]===row[key])),...incoming];
 next.rules.agriculture.settlements=replace(next.rules.agriculture.settlements,profiles,'settlement');
 next.rules.law.codes=replace(next.rules.law.codes,laws,'id');
 for(const p of profiles){
  const places=world.locations.filter(l=>l.parent===p.settlement),climate={id:`climate_${p.settlement}`,sequenceScope:'local',locations:[p.settlement,...places.map(l=>l.id)],indoor:places.filter(l=>l.id.startsWith('bld_')).map(l=>l.id),latitude:42,temperatures:[10,23,12,-2]};
  next.rules.weather.regions=replace(next.rules.weather.regions,[climate],'id');
 }
 return next;
}
