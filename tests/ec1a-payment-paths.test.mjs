// EC-1a 付款收口。补足做在最底层扣款原语里：ledger.transfer（moveCoins、直接 transfer、primitives 的 transfer 效果都经它）在读付方余额前
// 调用 household-budget 登记的扣前补足：付方是 NPC 钱袋、余额不足、户池够付时，只按缺口从同户其他成员钱袋补足；户池不够就不动，照原行为拒绝；
// 玩家、团体、组织、遗产、柜台等非 NPC 钱袋账户不补。确实不该补的调用处传 noHouseholdTopUp: '<理由>'。
// 一、源码核对：只核对 noHouseholdTopUp 的豁免清单与理由（条数精确相等，理由非空）。
// 二、原语层行为（直接调 moveCoins/transfer，不经 payFromNpc）：补足成交且账本守恒、户池不够拒绝、非 NPC 账户不补、豁免不补。
// 三、运行期不变量：从 NPC 钱袋扣款、本人不够但户池够时，任何类别与调用路径都不失败。
// 四、npc-obligations 真实结算入口：付款人 0 币、同户 100 币、路费取引擎真实路线。
// 五、显式入口 npcCanPay/topUpNpc/payFromNpc 与原语幂等（缺口为 0 时二次补足不动）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger,auditLedger,transfer} from '../server-plugin/ledger.mjs';
import {purse,sink,fund,escrow,moveCoins,mirrorPartyCoins} from '../server-plugin/money.mjs';
import {financeTransfer} from '../server-plugin/finance-bank.mjs';
import {npcCanPay,payFromNpc,topUpNpc} from '../server-plugin/npc-payment.mjs';
import {createNpcObligation,advanceNpcObligations} from '../server-plugin/npc-obligations.mjs';

// ---------------------------------------------------------------- 一、豁免清单与理由
// 键 = 文件；值 = [条数, 理由关键词]。每处 noHouseholdTopUp:'<理由>' 都必须登记；清单里的条数必须与源码完全一致。
const EXEMPT={
 'bounty.mjs':[1,'悬赏认捐'],
 'family-law.mjs':[1,'监护代管'],
 'npc-crime.mjs':[1,'盗窃'],
 'works.mjs':[1,'听众小费'],
 'law.mjs':[2,'盗窃|受贿没收']
};
test('every noHouseholdTopUp exemption in server-plugin is on the list with its reason, and the list has nothing the source lacks', async () => {
 const dir=new URL('../server-plugin/',import.meta.url),files=(await fs.readdir(dir)).filter(f=>f.endsWith('.mjs')).sort(),found={};
 for(const file of files){
  const text=await fs.readFile(new URL(file,dir),'utf8');
  for(const m of text.matchAll(/noHouseholdTopUp:'([^']*)'/g)){
   assert.ok(m[1].trim().length>=4,`${file}: noHouseholdTopUp 的理由为空或过短`);
   (found[file]??=[]).push(m[1]);
  }
 }
 for(const [file,reasons] of Object.entries(found))assert.ok(EXEMPT[file],`未登记的豁免：${file}（${reasons.join('；')}）`);
 for(const [file,[count,keys]] of Object.entries(EXEMPT)){
  assert.equal(found[file]?.length??0,count,`豁免清单与源码不符：${file}`);
  for(const reason of found[file]??[])assert.ok(new RegExp(keys).test(reason),`${file}: 理由与登记不符：${reason}`);
 }
});

// ---------------------------------------------------------------- 夹具
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',C='npc_hw_shendu',D='npc_hw_linsui',home='bld_hw_qingdeng';
// toll：给出行必经的“住处—聚落”那一段路设路费（引擎的路费取自路段 toll），用于真实路费场景。
function fixture(coins,{toll=null}={}){
 const w=structuredClone(world);
 delete w.rules.householdSubsistence;
 if(toll!==null)w.routes.find(r=>r.id==='route_bld_hw_qingdeng').toll=toll;
 w.households=[{id:'pay-house',members:[A,B],settlement:'loc_hw',homeLocation:home},{id:'pay-stranger',members:[C],settlement:'loc_hw',homeLocation:home},{id:'pay-payee',members:[D],settlement:'loc_hw',homeLocation:home}];
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'ec1a-payment-paths');
 doc.state.minute=0;doc.state.location=home;
 doc.state.npcs=Object.fromEntries([A,B,C,D].map(id=>[id,{...doc.state.npcs[id],coins:coins[id]??0,inventory:{},location:home,status:'正常',activity:'休息'}]));
 doc.ledger=openLedger(e,doc);
 return {e,doc,d:e.primitiveDraft(doc)};
}
const coin=(f,id)=>f.d.get('state','npcs',id,'coins'),bal=(f,account)=>f.d.get('ledger','accounts',account)??0;
const purses=f=>[A,B,C,D].reduce((n,id)=>n+coin(f,id),0);
const ledgerPurses=f=>[A,B,C,D].reduce((n,id)=>n+bal(f,purse(f.e,id)),0);
const agree=(f,msg='字段与账本一致')=>{for(const id of [A,B,C,D])assert.equal(coin(f,id),bal(f,purse(f.e,id)),`${msg}：${id}`);};
// 调用点的惯常写法：原语扣账，调用方再把两侧旧字段对上（mirrorPartyCoins 在旧字段不够时抛错）。
const pay=(f,{from=A,to,amount,writer,eventId='raw-1',toParty=null,extra={}})=>{
 moveCoins(f.d,{from:purse(f.e,from),to,amount,writer,eventId,...extra});
 mirrorPartyCoins(f.d,f.e,from,-amount,eventId,writer);
 if(toParty)mirrorPartyCoins(f.d,f.e,toParty,amount,eventId,writer);
};

