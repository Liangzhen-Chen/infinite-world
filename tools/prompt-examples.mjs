import fs from 'node:fs/promises';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {createCampaign} from '../server-plugin/legacy/core.js';

// Build receipts with the shipped rules; never invent successful tool outputs.
export async function buildToolExamples(world){
    const seed=JSON.parse(await fs.readFile(new URL('../server-plugin/legacy/seed.json',import.meta.url),'utf8'));
    const engine=new WorldEngine(world);
    const document=engine.createCharacter(createCampaign(seed),{name:'示例旅人'},'prompt-example');
    const args={destination:'loc_hw_dock'},id='fields_example_walk';
    const output=await engine.reduce(document,{tool:'world_move',args,eventId:id});
    return[
        {role:'user',content:'我走到旧渡口，先在岸边停下。'},
        {role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name:'world_move',arguments:JSON.stringify(args)}}]},
        {role:'tool',tool_call_id:id,content:JSON.stringify(output.result)},
        {role:'assistant',content:'你沿路走到旧渡口，在岸边停了下来。\n<回合 额外="0分" 地点="loc_hw_dock" 在场=""/>'},
    ];
}
