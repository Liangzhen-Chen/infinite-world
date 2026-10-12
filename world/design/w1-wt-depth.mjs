import {readFileSync} from 'node:fs';
import {weitingRoster} from './w1-villages-weiting.mjs';

// The snapshot is frozen author input, not a fresh read of the formal baseline.
const source=JSON.parse(readFileSync(new URL('../drafts/w1/wt-depth/source.json',import.meta.url),'utf8'));
export const revision='w1-wt-depth-audit-1';
export const incrementLimitYuan=3;
const id=key=>'npc_wt_'+key;
const people=new Map(source.people.map(n=>[n.id,n]));
const places=new Map(source.places.map(p=>[p.id,p.name]));
const relatives=new Map(weitingRoster.trim().split('\n').map(line=>{const row=line.split('|');return[id(row[1]),{name:row[2],concern:row[7]}];}));

// Each row specifies register, two unresolved questions, then pending short,
// medium and long actions. Goal content, deadlines and progress stay frozen.
const authored=`
zhengxi|记述时用短而完整的句子，遇到不同口述会逐人问清|明乐记得的旧桩究竟对应哪一段岸界|王浦愿不愿在指界人回屋前收起门边篓料|请明乐分辨旧桩名与现在叫法，把差异留在旁注|约各户在干岸逐一指出自己认得的桩，再回屋读回口述|请后来指界的人核对自己的话是否记全，保留仍有争议的条目
wangpu|讲手艺用简短的挑错话，谈篓眼能细说到编向|郑汐下一次召集指界者何时要用门前空位|王勤愿不愿先学拆反编口再试编篓|请使用者空手比出拽篓口的位置，说明可握的编边|在物主同意下翻看旧篓底磨痕，分清能留的篓条|请学工读回一处反编的改法，再由自己核查受力处
zhouzhu|谈下水处措辞直接，解释水情时分清上下游|伍蓬搬苇哪一趟会占到自己的退脚位置|钱艮能否到岸边听双方说明各自要留的空间|站在干岸比出退脚方向，指出苇束遮住的落脚处|先问伍蓬可用时段，再提议卸束和下岸错开|请邻户雨后重新看退脚空道，核查先前标出的边是否还安全
wupeng|讲劳作用爽快的短句，被指出混料时容易急着辩解|周渚下岸需要留出的斜向空道究竟有多宽|伍茉何时能陪自己核查短茎分堆|停下捆扎，先把短茎挑在一边再请物主辨看|问周渚什么时候下岸，说明自己分趟搬束可否错开|请雇主按扎口逐束检查夹料，不拿割得快代替束料齐整
weilian|解释旧网时细缓耐心，遇新结法会先追问用处|黄霆要检看的空响石究竟在哪一块网角下|魏舒能否辨清旧补处和收紧处的两种结记|迎光指出旧补网眼，先让家人看见两处不同结记|与黄霆核对检看石的位置，再询问哪段网必须先挪|请魏舒逐处说明结记用处，听不清的地方重新拆讲
huangting|检看时语句短而审慎，对尚未看清的石面会留余地|魏涟何时能让出迎光网角下面的岸阶|栗萝回家愿意绕哪一段干路|退水后先在干处敲比石音，把不能判断的部位标明|请魏涟说明辨网动作所需空间，再核对可卸重的石边|带栗萝从干路看一遍绕行拐点，询问她是否认得回程方向
heqin|谈席边细节干脆，被问错还时语气会绷紧|混记号的两户何时能各自来认旧补处|吕沫下一次备灶何时必须取回干净盆|把两份席边分别摆开，请物主指出自己认得的旧补|把两份混记号的席边分别摆给各物主看，请各自指出旧补处，再核对各自认出的部分|回交前请物主读回席边记号，核查拿走的是否为自家席料
lvmo|灶边交代洗备次序很快，提醒器皿时容易带刺|贺芩湿处理哪一小段能赶在备灶前结束|吕芯能否按新位置找出生盆和熟盆|先将生熟盆分边放置，逐盆问清是否已刷洗|与贺芩核对借盆时段，询问清洗后何时能交接|让新帮厨指出盆的收放位置，听对方解释分法再改急话
shiqiao|讲水纹缓慢温厚，谈出门安排却容易固执|施珏愿不愿陪自己从干岸看退水痕|宾然希望自己看水后何时回家吃饭|请施珏陪看一处干稳落脚点，不再独走湿边|与家人约出门和回屋时刻，说明只停在干岸|回家讲清今天看水的位置，询问家人哪段路仍放心不下
keli|读写时语句完整而谨慎，遇催促会先停下来核实|柯芳当天究竟做了割苇还是捆苇|柯彤何时能帮着读回分工工条|先念姓名再分读割苇和捆苇两栏，问当事人有没有错行|请柯芳分别说明两段劳作，按实际工序核对而不先填数|请交条的人逐句读回自己的活名，把未核清的分工另列待问
duke|说明木台时先讲可见的受力处，面对催问会硬声回应|刘燕菜床外的转弯处能否容得下待搬木件|杜晴何时能听自己说明检看后回家的时刻|请用台的人先离开边板，再从干处核对翘起的位置|空手到菜床外比转弯空间，先问刘燕认可的通行边|在物主陪同下逐处说明检看范围，把背面尚未看见的裂口另记
liuyan|谈菜床边界说得清楚而较真，商量绕行时少绕弯|杜珂空手试转弯后是否愿意改走远路|刘婵何时能陪自己听搬苇人说明路线|指明被脚步压到的苗边，请搬运者先停在床外|请杜珂空手试过转弯，再询问能否沿既有路搬运|约邻工雨后复看床外的通行边，把仍堵路之处重新提出
zhangou|解释岸路用简洁的方位句，遇追问容易变得冷淡|虞菡借出的旧路签究竟何时归还|向祯能否与自己核对夜路和退水路的不同条件|先向问路人指出积水段，再带他从干处看旧箭头|白日核对只有退水可走的段落，在旧记号旁说明条件|请陌生来人复述绕行方向，发现误读再解释水位限制
zhicai|讲针线尺寸细致温和，谈孩子扯衣却容易护短|两户分别何时需要取回送补的小衣|姚蓉愿不愿陪自己听支络说明衣口怎么扯破|翻出原先答应的交还次序，逐户询问急用时刻|回交前将衣服抖开查针，告诉物主尚未补完的部位|请物主下次送衣时当面核对磨薄处，说明自己可承诺的交还时段
xueying|家务话说得慢而反复，讲旧根的留用办法很执着|薛实每天出工需要在门边留多少空处|谭瑶愿不愿只清掉已经烂软的根束|坐在干处逐束摸查烂软处，请家人先指出挡门的一堆|与谭瑶分开看可留和已腐的根，不让一口气全扔替代辨认|请薛实试走门口再说哪里仍窄，把留用根束放在不挡脚的位置
leizhi|复述口信时句子谨慎完整，遇含混称呼会反复核对|托话者说的称呼究竟指哪一户的哪位人|可菁能否把桌上未认清的称呼便条分开放置|把原称呼读给托话者，请他说明对方住处|先问要照原话还是转意，再读回自己抄下的整句|请托话者逐句核对遗漏的半句，未确认的称呼另作待问记号
niyun|讲木作用直白的尺寸话，收尾被催时常拖长回应|使用晒架的人转身究竟需要留多少空隙|倪梅何时愿意与自己核对收工清扫次序|请使用者空手站在架旁试转身，先看架脚是否挡路|在物主同意后逐个比架脚位置，询问挪动范围|收工前沿工位查木屑，再请接手者指出是否还有脚下障碍
quhuai|守篱时问话很急，解释通道安排容易提高声调|屈健提出的新篱绳结是否容易认出松口|丁素做岸边杂活时通常从哪一处经过|先从干处查缺口和松绳，问借道的人原先走哪边|请屈健示范新结的解法，核查能否从固定口通行|先说明湿岸风险再听借道者回答，用读回位置替代追骂
dingsu|接活时回应快而好胜，谈改约会先争辩自己能做|雇她做岸边杂活、时段撞在一起的两户，分别愿意将哪一段杂活改约到什么时段|成芬何时有空与自己商量回屋后的家务|分别读回两户答应过的时段，主动说明自己来不及的那一段|请各户指出最先要做的工序，按可用时间重新提出安排|收工后核对未做的一步，及时告知雇主而不将延误推给备料
ruqin|讲挑料用缓慢细致的手艺话，对凭颜色判断会直接反驳|茹纾能否从弯曲时的反应分出脆料|邢波希望家里旧席料先整理哪一堆|取一段物主允许试弯的料，先看受力处再说明软硬|请帮工各指出颜色相近的两段料，问清为何用来收边|让茹纾说出承力收边所需韧性，再针对误判的一段重新示范
gonglu|搭工说话爽直，商量分担时容易先算自己省力|同伴愿不愿在下一趟搬网时按约换肩|龚妍愿不愿陪自己向邻人说明下次换肩的安排|请同伴先指明湿重的一头，承认自己偏挑轻头的问题|出工前询问同伴愿意在哪个干处停下换边|每趟收工请同伴说出实际分担是否一致，别用出过力搪塞轻重
jingyao|核图用安静而完整的问句，拿不准时愿意反复确认|老人所说的岸弯究竟对应现在图上的哪一段|斌兰能否从图上的符号认出干岸回屋的方向|保留画错的稿，指着岸湾请老人说明不同的位置|从干岸核对可见树位，再把看不见的湿边留作待问|请斌兰顺着图说回屋路线，核查哪些符号仍让外人误读
fanshui|讲席垫温缓而恋旧，回忆常从边角慢慢铺开|范柳希望自己整理旧垫时何时结束闲谈|解芷愿不愿画下松散苇刺所在的边角|请晚辈先看松刺处，逐处拣查后再谈是否换垫|把裂口与坐卧处分别给家人看，听完他们担忧的原因|与范柳约一段不误出工的整理时间，留出自己选睡处的余地
shanju|辨垛用短而肯定的归户话，被问偏分时会犹豫|原主何时能来共同看被指掺短料的那一垛|单苇是否分得清两户不同的扎口|请原主到场辨扎口，先指出短料在哪一层|只在物主许可后拆看疑垛，把齐料与短料逐段给他核对|请接垛的人先读回物主记号，不按熟人远近决定垛次
dongfei|交代灶活用有次序的短句，新人跟不上时会带责备|新帮工究竟误读了柴签上的哪一个缩字|扈惠能否听懂改成完整活名的次序|请新帮工念一遍柴签，把读错的缩字指出|逐条写清取柴和添火的活名，再听帮工读回|在忙灶前问新手哪一步还没弄懂，先解释而不当众数落
peichun|检看桩木用审慎的判断句，被提醒时常重复验证|下一次退水何时能露出需要查看的桩根|裴溪愿不愿陪物主一起核对检看的范围|先从干岸标出被湿泥遮住的位置，说明目前看不见哪里|询问物主可陪同的退水时刻，核查露出桩侧后才检看|把亲见的裂处和听来的经验分开讲，请物主读回尚待检查处
suhui|对熟人说话轻而具体，陌生人追问时常缩成短句|搬苇人何时会再从菜叶床边经过|廖莞愿不愿陪自己把泥点影响当面讲给邻工|先把溅泥处指给邻工看，说明哪些叶片已重洗|询问搬运路线与时段，再提出经过时不甩湿束的办法|请廖莞听自己试说一次劳动边界，再由自己向邻工讲明
qilu|说水边旧事用带笑的口语，谈出处时容易迂回|戚枝是否记得那段听来的水情最初是谁说的|戚梅愿不愿逐段听自己区分亲见和转述|在家把被追问的故事重新说一遍，逐段标明听来的部分|请家人指出自己夸大过的段落，核对能说清的时间和地点|说完旧事询问听者是否误当下水建议，另讲今天尚未核清的水势
huayin|谈草叶温和细缓，对自家种法提出意见时语气会变硬|贾苗依据哪一种叶背变化判断阴处湿气|花澄能否将同一株背阴和向阳的叶片分别画清|从床外翻看两处叶背，先记下潮湿和斑点的区别|请贾苗在干处说明旧经验，把不相符的叶片单独核对|与花澄逐次对照原画和现叶，询问变化是否只出在背阴处
xiangzhen|报更路用简洁的方位句，解释偏路时常显得敷衍|向菲夜归时究竟在哪一个岔口看不清记号|郑汐何时能听自己说明白日路与夜路的区别|白日从干路找回被枯苇遮住的拐点，先核对旧痕|请向菲从安全路段指出误认处，再核查岔口方向|请晚归者读回天色和水势条件，对没看清的偏路继续标为待核
`.trim().split('\n').map(line=>line.split('|'));

