import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {loadWorld} from '../tools/load-world.mjs';
import {prepareNpcPublication,publishNpcProfiles,mergeNpcProfiles,protectedNpcFields} from '../tools/m2-people-publish.mjs';
import {readPublishedNpcIncrements} from '../tools/npc-publication-sources.mjs';
import {readPublishedNpcDepth} from '../tools/npc-depth-publication-sources.mjs';
const formal=await loadWorld(),root=path.resolve('world/drafts/m2-people');
// T24's existing negative fixtures stay on their frozen pre-depth catalog.
const depthBefore=JSON.parse(await fs.readFile('world/drafts/w1/existing-depth/first-review/base.json','utf8'));
const world={...formal,npcs:formal.npcs.map(n=>depthBefore.find(row=>row.id===n.id)??n)};
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const [baseline,candidate]=await Promise.all(['baseline.json','candidate.json'].map(file=>read(path.join(root,file))));
const teacher=w=>w.npcs.find(n=>n.id==='npc_hw_xuling');
async function temporary(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'npc-increments-'));
 t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(dir,{recursive:true,force:true});});
 return dir;
}
async function sourceCopy(t){const dir=await temporary(t);await fs.cp(path.resolve('world/drafts/m4-batch2'),path.join(dir,'drafts/m4-batch2'),{recursive:true});return dir;}

test('真实正式世界prepare保留四项教学、17人特征和钱物，直接纯函数仍须有效凭证',async()=>{
 const prepared=await prepareNpcPublication({world:formal,root});assert.equal(prepared.changed,false);
 assert.deepEqual(teacher(prepared.world).services,['spell_light','profession_mage','spell_earth_03','spell_fire_07']);
 assert.deepEqual(teacher(prepared.world).skills,['skill_light','skill_fire_07','skill_earth_03']);
 assert.deepEqual(prepared.world.npcs,formal.npcs);
 const traitsIds=baseline.filter(n=>n.traits?.[0]==='原档待扩充').map(n=>n.id);assert.equal(traitsIds.length,17);
 for(const id of traitsIds)assert.deepEqual(prepared.world.npcs.find(n=>n.id===id).traits,world.npcs.find(n=>n.id===id).traits);
 assert.throws(()=>mergeNpcProfiles(world.npcs,candidate,baseline),/许苓|npc_hw_xuling.services/);
 assert.throws(()=>mergeNpcProfiles(world.npcs,candidate,baseline,{worldRoot:path.resolve('world')}),/凭证无效/);
 const receipt=await readPublishedNpcIncrements({world});assert.deepEqual(mergeNpcProfiles(world.npcs,candidate,baseline,receipt),world.npcs);
 const teaching=await readPublishedNpcIncrements({world:formal}),depth=await readPublishedNpcDepth({world:formal});
 assert.deepEqual(mergeNpcProfiles(formal.npcs,candidate,baseline,teaching,depth),formal.npcs);
 assert.throws(()=>mergeNpcProfiles(world.npcs,candidate,baseline,structuredClone(receipt)),/凭证无效/);
 const changed=structuredClone(world);teacher(changed).skills.push('skill_unknown');
 assert.throws(()=>mergeNpcProfiles(changed.npcs,candidate,baseline,receipt),/凭证与当前世界不符/);
});

test('隔离世界预演不写，首次写入后重发零变动，运行字段与17人traits完全保留',async t=>{
 const dir=await sourceCopy(t);
 for(const sub of ['meta','people','geo','lore'])await fs.cp(path.resolve('world',sub),path.join(dir,sub),{recursive:true});
 const npcs=structuredClone(world.npcs);
 for(const n of npcs)if(candidate.npcs.some(p=>p.id===n.id)){delete n.wealth;delete n.towardPlayer;}
 teacher({npcs}).coins=27;teacher({npcs}).inventory.item_wood=0;
 const file=path.join(dir,'people/baseline.json');await fs.writeFile(file,JSON.stringify(npcs));const before=await fs.readFile(file,'utf8');
 const preview=await publishNpcProfiles({worldRoot:dir,root});assert.equal(preview.changed,true);assert.equal(preview.written,false);assert.equal(await fs.readFile(file,'utf8'),before);
 const first=await publishNpcProfiles({worldRoot:dir,root,write:true});assert.equal(first.written,true);
 const installed=await loadWorld(dir);
 for(const n of installed.npcs){const old=npcs.find(p=>p.id===n.id);for(const key of [...protectedNpcFields,'traits'])assert.deepEqual(n[key],old[key],`${n.id}.${key}`);}
 const bytes=await fs.readFile(file,'utf8');assert.equal((await publishNpcProfiles({worldRoot:dir,root})).changed,false);assert.equal((await publishNpcProfiles({worldRoot:dir,root,write:true})).written,false);assert.equal(await fs.readFile(file,'utf8'),bytes);
});

