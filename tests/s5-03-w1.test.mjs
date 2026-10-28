// W1 credit close-out (F049 interest by balance interval, F028 pawn terminal
// state, deposit-receipt loss and reissue, same-place same-moment round trips).
// Every sequence uses the real trade / document actions; premises (clock,
// teller presence, cash) go through applyIntentSetup. Expected numbers are
// hand-derived in the comments, never produced by the code under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {obligationView} from '../server-plugin/obligation-state.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const keeper='npc_hw_shendu',host='npc_hw_linsui',post='bld_hw_post',bankId='bank_hw_post',DAY=1440;
// Fixed monthly terms for hand arithmetic: loan 4% per 30-day month, deposit
// = loan x 0.5 = 2% per month, 30-day months (calendar legacy:30-day), so one
// month of 1000 copper earns exactly 20.
function flatWorld(calendar='legacy:30-day',edit){
 const w=structuredClone(world),b=w.rules.economy.credit.banks[0];
 b.rateTerms={per:'anchor',calendar,base:0.04,minRate:0.04,maxRate:0.04};b.depositSpread=0.5;
 edit?.(w);return w;
}
// W8-E1 负重：木料 100（200 公斤，借款抵押）+ 面包 100（15 公斤，典当）+ 羊皮纸 3 是各用例的前提，合计 215 公斤超安全负重 30 公斤；
// 只兑换钱币、券的用例（W1-5、W1-6）不带抵押品，空囊（随身 2.6 公斤 + 羊皮纸）到柜面，否则兑到的东西进不了行囊。
const COUNTER_ONLY={item_parchment:3};
function fixture(w=flatWorld(),{coins=3000,inventory={item_wood:100,item_bread:100,item_parchment:3}}={}){
 // The counter staff and the buyer are always on duty at the counter: availability is a premise here.
 for(const n of w.npcs.filter(n=>[keeper,host].includes(n.id)))n.schedule={default:[{start:0,end:1440,location:post,activity:'休息',services:['trade']}]};
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s503-w1');
 const prepared=applyIntentSetup(engine,initial,{minute:600,location:post,present:[keeper,host],coins,inventory,abilitiesByActor:{player:{skills:{skill_literacy:500}}}});
 assert.deepEqual(prepared.setupUnmet,[]);
 const f={engine,document:prepared.document,
  async act(args,id){const out=await engine.reduce(f.document,{tool:'world_trade',args:{seller:keeper,...args},eventId:id});f.document=applyPatches(f.document,out.patches);return out.result;},
  async doc(slots,id){const out=await engine.reduce(f.document,{tool:'world_act',args:{action:'documents:issue',slots},eventId:id});
   if(out.result.receipt?.status==='rejected')return {rejected:out.result};f.document=applyPatches(f.document,out.patches);return out.result;},
  async exchange(slots,id){const out=await engine.reduce(f.document,{tool:'world_act',args:{action:'core:trade.exchange',slots:{seller:keeper,...slots}},eventId:id});
   assert.notEqual(out.result.receipt.status,'rejected',JSON.stringify(out.result));f.document=applyPatches(f.document,out.patches);return out.result;},
  // The bank clock: the real world_time action carries the clock (and every
  // interest event on the way) to `minute`; then the teller is at the counter.
  async elapse(minute){
   while(f.document.state.minute<minute){
    const step=Math.min(minute-f.document.state.minute,DAY);
    const out=await engine.reduce(f.document,{tool:'world_time',args:{minutes:step},eventId:`w1-clock-${f.document.state.minute}`});f.document=applyPatches(f.document,out.patches);
   }
   assert.equal(f.document.state.minute,minute);
   const setup=applyIntentSetup(engine,f.document,{location:post,present:[keeper,host]});assert.deepEqual(setup.setupUnmet,[]);f.document=setup.document;
  },
  coins:()=>f.document.state.player.coins,vault:()=>f.document.state.records[bankId].coins,
  claim:id=>f.document.state.obligations[id]};
 return f;
}
const clean=f=>assert.deepEqual(reconcile(f.engine,f.document),{mismatches:[],lots:[],drift:[],audit:[]});
const owed=(f,id)=>obligationView(f.document.state,id).owed;

