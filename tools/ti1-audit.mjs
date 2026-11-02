// I1 acceptance: real campaign actions only; also runs unchanged against TFA.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';

const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const root=path.resolve(option('--root',path.resolve(import.meta.dirname,'..'))),days=Number(option('--days',30)),repeats=Number(option('--repeat',2)),output=option('--out',null);
if(!Number.isSafeInteger(days)||days<1||!Number.isSafeInteger(repeats)||repeats<1)throw Error('Audit days/repeats must be positive integers');
const moduleAt=rel=>import(pathToFileURL(path.join(root,rel)).href);
const [{loadWorld},{WorldEngine},{applyPatches},{auditLedger},{fromRational}]=await Promise.all(['tools/load-world.mjs','server-plugin/engine.mjs','server-plugin/storage.mjs','server-plugin/ledger.mjs','server-plugin/det-math.mjs'].map(moduleAt));
const legacy=JSON.parse(await fs.readFile(new URL('../tests/fixtures/legacy/seed.json',import.meta.url),'utf8')),world=await loadWorld(path.join(root,'world'));
const runs=[];console.log(JSON.stringify({pid:process.pid,root,days,repeats}));
for(let repeat=0;repeat<repeats;repeat++){
 const engine=new WorldEngine(structuredClone(world));let doc=engine.createCharacter(legacy,{},'ti1-month');
 const start=performance.now();
 for(let day=0;day<days;day++){
  const result=await engine.reduce(doc,{tool:'world_time',args:{minutes:1440},eventId:`ti1-day-${day}`});doc=applyPatches(doc,result.patches);
 }
 const ms=performance.now()-start,number=v=>typeof v==='number'?v:fromRational(v);
 const groups=Object.values(doc.state.records).filter(r=>r.statisticalPopulation&&r.settlement==='loc_bs').map(r=>({id:r.owner,group:r.group??'town-pool',units:r.beneficiaryUnits??694,coins:r.coins,inventory:r.inventory,
  missingSatiety:number(r.missingSatiety),consumedSatiety:number(r.consumedSatiety),demandSatiety:number(r.demandSatiety),earned:r.labor.earned,paid:r.labor.paid,
  workMinutes:r.labor.sources?Object.values(r.labor.sources).reduce((n,v)=>n+v,0):r.labor.minutes,
  workSources:r.labor.sources??{employment:r.labor.minutes,service:0,self:0,cooking:0},
  incomeSources:r.labor.incomeSources??{employment:{earned:r.labor.earned,paid:r.labor.paid},service:{earned:0,paid:0}},
  salesRevenue:(doc.state.records[`finance_profit:${r.owner}`]?.entries??[]).reduce((n,s)=>n+s.revenue,0)}));
 const visits=Object.values(doc.state.records).filter(r=>r.category==='customer_flow').flatMap(r=>r.visits??[]).filter(r=>r.npc?.startsWith('food-demand:loc_bs')&&r.outcome==='bought');
 const dayNeed=groups.reduce((n,r)=>n+r.demandSatiety,0)/(days*694);
 for(const group of groups){group.missingMeals=group.missingSatiety/dayNeed;const bought=visits.filter(r=>r.npc===group.id);group.purchases=bought.reduce((n,r)=>n+r.quantity,0);group.purchaseCoins=bought.reduce((n,r)=>n+r.paid,0);}
 const audit=auditLedger(doc.ledger);if(audit.length)throw Error(JSON.stringify(audit));
 runs.push({ms,groups,purchases:visits.reduce((n,r)=>n+r.quantity,0),purchaseCoins:visits.reduce((n,r)=>n+r.paid,0),missingMeals:groups.reduce((n,r)=>n+r.missingSatiety,0)/dayNeed,ledgerErrors:audit.length});
 console.log(JSON.stringify({repeat,ms,purchases:runs.at(-1).purchases,missingMeals:runs.at(-1).missingMeals}));
}
const result={root,days,repeats,totalMs:runs.reduce((n,r)=>n+r.ms,0),runs};
if(output)await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');else console.log(JSON.stringify(result));
