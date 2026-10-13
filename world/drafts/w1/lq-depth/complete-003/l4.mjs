import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {currentOptions} from './review.mjs';
import {prepareDepthRevision} from '../../../../../tools/npc-depth.mjs';
import {recordDepthIncrementalL4} from '../../../../../tools/npc-depth-review.mjs';
import {hashContent} from '../../../../../tools/content-pipeline.mjs';
import {depthBackgroundSources} from '../../../../../tools/npc-depth-content.mjs';
const out=path.resolve('world/drafts/w1/lq-depth/complete-003');
const readings={
 luanpei:'逐叶阅读：分开取水和洗具、争议空行与旧对簿记忆相容；外户异议仍待问。女儿张嘴又合上未改为已劝母亲，原漏外户要求秘密未进五方会面。',
 jiaoyan:'翻石底、崩边、摸平整的声线与安全边连贯；获准翻看和用路者指认仍是待做步骤。共享提醒只讲受力，未讲藏崩边；家庭分歧未授物权。地点和关系互动的soft限度已读，评分一致性为4。',
 chuyin:'堵漏侧口有旧记忆；新步骤逐段看水痕，未跳成改变用水轮次。上湿下干仍待判因，清槽泥观察没有认定截水者，先开自家沟口私事未共享。',
 xulong:'雨后挪泥和受催后补清都是本人记忆；新放处仍待搭工者和受影响人确认。家属对开赌的态度不等于共享事件听众获知赌输秘密，收工检查未算已经清路。',
 shenshu:'亲见残笔、老人分别回忆及猜读三栏有区分；缺半字未补定。茄敏迟迟不收拓痕保留原反应，孙女问残笔的声线未改；认错字秘密未由新会面传播。',
 ningye:'试走干边和向问路者说明来自旧记忆；获准清一小段后标未清稳处仍pending。共享来路视线没有把整路不通私话传出，旧字与新记号并存仍是未知。',
 zhenxi:'向师傅展示失败边线有记忆，刻反练习石未向会面四人公开。两个停手点在获准废石上试刻仍未执行；甘祺试走端物路没有定石片放处或新增技能。',
 ganqi:'留空碗及听说清路耽误后改口有原经历；中期步骤明确询问带班提前告知灶房，未变成安排晚饭。试走端物方向只提供空间观察，未承诺搬石或定时段。',
 zhouwu:'拆旧缠条辨裂与劝停松柄来自旧记忆；物主同意后才逐层拆，未知裂缝尽头不填答案。阴棚会面只比较落尘与检柄位置，不向听众讲自用柄秘密。',
 huoji:'重新分混料和对落料处有旧记忆；known[2]只记本人指出落向。女儿站远等和配偶路上被问未改为催促，问明禾分拣办法仍待她愿谈。',
 minghe:'辨坏荚教学与坐处争执相连；中期先清荚壳留坐下起身空地，未偷换成陪坐时间安排。拖长活等陪坐秘密没有进入辨物会面，老人可选轻活。',
 yunxiu:'磨薄衣角、刷灰退衣及慢声拒接保持个人手艺；母亲等她开口未写催。未知交衣人答复未定，辨认会面没有收取或缝补物件，嫌脏拖不拒秘密未扩知情。',
 fushen:'受等候人质问和完整重念有旧事；换次双方各自答复仍未知。配偶答不上来、儿子多等一轮保留，皮菁只有未来愿谈请求；共享readback不含插次秘密。',
 pijing:'改坡向和未见路段留白有旧事；草图保留、韦谷亲见弯口与转述分开。路口会面没有补全残字或未知路线，照抄未见弯的秘密未公开。',
 yinzhi:'挪空木箱与受物主责问为本人旧记忆；新步骤先指挡风堆物不动、逐物主询问。共灶会面未挪石，工具包私事未共享，休息空处仍要回看。',
 tanyu:'湿袋摊开及逐户问双道单道结为亲历；现在两袋归属仍待本人核，归还前读回并未已交付。邻里封济只询问愿做哪段，不替老人选活，嫌烦混袋秘密未进共享。',
 fengji:'重物半道停与坐拣小石支撑轻活目标；会面只指落脚处不搬重石。蔓桂不追问而接重活仍保留等待，夜间肩疼没有向新听众公开。',
 suili:'翻淤泥和承认忘清是本人旧事；两个时段同一坎比较与偏干未知相容。known[2]只记本人提出沟尾干，女儿犹豫和配偶应下未动均未改为完成。',
 shaluo:'错签补全称与曾被回绝有本人记忆；新步骤先听完整说明再读姓名时长。共享只问姓名读全，未告诉四人模仿口音旧事；对莫谷暂停复工的询问不代为结算。',
 mogu:'阴处被同伴找到和后来补活为旧事；新暂停复工两个时点明确，留待结钱与实收留存分开。共享只看泥边，没有承诺转运或到账。',
 huaniu:'拆锈接缝及补说未证部分来自旧经历；逐段获准检看，未拆处列待查。庞果任门口堆物而非催清保留，公开问接缝能证多少不外传手感误判。',
 wenqi:'待洗净锅分开与低声承认重复答应有记忆；逐户说明已做未做和可等时限仍待答。洗辨会面没有洗完或交付锅，混放旧秘密未向四人讲。',
 jushu:'最新known[1]明确本人记得拔回标枝与另一侧试走，未添菜床地点或向旁人讲插枝秘密。儿子配偶同行未发生，崔帆愿不愿一起看仍需问，标枝辨认发言只讲一般问题。',
 cuifan:'重画箭头与抹旧线有本人记忆；试读折线和下次清残线待做。已删对青岚解释过，保留未来询问；阴棚只比残线误认，未传播私下擦不净情节。',
 qinglan:'被问交衣次序与重挂自家衣为本人旧事；家务时段另列、物主读回顺序待做。女儿配偶只未来商量，不默认知道夹衣秘密；洗辨会面只谈姓名记号。',
 henglu:'重留过门空隙和抹脚印有旧记忆；先问住户出门方向、等其指出不便仍pending。对易可改为未来询问，未发生旧约用途讲解；共灶会面没有搬石定放处。',
 yike:'旧结请家人回想与两种分装有记忆；被解两结用途未知，孙女愿说明仍待问。儿子夹在两边先不说保留，对满渠只是未来询问，忘结不认秘密未共享。',
 manqu:'托病被问与补清沟段有本人旧记忆；本人known未授权向人陈述，泥边会面也没有讲托病。腰痛轻重限制与记未做原因提供协商，目标步骤连接及声线独特性一般，评分最低3；观察泥边不等于已知全部湿滑段。',
 nieya:'拆裂签与重写残名有旧事；挂处受力试读仍待使用者回答。配偶端碗绕桌未改为催清，匡叶名签询问未发生，裂签留用秘密未进残字比较。',
 kuangye:'旧承诺更正仅本人旧记忆；共享改为“换班轮次要由当事人本人确认”原则，未说被本人回绝或代答情节。两户本人意愿仍未知，栾佩仅未来询问，不产生新约或换班权限。'
};
const eventNotes={
 'stone-mark':'逐项读残笔、来路视线、草图与受力边；发言范围与原职业及困境相容。缺字和朝向未定，未挪石或指派劳动；漏要求、藏崩边、误读及抄未知路的风险未传播。',
 'mud-water':'逐项读沟口、暂放泥、偏干与脚路观察。未判定缺水原因或承诺转运；私下开沟、赌输、漏清、阴处歇和托病均未作新听众知识。',
 passage:'逐项读废石、端物路径、通行边、封济指落脚与衡庐留路提醒。未搬石定收纳，不授技能；刻反石、赌气、私挪工具包、夜肩疼和护补忘出门均未传播。',
 'work-dust':'逐项读检柄辨裂、筛料落尘、未拆接缝、残字残线比较。停歇和新位置未定，未动他人物件；自用柄、踢石、早断、私留裂签和未擦净私事未传播。',
 'wash-identify':'逐项读附灰遮线、湿袋藏结、姓名先后、净锅待洗和坏荚类比。未收洗补交物，未替工位定序；五人私事与家属关切都未新增听众。',
 readback:'逐项对比旧源和匡叶三项风险。narrative、facts[2]、两publicSpeech和五方关联只讲本人确认原则，旧秘密、更正旧记忆及refs哈希保留；旧结用途、缺字、轮次站位和新约均未确认。'
};
const dimensions=['具体性','独特性','内在一致性','与世界的连接','可玩性','说话方式辨识度'];
const scores={
 jushu:[[4,4,5,5,4,4],['沿根区查看脚印','新种法总拿去和旧年比','鞠舒记得自己拔回过妨路的标枝','根区就在下头','请行路者一起试认另一侧脚路','先等我把这几株看完']],
 zhenxi:[[4,4,4,5,4,4],['两个停手点各刻一小段线','越是要紧的边线越迟迟不肯下手','整理要留的差异刻痕','端物转身的哪一边','请师傅比看越线处','这条线，对齐了吗？']],
 zhouwu:[[5,4,5,5,4,5],['逐层拆到可见裂处','报废的柄也想再缠一层','不能只看缠得齐整','筛料停歇会在何时','等本人同意再逐层拆','换不换由物主自己定']],
 shaluo:[[5,4,4,5,4,5],['姓名全称与时长','新手报错会当众学人腔调','保留更正前后记录','暂停和复工需讲明','先听短工讲完整的报工经过','名字和数目都念全了再走']],
 chuyin:[[5,4,4,5,5,4],['前后湿干变得不同的位置','水分一到菜床末尾就疑心有人占便宜','仍是她要核查的事','菜沟口附近','在不同到水时段各记一次上下段湿干','这上段还湿着，下段已经发白了']],
 jiaoyan:[[5,4,4,5,4,4],['踏石崩边与垫处','只挑错不说做对处','获准翻看后指认','石件旁对簿站位未定','请用路者指认哪一步踩下去最晃','平不平手知道']],
 manqu:[[4,3,3,5,4,4],['弯腰最吃力的沟段','能歇就歇','未做部分另记原因','清槽泥与菜沟口的距离','询问可先做哪段轻活并等答复','这一段谁负责？']],
 qinglan:[[4,3,4,5,4,4],['将自家家务时段另列','家人留下的污衣总先给洗','仍需先听他的答复','湿袋叠放会藏住绳结','向物主读回','先看名签，别混了']],
 tanyu:[[5,4,5,5,5,5],['哪家打双道、哪家打单道','别人一碰晾位或湿袋','未认清的各留待核记','晾位我先占的','物主各指出自己的绳记样子','这只绳结是双道']],
 luanpei:[[5,4,5,5,4,5],['把取水与洗具的说法分列','先搬旧规矩来挡','争议处会留待确认空行','旧字与轮用簿是否真能对应','询问外户怎样提出异议','这两样不能混着算']]
};
const rationale={
 jushu:['脚印和根区可直接查看。','恋旧与不愿换垄构成个人取舍。','新知识回到本人两条记忆，秘密不扩听众。','新脚路牵动菜床与通行者。','另一侧试走可继续协商。','潮土、干处与植株的词汇稳定。'],
 zhenxi:['停手点与小段线具体，工艺刻画普通。','怕错拖进度有个人弱点。','练习范围与保留对照未宣称完成。','刻石占位直接影响共灶通路。','师傅比看能产生反馈。','学工短问句可辨，变化较少。'],
 zhouwu:['逐层拆条与裂缝尽头有明确动作。','惜物拖停补构成取舍。','旧辨裂经历与获准拆条一致。','落尘与检柄直接冲突。','物主可选择拆到何处。','松柄、缠条与物主决定形成专业声线。'],
 shaluo:['全称、时长与两时点可核对。','细致又刻薄形成矛盾。','补抄错签和先听说明相连，旧讥笑仍为私事。','工签连接轮次及短工暂停复工。','短工可说明报工并指出错处。','先报姓名再逐项念回的方式清楚。'],
 chuyin:['逐段湿干和两时段提供明确观察。','好胜多疑影响判断。','堵侧口与核查仍未知一致，家庭互动略泛。','菜沟口与槽泥通路紧密相连。','比较水痕可产生具体发现。','硬直的湿土口语稳定。'],
 jiaoyan:['崩边、垫处和踩晃位置可见。','沉稳与苛刻并存。','检看待授权，旧事地点和家人互动仍有soft限度。','踏石安全与对簿空间相连。','实际用路者可复述检看结果。','摸边短句清楚，常见工匠口吻。'],
 manqu:['重段、轻段与未做记录可谈。','贪闲托病主题较常见。','步骤能指限制，长期目标与核对沟段的联系较弱。','腰痛、清沟与泥边脚路发生实际冲突。','可协商重段时限与轻活。','先问谁负责及腰酸口气稳定。'],
 qinglan:['姓名记号、家务时段和顺序可核。','护短先洗家衣较常见。','新家庭询问未默认旧秘密知情。','洗晒工时与湿袋姓名辨认连接紧密。','物主可提出交付时点异议。','按盆、姓名与先后发问清楚。'],
 tanyu:['双单结与结的位置支撑辨物。','利落又多疑可辨。','旧逐户问结与现在待核两袋相容。','洗晒与棚边物件归属相连。','各物主可给不同认袋依据。','按户按只、戒晾位的快话明确。'],
 luanpei:['分用途分行读回是实际操作。','爱面子拿旧规矩挡错有弱点。','留空行与异议待核前后连贯。','旧石标、簿册与安全站位相连。','外户异议有具体对话入口。','用途与哪次轮到谁的问句鲜明。']
};
if(process.argv[2]==='--record'){
 const options=await currentOptions(),p=await prepareDepthRevision(options),selection=JSON.parse(await fs.readFile(path.join(out,'l4-selection.json'),'utf8'));
 const candidates=[];
 for(const e of p.entries){const r=JSON.parse(await fs.readFile(path.join(options.root,e.id+'.json'),'utf8'));assert.equal(r.status,'passed');candidates.push({id:e.id,note:readings[e.id.slice(7)],draftHash:hashContent(r.draft),reviewHash:hashContent(r.review),entryHash:hashContent(e),reviewedPaths:e.patches.map(p=>p.path)});}
 const backgrounds=depthBackgroundSources(p.entries).map(({event,sourceHash})=>({eventId:event.id,sourceHash,eventHash:hashContent(event),note:eventNotes[event.id.slice('memory_lq_depth_'.length)],reviewedRiskPaths:event.risks.map(r=>r.id+'.'+r.field)}));
 const write=async(name,v)=>fs.writeFile(path.join(out,name),JSON.stringify(v,null,2)+'\n');
 await write('l4-notes.json',{reviewedBy:'T08 Sol, actual leaf/source reading 2026-10-13',selection,candidates,backgrounds});await write('batch-l4-notes.json',candidates);
 const samples=selection.waveSample.map(id=>{const key=id.slice(7),[values,quotes]=scores[key];return{id,ratings:Object.fromEntries(dimensions.map((d,i)=>[d,{score:values[i],quote:quotes[i],reason:rationale[key][i]}]))};});
 const values=samples.flatMap(s=>dimensions.map(d=>s.ratings[d].score)),mean=values.reduce((a,b)=>a+b,0)/values.length,minimum=Math.min(...values);assert.equal(values.length,60);assert.ok(mean>=4&&minimum>=3);
 await write('wave-score.json',{samples,dimensions,mean,minimum,passed:true,selectionFile:'l4-selection.json'});
 console.log(JSON.stringify(await recordDepthIncrementalL4({...options,l4Notes:path.join(out,'l4-notes.json')})));console.log(JSON.stringify({mean,minimum,read:candidates.length}));
}
