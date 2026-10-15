import {yupoFirstEdition,copyWorldFixture} from './fixtures/w1-depth-editions.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';import {depthEntries,applyDepthDraft,verifyUnchanged,validateDraft,contextFor,revision} from '../tools/npc-depth-content.mjs';
import {hashContent,readApprovedContent} from '../tools/content-pipeline.mjs';import {revision as nextRevision} from '../world/design/w1-yupo-depth-next.mjs';
import {publishVillages} from '../tools/publish-w1-villages.mjs';import {WorldEngine} from '../server-plugin/engine.mjs';import {npcContext,selectNpcSeedMemories} from '../server-plugin/npc-memory.mjs';
const world=await yupoFirstEdition(),root='world/drafts/w1/yupo-depth-next',read=async name=>JSON.parse(await fs.readFile(`${root}/${name}.json`,'utf8'));
const base=await read('base'),entries=depthEntries(base,'yupo-depth-next'),drafts=await readApprovedContent(root,entries,{contextFor:e=>contextFor(e,world),revision:nextRevision});
test('四人补充只改深度字段，既有关系数值、目标与旧私有记忆不变',()=>{
 assert.equal(entries.length,4);assert.equal(drafts.length,4);
 for(const e of entries){const d=drafts.find(d=>d.id===e.id),after=applyDepthDraft(e.before,d);assert.deepEqual(validateDraft(d,e).errors,[]);verifyUnchanged(e.before,after);assert.deepEqual(after,world.npcs.find(n=>n.id===e.id));
  for(const old of e.before.relationships){const n=after.relationships.find(n=>n.with===old.with),{note,...identity}=old,{note:nextNote,...nextIdentity}=n;assert.deepEqual(nextIdentity,identity);assert.notEqual(note,nextNote);}
  assert.equal(after.relationships.length,4);assert.equal(after.memorySeeds.at(-1).knownBy.length,2);assert.ok(Object.values(after.goals).flat().every(g=>g.progress===0&&g.steps.length===2));
 }
 assert.deepEqual(world.npcs.find(n=>n.id==='npc_yp_gaoxin').sex,'女');assert.equal(contextFor(entries[0],world).people.find(p=>p.id==='npc_yp_gaoxin').sex,'女');assert.match(drafts.find(d=>d.id===entries[0].id).memorySeeds.at(-1).event,/她说/);
});
test('以已有冲突连接新旧人物，另一组的谈话不自动变为本人记忆',async()=>{
 const byId=new Map(world.npcs.map(n=>[n.id,n])),pairs=[['qinli','gaoxin'],['taozi','luxia']];
 for(const [a,b] of pairs){const first=byId.get('npc_yp_'+a),second=byId.get('npc_yp_'+b);assert.ok(first.relationships.some(r=>r.with===second.id));assert.ok(second.relationships.some(r=>r.with===first.id));assert.equal(first.memorySeeds.at(-1).id,second.memorySeeds.at(-1).id);}
 assert.ok(byId.get('npc_yp_qinli').relationships.some(r=>r.with==='npc_yp_zhusheng'));assert.ok(byId.get('npc_yp_zhusheng').relationships.some(r=>r.with==='npc_yp_qinli'));
 assert.ok(byId.get('npc_yp_gaoxin').relationships.some(r=>r.with==='npc_yp_taozi'));assert.ok(byId.get('npc_yp_taozi').relationships.some(r=>r.with==='npc_yp_gaoxin'));
 for(const key of ['gaoxin','luxia'])assert.equal(JSON.stringify(byId.get('npc_yp_'+key).knowledge).includes('误放'),false,'未知问题也不能暗含已经知晓另一人的私事');
 const engine=new WorldEngine(world),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),doc=engine.createCharacter(seed,{},'depth-next-private');doc.state.location='bld_yp_hall';
 for(const id of ['npc_yp_qinli','npc_yp_gaoxin']){doc.state.npcs[id].location=doc.state.location;doc.state.npcs[id].activity='核对桌位';}
 assert.ok(selectNpcSeedMemories(engine,doc,'npc_yp_qinli','高忻说桌位先后定好了吗').some(s=>s.includes('高忻')&&s.includes('还没')));
 assert.ok(selectNpcSeedMemories(engine,doc,'npc_yp_taozi','秦砺和高忻怎么分桌位').every(s=>!s.includes('高忻')));
 assert.ok(npcContext(engine,doc,'npc_yp_luxia').known.every(f=>!f.includes('地名')&&!f.includes('秦砺')));
});
test('批次扩展不改变旧六人审核指纹，累计费用仍受原总账和本批上限约束',async()=>{
 const oldRoot='world/drafts/w1/yupo-depth',oldBase=JSON.parse(await fs.readFile(oldRoot+'/base.json','utf8'));
 for(const e of depthEntries(oldBase)){const r=JSON.parse(await fs.readFile(`${oldRoot}/${e.id}.json`,'utf8'));assert.equal(r.fingerprint,hashContent({entry:e,context:contextFor(e,world),revision}));assert.deepEqual(world.npcs.find(n=>n.id===e.id),applyDepthDraft(e.before,r.draft));}
 const allocation=await read('allocation'),terminal=await read('terminal');assert.equal(allocation.wave,'M4-shared');assert.equal(allocation.waveLimitYuan,20);assert.equal(allocation.incrementLimitYuan,.3);assert.ok(terminal.incrementSpentYuan<=.3);assert.ok(allocation.limitYuan<=20);
 assert.throws(()=>depthEntries(base,'unregistered'),/未登记/);
});
test('原入口逐批验证，重复不重写，篡改新一批不能覆写人物钱物',async t=>{
 const parent=await fs.mkdtemp(path.join(os.tmpdir(),'fields-depth-next-')),dir=await copyWorldFixture(parent,world);t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(parent,{recursive:true,force:true});});await fs.writeFile(path.join(dir,'people/baseline.json'),JSON.stringify(world.npcs));await fs.unlink(path.join(dir,'drafts/w1/depth-publication.json'));for(const directory of ['yp-depth-rest','wt-depth','lq-depth','sb-depth'])await fs.rm(path.join(dir,'drafts/w1',directory),{recursive:true,force:true});
 const first=await publishVillages({root:dir,publish:true});assert.equal(first.amendedNpcIds.length,10);assert.deepEqual(first.changed,[]);
 const file=path.join(dir,'people/baseline.json'),rows=JSON.parse(await fs.readFile(file,'utf8')),p=rows.find(n=>n.id===entries[0].id);p.coins=9;p.inventory={item_bread:0};await fs.writeFile(file,JSON.stringify(rows));assert.deepEqual((await publishVillages({root:dir,publish:true})).changed,[]);
 const saved=await fs.readFile(file,'utf8'),recordFile=path.join(dir,root.replace('world/',''),entries[0].id+'.json'),record=JSON.parse(await fs.readFile(recordFile,'utf8'));record.draft.knowledge.known.push({fact:'所有人的秘密都知道',source:p.id,reliability:'亲历'});await fs.writeFile(recordFile,JSON.stringify(record));await assert.rejects(publishVillages({root:dir,publish:true}),/审查后内容已改变/);assert.equal(await fs.readFile(file,'utf8'),saved);
});
