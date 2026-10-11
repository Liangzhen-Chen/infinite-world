import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {hashContent,readApprovedContent} from './content-pipeline.mjs';
import {w1VillagesFoundation,villageFacts} from '../world/design/w1-villages.mjs';
import {contextFor,revision,applyProse,projectRoster,projectLocation,validateDraft,validateFoundation,validateProseSimilarity} from './w1-villages-content.mjs';
import {atomicJSON} from '../server-plugin/storage.mjs';
import {depthEntries,contextFor as depthContext,applyDepthDraft,validateDraft as validateDepthDraft,verifyUnchanged,revision as depthRevision} from './npc-depth-content.mjs';

const merge=(old,rows)=>{const map=new Map(old.map(x=>[x.id,x]));for(const row of rows){if(map.has(row.id)&&hashContent(map.get(row.id))!==hashContent(row))throw Error(`已发布条目冲突：${row.id}`);map.set(row.id,row);}return [...map.values()];};
export function villagesOriginalWorld(world,foundation=w1VillagesFoundation()){
 const own=new Set([...foundation.npcs,...foundation.residents,...foundation.locations,...foundation.routes,...foundation.households,...foundation.settlements].map(x=>x.id));
 return {...world,...Object.fromEntries(['npcs','residents','locations','routes','households','settlementProfiles'].map(k=>[k,(world[k]??[]).filter(x=>!own.has(x.id))]))};
}
export function mergeVillages(world,candidate,{npcAmendments=[]}={}){
 const amended=new Map(npcAmendments.map(row=>[row.id,row]));
 if(amended.size!==npcAmendments.length)throw Error('人物补充编号重复');
 const current=new Map(world.npcs.map(n=>[n.id,n]));
 for(const [id,after]of amended){
  const before=candidate.npcs.find(n=>n.id===id);if(!before)throw Error(`人物补充不在原候选：${id}`);
  verifyUnchanged(before,after);
  const old=current.get(id);if(old){
   // Only live cash/stock are preserved outside the exact approved amendment.
   // Identity and all unrelated profile fields must still match either edition.
   const strip=n=>{const {coins,inventory,...rest}=n;return rest;};
   if(![before,after].some(n=>hashContent(strip(n))===hashContent(strip(old))))throw Error(`已发布人物补充冲突：${id}`);
   current.set(id,{...after,coins:old.coins,inventory:structuredClone(old.inventory)});
  }else current.set(id,after);
 }
 const untouched=candidate.npcs.filter(n=>!amended.has(n.id));
 const nextNpcs=merge([...current.values()],untouched);
 const profiles=candidate.settlements.map(s=>({...s,kinship:candidate.kinship.filter(r=>s.residentIds.includes(r.parent))}));
 return {...world,npcs:nextNpcs,residents:merge(world.residents??[],candidate.residents),households:merge(world.households??[],candidate.households),settlementProfiles:merge(world.settlementProfiles??[],profiles),locations:merge(world.locations,candidate.locations),routes:merge(world.routes,candidate.routes)};
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
 const depthDirectory=path.join(root,'drafts/w1/yupo-depth');let npcAmendments=[];
 if(await fs.stat(depthDirectory).then(s=>s.isDirectory()).catch(e=>{if(e.code==='ENOENT')return false;throw e;})){
  const frozen=JSON.parse(await fs.readFile(path.join(depthDirectory,'base.json'),'utf8'));
  const foundation=JSON.parse(await fs.readFile(path.join(depthDirectory,'foundation.json'),'utf8'));
  for(const n of frozen)if(hashContent(n)!==hashContent(candidate.npcs.find(p=>p.id===n.id)))throw Error(`人物补充原档与已审核候选不符：${n.id}`);
  const entries=depthEntries(frozen),reference={...original,npcs:[...original.npcs,...candidate.npcs],residents:[...original.residents,...candidate.residents],locations:[...original.locations,...candidate.locations]},ctx=e=>depthContext(e,reference);
  if(frozen.length!==entries.length||new Set(frozen.map(n=>n.id)).size!==frozen.length)throw Error('人物补充原档数量不符');
  const expected={revision:depthRevision,entries:entries.map(e=>({id:e.id,baseHash:hashContent(e.before),facts:e.facts,sharedEvent:e.sharedEvent,context:ctx(e)}))};
  if(hashContent(expected)!==hashContent(foundation))throw Error('人物补充骨架或引用事实已改变');
  const drafts=await readApprovedContent(depthDirectory,entries,{contextFor:ctx,revision:depthRevision});
  if(drafts.length!==entries.length)throw Error('人物补充未全部完成审核');
  npcAmendments=entries.map(e=>{const d=drafts.find(d=>d.id===e.id),check=validateDepthDraft(d,e);if(check.errors.length)throw Error(`${e.id} 人物补充L1：${check.errors.join('；')}`);return applyDepthDraft(e.before,d);});
 }
 const next=mergeVillages(world,candidate,{npcAmendments}),validation=validateWorld(next,{stage:'release'});
 if(!validation.ok)throw Error(validation.errors.join('\n'));
 const outputs={'people/baseline.json':next.npcs,'people/residents.json':next.residents,'people/households.json':next.households,'geo/settlements.json':next.settlementProfiles,'geo/locations.json':next.locations,'geo/routes.json':next.routes};
 const changed=[];
 for(const [file,value]of Object.entries(outputs)){let before;try{before=JSON.parse(await fs.readFile(path.join(root,file),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}if(hashContent(before??null)!==hashContent(value))changed.push(file);}
 if(publish)for(const file of changed)await atomicJSON(path.join(root,file),outputs[file]);
 return {published:publish,changed,stage:'release',full:next.npcs.length,roster:next.residents.length,newFull:120,newRoster:266,newLocations:156,newRoutes:156,amendedNpcIds:npcAmendments.map(n=>n.id),settlements:candidate.settlements.map(s=>({id:s.id,population:s.population,full:30,households:s.householdCount})),candidateHash:hashContent(candidate),similarity,warnings:validation.warnings};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){const at=process.argv.indexOf('--root');console.log(JSON.stringify(await publishVillages({publish:process.argv.includes('--publish'),...(at>=0?{root:path.resolve(process.argv[at+1])}:{})})));}
