import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {mergeHewan,publishHewan} from '../tools/publish-w1-hewan.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {validatePopulation} from '../tools/population-validation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {compatibleWorld,planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {villagesOriginalWorld} from '../tools/publish-w1-villages.mjs';
const source=villagesOriginalWorld(await loadWorld()),candidate=JSON.parse(await fs.readFile('world/drafts/w1/hewan/candidate.json','utf8')),preserved=JSON.parse(await fs.readFile('world/drafts/w1/hewan/preserved-npcs.json','utf8'));
const addedIds=new Set(candidate.npcs.map(n=>n.id)),original={...source,npcs:preserved,residents:[],households:[],settlementProfiles:[],locations:source.locations.filter(n=>!candidate.locations.some(l=>l.id===n.id)),routes:source.routes.filter(n=>!candidate.routes.some(r=>r.id===n.id))};
const world=mergeHewan(original,candidate),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));

test('河湾发布核对逐条审核且只写正式目录，重复发布零写入',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fields-population-publish-'));
 t.after(async()=>{const target=path.resolve(root);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(target,{recursive:true,force:true});});
 await fs.cp(path.resolve('world'),root,{recursive:true,filter:file=>!file.split(path.sep).includes('drafts')});
 await fs.mkdir(path.join(root,'drafts/w1'),{recursive:true});await fs.cp(path.resolve('world/drafts/w1/hewan'),path.join(root,'drafts/w1/hewan'),{recursive:true});
 for(const [file,value]of Object.entries({'people/baseline.json':original.npcs,'people/residents.json':[],'people/households.json':[],'geo/settlements.json':[],'geo/locations.json':original.locations,'geo/routes.json':original.routes}))await fs.writeFile(path.join(root,file),JSON.stringify(value));
 const preview=await publishHewan({root});assert.equal(preview.published,false);assert.equal((await loadWorld(root)).npcs.length,18);
 const first=await publishHewan({root,publish:true});assert.equal(first.changed.length,6);assert.equal((await loadWorld(root)).npcs.length,32);
 assert.deepEqual((await publishHewan({root,publish:true})).changed,[]);
 // Later books, skills and factual edits are not the old population batch's
 // property. Review fingerprints continue to use its immutable original facts.
 const later=await loadWorld(root),luqing=later.npcs.find(n=>n.id==='npc_hw_luqing');luqing.inventory[later.items[0].id]=3;luqing.notes+='后续目录说明';
 await fs.writeFile(path.join(root,'people/baseline.json'),JSON.stringify(later.npcs));
 assert.deepEqual((await publishHewan({root,publish:true})).changed,[]);assert.deepEqual((await loadWorld(root)).npcs,later.npcs);
 const frozenPath=path.join(root,'drafts/w1/hewan/preserved-npcs.json'),frozenRaw=await fs.readFile(frozenPath,'utf8'),tampered=JSON.parse(frozenRaw);tampered[0].coins++;
 await fs.writeFile(frozenPath,JSON.stringify(tampered));await assert.rejects(publishHewan({root,publish:true}),/冻结原人物审核资料不符/);await fs.writeFile(frozenPath,frozenRaw);
 const changed=structuredClone(candidate);changed.residents[0].currentConcern+='无据新事';await fs.writeFile(path.join(root,'drafts/w1/hewan/candidate.json'),JSON.stringify(changed));
 await assert.rejects(publishHewan({root,publish:true}),/已审核内容不符/);
});

test('河湾正式人口目录32full含两名外来者，58常住与22户一致且原18档不变',()=>{
 assert.equal(validateWorld(world).ok,true,validateWorld(world).errors.join('\n'));
 assert.equal(world.npcs.length,32);assert.equal(world.residents.length,28);assert.equal(world.households.length,22);
 assert.equal(world.settlementProfiles[0].residentIds.length,58);
 assert.deepEqual(world.npcs.filter(n=>!addedIds.has(n.id)),original.npcs);
 assert.deepEqual(mergeHewan(world,candidate),world);
 const bad=structuredClone(original);bad.npcs[0].coins++;assert.throws(()=>mergeHewan(bad,candidate),/原有人物/);
});

