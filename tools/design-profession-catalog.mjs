import fs from'node:fs/promises';
import {combatProfessionBlueprints}from'../world/design/combat-professions.mjs';
import {lifeProfessionBlueprints}from'../world/design/life-professions.mjs';
import {hiddenProfessionBlueprints}from'../world/design/hidden-professions.mjs';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const original=await read('world/meta/professions.json'),skillRows=await read('world/meta/skills.json');
const skills=new Map(skillRows.map(row=>[row.id,row]));
const combat=combatProfessionBlueprints().map(row=>{
    const{skills:tree,branches,...metadata}=row,previous=original.find(value=>value.id===row.id);
    for(const skill of tree)skills.set(skill.id,{...skill,...(skill.id==='skill_light'?skills.get(skill.id):{})});
    return {...previous,...metadata,skillTree:tree.map(skill=>skill.id),abandonFee:60,abandonCooldownMinutes:4320};
});
const life=lifeProfessionBlueprints().map(row=>{
    const{coreSkill,...metadata}=row,previous=original.find(value=>value.id===row.id);skills.set(coreSkill.id,coreSkill);
    return {...previous,...metadata,skillTree:[coreSkill.id],entry:{skill:coreSkill.id,minimumProficiency:100,difficulty:15,minutes:120},abandonFee:40,abandonCooldownMinutes:1440,
        ...(row.name==='音乐家'?{styles:['器乐','合奏','吟游叙唱'],aliases:[...new Set([...previous.aliases,'吟游诗人'])]}:{})};
});
const hidden=hiddenProfessionBlueprints(),professions=[...combat,...life,...hidden];
await fs.writeFile('world/meta/professions.json',JSON.stringify(professions,null,2)+'\n');
await fs.writeFile('world/meta/skills.json',JSON.stringify([...skills.values()],null,2)+'\n');
console.log(JSON.stringify({combat:combat.length,combatSkills:combat.reduce((n,row)=>n+row.skillTree.length,0),life:life.length,hidden:hidden.length,totalSkills:skills.size,
    scope:'手写规则目录；技能动作、隐藏触发与来源仍须逐项实现和验收，不代表阶段2完成'}));
