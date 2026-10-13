import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../../tools/load-world.mjs';
import {applyDepthDraft} from '../../tools/npc-depth-content.mjs';

// Exercise the original ten-person amendments against their reviewed edition.
// Later five-village depth publications have their own exact receipt tests.
export async function yupoFirstEdition(){
 const world=await loadWorld(),candidate=JSON.parse(await fs.readFile('world/drafts/w1/villages/candidate.json','utf8'));
 world.npcs=world.npcs.map(n=>candidate.npcs.find(row=>row.id===n.id)??n);
 for(const batch of ['yupo-depth','yupo-depth-next']){
  const root=path.resolve('world/drafts/w1',batch),base=JSON.parse(await fs.readFile(path.join(root,'base.json'),'utf8'));
  for(const before of base){const {draft}=JSON.parse(await fs.readFile(path.join(root,before.id+'.json'),'utf8'));world.npcs[world.npcs.findIndex(n=>n.id===before.id)]=applyDepthDraft(before,draft);}
 }
 return world;
}

// Keep relative design-module imports valid without changing frozen source bytes.
export async function copyWorldFixture(parent){
 const root=path.join(parent,'world');
 await fs.symlink(path.resolve('tools'),path.join(parent,'tools'),'junction');
 await fs.cp(path.resolve('world'),root,{recursive:true});
 return root;
}
