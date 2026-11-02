// TOWNFOOD A: real 30-day advance, and paired current/base golden traces.
// --source=<baseline root> reads an isolated source snapshot, never a save.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const source=path.resolve(process.argv.find(a=>a.startsWith('--source='))?.slice(9)??root),base=source!==root;
const mod=p=>import(pathToFileURL(path.join(source,p)).href);
const {loadWorld}=await mod('tools/load-world.mjs'),{WorldEngine}=await mod('server-plugin/engine.mjs');
const {applyPatches}=await mod('server-plugin/storage.mjs');
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/legacy/seed.json'),'utf8'));
const output=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
const run=async(e,doc,minutes,id)=>{const r=await e.reduce(doc,{tool:'world_time',args:{minutes},eventId:id});return {doc:applyPatches(doc,r.patches),result:r};};
let report;
if(process.argv.includes('--bench')){
 console.error(`TFA_BENCH_PID=${process.pid}`);
 const {setup,wait}=await mod('tests/farm-pests-fixture.mjs'),{c,run}=setup('bench');
 let doc=c;const begin=performance.now();
 for(let i=0;i<2;i++)doc=await wait(run,doc,30*1440,`b${i}`);
 report={base,step:30,n:2,ms:Math.round(performance.now()-begin)};
}else if(process.argv.includes('--golden')){
 report={};
 for(const [name,steps]of Object.entries({full:[1440,1440,1440,1033,7200],quiet:[1440,1440,20160,37]})){
  const w=structuredClone(world);if(name==='quiet')for(const n of w.npcs){delete n.schedule;delete n.tier;}
  const e=new WorldEngine(w);let doc=e.createCharacter(legacy,{},name==='quiet'?'advance-quiet':'advance-registry');report[name]=[];
  for(const [i,minutes]of steps.entries()){const next=await run(e,doc,minutes,`step_${i}`);doc=next.doc;report[name].push({state:doc.state,
   patches:next.result.patches.filter(p=>p.path[0]!=='ledger'&&p.path[0]!=='holdings'),messages:next.result.messages});}
 }
}else{
 const e=new WorldEngine(world),initial=e.createCharacter(legacy,{},'townfood-audit');
 const {doc}=await run(e,initial,30*1440,'townfood-30-days');
 report={days:30,towns:Object.fromEntries(Object.entries(doc.state.records).filter(([,r])=>r.statisticalPopulation&&doc.state.settlements[r.settlement]?.granary===false)
  .map(([id,r])=>[r.settlement,{account:id,demandSatiety:r.demandSatiety,consumedSatiety:r.consumedSatiety,missingSatiety:r.missingSatiety,
   unmetMeals:doc.state.settlements[r.settlement].unmetMeals,coins:r.coins,labor:r.labor}]))};
}
if(output)await fs.writeFile(path.resolve(output),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(process.argv.includes('--golden')?{base,output,scenarios:Object.keys(report)}:report));
