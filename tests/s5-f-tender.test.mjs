// S5-F 多法域计价：报价单位 / 实际币种付款 / 合同资源冻结 / 成交统计分币种 / 账本格式不变。
// 世界数据里 20 条 legalTender 全是 coin_river，所以“跨法域不同”的前提由测试世界改写认可条款提供
// （河湾 law_hw_property 的单位 = 河湾兑付券，约定每券兑付 10 文；玉陂 law_yp_property 的单位 = 羊毛；
// 渭亭 law_wt_property 仍是 coin_river）。余下都走真实动作：发行兑付券是真实钱庄动作，买面包是真实 world_trade。
// 期望数字都在注释里手算，不是被测代码产出的。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {exchangeRate,currencyValue} from '../server-plugin/currency.mjs';
import {tenderQuote,turnoverByResource,turnoverReference} from '../server-plugin/tender.mjs';
import {obligationView} from '../server-plugin/obligation-state.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const host='npc_hw_linsui',keeper='npc_hw_shendu',post='bld_hw_post',shop='bld_hw_qingdeng',NOTE='coin_hw_note';
function tenderWorld(){
 const w=structuredClone(world);
 w.rules.law.codes.find(c=>c.id==='law_hw_property').recognition.legalTender.unit=NOTE;
 w.rules.law.codes.find(c=>c.id==='law_yp_property').recognition.legalTender.unit='item_wool';
 // 兑付券每张承诺 10 文（世界数据原为 100 文）：小额买卖也有整数的券数可算。
 w.currencyRules.currencies.find(c=>c.resource===NOTE).money.backedBy.ratio=10;
 return w;
}
function fixture(){
 const engine=new WorldEngine(tenderWorld()),initial=engine.createCharacter(seed,{},'s5f-tender');
 const prepared=applyIntentSetup(engine,initial,{minute:600,location:post,coins:3000,inventory:{}});assert.deepEqual(prepared.setupUnmet,[]);
 const f={engine,document:prepared.document,
  async act(tool,args,id){const out=await engine.reduce(f.document,{tool,args,eventId:id});f.document=applyPatches(f.document,out.patches);return out.result;},
  trade:(args,id)=>f.act('world_trade',{seller:host,...args},id),
  async issue(quantity,id){const r=await f.act('world_act',{action:'core:trade.exchange',slots:{seller:keeper,item:'item_banknote_hw',quantity,buyer:'player',mode:'issue'}},id);
   assert.notEqual(r.receipt.status,'rejected',JSON.stringify(r));return r;},
  // 到柜台买面包：位置、货架与店主现钱是前提（与 s5-03 同做法），不是被检验的规则。
  atShop(extra={}){const s=applyIntentSetup(engine,f.document,{location:shop,facts:[{path:['state','npcs',host,'inventory'],value:{item_bread:{quantity:100,quality:'木'},...extra}},{path:['state','npcs',host,'coins'],value:1000}]});
   assert.deepEqual(s.setupUnmet,[]);f.document=s.document;},
  draft:()=>engine.primitiveDraft(f.document),
  rate:(from=NOTE,location=shop)=>exchangeRate(f.draft(),engine,{from,location}).rate,
  notes:id=>(id==='player'?f.document.state.inventory:f.document.state.npcs[id].inventory).item_banknote_hw?.quantity??0};
 return f;
}
const clean=f=>assert.deepEqual(reconcile(f.engine,f.document),{mismatches:[],lots:[],drift:[],audit:[]});

