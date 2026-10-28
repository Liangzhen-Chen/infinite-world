// W8-B 钱庄贷款 / 典当 / 替工工钱 / 合伙出资按法定单位冻结；037 赎当回执补债权人。
// 世界数据里法定计价单位全是 coin_river，所以与 s5-f2-contracts 同做法：测试世界把河湾 law_hw_property 的单位改成河湾兑付券（每券约定 10 文）。
// 另一处世界改写：小驿站汇兑柜的备付金里放 50 张券（钱庄要有券才放得出券，与 F2 的“出借人手里先有券”同一前提）；
// 林穗（铺主）的作息改成整日在驿站营业，方便在钱庄柜面当面成交（买面包压低券的兑换率）。
// 发行券、借款、典当、赎当、还款、做工、合伙全部走真实动作；余下的前提（人在柜台、对方持有的券、现钱）是 setup 事实，不是被检验的规则。
// 期望数字都在注释里手算。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {exchangeRate} from '../server-plugin/currency.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const host='npc_hw_linsui',keeper='npc_hw_shendu',post='bld_hw_post',shop='bld_hw_qingdeng',BANK='bank_hw_post',NOTE='coin_hw_note',NOTE_ITEM='item_banknote_hw';
function build({tender=true,hostAt=post}={}){
 const w=structuredClone(world);
 if(tender){
  w.rules.law.codes.find(c=>c.id==='law_hw_property').recognition.legalTender.unit=NOTE;
  w.currencyRules.currencies.find(c=>c.resource===NOTE).money.backedBy.ratio=10; // 每张券承诺 10 文
  w.rules.economy.credit.banks.find(b=>b.id===BANK).reserveCoins[NOTE_ITEM]=50; // 钱庄备付金里有 50 张券
 }
 const npc=w.npcs.find(n=>n.id===host);
 npc.schedule={default:[{start:0,end:1440,location:hostAt,activity:'营业',services:['trade']}]};
 npc.creditPolicy={limitCopper:100,maximumMinutes:1440,minimumTrust:0};
 return w;
}
function fixture(options={}){
 const engine=new WorldEngine(build(options)),initial=engine.createCharacter(seed,{},'w8b');
 const prepared=applyIntentSetup(engine,initial,{minute:600,location:post,coins:3000,inventory:{item_bread:100,item_wood:100}});assert.deepEqual(prepared.setupUnmet,[]);
 const f={engine,document:prepared.document,
  async act(tool,args,id){const out=await engine.reduce(f.document,{tool,args,eventId:id});f.document=applyPatches(f.document,out.patches);return out.result;},
  trade:(args,id)=>f.act('world_trade',{seller:keeper,...args},id),
  async issue(quantity,id){const r=await f.act('world_act',{action:'core:trade.exchange',slots:{seller:keeper,item:NOTE_ITEM,quantity,buyer:'player',mode:'issue'}},id);assert.notEqual(r.receipt.status,'rejected',JSON.stringify(r));return r;},
  // 到某处：人与房东/掌柜的位置、货物与现钱是前提，不是被检验的规则。
  at(location,facts=[]){const s=applyIntentSetup(engine,f.document,{location,facts});assert.deepEqual(s.setupUnmet,[]);f.document=s.document;},
  hostFacts:(extra={},at=post)=>[{path:['state','npcs',host,'location'],value:at},{path:['state','npcs',host,'inventory'],value:{item_bread:{quantity:100,quality:'木'},...extra}},{path:['state','npcs',host,'coins'],value:1000}],
  rate:(location=post)=>exchangeRate(engine.primitiveDraft(f.document),engine,{from:NOTE,location}).rate,
  notes:id=>(id==='player'?f.document.state.inventory:f.document.state.npcs[id].inventory)[NOTE_ITEM]?.quantity??0,
  bankNotes:()=>(f.document.state.records[BANK]?.goods??engine.rules.economy.credit.banks.find(b=>b.id===BANK).reserveCoins)[NOTE_ITEM]??0,
  bankCoins:()=>f.document.state.records[BANK]?.coins??engine.rules.economy.credit.banks.find(b=>b.id===BANK).reserveCopper,
  coins:()=>f.document.state.player.coins};
 return f;
}
const clean=f=>assert.deepEqual(reconcile(f.engine,f.document),{mismatches:[],lots:[],drift:[],audit:[]});
const borrow=(f,id,extra={})=>f.trade({operation:'borrow',coins:100,days:30,item:'item_wood',quantity:100,...extra},id);

