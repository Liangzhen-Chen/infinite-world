// K8: habitats derived from a location's terrain, biome tags (群落) and K1
// traits. Species spread from their home range to every derived habitat whose
// types cover the species' own habitat tags. Authored rules.wildlife.habitats
// stay as overrides: a location with an authored habitat never gets a derived
// one. Worlds without rules.habitatDerivation (all archived editions) derive
// nothing, so their ledgers replay unchanged.
import {locationTraits} from './traits.mjs';

export const HABITAT_TYPES=Object.freeze(['forest','wetland','open','rock','desert','frost','salt','ruin']);
const WORDS=[['forest',['林','树','木','根']],['wetland',['湿','泥','沼','滩','苇','洲','渡','河','溪','湾','汀','泉','湖','塘','水']],
 ['open',['田','埂','草','圃','果园','蜂','原野','牧']],['rock',['砾','岩','石','崖','岭','峡','矿','山']],['desert',['沙','砂','旱','漠']],
 ['frost',['冰','雪']],['salt',['盐']],['ruin',['冢','窑','塔','废','墓','坟']]];
const TRAIT_TYPES={forest:'forest',grass:'open',wet:'wetland',salt:'salt',sand:'desert',dry:'desert',stone:'rock',frost:'frost'};
const AQUATIC=['fish','aquatic'];
export const derivedHabitatId=location=>`habitat_auto_${location}`;

