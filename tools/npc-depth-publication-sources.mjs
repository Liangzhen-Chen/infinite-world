import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {hashContent} from './content-pipeline.mjs';
import {prepareNpcDepthBatch,prepareNpcDepth,publishNpcDepth} from './publish-npc-depth.mjs';
import {applyDepthDraft} from './npc-depth-content.mjs';
import {applyPublishedNpcAmendments} from './npc-publication-sources.mjs';

const receipts=new WeakMap();
const same=(a,b)=>hashContent(a??null)===hashContent(b??null);
const stable=n=>{const out=structuredClone(n);delete out.coins;delete out.inventory;delete out.memorySeeds;return out;};
export async function readPublishedNpcDepth({world,worldRoot=path.resolve('world'),includeVillages=false}={}){
 const root=path.resolve(worldRoot),batchManifest=path.join(root,'drafts/w1/depth-publication.json');
 const plan=JSON.parse(await fs.readFile(batchManifest,'utf8'));
 assert.equal(path.resolve(path.dirname(batchManifest),plan.worldRoot),root,'深度发布凭证世界根不符');
 // The real publisher checks complete cards, every L1/L2/L4 hash and event closure.
 const prepared=await prepareNpcDepthBatch({batchManifest});
 assert.deepEqual(prepared.preview.changed,[],'深度补丁尚未正式发布');
 assert.deepEqual(JSON.parse(await fs.readFile(batchManifest,'utf8')),plan,'深度批清单在核验期间已改变');
 const revisions=new Map(),manifests=[...plan.manifests],expectedIds=[...prepared.preview.amendedNpcIds];
 for(const relative of includeVillages?['drafts/w1/yp-depth-rest/reopen/publication-manifest.json','drafts/w1/wt-depth/sourced/manifest.json','drafts/w1/lq-depth/author-v2/first-review/manifest.json','drafts/w1/sb-depth/first-review/manifest.json']:[]){
  const manifest=path.join(root,relative);if(!await fs.access(manifest).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;}))continue;
  const preview=await publishNpcDepth({manifest});assert.deepEqual(preview.changed,[],'后续村庄深度尚未发布');manifests.push(relative);expectedIds.push(...preview.amendedNpcIds);
 }
 for(const relative of manifests){
  const card=await prepareNpcDepth({manifest:path.join(root,relative),worldRoot:root,world});
  for(const entry of card.entries){
   const after=applyPublishedNpcAmendments(applyDepthDraft(entry.before,card.drafts.find(d=>d.id===entry.id)),card.amendments),current=world.npcs.find(n=>n.id===entry.id);
   if(card.residence?.id===entry.id){const fields=card.residence.after;for(const key of ['settlement','householdId','household'])after[key]=structuredClone(fields[key]);after.home.location=fields.homeLocation;}
   assert.ok(same(stable(current),stable(after))&&same(current.memorySeeds.slice(0,after.memorySeeds.length),after.memorySeeds),`已发布深度补丁与当前世界不符:${entry.id}`);
   revisions.set(entry.id,{before:structuredClone(entry.before),after});
  }
 }
 assert.deepEqual([...revisions.keys()].sort(),expectedIds.sort(),'深度发布凭证成员漂移');
 assert.deepEqual(JSON.parse(await fs.readFile(batchManifest,'utf8')),plan,'深度批清单在核验期间已改变');
 const receipt=Object.freeze({worldRoot:root});
 receipts.set(receipt,{binding:hashContent(world.npcs),revisions});
 return receipt;
}
export function verifiedNpcDepth(receipt,current){
 if(receipt===undefined)return new Map();
 const record=receipts.get(receipt);assert.ok(record,'深度发布凭证无效');
 assert.equal(hashContent(current),record.binding,'深度发布凭证与当前世界不符');
 return structuredClone(record.revisions);
}
export function reviewedDepthField(revision,current,expected,key){
 if(!revision||!same(revision.before[key],expected))return false;
 return key==='memorySeeds'?same(current[key]?.slice(0,revision.after[key].length),revision.after[key]):same(current[key],revision.after[key]);
}
export function reviewedDepthPerson(revision,current,expected){
 return !!revision&&same(stable(revision.before),stable(expected))&&same(revision.before.memorySeeds,expected.memorySeeds)
  &&same(stable(current),stable(revision.after))&&same(current.memorySeeds.slice(0,revision.after.memorySeeds.length),revision.after.memorySeeds);
}
