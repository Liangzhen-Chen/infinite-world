import {isPhysicallyDead} from './lifecycle-state.mjs';
// K1: derived trait view. Items, creatures, terrain, place features and spells
// are read into one material/form tag vocabulary plus element affinity. Nothing
// here writes state; consumers decide what a trait permits.
import {personBody,physicalFeature,itemView,placeView} from './entity-view.mjs';
import {facilityView} from './facility-state.mjs';
import {openingTransportAssets} from '../world/design/transport-rules.mjs';

// One element vocabulary. The first eight are the spell damage types already in
// saves and catalogs (order kept); water and lightning are interaction agents.
export const ELEMENTS=Object.freeze(['physical','fire','cold','wind','earth','light','shadow','mind','water','lightning']);
export const SPELL_DAMAGE_TYPES=Object.freeze(ELEMENTS.slice(0,8));
export const ATTACK_MODES=Object.freeze(['armed','unarmed']);
// Creature affinity tactics: legacy order first, then the new elements.
export const TACTICS=Object.freeze([...ATTACK_MODES,...['fire','cold','wind','earth','light','shadow','mind','physical','water','lightning'].map(e=>`magic_${e}`)]);
// Legacy and loose names map onto the single vocabulary.
export const ELEMENT_ALIASES=Object.freeze({ice:'cold',frost:'cold',snow:'cold',heat:'fire',flame:'fire',ember:'fire',thunder:'lightning',electric:'lightning',storm:'lightning',rain:'water',air:'wind',stone:'earth',soil:'earth',dark:'shadow',psychic:'mind',untyped:'physical'});
export function canonicalElement(name){
 if(typeof name!=='string')return null;
 const raw=name.startsWith('magic_')?name.slice(6):name;
 const value=ELEMENT_ALIASES[raw]??raw;
 return ELEMENTS.includes(value)?value:null;
}
export const tacticElement=tactic=>ATTACK_MODES.includes(tactic)?null:canonicalElement(tactic);

// Creature body tags authored in world/meta/monsters.json `tags`.
export const CREATURE_TAGS=Object.freeze(['beast','bird','fish','reptile','amphibian','insect','crustacean','plant','humanoid','undead','elemental','ooze','spirit','mist',
 'fur','feather','scale','chitin','shell','hide','bark','resin','wax','stone','metal','bone','flesh','ceramic','aquatic','frost','ember']);
export const FLAMMABLE=Object.freeze(['wood','paper','cloth','fiber','plant','grass','wax','resin','oil','fuel','bark']);
const ITEM_TAGS={wood:['wood'],bark:['wood','bark'],paper:['paper'],book:['paper'],cloth:['cloth'],clothing:['cloth','clothing'],fiber:['fiber'],flax:['fiber'],wool:['fiber'],
 hide:['leather'],leather:['leather'],feather:['feather'],metal:['metal'],iron:['metal'],mineral:['stone'],clay:['earth'],ceramic:['ceramic'],wax:['wax'],oil:['oil','liquid'],
 fuel:['fuel'],carbon:['fuel'],incense:['fuel'],grain:['food','plant'],herb:['plant'],fruit:['food','plant'],water:['water','liquid'],milk:['liquid'],vinegar:['liquid']};
const FEATURE_KINDS={water:['water','liquid'],soil:['earth'],silt_heap:['earth'],levee:['earth'],rock:['stone'],plant:['plant'],room:['indoor'],lamp:['light'],altar:['stone'],road:['earth'],ledge:['stone']};
const MATERIALS={iron:'metal',copper:'metal',bronze:'metal',metal:'metal',wood:'wood',cloth:'cloth',paper:'paper',stone:'stone',clay:'earth',hemp:'fiber'};
const TERRAIN=[['林','forest'],['林','plant'],['草','grass'],['湿','wet'],['泥','wet'],['沼','wet'],['滩','wet'],['盐','salt'],['沙','sand'],['砾','stone'],['岩','stone'],['山','stone'],['崖','stone'],['旱','dry'],['冰','frost'],['雪','frost'],['丘陵','earth'],['平地','earth']];
const WEATHER_TAGS={rain:['wet','raining'],storm:['wet','raining','storm'],snow:['frost','snowing'],fog:['mist']};

