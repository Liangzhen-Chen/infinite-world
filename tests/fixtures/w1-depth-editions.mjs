import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../../tools/load-world.mjs';
import {applyDepthDraft} from '../../tools/npc-depth-content.mjs';
import {localFacts} from '../../world/design/t155-village-wildlife.mjs';

// Exercise the original ten-person amendments against their reviewed edition.
// Later five-village depth publications have their own exact receipt tests.
export async function yupoFirstEdition(){
 const world=await loadWorld(),candidate=JSON.parse(await fs.readFile('world/drafts/w1/villages/candidate.json','utf8'));
 // T155's later notices are not part of the original village publication.
 for(const profile of world.settlementProfiles)profile.facts=profile.facts?.filter(text=>!localFacts.some(f=>f.board===profile.id&&f.text===text));
 world.npcs=world.npcs.map(n=>candidate.npcs.find(row=>row.id===n.id)??n);
 for(const batch of ['yupo-depth','yupo-depth-next']){
  const root=path.resolve('world/drafts/w1',batch),base=JSON.parse(await fs.readFile(path.join(root,'base.json'),'utf8'));
  for(const before of base){const {draft}=JSON.parse(await fs.readFile(path.join(root,before.id+'.json'),'utf8'));world.npcs[world.npcs.findIndex(n=>n.id===before.id)]=applyDepthDraft(before,draft);}
 }
 return world;
}

// Keep relative design-module imports valid without changing frozen source bytes.
export async function copyWorldFixture(parent,edition){
 const root=path.join(parent,'world');
 await fs.symlink(path.resolve('tools'),path.join(parent,'tools'),'junction');
 await fs.cp(path.resolve('world'),root,{recursive:true});
 if(edition)await fs.writeFile(path.join(root,'geo/settlements.json'),JSON.stringify(edition.settlementProfiles));
 return root;
}

// loadWorld materializes D1 fields; keep their separate source when a test
// writes a projected locations catalog back beside geo/biomes.json.
export async function writeFixtureLocations(root,locations){
 // Historical installation fixtures remove places as well as their later law bindings.
 const old=JSON.parse(await fs.readFile(path.join(root,'geo/locations.json'),'utf8'));
 const removed=new Set(old.filter(p=>!locations.some(l=>l.id===p.id)).map(p=>p.id));
 const bindingsFile=path.join(root,'law/bindings.json');
 const bindings=await fs.readFile(bindingsFile,'utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 if(bindings)await fs.writeFile(bindingsFile,JSON.stringify(bindings.filter(b=>!removed.has(b.place))));
 const file=path.join(root,'geo/biomes.json'),biomes=JSON.parse(await fs.readFile(file,'utf8'));
 const ids=new Set(locations.map(l=>l.id));
 biomes.locations=Object.fromEntries(Object.entries(biomes.locations).filter(([id])=>ids.has(id)));
 const rows=locations.map(l=>{const row={...l};for(const key of Object.keys(biomes.locations[l.id]??{}))delete row[key];return row;});
 await fs.writeFile(file,JSON.stringify(biomes));
 await fs.writeFile(path.join(root,'geo/locations.json'),JSON.stringify(rows));
}
