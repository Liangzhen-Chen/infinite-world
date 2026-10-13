import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {prepareDepth,prepareDepthRevision} from '../../../../tools/npc-depth.mjs';
import {runDepthReview} from '../../../../tools/npc-depth-review.mjs';
import {hashContent} from '../../../../tools/content-pipeline.mjs';
import {getPath,patchDraft,validateDraft,applyDepthDraft} from '../../../../tools/npc-depth-content.mjs';
import {validateSourceEvidence} from '../../../../tools/npc-depth-source-evidence.mjs';
import {DeepSeekClient} from '../../../../tools/deepseek-client.mjs';
import {auditNpcDepth} from '../../../../tools/audit-npc-depth.mjs';

const project=path.resolve(import.meta.dirname,'../../../..');
const root=path.join(import.meta.dirname,'first-review'),out=path.join(root,'complete-003');
const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
const write=async(name,data)=>{const file=path.join(out,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(data,null,2)+'\n');};
const originalOptions={worldRoot:path.join(project,'world'),root,design:path.join(project,'world/design/w1-sb-depth.mjs'),authoredBackground:path.join(root,'authored-background.json'),cardId:'T09',budgetRoot:path.join(project,'world/drafts/m4-object'),reopenAuthorization:path.join(project,'world/design/w1-reopen-authorization.json'),compactRequest:true,continueReopen:true};

export async function prepareLongfu(){
 const prepared=await prepareDepth(originalOptions),entry=prepared.entries.find(e=>e.id==='npc_sb_longfu');
 const rows=await Promise.all(prepared.entries.map(e=>read(path.join(root,e.id+'.json'))));
 const record=rows.find(r=>r.id===entry.id),originalEvidence=await read(path.join(root,'complete-002/repair-sources/npc_sb_longfu.json'));
 const people=[...prepared.world.npcs,...prepared.world.residents];
 const sources=new Map(originalEvidence.sourceRecords.map(r=>[r.id,structuredClone(r)]));
 const add=(id,fields)=>{const person=people.find(p=>p.id===id);assert.ok(person);const row=sources.get(id)??{id,name:person.name};for(const field of fields)if(getPath(person,field)!==undefined)row[field]=structuredClone(getPath(person,field));sources.set(id,row);};
 add(entry.id,['voice','memorySeeds','knowledge','goals','relationships','opinions','home','notes','occupation','socialProfile']);
 for(const relation of entry.before.relationships)add(relation.with,['sex','home',...(people.find(p=>p.id===relation.with).currentConcern?['currentConcern']:[])]);
 const evidence={sourceRecords:[...sources.values()],reviewBoundary:originalEvidence.reviewBoundary+' 原memorySeeds[1]已经记载取回湿布；known[1]仅概括该亲历。shared_12是独立授权待审的招呼，before未列该新事件不构成无源。unknown是尚未知道的答案，疑问没有断言对方心思；目标steps仍pending，仅提出原育苗目标所需的行动，不能视为已经做成。附带原voice供核对，register仅恢复指叶背、谈土并保留原notes的重复旧例。必须逐条独立核对旧hard与原字段，真实矛盾继续报hard。'};
 validateSourceEvidence(evidence,entry,prepared.world);await write('longfu-source.json',evidence);
 const changes=[
  {path:'voice.register',value:'先指叶背再谈土，别人不听便反复讲同一例子'},
  {path:'relationships[0].note',value:'龙瑜与龙芙同住龙芙户居处；她第三遍讲旧例时，他搓掉手上的泥，嗯一声就转去搬苗盘。'},
  {path:'relationships[1].note',value:'雷思与龙芙同住龙芙户居处，是她的配偶；她与用水者仍待商量转身方向。'}
 ];
 const patchRows=prepared.entries.map(({id,before,baseHash,issues,patches,...rest})=>({id,before,baseHash,issues,patches:patches.map(p=>id===entry.id&&changes.some(c=>c.path===p.path)?structuredClone(changes.find(c=>c.path===p.path)):structuredClone(p)),...Object.fromEntries(Object.entries(rest).filter(([key])=>key.startsWith('reference')))}));
 await write('longfu-rows.json',patchRows);
 await fs.writeFile(path.join(out,'longfu-design.mjs'),"export {revision,incrementLimitYuan,cohorts} from '../../../../../design/w1-sb-depth.mjs';\nexport {default as patchRows} from './longfu-rows.json' with {type:'json'};\n");
 const sourceRefs=evidence.sourceRecords.flatMap(row=>Object.entries(row).filter(([key])=>!['id','name'].includes(key)).map(([field,value])=>({id:row.id,field,hash:hashContent(value)})));
 const background=await read(originalOptions.authoredBackground),event=background.events.find(e=>e.id==='memory_sb_depth_shared_12');
 const hardBindings=record.errors.map((finding,index)=>({index,finding,originalRecordHash:hashContent(record),sources: finding.field==='knowledge.known[1]'?sourceRefs.filter(s=>s.id===entry.id&&s.field==='memorySeeds'):['knowledge.known[2]','memorySeeds[2]'].includes(finding.field)?[{file:'authored-background.json',hash:hashContent(background),eventId:event.id,eventHash:hashContent(event)}]:sourceRefs.filter(s=>s.id===entry.id||s.id===entry.before.relationships[0].with||s.id===entry.before.relationships[1].with)}));
 assert.ok(hardBindings.every(b=>b.sources.length));
 const plan={kind:'controlled-depth-revision',cardId:'T09',planningId:'T09-authorized-20261013-longfu',revision:prepared.config.revision,foundationHash:hashContent(prepared.foundation),baseHash:hashContent(await read(path.join(root,'base.json'))),candidateHash:hashContent(await read(path.join(root,'candidate.json'))),sourceHashes:[{file:'authored-background.json',hash:hashContent(background)},{file:'complete-003/longfu-source.json',hash:hashContent(evidence)}],authorized:[{id:entry.id,recordHash:hashContent(record),draftHash:hashContent(record.draft),reviewHash:hashContent(record.review),paths:changes.map(c=>c.path)}],hardBindings};
 await write('longfu-plan.json',plan);
 const options={...originalOptions,design:path.join(out,'longfu-design.mjs'),controlledRevision:path.join(out,'longfu-plan.json'),authorizationHash:hashContent(plan),sourceEvidence:path.join(out,'longfu-source.json'),id:entry.id};
 const revised=await prepareDepthRevision(options);assert.deepEqual(validateDraft(patchDraft(revised.entries.find(e=>e.id===entry.id)),revised.entries.find(e=>e.id===entry.id)).errors,[]);
 return options;
}

