import {derived} from './derived.mjs';
import {accrueStock} from './stock.mjs';
import {takePopulation} from './population-health.mjs';
import {aliveHoldings} from './holdings.mjs';
import {rangeSpec} from './wildlife-habitats.mjs';
import {installHusbandryTraits} from './husbandry-traits.mjs';

// Used by the normal loader and content previews; archived species retain the
// merged definitions, rather than requiring a second runtime parameter table.
export function installEcologyDefinitions(world,config){
 if(!config||!Array.isArray(config.species)||!Array.isArray(config.herds))throw Error('生态数据须含 species/herds');
 const seen=new Set();
 for(const row of config.species){
  const s=world.monsters.find(s=>s.id===row.id);
  if(!s||seen.has(row.id))throw Error(`生态物种引用无效或重复：${row.id}`);seen.add(row.id);
  for(const key of ['ecology','interactions','husbandry'])if(row[key]!==undefined)s[key]=structuredClone(row[key]);
 }
 world.ecology={herds:structuredClone(config.herds)};
 // Products are derived from species attributes, then the derived shape is validated.
 installHusbandryTraits(world);
 const errors=validateEcologyDefinitions(world);if(errors.length)throw Error(errors.join('; '));
 return world;
}
export function validateEcologyDefinitions(world){
 const errors=[],items=new Set(world.items.map(i=>i.id)),species=new Map(world.monsters.map(s=>[s.id,s]));
 for(const s of species.values()){
  if(s.ecology?.disease&&!world.primitiveTables.health.rows.some(r=>r.key===s.ecology.disease))errors.push(`生态病种未登记：${s.id}`);
  for(const row of s.interactions??[])if(!['predation','competition','mutualism'].includes(row.kind)||typeof row.with!=='string'||!Number.isFinite(row.k)||row.k<0||!Number.isFinite(row.handling??0)||(row.handling??0)<0)errors.push(`生态相互作用无效：${s.id}`);
  for(const row of s.interactions??[])if(!species.has(row.with)&&![...species.values()].some(other=>other.tags?.includes(row.with)))errors.push(`生态相互作用引用无效：${s.id}`);
  if(s.ecology?.niche&&(Object.values(s.ecology.niche).some(n=>!Number.isFinite(n)||n<0)||!Object.values(s.ecology.niche).some(n=>n>0)))errors.push(`生态位系数无效：${s.id}`);
  const p=s.husbandry;if(!p)continue;
  if(!items.has(p.feed?.item)||!Number.isFinite(p.feed?.perHead)||p.feed.perHead<=0||!Number.isFinite(p.birthPerHeadDay)||p.birthPerHeadDay<0||!Array.isArray(p.yields?.alive))errors.push(`家畜参数无效：${s.id}`);
  const outputs=new Set();for(const y of p.yields?.alive??[]){if(outputs.has(y.item)||!items.has(y.item)||!Number.isFinite(y.perHeadDay)||y.perHeadDay<0||!Number.isSafeInteger(y.collectMinutes)||y.collectMinutes<1)errors.push(`活体产物参数无效：${s.id}`);outputs.add(y.item);}
 }
 const ids=new Set();for(const h of world.ecology?.herds??[]){
  if(!/^population_[a-zA-Z0-9_]+$/.test(h.id)||ids.has(h.id)||!species.get(h.species)?.husbandry||!world.locations.some(l=>l.id===h.location)||h.owner!=='player'&&!world.npcs.some(n=>n.id===h.owner)||!Number.isSafeInteger(h.count)||h.count<0||!Number.isSafeInteger(h.capacity)||h.capacity<h.count)errors.push(`畜群开户无效：${h.id}`);ids.add(h.id);
 }
 return errors;
}