test('删除、替换、额外服务技能、顺序和技能表示变化仍拒绝',async()=>{
 for(const change of [
  n=>n.services.shift(),n=>n.services[0]='spell_fire_07',n=>n.services.push('spell_light_05'),n=>n.skills.push('skill_light_05'),
  n=>n.services.reverse(),n=>n.skills.reverse(),n=>n.skills.splice(0,1),n=>n.skills=n.skills.map(id=>({id,proficiency:100})),
 ]){const w=structuredClone(world);change(teacher(w));await assert.rejects(prepareNpcPublication({world:w,root}),/正式服务或人物身份|导师技能尚未正式发布/);}
});

test('候选确已审核但正式法术、技能或导师关系缺失和同ID值冲突仍拒绝',async()=>{
 for(const change of [
  w=>w.spells=w.spells.filter(s=>s.id!=='spell_fire_07'),
  w=>w.skills=w.skills.filter(s=>s.id!=='skill_fire_07'),
  w=>w.skills.find(s=>s.id==='skill_fire_07').learnFee+=1,
  w=>w.spells.find(s=>s.id==='spell_earth_03').teachers=['npc_hw_chenbai'],
  w=>w.spells.find(s=>s.id==='spell_fire_07').theory+='未经审核的效果',
  w=>teacher(w).services.splice(teacher(w).services.indexOf('spell_fire_07'),1),
 ]){const w=structuredClone(world);change(w);await assert.rejects(prepareNpcPublication({world:w,root}),/尚未正式发布或内容冲突|导师服务尚未正式发布/);}
});

test('合法未发布草稿和版本标记不能授权教学增量',async()=>{
 const w=structuredClone(world);w.spells=w.spells.filter(s=>!['spell_earth_03','spell_fire_07'].includes(s.id));
 assert.equal(w.rules.npcStockUpdateVersion,1);
 await assert.rejects(prepareNpcPublication({world:w,root}),/法术尚未正式发布/);
});

test('根目录缺少来源、伪造学习映射、错导师和审核hash漂移均拒绝',async t=>{
 const missing=await temporary(t);await assert.rejects(prepareNpcPublication({world,root,worldRoot:missing}),/ENOENT/);
 for(const mutate of [
  async dir=>{const file=path.join(dir,'drafts/m4-batch2/learning-sources.json'),v=await read(file);v.teacherChanges[0].appendServices.push('spell_light_05');await fs.writeFile(file,JSON.stringify(v));},
  async dir=>{const file=path.join(dir,'drafts/m4-batch2/learning-sources.json'),v=await read(file);v.mappings[0].teachers=['npc_hw_chenbai'];await fs.writeFile(file,JSON.stringify(v));},
  async dir=>{const file=path.join(dir,'drafts/m4-batch2/spell_fire_07.json'),v=await read(file);v.fingerprint='forged';await fs.writeFile(file,JSON.stringify(v));},
  async dir=>{const file=path.join(dir,'drafts/m4-batch2/batch-0.json'),v=await read(file);v.l4.approved=false;await fs.writeFile(file,JSON.stringify(v));},
 ]){const dir=await sourceCopy(t);await mutate(dir);await assert.rejects(prepareNpcPublication({world,root,worldRoot:dir}),/学习来源|骨架或引用事实已改变|L4/);}
});

test('精确增量不授权其他NPC、身份、来源、作息、年龄或后续完整档变动',async()=>{
 for(const change of [
  w=>w.npcs.find(n=>n.id==='npc_hw_chenbai').services.push('spell_earth_03'),
  w=>teacher(w).intelligence='all',w=>teacher(w).aliases.push('新称呼'),w=>teacher(w).flags={forged:true},
  w=>teacher(w).notes+='新增经历',w=>teacher(w).schedule.default[0].activity='新作息',w=>teacher(w).age+=1,
  w=>teacher(w).description+='新增未经审核的完整档',
 ]){const w=structuredClone(world);change(w);await assert.rejects(prepareNpcPublication({world:w,root}),/正式服务或人物身份|正式来源事实|正式作息|正式年龄|已发布档案发生后续修改/);}
});

test('原人物L2事实审核记录篡改仍在合并前被拒绝',async t=>{
 const dir=await temporary(t);await fs.cp(root,dir,{recursive:true});
 const recordFile=path.join(dir,`${candidate.npcs[0].id}.json`),record=await read(recordFile);record.review={contradictions:[{severity:'hard',field:'description',quote:'伪造',reason:'未审核事实'}]};await fs.writeFile(recordFile,JSON.stringify(record));
 await assert.rejects(prepareNpcPublication({world,root:dir}),/审查后内容已改变/);
});