export async function prepareSpeech(){
 const priorPlan=await read(path.join(out,'longfu-plan.json'));
 const priorOptions={...originalOptions,design:path.join(out,'longfu-design.mjs'),controlledRevision:path.join(out,'longfu-plan.json'),authorizationHash:hashContent(priorPlan)};
 const prepared=await prepareDepthRevision(priorOptions),proof=await read(path.join(root,'incremental-proof.json'));
 const ids=['npc_sb_chishan','npc_sb_chayue'],records=await Promise.all(ids.map(id=>read(path.join(root,id+'.json'))));
 const background=await read(originalOptions.authoredBackground),nextBackground=structuredClone(background),event=nextBackground.events.find(e=>e.id==='memory_sb_depth_shared_11');
 const narrative='池杉与查悦在桑坂村谈过树下歇脚与候灶；池杉说“树根边不要反复踩实，站哪里还要商量”；查悦说“候灶的人要能听见叫名，位置还没谈妥”。候灶位置尚未商定。';
 event.narrative=narrative;for(const association of event.associations)association.narrative=narrative;
 await write('speech-background.json',nextBackground);
 const patchRows=prepared.entries.map(e=>({id:e.id,before:e.before,baseHash:e.baseHash,issues:e.issues,patches:e.patches.map(p=>ids.includes(e.id)&&p.path==='knowledge.known[2]'?{...p,value:{...p.value,fact:narrative}}:ids.includes(e.id)&&p.path==='memorySeeds[2]'?{...p,value:{...p.value,event:narrative}}:structuredClone(p)),...Object.fromEntries(Object.entries(e).filter(([key])=>key.startsWith('reference')))}));
 await write('speech-rows.json',patchRows);
 await fs.writeFile(path.join(out,'speech-design.mjs'),"export {revision,incrementLimitYuan,cohorts} from '../../../../../design/w1-sb-depth.mjs';\nexport {default as patchRows} from './speech-rows.json' with {type:'json'};\n");
 const sourceRefs=background.events.find(e=>e.id===event.id).sourceRefs.filter(r=>r.publicSpeech);
 const oldChishan=records.find(r=>r.id==='npc_sb_chishan');
 const plan={kind:'controlled-depth-revision',cardId:'T09',planningId:'T09-authorized-20261013-public-speech',revision:prepared.config.revision,foundationHash:hashContent(prepared.foundation),baseHash:hashContent(await read(path.join(root,'base.json'))),candidateHash:hashContent(await read(path.join(root,'candidate.json'))),previousProofHash:hashContent(proof),sourceHashes:[{file:'authored-background.json',hash:hashContent(background)}],authorized:records.map(record=>({id:record.id,recordHash:hashContent(record),draftHash:hashContent(record.draft),reviewHash:hashContent(record.review),paths:['knowledge.known[2]','memorySeeds[2]']})),hardBindings:oldChishan.errors.map((finding,index)=>({index,finding,originalRecordHash:hashContent(oldChishan),sources:[{file:'authored-background.json',hash:hashContent(background),eventId:event.id,eventHash:hashContent(background.events.find(e=>e.id===event.id)),sourceRefs}]}))};
 await write('speech-plan.json',plan);
 const options={...originalOptions,design:path.join(out,'speech-design.mjs'),controlledRevision:path.join(out,'speech-plan.json'),authorizationHash:hashContent(plan),authoredBackground:path.join(out,'speech-background.json')};
 try{await prepareDepthRevision(options);console.log(JSON.stringify({stage:'shared-speech-preflight',modelCalls:0,accepted:true}));}
 catch(error){await write('speech-preflight.json',{stage:'shared-speech-preflight',modelCalls:0,accepted:false,error:error.message,requiredIds:ids,requiredPaths:['knowledge.known[2]','memorySeeds[2]'],originalBackgroundHash:hashContent(background),revisedBackgroundHash:hashContent(nextBackground),planHash:hashContent(plan)});throw error;}
 return options;
}

