import fs from 'node:fs/promises';
import {loadWorld} from '../../tools/load-world.mjs';
import {WorldEngine} from '../../server-plugin/engine.mjs';
import {applyPatches} from '../../server-plugin/storage.mjs';
import {townHouseholds} from '../../server-plugin/town-income.mjs';
export const SID='loc_bs',DAY=1440;
export async function incomeFixture(world=null,seed='town-income'){
 world??=await loadWorld();
 let engine=new WorldEngine(structuredClone(world));const legacy=JSON.parse(await fs.readFile(new URL('../fixtures/legacy/seed.json',import.meta.url),'utf8'));
 let document=engine.createCharacter(legacy,{},seed);
 return {get engine(){return engine;},get document(){return document;},replace(next){document=next;},reload(){document=JSON.parse(JSON.stringify(document));engine=new WorldEngine(structuredClone(world));},async act(input){const result=await engine.reduce(document,input);document=applyPatches(document,result.patches);return result;}};
}
// A separate authored economy used to exercise inputs that the formal town
// still lacks. These are finite capital/harvest facts, not survival targets.
export async function fundedIncomeWorld(){
 const world=await loadWorld(),engine=new WorldEngine(world),homes=townHouseholds(engine,SID),facts=world.townIncome.settlements.find(r=>r.settlement===SID);
 const known=homes.reduce((n,h)=>n+h.members.reduce((m,p)=>m+(p.coins??0),0),0);
 const fact=value=>({value,basis:'Authored simulation capital/last-season stock; not a change to the formal world.'});
 facts.money=fact(known+world.rules.questSources.ledgers.find(r=>r.settlement===SID).opening.treasury+1009);
 facts.assetClasses=[{id:'capital',weight:fact(2)},{id:'none',weight:fact(0)}];
 facts.households=homes.map((h,i)=>({household:h.id,livelihood:'registered-capital',assetClass:h.pending&&i%2?'none':'capital',basis:'Explicit household capital register in this simulation.'}));
 facts.grain=[{item:'item_oats',area:fact(100),historicalYield:fact(10),seasonFactor:fact(1),seed:fact(100),eaten:fact(100),rentTax:fact(100),loss:fact(100)}];
 return world;
}
export function incomeProfile(p){return {personality:{traits:['勤勉']},voice:{register:'平实',accent:'本地',habits:[],samples:[]},background:`${p.name}一直在本镇生活。`,currentConcern:'照顾家人。',goals:['维持生计'],fears:[],knowledge:{unknown:[]},relationships:[]};}
