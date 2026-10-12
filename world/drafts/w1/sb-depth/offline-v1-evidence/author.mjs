// Offline authoring source. Once prepared, changed sources require a new revision.
import fs from 'node:fs/promises';
import {loadWorld} from '../../../../tools/load-world.mjs';
import {auditNpcDepth} from '../../../../tools/audit-npc-depth.mjs';
import {hashContent} from '../../../../tools/content-pipeline.mjs';
import {getPath} from '../../../../tools/npc-depth-content.mjs';
import {sangbanRoster} from '../../../design/w1-villages-sangban.mjs';

const authored=`
zhangluo|问工日时简短直接，改轮次时容易先追究是谁没讲清|袁卿希望先理的具体枝位会影响哪一户已确认的采叶轮次。|缺席的换工户这次何时能出人，是否需要留人在家照顾。|先请袁卿指出需理枝的树，再圈出会受影响的采叶轮次。|逐户问摘叶和理枝各能出人的时段，把未应答处留空。|下次排轮时请缺人的户先说明照护时段，再请本人复核记录。
yuanqing|谈树势时语气稳，邻人质疑修枝便硬起来|邻户希望自己何时修哪一处枝，才能让晾布边避开树影。|张洛记录的采叶轮次中，哪一户愿意重议理枝先后。|陪晾布户到西晒处指出遮影的枝，先问物主接受哪种修法。|在晒处比对不同时辰的树影，问邻户哪一段最妨碍日常晾布。|改枝前说明对树势的顾虑，请邻人说清要保留的晾布边。
zhonglan|交叶料时说得细，别人动过叶堆便追问个不停|田陌愿不愿把采下的叶料粗分后交接，愿意分到哪一种程度。|里层仍湿的那堆叶何时能翻散，接料人是否愿意等到翻检后再接。|逐堆翻看里层，把潮叶所在的位置与接料人核对。|交叶时把表层与里层分别展示，请接料人复述看到的状态。|下一次交接先说明仍湿处，再问接料人是否愿意接下。
tianmo|说话快且爱逞能，被指出带梗时容易抢着辩解|钟岚认为叶料要分拣到哪一种程度才可以交接。|雇他采叶的人愿不愿把细拣另约，还是要求采后当场分开细梗。|放慢落手前的动作，先指给物主看自己要避开的细梗。|请分拣人查看一小束采叶，问夹梗从哪处落手造成。|接下一次采叶活前说清能做到的粗分程度，请物主确认。
zhenyun|讲挑壳理由缓慢耐心，听见省事的说法便带责备|顾露要在窗边核对哪一张晒位原签，需要多少时间。|后辈看旧壳缺口时，究竟是记号认不清还是破口本身分不出。|在亮处把易混的旧壳逐个摊开，指出自己能看清的破口。|请后辈说出两只近重旧壳的缺口差异，认不出的地方再示范。|把一次挑看的理由口述给接手人，请对方复述哪些破口仍有疑问。
gulu|报晒位时干脆冷淡，核对争签则逐项念原记号|甄芸辨哪一批壳最需要窗边亮处，何时愿意暂停一会。|两户原签上的空架记号各指哪一段工时，是否包含收尾。|请占同一空架的双方各带原记号，先读出各自记录的时段。|把争签处指给双方看，各问一次是否同意所读时段。|下一次有人来问空架，先问晒物与时段，再按待核对的记号回答。
yexun|说物件时专注而尖刻，别人催粗活便讥讽物主|竺钗认为灶口哪一段过道还会带进留样木屑。|物主送来这只木梭时原先缺边在哪里，是否还记得缺边出现的时机。|在物主面前翻看木梭，先圈出双方都看见的缺口。|把自己的检看记录读给物主，未确认的旧痕单列询问。|下次接旧梭先让物主认原缺口，再说明自己的修整范围。
zhuchai|安排灶边活计说得急，看到慢动作容易抢着动手|叶荀哪一份样屑还需比对，何时愿意把其余过道清出来。|被抢活的帮工愿不愿再搭手，想自己保留哪一道灶边工序。|先问帮工手上做到哪一步，让对方把这一段自行做完。|把要空出的灶边位置指明，请帮工选择愿做的一步再开工。|忙前问愿来搭手的人能承担哪些工序，把生熟容器摆放逐一说明。
panyao|说针线时慢而细，为保体面容易把不能补的地方绕过去|高枢检架必须摇动的那一段何时开始，自己哪段数针会受影响。|物主愿不愿保留已经磨薄的旧纹，还是接受拆开局部重补。|与物主对光看磨薄衣纹，把可能再裂的位置逐处指出。|请物主分别确认能补的部分与无法保证不裂的部分。|下次接旧衣时先说明布底状况，再请物主决定是否保留原纹。
gaoshu|检架时说得谨慎，未亲查的结论总要反复追问|潘瑶哪一段细纹正在数针，何时能避开摇架的检看。|使用者所说的织架异响究竟出在哪一处接合，空架时能否重现。|等空机时逐处摇查接合，把听到异响处与未发现处分别记下。|请使用者描述发响时的动作，再与空架检看结果逐项比较。|下一次交还检看记录时把确定的松动和仍未查明的响源分开说明。
zhouwei|说家门口的事亲切缓慢，被替自己安排坐处时固执|丛思愿意把晾线位置挪到哪一边，才能同时避开穿行和门前视线。|周芬觉得门前哪件晒物必须留下，何时方便一起调整遮眼处。|坐在惯常位置指给家人看哪件晒物挡住路，再问能挪哪一件。|请家人站在门前比较能看见行人的位置，让自己试坐后再议。|邀路过的熟邻在门外说一会近况，若要改坐处则先说自己的选择。
congsi|解释绕束时说得细，出错时语气紧而爱辩解|周薇坐在门边看路时，哪一段晾线位置最遮眼。|熟手看自己练习束的收尾手势后，认为回松原因在哪一处。|拆开自己的回松练习束，先把结尾动作演给熟手看。|请熟手指出收尾手势中紧松变化的位置，再用自己的练习线试做。|每次收束后先观察回弹，再把仍分不清的紧松处拿给熟手看。
maoli|说排水直且急，雨前容易连续催邻户动手|解安的空架哪一部分占到待清边沟，何时愿意重议暂放处。|邻段沟口的积叶来自哪一处，邻户愿意先清哪一段。|沿沟指出堵水的积叶位置，请邻户到场看来源再商量先后。|先说明自家叶泥要清回哪里，再请邻户说可一起清沟的时段。|雨前提前问邻户可用工时，把沟口仍需共看的位置留下再议。
jiean|问用架方式简短少言，被催促时常沉默停住|茅俪清沟要先腾出哪一段，空架是否有能经双方同意的暂放处。|使用者把湿盆放在架子的哪一边，是否愿意一起查看偏脚磨痕与摆盆方向。|空架时请使用者指摆盆方向，再对照偏脚磨痕。|把能看见的磨痕指出给物主，问是否需要调整便于检看的摆法。|下一次接架先问使用方式，再请物主看哪些磨损便于自行察觉。
baishu|闲聊温和绕弯，常从布色引到别人家事|鲁玮抬架转弯必须留出哪一段过道，晾布边能否另留位置。|听过自己猜话的人中，谁仍把未亲见的家事当成了确切消息。|向听过猜话的人说明自己只是按布色猜的，再问对方听成什么。|把亲见的晒布样子和自己猜的家事分开说，问听者有无误解。|再次有人谈那家事时先指出自己没亲见，不再用布色作确证。
luwei|接搬架活时爽快，谈轮肩时会往自己省力处说|白舒的哪一块晾布容易被转弯的架子碰落。|搭工者愿意按哪一种次序轮换轻重两头，能否把不平路段也算进去。|先和搭工者走一次转弯路线，标出路不平和需要换肩的位置。|开抬前请搭工者确认第一段各站哪头，下一段如何轮替。|再搭伙时请同伴指出上次分工不平处，重议自己承担的路段。
shikui|读约定平稳逐句，外乡人说得快便多追问几遍|孔柳摊平转角纸样需要哪一块桌面，是否会碰到分户的原契。|工约双方说的帮忙究竟包含哪一道清理工序，何时算收尾。|请双方分别描述帮忙的实际动作，把含糊处圈出再读回。|逐句问当事人原工事与清理工序是否都已说清，未应答处留待补说。|给不识字的当事人读回约定，请对方用自己的话复述劳动范围。
kongliu|问样线时爱比较且好强，描偏后语速会加快|史葵要分户放开的原契占哪一处，自己的角边纸样何时能摊平。|缝补者认为这张边样在哪一个转角接不上直边。|在废纸上分开试描直边和角边，请缝补者指对不上的一处。|将两段试样并排比较，逐处问转折需朝哪个方向。|向缝补者解释自己试描的转折理由，再问按它裁缝是否仍接不上。
feiqing|劝停梯时严厉谨慎，谈梯脚落稳才愿继续说|商筠的湿袋能否用经物主同意的低处晾位，哪一处不需要旧梯。|物主是否看见旧梯摇动的横档，何时愿意在场复查。|请物主看松动横档，先说明在复查前停止转借的顾虑。|对着原松档指出标记位置，请物主确认认得停用原因。|下次有人问借梯时先问是否见过松档标记，向物主转达借用请求。
shangyun|说洗晾利落短促，难认的袋口记号常想留到稍后|费清认为哪一架旧梯仍有疑问，低处哪些晾袋位置可以另问物主。|两户认回褪记的袋时，各凭哪一段旧记号才能确认归属。|把褪记袋分别晾开，逐户请物主认袋口，认不准的先留待核对。|交袋前分别读出自己认得的旧记号，请物主复认而不按熟脸分袋。|洗下一批袋前先询问记号能否重认，不能确认的部分留给物主处理。
chishan|讲旧树慢而恋旧，别人要挪篱便带防备|查悦希望候灶人站在哪一边才能听清叫名，又不反复踏实树根。|过路者愿意沿根外哪一条边绕行，自己能否保留篱边旧树。|陪过路者看突根，自己先试走根外路再问哪段难行。|请过路者指明便利的通行边，把护根顾虑说清后再议。|下一次有人提砍树省路时先让对方看根外通路，询问能否保留树。
chayue|记灶次时清楚而尖锐，争时段便翻出对方旧错|池杉觉得候灶人在树下哪一段踩踏最伤根。|争灶的两户各从何时开始计用灶时段，何时完成清台。|请争灶双方分别说开始与清台经过，先核对记录中未写清的部分。|读回包含清台的候选时段，请双方说明仍不接受的起止点。|下一轮登记前先问收尾需要多久，再让本人确认轮次。
qinwan|问衣服受紧处细致，亲属催活时语气容易放软|催改衣的两位物主各希望何时拿回，哪件已先得到自己的答应。|来催衣的亲属愿不愿等先答应的衣服做完后再来收自己的衣服。|把两件衣各自的物主和先答应的顺序核对清楚，再分别说明能做的时段。|请亲属确认接受排在已有约定之后，未点头前不插入原顺序。|下一次应下裁改前先查手上工序，再告诉物主自己能承诺的时间。
longfu|说育苗耐心但爱争理，别人不听便反复举旧例|用水者愿不愿先看自己已分好的苗，再朝避开苗位的一边转身。|龙瑜觉得自己讲的旧例究竟在哪一步不适合眼前育苗。|先指出被溅倒的那一排苗，请用水者试站后再议转身方向。|请用水者复述自己要保留的苗位，双方各提一种避溅的转身动作。|下次分苗交手前先检查根系松开处，再向接手人说明不能压回的位置。
zhuxian|谈木板直而急躁，发现乱放会抬高声音|实际搬板的人为什么把修好和待修木板堆到一起，愿不愿改暂放位置。|毕祺觉得哪一处家中放料最碍洗晒，何时方便一起分开。|先把两堆木板各指给搬动者看，问对方能否分开放待修与修好板。|向下一道工序的人说明暂放边界，请其复认哪堆仍有毛刺。|发现木料混放先问实际搬动者，再说明工序状态，避免指责路过的人。
fuyu|讲旧叶温和平缓，谈清走旧物时仍坚持自己挑|扶菁想先清掉桌上哪一部分旧叶，愿不愿留下自己指定的一小包。|家中留下的干叶中哪一撮已变质，是否还值得继续分拣。|把发霉的旧叶挑开给家人看，说明要留的那一小包只是念想。|请家人把想清的叶分别指出，自己逐撮查是否已霉变。|和家人约清轻活的范围，让自己先挑留念的旧叶再议清走其余。
quanli|指路时简短含糊，谈私园入口才会多解释一句|园主愿不愿整理被垂枝遮住的路记，哪些枝位可以动。|问路者究竟要到哪一处，是否误把自己指公路的话听成能进私园采叶。|陪问路者指认园外的转弯处，先说公共路走向再问其目的地。|向有权者指出被遮的原路记，询问可整理的范围后再动手。|下次指路让来人复述转弯点，若误听成采叶许可就当面解释。
yanjue|念签时认真拘谨，认不全的字常停顿不肯问|原写者能否一起核对两张旧签，指出哪一个字不同以及各自读法。|原写者何时能来复认旧签，自己留下的空格究竟对应哪个偏旁。|把两张旧签并排给原写者看，逐字念自己已看清的部分。|将不能确认的一字留空，请原写者说清后再核对两张旧签。|下一次记丝束签先复读名字给本人，不认得的字直接问原写者。
xianghe|安排家务热心且强势，列谁在家时总想先作决定|展露愿意承担哪一段值日，休息日哪一时段不愿被安排。|向妍愿意在何时自己说家务分配的顾虑，能否当面重议重活轮次。|请同住者各说今日能承担的一项家务，先留出尚未答应的活。|逐人问休息日愿意做哪一段，原来被拒的安排不再当作同意。|下一轮分家务让每个同住者自己选可承担的部分，再议无人愿做的重活。
diye|谈篾条时专注，收尾被问到便想岔回细活|同伴希望先清哪一片断篾头，何时方便一起检查过道。|邸汐觉得自己收工后还有哪一项归拢没做，明早要用的筐应先收哪里。|先捡当天落地的断头，再请同伴看仍会扎鞋底的过道位置。|细活收手后先检查工位和过道，向同伴说明仍未清完的地方。|下一次搭伙整理篾条前约清收尾范围，请同伴指出自己漏掉的归拢工序。
`.trim().split('\n').map(line=>line.split('|'));