const mode=process.argv[2];
if(mode==='--prepare-longfu')console.log(JSON.stringify({id:(await prepareLongfu()).id,modelCalls:0}));
if(mode==='--prepare-speech')await prepareSpeech();
if(mode==='--prepare-audit-fix'){
 const plan=await read(path.join(out,'longfu-plan.json'));
 const options={...originalOptions,design:path.join(out,'longfu-design.mjs'),controlledRevision:path.join(out,'longfu-plan.json'),authorizationHash:hashContent(plan)};
 const prepared=await prepareDepthRevision(options),record=await read(path.join(root,'npc_sb_longfu.json')),source=await read(path.join(out,'longfu-source.json'));
 const before=record.draft.patches.find(p=>p.path==='relationships[1].note').value;
 const after='雷思与龙芙同住龙芙户居处；她和用水户谈转身方向时，他蹲在门槛边等两边把话说完。';
 const draft=structuredClone(record.draft);draft.patches.find(p=>p.path==='relationships[1].note').value=after;
 const merged={...prepared.world,npcs:prepared.world.npcs.map(n=>{const entry=prepared.entries.find(e=>e.id===n.id);return entry?applyDepthDraft(n,entry.id===record.id?draft:patchDraft(entry)):n;})};
 const audit=auditNpcDepth(merged),issues=audit.issues.filter(i=>prepared.entries.some(e=>e.id===i.id));assert.deepEqual(issues,[]);
 const leisi=source.sourceRecords.find(r=>r.id==='npc_sb_leisi'),report=await read(path.join(out,'current-report.json'));
 report.requiredInterfaceFix={files:['tools/npc-depth.mjs','tools/npc-depth-content.mjs'],speech:{ids:['npc_sb_chishan','npc_sb_chayue'],paths:['knowledge.known[2]','memorySeeds[2]'],credentialFile:'speech-source-authorization.json',preflight:'未授权重开叶'},longfu:{id:record.id,path:'relationships[1].note',before,after,recordHash:hashContent(record),draftHash:hashContent(record.draft),reviewHash:hashContent(record.review),source:{file:'longfu-source.json',fileHash:hashContent(source),collection:'residents',id:leisi.id,field:'currentConcern',value:leisi.currentConcern,hash:hashContent(leisi.currentConcern)},proposedT04Issues:issues,applied:false}};
 await write('current-report.json',report);console.log(JSON.stringify({proposedT04Issues:issues,applied:false,modelCalls:0}));
}
if(mode==='--review-longfu'){
 assert.ok(process.env.DEEPSEEK_API_KEY,'DEEPSEEK_API_KEY missing');
 const plan=await read(path.join(out,'longfu-plan.json'));
 const options={...originalOptions,design:path.join(out,'longfu-design.mjs'),controlledRevision:path.join(out,'longfu-plan.json'),authorizationHash:hashContent(plan),sourceEvidence:path.join(out,'longfu-source.json'),id:'npc_sb_longfu'};
 const result=await runDepthReview(options,{client:new DeepSeekClient({budgetYuan:25,logFile:path.join(out,'usage.jsonl')})});
 await write('longfu-result.json',{id:result.id,status:result.status,review:result.review,error:result.error??null,newCalls:result.skipped?0:1,newCostYuan:result.budgetAfter?result.budgetAfter.cards.T09.spentYuan-result.budgetBefore.cards.T09.spentYuan:0,cardBefore:result.budgetBefore?.cards.T09,cardAfter:result.budgetAfter?.cards.T09,l4Required:result.l4Required});console.log(JSON.stringify({id:result.id,status:result.status,errors:result.error??result.review?.contradictions,cost:result.budgetAfter?.cards.T09}));
}
