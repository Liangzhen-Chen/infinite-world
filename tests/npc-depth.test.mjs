import {yupoFirstEdition,copyWorldFixture} from './fixtures/w1-depth-editions.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {knowledgeWordingCorrections} from '../world/design/w1-yupo-depth.mjs';
import {publishVillages,villagesOriginalWorld} from '../tools/publish-w1-villages.mjs';
import {verifyUnchanged,depthBatches,depthEntries,applyDepthDraft,validateDraft,contextFor} from '../tools/npc-depth-content.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {npcContext,selectNpcSeedMemories} from '../server-plugin/npc-memory.mjs';
import {compatibleWorld,planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
const root=path.resolve('world/drafts/w1/yupo-depth'),read=async file=>JSON.parse(await fs.readFile(path.join(root,file+'.json'),'utf8'));
const world=await yupoFirstEdition(),base=await read('base'),entries=depthEntries(base),drafts=await Promise.all(entries.map(e=>read(e.id).then(r=>r.draft)));
const candidate=JSON.parse(await fs.readFile('world/drafts/w1/villages/candidate.json','utf8'));
async function temporary(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fields-npc-depth-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const root=await copyWorldFixture(dir);await fs.writeFile(path.join(root,'people/baseline.json'),JSON.stringify(world.npcs));await fs.unlink(path.join(root,'drafts/w1/depth-publication.json'));for(const directory of ['yp-depth-rest','wt-depth','lq-depth','sb-depth'])await fs.rm(path.join(root,'drafts/w1',directory),{recursive:true,force:true});return root;}

test('六人定点深度不改变身份、钱物、旧记忆和原目标，双方共享事件而非相互全知',()=>{
 for(const [i,e]of entries.entries()){const after=applyDepthDraft(e.before,drafts[i]);verifyUnchanged(e.before,after);assert.deepEqual(validateDraft(drafts[i],e).errors,[]);assert.deepEqual(after,world.npcs.find(n=>n.id===e.id));assert.equal(after.knowledge.known.length,3);assert.notEqual(after.voice.register,after.voice.habits[0]);assert.equal(after.relationships.length,e.before.relationships.length);assert.ok(after.relationships.every((r,j)=>r.note!==e.before.relationships[j].note));const shared=after.memorySeeds.at(-1),other=world.npcs.find(n=>n.id===shared.knownBy.find(id=>id!==e.id));assert.ok(other.memorySeeds.some(m=>m.id===shared.id));assert.ok(after.knowledge.unknown.every(x=>!['本人未在场且无人实际转告的事','他人未公开的私有财物和秘密'].includes(x)));}
 const checked=validateWorld(world,{stage:'engine'});assert.equal(checked.ok,true,checked.errors.join('\n'));const release=validateWorld(world,{stage:'release'});assert.equal(release.ok,false,'当前全体full仍有真实缺口');assert.ok(release.errors.some(error=>error.startsWith('完整人物深度：')));
});
test('既有发布入口验证全部补充审核，重复零写入，保留既有库存现金而拒绝改身份',async t=>{
 const dir=await temporary(t);assert.deepEqual((await publishVillages({root:dir,publish:true})).changed,[]);
 const file=path.join(dir,'people/baseline.json'),people=JSON.parse(await fs.readFile(file,'utf8')),p=people.find(n=>n.id===base[0].id);p.coins=7;p.inventory={item_bread:0};await fs.writeFile(file,JSON.stringify(people));
 assert.deepEqual((await publishVillages({root:dir,publish:true})).changed,[]);const after=await loadWorld(dir);assert.equal(after.npcs.find(n=>n.id===p.id).coins,7);assert.deepEqual(after.npcs.find(n=>n.id===p.id).inventory,{item_bread:0});
 p.age++;await fs.writeFile(file,JSON.stringify(people));await assert.rejects(publishVillages({root:dir,publish:true}),/人物补充冲突/);
});
test('首次四村安装仍要求原候选与新补充逐条审核，篡改补充不能写正式目录',async t=>{
 const dir=await temporary(t),original=villagesOriginalWorld(world),files={'people/baseline.json':'npcs','people/residents.json':'residents','people/households.json':'households','geo/settlements.json':'settlementProfiles','geo/locations.json':'locations','geo/routes.json':'routes'};
 for(const [file,key]of Object.entries(files))await fs.writeFile(path.join(dir,file),JSON.stringify(original[key]));
 assert.equal((await publishVillages({root:dir,publish:true})).changed.length,6);assert.equal((await loadWorld(dir)).npcs.find(n=>n.id===entries[0].id).knowledge.known.length,3);
 const file=path.join(dir,'drafts/w1/yupo-depth',entries[0].id+'.json'),r=JSON.parse(await fs.readFile(file,'utf8')),before=await fs.readFile(path.join(dir,'people/baseline.json'),'utf8');r.draft.knowledge.known[0].fact='未审核的凭空真相';await fs.writeFile(file,JSON.stringify(r));await assert.rejects(publishVillages({root:dir,publish:true}),/审查后内容已改变/);assert.equal(await fs.readFile(path.join(dir,'people/baseline.json'),'utf8'),before);
});
test('目录升级保留进行中的NPC现金、物品与记忆流，新增认知进入正式场景读取',async()=>{
 const previous={...world,npcs:world.npcs.map(n=>base.find(b=>b.id===n.id)??n)},legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
 const engine=new WorldEngine(world),oldEngine=new WorldEngine(previous),old=oldEngine.createCharacter(legacy,{},'depth-upgrade'),id=entries[0].id;
 old.state.npcs[id].coins=8;old.state.npcs[id].inventory={item_bread:0};old.state.npcs[id].memoryStream=[{id:'actual-old-event',kind:'trade',content:'亲历旧交易',participants:[id,'player'],minute:20,sourceEvent:'old',salience:3,sourceType:'亲历'}];
 const incoming=compatibleWorld(previous,world).world,plan=planWorldUpgrade(old,previous,incoming,{worldHash:'depth-1',eventId:'depth-upgrade'}),after=applyPatches(old,plan.patches);
 assert.equal(plan.result.added.length,0);assert.equal(after.state.npcs[id].coins,8);assert.deepEqual(after.state.npcs[id].inventory,{item_bread:0});assert.deepEqual(after.state.npcs[id].memoryStream,old.state.npcs[id].memoryStream);
 assert.deepEqual(npcContext(engine,after,id).known,world.npcs.find(n=>n.id===id).knowledge.known.map(k=>k.fact));
 assert.equal(planWorldUpgrade(after,incoming,incoming,{worldHash:'depth-1',eventId:'again'}).result.added.length,0);
});
test('同场共事者与具体提问能唤起第三条共享旧事，旁人仍没有那份记忆',async()=>{
 const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),engine=new WorldEngine(world),doc=engine.createCharacter(legacy,{},'depth-scene');
 const first='npc_yp_zhaofeng',other='npc_yp_qiaoduan',outsider='npc_yp_jiangmi';doc.state.location='loc_yp_fields';doc.state.npcs[first].location=doc.state.location;doc.state.npcs[first].activity='看沟';doc.state.npcs[other].location=doc.state.location;doc.state.npcs[other].activity='看沟';
 const seeds=selectNpcSeedMemories(engine,doc,first);assert.equal(seeds.length,2);assert.ok(seeds.includes(world.npcs.find(n=>n.id===first).memorySeeds.at(-1).event));
 doc.state.npcs[other].location='bld_yp_home_02';assert.ok(selectNpcSeedMemories(engine,doc,first,'你和乔端核对水痕时商定轮次了吗').some(s=>s.includes('乔端')));
 assert.ok(selectNpcSeedMemories(engine,doc,outsider,'赵枫和乔端核对水痕').every(s=>!s.includes('核对水痕')));
 const scene=engine.scene(doc,'你和乔端核对水痕时商定轮次了吗');assert.match(scene,/未.*商定|没商定/);
});

test('三条已审核旧措辞可定点升级，其他同字段篡改不能借措辞修正通过',async t=>{
 const dir=await temporary(t),file=path.join(dir,'people/baseline.json'),rows=JSON.parse(await fs.readFile(file,'utf8'));
 for(const correction of knowledgeWordingCorrections){const person=rows.find(n=>n.id===correction.id),fact=person.knowledge.known.find(f=>f.fact===correction.to);assert.ok(fact);fact.fact=correction.from;}
 await fs.writeFile(file,JSON.stringify(rows));assert.deepEqual((await publishVillages({root:dir,publish:true})).changed,['people/baseline.json']);
 const after=JSON.parse(await fs.readFile(file,'utf8'));for(const correction of knowledgeWordingCorrections)assert.ok(after.find(n=>n.id===correction.id).knowledge.known.some(f=>f.fact===correction.to));
 assert.deepEqual((await publishVillages({root:dir,publish:true})).changed,[]);
 after.find(n=>n.id===knowledgeWordingCorrections[0].id).knowledge.known[1].fact+='而且知道另一人的私密账';await fs.writeFile(file,JSON.stringify(after));await assert.rejects(publishVillages({root:dir,publish:true}),/人物补充冲突/);
});

