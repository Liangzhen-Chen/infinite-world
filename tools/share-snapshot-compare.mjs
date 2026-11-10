// 确定性诊断：从种子世界推进 N 天（默认 30），输出缺粮户数、饥饿人数、主要食物均价、卖家销量分布。
// 只用新旧版本都有的公开接口（loadWorld、WorldEngine.initialFromLegacy/reduce、applyPatches），用于新旧工作树各跑一次后对比。
// 用法：node tools/share-snapshot-compare.mjs [天数=30] [--world seed|full]
// full：与 tests/ledger-stock.test.mjs 的 campaign() 同一个完整世界（createCharacter，玩家在客栈、店主营业），市场更密。
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {fromRational} from '../server-plugin/det-math.mjs';

const args=process.argv.slice(2),days=Number(args.find(a=>/^\d+$/.test(a))??30),mode=args.includes('--world')?args[args.indexOf('--world')+1]:'seed';
const t0=performance.now();
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
let engine,document;
if(mode==='full'){
 const w=structuredClone(world),host='npc_hw_linsui',inn='bld_hw_qingdeng';
 for(const npc of w.npcs.filter(n=>n.id===host))npc.schedule={default:[{start:0,end:1440,location:inn,activity:'营业',services:['trade']}]};
 engine=new WorldEngine(w);document=engine.createCharacter(legacy,{},'share-snapshot-compare');
 document.state.minute=600;document.state.location=inn;document.state.player.coins=2000;
 Object.assign(document.state.npcs[host],{location:inn,activity:'营业',status:'正常'});
}else{engine=new WorldEngine(world);document=engine.initialFromLegacy(legacy,'share-snapshot-compare');}
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
let hungryHouseholdDays=0,hungryPersonDays=0,firstDay=null;
for(let day=0;day<days;day++){
 const output=await engine.reduce(document,{tool:'world_time',args:{minutes:1440},eventId:`share_compare_day_${day}`});
 document=applyPatches(document,output.patches);
 collect();
 for(const m of Object.values(document.state.family?.meals??{}))if(num(m.missingMeals)>0){hungryHouseholdDays++;hungryPersonDays+=m.members?.length??1;}
 if(day===0){const h=Object.values(document.state.family?.meals??{}).filter(m=>num(m.missingMeals)>0);firstDay={户:h.length,人:h.reduce((x,m)=>x+(m.members?.length??1),0)};}
}
const meals=Object.values(document.state.family?.meals??{}).filter(m=>num(m.missingMeals)>0);
const volumes=Object.values(bySeller).sort((a,b)=>b-a),total=volumes.reduce((n,x)=>n+x,0),n=volumes.length;
const asc=[...volumes].reverse();
const gini=n>1&&total>0?asc.reduce((s,x,i)=>s+(2*(i+1)-n-1)*x,0)/(n*total):0;
const top5=total>0?volumes.slice(0,5).reduce((a,b)=>a+b,0)/total:0;
const items=Object.entries(byItem).sort((a,b)=>b[1].quantity-a[1].quantity);
const round=(x,k=4)=>Math.round(x*10**k)/10**k;
console.log(JSON.stringify({
 world:mode,days,耗时秒:round((performance.now()-t0)/1000,1),finalMinute:document.state.minute,
 口径说明:'缺粮=最近一次每日结算(家户餐食记录 state.family.meals)里 missingMeals>0 的户，饥饿人数=这些户的成员数；末日指推进完N天后最近一次结算；首日末是第1天结算后的值，即开局存量不足以支撑第一天的户，不是推进累积出来的',
 缺粮_首日末:firstDay,缺粮户数_末日:meals.length,饥饿人数_末日:meals.reduce((s,m)=>s+(m.members?.length??1),0),
 缺粮户日累计:hungryHouseholdDays,饥饿人日累计:hungryPersonDays,
 食物成交总量:total,卖家数:n,
 主要食物:items.slice(0,3).map(([id,a])=>({item:id,quantity:a.quantity,均价铜:round(a.coins/a.quantity,2)})),
 各卖家销量:bySeller,
 卖家销量基尼:round(gini),前5卖家占比:round(top5)
},null,1));
