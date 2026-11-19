// T92: locally authored biographies; DeepSeek is used only for factual L2.
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

export const revision='t92-market-1';
export const root=path.resolve('world/drafts/w1/baishi-market');
export const budgetRoot=path.resolve('world/drafts/w1');
const read=f=>fs.readFile(f,'utf8').then(JSON.parse);
export async function write(f,v){await fs.mkdir(path.dirname(f),{recursive:true});const temp=`${f}.${process.pid}.tmp`;await fs.writeFile(temp,JSON.stringify(v,null,2)+'\n');await fs.rename(temp,f);}

// Witnessed discussions do not grant appointment or approval.
const incidents=[
 ['候窗与摊布','bld_bs_office','去年春末，三人在公署前厅等候递纸，发现摊布遮住事项板下行，白澄收回摊布后大家读清递件时段；如何摆布尚未谈定。','想留一条能看清事项板的候件线','想摊布不再沾前厅泥水','希望散更后早点回家接手照护'],
 ['洗晒工日','bld_bs_watch','去年入冬前，三人在巡值房前厅对照各自的空闲纸条，确认一张把午前写成午后，各自修正自己的纸条；没有排定新的值更或洗晒工日。','想洗晒交件提前报明钟点','交更前要问同户能否照护','希望收布时不再等一整晚'],
 ['姓名与锅火','bld_bs_office','去年秋天，三人在公署前厅读一张姓名相近的递件纸，潘绵指出姓氏末笔的区别，马绵取回自己的纸件重新辨认；未更改户籍或收取费用。','希望递纸人先念一遍姓名','先辨清姓名再回铺照看锅火','想把同户索引和称呼分开抄'],
 ['摊位石沿','bld_bs_market','去年夏末，三人在南市棚用空篮试走石沿旁窄道，发现篮把手伸进路中，龚绵挪回篮子；摊位边界和以后的摆法仍未议定。','想把摆篮范围写在递件说明里','留一条收工后能抬布回家的道','希望按人行宽度试摆再递意见'],
 ['遮雨与回执','bld_bs_hall','去年雨季，三人在街议厅展开淋湿的自用纸条晾干，杜绵读出自己的时辰，汤澄解释棚布漏雨位置；只陈述意见，没有形成维修委托。','愿先把棚布漏处说给工程递件人','想核清巡更交班时辰','希望洗晒布有干处可收'],
 ['午饭与住址','bld_bs_office','去年冬天，三人在公署前厅对照自用的家门标记纸条，于澄发现方位字抄反了，划掉后重写；没有改动登记住址。','想在午饭前完成失物接报','回家做饭前要留出认字时间','愿先对照门牌再抄住址'],
 ['工日留白','bld_bs_hall','去年秋末，三人在街议厅读自己拟写的工日意见，蒋澄指出漏写的照护时段，于绵在自己的纸上补写家务时间；没有征发工日或代全户答应劳作。','把照护空档写清再谈工日','希望烘饼收尾以后再约议事','工程意见要分记自愿与未答应的人'],
 ['货价与税件','bld_bs_office','去年春天，三人在公署前厅分开两张贴在一起的自用纸条，段绵认出摊货标价那张，蒋绵将税务咨询纸放回自己的袖中；没有缴税、定税或出售货物。','税务询问与摊货价分开记','摊位整理不能拖到家里人等饭','提意见先说明是申请还是已有回执'],
 ['更牌与衣包','bld_bs_watch','去年冬末，三人在巡值房前厅发现衣包遮住值更板边缘，朱澄移开衣包，丁绵重新读清自己的交接时辰；没有安排他人巡更或转交衣物所有权。','巡值纸条要能在板前看清','同户衣包另放，不借值更板挂着','失物和洗晒寄放分开记'],
 ['回家照护','bld_bs_hall','去年入夏前，三人在街议厅读出各自回家照护的钟点，金澄指出其中一人漏写午饭后的一段，三人各在自己的纸上补齐；未约好新的议事时辰。','抄户籍前先确认家中照护','洗晒交接要给家里留一段空档','希望关锅火后再听公署意见'],
 ['折页索引','bld_bs_office','去年入冬前，三人在公署前厅展开折住页号的自用纸册，沈绵读清页号，孟澄逐张比对后按原顺序夹回；没有翻看案卷房档案或变更登记。','把同户索引页号写清','保留原纸次序以便复核','回家后把散纸夹牢再吃晚饭'],
];
const biographies=[
 ['同户请自己帮孩子辨门牌，自己只记号数，回家后又画出拐角让孩子认清。','陪孩子认清回家拐角','收工后与同户带孩子走一遍','担心自己忙公事时孩子总问别人','事项板这一行先露出来，递什么纸再说。','先报递件种类，再讲来意','看纸时把页角压在指下'],
 ['给同户晾布让出日照，自己的鞋到夜里还潮，后来商量错开。','把鞋与衣布分开晾干','量出午后能晒鞋的两处门边','想把最晒的角落留给自己','篮子搬回石沿，别让人拎纸绕路。','用摆放位置解释要求','会拨正篮把再回答'],
 ['收更回家时门闩太响，惊醒孩子，次日垫了废布再试。','开门不再吵醒孩子','请同户白天听一次垫布后的声音','怕孩子只记得自己回来时的响声','这更几时交，我得把家里说好。','报时清楚，家事只讲必要一句','提夜里回屋会放低嗓门'],
 ['收布时认错自家衣袖，同户指了补线后才从邻户布中挑出。','让全户都认得补线记号','饭后与同户逐件辨补线','怕认错衣物的事传到客舍柜台','看补线，先认物主再叠。','先讲能看见的衣料细节','辨衣物时将袖口翻出'],
 ['看门时急着抄更次，孩子敲两次才应声，后来把抄纸移到孩子回来以后。','把看门与抄更次分开','问同户孩子通常何时回来','不愿同户觉得自己更在意值更板','午前午后分开写，别等错了。','容易抢半句，遇时辰会重述','算时间时停一下再开口'],
 ['同户端饭时自己还盯锅火，饭凉后重热，记下以后先报收火钟点。','一家人能吃上同时端出的热饭','向同户说明当天收火早晚','担心家人已不愿等自己吃饭','名字念准我再走，锅火也等不得。','语速快，会讲等候多久','说饭点时常抿嘴停顿'],
 ['替同户描姓时末笔写短，孩子纠正后自己在废纸上另练。','把几个易混姓氏练熟','请同户挑三张旧纸对照','怕孩子看出自己有时也认不准字','这笔在下边，称呼不能顶姓名。','按笔画逐句解释','读名字时沿字迹点指尖'],
 ['自家锅柄缠布松了，收工后重绕，同户试提时仍嫌烫。','把锅柄绕到同户也能握稳','等锅凉后请同户空提','舍不得换那口旧锅','空篮能过，再看人拎东西能不能过。','说事先试走一遍','被反对时先抬抬手'],
 ['与同户夹旧纸时漏了一页，孩子在床边找到，自己逐页报数才收妥。','家中旧纸有可查的次序','饭前给散页写小号数','不想承认漏页因自己太急','递件写自己答应的，别算整户。','讲顺序，有漏项会从头核','说页数时伸指点两下'],
 ['门边篮子绊脚，挪到墙边又挡晾布，自己与同户白天试了位置。','家门口能拿篮也能收布','带空篮试走两处门边','不愿被说只会占地方','篮口退一点，收布的人也得过。','声音亮，讲距离很直率','常侧身示范通过'],
 ['取回吹落的家用纸条后发现墨晕，自己另写一份并标疑字。','湿纸条也能分清疑字','拿旧纸试写一行再沾水','怕自己的字不如孩子端正','漏在哪片棚布，递纸写得认得出。','不清楚的字会留声确认','指漏处时朝门外看'],
 ['洗晒后带错空包回家，同户认出提带的结，自己翌日还回原处。','收空包前先认提带','与同户各打一种可辨的活结','觉得越忙越容易认错包','包先分人，湿布再晾另说。','说得细，愿重复辨认过程','讲完会拉直提带'],
 ['陪孩子抄家门方位时把左右写反，同户带到门外才改清。','孩子能按门外视角认左右','与同户白天各走一次门前','怕别人以为抄户籍也这样粗心','门外看一回，纸上方位就不会倒。','用方位校对话意','说左右时转身比划'],
 ['买菜纸留在袖里没交同户，晚饭少一样，次日先放饭桌上。','饭前把买菜所需说清','早饭后将采购纸交同户确认','希望今晚不用再出去买菜','报完失物，还赶得上回家饭点。','短句报重点，家事才展开','提迟归时摸袖中纸'],
 ['给孩子缝记号时针留在饭桌，同户提醒后收进自己的布包。','针线收好再端晚饭','饭前看布包是否扎口','怕孩子学自己随手搁针','锅收了再来，别答应我一整天。','口气平常，时段划得清楚','说完界限轻点桌沿'],
 ['收家中纸册时先按大小叠，翌日找页又得重翻。','自家纸册按用途摆开','腾出半张不放碗的桌面','想有一只专放家用纸的小匣','照护那半刻写出，工日才排得实在。','慢声解释漏掉的家务','翻纸先理齐一侧'],
 ['教孩子提衣物时用重篮撞门框，随后换回轻篮。','孩子稳稳提衣物过门槛','请同户陪孩子提一次空篮','羡慕孩子学家务比自己小时候快','收完锅火再来，空档不能靠猜。','讲亲身经验','谈家务会笑后报钟点'],
 ['家门布记号褪了，自己补缝旧布，天亮看出颜色仍太浅。','阴天也能认出门前布记号','请同户白天从街口看一次','怕递件人又认错自家门','问漏处是申请，修多久另约。','来意与答应的事分句讲','递纸将封口朝向对方'],
 ['家衣和孩子衣物同晾，孩子取错尺寸，自己重分了一遍。','孩子自己找到合身衣物','把大小衣物分段晾','怕孩子嫌自己的话啰嗦','摊货价这张，别夹进税务纸。','会把相近物件分开讲','指纸留出手掌宽的间隔'],
 ['找家中旧回条只翻新纸堆，后来在布夹找到，记下放回位置。','旧回条随手可找','与同户确认固定布夹','不想找纸耽误吃饭','问税归问税，没回执别说已缴。','谨慎，先确认凭据','提回条时触摸纸边'],
 ['同户外出让自己看门，收摊布时只好带孩子走一回。','收摊和看门不再临时相撞','前夜问清同户出门时段','喜欢傍晚独自收布的安静','我收布那会家里没人，换个时辰。','直讲难处并报空档','回话前卷起垂下的袖角'],
 ['清早读更牌嗓门太响，同户隔门提醒，后来改在桌边低声读。','同户早晨多睡半刻','醒来先默看纸条','怕安静下来忘记更次','挂包别盖时辰，我读完回屋。','平声报数，争执少加修饰','报更次后再核纸角'],
 ['家中洗衣包打成死结，孩子解不开，自己回家逐扣换活结。','全户都能解开洗衣包','请孩子空手试解结','不想让人知道自己图省事','衣包我挪，值更板不挂私物。','轻声解释归属','谈结时捏住绳头'],
 ['雨夜接孩子时记错等候处，沿原路找回后说明了误认。','雨天接人有说准的位置','与同户核门廊标记','仍为让孩子等雨难堪','报失写亲见，没见过别补。','事实讲到哪里就停哪里','不确定时摊开手掌'],
 ['挪开家中晾布没报位置，同户找了一圈，自己随后用布角作记号。','全户知道晾布挪到何处','晚饭说清两处候雨角落','移布其实只为自己好走','包在旁边，我家也得找得到。','家事会讲位置细节','说位置时回头看门口'],
 ['陪孩子找练字纸时错拿旧页，孩子认墨色后自己分新旧两夹。','家中练字纸按新旧分清','请同户和孩子各认一次布夹','怕被问为何总混新旧','午饭后也写明，照护不能空着。','低声核对，很耐心','翻页后擦掉灰末'],
 ['收布晚归让同户等到饭凉，解释风未停，翌日试提前收薄布。','收薄布不耽误晚饭','看午后风势先收一小叠','不愿把最好晾处让邻户','晾到几时问明白，再说议事。','先讲天气带来的麻烦','报时辰前看天色'],
 ['挪锅盖碰响桌边，惊醒午睡孩子，自己随后放轻动作。','晚饭准备不惊醒午睡孩子','请同户试两处放锅盖的地方','想饭前有不被唤去帮忙的空闲','关了锅火再听，别漏照护那段。','先报手上未做完的事','被催会慢吸一口气'],
 ['描家中索引漏写页号，饭后逐页重新标了。','家中散页夹牢又查得快','先给常用三页写号','不喜欢别人看家里的乱纸','页号露外面，折回去也能查。','按次序铺开话意','看散页先叠齐下角'],
 ['提水时湿袖压到旧纸，自己展开晾到翌日才按原序夹回。','提水后不碰家用纸','门边备擦袖旧布','舍不得扔那几页皱纸','原页次序留着，再逐张核。','慢声谈原件','指问题会留手不碰纸'],
 ['答应按交更钟点回家照护，却没算收尾路程，孩子多等了一刻。','回家答应的时刻算上路程','门前试走一次散更归途','怕同户已不信自己钟点','约哪一更讲清，回家路也算。','先认自己估错的部分','报回程比路的方向'],
 ['陪孩子夹旧纸用力太大弄皱边角，压平后重新夹松。','孩子自己夹好纸册','与同户试两种布夹松紧','怕孩子只记得自己的急脾气','同户页别并掉，分清谁的索引。','短句复述索引','说纸夹先看自己的手'],
 ['晚饭前坚持理完旧纸，同户只能把饭放膝上，自己后来提前腾桌。','晚饭桌面按时空出','饭前只夹要用的一叠','盼有不用与饭碗共用的书桌','按原序夹，我回家也得先空桌。','语气稳，要求有具体时辰','提桌面按住纸边'],
];
export const responsibilities=[
 ['npc_bs_031_1','镇务递件协调','bld_bs_office','将任职与公事来件按事项登记并约请责任人，保存原件；不代签、不任命。'],
 ['npc_bs_031_2','巡更交接协调','bld_bs_watch','核对交接人、巡段和更次，接治安报失并保留原话；不定罪，不代排同户照护。'],
 ['npc_bs_032_1','夜更缺岗记录','bld_bs_watch','登记迟到与缺岗说明，交原责任人核实；不私设罚金。'],
 ['npc_bs_032_2','住址户籍核对','bld_bs_office','对照门牌与住址来件，保存身份争议原件待核，不凭称呼改籍。'],
 ['npc_bs_033_1','同户索引抄录','bld_bs_office','逐人抄录同户索引，保留独立身份与钱物，登记不认定婚姻或产权。'],
 ['npc_bs_033_2','工程申请递件','bld_bs_office','收录棚布、街道与排水工程申请，记清位置、申请人和待核项目；不批准施工或支出。'],
 ['npc_bs_034_1','市集摊位申请递件','bld_bs_office','记录摊位申请的摆放范围与争议，约请摊位整理者说明；不授予占地权。'],
 ['npc_bs_034_2','街面通道接报','bld_bs_watch','记录市集堵道地点与目击者，供巡值交接核实；不没收摊货。'],
 ['npc_bs_035_1','失物接报','bld_bs_watch','分记报失人、物品特征与发现时地，领回须经原物主核认；登记不当作确权。'],
 ['npc_bs_035_2','迁居来件抄录','bld_bs_office','抄存迁居申请的原住址与拟住址，未核准前保留旧籍；不补写租债。'],
 ['npc_bs_036_1','工日意见索引','bld_bs_office','按个人整理工日与照护时段意见，标明自愿、未答应及待核，不替全户同意征工。'],
 ['npc_bs_036_2','工程意见转递','bld_bs_office','将工程申请的街议意见交回申请递件人，注明各方意见与待约时辰；不发施工委托。'],
 ['npc_bs_037_1','税务咨询递件','bld_bs_office','记录税务问题、原凭据与查询去向，税章和公库未接入前不定税、不收税、不出缴讫回执。'],
 ['npc_bs_037_2','值更板抄记','bld_bs_watch','抄记本人已核清的时辰，遮挡先请物主持有人移开；不擅改他人更次。'],
 ['npc_bs_038_1','报失见证联络','bld_bs_watch','联系报失见证人，分记亲见与转述；定罪移交既有司法流程。'],
 ['npc_bs_038_2','户籍原件索引','bld_bs_office','核对来件页号与原件次序，案卷房由保管人带入；抄录不开放档案。'],
 ['npc_bs_039_1','同户变动复核','bld_bs_office','逐人比对变动申请索引，保留待核部分与原登记；不替未成年人的家户决定照护。'],
];
const workplaceFor=p=>({'户籍抄录':'bld_bs_office','公署递件':'bld_bs_office','巡更交接':'bld_bs_watch','麦饼烘制':'bld_bs_oven','摊位整理':'bld_bs_market','客舍洗晒':'bld_bs_inn'})[p.occupation];
const dutyFor=p=>responsibilities.find(r=>r[0]===p.id)?.[3]??({'麦饼烘制':'说明本人烘制的收尾时段，前厅可询价，内灶须店主许可；不凭职业生成麦饼库存。','摊位整理':'与摊主逐处核对石沿与通道摆放，冲突交摊位申请递件人记录；不替摊主出售货物或确立占地权。','客舍洗晒':'辨认物主衣包与洗晒交接时段，寄放衣物须物主许可；不替店主分配客房。'})[p.occupation];
export function authorMarket(world){
 const bones=baishiSkeleton(world),office=bones.residents.filter(p=>p.age>=18&&Number(p.householdId.slice(-3))>=31&&Number(p.householdId.slice(-3))<=45).slice(0,17),market=bones.residents.filter(p=>p.age>=18&&Number(p.householdId.slice(-3))>=46&&Number(p.householdId.slice(-3))<=60).slice(0,16);
 const sources=office.flatMap((p,i)=>market[i]?[p,market[i]]:[p]);assert.equal(sources.length,33);
 const events=incidents.map(([title,location,event,...positions],i)=>({id:`memory_t92_${i+1}`,title,location,event,actors:sources.slice(i*3,i*3+3).map(p=>p.id),positions}));
 const people=sources.map((p,i)=>{
  const [family,wish,step,secret,speech,register,habit]=biographies[i],event=events[Math.floor(i/3)],pos=i%3,peers=sources.slice(Math.floor(i/3)*3,Math.floor(i/3)*3+3).filter(x=>x.id!==p.id),familyId=p.household.find(id=>id!==bones.yan.id&&!peers.some(x=>x.id===id)),familyMember=bones.residents.find(x=>x.id===familyId)??bones.yan;
  const duty=dutyFor(p);const coins=18+i%9,inventory={[i%2?'item_wood':'item_flax_cord']:1},workplace=workplaceFor(p);
  const end=Math.min(1080,world.locations.find(l=>l.id===workplace).openHours[1]);const day=[{start:0,end:420,location:p.home.location,activity:'睡眠',services:[]},{start:420,end:480,location:p.home.location,activity:'用早饭、商量家中安排',services:[]},{start:480,end:720,location:workplace,activity:p.occupation,services:['trade']},{start:720,end:780,location:p.home.location,activity:'回家午饭',services:[]},{start:780,end,location:workplace,activity:p.occupation,services:['trade']},{start:end,end:1200,location:p.home.location,activity:'家中起居与整理个人物件',services:[]},{start:1200,end:1440,location:p.home.location,activity:'晚饭与休息',services:[]}];
  const goal=(term,content,steps,deadlineDay)=>[{id:`goal_t92_${i+1}_${term}`,content,progress:0,deadlineDay,resources:[{kind:'协商',description:'须当事人另行确认的空闲时辰',availability:'unverified',grantsInventory:false}],steps:steps.map(content=>({content,status:'pending'}))}];
  const relations=peers.map((other,j)=>({with:other.id,type:'街务往来',trust:8+pos*3,affection:0,note:`记得与${other.name}在场时的事：${event.event}${j===0?`${p.name}${event.positions[pos]}，而${other.name}${event.positions[sources.indexOf(other)%3]}。`:`记得${other.name}在${world.locations.find(l=>l.id===event.location).name}与自己一起经历过${event.title}；${other.name}${event.positions[sources.indexOf(other)%3]}，${p.name}${event.positions[pos]}。`}`}));
  relations.push({with:familyMember.id,type:'同户共居',trust:18,affection:6,note:`${p.name}记得与${familyMember.name}共居时的事：${family}`});
  return{...structuredClone(p),tier:'full',trust:0,affection:0,coins,inventory,skills:[],services:[],intelligence:{level:2,growth:0},birth:{year:-p.age,month:3+i%9,day:2+i%25},familyNotes:`${p.name}与${p.household.map(id=>id===bones.yan.id?'严辙':bones.residents.find(x=>x.id===id).name).join('、')}共居。${family}`,appearance:[p.visibleFeature,'外衣下摆有一道晒浅的折痕',i%2?'袖里收着一张折窄的旧纸':'提篮的把手用旧布缠过'],voice:{register,accent:'河谷日常口音',habits:[habit],samples:[speech,`${wish}，我准备${step}。`,`${event.positions[pos]}，这事下次见面还得说清。`]},personality:{traits:p.traits,values:[wish,'约好的事要报明变动'],flaws:[secret]},proficiencies:{},professions:[],level:1,combat:null,wealth:{cashRange:[coins,coins],property:[],valuables:[],debts:[]},home:{...p.home,ownership:'unspecified'},workplace:{location:workplace,access:'营业时在前厅招呼；内室与器具另问保管人。'},schedule:{default:day,market:structuredClone(day),rest:[{start:0,end:480,location:p.home.location,activity:'休息',services:[]},{start:480,end:1200,location:p.home.location,activity:'家中照护与休息',services:[]},{start:1200,end:1440,location:p.home.location,activity:'晚饭与睡眠',services:[]}],restDays:[10,20,30]},relationships:relations,memorySeeds:[{id:event.id,event:`${event.actors.map(id=>sources.find(x=>x.id===id).name).join('、')}一起经历：${event.event}`,location:event.location,salience:4,knownBy:event.actors,reliability:'亲历'},{id:`memory_t92_private_${i+1}`,event:family,salience:3,knownBy:[p.id],reliability:'个人回忆'}],goals:{short:goal('short',wish,[step],30),mid:goal('mid',`与同户找到家务和${p.occupation}都能照看的时辰`,[`请${familyMember.name}说出最需要自己在家的时段`,'把有冲突的约见另约到双方空闲时'],180),long:goal('long',`让${event.title}引起的分歧有一个能维持的办法`,[`向${peers[0].name}说明：${event.positions[pos]}`,`听取${peers[1].name}的顾虑后提出一回小范围试做`],720)},fears:[`怕${wish}一再因临时工作搁下`],redLines:['自己的物件须自己点头才能拿走','不替同户答应照护和出门时辰'],secrets:[{content:secret,knownBy:[p.id]}],knowledge:{known:[{fact:event.event,source:event.actors[0],reliability:'当时在场亲历'},{fact:family,source:p.id,reliability:'个人亲历'},{fact:`${world.locations.find(l=>l.id===workplace).name}是自己日常做${p.occupation}的地方，前厅开放时间为${world.locations.find(l=>l.id===workplace).openHours.map(m=>m/60).join('至')}时。`,source:workplace,reliability:'日常出入与门前告示'}],unknown:[`${familyMember.name}下次何时能留在家里看门？`,`${peers[0].name}是否愿意试做自己提出的${event.title}办法？`]},opinions:{factions:'公署保存原件并听各方说明，任命、税章与裁决仍须按正式权限办理。',magic:'若要用法术搬动东西，想先看会不会碰坏物件。',adventurers:'外来的帮手若把钟点说明白，愿意先谈一件小事。',neighbors:peers.map(x=>({with:x.id,view:`记得一起处理过${event.title}，具体安排还需要听${x.name}说。`}))},towardPlayer:{baseline:{trust:0,affection:0},raises:['按说好的钟点到场','借物先征询'],lowers:['让家人久等却不报变动','擅拿私人物件'],attitude:'初见先在前厅说明来意，愿谈自己手边的闲置物件。'},behaviorRules:{bargaining:'只出售本人愿卖的一件闲置物，价钱按当次报价谈。',honesty:'记得的说清楚，读不准的姓名会请对方复述。',risk:'未核原件与当事人来意时保留待核，不把提议写成决定。',threatResponse:'退到附近公开前厅寻人作证。',bribeResponse:'不因好处替人签字、改籍或免税。'},serviceCatalog:[{kind:'trade',what:'本人闲置库存',price:{mode:'engineQuote'},unlocksService:false}],hooks:[wish,event.positions[pos]],ttsVoice:p.sex==='女'?'zh_female_resident_01':'zh_male_resident_01',portraitPrompt:`原创河谷成年居民${p.name}，${p.age}岁，${p.visibleFeature}，朴素衣着，${p.occupation}`,notes:`职责：${duty}${p.currentConcern}${event.positions[pos]}。`,description:`${p.name}是白石镇的${p.occupation}住户，${p.age}岁。${p.visibleFeature}职责是${duty}${family}${wish}是近来惦记的事，说话时${habit}。遇到${event.title}的讨论，${event.positions[pos]}。`};
 });
 for(const person of people)person.schedule.seasonal={};
 const entries=people.map((draft,i)=>({id:draft.id,kind:'npc',source:sources[i],draft}));
 return{sources,people,events,entries};
}

