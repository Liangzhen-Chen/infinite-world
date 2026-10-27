// S5-F2 住宿与经营合同按法域法定单位冻结。世界数据里法定计价单位全是 coin_river，所以与 s5-f-tender 同做法：
// 测试世界把河湾 law_hw_property 的单位改成河湾兑付券（每券约定 10 文）；发行券、租铺、雇工、进货、住宿全部走真实动作。
// 余下的前提（人在柜台、房东/雇工的作息与现钱、对方持有的券）是 setup 事实，不是被检验的规则。期望数字都在注释里手算。
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
const host='npc_hw_linsui',worker='npc_hw_ayan',keeper='npc_hw_shendu',post='bld_hw_post',shop='bld_hw_qingdeng',NOTE='coin_hw_note',NOTE_ITEM='item_banknote_hw';
function build({tender=true}={}){
 const w=structuredClone(world);
 if(tender){
  w.rules.law.codes.find(c=>c.id==='law_hw_property').recognition.legalTender.unit=NOTE;
  w.currencyRules.currencies.find(c=>c.resource===NOTE).money.backedBy.ratio=10; // 每张券承诺 10 文
 }
 for(const npc of w.npcs.filter(n=>[host,worker].includes(n.id))){
  npc.schedule={default:[{start:0,end:1440,location:shop,activity:npc.id===worker?'休息':'营业',services:npc.id===worker?[]:['trade']}]};
  npc.creditPolicy={limitCopper:100,maximumMinutes:1440,minimumTrust:0};
 }
 return w;
}
function fixture(options={}){
 const engine=new WorldEngine(build(options)),initial=engine.createCharacter(seed,{},'s5f2');
 const prepared=applyIntentSetup(engine,initial,{minute:600,location:post,coins:3000,inventory:{}});assert.deepEqual(prepared.setupUnmet,[]);
 const f={engine,document:prepared.document,
  async act(tool,args,id){const out=await engine.reduce(f.document,{tool,args,eventId:id});f.document=applyPatches(f.document,out.patches);return out.result;},
  trade:(args,id)=>f.act('world_trade',{seller:host,...args},id),
  async issue(quantity,id){const r=await f.act('world_act',{action:'core:trade.exchange',slots:{seller:keeper,item:NOTE_ITEM,quantity,buyer:'player',mode:'issue'}},id);assert.notEqual(r.receipt.status,'rejected',JSON.stringify(r));return r;},
  // 到铺面：房东/雇工在场、清醒，房东有面包和现钱；hostNotes>0 时房东手里有券（出借人要先有券才借得出）。
  atShop({hostNotes=0,trust=null,stock=0}={}){
   const facts=[{path:['state','npcs',host,'inventory'],value:{item_bread:{quantity:100,quality:'木'},...(hostNotes?{[NOTE_ITEM]:{quantity:hostNotes,quality:'木'}}:{})}},{path:['state','npcs',host,'coins'],value:1000}];
   for(const id of [host,worker])facts.push({path:['state','npcs',id,'location'],value:shop},...(trust===null?[]:[{path:['state','npcs',id,'trust'],value:trust}]));
   const s=applyIntentSetup(engine,f.document,{location:shop,facts,...(stock?{inventory:{item_bread:stock}}:{})});assert.deepEqual(s.setupUnmet,[]);f.document=s.document;},
  draft:()=>engine.primitiveDraft(f.document),
  rate:()=>exchangeRate(f.draft(),engine,{from:NOTE,location:shop}).rate,
  notes:id=>(id==='player'?f.document.state.inventory:f.document.state.npcs[id].inventory)[NOTE_ITEM]?.quantity??0,
  escrowAccount:contract=>f.document.ledger.accounts[`${contract}|${NOTE}|escrow`]??0,
  open:async(business)=>f.act('world_act',{action:'business:open_counter',slots:{business,coins:500}},`counter-${business}`)};
 return f;
}
const clean=f=>assert.deepEqual(reconcile(f.engine,f.document),{mismatches:[],lots:[],drift:[],audit:[]});

