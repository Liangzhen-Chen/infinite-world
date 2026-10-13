import {yupoFirstEdition} from './fixtures/w1-depth-editions.mjs';
import {depthBatches} from '../tools/npc-depth-content.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {publishVillages,mergeVillages,villagesOriginalWorld} from '../tools/publish-w1-villages.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {compatibleWorld,planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {readPublishedNpcDepth} from '../tools/npc-depth-publication-sources.mjs';
const candidate=JSON.parse(await fs.readFile('world/drafts/w1/villages/candidate.json','utf8')),original=villagesOriginalWorld(await loadWorld()),world=mergeVillages(original,candidate);
const files={'people/baseline.json':'npcs','people/residents.json':'residents','people/households.json':'households','geo/settlements.json':'settlementProfiles','geo/locations.json':'locations','geo/routes.json':'routes'};
async function temporary(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'fields-four-villages-'));t.after(async()=>{const resolved=path.resolve(root);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(resolved,{recursive:true,force:true});});for(const dir of ['meta','people','geo','lore'])await fs.cp(path.resolve('world',dir),path.join(root,dir),{recursive:true});await fs.mkdir(path.join(root,'drafts/w1'),{recursive:true});await fs.cp(path.resolve('world/drafts/w1/villages'),path.join(root,'drafts/w1/villages'),{recursive:true});for(const[file,key]of Object.entries(files))await fs.writeFile(path.join(root,file),JSON.stringify(original[key]));return root;}
async function hashes(root){return Object.fromEntries(await Promise.all(Object.keys(files).map(async f=>[f,hashContent(await fs.readFile(path.join(root,f),'utf8'))])));}

test('四村补丁预览执行engine结构校验，临时目录发布及重复零写入',async t=>{
 const root=await temporary(t),before=await hashes(root),preview=await publishVillages({root});assert.equal(preview.published,false);assert.equal(preview.stage,'engine');assert.equal(preview.changed.length,6);assert.deepEqual(await hashes(root),before);
 const first=await publishVillages({root,publish:true});assert.equal(first.changed.length,6);const published=await loadWorld(root);assert.equal(published.npcs.length,original.npcs.length+120);assert.equal(published.residents.length,original.residents.length+266);assert.deepEqual(published.npcs.filter(n=>original.npcs.some(old=>old.id===n.id)),original.npcs);const release=validateWorld(published,{stage:'release'});assert.equal(release.ok,false,'当前全体full仍有真实缺口');assert.ok(release.errors.some(error=>error.startsWith('完整人物深度：')));const check=validateWorld(published,{stage:'engine'});assert.equal(check.ok,true,check.errors.join('\n'));assert.deepEqual(check.errors,[]);assert.deepEqual(check.warnings,[]);assert.equal(check.counts.npcs,published.npcs.length);
 const once=await hashes(root);assert.deepEqual((await publishVillages({root,publish:true})).changed,[]);assert.deepEqual(await hashes(root),once);
});
test('发布绑定候选、冻结骨架、引用上下文、逐条审查及L4，篡改不能触碰正式文件',async t=>{
 const root=await temporary(t),before=await hashes(root),dir=path.join(root,'drafts/w1/villages');
 for(const[file,edit,pattern]of [
  ['candidate.json',x=>{x.npcs[0].voice.samples[0]+='无据赠送';},/已审核内容不符/],
  ['candidate.json',x=>{x.households[0].members.reverse();},/已审核内容不符/],
  ['foundation.json',x=>{x.residents[0].age++;},/冻结骨架/],
  ['yp/npcs/npc_yp_zhaofeng.json',x=>{x.fingerprint='stale-context';},/引用事实已改变/],
  ['yp/npcs/npc_yp_zhaofeng.json',x=>{x.draft.description+='未审文字';},/审查后内容已改变/],
  ['yp/npcs/batch-0.json',x=>{x.l4.approved=false;},/L4/],
 ]){const filePath=path.join(dir,file),raw=await fs.readFile(filePath,'utf8'),value=JSON.parse(raw);edit(value);await fs.writeFile(filePath,JSON.stringify(value));await assert.rejects(publishVillages({root,publish:true}),pattern);assert.deepEqual(await hashes(root),before);await fs.writeFile(filePath,raw);}
});
test('同编号正式事实冲突拒绝覆盖，非四村目录不随合并改变',()=>{assert.deepEqual(mergeVillages(world,candidate),world);for(const key of ['rules','items','recipes','spells','cultures','factions'])assert.deepEqual(world[key],original[key]);const changed=structuredClone(world);changed.npcs.find(n=>n.id===candidate.npcs[0].id).coins++;assert.throws(()=>mergeVillages(changed,candidate),/已发布条目冲突/);});
test('升级只加入120 full，旧钱物和在场状态保留，轻册无运行资源，序列化重启及重复升级一致',async()=>{
 const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),old=new WorldEngine(original).createCharacter(legacy,{},'four-villages-upgrade');old.state.player.coins=137;old.state.npcs.npc_hw_linsui.coins=91;old.state.npcs.npc_hw_linsui.location='loc_bs';const saved=structuredClone(old),incoming=compatibleWorld(original,world).world,plan=planWorldUpgrade(old,original,incoming,{worldHash:'four-villages',eventId:'villages-add'}),after=applyPatches(old,plan.patches);
 assert.deepEqual(old,saved);assert.equal(plan.result.added.length,120);assert.equal(after.state.player.coins,137);assert.equal(after.state.npcs.npc_hw_linsui.coins,91);assert.equal(after.state.npcs.npc_hw_linsui.location,'loc_bs');assert.deepEqual(after.state.inventory,old.state.inventory);assert.deepEqual(after.state.settlements,old.state.settlements);
 const addedMoney=candidate.npcs.reduce((sum,n)=>sum+n.coins,0);assert.equal(candidate.npcs.reduce((sum,n)=>sum+after.state.npcs[n.id].coins,0),addedMoney);for(const n of candidate.npcs){assert.deepEqual(after.state.npcs[n.id].inventory,{});assert.equal(after.state.npcs[n.id].location,n.location);}for(const n of candidate.residents)assert.equal(after.state.npcs[n.id],undefined);
 const reopened=JSON.parse(JSON.stringify(after));assert.deepEqual(reopened,after);assert.equal(planWorldUpgrade(reopened,incoming,incoming,{worldHash:'four-villages',eventId:'again'}).result.added.length,0);assert.deepEqual(new WorldEngine(incoming).resolver.resolve(candidate.residents[0].name,candidate.residents[0].scope),candidate.residents[0].id);
 // Replaying the same immutable upgrade event is an assignment, never a second grant.
 assert.deepEqual(applyPatches(after,plan.patches),after);
});

