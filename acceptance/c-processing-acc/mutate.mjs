// 通用性变异：在 F:/dnd-tmp/c-processing-acc/mut/ 建仓库副本（不复制 node_modules、.git、SillyTavern、docs 正文；node_modules 用 junction 连回基线），
// 只改数据、不改代码：
//  V1 加一种从没出现过的自然材料（雾岩苔绒，长在北林边据点）和一条以它为唯一投入的初加工配方（压苔毡片）。
//  V2 选一种初加工产物，把它的自然投入在世界里的来源（规则表、据点、物种里所有 {item: 投入} 的产出条目）删掉，配方本身不动。
// 用法：node mutate.mjs [--rebuild]   → mut/ 与 mutation.json
import fs from 'node:fs';
import path from 'node:path';
import {BASE,MUT,OUT_DIR,openRepo,derive,categories,manufactured} from './lib.mjs';

// 只带运行引擎与数据所需的目录；.git、SillyTavern、docs 正文、资料目录不带；node_modules 用 junction。
const COPY_TOP=['package.json','schemas','server-plugin','tests','tools','world','extension','prompt'];
export const NEW={natural:'item_acc_cloudmoss',product:'item_acc_moss_felt',recipe:'recipe_acc_press_moss_felt',resource:'nw_acc_cloudmoss',site:'loc_hw_northwood',station:null,teacher:null};
// K8 守门：仓库里有就用仓库的，否则用主仓库工作区里的 tools/k8-guard.mjs。
export const k8Url=repo=>'file:///'+(fs.existsSync(path.join(repo,'tools/k8-guard.mjs'))?repo+'/tools/k8-guard.mjs':(process.env.ACC_K8??'F:/dnd/tools/k8-guard.mjs'));
const rd=f=>JSON.parse(fs.readFileSync(path.join(MUT,f),'utf8'));
const wr=(f,j)=>fs.writeFileSync(path.join(MUT,f),JSON.stringify(j,null,1));
// 只删"产出条目"：数组里形如 {item: X, ...} 的元素（矿脉、据点资源、掉落、采集产物），不动配方、物品表、人物库存。
const YIELD_FILES=['world/meta/rules.json','world/geo/locations.json','world/ecology/species.json','world/meta/monsters.json'];
// 消耗语境（consumes、materials、inputs、feed、needs、cost、bait、fuel……）下的 {item} 是投入不是产出，不删。
const CONSUME=/consum|material|input|feed|need|cost|bait|fuel|require|tool/i;
function stripYields(node,id,hits,where){
  if(CONSUME.test(String(where).split('.').pop().replace(/\[\d+\]/g,'')))return;
  if(Array.isArray(node)){for(let i=node.length-1;i>=0;i--){const x=node[i];if(x&&typeof x==='object'&&!Array.isArray(x)&&x.item===id){hits.push(`${where}[${i}]`);node.splice(i,1);}else stripYields(x,id,hits,`${where}[${i}]`);}}
  else if(node&&typeof node==='object')for(const [k,v] of Object.entries(node))stripYields(v,id,hits,`${where}.${k}`);
}
function countYields(node,id){let n=0;const h=[];stripYields(structuredClone(node),id,h,'');n=h.length;return n;}

