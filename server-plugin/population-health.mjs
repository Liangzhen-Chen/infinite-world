// S/I/R are subaccounts of the unseen population, never additional animals.
// Healthy pools need no stored health row; their entire count is susceptible.
import {derived} from './derived.mjs';
import {accrueStock} from './stock.mjs';
const compartments=['S','I','R'];
const channels=['disease:infection','disease:recovery','disease:death'];
const zero=()=>({numerator:'0',denominator:'1'});
function fraction(n,d){
 let a=n,b=d;while(b){const r=a%b;a=b;b=r;}
 return {numerator:String(n/a),denominator:String(d/a)};
}
function plus(a,b){return fraction(BigInt(a.numerator)*BigInt(b.denominator)+BigInt(b.numerator)*BigInt(a.denominator),BigInt(a.denominator)*BigInt(b.denominator));}
function share(a,n,d){return d?fraction(BigInt(a.numerator)*BigInt(n),BigInt(a.denominator)*BigInt(d)):zero();}
// Reuse stock's decimal/exponent parser without rounding a per-head product.
function decimal(value){const row={};accrueStock(row,'rate',value);return row.accruals.rate;}
// Legacy stock accruals include already-settled whole bodies. Only their
// fractional credit is pending. New credits are rationals, including any whole
// credit reunited by a merge; it will settle at the next daily disease step.
function credit(p,key){
 if(p.diseaseRemainders?.[key])return p.diseaseRemainders[key];
 const old=p.accruals?.[key];return old?fraction(BigInt(old.numerator)%BigInt(old.denominator),BigInt(old.denominator)):zero();
}
function saveCredit(p,key,value){
 p.diseaseRemainders??={};p.diseaseRemainders[key]=value;
 if(p.accruals)delete p.accruals[key];
}
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
 // Transfer the pending exposure with the relevant S or I subaccount. A full
 // withdrawal carries even a credit whose eligible compartment is now empty.
 for(const key of amount?channels:[]){
  const old=credit(population,key);if(old.numerator==='0')continue;
  const k=key==='disease:infection'?'S':'I';
  const part=amount===population.count?old:share(old,taken[k],health[k]);
  taken.diseaseRemainders??={};taken.diseaseRemainders[key]=part;
  saveCredit(population,key,fraction(BigInt(old.numerator)*BigInt(part.denominator)-BigInt(part.numerator)*BigInt(old.denominator),BigInt(old.denominator)*BigInt(part.denominator)));
 }
 if(amount&&population.disease)taken.disease=population.disease;
 population.count-=amount;
 if(population.health)population.health=Object.fromEntries(compartments.map(k=>[k,health[k]-taken[k]]));
 return taken;
}
export function addPopulation(population,health){
 const current=populationHealth(population),amount=health.S+health.I+health.R;
 if(compartments.some(k=>!Number.isSafeInteger(health[k])||health[k]<0)||!Number.isSafeInteger(population.count+amount))throw Error('种群转入数量无效');
 if(health.disease&&population.disease&&health.disease!==population.disease)throw Error('不同病种不能合并同一 S/I/R 子账户');
 for(const key of channels)if(health.diseaseRemainders?.[key])saveCredit(population,key,plus(credit(population,key),health.diseaseRemainders[key]));
 if(health.disease)population.disease=health.disease;
 population.count+=amount;
 if(population.health||health.I||health.R)population.health=Object.fromEntries(compartments.map(k=>[k,current[k]+health[k]]));
}
// Largest remainder allocation of shared integer events to real subaccounts.
function allocate(amount,weights,limits){
 const out=weights.map(()=>0);let left=amount,active=weights.map((_,i)=>i).filter(i=>limits[i]>0);
 while(left&&active.length){
  const sum=active.reduce((n,i)=>plus(n,weights[i]),zero()),fallback=sum.numerator==='0';
  const total=fallback?fraction(BigInt(active.reduce((n,i)=>n+limits[i],0)),1n):sum;
  const quota=i=>{
   const w=fallback?fraction(BigInt(limits[i]),1n):weights[i];
   return {n:BigInt(left)*BigInt(w.numerator)*BigInt(total.denominator),d:BigInt(w.denominator)*BigInt(total.numerator)};
  };
  const full=active.filter(i=>{const q=quota(i);return q.n>=BigInt(limits[i])*q.d;});
  if(full.length){for(const i of full){out[i]=limits[i];left-=out[i];}active=active.filter(i=>!full.includes(i));continue;}
  const order=active.map(i=>{const q=quota(i);out[i]=Number(q.n/q.d);return {i,n:q.n%q.d,d:q.d};}).sort((a,b)=>{const x=a.n*b.d,y=b.n*a.d;return x===y?a.i-b.i:x>y?-1:1;});
  left-=active.reduce((n,i)=>n+out[i],0);
  for(const {i}of order)if(left){out[i]++;left--;}
 }
 if(left)throw Error('疫病事件分配超出子账户');
 return out;
}
// One absolute daily step per physical contact group. K is contact-space
// capacity, not current N: density-dependent beta*S*I/K. An array represents
// bookkeeping shards in the SAME space, never independently isolated herds.
// Subjects can differ so exposure/treatment corrections remain cohort-local.
export function advancePopulationDisease(d,engine,p,subject,species,capacity){
 const entries=(Array.isArray(p)?p:[p]).map((row,i)=>({row,subject:Array.isArray(subject)?subject[i]:subject})).sort((a,b)=>String(a.row.id??'').localeCompare(String(b.row.id??''),'en'));
 const members=entries.map(({row})=>row),before=members.map(populationHealth),sources=before.reduce((n,h)=>n+h.I,0);
 if(!sources)return 0;
 if(!Number.isSafeInteger(capacity)||capacity<0)throw Error('疫病接触容量无效');
 const diagnoses=members.map(row=>row.disease??species.ecology?.disease);
 if(new Set(diagnoses).size>1)throw Error('不同病种不能合并同一接触群');
 const diagnosis=diagnoses[0],disease=diagnosis?engine.world.primitiveTables.health.rows.find(row=>row.key===diagnosis):null;
 if(diagnosis&&!disease)throw Error(`未登记种群病种：${diagnosis}`);
 const rates=members.map((row,i)=>{
  const rate=(id,numerator,denominator=1)=>{
   const base=numerator/denominator,value=derived(engine,d.document,id,entries[i].subject,{base,target:species.id});
   if(value!==base)return decimal(value);
   // Preserve the declared course denominator (including fractional days).
   // Seven infected at 1/7 recover one, not floor(.99999999999999995).
   const n=decimal(numerator),q=decimal(denominator);
   return fraction(BigInt(n.numerator)*BigInt(q.denominator),BigInt(n.denominator)*BigInt(q.numerator));
  };
  const course=disease?.courseDays??1;
  return {infection:rate('health:infectionRate',disease?.R0??0,course),recovery:rate('health:recoveryRate',disease?1:0,course),mortality:rate('health:mortalityRate',disease?.lethality??0,course)};
 });
 if(!rates.some(r=>Object.values(r).some(v=>v.numerator!=='0')))return 0;
 const pending={};
 const settle=(key,inputs,limits)=>{
  const old=members.reduce((sum,row)=>plus(sum,credit(row,key)),zero());
  // Add each cohort's expectation before quantizing the group once. Reading
  // an extra cohort never draws a new epidemic or rounds an extra body.
  const weights=inputs.map(({rate,periods,divisor=1},i)=>{
   const w=share(rate,periods,divisor);
   // A daily probability saturates at one under crowding. Excess pressure on
   // one cohort must never infect a different cohort with zero susceptibility.
   return BigInt(w.numerator)>BigInt(limits[i])*BigInt(w.denominator)?fraction(BigInt(limits[i]),1n):w;
  });
  if(weights.every(w=>w.numerator==='0')){pending[key]=old;return limits.map(()=>0);}
  const after=weights.reduce(plus,old);
  let amount=Number(BigInt(after.numerator)/BigInt(after.denominator));
  pending[key]=fraction(BigInt(after.numerator)%BigInt(after.denominator),BigInt(after.denominator));
  const eligible=limits.map((n,i)=>weights[i].numerator==='0'?0:n);
  amount=Math.min(eligible.reduce((a,b)=>a+b,0),amount);
  return allocate(amount,weights,eligible);
 };
 const deaths=settle('disease:death',before.map((h,i)=>({rate:rates[i].mortality,periods:h.I})),before.map(h=>h.I));
 const remaining=before.map((h,i)=>h.I-deaths[i]);
 const recovered=settle('disease:recovery',remaining.map((n,i)=>({rate:rates[i].recovery,periods:n})),remaining);
 const infected=settle('disease:infection',before.map((h,i)=>({rate:capacity>0?rates[i].infection:zero(),periods:BigInt(h.S)*BigInt(sources),divisor:capacity||1})),before.map(h=>h.S));
 for(const [i,row]of members.entries()){
  row.health={S:before[i].S-infected[i],I:before[i].I+infected[i]-recovered[i]-deaths[i],R:before[i].R+recovered[i]};
  row.count-=deaths[i];row.diseaseDeaths=(row.diseaseDeaths??0)+deaths[i];populationHealth(row);
  for(const key of channels){
   const k=key==='disease:infection'?'S':'I',weights=before.map(h=>h[k]),total=weights.reduce((a,b)=>a+b,0);
   saveCredit(row,key,total?share(pending[key],weights[i],total):i===0?pending[key]:zero());
  }
 }
 return deaths.reduce((a,b)=>a+b,0);
}
