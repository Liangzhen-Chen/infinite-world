import fs from 'node:fs/promises';
import path from 'node:path';
import {materializeWildlifeHabitats} from '../server-plugin/wildlife-habitats.mjs';
import {faithConflictClocks} from '../server-plugin/faith-catalog.mjs';
export async function loadWorld(root = path.resolve(import.meta.dirname, '..', 'world')) {
    const read = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
    const optional=async file=>{try{return await read(file);}catch(error){if(error.code==='ENOENT')return [];throw error;}};
    const [rules,npcs,locations,routes,items,professions,skills,spells] = await Promise.all([
        read('meta/rules.json'),read('people/baseline.json'),read('geo/locations.json'),read('geo/routes.json'),read('meta/items.json'),read('meta/professions.json'),read('meta/skills.json'),read('meta/spells.json')]);
    const [recipes,monsters,bosses]=await Promise.all(['recipes','monsters','bosses'].map(name=>optional(`meta/${name}.json`)));
    const [cultures,deities,factions,history,factionPeople,eras,festivals,rumors]=await Promise.all(['cultures','deities','factions','history','factionPeople','eras','festivals','rumors'].map(name=>optional(`lore/${name}.json`)));
    // W5: reviewed faction rows stay untouched on disk. Explicit reverse
    // bindings reuse the source relation's score and reason at load time.
    const reverseRelations=await optional('lore/faction-relations.json');
    for(const {target,source} of reverseRelations){
        const f=factions.find(f=>f.id===target),r=factions.find(f=>f.id===source)?.relations?.find(r=>r.faction===target);
        if(!f||!r)throw new Error(`反向关系缺原条目：${source}->${target}`);
        if((f.relations??[]).some(r=>r.faction===source))continue;
        rules.factionRelations??={};
        (rules.factionRelations[target]??=[]).push({...r,faction:source});
    }
    const [residents,households,settlementProfiles,regions]=await Promise.all([optional('people/residents.json'),optional('people/households.json'),optional('geo/settlements.json'),optional('geo/regions.json')]);
    const careers=await optional('meta/careers.json');
    const faith=await optional('lore/faith.json');if(!Array.isArray(faith))rules.faith=faith;
    const familyLaw=await optional('lore/family-law.json');if(!Array.isArray(familyLaw))rules.law.family=familyLaw;
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
    const world=materializeWildlifeHabitats({version:rules.version,rules,npcs,locations,routes,items,professions,skills,spells,recipes,monsters,bosses,cultures,deities,factions,history,factionPeople,eras,...(festivals.length?{festivals}:{}),...(rumors.length===0?{}:{rumors}),residents,households,settlementProfiles,...(regions.length?{regions}:{}),...(Array.isArray(careers)?{}:{careers})});
    const faithClocks=faithConflictClocks({world,rules,byId:new Map([...locations,...deities].map(e=>[e.id,e]))});
    if(faithClocks.length){rules.factionClock??={version:1,clocks:[]};rules.factionClock.clocks.push(...faithClocks);}
    return world;
}