test('S5F-1 同一笔 25 文基准报价，在三个法域按各自法定单位给出，且都是整数',async()=>{
 const f=fixture(),d=f.draft(),hw='bld_hw_qingdeng',yp='bld_yp_hall',wt='bld_wt_hall';
 // 河湾：单位=兑付券，每券 10 文（强度 10 × 无成交时充裕度 1）。买方 ceil(25/10)=3 张；卖方 floor(25/10)=2 张。
 assert.deepEqual([tenderQuote(d,f.engine,{location:hw,copper:25}).unit,tenderQuote(d,f.engine,{location:hw,copper:25}).amount],[NOTE,3]);
 assert.equal(tenderQuote(d,f.engine,{location:hw,copper:25,side:'sell'}).amount,2);
 // 渭亭：法典仍以 coin_river 计价，25 文就是 25 文（比价 1）。
 const river=tenderQuote(d,f.engine,{location:wt,copper:25});
 assert.deepEqual([river.unit,river.amount,river.rate],['coin_river',25,1]);
 // 玉陂：单位=羊毛（目录基价 5，无成交时市场估值 5 文/斤）。27 文：买方 ceil(5.4)=6 斤；卖方 floor(5.4)=5 斤；绝不出现 5.4 斤。
 const buy=tenderQuote(d,f.engine,{location:yp,copper:27}),sell=tenderQuote(d,f.engine,{location:yp,copper:27,side:'sell'});
 assert.deepEqual([buy.unit,buy.rate,buy.amount,sell.amount],['item_wool',5,6,5]);
 assert.ok(Number.isInteger(buy.amount)&&Number.isInteger(sell.amount));
 // 三个法域，同一基准价，三个不同的报价单位与数量。
 assert.equal(new Set([tenderQuote(d,f.engine,{location:hw,copper:25}).unit,river.unit,buy.unit]).size,3);
 // 报价是派生的：存档里没有任何比价/报价单位的存储。
 assert.ok(!JSON.stringify(f.document).includes('exactRate'));
});

test('S5F-2 真实交易的报价带本地单位；以币种付款按实交数量记账，不动现钱袋',async()=>{
 const f=fixture();
 // 发行 10 张：ceil(10 x 10 x 1.03)=ceil(103)=103 文（与 s5-03 同一口径，券面 10 文）。
 const issued=await f.issue(10,'f2-issue');assert.equal(issued.paid,103);
 assert.equal(f.document.state.player.coins,3000-103);assert.equal(f.notes('player'),10);
 f.atShop();
 // 25 个面包：目录基价 2 x 稀缺度下限 .5 = 每个 1 文，整笔 25 文（与 s5-03 面包口径一致）→ 3 张（ceil 2.5）。
 const q=await f.trade({item:'item_bread',quantity:25,payCurrency:NOTE},'f2-buy');
 assert.equal(q.cost,25);assert.deepEqual(q.tender.unit,NOTE);assert.equal(q.tender.amount,3);assert.deepEqual(q.paidWith,{resource:NOTE,amount:3});
 // 券：玩家 10→7，店主 0→3；现钱不变（没有悄悄再付铜钱）。
 assert.equal(f.notes('player'),7);assert.equal(f.notes(host),3);assert.equal(f.document.state.player.coins,3000-103);
 assert.equal(f.document.state.inventory.item_bread.quantity,25);
 // 成交记录：基准账 25 文不变，另记实际结算的 3 张券。
 const deal=Object.values(f.document.state.records).find(r=>r.category==='market_trade'&&r.eventId==='f2-buy');
 assert.equal(deal.totalCoins,25);assert.deepEqual(deal.settled,{resource:NOTE,amount:3});
 clean(f);
 // 券不够就拒绝，不拆零、不找零：75 个面包 = 75 文，按成交后的兑换率（见 S5F-4）远不止手里剩的 7 张。
 const before=structuredClone(f.document.state.inventory);
 await assert.rejects(f.trade({item:'item_bread',quantity:75,payCurrency:NOTE},'f2-short'),/兑付券不足/);
 assert.deepEqual(f.document.state.inventory.item_banknote_hw,before.item_banknote_hw);
});

test('S5F-3 实物计价：以羊毛付款，数量是整数斤，守恒',async()=>{
 const f=fixture();
 f.atShop();
 const s=applyIntentSetup(f.engine,f.document,{location:shop,inventory:{item_wool:40}});assert.deepEqual(s.setupUnmet,[]);f.document=s.document;
 // 河湾的羊毛估值：目录基价 5 x 稀缺度下限 .5 = 2.5 文/斤（与面包 2 x .5 = 1 同一口径）。面包 25 文 → ceil(25/2.5)=10 斤（整除）。
 const r=await f.trade({item:'item_bread',quantity:25,payCurrency:'item_wool'},'f3-wool');
 assert.deepEqual(r.paidWith,{resource:'item_wool',amount:10});
 assert.equal(f.document.state.inventory.item_wool.quantity,30);assert.equal(f.document.state.npcs[host].inventory.item_wool.quantity,10);
 assert.equal(f.document.state.player.coins,3000);
 // 23 个面包 = 23 文 → ceil(23/2.5)=ceil(9.2)=10 斤，多出的 0.8 斤价值留给对方，不找零（羊毛不可拆成小数）。
 const r2=await f.trade({item:'item_bread',quantity:23,payCurrency:'item_wool'},'f3-wool-2');
 assert.equal(r2.paidWith.amount,10);assert.ok(Number.isInteger(r2.paidWith.amount));
 clean(f);
});