// T92 reviewed the frozen skeleton governance and workplaces; A3 authority/lockup have separate receipts.
export function reviewContext(entry,bundle,world){
 const i=bundle.sources.findIndex(p=>p.id===entry.id),event=bundle.events[Math.floor(i/3)];
 const bones=baishiSkeleton(world),all=new Map([...bones.residents,bones.yan].map(p=>[p.id,p]));
 const authorDesign=Object.fromEntries(['appearance','voice','personality','home','workplace','schedule','proficiencies','professions','level','combat','goals','fears','redLines','opinions','towardPlayer','behaviorRules','serviceCatalog','hooks'].map(k=>[k,entry.draft[k]]));
 return{authoredResponsibility:{role:responsibilities.find(r=>r[0]===entry.id)?.[1]??entry.source.occupation,duty:dutyFor(entry.source),authority:'工作分工不授予任命、审批、征税、执法或公库权限'},governance:bones.profile.details.governance,originalRoster:bundle.sources[i],authoredBiography:{familyEpisode:biographies[i][0],familyWith:entry.draft.relationships.at(-1).with,privateWish:biographies[i][1],wishAction:biographies[i][2],unsharedThought:biographies[i][3]},authoredDesign:authorDesign,authoredEvent:{...event,expressedPositions:event.actors.map((id,j)=>({id,name:all.get(id).name,proposal:event.positions[j],knownBy:event.actors})),state:"三人当时公开表达各自意见，未达成共同约定。"},townName:world.locations.find(l=>l.id==="loc_bs").name,participants:bundle.sources.filter(p=>event.actors.includes(p.id)),household:world.households.find(h=>h.id===entry.source.householdId),cohabitants:entry.source.household.map(id=>all.get(id)).map(p=>({id:p.id,name:p.name,age:p.age})),workplaces:bones.locations.filter(l=>[event.location,entry.draft.workplace.location].includes(l.id)),authorHoldings:{coins:entry.draft.coins,inventory:entry.draft.inventory,ownership:'个人初始零用钱与一件闲置物；不是公库、雇佣付款或货栈代管货物。'},limits:'T92作者设计新生活往事、私人目标、外貌和说话习惯；不把相容的新人物事实误判为缺少旧史依据。T90原名册事实必须保留。共享事件与意见须相容，提议仍未决定；私下想法仅本人知晓。职业与职责不授予教学、修理、任命、工程审批、征税、执法或公库能力，仅复用既有库存trade；不添加债务、产权或公共库存。'};
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
export async function prepare(world){world??=await loadWorld();const bundle=authorMarket(world);await validate(bundle,world);await write(path.join(root,'candidate.json'),{revision,formalWrite:false,...bundle});return{world,bundle};}
export async function review(){
 const {world,bundle}=await prepare(),ledger=await read(path.join(budgetRoot,'budget.json'));
 const allocation={cardId:'T92',waveLimitYuan:20,incrementLimitYuan:7,maxRequests:120,startingSpentYuan:ledger.spentYuan,startingReservedYuan:ledger.reservedYuan};
 const result=await runContentPipeline({entries:bundle.entries,root,budgetRoot,client:new DeepSeekClient({logFile:path.join(root,'usage.jsonl')}),cardId:'T92',allocation,revision,concurrency:1,batchSize:33,retryManual:true,reuseFrozenDrafts:true,reviewDraftFor:e=>e.draft,buildDraftRequest:()=>{throw Error('T92禁止模型起草');},contextFor:e=>reviewContext(e,bundle,world),validateDraft:(draft,e)=>({errors:hashContent(draft)===hashContent(e.draft)?[]:['固定作者稿不符'],warnings:[]}),buildReviewRequest:(e,d,c)=>{const request=defaultReviewRequest({id:e.id,kind:e.kind,source:e.source},d,c);request.max_tokens=1600;request.messages[0].content+=' 本卡作者有权为原短名册创作完整人物。authoredDesign为手工设计的新日程、意向、性格和交谈规则，不是旧档事实推断。核对原名册保留、建筑时段、钱物数值、知识与私密边界、派生叙述及双方事件是否与明确素材相反。不能因为旧名册没有写过新稿事实就报无依据，也不将职业日常描写当作新引擎能力；没有明确相反事实不报矛盾。 expressedPositions按id标明各自公开意见，持有提议不等于已约定。自己的家务目标与当前关切可以并存，过去纸单问题不排除现在仍有折角问题。历史事件发生地与工作地可以不同。骨架的household是同户索引，不将共居推断为婚姻；未在knowledge中重述私人secret表示知情隔离。';return request;}});
 return{passed:result.summary.passed,manual:result.summary.manual,pending:result.summary.pending,budget:result.summary.budget.cards.T92};
}
export async function approved(world){
 world??=await loadWorld();const bundle=authorMarket(world);
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
 const ledger=await read(path.join(budgetRoot,'budget.json')),result={ids:bundle.people.map(p=>p.id),changed,sharedEvents:bundle.events.length,calls:Object.values(ledger.requests).filter(r=>r.card==='T92'&&!['reserved','cancelled-unissued'].includes(r.status)).length,...ledger.cards.T92};
 await write(path.join(root,'published.json'),result);return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const command=process.argv[2]??'prepare';if(command==='prepare'){const {bundle}=await prepare();console.log(JSON.stringify({people:bundle.people.length,events:bundle.events.length,modelCalls:0}));}else if(command==='review')console.log(JSON.stringify(await review()));else if(command==='publish')console.log(JSON.stringify(await publish()));else throw Error('命令须为prepare/review/publish');}
