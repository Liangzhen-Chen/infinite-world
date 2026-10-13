import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {hashContent} from '../../../../tools/content-pipeline.mjs';
import {prepareDepthRevision} from '../../../../tools/npc-depth.mjs';
import {runDepthReview} from '../../../../tools/npc-depth-review.mjs';
import {DeepSeekClient} from '../../../../tools/deepseek-client.mjs';
import {patchDraft,validatePatchResults,checkIncrementalReview} from '../../../../tools/npc-depth-content.mjs';
import {requestMeasure} from './request-preflight.mjs';

const project=path.resolve(import.meta.dirname,'../../../..');
export const root=path.join(import.meta.dirname,'first-review'),out=path.join(root,'complete-003b');
const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
const write=async(name,data)=>{const file=path.join(out,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(data,null,2)+'\n');};
const common={worldRoot:path.join(project,'world'),root,cardId:'T09',budgetRoot:path.join(project,'world/drafts/m4-object'),reopenAuthorization:path.join(project,'world/design/w1-reopen-authorization.json'),compactRequest:true,continueReopen:true};
export async function currentOptions(){const plan=await read(path.join(out,'plan.json'));return{...common,design:path.join(out,'design.mjs'),controlledRevision:path.join(out,'plan.json'),authorizationHash:hashContent(plan),authoredBackground:path.join(root,'complete-003/speech-background.json')};}
export async function prepareFinal(){
 const oldPlan=await read(path.join(root,'complete-003/longfu-plan.json'));
 const prepared=await prepareDepthRevision({...common,design:path.join(root,'complete-003/longfu-design.mjs'),controlledRevision:path.join(root,'complete-003/longfu-plan.json'),authorizationHash:hashContent(oldPlan),authoredBackground:path.join(root,'authored-background.json')});
 const rows=await read(path.join(root,'complete-003/speech-rows.json')),required=(await read(path.join(root,'complete-003/current-report.json'))).requiredInterfaceFix;
 rows.find(r=>r.id==='npc_sb_longfu').patches.find(p=>p.path===required.longfu.path).value=required.longfu.after;
 await write('rows.json',rows);
 await fs.writeFile(path.join(out,'design.mjs'),"export {revision,incrementLimitYuan,cohorts} from '../../../../../design/w1-sb-depth.mjs';\nexport {default as patchRows} from './rows.json' with {type:'json'};\n");
 const priorSpeechPlan=await read(path.join(root,'complete-003/speech-plan.json')),sourceAuth=await read(path.join(root,'complete-003/speech-source-authorization.json'));
 const ids=['npc_sb_chishan','npc_sb_chayue','npc_sb_longfu'],records=await Promise.all(ids.map(id=>read(path.join(root,id+'.json'))));
 const plan={...priorSpeechPlan,planningId:'T09-authorized-20261013-final-source-fixes',sourceAuthorization:{file:'complete-003/speech-source-authorization.json',hash:hashContent(sourceAuth)},sourceHashes:[...priorSpeechPlan.sourceHashes,{file:'complete-003/longfu-source.json',hash:required.longfu.source.fileHash}],authorized:records.map(r=>({id:r.id,recordHash:hashContent(r),draftHash:hashContent(r.draft),reviewHash:hashContent(r.review),paths:r.id==='npc_sb_longfu'?['relationships[1].note']:['knowledge.known[2]','memorySeeds[2]']})),auditFinding:required.longfu};
 await write('plan.json',plan);
 const options=await currentOptions(),next=await prepareDepthRevision(options);validatePatchResults(next.entries,next.world);
 console.log(JSON.stringify({prepared:next.revision.changes.map(c=>({id:c.id,path:c.path})),modelCalls:0}));return options;
}
export async function reviewFinal(){
 assert.ok(process.env.DEEPSEEK_API_KEY,'DEEPSEEK_API_KEY missing');
 const options=await currentOptions(),start=await read(path.join(common.budgetRoot,'budget.json'));
 const client=new DeepSeekClient({budgetYuan:25,logFile:path.join(out,'usage.jsonl')}),results=[];
 for(const id of ['npc_sb_chishan','npc_sb_chayue','npc_sb_longfu']){
  assert.ok(results.filter(r=>!r.skipped).length<20,'T09 invocation cap');
  const sourceEvidence=id==='npc_sb_longfu'?path.join(root,'complete-003/longfu-source.json'):id==='npc_sb_chishan'?path.join(root,'complete-002/repair-sources/npc_sb_chishan.json'):undefined;
  const result=await runDepthReview({...options,id,...(sourceEvidence?{sourceEvidence}:{})},{client});
  const row=await read(path.join(root,id+'.json'));const prepared=await prepareDepthRevision(options),entry=prepared.entries.find(e=>e.id===id);
  if(result.status==='passed'){assert.deepEqual(row.draft,patchDraft(entry));assert.ok(!checkIncrementalReview(row.review,entry,prepared.contexts.get(id)).some(i=>i.severity==='hard'));}
  const current=await read(path.join(common.budgetRoot,'budget.json'));
  results.push({id,status:result.status,skipped:result.skipped??false,error:result.error??null,contradictions:result.review?.contradictions??[],spentYuan:current.cards.T09.spentYuan});
  await write('L2-results.json',{results,newCostYuan:current.cards.T09.spentYuan-start.cards.T09.spentYuan,cardBefore:start.cards.T09,cardAfter:current.cards.T09});console.log(JSON.stringify(results.at(-1)));
  if(result.error||result.status!=='passed')break;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv[2]==='--prepare')await prepareFinal();
 else if(process.argv[2]==='--review')await reviewFinal();
}
