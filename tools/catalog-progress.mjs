import path from 'node:path';
import {loadWorld} from './load-world.mjs';

export const catalogMinimum = {spells:150,items:400,recipes:200,monsters:150,bosses:40,cultures:10,deities:12,factions:40,history:80};
export const professionMinimum = {combat:12,life:22,hidden:30};

export function catalogProgress(world) {
    const rows = Object.entries(catalogMinimum).map(([catalog,target])=>({catalog,current:world[catalog]?.length??0,target}));
    for (const [kind,target] of Object.entries(professionMinimum)) {
        rows.push({catalog:`professions.${kind}`,current:world.professions.filter(row=>row.kind===kind).length,target});
    }
    for (const catalog of ['npcs','locations','routes','skills','factionPeople']) {
        rows.push({catalog,current:world[catalog]?.length??0,target:null});
    }
    return {scope:'正式源目录；不含草稿，数量不代表内容审核或功能验收。LOD0 至少 250 份完整人物档的验收尚未实现。',catalogs:rows};
}

if (process.argv[1] && path.resolve(process.argv[1])===path.resolve(import.meta.filename)) {
    console.log(JSON.stringify(catalogProgress(await loadWorld()),null,2));
}