test('S5F-4 赊账合同冻结签约时的计价资源与数量；之后兑换率变了，旧债本金不变，用别的币还款按还款时兑换',async()=>{
 const f=fixture();
 await f.issue(10,'f4-issue');f.atShop();
 const rate0=f.rate();assert.equal(rate0,10); // 无成交：10 x 充裕度 1
 // 5 个面包：整笔 5 文，赊账。河湾单位=券：ceil(5/10)=1 张。债是“1 张兑付券”，不是 5 文。
 const owed=await f.trade({item:'item_bread',quantity:5,payment:'credit',creditMinutes:600},'f4-credit');
 assert.equal(owed.cost,5);assert.equal(owed.resource,NOTE);assert.equal(owed.amount,1);
 const debt=owed.debt,frozen=structuredClone(f.document.state.records[debt]);
 assert.deepEqual([frozen.resource,frozen.amount,frozen.referenceCopper],[NOTE,1,5]);
 // 然后市场成交把兑换率压低：再用券买 25 个面包（又一笔成交），读公开兑换率。
 const sale=await f.trade({item:'item_bread',quantity:25,payCurrency:NOTE},'f4-shock');assert.equal(sale.paidWith.amount,3);
 // 手算：基准账成交 5(赊账)+25(券)=30 文 → 成交量 30/10=3 张券当量；活跃券（玩家 7 + 店主 3）=10 张 → 充裕度 3/10=.3 → 兑换率 10 x .3 = 3 文/张。
 const rate1=f.rate();assert.equal(rate1,3);assert.ok(rate1<rate0);
 // 债的本金一个字没动。
 const same=f.document.state.records[debt];
 assert.deepEqual([same.resource,same.amount,same.paid,same.referenceCopper],[NOTE,1,0,5]);
 assert.equal(obligationView(f.document.state,debt).owed,1);
 // 用河湾铜钱还：按还款时的兑换率，1 张券 x rate1 文，向上取整成整枚铜钱（零头留给债权人，不找零）。
 const coinsBefore=f.document.state.player.coins,creditorBefore=f.document.state.npcs[host].coins;
 const owedCoins=3; // 1 张 x 3 文/张 = 3 枚铜钱，恰好整除
 const paid=await f.trade({payment:'repay',debt,payCurrency:'coin_river'},'f4-repay');
 assert.equal(paid.status,'已还清');
 assert.equal(coinsBefore-f.document.state.player.coins,owedCoins);assert.equal(f.document.state.npcs[host].coins-creditorBefore,owedCoins);
 const settled=f.document.state.records[debt];
 assert.deepEqual([settled.resource,settled.amount,settled.paid,settled.status],[NOTE,1,1,'已还清']);
 // 若兑换率没变，同一笔债要付 1 x 10 = 10 枚；现在付 3 枚——差额是签约后兑换率变动的真实结果，不是本金被改写。
 clean(f);
});

test('S5F-5 同一笔旧债用原币种还：数量就是冻结的数量，与兑换率无关',async()=>{
 const f=fixture();
 await f.issue(10,'f5-issue');f.atShop();
 const owed=await f.trade({item:'item_bread',quantity:5,payment:'credit',creditMinutes:600},'f5-credit');
 await f.trade({item:'item_bread',quantity:25,payCurrency:NOTE},'f5-shock');
 const paid=await f.trade({payment:'repay',debt:owed.debt},'f5-repay');
 // 10 张 -3（冲击成交）-1（还债）= 6；债权人收到 3+1=4 张。
 assert.equal(paid.status,'已还清');assert.equal(f.notes('player'),6);assert.equal(f.notes(host),4);
 clean(f);
});

