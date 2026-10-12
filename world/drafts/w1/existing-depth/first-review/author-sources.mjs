import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../../../../../tools/load-world.mjs';
import {hashContent} from '../../../../../tools/content-pipeline.mjs';
import {getPath} from '../../../../../tools/npc-depth-content.mjs';
import * as original from '../../../../design/w1-existing-depth.mjs';

const root=import.meta.dirname;
const world=await loadWorld();
const id=key=>`npc_hw_${key}`;
const person=key=>world.npcs.find(n=>n.id===id(key));
for(const before of original.base){
 const actual=world.npcs.find(n=>n.id===before.id);
 if(hashContent(actual)!==hashContent(before))throw Error(`原档已变，先复核 ${before.id}`);
}
const sourceRef=(collection,sourceId,field,visibility='private',publicSpeech)=>{
 const source=world[collection]?.find(n=>n.id===sourceId),value=getPath(source,field);
 if(value===undefined)throw Error(`出处缺失 ${collection}/${sourceId}/${field}`);
 return{collection,id:sourceId,field,hash:hashContent(value),visibility,...(publicSpeech?{publicSpeech}:{})};
};
const privateRef=(key,field,speech)=>sourceRef('npcs',id(key),field,'private',speech);
const risk=(key,field,reason)=>({id:id(key),field,hash:hashContent(getPath(person(key),field)),reason});

