// T91: locally authored biographies; DeepSeek is used only for factual L2.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import Ajv from 'ajv';
import {baishiSkeleton} from './w1-baishi-skeleton.mjs';
import {loadWorld} from '../../tools/load-world.mjs';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent,hashContent} from '../../tools/content-pipeline.mjs';
import {validateNpcDepth,validateNpcProfiles} from '../../tools/npc-profile-validation.mjs';

export const revision='t91-dock-1';
export const root=path.resolve('world/drafts/w1/baishi-dock');
export const budgetRoot=path.resolve('world/drafts/w1');
const read=f=>fs.readFile(f,'utf8').then(JSON.parse);
export async function write(f,v){await fs.mkdir(path.dirname(f),{recursive:true});const temp=`${f}.${process.pid}.tmp`;await fs.writeFile(temp,JSON.stringify(v,null,2)+'\n');await fs.rename(temp,f);}

// Eleven witnessed incidents. The two proposals remain unsettled, with no debt,
// transport contract, public stock, or new service created by an old incident.
const incidents=[
 ['棚凳','bld_bs_dock','去年秋天一场斜雨中，三人把交接棚中间的等候凳搬到棚边，试走了一次空手通道；雨停后仍未约定以后凳子的固定位置。','希望重物直行，不再绕凳','希望家属坐在雨淋不到的地方','先按一趟船的等候人数摆凳'],
 ['折角','bld_bs_guild','去年冬初，三人在联络处展开一张日期被折角遮住的旧货单，找到了日期所在的位置，当场重折；没有更改货主姓名与交货日期。','想把日期写在外侧','想保留货主的原折法','愿意接货时先展开当面读'],
 ['湿绳','bld_bs_boat','去年夏末，三人在船户会屋把一段湿旧绳摊开检查，见到磨毛处后停用了那一段；谁承担以后更换绳具的费用还没谈定。','主张发现磨毛就停用','想先区分浅毛和断股','想凑在收工时一起检查'],
 ['车轮','bld_bs_carter','去年秋末，三人在车行门口移开一只旧车轮，让一辆空车转过门角；后来车轮又被放回门边，放置地点没有定下。','希望门角一直空着','想把轮子留在伸手可取处','提议在墙边画出放轮的范围'],
 ['漏行','bld_bs_weigh','去年冬天，三人在验秤房前厅重数一排空袋，发现纸上漏了一行，于是添上空袋数；那次没有称货，也没有变动任何货物的价钱。','宁愿重数也不沿用漏行单','想把复核放在收尾时','主张每搬一排就记一行'],
 ['晾布','loc_bs_hebu','去年夏天，三人在河埠街把落到通道里的晾布拾起，送回各自认识的住户门前；关于晾绳离通道多远，他们没有谈拢。','想让长绳都退到门前','怕门前日照太短','建议先试一根短绳的距离'],
 ['灯下读单','bld_bs_store','去年冬末，三人在货栈交接廊借前厅灯光读清一张墨迹浅的纸单，随后各自复述了看见的日期；没有代货主签字。','想白天就把浅字核清','愿等交接双方到齐再读','怕夜里读单耽误家中用饭'],
 ['候船','bld_bs_dock','去年春末，三人在交接棚一起等过一趟迟来的船，彼此说明回家时辰后轮流留在棚外看河面；那次没有收货或预收工钱。','希望先报迟船再等','想把等候分成短轮次','觉得应留一个熟悉船影的人'],
 ['错姓','bld_bs_guild','去年秋天，三人在联络处核对两张名字相近的纸条，找出姓氏不同的地方，各自把纸条交还递纸人；没有交换货主或货权。','想在纸条上圈出姓氏','怕圈字损坏原单','提议口头复述姓名再还纸'],
 ['泥脚印','bld_bs_store','去年雨季，三人在货栈交接廊擦去门边的泥脚印，把一块湿垫挪到门外晾着；何时收回垫子仍有人忘记。','想每次进廊前擦鞋','怕鞋垫挡着推车','愿意收工时提醒收垫'],
 ['回家钟点','bld_bs_boat','去年入冬前，三人在船户会屋核对各自写下的回家钟点，发现有人把午后写成了午前，随后改正了自己的纸条；没有替别人答应新的船期。','要先问同户能否看门','想先确定下一次船期','希望把晚饭前的空档留给家人'],
];