test('W8B-1 钱庄借款按券冻结：100 文 = 10 张券，券从钱庄备付金交到手上，本息都是券，现钱不动',async()=>{
 const f=fixture(),coins=f.coins();
 const loan=await borrow(f,'b1-borrow');
 // 100 文 ÷ 10 文/张 = 10 张（整数）；钱庄备付金 50 → 40；玩家手上 0 → 10。
 assert.deepEqual([loan.principal,loan.resource,loan.referenceCopper],[10,NOTE,100]);
 assert.deepEqual([f.bankNotes(),f.notes('player'),f.coins()],[40,10,coins]);
 // 利息按冻结的券计：10 张 × 月息 rate，向上取整成整张（借方不得因舍入少付），本息 = 10 + 利息，且利息至少 1 张。
 assert.equal(loan.interest,Math.ceil(10*loan.monthlyInterest));assert.ok(loan.interest>=1);assert.equal(loan.amount,10+loan.interest);
 const debt=f.document.state.records[loan.debt];
 assert.deepEqual([debt.resource,debt.resourceName,debt.principal,debt.amount,debt.paid,debt.referenceCopper],[NOTE,'河湾兑付券',10,loan.amount,0,100]);
 // 同一合同所有金额字段同一单位：抵押的木料价值（200 文）仍是基准账里的铜，不混进券的字段。
 assert.equal(debt.pledge.value,200);
 assert.ok(loan.messages.some(m=>m.includes('借10河湾兑付券')&&m.includes(`还本息${loan.amount}河湾兑付券`))&&!loan.messages.some(m=>m.includes('铜')));
 clean(f);
});

test('W8B-2 兑换率变了：债的本金与本息不变；换铜还款按还款时兑换向上取整，零头归钱庄',async()=>{
 const f=fixture();
 f.at(post,f.hostFacts());
 const loan=await borrow(f,'b2-borrow');
 // 压低兑换率：在驿站用券买 25 个面包（25 文 → 3 张）。成交 25 文 = 2.5 张当量；
 // 活跃券 = 玩家 10-3=7 + 林穗 3 + 钱庄备付 40 = 50 → 充裕度 2.5/50 = .05 → 兑换率 10 × .05 = 0.5 文/张。
 await f.trade({seller:host,item:'item_bread',quantity:25,payCurrency:NOTE},'b2-shock');
 assert.equal(f.rate(),0.5);
 const same=f.document.state.records[loan.debt];assert.deepEqual([same.principal,same.amount,same.paid,same.resource],[10,loan.amount,0,NOTE]);
 // 用铜还清：本息（10+利息）张 × 0.5 文 = (10+利息)/2 文 → 向上取整；零头不找，留在钱庄。
 const owed=loan.amount,expected=Math.ceil(owed*0.5),coins=f.coins(),bankCoins=f.bankCoins(),notes=f.bankNotes();
 const paid=await f.trade({payment:'repay',debt:loan.debt,payCurrency:'coin_river'},'b2-repay');
 assert.equal(paid.status,'已还清');assert.equal(coins-f.coins(),expected);assert.equal(f.bankCoins()-bankCoins,expected);
 assert.equal(f.bankNotes(),notes);                       // 用铜还，钱庄的券一张不多
 assert.equal(f.document.state.records[loan.debt].paid,owed);
 assert.equal(f.document.state.inventory.item_wood.quantity,100); // 抵押的木料取回
 assert.ok(expected>=owed*0.5);                           // 11 张 × 0.5 = 5.5 → 6：零头 0.5 文归钱庄
 clean(f);
});

