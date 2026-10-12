import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadWorld} from '../tools/load-world.mjs';
import {validateNpcDepth,legacyTraitsAuditIds} from '../tools/npc-profile-validation.mjs';
import {depthEntries,contextFor,patchDraft,buildDraftRequest,buildReviewRequest,extractDraft,validateDraft} from '../tools/npc-depth-content.mjs';
import {depthFoundation,runDepth} from '../tools/npc-depth.mjs';
import {hashContent,runContentPipeline} from '../tools/content-pipeline.mjs';
import {publishNpcDepth,prepareNpcDepthBatch,batchContract} from '../tools/publish-npc-depth.mjs';
const execute=promisify(execFile),source=await loadWorld(),ids=['npc_yp_qinli','npc_yp_gaoxin'];
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const write=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n');
async function fixture(t,{shared=false,oneSided=false,firstSource=false}={}){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'npc-depth-batch-')),worldRoot=path.join(temp,'world');
 t.after(async()=>{assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(temp,{recursive:true,force:true});});
 for(const folder of ['meta','people','geo','lore'])await fs.cp(path.resolve('world',folder),path.join(worldRoot,folder),{recursive:true});
 const world=structuredClone(source);
 for(const id of ids){const n=world.npcs.find(n=>n.id===id);n.notes='主持人不要让玩家查看旧账页。';if(shared)n.memorySeeds=n.memorySeeds.filter(m=>m.knownBy.length===1);}
 const baseline=path.join(worldRoot,'people/baseline.json');await write(baseline,world.npcs);
 const cards=[];
 for(const [index,id] of ids.entries()){
  const before=world.npcs.find(n=>n.id===id),issues=validateNpcDepth(world).issues.filter(i=>i.id===id),patches=[];
  for(const issue of issues){
   if(issue.code==='rule-wording')patches.push({path:issue.field,value:'曾在坡口议事屋核对桌位，轮换次序仍未商定。'});
   else if(issue.code==='unknown-specific')patches.push({path:issue.field,value:`坡口议事屋是否有${index===0?'旧磨架记号':'抄地名的纸页'}可供核对`});
   else if(issue.code==='memory-shared'&&issue.field==='memorySeeds')patches.push({path:`memorySeeds[${before.memorySeeds.length}]`,value:{id:'memory_batch_table',event:oneSided&&index===1?'在坡口议事屋核对桌位，已经商定轮换次序。':'在坡口议事屋核对桌位，还没商定轮换次序。',salience:4,knownBy:ids,location:'bld_yp_hall',reliability:'亲历'}});
   else assert.fail('未预期fixture缺口 '+JSON.stringify(issue));
  }
  const config={revision:`test-complete-card-${index}`,patchRows:[{id,before:structuredClone(before),baseHash:hashContent(before),issues:issues.map(({id,field,code})=>({id,field,code})),patches}]};
  const root=path.join(worldRoot,`drafts/card-${index}`),design=path.join(worldRoot,`design/card-${index}.mjs`);await fs.mkdir(root,{recursive:true});await fs.mkdir(path.dirname(design),{recursive:true});
  await fs.writeFile(design,`export const revision=${JSON.stringify(config.revision)};\nexport const incrementLimitYuan=2;\nexport const patchRows=${JSON.stringify(config.patchRows)};\n`);
  const entries=depthEntries([before],config,world),foundation=depthFoundation(entries,world,config.revision),manifest={contract:'audit-patch-v1',design:`design/card-${index}.mjs`,root:`drafts/card-${index}`,worldRoot:'../..',foundationHash:hashContent(foundation)};
  await write(path.join(root,'base.json'),[before]);await write(path.join(root,'candidate.json'),entries.map(patchDraft));await write(path.join(root,'foundation.json'),foundation);await write(path.join(root,'manifest.json'),manifest);
  // Local deterministic review substitutes exercise the actual L1/L2/L4 receipts.
  const client={spent:0,reserved:0,budgetYuan:20,rates:{miss:2,output:3},estimateCostYuan:()=>0,generate:async request=>{const value=JSON.parse(request.messages[1].content);return{choices:[{message:{content:JSON.stringify(value.candidate??{contradictions:[]})}}],measurement:{costUpperYuan:0}};}};
  let result;
  if(firstSource){
   const sourceFile=path.join(root,'sources.json'),sourceEvidenceMap=path.join(root,'sources-map.json');
   await write(sourceFile,{sourceRecords:ids.map(other=>{const n=world.npcs.find(n=>n.id===other);return{id:other,name:n.name,sex:n.sex,...(other===id?{notes:n.notes}:{})};}),reviewBoundary:'原字段仅供逐叶核验，不能传播私人知识。'});await write(sourceEvidenceMap,{[id]:'sources.json'});await write(path.join(root,'budget.json'),{spentYuan:0,reservedYuan:0,limitYuan:20});
   result=await runDepth({worldRoot,design,root,budgetRoot:root,cardId:'T45',sourceEvidenceMap,compactRequest:true},{client});
  }else result=await runContentPipeline({entries,root,budgetRoot:root,client,revision:config.revision,contextFor:e=>contextFor(e,world),buildDraftRequest,buildReviewRequest,reviewDraftFor:patchDraft,extractDraft,validateDraft,concurrency:1,batchSize:25});
  for(const record of result.results){assert.equal(record.status,'passed',JSON.stringify(record.errors));assert.deepEqual(record.errors,[]);}
  const notes=result.results.map(r=>({id:r.id,note:'测试替身按冻结原档逐条核对叶子。',draftHash:hashContent(r.draft),reviewHash:hashContent(r.review)})),notesFile=path.join(root,'human-notes.json');await write(notesFile,notes);
  await execute(process.execPath,[path.resolve('tools/npc-depth-l4.mjs'),'--design',design,'--root',root,'--notes',notesFile]);cards.push(root);
 }
 const batchManifest=path.join(worldRoot,'drafts/batch.json'),plan={contract:batchContract,worldRoot:'..',sourceHash:hashContent(await loadWorld(worldRoot)),expectedIds:ids,manifests:cards.map(root=>path.relative(worldRoot,path.join(root,'manifest.json')).replaceAll('\\','/'))};await write(batchManifest,plan);
 return {worldRoot,world,baseline,cards,batchManifest,plan};
}