test('S5F2-1 住宿合同按券冻结：一周 35 文 = ceil(35/10)=4 张，合同各字段同为券，不动现钱',async()=>{
 const f=fixture();
 await f.issue(10,'l1-issue');f.atShop();
 const coins=f.document.state.player.coins;
 // 住宿 7 天：周价 rules.economy.rentalCopperPerWeek=35 文；兑付券 10 文/张 → ceil(3.5)=4 张。
 const r=await f.trade({service:'住宿',days:7},'l1-stay');
 assert.deepEqual([r.cost,r.resource,r.referenceCopper],[4,NOTE,35]);
 assert.deepEqual(r.paidWith,{resource:NOTE,amount:4,name:'河湾兑付券'});
 assert.ok(r.messages.some(m=>m.includes('住宿7天，支付4河湾兑付券'))&&!r.messages.some(m=>m.includes('35铜')));
 const room=f.document.state.records[r.contract];
 // 合同内各金额字段同一单位：cost、paid 都是 4（券），不是一部分 35 文、一部分 4 张。
 assert.deepEqual([room.resource,room.cost,room.paid,room.referenceCopper],[NOTE,4,4,35]);
 assert.ok(room.content.includes('4河湾兑付券')&&!room.content.includes('铜'));
 assert.equal(f.document.state.player.coins,coins);assert.equal(f.notes('player'),6);assert.equal(f.notes(host),4);
 clean(f);
});

test('S5F2-2 住宿赊账冻结为 1 晚=ceil(6/10)=1 张；之后兑换率变了，债与合同金额不变；换铜还款按还款时兑换向上取整',async()=>{
 const f=fixture();
 await f.issue(10,'l2-issue');f.atShop();
 const stay=await f.trade({service:'住宿',days:1,payment:'credit',creditMinutes:600},'l2-stay');
 assert.deepEqual([stay.cost,stay.resource,stay.amount],[1,NOTE,1]);
 const room=f.document.state.records[stay.contract],debt=f.document.state.records[stay.debt];
 assert.deepEqual([room.cost,room.paid,room.debt],[1,0,stay.debt]);assert.deepEqual([debt.resource,debt.amount,debt.referenceCopper],[NOTE,1,6]);
 // 压低兑换率：用券买 25 个面包（25 文 → 3 张）。基准账成交 25 文 → 2.5 张当量；
 // 活跃券（玩家 10-3=7 + 房东 3）=10 → 充裕度 .25 → 兑换率 10 x .25 = 2.5 文/张（与 s5-f-tender S5F-8 同口径）。
 await f.trade({item:'item_bread',quantity:25,payCurrency:NOTE},'l2-shock');
 assert.equal(f.rate(),2.5);
 const frozen=f.document.state.records[stay.contract];
 assert.deepEqual([frozen.cost,frozen.paid,frozen.resource],[1,0,NOTE]);assert.deepEqual([f.document.state.records[stay.debt].amount,f.document.state.records[stay.debt].paid],[1,0]);
 // 用铜还：1 张 x 2.5 = 2.5 文 → 向上取整 3 枚，零头 0.5 枚留给房东，不找零。
 const before=f.document.state.player.coins,hostBefore=f.document.state.npcs[host].coins;
 const paid=await f.trade({payment:'repay',debt:stay.debt,payCurrency:'coin_river'},'l2-repay');
 assert.equal(paid.status,'已还清');assert.equal(before-f.document.state.player.coins,3);assert.equal(f.document.state.npcs[host].coins-hostBefore,3);
 // 合同同步为已付清 1 张（同一单位，不是 3 文）。
 assert.deepEqual([f.document.state.records[stay.contract].paid,f.document.state.records[stay.contract].resource],[1,NOTE]);
 clean(f);
});

