import fs from 'node:fs/promises';
import path from 'node:path';
export async function loadWorld(root = path.resolve(import.meta.dirname, '..', 'world')) {
    const read = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
    const optional=async file=>{try{return await read(file);}catch(error){if(error.code==='ENOENT')return [];throw error;}};
    const [rules,npcs,locations,routes,items,professions,skills,spells] = await Promise.all([
        read('meta/rules.json'),read('people/baseline.json'),read('geo/locations.json'),read('geo/routes.json'),read('meta/items.json'),read('meta/professions.json'),read('meta/skills.json'),read('meta/spells.json')]);
    const [recipes,monsters,bosses]=await Promise.all(['recipes','monsters','bosses'].map(name=>optional(`meta/${name}.json`)));
    const [cultures,deities,factions,history,factionPeople,eras]=await Promise.all(['cultures','deities','factions','history','factionPeople','eras'].map(name=>optional(`lore/${name}.json`)));
    const [residents,households,settlementProfiles]=await Promise.all([optional('people/residents.json'),optional('people/households.json'),optional('geo/settlements.json')]);
    return {version:rules.version,rules,npcs,locations,routes,items,professions,skills,spells,recipes,monsters,bosses,cultures,deities,factions,history,factionPeople,eras,residents,households,settlementProfiles};
}
