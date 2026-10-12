import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {completeOptions} from '../prepare-complete.mjs';
import {prepareDepthRevision} from '../../../../../../tools/npc-depth.mjs';
import {patchDraft,depthEntries,validateAuthoredBackground,validatePatchResults} from '../../../../../../tools/npc-depth-content.mjs';
import {hashContent} from '../../../../../../tools/content-pipeline.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),read=file=>fs.readFile(file,'utf8').then(JSON.parse),write=(file,data)=>fs.writeFile(path.join(here,file),JSON.stringify(data,null,2)+'\n');
const options=await completeOptions(),prepared=await prepareDepthRevision(options),currentProof=await read(path.join(options.root,'incremental-proof.json'));
const background=await read(options.authoredBackground),next=structuredClone(background),event=next.events.find(e=>e.id==='memory_wt_depth_group_3');
const oldNarrative=event.narrative;
event.narrative='湛鸥、支采、薛萤和雷芷在汀口记事屋前谈过各自劳动中的待问事项。湛鸥只解释退水便道要核对水位，支采只说明补衣交还次序还需逐户询问，薛萤只谈自家门边旧根要整理，雷芷只提含混称呼需要辨清户别，没有提客户身份或口信内容。四人没有排定交还次序，家人与物主的意见仍待各自询问。';
const rows=prepared.entries.map(({context,authoredBackground,facts,contract,...row})=>structuredClone(row)),changes=[];
for(const actor of event.actors){const row=rows.find(r=>r.id===actor),patch=row.patches.find(p=>p.value?.id===event.id);changes.push({id:actor,path:patch.path,before:structuredClone(patch.value),after:{...patch.value,event:event.narrative},providerField:'memorySeeds[2].event',reason:'依原publicSpeech收窄四方话题，不说两户催先拿、客户身份或口信内容，其他共享事实/参与者/风险字段不变。'});patch.value=changes.at(-1).after;}
const config={revision:prepared.config.revision,incrementLimitYuan:3,patchRows:rows},entries=depthEntries(rows.map(r=>r.before),config,prepared.world);
validateAuthoredBackground(next,entries,prepared.world);validatePatchResults(entries,prepared.world);
const permission=prepared.reopening.grant.allowed.find(r=>r.id==='npc_wt_zhangou'),actual=await read(path.join(options.root,'npc_wt_zhangou.json'));
const lateFailures=actual.review.contradictions.filter(f=>f.severity==='hard').flatMap(f=>(permission.failurePaths??[]).filter(p=>p===f.field||p.startsWith(f.field+'[')||p.startsWith(f.field+'.')));
const allRecords=await Promise.all(entries.map(e=>read(path.join(options.root,e.id+'.json'))));
const plan={...structuredClone(prepared.plan),status:'proposed-shared-repair-not-authorized',previousPlanFile:path.relative(options.root,options.controlledRevision).replaceAll('\\','/'),previousPlanHash:options.authorizationHash,previousProofHash:hashContent(currentProof),authorized:prepared.plan.authorized.map(a=>{
 const r=allRecords.find(r=>r.id===a.id),entry=entries.find(e=>e.id===a.id),paths=entry.patches.filter(p=>hashContent(p.value)!==hashContent(r.draft.patches.find(o=>o.path===p.path).value)).map(p=>p.path);
 return{...a,recordHash:hashContent(r),draftHash:hashContent(r.draft),reviewHash:hashContent(r.review),paths,sourceOnly:paths.length===0,invalidationSources:[]};
})};
delete plan.invalidationFile;delete plan.invalidationHash;
await write('shared-repair-diff.json',changes);await write('shared-repair-background.json',next);await write('shared-repair-candidate.json',entries.map(patchDraft));await write('shared-repair-plan.json',plan);
await fs.writeFile(path.join(here,'shared-repair-design.mjs'),"import fs from 'node:fs';\nconst rows=JSON.parse(fs.readFileSync(new URL('./shared-repair-rows.json',import.meta.url),'utf8'));\nexport const revision="+JSON.stringify(config.revision)+";\nexport const incrementLimitYuan=3;\nexport const patchRows=rows;\n");await write('shared-repair-rows.json',rows);
let guard;try{await prepareDepthRevision({...options,design:path.join(here,'shared-repair-design.mjs'),controlledRevision:path.join(here,'shared-repair-plan.json'),authoredBackground:path.join(here,'shared-repair-background.json'),authorizationHash:hashContent(plan)});throw Error('本提议不应通过未授予的共享叶权限');}catch(error){assert.match(error.message,/未授权重开叶|正确兄弟叶不得修改/);guard=error.message;}
const report={status:'zero-model-shared-repair-permission-blocked',authorizationId:prepared.plan.authorizationId,originalAuthorizationHash:options.authorizationHash,previousProofHash:hashContent(currentProof),originalNarrative:oldNarrative,proposedNarrative:event.narrative,actors:event.actors,changes:changes.map(({id,path})=>({id,path})),actualHardFields:actual.review.contradictions.filter(f=>f.severity==='hard').map(f=>f.field),failurePaths:permission.failurePaths,lateFailures,permission:{grantPaths:permission.paths,neededPatch:'memorySeeds[2]',sameAuthorizationMaxAttempts:prepared.reopening.grant.maxAttempts},guard,newModelCalls:0,sourceRefsUnchanged:true,risksUnchanged:true,authorSourceNotApproved:true,requires:'沿原授权/原账追加经主会话核验的四方共享memorySeeds[2]权限，保留本次provider子字段hard原文；不能手改冻结manifest。此处只提议，不领取第二次或尝试继续17人。',recordedAt:new Date().toISOString()};
await write('shared-repair-guard.json',report);console.log(JSON.stringify(report));
