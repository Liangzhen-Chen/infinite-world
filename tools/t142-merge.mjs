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
 // Later cards answer the polities on other rows (reverse relations) and run
 // their clocks from rules.factionClock; neither existed before this batch.
 for(const f of next.factions??[]){
  if(f.relations?.some(r=>ids.has(r.faction)))f.relations=f.relations.filter(r=>!ids.has(r.faction));
  if(f.references?.some(id=>ids.has(id)))f.references=f.references.filter(id=>!ids.has(id));
 }
 for(const r of next.rules?.reputation?.factions??[])if(r.relations?.some(x=>ids.has(x.faction)))r.relations=r.relations.filter(x=>!ids.has(x.faction));
 if(next.rules?.factionClock){next.rules.factionClock.clocks=next.rules.factionClock.clocks.filter(c=>!ids.has(c.faction));if(!next.rules.factionClock.clocks.length)delete next.rules.factionClock;}
 return next;
}
