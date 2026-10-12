// Offline author evidence only. No client, review CLI or budget write is used.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {loadWorld} from '../../../../../tools/load-world.mjs';
import {hashContent} from '../../../../../tools/content-pipeline.mjs';
import {depthEntries,patchDraft,validatePatchResults,getPath} from '../../../../../tools/npc-depth-content.mjs';
import {auditNpcDepth} from '../../../../../tools/audit-npc-depth.mjs';
import {weitingRoster} from '../../../../design/w1-villages-weiting.mjs';
import * as design from '../sourced/design.mjs';

const out=new URL('./',import.meta.url),root=new URL('../sourced/',import.meta.url);
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const write=async(name,data)=>fs.writeFile(new URL(name,out),JSON.stringify(data,null,2)+'\n');
const world=await loadWorld();
const [foundation,base,candidate,originalL4]=await Promise.all(['foundation','base','candidate','l4-invalidations'].map(name=>read(new URL(name+'.json',root))));
const records=await Promise.all(foundation.entries.map(e=>read(new URL(e.id+'.json',root))));
const roster=new Map(weitingRoster.trim().split(/\r?\n/).map(line=>{const row=line.split('|');return['npc_wt_'+row[1],{id:'npc_wt_'+row[1],name:row[2],traits:row[6],concern:row[7]}];}));
const people=new Map([...world.npcs,...world.residents].map(p=>[p.id,p]));
const entries=depthEntries(base,design,world),changed=[];
const rosterFile='../../../../design/w1-villages-weiting.mjs';
const normalized=[];
for(const record of records){
 const old=foundation.entries.find(e=>e.id===record.id),legacy=originalL4.records.find(r=>r.id===record.id),findings=[];
 for(const patch of record.draft.patches){
  if(/^relationships\[\d+\]\.note$/.test(patch.path)){
   const index=Number(patch.path.match(/\d+/)[0]),relative=roster.get(old.before.relationships[index].with);
   if(relative){
    assert.ok(patch.value.includes('；'+relative.traits+'，这件事'),'原错误不是实际候选原文');
    const prior=legacy?.findings.find(f=>f.path===patch.path);
    findings.push({path:patch.path,quote:patch.value,reason:'实际备注把row[6]性格当成待商量事项；具体关系关注列为row[7]。',sourceConcern:relative.concern,sourceId:relative.id,sourceHash:hashContent(relative.concern),...(prior?{originalFindingHash:hashContent(prior),originalSourceHash:prior.sourceHash}:{}),sourceRef:{path:patch.path,collection:'frozen-roster',file:rosterFile,id:relative.id,field:'concern',hash:hashContent(relative.concern)}});
   }
  }
  if(/^opinions\.neighbors\[\d+\]\.view$/.test(patch.path)){
   const index=Number(patch.path.match(/\d+/)[0]),other=people.get(old.before.opinions.neighbors[index].with);
   if(other.sex==='女'&&patch.value.includes('与他谈')){
    const prior=legacy?.findings.find(f=>f.path===patch.path);
    findings.push({path:patch.path,quote:patch.value,reason:'原正式性别为女，实际候选固定男性代词。',sourceSex:other.sex,sourceId:other.id,sourceHash:hashContent(other.sex),...(prior?{originalFindingHash:hashContent(prior),originalSourceHash:prior.sourceHash}:{}),sourceRef:{path:patch.path,collection:'npcs',id:other.id,field:'sex',hash:hashContent(other.sex)}});
   }
  }
 }
 assert.ok(findings.length);
 normalized.push({id:record.id,priorStatus:record.status,operativeStatus:'invalidated-by-L4',recordHash:hashContent(record),draftHash:hashContent(record.draft),reviewHash:hashContent(record.review),findings});
 const next=entries.find(e=>e.id===record.id);
 assert.deepEqual(next.before,old.before);assert.deepEqual(next.issues,old.issues);
 assert.deepEqual(next.patches.map(p=>p.path),old.patches.map(p=>p.path));
 const actual=[...findings,...(record.review.contradictions??[]).filter(r=>r.severity==='hard').map(r=>({path:r.field,quote:r.quote}))];
 for(const previous of old.patches){
  const after=next.patches.find(p=>p.path===previous.path);
  if(hashContent(previous.value)===hashContent(after.value))continue;
  assert.ok(actual.some(f=>f.path===previous.path&&JSON.stringify(previous.value).includes(f.quote)),'非真实失效叶变更');
  changed.push({id:record.id,path:previous.path,before:previous.value,after:after.value,beforeHash:hashContent(previous.value),afterHash:hashContent(after.value)});
 }
}
const invalidations={kind:'controlled-L4-invalidation-evidence',originalFile:'../sourced/l4-invalidations.json',originalHash:hashContent(originalL4),boundary:'原24人L4逐项关联原finding hash；另外6manual也逐原文核对同源索引/代词错误。原记录、失败、attempts和出处均未改写。字段hash另规范化，旧整行/整人物hash仍保留。',records:normalized};
await write('l4-invalidations-normalized.json',invalidations);
await write('candidate-after.json',entries.map(patchDraft));
await write('patch-diff.json',{revision:design.revision,cardId:'T07',changes:changed});

