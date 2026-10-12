import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {prepareDepth,loadDepthReopen} from '../../../../tools/npc-depth.mjs';
import {runDepthReview} from '../../../../tools/npc-depth-review.mjs';
import {contextFor,patchDraft,validateDraft,buildReviewRequest,checkIncrementalReview,getPath} from '../../../../tools/npc-depth-content.mjs';
import {compactReviewRequest,loadEvidence,validateSourceEvidence} from '../../../../tools/npc-depth-source-evidence.mjs';
import {hashContent} from '../../../../tools/content-pipeline.mjs';
import {requestMeasure} from './request-preflight.mjs';
const project=path.resolve(import.meta.dirname,'../../../..'),root=path.join(import.meta.dirname,'first-review'),out=path.join(root,'complete-002');
const options={worldRoot:path.join(project,'world'),root,design:path.join(project,'world/design/w1-sb-depth.mjs'),authoredBackground:path.join(root,'authored-background.json'),cardId:'T09',budgetRoot:'F:/dnd/world/drafts/m4-object',reopenAuthorization:path.join(project,'world/design/w1-reopen-authorization.json'),compactRequest:true};
const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
const write=async(name,data)=>{const target=path.join(out,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,JSON.stringify(data,null,2)+'\n');};
export async function directPreflight(){
 const prepared=await prepareDepth(options),reopen=await loadDepthReopen(options,prepared),map=await read(path.join(root,'source-evidence-map.json'));
 const budget=await read(path.join(options.budgetRoot,'budget.json')),background=await read(options.authoredBackground);
 const requests=[],sourceChecks=[];
 for(const event of background.events){
  for(const ref of event.sourceRefs){const value=getPath(prepared.world[ref.collection].find(r=>r.id===ref.id),ref.field);assert.equal(hashContent(value),ref.hash);sourceChecks.push({eventId:event.id,collection:ref.collection,id:ref.id,field:ref.field,hash:ref.hash});}
  for(const risk of event.risks){const person=[...prepared.world.npcs,...prepared.world.residents].find(p=>p.id===risk.id);assert.equal(hashContent(getPath(person,risk.field)),risk.hash);}
 }
 for(const entry of prepared.entries){
  const context=contextFor(entry,prepared.world),draft=patchDraft(entry);assert.deepEqual(validateDraft(draft,entry).errors,[]);
  const evidence=map[entry.id]?await loadEvidence(path.resolve(root,map[entry.id]),entry,prepared.world):null;
  const full=buildReviewRequest(entry,draft,context,{requireLeafCoverage:true}),compact=compactReviewRequest(full);
  if(evidence)for(const request of [full,compact])request.messages.push({role:'user',content:JSON.stringify(evidence.data)});
  const measured={id:entry.id,entryHash:hashContent(entry),contextHash:hashContent(context),draftHash:hashContent(draft),evidenceHash:evidence?.contentHash??null,full:requestMeasure(full),compact:requestMeasure(compact)};
  requests.push(measured);await write(`direct-requests/${entry.id}.json`,measured);
 }
 assert.equal(prepared.entries.length,30);assert.equal(sourceChecks.length,172);assert.equal(background.events.flatMap(e=>e.risks).length,60);
 const report={stage:'official-direct-L2-source-preflight',generatedAt:new Date().toISOString(),modelCalls:0,authorizationId:reopen.manifest.id,manifestHash:reopen.manifestHash,foundationHash:hashContent(prepared.foundation),candidateHash:hashContent(await read(path.join(root,'candidate.json'))),authoredBackgroundHash:hashContent(background),sourceChecks,entries:requests.map(({full,compact,...r})=>({...r,fullCeilingYuan:full.ceilingYuan,compactCeilingYuan:compact.ceilingYuan})),firstId:requests[0].id,firstCompactCeilingYuan:requests[0].compact.ceilingYuan,pilotLimitYuan:.5,cardLimitYuan:reopen.grant.newLimitYuan,budgetSnapshot:{spentYuan:budget.spentYuan,reservedYuan:budget.reservedYuan,card:budget.cards?.T09??null},fullCeilingSumYuan:requests.reduce((n,r)=>n+r.full.ceilingYuan,0),compactCeilingSumYuan:requests.reduce((n,r)=>n+r.compact.ceilingYuan,0),referenceWorldHash:hashContent(prepared.world),baselineHash:hashContent(prepared.world.npcs),formalWrite:false};
 assert.ok(report.firstCompactCeilingYuan<=.5);await write('direct-preflight.json',report);return {prepared,map,report};
}
async function prepareSourceRepair(prepared,map){
 const originals=await read(path.join(out,'first-l2-records.json')),background=await read(options.authoredBackground),repairMap={},plan=[];
 for(const old of originals.filter(r=>r.status==='manual')){
  const entry=prepared.entries.find(e=>e.id===old.id),people=[...prepared.world.npcs,...prepared.world.residents],records=new Map();
  const add=(id,fields)=>{const person=people.find(p=>p.id===id);assert.ok(person);const row=records.get(id)??{id,name:person.name};for(const field of fields)if(Object.hasOwn(person,field))row[field]=structuredClone(person[field]);records.set(id,row);};
  add(entry.id,[]);
  if(map[entry.id])for(const row of (await read(path.resolve(root,map[entry.id]))).sourceRecords)records.set(row.id,structuredClone(row));
  const hard=old.errors.filter(e=>e.severity==='hard'),events=background.events.filter(e=>e.actors.includes(entry.id)),boundaries=[];
  for(const issue of hard){
   const relation=issue.field.match(/^relationships\[(\d+)\]\.note$/);
   if(relation){const other=entry.before.relationships[Number(relation[1])].with;add(entry.id,['sex','relationships','notes']);add(other,['sex','currentConcern','home']);}
   if(issue.field.startsWith('knowledge.unknown')){add(entry.id,['sex','notes','goals']);for(const person of people.filter(p=>issue.quote.includes(p.name)&&p.id!==entry.id))add(person.id,['sex','currentConcern']);}
   if(issue.field.startsWith('goals.'))add(entry.id,['goals','memorySeeds','notes']);
   if(issue.field==='knowledge.known[2]'||issue.field==='memorySeeds[2]')for(const event of events)for(const actor of event.actors)add(actor,['occupation','notes','socialProfile']);
  }
  for(const event of events){
   const speech=[...new Map(event.sourceRefs.filter(r=>r.publicSpeech).map(r=>[r.id,r.publicSpeech])).entries()];
   boundaries.push(`待审原背景 ${event.id} 的明确公开说话范围为 ${JSON.stringify(speech)}。范围来源是原 authored-background.json 的独立设计授权，hash=${hashContent(background)}；不得用候选自己证明它。把在场听到的公开说话与对方未公开秘密逐句比较；privateRisks 是需排除的风险清单，不是向参与者公开的发言。`);
  }
  const data={sourceRecords:[...records.values()],reviewBoundary:'本次为首次真实hard后的原来源补证，原候选一字未改。sourceRecords逐字段匹配冻结世界，只供审核，不写入人物知识。currentConcern是该条sourceRecord人物本人的原关切；亲属称谓依据待审本人原relationships.type与该住户的原sex核对主语，不能反向推定亲属关系。关系备注仍是本人档字段，不能据此扩大其他人的秘密knownBy。目标步骤仍为pending，不赋予已完成行动或新技能。'+boundaries.join('')+'原真实hard须逐条核对；存在实际矛盾必须原样保留hard及具体原句，不因补证、授权或覆盖清单省略。'};
  validateSourceEvidence(data,entry,prepared.world);
  const priorSource=map[entry.id]?await read(path.resolve(root,map[entry.id])):null;
  assert.notEqual(hashContent(data),priorSource?hashContent(priorSource):null);
  const file=`repair-sources/${entry.id}.json`;await write(file,data);repairMap[entry.id]=file;
  const originalFieldRefs=data.sourceRecords.flatMap(row=>Object.entries(row).filter(([f])=>!['id','name'].includes(f)).map(([field,value])=>({id:row.id,field,hash:hashContent(value)})));
  plan.push({id:entry.id,originalRecordHash:hashContent(old),originalDraftHash:hashContent(old.draft),hardPaths:[...new Set(hard.map(e=>e.field))],sourceOnly:true,candidateChanged:false,sourceEvidenceHash:hashContent(data),originalFieldRefs});
 }
 await write('repair-source-map.json',repairMap);await write('source-repair-plan.json',{kind:'T09-first-real-hard-original-field-supplement',authorizationId:'user-reopen-20261012-01',modelCalls:0,sourceOnly:true,plan});
 console.log(JSON.stringify({sourceOnlyRepairs:plan.length,candidateChanged:false}));
}
async function run(mode){
 const {prepared,map,report}=await directPreflight();
 if(mode==='--preflight'){console.log(JSON.stringify({entries:30,modelCalls:0,firstId:report.firstId,pilotCeiling:report.firstCompactCeilingYuan,compactSum:report.compactCeilingSumYuan}));return;}
 if(mode==='--prepare-source-repair'){await prepareSourceRepair(prepared,map);return;}
 assert.ok(['--pilot','--continue','--source-repair'].includes(mode),'Explicit pilot, continue, or source repair required');
 const start=await read(path.join(options.budgetRoot,'budget.json')),results=[];
 const repairMap=mode==='--source-repair'?await read(path.join(out,'repair-source-map.json')):null;
 const selected=mode==='--pilot'?prepared.entries.slice(0,1):mode==='--source-repair'?prepared.entries.filter(e=>Object.hasOwn(repairMap,e.id)):prepared.entries;
 if(mode!=='--pilot')assert.equal(start.reopenAuthorizations?.[report.authorizationId]?.cards?.T09?.pilotPassed,true,'First real ID must pass before continuation');
 for(const entry of selected){
  let result;
  try{
   const sourceFile=repairMap?path.resolve(out,repairMap[entry.id]):map[entry.id]?path.resolve(root,map[entry.id]):null;
   result=await runDepthReview({...options,id:entry.id,...(sourceFile?{sourceEvidence:sourceFile}:{}),...(mode!=='--pilot'?{continueReopen:true}:{})});
   if(result.status==='passed'&&!result.skipped){const record=await read(path.join(root,entry.id+'.json'));checkIncrementalReview(record.review,entry,contextFor(entry,prepared.world));assert.deepEqual(record.draft,patchDraft(entry));}
  }catch(error){result={id:entry.id,status:'stopped',error:error.message};}
  const ledger=await read(path.join(options.budgetRoot,'budget.json'));
  results.push({id:entry.id,status:result.status,skipped:result.skipped??false,error:result.error??null,cardSpentYuan:ledger.cards?.T09?.spentYuan??0,cardReservedYuan:ledger.cards?.T09?.reservedYuan??0});
  await write(mode==='--pilot'?'pilot-result.json':mode==='--source-repair'?'source-repair-result.json':'continuation-result.json',{stage:mode,authorizationId:report.authorizationId,manifestHash:report.manifestHash,results,budgetBefore:start,budgetAfter:ledger,stopped:result.status==='stopped'});
  console.log(JSON.stringify(results.at(-1)));
  // A hard factual review can remain manual while other independent IDs are
  // reviewed. Transport/source/budget exceptions stop the unsent queue.
  if(result.status==='stopped'||result.error||mode==='--pilot'&&result.status!=='passed')break;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run(process.argv[2]);
