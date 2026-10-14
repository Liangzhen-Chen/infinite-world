import fs from 'node:fs/promises';
import path from 'node:path';
// Older publishers replay onto a catalog from before Baishi town was integrated.
// Strip the town's places, roster, households, later promoted npc_bs_* full profiles,
// their primer books and law-code places so that frozen pre-Baishi people stay consistent.
export const preBaishiNpc=n=>!n.id.startsWith('npc_bs_');
export async function writePreBaishiWorld(dir,world){
 const oldLocations=world.locations.filter(l=>l.scope!=='loc_bs'||['loc_bs','bld_bs_shrine'].includes(l.id)),placeIds=new Set(oldLocations.map(l=>l.id));
 const rules=structuredClone(world.rules);
 for(const region of rules.weather.regions){region.locations=region.locations.filter(id=>placeIds.has(id));region.indoor=region.indoor.filter(id=>placeIds.has(id));}
 for(const code of rules.law?.codes??[])if(Array.isArray(code.locations))code.locations=code.locations.filter(id=>placeIds.has(id));
 const files={'geo/locations.json':oldLocations,'geo/routes.json':world.routes.filter(r=>placeIds.has(r.from)&&placeIds.has(r.to)),'geo/settlements.json':world.settlementProfiles.filter(p=>p.id!=='loc_bs'),'people/residents.json':world.residents.filter(n=>n.settlement!=='loc_bs'),'people/households.json':world.households.filter(h=>h.settlement!=='loc_bs'),'meta/rules.json':rules,'meta/items.json':world.items.filter(i=>!i.id.startsWith('item_bs_'))};
 for(const [file,value] of Object.entries(files))await fs.writeFile(path.join(dir,file),JSON.stringify(value));
}
