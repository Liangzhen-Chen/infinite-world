// 诊断：完整世界里把食物/作物按 1x/10x/50x 塞进本聚落各户与店主的库存，冷读 marketSupply、householdResources 各 N 次，输出各档墙钟。
// 只用新旧版本都有的公开函数。用法：node tools/stock-scale-probe.mjs [N=10]（配 node --cpu-prof 剖析）
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {marketSupply} from '../server-plugin/market.mjs';
import {householdResources} from '../server-plugin/household-budget.mjs';

const N=Number(process.argv[2]??10),world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const inn='bld_hw_qingdeng',BASE=10;
const foods=world.items.filter(i=>(i.nutrition?.satiety??0)>0).map(i=>i.id);
const out={foodKinds:foods.length,N,scales:{}};
for(const scale of [1,10,50]){
 const engine=new WorldEngine(structuredClone(world)),doc=engine.createCharacter(legacy,{},'stock-scale-probe');
 doc.state.minute=600;doc.state.location=inn;
 const place=engine.world.npcs.find(n=>n.id==='npc_hw_linsui');
 let holders=0;
 for(const [id,n] of Object.entries(doc.state.npcs)){
  if(n.location&&n.location.startsWith('bld_hw')||n.location==='loc_hw'){n.inventory=Object.fromEntries(foods.map(f=>[f,BASE*scale]));holders++;}
 }
 doc.ledger=openLedger(engine,doc);
 const d=engine.primitiveDraft(doc),ids=Object.keys(doc.state.npcs).filter(id=>doc.state.npcs[id].inventory&&Object.keys(doc.state.npcs[id].inventory).length).slice(0,40);
 const time=(label,fn)=>{const t=performance.now();for(let i=0;i<N;i++){d.set(['state','probe'],i);fn();}return Math.round(performance.now()-t);};// 写一次使同版本缓存失效，保证每次冷读
 out.scales[scale]={holders,
  marketSupply_ms:time('ms',()=>marketSupply(d,engine,'item_bread',inn)),
  householdResources_ms:time('hr',()=>{for(const id of ids)householdResources(d,engine,id);}),
  householdResourcesHouseholds:ids.length};
}
console.log(JSON.stringify(out,null,1));
