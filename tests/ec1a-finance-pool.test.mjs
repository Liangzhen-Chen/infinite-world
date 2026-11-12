// EC-1a：NPC 通过金融原语（finance-bank.financeTransfer / financeChange）付款时，本人钱袋不够就先从同一登记户其他成员的钱袋补足（householdPoolTopUp），
// 户池也不够才报“当事人资金不足”；陌生户不出钱；钱只在当事人之间转移，账本守恒。夹具同 ec1a-household-pool.test.mjs（A、B 一户，C 陌生户，D 收款人）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {financeTransfer} from '../server-plugin/finance-bank.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',C='npc_hw_shendu',D='npc_hw_linsui',home='bld_hw_qingdeng';
function fixture(coins){
 const w=structuredClone(world);
 delete w.rules.householdSubsistence;
 w.households=[{id:'fin-house',members:[A,B],settlement:'loc_hw',homeLocation:home},{id:'fin-stranger',members:[C],settlement:'loc_hw',homeLocation:home},{id:'fin-payee',members:[D],settlement:'loc_hw',homeLocation:home}];
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'ec1a-finance-pool');
 doc.state.minute=0;doc.state.location=home;
 doc.state.npcs=Object.fromEntries([A,B,C,D].map(id=>[id,{...doc.state.npcs[id],coins:coins[id]??0,inventory:{},location:home,status:'正常',activity:'休息'}]));
 doc.ledger=openLedger(e,doc);
 return {e,doc,d:e.primitiveDraft(doc)};
}
const coin=(f,id)=>f.d.get('state','npcs',id,'coins');
const total=f=>[A,B,C,D].reduce((n,id)=>n+coin(f,id),0);

test('a payer whose own purse is short tops up from the household pool before paying; the books stay exact', () => {
 const f=fixture({[A]:10,[B]:100,[C]:500});
 const before=total(f);
 financeTransfer(f.d,f.e,A,D,30,'fin-pay');
 // 手算：A 有 10，要付 30，缺 20；户内其他成员 B 有 100，转 20 给 A，A 付 30 后为 0；B 剩 80；收款人 D 得 30；陌生户 C 不动。
 assert.equal(coin(f,A),0);assert.equal(coin(f,B),80);assert.equal(coin(f,D),30);assert.equal(coin(f,C),500);
 assert.equal(total(f),before,'coins are only moved between parties');
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('when the whole household pool is short the payment is refused and a stranger household cannot cover it', () => {
 const f=fixture({[A]:10,[B]:15,[C]:500});
 assert.throws(()=>financeTransfer(f.d,f.e,A,D,40,'fin-too-much'),/当事人资金不足/);
});

test('a payer with enough in his own purse does not touch the pool', () => {
 const f=fixture({[A]:100,[B]:100});
 financeTransfer(f.d,f.e,A,D,30,'fin-own');
 assert.equal(coin(f,A),70);assert.equal(coin(f,B),100);assert.equal(coin(f,D),30);
});
