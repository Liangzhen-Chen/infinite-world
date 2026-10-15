// T142 merge helpers shared by the content and publication tools (kept apart to avoid an import cycle).
import {hashContent} from './content-pipeline.mjs';
import {buildBatch} from '../world/design/t142-provinces.mjs';

export const same=(a,b)=>hashContent(a)===hashContent(b);
export const FILES=[['geo/regions.json','regions'],['geo/locations.json','locations'],['geo/routes.json','routes'],['lore/cultures.json','cultures'],['lore/factions.json','factions'],['lore/factionPeople.json','factionPeople']];
function upsert(rows,adds,label){
 const out=structuredClone(rows),map=new Map(out.map((r,i)=>[r.id,i]));
 for(const row of adds){if(map.has(row.id)){if(!same(out[map.get(row.id)],row))throw Error(`正式条目冲突：${label} ${row.id}`);}else{out.push(structuredClone(row));map.set(row.id,out.length-1);}}
 return out;
}
export function batchIds(batch=buildBatch()){return new Set(FILES.flatMap(([,key])=>batch[key].map(r=>r.id)));}
export function mergeT142(world,batch){
 const next=structuredClone(world);
 for(const [,key] of FILES)next[key]=upsert(world[key]??[],batch[key],key);
 return next;
}
// The world as it was before this batch: used by tests to prove world_upgrade.
export function withoutT142(world,batch=buildBatch()){
 const ids=batchIds(batch),next=structuredClone(world);
 for(const [,key] of FILES)next[key]=(next[key]??[]).filter(r=>!ids.has(r.id));
 if(!next.regions.length)delete next.regions;
 return next;
}
