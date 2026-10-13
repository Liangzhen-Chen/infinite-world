import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {hashContent} from '../../../../tools/content-pipeline.mjs';
import {prepareDepthRevision} from '../../../../tools/npc-depth.mjs';
import {recordDepthIncrementalL4} from '../../../../tools/npc-depth-review.mjs';
import {depthBackgroundSources} from '../../../../tools/npc-depth-content.mjs';
import {currentOptions,root,out} from './complete-003b.mjs';

const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
const write=(name,value)=>fs.writeFile(path.join(out,name),JSON.stringify(value,null,2)+'\n');
// Notes were written after reading the actual final profiles and independent
// sources in this execution session. No model or synthesized pass is used.
const readings={
 npc_sb_zhangluo:'换工改错、缺席户补说均有原亲历；公开谈话只说明轮次分歧，逐户重问和照护询问仍pending，未替熟户公开优先空格。家属关切仅作关系来由。',
 npc_sb_yuanqing:'西晒树影与枯枝来自旧记忆；先理枝是有限发言，不等于邻户同意修枝。舍不得斜枝仍仅本人秘密，物主决定的修法尚待询问。',
 npc_sb_zhonglan:'拆看潮叶与说明里层湿有原记忆；田陌的休息要求不构成分拣交付。三条亲属备注按原性别与关切核过，潮叶放到底层的秘密未写进共享事。',
 npc_sb_tianmo:'夹梗退料和赌输补清来自原记忆；知钟岚要求分清叶料，不知其未说出的具体交接标准。粗分与另约细拣仍待物主确认，未新增赌约或已付工钱。',
 npc_sb_zhenyun:'掌心看壳、亮处辨破口与请后辈重排记号连贯；窗边与原签的先后未定。家属对眼花的原关切没有写入顾露共享知识，未以公开需要亮处推断秘密。',
 npc_sb_gulu:'并排原记号、收回未确认口头答应有旧记忆；冷淡问晒物的说话方式与熟脸说情分歧相容。亮处只是待协调，不确认空架归属或公开曾偏帮熟人的秘密。',
 npc_sb_yexun:'缺口与自己浅划痕分别有来源；共享只讨论留样木屑和过道。标缺口、读记录与旧物归属核对均仍pending，未挪私屑或取得共灶全体许可。',
 npc_sb_zhuchai:'生熟容器重摆和解释抢活来自旧事；给帮工保留自做工序是未来步骤。只知样屑占过道，未知哪份仍需比对；台下空盆未转入叶荀知识。',
 npc_sb_panyao:'对光磨薄衣纹与无法保证不裂的说明有亲历；安静数针和摇架避让未定。私人拆线未透露，高枢异响未被写成已找到原因。',
 npc_sb_gaoshu:'空架摇查与改口未定响源一致；步骤明确确定与未查明分开，未写成完成修架。家属总要重看的关切可溯原档，秘密中的虚报结论未给潘瑶。',
 npc_sb_zhouwei:'移遮眼架与旧地名争论有原经历；门前可见路人与晾线避行的需求相冲突，位置未定。试坐、熟邻来往仍待行动，未替老人决定坐处。',
 npc_sb_congsi:'回松练习束与慢演收尾有旧事；拆自家线不授权碰他人线。晾线位置待商量，紧松学习仍pending，未把熟手意见或周薇私心当成已知。',
 npc_sb_maoli:'雨后积叶和清回叶泥来自本人旧记忆；空架暂放并未定。共看来源与问可用工时不安排邻户劳动，推叶泥的私事未进入解安共享记忆。',
 npc_sb_jiean:'架脚磨痕与停手重问用法相连；语句短和被催沉默可辨。暂放空架与清沟位置未定，所有物主与使用者确认仍pending，未把昔日没问就修告诉茅俪。',
 npc_sb_baishu:'布色猜测被问与澄清没亲见均有原事；未知谁仍误听准信没有断言答案。晒布搬架宽度未定，未公开不知道最先是谁提家事的秘密。',
 npc_sb_luwei:'换抬位和被指出挑轻头有原经历；估拐弯的语气与省力倾向相符。尚需搭工者同意轮肩，未把不平路段已留给别人写进白舒知识。',
 npc_sb_shikui:'逐句复述与补清理工序有旧事；帮忙的实际范围仍待当事人确认。公共桌争用不准挪私契，孔柳不知省略口述的私事，未声称新约已签。',
 npc_sb_kongliu:'废纸转角试描与请缝补者指出错处有亲历；问试样不赋新技能。摊平纸样与原契分用未定，描倒方向的私样未公开给史葵。',
 npc_sb_feiqing:'松横档试摇和劝人放梯有旧事；物主在场且同意后标记是待执行。借坏梯与修复未发生，自己图近踩梯没有写入商筠知识。',
 npc_sb_shangyun:'分晾褪记袋与告知认错可能有旧事；认记仍由物主确认。低处晾位需另询许可，停梯不等于取得新晾架，熟户误分的秘密不公开。',
 npc_sb_chishan:'known与共享memory明确逐句归给池杉和查悦，原publicSpeech独立授权且hash保留；仅两人知候灶位置未定，不知对方熟户少算时段。护根与绕路目标仍pending。',
 npc_sb_chayue:'清台补登记由原memorySeeds[1]支持；未知树根受踩处与两户实际时段没有断言答案。语域翻旧错有原notes和样例，三步仍pending。关系备注删边界文字没有变更财物、secrets或私宅权限；共享只听到两句原公开说话，池杉绕根的秘密未获知。',
 npc_sb_qinwan:'袖口手势与拒亲属插队有旧事，先后核对仍pending。与龙芙只在公共路相互招呼，不涉及物主时段、职业或育苗私事；这轮全部叶子与原通过档相同。',
 npc_sb_longfu:'湿布known来自原memorySeeds[1]，招呼来自独立shared_12；语域恢复指叶背再谈土。龙瑜搓泥搬盘与雷思门槛等话都可溯原currentConcern，删除不耐烦推断；未知仍是未知答案，避溅步骤均pending，秦婉共享叶未变。',
 npc_sb_zhuxian:'翻板重分和找实际搬动者道歉有旧事；家属关切按独立来源核过。公共招呼不透露误骂孩子或木板物主，暂放边界仍待搬动者选择。',
 npc_sb_fuyu:'霉叶分拣与留念小包来自原记忆，known补登不凭空造事。自家未来挑留仍pending；诸弦只知公共招呼，不知旧叶用途，老人轻活取舍没有交给家人代决。',
 npc_sb_quanli:'退回公路与园外重画记号有亲历；指路不等于私园许可，整理标记先问园主。与晏珏仅招呼，未交换旧签或枝路权限，误指私园边仍私有。',
 npc_sb_yanjue:'原写者重读与留空格有旧事，具体未知没有猜答案。确认一字仍找原写者，不擅改名；与全立仅招呼，补猜偏旁秘密没有共享。',
 npc_sb_xianghe:'派重活被拒和后来问空闲有旧事，安排前逐人确认仍pending。与邸叶招呼未变成对其家务许可，邻人休息排值日的秘密保留本人。',
 npc_sb_diye:'挑鞋底断篾和被叫回清地有原经历；收尾检查不代表已完成当前工位清扫。公共招呼没有要求向荷或其同住者接受工作，躲收尾旧事没有公开。'
};
const eventNotes=[
 '轮次与先理枝均在原公开说话内；重排与逐户同意仍未定，优先空格和舍不得斜枝排除。',
 '分清叶料与想休息有双方有限发言；粗分细拣界线未定，潮叶藏底和赌约私事排除。',
 '辨壳亮处与原签摊开都是公开需要；眼力退与熟户口头答应没有互相透露。',
 '样屑比对与灶口过道有独立来源；收纳和清理时点未定，划痕改口与藏盆排除。',
 '安静数针与摇架异响均只表需要；未找到响源或避让时段，拆线与虚报原因排除。',
 '看路视线与线束避行均为公开需求；未搬私物或替老人选坐处，留路人和弄乱线排除。',
 '雨前清沟与平整检架发生过交流；未定暂放处或挪石架，推叶泥和未经询问开修排除。',
 '晾布怕碰与转弯要宽处是有限发言；过道宽度未定，闲话来源与挑不平路私事排除。',
 '分户原契与摊平纸样只谈空间；未授权挪契或新技能，省口述与反向私样排除。',
 '疑梯停用与另找晾袋位只表公开需求；无借梯修复或占晾架，自己踩梯及误认熟户排除。',
 '新文字逐句标池杉说与查悦说，内容完全来自原publicSpeech；站位仍未定，绕根不认难走和熟户少算清台排除。',
 '秦婉龙芙只公共路招呼，未交换物主时段、职业育苗或家事；插活退回与搭湿布秘密排除。',
 '诸弦扶瑜只公共路招呼，未讨论物主或旧叶留念；误骂道歉与没用小包秘密排除。',
 '全立晏珏只公共路招呼，不许入私园或读旧签；误指路与补猜偏旁排除。',
 '向荷邸叶只公共路招呼，没有派值日、换工或借物；休息日安排和躲收尾排除。'
];
const dimensions=['具体性','独特性','内在一致性','与世界的连接','可玩性','说话方式辨识度'];
// Six ratings per fixed random sample, with the actual text and reason read.
const ratings={
 npc_sb_zhuchai:[[4,4,4,5,4,4],['把生熟两边的盆筐分开','这菜我来吧，你捏半天了。','先问帮工手上做到哪一步','留样木屑与入灶过道','请帮工选择愿做的一步','你先把手上的盆放下'],['生熟盆筐和腾地方的动作具体。','抢活的急性子与帮工不再来构成个人弱点。','原抢活经历和未来让对方做完相容。','灶口卫生与修梭样屑产生明确跨工序冲突。','帮工可选择工序，玩家有具体协商入口。','短促指令围绕盆和灶位，有行业措辞。']],
 npc_sb_xianghe:[[4,4,5,3,4,4],['她愣在灶边，手里的柴没放下','先列眼下谁在家','原来被拒的安排不再当作同意','只相互招呼，没有商定工事','再议无人愿做的重活','这活我替你排好了'],['被拒时持柴停住的细节支撑家庭场景。','热心却越过同住者选择的缺点可辨。','承认被拒与逐人询问步骤前后相连。','合住冲突清楚，跨户共享仅招呼，连接普通。','无人愿做的重活留下可协商的具体问题。','强势安排与后来先问能担多少形成可辨语气。']],
 npc_sb_chayue:[[5,4,5,5,4,5],['清台也算时段，光开火不算完','不守次序便当众揭旧错','后来她把清台那段也补进了记录里','候灶的人要能听见叫名','读回包含清台的候选时段','上次约到哪？先说这个'],['把清台计入使用时段是精确操作细节。','按册记次却揭旧错的做法具有个人矛盾。','known补登、原清台记忆与未定时段相容。','候灶站位同时牵动护根和灶台秩序。','双方起止点可通过读回记录继续协商。','追问上次约定和重复清台规则形成鲜明口头习惯。']],
 npc_sb_fuyu:[[4,4,5,3,4,4],['这片边上软了','这包先别动','后来有一包叶子她没舍得处理','只相互招呼，没有商定工事','让自己先挑留念的旧叶','先放那儿，等我挑完这一把再说'],['叶边软、霉点和小包留下的动作清楚。','坚持挑旧叶的老人有取舍，仍属常见恋旧主题。','原留念经历与未来辨霉和自主轻活一致。','家中关系具体，对诸弦的共享交流尚浅。','先辨变质再议保留小包可形成实际对话。','温和拖延但坚持亲挑的语句稳定。']],
 npc_sb_luwei:[[5,4,5,4,4,4],['先估要拐几次弯','他笑笑岔开，没有接话','被同伴指出过总挑轻头','搬架过道','标出路不平和需要换肩的位置','今天肩膀有点僵'],['拐弯、路不平和轻重抬位具体可见。','爽快接活与挑轻头并存，个人弱点可辨。','旧回避回答与未来重议承担路段连贯。','搬架宽度与晾布边相冲突，关联村路使用。','实走路线与确认轮肩提供明确行动入口。','估路线和以肩僵求换位的措辞符合短工。']],
 npc_sb_gaoshu:[[5,4,5,4,4,4],['等空机时逐处摇查接合','未亲查的结论总要反复追问','把先前含糊的地方改回未定','摇架检看异响','把确定的松动和仍未查明的响源分开说明','那我再走一趟'],['空机逐处摇查与响源分类有具体工艺动作。','不信别人看过的固执与谨慎相互牵制。','原改口未定与新记录确知未知相容。','摇架噪声与潘瑶数针工序直接冲突。','使用者说法可与空机检看结果核对。','反复重看与问谁在用的语句稳定。']],
 npc_sb_jiean:[[4,4,4,5,4,5],['对着架脚磨痕比过位置','被催促时常沉默停住','请物主把湿盆怎么用、靠哪边放重说一遍','清沟与空架暂放','空架时请使用者指摆盆方向','这盆原先靠哪边放的？'],['架脚磨痕和湿盆方向支撑检看场景。','以沉默抵催促的反应可与其他木工区分。','旧停手重问用法与未来请使用者指方向一致。','平整架位与雨前沟口清理构成资源冲突。','物主的实际摆盆习惯可成为玩家核对任务。','短问句、省略说明和停手的说话方式鲜明。']],
 npc_sb_zhenyun:[[5,4,4,5,4,4],['别搁桌上，我看壳边有没有缺口','新手说省事就先摇头','旧记号乱过一次，她请后辈帮忙重排','窗边亮处的使用','请后辈说出两只近重旧壳的缺口差异','先放我掌心里'],['掌心辨破口而非只看重量体现具体判别。','耐心教后辈与拒绝省事的执拗相连。','旧记号重排与未来口述理由没有变成已教会。','窗口亮处同时服务辨壳和晒位争签。','后辈可复述差异，仍认不出就继续示范。','掌心和缺口的措辞稳定，声线较常规。']],
 npc_sb_shikui:[[5,4,5,5,4,5],['写一句读一句，不对就现在改','外乡人说得快便多追问几遍','她搁笔问明，再把这一段补在纸尾','公共桌上的原契与描样','请对方用自己的话复述劳动范围','这纸上只写了帮忙'],['写一句读一句以及纸尾补清理工序可核验。','平稳代笔与怀疑快话外乡人的缺点可辨。','旧补遗漏口述与未来核对劳动范围一致。','私有原契、公共桌和孔柳纸样形成空间冲突。','帮忙范围可让当事人复述，行动入口明确。','读回约定和逐句追问形成鲜明专业口吻。']],
 npc_sb_gulu:[[4,4,5,5,4,5],['一格一格核对','先问晒什么再问哪户','把未经确认的话收回','顾露要摊晒位原签','各问一次是否同意所读时段','晒什么？哪户的？'],['并排原签逐格核对给出了实际处理动作。','冷淡问户与熟人讲情面的弱点可辨。','原收回口头答应与当前不按熟脸分配一致。','空架争签与甄芸亮处需要直接相连。','双方原记号和时段可供当面复核。','连用短问句、拒绝未核原签有鲜明口头节奏。']]
};

