import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadWorld} from './load-world.mjs';
import {hashContent,readApprovedContent} from './content-pipeline.mjs';
import {depthEntries,contextFor,patchDraft,applyDepthDraft,validateDraft,validatePatchResults} from './npc-depth-content.mjs';
import {loadDepthConfig,depthFoundation} from './npc-depth.mjs';
import assert from 'node:assert/strict';
export const publishDepthHelp='publish-npc-depth --manifest <候选目录/manifest.json> [--publish]\n默认只预演；--publish 校验冻结原档、失败路径、L1/L2/L4和哈希后写 world/people/baseline.json。';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
export async function publishNpcDepth({manifest,publish=false,worldRoot}={}){
 if(!manifest)throw Error('需要 --manifest');
 const plan=typeof manifest==='string'?await read(manifest):manifest;assert.equal(plan.contract,'audit-patch-v1','不支持的发布合同');
 const anchor=typeof manifest==='string'?path.dirname(path.resolve(manifest)):process.cwd(),target=path.resolve(worldRoot??path.resolve(anchor,plan.worldRoot)),root=path.resolve(target,plan.root),design=path.resolve(target,plan.design);
 for(const file of [root,design]){const relative=path.relative(target,file);assert.ok(!relative.startsWith('..')&&!path.isAbsolute(relative),'清单路径须位于 world/ 内');}
 const config=await loadDepthConfig({design}),world=await loadWorld(target),base=await read(path.join(root,'base.json'));
 const reference={...world,npcs:world.npcs.map(n=>base.find(b=>b.id===n.id)??n)},entries=depthEntries(base,config,reference),foundation=depthFoundation(entries,reference,config.revision);
 assert.equal(hashContent(foundation),plan.foundationHash,'发布清单骨架指纹已过期');assert.equal(hashContent(await read(path.join(root,'foundation.json'))),hashContent(foundation),'冻结骨架或引用事实已改变');
 assert.deepEqual(await read(path.join(root,'candidate.json')),entries.map(patchDraft),'冻结候选已篡改');
 const drafts=await readApprovedContent(root,entries,{contextFor:e=>contextFor(e,reference),revision:config.revision});assert.equal(drafts.length,entries.length,'并非所有人物均已审核通过');
 const summary=await read(path.join(root,'summary.json')),covered=[];
 for(const batch of summary.batches){
  const current=await read(path.join(root,`batch-${batch.index}.json`));assert.deepEqual(current.ids,batch.ids,'审核批次成员已改变');
  for(const id of current.ids){covered.push(id);const record=await read(path.join(root,`${id}.json`)),note=current.l4.notes.find(n=>n.id===id);assert.equal(note?.draftHash,hashContent(record.draft),'L4候选指纹已改变');assert.equal(note?.reviewHash,hashContent(record.review),'L4审核指纹已改变');}
 }
 assert.deepEqual(covered.sort(),entries.map(e=>e.id).sort(),'审核覆盖成员与设计不符');
 for(const entry of entries){const draft=drafts.find(d=>d.id===entry.id),check=validateDraft(draft,entry);assert.deepEqual(check.errors,[],'L1修订失败');}
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
