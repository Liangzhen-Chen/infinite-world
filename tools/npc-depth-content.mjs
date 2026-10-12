import assert from 'node:assert/strict';
import {findNpcRuleWording} from './npc-profile-validation.mjs';
import {hashContent,parseModelJSON,defaultReviewRequest} from './content-pipeline.mjs';
import {depthRows,sharedEvents,applyDepthFacts,revision,knowledgeWordingCorrections} from '../world/design/w1-yupo-depth.mjs';
import * as nextBatch from '../world/design/w1-yupo-depth-next.mjs';
import {auditNpcDepth} from './audit-npc-depth.mjs';
export {revision};
export const depthBatches={'yupo-depth':{depthRows,sharedEvents,applyDepthFacts,revision,knowledgeWordingCorrections},'yupo-depth-next':nextBatch};
export const changedFields=['voice','knowledge','relationships','goals','memorySeeds'];
export function depthEntries(base,batch='yupo-depth',world){const config=typeof batch==='object'?batch:depthBatches[batch];if(!config)throw Error(`未登记人物批次：${batch}`);if(config.patchRows)return patchEntries(base,config,world);const corrections=config.knowledgeWordingCorrections??[];return config.depthRows.map(row=>{const before=base.find(n=>n.id===row.id);if(!before)throw Error(`缺少原人物：${row.id}`);return{id:row.id,before:structuredClone(before),facts:config.applyDepthFacts(before,row),sharedEvent:config.sharedEvents[row.event],...(row.referenceSexIds?{referenceSexIds:row.referenceSexIds}:{}),...(corrections.some(c=>c.id===row.id)?{knowledgeWordingCorrections:corrections.filter(c=>c.id===row.id)}:{})};});}
export function contextFor(entry,world){if(entry.contract==='audit-patch-v1'){const context=patchContext(entry,world);return entry.authoredBackground?authoredReviewContext(context,entry.authoredBackground,entry,world):context;}const ids=new Set([...entry.before.relationships.map(r=>r.with),...entry.facts.relationships.map(r=>r.with),...entry.sharedEvent.participants]);return{people:[...world.npcs,...world.residents].filter(p=>ids.has(p.id)).map(p=>({id:p.id,name:p.name,occupation:p.occupation,age:p.age,...(entry.referenceSexIds?.includes(p.id)?{sex:p.sex}:{}),home:p.home,concern:p.currentConcern,socialProfile:p.socialProfile})),places:world.locations.filter(p=>[entry.before.home.location,entry.before.workplace.location,entry.sharedEvent.location].includes(p.id)).map(p=>({id:p.id,name:p.name,purpose:p.purpose,access:p.access})),rules:['本次只补认知、语域、关系来由、目标步骤和一条共享旧事；旧身份、钱物、技能、目标内容与已有记忆不变。','新增过去事件按sharedEvent，参与者双方拥有该记忆；不因此知道对方秘密、财物或私下行为。','知识与秘密均为人物私有字段，不代表公开叙述。未知列举尚未确定的事项，不是对其真相的断言。','目标步骤均未完成；询问同意、核对范围不代表已经授权或交付。']};}
export function buildDraftRequest(entry,feedback,context){if(entry.contract==='audit-patch-v1')return patchDraftRequest(entry,feedback,context);return{thinking:{type:'disabled'},temperature:.5,max_tokens:500,tools:[{type:'function',function:{name:'write_shared_memory',description:'只润色一条已经确定的共同亲历',parameters:{type:'object',additionalProperties:false,required:['id','memoryNarrative'],properties:{id:{type:'string',enum:[entry.id]},memoryNarrative:{type:'string'}}}}}],tool_choice:{type:'function',function:{name:'write_shared_memory'}},messages:[{role:'system',content:'只把sharedEvent写成该人物的一段私有记忆，约70至110字；保持双方尚未商定的结果，不新增参与者、物品数量或交换。保留真实人名地点以供回忆，不能把对方的私密行为写成亲眼所见。只输出工具参数。'},{role:'user',content:JSON.stringify({person:{id:entry.id,name:entry.before.name,voice:entry.facts.voice},sharedEvent:entry.sharedEvent,context,corrections:feedback})}]};}
export function extractDraft(response,entry){if(entry.contract==='audit-patch-v1'){let draft=parseModelJSON(response);if(draft&&typeof draft==='object'&&!Array.isArray(draft)&&Object.keys(draft).length===1&&Object.hasOwn(draft,'candidate')){const inner=draft.candidate;if(inner&&typeof inner==='object'&&!Array.isArray(inner)&&Object.keys(inner).sort().join(',')==='contract,id,patches')draft=inner;}try{assert.deepEqual(draft,patchDraft(entry));}catch(error){error.code='AUDIT_PATCH_PROTOCOL';throw error;}return draft;}const prose=parseModelJSON(response);if(prose.id!==entry.id||typeof prose.memoryNarrative!=='string'||!prose.memoryNarrative.trim())throw Error('共享记忆返回结构不符');const draft={id:entry.id,...Object.fromEntries(changedFields.map(k=>[k,structuredClone(entry.facts[k])]))};draft.memorySeeds.at(-1).event=prose.memoryNarrative;return draft;}
export function applyDepthDraft(before,draft){if(draft.contract==='audit-patch-v1'){assert.equal(draft.id,before.id);const after=structuredClone(before);for(const patch of draft.patches)setPath(after,patch.path,patch.value);return after;}return{...structuredClone(before),...structuredClone(draft)};}
export function validateDraft(draft,entry){if(entry.contract==='audit-patch-v1')return validatePatchDraft(draft,entry);const errors=[],warnings=[];try{assert.deepEqual(Object.keys(draft).sort(),['id',...changedFields].sort());assert.equal(draft.id,entry.id);const expected=Object.fromEntries(changedFields.map(k=>[k,structuredClone(entry.facts[k])])),actual=structuredClone(draft);delete actual.id;expected.memorySeeds.at(-1).event=actual.memorySeeds?.at(-1)?.event;assert.deepEqual(actual,expected,'除共享记忆说明外不得改变设计事实');assert.equal(typeof actual.memorySeeds.at(-1).event,'string');assert.ok(actual.memorySeeds.at(-1).event.trim());assert.notEqual(draft.voice.register,draft.voice.habits[0]);assert.ok(draft.knowledge.known.length>=3);for(const goal of Object.values(draft.goals).flat())assert.ok(goal.steps.every(s=>s.content!==goal.content&&s.status==='pending'));assert.deepEqual(draft.memorySeeds.slice(0,-1),entry.before.memorySeeds);assert.deepEqual(draft.memorySeeds.at(-1).knownBy,entry.sharedEvent.participants);if(/npc_|loc_|bld_|JSON|骨架|主持人|系统设定/.test(draft.memorySeeds.at(-1).event))throw Error('新增记忆包含内部术语');}catch(e){errors.push(e.message);}errors.push(...findNpcRuleWording(draft).map(row=>`${row.field}: ${row.reason}`));return{errors,warnings};}
export function buildReviewRequest(entry,draft,context){
 const request=defaultReviewRequest(entry,draft,context);
 if(entry.contract!=='audit-patch-v1'){
  request.messages[0].content+=' facts 是经设计补入的权威事实；before 是不得改动的原人物。共享事件属于过去亲历，但未解决的分歧必须仍未解决。请逐句检查所有新增knowledge、relationship.note、goals.steps与共享记忆，不仅检查台词。未知问题包含具体姓名不等于知道问题答案。目标步骤是在提议、询问或核对，不得误判为已经转移财物。';
  return request;
 }
 if(context.authoredBackground||context.controlledRevision){
  const tasks={patchPaths:draft.patches.map(p=>p.path),backgrounds:(context.authoredBackground?.events??[]).map(e=>({eventId:e.id,sourceHash:context.authoredBackground.sourceHash,riskPaths:e.risks.map(r=>`${r.id}.${r.field}`)}))};
  request.messages[0].content='你是游戏内容事实审查员。只返回顶层 JSON 对象，且仅有 contradictions、reviewedPaths、backgroundReviews 三个键。唯一输出 schema：{"contradictions":[{"quote":"说明原句","field":"字段路径","severity":"hard|soft|style","reason":"具体原因"}],"reviewedPaths":["逐个实际审过的 draft.patches.path"],"backgroundReviews":[{"eventId":"事件id","sourceHash":"出处hash","reviewedRiskPaths":["逐个实际审过的 id.field"],"contradictions":[]}]}。三个顶层字段都必须为数组；路径、eventId、sourceHash、quote、field、severity、reason 都必须为字符串。两处 contradictions 的每项都必须有非空 quote、field、severity、reason，severity 只允许 hard、soft、style。hard 表示数值、材料、用途、能力、食性、归属、时间、取得途径等与骨架相反或新增没有依据的功能。正常且相容的感官细节不是新增功能。不推测骨架没有声明的规则。不因没有重述全部骨架字段报错。必须保留真实 hard 的原句和具体原因，不能因新背景、输出长度或覆盖要求省略；无矛盾才 contradictions=[]。逐叶核查后 reviewedPaths 必须精确覆盖以下全部 patchPaths；逐事件独立核查后 backgroundReviews 必须精确覆盖以下全部事件，sourceHash 须相符，reviewedRiskPaths 必须精确覆盖该事件全部 riskPaths。重复、遗漏或额外路径/事件均拒绝。清单只是待审任务，不能未审照抄覆盖凭证。无新背景时 backgroundReviews 必须为 []。本条待审清单：'+JSON.stringify(tasks)+'。';
 }
 request.messages[0].content+=' 本次为失败叶子的定点修订。逐条核对 draft.patches 的每个 path 和 value，以 skeleton.before 相应路径为原值，结合 skeleton.issues 和 publishedFacts 中的引用来源，包括 opinions、notes 等全部文本；保持既有事实和秘密的知情范围。设计中的替换文字是候选，不能以它本身证明新事实。';
 if(context.authoredBackground)request.messages[0].content+=' publishedFacts.authoredBackground 是显式授权待审的新交流背景，与原来源分开；before 未记载同一事件本身不构成矛盾。逐事件独立审核新设计事实、originalSources、privateRisks、原私有事实/公开说话边界、risks 和 pendingOutcomes；秘密不能外传，作者声明不是审核通过。未来询问与pending步骤不是已同意/已执行，不得完成目标、交易或改变身份钱物。';
 return request;
}
export function verifyUnchanged(before,after,entry){if(entry?.contract==='audit-patch-v1'){assert.deepEqual(before,entry.before,'冻结原档已改变');assert.deepEqual(after,applyDepthDraft(before,patchDraft(entry)),'未报错字段或原记忆已改变');return;}for(const key of new Set([...Object.keys(before),...Object.keys(after)]))if(!changedFields.includes(key))assert.deepEqual(after[key],before[key],`不应改变${before.id}.${key}`);assert.equal(after.memorySeeds.length,before.memorySeeds.length+1);assert.deepEqual(after.memorySeeds.slice(0,-1),before.memorySeeds);for(const term of ['short','mid','long'])for(const [i,goal]of before.goals[term].entries()){const {steps,...rest}=goal,{steps:newSteps,...newRest}=after.goals[term][i];assert.deepEqual(newRest,rest);}}
export function sourceFingerprint(base){return hashContent(base);}

