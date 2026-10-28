import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,worker,host,inn,post,DAY} from './helpers/finance.mjs';
import {workshopStorage} from '../server-plugin/finance-assets.mjs';
import {premisesInventory,premisesStock} from '../server-plugin/stock.mjs';
import {withLedger} from '../server-plugin/ledger.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {reconcile,conservation} from './helpers/ledger-audit.mjs';
import {leaseState} from '../server-plugin/contract-state.mjs';
import {characterUiSession} from './helpers/ui-script.mjs';
import {personOffices,settlementGovernment} from '../server-plugin/entity-view.mjs';

const location='bld_hw_mill',item='item_wood';
async function councilSession(t,seed){
 const ui=await characterUiSession(t,{seed});
 const wait=await ui.choose('time',{until:{dayOffset:1,hour:9}});assert.equal(wait.ok,true,wait.error);
 const move=await ui.choose('move',{destination:'bld_hw_council'},{target:'bld_hw_council'});assert.equal(move.ok,true,move.error);
 return ui;
}
test('陌生承租人的延期报价可被拒绝，回执说明现付且不留下延期债',async t=>{
 const ui=await councilSession(t,'w8e8-rent-cash-fallback'),before=await ui.read();
 const out=await ui.choose('trade.rent_in',{location:'loc_hw_fields',days:7,deadline:before.state.minute+6*DAY});
 assert.equal(out.ok,true,out.error);assert.ok(out.result.deferredRefusal);
 assert.match(out.result.notePayment,/改为现付/);
 // Same unchanged seven-day tariff: ceil(140*7/30)=33, not free credit.
 assert.equal(out.result.paid,33);assert.equal(out.result.rentDueAt,undefined);
 const after=await ui.read();assert.equal(before.state.player.coins-after.state.player.coins,33);
 assert.equal(after.state.records[out.result.contract].clauses.rentDueAt,undefined);
 assert.equal(Object.values(after.state.obligations).filter(o=>o.contract===out.result.contract).length,0);
});
test('首领真实接受延期报价后形成应付，菜单清偿只进公库',async t=>{
 const ui=await councilSession(t,'w8e8-rent-deferred'),before=await ui.read(),due=before.state.minute+6*DAY;
 // An allowed higher monthly quote compensates credit risk; no trust edits.
 // Seven days at 210/month: ceil(210*7/30)=49 owed, zero cash at signing.
 const out=await ui.choose('trade.rent_in',{location:'loc_hw_fields',coins:210,days:7,deadline:due});
 assert.equal(out.ok,true,out.error);assert.equal(out.result.paid,0);assert.equal(out.result.rentDueAt,due);
 const signed=await ui.read(),claim=signed.state.obligations[out.result.debt];
 assert.equal(claim.amount,49);assert.equal(claim.paid,0);assert.equal(claim.creditor,'loc_hw');
 assert.equal(signed.state.player.coins,before.state.player.coins);
 assert.equal(signed.state.settlements.loc_hw.treasury,before.state.settlements.loc_hw.treasury);
 assert.equal(signed.state.records[out.result.contract].clauses.rentDueAt,due);
 // Existing obligation settlement locates this public treasury at loc_hw.
 const counter=await ui.choose('move',{destination:'loc_hw'},{target:'loc_hw'});assert.equal(counter.ok,true,counter.error);
 const paid=await ui.choose('promise.settle',{obligation:out.result.debt},{search:true});assert.equal(paid.ok,true,paid.error);
 assert.equal(paid.result.transferred,49);
 const after=await ui.read();assert.equal(after.state.obligations[out.result.debt].paid,49);
 assert.equal(signed.state.player.coins-after.state.player.coins,49);
 assert.equal(after.state.settlements.loc_hw.treasury-signed.state.settlements.loc_hw.treasury,49);
 assert.equal(after.state.npcs.npc_hw_chenbai.coins,signed.state.npcs.npc_hw_chenbai.coins);
 // Actual acquired tools and seed prove a tenant may sow; this short lease
 // also proves uncollected crops change title when its real expiry arrives.
 let move=await ui.choose('move',{destination:'bld_hw_forge'},{target:'bld_hw_forge'});assert.equal(move.ok,true,move.error);
 for(const item of ['item_mining_pick','item_sickle']){const bought=await ui.choose('trade.buy',{item,quantity:1},{target:'npc_hw_duanyan'});assert.equal(bought.ok,true,bought.error);}
 move=await ui.choose('move',{destination:'bld_hw_council'},{target:'bld_hw_council'});assert.equal(move.ok,true,move.error);
 const seed=await ui.choose('farm.buy',{quantity:8},{search:true});assert.equal(seed.ok,true,seed.error);
 // The crop window starts at absolute day index5 (calendar day6).
 const spring=await ui.choose('time',{until:{dayOffset:4,hour:9}});assert.equal(spring.ok,true,spring.error);
 move=await ui.choose('move',{destination:'loc_hw_fields'},{target:'loc_hw_fields'});assert.equal(move.ok,true,move.error);
 const planted=await ui.choose('farm.private_sow',{areaMu:1,item:'item_oats'},{search:true});assert.equal(planted.ok,true,planted.error);
 // Native acreage accepts whole mu: 1/15 ha, with ceil(120/15)=8 seed.
 assert.equal(planted.result.farm.areaUnits,100/15);assert.equal(planted.result.farm.seed,8);
 assert.equal(planted.result.farm.owner,'player');assert.equal(planted.result.farm.lease,out.result.contract);
 const expiry=await ui.choose('time',{until:{dayOffset:8,hour:9}});assert.equal(expiry.ok,true,expiry.error);
 const expired=await ui.read();assert.equal(expired.state.records[planted.result.farm.id].owner,'loc_hw');
 assert.equal(expired.state.records[out.result.contract].status,'已到期');
 const denied=await ui.choose('farm.private_harvest',{}, {search:true});assert.equal(denied.ok,false);assert.match(denied.error,/本人合法持有/);
 assert.deepEqual(await ui.read(),expired,'expiry removes tenant use without taking any stock');
 const auditEngine=new (await import('../server-plugin/engine.mjs')).WorldEngine(await (await import('../tools/load-world.mjs')).loadWorld());
 balanced({e:auditEngine,doc:expired},before);
});
test('秋后交不免月租，到期不交沿现有违约规则立案',async t=>{
 const ui=await councilSession(t,'w8e8-rent-deferred-default'),before=await ui.read(),due=before.state.minute+35*DAY;
 const out=await ui.choose('trade.rent_in',{location:'loc_hw_fields',coins:210,days:40,deadline:due});
 assert.equal(out.ok,true,out.error);assert.equal(out.result.paid,0);
 const wait=await ui.choose('time',{minutes:31*DAY});assert.equal(wait.ok,true,wait.error);
 const accrued=await ui.read(),claims=Object.values(accrued.state.obligations).filter(o=>o.contract===out.result.contract);
 // First thirty days 210 plus final ten days ceil(210*10/30)=70.
 assert.deepEqual(claims.map(o=>o.amount).sort((a,b)=>a-b),[70,210]);
 assert.equal(accrued.state.player.coins,before.state.player.coins,'no early automatic debit');
 assert.equal(accrued.state.records[out.result.debt].defaulted,undefined,'agreed deferral is not an early default');
 for(const claim of claims)assert.equal(claim.deadline,accrued.state.records[out.result.debt].deadline,'all deferred monthly claims share the agreed due date and existing grace');
 const deadline=accrued.state.records[out.result.debt].deadline;
 const late=await ui.choose('time',{minutes:deadline-accrued.state.minute+1});assert.equal(late.ok,true,late.error);
 const after=await ui.read();assert.ok(after.state.records[out.result.debt].defaulted?.case);
 assert.equal(after.state.records[after.state.records[out.result.debt].defaulted.case].offense,'debt_default');
});
test('延期租约先付部分真实入公库，余款形成义务且不得超付',async t=>{
 const ui=await councilSession(t,'w8e8-rent-partial'),before=await ui.read(),due=before.state.minute+6*DAY;
 const excessive=await ui.choose('trade.rent_in',{location:'loc_hw_fields',days:7,deadline:due,deposit:34});
 assert.equal(excessive.ok,false);assert.deepEqual(await ui.read(),before);
 // ceil(140*7/30)=33; ten paid now, twenty-three owed at the agreed date.
 const out=await ui.choose('trade.rent_in',{location:'loc_hw_fields',days:7,deadline:due,deposit:10});
 assert.equal(out.ok,true,out.error);assert.equal(out.result.paid,10);
 const after=await ui.read(),claim=after.state.obligations[out.result.debt];
 assert.equal(before.state.player.coins-after.state.player.coins,10);
 assert.equal(after.state.settlements.loc_hw.treasury-before.state.settlements.loc_hw.treasury,10);
 assert.equal(after.state.npcs.npc_hw_chenbai.coins,before.state.npcs.npc_hw_chenbai.coins);
 assert.equal(claim.amount,23);assert.equal(claim.paid,0);assert.equal(claim.dueAt,due);
 assert.equal(after.state.records[out.result.contract].clauses.prepayment,10);
 const consent=after.state.consentEvents.find(c=>c.id===out.result.consent);
 assert.equal(consent.terms.prepayment,10);assert.equal(consent.terms.deadline,due);
 const auditEngine=new (await import('../server-plugin/engine.mjs')).WorldEngine(await (await import('../tools/load-world.mjs')).loadWorld());
 balanced({e:auditEngine,doc:after},before);
});

