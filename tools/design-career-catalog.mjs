// U4: writes world/meta/careers.json and places ultimate skills in skills.json
// right after the combat skill trees (ahead of later published batches).
import fs from'node:fs/promises';
import {combatProfessionBlueprints}from'../world/design/combat-professions.mjs';
import {hiddenProfessionBlueprints}from'../world/design/hidden-professions.mjs';
import {careerCatalog}from'../world/design/career-depth.mjs';
const combat=combatProfessionBlueprints(),{careers,skills:ultimates}=careerCatalog(combat,hiddenProfessionBlueprints());
const ids=new Set(ultimates.map(row=>row.id)),trees=new Set(combat.flatMap(row=>row.skills.map(skill=>skill.id)));
const rows=JSON.parse(await fs.readFile('world/meta/skills.json','utf8')).filter(row=>!ids.has(row.id));
rows.splice(rows.findLastIndex(row=>trees.has(row.id))+1,0,...ultimates);
await fs.writeFile('world/meta/careers.json',JSON.stringify(careers)+'\n');
await fs.writeFile('world/meta/skills.json',JSON.stringify(rows)+'\n');
console.log(JSON.stringify({careers:Object.keys(careers).length,ultimates:ultimates.length,skills:rows.length}));
