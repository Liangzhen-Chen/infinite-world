// 通用性变异：在 mut/route 与 mut/item 建两份仓库副本（只复制运行所需目录；node_modules、world/drafts 用 junction 连回被测树），只改数据、不改代码。
//  - mut/route：选一条聚落间路线，把路程（lengthKm）调到 4 倍、事故率（risk）加 2，其余不变。用来测第 4 条（路线远近与安危影响价差）。
//  - mut/item ：加一种从没出现过的可交易物（岭背酸枣），只长在一个聚落门口的采集点上，没有任何配方产出它，开局没人持有。用来测第 7 条。
// 选哪条路线、哪个聚落、拿哪件物品当样板，全部从数据推，不按名单。
// 用法：node mutate.mjs [--rebuild]   → mut/route、mut/item 与 mutation.json
import fs from 'node:fs';
import path from 'node:path';
import {BASE,MUT,OUT_DIR,openRepo} from './lib.mjs';

const COPY_TOP=['package.json','schemas','server-plugin','tests','tools','world','extension','prompt'];
const LINK_WORLD=new Set(['drafts']);// 大而只读的目录，junction 过去
export const NEW={item:'item_acc_e2_ridge_jujube',resource:'acc_e2_ridge_jujube'};

function copyTree(dir){
  const stamp=path.join(dir,'.base');
  const unlinkJ=p=>{let st=null;try{st=fs.lstatSync(p);}catch{}if(st){if(!st.isSymbolicLink())throw Error(`${p} 不是 junction，拒绝递归删除`);fs.unlinkSync(p);}};
  if(fs.existsSync(dir)&&(process.argv.includes('--rebuild')||!fs.existsSync(stamp)||fs.readFileSync(stamp,'utf8')!==BASE)){
    unlinkJ(path.join(dir,'node_modules'));for(const d of LINK_WORLD)unlinkJ(path.join(dir,'world',d));
    fs.rmSync(dir,{recursive:true,force:true});
  }
  if(!fs.existsSync(dir)){
    fs.mkdirSync(dir,{recursive:true});
    for(const e of COPY_TOP){const src=path.join(BASE,e);if(!fs.existsSync(src))continue;
      if(e==='world'){fs.mkdirSync(path.join(dir,'world'));for(const w of fs.readdirSync(src)){
        if(LINK_WORLD.has(w))fs.symlinkSync(fs.realpathSync(path.join(src,w)),path.join(dir,'world',w),'junction');
        else fs.cpSync(path.join(src,w),path.join(dir,'world',w),{recursive:true});}}
      else fs.cpSync(src,path.join(dir,e),{recursive:true});}
    fs.symlinkSync(fs.realpathSync(path.join(BASE,'node_modules')),path.join(dir,'node_modules'),'junction');
    fs.writeFileSync(stamp,BASE);
  }
}
const rd=(dir,f)=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
const wr=(dir,f,j)=>fs.writeFileSync(path.join(dir,f),JSON.stringify(j,null,1));
const reset=(dir,f)=>fs.copyFileSync(path.join(BASE,f),path.join(dir,f));

// 数据层的地理：位置 → 聚落（settlements.json 里的聚落，沿 parent 链）。
function geo(dir){
  const locs=rd(dir,'world/geo/locations.json'),sets=rd(dir,'world/geo/settlements.json'),routes=rd(dir,'world/geo/routes.json');
  const L=new Map(locs.map(l=>[l.id,l])),S=new Set(sets.map(s=>s.id));
  const sOf=p=>{for(let id=p,i=0;id&&i<30;i++,id=L.get(id)?.parent)if(S.has(id))return id;return null;};
  // 路线端点所属聚落：端点就是聚落，或是聚落下的非采集点位置；野外采集点（带 site）不算任何聚落。
  const endS=p=>S.has(p)?p:(L.get(p)?.site?null:sOf(p));
  return {locs,sets,routes,L,S,sOf,endS};
}

export function buildRoute(active){
  const dir=`${MUT}/route`;copyTree(dir);
  reset(dir,'world/geo/routes.json');
  const {routes,sets,sOf,endS}=geo(dir),residents=rd(dir,'world/people/residents.json'),npcs=rd(dir,'world/people/baseline.json');
  // 只看引擎实际模拟的聚落（开局存档 state.settlements）之间的路线。
  const inter=routes.filter(r=>{const a=endS(r.from),b=endS(r.to);return a&&b&&a!==b&&active.has(a)&&active.has(b);});
  const degree=new Map();for(const r of inter)for(const s of [endS(r.from),endS(r.to)])degree.set(s,(degree.get(s)??0)+1);
  // 只有一条聚落间路线的"末梢"聚落：它和外面的全部往来都要走这条路。挑开局居民持有的可交易物种类最多的那个。
  const inventories=new Map();
  const people=Array.isArray(npcs)?npcs:(npcs.npcs??Object.values(npcs));
  for(const n of people){const s=residents.find(r=>r.id===n.id)?.settlement??sOf(n.home?.location??n.location);if(!s)continue;
    const set=inventories.get(s)??inventories.set(s,new Set()).get(s);for(const k of Object.keys(n.inventory??{}))set.add(k);}
  const leaves=sets.map(s=>s.id).filter(s=>active.has(s)&&degree.get(s)===1).sort((a,b)=>((inventories.get(b)?.size??0)-(inventories.get(a)?.size??0))||a.localeCompare(b));
  if(!leaves.length)throw Error('数据里没有只连一条聚落间路线的聚落');
  const leaf=leaves[0],route=inter.find(r=>endS(r.from)===leaf||endS(r.to)===leaf);
  const before={lengthKm:route.lengthKm,risk:route.risk};
  route.lengthKm=route.lengthKm*4;route.risk=(route.risk??0)+2;
  wr(dir,'world/geo/routes.json',routes);
  return {dir,leaf,route:route.id,ends:[endS(route.from),endS(route.to)],before,after:{lengthKm:route.lengthKm,risk:route.risk},leafCandidates:leaves};
}

