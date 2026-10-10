import fs from 'node:fs/promises';
import {createHash}from'node:crypto';
import {spellBlueprints,spellSchools}from'../world/design/spell-blueprints.mjs';
import {mechanismEffect}from'../world/design/spell-effects.mjs';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const bones=spellBlueprints(),lore=[];
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
for(let school=0;school<spellSchools.length;school++){
    const prefix=`world/drafts/spells/lore-${String(school).padStart(2,'0')}`,rows=await read(`${prefix}.json`);
    let metadata;try{metadata=await read(`${prefix}.meta.json`);}catch(error){if(error.code==='ENOENT')throw new Error(`草稿${school}缺少机制版本证明，须按新骨架重新起草`);throw error;}
    if(metadata.blueprintHash!==digest(bones.slice(school*14,school*14+14))||metadata.loreHash!==digest(rows))throw new Error(`草稿${school}与机制版本不符，须重新起草`);
    lore.push(...rows);
}
const byId=new Map(lore.map(row=>[row.id,row]));
const professions={信仰:'profession_priest',生命:'profession_priest',精神:'profession_witch',暗影:'profession_witch',召唤:'profession_summoner'};
const authors=['麦拉·沃兹','塔伦·克里姆','伊娅·苏恩','达默·布伦','艾妲·洛维','索缇·乌勒','芙嘉·门德','巴洛·温特','梅萨·特伦','卡莎·恩林','乔安·勒坎'];
const spells=bones.map(bone=>{
    const details=byId.get(bone.id);if(!details)throw new Error(`缺少详细草稿${bone.id}`);
    if(['river','city','port'].some(region=>details.law[region]!==bone.law[region]))throw new Error(`草稿不是当前合法性骨架${bone.id}`);
    const foundation=bone.id.replace(/\d\d$/,'01');
    return {...bone,...details,...mechanismEffect(bone.mechanism,bone.stage),prerequisites:bone.stage?[{skill:foundation.replace('spell_','skill_'),minimum:bone.stage*300}]:[]};
});
const skills=spells.map(spell=>({id:spell.skill,name:spell.name,aliases:[],scope:null,attribute:'精神',profession:professions[spell.school]??'profession_mage',
    stage:spell.stage,description:spell.effect,prerequisites:spell.prerequisites,learnFee:spell.learnFee,learnMinutes:spell.learnMinutes}));
const books=spells.map(spell=>({id:spell.id.replace('spell_','item_book_'),name:`${spell.name}术页`,aliases:[],scope:null,quality:'木',durability:100,weight:0.15,
    basePrice:[40,150,500,1500][spell.stage],category:'技能书',description:spell.theory,
    book:{grade:['初级','中级','高级','特级'][spell.stage],author:authors[spellSchools.findIndex(([,name])=>name===spell.school)],edition:'河谷流通抄本第一版',origin:'loc_capital',
        teaches:[spell.id],readingMinutes:[120,240,480,960][spell.stage],prerequisites:spell.prerequisites},
    provenance:spell.stage<2?'抄书铺按原页复制的单术教材':'术院审订后流通的完整术页，尚需在起始镇阶段落实来源渠道'}));
const draft={scope:'154条草稿目录，未通过人工内容验收，未发布',spells,skills,books};
await fs.writeFile('world/drafts/spells/catalog.json',JSON.stringify(draft,null,2)+'\n');
console.log(JSON.stringify({spells:spells.length,skills:skills.length,books:books.length,published:false}));