// These are author definitions. Candidate memories are only frozen renderings;
// no definition takes its evidence from another candidate or review result.
const specifications=[
 {key:'south-water',networkPeople:['luowei','xinglu','xiejin'],issue:'南田沟口淤塞与各户田边用水次序',
  designedFacts:['一次过去的公开交谈涉及南田沟段和田边取水时段。','罗苇和邢芦说明共同查看过的淤塞问题，谢堇询问各户取水如何错开。','三人各说自己可讨论的范围，交谈没有替任何一户排定清沟责任。'],
  pendingOutcomes:['各家先清哪段沟、承担多少工时仍未商定。','各户取水轮次和时间仍须另行询问本人；没有工约、付款或交割。'],
  refs:[privateRef('luowei','goals.mid[0].content','只谈本人常堵沟段的核对安排，不披露本人种粮库存和家中财物。'),privateRef('xinglu','goals.mid[0].content','只谈相邻田段清沟需要商议；本人和罗苇共见淤塞的范围只限原已记亲历中的沟口问题。'),privateRef('xiejin','goals.short[0].content','只询问本人田边用水时段如何错开，不公开家庭家务、子女或私人记忆。'),privateRef('xinglu','relationships[2].note','只说明双方关心南田排水且分工未定。'),privateRef('xiejin','relationships[2].note','只讨论和罗苇已有的田边用水往来与先后。')],
  concernFields:[['luowei','goals.mid[0].content'],['xinglu','goals.mid[0].content'],['xiejin','goals.short[0].content']],
  extraRisks:[risk('xinglu','memorySeeds[0]','只核对罗苇与邢芦在原档已记的共同察看淤塞，不因新交谈向谢堇传播其它旧记忆。')]},
 {key:'eaves-warning',networkPeople:['feikai','gucen','hangli'],issue:'户外修缮、湿衣与通行安全的事前提醒',
  designedFacts:['一次过去的公开交谈中，费铠向顾岑提醒登高工作时檐下通行会有危险。','提醒发生在准备登高之前，只说明避开外檐下方这段路的必要。','顾岑听到的是具体通行风险，未因此知道屋主财物或给予进屋修缮许可。'],
  pendingOutcomes:['屋主许可、具体登高时间和檐下避人安排仍须核对。','提醒没有完成查漏或修缮，未约定款项和雇工。'],
  refs:[privateRef('feikai','goals.mid[0].content','只说明查看屋顶要等屋主同意，以及准备登高时檐下需要避人。'),privateRef('feikai','relationships[2].note','只把登高前提醒近邻避免走到下方作为公开说话范围。'),privateRef('feikai','voice.samples[2]','只冻结向顾岑提醒外檐下避人的语意；原样例不是已经发生的修缮记录。'),privateRef('gucen','occupation','只公开乡巡身份及可听取通行危险的来意，不增加执法权或屋主许可。'),privateRef('hangli','relationships[0].note','只作为夫妇与家庭安排的私有网络关联，不视作杭梨参加或听见本次交谈。')],
  concernFields:[['feikai','goals.mid[0].content'],['gucen','goals.short[0].content']]},
 {key:'local-approval',networkPeople:['chenbai','yanzhe','sulan'],issue:'木料及亚麻收购条件与当地批准的边界',
  designedFacts:['一次过去的公开交谈中，严辙向陈柏询问采购合同涉及的当地批准范围。','陈柏以自己管理的会议与账簿说明核对依据；这不等于他能单方面任命领主。','两人将拟议买卖条件和地方批准分开核对，未使合同产生额外权力。'],
  pendingOutcomes:['拟议货单、担保人与地方批准仍须逐项核对。','没有签约、授职、划拨公用土地或新款物交付。'],
  refs:[privateRef('chenbai','notes','只说明本人管理会议与账簿以及不能单方面任命领主的权限边界，不公开其个人担忧或公用仓库明细。'),privateRef('yanzhe','relationships[2].note','只询问采购合同与地方批准的区别，不声称已有批准。'),privateRef('yanzhe','goals.mid[0].content','只谈建立可履行试订单所需的核对，不声称已建立订单。'),privateRef('sulan','goals.mid[0].content','只作为亚麻出售议事的私有问题网络出处，苏岚未参加此次二人交谈。')],
  concernFields:[['yanzhe','goals.mid[0].content'],['chenbai','goals.mid[0].content'],['sulan','goals.mid[0].content']]},
 {key:'orchard-boundary',networkPeople:['wushuo','meiling','anhuai'],issue:'繁殖地少受惊扰、果园照护与蜂群授粉设想',
  designedFacts:['一次过去的公开交谈中，吴朔、梅绫和安槐各说明林果边界上自己关心的一件事。','吴朔只谈减少繁殖季惊扰，梅绫只谈公用果园照护，安槐只解释蜂群授粉的设想。','三人的说明没有确定林地路线、授粉场地或任何法术试验。'],
  pendingOutcomes:['试验的场地、时间、田主意愿和观察范围仍须另行商量。','没有授权捕猎、开放蜂场、赠送蜂蜜或完成授粉试验。'],
  refs:[privateRef('wushuo','goals.mid[0].content','只谈繁殖季少惊扰与少捕猎，不披露具体猎物或巢地位置。'),privateRef('wushuo','relationships[0].note','只说明已有林果边界往来涉及少惊扰繁殖地。'),privateRef('meiling','goals.long[0].content','只说公用果园需要长期共同照护，不公开仪式、洪水损失细节或本人秘密。'),privateRef('anhuai','goals.mid[0].content','只说有意参加经同意的农业试验，不把愿望当作实际参加或已获许可。'),privateRef('anhuai','relationships[0].note','只解释蜂场和公用果园在授粉上的可能共同利益。')],
  concernFields:[['wushuo','goals.mid[0].content'],['meiling','goals.long[0].content'],['anhuai','goals.mid[0].content']]},
 {key:'record-sources',networkPeople:['luqing','shendu','duanhe'],issue:'抄本、地图记录的出处与私人寄递边界',
  designedFacts:['一次过去的公开交谈中，陆青与沈渡讨论抄记材料需要列明引文和来源。','两人说明公开记录与私人邮件分开保管的原则，封缄信件留给收件人。','他们讨论的是记录办法，没有拿出或转述任何人的私信正文。'],
  pendingOutcomes:['具体缺页、缺引文的抄本仍须逐项核对，借阅和保管办法未在这次交谈中定下。','未开启封缄来信，未生成新寄递记录或让未参与者自动获知。'],
  refs:[privateRef('luqing','goals.mid[0].content','只提出共享小书库的保管问题，不公开抄本内容和私人账目。'),privateRef('luqing','relationships[2].note','只谈公开记录和私人邮件的边界。'),privateRef('shendu','goals.mid[0].content','只解释首发现及地图记录需要写清来源，不透露具体未抵达的消息。'),privateRef('shendu','notes','只说明封缄来信属于收件人和公开公告可核对来源，不交出私人邮件。'),privateRef('duanhe','goals.mid[0].content','只作为图注和比例学习的私有网络出处，段禾未参与本次交谈，也未因此知道新消息。')],
  concernFields:[['luqing','goals.mid[0].content'],['shendu','goals.mid[0].content'],['duanhe','goals.mid[0].content']]},
];