test('四村合并仅精确已审before/after可保留深度修订，fake凭证、后续冲突和错误旧版本仍拒绝',async()=>{
 const formal=await loadWorld(),base=JSON.parse(await fs.readFile('world/drafts/w1/existing-depth/first-review/base.json','utf8'));
 const old={npcs:base,residents:[],households:[],settlements:[],kinship:[],locations:[],routes:[]};
 const depthReceipt=await readPublishedNpcDepth({world:formal});
 assert.deepEqual(mergeVillages(formal,old,{depthReceipt}),formal);
 assert.throws(()=>mergeVillages(formal,old),/已发布条目冲突/);
 assert.throws(()=>mergeVillages(formal,old,{depthReceipt:{}}),/凭证无效/);
 assert.throws(()=>mergeVillages(formal,old,{depthReceipt:structuredClone(depthReceipt)}),/凭证无效/);
 const drift=structuredClone(formal);drift.npcs.find(n=>n.id===base[0].id).notes+='未经审核的后事';
 assert.throws(()=>mergeVillages(drift,old,{depthReceipt}),/凭证与当前世界不符/);
 const wrong=structuredClone(old);wrong.npcs[0].opinions.neighbors[0].view+='不是冻结旧版本';
 assert.throws(()=>mergeVillages(formal,wrong,{depthReceipt}),/已发布条目冲突/);
 assert.deepEqual((await publishVillages()).changed,[]);
});

test('四村原已审补充重发保留后续记忆和运行财物，原记忆篡改仍拒绝',async()=>{
 const formal=await loadWorld(),person=formal.npcs.find(n=>n.id==='npc_yp_qinli'),amendment=structuredClone(person);
 const before=JSON.parse(await fs.readFile('world/drafts/w1/yupo-depth-next/base.json','utf8')).find(n=>n.id===person.id),record=JSON.parse(await fs.readFile('world/drafts/w1/yupo-depth-next/'+person.id+'.json','utf8'));Object.assign(amendment,before,record.draft);
 person.coins=9;person.inventory.item_wood=0;person.memorySeeds.push({id:'later_t11b_yupo',event:'雨后又检查议事屋桌边木板。',knownBy:[person.id],salience:3,reliability:'亲历'});
 const depthReceipt=await readPublishedNpcDepth({world:formal,includeVillages:true}),edition=await yupoFirstEdition(),otherAmendments=Object.values(depthBatches).flatMap(b=>b.depthRows).filter(r=>r.id!==person.id).map(r=>edition.npcs.find(n=>n.id===r.id));
 const result=mergeVillages(formal,candidate,{depthReceipt,npcAmendments:[amendment,...otherAmendments],profileAmendments:formal.settlementProfiles.filter(p=>candidate.settlements.some(c=>c.id===p.id)).map(p=>p.details).filter(Boolean)});
 assert.deepEqual(result.npcs.find(n=>n.id===person.id),person);
 const drift=structuredClone(formal);drift.npcs.find(n=>n.id===person.id).memorySeeds[0].event+='未经审核';
 assert.throws(()=>mergeVillages(drift,candidate,{npcAmendments:[amendment]}),/人物补充冲突/);
});