const sourceHashes=[
 {file:'../source.json',hash:hashContent(await read(new URL('../source.json',root)))},
 {file:'base.json',hash:hashContent(base)},
 {file:rosterFile,hash:hashContent(await fs.readFile(new URL('../../../../design/w1-villages-weiting.mjs',root),'utf8'))},
 {file:'../controlled/original-author.json',hash:hashContent(await read(new URL('original-author.json',out)))},
];
await fs.mkdir(new URL('source-evidence/',out),{recursive:true});
const sourceAttachments=[];
for(const entry of entries){
 const old=foundation.entries.find(e=>e.id===entry.id),selected=new Map();
 const add=(id,fields)=>{const person=people.get(id);assert.ok(person);const row=selected.get(id)??{id,name:person.name};for(const field of fields){assert.notEqual(person[field],undefined);row[field]=structuredClone(person[field]);}selected.set(id,row);};
 add(entry.id,['home','relationships','goals']);
 for(const relation of old.before.relationships){
  if(roster.has(relation.with))add(relation.with,['currentConcern','sex']);
  else add(relation.with,['sex','occupation','workplace']);
 }
 if(entry.id==='npc_wt_xiangzhen')add('npc_wt_zhengxi',['sex','occupation','workplace']);
 const data={sourceRecords:[...selected.values()],reviewBoundary:'所有字段逐项来自正式原档。审核可核对家庭、性别、劳动地点与原目标；不因此向人物公开他人私有关切。具体未知及pending步骤仍是假设询问/待执行，不是已获同意或已完成事实。'};
 const file='source-evidence/'+entry.id+'.json';await write(file,data);
 sourceAttachments.push({id:entry.id,file:'../controlled/'+file,hash:hashContent(data),refs:data.sourceRecords.flatMap(row=>Object.keys(row).filter(f=>!['id','name'].includes(f)).map(field=>({collection:world.npcs.some(n=>n.id===row.id)?'npcs':'residents',id:row.id,field,hash:hashContent(row[field])})))});
}

const plan={kind:'controlled-depth-revision',planningId:'T07-controlled-author-repair-20261012',cardId:'T07',revision:foundation.revision,foundationHash:hashContent(foundation),baseHash:hashContent(base),candidateHash:hashContent(candidate),sourceHashes,invalidationFile:'../controlled/l4-invalidations-normalized.json',invalidationHash:hashContent(invalidations),authorized:records.map(record=>{
 const changes=changed.filter(c=>c.id===record.id),evidence=normalized.find(r=>r.id===record.id);
 return{id:record.id,recordHash:hashContent(record),draftHash:hashContent(record.draft),reviewHash:hashContent(record.review),paths:changes.map(c=>c.path),sourceOnly:false,invalidationSources:evidence.findings.map(f=>f.sourceRef),sourceEvidence:sourceAttachments.find(a=>a.id===record.id),sourceSupplementPaths:(record.review.contradictions??[]).filter(r=>r.severity==='hard'&&!changes.some(c=>c.path===r.field)).map(r=>r.field)};
})};
await write('controlled-plan.json',plan);

