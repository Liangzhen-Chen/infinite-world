// S/I/R are subaccounts of the unseen population, never additional animals.
// Healthy pools need no stored health row; their entire count is susceptible.
import {derived} from './derived.mjs';
import {accrueStock} from './stock.mjs';
const compartments=['S','I','R'];
export function populationHealth(population){
 const health=population.health??{S:population.count,I:0,R:0};
 if(!Number.isSafeInteger(population.count)||population.count<0||compartments.some(k=>!Number.isSafeInteger(health[k])||health[k]<0)||health.S+health.I+health.R!==population.count)throw Error('种群 S/I/R 子账户不守恒');
 return {...health};
}
// Largest remainder apportionment keeps integer transfers exact and stable.
// Callers pass the returned compartments to the receiving pool or individual.
export function takePopulation(population,amount){
 const health=populationHealth(population);
 if(!Number.isSafeInteger(amount)||amount<0||amount>population.count)throw Error('种群转出数量无效');
 const taken={S:0,I:0,R:0};
 if(amount){
  const total=BigInt(population.count),remainders=[];
  for(const key of compartments){const units=BigInt(health[key])*BigInt(amount);taken[key]=Number(units/total);remainders.push({key,remainder:units%total});}
  remainders.sort((a,b)=>a.remainder===b.remainder?compartments.indexOf(a.key)-compartments.indexOf(b.key):a.remainder>b.remainder?-1:1);
  let left=amount-taken.S-taken.I-taken.R;
  for(const {key} of remainders){if(!left)break;taken[key]++;left--;}
 }
 population.count-=amount;
 if(population.health)population.health=Object.fromEntries(compartments.map(k=>[k,health[k]-taken[k]]));
 return taken;
}
export function addPopulation(population,health){
 const current=populationHealth(population),amount=health.S+health.I+health.R;
 if(compartments.some(k=>!Number.isSafeInteger(health[k])||health[k]<0)||!Number.isSafeInteger(population.count+amount))throw Error('种群转入数量无效');
 population.count+=amount;
 if(population.health||health.I||health.R)population.health=Object.fromEntries(compartments.map(k=>[k,current[k]+health[k]]));
}
// Absolute daily disease step shared by wild and owned population accounts.
export function advancePopulationDisease(d,engine,p,subject,species,capacity){
 const before=populationHealth(p);if(!before.I)return 0;
 const diagnosis=p.disease??species.ecology?.disease;
 const disease=diagnosis?engine.world.primitiveTables.health.rows.find(row=>row.key===diagnosis):null;
 if(diagnosis&&!disease)throw Error(`未登记种群病种：${diagnosis}`);
 const rate=(id,base)=>derived(engine,d.document,id,subject,{base,target:species.id});
 const infection=rate('health:infectionRate',disease?disease.R0/disease.courseDays:0),recovery=rate('health:recoveryRate',disease?1/disease.courseDays:0),mortality=rate('health:mortalityRate',disease?disease.lethality/disease.courseDays:0);
 if(!infection&&!recovery&&!mortality)return 0;
 const died=Math.min(before.I,accrueStock(p,'disease:death',before.I*mortality));
 const recovered=Math.min(before.I-died,accrueStock(p,'disease:recovery',(before.I-died)*recovery));
 const infected=Math.min(before.S,accrueStock(p,'disease:infection',capacity>0?before.S*infection*before.I/capacity:0));
 p.health={S:before.S-infected,I:before.I+infected-recovered-died,R:before.R+recovered};
 p.count-=died;p.diseaseDeaths=(p.diseaseDeaths??0)+died;populationHealth(p);return died;
}