test('完整两卡同快照预演零写入，原子apply一次，精确路径/hash与全世界缺口保留',async t=>{
 const p=await fixture(t),bytes=await fs.readFile(p.baseline,'utf8'),stat=await fs.stat(p.baseline),preview=await publishNpcDepth({batchManifest:p.batchManifest});
 assert.equal(preview.published,false);assert.equal(await fs.readFile(p.baseline,'utf8'),bytes);assert.equal((await fs.stat(p.baseline)).mtimeMs,stat.mtimeMs);
 assert.equal(preview.sourceHash,p.plan.sourceHash);assert.deepEqual(preview.amendedNpcIds,ids);assert.equal(preview.selectedQuality.issues.length,0);assert.ok(preview.globalQuality.issues.length>0);assert.deepEqual(preview.changes.filter(c=>c.path==='notes').map(c=>c.id),ids);assert.equal(preview.manifests.length,2);
 const applied=await publishNpcDepth({batchManifest:p.batchManifest,publish:true});assert.equal(applied.published,true);assert.equal(hashContent(await loadWorld(p.worldRoot)),preview.resultHash);
 const after=await read(p.baseline);for(const n of after){const old=p.world.npcs.find(x=>x.id===n.id);for(const field of ['coins','inventory','skills','services','serviceCatalog','traits','memorySeeds'])assert.deepEqual(n[field],old[field],`${n.id}.${field}`);}
 for(const id of legacyTraitsAuditIds)assert.deepEqual(after.find(n=>n.id===id).traits,source.npcs.find(n=>n.id===id).traits);
 const appliedStat=await fs.stat(p.baseline),repeat=await publishNpcDepth({batchManifest:p.batchManifest,publish:true});assert.deepEqual(repeat.changed,[]);assert.equal((await fs.stat(p.baseline)).mtimeMs,appliedStat.mtimeMs);
 // Later compatible memory and operational money remain after authorized replay.
 after.find(n=>n.id===ids[0]).memorySeeds.push({id:'later_private',event:'雨后又核对了旧木板。',knownBy:[ids[0]],salience:3,reliability:'亲历'});after.find(n=>n.id===ids[0]).coins=9;await write(p.baseline,after);
 assert.deepEqual((await publishNpcDepth({batchManifest:p.batchManifest,publish:true})).changed,[]);assert.deepEqual(await read(p.baseline),after);
});

