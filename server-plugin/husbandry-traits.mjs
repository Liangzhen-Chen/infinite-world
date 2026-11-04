// Husbandry products are derived, never listed per species (B / AGENTS red
// line). A species declares physiological attributes under `husbandry`
// (bodyMassKg, lactation, layingIntervalDays, coat, taxon); an item declares
// which attribute yields it (`animalProduct: {from, part?, when?}`); the
// coefficients live in balance/yields.json (husbandry.traits, husbandry.carcass).
//
// Exit shapes installed on the loaded species object:
//   s.husbandry.yields.alive = [{item, perHeadDay, collectMinutes, from}]
//   s.drops                  = [{item, amount}]   (carcass, read by wildlife)
// A species without bodyMassKg keeps its authored drops and has no alive yield.

const param=(world,id)=>(world.balance?.yields??world.primitiveTables?.yields)?.params?.find(p=>p.id===id)?.value;
const list=v=>v===undefined?[]:[].concat(v);
// An item's `when` is a conjunction over species attributes (husbandry fields
// and monster tags). More satisfied constraints = more specific item.
function specificity(when,s){
 let n=0;
 for(const [key,want] of Object.entries(when??{})){
  const have=key==='tags'?s.tags??[]:list(s.husbandry?.[key]);
  if(!list(want).some(w=>have.includes(w)))return -1;
  n++;
 }
 return n;
}
export function animalProductItem(world,s,from,part){
 const candidates=world.items.filter(i=>i.animalProduct?.from===from&&(i.animalProduct.part??null)===(part??null))
  .map(i=>({i,n:specificity(i.animalProduct.when,s)})).filter(c=>c.n>=0);
 if(!candidates.length)return null;
 const best=Math.max(...candidates.map(c=>c.n)),top=candidates.filter(c=>c.n===best);
 if(top.length>1)throw Error(`畜产物归属不唯一：${s.id} ${from}${part?':'+part:''} → ${top.map(c=>c.i.id).join('、')}`);
 return top[0].i;
}
const bodyMass=s=>s.husbandry?.bodyMassKg??s.bodyMassKg;
export function yearDays(world){const c=world.rules?.calendar;return c?.daysPerMonth&&c?.monthsPerYear?c.daysPerMonth*c.monthsPerYear:360;}

// Alive products per head and day, in item units, from body mass and the
// species' own physiology. Feed and births scale them at settlement time.
function aliveYields(world,s){
 const p=s.husbandry,mass=bodyMass(s),traits=param(world,'husbandry.traits');
 if(!Number.isFinite(mass)||mass<=0||!traits)return [];
 const rows=[];
 const add=(from,kgPerHeadDay)=>{
  if(!(kgPerHeadDay>0))return;
  const item=animalProductItem(world,s,from);if(!item)return;
  rows.push({item:item.id,perHeadDay:kgPerHeadDay/item.weight,collectMinutes:Math.max(1,Math.round(item.weight*traits.collectMinutesPerKg[from])),from});
 };
 if(p.lactation>0)add('lactation',mass*p.lactation);
 if(p.layingIntervalDays>0)add('laying',mass*traits.eggMassPerBodyKg/p.layingIntervalDays);
 const coat=traits.coatKgPerBodyKgYear[p.coat];
 if(coat>0)add('coat',mass*coat/yearDays(world));
 return rows;
}
// Carcass parts by body mass; hide and feathers follow the coat kind.
function carcassDrops(world,s){
 const p=s.husbandry,mass=bodyMass(s),carcass=param(world,'husbandry.carcass');
 if(!Number.isFinite(mass)||mass<=0||!carcass)return null;
 const drops=[];
 for(const [part,rule] of Object.entries(carcass)){
  if(rule.coats&&!rule.coats.includes(p.coat))continue;
  const item=animalProductItem(world,s,'carcass',part);if(!item)continue;
  const amount=Math.floor(mass*rule.fraction/item.weight+1e-9);
  if(amount>0)drops.push({item:item.id,amount});
 }
 return drops;
}
export function installHusbandryTraits(world){
 for(const s of world.monsters){
  if(!s.husbandry)continue;
  s.husbandry.yields={alive:aliveYields(world,s)};
  const drops=carcassDrops(world,s);if(drops)s.drops=drops;
 }
 return world;
}