// Per-person authorship: family episode, private wish, practical action,
// unshared thought, individual speech. Names and jobs come from T90, never here.
const biographies=[
 ['曾在同户住客夜里回屋前把共用门闩擦净，第二天才发现自己少睡了半个时辰。','留一晚完整的睡觉时间','先与同户商量谁最后关门','其实羡慕能按钟点回家的住客','凳子先挪一点，我背着东西过一遍再说。','用脚步距离说事','提起夜更会压低声音'],
 ['帮同户把窗缝塞上旧布，却忘了留透气口，晚饭时重新拆开一角。','把窗缝补好又留一条气口','在白天检查风从哪边进来','怕问修窗工钱时显得自己不会持家','让等船的人坐干处，通道我也看着。','说话细密，先讲家中不便','报时前先看日影'],
 ['家中晾绳上的两件衣物落到湿台边，自己洗了一遍，没怪共用绳的住客。','找到一处衣物不沾水的晾处','问同户下午哪块门边有太阳','攒着一句抱怨，几次想说又咽回去','先数人，坐不下再添凳。','平声报数，很少用夸大的词','回答前把姓氏木牌转正'],
 ['与同户收拢散开的交接纸，发现一张被自己压在饭碗底下，擦干后另夹起来。','在家里留出放纸的干角落','找一块不用放饭碗的桌边','不想承认最乱的纸堆是自己的','外侧留日期，折回去也看得见。','常用具体的纸角和行数解释','话说到日期会重复一遍'],
 ['曾把家门的晾绳打成太紧的结，同户拆不开，自己收工后慢慢解开。','让同户也能轻松解开晾绳','试两种松紧不同的活结','觉得别人夸自己的手快时有些心虚','原单的折法是谁的，先问一声。','口气克制，遇到归属先停顿','说完一条理由才接下一条'],
 ['同户请自己认一行姓氏，第一次认错后留了一整晚把字形逐个对照。','以后能认清常见货主的姓氏','请学馆前厅的人指认自己记下的字','怕旁人发现自己认字靠记形','展开读，读清了再折。','短句中夹着字形比划','遇到不认识的字会直说再问'],
 ['帮同户拿起落地的篮子，见提手松了，晚间用旧线补住了松处。','篮子装满时也能提稳','先让同户空提再轻装试一回','担心自己补的线撑不到下一次赶集','绳毛到这里就停，先别把人拴进去。','语速快，谈安全时说得很慢','把不确定处单独再讲一次'],
 ['曾把自己晾着的外衣挪开，给同户的小衣物让出日照，结果自己的袖口未干。','湿天也能安排好全户晾衣次序','记下门前哪段时辰最晒得干','希望下一次同户能先顾到自己的衣服','先看是浮毛还是断股，别把能用的都扔了。','谈损耗时习惯举眼前物件','提建议时先说会多花多久'],
 ['陪同户在屋里认字时忘记了看门，来问路的人敲了两回才应声。','留出一段不被敲门打断的认字时间','提前在门前写出可以招呼的时辰','认字进展比自己说的慢了一些','收工摊开看，人人都看见才省争论。','带着解释口吻，宁愿多说半句','开口前会把指尖擦在衣边'],
 ['把自家门边的篮子挪到床脚，同户夜里差点踢到，次日一起另找了位置。','找到不挡路的放篮位置','白天试走从门到睡处的路线','其实舍不得丢掉那只已裂的旧篮','门角留开，空车能过，满车再量。','嗓门明亮，讲尺寸时不打圆场','报数字会伸出手指'],
 ['听同户说窗缝漏风后拿来一根不合宽的木条，又退回去重量了长度。','补窗之前不再凭眼睛估长度','用一张纸折出窗缝宽窄带去询价','不愿同户知道自己第一次量错','轮子远了不好拿，留个转车口就够。','用日常用具比宽窄','讨价时先问是不是包括搬运'],
 ['整理家中鞋子时发现自己的泥鞋蹭脏同户衣摆，先清洗衣摆再洗鞋。','把雨天脏鞋留在起居间外侧','向同户借一角不用晾布的门边','对那次蹭脏衣摆一直没敢主动提起','墙边画一条线，放回去就照线看。','语气平直，做过才愿说好用','句尾常落在具体位置上'],
 ['同户把一碗饭留到自己回来，饭凉后自己热了两遍，从此记着先报迟归。','迟归时不让家人空等饭','出门前把大概回家钟点说清','担心以后总因工作错过晚饭','漏一行就重数，这回我跟着指。','口气认真，认错时不绕弯','说数目会从头重新起'],
 ['曾与同户分头晒布，自己晚收半刻，露水把已干的布角又打湿。','掌握一回及时收布的时辰','先看布角再决定是否继续晾','怕家人觉得自己只顾码头不顾家','收尾一起核对，搬到一半别堵住。','声音柔和，意见却讲得明确','劝人时先说对方正在做的事'],
 ['帮同户抄家中要买的东西，抄漏了灯芯，到铺前才发现纸条短了一行。','让家中采购纸条能逐项看清','每写一项就请同户指着念一遍','偷偷把漏行的旧纸条留作提醒','一排一行，抬走再划掉这一行。','讲法像在带人逐项认字','边说边用空指划纸上的格'],
 ['在同户睡前试着描姓氏，纸被开门风吹散，追到门边才收齐。','有一张不会被开门风吹散的桌面','试把桌角挪离迎风的门缝','想认好字后自己写一封家信','绳子退回门前，衣布落在路上可惜。','说话有明显停顿，挑准词再说','提家信时会把纸折进袖里'],
 ['答应同户晚饭前看门，因在河面边多等了一会儿迟到，回屋先道明了原因。','不再把看门和候船答应在同一时辰','把同户的看门空档先问出来','仍想亲眼看清每种船的船影','我家门前阴，绳短了衣服就不干。','直率地讲自己吃过的亏','说到日照会转头看窗边'],
 ['同户教自己把漏风的布塞牢，自己贪快塞得太深，拆出来重做了一次。','让家人能随手拆洗塞窗的布','先把布卷成留有拉头的样子','急着做完家务是想留时间独处','先试短绳，下午去摸一摸干没干。','低声说实物，少讲笼统道理','碰到争执会先报试做的办法'],
 ['自己折的单子遮了姓氏，同户认不清来递单的人，回家后重新折给他看。','把家中留存的纸单分成可读的一小叠','逐张展开，把姓氏露在同一边','盼着别人觉得自己抄的字比旧单清楚','浅字趁白天读，灯下越急越错。','吐字清晰，对日期咬字较重','读完单会要求对方复述'],
 ['把修车轮用的旧布放进家门篮里，同户误当晾布拿走，解释后另找了角落。','让家中修补布与晾布分开放','请同户一起认清两处放布的位置','舍不得将磨破的修补布换成新布','人到齐再读，省得只听半句。','爱把话讲完整，别人打断会重新起头','提约见先确认来者是谁'],
 ['同户端饭出来时自己还在数纸，饭差点被纸堆挡住，后来饭前先收桌。','晚饭桌上只留吃饭用的东西','饭前把散纸叠到架下','很想拥有一张只属于自己的小桌','夜里等单到几时，我家还等饭。','温和但会追问具体钟点','说晚饭时会摸袖口补线'],
 ['同户让自己挑一件干衣，自己挑错了较潮的，到了门外才回屋换衣。','学会摸衣料是否已经晒干','先摸领口和袖缝再选衣服','担心同户嫌自己家务上太粗心','迟了先报一句，人可以有个打算。','话短，常把时辰放在句首','等答复时会整理领口'],
 ['轮到自己看门时同时整理旧纸，家人回来站了一会儿才听见敲门声。','看门时不再把注意力全放进纸堆','把待整理的纸留到换班以后','有时想回避同户问工作上是否顺心','半刻一换，谁回家早先放谁。','愿意商量，讲自己的要求会轻一些','听完人数才提出轮次'],
 ['帮同户把湿鞋搬到门边，自己那双压住了别人的鞋带，收回时重新松开。','雨天鞋子摆着也能各自拿走','按鞋头方向试两种摆法','怕家人看穿自己已经不想再补旧鞋','船影认得的人留一会儿，我先看上游。','声音稳，辨不清的事会留一句余地','描述船时用岸上方位'],
 ['曾把家中采购纸条上的姓氏看成另一个字，同户指着两笔不同处纠正了自己。','认清家中常用纸条上的几个易混字','把易混字并排描在旧纸背面','害怕在货主面前又读错姓氏','姓圈出来，读的人先看这一笔。','语气带一点自嘲，错字会立即改口','念名字时比念数目慢'],
 ['把同户夹纸的细绳系得太紧，纸边起皱，解绳后用手压平了一晚。','让家里夹纸既牢又不损纸','试用松一些的结夹两张废纸','看到皱纸会想起自己做事时的蛮劲','别动他的原纸，圈了就擦不回。','语速偏慢，遇到损坏会说得很具体','指出问题时先指哪一处'],
 ['同户认错了一张留在家里的纸条，自己陪着核姓，却也一度跟着认错。','与家人读纸条时先独立认一次','把姓名分成姓和名各念一遍','有点怕自己越来越依赖别人的读法','把姓念一遍，交还时请他应声。','像在对话里一字一字核实','听到姓名会点头再复述'],
 ['回家时泥脚踏到同户刚擦的门边，擦净后把鞋留到外头晾了一会儿。','回家时不再添一串泥脚印','先在门边检查鞋底再进去','其实不喜欢站在冷门口脱鞋','擦一下鞋，省得再蹲着擦一廊。','日常口吻中带一点抱怨','提起泥脚印会先看脚下'],
 ['家里放在门边的垫子挡住自己提篮，自己移开后却忘了告诉同户。','家门垫子有一个全户都知道的位置','在晚饭前带同户看两处能放垫的角落','怕被说成只顾自己走得顺','垫子别伸到车轮下，擦鞋去一边。','直说自己的通行需要','谈位置时先走两步试路'],
 ['答应同户入夜前收晾布，忙着抄纸忘记，夜里又起身到门前收回来。','收工时能记起答应的家务','把收布写在回家纸条最上头','不想让家人看见自己也会忘约','收工谁最后走，顺口提醒一声。','有耐心，提醒别人时尽量轻声','说约定会摸一摸衣襟里的旧纸'],
 ['同户临时要出门，自己答应留在家里，直到午后才发现原定见面忘了改期。','看门与约见各有一个可靠时辰','先请同户报明出门再回来的钟点','怕家人认为外面的约见比他们重要','先问谁看门，家里没人不能空着。','句子带着家务里的细节','给答复前先算来回路程'],
 ['家中放车轮的角落挡了开门，自己与同户试了半天，最后只暂靠另一面墙。','给自家门口留出转身的地方','请同户拿空篮试着出入两次','期待有一天能不用借家中角落放轮子','下回船几点，先问准才好排家里。','健谈，意见通常有一个亲身例子','说到门口转身会伸手比画'],
 ['晚饭前同户等自己一起收旧纸，自己以为午后还有空，天黑才知道记早了时辰。','晚饭前留出一次共同收纸的空档','把午前与午后的纸条用不同折角标记','舍不得放掉晚饭前在河边独坐的时间','晚饭前这一段，我想留给家里。','不急着答应，先说当天空闲','遇到催促会把自己的钟点再念一次'],
];

