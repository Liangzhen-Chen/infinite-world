import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {loadWorld} from '../../../../tools/load-world.mjs';
import {hashContent} from '../../../../tools/content-pipeline.mjs';
import {depthEntries,getPath,validateAuthoredBackground} from '../../../../tools/npc-depth-content.mjs';
import * as design from '../../../design/w1-sb-depth.mjs';

// Independent author specifications. These statements are proposed new past
// backgrounds, not quotations from an old joint experience or from a candidate.
// The extra network member is an affected adult, not a witness to this event.
const specifications=[
 {id:1,actors:['zhangluo','yuanqing'],affected:'zhangyun',location:'loc_sb_orchard',problem:0,
  narrative:'张洛与袁卿在桑坡树地谈过修枝工与采叶工安排；张洛坚持已确认的轮次，袁卿希望先理枝，重排尚未商定。',
  facts:['张洛与袁卿在桑坡树地有一次关于修枝和采叶先后的交谈。','张洛只说明按已确认轮次排工的立场，袁卿只说明希望先理枝。'],
  pending:['受影响轮次和重排范围未商定。','没有取得其他住户同意、安排新工日或移交财物。'],
  speeches:['先按已确认的轮次排，受影响的工日还要逐户重问。','树势变了时我希望先理枝，具体轮次还没重排。'],networkReason:'张纭原日常关切是母亲排错换工日期后的推责，属于同户换工问题网络。'},
 {id:2,actors:['zhonglan','tianmo'],affected:'heyang',location:'loc_sb_orchard',problem:1,
  narrative:'钟岚与田陌在桑坡树地争过采叶后的收工界线；钟岚要分清叶料，田陌希望采完就休息，分拣范围尚未商定。',
  facts:['钟岚与田陌在桑坡树地谈过采叶后到哪一步才收工。','钟岚要求分清叶料，田陌希望采完就开始休息。'],
  pending:['粗分、送到及细拣的界线未商定。','没有新增工钱、承接分拣劳动或确认料堆交付。'],
  speeches:['叶料要分清，交接范围还得说清。','我想采完就歇，但分拣算不算在工里还没谈妥。'],networkReason:'赫扬原为搬架工，与钟岚同住，原烦恼涉及叶堆交接及散叶收尾。'},
 {id:3,actors:['zhenyun','gulu'],affected:'zhenli',location:'bld_sb_hall',problem:2,
  narrative:'甄芸与顾露在桑坂换工屋谈过窗边亮处的使用；甄芸要辨壳，顾露要摊晒位原签，先后尚未商定。',
  facts:['甄芸与顾露在桑坂换工屋有一次关于窗边亮处的交谈。','甄芸提出辨壳需要亮处，顾露提出晒位原签要摊开核对。'],
  pending:['亮处的先后和暂停时段未定。','没有替甄芸宣布已辨完茧壳，也没有确认空架分配。'],
  speeches:['我辨壳要在亮处，哪些整理能移开还要再看。','晒位原签得摊开核对，争签占亮处的时段还没谈妥。'],networkReason:'甄梨是甄芸同户女儿、线料帮工，原烦恼涉及母亲挑壳和眼力。'},
 {id:4,actors:['yexun','zhuchai'],affected:'jiangru',location:'bld_sb_yard',problem:3,
  narrative:'叶荀与竺钗在梭架修整院争过留样木屑与入灶过道；叶荀想留比对样屑，竺钗怕木屑带进灶口，清理时点尚未商定。',
  facts:['叶荀与竺钗在梭架修整院谈过留样木屑和入灶过道。','叶荀想留下比对样屑，竺钗指出灶口过道带木屑的问题。'],
  pending:['样屑收纳、清离范围和检查时点未定。','没有借到容器、处理物主木屑或安排共灶全体停工。'],
  speeches:['修梭时我想留原样屑比对，收在哪里还要问清。','入灶过道不能带木屑，清理检查的时点还没谈妥。'],networkReason:'姜茹是叶荀同户配偶、灶房帮工，日常会替叶荀刻薄的话周旋。'},
 {id:5,actors:['panyao','gaoshu'],affected:'panrui',location:'bld_sb_workroom',problem:4,
  narrative:'潘瑶与高枢在晒线缝补屋谈过补绣与摇架的工序；潘瑶要安静数针，高枢需摇架检看异响，避让时段尚未商定。',
  facts:['潘瑶与高枢在晒线缝补屋谈过数针和摇架检看的相互影响。','潘瑶提出安静数针的需要，高枢提出摇架检看异响的需要。'],
  pending:['避让时段和调整工序未商定。','没有确定异响原因、完成修架或给潘瑶新增花样技能。'],
  speeches:['缝细纹数针要安静，停针时段还要商量。','异响检看有一段要摇架，什么时候摇还没约好。'],networkReason:'潘蕊是潘瑶同户女儿、晒布工，原关切涉及母亲的纹样能力和说明。'},
 {id:6,actors:['zhouwei','congsi'],affected:'zhoufen',location:'loc_bs_sangban',
  narrative:'周薇与丛思在桑坂村谈过门前视线与晾线位置；周薇要看得到路人，丛思想让线束避开穿行处，位置尚未商定。',
  facts:['周薇与丛思在桑坂村公共会面处谈过门前视线和晾线位置。','周薇只说坐着要看得到路人，丛思只说晾线要避开穿行。'],
  pending:['晾线位置和挪放范围未商定。','没有替老人决定坐处、搬私物或取得家人同意。'],
  speeches:['我坐在门边要看得到路人。','我的线束想避开穿行处，晾在哪里还没定。'],networkReason:'周芬是周薇同户女儿，原日常关切直接涉及母亲坐处和门前晾物。'},
 {id:7,actors:['maoli','jiean'],affected:'maoxuan',location:'loc_sb_fields',
  narrative:'茅俪与解安在桑坡边沟田谈过清沟与空架暂放；茅俪催雨前清沟，解安要平整处检看空架，暂放位置尚未商定。',
  facts:['茅俪与解安在桑坡边沟田谈过清沟和空架暂放的冲突。','茅俪提出雨前先清沟，解安提出空架需要平整检看处。'],
  pending:['暂放位置与清沟先后未商定。','没有挪走木架或坐石，没有指定邻户清沟劳动。'],
  speeches:['雨前我想先清沟，暂放木架的位置还要商量。','空架检看需要平整处，暂放到哪里还没谈妥。'],networkReason:'茅萱是茅俪同户女儿，正式关切涉及沟口木架、旧坐石与清沟顺序。'},
 {id:8,actors:['baishu','luwei'],affected:'luyun',location:'loc_bs_sangban',
  narrative:'白舒与鲁玮在桑坂村谈过晒布与搬架过道；白舒怕布被碰落，鲁玮说转弯要留宽处，过道宽度尚未商定。',
  facts:['白舒与鲁玮在桑坂村公共会面处谈过晾布边和搬架转弯的空间。','白舒提出布别被碰落，鲁玮提出抬架转弯需留宽处。'],
  pending:['过道宽度和晾布位置未商定。','没有拿走布料、分配搬架工或得到搭工者换肩同意。'],
  speeches:['我怕晾着的布被经过的人碰落。','抬架转弯要宽一点，过道留多少还没定。'],networkReason:'鲁芸是鲁玮同户配偶、绕线帮工，原关切涉及他搬架挑轻活造成的邻里问话。'},
 {id:9,actors:['shikui','kongliu'],affected:'zengyi',location:'bld_sb_hall',
  narrative:'史葵与孔柳在桑坂换工屋谈过公共桌上的原契与描样；史葵要按人分放原契，孔柳需摊平转角纸样，桌面分用尚未商定。',
  facts:['史葵与孔柳在桑坂换工屋谈过公共桌上原契与转角纸样的空间。','史葵提出原契按人分放，孔柳提出描角边需摊平纸样。'],
  pending:['桌面分用与摆放范围未定。','没有挪动私有原契、复制文书或让孔柳掌握新描样技能。'],
  speeches:['原契得按人分放，桌面怎么分还要谈。','描转角要摊平纸样，不能把未说清的空位当作我的。'],networkReason:'曾宜是史葵同户配偶，原日常关切涉及来客询问原契字句。'},
 {id:10,actors:['feiqing','shangyun'],affected:'feiyue',location:'loc_bs_sangban',
  narrative:'费清与商筠在桑坂村谈过旧梯停用与晾袋；费清坚持有疑问的梯先停用，商筠需要不借坏梯的晾位，替代位置尚未商定。',
  facts:['费清与商筠在桑坂村公共会面处谈过停用旧梯和晾袋位置。','费清要求有疑问的梯先停用，商筠提出另找不借坏梯的晾位。'],
  pending:['替代晾袋位置未商定。','没有借出坏梯、确认修复或占用未经允许的晾架。'],
  speeches:['有疑问的梯先停用，不能靠外表完整就转借。','我需要另找不借坏梯的晾袋位置，地点还未定。'],networkReason:'费玥是费清同户女儿，原关切涉及坏梯是否被借走。'},
 {id:11,actors:['chishan','chayue'],affected:'chifen',location:'loc_bs_sangban',
  narrative:'池杉与查悦在桑坂村谈过树下歇脚与候灶；池杉不愿树根反复受踩，查悦希望候灶人能听到叫名，候灶位置尚未商定。',
  facts:['池杉与查悦在桑坂村公共会面处谈过树根边候灶人群的位置。','池杉提出避免反复踩树根，查悦提出候灶人需听见叫名。'],
  pending:['候灶位置和人群站位未商定。','没有授权踩私园、安排用灶轮次或移动树篱。'],
  speeches:['树根边不要反复踩实，站哪里还要商量。','候灶的人要能听见叫名，位置还没谈妥。'],networkReason:'池芬是池杉同户女儿，原关切直接涉及为树根绕路和传话。'},
 {id:12,actors:['qinwan','longfu'],affected:'qinxian',location:'loc_bs_sangban',
  narrative:'秦婉与龙芙在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。',
  facts:['秦婉与龙芙在桑坂村公共路上有过一次相互招呼。','两人只认得同村住户；没有说出职业、衣物物主或育苗私事。'],
  pending:['没有商定工事或劳动交换。','秦婉原赶改衣顺序仍待本人核对，这次招呼没有解决该问题。'],
  speeches:['我只向同村住户招呼，没有说赶改衣的物主或时段。','我只向同村住户招呼，没有说育苗或家事。'],networkReason:'秦娴是秦婉同户母亲，原关切涉及催衣亲属来找她说情；该网络仅作日常往来背景。'},
 {id:13,actors:['zhuxian','fuyu'],affected:'biqi',location:'loc_bs_sangban',
  narrative:'诸弦与扶瑜在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。',
  facts:['诸弦与扶瑜在桑坂村公共路上有过一次相互招呼。','两人只认得同村住户；没有说出木板物主、旧叶留念或家庭分歧。'],
  pending:['没有商定工事或取得处理私物的同意。','诸弦原木板暂放问题仍未由这次招呼解决。'],
  speeches:['我只招呼同村住户，没有说木板归属或家中争执。','我只招呼同村住户，没有说家中旧叶的事。'],networkReason:'毕祺是诸弦同户配偶、洗晒帮工，原关切涉及诸弦斥责人的家庭影响；没有参加这次招呼。'},
 {id:14,actors:['quanli','yanjue'],affected:'quanyun',location:'loc_bs_sangban',
  narrative:'全立与晏珏在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。',
  facts:['全立与晏珏在桑坂村公共路上有过一次相互招呼。','两人只认得同村住户；没有交换路记权限或丝束签记内容。'],
  pending:['没有商定工事或取得整理枝路标记的同意。','全立原路记遮挡和晏珏原旧签问题仍待本人处理。'],
  speeches:['我只招呼同村住户，没有替园主许人进园。','我只招呼同村住户，没有读出旧签或物主名字。'],networkReason:'全云是全立同户配偶，原关切涉及在路口补充指路话；没有见证这次招呼。'},
 {id:15,actors:['xianghe','diye'],affected:'zhanlu',location:'loc_bs_sangban',
  narrative:'向荷与邸叶在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。',
  facts:['向荷与邸叶在桑坂村公共路上有过一次相互招呼。','两人只认得同村住户；没有安排值日、借物或讨论篾条私事。'],
  pending:['没有商定工事或让同住者接受家务安排。','向荷原共居重活分配和邸叶原工位收尾问题仍待本人处理。'],
  speeches:['我只招呼同村住户，没有替同住者答应值日。','我只招呼同村住户，没有让别人接下收尾活。'],networkReason:'展露是向荷原登记同住者，原关切涉及值日须由自己点头；没有参加这次招呼。'},
];