// Small author groups are rooted in the local disputes and nearby work. Shared
// memories record an earlier unresolved discussion, never a paid/completed job.
export const authorBatches=[
 {topic:'门前认户与下岸苇束',ids:['zhengxi','wangpu','zhouzhu','wupeng'],location:'bld_wt_hall',event:'郑汐、王浦、周渚和伍蓬在汀口记事屋门外说过各自需要的空位。王浦比了翻篓时的宽处，周渚说明苇束挡退脚，伍蓬说搬远要分趟；郑汐将两处地点分开复述。门前与下岸的摆放都还没商定。'},
 {topic:'迎光辨网与借盆',ids:['weilian','huangting','heqin','lvmo'],location:'bld_wt_workroom',event:'魏涟、黄霆、贺芩和吕沫在苇席收边屋歇手时核对过各自工序。魏涟说旧网要迎光，黄霆说空响石边要腾空；贺芩和吕沫又谈到湿席与备灶争用水盆。四人只讲清了各自顾虑，还没有定下交换位置或交盆时刻。'},
 {topic:'干岸看水与菜床通行',ids:['shiqiao','keli','duke','liuyan'],location:'bld_wt_hall',event:'施峤、柯荔、杜珂和刘燕在汀口记事屋外谈过岸边的活。施峤要在干稳处看水，柯荔复述割苇和捆苇的分工，杜珂问菜床外木件转弯的空处，刘燕指出脚步不能压苗边。那次只是相互说明，没有允诺工时或通行范围。'},
 {topic:'岸路口述与门边旧物',ids:['zhangou','zhicai','xueying','leizhi'],location:'bld_wt_hall',event:'湛鸥、支采、薛萤和雷芷在汀口记事屋前说过进出和传话的麻烦。湛鸥解释退水便道不能当常路，支采说送补衣两户都催先拿，薛萤说旧根留在门边，雷芷追问含混称呼住哪一户。几人仍要回去分别询问家人与物主。'},
 {topic:'工位空隙与搭工分担',ids:['niyun','quhuai','dingsu','ruqin'],location:'bld_wt_workroom',event:'倪筠、屈槐、丁素和茹芹在苇席收边屋外歇过脚。倪筠比划晒架旁转身的空隙，屈槐说篱障缺口老被当道，丁素提到两户杂活撞时，茹芹指出软硬苇料不该只按颜色分。大家各说了一处难办的活，没有替物主答应改动。'},
 {topic:'苇料旧垫与图上的岸线',ids:['gonglu','jingyao','fanshui','shanju','dongfei'],location:'bld_wt_workroom',event:'龚潞、景遥、范水、单苴和董霏在苇席收边屋外谈过手上的记号。龚潞说明湿网两头轻重不同，景遥指着图问岸湾，范水提起旧垫松刺，单苴说认垛要看扎口，董霏读了一条灶房简记。几人听完后仍各自有待核对，没交料或排定工序。'},
 {topic:'退水检看与晚归辨路',ids:['peichun','suhui','qilu','huayin','xiangzhen'],location:'loc_wt_garden',event:'裴纯、宿蕙、戚鹭、花茵和向祯在岸上菜圃外的干处说过雨后劳动。裴纯讲桩根湿泥挡住裂处，宿蕙指溅到叶上的泥点，戚鹭区分听来的旧水情，花茵翻看阴处叶背，向祯说枯苇遮住更路记号。大家只核对可见处和待问处，还没解决各自的问题。'},
].map((batch,index)=>({...batch,index,ids:batch.ids.map(id),memoryId:`memory_wt_depth_group_${index}`}));