test('W8B-3 按券还款：原数交回钱庄备付金，部分还款也按券',async()=>{
 const f=fixture();
 await f.issue(3,'b3-issue');                              // 玩家需要比 10 张多的券才还得起利息
 const loan=await borrow(f,'b3-borrow'),before=f.notes('player'),vault=f.bankNotes();
 const part=await f.trade({payment:'repay',debt:loan.debt,coins:4},'b3-part');
 assert.deepEqual([part.repaid,part.status],[4,'待偿还']);
 assert.deepEqual([before-f.notes('player'),f.bankNotes()-vault],[4,4]);
 const left=loan.amount-4,rest=await f.trade({payment:'repay',debt:loan.debt},'b3-rest');
 assert.deepEqual([rest.repaid,rest.status],[left,'已还清']);
 assert.equal(f.bankNotes()-vault,loan.amount);          // 钱庄收回的正是本息张数
 assert.equal(f.document.state.records[loan.debt].paid,loan.amount);
 clean(f);
});

test('W8B-4 典当与赎当同一单位；赎当回执写明债权人（037）',async()=>{
 const f=fixture();
 await f.issue(3,'b4-issue');
 const notes=f.notes('player');
 // 面包 ×100，估值每个 1 文 = 100 文；垫款比 .5 → 50 文 ÷ 10 文/张 = 5 张。
 const pawn=await f.trade({operation:'pawn',item:'item_bread',quantity:100,days:1},'b4-pawn');
 assert.deepEqual([pawn.principal,pawn.resource,pawn.referenceCopper],[5,NOTE,50]);assert.equal(f.notes('player')-notes,5);
 const debt=f.document.state.records[pawn.contract];assert.deepEqual([debt.kind,debt.resource,debt.principal],['pawn',NOTE,5]);
 assert.equal(debt.amount,5+Math.ceil(5*pawn.monthlyInterest));
 const vault=f.bankNotes();
 const redeem=await f.trade({operation:'redeem',contract:pawn.contract},'b4-redeem');
 // 037：回执写明当铺/钱庄主体 id 与名称，且仍带 bank、债号、状态、取回的当物。
 assert.deepEqual([redeem.creditor,redeem.creditorName,redeem.bank],[BANK,'小驿站汇兑柜',BANK]);
 assert.deepEqual([redeem.debt,redeem.status,redeem.pledgeReturned,redeem.repaid],[pawn.contract,'已还清','item_bread',debt.amount]);
 assert.equal(f.bankNotes()-vault,debt.amount);          // 赎当付的也是券
 assert.equal(f.document.state.inventory.item_bread.quantity,100);
 assert.ok(redeem.messages.some(m=>m.includes(`欠款${debt.amount}河湾兑付券`)));
 clean(f);
});

