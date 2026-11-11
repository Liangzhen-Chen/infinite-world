import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {hashContent,readApprovedContent} from './content-pipeline.mjs';
import {readM4Publication} from './publish-m4-batch2.mjs';

// Opaque, process-local receipts cannot be manufactured from candidate JSON.
const receipts=new WeakMap();
const teachingIncrement={id:'npc_hw_xuling',services:['spell_earth_03','spell_fire_07'],skills:['skill_fire_07','skill_earth_03']};
const binding=npcs=>hashContent(npcs.map(({id,services,skills})=>({id,services,skills})));
// K10b was published after the W1 depth edition. Replay its existing L1/L2/L4
// evidence before treating those exact fields as a later approved edition.
export async function readPublishedNpcAmendments({world,worldRoot}){
 const root=path.join(worldRoot,'drafts/k10b-public-maintenance');
 let candidate;
 try{candidate=JSON.parse(await fs.readFile(path.join(root,'candidate.json'),'utf8'));}
 catch(error){if(error.code==='ENOENT')return [];throw error;}
 const {entries,contexts,revision}=candidate;
 const applied=entries.filter(e=>e.file==='world/people/baseline.json'&&e.field==='relationships'
  &&hashContent(world.npcs.find(n=>n.id===e.target)?.[e.field]??null)===hashContent(e.after));
 // A proposal that has not reached this world edition is not a dependency.
 if(!applied.length)return [];
 assert.equal(revision,'k10b-public-maintenance-1','人物后续审批版本不符');
 assert.equal(entries.length,7,'人物后续审批条目不完整');
 assert.equal(contexts.length,entries.length,'人物后续审批引用不完整');
 const approved=await readApprovedContent(path.join(root,'review'),entries,{revision,contextFor:e=>contexts[entries.indexOf(e)]});
 assert.equal(approved.length,entries.length,'人物后续审批尚未全部通过');
 const collections={'world/people/baseline.json':world.npcs,'world/geo/locations.json':world.locations,'world/geo/settlements.json':world.settlementProfiles};
 for(const e of entries){
  assert.deepEqual(approved.find(d=>d.id===e.id),{id:e.id,field:e.field,value:e.after},'人物后续审批候选与已审正文不符');
  const row=e.file==='world/meta/rules.json'?world.rules:collections[e.file]?.find(n=>n.id===e.target);
  assert.deepEqual(e.field.split('.').reduce((value,key)=>value?.[key],row),e.after,`人物后续审批与当前世界不符:${e.id}`);
 }
 return applied;
}
export function applyPublishedNpcAmendments(person,amendments){
 const out=structuredClone(person);
 for(const e of amendments.filter(e=>e.target===person.id)){
  assert.ok([e.before,e.after].some(value=>hashContent(value)===hashContent(out[e.field])),`人物后续审批原档不符:${person.id}.${e.field}`);
  out[e.field]=structuredClone(e.after);
 }
 return out;
}
export async function readPublishedNpcIncrements({world,worldRoot=path.resolve('world')}={}){
 const root=path.resolve(worldRoot),publication=await readM4Publication(path.join(root,'drafts/m4-batch2'));
 const {sources}=publication,expected=teachingIncrement;
 assert.deepEqual(sources.teacherChanges.map(row=>({id:row.id,services:row.appendServices,skills:row.appendSkills})),[expected],'后续教学增量来源不符');
 const teacher=world.npcs.find(n=>n.id===expected.id);
 assert.ok(teacher,'已发布导师不存在');
 for(const service of expected.services){
  const mapping=sources.mappings.find(row=>row.spell===service),spell=publication.spells.find(row=>row.id===service);
  assert.ok(mapping&&spell,`后续教学映射缺失:${service}`);
  assert.deepEqual(mapping.teachers,[expected.id],`后续教学导师不符:${service}`);
  assert.equal(mapping.skill.id,spell.skill,`后续教学技能映射不符:${service}`);
  assert.ok(expected.skills.includes(mapping.skill.id),`后续教学技能未授权:${service}`);
  assert.deepEqual(world.spells.find(row=>row.id===service),{...spell,teachers:mapping.teachers},`法术尚未正式发布或内容冲突:${service}`);
  assert.deepEqual(world.skills.find(row=>row.id===mapping.skill.id),mapping.skill,`技能尚未正式发布或内容冲突:${mapping.skill.id}`);
  assert.ok(Array.isArray(teacher.services)&&teacher.services.includes(service),`导师服务尚未正式发布:${service}`);
  assert.ok(Array.isArray(teacher.skills)&&teacher.skills.includes(mapping.skill.id),`导师技能尚未正式发布:${mapping.skill.id}`);
 }
 const receipt=Object.freeze({worldRoot:root});
 receipts.set(receipt,{binding:binding(world.npcs),increments:new Map([[expected.id,structuredClone(expected)]])});
 return receipt;
}
export function verifiedNpcIncrements(receipt,current){
 if(receipt===undefined)return new Map();
 const record=receipts.get(receipt);
 assert.ok(record,'后续教学增量凭证无效');
 assert.equal(binding(current),record.binding,'后续教学增量凭证与当前世界不符');
 return structuredClone(record.increments);
}
