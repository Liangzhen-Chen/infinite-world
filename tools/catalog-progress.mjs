import path from 'node:path';
import {loadWorld} from './load-world.mjs';

export const catalogMinimum = {spells:150,items:400,recipes:200,monsters:150,bosses:40,cultures:10,deities:12,factions:40,history:80};
export const professionMinimum = {combat:12,life:22,hidden:30};
export const populationMinimum = {full:250,residents:500};

export function catalogProgress(world) {
    const rows = Object.entries(catalogMinimum).map(([catalog,target])=>({catalog,current:world[catalog]?.length??0,target}));
    for (const [kind,target] of Object.entries(professionMinimum)) {
        rows.push({catalog:`professions.${kind}`,current:world.professions.filter(row=>row.kind===kind).length,target});
    }
    rows.push({catalog:'npcs.full',current:world.npcs.filter(row=>row.tier==='full').length,target:populationMinimum.full});
    rows.push({catalog:'residents',current:world.residents?.length??0,target:populationMinimum.residents});
    for (const catalog of ['npcs','locations','routes','skills','factionPeople','households','settlementProfiles']) {
        rows.push({catalog,current:world[catalog]?.length??0,target:null});
    }
    return {scope:'正式源目录；不含草稿，数量不代表内容审核或功能验收。人口目标为LOD0最低数量，轻量名册与完整档互斥；LOD1及逐聚落覆盖需另行验收。',catalogs:rows};
}

if (process.argv[1] && path.resolve(process.argv[1])===path.resolve(import.meta.filename)) {
    console.log(JSON.stringify(catalogProgress(await loadWorld()),null,2));
}