const root=path.dirname(fileURLToPath(import.meta.url)),worldRoot=path.resolve(root,'../../..');
const world=await loadWorld(worldRoot),output=path.join(root,'first-review'),prefix=slug=>'npc_sb_'+slug;
const ref=(collection,id,field,visibility,publicSpeech)=>{
 const value=getPath(world[collection].find(row=>row.id===id),field);assert.notEqual(value,undefined,`${id}.${field}`);
 return{collection,id,field,hash:hashContent(value),visibility,...(publicSpeech?{publicSpeech}:{})};
};
const bundle={kind:'authored-background',revision:'t09-sangban-independent-background-v1',reviewStatus:'pending-independent-L2-L4',events:specifications.map(spec=>{
 const actors=spec.actors.map(prefix),affected=prefix(spec.affected),networkActors=[...actors,affected];
 const person=world.residents.find(n=>n.id===affected);assert.ok(person&&person.age>=18);
 assert.ok(actors.some(id=>world.npcs.find(n=>n.id===id).household.includes(affected)),'网络关联人须为其中一名当事人的原同户住户');
 const problemRef=spec.problem!==undefined?ref('settlementProfiles','loc_bs_sangban',`details.problems[${spec.problem}]`,'public'):ref('npcs',actors[0],'goals.short[0].content','private',spec.speeches[0]);
 if(spec.problem!==undefined)assert.equal(getPath(world.settlementProfiles.find(s=>s.id==='loc_bs_sangban'),problemRef.field).public,true);
 const sourceRefs=[problemRef,...['name','purpose','owner'].map(field=>ref('locations',spec.location,field,'public')),ref('residents',affected,'home','private'),ref('residents',affected,'occupation','private')];
 for(const [index,id] of actors.entries()){
  sourceRefs.push(ref('npcs',id,'occupation','private',spec.speeches[index]));
  sourceRefs.push(ref('npcs',id,'relationships','private',spec.speeches[index]));
  if(world.npcs.find(n=>n.id===id).socialProfile?.conflicts?.length)sourceRefs.push(ref('npcs',id,'socialProfile.conflicts[0]','private',spec.speeches[index]));
 }
 const risks=actors.flatMap(id=>{
  const person=world.npcs.find(n=>n.id===id),fields=person.secrets.map((_,i)=>`secrets[${i}]`);
  if(person.authoredFacts?.privateFact!==undefined)fields.push('authoredFacts.privateFact');
  return fields.map(field=>({id,field,hash:hashContent(getPath(person,field)),reason:'本人的完整秘密与私密行为只作L2/L4边界核对，不在这次有限公开说话中透露，不转给另一人的known或memory。'}));
 });
 return{id:`memory_sb_depth_shared_${spec.id}`,revision:'t09-event-v1',status:'past-but-unresolved',actors,location:spec.location,network:{actors:networkActors,problemRef,reason:spec.networkReason,nonWitnessActors:[affected]},sourceRefs,designedFacts:spec.facts,pendingOutcomes:spec.pending,narrative:spec.narrative,risks,associations:actors.map((id,i)=>({id,path:`memorySeeds[${world.npcs.find(n=>n.id===id).memorySeeds.length}]`,narrative:spec.narrative,factsHash:hashContent(spec.facts),viewpoint:spec.speeches[i]}))};
})};
const entries=depthEntries(design.patchRows.map(row=>row.before),design,world);
await fs.mkdir(output,{recursive:true});
async function writeFrozen(name,value){const file=path.join(output,name);try{assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),value,'独立来源已冻结，不覆盖');}catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});}}
await writeFrozen('authored-background.json',bundle);
const oldFiles=['base.json','candidate.json','foundation.json','manifest.json','offline-audit.json','source-evidence.json','source-classification.json','source-reading-packets.json','pronoun-precheck.json','author-precheck.json'];
await writeFrozen('opt-in-evidence.json',{stage:'independent-background-prepared-only',cardId:'T09',modelCalls:0,budgetWritten:false,sourceHash:hashContent(bundle),candidateChanges:[],originalBaseAndMemoryChanged:false,previousFiles:await Promise.all(oldFiles.map(async name=>({path:'../'+name,contentHash:hashContent(JSON.parse(await fs.readFile(path.join(root,name),'utf8')))}))),publicProblemEvents:5,privateLimitedScopeEvents:10,networkSizes:bundle.events.map(event=>event.network.actors.length),sourceRefs:bundle.events.flatMap(event=>event.sourceRefs.map(ref=>({eventId:event.id,...ref}))),boundary:'原问题/关系只支持相容性；具体共同在场与有限说话为新背景。网络第三人是相关成年住户，不是见证者，不获得新记忆。此冻结不是L2/L4通过。',pending:['独立出处与候选的真实L2逐叶审核','正式L4出处、风险及候选阅读','T11发布']});
try{
 const validated=validateAuthoredBackground(bundle,entries,world);
 await fs.writeFile(path.join(output,'source-validation.json'),JSON.stringify({stage:'pure-validator-only',passed:true,modelCalls:0,sourceHash:validated.sourceHash,events:bundle.events.length},null,2)+'\n');
 console.log(JSON.stringify({stage:'independent-background-prepared-only',events:bundle.events.length,actors:entries.length,sourceHash:validated.sourceHash,modelCalls:0,candidateChanges:0}));
}catch(error){
 const prefixCollisions=bundle.events.flatMap(event=>entries.filter(entry=>!event.actors.includes(entry.id)).flatMap(entry=>entry.patches.filter(p=>JSON.stringify(p.value).includes(event.id)&&p.value?.id!==event.id).map(p=>({eventId:event.id,outsider:entry.id,path:p.path,actualMemoryId:p.value?.id,actualKnownBy:p.value?.knownBy}))));
 const individualEvents=bundle.events.map(event=>{try{validateAuthoredBackground({...bundle,events:[event]},entries.filter(e=>event.actors.includes(e.id)),world);return{id:event.id,status:'individual-source-check-only-passed'};}catch(error){return{id:event.id,status:'failed',error:error.message};}});
 await writeFrozen('source-validation-failure-v1.json',{stage:'pure-validator-failed',passed:false,modelCalls:0,sourceHash:hashContent(bundle),error:error.message,prefixCollisions,individualEvents,boundary:'单事件检查不能替代官方全批验证或prepare；原候选和事件ID未改，公共合同修复交规划。'});
 console.error(error.message);process.exitCode=1;
}