test('W1-1 deposit, partial withdrawal, second deposit, period interest: each balance interval earns its own days',async()=>{
 const f=fixture(),t0=600;
 const a=await f.act({operation:'deposit',coins:1001},'w1-dep-a'); // fee 1: claim A = 1000
 assert.equal(f.claim(a.claim).amount,1000);
 // Day 15 (minute 22200): 1000 x 2% x 15/30 = 10 joins claim A, then 400 is paid out.
 await f.elapse(t0+15*DAY);
 const part=await f.act({operation:'withdraw',coins:400,debt:a.claim},'w1-part');
 assert.equal(part.withdrawn,400);assert.equal(owed(f,a.claim),610);assert.equal(f.coins(),3000-1001+400);
 // 5 minutes later a second deposit: claim B = 300 signed at minute 22205.
 const b=await f.act({operation:'deposit',coins:301},'w1-dep-b');
 assert.equal(f.document.state.obligations[b.claim].createdAt,t0+15*DAY+5);
 // First interest event, day 30 (43800).
 // A: 610 x 2% x 15/30 = 6.1 -> 6 (0.1 carried).  B: 300 x 2% x 21595/43200 = 2.9993 -> 2 (0.9993 carried).
 await f.elapse(t0+30*DAY);
 assert.equal(owed(f,a.claim),616);assert.equal(owed(f,b.claim),302);
 // Second event, day 60 (87000).
 // A: 616 x 2% = 12.32 + 0.1 = 12.42 -> 12.  B: 302 x 2% = 6.04 + 0.9993 = 7.0393 -> 7.
 await f.elapse(t0+60*DAY);
 assert.equal(owed(f,a.claim),628);assert.equal(owed(f,b.claim),309);
 assert.equal(f.document.state.records[bankId].accounts.player,937);
 clean(f);
});

test('W1-2 withdrawing the whole balance settles the accrued interest with it',async()=>{
 const f=fixture(),before=f.coins();
 const a=await f.act({operation:'deposit',coins:1001},'w1-full-dep');
 await f.elapse(600+15*DAY);
 // 1000 x 2% x 15/30 = 10 copper accrued; the counter shows that balance (1010)
 // before any settlement, and withdrawing exactly the shown amount pays it out.
 const shown=await f.act({operation:'bank_inspect'},'w1-full-look');
 assert.equal(shown.balance,1010);assert.equal(shown.accruedInterest,10);
 const out=await f.act({operation:'withdraw',coins:1010,debt:a.claim},'w1-full');
 assert.equal(out.withdrawn,1010);assert.equal(f.coins(),before-1001+1010);
 assert.equal(owed(f,a.claim),0);assert.equal(f.claim(a.claim).paid,1010);
 assert.equal(f.vault(),1500+1001-1010);assert.equal(f.document.state.records[bankId].accounts.player,0);
 clean(f);
});

test('W1-3 default calendar (30/29-day months): accrual anchors stay on the signing day across a partial withdrawal',async()=>{
 const f=fixture(flatWorld('core:calendar_default')),t0=600;
 const a=await f.act({operation:'deposit',coins:1001},'w1-cal-dep');
 // Day 10: 1000 x 2% x 10/30 = 6.667 -> 6 joins (0.667 carried); 400 withdrawn.
 await f.elapse(t0+10*DAY);
 await f.act({operation:'withdraw',coins:400,debt:a.claim},'w1-cal-part');
 assert.equal(owed(f,a.claim),606);
 // Day 30 event: from day 10, still the first month: 606 x 2% x 20/30 = 8.08 + 0.667 = 8.747 -> 8 (0.747 carried).
 await f.elapse(t0+30*DAY);assert.equal(owed(f,a.claim),614);
 // Day 60 event. Anchors count from the signing day: day 30 -> second anchor at day 59,
 // so the span 30..60 days is 1 anchor + 1 day = 31/30 units (the 29-day month is one period).
 // 614 x 2% x 31/30 = 12.6893 + 0.747 = 13.436 -> 13.
 await f.elapse(t0+60*DAY);assert.equal(owed(f,a.claim),627);
 clean(f);
});

