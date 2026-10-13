import fs from 'node:fs/promises';
import path from 'node:path';
const out=import.meta.dirname,old=path.resolve(out,'../M2-recheck-003');
for(const file of ['preflight.mjs','git-entry.mjs','runtime-guard.mjs','payment-proof.mjs','summarize.mjs']){
 let source=await fs.readFile(path.join(old,file),'utf8');
 source=source.replaceAll('M2-recheck-003','M2-recheck-004').replaceAll('m2-recheck-003','m2-recheck-004').replaceAll('T99','T149');
 if(file==='preflight.mjs'){
  source=source.replace('newIncrementCeilingYuan:10','newIncrementCeilingYuan:12').replace("source:'docs/PLAN.md#T64; T64 delegated execution'","source:'docs/PLAN.md#T149; T149 delegated execution'");
  source=source.replace('const profiles=prior.selectedQuality.map',"const {approved:approvedBaishi}=await import('../../../tools/w1-baishi.mjs');const baishi=await approvedBaishi(world);\nconst profiles=prior.selectedQuality.map");
  source=source.replace("assert.equal(row.id,'npc_hw_luqing');assert.equal(hashContent(old),previousHash);const expected=structuredClone(old);", "assert.ok(['npc_hw_luqing','npc_hw_yanzhe'].includes(row.id));assert.equal(hashContent(old),previousHash);const expected=structuredClone(old);if(row.id==='npc_hw_yanzhe'){const revision=baishi.b.yan;expected.settlement=revision.settlement;expected.householdId=revision.householdId;expected.household=revision.household;expected.home={...expected.home,location:revision.home.location};}else{");
  source=source.replace("assert.equal(hashContent(npc),hashContent(expected),'T19及T69已发布书库存是唯一河湾人物变更');", "}assert.equal(hashContent(npc),hashContent(expected),'仅允许T19/T69书库存及T90已审核住址同户索引变更');");
  source=source.replace("sourceRevision:'T19三册书库存及T69六册S1书库存'", "sourceRevision:row.id==='npc_hw_yanzhe'?'T90已审核住址和同户索引':'T19三册书库存及T69六册S1书库存'");
  source=source.replace("const sources=await Promise.all", "sourcePaths.push('tools/w1-baishi.mjs','world/design/w1-baishi-skeleton.mjs','world/drafts/w1/baishi-skeleton/contact_bs_yanzhe.json','world/drafts/w1/baishi-skeleton/l4.json');\nconst sources=await Promise.all");
  const start=source.indexOf("const yupo=await prepareNpcDepthBatch"),end=source.indexOf("const ids=",start);
  source=source.slice(0,start)+"const {yupoEvidence}=await import('./yupo-evidence.mjs');const yupoPublished=await yupoEvidence(world);\nfor(const {id} of yupoPublished.profiles){approvedIds.push(id);approved.add(id);}\n"+source.slice(end);
  source=source.replace("sourcePaths.push('tools/w1-baishi.mjs'", "sourcePaths.push('docs/测试报告/M2-recheck-004/yupo-evidence.mjs','docs/测试报告/M2-recheck-004/yupo-reuse-context.json','tools/w1-baishi.mjs'");
  source=source.replace('const ids=',"const baishiDepth=[];for(const batch of ['dock','market']){const {approved:readDepthApproved}=await import('../../../world/design/w1-baishi-'+batch+'-depth.mjs');const {bundle:depth}=await readDepthApproved(world);for(const npc of depth.people){assert.equal(hashContent(npc),hashContent(world.npcs.find(p=>p.id===npc.id)));approvedIds.push(npc.id);approved.add(npc.id);baishiDepth.push({id:npc.id,hash:hashContent(npc),batch});}}\nconst ids=");
  source=source.replace('pre.yupoPublished=yupoPublished;', 'pre.baishiDepth=baishiDepth;pre.yupoPublished=yupoPublished;');
  source=source.replace('const sources=await Promise.all',"sourcePaths.push(...['dock','market'].flatMap(batch=>['world/design/w1-baishi-'+batch+'-depth.mjs',...['published.json','summary.json','batch-0.json','l4.json',...baishiDepth.filter(r=>r.batch===batch).map(r=>r.id+'.json')].map(file=>'world/drafts/w1/baishi-'+batch+'/'+file)]));\nconst sources=await Promise.all");
 }
 if(file==='runtime-guard.mjs'){
  const start=source.indexOf('const published=await prepareNpcDepthBatch'),end=source.indexOf('const approvedEntries=',start);
  source=source.slice(0,start)+"const {yupoEvidence}=await import('./yupo-evidence.mjs');assert.deepEqual(await yupoEvidence(world),preflight.yupoPublished);\nfor(const row of preflight.yupoPublished.profiles)assert.ok(approved.has(row.id));\n"+source.slice(end);
  source=source.replace('const approvedEntries=',"for(const batch of ['dock','market']){const {approved:readApproved}=await import('../../../world/design/w1-baishi-'+batch+'-depth.mjs');const {bundle:depth}=await readApproved(world);for(const npc of depth.people){const row=preflight.baishiDepth.find(r=>r.id===npc.id);assert.equal(row.hash,hashContent(npc));assert.equal(row.hash,hashContent(world.npcs.find(p=>p.id===npc.id)));assert.ok(approved.has(npc.id));}}\nconst approvedEntries=");
 }
 if(file==='payment-proof.mjs'){
  source=source.replaceAll('newLimitYuan:10','newLimitYuan:12').replace('roundLimitYuan:38.42836376',"previousThirdRunId:'m2-recheck-003',previousThirdUpperYuan:10,roundLimitYuan:50.42836376");
  source=source.replace('}else extraYuan+=row.value.spentYuan+row.value.reservedYuan;',"}else if(e.name===authorization.previousThirdRunId){assert.ok(row.value.spentYuan+row.value.reservedYuan<=authorization.previousThirdUpperYuan+1e-12);const report=await checked(path.resolve(out,'../M2-recheck-003/真实试玩.json'));assert.equal(report.value.runId,row.value.runId);assert.ok(Math.abs(report.value.spentYuan-row.value.spentYuan)<1e-10);assert.ok(Math.abs(report.value.reservedYuan-row.value.reservedYuan)<1e-10);sources.push({file:report.file,hash:report.hash});}else extraYuan+=row.value.spentYuan+row.value.reservedYuan;");
  source=source.replace('authorization.previousRecheckUpperYuan+authorization.newLimitYuan','authorization.previousRecheckUpperYuan+authorization.previousThirdUpperYuan+authorization.newLimitYuan').replace('本新run由10元全额上界覆盖','本新run由12元全额上界覆盖；T99旧轮10元完整上界保留').replace('probe?.verified===true?10:1','probe?.verified===true?12:1');
 }
 if(file==='summarize.mjs')source=source.replace('<=10+1e-12','<=12+1e-12').replace('M2第三轮真实复验','M2第四轮真实复验');
 await fs.writeFile(path.join(out,file),source);
}
console.log('T149复用T99入口；新增12元与450次调用上限，历史账和未知预留保留。');
