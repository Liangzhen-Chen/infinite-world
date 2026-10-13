import fs from 'node:fs/promises';
import path from 'node:path';
import {hashContent} from '../../../../../tools/content-pipeline.mjs';
import {runDepthReview} from '../../../../../tools/npc-depth-review.mjs';
import {DeepSeekClient} from '../../../../../tools/deepseek-client.mjs';
const out=path.resolve('world/drafts/w1/lq-depth/complete-003'),root=path.resolve('world/drafts/w1/lq-depth/author-v2/first-review');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
export async function currentOptions(){const next=path.join(out,'next-plan.json'),controlledRevision=await fs.access(next).then(()=>next).catch(()=>path.join(out,'plan.json'));return{root,design:path.resolve('world/design/w1-lq-depth.mjs'),budgetRoot:path.resolve('world/drafts/m4-object'),cardId:'T08',batch:'lq-depth',controlledRevision,authorizationHash:hashContent(await read(controlledRevision)),authoredBackground:path.join(out,'authored-background.json'),reopenAuthorization:path.resolve('world/design/w1-reopen-authorization.json'),continueReopen:true,compactRequest:true};}
if(process.argv[2]==='--run'){
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY缺失');
 const options=await currentOptions(),plan=await read(options.controlledRevision),ids=process.argv[3]?.split(',')??plan.authorized.map(a=>a.id);
 const reportFile=path.join(out,'review-results.json'),results=await read(reportFile).catch(e=>{if(e.code==='ENOENT')return[];throw e;});
 const client=new DeepSeekClient({budgetYuan:25,logFile:path.join(out,'usage.jsonl')});
 for(const id of ids){
  if(results.filter(r=>!r.skipped).length>=40)throw Error('本会话40次调用上限');
  const record=await read(path.join(root,id+'.json'));
  const evidence=record.reviewRecovery?.sourceEvidence?.file??record.firstSourceEvidence?.file;
  try{
   const r=await runDepthReview({...options,id,...(evidence?{sourceEvidence:path.resolve(root,evidence)}:{})},{client});
   const row={id,status:r.status,skipped:r.skipped??false,reason:r.reason??null,errors:r.review?.contradictions.filter(c=>c.severity==='hard')??[],backgroundErrors:r.review?.backgroundReviews?.flatMap(b=>b.contradictions.filter(c=>c.severity==='hard'))??[],error:r.error??null,spentYuan:r.budgetAfter?.cards.T08.spentYuan??null};
   results.push(row);await fs.writeFile(reportFile,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(row));
  }catch(e){results.push({id,error:e.message,stopped:true});await fs.writeFile(reportFile,JSON.stringify(results,null,2)+'\n');throw e;}
 }
}