export const patchRows=authored.map(([key,register,u0,u1,short,mid,long])=>{
 const before=people.get(id(key)),issues=source.issues.filter(i=>i.id===before.id).map(({id,field,code})=>({id,field,code}));
 const batch=authorBatches.find(b=>b.ids.includes(before.id));
 const patches=[
  {path:`knowledge.known[${before.knowledge.known.length}]`,value:{fact:`我在${places.get(before.home.location)}居住；家里的${relatives.get(before.relationships[0].with).name}是我的${before.relationships[0].type}。`,source:before.home.location,reliability:'日常亲历'}},
  {path:`knowledge.known[${before.knowledge.known.length+1}]`,value:{fact:`我做${before.occupation}，日常劳动处在${places.get(before.workplace.location)}；眼下遇到的是${before.goals.short[0].content}。`,source:before.id,reliability:'本人亲历，问题尚未解决'}},
  {path:'knowledge.unknown[0]',value:u0+'。'},
  {path:'knowledge.unknown[1]',value:u1+'。'},
  {path:'voice.register',value:register+'。'},
  ...['short','mid','long'].map((term,i)=>({path:`goals.${term}[0].steps[0].content`,value:[short,mid,long][i]+'。'})),
  ...before.relationships.map((r,i)=>{const relative=relatives.get(r.with),other=people.get(r.with);return{path:`relationships[${i}].note`,value:relative?`${relative.name}是家里的${r.type}；${relative.concern}，这件事还需要彼此听完再商量。`:`与${other.name}有同村往来；对方在${places.get(other.workplace.location)}做${other.occupation}，见面时还需问清当日劳作与通行安排。`};}),
  {path:`memorySeeds[${before.memorySeeds.length}]`,value:{id:batch.memoryId,event:batch.event,location:batch.location,salience:4,knownBy:batch.ids,reliability:'共同亲历；未解决的分歧仍待各户核对'}},
 ];
 for(const issue of issues.filter(i=>i.code==='rule-wording')){
  if(patches.some(p=>p.path===issue.field))continue;
  if(/^opinions\.neighbors\[\d+\]\.view$/.test(issue.field)){const index=Number(issue.field.match(/\d+/)[0]),other=people.get(before.opinions.neighbors[index].with);patches.push({path:issue.field,value:`${other.name}在${places.get(other.workplace.location)}做${other.occupation}；与${other.sex==='女'?'她':other.sex==='男'?'他':other.name}谈通行和劳作时，我会先问清当日安排。`});}
  else if(before.id===id('lvmo')&&issue.field==='personality.description')patches.push({path:issue.field,value:'麻利、急躁，最看重灶边忙时器皿分得清。手快嘴也快，见人洗得慢就刺一句，说完自己照旧接着干；不占别人东西，也会拒绝别人占她的东西。'});
  else throw Error('未处理规则叶子 '+before.id+'/'+issue.field);
 }
 return{id:before.id,before,baseHash:source.hashes[before.id],issues,patches};
});
