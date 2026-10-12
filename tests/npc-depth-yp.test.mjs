import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {auditNpcDepth} from '../tools/audit-npc-depth.mjs';
import {validateNpcDepth} from '../tools/npc-profile-validation.mjs';
import {depthEntries,validatePatchResults,verifyUnchanged,getPath,contextFor} from '../tools/npc-depth-content.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import * as design from '../world/design/w1-yp-depth-rest.mjs';
const world=await loadWorld(),base=design.patchRows.map(r=>r.before),entries=depthEntries(base,design,world),merged=validatePatchResults(entries,world);
test('榆坡既有30人合并视图逐字段过独立深度门槛，其他村审计不变',()=>{
 assert.equal(entries.length,30);assert.equal(merged.npcs.filter(n=>n.id.startsWith('npc_yp_')).length,30);
 for(const validate of [auditNpcDepth,validateNpcDepth])assert.deepEqual(validate(merged).issues.filter(i=>i.id.startsWith('npc_yp_')),[]);
 assert.deepEqual(auditNpcDepth(merged).issues.filter(i=>!i.id.startsWith('npc_yp_')),auditNpcDepth(world).issues.filter(i=>!i.id.startsWith('npc_yp_')));
 assert.ok(auditNpcDepth(merged).legacyTraits.ok);
});
test('每个修订绑定实际审计路径和冻结原档，既有钱物与身份仍相同',()=>{
 for(const e of entries){const current=world.npcs.find(n=>n.id===e.id);assert.deepEqual(e.before,current);assert.equal(hashContent(current),e.baseHash);verifyUnchanged(current,e.facts,e);
 for(const p of e.patches){assert.notDeepEqual(getPath(current,p.path),p.value);assert.match(p.path,/^(knowledge|voice|goals|relationships|memorySeeds|opinions)\b/);}
 for(const field of ['id','age','coins','inventory','traits','personality','home','occupation','skills','proficiencies','services','secrets','schedule'])assert.deepEqual(e.facts[field],current[field]);
 assert.deepEqual(e.facts.memorySeeds.slice(0,current.memorySeeds.length),current.memorySeeds);
 }
});
test('旧十人的达标记忆没有新增，二十个缺口人物共享相同事件与知情者',()=>{
 const existing=entries.slice(0,10);for(const e of existing)assert.deepEqual(e.facts.memorySeeds,e.before.memorySeeds);
 for(const e of entries.slice(10)){assert.equal(e.facts.memorySeeds.length,e.before.memorySeeds.length+1);const m=e.facts.memorySeeds.at(-1);assert.ok(m.knownBy.includes(e.id));assert.equal(m.knownBy.length,2);const other=entries.find(x=>x.id===m.knownBy.find(id=>id!==e.id));assert.deepEqual(other.facts.memorySeeds.find(x=>x.id===m.id),m);}
});
test('L2引用上下文覆盖全部新叶子，地方当事人与作者小批有登记',async()=>{
 for(const e of entries){const context=contextFor(e,world);assert.deepEqual(context.revisions.map(r=>r.path),e.patches.map(p=>p.path));for(const p of e.patches)assert.deepEqual(context.revisions.find(r=>r.path===p.path).after,p.value);}
 const groups=JSON.parse(await fs.readFile(new URL('../world/drafts/w1/yp-depth-rest/author-batches.json',import.meta.url)));assert.deepEqual(groups.batches.flat().map(k=>'npc_yp_'+k).sort(),entries.map(e=>e.id).sort());assert.ok(groups.batches.every(b=>b.length>=3&&b.length<=5));
});


test('授权重绑定可由真实旧失败恢复原批哈希，最终汤桓修订仅一叶',async()=>{
 const root=new URL('../world/drafts/w1/yp-depth-rest/',import.meta.url),read=async f=>JSON.parse(await fs.readFile(new URL(f,root))),evidence=await read('content-revision-1-evidence.json'),rebound=await read('authorized-rebind-evidence.json');
 for(const snapshot of rebound.snapshots){const records=await Promise.all(snapshot.batch.ids.map(id=>read(id+'.json')));const prior=records.map(r=>evidence.priorFailedRecords[r.id]??r);assert.equal(hashContent(prior.map(({id,draft,review,status})=>({id,draft,review,status}))),snapshot.batch.fingerprint);}
 const final=await read('final-tanghuan-revision-evidence.json');assert.equal(final.change.path,'knowledge.unknown[0]');assert.equal(final.preserved.length,29);assert.ok(final.sharedMemoryBothSidesUnchanged);assert.equal(final.budgetWrites,0);assert.equal(final.modelCalls,0);
 for(const row of final.preserved){const record=await read(row.id+'.json'),entry=entries.find(e=>e.id===row.id);assert.equal(row.recordHash,hashContent(record));assert.equal(row.entryHash,hashContent(entry));assert.equal(row.contextHash,hashContent(contextFor(entry,world)));}
 for(const file of ['kongfu-final-source-evidence.json','tanghuan-final-source-evidence.json']){const source=await read(file);for(const row of source.sourceRecords){const original=[...world.npcs,...world.residents].find(n=>n.id===row.id);for(const [k,value]of Object.entries(row))assert.deepEqual(value,original[k]);}}
});

test('真实29人L2和L4哈希保留，汤桓硬错所在批拒绝整卡发布',async()=>{
 const root=new URL('../world/drafts/w1/yp-depth-rest/',import.meta.url),read=async f=>JSON.parse(await fs.readFile(new URL(f,root))),summary=await read('summary.json'),notes=await read('human-notes.json');assert.equal(summary.passed,29);assert.equal(summary.manual,1);assert.equal(summary.pending,0);assert.equal(notes.length,29);
 for(const n of notes){const record=await read(n.id+'.json');assert.equal(record.status,'passed');assert.deepEqual(record.errors,[]);assert.equal(n.draftHash,hashContent(record.draft));assert.equal(n.reviewHash,hashContent(record.review));}
 assert.ok(summary.batches[0].l4.approved);assert.equal(summary.batches[0].l4.notes.length,25);assert.equal(summary.batches[1].l4.approved,false);assert.equal(summary.batches[1].l4.notes.length,4);
 const failed=await read('npc_yp_tanghuan.json');assert.equal(failed.status,'manual');assert.equal(failed.attempts,3);assert.equal(failed.reviewRecovery.status,'failed');assert.ok(failed.errors.some(e=>e.field==='memorySeeds[2]'));assert.equal(failed.reviewRecovery.response.choices[0].finish_reason,'stop');
 const {readApprovedContent}=await import('../tools/content-pipeline.mjs');await assert.rejects(readApprovedContent(root.pathname.replace(/^\/(\w:)/,'$1'),entries,{contextFor:e=>contextFor(e,world),revision:design.revision}),/尚未完成 L4/);
});
