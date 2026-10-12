import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {loadWorld} from '../tools/load-world.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {validateNpcProfiles} from '../tools/npc-profile-validation.mjs';
import {prepareNpcPublication,mergeNpcProfiles,publishNpcProfiles,protectedNpcFields} from '../tools/m2-people-publish.mjs';
const world=await loadWorld(),root=path.resolve('world/drafts/m2-people');
const baseline=JSON.parse(await fs.readFile(path.join(root,'baseline.json'),'utf8'));
const candidate=JSON.parse(await fs.readFile(path.join(root,'candidate.json'),'utf8'));
const published=await prepareNpcPublication({world,root});
// Direct calls have no receipt and keep the original strict M2 contract.
const legacyCurrent=()=>world.npcs.map(n=>{const original=baseline.find(row=>row.id===n.id);return original?{...structuredClone(n),services:structuredClone(original.services),skills:structuredClone(original.skills)}:structuredClone(n);});
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
 const old={...world,npcs:world.npcs.map(n=>baseline.find(row=>row.id===n.id)??n)};assert.equal(validateWorld(old).ok,true);
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
 try{await fs.writeFile(path.join(temp,'people/baseline.json'),JSON.stringify(world.npcs.map(n=>{const original=baseline.find(x=>x.id===n.id);return original?{...original,inventory:n.inventory,schedule:n.schedule}:n;}),null,2)+'\n');
 const first=await publishNpcProfiles({worldRoot:temp,root,write:true});assert.equal(first.written,true);const before=await fs.readFile(path.join(temp,'people/baseline.json'),'utf8');const second=await publishNpcProfiles({worldRoot:temp,root,write:true});assert.equal(second.written,false);assert.equal(await fs.readFile(path.join(temp,'people/baseline.json'),'utf8'),before);
 }finally{assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(temp,{recursive:true,force:true});}
});
