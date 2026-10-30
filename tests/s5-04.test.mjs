import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {dedicatedCoinAccount,spendCounterCoins} from '../server-plugin/money.mjs';
import {transition,advanceProcedure} from '../server-plugin/transition.mjs';
import {obligationView} from '../server-plugin/obligation-state.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {laborValue} from '../server-plugin/market.mjs';
import {recordEmploymentAttendance} from '../server-plugin/employment-state.mjs';
import {advanceLaborMarket} from '../server-plugin/labor-market.mjs';
import {businessOptions,draftMinutes} from '../server-plugin/business.mjs';
import {advanceContracts} from '../server-plugin/contracts.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const place='bld_hw_qingdeng',landlord='npc_hw_linsui';
async function counter({credit=false}={}){
 const w=structuredClone(world);if(credit)w.npcs.find(n=>n.id===landlord).creditPolicy={limitCopper:100,maximumMinutes:1440,minimumTrust:0};
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s504-business');
 // 钱袋与营业时段是非考查前提；租铺、资金调拨与来源均由真实动作建立。
 const prepared=applyIntentSetup(engine,initial,{minute:600,location:place,coins:300,inventory:{item_bread:5,item_parchment:1},present:[landlord],abilitiesByActor:{player:{skills:{skill_literacy:500}}}});
 assert.deepEqual(prepared.setupUnmet,[]);
 const f={engine,document:prepared.document};
 f.act=async(action,slots,id)=>{const out=await engine.reduce(f.document,{tool:'world_act',args:{action,slots},eventId:id});if(out.result.receipt?.status==='rejected')assert.deepEqual(out.patches,[]);assert.notEqual(out.result.receipt?.status,'rejected',JSON.stringify(out.result));f.document=applyPatches(f.document,out.patches);return out.result;};
 const leased=await engine.reduce(f.document,{tool:'world_trade',args:{operation:'lease',seller:landlord,consent:true,days:1},eventId:'counter-lease'});
 f.document=applyPatches(f.document,leased.patches);f.business=leased.result.business;
 f.open=(slots={},id='counter-open')=>f.act('business:open_counter',{business:f.business,coins:100,...slots},id);
 return f;
}
const account=f=>dedicatedCoinAccount(f.document.state,'player','counter');
const clean=f=>assert.deepEqual(reconcile(f.engine,f.document),{mismatches:[],lots:[],drift:[],audit:[]});
function write(f,fn){const d=f.engine.primitiveDraft(f.document),result=fn(d);f.document=applyPatches(f.document,d.patches);return result;}

test('counter: separate balances and owner-only spending',async()=>{
 const f=await counter(),before=f.document.state.player.coins;await f.open();
 assert.equal(account(f).coins,100);assert.equal(f.document.state.player.coins,before-100);
 const saved=structuredClone(f.document);
 assert.throws(()=>write(f,d=>spendCounterCoins(d,f.engine,{owner:'player',actor:landlord,to:landlord,amount:20,eventId:'forged'})),/owner/);
 assert.deepEqual(f.document,saved);
 await f.act('business:spend_counter',{to:landlord,coins:20},'counter-pay');
 // 100−20=80；钱袋只扣开户100，柜台支用不重复扣钱袋。
 assert.equal(account(f).coins,80);assert.equal(f.document.state.player.coins,before-100);
 clean(f);
});

test('opening: reject invalid sources and persist provenance',async()=>{
 for(const slots of [{sourceEvent:'missing'},{purpose:'purse'},{owner:landlord},{coins:-1},{coins:1000000}]){
  const f=await counter(),saved=structuredClone(f.document);await assert.rejects(f.open(slots));assert.deepEqual(f.document,saved);assert.equal(account(f),null);
 }
 const f=await counter();await f.open();assert.equal(account(f).sourceEvent,'counter-lease');assert.equal(account(f).openedBy,'counter-open');
 const saved=structuredClone(f.document);await assert.rejects(f.open({},'duplicate-opening'));assert.deepEqual(f.document,saved);clean(f);
});

test('estate: transfer 100 once on death',async()=>{
 const f=await counter();await f.open();
 const result=write(f,d=>transition(d,f.engine,{entity:'player',basis:'death',origin:'death_rule',eventId:'counter-death',successors:[landlord]}));
 assert.ok(result.successor);assert.equal(account(f).coins,0);
 assert.equal(f.document.ledger.accounts['player|coin_river|counter']??0,0);
 assert.equal(f.document.ledger.accounts[`${result.successor}|coin_river|counter`],100);
 assert.equal(dedicatedCoinAccount(f.document.state,result.successor,'counter').coins,100);clean(f);
});

