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
export function incomeProfile(p){return {personality:{traits:['勤勉']},voice:{register:'平实',accent:'本地',habits:[],samples:[]},background:`${p.name}一直在本镇生活。`,currentConcern:'照顾家人。',goals:['维持生计'],fears:[],knowledge:{unknown:[]},relationships:[]};}
