import fs from 'node:fs/promises';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const write=async(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n');
const skills=await read('world/meta/skills.json'),npcs=await read('world/people/baseline.json'),items=await read('world/meta/items.json');
if(!skills.some(row=>row.id==='skill_literacy'))skills.push({id:'skill_literacy',name:'识字',aliases:['基础识字'],scope:null,attribute:'智力',profession:null,
    stage:0,prerequisites:[],learnFee:2,learnMinutes:60,learnDifficulty:10,description:'辨认通用文字的笔画、数字和短词；达到100熟练度后可独立阅读初级技能书。'});
const teacher=npcs.find(row=>row.id==='npc_hw_luqing');
if(!teacher.services.includes('skill_literacy'))teacher.services.push('skill_literacy');
if(!items.some(row=>row.id==='item_literacy_primer'))items.push({id:'item_literacy_primer',name:'田契识字课本',aliases:[],scope:null,quality:'木',durability:100,weight:0.25,basePrice:8,
    description:'陆青用田界、借据与粮仓签记做例题的小册。课后的空白格可反复摹写，封底留着小书库收还日期。',
    book:{grade:'初级',author:'npc_hw_luqing',edition:'春历元年修订本',origin:'loc_hw',teaches:['skill_literacy'],readingMinutes:120,prerequisites:[]}});
teacher.inventory.item_literacy_primer??={quantity:3};
await write('world/meta/skills.json',skills);await write('world/people/baseline.json',npcs);await write('world/meta/items.json',items);
console.log(JSON.stringify({foundation:'识字与实体课本',teacher:teacher.id,liveChanged:false}));
