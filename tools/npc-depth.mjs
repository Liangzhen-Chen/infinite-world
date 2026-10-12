import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,hashContent} from './content-pipeline.mjs';
import {migrateDepthBudget,validateReopenAuthorization} from './content-budget.mjs';
import {prepareFirstSourceEvidence,compactReviewRequest} from './npc-depth-source-evidence.mjs';
import {depthBatches,depthEntries,contextFor,buildDraftRequest,buildReviewRequest,extractDraft,validateDraft,patchDraft,validatePatchResults,validateAuthoredBackground,validateControlledRevision,depthReviewClient,applyDepthDraft,authoredReviewContext} from './npc-depth-content.mjs';
export const depthHelp='npc-depth --batch <旧批次> | --design <设计.mjs> --root <world候选目录> --prepare | --budget-root <共用预算目录> --card <T编号> [--source-evidence-map <world内逐ID索引JSON>] [--compact-request] [--recover-protocol <id,id>] [--authored-background <world内json>]\nsource-evidence-map 为 {人物id:相对索引文件的附件路径}，只追加逐字段匹配冻结原档的资料；compact-request 精简L2可重建的重复事实。card 是稳定授权编号，换目录或 revision 仍使用原编号。recover-protocol 只为指定的合同失败提供一次恢复，保留 attempts 与原错误，仍须 L1/L2/L4。新设计导出 revision, patchRows:[{id,before,baseHash,issues:[{id,field,code}],patches:[{path,value}]}]。prepare 不调用模型；正式文件由 publish-npc-depth --manifest <manifest.json> [--publish] 写入。\n --reuse-frozen-drafts 显式复用合法定稿直接完整L2，无模型draft响应；--reopen-authorization <world内JSON> --id <单id> 沿原账授权轮，后续经首ID通过使用--reopen-continue；--prepare仍零模型。\n --source-checkout-evidence <world内JSON> 仅用于原T07规划的固定LF/CRLF出处凭证；缺省保持原逐字校验，复审收据和发布重放冻结凭证路径及hash。';
export function depthOptions(argv=process.argv.slice(2)){
 const option=name=>{const i=argv.indexOf(name);if(i<0)return undefined;if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error(`缺少参数 ${name}`);return argv[i+1];};
 const id=option('--id');const batch=option('--batch')??'yupo-depth',design=option('--design');
  return {batch,id,design:design&&path.resolve(design),root:path.resolve(option('--root')??`world/drafts/w1/${batch}`),budgetRoot:option('--budget-root')&&path.resolve(option('--budget-root')),cardId:option('--card'),authoredBackground:option('--authored-background')&&path.resolve(option('--authored-background')),controlledRevision:option('--controlled-revision')&&path.resolve(option('--controlled-revision')),authorizationHash:option('--authorization-hash'),...(option('--reopen-authorization')?{reopenAuthorization:path.resolve(option('--reopen-authorization'))}:{}),...(argv.includes('--reopen-continue')?{continueReopen:true}:{}),...(option('--source-checkout-evidence')?{sourceCheckoutEvidence:path.resolve(option('--source-checkout-evidence'))}:{}),...(option('--source-evidence-map')?{sourceEvidenceMap:path.resolve(option('--source-evidence-map'))}:{}),...(argv.includes('--reuse-frozen-drafts')?{reuseFrozenDrafts:true}:{}),...(argv.includes('--compact-request')?{compactRequest:true}:{}),protocolRecoveryIds:option('--recover-protocol')?.split(',')??[],prepare:argv.includes('--prepare'),help:argv.includes('--help')};
}
export async function loadDepthConfig({design,batch}){const config=design?await import(pathToFileURL(design).href+'?hash='+hashContent(await fs.readFile(design,'utf8'))):depthBatches[batch];if(!config)throw Error('未登记人物批次');if(design&&!config.patchRows)throw Error('新 design 须导出 patchRows');return config;}
export function depthFoundation(entries,world,revision){return{revision,entries:entries.map(e=>e.contract?{...e,context:contextFor(e,world)}:{id:e.id,baseHash:hashContent(e.before),facts:e.facts,sharedEvent:e.sharedEvent,context:contextFor(e,world)})};}
export async function prepareDepth({worldRoot=path.resolve('world'),...options}){
 if(options.sourceCheckoutEvidence&&!options.controlledRevision)throw Error('换行凭证仅适用于原T07受控规划');
 if(options.cardId==='T06'&&options.authoredBackground)throw Error('T06继续冻结');
 let config=await loadDepthConfig(options);const {root}=options,world=await loadWorld(worldRoot),rows=config.patchRows??config.depthRows;
 if(options.controlledRevision)return prepareDepthRevision({worldRoot,...options});
 if(options.authoredBackground){const relative=path.relative(path.resolve(worldRoot),options.authoredBackground);if(relative.startsWith('..')||path.isAbsolute(relative)||/secrets\.json$/i.test(options.authoredBackground))throw Error('作者出处须在world且非私人文件');config={...config,authoredBackground:JSON.parse(await fs.readFile(options.authoredBackground,'utf8'))};}
 await fs.mkdir(root,{recursive:true});const write=(name,value)=>fs.writeFile(path.join(root,name+'.json'),JSON.stringify(value,null,2)+'\n');
 let base;try{base=JSON.parse(await fs.readFile(path.join(root,'base.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;base=rows.map(r=>world.npcs.find(n=>n.id===r.id));if(base.some(n=>!n))throw Error('缺少原人物');await write('base',base);}
 const reference={...world,npcs:world.npcs.map(n=>base.find(b=>b.id===n.id)??n)};
 const entries=depthEntries(base,options.design?config:options.batch,reference),foundation=depthFoundation(entries,reference,config.revision);
 if(config.patchRows)validatePatchResults(entries,reference);
 try{const old=JSON.parse(await fs.readFile(path.join(root,'foundation.json'),'utf8'));if(hashContent(old)!==hashContent(foundation))throw Error('骨架或引用已变，先逐条复核，不覆盖冻结审核');}catch(e){if(e.code!=='ENOENT')throw e;await write('foundation',foundation);}
 if(config.patchRows){
  for(const file of [options.design,root]){const relative=path.relative(path.resolve(worldRoot),path.resolve(file));if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('新设计和候选目录须位于 world/ 内');}
  const candidate=entries.map(patchDraft);try{const old=JSON.parse(await fs.readFile(path.join(root,'candidate.json'),'utf8'));if(hashContent(old)!==hashContent(candidate))throw Error('冻结候选已改变');}catch(e){if(e.code!=='ENOENT')throw e;await write('candidate',candidate);}
  const manifest={contract:'audit-patch-v1',design:path.relative(worldRoot,options.design).replaceAll('\\','/'),root:path.relative(worldRoot,root).replaceAll('\\','/'),worldRoot:path.relative(root,worldRoot).replaceAll('\\','/'),foundationHash:hashContent(foundation),...(options.authoredBackground?{authoredBackground:path.relative(worldRoot,options.authoredBackground).replaceAll('\\','/'),authoredBackgroundHash:hashContent(config.authoredBackground)}:{})};
  try{const old=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));if(hashContent(old)!==hashContent(manifest))throw Error('冻结发布清单已改变');}catch(e){if(e.code!=='ENOENT')throw e;await write('manifest',manifest);}
 }
 return{config,entries,world:reference,foundation,write};
}
export async function runDepth(options=depthOptions(),{client}={}){
 if(options.help){console.log(depthHelp);return;}
 if(options.reopenAuthorization){await Promise.all(['base','candidate','foundation','manifest'].map(name=>fs.access(path.join(options.root,name+'.json'))));if(options.prepare){const prepared=await prepareDepth(options);await loadDepthReopen(options,prepared);const result={entries:prepared.entries.length,formalWrite:false,modelCalls:0};console.log(JSON.stringify(result));return result;}if(!options.id)throw Error('授权重开仅逐ID，请提供--id');const {runDepthReview}=await import('./npc-depth-review.mjs');return runDepthReview(options,{client});}
 const prepared=await prepareDepth(options),{config,entries,world,write}=prepared,{root,batch,budgetRoot}=options,revision=config.revision;
 if(options.controlledRevision)throw Error('受控修订仅通过npc-depth-review逐ID复审');
 const sourceEvidence=await prepareFirstSourceEvidence(options,prepared,e=>contextFor(e,world));
 if(options.prepare){console.log(JSON.stringify({entries:entries.length,formalWrite:false,modelCalls:0}));return;}
 if(!budgetRoot)throw Error('必须显式提供本批获授权的共用预算目录');
 if(!options.cardId)throw Error('必须显式提供稳定授权 --card T编号');
 const start=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));
 let allocation;try{allocation=JSON.parse(await fs.readFile(path.join(root,'allocation.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;const incrementLimitYuan=config.patchRows?config.incrementLimitYuan:batch==='yupo-depth-next'?.3:.8;if(!Number.isFinite(incrementLimitYuan)||incrementLimitYuan<=0)throw Error('新 design 须声明获授权 incrementLimitYuan');allocation={cardId:options.cardId,wave:config.patchRows?config.revision:batch==='yupo-depth-next'?'M4-shared':'W1',waveLimitYuan:20,startingSpentYuan:start.spentYuan,startingReservedYuan:start.reservedYuan??0,incrementLimitYuan};migrateDepthBudget(start,options.cardId,allocation);await write('allocation',allocation);}
 if(allocation.cardId&&allocation.cardId!==options.cardId)throw Error('allocation card 不匹配');
 if(!allocation.cardId){migrateDepthBudget(start,options.cardId,allocation);allocation.cardId=options.cardId;await write('allocation',allocation);}
 client??=new DeepSeekClient({budgetYuan:20,logFile:`logs/w1-${batch}-usage.jsonl`});
 try{const result=await runContentPipeline({entries,root,budgetRoot,client:depthReviewClient(client),cardId:options.cardId,allocation,reuseFrozenDrafts:options.reuseFrozenDrafts,protocolRecoveryIds:options.protocolRecoveryIds,contextFor:e=>contextFor(e,world),revision,buildDraftRequest,buildReviewRequest:options.compactRequest&&!sourceEvidence?(...args)=>compactReviewRequest(buildReviewRequest(...args)):buildReviewRequest,...(sourceEvidence?{requestTransform:sourceEvidence.transform}:{}),extractDraft,validateDraft,concurrency:config.patchRows?1:batch==='yupo-depth-next'?2:8,batchSize:25});await write('terminal',{status:'finished',summary:result.summary,budgetBefore:start,budgetAfter:result.summary.budget,card:result.summary.budget.cards[options.cardId]});console.log(JSON.stringify(result.summary));return result;}catch(e){const after=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));await write('terminal',{status:'error',error:e.message,budgetBefore:start,budgetAfter:after});throw e;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runDepth();
// One frozen source witness; current text is never unconditionally normalized.
export function frozenT07SourceText(source,raw,evidence,plan){
 assert.equal(plan.cardId,'T07','换行凭证仅适用于T07');
 assert.equal(hashContent(plan),'9c58016d9680c2ff5b11469648c8ed3d216d626aee4f7434b4815df8f538fcd6','换行凭证规划不匹配');
 assert.equal(evidence?.kind,'T07-source-checkout-evidence');
 assert.equal(evidence.planHash,hashContent(plan),'换行凭证规划不匹配');
 assert.equal(source.file,'../../../../design/w1-villages-weiting.mjs','换行凭证原文件不匹配');
 assert.equal(evidence.sourceFile,source.file,'换行凭证原文件不匹配');
 assert.equal(source.hash,'fe30d3629ee68eeabfd9883c0de60b80cf6a98a76af2653b92eb4248dea5032c','换行凭证原hash不匹配');
 assert.equal(evidence.originalHash,source.hash,'换行凭证原hash不匹配');
 const blob=evidence.gitBlob;
 assert.equal(blob?.oid,'b44d0f9aba78bb3e3d260ef45e75b726ccb49b34','换行凭证blob不匹配');
 assert.equal(blob.contentHash,'52b0149d0aceb7493e55fe6840821cb924aff4b826691e8426231b6a52a0ae4b','换行凭证LF hash不匹配');
 assert.ok(typeof blob.text==='string'&&!blob.text.includes('\r'),'换行凭证须为完整LF原文');
 assert.equal(hashContent(blob.text),blob.contentHash,'换行凭证原文已篡改');
 const bytes=Buffer.from(blob.text,'utf8'),oid=createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
 assert.equal(oid,blob.oid,'换行凭证Git对象不符');
 const original=blob.text.replace(/\n/g,'\r\n');
 assert.equal(hashContent(original),source.hash,'换行凭证不能重建原冻结字节');
 assert.ok(raw===blob.text||raw===original,'原来源字符或混合换行已改变');
 return original;
}
export function frozenDepthRecord(entry,context,revision){return{id:entry.id,fingerprint:hashContent({entry,context,revision}),status:'pending',attempts:0,draft:patchDraft(entry),review:null,errors:[],warnings:[],feedback:null,frozenCandidate:{entryHash:hashContent(entry),draftHash:hashContent(patchDraft(entry))}};}
// Match a saved record through its immutable prior chain, never through a new nonce.
export function recordHasHash(record,expected){
 if(hashContent(record)===expected)return true;
 return !!record?.reviewRecovery?.prior&&recordHasHash(record.reviewRecovery.prior,expected);
}
export async function loadDepthReopen(options,prepared){
 if(!options.reopenAuthorization)return null;
 const worldRoot=path.resolve(options.worldRoot??prepared.worldRoot??'world'),file=path.resolve(options.reopenAuthorization),relative=path.relative(worldRoot,file);
 if(relative.startsWith('..')||path.isAbsolute(relative)||!/\.json$/i.test(file)||/secrets\.json$/i.test(file))throw Error('重开授权须在world且非私人JSON');
 const manifest=JSON.parse(await fs.readFile(file,'utf8')),grant=validateReopenAuthorization(manifest,options.cardId),root=options.root;
 const read=async name=>JSON.parse(await fs.readFile(path.join(root,name),'utf8'));
 assert.equal(hashContent(prepared.foundation),grant.foundationHash,'授权原foundation不符');
 assert.equal(hashContent(await read('base.json')),grant.baseHash,'授权原base不符');assert.equal(hashContent(await read('candidate.json')),grant.candidateHash,'授权冻结候选不符');
 const proof=options.proofOverride!==undefined?options.proofOverride:await read('incremental-proof.json').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 let originalProof=proof;while(originalProof?.reopenAuthorization)originalProof=originalProof.previousProof;
 assert.equal(originalProof?hashContent(originalProof):null,grant.previousProofHash??null,'授权旧proof链不符');
 const safeSource=relative=>{const target=path.resolve(root,relative),rel=path.relative(worldRoot,target);assert.ok(!rel.startsWith('..')&&!path.isAbsolute(rel)&&!/secrets\.json$/i.test(target),'授权来源路径非法');return target;};
 for(const source of grant.sourceHashes){const target=safeSource(source.file),raw=await fs.readFile(target,'utf8');let value=/\.mjs$/i.test(target)?raw:JSON.parse(raw);
  if(options.cardId==='T07'&&/\.mjs$/i.test(target)&&originalProof?.sourceCheckoutEvidence){const checkout=JSON.parse(await fs.readFile(safeSource(originalProof.sourceCheckoutEvidence.file),'utf8')),oldPlan=JSON.parse(await fs.readFile(safeSource(originalProof.planFile),'utf8'));assert.equal(hashContent(checkout),originalProof.sourceCheckoutEvidence.hash,'原换行凭证hash改变');value=frozenT07SourceText(source,raw,checkout,oldPlan);}
  assert.equal(hashContent(value),source.hash,'授权原来源hash不符');
 }
 const records=options.bindingRecords??await Promise.all(prepared.foundation.entries.map(async entry=>{try{return await read(entry.id+'.json');}catch(e){if(e.code==='ENOENT')return null;throw e;}}));
 for(const item of grant.allowed){for(const finding of item.sourceFindings??[]){const source=prepared.world?.[finding.source.collection]?.find(s=>s.id===finding.source.id);assert.ok(source,'失效原来源不存在');const value=finding.source.field.split('.').reduce((o,k)=>o?.[k],source);assert.equal(hashContent(value),finding.source.valueHash,'失效原来源字段hash不符');}
 const record=records.find(r=>r?.id===item.id),oldEntry=prepared.foundation.entries.find(e=>e.id===item.id);assert.ok(oldEntry,'授权ID不在原foundation');
  if(item.recordHash)assert.ok(recordHasHash(record,item.recordHash),'授权旧完整record hash不符 '+item.id);
  else {assert.equal(item.missingRecord,true,'未审缺档未留证');assert.equal(item.entryHash,hashContent(oldEntry),'未审entry凭证不符');assert.ok(!record||recordHasHash(record,item.createdRecordHash),'缺档被未授权记录替换');}
 }
 return{manifest,grant,file:path.relative(root,file).replaceAll('\\','/'),manifestHash:hashContent(manifest)};
}
async function sourceWitnessPlan(root,plan,read,safeFile){
 if(!plan.previousPlanFile)return plan;
 const old=await read(safeFile(plan.previousPlanFile));assert.equal(hashContent(old),plan.previousPlanHash,'原源凭证规划hash改变');return sourceWitnessPlan(root,old,read,safeFile);
}
// A proof's old records are candidate history. They never supply world facts.
// Bind each draft to the frozen plan before replaying its permitted changes.
export async function replayDepthProof(foundation,proof,{readPlan,readCandidate}){
 const entries=foundation.entries.map(({context,...entry})=>structuredClone(entry));
 async function replay(current){
  if(current.previousProof){assert.equal(hashContent(current.previousProof),current.previousProofHash,'父proof hash改变');await replay(current.previousProof);}
  const plan=await readPlan(current.planFile);
  assert.equal(hashContent(plan),current.planHash,'父规划hash改变');assert.equal(current.authorizationHash,current.planHash,'父授权hash改变');
  assert.equal(current.foundationHash,hashContent(foundation),'父foundation hash改变');
  for(const item of plan.authorized){
   const record=current.oldRecords.find(r=>r.id===item.id),entry=entries.find(e=>e.id===item.id);
   assert.ok(record&&entry,'父basis缺完整record');assert.equal(hashContent(record),item.recordHash,'父basis record hash改变');
   assert.equal(hashContent(record.draft),item.draftHash,'父basis draft hash改变');
   if(current.reopenAuthorization){
    const draft=record.draft??(await readCandidate?.())?.find(d=>d.id===entry.id);
    assert.ok(draft,'父basis缺冻结draft/candidate');
    if(!record.draft)assert.equal(hashContent(draft),item.candidateDraftHash,'父basis冻结candidate hash改变');
    assert.equal(draft.id,entry.id,'父basis ID改变');
    assert.deepEqual(draft.patches.map(p=>p.path),entry.patches.map(p=>p.path),'父basis路径改变');
    entry.patches=structuredClone(draft.patches);
   }
  }
  for(const change of current.changes){
   const item=plan.authorized.find(a=>a.id===change.id),patch=entries.find(e=>e.id===change.id)?.patches.find(p=>p.path===change.path);
   assert.ok(item?.paths.includes(change.path)&&patch,'父proof越权叶');assert.deepEqual(patch.value,change.before,'父proof before不符');patch.value=structuredClone(change.after);
  }
 }
 await replay(proof);for(const entry of entries)entry.facts=applyDepthDraft(entry.before,patchDraft(entry));return entries;
}
export function depthRevisionProof(options,prepared,reopenAuthorization){
 const {root}=options;
 return prepared.receipt??{kind:'incremental-depth-proof',authorizationHash:options.authorizationHash,planHash:hashContent(prepared.plan),planFile:path.relative(root,options.controlledRevision).replaceAll('\\','/'),worldRoot:path.relative(root,prepared.worldRoot).replaceAll('\\','/'),backgroundFile:options.authoredBackground?path.relative(root,options.authoredBackground).replaceAll('\\','/'):null,backgroundHash:prepared.background?.sourceHash??null,foundationHash:hashContent(prepared.foundation),entryHash:hashContent(prepared.entries),oldRecords:prepared.records,changes:prepared.revision.changes,records:{},...(prepared.sourceCheckoutEvidence?{sourceCheckoutEvidence:prepared.sourceCheckoutEvidence}:{}),...(prepared.reopening?{reopenAuthorization,previousProof:prepared.previousProof??null,previousProofHash:prepared.previousProof?hashContent(prepared.previousProof):null}:{})};
}
async function sourceAuthorization(plan,reopening,records,previousPrepared,background,read,safeFile){
 if(!plan.sourceAuthorization)return reopening;
 assert.ok(reopening&&plan.cardId==='T07','来源凭证仅用于原T07重开');
 const credential=await read(safeFile(plan.sourceAuthorization.file));
 assert.equal(hashContent(credential),plan.sourceAuthorization.hash,'来源凭证hash改变');
 assert.deepEqual(Object.keys(credential).sort(),['kind','cardId','authorizationId','parentManifestHash','parentGrantHash','source','allowed'].sort(),'来源凭证字段越权');
 assert.equal(credential.kind,'depth-source-authorization');assert.equal(credential.cardId,plan.cardId);assert.equal(credential.authorizationId,reopening.manifest.id);
 assert.equal(credential.parentManifestHash,reopening.manifestHash,'来源凭证祖先manifest改变');assert.equal(credential.parentGrantHash,hashContent(reopening.grant),'来源凭证父grant改变');
 const binding=credential.source;assert.equal(binding.eventId,'memory_wt_depth_group_3','来源凭证事件越权');assert.equal(binding.path,'narrative','来源凭证pointer越权');
 assert.deepEqual(Object.keys(binding).sort(),['eventId','path','beforeHash','afterHash'].sort(),'来源pointer字段越权');
 const prior=previousPrepared?.background.events.find(e=>e.id===binding.eventId),next=background?.events.find(e=>e.id===binding.eventId);assert.ok(prior&&next,'来源凭证缺父事件');
 assert.equal(hashContent(prior.narrative),binding.beforeHash,'来源凭证before改变');assert.equal(hashContent(next.narrative),binding.afterHash,'来源凭证after改变');
 assert.deepEqual({...next,narrative:prior.narrative},prior,'来源凭证只授权narrative');
 const {sourceHash,...oldBundle}=previousPrepared.background;
 assert.deepEqual({...background,events:background.events.map(e=>e.id===next.id?prior:e)},oldBundle,'来源凭证不得扩其它事件');
 assert.deepEqual(credential.allowed.map(a=>a.id).sort(),[...prior.actors].sort(),'来源凭证四方ID越权或缺失');
 for(const permission of credential.allowed){
  assert.deepEqual(Object.keys(permission).sort(),['id','paths','recordHash'].sort(),'来源权限字段越权');
  assert.deepEqual(permission.paths,['memorySeeds[2]'],'来源权限叶越权');
  assert.equal(prior.associations.find(a=>a.id===permission.id)?.path,permission.paths[0],'来源权限不是事件父叶');
  const original=reopening.grant.allowed.find(a=>a.id===permission.id),record=records.find(r=>r.id===permission.id);
  assert.equal(permission.recordHash,original?.recordHash,'来源权限原record绑定改变');assert.ok(recordHasHash(record,permission.recordHash),'来源权限原record链改变');
 }
 return{...reopening,sourcePermissions:credential.allowed};
}
export async function prepareDepthRevision({worldRoot=path.resolve('world'),...options}){
 const read=async file=>JSON.parse(await fs.readFile(file,'utf8')),root=options.root;
 for(const file of [options.controlledRevision,options.authoredBackground,options.sourceCheckoutEvidence].filter(Boolean)){const relative=path.relative(path.resolve(worldRoot),path.resolve(file));if(relative.startsWith('..')||path.isAbsolute(relative)||/secrets\.json$/i.test(file))throw Error('增量出处/规划须在world且非私人文件');}
 const plan=await read(options.controlledRevision);
 if(options.cardId&&options.cardId!==plan.cardId)throw Error('规划card与原card不匹配');
 const foundation=await read(path.join(root,'foundation.json')),base=await read(path.join(root,'base.json')),candidate=await read(path.join(root,'candidate.json'));
 const config=await loadDepthConfig(options);if(config.revision!==foundation.revision)throw Error('不得换revision领取机会');const live=await loadWorld(worldRoot),world={...live,npcs:live.npcs.map(n=>base.find(b=>b.id===n.id)??n)};let entries=options.entriesOverride??depthEntries(base,{...config,authoredBackground:undefined},world);
 const safeFile=relative=>{const file=path.resolve(root,relative),rel=path.relative(path.resolve(worldRoot),file);if(path.isAbsolute(rel)||rel.startsWith('..')||!/\.(json|mjs)$/i.test(file)||/secrets\.json$/i.test(file))throw Error('凭证路径须位于world且非私人文件');return file;};
 let checkout=null,sourceCheckoutEvidence=null;
 if(options.sourceCheckoutEvidence){const file=safeFile(path.relative(root,options.sourceCheckoutEvidence));assert.ok(file.endsWith('.json'),'换行凭证须为world内JSON');checkout=await read(file);sourceCheckoutEvidence={file:path.relative(root,file).replaceAll('\\','/'),hash:hashContent(checkout)};const source=plan.sourceHashes?.find(s=>s.file===checkout.sourceFile);assert.ok(source,'换行凭证不是本规划原来源');frozenT07SourceText(source,checkout.gitBlob?.text,checkout,await sourceWitnessPlan(root,plan,read,safeFile));}
 const sourceHashes=[],frozenSources={};for(const source of plan.sourceHashes??[]){const file=safeFile(source.file);let data;if(/\.mjs$/i.test(file)){if(path.relative(path.resolve(worldRoot),file).replaceAll('\\','/')!=='design/w1-villages-weiting.mjs')throw Error('本次名册出处须为原苇汀设计，候选不得当源');let raw=await fs.readFile(file,'utf8');if(checkout)raw=frozenT07SourceText(source,raw,checkout,await sourceWitnessPlan(root,plan,read,safeFile));sourceHashes.push({...source,hash:hashContent(raw)});const roster=raw.match(/export const weitingRoster\s*=\s*`([\s\S]*?)`/);if(roster)frozenSources[source.file]=roster[1].trim().split(/\r?\n/).map(line=>line.split('|')).map(row=>{const people=[...(world.npcs??[]),...(world.residents??[])].filter(p=>p.id.endsWith('_'+row[1])&&p.name===row[2]);return{id:people.length===1?people[0].id:null,name:row[2],concern:row[7]};});}else{data=await read(file);sourceHashes.push({...source,hash:hashContent(data)});}}
 const invalidations=plan.invalidationFile?await read(safeFile(plan.invalidationFile)):null;
 let receipt=options.proofOverride??null;if(options.proofOverride===undefined)try{receipt=await read(path.join(root,'incremental-proof.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
 let reopening=options.reopenAuthorization?await loadDepthReopen({...options,worldRoot},{foundation,worldRoot,world}):null;
 let previousProof=null,previousPrepared=null;
 if(reopening){previousProof=receipt?.authorizationHash===options.authorizationHash?receipt.previousProof:receipt;if(receipt?.authorizationHash!==options.authorizationHash)receipt=null;
  assert.equal(plan.previousProofHash??null,previousProof?hashContent(previousProof):null,'新proof必须继承实际旧链');
  if(previousProof?.backgroundFile&&!options.authoredBackground)throw Error('继承旧proof须保留原独立背景');
  if(previousProof){const oldEntries=await replayDepthProof(foundation,previousProof,{readPlan:file=>read(safeFile(file)),readCandidate:async()=>candidate});previousPrepared=await prepareDepthRevision({...options,worldRoot,entriesOverride:oldEntries,controlledRevision:safeFile(previousProof.planFile),authorizationHash:previousProof.authorizationHash,authoredBackground:previousProof.backgroundFile?safeFile(previousProof.backgroundFile):undefined,sourceCheckoutEvidence:previousProof.sourceCheckoutEvidence?safeFile(previousProof.sourceCheckoutEvidence.file):undefined,reopenAuthorization:previousProof.reopenAuthorization?safeFile(previousProof.reopenAuthorization.file):undefined,proofOverride:previousProof});}
 }
 if(receipt&&(receipt.authorizationHash!==options.authorizationHash||receipt.planHash!==hashContent(plan)))throw Error('本次规划已冻结，不得换nonce重领');
 if(receipt&&!options.entriesOverride)entries=await replayDepthProof(foundation,receipt,{readPlan:file=>read(safeFile(file)),readCandidate:async()=>candidate});
 if(receipt&&(receipt.sourceCheckoutEvidence||sourceCheckoutEvidence))assert.deepEqual(receipt.sourceCheckoutEvidence,sourceCheckoutEvidence,'换行凭证收据路径/hash改变或缺失');
 // Bind metadata to the actual parent before validating leaf permissions. A
 // bundle hash changing does not invalidate entries whose events did not change.
 for(const entry of entries){const prior=previousPrepared?.entries.find(e=>e.id===entry.id)??foundation.entries.find(e=>e.id===entry.id);if(prior.authoredBackground)entry.authoredBackground=structuredClone(prior.authoredBackground);else delete entry.authoredBackground;}
 const records=await Promise.all(foundation.entries.map(async e=>receipt?.oldRecords?.find(r=>r.id===e.id)??await read(path.join(root,e.id+'.json'))));
 const backgroundBundle=options.authoredBackground?await read(options.authoredBackground):null;
 reopening=await sourceAuthorization(plan,reopening,records,previousPrepared,backgroundBundle,read,safeFile);
 const revision=validateControlledRevision(plan,{entries,foundation,records,world,candidate,base,invalidations,authorizationHash:options.authorizationHash,sourceHashes,frozenSources,reopen:reopening,previousEntries:previousPrepared?.entries});
 const background=backgroundBundle?validateAuthoredBackground(backgroundBundle,entries,world):null;
 if(background){
  const parentBackground=previousPrepared?.background??foundation.entries.find(e=>e.authoredBackground)?.authoredBackground;
  const changed=parentBackground?background.events.filter(event=>hashContent(event)!==hashContent(parentBackground.events.find(e=>e.id===event.id))):background.events;
  if(parentBackground){
   assert.deepEqual(background.events.map(e=>e.id),parentBackground.events.map(e=>e.id),'继承来源不得增删事件');
   for(const event of changed){
    const prior=parentBackground.events.find(e=>e.id===event.id);assert.deepEqual(event.actors,prior.actors,'继承来源不得改变参与者');
    for(const id of event.actors){const permission=plan.authorized.find(a=>a.id===id),association=event.associations.find(a=>a.id===id);assert.ok(permission&&(permission.paths.includes(association.path)||permission.sourceOnly),'来源修订参与者缺授权 '+id);}
   }
  }
  for(const entry of entries)if(changed.some(e=>e.actors.includes(entry.id)))entry.authoredBackground=background;
 }
 if(receipt){if(receipt.entryHash!==hashContent(entries)||receipt.backgroundHash!==(background?.sourceHash??null))throw Error('本次新候选/出处已冻结');}
 const contexts=new Map(entries.map(entry=>{
  const parentContext=previousPrepared?.contexts.get(entry.id);let context=parentContext??contextFor(entry,world);
  if(parentContext){
   context={...context,revisions:context.revisions.map(r=>({...r,after:structuredClone(entry.patches.find(p=>p.path===r.path).value)}))};
   if(entry.authoredBackground?.sourceHash!==parentContext.authoredBackground?.sourceHash){const next=authoredReviewContext(context,entry.authoredBackground,entry,world);context={...context,authoredBackground:next.authoredBackground};}
  }
  if(plan.authorized.some(a=>a.id===entry.id))context={...context,controlledRevision:{planningId:plan.planningId,authorizationHash:options.authorizationHash,changes:revision.changes.filter(c=>c.id===entry.id)}};return[entry.id,context];
 }));
 return{config,entries,world,foundation,plan,records,background,contexts,receipt,revision,sourceHashes,worldRoot,reopening,previousProof,...(sourceCheckoutEvidence?{sourceCheckoutEvidence}:{})};
}
