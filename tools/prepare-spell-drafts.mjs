import fs from 'node:fs/promises';
import {spellBlueprints}from'../world/design/spell-blueprints.mjs';
const spells=spellBlueprints();
await fs.mkdir('world/drafts/spells',{recursive:true});
for(let start=0;start<spells.length;start+=14){
    const batch=spells.slice(start,start+14);await fs.writeFile(`world/drafts/spells/blueprint-${String(start/14).padStart(2,'0')}.json`,JSON.stringify(batch,null,2)+'\n');
}
console.log(JSON.stringify({drafts:spells.length,published:false,scope:'手写机制骨架，待逐项补充理论/失败/管制/反制/社会后果与审查'}));