test('W1-4 deposit then withdraw at once loses exactly the one-copper counter fee',async()=>{
 const f=fixture(),before=f.coins();
 const a=await f.act({operation:'deposit',coins:101},'w1-rt-dep');
 // 100 x 2% x 5/43200 min = 0.0023 -> 0 interest: all 100 comes back, 101 went in.
 const out=await f.act({operation:'withdraw',coins:100,debt:a.claim},'w1-rt-out');
 assert.equal(out.withdrawn,100);assert.equal(f.coins(),before-1);assert.equal(f.vault(),1500+1);
 clean(f);
});

test('W1-5 issuing then redeeming the same notes at the same counter always loses the spread',async()=>{
 const f=fixture(flatWorld(),{inventory:COUNTER_ONLY}),before=f.coins();
 // Issue 10 notes of face 100: pay ceil(10 x 100 x 1.03) = 1030.  Redeem 10: floor(10 x 100 x 0.97) = 970.
 const issued=await f.exchange({item:'item_banknote_hw',quantity:10,buyer:'player',mode:'issue'},'w1-note-issue');
 assert.equal(issued.paid,1030);
 const redeemed=await f.exchange({item:'item_banknote_hw',quantity:10,mode:'redeem'},'w1-note-redeem');
 assert.equal(redeemed.received,970);assert.equal(f.coins(),before-60);clean(f);
});

test('W1-6 buying then selling the same coins loses the counter spread both ways',async()=>{
 const f=fixture(flatWorld(),{inventory:COUNTER_ONLY}),before=f.coins();
 // 40 civic coins at fineness 0.9: buy ceil(40 x 0.9 x 1.03) = ceil(37.08) = 38; sell floor(40 x 0.9 x 0.97) = floor(34.92) = 34.
 const bought=await f.exchange({item:'item_coin_civic',quantity:40,buyer:'player'},'w1-coin-buy');assert.equal(bought.paid,38);
 const sold=await f.exchange({item:'item_coin_civic',quantity:40},'w1-coin-sell');assert.equal(sold.received,34);
 assert.equal(f.coins(),before-4);clean(f);
});

test('W1-7 borrowing and repaying at the same moment pays the whole signed interest',async()=>{
 const f=fixture(),before=f.coins();
 // 300 for 10 days at 4%/month: 300 x 4% x 10/30 = 4.00 exactly, owed 304.
 const loan=await f.act({operation:'borrow',coins:300,days:10,item:'item_wood',quantity:100},'w1-loan');
 assert.equal(loan.interest,4);assert.equal(f.coins(),before+300);
 const paid=await f.act({payment:'repay',debt:loan.debt},'w1-loan-repay');
 assert.equal(paid.repaid,304);assert.equal(f.coins(),before-4);assert.equal(f.document.state.inventory.item_wood.quantity,100);
 clean(f);
});

test('W1-8 pawn and redeem at once costs the interest of the pledged period',async()=>{
 const f=fixture(),before=f.coins();
 // F007: the pledge is valued by the valuation role, not the catalogue base price. Bread base 2 x local scarcity at its
 // floor 0.5 x quality 1 = 1 copper a loaf, so bread x10 is worth 10; the counter advances 50% = 5 for one day:
 // 5 x 4% x 1/30 = 0.0067 -> ceil 1.
 const pawn=await f.act({operation:'pawn',item:'item_bread',quantity:10,days:1},'w1-pawn');
 assert.equal(pawn.principal,5);assert.equal(pawn.interest,1);
 await f.act({operation:'redeem',contract:pawn.contract},'w1-redeem');
 assert.equal(f.coins(),before-1);assert.equal(f.document.state.inventory.item_bread.quantity,100);clean(f);
});

async function shortfallPawn(){
 // Author data with advance 100% so that principal + interest exceeds the value
 // the goods fetch (the shortfall is the examined premise, not the mechanism).
 const f=fixture(flatWorld('legacy:30-day',w=>{w.rules.economy.credit.pawn.advanceRatio=1;}));
 const pawn=await f.act({operation:'pawn',item:'item_bread',quantity:10,days:1},'w1-sf-pawn');
 return {f,pawn};
}

