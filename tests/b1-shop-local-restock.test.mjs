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
import {openLedger} from '../server-plugin/ledger.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,DEPART=7*DAY+540,keeper='npc_hw_duanyan',holder='npc_hw_shendu';
function setup(purse,counter){
 const w=structuredClone(world);
 for(const n of w.npcs){delete n.schedule;delete n.tier;}
 for(const place of w.locations)place.minerals=[];
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'trade-test');
 doc.state.npcs[holder].inventory.item_sickle={quality:'木',durability:100,weight:0.5,quantity:2};
 doc.state.npcs[keeper].coins=purse+counter;doc.ledger=openLedger(engine,doc);// 夹具直接改了钱袋，按旧字段开账（createCharacter 之后账本尚未开，depositCounter 要求开账；做法同 b1-shop-pay.test.mjs）
 if(counter>0){const d=engine.primitiveDraft(doc);depositCounter(d,engine,{owner:keeper,seat:doc.state.npcs[keeper].location,business:'shop_hw_forge',amount:counter,eventId:'b1-counter',writer:'money'});return {engine,doc:d.document};}
 return {engine,doc};
}
// 同一轮连续两笔进货（预算按钱袋现有现金封顶的区分用例）：只改测试运行时克隆出来的世界文档——该补货行 amount 提到 2，两位本聚落持货人各持 1 把铁镰（每个持货人至多一笔），
// 店主只有钱袋 14（无柜台）。第一笔约 10 文从钱袋付出后钱袋只剩约 4，而店主视图整轮固定（钱袋仍是 14）：
// 有封顶（purseNow）时第二笔预算不足、不成交；没有封顶时第二笔按旧视图放行、付款时钱袋不够而抛错（变异 3 应被它杀掉）。
function setupTwoHolders(purseCoins){
 const w=structuredClone(world);
 for(const n of w.npcs){delete n.schedule;delete n.tier;}
 for(const place of w.locations)place.minerals=[];
 w.rules.economy.shops.additionalRestock.shop_hw_forge.find(r=>r.item==='item_sickle').amount=2;
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'trade-test');
 for(const id of [holder,'npc_hw_luowei'])doc.state.npcs[id].inventory.item_sickle={quality:'木',durability:100,weight:0.5,quantity:1};
 doc.state.npcs[keeper].coins=purseCoins;doc.ledger=openLedger(engine,doc);
 return {engine,doc};
}
test('同一轮连续两笔进货：第二笔的预算反映第一笔已从钱袋付出的钱，不抛错、账目守恒、只成交第一笔',async()=>{
 const {engine,doc}=setupTwoHolders(14);
 globalThis.__LEDGER_TRACE__=[];
 let out,trace;
 try{out=await engine.reduce(doc,{tool:'world_time',args:{minutes:DEPART-doc.state.minute},eventId:'wait'});}finally{trace=globalThis.__LEDGER_TRACE__;delete globalThis.__LEDGER_TRACE__;}
 const after=applyPatches(doc,out.patches);
 const bought=after.state.records['shop:shop_hw_forge']?.entries?.find(e=>e.item==='item_sickle'&&e.added);
 assert.ok(bought,'第一笔应当成交');assert.ok(bought.paidCopper>0);
 assert.equal(bought.deals.length,1,'钱袋付出第一笔之后，第二笔预算不足，不成交');
 assert.ok(after.state.npcs[keeper].coins>=0);
 localPayments(trace,engine,after,[holder,'npc_hw_luowei'],bought.paidCopper);
 const result=reconcile(engine,after);
 assert.deepEqual(result.mismatches,[]);assert.deepEqual(result.lots,[]);assert.deepEqual(result.audit,[]);
});
// 守恒判定：这笔本地进货事件（只认锻炉铺铁镰：shop.mjs:483 前缀 shop:shop_hw_forge:<分钟>:item_sickle:local，distribution.mjs:85 追加 :物品:卖方；同一周别的货的本地进货不计入，排除 ':fund' 注资）的过账——付给卖方钱袋的钱必须全部来自店主的钱袋或柜台（没有第三方出钱），合计 = 成交额（没成交则为 0）。
// 不合计全世界现金：七天的世界时间里别的系统（工资、家户、税……）合法地进出现金，全世界合计不是这笔交易的不变量。
function localPayments(trace,engine,after,holders,paidCopper){
 const keeperAccounts=new Set([purse(engine,keeper),dedicatedCoinAccount(after.state,keeper,'counter')?.account].filter(Boolean)),sellers=new Set(holders.map(h=>purse(engine,h)));
 const local=trace.filter(t=>t.writer==='shop'&&String(t.eventId).startsWith('shop:shop_hw_forge:')&&String(t.eventId).includes(':item_sickle:local:')&&!String(t.eventId).endsWith(':fund')),pay=local.filter(t=>sellers.has(t.to));
 assert.deepEqual(local.filter(t=>!sellers.has(t.to)),[],'本地进货的非注资过账只能是付给卖方');
 assert.ok(pay.every(t=>keeperAccounts.has(t.from)),'付给卖方的钱只能来自店主的钱袋或柜台');
 assert.equal(pay.reduce((n,t)=>n+t.amount,0),paidCopper,'付给卖方的合计 = 成交额');
 return pay;
}
// split=true 的组合（钱袋 7、柜台 7，成交额 X∈(7,14]，铁镰 basePrice=10，world/meta/items.json:3）落在旧写法必败的金额区间，但旧写法只在店主拒绝补柜台时才败。
// 11-08 云上实测（b1-c7）：店主同意从钱袋补 5 文进柜台、整笔 12 由柜台付——npc-decision.mjs 对 fund_counter 的 reward 恰等于 cost，单测夹具里找不到只拒补柜台、不拒进货的合法状态。
// 所以本组合只核对：若拆账，两段合计 = 成交额；不论是否拆账，过账来源、合计与 reconcile 都成立。拆账分支本身由 b1-shop-pay.test.mjs（payCounterThenPurse 柜台先付钱袋补）覆盖；
// 店主真实拒补柜台的路径由 tests/playtest-lifecycle.test.mjs 覆盖：旧写法下它在第 2 个月抛 Invalid party balance（b1-c2 全量 288 s 失败，探针 v4 定位到 shop pay），新写法 b1-c5 通过。
for(const [name,purseCoins,counter,mustBuy,split] of [['柜台只有一部分钱、钱袋有余',60,5,true,false],['没有柜台、整笔由钱袋付',60,0,true,false],['柜台与钱袋都不宽裕',40,5,false,false],['钱袋 7、柜台 7：成交额大于两段各自、不大于两段之和',7,7,true,true]]){
 test(`铁匠进货（${name}）：不抛 Invalid party balance，账目守恒，legacy 与账户一致`,async()=>{
  const {engine,doc}=setup(purseCoins,counter);
  globalThis.__LEDGER_TRACE__=[];
  let out,trace;
  try{out=await engine.reduce(doc,{tool:'world_time',args:{minutes:DEPART-doc.state.minute},eventId:'wait'});}finally{trace=globalThis.__LEDGER_TRACE__;delete globalThis.__LEDGER_TRACE__;}
  const after=applyPatches(doc,out.patches);
  const bought=after.state.records['shop:shop_hw_forge']?.entries?.find(e=>e.item==='item_sickle'&&e.added);
  if(mustBuy){assert.ok(bought,'这次进货应当成交');assert.ok(bought.paidCopper>0);assert.deepEqual(bought.from,[holder]);}
  const pay=localPayments(trace,engine,after,[holder],bought?.paidCopper??0);
  if(split){
   // 柜台段与钱袋段（任一段可为 0，取决于店主是否补柜台），合计 = 成交额。
   const counterAccount=dedicatedCoinAccount(after.state,keeper,'counter')?.account;
   const fromCounter=pay.filter(t=>t.from===counterAccount).reduce((n,t)=>n+t.amount,0),fromPurse=pay.filter(t=>t.from===purse(engine,keeper)).reduce((n,t)=>n+t.amount,0);
   assert.equal(fromCounter+fromPurse,bought.paidCopper,'柜台段与钱袋段合计 = 成交额（只有店主钱袋与柜台出钱）');
  }
  const result=reconcile(engine,after);
  assert.deepEqual(result.mismatches,[]);assert.deepEqual(result.lots,[]);assert.deepEqual(result.audit,[]);
 });
}
