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
import {withoutMonsterSociety} from '../tools/publish-monster-society.mjs';
import {pruneCatalog} from './fixtures/pre-baishi-world.mjs';
import {withoutMonsterSociety2} from '../tools/publish-monster-society-2.mjs';
import {withoutT142} from '../tools/t142-merge.mjs';
import {withoutClockBatch} from '../tools/w5-clock-publication.mjs';
const formal=await loadWorld(),source=structuredClone(withoutT142(withoutClockBatch(withoutClockBatch(withoutMonsterSociety2(withoutMonsterSociety(villagesOriginalWorld(formal))),2),1))),candidate=JSON.parse(await fs.readFile('world/drafts/w1/hewan/candidate.json','utf8')),preserved=JSON.parse(await fs.readFile('world/drafts/w1/hewan/preserved-npcs.json','utf8'));
// This historical fixture omits four villages, including their dependent rules.
// Only references to those deliberately removed entities are projected out.
const removedLocations=new Set(formal.locations.filter(row=>!source.locations.some(location=>location.id===row.id)).map(row=>row.id));
source.rules.weather.regions=source.rules.weather.regions.map(row=>({...row,locations:row.locations.filter(id=>!removedLocations.has(id)),indoor:row.indoor.filter(id=>!removedLocations.has(id))})).filter(row=>row.locations.length);
source.rules.agriculture.settlements=source.rules.agriculture.settlements.filter(row=>!removedLocations.has(row.settlement));
source.rules.worldClock.clocks=source.rules.worldClock.clocks.filter(row=>!removedLocations.has(row.settlement));
source.rules.law.codes=source.rules.law.codes.filter(row=>!removedLocations.has(row.court));
source.locations=source.locations.filter(l=>!(l.scope==='loc_bs'&&!['loc_bs','bld_bs_shrine'].includes(l.id)));
// T157 settlements depend on later full residents and bosses; they leave the historical fixture.
// T154 wild areas are scoped to the omitted villages/town; their habitats and species leave with them.
source.locations=source.locations.filter(l=>!removedLocations.has(l.scope));
source.rules.wildlife.habitats=source.rules.wildlife.habitats.filter(h=>source.locations.some(l=>l.id===h.location));
source.monsters=source.monsters.filter(m=>!m.wildlife||source.rules.wildlife.habitats.some(h=>h.id===m.wildlife.habitat));
source.routes=source.routes.filter(r=>source.locations.some(l=>l.id===r.from)&&source.locations.some(l=>l.id===r.to));
for(const row of source.rules.weather.regions){row.locations=row.locations.filter(id=>source.locations.some(l=>l.id===id));row.indoor=row.indoor.filter(id=>row.locations.includes(id));}
// T92/T93后白石镇另有入门书（作者为npc_bs_*、出处为镇内场所）和产权法规场所，随白石镇一并投影掉。
for(const code of source.rules.law.codes)if(Array.isArray(code.locations))code.locations=code.locations.filter(id=>source.locations.some(l=>l.id===id));
source.items=source.items.filter(item=>!item.id.startsWith('item_bs_'));
// T160灵地与白石镇行业营生同样落在镇内场所。
if(source.rules.wildlifeAwakening?.spiritLands)source.rules.wildlifeAwakening.spiritLands=source.rules.wildlifeAwakening.spiritLands.filter(row=>source.locations.some(l=>l.id===row.location));
if(source.rules.npcGrowth?.vocations)source.rules.npcGrowth.vocations=source.rules.npcGrowth.vocations.filter(row=>source.locations.some(l=>l.id===row.location));
// T102后法术、配方以白石镇升档人物为来源；人物和镇内场所已投影掉，依赖它们的目录条目随之移出。
{const keptNpcs=new Set([...preserved,...candidate.npcs].map(n=>n.id)),keptPlaces=new Set(source.locations.map(l=>l.id));Object.assign(source,pruneCatalog(source,[...formal.npcs.filter(n=>!keptNpcs.has(n.id)).map(n=>n.id),...formal.locations.filter(l=>!keptPlaces.has(l.id)).map(l=>l.id),...source.items.filter(i=>i.id.startsWith('item_bs_')).map(i=>i.id)]));}
// T108节日目录、T110/T111可执行势力时钟与T142九省纲要都晚于本批，分别移出（节日目录整表移出，时钟回到声明式计划）。
delete source.festivals;
// T105/T157首领等引用本夹具已移出的魔物社会人物、营地和野外地点；
// 各村政体补充、U3疫病传播路线和镇上商店依赖已移出的村镇法典、路线和聚落档案。依赖随之投影掉（求闭包）。
{
 const lawIds=new Set(source.rules.law.codes.map(c=>c.id)),routeIds=new Set(source.routes.map(r=>r.id)),registered=new Set([candidate.settlement.id,...(source.rules.economy.shops.quality?.capitals??[])]);
 if(source.rules.law.polities)source.rules.law.polities=source.rules.law.polities.filter(p=>lawIds.has(p.law)).map(p=>({...p,...(p.cooperates?{cooperates:p.cooperates.filter(id=>lawIds.has(id))}:{})}));
 for(const clock of source.rules.hazardClock?.clocks??[])if(Array.isArray(clock.spread?.routes))clock.spread.routes=clock.spread.routes.filter(id=>routeIds.has(id));
 const shops=source.rules.economy.shops;shops.stores=shops.stores.filter(s=>registered.has(s.settlement)).map(s=>({...s,restock:s.restock.filter(row=>row.source!=='route'||registered.has(row.from))}));
 const kinds=['npcs','residents','locations','items','monsters','bosses','factions','cultures','deities','history','spells','recipes','routes'];
 const kept=new Set(kinds.flatMap(k=>(k==='npcs'?[...preserved,...candidate.npcs]:k==='residents'?candidate.residents:source[k]??[]).map(r=>r.id)));
 const removed=new Set(kinds.flatMap(k=>(formal[k]??[]).map(r=>r.id)).filter(id=>!kept.has(id)));
 const bound=row=>[...JSON.stringify(row).matchAll(/"([a-z]+_[a-z0-9_]+)"/g)].some(m=>m[1]!==row.id&&removed.has(m[1]));
 for(let changed=true;changed;){changed=false;for(const key of ['bosses','cultures','factionPeople']){const rows=source[key]??[],next=rows.filter(row=>!bound(row));if(next.length!==rows.length){for(const row of rows)if(!next.includes(row))removed.add(row.id);source[key]=next;changed=true;}}}
 // K6效果表：属主时钟已移出或效果对象（栖地、人物、地点）已移出的挂钩与季节条目一并移出。
 for(const h of formal.rules.wildlife.habitats)if(!source.rules.wildlife.habitats.some(row=>row.id===h.id))removed.add(h.id);
 const clocks=new Set([...(source.rules.worldClock?.clocks??[]),...(source.rules.hazardClock?.clocks??[])].map(c=>c.id)),table=source.rules.effectTable;
 if(table){table.hooks=(table.hooks??[]).filter(h=>clocks.has(h.owner)&&!bound(h));if(table.seasons)table.seasons=table.seasons.filter(row=>!bound(row));}
}
const addedIds=new Set(candidate.npcs.map(n=>n.id)),original={...source,npcs:preserved,residents:[],households:[],settlementProfiles:[],locations:source.locations.filter(n=>!candidate.locations.some(l=>l.id===n.id)),routes:source.routes.filter(n=>!candidate.routes.some(r=>r.id===n.id))};
const world=mergeHewan(original,candidate),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));