const pairs=[
 ['zhangluo','yuanqing','loc_sb_orchard','张洛与袁卿在桑坡树地谈过修枝工与采叶工安排；张洛坚持已确认的轮次，袁卿希望先理枝，重排尚未商定。'],
 ['zhonglan','tianmo','loc_sb_orchard','钟岚与田陌在桑坡树地争过采叶后的收工界线；钟岚要分清叶料，田陌希望采完就休息，分拣范围尚未商定。'],
 ['zhenyun','gulu','bld_sb_hall','甄芸与顾露在桑坂换工屋谈过窗边亮处的使用；甄芸要辨壳，顾露要摊晒位原签，先后尚未商定。'],
 ['yexun','zhuchai','bld_sb_yard','叶荀与竺钗在梭架修整院争过留样木屑与入灶过道；叶荀想留比对样屑，竺钗怕木屑带进灶口，清理时点尚未商定。'],
 ['panyao','gaoshu','bld_sb_workroom','潘瑶与高枢在晒线缝补屋谈过补绣与摇架的工序；潘瑶要安静数针，高枢需摇架检看异响，避让时段尚未商定。'],
 ['zhouwei','congsi','loc_bs_sangban','周薇与丛思在桑坂村谈过门前视线与晾线位置；周薇要看得到路人，丛思想让线束避开穿行处，位置尚未商定。'],
 ['maoli','jiean','loc_sb_fields','茅俪与解安在桑坡边沟田谈过清沟与空架暂放；茅俪催雨前清沟，解安要平整处检看空架，暂放位置尚未商定。'],
 ['baishu','luwei','loc_bs_sangban','白舒与鲁玮在桑坂村谈过晒布与搬架过道；白舒怕布被碰落，鲁玮说转弯要留宽处，过道宽度尚未商定。'],
 ['shikui','kongliu','bld_sb_hall','史葵与孔柳在桑坂换工屋谈过公共桌上的原契与描样；史葵要按人分放原契，孔柳需摊平转角纸样，桌面分用尚未商定。'],
 ['feiqing','shangyun','loc_bs_sangban','费清与商筠在桑坂村谈过旧梯停用与晾袋；费清坚持有疑问的梯先停用，商筠需要不借坏梯的晾位，替代位置尚未商定。'],
 ['chishan','chayue','loc_bs_sangban','池杉与查悦在桑坂村谈过树下歇脚与候灶；池杉不愿树根反复受踩，查悦希望候灶人能听到叫名，候灶位置尚未商定。'],
 ['qinwan','longfu','loc_bs_sangban','秦婉与龙芙在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。'],
 ['zhuxian','fuyu','loc_bs_sangban','诸弦与扶瑜在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。'],
 ['quanli','yanjue','loc_bs_sangban','全立与晏珏在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。'],
 ['xianghe','diye','loc_bs_sangban','向荷与邸叶在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。'],
];
const world=await loadWorld(),base=world.npcs.filter(n=>n.settlement==='loc_bs_sangban'&&n.tier==='full');
const audit=auditNpcDepth(world).issues,people=new Map([...world.npcs,...world.residents].map(n=>[n.id,n]));
const roster=new Map(sangbanRoster.trim().split('\n').map(line=>{const r=line.split('|');return ['npc_sb_'+r[1],r];}));
const events=pairs.map(([a,b,location,event],i)=>({id:`memory_sb_depth_shared_${i+1}`,event,location,salience:3,knownBy:[`npc_sb_${a}`,`npc_sb_${b}`],reliability:'亲历'}));
const cohortIndices=[[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15],[16,17,18,19],[20,21,22,23],[24,25,26],[27,28,29]];
const cohorts=cohortIndices.map((indices,i)=>({id:`sb-cohort-${i+1}`,participants:indices.map(j=>'npc_sb_'+authored[j][0]),sourceProblems:i<3?[`problem_sb_${i*2+1}`,...(i<2?[`problem_sb_${i*2+2}`]:[])]:[],sharedMemoryIds:[...new Set(indices.map(j=>events.find(e=>e.knownBy.includes('npc_sb_'+authored[j][0])).id))]}));
const patchRows=authored.map(([slug,register,u0,u1,short,mid,long])=>{
 const id='npc_sb_'+slug,before=base.find(n=>n.id===id),issues=audit.filter(i=>i.id===id).map(({id,field,code})=>({id,field,code})),memory=events.find(m=>m.knownBy.includes(id));
 const patches=[{path:'knowledge.known[1]',value:{fact:before.authoredFacts.memories[1],source:id,reliability:'亲历'}},{path:'knowledge.known[2]',value:{fact:memory.event,source:id,reliability:'亲历'}},{path:'knowledge.unknown[0]',value:u0},{path:'knowledge.unknown[1]',value:u1},{path:'voice.register',value:register},...['short','mid','long'].map((term,i)=>({path:`goals.${term}[0].steps[0].content`,value:[short,mid,long][i]})),{path:`memorySeeds[${before.memorySeeds.length}]`,value:memory}];
 for(const issue of issues.filter(i=>i.code==='relationship-note')){
  const r=before.relationships[Number(issue.field.match(/\[(\d+)\]/)[1])],other=people.get(r.with),raw=roster.get(r.with);
  const value=raw?`${other.name}与${before.name}同住${world.locations.find(l=>l.id===before.home.location).name}，在家中见面；${raw[7]}。`:`${before.name}在桑坂村的日常往来中见过${other.name}，认得这位同村住户。`;
  patches.push({path:issue.field,value});
 }
 for(const issue of issues.filter(i=>i.code==='rule-wording')){
  if(patches.some(p=>p.path===issue.field))continue;
  const value=id==='npc_sb_yuanqing'?getPath(before,issue.field).replaceAll('觉得邻人不懂树就不许提意见','认定邻人不懂树，常拒听对方的修枝意见'):`${before.name}在桑坂村的日常往来中见过${people.get(before.relationships[2].with).name}，认得这位同村住户。`;
  patches.push({path:issue.field,value});
 }
 return {id,before,baseHash:hashContent(before),issues,patches};
});
async function freeze(file,text){
 try{const saved=await fs.readFile(file,'utf8');if(saved.replaceAll('\r\n','\n')!==text)throw Error(`冻结文件已改变，须先逐条复核新修订：${file}`);}
 catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(file,text,{flag:'wx'});}
}
await freeze('world/drafts/w1/sb-depth/base.json',JSON.stringify(base,null,2)+'\n');
const frozenRows=patchRows.map(({before,...row})=>row);
await freeze('world/design/w1-sb-depth.mjs',`// Frozen audit leaves; formal sources are unchanged. L2/L4 remain pending.\nimport base from '../drafts/w1/sb-depth/base.json' with {type:'json'};\nexport const revision='w1-sb-depth-v1';\nexport const incrementLimitYuan=3;\nexport const cohorts=${JSON.stringify(cohorts,null,2)};\nconst rows=${JSON.stringify(frozenRows,null,2)};\nexport const patchRows=rows.map(row=>({...row,before:base.find(n=>n.id===row.id)}));\n`);
const sources={status:'offline-authored-awaiting-L2-L4',modelCalls:0,cohortSizes:cohorts.map(c=>c.participants.length),originalIssues:383,sharedEvents:events.map((event,i)=>({...event,sourceRecords:pairs[i].slice(0,2).map(slug=>{const n=people.get('npc_sb_'+slug);return {id:n.id,name:n.name,relationships:n.relationships,socialProfile:n.socialProfile};}),basis:i<5?`problem_sb_${i+1}`:i<11?'双方原socialProfile.conflicts':'原单向同村日常往来关系；只补相认，不推断职业或秘密'})),relationshipNotesSource:'world/design/w1-villages-sangban.mjs:sangbanRoster 第8列烦恼；冻结原档户籍与关系，不使用新增候选证明其自身'};
await freeze('world/drafts/w1/sb-depth/source-evidence.json',JSON.stringify(sources,null,2)+'\n');
console.log(JSON.stringify({people:base.length,issues:patchRows.flatMap(r=>r.issues).length,patches:patchRows.flatMap(r=>r.patches).length,cohortSizes:sources.cohortSizes,modelCalls:0}));