const workplaceFor=p=>({'系缆与装卸':'bld_bs_dock','船具修补':'bld_bs_boat','码头计数':'bld_bs_weigh','货栈交接':'bld_bs_store','车运安排':'bld_bs_carter','货单抄写':'bld_bs_guild'})[p.occupation];
export function authorDock(world){
 const bones=baishiSkeleton(world),river=bones.residents.filter(p=>p.age>=18&&Number(p.householdId.slice(-3))<=15).slice(0,17),store=bones.residents.filter(p=>p.age>=18&&Number(p.householdId.slice(-3))>=16&&Number(p.householdId.slice(-3))<=30).slice(0,16);
 const sources=river.flatMap((p,i)=>store[i]?[p,store[i]]:[p]);assert.equal(sources.length,33);
 const events=incidents.map(([title,location,event,...positions],i)=>({id:`memory_t91_${i+1}`,title,location,event,actors:sources.slice(i*3,i*3+3).map(p=>p.id),positions}));
 const people=sources.map((p,i)=>{
  const [family,wish,step,secret,speech,register,habit]=biographies[i],event=events[Math.floor(i/3)],pos=i%3,peers=sources.slice(Math.floor(i/3)*3,Math.floor(i/3)*3+3).filter(x=>x.id!==p.id),familyId=p.household.find(id=>id!==bones.yan.id&&!peers.some(x=>x.id===id)),familyMember=bones.residents.find(x=>x.id===familyId)??bones.yan;
  const coins=18+i%9,inventory={[i%2?'item_wood':'item_flax_cord']:1},workplace=workplaceFor(p);
  const day=[{start:0,end:420,location:p.home.location,activity:'睡眠',services:[]},{start:420,end:480,location:p.home.location,activity:'用早饭、商量家中安排',services:[]},{start:480,end:720,location:workplace,activity:p.occupation,services:['trade']},{start:720,end:780,location:p.home.location,activity:'回家午饭',services:[]},{start:780,end:1080,location:workplace,activity:p.occupation,services:['trade']},{start:1080,end:1200,location:p.home.location,activity:'家中起居与整理个人物件',services:[]},{start:1200,end:1440,location:p.home.location,activity:'晚饭与休息',services:[]}];
  const goal=(term,content,steps,deadlineDay)=>[{id:`goal_t91_${i+1}_${term}`,content,progress:0,deadlineDay,resources:[{kind:'协商',description:'须当事人另行确认的空闲时辰',availability:'unverified',grantsInventory:false}],steps:steps.map(content=>({content,status:'pending'}))}];
  const relations=peers.map((other,j)=>({with:other.id,type:'交接往来',trust:8+pos*3,affection:0,note:`记得与${other.name}在场时的事：${event.event}${j===0?`${p.name}${event.positions[pos]}，而${other.name}${event.positions[sources.indexOf(other)%3]}。`:`记得${other.name}在${event.location==='bld_bs_dock'?'交接棚':world.locations.find(l=>l.id===event.location).name}与自己一起经历过${event.title}；${other.name}${event.positions[sources.indexOf(other)%3]}，${p.name}${event.positions[pos]}。`}`}));
  relations.push({with:familyMember.id,type:'同户共居',trust:18,affection:6,note:`${p.name}记得与${familyMember.name}共居时的事：${family}`});
  return{...structuredClone(p),tier:'full',trust:0,affection:0,coins,inventory,skills:[],services:[],intelligence:{level:2,growth:0},birth:{year:-p.age,month:3+i%9,day:2+i%25},familyNotes:`${p.name}与${p.household.map(id=>id===bones.yan.id?'严辙':bones.residents.find(x=>x.id===id).name).join('、')}共居。${family}`,appearance:[p.visibleFeature,'外衣下摆有一道晒浅的折痕',i%2?'袖里收着一张折窄的旧纸':'提篮的把手用旧布缠过'],voice:{register,accent:'河谷日常口音',habits:[habit],samples:[speech,`${wish}，我准备${step}。`,`${event.positions[pos]}，这事下次见面还得说清。`]},personality:{traits:p.traits,values:[wish,'约好的事要报明变动'],flaws:[secret]},proficiencies:{},professions:[],level:1,combat:null,wealth:{cashRange:[coins,coins],property:[],valuables:[],debts:[]},home:{...p.home,ownership:'unspecified'},workplace:{location:workplace,access:'营业时在前厅招呼；内室与器具另问保管人。'},schedule:{default:day,market:structuredClone(day),rest:[{start:0,end:480,location:p.home.location,activity:'休息',services:[]},{start:480,end:1200,location:p.home.location,activity:'家中照护与休息',services:[]},{start:1200,end:1440,location:p.home.location,activity:'晚饭与睡眠',services:[]}],restDays:[10,20,30]},relationships:relations,memorySeeds:[{id:event.id,event:`${event.actors.map(id=>sources.find(x=>x.id===id).name).join('、')}一起经历：${event.event}`,location:event.location,salience:4,knownBy:event.actors,reliability:'亲历'},{id:`memory_t91_private_${i+1}`,event:family,salience:3,knownBy:[p.id],reliability:'个人回忆'}],goals:{short:goal('short',wish,[step],30),mid:goal('mid',`与同户找到家务和${p.occupation}都能照看的时辰`,[`请${familyMember.name}说出最需要自己在家的时段`,'把有冲突的约见另约到双方空闲时'],180),long:goal('long',`让${event.title}引起的分歧有一个能维持的办法`,[`向${peers[0].name}说明：${event.positions[pos]}`,`听取${peers[1].name}的顾虑后提出一回小范围试做`],720)},fears:[`怕${wish}一再因临时工作搁下`],redLines:['自己的物件须自己点头才能拿走','不替同户答应照护和出门时辰'],secrets:[{content:secret,knownBy:[p.id]}],knowledge:{known:[{fact:event.event,source:event.actors[0],reliability:'当时在场亲历'},{fact:family,source:p.id,reliability:'个人亲历'},{fact:`${world.locations.find(l=>l.id===workplace).name}是自己日常做${p.occupation}的地方，前厅开放时间为${world.locations.find(l=>l.id===workplace).openHours.map(m=>m/60).join('至')}时。`,source:workplace,reliability:'日常出入与门前告示'}],unknown:[`${familyMember.name}下次何时能留在家里看门？`,`${peers[0].name}是否愿意试做自己提出的${event.title}办法？`]},opinions:{factions:'行会联络处能帮助把姓名和日期说清，实际约定仍找当事人谈。',magic:'若要用法术搬动东西，想先看会不会碰坏物件。',adventurers:'外来的帮手若把钟点说明白，愿意先谈一件小事。',neighbors:peers.map(x=>({with:x.id,view:`记得一起处理过${event.title}，具体安排还需要听${x.name}说。`}))},towardPlayer:{baseline:{trust:0,affection:0},raises:['按说好的钟点到场','借物先征询'],lowers:['让家人久等却不报变动','擅拿私人物件'],attitude:'初见先在前厅说明来意，愿谈自己手边的闲置物件。'},behaviorRules:{bargaining:'只出售本人愿卖的一件闲置物，价钱按当次报价谈。',honesty:'记得的说清楚，读不准的姓名会请对方复述。',risk:'没有看清通道前不急着搬重物。',threatResponse:'退到附近公开前厅寻人作证。',bribeResponse:'不替物主签字，也不把收下好处当作运输担保。'},serviceCatalog:[{kind:'trade',what:'本人闲置库存',price:{mode:'engineQuote'},unlocksService:false}],hooks:[wish,event.positions[pos]],ttsVoice:p.sex==='女'?'zh_female_resident_01':'zh_male_resident_01',portraitPrompt:`原创河谷成年居民${p.name}，${p.age}岁，${p.visibleFeature}，朴素衣着，${p.occupation}`,notes:`${p.currentConcern}${event.positions[pos]}。`,description:`${p.name}是白石镇的${p.occupation}住户，${p.age}岁。${p.visibleFeature}${family}${wish}是近来惦记的事，说话时${habit}。遇到${event.title}的讨论，${event.positions[pos]}。`};
 });
 for(const person of people)person.schedule.seasonal={};
 const entries=people.map((draft,i)=>({id:draft.id,kind:'npc',source:sources[i],draft}));
 return{sources,people,events,entries};
}

