import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadWorld} from '../../../../tools/load-world.mjs';
import {hashContent} from '../../../../tools/content-pipeline.mjs';
import {depthEntries,getPath} from '../../../../tools/npc-depth-content.mjs';
import {liquanRoster} from '../../../design/w1-villages-liquan.mjs';
import * as design from '../../../design/w1-lq-depth.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const world=await loadWorld(path.resolve(root,'../../..'));
const roster=liquanRoster.trim().split(/\r?\n/).map(row=>row.split('|'));
assert.ok(roster.every(row=>row.length===9),'砾泉名册列数须逐村核验');
const archive=JSON.parse(await fs.readFile(path.join(root,'offline-v1-evidence/original-hashes.json'),'utf8'));
for(const file of archive.files){
 const checkedOut=await fs.readFile(path.join(root,file.path),'utf8');
 assert.equal(file.originalLineEnding,'LF');
 const originalBytes=Buffer.from(checkedOut.replace(/\r\n/g,'\n'),'utf8');
 assert.equal(originalBytes.length,file.bytes);
 assert.equal(createHash('sha256').update(originalBytes).digest('hex'),file.sha256,'原离线证据不得覆盖：'+file.path);
}
const old=JSON.parse(await fs.readFile(path.join(root,'candidate.json'),'utf8'));
const entries=depthEntries(design.patchRows.map(row=>row.before),design,world);
const people=[...world.npcs,...world.residents];
const record=p=>Object.fromEntries(['id','name','sex','occupation','home',...(p.tier==='full'?['workplace','knowledge','memorySeeds','goals','relationships','notes','description']:['currentConcern'])].filter(key=>Object.hasOwn(p,key)).map(key=>[key,structuredClone(p[key])]));
const changes=[];
const patchSources=[];
for(const entry of entries){
 assert.deepEqual(entry.before,world.npcs.find(n=>n.id===entry.id),'不改冻结原档或正式人物');
 const earlier=old.find(row=>row.id===entry.id);
 const group=design.groups.find(g=>g.participants.includes(entry.id.slice(7)));
 for(const patch of entry.patches){
  const previous=earlier.patches.find(p=>p.path===patch.path);
  assert.ok(previous,'不新增改动路径');
  const relationIndex=patch.path.match(/^(?:relationships|opinions\.neighbors)\[(\d+)\]/)?.[1];
  let kind='authored-inference-from-existing-personal-facts',sourceIds=[entry.id],sourceFields=['description','notes'];
  let boundary='原个人资料支持人物处境与口吻；候选对具体说法的推演仍待 L2/L4，不能把作者解释当成旧亲历。';
  if(patch.path==='knowledge.known[1]'){kind='paraphrase-of-existing-personal-experience';sourceFields=['memorySeeds','workplace','description'];boundary='本人旧记忆支持个人经历，工作地点仅作场景依据，不证明其他人物曾在场。';}
  if(patch.path==='knowledge.known[2]'||patch.path.startsWith('memorySeeds[')){kind='new-public-background';sourceIds=group.participants.map(key=>'npc_lq_'+key);sourceFields=['occupation','workplace','notes','goals'];boundary='旧来源未登记此次共同会面。是作者新增公共背景，等待 T25 独立背景 opt-in 及 L2/L4；当事人身份和地方问题不是旧亲历证明。';}
  if(patch.path.startsWith('goals.')){kind='pending-action-for-original-goal';sourceFields=['goals'];boundary='只是未完成的行动步骤；保留原目标、进度、权限和资源，不以此证明已经商定或执行。';}
  if(patch.path.startsWith('knowledge.unknown')){kind='specific-unanswered-question';sourceFields=['goals','notes'];boundary='具体待知事项，不断言答案，也不将家属 currentConcern 自动写成人物已知。';}
  if(relationIndex!==undefined){
   const relation=entry.before.relationships[Number(relationIndex)];sourceIds=[entry.id,relation.with];
   if(relation.type==='同村日常往来'){kind='authored-local-relationship-cause';sourceFields=['relationships','occupation','goals'];boundary='原档只有同村关系；具体交谈或劳动联系是作者补入的背景，不属于已有双边共享历史，待 T25/L2/L4 核查。';}
   else{kind='family-concern-paraphrase-with-author-inference';sourceFields=['relationships','currentConcern'];boundary='家属原 currentConcern 与原名册 row[7]支持家庭处境；新增劝说、争论等具体互动是作者推演，原角色关系及私有财物未改。';}
  }
  const row={id:entry.id,path:patch.path,kind,sourceIds,sourceFields,boundary,candidateValueHash:hashContent(patch.value)};
  if(kind==='new-public-background')row.group=group.key;
  patchSources.push(row);
  if(hashContent(previous.value)!==hashContent(patch.value)){
   const goalTerm=patch.path.match(/^goals\.(short|mid|long)/)?.[1];
   const counterpart=relationIndex!==undefined?people.find(p=>p.id===entry.before.relationships[Number(relationIndex)].with):null;
   const comparison=goalTerm?{field:`goals.${goalTerm}[0].content`,value:entry.before.goals[goalTerm][0].content}:counterpart?{id:counterpart.id,field:'currentConcern',value:counterpart.currentConcern}:null;
   assert.ok(comparison,'每个实际变化须有原源逐叶对照');
   changes.push({...row,previous:previous.value,revised:patch.value,originalSource:comparison,reason:goalTerm?'原步骤缺少该个人目标的关键行动或偏向另一事务，补回具体行动，仍为pending。':'旧作者将原人物的等待或未收拾状态写成催促，改回正式 currentConcern 的具体行为。'});
  }
 }
}
const used=new Set(entries.flatMap(e=>[e.id,...e.before.relationships.map(r=>r.with)]));
const personChecks=entries.map(e=>({
 id:e.id,name:e.before.name,sex:e.before.sex,occupation:e.before.occupation,
 workplace:world.locations.find(p=>p.id===e.before.workplace.location)?.name,
 originalGoals:structuredClone(e.before.goals),
 candidateSteps:Object.fromEntries(['short','mid','long'].map(term=>[term,getPath(e.facts,`goals.${term}[0].steps[0].content`)])),
 references:e.before.relationships.map(r=>{
  const p=people.find(p=>p.id===r.with),row=roster.find(row=>'npc_lq_'+row[1]===p.id);
  assert.equal(p.name,row?.[2]??p.name);if(row){assert.equal(p.sex,row[3].slice(-1));assert.equal(p.occupation,row[5]);}
  return{id:p.id,name:p.name,sex:p.sex,occupation:p.occupation,home:world.locations.find(l=>l.id===p.home.location)?.name,relationshipType:r.type,...(row?{rosterTraits:row[6],rosterConcern:row[7],formalConcern:p.currentConcern,sourceColumn:7}:{})};
 }),
 boundary:'逐人作者来源预检，不是 L2 或 L4 通过凭证。',
}));
const privacy={
 'stone-mark':'不把猜字写成真相；未引用栾佩漏记外户要求、焦岩隐藏崩边等私事。',
 'mud-water':'只讨论泥与沟的公共处境，不证明缺水原因；未转述储茵私下先开沟或满渠托病。',
 'passage':'未透露甄希藏练习石、封济夜间肩疼等秘密；封济未搬重物，未新增技能或授权。',
 'work-dust':'只谈检看范围与落尘；未散播宙梧自用柄、华钮早判或聂雅留裂签的秘密。',
 'wash-identify':'只谈辨认办法，未转述青岚插队、明禾拖活等秘密，未交付物件。',
 'readback':'易可仅谈结解开后难认，不承认自己忘过用途。匡叶更正代答有原公开记忆，但新增听众仍需独立审核。',
};
const report={
 stage:'author-precheck-only',revision:design.revision,originalCommit:'89546d6',modelCalls:0,incrementSpentYuan:0,
 rosterColumns:{traits:6,concern:7,meaning:'砾泉逐行实际核验；没有从其他村假设列结构。'},
 newSharedBackgrounds:design.groups.map(g=>({...g,classification:'new-public-background',existingJointExperienceSource:null,privateRisk:privacy[g.key],reviewStatus:'pending-T25-opt-in-L2-L4'})),
 patchSources,changes,personChecks,
 sourceRecords:people.filter(p=>used.has(p.id)).map(record),
 placeRecords:world.locations.filter(l=>entries.some(e=>l.id===e.before.workplace.location||l.id===e.before.home.location)||design.groups.some(g=>g.location===l.id)).map(l=>({id:l.id,name:l.name,parent:l.parent,purpose:l.purpose,access:l.access})),
 pending:['T25 explicit background opt-in','L2','L4','T11 publication'],
};
await fs.mkdir(path.join(root,'author-v2'),{recursive:true});
await fs.writeFile(path.join(root,'author-v2/author-source-checklist.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({people:personChecks.length,patchSources:patchSources.length,changedLeaves:changes.length,newBackgrounds:report.newSharedBackgrounds.length,modelCalls:0,stage:report.stage}));