const contract='audit-patch-v1';
const issueKey=x=>JSON.stringify([x.id,x.field,x.code]);
const blank=x=>typeof x!=='string'||!x.trim()||/待(?:补充|扩充|完善|填写)|占位|^(?:暂无|待定|未设定|未知|无|todo)$/i.test(x);
export function pathParts(field){
 assert.equal(typeof field,'string');
 assert.match(field,/^[A-Za-z][A-Za-z0-9_]*(?:(?:\.[A-Za-z][A-Za-z0-9_]*)|(?:\[\d+\]))*$/,'非法补丁路径');
 const parts=field.match(/[A-Za-z][A-Za-z0-9_]*|\d+/g).map(x=>/^\d+$/.test(x)?Number(x):x);
 assert.ok(parts.every(x=>!['__proto__','prototype','constructor'].includes(x)),'非法对象键');return parts;
}
export function getPath(object,field){return pathParts(field).reduce((v,k)=>v?.[k],object);}
function setPath(object,field,value){
 const parts=pathParts(field),last=parts.pop();let target=object;
 for(let i=0;i<parts.length;i++){const key=parts[i];if(target[key]===undefined)target[key]=typeof (parts[i+1]??last)==='number'?[]:{};target=target[key];assert.ok(target&&typeof target==='object','补丁父路径不是容器');}
 if(Array.isArray(target)){assert.equal(typeof last,'number');assert.ok(last<=target.length,'数组追加不能留空洞');}
 target[last]=structuredClone(value);
}
function preservedShape(before,after,field){
 if(JSON.stringify(before)===JSON.stringify(after))return;
 assert.ok(after!==null&&after!==undefined,'禁止删除或置空字段');
 if(typeof before==='string')assert.ok(typeof after==='string'&&after.trim(),'禁止清空文本');
 if(Array.isArray(before)){assert.ok(Array.isArray(after)&&after.length>=before.length,'禁止减少数组成员');for(let i=0;i<before.length;i++)preservedShape(before[i],after[i],`${field}[${i}]`);}
 else if(before&&typeof before==='object'){assert.ok(after&&typeof after==='object'&&!Array.isArray(after),'禁止替换对象形状');for(const key of Object.keys(before)){assert.ok(Object.hasOwn(after,key),`禁止删除${field}.${key}`);preservedShape(before[key],after[key],`${field}.${key}`);}}
}
function permitted(entry,patch,world){
 const {before,issues}=entry,{path}=patch,old=getPath(before,path);
 for(const issue of issues){const {field,code}=issue;
  if(code==='rule-wording'&&path===field&&typeof old==='string')return true;
  if(code==='known-duplicate'&&path===field&&/\.fact$/.test(path))return true;
  if(code==='unknown-specific'&&path===field&&/^knowledge\.unknown\[\d+\]$/.test(path))return true;
  if(code==='relationship-note'&&path===field&&/^relationships\[\d+\]\.note$/.test(path))return true;
  if(code==='voice-register'){
   if(path===field&&(blank(before.voice?.register)||before.voice?.register?.normalize('NFKC').replace(/[\s，。；：、,.!?！？;:「」“”"']/g,'')===before.voice?.habits?.[0]?.normalize('NFKC').replace(/[\s，。；：、,.!?！？;:「」“”"']/g,'')))return true;
   if(path==='voice.habits[0]'&&blank(before.voice?.habits?.[0]))return true;
  }
  if(code==='known-shape'){
   const key=path.slice(field.length+1),row=getPath(before,field),ids=new Set(Object.values(world).filter(Array.isArray).flat().map(x=>x?.id));
   if(path===`${field}.${key}`&&['fact','source','reliability'].includes(key)&& (key==='source'?!ids.has(row?.source):key==='fact'?blank(row?.fact):typeof row?.reliability!=='string'||!row.reliability.trim()))return true;
  }
  if(code==='goal-steps'){
   if(path===field&&typeof old==='string')return true;
   const goal=getPath(before,field);
   if(!Array.isArray(goal)&&goal&&typeof goal==='object'){
    if(path===`${field}.content`&&blank(goal.content))return true;
    if(path===`${field}.steps[0]`&&(!goal.steps||Array.isArray(goal.steps)&&!goal.steps.length))return true;
   }
  }
  // Only missing-item issues permit append operations. Existing entries remain frozen.
  const length=Array.isArray(getPath(before,field))?getPath(before,field).length:0;
  const index=path.match(new RegExp(`^${field.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\[(\\d+)\\]$`));
  if(!index||Number(index[1])<length)continue;
  const offset=Number(index[1])-length;
  if(code==='known-count'&&field==='knowledge.known'&&offset<3-length)return true;
  if(code==='known-other'&&field==='knowledge.known'&&offset===0)return true;
  if(code==='unknown-specific'&&field==='knowledge.unknown'&&length===0&&offset===0)return true;
  if(code==='goal-steps'&&/^goals\.(short|mid|long)$/.test(field)&&length===0&&offset===0)return true;
  if(code==='relationship-note'&&field==='relationships'&&length===0&&offset===0)return true;
  if(code==='memory-shared'&&field==='memorySeeds'&&offset===0)return true;
 }
 return false;
}
export function patchDraft(entry){return{id:entry.id,contract,patches:structuredClone(entry.patches)};}
export function patchEntries(base,config,world){
 assert.ok(world,'审计补丁须提供 world');assert.ok(typeof config.revision==='string'&&config.revision.trim(),'缺少revision');
 assert.ok(Array.isArray(config.patchRows)&&config.patchRows.length,'缺少patchRows');
 const frozen={...world,npcs:world.npcs.map(n=>base.find(b=>b.id===n.id)??n)};
 const actual=new Set(auditNpcDepth(frozen).issues.map(issueKey)),ids=new Set();
 const entries=config.patchRows.map(row=>{
  assert.ok(!ids.has(row.id),'人物重复');ids.add(row.id);const before=base.find(n=>n.id===row.id);assert.ok(before,'缺少原人物');
  assert.deepEqual(row.before,before,'design before 与冻结档案不同');assert.equal(row.baseHash,hashContent(before),'baseHash 已过期或被篡改');
  assert.ok(Array.isArray(row.issues)&&row.issues.length,'缺少审计失败路径');
  for(const issue of row.issues){assert.equal(issue.id,row.id);assert.ok(actual.has(issueKey(issue)),`非实际审计失败项 ${issue.field}/${issue.code}`);}
  const entry={id:row.id,contract,before:structuredClone(before),baseHash:row.baseHash,issues:structuredClone(row.issues),patches:structuredClone(row.patches),...Object.fromEntries(['referenceSexIds','referenceWorkplaceIds','referenceRelationshipIds','referenceMemoryIds'].filter(key=>Object.hasOwn(row,key)).map(key=>[key,structuredClone(row[key])]))};
  assert.ok(Array.isArray(entry.patches)&&entry.patches.length,'缺少修订项');const paths=new Set();
  for(const patch of entry.patches){assert.deepEqual(Object.keys(patch).sort(),['path','value']);pathParts(patch.path);assert.ok(!paths.has(patch.path),'补丁路径重复');paths.add(patch.path);assert.ok(permitted(entry,patch,frozen),`未报错叶子禁止修订 ${patch.path}`);assert.notDeepEqual(patch.value,getPath(before,patch.path),'禁止无改动补丁');}
  for(const a of paths)for(const b of paths)if(a!==b)assert.ok(!b.startsWith(a+'.')&&!b.startsWith(a+'['),'补丁路径重叠');
  // Validate append indices in order and preserve every existing key and member.
  const after=applyDepthDraft(before,patchDraft(entry));preservedShape(before,after,'');
  for(const patch of entry.patches)if(/^goals\./.test(patch.path)&&typeof patch.value==='object'){const steps=patch.value.steps??(Object.hasOwn(patch.value,'status')?[patch.value]:[]);assert.ok(steps.every(step=>step.status==='pending'),'新增目标步骤不得已完成');}
  entry.facts=after;validateSourceSelections(entry,frozen);return entry;
 });
 if(config.authoredBackground){const background=validateAuthoredBackground(config.authoredBackground,entries,frozen);for(const entry of entries)if(background.events.some(e=>e.actors.includes(entry.id)))entry.authoredBackground=background;}
 return entries;
}
function patchPeople(entry,world){
 const body=JSON.stringify(entry.facts),ids=new Set([entry.id,...(entry.before.relationships??[]).map(r=>r.with)]);
 return [...world.npcs,...(world.residents??[]),...(world.factionPeople??[])].filter(p=>ids.has(p.id)||body.includes(p.id)||body.includes(p.name));
}
function validateSourceSelections(entry,world,people=patchPeople(entry,world)){
 const all=[...world.npcs,...(world.residents??[]),...(world.factionPeople??[])];
 for(const [key,field] of [['referenceSexIds','sex'],['referenceWorkplaceIds','workplace'],['referenceRelationshipIds','relationships'],['referenceMemoryIds','memorySeeds']]){
  if(!Object.hasOwn(entry,key))continue;
  const ids=entry[key];assert.ok(Array.isArray(ids)&&ids.every(id=>typeof id==='string'&&id.trim())&&new Set(ids).size===ids.length,`来源选择 ${key} 必须为不重复的 id 数组`);
  for(const id of ids){const source=all.find(p=>p.id===id);assert.ok(source,`来源人物不存在 ${id}`);assert.ok(people.some(p=>p.id===id),`来源人物与修订无关联 ${id}`);assert.ok(field==='sex'?typeof source[field]==='string':field==='workplace'?source[field]&&typeof source[field]==='object':Array.isArray(source[field]),`正式原来源缺少 ${id}.${field}`);}
 }
}
function patchContext(entry,world){
 const body=JSON.stringify(entry.facts),people=patchPeople(entry,world);validateSourceSelections(entry,world,people);
 const localProblems=(world.settlementProfiles??[]).flatMap(p=>(p.details?.problems??[]).filter(problem=>problem.stakeholders?.some(s=>s.person===entry.id)||body.includes(problem.id)).map(problem=>({settlement:p.id,...structuredClone(problem)})));
 return {people:people.map(p=>({id:p.id,name:p.name,occupation:p.occupation,age:p.age,home:p.home,concern:p.currentConcern,socialProfile:p.socialProfile,...(entry.referenceSexIds?.includes(p.id)?{sex:p.sex}:{}),...(entry.referenceWorkplaceIds?.includes(p.id)?{workplace:structuredClone(p.workplace)}:{}),...(entry.referenceRelationshipIds?.includes(p.id)?{relationships:structuredClone(p.relationships)}:{}),...(entry.referenceMemoryIds?.includes(p.id)?{memorySeeds:structuredClone(p.memorySeeds)}:{})})),places:(world.locations??[]).filter(p=>body.includes(p.id)||body.includes(p.name)).map(p=>({id:p.id,name:p.name,purpose:p.purpose,access:p.access})),localProblems,revisions:entry.patches.map(p=>({path:p.path,before:getPath(entry.before,p.path)??null,after:p.value,issues:entry.issues})),rules:['只修改实际失败的叶子或追加缺失条目。原有身份、财物、技能、服务、合格兄弟字段和旧记忆保持冻结。','知识仍为本人私有，候选新增事实必须有既有来源支持，共享事件双方核对，不传播秘密。','地方问题中作者提出的解法尚未得到当事人同意；当事人身份不自动授予另一人的秘密知情权。']};
}
function patchDraftRequest(entry,feedback,context){return{thinking:{type:'disabled'},temperature:0,max_tokens:6000,response_format:{type:'json_object'},messages:[{role:'system',content:'只返回顶层 JSON 对象，且仅有 id、contract、patches 三个键。contract 必须为 audit-patch-v1；patches 是对象数组，每项仅有 path 和 value。按用户提供的 candidate 原样输出其三个字段，不输出 candidate 外壳或 context。不得增加、删除或改写补丁、路径和值。修订仅限已列出的审计失败路径。'},{role:'user',content:JSON.stringify({schema:{type:'object',additionalProperties:false,required:['id','contract','patches'],properties:{id:{const:entry.id},contract:{const:contract},patches:{type:'array',items:{type:'object',additionalProperties:false,required:['path','value'],properties:{path:{type:'string'},value:{}}}}}},example:patchDraft(entry),candidate:patchDraft(entry),context,corrections:feedback})}]};}
function validatePatchDraft(draft,entry){const errors=[];try{assert.deepEqual(draft,patchDraft(entry),'候选与冻结补丁不符');const after=applyDepthDraft(entry.before,draft);verifyUnchanged(entry.before,after,entry);const prior=new Set(findNpcRuleWording(entry.before).map(issueKey));for(const issue of findNpcRuleWording(after))if(!prior.has(issueKey(issue))||entry.issues.some(x=>issueKey(x)===issueKey(issue)))throw Error(`${issue.field}: 规则措辞未修复`);}catch(e){errors.push(e.message);}return{errors,warnings:[]};}
export function validatePatchResults(entries,world){
 const replacements=new Map(entries.map(e=>[e.id,e.facts])),beforeWorld={...world,npcs:world.npcs.map(n=>entries.find(e=>e.id===n.id)?.before??n)},afterWorld={...world,npcs:world.npcs.map(n=>replacements.get(n.id)??n)};
 const prior=new Set(auditNpcDepth(beforeWorld).issues.map(issueKey)),current=auditNpcDepth(afterWorld).issues;
 const targeted=new Set(entries.flatMap(e=>e.issues).map(issueKey));
 for(const issue of current)assert.ok(!targeted.has(issueKey(issue))&&prior.has(issueKey(issue)),`审计修订未解决或引入缺口 ${issue.id}/${issue.field}/${issue.code}`);
 return afterWorld;
}
// The bundle is an independent, unreviewed author source. It never changes the
// original foundation and never turns candidate prose into a published fact.
export function validateAuthoredBackground(bundle,entries,world){
 assert.equal(bundle?.kind,'authored-background');
 assert.ok(typeof bundle.revision==='string'&&bundle.revision.trim(),'缺少作者出处 revision');
 assert.ok(Array.isArray(bundle.events)&&bundle.events.length,'缺少独立事件');
 const ids=new Set(),all=[...(world.npcs??[]),...(world.residents??[])];
 for(const event of bundle.events){
  assert.ok(typeof event.id==='string'&&event.id.trim()&&!ids.has(event.id),'事件ID重复或缺失');ids.add(event.id);
  assert.ok(typeof event.revision==='string'&&event.revision.trim(),'缺少事件revision');
  assert.equal(event.status,'past-but-unresolved','事件须为过去但分歧未解');
  const actors=event.actors,network=event.network;
  assert.ok(Array.isArray(actors)&&actors.length>=2&&new Set(actors).size===actors.length,'参与者须不重复');
  assert.ok(network&&Array.isArray(network.actors)&&network.actors.length>=3&&network.actors.length<=5&&new Set(network.actors).size===network.actors.length,'地方问题须有3–5人网络');
  assert.ok(network.actors.every(id=>all.some(n=>n.id===id))&&actors.every(id=>network.actors.includes(id)),'人物不存在或不在问题网络');
  const place=(world.locations??[]).find(p=>p.id===event.location);
  assert.ok(place,'缺少有效地点');
  const publicFeature=event.publicFeatureRef;
  if(publicFeature){
   assert.equal(publicFeature.id,event.location,'公共feature须属于事件地点');assert.match(publicFeature.field,/^features\[\d+\]$/,'须引用具体公共feature');
   const feature=getPath(place,publicFeature.field);assert.ok(feature&&feature.access==='public'&&typeof feature.name==='string','feature没有明确公开权限');assert.equal(publicFeature.hash,hashContent(feature),'公共feature hash过期');
   const narratives=[event.narrative,...(event.associations??[]).map(a=>a.narrative).filter(Boolean)];
   assert.ok(narratives.every(text=>typeof text==='string'&&[feature.name,...(feature.aliases??[])].some(name=>text.includes(name))),'新背景须限定在该公共feature周边');
  }else assert.ok(['公开','public'].includes(place.access)||place.access?.mode==='public'||place.access===undefined&&place.owner===null&&typeof place.purpose==='string'&&!/私宅|私人/.test(place.purpose),'缺少有效公开地点');
  assert.ok(Array.isArray(event.sourceRefs)&&event.sourceRefs.length,'缺少原字段出处');
  const refs=event.sourceRefs.map(ref=>{
   assert.ok(['npcs','residents','locations','settlementProfiles'].includes(ref.collection),'候选/review不能成为来源');
   const source=world[ref.collection]?.find(r=>r.id===ref.id);assert.ok(source,'原出处不存在');
   const value=getPath(source,ref.field);assert.notEqual(value,undefined,'原字段出处不存在');assert.equal(ref.hash,hashContent(value),'原字段出处hash过期');
   assert.ok(['public','private'].includes(ref.visibility),'须区分公开/私有来源');
   if(['npcs','residents'].includes(ref.collection)){assert.equal(ref.visibility,'private','人物私有原字段不能自动公开');assert.ok(network.actors.includes(ref.id),'原人物出处超出网络');if(ref.publicSpeech!==undefined)assert.ok(typeof ref.publicSpeech==='string'&&ref.publicSpeech.trim(),'公开说话范围无效');}
   else assert.equal(ref.visibility,'public','公共出处须明确公开');
   assert.ok(!/^(secrets|knowledge|memorySeeds)(\.|\[|$)/.test(ref.field)&&ref.field!=='authoredFacts.privateFact'&&!(value&&typeof value==='object'&&Object.hasOwn(value,'privateFact')),'私有秘密/知识/旧记忆不能作为公开新事件授权');
   return{...ref,value:structuredClone(value)};
  });
  const problemRef=network.problemRef;
  if(['npcs','residents'].includes(problemRef?.collection)){
   assert.ok(problemRef.field==='currentConcern'||/^goals\.(short|mid|long)\[\d+\]\.content$/.test(problemRef.field),'私人问题须为原日常关切/待办，身份秘密不能当问题');
   assert.ok(refs.some(ref=>ref.collection===problemRef.collection&&ref.id===problemRef.id&&ref.field===problemRef.field&&ref.hash===problemRef.hash&&ref.visibility==='private'&&typeof ref.value==='string'&&ref.value.trim()&&typeof ref.publicSpeech==='string'&&ref.publicSpeech.trim()),'私人关切缺冻结字段hash或显式公开说话范围');
  }else{
   assert.ok(!problemRef?.collection||problemRef.collection==='settlementProfiles','问题不能从候选/review取得');
   assert.ok(refs.some(r=>r.collection==='settlementProfiles'&&r.id===problemRef?.id&&r.field===problemRef?.field&&r.value?.public===true&&r.value?.id),'缺已发布公开地方问题原出处');
  }
  assert.ok(refs.some(r=>r.collection==='locations'&&r.id===event.location&&(!publicFeature||r.field===publicFeature.field&&r.hash===publicFeature.hash)),'缺地点/公共feature原出处');
  for(const ref of refs)if(['npcs','residents'].includes(ref.collection)&&ref.field==='currentConcern')assert.ok(typeof ref.publicSpeech==='string'&&ref.publicSpeech.trim(),'私有concern缺公开说话范围');
  assert.ok(actors.every(id=>refs.some(r=>['npcs','residents'].includes(r.collection)&&r.id===id)),'缺参与者原字段出处');
  assert.ok(Array.isArray(event.designedFacts)&&event.designedFacts.length&&event.designedFacts.every(f=>typeof f==='string'&&f.trim()),'缺新设计事实');
  assert.ok(Array.isArray(event.pendingOutcomes)&&event.pendingOutcomes.length&&event.pendingOutcomes.every(f=>typeof f==='string'&&f.trim()),'缺未发生结果');
  assert.ok(typeof event.narrative==='string'&&event.narrative.trim(),'缺冻结新事件文字');
  assert.ok(Array.isArray(event.risks),'须列显式风险范围');
  const secretRisks=actors.flatMap(id=>(all.find(n=>n.id===id).secrets??[]).map((secret,i)=>({id,field:`secrets[${i}]`,hash:hashContent(secret)})));
  for(const risk of secretRisks)assert.ok(event.risks.some(r=>r.id===risk.id&&r.field===risk.field&&r.hash===risk.hash&&typeof r.reason==='string'&&r.reason.trim()),'秘密必须进入L2/L4风险清单');
  for(const risk of event.risks){assert.ok(actors.includes(risk.id),'风险人物超出参与者');const source=all.find(n=>n.id===risk.id);assert.equal(risk.hash,hashContent(getPath(source,risk.field)),'风险来源hash不符');}
  const text=JSON.stringify([event.narrative,event.designedFacts,event.associations,event.sourceRefs.map(ref=>ref.publicSpeech)]);
  assert.ok(!/(?:已经|已)(?:付款|交付|支付|授权|完成|同意)|完成了|付清|交割完毕/.test(text),'交流背景不得完成交易/授权/任务');
  for(const id of actors)for(const secret of all.find(n=>n.id===id).secrets??[]){const hidden=typeof secret==='string'?secret:secret.content??secret.fact??secret.text;if(hidden&&hidden.length>=6){assert.ok(!text.includes(hidden),'新背景泄漏原秘密');for(const entry of entries)assert.ok(!JSON.stringify(entry.patches).includes(hidden),'候选泄漏原秘密');}}
  assert.ok(Array.isArray(event.associations)&&event.associations.length===actors.length,'所有参与者须有候选关联');
  assert.deepEqual(event.associations.map(a=>a.id).sort(),[...actors].sort(),'事件关联成员不一致');
  for(const association of event.associations){
   const entry=entries.find(e=>e.id===association.id);assert.ok(entry,'成员缺候选档');
   const patch=entry.patches.find(p=>p.path===association.path);assert.ok(patch&&/^memorySeeds\[\d+\]$/.test(patch.path),'事件只关联获许可新增memorySeeds');
   assert.equal(getPath(entry.before,patch.path),undefined,'不得改变原记忆');assert.ok(permitted(entry,patch,world),'事件路径不在原审计许可');
   const memory=patch.value;assert.equal(memory.id,event.id,'事件ID不一致');assert.equal(memory.location,event.location,'事件地点不一致');assert.ok(Array.isArray(memory.knownBy)&&memory.knownBy.length===actors.length&&new Set(memory.knownBy).size===actors.length,'事件knownBy重复/缺员');assert.deepEqual([...memory.knownBy].sort(),[...actors].sort(),'事件knownBy不一致');const narrative=association.narrative??event.narrative;if(association.narrative!==undefined){assert.ok(typeof narrative==='string'&&narrative.trim(),'参与者冻结叙述无效');assert.equal(association.factsHash,hashContent(event.designedFacts),'双方事件事实hash不一致');}assert.equal(memory.event,narrative,'双方事件事实不一致或超出处');
  }
  for(const entry of entries)if(!actors.includes(entry.id))assert.ok(!(entry.patches??[]).some(p=>containsEventId(p.value,event.id)||event.narrative.length>12&&JSON.stringify(p.value).includes(event.narrative)),'未参与者不得新增获知');
 }
 return{kind:bundle.kind,revision:bundle.revision,sourceHash:hashContent(bundle),events:structuredClone(bundle.events)};
}
function containsEventId(value,id){
 if(typeof value==='string')return value===id;
 return value!==null&&typeof value==='object'&&Object.values(value).some(child=>containsEventId(child,id));
}
export function authoredReviewContext(context,background,entry,world){
 const events=background.events.filter(e=>e.actors.includes(entry.id));
 if(!events.length)return context;
 const reviewedEvents=events.map(event=>({
  ...event,
  originalSources:event.sourceRefs.map(ref=>({...ref,value:structuredClone(getPath(world[ref.collection].find(source=>source.id===ref.id),ref.field))})),
  privateRisks:event.risks.map(ref=>({...ref,value:structuredClone(getPath([...(world.npcs??[]),...(world.residents??[])].find(source=>source.id===ref.id),ref.field))}))
 }));
 return{...context,authoredBackground:{sourceHash:background.sourceHash,events:reviewedEvents},rules:[...context.rules,'新增事件须另审来源与候选；私有出处不自动公开，公开说话只限显式范围，所有待定结果保持未发生。publicFeatureRef只授权该公共feature周边交流，不代表其所属整处场地、私宅或工坊开放，也不授权取用其财物。']};
}
export function checkIncrementalReview(review,entry,context){
 assert.ok(Array.isArray(review?.contradictions),'无效复审结果');
 assert.deepEqual(Object.keys(review).sort(),['backgroundReviews','contradictions','reviewedPaths'],'增量审核仅接受完整三字段');
 assert.ok(Array.isArray(review.reviewedPaths)&&review.reviewedPaths.every(p=>typeof p==='string'),'L2漏审修订叶子');
 assert.deepEqual([...(review.reviewedPaths??[])].sort(),entry.patches.map(p=>p.path).sort(),'L2漏审修订叶子');
 assert.ok(Array.isArray(review.backgroundReviews),'缺独立事件出处L2');
 for(const issue of review.contradictions)assert.ok(['hard','soft','style'].includes(issue.severity)&&['quote','field','reason'].every(k=>typeof issue[k]==='string'&&issue[k].trim()),'无效复审结果');
 const background=context.authoredBackground;
 if(background){
  assert.deepEqual((review.backgroundReviews??[]).map(r=>r.eventId).sort(),background.events.map(e=>e.id).sort(),'缺独立事件出处L2');
  for(const event of background.events){const result=review.backgroundReviews.find(r=>r.eventId===event.id);assert.deepEqual(Object.keys(result).sort(),['contradictions','eventId','reviewedRiskPaths','sourceHash'],'无效出处审核');assert.equal(result.sourceHash,background.sourceHash,'出处L2 hash过期');assert.ok(Array.isArray(result.reviewedRiskPaths)&&result.reviewedRiskPaths.every(p=>typeof p==='string'),'出处L2漏审秘密风险');assert.deepEqual([...result.reviewedRiskPaths].sort(),event.risks.map(r=>`${r.id}.${r.field}`).sort(),'出处L2漏审秘密风险');assert.ok(Array.isArray(result.contradictions),'无效出处审核');for(const issue of result.contradictions)assert.ok(['hard','soft','style'].includes(issue.severity)&&['quote','field','reason'].every(k=>typeof issue[k]==='string'&&issue[k].trim()),'无效出处审核');}
 }else assert.deepEqual(review.backgroundReviews,[],'无新背景时出处审核必须为空');
 return[...review.contradictions,...(review.backgroundReviews??[]).flatMap(r=>r.contradictions)];
}
export function validateControlledRevision(plan,{entries,foundation,records,world,candidate,base,invalidations,authorizationHash,sourceHashes,frozenSources={}}){
 assert.equal(hashContent(plan),authorizationHash,'规划授权hash不匹配');
 assert.equal(plan.kind,'controlled-depth-revision');assert.ok(['T07','T10'].includes(plan.cardId),'本次仅授权T07/T10，T06继续冻结');
 assert.ok(typeof plan.planningId==='string'&&plan.planningId.trim(),'缺本次规划标识');
 assert.equal(plan.revision,foundation.revision,'不得换revision领取机会');
 assert.equal(plan.foundationHash,hashContent(foundation),'原foundation hash不符');assert.equal(plan.baseHash,hashContent(base),'原base hash不符');assert.equal(plan.candidateHash,hashContent(candidate),'原candidate hash不符');
 assert.ok(Array.isArray(plan.sourceHashes)&&plan.sourceHashes.length,'须显式冻结原来源hash');assert.deepEqual(sourceHashes,plan.sourceHashes,'冻结原来源hash不符');
 if(plan.invalidationFile)assert.equal(hashContent(invalidations),plan.invalidationHash,'实际失效清单hash不符');
 const changes=[],authorized=new Set();
 for(const item of plan.authorized??[]){
  assert.ok(!authorized.has(item.id),'授权ID重复');authorized.add(item.id);
  const old=foundation.entries.find(e=>e.id===item.id),entry=entries.find(e=>e.id===item.id),record=records.find(r=>r.id===item.id);
  assert.ok(old&&entry&&record,'未授权/缺档ID');assert.equal(item.recordHash,hashContent(record),'旧完整record hash不符');
  assert.equal(hashContent(contextFor(Object.fromEntries(Object.entries(old).filter(([key])=>key!=='context')),world)),hashContent(old.context),'原冻结来源/声明改变');
  assert.deepEqual(entry.before,old.before,'原baseline改变');assert.deepEqual(entry.issues,old.issues,'原审计许可改变');assert.equal(entry.baseHash,old.baseHash,'原baseHash改变');
  assert.equal(record.fingerprint,hashContent({entry:Object.fromEntries(Object.entries(old).filter(([key])=>key!=='context')),context:old.context,revision:foundation.revision}),'旧候选指纹不匹配');
  assert.deepEqual(record.draft,candidate.find(d=>d.id===item.id),'原record/candidate不匹配');
  assert.equal(hashContent(record.draft),item.draftHash,'旧draft hash不符');assert.equal(hashContent(record.review),item.reviewHash,'旧review hash不符');
  assert.ok(!record.reviewRecovery,'本次机会已使用');
  const actual=[];
  if(record.status==='manual')for(const finding of record.review?.contradictions??[])if(finding.severity==='hard')actual.push({path:finding.field,quote:finding.quote,kind:'L2'});
  const invalidation=invalidations?.records?.find(r=>r.id===item.id);
  if(record.status==='passed'||invalidation){
   assert.ok(invalidation&&invalidation.operativeStatus==='invalidated-by-L4','passed缺真实L4失效');
   assert.equal(invalidation.draftHash,hashContent(record.draft),'L4失效draft hash不符');assert.equal(invalidation.reviewHash,hashContent(record.review),'L4失效review hash不符');
   for(const finding of invalidation.findings??[]){assert.ok(typeof finding.reason==='string'&&finding.reason.trim(),'L4失效缺原因');const sourceValue=finding.sourceConcern??finding.sourceSex;assert.ok(typeof sourceValue==='string','L4失效缺原出处事实');assert.equal(finding.sourceHash,hashContent(sourceValue),'L4原出处hash不符');const ref=item.invalidationSources?.find(r=>r.path===finding.path);assert.ok(ref&&['npcs','residents','locations','settlementProfiles','frozen-roster'].includes(ref.collection),'L4失效缺冻结原字段出处');const source=ref.collection==='frozen-roster'?frozenSources[ref.file]?.find(r=>r.id===ref.id):world[ref.collection]?.find(r=>r.id===ref.id);assert.ok(source,'L4原出处不存在');if(ref.collection==='frozen-roster'){assert.equal(ref.field,'concern','本次名册只允许原concern列');const person=[...(world.npcs??[]),...(world.residents??[])].find(r=>r.id===ref.id);assert.equal(source.name,person?.name,'名册原人物不符');}if(finding.sourceId)assert.equal(ref.id,finding.sourceId,'L4失效来源人物不符');assert.deepEqual(getPath(source,ref.field),sourceValue,'L4失效原事实伪造');assert.equal(ref.hash,finding.sourceHash,'L4失效原字段hash不符');actual.push({...finding,kind:'L4'});}
  }
  assert.ok(actual.length,'缺真实L2/L4失效');
  const paths=new Set(item.paths??[]);assert.ok(paths.size||item.sourceOnly,'缺授权修订路径或source-only标识');
  for(const field of paths){const prior=old.patches.find(p=>p.path===field);assert.ok(prior&&permitted(entry,prior,world),'路径不在原audit许可');const issue=actual.find(f=>f.path===field);assert.ok(issue,'路径不在真实失效清单');const value=getPath(applyDepthDraft(old.before,record.draft),field);assert.ok(JSON.stringify(value).includes(issue.quote),'失效quote与原候选不符');}
  assert.deepEqual(entry.patches.map(p=>p.path),old.patches.map(p=>p.path),'禁止新增/删除补丁成员');
  for(const prior of old.patches){const next=entry.patches.find(p=>p.path===prior.path);if(hashContent(prior.value)!==hashContent(next.value)){assert.ok(paths.has(prior.path),'正确兄弟叶不得修改');changes.push({id:item.id,path:prior.path,before:prior.value,after:next.value});}}
  const oldMetadata=Object.fromEntries(Object.entries(old).filter(([key])=>!['context','facts','patches'].includes(key))),newMetadata=Object.fromEntries(Object.entries(entry).filter(([key])=>!['facts','patches'].includes(key)));assert.deepEqual(newMetadata,oldMetadata,'原来源选择/声明不得变更');
 }
 for(const entry of entries)if(!authorized.has(entry.id)){const old=foundation.entries.find(e=>e.id===entry.id);assert.ok(old,'未授权ID');assert.deepEqual(entry,Object.fromEntries(Object.entries(old).filter(([key])=>key!=='context')),'未授权ID候选改变');}
 assert.deepEqual(entries.map(e=>e.id),foundation.entries.map(e=>e.id),'成员列表不得改变');
 return{planningId:plan.planningId,authorizationHash,changes};
}
// Keep the transport measurement intact when the model omits source/leaf
// coverage. The ordinary pipeline consumes this as a hard L2 finding.
export function depthReviewClient(client){
 return new Proxy(client,{get(target,key){
  if(key!=='generate'){const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}
  return async(request,...args)=>{
   const response=await target.generate(request,...args);let payload;
   try{payload=JSON.parse(request.messages?.[1]?.content);}catch{return response;}
   if(!payload.publishedFacts?.authoredBackground&&!payload.publishedFacts?.controlledRevision)return response;
   let review;try{review=parseModelJSON(response);checkIncrementalReview(review,payload.skeleton,payload.publishedFacts);}catch(error){
    const contradictions=Array.isArray(review?.contradictions)?review.contradictions:[];
    review={...(review&&typeof review==='object'?review:{}),contradictions:[...contradictions,{severity:'hard',field:'reviewedPaths',quote:'出处及候选覆盖凭证',reason:error.message}]};
    return preservedProviderReview(response,review);
   }
   const sourceHard=(review.backgroundReviews??[]).flatMap(r=>r.contradictions).filter(r=>r.severity==='hard');
   return sourceHard.length?preservedProviderReview(response,{...review,contradictions:[...review.contradictions,...sourceHard]}):response;
  };
 }});
}

function preservedProviderReview(response,review){
 return{...response,rawProviderReviewResponse:structuredClone(response),rawProviderReviewResponseHash:hashContent(response),choices:[{message:{content:JSON.stringify(review)}}]};
}