test('坏名册、重复户籍、亲子年龄及外来者混入常住不能发布',()=>{
 for(const edit of [w=>w.residents[0].householdId='missing',w=>w.households[0].members.push(w.households[1].members[0]),w=>w.settlementProfiles[0].population++,w=>w.settlementProfiles[0].visitors.push(w.settlementProfiles[0].residentIds[0]),w=>w.settlementProfiles[0].kinship[0].parent=w.settlementProfiles[0].kinship[0].child,w=>w.residents[0].flags.minor=true]){
  const broken=structuredClone(world);edit(broken);assert.ok(validatePopulation(broken).length>0);
 }
 const fake=structuredClone(world);fake.residents[0].coins=999;assert.equal(validateWorld(fake).ok,false);
});

test('名册可解析但不生成人物钱物；目录升级保留旧档变化并只添加14名full',()=>{
 const engine=new WorldEngine(world),doc=engine.createCharacter(legacy,{},'population-new');
 for(const row of world.residents){assert.equal(engine.resolver.resolve(row.name,row.scope),row.id);assert.equal(doc.state.npcs[row.id],undefined);}
 const oldEngine=new WorldEngine(original),old=oldEngine.createCharacter(legacy,{},'population-old');old.state.player.coins=123;old.state.npcs.npc_hw_linsui.coins=77;
 const incoming=compatibleWorld(original,world).world,upgrade=planWorldUpgrade(old,original,incoming,{worldHash:'world-new',eventId:'new-people'});
 const after=applyPatches(old,upgrade.patches);assert.equal(upgrade.result.added.length,14);assert.equal(after.state.player.coins,123);assert.equal(after.state.npcs.npc_hw_linsui.coins,77);
 assert.deepEqual(after.state.inventory,old.state.inventory);assert.deepEqual(after.state.settlements,old.state.settlements);
 for(const row of world.residents)assert.equal(after.state.npcs[row.id],undefined);
 assert.equal(planWorldUpgrade(after,incoming,incoming,{worldHash:'world-new',eventId:'repeat'}).result.added.length,0);
 const expanded=structuredClone(world),person=expanded.residents.shift();expanded.npcs.push({...expanded.npcs[0],id:person.id,name:person.name});
 const promoted=compatibleWorld(world,expanded).world;assert.equal(promoted.residents.some(n=>n.id===person.id),false);assert.equal(promoted.npcs.filter(n=>n.id===person.id).length,1);
});

test('进入私宅必须有覆盖抵达时刻及同行者的成年住户许可，拒绝不改变钱物时间',async()=>{
 const engine=new WorldEngine(world),doc=engine.createCharacter(legacy,{},'private-entry');doc.state.location='loc_hw';
 const house=candidate.locations[0],adult=house.access.residents.find(id=>engine.byId.get(id).age>=18),child=house.access.residents.find(id=>engine.byId.get(id).age<18);
 const run=(document,args)=>engine.reduce(document,{tool:'world_move',args:{destination:house.id,...args},eventId:'enter'});
 const before=structuredClone(doc);await assert.rejects(run(doc,{}),/有效许可/);assert.deepEqual(doc,before);
 doc.state.records.permission={category:'authorization',subject:house.id,action:'enter_home',grantee:'player',grantor:adult,expires:doc.state.minute+60};
 for(const edit of [d=>d.state.records.permission.grantor='npc_hw_linsui',d=>d.state.records.permission.grantor=child,d=>d.state.records.permission.expires=d.state.minute+1,d=>d.state.records.permission.revoked=true,d=>d.state.records.permission.grantee='npc_hw_linsui',d=>d.state.player.companions=['npc_hw_wushuo']]){
  const denied=structuredClone(doc);edit(denied);const saved=structuredClone(denied);await assert.rejects(run(denied,{authorization:'permission'}),/有效许可/);assert.deepEqual(denied,saved);
 }
 const accepted=await run(doc,{authorization:'permission'}),after=applyPatches(doc,accepted.patches);assert.equal(after.state.location,house.id);assert.ok(after.state.minute>doc.state.minute);
 const exited=await engine.reduce(after,{tool:'world_move',args:{destination:'河湾村'},eventId:'exit'});assert.equal(applyPatches(after,exited.patches).state.location,'loc_hw');
});
