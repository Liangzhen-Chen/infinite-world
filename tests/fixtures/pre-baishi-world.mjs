import fs from 'node:fs/promises';
import path from 'node:path';
import {writeFixtureLocations} from './w1-depth-editions.mjs';
import {buildBatch,withoutSites} from '../../tools/w5-sites.mjs';
import * as sites1 from '../../world/design/w5-sites-1.mjs';
import * as sites2 from '../../world/design/w5-sites-2.mjs';
import * as sites3 from '../../world/design/w5-sites-3.mjs';
// Older publishers replay onto a catalog from before Baishi town was integrated.
// Strip the town's places, roster, households, later promoted npc_bs_* full profiles,
// their primer books and law-code places so that frozen pre-Baishi people stay consistent.
export const preBaishiNpc=n=>!n.id.startsWith('npc_bs_')&&!n.id.startsWith('npc_a3_exam_');
export async function writePreBaishiWorld(dir,world){
 // T113–T115 sites depend on the town's later people and spell materials.
 for(const design of [sites3,sites2,sites1])world=withoutSites(world,buildBatch(design.sites,world),design.priorNoMechanics);
 // Only the town skeleton (districts and bld_bs_* buildings) is removed; later wild/monster areas scoped to the town stay.
 const oldLocations=world.locations.filter(l=>l.scope!=='loc_bs'||l.id==='bld_bs_shrine'||!/^(bld_bs_|loc_bs_)/.test(l.id)),placeIds=new Set(oldLocations.map(l=>l.id));
 const rules=structuredClone(world.rules);
 // D1/U12 and T155 came after these frozen pre-town profiles.
 for(const key of ['hazardClock','questSources','military','warDiplomacy'])delete rules[key];
 for(const region of rules.weather.regions){region.locations=region.locations.filter(id=>placeIds.has(id));region.indoor=region.indoor.filter(id=>placeIds.has(id));}
 for(const code of rules.law?.codes??[])if(Array.isArray(code.locations))code.locations=code.locations.filter(id=>placeIds.has(id));
 // T160灵地与白石镇行业营生同样落在镇内场所。
 if(rules.wildlifeAwakening?.spiritLands)rules.wildlifeAwakening.spiritLands=rules.wildlifeAwakening.spiritLands.filter(row=>placeIds.has(row.location));
 if(rules.npcGrowth?.vocations)rules.npcGrowth.vocations=rules.npcGrowth.vocations.filter(row=>placeIds.has(row.location));
 // U9白石镇固定商店及从白石镇到货的补货条目随白石镇聚落档案一并移出。
 if(rules.economy?.shops?.stores)rules.economy.shops.stores=rules.economy.shops.stores.filter(s=>s.settlement!=='loc_bs').map(s=>({...s,restock:s.restock.filter(row=>!(row.source==='route'&&row.from==='loc_bs'))}));
 // T102等后续法术、配方及其材料以白石镇升档人物或镇内场所为来源；旧世界里连同依赖它们的条目一并没有（求闭包）。
 const catalog=pruneCatalog(world,[...world.locations.filter(l=>!placeIds.has(l.id)).map(l=>l.id),...world.npcs.filter(n=>!preBaishiNpc(n)).map(n=>n.id),...world.items.filter(i=>i.id.startsWith('item_bs_')).map(i=>i.id)]);
 await writeFixtureLocations(dir,oldLocations);
 // W5S activated this festival using a promoted town host. Restore the
 // reviewed pre-host edition while the old town catalog is being replayed.
 const festivalCandidate=JSON.parse(await fs.readFile('world/drafts/w5/festivals-candidate.json','utf8'));
 const festivals=(world.festivals??[]).map(f=>f.id==='festival_borrowbench'?festivalCandidate.festivals.find(old=>old.id===f.id):f);
 await fs.writeFile(path.join(dir,'lore/festivals.json'),JSON.stringify(festivals));
 // A3 offices and newly authored examiners did not exist before the town.
 // Existing people keep their pre-town facts, without seats in removed buildings.
 const factions=world.factions.map(f=>({...f,...(f.offices?{offices:f.offices.filter(o=>placeIds.has(o.seat)&&(!o.holder||preBaishiNpc({id:o.holder})))}:{})}));
 const files={'lore/factions.json':factions,'geo/routes.json':world.routes.filter(r=>placeIds.has(r.from)&&placeIds.has(r.to)),'geo/settlements.json':world.settlementProfiles.filter(p=>p.id!=='loc_bs'),'people/residents.json':world.residents.filter(n=>n.settlement!=='loc_bs'),'people/households.json':world.households.filter(h=>h.settlement!=='loc_bs'),'meta/rules.json':rules,'meta/items.json':catalog.items,'meta/spells.json':catalog.spells,'meta/recipes.json':catalog.recipes};
 for(const [file,value] of Object.entries(files))await fs.writeFile(path.join(dir,file),JSON.stringify(value));
}
// Remove catalog rows (items/spells/recipes) that reference removed ids, to a fixpoint.
export function pruneCatalog(world,removedIds){
 const removed=new Set(removedIds),catalog={items:world.items.filter(i=>!removed.has(i.id)),spells:world.spells.filter(r=>!removed.has(r.id)),recipes:(world.recipes??[]).filter(r=>!removed.has(r.id))};
 const bound=row=>[...JSON.stringify(row).matchAll(/"([a-z]+_[a-z0-9_]+)"/g)].some(m=>m[1]!==row.id&&removed.has(m[1]));
 for(let changed=true;changed;){changed=false;for(const key of Object.keys(catalog)){const kept=catalog[key].filter(row=>!bound(row));if(kept.length!==catalog[key].length){for(const row of catalog[key])if(!kept.includes(row))removed.add(row.id);catalog[key]=kept;changed=true;}}}
 return catalog;
}
