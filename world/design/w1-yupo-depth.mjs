// Targeted factual additions. Existing identities, property, prose and private memories stay intact.
export const revision='w1-yupo-depth-1';
const id=key=>`npc_yp_${key}`;
export const sharedEvents=[
 {id:'memory_yp_depth_water_marks',participants:['zhaofeng','qiaoduan'].map(id),location:'loc_yp_fields',event:'雨后赵枫与乔端在上下坡麦田的低垄边核对水痕；乔端指出石片标记的豁口，赵枫把所见与轮水册逐段对照，两人尚未商定新的用水次序。'},
 {id:'memory_yp_depth_fence_passage',participants:['wenxu','jiangmi'].map(id),location:'bld_yp_yard',event:'温绪在榆枝木作院当面向蒋弥说明穗袋需要避风处，蒋弥指出检看篱脚要留通道；他们各自说明了用途，没有替对方同意搬袋或挪篱。'},
 {id:'memory_yp_depth_clean_boundary',participants:['hanpei','zhusheng'].map(id),location:'bld_yp_kitchen',event:'韩培和朱笙在坡口共灶屋门外争过清扫范围；韩培认为圈外杂物不都算清圈工，朱笙要求入灶的路保持干净，两人还没有认定谁负责最后一段。'},
];
// Each row authors the register, concrete uncertainty, relationship provenance and executable preparation steps.
export const depthRows=[
 {key:'zhaofeng',register:'用语偏书面，复核记录时谨慎，说到自己的漏记便绕着原因解释',event:0,
 known:[['乔端标出的低垄豁口在上下坡麦田，已经和她当面核对过水痕。','loc_yp_fields'],['乔端主张先防沟口继续受损；两人核痕时仍没有订下新轮次。',id('qiaoduan')]],
 unknown:['乔端是否在无人作证时改变过邻沟口','赵蔓尚未交给自己的旧页是否包含漏记那一行'],
 notes:['抄簿时反复请赵蔓找旧页，自己继续对行，常让她在桌边久等；公事占掉了父女原本能一起收拾桌面的时间。','在家谈公事会拖冷史乐备下的饭；他常想先把记录说完，史乐却要他先结束围桌的谈话。','雨后曾与乔端逐段核对低垄水痕；他要先对原簿，她要先止住沟口受损，对先做哪件事尚有分歧。'],
 steps:[['把现存轮水页按沟段摊开，标出前后接不上的一行','请赵蔓找出对应旧页，空缺未核清前不自行补名'],['分别询问乔端与上坡户能接受的时段','将仍有异议的段落留白，安排当事人在场逐段读回'],['请不参与抄写的居民试读一页，记下认错之处','把容易混淆的沟名加上位置说明，再请用水户复核']]},
 {key:'qiaoduan',register:'日常口语直截，涉及田损会抢着说眼前后果，对解释原因缺少耐心',event:0,
 known:[['赵枫已在低垄边见过石片标下的豁口，两人当面对过水痕。',id('zhaofeng')],['上下坡麦田这一处水痕与册上轮次仍须核对，双方未同意新的用水先后。','loc_yp_fields']],
 unknown:['赵枫漏行究竟出于哪一次抄写失误','上坡户是否愿意把清沟日改到自家能到场的日子'],
 notes:['乔蓓把册上的沟线与田边水线看成同一条；乔端急着争轮水时常忘记解释，女儿因此不敢再问。','仲启在上坡户面前常不接话，清泥也等她先提；她把这些迟疑看作不肯担事，催促反而让两人更难商量。','认识温绪靠手摸穗轴辨留种的做法，曾在田边听他解释，觉得这比只看袋记可靠；不因此知道温家的库存。'],
 steps:[['回低垄查看石片记号是否被水冲移','把仍在扩大的豁口指出给同意到场的邻户看，先商量临时防护'],['询问上坡户各自能到场的时段','沿沟把需要清理的段落指给双方看，各自确认承担边界'],['连续几次用水后记下低垄的水痕变化','将新水痕和轮次一同交当事人核对，保留未解决的分歧']]},
 {key:'wenxu',register:'说话从容，用农活中的旧称解释实物，不急着接受年轻人的快办法',event:1,
 known:[['蒋弥要留出检看篱脚的通道，不愿穗袋一直占住操作位置。',id('jiangmi')],['榆枝木作院中谈过穗袋避风与篱脚通行的冲突，尚未约定新的放袋处。','bld_yp_yard']],
 unknown:['严贝下次准备采用哪种办法重描褪色袋记','蒋弥若获邻户许可，会先检查哪一段被压住的边沟'],
 notes:['曾让温彦上手摸穗形而不只看袋记；儿子赶工时急着翻袋，令他担心教过的区别没有用上。','与严贝反复补过旧袋记号；她怕袋子混到邻户，他更相信结头和穗形，两人对先补哪种记号意见不同。','曾在木作院与蒋弥当面讨论穗袋占位；他看重避风，她要通道检看篱脚，尚未互相让出位置。'],
 steps:[['把仍能认清与已经模糊的穗标分开放','请严贝在亮处逐个辨认，不能确认的袋暂不按旧印判断'],['请温彦说出他实际用来分袋的记号','把父子辨认不同的那一袋交严贝一并核对'],['先问来听的人能否辨出两种穗轴手感','只用核实归属且经同意的穗作演示，让对方复述判断理由']]},
 {key:'jiangmi',register:'寡言，习惯用具体部位说清手艺问题；发现粗活时语气尖锐',event:1,
 known:[['温绪不愿马上挪开穗袋，是想保留避风位置，未同意把袋子交自己处置。',id('wenxu')],['榆枝木作院的篱脚检看通道与放袋位置相冲，双方只说明过用途。','bld_yp_yard']],
 unknown:['温绪哪些袋里装的是种穗、哪些是吃粮','邻户是否会允许移动压住公路边沟的篱脚'],
 notes:['蒋娜曾在门槛边把散短枝拢成一堆，却没敢用母亲的料；蒋弥能看见她想试手，仍须先分清哪些料可以碰。','毕文坐在门边时被篱外近路扬起的灰打扰，常拿年轻人取笑；她关心怎么留通道，也不愿父亲替自己斥走路人。','在木作院与韩培交错用过通道，见他常先问工时边界；她愿说明哪段要让路，不替他承诺清圈工。'],
 steps:[['沿公路边沟找到被篱脚压住的具体出水口','站在公共路上辨清所属住户，未获允许前不拆篱'],['向邻户说明阻水位置与预计需要腾出的通道','请对方当面确认可移动范围，再谈检看安排'],['记录自己做过的接头在哪些位置便于拆开','征得使用者允许后查看受潮处，比较便拆与牢固之间的取舍']]},
 {key:'hanpei',register:'熟人间说话随便，谈工钱与工时时反复限定自己的责任，遇追问容易嘴硬',event:2,
 known:[['朱笙关心入灶路上的脏物，不接受把所有屋外清理都排到做饭之后。',id('zhusheng')],['坡口共灶屋门外的最后一段清扫尚未分定，双方尚未约定换工。','bld_yp_kitchen']],
 unknown:['朱笙会接受怎样划分圈外与灶外的清理范围','韩茁在坡口具体听谁提过自己多报工时'],
 notes:['韩茁听见清圈闲话便快步走开，回家也不接话；韩培知道自己的工时争议让儿子难堪，却没有资格让儿子代为解释。','常勤要他把漏清的圈角当面说清；他习惯先强调已经补做，夫妻因此争论补活能否代替认错。','与朱笙在共灶门外争过清扫边界；他不肯把灶外杂物全算进清圈工，她坚持做饭的进路必须保持干净。'],
 steps:[['查看自己答应清走的垫草还剩在哪个圈角','向现场物主核对允许堆放的位置，只搬明确属于本次工段的部分'],['请朱笙站在灶门外指出她认为必须清出的进路','用双方认得的地面边界分别描述责任，异议留到当面确认'],['接活前对照自己已有的家务时段','遇追加清扫先说明可用时间，再决定是否另作约定']]},
 {key:'zhusheng',register:'灶边用简短口语安排动作，议论分工时声音响亮，受拖延会直接责备',event:2,
 known:[['韩培认为清圈与灶外杂物应分开计工，还未认可最后一段由谁负责。',id('hanpei')],['坡口共灶屋入灶路需要清理，双方尚未约定清扫报酬或换工安排。','bld_yp_kitchen']],
 unknown:['韩培漏清圈角的事当时由谁最先发现','下一轮帮灶的人谁愿意先认下收尾，而不是只答应备饭'],
 notes:['朱沫在灶间门口急着帮忙，她仍把女儿安排在远离火边的位置；孩子要参与与灶上防烫之间常需重说。','田洁听不清自己短促的喊话，她曾把容器指给母亲看才重说一遍；忙时仍会忘记放慢，让母亲着急。','与秦砺在共用空处说过旧磨架异响，她赞成先停磨再查；这段交谈没有让她取得修磨技能或替人检修的责任。'],
 steps:[['向正在帮饭的人分别问清谁还能留下洗碗','把暂时无人接手的盆碗留在明确位置，不能把沉默当答应'],['请实际用灶者分别说出能承担的收尾动作','把冲突的先后顺序读给双方听，再由本人确认'],['连续几轮记下实际做过收尾的人与未完成的动作','在下一次分工前提出轮换办法，让参与者说明不能承担的时段']]},
].map(row=>({...row,id:id(row.key)}));
export function applyDepthFacts(npc,row){
 const next=structuredClone(npc),shared=sharedEvents[row.event];
 next.voice.register=row.register;
 next.knowledge={known:[structuredClone(npc.knowledge.known[0]),...row.known.map(([fact,source])=>({fact,source,reliability:'亲历'}))],unknown:[...row.unknown]};
 next.relationships=next.relationships.map((r,i)=>({...r,note:row.notes[i]}));
 for(const [i,term]of ['short','mid','long'].entries())next.goals[term][0].steps=row.steps[i].map(content=>({content,status:'pending'}));
 next.memorySeeds.push({id:shared.id,event:shared.event,salience:4,knownBy:[...shared.participants],reliability:'亲历',location:shared.location});
 return next;
}

// Exact reviewed wording transitions for three facts; this is not a language filter.
// They allow an already-published prior edition to advance without accepting any other edit.
export const knowledgeWordingCorrections=[
 {id:'npc_yp_qiaoduan',from:'赵枫已经在低垄边见过石片标下的豁口，不能把这件事说成只听自己抱怨。',to:'赵枫已在低垄边见过石片标下的豁口，两人当面对过水痕。'},
 {id:'npc_yp_hanpei',from:'坡口共灶屋门外的最后一段清扫尚未分定，争执不等于已经约好换工。',to:'坡口共灶屋门外的最后一段清扫尚未分定，双方尚未约定换工。'},
 {id:'npc_yp_zhusheng',from:'坡口共灶屋入灶路需要清理，争执没有形成任何新报酬或换工约定。',to:'坡口共灶屋入灶路需要清理，双方尚未约定清扫报酬或换工安排。'},
 ];
export function applyKnowledgeWordingCorrections(npc){
 const result=structuredClone(npc);
 for(const correction of knowledgeWordingCorrections.filter(row=>row.id===npc.id))for(const fact of result.knowledge.known)if(fact.fact===correction.from)fact.fact=correction.to;
 return result;
}
