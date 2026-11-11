// 经营者的进货款：柜台先付（付到柜台所有），不足的部分由本人钱袋付；两段都是真实转移，钱袋段同时记 legacy coins；两者加起来也不够就响亮失败、不写任何东西。
// 对应批次 1 完整检查里 month-three 的 Invalid party balance：柜台只有一部分钱、店主又不补柜台时，旧写法整笔记到钱袋上，钱袋单独付不起。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {purse,depositCounter,counterCash,payCounterThenPurse,mirrorPartyCoins} from '../server-plugin/money.mjs';
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const keeper='npc_hw_duanyan',seller='npc_hw_luowei';
function fixture({purseCoins=100,counter=30}={}){
 const e=new WorldEngine(structuredClone(world)),doc=e.createCharacter(legacy,{},'b1-shop-pay');
 doc.state.npcs[keeper].coins=purseCoins+counter;doc.state.npcs[seller].coins=0;doc.ledger=openLedger(e,doc);
 const d=e.primitiveDraft(doc);
 depositCounter(d,e,{owner:keeper,seat:'loc_hw_northwood',business:'shop_b1_pay',amount:counter,eventId:'b1-fund',writer:'money'});
 return {e,d};
}
const balance=(d,account)=>d.get('ledger','accounts',account)??0;

test('柜台有一部分钱、钱袋有余钱：柜台先付、余下由钱袋付，两段合计等于付给卖方的量，legacy coins 与账户一致',()=>{
 const {e,d}=fixture({purseCoins:100,counter:30});
 const purse0=balance(d,purse(e,keeper)),counter0=counterCash(d,keeper),legacy0=d.get('state','npcs',keeper,'coins');
 assert.equal(counter0,30);assert.equal(purse0,100);assert.equal(legacy0,100);
 const paid=payCounterThenPurse(d,e,{owner:keeper,to:purse(e,seller),amount:80,writer:'shop',eventId:'b1-pay'});mirrorPartyCoins(d,e,seller,80,'b1-pay','shop');
 assert.deepEqual(paid,{fromCounter:30,fromPurse:50});
 assert.equal(counterCash(d,keeper),0);
 assert.equal(balance(d,purse(e,keeper)),purse0-50);
 assert.equal(counter0-counterCash(d,keeper)+(purse0-balance(d,purse(e,keeper))),80,'柜台与钱袋的减少量合计 = 付给卖方的量');
 assert.equal(balance(d,purse(e,seller)),80);
 assert.equal(d.get('state','npcs',keeper,'coins'),balance(d,purse(e,keeper)),'钱袋 legacy coins 与账户一致');
 assert.equal(d.get('state','npcs',seller,'coins'),balance(d,purse(e,seller)));
 assert.deepEqual(auditLedger(d.get('ledger')),[]);
});

test('柜台够付时只动柜台；柜台没有账户时整笔由钱袋付', ()=>{
 const full=fixture({purseCoins:100,counter:90});
 const purse1=balance(full.d,purse(full.e,keeper));
 assert.deepEqual(payCounterThenPurse(full.d,full.e,{owner:keeper,to:purse(full.e,seller),amount:60,writer:'shop',eventId:'b1-pay-1'}),{fromCounter:60,fromPurse:0});
 assert.equal(balance(full.d,purse(full.e,keeper)),purse1);
 const e=new WorldEngine(structuredClone(world)),doc=e.createCharacter(legacy,{},'b1-shop-pay-2');
 doc.state.npcs[keeper].coins=100;doc.state.npcs[seller].coins=0;doc.ledger=openLedger(e,doc);const d=e.primitiveDraft(doc);
 assert.deepEqual(payCounterThenPurse(d,e,{owner:keeper,to:purse(e,seller),amount:40,writer:'shop',eventId:'b1-pay-2'}),{fromCounter:0,fromPurse:40});
 assert.equal(d.get('state','npcs',keeper,'coins'),60);assert.equal(balance(d,purse(e,keeper)),60);
});

test('柜台加钱袋也不够：响亮失败，且什么都不写（账本与 legacy 不变）',()=>{
 const {e,d}=fixture({purseCoins:20,counter:30});
 const before=JSON.stringify([d.get('ledger'),d.get('state','npcs',keeper)]);
 assert.throws(()=>payCounterThenPurse(d,e,{owner:keeper,to:purse(e,seller),amount:80,writer:'shop',eventId:'b1-pay-short'}),/exceeds the counter/);
 assert.equal(JSON.stringify([d.get('ledger'),d.get('state','npcs',keeper)]),before);
});
