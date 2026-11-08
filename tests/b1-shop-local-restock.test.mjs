// 店主向本聚落持货人进货（shop.mjs localRestock）：柜台只有一部分钱、或没有柜台、或钱袋比家户视图里的现金少时，
// 预算按钱袋现有现金封顶、付款先柜台后钱袋，进货成交、不抛 Invalid party balance、账目守恒、legacy 与账户一致。
// 用真实世界的锻炉铺（settlement-trade.test.mjs 同一夹具思路：一位村民手里有 2 把铁镰，铁匠向他进货），只改铁匠的钱袋与柜台。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {depositCounter,dedicatedCoinAccount,purse} from '../server-plugin/money.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,DEPART=7*DAY+540,keeper='npc_hw_duanyan',holder='npc_hw_shendu';
function setup(purse,counter){
 const w=structuredClone(world);
 for(const n of w.npcs){delete n.schedule;delete n.tier;}
 for(const place of w.locations)place.minerals=[];
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'trade-test');
 doc.state.npcs[holder].inventory.item_sickle={quality:'木',durability:100,weight:0.5,quantity:2};
 doc.state.npcs[keeper].coins=purse+counter;resyncBooks(engine,doc);
 if(counter>0){const d=engine.primitiveDraft(doc);depositCounter(d,engine,{owner:keeper,seat:doc.state.npcs[keeper].location,business:'shop_hw_forge',amount:counter,eventId:'b1-counter',writer:'money'});return {engine,doc:d.document};}
 return {engine,doc};
}
const cashTotal=doc=>{
 const s=doc.state,counters=Object.values(s.records??{}).filter(r=>r.category==='money_account'&&r.purpose==='counter').reduce((n,r)=>n+r.coins,0);
 return s.player.coins+Object.values(s.npcs).reduce((n,p)=>n+p.coins,0)+Object.values(s.settlements).reduce((n,x)=>n+x.treasury,0)+Object.values(s.workshopFunds??{}).reduce((n,c)=>n+c,0)+counters;
};
// split=true 的组合是旧写法必败的那一个：旧写法只有在“店主拒绝补柜台，且成交额 X 大于钱袋、也大于柜台、但不大于两者之和”时才整笔记到钱袋上而抛 Invalid party balance；
// 钱袋 7、柜台 7 时 X∈(7,14] 正是这个区间（铁镰 basePrice=10，world/meta/items.json:3，1 件约 10 文）。能否真的走到拆账取决于店主是否拒绝补柜台（keeperChoice），
// 所以该组合在成交后用账本过账核对“柜台段与钱袋段都付了钱、合计等于成交额”，没走到拆账就明确失败（说明该组合没有迫使店主拒绝，不是静默变弱）。
for(const [name,purseCoins,counter,mustBuy,split] of [['柜台只有一部分钱、钱袋有余',60,5,true,false],['没有柜台、整笔由钱袋付',60,0,true,false],['柜台与钱袋都不宽裕',40,5,false,false],['钱袋 7、柜台 7：成交额大于两段各自、不大于两段之和（必须拆账）',7,7,true,true]]){
 test(`铁匠进货（${name}）：不抛 Invalid party balance，账目守恒，legacy 与账户一致`,async()=>{
  const {engine,doc}=setup(purseCoins,counter),before=cashTotal(doc);
  if(split)globalThis.__LEDGER_TRACE__=[];
  let out,trace;
  try{out=await engine.reduce(doc,{tool:'world_time',args:{minutes:DEPART-doc.state.minute},eventId:'wait'});}finally{trace=globalThis.__LEDGER_TRACE__;delete globalThis.__LEDGER_TRACE__;}
  const after=applyPatches(doc,out.patches);
  assert.equal(cashTotal(after),before,'全世界现金（含柜台）前后相等');
  const bought=after.state.records['shop:shop_hw_forge']?.entries?.find(e=>e.item==='item_sickle'&&e.added);
  if(mustBuy){assert.ok(bought,'这次进货应当成交');assert.ok(bought.paidCopper>0);assert.deepEqual(bought.from,[holder]);}
  if(split){
   // 付给卖方的过账（本地进货事件，排除 :fund 注资）：柜台段与钱袋段各一笔或多笔，合计 = 成交额。
   const counterAccount=dedicatedCoinAccount(after.state,keeper,'counter')?.account,pay=trace.filter(t=>t.writer==='shop'&&t.to===purse(engine,holder)&&String(t.eventId).includes(':local:')&&!String(t.eventId).endsWith(':fund'));
   const fromCounter=pay.filter(t=>t.from===counterAccount).reduce((n,t)=>n+t.amount,0),fromPurse=pay.filter(t=>t.from===purse(engine,keeper)).reduce((n,t)=>n+t.amount,0);
   assert.equal(fromCounter+fromPurse,bought.paidCopper,'柜台段与钱袋段合计 = 成交额');
   assert.ok(fromCounter>0&&fromPurse>0,`必须拆账（柜台段 ${fromCounter}，钱袋段 ${fromPurse}）：若为 0，说明店主同意补了柜台，本组合没有走到旧写法必败的区间`);
  }
  const result=reconcile(engine,after);
  assert.deepEqual(result.mismatches,[]);assert.deepEqual(result.lots,[]);assert.deepEqual(result.audit,[]);
 });
}