test('第二卡坏hash或缺L4、完整卡待审，全部零写入，不拆出第一卡',async t=>{
 const p=await fixture(t),bytes=await fs.readFile(p.baseline,'utf8');
 for(const [relative,mutate] of [['manifest.json',v=>v.foundationHash='bad'],['batch-0.json',v=>v.l4.approved=false],[ids[1]+'.json',v=>v.status='failed']]){
  const file=path.join(p.cards[1],relative),saved=await fs.readFile(file,'utf8'),value=JSON.parse(saved);mutate(value);await write(file,value);await assert.rejects(publishNpcDepth({batchManifest:p.batchManifest,publish:true}));assert.equal(await fs.readFile(p.baseline,'utf8'),bytes);await fs.writeFile(file,saved);
 }
 for(const mutate of [v=>v.sourceHash='a'.repeat(64),v=>v.expectedIds=[ids[0]],v=>v.manifests=['../outside.json']]){const saved=structuredClone(p.plan);mutate(saved);await write(p.batchManifest,saved);await assert.rejects(publishNpcDepth({batchManifest:p.batchManifest,publish:true}));assert.equal(await fs.readFile(p.baseline,'utf8'),bytes);await write(p.batchManifest,p.plan);}
});

test('跨卡新共享事件闭合后一起写；伙伴未批准或只批准半边时整组延后',async t=>{
 const p=await fixture(t,{shared:true}),bytes=await fs.readFile(p.baseline,'utf8'),preview=await publishNpcDepth({batchManifest:p.batchManifest});assert.equal(preview.eventClosure.length,2);assert.ok(preview.eventClosure.every(e=>e.closed));
 const batch=await read(path.join(p.cards[1],'batch-0.json'));batch.l4.approved=false;await write(path.join(p.cards[1],'batch-0.json'),batch);await assert.rejects(publishNpcDepth({batchManifest:p.batchManifest,publish:true}),/L4/);assert.equal(await fs.readFile(p.baseline,'utf8'),bytes);
 batch.l4.approved=true;await write(path.join(p.cards[1],'batch-0.json'),batch);await write(p.batchManifest,{...p.plan,manifests:[p.plan.manifests[0]],expectedIds:[ids[0]]});await assert.rejects(publishNpcDepth({batchManifest:p.batchManifest,publish:true}),/缺口|闭合/);assert.equal(await fs.readFile(p.baseline,'utf8'),bytes);
 await write(p.batchManifest,p.plan);await publishNpcDepth({batchManifest:p.batchManifest,publish:true});assert.ok((await read(p.baseline)).filter(n=>ids.includes(n.id)).every(n=>n.memorySeeds.at(-1).id==='memory_batch_table'));assert.deepEqual((await publishNpcDepth({batchManifest:p.batchManifest,publish:true})).changed,[]);
});

test('跨卡相同event id但单侧事实改变仍整批零写入',async t=>{
 const p=await fixture(t,{shared:true,oneSided:true}),bytes=await fs.readFile(p.baseline,'utf8');await assert.rejects(publishNpcDepth({batchManifest:p.batchManifest,publish:true}),/缺口|相容/);assert.equal(await fs.readFile(p.baseline,'utf8'),bytes);
});

