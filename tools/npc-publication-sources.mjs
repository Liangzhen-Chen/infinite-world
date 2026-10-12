import assert from 'node:assert/strict';
import path from 'node:path';
import {hashContent} from './content-pipeline.mjs';
import {readM4Publication} from './publish-m4-batch2.mjs';

// Opaque, process-local receipts cannot be manufactured from candidate JSON.
const receipts=new WeakMap();
const teachingIncrement={id:'npc_hw_xuling',services:['spell_earth_03','spell_fire_07'],skills:['skill_fire_07','skill_earth_03']};
const binding=npcs=>hashContent(npcs.map(({id,services,skills})=>({id,services,skills})));
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
