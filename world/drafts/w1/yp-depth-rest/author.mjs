import fs from 'node:fs/promises';
import {loadWorld} from '../../../../tools/load-world.mjs';
import {auditNpcDepth} from '../../../../tools/audit-npc-depth.mjs';
import {hashContent} from '../../../../tools/content-pipeline.mjs';
const root=new URL('./',import.meta.url),world=await loadWorld(),people=world.npcs.filter(n=>n.id.startsWith('npc_yp_')),issues=auditNpcDepth(world).issues;
const byId=new Map([...world.npcs,...world.residents].map(n=>[n.id,n])),places=new Map(world.locations.map(l=>[l.id,l]));
// Small author groups, anchored to local conflicts and existing household/work facts.
const batches=[['zhaofeng','qiaoduan','wenxu','jiangmi'],['hanpei','zhusheng','qinli','gaoxin'],['taozi','luxia','panju','renbo'],['caoyun','xunhe','yinrong','weichi'],['genglu','xicun','miaopu','baoyin'],['fengya','shiling','shaoruo','lingwan'],['kongfu','yucheng','qiuyan'],['tanghuan','zhangyi','lisha']];
const authored={
panju:['谈家务慢慢铺陈，谈拣菜位置会坚持坐得顺手','先把叶篮放在门内，观察窗边起风时散叶落到哪里','请同住者走过门边，指出哪处篮位会挡脚','对照当天体力安排一次拣菜时段，累了先停手','潘宁愿不愿一起查看叶篮挡住的过道','任泊希望门边歇脚石留出哪一段行走宽度'],
renbo:['路线说明用短促方位词，别人听不懂时容易不耐烦','到近路边查看被脚印压薄的松土，先标出危险段','站在安全处向经过者说明绕行方向，再听他们是否看懂','请初到坡口的人复述路线，把误认的记号记下来','潘菊是否愿意重看歇脚石与路口的距离','曹芸在雨后去果树地时会选哪条绕行路'],
caoyun:['谈枝势直接，用高低与方向解释，遇邻户意见会急着争辩','在邻户方便的午后请对方指出被遮的晒处','把自己看见的影子起止位置说给邻户，等对方核对','逐枝比较遮影与通路的影响，修剪前核实物主意愿','荀禾愿不愿换到离根边较远的歇工处','乐泉何时有空一起查看家门外的树影'],
xunhe:['熟人间口语轻快，谈工时常抢话，改口认错时反而短句多','先向追问休息时间的同伴读回原来答应的范围','开口前列出自己能接的工段，不把比试结果当新约定','收工后分别记实际劳动与歇息时段，核清自己的收入','曹芸能否接受自己绕开根边后在阴处歇脚','莫荷愿不愿听自己读回下次帮工的时段'],
yinrong:['谈麻线以手感与损耗作解释，争废线归属时逐项追问','先留下自己认得的废线，把辨不清的碎线单放待问','请同桌者指出各自收尾范围，再商量分别放置的位置','把每次揉线耗时与废线来由分开记，月底再核对','卫迟是否愿意说明绳屑和麻线尾的辨认差别','胡钧何时有空一起检查家中的绳头线尾'],
weichi:['措辞慢而具体，说明绳股受力时重复实物称呼','把发脆旧股拿到亮处，逐处翻看裂痕','先让来问的人指出要系的轻物，再比照旧股状况','征得听者同意后演示干湿绳股手感，请对方复述区别','殷茸愿不愿听自己解释旧绳股的断口','卫然何时能到门边一起查看发脆的旧股'],
genglu:['讲房基谨慎，拿不准就放慢，受催时反复解释泥地状态','在垫石边查看回水留下的湿痕，记录仍未干处','先向屋主指出想掀看的边角，等对方确认范围','雨后重看同一处回水，把新旧湿痕并列核对','席存能否替自己核清一次约工的姓名','宋荻何时愿意陪自己查看回家路上的积水'],
xicun:['登记时用完整姓名与辨认细节，怕错还便多问一遍','让两个认签人各自讲扎束特征，暂不替任何一人判归属','分别读回两人的说明，标出相合和不同的部分','请愿意帮看的居民试读簿页，保留看不清的签作核查','缪朴是否愿意说明自己送来柴束的扎口','游麟何时方便听自己读回一页登记'],
miaopu:['先看土再答话，解释株距具体，谈被踩床沿时语气生硬','沿床边找出新脚印，比较哪一段松土压得最实','向经过者指出土床外已有便道，请他们说哪里难走','记录插记被碰歪的位置，重放前对照原来株距','包印愿不愿走土床外的便道','祝莺希望自己何时收工回家吃饭'],
baoyin:['讲农具柄会先限定使用条件，谈占台和工时会反复算等待','请借台人指出当前占用范围，再问预计何时停手','停工时只拢起自己削下的木屑，请同台者认各自剩料','接活前对照自己能用的工位时段，再向来人说明','冯雅是否愿意说清一次约工的空闲时段','倪玉何时方便一起核对自己等待和做活的记时'],
fengya:['灶上询问简短，遇相撞要求会留半句话，说明未做完的事时逐项交代','分别问两名喊洗盆的人要用哪只盆，把相撞时段记下','请双方在场听完彼此要求，自己说明一次只能做哪件','接新备料活前先看自己的歇息时段，向来人说明可用时间','石苓何时有空听自己读一张家务便条','冯珈愿不愿一起查看家中未收好的盆具'],
shiling:['解释生字用家务例子，听老人说话耐心，遇认字快的人容易停顿','先问说话者想表达哪件家务，再请抄字人读回','请会写的人把误听处圈出，等原说话者确认','找愿意练习的成人各说一个难认的字，安排逐个读回','冯雅愿不愿用灶上的家务便条练习读字','石畅何时能腾出听自己读便条的工夫'],
shaoruo:['报路线先交代起点和方向，遇含糊估计会追问依据','从相同起点再走一回，分别记录顺坡和逆坡的走法','把起止位置指出给来问路的人，说明哪一趟数尚未核清','请初到者复述路线说明，记录他们在哪个转弯理解不同','凌宛是否愿意说明门外哪处湿地容易踩滑','邵莞希望自己何时清掉鞋底的泥'],
lingwan:['日常要求用短句，提醒泥水时语气紧，解释摆鞋位置会反复确认','在门外看湿鞋留下的水印，先请家人指出常踩湿处','请同住者试走门边，商量不会挡住门槛的摆鞋点','把一次收拾中重复做的部分说给家人听，再分清各人承担','邵若能否说明雨后门外一段路该怎么绕','凌梓愿不愿试走换鞋后的进门路线'],
kongfu:['搭话从洗布说起，转述消息容易连着说，澄清来源时会停下来改口','找实际听过自己转述的人，逐句指出哪些没有亲眼见','复述原先听到的话和自己添的解释，请听者分开看','再有人托话时先问可否转告，把没获准的话留在自己这里','俞澄愿不愿说明自己转述的哪句话令他不快','孔衡何时有空帮自己核清一次转述的原话'],
yucheng:['木工说明简短，开合门前先交代站位，谈工具时边界明确','等门边空出后先缓慢试开合，辨清门脚擦地处','向物主说明想查看的铰接部位，等对方同意再动手','请实际使用者说推门哪一步吃力，调整后再检看','孔馥能否说清关于门工的那句话来自谁','俞凝何时愿意听自己说明门脚擦地的原因'],
qiuyan:['抄签语气郑重，读名清楚，碰到含糊字便留白等核实','并排放原签和转抄签，标出收货人看不清的字','向送签人读回含糊位置，请其回原户问具体姓名','把原签按待核处分别留放，核清后再对照补抄','汤桓能否认出转抄签上看不清的名字','裘璐何时有空听自己读回当天待核的姓名'],
tanghuan:['讲泥墙话多，用干湿厚薄解释，收尾被提醒时答应得快','沿工处找自己落下的泥点，只清已核实属于自己的部分','收工具前再看一次过道，把散泥拢到屋主同意的位置','请用过补墙处的住户指出不整洁的收尾，逐次记改进处','裘砚何时方便核对一次约工便条上的姓名','汤茹愿不愿提醒自己出门前再核清收尾安排'],
zhangyi:['用旧农具称呼解释用途，讲不清时停顿等后辈指实物','请把两种旧具混叫的年轻人各自指出说的是哪件','把实物的柄口和工作端分开说明，问听者辨出哪些差别','将拿不准的叫法留作待问，请熟悉旧物的人另作核对','利莎能否指出换工时所说的旧具是哪一种','章采何时愿意听自己说明两个相近的叫法'],
lisha:['协调工日说得直接，先听时段，遇照护安排会放慢询问','分别问两户各自已答应的工日，找出撞在一起的时段','逐人读回可用时段，请本人纠正后再拟次序','先询问照护者不能离家的时段，再谈愿意承担的工段','章颐是否愿意说明换工所用旧具的叫法','利帆何时能腾出不影响自己家务的时段']};
const events=[
['panju','renbo','潘菊与任泊在门边谈过歇脚石的摆处。潘菊希望还能坐着和过路人搭话，任泊坚持路口要留行走宽度；两人各有各的理。','loc_yp_path'],
['caoyun','xunhe','曹芸与荀禾在果树下歇工处有过别扭。荀禾想找阴凉歇脚，曹芸在意根边被踩；这次往来没有确定新的歇工安排。','loc_yp_orchard'],
['yinrong','weichi','殷茸与卫迟在榆坡村当面往来，认得彼此。殷茸做麻线揉整，卫迟做榆皮绳搓制，两人的线尾与绳料仍各自照料。','loc_bs_yupo'],
['genglu','xicun','耿麓与席存在榆坡村见过面，认得彼此做的活：耿麓帮工垫石，席存登记柴束；这次相认没有约定由谁代另一人记工。','loc_bs_yupo'],
['miaopu','baoyin','缪朴与包印在榆坡村有过当面往来，认识彼此。缪朴照料土床，包印修整农具柄；两人各有要照看的工处，没有约定替对方接活。','loc_bs_yupo'],
['fengya','shiling','冯雅与石苓在榆坡村见过面，认得彼此。冯雅在共灶屋备料，石苓发起识字夜学；这次往来没有把冯雅的灶上工时排成听课时段。','loc_bs_yupo'],
['shaoruo','lingwan','邵若与凌宛在榆坡村当面往来，认得彼此。邵若做山坡测步，凌宛照料家中鸡圈；两人没有把私宅门槛排进共同测步安排。','loc_bs_yupo'],
['kongfu','yucheng','孔馥与俞澄在榆坡村见过面，认得彼此做的活。孔馥清洗晒药布，俞澄做栏门木工；这次往来没有约定借用俞澄的工具。','loc_bs_yupo'],
['qiuyan','tanghuan','裘砚与汤桓在榆坡村有过当面往来，认得彼此。裘砚核抄货签，汤桓抹补泥墙；相认没有替含糊货签确定收货人。','loc_bs_yupo'],
['zhangyi','lisha','章颐与利莎在榆坡村见过面，认得彼此。章颐口述旧农具名字，利莎协调菜圃换工；这次往来没有替任何住户答应出工。','loc_bs_yupo']
].map(([a,b,event,location])=>({id:`memory_yp_rest_${a}_${b}`,event,location,knownBy:[`npc_yp_${a}`,`npc_yp_${b}`],salience:3,reliability:'亲历'}));
const unknownFix={wenxu:{0:'严贝何时准备重描褪色袋记'},jiangmi:{0:'温绪哪一袋留作种穗、哪一袋作为吃粮',1:'邻户是否会同意自己搬动压住公路边沟的篱脚'},hanpei:{0:'朱笙愿不愿按自己提出的范围分清圈外与灶外清理'},qinli:{2:'旧架这次异响究竟要先检查哪一个接缝'},gaoxin:{1:'陶咨暂存的桶件分别归哪一位物主',2:'柏嘉是否想请自己解释某个契字的读法'},taozi:{0:'物主能否当面核对误放空桶的记号',1:'卢夏暂存的衣物分别是哪一户送来的',2:'程懿不肯开口说清要学的桶箍部位，原因究竟是什么'},luxia:{0:'陶咨会请哪一位物主核对相像桶件的记号',1:'卢幼衣角的破口究竟是在哪一次活动中扯出的',2:'登慈准备在哪一处接待尚未上门的亲戚'}};
const patchRows=people.map(n=>{const key=n.id.slice(7),ownIssues=issues.filter(i=>i.id===n.id),paths=new Set(),patches=[];const add=(path,value)=>{if(!paths.has(path)){paths.add(path);patches.push({path,value});}};const data=authored[key];
const relationshipText=r=>{const p=byId.get(r.with);const old=n.relationships.find(x=>x.with===r.with);if(old&&old.note&&!ownIssues.some(i=>i.field===`relationships[${n.relationships.indexOf(old)}].note`))return old.note.replace(/；不因此知道.*$/,'。').replaceAll('占位','摆放位置');const place=places.get(n.workplace.location)?.name??'榆坡村';return r.type==='同村日常往来'?`认识同村${p.name}；自己在${place}做${n.occupation}，挂心${n.goals.short[0].content}，若请${p.name}帮忙要先当面说清工事。`:`与${p.name}同户，自己每天还要照料${n.occupation}的活；想商量${n.goals.mid[0].content}时，会先问${p.name}能否腾出时间。`;};
for(const issue of ownIssues){const f=issue.field;if(issue.code==='known-count'){const rel=n.relationships[0],p=byId.get(rel.with),place=places.get(n.workplace.location);add('knowledge.known[1]',{fact:`${p.name}与自己同住${places.get(n.home.location)?.name??'本户居处'}，两人是同户的${rel.type}关系。`,source:n.id,reliability:'亲历'});add('knowledge.known[2]',{fact:`自己在${place.name}做${n.occupation}，眼下挂心${n.goals.short[0].content}。`,source:n.id,reliability:'亲历'});}
if(issue.code==='unknown-specific'){const index=Number(f.match(/\[(\d+)\]/)?.[1]);add(f,data?data[4+index]:unknownFix[key][index]);}
if(issue.code==='goal-steps')add(f,data[1+['short','mid','long'].findIndex(t=>f.includes('.'+t+'['))]);
if(issue.code==='voice-register')add(f,data[0]);
if(issue.code==='memory-shared')add(`memorySeeds[${n.memorySeeds.length}]`,events.find(e=>e.knownBy.includes(n.id)));
if(issue.code==='relationship-note'||issue.code==='rule-wording'&&f.startsWith('relationships')){const i=Number(f.match(/\[(\d+)\]/)[1]);let value=relationshipText(n.relationships[i]);if(key==='wenxu')value='曾在木作院与蒋弥当面谈过穗袋摆放位置；他看重避风，她要求留出检看篱脚的通道，双方尚未互相让出位置。';if(key==='luxia')value='与潘菊有日常往来，聊家务时更愿意问她坐着拣菜是否顺手；潘家的篮子和菜叶仍由潘菊及家人自己收拾。';add(f,value);}
if(issue.code==='rule-wording'&&f.startsWith('opinions')){const i=Number(f.match(/\[(\d+)\]/)[1]);add(f,relationshipText(n.relationships.find(r=>r.with===n.opinions.neighbors[i].with)));}}
return{id:n.id,before:n,baseHash:hashContent(n),issues:ownIssues.map(({id,field,code})=>({id,field,code})),patches};});
await fs.writeFile(new URL('base.json',root),JSON.stringify(people,null,2)+'\n');
await fs.writeFile(new URL('patch-plan.json',root),JSON.stringify(patchRows.map(({before,...r})=>r),null,2)+'\n');
await fs.writeFile(new URL('author-batches.json',root),JSON.stringify({batches,sharedEvents:events,source:'冻结原档的同户关系、工作地点、目标、既有邻里往来；门边歇脚石与果树歇工争议保留原描述。其余共享回忆只确认原关系已包含的当面相认，不造具体交易或泄露秘密。'},null,2)+'\n');