test('预写再次核磁盘hash，拒并发变更；同时apply只有一个提交',async t=>{
 const p=await fixture(t),prepared=await prepareNpcDepthBatch({batchManifest:p.batchManifest}),bytes=await fs.readFile(p.baseline,'utf8');await fs.writeFile(p.baseline,bytes+' ');await assert.rejects(prepared.apply(),/并发改变/);assert.equal(await fs.readFile(p.baseline,'utf8'),bytes+' ');await fs.writeFile(p.baseline,bytes);
 const first=await prepareNpcDepthBatch({batchManifest:p.batchManifest}),second=await prepareNpcDepthBatch({batchManifest:p.batchManifest});const outcomes=await Promise.allSettled([first.apply(),second.apply()]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.match(outcomes.find(r=>r.status==='rejected').reason.message,/正在提交|并发改变/);
 assert.ok(!(await fs.readdir(path.dirname(p.baseline))).some(n=>n.includes('depth-publication.lock')||n.endsWith('.tmp')));
});

test('manifest批选项互斥、world内路径约束与CLI帮助合同',async t=>{
 const p=await fixture(t);await assert.rejects(publishNpcDepth({manifest:path.join(p.cards[0],'manifest.json'),batchManifest:p.batchManifest}),/同时使用/);
 const {stdout}=await execute(process.execPath,[path.resolve('tools/publish-npc-depth.mjs'),'--help']);assert.match(stdout,/--batch-manifest/);const preview=await execute(process.execPath,[path.resolve('tools/publish-npc-depth.mjs'),'--batch-manifest',p.batchManifest]);assert.equal(JSON.parse(preview.stdout).published,false);
});


test('冻结合格字段和旧记忆冲突定位到具体叶子，已准备后撤销L4拒提交',async t=>{
 const p=await fixture(t),original=await read(p.baseline);
 for(const [field,mutate] of [['age',n=>n.age++],['memorySeeds[0].event',n=>n.memorySeeds[0].event+='另有未经审核的旧事'],['services',n=>n.services.push('unapproved_service')]]){
  const rows=structuredClone(original);mutate(rows.find(n=>n.id===ids[0]));await write(p.baseline,rows);const bytes=await fs.readFile(p.baseline,'utf8');await assert.rejects(publishNpcDepth({batchManifest:p.batchManifest,publish:true}),e=>e.message.includes(ids[0])&&e.message.includes(field));assert.equal(await fs.readFile(p.baseline,'utf8'),bytes);
 }
 await write(p.baseline,original);const prepared=await prepareNpcDepthBatch({batchManifest:p.batchManifest}),batch=await read(path.join(p.cards[1],'batch-0.json'));batch.l4.approved=false;await write(path.join(p.cards[1],'batch-0.json'),batch);await assert.rejects(prepared.apply(),/L4/);assert.deepEqual(await read(p.baseline),original);
});

test('预演后非人物世界源并发改变也拒绝，不覆盖baseline',async t=>{
 const p=await fixture(t),bytes=await fs.readFile(p.baseline,'utf8'),prepared=await prepareNpcDepthBatch({batchManifest:p.batchManifest}),file=path.join(p.worldRoot,'meta/rules.json'),rules=await read(file);rules.version+='-concurrent';await write(file,rules);await assert.rejects(prepared.apply(),/世界并发改变/);assert.equal(await fs.readFile(p.baseline,'utf8'),bytes);
});


test('正式源已存在相容且由批准批写入的伙伴事件，可以补齐另一个完整卡',async t=>{
 const p=await fixture(t,{shared:true});await publishNpcDepth({batchManifest:p.batchManifest,publish:true});
 const rows=await read(p.baseline),index=rows.findIndex(n=>n.id===ids[0]);rows[index]=structuredClone(p.world.npcs.find(n=>n.id===ids[0]));await write(p.baseline,rows);
 await write(p.batchManifest,{...p.plan,manifests:[p.plan.manifests[0]],expectedIds:[ids[0]],sourceHash:hashContent(await loadWorld(p.worldRoot))});
 const preview=await publishNpcDepth({batchManifest:p.batchManifest});assert.equal(preview.eventClosure.length,1);assert.deepEqual(preview.selectedQuality.issues,[]);const partner=structuredClone(rows.find(n=>n.id===ids[1]));await publishNpcDepth({batchManifest:p.batchManifest,publish:true});assert.deepEqual((await read(p.baseline)).find(n=>n.id===ids[1]),partner);assert.deepEqual((await publishNpcDepth({batchManifest:p.batchManifest,publish:true})).changed,[]);
});

test('首次原源附件完整两卡官方出站，批发布与合法重发重放附件并保留原子校验',async t=>{
 t.mock.method(console,'log',()=>{});const p=await fixture(t,{firstSource:true}),bytes=await fs.readFile(p.baseline,'utf8');
 const preview=await publishNpcDepth({batchManifest:p.batchManifest});assert.deepEqual(preview.amendedNpcIds,ids);assert.equal(await fs.readFile(p.baseline,'utf8'),bytes);
 await publishNpcDepth({batchManifest:p.batchManifest,publish:true});assert.deepEqual((await publishNpcDepth({batchManifest:p.batchManifest,publish:true})).changed,[]);
 const applied=await fs.readFile(p.baseline,'utf8');await fs.unlink(path.join(p.cards[1],'sources.json'));await assert.rejects(publishNpcDepth({batchManifest:p.batchManifest,publish:true}));assert.equal(await fs.readFile(p.baseline,'utf8'),applied);
});
