import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {readApprovedContent,hashContent} from './content-pipeline.mjs';
import {validateFoundation,validateDraft,contextFor,revision} from './m2-people-content.mjs';
import {npcProfileSchema} from './npc-profile-schema.mjs';
export const protectedNpcFields=['schedule','coins','inventory','services','skills','intelligence','aliases','flags','location','trust','affection','creditPolicy'];
export const profileFields=[...Object.keys(npcProfileSchema.properties).filter(k=>!protectedNpcFields.includes(k)),'authoredBasis'];
const stableSourceFields=['id','name','notes','occupation','scope'];
const placeholderTraits=value=>Array.isArray(value)&&value.length===1&&value[0]==='原档待扩充';
function reviewedTraits(n,profile,original){
 if(!placeholderTraits(n.traits))return structuredClone(n.traits);
 assert.ok(placeholderTraits(original?.traits),`原审核档无特征占位:${n.id}`);
 assert.deepEqual(profile.traits,profile.personality.traits,`审核特征来源不一致:${n.id}`);
 assert.ok(profile.traits.length>0&&!placeholderTraits(profile.traits),`审核特征仍是占位:${n.id}`);
 if(n.personality)assert.deepEqual(n.personality.traits,profile.personality.traits,`正式性格特征变动，须重新审核:${n.id}`);
 return structuredClone(profile.personality.traits);
}
export function syncReviewedNpcTraits(current,candidate,baseline){
 const profiles=new Map(candidate.npcs.map(n=>[n.id,n])),originals=new Map(baseline.map(n=>[n.id,n]));
 return current.map(n=>{const profile=profiles.get(n.id);if(!profile||!placeholderTraits(n.traits))return structuredClone(n);
  assert.equal(n.name,profile.name,`正式人物身份变动:${n.id}`);
  return {...structuredClone(n),traits:reviewedTraits(n,profile,originals.get(n.id))};
 });
}
export function mergeNpcProfiles(current,candidate,baseline){
 const profiles=new Map(candidate.npcs.map(n=>[n.id,n])),originals=new Map(baseline.map(n=>[n.id,n]));
 assert.equal(profiles.size,candidate.npcs.length,'候选人物编号重复');
 for(const id of profiles.keys())assert.ok(current.some(n=>n.id===id),`正式人物缺失:${id}`);
 return current.map(n=>{
  const profile=profiles.get(n.id);if(!profile)return structuredClone(n);
  const original=originals.get(n.id);assert.ok(original,`缺少审查原档:${n.id}`);
  for(const key of stableSourceFields)assert.deepEqual(n[key],original[key],`正式来源事实变动，须重新审核:${n.id}.${key}`);
  for(const key of ['services','skills','intelligence','aliases','flags'])assert.deepEqual(n[key],original[key],`正式服务或人物身份变动，须重新审核:${n.id}.${key}`);
  assert.deepEqual(n.schedule,profile.schedule,`正式作息与审核骨架不同:${n.id}`);
  const correction=candidate.corrections.find(x=>x.id===n.id&&x.field==='age');
  assert.ok(n.age===profile.age||correction&&n.age===correction.old&&profile.age===correction.new,`正式年龄来源变动:${n.id}`);
  const merged=structuredClone(n);
  for(const key of profileFields){
   assert.ok(Object.hasOwn(profile,key),`缺少发布字段:${n.id}.${key}`);
   const value=structuredClone(profile[key]);if(key==='wealth')value.cashRange=[n.coins,n.coins];
   // Repeated publication must not silently overwrite subsequent profile edits.
   if(Object.hasOwn(n,key))assert.deepEqual(n[key],value,`已发布档案发生后续修改:${n.id}.${key}`);
   merged[key]=value;
  }
  merged.traits=reviewedTraits(n,profile,original);
  merged.age=profile.age;
  // Profile money remains a description of the live catalog, not a transfer.
  merged.wealth.cashRange=[n.coins,n.coins];
  for(const key of protectedNpcFields)assert.deepEqual(merged[key],n[key],`禁止覆盖正式字段:${n.id}.${key}`);
  return merged;
 });
}
async function readReviewedProfiles(world,root){
 const read=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
 const [bones,baseline,candidate]=await Promise.all(['foundation.json','baseline.json','candidate.json'].map(read));
 validateFoundation(bones,{...world,npcs:baseline});
 const drafts=await readApprovedContent(root,bones.npcs,{contextFor,revision});
 assert.equal(drafts.length,bones.npcs.length,'所有候选必须逐条通过审核');
 const rebuilt=bones.npcs.map(n=>{
  const draft=drafts.find(d=>d.id===n.id);const check=validateDraft(draft,n);assert.deepEqual(check.errors,[],`L1:${n.id}`);
  return {...n,description:draft.description,voice:{...n.voice,samples:draft.voiceSamples}};
 });
 assert.deepEqual(candidate.npcs,rebuilt,'候选不等于已审核骨架和正文');assert.deepEqual(candidate.corrections,bones.corrections,'年龄修正凭据变更');
 return {candidate,baseline};
}
export async function prepareNpcPublication({world=undefined,root=path.resolve('world/drafts/m2-people'),traitsOnly=false}={}){
 world??=await loadWorld();const {candidate,baseline}=await readReviewedProfiles(world,root);
 const npcs=traitsOnly?syncReviewedNpcTraits(world.npcs,candidate,baseline):mergeNpcProfiles(world.npcs,candidate,baseline),result={...world,npcs};
 const validation=validateWorld(result);assert.ok(validation.ok,validation.errors.join('\n'));
 return {world:result,candidate,baseline,validation,changed:hashContent(npcs)!==hashContent(world.npcs)};
}
export async function publishNpcProfiles({worldRoot=path.resolve('world'),root=path.resolve('world/drafts/m2-people'),write=false,traitsOnly=false}={}){
 const file=path.join(worldRoot,'people/baseline.json'),before=await fs.readFile(file,'utf8');
 const world=await loadWorld(worldRoot),result=await prepareNpcPublication({world,root,traitsOnly});
 assert.equal(await fs.readFile(file,'utf8'),before,'正式目录在审核期间已改变，停止以避免覆盖并发写入');
 if(write&&result.changed){const temporary=`${file}.${process.pid}.tmp`;await fs.writeFile(temporary,JSON.stringify(result.world.npcs,null,before.includes('\n  ')?2:undefined)+'\n');await fs.rename(temporary,file);}
 return {people:result.candidate.npcs.length,traitsOnly,changed:result.changed,written:write&&result.changed,protectedFields:protectedNpcFields,sourceHash:hashContent(JSON.parse(before)),resultHash:hashContent(result.world.npcs),warnings:result.validation.warnings};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const traitsOnly=process.argv.includes('--traits-only'),result=await publishNpcProfiles({write:process.argv.includes('--write'),traitsOnly});
 await fs.writeFile(traitsOnly?'world/drafts/m2-people/traits-publication.json':'world/drafts/m2-people/publication.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
