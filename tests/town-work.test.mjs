import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,host,worker,DAY} from './helpers/finance.mjs';
import {laborOffers,laborApplication,advanceLaborMarket,settleEmploymentPay} from '../server-plugin/labor-market.mjs';
import {townWorkMinutes,recordTownWork,produceTownWork} from '../server-plugin/town-work.mjs';
import {ensureStatisticalFoodAccounts,statisticalFoodEngine} from '../server-plugin/household-budget.mjs';
import {financeTransfer} from '../server-plugin/finance-bank.mjs';
import {transferItems} from '../server-plugin/items.mjs';
import {recordFinanceSale,employmentProductionPlan} from '../server-plugin/finance-assets.mjs';
import {incomeFixture,SID} from './helpers/town-income.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {counterCash,payFromCounter} from '../server-plugin/money.mjs';
import {purchaseStatisticalInputs} from '../server-plugin/business.mjs';

const mill='bld_hw_mill',recipe='recipe_wooden_pegs',item='item_wooden_peg';
function workshop(){
 const f=fixture({at:mill});
 f.doc.state.inventory={item_bread:{quantity:5}};
 // Finite opening stock in this scenario. The player creates the vacancy by
 // buying the shelf empty, rather than inserting an order/attendance record.
 f.doc.state.npcs[host].coins=1000;
 f.doc.state.npcs[host].inventory={item_wood:{quantity:20},item_whittling_knife:{quantity:1,durability:100},[item]:{quantity:4}};
 f.doc.state.npcs[worker].coins=0;
 f.doc.state.npcs[worker].proficiencies={skill_life_6_core:600};
 f.w.households.find(h=>h.members.includes(worker)).homeLocation=mill;
 f.e.byId.get(mill).workstations.find(s=>s.kind==='woodworking').fee=0;
 // This scenario's shelf normally awaits an actual out-of-town consignment;
 // midnight restocking cannot manufacture a replacement for the vacancy.
 f.e.byId.get(item).origin=SID;
 f.e.rules.economy.shops.stores.find(s=>s.keeper===host).restock.push({item,source:'route',from:SID,amount:4,maximum:4});
 return f;
}
const quantity=(f,id,item)=>f.e.quantity(f.draft(),id,item);

test('真实买空货架才有补货需求；缺料、缺工具、缺钱不会产生收入',async()=>{
 const f=workshop();
 assert.equal(laborOffers(f.e,f.doc.state).some(o=>o.item===item),false);
 await f.act({seller:host,item,quantity:4},'empty-shelf');
 const offer=laborOffers(f.e,f.doc.state).find(o=>o.item===item);assert.ok(offer);
 const before=f.doc.state.npcs[worker].coins;
 for(const [field,value]of [['item_wood',{quantity:0}],['item_whittling_knife',{quantity:0,durability:100}]]){
  const old=f.doc.state.npcs[host].inventory[field];f.doc.state.npcs[host].inventory[field]=value;
  const d=f.draft(),made=employmentProductionPlan(d,f.e,{owner:host,worker,recipe,location:mill});d.done();
  assert.match(made.reason,field==='item_wood'?/材料/:/工具/);assert.equal(f.doc.state.npcs[worker].coins,before);
  f.doc.state.npcs[host].inventory[field]=old;
 }
 f.doc.state.npcs[host].coins=0;
 assert.equal(laborOffers(f.e,f.doc.state).some(o=>o.item===item),false);
});

test('补货招工选择有权使用且付得起的工位；无可用工位就不招工',async()=>{
 const f=workshop();await f.act({seller:host,item,quantity:4},'site-demand');
 assert.equal(laborOffers(f.e,f.doc.state).find(o=>o.item===item)?.location,mill);
 const stations=f.w.locations.flatMap(p=>p.workstations??[]).filter(s=>s.kind==='woodworking');
 for(const station of stations){station.access='private';station.owner=worker;}
 assert.equal(laborOffers(f.e,f.doc.state).some(o=>o.item===item),false);
 const station=f.e.byId.get(mill).workstations.find(s=>s.kind==='woodworking');
 station.access='public';station.fee=10000;
 // 1000 cash cannot cover a 10000 fee and a positive daily wage.
 assert.equal(laborOffers(f.e,f.doc.state).some(o=>o.item===item),false);
 station.owner=host;station.access='private';
 assert.equal(laborOffers(f.e,f.doc.state).find(o=>o.item===item)?.location,mill);
});

