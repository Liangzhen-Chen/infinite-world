// 只读诊断探针：人类卖家库存少时，向玩家卖食物是否同样被 assertMarketDepth
// 以“扣除自用和已承诺存量后不够出售”拒绝（与怪物卖家对照）。
// 只在内存里克隆世界、改库存/时间/位置/钱，不写任何文件。用法：run-script <dir> tools/probe-market-depth.mjs
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {planBossMigration} from '../server-plugin/boss-migration.mjs';
import {saleableStock} from '../server-plugin/market.mjs';
import {householdMealPlan} from '../server-plugin/household-budget.mjs';
import {resyncBooks} from '../tests/helpers/ledger-sync.mjs';
import {ids} from '../world/design/monster-society-1.mjs';

const DAY=1440;
const world=await loadWorld();
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const engine=new WorldEngine(world);
const base=(()=>{let doc=engine.createCharacter(seed,{},'probe-md');doc=applyPatches(doc,planBossMigration(doc,world.rules,world.bosses,world));return doc;})();
const REJECT=/扣除自用和已承诺存量后不够出售/;
const qty=v=>typeof v==='number'?v:v?.quantity??0;

// 构造：只改 ① 卖家某食物库存量 ② 时间与卖家/玩家位置（卖家当班接待处）③ 玩家钱与血量。
function build(sellerId,item,stock){
 const doc=structuredClone(base),npc=doc.state.npcs[sellerId],def=world.npcs.find(n=>n.id===sellerId);
 const old=npc.inventory?.[item];npc.inventory??={};
 npc.inventory[item]=typeof old==='object'&&old!==null?{...old,quantity:stock}:stock;
 const slot=(def.schedule?.default??[]).find(s=>(s.services??[]).includes('trade'))??(def.schedule?.default??[])[0];
 const minute=DAY*3+(slot?slot.start+5:600);
 doc.state.minute=minute;
 if(slot){npc.location=slot.location;delete npc.scheduleTravel;}
 doc.state.location=npc.location;
 Object.assign(doc.state.player,{coins:1000,hp:500,maxHp:500});
 resyncBooks(engine,doc);
 return {doc,slot,minute};
}
const foodOf=id=>{
 const inv=world.npcs.find(n=>n.id===id).inventory??{};
 return Object.keys(inv).filter(i=>engine.byId.get(i)?.nutrition&&qty(inv[i])>0);
};
function breakdown(doc,sellerId,item){
 const d=engine.primitiveDraft(doc),s=saleableStock(d,engine,sellerId,item,{business:true});
 let members='?';try{const plan=householdMealPlan(d,engine,sellerId);members=(plan.members??plan.household?.members??[]).length||'?';}catch{}
 return `stock=${s.stock} retained(food+seed)=${s.retained} upkeep=${s.upkeep} committed=${s.committed} available=${s.available} householdMembers=${members}`;
}
async function trial(label,sellerId,item,stock){
 const {doc,slot,minute}=build(sellerId,item,stock);
 const line=breakdown(doc,sellerId,item);let verdict;
 try{
  const out=await engine.reduce(doc,{tool:'world_trade',args:{seller:sellerId,item,quantity:1},eventId:`probe-${label}`});
  verdict=`成交 cost=${out.result?.cost}`;
 }catch(e){verdict=`拒绝[${e.code??e.name}] ${e.message}${REJECT.test(e.message)?'  <== 命中：自用/承诺扣除后不够':''}`;}
 console.log(`[${label}] seller=${sellerId} item=${item} 设库存=${stock} 时间=${minute%DAY}分 位置=${doc.state.location} 营业段=${slot?`${slot.start}-${slot.end}`:'无'}`);
 console.log(`    分解: ${line}`);
 console.log(`    结论: ${verdict}`);
}

try{
 const stores=(engine.rules.economy?.shops?.stores??[]).map(s=>s.keeper);
 const isHuman=n=>!n.society&&!(world.monsters??[]).some(m=>m.id===n.species);
 const tradeHumans=world.npcs.filter(n=>isHuman(n)&&(n.services??[]).includes('trade')&&!stores.includes(n.id)&&n.schedule?.default?.some(s=>(s.services??[]).includes('trade'))&&foodOf(n.id).length);
 const keepers=stores.filter(id=>foodOf(id).length);
 console.log(`店主候选=${keepers.join(',')||'无'}；trade服务人类候选(非店主)=${tradeHumans.map(n=>n.id).slice(0,5).join(',')||'无'}`);
 const groups=[['店主',keepers[0]],['trade服务人',tradeHumans[0]?.id]].filter(g=>g[1]);
 for(const [name,id] of groups){
  const item=foodOf(id).includes('item_ration')?'item_ration':foodOf(id)[0];
  for(const stock of [6,20])await trial(`H1-${name}-${stock}`,id,item,stock);
  await trial(`H2-${name}-200`,id,item,200);
 }
 const m=ids.P.yantai;
 await trial('M1-烟苔-20',m,'item_dry_mushroom',20);
 await trial('M1-烟苔-6',m,'item_dry_mushroom',6);
 await trial('M1-烟苔-200',m,'item_dry_mushroom',200);
 console.log('EXIT=0');
}catch(e){console.error(e.stack);console.log('EXIT=1');process.exit(1);}
