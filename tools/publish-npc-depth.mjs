import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadWorld} from './load-world.mjs';
import {hashContent,readApprovedContent} from './content-pipeline.mjs';
import {depthEntries,contextFor,patchDraft,applyDepthDraft,validateDraft,validatePatchResults,checkIncrementalReview} from './npc-depth-content.mjs';
import {loadDepthConfig,depthFoundation,prepareDepthRevision} from './npc-depth.mjs';
import assert from 'node:assert/strict';
export const publishDepthHelp='publish-npc-depth --manifest <候选目录/manifest.json> [--publish]\n默认只预演；--publish 校验冻结原档、失败路径、L1/L2/L4和哈希后写 world/people/baseline.json。';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
export async function publishNpcDepth({manifest,publish=false,worldRoot}={}){
 if(!manifest)throw Error('需要 --manifest');
 const plan=typeof manifest==='string'?await read(manifest):manifest;assert.equal(plan.contract,'audit-patch-v1','不支持的发布合同');
 const anchor=typeof manifest==='string'?path.dirname(path.resolve(manifest)):process.cwd(),target=path.resolve(worldRoot??path.resolve(anchor,plan.worldRoot)),root=path.resolve(target,plan.root),design=path.resolve(target,plan.design);
 for(const file of [root,design]){const relative=path.relative(target,file);assert.ok(!relative.startsWith('..')&&!path.isAbsolute(relative),'清单路径须位于 world/ 内');}
 let config=await loadDepthConfig({design});if(plan.authoredBackground){const source=path.resolve(target,plan.authoredBackground);assert.ok(!path.relative(target,source).startsWith('..')&&!/secrets\.json$/i.test(source),'作者出处路径非法');const bundle=await read(source);assert.equal(hashContent(bundle),plan.authoredBackgroundHash,'新出处hash过期');config={...config,authoredBackground:bundle};}const world=await loadWorld(target),base=await read(path.join(root,'base.json'));
 const reference={...world,npcs:world.npcs.map(n=>base.find(b=>b.id===n.id)??n)};let entries=depthEntries(base,config,reference),foundation=depthFoundation(entries,reference,config.revision),incremental=null;
 try{incremental=await read(path.join(root,'incremental-proof.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(incremental){const prepared=await prepareDepthRevision({design,root,worldRoot:target,controlledRevision:path.resolve(root,incremental.planFile),authorizationHash:incremental.authorizationHash,authoredBackground:incremental.backgroundFile?path.resolve(root,incremental.backgroundFile):undefined});entries=prepared.entries;foundation=prepared.foundation;incremental={...incremental,prepared};}
 assert.equal(hashContent(foundation),plan.foundationHash,'发布清单骨架指纹已过期');assert.equal(hashContent(await read(path.join(root,'foundation.json'))),hashContent(foundation),'冻结骨架或引用事实已改变');
 if(!incremental)assert.deepEqual(await read(path.join(root,'candidate.json')),entries.map(patchDraft),'冻结候选已篡改');
 const reviewContext=e=>incremental?.prepared.contexts.get(e.id)??contextFor(e,reference);
 const drafts=await readApprovedContent(root,entries,{contextFor:reviewContext,revision:config.revision});assert.equal(drafts.length,entries.length,'并非所有人物均已审核通过');
 const summary=await read(path.join(root,'summary.json')),covered=[];
 for(const batch of summary.batches){
  const current=await read(path.join(root,`batch-${batch.index}.json`));assert.deepEqual(current.ids,batch.ids,'审核批次成员已改变');
  for(const id of current.ids){covered.push(id);const record=await read(path.join(root,`${id}.json`)),note=current.l4.notes.find(n=>n.id===id);assert.equal(note?.draftHash,hashContent(record.draft),'L4候选指纹已改变');assert.equal(note?.reviewHash,hashContent(record.review),'L4审核指纹已改变');}
 }
 assert.deepEqual(covered.sort(),entries.map(e=>e.id).sort(),'审核覆盖成员与设计不符');
 let extraL4=null;if(incremental||entries.some(e=>e.authoredBackground)){extraL4=await read(path.join(root,'incremental-l4.json'));assert.equal(extraL4.authorizationHash,incremental?.authorizationHash??null,'新L4规划hash不符');assert.equal(extraL4.sourceHash,entries.find(e=>e.authoredBackground)?.authoredBackground.sourceHash??null,'新L4出处hash不符');}
 for(const entry of entries){const context=reviewContext(entry);if(context.authoredBackground||context.controlledRevision){const record=await read(path.join(root,entry.id+'.json'));const issues=checkIncrementalReview(record.review,entry,context);assert.ok(!issues.some(c=>c.severity==='hard'),'出处或候选L2存在硬错');const note=extraL4.candidates.find(n=>n.id===entry.id);assert.equal(note?.draftHash,hashContent(record.draft),'新L4候选hash已过期');assert.equal(note?.reviewHash,hashContent(record.review),'新L4审核hash已过期');assert.equal(note?.entryHash,hashContent(entry),'新L4 entry hash不符');assert.ok(note.note?.trim(),'缺新L4阅读');assert.deepEqual([...(note.reviewedPaths??[])].sort(),entry.patches.map(p=>p.path).sort(),'新L4漏审叶子');if(context.authoredBackground)for(const event of context.authoredBackground.events){const sourceNote=extraL4.backgrounds.find(n=>n.eventId===event.id);assert.equal(sourceNote?.sourceHash,context.authoredBackground.sourceHash,'缺出处L4');assert.equal(sourceNote?.eventHash,hashContent(entry.authoredBackground.events.find(e=>e.id===event.id)),'出处L4事件hash已过期');assert.ok(sourceNote.note?.trim(),'缺出处L4阅读');assert.deepEqual([...(sourceNote.reviewedRiskPaths??[])].sort(),event.risks.map(r=>`${r.id}.${r.field}`).sort(),'出处L4漏审风险');}if(context.controlledRevision){assert.equal(record.incremental?.authorizationHash,incremental.authorizationHash,'缺受控修订凭证');assert.equal(record.reviewRecovery?.status,'passed-L1-L2','缺新L2');assert.equal(record.reviewRecovery.requestHash,hashContent(record.reviewRecovery.request),'新L2请求hash不符');assert.equal(hashContent(record.reviewRecovery.prior),record.incremental.originalRecordHash,'旧record证据改变');}}const draft=drafts.find(d=>d.id===entry.id),check=validateDraft(draft,entry);assert.deepEqual(check.errors,[],'L1修订失败');}
 validatePatchResults(entries,reference);
 // Freeze identity and every qualified sibling; only operational stock/cash may differ.
 const next=world.npcs.map(current=>{
  const entry=entries.find(e=>e.id===current.id);if(!entry)return current;
  const scrub=n=>{const out=structuredClone(n);delete out.coins;delete out.inventory;return out;};
  assert.ok(hashContent(scrub(current))===hashContent(scrub(entry.before))||hashContent(scrub(current))===hashContent(scrub(entry.facts)),`人物补丁冲突或原档已过期 ${current.id}`);
  return applyDepthDraft(current,drafts.find(d=>d.id===current.id));
 });
 const changed=hashContent(world.npcs)!==hashContent(next)?['people/baseline.json']:[];
 if(publish&&changed.length){const file=path.join(target,changed[0]),temp=`${file}.${process.pid}.tmp`;await fs.writeFile(temp,JSON.stringify(next,null,2)+'\n');await fs.rename(temp,file);}
 return{published:publish,changed,amendedNpcIds:entries.map(e=>e.id),modelCalls:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv.includes('--help'))console.log(publishDepthHelp);
 else{const at=process.argv.indexOf('--manifest');if(at<0||!process.argv[at+1])throw Error('需要 --manifest');console.log(JSON.stringify(await publishNpcDepth({manifest:process.argv[at+1],publish:process.argv.includes('--publish')})));}
}