test('拒工保留本人选择；真实招工签约、到岗后才付工钱，欠薪是债权',async()=>{
 const f=workshop();await f.act({seller:host,item,quantity:4},'demand');
 const offer=laborOffers(f.e,f.doc.state).find(o=>o.item===item);
 f.doc.state.npcs[worker].caring={location:mill};assert.equal(laborApplication(f.e,f.doc.state,worker,offer),null);delete f.doc.state.npcs[worker].caring;
 // Signing and attendance go through the normal scheduler.
 await f.act({minutes:DAY},'hire','world_time');
 const job=Object.values(f.doc.state.records).find(r=>r.laborMarket===1&&r.worker===worker);
 assert.ok(job);assert.equal(job.workerConsent.via,'npc-decision');assert.equal(job.paid,0);
 await f.act({minutes:Math.max(1,job.nextWork-f.doc.state.minute)},'attend','world_time');
 const worked=f.doc.state.records[job.id];assert.ok(worked.workedMinutes>0);assert.ok(worked.paid>0);
 // The contract comes from real signing and attendance (wage 30/min, 17 min already paid). Another 480 min = 14400 units = 30 coins earned.
 const d=f.draft(),row=structuredClone(f.doc.state.records[job.id]);
 // Emptying the payer after the work was earned cannot turn a claim into cash.
 const cash=f.doc.state.npcs[host].coins;if(cash)financeTransfer(d,f.e,host,'player',cash,'withdraw');
 // A business pays wages from its counter too, so the sales proceeds are emptied as well.
 const till=counterCash(d,host);if(till)payFromCounter(d,f.e,{owner:host,to:'player',amount:till,writer:'labor-market',eventId:'empty-counter'});
 const money=d.get('state','npcs',worker,'coins'),pay=settleEmploymentPay(d,f.e,row,d.get("state","minute")+1,480);d.done();
 assert.equal(pay.paid,0);assert.equal(pay.arrears,30);assert.equal(f.doc.state.npcs[worker].coins,money);
 assert.ok(Object.values(f.doc.state.records).some(r=>r.kind==='wage'&&r.contract===row.id));
});

test('自营只消耗自有材料，成品留给本人；真实售出才有营业收入',async()=>{
 const f=workshop();
 await f.act({seller:host,item:'item_wood',quantity:1},'self-buy-material');
 await f.act({seller:host,item:'item_whittling_knife',quantity:1},'self-buy-tool');
 const d=f.draft();
 // The authored teacher knows this recipe. Materials/tools are transferred
 // with the normal writer; a shopkeeper's occupation cannot grant knowledge.
 transferItems(d,f.e,'player',worker,'item_wood',1);transferItems(d,f.e,'player',worker,'item_whittling_knife',1);
 const cash=d.get('state','npcs',worker,'coins');
 const made=produceTownWork(d,f.e,{worker,recipe,location:mill,minutes:60,maximum:1,source:'own-batch'});d.done();
 assert.equal(made.batches,1);assert.equal(f.doc.state.npcs[worker].coins,cash);
 assert.equal(quantity(f,worker,'item_wood'),0);assert.equal(quantity(f,worker,item),made.quantity);
 assert.equal(f.doc.state.records[`finance_profit:${worker}`],undefined);
 await f.act({seller:worker,item,quantity:1},'real-sale');
 const profit=f.doc.state.records[`finance_profit:${worker}`];assert.equal(profit.entries.length,1);assert.ok(profit.entries[0].revenue>0);
 assert.equal(f.doc.state.records[`town-work:${worker}`].sources.employment,undefined);
});