const add=(set,list)=>{for(const x of list??[])set.add(x);return set;};
function finish(kind,id,tags,extra={}){
 if([...tags].some(t=>FLAMMABLE.includes(t))&&!tags.has('wet')&&!tags.has('frozen'))tags.add('flammable');
 if(tags.has('metal')||tags.has('wet')||tags.has('aquatic')||tags.has('water'))tags.add('conductive');
 return{kind,id,tags:[...tags].sort(),elements:[...new Set(extra.elements??[])].sort(),affinity:extra.affinity??{weak:[],resist:[]},...(extra.source?{source:extra.source}:{})};
}
export function itemTraits(definition,held=null){
 const tags=new Set(['item']);
 for(const tag of definition?.tags??[])add(tags,[tag,...ITEM_TAGS[tag]??[]]);
 if((held?.moisture??0)>0)tags.add('wet');
 return finish('item',definition?.id,tags);
}
export function creatureTraits(species,actor=null,dead=actor?.status===String.fromCharCode(27515,20129)){
 const tags=add(new Set(['creature']),species?.tags);
 const n=species?.nature;
 if(n?.spirit)tags.add('spirit');
 if(n?.group==='亡灵')tags.add('undead');
 if(n?.group==='元素体')tags.add('elemental');
 const elements=[...tags.has('ember')?['fire']:[],...tags.has('frost')?['cold']:[],...tags.has('aquatic')?['water']:[]];
 const affinity={weak:[...n?.affinity?.weak??[]],resist:[...n?.affinity?.resist??[]]};
 if(dead)tags.add('dead');
 return finish('creature',species?.id,tags,{elements,affinity,source:n?.affinity?'nature':undefined});
}
// A boss may author its own body and material tags. They join the species
// tags and the individual then takes part in the tag rules of the interaction
// table; an explicit species nature still overrides the tactics it names.
export function bossTraits(species,boss,actor=null,dead=actor?.status===String.fromCharCode(27515,20129)){
 const base=creatureTraits(species,actor,dead);
 if(!Array.isArray(boss?.tags)||!boss.tags.length)return base;
 const tags=add(new Set(base.tags.filter(t=>!['flammable','conductive'].includes(t))),boss.tags);
 const elements=[...base.elements,...tags.has('ember')?['fire']:[],...tags.has('frost')?['cold']:[],...tags.has('aquatic')?['water']:[]];
 return finish('creature',species?.id,tags,{elements,affinity:base.affinity,source:'boss'});
}
export function featureTraits(row,state=row?.state,minute=0){
 const tags=add(new Set(['feature',row?.kind]),FEATURE_KINDS[row?.kind]);
 const material=MATERIALS[state?.material];if(material)tags.add(material);
 if(row?.thermalModel?.ignitable)tags.add('fuel');
 if(row?.thermalModel?.dryable)tags.add('absorbent');
 if(row?.fireLine)tags.add('grass');
 const t=state?.thermal;
 if(t?.burning)tags.add('burning');
 if((t?.moistureMg??state?.moistureMg??0)>0||(state?.moisturePercent??0)>=60)tags.add('wet');
 if((state?.waterMl??0)>0)add(tags,['water','liquid']);
 if(Number.isFinite(state?.frozenUntil)&&state.frozenUntil>minute){tags.add('frozen');tags.delete('liquid');}
 if(t&&row?.thermalModel&&t.energyJ/row.thermalModel.heatCapacityJPerC>=60)tags.add('hot');
 return finish('feature',row?.id,tags,{elements:tags.has('burning')?['fire']:[]});
}
export function locationTraits(location,weather=null){
 const tags=new Set(['location']),terrain=location?.terrain??'';
 for(const[word,tag]of TERRAIN)if(terrain.includes(word))tags.add(tag);
 if(weather?.indoors)tags.add('indoor');
 else add(tags,WEATHER_TAGS[weather?.kind]);
 if(tags.has('wet'))tags.delete('dry');
 return finish('location',location?.id,tags,{elements:[...tags.has('raining')?['water']:[],...tags.has('storm')?['lightning']:[],...tags.has('snowing')?['cold']:[]]});
}
const SPELL_KIND_ELEMENT={light:'light',optics:'light',air:'wind',water_earth:'water',environment:'water',mind_space:'mind',dry:'fire'};
const OBJECT_OPERATION={ignite:'fire',heat:'fire',forge_heat:'fire',craft_heat:'fire',fuel:'fire',dry:'fire',extinguish:'water',cool:'cold'};
export function spellTraits(spell){
 const s=spell?.effectSpec??{},elements=new Set();
 const direct=canonicalElement(s.damageType)??canonicalElement(s.medium);if(direct)elements.add(direct);
 if(s.kind==='object'||s.kind==='heat'){const e=OBJECT_OPERATION[s.operation];if(e)elements.add(e);}
 if(SPELL_KIND_ELEMENT[s.kind])elements.add(SPELL_KIND_ELEMENT[s.kind]);
 if(s.kind==='area'&&canonicalElement(s.effect?.damageType))elements.add(canonicalElement(s.effect.damageType));
 for(const t of s.damageTypes??[])if(s.kind!=='protection')elements.add(t);
 return finish('spell',spell?.id,new Set(['spell',s.kind].filter(Boolean)),{elements:[...elements]});
}

