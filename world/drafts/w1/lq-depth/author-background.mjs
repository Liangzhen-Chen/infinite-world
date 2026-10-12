import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {loadWorld} from '../../../../tools/load-world.mjs';
import {hashContent} from '../../../../tools/content-pipeline.mjs';
import {depthEntries,getPath,validateAuthoredBackground} from '../../../../tools/npc-depth-content.mjs';
import * as design from '../../../design/w1-lq-depth.mjs';

// Independent author specifications. Original world field refs provide context;
// they do not prove the newly authored attendance or speech. Candidate memory
// text is checked against this source only after the bundle has been authored.
const specifications=[
 {key:'stone-mark',actors:['luanpei','jiaoyan','shenshu','ningye','pijing'],location:'loc_lq_path',problem:2,
  narrative:'栾佩、焦岩、慎书、宁野和皮菁在砾泉坡路口看过旧石标与新路记。慎书指着缺了半边的字说明哪些笔画还能看见，宁野从来路指认看记号的位置，皮菁对着路口比过草图。栾佩问旧字与轮用簿是否真能对应，焦岩提醒挪石前要看受力边。那次没有补全残字，也没有商定新记号的朝向。',
  facts:['五人共同停在坡路口比较旧石标可读面与来路可见的新记号。','慎书只说明现存残笔；宁野指出来路视线，皮菁拿草图比过路口。','栾佩提出旧字与轮用簿是否对应的问题；焦岩只提醒挪石要看受力边。'],
  pending:['缺字读法仍待查证，未恢复完整旧约。','新路记朝向和石件旁对簿站位未定；未移动石标或指派劳动。'],
  speeches:['旧字和轮用簿是否能对应，仍要核对。','挪石前先看受力边，旁人先留安全空处。','我只指出还能看见的残笔，缺笔处不能据此补定。','从来路看，新记号要先看得见。','我的草图可拿到路口比看，没见过的路段仍留空。'],
  risk:'仅有这次公共观察与有限发言；不公开栾佩漏记外户要求或焦岩藏崩边等私事，也不认定古迹传言。'},
 {key:'mud-water',actors:['chuyin','xulong','suili','mogu','manqu'],location:'loc_lq_spring',problem:1,
  narrative:'储茵、胥珑、隋莉、莫谷和满渠在砾泉槽边看过清槽泥与菜沟口的距离。储茵指出水进沟的口，胥珑说明泥暂放在哪里，隋莉把沟尾偏干的事提出来。莫谷和满渠沿提水脚路看了泥边。几人没有认定缺水的原因，也没有答应替谁转运泥土。',
  facts:['五人到槽边看现有泥边与菜沟口、提水脚路的相对位置。','储茵指沟口，胥珑说明暂放泥处；隋莉只说自己沟尾偏干。','莫谷和满渠只观察脚路，不承诺帮工。'],
  pending:['清槽泥新放处、转运帮工与边界未定。','沟尾偏干原因未判明，没有给任何人确认截水责任。'],
  speeches:['水从这个菜沟口进去，泥边要先看清。','这里只是暂放槽泥的位置，还需商量放处。','我家的沟尾偏干，原因还没核清。','我只沿提水脚路看泥边，还没答应转运。','清沟前也要看脚路，但我没替人接下转运活。'],
  risk:'不由观察推出储茵私下先开沟、胥珑赌输、隋莉漏清沟口或满渠托病等个人秘密；不判定缺水原因。'},
 {key:'passage',actors:['zhenxi','ganqi','yinzhi','fengji','henglu'],location:'bld_lq_kitchen',problem:3,
  narrative:'甄希、甘祺、尹致、封济和衡庐在砾泉共灶屋门前看过刻痕废石与端物通路。甄希指认想留下对照的刻线，甘祺沿端物转身的方向走了一遍。尹致指出堆物挤脚的位置，封济只在旁指了可落脚处，衡庐提醒出入的人还需留通路。几人没有搬走石片，也没有给废石定下新放处。',
  facts:['五人停在共灶屋门前，比较现有废石堆与端物转身路径。','甄希只认刻线，甘祺试走端物路径，尹致和衡庐各提醒来往空处。','封济只在旁指落脚处，未搬重物。'],
  pending:['废石保留哪几块、怎样收纳和移放均未定。','没有处理无主物、分配工具、授权入私宅或给学工新增刻槽技能。'],
  speeches:['这些刻线我想留作对照，放处还要问清。','我先沿端物转身的方向走给大家看。','这边堆物挤脚，先认清通行边。','我只指落脚处，不接下搬重石的活。','护着补口或石片时，也要给出入的人留路。'],
  risk:'不公开甄希藏着的练习石、封济夜间肩疼或尹致私下挪物的事；不把封济的观察写成重劳动。'},
 {key:'work-dust',actors:['zhouwu','huoji','huaniu','nieya','cuifan'],location:'bld_lq_workroom',problem:4,
  narrative:'宙梧、霍霁、华钮、聂雅和崔帆在旧柄缝补屋看过阴棚下的检柄位置与筛料落尘方向。宙梧说拆缠条时要看得清裂处，霍霁指出筛下细料落向哪边，华钮问未拆开的接缝还能证实多少。聂雅与崔帆比较了残字和残线容易被误认的地方。筛料停歇的时段和检柄的新位置仍没有商定。',
  facts:['五人比较阴棚检柄位置与筛料落尘，未操作他人柄件。','宙梧讲可见裂处，霍霁指落料方向；华钮问未拆开的接缝能证实什么。','聂雅与崔帆只比较残字和残线的误认，不恢复未知名字或道路。'],
  pending:['筛料停歇时段和检柄位置未定。','没有拆他人物件、完成修补、核定裂缝或替物主授权。'],
  speeches:['拆缠条时要看得清裂处，不能只看缠得齐整。','筛下细料落向这边，落尘仍要看。','没拆开的接缝究竟能证实多少，要留待检查。','残字会使名签难认，只比较看得见的笔画。','残留旧线也会误导方向，只谈辨线问题。'],
  risk:'不公开自用柄、私下过早判断、保留裂签或练习反刻等个人秘密；比较辨认办法不授予新技能。'},
 {key:'wash-identify',actors:['minghe','yunxiu','tanyu','qinglan','wenqi'],location:'bld_lq_workroom',problem:4,
  narrative:'明禾、云绣、檀羽、青岚和闻琪在旧柄缝补屋门外谈过东西混放后怎么认回。云绣讲附灰会遮住缝线，檀羽讲湿袋叠放会藏住绳结，青岚说交衣先后也得看姓名记号。闻琪说明待洗锅与净锅要分开，明禾拿挑坏荚作比较。那次只交换了各自劳动中的辨认办法，没有收取、归还或替人洗补物件。',
  facts:['五人在缝补屋门外以各自劳动材料的辨认，回应阴棚检柄筛料互碍的公共问题；只交换办法，不替宙梧或霍霁约定工序。','云绣只讲附灰遮线，檀羽讲湿袋藏绳结，青岚讲姓名记号与交衣先后。','闻琪只讲净锅与待洗分开；明禾以拣坏荚分堆作类比。'],
  pending:['物主认袋、洗补交接和先后来往仍待本人核对。','阴棚的工位和停歇未定；此次没有洗补、收取、归还或交付东西。'],
  speeches:['剥拣豆荚时可把坏荚另分一堆，拿来比一下认物的办法。','附灰会遮住原缝线，要先能辨清。','湿袋叠着会藏住绳结，未核实的不能混还。','交衣先后也要看姓名记号，我只谈辨认。','待洗锅和净锅要分开，不能混说洗完了。'],
  risk:'不公开明禾拖活求陪坐、青岚私下插队、云绣拖着不拒接或闻琪混放未洗锅等秘密；没有传播家属私人关切。'},
 {key:'readback',actors:['fushen','shaluo','jushu','yike','kuangye'],location:'bld_lq_hall',problem:0,
  narrative:'符审、沙萝、鞠舒、易可和匡叶在泉标记事屋谈过记号与口头答应的差别。符审读回一段取水队次，沙萝问姓名应怎样读全，鞠舒说沟边标枝容易被误作走道边。易可提到解开的结未必认得回，匡叶说明代人答应换班曾被本人回绝。几人没有替未到的人确认轮次，也没有定下新的共同约定。',
  facts:['为对簿来人挤进石件检看范围的问题，五人在记事屋讨论先读回记录、再由当事人确认的办法，未实施分次候位。','符审只读回一段队次，沙萝问全名；鞠舒和易可只说明一般记号容易误认。','匡叶仅说明自己代答换班被本人回绝，不说两户的私人安排；新听众的获知范围只到这句。'],
  pending:['对簿站位、分次安排及新共同约定仍未定。','没有替未到者确认轮次或授权换班；旧结用途和缺字真相仍未知。'],
  speeches:['这里只读回这段取水队次，不替未到的人确认。','核签时姓名该怎样读全，先问清。','沟边标枝有时会被误作走道边，只说这个辨认问题。','结解开后未必能认回，不说我家的具体旧结用途。','我代答换班曾被本人回绝，只说明代答不算本人答复。'],
  risk:'不公开符审熟人插次、易可忘结不肯承认等秘密。匡叶的代答也属于秘密风险，原有公开更正记忆另列风险供审核，不把它自动授权给新听众。'},
];