test('生产、服务、做饭共用日预算；跨日只释放新一天，重复来源不能再占工时',()=>{
 const f=workshop(),at=f.doc.state.minute,available=townWorkMinutes(f.e,f.doc.state,host),d=f.draft();
 const self=recordTownWork(d,f.e,{worker:host,minutes:60,kind:'self',source:'self'});
 recordTownWork(d,f.e,{worker:host,minutes:30,kind:'cooking',source:'meal'});
 recordTownWork(d,f.e,{worker:host,minutes:available-90,kind:'service',source:'project'});
 assert.equal(townWorkMinutes(f.e,d.get('state'),host),0);
 assert.deepEqual(recordTownWork(d,f.e,{worker:host,minutes:60,kind:'self',source:'self'}),self);
 assert.throws(()=>recordTownWork(d,f.e,{worker:host,minutes:1,kind:'service',source:'extra'}),/工时不足/);
 d.set(['state','minute'],at+DAY);assert.ok(townWorkMinutes(f.e,d.get('state'),host)>0);
 recordTownWork(d,f.e,{worker:host,minutes:20,kind:'self',source:'tomorrow'});
 assert.throws(()=>recordTownWork(d,f.e,{worker:host,minute:at,minutes:1,kind:'service',source:'past'}),/回头/);d.done();
});

test('统计组用相同材料、工具与工位生产；正式世界缺货源与工位时不采购、不生产、钱不变',async()=>{
 // Official world only. Neither a loc_bs shop sells wood/whittling knife
 // (only household wood in a few homes, no knife anywhere in the settlement)
 // nor does loc_bs have a woodworking station (the only one is bld_hw_mill in
 // loc_hw). So hand-computed expectation: no purchase, no batch, coins unchanged.
 // Missing content for I3 / the content pipeline: loc_bs wood+knife supply and a loc_bs workstation.
 const f=await incomeFixture(),e=f.engine;
 const d=e.primitiveDraft(f.document);
 const groups=ensureStatisticalFoodAccounts(d,e),group=groups.find(r=>r.workCapacity>0);
 const coins=d.get('state','records',group.owner,'coins'),used=d.get('state','records',group.owner,'labor','usedMinutes');
 assert.deepEqual(purchaseStatisticalInputs(d,e,{buyer:group.owner,items:{item_wood:1,item_whittling_knife:1},source:'own-peg-inputs'}),[]);
 const made=produceTownWork(d,e,{worker:group.owner,recipe,location:SID,minutes:60,maximum:1,source:'statistical-self'});
 assert.ok(made.reason,JSON.stringify(made));assert.ok(!made.batches);
 assert.equal(d.get('state','records',group.owner,'coins'),coins);assert.equal(d.get('state','records',group.owner,'labor','usedMinutes'),used);
 assert.equal(d.get('state','records',group.owner,'labor','earned'),0);
 assert.deepEqual(auditLedger(d.document.ledger),[]);
});

test('统计组投入采购走真实开张的店，但不写当日顾客流的“已服务”标记',async()=>{
 // Official shop_bs_yanzhe (loc_bs) lists item_clay_cup. Hand check: one cup is bought for the shelf price; the group's coins fall by that
 // amount plus travel, the cup is in its stock, and serve()'s per-day key customer_flow:<shop>:<day> stays unwritten so that day's customers still come.
 const f=await incomeFixture(),e=f.engine,d=e.primitiveDraft(f.document);
 const group=ensureStatisticalFoodAccounts(d,e).find(r=>r.workCapacity>0),scoped=statisticalFoodEngine(e,d.get('state'));
 const minute=Math.floor(d.get('state','minute')/DAY)*DAY+14*60,coins=d.get('state','records',group.owner,'coins');
 const visits=purchaseStatisticalInputs(d,e,{buyer:group.owner,items:{item_clay_cup:1},minute,source:'mechanism'});
 assert.equal(visits.length,1);assert.equal(visits[0].item,'item_clay_cup');
 assert.ok(d.get('state','records',group.owner,'coins')<coins);assert.equal(scoped.quantity(d,group.owner,'item_clay_cup'),1);
 const day=Math.floor(minute/DAY);
 assert.equal(d.get('state','records',`customer_flow:shop_bs_yanzhe:${day}`),undefined);
 assert.equal(d.get('state','records',`customer_flow:shop_bs_yanzhe:${day}:inputs:mechanism`).visits.length,1);
 assert.deepEqual(auditLedger(d.document.ledger),[]);
});