const newKeys=new Set(specifications.map(s=>s.key));
const provenance={kind:'t10-event-provenance',revision:'t10-first-review-sources-v2',cardId:'T10',originalAuthorCommit:'4f0bfe4',
 sourceBoundary:'正式world.npcs字段提供原出处；候选文字仅是冻结render，不能反过来证明新背景。原有私人事实仍按原知情范围处理。',
 events:original.sharedEvents.map(event=>({eventId:event.id,key:event.key,kind:newKeys.has(event.key)?'new-authored-background':'original-shared-event',actors:event.knownBy,
  sourceRefs:event.sources.map(([key,field])=>privateRef(key,field)),
  renderConstraints:event.knownBy.map(actor=>{const row=original.patchRows.find(r=>r.id===actor),patch=row.patches.find(p=>p.path.startsWith('memorySeeds['));return{id:actor,path:patch.path,hash:hashContent(patch.value),narrative:patch.value.event};}),
  reviewBoundary:newKeys.has(event.key)?'原关系和关切支持参加讨论的来由，不证明候选已发生；独立新背景及候选还须分别L2/L4。':'原已发布经历或具体往来支持共同亲历；补双方记忆仍须核对措辞与隐私范围，尚未L2/L4。'}))};
const plan={kind:'t10-authored-background-plan',revision:'t10-first-review-sources-v2',cardId:'T10',status:'offline-unreviewed',modelCalls:0,
 publicAreaSource:sourceRef('locations','loc_hw_dock','features[1]','public'),
 publicAreaBoundary:'仅旧渡口的公用水盏周边公开交谈，不授予整个渡口、船只、私宅或其它地点的进入权限。',
 events:specifications.map(spec=>{
  const legacy=original.sharedEvents.find(e=>e.key===spec.key);
  const designedFacts=spec.designedFacts.map((fact,index)=>index===0?fact.replace('一次过去的公开交谈','在旧渡口公用水盏周边的一次过去交谈'):fact);
  return{key:spec.key,id:legacy.id,revision:'t10-first-review-event-v2',actors:legacy.knownBy,location:'loc_hw_dock',status:'past-but-unresolved',
   networkActors:spec.networkPeople.map(id),networkIssue:spec.issue,
   concernRefs:spec.concernFields.map(([key,field])=>privateRef(key,field)),
   sourceRefs:[sourceRef('locations','loc_hw_dock','features[1]','public'),...spec.refs],
   designedFacts,pendingOutcomes:spec.pendingOutcomes,narrative:designedFacts.join(''),
   risks:[...legacy.people.flatMap(key=>person(key).secrets.map((_,i)=>risk(key,`secrets[${i}]`,'只核对本次公共说话的显式范围；不得泄漏该秘密、改变原knownBy或据此推断其它私密行为。'))),...(spec.extraRisks??[])],
   associations:legacy.knownBy.map(actor=>{const row=original.patchRows.find(r=>r.id===actor),patch=row.patches.find(p=>p.path.startsWith('memorySeeds['));return{id:actor,path:patch.path,narrative:'在旧渡口公用水盏周边，'+patch.value.event,factsHash:hashContent(designedFacts)};})};
 })};
const background={kind:'authored-background',revision:'t10-first-review-sources-v2',events:plan.events.map(event=>({
 id:event.id,revision:event.revision,status:event.status,actors:event.actors,location:event.location,
 publicFeatureRef:{id:plan.publicAreaSource.id,field:plan.publicAreaSource.field,hash:plan.publicAreaSource.hash},
 network:{actors:event.networkActors,issue:event.networkIssue,problemRef:((ref)=>({collection:ref.collection,id:ref.id,field:ref.field,hash:ref.hash}))(event.concernRefs[0])},
 sourceRefs:event.sourceRefs,designedFacts:event.designedFacts,pendingOutcomes:event.pendingOutcomes,narrative:event.narrative,
 risks:event.risks,associations:event.associations,
}))};
for(const [name,value] of [['event-provenance.json',provenance],['authored-background-plan.json',plan],['authored-background.json',background]]){
 const file=path.join(root,name);let prior;try{prior=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(prior&&hashContent(prior)!==hashContent(value))throw Error(`出处已冻结，需要先留证 ${name}`);
 if(!prior)await fs.writeFile(file,JSON.stringify(value,null,2)+'\n');
}
console.log(JSON.stringify({events:provenance.events.length,originalEvents:provenance.events.filter(e=>e.kind==='original-shared-event').length,newBackgrounds:plan.events.length,modelCalls:0}));