const stateOf=doc=>doc?.state??doc;
// traitsOf(engine,stateOrDocument,id,{weather}) — single read entry for any id.
export function traitsOf(engine,doc,id,{weather=null}={}){
 const state=stateOf(doc)??{},minute=state.minute??0;
 if(typeof id!=='string')return null;
 const asset=state.records?.[id]??openingTransportAssets.find(a=>a.id===id&&engine.byId.has(a.owner));
 if(asset?.category==='transport_asset')return finish('item',id,new Set(['item','transport',asset.kind,asset.kind==='pack'?'flesh':'wood',...asset.durability<25?['broken']:[],...asset.wetUntil>minute?['wet']:[]]));
 if(id==='player'||id.startsWith('npc_')||state.creatures?.[id]||id.startsWith('boss_')){
  const view=personBody(engine,state,id),species=engine.byId.get(view?.body.value?.species)??view?.species.value;
  if(species){
   const actor={status:view.status.value},body=view.body.value,boss=view.boss.value;
   const base=boss?.tags?bossTraits(species,boss,actor,isPhysicallyDead(engine,doc,id)):creatureTraits(species,actor,isPhysicallyDead(engine,doc,id)),tags=new Set(base.tags.filter(t=>!['flammable','conductive'].includes(t)));
   add(tags,body?.tags);if(id==='player'||id.startsWith('npc_'))tags.add('person');
   // Borrowed forms change appearance; U6 explicitly retains the real body.
   if(view.form.value)tags.add('shapeshifted');
   return finish(id.startsWith('npc_')||id==='player'?'person':'creature',id,tags,base);
  }
  if(id==='player'||id.startsWith('npc_'))return finish('person',id,new Set(['person',...view?.body.value?.tags??['humanoid','flesh']]));
 }
 if(id.startsWith('feature_')){
  const view=physicalFeature(engine,state,id);if(!view)return null;
  return featureTraits(view.definition.value,view.state.value,minute);
 }
 const definition=state.created?.[id]??engine.byId?.get(id);
 const building=facilityView(engine,state,id);
 if(building){const location=locationTraits(definition,weather),tags=new Set([...location.tags,'building',building.material,...definition.tags??[]]);
  if(building.burning)tags.add('burning');if((state.buildings?.[id]?.wetUntil??0)>minute)tags.add('wet');
  return finish('location',id,tags,{elements:[...location.elements,...building.burning?['fire']:[]]});}
 if(id.startsWith('item_')||state.itemInstances?.[id]){const view=itemView(engine,state,id);return view?itemTraits(view.definition.value,state.itemInstances?.[id]??state.inventory?.[id]):null;}
 if(id.startsWith('monster_')||id.startsWith('boss_')){
  const actor=state.creatures?.[id];
  const species=engine.byId?.get(actor?.species)??(id.startsWith('monster_')?definition:engine.byId?.get(definition?.monster));
  const boss=engine.byId?.get(actor?.boss??(id.startsWith('boss_')?id:null));
  return species?(boss?.tags?bossTraits(species,boss,actor,isPhysicallyDead(engine,doc,id)):creatureTraits(species,actor,isPhysicallyDead(engine,doc,id))):null;
 }
 if(id.startsWith('spell_')||definition?.effectSpec)return spellTraits(definition);
 if(definition&&engine.world?.locations?.some(l=>l.id===id))return locationTraits({...definition,owner:placeView(engine,state,id)?.owner.value},weather);
 return null;
}
export const hasTrait=(traits,tag)=>Boolean(traits?.tags?.includes(tag));
export const traitHas=(engine,doc,id,tag)=>hasTrait(traitsOf(engine,doc,id),tag);
export function validateTraits(world){
 const errors=[];
 for(const s of world.monsters??[]){
  // Tags are optional for draft/fixture worlds; the published catalog carries them.
  if(s.tags===undefined)continue;
  if(!Array.isArray(s.tags)||!s.tags.length)errors.push(`${s.id}: 生物性状标签须为非空列表`);
  else if(s.tags.some(t=>!CREATURE_TAGS.includes(t))||new Set(s.tags).size!==s.tags.length)errors.push(`${s.id}: 生物性状标签不在词表或重复`);
 }
 for(const b of world.bosses??[]){
  if(b.tags===undefined)continue;
  if(!Array.isArray(b.tags)||!b.tags.length||b.tags.some(t=>!CREATURE_TAGS.includes(t))||new Set(b.tags).size!==b.tags.length)errors.push(`${b.id}: 首领体表与材质标签须为词表内不重复的非空列表`);
 }
 return errors;
}