test('W8B-5 赎当可换铜：按赎当时兑换（无成交 10 文/张）向上取整；流当拍卖按当日价值折抵，余款退还',async()=>{
 const f=fixture();
 const a=await f.trade({operation:'pawn',item:'item_bread',quantity:100,days:1},'b5-pawn-a');
 // 无成交时 1 张 = 10 文：本息 amount 张 × 10 文，没有零头。
 const owe=f.document.state.records[a.contract].amount,coins=f.coins();
 await f.trade({operation:'redeem',contract:a.contract,payCurrency:'coin_river'},'b5-redeem-a');
 assert.equal(coins-f.coins(),owe*10);
 // 再典当一次，过了赎当期不赎：流当。拍卖价 100 文，债 = amount 张 = amount×10 文，余下退给原主。
 const b=await f.trade({operation:'pawn',item:'item_bread',quantity:100,days:1},'b5-pawn-b');
 const row=f.document.state.records[b.contract],units=row.amount;
 await f.act('world_time',{minutes:1440*5},'b5-wait');
 f.at(post,f.hostFacts());
 const bankCoins=f.bankCoins(),ownerCoins=f.coins(),hostCoins=f.document.state.npcs[host].coins;
 const sold=await f.trade({operation:'auction',buyer:host,contract:b.contract,coins:100,consent:true},'b5-auction');
 assert.equal(sold.surplus,100-units*10);
 assert.equal(f.bankCoins()-bankCoins,units*10);        // 钱庄按债的铜价值收到拍卖款
 assert.equal(f.coins()-ownerCoins,100-units*10);       // 余款退给原主
 assert.equal(hostCoins-f.document.state.npcs[host].coins,100);
 const after=f.document.state.records[b.contract];assert.deepEqual([after.paid,after.status,after.resource],[units,'已还清',NOTE]);
 clean(f);
});

test('W8B-6 借款逾期违约：抵押木料（200 文）按今日兑换折成券抵债',async()=>{
 const f=fixture();
 const loan=await borrow(f,'b6-borrow');
 // 30 天到期 + 宽限 1 天后违约。木料 200 文 ÷ 10 文/张 = 20 张 ≥ 本息 11 张 → 抵押没收，债清。
 await f.act('world_time',{minutes:1440*20},'b6-wait-1');await f.act('world_time',{minutes:1440*12},'b6-wait-2');
 const debt=f.document.state.records[loan.debt];
 assert.ok(debt.defaulted,'逾期未还应进入违约');
 assert.deepEqual([debt.paid,debt.status,debt.settledBy],[loan.amount,'已还清','pledge']);
 assert.equal(debt.resource,NOTE);
 clean(f);
});

test('W8B-7 替工工钱按券付：报酬冻结为券进合同托管，做完原数交到手上',async()=>{
 const f=fixture();
 const [low]=f.engine.rules.economy.wageCopperPerHalfDay;
 f.at(post,f.hostFacts({[NOTE_ITEM]:{quantity:20,quality:'木'}}));
 // 做半天工（240 分钟）最低工钱 low 文 → ceil(low/10) 张。
 const units=Math.ceil(low/10),coins=f.coins();
 const job=await f.trade({seller:host,operation:'work',minutes:240,consent:true},'b7-work');
 assert.equal(job.status,'已完成');assert.deepEqual([job.wage,job.resource],[units,NOTE]);
 const row=f.document.state.records[job.contract];
 assert.deepEqual([row.resource,row.wage,row.paid,row.escrow,row.referenceCopper],[NOTE,units,units,0,{wage:low}]);
 assert.deepEqual([f.notes('player'),f.notes(host),f.coins()],[units,20-units,coins]);
 assert.equal(f.document.ledger.accounts[`${job.contract}|${NOTE}|escrow`]??0,0);
 assert.ok(job.messages.some(m=>m.includes(`得工钱${units}河湾兑付券`)));
 clean(f);
});

