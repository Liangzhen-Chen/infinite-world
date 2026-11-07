// 卡 D：职业驱动的劳动在真实时间推进里发生，记进现有通道（state.records、npcAutonomy.actions、账本），钱物守恒。
// 玩家只等待，不调用任何采集入口。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {laborCategories} from '../server-plugin/npc-labor.mjs';
import {shopOfKeeper} from '../server-plugin/shop.mjs';
import {saleableStock} from '../server-plugin/market.mjs';
import {stateReader} from '../server-plugin/valuation.mjs';

const world=await loadWorld();
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
async function soak(w,hours){
 const engine=new WorldEngine(w);let doc=engine.createCharacter(seed,{},'kdw'),n=0;
 const calls=[];
 for(let i=0;i<hours;i++){const out=await engine.reduce(doc,{tool:'world_act',args:{action:'core:time',slots:{minutes:60}},eventId:`kdw-${n++}`});calls.push('core:time');if(out.patches?.length)doc=applyPatches(doc,out.patches);}
 return {engine,doc,calls};
}
const laborRows=doc=>Object.values(doc.state.records).filter(r=>r.category==='labor');

test('只给 labor 属性的新职业，有人按它去劳动；劳动记录与账本对得上', {timeout:900000}, async()=>{
 const w=structuredClone(world);
 w.professions.push({id:'profession_kd_probe',name:'晨钟客',kind:'life',aliases:[],labor:['sell']});
 // 选一个原本没有劳动类别、不开铺、手上有可售存货的成年人，只改他的职业称谓。
 const base=new WorldEngine(structuredClone(world)),d0=base.createCharacter(seed,{},'kd0'),read=stateReader(d0.state);
 const keepers=new Set(world.npcs.filter(n=>shopOfKeeper(base,n.id,d0.state)).map(n=>n.id));
 const target=world.npcs.filter(n=>d0.state.npcs[n.id]&&n.age>=18&&!keepers.has(n.id)&&!laborCategories(base,d0.state,n.id).length&&
  Object.keys(d0.state.npcs[n.id].inventory??{}).some(item=>base.byId.get(item)?.basePrice>=2&&saleableStock(read,base,n.id,item).available>=3)).map(n=>n.id).sort();
 assert.ok(target.length,'世界里应有可改职业的人');
 for(const id of target){const n=w.npcs.find(x=>x.id===id);n.occupation='晨钟客';delete n.professions;}
 const {engine,doc,calls}=await soak(w,48);
 assert.ok(calls.every(c=>c==='core:time'));
 const rows=laborRows(doc);
 assert.ok(rows.length>0,'两天里应有职业驱动的劳动');
 for(const r of rows){
  // 卡 E2 依据：出售、跨聚落运输与贩运进货（sell/carry/haul）是由条件派生的买卖劳动，任何成年人都可以做（不看职业名单）；
  // 其余劳动（采集、伐木、加工……）仍只来自职业数据。
  assert.ok(['sell','carry','haul'].includes(r.labor)||laborCategories(engine,doc.state,r.npc).includes(r.labor),`${r.npc} 的职业不含 ${r.labor}`);
  assert.ok(doc.state.npcAutonomy.actions[r.sourceEvent],'劳动记录对应一条自主行动');
  if(r.side==='sell'){
   assert.notEqual(r.buyer,r.npc);assert.ok(r.totalCoins>0);
   const deal=doc.state.records[`market-trade:${r.sourceEvent}`];
   assert.equal(deal?.totalCoins,r.totalCoins,'成交记入市场成交账');
   assert.equal(deal.quantity,r.goods[0].quantity);
  }
 }
 assert.ok(rows.some(r=>target.includes(r.npc)),'新职业“晨钟客”的人应去劳动');
 assert.deepEqual(auditLedger(doc.ledger),[]);
});
