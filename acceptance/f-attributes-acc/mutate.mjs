// 通用性变异：在 F:/dnd-tmp/f-attributes-acc/mut/ 建仓库副本，只改数据、不改代码。
// 副本不带 node_modules（junction 连回基线）、.git、SillyTavern、docs、world/drafts（引擎与加载器都不读 drafts）。
// 每次运行都从 ACC_REPO 重新拷贝代码与数据，再施加变异，保证副本跟着被验收的树走、且幂等。
//
// 新增、从没出现过的数据（id 前缀 acc_，名称也是新造的）：
//   物品 item_acc_thin_sop   稀干粮汤（food，无 nutrition 字段）       —— 配方 recipe_acc_thin_sop：干粮×1 + 清水×1 + 刨屑×1
//   物品 item_acc_thick_sop  稠干粮汤（food，无 nutrition 字段）       —— 配方 recipe_acc_thick_sop：干粮×2 + 清水×1 + 刨屑×1
//   物品 item_acc_ash_tuber  灰皮块茎（food，生，无 nutrition 字段）
//   物品 item_acc_tuber_mash 灰皮块茎泥（food，无 nutrition 字段）     —— 配方 recipe_acc_boil_tuber：灰皮块茎×1 + 清水×1 + 刨屑×1
//   物品 item_acc_peat_brick 泥炭砖（fuel）
//   物品 item_acc_bitterroot 苦根片（herb、medicine）
//   物品 item_acc_cricket_bait 蟋蟀饵（bait）
//   三条新配方都在青灯酒馆灶台（cooking）做，导师林穗。
// 取得路径补位（不是本卡要证的东西，只为让新物品能被真实买到）：林穗库存加 灰皮块茎、泥炭砖、苦根片、蟋蟀饵各 4，竹鱼竿 1。
//   基线世界没有任何竹鱼竿来源（无卖家、无配方），钓饵断言在基线上记 blocked；副本里补一根竿，只为让"饵按类别匹配"能被测到。
import fs from 'node:fs';
import path from 'node:path';
import {BASE,MUT} from './lib.mjs';

const COPY_TOP=['package.json','schemas','server-plugin','tools','world','extension','prompt','tests/helpers','tests/fixtures'];
const SKIP=new Set([path.join(BASE,'world','drafts')]);
export const NEW={
  thinSop:'item_acc_thin_sop',thickSop:'item_acc_thick_sop',tuber:'item_acc_ash_tuber',mash:'item_acc_tuber_mash',
  peat:'item_acc_peat_brick',bitter:'item_acc_bitterroot',cricket:'item_acc_cricket_bait',
  rThin:'recipe_acc_thin_sop',rThick:'recipe_acc_thick_sop',rTuber:'recipe_acc_boil_tuber',
  teacher:'npc_hw_linsui',station:'bld_hw_qingdeng',stocker:'npc_hw_linsui',
};
const rd=f=>JSON.parse(fs.readFileSync(path.join(MUT,f),'utf8'));
const wr=(f,j)=>fs.writeFileSync(path.join(MUT,f),JSON.stringify(j,null,1));

export function build(){
  if(!fs.existsSync(MUT))fs.mkdirSync(MUT,{recursive:true});
  for(const e of COPY_TOP){
    const src=path.join(BASE,e);if(!fs.existsSync(src))continue;
    const dst=path.join(MUT,e);fs.rmSync(dst,{recursive:true,force:true});
    fs.cpSync(src,dst,{recursive:true,filter:s=>!SKIP.has(path.normalize(s))});
  }
  const nm=path.join(MUT,'node_modules');let st=null;try{st=fs.lstatSync(nm);}catch{}
  if(!st)fs.symlinkSync(path.join(BASE,'node_modules'),nm,'junction');

  const items=rd('world/meta/items.json'),recipes=rd('world/meta/recipes.json'),npcs=rd('world/people/baseline.json');
  const I=id=>structuredClone(items.find(x=>x.id===id));
  const mk=(tpl,id,name,tags,extra={})=>{const x=I(tpl);delete x.nutrition;delete x.acquisition;Object.assign(x,{id,name,aliases:[],tags,...extra});
    x.description=`${name}（验收变异新增）`;x.use=`${name}（验收变异新增）`;return x;};
  const add=[
    mk('item_oat_crisp',NEW.thinSop,'稀干粮汤',['food'],{weight:0.45}),
    mk('item_oat_crisp',NEW.thickSop,'稠干粮汤',['food'],{weight:0.65}),
    mk('item_oats',NEW.tuber,'灰皮块茎',['food'],{weight:0.3,basePrice:2}),
    mk('item_oat_crisp',NEW.mash,'灰皮块茎泥',['food'],{weight:0.4}),
    mk('item_charcoal',NEW.peat,'泥炭砖',['fuel'],{weight:0.5,basePrice:2}),
    mk('item_s2_huangjing',NEW.bitter,'苦根片',['herb','medicine'],{weight:0.05,basePrice:3}),
    mk('item_earthworm_bait',NEW.cricket,'蟋蟀饵',['bait'],{weight:0.01,basePrice:1}),
  ];
  for(const x of add){const i=items.findIndex(y=>y.id===x.id);if(i>=0)items[i]=x;else items.push(x);}
  const tpl=recipes.find(r=>r.id==='recipe_w3_oat_crisp');
  const rc=(id,name,materials,out)=>{const r=structuredClone(tpl);Object.assign(r,{id,name,aliases:[],materials,output:{item:out,quantity:1},byproducts:[],teachers:[NEW.teacher],tools:['item_cooking_pot'],
    process:`${name}（验收变异新增）`,learnFee:4,minimumProficiency:0,difficulty:10});return r;};
  const addR=[
    rc(NEW.rThin,'煮稀干粮汤',[{item:'item_ration',amount:1},{item:'item_water',amount:1},{item:'item_wood_shavings',amount:1}],NEW.thinSop),
    rc(NEW.rThick,'煮稠干粮汤',[{item:'item_ration',amount:2},{item:'item_water',amount:1},{item:'item_wood_shavings',amount:1}],NEW.thickSop),
    rc(NEW.rTuber,'煮灰皮块茎',[{item:NEW.tuber,amount:1},{item:'item_water',amount:1},{item:'item_wood_shavings',amount:1}],NEW.mash),
  ];
  for(const r of addR){const i=recipes.findIndex(y=>y.id===r.id);if(i>=0)recipes[i]=r;else recipes.push(r);}
  const n=npcs.find(x=>x.id===NEW.stocker);
  n.inventory={...n.inventory,[NEW.tuber]:4,[NEW.peat]:4,[NEW.bitter]:4,[NEW.cricket]:4,item_bamboo_fishing_rod:1};
  wr('world/meta/items.json',items);wr('world/meta/recipes.json',recipes);wr('world/people/baseline.json',npcs);
  const info={base:BASE,mut:MUT,NEW,items:add.map(x=>({id:x.id,name:x.name,tags:x.tags,nutrition:x.nutrition??null})),recipes:addR.map(r=>({id:r.id,materials:r.materials,output:r.output})),
    stock:{npc:NEW.stocker,added:{[NEW.tuber]:4,[NEW.peat]:4,[NEW.bitter]:4,[NEW.cricket]:4,item_bamboo_fishing_rod:1}}};
  fs.writeFileSync(path.join(path.dirname(MUT),'mutation.json'),JSON.stringify(info,null,1));
  return info;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1')))console.log(JSON.stringify(build(),null,1));
