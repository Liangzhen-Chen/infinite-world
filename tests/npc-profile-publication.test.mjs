import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {loadWorld} from '../tools/load-world.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {validateNpcProfiles} from '../tools/npc-profile-validation.mjs';
import {prepareNpcPublication,mergeNpcProfiles,publishNpcProfiles,protectedNpcFields} from '../tools/m2-people-publish.mjs';
import {readPublishedNpcIncrements} from '../tools/npc-publication-sources.mjs';
import {readPublishedNpcDepth} from '../tools/npc-depth-publication-sources.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {compatibleWorld,planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
const world=await loadWorld(),root=path.resolve('world/drafts/m2-people');
const baseline=JSON.parse(await fs.readFile(path.join(root,'baseline.json'),'utf8'));
const candidate=JSON.parse(await fs.readFile(path.join(root,'candidate.json'),'utf8'));
const published=await prepareNpcPublication({world,root});
const depthBefore=JSON.parse(await fs.readFile('world/drafts/w1/existing-depth/first-review/base.json','utf8'));
// Direct calls have no receipt and keep the original strict M2 contract.
const legacyCurrent=()=>world.npcs.map(current=>{const n=depthBefore.find(row=>row.id===current.id)??current,original=baseline.find(row=>row.id===n.id);return original?{...structuredClone(n),services:structuredClone(original.services),skills:structuredClone(original.skills)}:structuredClone(n);});
test('发布接受已审查18人，所有当前经济和运行字段保持，重复合并幂等',()=>{
 const current=legacyCurrent();current[0].coins=987;current[0].inventory.item_wood=123;current[0].trust=17;current[0].affection=9;
 // Catalog input can already contain the previous run's full profile.
 for(const n of current)for(const key of ['wealth','towardPlayer'])delete n[key];
 const merged=mergeNpcProfiles(current,candidate,baseline);
 for(const n of merged)for(const key of protectedNpcFields)assert.deepEqual(n[key],current.find(x=>x.id===n.id)[key],`${n.id}.${key}`);
 assert.deepEqual(merged[0].wealth.cashRange,[987,987]);assert.deepEqual(mergeNpcProfiles(merged,candidate,baseline),merged);
});
test('正式来源人物事实或已审查作息改变时拒绝，额外人物保留',()=>{
 let current=legacyCurrent();current[0].notes+='新增未经审查经历';assert.throws(()=>mergeNpcProfiles(current,candidate,baseline),/正式来源事实/);
 current=legacyCurrent();current[0].schedule.default[0].activity='新的活动';assert.throws(()=>mergeNpcProfiles(current,candidate,baseline),/正式作息/);
 current=legacyCurrent();current.push({...current[0],id:'npc_extra_unreviewed',name:'额外旧人物'});assert.deepEqual(mergeNpcProfiles(current,candidate,baseline).at(-1),current.at(-1));
});
test('L4或候选正文被改不能绕过发布审核',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'m2-review-'));await fs.cp(root,temp,{recursive:true});
 try{const changed=structuredClone(candidate);changed.npcs[0].description+='凭空赠送一座城';await fs.writeFile(path.join(temp,'candidate.json'),JSON.stringify(changed));await assert.rejects(prepareNpcPublication({world,root:temp}),/候选不等于/);
 await fs.writeFile(path.join(temp,'candidate.json'),JSON.stringify(candidate));const batch=JSON.parse(await fs.readFile(path.join(temp,'batch-0.json'),'utf8'));batch.l4.approved=false;await fs.writeFile(path.join(temp,'batch-0.json'),JSON.stringify(batch));await assert.rejects(prepareNpcPublication({world,root:temp}),/L4/);
 }finally{assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(temp,{recursive:true,force:true});}
});
test('完整档必填和嵌套类型生效，未标full的旧档兼容',()=>{
 const old={...world,npcs:world.npcs.map(n=>(()=>{const old=baseline.find(row=>row.id===n.id);return old?{...old,settlement:n.settlement,householdId:n.householdId,household:n.household,home:n.home}:n;})())};assert.equal(validateWorld(old).ok,true);
 for(const change of [n=>delete n.voice,n=>n.voice.samples=['不足三句'],n=>n.goals.short[0].progress=-1,n=>n.birth.month=15,n=>delete n.intelligence]){const w=structuredClone(published.world);change(w.npcs[0]);const result=validateWorld(w);assert.equal(result.ok,false);assert.ok(result.errors.some(x=>x.startsWith('schema')));}
});
test('通用引用校验拒绝错类别、重复关系、未知知情者和越界教学',()=>{
 for(const change of [n=>n.home.location='item_wood',n=>n.culture='missing',n=>n.relationships[1].with=n.relationships[0].with,n=>n.secrets[0].knownBy.push('npc_unknown'),n=>n.serviceCatalog.push({kind:'teach',what:'spell_unknown',price:{mode:'catalog',source:'spell_unknown'},unlocksService:false})]){const w=structuredClone(published.world);change(w.npcs[0]);assert.ok(validateNpcProfiles(w).length);}
});
test('通用年龄规则拒绝亲子差不足及未成年恋爱，人数不固定18',()=>{
 let w=structuredClone(published.world);w.npcs.find(n=>n.id==='npc_hw_duanyan').age=30;assert.ok(validateNpcProfiles(w).some(x=>x.includes('至少大15岁')));
 w=structuredClone(published.world);w.npcs.find(n=>n.id==='npc_hw_duanhe').relationships[0].type='恋人';assert.ok(validateNpcProfiles(w).some(x=>x.includes('未成年')));
 w=structuredClone(published.world);const extra={...structuredClone(w.npcs[0]),id:'npc_extra_full',name:'新增完整人物',aliases:[],household:[]};for(const row of [...extra.memorySeeds,...extra.secrets])row.knownBy.push(extra.id);w.npcs.push(extra);assert.deepEqual(validateNpcProfiles(w),[]);
});
test('人物不能投影本人不知的记忆或秘密，出生日期与元年年龄相符',()=>{
 for(const change of [n=>n.memorySeeds[0].knownBy=['npc_hw_chenbai'],n=>n.secrets[0].knownBy=['npc_hw_chenbai'],n=>n.birth.year+=1]){const w=structuredClone(published.world);change(w.npcs[0]);assert.ok(validateNpcProfiles(w).some(x=>/须含本人|出生日期/.test(x)));}
 const w=structuredClone(published.world),n=w.npcs[0];n.birth.month=1;n.birth.day=1;n.birth.year=1-n.age;assert.deepEqual(validateNpcProfiles(w),[]);
});
test('实际写入只在隔离世界执行一次，第二次无写入且不改变字节',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'m2-publish-'));await fs.cp(path.resolve('world'),temp,{recursive:true,filter:file=>!file.split(path.sep).includes('drafts')});
 try{const oldLocations=world.locations.filter(l=>l.scope!=='loc_bs'||['loc_bs','bld_bs_shrine'].includes(l.id)),placeIds=new Set(oldLocations.map(l=>l.id));
 for(const [file,value]of Object.entries({'geo/locations.json':oldLocations,'geo/routes.json':world.routes.filter(r=>placeIds.has(r.from)&&placeIds.has(r.to)),'geo/settlements.json':world.settlementProfiles.filter(p=>p.id!=='loc_bs'),'people/residents.json':world.residents.filter(n=>n.settlement!=='loc_bs'),'people/households.json':world.households.filter(h=>h.settlement!=='loc_bs')}))await fs.writeFile(path.join(temp,file),JSON.stringify(value));
 const rules=structuredClone(world.rules);for(const region of rules.weather.regions){region.locations=region.locations.filter(id=>placeIds.has(id));region.indoor=region.indoor.filter(id=>placeIds.has(id));}await fs.writeFile(path.join(temp,'meta/rules.json'),JSON.stringify(rules));
 await fs.writeFile(path.join(temp,'people/baseline.json'),JSON.stringify(world.npcs.map(n=>{const original=baseline.find(x=>x.id===n.id);return original?{...original,inventory:n.inventory,schedule:n.schedule}:n;}),null,2)+'\n');
 const first=await publishNpcProfiles({worldRoot:temp,root,write:true});assert.equal(first.written,true);const before=await fs.readFile(path.join(temp,'people/baseline.json'),'utf8');const second=await publishNpcProfiles({worldRoot:temp,root,write:true});assert.equal(second.written,false);assert.equal(await fs.readFile(path.join(temp,'people/baseline.json'),'utf8'),before);
 }finally{assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(temp,{recursive:true,force:true});}
});