test('save: roundtrip independent counter',async()=>{
 const f=await counter();await f.open();const dir=path.join(tmpRoot(),'s504-counter');
 try{
  const storage=new CampaignStorage(dir,{reducer:(doc,input)=>f.engine.reduce(doc,input)});await storage.create({id:'counter',worldVersion:world.version,document:f.document});const opened=await storage.read('counter');
  assert.deepEqual(opened.document,f.document);
  const saved=structuredClone(f.document),input={tool:'world_act',args:{action:'business:spend_counter',slots:{coins:20}},eventId:'counter-withdraw'};
  await storage.transact('counter',{id:'counter-withdraw',input},(doc,call)=>f.engine.reduce(doc,call));
  const bundle=await storage.export('counter'),fresh=new CampaignStorage(dir,{reducer:(doc,input)=>f.engine.reduce(doc,input)});
  const imported=await fresh.import(bundle,'counter-copy');f.document=imported.document;
  assert.equal(account(f).coins,80);assert.equal(account(f).sourceEvent,'counter-lease');assert.equal(f.document.state.player.coins,saved.state.player.coins+20);clean(f);
  const paid=structuredClone(f.document);await fresh.transact('counter-copy',{id:'counter-withdraw',input},(doc,call)=>f.engine.reduce(doc,call));
  assert.deepEqual((await fresh.read('counter-copy')).document,paid);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('wage: derived valuation anchors',async()=>{
 const engine=new WorldEngine({...world,derived:{...world.derived,modifiers:[...world.derived.modifiers,{id:'labor-premium',pack:'business',target:'economy:wage',stage:'mul',value:1.5}]}});
 const initial=engine.createCharacter(seed,{},'labor-premium');
 // 第0阶(20+40)/2×1.5=45；1500熟练度为第5阶，(600+1500)/2×1.5=1575。
 assert.equal(laborValue(engine,initial,{worker:landlord}).daily,45);
 assert.equal(laborValue(engine,initial,{worker:landlord,proficiency:1500}).daily,1575);
});

test('estate-debt: real loan paid before the 59 copper distribution',async()=>{
 const f=await counter();
 // 借贷地点、抵押品和期初钱袋不是本卡考查对象；借款及债权由真实动作签订。
 let prepared=applyIntentSetup(f.engine,f.document,{minute:600,location:'bld_hw_post',coins:0,inventory:{item_wood:100}});
 assert.deepEqual(prepared.setupUnmet,[]);f.document=prepared.document;
 const borrowed=await f.engine.reduce(f.document,{tool:'world_trade',args:{operation:'borrow',seller:'npc_hw_shendu',coins:40,days:1,item:'item_wood',quantity:100},eventId:'estate-loan'});
 f.document=applyPatches(f.document,borrowed.patches);
 assert.ok(obligationView(f.document.state,borrowed.result.debt));
 prepared=applyIntentSetup(f.engine,f.document,{minute:610,location:place,coins:100});assert.deepEqual(prepared.setupUnmet,[]);f.document=prepared.document;
 await f.open();
 // 贷款到期是本卡的时间前提：不把未到期、约定由继承人续履的贷款提前清偿。
 prepared=applyIntentSetup(f.engine,f.document,{minute:2050});assert.deepEqual(prepared.setupUnmet,[]);f.document=prepared.document;
 const inheritedBefore=f.document.state.npcs[landlord].coins;
 const result=write(f,d=>{
  const r=transition(d,f.engine,{entity:'player',basis:'death',origin:'death_rule',eventId:'estate-debt',successors:[landlord],durations:{notice:0,filing:0,settlement:0,distribution:0}});
  assert.deepEqual(f.engine.protocolAdditionalClaimAccounts(d,r.successor),[[`${r.successor}|coin_river|counter`,100]]);
  advanceProcedure(d,f.engine,r.successor);return r;
 });
 // 本金40 + 一日利息ceil(40×月息0.0154÷30)=1 => 41；100−41=59分给继承人。
 assert.equal(obligationView(f.document.state,borrowed.result.debt).paid,41,JSON.stringify({claim:obligationView(f.document.state,borrowed.result.debt),procedure:f.document.state.records[`transition_procedure:${result.successor}`]}));
 assert.equal(obligationView(f.document.state,borrowed.result.debt).owed,0);
 // 继承保留账户用途：余款59进入继承人柜台，个人钱袋不再复制一份。
 assert.equal(f.document.state.npcs[landlord].coins,inheritedBefore);
 assert.equal(dedicatedCoinAccount(f.document.state,landlord,'counter').coins,59);
 assert.equal(dedicatedCoinAccount(f.document.state,result.successor,'counter').coins,0);clean(f);
});

test('signed-wage: a native new contract uses corrections; existing terms stay fixed',async()=>{
 const worker='npc_hw_ayan',mill='bld_hw_mill';
 const make=multiplier=>new WorldEngine({...world,derived:{...world.derived,modifiers:[...world.derived.modifiers,{id:'wage-market',pack:'business',target:'economy:wage',stage:'mul',value:multiplier}]}});
 const engine=make(1.5),initial=engine.createCharacter(seed,{},'signed-wage');
 // W8-E1 负重：原带木料 100 份 = 200 公斤，班次产出的木楔入囊被拒。本用例考查工钱（按到岗分钟），不看产量：
 // 带背得动的13份=26公斤；W8-E8自有工坊只从场所库存生产，先实际将同一批材料入库。
 const prepared=applyIntentSetup(engine,initial,{minute:600,location:mill,coins:10000,inventory:{item_wood:13,item_whittling_knife:1},present:[worker],abilitiesByActor:{[worker]:{skills:{skill_life_6_core:1500}}},facts:[{path:['state','buildings'],value:{...initial.state.buildings,[mill]:{owner:'player',condition:100}}}]});
 assert.deepEqual(prepared.setupUnmet,[]);
 const stored=await engine.reduce(prepared.document,{tool:'world_trade',args:{operation:'workshop_stock',item:'item_wood',quantity:13,mode:'deposit'},eventId:'signed-wage-store'});
 const stocked=applyPatches(prepared.document,stored.patches);
 const out=await engine.reduce(stocked,{tool:'world_trade',args:{operation:'workshop',seller:worker,consent:true,item:'recipe_wooden_pegs',days:3},eventId:'signed-wage'});
 const document=applyPatches(stocked,out.patches),row=document.state.records[out.result.contract];
 // 第5阶(600+1500)/2=1050；×1.5=1575，市场修正2时新报价2100。
 assert.equal(row.wage,1575);
 const changed=make(2);assert.equal(laborValue(changed,document,{worker,proficiency:1500}).daily,2100);
 assert.equal(document.state.records[row.id].wage,1575);
 // 生产结薪消费者在行情变化后仍实际支付已签1575，2100只成为加薪请求。
 // F083: the shift is run by the real clock under the changed market (the worker walks home and back to the mill by the schedule),
 // and the day wage is paid pro rata to the minutes really worked: ceil(1575*m/480) with m = 480 minus the walk (road table).
 const advanced=await changed.reduce(document,{tool:'world_time',args:{minutes:row.nextWork-document.state.minute},eventId:'signed-wage-shift'});
 const paid={engine:changed,document:applyPatches(document,advanced.patches)},m=480-changed.route(changed.byId.get(worker).home.location,mill,'walk',row.starts,document.randomSeed).minutes;
 assert.equal(paid.document.state.records[row.id].shifts[0].minutes,m);
 assert.equal(paid.document.state.records[row.id].paid,Math.ceil(1575*m/480));assert.equal(paid.document.state.records[row.id].wage,1575);
 const renewal=await changed.reduce(document,{tool:'world_trade',args:{operation:'workshop_terms',seller:worker,consent:true,contract:row.id},eventId:'renew-wage'});
 const renewed=applyPatches(document,renewal.patches);assert.equal(renewed.state.records[row.id].wage,2100);
});

test('attendance: native autonomous contract counts half shift and no striking hours',async()=>{
 const engine=new WorldEngine(world),initial=engine.createCharacter(seed,{},'attendance'),mill='bld_hw_mill',worker='npc_hw_ayan';
 // 材料、工具、经营产权及求职需求是非考查前提；合同由生产招工系统签订。
 const prepared=applyIntentSetup(engine,initial,{minute:600,location:mill,present:[landlord,worker],abilitiesByActor:{[landlord]:{recipes:['recipe_wooden_pegs']},[worker]:{skills:{skill_life_6_core:1500},recipes:['recipe_wooden_pegs']}},facts:[
  {path:['state','buildings'],value:{...initial.state.buildings,[mill]:{owner:landlord,condition:100}}},
  {path:['state','npcs',landlord],value:{...initial.state.npcs[landlord],location:mill,coins:5000,inventory:{item_wood:{quantity:100},item_whittling_knife:{quantity:1,durability:100}}}},
  {path:['state','npcs',worker],value:{...initial.state.npcs[worker],location:mill,coins:0,inventory:{item_whittling_knife:{quantity:1,durability:100}},goals:{short:[{id:'need-job',kind:'money',content:'需要工钱',progress:0}]}}}
 ]});
 assert.deepEqual(prepared.setupUnmet,[]);const f={engine,document:prepared.document};
 write(f,d=>{d.set(['state','minute'],1440);advanceLaborMarket(d,engine,{before:600,after:1440,id:'hire-real-workshop'});});
 const row=Object.values(f.document.state.records).find(r=>r.laborMarket===1&&r.owner===landlord&&r.recipe==='recipe_wooden_pegs');assert.ok(row);
 // 上午480..720为240分钟；午休720..780不计，全天总480分钟。
 write(f,d=>recordEmploymentAttendance(d,row.worker,row.starts,row.starts+240,row.location));
 assert.equal(f.document.state.records[row.id].attendance['1'],240);
 const half=structuredClone(f.document);
 const absent=applyIntentSetup(engine,half,{facts:[{path:['state','npcs',row.worker],value:{...half.state.npcs[row.worker],caring:{location:mill}}}]});assert.deepEqual(absent.setupUnmet,[]);f.document=absent.document;
 write(f,d=>recordEmploymentAttendance(d,row.worker,row.starts+300,row.starts+540,row.location));assert.equal(f.document.state.records[row.id].attendance['1'],240);
 // 罢工状态是本断言的输入；已量得的240不抹除，余下240不记入。
 const striking=applyIntentSetup(engine,half,{facts:[{path:['state','records',row.id],value:{...half.state.records[row.id],status:'罢工'}}]});assert.deepEqual(striking.setupUnmet,[]);f.document=striking.document;
 write(f,d=>recordEmploymentAttendance(d,row.worker,row.starts+300,row.starts+540,row.location));assert.equal(f.document.state.records[row.id].attendance['1'],240);
 clean(f);
});

test('business-cash: procurement, sale and refund use the real counter without purse copies',async()=>{
 const f=await counter();await f.open();const purse=f.document.state.player.coins;
 const trade=async(args,eventId)=>{const out=await f.engine.reduce(f.document,{tool:'world_trade',args,eventId});f.document=applyPatches(f.document,out.patches);return out.result;};
 const order=await trade({operation:'procure',business:f.business,seller:landlord,consent:true,item:'item_bread',quantity:2},'counter-procure');
 // 河湾面包2×本地稀缺下限.5=1铜，2份=2；100−2=98，钱袋不动。
 assert.equal(order.cost,2);assert.equal(account(f).coins,98);assert.equal(f.document.state.player.coins,purse);
 await trade({operation:'fulfill',business:f.business,seller:landlord,contract:order.contract},'counter-deliver');
 await f.act('core:settlement.business_open',{business:f.business},'counter-business-open');
 const sold=await trade({operation:'sell',business:f.business,buyer:landlord,consent:true,item:'item_bread',quantity:1},'counter-sale');
 assert.equal(sold.cost,1);assert.equal(account(f).coins,99);assert.equal(f.document.state.player.coins,purse);
 // 原生trade事件以买方为actor、卖方为target；卖方收据仍由玩家本人签发。
 assert.equal(f.document.state.records['world_event:counter-sale'].actor,landlord);
 const genuine=structuredClone(f.document),book=f.document.state.records['business_receipt_counter-sale'];
 const forged=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records','business_receipt_counter-sale'],value:{...book,trade:{...book.trade,cost:2}}}]});assert.deepEqual(forged.setupUnmet,[]);f.document=forged.document;
 const invalid=structuredClone(f.document);await assert.rejects(f.act('documents:issue',{source:'counter-sale',paper:'item_parchment',kind:'receipt'},'business-false-source'));assert.deepEqual(f.document,invalid);f.document=genuine;
 const issued=await f.act('documents:issue',{source:'counter-sale',paper:'item_parchment',kind:'receipt'},'business-original');
 const paper=f.document.state.itemInstances[issued.document];assert.equal(paper.document.issuer,'player');assert.equal(paper.document.describes,sold.contract);
 assert.equal(paper.document.sourceEvent,'world_event:counter-sale');assert.equal(paper.document.namedHolder,landlord);
 const beforeDuplicate=structuredClone(f.document);await assert.rejects(f.act('documents:issue',{source:'counter-sale',paper:'item_parchment',kind:'receipt'},'business-duplicate'));assert.deepEqual(f.document,beforeDuplicate);
 // 退款不是卖方饮食保留测试；声明其另有足够现存面包，保留实物实例与来源。
 const vendor=f.document.state.npcs[landlord],restocked=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','npcs',landlord],value:{...vendor,inventory:{...vendor.inventory,item_bread:{...vendor.inventory.item_bread,quantity:20}}}}]});assert.deepEqual(restocked.setupUnmet,[]);f.document=restocked.document;
 const pending=await trade({operation:'procure',business:f.business,seller:landlord,consent:true,item:'item_bread',quantity:2},'counter-pending');
 assert.equal(account(f).coins,97);
 await trade({operation:'cancel',business:f.business,contract:pending.contract},'counter-refund');assert.equal(account(f).coins,99);assert.equal(f.document.state.player.coins,purse);
 await f.act('business:fund_counter',{coins:10},'counter-topup');assert.equal(account(f).coins,109);assert.equal(f.document.state.player.coins,purse-10);
 const report=await f.act('core:settlement.business_report',{business:f.business},'counter-book');
 assert.equal(report.cash.closing,109);assert.equal(report.cash.reconciled,true);
 for(const row of report.cash.sources)assert.ok(row.source);
 clean(f);
});

test('subjective-options: only own counter and remembered market inputs affect candidates',async()=>{
 const f=await counter();await f.open();
 // 饮食库存是非考查前提：只留5份面包，排除开局其他替代粮食的可售余量。
 const bags=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','inventory'],value:{item_bread:{quantity:5},item_parchment:{quantity:1}}}]});assert.deepEqual(bags.setupUnmet,[]);f.document=bags.document;
 const before=structuredClone(f.document),first=businessOptions(f.engine,f.document,'player');
 assert.equal(first.counterCash,100);assert.deepEqual(f.document,before);
 // world_act saves its ordinary receipt; the underlying projection is read-only.
 const routed=await f.act('business:options',{business:f.business},'options-first');assert.deepEqual(routed.options,first.options);assert.equal(account(f).coins,100);assert.equal(f.document.state.minute,before.state.minute);
 const prepared=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','npcs',landlord],value:{...f.document.state.npcs[landlord],coins:999999,inventory:{item_bread:{quantity:10000}}}}]});assert.deepEqual(prepared.setupUnmet,[]);f.document=prepared.document;
 const hidden=await f.act('business:options',{business:f.business},'options-hidden');assert.deepEqual(hidden.options,first.options);
 const records={...f.document.state.records,market_belief:{category:'knowledge',observer:'player',kind:'belief',proposition:`market:${place}:item_bread`,value:{unitPrice:4},sourceEvent:'market-belief',minute:f.document.state.minute}};
 const known=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records'],value:records}]});assert.deepEqual(known.setupUnmet,[]);f.document=known.document;
 const changed=await f.act('business:options',{business:f.business},'options-belief');
 // 无观察时按目录先验估价；收到的市价已经包含供需。
 const price=rows=>rows.options.find(r=>r.kind==='price'&&r.item==='item_bread');
 // K08：无观察时仍以目录2×主观稀缺3=6估价；已知市价4已含稀缺，不能再乘3。
 assert.equal(price(first).unitPrice,6);assert.equal(price(changed).unitPrice,4);assert.equal(price(changed).knownFrom,'market-belief');
 clean(f);
});

test('orders: native procurement orders compete for the same ten real units',async()=>{
 const f=await counter();await f.open();
 const stock=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','npcs',landlord],value:{...f.document.state.npcs[landlord],inventory:{item_wood:{quantity:10}}}}]});assert.deepEqual(stock.setupUnmet,[]);f.document=stock.document;
 const trade=async(args,eventId)=>{const out=await f.engine.reduce(f.document,{tool:'world_trade',args,eventId});f.document=applyPatches(f.document,out.patches);return out.result;};
 const args={operation:'procure',business:f.business,seller:landlord,consent:true,item:'item_wood'};
 const first=await trade({...args,quantity:6},'order-six'),before=structuredClone(f.document);
 // 库存10，第一单承诺6后只余4；第二单5不得挤占。失败不产生合同或现金变化。
 await assert.rejects(trade({...args,quantity:5},'order-five'),/库存不足/);assert.deepEqual(f.document,before);
 const second=await trade({...args,quantity:4},'order-four');
 await trade({operation:'fulfill',business:f.business,contract:first.contract},'deliver-six');
 await trade({operation:'fulfill',business:f.business,contract:second.contract},'deliver-four');
 assert.equal(f.document.state.npcs[landlord].inventory.item_wood?.quantity??0,0);
 assert.equal(f.document.state.records[first.contract].fulfilled,6);assert.equal(f.document.state.records[second.contract].fulfilled,4);clean(f);
});

test('counter-tax: sale tax is paid once, internal funding is not another sale',async()=>{
 const f=await counter();await f.open();
 const setup=applyIntentSetup(f.engine,f.document,{inventory:{item_wood:100},facts:[{path:['state','npcs',landlord,'coins'],value:1000}]});assert.deepEqual(setup.setupUnmet,[]);f.document=setup.document;
 await f.act('core:settlement.business_open',{business:f.business},'tax-shop-open');
 const purse=f.document.state.player.coins,treasury=f.document.ledger.accounts['loc_hw|coin_river|treasury']??0;
 const out=await f.engine.reduce(f.document,{tool:'world_trade',args:{operation:'sell',business:f.business,buyer:landlord,consent:true,item:'item_wood',quantity:50,unitPrice:2},eventId:'counter-tax-sale'});f.document=applyPatches(f.document,out.patches);
 // 木料4×稀缺下限.5=2，50×约定单价2=100；王国村级500bps => floor(100×500/10000)=5。
 assert.equal(out.result.cost,100);assert.equal(account(f).coins,195);assert.equal(f.document.state.player.coins,purse);
 assert.equal(f.document.ledger.accounts['loc_hw|coin_river|treasury'],treasury+5);
 assert.equal(f.document.state.records['trade_tax:counter-tax-sale:commercial'].amount,5);
 await f.act('business:fund_counter',{coins:10},'non-taxable-capital');assert.equal(account(f).coins,205);assert.equal(f.document.state.player.coins,purse-10);
 assert.equal(Object.values(f.document.state.records).filter(r=>r.category==='trade_tax').length,1);clean(f);
});

test('estate-refund: pending operating escrow returns to the current estate counter',async()=>{
 const f=await counter();await f.open();
 const prepared=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','npcs',landlord],value:{...f.document.state.npcs[landlord],inventory:{item_wood:{quantity:10}}}}]});assert.deepEqual(prepared.setupUnmet,[]);f.document=prepared.document;
 const out=await f.engine.reduce(f.document,{tool:'world_trade',args:{operation:'procure',business:f.business,seller:landlord,consent:true,item:'item_wood',quantity:5,unitPrice:2,deadline:f.document.state.minute+20},eventId:'estate-pending'});f.document=applyPatches(f.document,out.patches);
 // 5×2=10进托管，柜台100−10=90；死亡后到期退款只能回遗产柜台。
 assert.equal(account(f).coins,90);
 const gone=write(f,d=>transition(d,f.engine,{entity:'player',basis:'death',origin:'death_rule',eventId:'pending-owner-death',successors:[landlord]}));
 write(f,d=>advanceContracts(d,f.engine,626,[out.result.contract]));
 assert.equal(account(f).coins,0);assert.equal(dedicatedCoinAccount(f.document.state,gone.successor,'counter').coins,100);
 assert.equal(f.document.state.records[out.result.contract].escrow,0);clean(f);
});

test('books: capital is not revenue, personal trades and taxes stay out, closing keeps the debt (F025)',async()=>{
 const f=await counter({credit:true});await f.open();
 const trade=async(args,eventId)=>{const out=await f.engine.reduce(f.document,{tool:'world_trade',args,eventId});f.document=applyPatches(f.document,out.patches);return out.result;};
 // 个人前提（非考查对象）：行囊里另有木料50，用于一次与店铺无关的私人买卖。
 const stocked=applyIntentSetup(f.engine,f.document,{inventory:{item_bread:5,item_wood:50,item_parchment:1},facts:[{path:['state','npcs',landlord,'coins'],value:1000}]});assert.deepEqual(stocked.setupUnmet,[]);f.document=stocked.document;
 await f.act('core:settlement.business_open',{business:f.business},'books-open');
 const sale=await trade({operation:'sell',business:f.business,buyer:landlord,consent:true,item:'item_bread',quantity:1,unitPrice:2},'books-sale');
 const report=async id=>f.act('core:settlement.business_report',{business:f.business},id);
 const first=await report('books-r1');
 // 营业收入只有这一笔成交：1份面包×约定单价2 = 2铜；柜台开户的100铜是资本，不是收入。
 assert.equal(first.profit.revenue,2);assert.equal(first.cash.capital,100);
 // 注资10铜：现金多10、资本多10，营业收入与利润分毫不变（注资不计收入）。
 await f.act('business:fund_counter',{coins:10},'books-capital');
 const second=await report('books-r2');
 assert.equal(second.cash.closing,first.cash.closing+10);assert.equal(second.cash.capital,110);
 assert.equal(second.profit.revenue,2);assert.equal(second.profit.net,first.profit.net);assert.equal(second.cash.reconciled,true);
 // 取出5铜给自己：同样不是费用，利润不变，资本记为105。
 await f.act('business:spend_counter',{to:'player',coins:5},'books-draw');
 const drawn=await report('books-r3');assert.equal(drawn.cash.capital,105);assert.equal(drawn.profit.net,first.profit.net);
 // 与本店无关的个人木料交易仍走房东的市场收购渠道；E6不把私人50木料算公开供给，原10份超单笔深度。
 // 改为零售阈值内5份×合法单价2=10铜；不增库存，原“营业收入、利润、税额不变”的断言全部保留。
 await trade({operation:'trade',buyer:landlord,seller:'player',item:'item_wood',quantity:5,unitPrice:2},'books-private');
 // 同期另有一笔与本店无关的个人商税记录（非考查前提，声明为事实）：店铺税项只算本店成交所生的税。
 const foreign=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records'],value:{...f.document.state.records,'trade_tax:elsewhere:commercial':{category:'trade_tax',id:'trade_tax:elsewhere:commercial',payer:'player',gross:140,location:place,amount:7,sourceEvent:'elsewhere',minute:f.document.state.minute}}}]});
 assert.deepEqual(foreign.setupUnmet,[]);f.document=foreign.document;
 const personal=await report('books-r4');
 assert.equal(personal.profit.taxes,first.profit.taxes);assert.equal(personal.profit.revenue,2);assert.equal(personal.profit.net,first.profit.net);
 clean(f);
});

test('books: closing the shop keeps its unpaid debt and the counter cash (F025)',async()=>{
 const f=await counter({credit:true});
 // 夹具已现金租下一间铺子；先结束它，再赊租新的（同一时间只允许一间营业铺）。
 await f.act('core:settlement.business_close',{business:f.business},'books-first-close');
 // 赊租：租金向房东借，欠款是一笔真实债务。
 const out=await f.engine.reduce(f.document,{tool:'world_trade',args:{operation:'lease',seller:landlord,consent:true,days:1,payment:'credit',creditMinutes:120},eventId:'books-credit-lease'});
 f.document=applyPatches(f.document,out.patches);f.business=out.result.business;
 await f.open();const debt=out.result.debt;
 assert.ok(debt);
 await f.act('core:settlement.business_open',{business:f.business},'books-credit-open');
 await f.act('core:settlement.business_close',{business:f.business},'books-credit-close');
 const row=f.document.state.records[f.business];
 assert.equal(row.status,'停业');
 // 关店不是还债：债仍在、金额不变；柜台100铜仍在原账户，没有被并回钱袋或用来悄悄抵债。
 assert.equal(obligationView(f.document.state,debt).paid,0);assert.equal(obligationView(f.document.state,debt).owed>0,true);
 assert.equal(account(f).coins,100);
 const report=await f.act('core:settlement.business_report',{business:f.business},'books-credit-report');
 assert.equal(report.debts[0].amount,obligationView(f.document.state,debt).owed);assert.equal(report.status,'停业');
 clean(f);
});

async function hiredOnProject(){
 const engine=new WorldEngine(world),initial=engine.createCharacter(seed,{},'attendance2'),mill='bld_hw_mill',worker='npc_hw_ayan';
 // 前提（非考查对象）：林穗在磨坊有一项缺人的工程，雇主有钱，阿燕缺钱求活计；谁应聘由生产招工系统在午夜按各人自己的需要与意愿选出。
 const prepared=applyIntentSetup(engine,initial,{minute:600,location:mill,present:[landlord,worker],facts:[
  {path:['state','projects'],value:{...initial.state.projects,proj_x:{id:'proj_x',type:'工程',name:'磨坊加固',status:'施工中',creator:landlord,settlement:'loc_hw',location:mill,remainingDays:10,remainingWork:10,days:10}}},
  {path:['state','npcs',landlord],value:{...initial.state.npcs[landlord],location:mill,coins:5000}},
  {path:['state','npcs',worker],value:{...initial.state.npcs[worker],location:mill,coins:0,goals:{short:[{id:'need-job',kind:'money',content:'需要工钱',progress:0}]}}}
 ]});
 assert.deepEqual(prepared.setupUnmet,[]);
 const f={engine,document:prepared.document,worker,mill};
 f.time=async(minutes,id)=>{const out=await engine.reduce(f.document,{tool:'world_time',args:{minutes},eventId:id});f.document=applyPatches(f.document,out.patches);};
 await f.time(1440-600,'to-midnight');
 f.row=Object.values(f.document.state.records).find(r=>r.laborMarket===1&&r.owner===landlord&&r.project==='proj_x');
 f.worker=f.row.worker;
 return f;
}

test('real attendance: wage and progress follow the minutes actually at work (2 hours late, one day absent)',async()=>{
 const f=await hiredOnProject(),id=f.row.id,rec=()=>f.document.state.records[id];
 assert.ok(f.row);
 // 签约是阿燕自己经 npcDecision 做的决定，留有来源；签约工价是第0阶日薪 (20+40)/2 = 30。
 assert.equal(f.row.workerConsent.by,f.worker);assert.equal(f.row.workerConsent.via,'npc-decision');assert.equal(f.row.workerConsent.outcome,'agree');
 assert.equal(f.row.wage,30);assert.equal(f.row.starts,1920);
 // 首日往返各5分钟，到岗470分钟；ceil(30×470/480)=30铜。
 await f.time(1440,'day1');
 const home=engine0(f).byId.get(f.worker).home.location,m1=rec().attendance['1'];
 // K04/K08 同一工时预算扣往返：路网单程5分钟，480−2×5=470；旧475漏返程。
 assert.equal(m1,480-2*f.engine.route(home,f.mill,'walk',1920,f.document.randomSeed).minutes);
 assert.equal(rec().workedMinutes,m1);assert.equal(rec().paid,Math.ceil(30*m1/480));assert.equal(rec().paid,30);
 // ?2?????120?????120+240???5=355???
 const midnight=2*1440;
 const walking=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','npcs',f.worker],value:{...f.document.state.npcs[f.worker],location:null,activity:'赶路',scheduleTravel:{from:home,to:f.mill,depart:midnight+480,arrive:midnight+600,edges:[]}}}]});
 assert.deepEqual(walking.setupUnmet,[]);f.document=walking.document;
 await f.time(1440,'day2');
 // 迟到后的120+240分钟仍须扣返程5分钟：355；去程120已由实际在途状态扣除。
 const m2=360-f.engine.route(f.mill,home,'walk',midnight+1020,f.document.randomSeed).minutes;
 assert.equal(rec().attendance['2'],m2);assert.equal(m2,355);
 // ??470+355=825?????ceil(30?825/480)=52???????60???
 assert.equal(rec().workedMinutes,m1+m2);assert.equal(rec().paid,Math.ceil(30*(m1+m2)/480));
 // 第3日整天缺勤：没有任何到岗分钟，没有工资、没有进度，合同照常有效。
 f.document.state.npcs[f.worker].status='患病';
 const sick={paid:rec().paid,worked:rec().workedMinutes,remaining:f.document.state.projects.proj_x.remainingWork};
 await f.time(1440,'day3');
 assert.equal(rec().attendance['3'],undefined);assert.equal(rec().paid,sick.paid);assert.equal(rec().workedMinutes,sick.worked);
 assert.equal(f.document.state.projects.proj_x.remainingWork,sick.remaining);
 // ??????825???10?825/480=8.28125??????????????
 assert.ok(Math.abs(sick.remaining-(10-(m1+m2)/480))<1e-9);
 clean(f);
});
const engine0=f=>f.engine;

test('npc decision: the worker, not the caller, decides to take a job; a red line refuses it',async()=>{
 const mill='bld_hw_mill',worker='npc_hw_ayan';
 const hire=async refusing=>{
  const w=structuredClone(world);if(refusing)w.npcs.find(n=>n.id===refusing).redLines=['employment'];
  const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'attendance2');
  const prepared=applyIntentSetup(engine,initial,{minute:600,location:mill,present:[landlord,worker],facts:[
   {path:['state','projects'],value:{...initial.state.projects,proj_x:{id:'proj_x',type:'工程',name:'磨坊加固',status:'施工中',creator:landlord,settlement:'loc_hw',location:mill,remainingDays:10,remainingWork:10,days:10}}},
   {path:['state','npcs',landlord],value:{...initial.state.npcs[landlord],location:mill,coins:5000}},
   {path:['state','npcs',worker],value:{...initial.state.npcs[worker],location:mill,coins:0,goals:{short:[{id:'need-job',kind:'money',content:'需要工钱',progress:0}]}}}
  ]});
  assert.deepEqual(prepared.setupUnmet,[]);let document=prepared.document;
  const out=await engine.reduce(document,{tool:'world_time',args:{minutes:1440-600},eventId:'decide'});document=applyPatches(document,out.patches);
  return Object.values(document.state.records).find(r=>r.laborMarket===1&&r.owner===landlord&&r.project==='proj_x');
 };
 const taken=await hire(null);assert.ok(taken);assert.equal(taken.workerConsent.outcome,'agree');
 // 同一世界、同一雇主和工价，只是被选中的这位的底线写着不接这类活计（kind 'employment'）：他自己拒绝，
 // 轮到下一位应聘者（或无人接），没有人能替他签字。
 const refused=await hire(taken.worker);
 assert.notEqual(refused?.worker,taken.worker);
});

test('draft animals: labor minutes are derived from the herd the owner holds, and fall when heads are lost',async()=>{
 // 物种数据里目前没有役畜；这里只在测试世界副本上给山羊群声明 labor（因子0.5、每日8小时），验证派生公式。
 const w=structuredClone(world);w.monsters.find(m=>m.id==='monster_bent_horn_goat').husbandry.labor={factor:0.5,hoursPerDay:8};
 const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'draft-labor');
 const out=await engine.reduce(doc,{tool:'world_time',args:{minutes:1440},eventId:'herd-day'});const day=applyPatches(doc,out.patches);
 const herd=Object.values(day.state.records).find(r=>r.category==='husbandry'&&r.species==='monster_bent_horn_goat');
 assert.ok(herd);const owner=herd.owner;assert.ok(owner);
 // 每日 floor(头数 × 0.5 × 8小时 × 60) = floor(头数×240) 分钟；头数按现存计，死亡或转手立即改变。
 assert.equal(draftMinutes(engine,day.state,owner),Math.floor(herd.count*240));
 assert.equal(draftMinutes(engine,day.state,owner),herd.count*240);
 const key=Object.keys(day.state.records).find(k=>day.state.records[k]===herd||day.state.records[k].id===herd.id&&day.state.records[k].category==='husbandry');
 const fewer=structuredClone(day.state);fewer.records[key].count=herd.count-1;
 assert.equal(draftMinutes(engine,fewer,owner),(herd.count-1)*240);
 const sold=structuredClone(day.state);sold.records[key].owner=landlord;
 assert.equal(draftMinutes(engine,sold,owner),0);
 // S5-04 W2b：弯角野山羊的役力已按审批管线写入世界数据（因子0.25、每日6小时）；本断言原为“现有世界数据没有任何役畜 => 0”，
 // 设计依据：05 §5.1 laborHours 只来自物种数据声明。仍未声明 labor 的物种（雉禽）单独仍不提供工时；山羊群按声明提供每头 0.25×6×60=90 分钟。
 const noGoats=structuredClone(day.state);for(const key of Object.keys(noGoats.records))if(noGoats.records[key].category==='husbandry'&&noGoats.records[key].species==='monster_bent_horn_goat')delete noGoats.records[key];
 assert.equal(draftMinutes(new WorldEngine(world),noGoats,owner),0);
 assert.equal(draftMinutes(new WorldEngine(world),day.state,owner),herd.count*90);
});