test('S5F2-3 租铺：租金与押金同冻为券；押金进合同托管；兑换率变了金额不变；到期原数退还',async()=>{
 const f=fixture();
 await f.issue(10,'l3-issue');f.atShop();
 // 租 1 天：租金默认 rentalCopperPerNight=6 文 → ceil(.6)=1 张；押金 25 文 → ceil(2.5)=3 张。同一资源。
 const lease=await f.trade({operation:'lease',consent:true,days:1,deposit:25},'l3-lease');
 assert.deepEqual([lease.cost,lease.deposit,lease.resource,lease.referenceCopper],[1,3,NOTE,{cost:6,deposit:25}]);
 const row=f.document.state.records[lease.contract];
 assert.deepEqual([row.resource,row.cost,row.escrow,row.paid],[NOTE,1,3,1]);
 // 玩家 10 → 10-1(租金)-3(押金)=6；房东收到租金 1 张；押金 3 张在合同托管账户，不在任何人手里。
 assert.equal(f.notes('player'),6);assert.equal(f.notes(host),1);assert.equal(f.escrowAccount(lease.contract),3);
 clean(f);
 // 压低兑换率（用券买 25 个面包），合同金额一个字不动。
 await f.trade({item:'item_bread',quantity:25,payCurrency:NOTE},'l3-shock');
 assert.ok(f.rate()<10);
 const same=f.document.state.records[lease.contract];assert.deepEqual([same.cost,same.escrow,same.resource],[1,3,NOTE]);
 // 过了租期（1 天）：押金原数 3 张退回玩家，不随兑换率改写。
 const notesBefore=f.notes('player');
 await f.act('world_time',{minutes:1500},'l3-expire');
 const ended=f.document.state.records[lease.contract];
 assert.equal(ended.escrow,0);assert.equal(f.notes('player')-notesBefore,3);assert.equal(f.escrowAccount(lease.contract),0);
 clean(f);
});

test('S5F2-4 租铺赊账：押金只抵真实租金债（原单位），余额原数退',async()=>{
 const f=fixture();
 await f.issue(10,'l4-issue');f.atShop();
 // 租金 6 文 → 1 张，赊账；押金 25 文 → 3 张。
 const lease=await f.trade({operation:'lease',consent:true,days:1,deposit:25,payment:'credit',creditMinutes:120},'l4-lease');
 assert.deepEqual([lease.cost,lease.deposit,lease.resource],[1,3,NOTE]);
 const debt=f.document.state.records[lease.debt];assert.deepEqual([debt.resource,debt.amount,debt.paid],[NOTE,1,0]);
 assert.deepEqual([f.document.state.records[lease.contract].paid,f.notes('player')],[0,7]); // 7 = 10 - 3 押金，租金还没付
 // 不还，等债逾期：租约违约，押金先抵这 1 张债，余下 2 张原数退回。
 await f.act('world_time',{minutes:130},'l4-overdue');
 const ended=f.document.state.records[lease.contract];
 assert.equal(ended.status,'违约');assert.equal(ended.escrow,0);
 assert.equal(f.document.state.records[lease.debt].paid,1);assert.equal(f.notes(host),1); // 债权人从押金里收到 1 张
 assert.equal(f.notes('player'),7+2);                                                 // 退回 3-1=2 张
 clean(f);
});