export function wordTypes(text){
 const types=new Set();
 for(const word of [].concat(text??[])){if(HABITAT_TYPES.includes(word))types.add(word);else for(const[type,list]of WORDS)if(list.some(w=>String(word).includes(w)))types.add(type);}
 return types;
}
// Location side: K1 terrain traits plus authored biome tags. Generic terrain
// (平地/丘陵 only give "earth") carries no ecology and yields no type.
// R31: depends only on terrain and biome text, so equal text gives the cached list (a fresh array each time).
const habitatTypesByText=new Map();
const habitatTypesByLocation=new WeakMap();
export function locationHabitatTypes(location){
 const prior=location&&habitatTypesByLocation.get(location),rawBiome=location?.biome;
 if(prior&&prior.terrain===location.terrain&&prior.biome.length===[].concat(rawBiome??[]).length&&prior.biome.every((word,i)=>word===(Array.isArray(rawBiome)?rawBiome[i]:rawBiome)))return [...prior.types];
 const terrain=location?.terrain??'',biome=[].concat(location?.biome??[]),text=JSON.stringify([terrain,...biome]);
 let hit=habitatTypesByText.get(text);
 if(!hit){
  const types=wordTypes([terrain,...biome]);
  for(const tag of locationTraits(location).tags)if(TRAIT_TYPES[tag])types.add(TRAIT_TYPES[tag]);
  hit=[...types].sort();habitatTypesByText.set(text,hit);
 }
 if(location)habitatTypesByLocation.set(location,{terrain:location.terrain,biome:[...biome],types:hit});
 return [...hit];
}
// Species side: its own habitat tags, its home range, and a water body for fish.
export function speciesHabitatTypes(world,species,manual){
 const home=manual.find(h=>h.id===species.wildlife?.habitat),location=world.locations.find(l=>l.id===home?.location);
 const types=new Set([...wordTypes(species.habitatTags),...wordTypes(home?.name),...(location?locationHabitatTypes(location):[])]);
 if(species.tags?.some(t=>AQUATIC.includes(t)))types.add('wetland');
 return [...types].sort();
}
// Built, owned or inhabited places never host a wild range of their own;
// a settlement node (its own scope, or a T142 far seat/market) is inhabited.
export function wildPlace(world,location){
 const settlements=new Set((world.settlementProfiles??[]).map(p=>p.id));
 return location.scope!==location.id&&!location.farNode&&!location.owner&&!location.access&&!location.rooms?.length&&!location.lodging&&!location.workstations?.length&&!location.monsterSociety&&!settlements.has(location.id);
}
const rarityFactor=(config,population)=>config.rarity.find(r=>population>=r.minimumPopulation)?.factor??0;
const placeScale=(config,location)=>Number.isFinite(location.areaKm2)?Math.min(config.maximumScale,location.areaKm2/config.referenceAreaKm2):config.defaultScale[location.scope?'area':'site'];
export function deriveHabitats(world){
 const config=world.rules?.habitatDerivation,wild=world.rules?.wildlife;if(!config||!wild)return[];
 const manual=wild.habitats.filter(h=>!h.derived),covered=new Set(manual.map(h=>h.location));
 // Humanoid peoples live in societies and are never spread as wild stock.
 const catalog=(world.monsters??[]).filter(s=>s.wildlife&&!s.tags?.includes('humanoid')&&manual.some(h=>h.id===s.wildlife.habitat)).map(s=>({s,types:speciesHabitatTypes(world,s,manual)})).filter(r=>r.types.length);
 const rows=[];
 for(const location of world.locations??[]){
  if(covered.has(location.id)||!wildPlace(world,location))continue;
  const types=locationHabitatTypes(location);if(!types.length)continue;
  const scale=placeScale(config,location),species={};
  const candidates=catalog.filter(r=>r.types.every(t=>types.includes(t))).map(({s})=>{
   const factor=scale*rarityFactor(config,s.wildlife.population),population=Math.floor(s.wildlife.population*factor);
   return{s,population,capacity:Math.max(population,Math.round(s.wildlife.capacity*factor))};
  }).filter(r=>r.population>=1);
  // A predator only spreads where at least one of its prey also lives.
  const chosen=new Set(candidates.filter(r=>!r.s.wildlife.predatorOf.length).map(r=>r.s.id));
  for(let grew=true;grew;){grew=false;for(const r of candidates)if(!chosen.has(r.s.id)&&r.s.wildlife.predatorOf.some(id=>chosen.has(id))){chosen.add(r.s.id);grew=true;}}
  for(const r of candidates)if(chosen.has(r.s.id))species[r.s.id]={population:r.population,capacity:r.capacity};
  if(Object.keys(species).length)rows.push({id:derivedHabitatId(location.id),name:`${location.name}野地`,location:location.id,derived:config.version,types,species});
 }
 return rows;
}
// Effective habitat list: authored overrides first, then derived ranges.
export const wildlifeHabitats=world=>[...(world.rules.wildlife?.habitats??[]).filter(h=>!h.derived),...deriveHabitats(world)];
// Called once per loaded world (WorldEngine). Idempotent: derived rows are
// recomputed from the current catalog, authored rows are never touched.
export function materializeWildlifeHabitats(world){
 if(world.rules?.wildlife&&world.rules.habitatDerivation)world.rules.wildlife.habitats=wildlifeHabitats(world);
 return world;
}
// Per-range figures: the home range uses the species' own numbers.
export function rangeSpec(habitat,species){
 const row=habitat?.species?.[species.id];
 return row&&species.wildlife.habitat!==habitat.id?{...species.wildlife,population:row.population,capacity:row.capacity}:species.wildlife;
}
export const initialIn=(habitat,species)=>species.wildlife.habitat===habitat.id?species.wildlife.population:habitat.species?.[species.id]?.population??0;
export function validateHabitatDerivation(world){
 const errors=[],config=world.rules.habitatDerivation;if(!config)return errors;
 if(!world.rules.wildlife)return['栖地派生需要野外生态规则'];
 if(config.version!==1)errors.push('栖地派生版本不支持');
 if(!(config.referenceAreaKm2>0)||!(config.maximumScale>0)||!['site','area'].every(k=>config.defaultScale?.[k]>0&&config.defaultScale[k]<=config.maximumScale))errors.push('栖地派生规模参数无效');
 const tiers=config.rarity??[];
 if(!tiers.length||tiers.at(-1).minimumPopulation!==0||tiers.some((r,i)=>!(r.factor>=0&&r.factor<=1)||i&&r.minimumPopulation>=tiers[i-1].minimumPopulation))errors.push('栖地派生稀有度分档无效');
 for(const l of world.locations)if(l.biome!==undefined&&(!Array.isArray(l.biome)||l.biome.some(t=>typeof t!=='string'||!wordTypes(t).size)))errors.push(`地点群落标签无法识别：${l.id}`);
 for(const l of world.locations)if(l.areaKm2!==undefined&&!(l.areaKm2>0))errors.push(`地点面积无效：${l.id}`);
 return errors;
}