test('真实32人深度来源保留新notes/opinions及后来的钱物和记忆，伪造凭证或漂移不能重发',async()=>{
 const current=structuredClone(world),person=current.npcs.find(n=>n.id==='npc_hw_linsui');
 person.coins=27;person.inventory.item_bread=0;
 person.memorySeeds.push({id:'later_private_t11b',event:'雨后在厨房核对桌边的旧木板。',knownBy:[person.id],salience:3,reliability:'亲历'});
 const teaching=await readPublishedNpcIncrements({world:current}),depth=await readPublishedNpcDepth({world:current});
 const merged=mergeNpcProfiles(current.npcs,candidate,baseline,teaching,depth);
 for(const n of merged){const old=current.npcs.find(row=>row.id===n.id);for(const key of [...protectedNpcFields,'traits','memorySeeds','notes','opinions'])assert.deepEqual(n[key],old[key],`${n.id}.${key}`);}
 assert.deepEqual(merged,current.npcs);
 const replayDepth=await readPublishedNpcDepth({world:{...current,npcs:merged}});
 assert.deepEqual(mergeNpcProfiles(merged,candidate,baseline,teaching,replayDepth),merged);
 assert.throws(()=>mergeNpcProfiles(current.npcs,candidate,baseline,teaching,{}),/凭证无效/);
 assert.throws(()=>mergeNpcProfiles(current.npcs,candidate,baseline,teaching,structuredClone(depth)),/凭证无效/);
 const changed=structuredClone(current);changed.npcs.find(n=>n.id===person.id).opinions.neighbors[0].view+='未经审核的新结论';
 assert.throws(()=>mergeNpcProfiles(changed.npcs,candidate,baseline,teaching,depth),/凭证与当前世界不符/);
 await assert.rejects(readPublishedNpcDepth({world:changed}),/人物补丁冲突|当前世界不符/);
});

