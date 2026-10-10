import fs from'node:fs/promises';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const items=await read('world/meta/items.json'),skills=await read('world/meta/skills.json'),npcs=await read('world/people/baseline.json'),locations=await read('world/geo/locations.json');
let recipes;try{recipes=await read('world/meta/recipes.json');}catch(error){if(error.code!=='ENOENT')throw error;recipes=[];}
const newItems=[
    {id:'item_whittling_knife',name:'削木小刀',basePrice:8,weight:0.2,durability:80,tags:['metal','tool'],origin:'loc_bs',use:'沿纹削薄木片、修整木柄与木楔，不适合伐木。',checkBonus:{bonus:1,attributes:['敏捷'],skills:['skill_life_6_core']}},
    {id:'item_wooden_peg',name:'榫用木楔',basePrice:2,weight:0.05,durability:60,tags:['wood','component'],origin:'loc_hw',use:'夹紧榫口，拆卸时应先敲松，受潮后须检查涨缩。'},
    {id:'item_tool_handle',name:'小工具木柄',basePrice:6,weight:0.3,durability:100,tags:['wood','component'],origin:'loc_hw',use:'供小型凿、锤和锉装柄；重斧需要更粗且经过检验的木柄。'},
    {id:'item_wood_shavings',name:'干木刨屑',basePrice:1,weight:0.1,durability:1,tags:['wood','fuel'],origin:'loc_hw',use:'收集在干燥篓中，可引火或吸收少量撒漏液体；遇雨后难以点燃。'},
];
for(const row of newItems)if(!items.some(item=>item.id===row.id))items.push({quality:'木',scope:null,aliases:[],seasonality:'全年可得，雨季须保持干燥',shelfLifeDays:null,...row});
const common={skill:'skill_life_6_core',minimumProficiency:0,materials:[{item:'item_wood',amount:1}],tools:['item_whittling_knife'],workstation:'woodworking',
    learningRequired:true,learnFee:4,learnMinutes:30,teachers:['npc_hw_ayan'],difficulty:10,toolWear:1,failure:{recoverFraction:0,injury:1},scope:null,aliases:[]};
const newRecipes=[
    {...common,id:'recipe_wooden_pegs',name:'削制榫用木楔',minutes:20,output:{item:'item_wooden_peg',quantity:4},byproducts:[{item:'item_wood_shavings',amount:1}],
        process:'沿直纹截取薄条，先削长斜面再截成四块木楔，在台上逐块试压；小刀逆纹时容易崩边。'},
    {...common,id:'recipe_tool_handle',name:'修整小工具木柄',minutes:30,output:{item:'item_tool_handle',quantity:1},byproducts:[{item:'item_wood_shavings',amount:1}],
        process:'从无裂纹木料留出装柄端，顺纹削出握持弧度。装柄端留少量余量，交给使用者与具体工具配合。'},
];
for(const recipe of newRecipes)if(!recipes.some(row=>row.id===recipe.id))recipes.push(recipe);
const bench=locations.find(row=>row.id==='bld_hw_mill');bench.workstations??=[];
if(!bench.workstations.some(row=>row.id==='station_hw_mill_bench'))bench.workstations.push({id:'station_hw_mill_bench',kind:'woodworking',owner:'loc_hw',access:'public',fee:2});
const apprentice=npcs.find(row=>row.id==='npc_hw_ayan');apprentice.age=19;
apprentice.skills=Object.fromEntries((Array.isArray(apprentice.skills)?apprentice.skills.map(id=>[id,0]):Object.entries(apprentice.skills??{})));
apprentice.skills.skill_life_6_core=Math.max(apprentice.skills.skill_life_6_core??0,120);
apprentice.services=[...new Set([...apprentice.services,'skill_life_6_core',...newRecipes.map(row=>row.id)])];
apprentice.inventory.item_whittling_knife??=2;apprentice.inventory.item_wood??=20;
const core=skills.find(row=>row.id==='skill_life_6_core');core.learnFee=6;core.learnMinutes=60;core.teachers=['npc_hw_ayan'];
for(const[file,value]of[['world/meta/items.json',items],['world/meta/recipes.json',recipes],['world/meta/skills.json',skills],['world/people/baseline.json',npcs],['world/geo/locations.json',locations]])await fs.writeFile(file,JSON.stringify(value,null,2)+'\n');
