import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {economyW3,economyW3Supply} from '../world/design/economy-w3.mjs';
import {readApprovedContent} from './content-pipeline.mjs';
import {assembleW3,w3Context,w3Revision,validateW3Draft,closestW3Similarity} from './w3-content.mjs';
import {validateWorld} from './validate-world.mjs';
import {atomicJSON} from '../server-plugin/storage.mjs';

const world=await loadWorld(),bones=economyW3(world),blocklist=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8'));
const lore=[];
for(const kind of ['items','recipes']){
  const rows=await readApprovedContent(`world/drafts/w3/${kind}`,bones[kind],{contextFor:entry=>w3Context(world,bones,entry),revision:w3Revision});
  for(const row of rows){
    const entry=bones[kind].find(entry=>entry.id===row.id),validation=validateW3Draft(row,entry,blocklist);
    if(validation.errors.length)throw new Error(`${row.id}: ${validation.errors.join('；')}`);
    const other=closestW3Similarity(row,[...rows,...world[kind].filter(other=>!bones[kind].some(entry=>entry.id===other.id))]);
    if(other.score>=.35)throw new Error(`${row.id}与${other.id}说明相似度${other.score}，须定点重写`);
  }
  lore.push(...rows);
}
const candidate=assembleW3(world,bones,lore);
for(const plan of economyW3Supply){
  const npc=candidate.npcs.find(row=>row.id===plan.npc);if(!npc)throw new Error('供货者不存在');
  for(const [id,quantity]of Object.entries(plan.stock)){
    if(!candidate.items.some(row=>row.id===id))continue;
    if(!Object.hasOwn(npc.inventory,id))npc.inventory[id]=quantity;
  }
}
const validation=validateWorld(candidate,{stage:'engine'});if(!validation.ok)throw new Error(validation.errors.join('\n'));
if(process.argv.includes('--publish')){
  // Source catalogue only. No user save, dist or SillyTavern file is touched.
  const files=[['world/meta/items.json',candidate.items],['world/meta/recipes.json',candidate.recipes],['world/people/baseline.json',candidate.npcs]];
  const previous=await Promise.all(files.map(async([file])=>[file,await fs.readFile(file)]));
  try{for(const[file,value]of files)await atomicJSON(file,value);}catch(error){for(const[file,bytes]of previous)await fs.writeFile(file,bytes);throw error;}
}
console.log(JSON.stringify({published:process.argv.includes('--publish'),items:candidate.items.length,recipes:candidate.recipes.length,scope:'W3家用器物首批源目录；未部署酒馆；400/200仍为最终目标'}));
