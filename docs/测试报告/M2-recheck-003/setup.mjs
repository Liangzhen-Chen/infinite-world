import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=import.meta.dirname,old=path.resolve(out,'../M2-recheck');
await fs.mkdir(out,{recursive:true});
for(const file of ['preflight.mjs','git-entry.mjs','runtime-guard.mjs','payment-proof.mjs','summarize.mjs']){
 let source=await fs.readFile(path.join(old,file),'utf8');
 source=source.replaceAll('docs/测试报告/M2-recheck/','docs/测试报告/M2-recheck-003/').replaceAll("'m2-recheck-001'","'m2-recheck-003'").replaceAll("card:'M2-recheck'","card:'M2-recheck-003'");
 if(file==='preflight.mjs'){
  source=source.replace("sourceRevision:'d77ad75 T19三册书库存'","sourceRevision:'T19三册书库存及T69六册S1书库存'");
  source=source.replace("assert.equal(hashContent(npc),hashContent(expected),'T19已发布三册书库存是唯一河湾人物变更');",`for(const suffix of ['cover','area','movement','message','utility','growth']){const id='item_book_s1_'+suffix,record=awaitBookRecords.get(id);assert.equal(record.status,'passed');assert.deepEqual(record.review.contradictions,[]);assert.equal(hashContent(world.items.find(i=>i.id===id)),hashContent(record.draft));expected.inventory[id]=2;}assert.equal(hashContent(npc),hashContent(expected),'T19及T69已发布书库存是唯一河湾人物变更');`);
  source=source.replace('const profiles=prior.selectedQuality.map',"const {readS1Publication}=await import('../../../tools/publish-w2-s1.mjs');const s1Publication=await readS1Publication(path.join(root,'world/drafts/w2-s1'));\nconst awaitBookRecords=new Map(await Promise.all(['cover','area','movement','message','utility','growth'].map(async suffix=>{const id='item_book_s1_'+suffix;return [id,await read('world/drafts/w2-s1/'+id+'.json')];})));\nconst profiles=prior.selectedQuality.map");
  source=source.replace('hashContent(record.draft)','hashContent(s1Publication.items.find(i=>i.id===id))');
  source=source.replace("'docs/测试报告/M2-recheck-003/guard-check.mjs',",'');
  source=source.replace("const sources=await Promise.all", "sourcePaths.push('tools/publish-w2-s1.mjs',...['cover','area','movement','message','utility','growth'].map(s=>'world/drafts/w2-s1/item_book_s1_'+s+'.json'));\nconst sources=await Promise.all");
  source=source.replace('newIncrementCeilingYuan:8','newIncrementCeilingYuan:10');
  source=source.replace('const envelope=await refreshProof();pre.budgetUpperSafe', 'const envelope=await refreshProof();pre.oldRun.combinedUpperCeilingYuan=envelope.roundUpperYuan;pre.budgetUpperSafe');
 }
 if(file==='payment-proof.mjs'){
  source=source.replace('newLimitYuan:8','newLimitYuan:10').replace('parentUpperYuan:8','parentUpperYuan:8,previousRecheckRunId:\'m2-recheck-001\',previousRecheckUpperYuan:8,roundLimitYuan:38.42836376');
  source=source.replace("import {budgetUpperProof,readOptional}","import {readOptional}");
  source=source.replace("else extraYuan+=row.value.spentYuan+row.value.reservedYuan;", "else if(e.name===authorization.previousRecheckRunId){assert.ok(row.value.spentYuan+row.value.reservedYuan<=authorization.previousRecheckUpperYuan+1e-12);const report=await checked(path.resolve(out,'../M2-recheck/真实试玩.json'));assert.equal(report.value.runId,row.value.runId);assert.ok(Math.abs(report.value.spentYuan-row.value.spentYuan)<1e-10);assert.ok(Math.abs(report.value.reservedYuan-row.value.reservedYuan)<1e-10);sources.push({file:report.file,hash:report.hash});}else extraYuan+=row.value.spentYuan+row.value.reservedYuan;");
  source=source.replace(" const proof={capturedAt:",` const roundUpperYuan=history.spentYuan+history.unknownReservedYuan+legacy.value.costUpperYuan+authorization.parentUpperYuan+authorization.previousRecheckUpperYuan+authorization.newLimitYuan;
 const contentUpperYuan=content.reduce((n,row)=>{assert.ok(Number.isFinite(row.spentYuan)&&row.spentYuan>=0&&Number.isFinite(row.reservedYuan)&&row.reservedYuan>=0);return n+(row.shared?20:row.spentYuan+row.reservedYuan);},0);
 assert.equal(content.filter(row=>row.shared).length,1);assert.ok(content.every(row=>!row.shared||row.spentYuan+row.reservedYuan<=20+1e-12));
 assert.ok(roundUpperYuan<=authorization.roundLimitYuan+1e-12,'T99授权整轮上界不足');
 const goalUpperYuan=roundUpperYuan+contentUpperYuan+extraYuan;
 const proof={capturedAt:`);
  source=source.replace(/\.\.\.budgetUpperProof\(\{oldSpentYuan:[^\n]+?newLimitYuan:8\}\)/,"budgetUpperSafe:true,roundUpperYuan,contentUpperYuan,goalUpperYuan,legacyGoal100RemainingYuan:100-goalUpperYuan,goalHardLimitActive:false,goalLimitRule:'docs/PLAN.md 开头规则13：旧goal硬限已移除；T99单卡明确额度继续执行',newLimitYuan:10");
  source=source.replace('本新run由8元全额上界覆盖','本新run由10元全额上界覆盖；T64父轮8元完整上界保留');
  source=source.replace('probe?.verified===true?8:1','probe?.verified===true?10:1');
 }
 if(file==='summarize.mjs')source=source.replace('<=8+1e-12','<=10+1e-12').replace('T64 M2真实复验','T99 M2第三轮真实复验');
 await fs.writeFile(path.join(out,file),source);
}
console.log('T64入口已复制并适配T99；旧报告与项目代码未改。');
