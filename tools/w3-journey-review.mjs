import fs from'node:fs/promises';
import{loadWorld}from'./load-world.mjs';
import{economyW3Journey}from'../world/design/economy-w3-journey.mjs';
import{closestW3Similarity}from'./w3-content.mjs';
import{journeyRoot as root,journeyRevision as revision,journeyContext as w3Context}from'./w3-journey.mjs';
import{validateTradesDraft,tradesReviewRequest}from'./w3-trades.mjs';
import{hashContent,parseModelJSON,rowFingerprintShape}from'./content-pipeline.mjs';
import{DeepSeekClient}from'./deepseek-client.mjs';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8')),write=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n');
const world=await loadWorld(),bones=economyW3Journey(world),blocklist=await read('world/meta/blocklist.json');
const onlyId=process.argv.includes('--id')?process.argv[process.argv.indexOf('--id')+1]:null;
if(process.argv.includes('--id')&&![...bones.items,...bones.recipes].some(row=>row.id===onlyId))throw new Error('--id 必须是当前候选编号');
let corrections={};try{corrections=await read(`${root}/manual-corrections.json`);}catch(error){if(error.code!=='ENOENT')throw error;}
const all=[];for(const kind of['items','recipes'])for(const entry of bones[kind]){const file=`${root}/${kind}/${entry.id}.json`,record=await read(file),patch=corrections[entry.id],context=w3Context(world,bones,entry);
 const edited=patch&&record.manualCorrection?.reason!==patch.reason;
 if(edited){for(const key of['description','inspection','storage','process'])if(patch[key])record.draft[key]=patch[key];for(const[from,to]of patch.replaceAll??[])for(const key of['description','inspection','storage','process'])if(record.draft[key])record.draft[key]=record.draft[key].replaceAll(from,to);record.manualCorrection={reason:patch.reason};record.review=null;}
 const validation=validateTradesDraft(record.draft,entry,blocklist,context);
 record.errors=[...validation.errors,...(record.review?.contradictions??[]).filter(row=>row.severity==='hard')];record.warnings=[...validation.warnings,...(record.review?.contradictions??[]).filter(row=>row.severity!=='hard')];
 record.status=record.errors.length?'manual':record.review?'passed':'pending';record.fingerprint=hashContent({entry,context,revision});await write(file,record);
 all.push({kind,entry,record,file,context,needsReview:!validation.errors.length&&(!record.review||record.review.contradictions.some(row=>row.severity==='hard'))});
}
if(process.argv.includes('--review')){
 const client=new DeepSeekClient({budgetYuan:20}),budgetFile='world/drafts/w3/budget.json',budget=await read(budgetFile);client.spent=budget.spentYuan+(budget.reservedYuan??0);
 let saves=Promise.resolve();const save=()=>saves=saves.then(()=>write(budgetFile,{spentYuan:client.spent,reservedYuan:client.reserved,limitYuan:20}));
 const work=all.filter(row=>row.needsReview&&(!onlyId||row.entry.id===onlyId));let cursor=0;
 await Promise.all(Array.from({length:8},async()=>{for(;;){const index=cursor++;if(index>=work.length)return;const row=work[index],{entry,record,context,file}=row;
  const response=client.generate(tradesReviewRequest(entry,record.draft,context),`content-w3-journey-review-${entry.id}`);response.catch(()=>{});await save();
  try{const review=parseModelJSON(await response);if(!Array.isArray(review.contradictions)||review.contradictions.some(x=>!['hard','soft','style'].includes(x.severity)||!['quote','field','reason'].every(key=>typeof x[key]==='string'&&x[key].trim())))throw new Error('审查格式错误');
   record.review=review;const validation=validateTradesDraft(record.draft,entry,blocklist,context);record.errors=[...validation.errors,...review.contradictions.filter(x=>x.severity==='hard')];record.warnings=[...validation.warnings,...review.contradictions.filter(x=>x.severity!=='hard')];record.status=record.errors.length?'manual':'passed';record.feedback=record.errors.length?record.errors:null;
   await write(file,record);console.log(JSON.stringify({id:entry.id,status:record.status,errors:record.errors}));
  }finally{await save();}
 }}));
}
for(const kind of['items','recipes']){
 const records=all.filter(row=>row.kind===kind).map(row=>row.record),summary=await read(`${root}/${kind}/summary.json`);
 for(const r of records){const similarity=closestW3Similarity(r.draft,[...records.map(row=>row.draft),...world[kind]]);if(similarity.score>=.35){r.errors.push(`相似度${similarity.score}：${similarity.id}`);r.status='manual';await write(`${root}/${kind}/${r.id}.json`,r);}}
 for(const prior of summary.batches){const batch=await read(`${root}/${kind}/batch-${prior.index}.json`),rows=batch.ids.map(id=>records.find(row=>row.id===id));
  const fingerprint=hashContent(rows.map(rowFingerprintShape));if(batch.fingerprint!==fingerprint)batch.l4={approved:false,notes:[]};batch.fingerprint=fingerprint;
  batch.passed=rows.filter(row=>row.status==='passed').length;batch.manual=rows.filter(row=>row.status==='manual').map(row=>row.id);batch.pending=rows.filter(row=>row.status==='pending').map(row=>row.id);batch.flagged=rows.filter(row=>row.warnings.length||row.manualCorrection).map(row=>row.id);batch.manualRatio=batch.manual.length/batch.count;batch.needsSystemicRepair=batch.manualRatio>.1;
  await write(`${root}/${kind}/batch-${batch.index}.json`,batch);summary.batches[batch.index]=batch;
 }summary.passed=records.filter(row=>row.status==='passed').length;summary.manual=records.filter(row=>row.status==='manual').length;summary.pending=records.filter(row=>row.status==='pending').length;summary.costUpperYuan=(await read('world/drafts/w3/budget.json')).spentYuan;
 await write(`${root}/${kind}/summary.json`,summary);console.log(JSON.stringify({kind,passed:summary.passed,manual:summary.manual,pending:summary.pending}));
}