test('S5F2-5 租铺后经营合同：雇工报酬、进货托管与履约付款都按券，同一合同单位一致',async()=>{
 const f=fixture();
 await f.issue(20,'l5-issue');f.atShop({stock:2});
 const lease=await f.trade({operation:'lease',consent:true,days:1,deposit:0},'l5-lease'),biz=lease.business;
 await f.open(biz);
 await f.act('world_settlement',{operation:'business_open',business:biz},'l5-open');
 // 雇工盘点（还没有任何市场成交，兑换率 10 文/张）：报酬由 laborValue 派生的铜价，冻结为券（向上取整），同一合同单位一致。
 const hire=await f.act('world_trade',{operation:'hire',business:biz,seller:worker,consent:true,task:'stocktake',minutes:30,item:'item_bread',quantity:2},'l5-hire');
 assert.equal(hire.resource,NOTE);assert.equal(hire.cost,Math.ceil(hire.referenceCopper/10));assert.equal(hire.escrow,hire.cost);
 const hc=f.document.state.records[hire.contract];assert.deepEqual([hc.resource,hc.cost,hc.escrow],[NOTE,hire.cost,hire.cost]);assert.equal(f.escrowAccount(hire.contract),hire.cost);
 const workerBefore=f.notes(worker);
 await f.act('world_trade',{operation:'fulfill',business:biz,seller:worker,contract:hire.contract},'l5-work');
 assert.equal(f.notes(worker)-workerBefore,hire.cost);assert.equal(f.document.state.records[hire.contract].paid,hire.cost);assert.equal(f.escrowAccount(hire.contract),0);
 // 进货 2 个面包：每个 1 文（目录基价 2 x 稀缺度下限 .5，与 s5-03 面包口径一致），整笔 2 文 → ceil(2/10)=1 张。
 const order=await f.trade({operation:'procure',business:biz,consent:true,item:'item_bread',quantity:2},'l5-procure');
 assert.deepEqual([order.resource,order.cost,order.escrow,order.referenceCopper],[NOTE,1,1,2]);
 const pc=f.document.state.records[order.contract];assert.deepEqual([pc.resource,pc.cost,pc.escrow,pc.unitPrice],[NOTE,1,1,undefined]);
 assert.equal(f.escrowAccount(order.contract),1);
 const hostBefore=f.notes(host),bread=f.document.state.inventory.item_bread.quantity;
 await f.trade({operation:'fulfill',business:biz,contract:order.contract},'l5-fulfill');
 // 履约：托管的 1 张券原数付给供货人，面包到手。
 assert.equal(f.notes(host)-hostBefore,1);assert.equal(f.document.state.records[order.contract].escrow,0);assert.equal(f.document.state.records[order.contract].paid,1);
 assert.equal(f.document.state.inventory.item_bread.quantity,bread+2);
 // 经营报表仍以基准铜计利润：租金/工钱取合同记的基准账，不把“张”当“文”相加。
 const report=await f.act('world_settlement',{operation:'business_report',business:biz},'l5-report');
 assert.equal(report.profit.rent,6);assert.equal(report.profit.wages,hire.referenceCopper);
 clean(f);
});

test('S5F2-6 进货借款：出借人先以券出借进托管，债是券，还款可换铜',async()=>{
 const f=fixture();
 await f.issue(20,'l6-issue');f.atShop({hostNotes:20,trust:20});
 const lease=await f.trade({operation:'lease',consent:true,days:1,deposit:0},'l6-lease'),biz=lease.business;
 await f.open(biz);
 const hostBefore=f.notes(host);
 const order=await f.trade({operation:'procure',business:biz,consent:true,item:'item_bread',quantity:2,payment:'credit',creditMinutes:1440},'l6-procure');
 // 货款 2 文 → 1 张；借款本金就是 1 张券（出借人手里的券进合同托管），债是 1 张 + 整张的利息。
 assert.deepEqual([order.resource,order.cost,order.escrow],[NOTE,1,1]);
 const debt=f.document.state.records[order.debt];assert.equal(debt.resource,NOTE);assert.equal(debt.principal,1);
 assert.equal(hostBefore-f.notes(host),1);assert.equal(f.escrowAccount(order.contract),1);
 // 还款：用铜还按还款时兑换（无成交 10 文/张）= 本息张数 x 10 文。
 const owe=debt.amount,coins=f.document.state.player.coins;
 await f.trade({payment:'repay',debt:order.debt,payCurrency:'coin_river'},'l6-repay');
 assert.equal(coins-f.document.state.player.coins,owe*10);assert.equal(f.document.state.records[order.debt].status,'已还清');
 clean(f);
});

