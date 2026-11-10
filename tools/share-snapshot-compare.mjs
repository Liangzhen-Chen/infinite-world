// 确定性诊断：从种子世界推进 N 天（默认 30），输出缺粮户数、饥饿人数、主要食物均价、卖家销量分布。
// 只用新旧版本都有的公开接口（loadWorld、WorldEngine.initialFromLegacy/reduce、applyPatches），用于新旧工作树各跑一次后对比。
// 用法：node tools/share-snapshot-compare.mjs [天数=30]
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {fromRational} from '../server-plugin/det-math.mjs';

const days=Number(process.argv[2]??30);
const world=await loadWorld(),engine=new WorldEngine(world),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
let document=engine.initialFromLegacy(legacy,'share-snapshot-compare');
const num=v=>typeof v==='number'?v:v&&typeof v==='object'&&'numerator' in v?fromRational(v):0;
const isFood=id=>(engine.byId.get(id)?.nutrition?.satiety??0)>0;
const seen=new Set(),bySeller={},byItem={};
const collect=()=>{
 for(const [key,r] of Object.entries(document.state.records??{})){
  if(r?.category!=='market_trade'||seen.has(key))continue;
  seen.add(key);
  if(!isFood(r.item)||r.side&&r.side!=='buy'&&r.side!=='sell')continue;
  bySeller[r.seller]=(bySeller[r.seller]??0)+r.quantity;
  const a=byItem[r.item]??={quantity:0,coins:0};a.quantity+=r.quantity;a.coins+=r.totalCoins;
 }
};
let hungryHouseholdDays=0,hungryPersonDays=0;
for(let day=0;day<days;day++){
 const output=await engine.reduce(document,{tool:'world_time',args:{minutes:1440},eventId:`share_compare_day_${day}`});
 document=applyPatches(document,output.patches);
 collect();
 for(const m of Object.values(document.state.family?.meals??{}))if(num(m.missingMeals)>0){hungryHouseholdDays++;hungryPersonDays+=m.members?.length??1;}
}
const meals=Object.values(document.state.family?.meals??{}).filter(m=>num(m.missingMeals)>0);
const volumes=Object.values(bySeller).sort((a,b)=>b-a),total=volumes.reduce((n,x)=>n+x,0),n=volumes.length;
const asc=[...volumes].reverse();
const gini=n>1&&total>0?asc.reduce((s,x,i)=>s+(2*(i+1)-n-1)*x,0)/(n*total):0;
const top5=total>0?volumes.slice(0,5).reduce((a,b)=>a+b,0)/total:0;
const items=Object.entries(byItem).sort((a,b)=>b[1].quantity-a[1].quantity);
const round=(x,k=4)=>Math.round(x*10**k)/10**k;
console.log(JSON.stringify({
 days,finalMinute:document.state.minute,
 缺粮户数_末日:meals.length,饥饿人数_末日:meals.reduce((s,m)=>s+(m.members?.length??1),0),
 缺粮户日累计:hungryHouseholdDays,饥饿人日累计:hungryPersonDays,
 食物成交总量:total,卖家数:n,
 主要食物:items.slice(0,3).map(([id,a])=>({item:id,quantity:a.quantity,均价铜:round(a.coins/a.quantity,2)})),
 卖家销量基尼:round(gini),前5卖家占比:round(top5)
},null,1));
