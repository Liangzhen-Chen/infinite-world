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
 const d=f.draft(),row={id:'unpaid-real-work',owner:host,worker,wage:480,escrow:0};
 // Emptying the payer after the work was earned cannot turn a claim into cash.
 const cash=f.doc.state.npcs[host].coins;if(cash)financeTransfer(d,f.e,host,'player',cash,'withdraw');
 const money=d.get('state','npcs',worker,'coins'),pay=settleEmploymentPay(d,f.e,row,d.get('state','minute'),30);d.done();
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

test('统计组用相同材料、工具与工位生产；售前不增现金、不把营业额当工资',async()=>{
 const opening=workshop(),world=structuredClone(opening.w);
 const merchant=world.npcs.find(n=>n.id===host);merchant.inventory=structuredClone(opening.doc.state.npcs[host].inventory);merchant.coins=1000;merchant.location=mill;
 const f=await incomeFixture(world),e=f.engine;
 await f.act({tool:'world_move',args:{destination:mill},eventId:'arrive-for-inputs'});
 await f.act({tool:'world_trade',args:{seller:host,item:'item_wood',quantity:1},eventId:'buy-material'});
 await f.act({tool:'world_trade',args:{seller:host,item:'item_whittling_knife',quantity:1},eventId:'buy-tool'});
 const d=e.primitiveDraft(f.document);
 const groups=ensureStatisticalFoodAccounts(d,e),group=groups.find(r=>r.workCapacity>0),scoped=statisticalFoodEngine(e,d.get('state'));
 // The inputs were purchased above. Assignment and sale below use the same
 // native stock/finance writers as I3's counter/market callers.
 const knife='item_whittling_knife';
 const inputs=[['item_wood',1],[knife,1]];
 for(const [item,n]of inputs)transferItems(d,scoped,'player',group.owner,item,n);
 const place=e.byId.get(SID),old=place.workstations;
 place.workstations=[...old??[],{id:'town-work-test-bench',kind:'woodworking',access:'public',owner:group.owner,fee:0}];
 const coins=d.get('state','records',group.owner,'coins');
 const made=produceTownWork(d,e,{worker:group.owner,recipe,location:SID,minutes:60,maximum:1,source:'statistical-self'});
 assert.equal(made.batches,1,JSON.stringify(made));assert.equal(d.get('state','records',group.owner,'coins'),coins);
 assert.equal(scoped.quantity(d,group.owner,item),made.quantity);
 const wage=d.get('state','records',group.owner,'labor','earned');
 financeTransfer(d,scoped,host,group.owner,4,'native-sale');transferItems(d,scoped,group.owner,host,item,1);
 recordFinanceSale(d,scoped,{buyer:host,seller:group.owner,item,quantity:1,cost:4,eventId:'native-sale'});
 assert.equal(d.get('state','records',group.owner,'coins'),coins+4);
 assert.equal(d.get('state','records',group.owner,'labor','earned'),wage);
 assert.equal(d.get('state','records',`finance_profit:${group.owner}`,'entries')[0].revenue,4);
 // Missing prerequisites are checked identically; no synthetic service wage.
 const other=groups.find(r=>r.owner!==group.owner&&r.workCapacity>0);
 assert.ok(produceTownWork(d,e,{worker:other.owner,recipe,location:SID,minutes:60,source:'empty-group'}).reason);
 assert.equal(d.get('state','records',other.owner,'labor','earned'),0);
 assert.deepEqual(auditLedger(d.document.ledger),[]);place.workstations=old;
});
