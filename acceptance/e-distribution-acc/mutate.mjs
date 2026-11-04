// 通用性变异：在仓库副本 mut/ 里加一种从没出现过的可交易物（新物品 + 生产它的新配方）。
// 副本不复制 node_modules、.git、SillyTavern、logs；node_modules 用 junction 连回原仓库。不改原仓库任何文件。
// 新物从数据派生，不写死名单：取"产出为有饱腹值食物"的配方里门槛最低的一条作模板，
// 克隆出新产物（新 id、新名字、不同的饱腹/价格/保质期），配方改为无需拜师（人人凭技能与工位可做），
// 不给任何人开局存量。于是：生产者 = 具备该技能与工位的人；需求 = 吃饭的家户（食物有饱腹值）。
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)).split(String.fromCharCode(92)).join('/'),SRC=(process.env.ACC_REPO??'F:/dnd-wt/S5FIX').split(String.fromCharCode(92)).join('/'),MUT=`${HERE}/mut`;
const exists=async p=>!!(await fs.stat(p).catch(()=>null));
const WIN=process.platform==='win32';
const prev=await fs.readFile(`${MUT}/ACC-MUTATION.json`,'utf8').then(JSON.parse).catch(()=>null);
if(prev&&prev.source!==SRC){console.error(`mut/ 是从 ${prev.source} 复制的，现在要验 ${SRC}：先删掉 mut/ 再重跑`);process.exit(2);}
if(!await exists(`${MUT}/package.json`)){
  if(!WIN)execFileSync('rsync',['-a','--exclude=node_modules','--exclude=.git','--exclude=SillyTavern','--exclude=logs',SRC+'/',MUT+'/'],{stdio:'inherit'});
  else try{execFileSync('robocopy',[SRC.replace(/\//g,'\\'),MUT.replace(/\//g,'\\'),'/E','/NFL','/NDL','/NJH','/NJS','/NP','/XD','node_modules','.git','SillyTavern','logs'],{stdio:'inherit'});}
  catch(e){if((e.status??16)>=8)throw e;}// robocopy 0–7 都是成功
}
if(!await exists(`${MUT}/node_modules`)){if(!WIN)await fs.symlink(`${SRC}/node_modules`,`${MUT}/node_modules`,'dir');else execFileSync('cmd',['/c','mklink','/J',`${MUT}/node_modules`.replace(/\//g,'\\'),`${SRC}/node_modules`.replace(/\//g,'\\')],{stdio:'inherit'});}
const itemsPath=`${MUT}/world/meta/items.json`,recipesPath=`${MUT}/world/meta/recipes.json`;
const items=JSON.parse(await fs.readFile(`${SRC}/world/meta/items.json`,'utf8')),recipes=JSON.parse(await fs.readFile(`${SRC}/world/meta/recipes.json`,'utf8'));
const NEW_ITEM='item_acc_e_novel_cake',NEW_RECIPE='recipe_acc_e_novel_cake';
const food=new Map(items.filter(i=>i.nutrition?.satiety>0).map(i=>[i.id,i]));
const template=recipes.filter(r=>food.has(r.output?.item)).sort((a,b)=>(a.minimumProficiency??0)-(b.minimumProficiency??0)||a.materials.length-b.materials.length||(a.id<b.id?-1:1))[0];
const base=food.get(template.output.item);
const item={...structuredClone(base),id:NEW_ITEM,name:'荞香团子',aliases:['团子'],origin:null,
  basePrice:Math.max(1,base.basePrice+1),shelfLifeDays:Math.max(2,(base.shelfLifeDays??3)+1),nutrition:{...base.nutrition,satiety:Math.max(1,base.nutrition.satiety-4)},
  description:'验收变异新增的点心：以现成食材揉团蒸熟，个头小、耐放一两日。',use:'一份可充一顿小食。',inspection:'看表面是否干裂发霉。',storage:'置于干燥竹篮中。',seasonality:'四季皆可'};
const recipe={...structuredClone(template),id:NEW_RECIPE,name:'蒸荞香团子',aliases:[],output:{item:NEW_ITEM,quantity:template.output.quantity},learningRequired:false,teachers:[],learnFee:0,
  process:'取料揉团，上锅蒸熟。'};
await fs.writeFile(itemsPath,JSON.stringify([...items.filter(i=>i.id!==NEW_ITEM),item],null,2));
await fs.writeFile(recipesPath,JSON.stringify([...recipes.filter(r=>r.id!==NEW_RECIPE),recipe],null,2));
const spec={source:SRC,item:NEW_ITEM,name:item.name,recipe:NEW_RECIPE,template:template.id,templateOutput:base.id,skill:recipe.skill,workstation:recipe.workstation??null,materials:recipe.materials,tools:recipe.tools,
  note:'新物只出现在 mut/ 副本；开局无人持有，src:genesis 应为 0。'};
await fs.writeFile(`${MUT}/ACC-MUTATION.json`,JSON.stringify(spec,null,1));
console.log(JSON.stringify(spec));