test('W8B-8 合伙出资与分红：出资 100 文 = 10 张券，退股与分成同为券',async()=>{
 const f=fixture({hostAt:shop});
 // 先在铺面租铺（真实动作，租金也冻结为券），再订合伙。
 await f.issue(30,'b8-issue');
 f.at(shop,f.hostFacts({[NOTE_ITEM]:{quantity:30,quality:'木'}},shop));
 const lease=await f.act('world_trade',{seller:host,operation:'lease',consent:true,days:1,deposit:0},'b8-lease'),biz=lease.business;
 const own=f.notes('player'),partner=f.notes(host);
 const deal=await f.act('world_trade',{seller:host,operation:'partner',business:biz,consent:true,coins:100,quantity:50,days:1},'b8-partner');
 // 100 文 ÷ 10 文/张 = 10 张，从合伙人手里交到玩家手上；合同的出资额就是 10。
 assert.deepEqual([deal.stake,deal.resource],[10,NOTE]);assert.deepEqual([f.notes('player')-own,partner-f.notes(host)],[10,10]);
 const contract=f.document.state.records[deal.contract];assert.deepEqual([contract.resource,contract.stake,contract.referenceCopper],[NOTE,10,{stake:100}]);
 // 期满自动结算：退股 + 分成。分成基准是铜账里的盈亏的 50%，向上/向下取整的方向都偏向被欠的合伙人。
 await f.act('world_time',{minutes:1500},'b8-expire');
 const done=f.document.state.records[deal.contract];assert.equal(done.status,'已结算');
 const share=Math.floor(done.profit*50/100),extra=share>=0?Math.ceil(share/10):-Math.floor(-share/10);
 assert.equal(done.payout,Math.max(0,10+extra));
 const debt=f.document.state.records[done.debt];assert.deepEqual([debt.resource,debt.amount,debt.kind,debt.creditor],[NOTE,done.payout,'partnership',host]);
 const mine=f.notes('player'),hostBefore=f.notes(host);
 await f.act('world_trade',{seller:host,payment:'repay',debt:done.debt},'b8-repay');
 assert.deepEqual([mine-f.notes('player'),f.notes(host)-hostBefore],[done.payout,done.payout]);
 clean(f);
});

test('W8B-9 法定单位是 coin_river 的地方（默认世界）：钱庄借款、典当、赎当、做工都按铜，账本与文案不变',async()=>{
 const f=fixture({tender:false}),coins=f.coins(),vault=f.bankCoins();
 const loan=await borrow(f,'b9-borrow');
 // 100 文本金原样放出，利息 = ceil(100 × 月息)，借据没有任何资源字段。
 assert.equal(loan.principal,100);assert.ok(!('resource'in loan));assert.equal(loan.interest,Math.ceil(100*loan.monthlyInterest));
 assert.deepEqual([f.coins()-coins,vault-f.bankCoins()],[100,100]);
 const debt=f.document.state.records[loan.debt];assert.ok(!('resource'in debt)&&!('referenceCopper'in debt)&&!('referenceCopper'in debt.terms));
 assert.ok(loan.messages.some(m=>m.includes('借100铜')&&m.includes(`还本息${loan.amount}铜`)));
 await f.trade({payment:'repay',debt:loan.debt},'b9-repay');
 assert.equal(f.coins(),coins-loan.interest);
 // 典当：面包 ×100 → 垫款 50 文；赎当回执同样写明债权人，其余字段与以前一致，没有资源字段。
 const pawn=await f.trade({operation:'pawn',item:'item_bread',quantity:100,days:1},'b9-pawn');
 assert.deepEqual([pawn.principal,pawn.interest],[50,Math.ceil(50*pawn.monthlyInterest)]);assert.ok(!('resource'in pawn));
 const redeem=await f.trade({operation:'redeem',contract:pawn.contract},'b9-redeem');
 assert.deepEqual([redeem.debt,redeem.repaid,redeem.status,redeem.bank,redeem.creditor,redeem.creditorName],[pawn.contract,pawn.amount,'已还清',BANK,BANK,'小驿站汇兑柜']);
 assert.ok(!('resource'in redeem));
 // 做工：工钱用铜，从雇主钱袋到玩家钱袋。
 f.at(post,f.hostFacts());
 const [low]=f.engine.rules.economy.wageCopperPerHalfDay,before=f.coins();
 const job=await f.trade({seller:host,operation:'work',minutes:240,consent:true},'b9-work');
 assert.deepEqual([job.wage,job.status,f.coins()-before],[low,'已完成',low]);assert.ok(!('resource'in job));
 assert.ok(job.messages.some(m=>m.includes(`得工钱${low}铜`)));
 clean(f);
});