test('S5F-6 成交统计分币种：原始统计按实际结算资源分开，折算由派生函数按当时兑换率给出',async()=>{
 const f=fixture();
 await f.issue(10,'f6-issue');f.atShop();
 await f.trade({item:'item_bread',quantity:10},'f6-cash');                       // 现钱：10 文
 await f.trade({item:'item_bread',quantity:25,payCurrency:NOTE},'f6-note');      // 券：3 张（基准账 25 文）
 const place='loc_hw',state=f.document.state;
 // 河湾成交：10 文铜钱 + 3 张券；基准账（totalCoins）合计 35 文，未被改写。
 assert.deepEqual(turnoverByResource(state,{place}),{coin_river:10,[NOTE]:3});
 assert.equal(Object.values(state.records).filter(r=>r.category==='market_trade'&&r.place===place).reduce((n,r)=>n+r.totalCoins,0),35);
 // 折算比较：10 + 3 x 当下兑换率（只是比较口径，不回写）。
 const rate=f.rate(),cmp=turnoverReference(f.draft(),f.engine,{place,location:shop});
 assert.ok(Math.abs(cmp-(10+3*rate))<1e-9);
 const snapshot=JSON.stringify(f.document.state.records);turnoverReference(f.draft(),f.engine,{place,location:shop});assert.equal(JSON.stringify(f.document.state.records),snapshot);
 // 通货估值解释里也带分币种统计。
 const view=currencyValue(f.draft(),f.engine,{currency:NOTE,location:shop});
 assert.deepEqual(view.explanation.turnoverByResource,{coin_river:10,[NOTE]:3});
});

test('S5F-7 账本格式不变：账户键仍是 owner|resource|purpose，顶层字段不增不减，对账为零',async()=>{
 const f=fixture();
 await f.issue(10,'f7-issue');f.atShop();
 await f.trade({item:'item_bread',quantity:25,payCurrency:NOTE},'f7-note');
 await f.trade({item:'item_bread',quantity:5,payment:'credit',creditMinutes:600},'f7-credit');
 const ledger=f.document.ledger;
 assert.deepEqual(Object.keys(ledger).sort(),['accounts','budget','currencyActivity','flows','lots','scopes','transfers','version']);
 for(const key of Object.keys(ledger.accounts))assert.match(key,/^[^|]+\|[^|]+\|[^|]+$/);
 // 券在人手里是 <人>|coin_hw_note|<用途> 的普通账户，不是新账户种类。
 assert.ok(Object.keys(ledger.accounts).some(k=>k.startsWith(`${host}|${NOTE}|`)&&ledger.accounts[k]===3));
 clean(f);
});

test('S5F-8 还款零头：按还款时兑换向上取整成整枚，差额留给债权人，债本身仍是整数张',async()=>{
 const f=fixture();
 await f.issue(10,'f8-issue');f.atShop();
 // 先用券买 25 个面包：成交 25 文 → 25/10=2.5 张当量，活跃券 10 张 → 充裕度 .25 → 兑换率 10 x .25 = 2.5 文/张。
 await f.trade({item:'item_bread',quantity:25,payCurrency:NOTE},'f8-shock');assert.equal(f.rate(),2.5);
 // 赊 6 个面包（整笔 cost 文，赊账限额 6 文）：债 = ceil(cost/2.5) 张。
 const owed=await f.trade({item:'item_bread',quantity:6,payment:'credit',creditMinutes:600},'f8-credit');
 assert.equal(owed.amount,Math.ceil(owed.cost/2.5));assert.equal(owed.resource,NOTE);assert.ok(Number.isInteger(owed.amount));
 // 手算：成交 25+cost 文 → 活跃券 10 张，成交量 (25+cost)/10 张当量 → 充裕度 (25+cost)/100 → 兑换率 (25+cost)/10 文/张。
 const rate=(25+owed.cost)/10;assert.equal(f.rate(),rate);
 const before=f.document.state.player.coins,creditor=f.document.state.npcs[host].coins;
 const need=Math.ceil(owed.amount*rate);
 await f.trade({payment:'repay',debt:owed.debt,payCurrency:'coin_river'},'f8-repay');
 assert.equal(before-f.document.state.player.coins,need);assert.equal(f.document.state.npcs[host].coins-creditor,need);
 assert.ok(need>=owed.amount*rate&&need<owed.amount*rate+1); // 多付不到 1 枚，且不找零
 const debt=f.document.state.records[owed.debt];assert.deepEqual([debt.resource,debt.amount,debt.paid,debt.status],[NOTE,owed.amount,owed.amount,'已还清']);
 clean(f);
});
