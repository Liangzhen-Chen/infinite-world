import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';

// Card E (K2): a holder who sold out restocks from real holders in the settlement, never from outside the simulation;
// another dealer's own usual stock is not drained; payment goes to the seller and the deal is on record.
const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,dealer='npc_hw_wushuo',item='item_resin',holder='npc_hw_shendu',other='npc_hw_linsui';
const qty=(doc,id,it)=>{const v=doc.state.npcs[id].inventory[it];return typeof v==='number'?v:v?.quantity??0;};
async function run(edit){
 const engine=new WorldEngine(structuredClone(world));
 let doc=engine.initialFromLegacy(seed,'ke-distribution');doc.state.minute=600;
 doc=applyPatches(doc,(await engine.reduce(doc,{tool:'world_time',args:{minutes:1},eventId:'open'})).patches);
 edit(doc);resyncBooks(engine,doc);
 const before=structuredClone(doc);
 doc=applyPatches(doc,(await engine.reduce(doc,{tool:'world_time',args:{minutes:DAY},eventId:'day'})).patches);
 return {engine,before,doc};
}
test('a sold-out dealer buys back his usual stock from a villager who holds it; the villager is paid',async()=>{
 const usual=qty(await (async()=>{const e=new WorldEngine(world);return e.initialFromLegacy(seed,'x');})(),dealer,item);
 assert.ok(usual>0,'the hunter normally holds resin for sale');
 const {engine,before,doc}=await run(d=>{d.state.npcs[dealer].inventory[item]=0;d.state.npcs[holder].inventory[item]=12;d.state.npcs[dealer].coins=200;});
 assert.equal(qty(doc,dealer,item),usual);assert.equal(qty(doc,holder,item),12-usual);
 const deal=Object.values(doc.state.records).find(r=>r.category==='market_trade'&&r.buyer===dealer&&r.seller===holder&&r.item===item);
 assert.ok(deal&&deal.quantity===usual&&deal.totalCoins>0);
 // The holder's purse also moves for his own meals that day; the money trail is checked by the ledger reconciliation below.
 // 卡 E2 依据：提供交易又持货的猎户按持货派生为摊（不靠 shopType），补货改由摊的每日补货走同一条 buyFromHolders，
 // 回执记在摊的账（shop:<摊>）而不是 dealer_restock；进货对象、数量与货款不变。
 const rec=doc.state.records['shop:shop_hw_wushuo'];
 assert.deepEqual(rec.entries.find(r=>r.item===item).deals,[{seller:holder,quantity:usual,cost:deal.totalCoins}]);
 assert.equal(Object.entries(doc.ledger.flows).filter(([k])=>k.startsWith(`src:import|${item}|`)).reduce((n,[,v])=>n+v,0),0);
 assert.deepEqual(reconcile(engine,doc).mismatches,[]);
});
test('another dealer keeps his usual stock: only what he holds beyond it is for sale; with nobody else holding it nothing arrives',async()=>{
 const {doc}=await run(d=>{d.state.npcs[dealer].inventory[item]=0;d.state.npcs[other].inventory[item]=0;d.state.npcs[dealer].coins=200;});
 assert.equal(qty(doc,dealer,item),0);
 // The salt the innkeeper normally holds is not taken by a salt-less dealer elsewhere in the village either.
 assert.ok(!Object.values(doc.state.records).some(r=>r.category==='market_trade'&&r.buyer===dealer&&r.item===item));
});