// ---------------------------------------------------------------- 二、原语层行为
test('primitive: payer purse 0, household pool 100, pay 4 -> completes, only the gap is topped up, books conserved, fields equal ledger', () => {
 const f=fixture({[A]:0,[B]:100,[C]:500}),before=purses(f);
 pay(f,{to:purse(f.e,D),amount:4,writer:'npc-labor',toParty:D});
 assert.equal(coin(f,A),0);assert.equal(coin(f,B),96,'补足量 = 缺口 4');assert.equal(coin(f,D),4);assert.equal(coin(f,C),500,'陌生户不出钱');
 agree(f);assert.equal(purses(f),before,'只在户内与收款人间转，币总量不变');assert.equal(ledgerPurses(f),purses(f));
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});
test('primitive: the top-up equals the gap only (own 10, pay 30 -> pool gives 20)', () => {
 const f=fixture({[A]:10,[B]:100,[C]:500});
 pay(f,{to:sink('export','travel'),amount:30,writer:'npc-schedule'});
 assert.equal(coin(f,A),0);assert.equal(coin(f,B),80);agree(f);assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});
test('primitive: no top-up when the own purse suffices', () => {
 const f=fixture({[A]:100,[B]:100,[C]:500});
 pay(f,{to:purse(f.e,D),amount:30,writer:'npc-labor',toParty:D});
 assert.equal(coin(f,A),70);assert.equal(coin(f,B),100);agree(f);
});
test('primitive: whole household short -> nothing is pulled from the pool and the payment is refused', () => {
 const f=fixture({[A]:2,[B]:3,[C]:500});
 assert.throws(()=>pay(f,{to:sink('export','travel'),amount:30,writer:'npc-schedule'}),/Invalid party balance/);
 assert.equal(coin(f,B),3,'户池不够时不补（不做半截转账）');assert.equal(coin(f,C),500);
});
test('primitive: payers that are not an NPC purse are never topped up (player, fund, escrow)', () => {
 const f=fixture({[A]:100,[B]:100,[C]:500}),playerCoins=f.d.get('state','player','coins'),ledgerA=bal(f,purse(f.e,A)),ledgerB=bal(f,purse(f.e,B));
 for(const [from,writer] of [[purse(f.e,'player'),'npc-labor'],[fund('legal_treasury:ec1-empty'),'npc-crime'],[escrow('quest_ec1_empty'),'quest-board']]){
  moveCoins(f.d,{from,to:purse(f.e,D),amount:playerCoins+1000,writer,eventId:'non-npc'});
  assert.equal(bal(f,purse(f.e,A)),ledgerA,`${from} 不得从户池取钱`);assert.equal(bal(f,purse(f.e,B)),ledgerB);assert.equal(coin(f,A),100);assert.equal(coin(f,B),100);
 }
});
test('primitive: noHouseholdTopUp exempts the call (and needs a stated reason)', () => {
 const f=fixture({[A]:0,[B]:100,[C]:500});
 moveCoins(f.d,{from:purse(f.e,A),to:purse(f.e,D),amount:4,writer:'npc-crime',eventId:'exempt-1',noHouseholdTopUp:'测试：被偷者只损失身上的钱'});
 assert.equal(bal(f,purse(f.e,B)),100,'带豁免的不补');assert.equal(coin(f,B),100);
 assert.throws(()=>moveCoins(f.d,{from:purse(f.e,A),to:purse(f.e,D),amount:1,writer:'npc-crime',eventId:'exempt-2',noHouseholdTopUp:''}),/必须写明理由/);
});