test('W1-9 after a sale that does not cover the pawn, the remainder is repaid normally and the goods cannot be sold twice',async()=>{
 const {f,pawn}=await shortfallPawn();
 // F007: valuation role, bread x10 = 10 (2 x floor 0.5 x 10). Principal 10 at 100%, one day at 4%: 10 x 4% / 30 = 0.0133 -> 1; debt 11.
 assert.equal(pawn.principal,10);assert.equal(pawn.interest,1);
 const row=f.document.state.records[pawn.contract];
 await f.elapse(row.auctionAt);
 assert.equal(f.document.state.records[pawn.contract].status,'流当');
 const hostCoins=f.document.state.npcs[host].coins;
 // The buyer's seeded larder is a bare count (premise from the NPC's own stock); the sale adds exactly the 10 pledged loaves.
 const stock=n=>{const v=f.document.state.npcs[host].inventory.item_bread;return typeof v==='number'?v:v?.quantity??0;};
 const hostBread=stock();
 // The goods are valued 10; the buyer pays 10; the counter takes 10, 1 remains owed.
 const sold=await f.act({operation:'auction',buyer:host,contract:pawn.contract,coins:10,consent:true},'w1-sf-auction');
assert.equal(sold.surplus,0);assert.equal(f.document.state.npcs[host].coins,hostCoins-10);
 assert.equal(stock(),hostBread+10);
 const pledged=f.document.state.records[`pledge:${pawn.contract}`];assert.equal(pledged.status,'已拍卖');assert.equal(pledged.holder,host);
 const after=f.document.state.records[pawn.contract];assert.equal(after.paid,10);assert.equal(after.status,'逾期');
 assert.equal(owed(f,`finance:${pawn.contract}`),1);
 // Time passing does not turn it back into a forfeited pledge, and the sold goods cannot be sold or delivered again.
 await f.elapse(row.auctionAt+10*DAY);
 assert.equal(f.document.state.records[pawn.contract].status,'逾期');
 const frozen=structuredClone(f.document);
 await assert.rejects(f.act({operation:'auction',buyer:host,contract:pawn.contract,coins:10,consent:true},'w1-sf-again'),/尚不可|已经拍卖/);
 await assert.rejects(f.act({operation:'redeem',contract:pawn.contract},'w1-sf-redeem'),/流当|当票/);
 assert.deepEqual(f.document,frozen);
 // The ordinary repay path clears the last copper and returns nothing (the goods are gone).
 const coins=f.coins(),bread=f.document.state.inventory.item_bread.quantity;
 const repaid=await f.act({payment:'repay',debt:pawn.contract},'w1-sf-repay');
 assert.equal(repaid.repaid,1);assert.equal(f.coins(),coins-1);assert.equal(f.document.state.records[pawn.contract].status,'已还清');
 assert.equal(f.document.state.inventory.item_bread.quantity,bread);assert.equal(owed(f,`finance:${pawn.contract}`),0);
 clean(f);
});

test('W1-10 reporting a deposit receipt lost voids the old paper, a reissued paper redeems the same single claim',async()=>{
 const f=fixture(),before=f.coins();
 const a=await f.act({operation:'deposit',coins:101},'w1-lost-dep');
 const issued=await f.doc({source:'w1-lost-dep',paper:'item_parchment',kind:'receipt'},'w1-lost-paper');
 assert.ok(issued.document);const old=issued.document;
 // A second paper for the same live receipt is refused.
 assert.ok((await f.doc({source:'w1-lost-dep',paper:'item_parchment',kind:'receipt'},'w1-lost-copy')).rejected);
 const lost=await f.act({operation:'report_lost',debt:a.claim},'w1-lost-report');
 assert.equal(lost.lost,old);assert.equal(f.document.state.itemInstances[old].document.valid,false);
 // The voided original is refused, with the reason.
 const frozen=structuredClone(f.document);
 await assert.rejects(f.act({operation:'withdraw',coins:50,debt:a.claim},'w1-lost-old'),/挂失/);
 assert.deepEqual(f.document,frozen);
 // Reissue on the same deposit; the claim is still the only one and keeps its balance.
 const fresh=await f.doc({source:'w1-lost-dep',paper:'item_parchment',kind:'receipt'},'w1-lost-reissue');
 assert.ok(fresh.document&&fresh.document!==old);
 assert.equal(f.document.state.obligations[a.claim].terms.requiresInstrument,fresh.document);
 const out=await f.act({operation:'withdraw',coins:100,debt:a.claim},'w1-lost-cash');
 assert.equal(out.withdrawn,100);assert.equal(f.coins(),before-1);assert.equal(f.document.state.itemInstances[fresh.document].status,'redeemed');
 assert.equal(f.document.state.itemInstances[old].document.valid,false);
 clean(f);
});

