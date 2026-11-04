// 通用性变异：在仓库副本 mut/ 里加从没出现过的数据（新物种、新畜群），不改原仓库。
// 新物种由现有畜牧物种"照属性克隆"：复制它在 monsters.json 与 species.json 里的全部字段（无论实现者给它加了什么属性），
// 然后删掉一切指向物品 id 的产物名单（掉落表、husbandry.yields 等，饲料与驯养食物除外），换掉名字与文案。
// 再做"去属性"版本：只留身份、等级模板、饲料与繁殖参数，其余属性（tags、diet 等）全部删除。
import fs from 'node:fs/promises';
import {syncMutCopy,world,MUT} from './lib.mjs';

const KEEP_ITEM_REFS=new Set(['feed','taming','tamingRule']);
const refsItem=v=>typeof v==='string'?/^item_/.test(v):Array.isArray(v)?v.some(refsItem):v&&typeof v==='object'?Object.values(v).some(refsItem):false;
function stripProducts(o){
  if(Array.isArray(o))return o.filter(x=>!refsItem(x)).map(stripProducts);
  if(!o||typeof o!=='object')return o;
  const out={};
  for(const [k,v] of Object.entries(o)){if(KEEP_ITEM_REFS.has(k)){out[k]=v;continue;}if(refsItem(v)&&(typeof v!=='object'||!v||Array.isArray(v)||k!=='husbandry'))continue;out[k]=stripProducts(v);}
  return out;
}
// 只算"身份与非属性"的字段；去属性版本只保留这些。
const MONSTER_IDENTITY=['id','name','aliases','template','levelRange','habitatTags','grouping','intelligence','taming','tamingRule','appearance','habits','threat','materials','folklore','voice'];
const HUSBANDRY_IDENTITY=['feed','birthPerHeadDay','labor'];
const TEXT={appearance:'体形中等的家养兽类，外观没有特别的标记。',habits:'白天在圈边吃喂给它的饲料，夜里卧圈。',threat:'性情温顺。',materials:'（无文案）',folklore:'（无文案）',voice:'低声哼叫。'};

// set='B'：只加玩家名下的现有物种畜群（繁育、满圈、宰杀备用）；set='C'：加新物种及其畜群。
export async function buildMut({set='C',sync=true}={}){
  const withNovel=set==='C';
  const root=sync?syncMutCopy():`${MUT}/world`;
  const monstersPath=`${root}/meta/monsters.json`,speciesPath=`${root}/ecology/species.json`;
  const monsters=JSON.parse(await fs.readFile(monstersPath,'utf8')),eco=JSON.parse(await fs.readFile(speciesPath,'utf8'));
  // 防止重复变异：先去掉上次加的
  const fresh=id=>!/^monster_acc_|^population_acc_/.test(id);
  const ms=monsters.filter(m=>fresh(m.id)),sp=eco.species.filter(s=>fresh(s.id)),herds=(eco.herds??[]).filter(h=>fresh(h.id));
  const M=new Map(ms.map(m=>[m.id,m]));
  const husb=sp.filter(s=>s.husbandry&&M.has(s.id));
  const isBird=s=>(M.get(s.id).tags??[]).includes('bird');
  const birdSrc=husb.find(isBird),mammalSrc=husb.find(s=>!isBird(s));
  if(!birdSrc||!mammalSrc)throw Error(`找不到可克隆的畜牧物种：bird=${birdSrc?.id} mammal=${mammalSrc?.id}`);
  const clone=(src,id,name,{withAttributes})=>{
    let m=stripProducts(structuredClone(M.get(src.id)));delete m.wildlife;
    Object.assign(m,{id,name,aliases:[]},Object.fromEntries(Object.entries(TEXT).filter(([k])=>k in m)));
    let s=stripProducts(structuredClone(src));s.id=id;delete s.interactions;
    if(!withAttributes){
      m=Object.fromEntries(Object.entries(m).filter(([k])=>MONSTER_IDENTITY.includes(k)));
      s={id,ecology:s.ecology?{niche:s.ecology.niche}:undefined,husbandry:Object.fromEntries(Object.entries(s.husbandry).filter(([k])=>HUSBANDRY_IDENTITY.includes(k)))};
      if(!s.ecology)delete s.ecology;
    }
    return {m,s};
  };
  const novel=[
    {id:'monster_acc_mistmane',name:'雾鬃兽',src:mammalSrc,withAttributes:true,kind:'mammal'},
    {id:'monster_acc_mistmane_bare',name:'素雾兽',src:mammalSrc,withAttributes:false,kind:'mammal'},
    {id:'monster_acc_reedfowl',name:'苇冠禽',src:birdSrc,withAttributes:true,kind:'bird'},
    {id:'monster_acc_reedfowl_bare',name:'素苇禽',src:birdSrc,withAttributes:false,kind:'bird'}
  ];
  if(withNovel)for(const n of novel){const {m,s}=clone(n.src,n.id,n.name,n);ms.push(m);sp.push(s);n.monster=m;n.species=s;}
  const loc=world.locations.some(l=>l.id==='loc_hw')?'loc_hw':world.locations[0].id;
  const herd=(id,name,species,count,capacity)=>({id,name,owner:'player',location:loc,species,count,capacity});
  const novelHerds=[
    herd('population_acc_x','玩家的雾鬃兽群','monster_acc_mistmane',40,80),
    herd('population_acc_x0','玩家的素雾兽群','monster_acc_mistmane_bare',40,80),
    herd('population_acc_y','玩家的苇冠禽群','monster_acc_reedfowl',12,40),
    herd('population_acc_y0','玩家的素苇禽群','monster_acc_reedfowl_bare',12,40)
  ];
  const newHerds=withNovel?novelHerds:[
    herd('population_acc_breed','玩家的繁育群',birdSrc.id,400,3000),
    herd('population_acc_pen','玩家的满圈群',birdSrc.id,400,400),
    herd('population_acc_flock','玩家的兽群',mammalSrc.id,6,40)
  ];
  eco.species=sp;eco.herds=[...herds,...newHerds];
  await fs.writeFile(monstersPath,JSON.stringify(ms,null,1));await fs.writeFile(speciesPath,JSON.stringify(eco,null,1));
  return {root,location:loc,birdSrc:birdSrc.id,mammalSrc:mammalSrc.id,novel:novel.filter(n=>n.monster).map(({monster,species,src,...n})=>({...n,src:src.id,monster,species})),herds:newHerds};
}