test('S5F2-7 房钱按券计：没有券就拒绝，不悄悄改用铜；明示 payCurrency 才换币',async()=>{
 const f=fixture();
 f.atShop();
 const coins0=f.document.state.player.coins;
 await assert.rejects(f.trade({service:'住宿',days:1},'l7-nonote'),/房钱不足.*河湾兑付券/);
 assert.equal(f.document.state.player.coins,coins0);
 // 明示用铜：账面 6 文 → 1 张；1 张 = 10 文，用铜付 = ceil(1 x 10 / 1) = 10 枚（向上取整的是“张”，再按张折铜）。
 const r=await f.trade({service:'住宿',days:1,payCurrency:'coin_river'},'l7-copper');
 assert.deepEqual(r.paidWith,{resource:'coin_river',amount:10});assert.equal(coins0-f.document.state.player.coins,10);
 clean(f);
});

test('S5F2-8 法定单位是 coin_river 的地方（默认世界）：行为与以前完全一致，合同无资源字段',async()=>{
 const f=fixture({tender:false});
 f.atShop();
 const coins=f.document.state.player.coins;
 const stay=await f.trade({service:'住宿',days:7},'l8-stay');
 // 周价 35 文，现钱付；合同行没有 resource/cost/referenceCopper，文案按铜。
 assert.equal(stay.cost,35);assert.ok(!('resource'in stay));assert.ok(!('paidWith'in stay));
 const room=f.document.state.records[stay.contract];
 assert.ok(!('resource'in room)&&!('cost'in room)&&!('referenceCopper'in room));assert.equal(room.paid,35);assert.equal(room.content.includes('35铜'),true);
 assert.equal(coins-f.document.state.player.coins,35);
 assert.ok(stay.messages.some(m=>m.includes('住宿7天，支付35铜')));
 const lease=await f.trade({operation:'lease',consent:true,days:1,deposit:25},'l8-lease');
 assert.deepEqual([lease.cost,lease.deposit],[6,25]);assert.ok(!('resource'in lease));
 const row=f.document.state.records[lease.contract];assert.deepEqual([row.cost,row.escrow,row.paid],[6,25,6]);assert.ok(!('resource'in row));
 clean(f);
});

test('S5F2-9 赊租后兑换率变了：用铜付租按付租时兑换向上取整，租金债与合同仍是 1 张；不动柜台',async()=>{
 const f=fixture();
 await f.issue(10,'l9-issue');f.atShop();
 // 租 1 天赊账：租金 6 文 → 1 张；无押金。
 const lease=await f.trade({operation:'lease',consent:true,days:1,deposit:0,payment:'credit',creditMinutes:600},'l9-lease');
 assert.deepEqual([lease.cost,lease.resource],[1,NOTE]);
 // 用券买 25 个面包（25 文 → 3 张）：成交 25 文 → 2.5 张当量；活跃券（玩家 10-3 + 房东 3）=10 → 兑换率 10 x .25 = 2.5 文/张。
 await f.trade({item:'item_bread',quantity:25,payCurrency:NOTE},'l9-shock');
 assert.equal(f.rate(),2.5);
 const row=f.document.state.records[lease.contract];
 assert.deepEqual([row.cost,row.paid,f.document.state.records[lease.debt].amount],[1,0,1]);
 // 付租：1 张 x 2.5 = 2.5 文 → 向上取整 3 枚；零头 0.5 枚留给房东。
 const coins=f.document.state.player.coins,hostCoins=f.document.state.npcs[host].coins;
 const paid=await f.trade({operation:'pay',business:lease.business,contract:lease.contract,payCurrency:'coin_river'},'l9-pay');
 assert.equal(paid.status,'已还清');assert.equal(coins-f.document.state.player.coins,3);assert.equal(f.document.state.npcs[host].coins-hostCoins,3);
 assert.deepEqual([f.document.state.records[lease.contract].paid,f.document.state.records[lease.debt].amount,f.document.state.records[lease.debt].paid],[1,1,1]);
 clean(f);
});