export async function recordReadings(){
 const options=await currentOptions(),p=await prepareDepthRevision(options),selection=await read(path.join(out,'l4-selection.json'));
 const candidates=[];
 for(const entry of p.entries){const record=await read(path.join(root,entry.id+'.json'));assert.equal(record.status,'passed');assert.ok(readings[entry.id]);candidates.push({id:entry.id,note:readings[entry.id],draftHash:hashContent(record.draft),reviewHash:hashContent(record.review),entryHash:hashContent(entry),reviewedPaths:entry.patches.map(p=>p.path)});}
 const backgrounds=depthBackgroundSources(p.entries).map(({event,sourceHash})=>({eventId:event.id,sourceHash,eventHash:hashContent(event),note:eventNotes[Number(event.id.split('_').at(-1))-1],reviewedRiskPaths:event.risks.map(r=>`${r.id}.${r.field}`)}));
 const notes={reviewedBy:'T09 Sol execution session, actual reading 2026-10-13',selection,candidates,backgrounds};await write('l4-notes.json',notes);await write('batch-l4-notes.json',candidates);
 const samples=selection.waveSample.map(id=>{const [scores,quotes,reasons]=ratings[id];return{id,ratings:Object.fromEntries(dimensions.map((dimension,i)=>[dimension,{score:scores[i],quote:quotes[i],reason:reasons[i]}]))};});
 const values=samples.flatMap(s=>dimensions.map(d=>s.ratings[d].score)),mean=values.reduce((a,b)=>a+b,0)/values.length,minimum=Math.min(...values);
 assert.equal(samples.length,10);assert.equal(values.length,60);assert.ok(mean>=4&&minimum>=3);
 await write('wave-score.json',{selectionFile:'l4-selection.json',samples,dimensions,mean,minimum,passed:mean>=4&&minimum>=3,dimensionMeans:Object.fromEntries(dimensions.map(d=>[d,samples.reduce((n,s)=>n+s.ratings[d].score,0)/10]))});
 console.log(JSON.stringify(await recordDepthIncrementalL4({...options,l4Notes:path.join(out,'l4-notes.json')})));
}
if(process.argv[2]==='--record')await recordReadings();
