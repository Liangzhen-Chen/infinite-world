import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadWorld} from '../../../../../tools/load-world.mjs';
import {hashContent} from '../../../../../tools/content-pipeline.mjs';
import {auditNpcDepth} from '../../../../../tools/audit-npc-depth.mjs';
import {validateNpcProfiles} from '../../../../../tools/npc-profile-validation.mjs';
import {depthEntries,patchDraft,getPath,contextFor,validateDraft,validatePatchResults,validateAuthoredBackground} from '../../../../../tools/npc-depth-content.mjs';
import {frozenT07SourceText,prepareDepthRevision} from '../../../../../tools/npc-depth.mjs';
import {validateSourceEvidence} from '../../../../../tools/npc-depth-source-evidence.mjs';
import * as priorDesign from '../sourced/design.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),sourced=path.join(root,'sourced');
const read=async file=>JSON.parse(await fs.readFile(path.resolve(root,file),'utf8'));
const write=(file,value)=>fs.writeFile(path.join(here,file),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const authorizationId='user-reopen-20261012-01',planningId='T07-user-reopen-20261012-01-offline-1';
const leaf=(entry,field)=>entry.patches.find(p=>p.path===field).value;
const rawHash=async file=>hashContent(await fs.readFile(path.resolve(root,file),'utf8'));
async function historicalFiles(dir=root){
 const result=[];
 for(const row of await fs.readdir(dir,{withFileTypes:true})){
  if(dir===root&&row.name==='reopen')continue;
  const file=path.join(dir,row.name);
  if(row.isDirectory())result.push(...await historicalFiles(file));
  else if(row.isFile())result.push(path.relative(root,file).replaceAll('\\','/'));
 }
 return result.sort();
}
function ref(world,collection,id,field){
 const quote=structuredClone(getPath(world[collection].find(n=>n.id===id),field));
 assert.notEqual(quote,undefined);
 return{collection,id,field,quote,hash:hashContent(quote)};
}

async function generate(){
 const world=await loadWorld(),base=await read('sourced/base.json'),foundation=await read('sourced/foundation.json');
 const entries=depthEntries(base,priorDesign,world),records=await Promise.all(entries.map(e=>read('sourced/'+e.id+'.json')));
 const stop=await read('controlled/recovery-stop.json'),parentPlan=await read('controlled/controlled-plan.json'),proof=await read('sourced/incremental-proof.json');
 const pending=[stop.blocked.id,...stop.unreviewedIds],changes=[],quotes=[];
 const source=(collection,id,field)=>{const value=ref(world,collection,id,field);if(!quotes.some(q=>q.collection===collection&&q.id===id&&q.field===field))quotes.push(value);return value;};
 function change(id,field,after,reason,refs){
  assert.ok(pending.includes(id),'不得改已有12有效通过人物');
  const before=structuredClone(leaf(entries.find(e=>e.id===id),field));assert.notDeepEqual(after,before);
  changes.push({id,path:field,before,after,beforeHash:hashContent(before),afterHash:hashContent(after),reason,sourceRefs:refs});
 }
 const z='npc_wt_zhangou';
 change(z,'knowledge.unknown[0]','哪一段涨水前的小径仍被问路人当作常路，尚待逐段核对。','未知项只询问本人原目标涉及的小径，不预设已获知配偶借签私事。',[source('npcs',z,'goals.short[0].content'),source('npcs',z,'knowledge.unknown')]);
 change(z,'knowledge.unknown[1]','问路人是否能辨清只有退水才可走的路段，尚待询问。','没有原源确认与向祯的核对请求；改为原长目标内尚未获知的辨路情况。',[source('npcs',z,'goals.long[0].content'),source('npcs',z,'goals.mid[0].content')]);
 const zsteps={short:'计划先在干处指出被误当常路的湿路段；是否需要带看旧箭头仍待问路人同意，尚未带路。',mid:'计划在白日核对退水路段，再拟补记号的说明；须先核实有关当事人同意，尚未补写或约定。',long:'计划先询问陌生来人怎样辨认湿路边界，再解释未辨清的路段；尚未发生这次交谈。'};
 for(const term of ['short','mid','long'])change(z,`goals.${term}[0].steps[0].content`,zsteps[term],'明确为原目标内的pending计划；同意、带路及补写均未发生。',[source('npcs',z,`goals.${term}[0].content`),source('npcs',z,`goals.${term}[0]`)]);
 change(z,'relationships[0].note','湛姝是我的女儿；我解释湿路时是否让她为难，尚待当面询问，未把她的顾虑当作已向我说过。','家属关切是审核出处；原源没有向湛鸥实际转告这段顾虑的记录。',[source('npcs',z,'relationships[0]'),source('residents','npc_wt_zhanshu','currentConcern'),source('npcs',z,'knowledge.unknown')]);
 change(z,'relationships[1].note','虞菡是我的配偶；她是否有路签事项需要我帮着询问尚不清楚，借给哪户及归还时刻均未获知。','关系身份不授予配偶私事知情权，借签及去向保留未知。',[source('npcs',z,'relationships[1]'),source('residents','npc_wt_yuhan','currentConcern'),source('npcs',z,'knowledge.unknown')]);

 // Only source-proven private/unspoken concerns in the 17 pending IDs change.
 // Concrete household matters stay as future questions, never reported speech.
 const family=[
 ['zhicai',0,'支络是我的儿子；补衣前还需问他衣口扯破的原因，不能把他没开口当作认错。','zhiluo'],
 ['zhicai',1,'姚蓉是我的母亲；她对我替孩子说话有什么意见尚待问清，饭桌上收住的话不能当作已经说明。','yaorong'],
 ['xueying',1,'谭瑶是我的儿媳；是否清掉门边旧根还需先问她的想法，未把她收拾中停手当作同意或反对。','tanyao'],
 ['leizhi',0,'雷华是我的儿子；他愿意谈多少托话人的事尚待问清，饭桌上的沉默不说明他是否害怕被追问。','leihua'],
 ['niyun',0,'倪梅是我的配偶；门边木屑妨碍她进出到什么程度尚待询问，她压着没说的话不能当作已经商量。','nimei'],
 ['quhuai',0,'屈荷是我的配偶；她对我在篱口高声说话有什么意见尚待询问，未把她的私下想法当作已转告。','quhe'],
 ['quhuai',1,'屈健是我的儿子；他是否想换用别的篱绳结尚待询问，具体结法与试用时段未获知，也未同意改篱口。','qujian'],
 ['gonglu',0,'龚妍是我的配偶；邻人是否向她问过搬网的事尚待问清，我没有获知她私下怎样想。','gongyan'],
 ['gonglu',1,'龚宛是我的女儿；她是否想帮着理网边还需询问，没有让她试抬湿网或认定她能承担搬网。','gongwan'],
 ['jingyao',0,'景丰是我的父亲；他对我揉掉画坏的纸有什么意见尚待询问，未说出口的心疼不能当作已经告诉我。','jingfeng'],
 ['fanshui',0,'范柳是我的女儿；她出工前能陪我谈多久尚待询问，站在门口时心里是否发急并未获知。','fanliu'],
 ['fanshui',1,'解芷是我的外孙女；听旧事会不会误了她回屋温书尚待询问，不把她怕打断的想法当作已说过。','xiezhi'],
 ['shanju',0,'单馨是我的配偶；邻里说分垛的事时她有什么顾虑尚待询问，未让她替我认错或代作承诺。','shanxin'],
 ['dongfei',0,'董露是我的女儿；我说话交代活的语气会不会让她紧张尚待询问，不从她翻作业本推定她的心思。','donglu'],
 ['dongfei',1,'扈惠是我的母亲；柴火简记哪些缩字她没认清尚待询问，没追问不等于她都看懂了。','huhui'],
 ['suhui',0,'宿弦是我的母亲；我回家不说话时她有什么担心尚待询问，她压回去的问题没有成为已经发生的交谈。','suxian'],
 ['qilu',1,'戚梅是我的女儿；她对我说旧水情有什么意见尚待询问，放下筷子不表示她已经说明了自己的顾虑。','qimei'],
 ['huayin',1,'贾苗是我的母亲；她的旧看叶经验与我眼下做法哪里不相符尚待问清，不把心里搁着的意见当作已经谈过。','jiamiao'],
 ['xiangzhen',0,'向菲是我的配偶；她天黑前回村时能否辨认新记号尚待询问，未预设她夜归或已指出误认岔口。','xiangfei'],
 ['xiangzhen',1,'向涛是我的儿子；他能否分清路记号与随手画的圈尚待询问，未让他参加夜路核查。','xiangtao'],
 ];
 for(const [key,index,after,relative]of family){const id='npc_wt_'+key;change(id,`relationships[${index}].note`,after,'原居民currentConcern包含私下想法或未说出口的顾虑；原本人关系只证明亲属身份，不证明这段内容已转告。',[source('residents','npc_wt_'+relative,'currentConcern'),source('npcs',id,`relationships[${index}]`),source('npcs',id,'knowledge.unknown')]);}
 change('npc_wt_quhuai','knowledge.unknown[0]','屈健是否想尝试别的篱绳结，具体做法和是否适合篱口尚未问清。','原源只写私下练习、怕父亲发火且没敢试；原候选“提出的新篱绳结”把未发生的提出当成事实。',[source('residents','npc_wt_qujian','currentConcern'),source('npcs','npc_wt_quhuai','relationships[1]')]);
 const g='npc_wt_gonglu';
 change(g,'knowledge.unknown[0]','同伴是否愿意再与我配对搬网，换肩与换边如何约定尚待当面询问。','原mid目标是尚待约定，候选“按约换肩”误预设已经有约。',[source('npcs',g,'goals.mid[0].content'),source('npcs',g,'goals.short[0]'),source('npcs',g,'goals.mid[0]')]);
 change(g,'knowledge.unknown[1]','龚妍是否愿意听我说明搬网遇到的困难尚待询问，没有约定她陪我向邻人说话。','保留家属可用时间/意愿未知，删除无原源的陪同安排。',[source('npcs',g,'relationships[0].type'),source('npcs',g,'relationships[0]'),source('npcs',g,'goals.mid[0]')]);
 const gsteps={short:'计划先询问同伴不愿配对搬网的原因；对方是否愿意谈仍未知，尚未交谈或作出配对承诺。',mid:'计划当面提出换肩和换边的办法，先问同伴是否愿意商量；地点与分担均未约定。',long:'计划在对方愿意商量后核对搬网分担；不预设下一趟搭工已被接受，尚未恢复配对。'};
 for(const term of ['short','mid','long'])change(g,`goals.${term}[0].steps[0].content`,gsteps[term],'原目标为未完成的配对/约定；新内容明确pending，不新增已同意或每趟固定执行的承诺。',[source('npcs',g,`goals.${term}[0].content`),source('npcs',g,`goals.${term}[0]`)]);
 const x='npc_wt_xiangzhen';
 change(x,'knowledge.known[1]',{...leaf(entries.find(e=>e.id===x),'knowledge.known[1]'),fact:'我的住处在苇汀；向菲是我的配偶。'},'真实hard提出第一人称住处表述问题；沿原home和配偶关系改写，不改住处或关系。',[source('npcs',x,'relationships[0].type'),source('npcs',x,'home'),source('npcs',x,'relationships[0]')]);
 change(x,'knowledge.unknown[0]','向菲天黑前回村时是否认得新记号，尚待询问。','原currentConcern写天黑前赶回；原候选夜归/已看不清岔口没有来源。',[source('residents','npc_wt_xiangfei','currentConcern'),source('npcs',x,'knowledge.unknown')]);
 change(x,'knowledge.unknown[1]','晚归者能否辨认新苇遮住的旧路记号，尚待询问。','删除未确认的郑汐听取请求，只保留本人原目标内的未知。',[source('npcs',x,'goals.short[0].content'),source('npcs',x,'goals.short[0]'),source('npcs',x,'goals.long[0]')]);
 change(x,'goals.mid[0].steps[0].content','计划白日沿原路核对被新苇遮住的拐点，先确认可用时间及有关当事人同意；尚未核查，也未请家人同行。','沿原mid目标找回拐点，删除无来源的配偶协作与误认处。',[source('npcs',x,'goals.mid[0].content'),source('npcs',x,'goals.mid[0]')]);
 const background=await read('authored-background.json'),nextBackground=structuredClone(background),last=nextBackground.events.find(e=>e.actors.includes(x));
 const newNarrative=last.narrative.replace('戚鹭区分听来的旧水情','戚鹭只谈水情叙述怎样分清亲见和转述的一般原则');assert.notEqual(newNarrative,last.narrative);
 const speech=last.sourceRefs.find(r=>r.id==='npc_wt_qilu'&&r.field==='goals.mid[0].content');
 for(const actor of last.actors){const entry=entries.find(e=>e.id===actor),patch=entry.patches.find(p=>p.value?.id===last.id);change(actor,patch.path,{...patch.value,event:newNarrative},'向祯旧hard指出共享叙述可能披露戚鹭旧私事；只收窄到独立作者来源已声明的一般说话范围，全部五方同步。',[source('npcs','npc_wt_qilu','goals.mid[0].content')]);}
 const backgroundChange={eventId:last.id,before:last.narrative,after:newNarrative,sourceFile:'../authored-background.json',sourceHash:hashContent(background),publicSpeech:speech.publicSpeech,sourceRef:speech};last.narrative=newNarrative;
 // All original sourceRefs, risks, designedFacts and participant boundaries stay.
 const normalized=await read('controlled/l4-invalidations-normalized.json');
 const finding=change=>{
  const sourceRef=change.sourceRefs.find(r=>typeof r.quote==='string');assert.ok(sourceRef,'失效须有原字符串字段出处');
  const {quote,...ref}=sourceRef;
  const oldValue=records.find(r=>r.id===change.id).draft.patches.find(p=>p.path===change.path).value;
  return{path:change.path,quote:typeof change.before==='string'?change.before:change.before.event??change.before.fact,quoteBasis:'controlled/candidate-after.json',candidateValueHash:change.beforeHash,oldRecordValue:oldValue,oldRecordValueHash:hashContent(oldValue),reason:change.reason,sourceConcern:quote,sourceId:ref.id,sourceHash:ref.hash,sourceRef:{path:change.path,...ref},sourceRefs:change.sourceRefs};
 };
 const queue=pending.map(id=>{
  const record=records.find(r=>r.id===id),changed=changes.filter(c=>c.id===id),old=parentPlan.authorized.find(a=>a.id===id);
  const state=id===z?'failed-latest-L2':record.status==='manual'?'historical-failed-unreviewed-controlled-L2':'L4-invalidated-unreviewed-controlled-L2';
  return{id,state,controlledL2Unreviewed:id!==z,priorStatus:record.status,latestRecovery:record.reviewRecovery?.status??'not-run',recordHash:hashContent(record),draftHash:hashContent(record.draft),reviewHash:hashContent(record.review),latestHardPaths:(record.review?.contradictions??[]).filter(f=>f.severity==='hard').map(f=>f.field),paths:changed.map(c=>c.path),inheritedPaths:old.paths,sourceOnly:changed.length===0,invalidationSources:changed.map(c=>finding(c).sourceRef),inheritedInvalidationSources:old.invalidationSources,sourceSupplementPaths:old.sourceSupplementPaths,inheritedAuthorizationHash:hashContent(old),originalInvalidationHash:hashContent(normalized.records.find(r=>r.id===id)),sourceEvidence:old.sourceEvidence};
 });
 const invalidations={kind:'controlled-L4-invalidation-evidence',authorizationId,planningId,boundary:'本次离线证据不是L4批准。新发现以原字段和旧draft逐叶引用；原24人失效/30人规范化清单均保留。',records:queue.filter(q=>q.paths.length).map(q=>({id:q.id,priorStatus:q.priorStatus,operativeStatus:'invalidated-by-L4',recordHash:q.recordHash,draftHash:q.draftHash,reviewHash:q.reviewHash,findings:changes.filter(c=>c.id===q.id).map(finding)}))};
 const oldProofs=await Promise.all(['controlled/controlled-plan.json','controlled/l4-invalidations-normalized.json','sourced/l4-invalidations.json','sourced/incremental-proof.json','controlled/source-checkout-evidence.json','controlled/recovery-stop.json','authored-background.json'].map(async file=>({file,hash:hashContent(await read(file))})));
 const plan={kind:'controlled-depth-revision',cardId:'T07',authorizationId,planningId,revision:priorDesign.revision,status:'offline-pending-T49',foundationHash:hashContent(foundation),baseHash:hashContent(base),candidateHash:hashContent(await read('sourced/candidate.json')),predecessorCandidateFile:'../controlled/candidate-after.json',predecessorCandidateHash:hashContent(await read('controlled/candidate-after.json')),parentPlanFile:'../controlled/controlled-plan.json',parentPlanHash:hashContent(parentPlan),priorProofFile:'incremental-proof.json',priorProofHash:hashContent(proof),sourceHashes:parentPlan.sourceHashes,sourceCheckoutEvidence:{file:'../controlled/source-checkout-evidence.json',hash:hashContent(await read('controlled/source-checkout-evidence.json'))},oldProofs,invalidationFile:'../reopen/l4-invalidations.json',invalidationHash:hashContent(invalidations),authorized:queue,changes,backgroundChange,backgroundFile:'../reopen/authored-background.json',attemptLimit:2,realL2:false,realL4:false};
 const files=await historicalFiles(),originalFiles=await Promise.all(files.map(async file=>({file,rawHash:await rawHash(file)})));
 await write('patch-diff.json',changes);await write('source-quotes.json',quotes);await write('old-records.json',records.filter(r=>pending.includes(r.id)));
 await write('authored-background.json',nextBackground);await write('l4-invalidations.json',invalidations);await write('controlled-plan.json',plan);
 await write('freeze.json',{authorizationId,planningId,authorizationHash:hashContent(plan),originalFiles,sourceHashes:parentPlan.sourceHashes,oldProofs,records:records.map(r=>({id:r.id,status:r.status,recordHash:hashContent(r)})),recordedAt:new Date().toISOString()});
 const design=await import('./design.mjs'),next=depthEntries(base,design,world);await write('candidate-after.json',next.map(patchDraft));
 const report=await check();
 // Read-only guard, before constructing a client or touching any budget/record.
 try{await prepareDepthRevision({worldRoot:path.resolve('world'),cardId:'T07',root:sourced,design:path.join(here,'design.mjs'),controlledRevision:path.join(here,'controlled-plan.json'),authorizationHash:hashContent(plan),authoredBackground:path.join(here,'authored-background.json'),sourceCheckoutEvidence:path.join(root,'controlled/source-checkout-evidence.json')});throw Error('旧工具应拒绝新的授权链');}catch(error){assert.match(error.message,/规划已冻结|钉死|换行|原规划/);report.guard=error.message;}
 return report;
}

export async function check(){
 const world=await loadWorld(),base=await read('sourced/base.json'),plan=await read('reopen/controlled-plan.json'),freeze=await read('reopen/freeze.json'),changes=await read('reopen/patch-diff.json'),stop=await read('controlled/recovery-stop.json');
 assert.equal(plan.authorizationId,authorizationId);assert.equal(plan.planningId,planningId);assert.equal(freeze.authorizationHash,hashContent(plan));assert.deepEqual(plan.changes,changes);
 for(const file of freeze.originalFiles)assert.equal(await rawHash(file.file),file.rawHash,'原文件逐字改变 '+file.file);
 for(const proof of plan.oldProofs)assert.equal(hashContent(await read(proof.file)),proof.hash);
 const parent=await read('controlled/controlled-plan.json'),witness=await read('controlled/source-checkout-evidence.json');assert.deepEqual(plan.sourceHashes,parent.sourceHashes);
 for(const source of parent.sourceHashes){const file=path.resolve(sourced,source.file);const data=source.file.endsWith('.mjs')?frozenT07SourceText(source,await fs.readFile(file,'utf8'),witness,parent):JSON.parse(await fs.readFile(file,'utf8'));assert.equal(hashContent(data),source.hash);}
 const quotes=await read('reopen/source-quotes.json');for(const quote of quotes){assert.deepEqual(ref(world,quote.collection,quote.id,quote.field),quote);}
 const pending=[stop.blocked.id,...stop.unreviewedIds];assert.equal(stop.unreviewedIds.length,17);assert.deepEqual(plan.authorized.map(q=>q.id),pending);
 const oldRecords=await read('reopen/old-records.json');
 for(const row of freeze.records)assert.equal(row.recordHash,hashContent(await read('sourced/'+row.id+'.json')));
 for(const item of plan.authorized){const record=await read('sourced/'+item.id+'.json');assert.deepEqual(record,oldRecords.find(r=>r.id===item.id));assert.equal(hashContent(record),item.recordHash);assert.equal(hashContent(record.draft),item.draftHash);assert.equal(hashContent(record.review),item.reviewHash);assert.deepEqual(item.paths,changes.filter(c=>c.id===item.id).map(c=>c.path));}
 assert.equal(plan.invalidationHash,hashContent(await read('reopen/l4-invalidations.json')));
 const design=await import('./design.mjs'),old=depthEntries(base,priorDesign,world),entries=depthEntries(base,design,world);
 const sourceCoverage=[];
 for(const item of plan.authorized){const evidence=JSON.parse(await fs.readFile(path.resolve(sourced,item.sourceEvidence.file),'utf8'));assert.equal(hashContent(evidence),item.sourceEvidence.hash);validateSourceEvidence(evidence,entries.find(e=>e.id===item.id),world);sourceCoverage.push({id:item.id,file:item.sourceEvidence.file,hash:item.sourceEvidence.hash,refs:item.sourceEvidence.refs});}
 const preservedIds=[],preservedSiblings=[];
 for(const entry of entries){const before=old.find(e=>e.id===entry.id),allowed=changes.filter(c=>c.id===entry.id);assert.deepEqual(entry.before,before.before);assert.deepEqual(entry.issues,before.issues);assert.deepEqual(entry.patches.map(p=>p.path),before.patches.map(p=>p.path));
  if(!allowed.length){assert.deepEqual(entry,before);assert.deepEqual(contextFor(entry,world),contextFor(before,world));preservedIds.push(entry.id);}
  for(const patch of entry.patches){const change=allowed.find(c=>c.path===patch.path);if(change){assert.deepEqual(leaf(before,patch.path),change.before);assert.deepEqual(patch.value,change.after);assert.equal(hashContent(change.before),change.beforeHash);assert.equal(hashContent(change.after),change.afterHash);assert.ok(change.sourceRefs.length);for(const q of change.sourceRefs)assert.deepEqual(ref(world,q.collection,q.id,q.field),q);}else{assert.deepEqual(patch.value,leaf(before,patch.path));preservedSiblings.push({id:entry.id,path:patch.path});}}
  assert.deepEqual(entry.facts.memorySeeds.slice(0,entry.before.memorySeeds.length),entry.before.memorySeeds);assert.deepEqual(entry.facts.secrets,entry.before.secrets);
 }
 const passed=freeze.records.filter(r=>!pending.includes(r.id));assert.equal(passed.length,12);assert.ok(passed.every(r=>r.status==='passed'&&preservedIds.includes(r.id)));
 const L1Errors=entries.flatMap(e=>validateDraft(patchDraft(e),e).errors.map(error=>({id:e.id,error})));assert.deepEqual(L1Errors,[]);assert.deepEqual(await read('reopen/candidate-after.json'),entries.map(patchDraft));
 const background=await read('reopen/authored-background.json'),oldBackground=await read('authored-background.json');validateAuthoredBackground(background,entries,world);
 const events=background.events.map((event,i)=>{const previous=oldBackground.events[i];assert.deepEqual({...event,narrative:previous.narrative},previous);return{id:event.id,actors:event.actors,sourceHash:hashContent(event.sourceRefs),risks:event.risks,closed:true,authorSourceUnreviewed:true};});
 const merged=validatePatchResults(entries,world),audit=auditNpcDepth(merged),issues=audit.issues.filter(i=>i.id.startsWith('npc_wt_'));assert.deepEqual(issues,[]);assert.ok(audit.legacyTraits.ok);
 assert.deepEqual(audit.issues.filter(i=>!i.id.startsWith('npc_wt_')),auditNpcDepth(world).issues.filter(i=>!i.id.startsWith('npc_wt_')));const structural=validateNpcProfiles(merged);assert.deepEqual(structural,[]);
 return{authorizationId,planningId,authorizationHash:hashContent(plan),changedPaths:changes.map(({id,path})=>({id,path})),pendingIds:plan.authorized,preservedPassedIds:passed.map(r=>r.id),preservedIds,preservedSiblings,L1Errors,targetedAuditIssues:issues,structuralErrors:structural,events,sourceCoverage,originalFilesPreserved:freeze.originalFiles.length,guard:null,realL2:false,realL4:false,modelCalls:0,newSpendYuan:0,budgetWrites:0,formalWrites:0,budgetHistory:{spentYuan:2.76263016,newCumulativeLimitYuan:4.5,maxRemainingYuan:1.73736984,firstIdLimitYuan:.50,phase:'reference-only-no-grant-or-request'},nextEntry:{id:'npc_wt_zhangou',tool:'npc-depth-review.mjs',design:'world/drafts/w1/wt-depth/reopen/design.mjs',root:'world/drafts/w1/wt-depth/sourced',controlledRevision:'world/drafts/w1/wt-depth/reopen/controlled-plan.json',authoredBackground:'world/drafts/w1/wt-depth/reopen/authored-background.json',sourceCheckoutEvidence:'world/drafts/w1/wt-depth/controlled/source-checkout-evidence.json',authorizationId,requires:'T49合入并验证继承旧proof/换行凭证及未审分支，主会话授模型槽后直接L2；不重回显draft'},recordedAt:new Date().toISOString()};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const report=process.argv.includes('--check')?await check():await generate();if(!process.argv.includes('--check'))await write('offline-report.json',report);
 console.log(JSON.stringify({planningId:report.planningId,authorizationHash:report.authorizationHash,changedPaths:report.changedPaths,L1Errors:report.L1Errors,targetedAuditIssues:report.targetedAuditIssues,guard:report.guard,modelCalls:report.modelCalls,newSpendYuan:report.newSpendYuan}));
}