test('深度来源缺失、manifest漂移或撤销L4不能用旧出版凭证放行',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'depth-source-')),worldRoot=path.join(temp,'world');
 t.after(async()=>{assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(temp,{recursive:true,force:true});});
 await assert.rejects(readPublishedNpcDepth({world,worldRoot}),/ENOENT/);
 await fs.symlink(path.resolve('tools'),path.join(temp,'tools'),'junction');
 for(const folder of ['meta','people','geo','lore','design'])await fs.cp(path.resolve('world',folder),path.join(worldRoot,folder),{recursive:true});
 await fs.cp(path.resolve('world/drafts/w1/existing-depth'),path.join(worldRoot,'drafts/w1/existing-depth'),{recursive:true});
 for(const directory of ['baishi-skeleton'])await fs.cp(path.resolve('world/drafts/w1',directory),path.join(worldRoot,'drafts/w1',directory),{recursive:true});
 const batchFile=path.join(worldRoot,'drafts/w1/depth-publication.json');await fs.copyFile(path.resolve('world/drafts/w1/depth-publication.json'),batchFile);
 const files=[['drafts/w1/depth-publication.json',v=>v.worldRoot='..',/世界根/],['drafts/w1/depth-publication.json',v=>v.expectedIds.pop(),/预期人物集合/],['drafts/w1/existing-depth/first-review/manifest.json',v=>v.foundationHash='bad',/骨架指纹/],['drafts/w1/existing-depth/first-review/batch-0.json',v=>v.l4.approved=false,/L4/]];
 for(const [relative,mutate,pattern]of files){const file=path.join(worldRoot,relative),raw=await fs.readFile(file,'utf8'),value=JSON.parse(raw);mutate(value);await fs.writeFile(file,JSON.stringify(value));await assert.rejects(readPublishedNpcDepth({world,worldRoot}),pattern);await fs.writeFile(file,raw);}
 assert.ok(await readPublishedNpcDepth({world,worldRoot}));
});

test('32人深度版本沿现有world_upgrade更新隔离文档，状态、现金、售空库存和个人记忆不回退',async()=>{
 const previous={...world,npcs:world.npcs.map(n=>(()=>{const old=depthBefore.find(row=>row.id===n.id);return old?{...old,inventory:structuredClone(n.inventory)}:n;})())};
 const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),document=new WorldEngine(previous).createCharacter(legacy,{},'t11b-upgrade');
 const person=document.state.npcs.npc_hw_linsui;person.coins=27;person.inventory.item_bread=0;person.location='loc_bs';
 person.memoryStream=[{id:'t11b_runtime_memory',event:'雨后核对旧木板',knownBy:['npc_hw_linsui']}];
 document.state.player.coins=137;document.status='暂停';const saved=structuredClone(document);
 const incoming=compatibleWorld(previous,world).world,plan=planWorldUpgrade(document,previous,incoming,{worldHash:'t11b-depth',eventId:'t11b-depth'}),after=applyPatches(document,plan.patches);
 assert.deepEqual(document,saved);assert.equal(plan.result.added.length,0);
 for(const key of ['npcs','player','inventory'])assert.deepEqual(after.state[key],saved.state[key]);
 assert.equal(after.status,'暂停');assert.equal(after.state.npcs.npc_hw_linsui.inventory.item_bread,0);
 assert.deepEqual(JSON.parse(JSON.stringify(after)),after);assert.deepEqual(applyPatches(after,plan.patches),after);
 assert.equal(planWorldUpgrade(after,incoming,incoming,{worldHash:'t11b-depth',eventId:'again'}).result.added.length,0);
});