const root=path.dirname(fileURLToPath(import.meta.url));
const world=await loadWorld(path.resolve(root,'../../..'));
const output=path.join(root,'author-v2/first-review');
const prefix=key=>'npc_lq_'+key;
const ref=(collection,id,field,visibility,publicSpeech)=>({collection,id,field,hash:hashContent(getPath(world[collection].find(row=>row.id===id),field)),visibility,...(publicSpeech?{publicSpeech}:{})});
const bundle={kind:'authored-background',revision:'t08-liquan-independent-background-v1',reviewStatus:'pending-independent-L2-L4',events:specifications.map(spec=>{
 const actors=spec.actors.map(prefix),problemRef=ref('settlementProfiles','loc_bs_liquan',`details.problems[${spec.problem}]`,'public');
 assert.equal(getPath(world.settlementProfiles.find(p=>p.id==='loc_bs_liquan'),problemRef.field).public,true);
 const sourceRefs=[problemRef,...['name','purpose','owner'].map(field=>ref('locations',spec.location,field,'public'))];
 for(const [index,actor] of actors.entries()){
  sourceRefs.push(ref('npcs',actor,'occupation','private',spec.speeches[index]));
  sourceRefs.push(ref('npcs',actor,'goals.mid[0].content','private',spec.speeches[index]));
 }
 const risks=actors.flatMap(id=>{
  const source=world.npcs.find(n=>n.id===id),fields=source.secrets.map((_,i)=>`secrets[${i}]`);
  if(source.authoredFacts?.privateFact!==undefined)fields.push('authoredFacts.privateFact');
  if(id==='npc_lq_kuangye')fields.push('memorySeeds[1]');
  return fields.map(field=>({id,field,hash:hashContent(getPath(source,field)),reason:spec.risk}));
 });
 return{id:'memory_lq_depth_'+spec.key,revision:'t08-event-v1',status:'past-but-unresolved',actors,location:spec.location,network:{actors:[...actors],problemRef},sourceRefs,designedFacts:spec.facts,pendingOutcomes:spec.pending,narrative:spec.narrative,risks,associations:actors.map((id,index)=>({id,path:`memorySeeds[${world.npcs.find(n=>n.id===id).memorySeeds.length}]`,narrative:spec.narrative,factsHash:hashContent(spec.facts),viewpoint:spec.speeches[index]}))};
})};
const entries=depthEntries(design.patchRows.map(row=>row.before),design,world);
const validated=validateAuthoredBackground(bundle,entries,world);
await fs.mkdir(output,{recursive:true});
const writeFrozen=async(name,data)=>{const file=path.join(output,name);try{assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),data,'已冻结作者出处不得覆盖');}catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(file,JSON.stringify(data,null,2)+'\n');}};
await writeFrozen('authored-background.json',bundle);
const previousFiles=['base.json','candidate.json','foundation.json','manifest.json','offline-report.json','author-source-checklist.json'];
await writeFrozen('opt-in-evidence.json',{stage:'first-review-source-prepared-only',cardId:'T08',modelCalls:0,incrementSpentYuan:0,sourceHash:validated.sourceHash,candidateChanges:[],originalBaseAndMemoryChanged:false,previousFiles:await Promise.all(previousFiles.map(async name=>({path:'../'+name,contentHash:hashContent(JSON.parse(await fs.readFile(path.join(root,'author-v2',name),'utf8')))}))),sourceRefs:bundle.events.flatMap(event=>event.sourceRefs.map(ref=>({eventId:event.id,...ref}))),boundary:'独立新背景待审，原出处只支持角色与困境；候选文字仅渲染公开发言和待定结果，纯验证不是L2/L4通过。',pending:['L2 source and candidate review','L4 source risks and candidate reading','T11 publication']});
console.log(JSON.stringify({stage:'independent-background-prepared-only',events:bundle.events.length,actors:entries.length,sourceHash:validated.sourceHash,modelCalls:0,candidateChanges:0}));