export async function build({rebuild=false}={}){
  if(rebuild&&fs.existsSync(MUT)){
    const nm=path.join(MUT,'node_modules');
    let st=null;try{st=fs.lstatSync(nm);}catch{}
    if(st){if(!st.isSymbolicLink())throw Error(`${nm} 不是 junction，拒绝递归删除`);fs.unlinkSync(nm);}
    fs.rmSync(MUT,{recursive:true,force:true});
  }
  if(!fs.existsSync(MUT)){
    fs.mkdirSync(MUT,{recursive:true});
    for(const e of COPY_TOP){if(!fs.existsSync(path.join(BASE,e)))continue;fs.cpSync(path.join(BASE,e),path.join(MUT,e),{recursive:true});}
    // K8 守门读 docs/审查 下的标注表，只带这一个目录。
    if(fs.existsSync(path.join(BASE,'docs/审查')))fs.cpSync(path.join(BASE,'docs/审查'),path.join(MUT,'docs/审查'),{recursive:true});
    fs.symlinkSync(path.join(BASE,'node_modules'),path.join(MUT,'node_modules'),'junction');
  }
  // 每次都从基线数据重新施加，保证幂等。
  for(const f of ['world/meta/items.json','world/meta/recipes.json',...YIELD_FILES])fs.copyFileSync(path.join(BASE,f),path.join(MUT,f));
  const T=await openRepo(BASE),D=derive(T.world),M=manufactured(D),C=categories(D);
  const items=rd('world/meta/items.json'),recipes=rd('world/meta/recipes.json'),locs=rd('world/geo/locations.json');
  // V1
  const wood=items.find(i=>i.id==='item_wood');
  items.push({...structuredClone(wood),id:NEW.natural,name:'雾岩苔绒',aliases:[],basePrice:2,weight:0.2,origin:NEW.site,shelfLifeDays:120,
    use:'石面上刮下的长绒苔，晒干后可压成毡片。',seasonality:'春秋最厚',description:'北林边背阴石面上成片生长的灰绿长绒苔，刮下后蓬松、易吸水。',inspection:'看绒长与干湿，发黑者已腐。',storage:'通风处摊晾，防潮。'});
  items.push({...structuredClone(wood),id:NEW.product,name:'压苔毡片',aliases:[],basePrice:6,weight:0.3,origin:NEW.station,shelfLifeDays:365,tags:['fiber','material'],
    use:'苔绒压成的薄毡，可垫可裹。',seasonality:'常年',description:'把晒干的苔绒铺平、洒水、反复压实后晾干的薄毡片。',inspection:'看厚薄均匀、无破洞。',storage:'干处叠放。'});
  // 新配方照现有数据的常见形状写：取第一条有师傅可学的配方作样板（技能、工位、师傅沿用），只换投入与产物。
  const like=recipes.find(r=>r.learningRequired&&r.teachers?.length&&r.workstation);
  NEW.station=T.world.locations&&Object.values(T.world.locations).find(l=>(l.workstations??[]).some(w=>w.kind===like.workstation))?.id;NEW.teacher=like.teachers[0];
  items.find(i=>i.id===NEW.product).origin=NEW.station;
  recipes.push({...structuredClone(like),id:NEW.recipe,name:'压制苔毡',aliases:[],minutes:40,materials:[{item:NEW.natural,amount:2}],tools:[],toolWear:0,
    output:{item:NEW.product,quantity:1},byproducts:[],prerequisites:[],failure:{recoverFraction:0,injury:0},
    process:'苔绒摊平洒水，反复压实后晾干成毡。'});
  const addV1=L=>{const site=L.find(l=>l.id===NEW.site).site;
    site.resources.push({id:NEW.resource,name:'石上雾苔',item:NEW.natural,quantity:20,minutes:30});
    (site.changes??=[]).push({id:NEW.resource+'_regrow',kind:'regrow',resource:NEW.resource,quantity:2,everyDays:3,max:20});};
  wr('world/meta/items.json',items);wr('world/meta/recipes.json',recipes);
  // V2：候选 = 九类产物的产出配方里的自然投入（不是任何配方的产物），且它在规则表/据点/物种里有产出条目。
  // 按产出条目数从少到多逐个试删；删后用 K8 守门确认这项自然投入已全世界都不产（删干净了），取第一个删干净的。
  const fresh=()=>Object.fromEntries(YIELD_FILES.map(f=>[f,JSON.parse(fs.readFileSync(path.join(BASE,f),'utf8'))]));
  const cand=[];const docs0=fresh();
  for(const [cat,ids] of Object.entries(C))for(const id of ids)for(const rid of D.producedBy[id]??[]){const r=D.recipes.find(x=>x.id===rid);
    for(const m of r.materials??[]){if(M.has(m.item)||cand.some(c=>c.product===id&&c.naturalInput===m.item))continue;const n=YIELD_FILES.reduce((s,f)=>s+countYields(docs0[f],m.item),0);if(n>0)cand.push({category:cat,product:id,recipe:rid,naturalInput:m.item,yieldEntries:n});}}
  cand.sort((a,b)=>a.yieldEntries-b.yieldEntries);
  const {runK8Guard}=await import(k8Url(BASE));
  let v2=null;const tried=[];
  for(const c of cand.slice(0,8)){
    const docs=fresh(),removed=[];
    for(const f of YIELD_FILES){const h=[];stripYields(docs[f],c.naturalInput,h,f);removed.push(...h);}
    // 删掉据点资源时，一并删掉指向它的再生条目（否则是悬空引用）。
    for(const l of docs['world/geo/locations.json']){const s=l.site;if(!s?.changes)continue;const ids=new Set((s.resources??[]).map(r=>r.id));s.changes=s.changes.filter(ch=>ch.kind!=='regrow'||ids.has(ch.resource));}
    addV1(docs['world/geo/locations.json']);
    for(const f of YIELD_FILES)wr(f,docs[f]);
    const rep=runK8Guard(MUT),find=id=>rep.findings.find(x=>x.rule==='origin-not-produced'&&x.id===id)?.detail??null;
    const inputGone=/全世界都不产/.test(find(c.naturalInput)??'');
    tried.push({...c,inputDetailAfter:find(c.naturalInput),inputGone});
    if(inputGone){v2={...c,removed,productDetailAfter:find(c.product)};break;}
  }
  if(!v2){const docs=fresh();addV1(docs['world/geo/locations.json']);for(const f of YIELD_FILES)wr(f,docs[f]);}
  const info={base:BASE,mut:MUT,V1:{...NEW,recipeTemplate:like.id},V2:v2,V2tried:tried};
  fs.writeFileSync(path.join(OUT_DIR,'mutation.json'),JSON.stringify(info,null,1));
  return info;
}
if(path.resolve(process.argv[1]??'')===path.resolve(import.meta.filename)){const i=await build({rebuild:process.argv.includes('--rebuild')});console.log(JSON.stringify(i,null,1));}