test('首领席位职权从数据列表读取，行政等级覆盖后仍保留',()=>{
 const f=fixture({at:'bld_hw_council'}),def=f.e.rules.governance.authority.offices.office_village_head;
 def.seatPowers=[...def.seatPowers,'test_seat_power'];
 f.doc.state.records['governance_office:seat-test']={category:'governance_office',office:'office_village_head',holder:'npc_hw_chenbai',settlement:'loc_hw',status:'在任',since:0};
 f.doc.state.records['settlement_rank:loc_hw']={category:'settlement_rank',level:'镇',since:0};
 assert.ok(personOffices(f.e,f.doc.state,'npc_hw_chenbai',{settlement:'loc_hw',power:'test_seat_power'}).length);
 assert.ok(settlementGovernment(f.e,f.doc.state,'loc_hw').powers.value.includes('test_seat_power'));
 delete def.seatPowers;
 assert.equal(personOffices(f.e,f.doc.state,'npc_hw_chenbai',{settlement:'loc_hw',power:'test_seat_power'}).length,0);
});

test('不足以覆盖条件的先付不能强制成交或超出报价扣全额',async()=>{
 const f=fixture({at:inn,coins:3000}),before=structuredClone(f.doc);
 await assert.rejects(f.act({operation:'rent_in',location:inn,days:30,deadline:f.doc.state.minute+20*DAY,deposit:1},'partial-insufficient'),/conditions.prepay=/);
 assert.deepEqual(f.doc,before,'even a rich purse cannot supply agreement to switch the partial offer into full cash');
});

