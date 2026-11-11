// A1: the runtime world = the reviewed world (rows exactly as approved, see
// tools/load-world.mjs loadWorld) + its mechanism annotations + the laws that act
// on reviewed rows. Annotations (item tags and animalProduct, place fixtures,
// profession aliases/labor/processing, species body attributes) are
// world/meta/mechanics/<collection>.json, {id:{field:value}}; the loader carries
// them as world.mechanics. Merging consumes world.mechanics, so a second call
// (WorldEngine on a world loadRuntimeWorld already built) leaves it unchanged.
import {applyChainLaws} from '../tools/kc-processing.mjs';
import {installHusbandryTraits} from './husbandry-traits.mjs';

export const mechanicsCollections=['items','locations','professions','careers','species'];
// meta/mechanics/<file>.json -> its key on world.mechanics: kebab-case to camelCase.
export const mechanicsKey=file=>file.replace(/\.json$/,'').replace(/-([a-z0-9])/g,(_,c)=>c.toUpperCase());

// A field the row lacks is set, lists are joined (row entries first, no
// repeats), objects merge field by field, and a value the row already has must
// equal the annotation's: an annotation never rewrites reviewed content. Files
// written back from a runtime world carry the merged values and merge again to
// the same rows.
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hasId=entry=>isRecord(entry)&&typeof entry.id==='string';
const sameValue=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function annotate(row,patch,where){
 for(const [key,value] of Object.entries(patch)){
  const have=row[key];
  if(have===undefined)row[key]=structuredClone(value);
  else if(Array.isArray(have)&&Array.isArray(value)){
   for(const entry of value){
    // An entry with an id is the row's entry with that id, however the laws have since
    // filled it (a derived quantity): merge field by field, never add it twice.
    const same=hasId(entry)?have.find(h=>hasId(h)&&h.id===entry.id):have.find(h=>sameValue(h,entry));
    if(same===undefined)have.push(structuredClone(entry));
    else if(hasId(entry))annotate(same,entry,`${where}.${key}[${entry.id}]`);
   }
  }
  else if(isRecord(have)&&isRecord(value))annotate(have,value,`${where}.${key}`);
  else if(!sameValue(have,value))throw new Error(`机制注释不能改写已审字段：${where}.${key}`);
 }
}
// A row this world edition does not carry (a fixture rebuilt without a later
// batch) is not part of it, as with biome tags.
function annotateRows(rows,overlay={},collection){
 const byId=new Map((rows??[]).map(row=>[row.id,row]));
 for(const [id,patch] of Object.entries(overlay))if(byId.has(id))annotate(byId.get(id),patch,`${collection}.${id}`);
}

export function materializeRuntimeWorld(world){
 const m=world.mechanics;if(!m)return world;
 annotateRows(world.items,m.items,'items');annotateRows(world.locations,m.locations,'locations');annotateRows(world.professions,m.professions,'professions');
 if(world.careers)for(const [id,patch] of Object.entries(m.careers??{}))if(world.careers[id])annotate(world.careers[id],patch,`careers.${id}`);
 // Species body attributes annotate a husbandry definition this edition carries.
 annotateRows(world.monsters?.filter(s=>s.husbandry),m.species,'species');
 // Species attributes change the derived products; re-derive them.
 if(Object.keys(m.species??{}).length&&world.monsters.some(s=>s.husbandry))installHusbandryTraits(world);
 // C's production-chain laws (sites regrow only natural things, teacherless
 // primary recipes, chain price floor; tools/kc-processing.mjs). Habitats read
 // the biome tags the loader merged into each place.
 const biomes=Object.fromEntries((world.locations??[]).filter(l=>l.biome).map(l=>[l.id,{biome:l.biome}]));
 applyChainLaws({locations:world.locations??[],recipes:world.recipes??[],items:world.items??[]},{ecology:m.siteEcology??null,biomes});
 // Any other mechanics file is a law table, not a row annotation (Q's material
 // uses, SL's husbandry takes); it stays on the runtime world under its key.
 for(const [key,table] of Object.entries(m))if(!mechanicsCollections.includes(key)&&key!=='siteEcology')world[key]=table;
 delete world.mechanics;
 // 不可枚举标记：这个世界的覆盖层已被合并并消耗（structuredClone 不带走它，只标原对象）；候选装配据此拒绝把它当原样世界用（tools/w3-content.mjs assembleW3）。
 Object.defineProperty(world,'runtimeMaterialized',{value:true,enumerable:false,configurable:true});
 return world;
}
