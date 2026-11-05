// 通用性变异：在 mut/ 建仓库副本（只复制运行所需目录，node_modules 用 junction 连回基线），只改数据、不改代码。
// 加一种从没出现过的自然材料（灰纹韧皮，长在北林边据点，带再生条目）和一条以它为主料的新配方（编韧皮提篓）。
// 新配方只写属性：技能、工位、师傅、工具、投入照数据里已有的同类条目取，产物是新物品，带"容器"性状。
// 用法：node mutate.mjs [--rebuild]   → mut/ 与 mutation.json
import fs from 'node:fs';
import path from 'node:path';
import {BASE,MUT,OUT_DIR} from './lib.mjs';
import {familyOfItem} from './spec.mjs';

const COPY_TOP=['package.json','schemas','server-plugin','tests','tools','world','extension','prompt'];
export const NEW={natural:'item_acc_q_ashbark',product:'item_acc_q_bark_tote',recipe:'recipe_acc_q_weave_bark_tote',resource:'nw_acc_q_ashbark',site:'loc_hw_northwood'};
const rd=f=>JSON.parse(fs.readFileSync(path.join(MUT,f),'utf8'));
const wr=(f,j)=>fs.writeFileSync(path.join(MUT,f),JSON.stringify(j,null,1));

export async function build({rebuild=false}={}){
  const stamp=path.join(MUT,'.base');
  if(fs.existsSync(MUT)&&(rebuild||(fs.existsSync(stamp)&&fs.readFileSync(stamp,'utf8')!==BASE))){
    const nm=path.join(MUT,'node_modules');let st=null;try{st=fs.lstatSync(nm);}catch{}
    if(st){if(!st.isSymbolicLink())throw Error(`${nm} 不是 junction，拒绝递归删除`);fs.unlinkSync(nm);}
    fs.rmSync(MUT,{recursive:true,force:true});
  }
  if(!fs.existsSync(MUT)){
    fs.mkdirSync(MUT,{recursive:true});
    for(const e of COPY_TOP){if(!fs.existsSync(path.join(BASE,e)))continue;fs.cpSync(path.join(BASE,e),path.join(MUT,e),{recursive:true});}
    fs.symlinkSync(fs.realpathSync(path.join(BASE,'node_modules')),path.join(MUT,'node_modules'),'junction');
    fs.writeFileSync(stamp,BASE);
  }
  for(const f of ['world/meta/items.json','world/meta/recipes.json','world/geo/locations.json'])fs.copyFileSync(path.join(BASE,f),path.join(MUT,f));
  const items=rd('world/meta/items.json'),recipes=rd('world/meta/recipes.json'),locs=rd('world/geo/locations.json');
  const I=Object.fromEntries(items.map(i=>[i.id,i]));
  // 样板配方：数据里第一条"有师傅、要工位、投入里有一种由别的配方做出的原料、工具也能由配方做出"的布类配方；新配方沿用它的技能、工位、师傅、工具、那种加工原料。
  const prod=new Set(recipes.map(r=>r.output.item));
  const like=recipes.find(r=>r.teachers?.length&&r.workstation&&r.materials.some(m=>prod.has(m.item)&&familyOfItem(I[m.item])==='布')&&(r.tools??[]).some(t=>prod.has(t)));
  if(!like)throw Error('找不到样板配方');
  const processed=like.materials.find(m=>prod.has(m.item));
  const proto=I['item_flax']??items.find(i=>(i.tags??[]).includes('fiber'));
  items.push({...structuredClone(proto),id:NEW.natural,name:'灰纹韧皮',aliases:[],basePrice:2,weight:0.3,quality:'木',durability:100,origin:NEW.site,shelfLifeDays:180,tags:['fiber','bark','material'],
    use:'林边灰皮树上剥下的内层韧皮，浸软后可编可缝。',seasonality:'春夏易剥',description:'北林边一种灰皮矮树的内层韧皮，带细密灰纹，浸水后柔韧，晒干后挺括。',inspection:'看纹理连贯、无霉斑，折而不断者为好。',storage:'晾干成捆，防潮。',acquisition:undefined});
  const tote=I['item_grain_sack']??items.find(i=>(i.tags??[]).includes('container'));
  items.push({...structuredClone(tote),id:NEW.product,name:'韧皮提篓',aliases:[],basePrice:10,weight:0.4,quality:'木',durability:90,origin:like.workstation?null:null,tags:['container','fiber'],
    use:'韧皮编成的小提篓，可装零碎干货。',seasonality:'常年',description:'用浸软的灰纹韧皮交叉编底、缝口加线的小提篓，提手处双层加固。',inspection:'看编纹紧密、缝口不脱线。',storage:'干处挂放。',acquisition:undefined});
  recipes.push({...structuredClone(like),id:NEW.recipe,name:'编韧皮提篓',aliases:[],minimumProficiency:0,minutes:50,difficulty:like.difficulty??10,
    materials:[{item:NEW.natural,amount:2},{item:processed.item,amount:1}],output:{item:NEW.product,quantity:1},byproducts:[],prerequisites:[],
    process:'韧皮浸软后交叉编底，向上收口成篓身，口沿用线锁缝，提手双层加固。'});
  const site=locs.find(l=>l.id===NEW.site).site;
  site.resources.push({id:NEW.resource,name:'林边灰皮树',item:NEW.natural,quantity:30,minutes:30});
  (site.changes??=[]).push({id:NEW.resource+'_regrow',kind:'regrow',resource:NEW.resource,quantity:3,everyDays:3,max:30});
  wr('world/meta/items.json',items);wr('world/meta/recipes.json',recipes);wr('world/geo/locations.json',locs);
  const info={base:BASE,mut:MUT,...NEW,template:like.id,processedMaterial:processed.item,tools:like.tools,skill:like.skill,workstation:like.workstation,teachers:like.teachers,family:familyOfItem(items.find(i=>i.id===NEW.natural))};
  fs.writeFileSync(path.join(OUT_DIR,'mutation.json'),JSON.stringify(info,null,1));
  return info;
}
if(path.resolve(process.argv[1]??'')===path.resolve(import.meta.filename)){const i=await build({rebuild:process.argv.includes('--rebuild')});console.log(JSON.stringify(i,null,1));}
