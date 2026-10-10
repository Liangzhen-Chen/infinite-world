import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {economyW3Trades} from '../world/design/economy-w3-trades.mjs';
import {inspectTrades} from './w3-trades.mjs';
import {atomicJSON} from '../server-plugin/storage.mjs';

export function tradesPublicationFiles(candidate,bones,baseline){
 const people=structuredClone(baseline);
 for(const plan of bones.supply){
  const npc=people.find(row=>row.id===plan.npc);if(!npc)throw new Error(`基础名册缺少供货者 ${plan.npc}`);
  npc.inventory??={};
  for(const[id,quantity]of Object.entries(plan.stock)){
   if(!candidate.items.some(row=>row.id===id))throw new Error(`供货物品未通过审核 ${id}`);
   if(!Object.hasOwn(npc.inventory,id))npc.inventory[id]=quantity;
  }
 }
 return [['world/meta/items.json',candidate.items],['world/meta/recipes.json',candidate.recipes],['world/people/baseline.json',people]];
}
async function main(){
 const world=await loadWorld(),bones=economyW3Trades(world),{candidate}=await inspectTrades(world,bones);
 const baseline=JSON.parse(await fs.readFile('world/people/baseline.json','utf8'));
 const files=tradesPublicationFiles(candidate,bones,baseline),publish=process.argv.includes('--publish');
 if(publish){
  const previous=await Promise.all(files.map(async([file])=>[file,await fs.readFile(file)]));
  try{for(const[file,value]of files)await atomicJSON(file,value);}
  catch(error){for(const[file,bytes]of previous)await fs.writeFile(file,bytes);throw error;}
 }
 console.log(JSON.stringify({published:publish,items:candidate.items.length,recipes:candidate.recipes.length,files:files.map(([file])=>file),suppliers:bones.supply.length,scope:'W3 第二批源目录；不部署酒馆或修改存档'}));
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/w3-trades-publish.mjs'))await main();