export function buildItem(active,gatherers=new Map()){
  const dir=`${MUT}/item`;copyTree(dir);
  for(const f of ['world/meta/items.json','world/geo/locations.json'])reset(dir,f);
  const items=rd(dir,'world/meta/items.json'),recipes=rd(dir,'world/meta/recipes.json');
  const {locs,routes,sOf,S}=geo(dir);
  const I=new Map(items.map(i=>[i.id,i])),produced=new Set(recipes.flatMap(r=>[r.output?.item,...(r.byproducts??[]).map(b=>b.item)]));
  // 样板：采集点上长、带 food 标签、不是饮水、盐、矿物或谷物、没有配方产出的物品里，目录价最低的一种。
  const sited=new Set(locs.flatMap(l=>(l.site?.resources??[]).map(r=>r.item)));
  const proto=[...sited].map(id=>I.get(id)).filter(i=>i&&(i.tags??[]).includes('food')&&!(i.tags??[]).some(t=>/drink|water|salt|mineral|grain/.test(t))&&!produced.has(i.id))
    .sort((a,b)=>(a.basePrice-b.basePrice)||a.id.localeCompare(b.id))[0];
  if(!proto)throw Error('找不到可采的食物样板');
  // 产地：只与一个聚落有路线相连、且已有采集资源的野外采集点；先挑相连聚落里职业带 gather 的居民最多的，再挑人口最少的（需求在别处）。
  const pop=new Map(rd(dir,'world/geo/settlements.json').map(s=>[s.id,s.population]));
  const sites=locs.filter(l=>l.site?.resources?.length&&!S.has(l.id)).map(l=>{
    const nb=new Set(routes.filter(r=>r.from===l.id||r.to===l.id).map(r=>r.from===l.id?r.to:r.from).filter(x=>S.has(x)));
    return {l,nb:[...nb]};}).filter(x=>x.nb.length===1&&active.has(x.nb[0])).sort((a,b)=>((gatherers.get(b.nb[0])??0)-(gatherers.get(a.nb[0])??0))||(pop.get(a.nb[0])-pop.get(b.nb[0]))||a.l.id.localeCompare(b.l.id));
  if(!sites.length)throw Error('找不到只连一个聚落的采集点');
  const {l:site,nb:[home]}=sites[0];
  items.push({...structuredClone(proto),id:NEW.item,name:'岭背酸枣',aliases:[],basePrice:Math.max(1,Math.round(proto.basePrice*1.5)),origin:site.id,
    shelfLifeDays:Math.max(5,Math.round((proto.shelfLifeDays??30)*0.6)),
    use:'坡上野生的小酸枣，晒干可当零嘴，也能煮粥。',seasonality:'秋后最多',description:'岭背坡上一丛丛野酸枣结的小果，皮红肉薄，酸里带甜。',
    inspection:'看果皮红亮不发黑、无虫眼。',storage:'晒干装袋，防潮防鼠。'});
  const s=locs.find(x=>x.id===site.id).site;
  s.resources.push({id:NEW.resource,name:'坡上酸枣丛',item:NEW.item,quantity:40,minutes:30});
  (s.changes??=[]).push({id:NEW.resource+'_regrow',kind:'regrow',resource:NEW.resource,quantity:4,everyDays:2,max:40});
  wr(dir,'world/meta/items.json',items);wr(dir,'world/geo/locations.json',locs);
  return {dir,item:NEW.item,prototype:proto.id,site:site.id,producerSettlement:home,siteSettlementByParent:sOf(site.id)};
}

export async function build(){
  fs.mkdirSync(MUT,{recursive:true});
  // 引擎实际模拟的聚落：在被测树上开一局新档读 state.settlements（只读）。
  const T=await openRepo(BASE),active=new Set(Object.keys(T.newGame('mut-probe').doc.state.settlements??{}));
  const gp=new Set(T.world.professions.filter(p=>(p.labor??[]).includes('gather')).map(p=>p.id)),gatherers=new Map();
  for(const n of T.world.npcs)if((n.professions??[]).some(p=>gp.has(p))){const s=T.homeOf(n.id);if(s)gatherers.set(s,(gatherers.get(s)??0)+1);}
  const info={base:BASE,active:[...active],gatherers:Object.fromEntries(gatherers),route:buildRoute(active),item:buildItem(active,gatherers)};
  fs.writeFileSync(path.join(OUT_DIR,'mutation.json'),JSON.stringify(info,null,1));
  return info;
}
if(path.resolve(process.argv[1]??'')===path.resolve(import.meta.filename))console.log(JSON.stringify(await build(),null,1));
