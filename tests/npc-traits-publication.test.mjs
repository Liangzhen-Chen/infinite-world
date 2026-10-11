import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {loadWorld} from '../tools/load-world.mjs';
import {prepareNpcPublication,mergeNpcProfiles,publishNpcProfiles,syncReviewedNpcTraits} from '../tools/m2-people-publish.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
const world=await loadWorld(),root=path.resolve('world/drafts/m2-people'),read=async file=>JSON.parse(await fs.readFile(path.join(root,file+'.json'),'utf8'));
const [candidate,baseline]=await Promise.all([read('candidate'),read('baseline')]);
const targets=baseline.filter(n=>n.traits?.length===1&&n.traits[0]==='原档待扩充').map(n=>n.id);
test('复用原审核的17份具体特征，只替换精确占位，身份财物和林穗原特征不变',()=>{
 assert.equal(targets.length,17);const before=world.npcs.map(n=>targets.includes(n.id)?{...n,traits:['原档待扩充']}:n),after=syncReviewedNpcTraits(before,candidate,baseline);
 for(const [i,n]of after.entries()){if(targets.includes(n.id)){assert.deepEqual(n.traits,candidate.npcs.find(p=>p.id===n.id).personality.traits);const {traits,...rest}=n,{traits:oldTraits,...oldRest}=before[i];assert.deepEqual(rest,oldRest);}else assert.deepEqual(n,before[i]);}
 assert.deepEqual(after,world.npcs);assert.deepEqual(syncReviewedNpcTraits(after,candidate,baseline),after);
 const changed=structuredClone(before);changed.find(n=>n.id===targets[0]).personality.traits=['未经审核的新性格'];assert.throws(()=>syncReviewedNpcTraits(changed,candidate,baseline),/正式性格特征变动/);
 const concrete=structuredClone(before);concrete.find(n=>n.id===targets[0]).traits=['已经明确登记的特征'];assert.deepEqual(syncReviewedNpcTraits(concrete,candidate,baseline).find(n=>n.id===targets[0]).traits,['已经明确登记的特征']);
});
test('完整档首次发布也同步具体特征，不改既有原档冻结或候选',()=>{
 const baselineBefore=hashContent(baseline),candidateBefore=hashContent(candidate),after=mergeNpcProfiles(baseline.map(n=>({...n,schedule:candidate.npcs.find(p=>p.id===n.id).schedule})),candidate,baseline);
 for(const id of targets)assert.deepEqual(after.find(n=>n.id===id).traits,candidate.npcs.find(n=>n.id===id).personality.traits);
 assert.equal(hashContent(baseline),baselineBefore);assert.equal(hashContent(candidate),candidateBefore);assert.deepEqual(mergeNpcProfiles(after,candidate,baseline),after);
});
test('同一发布器特征模式通过完整审核，重复不写，后续M4服务与库存不会倒退',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fields-traits-'));t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(dir,{recursive:true,force:true});});
 for(const sub of ['meta','people','geo','lore'])await fs.cp(path.resolve('world',sub),path.join(dir,sub),{recursive:true});const file=path.join(dir,'people/baseline.json');
 const before=world.npcs.map(n=>targets.includes(n.id)?{...n,traits:['原档待扩充']}:n);before.find(n=>n.id==='npc_hw_xuling').coins=27;const merchant=before.find(n=>n.id==='npc_hw_luqing'),book=Object.keys(merchant.inventory).find(id=>id.startsWith('item_book_m4_'));assert.ok(book);merchant.inventory[book]=0;await fs.writeFile(file,JSON.stringify(before));
 const first=await publishNpcProfiles({worldRoot:dir,root,write:true,traitsOnly:true});assert.equal(first.written,true);const current=JSON.parse(await fs.readFile(file,'utf8'));
 for(const n of current){const original=before.find(p=>p.id===n.id),{traits,...rest}=n,{traits:old,...oldRest}=original;assert.deepEqual(rest,oldRest);}
 const once=await fs.readFile(file,'utf8');assert.equal((await publishNpcProfiles({worldRoot:dir,root,write:true,traitsOnly:true})).written,false);assert.equal(await fs.readFile(file,'utf8'),once);
});
test('特征模式仍拒绝篡改候选或未完成L4，不把占位修正当作绕过审核',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fields-traits-audit-'));t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(dir,{recursive:true,force:true});});await fs.cp(root,dir,{recursive:true});
 const file=path.join(dir,'candidate.json'),value=structuredClone(candidate);value.npcs[1].personality.traits=['虚构性格'];await fs.writeFile(file,JSON.stringify(value));await assert.rejects(prepareNpcPublication({world,root:dir,traitsOnly:true}),/候选不等于/);
 await fs.writeFile(file,JSON.stringify(candidate));const batchFile=path.join(dir,'batch-0.json'),batch=JSON.parse(await fs.readFile(batchFile,'utf8'));batch.l4.approved=false;await fs.writeFile(batchFile,JSON.stringify(batch));await assert.rejects(prepareNpcPublication({world,root:dir,traitsOnly:true}),/L4/);
});
