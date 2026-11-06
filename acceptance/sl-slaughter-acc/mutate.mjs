// 通用性变异：在 mut/ 建仓库副本（只复制运行所需目录，node_modules 用 junction 连回基线），只改数据、不改代码。
// 加五个从没出现过的物种（灰绒小羊/灰绒大羊/长耳灰兔/垦壤猪/高原牦牛，只写体重、毛被、饲料等属性，不写任何产物表）
// 和一件从没出现过的刃具（燧石割刀，只带 cut 用途标签）。
// 用法：node mutate.mjs [--rebuild]   → mut/ 与 mutation.json
import fs from 'node:fs';
import path from 'node:path';
import {BASE,MUT,OUT_DIR,has} from './lib.mjs';

const COPY_TOP=['package.json','schemas','server-plugin','tests','tools','world','extension','prompt'];
export const NEW={
  blade:'item_acc_sl_flint_blade',
  species:{
    sheepS:{id:"monster_acc_sl_sheep_s",mass:12,coat:'wool',lactation:0.002,tags:['beast','fur']},
    sheepL:{id:"monster_acc_sl_sheep_l",mass:24,coat:'wool',lactation:0.002,tags:['beast','fur']},
    hare:{id:'monster_acc_sl_hare',mass:6,coat:'hair',tags:['beast','fur']},
    pig:{id:"monster_acc_sl_pig",mass:28,tags:['beast']},
    ox:{id:'monster_acc_sl_ox',mass:400,coat:'hair',lactation:0.001,tags:['beast','fur']},
  },
};
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
  for(const f of ['world/meta/items.json','world/meta/monsters.json','world/meta/mechanics/species.json','world/ecology/species.json'])fs.copyFileSync(path.join(BASE,f),path.join(MUT,f));
  const items=rd('world/meta/items.json'),monsters=rd('world/meta/monsters.json'),mech=rd('world/meta/mechanics/species.json'),eco=rd('world/ecology/species.json');
  const knife=items.find(i=>i.id==='item_kitchen_knife'),goat=monsters.find(m=>m.id==='monster_bent_horn_goat');
  const goatEco=eco.species.find(s=>s.id==='monster_bent_horn_goat');
  items.push({...structuredClone(knife),id:NEW.blade,name:'燧石割刀',aliases:[],tags:['cut','tool'],use:'燧石打出刃口的割刀，能切割。',description:'燧石打出刃口的割刀，能切割。'});
  for(const [key,sp] of Object.entries(NEW.species)){
    monsters.push({...structuredClone(goat),id:sp.id,name:`验收${key}`,aliases:[],drops:[],tags:sp.tags,habitatTags:['验收无'],wildlife:{...structuredClone(goat.wildlife),population:0,capacity:0}});
    mech[sp.id]={husbandry:{taxon:`acc_${key}`,bodyMassKg:sp.mass,...(sp.coat?{coat:sp.coat}:{}),...(sp.lactation?{lactation:sp.lactation}:{})}};
    eco.species.push({id:sp.id,ecology:structuredClone(goatEco.ecology),husbandry:{feed:{item:'item_oats',perHead:Math.max(0.02,sp.mass/160)},birthPerHeadDay:0.0006,labor:{factor:0.25,hoursPerDay:6}}});
  }
  wr('world/meta/items.json',items);wr('world/meta/monsters.json',monsters);wr('world/meta/mechanics/species.json',mech);wr('world/ecology/species.json',eco);
  fs.writeFileSync(path.join(OUT_DIR,'mutation.json'),JSON.stringify({base:BASE,mut:MUT,...NEW},null,1));
  return MUT;
}
if(import.meta.filename&&process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))await build({rebuild:has('--rebuild')});
