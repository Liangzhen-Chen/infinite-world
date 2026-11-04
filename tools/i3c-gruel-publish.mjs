// I3c: 家常"原粮煮粥"——燕麦粥(物品)与煮燕麦粥(配方)。追加到 world/meta 正式源文件，不手改 dist/。
// 与 tools/s504-silk-approval.mjs 同一发布方式(候选 -> 世界校验 -> 追加源文件)，但没有付费 L2 事实审阅：
// 本卡的运行约束不含模型调用额度，审阅状态如实写在 candidate.json 的 status 里，留待主会话决定是否补审。
// 数值全部从既有行派生，来源写在 basis：
//   满足量 30/份、4 份/粮食单位：同燕麦薄饼(item_oat_flatbread 满足量 30，recipe_bake_flatbread 1 份粉 -> 4 片)，
//     粮食单位同为 item_oats 半公斤(agriculture foodUnitKg=0.5)；整粒入锅不脱壳损耗按"壳另入废堆"之外的可食部分计，不另打折。
//   水 3 份：产物 4 碗×0.3kg(同 item_fruit_porridge 每碗 300g)=1.2kg，减去燕麦 0.5kg，余 0.7kg≈3 份清水(item_water 0.25kg)。
//   柴 1 份：item_wood 2kg 通用木料，用于炉火；煮一小时的一炉火，取一份。
//   60 分钟：同类整粒煮食 recipe_w3_fish_broth 60、recipe_w3c_cracked_wheat_pot 85；磨粉 20+烙饼 35=55，取 60。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const items=[{
 id:'item_oat_gruel',name:'燕麦粥',basePrice:3,weight:0.3,durability:100,origin:'loc_hw_fields',shelfLifeDays:1,tags:['food'],
 use:'整粒燕麦加清水在灶上煮出的稠粥，每碗三百克；须当日吃，隔夜易酸，不是可带的路粮。',
 quality:'木',aliases:[],scope:null,seasonality:'全年都能煮，原料是存粮、清水和柴火，没有现成存货',
 description:'农户用存粮里的整粒燕麦，加清水在厚底煮锅里煮出的稠粥。燕麦不脱壳磨粉，只在入锅前淘去浮尘，下锅后小火慢熬，木柴的火要稳，不能时旺时灭，一直熬到粒粒胀开、汤色发白发稠。一锅可盛四碗，每碗约三百克，没有盐也没有菜，味道淡，贵在饱腹，是家里粮缺时最省事的一顿。',
 inspection:'揭盖看粥面是否均匀稠厚，勺子立在中间不倒为熟；挑起一粒按开，里面不应有白硬芯。闻有燕麦的熟香，若有酸味或表面发黏起丝，说明放久了不能吃。',
 storage:'煮好趁热盛进陶碗，当日吃完；隔夜粥放在阴凉处也只能当天再煮开一次，发酸就倒掉。',
 nutrition:{satiety:30}
}];
export const recipes=[{
 id:'recipe_boil_oat_gruel',name:'煮燕麦粥',aliases:[],scope:null,skill:'skill_life_3_core',minimumProficiency:0,minutes:60,difficulty:10,workstation:'cooking',
 process:'一份整粒燕麦淘去浮尘，和三份清水一起下厚底煮锅，灶里添一块木柴，小火煮约一个时辰，其间搅动防粘底；煮到粒粒胀开、汤稠为止，盛出四碗。不磨粉、不用盐，也不能写成发酵或烙制。',
 materials:[{item:'item_oats',amount:1},{item:'item_water',amount:3},{item:'item_wood',amount:1}],tools:['item_cooking_pot'],
 output:{item:'item_oat_gruel',quantity:4},byproducts:[],learningRequired:true,learnFee:4,learnMinutes:120,teachers:[],toolWear:1,failure:{recoverFraction:0,injury:0},prerequisites:[]
}];

async function appendRows(file,rows){
 if(!rows.length)return;
 const text=await fs.readFile(file,'utf8'),end=text.lastIndexOf(']'),before=text.slice(0,end),body=before.trimEnd();
 const newline=text.includes('\r\n')?'\r\n':'\n',indent=/^([ \t]*)\{"id":/m.exec(text)?.[1]??'';
 await fs.writeFile(file,body+','+newline+rows.map(row=>indent+JSON.stringify(row)).join(','+newline)+before.slice(body.length)+text.slice(end));
}
export async function preflight(){
 const {loadWorld}=await import('./load-world.mjs'),{validateWorld}=await import('./validate-world.mjs');
 const world=await loadWorld();
 const have=world.items.some(i=>i.id===items[0].id);
 if(!have){for(const row of items)world.items.push(structuredClone(row));for(const row of recipes)world.recipes.push(structuredClone(row));}
 const result=validateWorld(world);assert.equal(result.ok,true,result.errors.join('; '));
 return {published:have};
}
export async function run(args=process.argv.slice(2)){
 const state=await preflight();
 if(args.includes('--publish')&&!state.published){
  await appendRows('world/meta/items.json',items);await appendRows('world/meta/recipes.json',recipes);
  await fs.mkdir('world/drafts/i3c-gruel',{recursive:true});
  await fs.writeFile('world/drafts/i3c-gruel/candidate.json',JSON.stringify({revision:'i3c-gruel-1',entries:[...items,...recipes],status:'published-without-L2-model-review'},null,2)+'\n');
 }
 console.log(JSON.stringify({published:state.published||args.includes('--publish'),checked:true}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