const settlement=world.settlementProfiles.find(p=>p.id==='loc_bs_weiting');
const topicByActor={zhengxi:'只说明门前指界人所需站位',wangpu:'只说明翻篓所需空间',zhouzhu:'只说明下岸退脚被苇束挡住',wupeng:'只说明苇束搬远后需分趟处理',weilian:'只说明旧网辨目需要迎光',huangting:'只说明空响岸石边检看要腾空',heqin:'只说明湿席处理需暂用水盆，归还时刻未约定',lvmo:'只说明备灶要清洗盆、取盆时刻仍需询问',shiqiao:'只说明自己想从干稳处看水',keli:'只说明割苇与捆苇须分开记工，不报未经核清的工数',duke:'只询问木件转弯所需空间，物主尚未授权通行',liuyan:'只说明菜床边不能踩苗，尚未同意搬运路线',zhangou:'只解释退水便道有水位条件',zhicai:'只说明送补衣交还次序要分别询问，不提客户身份',xueying:'只说自家旧根在门边需要整理，不披露家人私话',leizhi:'只说含混称呼需核对户别，不公开口信内容或收信人',niyun:'只比划晒架旁转身空隙，不讨论家人催清扫的私话',quhuai:'只说篱障缺口常被借道，不指认或责骂任何人',dingsu:'只说两个劳动时段撞在一起，不披露客户姓名或私约细节',ruqin:'只说明软硬苇料不能仅按颜色分',gonglu:'只说明湿网两头轻重及换肩的一般劳动原则，不提自己曾偏挑轻头',jingyao:'只指图询问可见岸湾，不披露私下藏稿',fanshui:'只说明旧垫需查松刺，不提故意拖慢留人的私事',shanju:'只说明认垛须核对扎口，不提曾偏分给熟人',dongfei:'只读一条劳动次序简记，不公开家人私话',peichun:'只说明桩根湿泥遮挡可见部位，不替物主认定承重安全',suhui:'只指菜叶上可见泥点，不传播家中闷气或邻人的私话',qilu:'只讲水情叙述要区分亲见与听说的一般原则，不说、暗示或推断任何本人冒称经历的旧事',huayin:'只查看阴处叶背，不披露私下丢草的旧事',xiangzhen:'只说明枯苇遮更路记号，不说家人夜归路线或原私事'};
const primaryProblems=[0,2,4,0,3,3,4],extraProblems={0:[1],1:[3]};
const ref=(collection,id,field,extras={})=>{const source=world[collection].find(p=>p.id===id);return{collection,id,field,hash:hashContent(getPath(source,field)),visibility:['npcs','residents'].includes(collection)?'private':'public',...extras};};
const events=design.authorBatches.map(batch=>{
 const problemField=`details.problems[${primaryProblems[batch.index]}]`;
 const actorRefs=batch.ids.flatMap(id=>{const key=id.slice(7),speech=topicByActor[key];assert.ok(speech);return[ref('npcs',id,'occupation',{publicSpeech:speech}),ref('npcs',id,'workplace',{publicSpeech:'仅说明本人日常劳动处；不产生新产权、进入或收费授权。'}),ref('npcs',id,key==='qilu'?'goals.mid[0].content':'goals.short[0].content',{publicSpeech:speech})];});
 const risks=batch.ids.flatMap(id=>people.get(id).secrets.map((secret,i)=>({id,field:`secrets[${i}]`,hash:hashContent(secret),reason:id==='npc_wt_qilu'?'密封本人过往冒称经历。事件只含区分亲见/听说的一般原则；不能把旧秘密、旧险遇或家中纠正谈话复制、暗示给其他参与者。':id==='npc_wt_gonglu'?'密封本人曾偏挑轻头的秘密；公开话仅谈湿网轻重的一般劳动安排，不含个人承认或旧误事。':'密封该人物原秘密。仅可说publicSpeech范围内的劳动/公共空间事项，不披露家事、隐瞒行为、客户私约或扩大旧秘密knownBy。'})));
 return{id:batch.memoryId,revision:design.revision,status:'past-but-unresolved',actors:batch.ids,location:batch.location,network:{id:'network_wt_depth_'+batch.index,actors:batch.ids,problemRef:{id:settlement.id,field:problemField},scope:'同一公开劳动/议事场所的3–5人交流网络；地方问题作为空间与劳动约束出处，成员并不因此替原当事人决定解法。'},sourceRefs:[ref('settlementProfiles',settlement.id,problemField),...(extraProblems[batch.index]??[]).map(i=>ref('settlementProfiles',settlement.id,`details.problems[${i}]`)),ref('locations',batch.location,'name'),...actorRefs],designedFacts:[`${batch.ids.map(id=>people.get(id).name).join('、')}在${world.locations.find(p=>p.id===batch.location).name}相互说明一次劳动安排；本次共同在场与发言为新作者设计，未作为旧已发布事件。`,...batch.ids.map(id=>`${people.get(id).name}的发言范围：${topicByActor[id.slice(7)]}。`),'这些交流没有解决分歧，也没有授予通行、用料、交付、收费或代理他人承诺的权限。'],pendingOutcomes:['各户同意、借用时段、路线范围和工序安排均仍待询问与核对。','没有交料、付款、发库存、转移产权、完成任务或新增知情授权。'],narrative:batch.event,risks,associations:batch.ids.map(id=>{const entry=entries.find(e=>e.id===id),patch=entry.patches.find(p=>p.path.startsWith('memorySeeds[')&&p.value.id===batch.memoryId);return{id,path:patch.path};})};
});
const background={kind:'authored-background',revision:design.revision,events};
await fs.writeFile(new URL('../authored-background.json',out),JSON.stringify(background,null,2)+'\n');
const merged=validatePatchResults(entries,world),issues=auditNpcDepth(merged).issues.filter(i=>entries.some(e=>e.id===i.id));assert.deepEqual(issues,[]);
for(const old of foundation.entries)assert.equal(hashContent(world.npcs.find(n=>n.id===old.id)),old.baseHash);
await write('offline-author-report.json',{status:'prepared-awaiting-T25-and-main-authorization',cardId:'T07',revision:design.revision,modelCalls:0,newSpendYuan:0,priorSpendYuan:1.99304752,remainingIncrementYuan:1.00695248,proposedPlanHash:hashContent(plan),authorizationGranted:false,originalFoundationHash:hashContent(foundation),originalBaseHash:hashContent(base),originalCandidateHash:hashContent(candidate),sourceHashes,backgroundHash:hashContent(background),changedIds:new Set(changed.map(c=>c.id)).size,changedPaths:changed.length,oldRecordsUnmodified:records.map(r=>({id:r.id,status:r.status,attempts:r.attempts,hash:hashContent(r)})),mergedAuditIssues:issues.length,fullCount:world.npcs.filter(n=>n.tier==='full').length,riverFullCount:world.npcs.filter(n=>n.id.startsWith('npc_hw_')&&n.tier==='full').length,L2:'not run for this revision',L4:'new revision/background not approved',sourceAttachments});
console.log(JSON.stringify({changedIds:new Set(changed.map(c=>c.id)).size,changedPaths:changed.length,events:events.length,mergedAuditIssues:issues.length,modelCalls:0,proposedPlanHash:hashContent(plan)}));
