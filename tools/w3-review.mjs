import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {economyW3} from '../world/design/economy-w3.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {hashContent,defaultReviewRequest,parseModelJSON} from './content-pipeline.mjs';
import {w3Context,w3Revision,validateW3Draft,closestW3Similarity} from './w3-content.mjs';

const root='world/drafts/w3',read=async file=>JSON.parse(await fs.readFile(file,'utf8')),write=async(file,data)=>fs.writeFile(file,JSON.stringify(data,null,2)+'\n');
const world=await loadWorld(),bones=economyW3(world),blocklist=await read('world/meta/blocklist.json');
if(process.argv.includes('--repair')){
  const corrections=await read(`${root}/manual-corrections.json`),budget=await read(`${root}/budget.json`),client=new DeepSeekClient({budgetYuan:20});client.spent=budget.spentYuan+(budget.reservedYuan??0);
  let budgetWrites=Promise.resolve();const saveBudget=()=>budgetWrites=budgetWrites.then(()=>write(`${root}/budget.json`,{spentYuan:client.spent,reservedYuan:client.reserved,limitYuan:20}));
  const entries=Object.entries(corrections);let cursor=0;
  await Promise.all(Array.from({length:8},async()=>{for(;;){const index=cursor++;if(index>=entries.length)return;const[id,patch]=entries[index],kind=id.startsWith('item_')?'items':'recipes';
    const file=`${root}/${kind}/${id}.json`,record=await read(file),entry=bones[kind].find(row=>row.id===id),context=w3Context(world,bones,entry);
    const alreadyApplied=record.manualCorrection?.reason===patch.reason;
    if(alreadyApplied&&record.status==='passed')continue;
    if(!alreadyApplied){
      if(patch.process)record.draft.process=patch.process;
      for(const[field,pairs]of Object.entries(patch.replace??{}))for(const[from,to]of pairs){if(!record.draft[field].includes(from))throw new Error(`${id}缺少预期原句 ${from}`);record.draft[field]=record.draft[field].replace(from,to);}
    }
    record.fingerprint=hashContent({entry,context,revision:w3Revision});record.manualCorrection={reason:patch.reason};record.status='pending';record.review=null;
    const validation=validateW3Draft(record.draft,entry,blocklist,context);record.errors=validation.errors;record.warnings=validation.warnings;
    await write(file,record);
    if(record.errors.length){console.log(JSON.stringify({id,errors:record.errors}));continue;}
    const pending=client.generate(defaultReviewRequest(entry,record.draft,context),`content-w3-manual-review-${id}`);pending.catch(()=>{});await saveBudget();
    try{
      const review=parseModelJSON(await pending);
      if(!Array.isArray(review.contradictions)||review.contradictions.some(row=>!['hard','soft','style'].includes(row.severity)||!['quote','field','reason'].every(key=>typeof row[key]==='string'&&row[key].trim())))throw new Error('事实审查格式不合格');
      record.review=review;record.errors.push(...review.contradictions.filter(row=>row.severity==='hard'));record.warnings.push(...review.contradictions.filter(row=>row.severity!=='hard'));
      record.status=record.errors.length?'manual':'passed';record.feedback=record.errors.length?record.errors:null;
      await write(file,record);console.log(JSON.stringify({id,status:record.status,errors:record.errors}));
    }finally{await saveBudget();}
  }}));
  await write(`${root}/bones.json`,bones);
}
// Recompute all L1 outcomes and batch hashes without asking for new prose.
for(const kind of ['items','recipes']){
  const summary=await read(`${root}/${kind}/summary.json`),records=await Promise.all(bones[kind].map(entry=>read(`${root}/${kind}/${entry.id}.json`)));
  for(const record of records){
    const entry=bones[kind].find(entry=>entry.id===record.id),validation=validateW3Draft(record.draft,entry,blocklist,w3Context(world,bones,entry));
    const similar=closestW3Similarity(record.draft,[...records.map(row=>row.draft),...world[kind].filter(row=>!bones[kind].some(entry=>entry.id===row.id))]);
    if(similar.score>=.35)validation.errors.push(`相似度${similar.score}：${similar.id}`);
    const contradictions=record.review?.contradictions??[{severity:'hard',quote:'本稿',field:'review',reason:'缺少当前文字的事实审查，必须续跑复审'}];
    record.errors=[...validation.errors,...contradictions.filter(row=>row.severity==='hard')];record.warnings=[...validation.warnings,...contradictions.filter(row=>row.severity!=='hard')];
    record.status=record.errors.length?'manual':'passed';await write(`${root}/${kind}/${record.id}.json`,record);
  }
  for(let i=0;i<summary.batches.length;i++){
    const batch=await read(`${root}/${kind}/batch-${i}.json`),rows=batch.ids.map(id=>records.find(row=>row.id===id));
    const fingerprint=hashContent(rows.map(row=>({id:row.id,draft:row.draft,review:row.review,status:row.status})));
    if(batch.fingerprint!==fingerprint)batch.l4={approved:false,notes:[]};
    batch.fingerprint=fingerprint;batch.passed=rows.filter(row=>row.status==='passed').length;batch.manual=rows.filter(row=>row.status==='manual').map(row=>row.id);batch.pending=[];
    batch.flagged=rows.filter(row=>row.warnings.length||row.manualCorrection).map(row=>row.id);batch.manualRatio=batch.manual.length/batch.count;batch.needsSystemicRepair=batch.manualRatio>.1;
    await write(`${root}/${kind}/batch-${i}.json`,batch);summary.batches[i]=batch;
  }
  summary.passed=records.filter(row=>row.status==='passed').length;summary.manual=records.length-summary.passed;summary.pending=0;summary.costUpperYuan=(await read(`${root}/budget.json`)).spentYuan;
  await write(`${root}/${kind}/summary.json`,summary);console.log(JSON.stringify({kind,passed:summary.passed,manual:summary.manual}));
}
