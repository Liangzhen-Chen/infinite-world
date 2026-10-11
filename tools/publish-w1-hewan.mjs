import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {readApprovedContent,hashContent} from './content-pipeline.mjs';
import {contextFor,revision,applyProse,validateFoundation} from './w1-hewan-content.mjs';
import {atomicJSON} from '../server-plugin/storage.mjs';

const merge=(existing,incoming)=>{
 const values=new Map(existing.map(row=>[row.id,row]));
 for(const row of incoming){const old=values.get(row.id);if(old&&hashContent(old)!==hashContent(row))throw Error(`已发布条目冲突：${row.id}`);values.set(row.id,row);}
 return [...values.values()];
};
export function mergeHewan(world,candidate){
 const profile={...candidate.settlement,kinship:candidate.kinship};
 // An installed batch must never reset subsequent catalog development. Partial
 // installations still need the original facts, and owned rows remain immutable.
 const installed=Object.entries({npcs:candidate.npcs,residents:candidate.residents,households:candidate.households,settlementProfiles:[profile],locations:candidate.locations,routes:candidate.routes})
  .every(([key,rows])=>rows.every(row=>(world[key]??[]).some(current=>current.id===row.id&&hashContent(current)===hashContent(row))));
 if(!installed)for(const [id,hash]of Object.entries(candidate.preservedHashes))if(hashContent(world.npcs.find(n=>n.id===id))!==hash)throw Error(`原有人物事实变化：${id}`);
 return {...world,npcs:merge(world.npcs,candidate.npcs),residents:merge(world.residents??[],candidate.residents),households:merge(world.households??[],candidate.households),
  settlementProfiles:merge(world.settlementProfiles??[],[profile]),locations:merge(world.locations,candidate.locations),routes:merge(world.routes,candidate.routes)};
}
export async function publishHewan({root=path.resolve(import.meta.dirname,'..','world'),publish=false}={}){
 const world=await loadWorld(root),directory=path.join(root,'drafts/w1/hewan'),read=name=>fs.readFile(path.join(directory,name+'.json'),'utf8').then(JSON.parse);
 const [candidate,foundation,audit,preserved]=await Promise.all([read('candidate'),read('foundation'),read('validation'),read('preserved-npcs')]);
 if(['L1','L2','L4'].some(key=>audit[key]!=='passed'))throw Error('河湾内容尚未完成审核');
 if(hashContent(candidate.preservedHashes)!==hashContent(foundation.preservedHashes)||preserved.length!==Object.keys(candidate.preservedHashes).length||new Set(preserved.map(n=>n.id)).size!==preserved.length)throw Error('冻结原人物审核资料不符');
 for(const row of preserved)if(hashContent(row)!==candidate.preservedHashes[row.id])throw Error(`冻结原人物审核资料不符：${row.id}`);
 const remove=(rows,added)=>rows.filter(row=>!added.some(n=>n.id===row.id));
 const original={...world,npcs:remove(world.npcs,candidate.npcs).map(n=>preserved.find(row=>row.id===n.id)??n),residents:remove(world.residents??[],candidate.residents),locations:remove(world.locations,candidate.locations),routes:remove(world.routes,candidate.routes)};
 validateFoundation(candidate,original);
 for(const kind of ['npcs','residents','locations']){
  const approved=await readApprovedContent(path.join(directory,kind),foundation[kind],{contextFor:entry=>contextFor(entry,foundation,original),revision});
  if(approved.length!==foundation[kind].length)throw Error(`${kind}未全部通过逐条审核`);
  for(const row of foundation[kind]){
   const expected=applyProse(row,approved.find(d=>d.id===row.id));
   if(hashContent(expected)!==hashContent(candidate[kind].find(n=>n.id===row.id)))throw Error(`候选与已审核内容不符：${row.id}`);
  }
 }
 const next=mergeHewan(world,candidate),validation=validateWorld(next,{stage:'release'});
 if(!validation.ok)throw Error(validation.errors.join('\n'));
 const files={'people/baseline.json':next.npcs,'people/residents.json':next.residents,'people/households.json':next.households,'geo/settlements.json':next.settlementProfiles,'geo/locations.json':next.locations,'geo/routes.json':next.routes};
 const changed=[];
 for(const [file,rows]of Object.entries(files)){
  let previous;try{previous=JSON.parse(await fs.readFile(path.join(root,file),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(hashContent(previous??null)===hashContent(rows))continue;changed.push(file);
  if(publish)await atomicJSON(path.join(root,file),rows);
 }
 return{published:publish,changed,full:next.npcs.length,roster:next.residents.length,riverResidents:next.settlementProfiles.find(row=>row.id==='loc_hw').population,households:next.households.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))console.log(JSON.stringify(await publishHewan({publish:process.argv.includes('--publish')})));