test('W1-11 a receipt cannot be reported lost twice, nor lost before it exists, nor reissued twice',async()=>{
 const f=fixture();
 const a=await f.act({operation:'deposit',coins:101},'w1-twice-dep');
 await assert.rejects(f.act({operation:'report_lost',debt:a.claim},'w1-twice-none'),/没有签发/);
 await f.doc({source:'w1-twice-dep',paper:'item_parchment',kind:'receipt'},'w1-twice-paper');
 await f.act({operation:'report_lost',debt:a.claim},'w1-twice-lost');
 await assert.rejects(f.act({operation:'report_lost',debt:a.claim},'w1-twice-lost2'),/已经挂失/);
 assert.ok((await f.doc({source:'w1-twice-dep',paper:'item_parchment',kind:'receipt'},'w1-twice-fresh')).document);
 // The reissued paper is a live original again: a further copy is refused until it too is reported lost.
 assert.ok((await f.doc({source:'w1-twice-dep',paper:'item_parchment',kind:'receipt'},'w1-twice-copy')).rejected);
 assert.equal(owed(f,a.claim),100);assert.equal(f.document.state.records[bankId].accounts.player,100);
 clean(f);
});

test('W1-12 a paper handed to someone else and then reported lost cannot be cashed by the new holder',async()=>{
 const f=fixture();
 const a=await f.act({operation:'deposit',coins:101},'w1-give-dep');
 const paper=(await f.doc({source:'w1-give-dep',paper:'item_parchment',kind:'receipt'},'w1-give-paper')).document;
 const given=await f.engine.reduce(f.document,{tool:'world_act',args:{action:'documents:give',slots:{document:paper,target:host}},eventId:'w1-give'});
 assert.notEqual(given.result.receipt?.status,'rejected');f.document=applyPatches(f.document,given.patches);
 await f.act({operation:'report_lost',debt:a.claim},'w1-give-lost');
 assert.equal(f.document.state.itemInstances[paper].document.valid,false);assert.equal(f.document.state.itemInstances[paper].owner,host);
 const frozen=structuredClone(f.document);
 await assert.rejects(f.act({operation:'withdraw',coins:50,debt:a.claim},'w1-give-cash'));
 assert.deepEqual(f.document,frozen);assert.equal(owed(f,a.claim),100);
});

test('W1-13 interest earned while the vault is empty stays a real debt on the open claim and is paid once cash returns',async()=>{
 const f=fixture(),before=f.coins();
 const a=await f.act({operation:'deposit',coins:1001},'w1-arrears-dep');
 await f.elapse(600+15*DAY);
 // The vault holds exactly the principal: 1000. Interest earned is 1000 x 2% x 15/30 = 10.
 const drained=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records',bankId,'coins'],value:1000}]});
 assert.deepEqual(drained.setupUnmet,[]);f.document=drained.document;
 const first=await f.act({operation:'withdraw',coins:1000,debt:a.claim},'w1-arrears-out');
 assert.equal(first.withdrawn,1000);assert.equal(f.coins(),before-1001+1000);
 // The 10 copper is still owed, visible on the same open claim.
 assert.equal(owed(f,a.claim),10);assert.equal(f.document.state.records[bankId].accounts.player,10);
 const seen=await f.act({operation:'bank_inspect'},'w1-arrears-look');
 assert.equal(seen.deposits.find(x=>x.claim===a.claim).balance,10);
 // Cash returns to the vault: the remainder is paid out and the claim closes.
 const refilled=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records',bankId,'coins'],value:50}]});
 assert.deepEqual(refilled.setupUnmet,[]);f.document=refilled.document;
 const second=await f.act({operation:'withdraw',coins:10,debt:a.claim},'w1-arrears-late');
 assert.equal(second.withdrawn,10);assert.equal(f.coins(),before-1001+1010);assert.equal(owed(f,a.claim),0);
});
