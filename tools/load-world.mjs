import fs from 'node:fs/promises';
import path from 'node:path';
import {materializeWildlifeHabitats} from '../server-plugin/wildlife-habitats.mjs';
export async function loadWorld(root = path.resolve(import.meta.dirname, '..', 'world')) {
    const read = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
    const optional=async file=>{try{return await read(file);}catch(error){if(error.code==='ENOENT')return [];throw error;}};
    const [rules,npcs,locations,routes,items,professions,skills,spells] = await Promise.all([
        read('meta/rules.json'),read('people/baseline.json'),read('geo/locations.json'),read('geo/routes.json'),read('meta/items.json'),read('meta/professions.json'),read('meta/skills.json'),read('meta/spells.json')]);
    const [recipes,monsters,bosses]=await Promise.all(['recipes','monsters','bosses'].map(name=>optional(`meta/${name}.json`)));
    const [cultures,deities,factions,history,factionPeople,eras,festivals,rumors]=await Promise.all(['cultures','deities','factions','history','factionPeople','eras','festivals','rumors'].map(name=>optional(`lore/${name}.json`)));
    const [residents,households,settlementProfiles,regions]=await Promise.all([optional('people/residents.json'),optional('people/households.json'),optional('geo/settlements.json'),optional('geo/regions.json')]);
    const careers=await optional('meta/careers.json');
    // D1: biome tags and areas live in geo/biomes.json (kept apart from the
    // locations file); they are merged into their locations here for K8.
    const biomes=await optional('geo/biomes.json');
    for(const [id,row] of Object.entries(biomes.locations??{})){
        const place=locations.find(l=>l.id===id);if(!place)throw new Error(`群落数据指向未登记地点：${id}`);
        if(place.biome!==undefined||place.areaKm2!==undefined)throw new Error(`群落数据与地点自带字段重复：${id}`);
        Object.assign(place,row);
    }
    // K8 habitats derived from those tags are part of the loaded world, so an
    // engine built on it re-derives the same rows and leaves the world unchanged.
    return materializeWildlifeHabitats({version:rules.version,rules,npcs,locations,routes,items,professions,skills,spells,recipes,monsters,bosses,cultures,deities,factions,history,factionPeople,eras,...(festivals.length?{festivals}:{}),...(rumors.length===0?{}:{rumors}),residents,households,settlementProfiles,...(regions.length?{regions}:{}),...(Array.isArray(careers)?{}:{careers})});
}