test('正式源engine校验零错，历史夹具依赖闭合且正式release深度已达标',()=>{
 assert.deepEqual(validateWorld(formal).errors,[]);
 assert.ok(validateWorld(villagesOriginalWorld(formal)).errors.length>0,'删村未同步引用的原始投影不能误报无错');
 assert.deepEqual(validateWorld(world).errors,[]);
 const release=validateWorld(formal,{stage:'release'});assert.equal(release.ok,true,release.errors.join('\n'));
 assert.ok(validateWorld(world,{stage:'release'}).errors.some(error=>error.startsWith('完整人物深度：')),'早期人口候选仍不能当作深度发布');
});

test('河湾历史候选逐条核对审核，完整深度不足拒绝且重复零写入',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fields-population-publish-'));
 t.after(async()=>{const target=path.resolve(root);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(target,{recursive:true,force:true});});
 await fs.cp(path.resolve('world'),root,{recursive:true,filter:file=>!file.split(path.sep).includes('drafts')});
 await fs.mkdir(path.join(root,'drafts/w1'),{recursive:true});await fs.cp(path.resolve('world/drafts/w1/hewan'),path.join(root,'drafts/w1/hewan'),{recursive:true});
 for(const [file,value]of Object.entries({'meta/rules.json':original.rules,'people/baseline.json':original.npcs,'people/residents.json':[],'people/households.json':[],'geo/settlements.json':[],'geo/locations.json':original.locations,'geo/routes.json':original.routes}))await fs.writeFile(path.join(root,file),JSON.stringify(value));
 const saved=await fs.readFile(path.join(root,'people/baseline.json'),'utf8');
 for(const publish of [false,true]){await assert.rejects(publishHewan({root,publish}),/完整人物深度/);assert.equal(await fs.readFile(path.join(root,'people/baseline.json'),'utf8'),saved);assert.equal((await loadWorld(root)).npcs.length,18);}
 // Reconstruct the once-installed historical catalog; the current release gate
 // still refuses it until the separate depth publications are present.
 for(const [file,value]of Object.entries({'people/baseline.json':world.npcs,'people/residents.json':world.residents,'people/households.json':world.households,'geo/settlements.json':world.settlementProfiles,'geo/locations.json':world.locations,'geo/routes.json':world.routes}))await fs.writeFile(path.join(root,file),JSON.stringify(value));
 await assert.rejects(publishHewan({root,publish:true}),/完整人物深度/);
 // Later books, skills and factual edits are not the old population batch's
 // property. Review fingerprints continue to use its immutable original facts.
 const later=await loadWorld(root),luqing=later.npcs.find(n=>n.id==='npc_hw_luqing');luqing.inventory[later.items[0].id]=3;luqing.notes+='后续目录说明';
 await fs.writeFile(path.join(root,'people/baseline.json'),JSON.stringify(later.npcs));
 await assert.rejects(publishHewan({root,publish:true}),/完整人物深度/);assert.deepEqual((await loadWorld(root)).npcs,later.npcs);
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
