import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {hashContent,readApprovedContent} from './content-pipeline.mjs';
import {w1VillagesFoundation,villageFacts} from '../world/design/w1-villages.mjs';
import {contextFor,revision,applyProse,projectRoster,projectLocation,validateDraft,validateFoundation,validateProseSimilarity} from './w1-villages-content.mjs';
import {atomicJSON} from '../server-plugin/storage.mjs';

const merge=(old,rows)=>{const map=new Map(old.map(x=>[x.id,x]));for(const row of rows){if(map.has(row.id)&&hashContent(map.get(row.id))!==hashContent(row))throw Error(`已发布条目冲突：${row.id}`);map.set(row.id,row);}return [...map.values()];};
export function villagesOriginalWorld(world,foundation=w1VillagesFoundation()){
 const own=new Set([...foundation.npcs,...foundation.residents,...foundation.locations,...foundation.routes,...foundation.households,...foundation.settlements].map(x=>x.id));
 return {...world,...Object.fromEntries(['npcs','residents','locations','routes','households','settlementProfiles'].map(k=>[k,(world[k]??[]).filter(x=>!own.has(x.id))]))};
}
export function mergeVillages(world,candidate){
 const profiles=candidate.settlements.map(s=>({...s,kinship:candidate.kinship.filter(r=>s.residentIds.includes(r.parent))}));
 return {...world,npcs:merge(world.npcs,candidate.npcs),residents:merge(world.residents??[],candidate.residents),households:merge(world.households??[],candidate.households),settlementProfiles:merge(world.settlementProfiles??[],profiles),locations:merge(world.locations,candidate.locations),routes:merge(world.routes,candidate.routes)};
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
 validateFoundation(candidate,original);const similarity=validateProseSimilarity(candidate,original),next=mergeVillages(world,candidate),validation=validateWorld(next,{stage:'release'});
 if(!validation.ok)throw Error(validation.errors.join('\n'));
 const outputs={'people/baseline.json':next.npcs,'people/residents.json':next.residents,'people/households.json':next.households,'geo/settlements.json':next.settlementProfiles,'geo/locations.json':next.locations,'geo/routes.json':next.routes};
 const changed=[];
 for(const [file,value]of Object.entries(outputs)){let before;try{before=JSON.parse(await fs.readFile(path.join(root,file),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}if(hashContent(before??null)!==hashContent(value))changed.push(file);}
 if(publish)for(const file of changed)await atomicJSON(path.join(root,file),outputs[file]);
 return {published:publish,changed,stage:'release',full:next.npcs.length,roster:next.residents.length,newFull:120,newRoster:266,newLocations:156,newRoutes:156,settlements:candidate.settlements.map(s=>({id:s.id,population:s.population,full:30,households:s.householdCount})),candidateHash:hashContent(candidate),similarity,warnings:validation.warnings};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){const at=process.argv.indexOf('--root');console.log(JSON.stringify(await publishVillages({publish:process.argv.includes('--publish'),...(at>=0?{root:path.resolve(process.argv[at+1])}:{})})));}
