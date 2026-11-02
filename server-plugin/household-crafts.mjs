// TOWNFOOD C 家常规律: which recipes an adult household member can make from
// family teaching, a hearth derived for every registered home, and the
// utensils those recipes need. Everything is derived from world/rules/
// household-crafts.json plus the recipe/household tables; nothing is listed by
// name and nothing is written back to world/geo.
import {npcAgeAt} from './npc-state.mjs';
import {townLaborMinutes} from './town-income.mjs';

const MARK='household-crafts';
const nutrition=(world,id)=>world.items.find(i=>i.id===id)?.nutrition?.satiety>0;
const cache=new WeakMap();
// Recipes selected purely by the rule's conditions.
export function homeCraftRecipes(world){
 const rule=world.rules?.householdCrafts;if(!rule)return [];
 const key=world.recipes;let hit=cache.get(rule);if(hit?.key===key)return hit.list;
 const c=rule.recipeConditions,edible=new Set(world.items.filter(i=>i.nutrition?.satiety>0).map(i=>i.id)),inputs=new Set();
 for(const r of world.recipes??[])if(edible.has(r.output.item))for(const m of r.materials)inputs.add(m.item);
 const list=(world.recipes??[]).filter(r=>r.skill?.startsWith(c.skillPrefix)&&r.difficulty<=c.maxDifficulty&&(edible.has(r.output.item)||inputs.has(r.output.item)));
 cache.set(rule,{key,list});return list;
}
export const isHomeCraft=(world,recipeId)=>homeCraftRecipes(world).some(r=>r.id===recipeId);
// Adult and physically able, by the same age/body/illness-severity judgement
// the town labour budget uses (a mild illness does not stop cooking).
export function homeCraftKnown(engine,state,id,recipe,minute=state.minute){
 if(!engine.rules.householdCrafts||!isHomeCraft(engine.world,recipe.id))return false;
 const base=engine.byId.get(id),age=npcAgeAt(engine,state,id,minute);
 if(!base||!Number.isFinite(age))return false;
 return townLaborMinutes(engine,{...base,age},state.npcs?.[id]??{})>0;
}
// Floor from years since adulthood; real practice records still add to it.
export function homeCraftFloor(engine,state,id,skill,minute=state.minute){
 const rule=engine.rules.householdCrafts;if(!rule||!homeCraftRecipes(engine.world).some(r=>r.skill===skill))return 0;
 const age=npcAgeAt(engine,state,id,minute);if(!(age>=engine.rules.npcLife.adultAge))return 0;
 return Math.min(rule.proficiency.maximum,(age-engine.rules.npcLife.adultAge)*rule.proficiency.perAdultYear);
}
const hearthHomes=new WeakMap();
function homesOf(world){
 let hit=hearthHomes.get(world.households);if(hit)return hit;
 hit=new Map();for(const h of world.households??[])if(h.homeLocation)hit.set(h.homeLocation,[...(hit.get(h.homeLocation)??[]),h]);
 hearthHomes.set(world.households,hit);return hit;
}
// The household hearth is derived at use, not written into any location: a
// registered home with no cooking station of its own gives its members a free
// private one. Other places and people without a home get none.
export function householdHearth(engine,location,id){
 const rule=engine.rules.householdCrafts;if(!rule||!location)return null;
 const place=engine.byId.get(location);if(place?.workstations?.some(w=>w.kind===rule.hearth.kind))return null;
 const households=(homesOf(engine.world).get(location)??[]).filter(h=>h.members.includes(id));
 if(!households.length)return null;
 const members=[...new Set(households.flatMap(h=>h.members))];
 return {id:`station_${location}_hearth`,kind:rule.hearth.kind,access:'consent',owner:members[0],members,fee:rule.hearth.fee,derived:MARK};
}
// Number of homes that get a derived hearth (reporting and tests).
export function derivedHearthHomes(world){
 const rule=world.rules?.householdCrafts;if(!rule)return [];
 return [...homesOf(world).keys()].filter(id=>!world.locations.find(l=>l.id===id)?.workstations?.some(w=>w.kind===rule.hearth.kind)).sort();
}
// Tools a household is assumed to keep: every tool of a derived recipe whose
// workstation is absent or is the hearth kind.
export function householdUtensils(world){
 const rule=world.rules?.householdCrafts;if(!rule)return [];
 const tools=new Set();
 for(const r of homeCraftRecipes(world))if(!r.workstation||r.workstation===rule.hearth.kind)for(const t of r.tools??[])tools.add(t);
 return [...tools].sort().map(item=>({item,quantity:rule.utensils.quantityPerHousehold,unitPrice:world.items.find(i=>i.id===item)?.basePrice??0}));
}
export const isDerivedHearth=station=>station?.derived===MARK;
