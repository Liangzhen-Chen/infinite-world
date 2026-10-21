// T142 merge helpers shared by the content and publication tools (kept apart to avoid an import cycle).
import {hashContent} from './content-pipeline.mjs';
import {buildBatch} from '../world/design/t142-provinces.mjs';
import {pruneRuleDependents} from './edition-rules.mjs';

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
 // Later public facilities and governing organizations leave with their seat.
 // Keep the historical edition closed under these actual ownership references.
 for(let changed=true;changed;){changed=false;for(const row of [...world.locations,...world.factions,...world.routes])if(!ids.has(row.id)&&(ids.has(row.parent)||ids.has(row.scope)||ids.has(row.contactAnchor)||ids.has(row.from)||ids.has(row.to))){ids.add(row.id);changed=true;}}
 for(const [,key] of FILES)next[key]=(next[key]??[]).filter(r=>!ids.has(r.id));
 // Later resident officials (e.g. Huancheng's governor and deputy) depend on
 // these places too. They cannot stand in an edition predating their seat.
 next.npcs=(next.npcs??[]).filter(n=>!ids.has(n.location));
 if(!next.regions.length)delete next.regions;
 // Later cards answer the polities on other rows (reverse relations) and run
 // their clocks from rules.factionClock; neither existed before this batch.
 for(const f of next.factions??[]){
  if(f.relations?.some(r=>ids.has(r.faction)))f.relations=f.relations.filter(r=>!ids.has(r.faction));
  if(f.references?.some(id=>ids.has(id)))f.references=f.references.filter(id=>!ids.has(id));
 }
 if(next.rules?.reputation?.factions)next.rules.reputation.factions=next.rules.reputation.factions.filter(r=>!ids.has(r.id));
 for(const r of next.rules?.reputation?.factions??[])if(r.relations?.some(x=>ids.has(x.faction)))r.relations=r.relations.filter(x=>!ids.has(x.faction));
 if(next.rules?.factionClock){next.rules.factionClock.clocks=next.rules.factionClock.clocks.filter(c=>!ids.has(c.faction));if(!next.rules.factionClock.clocks.length)delete next.rules.factionClock;}
 // U12 military polities/armies of these polities, war fronts and quest offers at
 // these places are later rows about this batch's entities (tools/edition-rules.mjs).
 pruneRuleDependents(next.rules,ids);
 return next;
}
