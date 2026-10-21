import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {hashContent,readApprovedContent} from './content-pipeline.mjs';
import {w1VillagesFoundation,villageFacts} from '../world/design/w1-villages.mjs';
import {contextFor,revision,applyProse,projectRoster,projectLocation,validateDraft,validateFoundation,validateProseSimilarity} from './w1-villages-content.mjs';
import {atomicJSON} from '../server-plugin/storage.mjs';
import {applyKnowledgeWordingCorrections} from '../world/design/w1-yupo-depth.mjs';
import {depthBatches,depthEntries,contextFor as depthContext,applyDepthDraft,validateDraft as validateDepthDraft,verifyUnchanged} from './npc-depth-content.mjs';
import {withVillageLedgerRules,previousProfileHashes} from '../world/design/w1-village-profiles.mjs';
import {approvedProfiles} from './w1-village-profiles-content.mjs';
import {readPublishedNpcDepth,verifiedNpcDepth,reviewedDepthPerson} from './npc-depth-publication-sources.mjs';

const merge=(old,rows)=>{const map=new Map(old.map(x=>[x.id,x]));for(const row of rows){if(map.has(row.id)&&hashContent(map.get(row.id))!==hashContent(row))throw Error(`已发布条目冲突：${row.id}`);map.set(row.id,row);}return [...map.values()];};
export function villagesOriginalWorld(world,foundation=w1VillagesFoundation()){
 const own=new Set([...foundation.npcs,...foundation.residents,...foundation.locations,...foundation.routes,...foundation.households,...foundation.settlements].map(x=>x.id));
 const next={...world,...Object.fromEntries(['npcs','residents','locations','routes','households','settlementProfiles'].map(k=>[k,(world[k]??[]).filter(x=>!own.has(x.id))]))};
 // U10 life-magic regulation is a settlement's own policy and leaves with it.
 const regulation=world.rules?.magicEconomy?.regulation;
 if(regulation?.some(g=>own.has(g.settlement)))next.rules={...world.rules,magicEconomy:{...world.rules.magicEconomy,regulation:regulation.filter(g=>!own.has(g.settlement))}};
 return next;
}
export function mergeVillages(world,candidate,{npcAmendments=[],profileAmendments=[],depthReceipt=undefined}={}){
 const revisions=verifiedNpcDepth(depthReceipt,world.npcs);
 const amended=new Map(npcAmendments.map(row=>[row.id,row]));
 if(amended.size!==npcAmendments.length)throw Error('人物补充编号重复');
 const current=new Map(world.npcs.map(n=>[n.id,n]));
 for(const [id,after]of amended){
  const before=candidate.npcs.find(n=>n.id===id);if(!before)throw Error(`人物补充不在原候选：${id}`);
  verifyUnchanged(before,after);
  const old=current.get(id);if(old){
   if(reviewedDepthPerson(revisions.get(id),old,after)){current.set(id,structuredClone(old));continue;}
   // Only live cash/stock are preserved outside the exact approved amendment.
   // Identity and all unrelated profile fields must still match either edition.
   const strip=n=>{const {coins,inventory,memorySeeds,...rest}=n;return rest;};
   const frozen=[after,before].find(n=>hashContent(strip(n))===hashContent(strip(applyKnowledgeWordingCorrections(old)))&&hashContent(n.memorySeeds)===hashContent(old.memorySeeds.slice(0,n.memorySeeds.length)));
   if(!frozen)throw Error(`已发布人物补充冲突：${id}`);
   current.set(id,{...after,coins:old.coins,inventory:structuredClone(old.inventory),memorySeeds:[...after.memorySeeds,...structuredClone(old.memorySeeds.slice(frozen.memorySeeds.length))]});
  }else current.set(id,after);
 }
 const untouched=candidate.npcs.filter(n=>!amended.has(n.id)).map(n=>reviewedDepthPerson(revisions.get(n.id),current.get(n.id),n)?structuredClone(current.get(n.id)):n);
 const nextNpcs=merge([...current.values()],untouched);
 const profiles=candidate.settlements.map(s=>({...s,kinship:candidate.kinship.filter(r=>s.residentIds.includes(r.parent))})),profileMap=new Map((world.settlementProfiles??[]).map(p=>[p.id,p]));
 if(new Set(profileAmendments.map(p=>p.id)).size!==profileAmendments.length)throw Error('聚落补充编号重复');
 // An amendment owns the profile's reviewed details (and the pending-section
 // list copied from them); every other field — population counts, resident ids,
 // later cards' board facts and calendars — stays as the live world has it, and
 // only a changed details text counts as a conflict.
 const same=(a,b)=>hashContent(a??null)===hashContent(b??null);
 for(const details of profileAmendments){const index=profiles.findIndex(p=>p.id===details.id);if(index<0)throw Error(`聚落补充不在原候选：${details.id}`);const before=profiles[index],old=profileMap.get(details.id),after={...(old??before),details,pendingProfileSections:details.pendingProfileSections};
  const prior=old&&hashContent(old.details)===previousProfileHashes[details.id]?{...before,details:old.details,pendingProfileSections:old.details.pendingProfileSections}:null;
  if(old&&![before,after,prior].filter(Boolean).some(p=>same(p.details,old.details)&&same(p.pendingProfileSections,old.pendingProfileSections)))throw Error(`已发布聚落补充冲突：${details.id}`);
  profiles[index]=after;profileMap.delete(details.id);
 }
 return {...world,npcs:nextNpcs,residents:merge(world.residents??[],candidate.residents),households:merge(world.households??[],candidate.households),settlementProfiles:merge((world.settlementProfiles??[]).map(p=>profileMap.has(p.id)?p:profiles.find(row=>row.id===p.id)),profiles),locations:merge(world.locations,candidate.locations.map(row=>{const old=world.locations.find(p=>p.id===row.id),next={...row};for(const key of ['mapHierarchy','biome','areaKm2'])if(old?.[key]!==undefined&&next[key]===undefined)next[key]=structuredClone(old[key]);return next;})),routes:merge(world.routes,candidate.routes)};
}
export async function publishVillages({root=path.resolve(import.meta.dirname,'../world'),publish=false}={}){
 const world=await loadWorld(root),directory=path.join(root,'drafts/w1/villages'),read=name=>fs.readFile(path.join(directory,`${name}.json`),'utf8').then(JSON.parse);
 const [candidate,foundation,audit]=await Promise.all([read('candidate'),read('foundation'),read('validation')]);
 if(['L1','L2','L4'].some(k=>audit[k]!=='passed'))throw Error('四村审核尚未完成');
 if(hashContent(foundation)!==hashContent(w1VillagesFoundation()))throw Error('冻结骨架与设计源不符');
 const original=villagesOriginalWorld(world,foundation),expected=structuredClone(foundation);validateFoundation(foundation,original);
 for(const [v,f]of Object.entries(villageFacts))for(const kind of ['npcs','residents','locations']){
  const entries=foundation[kind].filter(e=>(e.settlement??e.scope)===f.id),context=e=>contextFor(e,foundation,original);
  const approved=await readApprovedContent(path.join(directory,v,kind),entries,{contextFor:context,revision});
  if(approved.length!==entries.length)throw Error(`${v}/${kind}未全部通过逐条审核`);
  for(const entry of entries){const draft=approved.find(d=>d.id===entry.id),check=validateDraft(draft,entry,context(entry));if(check.errors.length)throw Error(`${entry.id} L1：${check.errors.join('；')}`);expected[kind][expected[kind].findIndex(e=>e.id===entry.id)]=applyProse(entry,draft);}
 }
 expected.residents=expected.residents.map(projectRoster);expected.locations=expected.locations.map(projectLocation);expected.status='reviewed-candidate';expected.formalWrite=false;
 if(hashContent(candidate)!==hashContent(expected))throw Error('候选与已审核内容不符');
 validateFoundation(candidate,original);const similarity=validateProseSimilarity(candidate,original);
 let npcAmendments=[];
 for(const [depthBatch,config] of Object.entries(depthBatches)){
 const depthDirectory=path.join(root,'drafts/w1',depthBatch),depthRevision=config.revision;
 if(await fs.stat(depthDirectory).then(s=>s.isDirectory()).catch(e=>{if(e.code==='ENOENT')return false;throw e;})){
  const frozen=JSON.parse(await fs.readFile(path.join(depthDirectory,'base.json'),'utf8'));
  const foundation=JSON.parse(await fs.readFile(path.join(depthDirectory,'foundation.json'),'utf8'));
  for(const n of frozen)if(hashContent(n)!==hashContent(candidate.npcs.find(p=>p.id===n.id)))throw Error(`人物补充原档与已审核候选不符：${n.id}`);
  const entries=depthEntries(frozen,depthBatch),reference={...original,npcs:[...original.npcs,...candidate.npcs],residents:[...original.residents,...candidate.residents],locations:[...original.locations,...candidate.locations]},ctx=e=>depthContext(e,reference);
  if(frozen.length!==entries.length||new Set(frozen.map(n=>n.id)).size!==frozen.length)throw Error('人物补充原档数量不符');
  const expected={revision:depthRevision,entries:entries.map(e=>({id:e.id,baseHash:hashContent(e.before),facts:e.facts,sharedEvent:e.sharedEvent,context:ctx(e)}))};
  if(hashContent(expected)!==hashContent(foundation))throw Error('人物补充骨架或引用事实已改变');
  const drafts=await readApprovedContent(depthDirectory,entries,{contextFor:ctx,revision:depthRevision});
  if(drafts.length!==entries.length)throw Error('人物补充未全部完成审核');
  npcAmendments.push(...entries.map(e=>{const d=drafts.find(d=>d.id===e.id),check=validateDepthDraft(d,e);if(check.errors.length)throw Error(`${e.id} 人物补充L1：${check.errors.join('；')}`);return applyDepthDraft(e.before,d);}));
 }
 }
 const profileDirectory=path.join(root,'drafts/w1/village-ledgers');let profileAmendments=[];
 if(await fs.stat(profileDirectory).then(s=>s.isDirectory()).catch(e=>{if(e.code==='ENOENT')return false;throw e;})){
  const reference={...world,npcs:[...original.npcs,...candidate.npcs],residents:[...original.residents,...candidate.residents],locations:[...original.locations,...candidate.locations],settlementProfiles:[...original.settlementProfiles,...candidate.settlements.map(s=>({...s,kinship:candidate.kinship.filter(r=>s.residentIds.includes(r.parent))}))]};
  profileAmendments=await approvedProfiles({world:reference,root:profileDirectory});
 }
 let depthReceipt;
 const hasDepth=await fs.access(path.join(root,'drafts/w1/depth-publication.json')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
 if(hasDepth)depthReceipt=await readPublishedNpcDepth({world,worldRoot:root,includeVillages:true});
 const merged=mergeVillages(world,candidate,{npcAmendments,profileAmendments,depthReceipt}),next=profileAmendments.length?withVillageLedgerRules(merged):merged,validation=validateWorld(next,{stage:'engine'});
 if(!validation.ok)throw Error(validation.errors.join('\n'));
 // Persist authored source fields, not D1 biome tags or K8 habitats that
 // loadWorld materializes for runtime consumers.
 const sourceLocations=new Map(JSON.parse(await fs.readFile(path.join(root,'geo/locations.json'),'utf8')).map(l=>[l.id,l]));
 const locations=next.locations.map(l=>{const row={...l},source=sourceLocations.get(l.id);for(const key of ['biome','areaKm2','mapHierarchy'])if(source&&!Object.hasOwn(source,key))delete row[key];return row;});
 const sourceRules=JSON.parse(await fs.readFile(path.join(root,'meta/rules.json'),'utf8'));
 const outputs={...(profileAmendments.length?{'meta/rules.json':withVillageLedgerRules({...merged,rules:sourceRules}).rules}:{}),'people/baseline.json':next.npcs,'people/residents.json':next.residents,'people/households.json':next.households,'geo/settlements.json':next.settlementProfiles,'geo/locations.json':locations,'geo/routes.json':next.routes};
 const changed=[];
 for(const [file,value]of Object.entries(outputs)){let before;try{before=JSON.parse(await fs.readFile(path.join(root,file),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}if(hashContent(before??null)!==hashContent(value))changed.push(file);}
 if(publish)for(const file of changed)await atomicJSON(path.join(root,file),outputs[file]);
 return {published:publish,changed,stage:'engine',full:next.npcs.length,roster:next.residents.length,newFull:120,newRoster:266,newLocations:156,newRoutes:156,amendedNpcIds:npcAmendments.map(n=>n.id),amendedProfileIds:profileAmendments.map(p=>p.id),settlements:candidate.settlements.map(s=>({id:s.id,population:s.population,full:30,households:s.householdCount})),candidateHash:hashContent(candidate),similarity,warnings:validation.warnings};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){const at=process.argv.indexOf('--root');console.log(JSON.stringify(await publishVillages({publish:process.argv.includes('--publish'),...(at>=0?{root:path.resolve(process.argv[at+1])}:{})})));}