test('集体田由首领职位现任者当面决定，租金只入聚落公库',async t=>{
 const ui=await characterUiSession(t,{seed:'w8e8-public-property'});
 const walk=await ui.choose('move',{destination:'loc_hw_fields'},{target:'loc_hw_fields'});assert.equal(walk.ok,true,walk.error);
 const absent=await ui.read(),refused=await ui.choose('trade.rent_in',{location:'loc_hw_fields',days:7});
 assert.equal(refused.ok,false);assert.match(refused.error,/不在场/);
 assert.deepEqual(await ui.read(),absent,'absent chief cannot consent or take payment');
 for(const [action,slots,target] of [['time',{until:{dayOffset:1,hour:9}},null],['move',{destination:'bld_hw_council'},'bld_hw_council']]){
  const out=await ui.choose(action,slots,{target});assert.equal(out.ok,true,out.error);
 }
 const before=await ui.read(),e=new (await import('../server-plugin/engine.mjs')).WorldEngine(await (await import('../tools/load-world.mjs')).loadWorld());
 const office=personOffices(e,before.state,'npc_hw_chenbai',{settlement:'loc_hw',power:'public_property'})[0];
 assert.ok(office,'05:129 and §5.7.3 grant the chief class authority, not a personal title');
 const out=await ui.choose('trade.rent_in',{location:'loc_hw_fields',days:7});assert.equal(out.ok,true,out.error);
 const after=await ui.read();
 assert.equal(out.result.owner,'loc_hw');assert.equal(out.result.signatory,'npc_hw_chenbai');
 assert.equal(out.result.rent,140);assert.equal(out.result.paid,33); // ceil(35*4*7/30).
 assert.equal(before.state.player.coins-after.state.player.coins,33);
 assert.equal(after.state.settlements.loc_hw.treasury-before.state.settlements.loc_hw.treasury,33);
 assert.equal(after.state.npcs.npc_hw_chenbai.coins,before.state.npcs.npc_hw_chenbai.coins);
 assert.equal(after.state.consentEvents.find(r=>r.id===out.result.consent).from,'npc_hw_chenbai');
 assert.deepEqual(conservation(e,before,after),[]);assert.deepEqual(reconcile(e,after).mismatches,[]);
 const wait=await ui.choose('time',{until:{dayOffset:8,hour:9}});assert.equal(wait.ok,true,wait.error);
 const back=await ui.choose('move',{destination:'loc_hw_fields'},{target:'loc_hw_fields'});assert.equal(back.ok,true,back.error);
 const expired=await ui.read();assert.equal(expired.state.records[out.result.contract].status,'已到期');
 const sow=await ui.choose('farm.private_sow',{areaMu:.6,item:'item_oats'},{search:true});
 assert.equal(sow.ok,false);assert.match(sow.error,/本人合法持有/);
 assert.deepEqual(await ui.read(),expired,'expiry restores refusal before tools, seeds or money can change');
});
function workshop(){
 const f=fixture({at:location});f.doc.state.buildings[location]={owner:'player',condition:100};
 // 15 logs × 2 kg = 30 kg, exactly the default safe load.
 f.doc.state.inventory={[item]:{quantity:15}};f.doc=withLedger(f.e,f.doc).document;return f;
}
async function storage(f,args,id){
 const {direction,...slots}=args;
 return f.act({action:'trade.workshop_stock',slots:{location,...slots,mode:direction}},id,'world_act');
}
function balanced(f,before){
 assert.deepEqual(conservation(f.e,before,f.doc),[]);
 const audit=reconcile(f.e,f.doc);assert.deepEqual(audit.mismatches,[]);assert.deepEqual(audit.audit,[]);
}
test('工坊存取保留财产与账本，搬回行囊前检查负重',async()=>{
 const f=workshop(),before=structuredClone(f.doc);
 assert.ok(worldActions(f.e,f.doc).actions.some(a=>a.id==='core:trade.workshop_stock'),'the player menu offers workshop stock');
 await storage(f,{direction:'deposit',item,quantity:10},'store');
 assert.equal(f.doc.state.inventory[item].quantity,5);
 assert.equal(premisesInventory(f.doc.state,'player',location)[item].quantity,10);
 assert.equal(f.doc.ledger.accounts[premisesStock(f.e,'player',location,item)],10);balanced(f,before);
 await storage(f,{direction:'withdraw',item,quantity:10},'retrieve');
 assert.equal(f.doc.state.inventory[item].quantity,15);balanced(f,before);
 await storage(f,{direction:'deposit',item,quantity:10},'store-again');
 // Stored goods and another held 15 logs would make 50 kg; refusal is atomic.
 const heavy=structuredClone(f.doc);heavy.state.inventory[item].quantity=15;
 const d=f.e.primitiveDraft(heavy);
 assert.throws(()=>workshopStorage(d,f.e,{direction:'withdraw',item,quantity:10},'too-heavy'),/拿不动/);
 assert.equal(d.patches.length,0);
});
test('无工坊使用权不能取货',async()=>{
 const f=workshop();await storage(f,{direction:'deposit',item,quantity:10},'store');
 f.doc.state.buildings[location].owner=worker;
 await assert.rejects(f.act({operation:'workshop_stock',mode:'withdraw',item,quantity:1},'no-title'),/合法持有/);
});
test('土地租金不随建筑完好度打折，建筑租金仍受完好度限制',async()=>{
 const f=workshop();f.doc.state.buildings[location].condition=30;
 const row={kind:'asset_lease',subject:location,use:'field',createdAt:0,deadline:DAY,monthlyRent:100,status:'有效'};
 // Field: 100 × 1; building at condition 30: 100 × .5.
 assert.equal(leaseState(f.e,f.doc.state,row).monthlyRent,100);
 assert.equal(leaseState(f.e,f.doc.state,{...row,use:'commercial'}).monthlyRent,50);
});
test('真实雇工班次从工坊扣料，产出留库且品质与单件来源可追溯',async()=>{
 const f=fixture({at:location});f.doc.state.buildings[location]={owner:'player',condition:100};
 f.doc.state.inventory={item_wood:{quantity:10},item_whittling_knife:{quantity:1,durability:80}};
 f.doc=withLedger(f.e,f.doc).document;const before=structuredClone(f.doc);
 await storage(f,{direction:'deposit',item,quantity:10},'materials');
 const job=await f.act({operation:'workshop',seller:worker,item:'recipe_wooden_pegs',coins:100,days:10,consent:true},'hire');
 const start=f.doc.state.records[job.contract],next=start.nextWork;
 await f.act({minutes:next-f.doc.state.minute},'shift','world_time');
 const row=f.doc.state.records[job.contract],shift=row.shifts[0],inventory=premisesInventory(f.doc.state,'player',location);
 // Ten actual logs cap the shift: 10 × 4 = 40 pegs. Wage remains ceil(100*m/480).
 assert.equal(shift.batches,10);assert.equal(inventory.item_wooden_peg.quantity,40);
 assert.equal(row.paid,Math.ceil(100*shift.minutes/480));assert.equal(f.doc.state.inventory.item_wooden_peg,undefined);
 for(const id of shift.instances){assert.equal(f.doc.state.itemInstances[id].maker,worker);assert.equal(f.doc.state.itemInstances[id].workmanship,shift.quality);assert.equal(f.doc.holdings.locations[id].at,location);}
 balanced(f,before);
 await storage(f,{direction:'withdraw',item:'item_wooden_peg',quantity:1},'take-product');
 const id=f.doc.state.inventory.item_wooden_peg.instances[0];
 assert.equal(f.doc.state.itemInstances[id].workmanship,shift.quality);assert.equal(f.doc.holdings.locations[id].at,'player');balanced(f,before);
});
test('租入菜单由真实持有人决定，付款与解约沿用资产租约',async()=>{
 const f=fixture({at:inn}),before=structuredClone(f.doc),cash=f.doc.state.npcs[host].coins;
 // Existing inn title belongs to Lin Sui; monthly rent 35 × 4 = 140.
 // A seven-day first period is ceil(140 × 7 / 30) = 33 copper.
 const lease=await f.act({action:'trade.rent_in',slots:{location:inn,days:7}},'rent-in','world_act');
 assert.equal(lease.owner,host);assert.equal(lease.rent,140);assert.equal(lease.paid,33);
 assert.equal(f.doc.state.npcs[host].coins,cash+33);
 assert.equal(before.state.player.coins-f.doc.state.player.coins,33);
 const consent=f.doc.state.consentEvents.find(r=>r.id===lease.consent);
 assert.equal(consent.from,host);assert.equal(consent.scope,'rent');
 assert.deepEqual(consent.terms,{amount:140,days:7,location:inn,prepayment:33});
 balanced(f,before);
 await assert.rejects(f.act({operation:'rent_in',location:inn,days:7},'duplicate'),/已有有效租约/);
 await f.act({operation:'dismiss',contract:lease.contract},'vacate');
 assert.equal(f.doc.state.records[lease.contract].status,'已终止');balanced(f,before);
});
test('租入不能替缺席持有人或拒绝报价的持有人代填同意',async()=>{
 const absent=fixture({at:inn});absent.doc.state.npcs[host].location=post;
 const before=structuredClone(absent.doc);
 await assert.rejects(absent.act({operation:'rent_in',location:inn,days:7,seller:worker,consent:true},'absent-owner'),/不在场/);
 assert.deepEqual(absent.doc,before);
 const cheap=fixture({at:inn}),opening=structuredClone(cheap.doc);
 // The offer is within the old .8–1.5 rent interval, but 112 < 140
 // opportunity cost. A caller's consent:true cannot supply the owner's answer.
 await assert.rejects(cheap.act({operation:'rent_in',location:inn,days:30,coins:112,consent:true},'under-offer'),/出租人未同意/);
 assert.deepEqual(cheap.doc,opening);
});
