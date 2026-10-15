// Offline measurement only. Review decisions and commit permissions stay intact.
export function consistencyTurnFailed(turn){
 const review=turn.consistency;
 return turn.operation!=='deleteLast'&&(!review?.verified||!review.canCommit||review.status!=='verified'||Boolean(review.issues?.length));
}

export function summarizeConsistency(results,{threshold=.9}={}){
 const failures=[],falsePositives=[],contradictions=[],unresolved=[];let total=0,rejected=0;
 for(const result of results)for(const turn of result.turns??[]){
  if(turn.operation==='deleteLast')continue;
  total++;
  if(!consistencyTurnFailed(turn))continue;
  const review=turn.consistency,context={session:result.id,attempt:result.attempt,turn:turn.index};
  if(review?.canCommit===false)rejected++;
  const issues=review?.issues?.length?review.issues:review?.originalIssues?.length?review.originalIssues:
   [{category:'review-unverified',reason:review?.rewriteError??review?.feedback??'一致性审查未完成',severity:'error'}];
  const samples=issues.map((issue,issueIndex)=>{
   // An explicit evidence-backed human adjudication labels the sample. It never
   // removes the rejected turn from the failure numerator or changes canCommit.
   const adjudication=turn.consistencyAdjudications?.find(row=>row.issueIndex===issueIndex&&row.category===issue.category&&row.quote===issue.quote&&
    ['false-positive','contradiction'].includes(row.disposition)&&row.reason?.trim()&&row.evidence?.trim());
   const sample={...context,issueIndex,...issue,disposition:adjudication?.disposition??'unresolved',...(adjudication?{adjudication}:{} )};
   (sample.disposition==='false-positive'?falsePositives:sample.disposition==='contradiction'?contradictions:unresolved).push(sample);
   return sample;
  });
  failures.push({...context,rejected:review?.canCommit===false,status:review?.status??'missing',
   originalReply:turn.originalReply??turn.reply,reason:review?.rewriteError??review?.feedback??samples.map(s=>s.reason).join('；'),
   categories:[...new Set(samples.map(s=>s.category))],samples});
 }
 const failed=failures.length,passed=total-failed;
 return {total,passed,failed,rejected,passRatio:total?passed/total:null,failureRatio:total?failed/total:null,threshold,
  thresholdReached:total>0&&passed/total>=threshold,failures,falsePositives,contradictions,unresolved};
}

export function consistencyThreshold(results,threshold=.9){
 // Historical summary-only fixtures have no per-turn review records.
 if(results.length&&!results.some(r=>r.turns?.some(t=>t.consistency)))return results.every(r=>r.consistencyPass===true);
 return summarizeConsistency(results,{threshold}).thresholdReached;
}
