import fs from 'node:fs/promises';
import path from 'node:path';
export async function loadWorld(root = path.resolve(import.meta.dirname, '..', 'world')) {
    const read = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
    const [rules,npcs,locations,routes,items,professions,skills,spells] = await Promise.all([
        read('meta/rules.json'),read('people/baseline.json'),read('geo/locations.json'),read('geo/routes.json'),read('meta/items.json'),read('meta/professions.json'),read('meta/skills.json'),read('meta/spells.json')]);
    return {version:rules.version,rules,npcs,locations,routes,items,professions,skills,spells,recipes:[]};
}