// Published predatorOf relations project into the same interaction shape as
// authored ecology rows. There is one solver, including for installed species.
export function speciesInteractions(species){
 const rows=species.interactions??[];
 return [...rows,...(species.wildlife?.predatorOf??[]).filter(id=>!rows.some(r=>r.kind==='predation'&&r.with===id)).map(id=>({with:id,kind:'predation',k:1/4}))];
}
const matches=(row,s,season)=>(row.with===s.id||s.tags?.includes(row.with))&&(!row.season||[].concat(row.season).includes(season));
const fraction=(populations,s,habitat)=>Math.max(0,(populations[s.id]?.count??0)/Math.max(1,rangeSpec(habitat,s).capacity));
export function territoryCapacityFactor(d,e,habitat){
 const subjects=[habitat.id,habitat.location,...(e.world.bosses??[]).filter(b=>b.residence?.habitat===habitat.id).map(b=>b.residence.id)];
 if(!subjects.some(subject=>aliveHoldings(d,{kind:'controls',subject}).length))return 1;
 const base=e.world.primitiveTables.ecology.params.find(p=>p.id==='bossTerritory.capacity').value;
 return derived(e,d.document,'ecology:territoryCapacity',habitat.location,{base});
}
export function nicheOverlap(a,b){
 const vector=s=>s.ecology?.niche??Object.fromEntries((s.habitatTags??[]).map(tag=>[tag,1]));
 const x=vector(a),y=vector(b),keys=new Set([...Object.keys(x),...Object.keys(y)]);
 if(!keys.size)return 1;
 let common=0,total=0;for(const key of keys){common+=Math.min(x[key]??0,y[key]??0);total+=Math.max(x[key]??0,y[key]??0);}
 return total?common/total:0;
}
function effect(d,e,habitat,s,catalog,populations,kind,season){
 let value=0;
 const rows=speciesInteractions(s).filter(r=>r.kind===kind),slot=`ecology:${kind}`;
 // Pairwise corrections can declare an otherwise zero interaction through
 // holder/target. This is the existing public derived-rule interface.
 if(!rows.length&&![...e.world.derived?.modifiers??[],...e.rules.modifiers??[]].some(r=>r.target===slot))return 0;
 for(const other of catalog){
  if(other.id===s.id)continue;
  const base=rows.filter(row=>matches(row,other,season)).reduce((sum,row)=>sum+row.k,0);
  const k=derived(e,d.document,slot,habitat.location,{base,holder:s.id,target:other.id});
  value+=k*fraction(populations,other,habitat)*(kind==='competition'?nicheOverlap(s,other):1);
 }
 return value;
}
export function populationCapacity(d,e,habitat,s,catalog,populations,base,season){
 return Math.max(0,Math.floor(base*(1-effect(d,e,habitat,s,catalog,populations,'competition',season))));
}
export function populationBirthFactor(d,e,habitat,s,catalog,populations,season,externalFood=0){
 const prey=speciesInteractions(s).filter(r=>r.kind==='predation');
 const food=prey.length?Math.min(1,externalFood+catalog.filter(other=>prey.some(r=>matches(r,other,season))).reduce((sum,other)=>sum+fraction(populations,other,habitat),0)):1;
 return derived(e,d.document,'population:birthRate',habitat.location,{base:food*(1+effect(d,e,habitat,s,catalog,populations,'mutualism',season)),target:s.id});
}
// Weekly Holling-II transfer. Fractional kills accumulate instead of rounding
// each encounter upward; prey losses are the same physical population units.
export function settlePopulationPredation(d,e,habitat,catalog,record,season,present=()=>0){
 for(const s of catalog){
  const hunter=record.populations[s.id],hunters=hunter.count+present(s.id);
  for(const row of speciesInteractions(s).filter(r=>r.kind==='predation'))for(const prey of catalog){
   if(prey.id===s.id||!matches(row,prey,season))continue;
   const food=record.populations[prey.id];if(!food.count||!hunters)continue;
   const k=derived(e,d.document,'ecology:predation',habitat.location,{base:row.k,holder:s.id,target:prey.id});
   const attack=k/Math.max(1,rangeSpec(habitat,prey).capacity);
   const expected=attack*hunters*food.count/(1+attack*(row.handling??0)*food.count);
   const eaten=Math.min(food.count,accrueStock(hunter,`predation:${prey.id}`,expected));
   takePopulation(food,eaten);food.predated+=eaten;
  }
 }
}
