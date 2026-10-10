import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {economyW3Journey} from '../world/design/economy-w3-journey.mjs';
import {inspectJourney} from './w3-journey.mjs';
import {tradesPublicationFiles} from './w3-trades-publish.mjs';
import {atomicJSON} from '../server-plugin/storage.mjs';

async function main(){
 const world=await loadWorld(),bones=economyW3Journey(world),{candidate}=await inspectJourney(world,bones);
 const baseline=JSON.parse(await fs.readFile('world/people/baseline.json','utf8'));
 const files=tradesPublicationFiles(candidate,bones,baseline),publish=process.argv.includes('--publish');
 if(publish){
  const previous=await Promise.all(files.map(async([file])=>[file,await fs.readFile(file)]));
  try{for(const[file,value]of files)await atomicJSON(file,value);}
  catch(error){for(const[file,bytes]of previous)await fs.writeFile(file,bytes);throw error;}
 }
 console.log(JSON.stringify({published:publish,items:candidate.items.length,recipes:candidate.recipes.length,files:files.map(([file])=>file),suppliers:bones.supply.length,scope:'W3 第三批源目录；不部署酒馆或修改存档'}));
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/w3-journey-publish.mjs'))await main();
