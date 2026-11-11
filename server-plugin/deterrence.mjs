// 队伍威慑（附录 A §A.16 combat:deterrence）：护送方战力、装备、护送义务与标签 → 槽的 base。
// 承运报价与遭遇/劫掠候选读同一个值；系数在 balance/combat.json 的 deterrence.party。
import combatBalance from '../world/rules/tables/balance/combat.json' with {type:'json'};

const rule=e=>(e.world.balance?.combat??combatBalance).params.find(p=>p.id==='deterrence.party').value;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
// 与 combat.derivedStats 同一组系数（跨包不互相 import），只取攻 + 防两项。
function basePower(e,level,attributes,equipment={}){
 const c=e.rules.combat.character,a=attributes??{};
 const attack=c.attackBase+level*c.attackPerLevel+((a.力量??10)-10)*c.attackPerStrength+(equipment.attack??0);
 const defense=Math.max(0,c.defenseBase+level*c.defensePerLevel+((a.体质??10)-10)*c.defensePerConstitution+(equipment.defense??0));
 return attack+defense;
}
// 装备 = 护卫行囊里真实持有、且等级够用的物品：最好的一件兵器计攻，护具防御相加。
export function guardEquipment(e,d,id){
 const n=d.get('state','npcs',id),base=e.byId.get(id),level=n?.level??base?.level??1,gates=e.rules.equipment;
 let attack=0,defense=0;
 for(const item of Object.keys(n?.inventory??{}).sort()){
  const def=e.byId.get(item),combat=def?.combat;if(!combat||e.quantity(d,id,item)<1)continue;
  if(level<gates.requiredLevels[gates.qualities.indexOf(def.quality)])continue;
  if((combat.attack??0)>attack)attack=combat.attack;
  defense+=combat.defense??0;
 }
 return {attack,defense};
}
export function guardPower(e,d,id){
 const n=d.get('state','npcs',id),base=e.byId.get(id);
 return basePower(e,n?.level??base?.level??1,n?.attributes??base?.attributes,guardEquipment(e,d,id));
}
// guards：在场护卫；bonded：其中受本队伍护送义务约束者；tags：队伍/车辆带的标签。
export function partyDeterrence(e,d,{guards=[],bonded=[],tags=[]}={}){
 const r=rule(e),reference=basePower(e,r.referenceLevel);
 const members=[...new Set(guards)].sort().map(id=>{
  const power=guardPower(e,d,id),weight=clamp(power/reference,r.minWeight,r.maxWeight)*(bonded.includes(id)?1+r.bondedBonus:1);
  return {id,power,weight};
 });
 const strength=members.reduce((n,m)=>n+m.weight,0),open=1/(strength+1);
 const share=Math.min(1,[...new Set(tags)].reduce((n,t)=>n+(r.tagShare[t]??0),0));
 return {base:1-open*(1-share),strength,members,tagShare:share};
}
