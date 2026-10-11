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
export function contextFor(entry,world){if(entry.contract==='audit-patch-v1')return patchContext(entry,world);const ids=new Set([...entry.before.relationships.map(r=>r.with),...entry.facts.relationships.map(r=>r.with),...entry.sharedEvent.participants]);return{people:[...world.npcs,...world.residents].filter(p=>ids.has(p.id)).map(p=>({id:p.id,name:p.name,occupation:p.occupation,age:p.age,...(entry.referenceSexIds?.includes(p.id)?{sex:p.sex}:{}),home:p.home,concern:p.currentConcern,socialProfile:p.socialProfile})),places:world.locations.filter(p=>[entry.before.home.location,entry.before.workplace.location,entry.sharedEvent.location].includes(p.id)).map(p=>({id:p.id,name:p.name,purpose:p.purpose,access:p.access})),rules:['本次只补认知、语域、关系来由、目标步骤和一条共享旧事；旧身份、钱物、技能、目标内容与已有记忆不变。','新增过去事件按sharedEvent，参与者双方拥有该记忆；不因此知道对方秘密、财物或私下行为。','知识与秘密均为人物私有字段，不代表公开叙述。未知列举尚未确定的事项，不是对其真相的断言。','目标步骤均未完成；询问同意、核对范围不代表已经授权或交付。']};}
export function buildDraftRequest(entry,feedback,context){if(entry.contract==='audit-patch-v1')return patchDraftRequest(entry,feedback,context);return{thinking:{type:'disabled'},temperature:.5,max_tokens:500,tools:[{type:'function',function:{name:'write_shared_memory',description:'只润色一条已经确定的共同亲历',parameters:{type:'object',additionalProperties:false,required:['id','memoryNarrative'],properties:{id:{type:'string',enum:[entry.id]},memoryNarrative:{type:'string'}}}}}],tool_choice:{type:'function',function:{name:'write_shared_memory'}},messages:[{role:'system',content:'只把sharedEvent写成该人物的一段私有记忆，约70至110字；保持双方尚未商定的结果，不新增参与者、物品数量或交换。保留真实人名地点以供回忆，不能把对方的私密行为写成亲眼所见。只输出工具参数。'},{role:'user',content:JSON.stringify({person:{id:entry.id,name:entry.before.name,voice:entry.facts.voice},sharedEvent:entry.sharedEvent,context,corrections:feedback})}]};}
export function extractDraft(response,entry){if(entry.contract==='audit-patch-v1'){const draft=parseModelJSON(response);assert.deepEqual(draft,patchDraft(entry));return draft;}const prose=parseModelJSON(response);if(prose.id!==entry.id||typeof prose.memoryNarrative!=='string'||!prose.memoryNarrative.trim())throw Error('共享记忆返回结构不符');const draft={id:entry.id,...Object.fromEntries(changedFields.map(k=>[k,structuredClone(entry.facts[k])]))};draft.memorySeeds.at(-1).event=prose.memoryNarrative;return draft;}
export function applyDepthDraft(before,draft){if(draft.contract==='audit-patch-v1'){assert.equal(draft.id,before.id);const after=structuredClone(before);for(const patch of draft.patches)setPath(after,patch.path,patch.value);return after;}return{...structuredClone(before),...structuredClone(draft)};}
export function validateDraft(draft,entry){if(entry.contract==='audit-patch-v1')return validatePatchDraft(draft,entry);const errors=[],warnings=[];try{assert.deepEqual(Object.keys(draft).sort(),['id',...changedFields].sort());assert.equal(draft.id,entry.id);const expected=Object.fromEntries(changedFields.map(k=>[k,structuredClone(entry.facts[k])])),actual=structuredClone(draft);delete actual.id;expected.memorySeeds.at(-1).event=actual.memorySeeds?.at(-1)?.event;assert.deepEqual(actual,expected,'除共享记忆说明外不得改变设计事实');assert.equal(typeof actual.memorySeeds.at(-1).event,'string');assert.ok(actual.memorySeeds.at(-1).event.trim());assert.notEqual(draft.voice.register,draft.voice.habits[0]);assert.ok(draft.knowledge.known.length>=3);for(const goal of Object.values(draft.goals).flat())assert.ok(goal.steps.every(s=>s.content!==goal.content&&s.status==='pending'));assert.deepEqual(draft.memorySeeds.slice(0,-1),entry.before.memorySeeds);assert.deepEqual(draft.memorySeeds.at(-1).knownBy,entry.sharedEvent.participants);if(/npc_|loc_|bld_|JSON|骨架|主持人|系统设定/.test(draft.memorySeeds.at(-1).event))throw Error('新增记忆包含内部术语');}catch(e){errors.push(e.message);}errors.push(...findNpcRuleWording(draft).map(row=>`${row.field}: ${row.reason}`));return{errors,warnings};}
export function buildReviewRequest(entry,draft,context){if(entry.contract==='audit-patch-v1'){const request=defaultReviewRequest(entry,draft,context);request.messages[0].content+=' 本次为失败叶子的定点修订。逐条核对 context.revisions 的每个 path、before、after 和引用来源，包括 opinions、notes 等全部文本；保持既有事实和秘密的知情范围。设计中的替换文字是候选，不能以它本身证明新事实。';return request;}const request=defaultReviewRequest(entry,draft,context);request.messages[0].content+=' facts 是经设计补入的权威事实；before 是不得改动的原人物。共享事件属于过去亲历，但未解决的分歧必须仍未解决。请逐句检查所有新增knowledge、relationship.note、goals.steps与共享记忆，不仅检查台词。未知问题包含具体姓名不等于知道问题答案。目标步骤是在提议、询问或核对，不得误判为已经转移财物。';return request;}
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
 return config.patchRows.map(row=>{
  assert.ok(!ids.has(row.id),'人物重复');ids.add(row.id);const before=base.find(n=>n.id===row.id);assert.ok(before,'缺少原人物');
  assert.deepEqual(row.before,before,'design before 与冻结档案不同');assert.equal(row.baseHash,hashContent(before),'baseHash 已过期或被篡改');
  assert.ok(Array.isArray(row.issues)&&row.issues.length,'缺少审计失败路径');
  for(const issue of row.issues){assert.equal(issue.id,row.id);assert.ok(actual.has(issueKey(issue)),`非实际审计失败项 ${issue.field}/${issue.code}`);}
  const entry={id:row.id,contract,before:structuredClone(before),baseHash:row.baseHash,issues:structuredClone(row.issues),patches:structuredClone(row.patches)};
  assert.ok(Array.isArray(entry.patches)&&entry.patches.length,'缺少修订项');const paths=new Set();
  for(const patch of entry.patches){assert.deepEqual(Object.keys(patch).sort(),['path','value']);pathParts(patch.path);assert.ok(!paths.has(patch.path),'补丁路径重复');paths.add(patch.path);assert.ok(permitted(entry,patch,frozen),`未报错叶子禁止修订 ${patch.path}`);assert.notDeepEqual(patch.value,getPath(before,patch.path),'禁止无改动补丁');}
  for(const a of paths)for(const b of paths)if(a!==b)assert.ok(!b.startsWith(a+'.')&&!b.startsWith(a+'['),'补丁路径重叠');
  // Validate append indices in order and preserve every existing key and member.
  const after=applyDepthDraft(before,patchDraft(entry));preservedShape(before,after,'');
  entry.facts=after;return entry;
 });
}
function patchContext(entry,world){
 const body=JSON.stringify(entry.facts),ids=new Set([entry.id,...(entry.before.relationships??[]).map(r=>r.with)]);
 const people=[...world.npcs,...(world.residents??[]),...(world.factionPeople??[])].filter(p=>ids.has(p.id)||body.includes(p.id)||body.includes(p.name));
 const localProblems=(world.settlementProfiles??[]).flatMap(p=>(p.details?.problems??[]).filter(problem=>problem.stakeholders?.some(s=>s.person===entry.id)||body.includes(problem.id)).map(problem=>({settlement:p.id,...structuredClone(problem)})));
 return {people:people.map(p=>({id:p.id,name:p.name,occupation:p.occupation,age:p.age,home:p.home,concern:p.currentConcern,socialProfile:p.socialProfile})),places:(world.locations??[]).filter(p=>body.includes(p.id)||body.includes(p.name)).map(p=>({id:p.id,name:p.name,purpose:p.purpose,access:p.access})),localProblems,revisions:entry.patches.map(p=>({path:p.path,before:getPath(entry.before,p.path)??null,after:p.value,issues:entry.issues})),rules:['只修改实际失败的叶子或追加缺失条目。原有身份、财物、技能、服务、合格兄弟字段和旧记忆保持冻结。','知识仍为本人私有，候选新增事实必须有既有来源支持，共享事件双方核对，不传播秘密。','地方问题中作者提出的解法尚未得到当事人同意；当事人身份不自动授予另一人的秘密知情权。']};
}
function patchDraftRequest(entry,feedback,context){return{thinking:{type:'disabled'},temperature:0,max_tokens:6000,response_format:{type:'json_object'},messages:[{role:'system',content:'返回指定 candidate 原样的 JSON，不增加、删除或改写任何事实。修订仅限已列出的审计失败路径。'},{role:'user',content:JSON.stringify({candidate:patchDraft(entry),context,corrections:feedback})}]};}
function validatePatchDraft(draft,entry){const errors=[];try{assert.deepEqual(draft,patchDraft(entry),'候选与冻结补丁不符');const after=applyDepthDraft(entry.before,draft);verifyUnchanged(entry.before,after,entry);const prior=new Set(findNpcRuleWording(entry.before).map(issueKey));for(const issue of findNpcRuleWording(after))if(!prior.has(issueKey(issue))||entry.issues.some(x=>issueKey(x)===issueKey(issue)))throw Error(`${issue.field}: 规则措辞未修复`);}catch(e){errors.push(e.message);}return{errors,warnings:[]};}
export function validatePatchResults(entries,world){
 const replacements=new Map(entries.map(e=>[e.id,e.facts])),beforeWorld={...world,npcs:world.npcs.map(n=>entries.find(e=>e.id===n.id)?.before??n)},afterWorld={...world,npcs:world.npcs.map(n=>replacements.get(n.id)??n)};
 const prior=new Set(auditNpcDepth(beforeWorld).issues.map(issueKey)),current=auditNpcDepth(afterWorld).issues;
 const targeted=new Set(entries.flatMap(e=>e.issues).map(issueKey));
 for(const issue of current)assert.ok(!targeted.has(issueKey(issue))&&prior.has(issueKey(issue)),`审计修订未解决或引入缺口 ${issue.id}/${issue.field}/${issue.code}`);
 return afterWorld;
}