// ---------------------------------------------------------------- 三、运行期不变量
// 每个类别用该调用点真实的写入者与收款账户类型；一律不经 payFromNpc/topUpNpc，只走原语。
const CATEGORIES=[
 {name:'进货/劳务采买',writer:'npc-labor',to:f=>purse(f.e,D),toParty:D,need:30,own:10,pool:100},
 {name:'路费',writer:'npc-schedule',to:()=>sink('export','travel'),need:4,own:1,pool:100},
 {name:'罚金赔偿',writer:'npc-crime',to:()=>fund('legal_treasury:ec1-test'),need:25,own:10,pool:100},
 {name:'任务报酬托管',writer:'quest-board',to:()=>escrow('quest_ec1_test'),need:40,own:10,pool:100}
];
for(const c of CATEGORIES){
 test(`invariant (${c.name}): debit from an NPC purse that is short but covered by the household never fails, via moveCoins and via direct transfer`, () => {
  for(const direct of [false,true]){
   const f=fixture({[A]:c.own,[B]:c.pool,[C]:500}),before=purses(f),dest=c.to(f);
   assert.doesNotThrow(()=>{
    if(direct){
     transfer(f.d,{from:purse(f.e,A),to:dest,amount:c.need,writer:c.writer,eventId:'inv-1'});
     mirrorPartyCoins(f.d,f.e,A,-c.need,'inv-1',c.writer);if(c.toParty)mirrorPartyCoins(f.d,f.e,c.toParty,c.need,'inv-1',c.writer);
    }else pay(f,{to:dest,amount:c.need,writer:c.writer,toParty:c.toParty});
   },`direct=${direct}`);
   assert.equal(coin(f,A),0);assert.equal(coin(f,B),c.pool-(c.need-c.own));assert.equal(coin(f,C),500);agree(f);
   assert.equal(ledgerPurses(f),purses(f));assert.ok(purses(f)<=before);
   assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
  }
 });
}
test('invariant: a finance primitive payment (wage) from a short NPC purse is paid from the pool; whole pool short is refused', () => {
 const f=fixture({[A]:10,[B]:100,[C]:500}),before=purses(f);
 financeTransfer(f.d,f.e,A,D,30,'pay-wage');
 assert.equal(coin(f,A),0);assert.equal(coin(f,B),80);assert.equal(coin(f,D),30);assert.equal(coin(f,C),500);assert.equal(purses(f),before);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
 const g=fixture({[A]:10,[B]:15,[C]:500});
 assert.throws(()=>financeTransfer(g.d,g.e,A,D,40,'pay-wage-short'),/当事人资金不足/);
});

// ---------------------------------------------------------------- 四、npc-obligations 真实结算入口
test('npc-obligations real path: payer 0 coins, housemate 100, fare read from the engine route -> trip happens, fare paid from the pool, field == ledger, books conserved', () => {
 const f=fixture({[A]:0,[B]:100,[C]:500},{toll:2}),dest='bld_hw_mill',minute=f.d.get('state','minute');
 const route=f.e.route(home,dest,'walk',minute,f.doc.randomSeed);
 assert.ok(route.cost>0,'引擎对这条路线给出正的路费（夹具在住处路段设了 toll）');
 const made=createNpcObligation(f.d,f.e,{promisor:A,promisee:'player',type:'会面',content:'到磨坊碰面',location:dest,start:minute+120,deadline:minute+150},'ec1-meet');
 assert.ok(made?.obligation,'本人 0 币、户池够付路费时可登记赴约（npcCanPay 看户池）');
 const key=sink('export','travel'),flow=()=>f.d.get('ledger','flows',key)??0,flow0=flow(),before=purses(f),end=minute+151;
 f.d.set(['state','minute'],end);f.e.npcObligationAction={tool:'time',args:{}};
 advanceNpcObligations(f.d,f.e,minute,end,'ec1-advance');
 assert.ok(flow()-flow0>=route.cost,'付款人至少付过一次路费（本人 0 币，只能来自户池）');
 assert.ok(coin(f,A)>=0&&coin(f,B)>=0);
 assert.ok(coin(f,A)+coin(f,B)<=100-route.cost,'路费由本户出');
 agree(f);assert.equal(purses(f)+(flow()-flow0),before,'钱袋合计的减少恰等于流入路费汇的部分');
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

// ---------------------------------------------------------------- 五、显式入口与原语幂等
test('explicit entry: topUpNpc tops up exactly the gap, a second call has gap 0, non-NPC parties are never topped up', () => {
 const f=fixture({[A]:10,[B]:100,[C]:500}),before=purses(f);
 assert.equal(topUpNpc(f.d,f.e,A,30,'repay-1'),20,'缺 30−10=20，由同户 B 补');
 assert.equal(coin(f,A),30);assert.equal(coin(f,B),80);assert.equal(coin(f,C),500);assert.equal(purses(f),before);agree(f);
 assert.equal(topUpNpc(f.d,f.e,A,30,'repay-1'),0,'二次补足缺口为 0');assert.equal(coin(f,B),80);
 assert.equal(topUpNpc(f.d,f.e,'player',999,'repay-3'),0,'玩家不是户内钱袋，不补');
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});
test('explicit entry: payFromNpc then the primitive is idempotent (pool pays the gap once), cannot-pay when the whole pool is short', () => {
 const f=fixture({[A]:10,[B]:100,[C]:500});
 assert.equal(npcCanPay(f.d,f.e,A,30),true);
 assert.equal(payFromNpc(f.d,f.e,{payer:A,to:purse(f.e,D),amount:30,writer:'npc-labor',eventId:'pay-1'}),20);
 mirrorPartyCoins(f.d,f.e,A,-30,'pay-1','npc-labor');mirrorPartyCoins(f.d,f.e,D,30,'pay-1','npc-labor');
 assert.equal(coin(f,A),0);assert.equal(coin(f,B),80,'只补过一次（原语再补时缺口为 0）');agree(f);
 const g=fixture({[A]:2,[B]:3,[C]:500});
 assert.equal(npcCanPay(g.d,g.e,A,30),false);
});