export function reviewContext(entry,bundle,world){
 const i=bundle.sources.findIndex(p=>p.id===entry.id),event=bundle.events[Math.floor(i/3)];
 const bones=baishiSkeleton(world),all=new Map([...bones.residents,bones.yan].map(p=>[p.id,p]));
 const authorDesign=Object.fromEntries(['appearance','voice','personality','home','workplace','schedule','proficiencies','professions','level','combat','goals','fears','redLines','opinions','towardPlayer','behaviorRules','serviceCatalog','hooks'].map(k=>[k,entry.draft[k]]));
 return{originalRoster:bundle.sources[i],authoredBiography:{familyEpisode:biographies[i][0],familyWith:entry.draft.relationships.at(-1).with,privateWish:biographies[i][1],wishAction:biographies[i][2],unsharedThought:biographies[i][3]},authoredDesign:authorDesign,authoredEvent:{...event,expressedPositions:event.actors.map((id,j)=>({id,name:all.get(id).name,proposal:event.positions[j],knownBy:event.actors})),state:"三人当时公开表达各自意见，未达成共同约定。"},townName:world.locations.find(l=>l.id==="loc_bs").name,participants:bundle.sources.filter(p=>event.actors.includes(p.id)),household:world.households.find(h=>h.id===entry.source.householdId),cohabitants:entry.source.household.map(id=>all.get(id)).map(p=>({id:p.id,name:p.name,age:p.age})),workplaces:world.locations.filter(l=>[event.location,entry.draft.workplace.location].includes(l.id)),authorHoldings:{coins:entry.draft.coins,inventory:entry.draft.inventory,ownership:'个人初始零用钱与一件闲置物；不是公库、雇佣付款或货栈代管货物。'},limits:'T91作者设计新生活往事、私人目标、外貌和说话习惯；不把相容的新人物事实误判为缺少旧史依据。T90原名册事实必须保留。共享事件与意见须相容，提议仍未决定；私下想法仅本人知晓。职业不授予教学、修理、雇船、运输或官职能力，仅复用既有库存trade；不添加债务、产权或公共库存。'};
}
export async function validate(bundle,world){
 const proposed=integrate(world,bundle),s=await read('schemas/world.schema.json'),ajv=new Ajv({strict:true,allowUnionTypes:true,allErrors:true}),check=ajv.compile({$ref:'#/$defs/npc',$defs:s.$defs});
 for(const p of bundle.people)assert.ok(check(p),`${p.id}: ${JSON.stringify(check.errors)}`);
 assert.deepEqual(validateNpcProfiles(proposed),[]);
 assert.deepEqual(validateNpcDepth(proposed).issues,[]);
 const blocked=await read('world/i18n/blocklist.zh.json');for(const p of bundle.people)assert.ok(!blocked.entries.map(e=>e.word).some(n=>JSON.stringify(p).includes(n)),p.id);
 for(let i=0;i<bundle.people.length;i++)for(const key of Object.keys(bundle.sources[i]))if(!['tier','home'].includes(key))assert.deepEqual(bundle.people[i][key],bundle.sources[i][key],`${bundle.people[i].id}.${key}`);
 return bundle;
}
export function integrate(world,bundle){
 const ids=new Set(bundle.people.map(p=>p.id));
 // Existing full profiles can have runtime/static edits after first promotion.
 return{...world,npcs:[...world.npcs,...bundle.people.filter(p=>!world.npcs.some(n=>n.id===p.id))],residents:world.residents.filter(p=>!ids.has(p.id))};
}
export async function prepare(world){world??=await loadWorld();const bundle=authorDock(world);await validate(bundle,world);await write(path.join(root,'candidate.json'),{revision,formalWrite:false,...bundle});return{world,bundle};}
export async function review(){
 const {world,bundle}=await prepare(),ledger=await read(path.join(budgetRoot,'budget.json'));
 const allocation={cardId:'T91',waveLimitYuan:20,incrementLimitYuan:7,maxRequests:120,startingSpentYuan:ledger.spentYuan,startingReservedYuan:ledger.reservedYuan};
 const result=await runContentPipeline({entries:bundle.entries,root,budgetRoot,client:new DeepSeekClient({logFile:path.join(root,'usage.jsonl')}),cardId:'T91',allocation,revision,concurrency:1,batchSize:33,reuseFrozenDrafts:true,reviewDraftFor:e=>e.draft,buildDraftRequest:()=>{throw Error('T91禁止模型起草');},contextFor:e=>reviewContext(e,bundle,world),validateDraft:(draft,e)=>({errors:hashContent(draft)===hashContent(e.draft)?[]:['固定作者稿不符'],warnings:[]}),buildReviewRequest:(e,d,c)=>{const request=defaultReviewRequest({id:e.id,kind:e.kind,source:e.source},d,c);request.max_tokens=1600;request.messages[0].content+=' 本卡作者有权为原短名册创作完整人物。authoredDesign为手工设计的新日程、意向、性格和交谈规则，不是旧档事实推断。核对原名册保留、建筑时段、钱物数值、知识与私密边界、派生叙述及双方事件是否与明确素材相反。不能因为旧名册没有写过新稿事实就报无依据，也不将职业日常描写当作新引擎能力；没有明确相反事实不报矛盾。 expressedPositions按id标明各自公开意见，持有提议不等于已约定。自己的家务目标与当前关切可以并存，过去纸单问题不排除现在仍有折角问题。历史事件发生地与工作地可以不同。骨架的household是同户索引，不将共居推断为婚姻；未在knowledge中重述私人secret表示知情隔离。';return request;}});
 return{passed:result.summary.passed,manual:result.summary.manual,pending:result.summary.pending,budget:result.summary.budget.cards.T91};
}
export async function approved(world){
 world??=await loadWorld();const bundle=authorDock(world);
 // Preserve the original L2 response/fingerprint. This reference-only correction
 // removes the obsolete top-level trade ID; all reviewed biography must match.
 const reviewedEntries=await Promise.all(bundle.entries.map(async entry=>({...entry,draft:(await read(path.join(root,entry.id+'.json'))).draft})));
 const rows=await readApprovedContent(root,reviewedEntries,{revision,contextFor:e=>reviewContext(e,bundle,world)});
 assert.equal(rows.length,bundle.people.length,'仍有未通过条目');
 for(const row of rows)assert.ok(Array.isArray(row.services)&&(row.services.length===0||row.services.length===1&&row.services[0]==='trade'),'审核后仅允许移除trade伪引用');
 assert.deepEqual(rows.map(row=>({...row,services:[]})),bundle.people);await validate(bundle,world);
 const l4=await read(path.join(root,'l4.json'));assert.equal(l4.randomTen.length,10);assert.equal(new Set(l4.randomTen.map(r=>r.id)).size,10);
 for(const row of l4.randomTen){assert.ok(bundle.people.some(p=>p.id===row.id));assert.equal(row.scores.length,6);assert.ok(row.scores.every(s=>s>=3&&s<=5));assert.ok(row.note);}
 assert.ok(l4.randomTen.flatMap(r=>r.scores).reduce((a,b)=>a+b,0)/60>=4);
 return{world,bundle};
}
export async function publish(){
 const {world,bundle}=await approved(),next=integrate(world,bundle),changed=[];
 for(const [file,value] of [['baseline.json',next.npcs],['residents.json',next.residents]])if(hashContent(await read(`world/people/${file}`))!==hashContent(value)){await write(`world/people/${file}`,value);changed.push(file);}
 const ledger=await read(path.join(budgetRoot,'budget.json')),result={ids:bundle.people.map(p=>p.id),changed,sharedEvents:bundle.events.length,calls:Object.values(ledger.requests).filter(r=>r.card==='T91'&&!['reserved','cancelled-unissued'].includes(r.status)).length,...ledger.cards.T91};
 await write(path.join(root,'published.json'),result);return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const command=process.argv[2]??'prepare';if(command==='prepare'){const {bundle}=await prepare();console.log(JSON.stringify({people:bundle.people.length,events:bundle.events.length,modelCalls:0}));}else if(command==='review')console.log(JSON.stringify(await review()));else if(command==='publish')console.log(JSON.stringify(await publish()));else throw Error('命令须为prepare/review/publish');}
